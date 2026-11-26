import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import type { ExhibitionBoothPlacementView, ExhibitionVersionDetail } from './exhibitionService.js';
import { MultiProviderTtsService } from './tts/multiProviderTtsService.js';
import {
  detectAudioMimeFromMagicBytes,
  estimateAudioDurationSec,
  isValidAudioBuffer,
  redactTtsSecrets,
  TtsProviderError,
  type TtsProviderId,
} from './tts/ttsTypes.js';
import {
  PostgresAudioStorageAdapter,
  TieredAudioStorageAdapter,
} from './tts/audioStorageAdapters.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AUDIO_DIR = path.resolve(MODULE_DIR, '..', '..', '..', 'data', 'v28_audio');

export const MAX_ADMIN_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/webm',
]);

/**
 * Validates that a buffer is a non-empty, browser-decodable RIFF/WAVE file (duration > 0).
 */
export function isValidWavBuffer(buf: Buffer | null | undefined): boolean {
  if (!buf || buf.length <= 44) return false;
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return false;
  if (buf.subarray(8, 12).toString('ascii') !== 'WAVE') return false;
  return true;
}

/**
 * Ensures any audio payload (pre-wrapped WAV OR raw PCM L16 from Gemini TTS)
 * is stored as a valid RIFF/WAVE file with accurate header fields.
 */
export function ensureValidWavBuffer(
  raw: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): Buffer {
  if (isValidWavBuffer(raw)) return raw;
  const dataBytes = raw.length;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, raw]);
}

export const VERIFIED_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';

export function getConfiguredGeminiTtsModel(): string {
  return (process.env.V28_GEMINI_TTS_MODEL || '').trim() || VERIFIED_GEMINI_TTS_MODEL;
}

export function getConfiguredGeminiTtsVoice(): string {
  return (process.env.V28_GEMINI_TTS_VOICE || '').trim() || 'Kore';
}

export function getConfiguredGeminiTtsStyle(): string {
  return (
    (process.env.V28_GEMINI_TTS_STYLE || '').trim() ||
    'warm, natural, professional Vietnamese female exhibition consultant'
  );
}

export type AudioEntityType = 'booth' | 'product' | 'welcome' | 'faq';
export type AudioSourceType = 'uploaded' | 'pre_generated' | 'cached';
export type AudioBusinessStatus = 'missing' | 'generating' | 'ready' | 'needs_update' | 'failed';
export type AudioMode = 'AUTO' | 'AI_GENERATED' | 'RECORDED';

export interface EntityAudioConfigRecord {
  entityType: 'product' | 'booth' | 'welcome';
  entityId: string;
  audioMode: AudioMode;
  preferredProvider: string;
  modelId: string;
  voiceId: string;
  speed: number;
  style: string;
  customTranscript: string;
  updatedAt: string;
}

export interface AudioAssetRecord {
  audioId: string;
  entityType: AudioEntityType;
  entityId: string;
  slotKey: string;
  contentHash: string;
  language: string;
  voiceId: string;
  modelId: string;
  provider: string;
  sourceType: AudioSourceType;
  speed: number;
  style: string;
  configVersion: string;
  needsUpdate: boolean;
  isActive: boolean;
  originalFilename: string;
  errorMessage: string;
  storageKey: string;
  mimeType: string;
  durationSec: number;
  transcript: string;
  status: 'ready' | 'pending' | 'generating' | 'failed';
  createdAt: string;
  updatedAt: string;
  audioUrl: string;
}

export interface AdminAudioItemSummary {
  entityType: 'product' | 'booth' | 'welcome';
  entityId: string;
  slotKey: string;
  entityName: string;
  imageUrl: string;
  subtitle: string;
  audioMode: AudioMode;
  preferredProvider: string;
  configuredModelId: string;
  configuredVoiceId: string;
  configuredSpeed: number;
  configuredStyle: string;
  defaultTranscript: string;
  transcript: string;
  status: AudioBusinessStatus;
  sourceType: AudioSourceType | null;
  provider: string | null;
  modelId: string | null;
  voiceId: string | null;
  mimeType: string | null;
  durationSec: number;
  needsUpdate: boolean;
  originalFilename: string;
  errorMessage: string;
  audioId: string | null;
  audioUrl: string | null;
  updatedAt: string | null;
}

export interface AudioStorageAdapter {
  readonly driverName: string;
  put(storageKey: string, buffer: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer | null>;
  exists(storageKey: string): Promise<boolean>;
  delete?(storageKey: string): Promise<void>;
}

/**
 * Local Development / Plesk Storage Adapter — writes cached/uploaded audio to BE/data/v28_audio/
 * (NEVER stores raw binary audio inside SQLite!).
 */
export class LocalAudioStorageAdapter implements AudioStorageAdapter {
  public readonly driverName = 'local_fs';
  private readonly baseDir: string;

  constructor(baseDir = DEFAULT_AUDIO_DIR) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(storageKey: string): string {
    const safeName = storageKey.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.baseDir, safeName);
  }

  public async put(storageKey: string, buffer: Buffer): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    const tmpPath = `${filePath}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    await fs.promises.writeFile(tmpPath, buffer);
    await fs.promises.rename(tmpPath, filePath);
  }

  public async get(storageKey: string): Promise<Buffer | null> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      return await fs.promises.readFile(filePath);
    } catch {
      return null;
    }
  }

  public async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolveSafePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  public async delete(storageKey: string): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // ignore ENOENT
    }
  }

  /**
   * Validates the leading magic bytes (WAV / MP3 / OGG / M4A / WebM) without loading the whole file into RAM.
   */
  public async getFileStreamInfo(
    storageKey: string,
    expectedMime?: string
  ): Promise<{ filePath: string; size: number; validAudio: boolean; validWav: boolean } | null> {
    const filePath = this.resolveSafePath(storageKey);
    let fh: fs.promises.FileHandle | null = null;
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || stat.size < 16) {
        return { filePath, size: stat.size, validAudio: false, validWav: false };
      }
      fh = await fs.promises.open(filePath, 'r');
      const headerLen = Math.min(64, stat.size);
      const header = Buffer.alloc(headerLen);
      const { bytesRead } = await fh.read(header, 0, headerLen, 0);
      const slice = header.subarray(0, bytesRead);
      const validWav =
        bytesRead >= 44 &&
        slice.toString('ascii', 0, 4) === 'RIFF' &&
        slice.toString('ascii', 8, 12) === 'WAVE' &&
        slice.readUInt32LE(40) > 0;
      const detected = detectAudioMimeFromMagicBytes(slice);
      const validAudio = validWav || Boolean(detected && (!expectedMime || isValidAudioBuffer(slice, expectedMime)));
      return { filePath, size: stat.size, validAudio, validWav };
    } catch {
      return null;
    } finally {
      await fh?.close().catch(() => { });
    }
  }
}

export function createAudioStorageAdapterFromEnv(localDir = DEFAULT_AUDIO_DIR): AudioStorageAdapter {
  const local = new LocalAudioStorageAdapter(localDir);
  const driver = (process.env.TTS_STORAGE_DRIVER || 'auto').trim().toLowerCase();
  const pgUrl = (process.env.DATABASE_URL || process.env.CLOUD_DB_URL || '').trim();
  if (driver === 'local_fs' || !pgUrl || process.env.VITEST) {
    return local;
  }
  const pg = new PostgresAudioStorageAdapter(pgUrl);
  if (driver === 'postgres') {
    return pg;
  }
  return new TieredAudioStorageAdapter(local, pg);
}

/**
 * Extracts base64 audio payload from a raw Gemini Interactions REST API JSON response.
 */
export function extractGeminiInteractionAudioBase64(payload: unknown): {
  data: string;
  mimeType?: string;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.steps)) {
    for (let i = obj.steps.length - 1; i >= 0; i--) {
      const step = obj.steps[i] as Record<string, unknown> | undefined;
      if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
      for (let j = step.content.length - 1; j >= 0; j--) {
        const part = step.content[j] as Record<string, unknown> | undefined;
        if (part && part.type === 'audio' && typeof part.data === 'string' && part.data.length > 0) {
          return {
            data: part.data,
            mimeType: typeof part.mime_type === 'string' ? part.mime_type : undefined,
          };
        }
      }
    }
  }

  if (Array.isArray(obj.outputs)) {
    for (let i = obj.outputs.length - 1; i >= 0; i--) {
      const part = obj.outputs[i] as Record<string, unknown> | undefined;
      if (part && part.type === 'audio' && typeof part.data === 'string' && part.data.length > 0) {
        return {
          data: part.data,
          mimeType: typeof part.mime_type === 'string' ? part.mime_type : undefined,
        };
      }
    }
  }

  const outAudio = obj.output_audio as Record<string, unknown> | undefined;
  if (outAudio && typeof outAudio.data === 'string' && outAudio.data.length > 0) {
    return {
      data: outAudio.data,
      mimeType: typeof outAudio.mime_type === 'string' ? outAudio.mime_type : undefined,
    };
  }

  return null;
}

/**
 * Build a valid, lightweight RIFF PCM WAV buffer (24 kHz mono 16-bit) for zero-cost local fallback
 * when no cloud TTS provider is configured or live synthesis is disabled.
 */
function synthesizeFallbackWav(transcript: string): { buffer: Buffer; durationSec: number } {
  const sampleRate = 24000;
  const durationSec = Math.max(0.6, Math.min(2.4, Math.round((transcript.length / 60) * 10) / 10));
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  const freq = 440;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 4.5) * 0.12;
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * env * 32767);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return { buffer: buf, durationSec };
}

export function normalizeSpeechText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function computeAudioContentHash(params: {
  text: string;
  language: string;
  voiceId: string;
  modelId: string;
  mimeType: string;
  provider?: string;
  speed?: number;
  style?: string;
  configVersion?: string;
}): string {
  const normalized = normalizeSpeechText(params.text);
  const extras =
    params.provider || params.speed !== undefined || params.style || params.configVersion
      ? `|${params.provider || ''}|${(params.speed ?? 1.0).toFixed(2)}|${params.style || ''}|${params.configVersion || 'v1'}`
      : '';
  return crypto
    .createHash('sha256')
    .update(`${normalized}|${params.language}|${params.voiceId}|${params.modelId}|${params.mimeType}${extras}`)
    .digest('hex')
    .slice(0, 32);
}

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('webm')) return 'webm';
  return 'wav';
}

export const WELCOME_ENTITY_ID = 'welcome-plaza-default';
export const DEFAULT_WELCOME_TRANSCRIPT =
  'Chào mừng quý khách đến với Triển lãm Số Con Đường Nông Sản Việt Nam. Em là hướng dẫn viên triển lãm, rất hân hạnh được đồng hành cùng quý khách khám phá các gian hàng và sản phẩm đặc sắc hôm nay.';

export class V28AudioCacheService {
  public readonly storage: AudioStorageAdapter;
  public readonly ttsService: MultiProviderTtsService;
  private readonly inFlight = new Map<string, Promise<{ asset: AudioAssetRecord; cacheHit: boolean }>>();
  public readonly metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    generationFailures: 0,
    inFlightDeduplicated: 0,
    uploadedHits: 0,
    pregeneratedHits: 0,
  };

  constructor(
    private readonly v28Db: V28CatalogDatabase,
    storage?: AudioStorageAdapter,
    ttsService?: MultiProviderTtsService
  ) {
    this.storage = storage || createAudioStorageAdapterFromEnv();
    this.ttsService = ttsService || new MultiProviderTtsService();
  }

  private get db() {
    return this.v28Db.getConnection();
  }

  private mapRow(r: Record<string, unknown>): AudioAssetRecord {
    const audioId = String(r.audio_id);
    const modelId = String(r.model_id || '');
    const inferredProvider =
      String(r.provider || '') ||
      (modelId.includes('local-fallback') ? 'local-fallback' : 'gemini');
    return {
      audioId,
      entityType: String(r.entity_type) as AudioEntityType,
      entityId: String(r.entity_id),
      slotKey: String(r.slot_key),
      contentHash: String(r.content_hash),
      language: String(r.language || 'vi-VN'),
      voiceId: String(r.voice_id || ''),
      modelId,
      provider: inferredProvider,
      sourceType: (String(r.source_type || 'pre_generated') as AudioSourceType),
      speed: Number(r.speed ?? 1.0),
      style: String(r.style || ''),
      configVersion: String(r.config_version || 'v1'),
      needsUpdate: Boolean(Number(r.needs_update || 0)),
      isActive: r.is_active === undefined ? true : Boolean(Number(r.is_active)),
      originalFilename: String(r.original_filename || ''),
      errorMessage: String(r.error_message || ''),
      storageKey: String(r.storage_key),
      mimeType: String(r.mime_type || 'audio/wav'),
      durationSec: Number(r.duration_sec || 0),
      transcript: String(r.transcript || ''),
      status: String(r.status || 'ready') as AudioAssetRecord['status'],
      createdAt: String(r.created_at || ''),
      updatedAt: String(r.updated_at || r.created_at || ''),
      audioUrl: `/api/v28/audio/${encodeURIComponent(audioId)}/stream`,
    };
  }

  public getEntityAudioConfig(
    entityType: AudioEntityType,
    entityId: string
  ): EntityAudioConfigRecord {
    const row = this.db
      .prepare('SELECT * FROM audio_entity_configs WHERE entity_type = ? AND entity_id = ?')
      .get(entityType, entityId) as Record<string, unknown> | undefined;
    if (row) {
      const rawMode = String(row.audio_mode || 'AUTO').toUpperCase();
      const audioMode: AudioMode =
        rawMode === 'AI_GENERATED' || rawMode === 'RECORDED' ? rawMode : 'AUTO';
      return {
        entityType: (entityType === 'faq' ? 'product' : entityType) as 'product' | 'booth' | 'welcome',
        entityId,
        audioMode,
        preferredProvider: String(row.preferred_provider || ''),
        modelId: String(row.model_id || ''),
        voiceId: String(row.voice_id || ''),
        speed: Number(row.speed ?? 1.0),
        style: String(row.style || ''),
        customTranscript: String(row.custom_transcript || ''),
        updatedAt: String(row.updated_at || ''),
      };
    }
    return {
      entityType: (entityType === 'faq' ? 'product' : entityType) as 'product' | 'booth' | 'welcome',
      entityId,
      audioMode: 'AUTO',
      preferredProvider: '',
      modelId: '',
      voiceId: '',
      speed: 1.0,
      style: '',
      customTranscript: '',
      updatedAt: '',
    };
  }

  /**
   * Sets the audio mode (`AUTO` | `AI_GENERATED` | `RECORDED`) and optional voice/transcript preferences
   * for a single entity. NEVER deletes old audio and NEVER auto-generates new audio on mode switch.
   */
  public setEntityAudioMode(params: {
    entityType: 'product' | 'booth' | 'welcome';
    entityId: string;
    audioMode: AudioMode;
    preferredProvider?: string;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
    customTranscript?: string;
  }): EntityAudioConfigRecord {
    const existing = this.getEntityAudioConfig(params.entityType, params.entityId);
    const nowIso = new Date().toISOString();
    const nextProvider =
      params.preferredProvider !== undefined ? params.preferredProvider.trim() : existing.preferredProvider;
    const nextModel = params.modelId !== undefined ? params.modelId.trim() : existing.modelId;
    const nextVoice = params.voiceId !== undefined ? params.voiceId.trim() : existing.voiceId;
    const nextSpeed =
      params.speed !== undefined && Number.isFinite(params.speed)
        ? Math.max(0.5, Math.min(2.0, Number(params.speed)))
        : existing.speed;
    const nextStyle = params.style !== undefined ? params.style.trim() : existing.style;
    const nextTranscript =
      params.customTranscript !== undefined ? params.customTranscript.trim() : existing.customTranscript;

    this.db
      .prepare(
        `INSERT INTO audio_entity_configs (
          entity_type, entity_id, audio_mode, preferred_provider, model_id, voice_id, speed, style, custom_transcript, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          audio_mode = excluded.audio_mode,
          preferred_provider = excluded.preferred_provider,
          model_id = excluded.model_id,
          voice_id = excluded.voice_id,
          speed = excluded.speed,
          style = excluded.style,
          custom_transcript = excluded.custom_transcript,
          updated_at = excluded.updated_at`
      )
      .run(
        params.entityType,
        params.entityId,
        params.audioMode,
        nextProvider,
        nextModel,
        nextVoice,
        nextSpeed,
        nextStyle,
        nextTranscript,
        nowIso
      );

    return this.getEntityAudioConfig(params.entityType, params.entityId);
  }

  public bulkSetEntityAudioMode(params: {
    entityType: 'product' | 'booth' | 'welcome';
    entityIds: string[];
    audioMode: AudioMode;
    preferredProvider?: string;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
  }): { updatedCount: number } {
    let updatedCount = 0;
    for (const id of params.entityIds) {
      const cleanId = String(id || '').trim();
      if (!cleanId) continue;
      this.setEntityAudioMode({
        entityType: params.entityType,
        entityId: cleanId,
        audioMode: params.audioMode,
        preferredProvider: params.preferredProvider,
        modelId: params.modelId,
        voiceId: params.voiceId,
        speed: params.speed,
        style: params.style,
      });
      updatedCount++;
    }
    return { updatedCount };
  }

  /**
   * Audio-First Lookup (respects per-entity `audioMode`):
   * - RECORDED: strictly serves active admin `uploaded` audio (never falls back to TTS).
   * - AI_GENERATED / AUTO: Priority 1 `uploaded` -> Priority 2 `pre_generated` -> Priority 3 `cached`.
   * NEVER triggers any TTS API call.
   */
  public async resolveAudioFirst(params: {
    entityType: AudioEntityType;
    entityId: string;
    slotKey?: string;
    expectedContentHash?: string;
  }): Promise<{ asset: AudioAssetRecord; source: 'uploaded' | 'pre_generated' | 'cached' } | null> {
    const slotKey = params.slotKey || (params.entityType === 'product' ? 'intro' : 'welcome');
    const entityCfg = this.getEntityAudioConfig(params.entityType, params.entityId);

    // Priority 1: Admin uploaded audio (always wins unless marked needs_update or inactive)
    const uploadedRow = this.db
      .prepare(
        `SELECT * FROM audio_assets
         WHERE entity_type = ? AND entity_id = ? AND source_type = 'uploaded'
           AND is_active = 1 AND status = 'ready' AND needs_update = 0
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`
      )
      .get(params.entityType, params.entityId) as Record<string, unknown> | undefined;

    if (uploadedRow) {
      const buf = await this.storage.get(String(uploadedRow.storage_key));
      if (isValidAudioBuffer(buf)) {
        this.metrics.cacheHits++;
        this.metrics.uploadedHits++;
        return { asset: this.mapRow(uploadedRow), source: 'uploaded' };
      }
    }

    // In strict RECORDED mode, never substitute an AI/TTS clip when the recording is missing or stale
    if (entityCfg.audioMode === 'RECORDED') {
      return null;
    }

    // Priority 2: Valid pre-generated audio (matches slotKey or entity intro, not stale, real speech)
    const pregenRows = this.db
      .prepare(
        `SELECT * FROM audio_assets
         WHERE entity_type = ? AND entity_id = ? AND (slot_key = ? OR slot_key = 'intro')
           AND source_type = 'pre_generated' AND is_active = 1 AND status = 'ready' AND needs_update = 0
           AND model_id NOT LIKE '%local-fallback%' AND provider != 'local-fallback'
         ORDER BY CASE WHEN slot_key = ? THEN 0 ELSE 1 END, updated_at DESC, rowid DESC LIMIT 3`
      )
      .all(params.entityType, params.entityId, slotKey, slotKey) as Array<Record<string, unknown>>;

    for (const row of pregenRows) {
      if (params.expectedContentHash && String(row.content_hash) !== params.expectedContentHash) {
        continue;
      }
      const buf = await this.storage.get(String(row.storage_key));
      if (isValidAudioBuffer(buf)) {
        this.metrics.cacheHits++;
        this.metrics.pregeneratedHits++;
        return { asset: this.mapRow(row), source: 'pre_generated' };
      }
    }

    // Priority 3: Cached TTS audio (matching exact content hash if provided)
    if (params.expectedContentHash) {
      const cachedRow = this.db
        .prepare(
          `SELECT * FROM audio_assets
           WHERE content_hash = ? AND is_active = 1 AND status = 'ready' AND needs_update = 0
             AND model_id NOT LIKE '%local-fallback%' AND provider != 'local-fallback'
           ORDER BY updated_at DESC, rowid DESC LIMIT 1`
        )
        .get(params.expectedContentHash) as Record<string, unknown> | undefined;
      if (cachedRow) {
        const buf = await this.storage.get(String(cachedRow.storage_key));
        if (isValidAudioBuffer(buf)) {
          this.metrics.cacheHits++;
          return { asset: this.mapRow(cachedRow), source: 'cached' };
        }
      }
    }

    return null;
  }

  /**
   * Realtime / Dynamic Cached TTS Synthesis (Single-Flight + Multi-Provider Fallback):
   * Checks persistent cache by content hash across all visitors before calling Gemini -> Vbee -> Edge.
   */
  public async synthesizeRealtimeCached(params: {
    text: string;
    entityType?: AudioEntityType;
    entityId?: string;
    slotKey?: string;
    language?: string;
    modelId?: string;
    voiceId?: string;
    voiceProfile?: 'female_standard' | 'male_standard' | 'female_warm';
    speed?: number;
    style?: string;
    preferredProvider?: TtsProviderId;
    sourceType?: AudioSourceType;
    allowFallback?: boolean;
    bypassPermissionCooldown?: boolean;
    signal?: AbortSignal;
  }): Promise<{ asset: AudioAssetRecord; cacheHit: boolean; fallbackUsed: boolean }> {
    const normalized = normalizeSpeechText(params.text);
    const cfg = this.ttsService.getConfigSnapshot();
    const language = params.language || 'vi-VN';
    const speed = Number((params.speed ?? 1.0).toFixed(2));
    const style = params.style ?? cfg.geminiStyle;
    const entityType: AudioEntityType = params.entityType || 'faq';
    const entityId = params.entityId || 'realtime';
    const slotKey = params.slotKey || 'realtime';
    const providerKey = params.preferredProvider || cfg.providerPriority[0] || 'gemini';
    const modelKey = params.modelId || cfg.geminiModel;
    const voiceKey = params.voiceProfile || params.voiceId || cfg.geminiVoice;

    const contentHash = computeAudioContentHash({
      text: normalized,
      language,
      voiceId: voiceKey,
      modelId: modelKey,
      mimeType: 'auto',
      provider: providerKey,
      speed,
      style,
      configVersion: cfg.configVersion,
    });

    // Single-flight deduplication across concurrent visitors
    const dedupeKey = `rt:${contentHash}`;
    const existingFlight = this.inFlight.get(dedupeKey);
    if (existingFlight) {
      this.metrics.inFlightDeduplicated++;
      const res = await existingFlight;
      return { ...res, fallbackUsed: false };
    }

    let fallbackUsed = false;
    const work = (async (): Promise<{ asset: AudioAssetRecord; cacheHit: boolean }> => {
      // Cross-visitor cache lookup by content_hash
      if (cfg.cacheEnabled) {
        const cachedRow = this.db
          .prepare(
            `SELECT * FROM audio_assets
             WHERE content_hash = ? AND is_active = 1 AND status = 'ready' AND needs_update = 0
               AND model_id NOT LIKE '%local-fallback%' AND provider != 'local-fallback'
             ORDER BY updated_at DESC, rowid DESC LIMIT 1`
          )
          .get(contentHash) as Record<string, unknown> | undefined;

        if (cachedRow) {
          const buf = await this.storage.get(String(cachedRow.storage_key));
          if (isValidAudioBuffer(buf)) {
            this.metrics.cacheHits++;
            return { asset: this.mapRow(cachedRow), cacheHit: true };
          }
          this.db
            .prepare(`UPDATE audio_assets SET status = 'failed', error_message = 'Missing audio blob' WHERE audio_id = ?`)
            .run(String(cachedRow.audio_id));
        }
      }

      this.metrics.cacheMisses++;
      const outcome = await this.ttsService.synthesizeWithFallback({
        text: normalized,
        language,
        modelId: params.modelId,
        voiceId: params.voiceId,
        voiceProfile: params.voiceProfile,
        speed,
        style,
        preferredProvider: params.preferredProvider,
        allowFallback: params.allowFallback,
        bypassPermissionCooldown: params.bypassPermissionCooldown,
        signal: params.signal,
      });
      fallbackUsed = outcome.fallbackUsed;

      const synth = outcome.result;
      const ext = extensionForMime(synth.mimeType);
      const audioId = `aud-${crypto.randomBytes(6).toString('hex')}`;
      const storageKey = `${entityType}_${entityId}_${slotKey}_${contentHash}.${ext}`;
      const nowIso = new Date().toISOString();

      await this.storage.put(storageKey, synth.buffer);

      // Deactivate superseded active TTS rows for same (entityType, entityId, slotKey) when pre-generating
      if (params.sourceType === 'pre_generated') {
        this.db
          .prepare(
            `UPDATE audio_assets
             SET is_active = 0, updated_at = ?
             WHERE entity_type = ? AND entity_id = ? AND slot_key = ? AND source_type != 'uploaded'`
          )
          .run(nowIso, entityType, entityId, slotKey);
      }

      this.db
        .prepare(
          `INSERT OR REPLACE INTO audio_assets (
            audio_id, entity_type, entity_id, slot_key, content_hash,
            language, voice_id, model_id, provider, source_type, speed, style, config_version,
            needs_update, is_active, original_filename, error_message,
            storage_key, mime_type, duration_sec, transcript, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, '', '', ?, ?, ?, ?, 'ready', ?, ?)`
        )
        .run(
          audioId,
          entityType,
          entityId,
          slotKey,
          contentHash,
          synth.language,
          synth.voiceId,
          synth.modelId,
          synth.provider,
          params.sourceType || 'cached',
          speed,
          style,
          cfg.configVersion,
          storageKey,
          synth.mimeType,
          synth.durationSec,
          normalized,
          nowIso,
          nowIso
        );

      const row = this.db
        .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
        .get(audioId) as Record<string, unknown>;
      return { asset: this.mapRow(row), cacheHit: false };
    })();

    this.inFlight.set(dedupeKey, work);
    try {
      const res = await work;
      return { ...res, fallbackUsed };
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }

  /**
   * Ensure cached pre-generated audio exists for an entity+slot+text.
   * Audio-First: checks active uploaded/pre-generated audio first before synthesizing.
   * Preserves full backward compatibility with existing V28 callers & tests.
   */
  public async ensureCachedAudio(params: {
    entityType: AudioEntityType;
    entityId: string;
    slotKey: string;
    transcript: string;
    language?: string;
    voiceId?: string;
    modelId?: string;
    allowLiveSynthesis?: boolean;
  }): Promise<{ asset: AudioAssetRecord; cacheHit: boolean }> {
    // Priority 1 (Audio-First): ANY active valid real speech audio (uploaded > pre_generated > cached)
    // immediately wins — NEVER return a legacy local-fallback chime when real speech audio already exists!
    const preexisting = await this.resolveAudioFirst({
      entityType: params.entityType,
      entityId: params.entityId,
      slotKey: params.slotKey,
    });
    if (preexisting && !preexisting.asset.needsUpdate) {
      return { asset: preexisting.asset, cacheHit: true };
    }

    const language = params.language || 'vi-VN';
    const voiceId = params.voiceId || getConfiguredGeminiTtsVoice();
    const style = getConfiguredGeminiTtsStyle();
    const envLiveEnabled =
      this.ttsService.hasAnyAvailableProvider() &&
      (process.env.V28_ENABLE_LIVE_AI === 'true' ||
        process.env.TTS_EDGE_UNOFFICIAL_ENABLED === 'true' ||
        Boolean(process.env.VBEE_API_TOKEN || process.env.AZURE_SPEECH_KEY));
    const liveSynthesisAllowed = envLiveEnabled && params.allowLiveSynthesis !== false;
    const configuredModel = getConfiguredGeminiTtsModel();
    const modelId =
      params.modelId ||
      (liveSynthesisAllowed ? configuredModel : `${configuredModel}:local-fallback`);
    const mimeType = 'audio/wav';
    const normalized = normalizeSpeechText(params.transcript);
    const contentHash = computeAudioContentHash({
      text: `${normalized}|${style}`,
      language,
      voiceId,
      modelId,
      mimeType,
    });

    const dedupeKey = `${params.entityType}:${params.entityId}:${params.slotKey}:${contentHash}`;
    const existingFlight = this.inFlight.get(dedupeKey);
    if (existingFlight) {
      this.metrics.inFlightDeduplicated++;
      return existingFlight;
    }

    const work = (async (): Promise<{ asset: AudioAssetRecord; cacheHit: boolean }> => {
      const existing = this.db
        .prepare(
          `SELECT * FROM audio_assets
           WHERE entity_type = ? AND entity_id = ? AND slot_key = ? AND content_hash = ? AND status = 'ready' AND is_active = 1 AND needs_update = 0`
        )
        .get(params.entityType, params.entityId, params.slotKey, contentHash) as
        | Record<string, unknown>
        | undefined;

      if (existing) {
        const storageKey = String(existing.storage_key);
        const cachedBuf = await this.storage.get(storageKey);
        if (isValidAudioBuffer(cachedBuf)) {
          this.metrics.cacheHits++;
          return { asset: this.mapRow(existing), cacheHit: true };
        }
        this.db
          .prepare(`UPDATE audio_assets SET status = 'failed' WHERE audio_id = ?`)
          .run(String(existing.audio_id));
      }

      // Also check if an already pre-generated real-speech asset exists for this entity+slot (from Admin)
      if (preexisting && preexisting.source === 'pre_generated') {
        return { asset: preexisting.asset, cacheHit: true };
      }

      // Reuse existing failed row for same (entity_type, entity_id, slot_key, content_hash) to prevent duplicate failed records
      const existingSameHash = this.db
        .prepare(
          `SELECT audio_id FROM audio_assets
           WHERE entity_type = ? AND entity_id = ? AND slot_key = ? AND content_hash = ?`
        )
        .get(params.entityType, params.entityId, params.slotKey, contentHash) as { audio_id: string } | undefined;

      this.metrics.cacheMisses++;
      const audioId = existingSameHash?.audio_id || `aud-${crypto.randomBytes(6).toString('hex')}`;
      const nowIso = new Date().toISOString();
      let storageKey = `${params.entityType}_${params.entityId}_${params.slotKey}_${contentHash}.wav`;

      // State 1: PENDING
      this.db
        .prepare(
          `INSERT OR REPLACE INTO audio_assets (
            audio_id, entity_type, entity_id, slot_key, content_hash,
            language, voice_id, model_id, provider, source_type, speed, style, config_version,
            needs_update, is_active, original_filename, error_message,
            storage_key, mime_type, duration_sec, transcript, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pre_generated', 1.0, ?, 'v1', 0, 1, '', '', ?, ?, 0, ?, 'pending', ?, ?)`
        )
        .run(
          audioId,
          params.entityType,
          params.entityId,
          params.slotKey,
          contentHash,
          language,
          voiceId,
          modelId,
          liveSynthesisAllowed ? 'gemini' : 'local-fallback',
          style,
          storageKey,
          mimeType,
          normalized,
          nowIso,
          nowIso
        );

      try {
        this.db.prepare(`UPDATE audio_assets SET status = 'generating', updated_at = ? WHERE audio_id = ?`).run(nowIso, audioId);

        if (liveSynthesisAllowed) {
          const outcome = await this.ttsService.synthesizeWithFallback({
            text: normalized,
            language,
            voiceId,
            modelId: configuredModel,
            style,
          });
          const synth = outcome.result;
          const ext = extensionForMime(synth.mimeType);
          storageKey = `${params.entityType}_${params.entityId}_${params.slotKey}_${contentHash}.${ext}`;
          await this.storage.put(storageKey, synth.buffer);
          this.db
            .prepare(
              `UPDATE audio_assets
               SET duration_sec = ?, status = 'ready', provider = ?, model_id = ?, voice_id = ?,
                   mime_type = ?, storage_key = ?, error_message = '', updated_at = ?
               WHERE audio_id = ?`
            )
            .run(
              synth.durationSec,
              synth.provider,
              synth.modelId,
              synth.voiceId,
              synth.mimeType,
              storageKey,
              new Date().toISOString(),
              audioId
            );
        } else {
          const synth = synthesizeFallbackWav(normalized);
          await this.storage.put(storageKey, synth.buffer);
          this.db
            .prepare(`UPDATE audio_assets SET duration_sec = ?, status = 'ready', provider = 'local-fallback', updated_at = ? WHERE audio_id = ?`)
            .run(synth.durationSec, new Date().toISOString(), audioId);
        }
      } catch (err) {
        this.metrics.generationFailures++;
        this.db
          .prepare(`UPDATE audio_assets SET status = 'failed', error_message = ?, updated_at = ? WHERE audio_id = ?`)
          .run(redactTtsSecrets((err as Error)?.message || 'Synthesis failed').slice(0, 300), new Date().toISOString(), audioId);
        throw err;
      }

      const row = this.db
        .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
        .get(audioId) as Record<string, unknown>;
      return { asset: this.mapRow(row), cacheHit: false };
    })();

    this.inFlight.set(dedupeKey, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }

  /**
   * Marks audio assets linked to a product or booth as `needs_update = 1` when metadata changes.
   * Never deletes manual uploaded audio; Admin will see `Cần cập nhật` and can confirm or replace.
   */
  public markEntityAudioNeedsUpdate(entityType: AudioEntityType, entityId: string): { updatedCount: number } {
    const info = this.db
      .prepare(
        `UPDATE audio_assets
         SET needs_update = 1, updated_at = ?
         WHERE entity_type = ? AND entity_id = ? AND is_active = 1 AND status = 'ready'`
      )
      .run(new Date().toISOString(), entityType, entityId);
    return { updatedCount: Number(info.changes || 0) };
  }

  /**
   * Admin confirms that a manually uploaded audio is still accurate after a product edit.
   */
  public confirmUploadedAudio(audioId: string): AudioAssetRecord | null {
    const existing = this.db
      .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as Record<string, unknown> | undefined;
    if (!existing) return null;
    this.db
      .prepare(`UPDATE audio_assets SET needs_update = 0, updated_at = ? WHERE audio_id = ?`)
      .run(new Date().toISOString(), audioId);
    const updated = this.db
      .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as Record<string, unknown>;
    return this.mapRow(updated);
  }

  /**
   * Admin uploads a pre-recorded audio file (MP3/WAV/OGG/M4A/WebM) with strict MIME, size,
   * and magic-byte validation.
   */
  public async uploadAdminAudio(params: {
    entityType: 'product' | 'booth' | 'welcome';
    entityId: string;
    slotKey?: string;
    transcript?: string;
    filename: string;
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<AudioAssetRecord> {
    if (!params.fileBuffer || params.fileBuffer.length < 16) {
      const err = new Error('Tệp âm thanh trống hoặc không hợp lệ.') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (params.fileBuffer.length > MAX_ADMIN_AUDIO_UPLOAD_BYTES) {
      const err = new Error('Dung lượng tệp âm thanh vượt quá giới hạn tối đa 10 MB.') as Error & { statusCode?: number };
      err.statusCode = 413;
      throw err;
    }

    const declaredMime = String(params.mimeType || '').split(';')[0].trim().toLowerCase();
    if (declaredMime && !ALLOWED_UPLOAD_MIME_TYPES.has(declaredMime)) {
      const err = new Error(`Định dạng MIME "${declaredMime}" không được hỗ trợ. Chỉ chấp nhận MP3, WAV, OGG, M4A, WebM.`) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const detectedMime = detectAudioMimeFromMagicBytes(params.fileBuffer);
    if (!detectedMime) {
      const err = new Error('Nội dung tệp không phải là file âm thanh hợp lệ (kiểm tra magic bytes thất bại).') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const slotKey = params.slotKey || (params.entityType === 'product' ? 'intro' : 'welcome');
    const safeOrigName = path.basename(String(params.filename || 'upload')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const fileHash = crypto.createHash('sha256').update(params.fileBuffer).digest('hex').slice(0, 32);
    const ext = extensionForMime(detectedMime);
    const storageKey = `upload_${params.entityType}_${params.entityId}_${slotKey}_${fileHash}.${ext}`;
    const audioId = `aud-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const durationSec = estimateAudioDurationSec(params.fileBuffer, detectedMime, params.transcript?.length || 80);

    await this.storage.put(storageKey, params.fileBuffer);

    // Deactivate previous active assets for this entity + slot (do not destroy files shared by others)
    this.db
      .prepare(
        `UPDATE audio_assets
         SET is_active = 0, updated_at = ?
         WHERE entity_type = ? AND entity_id = ? AND slot_key = ?`
      )
      .run(nowIso, params.entityType, params.entityId, slotKey);

    this.db
      .prepare(
        `INSERT OR REPLACE INTO audio_assets (
          audio_id, entity_type, entity_id, slot_key, content_hash,
          language, voice_id, model_id, provider, source_type, speed, style, config_version,
          needs_update, is_active, original_filename, error_message,
          storage_key, mime_type, duration_sec, transcript, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'vi-VN', 'admin-recorded', 'admin-upload', 'uploaded', 'uploaded', 1.0, '', 'v1', 0, 1, ?, '', ?, ?, ?, ?, 'ready', ?, ?)`
      )
      .run(
        audioId,
        params.entityType,
        params.entityId,
        slotKey,
        fileHash,
        safeOrigName,
        storageKey,
        detectedMime,
        durationSec,
        normalizeSpeechText(params.transcript || ''),
        nowIso,
        nowIso
      );

    // Automatically mark entity audio mode as RECORDED when Admin uploads/records audio
    this.setEntityAudioMode({
      entityType: params.entityType,
      entityId: params.entityId,
      audioMode: 'RECORDED',
      customTranscript: params.transcript || undefined,
    });

    const row = this.db
      .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as Record<string, unknown>;
    return this.mapRow(row);
  }

  /**
   * Admin generates or regenerates TTS audio for a specific product, booth, or welcome greeting.
   */
  public async generateAdminAudio(params: {
    entityType: 'product' | 'booth' | 'welcome';
    entityId: string;
    slotKey?: string;
    transcript: string;
    modelId?: string;
    voiceId?: string;
    preferredProvider?: TtsProviderId;
    speed?: number;
    style?: string;
    allowFallback?: boolean;
    bypassPermissionCooldown?: boolean;
    preserveMode?: boolean;
    signal?: AbortSignal;
  }): Promise<{ asset: AudioAssetRecord; fallbackUsed: boolean }> {
    const slotKey = params.slotKey || (params.entityType === 'product' ? 'intro' : 'welcome');
    const normalized = normalizeSpeechText(params.transcript);
    if (!normalized) {
      const err = new Error('Nội dung giới thiệu không được để trống.') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const res = await this.synthesizeRealtimeCached({
      text: normalized,
      entityType: params.entityType,
      entityId: params.entityId,
      slotKey,
      modelId: params.modelId,
      voiceId: params.voiceId,
      preferredProvider: params.preferredProvider,
      speed: params.speed,
      style: params.style,
      allowFallback: params.allowFallback,
      bypassPermissionCooldown: params.bypassPermissionCooldown,
      sourceType: 'pre_generated',
      signal: params.signal,
    });

    if (!params.preserveMode) {
      this.setEntityAudioMode({
        entityType: params.entityType,
        entityId: params.entityId,
        audioMode: 'AI_GENERATED',
        preferredProvider: res.asset.provider,
        modelId: res.asset.modelId,
        voiceId: res.asset.voiceId,
        speed: res.asset.speed,
        style: res.asset.style,
        customTranscript: normalized,
      });
    }

    // Ensure this asset is linked & active for this entity+slot (even on cross-entity cache hit!)
    const nowIso = new Date().toISOString();
    if (
      res.asset.entityType !== params.entityType ||
      res.asset.entityId !== params.entityId ||
      res.asset.slotKey !== slotKey
    ) {
      this.db
        .prepare(
          `UPDATE audio_assets SET is_active = 0, updated_at = ?
           WHERE entity_type = ? AND entity_id = ? AND slot_key = ?`
        )
        .run(nowIso, params.entityType, params.entityId, slotKey);

      const newAudioId = `aud-${crypto.randomBytes(6).toString('hex')}`;
      this.db
        .prepare(
          `INSERT OR REPLACE INTO audio_assets (
            audio_id, entity_type, entity_id, slot_key, content_hash,
            language, voice_id, model_id, provider, source_type, speed, style, config_version,
            needs_update, is_active, original_filename, error_message,
            storage_key, mime_type, duration_sec, transcript, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pre_generated', ?, ?, ?, 0, 1, '', '', ?, ?, ?, ?, 'ready', ?, ?)`
        )
        .run(
          newAudioId,
          params.entityType,
          params.entityId,
          slotKey,
          res.asset.contentHash,
          res.asset.language,
          res.asset.voiceId,
          res.asset.modelId,
          res.asset.provider,
          res.asset.speed,
          res.asset.style,
          res.asset.configVersion,
          res.asset.storageKey,
          res.asset.mimeType,
          res.asset.durationSec,
          normalized,
          nowIso,
          nowIso
        );
      const row = this.db
        .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
        .get(newAudioId) as Record<string, unknown>;
      return { asset: this.mapRow(row), fallbackUsed: res.fallbackUsed };
    }

    // Clear needs_update and ensure active
    this.db
      .prepare(`UPDATE audio_assets SET is_active = 1, needs_update = 0, source_type = 'pre_generated', updated_at = ? WHERE audio_id = ?`)
      .run(nowIso, res.asset.audioId);
    const refreshed = this.db
      .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
      .get(res.asset.audioId) as Record<string, unknown>;
    return { asset: this.mapRow(refreshed), fallbackUsed: res.fallbackUsed };
  }

  /**
   * Safely deletes or unlinks an audio asset.
   * NEVER deletes the underlying storage blob if any other row still references the same `storage_key`.
   */
  public async deleteAdminAudio(audioId: string): Promise<{ deleted: boolean; blobDeleted: boolean }> {
    const row = this.db
      .prepare('SELECT audio_id, storage_key FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as { audio_id: string; storage_key: string } | undefined;
    if (!row) return { deleted: false, blobDeleted: false };

    this.db.prepare('DELETE FROM audio_assets WHERE audio_id = ?').run(audioId);

    const remainingRefs = this.db
      .prepare('SELECT COUNT(*) as cnt FROM audio_assets WHERE storage_key = ?')
      .get(row.storage_key) as { cnt: number };

    let blobDeleted = false;
    if (Number(remainingRefs.cnt || 0) === 0 && this.storage.delete) {
      await this.storage.delete(row.storage_key).catch(() => { });
      blobDeleted = true;
    }
    return { deleted: true, blobDeleted };
  }

  private buildDefaultProductTranscript(p: {
    name: string;
    price: number;
    priceStatus?: string;
    currency?: string;
    description?: string;
  }): string {
    const pricePart =
      p.priceStatus === 'contact' || !p.price || p.price <= 0
        ? 'Quý khách vui lòng liên hệ gian hàng để nhận báo giá.'
        : `Giá niêm yết ${Number(p.price).toLocaleString('vi-VN')} ${p.currency || 'VNĐ'}.`;
    const desc = String(p.description || '').replace(/\s+/g, ' ').trim().slice(0, 320);
    return `Sản phẩm ${p.name}. ${pricePart} ${desc}`.trim();
  }

  private buildDefaultBoothTranscript(b: {
    name: string;
    companyName?: string;
    category?: string;
    description?: string;
  }): string {
    const host = b.companyName ? `${b.name} của ${b.companyName}` : b.name;
    const desc = String(b.description || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    return `Xin chào quý khách đến với gian hàng ${host}. ${desc || 'Rất hân hạnh được giới thiệu các sản phẩm trưng bày tới quý khách.'}`.trim();
  }

  private findLatestAssetForEntity(
    entityType: 'product' | 'booth' | 'welcome',
    entityId: string,
    slotKey?: string
  ): AudioAssetRecord | null {
    const rows = this.db
      .prepare(
        `SELECT * FROM audio_assets
         WHERE entity_type = ? AND entity_id = ? AND is_active = 1
         ORDER BY
           CASE WHEN source_type = 'uploaded' THEN 0 ELSE 1 END,
           CASE WHEN model_id NOT LIKE '%local-fallback%' AND provider != 'local-fallback' THEN 0 ELSE 1 END,
           CASE WHEN status = 'ready' THEN 0 ELSE 1 END,
           updated_at DESC, rowid DESC
         LIMIT 5`
      )
      .all(entityType, entityId) as Array<Record<string, unknown>>;

    if (rows.length === 0) return null;
    if (slotKey) {
      const exact = rows.find((r) => String(r.slot_key) === slotKey);
      if (exact) return this.mapRow(exact);
    }
    return this.mapRow(rows[0]);
  }

  private computeBusinessStatus(asset: AudioAssetRecord | null): AudioBusinessStatus {
    if (!asset) return 'missing';
    if (asset.status === 'generating' || asset.status === 'pending') return 'generating';
    if (asset.status === 'failed') return 'failed';
    if (asset.needsUpdate) return 'needs_update';
    if (asset.provider === 'local-fallback' || asset.modelId.includes('local-fallback')) {
      return 'missing';
    }
    return 'ready';
  }

  public getAdminAudioItem(
    entityType: 'product' | 'booth' | 'welcome',
    entityId: string,
    slotKey?: string
  ): AdminAudioItemSummary | null {
    const cfg = this.getEntityAudioConfig(entityType, entityId || WELCOME_ENTITY_ID);

    if (entityType === 'welcome') {
      const asset = this.findLatestAssetForEntity('welcome', entityId || WELCOME_ENTITY_ID, 'welcome');
      return {
        entityType: 'welcome',
        entityId: entityId || WELCOME_ENTITY_ID,
        slotKey: 'welcome',
        entityName: 'Lời chào khách tham quan (Welcome Plaza)',
        imageUrl: '',
        subtitle: 'Hướng dẫn viên chào đón khách tại khu vực cổng triển lãm',
        audioMode: cfg.audioMode,
        preferredProvider: cfg.preferredProvider,
        configuredModelId: cfg.modelId,
        configuredVoiceId: cfg.voiceId,
        configuredSpeed: cfg.speed,
        configuredStyle: cfg.style,
        defaultTranscript: DEFAULT_WELCOME_TRANSCRIPT,
        transcript: cfg.customTranscript || asset?.transcript || DEFAULT_WELCOME_TRANSCRIPT,
        status: this.computeBusinessStatus(asset),
        sourceType: asset?.sourceType || null,
        provider: asset?.provider || null,
        modelId: asset?.modelId || null,
        voiceId: asset?.voiceId || null,
        mimeType: asset?.mimeType || null,
        durationSec: asset?.durationSec || 0,
        needsUpdate: Boolean(asset?.needsUpdate),
        originalFilename: asset?.originalFilename || '',
        errorMessage: asset?.errorMessage || '',
        audioId: asset?.audioId || null,
        audioUrl: asset?.audioUrl || null,
        updatedAt: asset?.updatedAt || cfg.updatedAt || null,
      };
    }

    if (entityType === 'product') {
      const p = this.v28Db.getProductById(entityId);
      if (!p) return null;
      const asset = this.findLatestAssetForEntity('product', p.id, slotKey);
      const isChimePlaceholder = Boolean(
        asset && (asset.provider === 'local-fallback' || asset.modelId.includes('local-fallback'))
      );
      const visibleAsset = isChimePlaceholder ? null : asset;
      const defaultTranscript = this.buildDefaultProductTranscript({
        name: p.name,
        price: p.price ?? 0,
        currency: p.currency,
        description: p.description,
      });
      return {
        entityType: 'product',
        entityId: p.id,
        slotKey: visibleAsset?.slotKey || slotKey || 'intro',
        entityName: p.name,
        imageUrl: Array.isArray(p.images) && p.images[0] ? p.images[0] : '',
        subtitle: p.price && p.price > 0 ? `${p.price.toLocaleString('vi-VN')} ${p.currency || 'VND'}` : 'Giá liên hệ',
        audioMode: cfg.audioMode,
        preferredProvider: cfg.preferredProvider,
        configuredModelId: cfg.modelId,
        configuredVoiceId: cfg.voiceId,
        configuredSpeed: cfg.speed,
        configuredStyle: cfg.style,
        defaultTranscript,
        transcript: cfg.customTranscript || visibleAsset?.transcript || defaultTranscript,
        status: this.computeBusinessStatus(asset),
        sourceType: visibleAsset?.sourceType || null,
        provider: visibleAsset?.provider || null,
        modelId: visibleAsset?.modelId || null,
        voiceId: visibleAsset?.voiceId || null,
        mimeType: visibleAsset?.mimeType || null,
        durationSec: visibleAsset?.durationSec || 0,
        needsUpdate: Boolean(visibleAsset?.needsUpdate),
        originalFilename: visibleAsset?.originalFilename || '',
        errorMessage: visibleAsset?.errorMessage || '',
        audioId: visibleAsset?.audioId || null,
        audioUrl: visibleAsset?.audioUrl || null,
        updatedAt: visibleAsset?.updatedAt || cfg.updatedAt || null,
      };
    }

    const booths = this.v28Db.listBooths({ includeArchived: false });
    const b = booths.find((x) => x.id === entityId);
    if (!b) return null;
    const asset = this.findLatestAssetForEntity('booth', b.id, slotKey || 'welcome');
    const defaultTranscript = this.buildDefaultBoothTranscript({
      name: b.name,
      companyName: b.companyName,
      category: b.category,
      description: b.description,
    });
    return {
      entityType: 'booth',
      entityId: b.id,
      slotKey: asset?.slotKey || slotKey || 'welcome',
      entityName: b.name,
      imageUrl: '',
      subtitle: `${b.companyName || 'Gian hàng'} · ${b.category || 'Chung'}`,
      audioMode: cfg.audioMode,
      preferredProvider: cfg.preferredProvider,
      configuredModelId: cfg.modelId,
      configuredVoiceId: cfg.voiceId,
      configuredSpeed: cfg.speed,
      configuredStyle: cfg.style,
      defaultTranscript,
      transcript: cfg.customTranscript || asset?.transcript || defaultTranscript,
      status: this.computeBusinessStatus(asset),
      sourceType: asset?.sourceType || null,
      provider: asset?.provider || null,
      modelId: asset?.modelId || null,
      voiceId: asset?.voiceId || null,
      mimeType: asset?.mimeType || null,
      durationSec: asset?.durationSec || 0,
      needsUpdate: Boolean(asset?.needsUpdate),
      originalFilename: asset?.originalFilename || '',
      errorMessage: asset?.errorMessage || '',
      audioId: asset?.audioId || null,
      audioUrl: asset?.audioUrl || null,
      updatedAt: asset?.updatedAt || cfg.updatedAt || null,
    };
  }

  public listAdminAudioItems(filters?: {
    entityType?: 'product' | 'booth' | 'welcome' | 'all';
    companyId?: string;
    status?: AudioBusinessStatus | 'all';
    q?: string;
    page?: number;
    limit?: number;
  }): {
    items: AdminAudioItemSummary[];
    total: number;
    page: number;
    totalPages: number;
    summary: Record<AudioBusinessStatus, number>;
  } {
    const scope = filters?.entityType || 'product';
    const companyIdFilter =
      filters?.companyId && filters.companyId !== 'all' ? filters.companyId.trim() : undefined;
    const q = (filters?.q || '').trim().toLowerCase();
    const statusFilter = filters?.status || 'all';
    const page = Math.max(1, Number(filters?.page || 1));
    const limit = Math.max(1, Math.min(200, Number(filters?.limit || 25)));

    const all: AdminAudioItemSummary[] = [];

    if (scope === 'welcome' || scope === 'all') {
      const w = this.getAdminAudioItem('welcome', WELCOME_ENTITY_ID, 'welcome');
      if (w) all.push(w);
    }

    if (scope === 'product' || scope === 'all') {
      const prods = this.v28Db.listProducts({
        companyId: companyIdFilter,
        status: 'active',
        page: 1,
        limit: 500,
      }).items;
      for (const p of prods) {
        const item = this.getAdminAudioItem('product', p.id, 'intro');
        if (item) all.push(item);
      }
    }

    if (scope === 'booth' || scope === 'all') {
      const booths = this.v28Db.listBooths({
        companyId: companyIdFilter,
        includeArchived: false,
      });
      for (const b of booths) {
        const item = this.getAdminAudioItem('booth', b.id, 'welcome');
        if (item) all.push(item);
      }
    }

    const summary: Record<AudioBusinessStatus, number> = {
      missing: 0,
      generating: 0,
      ready: 0,
      needs_update: 0,
      failed: 0,
    };
    for (const item of all) {
      summary[item.status] += 1;
    }

    const filtered = all.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (q && !item.entityName.toLowerCase().includes(q) && !item.entityId.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit),
      total,
      page,
      totalPages,
      summary,
    };
  }

  /**
   * Build & return all pre-generated/uploaded audio clips for a specific booth.
   * Audio-first: uploaded & pre-generated clips are returned directly without calling TTS API.
   */
  public async getOrPrepareBoothAudioPack(
    booth: ExhibitionBoothPlacementView,
    options?: { allowLiveSynthesis?: boolean }
  ): Promise<{
    boothId: string;
    storageDriver: string;
    liveGeminiTtsEnabled: boolean;
    clips: AudioAssetRecord[];
    cacheHits: number;
    generatedCount: number;
    voiceReadiness: {
      ready: boolean;
      reason: 'consistent_ready' | 'missing_or_fallback' | 'stale_needs_update' | 'mixed_voice_signatures' | 'empty_booth';
      totalRequired: number;
      realReadyCount: number;
      dominantProvider: string | null;
      dominantModelId: string | null;
      dominantVoiceId: string | null;
      voiceSignature: string | null;
    };
  }> {
    const clips: AudioAssetRecord[] = [];
    let cacheHits = 0;
    let generatedCount = 0;

    const welcomeText = `Xin chào quý khách đến với gian hàng ${booth.boothName} của ${booth.companyName} tại ${booth.zoneName}. Tôi là trợ lý AI tư vấn sản phẩm, rất hân hạnh được hỗ trợ quý khách.`;
    const introText = `${booth.companyName} mang đến giải pháp thuộc nhóm ${booth.category}. ${booth.description || 'Quý khách có thể xem chi tiết các sản phẩm trưng bày tại gian hàng hoặc đặt câu hỏi trực tiếp cho tôi.'}`;

    const items: Array<{ entityType: 'booth' | 'product'; entityId: string; slotKey: string; text: string }> = [
      { entityType: 'booth', entityId: booth.boothId, slotKey: 'welcome', text: welcomeText },
      { entityType: 'booth', entityId: booth.boothId, slotKey: 'company_intro', text: introText },
    ];

    for (const s of booth.slots) {
      if (!s.product) continue;
      const p = s.product;
      const priceText =
        p.price > 0 ? `Giá niêm yết ${p.price.toLocaleString('vi-VN')} ${p.currency}.` : 'Vui lòng liên hệ để nhận báo giá.';
      const stockText = p.inStock ? 'Hiện đang còn hàng.' : 'Hiện đang tạm hết hàng.';
      items.push({
        entityType: 'product',
        entityId: p.id,
        slotKey: s.slotId,
        text: `Sản phẩm ${p.name}. ${priceText} ${stockText} ${p.description || ''}`,
      });
    }

    const closingText = `Cảm ơn quý khách đã tham quan gian hàng ${booth.boothName} của ${booth.companyName}. Nếu quý khách cần tư vấn thêm về sản phẩm, vui lòng chuyển sang tab Chat để trò chuyện trực tiếp với tôi.`;
    items.push({
      entityType: 'booth',
      entityId: booth.boothId,
      slotKey: 'closing',
      text: closingText,
    });

    for (const item of items) {
      const res = await this.ensureCachedAudio({
        entityType: item.entityType,
        entityId: item.entityId,
        slotKey: item.slotKey,
        transcript: item.text,
        allowLiveSynthesis: options?.allowLiveSynthesis,
      });
      clips.push(res.asset);
      if (res.cacheHit) cacheHits++;
      else generatedCount++;
    }

    const buildClipVoiceSignature = (c: AudioAssetRecord): string => {
      const spd = Number(c.speed ?? 1.0).toFixed(2);
      const styleHash = crypto
        .createHash('sha1')
        .update(`${c.style || ''}|${c.configVersion || 'v1'}`)
        .digest('hex')
        .slice(0, 8);
      return `${c.provider || 'unknown'}|${c.modelId || 'unknown'}|${c.voiceId || 'unknown'}|${spd}|${styleHash}`;
    };

    const candidateClips = clips.filter(
      (c) =>
        c.status === 'ready' &&
        !c.needsUpdate &&
        c.provider !== 'local-fallback' &&
        !c.modelId.includes('local-fallback') &&
        c.durationSec > 0 &&
        Boolean(c.storageKey) &&
        Boolean(c.audioUrl)
    );
    const existenceChecks = await Promise.all(
      candidateClips.map(async (c) => ({
        clip: c,
        exists: await this.storage.exists(c.storageKey).catch(() => false),
      }))
    );
    const realClips = existenceChecks.filter((e) => e.exists).map((e) => e.clip);
    const hasMissingFile = existenceChecks.some((e) => !e.exists);
    const hasStale = clips.some((c) => Boolean(c.needsUpdate));
    const uniqueSigs = new Set(realClips.map((c) => buildClipVoiceSignature(c)));
    const allReady = clips.length === items.length && items.length > 0 && realClips.length === items.length;
    const isConsistent = allReady && uniqueSigs.size === 1;
    const firstReal = realClips[0] || null;
    const voiceReadiness = {
      ready: isConsistent,
      reason:
        items.length === 0
          ? ('empty_booth' as const)
          : isConsistent
            ? ('consistent_ready' as const)
            : uniqueSigs.size > 1
              ? ('mixed_voice_signatures' as const)
              : hasStale
                ? ('stale_needs_update' as const)
                : hasMissingFile
                  ? ('missing_or_fallback' as const)
                  : ('missing_or_fallback' as const),
      totalRequired: items.length,
      realReadyCount: realClips.length,
      dominantProvider: firstReal ? firstReal.provider : null,
      dominantModelId: firstReal ? firstReal.modelId : null,
      dominantVoiceId: firstReal ? firstReal.voiceId : null,
      voiceSignature: isConsistent && firstReal ? buildClipVoiceSignature(firstReal) : null,
    };

    const hasRealAudio = realClips.length > 0;

    return {
      boothId: booth.boothId,
      storageDriver: this.storage.driverName,
      liveGeminiTtsEnabled:
        hasRealAudio ||
        (Boolean(process.env.GEMINI_API_KEY) && process.env.V28_ENABLE_LIVE_AI === 'true'),
      clips,
      cacheHits,
      generatedCount,
      voiceReadiness,
    };
  }

  public async syncVersionAudioIncremental(version: ExhibitionVersionDetail, limitBooths = 20): Promise<{
    boothsProcessed: number;
    cacheHits: number;
    generatedCount: number;
  }> {
    let cacheHits = 0;
    let generatedCount = 0;
    const targets = version.booths.slice(0, limitBooths);
    for (const b of targets) {
      try {
        const res = await this.getOrPrepareBoothAudioPack(b, { allowLiveSynthesis: true });
        cacheHits += res.cacheHits;
        generatedCount += res.generatedCount;
      } catch {
        // Continue warming remaining booths on partial failure
      }
    }
    await this.pruneStaleAudioCache().catch(() => { });
    return { boothsProcessed: targets.length, cacheHits, generatedCount };
  }

  public async getAudioStreamSource(
    audioId: string
  ): Promise<
    | { kind: 'file'; filePath: string; size: number; mimeType: string }
    | { kind: 'buffer'; buffer: Buffer; mimeType: string }
    | null
  > {
    const row = this.db
      .prepare('SELECT storage_key, mime_type FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as { storage_key: string; mime_type: string } | undefined;
    if (!row) return null;
    const mimeType = row.mime_type || 'audio/wav';

    if (this.storage instanceof LocalAudioStorageAdapter) {
      const info = await this.storage.getFileStreamInfo(row.storage_key, mimeType);
      if (!info || !info.validAudio) {
        this.db.prepare(`UPDATE audio_assets SET status = 'failed' WHERE audio_id = ?`).run(audioId);
        return null;
      }
      return { kind: 'file', filePath: info.filePath, size: info.size, mimeType };
    }

    const buffer = await this.storage.get(row.storage_key);
    if (!buffer || !isValidAudioBuffer(buffer, mimeType)) {
      this.db.prepare(`UPDATE audio_assets SET status = 'failed' WHERE audio_id = ?`).run(audioId);
      return null;
    }
    return { kind: 'buffer', buffer, mimeType };
  }

  public async getAudioStreamBuffer(audioId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const row = this.db
      .prepare('SELECT storage_key, mime_type FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as { storage_key: string; mime_type: string } | undefined;
    if (!row) return null;
    const buffer = await this.storage.get(row.storage_key);
    if (!buffer || !isValidAudioBuffer(buffer, row.mime_type)) {
      this.db.prepare(`UPDATE audio_assets SET status = 'failed' WHERE audio_id = ?`).run(audioId);
      return null;
    }
    return { buffer, mimeType: row.mime_type || 'audio/wav' };
  }

  public getAdminAudioOverview(
    limit = 50,
    scope?: {
      companyId?: string;
      exhibitionTitle?: string;
      occupiedBoothCount?: number;
      totalBoothSlots?: number;
      activeProductCount?: number;
    }
  ): {
    totalAssets: number;
    readyCount: number;
    realReadyCount: number;
    boothReadyCount: number;
    productReadyCount: number;
    legacyChimeCount: number;
    pendingCount: number;
    failedCount: number;
    currentFailedEntities: number;
    historicalFailedRows: number;
    needsUpdateCount: number;
    uploadedCount: number;
    scope?: {
      companyId?: string;
      exhibitionTitle?: string;
      occupiedBoothCount: number;
      totalBoothSlots: number;
      activeProductCount: number;
    };
    liveGeminiTtsEnabled: boolean;
    providerLabel: string;
    storageDriver: string;
    providers: ReturnType<MultiProviderTtsService['listProviderStatuses']>;
    usage: ReturnType<MultiProviderTtsService['getUsageMetrics']>;
    metrics: {
      cacheHits: number;
      cacheMisses: number;
      generationFailures: number;
      inFlightDeduplicated: number;
      uploadedHits: number;
      pregeneratedHits: number;
    };
    recentAssets: AudioAssetRecord[];
  } {
    const counts = this.db
      .prepare(`SELECT status, COUNT(*) as cnt FROM audio_assets GROUP BY status`)
      .all() as Array<{ status: string; cnt: number }>;

    let totalReadyRows = 0;
    let pendingCount = 0;
    let failedCount = 0;
    for (const c of counts) {
      if (c.status === 'ready') totalReadyRows = Number(c.cnt);
      else if (c.status === 'pending' || c.status === 'generating') pendingCount += Number(c.cnt);
      else if (c.status === 'failed') failedCount = Number(c.cnt);
    }

    // Honest speech-only counts (exclude legacy 440Hz local-fallback chimes from "Audio sẵn sàng")
    const realReadyByType = this.db
      .prepare(
        `SELECT entity_type, COUNT(*) as cnt FROM audio_assets
         WHERE is_active = 1 AND status = 'ready'
           AND provider != 'local-fallback' AND model_id NOT LIKE '%local-fallback%'
         GROUP BY entity_type`
      )
      .all() as Array<{ entity_type: string; cnt: number }>;

    let boothReadyCount = 0;
    let productReadyCount = 0;
    let otherReadyCount = 0;
    for (const r of realReadyByType) {
      if (r.entity_type === 'booth' || r.entity_type === 'welcome') boothReadyCount += Number(r.cnt);
      else if (r.entity_type === 'product') productReadyCount += Number(r.cnt);
      else otherReadyCount += Number(r.cnt);
    }
    const realReadyCount = boothReadyCount + productReadyCount + otherReadyCount;

    const legacyChimeRow = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM audio_assets
         WHERE is_active = 1 AND status = 'ready'
           AND (provider = 'local-fallback' OR model_id LIKE '%local-fallback%')`
      )
      .get() as { cnt: number };

    const needsUpdateRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM audio_assets WHERE is_active = 1 AND needs_update = 1`)
      .get() as { cnt: number };
    const uploadedRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM audio_assets WHERE is_active = 1 AND source_type = 'uploaded'`)
      .get() as { cnt: number };
    // Distinguish active entities currently failing (no valid ready real-speech audio) from historical failed rows
    const currentFailedRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT entity_type || ':' || entity_id) as cnt
         FROM audio_assets a
         WHERE a.is_active = 1 AND a.status = 'failed'
           AND NOT EXISTS (
             SELECT 1 FROM audio_assets r
             WHERE r.entity_type = a.entity_type AND r.entity_id = a.entity_id
               AND r.is_active = 1 AND r.status = 'ready'
               AND r.provider != 'local-fallback' AND r.model_id NOT LIKE '%local-fallback%'
           )`
      )
      .get() as { cnt: number };

    const rows = this.db
      .prepare('SELECT * FROM audio_assets ORDER BY updated_at DESC, created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(200, limit))) as Array<Record<string, unknown>>;

    const liveGeminiTtsEnabled =
      Boolean(process.env.GEMINI_API_KEY) && process.env.V28_ENABLE_LIVE_AI === 'true';
    const providers = this.ttsService.listProviderStatuses();
    const activeNames = providers.filter((p) => p.available).map((p) => p.displayName);

    return {
      totalAssets: totalReadyRows + pendingCount + failedCount,
      readyCount: totalReadyRows,
      realReadyCount,
      boothReadyCount,
      productReadyCount,
      legacyChimeCount: Number(legacyChimeRow?.cnt || 0),
      pendingCount,
      failedCount,
      currentFailedEntities: Number(currentFailedRow?.cnt || 0),
      historicalFailedRows: failedCount,
      needsUpdateCount: Number(needsUpdateRow?.cnt || 0),
      uploadedCount: Number(uploadedRow?.cnt || 0),
      ...(scope
        ? {
          scope: {
            companyId: scope.companyId,
            exhibitionTitle: scope.exhibitionTitle,
            occupiedBoothCount: scope.occupiedBoothCount ?? 0,
            totalBoothSlots: scope.totalBoothSlots ?? 0,
            activeProductCount: scope.activeProductCount ?? 0,
          },
        }
        : {}),
      liveGeminiTtsEnabled,
      providerLabel:
        activeNames.length > 0
          ? `Hybrid TTS (${activeNames.join(' → ')})`
          : 'Local Fallback WAV (Chế độ Audio-First an toàn — LIVE GEMINI TTS NOT VERIFIED)',
      storageDriver: this.storage.driverName,
      providers,
      usage: this.ttsService.getUsageMetrics(),
      metrics: { ...this.metrics },
      recentAssets: rows.map((r) => this.mapRow(r)),
    };
  }

  public async retryBoothAudio(booth: ExhibitionBoothPlacementView): Promise<{
    boothId: string;
    storageDriver: string;
    liveGeminiTtsEnabled: boolean;
    clips: AudioAssetRecord[];
    cacheHits: number;
    generatedCount: number;
    voiceReadiness: {
      ready: boolean;
      reason: 'consistent_ready' | 'missing_or_fallback' | 'stale_needs_update' | 'mixed_voice_signatures' | 'empty_booth';
      totalRequired: number;
      realReadyCount: number;
      dominantProvider: string | null;
      dominantModelId: string | null;
      dominantVoiceId: string | null;
      voiceSignature: string | null;
    };
  }> {
    const productIds = booth.slots.map((s) => s.product?.id).filter((id): id is string => Boolean(id));
    this.db
      .prepare(`DELETE FROM audio_assets WHERE status = 'failed' AND entity_type = 'booth' AND entity_id = ?`)
      .run(booth.boothId);
    for (const pid of productIds) {
      this.db
        .prepare(`DELETE FROM audio_assets WHERE status = 'failed' AND entity_type = 'product' AND entity_id = ?`)
        .run(pid);
    }
    return this.getOrPrepareBoothAudioPack(booth);
  }

  public async pruneStaleAudioCache(maxAssets = 500): Promise<{ deletedCount: number }> {
    const staleRows = this.db
      .prepare(
        `SELECT a.audio_id, a.storage_key
         FROM audio_assets a
         WHERE a.source_type != 'uploaded'
           AND a.audio_id NOT IN (
             SELECT latest.audio_id FROM (
               SELECT audio_id, ROW_NUMBER() OVER (
                 PARTITION BY entity_type, entity_id, slot_key
                 ORDER BY updated_at DESC, created_at DESC, rowid DESC
               ) AS rn
               FROM audio_assets
               WHERE status = 'ready' AND is_active = 1
             ) latest
             WHERE latest.rn = 1
           )
         ORDER BY a.created_at ASC`
      )
      .all() as Array<{ audio_id: string; storage_key: string }>;

    const totalRow = this.db.prepare('SELECT COUNT(*) as cnt FROM audio_assets').get() as { cnt: number };
    const excess = Math.max(0, Number(totalRow.cnt) - maxAssets);
    const toDelete = staleRows.slice(0, excess);

    for (const row of toDelete) {
      await this.deleteAdminAudio(row.audio_id);
    }

    return { deletedCount: toDelete.length };
  }
}

export { TtsProviderError };
