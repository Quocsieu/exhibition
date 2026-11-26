import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../../database/v28Database.js';
import type { V28AudioCacheService } from '../audioCacheService.js';
import {
  getProviderFeatureLimitations,
  inferNeutralVoiceProfile,
  isNeutralVoiceProfileId,
  type NeutralVoiceProfileId,
  type TtsProviderId,
} from './ttsTypes.js';

export interface VoiceConfigDescriptor {
  provider: TtsProviderId;
  modelId: string;
  voiceId: string;
  speed: number;
  style: string;
}

export interface VoiceApprovalRecord {
  approvalId: string;
  configSignature: string;
  provider: TtsProviderId;
  modelId: string;
  voiceId: string;
  speed: number;
  style: string;
  sampleAudioId: string;
  sampleAudioUrl: string;
  sampleTranscript: string;
  status: 'previewed' | 'approved' | 'revoked';
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
}

export function computeVoiceConfigSignature(cfg: VoiceConfigDescriptor): string {
  const normSpeed = Number((cfg.speed || 1.0).toFixed(2));
  const normStyle = String(cfg.style || '').trim();
  return crypto
    .createHash('sha256')
    .update(`${cfg.provider}|${cfg.modelId.trim()}|${cfg.voiceId.trim()}|${normSpeed}|${normStyle}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Backend-enforced Voice Sample Preview & Approval Service (Phase 1.1.3).
 *
 * Guarantees:
 * - Every voice configuration (provider, model, voice, speed, style) must generate a REAL sample
 *   audio (never a 440Hz chime) and be explicitly approved by Admin before batch generation can start.
 * - Changing ANY of provider, model, voice, speed, or style produces a new `configSignature`,
 *   automatically requiring fresh preview & approval.
 */
export class V28VoiceApprovalService {
  constructor(
    private readonly v28Db: V28CatalogDatabase,
    private readonly audioCacheService: V28AudioCacheService
  ) {}

  private get db() {
    return this.v28Db.getConnection();
  }

  private mapRow(row: Record<string, unknown>): VoiceApprovalRecord {
    const sampleAudioId = String(row.sample_audio_id || '');
    return {
      approvalId: String(row.approval_id),
      configSignature: String(row.config_signature),
      provider: String(row.provider) as TtsProviderId,
      modelId: String(row.model_id || ''),
      voiceId: String(row.voice_id || ''),
      speed: Number(row.speed ?? 1.0),
      style: String(row.style || ''),
      sampleAudioId,
      sampleAudioUrl: sampleAudioId ? `/api/v28/audio/${encodeURIComponent(sampleAudioId)}/stream` : '',
      sampleTranscript: String(row.sample_transcript || ''),
      status: String(row.status || 'previewed') as VoiceApprovalRecord['status'],
      approvedBy: String(row.approved_by || ''),
      approvedAt: String(row.approved_at || ''),
      createdAt: String(row.created_at || ''),
    };
  }

  public resolveNormalizedConfig(input: {
    provider?: TtsProviderId;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
  }): VoiceConfigDescriptor {
    const runtime = this.audioCacheService.ttsService.getConfigSnapshot();
    const provider: TtsProviderId = input.provider || runtime.providerPriority[0] || 'gemini';
    const status = this.audioCacheService.ttsService
      .listProviderStatuses()
      .find((p) => p.id === provider);
    const modelId = (input.modelId || '').trim() || status?.defaultModel || runtime.geminiModel;
    const voiceId = (input.voiceId || '').trim() || status?.defaultVoice || runtime.geminiVoice;
    const speed = Math.max(0.5, Math.min(2.0, Number(input.speed ?? 1.0) || 1.0));
    const style =
      input.style !== undefined
        ? String(input.style).trim()
        : provider === 'gemini'
          ? runtime.geminiStyle
          : '';
    return { provider, modelId, voiceId, speed: Number(speed.toFixed(2)), style };
  }

  public async createVoicePreview(params: {
    provider?: TtsProviderId;
    modelId?: string;
    voiceId?: string;
    voiceProfile?: NeutralVoiceProfileId;
    speed?: number;
    style?: string;
    productId?: string;
    transcript?: string;
  }): Promise<{
    preview: VoiceApprovalRecord;
    voiceProfile: NeutralVoiceProfileId;
    limitations: string[];
    durationSec: number;
    mimeType: string;
    cacheHit: boolean;
  }> {
    const explicitProvider = params.provider;
    const voiceProfile: NeutralVoiceProfileId =
      params.voiceProfile && isNeutralVoiceProfileId(params.voiceProfile)
        ? params.voiceProfile
        : inferNeutralVoiceProfile(params.voiceId);
    const speed = Number(Math.max(0.5, Math.min(2.0, Number(params.speed ?? 1.0) || 1.0)).toFixed(2));
    const style = String(params.style ?? '').trim();

    let sampleText = (params.transcript || '').replace(/\s+/g, ' ').trim();
    if (!sampleText && params.productId) {
      const item = this.audioCacheService.getAdminAudioItem('product', params.productId);
      sampleText = (item?.transcript || item?.defaultTranscript || '').trim();
    }
    if (!sampleText) {
      const firstProd = this.v28Db.listProducts({ status: 'active', page: 1, limit: 1 }).items[0];
      if (firstProd) {
        const item = this.audioCacheService.getAdminAudioItem('product', firstProd.id);
        sampleText = (item?.transcript || item?.defaultTranscript || '').trim();
      }
    }
    if (!sampleText) {
      sampleText =
        'Xin chào quý khách! Em là chuyên viên tư vấn sản phẩm tại Triển lãm Số, rất hân hạnh được giới thiệu các sản phẩm nổi bật hôm nay.';
    }

    // Phase 1.3.2:
    // - When Admin does NOT pin a provider (normal neutral-voice flow), automatically traverse
    //   the official priority chain (Gemini -> Vbee -> Edge) with per-provider voice mapping!
    // - When an explicit provider IS pinned (e.g. strict single-provider test/probe), honor it.
    const cfg = explicitProvider
      ? this.resolveNormalizedConfig({
          provider: explicitProvider,
          modelId: params.modelId,
          voiceId: params.voiceId,
          speed,
          style: params.style,
        })
      : null;

    const effectiveStyle = explicitProvider && cfg ? cfg.style : style;
    const previewEntityId = explicitProvider && cfg
      ? `voice-preview-${computeVoiceConfigSignature(cfg)}`
      : `voice-preview-${voiceProfile}-${speed}-${crypto.createHash('sha256').update(effectiveStyle).digest('hex').slice(0, 8)}`;

    const synth = await this.audioCacheService.synthesizeRealtimeCached({
      text: sampleText,
      entityType: 'faq',
      entityId: previewEntityId,
      slotKey: 'preview',
      preferredProvider: explicitProvider,
      modelId: cfg?.modelId,
      voiceId: explicitProvider ? cfg?.voiceId : undefined,
      voiceProfile: explicitProvider ? undefined : voiceProfile,
      speed,
      style: effectiveStyle,
      sourceType: 'cached',
      allowFallback: !explicitProvider,
      bypassPermissionCooldown: Boolean(explicitProvider),
    });

    const asset = synth.asset;
    if (
      !asset ||
      asset.provider === 'local-fallback' ||
      asset.modelId.includes('local-fallback')
    ) {
      const err = new Error('Không tạo được giọng mẫu thực tế (từ chối dùng âm thanh chime thay thế).') as Error & {
        statusCode?: number;
      };
      err.statusCode = 503;
      throw err;
    }

    // Always compute configSignature from the ACTUAL provider & voice that generated the heard sample.
    // When explicitProvider was requested, keep cfg.modelId/cfg.voiceId alignment for strict config matching.
    const runtime = this.audioCacheService.ttsService.getConfigSnapshot();
    const sigProvider = (explicitProvider && cfg ? cfg.provider : asset.provider) as TtsProviderId;
    const sigModelId = explicitProvider && cfg ? cfg.modelId : asset.modelId;
    const sigVoiceId = explicitProvider && cfg ? cfg.voiceId : asset.voiceId;
    const sigStyle =
      params.style !== undefined
        ? style
        : sigProvider === 'gemini'
          ? runtime.geminiStyle
          : '';
    const actualSig = computeVoiceConfigSignature({
      provider: sigProvider,
      modelId: sigModelId,
      voiceId: sigVoiceId,
      speed,
      style: sigStyle,
    });

    const existing = this.db
      .prepare('SELECT * FROM audio_voice_approvals WHERE config_signature = ?')
      .get(actualSig) as Record<string, unknown> | undefined;

    const approvalId = existing ? String(existing.approval_id) : `vap-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO audio_voice_approvals (
          approval_id, config_signature, provider, model_id, voice_id, speed, style,
          sample_audio_id, sample_transcript, status, approved_by, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'previewed', '', '', ?)
        ON CONFLICT(config_signature) DO UPDATE SET
          sample_audio_id = excluded.sample_audio_id,
          sample_transcript = excluded.sample_transcript,
          status = CASE WHEN audio_voice_approvals.status = 'approved' THEN 'approved' ELSE 'previewed' END`
      )
      .run(
        approvalId,
        actualSig,
        asset.provider,
        asset.modelId,
        asset.voiceId,
        speed,
        effectiveStyle,
        asset.audioId,
        sampleText,
        nowIso
      );

    const row = this.db
      .prepare('SELECT * FROM audio_voice_approvals WHERE config_signature = ?')
      .get(actualSig) as Record<string, unknown>;

    const limitations = getProviderFeatureLimitations(asset.provider as TtsProviderId, {
      speed,
      style: effectiveStyle,
    });

    return {
      preview: this.mapRow(row),
      voiceProfile,
      limitations,
      durationSec: asset.durationSec,
      mimeType: asset.mimeType,
      cacheHit: synth.cacheHit,
    };
  }

  public approveVoiceConfig(params: {
    configSignature: string;
    adminUsername: string;
  }): VoiceApprovalRecord {
    const sig = String(params.configSignature || '').trim();
    if (!sig) {
      const err = new Error('Thiếu mã cấu hình giọng (configSignature).') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    const existing = this.db
      .prepare('SELECT * FROM audio_voice_approvals WHERE config_signature = ?')
      .get(sig) as Record<string, unknown> | undefined;
    if (!existing || !existing.sample_audio_id) {
      const err = new Error(
        'Vui lòng tạo và nghe thử mẫu giọng trước khi xác nhận duyệt giọng này.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE audio_voice_approvals
         SET status = 'approved', approved_by = ?, approved_at = ?
         WHERE config_signature = ?`
      )
      .run(params.adminUsername || 'admin', nowIso, sig);

    const updated = this.db
      .prepare('SELECT * FROM audio_voice_approvals WHERE config_signature = ?')
      .get(sig) as Record<string, unknown>;
    return this.mapRow(updated);
  }

  public getApprovedConfig(input: {
    provider?: TtsProviderId;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
  }): VoiceApprovalRecord | null {
    const cfg = this.resolveNormalizedConfig(input);
    const sig = computeVoiceConfigSignature(cfg);
    const row = this.db
      .prepare(
        `SELECT * FROM audio_voice_approvals WHERE config_signature = ? AND status = 'approved'`
      )
      .get(sig) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public getApprovalBySignature(sig: string): VoiceApprovalRecord | null {
    const row = this.db
      .prepare('SELECT * FROM audio_voice_approvals WHERE config_signature = ?')
      .get(sig) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listApprovals(limit = 20): VoiceApprovalRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM audio_voice_approvals ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`
      )
      .all(Math.max(1, Math.min(50, limit))) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }
}
