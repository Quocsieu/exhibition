import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  type ArchitecturalBoothTheme,
  buildBoothExteriorShell,
  buildOakTreeModel,
  buildPineTreeModel,
  buildStreetLampModel,
  buildParkBenchModel,
  buildPlanterUrnModel,
} from './architecturalModels';

export type GlbAssetId =
  | 'booth-tech'
  | 'booth-living'
  | 'booth-coffee'
  | 'booth-robotics'
  | 'booth-design'
  | 'booth-energy'
  | 'env-tree-oak'
  | 'env-tree-blossom'
  | 'env-tree-pine'
  | 'env-street-lamp'
  | 'env-park-bench'
  | 'env-planter-urn';

export const GLB_ASSET_PATHS: Record<GlbAssetId, string> = {
  'booth-tech': '/models/booth-tech.glb',
  'booth-living': '/models/booth-living.glb',
  'booth-coffee': '/models/booth-coffee.glb',
  'booth-robotics': '/models/booth-robotics.glb',
  'booth-design': '/models/booth-design.glb',
  'booth-energy': '/models/booth-energy.glb',
  'env-tree-oak': '/models/env-tree-oak.glb',
  'env-tree-blossom': '/models/env-tree-blossom.glb',
  'env-tree-pine': '/models/env-tree-pine.glb',
  'env-street-lamp': '/models/env-street-lamp.glb',
  'env-park-bench': '/models/env-park-bench.glb',
  'env-planter-urn': '/models/env-planter-urn.glb',
};

const templateCache = new Map<GlbAssetId, THREE.Group>();
let gltfLoaderInstance: GLTFLoader | null = null;

function buildAssetTemplate(assetId: GlbAssetId): THREE.Group {
  switch (assetId) {
    case 'booth-tech':
      return buildBoothExteriorShell('tech');
    case 'booth-living':
      return buildBoothExteriorShell('living');
    case 'booth-coffee':
      return buildBoothExteriorShell('coffee');
    case 'booth-robotics':
      return buildBoothExteriorShell('robotics');
    case 'booth-design':
      return buildBoothExteriorShell('design');
    case 'booth-energy':
      return buildBoothExteriorShell('energy');
    case 'env-tree-oak':
      return buildOakTreeModel('emerald');
    case 'env-tree-blossom':
      return buildOakTreeModel('blossom');
    case 'env-tree-pine':
      return buildPineTreeModel();
    case 'env-street-lamp':
      return buildStreetLampModel();
    case 'env-park-bench':
      return buildParkBenchModel();
    case 'env-planter-urn':
      return buildPlanterUrnModel();
  }
}

/**
 * Retrieves or initializes the master cached 3D asset template.
 * All clones share the master template's GPU BufferGeometries and Materials.
 */
export function getCachedAssetTemplate(assetId: GlbAssetId): THREE.Group {
  let cached = templateCache.get(assetId);
  if (!cached) {
    cached = buildAssetTemplate(assetId);
    templateCache.set(assetId, cached);
  }
  return cached;
}

/**
 * Maps a booth theme (`tech`, `living`, `coffee`, `robotics`, `design`, `energy`)
 * to its corresponding GLB asset identifier.
 */
export function getBoothGlbAssetId(theme: ArchitecturalBoothTheme): GlbAssetId {
  return `booth-${theme}`;
}

/**
 * Creates a lightweight scene-graph clone of a cached 3D asset while sharing
 * 100% of the underlying BufferGeometry and Material instances on the GPU.
 */
export function cloneCachedAsset(assetId: GlbAssetId): THREE.Group {
  const master = getCachedAssetTemplate(assetId);
  return master.clone(true);
}

/**
 * Asynchronously loads a binary `.glb` asset via Three.js `GLTFLoader` when running
 * in a browser context, caching the result in `templateCache`.
 */
export async function loadGlbAssetFromUrl(assetId: GlbAssetId): Promise<THREE.Group> {
  const existing = templateCache.get(assetId);
  if (existing) return existing;

  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    try {
      if (!gltfLoaderInstance) {
        gltfLoaderInstance = new GLTFLoader();
      }
      const gltf = await gltfLoaderInstance.loadAsync(GLB_ASSET_PATHS[assetId]);
      const group = gltf.scene || new THREE.Group();
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      templateCache.set(assetId, group);
      return group;
    } catch {
      // Fallback to deterministic compiled CAD template if static server is offline
    }
  }

  return getCachedAssetTemplate(assetId);
}

/**
 * Computes real geometry, material, and triangle telemetry across cached 3D assets.
 */
export function getCachedAssetStats(): {
  cachedAssetCount: number;
  uniqueGeometries: number;
  uniqueMaterials: number;
  totalTriangles: number;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let totalTriangles = 0;

  for (const group of templateCache.values()) {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && !geometries.has(mesh.geometry)) {
          geometries.add(mesh.geometry);
          const pos = mesh.geometry.attributes.position;
          if (pos) {
            totalTriangles += mesh.geometry.index
              ? Math.floor(mesh.geometry.index.count / 3)
              : Math.floor(pos.count / 3);
          }
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => materials.add(m));
        } else if (mesh.material) {
          materials.add(mesh.material);
        }
      }
    });
  }

  return {
    cachedAssetCount: templateCache.size,
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size,
    totalTriangles,
  };
}

/**
 * Deterministically disposes all cached geometries and materials in the asset pipeline.
 */
export function disposeCachedAssets(): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  for (const group of templateCache.values()) {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => materials.add(m));
        } else if (mesh.material) {
          materials.add(mesh.material);
        }
      }
    });
  }

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  templateCache.clear();
}
