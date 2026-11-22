import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28ZoneRecord,
} from './v28Api';
import { computeRotatedBoothCollider, isPointInRect } from '../scene/v28/v28NavigationBounds';
import { shortestAngleDiff } from '../scene/v28/v28CameraController';

export interface RoutePoint {
  x: number;
  z: number;
}

export interface GuidedRouteResult {
  targetBooth: V28BoothPlacementView;
  waypoints: RoutePoint[];
  totalDistanceM: number;
  usesWalkwayGraph: boolean;
}

export interface DirectionIndicator {
  boothId: string;
  boothLabel: string;
  boothName: string;
  companyName: string;
  zoneName: string;
  distanceM: number;
  worldBearingRad: number;
  relativeAngleRad: number;
  isOffScreen: boolean;
  sector: 'ahead' | 'left' | 'right' | 'behind';
  booth: V28BoothPlacementView;
}

export interface ZoneSignDirection {
  zone: V28ZoneRecord;
  direction: 'left' | 'ahead' | 'right';
  distanceM: number;
}

export interface ZoneGuidanceState {
  currentZone: V28ZoneRecord | null;
  signposts: ZoneSignDirection[];
}

/**
 * Computes a collision-free guided route along `world.walkwayGraph` from `fromPos`
 * to `targetBooth.approachPoint` using Dijkstra shortest path.
 * Never cuts straight through booths when walkwayGraph nodes/edges are available.
 */
export interface V28WalkwayGraph {
  nodes: Array<{ id: string; x: number; z: number; kind?: string }>;
  edges: Array<[string, string]>;
}

export interface V28NavigationWorldInput {
  booths: V28BoothPlacementView[];
  walkwayGraph?: V28WalkwayGraph;
}

export function computeGuidedRoute(
  world: V28NavigationWorldInput,
  fromPos: RoutePoint,
  targetBooth: V28BoothPlacementView
): GuidedRouteResult {
  const dest: RoutePoint = {
    x: targetBooth.approachPoint?.x ?? targetBooth.positionX,
    z: targetBooth.approachPoint?.z ?? targetBooth.positionZ,
  };

  const nodes = world.walkwayGraph?.nodes || [];
  const edges = world.walkwayGraph?.edges || [];

  if (nodes.length === 0 || edges.length === 0) {
    const d = Math.hypot(dest.x - fromPos.x, dest.z - fromPos.z);
    return {
      targetBooth,
      waypoints: [fromPos, dest],
      totalDistanceM: Math.round(d * 10) / 10,
      usesWalkwayGraph: false,
    };
  }

  const nodeMap = new Map<string, { id: string; x: number; z: number }>();
  const adj = new Map<string, Array<{ to: string; w: number }>>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    adj.set(n.id, []);
  }
  for (const [a, b] of edges) {
    const na = nodeMap.get(a);
    const nb = nodeMap.get(b);
    if (!na || !nb) continue;
    const w = Math.hypot(nb.x - na.x, nb.z - na.z);
    adj.get(a)!.push({ to: b, w });
    adj.get(b)!.push({ to: a, w });
  }

  // Find nearest graph node to start and destination
  let startId = nodes[0].id;
  let bestStartD = Infinity;
  let endId = nodes[0].id;
  let bestEndD = Infinity;

  for (const n of nodes) {
    const ds = Math.hypot(n.x - fromPos.x, n.z - fromPos.z);
    if (ds < bestStartD) {
      bestStartD = ds;
      startId = n.id;
    }
    const de = Math.hypot(n.x - dest.x, n.z - dest.z);
    if (de < bestEndD) {
      bestEndD = de;
      endId = n.id;
    }
  }

  // Dijkstra shortest path on walkwayGraph
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();
  for (const n of nodes) dist.set(n.id, Infinity);
  dist.set(startId, 0);
  prev.set(startId, null);

  while (visited.size < nodes.length) {
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || u === endId) break;
    visited.add(u);
    for (const edge of adj.get(u) || []) {
      if (visited.has(edge.to)) continue;
      const alt = best + edge.w;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, u);
      }
    }
  }

  const graphPath: RoutePoint[] = [];
  if (dist.get(endId) !== Infinity) {
    let cur: string | null | undefined = endId;
    while (cur) {
      const node = nodeMap.get(cur);
      if (node) graphPath.push({ x: node.x, z: node.z });
      cur = prev.get(cur);
    }
    graphPath.reverse();
  }

  const rawPoints: RoutePoint[] = [fromPos, ...graphPath, dest];

  // Deduplicate near-identical consecutive points (< 0.4m)
  const waypoints: RoutePoint[] = [];
  for (const pt of rawPoints) {
    const last = waypoints[waypoints.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.z - last.z) >= 0.4) {
      waypoints.push({ x: Math.round(pt.x * 100) / 100, z: Math.round(pt.z * 100) / 100 });
    }
  }
  if (waypoints.length < 2) {
    waypoints.push(dest);
  }

  let totalDistanceM = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    totalDistanceM += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
  }

  return {
    targetBooth,
    waypoints,
    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
    usesWalkwayGraph: graphPath.length > 0,
  };
}

/**
 * Verifies that sampled points along a guided route stay outside all booth colliders
 * (used by QA tests to guarantee guided paths never cut through booths).
 */
export function countRouteBoothCollisions(
  waypoints: readonly RoutePoint[],
  booths: readonly V28BoothPlacementView[],
  ignoreBoothId?: string
): number {
  const colliders = booths
    .filter((b) => b.boothId !== ignoreBoothId)
    .map((b) => computeRotatedBoothCollider(b, 0.1));
  let hits = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(segLen / 1.0));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      if (colliders.some((c) => isPointInRect(px, pz, c))) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

/**
 * Computes camera-relative directional indicators for up to 3 booths.
 * Strictly bound to real `boothId`; updates live as visitor moves or rotates camera.
 */
export function computeDirectionIndicators(
  playerPos: RoutePoint,
  cameraYaw: number,
  targetBooths: readonly V28BoothPlacementView[],
  maxCount = 3
): DirectionIndicator[] {
  const unique: V28BoothPlacementView[] = [];
  const seen = new Set<string>();
  for (const b of targetBooths) {
    if (!seen.has(b.boothId)) {
      seen.add(b.boothId);
      unique.push(b);
    }
    if (unique.length >= maxCount) break;
  }

  return unique.map((booth) => {
    const tx = booth.approachPoint?.x ?? booth.positionX;
    const tz = booth.approachPoint?.z ?? booth.positionZ;
    const dx = tx - playerPos.x;
    const dz = tz - playerPos.z;
    const distanceM = Math.round(Math.hypot(dx, dz) * 10) / 10;
    const worldBearingRad = Math.atan2(dx, dz);
    // Relative angle: 0 = straight ahead along cameraYaw, negative = right, positive = left in Three.js Y-up
    // Convert so screenRight is positive (+) and screenLeft is negative (-) for CSS rotate(deg)!
    const diff = shortestAngleDiff(cameraYaw, worldBearingRad);
    const relativeAngleRad = -diff;
    const absA = Math.abs(relativeAngleRad);
    const sector: DirectionIndicator['sector'] =
      absA <= 0.55 ? 'ahead' : absA >= 2.45 ? 'behind' : relativeAngleRad < 0 ? 'left' : 'right';

    return {
      boothId: booth.boothId,
      boothLabel: `${booth.zoneCode}#${booth.slotIndex + 1}`,
      boothName: booth.boothName,
      companyName: booth.companyName,
      zoneName: booth.zoneName,
      distanceM,
      worldBearingRad,
      relativeAngleRad,
      isOffScreen: absA > 0.62,
      sector,
      booth,
    };
  });
}

/**
 * Computes real-data Zone Guidance (current zone + Left / Ahead / Right junction signposts)
 * strictly from `world.zones` bounds and display names (never hardcoded).
 */
export function computeZoneGuidance(
  zones: readonly V28ZoneRecord[],
  playerPos: RoutePoint,
  cameraYaw: number
): ZoneGuidanceState {
  if (!zones || zones.length === 0) {
    return { currentZone: null, signposts: [] };
  }

  let currentZone: V28ZoneRecord | null = null;
  for (const z of zones) {
    if (z.bounds && isPointInRect(playerPos.x, playerPos.z, z.bounds)) {
      currentZone = z;
      break;
    }
  }

  const buckets: { left: ZoneSignDirection | null; ahead: ZoneSignDirection | null; right: ZoneSignDirection | null } = {
    left: null,
    ahead: null,
    right: null,
  };

  for (const z of zones) {
    if (currentZone && z.id === currentZone.id) continue;
    if (!z.bounds) continue;
    const cx = (z.bounds.minX + z.bounds.maxX) / 2;
    const cz = (z.bounds.minZ + z.bounds.maxZ) / 2;
    const dist = Math.hypot(cx - playerPos.x, cz - playerPos.z);
    const bearing = Math.atan2(cx - playerPos.x, cz - playerPos.z);
    const rel = -shortestAngleDiff(cameraYaw, bearing); // - = left, + = right, 0 = ahead

    // Only consider zones ahead or to the sides (within ±125° of view direction)
    if (Math.abs(rel) > 2.2) continue;

    const dir: 'left' | 'ahead' | 'right' =
      Math.abs(rel) <= 0.42 ? 'ahead' : rel < 0 ? 'left' : 'right';

    const existing = buckets[dir];
    if (!existing || dist < existing.distanceM) {
      buckets[dir] = {
        zone: z,
        direction: dir,
        distanceM: Math.round(dist),
      };
    }
  }

  const signposts: ZoneSignDirection[] = [];
  if (buckets.left) signposts.push(buckets.left);
  if (buckets.ahead) signposts.push(buckets.ahead);
  if (buckets.right) signposts.push(buckets.right);

  return { currentZone, signposts };
}

/**
 * Pure anti-spam zone entry check: prevents boundary flicker/toast spam when standing near a zone edge.
 */
export function shouldEmitZoneTransition(
  prevZoneId: string | null,
  nextZoneId: string | null,
  lastEmittedAt: Map<string, number>,
  nowMs: number,
  cooldownMs = 8000
): boolean {
  if (!nextZoneId || nextZoneId === prevZoneId) return false;
  const last = lastEmittedAt.get(nextZoneId);
  if (last !== undefined && nowMs - last < cooldownMs) {
    return false;
  }
  lastEmittedAt.set(nextZoneId, nowMs);
  return true;
}

export interface WorldAnchoredBoothIndicator {
  boothId: string;
  boothLabel: string;
  boothName: string;
  companyName: string;
  distanceM: number;
  /** True world-space bearing (radians, 0 = +Z, +PI/2 = +X, PI = -Z). Independent of cameraYaw! */
  worldBearingRad: number;
  /** De-cluttered display angle on the ring perimeter to prevent label overlap. */
  displayBearingRad: number;
  /** Staggered vertical elevation (meters above ground) to prevent label overlap. */
  labelElevationM: number;
  booth: V28BoothPlacementView;
}

export interface WorldAnchoredZoneIndicator {
  zoneId: string;
  zoneCode: string;
  displayName: string;
  distanceM: number;
  worldBearingRad: number;
  displayBearingRad: number;
}

/**
 * Separates clustered bearings on the character compass ring by at least `minSepRad`
 * while staying centered around the true world bearing cluster so 3D labels never overlap.
 */
export function resolveNonOverlappingBearings(
  rawBearings: readonly number[],
  minSepRad = 0.48
): number[] {
  const n = rawBearings.length;
  if (n <= 1) return [...rawBearings];

  const indexed = rawBearings.map((angle, idx) => ({ idx, angle }));
  // Sort by signed angle in [-PI, PI]
  indexed.sort((a, b) => a.angle - b.angle);

  const adjusted = indexed.map((item) => item.angle);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 1; i < n; i += 1) {
      const gap = adjusted[i] - adjusted[i - 1];
      if (gap < minSepRad) {
        const push = (minSepRad - gap) * 0.5;
        adjusted[i - 1] -= push;
        adjusted[i] += push;
      }
    }
    // Check wrap-around gap between last and first
    const wrapGap = adjusted[0] + Math.PI * 2 - adjusted[n - 1];
    if (wrapGap < minSepRad) {
      const push = (minSepRad - wrapGap) * 0.5;
      adjusted[0] += push;
      adjusted[n - 1] -= push;
    }
  }

  const result = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    result[indexed[i].idx] = Math.atan2(Math.sin(adjusted[i]), Math.cos(adjusted[i]));
  }
  return result;
}

/**
 * Formats a concise, real-data subtitle for a zone navigation pill without duplicating
 * the `"Khu "` prefix or exposing raw `"Khu chưa phân bổ"` placeholder strings when
 * a zone has not yet been assigned a category in the exhibition database (Hotfix P1-02).
 */
export function formatZoneNavigationSubtitle(
  zone: Pick<V28ZoneRecord, 'code' | 'displayName' | 'boothCount'>,
  includeCountFallback = true
): string {
  const raw = (zone.displayName || '').trim();
  if (!raw || /chưa\s*phân\s*bổ/i.test(raw)) {
    if (!includeCountFallback) return '';
    const count = Number.isFinite(zone.boothCount) && zone.boothCount > 0 ? zone.boothCount : 10;
    return `${count} gian hàng`;
  }
  const stripped = raw.replace(/^khu\s+/i, '').trim();
  if (!stripped) {
    return includeCountFallback ? `${zone.boothCount || 10} gian hàng` : '';
  }
  return stripped;
}

/**
 * Computes world-space character-anchored booth & zone directional indicators (UAT Fix 01).
 * Directions strictly reflect true world-space bearings from avatar feet to destinations
 * (independent of camera rotation), with anti-overlap spacing and max-3 booth cap.
 */
export function computeWorldAnchoredIndicators(
  playerPos: RoutePoint,
  booths: readonly V28BoothPlacementView[],
  zones: readonly V28ZoneRecord[],
  maxBooths = 3,
  maxZones = 3
): {
  booths: WorldAnchoredBoothIndicator[];
  zones: WorldAnchoredZoneIndicator[];
} {
  // 1. Select up to `maxBooths` nearest populated booths (fallback to nearest booths if none populated)
  const populated = booths.filter((b) => b.assignedSlotCount > 0);
  const pool = populated.length > 0 ? populated : booths;
  const sortedBooths = [...pool]
    .map((b) => {
      const tx = b.approachPoint?.x ?? b.positionX;
      const tz = b.approachPoint?.z ?? b.positionZ;
      const dx = tx - playerPos.x;
      const dz = tz - playerPos.z;
      return {
        booth: b,
        distanceM: Math.round(Math.hypot(dx, dz) * 10) / 10,
        worldBearingRad: Math.atan2(dx, dz),
      };
    })
    .filter((item) => item.distanceM >= 2.2) // don't point at booth already standing inside
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, maxBooths);

  const boothDisplayAngles = resolveNonOverlappingBearings(
    sortedBooths.map((b) => b.worldBearingRad),
    0.76
  );

  const elevationCycle = [0.22, 0.50, 0.26];
  const boothIndicators: WorldAnchoredBoothIndicator[] = sortedBooths.map((item, idx) => ({
    boothId: item.booth.boothId,
    boothLabel: `${item.booth.zoneCode}#${item.booth.slotIndex + 1}`,
    boothName: item.booth.boothName,
    companyName: item.booth.companyName || item.booth.boothName,
    distanceM: item.distanceM,
    worldBearingRad: item.worldBearingRad,
    displayBearingRad: boothDisplayAngles[idx],
    labelElevationM: elevationCycle[idx % elevationCycle.length],
    booth: item.booth,
  }));

  // 2. Select up to `maxZones` nearest real zones outside current zone, avoiding overlap with booth labels
  const validZones = (zones || [])
    .filter((z) => z.bounds && !isPointInRect(playerPos.x, playerPos.z, z.bounds))
    .map((z) => {
      const cx = (z.bounds.minX + z.bounds.maxX) / 2;
      const cz = (z.bounds.minZ + z.bounds.maxZ) / 2;
      const dx = cx - playerPos.x;
      const dz = cz - playerPos.z;
      return {
        zone: z,
        distanceM: Math.round(Math.hypot(dx, dz)),
        worldBearingRad: Math.atan2(dx, dz),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, maxZones);

  const zoneDisplayAngles = resolveNonOverlappingBearings(
    validZones.map((z) => z.worldBearingRad),
    0.88
  );

  const zoneIndicators: WorldAnchoredZoneIndicator[] = validZones.map((item, idx) => ({
    zoneId: item.zone.id,
    zoneCode: item.zone.code,
    displayName: formatZoneNavigationSubtitle(item.zone, false),
    distanceM: item.distanceM,
    worldBearingRad: item.worldBearingRad,
    displayBearingRad: zoneDisplayAngles[idx],
  }));

  return { booths: boothIndicators, zones: zoneIndicators };
}
