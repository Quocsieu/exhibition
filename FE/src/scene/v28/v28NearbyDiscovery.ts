import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
  V28RectBounds,
} from '../../services/v28Api';
import { computeRotatedBoothCollider, type RotatedCollider } from './v28NavigationBounds';

/**
 * Thresholds derived directly from the real Grand Expo V28 100-booth U-shaped geometry:
 * - Adjacent booth pitch along a U-arm: ~11.1 m
 * - U-zone courtyard width (North arm approachPoint to South arm approachPoint): ~25.3 m
 * - Central boulevard width: 14.0 m (center to edge booth approachPoint: ~17.8 m)
 *
 * Enter radius 18.5 m captures booths in the avatar's immediate U-courtyard or bordering the
 * central boulevard, while naturally excluding opposite rows across a courtyard (25.3 m).
 * Exit radius 21.0 m adds a 2.5 m hysteresis band to prevent UI flicker near the boundary.
 */
export const NEARBY_ENTER_RADIUS_M = 18.5;
export const NEARBY_EXIT_RADIUS_M = 21.0;
export const NEARBY_MAX_RESULTS = 3;
export const NEARBY_MOVE_RECOMPUTE_DELTA_M = 0.45;

export interface NearbyProductItem {
  boothId: string;
  slotId: string;
  product: V28Product;
}

export interface NearbyBoothMatch {
  booth: V28BoothPlacementView;
  boothNumber: number;
  /** Straight-line distance (meters) from avatar (x, z) to booth's front approachPoint. */
  approachDistanceM: number;
  /** Assigned active products belonging strictly to this booth. */
  products: NearbyProductItem[];
}

export interface NearbyDiscoveryIndex {
  booths: readonly V28BoothPlacementView[];
  colliders: readonly RotatedCollider[];
  hallBounds: V28RectBounds;
}

/**
 * Build reusable spatial index once per world load (O(N), N = 100).
 */
export function buildNearbyDiscoveryIndex(
  world: Pick<V28ExhibitionVersionDetail, 'booths' | 'hallBounds'>
): NearbyDiscoveryIndex {
  const colliders = world.booths.map((b) => computeRotatedBoothCollider(b, 0.15));
  return {
    booths: world.booths,
    colliders,
    hallBounds: world.hallBounds,
  };
}

/**
 * Canonical 1-based booth number derived from backend slotIndex (consistent with Phase 2 Map).
 */
export function getNearbyBoothNumber(booth: Pick<V28BoothPlacementView, 'slotIndex'>): number {
  return Math.max(1, (Number.isFinite(booth.slotIndex) ? booth.slotIndex : 0) + 1);
}

/**
 * Validate that a booth has a finite approachPoint within the hall bounds.
 */
export function hasValidApproachPoint(
  booth: Pick<V28BoothPlacementView, 'approachPoint'>,
  hallBounds: V28RectBounds
): boolean {
  const ap = booth.approachPoint;
  if (!ap || !Number.isFinite(ap.x) || !Number.isFinite(ap.z)) return false;
  return (
    ap.x >= hallBounds.minX &&
    ap.x <= hallBounds.maxX &&
    ap.z >= hallBounds.minZ &&
    ap.z <= hallBounds.maxZ
  );
}

/**
 * Exact 2D Liang-Barsky / Slab segment-vs-AABB intersection test on the (X, Z) plane.
 * Used to ensure a candidate booth is not blocked by another booth's solid structure/wall.
 */
export function segmentIntersectsRect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rect: V28RectBounds
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (ax < rect.minX || ax > rect.maxX) return false;
  } else {
    const invD = 1 / dx;
    let t1 = (rect.minX - ax) * invD;
    let t2 = (rect.maxX - ax) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (az < rect.minZ || az > rect.maxZ) return false;
  } else {
    const invD = 1 / dz;
    let t1 = (rect.minZ - az) * invD;
    let t2 = (rect.maxZ - az) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMax >= 0 && tMin <= 1;
}

/**
 * Checks whether the avatar lies on the front (open facade) side of the booth rather than behind
 * its solid back wall. Uses the booth's exact world rotationY:
 *   frontNormal = (sin(rotationY), cos(rotationY))
 * Matches layoutGenerator.ts:
 *   rotY = 0 -> +Z (South), rotY = PI -> -Z (North), rotY = +PI/2 -> +X (East), rotY = -PI/2 -> -X (West).
 */
export function isAvatarInFrontOfBooth(
  avatarX: number,
  avatarZ: number,
  booth: Pick<V28BoothPlacementView, 'positionX' | 'positionZ' | 'rotationY' | 'footprintDepth'>
): boolean {
  const frontX = Math.sin(booth.rotationY);
  const frontZ = Math.cos(booth.rotationY);
  const dx = avatarX - booth.positionX;
  const dz = avatarZ - booth.positionZ;
  const forwardProj = dx * frontX + dz * frontZ;
  const minFrontClearance = booth.footprintDepth / 2 - 0.5;
  return forwardProj >= minFrontClearance;
}

/**
 * Extract real, active assigned products strictly from this booth's slots.
 * Never fabricates products or leaks products from other booths.
 */
export function extractBoothProducts(booth: V28BoothPlacementView): NearbyProductItem[] {
  if (!Array.isArray(booth.slots) || booth.slots.length === 0) return [];
  const items: NearbyProductItem[] = [];
  for (const slot of booth.slots) {
    if (!slot?.product) continue;
    if (slot.product.status === 'inactive') continue;
    items.push({
      boothId: booth.boothId,
      slotId: slot.slotId,
      product: slot.product,
    });
  }
  return items;
}

export interface FindNearbyBoothsOptions {
  enterRadiusM?: number;
  exitRadiusM?: number;
  maxResults?: number;
  prevNearbyIds?: ReadonlySet<string>;
}

/**
 * Detects up to `maxResults` accessible nearby booths in the 3D U-shaped World.
 *
 * Guarantees:
 * - Uses booth's front `approachPoint` proximity (never raw back-wall center distance).
 * - Rejects booths with missing/out-of-bounds `approachPoint`.
 * - Rejects booths whose back wall faces the avatar (prevents cross-corridor / inter-zone leakage).
 * - Rejects booths whose direct path from avatar to `approachPoint` is obstructed by another booth collider.
 * - Applies enter/exit hysteresis so standing near the boundary never flickers.
 * - Pure read-only computation: never mutates world, never marks visited, never triggers focus/NPC.
 */
export function findNearbyBooths(
  index: NearbyDiscoveryIndex,
  avatarPos: { x: number; z: number },
  options: FindNearbyBoothsOptions = {}
): NearbyBoothMatch[] {
  const enterRadius = options.enterRadiusM ?? NEARBY_ENTER_RADIUS_M;
  const exitRadius = options.exitRadiusM ?? NEARBY_EXIT_RADIUS_M;
  const maxResults = options.maxResults ?? NEARBY_MAX_RESULTS;
  const prevIds = options.prevNearbyIds;

  if (!Number.isFinite(avatarPos.x) || !Number.isFinite(avatarPos.z)) {
    return [];
  }

  const candidates: NearbyBoothMatch[] = [];

  for (let i = 0; i < index.booths.length; i++) {
    const booth = index.booths[i];
    if (!hasValidApproachPoint(booth, index.hallBounds)) continue;

    const ap = booth.approachPoint;
    const dx = avatarPos.x - ap.x;
    const dz = avatarPos.z - ap.z;
    const distSq = dx * dx + dz * dz;

    const wasNearby = prevIds ? prevIds.has(booth.boothId) : false;
    const threshold = wasNearby ? exitRadius : enterRadius;
    if (distSq > threshold * threshold) continue;

    // Must be on the open front side of the booth (eliminates back-wall leakage across zones)
    if (!isAvatarInFrontOfBooth(avatarPos.x, avatarPos.z, booth)) continue;

    // Line-of-sight from avatar to booth's approachPoint must not cut through another booth's collider
    let occluded = false;
    for (let j = 0; j < index.colliders.length; j++) {
      const col = index.colliders[j];
      if (col.boothId === booth.boothId) continue;
      if (segmentIntersectsRect(avatarPos.x, avatarPos.z, ap.x, ap.z, col)) {
        occluded = true;
        break;
      }
    }
    if (occluded) continue;

    candidates.push({
      booth,
      boothNumber: getNearbyBoothNumber(booth),
      approachDistanceM: Math.round(Math.sqrt(distSq) * 10) / 10,
      products: extractBoothProducts(booth),
    });
  }

  candidates.sort((a, b) => {
    if (a.approachDistanceM !== b.approachDistanceM) {
      return a.approachDistanceM - b.approachDistanceM;
    }
    return a.boothNumber - b.boothNumber;
  });

  return candidates.slice(0, maxResults);
}
