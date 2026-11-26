import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUPERTONIC_SPEED,
  resolveNpcTtsProvider,
  resolveSupertonicSpeed,
  resolveSupertonicVoicePreset,
} from '../services/npcTtsConfig';
import {
  SupertonicTtsClientAdapter,
  buildSupertonicStepChunks,
} from '../services/supertonicTtsAdapter';

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

describe('V28 Phase B — Supertonic 3 Client Adapter, Provider Config & Hybrid Piper Fallback', () => {
  it('resolves provider, female preset F1-F5, brisk natural speed (1.32), SEO cleanup, OCOP expansion, and natural English preservation', () => {
    expect(resolveNpcTtsProvider({ search: '', storedValue: null, windowConfigValue: null, envValue: null })).toBe('supertonic');
    expect(resolveNpcTtsProvider({ search: '?npcTtsProvider=hybrid-piper' })).toBe('hybrid-piper');
    expect(resolveNpcTtsProvider({ search: '?npcTtsProvider=legacy-piper' })).toBe('legacy-piper');
    expect(resolveSupertonicVoicePreset({ search: '', storedValue: null, envValue: null })).toBe('F3');
    expect(resolveSupertonicVoicePreset({ search: '?supertonicVoice=f5' })).toBe('F5');
    expect(resolveSupertonicVoicePreset({ search: '?supertonicVoice=invalid' })).toBe('F3');
    expect(DEFAULT_SUPERTONIC_SPEED).toBe(1.32);
    expect(resolveSupertonicSpeed({ search: '', storedValue: null, windowConfigValue: null, envValue: null })).toBe(1.32);
    expect(resolveSupertonicSpeed({ search: '?supertonicSpeed=1.4' })).toBe(1.4);
    expect(resolveSupertonicSpeed({ search: '?npcSpeed=9.9' })).toBe(1.8);
    expect(resolveSupertonicSpeed({ search: '?npcSpeed=0.2' })).toBe(0.85);

    const greetChunks = buildSupertonicStepChunks(
      'Dạ xin chào quý khách! Em là Ngọc Anh tại gian hàng Con Đường Nông Sản, mời quý khách cùng điểm qua các sản phẩm nổi bật hôm nay nhé!'
    );
    expect(greetChunks.length).toBe(1);
    expect(greetChunks[0]).toContain('Dạ xin chào quý khách!');

    const prodChunks = buildSupertonicStepChunks(
      'Mở đầu là Trà Tân Cương Hoàng Bình | Triển lãm số Con đường nông sản, chuẩn OCOP 5 sao, iPhone 16 Pro Max, mức giá 205.000 ₫.'
    );
    expect(prodChunks.some((c) => c.includes('₫'))).toBe(false);
    expect(prodChunks.some((c) => c.includes('Triển lãm số'))).toBe(false);
    expect(prodChunks.some((c) => c.includes('ô cốp năm sao'))).toBe(true);
    expect(prodChunks.some((c) => c.includes('Pro Max'))).toBe(true);
    expect(prodChunks.some((c) => c.includes('đồng'))).toBe(true);
  });

  it('deduplicates concurrent prefetch + playback requests, isolates cache keys by speed, and trips circuit-breaker on 503', async () => {
    let calls = 0;
    let lastRequestedSpeed: number | undefined;
    const okAdapter = new SupertonicTtsClientAdapter({
      endpointUrl: 'http://test.local/api/v28/tts/supertonic',
      fetchFn: (async (_input, init) => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 15));
        const parsed = JSON.parse(String(init?.body || '{}')) as { speed?: number };
        lastRequestedSpeed = parsed.speed;
        return new Response(makeMinimalValidWav(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-TTS-Voice': 'F3',
            'X-TTS-Speed': String(parsed.speed ?? 1.32),
            'X-TTS-Cache': 'MISS',
          },
        });
      }) as typeof fetch,
    });

    // Concurrent prefetch + playback for same chunk -> only 1 HTTP POST!
    const [first, concurrent] = await Promise.all([
      okAdapter.trySynthesizeChunk('Xin chào quý khách!', { voicePreset: 'F3' }),
      okAdapter.trySynthesizeChunk('Xin chào quý khách!', { voicePreset: 'F3' }),
    ]);
    expect(first).not.toBeNull();
    expect(concurrent).not.toBeNull();
    expect(first?.provider).toBe('supertonic3');
    expect(first?.voicePreset).toBe('F3');
    expect(first?.speed).toBe(1.32);
    expect(lastRequestedSpeed).toBe(1.32);
    expect(calls).toBe(1);

    // Subsequent call with same speed hits client RAM cache (0 network calls)
    const second = await okAdapter.trySynthesizeChunk('Xin chào quý khách!', { voicePreset: 'F3' });
    expect(second?.cacheStatus).toBe('CLIENT_MEM_HIT');
    expect(calls).toBe(1);

    // Changing speed (e.g. 1.42) bypasses slower cache entry cleanly
    const faster = await okAdapter.trySynthesizeChunk('Xin chào quý khách!', { voicePreset: 'F3', speed: 1.42 });
    expect(faster?.speed).toBe(1.42);
    expect(faster?.cacheStatus).toBe('SERVER_MISS');
    expect(calls).toBe(2);

    // 503 unavailable -> returns null & opens circuit breaker so Hybrid Piper takes over immediately
    let failCalls = 0;
    const fallbackAdapter = new SupertonicTtsClientAdapter({
      endpointUrl: 'http://test.local/api/v28/tts/supertonic',
      fetchFn: (async () => {
        failCalls += 1;
        return new Response(JSON.stringify({ error: 'Low RAM', fallback: 'hybrid-piper' }), { status: 503 });
      }) as typeof fetch,
    });

    const r1 = await fallbackAdapter.trySynthesizeChunk('Câu thoại thử nghiệm');
    expect(r1).toBeNull();
    expect(fallbackAdapter.isCircuitOpen()).toBe(true);
    expect(failCalls).toBe(1);

    // Next chunk immediately skips network while circuit is open -> zero stall before Hybrid Piper
    const r2 = await fallbackAdapter.trySynthesizeChunk('Câu thoại thứ hai');
    expect(r2).toBeNull();
    expect(failCalls).toBe(1);
  });
});
