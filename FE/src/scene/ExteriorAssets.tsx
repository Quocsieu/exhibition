import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useFrame } from '@react-three/fiber';
import { cloneCachedAsset, type GlbAssetId } from './assetLoader';
import { buildCentralPlazaFountainModel } from './architecturalModels';

// Imported artwork only. Bounds are visual envelopes, never navigation inputs.
const specs = {
  'env-tree-oak': { file: 'etFGNvsiFv', bounds: [3.8, 5.4, 3.8] },
  'env-tree-blossom': { file: 'R7qMWzb7nk', bounds: [3.4, 5.6, 3.4] },
  'env-tree-pine': { file: 'etFGNvsiFv-variant', bounds: [3.5, 5.2, 3.5] },
  'env-park-bench': { file: 'kn0sMwbspb', bounds: [1.35, .9, .62] },
  'env-street-lamp': { file: 'RO32ltX6zJ', bounds: [.9, 3.8, .9] },
  fountain: { file: '7b_tCaBRLCI', bounds: [3.3, 2.65, 3.3] },
  flowers: { file: 'NBUxHir6FJ', bounds: [.5, .12, .5] },
  'city-a': { file: 'ppwtREejXg', bounds: [1, 1, 1] },
  'city-b': { file: 'yKo7F36Qk2', bounds: [1, 1, 1] },
} satisfies Record<string, { file: string; bounds: number[] }>;
export type ExteriorAssetId = keyof typeof specs;
export interface ExteriorPlacement { position: [number, number, number]; rotation?: number; scale?: number | [number, number, number] }
interface Part { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }
interface Asset { parts: Part[]; lowParts?: Part[]; source: THREE.Group }
interface Entry { users: number; promise: Promise<Asset>; asset?: Asset; timer?: ReturnType<typeof setTimeout> }
const cache = new Map<ExteriorAssetId, Entry>();
const loader = new GLTFLoader();
const noRaycast = () => {};

function releaseAsset(asset: Asset) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  asset.source.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
  });
  asset.parts.forEach(p => geometries.add(p.geometry));
  asset.lowParts?.forEach(p => geometries.add(p.geometry));
  materials.forEach(m => {
    Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); });
    m.dispose();
  });
  textures.forEach(t => { t.dispose(); if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close(); });
  geometries.forEach(g => g.dispose());
}

async function loadAsset(id: ExteriorAssetId, low = false): Promise<Asset> {
  const spec = specs[id];
  const { scene } = await loader.loadAsync(`${import.meta.env.BASE_URL}models/exterior/${spec.file}${low ? '-lod' : ''}.glb`);
  // Artist's bench length runs along Z; existing plaza benches run along X.
  if (id === 'env-park-bench') scene.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !Number.isFinite(size.length()) || Math.min(size.x, size.y, size.z) <= 0) {
    releaseAsset({ source: scene, parts: [] });
    throw new Error(`Invalid exterior bounds: ${id}`);
  }
  const center = box.getCenter(new THREE.Vector3());
  const factor = Math.min(...spec.bounds.map((n, i) => n / size.getComponent(i)));
  const scale = id.startsWith('city-') ? new THREE.Vector3(1/size.x, 1/size.y, 1/size.z) : new THREE.Vector3(factor, factor, factor);
  const normalization = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  const parts: Part[] = [];
  scene.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry.clone().applyMatrix4(normalization.clone().multiply(obj.matrixWorld));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach(m => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return;
      if (id === 'fountain' && m.transparent) { m.depthWrite = false; m.roughness = .2; }
      if (id.startsWith('city-') && /window/i.test(m.name)) { m.roughness = .32; m.metalness = .15; }
      if (id === 'env-street-lamp') m.emissiveIntensity = .35;
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.anisotropy = 4;
    });
    parts.push({ geometry, material: obj.material });
  });
  scene.userData.exteriorSource = spec.file;
  const asset: Asset = { source: scene, parts };
  if (!low && (id.startsWith('env-tree') || id.startsWith('city-'))) {
    try {
      const lod = await loadAsset(id, true);
      asset.lowParts = lod.parts;
      scene.add(lod.source);
    } catch (error) {
      console.warn(`[exterior] ${id}: LOD unavailable; retaining full detail`, error);
    }
  }
  return asset;
}

function acquire(id: ExteriorAssetId): Entry {
  let entry = cache.get(id);
  if (!entry) {
    const created: Entry = { users: 0, promise: Promise.resolve(null as unknown as Asset) };
    created.promise = loadAsset(id).then(asset => { created.asset = asset; return asset; });
    entry = created;
    cache.set(id, entry);
  }
  clearTimeout(entry.timer);
  entry.users++;
  return entry;
}

function release(id: ExteriorAssetId, entry: Entry) {
  entry.users--;
  // Survives StrictMode's effect replay; final unmount releases even an in-flight load.
  entry.timer = setTimeout(() => {
    if (entry.users || cache.get(id) !== entry) return;
    cache.delete(id);
    void entry.promise.then(releaseAsset, () => {});
  }, 1000);
}

function AssetPart({ part, placements, shadows, level = 'all' }: { part: Part; placements: ExteriorPlacement[]; shadows: boolean; level?: 'all' | 'near' | 'far' }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const position = useMemo(() => new THREE.Vector3(), []);
  const culling = useMemo(() => ({ frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), previous: new THREE.Matrix4().makeScale(0, 0, 0), sphere: new THREE.Sphere() }), []);
  const matrices = useMemo(() => {
    const transform = new THREE.Object3D();
    return placements.map(p => {
      transform.position.fromArray(p.position);
      transform.rotation.set(0, p.rotation || 0, 0);
      if (Array.isArray(p.scale)) transform.scale.fromArray(p.scale);
      else transform.scale.setScalar(p.scale ?? 1);
      transform.updateMatrix();
      return transform.matrix.clone();
    });
  }, [placements]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    culling.previous.makeScale(0, 0, 0);
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return () => { mesh.dispose(); }; // Per-instance buffers; cached geometry/material stay alive.
  }, [matrices, culling, placements.length]);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    culling.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (culling.matrix.equals(culling.previous)) return;
    culling.previous.copy(culling.matrix);
    culling.frustum.setFromProjectionMatrix(culling.matrix);
    const mesh = ref.current;
    let count = 0;
    placements.forEach((p, i) => {
      const far = camera.position.distanceToSquared(position.fromArray(p.position)) > 42 * 42;
      culling.sphere.copy(part.geometry.boundingSphere!).applyMatrix4(matrices[i]);
      // A conservative margin retains nearby offscreen shadow casters.
      if (shadows) culling.sphere.radius += 4;
      if ((level === 'all' || far === (level === 'far')) && culling.frustum.intersectsSphere(culling.sphere)) mesh.setMatrixAt(count++, matrices[i]);
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]} castShadow={shadows} receiveShadow frustumCulled raycast={noRaycast} dispose={null} />;
}

function Fallback({ id, placements }: { id: ExteriorAssetId; placements: ExteriorPlacement[] }) {
  const objects = useMemo(() => placements.map(() => {
    if (id === 'fountain') return buildCentralPlazaFountainModel();
    if (id.startsWith('env-')) return cloneCachedAsset(id as GlbAssetId);
    const group = new THREE.Group();
    const geometry = id === 'flowers' ? new THREE.SphereGeometry(.16, 8, 6) : new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, id === 'flowers' ? .1 : .5, 0);
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: id === 'flowers' ? '#7f9962' : '#a6aaa8', roughness: .9 })));
    return group;
  }), [id, placements]);
  useEffect(() => () => {
    if (!id.startsWith('env-')) objects.forEach(source => { if (source) releaseAsset({ source, parts: [] }); });
  }, [id, objects]);
  return <group dispose={null}>{objects.map((object, i) => object && <primitive key={i} object={object} position={placements[i].position} rotation={[0, placements[i].rotation || 0, 0]} scale={placements[i].scale ?? 1} />)}</group>;
}

export function ExteriorAssets({ id, placements, shadows = true }: { id: ExteriorAssetId; placements: ExteriorPlacement[]; shadows?: boolean }) {
  const [result, setResult] = useState<{ id: ExteriorAssetId; asset?: Asset; error?: boolean }>();
  const water = useMemo(() => id === 'fountain' ? result?.asset?.parts.flatMap(p => Array.isArray(p.material) ? p.material : [p.material]).filter(m => m.transparent).map(material => ({ material, opacity: material.opacity })) ?? [] : [], [id, result]);
  useFrame(({ clock }) => {
    for (const entry of water) entry.material.opacity = entry.opacity * (.96 + .04 * Math.sin(clock.elapsedTime * 1.8));
  });
  useEffect(() => {
    let active = true;
    const entry = acquire(id);
    entry.promise.then(asset => { if (active) setResult({ id, asset }); }, error => {
      console.warn(`[exterior] ${id}: GLB unavailable; using emergency fallback`, error);
      if (active) setResult({ id, error: true });
    });
    return () => { active = false; release(id, entry); };
  }, [id]);
  if (result?.id !== id) return null;
  if (result.error) return <Fallback id={id} placements={placements} />;
  return <group name={`exterior-glb:${id}`} dispose={null}>
    {result.asset?.parts.map((part, i) => <AssetPart key={`near-${i}`} part={part} placements={placements} shadows={shadows} level={result.asset?.lowParts ? 'near' : 'all'} />)}
    {result.asset?.lowParts?.map((part, i) => <AssetPart key={`far-${i}`} part={part} placements={placements} shadows={false} level="far" />)}
  </group>;
}
