import * as ort from 'onnxruntime-web/wasm';
import { createPiperPhonemize } from '@piper-phonemize-internal';

export const PIPER_CACHE_PREFIX = 'virtual-expo-piper-tts-';
export const PIPER_CACHE_BUCKET = `${PIPER_CACHE_PREFIX}v1`;
export const PIPER_VOICE_ID = 'vi_VN-vais1000-medium';
export const PIPER_VOICE_PROFILE = 'female_soft_fast';
export const PIPER_MODEL_VERSION = 'v2-soft-fast';
export const PIPER_DEFAULT_LENGTH_SCALE = 0.87;
export const PIPER_DEFAULT_NOISE_SCALE = 0.45;
export const PIPER_DEFAULT_NOISE_W = 0.65;

const DEFAULT_ONNX_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx';
const DEFAULT_LOCAL_CONFIG_URL = '/tts/vi_VN-vais1000-medium.onnx.json';
const DEFAULT_REMOTE_CONFIG_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json';
const DEFAULT_PIPER_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm';
const DEFAULT_PIPER_DATA_URL =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data';
const ORT_WASM_CDN_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

// Uncompressed byte total (~60.27 MB ONNX + ~17.24 MB espeak data + ~0.61 MB phonemizer wasm = 81.91 MB / 78.1 MiB)
const ESTIMATED_COLD_TOTAL_BYTES = 81_913_755;

const DOWNLOAD_TIMEOUT_MS = 180_000;
const STREAM_STALL_TIMEOUT_MS = 35_000;
const INIT_TIMEOUT_MS = 90_000;
const SYNTH_TIMEOUT_MS = 90_000;

interface PiperModelConfigJson {
  audio: {
    sample_rate: number;
    quality?: string;
  };
  espeak: {
    voice: string;
  };
  inference: {
    noise_scale?: number;
    length_scale?: number;
    noise_w?: number;
  };
  num_speakers?: number;
  speaker_id_map?: Record<string, number>;
}

let ortSession: ort.InferenceSession | null = null;
let modelConfig: PiperModelConfigJson | null = null;
let piperWasmBuffer: ArrayBuffer | null = null;
let piperDataBuffer: ArrayBuffer | null = null;
let cachedPhonemizeMod: { callMain: (args: string[]) => void } | null = null;
let activePhonemizePrint: ((data: string) => void) | null = null;
let initInFlight: Promise<{
  downloadMs: number;
  initMs: number;
  fromCache: boolean;
  modelBytes: number;
  sampleRate: number;
}> | null = null;

function withStepTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Quá thời gian chờ (${Math.round(ms / 1000)}s) ở bước: ${label}`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function isValidWasmBinary(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 100_000) return false;
  const u8 = new Uint8Array(buf, 0, 4);
  return u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d;
}

function isValidOnnxModelBinary(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 60_000_000) return false;
  const first = new Uint8Array(buf, 0, 1)[0];
  // Reject HTML ('<') or JSON ('{') error bodies masquerading as binary responses
  return first !== 0x3c && first !== 0x7b;
}

async function pruneOldAppCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.startsWith(PIPER_CACHE_PREFIX) && key !== PIPER_CACHE_BUCKET) {
        await caches.delete(key);
      }
    }
  } catch {
    // Ignore storage access errors in restricted modes
  }
}

async function deleteCachedEntry(url: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PIPER_CACHE_BUCKET);
    await cache.delete(url);
  } catch {
    // ignore
  }
}

async function fetchValidatedAsset(options: {
  url: string;
  minBytes: number;
  validate?: (buf: ArrayBuffer) => boolean;
  timeoutMs: number;
  bypassCache?: boolean;
  onChunkProgress?: (loadedBytes: number, totalBytes: number) => void;
}): Promise<{ buffer: ArrayBuffer; fromCache: boolean }> {
  const { url, minBytes, validate, timeoutMs, bypassCache = false, onChunkProgress } = options;

  if (!bypassCache && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(PIPER_CACHE_BUCKET);
      const hit = await cache.match(url);
      if (hit && hit.ok) {
        const ab = await hit.arrayBuffer();
        const valid = ab.byteLength >= minBytes && (!validate || validate(ab));
        if (valid) {
          return { buffer: ab, fromCache: true };
        }
        await cache.delete(url);
      }
    } catch {
      // Proceed to network fetch
    }
  }

  const ctrl = new AbortController();
  const overallTimer = setTimeout(
    () => ctrl.abort(new Error(`Timeout tải tài nguyên (${url})`)),
    timeoutMs
  );
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const resetStall = () => {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = setTimeout(
      () => ctrl.abort(new Error(`Mạng ngắt quãng quá 35 giây khi tải mô hình giọng nói.`)),
      STREAM_STALL_TIMEOUT_MS
    );
  };

  try {
    resetStall();
    const res = await fetch(url, { mode: 'cors', signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`Không thể tải gói giọng nói (HTTP ${res.status}).`);
    }
    const total = Number(res.headers.get('content-length') || 0);
    const reader = res.body?.getReader();

    let finalBuffer: ArrayBuffer;
    if (!reader) {
      finalBuffer = await res.arrayBuffer();
      onChunkProgress?.(finalBuffer.byteLength, total || finalBuffer.byteLength);
    } else if (total > 0) {
      // Single pre-sized allocation when Content-Length is known -> avoids 63 MB duplicate chunks[] array
      let buf = new Uint8Array(total);
      let loaded = 0;
      while (true) {
        resetStall();
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.byteLength > buf.byteLength) {
          const grown = new Uint8Array(Math.max(loaded + value.byteLength, Math.ceil(buf.byteLength * 1.5)));
          grown.set(buf.subarray(0, loaded), 0);
          buf = grown;
        }
        buf.set(value, loaded);
        loaded += value.byteLength;
        onChunkProgress?.(loaded, total);
      }
      finalBuffer = loaded === buf.byteLength ? buf.buffer : buf.buffer.slice(0, loaded);
    } else {
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      while (true) {
        resetStall();
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onChunkProgress?.(loaded, total);
      }
      const merged = new Uint8Array(loaded);
      let offset = 0;
      for (let i = 0; i < chunks.length; i++) {
        merged.set(chunks[i], offset);
        offset += chunks[i].byteLength;
      }
      chunks.length = 0;
      finalBuffer = merged.buffer;
    }

    if (finalBuffer.byteLength < minBytes || (validate && !validate(finalBuffer))) {
      throw new Error('Dữ liệu mô hình giọng nói tải về không đầy đủ hoặc bị lỗi định dạng.');
    }

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(PIPER_CACHE_BUCKET);
        await cache.put(url, new Response(finalBuffer));
      } catch {
        // Storage quota full or private browsing — continue using RAM buffer for current session
      }
    }

    return { buffer: finalBuffer, fromCache: false };
  } finally {
    clearTimeout(overallTimer);
    if (stallTimer !== null) clearTimeout(stallTimer);
  }
}

function encodePcm16Wav(floatSamples: Float32Array, sampleRate: number): ArrayBuffer {
  const len = floatSamples.length;
  const buf = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * 2, true);
  let p = 44;
  for (let i = 0; i < len; i++) {
    const v = Math.max(-1, Math.min(1, floatSamples[i]));
    view.setInt16(p, v < 0 ? v * 32768 : v * 32767, true);
    p += 2;
  }
  return buf;
}

async function createFreshPhonemizeModule(
  piperWasmUrl: string,
  piperDataUrl: string,
  onPrint: (data: string) => void
): Promise<{ callMain: (args: string[]) => void }> {
  return createPiperPhonemize({
    wasmBinary: piperWasmBuffer ? piperWasmBuffer.slice(0) : undefined,
    getPreloadedPackage: piperDataBuffer ? () => piperDataBuffer!.slice(0) : undefined,
    print: (data: string) => onPrint(data),
    printErr: () => {
      // Non-fatal espeak stderr messages must never reject or hang synthesis
    },
    locateFile: (file: string) => {
      if (file.endsWith('.wasm')) return piperWasmUrl;
      if (file.endsWith('.data')) return piperDataUrl;
      return file;
    },
  });
}

async function phonemizeVietnamese(
  text: string,
  espeakVoice: string,
  piperWasmUrl: string,
  piperDataUrl: string
): Promise<{ phonemeIds: number[]; reused: boolean }> {
  const input = JSON.stringify([{ text: text.trim() }]);

  const runOnModule = (mod: { callMain: (args: string[]) => void }): number[] | null => {
    let parsedIds: number[] | null = null;
    activePhonemizePrint = (data: string) => {
      if (parsedIds) return;
      try {
        const parsed = JSON.parse(data) as { phoneme_ids?: number[] };
        if (Array.isArray(parsed.phoneme_ids) && parsed.phoneme_ids.length > 0) {
          parsedIds = parsed.phoneme_ids;
        }
      } catch {
        // ignore non-JSON stdout lines
      }
    };
    try {
      mod.callMain(['-l', espeakVoice, '--input', input, '--espeak_data', '/espeak-ng-data']);
    } finally {
      activePhonemizePrint = null;
    }
    return parsedIds;
  };

  // Fast path: reuse persistent Emscripten phonemizer instance (avoids cloning 18.1 MB espeak data per chunk)
  if (cachedPhonemizeMod) {
    try {
      const reusedIds = runOnModule(cachedPhonemizeMod);
      if (reusedIds && reusedIds.length > 0) {
        return { phonemeIds: reusedIds, reused: true };
      }
    } catch {
      // Module runtime may have exited; discard and recreate cleanly below
    }
    cachedPhonemizeMod = null;
  }

  const freshMod = await createFreshPhonemizeModule(piperWasmUrl, piperDataUrl, (data) => {
    activePhonemizePrint?.(data);
  });
  const ids = runOnModule(freshMod);
  if (!ids || ids.length === 0) {
    throw new Error('Bộ chuyển âm vị tiếng Việt không trả về chuỗi phoneme hợp lệ.');
  }
  cachedPhonemizeMod = freshMod;
  return { phonemeIds: ids, reused: false };
}

async function ensureInitialized(
  requestId: number,
  overrides?: {
    onnxUrl?: string;
    configUrl?: string;
    piperWasmUrl?: string;
    piperDataUrl?: string;
  }
): Promise<{
  downloadMs: number;
  initMs: number;
  fromCache: boolean;
  modelBytes: number;
  sampleRate: number;
}> {
  if (ortSession && modelConfig && piperWasmBuffer && piperDataBuffer) {
    return {
      downloadMs: 0,
      initMs: 0,
      fromCache: true,
      modelBytes: 63_201_294,
      sampleRate: modelConfig.audio.sample_rate || 22050,
    };
  }

  if (initInFlight) {
    return initInFlight;
  }

  const onnxUrl = overrides?.onnxUrl || DEFAULT_ONNX_URL;
  const localConfigUrl = overrides?.configUrl || DEFAULT_LOCAL_CONFIG_URL;
  const piperWasmUrl = overrides?.piperWasmUrl || DEFAULT_PIPER_WASM_URL;
  const piperDataUrl = overrides?.piperDataUrl || DEFAULT_PIPER_DATA_URL;

  initInFlight = (async () => {
    await pruneOldAppCaches();

    const runDownloadAndInit = async (bypassModelCache: boolean) => {
      const tDownload0 = performance.now();
      const loadedByPart = { wasm: 0, data: 0, model: 0 };
      const totalByPart = { wasm: 635_212, data: 18_077_249, model: 63_201_294 };
      let lastPostTime = 0;

      const emitProgress = (force = false) => {
        const now = performance.now();
        if (!force && now - lastPostTime < 160) return;
        lastPostTime = now;
        const loadedBytes = loadedByPart.wasm + loadedByPart.data + loadedByPart.model;
        const totalBytes =
          (totalByPart.wasm + totalByPart.data + totalByPart.model) || ESTIMATED_COLD_TOTAL_BYTES;
        self.postMessage({
          id: requestId,
          type: 'progress',
          stage: 'downloading',
          loadedBytes,
          totalBytes: Math.max(loadedBytes, totalBytes),
        });
      };

      const downloadStage = Promise.all([
        fetchValidatedAsset({
          url: localConfigUrl,
          minBytes: 500,
          timeoutMs: 15_000,
          bypassCache: bypassModelCache,
        }).catch(() =>
          fetchValidatedAsset({
            url: DEFAULT_REMOTE_CONFIG_URL,
            minBytes: 500,
            timeoutMs: 30_000,
            bypassCache: bypassModelCache,
          })
        ),
        fetchValidatedAsset({
          url: piperWasmUrl,
          minBytes: 100_000,
          validate: isValidWasmBinary,
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          bypassCache: bypassModelCache,
          onChunkProgress: (loaded) => {
            loadedByPart.wasm = loaded;
            emitProgress();
          },
        }),
        fetchValidatedAsset({
          url: piperDataUrl,
          minBytes: 6_000_000,
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          bypassCache: bypassModelCache,
          onChunkProgress: (loaded) => {
            loadedByPart.data = loaded;
            emitProgress();
          },
        }),
        fetchValidatedAsset({
          url: onnxUrl,
          minBytes: 60_000_000,
          validate: isValidOnnxModelBinary,
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          bypassCache: bypassModelCache,
          onChunkProgress: (loaded, total) => {
            loadedByPart.model = loaded;
            if (total > 60_000_000) totalByPart.model = total;
            emitProgress();
          },
        }),
      ]);

      const [cfgRes, wasmRes, dataRes, modelRes] = await withStepTimeout(
        downloadStage,
        DOWNLOAD_TIMEOUT_MS,
        'Tải mô hình giọng nói tiếng Việt'
      );
      if (!modelRes.fromCache) {
        emitProgress(true);
      }
      const downloadMs = Math.round(performance.now() - tDownload0);
      const modelBytes = modelRes.buffer.byteLength;

      self.postMessage({
        id: requestId,
        type: 'progress',
        stage: 'initializing',
        loadedBytes: modelBytes,
        totalBytes: modelBytes,
      });

      const tInit0 = performance.now();
      const initStage = (async () => {
        const parsedCfg = JSON.parse(
          new TextDecoder().decode(cfgRes.buffer)
        ) as PiperModelConfigJson;
        if (!parsedCfg?.audio?.sample_rate || !parsedCfg?.espeak?.voice) {
          throw new Error('Cấu hình mô hình giọng nói Piper (.onnx.json) không hợp lệ.');
        }

        // Force single-threaded SIMD in this dedicated Worker so COOP/COEP SharedArrayBuffer is never required
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = ORT_WASM_CDN_BASE;

        const session = await ort.InferenceSession.create(modelRes.buffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'basic',
        });

        modelConfig = parsedCfg;
        piperWasmBuffer = wasmRes.buffer;
        piperDataBuffer = dataRes.buffer;
        ortSession = session;
      })();

      await withStepTimeout(initStage, INIT_TIMEOUT_MS, 'Khởi tạo bộ tổng hợp WASM/ONNX');
      const initMs = Math.round(performance.now() - tInit0);

      return {
        downloadMs,
        initMs,
        fromCache: modelRes.fromCache && dataRes.fromCache && wasmRes.fromCache,
        modelBytes,
        sampleRate: modelConfig!.audio.sample_rate || 22050,
      };
    };

    try {
      return await runDownloadAndInit(false);
    } catch (firstErr) {
      // If cached binary was somehow corrupted, purge cached entries and retry network AT MOST ONCE
      await Promise.all([
        deleteCachedEntry(onnxUrl),
        deleteCachedEntry(piperWasmUrl),
        deleteCachedEntry(piperDataUrl),
      ]);
      // Only retry once if online and error wasn't an explicit network/HTTP failure on fresh download
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const isLikelyCorruptedCache =
        msg.includes('InferenceSession') ||
        msg.includes('protobuf') ||
        msg.includes('parse') ||
        msg.includes('compile');
      if (isLikelyCorruptedCache) {
        return await runDownloadAndInit(true);
      }
      throw firstErr;
    }
  })().finally(() => {
    initInFlight = null;
  });

  return initInFlight;
}

self.onmessage = async (ev: MessageEvent) => {
  const data = ev.data || {};
  const { id, type } = data as { id: number; type: string };

  try {
    if (type === 'ping') {
      self.postMessage({
        id,
        type: 'pong',
        crossOriginIsolated: Boolean(self.crossOriginIsolated),
      });
      return;
    }

    if (type === 'dispose') {
      if (ortSession) {
        try {
          await ortSession.release();
        } catch {
          // ignore release errors
        }
        ortSession = null;
      }
      modelConfig = null;
      piperWasmBuffer = null;
      piperDataBuffer = null;
      cachedPhonemizeMod = null;
      activePhonemizePrint = null;
      self.postMessage({ id, type: 'disposed' });
      return;
    }

    if (type === 'init') {
      const info = await ensureInitialized(id, data.overrides);
      self.postMessage({
        id,
        type: 'ready',
        ...info,
      });
      return;
    }

    if (type === 'synthesize') {
      const text = String(data.text || '').trim();
      const lengthScaleOverride =
        typeof data.lengthScale === 'number' && Number.isFinite(data.lengthScale)
          ? data.lengthScale
          : undefined;
      const piperWasmUrl = data.overrides?.piperWasmUrl || DEFAULT_PIPER_WASM_URL;
      const piperDataUrl = data.overrides?.piperDataUrl || DEFAULT_PIPER_DATA_URL;

      if (!text) {
        throw new Error('Nội dung tổng hợp giọng nói trống.');
      }

      await ensureInitialized(id, data.overrides);

      const t0 = performance.now();
      const synthPromise = (async () => {
        const cfg = modelConfig!;
        const session = ortSession!;

        const tPhon0 = performance.now();
        const { phonemeIds, reused: phonemizeReused } = await phonemizeVietnamese(
          text,
          cfg.espeak.voice || 'vi',
          piperWasmUrl,
          piperDataUrl
        );
        const phonemizeMs = Math.round(performance.now() - tPhon0);
        if (!phonemeIds || phonemeIds.length === 0) {
          throw new Error('Không tạo được chuỗi âm vị cho câu tiếng Việt.');
        }

        const bigIds = BigInt64Array.from(phonemeIds.map((x) => BigInt(x)));
        const bigLen = BigInt64Array.from([BigInt(phonemeIds.length)]);
        const effectiveLengthScale = lengthScaleOverride ?? PIPER_DEFAULT_LENGTH_SCALE;
        const scales = Float32Array.from([
          PIPER_DEFAULT_NOISE_SCALE,
          effectiveLengthScale,
          PIPER_DEFAULT_NOISE_W,
        ]);

        const feeds: Record<string, ort.Tensor> = {
          input: new ort.Tensor('int64', bigIds, [1, phonemeIds.length]),
          input_lengths: new ort.Tensor('int64', bigLen, [1]),
          scales: new ort.Tensor('float32', scales, [3]),
        };
        if (cfg.speaker_id_map && Object.keys(cfg.speaker_id_map).length > 0) {
          feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(0)]), [1]);
        }

        const tOnnx0 = performance.now();
        const results = await session.run(feeds);
        const onnxMs = Math.round(performance.now() - tOnnx0);
        const outputTensor = results.output;
        const pcm = outputTensor.data as Float32Array;
        const sampleRate = cfg.audio.sample_rate || 22050;
        const wavBuffer = encodePcm16Wav(pcm, sampleRate);
        const durationSec = Number((pcm.length / sampleRate).toFixed(2));
        return { wavBuffer, durationSec, sampleRate, phonemizeMs, onnxMs, phonemizeReused };
      })();

      const out = await withStepTimeout(synthPromise, SYNTH_TIMEOUT_MS, 'Tổng hợp giọng nói');
      const synthMs = Math.round(performance.now() - t0);

      (self as unknown as DedicatedWorkerGlobalScope).postMessage(
        {
          id,
          type: 'audio',
          wavBuffer: out.wavBuffer,
          synthMs,
          phonemizeMs: out.phonemizeMs,
          onnxMs: out.onnxMs,
          phonemizeReused: out.phonemizeReused,
          durationSec: out.durationSec,
          sampleRate: out.sampleRate,
        },
        [out.wavBuffer]
      );
      return;
    }

    throw new Error(`Lệnh Worker không hợp lệ: ${type}`);
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
