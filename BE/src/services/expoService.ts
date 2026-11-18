import crypto from 'node:crypto';
import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process';
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
export type TtsQueuePriority = 'ACTIVE_PLAYBACK' | 'NEXT_CHUNK' | 'PREFETCH';

export const KORVATTS_DEFAULT_VOICE = 'phuong_linh';
export const KORVATTS_DEFAULT_LANGUAGE = 'vi';
export const KORVATTS_DEFAULT_SPEED = 1.05;
export const KORVATTS_DEFAULT_STEPS = 24;
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
  chunkIndex?: number;
  priority?: TtsQueuePriority;
  signal?: AbortSignal;
  clientIp?: string;
}

export interface NpcTtsChunkDescriptor {
  chunkIndex: number;
  text: string;
  charLength: number;
  cacheKey: string;
  cached: boolean;
}

export interface NpcTtsManifestResult {
  provider: TtsProviderId;
  voice: string;
  workerState: 'stopped' | 'starting' | 'ready' | 'failed';
  totalChunks: number;
  fullText: string;
  chunks: Array<{
    chunkIndex: number;
    charLength: number;
    cached: boolean;
  }>;
}

export interface NpcTtsSynthesisResult {
  audioBuffer: Buffer;
  mimeType: string;
  cacheStatus: 'HIT' | 'MISS';
  cacheKey: string;
  provider: TtsProviderId;
  voice: string;
  speechText: string;
  chunkIndex?: number;
  totalChunks?: number;
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

const NBSP = '\u00A0';

const PROTECTED_ABBREVIATIONS = [
  'Mr.',
  'Mrs.',
  'Ms.',
  'Dr.',
  'Prof.',
  'Sr.',
  'Jr.',
  'Co.',
  'Ltd.',
  'Inc.',
  'Corp.',
  'TP.',
  'Tp.',
  'ThS.',
  'PGS.',
  'GS.',
  'TS.',
  'v.v.',
];

function protectSpanSpaces(text: string, phrase: string): string {
  const cleaned = (phrase || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || !cleaned.includes(' ')) return text;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return text.replace(new RegExp(escaped, 'gi'), (m) => m.replace(/\s+/g, NBSP));
}

/**
 * Splits a Vietnamese NPC consultation script into natural 70–120 character clauses for early
 * first-chunk playback while strictly protecting brand names, product names, prices, units,
 * decimals, multi-word English phrases, and abbreviations from ever being split mid-phrase.
 */
export function chunkVietnameseConsultationSpeech(
  text: string,
  protectedPhrases: string[] = [],
  targetMin = 70,
  targetMax = 120
): string[] {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= targetMax) return [normalized];

  let guarded = normalized;

  // 1. Protect abbreviations (e.g. "TP. Hồ Chí Minh", "Co. Ltd.", "Dr. Nam") so '.' never triggers false sentence split
  for (const abbr of PROTECTED_ABBREVIATIONS) {
    const esc = abbr.replace(/\./g, '\\.');
    guarded = guarded.replace(new RegExp(`\\b${esc}\\s+`, 'g'), (m) =>
      m.replace(/\./g, '\u2024').replace(/\s+/g, NBSP)
    );
  }

  // 2. Protect dynamic brand names, company names, and product titles
  const sortedPhrases = [...protectedPhrases]
    .map((p) => (p || '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const phrase of sortedPhrases) {
    guarded = protectSpanSpaces(guarded, phrase);
  }

  // 3. Protect multi-word English / TitleCase brand & technical compounds (e.g. "Solaris Clean Energy", "Lithium LFP")
  guarded = guarded.replace(
    /\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)+\b/g,
    (m) => m.replace(/\s+/g, NBSP)
  );

  // 4. Protect numeric/spoken Vietnamese decimals, prices, and units
  guarded = guarded.replace(/\b\d+(?:[.,]\d+)+\s*(?:đồng|VND|VNĐ|USD|kWh|kW|Wh|W|Hz|cm|mm|m|kg|g|%)/gi, (m) =>
    m.replace(/\s+/g, NBSP)
  );
  // Spoken Vietnamese decimals ("hai phẩy năm", "không phẩy tám mươi lăm")
  guarded = guarded.replace(
    /\b(?:không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)(?:\s+(?:mươi|mốt|lăm|tư|trăm))?\s+phẩy\s+(?:không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)(?:\s+(?:mươi|mốt|lăm|tư))?\b/gi,
    (m) => m.replace(/\s+/g, NBSP)
  );
  // Spoken Vietnamese prices & measurement units ("năm mươi tư triệu đồng", "mười ki lô oát giờ", "tám mươi phần trăm")
  guarded = guarded.replace(
    /\b(?:(?:không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mươi|mốt|lăm|tư|lẻ|trăm|nghìn|triệu|tỷ)\s+){1,8}(?:đồng|đô\s+la\s+Mỹ|USD|ki\s+lô\s+oát\s+giờ|ki\s+lô\s+oát|oát\s+giờ|phần\s+trăm|chu\s+kỳ)\b/gi,
    (m) => m.replace(/\s+/g, NBSP)
  );

  const restore = (s: string): string =>
    s
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/\u2024/g, '.')
      .replace(/\s+/g, ' ')
      .trim();

  // Split by real sentence boundaries first
  const sentences = guarded
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawPieces: string[] = [];

  for (const sent of sentences) {
    if (sent.length <= targetMax) {
      rawPieces.push(sent);
      continue;
    }

    let rem = sent;
    while (rem.length > targetMax) {
      // Search for best natural break inside [targetMin .. targetMax], or up to first space after targetMax if a protected span is long
      const windowEnd = Math.min(rem.length, targetMax);
      const slice = rem.slice(0, windowEnd);

      let splitAt = -1;
      // Priority 1: Semicolon or comma pause inside [targetMin*0.65 .. windowEnd]
      const minPunct = Math.floor(targetMin * 0.65);
      const semi = slice.lastIndexOf('; ');
      const comma = slice.lastIndexOf(', ');
      if (semi >= minPunct) {
        splitAt = semi + 1;
      } else if (comma >= minPunct) {
        splitAt = comma + 1;
      } else {
        // Priority 2: Natural Vietnamese discourse connectors inside [minPunct .. windowEnd]
        const connectors = [
          ' thuộc thương hiệu ',
          ' chuyên về ',
          ' hiện có mức giá ',
          ' giúp ',
          ' hỗ trợ ',
          ' tích hợp ',
          ' lắp đặt ',
          ' quản lý ',
          ' để ',
          ' và ',
          ' hoặc ',
        ];
        for (const conn of connectors) {
          const idx = slice.lastIndexOf(conn);
          if (idx >= minPunct) {
            splitAt = idx;
            break;
          }
        }
      }

      // Priority 3: Last regular (non-NBSP!) space inside [minPunct .. windowEnd]
      if (splitAt === -1) {
        const sp = slice.lastIndexOf(' ');
        if (sp >= minPunct) {
          splitAt = sp;
        } else {
          // Protected phrase spans across targetMax -> advance to the very next regular space after targetMax
          const nextSp = rem.indexOf(' ', windowEnd);
          splitAt = nextSp !== -1 ? nextSp : rem.length;
        }
      }

      const head = rem.slice(0, splitAt).trim();
      if (head) rawPieces.push(head);
      rem = rem.slice(splitAt).trim();
    }
    if (rem) rawPieces.push(rem);
  }

  // Merge tiny fragments (< 42 chars) with adjacent clause if combined length stays reasonable (<= targetMax + 18)
  const merged: string[] = [];
  for (const piece of rawPieces) {
    const cleanPiece = restore(piece);
    if (!cleanPiece) continue;
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (
        (prev.length < 45 && prev.length + 1 + cleanPiece.length <= targetMax + 18) ||
        (cleanPiece.length < 36 && prev.length + 1 + cleanPiece.length <= targetMax + 24)
      ) {
        merged[merged.length - 1] = `${prev} ${cleanPiece}`.replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    merged.push(cleanPiece);
  }

  return merged.map((seg) => {
    const trimmed = seg.replace(/[,;:\s]+$/, '').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  });
}

export function extractWavFormatAndPcm(wavBuf: Buffer): {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  pcmData: Buffer;
} | null {
  if (!isValidWavBuffer(wavBuf)) return null;
  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let pcmData: Buffer | null = null;

  while (offset + 8 <= wavBuf.byteLength) {
    const chunkId = wavBuf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = wavBuf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === 'fmt ' && chunkSize >= 16 && dataStart + 16 <= wavBuf.byteLength) {
      audioFormat = wavBuf.readUInt16LE(dataStart);
      numChannels = wavBuf.readUInt16LE(dataStart + 2);
      sampleRate = wavBuf.readUInt32LE(dataStart + 4);
      bitsPerSample = wavBuf.readUInt16LE(dataStart + 14);
    } else if (chunkId === 'data') {
      const safeEnd = Math.min(wavBuf.byteLength, dataStart + chunkSize);
      pcmData = wavBuf.subarray(dataStart, safeEnd);
      break;
    }
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!pcmData) return null;
  return { audioFormat, numChannels, sampleRate, bitsPerSample, pcmData };
}

export function concatenatePcm16WavBuffers(wavBuffers: Buffer[], pauseMs = 140): Buffer {
  if (wavBuffers.length === 0) return Buffer.alloc(0);
  if (wavBuffers.length === 1) return wavBuffers[0];

  const parsed = wavBuffers.map(extractWavFormatAndPcm);
  if (parsed.some((p) => p === null)) {
    return wavBuffers[0];
  }
  const first = parsed[0]!;
  const bytesPerSample = Math.max(2, Math.floor(first.bitsPerSample / 8));
  const blockAlign = first.numChannels * bytesPerSample;
  const silenceSamples = Math.max(0, Math.round((first.sampleRate * pauseMs) / 1000));
  const silenceBuf = Buffer.alloc(silenceSamples * blockAlign, 0);

  const pcmParts: Buffer[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (i > 0 && silenceBuf.byteLength > 0) {
      pcmParts.push(silenceBuf);
    }
    pcmParts.push(parsed[i]!.pcmData);
  }
  const combinedPcm = Buffer.concat(pcmParts);
  const header = Buffer.alloc(44);
  const byteRate = first.sampleRate * blockAlign;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + combinedPcm.byteLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(first.audioFormat, 20);
  header.writeUInt16LE(first.numChannels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(combinedPcm.byteLength, 40);

  return Buffer.concat([header, combinedPcm]);
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
  korvaWorkerHangMs: number;
  korvaNonBlockingInit: boolean;
  diskCacheDir: string;
  diskCacheMaxBytes: number;
  diskCacheMaxFiles: number;
  diskCacheTtlMs: number;
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
  const customWorkerScript = (process.env.KORVATTS_WORKER_SCRIPT || '').trim();
  const workerTag = customWorkerScript
    ? `-mock:${crypto.createHash('sha1').update(customWorkerScript).digest('hex').slice(0, 8)}`
    : '';
  const korvaModelVersion =
    (process.env.KORVATTS_MODEL_VERSION || KORVATTS_MODEL_VERSION).trim() + workerTag;

  const parsedMaxQueue = Number(process.env.KORVATTS_MAX_QUEUE ?? 8);
  const korvaMaxQueue = Number.isFinite(parsedMaxQueue)
    ? Math.max(0, Math.min(32, Math.floor(parsedMaxQueue)))
    : 8;

  const parsedInitTimeout = Number(process.env.KORVATTS_INIT_TIMEOUT_MS || 45000);
  const korvaInitTimeoutMs = Number.isFinite(parsedInitTimeout)
    ? Math.max(200, Math.min(120000, parsedInitTimeout))
    : 45000;
  const korvaNonBlockingInit =
    (process.env.KORVATTS_NON_BLOCKING_INIT || '').trim().toLowerCase() === 'true';

  const outputFormat = (
    process.env.AZURE_SPEECH_OUTPUT_FORMAT || AZURE_DEFAULT_OUTPUT_FORMAT
  ).trim();
  const prosodyRate = (process.env.AZURE_SPEECH_RATE || '0%').trim();
  const prosodyPitch = (process.env.AZURE_SPEECH_PITCH || '0%').trim();

  const defaultTimeoutMs = provider === 'korvatts' ? 95000 : 8000;
  const maxTimeoutMs = provider === 'korvatts' ? 180000 : 20000;
  const minTimeoutMs = provider === 'korvatts' ? 250 : 1000;
  const timeoutMs = Math.max(
    minTimeoutMs,
    Math.min(maxTimeoutMs, Number(process.env.TTS_TIMEOUT_MS || defaultTimeoutMs))
  );

  const parsedHangMs = Number(
    process.env.KORVATTS_WORKER_HANG_MS || Math.max(timeoutMs * 2, 180000)
  );
  const korvaWorkerHangMs = Number.isFinite(parsedHangMs)
    ? Math.max(timeoutMs, Math.min(300000, parsedHangMs))
    : Math.max(timeoutMs * 2, 180000);

  const explicitCacheDir = (process.env.TTS_DISK_CACHE_DIR || '').trim();
  const defaultCacheRoot = process.env.VITEST
    ? path.join(os.tmpdir(), `virtual-expo-vitest-tts-cache-${process.pid}`)
    : process.platform === 'win32'
      ? path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
          'virtual-expo-tts-cache'
        )
      : path.join(os.homedir(), '.cache', 'virtual-expo-tts-cache');
  const diskCacheDir = explicitCacheDir || defaultCacheRoot;
  const diskCacheMaxBytes = Math.max(
    1024 * 1024,
    Number(process.env.TTS_DISK_CACHE_MAX_BYTES || 256 * 1024 * 1024)
  );
  const diskCacheMaxFiles = Math.max(
    8,
    Math.floor(Number(process.env.TTS_DISK_CACHE_MAX_FILES || 600))
  );
  const diskCacheTtlMs = Math.max(
    5000,
    Number(process.env.TTS_DISK_CACHE_TTL_MS || 14 * 24 * 60 * 60 * 1000)
  );

  const rateLimitPerMin = Math.max(5, Math.min(600, Number(process.env.TTS_RATE_LIMIT_PER_MIN || 90)));
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
    korvaWorkerHangMs,
    korvaNonBlockingInit,
    diskCacheDir,
    diskCacheMaxBytes,
    diskCacheMaxFiles,
    diskCacheTtlMs,
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

const PRIORITY_RANK: Record<TtsQueuePriority, number> = {
  ACTIVE_PLAYBACK: 0,
  NEXT_CHUNK: 1,
  PREFETCH: 2,
};

const VALID_CACHE_FILE_RE = /^[a-f0-9]{64}\.(wav|mp3)$/;
const VALID_CACHE_TMP_RE = /^[a-f0-9]{64}\.\d+\.[a-f0-9-]+\.tmp$/;

interface PendingKorvaJob {
  id: string;
  text: string;
  priority: TtsQueuePriority;
  enqueuedAt: number;
  cfg: ResolvedBackendTtsConfig;
  resolve: (res: { buffer: Buffer; mimeType: string }) => void;
  reject: (err: Error) => void;
}

interface ActiveKorvaJob extends PendingKorvaJob {
  hangTimer: ReturnType<typeof setTimeout>;
}

interface InFlightSynthesisEntry {
  jobId: string;
  promise: Promise<{ buffer: Buffer; mimeType: string }>;
  subscribers: Set<symbol>;
}

class KorvaTtsWorkerManager {
  private proc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  private workerPid: number | null = null;
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

  prewarm(): void {
    this.ensureProcessStarted().catch(() => undefined);
  }

  upgradePriority(jobId: string, newPriority: TtsQueuePriority): void {
    const target = this.pendingQueue.find((j) => j.id === jobId);
    if (target && PRIORITY_RANK[newPriority] < PRIORITY_RANK[target.priority]) {
      target.priority = newPriority;
    }
  }

  cancelQueuedJob(jobId: string): boolean {
    const idx = this.pendingQueue.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    const [removed] = this.pendingQueue.splice(idx, 1);
    removed.reject(new TtsServiceError('Đã hủy tác vụ chờ trong hàng đợi TTS.', 499, 'TTS_CANCELLED'));
    return true;
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
      this.workerPid = typeof child.pid === 'number' && child.pid > 0 ? child.pid : null;

      child.stdin.on('error', () => {
        // Ignore EPIPE / ERR_STREAM_WRITE_AFTER_END when worker exits concurrently
      });
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
          if (typeof msg.pid === 'number' && msg.pid > 0) {
            this.workerPid = msg.pid;
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
          clearTimeout(finishedJob.hangTimer);
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
        this.workerPid = null;
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
    clearTimeout(job.hangTimer);
    this.activeJob = null;
    this.jobRunning = false;
    job.reject(err);
  }

  private terminateVerifiedChildTree(child: ChildProcessByStdio<Writable, Readable, Readable>): void {
    try {
      if (child.stdin.writable && !child.stdin.writableEnded) {
        child.stdin.end();
      }
    } catch {
      // ignore
    }
    // Skip expensive process-tree kill if the child has already exited cleanly
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const rootPid = child.pid;
    if (
      process.platform === 'win32' &&
      typeof rootPid === 'number' &&
      Number.isInteger(rootPid) &&
      rootPid > 0 &&
      rootPid !== process.pid
    ) {
      // Safely terminate ONLY the process tree rooted at our verified spawned child PID (cleans uv trampoline + cpython child)
      try {
        execFileSync('taskkill', ['/PID', String(rootPid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 2500,
        });
        return;
      } catch {
        // Fallback to child.kill() if process already exited
      }
    }
    try {
      child.kill();
    } catch {
      // ignore
    }
  }

  private killProcessImmediate(): void {
    const child = this.proc;
    this.proc = null;
    this.workerPid = null;
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
      this.terminateVerifiedChildTree(child);
    }
  }

  async waitForReady(cfg: ResolvedBackendTtsConfig): Promise<void> {
    const initPromise = this.ensureProcessStarted();
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

  enqueueSynthesis(
    cfg: ResolvedBackendTtsConfig,
    speechText: string,
    priority: TtsQueuePriority = 'ACTIVE_PLAYBACK'
  ): { jobId: string; promise: Promise<{ buffer: Buffer; mimeType: string }> } {
    const jobId = crypto.randomUUID();

    if (this.jobRunning && this.pendingQueue.length >= cfg.korvaMaxQueue) {
      // If a higher-priority request arrives when queue is full of lower-priority prefetch jobs, evict newest prefetch
      let evictIdx = -1;
      const incomingRank = PRIORITY_RANK[priority];
      if (cfg.korvaMaxQueue > 0) {
        for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
          if (PRIORITY_RANK[this.pendingQueue[i].priority] > incomingRank) {
            evictIdx = i;
            break;
          }
        }
      }

      if (evictIdx !== -1) {
        const [evicted] = this.pendingQueue.splice(evictIdx, 1);
        evicted.reject(
          new TtsServiceError('Đã nhường hàng đợi cho yêu cầu phát chính.', 503, 'TTS_BUSY')
        );
      } else {
        return {
          jobId,
          promise: Promise.reject(
            new TtsServiceError(
              'Hệ thống tổng hợp giọng nói KorvaTTS đang bận xử lý các yêu cầu khác. Đang hiển thị phụ đề tiếng Việt.',
              503,
              'TTS_BUSY'
            )
          ),
        };
      }
    }

    const promise = new Promise<{ buffer: Buffer; mimeType: string }>((resolve, reject) => {
      this.pendingQueue.push({
        id: jobId,
        text: speechText,
        priority,
        enqueuedAt: Date.now(),
        cfg,
        resolve,
        reject,
      });
      this.pumpQueue();
    });

    return { jobId, promise };
  }

  private pickNextQueuedJob(): PendingKorvaJob | undefined {
    if (this.pendingQueue.length === 0) return undefined;
    const now = Date.now();
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < this.pendingQueue.length; i++) {
      const item = this.pendingQueue[i];
      const waitMs = Math.max(0, now - item.enqueuedAt);
      // Priority rank dominates (45s window per tier), while waitMs prevents starvation & enforces FIFO within same priority
      const score = PRIORITY_RANK[item.priority] * 45_000 - waitMs;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return this.pendingQueue.splice(bestIdx, 1)[0];
  }

  private pumpQueue(): void {
    if (this.jobRunning || this.activeJob !== null || this.pendingQueue.length === 0) return;

    const nextJob = this.pickNextQueuedJob();
    if (!nextJob) return;

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

    // Only kill the worker if the Python process genuinely hangs past korvaWorkerHangMs (not on impatient client disconnect!)
    const hangTimer = setTimeout(() => {
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
    }, job.cfg.korvaWorkerHangMs);

    this.activeJob = { ...job, hangTimer };

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
      clearTimeout(hangTimer);
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
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.killProcessImmediate();
      return;
    }

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(killTimer);
        this.proc = child;
        this.killProcessImmediate();
        resolve();
      };
      const killTimer = setTimeout(done, 400);
      child.once('exit', () => {
        if (finished) return;
        finished = true;
        clearTimeout(killTimer);
        this.proc = null;
        this.workerPid = null;
        if (this.rl) {
          try {
            this.rl.close();
          } catch {
            // ignore
          }
          this.rl = null;
        }
        this.readyPromise = null;
        this.state = 'stopped';
        resolve();
      });
      try {
        if (child.stdin.writable && !child.stdin.writableEnded) {
          child.stdin.write(JSON.stringify({ type: 'shutdown', id: 'stop' }) + '\n');
          child.stdin.end();
        } else {
          done();
        }
      } catch {
        done();
      }
    });
  }
}

export class ExpoService {
  private readonly ttsAudioCache = new Map<string, CachedAudioEntry>();
  private ttsTotalCacheBytes = 0;
  private readonly ttsInFlight = new Map<string, InFlightSynthesisEntry>();
  private readonly ttsRateBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly korvaWorker = new KorvaTtsWorkerManager();
  private diskCacheInitializedDir = '';
  private readonly onProcessExit = () => {
    void this.korvaWorker.shutdown();
  };

  constructor(private readonly db: ExpoDatabase) {
    process.once('exit', this.onProcessExit);
  }

  prewarmTtsWorker(): void {
    const cfg = resolveBackendTtsConfig();
    if (cfg.provider === 'korvatts') {
      this.korvaWorker.prewarm();
    }
  }

  getTtsWorkerState(): 'stopped' | 'starting' | 'ready' | 'failed' {
    return this.korvaWorker.getState();
  }

  async shutdown(): Promise<void> {
    process.off('exit', this.onProcessExit);
    await this.korvaWorker.shutdown();
    if (process.env.VITEST && !process.env.TTS_DISK_CACHE_DIR) {
      const vitestTmpDir = path.join(os.tmpdir(), `virtual-expo-vitest-tts-cache-${process.pid}`);
      try {
        if (fs.existsSync(vitestTmpDir)) {
          fs.rmSync(vitestTmpDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup race
      }
    }
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
    return this.buildVerifiedNpcStepPlan(params, providerHint).speechText;
  }

  private buildVerifiedNpcStepPlan(
    params: {
      boothId: string;
      stepType: NpcSpeechStepType;
      slotId?: string | null;
      productId?: string | null;
    },
    providerHint?: TtsProviderId
  ): { speechText: string; protectedPhrases: string[] } {
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

    const rawProtectedPhrases: string[] = [assistantName, cleanBoothName];
    if (cleanCompanyName) rawProtectedPhrases.push(cleanCompanyName.replace(/\.$/, ''));

    let speechText = '';

    if (params.stepType === 'GREETING') {
      const helloLead = preserveCompounds
        ? `Dạ xin chào quý khách, em là ${assistantName}`
        : `Dạ xin chào quý khách! Em là ${assistantName}`;
      if (totalProducts === 0) {
        speechText = `${helloLead}, chuyên viên tư vấn tại gian hàng ${cleanBoothName}${brandClause}. Hiện tại gian hàng chưa có sản phẩm nào được trưng bày trên kệ. Em cảm ơn quý khách đã ghé thăm ạ!`;
      } else {
        const taglineClause = cleanTagline
          ? `, chuyên về ${cleanTagline.replace(/\.$/, '')}`
          : '';
        const spokenCount = numberToVietnameseWords(totalProducts) || String(totalProducts);
        const todayLead = preserveCompounds
          ? 'Hôm nay em xin phép giới thiệu'
          : 'Hôm nay, em xin phép giới thiệu';
        speechText = `${helloLead}, tư vấn viên tại gian hàng ${cleanBoothName}${brandClause}${taglineClause}. ${todayLead} ${spokenCount} sản phẩm tiêu biểu đang trưng bày tại gian hàng mình ạ.`;
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

      if (cleanName) rawProtectedPhrases.push(cleanName.replace(/\.$/, ''));
      if (priceText) rawProtectedPhrases.push(priceText);

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

    const protectedPhrases = rawProtectedPhrases
      .map((p) => (preserveCompounds ? expandNumbersForKorvaVietnamese(p) : p).replace(/[.,;:\s]+$/, '').trim())
      .filter(Boolean);

    return { speechText: normalized, protectedPhrases };
  }

  private computeCacheKeyForText(cfg: ResolvedBackendTtsConfig, text: string): string {
    const prosodyVersionTag =
      cfg.provider === 'korvatts'
        ? `${cfg.korvaModelVersion}|speed:${cfg.korvaSpeed.toFixed(2)}|steps:${cfg.korvaSteps}`
        : cfg.provider === 'azure'
          ? `v24-azure-${cfg.outputFormat}-rate:${cfg.prosodyRate}-pitch:${cfg.prosodyPitch}`
          : `v24-${cfg.provider}-1.0`;
    const languageTag = cfg.provider === 'korvatts' ? cfg.korvaLang : 'vi-VN';
    return computeTtsCacheKey(cfg.provider, cfg.voice, languageTag, prosodyVersionTag, text);
  }

  private ensureDiskCacheDir(dir: string): boolean {
    if (!dir) return false;
    try {
      if (this.diskCacheInitializedDir !== dir) {
        fs.mkdirSync(dir, { recursive: true });
        this.diskCacheInitializedDir = dir;
        // Clean up any leftover atomic .tmp files from an interrupted process
        const names = fs.readdirSync(dir);
        for (const name of names) {
          if (VALID_CACHE_TMP_RE.test(name)) {
            try {
              fs.unlinkSync(path.join(dir, name));
            } catch {
              // ignore
            }
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  private hasCachedSegment(cfg: ResolvedBackendTtsConfig, cacheKey: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) return false;
    if (this.ttsAudioCache.has(cacheKey)) return true;
    if (!this.ensureDiskCacheDir(cfg.diskCacheDir)) return false;

    const extCandidates = cfg.provider === 'korvatts' ? ['wav'] : ['mp3', 'wav'];
    const now = Date.now();
    for (const ext of extCandidates) {
      const filePath = path.join(cfg.diskCacheDir, `${cacheKey}.${ext}`);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size > 44 && now - stat.mtimeMs <= cfg.diskCacheTtlMs) {
          return true;
        }
      } catch {
        // file does not exist
      }
    }
    return false;
  }

  private storeInRamCache(cacheKey: string, buffer: Buffer, mimeType: string): void {
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

  private getFromCache(cacheKey: string, cfg?: ResolvedBackendTtsConfig): CachedAudioEntry | null {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) return null;

    // L1: In-memory LRU cache
    const ramEntry = this.ttsAudioCache.get(cacheKey);
    if (ramEntry) {
      this.ttsAudioCache.delete(cacheKey);
      this.ttsAudioCache.set(cacheKey, ramEntry);
      return ramEntry;
    }

    // L2: Persistent local disk cache (survives Backend restarts; 100% outside Git)
    const activeCfg = cfg || resolveBackendTtsConfig();
    if (!this.ensureDiskCacheDir(activeCfg.diskCacheDir)) return null;

    const candidates: Array<{ ext: 'wav' | 'mp3'; mimeType: string }> =
      activeCfg.provider === 'korvatts'
        ? [{ ext: 'wav', mimeType: 'audio/wav' }]
        : [
            { ext: 'mp3', mimeType: 'audio/mpeg' },
            { ext: 'wav', mimeType: 'audio/wav' },
          ];

    const now = Date.now();
    for (const cand of candidates) {
      const filePath = path.join(activeCfg.diskCacheDir, `${cacheKey}.${cand.ext}`);
      try {
        if (!fs.existsSync(filePath)) continue;
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs > activeCfg.diskCacheTtlMs) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
          continue;
        }
        const buf = fs.readFileSync(filePath);
        const isValid = cand.ext === 'wav' ? isValidWavBuffer(buf) : buf.byteLength >= 64;
        if (!isValid) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
          continue;
        }
        try {
          const nowSec = now / 1000;
          fs.utimesSync(filePath, nowSec, nowSec);
        } catch {
          // ignore utimes errors on read-only mounts
        }
        this.storeInRamCache(cacheKey, buf, cand.mimeType);
        return {
          buffer: buf,
          mimeType: cand.mimeType,
          byteLength: buf.byteLength,
          createdAt: stat.mtimeMs,
        };
      } catch {
        // ignore disk read errors and treat as cache miss
      }
    }

    return null;
  }

  private pruneDiskCache(cfg: ResolvedBackendTtsConfig): void {
    try {
      const names = fs.readdirSync(cfg.diskCacheDir);
      const now = Date.now();
      const entries: Array<{ fullPath: string; size: number; mtimeMs: number }> = [];
      let totalBytes = 0;

      for (const name of names) {
        if (!VALID_CACHE_FILE_RE.test(name)) continue;
        const fullPath = path.join(cfg.diskCacheDir, name);
        try {
          const st = fs.statSync(fullPath);
          if (!st.isFile()) continue;
          if (now - st.mtimeMs > cfg.diskCacheTtlMs) {
            fs.unlinkSync(fullPath);
            continue;
          }
          entries.push({ fullPath, size: st.size, mtimeMs: st.mtimeMs });
          totalBytes += st.size;
        } catch {
          // ignore
        }
      }

      if (entries.length <= cfg.diskCacheMaxFiles && totalBytes <= cfg.diskCacheMaxBytes) {
        return;
      }

      entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
      while (
        entries.length > 0 &&
        (entries.length > cfg.diskCacheMaxFiles || totalBytes > cfg.diskCacheMaxBytes)
      ) {
        const oldest = entries.shift()!;
        totalBytes -= oldest.size;
        try {
          fs.unlinkSync(oldest.fullPath);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore pruning errors
    }
  }

  private storeInCache(
    cacheKey: string,
    buffer: Buffer,
    mimeType: string,
    cfg?: ResolvedBackendTtsConfig
  ): void {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) return;
    const isWav = mimeType === 'audio/wav';
    if (isWav ? !isValidWavBuffer(buffer) : buffer.byteLength < 64) return;

    this.storeInRamCache(cacheKey, buffer, mimeType);

    const activeCfg = cfg || resolveBackendTtsConfig();
    if (!this.ensureDiskCacheDir(activeCfg.diskCacheDir)) return;

    const ext = isWav ? 'wav' : 'mp3';
    const finalPath = path.join(activeCfg.diskCacheDir, `${cacheKey}.${ext}`);
    const tmpPath = path.join(
      activeCfg.diskCacheDir,
      `${cacheKey}.${process.pid}.${crypto.randomUUID()}.tmp`
    );

    try {
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, finalPath);
      this.pruneDiskCache(activeCfg);
    } catch {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }

  private validateProviderCredentials(cfg: ResolvedBackendTtsConfig): void {
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
  }

  private async synthesizeSingleSegment(
    cfg: ResolvedBackendTtsConfig,
    segmentText: string,
    priority: TtsQueuePriority,
    signal?: AbortSignal
  ): Promise<{ buffer: Buffer; mimeType: string; cacheStatus: 'HIT' | 'MISS'; cacheKey: string }> {
    const segKey = this.computeCacheKeyForText(cfg, segmentText);
    const cached = this.getFromCache(segKey, cfg);
    if (cached) {
      return {
        buffer: cached.buffer,
        mimeType: cached.mimeType,
        cacheStatus: 'HIT',
        cacheKey: segKey,
      };
    }

    if (signal?.aborted) {
      throw new TtsServiceError('Đã hủy yêu cầu tổng hợp âm thanh.', 499, 'TTS_CANCELLED');
    }

    this.validateProviderCredentials(cfg);

    let entry = this.ttsInFlight.get(segKey);
    if (entry) {
      if (cfg.provider === 'korvatts') {
        this.korvaWorker.upgradePriority(entry.jobId, priority);
      }
    } else {
      const started = this.startProviderSynthesis(cfg, segmentText, priority);
      const sharedPromise = started.promise
        .then((res) => {
          this.storeInCache(segKey, res.buffer, res.mimeType, cfg);
          return res;
        })
        .finally(() => {
          this.ttsInFlight.delete(segKey);
        });
      // Prevent unhandled rejection if all callers disconnect/timeout before worker settles
      sharedPromise.catch(() => undefined);

      entry = {
        jobId: started.jobId,
        promise: sharedPromise,
        subscribers: new Set<symbol>(),
      };
      this.ttsInFlight.set(segKey, entry);
    }

    const activeEntry = entry;
    const subId = Symbol('tts-caller');
    activeEntry.subscribers.add(subId);

    const detachCaller = () => {
      activeEntry.subscribers.delete(subId);
      if (activeEntry.subscribers.size === 0 && cfg.provider === 'korvatts') {
        // Cancel ONLY if still waiting in pendingQueue; if already running on CPU, let it finish & cache!
        this.korvaWorker.cancelQueuedJob(activeEntry.jobId);
      }
    };

    return new Promise<{
      buffer: Buffer;
      mimeType: string;
      cacheStatus: 'HIT' | 'MISS';
      cacheKey: string;
    }>((resolve, reject) => {
      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(reqTimer);
        detachCaller();
        reject(new TtsServiceError('Đã hủy yêu cầu tổng hợp âm thanh.', 499, 'TTS_CANCELLED'));
      };

      const reqTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        detachCaller();
        reject(
          new TtsServiceError(
            'Quá trình tổng hợp giọng nói vượt quá thời gian chờ (Timeout). Đang hiển thị phụ đề tiếng Việt.',
            504,
            'TTS_TIMEOUT'
          )
        );
      }, cfg.timeoutMs);

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      activeEntry.promise.then(
        (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(reqTimer);
          signal?.removeEventListener('abort', onAbort);
          activeEntry.subscribers.delete(subId);
          resolve({
            buffer: res.buffer,
            mimeType: res.mimeType,
            cacheStatus: 'MISS',
            cacheKey: segKey,
          });
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(reqTimer);
          signal?.removeEventListener('abort', onAbort);
          activeEntry.subscribers.delete(subId);
          reject(err);
        }
      );
    });
  }

  getNpcStepManifest(params: {
    boothId: string;
    stepType: NpcSpeechStepType;
    slotId?: string | null;
    productId?: string | null;
  }): NpcTtsManifestResult {
    const cfg = resolveBackendTtsConfig();
    const { speechText, protectedPhrases } = this.buildVerifiedNpcStepPlan(params, cfg.provider);

    if (cfg.provider === 'korvatts') {
      this.korvaWorker.prewarm();
    }

    const chunkTexts =
      cfg.provider === 'korvatts'
        ? chunkVietnameseConsultationSpeech(speechText, protectedPhrases, 70, 120)
        : [speechText];

    const chunks = chunkTexts.map((txt, idx) => {
      const ck = this.computeCacheKeyForText(cfg, txt);
      return {
        chunkIndex: idx,
        charLength: txt.length,
        cached: this.hasCachedSegment(cfg, ck),
      };
    });

    return {
      provider: cfg.provider,
      voice: cfg.voice,
      workerState: cfg.provider === 'korvatts' ? this.korvaWorker.getState() : 'ready',
      totalChunks: chunks.length,
      fullText: speechText,
      chunks,
    };
  }

  async synthesizeNpcStepAudio(params: NpcTtsRequestParams): Promise<NpcTtsSynthesisResult> {
    const cfg = resolveBackendTtsConfig();
    const { speechText, protectedPhrases } = this.buildVerifiedNpcStepPlan(params, cfg.provider);
    const priority: TtsQueuePriority = params.priority || 'ACTIVE_PLAYBACK';

    // Mode A: Single-chunk synthesis for low-latency early playback (`chunkIndex = 0..N-1`)
    if (typeof params.chunkIndex === 'number') {
      const chunkTexts =
        cfg.provider === 'korvatts'
          ? chunkVietnameseConsultationSpeech(speechText, protectedPhrases, 70, 120)
          : [speechText];

      if (params.chunkIndex < 0 || params.chunkIndex >= chunkTexts.length) {
        throw new TtsServiceError(
          'Chỉ mục đoạn âm thanh (chunkIndex) không hợp lệ.',
          400,
          'INVALID_CHUNK_INDEX'
        );
      }

      const targetChunkText = chunkTexts[params.chunkIndex];
      const chunkCacheKey = this.computeCacheKeyForText(cfg, targetChunkText);
      const cachedChunk = this.getFromCache(chunkCacheKey, cfg);
      if (cachedChunk) {
        return {
          audioBuffer: cachedChunk.buffer,
          mimeType: cachedChunk.mimeType,
          cacheStatus: 'HIT',
          cacheKey: chunkCacheKey,
          provider: cfg.provider,
          voice: cfg.voice,
          speechText: targetChunkText,
          chunkIndex: params.chunkIndex,
          totalChunks: chunkTexts.length,
        };
      }

      this.checkTtsRateLimit(params.clientIp || 'anonymous', cfg.rateLimitPerMin);
      const seg = await this.synthesizeSingleSegment(
        cfg,
        targetChunkText,
        priority,
        params.signal
      );

      return {
        audioBuffer: seg.buffer,
        mimeType: seg.mimeType,
        cacheStatus: seg.cacheStatus,
        cacheKey: seg.cacheKey,
        provider: cfg.provider,
        voice: cfg.voice,
        speechText: targetChunkText,
        chunkIndex: params.chunkIndex,
        totalChunks: chunkTexts.length,
      };
    }

    // Mode B: Full-step synthesis (backward-compatible with direct POST /api/npc/tts callers)
    const fullCacheKey = this.computeCacheKeyForText(cfg, speechText);
    const cachedFull = this.getFromCache(fullCacheKey, cfg);
    if (cachedFull) {
      return {
        audioBuffer: cachedFull.buffer,
        mimeType: cachedFull.mimeType,
        cacheStatus: 'HIT',
        cacheKey: fullCacheKey,
        provider: cfg.provider,
        voice: cfg.voice,
        speechText,
      };
    }

    this.checkTtsRateLimit(params.clientIp || 'anonymous', cfg.rateLimitPerMin);

    if (cfg.provider === 'korvatts') {
      const chunkTexts = chunkVietnameseConsultationSpeech(speechText, protectedPhrases, 70, 120);
      const wavParts: Buffer[] = [];
      let allHit = true;

      for (const chunkText of chunkTexts) {
        const seg = await this.synthesizeSingleSegment(cfg, chunkText, priority, params.signal);
        if (seg.cacheStatus === 'MISS') allHit = false;
        wavParts.push(seg.buffer);
      }

      const combinedWav = concatenatePcm16WavBuffers(wavParts, 140);
      this.storeInCache(fullCacheKey, combinedWav, 'audio/wav', cfg);

      return {
        audioBuffer: combinedWav,
        mimeType: 'audio/wav',
        cacheStatus: allHit ? 'HIT' : 'MISS',
        cacheKey: fullCacheKey,
        provider: cfg.provider,
        voice: cfg.voice,
        speechText,
        totalChunks: chunkTexts.length,
      };
    }

    const singleSeg = await this.synthesizeSingleSegment(cfg, speechText, priority, params.signal);
    return {
      audioBuffer: singleSeg.buffer,
      mimeType: singleSeg.mimeType,
      cacheStatus: singleSeg.cacheStatus,
      cacheKey: fullCacheKey,
      provider: cfg.provider,
      voice: cfg.voice,
      speechText,
    };
  }

  private startProviderSynthesis(
    cfg: ResolvedBackendTtsConfig,
    speechText: string,
    priority: TtsQueuePriority
  ): { jobId: string; promise: Promise<{ buffer: Buffer; mimeType: string }> } {
    if (cfg.provider === 'korvatts') {
      return this.korvaWorker.enqueueSynthesis(cfg, speechText, priority);
    }
    return {
      jobId: crypto.randomUUID(),
      promise: this.callCloudProviderTtsApi(cfg, speechText),
    };
  }

  private async callCloudProviderTtsApi(
    cfg: ResolvedBackendTtsConfig,
    speechText: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {

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
