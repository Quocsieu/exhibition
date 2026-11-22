import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import {
  buildNearbyDiscoveryIndex,
  findNearbyBooths,
  NEARBY_ENTER_RADIUS_M,
} from '../scene/v28/v28NearbyDiscovery';
import {
  NEARBY_WIDGET_ENTER_RADIUS_M,
  NEARBY_WIDGET_EXIT_RADIUS_M,
  NEARBY_DISMISS_REOPEN_MOVE_M,
} from '../components/v28/NearbyDiscoveryWidget';
import type { V28BoothPlacementView } from '../services/v28Api';

describe('Grand Expo V28 Phase 8 — Nearby Booth Notification Optimization', () => {
  it('tightens live UI notification radius vs baseline 18.5m and preserves hysteresis & max-3 cap', () => {
    expect(NEARBY_WIDGET_ENTER_RADIUS_M).toBeLessThan(NEARBY_ENTER_RADIUS_M);
    expect(NEARBY_WIDGET_EXIT_RADIUS_M).toBeGreaterThan(NEARBY_WIDGET_ENTER_RADIUS_M);
    expect(NEARBY_DISMISS_REOPEN_MOVE_M).toBeGreaterThanOrEqual(3.0);

    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: 100,
      zoneCount: 10,
      boothsPerZone: 10,
    });
    const booths: V28BoothPlacementView[] = layout.placements.map((p) => ({
      versionId: 'v-p8',
      boothId: `booth-${p.slotIndex + 1}`,
      boothName: `Gian #${p.slotIndex + 1}`,
      tagline: '',
      description: '',
      category: 'Nông sản',
      color: '#059669',
      companyId: 'c1',
      companyName: `Doanh nghiệp #${p.slotIndex + 1}`,
      zoneId: `z-${p.zoneCode}`,
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
      assignedSlotCount: 0,
    }));
    const index = buildNearbyDiscoveryIndex({ booths, hallBounds: layout.hallBounds });

    // Distant boulevard center (x = 0, z = -131.88, ~17.8m away from #7/#57) should NOT trigger premature notification
    const farFromBooths = findNearbyBooths(index, { x: 0, z: -131.88 }, {
      enterRadiusM: NEARBY_WIDGET_ENTER_RADIUS_M,
      exitRadiusM: NEARBY_WIDGET_EXIT_RADIUS_M,
      maxResults: 3,
    });
    expect(farFromBooths.length).toBe(0);

    // Standing right at Booth #1 approachPoint triggers cleanly with <= 3 booths
    const closeToB1 = findNearbyBooths(index, booths[0].approachPoint, {
      enterRadiusM: NEARBY_WIDGET_ENTER_RADIUS_M,
      exitRadiusM: NEARBY_WIDGET_EXIT_RADIUS_M,
      maxResults: 3,
    });
    expect(closeToB1.length).toBeGreaterThan(0);
    expect(closeToB1.length).toBeLessThanOrEqual(3);
    expect(closeToB1[0].boothNumber).toBe(1);
  });
});
