/**
 * GRAND EXPO WORLD V28 — PHASE 8 DYNAMIC SIX-BOOTH CLUSTER LAYOUT GENERATOR
 *
 * Uses V27.5's iconic U-Shaped 6-Booth Courtyard as the modular spatial unit:
 *   - Max 6 booths per cluster, all facing INWARD toward a spacious 25m+ cluster plaza.
 *   - Uses real measured bounding-box footprints of the 6 V27.4 GLB archetypes.
 *   - Supports Category-Based Zones (`Khu + Category Name`), deterministic cluster centerpiece
 *     variations, zero fake booths for partial clusters, 0 overlaps, and 100% BFS walkway connectivity.
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

export interface CategoryZoneInput {
  categoryId: string;
  categoryName: string;
  boothCount: number;
}

export interface LayoutGeneratorInput {
  targetBoothCount: number;
  preferredZoneCapacity?: number;
  hallStyle?: 'grand_expo' | 'modular_pavilion';
  mainAvenueWidth?: number;
  aisleWidth?: number;
  perimeterWidth?: number;
  layoutSeed?: number;
  categoryZones?: CategoryZoneInput[];
  reservedAreas?: Array<{ id: string; label: string; bounds: RectBounds }>;
}

export type ClusterCenterpieceKind =
  | 'medallion_oasis'
  | 'landscape_lounge'
  | 'interactive_corner'
  | 'cafe_rest';

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
  config: Required<Omit<LayoutGeneratorInput, 'reservedAreas' | 'categoryZones'>> & {
    categoryZones: CategoryZoneInput[];
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
// V27.5 SIX-BOOTH U-SHAPED COURTYARD CLUSTER TEMPLATE (Local Coordinates)
// Derived directly from FE/src/scene/worldLayout.ts V27_BOOTH_LAYOUT_SPECS
// ============================================================================
export const MAX_BOOTHS_PER_CLUSTER = 6;
export const CLUSTER_WIDTH = 44.0;
export const CLUSTER_DEPTH = 38.0;
export const CLUSTER_GAP_X = 8.0;
export const CLUSTER_GAP_Z = 9.0;
export const WELCOME_AREA_DEPTH = 18.0;
export const APPROACH_OFFSET_M = 2.4;
export const FOCUS_CAMERA_OFFSET_M = 4.4;

const V27_CLUSTER_SLOTS: ReadonlyArray<{
  localX: number;
  localZ: number;
  rotationY: number;
  defaultArchetype: V28ArchetypeId;
}> = [
  { localX: -7.2, localZ: -13.6, rotationY: 0, defaultArchetype: 'signature_ring' },
  { localX: 7.2, localZ: -13.6, rotationY: 0, defaultArchetype: 'organic_flow' },
  { localX: -16.0, localZ: -4.2, rotationY: Number((Math.PI / 2).toFixed(4)), defaultArchetype: 'grand_portal' },
  { localX: 16.0, localZ: -4.2, rotationY: Number((-Math.PI / 2).toFixed(4)), defaultArchetype: 'wave_pavilion' },
  { localX: -16.0, localZ: 7.2, rotationY: Number((Math.PI / 2).toFixed(4)), defaultArchetype: 'gallery_arch' },
  { localX: 16.0, localZ: 7.2, rotationY: Number((-Math.PI / 2).toFixed(4)), defaultArchetype: 'dynamic_frame' },
];

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
 * Build deterministic Six-Booth U-Shaped Courtyard Cluster Layout.
 * - 1..6 booths -> 1 central courtyard cluster (matching V27.5 spirit!)
 * - 7..200 booths -> symmetrical West & East wing clusters flanking Central Main Avenue.
 * - Supports Category-Based Zones (`Khu + Category Name`) or fallback balanced zones.
 */
export function generateDynamicExhibitionLayout(
  input: LayoutGeneratorInput
): GeneratedExhibitionLayout {
  const targetBoothCount = Math.max(1, Math.min(500, Math.floor(input.targetBoothCount)));
  const preferredZoneCapacity = Math.max(4, Math.min(50, Math.floor(input.preferredZoneCapacity ?? 12)));
  const hallStyle = input.hallStyle ?? 'grand_expo';
  const mainAvenueWidth = Math.max(10.0, input.mainAvenueWidth ?? 12.0);
  const aisleWidth = Math.max(8.0, input.aisleWidth ?? 8.4);
  const perimeterWidth = Math.max(6.0, input.perimeterWidth ?? 7.0);
  const layoutSeed = input.layoutSeed ?? 28;
  const reservedAreas = input.reservedAreas ?? [];
  const categoryZones = input.categoryZones ?? [];

  // 1. Partition total booths into Cluster Specs (max 6 booths per cluster, zero fake booths!)
  interface PendingCluster {
    zoneCode: string;
    zoneName: string;
    categoryId: string | null;
    categoryTag: string;
    boothCount: number;
  }
  const pendingClusters: PendingCluster[] = [];

  if (categoryZones.length > 0) {
    let zIdx = 0;
    let remainingGlobal = targetBoothCount;
    for (const cz of categoryZones) {
      if (remainingGlobal <= 0) break;
      const countForCat = Math.min(remainingGlobal, Math.max(0, Math.floor(cz.boothCount)));
      if (countForCat <= 0) continue;
      remainingGlobal -= countForCat;
      const code = zoneCodeForIndex(zIdx++);
      const displayName = cz.categoryName.startsWith('Khu ') ? cz.categoryName : `Khu ${cz.categoryName}`;
      let rem = countForCat;
      while (rem > 0) {
        const take = Math.min(MAX_BOOTHS_PER_CLUSTER, rem);
        pendingClusters.push({
          zoneCode: code,
          zoneName: displayName,
          categoryId: cz.categoryId,
          categoryTag: cz.categoryName,
          boothCount: take,
        });
        rem -= take;
      }
    }
    // If sum(categoryZones) < targetBoothCount, add remaining in a General zone
    if (remainingGlobal > 0) {
      const code = zoneCodeForIndex(zIdx++);
      while (remainingGlobal > 0) {
        const take = Math.min(MAX_BOOTHS_PER_CLUSTER, remainingGlobal);
        pendingClusters.push({
          zoneCode: code,
          zoneName: 'Khu Tổng hợp',
          categoryId: null,
          categoryTag: 'Tổng hợp',
          boothCount: take,
        });
        remainingGlobal -= take;
      }
    }
  } else {
    const totalClusters = Math.ceil(targetBoothCount / MAX_BOOTHS_PER_CLUSTER);
    const clustersPerZone = Math.max(1, Math.ceil(preferredZoneCapacity / MAX_BOOTHS_PER_CLUSTER));
    let remaining = targetBoothCount;
    for (let c = 0; c < totalClusters; c++) {
      const take = Math.min(MAX_BOOTHS_PER_CLUSTER, remaining);
      remaining -= take;
      const zIdx = Math.floor(c / clustersPerZone);
      const code = zoneCodeForIndex(zIdx);
      pendingClusters.push({
        zoneCode: code,
        zoneName: `Khu ${code}`,
        categoryId: null,
        categoryTag: `Phân khu ${code}`,
        boothCount: take,
      });
    }
  }

  const numClusters = pendingClusters.length;
  const singleCentered = numClusters === 1;

  // Grid dimensions for clusters
  const colsPerWing = singleCentered ? 1 : numClusters <= 4 ? 1 : numClusters <= 16 ? 2 : 3;
  const clustersPerRow = singleCentered ? 1 : colsPerWing * 2;
  const numRows = Math.ceil(numClusters / clustersPerRow);

  const pitchX = CLUSTER_WIDTH + CLUSTER_GAP_X;
  const pitchZ = CLUSTER_DEPTH + CLUSTER_GAP_Z;

  const halfHallWidth = singleCentered
    ? round2(CLUSTER_WIDTH / 2 + perimeterWidth)
    : round2(mainAvenueWidth / 2 + colsPerWing * CLUSTER_WIDTH + (colsPerWing - 1) * CLUSTER_GAP_X + CLUSTER_GAP_X / 2 + perimeterWidth);
  const hallWidth = round2(halfHallWidth * 2);

  const clustersTotalDepthZ = round2(numRows * CLUSTER_DEPTH + Math.max(0, numRows - 1) * CLUSTER_GAP_Z);
  const hallDepth = round2(perimeterWidth + clustersTotalDepthZ + WELCOME_AREA_DEPTH + perimeterWidth);
  const halfHallDepth = round2(hallDepth / 2);

  const hallBounds: RectBounds = {
    minX: -halfHallWidth,
    maxX: halfHallWidth,
    minZ: -halfHallDepth,
    maxZ: halfHallDepth,
  };

  const walkableBounds: RectBounds = {
    minX: round2(hallBounds.minX + 1.4),
    maxX: round2(hallBounds.maxX - 1.4),
    minZ: round2(hallBounds.minZ + 1.4),
    maxZ: round2(hallBounds.maxZ - 1.4),
  };

  // In single-cluster mode (1..6 booths), Central Avenue runs from South Welcome into the courtyard center
  const centralAvenueBounds: RectBounds = singleCentered
    ? { minX: -5.1, maxX: 5.1, minZ: -8.0, maxZ: hallBounds.maxZ }
    : { minX: round2(-mainAvenueWidth / 2), maxX: round2(mainAvenueWidth / 2), minZ: hallBounds.minZ, maxZ: hallBounds.maxZ };

  const firstRowTopZ = round2(hallBounds.minZ + perimeterWidth);
  const clustersEndZ = round2(firstRowTopZ + clustersTotalDepthZ);

  const welcomeAreaBounds: RectBounds = {
    minX: round2(hallBounds.minX + perimeterWidth),
    maxX: round2(hallBounds.maxX - perimeterWidth),
    minZ: clustersEndZ,
    maxZ: round2(hallBounds.maxZ - perimeterWidth),
  };

  const spawnPoint = {
    x: 0,
    z: round2(hallBounds.maxZ - perimeterWidth - 4.0),
    rotationY: Math.PI,
  };

  const directoryPoint = {
    x: round2(-mainAvenueWidth / 2 - 2.4),
    z: round2(clustersEndZ + WELCOME_AREA_DEPTH * 0.48),
  };

  // 2. Place clusters & their <= 6 booths
  const clusters: GeneratedClusterSpec[] = [];
  const placements: GeneratedBoothPlacement[] = [];
  const rowBoulevardZs: number[] = [];

  for (let row = 0; row < numRows; row++) {
    const centerZ = round2(firstRowTopZ + row * pitchZ + CLUSTER_DEPTH / 2);
    // Horizontal visitor boulevard just South of each cluster row (open side of U-shaped courtyard!)
    const southBoulevardZ = round2(centerZ + CLUSTER_DEPTH / 2 + CLUSTER_GAP_Z / 2);
    rowBoulevardZs.push(southBoulevardZ);

    for (let colIdx = 0; colIdx < clustersPerRow; colIdx++) {
      const cIdx = row * clustersPerRow + colIdx;
      if (cIdx >= numClusters) break;
      const pc = pendingClusters[cIdx];

      let centerX: number;
      if (singleCentered) {
        centerX = 0;
      } else {
        const isWest = colIdx < colsPerWing;
        const wingCol = isWest ? colIdx : colIdx - colsPerWing;
        const offsetFromAvenue = mainAvenueWidth / 2 + CLUSTER_GAP_X / 2 + CLUSTER_WIDTH / 2 + wingCol * pitchX;
        centerX = round2(isWest ? -offsetFromAvenue : offsetFromAvenue);
      }

      const clusterId = `cluster-${String(cIdx + 1).padStart(2, '0')}`;
      const variationSeed = (cIdx * 37 + layoutSeed) % 997;
      const centerpieceKind = CENTERPIECE_VARIANTS[(cIdx + layoutSeed) % CENTERPIECE_VARIANTS.length];

      clusters.push({
        clusterId,
        clusterIndex: cIdx,
        zoneCode: pc.zoneCode,
        zoneName: pc.zoneName,
        categoryId: pc.categoryId,
        centerX,
        centerZ,
        width: CLUSTER_WIDTH,
        depth: CLUSTER_DEPTH,
        boothCount: pc.boothCount,
        variationSeed,
        centerpieceKind,
      });

      for (let localSlot = 0; localSlot < pc.boothCount; localSlot++) {
        const tmpl = V27_CLUSTER_SLOTS[localSlot];
        const archSpec = ARCHETYPE_MAP[tmpl.defaultArchetype];
        const px = round2(centerX + tmpl.localX);
        const pz = round2(centerZ + tmpl.localZ);
        const rotY = tmpl.rotationY;
        const fx = Math.sin(rotY);
        const fz = Math.cos(rotY);

        placements.push({
          slotIndex: placements.length,
          clusterId,
          clusterIndex: cIdx,
          zoneCode: pc.zoneCode,
          categoryId: pc.categoryId,
          positionX: px,
          positionZ: pz,
          rotationY: rotY,
          archetypeId: archSpec.id,
          footprintWidth: archSpec.width,
          footprintDepth: archSpec.depth,
          approachPoint: {
            x: round2(px + fx * (archSpec.depth / 2 + APPROACH_OFFSET_M)),
            z: round2(pz + fz * (archSpec.depth / 2 + APPROACH_OFFSET_M)),
          },
          focusCameraPoint: {
            x: round2(px + fx * (archSpec.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
            z: round2(pz + fz * (archSpec.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
          },
        });
      }
    }
  }

  // 3. Build Zone summaries
  const zoneOrder: string[] = [];
  const zoneMetaByCode = new Map<string, { displayName: string; categoryId: string | null; categoryTag: string }>();
  for (const pc of pendingClusters) {
    if (!zoneMetaByCode.has(pc.zoneCode)) {
      zoneOrder.push(pc.zoneCode);
      zoneMetaByCode.set(pc.zoneCode, {
        displayName: pc.zoneName,
        categoryId: pc.categoryId,
        categoryTag: pc.categoryTag,
      });
    }
  }

  const zones: GeneratedZoneSpec[] = zoneOrder.map((code, idx) => {
    const meta = zoneMetaByCode.get(code)!;
    const zClusters = clusters.filter((c) => c.zoneCode === code);
    const zBooths = placements.filter((p) => p.zoneCode === code);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of zClusters) {
      minX = Math.min(minX, c.centerX - c.width / 2);
      maxX = Math.max(maxX, c.centerX + c.width / 2);
      minZ = Math.min(minZ, c.centerZ - c.depth / 2);
      maxZ = Math.max(maxZ, c.centerZ + c.depth / 2);
    }
    return {
      code,
      categoryId: meta.categoryId,
      displayName: meta.displayName,
      categoryTag: meta.categoryTag,
      bounds: { minX: round2(minX), maxX: round2(maxX), minZ: round2(minZ), maxZ: round2(maxZ) },
      sortOrder: idx + 1,
      boothCount: zBooths.length,
      clusterCount: zClusters.length,
    };
  });

  // 4. Build BFS-connected Walkway Graph:
  //    Spawn -> Central Avenue Spine -> Row South Boulevards -> Cluster Courtyard Centers -> Booth Approaches
  const nodes: WalkwayNode[] = [];
  const edges: Array<[string, string]> = [];
  const spawnNodeId = 'walk-spawn';
  nodes.push({ id: spawnNodeId, x: spawnPoint.x, z: spawnPoint.z, kind: 'spawn' });

  let prevSpineId = spawnNodeId;
  for (let row = numRows - 1; row >= 0; row--) {
    const blvdZ = rowBoulevardZs[row];
    const spineId = `walk-avenue-row-${row}`;
    nodes.push({ id: spineId, x: 0, z: blvdZ, kind: 'avenue' });
    edges.push([prevSpineId, spineId]);
    prevSpineId = spineId;

    const rowClusters = clusters.filter((c) => Math.floor(c.clusterIndex / clustersPerRow) === row);
    const westClusters = rowClusters.filter((c) => c.centerX < 0).sort((a, b) => b.centerX - a.centerX);
    const eastClusters = rowClusters.filter((c) => c.centerX >= 0).sort((a, b) => a.centerX - b.centerX);

    const connectClusterList = (list: GeneratedClusterSpec[]) => {
      let prevBlvdNode = spineId;
      for (const c of list) {
        const entryId = `walk-entry-${c.clusterId}`;
        const centerId = `walk-center-${c.clusterId}`;
        nodes.push({ id: entryId, x: c.centerX, z: blvdZ, kind: 'aisle' });
        nodes.push({ id: centerId, x: c.centerX, z: c.centerZ, kind: 'cluster_center' });
        edges.push([prevBlvdNode, entryId]);
        edges.push([entryId, centerId]);
        prevBlvdNode = entryId;

        const cBooths = placements.filter((p) => p.clusterId === c.clusterId);
        for (const b of cBooths) {
          const appId = `walk-approach-${b.slotIndex}`;
          nodes.push({
            id: appId,
            x: b.approachPoint.x,
            z: b.approachPoint.z,
            kind: 'approach',
            boothSlotIndex: b.slotIndex,
          });
          edges.push([centerId, appId]);
        }
      }
    };

    connectClusterList(westClusters);
    connectClusterList(eastClusters);
  }

  const radius = round2(Math.hypot(halfHallWidth, halfHallDepth));
  const cameraOverviewBounds = {
    centerX: 0,
    centerZ: 0,
    radius,
    recommendedHeight: round2(Math.max(28, radius * 0.78)),
    recommendedDistance: round2(Math.max(36, radius * 1.08)),
  };

  const eaveHeight = hallWidth > 140 ? 15.0 : hallWidth > 90 ? 12.5 : 10.5;
  const roofRise = round2(Math.min(22, Math.max(7.0, hallWidth * 0.11)));
  const ribSpacing = hallDepth > 140 ? 14.0 : 12.0;

  return {
    config: {
      targetBoothCount,
      preferredZoneCapacity,
      hallStyle,
      mainAvenueWidth,
      aisleWidth,
      perimeterWidth,
      layoutSeed,
      categoryZones,
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
    clusters,
    zones,
    placements,
    walkwayGraph: { nodes, edges },
    cameraOverviewBounds,
    roofBounds: {
      hallWidth,
      hallDepth,
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
      clusterCount: layout.clusters?.length ?? Math.ceil(layout.placements.length / MAX_BOOTHS_PER_CLUSTER),
      overlapCount,
      outOfBoundsCount,
      blockedWalkwayCount,
      unreachableBoothCount,
      focusClipCount,
    },
  };
}
