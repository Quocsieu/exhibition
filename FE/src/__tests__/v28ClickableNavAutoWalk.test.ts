import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import {
  advanceAutoWalkWaypoints,
  computeGuidedRoute,
  computeGuidedZoneRoute,
  computeWorldAnchoredIndicators,
  countRouteBoothCollisions,
  MAX_NAV_LABEL_RADIUS_M,
  type V28WalkwayGraph,
} from '../services/v28NavigationEngine';
import {
  computeRotatedBoothCollider,
  deriveWalkableRegions,
  isPointWalkable,
} from '../scene/v28/v28NavigationBounds';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28ZoneRecord,
} from '../services/v28Api';
import fs from 'node:fs';
import path from 'node:path';

function createMock100BoothWorld(): V28ExhibitionVersionDetail & { walkwayGraph: V28WalkwayGraph } {
  const layout = generateDynamicExhibitionLayout({
    targetBoothCount: 100,
    zoneCount: 10,
    boothsPerZone: 10,
  });

  const zones: V28ZoneRecord[] = layout.zones.map((z, idx) => ({
    id: `zone-${z.code}`,
    versionId: 'v-h3-test',
    code: z.code,
    displayName: z.displayName,
    categoryTag: z.categoryTag,
    bounds: z.bounds,
    sortOrder: idx,
    boothCount: z.boothCount,
  }));

  const booths: V28BoothPlacementView[] = layout.placements.map((p) => ({
    versionId: 'v-h3-test',
    boothId: `booth-${String(p.slotIndex + 1).padStart(3, '0')}`,
    boothName: `Gian ${p.zoneCode}#${p.slotIndex + 1}`,
    tagline: '',
    description: '',
    category: 'Nông sản',
    color: '#0ea5e9',
    companyId: 'comp-1',
    companyName: `Nông sản ${p.zoneCode}#${p.slotIndex + 1}`,
    zoneId: `zone-${p.zoneCode}`,
    zoneCode: p.zoneCode,
    zoneName: `Khu ${p.zoneCode}`,
    slotIndex: p.slotIndex,
    positionX: p.positionX,
    positionZ: p.positionZ,
    rotationY: p.rotationY,
    archetypeId: p.archetypeId,
    archetypeLabel: p.archetypeId,
    archetypeTheme: 'agri',
    glbPath: '',
    footprintWidth: p.footprintWidth,
    footprintDepth: p.footprintDepth,
    approachPoint: p.approachPoint,
    focusCameraPoint: p.focusCameraPoint,
    placementStatus: 'placed',
    slots: [],
    assignedSlotCount: 1,
  }));

  return {
    versionId: 'v-h3-test',
    exhibitionId: 'expo-h3',
    exhibitionName: 'Grand Expo H3 Test',
    status: 'published',
    versionNumber: 1,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    targetBoothCount: 100,
    hallWidth: layout.hallWidth,
    hallDepth: layout.hallDepth,
    hallBounds: layout.hallBounds,
    walkableBounds: layout.walkableBounds,
    walkableRegions: layout.walkableRegions,
    directoryPoint: layout.directoryPoint,
    validation: {
      valid: true,
      errors: [],
      stats: {
        boothCount: 100,
        zoneCount: zones.length,
        overlapCount: 0,
        outOfBoundsCount: 0,
        blockedWalkwayCount: 0,
        unreachableBoothCount: 0,
        focusClipCount: 0,
      },
    },
    roofBounds: layout.roofBounds,
    welcomeAreaBounds: layout.welcomeAreaBounds,
    centralAvenueBounds: layout.centralAvenueBounds,
    spawnPoint: layout.spawnPoint,
    cameraOverviewBounds: layout.cameraOverviewBounds,
    walkwayGraph: layout.walkwayGraph,
    zones,
    clusters: [],
    booths,
  };
}

describe('Grand Expo V28 H3 — Clickable 3D Navigation Labels & Multi-Waypoint Auto-Walk', () => {
  it('computes collision-free Dijkstra Auto-Walk routes to booth C#21, mid-route switch to C#22, and Zone D entrance', () => {
    const world = createMock100BoothWorld();
    const colliders = world.booths.map((b) => computeRotatedBoothCollider(b, 0.35));
    const walkableRegions = deriveWalkableRegions(world);
    const isWalkable = (x: number, z: number) => isPointWalkable(x, z, walkableRegions, colliders);

    const booth21 = world.booths[20]; // C#21
    const booth22 = world.booths[21]; // C#22
    const zoneD = world.zones.find((z) => z.code === 'D')!;
    expect(booth21.zoneCode).toBe('C');
    expect(booth22.zoneCode).toBe('C');
    expect(zoneD).toBeTruthy();

    // 1. Walk from spawn to C#21 via walkwayGraph (multiple waypoints, 0 booth collisions)
    const route21 = computeGuidedRoute(world, world.spawnPoint, booth21);
    expect(route21.reachable).toBe(true);
    expect(route21.usesWalkwayGraph).toBe(true);
    expect(route21.waypoints.length).toBeGreaterThanOrEqual(3);
    expect(countRouteBoothCollisions(route21.waypoints, world.booths, booth21.boothId)).toBe(0);

    // Simulate walking partway toward C#21 (15 frames at ~0.55m/frame)
    let pos = { x: world.spawnPoint.x, z: world.spawnPoint.z, rotationY: world.spawnPoint.rotationY };
    let queue = [...route21.waypoints];
    for (let f = 0; f < 15; f++) {
      const step = advanceAutoWalkWaypoints(pos, queue, 0.55, isWalkable, 0.55);
      expect(step.stalled).toBe(false);
      expect(step.moved).toBe(true);
      pos = { x: step.x, z: step.z, rotationY: step.rotationY };
      queue = step.remainingWaypoints;
    }
    const movedFromSpawn = Math.hypot(pos.x - world.spawnPoint.x, pos.z - world.spawnPoint.z);
    expect(movedFromSpawn).toBeGreaterThan(5.0);

    // 2. Mid-walk switch to C#22 -> replaces old queue and walks smoothly all the way to C#22 approachPoint
    const route22 = computeGuidedRoute(world, pos, booth22);
    expect(route22.reachable).toBe(true);
    expect(countRouteBoothCollisions(route22.waypoints, world.booths, booth22.boothId)).toBe(0);
    queue = [...route22.waypoints];
    let reached22 = false;
    for (let f = 0; f < 600; f++) {
      const step = advanceAutoWalkWaypoints(pos, queue, 0.55, isWalkable, 0.55);
      expect(step.stalled).toBe(false);
      pos = { x: step.x, z: step.z, rotationY: step.rotationY };
      queue = step.remainingWaypoints;
      if (step.completed) {
        reached22 = true;
        break;
      }
    }
    expect(reached22).toBe(true);
    expect(Math.hypot(pos.x - booth22.approachPoint.x, pos.z - booth22.approachPoint.z)).toBeLessThanOrEqual(0.65);

    // 3. Click Zone D label -> resolves valid Zone D entrance & walks there collision-free
    const routeZoneD = computeGuidedZoneRoute(world, pos, zoneD);
    expect(routeZoneD.reachable).toBe(true);
    expect(routeZoneD.usesWalkwayGraph).toBe(true);
    expect(routeZoneD.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(countRouteBoothCollisions(routeZoneD.waypoints, world.booths)).toBe(0);

    queue = [...routeZoneD.waypoints];
    let reachedZoneD = false;
    for (let f = 0; f < 600; f++) {
      const step = advanceAutoWalkWaypoints(pos, queue, 0.55, isWalkable, 0.55);
      expect(step.stalled).toBe(false);
      pos = { x: step.x, z: step.z, rotationY: step.rotationY };
      queue = step.remainingWaypoints;
      if (step.completed) {
        reachedZoneD = true;
        break;
      }
    }
    expect(reachedZoneD).toBe(true);
    expect(Math.hypot(pos.x - routeZoneD.destinationPoint.x, pos.z - routeZoneD.destinationPoint.z)).toBeLessThanOrEqual(0.65);
  });

  it('handles unreachable disconnected graph gracefully (reachable: false, zero teleport) and binds real boothId/zoneId indicators', () => {
    const world = createMock100BoothWorld();
    const disconnected = {
      ...world,
      walkwayGraph: {
        nodes: [
          { id: 'n1', x: 0, z: 130 },
          { id: 'n2', x: -50, z: -130 },
        ],
        edges: [] as Array<[string, string]>,
      },
    };
    const rBooth = computeGuidedRoute(disconnected, { x: 0, z: 130 }, world.booths[0]);
    expect(rBooth.reachable).toBe(false);
    expect(rBooth.waypoints).toEqual([]);

    const rZone = computeGuidedZoneRoute(disconnected, { x: 0, z: 130 }, world.zones[0]);
    expect(rZone.reachable).toBe(false);
    expect(rZone.waypoints).toEqual([]);

    const indicators = computeWorldAnchoredIndicators(world.spawnPoint, world.booths, world.zones, 3, 2);
    expect(MAX_NAV_LABEL_RADIUS_M).toBe(50);
    // Strict 50m radius cap for ALL booth & zone 3D indicators
    expect(indicators.booths.every((b) => b.distanceM <= 50 && world.booths.some((wb) => wb.boothId === b.boothId))).toBe(true);
    expect(indicators.zones.every((z) => z.distanceM <= 50 && world.zones.some((wz) => wz.id === z.zoneId))).toBe(true);

    // Standing inside central avenue near Zone C/H -> shows nearby booths & zones strictly <= 50m
    const midIndicators = computeWorldAnchoredIndicators({ x: 0, z: -7.5 }, world.booths, world.zones, 3, 3);
    expect(midIndicators.booths.length).toBeGreaterThan(0);
    expect(midIndicators.booths.every((b) => b.distanceM <= 50)).toBe(true);
    expect(midIndicators.zones.length).toBeGreaterThan(0);
    expect(midIndicators.zones.every((z) => z.distanceM <= 50)).toBe(true);
  });

  it('verifies CharacterNavigationRing3D enables raycast ONLY on interactive labels with drag/debounce guards and DynamicExhibitionScene cancels Auto-Walk on WASD/Joystick', () => {
    const ringSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/scene/v28/CharacterNavigationRing3D.tsx'),
      'utf8'
    );
    const sceneSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/scene/v28/DynamicExhibitionScene.tsx'),
      'utf8'
    );

    // Drag guard, tap debounce, stopPropagation, and non-raycast decorative arrows preserved
    expect(ringSrc).toContain('LABEL_CLICK_MAX_DRAG_PX');
    expect(ringSrc).toContain('LABEL_TAP_DEBOUNCE_MS');
    expect(ringSrc).toContain('e.stopPropagation()');
    expect(ringSrc).toContain('raycast={NO_RAYCAST}');
    expect(ringSrc).toContain('onClickBoothIndicator');
    expect(ringSrc).toContain('onClickZoneIndicator');

    // Scene uses multi-waypoint Auto-Walk and cancels on WASD/Joystick
    expect(sceneSrc).toContain('advanceAutoWalkWaypoints');
    expect(sceneSrc).toContain('autoWalkQueueRef.current = []');
    expect(sceneSrc).toContain('onAutoWalkCancelRef.current?.()');
  });
});
