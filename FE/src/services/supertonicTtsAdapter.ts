import { API_BASE_URL } from '../config/apiConfig';
import { isValidWavArrayBuffer } from './npcHybridTtsEngine';
import {
  DEFAULT_SUPERTONIC_SPEED,
  MAX_SUPERTONIC_SPEED,
  MIN_SUPERTONIC_SPEED,
} from './npcTtsConfig';
import { numberToVietnameseWordsClient } from './piperSpeechNormalizer';

export type SupertonicVoicePreset = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

export interface SupertonicChunkResult {
  blob: Blob;
  cacheKey: string;
  provider: 'supertonic3';
  voicePreset: string;
  speed: number;
  cacheStatus: 'CLIENT_MEM_HIT' | 'SERVER_HIT' | 'SERVER_MISS';
  synthMs: number;
}

const MAX_CLIENT_CACHE_ENTRIES = 64;
const REQUEST_TIMEOUT_MS = 14_000;
const UNAVAILABLE_COOLDOWN_MS = 60_000;

/**
 * Natural multilingual text normalizer specifically designed for Supertonic 3 (`lang="vi"`):
 * - Unlike `normalizeVietnameseForPiper`, NEVER mangles English loanwords into stiff tonal syllables (`Pro Max` != `Pờ rô Mắc`)
 *   and NEVER flattens `!` into `.`, preserving cheerful Vietnamese greeting/closing intonation!
 * - Expands Vietnamese prices (`370.000 ₫` -> `ba trăm bảy mươi nghìn đồng`), numbers, units, and local acronyms (`OCOP` -> `ô cốp`).
 * - Converts long ALL-CAPS brand names (`CELLPHONES` -> `Cellphones`) so Supertonic reads them smoothly instead of spelling letters.
 */
export function normalizeVietnameseForSupertonic(raw: string): string {
  let text = String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    // Strip scraped SEO pipe suffixes if caller passed raw text directly
    .replace(/\s*\|\s*(?:Triển lãm|Website|Trang chủ)[^,.!?;]*/gi, '')
    .replace(/\b(undefined|null|NaN)\b/gi, ' ');

  // 1. Convert Vietnamese dot-grouped & comma-grouped thousands (e.g. 370.000 -> 370000)
  text = text.replace(/\b([1-9]\d{0,2})((?:\.\d{3})+)(?!\d)/g, (_m, h: string, r: string) => `${h}${r.replace(/\./g, '')}`);
  text = text.replace(/\b([1-9]\d{0,2})((?:,\d{3})+)(?!\d)/g, (_m, h: string, r: string) => `${h}${r.replace(/,/g, '')}`);

  // 2. Currency symbols & codes
  text = text
    .replace(/\$\s*(\d+(?:\.\d+)?)/g, '$1 đô la Mỹ')
    .replace(/(\d)\s*(?:đồng|VNĐ|VND|₫)/gi, '$1 đồng')
    .replace(/(\d)\s*đ(?![\p{L}\p{N}])/gu, '$1 đồng')
    .replace(/₫/g, ' đồng ')
    .replace(/\b(?:VNĐ|VND)\b/gi, ' đồng ')
    .replace(/\bđồng\s+đồng\b/gi, 'đồng');

  // 3. Vietnamese local acronyms & units that benefit from Vietnamese spoken forms
  text = text
    .replace(/\bOCOP\b/g, 'ô cốp')
    .replace(/\bST\s*25\b/gi, 'ét tê hai mươi lăm')
    .replace(/\bVN\s*\/\s*A\b/gi, 'chính hãng Việt Nam')
    .replace(/(\d)\s*%/g, '$1 phần trăm')
    .replace(/°\s*C\b/gi, ' độ xê')
    .replace(/(\d)\s*kWh\b/gi, '$1 ki lô oát giờ')
    .replace(/(\d)\s*kW\b/gi, '$1 ki lô oát')
    .replace(/(\d)\s*mAh\b/gi, '$1 mi li am pe giờ')
    .replace(/(\d)\s*kg\b/gi, '$1 ki lô gam')
    .replace(/(\d)\s*mg\b/gi, '$1 mi li gam')
    .replace(/(\d)\s*g\b/g, '$1 gam')
    .replace(/(\d)\s*ml\b/gi, '$1 mi li lít')
    .replace(/(\d)\s*km\b/gi, '$1 ki lô mét')
    .replace(/(\d)\s*cm\b/gi, '$1 xăng ti mét')
    .replace(/(\d)\s*mm\b/gi, '$1 mi li mét')
    .replace(/&/g, ' và ')
    .replace(/(\p{L})\s*\/\s*(\p{L})/gu, '$1 $2')
    .replace(/[·•▪▸►]/g, ', ');

  // 4. Convert ALL-CAPS brand words (>= 4 ASCII letters, e.g. CELLPHONES) to Title Case so Supertonic doesn't spell letters
  text = text.replace(/\b([A-Z]{4,})\b/g, (word) => {
    if (/^(USDA|OLED|QLED|HDMI|WIFI|NVME)$/.test(word)) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });

  // 5. Separate letter+digit boundaries (e.g. A18 -> A 18, 4K -> 4 K) before expanding numbers
  text = text
    .replace(/([A-Za-zÀ-ỹ])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-zÀ-ỹ])/g, '$1 $2');

  // 6. Expand decimals & integers into natural Vietnamese words
  text = text.replace(/\b(\d{1,9})[.,](\d{1,3})\b/g, (_m, intPart: string, fracPart: string) => {
    return `${numberToVietnameseWordsClient(Number(intPart))} phẩy ${numberToVietnameseWordsClient(Number(fracPart))}`;
  });
  text = text.replace(/\b\d{1,12}\b/g, (numStr) => {
    const n = Number(numStr);
    return Number.isFinite(n) ? numberToVietnameseWordsClient(n) : numStr;
  });

  // 7. Clean spacing while PRESERVING `!` and `?` for natural expressive prosody!
  text = text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (text && !/[.!?]$/.test(text)) {
    text = `${text}.`;
  }
  return text;
}

/**
 * Builds natural, sentence-aligned Vietnamese chunks specifically tuned for Supertonic 3:
 * - Preserves `!` prosody and natural loanwords (`Pro Max`, `Picnic`, `Halal`) while expanding Vietnamese prices & `OCOP` -> `ô cốp`.
 * - Keeps each natural sentence whole (~35–130 chars) so Supertonic flows smoothly without choppy stop-and-go breaks.
 */
export function buildSupertonicStepChunks(displayText: string): string[] {
  const normalized = normalizeVietnameseForSupertonic(displayText);
  if (!normalized) return [];

  const rawSentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sent of rawSentences) {
    // Merge very short warm interjections (e.g. "Dạ xin chào quý khách!" = 22 chars) with the following sentence
    // so the greeting flows in one energetic breath (~120–150 chars) without an artificial boundary!
    if (chunks.length > 0 && chunks[chunks.length - 1].length < 34 && chunks[chunks.length - 1].length + 1 + sent.length <= 155) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${sent}`;
      continue;
    }
    if (sent.length <= 145) {
      chunks.push(sent);
      continue;
    }

    // Split >145-char single sentence gently on `, ` around 55..130 chars
    let remaining = sent;
    while (remaining.length > 145) {
      let cutIdx = -1;
      const searchWindow = remaining.slice(0, 132);
      const lastComma = searchWindow.lastIndexOf(', ');
      if (lastComma >= 48) {
        cutIdx = lastComma + 1;
      } else {
        for (const sep of [' mức giá ', ' giá ', ' cùng ', ' với ', ' và ']) {
          const idx = searchWindow.lastIndexOf(sep);
          if (idx >= 50) {
            cutIdx = idx;
            break;
          }
        }
      }
      if (cutIdx === -1) {
        const lastSpace = searchWindow.lastIndexOf(' ');
        cutIdx = lastSpace >= 55 ? lastSpace : 115;
      }
      const head = remaining.slice(0, cutIdx).replace(/[,;:\s]+$/, '').trim();
      const tail = remaining.slice(cutIdx).replace(/^[,;:\s]+/, '').trim();
      if (!head || !tail) break;
      chunks.push(/[.!?]$/.test(head) ? head : `${head},`);
      remaining = tail;
    }
    if (remaining) {
      chunks.push(/[.!?]$/.test(remaining) ? remaining : `${remaining}.`);
    }
  }

  return chunks;
}

/**
 * Frontend adapter for Supertonic 3 Vietnamese Female NPC Voice (`POST /api/v28/tts/supertonic`).
 *
 * Guarantees:
 * - Zero audio overlap (pure Blob synthesizer; playback stays managed by `npcWebAudioPlayer` / `useNpcConsultationSession`).
 * - Bounded client RAM LRU cache + in-flight request deduplication (so lookahead prefetch seamlessly shares its Promise with playback!).
 * - Automatic 60s circuit-breaker cooldown on `503` / network failure so callers immediately fall back to Hybrid Piper
 *   without stalling subsequent chunks.
 */
export class SupertonicTtsClientAdapter {
  private readonly cache = new Map<string, { blob: Blob; voicePreset: string; speed: number }>();
  private readonly inFlight = new Map<string, Promise<SupertonicChunkResult | null>>();
  private unavailableUntilMs = 0;
  private lastFailureReason: string | null = null;
  private serverReadyChecked = false;
  private serverReadyPromise: Promise<boolean> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly endpointUrl: string;

  constructor(options?: { fetchFn?: typeof fetch; endpointUrl?: string }) {
    this.fetchFn = options?.fetchFn ?? ((input, init) => fetch(input, init));
    this.endpointUrl = options?.endpointUrl ?? `${API_BASE_URL}/api/v28/tts/supertonic`;
  }

  public isCircuitOpen(nowMs = Date.now()): boolean {
    return nowMs < this.unavailableUntilMs;
  }

  public getLastFailureReason(): string | null {
    return this.lastFailureReason;
  }

  public resetForTests(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.unavailableUntilMs = 0;
    this.lastFailureReason = null;
    this.serverReadyChecked = false;
    this.serverReadyPromise = null;
  }

  /**
   * Probes `GET /api/v28/tts/supertonic/status` (HTTP 200) once per session before
   * sending `POST /api/v28/tts/supertonic`, preventing 503 network spam when Supertonic
   * ONNX model files are not installed on the backend.
   */
  public async ensureServerReady(signal?: AbortSignal): Promise<boolean> {
    if (this.isCircuitOpen()) return false;
    if (this.serverReadyChecked) return !this.isCircuitOpen();
    if (this.serverReadyPromise) return this.serverReadyPromise;

    this.serverReadyPromise = (async () => {
      try {
        const res = await this.fetchFn(`${this.endpointUrl}/status`, {
          method: 'GET',
          signal,
        });
        if (!res.ok) {
          this.lastFailureReason = `Supertonic status HTTP ${res.status}`;
          this.unavailableUntilMs = Date.now() + UNAVAILABLE_COOLDOWN_MS;
          return false;
        }
        const data = (await res.json()) as { enabled?: boolean; ready?: boolean; reason?: string };
        this.serverReadyChecked = true;
        if (!data?.enabled || !data?.ready) {
          this.lastFailureReason = data?.reason || 'Supertonic 3 chưa sẵn sàng trên máy chủ.';
          this.unavailableUntilMs = Date.now() + 10 * 60_000;
          return false;
        }
        return true;
      } catch (err: unknown) {
        if (!signal?.aborted) {
          this.lastFailureReason = err instanceof Error ? err.message : 'Supertonic status check failed';
          this.unavailableUntilMs = Date.now() + UNAVAILABLE_COOLDOWN_MS;
        }
        return false;
      } finally {
        this.serverReadyPromise = null;
      }
    })();

    return this.serverReadyPromise;
  }

  public async trySynthesizeChunk(
    normalizedText: string,
    options?: {
      voicePreset?: SupertonicVoicePreset;
      speed?: number;
      signal?: AbortSignal;
    }
  ): Promise<SupertonicChunkResult | null> {
    const clean = normalizedText.trim();
    if (!clean) return null;
    if (options?.signal?.aborted) return null;
    if (this.isCircuitOpen()) return null;

    const preset = options?.voicePreset || 'F3';
    const rawSpeed =
      typeof options?.speed === 'number' && Number.isFinite(options.speed)
        ? options.speed
        : DEFAULT_SUPERTONIC_SPEED;
    const effectiveSpeed = Number(
      Math.max(MIN_SUPERTONIC_SPEED, Math.min(MAX_SUPERTONIC_SPEED, rawSpeed)).toFixed(2)
    );
    const cacheKey = `st3|vi|${preset}|s:${effectiveSpeed.toFixed(2)}|${clean}`;
    const hit = this.cache.get(cacheKey);
    if (hit) {
      // Refresh LRU
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit);
      return {
        blob: hit.blob,
        cacheKey,
        provider: 'supertonic3',
        voicePreset: hit.voicePreset,
        speed: hit.speed,
        cacheStatus: 'CLIENT_MEM_HIT',
        synthMs: 0,
      };
    }

    const existingFlight = this.inFlight.get(cacheKey);
    if (existingFlight) {
      const shared = await existingFlight;
      if (options?.signal?.aborted) return null;
      return shared;
    }

    const runPromise = (async (): Promise<SupertonicChunkResult | null> => {
      const timeoutCtrl = new AbortController();
      const timer = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS);
      const onOuterAbort = () => timeoutCtrl.abort();
      options?.signal?.addEventListener('abort', onOuterAbort, { once: true });

      const t0 = Date.now();
      try {
        const res = await this.fetchFn(this.endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            voicePreset: preset,
            speed: effectiveSpeed,
          }),
          signal: timeoutCtrl.signal,
        });

        if (!res.ok) {
          let serverReason = `HTTP ${res.status}`;
          try {
            const j = (await res.json()) as { error?: string };
            if (j?.error) serverReason = `HTTP ${res.status}: ${j.error}`;
          } catch {
            // ignore non-JSON error body
          }
          this.lastFailureReason = serverReason;
          if (res.status === 503 || res.status === 404 || res.status >= 500) {
            this.unavailableUntilMs = Date.now() + UNAVAILABLE_COOLDOWN_MS;
          }
          return null;
        }

        const buf = await res.arrayBuffer();
        if (!isValidWavArrayBuffer(buf)) {
          this.lastFailureReason = 'Invalid WAV header from Supertonic endpoint';
          return null;
        }
        this.lastFailureReason = null;

        const blob = new Blob([buf], { type: 'audio/wav' });
        const serverVoice = res.headers.get('X-TTS-Voice') || preset;
        const serverCache = res.headers.get('X-TTS-Cache') === 'HIT' ? 'SERVER_HIT' : 'SERVER_MISS';

        if (this.cache.size >= MAX_CLIENT_CACHE_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          if (oldest) this.cache.delete(oldest);
        }
        this.cache.set(cacheKey, { blob, voicePreset: serverVoice, speed: effectiveSpeed });

        return {
          blob,
          cacheKey,
          provider: 'supertonic3',
          voicePreset: serverVoice,
          speed: effectiveSpeed,
          cacheStatus: serverCache,
          synthMs: Date.now() - t0,
        };
      } catch (err: unknown) {
        if (!options?.signal?.aborted) {
          this.lastFailureReason = err instanceof Error ? err.message : 'Supertonic request failed';
          this.unavailableUntilMs = Date.now() + UNAVAILABLE_COOLDOWN_MS;
        }
        return null;
      } finally {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onOuterAbort);
      }
    })();

    this.inFlight.set(cacheKey, runPromise);
    try {
      return await runPromise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }
}

export const supertonicTtsAdapter = new SupertonicTtsClientAdapter();
