import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { buildPgPoolConfig } from '../database/cloudDbSync.js';

export const SAFE_STORED_IMAGE_FILENAME_RE = /^[a-f0-9]{16}\.(jpg|png|webp)$/;
export const DEFAULT_MAX_TOTAL_IMAGE_BYTES = 250 * 1024 * 1024; // 250 MB total cap

export interface StoredImageRecord {
  filename: string;
  mimeType: string;
  data: Buffer;
  bytes: number;
  sha256: string;
  sourceUrl?: string;
}

export interface ProductImageStore {
  readonly mode: 'local-disk' | 'postgres' | 'tiered-postgres-disk';
  init(): Promise<void>;
  has(filename: string): Promise<boolean>;
  get(filename: string): Promise<StoredImageRecord | null>;
  put(record: StoredImageRecord): Promise<{ stored: boolean; deduplicated: boolean }>;
  listFilenames(): Promise<string[]>;
  getTotalBytes(): Promise<number>;
  exportAll(): Promise<StoredImageRecord[]>;
  restoreAll(records: StoredImageRecord[]): Promise<{ restoredCount: number }>;
  close(): Promise<void>;
}

export function mimeTypeFromSafeFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export function resolveProductImagesDirFromEnv(): string {
  const envDir = (process.env.V28_PRODUCT_IMAGES_DIR || '').trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  const beRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  return path.resolve(beRootDir, 'data', 'product-images');
}

export function resolveMaxTotalImageBytesFromEnv(): number {
  const raw = Number(process.env.V28_PRODUCT_IMAGES_MAX_TOTAL_BYTES || '');
  if (Number.isFinite(raw) && raw >= 1024 * 1024) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_TOTAL_IMAGE_BYTES;
}

/**
 * Local disk content-addressed store (also used as the fast read-through cache in TieredProductImageStore).
 * Enforces strict filename regex, atomic tmp->rename writes, no overwrite, and total directory byte quota.
 */
export class LocalDiskProductImageStore implements ProductImageStore {
  public readonly mode = 'local-disk' as const;

  constructor(
    private readonly storageDir: string,
    private readonly maxTotalBytes = DEFAULT_MAX_TOTAL_IMAGE_BYTES
  ) {
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  public getStorageDir(): string {
    return this.storageDir;
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  public resolveFilePathSync(filename: string): { filePath: string; mimeType: string } | null {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    const filePath = path.join(this.storageDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return { filePath, mimeType: mimeTypeFromSafeFilename(filename) };
  }

  public async has(filename: string): Promise<boolean> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return false;
    return fs.existsSync(path.join(this.storageDir, filename));
  }

  public async get(filename: string): Promise<StoredImageRecord | null> {
    const resolved = this.resolveFilePathSync(filename);
    if (!resolved) return null;
    const data = fs.readFileSync(resolved.filePath);
    return {
      filename,
      mimeType: resolved.mimeType,
      data,
      bytes: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    };
  }

  public async getTotalBytes(): Promise<number> {
    if (!fs.existsSync(this.storageDir)) return 0;
    let total = 0;
    for (const entry of fs.readdirSync(this.storageDir)) {
      if (!SAFE_STORED_IMAGE_FILENAME_RE.test(entry)) continue;
      try {
        total += fs.statSync(path.join(this.storageDir, entry)).size;
      } catch {
        // ignore concurrent unlink
      }
    }
    return total;
  }

  public async put(record: StoredImageRecord): Promise<{ stored: boolean; deduplicated: boolean }> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(record.filename)) {
      throw new Error('INVALID_FILENAME');
    }
    fs.mkdirSync(this.storageDir, { recursive: true });
    const targetPath = path.join(this.storageDir, record.filename);
    if (fs.existsSync(targetPath)) {
      return { stored: true, deduplicated: true };
    }
    const currentBytes = await this.getTotalBytes();
    if (currentBytes + record.data.length > this.maxTotalBytes) {
      throw new Error('STORAGE_QUOTA_EXCEEDED');
    }
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmpPath, record.data);
    fs.renameSync(tmpPath, targetPath);
    return { stored: true, deduplicated: false };
  }

  public async listFilenames(): Promise<string[]> {
    if (!fs.existsSync(this.storageDir)) return [];
    return fs
      .readdirSync(this.storageDir)
      .filter((f) => SAFE_STORED_IMAGE_FILENAME_RE.test(f))
      .sort();
  }

  public async exportAll(): Promise<StoredImageRecord[]> {
    const names = await this.listFilenames();
    const out: StoredImageRecord[] = [];
    for (const name of names) {
      const rec = await this.get(name);
      if (rec) out.push(rec);
    }
    return out;
  }

  public async restoreAll(records: StoredImageRecord[]): Promise<{ restoredCount: number }> {
    let restoredCount = 0;
    for (const rec of records) {
      if (!SAFE_STORED_IMAGE_FILENAME_RE.test(rec.filename)) continue;
      const res = await this.put(rec);
      if (res.stored) restoredCount++;
    }
    return { restoredCount };
  }

  public async close(): Promise<void> {
    // no-op for local disk
  }
}

/**
 * Durable PostgreSQL-backed image store reusing the existing DATABASE_URL / CLOUD_DB_URL.
 * Uses an isolated `expo_v28_product_images` table without modifying any SQLite or existing Production tables.
 */
export class PostgresProductImageStore implements ProductImageStore {
  public readonly mode = 'postgres' as const;
  private readonly pool: Pool;
  private initialized = false;

  constructor(
    connectionString: string,
    private readonly maxTotalBytes = DEFAULT_MAX_TOTAL_IMAGE_BYTES
  ) {
    this.pool = new Pool(buildPgPoolConfig(connectionString));
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS expo_v28_product_images (
        filename TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        data BYTEA NOT NULL,
        source_url TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.initialized = true;
  }

  public async has(filename: string): Promise<boolean> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return false;
    await this.init();
    const res = await this.pool.query('SELECT 1 FROM expo_v28_product_images WHERE filename = $1 LIMIT 1', [filename]);
    return res.rows.length > 0;
  }

  public async get(filename: string): Promise<StoredImageRecord | null> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    await this.init();
    const res = await this.pool.query<{
      filename: string;
      mime_type: string;
      bytes: number;
      sha256: string;
      data: Buffer;
      source_url: string;
    }>(
      'SELECT filename, mime_type, bytes, sha256, data, source_url FROM expo_v28_product_images WHERE filename = $1',
      [filename]
    );
    const row = res.rows[0];
    if (!row || !row.data) return null;
    const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    return {
      filename: row.filename,
      mimeType: row.mime_type || mimeTypeFromSafeFilename(row.filename),
      data,
      bytes: Number(row.bytes || data.length),
      sha256: row.sha256,
      sourceUrl: row.source_url || '',
    };
  }

  public async getTotalBytes(): Promise<number> {
    await this.init();
    const res = await this.pool.query<{ total: string | number | null }>(
      'SELECT COALESCE(SUM(bytes), 0) AS total FROM expo_v28_product_images'
    );
    return Number(res.rows[0]?.total || 0);
  }

  public async put(record: StoredImageRecord): Promise<{ stored: boolean; deduplicated: boolean }> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(record.filename)) {
      throw new Error('INVALID_FILENAME');
    }
    await this.init();
    if (await this.has(record.filename)) {
      return { stored: true, deduplicated: true };
    }
    const currentBytes = await this.getTotalBytes();
    if (currentBytes + record.data.length > this.maxTotalBytes) {
      throw new Error('STORAGE_QUOTA_EXCEEDED');
    }
    const res = await this.pool.query(
      `
        INSERT INTO expo_v28_product_images (filename, mime_type, bytes, sha256, data, source_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (filename) DO NOTHING
      `,
      [
        record.filename,
        record.mimeType,
        record.data.length,
        record.sha256,
        record.data,
        (record.sourceUrl || '').slice(0, 1000),
      ]
    );
    return { stored: true, deduplicated: (res.rowCount ?? 0) === 0 };
  }

  public async listFilenames(): Promise<string[]> {
    await this.init();
    const res = await this.pool.query<{ filename: string }>(
      'SELECT filename FROM expo_v28_product_images ORDER BY filename ASC'
    );
    return res.rows.map((r) => r.filename);
  }

  public async exportAll(): Promise<StoredImageRecord[]> {
    await this.init();
    const res = await this.pool.query<{
      filename: string;
      mime_type: string;
      bytes: number;
      sha256: string;
      data: Buffer;
      source_url: string;
    }>('SELECT filename, mime_type, bytes, sha256, data, source_url FROM expo_v28_product_images ORDER BY filename ASC');
    return res.rows.map((row) => {
      const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      return {
        filename: row.filename,
        mimeType: row.mime_type || mimeTypeFromSafeFilename(row.filename),
        data,
        bytes: Number(row.bytes || data.length),
        sha256: row.sha256,
        sourceUrl: row.source_url || '',
      };
    });
  }

  public async restoreAll(records: StoredImageRecord[]): Promise<{ restoredCount: number }> {
    let restoredCount = 0;
    for (const rec of records) {
      if (!SAFE_STORED_IMAGE_FILENAME_RE.test(rec.filename)) continue;
      const res = await this.put(rec);
      if (res.stored) restoredCount++;
    }
    return { restoredCount };
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Write-through + Read-through self-healing store:
 * - Writes durably to `durableStore` (PostgreSQL) FIRST, then caches on `localCache` (disk).
 * - Reads from `localCache` first (<1ms). On cache miss (e.g. after Render redeploy wipes ephemeral disk),
 *   fetches from `durableStore`, warms `localCache` atomically, and serves the image seamlessly.
 */
export class TieredProductImageStore implements ProductImageStore {
  public readonly mode = 'tiered-postgres-disk' as const;

  constructor(
    private readonly localCache: LocalDiskProductImageStore,
    private readonly durableStore: ProductImageStore
  ) {}

  public getLocalCache(): LocalDiskProductImageStore {
    return this.localCache;
  }

  public async init(): Promise<void> {
    await this.localCache.init();
    await this.durableStore.init();
  }

  public async has(filename: string): Promise<boolean> {
    if (await this.localCache.has(filename)) return true;
    return this.durableStore.has(filename);
  }

  public async get(filename: string): Promise<StoredImageRecord | null> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    const cached = await this.localCache.get(filename);
    if (cached) return cached;

    const durable = await this.durableStore.get(filename);
    if (!durable) return null;

    // Self-heal local disk cache after ephemeral container restart/redeploy
    try {
      await this.localCache.put(durable);
    } catch {
      // Serving from durable store still succeeds even if local disk cache is full/read-only
    }
    return durable;
  }

  public async put(record: StoredImageRecord): Promise<{ stored: boolean; deduplicated: boolean }> {
    const durableRes = await this.durableStore.put(record);
    try {
      await this.localCache.put(record);
    } catch {
      // Durable write succeeded; local disk cache miss will self-heal on read
    }
    return durableRes;
  }

  public async listFilenames(): Promise<string[]> {
    const [localNames, durableNames] = await Promise.all([
      this.localCache.listFilenames(),
      this.durableStore.listFilenames(),
    ]);
    return Array.from(new Set([...localNames, ...durableNames])).sort();
  }

  public async getTotalBytes(): Promise<number> {
    return this.durableStore.getTotalBytes();
  }

  public async exportAll(): Promise<StoredImageRecord[]> {
    return this.durableStore.exportAll();
  }

  public async restoreAll(records: StoredImageRecord[]): Promise<{ restoredCount: number }> {
    const res = await this.durableStore.restoreAll(records);
    await this.localCache.restoreAll(records).catch(() => {});
    return res;
  }

  public async close(): Promise<void> {
    await this.durableStore.close();
    await this.localCache.close();
  }
}

export function createProductImageStoreFromEnv(): ProductImageStore {
  const localDir = resolveProductImagesDirFromEnv();
  const maxBytes = resolveMaxTotalImageBytesFromEnv();
  const localStore = new LocalDiskProductImageStore(localDir, maxBytes);
  const pgUrl = (process.env.DATABASE_URL || process.env.CLOUD_DB_URL || '').trim();
  if (pgUrl) {
    const pgStore = new PostgresProductImageStore(pgUrl, maxBytes);
    return new TieredProductImageStore(localStore, pgStore);
  }
  return localStore;
}
