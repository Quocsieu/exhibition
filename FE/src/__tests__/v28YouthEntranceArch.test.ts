import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import { computeYouthArchPlacement } from '../scene/v28/YouthEntranceArch3D';

describe('Grand Expo V28 Phase 6 — Youth-Themed 3D Entrance Arch Placement & Clearance', () => {
  it('places arch cleanly on the central avenue threshold ahead of spawn with zero booth/walkway/roof collision', () => {
    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: 100,
      zoneCount: 10,
      boothsPerZone: 10,
    });

    const spec = computeYouthArchPlacement({
      centralAvenueBounds: layout.centralAvenueBounds,
      welcomeAreaBounds: layout.welcomeAreaBounds,
      hallBounds: layout.hallBounds,
      roofBounds: layout.roofBounds,
    });

    // Centered on central avenue X = 0
    expect(spec.x).toBeCloseTo(0, 2);
    // Positioned ahead of spawn (spawn z = 137.93, looking -Z) at the grand avenue threshold
    expect(spec.z).toBeLessThan(layout.spawnPoint.z - 10);
    expect(spec.z).toBeGreaterThan(layout.hallBounds.minZ);

    // Clear walking span >= 13m (full central avenue open for avatar)
    expect(spec.clearSpanWidth).toBeGreaterThanOrEqual(13.0);
    // Pillars stay outside central avenue lane (|x| > 7.0)
    expect(spec.pillarOffsetX).toBeGreaterThan(layout.centralAvenueBounds.maxX);
    // Headroom >= 4.6m (well above avatar 1.8m & camera 2.4-3.2m) and crown < roof eave 13m
    expect(spec.clearHeight).toBeGreaterThanOrEqual(4.6);
    expect(spec.totalHeight).toBeLessThan(layout.roofBounds.eaveHeight);

    // Stays strictly within hallBounds
    expect(spec.x - spec.totalWidth / 2).toBeGreaterThan(layout.hallBounds.minX);
    expect(spec.x + spec.totalWidth / 2).toBeLessThan(layout.hallBounds.maxX);

    // Zero overlap with all 100 booths (minimum lateral/longitudinal clearance > 5m)
    for (const p of layout.placements) {
      const dist = Math.hypot(p.positionX - spec.x, p.positionZ - spec.z);
      expect(dist).toBeGreaterThan(15);
    }
  });
});
