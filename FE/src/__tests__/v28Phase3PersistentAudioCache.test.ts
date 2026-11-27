import { describe, expect, it, beforeEach } from 'vitest';
import {
  computePiperWavCacheKey,
  PiperBrowserTtsManager,
} from '../services/hybridTtsAdapter';
import { PersistentAudioCache, type PersistentAudioRecord } from '../services/persistentAudioCache';

function makeValidWavBuffer(byteLen = 128): ArrayBuffer {
  const buf = new ArrayBuffer(byteLen);
  const view = new DataView(buf);
  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);
  view.setUint32(4, byteLen - 8, true);
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);
  return buf;
}

class InMemoryMockIdbCache extends PersistentAudioCache {
  public readonly store = new Map<string, PersistentAudioRecord>();
  public simulateUnavailable = false;
  public simulateCorruptNext = false;

  public override isSupported(): boolean {
    return !this.simulateUnavailable;
  }

  public override async get(key: string): Promise<PersistentAudioRecord | null> {
    if (this.simulateUnavailable) return null;
    if (this.simulateCorruptNext) {
      this.simulateCorruptNext = false;
      this.store.delete(key);
      return null;
    }
    const rec = this.store.get(key) || null;
    if (!rec) return null;
    rec.lastAccessedAt = Date.now();
    return rec;
  }

  public override async put(record: {
    key: string;
    buffer: ArrayBuffer;
    durationSec: number;
    voiceSignature: string;
  }): Promise<boolean> {
    if (this.simulateUnavailable) return false;
    this.store.set(record.key, {
      key: record.key,
      buffer: record.buffer.slice(0),
      byteSize: record.buffer.byteLength,
      durationSec: record.durationSec,
      voiceSignature: record.voiceSignature,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    return true;
  }
}

class MockPiperWorker {
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public synthCount = 0;

  postMessage(msg: { id: number; type: string }) {
    if (msg.type === 'ping') {
      queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: 'pong' } } as MessageEvent));
      return;
    }
    if (msg.type === 'init') {
      queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: 'ready' } } as MessageEvent));
      return;
    }
    if (msg.type === 'synthesize') {
      this.synthCount += 1;
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            id: msg.id,
            type: 'audio',
            wavBuffer: makeValidWavBuffer(),
            synthMs: 12,
            durationSec: 1.5,
            sampleRate: 22050,
          },
        } as MessageEvent)
      );
    }
  }
  terminate() {}
}

describe('V28 Phase 3 — Persistent Product Audio Cache (IndexedDB)', () => {
  beforeEach(() => {
    if (typeof (globalThis as { Worker?: unknown }).Worker === 'undefined') {
      (globalThis as { Worker?: unknown }).Worker = class MockGlobalWorker {};
    }
  });

  it('persists synthesized audio across simulated F5 / new session without re-running Worker inference', async () => {
    const idb = new InMemoryMockIdbCache();
    const w1 = new MockPiperWorker();
    const mgr1 = new PiperBrowserTtsManager(() => w1 as unknown as Worker, idb);

    // First session: cache MISS -> synthesizes once & writes to IDB
    const res1 = await mgr1.synthesizeNormalizedChunk({ normalizedText: 'Sản phẩm gốm sứ Bát Tràng.' });
    expect(res1.cacheStatus).toBe('MISS');
    expect(w1.synthCount).toBe(1);
    await new Promise((r) => setTimeout(r, 15));
    expect(idb.store.size).toBe(1);

    // Second session (simulates F5 / browser reopen with empty RAM wavCache)
    const w2 = new MockPiperWorker();
    const mgr2 = new PiperBrowserTtsManager(() => w2 as unknown as Worker, idb);
    const res2 = await mgr2.synthesizeNormalizedChunk({ normalizedText: 'Sản phẩm gốm sứ Bát Tràng.' });
    expect(res2.cacheStatus).toBe('HIT');
    expect(res2.synthMs).toBe(0);
    expect(w2.synthCount).toBe(0); // Zero Worker calls!

    // Edited product text -> distinct cache key -> re-synthesizes cleanly
    const res3 = await mgr2.synthesizeNormalizedChunk({ normalizedText: 'Sản phẩm gốm sứ Bát Tràng phiên bản mới.' });
    expect(res3.cacheStatus).toBe('MISS');
    expect(w2.synthCount).toBe(1);

    await mgr1.disposeWorker();
    await mgr2.disposeWorker();
  });

  it('gracefully falls back to RAM + Worker synthesis when IndexedDB is unavailable or corrupt', async () => {
    const idb = new InMemoryMockIdbCache();
    idb.simulateUnavailable = true;
    const w = new MockPiperWorker();
    const mgr = new PiperBrowserTtsManager(() => w as unknown as Worker, idb);

    const r1 = await mgr.synthesizeNormalizedChunk({ normalizedText: 'Kiểm thử fallback khi không có IDB.' });
    expect(r1.cacheStatus).toBe('MISS');
    expect(w.synthCount).toBe(1);

    // RAM cache still hits cleanly
    const r2 = await mgr.synthesizeNormalizedChunk({ normalizedText: 'Kiểm thử fallback khi không có IDB.' });
    expect(r2.cacheStatus).toBe('HIT');
    expect(w.synthCount).toBe(1);
    expect(computePiperWavCacheKey('abc')).toContain('piper-v2-soft-fast|vi_VN-vais1000-medium|ls:0.87');
    await mgr.disposeWorker();
  });
});
