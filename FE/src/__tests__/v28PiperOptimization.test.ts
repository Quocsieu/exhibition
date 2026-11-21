import { describe, expect, it } from 'vitest';
import {
  buildPiperStepPlanFromDisplayText,
  PiperBrowserTtsManager,
  shouldAllowPiperBackgroundPrewarm,
} from '../services/hybridTtsAdapter';

class FakePiperWorker {
  public initCalls = 0;
  public synthCalls = 0;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onerror: ((ev: ErrorEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;

  postMessage(data: Record<string, unknown>): void {
    const id = Number(data.id || 0);
    const type = String(data.type || '');
    queueMicrotask(() => {
      if (type === 'ping') {
        this.onmessage?.({ data: { id, type: 'pong', crossOriginIsolated: false } } as MessageEvent);
        return;
      }
      if (type === 'init') {
        this.initCalls += 1;
        this.onmessage?.({ data: { id, type: 'ready', downloadMs: 0, initMs: 12, fromCache: true } } as MessageEvent);
        return;
      }
      if (type === 'synthesize') {
        this.synthCalls += 1;
        const wav = new ArrayBuffer(1024);
        this.onmessage?.({
          data: { id, type: 'audio', wavBuffer: wav, synthMs: 45, durationSec: 1.2, sampleRate: 22050 },
        } as MessageEvent);
        return;
      }
      if (type === 'dispose') {
        this.onmessage?.({ data: { id, type: 'disposed' } } as MessageEvent);
      }
    });
  }

  terminate(): void {}
}

describe('Grand Expo V28 Phase 1 — Piper WASM Controlled Prewarm & Cache Verification', () => {
  it('blocks background prewarm on slow connections, Save-Data, offline, and low-RAM devices', () => {
    expect(
      shouldAllowPiperBackgroundPrewarm({
        onLine: true,
        saveData: false,
        effectiveType: '4g',
        deviceMemory: 8,
        hasWebAssembly: true,
        hasWorker: true,
      }).allowed
    ).toBe(true);

    expect(
      shouldAllowPiperBackgroundPrewarm({
        onLine: true,
        saveData: true,
        effectiveType: '4g',
        deviceMemory: 8,
        hasWebAssembly: true,
        hasWorker: true,
      }).allowed
    ).toBe(false);

    expect(
      shouldAllowPiperBackgroundPrewarm({
        onLine: true,
        saveData: false,
        effectiveType: '3g',
        deviceMemory: 8,
        hasWebAssembly: true,
        hasWorker: true,
      }).allowed
    ).toBe(false);

    expect(
      shouldAllowPiperBackgroundPrewarm({
        onLine: false,
        saveData: false,
        effectiveType: '4g',
        deviceMemory: 8,
        hasWebAssembly: true,
        hasWorker: true,
      }).allowed
    ).toBe(false);

    expect(
      shouldAllowPiperBackgroundPrewarm({
        onLine: true,
        saveData: false,
        effectiveType: '4g',
        deviceMemory: 2,
        hasWebAssembly: true,
        hasWorker: true,
      }).allowed
    ).toBe(false);
  });

  it('skips background prewarm when cache is empty (0 bytes for non-NPC visitors), warms singleton worker when cached, and serves repeated transcripts from WAV LRU cache', async () => {
    const prevWorker = globalThis.Worker;
    (globalThis as unknown as { Worker: unknown }).Worker = FakePiperWorker;
    try {
      let workerCreatedCount = 0;
      const fake = new FakePiperWorker();
      const mgr = new PiperBrowserTtsManager(() => {
        workerCreatedCount += 1;
        return fake as unknown as Worker;
      });

      // Cold cache (cacheOnly=true, model NOT cached yet) -> MUST skip with 0 worker creation & 0 init calls!
      const coldResult = await mgr.prewarmInBackground({
        cacheOnly: true,
        hasCachedModelCheck: async () => false,
      });
      expect(coldResult).toBe(false);
      expect(workerCreatedCount).toBe(0);
      expect(fake.initCalls).toBe(0);
      expect(mgr.isModelReady()).toBe(false);

      // Warm cache (model already in CacheStorage) -> concurrent prewarm calls create ONLY 1 worker and call init ONLY once
      const [ok1, ok2] = await Promise.all([
        mgr.prewarmInBackground({ cacheOnly: true, hasCachedModelCheck: async () => true }),
        mgr.prewarmInBackground({ cacheOnly: true, hasCachedModelCheck: async () => true }),
      ]);
      expect(ok1).toBe(true);
      expect(ok2).toBe(true);
      expect(workerCreatedCount).toBe(1);
      expect(fake.initCalls).toBe(1);
      expect(mgr.isModelReady()).toBe(true);

      // First synthesis -> MISS (calls worker once, does NOT call init again)
      const first = await mgr.synthesizeNormalizedChunk({ normalizedText: 'Xin chào quý khách đến với gian hàng.' });
      expect(first.cacheStatus).toBe('MISS');
      expect(fake.initCalls).toBe(1);
      expect(fake.synthCalls).toBe(1);

      // Replay same transcript -> instant HIT from WAV LRU cache (0ms synth, 0 worker calls)
      const replay = await mgr.synthesizeNormalizedChunk({ normalizedText: 'Xin chào quý khách đến với gian hàng.' });
      expect(replay.cacheStatus).toBe('HIT');
      expect(replay.synthMs).toBe(0);
      expect(fake.synthCalls).toBe(1);

      await mgr.disposeWorker();
    } finally {
      (globalThis as unknown as { Worker: unknown }).Worker = prevWorker;
    }
  });

  it('splits long opening sentence for fast TTFA without losing words and prioritizes high-priority playback over low-priority prefetch', async () => {
    const plan = buildPiperStepPlanFromDisplayText(
      'Xin chào quý khách đến với gian hàng CELLPHONES tại Khu Điện thoại. Tôi là Minh Anh, rất hân hạnh được giới thiệu sản phẩm.'
    );
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    expect(plan.chunks[0].length).toBeLessThanOrEqual(58);
    expect(plan.chunks.join(' ')).toContain('Xin chào quý khách');
    expect(plan.chunks.join(' ')).toContain('Minh Anh');

    const prevWorker = globalThis.Worker;
    (globalThis as unknown as { Worker: unknown }).Worker = FakePiperWorker;
    try {
      const order: string[] = [];
      const mgr = new PiperBrowserTtsManager(() => {
        const fake = new FakePiperWorker();
        const origPost = fake.postMessage.bind(fake);
        fake.postMessage = (data: Record<string, unknown>) => {
          if (data.type === 'synthesize') order.push(String(data.text));
          origPost(data);
        };
        return fake as unknown as Worker;
      });

      const p1 = mgr.synthesizeNormalizedChunk({ normalizedText: 'Câu một đang phát.', priority: 'high' });
      const pLow = mgr.synthesizeNormalizedChunk({ normalizedText: 'Prefetch nền.', priority: 'low' });
      const pHigh = mgr.synthesizeNormalizedChunk({ normalizedText: 'Câu ưu tiên cao.', priority: 'high' });
      await Promise.all([p1, pLow, pHigh]);

      expect(order[0]).toBe('Câu một đang phát.');
      expect(order[1]).toBe('Câu ưu tiên cao.');
      expect(order[2]).toBe('Prefetch nền.');
      await mgr.disposeWorker();
    } finally {
      (globalThis as unknown as { Worker: unknown }).Worker = prevWorker;
    }
  });
});
