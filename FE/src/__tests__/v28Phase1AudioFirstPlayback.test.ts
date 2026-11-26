import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NpcAudioFirstService } from '../services/npcAudioFirstService';
import { isRealBackendSpeechClip } from '../components/v28/V28NpcConsultantPanel';

describe('GRAND EXPO V28 — PHASE 1: Frontend Audio-First Playback & Lifecycle Guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('TC16 — Pause/resume reuses in-memory Blob cache and NEVER re-fetches or re-calls TTS', async () => {
    const svc = new NpcAudioFirstService();
    let fetchCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCount++;
        return new Response(new Uint8Array(256).fill(1), {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        });
      })
    );

    const first = await svc.fetchAudioBlobFromUrl({
      audioId: 'aud-123',
      audioUrl: '/api/v28/audio/aud-123/stream',
      source: 'pre_generated',
      provider: 'gemini',
      voiceId: 'Kore',
    });
    expect(first).not.toBeNull();
    expect(fetchCount).toBe(1);

    // Simulate resume on same audioId -> 0 additional network/TTS calls
    const resumed = await svc.fetchAudioBlobFromUrl({
      audioId: 'aud-123',
      audioUrl: '/api/v28/audio/aud-123/stream',
      source: 'pre_generated',
      provider: 'gemini',
      voiceId: 'Kore',
    });
    expect(resumed?.audioId).toBe('aud-123');
    expect(fetchCount).toBe(1);
  });

  it('TC18 — Late response after AbortController cancel is safely ignored', async () => {
    const svc = new NpcAudioFirstService();
    const ctrl = new AbortController();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (init?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return new Response(new Uint8Array(128).fill(2), { status: 200 });
      })
    );

    const promise = svc.fetchAudioBlobFromUrl({
      audioId: 'aud-late',
      audioUrl: '/api/v28/audio/aud-late/stream',
      source: 'cached',
      provider: 'vbee',
      voiceId: 'hn_female_ngochuyen_full_48k-fhg',
      signal: ctrl.signal,
    });
    ctrl.abort();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('TC24 — isRealBackendSpeechClip accepts uploaded/pre_generated and rejects local-fallback & stale needsUpdate clips', () => {
    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'gemini-3.8-flash-tts',
        provider: 'gemini',
        needsUpdate: false,
      })
    ).toBe(true);

    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'admin-upload',
        provider: 'uploaded',
        needsUpdate: false,
      })
    ).toBe(true);

    // Reject stale audio
    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'gemini-3.8-flash-tts',
        provider: 'gemini',
        needsUpdate: true,
      })
    ).toBe(false);

    // Reject 440Hz local-fallback chime
    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'gemini-3.8-flash-tts:local-fallback',
        provider: 'local-fallback',
        needsUpdate: false,
      })
    ).toBe(false);
  });

  it('Bounded RAM LRU cache never retains more than 24 blobs (never preloads all 153 products)', async () => {
    const svc = new NpcAudioFirstService();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(128).fill(3), { status: 200 }))
    );

    for (let i = 0; i < 35; i++) {
      await svc.fetchAudioBlobFromUrl({
        audioId: `aud-lru-${i}`,
        audioUrl: `/api/v28/audio/aud-lru-${i}/stream`,
        source: 'pre_generated',
        provider: 'gemini',
        voiceId: 'Kore',
      });
    }
    expect(svc.getCacheSize()).toBeLessThanOrEqual(24);
  });
});
