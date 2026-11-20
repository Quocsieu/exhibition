import type { V28ExhibitionVersionDetail } from '../../services/v28Api';
import { computeRotatedBoothCollider, isPointInRect } from './v28NavigationBounds';

export type V28EnvAssetKind =
  | 'street_lamp'
  | 'planter'
  | 'planter_accent'
  | 'bench'
  | 'umbrella'
  | 'trash_bin';

export const V28_ENV_ASSET_PATHS: Record<V28EnvAssetKind, string> = {
  street_lamp: '/models/env/Street_Lamp.glb',
  planter: '/models/env/planter.glb',
  planter_accent: '/models/env/planter-near-ch.glb',
  bench: '/models/env/bench.glb',
  umbrella: '/models/env/umbrella.glb',
  trash_bin: '/models/env/trash_opt.glb',
};

/**
 * Target world-space max heights (meters) for normalizing each env GLB cleanly onto y = 0
 * without modifying the original GLB files.
 */
export const V28_ENV_TARGET_HEIGHT: Record<V28EnvAssetKind, number> = {
  street_lamp: 4.4,
  planter: 1.35,
  planter_accent: 1.55,
  bench: 0.9,
  umbrella: 2.85,
  trash_bin: 0.95,
};

export interface V28EnvPlacementItem {
  id: string;
  kind: V28EnvAssetKind;
  url: string;
  position: [number, number, number];
  rotationY: number;
  targetHeight: number;
}

const MAX_ENV_PROPS = 44;

/**
 * Deterministically computes safe, aesthetically balanced environment prop placements
 * for any dynamic V28 exhibition layout (6 booths -> 200+ booths):
 *  - Strictly inside `world.hallBounds` (margin >= 1.8m)
 *  - Zero overlap with any rotated booth collider (padded by 1.3m)
 *  - Zero obstruction of any booth front corridor (approachPoint & focusCameraPoint)
 *  - Zero obstruction of visitor spawnPoint or directoryPoint
 *  - Zero overlap between neighboring env props (min separation >= 2.2m)
 */
export function computeDynamicEnvPlacements(
  world: Pick<
    V28ExhibitionVersionDetail,
    'hallBounds' | 'centralAvenueBounds' | 'welcomeAreaBounds' | 'spawnPoint' | 'directoryPoint' | 'booths'
  >
): V28EnvPlacementItem[] {
  const { hallBounds, centralAvenueBounds, welcomeAreaBounds, spawnPoint, directoryPoint, booths } = world;
  const boothColliders = booths.map((b) => computeRotatedBoothCollider(b, 1.35));

  const accepted: V28EnvPlacementItem[] = [];
  const margin = 1.8;

  const isSpotSafe = (x: number, z: number): boolean => {
    if (
      x < hallBounds.minX + margin ||
      x > hallBounds.maxX - margin ||
      z < hallBounds.minZ + margin ||
      z > hallBounds.maxZ - margin
    ) {
      return false;
    }
    if (Math.hypot(x - spawnPoint.x, z - spawnPoint.z) < 4.2) return false;
    if (directoryPoint && Math.hypot(x - directoryPoint.x, z - directoryPoint.z) < 2.8) return false;

    for (let i = 0; i < boothColliders.length; i++) {
      if (isPointInRect(x, z, boothColliders[i])) return false;
    }

    for (let i = 0; i < booths.length; i++) {
      const b = booths[i];
      if (Math.hypot(x - b.approachPoint.x, z - b.approachPoint.z) < 3.6) return false;
      if (Math.hypot(x - b.focusCameraPoint.x, z - b.focusCameraPoint.z) < 3.4) return false;
    }

    for (let i = 0; i < accepted.length; i++) {
      const p = accepted[i].position;
      if (Math.hypot(x - p[0], z - p[2]) < 2.2) return false;
    }
    return true;
  };

  const tryAdd = (id: string, kind: V28EnvAssetKind, x: number, z: number, rotationY = 0) => {
    if (accepted.length >= MAX_ENV_PROPS) return;
    if (!isSpotSafe(x, z)) return;
    accepted.push({
      id,
      kind,
      url: V28_ENV_ASSET_PATHS[kind],
      position: [Math.round(x * 100) / 100, 0, Math.round(z * 100) / 100],
      rotationY,
      targetHeight: V28_ENV_TARGET_HEIGHT[kind],
    });
  };

  // 1. Grand Central Avenue Boulevard Edges: alternating Street Lamps & Planters along curb
  const aveHalfW = Math.max(3.8, (centralAvenueBounds.maxX - centralAvenueBounds.minX) / 2);
  const curbX = aveHalfW + 0.55;
  const startZ = centralAvenueBounds.minZ + 6.0;
  const endZ = centralAvenueBounds.maxZ - 6.0;
  const stepZ = Math.max(12, Math.min(18, (endZ - startZ) / 4));
  let aveIdx = 0;
  for (let z = startZ; z <= endZ; z += stepZ) {
    const kind: V28EnvAssetKind = aveIdx % 2 === 0 ? 'street_lamp' : 'planter';
    tryAdd(`ave-l-${aveIdx}`, kind, -curbX, z, Math.PI / 2);
    tryAdd(`ave-r-${aveIdx}`, kind, curbX, z, -Math.PI / 2);
    aveIdx++;
  }

  // 2. South Welcome Plaza Decorative Flanking (Accent Planters, Rest Benches, Lounge Umbrellas, Waste Bins)
  const welcomeZ = (welcomeAreaBounds.minZ + welcomeAreaBounds.maxZ) / 2;
  const welcomeSpanX = Math.min(20, Math.max(10, (hallBounds.maxX - hallBounds.minX) * 0.34));
  tryAdd('welcome-planter-l', 'planter_accent', -welcomeSpanX * 0.62, welcomeZ + 2.8, 0);
  tryAdd('welcome-planter-r', 'planter_accent', welcomeSpanX * 0.62, welcomeZ + 2.8, Math.PI);
  tryAdd('welcome-bench-l', 'bench', -welcomeSpanX * 0.92, welcomeZ + 2.6, Math.PI / 2);
  tryAdd('welcome-bench-r', 'bench', welcomeSpanX * 0.92, welcomeZ + 2.6, -Math.PI / 2);
  tryAdd('welcome-umbrella-l', 'umbrella', -welcomeSpanX * 1.15, welcomeZ - 2.6, 0);
  tryAdd('welcome-umbrella-r', 'umbrella', welcomeSpanX * 1.15, welcomeZ - 2.6, 0);
  tryAdd('welcome-trash-l', 'trash_bin', -welcomeSpanX * 0.85, welcomeZ - 3.0, 0);
  tryAdd('welcome-trash-r', 'trash_bin', welcomeSpanX * 0.85, welcomeZ - 3.0, 0);

  // 3. Architectural Hall Perimeter Corners (Planters & Street Lamps framing the hall)
  const cornerInset = 3.2;
  const corners: Array<[string, number, number, number]> = [
    ['nw', hallBounds.minX + cornerInset, hallBounds.minZ + cornerInset, Math.PI / 4],
    ['ne', hallBounds.maxX - cornerInset, hallBounds.minZ + cornerInset, -Math.PI / 4],
    ['sw', hallBounds.minX + cornerInset, hallBounds.maxZ - cornerInset, (3 * Math.PI) / 4],
    ['se', hallBounds.maxX - cornerInset, hallBounds.maxZ - cornerInset, -(3 * Math.PI) / 4],
  ];
  for (const [tag, cx, cz, rot] of corners) {
    tryAdd(`corner-planter-${tag}`, 'planter_accent', cx, cz, rot);
    tryAdd(`corner-lamp-${tag}`, 'street_lamp', cx + (cx < 0 ? 2.6 : -2.6), cz, rot);
  }

  return accepted;
}
