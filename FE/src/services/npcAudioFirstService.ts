import { API_BASE_URL } from '../config/apiConfig';
import { v28AudioApi, type V28HybridAudioAsset } from './v28Api';

const MAX_AUDIO_BLOB_CACHE_ENTRIES = 24; // Bounded RAM cache — NEVER preloads all 153 products
const BACKEND_TTS_UNAVAILABLE_COOLDOWN_MS = 60_000;

export interface ResolvedNpcAudioBlob {
  blob: Blob;
  cacheKey: string;
  source: 'uploaded' | 'pre_generated' | 'cached' | 'synthesized';
  provider: string;
  voiceId: string;
  audioId: string;
  audioUrl: string;
}

/**
 * Audio-First Frontend Playback Resolver (Phase 1.3 & 1.6).
 *
 * Priority:
 * 1. In-memory bounded LRU Blob cache (0 network, 0 TTS calls on pause/resume!)
 * 2. Pre-existing backend audio (Admin uploaded > pre-generated > cached) via `audioUrl`
 * 3. Backend Multi-Provider Hybrid TTS (`POST /api/v28/tts/synthesize`: Gemini -> Vbee -> Edge)
 * 4. Returns `null` when unavailable so caller can cleanly fall back to legacy Supertonic / Hybrid Piper
 *    or keep subtitles running without crashing.
 */
export class NpcAudioFirstService {
  private readonly blobCache = new Map<string, ResolvedNpcAudioBlob>();
  private readonly inFlight = new Map<string, Promise<ResolvedNpcAudioBlob | null>>();
  private backendSynthUnavailableUntil = 0;

  public resetForTests(): void {
    this.blobCache.clear();
    this.inFlight.clear();
    this.backendSynthUnavailableUntil = 0;
  }

  public getCacheSize(): number {
    return this.blobCache.size;
  }

  private getCached(key: string): ResolvedNpcAudioBlob | null {
    const hit = this.blobCache.get(key);
    if (!hit) return null;
    this.blobCache.delete(key);
    this.blobCache.set(key, hit);
    return hit;
  }

  private putCached(key: string, val: ResolvedNpcAudioBlob): void {
    if (this.blobCache.has(key)) {
      this.blobCache.delete(key);
    } else if (this.blobCache.size >= MAX_AUDIO_BLOB_CACHE_ENTRIES) {
      const oldest = this.blobCache.keys().next().value;
      if (oldest) this.blobCache.delete(oldest);
    }
    this.blobCache.set(key, val);
  }

  public async fetchAudioBlobFromUrl(params: {
    audioId: string;
    audioUrl: string;
    source: 'uploaded' | 'pre_generated' | 'cached' | 'synthesized';
    provider: string;
    voiceId: string;
    signal?: AbortSignal;
  }): Promise<ResolvedNpcAudioBlob | null> {
    const cacheKey = `v28-audio:${params.audioId}`;
    const hit = this.getCached(cacheKey);
    if (hit) return hit;

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      const shared = await existing;
      if (params.signal?.aborted) return null;
      return shared;
    }

    const work = (async (): Promise<ResolvedNpcAudioBlob | null> => {
      try {
        const fullUrl = params.audioUrl.startsWith('http')
          ? params.audioUrl
          : `${API_BASE_URL}${params.audioUrl}`;
        const res = await fetch(fullUrl, {
          method: 'GET',
          signal: params.signal,
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob || blob.size < 32) return null;
        const resolved: ResolvedNpcAudioBlob = {
          blob,
          cacheKey,
          source: params.source,
          provider: params.provider,
          voiceId: params.voiceId,
          audioId: params.audioId,
          audioUrl: params.audioUrl,
        };
        this.putCached(cacheKey, resolved);
        return resolved;
      } catch {
        return null;
      }
    })();

    this.inFlight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Resolves audio-first for a specific product, booth, or welcome greeting without triggering TTS.
   */
  public async tryResolvePreexistingEntityAudio(params: {
    entityType: 'product' | 'booth' | 'welcome';
    entityId: string;
    slotKey?: string;
    signal?: AbortSignal;
  }): Promise<ResolvedNpcAudioBlob | null> {
    if (params.signal?.aborted) return null;
    try {
      const res = await v28AudioApi.resolveAudioFirst({
        entityType: params.entityType,
        entityId: params.entityId,
        slotKey: params.slotKey,
      });
      if (!res.found || !res.asset || !res.source || res.asset.needsUpdate) {
        return null;
      }
      return this.fetchAudioBlobFromUrl({
        audioId: res.asset.audioId,
        audioUrl: res.asset.audioUrl,
        source: res.source,
        provider: res.asset.provider,
        voiceId: res.asset.voiceId,
        signal: params.signal,
      });
    } catch {
      return null;
    }
  }

  /**
   * Attempts backend multi-provider cached TTS synthesis (`Gemini -> Vbee -> Edge`).
   * Uses a 60s circuit breaker when all backend providers are unavailable/unconfigured
   * so legacy fallback engages immediately without stalling the user.
   */
  public async trySynthesizeViaBackendHybrid(params: {
    text: string;
    entityType?: 'product' | 'booth' | 'welcome' | 'faq';
    entityId?: string;
    slotKey?: string;
    signal?: AbortSignal;
  }): Promise<ResolvedNpcAudioBlob | null> {
    if (params.signal?.aborted) return null;
    if (Date.now() < this.backendSynthUnavailableUntil) return null;

    const clean = params.text.replace(/\s+/g, ' ').trim();
    if (!clean) return null;

    const memKey = `v28-synth:${params.entityType || 'faq'}:${params.entityId || 'rt'}:${clean}`;
    const memHit = this.getCached(memKey);
    if (memHit) return memHit;

    try {
      const res = await v28AudioApi.synthesizeRealtime(
        {
          text: clean,
          entityType: params.entityType,
          entityId: params.entityId,
          slotKey: params.slotKey,
        },
        params.signal
      );
      const asset: V28HybridAudioAsset | undefined = res?.asset;
      if (!asset?.audioUrl) return null;
      const fetched = await this.fetchAudioBlobFromUrl({
        audioId: asset.audioId,
        audioUrl: asset.audioUrl,
        source: res.source,
        provider: asset.provider,
        voiceId: asset.voiceId,
        signal: params.signal,
      });
      if (fetched) {
        this.putCached(memKey, fetched);
      }
      return fetched;
    } catch {
      if (!params.signal?.aborted) {
        this.backendSynthUnavailableUntil = Date.now() + BACKEND_TTS_UNAVAILABLE_COOLDOWN_MS;
      }
      return null;
    }
  }
}

export const npcAudioFirstService = new NpcAudioFirstService();
