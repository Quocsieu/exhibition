import crypto from 'node:crypto';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type {
  Booth,
  CreateBoothInput,
  UpdateBoothInput,
  Product,
  CreateProductInput,
  UpdateProductInput,
  ExtractedProductDraft,
  BoothSlotDefinition,
  BoothSlotAssignment,
  BoothSlotView,
} from '../schemas/expoSchemas.js';
import type { ExpoDatabase } from '../database/db.js';
import {
  fetchExternalProductHtml,
  extractProductFromHtml,
  parseBatchProducts,
} from '../integrations/productAdapter.js';

export type TtsProviderId = 'korvatts' | 'azure' | 'fpt' | 'viettel' | 'google' | 'gtts';
export type NpcSpeechStepType = 'GREETING' | 'PRODUCT' | 'CLOSING';

export const KORVATTS_DEFAULT_VOICE = 'phuong_linh';
export const KORVATTS_DEFAULT_LANGUAGE = 'vi';
export const KORVATTS_DEFAULT_SPEED = 1.05;
export const KORVATTS_DEFAULT_STEPS = 32;
export const KORVATTS_MODEL_VERSION = 'korvatts-0.1.3-e5c8c218';

export const AZURE_DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
export const AZURE_DEFAULT_OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

export class TtsServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'TtsServiceError';
  }
}

export interface NpcTtsRequestParams {
  boothId: string;
  stepType: NpcSpeechStepType;
  slotId?: string | null;
  productId?: string | null;
  clientIp?: string;
}

export interface NpcTtsSynthesisResult {
  audioBuffer: Buffer;
  mimeType: string;
  cacheStatus: 'HIT' | 'MISS';
  cacheKey: string;
  provider: TtsProviderId;
  voice: string;
  speechText: string;
}

interface CachedAudioEntry {
  buffer: Buffer;
  mimeType: string;
  byteLength: number;
  createdAt: number;
}

const MAX_TTS_CACHE_ENTRIES = 120;
const MAX_TTS_CACHE_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB cap
const MAX_SPEECH_TEXT_LENGTH = 480;

const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigitGroupVi(n: number, isLeadingGroup: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts: string[] = [];

  if (hundreds > 0) {
    parts.push(`${VI_DIGITS[hundreds]} trăm`);
  } else if (!isLeadingGroup && (tens > 0 || ones > 0)) {
    parts.push('không trăm');
  }

  if (tens === 0) {
    if (ones > 0) {
      if (!isLeadingGroup || hundreds > 0) {
        parts.push(`lẻ ${VI_DIGITS[ones]}`);
      } else {
        parts.push(VI_DIGITS[ones]);
      }
    }
  } else if (tens === 1) {
    if (ones === 0) parts.push('mười');
    else if (ones === 5) parts.push('mười lăm');
    else parts.push(`mười ${VI_DIGITS[ones]}`);
  } else {
    let unitWord = '';
    if (ones === 1) unitWord = ' mốt';
    else if (ones === 4) unitWord = ' tư';
    else if (ones === 5) unitWord = ' lăm';
    else if (ones > 0) unitWord = ` ${VI_DIGITS[ones]}`;
    parts.push(`${VI_DIGITS[tens]} mươi${unitWord}`);
  }

  return parts.join(' ');
}

export function numberToVietnameseWords(raw: number): string {
  if (!Number.isFinite(raw) || raw < 0) return '';
  const n = Math.round(raw);
  if (n === 0) return 'không';

  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) {
    groups.push(rem % 1000);
    rem = Math.floor(rem / 1000);
  }

  const segments: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp === 0) continue;
    const isLeading = segments.length === 0;
    const words = readThreeDigitGroupVi(grp, isLeading);
    const unitLabel = units[i] || '';
    segments.push(unitLabel ? `${words} ${unitLabel}` : words);
  }

  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

export function normalizeTextForVietnameseTts(
  raw: unknown,
  maxLength = 220,
  options?: { preserveEnglishCompounds?: boolean }
): string {
  if (typeof raw !== 'string') return '';
  let cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\[(?:SKU|Mã|ID)[^\]]*\]/gi, ' ')
    // Convert Vietnamese thousand-separated integers (e.g. 1.550m -> 1550m, 6.000 -> 6000) without touching decimals like 2.5 or 98.4
    .replace(/\b([1-9]\d{0,2})\.(\d{3})(?!\d)/g, '$1$2')
    .replace(/±\s*(?=\d)/g, 'cộng trừ ')
    .replace(/<\s*(?=\d)/g, 'dưới ')
    .replace(/>\s*(?=\d)/g, 'trên ')
    .replace(/[<>]/g, ' ')
    .replace(/\b(\d{4})\s*K\s*[–—-]\s*(\d{4})\s*K\b/g, '$1 độ K đến $2 độ K')
    .replace(/\b(\d{4})\s*K\b/g, '$1 độ K')
    .replace(/\b24\s*\/\s*7\b/g, 'hai tư trên bảy')
    .replace(/(\p{L})\s*\/\s*(\p{L})/gu, '$1 và $2')
    .replace(/&/g, ' và ')
    .replace(/(\d)\s*%/g, '$1 phần trăm')
    .replace(/°C\b/g, ' độ C')
    .replace(/\bm(?:2|²)\b/gi, ' mét vuông')
    .replace(/(\d)\s*kWh\b/gi, '$1 ki lô oát giờ')
    .replace(/\bkWh\b/gi, ' ki lô oát giờ')
    .replace(/(\d)\s*kW\b/gi, '$1 ki lô oát')
    .replace(/(\d)\s*mAh\b/gi, '$1 mi li am pe giờ')
    .replace(/\bmAh\b/gi, ' mi li am pe giờ')
    .replace(/(\d)\s*kg\b/gi, '$1 ki lô gam')
    .replace(/(\d)\s*mm\b/gi, '$1 mi li mét')
    .replace(/(\d)\s*cm\b/gi, '$1 xăng ti mét')
    .replace(/(\d)\s*m\b/g, '$1 mét')
    .replace(/(\d)\s*dB\b/gi, '$1 đê xi ben');

  if (!options?.preserveEnglishCompounds) {
    // Separate CamelCase English brand compounds for cloud G2P engines while keeping LiDAR/RFID intact
    cleaned = cleaned.replace(/([a-z]{2,})([A-Z][a-z])/g, '$1 $2');
  }

  cleaned = cleaned
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\b(undefined|null|NaN)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const lastEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf(' '));
  const cut = lastEnd > maxLength * 0.6 ? slice.slice(0, lastEnd) : slice;
  return `${cut.replace(/[.,;:\s]+$/, '')}.`;
}

const VIETNAMESE_DIACRITIC_RE =
  /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

/**
 * Converts Title-Cased Vietnamese common words in product titles (e.g. "Pin Lưu Trữ Điện Mặt Trời Solaris PowerWall")
 * into natural lowercase ("pin lưu trữ điện mặt trời Solaris PowerWall") while strictly preserving English brand/model
 * capitalization ("Solaris", "PowerWall", "Green Future", "Solar Battery", "Fjäll Standing Desk").
 */
export function smoothVietnameseProductTitleForKorva(title: string): string {
  const tokens = (title || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';

  const hasViDiacritic = tokens.map((tok) => VIETNAMESE_DIACRITIC_RE.test(tok));
  return tokens
    .map((tok, idx) => {
      if (hasViDiacritic[idx]) {
        return tok.toLowerCase();
      }
      // Also lowercase short Title-Case ASCII Vietnamese lead words (like "Pin", "Bộ", "Kem") when immediately followed by a Vietnamese-diacritic word
      if (/^[A-Z][a-z]{1,4}$/.test(tok) && idx + 1 < tokens.length && hasViDiacritic[idx + 1]) {
        return tok.toLowerCase();
      }
      return tok;
    })
    .join(' ');
}

/**
 * Expands remaining Arabic numerals and decimals into natural Vietnamese words for KorvaTTS
 * so bilingual code-switching never misreads digits next to English brand/tech tokens
 * (e.g. "Solar Battery 15 ki lô oát giờ" -> "Solar Battery mười lăm ki lô oát giờ",
 *  "6000 chu kỳ" -> "sáu nghìn chu kỳ", "IP65" -> "IP sáu mươi lăm").
 */
export function expandNumbersForKorvaVietnamese(text: string): string {
  if (!text) return '';
  return (
    text
      // Convert parenthetical remarks into natural comma-delimited phrases so KorvaTTS never stutters on '(' or ')'
      .replace(/\s*\(\s*/g, ', ')
      .replace(/\s*\)\s*/g, ', ')
      // Separate attached ASCII letter+digit boundaries (e.g. IP65 -> IP 65, X1 -> X 1, 4K -> 4 K)
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      // Convert decimals (e.g. 2.5 -> hai phẩy năm, 0.85 -> không phẩy tám mươi lăm)
      .replace(/\b(\d{1,9})\.(\d{1,4})\b/g, (_m, intPart: string, fracPart: string) => {
        const intWords = numberToVietnameseWords(Number(intPart));
        const strippedFrac = fracPart.replace(/^0+/, '');
        let fracWords = '';
        if (!strippedFrac) {
          fracWords = 'không';
        } else if (fracPart.startsWith('0')) {
          const leadingZeros = 'không '.repeat(fracPart.length - strippedFrac.length).trim();
          fracWords = `${leadingZeros} ${numberToVietnameseWords(Number(strippedFrac))}`.trim();
        } else {
          fracWords = numberToVietnameseWords(Number(fracPart));
        }
        return `${intWords} phẩy ${fracWords}`;
      })
      // Convert all remaining integers up to 12 digits into Vietnamese words
      .replace(/\b\d{1,12}\b/g, (numStr) => {
        const n = Number(numStr);
        return Number.isFinite(n) ? numberToVietnameseWords(n) : numStr;
      })
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/,\s*([.!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function escapeSsmlXml(raw: string): string {
  return (raw || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildAzureVietnameseSsml(
  speechText: string,
  voice = AZURE_DEFAULT_VOICE,
  rate = '0%',
  pitch = '0%'
): string {
  const safeVoice = escapeSsmlXml(voice.trim() || AZURE_DEFAULT_VOICE);
  const safeRate = escapeSsmlXml(rate.trim() || '0%');
  const safePitch = escapeSsmlXml(pitch.trim() || '0%');

  const sentences = (speechText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => escapeSsmlXml(s.trim()))
    .filter(Boolean);

  const innerContent = sentences.join('<break time="220ms"/>');

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${safeVoice}"><prosody rate="${safeRate}" pitch="${safePitch}">${innerContent}</prosody></voice></speak>`;
}

function sanitizeTtsText(raw: unknown, maxLength = 220): string {
  return normalizeTextForVietnameseTts(raw, maxLength);
}

function formatVietnamesePriceText(price: unknown, currency = 'VND'): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return '';
  }
  const upperCurr = (currency || 'VND').trim().toUpperCase();
  const spokenNumber = numberToVietnameseWords(price);
  if (!spokenNumber) return '';
  if (upperCurr === 'VND' || upperCurr === 'VNĐ' || upperCurr === '₫') {
    return `${spokenNumber} đồng`;
  }
  if (upperCurr === 'USD' || upperCurr === '$') {
    return `${spokenNumber} đô la Mỹ`;
  }
  return `${spokenNumber} ${upperCurr}`;
}

function resolveAssistantNameForBooth(booth: Pick<Booth, 'id' | 'name' | 'category'>): string {
  const haystack = `${booth.id} ${booth.name} ${booth.category || ''}`.toLowerCase();
  if (haystack.includes('aether') || haystack.includes('công nghệ') || haystack.includes('điện tử') || haystack.includes('tech')) {
    return 'Ngọc Anh';
  }
  if (haystack.includes('nordic') || haystack.includes('nội thất') || haystack.includes('kiến trúc') || haystack.includes('living')) {
    return 'Minh Châu';
  }
  if (haystack.includes('ecovita') || haystack.includes('thực phẩm') || haystack.includes('nông sản') || haystack.includes('cà phê')) {
    return 'Thảo Vy';
  }
  if (haystack.includes('kinetix') || haystack.includes('tự động') || haystack.includes('robot') || haystack.includes('sản xuất')) {
    return 'Khánh Linh';
  }
  if (haystack.includes('lumina') || haystack.includes('thiết kế') || haystack.includes('đời sống') || haystack.includes('design')) {
    return 'Phương Nghi';
  }
  if (haystack.includes('solaris') || haystack.includes('năng lượng') || haystack.includes('xanh') || haystack.includes('energy')) {
    return 'Bảo Trân';
  }
  return 'Ngọc Anh';
}

export function computeTtsCacheKey(
  provider: TtsProviderId,
  voice: string,
  language: string,
  version: string,
  normalizedText: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${provider}|${voice}|${language}|${version}|${normalizedText}`, 'utf8')
    .digest('hex');
}

export function splitVietnameseSpeechIntoChunks(text: string, maxChunkLen = 175): string[] {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Split by sentence boundaries first so each sentence receives natural Vietnamese falling intonation & pause
  const rawSentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of rawSentences) {
    if (sentence.length <= maxChunkLen) {
      chunks.push(sentence);
      continue;
    }

    let remaining = sentence;
    while (remaining.length > maxChunkLen) {
      const windowSlice = remaining.slice(0, maxChunkLen);
      let splitIdx = -1;
      const semicolonIdx = windowSlice.lastIndexOf('; ');
      const commaIdx = windowSlice.lastIndexOf(', ');
      if (semicolonIdx > maxChunkLen * 0.35) {
        splitIdx = semicolonIdx + 1;
      } else if (commaIdx > maxChunkLen * 0.35) {
        splitIdx = commaIdx + 1;
      } else {
        const spaceIdx = windowSlice.lastIndexOf(' ');
        splitIdx = spaceIdx > maxChunkLen * 0.3 ? spaceIdx : maxChunkLen;
      }

      const piece = remaining.slice(0, splitIdx).trim();
      if (piece) chunks.push(piece);
      remaining = remaining.slice(splitIdx).trim();
    }
    if (remaining) {
      chunks.push(remaining);
    }
  }

  return chunks;
}

export interface ResolvedBackendTtsConfig {
  provider: TtsProviderId;
  apiKey: string;
  region: string;
  requiresApiKey: boolean;
  voice: string;
  korvaLang: string;
  korvaSpeed: number;
  korvaSteps: number;
  korvaModelVersion: string;
  korvaMaxQueue: number;
  korvaInitTimeoutMs: number;
  korvaNonBlockingInit: boolean;
  outputFormat: string;
  prosodyRate: string;
  prosodyPitch: string;
  timeoutMs: number;
  rateLimitPerMin: number;
  endpointOverride?: string;
}

export function resolveBackendTtsConfig(): ResolvedBackendTtsConfig {
  const rawProvider = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
  let provider: TtsProviderId = 'korvatts';

  if (
    rawProvider === 'korvatts' ||
    rawProvider === 'azure' ||
    rawProvider === 'google' ||
    rawProvider === 'viettel' ||
    rawProvider === 'fpt' ||
    rawProvider === 'gtts'
  ) {
    provider = rawProvider;
  }

  const apiKey = (
    provider === 'azure'
      ? process.env.AZURE_SPEECH_KEY || process.env.TTS_API_KEY || ''
      : provider === 'korvatts'
        ? ''
        : process.env.TTS_API_KEY ||
          (provider === 'google' ? process.env.GOOGLE_TTS_API_KEY : '') ||
          (provider === 'viettel' ? process.env.VIETTEL_TTS_API_KEY : '') ||
          (provider === 'fpt' ? process.env.FPT_TTS_API_KEY : '') ||
          ''
  ).trim();

  const region = (process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase();
  const requiresApiKey = provider !== 'korvatts' && provider !== 'gtts';

  const defaultVoice =
    provider === 'korvatts'
      ? KORVATTS_DEFAULT_VOICE
      : provider === 'azure'
        ? AZURE_DEFAULT_VOICE
        : provider === 'google'
          ? 'vi-VN-Neural2-A'
          : provider === 'viettel'
            ? 'hn-quynhanh'
            : provider === 'fpt'
              ? 'banmai'
              : 'vi-VN-Standard-A';

  const voice = (
    (provider === 'korvatts' ? process.env.KORVATTS_VOICE : '') ||
    (provider === 'azure' ? process.env.AZURE_SPEECH_VOICE : '') ||
    process.env.TTS_VOICE ||
    defaultVoice
  ).trim();

  const korvaLang = ((process.env.KORVATTS_LANGUAGE || KORVATTS_DEFAULT_LANGUAGE).trim() || 'vi').toLowerCase();
  const parsedSpeed = Number(process.env.KORVATTS_SPEED || KORVATTS_DEFAULT_SPEED);
  const korvaSpeed = Number.isFinite(parsedSpeed)
    ? Math.max(0.5, Math.min(2.0, parsedSpeed))
    : KORVATTS_DEFAULT_SPEED;
  const parsedSteps = Math.round(Number(process.env.KORVATTS_STEPS || KORVATTS_DEFAULT_STEPS));
  const korvaSteps = Number.isFinite(parsedSteps)
    ? Math.max(1, Math.min(32, parsedSteps))
    : KORVATTS_DEFAULT_STEPS;
  const korvaModelVersion = (process.env.KORVATTS_MODEL_VERSION || KORVATTS_MODEL_VERSION).trim();

  const parsedMaxQueue = Number(process.env.KORVATTS_MAX_QUEUE ?? 3);
  const korvaMaxQueue = Number.isFinite(parsedMaxQueue)
    ? Math.max(0, Math.min(16, Math.floor(parsedMaxQueue)))
    : 3;

  const parsedInitTimeout = Number(process.env.KORVATTS_INIT_TIMEOUT_MS || 30000);
  const korvaInitTimeoutMs = Number.isFinite(parsedInitTimeout)
    ? Math.max(200, Math.min(120000, parsedInitTimeout))
    : 30000;
  const korvaNonBlockingInit =
    (process.env.KORVATTS_NON_BLOCKING_INIT || '').trim().toLowerCase() === 'true';

  const outputFormat = (
    process.env.AZURE_SPEECH_OUTPUT_FORMAT || AZURE_DEFAULT_OUTPUT_FORMAT
  ).trim();
  const prosodyRate = (process.env.AZURE_SPEECH_RATE || '0%').trim();
  const prosodyPitch = (process.env.AZURE_SPEECH_PITCH || '0%').trim();

  const defaultTimeoutMs = provider === 'korvatts' ? 60000 : 8000;
  const maxTimeoutMs = provider === 'korvatts' ? 120000 : 20000;
  const minTimeoutMs = provider === 'korvatts' ? 300 : 1000;
  const timeoutMs = Math.max(
    minTimeoutMs,
    Math.min(maxTimeoutMs, Number(process.env.TTS_TIMEOUT_MS || defaultTimeoutMs))
  );
  const rateLimitPerMin = Math.max(5, Math.min(300, Number(process.env.TTS_RATE_LIMIT_PER_MIN || 30)));
  const endpointOverride =
    (
      (provider === 'azure' ? process.env.AZURE_SPEECH_ENDPOINT : '') ||
      process.env.TTS_API_ENDPOINT ||
      ''
    ).trim() || undefined;

  return {
    provider,
    apiKey,
    region,
    requiresApiKey,
    voice,
    korvaLang,
    korvaSpeed,
    korvaSteps,
    korvaModelVersion,
    korvaMaxQueue,
    korvaInitTimeoutMs,
    korvaNonBlockingInit,
    outputFormat,
    prosodyRate,
    prosodyPitch,
    timeoutMs,
    rateLimitPerMin,
    endpointOverride,
  };
}

const BE_SERVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveKorvaPythonExecutable(): string {
  const explicit = (process.env.KORVATTS_PYTHON_PATH || '').trim();
  if (explicit) return explicit;

  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'korvatts-venv', 'Scripts', 'python.exe'),
    path.resolve(BE_SERVICE_ROOT, '..', '.venv-korvatts', 'Scripts', 'python.exe'),
    path.resolve(BE_SERVICE_ROOT, '..', '.venv-korvatts', 'bin', 'python'),
    path.join(os.homedir(), '.local', 'share', 'korvatts-venv', 'bin', 'python'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

export function resolveKorvaWorkerScript(): string {
  const explicit = (process.env.KORVATTS_WORKER_SCRIPT || '').trim();
  if (explicit) return explicit;
  return path.resolve(BE_SERVICE_ROOT, 'src', 'services', 'korvaTtsWorker.py');
}

export function isValidWavBuffer(buf: Buffer): boolean {
  if (!buf || buf.byteLength <= 44) return false;
  return (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  );
}

interface PendingKorvaJob {
  id: string;
  text: string;
  cfg: ResolvedBackendTtsConfig;
  resolve: (res: { buffer: Buffer; mimeType: string }) => void;
  reject: (err: Error) => void;
}

interface ActiveKorvaJob extends PendingKorvaJob {
  timer: ReturnType<typeof setTimeout>;
}

class KorvaTtsWorkerManager {
  private proc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  private rl: readline.Interface | null = null;
  private state: 'stopped' | 'starting' | 'ready' | 'failed' = 'stopped';
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((err: TtsServiceError) => void) | null = null;
  private jobRunning = false;
  private activeJob: ActiveKorvaJob | null = null;
  private readonly pendingQueue: PendingKorvaJob[] = [];
  private spawnedConfigSignature = '';
  private checkpointId = 'default';

  getCheckpointId(): string {
    return this.checkpointId;
  }

  getState(): 'stopped' | 'starting' | 'ready' | 'failed' {
    return this.state;
  }

  private ensureProcessStarted(): Promise<void> {
    const pythonExe = resolveKorvaPythonExecutable();
    const workerScript = resolveKorvaWorkerScript();
    const assetsDir = (process.env.KORVATTS_ASSETS_DIR || '').trim();
    const currentSignature = `${pythonExe}|${workerScript}|${assetsDir}`;

    if (
      this.proc &&
      (this.state === 'ready' || this.state === 'starting') &&
      this.spawnedConfigSignature === currentSignature &&
      this.readyPromise
    ) {
      return this.readyPromise;
    }

    // Restart cleanly if config signature changed while idle
    if (this.proc && !this.activeJob) {
      this.killProcessImmediate();
    }

    if (!fs.existsSync(workerScript)) {
      const err = new TtsServiceError(
        'Không tìm thấy tiến trình worker KorvaTTS trên máy chủ. Đang hiển thị phụ đề tiếng Việt.',
        503,
        'TTS_MODEL_LOAD_FAILED'
      );
      this.state = 'failed';
      return Promise.reject(err);
    }

    this.state = 'starting';
    this.spawnedConfigSignature = currentSignature;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;

      let child: ChildProcessByStdio<Writable, Readable, Readable>;
      try {
        child = spawn(pythonExe, [workerScript], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
            HF_HUB_DISABLE_PROGRESS_BARS: '1',
          },
          windowsHide: true,
        });
      } catch {
        this.state = 'failed';
        reject(
          new TtsServiceError(
            'Không thể khởi chạy môi trường Python cho mô hình KorvaTTS. Đang hiển thị phụ đề tiếng Việt.',
            503,
            'TTS_MODEL_LOAD_FAILED'
          )
        );
        return;
      }

      this.proc = child;
      // Drain stderr safely so pipe buffer never blocks; never leak stack traces to HTTP clients
      child.stderr.on('data', () => {
        // intentionally drained
      });

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      this.rl = rl;

      rl.on('line', (rawLine) => {
        const trimmed = rawLine.trim();
        if (!trimmed.startsWith('{')) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          this.state = 'ready';
          if (typeof msg.checkpoint === 'string' && msg.checkpoint) {
            this.checkpointId = msg.checkpoint;
          }
          const r = this.resolveReady;
          this.resolveReady = null;
          this.rejectReady = null;
          r?.();
          return;
        }

        if (msg.type === 'init_error') {
          this.state = 'failed';
          const rej = this.rejectReady;
          this.resolveReady = null;
          this.rejectReady = null;
          this.killProcessImmediate();
          rej?.(
            new TtsServiceError(
              'Không thể nạp mô hình giọng nói KorvaTTS trên máy chủ. Đang hiển thị phụ đề tiếng Việt.',
              503,
              'TTS_MODEL_LOAD_FAILED'
            )
          );
          return;
        }

        if (msg.type === 'result' && this.activeJob && msg.id === this.activeJob.id) {
          const finishedJob = this.activeJob;
          clearTimeout(finishedJob.timer);
          this.activeJob = null;

          if (msg.ok === true && typeof msg.audioBase64 === 'string') {
            const wavBuf = Buffer.from(msg.audioBase64, 'base64');
            if (isValidWavBuffer(wavBuf)) {
              finishedJob.resolve({ buffer: wavBuf, mimeType: 'audio/wav' });
            } else {
              finishedJob.reject(
                new TtsServiceError(
                  'Dữ liệu âm thanh WAV từ KorvaTTS không hợp lệ. Đang hiển thị phụ đề tiếng Việt.',
                  502,
                  'TTS_SYNTHESIS_FAILED'
                )
              );
            }
          } else {
            finishedJob.reject(
              new TtsServiceError(
                'Quá trình tổng hợp giọng nói KorvaTTS gặp lỗi. Đang hiển thị phụ đề tiếng Việt.',
                502,
                'TTS_SYNTHESIS_FAILED'
              )
            );
          }

          this.jobRunning = false;
          this.pumpQueue();
        }
      });

      child.on('error', () => {
        const wasStarting = this.state === 'starting';
        this.state = 'failed';
        const rej = this.rejectReady;
        this.resolveReady = null;
        this.rejectReady = null;
        this.failActiveJob(
          new TtsServiceError(
            'Tiến trình KorvaTTS gặp sự cố bất ngờ. Đang hiển thị phụ đề tiếng Việt.',
            502,
            'TTS_SYNTHESIS_FAILED'
          )
        );
        this.killProcessImmediate();
        if (wasStarting && rej) {
          rej(
            new TtsServiceError(
              'Không tìm thấy hoặc không thể chạy môi trường Python của KorvaTTS. Đang hiển thị phụ đề tiếng Việt.',
              503,
              'TTS_MODEL_LOAD_FAILED'
            )
          );
        }
        this.pumpQueue();
      });

      child.on('exit', () => {
        if (this.proc !== child) return;
        const wasStarting = this.state === 'starting';
        this.proc = null;
        this.rl?.close();
        this.rl = null;
        this.readyPromise = null;
        this.state = wasStarting ? 'failed' : 'stopped';

        const rej = this.rejectReady;
        this.resolveReady = null;
        this.rejectReady = null;

        if (wasStarting && rej) {
          rej(
            new TtsServiceError(
              'Tiến trình khởi tạo mô hình KorvaTTS dừng sớm. Đang hiển thị phụ đề tiếng Việt.',
              503,
              'TTS_MODEL_LOAD_FAILED'
            )
          );
        }

        this.failActiveJob(
          new TtsServiceError(
            'Tiến trình tổng hợp giọng nói KorvaTTS bị ngắt giữa chừng. Đang hiển thị phụ đề tiếng Việt.',
            502,
            'TTS_SYNTHESIS_FAILED'
          )
        );
        this.pumpQueue();
      });
    });

    return this.readyPromise;
  }

  private failActiveJob(err: TtsServiceError): void {
    if (!this.activeJob) return;
    const job = this.activeJob;
    clearTimeout(job.timer);
    this.activeJob = null;
    this.jobRunning = false;
    job.reject(err);
  }

  private killProcessImmediate(): void {
    const child = this.proc;
    this.proc = null;
    if (this.rl) {
      try {
        this.rl.close();
      } catch {
        // ignore
      }
      this.rl = null;
    }
    this.readyPromise = null;
    if (this.state !== 'failed') {
      this.state = 'stopped';
    }
    if (child) {
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }

  async waitForReady(cfg: ResolvedBackendTtsConfig): Promise<void> {
    const initPromise = this.ensureProcessStarted();
    // Prevent unhandled rejection if caller times out waiting for readiness while init continues
    initPromise.catch(() => undefined);

    if (this.state === 'ready') return;

    if (cfg.korvaNonBlockingInit && this.state === 'starting') {
      throw new TtsServiceError(
        'Mô hình giọng nói KorvaTTS đang khởi tạo, chưa sẵn sàng phục vụ ngay lúc này. Đang hiển thị phụ đề tiếng Việt.',
        503,
        'TTS_MODEL_NOT_READY'
      );
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        initPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new TtsServiceError(
                'Mô hình giọng nói KorvaTTS đang tải hoặc chưa sẵn sàng trong thời gian chờ. Đang hiển thị phụ đề tiếng Việt.',
                503,
                'TTS_MODEL_NOT_READY'
              )
            );
          }, cfg.korvaInitTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  synthesize(
    cfg: ResolvedBackendTtsConfig,
    speechText: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (this.jobRunning && this.pendingQueue.length >= cfg.korvaMaxQueue) {
      return Promise.reject(
        new TtsServiceError(
          'Hệ thống tổng hợp giọng nói KorvaTTS đang bận xử lý các yêu cầu khác. Đang hiển thị phụ đề tiếng Việt.',
          503,
          'TTS_BUSY'
        )
      );
    }

    return new Promise<{ buffer: Buffer; mimeType: string }>((resolve, reject) => {
      this.pendingQueue.push({
        id: crypto.randomUUID(),
        text: speechText,
        cfg,
        resolve,
        reject,
      });
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (this.jobRunning || this.activeJob !== null || this.pendingQueue.length === 0) return;

    const nextJob = this.pendingQueue.shift()!;
    this.jobRunning = true;
    this.runJob(nextJob).catch((err) => {
      this.jobRunning = false;
      nextJob.reject(
        err instanceof TtsServiceError
          ? err
          : new TtsServiceError(
              'Không thể tổng hợp giọng nói từ KorvaTTS. Đang hiển thị phụ đề tiếng Việt.',
              502,
              'TTS_SYNTHESIS_FAILED'
            )
      );
      this.pumpQueue();
    });
  }

  private async runJob(job: PendingKorvaJob): Promise<void> {
    await this.waitForReady(job.cfg);

    if (!this.proc || !this.proc.stdin.writable || this.state !== 'ready') {
      throw new TtsServiceError(
        'Tiến trình KorvaTTS chưa sẵn sàng nhận yêu cầu. Đang hiển thị phụ đề tiếng Việt.',
        503,
        'TTS_MODEL_NOT_READY'
      );
    }

    const timer = setTimeout(() => {
      if (this.activeJob && this.activeJob.id === job.id) {
        this.activeJob = null;
        this.jobRunning = false;
        this.killProcessImmediate();
        job.reject(
          new TtsServiceError(
            'Quá trình tổng hợp giọng nói KorvaTTS vượt quá thời gian chờ (Timeout). Đang hiển thị phụ đề tiếng Việt.',
            504,
            'TTS_TIMEOUT'
          )
        );
        this.pumpQueue();
      }
    }, job.cfg.timeoutMs);

    this.activeJob = { ...job, timer };

    const requestLine =
      JSON.stringify({
        id: job.id,
        type: 'synthesize',
        text: job.text,
        voice: job.cfg.voice,
        lang: job.cfg.korvaLang,
        steps: job.cfg.korvaSteps,
        speed: job.cfg.korvaSpeed,
        seed: 42,
      }) + '\n';

    try {
      this.proc.stdin.write(requestLine, 'utf8');
    } catch {
      clearTimeout(timer);
      this.activeJob = null;
      this.killProcessImmediate();
      throw new TtsServiceError(
        'Không thể gửi yêu cầu tới tiến trình KorvaTTS. Đang hiển thị phụ đề tiếng Việt.',
        502,
        'TTS_SYNTHESIS_FAILED'
      );
    }
  }

  async shutdown(): Promise<void> {
    while (this.pendingQueue.length > 0) {
      const queued = this.pendingQueue.shift();
      queued?.reject(
        new TtsServiceError(
          'Tiến trình KorvaTTS đã dừng theo vòng đời máy chủ.',
          503,
          'TTS_MODEL_NOT_READY'
        )
      );
    }
    this.failActiveJob(
      new TtsServiceError(
        'Tiến trình KorvaTTS đã dừng theo vòng đời máy chủ.',
        503,
        'TTS_MODEL_NOT_READY'
      )
    );
    this.jobRunning = false;

    const child = this.proc;
    if (!child) {
      this.killProcessImmediate();
      return;
    }

    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(killTimer);
        this.killProcessImmediate();
        resolve();
      };
      const killTimer = setTimeout(done, 350);
      child.once('exit', done);
      try {
        child.stdin.write(JSON.stringify({ type: 'shutdown', id: 'stop' }) + '\n');
        child.stdin.end();
      } catch {
        done();
      }
    });
  }
}

export class ExpoService {
  private readonly ttsAudioCache = new Map<string, CachedAudioEntry>();
  private ttsTotalCacheBytes = 0;
  private readonly ttsInFlight = new Map<string, Promise<{ buffer: Buffer; mimeType: string }>>();
  private readonly ttsRateBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly korvaWorker = new KorvaTtsWorkerManager();
  private readonly onProcessExit = () => {
    void this.korvaWorker.shutdown();
  };

  constructor(private readonly db: ExpoDatabase) {
    process.once('exit', this.onProcessExit);
  }

  async shutdown(): Promise<void> {
    process.off('exit', this.onProcessExit);
    await this.korvaWorker.shutdown();
  }

  listBooths(): Booth[] {
    return this.db.listBooths();
  }

  getBoothById(id: string): Booth | null {
    return this.db.getBoothById(id);
  }

  createBooth(input: CreateBoothInput): Booth {
    return this.db.createBooth(input);
  }

  updateBooth(id: string, input: UpdateBoothInput): Booth | null {
    return this.db.updateBooth(id, input);
  }

  deleteBooth(id: string): boolean {
    return this.db.deleteBooth(id);
  }

  listProducts(boothId?: string): Product[] {
    return this.db.listProducts(boothId);
  }

  getProductById(id: string): Product | null {
    return this.db.getProductById(id);
  }

  createProduct(input: CreateProductInput): Product {
    return this.db.createProduct(input);
  }

  updateProduct(id: string, input: UpdateProductInput): Product | null {
    return this.db.updateProduct(id, input);
  }

  deleteProduct(id: string): boolean {
    return this.db.deleteProduct(id);
  }

  listSlotDefinitions(): BoothSlotDefinition[] {
    return this.db.listSlotDefinitions();
  }

  listSlotAssignments(boothId?: string): BoothSlotAssignment[] {
    return this.db.listSlotAssignments(boothId);
  }

  getBoothSlots(boothId: string): BoothSlotView[] {
    return this.db.getBoothSlots(boothId);
  }

  assignProductToSlot(boothId: string, slotId: string, productId: string): BoothSlotView {
    return this.db.assignProductToSlot(boothId, slotId, productId);
  }

  clearBoothSlot(boothId: string, slotId: string): BoothSlotView {
    return this.db.clearBoothSlot(boothId, slotId);
  }

  async extractFromExternalUrl(url: string): Promise<ExtractedProductDraft> {
    const { html, finalUrl } = await fetchExternalProductHtml(url);
    return extractProductFromHtml(html, finalUrl);
  }

  importBatchProducts(
    boothId: string,
    format: 'json' | 'csv',
    content: string
  ): Product[] {
    const items = parseBatchProducts(boothId, format, content);
    return items.map((item) => this.db.createProduct(item));
  }

  getTtsCacheStats(): { entries: number; totalBytes: number } {
    return {
      entries: this.ttsAudioCache.size,
      totalBytes: this.ttsTotalCacheBytes,
    };
  }

  clearTtsCache(): void {
    this.ttsAudioCache.clear();
    this.ttsTotalCacheBytes = 0;
    this.ttsInFlight.clear();
  }

  private checkTtsRateLimit(clientIp: string, maxPerMin: number): void {
    const now = Date.now();
    const key = clientIp || 'unknown';
    const existing = this.ttsRateBuckets.get(key);

    if (!existing || now >= existing.resetAt) {
      if (this.ttsRateBuckets.size > 500) {
        for (const [k, v] of this.ttsRateBuckets.entries()) {
          if (now >= v.resetAt) this.ttsRateBuckets.delete(k);
        }
      }
      this.ttsRateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }

    if (existing.count >= maxPerMin) {
      throw new TtsServiceError(
        'Bạn đã gửi quá nhiều yêu cầu âm thanh trong 1 phút. Vui lòng thử lại sau ít giây.',
        429,
        'RATE_LIMITED'
      );
    }

    existing.count += 1;
  }

  /**
   * Builds and verifies the exact Vietnamese speech text from real booth/slot/product records
   * stored in the Backend SQLite database. Rejects any invalid booth or foreign product.
   */
  buildVerifiedNpcStepSpeechText(
    params: {
      boothId: string;
      stepType: NpcSpeechStepType;
      slotId?: string | null;
      productId?: string | null;
    },
    providerHint?: TtsProviderId
  ): string {
    const booth = this.db.getBoothById(params.boothId);
    if (!booth) {
      throw new TtsServiceError('Không tìm thấy gian hàng.', 404, 'BOOTH_NOT_FOUND');
    }

    const activeProvider = providerHint || resolveBackendTtsConfig().provider;
    const preserveCompounds = activeProvider === 'korvatts';

    const slotDefs = this.db.listSlotDefinitions();
    const slotOrder = new Map<string, number>(slotDefs.map((d, i) => [d.slotId, i]));
    const rawSlots = this.db.getBoothSlots(booth.id);

    const sortedSlots = [...rawSlots].sort(
      (a, b) => (slotOrder.get(a.slot.slotId) ?? 999) - (slotOrder.get(b.slot.slotId) ?? 999)
    );

    const seenProductIds = new Set<string>();
    const validSlotViews: BoothSlotView[] = [];

    for (const sv of sortedSlots) {
      const p = sv.product;
      if (!p || !p.id || p.boothId !== booth.id) continue;
      const cleanName = normalizeTextForVietnameseTts(p.name, 140, {
        preserveEnglishCompounds: preserveCompounds,
      });
      if (!cleanName) continue;
      if (seenProductIds.has(p.id)) continue;
      seenProductIds.add(p.id);
      validSlotViews.push(sv);
    }

    const totalProducts = validSlotViews.length;
    const assistantName = resolveAssistantNameForBooth(booth);
    const cleanBoothName =
      normalizeTextForVietnameseTts(booth.name, 100, {
        preserveEnglishCompounds: preserveCompounds,
      }) || 'Gian hàng triển lãm';
    const cleanCompanyName = normalizeTextForVietnameseTts(booth.companyName, 100, {
      preserveEnglishCompounds: preserveCompounds,
    });
    const brandClause =
      cleanCompanyName && cleanCompanyName.toLowerCase() !== cleanBoothName.toLowerCase()
        ? ` thuộc thương hiệu ${cleanCompanyName.replace(/\.$/, '')}`
        : '';
    const cleanTagline = normalizeTextForVietnameseTts(booth.tagline, 120, {
      preserveEnglishCompounds: preserveCompounds,
    });

    let speechText = '';

    if (params.stepType === 'GREETING') {
      if (totalProducts === 0) {
        speechText = `Dạ xin chào quý khách! Em là ${assistantName}, chuyên viên tư vấn tại gian hàng ${cleanBoothName}${brandClause}. Hiện tại gian hàng chưa có sản phẩm nào được trưng bày trên kệ. Em cảm ơn quý khách đã ghé thăm ạ!`;
      } else {
        const taglineClause = cleanTagline
          ? `, chuyên về ${cleanTagline.replace(/\.$/, '')}`
          : '';
        const spokenCount = numberToVietnameseWords(totalProducts) || String(totalProducts);
        speechText = `Dạ xin chào quý khách! Em là ${assistantName}, tư vấn viên tại gian hàng ${cleanBoothName}${brandClause}${taglineClause}. Hôm nay, em xin phép giới thiệu ${spokenCount} sản phẩm tiêu biểu đang trưng bày tại gian hàng mình ạ.`;
      }
    } else if (params.stepType === 'CLOSING') {
      speechText =
        'Dạ, vừa rồi là những sản phẩm nổi bật đang trưng bày tại gian hàng. Quý khách có thể chạm trực tiếp vào từng sản phẩm trên kệ để xem thông tin chi tiết nhé. Em cảm ơn quý khách đã ghé thăm ạ!';
    } else if (params.stepType === 'PRODUCT') {
      const targetIndex = validSlotViews.findIndex((sv) => {
        if (params.productId && sv.product?.id === params.productId) return true;
        if (params.slotId && sv.slot.slotId === params.slotId) return true;
        return false;
      });

      if (targetIndex === -1) {
        throw new TtsServiceError(
          'Sản phẩm hoặc vị trí trưng bày không hợp lệ trong gian hàng này.',
          400,
          'INVALID_BOOTH_PRODUCT'
        );
      }

      const targetSlotView = validSlotViews[targetIndex];
      const product = targetSlotView.product!;
      const rawCleanName = normalizeTextForVietnameseTts(product.name, 115, {
        preserveEnglishCompounds: preserveCompounds,
      });
      const cleanName = preserveCompounds
        ? smoothVietnameseProductTitleForKorva(rawCleanName)
        : rawCleanName;
      const cleanDesc = normalizeTextForVietnameseTts(product.description, 155, {
        preserveEnglishCompounds: preserveCompounds,
      });
      const priceText = formatVietnamesePriceText(product.price, product.currency);

      let introClause: string;
      if (targetIndex === 0) {
        introClause = `Mở đầu là mẫu ${cleanName}`;
      } else if (targetIndex === totalProducts - 1 && totalProducts > 1) {
        introClause = `Và sản phẩm tiếp theo trên kệ là ${cleanName}`;
      } else {
        const orderWord = numberToVietnameseWords(targetIndex + 1) || String(targetIndex + 1);
        introClause = `Tiếp theo là sản phẩm thứ ${orderWord}, ${cleanName}`;
      }

      const clauses: string[] = [];
      if (priceText) {
        clauses.push(`${introClause}, hiện có mức giá ${priceText}.`);
      } else {
        clauses.push(`${introClause}.`);
      }
      if (cleanDesc) {
        clauses.push(cleanDesc.endsWith('.') ? cleanDesc : `${cleanDesc}.`);
      }
      speechText = clauses.join(' ');
    } else {
      throw new TtsServiceError('Loại bước thuyết minh không hợp lệ.', 400, 'INVALID_STEP_TYPE');
    }

    let normalized = speechText.replace(/\s+/g, ' ').trim();
    if (preserveCompounds) {
      normalized = expandNumbersForKorvaVietnamese(normalized);
    }
    if (normalized.length > MAX_SPEECH_TEXT_LENGTH) {
      const slice = normalized.slice(0, MAX_SPEECH_TEXT_LENGTH);
      const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf(' '));
      const cut = lastBreak > MAX_SPEECH_TEXT_LENGTH * 0.65 ? slice.slice(0, lastBreak) : slice;
      normalized = `${cut.replace(/[.,;:\s]+$/, '')}.`;
    }
    if (normalized.length < 4) {
      throw new TtsServiceError('Nội dung lời thoại không hợp lệ.', 400, 'EMPTY_SPEECH_TEXT');
    }

    return normalized;
  }

  private getFromCache(cacheKey: string): CachedAudioEntry | null {
    const entry = this.ttsAudioCache.get(cacheKey);
    if (!entry) return null;
    // Refresh LRU order
    this.ttsAudioCache.delete(cacheKey);
    this.ttsAudioCache.set(cacheKey, entry);
    return entry;
  }

  private storeInCache(cacheKey: string, buffer: Buffer, mimeType: string): void {
    const byteLength = buffer.byteLength;
    if (byteLength === 0 || byteLength > 4 * 1024 * 1024) return;

    const existing = this.ttsAudioCache.get(cacheKey);
    if (existing) {
      this.ttsTotalCacheBytes -= existing.byteLength;
      this.ttsAudioCache.delete(cacheKey);
    }

    while (
      this.ttsAudioCache.size >= MAX_TTS_CACHE_ENTRIES ||
      this.ttsTotalCacheBytes + byteLength > MAX_TTS_CACHE_TOTAL_BYTES
    ) {
      const oldestKey = this.ttsAudioCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.ttsAudioCache.get(oldestKey);
      if (oldest) {
        this.ttsTotalCacheBytes -= oldest.byteLength;
      }
      this.ttsAudioCache.delete(oldestKey);
    }

    this.ttsAudioCache.set(cacheKey, {
      buffer,
      mimeType,
      byteLength,
      createdAt: Date.now(),
    });
    this.ttsTotalCacheBytes += byteLength;
  }

  async synthesizeNpcStepAudio(params: NpcTtsRequestParams): Promise<NpcTtsSynthesisResult> {
    const cfg = resolveBackendTtsConfig();

    // 1. Validate booth/slot/product & build verified speech text on server
    const speechText = this.buildVerifiedNpcStepSpeechText(params, cfg.provider);

    // 2. Compute deterministic SHA-256 cache key (strictly isolates provider, modelVersion, voice, speed, steps, and text)
    const prosodyVersionTag =
      cfg.provider === 'korvatts'
        ? `${cfg.korvaModelVersion}|speed:${cfg.korvaSpeed.toFixed(2)}|steps:${cfg.korvaSteps}`
        : cfg.provider === 'azure'
          ? `v24-azure-${cfg.outputFormat}-rate:${cfg.prosodyRate}-pitch:${cfg.prosodyPitch}`
          : `v24-${cfg.provider}-1.0`;
    const languageTag = cfg.provider === 'korvatts' ? cfg.korvaLang : 'vi-VN';
    const cacheKey = computeTtsCacheKey(
      cfg.provider,
      cfg.voice,
      languageTag,
      prosodyVersionTag,
      speechText
    );

    // 3. Check in-memory LRU cache first (0 synthesis cost on cache hit; never collides with V24 Azure/gTTS)
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        audioBuffer: cached.buffer,
        mimeType: cached.mimeType,
        cacheStatus: 'HIT',
        cacheKey,
        provider: cfg.provider,
        voice: cfg.voice,
        speechText,
      };
    }

    // 4. Enforce per-IP rate limit before invoking worker or external provider
    this.checkTtsRateLimit(params.clientIp || 'anonymous', cfg.rateLimitPerMin);

    // 5. Verify credentials & region when using external keyed providers (korvatts needs ZERO paid API keys)
    if (cfg.provider === 'azure') {
      if (!cfg.apiKey || (!cfg.region && !cfg.endpointOverride)) {
        throw new TtsServiceError(
          `Dịch vụ giọng đọc Azure AI Speech (${cfg.voice}) chưa được cấu hình AZURE_SPEECH_KEY và AZURE_SPEECH_REGION trên máy chủ. Đang hiển thị phụ đề tiếng Việt tự động.`,
          503,
          'TTS_NOT_CONFIGURED'
        );
      }
      if (!cfg.endpointOverride && !/^[a-z0-9-]+$/i.test(cfg.region)) {
        throw new TtsServiceError(
          'Cấu hình vùng AZURE_SPEECH_REGION không hợp lệ (ví dụ hợp lệ: southeastasia, eastasia, eastus).',
          503,
          'TTS_INVALID_CONFIG'
        );
      }
    } else if (cfg.requiresApiKey && !cfg.apiKey) {
      throw new TtsServiceError(
        `Dịch vụ giọng đọc Tiếng Việt đám mây (${cfg.provider.toUpperCase()}) chưa được cấu hình khóa TTS_API_KEY trên máy chủ. Đang hiển thị phụ đề tự động.`,
        503,
        'TTS_NOT_CONFIGURED'
      );
    }

    // 6. Deduplicate concurrent in-flight requests for the exact same cacheKey (2 visitors requesting same step share 1 run)
    let inFlightPromise = this.ttsInFlight.get(cacheKey);
    if (!inFlightPromise) {
      inFlightPromise = this.callProviderTtsApi(cfg, speechText).finally(() => {
        this.ttsInFlight.delete(cacheKey);
      });
      this.ttsInFlight.set(cacheKey, inFlightPromise);
    }

    const { buffer, mimeType } = await inFlightPromise;
    this.storeInCache(cacheKey, buffer, mimeType);

    return {
      audioBuffer: buffer,
      mimeType,
      cacheStatus: 'MISS',
      cacheKey,
      provider: cfg.provider,
      voice: cfg.voice,
      speechText,
    };
  }

  private async callProviderTtsApi(
    cfg: ResolvedBackendTtsConfig,
    speechText: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (cfg.provider === 'korvatts') {
      return this.korvaWorker.synthesize(cfg, speechText);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      if (cfg.provider === 'azure') {
        const endpoint =
          cfg.endpointOverride ||
          `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
        const ssmlPayload = buildAzureVietnameseSsml(
          speechText,
          cfg.voice,
          cfg.prosodyRate,
          cfg.prosodyPitch
        );

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': cfg.apiKey,
            'Content-Type': 'application/ssml+xml; charset=utf-8',
            'X-Microsoft-OutputFormat': cfg.outputFormat,
            'User-Agent': 'VirtualExpoPlaza3D-Backend/1.0',
          },
          body: ssmlPayload,
          signal: controller.signal,
        });

        this.validateProviderHttpStatus(res.status, 'Azure AI Speech');
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.byteLength < 64) {
          throw new TtsServiceError(
            'Dữ liệu âm thanh trả về từ Azure AI Speech quá ngắn hoặc không hợp lệ.',
            502,
            'TTS_INVALID_RESPONSE'
          );
        }
        return { buffer, mimeType: 'audio/mpeg' };
      }

      if (cfg.provider === 'gtts') {
        const baseEndpoint =
          cfg.endpointOverride || 'https://translate.googleapis.com/translate_tts';
        const chunks = splitVietnameseSpeechIntoChunks(speechText, 180);
        const buffers: Buffer[] = [];

        for (const chunk of chunks) {
          const separator = baseEndpoint.includes('?') ? '&' : '?';
          const url = `${baseEndpoint}${separator}ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'audio/mpeg, audio/*;q=0.9, */*;q=0.8',
            },
            signal: controller.signal,
          });

          this.validateProviderHttpStatus(res.status, 'Google Vietnamese TTS');
          const chunkBuf = Buffer.from(await res.arrayBuffer());
          if (chunkBuf.byteLength < 64) {
            throw new TtsServiceError(
              'Dữ liệu âm thanh trả về từ dịch vụ TTS quá ngắn hoặc không hợp lệ.',
              502,
              'TTS_INVALID_RESPONSE'
            );
          }
          buffers.push(chunkBuf);
        }

        const combined = Buffer.concat(buffers);
        if (combined.byteLength < 64) {
          throw new TtsServiceError(
            'Dữ liệu âm thanh tổng hợp không hợp lệ.',
            502,
            'TTS_INVALID_RESPONSE'
          );
        }
        return { buffer: combined, mimeType: 'audio/mpeg' };
      }

      if (cfg.provider === 'google') {
        const endpoint =
          cfg.endpointOverride || 'https://texttospeech.googleapis.com/v1/text:synthesize';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': cfg.apiKey,
          },
          body: JSON.stringify({
            input: { text: speechText },
            voice: {
              languageCode: 'vi-VN',
              name: cfg.voice,
              ssmlGender: 'FEMALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 0.96,
              pitch: 0.2,
            },
          }),
          signal: controller.signal,
        });

        this.validateProviderHttpStatus(res.status, 'Google Cloud TTS');
        const json = (await res.json().catch(() => ({}))) as { audioContent?: string };
        if (!json.audioContent || typeof json.audioContent !== 'string') {
          throw new TtsServiceError(
            'Dữ liệu âm thanh trả về từ Google Cloud TTS không hợp lệ.',
            502,
            'TTS_INVALID_RESPONSE'
          );
        }
        const buffer = Buffer.from(json.audioContent, 'base64');
        if (buffer.byteLength < 64) {
          throw new TtsServiceError(
            'Dữ liệu âm thanh trả về quá ngắn hoặc bị lỗi.',
            502,
            'TTS_INVALID_RESPONSE'
          );
        }
        return { buffer, mimeType: 'audio/mpeg' };
      }

      if (cfg.provider === 'viettel') {
        const endpoint = cfg.endpointOverride || 'https://viettelai.vn/tts/speech_synthesis';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: '*/*',
          },
          body: JSON.stringify({
            text: speechText,
            voice: cfg.voice,
            speed: 0.96,
            tts_return_option: 3,
            token: cfg.apiKey,
            without_filter: false,
          }),
          signal: controller.signal,
        });

        this.validateProviderHttpStatus(res.status, 'Viettel AI TTS');
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.byteLength < 64) {
          throw new TtsServiceError(
            'Dữ liệu âm thanh trả về từ Viettel AI TTS không hợp lệ.',
            502,
            'TTS_INVALID_RESPONSE'
          );
        }
        return { buffer, mimeType: 'audio/mpeg' };
      }

      // Default provider: FPT.AI TTS v5 (`https://api.fpt.ai/hmi/tts/v5`)
      const endpoint = cfg.endpointOverride || 'https://api.fpt.ai/hmi/tts/v5';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'api-key': cfg.apiKey,
          voice: cfg.voice,
          speed: '0',
          format: 'mp3',
        },
        body: speechText,
        signal: controller.signal,
      });

      this.validateProviderHttpStatus(res.status, 'FPT.AI TTS');

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('audio/')) {
        const directBuf = Buffer.from(await res.arrayBuffer());
        if (directBuf.byteLength >= 64) {
          return { buffer: directBuf, mimeType: 'audio/mpeg' };
        }
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: number;
        async?: string;
        message?: string;
      };
      if (data.error && data.error !== 0) {
        throw new TtsServiceError(
          'Dịch vụ FPT.AI TTS từ chối yêu cầu hoặc hết hạn mức.',
          502,
          'TTS_PROVIDER_ERROR'
        );
      }

      const asyncAudioUrl = data.async;
      if (!asyncAudioUrl || typeof asyncAudioUrl !== 'string') {
        throw new TtsServiceError(
          'Dịch vụ FPT.AI TTS không trả về đường dẫn âm thanh hợp lệ.',
          502,
          'TTS_INVALID_RESPONSE'
        );
      }

      // FPT.AI generates the MP3 asynchronously on S3 (~250-900ms); poll briefly within the timeout budget
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 320));
        }
        const audioRes = await fetch(asyncAudioUrl, { signal: controller.signal });
        if (audioRes.ok) {
          const buf = Buffer.from(await audioRes.arrayBuffer());
          if (buf.byteLength >= 64) {
            return { buffer: buf, mimeType: 'audio/mpeg' };
          }
        }
        if (audioRes.status === 401 || audioRes.status === 403) {
          break;
        }
      }

      throw new TtsServiceError(
        'File âm thanh từ FPT.AI chưa sẵn sàng trong thời gian chờ.',
        504,
        'TTS_TIMEOUT'
      );
    } catch (err) {
      if (err instanceof TtsServiceError) {
        throw err;
      }
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        throw new TtsServiceError(
          'Dịch vụ giọng đọc phản hồi quá thời gian chờ (Timeout). Đang hiển thị phụ đề.',
          504,
          'TTS_TIMEOUT'
        );
      }
      throw new TtsServiceError(
        'Không thể kết nối tới dịch vụ giọng đọc đám mây. Đang hiển thị phụ đề.',
        502,
        'TTS_PROVIDER_ERROR'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private validateProviderHttpStatus(status: number, providerLabel: string): void {
    if (status >= 200 && status < 300) return;
    if (status === 401 || status === 403) {
      throw new TtsServiceError(
        `Khóa cấu hình dịch vụ giọng đọc (${providerLabel}) không hợp lệ hoặc bị từ chối.`,
        502,
        'TTS_AUTH_FAILED'
      );
    }
    if (status === 400) {
      throw new TtsServiceError(
        `Yêu cầu tổng hợp giọng đọc gửi tới ${providerLabel} không hợp lệ (HTTP 400).`,
        502,
        'TTS_BAD_REQUEST'
      );
    }
    if (status === 429) {
      throw new TtsServiceError(
        `Hạn mức dịch vụ giọng đọc (${providerLabel}) tạm thời đạt giới hạn. Đang hiển thị phụ đề.`,
        429,
        'TTS_PROVIDER_QUOTA'
      );
    }
    throw new TtsServiceError(
      `Dịch vụ giọng đọc (${providerLabel}) đang tạm thời gián đoạn (HTTP ${status}).`,
      502,
      'TTS_PROVIDER_ERROR'
    );
  }
}
