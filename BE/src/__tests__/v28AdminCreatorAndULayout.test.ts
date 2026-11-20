import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
} from '../services/v28/layoutGenerator.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';

describe('V28 ADMIN EXHIBITION CREATOR — Dynamic Zone x Booth Config, Facing Left/Right U-Layout, Safe Delete & Website Discovery', () => {
  it('generates valid, overlap-free, BFS-connected 2-column facing U-layouts for 1x1, 1x5, 2x10, 5x10, 10x10, 10x20, 20x10', () => {
    const cases: Array<[number, number]> = [
      [1, 1],
      [1, 5],
      [2, 10],
      [5, 10],
      [10, 10],
      [10, 20],
      [20, 10],
    ];

    for (const [zoneCount, boothsPerZone] of cases) {
      const total = zoneCount * boothsPerZone;
      const layout = generateDynamicExhibitionLayout({
        targetBoothCount: total,
        zoneCount,
        boothsPerZone,
      });
      const val = validateExhibitionLayout(layout);

      expect(layout.zones.length, `zones for ${zoneCount}x${boothsPerZone}`).toBe(zoneCount);
      expect(layout.placements.length, `booths for ${zoneCount}x${boothsPerZone}`).toBe(total);
      expect(val.valid, `errors for ${zoneCount}x${boothsPerZone}: ${val.errors.join('; ')}`).toBe(true);
      expect(val.stats.overlapCount).toBe(0);
      expect(val.stats.outOfBoundsCount).toBe(0);
      expect(val.stats.blockedWalkwayCount).toBe(0);
      expect(val.stats.unreachableBoothCount).toBe(0);
      expect(val.stats.focusClipCount).toBe(0);

      if (zoneCount === 1) {
        expect(layout.zones[0].openingDirection).toBe('south');
      } else {
        const eastCount = layout.zones.filter((z) => z.openingDirection === 'east').length;
        const westCount = layout.zones.filter((z) => z.openingDirection === 'west').length;
        expect(eastCount).toBe(Math.ceil(zoneCount / 2));
        expect(westCount).toBe(zoneCount - Math.ceil(zoneCount / 2));
      }
    }
  });

  it('creates 10 zones x 10 booths = 100 booths in Draft, safely deletes an empty booth without losing Catalog or auto-recreating it, and publishes cleanly', () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    try {
      const exhSvc = new V28ExhibitionService(v28Db);
      const exh = exhSvc.createExhibition({ name: '10x10 Creator Expo', targetBoothCount: 6 });
      exhSvc.publishVersion(exh.id, exh.latestDraftVersionId!);

      // 1. Create Draft with 10 zones x 10 booths = 100 booths
      const draft100 = exhSvc.createDraftVersion(exh.id, {
        zoneCount: 10,
        boothsPerZone: 10,
        targetBoothCount: 100,
      });
      expect(draft100.zones.length).toBe(10);
      expect(draft100.booths.length).toBe(100);
      expect(new Set(draft100.booths.map((b) => b.boothId)).size).toBe(100);
      expect(draft100.validation.valid).toBe(true);

      // 2. Active published world is STILL unchanged (6 booths) while Draft is being edited!
      const stillPublished = exhSvc.getActiveExhibitionWorld();
      expect(stillPublished.booths.length).toBe(6);

      // 3. Find an empty booth (0/6 products) and safely delete it from Draft
      const emptyBooth = draft100.booths.find((b) => b.assignedSlotCount === 0)!;
      expect(emptyBooth).toBeTruthy();

      const totalProductsBefore = v28Db.listProducts({ page: 1, limit: 1 }).total;
      const afterDelete = exhSvc.deleteDraftBoothPlacement(draft100.versionId, emptyBooth.boothId);
      expect(afterDelete.booths.length).toBe(99);
      expect(afterDelete.targetBoothCount).toBe(99);
      expect(afterDelete.booths.some((b) => b.boothId === emptyBooth.boothId)).toBe(false);
      // Catalog products untouched!
      expect(v28Db.listProducts({ page: 1, limit: 1 }).total).toBe(totalProductsBefore);

      // 4. Attempting to delete a booth WITH assigned products without forceUnassign is blocked (409)
      const boothWithProducts = afterDelete.booths.find((b) => b.assignedSlotCount > 0)!;
      expect(() =>
        exhSvc.deleteDraftBoothPlacement(draft100.versionId, boothWithProducts.boothId, { forceUnassign: false })
      ).toThrow();

      // 5. Publish -> active world now has 99 booths (deleted booth NOT auto-recreated!)
      const pub = exhSvc.publishVersion(exh.id, draft100.versionId);
      const reloaded = exhSvc.getActiveExhibitionWorld();
      expect(pub.booths.length).toBe(99);
      expect(reloaded.booths.length).toBe(99);
      expect(reloaded.booths.some((b) => b.boothId === emptyBooth.boothId)).toBe(false);
    } finally {
      v28Db.close();
    }
  });

  it('protects /api/v28/imports/website against unauthenticated access and SSRF/internal URLs', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use('/api/v28', createV28ApiRoutes(v28Db));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v28`;
    const token = issueAdminToken('admin-web-disc');

    try {
      const comp = v28Db.createCompany({ name: 'Discovery Test Co' });

      const unauth = await fetch(`${base}/imports/website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: comp.id, url: 'https://example.com' }),
      });
      expect(unauth.status).toBe(401);

      for (const bad of ['http://127.0.0.1:4000/', 'http://localhost:5173/', 'http://169.254.169.254/', 'file:///etc/passwd']) {
        const res = await fetch(`${base}/imports/website`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ companyId: comp.id, url: bad }),
        });
        expect(res.status, `expected 400 for ${bad}`).toBe(400);
      }
    } finally {
      server.close();
      v28Db.close();
    }
  });
});
