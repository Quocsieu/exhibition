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
 * Returns the continuous full-hall walkable space so visitors can move freely across
 * the entire exhibition floor and transition seamlessly between all zones, courtyards,
 * inter-zone corridors, and perimeter walkways while still colliding smoothly with
 * rotated 3D booth footprints and the outer hall boundary.
 */
export function deriveWalkableRegions(
  world: Pick<
    V28ExhibitionVersionDetail,
    'walkableRegions' | 'walkableBounds' | 'centralAvenueBounds' | 'welcomeAreaBounds' | 'zones'
  > & { hallBounds?: V28RectBounds }
): V28RectBounds[] {
  if (world.walkableBounds) {
    return [world.walkableBounds];
  }

  if (world.hallBounds) {
    const pad = 1.5;
    return [
      {
        minX: world.hallBounds.minX + pad,
        maxX: world.hallBounds.maxX - pad,
        minZ: world.hallBounds.minZ + pad,
        maxZ: world.hallBounds.maxZ - pad,
      },
    ];
  }

  if (Array.isArray(world.walkableRegions) && world.walkableRegions.length > 0) {
    return world.walkableRegions;
  }

  const regions: V28RectBounds[] = [];
  if (world.centralAvenueBounds) regions.push(world.centralAvenueBounds);
  if (world.welcomeAreaBounds) regions.push(world.welcomeAreaBounds);
  for (const z of world.zones || []) {
    if (z.bounds) {
      regions.push({
        minX: z.bounds.minX - 1.5,
        maxX: z.bounds.maxX + 1.5,
        minZ: z.bounds.minZ - 1.5,
        maxZ: z.bounds.maxZ + 1.5,
      });
    }
  }
  return regions;
}

/**
 * Advances a free-roam click/tap move step toward `target` with smooth axis-sliding
 * around booth edges so cross-zone movement never stalls on a grazed corner.
 */
export function stepSeamlessFreeMove(
  current: { x: number; z: number },
  target: { x: number; z: number },
  maxStep: number,
  isWalkable: (x: number, z: number) => boolean
): { x: number; z: number; moved: boolean; reached: boolean; blocked: boolean; moveX: number; moveZ: number } {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.35) {
    return { x: current.x, z: current.z, moved: false, reached: true, blocked: false, moveX: 0, moveZ: 0 };
  }

  const step = Math.min(dist, Math.max(0, maxStep));
  const vx = (dx / dist) * step;
  const vz = (dz / dist) * step;
  const nx = current.x + vx;
  const nz = current.z + vz;

  if (isWalkable(nx, nz)) {
    return { x: nx, z: nz, moved: true, reached: false, blocked: false, moveX: vx, moveZ: vz };
  }

  // Smooth axis-sliding when approaching a booth edge diagonally
  let outX = current.x;
  let outZ = current.z;
  let moved = false;
  if (Math.abs(vx) > 1e-4 && isWalkable(nx, outZ)) {
    outX = nx;
    moved = true;
  }
  if (Math.abs(vz) > 1e-4 && isWalkable(outX, nz)) {
    outZ = nz;
    moved = true;
  }

  if (moved) {
    return {
      x: outX,
      z: outZ,
      moved: true,
      reached: false,
      blocked: false,
      moveX: outX - current.x,
      moveZ: outZ - current.z,
    };
  }

  return { x: current.x, z: current.z, moved: false, reached: false, blocked: true, moveX: 0, moveZ: 0 };
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
