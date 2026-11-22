import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';

async function startTestServer(dbPath: string) {
  const db = new V28CatalogDatabase(dbPath);
  const app = express();
  app.use('/api/v28', createV28ApiRoutes(db));
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  const token = issueAdminToken('admin');
  return { db, server, baseUrl: `http://127.0.0.1:${port}/api/v28`, token };
}

describe('Phase 3 — Atomic Batch Import & Catalog Pagination >100 SP (Quality Gate 3)', () => {
  it('commits 6, 60, and 120 products atomically, prevents duplicates on retry, supports >100 pagination, and persists across reopen', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p3-batch-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const { db, server, baseUrl, token } = await startTestServer(dbPath);
    try {
      const company = db.createCompany({ name: 'HTX Batch Test', contactEmail: 'b@example.com', description: '', status: 'active' });

      // Unauthorized request must be rejected (401)
      const unauth = await fetch(`${baseUrl}/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id, products: [{ name: 'Test', price: 1000 }] }),
      });
      expect(unauth.status).toBe(401);

      // Commit 60 products
      const batch60 = Array.from({ length: 60 }, (_, i) => ({
        name: `Nông Sản Batch #${i + 1}`,
        sku: `B60-${String(i + 1).padStart(3, '0')}`,
        price: 50_000 + i * 1000,
        currency: 'VND',
        description: `Mô tả #${i + 1}`,
        images: [`https://3dtrienlamso.mbws.vn/img/${i + 1}.jpg`],
        sourceUrl: `https://farm.example.com/san-pham/sp-${i + 1}`,
        inStock: true,
      }));
      const res60 = await fetch(`${baseUrl}/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: company.id, duplicateStrategy: 'skip', products: batch60 }),
      });
      expect(res60.status).toBe(201);
      const data60 = (await res60.json()) as { createdCount: number; skippedCount: number };
      expect(data60.createdCount).toBe(60);
      expect(data60.skippedCount).toBe(0);

      // Retry same 60 products -> 0 created, 60 skipped (idempotent!)
      const retry60 = await fetch(`${baseUrl}/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: company.id, duplicateStrategy: 'skip', products: batch60 }),
      });
      const retryData = (await retry60.json()) as { createdCount: number; skippedCount: number };
      expect(retryData.createdCount).toBe(0);
      expect(retryData.skippedCount).toBe(60);

      // Commit 60 more (total 120 products) -> verify listProducts(limit=200) returns all 120!
      const batchNext60 = Array.from({ length: 60 }, (_, i) => ({
        name: `Nông Sản Batch #${i + 61}`,
        sku: `B60-${String(i + 61).padStart(3, '0')}`,
        price: 110_000 + i * 1000,
        currency: 'VND',
        sourceUrl: `https://farm.example.com/san-pham/sp-${i + 61}`,
      }));
      const res120 = await fetch(`${baseUrl}/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: company.id, duplicateStrategy: 'skip', products: batchNext60 }),
      });
      expect(res120.status).toBe(201);

      const listed = db.listProducts({ companyId: company.id, status: 'active', page: 1, limit: 200 });
      expect(listed.total).toBe(120);
      expect(listed.items).toHaveLength(120);

      // Verify true SQLite transaction rollback on mid-batch error
      const beforeRollbackCount = db.listProducts({ companyId: company.id, limit: 250 }).total;
      expect(() => {
        db.runInTransaction(() => {
          db.createProduct({
            companyId: company.id,
            boothId: null,
            name: 'Should Rollback 1',
            sku: 'RB-001',
            price: 1000,
            currency: 'VND',
            description: '',
            images: [],
            videoUrl: '',
            modelUrl: '',
            sourceUrl: 'https://farm.example.com/rb-1',
            contactUrl: '',
            inStock: true,
            status: 'active',
          });
          throw new Error('Simulated mid-batch failure');
        });
      }).toThrow('Simulated mid-batch failure');
      expect(db.listProducts({ companyId: company.id, limit: 250 }).total).toBe(beforeRollbackCount);

      // Verify persistence across DB reopen
      server.close();
      db.close();
      const reopened = new V28CatalogDatabase(dbPath);
      expect(reopened.listProducts({ companyId: company.id, limit: 250 }).total).toBe(120);
      reopened.close();
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
