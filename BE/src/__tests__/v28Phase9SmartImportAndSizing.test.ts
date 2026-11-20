import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createApp } from '../server.js';
import {
  extractSellerOrganizationFromHtml,
  extractProductBrandFromHtml,
} from '../integrations/productAdapter.js';
import {
  V28_ARCHETYPES,
  V28_BOOTH_INSTANCE_SCALE,
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
} from '../services/v28/layoutGenerator.js';
import type { ExhibitionVersionDetail } from '../services/v28/exhibitionService.js';

describe('V28 PHASE 9 — I3 Booth Scale/FOV, I5 Seller vs Brand, I6 Category Zones, I7 Coverage', () => {
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

  it('I5: Extracts verified Seller Organization separately from Product Brand & prevents duplicate companies on retry', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "name": "CellphoneS",
                  "url": "https://cellphones.com.vn",
                  "logo": "https://cellphones.com.vn/logo.png",
                  "email": "cskh@cellphones.com.vn"
                },
                {
                  "@type": "Product",
                  "name": "iPhone 18 Pro Max 256GB",
                  "brand": { "@type": "Brand", "name": "Apple" }
                }
              ]
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const seller = extractSellerOrganizationFromHtml(html, 'https://cellphones.com.vn/iphone-18-pro-max.html');
    const brand = extractProductBrandFromHtml(html);

    expect(seller.name).toBe('CellphoneS');
    expect(seller.canonicalDomain).toBe('cellphones.com.vn');
    expect(seller.confidence).toBe('verified');
    expect(seller.evidence).toBe('json-ld-organization');
    expect(brand).toBe('Apple');
    expect(brand).not.toBe(seller.name);

    // Unverified bare HTML must NOT fabricate a company name
    const bare = extractSellerOrganizationFromHtml('<html><body>Hello</body></html>', 'https://unknown-shop.example.com/');
    expect(bare.confidence).toBe('needs_confirmation');
    expect(bare.name).toBe('');

    // Zero duplicate company creation on repeated imports
    const first = v28Db.findOrCreateCompanyByWebsite({
      name: seller.name,
      canonicalDomain: seller.canonicalDomain,
      websiteUrl: seller.websiteUrl,
      logoUrl: seller.logoUrl,
      contactEmail: seller.contactEmail,
      allowCreate: true,
    });
    expect(first.created).toBe(true);
    expect(first.company?.name).toBe('CellphoneS');

    const retry = v28Db.findOrCreateCompanyByWebsite({
      name: seller.name,
      canonicalDomain: seller.canonicalDomain,
      websiteUrl: seller.websiteUrl,
      allowCreate: true,
    });
    expect(retry.created).toBe(false);
    expect(retry.matchedBy).toBe('domain');
    expect(retry.company?.id).toBe(first.company?.id);
  });

  it('I6: Organizes Draft Zones strictly by real product categories and marks excess zones Unassigned (zero fake categories)', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };
    const exhList = (await (await fetch(`${baseUrl}/api/v28/exhibitions`, { headers: authHeaders })).json()) as {
      exhibitions: Array<{ id: string }>;
    };
    const exhId = exhList.exhibitions[0].id;
    const sellerComp = v28Db.listCompanies({ status: 'active' }).find((c) => c.name === 'CellphoneS') || v28Db.listCompanies({ status: 'active' })[0];

    // Create 4 real products across 3 real categories: Điện thoại, Laptop & Máy tính, Âm thanh
    const createdIds: string[] = [];
    for (const p of [
      { name: 'iPhone 18 Pro Max 256GB', price: 41990000 },
      { name: 'Samsung Galaxy S26 Ultra', price: 32990000 },
      { name: 'Laptop MacBook Pro M5 14 inch', price: 54990000 },
      { name: 'Tai nghe Sony WH-1000XM5', price: 6990000 },
    ]) {
      const res = await fetch(`${baseUrl}/api/v28/products`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: sellerComp.id,
          boothId: null,
          name: p.name,
          price: p.price,
          currency: 'VND',
        }),
      });
      const data = (await res.json()) as { product: { id: string } };
      createdIds.push(data.product.id);
    }

    // Admin requests 5 zones, but there are only 3 real categories -> 3 real category zones + 2 unassigned zones
    const draftRes = await fetch(`${baseUrl}/api/v28/exhibitions/${exhId}/drafts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        zoneCount: 5,
        boothsPerZone: 4,
        requireProductSource: true,
        productSource: 'url',
        sourceUrl: 'https://cellphones.com.vn/',
      }),
    });
    expect(draftRes.status).toBe(201);
    const { version: draft } = (await draftRes.json()) as { version: ExhibitionVersionDetail };

    const allocRes = await fetch(
      `${baseUrl}/api/v28/exhibitions/${exhId}/versions/${draft.versionId}/auto-allocate`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: sellerComp.id,
          productIds: createdIds,
          organizeZonesByCategory: true,
        }),
      }
    );
    expect(allocRes.status).toBe(200);
    const alloc = (await allocRes.json()) as {
      assignedSlots: number;
      zoneDecisions: Array<{ displayName: string; status: string; productCount: number }>;
    };

    expect(alloc.assignedSlots).toBeGreaterThanOrEqual(4);
    const assignedZones = alloc.zoneDecisions.filter((z) => z.status === 'assigned_category');
    const unassignedZones = alloc.zoneDecisions.filter((z) => z.status === 'unassigned_empty');
    expect(assignedZones.length).toBe(3);
    expect(unassignedZones.length).toBe(2);
    expect(assignedZones.map((z) => z.displayName)).toEqual(
      expect.arrayContaining(['Khu Điện thoại', 'Khu Laptop & Máy tính', 'Khu Âm thanh'])
    );
  });

  it('I3: All 6 archetypes scale 1.25x cleanly with 0 overlap and full signboard inside Focus vertical FOV', () => {
    expect(V28_BOOTH_INSTANCE_SCALE).toBe(1.25);
    for (const arch of V28_ARCHETYPES) {
      expect(arch.width).toBeGreaterThanOrEqual(8.4);
      expect(arch.depth).toBeGreaterThanOrEqual(6.49);

      // Verify Focus camera vertical FOV framing for every archetype (half-FOV = 22.5 deg)
      const camZ = arch.depth / 2 + 5.6 + 2.0 * V28_BOOTH_INSTANCE_SCALE;
      const camY = 3.2 * V28_BOOTH_INSTANCE_SCALE;
      const lookY = 2.25 * V28_BOOTH_INSTANCE_SCALE;
      const pitchDownDeg = (Math.atan2(camY - lookY, camZ) * 180) / Math.PI;

      const signY = (arch.id === 'wave_pavilion' ? 3.85 : 3.45) * V28_BOOTH_INSTANCE_SCALE;
      const signTopY = signY + 0.41 * V28_BOOTH_INSTANCE_SCALE;
      const signZ = arch.depth / 2 + 0.08;
      const horizDist = camZ - signZ;
      const elevDeg = (Math.atan2(signTopY - camY, horizDist) * 180) / Math.PI;

      expect(pitchDownDeg + elevDeg).toBeLessThan(20.0); // comfortably inside 22.5° half-FOV
    }

    for (const [z, b] of [
      [1, 6],
      [2, 10],
      [10, 10],
      [10, 20],
    ]) {
      const layout = generateDynamicExhibitionLayout({
        targetBoothCount: z * b,
        zoneCount: z,
        boothsPerZone: b,
      });
      const val = validateExhibitionLayout(layout);
      expect(val.valid).toBe(true);
      expect(val.stats.overlapCount).toBe(0);
    }
  });
});
