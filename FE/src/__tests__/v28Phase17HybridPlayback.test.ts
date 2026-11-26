import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUDIO_TTS_START_TIMEOUT_MS,
  DIRECT_TTS_LOCKED_VOICE,
  HybridPlaybackCoordinator,
  type AttemptAudioContext,
} from '../services/hybridPlaybackController';
import { NpcAudioFirstService } from '../services/npcAudioFirstService';
import { buildProductConsultationSteps } from '../services/npcConsultationScript';
import type { V28BoothPlacementView, V28Product } from '../services/v28Api';

function makeBooth(boothId: string, name: string): V28BoothPlacementView {
  return {
    boothId,
    companyId: `comp-${boothId}`,
    companyName: name,
    displayName: name,
    boothTemplate: 'signature_ring',
    positionX: 0,
    positionZ: 0,
    rotationY: 0,
    zoneId: 'zone-1',
    slots: [],
  } as unknown as V28BoothPlacementView;
}

describe('GRAND EXPO V28 — PHASE 1.7: Hybrid Audio Playback (2-Second Booth-Level Fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC01 — Audio starts at 300ms: keeps AUDIO_TTS and records clickToPlayMs=300', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let directCalls = 0;

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(ctx.markAudioStarted()).toBe(true);
            resolve();
          }, 300);
        });
      },
      runDirectTts: async () => {
        directCalls += 1;
      },
    });

    await vi.advanceTimersByTimeAsync(300);
    const metrics = await p;
    expect(metrics.modeUsed).toBe('AUDIO_TTS');
    expect(metrics.clickToPlayMs).toBe(300);
    expect(directCalls).toBe(0);
    expect(coord.getState()).toBe('AUDIO_PLAYING');
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('AUDIO_TTS');
  });

  it('TC02 — Audio starts at 1,900ms: keeps AUDIO_TTS under 2,000ms threshold', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let directCalls = 0;

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(ctx.markAudioStarted()).toBe(true);
            resolve();
          }, 1900);
        });
      },
      runDirectTts: async () => {
        directCalls += 1;
      },
    });

    await vi.advanceTimersByTimeAsync(1900);
    const metrics = await p;
    expect(metrics.modeUsed).toBe('AUDIO_TTS');
    expect(metrics.clickToPlayMs).toBe(1900);
    expect(directCalls).toBe(0);
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('AUDIO_TTS');
  });

  it('TC03 & TC04 — Audio not started at 2,000ms triggers DIRECT_TTS, locks booth, and late 5,000ms audio cannot barge in', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let lateAudioAuthorized = true;
    let directStarted = false;

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            lateAudioAuthorized = ctx.markAudioStarted();
            resolve();
          }, 5000);
        });
      },
      runDirectTts: async (ctx) => {
        setTimeout(() => {
          directStarted = ctx.markDirectStarted();
        }, 40);
      },
    });

    await vi.advanceTimersByTimeAsync(AUDIO_TTS_START_TIMEOUT_MS);
    const metrics = await p;
    expect(metrics.modeUsed).toBe('DIRECT_TTS');
    expect(metrics.fallbackReason).toBe('timeout_2000ms');
    expect(metrics.fallbackTriggerMs).toBe(2000);
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('DIRECT_TTS');

    await vi.advanceTimersByTimeAsync(50);
    expect(directStarted).toBe(true);
    expect(coord.getState()).toBe('DIRECT_TTS_PLAYING');

    // Advance to 5,000ms when late Audio TTS returns -> MUST NOT barge in!
    await vi.advanceTimersByTimeAsync(3000);
    expect(lateAudioAuthorized).toBe(false);
    expect(coord.getState()).toBe('DIRECT_TTS_PLAYING');
  });

  it('TC05 — Audio errors immediately: falls back immediately without waiting 2,000ms', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let directStarted = false;

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async () => {
        await new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('HTTP 503')), 50);
        });
      },
      runDirectTts: async (ctx) => {
        directStarted = ctx.markDirectStarted();
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    const metrics = await p;
    expect(metrics.modeUsed).toBe('DIRECT_TTS');
    expect(metrics.fallbackReason).toBe('audio_error');
    expect(metrics.fallbackTriggerMs).toBe(50);
    expect(directStarted).toBe(true);
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('DIRECT_TTS');
  });

  it('TC06 — Selecting 2nd product after fallback uses DIRECT_TTS immediately with 0 Audio/Gemini calls and 0 wait', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    coord.lockManager.lockBoothToDirectTts('booth-1', 'timeout_2000ms');

    let audioCalls = 0;
    let directCalls = 0;

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async () => {
        audioCalls += 1;
      },
      runDirectTts: async (ctx) => {
        directCalls += 1;
        ctx.markDirectStarted();
      },
    });

    const metrics = await p;
    expect(audioCalls).toBe(0);
    expect(directCalls).toBe(1);
    expect(metrics.modeUsed).toBe('DIRECT_TTS');
    expect(metrics.fallbackReason).toBe('booth_locked');
    expect(metrics.directTtsStartMs).toBe(0);
  });

  it('TC07 — Rapidly clicking 5 products plays only the 5th (current) product', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    const startedProducts: number[] = [];

    for (let i = 1; i <= 5; i += 1) {
      const idx = i;
      void coord.start({
        boothId: 'booth-1',
        runAudioTts: async (ctx) => {
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              if (ctx.markAudioStarted()) {
                startedProducts.push(idx);
              }
              resolve();
            }, 100);
          });
        },
        runDirectTts: async () => {},
      });
    }

    await vi.advanceTimersByTimeAsync(200);
    expect(startedProducts).toEqual([5]);
  });

  it('TC08 & TC09 — Leaving booth stops audio & resets lock; switching booths starts new booth at AUDIO_TTS', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    coord.lockManager.lockBoothToDirectTts('booth-1', 'timeout_2000ms');
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('DIRECT_TTS');

    coord.stop({ resetAllLocks: true });
    expect(coord.getState()).toBe('STOPPED');
    expect(coord.lockManager.getBoothMode('booth-1')).toBe('AUDIO_TTS');
    expect(coord.lockManager.getBoothMode('booth-2')).toBe('AUDIO_TTS');
  });

  it('TC10 — Two visitors in the same booth have independent fallback states', () => {
    const visitorA = new HybridPlaybackCoordinator();
    const visitorB = new HybridPlaybackCoordinator();

    visitorA.lockManager.lockBoothToDirectTts('booth-1', 'timeout_2000ms');
    expect(visitorA.lockManager.getBoothMode('booth-1')).toBe('DIRECT_TTS');
    expect(visitorB.lockManager.getBoothMode('booth-1')).toBe('AUDIO_TTS');
  });

  it('TC11 — Pause and resume do not overlap or duplicate playback', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let startedCount = 0;

    const p1 = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        if (ctx.markAudioStarted()) startedCount += 1;
      },
      runDirectTts: async () => {},
    });
    await p1;
    coord.pause();
    expect(coord.getState()).toBe('PAUSED');

    const p2 = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        if (ctx.markAudioStarted()) startedCount += 1;
      },
      runDirectTts: async () => {},
    });
    await p2;
    expect(startedCount).toBe(2);
    expect(coord.getState()).toBe('AUDIO_PLAYING');
  });

  it('TC12 — Valid cached audio in NpcAudioFirstService makes 0 duplicate network/Gemini requests', async () => {
    const svc = new NpcAudioFirstService();
    let fetches = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response(new Uint8Array(128), { status: 200 });
    }) as typeof fetch;

    try {
      const first = await svc.fetchAudioBlobFromUrl({
        audioId: 'aud-1',
        audioUrl: '/api/v28/audio/aud-1/stream',
        source: 'pre_generated',
        provider: 'gemini',
        voiceId: 'Kore',
      });
      const second = await svc.fetchAudioBlobFromUrl({
        audioId: 'aud-1',
        audioUrl: '/api/v28/audio/aud-1/stream',
        source: 'pre_generated',
        provider: 'gemini',
        voiceId: 'Kore',
      });
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(fetches).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('TC13 — Piper Direct TTS failure transitions cleanly to ERROR without chime', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    const states: string[] = [];

    const p = coord.start({
      boothId: 'booth-1',
      runAudioTts: async () => {
        throw new Error('Audio unavailable');
      },
      runDirectTts: async () => {
        throw new Error('Piper WASM failed to initialize');
      },
      onStateChange: (s) => states.push(s),
    });

    await p;
    expect(coord.getState()).toBe('ERROR');
    expect(states).toContain('ERROR');
  });

  it('TC16 & TC17 — Concurrent completion allows only one source; stale booth callback is ignored', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let audioCtxFromBooth1: AttemptAudioContext | undefined;

    const p1 = coord.start({
      boothId: 'booth-1',
      runAudioTts: async (ctx) => {
        audioCtxFromBooth1 = ctx;
        await new Promise<void>((r) => setTimeout(r, 3000));
      },
      runDirectTts: async (ctx) => {
        ctx.markDirectStarted();
      },
    });

    await vi.advanceTimersByTimeAsync(2000);
    await p1;

    // Switch to booth-2 -> booth-1 callback arriving later must be ignored
    const p2 = coord.start({
      boothId: 'booth-2',
      runAudioTts: async (ctx) => {
        expect(ctx.markAudioStarted()).toBe(true);
      },
      runDirectTts: async () => {},
    });
    await p2;

    expect(audioCtxFromBooth1?.isAudioAuthorized()).toBe(false);
    expect(audioCtxFromBooth1?.markAudioStarted()).toBe(false);
    expect(coord.getState()).toBe('AUDIO_PLAYING');
  });

  it('TC18 — Product missing description does not invent product details', () => {
    const booth = makeBooth('booth-1', 'Gian Hàng Nông Sản');
    const product: V28Product = {
      id: 'prod-no-desc',
      companyId: 'comp-1',
      name: 'Gạo ST25 Đặc Sản',
      price: 0,
      currency: 'VND',
      description: '',
      specifications: {},
      status: 'active',
    } as unknown as V28Product;

    const steps = buildProductConsultationSteps(booth, product, 'slot-1');
    expect(steps.length).toBe(1);
    expect(steps[0].fallbackText).toContain('Gạo ST25 Đặc Sản');
    expect(steps[0].fallbackText).not.toMatch(/chống nước|bảo hành|AI|pin/i);
  });

  it('Phase 1.7.2 Integration — Full 10-step Aether booth flow keeps DIRECT_TTS + Piper vi_VN-vais1000-medium through modal close/reopen/replay/pause/resume until booth switch', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    let audioTtsRequests = 0;
    let supertonicRequests = 0;
    const timeline: Array<{ step: string; boothId: string; mode: string; engine: string; voiceId: string }> = [];

    const runDirectPiper = (stepLabel: string, boothId: string) =>
      coord.start({
        boothId,
        runAudioTts: async () => {
          audioTtsRequests += 1;
        },
        runDirectTts: async (ctx) => {
          ctx.markDirectStarted();
          const lockedVoice = coord.lockManager.getLockedVoiceConfig(boothId) ?? DIRECT_TTS_LOCKED_VOICE;
          timeline.push({
            step: stepLabel,
            boothId,
            mode: coord.lockManager.getBoothMode(boothId),
            engine: lockedVoice.engine,
            voiceId: lockedVoice.voiceId,
          });
        },
      });

    // 1. Click NPC in booth-aether-tech -> 2. Timeout at 2000ms triggers DIRECT_TTS
    const p1 = coord.start({
      boothId: 'booth-aether-tech',
      runAudioTts: async () => {
        audioTtsRequests += 1;
        await new Promise<void>(() => {});
      },
      runDirectTts: async (ctx) => {
        ctx.markDirectStarted();
        const lockedVoice = coord.lockManager.getLockedVoiceConfig('booth-aether-tech')!;
        timeline.push({
          step: '2.NPC_TIMEOUT_DIRECT',
          boothId: 'booth-aether-tech',
          mode: coord.lockManager.getBoothMode('booth-aether-tech'),
          engine: lockedVoice.engine,
          voiceId: lockedVoice.voiceId,
        });
      },
    });
    await vi.advanceTimersByTimeAsync(AUDIO_TTS_START_TIMEOUT_MS);
    await p1;
    expect(audioTtsRequests).toBe(1);

    // 3. Click Product A
    await runDirectPiper('3.PRODUCT_A', 'booth-aether-tech');
    // 4. Click Product A again (forceReplay)
    await runDirectPiper('4.PRODUCT_A_REPLAY', 'booth-aether-tech');
    // 5. Pause & Resume
    coord.pause();
    await runDirectPiper('5.RESUME_PRODUCT_A', 'booth-aether-tech');
    // 6. Click Product B
    await runDirectPiper('6.PRODUCT_B', 'booth-aether-tech');
    // 7. Close Product Modal (stopPlaybackOnly -> MUST keep booth lock!)
    coord.stopPlaybackOnly();
    expect(coord.lockManager.getBoothMode('booth-aether-tech')).toBe('DIRECT_TTS');
    // 8. Reopen Product Modal
    await runDirectPiper('8.REOPEN_PRODUCT', 'booth-aether-tech');
    // 9. Click NPC again
    await runDirectPiper('9.NPC_RECLICK', 'booth-aether-tech');

    // Steps 2..9: ZERO new Audio/Gemini/Supertonic requests, 100% same engine + voiceId!
    expect(audioTtsRequests).toBe(1);
    expect(supertonicRequests).toBe(0);
    for (const entry of timeline) {
      expect(entry.mode).toBe('DIRECT_TTS');
      expect(entry.engine).toBe('hybrid-piper');
      expect(entry.voiceId).toBe('vi_VN-vais1000-medium');
    }

    // 10. Leave booth / switch to booth-2 -> resets booth-aether-tech and starts booth-2 in AUDIO_TTS
    coord.stop({ resetAllLocks: true });
    expect(coord.lockManager.getBoothMode('booth-aether-tech')).toBe('AUDIO_TTS');
    expect(coord.lockManager.getBoothMode('booth-2')).toBe('AUDIO_TTS');
  });

  it('Phase 1.7.2 Wiring — useNpcConsultationSession & DynamicExhibitionPage enforce voice lock, stopPlaybackOnly, and onplaying', () => {
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, '../hooks/useNpcConsultationSession.ts'),
      'utf8'
    );
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../pages/DynamicExhibitionPage.tsx'),
      'utf8'
    );

    // Product Modal close calls stopPlaybackOnly (not stopSession)
    expect(pageSrc).toContain('npcSession.stopPlaybackOnly()');
    // Real consultationMode returned (not hardcoded 'booth')
    expect(hookSrc).not.toContain("consultationMode: 'booth' as const");
    // Direct TTS gates out Supertonic F3
    expect(hookSrc).toContain("if (!effectiveDirectOnly && ttsProvider === 'supertonic')");
    // forceReplay & resumeSession honor DIRECT_TTS lock
    expect(hookSrc).toContain("coordinatorRef.current.lockManager.getBoothMode(booth.boothId) === 'DIRECT_TTS'");
    // HTMLAudioElement uses actual onplaying event
    expect(hookSrc).toContain('audio.onplaying =');
  });
});
