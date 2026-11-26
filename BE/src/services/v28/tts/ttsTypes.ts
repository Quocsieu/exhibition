export type TtsProviderId = 'gemini' | 'vbee' | 'edge' | 'fpt' | 'local-fallback';

export type NeutralVoiceProfileId = 'female_standard' | 'male_standard' | 'female_warm';

export interface NeutralVoiceProfile {
  id: NeutralVoiceProfileId;
  label: string;
  gender: 'female' | 'male';
  description: string;
  recommended?: boolean;
  providerVoices: Record<'gemini' | 'vbee' | 'edge', string>;
}

/**
 * Provider-agnostic voice profiles shown in Admin UI.
 * Backend maps each profile to verified voice IDs for Gemini -> Vbee -> Edge.
 */
export const NEUTRAL_VOICE_PROFILES: readonly NeutralVoiceProfile[] = [
  {
    id: 'female_standard',
    label: 'Giọng nữ tiêu chuẩn (Rõ ràng, chuyên nghiệp)',
    gender: 'female',
    description: 'Phù hợp giới thiệu gian hàng và tư vấn thông số sản phẩm.',
    recommended: true,
    providerVoices: {
      gemini: 'Kore',
      vbee: 'hn_female_ngochuyen_full_48k-fhg',
      edge: 'vi-VN-HoaiMyNeural',
    },
  },
  {
    id: 'male_standard',
    label: 'Giọng nam tiêu chuẩn (Trầm ấm, tự nhiên)',
    gender: 'male',
    description: 'Giọng nam rõ ràng, tạo cảm giác tin cậy khi tư vấn.',
    providerVoices: {
      gemini: 'Puck',
      vbee: 'hn_male_manhdung_news_48k-fhg',
      edge: 'vi-VN-NamMinhNeural',
    },
  },
  {
    id: 'female_warm',
    label: 'Giọng nữ thân thiện (Nhẹ nhàng, gần gũi)',
    gender: 'female',
    description: 'Phù hợp lời chào đón khách tham quan và sản phẩm nông sản/tiêu dùng.',
    providerVoices: {
      gemini: 'Aoede',
      vbee: 'sg_female_thaotrinh_full_48k-fhg',
      edge: 'vi-VN-HoaiMyNeural',
    },
  },
];

export function isNeutralVoiceProfileId(value: unknown): value is NeutralVoiceProfileId {
  return value === 'female_standard' || value === 'male_standard' || value === 'female_warm';
}

export function inferNeutralVoiceProfile(voiceOrProfile?: string): NeutralVoiceProfileId {
  const raw = String(voiceOrProfile || '').trim();
  if (isNeutralVoiceProfileId(raw)) return raw;
  const lower = raw.toLowerCase();
  if (
    lower === 'puck' ||
    lower === 'vi-vn-namminhneural' ||
    lower.includes('_male_') ||
    lower.includes('namminh') ||
    lower === 'male'
  ) {
    return 'male_standard';
  }
  if (lower === 'aoede' || lower === 'zephyr' || lower === 'leda' || lower.includes('thaotrinh')) {
    return 'female_warm';
  }
  return 'female_standard';
}

/**
 * Resolves the verified voice ID for a specific provider from either a neutral profile
 * or a provider-specific voice ID (avoiding invalid cross-provider voice IDs like passing
 * Gemini's "Kore" to Microsoft Edge Neural TTS).
 */
export function resolveVoiceIdForProvider(
  voiceProfileOrId: string | undefined,
  providerId: TtsProviderId
): string | undefined {
  if (providerId === 'local-fallback' || providerId === 'fpt') {
    return undefined;
  }
  const raw = String(voiceProfileOrId || '').trim();
  if (!raw) {
    return NEUTRAL_VOICE_PROFILES[0].providerVoices[providerId];
  }
  if (isNeutralVoiceProfileId(raw)) {
    const profile = NEUTRAL_VOICE_PROFILES.find((p) => p.id === raw) || NEUTRAL_VOICE_PROFILES[0];
    return profile.providerVoices[providerId];
  }
  // If raw already belongs to this provider, preserve it verbatim
  if (providerId === 'edge' && /^vi-VN-[A-Za-z]+Neural$/i.test(raw)) return raw;
  if (providerId === 'gemini' && /^(Kore|Aoede|Zephyr|Leda|Puck|Charon|Fenrir)$/i.test(raw)) return raw;
  if (providerId === 'vbee' && /^[a-z]{2}_(female|male)_/i.test(raw)) return raw;

  // Otherwise map via inferred neutral profile to a verified voice ID for this provider
  const inferred = inferNeutralVoiceProfile(raw);
  const profile = NEUTRAL_VOICE_PROFILES.find((p) => p.id === inferred) || NEUTRAL_VOICE_PROFILES[0];
  return profile.providerVoices[providerId];
}

export function getProviderFeatureLimitations(
  providerId: TtsProviderId,
  params: { speed?: number; style?: string }
): string[] {
  const notes: string[] = [];
  const hasStyle = Boolean(String(params.style || '').trim());
  if (hasStyle && (providerId === 'edge' || providerId === 'vbee')) {
    notes.push(
      'Engine giọng đọc đang hoạt động hỗ trợ điều chỉnh tốc độ đọc, chưa hỗ trợ tùy biến phong cách (style) bằng mô tả văn bản.'
    );
  }
  return notes;
}

export type TtsErrorKind =
  | 'input_error'
  | 'config_missing'
  | 'disabled'
  | 'permission_denied'
  | 'timeout'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'unavailable'
  | 'network_error'
  | 'invalid_audio'
  | 'budget_exceeded';

export interface TtsVoiceOption {
  id: string;
  label: string;
  provider: TtsProviderId;
  language: string;
  gender: 'female' | 'male';
  region?: 'north' | 'south' | 'central' | 'neutral';
  description: string;
  recommended?: boolean;
}

export interface TtsSynthesisRequest {
  text: string;
  language?: string;
  voiceId?: string;
  voiceProfile?: NeutralVoiceProfileId;
  modelId?: string;
  speed?: number;
  style?: string;
  audioFormat?: 'wav' | 'mp3';
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TtsSynthesisResult {
  buffer: Buffer;
  mimeType: string;
  audioFormat: 'wav' | 'mp3';
  durationSec: number;
  provider: TtsProviderId;
  modelId: string;
  voiceId: string;
  language: string;
  synthMs: number;
  estimatedChars: number;
}

export type TtsProviderHealthState =
  | 'unconfigured'
  | 'configured_unverified'
  | 'ready_verified'
  | 'permission_denied'
  | 'quota_exhausted'
  | 'cooldown_locked'
  | 'unavailable'
  | 'disabled';

export interface TtsProviderStatus {
  id: TtsProviderId;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  healthState?: TtsProviderHealthState;
  healthLabel?: string;
  cooldownRemainingSec?: number;
  lastError?: string;
  lastCheckedAt?: string;
  defaultModel: string;
  defaultVoice: string;
  audioFormat: 'wav' | 'mp3';
  priorityRank: number;
  paidApi: boolean;
  notes: string;
  reason?: string;
  voices: TtsVoiceOption[];
}

export class TtsProviderError extends Error {
  public readonly provider: TtsProviderId;
  public readonly kind: TtsErrorKind;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(params: {
    provider: TtsProviderId;
    kind: TtsErrorKind;
    message: string;
    statusCode?: number;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = 'TtsProviderError';
    this.provider = params.provider;
    this.kind = params.kind;
    this.statusCode = params.statusCode ?? (params.kind === 'input_error' ? 400 : 503);
    this.retryable =
      params.retryable ??
      (params.kind === 'timeout' ||
        params.kind === 'unavailable' ||
        params.kind === 'network_error');
  }
}

export interface TtsProviderAdapter {
  readonly id: TtsProviderId;
  readonly displayName: string;
  readonly paidApi: boolean;
  isConfigured(): boolean;
  isEnabled(): boolean;
  getStatus(priorityRank?: number): TtsProviderStatus;
  listVoices(): TtsVoiceOption[];
  synthesize(req: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}

/**
 * Redacts any API keys or bearer tokens from error strings before returning or logging.
 */
export function redactTtsSecrets(raw: string): string {
  return String(raw || '')
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/api_key["':=\s]+[A-Za-z0-9._-]{8,}/gi, 'api_key=[REDACTED]')
    .replace(/Ocp-Apim-Subscription-Key["':=\s]+[A-Za-z0-9._-]{8,}/gi, 'Ocp-Apim-Subscription-Key=[REDACTED]');
}

/**
 * Validates audio buffer magic bytes across WAV, MP3, OGG, M4A/MP4, WebM.
 */
export function detectAudioMimeFromMagicBytes(buf: Buffer | null | undefined): string | null {
  if (!buf || buf.length < 12) return null;
  // RIFF....WAVE
  if (
    buf.length > 44 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }
  // ID3 tag (MP3)
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') {
    return 'audio/mpeg';
  }
  // MPEG audio frame sync (0xFF 0xE0..0xFF)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  // OggS
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }
  // MP4 / M4A (....ftyp)
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'audio/mp4';
  }
  // WebM / Matroska (EBML header 1A 45 DF A3)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'audio/webm';
  }
  return null;
}

export function isValidAudioBuffer(buf: Buffer | null | undefined, expectedMime?: string): boolean {
  const detected = detectAudioMimeFromMagicBytes(buf);
  if (!detected) return false;
  if (!expectedMime) return true;
  const norm = expectedMime.toLowerCase();
  if (norm.includes('wav')) return detected === 'audio/wav';
  if (norm.includes('mpeg') || norm.includes('mp3')) return detected === 'audio/mpeg';
  if (norm.includes('ogg')) return detected === 'audio/ogg';
  if (norm.includes('mp4') || norm.includes('m4a')) return detected === 'audio/mp4';
  if (norm.includes('webm')) return detected === 'audio/webm';
  return true;
}

export function estimateAudioDurationSec(buf: Buffer, mimeType: string, textLength = 60): number {
  const lower = mimeType.toLowerCase();
  if (lower.includes('wav') && buf.length > 44) {
    // Read byteRate from WAV header bytes 28..31 if valid
    const byteRate = buf.readUInt32LE(28);
    if (byteRate >= 8000 && byteRate <= 384000) {
      return Math.max(0.4, Math.round(((buf.length - 44) / byteRate) * 10) / 10);
    }
    return Math.max(0.4, Math.round(((buf.length - 44) / 48000) * 10) / 10);
  }
  if (lower.includes('mpeg') || lower.includes('mp3')) {
    // Typical 128 kbps MP3 = 16,000 bytes/sec
    return Math.max(0.5, Math.round((buf.length / 16000) * 10) / 10);
  }
  return Math.max(0.8, Math.round((textLength / 15) * 10) / 10);
}

/**
 * Vietnamese evaluation test sentences covering product names, prices, units, quantities,
 * brands, and agricultural domain terms (Phase 1.1).
 */
export const VIETNAMESE_TTS_TEST_SENTENCES: ReadonlyArray<{
  id: string;
  category: string;
  text: string;
}> = [
  {
    id: 'agri-rice',
    category: 'Nông sản & Giá tiền',
    text: 'Xin chào quý khách! Đây là Gạo ST25 Ông Cua đạt chuẩn OCOP 5 sao, đóng gói túi 5 kg với mức giá niêm yết 245.000 VNĐ.',
  },
  {
    id: 'agri-coffee',
    category: 'Thương hiệu & Đơn vị đo',
    text: 'Cà phê Arabica Cầu Đất rang mộc nguyên chất 100%, hộp 500 g, độ ẩm dưới 5%, giá ưu đãi tại triển lãm chỉ 189.000 đồng một hộp.',
  },
  {
    id: 'agri-honey',
    category: 'Số lượng & Thông số',
    text: 'Mật ong hoa cà phê Tây Nguyên chai thủy tinh 750 ml, mua combo 3 chai được tặng thêm 1 lọ phấn hoa 200 g, tổng giá 420.000 VNĐ.',
  },
  {
    id: 'agri-welcome',
    category: 'Lời chào chuyên viên tư vấn',
    text: 'Chào mừng quý khách đến với Triển lãm Số Con Đường Nông Sản Việt Nam. Em là chuyên viên tư vấn sản phẩm, rất hân hạnh được đồng hành cùng quý khách hôm nay.',
  },
];
