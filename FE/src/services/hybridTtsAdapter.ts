import {
  chunkNormalizedSpeechForPiper,
  normalizeVietnameseForPiper,
} from './piperSpeechNormalizer';

export type ConfiguredTtsProvider = 'auto' | 'local-korvatts' | 'browser-piper';
export type ResolvedActiveTtsProvider = 'local-korvatts' | 'browser-piper';

export const PIPER_VOICE_DISPLAY_NAME = 'VAIS-1000 (Piper WASM)';
export const PIPER_VOICE_ATTRIBUTION_NOTICE =
  'Mô hình giọng đọc vi_VN-vais1000-medium (VAIS-1000 Corpus · Rhasspy Piper Voices, giấy phép CC BY 4.0)';
export const DEFAULT_PIPER_LENGTH_SCALE = 1.06;

const MAX_WAV_CACHE_ENTRIES = 36;
const MAX_WAV_CACHE_BYTES = 16 * 1024 * 1024; // 16 MB bounded RAM cache
const MAX_PENDING_WORKER_JOBS = 4;
const WORKER_PING_TIMEOUT_MS = 6_000;
const WORKER_INIT_TOTAL_TIMEOUT_MS = 275_000; // 180s download + 90s init + 5s margin
const WORKER_SYNTH_TIMEOUT_MS = 92_000;
const DEFAULT_IDLE_RELEASE_MS = 45_000;

export interface PiperProgressEvent {
  stage: 'downloading' | 'initializing' | 'synthesizing';
  loadedBytes: number;
  totalBytes: number;
  percent: number | null;
}

export interface PiperSynthesizedChunkResult {
  blob: Blob;
  cacheStatus: 'HIT' | 'MISS';
  provider: 'browser-piper';
  voice: string;
  synthMs: number;
  durationSec: number;
}

export interface PiperAssetUrlOverrides {
  onnxUrl?: string;
  configUrl?: string;
  piperWasmUrl?: string;
  piperDataUrl?: string;
}

export function isLocalLoopbackHostname(hostname?: string): boolean {
  const h = (
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  )
    .trim()
    .toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/**
 * Resolves explicit TTS provider configuration from `VITE_TTS_PROVIDER` (or runtime override)
 * without relying blindly on `import.meta.env.PROD`.
 */
export function resolveTtsProviderConfig(options?: {
  rawEnvValue?: string | null;
  hostname?: string;
  search?: string;
}): {
  configured: ConfiguredTtsProvider;
  preferredInitial: ResolvedActiveTtsProvider;
  configWarning: string | null;
} {
  let queryOverride = '';
  if (options?.search !== undefined) {
    try {
      queryOverride = new URLSearchParams(options.search).get('tts') || '';
    } catch {
      queryOverride = '';
    }
  } else if (typeof window !== 'undefined' && window.location?.search) {
    try {
      queryOverride = new URLSearchParams(window.location.search).get('tts') || '';
    } catch {
      queryOverride = '';
    }
  }

  const raw = (
    queryOverride ||
    (options?.rawEnvValue ??
      ((import.meta.env?.VITE_TTS_PROVIDER as string | undefined) ?? ''))
  )
    .trim()
    .toLowerCase();

  const isLocal = isLocalLoopbackHostname(options?.hostname);

  if (!raw || raw === 'auto') {
    return {
      configured: 'auto',
      preferredInitial: isLocal ? 'local-korvatts' : 'browser-piper',
      configWarning: null,
    };
  }

  if (raw === 'local-korvatts' || raw === 'korvatts' || raw === 'server') {
    if (!isLocal) {
      // Protect Production/Staging from accidentally forcing unavailable Render KorvaTTS unless explicitly overridden on localhost
      return {
        configured: 'browser-piper',
        preferredInitial: 'browser-piper',
        configWarning:
          'Cấu hình VITE_TTS_PROVIDER=local-korvatts không khả dụng trên môi trường đám mây — Đã chuyển an toàn sang browser-piper.',
      };
    }
    return {
      configured: 'local-korvatts',
      preferredInitial: 'local-korvatts',
      configWarning: null,
    };
  }

  if (raw === 'browser-piper' || raw === 'piper' || raw === 'client-piper') {
    return {
      configured: 'browser-piper',
      preferredInitial: 'browser-piper',
      configWarning: null,
    };
  }

  return {
    configured: 'auto',
    preferredInitial: isLocal ? 'local-korvatts' : 'browser-piper',
    configWarning: `Giá trị VITE_TTS_PROVIDER="${raw}" không hợp lệ — Đã dùng chế độ mặc định an toàn (${
      isLocal ? 'local-korvatts' : 'browser-piper'
    }).`,
  };
}

export function checkBrowserPiperCapability(navOverride?: {
  deviceMemory?: number;
  onLine?: boolean;
  hasWebAssembly?: boolean;
  hasWorker?: boolean;
}): {
  supported: boolean;
  lowMemoryDevice: boolean;
  deviceMemoryGb: number | null;
  reason?: string;
} {
  const hasWasm =
    navOverride?.hasWebAssembly ??
    (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function');
  const hasWorker = navOverride?.hasWorker ?? typeof Worker !== 'undefined';

  if (!hasWasm || !hasWorker) {
    return {
      supported: false,
      lowMemoryDevice: false,
      deviceMemoryGb: null,
      reason:
        'Trình duyệt hiện tại không hỗ trợ WebAssembly hoặc Web Worker cho bộ đọc giọng nói — Đang hiển thị phụ đề tiếng Việt.',
    };
  }

  const rawMem =
    navOverride?.deviceMemory ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);
  const deviceMemoryGb =
    typeof rawMem === 'number' && Number.isFinite(rawMem) && rawMem > 0 ? rawMem : null;

  if (deviceMemoryGb !== null && deviceMemoryGb < 1) {
    return {
      supported: false,
      lowMemoryDevice: true,
      deviceMemoryGb,
      reason:
        'Thiết bị có dung lượng RAM thấp (< 1 GB) — Ưu tiên giữ cảnh 3D mượt mà và hiển thị phụ đề tiếng Việt.',
    };
  }

  return {
    supported: true,
    lowMemoryDevice: deviceMemoryGb !== null && deviceMemoryGb <= 2,
    deviceMemoryGb,
  };
}

const PIPER_CACHE_BUCKET_NAME = 'virtual-expo-piper-tts-v1';
const PIPER_DEFAULT_ONNX_CACHE_KEY =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx';

/**
 * Checks browser CacheStorage (0 network requests) to verify whether the Piper ONNX model
 * is already cached locally from a prior NPC consultation.
 */
export async function hasCachedPiperModelInBrowser(onnxUrl = PIPER_DEFAULT_ONNX_CACHE_KEY): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(PIPER_CACHE_BUCKET_NAME);
    const hit = await cache.match(onnxUrl);
    return Boolean(hit && hit.ok);
  } catch {
    return false;
  }
}

export function shouldAllowPiperBackgroundPrewarm(overrides?: {
  onLine?: boolean;
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
  hasWebAssembly?: boolean;
  hasWorker?: boolean;
}): { allowed: boolean; reason: string } {
  const cap = checkBrowserPiperCapability({
    deviceMemory: overrides?.deviceMemory,
    onLine: overrides?.onLine,
    hasWebAssembly: overrides?.hasWebAssembly,
    hasWorker: overrides?.hasWorker,
  });
  if (!cap.supported) {
    return { allowed: false, reason: cap.reason || 'unsupported' };
  }
  if (cap.lowMemoryDevice) {
    return { allowed: false, reason: 'low-memory-device' };
  }

  const isOnline = overrides?.onLine ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
  if (isOnline === false) {
    return { allowed: false, reason: 'offline' };
  }

  const navConn =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;
  const saveData = overrides?.saveData ?? Boolean(navConn?.saveData);
  if (saveData) {
    return { allowed: false, reason: 'save-data-enabled' };
  }

  const effectiveType = (overrides?.effectiveType ?? navConn?.effectiveType ?? '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    return { allowed: false, reason: `slow-connection:${effectiveType}` };
  }

  return { allowed: true, reason: 'eligible' };
}

export function computePiperWavCacheKey(
  normalizedSpeechText: string,
  lengthScale = DEFAULT_PIPER_LENGTH_SCALE
): string {
  return `piper-v1|vi_VN-vais1000-medium|1.0.0|ls:${lengthScale.toFixed(2)}|${normalizedSpeechText.trim()}`;
}

/**
 * Splits only the very first chunk at a natural Vietnamese clause boundary (22–56 chars)
 * to reduce Time-To-First-Audio (TTFA) without altering, removing, or adding any words.
 */
function splitFirstChunkForFastTtfa(chunks: string[]): string[] {
  if (chunks.length === 0) return chunks;
  const first = chunks[0];
  if (first.length <= 58) return chunks;

  const minCut = 20;
  const maxCut = 56;
  const windowStr = first.slice(0, maxCut);
  let cutAt = -1;

  for (const delim of ['. ', '! ', '? ', '; ', ', ']) {
    const idx = windowStr.indexOf(delim);
    if (idx >= minCut) {
      cutAt = idx + 1;
      break;
    }
  }

  if (cutAt === -1) {
    for (const phrase of [' tại ', ' của ', ' với ', ' để ', ' và ']) {
      const idx = windowStr.indexOf(phrase);
      if (idx >= minCut) {
        cutAt = idx;
        break;
      }
    }
  }

  if (cutAt === -1) return chunks;
  const head = first.slice(0, cutAt).replace(/[,;:\s]+$/, '').trim();
  const tail = first.slice(cutAt).replace(/^[,;:\s]+/, '').trim();
  if (head.length < 16 || tail.length < 16) return chunks;
  const headFinal = /[.!?]$/.test(head) ? head : `${head}.`;
  return [headFinal, tail, ...chunks.slice(1)];
}

export function buildPiperStepPlanFromDisplayText(displayText: string): {
  displayText: string;
  speechText: string;
  chunks: string[];
} {
  const speechText = normalizeVietnameseForPiper(displayText);
  const rawChunks = chunkNormalizedSpeechForPiper(speechText, 65, 135);
  const baseChunks = rawChunks.length > 0 ? rawChunks : speechText ? [speechText] : [];
  return {
    displayText,
    speechText,
    chunks: splitFirstChunkForFastTtfa(baseChunks),
  };
}

interface CachedWavEntry {
  buffer: ArrayBuffer;
  byteLength: number;
  durationSec: number;
}

interface PendingWorkerRequest {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onProgress?: (ev: PiperProgressEvent) => void;
}

interface QueuedSynthesisTask {
  normalizedText: string;
  lengthScale: number;
  priority: 'high' | 'low';
  signal?: AbortSignal;
  onProgress?: (ev: PiperProgressEvent) => void;
  overrides?: PiperAssetUrlOverrides;
  resolve: (res: PiperSynthesizedChunkResult) => void;
  reject: (err: Error) => void;
}

export type WorkerFactoryFn = () => Worker;

const defaultWorkerFactory: WorkerFactoryFn = () =>
  new Worker(new URL('./piperTtsWorker.ts', import.meta.url), { type: 'module' });

/**
 * Manages the singleton Piper WASM Web Worker, bounded WAV LRU cache, download progress forwarding,
 * serialized job scheduling, cancellation, and idle memory disposal.
 */
export class PiperBrowserTtsManager {
  private worker: Worker | null = null;
  private workerReadyPromise: Promise<void> | null = null;
  private workerBootError: Error | null = null;
  private msgSeq = 0;
  private readonly pending = new Map<number, PendingWorkerRequest>();
  private readonly wavCache = new Map<string, CachedWavEntry>();
  private wavCacheTotalBytes = 0;
  private readonly jobQueue: QueuedSynthesisTask[] = [];
  private activeJobRunning = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isModelReadyInWorker = false;
  private prewarmInFlight: Promise<boolean> | null = null;
  private workerFactory: WorkerFactoryFn;

  constructor(workerFactory: WorkerFactoryFn = defaultWorkerFactory) {
    this.workerFactory = workerFactory;
  }

  isModelReady(): boolean {
    return this.isModelReadyInWorker && this.worker !== null;
  }

  /**
   * Controlled, non-blocking background prewarm of the Piper WASM model in its dedicated Worker.
   * - When `cacheOnly` is true (default), ONLY warms the worker if the model is ALREADY in CacheStorage (0 network bytes!).
   * - Skips automatically on low-RAM devices, Save-Data mode, offline, or slow 2G/3G connections.
   */
  async prewarmInBackground(options?: {
    cacheOnly?: boolean;
    overrides?: PiperAssetUrlOverrides;
    hasCachedModelCheck?: () => Promise<boolean>;
  }): Promise<boolean> {
    if (this.isModelReadyInWorker && this.worker) return true;
    if (this.prewarmInFlight) return this.prewarmInFlight;

    const gate = shouldAllowPiperBackgroundPrewarm();
    if (!gate.allowed) return false;

    const cacheOnly = options?.cacheOnly ?? true;
    const checkCached =
      options?.hasCachedModelCheck ??
      (() => hasCachedPiperModelInBrowser(options?.overrides?.onnxUrl || PIPER_DEFAULT_ONNX_CACHE_KEY));

    this.prewarmInFlight = (async () => {
      try {
        if (cacheOnly) {
          const isCached = await checkCached();
          if (!isCached) return false;
        }
        await this.ensureWorkerAlive();
        if (this.isModelReadyInWorker) return true;
        await this.sendWorkerCommand(
          { type: 'init', overrides: options?.overrides },
          WORKER_INIT_TOTAL_TIMEOUT_MS
        );
        this.isModelReadyInWorker = true;
        return true;
      } catch {
        // Silent best-effort prewarm: never surface errors until user explicitly requests NPC voice
        return false;
      } finally {
        this.prewarmInFlight = null;
      }
    })();

    return this.prewarmInFlight;
  }

  getCacheStats(): { entries: number; totalBytes: number; workerAlive: boolean } {
    return {
      entries: this.wavCache.size,
      totalBytes: this.wavCacheTotalBytes,
      workerAlive: this.worker !== null,
    };
  }

  clearWavCache(): void {
    this.wavCache.clear();
    this.wavCacheTotalBytes = 0;
  }

  private getFromWavCache(key: string): CachedWavEntry | null {
    const entry = this.wavCache.get(key);
    if (!entry) return null;
    // Refresh LRU order
    this.wavCache.delete(key);
    this.wavCache.set(key, entry);
    return entry;
  }

  private putInWavCache(key: string, buffer: ArrayBuffer, durationSec: number): void {
    const byteLength = buffer.byteLength;
    if (byteLength <= 44 || byteLength > 4 * 1024 * 1024) return;

    const existing = this.wavCache.get(key);
    if (existing) {
      this.wavCacheTotalBytes -= existing.byteLength;
      this.wavCache.delete(key);
    }

    while (
      this.wavCache.size >= MAX_WAV_CACHE_ENTRIES ||
      this.wavCacheTotalBytes + byteLength > MAX_WAV_CACHE_BYTES
    ) {
      const oldestKey = this.wavCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.wavCache.get(oldestKey);
      if (oldest) {
        this.wavCacheTotalBytes -= oldest.byteLength;
      }
      this.wavCache.delete(oldestKey);
    }

    this.wavCache.set(key, {
      buffer: buffer.slice(0),
      byteLength,
      durationSec,
    });
    this.wavCacheTotalBytes += byteLength;
  }

  cancelIdleRelease(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  scheduleIdleRelease(delayMs?: number): void {
    this.cancelIdleRelease();
    if (!this.worker) return;
    const cap = checkBrowserPiperCapability();
    const effectiveDelay =
      delayMs !== undefined ? delayMs : cap.lowMemoryDevice ? 0 : DEFAULT_IDLE_RELEASE_MS;

    if (effectiveDelay <= 0) {
      void this.disposeWorker();
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.activeJobRunning && this.jobQueue.length === 0) {
        void this.disposeWorker();
      }
    }, effectiveDelay);
  }

  async disposeWorker(): Promise<void> {
    this.cancelIdleRelease();
    while (this.jobQueue.length > 0) {
      const task = this.jobQueue.shift();
      const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
      abortErr.name = 'AbortError';
      task?.reject(abortErr);
    }

    const w = this.worker;
    this.worker = null;
    this.workerReadyPromise = null;
    this.workerBootError = null;
    this.isModelReadyInWorker = false;

    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error('Bộ xử lý giọng nói trên trình duyệt đã giải phóng tài nguyên.'));
    }
    this.pending.clear();

    if (!w) return;
    try {
      w.postMessage({ id: ++this.msgSeq, type: 'dispose' });
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 30));
    try {
      w.terminate();
    } catch {
      // ignore
    }
  }

  private terminateCrashedWorker(reason: Error): void {
    const w = this.worker;
    this.worker = null;
    this.workerReadyPromise = null;
    this.workerBootError = null;
    this.isModelReadyInWorker = false;

    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(reason);
    }
    this.pending.clear();

    if (w) {
      try {
        w.terminate();
      } catch {
        // ignore
      }
    }
  }

  private ensureWorkerAlive(): Promise<void> {
    this.cancelIdleRelease();
    if (this.worker && this.workerReadyPromise) {
      return this.workerReadyPromise;
    }

    const cap = checkBrowserPiperCapability();
    if (!cap.supported) {
      return Promise.reject(new Error(cap.reason || 'Trình duyệt không hỗ trợ Piper WASM.'));
    }

    this.workerBootError = null;
    let w: Worker;
    try {
      w = this.workerFactory();
    } catch (err) {
      return Promise.reject(
        new Error(
          `Không thể khởi tạo Web Worker cho giọng nói: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }

    this.worker = w;

    // Attach error & messageerror handlers BEFORE sending any request (V25.8 Phase 2 rule #2)
    w.onerror = (ev: ErrorEvent) => {
      const crashErr = new Error(
        `Web Worker giọng nói gặp sự cố (${ev.message || 'Không thể nạp module WASM'}).`
      );
      this.workerBootError = crashErr;
      this.terminateCrashedWorker(crashErr);
    };

    w.onmessageerror = () => {
      const msgErr = new Error('Lỗi truyền dữ liệu âm thanh từ Web Worker.');
      this.terminateCrashedWorker(msgErr);
    };

    w.onmessage = (ev: MessageEvent) => {
      const m = (ev.data || {}) as Record<string, unknown>;
      const id = Number(m.id || 0);
      const entry = this.pending.get(id);
      if (!entry) return;

      if (m.type === 'progress') {
        const stage = (m.stage as 'downloading' | 'initializing') || 'downloading';
        const loadedBytes = Number(m.loadedBytes || 0);
        const totalBytes = Number(m.totalBytes || 0);
        const percent =
          totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((loadedBytes * 100) / totalBytes))) : null;
        entry.onProgress?.({ stage, loadedBytes, totalBytes, percent });
        return;
      }

      clearTimeout(entry.timer);
      this.pending.delete(id);
      if (m.type === 'error') {
        entry.reject(new Error(String(m.message || 'Lỗi tổng hợp giọng nói Piper WASM.')));
      } else {
        entry.resolve(m);
      }
    };

    // Mandatory ping/pong liveness check before heavy init/synthesis (V25.8 Phase 2 rule #3)
    this.workerReadyPromise = this.sendWorkerCommand({ type: 'ping' }, WORKER_PING_TIMEOUT_MS)
      .then(() => undefined)
      .catch((err) => {
        this.terminateCrashedWorker(err instanceof Error ? err : new Error(String(err)));
        throw err;
      });

    return this.workerReadyPromise;
  }

  private sendWorkerCommand(
    payload: Record<string, unknown>,
    timeoutMs: number,
    onProgress?: (ev: PiperProgressEvent) => void
  ): Promise<Record<string, unknown>> {
    if (this.workerBootError) {
      return Promise.reject(this.workerBootError);
    }
    if (!this.worker) {
      return Promise.reject(new Error('Web Worker giọng nói chưa khởi tạo.'));
    }

    const id = ++this.msgSeq;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const timeoutErr = new Error(
          `Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) khi xử lý giọng nói trên trình duyệt.`
        );
        // Terminate wedged worker so subsequent retries get a clean instance
        this.terminateCrashedWorker(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer, onProgress });
      try {
        this.worker!.postMessage({ id, ...payload });
      } catch (postErr) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(postErr instanceof Error ? postErr : new Error(String(postErr)));
      }
    });
  }

  async synthesizeNormalizedChunk(options: {
    normalizedText: string;
    lengthScale?: number;
    priority?: 'high' | 'low';
    signal?: AbortSignal;
    onProgress?: (ev: PiperProgressEvent) => void;
    overrides?: PiperAssetUrlOverrides;
  }): Promise<PiperSynthesizedChunkResult> {
    const cleanText = options.normalizedText.trim();
    if (!cleanText) {
      throw new Error('Nội dung câu thoại rỗng.');
    }

    if (options.signal?.aborted) {
      const abortErr = new Error('Đã hủy yêu cầu âm thanh.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const lengthScale = options.lengthScale ?? DEFAULT_PIPER_LENGTH_SCALE;
    const cacheKey = computePiperWavCacheKey(cleanText, lengthScale);
    const hit = this.getFromWavCache(cacheKey);
    if (hit) {
      return {
        blob: new Blob([hit.buffer], { type: 'audio/wav' }),
        cacheStatus: 'HIT',
        provider: 'browser-piper',
        voice: PIPER_VOICE_DISPLAY_NAME,
        synthMs: 0,
        durationSec: hit.durationSec,
      };
    }

    // Check offline status BEFORE queuing cold download if model isn't ready yet
    if (
      !this.isModelReadyInWorker &&
      typeof navigator !== 'undefined' &&
      navigator.onLine === false &&
      typeof caches === 'undefined'
    ) {
      throw new Error(
        'Trình duyệt đang ngoại tuyến (Offline) và chưa có mô hình giọng nói lưu sẵn — Đang hiển thị phụ đề tiếng Việt.'
      );
    }

    if (this.jobQueue.length >= MAX_PENDING_WORKER_JOBS) {
      // Evict oldest non-running queued prefetch job to prevent memory/queue buildup
      const evicted = this.jobQueue.shift();
      if (evicted) {
        const abortErr = new Error('Đã nhường hàng đợi cho câu thoại mới.');
        abortErr.name = 'AbortError';
        evicted.reject(abortErr);
      }
    }

    return new Promise<PiperSynthesizedChunkResult>((resolve, reject) => {
      const priority = options.priority ?? 'high';
      const task: QueuedSynthesisTask = {
        normalizedText: cleanText,
        lengthScale,
        priority,
        signal: options.signal,
        onProgress: options.onProgress,
        overrides: options.overrides,
        resolve,
        reject,
      };

      if (options.signal) {
        const onAbort = () => {
          const idx = this.jobQueue.indexOf(task);
          if (idx !== -1) {
            this.jobQueue.splice(idx, 1);
            const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
            abortErr.name = 'AbortError';
            reject(abortErr);
          }
        };
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      if (priority === 'high') {
        const firstLowIdx = this.jobQueue.findIndex((t) => t.priority === 'low');
        if (firstLowIdx === -1) this.jobQueue.push(task);
        else this.jobQueue.splice(firstLowIdx, 0, task);
      } else {
        this.jobQueue.push(task);
      }
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (this.activeJobRunning || this.jobQueue.length === 0) return;

    while (this.jobQueue.length > 0 && this.jobQueue[0].signal?.aborted) {
      const cancelled = this.jobQueue.shift()!;
      const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
      abortErr.name = 'AbortError';
      cancelled.reject(abortErr);
    }

    const nextTask = this.jobQueue.shift();
    if (!nextTask) return;

    this.activeJobRunning = true;
    this.executeTask(nextTask)
      .then((res) => nextTask.resolve(res))
      .catch((err) => nextTask.reject(err instanceof Error ? err : new Error(String(err))))
      .finally(() => {
        this.activeJobRunning = false;
        this.pumpQueue();
      });
  }

  private async executeTask(task: QueuedSynthesisTask): Promise<PiperSynthesizedChunkResult> {
    const cacheKey = computePiperWavCacheKey(task.normalizedText, task.lengthScale);
    const cached = this.getFromWavCache(cacheKey);
    if (cached) {
      return {
        blob: new Blob([cached.buffer], { type: 'audio/wav' }),
        cacheStatus: 'HIT',
        provider: 'browser-piper',
        voice: PIPER_VOICE_DISPLAY_NAME,
        synthMs: 0,
        durationSec: cached.durationSec,
      };
    }

    await this.ensureWorkerAlive();

    if (!this.isModelReadyInWorker) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Still allow init attempt in case CacheStorage already holds the full model offline;
        // if CacheStorage misses while offline, fetchValidatedAsset will fail fast and cleanly.
      }
      await this.sendWorkerCommand(
        { type: 'init', overrides: task.overrides },
        WORKER_INIT_TOTAL_TIMEOUT_MS,
        task.onProgress
      );
      this.isModelReadyInWorker = true;
    }

    if (task.signal?.aborted) {
      const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    task.onProgress?.({
      stage: 'synthesizing',
      loadedBytes: 1,
      totalBytes: 1,
      percent: 100,
    });

    const res = await this.sendWorkerCommand(
      {
        type: 'synthesize',
        text: task.normalizedText,
        lengthScale: task.lengthScale,
        overrides: task.overrides,
      },
      WORKER_SYNTH_TIMEOUT_MS,
      task.onProgress
    );

    const wavBuffer = res.wavBuffer as ArrayBuffer;
    const durationSec = Number(res.durationSec || 0);
    const synthMs = Number(res.synthMs || 0);

    if (!wavBuffer || wavBuffer.byteLength <= 44) {
      throw new Error('Dữ liệu âm thanh WAV tạo ra không hợp lệ.');
    }

    this.putInWavCache(cacheKey, wavBuffer, durationSec);

    return {
      blob: new Blob([wavBuffer], { type: 'audio/wav' }),
      cacheStatus: 'MISS',
      provider: 'browser-piper',
      voice: PIPER_VOICE_DISPLAY_NAME,
      synthMs,
      durationSec,
    };
  }
}

export const piperBrowserTts = new PiperBrowserTtsManager();
