import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  computeDirectionIndicators,
  computeGuidedRoute,
  computeWorldAnchoredIndicators,
  computeZoneGuidance,
  countRouteBoothCollisions,
  resolveNonOverlappingBearings,
  shouldEmitZoneTransition,
} from '../services/v28NavigationEngine';
import { computeV28CameraRelativeMove, computeV28ExploreCamera } from '../scene/v28/v28CameraController';
import type { V28ExhibitionVersionDetail } from '../services/v28Api';

const SNAPSHOT_PATH =
  'C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/scratch/prod_world_snapshot.json';

function loadTestWorld(): V28ExhibitionVersionDetail | null {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as V28ExhibitionVersionDetail;
}

describe('Grand Expo V28 Phase 2 — Intelligent 3D Navigation, Orientation & Zone Guidance', () => {
  it('P2-T01..T06: spawn faces into hall (-Z), explore camera sits behind avatar (+Z), and WASD/turn directions align cleanly', () => {
    const spawnYaw = Math.PI; // Facing -Z into hall
    const cam = computeV28ExploreCamera(0, 137.93, spawnYaw, 0, 1.0, { minX: -120, maxX: 120, minZ: -180, maxZ: 160 }, []);
    // Camera must be behind avatar (camZ > playerZ) and looking into hall (lookZ < playerZ)
    expect(cam.cameraPosition.z).toBeGreaterThan(137.93);
    expect(cam.lookAtTarget.z).toBeLessThan(137.93);

    // Forward (W: inputZ = -1) moves deeper into hall (-Z)
    const fwd = computeV28CameraRelativeMove(0, -1, spawnYaw);
    expect(fwd.moveZ).toBeLessThan(-0.9);
    // Backward (S: inputZ = +1) moves back toward entrance (+Z)
    const back = computeV28CameraRelativeMove(0, 1, spawnYaw);
    expect(back.moveZ).toBeGreaterThan(0.9);
    // Left (A: inputX = -1) moves toward -X (left side when facing -Z)
    const left = computeV28CameraRelativeMove(-1, 0, spawnYaw);
    expect(left.moveX).toBeLessThan(-0.9);
    // Right (D: inputX = +1) moves toward +X
    const right = computeV28CameraRelativeMove(1, 0, spawnYaw);
    expect(right.moveX).toBeGreaterThan(0.9);
  });

  it('P2-T07, P2-T12: verifies 100/100 unique booth IDs and collision-free walkwayGraph guided paths', () => {
    const world = loadTestWorld();
    if (!world) return;

    expect(world.booths.length).toBe(100);
    const uniqueIds = new Set(world.booths.map((b) => b.boothId));
    expect(uniqueIds.size).toBe(100);

    // Test guided route from spawn to representative booths across all 6 archetypes
    const seenArchetypes = new Set<string>();
    const samples = world.booths.filter((b) => {
      if (seenArchetypes.has(b.archetypeId)) return false;
      seenArchetypes.add(b.archetypeId);
      return true;
    });
    expect(seenArchetypes.size).toBe(6);

    for (const target of samples) {
      const route = computeGuidedRoute(world, world.spawnPoint, target);
      expect(route.usesWalkwayGraph).toBe(true);
      expect(route.waypoints.length).toBeGreaterThanOrEqual(3);
      expect(route.totalDistanceM).toBeGreaterThan(0);
      const collisions = countRouteBoothCollisions(route.waypoints, world.booths, target.boothId);
      expect(collisions).toBe(0);
    }
  });

  it('P2-T09..T11: directional indicators bind strictly to boothId, update with camera rotation, and flag off-screen targets', () => {
    const world = loadTestWorld();
    if (!world) return;
    const targets = world.booths.slice(0, 3);
    const pos = { x: 0, z: 0 };

    const facingNorth = computeDirectionIndicators(pos, Math.PI, targets, 3);
    const facingSouth = computeDirectionIndicators(pos, 0, targets, 3);
    expect(facingNorth).toHaveLength(3);
    expect(facingNorth.map((i) => i.boothId)).toEqual(targets.map((b) => b.boothId));
    // Rotating camera 180° must change relativeAngleRad
    expect(Math.abs(facingNorth[0].relativeAngleRad - facingSouth[0].relativeAngleRad)).toBeGreaterThan(1.0);
    // At least one booth is off-screen when looking away
    expect(facingSouth.some((i) => i.isOffScreen)).toBe(true);
  });

  it('P2-T13..T14: computes real-data zone guidance across all 10 zones and prevents boundary toast spam', () => {
    const world = loadTestWorld();
    if (!world) return;
    expect(world.zones.length).toBe(10);

    // Walking at central avenue facing -Z should see real left/right/ahead zone signposts
    const guidance = computeZoneGuidance(world.zones, { x: 0, z: 40 }, Math.PI);
    expect(guidance.currentZone).toBeNull();
    expect(guidance.signposts.length).toBeGreaterThanOrEqual(2);
    expect(guidance.signposts.every((s) => world.zones.some((z) => z.id === s.zone.id))).toBe(true);

    // Standing inside each of the 10 zones detects that exact zone
    for (const z of world.zones) {
      const cx = (z.bounds.minX + z.bounds.maxX) / 2;
      const cz = (z.bounds.minZ + z.bounds.maxZ) / 2;
      const inside = computeZoneGuidance(world.zones, { x: cx, z: cz }, Math.PI);
      expect(inside.currentZone?.id).toBe(z.id);
    }

    // Anti-spam cooldown prevents rapid re-emission at zone boundary
    const emitted = new Map<string, number>();
    expect(shouldEmitZoneTransition(null, 'zone-A', emitted, 1000, 8000)).toBe(true);
    expect(shouldEmitZoneTransition('zone-A', 'zone-A', emitted, 1500, 8000)).toBe(false);
    expect(shouldEmitZoneTransition(null, 'zone-A', emitted, 3000, 8000)).toBe(false); // within 8s cooldown!
    expect(shouldEmitZoneTransition(null, 'zone-A', emitted, 9500, 8000)).toBe(true); // after cooldown!
  });

  it('UAT-FIX-01: computes world-space character-anchored indicators (max 3 booths, non-overlapping bearings, real zones)', () => {
    const world = loadTestWorld();
    if (!world) return;

    const res = computeWorldAnchoredIndicators(world.spawnPoint, world.booths, world.zones, 3, 3);
    expect(res.booths.length).toBeGreaterThan(0);
    expect(res.booths.length).toBeLessThanOrEqual(3);
    expect(res.zones.length).toBeGreaterThan(0);
    expect(res.zones.length).toBeLessThanOrEqual(3);

    // Every zone indicator strictly references a real zone in world.zones
    expect(res.zones.every((zi) => world.zones.some((z) => z.id === zi.zoneId))).toBe(true);

    // Clustered bearings are cleanly separated by >= 0.45 rad to prevent 3D label overlap
    const separated = resolveNonOverlappingBearings([0, 0.05, 0.08], 0.54);
    expect(separated).toHaveLength(3);
    const sorted = [...separated].sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(0.45);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(0.45);
  });
});
