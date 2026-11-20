import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { V28ArchetypeId } from '../../services/v28Api';

const ARCHETYPE_GLB_PATHS: Record<V28ArchetypeId, string> = {
  signature_ring: '/models/booths/v27_4/booth_01_signature_ring_v27_4.glb',
  organic_flow: '/models/booths/v27_4/booth_02_organic_flow_v27_4.glb',
  grand_portal: '/models/booths/v27_4/booth_03_grand_portal_v27_4.glb',
  wave_pavilion: '/models/booths/v27_4/booth_04_wave_pavilion_v27_4.glb',
  gallery_arch: '/models/booths/v27_4/booth_05_gallery_arch_v27_4.glb',
  dynamic_frame: '/models/booths/v27_4/booth_06_dynamic_frame_v27_4.glb',
};

const loader = new GLTFLoader();
const prototypeCache = new Map<V28ArchetypeId, Promise<THREE.Group>>();
const resolvedPrototypes = new Map<V28ArchetypeId, THREE.Group>();

/**
 * Load & cache a V27.4 booth archetype GLB once.
 * All booth instances clone the scene graph while SHARING GPU geometries & materials.
 * NEVER dispose shared prototype geometries/materials when an individual booth unmounts.
 */
export function loadV28ArchetypePrototype(archetypeId: V28ArchetypeId): Promise<THREE.Group> {
  const existing = prototypeCache.get(archetypeId);
  if (existing) return existing;

  const url = ARCHETYPE_GLB_PATHS[archetypeId] || ARCHETYPE_GLB_PATHS.grand_portal;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        // Normalize bottom to y = 0 without distorting proportions
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        if (Number.isFinite(box.min.y)) {
          root.position.y -= box.min.y;
        }
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.__v28SharedAsset = true;
          }
        });
        resolvedPrototypes.set(archetypeId, root);
        resolve(root);
      },
      undefined,
      (err) => {
        prototypeCache.delete(archetypeId);
        reject(err);
      }
    );
  });

  prototypeCache.set(archetypeId, promise);
  return promise;
}

export function getCachedArchetypePrototype(archetypeId: V28ArchetypeId): THREE.Group | null {
  return resolvedPrototypes.get(archetypeId) || null;
}

export function cloneArchetypeShared(prototype: THREE.Group): THREE.Group {
  // THREE.Object3D.clone(true) clones the scene hierarchy while keeping geometry & material references shared!
  const cloned = prototype.clone(true);
  return cloned;
}

// ============================================================================
// REFERENCE-COUNTED TEXTURE CACHE WITH MEMORY BUDGET (Phase 2 + Phase 3 Ready)
// ============================================================================
interface CachedTextureEntry {
  texture: THREE.Texture;
  refCount: number;
  lastUsedAt: number;
  estimatedBytes: number;
}

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const MAX_TEXTURE_CACHE_BYTES = 48 * 1024 * 1024; // 48 MB budget
const textureCache = new Map<string, CachedTextureEntry>();

function estimateTextureBytes(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const w = img?.width || 512;
  const h = img?.height || 512;
  // RGBA 4 bytes * ~1.33 mipmaps
  return Math.round(w * h * 4 * 1.33);
}

function evictZeroRefTexturesIfOverBudget(): void {
  let totalBytes = 0;
  for (const e of textureCache.values()) totalBytes += e.estimatedBytes;
  if (totalBytes <= MAX_TEXTURE_CACHE_BYTES) return;

  const evictable = Array.from(textureCache.entries())
    .filter(([, entry]) => entry.refCount <= 0)
    .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);

  for (const [key, entry] of evictable) {
    if (totalBytes <= MAX_TEXTURE_CACHE_BYTES * 0.8) break;
    entry.texture.dispose();
    textureCache.delete(key);
    totalBytes -= entry.estimatedBytes;
  }
}

export function acquireSharedTexture(url: string): THREE.Texture | null {
  if (!url) return null;
  const existing = textureCache.get(url);
  if (existing) {
    existing.refCount++;
    existing.lastUsedAt = Date.now();
    return existing.texture;
  }

  const tex = textureLoader.load(url, (loaded) => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    const entry = textureCache.get(url);
    if (entry) {
      entry.estimatedBytes = estimateTextureBytes(loaded);
      evictZeroRefTexturesIfOverBudget();
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;

  textureCache.set(url, {
    texture: tex,
    refCount: 1,
    lastUsedAt: Date.now(),
    estimatedBytes: 512 * 512 * 4,
  });
  evictZeroRefTexturesIfOverBudget();
  return tex;
}

export function releaseSharedTexture(url: string): void {
  if (!url) return;
  const entry = textureCache.get(url);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastUsedAt = Date.now();
  evictZeroRefTexturesIfOverBudget();
}

export function getTextureCacheStats(): { count: number; activeRefs: number; estimatedMB: number } {
  let totalBytes = 0;
  let activeRefs = 0;
  for (const e of textureCache.values()) {
    totalBytes += e.estimatedBytes;
    if (e.refCount > 0) activeRefs++;
  }
  return {
    count: textureCache.size,
    activeRefs,
    estimatedMB: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
  };
}
