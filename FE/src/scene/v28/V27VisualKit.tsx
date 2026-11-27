import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createGrandExpoMedallionTexture } from '../sceneTextures';
import type { V28ClusterSpec, V28ExhibitionVersionDetail } from '../../services/v28Api';
import { computeDynamicEnvPlacements } from './v28EnvPlacement';

const plazaDracoLoader = new DRACOLoader();
plazaDracoLoader.setDecoderPath(
  typeof window !== 'undefined' ? `${window.location.origin}/draco/` : '/draco/'
);
const plazaLoader = new GLTFLoader();
plazaLoader.setDRACOLoader(plazaDracoLoader);
const plazaProtoPromises = new Map<string, Promise<THREE.Group>>();
const plazaProtoResolved = new Map<string, THREE.Group>();

/**
 * Read-only shared GLB prototype loader for V27.4 / V27.5 Plaza Heritage Assets.
 * NEVER modifies or disposes shared V27.5 prototypes when a cluster unmounts.
 */
function loadV27PlazaPrototype(url: string): Promise<THREE.Group> {
  const existing = plazaProtoPromises.get(url);
  if (existing) return existing;
  const p = new Promise<THREE.Group>((resolve, reject) => {
    plazaLoader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = true;
          }
        });
        plazaProtoResolved.set(url, root);
        resolve(root);
      },
      undefined,
      (err) => {
        plazaProtoPromises.delete(url);
        reject(err);
      }
    );
  });
  plazaProtoPromises.set(url, p);
  return p;
}

const plazaProtoNormalized = new Map<string, THREE.Group>();

function getNormalizedPlazaClone(url: string, proto: THREE.Group, targetHeight?: number): THREE.Group {
  if (!targetHeight) {
    return proto.clone(true);
  }
  const cacheKey = `${url}|${targetHeight.toFixed(3)}`;
  let normalizedProto = plazaProtoNormalized.get(cacheKey);
  if (!normalizedProto) {
    const wrapper = new THREE.Group();
    const cloned = proto.clone(true);
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const h = Math.max(0.05, size.y);
    const scale = THREE.MathUtils.clamp(targetHeight / h, 0.05, 10.0);
    cloned.scale.setScalar(scale);
    cloned.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    wrapper.add(cloned);
    plazaProtoNormalized.set(cacheKey, wrapper);
    normalizedProto = wrapper;
  }
  return normalizedProto.clone(true);
}

const V27PlazaGlb: React.FC<{
  url: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  targetHeight?: number;
}> = React.memo(({ url, position = [0, 0, 0], rotation = [0, 0, 0], targetHeight }) => {
  const [group, setGroup] = useState<THREE.Group | null>(() => {
    const cached = plazaProtoResolved.get(url);
    return cached ? getNormalizedPlazaClone(url, cached, targetHeight) : null;
  });

  useEffect(() => {
    let cancelled = false;
    const cached = plazaProtoResolved.get(url);
    if (cached) {
      setGroup(getNormalizedPlazaClone(url, cached, targetHeight));
      return;
    }
    loadV27PlazaPrototype(url)
      .then((proto) => {
        if (!cancelled) setGroup(getNormalizedPlazaClone(url, proto, targetHeight));
      })
      .catch((err) => {
        console.warn(`[V28 Env] Failed to load GLB ${url}:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [url, targetHeight]);

  if (!group) return null;
  return <primitive object={group} position={position} rotation={rotation} dispose={null} />;
});

/**
 * Exact V27.5 Satin Architectural Terrazzo Floor Texture (from GrandExpoHall.tsx palette).
 */
export function useV27TerrazzoFloorTexture(hallWidth: number, hallDepth: number): THREE.CanvasTexture {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e4e8ee';
      ctx.fillRect(0, 0, 512, 512);
      const tones = ['#e6eaf0', '#e0e5ec', '#e2e7ee', '#e7ebf1'];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = tones[r * 2 + c];
          ctx.fillRect(c * 256 + 2, r * 256 + 2, 252, 252);
        }
      }
      for (let i = 0; i < 380; i++) {
        const fx = ((i * 197 + 31) % 508) + 2;
        const fy = ((i * 313 + 67) % 508) + 2;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(fx, fy, 2, 2);
      }
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.30)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 256);
      ctx.lineTo(512, 256);
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(8, Math.round(hallWidth / 6)), Math.max(8, Math.round(hallDepth / 6)));
    t.anisotropy = 4;
    return t;
  }, [hallWidth, hallDepth]);

  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const CHAMPAGNE_MAT = new THREE.MeshStandardMaterial({
  color: '#d6be96',
  roughness: 0.28,
  metalness: 0.78,
});

const COURTYARD_PAD_MAT = new THREE.MeshStandardMaterial({
  color: '#dce2ea',
  roughness: 0.56,
  metalness: 0.06,
});

const AVENUE_STRIP_MAT = new THREE.MeshStandardMaterial({
  color: '#d7e2ee',
  roughness: 0.55,
  metalness: 0.08,
});

export interface V27VisualKitLayerProps {
  world: V28ExhibitionVersionDetail;
  playerX: number;
  playerZ: number;
  isOverview: boolean;
  onOpenDirectoryMap?: () => void;
}

/**
 * Full V27.5 Environment Heritage Layer for V28:
 * - Main Welcome Plaza (Welcome Desk, Clickable Directory Monument, Mini Café, Rest Lounge, Planter Islands)
 * - North Focal Check-In Photo Stage
 * - Streamed U-Shaped Courtyard Plazas with Medallion & Deterministic V27.5 Centerpiece Variations
 */
export const V27VisualKitLayer: React.FC<V27VisualKitLayerProps> = React.memo(
  ({ world, playerX, playerZ, isOverview, onOpenDirectoryMap }) => {
    const medallionTex = useMemo(() => createGrandExpoMedallionTexture(), []);
    useEffect(() => () => medallionTex.dispose(), [medallionTex]);

    const welcomeZ = (world.welcomeAreaBounds.minZ + world.welcomeAreaBounds.maxZ) / 2;
    const clusters: V28ClusterSpec[] = world.clusters || [];
    const avenueW = world.centralAvenueBounds.maxX - world.centralAvenueBounds.minX;
    const entryLen = world.centralAvenueBounds.maxZ - world.centralAvenueBounds.minZ;
    const entryCenterZ = (world.centralAvenueBounds.minZ + world.centralAvenueBounds.maxZ) / 2;
    const wingPropX = Math.min(18.5, Math.max(12.5, world.hallWidth / 2 - 5.2));
    const isSixBoothParity = clusters.length === 1 && world.booths.length === 6;

    const envPlacements = useMemo(() => computeDynamicEnvPlacements(world), [world]);

    // Quantize streaming anchor to 6m buckets so walking does not churn React reconciliation every frame
    const qX = Math.round(playerX / 6) * 6;
    const qZ = Math.round(playerZ / 6) * 6;

    const northStageZ = world.hallBounds.minZ + 4.0;
    const mountNorthStage = isOverview || Math.hypot(qX, northStageZ - qZ) <= 105;

    const visibleEnvPlacements = useMemo(() => {
      const maxDist = isOverview ? 95 : 78;
      return envPlacements.filter(
        (item) => Math.hypot(item.position[0] - qX, item.position[2] - qZ) <= maxDist
      );
    }, [envPlacements, qX, qZ, isOverview]);

    return (
      <group name="V27VisualKitHeritageLayer">
        {/* North-South Central Main Avenue Spine matching world.centralAvenueBounds */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, entryCenterZ]} receiveShadow material={AVENUE_STRIP_MAT}>
          <planeGeometry args={[avenueW - 0.6, entryLen]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-avenueW / 2 + 0.35, 0.021, entryCenterZ]} material={CHAMPAGNE_MAT}>
          <planeGeometry args={[0.26, entryLen]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[avenueW / 2 - 0.35, 0.021, entryCenterZ]} material={CHAMPAGNE_MAT}>
          <planeGeometry args={[0.26, entryLen]} />
        </mesh>

        {/* Main Entrance Plaza Heritage GLBs (South Welcome Area) */}
        <group position={[0, 0, welcomeZ]}>
          <V27PlazaGlb url="/models/plaza/v27_4/welcome_desk_v27_4.glb" position={[-9.6, 0, 0.3]} />
          {/* Clickable V27.5 Directory Monument -> opens Interactive 2D Exhibition Map */}
          <group
            position={[9.6, 0, 0.3]}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDirectoryMap?.();
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'auto';
            }}
          >
            <V27PlazaGlb url="/models/plaza/v27_4/directory_monument_v27_4.glb" />
          </group>
          <V27PlazaGlb url="/models/plaza/v27_4/mini_cafe_corner_v27_4.glb" position={[-wingPropX, 0, -0.4]} />
          <V27PlazaGlb url="/models/plaza/v27_4/rest_lounge_v27_4.glb" position={[wingPropX, 0, -0.4]} />
          {!isSixBoothParity && (
            <>
              {/* Phase 5: Realistic tree & lush planter replacing geometric sphere placeholder */}
              <V27PlazaGlb
                url="/models/env/tree-gian.glb"
                position={[-9.2, 0, -4.6]}
                targetHeight={3.65}
              />
              <V27PlazaGlb
                url="/models/env/planter-near-ch.glb"
                position={[-7.8, 0, -3.4]}
                targetHeight={1.25}
              />
              <V27PlazaGlb
                url="/models/env/tree-gian.glb"
                position={[9.2, 0, -4.6]}
                rotation={[0, Math.PI, 0]}
                targetHeight={3.65}
              />
              <V27PlazaGlb
                url="/models/env/planter-near-ch.glb"
                position={[7.8, 0, -3.4]}
                rotation={[0, Math.PI, 0]}
                targetHeight={1.25}
              />
            </>
          )}
        </group>

        {/* North Focal Check-In Photo Stage (progressively streamed as visitor approaches north hall) */}
        {mountNorthStage && (
          <V27PlazaGlb
            url="/models/plaza/v27_4/checkin_stage_v27_4.glb"
            position={[0, 0, northStageZ]}
          />
        )}

        {/* 6-Booth U-Shaped Cluster Courtyard Plazas + Streamed V27.5 Centerpiece Variations */}
        {clusters.map((c) => {
          const dist = Math.hypot(c.centerX - qX, c.centerZ - qZ);
          // Stream heavy V27.5 plaza GLB centerpieces for nearby clusters (<= 72m, or nearest 6 in Overview)
          const mountCenterpieceGlb = isOverview ? c.clusterIndex < 6 : dist <= 72;
          return (
            <group key={c.clusterId} position={[c.centerX, 0, c.centerZ]}>
              {/* Architectural Courtyard Pad + Champagne Perimeter Inlay */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow material={COURTYARD_PAD_MAT}>
                <planeGeometry args={[c.width - 1.5, c.depth - 1.5]} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
                <circleGeometry args={[5.4, 32]} />
                <meshBasicMaterial map={medallionTex} transparent opacity={0.85} />
              </mesh>

              {/* Deterministic V27.5 Heritage Centerpiece Variation (clear of all 6 booth approach & focus paths!) */}
              {mountCenterpieceGlb && c.centerpieceKind === 'medallion_oasis' && (
                <>
                  <V27PlazaGlb url="/models/env/tree-gian.glb" position={[-6.8, 0, 1.2]} targetHeight={3.25} />
                  <V27PlazaGlb
                    url="/models/env/tree-gian.glb"
                    position={[6.8, 0, 1.2]}
                    rotation={[0, Math.PI, 0]}
                    targetHeight={3.25}
                  />
                </>
              )}
              {mountCenterpieceGlb && c.centerpieceKind === 'landscape_lounge' && (
                <V27PlazaGlb
                  url="/models/plaza/v27_5/landscape_lounge_v27_5.glb"
                  position={[0, 0, 1.4]}
                  rotation={[0, (c.variationSeed % 4) * (Math.PI / 2), 0]}
                />
              )}
              {mountCenterpieceGlb && c.centerpieceKind === 'interactive_corner' && (
                <V27PlazaGlb
                  url="/models/plaza/v27_5/interactive_expo_corner_v27_5.glb"
                  position={[0, 0, 1.4]}
                  rotation={[0, ((c.variationSeed % 2) === 0 ? 0 : Math.PI), 0]}
                />
              )}
              {mountCenterpieceGlb && c.centerpieceKind === 'cafe_rest' && (
                <>
                  <V27PlazaGlb url="/models/plaza/v27_4/digital_totem_v27_4.glb" position={[-5.8, 0, 1.2]} rotation={[0, 0.35, 0]} />
                  <V27PlazaGlb url="/models/plaza/v27_4/digital_totem_v27_4.glb" position={[5.8, 0, 1.2]} rotation={[0, -0.35, 0]} />
                </>
              )}
            </group>
          );
        })}

        {/* Phase 4 + B.4: Distance-Streamed Landscaping & Street Furniture from /models/env/ */}
        <group name="V28DynamicEnvPropsLayer">
          {visibleEnvPlacements.map((item) => (
            <V27PlazaGlb
              key={item.id}
              url={item.url}
              position={item.position}
              rotation={[0, item.rotationY, 0]}
              targetHeight={item.targetHeight}
            />
          ))}
        </group>
      </group>
    );
  }
);
