import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Pool, type PoolConfig } from 'pg';

const SQLITE_MAGIC_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

export function isValidSqliteBuffer(buf: Buffer | null | undefined): boolean {
  if (!buf || buf.length < 100) return false;
  return buf.subarray(0, SQLITE_MAGIC_HEADER.length).equals(SQLITE_MAGIC_HEADER);
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export interface StoredSnapshotRow {
  payload: Buffer;
  sha256: string;
  sizeBytes: number;
  updatedAt?: string;
}

export interface CloudSnapshotStore {
  ensureTable(): Promise<void>;
  getSnapshot(dbKey: string): Promise<StoredSnapshotRow | null>;
  putSnapshot(dbKey: string, payload: Buffer, sha256: string, sizeBytes: number): Promise<void>;
  close(): Promise<void>;
}

export function buildPgPoolConfig(connectionString: string): PoolConfig {
  const lower = connectionString.toLowerCase();
  const isLocal =
    lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('sslmode=disable');
  return {
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  };
}

export class PostgresSnapshotStore implements CloudSnapshotStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool(buildPgPoolConfig(connectionString));
  }

  public async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS expo_sqlite_snapshots (
        db_key TEXT PRIMARY KEY,
        payload BYTEA NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async getSnapshot(dbKey: string): Promise<StoredSnapshotRow | null> {
    const res = await this.pool.query<{
      payload: Buffer;
      sha256: string;
      size_bytes: number;
      updated_at: Date;
    }>(
      'SELECT payload, sha256, size_bytes, updated_at FROM expo_sqlite_snapshots WHERE db_key = $1',
      [dbKey]
    );
    const row = res.rows[0];
    if (!row || !row.payload) return null;
    return {
      payload: Buffer.isBuffer(row.payload) ? row.payload : Buffer.from(row.payload),
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes || 0),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  }

  public async putSnapshot(
    dbKey: string,
    payload: Buffer,
    sha256: string,
    sizeBytes: number
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO expo_sqlite_snapshots (db_key, payload, sha256, size_bytes, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (db_key)
        DO UPDATE SET
          payload = EXCLUDED.payload,
          sha256 = EXCLUDED.sha256,
          size_bytes = EXCLUDED.size_bytes,
          updated_at = NOW()
      `,
      [dbKey, payload, sha256, sizeBytes]
    );
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface RegisteredCloudDb {
  dbKey: string;
  filePath: string;
  checkpoint?: () => void;
}

/**
 * Cloud SQLite Snapshot Persistence Manager (Neon / Supabase / Render PostgreSQL).
 * - Restores SQLite `.db` files from PostgreSQL on startup BEFORE SQLite opens.
 * - Syncs gzipped SQLite snapshots back to PostgreSQL after Admin mutations & before SIGTERM.
 * - Keeps 100% of existing synchronous `node:sqlite` queries, transactions, FKs, and tests untouched.
 */
export class CloudDbSyncManager {
  private readonly store: CloudSnapshotStore;
  private readonly debounceMs: number;
  private readonly registered = new Map<string, RegisteredCloudDb>();
  private readonly lastSyncedHash = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly pendingAgain = new Set<string>();
  private initialized = false;

  constructor(store: CloudSnapshotStore, debounceMs = 600) {
    this.store = store;
    this.debounceMs = Math.max(50, debounceMs);
  }

  public static fromEnv(): CloudDbSyncManager | null {
    const rawUrl = (process.env.DATABASE_URL || process.env.CLOUD_DB_URL || '').trim();
    if (!rawUrl) return null;
    return new CloudDbSyncManager(new PostgresSnapshotStore(rawUrl));
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await this.store.ensureTable();
    this.initialized = true;
  }

  public registerDatabase(entry: RegisteredCloudDb): void {
    if (!entry.filePath || entry.filePath === ':memory:') return;
    this.registered.set(entry.dbKey, entry);
  }

  /**
   * Restores a SQLite database file from PostgreSQL if a valid snapshot exists.
   * Must be called BEFORE opening `new DatabaseSync(filePath)`.
   */
  public async restoreDatabase(dbKey: string, filePath: string): Promise<'restored' | 'empty' | 'invalid'> {
    if (!filePath || filePath === ':memory:') return 'empty';
    await this.init();
    const row = await this.store.getSnapshot(dbKey);
    if (!row) return 'empty';

    let rawSqlite: Buffer;
    try {
      rawSqlite = zlib.gunzipSync(row.payload);
    } catch (err) {
      console.error(`[CloudDbSync] Failed to gunzip snapshot for "${dbKey}":`, err);
      return 'invalid';
    }

    if (!isValidSqliteBuffer(rawSqlite)) {
      console.error(`[CloudDbSync] Snapshot for "${dbKey}" failed SQLite magic header verification.`);
      return 'invalid';
    }

    const absPath = path.resolve(filePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${absPath}.cloud-restore.tmp`;
    fs.writeFileSync(tmpPath, rawSqlite);
    // Remove stale WAL/SHM sidecar files before atomic swap
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${absPath}${suffix}`;
      if (fs.existsSync(sidecar)) {
        try {
          fs.unlinkSync(sidecar);
        } catch {
          // ignore
        }
      }
    }
    fs.renameSync(tmpPath, absPath);
    this.lastSyncedHash.set(dbKey, sha256Hex(rawSqlite));
    console.log(
      `[CloudDbSync] Restored "${dbKey}" (${Math.round(rawSqlite.length / 1024)} KB raw, ${Math.round(row.payload.length / 1024)} KB gzip) from PostgreSQL.`
    );
    return 'restored';
  }

  /**
   * Flushes WAL checkpoint and uploads gzipped snapshot to PostgreSQL if content changed.
   */
  public async syncDatabaseNow(dbKey: string): Promise<boolean> {
    const entry = this.registered.get(dbKey);
    if (!entry || entry.filePath === ':memory:') return false;

    const existingPromise = this.inFlight.get(dbKey);
    if (existingPromise) {
      this.pendingAgain.add(dbKey);
      return existingPromise;
    }

    const run = (async (): Promise<boolean> => {
      try {
        await this.init();
        try {
          entry.checkpoint?.();
        } catch (err) {
          console.warn(`[CloudDbSync] WAL checkpoint warning for "${dbKey}":`, err);
        }

        const absPath = path.resolve(entry.filePath);
        if (!fs.existsSync(absPath)) return false;

        const rawSqlite = fs.readFileSync(absPath);
        if (!isValidSqliteBuffer(rawSqlite)) return false;

        const hash = sha256Hex(rawSqlite);
        if (this.lastSyncedHash.get(dbKey) === hash) {
          return false; // No changes since last cloud sync
        }

        const compressed = zlib.gzipSync(rawSqlite, { level: 6 });
        await this.store.putSnapshot(dbKey, compressed, hash, rawSqlite.length);
        this.lastSyncedHash.set(dbKey, hash);
        console.log(
          `[CloudDbSync] Synced "${dbKey}" -> PostgreSQL (${Math.round(rawSqlite.length / 1024)} KB raw -> ${Math.round(compressed.length / 1024)} KB gzip).`
        );
        return true;
      } catch (err) {
        console.error(`[CloudDbSync] Failed to sync "${dbKey}" to PostgreSQL:`, err);
        return false;
      } finally {
        this.inFlight.delete(dbKey);
        if (this.pendingAgain.has(dbKey)) {
          this.pendingAgain.delete(dbKey);
          void this.syncDatabaseNow(dbKey);
        }
      }
    })();

    this.inFlight.set(dbKey, run);
    return run;
  }

  public scheduleSync(dbKey: string, immediate = false): void {
    if (!this.registered.has(dbKey)) return;
    const prevTimer = this.timers.get(dbKey);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this.timers.delete(dbKey);
    }

    if (immediate) {
      void this.syncDatabaseNow(dbKey);
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(dbKey);
      void this.syncDatabaseNow(dbKey);
    }, this.debounceMs);
    timer.unref?.();
    this.timers.set(dbKey, timer);
  }

  public async flushAll(): Promise<void> {
    for (const [dbKey, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.timers.delete(dbKey);
    }
    const keys = Array.from(this.registered.keys());
    await Promise.all(keys.map((k) => this.syncDatabaseNow(k)));
  }

  public async close(): Promise<void> {
    await this.flushAll();
    await this.store.close();
  }
}
