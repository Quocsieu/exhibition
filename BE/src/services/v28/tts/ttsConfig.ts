import fs from 'node:fs';
import path from 'node:path';
import type { TtsProviderId } from './ttsTypes.js';

let lastDotEnvCheckMs = 0;
let lastDotEnvMtimeMs = 0;

/**
 * Lightweight hot-reload of BE/.env when modified on disk while the server is running
 * (e.g., when Admin replaces GEMINI_API_KEY without restarting `tsx watch`).
 * Only updates keys present in BE/.env when file mtime actually changes.
 */
function syncDotEnvIfModified(env: NodeJS.ProcessEnv): void {
  if (env !== process.env || process.env.VITEST) return;
  const now = Date.now();
  if (now - lastDotEnvCheckMs < 2000) return;
  lastDotEnvCheckMs = now;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'BE', '.env'),
  ];
  for (const candidate of candidates) {
    try {
      const st = fs.statSync(candidate);
      if (lastDotEnvMtimeMs === 0) {
        lastDotEnvMtimeMs = st.mtimeMs;
        return;
      }
      if (st.mtimeMs <= lastDotEnvMtimeMs) return;
      lastDotEnvMtimeMs = st.mtimeMs;
      const raw = fs.readFileSync(candidate, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (/^[A-Z0-9_]+$/.test(key)) {
          env[key] = val;
        }
      }
      return;
    } catch {
      // try next candidate
    }
  }
}

export interface HybridTtsRuntimeConfig {
  providerPriority: TtsProviderId[];
  geminiEnabled: boolean;
  geminiApiKey: string;
  geminiModel: string;
  geminiVoice: string;
  geminiStyle: string;
  geminiApiMode: 'generateContent' | 'interactions';
  vbeeEnabled: boolean;
  vbeeApiToken: string;
  vbeeAppId: string;
  vbeeEndpoint: string;
  vbeeVoice: string;
  vbeeFormat: 'mp3' | 'wav';
  edgeEnabled: boolean;
  edgeVoice: string;
  azureSpeechKey: string;
  azureSpeechRegion: string;
  edgeUnofficialEnabled: boolean;
  fptEnabled: boolean;
  fptAllowPaid: boolean;
  fptApiKey: string;
  fptVoice: string;
  fptEndpoint: string;
  timeoutMs: number;
  maxRetries: number;
  maxTextLength: number;
  publicMaxTextLength: number;
  rateLimitPerMin: number;
  cacheEnabled: boolean;
  configVersion: string;
  batchConcurrency: number;
  dailyCharBudget: number;
  dailyRequestBudget: number;
  legacyFallbackEnabled: boolean;
  storageDriver: 'auto' | 'local_fs' | 'postgres' | 'tiered';
}

const VALID_PRIMARY_PROVIDERS = new Set<TtsProviderId>(['gemini', 'vbee', 'edge', 'fpt']);

function parseBool(raw: string | undefined, defaultVal: boolean): boolean {
  if (raw === undefined || raw === null || raw.trim() === '') return defaultVal;
  const lower = raw.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return defaultVal;
}

function parseIntClamped(raw: string | undefined, defaultVal: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function resolveHybridTtsConfig(env: NodeJS.ProcessEnv = process.env): HybridTtsRuntimeConfig {
  syncDotEnvIfModified(env);
  const rawPriority = (env.TTS_PROVIDER_PRIORITY || 'gemini,vbee,edge')
    .split(',')
    .map((s) => s.trim().toLowerCase() as TtsProviderId)
    .filter((id) => VALID_PRIMARY_PROVIDERS.has(id));

  const providerPriority: TtsProviderId[] =
    rawPriority.length > 0 ? Array.from(new Set(rawPriority)) : ['gemini', 'vbee', 'edge'];

  const rawStorage = (env.TTS_STORAGE_DRIVER || 'auto').trim().toLowerCase();
  const storageDriver =
    rawStorage === 'local_fs' || rawStorage === 'postgres' || rawStorage === 'tiered'
      ? rawStorage
      : 'auto';

  const rawGeminiMode = (env.V28_GEMINI_TTS_API_MODE || 'generateContent').trim();
  const geminiApiMode: 'generateContent' | 'interactions' =
    rawGeminiMode === 'interactions' ? 'interactions' : 'generateContent';

  const rawVbeeFmt = (env.VBEE_TTS_FORMAT || 'mp3').trim().toLowerCase();
  const vbeeFormat: 'mp3' | 'wav' = rawVbeeFmt === 'wav' ? 'wav' : 'mp3';

  return {
    providerPriority,
    geminiEnabled: parseBool(env.TTS_GEMINI_ENABLED, true),
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    geminiModel: (env.V28_GEMINI_TTS_MODEL || '').trim() || 'gemini-3.8-flash-tts',
    geminiVoice: (env.V28_GEMINI_TTS_VOICE || '').trim() || 'Kore',
    geminiStyle:
      (env.V28_GEMINI_TTS_STYLE || '').trim() ||
      'warm, natural, professional Vietnamese female exhibition consultant',
    geminiApiMode,

    vbeeEnabled: parseBool(env.TTS_VBEE_ENABLED, true),
    vbeeApiToken: (env.VBEE_API_TOKEN || '').trim(),
    vbeeAppId: (env.VBEE_APP_ID || '').trim(),
    vbeeEndpoint: (env.VBEE_TTS_ENDPOINT || '').trim() || 'https://vbee.vn/api/v1/tts',
    vbeeVoice: (env.VBEE_TTS_VOICE || '').trim() || 'hn_female_ngochuyen_full_48k-fhg',
    vbeeFormat,

    edgeEnabled: parseBool(env.TTS_EDGE_ENABLED, true),
    edgeVoice: (env.EDGE_TTS_VOICE || '').trim() || 'vi-VN-HoaiMyNeural',
    azureSpeechKey: (env.AZURE_SPEECH_KEY || '').trim(),
    azureSpeechRegion: (env.AZURE_SPEECH_REGION || '').trim() || 'southeastasia',
    edgeUnofficialEnabled: parseBool(env.TTS_EDGE_UNOFFICIAL_ENABLED, false),

    // FPT.AI is strictly DISABLED by default and requires explicit opt-in + paid permission
    fptEnabled: parseBool(env.TTS_FPT_ENABLED, false),
    fptAllowPaid: parseBool(env.TTS_ALLOW_PAID_FPT, false),
    fptApiKey: (env.FPT_AI_API_KEY || '').trim(),
    fptVoice: (env.FPT_AI_VOICE || '').trim() || 'banmai',
    fptEndpoint: (env.FPT_AI_TTS_ENDPOINT || '').trim() || 'https://api.fpt.ai/hmi/tts/v5',

    timeoutMs: parseIntClamped(env.TTS_TIMEOUT_MS, 20_000, 3_000, 60_000),
    maxRetries: parseIntClamped(env.TTS_MAX_RETRIES, 1, 0, 2),
    maxTextLength: parseIntClamped(env.TTS_MAX_TEXT_LENGTH, 1500, 100, 4000),
    publicMaxTextLength: parseIntClamped(env.TTS_PUBLIC_MAX_TEXT_LENGTH, 500, 50, 1000),
    rateLimitPerMin: parseIntClamped(env.TTS_RATE_LIMIT_PER_MIN, 30, 5, 300),
    cacheEnabled: parseBool(env.TTS_CACHE_ENABLED, true),
    configVersion: (env.TTS_CONFIG_VERSION || '').trim() || 'v1',
    batchConcurrency: parseIntClamped(env.TTS_BATCH_CONCURRENCY, 2, 1, 5),
    dailyCharBudget: parseIntClamped(env.TTS_DAILY_CHAR_BUDGET, 200_000, 1_000, 50_000_000),
    dailyRequestBudget: parseIntClamped(env.TTS_DAILY_REQUEST_BUDGET, 500, 10, 100_000),
    legacyFallbackEnabled: parseBool(env.TTS_LEGACY_FALLBACK_ENABLED, true),
    storageDriver,
  };
}
