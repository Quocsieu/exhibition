import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NPC_TTS_MODE,
  normalizeNpcTtsMode,
  resolveNpcTtsMode,
} from '../services/npcTtsConfig';
import {
  computeChunkContentHash,
  EXPECTED_PIPER_VOICE_ID,
  isValidWavArrayBuffer,
  NpcHybridTtsEngine,
  shouldAllowHybridPreload,
} from '../services/npcHybridTtsEngine';
import { isRealBackendSpeechClip } from '../components/v28/V28NpcConsultantPanel';

function makeMinimalValidWav(): ArrayBuffer {
  const buf = new ArrayBuffer(64);
  const view = new DataView(buf);
  // "RIFF"
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 56, true);
  // "WAVE"
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  return buf;
}

describe('Grand Expo V28 — Free Hybrid TTS Feature Flag, Content-Hash Integrity & Safe Rollback', () => {
  it('defaults to legacy and safely falls back to legacy for any invalid configuration', () => {
    expect(DEFAULT_NPC_TTS_MODE).toBe('legacy');
    expect(normalizeNpcTtsMode('hybrid')).toBe('hybrid');
    expect(normalizeNpcTtsMode('LEGACY')).toBe('legacy');
    expect(normalizeNpcTtsMode('gemini')).toBeNull();
    expect(normalizeNpcTtsMode('')).toBeNull();
    expect(normalizeNpcTtsMode(null)).toBeNull();

    // Empty / invalid configs ALWAYS resolve to 'legacy'
    expect(
      resolveNpcTtsMode({ search: '', storedValue: null, windowConfigValue: null, envValue: null })
    ).toBe('legacy');
    expect(
      resolveNpcTtsMode({ search: '?npcTtsMode=invalid', storedValue: 'bogus', windowConfigValue: 'nope', envValue: 'bad' })
    ).toBe('legacy');

    // Precedence: URL > localStorage > window.__V28_CONFIG__ > env > legacy
    expect(
      resolveNpcTtsMode({ search: '?npcTtsMode=legacy', storedValue: 'hybrid', windowConfigValue: 'hybrid', envValue: 'hybrid' })
    ).toBe('legacy');
    expect(
      resolveNpcTtsMode({ search: '', storedValue: 'hybrid', windowConfigValue: 'legacy', envValue: 'legacy' })
    ).toBe('hybrid');
    expect(
      resolveNpcTtsMode({ search: '', storedValue: null, windowConfigValue: 'hybrid', envValue: 'legacy' })
    ).toBe('hybrid');
    expect(
      resolveNpcTtsMode({ search: '', storedValue: null, windowConfigValue: null, envValue: 'hybrid' })
    ).toBe('hybrid');
  });

  it('serves pre-generated Piper audio ONLY on exact SHA-256 + text match, invalidates edited text, and falls back cleanly on 404 or corrupt WAV', async () => {
    const chunkA = 'Xin chào quý khách đến.';
    const chunkB = 'Xin chào quý khách đến với gian hàng CELLPHONES.';
    const hashA = await computeChunkContentHash(chunkA);
    const hashB = await computeChunkContentHash(chunkB);
    expect(hashA).not.toBe(hashB);

    const validWav = makeMinimalValidWav();
    expect(isValidWavArrayBuffer(validWav)).toBe(true);
    expect(isValidWavArrayBuffer(new ArrayBuffer(20))).toBe(false);

    let wavFetchCount = 0;
    const fakeFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/manifest.json')) {
        return new Response(
          JSON.stringify({
            version: 'v1',
            voiceId: EXPECTED_PIPER_VOICE_ID,
            entries: {
              [hashA]: {
                file: `/tts/pregen/${hashA.slice(0, 12)}.wav`,
                mimeType: 'audio/wav',
                text: chunkA,
                durationSec: 1.5,
                bytes: validWav.byteLength,
              },
              [hashB]: {
                file: `/tts/pregen/missing_404.wav`,
                mimeType: 'audio/wav',
                text: chunkB,
                durationSec: 2.1,
                bytes: 1000,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes(hashA.slice(0, 12))) {
        wavFetchCount += 1;
        return new Response(validWav, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    const engine = new NpcHybridTtsEngine({ fetchFn: fakeFetch });

    // 1. Exact match -> PREGEN_NET_HIT, then PREGEN_MEM_HIT on replay (0 extra fetches)
    const hit1 = await engine.tryFetchPregenAudio(chunkA);
    expect(hit1).not.toBeNull();
    expect(hit1?.cacheStatus).toBe('PREGEN_NET_HIT');
    expect(wavFetchCount).toBe(1);

    const hit2 = await engine.tryFetchPregenAudio(chunkA);
    expect(hit2?.cacheStatus).toBe('PREGEN_MEM_HIT');
    expect(wavFetchCount).toBe(1);

    // 2. Admin edits text slightly -> content hash changes -> MISS (returns null for Piper fallback, never plays stale audio!)
    const editedMiss = await engine.tryFetchPregenAudio('Xin chào quý khách đến gian hàng mới.');
    expect(editedMiss).toBeNull();

    // 3. 404 missing file -> returns null cleanly & marks hash failed (no infinite retry!)
    const missing404 = await engine.tryFetchPregenAudio(chunkB);
    expect(missing404).toBeNull();
    expect(await engine.hasPregenEntry(chunkB)).toBe(false);

    // 4. Corrupt WAV header -> rejected cleanly (never passed to HTMLAudioElement)
    const corruptEngine = new NpcHybridTtsEngine({
      fetchFn: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/manifest.json')) {
          return new Response(
            JSON.stringify({
              version: 'v1',
              voiceId: EXPECTED_PIPER_VOICE_ID,
              entries: {
                [hashA]: {
                  file: '/tts/pregen/corrupt.wav',
                  mimeType: 'audio/wav',
                  text: chunkA,
                  durationSec: 1.5,
                  bytes: 100,
                },
              },
            }),
            { status: 200 }
          );
        }
        return new Response(new Uint8Array(100), { status: 200 });
      }) as typeof fetch,
    });
    expect(await corruptEngine.tryFetchPregenAudio(chunkA)).toBeNull();
  });

  it('P0 regression: strictly rejects backend :local-fallback 440Hz chime WAVs so NPC always plays real Vietnamese female speech', () => {
    // Backend returns `gemini-3.8-flash-tts:local-fallback` (440Hz "ting" chime) with status='ready'
    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'gemini-3.8-flash-tts:local-fallback',
      })
    ).toBe(false);
    expect(isRealBackendSpeechClip({ status: 'ready', modelId: 'local-fallback' })).toBe(false);
    expect(isRealBackendSpeechClip({ status: 'ready', modelId: '' })).toBe(false);
    expect(isRealBackendSpeechClip({ status: 'pending', modelId: 'gemini-3.8-flash-tts' })).toBe(false);
    expect(isRealBackendSpeechClip(null)).toBe(false);

    // Only genuine synthesized backend speech clips are accepted
    expect(
      isRealBackendSpeechClip({
        status: 'ready',
        modelId: 'gemini-3.8-flash-tts',
      })
    ).toBe(true);
  });

  it('P1 Smart Preloading: respects Save-Data/slow-network/low-RAM, deduplicates concurrent fetches, and cancels cleanly on AbortSignal', async () => {
    expect(shouldAllowHybridPreload({ onLine: true, saveData: false, effectiveType: '4g', deviceMemory: 8 }).allowed).toBe(true);
    expect(shouldAllowHybridPreload({ onLine: false }).allowed).toBe(false);
    expect(shouldAllowHybridPreload({ onLine: true, saveData: true }).allowed).toBe(false);
    expect(shouldAllowHybridPreload({ onLine: true, effectiveType: '2g' }).allowed).toBe(false);
    expect(shouldAllowHybridPreload({ onLine: true, deviceMemory: 1 }).allowed).toBe(false);

    const chunk1 = 'Xin chào quý khách đến.';
    const chunk2 = 'Cảm ơn quý khách đã tham quan gian hàng.';
    const h1 = await computeChunkContentHash(chunk1);
    const h2 = await computeChunkContentHash(chunk2);
    const validWav = makeMinimalValidWav();

    let netCount = 0;
    const fakeFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/manifest.json')) {
        return new Response(
          JSON.stringify({
            version: 'v1',
            voiceId: EXPECTED_PIPER_VOICE_ID,
            entries: {
              [h1]: { file: '/tts/pregen/h1.wav', mimeType: 'audio/wav', text: chunk1, durationSec: 1.4, bytes: 64 },
              [h2]: { file: '/tts/pregen/h2.wav', mimeType: 'audio/wav', text: chunk2, durationSec: 1.9, bytes: 64 },
            },
          }),
          { status: 200 }
        );
      }
      netCount += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(validWav, { status: 200 });
    }) as typeof fetch;

    const engine = new NpcHybridTtsEngine({ fetchFn: fakeFetch });

    // Preload 2 chunks + 1 unknown chunk -> only 2 manifest chunks fetched, 0 duplicate fetches on concurrent call
    const [r1, r2] = await Promise.all([
      engine.preloadChunks([chunk1, chunk2, 'Nội dung động không có trong manifest'], { maxConcurrency: 2 }),
      engine.tryFetchPregenAudio(chunk1),
    ]);
    expect(r1.preloaded).toBe(2);
    expect(r2).not.toBeNull();
    expect(netCount).toBe(2);
    expect(engine.getRamCacheCount()).toBe(2);

    // Pre-aborted signal -> 0 fetches
    const aborted = new AbortController();
    aborted.abort();
    const resAborted = await engine.preloadChunks([chunk1, chunk2], { signal: aborted.signal });
    expect(resAborted.preloaded).toBe(0);
  });
});
