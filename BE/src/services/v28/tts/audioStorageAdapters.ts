import { Pool } from 'pg';
import { buildPgPoolConfig } from '../../../database/cloudDbSync.js';
import type { AudioStorageAdapter } from '../audioCacheService.js';

/**
 * Durable PostgreSQL-backed audio blob store for ephemeral filesystems (e.g. Render).
 * Reuses existing DATABASE_URL / CLOUD_DB_URL with an isolated `expo_v28_audio_blobs` table.
 */
export class PostgresAudioStorageAdapter implements AudioStorageAdapter {
  public readonly driverName = 'postgres';
  private readonly pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool(buildPgPoolConfig(connectionString));
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS expo_v28_audio_blobs (
        storage_key TEXT PRIMARY KEY,
        bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.initialized = true;
  }

  public async put(storageKey: string, buffer: Buffer): Promise<void> {
    await this.ensureTable();
    await this.pool.query(
      `INSERT INTO expo_v28_audio_blobs (storage_key, bytes, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (storage_key) DO UPDATE SET bytes = EXCLUDED.bytes, data = EXCLUDED.data, updated_at = NOW()`,
      [storageKey, buffer.length, buffer]
    );
  }

  public async get(storageKey: string): Promise<Buffer | null> {
    await this.ensureTable();
    const res = await this.pool.query<{ data: Buffer }>(
      'SELECT data FROM expo_v28_audio_blobs WHERE storage_key = $1',
      [storageKey]
    );
    const row = res.rows[0];
    if (!row?.data) return null;
    return Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  }

  public async exists(storageKey: string): Promise<boolean> {
    await this.ensureTable();
    const res = await this.pool.query('SELECT 1 FROM expo_v28_audio_blobs WHERE storage_key = $1 LIMIT 1', [
      storageKey,
    ]);
    return res.rows.length > 0;
  }

  public async delete(storageKey: string): Promise<void> {
    await this.ensureTable();
    await this.pool.query('DELETE FROM expo_v28_audio_blobs WHERE storage_key = $1', [storageKey]);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Write-through + Read-through tiered audio storage:
 * - Writes to durable Postgres first, then caches on local disk for fast streaming.
 * - On local disk miss (e.g. Render redeploy), self-heals from Postgres automatically.
 */
export class TieredAudioStorageAdapter implements AudioStorageAdapter {
  public readonly driverName = 'tiered_postgres_fs';

  constructor(
    public readonly local: AudioStorageAdapter,
    private readonly durable: AudioStorageAdapter
  ) {}

  public async put(storageKey: string, buffer: Buffer): Promise<void> {
    await this.durable.put(storageKey, buffer);
    await this.local.put(storageKey, buffer).catch(() => {});
  }

  public async get(storageKey: string): Promise<Buffer | null> {
    const localBuf = await this.local.get(storageKey);
    if (localBuf) return localBuf;
    const remoteBuf = await this.durable.get(storageKey);
    if (!remoteBuf) return null;
    await this.local.put(storageKey, remoteBuf).catch(() => {});
    return remoteBuf;
  }

  public async exists(storageKey: string): Promise<boolean> {
    if (await this.local.exists(storageKey)) return true;
    return this.durable.exists(storageKey);
  }

  public async delete(storageKey: string): Promise<void> {
    await Promise.allSettled([
      this.durable.delete?.(storageKey) ?? Promise.resolve(),
      this.local.delete?.(storageKey) ?? Promise.resolve(),
    ]);
  }
}
