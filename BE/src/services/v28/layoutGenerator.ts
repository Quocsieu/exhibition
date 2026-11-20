/**
 * GRAND EXPO WORLD V28 — DYNAMIC LAYOUT GENERATOR
 *
 * Pure, deterministic, mathematically verified exhibition hall & booth layout generator.
 * Uses real measured bounding-box footprints of the 6 V27.4 GLB archetypes:
 *   - signature_ring  (living):   9.39m x 6.91m x 4.02m
 *   - organic_flow    (design):   6.72m x 5.19m x 3.82m
 *   - grand_portal    (tech):     6.72m x 5.19m x 3.80m
 *   - wave_pavilion   (energy):   6.72m x 6.63m x 5.68m
 *   - gallery_arch    (coffee):   6.72m x 5.19m x 3.78m
 *   - dynamic_frame   (robotics): 6.87m x 5.19m x 4.23m
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
  width: number; // local X width (m)
  depth: number; // local Z depth (m)
  height: number; // local Y height (m)
}

export const V28_ARCHETYPES: readonly ArchetypeFootprintSpec[] = [
  {
    id: 'signature_ring',
    theme: 'living',
    label: 'Signature Ring',
    glbPath: 'models/booths/v27_4/booth_01_signature_ring_v27_4.glb',
    width: 9.4,
    depth: 6.95,
    height: 4.05,
  },
  {
    id: 'organic_flow',
    theme: 'design',
    label: 'Organic Flow',
    glbPath: 'models/booths/v27_4/booth_02_organic_flow_v27_4.glb',
    width: 6.75,
    depth: 5.2,
    height: 3.85,
  },
  {
    id: 'grand_portal',
    theme: 'tech',
    label: 'Grand Portal',
    glbPath: 'models/booths/v27_4/booth_03_grand_portal_v27_4.glb',
    width: 6.75,
    depth: 5.2,
    height: 3.85,
  },
  {
    id: 'wave_pavilion',
    theme: 'energy',
    label: 'Wave Pavilion',
    glbPath: 'models/booths/v27_4/booth_04_wave_pavilion_v27_4.glb',
    width: 6.75,
    depth: 6.65,
    height: 5.7,
  },
  {
    id: 'gallery_arch',
    theme: 'coffee',
    label: 'Gallery Arch',
    glbPath: 'models/booths/v27_4/booth_05_gallery_arch_v27_4.glb',
    width: 6.75,
    depth: 5.2,
    height: 3.8,
  },
  {
    id: 'dynamic_frame',
    theme: 'robotics',
    label: 'Dynamic Frame',
    glbPath: 'models/booths/v27_4/booth_06_dynamic_frame_v27_4.glb',
    width: 6.9,
    depth: 5.2,
    height: 4.25,
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

export interface LayoutGeneratorInput {
  targetBoothCount: number;
  preferredZoneCapacity?: number; // default 10
  hallStyle?: 'grand_expo' | 'modular_pavilion';
  mainAvenueWidth?: number; // default 10.0m
  aisleWidth?: number; // default 8.4m (focus clearance guaranteed)
  perimeterWidth?: number; // default 6.0m
  layoutSeed?: number;
  reservedAreas?: Array<{ id: string; label: string; bounds: RectBounds }>;
}

export interface GeneratedZoneSpec {
  code: string; // A, B, C...
  displayName: string; // Khu A, Khu B...
  categoryTag: string;
  bounds: RectBounds;
  sortOrder: number;
  boothCount: number;
}

export interface GeneratedBoothPlacement {
  slotIndex: number;
  zoneCode: string;
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
  kind: 'spawn' | 'avenue' | 'aisle' | 'perimeter' | 'approach';
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
  config: Required<Omit<LayoutGeneratorInput, 'reservedAreas'>> & {
    reservedAreas: Array<{ id: string; label: string; bounds: RectBounds }>;
  };
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
  centralAvenueBounds: RectBounds;
  welcomeAreaBounds: RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
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
    overlapCount: number;
    outOfBoundsCount: number;
    blockedWalkwayCount: number;
    unreachableBoothCount: number;
    focusClipCount: number;
  };
}

// Unified structural constants derived from real GLB footprints
const MAX_ARCHETYPE_WIDTH = Math.max(...V28_ARCHETYPES.map((a) => a.width)); // 9.4m
const MAX_ARCHETYPE_DEPTH = Math.max(...V28_ARCHETYPES.map((a) => a.depth)); // 6.95m
export const BOOTH_CLEARANCE_X = 2.0; // gap between adjacent booths in same row
export const BOOTH_CLEARANCE_BACK = 3.2; // service/cross aisle between back-to-back rows
export const CELL_WIDTH = Number((MAX_ARCHETYPE_WIDTH + 0.6).toFixed(2)); // 10.0m envelope
export const CELL_DEPTH = Number((MAX_ARCHETYPE_DEPTH + 0.45).toFixed(2)); // 7.4m envelope
export const PITCH_X = Number((CELL_WIDTH + BOOTH_CLEARANCE_X).toFixed(2)); // 12.0m
export const WELCOME_AREA_DEPTH = 14.0; // unobstructed South welcome & check-in plaza
export const APPROACH_OFFSET_M = 2.2; // visitor standing distance in front of booth face
export const FOCUS_CAMERA_OFFSET_M = 4.2; // camera focus distance in front of booth face

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function zoneCodeForIndex(index: number): string {
  // 0..25 -> A..Z, 26+ -> AA, AB...
  let n = index;
  let code = '';
  do {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

/**
 * Compute world-space AABB for a booth placement taking rotationY into account.
 */
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
  // Liang-Barsky line-rectangle intersection test
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
 * Determine optimal number of booths per wing-row (columns per side of central avenue)
 * so the hall keeps a balanced architectural aspect ratio across 6..200+ booths.
 */
function computeColumnsPerWing(targetBoothCount: number): number {
  if (targetBoothCount <= 6) return 2;
  if (targetBoothCount <= 12) return 2;
  if (targetBoothCount <= 24) return 3;
  if (targetBoothCount <= 48) return 4;
  if (targetBoothCount <= 80) return 5;
  if (targetBoothCount <= 120) return 5;
  return 6;
}

export function generateDynamicExhibitionLayout(
  input: LayoutGeneratorInput
): GeneratedExhibitionLayout {
  const targetBoothCount = Math.max(1, Math.min(500, Math.floor(input.targetBoothCount)));
  const preferredZoneCapacity = Math.max(4, Math.min(50, Math.floor(input.preferredZoneCapacity ?? 10)));
  const hallStyle = input.hallStyle ?? 'grand_expo';
  const mainAvenueWidth = Math.max(8.0, input.mainAvenueWidth ?? 10.0);
  const aisleWidth = Math.max(7.6, input.aisleWidth ?? 8.4);
  const perimeterWidth = Math.max(5.0, input.perimeterWidth ?? 6.0);
  const layoutSeed = input.layoutSeed ?? 28;
  const reservedAreas = input.reservedAreas ?? [];

  const colsPerWing = computeColumnsPerWing(targetBoothCount);
  const boothsPerRow = colsPerWing * 2; // West wing + East wing
  const boothsPerCorridorStrip = boothsPerRow * 2; // North row facing +Z, South row facing -Z
  const numCorridorStrips = Math.ceil(targetBoothCount / boothsPerCorridorStrip);

  // Corridor strip Z geometry:
  // Inside each strip:
  //   northRowCenterZ = stripTopZ + CELL_DEPTH / 2        (faces +Z into aisle, rotY = 0)
  //   aisleCenterZ    = stripTopZ + CELL_DEPTH + aisleWidth / 2
  //   southRowCenterZ = stripTopZ + CELL_DEPTH + aisleWidth + CELL_DEPTH / 2 (faces -Z into aisle, rotY = PI)
  //   stripHeight     = 2 * CELL_DEPTH + aisleWidth
  const stripHeight = round2(2 * CELL_DEPTH + aisleWidth);
  const stripPitchZ = round2(stripHeight + BOOTH_CLEARANCE_BACK);

  const halfWingSpanX = round2(colsPerWing * PITCH_X);
  const halfHallWidth = round2(mainAvenueWidth / 2 + halfWingSpanX + perimeterWidth);
  const hallWidth = round2(halfHallWidth * 2);

  // Total Z span from North wall to South wall
  const boothsTotalDepthZ = round2(
    numCorridorStrips * stripHeight + Math.max(0, numCorridorStrips - 1) * BOOTH_CLEARANCE_BACK
  );
  const hallDepth = round2(perimeterWidth + boothsTotalDepthZ + WELCOME_AREA_DEPTH + perimeterWidth);
  const halfHallDepth = round2(hallDepth / 2);

  const hallBounds: RectBounds = {
    minX: -halfHallWidth,
    maxX: halfHallWidth,
    minZ: -halfHallDepth,
    maxZ: halfHallDepth,
  };

  const walkableBounds: RectBounds = {
    minX: round2(hallBounds.minX + 1.2),
    maxX: round2(hallBounds.maxX - 1.2),
    minZ: round2(hallBounds.minZ + 1.2),
    maxZ: round2(hallBounds.maxZ - 1.2),
  };

  const centralAvenueBounds: RectBounds = {
    minX: round2(-mainAvenueWidth / 2),
    maxX: round2(mainAvenueWidth / 2),
    minZ: hallBounds.minZ,
    maxZ: hallBounds.maxZ,
  };

  const firstStripTopZ = round2(hallBounds.minZ + perimeterWidth);
  const boothsEndZ = round2(firstStripTopZ + boothsTotalDepthZ);

  const welcomeAreaBounds: RectBounds = {
    minX: round2(hallBounds.minX + perimeterWidth),
    maxX: round2(hallBounds.maxX - perimeterWidth),
    minZ: boothsEndZ,
    maxZ: round2(hallBounds.maxZ - perimeterWidth),
  };

  const spawnPoint = {
    x: 0,
    z: round2(hallBounds.maxZ - perimeterWidth - 3.5),
    rotationY: Math.PI, // facing North (-Z) straight down Central Avenue
  };

  const directoryPoint = {
    x: round2(-mainAvenueWidth / 2 - 2.4),
    z: round2(boothsEndZ + WELCOME_AREA_DEPTH * 0.45),
  };

  // Generate booth slots in corridor-by-corridor order
  const placements: GeneratedBoothPlacement[] = [];
  const aisleCenterZs: number[] = [];

  for (let stripIdx = 0; stripIdx < numCorridorStrips; stripIdx++) {
    const stripTopZ = round2(firstStripTopZ + stripIdx * stripPitchZ);
    const northRowZ = round2(stripTopZ + CELL_DEPTH / 2);
    const aisleCenterZ = round2(stripTopZ + CELL_DEPTH + aisleWidth / 2);
    const southRowZ = round2(stripTopZ + CELL_DEPTH + aisleWidth + CELL_DEPTH / 2);
    aisleCenterZs.push(aisleCenterZ);

    // Order within strip: North-West, North-East, South-West, South-East
    const rowSpecs: Array<{ z: number; rotY: number }> = [
      { z: northRowZ, rotY: 0 }, // faces +Z (toward aisle)
      { z: southRowZ, rotY: Number(Math.PI.toFixed(4)) }, // faces -Z (toward aisle)
    ];

    for (const row of rowSpecs) {
      // West wing (closest to central avenue first, going outward)
      for (let col = 0; col < colsPerWing; col++) {
        if (placements.length >= targetBoothCount) break;
        const px = round2(-(mainAvenueWidth / 2 + BOOTH_CLEARANCE_X / 2 + CELL_WIDTH / 2 + col * PITCH_X));
        placements.push(makePlacement(placements.length, px, row.z, row.rotY, preferredZoneCapacity, layoutSeed));
      }
      // East wing (closest to central avenue first, going outward)
      for (let col = 0; col < colsPerWing; col++) {
        if (placements.length >= targetBoothCount) break;
        const px = round2(mainAvenueWidth / 2 + BOOTH_CLEARANCE_X / 2 + CELL_WIDTH / 2 + col * PITCH_X);
        placements.push(makePlacement(placements.length, px, row.z, row.rotY, preferredZoneCapacity, layoutSeed));
      }
    }
  }

  // Build Zone summaries with exact bounding boxes enclosing each zone's booths
  const zoneCount = Math.ceil(targetBoothCount / preferredZoneCapacity);
  const zones: GeneratedZoneSpec[] = [];
  for (let zIdx = 0; zIdx < zoneCount; zIdx++) {
    const code = zoneCodeForIndex(zIdx);
    const zoneBooths = placements.filter((p) => p.zoneCode === code);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of zoneBooths) {
      const aabb = getBoothWorldAabb(b.positionX, b.positionZ, b.rotationY, b.archetypeId, 1.0);
      minX = Math.min(minX, aabb.minX);
      maxX = Math.max(maxX, aabb.maxX);
      minZ = Math.min(minZ, aabb.minZ);
      maxZ = Math.max(maxZ, aabb.maxZ);
    }
    zones.push({
      code,
      displayName: `Khu ${code}`,
      categoryTag: zIdx === 0 ? 'Tổng hợp' : `Phân khu ${code}`,
      bounds: {
        minX: round2(minX),
        maxX: round2(maxX),
        minZ: round2(minZ),
        maxZ: round2(maxZ),
      },
      sortOrder: zIdx + 1,
      boothCount: zoneBooths.length,
    });
  }

  // Build connected walkway graph: Spawn -> Central Avenue Spine -> Horizontal Aisles -> Booth Approaches
  const nodes: WalkwayNode[] = [];
  const edges: Array<[string, string]> = [];

  const spawnNodeId = 'walk-spawn';
  nodes.push({ id: spawnNodeId, x: spawnPoint.x, z: spawnPoint.z, kind: 'spawn' });

  let prevSpineId = spawnNodeId;
  // Walk from South (nearest spawn) to North along Central Avenue (x = 0)
  for (let i = aisleCenterZs.length - 1; i >= 0; i--) {
    const az = aisleCenterZs[i];
    const spineId = `walk-avenue-${i}`;
    nodes.push({ id: spineId, x: 0, z: az, kind: 'avenue' });
    edges.push([prevSpineId, spineId]);
    prevSpineId = spineId;

    // Connect West & East aisle endpoints
    const westEndId = `walk-aisle-${i}-west`;
    const eastEndId = `walk-aisle-${i}-east`;
    const westX = round2(hallBounds.minX + perimeterWidth / 2);
    const eastX = round2(hallBounds.maxX - perimeterWidth / 2);
    nodes.push({ id: westEndId, x: westX, z: az, kind: 'perimeter' });
    nodes.push({ id: eastEndId, x: eastX, z: az, kind: 'perimeter' });

    // Connect every booth whose approach point shares this aisle
    const stripBooths = placements.filter(
      (p) => Math.abs(p.approachPoint.z - az) <= aisleWidth / 2 + 0.5
    );
    const westBooths = stripBooths.filter((p) => p.positionX < 0).sort((a, b) => b.positionX - a.positionX);
    const eastBooths = stripBooths.filter((p) => p.positionX > 0).sort((a, b) => a.positionX - b.positionX);

    let lastWestAisleNode = spineId;
    for (const b of westBooths) {
      const aisleDropId = `walk-aisle-${i}-b${b.slotIndex}`;
      const approachId = `walk-approach-${b.slotIndex}`;
      nodes.push({ id: aisleDropId, x: b.approachPoint.x, z: az, kind: 'aisle' });
      nodes.push({
        id: approachId,
        x: b.approachPoint.x,
        z: b.approachPoint.z,
        kind: 'approach',
        boothSlotIndex: b.slotIndex,
      });
      edges.push([lastWestAisleNode, aisleDropId]);
      edges.push([aisleDropId, approachId]);
      lastWestAisleNode = aisleDropId;
    }
    edges.push([lastWestAisleNode, westEndId]);

    let lastEastAisleNode = spineId;
    for (const b of eastBooths) {
      const aisleDropId = `walk-aisle-${i}-b${b.slotIndex}`;
      const approachId = `walk-approach-${b.slotIndex}`;
      nodes.push({ id: aisleDropId, x: b.approachPoint.x, z: az, kind: 'aisle' });
      nodes.push({
        id: approachId,
        x: b.approachPoint.x,
        z: b.approachPoint.z,
        kind: 'approach',
        boothSlotIndex: b.slotIndex,
      });
      edges.push([lastEastAisleNode, aisleDropId]);
      edges.push([aisleDropId, approachId]);
      lastEastAisleNode = aisleDropId;
    }
    edges.push([lastEastAisleNode, eastEndId]);
  }

  const radius = round2(Math.hypot(halfHallWidth, halfHallDepth));
  const cameraOverviewBounds = {
    centerX: 0,
    centerZ: 0,
    radius,
    recommendedHeight: round2(Math.max(26, radius * 0.85)),
    recommendedDistance: round2(Math.max(32, radius * 1.15)),
  };

  // Roof bounds metadata for Phase 3 Parametric Dome Roof
  const eaveHeight = hallWidth > 110 ? 13.5 : hallWidth > 75 ? 11.5 : 10.0;
  const roofRise = round2(Math.min(18, Math.max(6.5, hallWidth * 0.12)));
  const ribSpacing = hallDepth > 120 ? 12.0 : 10.0;

  const roofBounds: RoofBoundsMetadata = {
    hallWidth,
    hallDepth,
    bounds: hallBounds,
    eaveHeight,
    roofRise,
    ribSpacing,
    skylightRatio: 0.28,
  };

  return {
    config: {
      targetBoothCount,
      preferredZoneCapacity,
      hallStyle,
      mainAvenueWidth,
      aisleWidth,
      perimeterWidth,
      layoutSeed,
      reservedAreas,
    },
    hallWidth,
    hallDepth,
    hallBounds,
    walkableBounds,
    centralAvenueBounds,
    welcomeAreaBounds,
    spawnPoint,
    directoryPoint,
    zones,
    placements,
    walkwayGraph: { nodes, edges },
    cameraOverviewBounds,
    roofBounds,
  };
}

function makePlacement(
  slotIndex: number,
  positionX: number,
  positionZ: number,
  rotationY: number,
  preferredZoneCapacity: number,
  layoutSeed: number
): GeneratedBoothPlacement {
  const archetype = V28_ARCHETYPES[(slotIndex + layoutSeed) % V28_ARCHETYPES.length];
  const zoneIndex = Math.floor(slotIndex / preferredZoneCapacity);
  const zoneCode = zoneCodeForIndex(zoneIndex);

  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);
  const halfDepth = archetype.depth / 2;

  return {
    slotIndex,
    zoneCode,
    positionX,
    positionZ,
    rotationY,
    archetypeId: archetype.id,
    footprintWidth: archetype.width,
    footprintDepth: archetype.depth,
    approachPoint: {
      x: round2(positionX + forwardX * (halfDepth + APPROACH_OFFSET_M)),
      z: round2(positionZ + forwardZ * (halfDepth + APPROACH_OFFSET_M)),
    },
    focusCameraPoint: {
      x: round2(positionX + forwardX * (halfDepth + FOCUS_CAMERA_OFFSET_M)),
      z: round2(positionZ + forwardZ * (halfDepth + FOCUS_CAMERA_OFFSET_M)),
    },
  };
}

/**
 * Validate ANY exhibition layout (auto-generated OR admin-edited) for:
 *  1. Hall bounds containment (strictly inside hall bounds with perimeter margin)
 *  2. Zero AABB overlap between booths (including 0.4m physical clearance)
 *  3. Zero intrusion into Central Avenue or Welcome Area
 *  4. Focus camera clearance (no focus camera inside another booth AABB)
 *  5. Walkway connectivity via BFS from spawnPoint to 100% of booth approach points
 */
export function validateExhibitionLayout(
  layout: Pick<
    GeneratedExhibitionLayout,
    'hallBounds' | 'centralAvenueBounds' | 'welcomeAreaBounds' | 'placements' | 'walkwayGraph' | 'zones'
  >
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

  // 1. Bounds & Walkway intrusion checks
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

  // 2. Pairwise AABB overlap & Focus camera clip check
  for (let i = 0; i < layout.placements.length; i++) {
    for (let j = i + 1; j < layout.placements.length; j++) {
      if (rectsOverlap(aabbs[i], aabbs[j])) {
        overlapCount++;
        errors.push(`Booth #${layout.placements[i].slotIndex} và Booth #${layout.placements[j].slotIndex} bị chồng lấn.`);
      }
    }
    // Check focus camera point of booth i against all other booths j
    const fp = layout.placements[i].focusCameraPoint;
    for (let j = 0; j < layout.placements.length; j++) {
      if (i === j) continue;
      if (pointInRect(fp.x, fp.z, aabbs[j])) {
        focusClipCount++;
        errors.push(`Camera Focus của Booth #${layout.placements[i].slotIndex} xuyên vào Booth #${layout.placements[j].slotIndex}.`);
      }
    }
  }

  // 3. BFS Walkway connectivity from spawn to every booth approach point
  const nodeMap = new Map<string, WalkwayNode>();
  for (const n of layout.walkwayGraph.nodes) nodeMap.set(n.id, n);

  const adj = new Map<string, string[]>();
  for (const [u, v] of layout.walkwayGraph.edges) {
    const nu = nodeMap.get(u);
    const nv = nodeMap.get(v);
    if (!nu || !nv) continue;
    // Verify walkway edge does not pass through any booth AABB
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
      overlapCount,
      outOfBoundsCount,
      blockedWalkwayCount,
      unreachableBoothCount,
      focusClipCount,
    },
  };
}
