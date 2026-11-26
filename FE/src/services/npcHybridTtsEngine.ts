/**
 * Free Hybrid TTS Engine (Pre-generated Authentic Piper vi_VN-vais1000-medium Audio + Safe Fallback).
 *
 * Strictly additive module — NEVER modifies, replaces, or deletes legacy Piper WASM (`piperTtsWorker.ts`).
 *
 * Guarantees:
 * - Zero paid TTS API calls.
 * - Authentic `vi_VN-vais1000-medium` voice parity with legacy Piper fallback.
 * - Content-hash (SHA-256 of normalized chunk) + exact transcript equality check prevents stale or cross-booth playback.
 * - Lazy manifest load ONLY when `NPC_TTS_MODE === 'hybrid'` (0 bytes in `legacy` mode).
 * - One-shot error isolation (404 / corrupt WAV / timeout -> marks hash failed for session, falls back cleanly to Piper once).
 */

export const PREGEN_MANIFEST_URL = '/tts/pregen/manifest.json';
export const PREGEN_V2_MANIFEST_URL = '/tts/pregen_v2/manifest.json';
export const EXPECTED_PIPER_VOICE_ID = 'vi_VN-vais1000-medium';
export const EXPECTED_PREGEN_VERSION = 'v2-soft-fast';
const MAX_PREGEN_RAM_ENTRIES = 60;
const PREGEN_FETCH_TIMEOUT_MS = 4000;

export interface HybridPreloadEnv {
  onLine?: boolean;
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
}

/**
 * Respects Data Saver, offline mode, slow 2G connections, and very low-RAM devices
 * before issuing background preloads in Hybrid mode.
 */
export function shouldAllowHybridPreload(env?: HybridPreloadEnv): { allowed: boolean; reason: string } {
  const onLine = env?.onLine ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
  if (!onLine) return { allowed: false, reason: 'offline' };

  const navConn =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;
  const saveData = env?.saveData ?? Boolean(navConn?.saveData);
  if (saveData) return { allowed: false, reason: 'save_data' };

  const effectiveType = env?.effectiveType ?? navConn?.effectiveType;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return { allowed: false, reason: `slow_network_${effectiveType}` };
  }

  const deviceMemory =
    env?.deviceMemory ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);
  if (typeof deviceMemory === 'number' && deviceMemory <= 1) {
    return { allowed: false, reason: 'low_memory' };
  }

  return { allowed: true, reason: 'ok' };
}

export interface PregenAudioManifestEntry {
  file: string;
  mimeType: string;
  text: string;
  durationSec: number;
  bytes: number;
}

export interface PregenAudioManifest {
  version: string;
  voiceId: string;
  generatedAt?: string;
  entries: Record<string, PregenAudioManifestEntry>;
}

export interface PregenAudioLookupResult {
  blob: Blob;
  hash: string;
  file: string;
  durationSec: number;
  bytes: number;
  fetchMs: number;
  cacheStatus: 'PREGEN_NET_HIT' | 'PREGEN_MEM_HIT';
}

/**
 * Pure-JS SHA-256 fallback (for non-secure HTTP origins where `crypto.subtle` is undefined).
 */
function sha256FallbackHex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H).map((x) => x.toString(16).padStart(8, '0')).join('');
}

export async function computeChunkContentHash(normalizedText: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const data = new TextEncoder().encode(normalizedText);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to pure-JS SHA-256
    }
  }
  return sha256FallbackHex(normalizedText);
}

export function isValidWavArrayBuffer(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength <= 44) return false;
  const u8 = new Uint8Array(buf, 0, 12);
  // RIFF .... WAVE
  return (
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
    u8[8] === 0x57 && u8[9] === 0x41 && u8[10] === 0x56 && u8[11] === 0x45
  );
}

export class NpcHybridTtsEngine {
  private manifest: PregenAudioManifest | null = null;
  private manifestPromise: Promise<PregenAudioManifest | null> | null = null;
  private readonly blobCache = new Map<string, { blob: Blob; entry: PregenAudioManifestEntry }>();
  private readonly inFlightFetches = new Map<string, Promise<PregenAudioLookupResult | null>>();
  private readonly failedHashes = new Set<string>();
  private readonly fetchFn: typeof fetch;
  private readonly manifestUrl: string;

  constructor(options?: { fetchFn?: typeof fetch; manifestUrl?: string }) {
    this.fetchFn = options?.fetchFn ?? ((input, init) => fetch(input, init));
    this.manifestUrl = options?.manifestUrl ?? PREGEN_MANIFEST_URL;
  }

  public resetForTests(): void {
    this.manifest = null;
    this.manifestPromise = null;
    this.blobCache.clear();
    this.inFlightFetches.clear();
    this.failedHashes.clear();
  }

  public markHashFailed(hash: string): void {
    this.failedHashes.add(hash);
    this.blobCache.delete(hash);
  }

  public getRamCacheCount(): number {
    return this.blobCache.size;
  }

  /**
   * Lazily warms ONLY the lightweight manifest (~2 KB) in Hybrid mode (0 MB ONNX, 0 auto-play).
   */
  public async warmManifest(): Promise<boolean> {
    const m = await this.ensureManifest();
    return Boolean(m);
  }

  /**
   * Smart Preloader: selectively preloads ONLY chunks present in `manifest.json` with
   * bounded concurrency (default 2), in-flight deduplication, and full AbortSignal cancellation.
   * NEVER downloads the 63 MB Piper ONNX model and NEVER calls Audio.play().
   */
  public async preloadChunks(
    normalizedChunks: string[],
    options?: { signal?: AbortSignal; maxConcurrency?: number; maxChunks?: number }
  ): Promise<{ preloaded: number; skipped: number }> {
    const signal = options?.signal;
    if (signal?.aborted || normalizedChunks.length === 0) {
      return { preloaded: 0, skipped: normalizedChunks.length };
    }

    const manifest = await this.ensureManifest();
    if (!manifest || signal?.aborted) {
      return { preloaded: 0, skipped: normalizedChunks.length };
    }

    const cap = Math.max(1, options?.maxChunks ?? 16);
    const concurrency = Math.max(1, Math.min(3, options?.maxConcurrency ?? 2));
    const candidates: string[] = [];
    for (const chunk of normalizedChunks) {
      if (candidates.length >= cap) break;
      if (signal?.aborted) break;
      const hash = await computeChunkContentHash(chunk);
      if (this.failedHashes.has(hash) || this.blobCache.has(hash)) continue;
      const entry = manifest.entries[hash];
      if (entry && entry.text === chunk) {
        candidates.push(chunk);
      }
    }

    let preloaded = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length && !signal?.aborted) {
        const text = candidates[cursor++];
        const res = await this.tryFetchPregenAudio(text, signal);
        if (res) preloaded += 1;
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
    return { preloaded, skipped: normalizedChunks.length - preloaded };
  }

  private async ensureManifest(): Promise<PregenAudioManifest | null> {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = (async () => {
      try {
        const res = await this.fetchFn(this.manifestUrl, { cache: 'no-cache' });
        if (!res.ok) return null;
        const json = (await res.json()) as PregenAudioManifest;
        if (
          !json ||
          typeof json !== 'object' ||
          json.voiceId !== EXPECTED_PIPER_VOICE_ID ||
          (this.manifestUrl === PREGEN_V2_MANIFEST_URL && json.version !== EXPECTED_PREGEN_VERSION) ||
          !json.entries ||
          typeof json.entries !== 'object'
        ) {
          return null;
        }
        this.manifest = json;
        return json;
      } catch {
        return null;
      }
    })();

    const loaded = await this.manifestPromise;
    if (!loaded) {
      // Allow a future retry on next user click if transient offline error occurred,
      // but never loop inside the same click.
      this.manifestPromise = null;
    }
    return loaded;
  }

  public async hasPregenEntry(normalizedText: string): Promise<boolean> {
    const manifest = await this.ensureManifest();
    if (!manifest) return false;
    const hash = await computeChunkContentHash(normalizedText);
    if (this.failedHashes.has(hash)) return false;
    const entry = manifest.entries[hash];
    return Boolean(entry && entry.text === normalizedText);
  }

  public async tryFetchPregenAudio(
    normalizedText: string,
    signal?: AbortSignal
  ): Promise<PregenAudioLookupResult | null> {
    if (!normalizedText || signal?.aborted) return null;

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const manifest = await this.ensureManifest();
    if (!manifest || signal?.aborted) return null;

    const hash = await computeChunkContentHash(normalizedText);
    if (signal?.aborted || this.failedHashes.has(hash)) return null;

    const entry = manifest.entries[hash];
    // Strict content-hash + exact transcript match: guarantees 0 stale/cross-booth playback
    if (!entry || entry.text !== normalizedText || typeof entry.file !== 'string' || !entry.file) {
      return null;
    }

    const cached = this.blobCache.get(hash);
    if (cached) {
      // Refresh LRU order
      this.blobCache.delete(hash);
      this.blobCache.set(hash, cached);
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        blob: cached.blob,
        hash,
        file: entry.file,
        durationSec: entry.durationSec,
        bytes: cached.blob.size,
        fetchMs: Math.round((t1 - t0) * 10) / 10,
        cacheStatus: 'PREGEN_MEM_HIT',
      };
    }

    // Deduplicate concurrent fetches for the exact same content hash (e.g. preload + click race)
    const existingFlight = this.inFlightFetches.get(hash);
    if (existingFlight) {
      return existingFlight;
    }

    const fetchWork = (async (): Promise<PregenAudioLookupResult | null> => {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), PREGEN_FETCH_TIMEOUT_MS);
      const onParentAbort = () => timeoutController.abort();
      signal?.addEventListener('abort', onParentAbort, { once: true });

      try {
        const res = await this.fetchFn(entry.file, { signal: timeoutController.signal });
        if (!res.ok) {
          this.failedHashes.add(hash);
          return null;
        }
        const buf = await res.arrayBuffer();
        if (signal?.aborted) return null;

        if (entry.mimeType === 'audio/wav' && !isValidWavArrayBuffer(buf)) {
          this.failedHashes.add(hash);
          return null;
        }
        if (buf.byteLength <= 44) {
          this.failedHashes.add(hash);
          return null;
        }

        const blob = new Blob([buf], { type: entry.mimeType || 'audio/wav' });
        if (this.blobCache.size >= MAX_PREGEN_RAM_ENTRIES) {
          const oldestKey = this.blobCache.keys().next().value;
          if (oldestKey) this.blobCache.delete(oldestKey);
        }
        this.blobCache.set(hash, { blob, entry });

        const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        return {
          blob,
          hash,
          file: entry.file,
          durationSec: entry.durationSec,
          bytes: blob.size,
          fetchMs: Math.round((t1 - t0) * 10) / 10,
          cacheStatus: 'PREGEN_NET_HIT',
        };
      } catch {
        if (!signal?.aborted) {
          this.failedHashes.add(hash);
        }
        return null;
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onParentAbort);
      }
    })();

    this.inFlightFetches.set(hash, fetchWork);
    try {
      return await fetchWork;
    } finally {
      this.inFlightFetches.delete(hash);
    }
  }
}

export const npcHybridTtsEngine = new NpcHybridTtsEngine({
  manifestUrl: PREGEN_V2_MANIFEST_URL,
});
