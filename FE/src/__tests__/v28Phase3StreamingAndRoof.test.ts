import { describe, it, expect } from 'vitest';
import {
  computeStreamingLodMap,
  DEFAULT_DESKTOP_STREAMING,
  DEFAULT_MOBILE_STREAMING,
  type BoothLodTier,
} from '../scene/v28/spatialStreaming';
import { computeParametricRoofSpec } from '../scene/v28/ParametricExpoRoof';
import type { V28BoothPlacementView } from '../services/v28Api';

function makeMockBooths(count: number): V28BoothPlacementView[] {
  const list: V28BoothPlacementView[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10);
    list.push({
      versionId: 'v-test',
      boothId: `booth-${i + 1}`,
      boothName: `Booth ${i + 1}`,
      tagline: '',
      description: '',
      category: 'Tech',
      color: '#0ea5e9',
      companyId: 'comp-1',
      companyName: 'Comp 1',
      zoneId: 'zone-a',
      zoneCode: 'A',
      zoneName: 'Khu A',
      slotIndex: i,
      positionX: (col - 4.5) * 14,
      positionZ: (row - 2) * 20,
      rotationY: 0,
      archetypeId: 'grand_portal',
      archetypeLabel: 'Grand Portal',
      archetypeTheme: 'tech',
      glbPath: 'models/booths/v27_4/booth_03_grand_portal_v27_4.glb',
      footprintWidth: 6.75,
      footprintDepth: 5.2,
      approachPoint: { x: 0, z: 0 },
      focusCameraPoint: { x: 0, z: 0 },
      placementStatus: 'placed',
      slots: [],
      assignedSlotCount: 0,
    });
  }
  return list;
}

describe('V28 PHASE 3 — 3-Ring Spatial Streaming, Hysteresis & Parametric Roof', () => {
  it('classifies 50 booths into Ring 0 (Near), Ring 1 (Mid), and Ring 2 (Far) respecting near budget', () => {
    const booths = makeMockBooths(50);
    // Run 3 ticks to drain staggered mount queue
    let lodMap: Record<string, BoothLodTier> = {};
    for (let t = 0; t < 4; t++) {
      lodMap = computeStreamingLodMap({
        booths,
        anchorX: 0,
        anchorZ: 0,
        cameraMode: 'explore',
        focusedBoothId: null,
        prevLodMap: lodMap,
        thresholds: DEFAULT_DESKTOP_STREAMING,
        maxPromotionsPerTick: 10,
      });
    }

    const counts = { 0: 0, 1: 0, 2: 0 };
    for (const tier of Object.values(lodMap)) counts[tier]++;

    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[0]).toBeLessThanOrEqual(DEFAULT_DESKTOP_STREAMING.maxNearBooths);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(0);
    expect(counts[0] + counts[1] + counts[2]).toBe(50);
  });

  it('prevents boundary thrashing via hysteresis between ring0Enter (26m) and ring0Leave (32m)', () => {
    const booth = makeMockBooths(1)[0];
    booth.positionX = 29; // Strictly inside hysteresis band (26 < 29 < 32)
    booth.positionZ = 0;

    // If previously Ring 0, stays Ring 0 at 29m
    const stayNear = computeStreamingLodMap({
      booths: [booth],
      anchorX: 0,
      anchorZ: 0,
      cameraMode: 'explore',
      focusedBoothId: null,
      prevLodMap: { [booth.boothId]: 0 },
      thresholds: DEFAULT_DESKTOP_STREAMING,
    });
    expect(stayNear[booth.boothId]).toBe(0);

    // If previously Ring 1, stays Ring 1 at 29m
    const stayMid = computeStreamingLodMap({
      booths: [booth],
      anchorX: 0,
      anchorZ: 0,
      cameraMode: 'explore',
      focusedBoothId: null,
      prevLodMap: { [booth.boothId]: 1 },
      thresholds: DEFAULT_DESKTOP_STREAMING,
    });
    expect(stayMid[booth.boothId]).toBe(1);
  });

  it('immediately promotes focusedBooth to Ring 0 and respects mobile near budget', () => {
    const booths = makeMockBooths(50);
    const farBooth = booths[49];
    const lodMap = computeStreamingLodMap({
      booths,
      anchorX: -100,
      anchorZ: -100,
      cameraMode: 'focus',
      focusedBoothId: farBooth.boothId,
      prevLodMap: {},
      thresholds: DEFAULT_MOBILE_STREAMING,
      maxPromotionsPerTick: 4,
    });
    expect(lodMap[farBooth.boothId]).toBe(0);
  });

  it('generates scaled parametric dome roof ribs, columns, and purlins for 20, 50, and 100 booth halls', () => {
    const halls = [
      { hallWidth: 94, hallDepth: 72, eaveHeight: 11.5, roofRise: 11.28, ribSpacing: 10, skylightRatio: 0.28 },
      { hallWidth: 118, hallDepth: 110, eaveHeight: 13.5, roofRise: 14.16, ribSpacing: 10, skylightRatio: 0.28 },
      { hallWidth: 142, hallDepth: 162, eaveHeight: 13.5, roofRise: 17.04, ribSpacing: 12, skylightRatio: 0.28 },
    ];
    for (const h of halls) {
      const spec = computeParametricRoofSpec({
        ...h,
        bounds: {
          minX: -h.hallWidth / 2,
          maxX: h.hallWidth / 2,
          minZ: -h.hallDepth / 2,
          maxZ: h.hallDepth / 2,
        },
      });
      expect(spec.ribZPositions.length).toBeGreaterThanOrEqual(7);
      expect(spec.columnPositions.length).toBe(spec.ribZPositions.length * 2);
      expect(spec.purlinOffsets.length).toBe(7);
      // Crown height equals eaveHeight + roofRise at center purlin (x=0)
      const centerPurlin = spec.purlinOffsets[3];
      expect(centerPurlin.x).toBe(0);
      expect(centerPurlin.y).toBeCloseTo(h.eaveHeight + h.roofRise, 1);
    }
  });
});
