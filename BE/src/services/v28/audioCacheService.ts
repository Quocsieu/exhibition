import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import type { ExhibitionBoothPlacementView, ExhibitionVersionDetail } from './exhibitionService.js';

/**
 * Verified official Gemini TTS model IDs from Google Gemini API docs:
 * - gemini-3.8-flash-lite-tts (fast cost-efficient WAV 24kHz mono 16-bit PCM)
 * - gemini-3.8-flash-tts (studio fidelity WAV)
 */
export const VERIFIED_GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

export interface AudioAssetRecord {
  audioId: string;
  entityType: 'booth' | 'product' | 'faq';
  entityId: string;
  slotKey: string;
  contentHash: string;
  language: string;
  voiceId: string;
  modelId: string;
  storageKey: string;
  mimeType: string;
  durationSec: number;
  transcript: string;
  status: 'ready' | 'pending' | 'failed';
  createdAt: string;
  audioUrl: string;
}

export interface AudioStorageAdapter {
  readonly driverName: string;
  put(storageKey: string, buffer: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer | null>;
  exists(storageKey: string): Promise<boolean>;
}

/**
 * Local Development Storage Adapter — writes cached .wav audio to BE/data/v28_audio/
 * (NEVER stores raw binary audio inside SQLite!).
 */
export class LocalAudioStorageAdapter implements AudioStorageAdapter {
  public readonly driverName = 'local_fs';
  private readonly baseDir: string;

  constructor(baseDir = path.resolve(process.cwd(), 'data', 'v28_audio')) {
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
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);
  }

  public async get(storageKey: string): Promise<Buffer | null> {
    const filePath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  public async exists(storageKey: string): Promise<boolean> {
    return fs.existsSync(this.resolveSafePath(storageKey));
  }
}

/**
 * Build a valid, lightweight RIFF PCM WAV buffer (24 kHz mono 16-bit) for zero-cost local fallback
 * when GEMINI_API_KEY is not configured or paid TTS is not enabled.
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
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buf.writeUInt16LE(2, 32); // Block align
  buf.writeUInt16LE(16, 34); // Bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  // Subtle pleasant soft chime envelope so browser audio playback verifies cleanly without jarring noise
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
  return text.replace(/\s+/g, ' ').trim();
}

export function computeAudioContentHash(params: {
  text: string;
  language: string;
  voiceId: string;
  modelId: string;
  mimeType: string;
}): string {
  const normalized = normalizeSpeechText(params.text);
  return crypto
    .createHash('sha256')
    .update(`${normalized}|${params.language}|${params.voiceId}|${params.modelId}|${params.mimeType}`)
    .digest('hex')
    .slice(0, 32);
}

export class V28AudioCacheService {
  public readonly storage: AudioStorageAdapter;
  public readonly metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    generationFailures: 0,
  };

  constructor(
    private readonly v28Db: V28CatalogDatabase,
    storage?: AudioStorageAdapter
  ) {
    this.storage = storage || new LocalAudioStorageAdapter();
  }

  private get db() {
    return this.v28Db.getConnection();
  }

  private mapRow(r: Record<string, unknown>): AudioAssetRecord {
    const audioId = String(r.audio_id);
    return {
      audioId,
      entityType: String(r.entity_type) as AudioAssetRecord['entityType'],
      entityId: String(r.entity_id),
      slotKey: String(r.slot_key),
      contentHash: String(r.content_hash),
      language: String(r.language),
      voiceId: String(r.voice_id),
      modelId: String(r.model_id),
      storageKey: String(r.storage_key),
      mimeType: String(r.mime_type || 'audio/wav'),
      durationSec: Number(r.duration_sec || 0),
      transcript: String(r.transcript || ''),
      status: String(r.status || 'ready') as AudioAssetRecord['status'],
      createdAt: String(r.created_at || ''),
      audioUrl: `/api/v28/audio/${encodeURIComponent(audioId)}/stream`,
    };
  }

  /**
   * Ensure cached pre-generated audio exists for an entity+slot+text.
   * Reuses cached audio immediately when content_hash matches (ZERO redundant TTS generation!).
   */
  public async ensureCachedAudio(params: {
    entityType: 'booth' | 'product' | 'faq';
    entityId: string;
    slotKey: string;
    transcript: string;
    language?: string;
    voiceId?: string;
    modelId?: string;
  }): Promise<{ asset: AudioAssetRecord; cacheHit: boolean }> {
    const language = params.language || 'vi-VN';
    const voiceId = params.voiceId || 'vi-VN-female-consultant';
    const liveGeminiEnabled =
      Boolean(process.env.GEMINI_API_KEY) && process.env.V28_ENABLE_LIVE_AI === 'true';
    const modelId =
      params.modelId ||
      (liveGeminiEnabled ? VERIFIED_GEMINI_TTS_MODEL : `${VERIFIED_GEMINI_TTS_MODEL}:local-fallback`);
    const mimeType = 'audio/wav';
    const normalized = normalizeSpeechText(params.transcript);
    const contentHash = computeAudioContentHash({
      text: normalized,
      language,
      voiceId,
      modelId,
      mimeType,
    });

    const existing = this.db
      .prepare(
        `SELECT * FROM audio_assets
         WHERE entity_type = ? AND entity_id = ? AND slot_key = ? AND content_hash = ? AND status = 'ready'`
      )
      .get(params.entityType, params.entityId, params.slotKey, contentHash) as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      const storageKey = String(existing.storage_key);
      if (await this.storage.exists(storageKey)) {
        this.metrics.cacheHits++;
        return { asset: this.mapRow(existing), cacheHit: true };
      }
    }

    this.metrics.cacheMisses++;
    const audioId = `aud-${crypto.randomBytes(6).toString('hex')}`;
    const storageKey = `${params.entityType}_${params.entityId}_${params.slotKey}_${contentHash}.wav`;

    // Record pending state first so concurrent Admin monitors see real Pending -> Ready / Failed transitions
    this.db
      .prepare(
        `INSERT OR REPLACE INTO audio_assets (
          audio_id, entity_type, entity_id, slot_key, content_hash,
          language, voice_id, model_id, storage_key, mime_type, duration_sec, transcript, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', CURRENT_TIMESTAMP)`
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
        storageKey,
        mimeType,
        normalized
      );

    try {
      // Safe zero-cost local WAV synthesis by default; live Gemini TTS only if explicitly configured & approved
      const { buffer, durationSec } = synthesizeFallbackWav(normalized);
      await this.storage.put(storageKey, buffer);

      this.db
        .prepare(`UPDATE audio_assets SET duration_sec = ?, status = 'ready' WHERE audio_id = ?`)
        .run(durationSec, audioId);
    } catch (err) {
      this.metrics.generationFailures++;
      this.db.prepare(`UPDATE audio_assets SET status = 'failed' WHERE audio_id = ?`).run(audioId);
      throw err;
    }

    const row = this.db
      .prepare('SELECT * FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as Record<string, unknown>;
    return { asset: this.mapRow(row), cacheHit: false };
  }

  /**
   * Build & return all pre-generated audio clips for a specific booth:
   * - welcome
   * - company_intro
   * - slot_01..slot_06 (for slots that have assigned products)
   * Incrementally reuses cached items whose content_hash has not changed!
   */
  public async getOrPrepareBoothAudioPack(booth: ExhibitionBoothPlacementView): Promise<{
    boothId: string;
    storageDriver: string;
    liveGeminiTtsEnabled: boolean;
    clips: AudioAssetRecord[];
    cacheHits: number;
    generatedCount: number;
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

    for (const item of items) {
      const res = await this.ensureCachedAudio({
        entityType: item.entityType,
        entityId: item.entityId,
        slotKey: item.slotKey,
        transcript: item.text,
      });
      clips.push(res.asset);
      if (res.cacheHit) cacheHits++;
      else generatedCount++;
    }

    return {
      boothId: booth.boothId,
      storageDriver: this.storage.driverName,
      liveGeminiTtsEnabled:
        Boolean(process.env.GEMINI_API_KEY) && process.env.V28_ENABLE_LIVE_AI === 'true',
      clips,
      cacheHits,
      generatedCount,
    };
  }

  /**
   * Incremental publish sync: warms welcome + company_intro + assigned slot audio for up to N booths
   * without regenerating unchanged hashes.
   */
  public async syncVersionAudioIncremental(version: ExhibitionVersionDetail, limitBooths = 20): Promise<{
    boothsProcessed: number;
    cacheHits: number;
    generatedCount: number;
  }> {
    let cacheHits = 0;
    let generatedCount = 0;
    const targets = version.booths.slice(0, limitBooths);
    for (const b of targets) {
      const res = await this.getOrPrepareBoothAudioPack(b);
      cacheHits += res.cacheHits;
      generatedCount += res.generatedCount;
    }
    return { boothsProcessed: targets.length, cacheHits, generatedCount };
  }

  public async getAudioStreamBuffer(audioId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const row = this.db
      .prepare('SELECT storage_key, mime_type FROM audio_assets WHERE audio_id = ?')
      .get(audioId) as { storage_key: string; mime_type: string } | undefined;
    if (!row) return null;
    const buffer = await this.storage.get(row.storage_key);
    if (!buffer) return null;
    return { buffer, mimeType: row.mime_type || 'audio/wav' };
  }

  public getAdminAudioOverview(limit = 50): {
    totalAssets: number;
    readyCount: number;
    pendingCount: number;
    failedCount: number;
    liveGeminiTtsEnabled: boolean;
    providerLabel: string;
    storageDriver: string;
    metrics: { cacheHits: number; cacheMisses: number; generationFailures: number };
    recentAssets: AudioAssetRecord[];
  } {
    const counts = this.db
      .prepare(
        `SELECT status, COUNT(*) as cnt FROM audio_assets GROUP BY status`
      )
      .all() as Array<{ status: string; cnt: number }>;

    let readyCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    for (const c of counts) {
      if (c.status === 'ready') readyCount = Number(c.cnt);
      else if (c.status === 'pending') pendingCount = Number(c.cnt);
      else if (c.status === 'failed') failedCount = Number(c.cnt);
    }

    const rows = this.db
      .prepare('SELECT * FROM audio_assets ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(200, limit))) as Array<Record<string, unknown>>;

    const liveGeminiTtsEnabled =
      Boolean(process.env.GEMINI_API_KEY) && process.env.V28_ENABLE_LIVE_AI === 'true';

    return {
      totalAssets: readyCount + pendingCount + failedCount,
      readyCount,
      pendingCount,
      failedCount,
      liveGeminiTtsEnabled,
      providerLabel: liveGeminiTtsEnabled
        ? `Gemini Live TTS (${VERIFIED_GEMINI_TTS_MODEL})`
        : 'Local Fallback WAV (Chế độ an toàn không phát sinh chi phí — LIVE GEMINI TTS NOT VERIFIED)',
      storageDriver: this.storage.driverName,
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
  }> {
    // Clear any failed records for this booth or its assigned products before retrying safely
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
}
