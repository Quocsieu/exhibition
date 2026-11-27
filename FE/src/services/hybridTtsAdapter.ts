import {
  chunkNormalizedSpeechForPiper,
  normalizeVietnameseForPiper,
} from './piperSpeechNormalizer';
import {
  predictiveResourceGovernor,
  predictiveTtsTelemetry,
  resolvePredictivePreSynthEnabled,
  type PredictivePriority,
} from './predictiveAudioScheduler';
import { persistentAudioCache, type PersistentAudioCache } from './persistentAudioCache';

export type ConfiguredTtsProvider = 'auto' | 'local-korvatts' | 'browser-piper';
export type ResolvedActiveTtsProvider = 'local-korvatts' | 'browser-piper';

export const PIPER_VOICE_DISPLAY_NAME = 'VAIS-1000 (Piper WASM)';
export const PIPER_VOICE_ATTRIBUTION_NOTICE =
  'Mô hình giọng đọc vi_VN-vais1000-medium (VAIS-1000 Corpus · Rhasspy Piper Voices, giấy phép CC BY 4.0)';
export const DEFAULT_PIPER_LENGTH_SCALE = 0.87;
export const DEFAULT_PIPER_NOISE_SCALE = 0.45;
export const DEFAULT_PIPER_NOISE_W = 0.65;

const MAX_WAV_CACHE_ENTRIES = 36;
const MAX_WAV_CACHE_BYTES = 16 * 1024 * 1024; // 16 MB bounded RAM cache
const MAX_PENDING_WORKER_JOBS = 4;
const WORKER_PING_TIMEOUT_MS = 6_000;
const WORKER_INIT_TOTAL_TIMEOUT_MS = 275_000; // 180s download + 90s init + 5s margin
const WORKER_SYNTH_TIMEOUT_MS = 92_000;
const DEFAULT_IDLE_RELEASE_MS = 90_000;
const DESKTOP_IDLE_RELEASE_MS = 300_000;

export function resolveAdaptiveIdleReleaseMs(cap: {
  lowMemoryDevice: boolean;
  deviceMemoryGb: number | null;
}): number {
  if (cap.lowMemoryDevice) return 0;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return 30_000;
  }
  const isCompact = typeof window !== 'undefined' && window.innerWidth < 768;
  if (isCompact) return DEFAULT_IDLE_RELEASE_MS;
  if (cap.deviceMemoryGb === null || cap.deviceMemoryGb >= 6) {
    return DESKTOP_IDLE_RELEASE_MS;
  }
  return DEFAULT_IDLE_RELEASE_MS;
}

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
    configWarning: `Giá trị VITE_TTS_PROVIDER="${raw}" không hợp lệ — Đã dùng chế độ mặc định an toàn (${isLocal ? 'local-korvatts' : 'browser-piper'
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
  return `piper-v2-soft-fast|vi_VN-vais1000-medium|ls:${lengthScale.toFixed(2)}|ns:${DEFAULT_PIPER_NOISE_SCALE}|nw:${DEFAULT_PIPER_NOISE_W}|${normalizedSpeechText.trim()}`;
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

interface TaskWaiter {
  resolve: (res: PiperSynthesizedChunkResult) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onProgress?: (ev: PiperProgressEvent) => void;
}

interface QueuedSynthesisTask {
  cacheKey: string;
  normalizedText: string;
  lengthScale: number;
  priority: PredictivePriority;
  seq: number;
  enqueuedAtMs: number;
  triggerSource: string;
  isBackground: boolean;
  overrides?: PiperAssetUrlOverrides;
  waiters: TaskWaiter[];
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
  private readonly predictedCacheKeys = new Set<string>();
  private wavCacheTotalBytes = 0;
  private readonly jobQueue: QueuedSynthesisTask[] = [];
  private activeTask: QueuedSynthesisTask | null = null;
  private activeJobRunning = false;
  private taskSeq = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isModelReadyInWorker = false;
  private prewarmInFlight: Promise<boolean> | null = null;
  private workerFactory: WorkerFactoryFn;
  private readonly idbCache: PersistentAudioCache;

  constructor(
    workerFactory: WorkerFactoryFn = defaultWorkerFactory,
    idbCache: PersistentAudioCache = persistentAudioCache
  ) {
    this.workerFactory = workerFactory;
    this.idbCache = idbCache;
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
      delayMs !== undefined ? delayMs : resolveAdaptiveIdleReleaseMs(cap);

    if (effectiveDelay <= 0) {
      if (!this.activeJobRunning && this.jobQueue.length === 0) {
        void this.disposeWorker();
      }
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
      if (task) {
        for (const w of task.waiters) w.reject(abortErr);
      }
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
          `Không thể khởi tạo Web Worker cho giọng nói: ${err instanceof Error ? err.message : String(err)
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

  hasWavInCache(normalizedText: string, lengthScale = DEFAULT_PIPER_LENGTH_SCALE): boolean {
    const clean = normalizedText.trim();
    if (!clean) return false;
    return this.wavCache.has(computePiperWavCacheKey(clean, lengthScale));
  }

  private sortJobQueue(): void {
    this.jobQueue.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.seq - b.seq));
  }

  private syncForegroundGovernorCount(): void {
    const fgQueued = this.jobQueue.filter((t) => t.priority === 0).length;
    const fgActive = this.activeTask?.priority === 0 ? 1 : 0;
    predictiveResourceGovernor.setForegroundPendingCount(fgQueued + fgActive);
  }

  async synthesizeNormalizedChunk(options: {
    normalizedText: string;
    lengthScale?: number;
    priority?: 'high' | 'low';
    schedulerPriority?: PredictivePriority;
    triggerSource?: string;
    isPredictive?: boolean;
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

    const reqPriority: PredictivePriority =
      options.schedulerPriority ?? (options.priority === 'low' ? 3 : 0);
    const isForeground = reqPriority === 0;
    const isPredictive = Boolean(options.isPredictive);
    const triggerSource = options.triggerSource ?? (isForeground ? 'foreground_click' : 'background');

    const lengthScale = options.lengthScale ?? DEFAULT_PIPER_LENGTH_SCALE;
    const cacheKey = computePiperWavCacheKey(cleanText, lengthScale);
    const hit = this.getFromWavCache(cacheKey);
    if (hit) {
      if (isForeground) {
        if (this.predictedCacheKeys.has(cacheKey)) {
          predictiveTtsTelemetry.inc('predictionHits');
        }
        predictiveTtsTelemetry.record({ lastQueueWaitMs: 0, lastTriggerSource: triggerSource });
      }
      return {
        blob: new Blob([hit.buffer], { type: 'audio/wav' }),
        cacheStatus: 'HIT',
        provider: 'browser-piper',
        voice: PIPER_VOICE_DISPLAY_NAME,
        synthMs: 0,
        durationSec: hit.durationSec,
      };
    }

    // Phase 3: Check IndexedDB Persistent Audio Cache before queuing/waking Worker
    const idbHit = await this.idbCache.get(cacheKey).catch(() => null);
    if (idbHit && !options.signal?.aborted) {
      this.putInWavCache(cacheKey, idbHit.buffer, idbHit.durationSec);
      if (isForeground) {
        predictiveTtsTelemetry.record({ lastQueueWaitMs: 0, lastTriggerSource: triggerSource });
      }
      return {
        blob: new Blob([idbHit.buffer], { type: 'audio/wav' }),
        cacheStatus: 'HIT',
        provider: 'browser-piper',
        voice: PIPER_VOICE_DISPLAY_NAME,
        synthMs: 0,
        durationSec: idbHit.durationSec,
      };
    }
    if (options.signal?.aborted) {
      const abortErr = new Error('Đã hủy yêu cầu âm thanh.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (isForeground && !this.predictedCacheKeys.has(cacheKey)) {
      predictiveTtsTelemetry.inc('predictionMisses');
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

    // Case C: Single-flight reuse if active worker task matches exact cacheKey
    if (this.activeTask && this.activeTask.cacheKey === cacheKey) {
      predictiveTtsTelemetry.inc('singleFlightReuses');
      if (reqPriority < this.activeTask.priority) {
        this.activeTask.priority = reqPriority;
        predictiveTtsTelemetry.inc('priorityPromotions');
        this.syncForegroundGovernorCount();
      }
      return new Promise<PiperSynthesizedChunkResult>((resolve, reject) => {
        const waiter: TaskWaiter = {
          resolve,
          reject,
          signal: options.signal,
          onProgress: options.onProgress,
        };
        this.activeTask!.waiters.push(waiter);
        if (options.signal) {
          options.signal.addEventListener(
            'abort',
            () => {
              const idx = this.activeTask?.waiters.indexOf(waiter) ?? -1;
              if (idx !== -1 && this.activeTask) {
                this.activeTask.waiters.splice(idx, 1);
                const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
                abortErr.name = 'AbortError';
                reject(abortErr);
              }
            },
            { once: true }
          );
        }
      });
    }

    // Case B: Priority promotion + single-flight deduplication if already queued
    const existingQueued = this.jobQueue.find((t) => t.cacheKey === cacheKey);
    if (existingQueued) {
      predictiveTtsTelemetry.inc('duplicatePrevented');
      if (reqPriority < existingQueued.priority) {
        existingQueued.priority = reqPriority;
        existingQueued.isBackground = existingQueued.isBackground && !isForeground;
        predictiveTtsTelemetry.inc('priorityPromotions');
        this.sortJobQueue();
        this.syncForegroundGovernorCount();
      }
      return new Promise<PiperSynthesizedChunkResult>((resolve, reject) => {
        const waiter: TaskWaiter = {
          resolve,
          reject,
          signal: options.signal,
          onProgress: options.onProgress,
        };
        existingQueued.waiters.push(waiter);
        if (options.signal) {
          options.signal.addEventListener(
            'abort',
            () => {
              const idx = existingQueued.waiters.indexOf(waiter);
              if (idx !== -1) {
                existingQueued.waiters.splice(idx, 1);
                const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
                abortErr.name = 'AbortError';
                reject(abortErr);
              }
              if (existingQueued.waiters.length === 0) {
                const qIdx = this.jobQueue.indexOf(existingQueued);
                if (qIdx !== -1) {
                  this.jobQueue.splice(qIdx, 1);
                  if (existingQueued.isBackground) predictiveTtsTelemetry.inc('backgroundCancelled');
                }
              }
            },
            { once: true }
          );
        }
      });
    }

    if (this.jobQueue.length >= MAX_PENDING_WORKER_JOBS) {
      // Never evict P0 foreground requests; evict lowest-priority non-P0 job
      let evictIdx = -1;
      let worstPriority = -1;
      for (let i = this.jobQueue.length - 1; i >= 0; i--) {
        if (this.jobQueue[i].priority > 0 && this.jobQueue[i].priority > worstPriority) {
          worstPriority = this.jobQueue[i].priority;
          evictIdx = i;
        }
      }
      if (evictIdx !== -1) {
        const [evicted] = this.jobQueue.splice(evictIdx, 1);
        if (evicted.isBackground) predictiveTtsTelemetry.inc('backgroundCancelled');
        const abortErr = new Error('Đã nhường hàng đợi cho câu thoại mới.');
        abortErr.name = 'AbortError';
        for (const w of evicted.waiters) w.reject(abortErr);
      }
    }

    return new Promise<PiperSynthesizedChunkResult>((resolve, reject) => {
      const waiter: TaskWaiter = {
        resolve,
        reject,
        signal: options.signal,
        onProgress: options.onProgress,
      };
      const task: QueuedSynthesisTask = {
        cacheKey,
        normalizedText: cleanText,
        lengthScale,
        priority: reqPriority,
        seq: ++this.taskSeq,
        enqueuedAtMs: Date.now(),
        triggerSource,
        isBackground: isPredictive,
        overrides: options.overrides,
        waiters: [waiter],
      };

      if (isPredictive) {
        predictiveTtsTelemetry.inc('backgroundQueued');
        predictiveTtsTelemetry.record({ lastTriggerSource: triggerSource });
      } else if (isForeground) {
        // Cancel any unstarted speculative predictive jobs so P0 never queues behind them
        for (let i = this.jobQueue.length - 1; i >= 0; i--) {
          if (this.jobQueue[i].isBackground) {
            const [cancelled] = this.jobQueue.splice(i, 1);
            predictiveTtsTelemetry.inc('backgroundCancelled');
            const abortErr = new Error('Đã nhường hàng đợi cho yêu cầu người dùng.');
            abortErr.name = 'AbortError';
            for (const w of cancelled.waiters) w.reject(abortErr);
          }
        }
      }

      if (options.signal) {
        options.signal.addEventListener(
          'abort',
          () => {
            const wIdx = task.waiters.indexOf(waiter);
            if (wIdx !== -1) {
              task.waiters.splice(wIdx, 1);
              const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
              abortErr.name = 'AbortError';
              reject(abortErr);
            }
            if (task.waiters.length === 0) {
              const qIdx = this.jobQueue.indexOf(task);
              if (qIdx !== -1) {
                this.jobQueue.splice(qIdx, 1);
                if (task.isBackground) predictiveTtsTelemetry.inc('backgroundCancelled');
                this.syncForegroundGovernorCount();
              }
            }
          },
          { once: true }
        );
      }

      this.jobQueue.push(task);
      this.sortJobQueue();
      this.syncForegroundGovernorCount();
      this.pumpQueue();
    });
  }

  /**
   * Predictive background pre-synthesis helper (Phase 2):
   * - Respects feature flag, Adaptive Resource Governor, and AbortSignal.
   * - Only warms `wavCache` (never plays audio, never alters booth voice lock).
   */
  async preSynthesizeChunks(options: {
    chunks: string[];
    priority?: PredictivePriority;
    triggerSource: string;
    signal?: AbortSignal;
    maxChunks?: number;
  }): Promise<number> {
    if (!resolvePredictivePreSynthEnabled()) return 0;
    const gov = predictiveResourceGovernor.canRunBackgroundJob();
    if (!gov.allowed) {
      predictiveTtsTelemetry.inc('governorBlocked');
      return 0;
    }

    const prio: PredictivePriority = options.priority ?? 2;
    const limit = Math.min(options.maxChunks ?? 1, gov.maxBackgroundProducts);
    let completed = 0;

    for (const rawChunk of options.chunks) {
      if (completed >= limit) break;
      if (options.signal?.aborted) break;
      const again = predictiveResourceGovernor.canRunBackgroundJob();
      if (!again.allowed) {
        predictiveTtsTelemetry.inc('governorBlocked');
        break;
      }

      const clean = rawChunk.trim();
      if (!clean) continue;
      const cacheKey = computePiperWavCacheKey(clean, DEFAULT_PIPER_LENGTH_SCALE);
      if (this.wavCache.has(cacheKey)) {
        this.predictedCacheKeys.add(cacheKey);
        continue;
      }

      try {
        await this.synthesizeNormalizedChunk({
          normalizedText: clean,
          schedulerPriority: prio,
          triggerSource: options.triggerSource,
          isPredictive: true,
          signal: options.signal,
        });
        this.predictedCacheKeys.add(cacheKey);
        predictiveTtsTelemetry.inc('backgroundCompleted');
        completed += 1;
      } catch {
        // Silently ignore AbortError or worker errors during speculative background pre-synth
        if (options.signal?.aborted) break;
        predictiveTtsTelemetry.inc('backgroundFailed');
      }
    }
    return completed;
  }

  private pumpQueue(): void {
    if (this.activeJobRunning || this.jobQueue.length === 0) return;

    while (this.jobQueue.length > 0) {
      const head = this.jobQueue[0];
      const allWaitersAborted = head.waiters.every((w) => w.signal?.aborted);
      if (allWaitersAborted) {
        this.jobQueue.shift();
        if (head.isBackground) predictiveTtsTelemetry.inc('backgroundCancelled');
        const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
        abortErr.name = 'AbortError';
        for (const w of head.waiters) w.reject(abortErr);
        continue;
      }
      // Pause launching new background jobs if Resource Governor blocks (foreground P0 always proceeds!)
      if (head.priority > 0 && !predictiveResourceGovernor.canRunBackgroundJob().allowed) {
        return;
      }
      break;
    }

    const nextTask = this.jobQueue.shift();
    if (!nextTask) return;

    this.activeTask = nextTask;
    this.activeJobRunning = true;
    this.syncForegroundGovernorCount();

    const queueWaitMs = Math.max(0, Date.now() - nextTask.enqueuedAtMs);
    if (nextTask.priority === 0) {
      predictiveTtsTelemetry.record({
        lastQueueWaitMs: queueWaitMs,
        lastForegroundBlockedMs: queueWaitMs,
      });
      predictiveResourceGovernor.recordForegroundBlocked(queueWaitMs);
    } else if (nextTask.isBackground) {
      predictiveTtsTelemetry.inc('backgroundStarted');
    }

    this.executeTask(nextTask)
      .then((res) => {
        if (nextTask.priority === 0) {
          predictiveTtsTelemetry.record({ lastSynthMs: res.synthMs });
        }
        for (const w of nextTask.waiters) {
          if (w.signal?.aborted) {
            const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
            abortErr.name = 'AbortError';
            w.reject(abortErr);
          } else {
            w.resolve(res);
          }
        }
      })
      .catch((err) => {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        for (const w of nextTask.waiters) w.reject(errorObj);
      })
      .finally(() => {
        this.activeTask = null;
        this.activeJobRunning = false;
        this.syncForegroundGovernorCount();
        this.pumpQueue();
      });
  }

  private async executeTask(task: QueuedSynthesisTask): Promise<PiperSynthesizedChunkResult> {
    const cacheKey = task.cacheKey;
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
      await this.sendWorkerCommand(
        { type: 'init', overrides: task.overrides },
        WORKER_INIT_TOTAL_TIMEOUT_MS,
        (ev) => {
          for (const w of task.waiters) w.onProgress?.(ev);
        }
      );
      this.isModelReadyInWorker = true;
    }

    if (task.waiters.every((w) => w.signal?.aborted)) {
      const abortErr = new Error('Đã hủy yêu cầu tổng hợp âm thanh.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    for (const w of task.waiters) {
      w.onProgress?.({
        stage: 'synthesizing',
        loadedBytes: 1,
        totalBytes: 1,
        percent: 100,
      });
    }

    const res = await this.sendWorkerCommand(
      {
        type: 'synthesize',
        text: task.normalizedText,
        lengthScale: task.lengthScale,
        overrides: task.overrides,
      },
      WORKER_SYNTH_TIMEOUT_MS,
      (ev) => {
        for (const w of task.waiters) w.onProgress?.(ev);
      }
    );

    const wavBuffer = res.wavBuffer as ArrayBuffer;
    const durationSec = Number(res.durationSec || 0);
    const synthMs = Number(res.synthMs || 0);

    if (!wavBuffer || wavBuffer.byteLength <= 44) {
      throw new Error('Dữ liệu âm thanh WAV tạo ra không hợp lệ.');
    }

    this.putInWavCache(cacheKey, wavBuffer, durationSec);
    void this.idbCache.put({
      key: cacheKey,
      buffer: wavBuffer,
      durationSec,
      voiceSignature: `piper-v2-soft-fast|vi_VN-vais1000-medium|ls:${task.lengthScale.toFixed(2)}`,
    });

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
