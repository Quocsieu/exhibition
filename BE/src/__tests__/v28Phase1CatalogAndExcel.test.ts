import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExcelImportService } from '../services/v28ExcelImportService.js';
import { createApp } from '../server.js';
import { issueAdminToken } from '../middleware/adminAuth.js';

async function buildXlsxBuffer(
  rows: Array<Record<string, string | number | boolean>>,
  headers = ['name', 'sku', 'price', 'currency', 'description', 'image_url', 'source_url']
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow(headers.map((h) => (r[h] !== undefined ? r[h] : '')));
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe('V28 PHASE 1 — Migration, Company Management, Independent Product Catalog & Excel Import', () => {
  const originalDbPath = path.resolve(__dirname, '../../data/expo.db');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase1-test-'));
  const migratedCopyPath = path.join(tmpDir, 'expo_v28_copy.db');
  let originalSha256Before = '';

  let legacyDb: ExpoDatabase;
  let v28Db: V28CatalogDatabase;
  let server: http.Server;
  let baseUrl = '';
  const adminToken = issueAdminToken('admin');

  beforeAll(async () => {
    if (fs.existsSync(originalDbPath)) {
      originalSha256Before = crypto
        .createHash('sha256')
        .update(fs.readFileSync(originalDbPath))
        .digest('hex');
      // Create consistent copy via SQLite VACUUM INTO (read-only on original)
      const ro = new DatabaseSync(originalDbPath, { readOnly: true });
      ro.exec(`VACUUM INTO '${migratedCopyPath.replace(/'/g, "''")}'`);
      ro.close();
    }

    legacyDb = new ExpoDatabase(':memory:');
    v28Db = new V28CatalogDatabase(fs.existsSync(migratedCopyPath) ? migratedCopyPath : ':memory:');
    const app = createApp(legacyDb, '*', undefined, v28Db);
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    v28Db.close();
    legacyDb.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup error on Windows
    }
  });

  it('M1–M10: migrates a snapshot copy safely, preserves all Booth/Product/Slot IDs, passes FK & integrity checks, stays idempotent, and leaves original expo.db 100% untouched', async () => {
    const report = v28Db.lastMigrationReport;
    expect(report.toVersion).toBeGreaterThanOrEqual(3);
    expect(report.foreignKeyCheckOk).toBe(true);
    expect(report.integrityCheckOk).toBe(true);
    expect(report.counts.booths).toBeGreaterThanOrEqual(6);
    expect(report.counts.companies).toBeGreaterThanOrEqual(6);
    expect(report.counts.products).toBeGreaterThanOrEqual(12);
    expect(report.counts.boothSlotAssignments).toBeGreaterThanOrEqual(11);

    // M2–M4: Verify original booth IDs & slot assignments preserved
    const booths = v28Db.listBooths({ includeArchived: true });
    expect(booths.some((b) => b.id === 'booth-aether-tech')).toBe(true);
    expect(booths.some((b) => b.id === 'booth-nordic-living')).toBe(true);
    const slotsBefore = v28Db.listBoothSlotAssignments();
    expect(slotsBefore.length).toBeGreaterThanOrEqual(11);

    // M7: Re-running migration creates zero duplicate companies
    const countBefore = v28Db.listCompanies().length;
    const secondRun = v28Db.runV28Migration();
    expect(secondRun.counts.companies).toBe(countBefore);
    expect(secondRun.foreignKeyCheckOk).toBe(true);

    // M8: Legacy V27.5 API contracts remain 100% intact
    const legacyBoothsRes = await fetch(`${baseUrl}/api/booths`);
    expect(legacyBoothsRes.status).toBe(200);
    const legacyBoothsJson = (await legacyBoothsRes.json()) as { booths: unknown[] };
    expect(Array.isArray(legacyBoothsJson.booths)).toBe(true);
    expect(legacyBoothsJson.booths.length).toBe(6);

    const legacyProductsRes = await fetch(`${baseUrl}/api/products`);
    expect(legacyProductsRes.status).toBe(200);
    const legacySlotsRes = await fetch(`${baseUrl}/api/slots`);
    expect(legacySlotsRes.status).toBe(200);

    // M10: Original BE/data/expo.db SHA-256 must be 100% identical
    if (originalSha256Before) {
      const originalSha256After = crypto
        .createHash('sha256')
        .update(fs.readFileSync(originalDbPath))
        .digest('hex');
      expect(originalSha256After).toBe(originalSha256Before);
    }
  });

  it('Company Management & Independent Product Catalog: create product without booth, multi-booth ownership, multi-slot reuse, cross-company guard, pagination, and non-destructive booth archive', async () => {
    // Create 2 companies via API (with Admin Auth)
    const createA = await fetch(`${baseUrl}/api/v28/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Alpha Innovations JSC',
        category: 'Công nghệ',
        contactEmail: 'hello@alpha.vn',
      }),
    });
    expect(createA.status).toBe(201);
    const { company: companyA } = (await createA.json()) as { company: { id: string; name: string } };

    const createB = await fetch(`${baseUrl}/api/v28/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Beta Craft Co.', category: 'Thủ công' }),
    });
    expect(createB.status).toBe(201);
    const { company: companyB } = (await createB.json()) as { company: { id: string } };

    // Assign 2 booths to companyA (1 Company -> N Booths)
    v28Db.assignBoothCompany('booth-aether-tech', companyA.id);
    v28Db.assignBoothCompany('booth-kinetix-robotics', companyA.id);
    const detailA = v28Db.getCompanyById(companyA.id);
    expect(detailA?.booths.length).toBe(2);

    // Create product in Company A WITHOUT selecting a booth (boothId = null)
    const prodResA = await fetch(`${baseUrl}/api/v28/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyId: companyA.id,
        name: 'Alpha Smart Sensor X9',
        sku: 'ALPHA-X9',
        price: 4500000,
        currency: 'VND',
        sourceUrl: 'https://alpha.vn/x9',
      }),
    });
    expect(prodResA.status).toBe(201);
    const { product: prodA } = (await prodResA.json()) as { product: { id: string; boothId: string | null } };
    expect(prodA.boothId).toBeNull();

    // Create product in Company B
    const prodB = v28Db.createProduct({
      companyId: companyB.id,
      boothId: null,
      name: 'Beta Ceramic Vase',
      sku: 'BETA-01',
      price: 890000,
      currency: 'VND',
      description: '',
      images: [],
      videoUrl: '',
      modelUrl: '',
      sourceUrl: 'https://beta.vn/vase',
      contactUrl: '',
      inStock: true,
      status: 'active',
    });

    // Assign same Product A to multiple slots of Company A's booths -> ALLOWED
    const slot1 = await fetch(`${baseUrl}/api/v28/booths/booth-aether-tech/slots/slot_01`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ productId: prodA.id }),
    });
    expect(slot1.status).toBe(200);

    const slot2 = await fetch(`${baseUrl}/api/v28/booths/booth-kinetix-robotics/slots/slot_02`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ productId: prodA.id }),
    });
    expect(slot2.status).toBe(200);

    // Cross-company assignment (Product B -> Booth of Company A) -> STRICTLY REJECTED (403)
    const crossRes = await fetch(`${baseUrl}/api/v28/booths/booth-aether-tech/slots/slot_03`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ productId: prodB.id }),
    });
    expect(crossRes.status).toBe(403);

    // Update Product A does NOT break slot assignment
    const updRes = await fetch(`${baseUrl}/api/v28/products/${prodA.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Alpha Smart Sensor X9 Pro', price: 4900000 }),
    });
    expect(updRes.status).toBe(200);
    expect(
      v28Db.listBoothSlotAssignments('booth-aether-tech').some((s) => s.productId === prodA.id)
    ).toBe(true);

    // Archive Booth does NOT delete Product A (M6)
    const archRes = await fetch(`${baseUrl}/api/v28/booths/booth-kinetix-robotics/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(archRes.status).toBe(200);
    expect(v28Db.getProductById(prodA.id)?.name).toBe('Alpha Smart Sensor X9 Pro');

    // Pagination & search
    const listRes = await fetch(
      `${baseUrl}/api/v28/products?companyId=${encodeURIComponent(companyA.id)}&q=Sensor&page=1&limit=5`
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { items: unknown[]; total: number; page: number };
    expect(listJson.total).toBe(1);
    expect(listJson.items.length).toBe(1);
  });

  it('Excel Import Pipeline: 200 valid rows, 500 mixed rows (valid/dup-file/dup-db/errors), limits (>5MB, >1000 rows, bad format), preview non-write, double-submit block, expired token, rollback & CSV export', async () => {
    const company = v28Db.createCompany({
      name: 'Excel Test Corp',
      category: 'Bán lẻ',
      description: '',
      logoUrl: '',
      bannerUrl: '',
      contactEmail: '',
      contactUrl: '',
    });

    // 1. Unauthorized preview -> 401
    const unauth = await fetch(`${baseUrl}/api/v28/imports/excel/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, filename: 'a.xlsx', fileBase64: 'AAAA' }),
    });
    expect(unauth.status).toBe(401);

    // 2. Wrong file format (not a ZIP/XLSX magic header) -> 400
    const badFmt = await fetch(`${baseUrl}/api/v28/imports/excel/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyId: company.id,
        filename: 'fake.xlsx',
        fileBase64: Buffer.from('not an excel file').toString('base64'),
      }),
    });
    expect(badFmt.status).toBe(400);

    // 3. Exceeding 5 MB -> 413
    const excelSvc = new V28ExcelImportService(v28Db);
    const over5Mb = Buffer.alloc(5 * 1024 * 1024 + 64, 0x50);
    await expect(
      excelSvc.createPreview({
        companyId: company.id,
        adminUsername: 'admin',
        filename: 'huge.xlsx',
        fileBuffer: over5Mb,
      })
    ).rejects.toThrow(/5 MB/i);

    // 4. Exceeding 1,000 rows -> 400
    const rows1005 = Array.from({ length: 1005 }, (_, i) => ({
      name: `Prod ${i}`,
      sku: `BIG-${i}`,
      price: 1000,
      currency: 'VND',
      description: '',
      image_url: '',
      source_url: '',
    }));
    const buf1005 = await buildXlsxBuffer(rows1005);
    await expect(
      excelSvc.createPreview({
        companyId: company.id,
        adminUsername: 'admin',
        filename: 'over1000.xlsx',
        fileBuffer: buf1005,
      })
    ).rejects.toThrow(/1000/);

    // 5. Import 200 valid products via HTTP Preview -> verify Preview does NOT write DB -> Commit -> verify 200 created
    const rows200 = Array.from({ length: 200 }, (_, i) => ({
      name: `Sản phẩm hợp lệ #${i + 1}`,
      sku: `EX200-${String(i + 1).padStart(3, '0')}`,
      price: 150000 + i * 1000,
      currency: 'VND',
      description: 'Mô tả test 200 sản phẩm',
      image_url: 'https://example.com/img.jpg',
      source_url: 'https://example.com/p',
    }));
    const buf200 = await buildXlsxBuffer(rows200);
    const prev200Res = await fetch(`${baseUrl}/api/v28/imports/excel/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyId: company.id,
        filename: 'valid_200.xlsx',
        fileBase64: buf200.toString('base64'),
      }),
    });
    expect(prev200Res.status).toBe(200);
    const prev200 = (await prev200Res.json()) as {
      jobId: string;
      previewToken: string;
      summary: { totalRows: number; validCount: number; errorCount: number };
    };
    expect(prev200.summary.totalRows).toBe(200);
    expect(prev200.summary.validCount).toBe(200);
    expect(prev200.summary.errorCount).toBe(0);

    // Preview MUST NOT write to DB!
    expect(v28Db.listProducts({ companyId: company.id }).total).toBe(0);

    // Commit 200 rows
    const commit200Res = await fetch(`${baseUrl}/api/v28/imports/excel/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ previewToken: prev200.previewToken, duplicateStrategy: 'skip' }),
    });
    expect(commit200Res.status).toBe(200);
    const { report: rep200 } = (await commit200Res.json()) as {
      report: { createdCount: number; failedCount: number };
    };
    expect(rep200.createdCount).toBe(200);
    expect(rep200.failedCount).toBe(0);
    expect(v28Db.listProducts({ companyId: company.id }).total).toBe(200);

    // Double-submit commit MUST fail with 409 Conflict!
    const doubleCommit = await fetch(`${baseUrl}/api/v28/imports/excel/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ previewToken: prev200.previewToken, duplicateStrategy: 'skip' }),
    });
    expect(doubleCommit.status).toBe(409);

    // 6. 500 mixed rows: 400 new valid + 50 duplicate in DB + 25 duplicate in file + 15 negative price + 10 invalid URL
    const mixed500: Array<Record<string, string | number>> = [];
    for (let i = 0; i < 400; i++) {
      mixed500.push({
        name: `Mixed Valid ${i}`,
        sku: `MIX-${i}`,
        price: 50000 + i,
        currency: 'VND',
        description: 'ok',
        image_url: 'https://example.com/ok.png',
        source_url: 'https://example.com/item',
      });
    }
    for (let i = 0; i < 50; i++) {
      mixed500.push({
        name: `Updated DB Dup ${i}`,
        sku: `EX200-${String(i + 1).padStart(3, '0')}`,
        price: 999000,
        currency: 'VND',
        description: 'updated',
        image_url: 'https://example.com/ok.png',
        source_url: 'https://example.com/item',
      });
    }
    for (let i = 0; i < 25; i++) {
      mixed500.push({
        name: `In-File Dup ${i}`,
        sku: `MIX-${i}`,
        price: 12000,
        currency: 'VND',
        description: 'dup',
        image_url: '',
        source_url: '',
      });
    }
    for (let i = 0; i < 15; i++) {
      mixed500.push({
        name: `Negative Price ${i}`,
        sku: `NEG-${i}`,
        price: -500,
        currency: 'VND',
        description: 'bad price',
        image_url: '',
        source_url: '',
      });
    }
    for (let i = 0; i < 10; i++) {
      mixed500.push({
        name: `Bad URL ${i}`,
        sku: `URL-${i}`,
        price: 10000,
        currency: 'VND',
        description: 'bad url',
        image_url: 'ftp://not-allowed.local/a.jpg',
        source_url: 'javascript:alert(1)',
      });
    }

    const buf500 = await buildXlsxBuffer(mixed500);
    const prev500Res = await fetch(`${baseUrl}/api/v28/imports/excel/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyId: company.id,
        filename: 'mixed_500.xlsx',
        fileBase64: buf500.toString('base64'),
      }),
    });
    expect(prev500Res.status).toBe(200);
    const prev500 = (await prev500Res.json()) as {
      jobId: string;
      previewToken: string;
      summary: {
        totalRows: number;
        validCount: number;
        duplicateInDbCount: number;
        duplicateInFileCount: number;
        errorCount: number;
      };
    };
    expect(prev500.summary.totalRows).toBe(500);
    expect(prev500.summary.validCount).toBe(400);
    expect(prev500.summary.duplicateInDbCount).toBe(50);
    expect(prev500.summary.duplicateInFileCount).toBe(25);
    expect(prev500.summary.errorCount).toBe(25);

    const commit500Res = await fetch(`${baseUrl}/api/v28/imports/excel/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ previewToken: prev500.previewToken, duplicateStrategy: 'update' }),
    });
    expect(commit500Res.status).toBe(200);
    const { report: rep500 } = (await commit500Res.json()) as {
      report: {
        jobId: string;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        failedCount: number;
      };
    };
    expect(rep500.createdCount).toBe(400);
    expect(rep500.updatedCount).toBe(50);
    expect(rep500.skippedCount).toBe(25);
    expect(rep500.failedCount).toBe(25);
    expect(v28Db.listProducts({ companyId: company.id }).total).toBe(600);

    // CSV error report download
    const csvRes = await fetch(`${baseUrl}/api/v28/imports/${rep500.jobId}/report?format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain('row_number,sku,reason');
    expect(csvText).toContain('NEG-0');

    // 7. Expired preview token -> rejected (410)
    const expPreview = await excelSvc.createPreview({
      companyId: company.id,
      adminUsername: 'admin',
      filename: 'exp.xlsx',
      fileBuffer: await buildXlsxBuffer([
        { name: 'Exp Test', sku: 'EXP-1', price: 1000, currency: 'VND', description: '', image_url: '', source_url: '' },
      ]),
      ttlMs: -1000, // Already expired
    });
    expect(() =>
      excelSvc.commitPreview({
        previewToken: expPreview.previewToken,
        adminUsername: 'admin',
        duplicateStrategy: 'skip',
      })
    ).toThrow(/hết hạn/i);

    // 8. Transaction rollback on failure -> zero partial rows written!
    const totalBeforeRollback = v28Db.listProducts({ companyId: company.id }).total;
    const rbPreview = await excelSvc.createPreview({
      companyId: company.id,
      adminUsername: 'admin',
      filename: 'rollback.xlsx',
      fileBuffer: await buildXlsxBuffer([
        { name: 'RB 1', sku: 'RB-1', price: 1000, currency: 'VND', description: '', image_url: '', source_url: '' },
        { name: 'RB 2', sku: 'RB-2', price: 2000, currency: 'VND', description: '', image_url: '', source_url: '' },
        { name: 'RB 3', sku: 'RB-3', price: 3000, currency: 'VND', description: '', image_url: '', source_url: '' },
      ]),
    });
    expect(() =>
      excelSvc.commitPreview({
        previewToken: rbPreview.previewToken,
        adminUsername: 'admin',
        duplicateStrategy: 'skip',
        simulateFailureAtRow: 4,
      })
    ).toThrow(/Simulated transaction failure/);
    expect(v28Db.listProducts({ companyId: company.id }).total).toBe(totalBeforeRollback);
  });
});
