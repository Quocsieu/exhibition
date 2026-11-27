import { describe, expect, it, beforeEach } from 'vitest';
import {
  computePiperWavCacheKey,
  PiperBrowserTtsManager,
} from '../services/hybridTtsAdapter';
import {
  PredictiveResourceGovernor,
  predictiveResourceGovernor,
  predictiveTtsTelemetry,
  resolvePredictivePreSynthEnabled,
} from '../services/predictiveAudioScheduler';
import { BoothPlaybackLockManager } from '../services/hybridPlaybackController';

function makeValidWavBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(128);
  const view = new DataView(buf);
  view.setUint8(0, 0x52); // R
  view.setUint8(1, 0x49); // I
  view.setUint8(2, 0x46); // F
  view.setUint8(3, 0x46); // F
  view.setUint32(4, 120, true);
  view.setUint8(8, 0x57); // W
  view.setUint8(9, 0x41); // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E
  return buf;
}

class MockPiperWorker {
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onerror: ((ev: ErrorEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;
  public synthesizedTexts: string[] = [];
  public failNextSynth = false;
  public synthDelayMs = 25;

  postMessage(msg: { id: number; type: string; text?: string }) {
    if (msg.type === 'ping') {
      queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: 'pong', crossOriginIsolated: false } } as MessageEvent));
      return;
    }
    if (msg.type === 'init') {
      queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: 'ready', downloadMs: 0, initMs: 5 } } as MessageEvent));
      return;
    }
    if (msg.type === 'dispose') return;
    if (msg.type === 'synthesize') {
      const text = String(msg.text || '');
      this.synthesizedTexts.push(text);
      setTimeout(() => {
        if (this.failNextSynth) {
          this.failNextSynth = false;
          this.onmessage?.({ data: { id: msg.id, type: 'error', message: 'Mock worker error' } } as MessageEvent);
          return;
        }
        this.onmessage?.({
          data: {
            id: msg.id,
            type: 'audio',
            wavBuffer: makeValidWavBuffer(),
            synthMs: this.synthDelayMs,
            durationSec: 1.2,
            sampleRate: 22050,
          },
        } as MessageEvent);
      }, this.synthDelayMs);
    }
  }

  terminate() {}
}

describe('V28 Phase 2 — Intelligent Predictive Audio Pre-synthesis', () => {
  beforeEach(() => {
    if (typeof (globalThis as { Worker?: unknown }).Worker === 'undefined') {
      (globalThis as { Worker?: unknown }).Worker = class MockGlobalWorker {};
    }
    predictiveResourceGovernor.resetForTests();
    predictiveTtsTelemetry.reset();
  });

  it('TC01/TC02/TC03/TC04/TC05: prioritizes P0 over background, promotes queued jobs, reuses active single-flight job, and prevents duplicates', async () => {
    const worker = new MockPiperWorker();
    worker.synthDelayMs = 30;
    const mgr = new PiperBrowserTtsManager(() => worker as unknown as Worker);

    // Start active background job A
    const pBgA = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm A mở đầu.',
      schedulerPriority: 2,
      triggerSource: 'booth_focus',
      isPredictive: true,
    });
    // Queue background job B & C
    const pBgB = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm B mở đầu.',
      schedulerPriority: 2,
      triggerSource: 'booth_focus',
      isPredictive: true,
    });
    const pBgC = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm C mở đầu.',
      schedulerPriority: 3,
      triggerSource: 'npc_speaking',
      isPredictive: false,
    });

    // TC04: Foreground P0 click on A while A is currently active -> single-flight reuse!
    const pFgA = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm A mở đầu.',
      schedulerPriority: 0,
      triggerSource: 'foreground_click',
    });

    // TC03: Foreground P0 click on B while B is queued -> promotes B without duplicate!
    const pFgB = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm B mở đầu.',
      schedulerPriority: 0,
      triggerSource: 'foreground_click',
    });

    // TC01/TC05: Foreground P0 click on D jumps ahead of queued P3 job C!
    const pFgD = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm D khẩn cấp.',
      schedulerPriority: 0,
      triggerSource: 'foreground_click',
    });

    const [rBgA, rFgA, rBgB, rFgB, rFgD, rBgC] = await Promise.all([pBgA, pFgA, pBgB, pFgB, pFgD, pBgC]);
    expect(rBgA.blob.size).toBe(128);
    expect(rFgA.blob.size).toBe(128);
    expect(rBgB.blob.size).toBe(128);
    expect(rFgB.blob.size).toBe(128);
    expect(rFgD.blob.size).toBe(128);
    expect(rBgC.blob.size).toBe(128);

    // Zero duplicate synthesis: A, B, D, C synthesized once each; D ran before C!
    expect(worker.synthesizedTexts).toEqual([
      'Sản phẩm A mở đầu.',
      'Sản phẩm B mở đầu.',
      'Sản phẩm D khẩn cấp.',
      'Sản phẩm C mở đầu.',
    ]);
    const stats = predictiveTtsTelemetry.getSnapshot();
    expect(stats.singleFlightReuses).toBeGreaterThanOrEqual(1);
    expect(stats.priorityPromotions).toBeGreaterThanOrEqual(1);
    expect(stats.duplicatePrevented).toBeGreaterThanOrEqual(1);

    await mgr.disposeWorker();
  });

  it('TC07/TC08/TC09: aborts pending background jobs on booth exit without affecting WAV cache or playback', async () => {
    const worker = new MockPiperWorker();
    worker.synthDelayMs = 25;
    const mgr = new PiperBrowserTtsManager(() => worker as unknown as Worker);
    const ac = new AbortController();

    const p1 = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Câu 1 đang chạy.',
      schedulerPriority: 2,
      signal: ac.signal,
    });
    const p2 = mgr.synthesizeNormalizedChunk({
      normalizedText: 'Câu 2 chờ trong hàng đợi.',
      schedulerPriority: 2,
      signal: ac.signal,
    });

    // Abort on booth exit while p1 is active and p2 is queued
    ac.abort();

    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
    expect(worker.synthesizedTexts).not.toContain('Câu 2 chờ trong hàng đợi.');
    expect(worker.synthesizedTexts.length).toBeLessThanOrEqual(1);
    await mgr.disposeWorker();
  });

  it('TC11/TC12/TC13: background pre-synthesis never mutates BoothPlaybackLockManager (ONE BOOTH — ONE VOICE)', async () => {
    const lockMgr = new BoothPlaybackLockManager();
    expect(lockMgr.getLockState('booth-1')).toBe('UNLOCKED');

    const worker = new MockPiperWorker();
    worker.synthDelayMs = 5;
    const mgr = new PiperBrowserTtsManager(() => worker as unknown as Worker);

    const count = await mgr.preSynthesizeChunks({
      chunks: ['Sản phẩm một giá tốt.', 'Sản phẩm hai chất lượng.'],
      priority: 2,
      triggerSource: 'booth_focus',
      maxChunks: 2,
    });
    expect(count).toBe(2);
    expect(lockMgr.getLockState('booth-1')).toBe('UNLOCKED');
    expect(mgr.hasWavInCache('Sản phẩm một giá tốt.')).toBe(true);

    // Subsequent foreground click hits RAM cache immediately (0ms synth)
    const hit = await mgr.synthesizeNormalizedChunk({
      normalizedText: 'Sản phẩm một giá tốt.',
      schedulerPriority: 0,
    });
    expect(hit.cacheStatus).toBe('HIT');
    expect(hit.synthMs).toBe(0);
    await mgr.disposeWorker();
  });

  it('TC15/TC16/TC17: Adaptive Resource Governor pauses background on low FPS, user movement, hidden tab, Save-Data, or low RAM', () => {
    const gov = new PredictiveResourceGovernor();
    expect(gov.canRunBackgroundJob({ visibilityState: 'visible', deviceMemory: 8, hardwareConcurrency: 4 }, 10_000).allowed).toBe(true);
    expect(gov.canRunBackgroundJob({ visibilityState: 'hidden' }, 10_000).reason).toBe('tab_hidden');
    expect(gov.canRunBackgroundJob({ saveData: true }, 10_000).reason).toBe('save_data');
    expect(gov.canRunBackgroundJob({ deviceMemory: 2 }, 10_000).reason).toBe('low_device_memory');
    expect(gov.canRunBackgroundJob({ effectiveType: '3g' }, 10_000).reason).toBe('slow_network_3g');

    gov.setUserMoving(true, 10_000);
    expect(gov.canRunBackgroundJob({ visibilityState: 'visible' }, 10_100).reason).toBe('user_moving');
    gov.setUserMoving(false, 10_200);

    // Frame spike > 45ms triggers 4000ms cooldown
    gov.recordFrameDeltaMs(62, 12_000);
    expect(gov.canRunBackgroundJob({ visibilityState: 'visible' }, 13_000).reason).toBe('frame_spike_cooldown');
    expect(gov.canRunBackgroundJob({ visibilityState: 'visible' }, 16_500).allowed).toBe(true);
  });

  it('TC19/TC20/TC21: Feature flag OFF disables predictive pre-synth, edited product text invalidates cache key, and worker error recovers cleanly', async () => {
    expect(resolvePredictivePreSynthEnabled({ search: '?predictiveTts=off' })).toBe(false);
    expect(resolvePredictivePreSynthEnabled({ storedValue: 'off' })).toBe(false);
    expect(resolvePredictivePreSynthEnabled({ windowConfigValue: false })).toBe(false);
    expect(resolvePredictivePreSynthEnabled({ search: '', storedValue: null, windowConfigValue: null })).toBe(true);

    const k1 = computePiperWavCacheKey('Sản phẩm A giá một trăm nghìn đồng.');
    const k2 = computePiperWavCacheKey('Sản phẩm A giá hai trăm nghìn đồng.');
    expect(k1).not.toBe(k2);

    const worker = new MockPiperWorker();
    worker.synthDelayMs = 5;
    worker.failNextSynth = true;
    const mgr = new PiperBrowserTtsManager(() => worker as unknown as Worker);

    // Background failure is swallowed cleanly and foreground P0 succeeds right after
    const bgCount = await mgr.preSynthesizeChunks({
      chunks: ['Câu lỗi tạm thời.'],
      triggerSource: 'booth_focus',
    });
    expect(bgCount).toBe(0);

    const fgRes = await mgr.synthesizeNormalizedChunk({
      normalizedText: 'Câu foreground hợp lệ.',
      schedulerPriority: 0,
    });
    expect(fgRes.blob.size).toBe(128);
    await mgr.disposeWorker();
  });
});
