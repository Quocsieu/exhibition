import { describe, expect, it } from 'vitest';
import {
  boothLocalToWorld,
  computeV28BoothFocusCamera,
  computeV28CameraRelativeMove,
  computeV28ExploreCamera,
  getBoothForwardVector,
  shortestAngleDiff,
  V28_EXPLORE_FOV,
  V28_FOCUS_FOV,
} from '../scene/v28/v28CameraController';
import { computeRotatedBoothCollider } from '../scene/v28/v28NavigationBounds';
import type { V28ArchetypeId, V28RectBounds } from '../services/v28Api';

const HALL_BOUNDS: V28RectBounds = {
  minX: -40,
  maxX: 40,
  minZ: -40,
  maxZ: 40,
};

const ALL_ARCHETYPES: V28ArchetypeId[] = [
  'signature_ring',
  'organic_flow',
  'grand_portal',
  'wave_pavilion',
  'gallery_arch',
  'dynamic_frame',
];

describe('V28 Camera Focus & Movement Parity with V27.5', () => {
  it('computes exact booth forward vector and local-to-world transforms across all 4 cardinal orientations', () => {
    const cases = [
      { rot: 0, fx: 0, fz: 1 },
      { rot: Math.PI / 2, fx: 1, fz: 0 },
      { rot: -Math.PI / 2, fx: -1, fz: 0 },
      { rot: Math.PI, fx: 0, fz: -1 },
    ];
    for (const c of cases) {
      const fwd = getBoothForwardVector(c.rot);
      expect(fwd.x).toBeCloseTo(c.fx, 5);
      expect(fwd.z).toBeCloseTo(c.fz, 5);

      const worldPt = boothLocalToWorld(
        { positionX: 10, positionZ: -5, rotationY: c.rot },
        0,
        2.5,
        10
      );
      expect(worldPt.x).toBeCloseTo(10 + 10 * c.fx, 4);
      expect(worldPt.y).toBeCloseTo(2.5, 4);
      expect(worldPt.z).toBeCloseTo(-5 + 10 * c.fz, 4);
    }
  });

  it('places Focus camera directly in front of every booth orientation (0°, +90°, -90°, 180°) with V27.5 38° FOV', () => {
    const orientations = [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4];

    for (const rot of orientations) {
      const booth = {
        boothId: `b-${rot.toFixed(2)}`,
        positionX: 0,
        positionZ: 0,
        rotationY: rot,
        footprintWidth: 8.4, // 1.25x scale
        footprintDepth: 6.25,
        archetypeId: 'grand_portal' as V28ArchetypeId,
      };
      const pose = computeV28BoothFocusCamera(booth, 1920, 1080, HALL_BOUNDS);
      expect(pose.fov).toBe(V28_FOCUS_FOV);

      // Vector from booth center to camera MUST align with booth forward vector (dot > 0.999)
      const toCamX = pose.cameraPosition.x - booth.positionX;
      const toCamZ = pose.cameraPosition.z - booth.positionZ;
      const dist = Math.hypot(toCamX, toCamZ);
      const dot = (toCamX / dist) * pose.forward.x + (toCamZ / dist) * pose.forward.z;
      expect(dot).toBeGreaterThan(0.999);

      // Elevated slightly above lookAt target (gentle downward architectural angle like V27.5)
      expect(pose.cameraPosition.y).toBeGreaterThan(pose.lookAtTarget.y);
      expect(pose.lookAtTarget.y).toBeGreaterThan(1.5);
      // Camera is outside the front of the booth (never inside or behind)
      expect(dist).toBeGreaterThan(booth.footprintDepth / 2 + 4.0);
    }
  });

  it('adapts focus distance cleanly across all 6 archetypes and Desktop/Tablet/Mobile viewports', () => {
    const viewports = [
      { name: 'Desktop 1920x1080', w: 1920, h: 1080 },
      { name: 'Desktop 1366x768', w: 1366, h: 768 },
      { name: 'Tablet 768x1024', w: 768, h: 1024 },
      { name: 'Mobile 390x844', w: 390, h: 844 },
      { name: 'Mobile Landscape 844x390', w: 844, h: 390 },
    ];

    for (const archetypeId of ALL_ARCHETYPES) {
      const booth = {
        boothId: `b-${archetypeId}`,
        positionX: 0,
        positionZ: 0,
        rotationY: 0,
        footprintWidth: archetypeId === 'dynamic_frame' ? 8.59 : 8.4,
        footprintDepth: 6.25,
        archetypeId,
      };

      const desktop = computeV28BoothFocusCamera(booth, 1920, 1080, HALL_BOUNDS);
      const mobilePortrait = computeV28BoothFocusCamera(booth, 390, 844, HALL_BOUNDS);

      // Mobile portrait (narrow aspect) MUST step further back so booth width & signage aren't cropped
      expect(mobilePortrait.distance).toBeGreaterThan(desktop.distance);

      for (const vp of viewports) {
        const pose = computeV28BoothFocusCamera(booth, vp.w, vp.h, HALL_BOUNDS);
        expect(Number.isFinite(pose.cameraPosition.x)).toBe(true);
        expect(Number.isFinite(pose.cameraPosition.y)).toBe(true);
        expect(Number.isFinite(pose.cameraPosition.z)).toBe(true);
        expect(pose.cameraPosition.x).toBeGreaterThanOrEqual(HALL_BOUNDS.minX);
        expect(pose.cameraPosition.x).toBeLessThanOrEqual(HALL_BOUNDS.maxX);
        expect(pose.cameraPosition.z).toBeGreaterThanOrEqual(HALL_BOUNDS.minZ);
        expect(pose.cameraPosition.z).toBeLessThanOrEqual(HALL_BOUNDS.maxZ);
      }
    }
  });

  it('pulls focus camera safely inside dynamic hallBounds and clear of opposite-row neighbor booths', () => {
    // Booth near South edge facing South (+Z) where full distance would exceed maxZ = 40
    const edgeBooth = {
      boothId: 'edge-booth',
      positionX: 0,
      positionZ: 30,
      rotationY: 0,
      footprintWidth: 8.4,
      footprintDepth: 6.25,
      archetypeId: 'grand_portal' as V28ArchetypeId,
    };
    const edgePose = computeV28BoothFocusCamera(edgeBooth, 1440, 900, HALL_BOUNDS);
    expect(edgePose.cameraPosition.z).toBeLessThanOrEqual(HALL_BOUNDS.maxZ - 0.8);
    expect(edgePose.cameraPosition.z).toBeGreaterThan(edgeBooth.positionZ + edgeBooth.footprintDepth / 2);

    // Opposite booth placed right across an aisle at z = 14
    const boothA = {
      boothId: 'booth-a',
      positionX: 0,
      positionZ: 0,
      rotationY: 0,
      footprintWidth: 8.4,
      footprintDepth: 6.25,
      archetypeId: 'gallery_arch' as V28ArchetypeId,
    };
    const neighborB = {
      boothId: 'booth-b',
      positionX: 0,
      positionZ: 15,
      rotationY: Math.PI,
      footprintWidth: 8.4,
      footprintDepth: 6.25,
      archetypeId: 'gallery_arch' as V28ArchetypeId,
    };
    const colliders = [computeRotatedBoothCollider(boothA, 0.35), computeRotatedBoothCollider(neighborB, 0.35)];
    const poseA = computeV28BoothFocusCamera(boothA, 1440, 900, HALL_BOUNDS, colliders);
    // Camera must NOT land inside neighborB's collider
    expect(poseA.cameraPosition.z).toBeLessThan(colliders[1].minZ);
  });

  it('computes V27.5-parity Low-Angle Explore camera with obstacle pullback behind avatar', () => {
    const blockingBooth = {
      boothId: 'behind-booth',
      positionX: 0,
      positionZ: -5,
      rotationY: 0,
      footprintWidth: 8.4,
      footprintDepth: 6.25,
    };
    const colliders = [computeRotatedBoothCollider(blockingBooth, 0.35)];

    // Player at (0, 0) facing +Z (yaw = 0) -> camera wants to stand at (0, y, -5.4), which hits blockingBooth!
    const tpBlocked = computeV28ExploreCamera(0, 0, 0, 0, 1.0, HALL_BOUNDS, colliders);
    expect(tpBlocked.fov).toBe(V28_EXPLORE_FOV);
    expect(tpBlocked.safeDistance).toBeLessThan(5.4);
    expect(tpBlocked.cameraPosition.y).toBeGreaterThanOrEqual(1.35);
    expect(tpBlocked.cameraPosition.y).toBeLessThan(4.0);
    // LookAt is ahead along +Z
    expect(tpBlocked.lookAtTarget.z).toBeGreaterThan(0);

    // Open space -> full desired distance
    const tpOpen = computeV28ExploreCamera(0, 10, 0, 0, 1.0, HALL_BOUNDS, []);
    expect(tpOpen.safeDistance).toBeCloseTo(5.4, 2);
  });

  it('computes camera-relative WASD/Joystick movement with strict diagonal normalization', () => {
    // Facing +X (yaw = +PI/2): pressing W (inputZ = -1) moves along +X
    const fwdRight = computeV28CameraRelativeMove(0, -1, Math.PI / 2);
    expect(fwdRight.moveX).toBeCloseTo(1, 5);
    expect(fwdRight.moveZ).toBeCloseTo(0, 5);

    // Facing +X (yaw = +PI/2): pressing D (inputX = +1) strafes along +Z (right of +X in right-handed Y-up)
    const strafeRight = computeV28CameraRelativeMove(1, 0, Math.PI / 2);
    expect(strafeRight.moveX).toBeCloseTo(0, 5);
    expect(strafeRight.moveZ).toBeCloseTo(1, 5);

    // Diagonal W+D (inputX = 1, inputZ = -1) MUST have unit speed (magnitude === 1.0, never sqrt(2))
    const diag = computeV28CameraRelativeMove(1, -1, 0.7);
    expect(Math.hypot(diag.moveX, diag.moveZ)).toBeCloseTo(1.0, 5);

    // Shortest angle diff wraps cleanly across ±PI
    expect(shortestAngleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
  });
});
