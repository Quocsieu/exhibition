import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28RectBounds,
} from '../../services/v28Api';

export interface RotatedCollider extends V28RectBounds {
  boothId: string;
}

/**
 * Compute world-space AABB for a booth placement taking its exact rotationY into account.
 * Critical for U-shaped wings rotated ±90° where footprintWidth runs along Z and footprintDepth along X.
 */
export function computeRotatedBoothCollider(
  b: Pick<V28BoothPlacementView, 'boothId' | 'positionX' | 'positionZ' | 'rotationY' | 'footprintWidth' | 'footprintDepth'>,
  padding = 0.35
): RotatedCollider {
  const cos = Math.abs(Math.cos(b.rotationY));
  const sin = Math.abs(Math.sin(b.rotationY));
  const halfW = (b.footprintWidth * cos + b.footprintDepth * sin) / 2 + padding;
  const halfD = (b.footprintWidth * sin + b.footprintDepth * cos) / 2 + padding;
  return {
    boothId: b.boothId,
    minX: b.positionX - halfW,
    maxX: b.positionX + halfW,
    minZ: b.positionZ - halfD,
    maxZ: b.positionZ + halfD,
  };
}

/**
 * Returns the adaptive list of valid walkable regions (U-zone courtyards, Grand Boulevard,
 * South Entry Spine, Welcome Area, and inter-U-zone walkways).
 * Never relies on a single giant world rectangle that would expose empty outer voids.
 */
export function deriveWalkableRegions(
  world: Pick<
    V28ExhibitionVersionDetail,
    'walkableRegions' | 'walkableBounds' | 'centralAvenueBounds' | 'welcomeAreaBounds' | 'zones'
  >
): V28RectBounds[] {
  if (Array.isArray(world.walkableRegions) && world.walkableRegions.length > 0) {
    return world.walkableRegions;
  }

  const regions: V28RectBounds[] = [];
  if (world.centralAvenueBounds) regions.push(world.centralAvenueBounds);
  if (world.welcomeAreaBounds) regions.push(world.welcomeAreaBounds);
  for (const z of world.zones || []) {
    if (z.bounds) {
      regions.push({
        minX: z.bounds.minX + 0.8,
        maxX: z.bounds.maxX - 0.8,
        minZ: z.bounds.minZ - 1.5,
        maxZ: z.bounds.maxZ + 1.5,
      });
    }
  }
  if (regions.length === 0 && world.walkableBounds) {
    regions.push(world.walkableBounds);
  }
  return regions;
}

export function isPointInRect(x: number, z: number, r: V28RectBounds): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/**
 * Returns true iff (x, z) lies inside at least one valid walkable region
 * AND outside every rotated booth collider.
 */
export function isPointWalkable(
  x: number,
  z: number,
  regions: readonly V28RectBounds[],
  boothColliders: readonly V28RectBounds[]
): boolean {
  let insideAnyRegion = false;
  for (let i = 0; i < regions.length; i++) {
    if (isPointInRect(x, z, regions[i])) {
      insideAnyRegion = true;
      break;
    }
  }
  if (!insideAnyRegion) return false;

  for (let i = 0; i < boothColliders.length; i++) {
    if (isPointInRect(x, z, boothColliders[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Validates and clamps a target point (for Teleport or safe recovery) into the nearest
 * valid walkable region without ever landing inside a booth collider or out-of-bounds void.
 */
export function clampPointToWalkable(
  x: number,
  z: number,
  regions: readonly V28RectBounds[],
  boothColliders: readonly V28RectBounds[],
  fallback: { x: number; z: number }
): { x: number; z: number; clamped: boolean } {
  if (isPointWalkable(x, z, regions, boothColliders)) {
    return { x, z, clamped: false };
  }

  let bestX = fallback.x;
  let bestZ = fallback.z;
  let bestDistSq = Infinity;
  let found = false;

  for (const r of regions) {
    const cx = Math.max(r.minX + 0.25, Math.min(r.maxX - 0.25, x));
    const cz = Math.max(r.minZ + 0.25, Math.min(r.maxZ - 0.25, z));
    let blocked = false;
    for (const c of boothColliders) {
      if (isPointInRect(cx, cz, c)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const dSq = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
      found = true;
    }
  }

  return found
    ? { x: bestX, z: bestZ, clamped: true }
    : { x: fallback.x, z: fallback.z, clamped: true };
}

/**
 * Adaptive camera position clamp so neither drag-rotate, wheel-zoom, nor edge-walking
 * can push the camera outside valid hall / overview bounds.
 */
export function clampCameraPosition(
  pos: { x: number; y: number; z: number },
  hallBounds: V28RectBounds,
  cameraMode: 'overview' | 'explore' | 'focus',
  overviewRadius: number
): { x: number; y: number; z: number } {
  if (cameraMode === 'overview') {
    const padX = Math.max(20, (hallBounds.maxX - hallBounds.minX) * 0.45);
    const padZ = Math.max(20, (hallBounds.maxZ - hallBounds.minZ) * 0.45);
    return {
      x: Math.max(hallBounds.minX - padX, Math.min(hallBounds.maxX + padX, pos.x)),
      y: Math.max(18, Math.min(Math.max(180, overviewRadius * 2.2), pos.y)),
      z: Math.max(hallBounds.minZ - padZ, Math.min(hallBounds.maxZ + padZ, pos.z)),
    };
  }

  const margin = 1.2;
  return {
    x: Math.max(hallBounds.minX + margin, Math.min(hallBounds.maxX - margin, pos.x)),
    y: Math.max(2.2, Math.min(26.0, pos.y)),
    z: Math.max(hallBounds.minZ + margin, Math.min(hallBounds.maxZ - margin, pos.z)),
  };
}
