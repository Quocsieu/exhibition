/**
 * Phase 3 — Persistent Product Audio Cache (IndexedDB).
 *
 * Stores synthesized Piper WAV buffers across F5 reloads and browser restarts
 * keyed by full voice/model/speed/noise/config-version/normalized-text identity.
 * - Never blocks audio playback on write errors, private browsing, or QuotaExceededError.
 * - Validates RIFF/WAVE header on read and auto-evicts corrupt/LRU entries within budget.
 */

export const IDB_AUDIO_DB_NAME = 'virtual-expo-audio-cache-v1';
export const IDB_AUDIO_STORE_NAME = 'wav_clips';
export const IDB_AUDIO_SCHEMA_VERSION = 1;
export const MAX_IDB_ENTRIES = 120;
export const MAX_IDB_BYTES = 24 * 1024 * 1024; // 24 MB cap

export interface PersistentAudioRecord {
  key: string;
  buffer: ArrayBuffer;
  byteSize: number;
  durationSec: number;
  voiceSignature: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface PersistentAudioCacheStats {
  supported: boolean;
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  corruptPurged: number;
}

function isValidRiffWav(buf: ArrayBuffer | null | undefined): buf is ArrayBuffer {
  if (!buf || !(buf instanceof ArrayBuffer) || buf.byteLength <= 44) return false;
  const u8 = new Uint8Array(buf, 0, 12);
  return (
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && // RIFF
    u8[8] === 0x57 && u8[9] === 0x41 && u8[10] === 0x56 && u8[11] === 0x45 // WAVE
  );
}

export class PersistentAudioCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly inFlightReads = new Map<string, Promise<PersistentAudioRecord | null>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private stats: Omit<PersistentAudioCacheStats, 'supported'> = {
    hits: 0,
    misses: 0,
    writes: 0,
    evictions: 0,
    corruptPurged: 0,
  };

  constructor(options?: { maxEntries?: number; maxBytes?: number }) {
    this.maxEntries = options?.maxEntries ?? MAX_IDB_ENTRIES;
    this.maxBytes = options?.maxBytes ?? MAX_IDB_BYTES;
  }

  public isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  public getStats(): PersistentAudioCacheStats {
    return { supported: this.isSupported(), ...this.stats };
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(IDB_AUDIO_DB_NAME, IDB_AUDIO_SCHEMA_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_AUDIO_STORE_NAME)) {
            const store = db.createObjectStore(IDB_AUDIO_STORE_NAME, { keyPath: 'key' });
            store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => {
          this.dbPromise = null;
          resolve(null);
        };
        req.onblocked = () => {
          resolve(null);
        };
      } catch {
        this.dbPromise = null;
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async get(key: string): Promise<PersistentAudioRecord | null> {
    if (!key || !this.isSupported()) return null;
    const existing = this.inFlightReads.get(key);
    if (existing) return existing;

    const p = (async (): Promise<PersistentAudioRecord | null> => {
      const db = await this.openDb();
      if (!db) return null;

      return new Promise<PersistentAudioRecord | null>((resolve) => {
        try {
          const tx = db.transaction(IDB_AUDIO_STORE_NAME, 'readwrite');
          const store = tx.objectStore(IDB_AUDIO_STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => {
            const rec = req.result as PersistentAudioRecord | undefined;
            if (!rec) {
              this.stats.misses += 1;
              resolve(null);
              return;
            }
            if (!isValidRiffWav(rec.buffer)) {
              this.stats.corruptPurged += 1;
              this.stats.misses += 1;
              try {
                store.delete(key);
              } catch {
                // ignore
              }
              resolve(null);
              return;
            }
            this.stats.hits += 1;
            const now = Date.now();
            const updated: PersistentAudioRecord = { ...rec, lastAccessedAt: now };
            try {
              store.put(updated);
            } catch {
              // ignore touch errors
            }
            resolve(updated);
          };
          req.onerror = () => {
            this.stats.misses += 1;
            resolve(null);
          };
        } catch {
          this.stats.misses += 1;
          resolve(null);
        }
      });
    })().finally(() => {
      this.inFlightReads.delete(key);
    });

    this.inFlightReads.set(key, p);
    return p;
  }

  public async put(record: {
    key: string;
    buffer: ArrayBuffer;
    durationSec: number;
    voiceSignature: string;
  }): Promise<boolean> {
    if (!record.key || !isValidRiffWav(record.buffer) || !this.isSupported()) return false;
    if (record.buffer.byteLength > 4 * 1024 * 1024) return false;

    const db = await this.openDb();
    if (!db) return false;

    const now = Date.now();
    const entry: PersistentAudioRecord = {
      key: record.key,
      buffer: record.buffer.slice(0),
      byteSize: record.buffer.byteLength,
      durationSec: record.durationSec,
      voiceSignature: record.voiceSignature,
      createdAt: now,
      lastAccessedAt: now,
    };

    const stored = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(IDB_AUDIO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_AUDIO_STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => {
          this.stats.writes += 1;
          resolve(true);
        };
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });

    if (stored) {
      void this.enforceBudget(db);
    }
    return stored;
  }

  private async enforceBudget(db: IDBDatabase): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_AUDIO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_AUDIO_STORE_NAME);
        const index = store.index('lastAccessedAt');
        const req = index.openCursor();
        const items: Array<{ key: string; byteSize: number }> = [];
        let totalBytes = 0;

        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as PersistentAudioRecord;
            const sz = Number(val.byteSize || val.buffer?.byteLength || 0);
            items.push({ key: val.key, byteSize: sz });
            totalBytes += sz;
            cursor.continue();
            return;
          }

          let count = items.length;
          let idx = 0;
          while ((count > this.maxEntries || totalBytes > this.maxBytes) && idx < items.length) {
            const victim = items[idx++];
            try {
              store.delete(victim.key);
              count -= 1;
              totalBytes -= victim.byteSize;
              this.stats.evictions += 1;
            } catch {
              // ignore
            }
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async clearAll(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_AUDIO_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_AUDIO_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const persistentAudioCache = new PersistentAudioCache();
