import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import {
  CloudDbSyncManager,
  isValidSqliteBuffer,
  type CloudSnapshotStore,
  type StoredSnapshotRow,
} from '../database/cloudDbSync.js';

class InMemorySnapshotStore implements CloudSnapshotStore {
  public readonly rows = new Map<string, StoredSnapshotRow>();
  public putCount = 0;

  async ensureTable(): Promise<void> {}

  async getSnapshot(dbKey: string): Promise<StoredSnapshotRow | null> {
    return this.rows.get(dbKey) ?? null;
  }

  async putSnapshot(dbKey: string, payload: Buffer, sha256: string, sizeBytes: number): Promise<void> {
    this.putCount += 1;
    this.rows.set(dbKey, { payload, sha256, sizeBytes, updatedAt: new Date().toISOString() });
  }

  async close(): Promise<void> {}
}

describe('CloudDbSyncManager — Persistent Cloud Snapshot Sync (Neon/Supabase PostgreSQL)', () => {
  it('syncs a SQLite database to cloud, deduplicates unchanged writes, and restores across ephemeral restarts', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-cloud-sync-'));
    const dbFile1 = path.join(tmpDir, 'expo_v28_run1.db');
    const dbFile2 = path.join(tmpDir, 'expo_v28_run2.db');
    const store = new InMemorySnapshotStore();

    try {
      // Run 1: create SQLite DB with 100-booth setting and sync to cloud
      const db1 = new DatabaseSync(dbFile1);
      db1.exec('PRAGMA journal_mode = WAL;');
      db1.exec('CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);');
      db1.prepare('INSERT INTO settings (k, v) VALUES (?, ?)').run('target_booths', '100');

      const sync1 = new CloudDbSyncManager(store, 50);
      sync1.registerDatabase({
        dbKey: 'v28',
        filePath: dbFile1,
        checkpoint: () => db1.exec('PRAGMA wal_checkpoint(TRUNCATE);'),
      });

      const uploaded1 = await sync1.syncDatabaseNow('v28');
      expect(uploaded1).toBe(true);
      expect(store.putCount).toBe(1);

      // Deduplication: syncing again with no changes must NOT re-upload
      const uploadedDup = await sync1.syncDatabaseNow('v28');
      expect(uploadedDup).toBe(false);
      expect(store.putCount).toBe(1);

      db1.close();

      // Run 2 (Simulated Render Restart / Fresh Ephemeral Disk): restore into brand-new path
      const sync2 = new CloudDbSyncManager(store, 50);
      const restoreStatus = await sync2.restoreDatabase('v28', dbFile2);
      expect(restoreStatus).toBe('restored');
      expect(isValidSqliteBuffer(fs.readFileSync(dbFile2))).toBe(true);

      const db2 = new DatabaseSync(dbFile2);
      const row = db2.prepare('SELECT v FROM settings WHERE k = ?').get('target_booths') as { v: string };
      expect(row.v).toBe('100');
      db2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects corrupt or non-SQLite payloads safely without overwriting local disk', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-cloud-corrupt-'));
    const dbFile = path.join(tmpDir, 'expo_v28.db');
    const store = new InMemorySnapshotStore();

    try {
      // Inject non-SQLite gzipped payload
      await store.putSnapshot('v28', zlib.gzipSync(Buffer.from('not a sqlite database')), 'fakehash', 21);
      const sync = new CloudDbSyncManager(store, 50);
      const status = await sync.restoreDatabase('v28', dbFile);
      expect(status).toBe('invalid');
      expect(fs.existsSync(dbFile)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
