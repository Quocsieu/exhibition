import { afterEach, describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  extractProductBrandFromHtml,
  extractSellerOrganizationFromHtml,
} from '../integrations/productAdapter.js';

describe('V28 Single-Business Architecture Correction (1 Exhibition = 1 Owner Company)', () => {
  const dbs: V28CatalogDatabase[] = [];

  function createEnv() {
    const db = new V28CatalogDatabase(':memory:');
    dbs.push(db);
    const service = new V28ExhibitionService(db);
    const exh = service.ensureDefaultExhibition(6);
    return { db, service, exh };
  }

  afterEach(() => {
    while (dbs.length > 0) {
      dbs.pop()?.close();
    }
  });

  it('extracts Seller Organization (CellphoneS) separately from Product Brand (Apple/Samsung/Sony)', () => {
    const productHtml = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:site_name" content="CellphoneS" />
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "name": "CellphoneS",
                "url": "https://cellphones.com.vn/",
                "logo": "https://cellphones.com.vn/logo.png"
              },
              {
                "@type": "Product",
                "name": "iPhone 16 Pro Max 256GB",
                "brand": { "@type": "Brand", "name": "Apple" },
                "offers": {
                  "@type": "Offer",
                  "price": 34990000,
                  "priceCurrency": "VND",
                  "seller": { "@type": "Organization", "name": "CellphoneS" }
                }
              }
            ]
          }
          </script>
        </head>
        <body><h1>iPhone 16 Pro Max 256GB</h1></body>
      </html>
    `;

    const seller = extractSellerOrganizationFromHtml(productHtml, 'https://cellphones.com.vn/iphone-16-pro-max.html');
    const brand = extractProductBrandFromHtml(productHtml);

    expect(seller.name).toBe('CellphoneS');
    expect(seller.confidence).toBe('verified');
    expect(seller.canonicalDomain).toBe('cellphones.com.vn');
    expect(brand).toBe('Apple');
  });

  it('returns needs_confirmation when website lacks verified organization metadata (never fabricates company)', () => {
    const bareHtml = '<!doctype html><html><head><title>Sản phẩm mới</title></head><body><p>Hello</p></body></html>';
    const seller = extractSellerOrganizationFromHtml(bareHtml, 'https://unknown-shop.example.com/item-1');
    expect(seller.confidence).toBe('needs_confirmation');
    expect(seller.canonicalDomain).toBe('unknown-shop.example.com');
  });

  it('creates a Single-Business Draft with 100% booths owned by ONE ownerCompanyId and ZERO demo company leakage', () => {
    const { db, service, exh } = createEnv();

    // Verify DB starts with 6 seeded demo companies
    const initialCompanies = db.listCompanies({ status: 'active' });
    expect(initialCompanies.length).toBeGreaterThanOrEqual(6);

    // Create 1 real seller company from website URL
    const { company: cellphones, created } = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'cellphones.com.vn',
      websiteUrl: 'https://cellphones.com.vn/',
      name: 'CellphoneS',
      logoUrl: 'https://cellphones.com.vn/logo.png',
      allowCreate: true,
    });
    expect(created).toBe(true);
    expect(cellphones).not.toBeNull();
    const owner = cellphones!;

    // Re-calling findOrCreateCompanyByWebsite deduplicates cleanly
    const retry = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'cellphones.com.vn',
      websiteUrl: 'https://www.cellphones.com.vn/mobile.html',
      name: 'CellphoneS',
      allowCreate: true,
    });
    expect(retry.created).toBe(false);
    expect(retry.company?.id).toBe(owner.id);

    // Create Draft with ownerCompanyId = owner.id (3 zones x 3 booths = 9 booths)
    const draft = service.createDraftVersion(exh.id, {
      zoneCount: 3,
      boothsPerZone: 3,
      targetBoothCount: 9,
      ownerCompanyId: owner.id,
    });

    expect(draft.ownerCompanyId).toBe(owner.id);
    expect(draft.ownerCompany?.name).toBe('CellphoneS');
    expect(draft.zones.length).toBe(3);
    expect(draft.booths.length).toBe(9);

    // CRITICAL INVARIANT: 100% booths owned by CellphoneS, 0 demo companies
    const distinctOwners = new Set(draft.booths.map((b) => b.companyId));
    expect(distinctOwners.size).toBe(1);
    expect(distinctOwners.has(owner.id)).toBe(true);
    for (const b of draft.booths) {
      expect(b.companyName).toBe('CellphoneS');
      expect(b.companyName).not.toMatch(/Aether|Nordic|EcoVita|Kinetix|Lumina|Solaris/i);
    }

    // Historical active Published version remains untouched
    const activeWorld = service.getActiveExhibitionWorld();
    expect(activeWorld.status).toBe('published');
    expect(activeWorld.versionId).not.toBe(draft.versionId);
  });

  it('organizes zones by real product categories while ALL booths belong to the single owner (Apple/Samsung/Sony are brands, not owners)', () => {
    const { db, service, exh } = createEnv();

    const { company: cellphones } = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'cellphones.com.vn',
      websiteUrl: 'https://cellphones.com.vn/',
      name: 'CellphoneS',
      allowCreate: true,
    });
    const owner = cellphones!;

    const pPhone1 = db.createProduct({
      companyId: owner.id,
      name: 'iPhone 16 Pro Max 256GB',
      price: 34990000,
      currency: 'VND',
      description: 'Điện thoại Apple chính hãng',
    });
    const pPhone2 = db.createProduct({
      companyId: owner.id,
      name: 'Samsung Galaxy S24 Ultra',
      price: 29990000,
      currency: 'VND',
      description: 'Điện thoại Samsung flagship',
    });
    const pLaptop = db.createProduct({
      companyId: owner.id,
      name: 'MacBook Air M3 13 inch',
      price: 27990000,
      currency: 'VND',
      description: 'Laptop Apple siêu mỏng nhẹ',
    });
    const pAudio = db.createProduct({
      companyId: owner.id,
      name: 'Tai nghe Sony WH-1000XM5',
      price: 7990000,
      currency: 'VND',
      description: 'Tai nghe chống ồn chủ động Sony',
    });

    const draft = service.createDraftVersion(exh.id, {
      zoneCount: 3,
      boothsPerZone: 2,
      targetBoothCount: 6,
      ownerCompanyId: owner.id,
    });

    const alloc = service.autoAllocateDraftProducts(draft.versionId, {
      companyId: owner.id,
      productIds: [pPhone1.id, pPhone2.id, pLaptop.id, pAudio.id],
      organizeZonesByCategory: true,
    });

    expect(alloc.assignedSlots).toBe(4);
    expect(alloc.overflowProductIds.length).toBe(0);

    // Zone names are real categories, NEVER company or brand names
    const zoneNames = alloc.version.zones.map((z) => z.displayName);
    expect(zoneNames.some((n) => /Điện thoại/i.test(n))).toBe(true);
    expect(zoneNames.some((n) => /Laptop|Máy tính/i.test(n))).toBe(true);
    expect(zoneNames.some((n) => /Âm thanh/i.test(n))).toBe(true);
    for (const zn of zoneNames) {
      expect(zn).not.toMatch(/CellphoneS|Apple|Samsung|Sony/i);
    }

    // Every booth still owned by CellphoneS
    for (const b of alloc.version.booths) {
      expect(b.companyId).toBe(owner.id);
      expect(b.companyName).toBe('CellphoneS');
    }

    // Publish succeeds and exposes ownerCompany in Active World API
    const published = service.publishVersion(exh.id, draft.versionId);
    expect(published.status).toBe('published');
    expect(published.ownerCompanyId).toBe(owner.id);
    expect(published.ownerCompany?.name).toBe('CellphoneS');

    const activeWorld = service.getActiveExhibitionWorld();
    expect(activeWorld.versionId).toBe(published.versionId);
    expect(activeWorld.ownerCompany?.name).toBe('CellphoneS');
    expect(activeWorld.booths.every((b) => b.companyId === owner.id && b.companyName === 'CellphoneS')).toBe(true);
  });

  it('handles zones > categories (marks extra zones Khu Chưa phân bổ) and zones < categories (merges into Khu Tổng hợp)', () => {
    const { db, service, exh } = createEnv();
    const { company: compA } = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'single-biz.vn',
      websiteUrl: 'https://single-biz.vn/',
      name: 'SingleBiz VN',
      allowCreate: true,
    });
    const company = compA!;

    const p1 = db.createProduct({ companyId: company.id, name: 'iPhone 15 Pro', price: 25000000, currency: 'VND' });
    const p2 = db.createProduct({ companyId: company.id, name: 'Laptop Dell XPS 13', price: 32000000, currency: 'VND' });
    const p3 = db.createProduct({ companyId: company.id, name: 'Tai nghe Bluetooth JBL', price: 1500000, currency: 'VND' });
    const p4 = db.createProduct({ companyId: company.id, name: 'Đồng hồ thông minh Apple Watch S9', price: 9900000, currency: 'VND' });

    // Case A: 4 zones, only 2 categories
    const draftMoreZones = service.createDraftVersion(exh.id, {
      zoneCount: 4,
      boothsPerZone: 1,
      targetBoothCount: 4,
      ownerCompanyId: company.id,
    });
    const allocA = service.autoAllocateDraftProducts(draftMoreZones.versionId, {
      companyId: company.id,
      productIds: [p1.id, p2.id],
      organizeZonesByCategory: true,
    });
    expect(allocA.zoneDecisions.filter((z) => z.status === 'assigned_category').length).toBe(2);
    expect(allocA.zoneDecisions.filter((z) => z.status === 'unassigned_empty').length).toBe(2);
    expect(allocA.zoneDecisions.some((z) => z.displayName.includes('Khu Chưa phân bổ'))).toBe(true);

    // Case B: 2 zones, 4 categories -> 1 dedicated + 1 Khu Tổng hợp
    const draftFewerZones = service.createDraftVersion(exh.id, {
      zoneCount: 2,
      boothsPerZone: 2,
      targetBoothCount: 4,
      ownerCompanyId: company.id,
    });
    const allocB = service.autoAllocateDraftProducts(draftFewerZones.versionId, {
      companyId: company.id,
      productIds: [p1.id, p2.id, p3.id, p4.id],
      organizeZonesByCategory: true,
    });
    expect(allocB.zoneDecisions.some((z) => z.status === 'merged_general' && z.displayName === 'Khu Tổng hợp')).toBe(true);
  });

  it('rejects cross-company booth reassignment, cross-company auto-allocate, and mixed-owner publish with HTTP 409', () => {
    const { db, service, exh } = createEnv();
    const otherCompany = db.listCompanies({ status: 'active' })[0];
    const { company: ownerRes } = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'strict-owner.vn',
      websiteUrl: 'https://strict-owner.vn/',
      name: 'Strict Owner Corp',
      allowCreate: true,
    });
    const owner = ownerRes!;

    const draft = service.createDraftVersion(exh.id, {
      zoneCount: 2,
      boothsPerZone: 2,
      targetBoothCount: 4,
      ownerCompanyId: owner.id,
    });

    // 1. Reassigning a booth to another company MUST fail with 409
    expect(() =>
      service.updateDraftBoothPlacement(draft.versionId, draft.booths[0].boothId, {
        companyId: otherCompany.id,
      })
    ).toThrow(/Vi phạm mô hình triển lãm một doanh nghiệp/i);

    // 2. Auto-allocating another company's products into this Draft MUST fail with 409
    expect(() =>
      service.autoAllocateDraftProducts(draft.versionId, {
        companyId: otherCompany.id,
      })
    ).toThrow(/Vi phạm mô hình triển lãm một doanh nghiệp/i);

    // 3. Even if a booth row is corrupted directly in SQLite, publishVersion MUST reject with 409
    db.getConnection()
      .prepare('UPDATE booths SET company_id = ?, company_name = ? WHERE id = ?')
      .run(otherCompany.id, otherCompany.name, draft.booths[0].boothId);

    const prevPublishedId = service.getActiveExhibitionWorld().versionId;
    expect(() => service.publishVersion(exh.id, draft.versionId)).toThrow(
      /Vi phạm mô hình triển lãm một doanh nghiệp/i
    );
    // Active published world remains intact!
    expect(service.getActiveExhibitionWorld().versionId).toBe(prevPublishedId);
  });

  it('respects max 6 slots per booth and keeps overflow products safely in Catalog without cloning', () => {
    const { db, service, exh } = createEnv();
    const { company: overflowRes } = db.findOrCreateCompanyByWebsite({
      canonicalDomain: 'overflow-biz.vn',
      websiteUrl: 'https://overflow-biz.vn/',
      name: 'Overflow Biz',
      allowCreate: true,
    });
    const company = overflowRes!;

    const ids: string[] = [];
    for (let i = 1; i <= 9; i++) {
      const p = db.createProduct({
        companyId: company.id,
        name: `iPhone Model #${i}`,
        price: 10000000 + i * 100000,
        currency: 'VND',
      });
      ids.push(p.id);
    }

    const draft = service.createDraftVersion(exh.id, {
      zoneCount: 1,
      boothsPerZone: 1,
      targetBoothCount: 1,
      ownerCompanyId: company.id,
    });

    const alloc = service.autoAllocateDraftProducts(draft.versionId, {
      companyId: company.id,
      productIds: ids,
    });

    expect(alloc.assignedSlots).toBe(6);
    expect(alloc.overflowProductIds.length).toBe(3);
    expect(alloc.version.booths[0].assignedSlotCount).toBe(6);
    // All 9 products still exist safely in Catalog
    const catalog = db.listProducts({ companyId: company.id, page: 1, limit: 50 });
    expect(catalog.total).toBe(9);
  });
});
