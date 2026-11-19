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

export type KinetixBoothVersion = 'v2' | 'v3';
export type BoothModelVersion = 'v2' | 'v3';

export const DEFAULT_KINETIX_BOOTH_VERSION: KinetixBoothVersion = 'v3';

export const DEFAULT_BOOTH_MODEL_VERSIONS: Record<ArchitecturalBoothTheme, BoothModelVersion> = {
  robotics: DEFAULT_KINETIX_BOOTH_VERSION,
  tech: 'v3',
  coffee: 'v3',
  design: 'v3',
  living: 'v3',
  energy: 'v3',
};

export const KINETIX_GLB_BY_VERSION: Record<KinetixBoothVersion, string> = {
  v2: 'models/booths/kinetix-v2/kinetix_booth_v2.glb',
  v3: 'models/booths/kinetix-v3/kinetix_booth_v3.glb',
};

export const BESPOKE_V2_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  robotics: KINETIX_GLB_BY_VERSION.v2,
  tech: 'models/booths/v2/aether_tech_v2.glb',
  living: 'models/booths/v2/nordic_living_v2.glb',
  coffee: 'models/booths/v2/ecovita_coffee_v2.glb',
  design: 'models/booths/v2/lumina_design_v2.glb',
  energy: 'models/booths/v2/solaris_energy_v2.glb',
};

export const BESPOKE_V3_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  robotics: KINETIX_GLB_BY_VERSION.v3,
  tech: 'models/booths/aether-tech-v3/aether_tech_v3.glb',
  living: 'models/booths/nordic-living-v3/nordic_living_v3.glb',
  coffee: 'models/booths/ecovita-coffee-v3/ecovita_coffee_v3.glb',
  design: 'models/booths/lumina-design-v3/lumina_design_v3.glb',
  energy: 'models/booths/solaris-energy-v3/solaris_energy_v3.glb',
};

const BOOTH_QUERY_KEY_BY_THEME: Record<ArchitecturalBoothTheme, string> = {
  robotics: 'kinetix',
  tech: 'aether',
  coffee: 'ecovita',
  design: 'lumina',
  living: 'nordic',
  energy: 'solaris',
};

/**
 * Minimal, zero-overhead version selector for Kinetix Robotics booth:
 * - Defaults to `'v3'` (`kinetix_booth_v3.glb`).
 * - Supports instant rollback via `?kinetix=v2` URL query or `VITE_KINETIX_BOOTH_VERSION=v2`.
 */
export function resolveKinetixBoothVersion(options?: {
  search?: string;
  envValue?: string;
}): KinetixBoothVersion {
  const rawSearch =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (rawSearch) {
    const param = new URLSearchParams(rawSearch).get('kinetix')?.trim().toLowerCase();
    if (param === 'v2' || param === 'v3') {
      return param;
    }
  }
  const rawEnv = (
    options?.envValue ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_KINETIX_BOOTH_VERSION || '')
  )
    .trim()
    .toLowerCase();
  if (rawEnv === 'v2' || rawEnv === 'v3') {
    return rawEnv;
  }
  return DEFAULT_KINETIX_BOOTH_VERSION;
}

/**
 * Resolves the active GLB version (`'v2'` or `'v3'`) for any exhibition booth theme.
 * Supports per-booth query rollback (`?aether=v2`, `?ecovita=v2`, `?lumina=v2`, `?nordic=v2`, `?solaris=v2`),
 * global rollback (`?booths=v2` or `VITE_BOOTHS_VERSION=v2`), while keeping Kinetix V3 independent.
 */
export function resolveBoothModelVersion(
  theme: ArchitecturalBoothTheme,
  options?: { search?: string; envValue?: string }
): BoothModelVersion {
  if (theme === 'robotics') {
    return resolveKinetixBoothVersion(options);
  }
  const rawSearch =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (rawSearch) {
    const params = new URLSearchParams(rawSearch);
    const perBooth = params.get(BOOTH_QUERY_KEY_BY_THEME[theme])?.trim().toLowerCase();
    if (perBooth === 'v2' || perBooth === 'v3') {
      return perBooth;
    }
    const globalParam = params.get('booths')?.trim().toLowerCase();
    if (globalParam === 'v2' || globalParam === 'v3') {
      return globalParam;
    }
  }
  const rawEnv = (
    options?.envValue ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_BOOTHS_VERSION || '')
  )
    .trim()
    .toLowerCase();
  if (rawEnv === 'v2' || rawEnv === 'v3') {
    return rawEnv;
  }
  return DEFAULT_BOOTH_MODEL_VERSIONS[theme];
}

export function resolveBespokeBoothGlbSubpath(
  theme: ArchitecturalBoothTheme,
  versionOverride?: BoothModelVersion
): string {
  const ver = versionOverride ?? resolveBoothModelVersion(theme);
  return ver === 'v3' ? BESPOKE_V3_GLB_MAP[theme] : BESPOKE_V2_GLB_MAP[theme];
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
