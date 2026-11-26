import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// Resolves cleanly to <repo>/BE/data/supertonic3 regardless of whether cwd is <repo> or <repo>/BE
const DEFAULT_SUPERTONIC_MODEL_DIR = path.resolve(THIS_DIR, '../../../data/supertonic3');

export type SupertonicFemalePreset = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
export const VALID_SUPERTONIC_PRESETS: readonly SupertonicFemalePreset[] = ['F1', 'F2', 'F3', 'F4', 'F5'] as const;
export const DEFAULT_SUPERTONIC_PRESET: SupertonicFemalePreset = 'F3';
export const DEFAULT_SUPERTONIC_SPEED = 1.32;
export const MIN_SUPERTONIC_SPEED = 0.85;
export const MAX_SUPERTONIC_SPEED = 1.8;
export const SUPERTONIC_SAMPLE_RATE = 44100;

const AVAILABLE_LANGS = new Set([
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr',
  'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk',
  'sl', 'sv', 'tr', 'uk', 'vi', 'na',
]);

const MAX_CACHE_ENTRIES = 64;
const MAX_CACHE_BYTES = 32 * 1024 * 1024; // 32 MB bounded WAV cache

export interface SupertonicTtsStatus {
  provider: 'supertonic3';
  configuredMode: 'auto' | 'true' | 'false';
  enabled: boolean;
  ready: boolean;
  loaded: boolean;
  lang: 'vi';
  voicePreset: SupertonicFemalePreset;
  speed: number;
  sampleRate: number;
  modelDir: string;
  totalSystemRamMb: number;
  minRequiredRamMb: number;
  fallbackProvider: 'hybrid-piper';
  reason?: string;
}

export interface SupertonicSynthResult {
  audioBuffer: Buffer;
  mimeType: 'audio/wav';
  cacheStatus: 'HIT' | 'MISS';
  provider: 'supertonic3';
  voicePreset: SupertonicFemalePreset;
  speed: number;
  lang: 'vi';
  sampleRate: number;
  durationSec: number;
  synthMs: number;
}

interface CachedEntry {
  buffer: Buffer;
  durationSec: number;
  byteLength: number;
}

interface OrtModuleLike {
  InferenceSession: {
    create(modelPath: string, options?: Record<string, unknown>): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
    }>;
  };
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => unknown;
}

function normalizePreset(raw?: string | null): SupertonicFemalePreset {
  const up = String(raw || '').trim().toUpperCase();
  if ((VALID_SUPERTONIC_PRESETS as readonly string[]).includes(up)) {
    return up as SupertonicFemalePreset;
  }
  return DEFAULT_SUPERTONIC_PRESET;
}

/**
 * 1) Trims excessive leading/trailing vocoder silence down to a crisp `25ms` pre-roll + `65ms` post-roll.
 * 2) Gently compacts sluggish internal mid-sentence pauses (> `150ms`) down to a natural `115ms` breath
 *    so Vietnamese clauses flow fluidly without awkward mid-sentence hesitation, while keeping 100% of
 *    spoken vowels/consonants untouched!
 */
export function trimFloat32SpeechSilence(samples: Float32Array, sampleRate: number): Float32Array {
  if (samples.length === 0 || sampleRate <= 0) return samples;
  const winLen = Math.max(64, Math.floor(sampleRate * 0.01)); // 10ms window
  const totalWins = Math.floor(samples.length / winLen);
  if (totalWins < 6) return samples;

  const rmsThreshold = 0.0075;
  const isSilentWin = new Uint8Array(totalWins);
  let firstActiveWin = -1;
  let lastActiveWin = -1;

  for (let w = 0; w < totalWins; w++) {
    let sumSq = 0;
    const base = w * winLen;
    for (let i = 0; i < winLen; i++) {
      const s = samples[base + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / winLen);
    if (rms >= rmsThreshold) {
      if (firstActiveWin === -1) firstActiveWin = w;
      lastActiveWin = w;
    } else {
      isSilentWin[w] = 1;
    }
  }

  if (firstActiveWin === -1 || lastActiveWin === -1) {
    return samples;
  }

  const preRollWins = 3; // ~30ms
  const postRollWins = 7; // ~70ms
  const maxInternalSilentWins = 12; // cap internal pauses at ~120ms (instead of 350–500ms)
  const startWin = Math.max(0, firstActiveWin - preRollWins);
  const endWin = Math.min(totalWins - 1, lastActiveWin + postRollWins);

  const keptWinIndices: number[] = [];
  let consecutiveInternalSilent = 0;
  for (let w = startWin; w <= endWin; w++) {
    const insideSpeechBody = w > firstActiveWin && w < lastActiveWin;
    if (insideSpeechBody && isSilentWin[w] === 1) {
      consecutiveInternalSilent += 1;
      if (consecutiveInternalSilent > maxInternalSilentWins) {
        continue;
      }
    } else {
      consecutiveInternalSilent = 0;
    }
    keptWinIndices.push(w);
  }

  const out = new Float32Array(keptWinIndices.length * winLen);
  const crossfadeLen = Math.min(Math.floor(winLen * 0.5), 128);
  for (let k = 0; k < keptWinIndices.length; k++) {
    const w = keptWinIndices[k];
    const srcOffset = w * winLen;
    const dstOffset = k * winLen;
    out.set(samples.subarray(srcOffset, srcOffset + winLen), dstOffset);
    // Smooth micro-crossfade whenever silent frames were skipped
    if (k > 0 && keptWinIndices[k] !== keptWinIndices[k - 1] + 1) {
      const prevEnd = samples.subarray((keptWinIndices[k - 1] + 1) * winLen - crossfadeLen, (keptWinIndices[k - 1] + 1) * winLen);
      for (let i = 0; i < crossfadeLen && i < prevEnd.length; i++) {
        const alpha = i / crossfadeLen;
        out[dstOffset + i] = prevEnd[i] * (1 - alpha) + out[dstOffset + i] * alpha;
      }
    }
  }

  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(out.length / 4));
  for (let i = 0; i < fadeSamples; i++) {
    const gain = i / fadeSamples;
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return out;
}

function encodeFloat32ToPcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.floor(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

export function preprocessSupertonicText(rawText: string, lang: string): string {
  // Expand Vietnamese currency & common symbols BEFORE NFKD decomposition so ₫/VNĐ/%/°C are spoken naturally
  // and never produce unmapped -1 indices in unicode_indexer.json.
  let pre = rawText
    .replace(/₫/g, ' đồng ')
    .replace(/\b(?:VNĐ|VND)\b/gi, ' đồng ')
    .replace(/\bđồng\s+đồng\b/gi, 'đồng')
    .replace(/°\s*C\b/gi, ' độ xê ')
    .replace(/(\d)\s*%/g, '$1 phần trăm')
    .replace(/±/g, ' cộng trừ ')
    .replace(/&/g, ' và ')
    .replace(/[•·▪▸►]/g, ', ');

  let text = pre.normalize('NFKD');
  text = text.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
    ''
  );
  const replacements: Record<string, string> = {
    '–': '-',
    '‑': '-',
    '—': '-',
    '_': ' ',
    '\u201C': '"',
    '\u201D': '"',
    '\u2018': "'",
    '\u2019': "'",
    '´': "'",
    '`': "'",
    '[': ' ',
    ']': ' ',
    '|': ' ',
    '/': ' ',
    '#': ' ',
    '→': ' ',
    '←': ' ',
  };
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replaceAll(k, v);
  }
  text = text.replace(/[♥☆♡©™®\\]/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!').replace(/ \?/g, '?');
  if (!/[.!?;:,'")\]]$/.test(text)) {
    text += '.';
  }
  const safeLang = AVAILABLE_LANGS.has(lang) ? lang : 'vi';
  return `<${safeLang}>${text}</${safeLang}>`;
}

/**
 * Maps preprocessed Unicode text to valid non-negative Supertonic vocabulary indices (`>= 0`).
 * Prevents `-1` unmapped codepoints in `unicode_indexer.json` from ever causing an out-of-bounds
 * C++ segfault inside `onnxruntime-node` Embedding/Gather kernels.
 */
export function sanitizeSupertonicTokenRow(processed: string, indexer: readonly number[]): number[] {
  const spaceToken = typeof indexer[32] === 'number' && indexer[32] >= 0 ? indexer[32] : 0;
  const row: number[] = [];
  for (const ch of Array.from(processed)) {
    const code = ch.charCodeAt(0);
    const mapped = code < indexer.length ? indexer[code] : -1;
    if (typeof mapped === 'number' && mapped >= 0) {
      if (mapped === spaceToken && row.length > 0 && row[row.length - 1] === spaceToken) {
        continue;
      }
      row.push(mapped);
    } else if (row.length > 0 && row[row.length - 1] !== spaceToken) {
      row.push(spaceToken);
    }
  }
  return row.length > 0 ? row : [spaceToken];
}

function lengthToMask(lengths: number[], maxLen?: number): number[][][] {
  const actualMax = maxLen || Math.max(...lengths);
  return lengths.map((len) => [
    Array.from({ length: actualMax }, (_, i) => (i < len ? 1.0 : 0.0)),
  ]);
}

function arrayToTensor(ort: OrtModuleLike, array: unknown, dims: number[]): unknown {
  const flat = (array as { flat: (d: number) => number[] }).flat(Infinity);
  return new ort.Tensor('float32', Float32Array.from(flat), dims);
}

function intArrayToTensor(ort: OrtModuleLike, array: unknown, dims: number[]): unknown {
  const flat = (array as { flat: (d: number) => number[] }).flat(Infinity);
  return new ort.Tensor('int64', BigInt64Array.from(flat.map((x) => BigInt(x))), dims);
}

/**
 * Supertonic 3 ONNX Runtime Adapter (MIT code / Open RAIL-M weights).
 *
 * - Runs natively in Node.js via dynamic `onnxruntime-node` (Windows 11, Ubuntu/Linux, Render 2GB+ RAM).
 * - Automatically guards low-RAM environments (e.g. Render 512MB Free/Starter) so the server NEVER OOMs
 *   and cleanly signals clients to use Hybrid Piper fallback.
 * - Serializes ONNX inference calls with bounded LRU WAV caching & in-flight deduplication.
 */
export class V28SupertonicTtsService {
  private readonly modelDir: string;
  private readonly configuredMode: 'auto' | 'true' | 'false';
  private readonly defaultPreset: SupertonicFemalePreset;
  private readonly defaultTotalStep: number;
  private readonly defaultSpeed: number;
  private readonly minRequiredRamMb: number;

  private ortModule: OrtModuleLike | null = null;
  private sessions: {
    cfgs: { ae: { sample_rate: number; base_chunk_size: number }; ttl: { chunk_compress_factor: number; latent_dim: number } };
    indexer: number[];
    dpOrt: { run(f: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> };
    textEncOrt: { run(f: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> };
    vectorEstOrt: { run(f: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> };
    vocoderOrt: { run(f: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> };
  } | null = null;
  private readonly styleCache = new Map<SupertonicFemalePreset, { ttl: unknown; dp: unknown }>();
  private loadPromise: Promise<void> | null = null;
  private lastLoadError: string | null = null;

  private readonly wavCache = new Map<string, CachedEntry>();
  private wavCacheBytes = 0;
  private readonly inFlight = new Map<string, Promise<SupertonicSynthResult>>();
  private queueTail: Promise<unknown> = Promise.resolve();

  constructor(options?: {
    modelDir?: string;
    enabledMode?: string;
    defaultPreset?: string;
    totalStep?: number;
    speed?: number;
    minRequiredRamMb?: number;
  }) {
    this.modelDir =
      options?.modelDir ||
      process.env.SUPERTONIC_MODEL_DIR ||
      DEFAULT_SUPERTONIC_MODEL_DIR;
    const rawMode = String(options?.enabledMode ?? process.env.SUPERTONIC_TTS_ENABLED ?? 'auto')
      .trim()
      .toLowerCase();
    this.configuredMode = rawMode === 'true' ? 'true' : rawMode === 'false' ? 'false' : 'auto';
    this.defaultPreset = normalizePreset(options?.defaultPreset ?? process.env.SUPERTONIC_VOICE_PRESET ?? DEFAULT_SUPERTONIC_PRESET);
    this.defaultTotalStep = Math.max(4, Math.min(16, Number(options?.totalStep ?? process.env.SUPERTONIC_TOTAL_STEP ?? 8) || 8));
    this.defaultSpeed = Math.max(
      MIN_SUPERTONIC_SPEED,
      Math.min(MAX_SUPERTONIC_SPEED, Number(options?.speed ?? process.env.SUPERTONIC_SPEED ?? DEFAULT_SUPERTONIC_SPEED) || DEFAULT_SUPERTONIC_SPEED)
    );
    this.minRequiredRamMb = Math.max(
      512,
      Number(options?.minRequiredRamMb ?? process.env.SUPERTONIC_MIN_RAM_MB ?? 1536) || 1536
    );
  }

  private hasRequiredModelFiles(preset: SupertonicFemalePreset = this.defaultPreset): { ok: boolean; missing?: string } {
    const required = [
      'onnx/duration_predictor.onnx',
      'onnx/text_encoder.onnx',
      'onnx/vector_estimator.onnx',
      'onnx/vocoder.onnx',
      'onnx/tts.json',
      'onnx/unicode_indexer.json',
      `voice_styles/${preset}.json`,
    ];
    for (const rel of required) {
      const full = path.join(this.modelDir, rel);
      if (!fs.existsSync(full)) {
        return { ok: false, missing: rel };
      }
    }
    return { ok: true };
  }

  public getStatus(): SupertonicTtsStatus {
    const totalSystemRamMb = Math.round(os.totalmem() / 1048576);
    if (this.configuredMode === 'false') {
      return {
        provider: 'supertonic3',
        configuredMode: this.configuredMode,
        enabled: false,
        ready: false,
        loaded: false,
        lang: 'vi',
        voicePreset: this.defaultPreset,
        speed: this.defaultSpeed,
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        modelDir: this.modelDir,
        totalSystemRamMb,
        minRequiredRamMb: this.minRequiredRamMb,
        fallbackProvider: 'hybrid-piper',
        reason: 'SUPERTONIC_TTS_ENABLED=false',
      };
    }

    if (totalSystemRamMb < this.minRequiredRamMb) {
      return {
        provider: 'supertonic3',
        configuredMode: this.configuredMode,
        enabled: false,
        ready: false,
        loaded: false,
        lang: 'vi',
        voicePreset: this.defaultPreset,
        speed: this.defaultSpeed,
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        modelDir: this.modelDir,
        totalSystemRamMb,
        minRequiredRamMb: this.minRequiredRamMb,
        fallbackProvider: 'hybrid-piper',
        reason: `RAM hệ thống (${totalSystemRamMb} MB) thấp hơn ngưỡng an toàn Supertonic 3 (${this.minRequiredRamMb} MB) — tự động dùng Hybrid Piper.`,
      };
    }

    const filesCheck = this.hasRequiredModelFiles();
    if (!filesCheck.ok) {
      return {
        provider: 'supertonic3',
        configuredMode: this.configuredMode,
        enabled: false,
        ready: false,
        loaded: false,
        lang: 'vi',
        voicePreset: this.defaultPreset,
        speed: this.defaultSpeed,
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        modelDir: this.modelDir,
        totalSystemRamMb,
        minRequiredRamMb: this.minRequiredRamMb,
        fallbackProvider: 'hybrid-piper',
        reason: `Chưa có tệp model Supertonic 3 (${filesCheck.missing}) — tự động dùng Hybrid Piper.`,
      };
    }

    return {
      provider: 'supertonic3',
      configuredMode: this.configuredMode,
      enabled: true,
      ready: !this.lastLoadError,
      loaded: Boolean(this.sessions),
      lang: 'vi',
      voicePreset: this.defaultPreset,
      speed: this.defaultSpeed,
      sampleRate: SUPERTONIC_SAMPLE_RATE,
      modelDir: this.modelDir,
      totalSystemRamMb,
      minRequiredRamMb: this.minRequiredRamMb,
      fallbackProvider: 'hybrid-piper',
      ...(this.lastLoadError ? { reason: this.lastLoadError } : {}),
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.sessions && this.ortModule) return;
    const status = this.getStatus();
    if (!status.enabled) {
      const err = new Error(status.reason || 'Supertonic 3 chưa sẵn sàng trên máy chủ này.') as Error & { statusCode?: number };
      err.statusCode = 503;
      throw err;
    }
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const ortPkg = 'onnxruntime-node';
        const ort = (await import(ortPkg)) as unknown as OrtModuleLike;
        const onnxDir = path.join(this.modelDir, 'onnx');
        const cfgs = JSON.parse(fs.readFileSync(path.join(onnxDir, 'tts.json'), 'utf8'));
        const indexer = JSON.parse(fs.readFileSync(path.join(onnxDir, 'unicode_indexer.json'), 'utf8'));
        const opts = { executionProviders: ['cpu'] };

        const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = await Promise.all([
          ort.InferenceSession.create(path.join(onnxDir, 'duration_predictor.onnx'), opts),
          ort.InferenceSession.create(path.join(onnxDir, 'text_encoder.onnx'), opts),
          ort.InferenceSession.create(path.join(onnxDir, 'vector_estimator.onnx'), opts),
          ort.InferenceSession.create(path.join(onnxDir, 'vocoder.onnx'), opts),
        ]);

        this.ortModule = ort;
        this.sessions = { cfgs, indexer, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt };
        this.lastLoadError = null;
      } catch (e) {
        this.lastLoadError = `Không thể nạp onnxruntime-node / Supertonic 3: ${(e as Error).message}`;
        const err = new Error(this.lastLoadError) as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  private getOrLoadVoiceStyle(preset: SupertonicFemalePreset): { ttl: unknown; dp: unknown } {
    const cached = this.styleCache.get(preset);
    if (cached) return cached;
    if (!this.ortModule) {
      throw new Error('ONNX Runtime chưa được khởi tạo.');
    }
    const stylePath = path.join(this.modelDir, `voice_styles/${preset}.json`);
    if (!fs.existsSync(stylePath)) {
      const err = new Error(`Không tìm thấy preset giọng ${preset}.`) as Error & { statusCode?: number };
      err.statusCode = 503;
      throw err;
    }
    const raw = JSON.parse(fs.readFileSync(stylePath, 'utf8'));
    const ttlDims: number[] = raw.style_ttl.dims;
    const dpDims: number[] = raw.style_dp.dims;
    const ttlFlat = new Float32Array(raw.style_ttl.data.flat(Infinity));
    const dpFlat = new Float32Array(raw.style_dp.data.flat(Infinity));
    const style = {
      ttl: new this.ortModule.Tensor('float32', ttlFlat, [1, ttlDims[1], ttlDims[2]]),
      dp: new this.ortModule.Tensor('float32', dpFlat, [1, dpDims[1], dpDims[2]]),
    };
    this.styleCache.set(preset, style);
    return style;
  }

  private getFromCache(key: string): CachedEntry | null {
    const hit = this.wavCache.get(key);
    if (!hit) return null;
    this.wavCache.delete(key);
    this.wavCache.set(key, hit);
    return hit;
  }

  private putInCache(key: string, buffer: Buffer, durationSec: number): void {
    const byteLength = buffer.byteLength;
    if (byteLength <= 44 || byteLength > 8 * 1024 * 1024) return;
    while (this.wavCache.size >= MAX_CACHE_ENTRIES || this.wavCacheBytes + byteLength > MAX_CACHE_BYTES) {
      const oldestKey = this.wavCache.keys().next().value;
      if (!oldestKey) break;
      const old = this.wavCache.get(oldestKey);
      if (old) this.wavCacheBytes -= old.byteLength;
      this.wavCache.delete(oldestKey);
    }
    this.wavCache.set(key, { buffer, durationSec, byteLength });
    this.wavCacheBytes += byteLength;
  }

  public async synthesizeVietnameseChunk(input: {
    text: string;
    voicePreset?: string;
    speed?: number;
    totalStep?: number;
  }): Promise<SupertonicSynthResult> {
    const cleanText = String(input.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText || cleanText.length > 420) {
      const err = new Error('Nội dung câu thoại không hợp lệ (1–420 ký tự).') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const preset = normalizePreset(input.voicePreset || this.defaultPreset);
    const speed = Math.max(
      MIN_SUPERTONIC_SPEED,
      Math.min(MAX_SUPERTONIC_SPEED, Number(input.speed ?? this.defaultSpeed) || this.defaultSpeed)
    );
    const totalStep = Math.max(4, Math.min(16, Number(input.totalStep ?? this.defaultTotalStep) || this.defaultTotalStep));

    const cacheKey = crypto
      .createHash('sha256')
      .update(`supertonic3|vi|${preset}|${totalStep}|${speed.toFixed(2)}|${cleanText}`)
      .digest('hex');

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        audioBuffer: cached.buffer,
        mimeType: 'audio/wav',
        cacheStatus: 'HIT',
        provider: 'supertonic3',
        voicePreset: preset,
        speed,
        lang: 'vi',
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        durationSec: cached.durationSec,
        synthMs: 0,
      };
    }

    const existingFlight = this.inFlight.get(cacheKey);
    if (existingFlight) return existingFlight;

    const promise = this.enqueueSerialized(async () => {
      await this.ensureLoaded();
      const t0 = Date.now();
      const ort = this.ortModule!;
      const { cfgs, indexer, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt } = this.sessions!;
      const style = this.getOrLoadVoiceStyle(preset);

      const processed = preprocessSupertonicText(cleanText, 'vi');
      const row = sanitizeSupertonicTokenRow(processed, indexer);
      const textIdsTensor = intArrayToTensor(ort, [row], [1, row.length]);
      const textMaskTensor = arrayToTensor(ort, lengthToMask([row.length]), [1, 1, row.length]);

      const dpOut = await dpOrt.run({
        text_ids: textIdsTensor,
        style_dp: style.dp,
        text_mask: textMaskTensor,
      });
      // Supertonic's duration_predictor stretches vowels & comma pauses on longer Vietnamese clauses (>42 chars).
      // A smooth length-compensation boost (+0% at <=42 chars up to +12% at >=112 chars) keeps speaking pace uniform!
      const lengthBoost =
        cleanText.length <= 42
          ? 1.0
          : 1.0 + Math.min(0.12, ((cleanText.length - 42) / 70) * 0.12);
      const effectiveInferSpeed = Math.min(MAX_SUPERTONIC_SPEED, speed * lengthBoost);
      const durSec = Math.max(0.25, Number(dpOut.duration.data[0]) / effectiveInferSpeed);

      const textEncOut = await textEncOrt.run({
        text_ids: textIdsTensor,
        style_ttl: style.ttl,
        text_mask: textMaskTensor,
      });

      const sampleRate = cfgs.ae.sample_rate || SUPERTONIC_SAMPLE_RATE;
      const chunkSize = cfgs.ae.base_chunk_size * cfgs.ttl.chunk_compress_factor;
      const wavLen = Math.floor(durSec * sampleRate);
      const latentLen = Math.max(1, Math.floor((wavLen + chunkSize - 1) / chunkSize));
      const latentDim = cfgs.ttl.latent_dim * cfgs.ttl.chunk_compress_factor;

      const noisyLatent = new Float32Array(latentDim * latentLen);
      for (let i = 0; i < noisyLatent.length; i++) {
        const u1 = Math.max(1e-10, Math.random());
        const u2 = Math.random();
        noisyLatent[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      }
      const latentMaskArr = new Float32Array(latentLen).fill(1.0);
      const latentMaskTensor = new ort.Tensor('float32', latentMaskArr, [1, 1, latentLen]);
      const totalStepTensor = new ort.Tensor('float32', Float32Array.from([totalStep]), [1]);

      let xtData: Float32Array = noisyLatent;
      for (let step = 0; step < totalStep; step++) {
        const out = await vectorEstOrt.run({
          noisy_latent: new ort.Tensor('float32', xtData, [1, latentDim, latentLen]),
          text_emb: textEncOut.text_emb,
          style_ttl: style.ttl,
          latent_mask: latentMaskTensor,
          text_mask: textMaskTensor,
          current_step: new ort.Tensor('float32', Float32Array.from([step]), [1]),
          total_step: totalStepTensor,
        });
        xtData = out.denoised_latent.data;
      }

      const vocOut = await vocoderOrt.run({
        latent: new ort.Tensor('float32', xtData, [1, latentDim, latentLen]),
      });
      const rawSamples = vocOut.wav_tts.data;
      const sliced = rawSamples.subarray(0, Math.min(rawSamples.length, wavLen));
      const trimmedSamples = trimFloat32SpeechSilence(sliced, sampleRate);
      const finalDurSec = Number((trimmedSamples.length / sampleRate).toFixed(2));
      const wavBuffer = encodeFloat32ToPcm16Wav(trimmedSamples, sampleRate);
      const synthMs = Date.now() - t0;

      this.putInCache(cacheKey, wavBuffer, finalDurSec);
      return {
        audioBuffer: wavBuffer,
        mimeType: 'audio/wav' as const,
        cacheStatus: 'MISS' as const,
        provider: 'supertonic3' as const,
        voicePreset: preset,
        speed,
        lang: 'vi' as const,
        sampleRate,
        durationSec: finalDurSec,
        synthMs,
      };
    });

    this.inFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private enqueueSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queueTail.then(fn, fn);
    this.queueTail = next.then(() => undefined, () => undefined);
    return next;
  }
}
