import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../ttsConfig.js';
import {
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
 * Official verified Gemini TTS prebuilt voices (ai.google.dev/docs/speech-generation).
 * Kore is the recommended clear Vietnamese female consultant voice.
 */
export const GEMINI_TTS_VOICES: readonly TtsVoiceOption[] = [
  {
    id: 'Kore',
    label: 'Gemini Kore (Nữ - Rõ ràng, chuyên nghiệp)',
    provider: 'gemini',
    language: 'vi-VN',
    gender: 'female',
    region: 'neutral',
    description: 'Giọng nữ rõ ràng, đĩnh đạc, phù hợp chuyên viên tư vấn sản phẩm.',
    recommended: true,
  },
  {
    id: 'Aoede',
    label: 'Gemini Aoede (Nữ - Tự nhiên, nhẹ nhàng)',
    provider: 'gemini',
    language: 'vi-VN',
    gender: 'female',
    region: 'neutral',
    description: 'Giọng nữ tự nhiên, thân thiện, phù hợp lời chào và giới thiệu gian hàng.',
  },
  {
    id: 'Zephyr',
    label: 'Gemini Zephyr (Nữ - Tươi sáng, năng động)',
    provider: 'gemini',
    language: 'vi-VN',
    gender: 'female',
    region: 'neutral',
    description: 'Giọng nữ tươi sáng, linh hoạt cho sản phẩm tiêu dùng và nông sản.',
  },
  {
    id: 'Leda',
    label: 'Gemini Leda (Nữ - Trẻ trung)',
    provider: 'gemini',
    language: 'vi-VN',
    gender: 'female',
    region: 'neutral',
    description: 'Giọng nữ trẻ trung, gần gũi.',
  },
  {
    id: 'Puck',
    label: 'Gemini Puck (Nam - Rõ ràng, tự nhiên)',
    provider: 'gemini',
    language: 'vi-VN',
    gender: 'male',
    region: 'neutral',
    description: 'Giọng nam rõ ràng, tự nhiên cho tư vấn sản phẩm.',
  },
];

function isValidWav(buf: Buffer): boolean {
  return (
    buf.length > 44 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  );
}

function wrapPcm16AsWav(raw: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  if (isValidWav(raw)) return raw;
  const dataBytes = raw.length;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, raw]);
}

function extractGenerateContentAudioBase64(payload: unknown): { data: string; mimeType?: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const candidates = obj.candidates;
  if (Array.isArray(candidates)) {
    for (const cand of candidates) {
      const content = (cand as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
      const parts = content?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const inline = ((part as Record<string, unknown>)?.inlineData ||
          (part as Record<string, unknown>)?.inline_data) as Record<string, unknown> | undefined;
        if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
          return {
            data: inline.data,
            mimeType:
              typeof inline.mimeType === 'string'
                ? inline.mimeType
                : typeof inline.mime_type === 'string'
                  ? inline.mime_type
                  : undefined,
          };
        }
      }
    }
  }
  // Also support Interactions API shape (`steps[].content[]` / `outputs[]` / `output_audio`)
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

export class GeminiTtsProvider implements TtsProviderAdapter {
  public readonly id = 'gemini' as const;
  public readonly displayName = 'Gemini Audio TTS';
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
    return cfg.geminiApiKey.length > 10;
  }

  public isEnabled(): boolean {
    const cfg = this.getConfig();
    return cfg.geminiEnabled && this.isConfigured();
  }

  public listVoices(): TtsVoiceOption[] {
    return [...GEMINI_TTS_VOICES];
  }

  public getStatus(priorityRank = 1): TtsProviderStatus {
    const cfg = this.getConfig();
    const configured = this.isConfigured();
    const enabled = this.isEnabled();
    return {
      id: this.id,
      displayName: this.displayName,
      enabled: cfg.geminiEnabled,
      configured,
      available: enabled,
      defaultModel: cfg.geminiModel,
      defaultVoice: cfg.geminiVoice,
      audioFormat: 'wav',
      priorityRank,
      paidApi: this.paidApi,
      voices: this.listVoices(),
      notes: 'Provider chính. Hỗ trợ tiếng Việt tự nhiên qua Gemini API (generateContent / interactions).',
      ...(cfg.geminiEnabled && !configured
        ? { reason: 'Thiếu GEMINI_API_KEY trong BE/.env.' }
        : !cfg.geminiEnabled
          ? { reason: 'Đã tắt bởi cấu hình TTS_GEMINI_ENABLED=false.' }
          : {}),
    };
  }

  public async synthesize(req: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const cfg = this.getConfig();
    if (!cfg.geminiEnabled) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'disabled',
        message: 'Gemini Audio TTS đang bị tắt trong cấu hình.',
      });
    }
    if (!this.isConfigured()) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'config_missing',
        message: 'Thiếu GEMINI_API_KEY cho Gemini Audio TTS.',
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

    const modelId = req.modelId?.trim() || cfg.geminiModel;
    const voiceId = req.voiceId?.trim() || cfg.geminiVoice;
    const style = req.style?.trim() || cfg.geminiStyle;
    const language = req.language?.trim() || 'vi-VN';
    const timeoutMs = req.timeoutMs ?? cfg.timeoutMs;
    const t0 = Date.now();

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    const isInteractions = cfg.geminiApiMode === 'interactions';
    const url = isInteractions
      ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

    const body = isInteractions
      ? {
          model: modelId,
          input: [
            {
              type: 'user_input',
              content: [
                {
                  type: 'text',
                  text,
                  annotations: [{ type: 'speech_metadata', style }],
                },
              ],
            },
          ],
          response_format: { type: 'audio' },
          generation_config: {
            speech_config: [{ voice: voiceId }],
          },
        }
      : {
          contents: [
            {
              role: 'user',
              parts: [{ text: style ? `[Style: ${style}]\n${text}` : text }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceId,
                },
              },
            },
          },
        };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cfg.geminiApiKey,
        },
        signal,
        body: JSON.stringify(body),
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
            ? `Gemini TTS quá thời gian chờ (${timeoutMs}ms).`
            : `Lỗi kết nối Gemini TTS: ${(err as Error).message}`
        ),
      });
    }

    if (!res.ok) {
      const errSnippet = redactTtsSecrets(await res.text().catch(() => '')).slice(0, 220);
      if (res.status === 401 || res.status === 403) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'permission_denied',
          statusCode: res.status,
          message: `Gemini TTS không có quyền truy cập (HTTP ${res.status}): ${errSnippet}`,
          retryable: false,
        });
      }
      if (res.status === 429) {
        const isQuota = /quota|exhausted|billing/i.test(errSnippet);
        throw new TtsProviderError({
          provider: this.id,
          kind: isQuota ? 'quota_exhausted' : 'rate_limit',
          statusCode: 429,
          message: `Gemini TTS giới hạn tần suất/hạn mức (HTTP 429): ${errSnippet}`,
          retryable: !isQuota,
        });
      }
      if (res.status === 400) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'input_error',
          statusCode: 400,
          message: `Yêu cầu Gemini TTS không hợp lệ (HTTP 400): ${errSnippet}`,
          retryable: false,
        });
      }
      throw new TtsProviderError({
        provider: this.id,
        kind: 'unavailable',
        statusCode: res.status >= 500 ? 503 : res.status,
        message: `Gemini TTS trả về HTTP ${res.status}: ${errSnippet}`,
      });
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'Gemini TTS trả về JSON không hợp lệ.',
      });
    }

    const extracted = extractGenerateContentAudioBase64(payload);
    if (!extracted?.data) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'Gemini TTS không trả về dữ liệu audio hợp lệ.',
      });
    }

    const rawBuf = Buffer.from(extracted.data, 'base64');
    if (rawBuf.length < 64) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'Dữ liệu audio từ Gemini TTS quá ngắn hoặc rỗng.',
      });
    }

    const wavBuffer = wrapPcm16AsWav(rawBuf, 24000, 1, 16);
    const durationSec = estimateAudioDurationSec(wavBuffer, 'audio/wav', text.length);

    return {
      buffer: wavBuffer,
      mimeType: 'audio/wav',
      audioFormat: 'wav',
      durationSec,
      provider: this.id,
      modelId,
      voiceId,
      language,
      synthMs: Date.now() - t0,
      estimatedChars: text.length,
    };
  }
}
