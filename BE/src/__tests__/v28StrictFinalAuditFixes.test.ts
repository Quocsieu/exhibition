import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createApp } from '../server.js';
import {
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
} from '../services/v28/layoutGenerator.js';
import { buildCollisionIndex, isPositionWalkableInIndex } from '../realtime/v28/spatialAoiEngine.js';
import type { ExhibitionVersionDetail } from '../services/v28/exhibitionService.js';

describe('V28 STRICT FINAL AUDIT FIXES — H1/H2, F3, G2/G3/G4, A1, E2', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminToken = '';
  let db: ExpoDatabase;
  let v28Db: V28CatalogDatabase;

  beforeAll(async () => {
    db = new ExpoDatabase(':memory:');
    v28Db = new V28CatalogDatabase(':memory:');
    const app = createApp(db, '*', undefined, v28Db);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    const loginData = (await loginRes.json()) as { token: string };
    adminToken = loginData.token;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    v28Db.close();
    db.close();
  });

  it('H1/H2/G2/G3/G4: End-to-End Product Import -> Auto-Classification -> Auto-Allocate on Archived Draft Booths -> Safe Delete -> Publish -> World API', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // 1. Get exhibition & first company
    const exhListRes = await fetch(`${baseUrl}/api/v28/exhibitions`, { headers: authHeaders });
    const exhList = (await exhListRes.json()) as { exhibitions: Array<{ id: string }> };
    const exhId = exhList.exhibitions[0].id;

    const compRes = await fetch(`${baseUrl}/api/v28/companies`, { headers: authHeaders });
    const compData = (await compRes.json()) as { companies: Array<{ id: string; name: string }> };
    const targetCompany = compData.companies[0];

    // 2. Create 20-booth draft & publish, then create 6-booth draft & publish so booths 7..20 become 'archived'
    const d20Res = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ zoneCount: 2, boothsPerZone: 10 }),
    });
    expect(d20Res.status).toBe(201);
    const d20 = ((await d20Res.json()) as { version: ExhibitionVersionDetail }).version;

    const pub20 = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/versions/${d20.versionId}/publish`, {
      method: 'POST',
      headers: authHeaders,
    });
    expect(pub20.status).toBe(200);

    const d6Res = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ zoneCount: 1, boothsPerZone: 6 }),
    });
    const d6 = ((await d6Res.json()) as { version: ExhibitionVersionDetail }).version;
    await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/versions/${d6.versionId}/publish`, {
      method: 'POST',
      headers: authHeaders,
    });

    // 3. F3: Verify mandatory product source validation rejects missing/invalid source when requireProductSource=true
    const badDraftRes = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        zoneCount: 2,
        boothsPerZone: 10,
        requireProductSource: true,
      }),
    });
    expect(badDraftRes.status).toBe(400);

    const badUrlDraftRes = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        zoneCount: 2,
        boothsPerZone: 10,
        requireProductSource: true,
        productSource: 'url',
        sourceUrl: 'not-a-valid-url',
      }),
    });
    expect(badUrlDraftRes.status).toBe(400);

    // 4. Import 8 real products (7 tech products + 1 ambiguous product) under targetCompany
    const importedIds: string[] = [];
    const sampleProducts = [
      { name: 'iPhone 18 Pro Max 256GB', price: 41990000 },
      { name: 'Samsung Galaxy S26 Ultra', price: 32990000 },
      { name: 'Tai nghe Sony WH-1000XM5', price: 6990000 },
      { name: 'Laptop MacBook Pro M5', price: 54990000 },
      { name: 'iPad Pro 13 inch WiFi', price: 28990000 },
      { name: 'Xiaomi Redmi Note 17', price: 6280000 },
      { name: 'OPPO Find X10 5G', price: 33990000 },
      { name: 'Vật phẩm trưng bày đặc biệt XYZ-999', price: 0 }, // uncertain category & no price
    ];
    for (const sp of sampleProducts) {
      const pRes = await fetch(`${baseUrl}/api/v28/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: targetCompany.id,
          boothId: null,
          name: sp.name,
          price: sp.price,
          currency: 'VND',
          images: ['https://example.com/product.jpg'],
        }),
      });
      expect(pRes.status).toBe(201);
      const pData = (await pRes.json()) as { product: { id: string } };
      importedIds.push(pData.product.id);
    }

    // 5. Create new 2x10 Draft with valid mandatory productSource='url'
    const newDraftRes = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        zoneCount: 2,
        boothsPerZone: 10,
        requireProductSource: true,
        productSource: 'url',
        sourceUrl: 'https://shop.example.com/phones',
      }),
    });
    expect(newDraftRes.status).toBe(201);
    const newDraft = ((await newDraftRes.json()) as { version: ExhibitionVersionDetail }).version;

    // 6. Auto-allocate imported products onto archived draft booths
    const allocRes = await fetch(
      `${baseUrl}/api/v28/exhibitions/${exhId}/versions/${newDraft.versionId}/auto-allocate`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: targetCompany.id,
          productIds: importedIds,
        }),
      }
    );
    expect(allocRes.status).toBe(200);
    const allocData = (await allocRes.json()) as {
      assignedSlots: number;
      boothsFilled: number;
      assignedProductIds: string[];
      uncertainProducts: Array<{ productId: string; name: string }>;
      classifiedCount: number;
      version: ExhibitionVersionDetail;
    };

    expect(allocData.assignedSlots).toBeGreaterThanOrEqual(8);
    expect(allocData.assignedProductIds).toContain(importedIds[0]);
    expect(allocData.classifiedCount).toBeGreaterThanOrEqual(7);
    expect(allocData.uncertainProducts.some((u) => u.name.includes('XYZ-999'))).toBe(true);

    // Verify ZERO cross-company contamination
    for (const b of allocData.version.booths) {
      for (const s of b.slots) {
        if (s.product) {
          expect(s.product.companyId).toBe(b.companyId);
        }
      }
    }

    // 7. G3: Safe delete a booth WITH assigned products (forceUnassign=true) must NOT crash with booth_product_slots typo
    const boothWithProducts = allocData.version.booths.find(
      (b) => b.companyId === targetCompany.id && b.assignedSlotCount > 0 && b.boothId.startsWith('v28-booth-')
    );
    expect(boothWithProducts).toBeDefined();
    const delRes = await fetch(
      `${baseUrl}/api/v28/exhibitions/${exhId}/versions/${newDraft.versionId}/booths/${boothWithProducts!.boothId}?forceUnassign=true`,
      { method: 'DELETE', headers: authHeaders }
    );
    expect(delRes.status).toBe(200);
    // Product must still exist in Catalog!
    const catalogCheck = v28Db.getProductById(importedIds[0]);
    expect(catalogCheck).not.toBeNull();

    // 8. G4: Publish and verify World API returns real imported products on 3D slots
    const pubFinal = await fetch(
      `${baseUrl}/api/v28/exhibitions/${exhId}/versions/${newDraft.versionId}/publish`,
      { method: 'POST', headers: authHeaders }
    );
    expect(pubFinal.status).toBe(200);

    const worldRes = await fetch(`${baseUrl}/api/v28/exhibitions/active`);
    expect(worldRes.status).toBe(200);
    const { world } = (await worldRes.json()) as { world: ExhibitionVersionDetail };
    const allWorldProductIds = world.booths.flatMap((b) =>
      b.slots.filter((s) => s.product).map((s) => s.product!.id)
    );
    expect(allWorldProductIds.some((id) => importedIds.includes(id))).toBe(true);
  });

  it('A1 & A3: 6-booth single-zone matches V27.5 centered symmetry & multi-scale layouts remain valid with 0 overlap', () => {
    const layout6 = generateDynamicExhibitionLayout({
      targetBoothCount: 6,
      zoneCount: 1,
      boothsPerZone: 6,
    });
    expect(layout6.hallWidth).toBe(64);
    expect(layout6.hallDepth).toBe(57.5);
    expect(layout6.placements).toHaveLength(6);
    expect(layout6.placements.map((p) => [p.positionX, p.positionZ])).toEqual([
      [-8.25, -21],
      [8.25, -21],
      [-19.5, -8],
      [-19.5, 7.5],
      [19.5, -8],
      [19.5, 7.5],
    ]);
    const val6 = validateExhibitionLayout(layout6);
    expect(val6.valid).toBe(true);
    expect(val6.stats.overlapCount).toBe(0);

    // Multi-scale regression check: 1x1, 2x10, 10x10, 10x20
    for (const [z, b] of [
      [1, 1],
      [2, 10],
      [10, 10],
      [10, 20],
    ]) {
      const l = generateDynamicExhibitionLayout({
        targetBoothCount: z * b,
        zoneCount: z,
        boothsPerZone: b,
      });
      const v = validateExhibitionLayout(l);
      expect(v.valid).toBe(true);
      expect(v.stats.overlapCount).toBe(0);
    }
  });

  it('E2: Server AOI collision index uses rotated booth AABBs matching ±90° U-wing booths', () => {
    const fakeVersion = {
      versionId: 'v-rot-test',
      versionNumber: 1,
      walkableBounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
      spawnPoint: { x: 0, z: 15, rotationY: Math.PI },
      booths: [
        {
          boothId: 'wing-booth',
          positionX: -15.6,
          positionZ: 0,
          rotationY: Math.PI / 2,
          footprintWidth: 6.72,
          footprintDepth: 5.19,
        },
      ],
    } as unknown as ExhibitionVersionDetail;

    const idx = buildCollisionIndex(fakeVersion);
    // Rotated 90°: X half-extent is depth/2 + 0.25 = 2.845, Z half-extent is width/2 + 0.25 = 3.61
    expect(idx.boothAabbs[0].maxX - idx.boothAabbs[0].minX).toBeCloseTo(5.69, 1);
    expect(idx.boothAabbs[0].maxZ - idx.boothAabbs[0].minZ).toBeCloseTo(7.22, 1);
    // Booth center blocked, approach point in front (+X) walkable
    expect(isPositionWalkableInIndex(idx, -15.6, 0)).toBe(false);
    expect(isPositionWalkableInIndex(idx, -15.6 + 5.0, 0)).toBe(true);
  });
});
