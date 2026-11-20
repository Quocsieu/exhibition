import { describe, it, expect } from 'vitest';
import {
  clampCameraPosition,
  clampPointToWalkable,
  computeRotatedBoothCollider,
  isPointWalkable,
} from '../scene/v28/v28NavigationBounds';

describe('V28 PHASE 1 — Adaptive Walkable Regions, Rotated Booth Colliders & Camera Bounds', () => {
  it('rotates booth collider width/depth accurately for ±90° U-wing booths', () => {
    const northBooth = computeRotatedBoothCollider(
      { boothId: 'b1', positionX: 0, positionZ: 0, rotationY: 0, footprintWidth: 6.72, footprintDepth: 5.19 },
      0.35
    );
    const eastWingBooth = computeRotatedBoothCollider(
      { boothId: 'b2', positionX: 0, positionZ: 0, rotationY: Math.PI / 2, footprintWidth: 6.72, footprintDepth: 5.19 },
      0.35
    );

    expect(northBooth.maxX - northBooth.minX).toBeCloseTo(6.72 + 0.7, 2);
    expect(northBooth.maxZ - northBooth.minZ).toBeCloseTo(5.19 + 0.7, 2);
    // Rotated 90°: X span becomes depth, Z span becomes width!
    expect(eastWingBooth.maxX - eastWingBooth.minX).toBeCloseTo(5.19 + 0.7, 2);
    expect(eastWingBooth.maxZ - eastWingBooth.minZ).toBeCloseTo(6.72 + 0.7, 2);
  });

  it('enforces multi-region walkability (blocks outer voids & rotated booths) and clamps out-of-bounds teleports', () => {
    const regions = [
      // Grand Boulevard
      { minX: -120, maxX: 120, minZ: -7, maxZ: 7 },
      // Narrower South U-zone (only x in [-45, -10])
      { minX: -45, maxX: -10, minZ: 7, maxZ: 50 },
    ];
    const boothColliders = [
      computeRotatedBoothCollider(
        { boothId: 'wing-1', positionX: -41, positionZ: 25, rotationY: Math.PI / 2, footprintWidth: 6.72, footprintDepth: 5.19 },
        0.35
      ),
    ];

    // Inside Grand Boulevard -> walkable
    expect(isPointWalkable(0, 0, regions, boothColliders)).toBe(true);
    // Inside South U-zone courtyard -> walkable
    expect(isPointWalkable(-28, 25, regions, boothColliders)).toBe(true);
    // Inside rotated wing booth -> blocked
    expect(isPointWalkable(-41, 25, regions, boothColliders)).toBe(false);
    // Inside empty outer void beside narrower South row (x = -90, z = 30) -> BLOCKED!
    expect(isPointWalkable(-90, 30, regions, boothColliders)).toBe(false);

    // Out-of-bounds teleport snaps into nearest valid walkable region
    const clamped = clampPointToWalkable(-90, 30, regions, boothColliders, { x: 0, z: 0 });
    expect(clamped.clamped).toBe(true);
    expect(isPointWalkable(clamped.x, clamped.z, regions, boothColliders)).toBe(true);
  });

  it('clamps explore/focus camera strictly inside hallBounds and overview camera within adaptive radius', () => {
    const hallBounds = { minX: -130, maxX: 130, minZ: -90, maxZ: 90 };

    const exploreCam = clampCameraPosition({ x: 250, y: 1.0, z: -180 }, hallBounds, 'explore', 158);
    expect(exploreCam.x).toBeLessThanOrEqual(hallBounds.maxX - 1.2);
    expect(exploreCam.z).toBeGreaterThanOrEqual(hallBounds.minZ + 1.2);
    expect(exploreCam.y).toBeGreaterThanOrEqual(2.2);

    const overviewCam = clampCameraPosition({ x: 999, y: 999, z: -999 }, hallBounds, 'overview', 158);
    expect(overviewCam.x).toBeLessThanOrEqual(hallBounds.maxX + 120);
    expect(overviewCam.y).toBeLessThanOrEqual(158 * 2.2 + 1);
  });
});
