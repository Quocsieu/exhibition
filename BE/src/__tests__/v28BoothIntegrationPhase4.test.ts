import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { V28ProductImageService } from '../services/v28ProductImageService.js';

const VALID_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const SLOT_IDS = ['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06'] as const;

describe('Phase 4 — 10 Booths x 6 Slots = 60 Products Integration & Active World Persistence (Quality Gate 4)', () => {
  it('ingests real images, batch-saves 60 products, assigns 10 booths x 6 slots, serves in active world without touching baseline booths, and persists across DB reopen', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p4-world-'));
    const dbPath = path.join(tmpDir, 'test-world.db');
    const imgDir = path.join(tmpDir, 'product-images');

    // Start local mock CDN serving 10 distinct real PNGs
    const mockImgServer = http.createServer((req, res) => {
      if (req.url && req.url.startsWith('/agri/')) {
        // Append deterministic trailing bytes in PNG comment? No, keep valid PNG header + unique byte in unused tail?
        // Actually PNG magic bytes are checked + size; appending unique bytes after IEND still passes magic bytes & loads in browsers.
        const idx = req.url.replace(/\D/g, '') || '0';
        const buf = Buffer.concat([VALID_PNG_1X1, Buffer.from(`AGRI_${idx}`)]);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(buf);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    await new Promise<void>((resolve) => mockImgServer.listen(0, '127.0.0.1', () => resolve()));
    const imgPort = (mockImgServer.address() as { port: number }).port;

    const db = new V28CatalogDatabase(dbPath);
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(db));
    const apiServer = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const apiPort = (apiServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${apiPort}/api/v28`;
    const token = issueAdminToken('admin');

    try {
      // 1. Fetch active world first to ensure default published exhibition exists (20 booths)
      const initialWorldRes = await fetch(`${baseUrl}/exhibitions/active`);
      expect(initialWorldRes.status).toBe(200);
      const initialWorldJson = (await initialWorldRes.json()) as {
        world: {
          versionId: string;
          booths: Array<{ boothId: string; companyId: string; boothName: string; slots: Array<{ slotId: string; product: unknown }> }>;
        };
      };
      expect(initialWorldJson.world.booths.length).toBeGreaterThanOrEqual(13);

      // Record baseline booths #1 and #2 (indices 0, 1) to guarantee zero unintended modification
      const baselineBooth0 = initialWorldJson.world.booths[0];
      const baselineBooth1 = initialWorldJson.world.booths[1];
      const baselineBooth0SlotCount = baselineBooth0.slots.filter((s) => Boolean(s.product)).length;
      const baselineBooth1SlotCount = baselineBooth1.slots.filter((s) => Boolean(s.product)).length;

      // Select 10 target booths (#3..#10, #12, #13 -> 0-based indices 2..9, 11, 12)
      const targetIndices = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12];
      const targetBooths = targetIndices.map((idx) => initialWorldJson.world.booths[idx]);
      expect(targetBooths.length).toBe(10);

      // 2. Ingest a real binary PNG via V28ProductImageService
      const imageService = new V28ProductImageService(imgDir);
      const ingested = await imageService.ingestImageUrl(`http://127.0.0.1:${imgPort}/agri/1.png`, {
        validateUrl: async (u: string) => ({ url: new URL(u), pinnedIp: '127.0.0.1', pinnedFamily: 4 }),
      });
      expect(ingested.ok).toBe(true);
      expect(ingested.storedUrl).toMatch(/^\/api\/v28\/product-images\/[a-f0-9]{16}\.png$/);

      // 3. Batch-save 60 products (6 per target booth's owning company) and assign 6 slots per booth
      let totalAssigned = 0;
      for (let bIdx = 0; bIdx < targetBooths.length; bIdx++) {
        const booth = targetBooths[bIdx];
        const batchProducts = SLOT_IDS.map((slotId, sIdx) => ({
          name: `Nông sản Gian #${targetIndices[bIdx] + 1} - SP ${sIdx + 1}`,
          sku: `AGRI-B${targetIndices[bIdx] + 1}-S${sIdx + 1}`,
          price: 95000 + bIdx * 10000 + sIdx * 5000,
          currency: 'VND',
          description: `Đặc sản nông sản sạch chuẩn OCOP cho ${booth.boothName} (${slotId}).`,
          images: [ingested.storedUrl!],
          sourceUrl: `https://htx-agri.example.vn/booth-${targetIndices[bIdx] + 1}/sp-${sIdx + 1}`,
          inStock: true,
        }));

        const batchRes = await fetch(`${baseUrl}/products/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            companyId: booth.companyId,
            duplicateStrategy: 'skip',
            products: batchProducts,
          }),
        });
        expect(batchRes.status).toBe(201);
        const batchJson = (await batchRes.json()) as { createdCount: number; productIds: string[] };
        expect(batchJson.createdCount).toBe(6);
        expect(batchJson.productIds.length).toBe(6);

        for (let sIdx = 0; sIdx < SLOT_IDS.length; sIdx++) {
          const assignRes = await fetch(
            `${baseUrl}/booths/${encodeURIComponent(booth.boothId)}/slots/${SLOT_IDS[sIdx]}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ productId: batchJson.productIds[sIdx] }),
            }
          );
          expect(assignRes.status).toBe(200);
          totalAssigned++;
        }
      }
      expect(totalAssigned).toBe(60);

      // 4. Verify GET /api/v28/exhibitions/active returns all 10 booths x 6 slots = 60 products
      const updatedWorldRes = await fetch(`${baseUrl}/exhibitions/active`);
      expect(updatedWorldRes.status).toBe(200);
      const updatedWorldJson = (await updatedWorldRes.json()) as {
        world: {
          booths: Array<{
            boothId: string;
            slots: Array<{
              slotId: string;
              product: { id: string; name: string; price: number; images: string[] } | null;
            }>;
          }>;
        };
      };

      let verifiedProducts = 0;
      for (const targetBooth of targetBooths) {
        const found = updatedWorldJson.world.booths.find((b) => b.boothId === targetBooth.boothId);
        expect(found).toBeDefined();
        const filled = found!.slots.filter((s) => s.product !== null);
        expect(filled.length).toBe(6);
        for (const s of filled) {
          expect(s.product!.name).toContain('Nông sản');
          expect(s.product!.price).toBeGreaterThan(0);
          expect(s.product!.images[0]).toBe(ingested.storedUrl);
          verifiedProducts++;
        }
      }
      expect(verifiedProducts).toBe(60);

      // Verify baseline booths #1 and #2 were NOT modified
      const afterBooth0 = updatedWorldJson.world.booths.find((b) => b.boothId === baselineBooth0.boothId)!;
      const afterBooth1 = updatedWorldJson.world.booths.find((b) => b.boothId === baselineBooth1.boothId)!;
      expect(afterBooth0.slots.filter((s) => Boolean(s.product)).length).toBe(baselineBooth0SlotCount);
      expect(afterBooth1.slots.filter((s) => Boolean(s.product)).length).toBe(baselineBooth1SlotCount);

      // 5. Verify persistence across DB reopen
      db.close();
      const reopenedDb = new V28CatalogDatabase(dbPath);
      const allSlots = reopenedDb.listBoothSlotAssignments();
      const targetBoothIdSet = new Set(targetBooths.map((b) => b.boothId));
      const persistedTargetSlots = allSlots.filter((s) => targetBoothIdSet.has(s.boothId));
      expect(persistedTargetSlots.length).toBe(60);
      reopenedDb.close();
    } finally {
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
      await new Promise<void>((resolve) => mockImgServer.close(() => resolve()));
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows SQLite WAL handle release lag on temp dir cleanup
      }
    }
  });
});
