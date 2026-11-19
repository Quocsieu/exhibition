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

export type KinetixBoothVersion = 'v2' | 'v3' | 'v4' | 'v27_3' | 'v27_4';
export type BoothModelVersion = 'v2' | 'v3' | 'v4' | 'v27_3' | 'v27_4';

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
  v4: 'models/booths/v4/booth_06_dynamic_frame_v4.glb',
  v27_3: 'models/booths/v27_3/booth_06_dynamic_frame_v27_3.glb',
  v27_4: 'models/booths/v27_4/booth_06_dynamic_frame_v27_4.glb',
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

export const BESPOKE_V4_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  living: 'models/booths/v4/booth_01_signature_ring_v4.glb',
  design: 'models/booths/v4/booth_02_organic_flow_v4.glb',
  tech: 'models/booths/v4/booth_03_grand_portal_v4.glb',
  energy: 'models/booths/v4/booth_04_wave_pavilion_v4.glb',
  coffee: 'models/booths/v4/booth_05_gallery_arch_v4.glb',
  robotics: KINETIX_GLB_BY_VERSION.v4,
};

export const BESPOKE_V27_3_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  living: 'models/booths/v27_3/booth_01_signature_ring_v27_3.glb',
  design: 'models/booths/v27_3/booth_02_organic_flow_v27_3.glb',
  tech: 'models/booths/v27_3/booth_03_grand_portal_v27_3.glb',
  energy: 'models/booths/v27_3/booth_04_wave_pavilion_v27_3.glb',
  coffee: 'models/booths/v27_3/booth_05_gallery_arch_v27_3.glb',
  robotics: KINETIX_GLB_BY_VERSION.v27_3,
};

export const BESPOKE_V27_4_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  living: 'models/booths/v27_4/booth_01_signature_ring_v27_4.glb',
  design: 'models/booths/v27_4/booth_02_organic_flow_v27_4.glb',
  tech: 'models/booths/v27_4/booth_03_grand_portal_v27_4.glb',
  energy: 'models/booths/v27_4/booth_04_wave_pavilion_v27_4.glb',
  coffee: 'models/booths/v27_4/booth_05_gallery_arch_v27_4.glb',
  robotics: KINETIX_GLB_BY_VERSION.v27_4,
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
  worldVersion?: 'v26' | 'v27_0' | 'v27';
}): KinetixBoothVersion {
  const rawSearch =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (rawSearch) {
    const params = new URLSearchParams(rawSearch);
    const param = params.get('kinetix')?.trim().toLowerCase();
    if (param === 'v2' || param === 'v3' || param === 'v4' || param === 'v27_3' || param === 'v27_4') {
      return param;
    }
    const globalParam = params.get('booths')?.trim().toLowerCase();
    if (globalParam === 'v2' || globalParam === 'v3' || globalParam === 'v4' || globalParam === 'v27_3' || globalParam === 'v27_4') {
      return globalParam;
    }
  }
  const rawEnv = (
    options?.envValue ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_KINETIX_BOOTH_VERSION || '')
  )
    .trim()
    .toLowerCase();
  if (rawEnv === 'v2' || rawEnv === 'v3' || rawEnv === 'v4' || rawEnv === 'v27_3' || rawEnv === 'v27_4') {
    return rawEnv;
  }
  if (options?.worldVersion === 'v27') {
    return 'v27_4';
  }
  if (options?.worldVersion === 'v27_0') {
    return 'v4';
  }
  return DEFAULT_KINETIX_BOOTH_VERSION;
}

export function resolveBoothModelVersion(
  theme: ArchitecturalBoothTheme,
  options?: { search?: string; envValue?: string; worldVersion?: 'v26' | 'v27_0' | 'v27' }
): BoothModelVersion {
  if (theme === 'robotics') {
    return resolveKinetixBoothVersion(options);
  }
  const rawSearch =
    options?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (rawSearch) {
    const params = new URLSearchParams(rawSearch);
    const perBooth = params.get(BOOTH_QUERY_KEY_BY_THEME[theme])?.trim().toLowerCase();
    if (perBooth === 'v2' || perBooth === 'v3' || perBooth === 'v4' || perBooth === 'v27_3' || perBooth === 'v27_4') {
      return perBooth;
    }
    const globalParam = params.get('booths')?.trim().toLowerCase();
    if (globalParam === 'v2' || globalParam === 'v3' || globalParam === 'v4' || globalParam === 'v27_3' || globalParam === 'v27_4') {
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
  if (rawEnv === 'v2' || rawEnv === 'v3' || rawEnv === 'v4' || rawEnv === 'v27_3' || rawEnv === 'v27_4') {
    return rawEnv;
  }
  if (options?.worldVersion === 'v27') {
    return 'v27_4';
  }
  if (options?.worldVersion === 'v27_0') {
    return 'v4';
  }
  return DEFAULT_BOOTH_MODEL_VERSIONS[theme];
}

export function resolveBespokeBoothGlbSubpath(
  theme: ArchitecturalBoothTheme,
  versionOverride?: BoothModelVersion
): string {
  const ver = versionOverride ?? resolveBoothModelVersion(theme);
  if (ver === 'v27_4') return BESPOKE_V27_4_GLB_MAP[theme];
  if (ver === 'v27_3') return BESPOKE_V27_3_GLB_MAP[theme];
  if (ver === 'v4') return BESPOKE_V4_GLB_MAP[theme];
  if (ver === 'v3') return BESPOKE_V3_GLB_MAP[theme];
  return BESPOKE_V2_GLB_MAP[theme];
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
