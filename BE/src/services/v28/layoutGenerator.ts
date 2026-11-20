/**
 * GRAND EXPO WORLD V28 — PHASE 8 MULTIPLE U-SHAPED CATEGORY ZONES LAYOUT GENERATOR
 *
 * Implements the user's sketch-aligned multi-U exhibition architecture:
 * - Each Category Zone is ONE variable-size U-shaped zone (booths along 3 sides, 4th side OPEN).
 * - ALL booths face INWARD into their U-zone's spacious interior courtyard.
 * - Multiple U-zones are arranged in facing rows (North row opening South, South row opening North)
 *   along a wide Grand Central Boulevard, with generous walkways between every U-zone.
 * - Supports arbitrary booth counts (1..200+) and uneven category allocations (e.g. 25 / 20 / 20 / 15 / 20).
 * - Uses real measured GLB footprints of the 6 V27.4 archetypes; guarantees 0 overlap, 0 focus clip,
 *   and 100% BFS walkway connectivity from Spawn to every booth.
 */

export type V28ArchetypeId =
  | 'signature_ring'
  | 'organic_flow'
  | 'grand_portal'
  | 'wave_pavilion'
  | 'gallery_arch'
  | 'dynamic_frame';

export interface ArchetypeFootprintSpec {
  id: V28ArchetypeId;
  theme: 'living' | 'design' | 'tech' | 'energy' | 'coffee' | 'robotics';
  label: string;
  glbPath: string;
  width: number;
  depth: number;
  height: number;
}

export const V28_BOOTH_INSTANCE_SCALE = 1.25;

export const V28_ARCHETYPES: readonly ArchetypeFootprintSpec[] = [
  {
    id: 'signature_ring',
    theme: 'living',
    label: 'Signature Ring',
    glbPath: 'models/booths/v27_4/booth_01_signature_ring_v27_4.glb',
    width: 8.4,
    depth: 6.49,
    height: 4.95,
  },
  {
    id: 'organic_flow',
    theme: 'design',
    label: 'Organic Flow',
    glbPath: 'models/booths/v27_4/booth_02_organic_flow_v27_4.glb',
    width: 8.4,
    depth: 6.49,
    height: 4.78,
  },
  {
    id: 'grand_portal',
    theme: 'tech',
    label: 'Grand Portal',
    glbPath: 'models/booths/v27_4/booth_03_grand_portal_v27_4.glb',
    width: 8.4,
    depth: 6.49,
    height: 4.75,
  },
  {
    id: 'wave_pavilion',
    theme: 'energy',
    label: 'Wave Pavilion',
    glbPath: 'models/booths/v27_4/booth_04_wave_pavilion_v27_4.glb',
    width: 8.4,
    depth: 6.49,
    height: 4.91,
  },
  {
    id: 'gallery_arch',
    theme: 'coffee',
    label: 'Gallery Arch',
    glbPath: 'models/booths/v27_4/booth_05_gallery_arch_v27_4.glb',
    width: 8.4,
    depth: 6.49,
    height: 4.73,
  },
  {
    id: 'dynamic_frame',
    theme: 'robotics',
    label: 'Dynamic Frame',
    glbPath: 'models/booths/v27_4/booth_06_dynamic_frame_v27_4.glb',
    width: 8.59,
    depth: 6.49,
    height: 5.03,
  },
] as const;

export const ARCHETYPE_MAP: Record<V28ArchetypeId, ArchetypeFootprintSpec> = Object.fromEntries(
  V28_ARCHETYPES.map((a) => [a.id, a])
) as Record<V28ArchetypeId, ArchetypeFootprintSpec>;

export interface RectBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CategoryZoneInput {
  categoryId: string;
  categoryName: string;
  boothCount: number;
}

export interface LayoutGeneratorInput {
  targetBoothCount: number;
  zoneCount?: number;
  boothsPerZone?: number;
  preferredZoneCapacity?: number;
  hallStyle?: 'grand_expo' | 'modular_pavilion';
  mainAvenueWidth?: number;
  aisleWidth?: number;
  perimeterWidth?: number;
  boothGap?: number;
  layoutSeed?: number;
  categoryZones?: CategoryZoneInput[];
  reservedAreas?: Array<{ id: string; label: string; bounds: RectBounds }>;
}

export type ClusterCenterpieceKind =
  | 'medallion_oasis'
  | 'landscape_lounge'
  | 'interactive_corner'
  | 'cafe_rest';

/**
 * Represents one U-shaped Zone courtyard (variable size based on its allocated boothCount).
 * Retains the `GeneratedClusterSpec` interface name for full backward compatibility with FE/API.
 */
export interface GeneratedClusterSpec {
  clusterId: string;
  clusterIndex: number;
  zoneCode: string;
  zoneName: string;
  categoryId: string | null;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  boothCount: number;
  openingDirection: 'south' | 'north' | 'east' | 'west';
  backCount: number;
  leftCount: number;
  rightCount: number;
  variationSeed: number;
  centerpieceKind: ClusterCenterpieceKind;
}

export interface GeneratedZoneSpec {
  code: string;
  categoryId: string | null;
  displayName: string;
  categoryTag: string;
  bounds: RectBounds;
  sortOrder: number;
  boothCount: number;
  clusterCount: number;
  openingDirection: 'south' | 'north' | 'east' | 'west';
}

export interface GeneratedBoothPlacement {
  slotIndex: number;
  clusterId: string;
  clusterIndex: number;
  zoneCode: string;
  categoryId: string | null;
  positionX: number;
  positionZ: number;
  rotationY: number;
  archetypeId: V28ArchetypeId;
  footprintWidth: number;
  footprintDepth: number;
  approachPoint: { x: number; z: number };
  focusCameraPoint: { x: number; z: number };
}

export interface WalkwayNode {
  id: string;
  x: number;
  z: number;
  kind: 'spawn' | 'avenue' | 'aisle' | 'perimeter' | 'approach' | 'cluster_center';
  boothSlotIndex?: number;
}

export interface WalkwayGraph {
  nodes: WalkwayNode[];
  edges: Array<[string, string]>;
}

export interface RoofBoundsMetadata {
  hallWidth: number;
  hallDepth: number;
  bounds: RectBounds;
  eaveHeight: number;
  roofRise: number;
  ribSpacing: number;
  skylightRatio: number;
}

export interface GeneratedExhibitionLayout {
  config: Required<Omit<LayoutGeneratorInput, 'reservedAreas' | 'categoryZones' | 'zoneCount' | 'boothsPerZone'>> & {
    zoneCount?: number;
    boothsPerZone?: number;
    categoryZones: CategoryZoneInput[];
    reservedAreas: Array<{ id: string; label: string; bounds: RectBounds }>;
  };
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
  walkableRegions: RectBounds[];
  centralAvenueBounds: RectBounds;
  welcomeAreaBounds: RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
  clusters: GeneratedClusterSpec[];
  zones: GeneratedZoneSpec[];
  placements: GeneratedBoothPlacement[];
  walkwayGraph: WalkwayGraph;
  cameraOverviewBounds: {
    centerX: number;
    centerZ: number;
    radius: number;
    recommendedHeight: number;
    recommendedDistance: number;
  };
  roofBounds: RoofBoundsMetadata;
}

export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    boothCount: number;
    zoneCount: number;
    clusterCount: number;
    overlapCount: number;
    outOfBoundsCount: number;
    blockedWalkwayCount: number;
    unreachableBoothCount: number;
    focusClipCount: number;
  };
}

// ============================================================================
// VARIABLE-SIZE U-SHAPED ZONE CONSTANTS (Measured 6-GLB BBox × 1.25x V28 Scale)
// Scaled GLB max footprint: W = 8.59m (dynamic_frame), 8.40m (others); D = 6.49m
// ============================================================================
export const MAX_BOOTHS_PER_CLUSTER = 6; // legacy export kept for compatibility
export const MAX_ARCHETYPE_WIDTH_M = 8.59;
export const MAX_ARCHETYPE_DEPTH_M = 6.49;
export const BOOTH_GAP_M = 2.6; // clear gap between adjacent scaled booths
export const BOOTH_PITCH_M = 11.19; // MAX_ARCHETYPE_WIDTH_M + BOOTH_GAP_M
export const BOOTH_EDGE_INSET_M = 4.0; // half-depth (3.25m) + 0.75m clean outer wall margin
export const CORNER_CLEARANCE_M = 10.4; // back half-depth (3.25m) + wing half-width (4.30m) + 2.85m corner breathing room
export const MIN_U_INTERIOR_WIDTH_M = 23.0; // >= 2*(3.25 + 5.60 focus) + 5.3m clear promenade
export const ZONE_GAP_X_M = 10.5; // clean walkway between adjacent U-zones
export const GRAND_BOULEVARD_WIDTH_M = 14.0; // grand central avenue between facing U rows
export const ENTRY_SPINE_WIDTH_M = 12.0; // clear North-South entrance boulevard from Spawn
export const WELCOME_AREA_DEPTH = 15.0;
export const APPROACH_OFFSET_M = 2.8;
export const FOCUS_CAMERA_OFFSET_M = 5.6;

const CENTERPIECE_VARIANTS: readonly ClusterCenterpieceKind[] = [
  'medallion_oasis',
  'landscape_lounge',
  'interactive_corner',
  'cafe_rest',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function zoneCodeForIndex(index: number): string {
  let n = index;
  let code = '';
  do {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

/**
 * Partition `count` booths cleanly along the 3 sides of a U-shaped zone:
 * - Back wall (bottom of the U)
 * - Left wing
 * - Right wing
 * Example: 6 -> (2, 2, 2) [exact V27.5 U!]; 15 -> (5, 5, 5); 20 -> (6, 7, 7); 25 -> (7, 9, 9).
 */
export function computeUZoneSideCounts(count: number): {
  backCount: number;
  leftCount: number;
  rightCount: number;
} {
  if (count <= 0) return { backCount: 0, leftCount: 0, rightCount: 0 };
  if (count <= 3) return { backCount: count, leftCount: 0, rightCount: 0 };
  if (count === 4) return { backCount: 2, leftCount: 1, rightCount: 1 };
  if (count === 5) return { backCount: 2, leftCount: 2, rightCount: 1 };
  if (count === 6) return { backCount: 2, leftCount: 2, rightCount: 2 };

  const backCount = Math.max(2, Math.round(count * 0.3));
  const rem = count - backCount;
  const leftCount = Math.ceil(rem / 2);
  const rightCount = rem - leftCount;
  return { backCount, leftCount, rightCount };
}

function computeUZoneDimensions(count: number, boothGap = BOOTH_GAP_M): {
  width: number;
  depth: number;
  backCount: number;
  leftCount: number;
  rightCount: number;
} {
  const { backCount, leftCount, rightCount } = computeUZoneSideCounts(count);
  const sideMax = Math.max(leftCount, rightCount);
  const effectivePitch = MAX_ARCHETYPE_WIDTH_M + boothGap;

  // Compact footprint for very small zones (1..3 booths) so they don't create a giant empty U
  if (sideMax === 0) {
    const backSpan = backCount > 0 ? backCount * effectivePitch - boothGap : MAX_ARCHETYPE_WIDTH_M;
    const width = round2(Math.max(14.0, backSpan + 6.0));
    const depth = round2(15.0);
    return { width, depth, backCount, leftCount, rightCount };
  }

  // Back wall needs enough width so back booths don't collide with left/right wings at corners
  const backSpan = backCount > 0 ? backCount * effectivePitch - boothGap : 0;
  const interiorWidth = Math.max(MIN_U_INTERIOR_WIDTH_M, backSpan + 4.4);
  const width = round2(interiorWidth + BOOTH_EDGE_INSET_M * 2 + 2.0);

  // Depth covers back wall + corner clearance + wing booths + open front apron
  const wingSpan = sideMax > 0 ? sideMax * effectivePitch - boothGap : 0;
  const depth = round2(Math.max(24.0, CORNER_CLEARANCE_M + wingSpan + 6.0));

  return { width, depth, backCount, leftCount, rightCount };
}

/**
 * Computes centered local 1D offsets along a U-side using each booth's ACTUAL measured archetype width
 * plus the configured clear gap (so different model widths never share a naive uniform pitch).
 */
function computeSideCenteredOffsets(widths: number[], gap: number): number[] {
  if (widths.length === 0) return [];
  const totalSpan = widths.reduce((s, w) => s + w, 0) + Math.max(0, widths.length - 1) * gap;
  const offsets: number[] = [];
  let cursor = -totalSpan / 2;
  for (const w of widths) {
    offsets.push(round2(cursor + w / 2));
    cursor += w + gap;
  }
  return offsets;
}

export function getBoothWorldAabb(
  positionX: number,
  positionZ: number,
  rotationY: number,
  archetypeId: V28ArchetypeId,
  padding = 0
): RectBounds {
  const spec = ARCHETYPE_MAP[archetypeId] || ARCHETYPE_MAP.grand_portal;
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  const halfW = (spec.width * cos + spec.depth * sin) / 2 + padding;
  const halfD = (spec.width * sin + spec.depth * cos) / 2 + padding;
  return {
    minX: round2(positionX - halfW),
    maxX: round2(positionX + halfW),
    minZ: round2(positionZ - halfD),
    maxZ: round2(positionZ + halfD),
  };
}

export function rectsOverlap(a: RectBounds, b: RectBounds, epsilon = 0.01): boolean {
  return (
    a.minX < b.maxX - epsilon &&
    a.maxX > b.minX + epsilon &&
    a.minZ < b.maxZ - epsilon &&
    a.maxZ > b.minZ + epsilon
  );
}

export function pointInRect(x: number, z: number, r: RectBounds, margin = 0): boolean {
  return x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
}

function segmentIntersectsRect(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  r: RectBounds
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let t0 = 0;
  let t1 = 1;
  const checks: Array<[number, number]> = [
    [-dx, x1 - r.minX],
    [dx, r.maxX - x1],
    [-dz, z1 - r.minZ],
    [dz, r.maxZ - z1],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

/**
 * Generate a multi-U exhibition world where EACH Category Zone is ONE variable-size U-shaped zone.
 */
export function generateDynamicExhibitionLayout(
  input: LayoutGeneratorInput
): GeneratedExhibitionLayout {
  const explicitZoneCount =
    typeof input.zoneCount === 'number' && Number.isFinite(input.zoneCount) && input.zoneCount >= 1
      ? Math.max(1, Math.min(40, Math.floor(input.zoneCount)))
      : undefined;
  const explicitBoothsPerZone =
    typeof input.boothsPerZone === 'number' && Number.isFinite(input.boothsPerZone) && input.boothsPerZone >= 1
      ? Math.max(1, Math.min(50, Math.floor(input.boothsPerZone)))
      : undefined;

  const computedTotal =
    explicitZoneCount && explicitBoothsPerZone
      ? explicitZoneCount * explicitBoothsPerZone
      : input.targetBoothCount;
  const targetBoothCount = Math.max(1, Math.min(500, Math.floor(computedTotal)));
  const preferredZoneCapacity = Math.max(
    1,
    Math.min(50, Math.floor(explicitBoothsPerZone ?? input.preferredZoneCapacity ?? 10))
  );
  const hallStyle = input.hallStyle ?? 'grand_expo';
  const mainAvenueWidth = Math.max(12.0, input.mainAvenueWidth ?? GRAND_BOULEVARD_WIDTH_M);
  const aisleWidth = Math.max(8.0, input.aisleWidth ?? 10.0);
  const perimeterWidth = Math.max(6.0, input.perimeterWidth ?? 7.0);
  const boothGap = Math.max(1.2, Math.min(4.5, input.boothGap ?? BOOTH_GAP_M));
  const layoutSeed = input.layoutSeed ?? 28;
  const reservedAreas = input.reservedAreas ?? [];
  const categoryZones = input.categoryZones ?? [];

  // 1. Build pending U-Zones list (supports explicit zoneCount x boothsPerZone OR categoryZones OR auto-partition)
  interface PendingUZone {
    code: string;
    categoryId: string | null;
    displayName: string;
    categoryTag: string;
    boothCount: number;
    dims: ReturnType<typeof computeUZoneDimensions>;
  }
  const pendingZones: PendingUZone[] = [];

  if (explicitZoneCount && explicitBoothsPerZone && categoryZones.length === 0) {
    for (let z = 0; z < explicitZoneCount; z++) {
      const code = zoneCodeForIndex(z);
      pendingZones.push({
        code,
        categoryId: null,
        displayName: `Khu ${code}`,
        categoryTag: `Phân khu ${code}`,
        boothCount: explicitBoothsPerZone,
        dims: computeUZoneDimensions(explicitBoothsPerZone, boothGap),
      });
    }
  } else if (categoryZones.length > 0) {
    let zIdx = 0;
    let remaining = targetBoothCount;
    for (const cz of categoryZones) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Math.max(0, Math.floor(cz.boothCount)));
      if (take <= 0) continue;
      remaining -= take;
      const code = zoneCodeForIndex(zIdx++);
      const displayName = cz.categoryName.startsWith('Khu ') ? cz.categoryName : `Khu ${cz.categoryName}`;
      pendingZones.push({
        code,
        categoryId: cz.categoryId,
        displayName,
        categoryTag: cz.categoryName,
        boothCount: take,
        dims: computeUZoneDimensions(take, boothGap),
      });
    }
    if (remaining > 0) {
      const code = zoneCodeForIndex(zIdx++);
      pendingZones.push({
        code,
        categoryId: null,
        displayName: 'Khu Tổng hợp',
        categoryTag: 'Tổng hợp',
        boothCount: remaining,
        dims: computeUZoneDimensions(remaining, boothGap),
      });
    }
  } else {
    // Auto-partition into balanced U-zones when no explicit breakdown is provided
    const zoneCount =
      explicitZoneCount ??
      (targetBoothCount <= 6 ? 1 : Math.max(2, Math.ceil(targetBoothCount / preferredZoneCapacity)));
    const base = Math.floor(targetBoothCount / zoneCount);
    let rem = targetBoothCount % zoneCount;
    for (let z = 0; z < zoneCount; z++) {
      const take = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      const code = zoneCodeForIndex(z);
      pendingZones.push({
        code,
        categoryId: null,
        displayName: `Khu ${code}`,
        categoryTag: `Phân khu ${code}`,
        boothCount: take,
        dims: computeUZoneDimensions(take, boothGap),
      });
    }
  }

  // 2. Arrange U-Zones into TWO FACING ROWS (Left Column opening East +X, Right Column opening West -X)
  //    flanking ONE wide Central Main Avenue running North-South along x = 0!
  //    Special case: 1 zone -> single centered U-zone opening South toward Spawn.
  const numZones = pendingZones.length;
  const isSingleZone = numZones === 1;
  const leftColZones: PendingUZone[] = [];
  const rightColZones: PendingUZone[] = [];

  if (!isSingleZone) {
    const leftColCount = Math.ceil(numZones / 2);
    for (let i = 0; i < leftColCount; i++) leftColZones.push(pendingZones[i]);
    for (let i = leftColCount; i < numZones; i++) rightColZones.push(pendingZones[i]);
  }

  // For East/West facing U-zones:
  //   X extent = dims.depth (from outer back wall to open mouth at ±mainAvenueWidth/2)
  //   Z extent = dims.width (between North & South wings)
  const leftColMaxXDepth = leftColZones.reduce((m, z) => Math.max(m, z.dims.depth), 0);
  const rightColMaxXDepth = rightColZones.reduce((m, z) => Math.max(m, z.dims.depth), 0);
  const leftColTotalZ =
    leftColZones.reduce((s, z) => s + z.dims.width, 0) + Math.max(0, leftColZones.length - 1) * ZONE_GAP_X_M;
  const rightColTotalZ =
    rightColZones.reduce((s, z) => s + z.dims.width, 0) + Math.max(0, rightColZones.length - 1) * ZONE_GAP_X_M;

  // Special V27.5 Heritage Parity Mode: 1 zone x 6 booths matches V27.5's balanced centered U-hall (scaled 1.25x for larger booths)
  const isV27SixBoothParity = isSingleZone && targetBoothCount === 6 && pendingZones.length === 1;

  const maxHalfX = isV27SixBoothParity
    ? 32.0 - perimeterWidth
    : isSingleZone
      ? pendingZones[0].dims.width / 2
      : Math.max(mainAvenueWidth / 2 + leftColMaxXDepth, mainAvenueWidth / 2 + rightColMaxXDepth);
  const halfHallWidth = isV27SixBoothParity
    ? 32.0
    : round2(Math.max(maxHalfX + perimeterWidth, mainAvenueWidth / 2 + 12.0));
  const hallWidth = round2(halfHallWidth * 2);

  const zonesSpanZ = isV27SixBoothParity
    ? 38.75
    : isSingleZone
      ? pendingZones[0].dims.depth
      : Math.max(leftColTotalZ, rightColTotalZ);
  const totalDepth = isV27SixBoothParity
    ? 57.5
    : round2(perimeterWidth + zonesSpanZ + WELCOME_AREA_DEPTH + perimeterWidth);
  const halfHallDepth = round2(totalDepth / 2);

  const hallBounds: RectBounds = {
    minX: -halfHallWidth,
    maxX: halfHallWidth,
    minZ: -halfHallDepth,
    maxZ: halfHallDepth,
  };
  const walkableBounds: RectBounds = {
    minX: round2(hallBounds.minX + 1.5),
    maxX: round2(hallBounds.maxX - 1.5),
    minZ: round2(hallBounds.minZ + 1.5),
    maxZ: round2(hallBounds.maxZ - 1.5),
  };

  const zonesStartZ = isV27SixBoothParity ? -25.0 : round2(hallBounds.minZ + perimeterWidth);
  const zonesEndZ = isV27SixBoothParity ? 13.75 : round2(zonesStartZ + zonesSpanZ);

  // Central Main Avenue running North-South right down the middle (x = 0) between Left & Right U-columns!
  const centralAvenueBounds: RectBounds = {
    minX: round2(-(isV27SixBoothParity ? 6.4 : mainAvenueWidth / 2)),
    maxX: round2(isV27SixBoothParity ? 6.4 : mainAvenueWidth / 2),
    minZ: isV27SixBoothParity ? -13.75 : isSingleZone ? zonesEndZ : zonesStartZ,
    maxZ: hallBounds.maxZ,
  };

  const welcomeAreaBounds: RectBounds = isV27SixBoothParity
    ? {
        minX: -27.5,
        maxX: 27.5,
        minZ: 13.75,
        maxZ: 26.25,
      }
    : {
        minX: round2(hallBounds.minX + perimeterWidth),
        maxX: round2(hallBounds.maxX - perimeterWidth),
        minZ: zonesEndZ,
        maxZ: round2(hallBounds.maxZ - perimeterWidth),
      };

  const spawnPoint = isV27SixBoothParity
    ? { x: 0, z: 19.0, rotationY: Math.PI }
    : {
        x: 0,
        z: round2(hallBounds.maxZ - perimeterWidth - 4.0),
        rotationY: Math.PI,
      };
  const directoryPoint = isV27SixBoothParity
    ? { x: 11.5, z: 20.0 }
    : {
        x: round2(-mainAvenueWidth / 2 - 2.4),
        z: round2(zonesEndZ + WELCOME_AREA_DEPTH * 0.48),
      };

  // 3. Place all U-Zones & their booths along the 3 sides facing INWARD!
  const clusters: GeneratedClusterSpec[] = [];
  const zones: GeneratedZoneSpec[] = [];
  const placements: GeneratedBoothPlacement[] = [];
  const nodes: WalkwayNode[] = [];
  const edges: Array<[string, string]> = [];

  const spawnNodeId = 'walk-spawn';
  nodes.push({ id: spawnNodeId, x: spawnPoint.x, z: spawnPoint.z, kind: 'spawn' });
  let prevSpineNodeId = spawnNodeId;

  const placeOneUZone = (
    pz: PendingUZone,
    uIndex: number,
    centerX: number,
    centerZ: number,
    openingDirection: 'south' | 'north' | 'east' | 'west'
  ) => {
    const { width, depth, backCount, leftCount, rightCount } = pz.dims;
    const isHorizontalU = openingDirection === 'east' || openingDirection === 'west';
    const worldSpanX = isHorizontalU ? depth : width;
    const worldSpanZ = isHorizontalU ? width : depth;

    const clusterId = `u-zone-${String(uIndex + 1).padStart(2, '0')}`;
    const variationSeed = (uIndex * 41 + layoutSeed) % 997;
    const centerpieceKind = CENTERPIECE_VARIANTS[(uIndex + layoutSeed) % CENTERPIECE_VARIANTS.length];

    clusters.push({
      clusterId,
      clusterIndex: uIndex,
      zoneCode: pz.code,
      zoneName: pz.displayName,
      categoryId: pz.categoryId,
      centerX,
      centerZ,
      width: worldSpanX,
      depth: worldSpanZ,
      boothCount: pz.boothCount,
      openingDirection,
      backCount,
      leftCount,
      rightCount,
      variationSeed,
      centerpieceKind,
    });

    zones.push({
      code: pz.code,
      categoryId: pz.categoryId,
      displayName: pz.displayName,
      categoryTag: pz.categoryTag,
      bounds: {
        minX: round2(centerX - worldSpanX / 2),
        maxX: round2(centerX + worldSpanX / 2),
        minZ: round2(centerZ - worldSpanZ / 2),
        maxZ: round2(centerZ + worldSpanZ / 2),
      },
      sortOrder: uIndex + 1,
      boothCount: pz.boothCount,
      clusterCount: 1,
      openingDirection,
    });

    // Connect Central Main Avenue Spine -> U-Zone Courtyard Center
    const spineNodeId = `walk-spine-${clusterId}`;
    const centerNodeId = `walk-center-${clusterId}`;
    nodes.push({ id: spineNodeId, x: 0, z: isHorizontalU ? centerZ : zonesEndZ + 2.0, kind: 'avenue' });
    nodes.push({ id: centerNodeId, x: centerX, z: centerZ, kind: 'cluster_center' });
    edges.push([prevSpineNodeId, spineNodeId]);
    edges.push([spineNodeId, centerNodeId]);
    prevSpineNodeId = spineNodeId;

    const addBooth = (bx: number, bz: number, rotY: number) => {
      const slotIndex = placements.length;
      const arch = V28_ARCHETYPES[(slotIndex + layoutSeed) % V28_ARCHETYPES.length];
      const fx = Math.sin(rotY);
      const fz = Math.cos(rotY);
      const approachPoint = {
        x: round2(bx + fx * (arch.depth / 2 + APPROACH_OFFSET_M)),
        z: round2(bz + fz * (arch.depth / 2 + APPROACH_OFFSET_M)),
      };
      const focusCameraPoint = {
        x: round2(bx + fx * (arch.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
        z: round2(bz + fz * (arch.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
      };
      placements.push({
        slotIndex,
        clusterId,
        clusterIndex: uIndex,
        zoneCode: pz.code,
        categoryId: pz.categoryId,
        positionX: round2(bx),
        positionZ: round2(bz),
        rotationY: rotY,
        archetypeId: arch.id,
        footprintWidth: arch.width,
        footprintDepth: arch.depth,
        approachPoint,
        focusCameraPoint,
      });

      const appId = `walk-approach-${slotIndex}`;
      nodes.push({ id: appId, x: approachPoint.x, z: approachPoint.z, kind: 'approach', boothSlotIndex: slotIndex });
      edges.push([centerNodeId, appId]);
    };

    const peekArch = (offsetIdx: number) =>
      V28_ARCHETYPES[(placements.length + offsetIdx + layoutSeed) % V28_ARCHETYPES.length];

    if (isV27SixBoothParity && !isHorizontalU && pz.boothCount === 6) {
      // Exact V27.5 centered 6-booth U-hall symmetry scaled 1.25x for larger V28 booths
      addBooth(-8.25, -21.0, 0);
      addBooth(8.25, -21.0, 0);
      addBooth(-19.5, -8.0, Number((Math.PI / 2).toFixed(4)));
      addBooth(-19.5, 7.5, Number((Math.PI / 2).toFixed(4)));
      addBooth(19.5, -8.0, Number((-Math.PI / 2).toFixed(4)));
      addBooth(19.5, 7.5, Number((-Math.PI / 2).toFixed(4)));
    } else if (!isHorizontalU) {
      // Single-zone South-opening U (exact V27.5 orientation!)
      const dirSign = openingDirection === 'south' ? 1 : -1;
      const backZ = centerZ - dirSign * (depth / 2 - BOOTH_EDGE_INSET_M);
      const backRotY = openingDirection === 'south' ? 0 : Number(Math.PI.toFixed(4));
      const backWidths = Array.from({ length: backCount }, (_, i) => peekArch(i).width);
      const backOffsets = computeSideCenteredOffsets(backWidths, boothGap);
      for (let i = 0; i < backCount; i++) addBooth(centerX + backOffsets[i], backZ, backRotY);

      const leftX = centerX - (width / 2 - BOOTH_EDGE_INSET_M);
      const leftRotY = Number((Math.PI / 2).toFixed(4));
      const leftWidths = Array.from({ length: leftCount }, (_, i) => peekArch(i).width);
      const leftSpan = leftWidths.reduce((s, w) => s + w, 0) + Math.max(0, leftCount - 1) * boothGap;
      const leftOffsets = computeSideCenteredOffsets(leftWidths, boothGap);
      const leftCenterZ = centerZ - dirSign * (depth / 2 - CORNER_CLEARANCE_M - leftSpan / 2);
      for (let i = 0; i < leftCount; i++) addBooth(leftX, leftCenterZ + dirSign * leftOffsets[i], leftRotY);

      const rightX = centerX + (width / 2 - BOOTH_EDGE_INSET_M);
      const rightRotY = Number((-Math.PI / 2).toFixed(4));
      const rightWidths = Array.from({ length: rightCount }, (_, i) => peekArch(i).width);
      const rightSpan = rightWidths.reduce((s, w) => s + w, 0) + Math.max(0, rightCount - 1) * boothGap;
      const rightOffsets = computeSideCenteredOffsets(rightWidths, boothGap);
      const rightCenterZ = centerZ - dirSign * (depth / 2 - CORNER_CLEARANCE_M - rightSpan / 2);
      for (let i = 0; i < rightCount; i++) addBooth(rightX, rightCenterZ + dirSign * rightOffsets[i], rightRotY);
    } else {
      // Facing Left ('east', opens +X) or Right ('west', opens -X) U-Zone!
      const dirSign = openingDirection === 'east' ? 1 : -1;
      // 1. Back wall (aligned along Z, facing INWARD +X for east-opening or -X for west-opening)
      const backX = centerX - dirSign * (depth / 2 - BOOTH_EDGE_INSET_M);
      const backRotY = Number(((dirSign * Math.PI) / 2).toFixed(4));
      const backWidths = Array.from({ length: backCount }, (_, i) => peekArch(i).width);
      const backOffsets = computeSideCenteredOffsets(backWidths, boothGap);
      for (let i = 0; i < backCount; i++) {
        addBooth(backX, centerZ + backOffsets[i], backRotY);
      }

      // 2. North wing (top of U, aligned along X, facing South +Z into courtyard)
      const northZ = centerZ - (width / 2 - BOOTH_EDGE_INSET_M);
      const northRotY = 0;
      const northWidths = Array.from({ length: leftCount }, (_, i) => peekArch(i).width);
      const northSpan = northWidths.reduce((s, w) => s + w, 0) + Math.max(0, leftCount - 1) * boothGap;
      const northOffsets = computeSideCenteredOffsets(northWidths, boothGap);
      const wingCenterX = centerX - dirSign * (depth / 2 - CORNER_CLEARANCE_M - northSpan / 2);
      for (let i = 0; i < leftCount; i++) {
        addBooth(wingCenterX + dirSign * northOffsets[i], northZ, northRotY);
      }

      // 3. South wing (bottom of U, aligned along X, facing North -Z into courtyard)
      const southZ = centerZ + (width / 2 - BOOTH_EDGE_INSET_M);
      const southRotY = Number(Math.PI.toFixed(4));
      const southWidths = Array.from({ length: rightCount }, (_, i) => peekArch(i).width);
      const southSpan = southWidths.reduce((s, w) => s + w, 0) + Math.max(0, rightCount - 1) * boothGap;
      const southOffsets = computeSideCenteredOffsets(southWidths, boothGap);
      const southWingCenterX = centerX - dirSign * (depth / 2 - CORNER_CLEARANCE_M - southSpan / 2);
      for (let i = 0; i < rightCount; i++) {
        addBooth(southWingCenterX + dirSign * southOffsets[i], southZ, southRotY);
      }
    }
  };

  // Place zones cleanly: either single centered zone OR 2 facing columns (Left East-opening, Right West-opening)
  let runningIdx = 0;
  if (isV27SixBoothParity) {
    const z0 = {
      ...pendingZones[0],
      dims: { ...pendingZones[0].dims, width: 47.5, depth: 38.75 },
    };
    placeOneUZone(z0, runningIdx++, 0, -5.62, 'south');
  } else if (isSingleZone) {
    const z0 = pendingZones[0];
    placeOneUZone(z0, runningIdx++, 0, round2(zonesStartZ + z0.dims.depth / 2), 'south');
  } else {
    // Left Column (West of Central Avenue, opening East +X onto x = -mainAvenueWidth/2)
    let curZ = round2(zonesStartZ + (zonesSpanZ - leftColTotalZ) / 2);
    for (const z of leftColZones) {
      const cx = round2(-mainAvenueWidth / 2 - z.dims.depth / 2);
      const cz = round2(curZ + z.dims.width / 2);
      placeOneUZone(z, runningIdx++, cx, cz, 'east');
      curZ += z.dims.width + ZONE_GAP_X_M;
    }

    // Right Column (East of Central Avenue, opening West -X onto x = +mainAvenueWidth/2)
    // Reset spine chain from Spawn so Right Column links cleanly along Central Avenue too!
    prevSpineNodeId = spawnNodeId;
    curZ = round2(zonesStartZ + (zonesSpanZ - rightColTotalZ) / 2);
    for (const z of rightColZones) {
      const cx = round2(mainAvenueWidth / 2 + z.dims.depth / 2);
      const cz = round2(curZ + z.dims.width / 2);
      placeOneUZone(z, runningIdx++, cx, cz, 'west');
      curZ += z.dims.width + ZONE_GAP_X_M;
    }
  }

  // 4. Build Adaptive Walkable Regions (Central Main Avenue + Welcome Area + U-Zone Courtyards/Mouths + Inter-Zone Walkways)
  const walkableRegions: RectBounds[] = [];

  // 4a. Central Main Avenue (North-South spine down x = 0)
  walkableRegions.push({
    minX: round2(-mainAvenueWidth / 2 - 1.5),
    maxX: round2(mainAvenueWidth / 2 + 1.5),
    minZ: round2(isSingleZone ? zonesEndZ - 1.5 : zonesStartZ),
    maxZ: round2(hallBounds.maxZ - 2.0),
  });

  // 4b. Welcome Area apron around Spawn
  walkableRegions.push({
    minX: round2(Math.max(walkableBounds.minX, -mainAvenueWidth / 2 - 12.0)),
    maxX: round2(Math.min(walkableBounds.maxX, mainAvenueWidth / 2 + 12.0)),
    minZ: round2(zonesEndZ - 1.0),
    maxZ: round2(hallBounds.maxZ - 2.0),
  });

  // 4c. Each U-Zone's Courtyard & Open Entrance Threshold
  for (const z of zones) {
    if (z.openingDirection === 'east') {
      walkableRegions.push({
        minX: round2(z.bounds.minX + 0.8),
        maxX: round2(z.bounds.maxX + 1.8),
        minZ: round2(z.bounds.minZ + 0.8),
        maxZ: round2(z.bounds.maxZ - 0.8),
      });
    } else if (z.openingDirection === 'west') {
      walkableRegions.push({
        minX: round2(z.bounds.minX - 1.8),
        maxX: round2(z.bounds.maxX - 0.8),
        minZ: round2(z.bounds.minZ + 0.8),
        maxZ: round2(z.bounds.maxZ - 0.8),
      });
    } else {
      walkableRegions.push({
        minX: round2(z.bounds.minX + 0.8),
        maxX: round2(z.bounds.maxX - 0.8),
        minZ: round2(z.openingDirection === 'south' ? z.bounds.minZ + 0.8 : z.bounds.minZ - 1.8),
        maxZ: round2(z.openingDirection === 'south' ? z.bounds.maxZ + 1.8 : z.bounds.maxZ - 0.8),
      });
    }
  }

  // 4d. Inter-U-Zone Walkways between consecutive U-zones in the same column
  const addColInterWalkways = (colZones: GeneratedZoneSpec[]) => {
    const sorted = [...colZones].sort((a, b) => a.bounds.minZ - b.bounds.minZ);
    for (let i = 0; i < sorted.length - 1; i++) {
      const top = sorted[i];
      const bot = sorted[i + 1];
      if (bot.bounds.minZ > top.bounds.maxZ) {
        walkableRegions.push({
          minX: round2(Math.max(top.bounds.minX, bot.bounds.minX)),
          maxX: round2(Math.min(top.bounds.maxX, bot.bounds.maxX)),
          minZ: round2(top.bounds.maxZ - 0.5),
          maxZ: round2(bot.bounds.minZ + 0.5),
        });
      }
    }
  };
  addColInterWalkways(zones.filter((z) => z.openingDirection === 'east'));
  addColInterWalkways(zones.filter((z) => z.openingDirection === 'west'));

  const radius = round2(Math.hypot(halfHallWidth, halfHallDepth));
  const cameraOverviewBounds = {
    centerX: 0,
    centerZ: 0,
    radius,
    recommendedHeight: round2(Math.max(26, radius * 0.78)),
    recommendedDistance: round2(Math.max(34, radius * 1.05)),
  };

  const eaveHeight = hallWidth > 160 ? 16.0 : hallWidth > 100 ? 13.0 : 10.5;
  const roofRise = round2(Math.min(24, Math.max(7.0, hallWidth * 0.1)));
  const ribSpacing = totalDepth > 140 ? 14.0 : 12.0;

  return {
    config: {
      targetBoothCount,
      zoneCount: explicitZoneCount,
      boothsPerZone: explicitBoothsPerZone,
      preferredZoneCapacity,
      hallStyle,
      mainAvenueWidth,
      aisleWidth,
      perimeterWidth,
      boothGap,
      layoutSeed,
      categoryZones,
      reservedAreas,
    },
    hallWidth,
    hallDepth: totalDepth,
    hallBounds,
    walkableBounds,
    walkableRegions,
    centralAvenueBounds,
    welcomeAreaBounds,
    spawnPoint,
    directoryPoint,
    clusters,
    zones,
    placements,
    walkwayGraph: { nodes, edges },
    cameraOverviewBounds,
    roofBounds: {
      hallWidth,
      hallDepth: totalDepth,
      bounds: hallBounds,
      eaveHeight,
      roofRise,
      ribSpacing,
      skylightRatio: 0.3,
    },
  };
}

export function validateExhibitionLayout(
  layout: Pick<
    GeneratedExhibitionLayout,
    'hallBounds' | 'centralAvenueBounds' | 'welcomeAreaBounds' | 'placements' | 'walkwayGraph' | 'zones'
  > & { clusters?: GeneratedClusterSpec[] }
): LayoutValidationResult {
  const errors: string[] = [];
  let overlapCount = 0;
  let outOfBoundsCount = 0;
  let blockedWalkwayCount = 0;
  let focusClipCount = 0;

  const aabbs = layout.placements.map((p) =>
    getBoothWorldAabb(p.positionX, p.positionZ, p.rotationY, p.archetypeId, 0.2)
  );
  const strictAabbs = layout.placements.map((p) =>
    getBoothWorldAabb(p.positionX, p.positionZ, p.rotationY, p.archetypeId, 0)
  );

  for (let i = 0; i < layout.placements.length; i++) {
    const p = layout.placements[i];
    const box = strictAabbs[i];
    if (
      box.minX < layout.hallBounds.minX + 1.0 ||
      box.maxX > layout.hallBounds.maxX - 1.0 ||
      box.minZ < layout.hallBounds.minZ + 1.0 ||
      box.maxZ > layout.hallBounds.maxZ - 1.0
    ) {
      outOfBoundsCount++;
      errors.push(`Booth #${p.slotIndex} nằm ngoài giới hạn khuôn viên.`);
    }
    if (rectsOverlap(box, layout.centralAvenueBounds)) {
      blockedWalkwayCount++;
      errors.push(`Booth #${p.slotIndex} lấn vào đại lộ trung tâm.`);
    }
    if (rectsOverlap(box, layout.welcomeAreaBounds)) {
      blockedWalkwayCount++;
      errors.push(`Booth #${p.slotIndex} lấn vào khu vực đón tiếp (Welcome Area).`);
    }
  }

  for (let i = 0; i < layout.placements.length; i++) {
    for (let j = i + 1; j < layout.placements.length; j++) {
      if (rectsOverlap(aabbs[i], aabbs[j])) {
        overlapCount++;
        errors.push(`Booth #${layout.placements[i].slotIndex} và Booth #${layout.placements[j].slotIndex} bị chồng lấn.`);
      }
    }
    const fp = layout.placements[i].focusCameraPoint;
    for (let j = 0; j < layout.placements.length; j++) {
      if (i === j) continue;
      if (pointInRect(fp.x, fp.z, aabbs[j])) {
        focusClipCount++;
        errors.push(`Camera Focus của Booth #${layout.placements[i].slotIndex} xuyên vào Booth #${layout.placements[j].slotIndex}.`);
      }
    }
  }

  const nodeMap = new Map<string, WalkwayNode>();
  for (const n of layout.walkwayGraph.nodes) nodeMap.set(n.id, n);

  const adj = new Map<string, string[]>();
  for (const [u, v] of layout.walkwayGraph.edges) {
    const nu = nodeMap.get(u);
    const nv = nodeMap.get(v);
    if (!nu || !nv) continue;
    let blocked = false;
    for (const box of strictAabbs) {
      if (segmentIntersectsRect(nu.x, nu.z, nv.x, nv.z, box)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  }

  const visited = new Set<string>();
  const spawnNode = layout.walkwayGraph.nodes.find((n) => n.kind === 'spawn');
  if (spawnNode) {
    const queue: string[] = [spawnNode.id];
    visited.add(spawnNode.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nxt of adj.get(cur) || []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
  }

  let unreachableBoothCount = 0;
  for (const p of layout.placements) {
    const approachNode = layout.walkwayGraph.nodes.find((n) => n.boothSlotIndex === p.slotIndex);
    if (!approachNode || !visited.has(approachNode.id)) {
      unreachableBoothCount++;
      errors.push(`Booth #${p.slotIndex} không có đường đi kết nối từ cổng chính.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      boothCount: layout.placements.length,
      zoneCount: layout.zones.length,
      clusterCount: layout.clusters?.length ?? layout.zones.length,
      overlapCount,
      outOfBoundsCount,
      blockedWalkwayCount,
      unreachableBoothCount,
      focusClipCount,
    },
  };
}
