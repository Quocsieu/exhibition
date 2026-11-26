import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

/**
 * Resolve the `edge-tts` executable path without requiring the user's shell
 * to activate a Python virtual environment.
 * Priority: EDGE_TTS_BIN env -> ~/.venvs/edge-tts/bin/edge-tts -> PATH lookup.
 */
export function resolveEdgeTtsExecutable(): string | null {
  const candidates: string[] = [];
  const envBin = (process.env.EDGE_TTS_BIN || '').trim();
  if (envBin) {
    candidates.push(envBin);
  }
  candidates.push(path.join(os.homedir(), '.venvs', 'edge-tts', 'bin', 'edge-tts'));

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, 'edge-tts'));
  }

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // continue checking next candidate
    }
  }
  return null;
}

export const EDGE_NEURAL_VOICES: readonly TtsVoiceOption[] = [
  {
    id: 'vi-VN-HoaiMyNeural',
    label: 'Microsoft Hoài My Neural (Nữ Tiếng Việt)',
    provider: 'edge',
    language: 'vi-VN',
    gender: 'female',
    region: 'north',
    description: 'Giọng nữ Neural tiếng Việt tự nhiên, rõ ràng (Microsoft Neural TTS).',
    recommended: true,
  },
  {
    id: 'vi-VN-NamMinhNeural',
    label: 'Microsoft Nam Minh Neural (Nam Tiếng Việt)',
    provider: 'edge',
    language: 'vi-VN',
    gender: 'male',
    region: 'north',
    description: 'Giọng nam Neural tiếng Việt.',
  },
];

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Microsoft Edge Neural TTS / Azure Neural Speech Provider (Fallback #2).
 *
 * Transport modes:
 * 1. Official Azure AI Speech REST API (recommended for commercial/production SLA) when
 *    `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are configured.
 * 2. Optional unofficial `edge-tts` CLI transport ONLY when `TTS_EDGE_UNOFFICIAL_ENABLED=true`
 *    is explicitly enabled (note: unofficial consumer endpoint carries ToS & 403 breakage risk).
 */
export class EdgeNeuralTtsProvider implements TtsProviderAdapter {
  public readonly id = 'edge' as const;
  public readonly displayName = 'Microsoft Edge Neural TTS';
  public readonly paidApi = false;

  private readonly fetchFn: typeof fetch;
  private readonly getConfig: () => HybridTtsRuntimeConfig;
  private readonly customUnofficialSynth?: (params: {
    text: string;
    voiceId: string;
    ratePct: string;
    timeoutMs: number;
  }) => Promise<Buffer>;

  constructor(options?: {
    fetchFn?: typeof fetch;
    getConfig?: () => HybridTtsRuntimeConfig;
    customUnofficialSynth?: (params: {
      text: string;
      voiceId: string;
      ratePct: string;
      timeoutMs: number;
    }) => Promise<Buffer>;
  }) {
    this.fetchFn = options?.fetchFn ?? ((input, init) => fetch(input, init));
    this.getConfig = options?.getConfig ?? (() => resolveHybridTtsConfig());
    this.customUnofficialSynth = options?.customUnofficialSynth;
  }

  private hasOfficialAzure(): boolean {
    const cfg = this.getConfig();
    return cfg.azureSpeechKey.length > 8 && cfg.azureSpeechRegion.length > 1;
  }

  private hasUnofficialCli(): boolean {
    const cfg = this.getConfig();
    if (!cfg.edgeUnofficialEnabled) return false;
    if (this.customUnofficialSynth) return true;
    return resolveEdgeTtsExecutable() !== null;
  }

  public isConfigured(): boolean {
    return this.hasOfficialAzure() || this.hasUnofficialCli();
  }

  public isEnabled(): boolean {
    const cfg = this.getConfig();
    return cfg.edgeEnabled && this.isConfigured();
  }

  public listVoices(): TtsVoiceOption[] {
    return [...EDGE_NEURAL_VOICES];
  }

  public getStatus(priorityRank = 3): TtsProviderStatus {
    const cfg = this.getConfig();
    const official = this.hasOfficialAzure();
    const configured = this.isConfigured();
    const enabled = this.isEnabled();
    return {
      id: this.id,
      displayName: this.displayName,
      enabled: cfg.edgeEnabled,
      configured,
      available: enabled,
      defaultModel: official ? 'azure-neural-tts' : 'edge-neural-tts',
      defaultVoice: cfg.edgeVoice,
      audioFormat: 'mp3',
      priorityRank,
      paidApi: official,
      voices: this.listVoices(),
      notes: official
        ? 'Fallback thứ hai (dùng Azure AI Speech chính thức — ổn định cho production).'
        : 'Fallback thứ hai (vi-VN-HoaiMyNeural). Cảnh báo: thư viện Edge không chính thức có rủi ro ToS/HTTP 403; khuyến nghị cấu hình AZURE_SPEECH_KEY cho production.',
      ...(cfg.edgeEnabled && !configured
        ? {
            reason: cfg.edgeUnofficialEnabled
              ? 'Đã bật TTS_EDGE_UNOFFICIAL_ENABLED=true nhưng chưa tìm thấy binary edge-tts (kiểm tra ~/.venvs/edge-tts/bin/edge-tts hoặc EDGE_TTS_BIN).'
              : 'Chưa cấu hình AZURE_SPEECH_KEY/AZURE_SPEECH_REGION và TTS_EDGE_UNOFFICIAL_ENABLED đang tắt.',
          }
        : !cfg.edgeEnabled
          ? { reason: 'Đã tắt bởi cấu hình TTS_EDGE_ENABLED=false.' }
          : {}),
    };
  }

  private async synthesizeViaOfficialAzure(params: {
    text: string;
    voiceId: string;
    language: string;
    speed: number;
    timeoutMs: number;
    signal?: AbortSignal;
    cfg: HybridTtsRuntimeConfig;
  }): Promise<Buffer> {
    const rateDelta = Math.round((params.speed - 1.0) * 100);
    const rateStr = `${rateDelta >= 0 ? '+' : ''}${rateDelta}%`;
    const ssml = `<speak version='1.0' xml:lang='${escapeXml(params.language)}'><voice xml:lang='${escapeXml(params.language)}' name='${escapeXml(params.voiceId)}'><prosody rate='${rateStr}'>${escapeXml(params.text)}</prosody></voice></speak>`;
    const url = `https://${encodeURIComponent(params.cfg.azureSpeechRegion)}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const timeoutSignal = AbortSignal.timeout(params.timeoutMs);
    const signal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': params.cfg.azureSpeechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'GrandExpoV28TTS/1.0',
        },
        signal,
        body: ssml,
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
            ? `Edge/Azure Neural TTS quá thời gian chờ (${params.timeoutMs}ms).`
            : `Lỗi kết nối Edge/Azure Neural TTS: ${(err as Error).message}`
        ),
      });
    }

    if (!res.ok) {
      const snippet = redactTtsSecrets(await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 429) {
        throw new TtsProviderError({
          provider: this.id,
          kind: 'rate_limit',
          statusCode: 429,
          message: `Edge/Azure Neural TTS giới hạn tần suất (HTTP 429): ${snippet}`,
        });
      }
      throw new TtsProviderError({
        provider: this.id,
        kind: 'unavailable',
        statusCode: res.status >= 500 ? 503 : res.status,
        message: `Edge/Azure Neural TTS trả về HTTP ${res.status}: ${snippet}`,
      });
    }

    return Buffer.from(await res.arrayBuffer());
  }

  private async synthesizeViaUnofficialEdgeCli(params: {
    text: string;
    voiceId: string;
    speed: number;
    timeoutMs: number;
  }): Promise<Buffer> {
    const rateDelta = Math.round((params.speed - 1.0) * 100);
    const ratePct = `${rateDelta >= 0 ? '+' : ''}${rateDelta}%`;

    if (this.customUnofficialSynth) {
      return this.customUnofficialSynth({
        text: params.text,
        voiceId: params.voiceId,
        ratePct,
        timeoutMs: params.timeoutMs,
      });
    }

    const edgeBin = resolveEdgeTtsExecutable();
    if (!edgeBin) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'config_missing',
        message: 'Không tìm thấy binary edge-tts trên máy chủ (kiểm tra ~/.venvs/edge-tts/bin/edge-tts hoặc EDGE_TTS_BIN).',
      });
    }

    const sanitizedText = params.text
      .replace(/[\u2013\u2014]/g, ', ')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tmpFile = path.join(os.tmpdir(), `v28-edge-tts-${crypto.randomBytes(6).toString('hex')}.mp3`);
    try {
      await execFileAsync(
        edgeBin,
        ['--voice', params.voiceId, `--rate=${ratePct}`, '--text', sanitizedText, '--write-media', tmpFile],
        { timeout: params.timeoutMs }
      );
      const buf = await fs.promises.readFile(tmpFile);
      return buf;
    } catch (err) {
      const isTimeout =
        (err as { killed?: boolean; signal?: string; code?: string | number })?.killed === true ||
        (err as { signal?: string })?.signal === 'SIGTERM';
      throw new TtsProviderError({
        provider: this.id,
        kind: isTimeout ? 'timeout' : 'unavailable',
        message: redactTtsSecrets(
          isTimeout
            ? `Edge Neural TTS (unofficial CLI) quá thời gian chờ (${params.timeoutMs}ms).`
            : `Edge Neural TTS (unofficial CLI) không khả dụng trên máy chủ: ${(err as Error).message}`
        ),
      });
    } finally {
      await fs.promises.unlink(tmpFile).catch(() => {});
    }
  }

  public async synthesize(req: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const cfg = this.getConfig();
    if (!cfg.edgeEnabled) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'disabled',
        message: 'Microsoft Edge Neural TTS đang bị tắt trong cấu hình.',
      });
    }
    if (!this.isConfigured()) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'config_missing',
        message: 'Microsoft Edge Neural TTS chưa được cấu hình (AZURE_SPEECH_KEY hoặc TTS_EDGE_UNOFFICIAL_ENABLED).',
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

    const voiceId = req.voiceId?.trim() || cfg.edgeVoice;
    const language = req.language?.trim() || 'vi-VN';
    const speed = Math.max(0.6, Math.min(1.6, Number(req.speed ?? 1.0) || 1.0));
    const timeoutMs = req.timeoutMs ?? cfg.timeoutMs;
    const t0 = Date.now();

    const useOfficial = this.hasOfficialAzure();
    const audioBuffer = useOfficial
      ? await this.synthesizeViaOfficialAzure({
          text,
          voiceId,
          language,
          speed,
          timeoutMs,
          signal: req.signal,
          cfg,
        })
      : await this.synthesizeViaUnofficialEdgeCli({
          text,
          voiceId,
          speed,
          timeoutMs,
        });

    const detectedMime = detectAudioMimeFromMagicBytes(audioBuffer);
    if (!detectedMime) {
      throw new TtsProviderError({
        provider: this.id,
        kind: 'invalid_audio',
        message: 'Dữ liệu audio từ Microsoft Edge Neural TTS không hợp lệ.',
      });
    }

    const audioFormat: 'wav' | 'mp3' = detectedMime === 'audio/wav' ? 'wav' : 'mp3';
    return {
      buffer: audioBuffer,
      mimeType: detectedMime,
      audioFormat,
      durationSec: estimateAudioDurationSec(audioBuffer, detectedMime, text.length),
      provider: this.id,
      modelId: useOfficial ? 'azure-neural-tts' : 'edge-neural-tts',
      voiceId,
      language,
      synthMs: Date.now() - t0,
      estimatedChars: text.length,
    };
  }
}
