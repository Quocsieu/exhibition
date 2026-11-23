import {
  APPROACH_OFFSET_M,
  ARCHETYPE_MAP,
  FOCUS_CAMERA_OFFSET_M,
  GRAND_BOULEVARD_WIDTH_M,
  WELCOME_AREA_DEPTH,
  ZONE_GAP_X_M,
  type GeneratedClusterSpec,
  type RectBounds,
  type RoofBoundsMetadata,
  type V28ArchetypeId,
  type WalkwayGraph,
  type WalkwayNode,
} from './layoutGenerator.js';

export interface CompactableZoneInput {
  id: string;
  versionId: string;
  code: string;
  categoryId: string | null;
  displayName: string;
  categoryTag: string;
  bounds: RectBounds;
  sortOrder: number;
  boothCount: number;
}

export interface CompactableBoothInput {
  boothId: string;
  zoneId: string;
  zoneCode: string;
  slotIndex: number;
  positionX: number;
  positionZ: number;
  rotationY: number;
  archetypeId: V28ArchetypeId;
  footprintWidth: number;
  footprintDepth: number;
  approachPoint: { x: number; z: number };
  focusCameraPoint: { x: number; z: number };
}

export interface CompactableLayoutMeta {
  config?: {
    mainAvenueWidth?: number;
    perimeterWidth?: number;
  };
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
  walkableRegions?: RectBounds[];
  centralAvenueBounds: RectBounds;
  welcomeAreaBounds: RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
  cameraOverviewBounds: {
    centerX: number;
    centerZ: number;
    radius: number;
    recommendedHeight: number;
    recommendedDistance: number;
  };
  roofBounds?: RoofBoundsMetadata;
  walkwayGraph: WalkwayGraph;
  clusters?: GeneratedClusterSpec[];
}

export interface CompactedLayoutResult<TBooth extends CompactableBoothInput> {
  compacted: boolean;
  removedZoneCodes: string[];
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
  walkableRegions: RectBounds[];
  centralAvenueBounds: RectBounds;
  welcomeAreaBounds: RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
  cameraOverviewBounds: {
    centerX: number;
    centerZ: number;
    radius: number;
    recommendedHeight: number;
    recommendedDistance: number;
  };
  roofBounds: RoofBoundsMetadata;
  walkwayGraph: WalkwayGraph;
  clusters: GeneratedClusterSpec[];
  zones: CompactableZoneInput[];
  booths: TBooth[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  if (Math.abs(a + Math.PI) < 1e-4) a = Math.PI;
  return Number(a.toFixed(4));
}

function transformBoothLocalOffset(
  dx: number,
  dz: number,
  rotY: number,
  fromDir: 'south' | 'north' | 'east' | 'west',
  toDir: 'south' | 'north' | 'east' | 'west'
): { dx: number; dz: number; rotY: number } {
  if (fromDir === toDir) {
    return { dx: round2(dx), dz: round2(dz), rotY: normalizeAngle(rotY) };
  }
  // Horizontal mirror between Left ('east') and Right ('west') columns
  if ((fromDir === 'east' && toDir === 'west') || (fromDir === 'west' && toDir === 'east')) {
    return {
      dx: round2(-dx),
      dz: round2(dz),
      rotY: normalizeAngle(-rotY),
    };
  }
  // Rigid 90° rotation into centered single-zone South-opening U
  if (fromDir === 'east' && toDir === 'south') {
    return {
      dx: round2(-dz),
      dz: round2(dx),
      rotY: normalizeAngle(rotY - Math.PI / 2),
    };
  }
  if (fromDir === 'west' && toDir === 'south') {
    return {
      dx: round2(dz),
      dz: round2(-dx),
      rotY: normalizeAngle(rotY + Math.PI / 2),
    };
  }
  if (fromDir === 'north' && toDir === 'south') {
    return {
      dx: round2(-dx),
      dz: round2(-dz),
      rotY: normalizeAngle(rotY + Math.PI),
    };
  }
  // South -> East/West fallback (for unusual original single-zone layouts)
  if (fromDir === 'south' && toDir === 'east') {
    return {
      dx: round2(dz),
      dz: round2(-dx),
      rotY: normalizeAngle(rotY + Math.PI / 2),
    };
  }
  if (fromDir === 'south' && toDir === 'west') {
    return {
      dx: round2(-dz),
      dz: round2(dx),
      rotY: normalizeAngle(rotY - Math.PI / 2),
    };
  }
  return { dx: round2(dx), dz: round2(dz), rotY: normalizeAngle(rotY) };
}

/**
 * Deterministic, canonical Zone-Aware U-Shaped Compaction.
 *
 * Rules:
 * 1. If NO zone was completely emptied (every original zone still has >= 1 active booth),
 *    ZERO compaction runs — all remaining booths keep their exact persisted coordinates.
 * 2. If 1+ zones have 0 active booths, those empty zones are omitted and the remaining active
 *    zones are deterministically compacted into a clean U-shaped layout (2 facing columns for >= 2 zones,
 *    or 1 centered South-opening U-zone for 1 zone) directly from canonical original zone dimensions
 *    and original per-booth local offsets — zero cumulative drift, zero booth renumbering.
 */
export function computeZoneAwareCompactedLayout<TBooth extends CompactableBoothInput>(
  layoutMeta: CompactableLayoutMeta,
  originalZones: CompactableZoneInput[],
  activeBooths: TBooth[],
  defaultRoofBounds: RoofBoundsMetadata
): CompactedLayoutResult<TBooth> {
  const boothsByZoneId = new Map<string, TBooth[]>();
  for (const b of activeBooths) {
    const list = boothsByZoneId.get(b.zoneId) || [];
    list.push(b);
    boothsByZoneId.set(b.zoneId, list);
  }

  const sortedOriginalZones = [...originalZones].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeZonesOrig = sortedOriginalZones.filter((z) => (boothsByZoneId.get(z.id)?.length || 0) > 0);
  const removedZoneCodes = sortedOriginalZones
    .filter((z) => (boothsByZoneId.get(z.id)?.length || 0) === 0)
    .map((z) => z.code);

  const origClusters = Array.isArray(layoutMeta.clusters) ? layoutMeta.clusters : [];

  // RULE 1: No entire zone removed -> keep EXACT original coordinates & hall geometry!
  if (removedZoneCodes.length === 0 || activeZonesOrig.length === 0) {
    return {
      compacted: false,
      removedZoneCodes,
      hallWidth: Number(layoutMeta.hallWidth || defaultRoofBounds.hallWidth),
      hallDepth: Number(layoutMeta.hallDepth || defaultRoofBounds.hallDepth),
      hallBounds: layoutMeta.hallBounds,
      walkableBounds: layoutMeta.walkableBounds,
      walkableRegions: Array.isArray(layoutMeta.walkableRegions) ? layoutMeta.walkableRegions : [],
      centralAvenueBounds: layoutMeta.centralAvenueBounds,
      welcomeAreaBounds: layoutMeta.welcomeAreaBounds,
      spawnPoint: layoutMeta.spawnPoint,
      directoryPoint: layoutMeta.directoryPoint,
      cameraOverviewBounds: layoutMeta.cameraOverviewBounds,
      roofBounds: layoutMeta.roofBounds || defaultRoofBounds,
      walkwayGraph: layoutMeta.walkwayGraph,
      clusters: origClusters,
      zones: sortedOriginalZones,
      booths: activeBooths,
    };
  }

  // RULE 2: At least one entire zone was removed -> deterministic canonical U-shaped compaction
  const mainAvenueWidth = Math.max(
    12.0,
    layoutMeta.config?.mainAvenueWidth ??
      (layoutMeta.centralAvenueBounds
        ? Math.round((layoutMeta.centralAvenueBounds.maxX - layoutMeta.centralAvenueBounds.minX) * 100) / 100
        : GRAND_BOULEVARD_WIDTH_M)
  );
  const perimeterWidth = Math.max(6.0, layoutMeta.config?.perimeterWidth ?? 7.0);

  interface ZoneGeo {
    zone: CompactableZoneInput;
    origCluster: GeneratedClusterSpec | null;
    origCenterX: number;
    origCenterZ: number;
    origOpening: 'south' | 'north' | 'east' | 'west';
    /** U-zone intrinsic width (between wings) and depth (back wall to open mouth) */
    uWidth: number;
    uDepth: number;
    booths: TBooth[];
  }

  const activeZoneGeos: ZoneGeo[] = activeZonesOrig.map((z) => {
    const c = origClusters.find((cl) => cl.zoneCode === z.code) || null;
    const origCenterX = c ? c.centerX : round2((z.bounds.minX + z.bounds.maxX) / 2);
    const origCenterZ = c ? c.centerZ : round2((z.bounds.minZ + z.bounds.maxZ) / 2);
    const origSpanX = c ? c.width : round2(z.bounds.maxX - z.bounds.minX);
    const origSpanZ = c ? c.depth : round2(z.bounds.maxZ - z.bounds.minZ);
    const origOpening: 'south' | 'north' | 'east' | 'west' =
      c?.openingDirection || (origCenterX < 0 ? 'east' : origCenterX > 0 ? 'west' : 'south');
    const isHoriz = origOpening === 'east' || origOpening === 'west';
    return {
      zone: z,
      origCluster: c,
      origCenterX,
      origCenterZ,
      origOpening,
      uWidth: isHoriz ? origSpanZ : origSpanX,
      uDepth: isHoriz ? origSpanX : origSpanZ,
      booths: boothsByZoneId.get(z.id) || [],
    };
  });

  const isSingleZone = activeZoneGeos.length === 1;
  const leftCol: ZoneGeo[] = [];
  const rightCol: ZoneGeo[] = [];
  if (!isSingleZone) {
    const leftCount = Math.ceil(activeZoneGeos.length / 2);
    for (let i = 0; i < leftCount; i++) leftCol.push(activeZoneGeos[i]);
    for (let i = leftCount; i < activeZoneGeos.length; i++) rightCol.push(activeZoneGeos[i]);
  }

  const leftColMaxXDepth = leftCol.reduce((m, z) => Math.max(m, z.uDepth), 0);
  const rightColMaxXDepth = rightCol.reduce((m, z) => Math.max(m, z.uDepth), 0);
  const leftColTotalZ =
    leftCol.reduce((s, z) => s + z.uWidth, 0) + Math.max(0, leftCol.length - 1) * ZONE_GAP_X_M;
  const rightColTotalZ =
    rightCol.reduce((s, z) => s + z.uWidth, 0) + Math.max(0, rightCol.length - 1) * ZONE_GAP_X_M;

  const maxHalfX = isSingleZone
    ? activeZoneGeos[0].uWidth / 2
    : Math.max(mainAvenueWidth / 2 + leftColMaxXDepth, mainAvenueWidth / 2 + rightColMaxXDepth);
  const halfHallWidth = round2(Math.max(maxHalfX + perimeterWidth, mainAvenueWidth / 2 + 12.0));
  const hallWidth = round2(halfHallWidth * 2);

  const zonesSpanZ = isSingleZone
    ? activeZoneGeos[0].uDepth
    : Math.max(leftColTotalZ, rightColTotalZ);
  const hallDepth = round2(perimeterWidth + zonesSpanZ + WELCOME_AREA_DEPTH + perimeterWidth);
  const halfHallDepth = round2(hallDepth / 2);

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

  const zonesStartZ = round2(hallBounds.minZ + perimeterWidth);
  const zonesEndZ = round2(zonesStartZ + zonesSpanZ);

  const centralAvenueBounds: RectBounds = {
    minX: round2(-mainAvenueWidth / 2),
    maxX: round2(mainAvenueWidth / 2),
    minZ: isSingleZone ? zonesEndZ : zonesStartZ,
    maxZ: hallBounds.maxZ,
  };
  const welcomeAreaBounds: RectBounds = {
    minX: round2(hallBounds.minX + perimeterWidth),
    maxX: round2(hallBounds.maxX - perimeterWidth),
    minZ: zonesEndZ,
    maxZ: round2(hallBounds.maxZ - perimeterWidth),
  };
  const spawnPoint = {
    x: 0,
    z: round2(hallBounds.maxZ - perimeterWidth - 4.0),
    rotationY: Math.PI,
  };
  const directoryPoint = {
    x: round2(-mainAvenueWidth / 2 - 2.4),
    z: round2(zonesEndZ + WELCOME_AREA_DEPTH * 0.48),
  };

  const compactedClusters: GeneratedClusterSpec[] = [];
  const compactedZones: CompactableZoneInput[] = [];
  const compactedBooths: TBooth[] = [];
  const nodes: WalkwayNode[] = [];
  const edges: Array<[string, string]> = [];

  const spawnNodeId = 'walk-spawn';
  nodes.push({ id: spawnNodeId, x: spawnPoint.x, z: spawnPoint.z, kind: 'spawn' });
  let prevSpineNodeId = spawnNodeId;

  const placeZone = (
    zg: ZoneGeo,
    uIndex: number,
    newCenterX: number,
    newCenterZ: number,
    newOpening: 'south' | 'north' | 'east' | 'west'
  ) => {
    const isHoriz = newOpening === 'east' || newOpening === 'west';
    const worldSpanX = isHoriz ? zg.uDepth : zg.uWidth;
    const worldSpanZ = isHoriz ? zg.uWidth : zg.uDepth;
    const clusterId = zg.origCluster?.clusterId || `u-zone-${String(uIndex + 1).padStart(2, '0')}`;

    compactedClusters.push({
      clusterId,
      clusterIndex: uIndex,
      zoneCode: zg.zone.code,
      zoneName: zg.zone.displayName,
      categoryId: zg.zone.categoryId,
      centerX: newCenterX,
      centerZ: newCenterZ,
      width: round2(worldSpanX),
      depth: round2(worldSpanZ),
      boothCount: zg.booths.length,
      openingDirection: newOpening,
      backCount: zg.origCluster?.backCount ?? 0,
      leftCount: zg.origCluster?.leftCount ?? 0,
      rightCount: zg.origCluster?.rightCount ?? 0,
      variationSeed: zg.origCluster?.variationSeed ?? uIndex * 41 + 28,
      centerpieceKind: zg.origCluster?.centerpieceKind ?? 'medallion_oasis',
    });

    const newBounds: RectBounds = {
      minX: round2(newCenterX - worldSpanX / 2),
      maxX: round2(newCenterX + worldSpanX / 2),
      minZ: round2(newCenterZ - worldSpanZ / 2),
      maxZ: round2(newCenterZ + worldSpanZ / 2),
    };

    compactedZones.push({
      ...zg.zone,
      bounds: newBounds,
      boothCount: zg.booths.length,
    });

    const spineNodeId = `walk-spine-${clusterId}`;
    const centerNodeId = `walk-center-${clusterId}`;
    nodes.push({ id: spineNodeId, x: 0, z: isHoriz ? newCenterZ : zonesEndZ + 2.0, kind: 'avenue' });
    nodes.push({ id: centerNodeId, x: newCenterX, z: newCenterZ, kind: 'cluster_center' });
    edges.push([prevSpineNodeId, spineNodeId]);
    edges.push([spineNodeId, centerNodeId]);
    prevSpineNodeId = spineNodeId;

    for (const b of zg.booths) {
      const localDx = b.positionX - zg.origCenterX;
      const localDz = b.positionZ - zg.origCenterZ;
      const transformed = transformBoothLocalOffset(
        localDx,
        localDz,
        b.rotationY,
        zg.origOpening,
        newOpening
      );
      const px = round2(newCenterX + transformed.dx);
      const pz = round2(newCenterZ + transformed.dz);
      const rotY = transformed.rotY;
      const spec = ARCHETYPE_MAP[b.archetypeId] || ARCHETYPE_MAP.grand_portal;
      const fx = Math.sin(rotY);
      const fz = Math.cos(rotY);
      const approachPoint = {
        x: round2(px + fx * (spec.depth / 2 + APPROACH_OFFSET_M)),
        z: round2(pz + fz * (spec.depth / 2 + APPROACH_OFFSET_M)),
      };
      const focusCameraPoint = {
        x: round2(px + fx * (spec.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
        z: round2(pz + fz * (spec.depth / 2 + FOCUS_CAMERA_OFFSET_M)),
      };

      compactedBooths.push({
        ...b,
        positionX: px,
        positionZ: pz,
        rotationY: rotY,
        approachPoint,
        focusCameraPoint,
      });

      const appId = `walk-approach-${b.slotIndex}`;
      nodes.push({
        id: appId,
        x: approachPoint.x,
        z: approachPoint.z,
        kind: 'approach',
        boothSlotIndex: b.slotIndex,
      });
      edges.push([centerNodeId, appId]);
    }
  };

  let runningIdx = 0;
  if (isSingleZone) {
    const z0 = activeZoneGeos[0];
    placeZone(z0, runningIdx++, 0, round2(zonesStartZ + z0.uDepth / 2), 'south');
  } else {
    let curZ = round2(zonesStartZ + (zonesSpanZ - leftColTotalZ) / 2);
    for (const z of leftCol) {
      const cx = round2(-mainAvenueWidth / 2 - z.uDepth / 2);
      const cz = round2(curZ + z.uWidth / 2);
      placeZone(z, runningIdx++, cx, cz, 'east');
      curZ += z.uWidth + ZONE_GAP_X_M;
    }

    prevSpineNodeId = spawnNodeId;
    curZ = round2(zonesStartZ + (zonesSpanZ - rightColTotalZ) / 2);
    for (const z of rightCol) {
      const cx = round2(mainAvenueWidth / 2 + z.uDepth / 2);
      const cz = round2(curZ + z.uWidth / 2);
      placeZone(z, runningIdx++, cx, cz, 'west');
      curZ += z.uWidth + ZONE_GAP_X_M;
    }
  }

  // Keep canonical slotIndex ordering for booth list stability
  compactedBooths.sort((a, b) => a.slotIndex - b.slotIndex);

  // Rebuild walkable regions for the compacted U-zones
  const walkableRegions: RectBounds[] = [
    {
      minX: round2(-mainAvenueWidth / 2 - 1.5),
      maxX: round2(mainAvenueWidth / 2 + 1.5),
      minZ: round2(isSingleZone ? zonesEndZ - 1.5 : zonesStartZ),
      maxZ: round2(hallBounds.maxZ - 2.0),
    },
    {
      minX: round2(Math.max(walkableBounds.minX, -mainAvenueWidth / 2 - 12.0)),
      maxX: round2(Math.min(walkableBounds.maxX, mainAvenueWidth / 2 + 12.0)),
      minZ: round2(zonesEndZ - 1.0),
      maxZ: round2(hallBounds.maxZ - 2.0),
    },
  ];

  for (let i = 0; i < compactedZones.length; i++) {
    const z = compactedZones[i];
    const dir = compactedClusters[i]?.openingDirection || 'south';
    if (dir === 'east') {
      walkableRegions.push({
        minX: round2(z.bounds.minX + 0.8),
        maxX: round2(z.bounds.maxX + 1.8),
        minZ: round2(z.bounds.minZ + 0.8),
        maxZ: round2(z.bounds.maxZ - 0.8),
      });
    } else if (dir === 'west') {
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
        minZ: round2(dir === 'south' ? z.bounds.minZ + 0.8 : z.bounds.minZ - 1.8),
        maxZ: round2(dir === 'south' ? z.bounds.maxZ + 1.8 : z.bounds.maxZ - 0.8),
      });
    }
  }

  const addInterColWalkways = (dir: 'east' | 'west') => {
    const col = compactedZones
      .filter((_, idx) => compactedClusters[idx]?.openingDirection === dir)
      .sort((a, b) => a.bounds.minZ - b.bounds.minZ);
    for (let i = 0; i < col.length - 1; i++) {
      const top = col[i];
      const bot = col[i + 1];
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
  addInterColWalkways('east');
  addInterColWalkways('west');

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
  const ribSpacing = hallDepth > 140 ? 14.0 : 12.0;

  return {
    compacted: true,
    removedZoneCodes,
    hallWidth,
    hallDepth,
    hallBounds,
    walkableBounds,
    walkableRegions,
    centralAvenueBounds,
    welcomeAreaBounds,
    spawnPoint,
    directoryPoint,
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
    walkwayGraph: { nodes, edges },
    clusters: compactedClusters,
    zones: compactedZones,
    booths: compactedBooths,
  };
}

export interface PlannedConsolidatedZone<TBooth extends CompactableBoothInput> {
  displayName: string;
  categoryTag: string;
  categoryId: string | null;
  isMerged: boolean;
  sourceZoneCodes: string[];
  booths: TBooth[];
}

export interface SparseZoneConsolidationPlan<TBooth extends CompactableBoothInput> {
  canConsolidate: boolean;
  sparseThreshold: number;
  maxBoothsPerZone: number;
  previousZoneCount: number;
  nextZoneCount: number;
  mergedZoneCodes: string[];
  movedBoothCount: number;
  plannedZones: PlannedConsolidatedZone<TBooth>[];
}

/**
 * Option A — Sparse Zone Consolidation Planner:
 * Keeps dense zones (boothCount > sparseThreshold) intact, while merging
 * sparse zones (1 <= boothCount <= sparseThreshold) into consolidated zone(s)
 * capped at `maxBoothsPerZone` booths per zone.
 */
export function planSparseZoneConsolidation<TBooth extends CompactableBoothInput>(
  zones: CompactableZoneInput[],
  booths: TBooth[],
  options?: {
    sparseThreshold?: number;
    maxBoothsPerZone?: number;
  }
): SparseZoneConsolidationPlan<TBooth> {
  const boothsByZoneId = new Map<string, TBooth[]>();
  for (const b of booths) {
    const list = boothsByZoneId.get(b.zoneId) || [];
    list.push(b);
    boothsByZoneId.set(b.zoneId, list);
  }
  for (const list of boothsByZoneId.values()) {
    list.sort((a, b) => a.slotIndex - b.slotIndex);
  }

  const activeZones = [...zones]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((z) => (boothsByZoneId.get(z.id)?.length || 0) > 0);

  const largestZoneCount = activeZones.reduce(
    (max, z) => Math.max(max, boothsByZoneId.get(z.id)?.length || 0),
    0
  );
  const sparseThreshold = Math.max(
    1,
    Math.min(12, Math.floor(options?.sparseThreshold ?? 3))
  );
  const maxBoothsPerZone = Math.max(
    4,
    Math.min(24, Math.floor(options?.maxBoothsPerZone ?? Math.max(10, largestZoneCount)))
  );

  const sparseZones = activeZones.filter(
    (z) => (boothsByZoneId.get(z.id)?.length || 0) <= sparseThreshold
  );

  if (sparseZones.length < 2) {
    return {
      canConsolidate: false,
      sparseThreshold,
      maxBoothsPerZone,
      previousZoneCount: activeZones.length,
      nextZoneCount: activeZones.length,
      mergedZoneCodes: [],
      movedBoothCount: 0,
      plannedZones: activeZones.map((z) => ({
        displayName: z.displayName,
        categoryTag: z.categoryTag,
        categoryId: z.categoryId,
        isMerged: false,
        sourceZoneCodes: [z.code],
        booths: boothsByZoneId.get(z.id) || [],
      })),
    };
  }

  const sparseBoothPool: TBooth[] = [];
  for (const z of sparseZones) {
    sparseBoothPool.push(...(boothsByZoneId.get(z.id) || []));
  }

  const chunkCount = Math.max(1, Math.ceil(sparseBoothPool.length / maxBoothsPerZone));
  if (chunkCount >= sparseZones.length) {
    return {
      canConsolidate: false,
      sparseThreshold,
      maxBoothsPerZone,
      previousZoneCount: activeZones.length,
      nextZoneCount: activeZones.length,
      mergedZoneCodes: [],
      movedBoothCount: 0,
      plannedZones: activeZones.map((z) => ({
        displayName: z.displayName,
        categoryTag: z.categoryTag,
        categoryId: z.categoryId,
        isMerged: false,
        sourceZoneCodes: [z.code],
        booths: boothsByZoneId.get(z.id) || [],
      })),
    };
  }

  const mergedChunks: PlannedConsolidatedZone<TBooth>[] = [];
  const baseSize = Math.floor(sparseBoothPool.length / chunkCount);
  let remainder = sparseBoothPool.length % chunkCount;
  let offset = 0;
  for (let i = 0; i < chunkCount; i++) {
    const take = baseSize + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    const chunkBooths = sparseBoothPool.slice(offset, offset + take);
    offset += take;
    const sourceCodes = Array.from(new Set(chunkBooths.map((b) => b.zoneCode)));
    mergedChunks.push({
      displayName: chunkCount === 1 ? 'Khu Tổng hợp' : `Khu Tổng hợp ${i + 1}`,
      categoryTag: 'Tổng hợp',
      categoryId: null,
      isMerged: true,
      sourceZoneCodes: sourceCodes,
      booths: chunkBooths,
    });
  }

  const sparseIdSet = new Set(sparseZones.map((z) => z.id));
  const plannedZones: PlannedConsolidatedZone<TBooth>[] = [];
  let insertedMerged = false;

  for (const z of activeZones) {
    if (sparseIdSet.has(z.id)) {
      if (!insertedMerged) {
        plannedZones.push(...mergedChunks);
        insertedMerged = true;
      }
    } else {
      plannedZones.push({
        displayName: z.displayName,
        categoryTag: z.categoryTag,
        categoryId: z.categoryId,
        isMerged: false,
        sourceZoneCodes: [z.code],
        booths: boothsByZoneId.get(z.id) || [],
      });
    }
  }

  return {
    canConsolidate: true,
    sparseThreshold,
    maxBoothsPerZone,
    previousZoneCount: activeZones.length,
    nextZoneCount: plannedZones.length,
    mergedZoneCodes: sparseZones.map((z) => z.code),
    movedBoothCount: sparseBoothPool.length,
    plannedZones,
  };
}
