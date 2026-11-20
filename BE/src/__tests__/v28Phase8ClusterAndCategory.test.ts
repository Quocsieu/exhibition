import { describe, it, expect } from 'vitest';
import {
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
  computeUZoneSideCounts,
} from '../services/v28/layoutGenerator.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';

describe('V28 PHASE 8 — Multiple Variable-Size U-Shaped Category Zones & V27.5 Reuse', () => {
  it('generates valid, overlap-free, BFS-connected multi-U layouts for 1, 5, 6, 20, 50, 100 and 150 booths with adaptive walkableRegions', () => {
    for (const count of [1, 5, 6, 20, 50, 100, 150]) {
      const layout = generateDynamicExhibitionLayout({ targetBoothCount: count });
      const val = validateExhibitionLayout(layout);

      expect(layout.placements.length, `booths=${count}`).toBe(count);
      expect(layout.clusters.length).toBe(layout.zones.length); // 1 U-shaped zone per category zone!
      expect(layout.clusters.reduce((s, c) => s + c.boothCount, 0)).toBe(count);
      expect(layout.walkableRegions.length).toBeGreaterThanOrEqual(3);
      expect(val.valid, `errors for ${count}: ${val.errors.join('; ')}`).toBe(true);
      expect(val.stats.overlapCount).toBe(0);
      expect(val.stats.outOfBoundsCount).toBe(0);
      expect(val.stats.blockedWalkwayCount).toBe(0);
      expect(val.stats.unreachableBoothCount).toBe(0);
      expect(val.stats.focusClipCount).toBe(0);

      // Every booth approachPoint & Spawn must fall inside at least one adaptive walkableRegion
      const inRegions = (x: number, z: number) =>
        layout.walkableRegions.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
      expect(inRegions(layout.spawnPoint.x, layout.spawnPoint.z), `spawn in regions (${count})`).toBe(true);
      for (const p of layout.placements) {
        expect(inRegions(p.approachPoint.x, p.approachPoint.z), `approach #${p.slotIndex} in regions (${count})`).toBe(true);
      }
    }
  });

  it('supports uneven category allocations (25 / 20 / 20 / 15 / 20 = 100 booths) with facing North & South U orientations', () => {
    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: 100,
      categoryZones: [
        { categoryId: 'cat-tech', categoryName: 'Công nghệ & Điện tử', boothCount: 25 },
        { categoryId: 'cat-living', categoryName: 'Nội thất & Trang trí', boothCount: 20 },
        { categoryId: 'cat-fashion', categoryName: 'Thời trang', boothCount: 20 },
        { categoryId: 'cat-food', categoryName: 'Thực phẩm & Đồ uống', boothCount: 15 },
        { categoryId: 'cat-beauty', categoryName: 'Mỹ phẩm', boothCount: 20 },
      ],
    });
    const val = validateExhibitionLayout(layout);

    expect(val.valid, val.errors.join('; ')).toBe(true);
    expect(layout.zones.length).toBe(5);
    expect(layout.clusters.length).toBe(5);
    expect(layout.zones.map((z) => z.boothCount)).toEqual([25, 20, 20, 15, 20]);
    expect(layout.zones[0].displayName).toBe('Khu Công nghệ & Điện tử');
    // Both East-opening (Left row) and West-opening (Right row) facing U-zones present!
    expect(layout.clusters.some((c) => c.openingDirection === 'east')).toBe(true);
    expect(layout.clusters.some((c) => c.openingDirection === 'west')).toBe(true);
    // 6-booth U matches V27.5 exact (2 back, 2 left, 2 right)
    expect(computeUZoneSideCounts(6)).toEqual({ backCount: 2, leftCount: 2, rightCount: 2 });
  });

  it('creates Category-Based U-Zones automatically in ExhibitionService without hardcoded A-J names', () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const exhSvc = new V28ExhibitionService(v28Db);
    try {
      const exh = exhSvc.createExhibition({ name: 'Multi-U Heritage Expo', targetBoothCount: 100 });
      const v1 = exhSvc.getVersionDetail(exh.latestDraftVersionId!)!;

      expect(v1.booths.length).toBe(100);
      expect(v1.zones.length).toBe(6);
      expect(v1.clusters.length).toBe(6);
      expect(v1.validation.valid).toBe(true);
      expect(v1.zones.some((z) => z.displayName.includes('Công nghệ'))).toBe(true);
      expect(v1.zones.every((z) => z.categoryId !== null)).toBe(true);
      expect(Array.isArray(v1.walkableRegions) && v1.walkableRegions.length >= 6).toBe(true);

      // Verify exact dynamic counts (1, 5, 6, 20, 50, 100, 150), 0 duplicate Booth IDs & non-destructive resize
      for (const n of [1, 5, 6, 20, 50, 150, 100]) {
        const draft = exhSvc.createDraftVersion(exh.id, { targetBoothCount: n });
        const published = exhSvc.publishVersion(exh.id, draft.versionId);
        const reloaded = exhSvc.getActiveExhibitionWorld();
        expect(published.booths.length).toBe(n);
        expect(reloaded.booths.length).toBe(n);
        expect(new Set(reloaded.booths.map((b) => b.boothId)).size).toBe(n);
        expect(reloaded.validation.valid).toBe(true);
      }
    } finally {
      v28Db.close();
    }
  });
});
