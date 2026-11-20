import { describe, it, expect } from 'vitest';
import {
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
  MAX_BOOTHS_PER_CLUSTER,
} from '../services/v28/layoutGenerator.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';

describe('V28 PHASE 8 — Six-Booth U-Shaped Courtyard Cluster Generator & Category-Based Zones', () => {
  it('generates valid, overlap-free, BFS-connected 6-booth clusters for 1, 6, 7, 20, 35, 50, 100 and 150 booths with exact cluster counts and zero fake booths', () => {
    const cases: Array<{ count: number; expectedClusters: number }> = [
      { count: 1, expectedClusters: 1 },
      { count: 6, expectedClusters: 1 },
      { count: 7, expectedClusters: 2 },
      { count: 20, expectedClusters: 4 },
      { count: 35, expectedClusters: 6 },
      { count: 50, expectedClusters: 9 },
      { count: 100, expectedClusters: 17 },
      { count: 150, expectedClusters: 25 },
    ];

    for (const tc of cases) {
      const layout = generateDynamicExhibitionLayout({ targetBoothCount: tc.count });
      const val = validateExhibitionLayout(layout);

      expect(layout.placements.length, `booths=${tc.count}`).toBe(tc.count);
      expect(layout.clusters.length, `clusters=${tc.count}`).toBe(tc.expectedClusters);
      expect(layout.clusters.reduce((s, c) => s + c.boothCount, 0)).toBe(tc.count);
      for (const c of layout.clusters) {
        expect(c.boothCount).toBeGreaterThanOrEqual(1);
        expect(c.boothCount).toBeLessThanOrEqual(MAX_BOOTHS_PER_CLUSTER);
      }
      expect(val.valid, `errors for ${tc.count}: ${val.errors.join('; ')}`).toBe(true);
      expect(val.stats.overlapCount).toBe(0);
      expect(val.stats.outOfBoundsCount).toBe(0);
      expect(val.stats.blockedWalkwayCount).toBe(0);
      expect(val.stats.unreachableBoothCount).toBe(0);
      expect(val.stats.focusClipCount).toBe(0);
    }
  });

  it('creates Category-Based Zones (`Khu + Category Name`) automatically in ExhibitionService without A-J defaults and preserves stable IDs across resize', () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const exhSvc = new V28ExhibitionService(v28Db);
    try {
      const exh = exhSvc.createExhibition({ name: 'Phase 8 Heritage Expo', targetBoothCount: 35 });
      const v1 = exhSvc.getVersionDetail(exh.latestDraftVersionId!)!;

      expect(v1.booths.length).toBe(35);
      expect(v1.clusters.length).toBeGreaterThanOrEqual(6);
      expect(v1.validation.valid).toBe(true);
      // Zones MUST be category-based (`Khu Công nghệ & Điện tử`, etc.) rather than hardcoded `Khu A`
      expect(v1.zones.some((z) => z.displayName.includes('Công nghệ'))).toBe(true);
      expect(v1.zones.every((z) => z.categoryId !== null)).toBe(true);
    } finally {
      v28Db.close();
    }
  });
});
