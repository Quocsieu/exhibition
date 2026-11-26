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
 * Verified FPT.AI TTS v5 voices (api.fpt.ai/hmi/tts/v5).
 * STRICTLY DISABLED BY DEFAULT — never called automatically and never incurs cost unless
 * BOTH `TTS_FPT_ENABLED=true` AND `TTS_ALLOW_PAID_FPT=true` AND `FPT_AI_API_KEY` are explicitly set.
 */
export const FPT_TTS_VOICES: readonly TtsVoiceOption[] = [
  {
    id: 'banmai',
    label: 'FPT Ban Mai (Nữ Miền Bắc)',
    provider: 'fpt',
    language: 'vi-VN',
    gender: 'female',
    region: 'north',
    description: 'Giọng nữ miền Bắc chuẩn FPT.AI (mặc định tắt).',
    recommended: true,
  },
  {
    id: 'lannhi',
    label: 'FPT Lan Nhi (Nữ Miền Nam)',
    provider: 'fpt',
    language: 'vi-VN',
    gender: 'female',
    region: 'south',
    description: 'Giọng nữ miền Nam FPT.AI (mặc định tắt).',
  },
  {
    id: 'thuminh',
    label: 'FPT Thu Minh (Nữ Miền Bắc)',
    provider: 'fpt',
    language: 'vi-VN',
    gender: 'female',
    region: 'north',
    description: 'Giọng nữ miền Bắc truyền cảm FPT.AI (mặc định tắt).',
  },
];

export class FptTtsProvider implements TtsProviderAdapter {
  public readonly id = 'fpt' as const;
  public readonly displayName = 'FPT.AI TTS (Mở rộng tương lai)';
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
    return cfg.fptApiKey.length > 8;
  }

  public isEnabled(): boolean {
    const cfg = this.getConfig();
    // Double opt-in guard so FPT.AI is NEVER accidentally called or billed
    return cfg.fptEnabled && cfg.fptAllowPaid && this.isConfigured();
  }

  public listVoices(): TtsVoiceOption[] {
    return [...FPT_TTS_VOICES];
  }

  public getStatus(priorityRank = 99): TtsProviderStatus {
    const cfg = this.getConfig();
    const configured = this.isConfigured();
    const enabled = this.isEnabled();
    return {
      id: this.id,
      displayName: this.displayName,
      enabled: cfg.fptEnabled && cfg.fptAllowPaid,
      configured,
      available: enabled,
      defaultModel: 'fpt-tts-v5',
      defaultVoice: cfg.fptVoice,
      audioFormat: 'mp3',
      priorityRank,
      paidApi: this.paidApi,
      voices: this.listVoices(),
      notes: 'Chuẩn bị sẵn giao diện mở rộng. Mặc định vô hiệu hóa để không phát sinh chi phí.',
      ...(!enabled
        ? {
            reason:
              'Vô hiệu hóa mặc định (chỉ kích hoạt khi có TTS_FPT_ENABLED=true, TTS_ALLOW_PAID_FPT=true và FPT_AI_API_KEY).',
          }
        : {}),
    };
  }

  public async synthesize(req: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    if (!this.isEnabled()) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'disabled',
        message: 'FPT.AI TTS đang bị vô hiệu hóa mặc định — không gọi API.',
        retryable: false,
      });
    }

    const cfg = this.getConfig();
    const text = req.text.trim();
    if (text.length < 3 || text.length > 5000) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'input_error',
        statusCode: 400,
        message: 'FPT.AI TTS yêu cầu độ dài văn bản từ 3 đến 5.000 ký tự.',
        retryable: false,
      });
    }

    const voiceId = req.voiceId?.trim() || cfg.fptVoice;
    const format: 'mp3' | 'wav' = req.audioFormat === 'wav' ? 'wav' : 'mp3';
    const speedNum = Math.max(-3, Math.min(3, Math.round(((req.speed ?? 1.0) - 1.0) * 3)));
    const timeoutMs = req.timeoutMs ?? cfg.timeoutMs;
    const t0 = Date.now();

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    let res: Response;
    try {
      res = await this.fetchFn(cfg.fptEndpoint, {
        method: 'POST',
        headers: {
          api_key: cfg.fptApiKey,
          voice: voiceId,
          speed: String(speedNum),
          format,
          'Cache-Control': 'no-cache',
        },
        signal,
        body: text,
      });
    } catch (err) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'network_error',
        message: redactTtsSecrets(`Lỗi kết nối FPT.AI TTS: ${(err as Error).message}`),
      });
    }

    if (!res.ok) {
      const snippet = redactTtsSecrets(await res.text().catch(() => '')).slice(0, 200);
      throw new TtsProviderError({
        provider: this.id,
        kind: res.status === 429 ? 'rate_limit' : 'unavailable',
        statusCode: res.status,
        message: `FPT.AI TTS trả về HTTP ${res.status}: ${snippet}`,
      });
    }

    const json = (await res.json()) as { async?: string; message?: string; error?: number };
    const asyncUrl =
      (typeof json.async === 'string' && json.async) ||
      (typeof json.message === 'string' && /^https?:\/\//i.test(json.message) ? json.message : '');
    if (!asyncUrl) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'FPT.AI TTS không trả về URL âm thanh hợp lệ.',
      });
    }

    // Bounded short poll for async FPT audio readiness (max 3 attempts)
    let audioBuffer: Buffer | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const dlRes = await this.fetchFn(asyncUrl, { method: 'GET', signal });
      if (dlRes.ok) {
        const buf = Buffer.from(await dlRes.arrayBuffer());
        if (detectAudioMimeFromMagicBytes(buf)) {
          audioBuffer = buf;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    if (!audioBuffer) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'Không thể tải tệp âm thanh từ FPT.AI TTS trong thời gian cho phép.',
      });
    }

    const detectedMime = detectAudioMimeFromMagicBytes(audioBuffer) || 'audio/mpeg';
    return {
      buffer: audioBuffer,
      mimeType: detectedMime,
      audioFormat: detectedMime === 'audio/wav' ? 'wav' : 'mp3',
      durationSec: estimateAudioDurationSec(audioBuffer, detectedMime, text.length),
      provider: this.id,
      modelId: 'fpt-tts-v5',
      voiceId,
      language: req.language || 'vi-VN',
      synthMs: Date.now() - t0,
      estimatedChars: text.length,
    };
  }
}
