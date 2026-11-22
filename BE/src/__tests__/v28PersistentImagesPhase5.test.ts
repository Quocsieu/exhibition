import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  V28ProductImageService,
} from '../services/v28ProductImageService.js';
import {
  LocalDiskProductImageStore,
  SAFE_STORED_IMAGE_FILENAME_RE,
  TieredProductImageStore,
  type ProductImageStore,
  type StoredImageRecord,
} from '../services/v28ProductImageStorage.js';

const VALID_JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(128, 0x11)]);
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const VALID_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(128, 0x33),
]);

function mockBinaryResponse(buf: Buffer, status = 200, headers?: Record<string, string>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
}

/**
 * In-memory simulation of the durable PostgreSQL `expo_v28_product_images` backing store.
 * Persists across simulated Render container restarts and complete ephemeral disk wipes.
 */
class SimulatedRemoteDurableStore implements ProductImageStore {
  public readonly mode = 'postgres' as const;
  private readonly rows = new Map<string, StoredImageRecord>();

  constructor(private readonly maxTotalBytes = 50 * 1024 * 1024) {}

  public async init(): Promise<void> {}
  public async has(filename: string): Promise<boolean> {
    return this.rows.has(filename);
  }
  public async get(filename: string): Promise<StoredImageRecord | null> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    const rec = this.rows.get(filename);
    return rec ? { ...rec, data: Buffer.from(rec.data) } : null;
  }
  public async getTotalBytes(): Promise<number> {
    let total = 0;
    for (const r of this.rows.values()) total += r.bytes;
    return total;
  }
  public async put(record: StoredImageRecord): Promise<{ stored: boolean; deduplicated: boolean }> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(record.filename)) throw new Error('INVALID_FILENAME');
    if (this.rows.has(record.filename)) return { stored: true, deduplicated: true };
    const total = await this.getTotalBytes();
    if (total + record.data.length > this.maxTotalBytes) throw new Error('STORAGE_QUOTA_EXCEEDED');
    this.rows.set(record.filename, { ...record, data: Buffer.from(record.data) });
    return { stored: true, deduplicated: false };
  }
  public async listFilenames(): Promise<string[]> {
    return Array.from(this.rows.keys()).sort();
  }
  public async exportAll(): Promise<StoredImageRecord[]> {
    return Array.from(this.rows.values()).map((r) => ({ ...r, data: Buffer.from(r.data) }));
  }
  public async restoreAll(records: StoredImageRecord[]): Promise<{ restoredCount: number }> {
    let restoredCount = 0;
    for (const r of records) {
      const res = await this.put(r);
      if (res.stored) restoredCount++;
    }
    return { restoredCount };
  }
  public clearForDisasterSimulation(): void {
    this.rows.clear();
  }
  public async close(): Promise<void> {}
}

describe('Phase 5 — Persistent Product Image Storage & Redeploy Self-Healing (Quality Gate 5)', () => {
  it('ingests JPG/PNG/WebP, deduplicates, blocks spoofed MIME/oversize/SSRF/traversal, survives backend restart AND simulated Render ephemeral disk wipe, and supports backup/restore', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p5-persist-'));
    const dbPath = path.join(tmpRoot, 'v28.db');
    const diskDir1 = path.join(tmpRoot, 'container-1-disk');
    const diskDir2 = path.join(tmpRoot, 'container-2-redeploy-disk');

    const durablePgSim = new SimulatedRemoteDurableStore();
    const allowValidate = async (u: string) => ({ url: new URL(u), pinnedIp: '93.184.216.34', pinnedFamily: 4 });

    // Container #1: Tiered store (durable PG + ephemeral local disk)
    const tiered1 = new TieredProductImageStore(new LocalDiskProductImageStore(diskDir1), durablePgSim);
    const svc1 = new V28ProductImageService(tiered1);
    await svc1.init();

    // 1. Ingest JPG, PNG, WebP + Deduplicate
    const rJpg = await svc1.ingestImageUrl('https://cdn.example.vn/p1.jpg', {
      validateUrl: allowValidate,
      fetchFn: async () => mockBinaryResponse(VALID_JPG, 200),
    });
    const rPng = await svc1.ingestImageUrl('https://cdn.example.vn/p2.png', {
      validateUrl: allowValidate,
      fetchFn: async () => mockBinaryResponse(VALID_PNG, 200),
    });
    const rWebp = await svc1.ingestImageUrl('https://cdn.example.vn/p3.webp', {
      validateUrl: allowValidate,
      fetchFn: async () => mockBinaryResponse(VALID_WEBP, 200),
    });
    const rDup = await svc1.ingestImageUrl('https://cdn.example.vn/p1-mirror.jpg', {
      validateUrl: allowValidate,
      fetchFn: async () => mockBinaryResponse(VALID_JPG, 200),
    });

    expect(rJpg.ok && rPng.ok && rWebp.ok).toBe(true);
    expect(rDup.ok).toBe(true);
    expect(rDup.filename).toBe(rJpg.filename);
    expect(rDup.deduplicated).toBe(true);

    // 2. Reject spoofed MIME, oversized (>5MB), SSRF private IP, path traversal
    const rSpoof = await svc1.ingestImageUrl('https://cdn.example.vn/fake.jpg', {
      validateUrl: allowValidate,
      fetchFn: async () => mockBinaryResponse(Buffer.from('<html><script>alert(1)</script></html>'), 200),
    });
    expect(rSpoof.ok).toBe(false);
    expect(rSpoof.errorCode).toBe('UNSUPPORTED_CONTENT');

    const rOversize = await svc1.ingestImageUrl('https://cdn.example.vn/huge.png', {
      validateUrl: allowValidate,
      fetchFn: async () =>
        mockBinaryResponse(Buffer.alloc(16), 200, { 'content-length': String(MAX_PRODUCT_IMAGE_BYTES + 1) }),
    });
    expect(rOversize.ok).toBe(false);
    expect(rOversize.errorCode).toBe('SIZE_LIMIT');

    const rSsrf = await svc1.ingestImageUrl('http://127.0.0.1/secret.png');
    expect(rSsrf.ok).toBe(false);
    expect(rSsrf.errorCode).toBe('SSRF_BLOCKED');

    expect(await svc1.getStoredImage('../../../etc/passwd')).toBeNull();
    expect(await svc1.getStoredImage('evil.svg')).toBeNull();

    // 3. Save product referencing the ingested image into SQLite
    const db1 = new V28CatalogDatabase(dbPath);
    const app1 = express();
    app1.use('/api/v28', createV28ApiRoutes(db1, undefined, undefined, undefined, undefined, undefined, undefined, svc1));
    const srv1 = await new Promise<http.Server>((resolve) => {
      const s = app1.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port1 = (srv1.address() as { port: number }).port;
    const token = issueAdminToken('admin');

    try {
      const company = db1.createCompany({ name: 'HTX Persistent Img', contactEmail: 'p@example.vn', description: '', status: 'active' });
      const batchRes = await fetch(`http://127.0.0.1:${port1}/api/v28/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId: company.id,
          products: [
            { name: 'Cà Phê Bền Vững', sku: 'PERSIST-01', price: 150000, images: [rPng.storedUrl!] },
          ],
        }),
      });
      expect(batchRes.status).toBe(201);

      // Verify image served from Container #1
      const imgRes1 = await fetch(`http://127.0.0.1:${port1}${rPng.storedUrl}`);
      expect(imgRes1.status).toBe(200);
      expect(imgRes1.headers.get('content-type')).toBe('image/png');
      expect(imgRes1.headers.get('access-control-allow-origin')).toBe('*');
      expect(imgRes1.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      expect(Buffer.from(await imgRes1.arrayBuffer()).equals(VALID_PNG)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv1.close(() => resolve()));
      db1.close();
    }

    // 4. SIMULATE RENDER REDEPLOY:
    // Completely WIPE Container #1 local disk and boot brand-new Container #2 with an EMPTY local diskDir2
    // connected to the same durable PostgreSQL backing store!
    fs.rmSync(diskDir1, { recursive: true, force: true });
    expect(fs.existsSync(diskDir1)).toBe(false);

    const localCache2 = new LocalDiskProductImageStore(diskDir2);
    expect(await localCache2.listFilenames()).toEqual([]); // Brand-new empty container disk!
    const tiered2 = new TieredProductImageStore(localCache2, durablePgSim);
    const svc2 = new V28ProductImageService(tiered2);
    await svc2.init();

    const db2 = new V28CatalogDatabase(dbPath);
    const app2 = express();
    app2.use('/api/v28', createV28ApiRoutes(db2, undefined, undefined, undefined, undefined, undefined, undefined, svc2));
    const srv2 = await new Promise<http.Server>((resolve) => {
      const s = app2.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port2 = (srv2.address() as { port: number }).port;

    try {
      // Requesting JPG, PNG, WebP on the fresh container MUST succeed (200) via durable store AND self-heal local disk!
      for (const [storedUrl, expectedBuf, expectedMime] of [
        [rJpg.storedUrl!, VALID_JPG, 'image/jpeg'],
        [rPng.storedUrl!, VALID_PNG, 'image/png'],
        [rWebp.storedUrl!, VALID_WEBP, 'image/webp'],
      ] as const) {
        const res = await fetch(`http://127.0.0.1:${port2}${storedUrl}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe(expectedMime);
        expect(Buffer.from(await res.arrayBuffer()).equals(expectedBuf)).toBe(true);
      }

      // Verify local disk cache was automatically self-healed!
      expect((await localCache2.listFilenames()).length).toBe(3);

      // Verify product metadata in SQLite matches stored image
      const prods = db2.listProducts({ status: 'active', page: 1, limit: 20 });
      const savedProd = prods.items.find((p) => p.sku === 'PERSIST-01');
      expect(savedProd?.images[0]).toBe(rPng.storedUrl);

      // 5. BACKUP & RESTORE DISASTER RECOVERY TEST
      const backupSnapshot = await tiered2.exportAll();
      expect(backupSnapshot.length).toBe(3);

      // Wipe BOTH durable store and local disk
      durablePgSim.clearForDisasterSimulation();
      fs.rmSync(diskDir2, { recursive: true, force: true });
      expect(await svc2.getStoredImage(rPng.filename!)).toBeNull();

      // Restore from backup snapshot
      const restored = await tiered2.restoreAll(backupSnapshot);
      expect(restored.restoredCount).toBe(3);

      const recovered = await svc2.getStoredImage(rPng.filename!);
      expect(recovered).not.toBeNull();
      expect(recovered!.data.equals(VALID_PNG)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv2.close(() => resolve()));
      db2.close();
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // ignore Windows WAL cleanup lag
      }
    }
  });

  it('enforces total storage byte quota cleanly without crashing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p5-quota-'));
    try {
      const tinyQuotaStore = new LocalDiskProductImageStore(tmpDir, 200); // 200 bytes cap
      const svc = new V28ProductImageService(tinyQuotaStore);
      const allowValidate = async (u: string) => ({ url: new URL(u), pinnedIp: '93.184.216.34', pinnedFamily: 4 });

      const first = await svc.ingestImageUrl('https://cdn.example.vn/1.png', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(VALID_PNG, 200),
      });
      expect(first.ok).toBe(true);

      const second = await svc.ingestImageUrl('https://cdn.example.vn/2.jpg', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(Buffer.concat([VALID_JPG, Buffer.alloc(150, 0xaa)]), 200),
      });
      expect(second.ok).toBe(false);
      expect(second.errorCode).toBe('STORAGE_QUOTA_EXCEEDED');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
