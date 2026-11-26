import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../ttsConfig.js';
import {
  detectAudioMimeFromMagicBytes,
  estimateAudioDurationSec,
  redactTtsSecrets,
  TtsProviderError,
  type TtsProviderAdapter,
  type TtsProviderStatus,
  type TtsSynthesisRequest,
  type TtsSynthesisResult,
  type TtsVoiceOption,
} from '../ttsTypes.js';

/**
 * Verified Vbee AIVoice Vietnamese female voice codes (api-docs.vbee.vn).
 */
export const VBEE_TTS_VOICES: readonly TtsVoiceOption[] = [
  {
    id: 'hn_female_ngochuyen_full_48k-fhg',
    label: 'Vbee Ngọc Huyền (Nữ Miền Bắc - Thuyết minh)',
    provider: 'vbee',
    language: 'vi-VN',
    gender: 'female',
    region: 'north',
    description: 'Giọng nữ miền Bắc chuẩn phát thanh viên/thuyết minh sản phẩm.',
    recommended: true,
  },
  {
    id: 'sg_female_thaotrinh_full_48k-fhg',
    label: 'Vbee Thảo Trinh (Nữ Miền Nam - Thân thiện)',
    provider: 'vbee',
    language: 'vi-VN',
    gender: 'female',
    region: 'south',
    description: 'Giọng nữ miền Nam tự nhiên, ấm áp.',
  },
  {
    id: 'hn_female_maiphuong_vdts_48k-fhg',
    label: 'Vbee Mai Phương (Nữ Miền Bắc - Bản tin)',
    provider: 'vbee',
    language: 'vi-VN',
    gender: 'female',
    region: 'north',
    description: 'Giọng nữ miền Bắc rõ ràng, mạch lạc.',
  },
];

export class VbeeTtsProvider implements TtsProviderAdapter {
  public readonly id = 'vbee' as const;
  public readonly displayName = 'Vbee TTS';
  public readonly paidApi = true;

  private readonly fetchFn: typeof fetch;
  private readonly getConfig: () => HybridTtsRuntimeConfig;

  constructor(options?: {
    fetchFn?: typeof fetch;
    getConfig?: () => HybridTtsRuntimeConfig;
  }) {
    this.fetchFn = options?.fetchFn ?? ((input, init) => fetch(input, init));
    this.getConfig = options?.getConfig ?? (() => resolveHybridTtsConfig());
  }

  public isConfigured(): boolean {
    const cfg = this.getConfig();
    return cfg.vbeeApiToken.length > 8 && cfg.vbeeAppId.length > 2;
  }

  public isEnabled(): boolean {
    const cfg = this.getConfig();
    return cfg.vbeeEnabled && this.isConfigured();
  }

  public listVoices(): TtsVoiceOption[] {
    return [...VBEE_TTS_VOICES];
  }

  public getStatus(priorityRank = 2): TtsProviderStatus {
    const cfg = this.getConfig();
    const configured = this.isConfigured();
    const enabled = this.isEnabled();
    return {
      id: this.id,
      displayName: this.displayName,
      enabled: cfg.vbeeEnabled,
      configured,
      available: enabled,
      defaultModel: 'vbee-tts-v1',
      defaultVoice: cfg.vbeeVoice,
      audioFormat: cfg.vbeeFormat,
      priorityRank,
      paidApi: this.paidApi,
      voices: this.listVoices(),
      notes: 'Fallback thứ nhất. Giọng tiếng Việt chuyên biệt (Ngọc Huyền, Thảo Trinh, Mai Phương).',
      ...(cfg.vbeeEnabled && !configured
        ? { reason: 'Thiếu VBEE_API_TOKEN hoặc VBEE_APP_ID trong BE/.env.' }
        : !cfg.vbeeEnabled
          ? { reason: 'Đã tắt bởi cấu hình TTS_VBEE_ENABLED=false.' }
          : {}),
    };
  }

  public async synthesize(req: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const cfg = this.getConfig();
    if (!cfg.vbeeEnabled) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'disabled',
        message: 'Vbee TTS đang bị tắt trong cấu hình.',
      });
    }
    if (!this.isConfigured()) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'config_missing',
        message: 'Thiếu VBEE_API_TOKEN hoặc VBEE_APP_ID cho Vbee TTS.',
      });
    }

    const text = req.text.trim();
    if (!text) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'input_error',
        message: 'Nội dung văn bản không được để trống.',
        statusCode: 400,
        retryable: false,
      });
    }

    const voiceId = req.voiceId?.trim() || cfg.vbeeVoice;
    const format: 'mp3' | 'wav' = req.audioFormat || cfg.vbeeFormat;
    const speed = Math.max(0.5, Math.min(2.0, Number(req.speed ?? 1.0) || 1.0));
    const language = req.language?.trim() || 'vi-VN';
    const timeoutMs = req.timeoutMs ?? cfg.timeoutMs;
    const t0 = Date.now();

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    let res: Response;
    try {
      res = await this.fetchFn(cfg.vbeeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.vbeeApiToken}`,
          'App-Id': cfg.vbeeAppId,
        },
        signal,
        body: JSON.stringify({
          app_id: cfg.vbeeAppId,
          input_text: text,
          voice_code: voiceId,
          speed_rate: speed,
          speed,
          audio_type: format,
          format,
          response_type: 'direct',
        }),
      });
    } catch (err) {
      const isTimeout =
        (err as { name?: string })?.name === 'TimeoutError' ||
        (err as { name?: string })?.name === 'AbortError';
      throw new TtsProviderError({
        provider: this.id,
        kind: isTimeout ? 'timeout' : 'network_error',
        message: redactTtsSecrets(
          isTimeout
            ? `Vbee TTS quá thời gian chờ (${timeoutMs}ms).`
            : `Lỗi kết nối Vbee TTS: ${(err as Error).message}`
        ),
      });
    }

    if (!res.ok) {
      const snippet = redactTtsSecrets(await res.text().catch(() => '')).slice(0, 220);
      if (res.status === 429) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'rate_limit',
          statusCode: 429,
          message: `Vbee TTS giới hạn tần suất (HTTP 429): ${snippet}`,
        });
      }
      if (res.status === 402 || /quota|credit|balance/i.test(snippet)) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'quota_exhausted',
          statusCode: res.status,
          message: `Vbee TTS hết hạn mức sử dụng: ${snippet}`,
          retryable: false,
        });
      }
      if (res.status === 400) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'input_error',
          statusCode: 400,
          message: `Yêu cầu Vbee TTS không hợp lệ (HTTP 400): ${snippet}`,
          retryable: false,
        });
      }
      throw new TtsProviderError({
        provider: this.id,
        kind: 'unavailable',
        statusCode: res.status >= 500 ? 503 : res.status,
        message: `Vbee TTS trả về HTTP ${res.status}: ${snippet}`,
      });
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let audioBuffer: Buffer;

    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      audioBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      let json: Record<string, unknown>;
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'invalid_audio',
          message: 'Vbee TTS trả về phản hồi không phải audio hoặc JSON hợp lệ.',
        });
      }
      const resultObj = (json.result || json.data || json) as Record<string, unknown>;
      const audioLink =
        (typeof resultObj.audio_link === 'string' && resultObj.audio_link) ||
        (typeof resultObj.audioUrl === 'string' && resultObj.audioUrl) ||
        (typeof resultObj.url === 'string' && resultObj.url) ||
        '';
      if (!audioLink || !/^https?:\/\//i.test(audioLink)) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'invalid_audio',
          message: 'Vbee TTS không trả về liên kết audio hợp lệ.',
        });
      }
      let dlRes: Response;
      try {
        dlRes = await this.fetchFn(audioLink, { method: 'GET', signal });
      } catch (err) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'network_error',
          message: redactTtsSecrets(`Không thể tải file audio từ Vbee: ${(err as Error).message}`),
        });
      }
      if (!dlRes.ok) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'unavailable',
          message: `Tải audio Vbee thất bại (HTTP ${dlRes.status}).`,
        });
      }
      audioBuffer = Buffer.from(await dlRes.arrayBuffer());
    }

    const detectedMime = detectAudioMimeFromMagicBytes(audioBuffer);
    if (!detectedMime) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'File audio từ Vbee TTS không hợp lệ hoặc bị hỏng.',
      });
    }

    const actualFormat: 'wav' | 'mp3' = detectedMime === 'audio/wav' ? 'wav' : 'mp3';
    return {
      buffer: audioBuffer,
      mimeType: detectedMime,
      audioFormat: actualFormat,
      durationSec: estimateAudioDurationSec(audioBuffer, detectedMime, text.length),
      provider: this.id,
      modelId: 'vbee-tts-v1',
      voiceId,
      language,
      synthMs: Date.now() - t0,
      estimatedChars: text.length,
    };
  }
}
