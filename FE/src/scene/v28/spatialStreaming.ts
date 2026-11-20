import type { V28BoothPlacementView } from '../../services/v28Api';
import type { V28CameraMode } from './DynamicExhibitionScene';

export type BoothLodTier = 0 | 1 | 2; // 0 = Near (Full), 1 = Mid (Shell), 2 = Far (Instanced Proxy)

export interface StreamingThresholds {
  ring0Enter: number;
  ring0Leave: number;
  ring1Enter: number;
  ring1Leave: number;
  maxNearBooths: number;
}

export const DEFAULT_DESKTOP_STREAMING: StreamingThresholds = {
  ring0Enter: 26,
  ring0Leave: 32,
  ring1Enter: 48,
  ring1Leave: 56,
  maxNearBooths: 14,
};

export const DEFAULT_MOBILE_STREAMING: StreamingThresholds = {
  ring0Enter: 20,
  ring0Leave: 26,
  ring1Enter: 38,
  ring1Leave: 45,
  maxNearBooths: 8,
};

/**
 * Pure, deterministic 3-Ring Spatial Streaming classifier with Hysteresis.
 * Prevents mount/unmount thrashing when a visitor walks along a ring boundary.
 */
export function computeStreamingLodMap(params: {
  booths: readonly V28BoothPlacementView[];
  anchorX: number;
  anchorZ: number;
  cameraMode: V28CameraMode;
  focusedBoothId: string | null;
  prevLodMap: Record<string, BoothLodTier>;
  thresholds: StreamingThresholds;
  maxPromotionsPerTick?: number;
}): Record<string, BoothLodTier> {
  const {
    booths,
    anchorX,
    anchorZ,
    cameraMode,
    focusedBoothId,
    prevLodMap,
    thresholds,
    maxPromotionsPerTick = 6,
  } = params;

  // Compute distances to streaming anchor
  const withDist = booths.map((b) => ({
    boothId: b.boothId,
    dist: Math.hypot(b.positionX - anchorX, b.positionZ - anchorZ),
    prev: prevLodMap[b.boothId] ?? 2,
  }));

  // Sort nearest first so budget caps always prioritize closest booths
  withDist.sort((a, b) => a.dist - b.dist);

  const nextMap: Record<string, BoothLodTier> = {};
  let nearCount = 0;
  let promotionsUsed = 0;

  for (const item of withDist) {
    // Focused booth is ALWAYS Ring 0 immediately (bypassing mount queue)
    if (focusedBoothId && item.boothId === focusedBoothId) {
      nextMap[item.boothId] = 0;
      nearCount++;
      continue;
    }

    // In Overview mode with large halls (>24 booths), use Ring 1 (shells) for closer booths
    // and Ring 2 (instanced proxy) for distant booths to keep draw calls low & FPS >= 50.
    if (cameraMode === 'overview' && booths.length > 24) {
      if (item.dist <= thresholds.ring1Leave * 1.15 && nearCount < thresholds.maxNearBooths * 2) {
        nextMap[item.boothId] = 1;
        nearCount++;
      } else {
        nextMap[item.boothId] = 2;
      }
      continue;
    }

    // Hysteresis state machine
    let desired: BoothLodTier;
    if (item.prev === 0) {
      desired = item.dist <= thresholds.ring0Leave ? 0 : item.dist <= thresholds.ring1Leave ? 1 : 2;
    } else if (item.prev === 1) {
      desired = item.dist <= thresholds.ring0Enter ? 0 : item.dist <= thresholds.ring1Leave ? 1 : 2;
    } else {
      desired = item.dist <= thresholds.ring0Enter ? 0 : item.dist <= thresholds.ring1Enter ? 1 : 2;
    }

    // Enforce Near booth budget
    if (desired === 0 && nearCount >= thresholds.maxNearBooths) {
      desired = 1;
    }

    // Staggered mount queue for upward promotions (2 -> 1 or 1 -> 0) to prevent frame spikes on rapid teleport
    if (desired < item.prev) {
      if (promotionsUsed >= maxPromotionsPerTick) {
        desired = item.prev;
      } else {
        promotionsUsed++;
      }
    }

    if (desired === 0) nearCount++;
    nextMap[item.boothId] = desired;
  }

  return nextMap;
}
