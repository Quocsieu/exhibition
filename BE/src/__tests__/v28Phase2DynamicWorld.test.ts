import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import {
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
} from '../services/v28/layoutGenerator.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { BOOTH_SLOT_DEFINITIONS } from '../schemas/expoSchemas.js';

async function startTestServer(v28Db: V28CatalogDatabase) {
  const app = express();
  app.use(express.json());
  const exhService = new V28ExhibitionService(v28Db);
  app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('V28 PHASE 2 — Dynamic Layout Generator, Exhibition Versioning, Resize & Immutability', () => {
  it('generates mathematically valid, overlap-free, BFS-connected layouts for 6, 20, 21, 37, 50, 99, 100, 101 and 200 booths', () => {
    const counts = [6, 20, 21, 37, 50, 99, 100, 101, 200];
    for (const count of counts) {
      const layout = generateDynamicExhibitionLayout({
        targetBoothCount: count,
        preferredZoneCapacity: 10,
      });
      const validation = validateExhibitionLayout(layout);

      expect(layout.placements.length, `count=${count}`).toBe(count);
      expect(layout.zones.length, `zones for count=${count}`).toBe(Math.ceil(count / 10));
      expect(validation.valid, `validation errors for count=${count}: ${validation.errors.join('; ')}`).toBe(true);
      expect(validation.stats.overlapCount, `overlaps count=${count}`).toBe(0);
      expect(validation.stats.outOfBoundsCount, `oob count=${count}`).toBe(0);
      expect(validation.stats.blockedWalkwayCount, `blocked count=${count}`).toBe(0);
      expect(validation.stats.unreachableBoothCount, `unreachable count=${count}`).toBe(0);
      expect(validation.stats.focusClipCount, `focus clip count=${count}`).toBe(0);
      expect(layout.roofBounds.hallWidth).toBe(layout.hallWidth);
      expect(layout.roofBounds.hallDepth).toBe(layout.hallDepth);
    }
  });

  it('migrates to user_version 4, enforces Draft/Publish immutability, preserves stable Booth IDs & slots across 20->10->20 resize, and supports rollback', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    expect(v28Db.lastMigrationReport.toVersion).toBeGreaterThanOrEqual(4);
    expect(v28Db.lastMigrationReport.foreignKeyCheckOk).toBe(true);
    expect(v28Db.lastMigrationReport.integrityCheckOk).toBe(true);

    const { baseUrl, close } = await startTestServer(v28Db);
    const adminToken = issueAdminToken('admin');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    try {
      // 1. Unauthorized publish/create blocked (401)
      const unauthRes = await fetch(`${baseUrl}/api/v28/exhibitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Expo' }),
      });
      expect(unauthRes.status).toBe(401);

      // 2. Create 20-booth Exhibition
      const createRes = await fetch(`${baseUrl}/api/v28/exhibitions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: 'Grand Expo V28 Test', targetBoothCount: 20, preferredZoneCapacity: 10 }),
      });
      expect(createRes.status).toBe(201);
      const { exhibition } = (await createRes.json()) as {
        exhibition: { id: string; latestDraftVersionId: string };
      };
      const v1Id = exhibition.latestDraftVersionId;

      // 3. Inspect v1 Draft (20 booths, 2 zones A/B)
      const v1Res = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}`);
      expect(v1Res.status).toBe(200);
      const { version: v1 } = (await v1Res.json()) as {
        version: {
          status: string;
          zones: Array<{ id: string; code: string; displayName: string }>;
          booths: Array<{ boothId: string; companyId: string; archetypeId: string; positionX: number; positionZ: number }>;
          validation: { valid: boolean };
        };
      };
      expect(v1.status).toBe('draft');
      expect(v1.booths.length).toBe(20);
      expect(v1.zones.length).toBe(2);
      expect(v1.validation.valid).toBe(true);

      const original20BoothIds = v1.booths.map((b) => b.boothId);
      const booth15 = v1.booths[14];

      // Assign a catalog product to booth #15 (v28-booth-015) so we can verify slot preservation across 20 -> 10 -> 20!
      const prodCreate = await fetch(`${baseUrl}/api/v28/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: booth15.companyId,
          name: 'Slot Preservation Test Product',
          sku: 'PRESERVE-015',
          price: 990000,
          currency: 'VND',
        }),
      });
      expect(prodCreate.status).toBe(201);
      const { product: prod15 } = (await prodCreate.json()) as { product: { id: string } };

      const firstSlotId = BOOTH_SLOT_DEFINITIONS[0].slotId;
      const slotAssign = await fetch(`${baseUrl}/api/v28/booths/${booth15.boothId}/slots/${firstSlotId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ productId: prod15.id }),
      });
      expect(slotAssign.status).toBe(200);

      // 4. Rename Zone A in Draft
      const renameZone = await fetch(
        `${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}/zones/${v1.zones[0].id}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ displayName: 'Khu Công Nghệ & AI', categoryTag: 'Tech' }),
        }
      );
      expect(renameZone.status).toBe(200);

      // 5. Reject overlapping move in Draft (moving booth 1 onto booth 0)
      const overlapMove = await fetch(
        `${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}/booths/${v1.booths[1].boothId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ positionX: v1.booths[0].positionX, positionZ: v1.booths[0].positionZ }),
        }
      );
      expect(overlapMove.status).toBe(400);

      // 6. Publish v1
      const pub1 = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}/publish`, {
        method: 'POST',
        headers: authHeaders,
      });
      expect(pub1.status).toBe(200);

      // 7. Published version MUST be immutable (409 on zone rename & booth edit)
      const immutZone = await fetch(
        `${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}/zones/${v1.zones[0].id}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ displayName: 'Illegal Mutation' }),
        }
      );
      expect(immutZone.status).toBe(409);

      const immutBooth = await fetch(
        `${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v1Id}/booths/${v1.booths[0].boothId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ archetypeId: 'wave_pavilion' }),
        }
      );
      expect(immutBooth.status).toBe(409);

      // 8. Resize 20 -> 10 (Draft v2 -> Publish)
      const draft10Res = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/drafts`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ targetBoothCount: 10, preferredZoneCapacity: 10 }),
      });
      expect(draft10Res.status).toBe(201);
      const { version: v2 } = (await draft10Res.json()) as {
        version: { versionId: string; booths: Array<{ boothId: string }>; zones: Array<{ displayName: string }> };
      };
      expect(v2.booths.length).toBe(10);
      expect(v2.booths.map((b) => b.boothId)).toEqual(original20BoothIds.slice(0, 10));
      // Preserved custom zone A name!
      expect(v2.zones[0].displayName).toBe('Khu Công Nghệ & AI');

      const pub2 = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/versions/${v2.versionId}/publish`, {
        method: 'POST',
        headers: authHeaders,
      });
      expect(pub2.status).toBe(200);

      // Verify product & booth #15 were NOT deleted during shrink to 10!
      const prodCheck = await fetch(`${baseUrl}/api/v28/products/${prod15.id}`);
      expect(prodCheck.status).toBe(200);

      // 9. Resize 10 -> 20 (Draft v3 -> Publish): MUST restore EXACT same 20 Booth IDs AND booth #15's slot-1!
      const draft20Res = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/drafts`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ targetBoothCount: 20, preferredZoneCapacity: 10 }),
      });
      expect(draft20Res.status).toBe(201);
      const { version: v3 } = (await draft20Res.json()) as {
        version: {
          versionId: string;
          booths: Array<{ boothId: string; slots: Array<{ slotId: string; product: { id: string } | null }> }>;
        };
      };
      expect(v3.booths.length).toBe(20);
      expect(v3.booths.map((b) => b.boothId)).toEqual(original20BoothIds);
      const restored15 = v3.booths.find((b) => b.boothId === booth15.boothId)!;
      expect(restored15.slots.find((s) => s.slotId === firstSlotId)?.product?.id).toBe(prod15.id);

      // 10. Rollback from v2 (10 booths) back to v1 (20 booths)
      const rbRes = await fetch(`${baseUrl}/api/v28/exhibitions/${exhibition.id}/rollback`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ targetVersionId: v1Id }),
      });
      expect(rbRes.status).toBe(200);
      const activeRes = await fetch(`${baseUrl}/api/v28/exhibitions/active`);
      expect(activeRes.status).toBe(200);
      const { world } = (await activeRes.json()) as { world: { versionId: string; booths: unknown[] } };
      expect(world.versionId).toBe(v1Id);
      expect(world.booths.length).toBe(20);
    } finally {
      await close();
      v28Db.close();
    }
  });
});
