import crypto from 'node:crypto';
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

export type TtsProviderId = 'fpt' | 'viettel' | 'google' | 'gtts';
export type NpcSpeechStepType = 'GREETING' | 'PRODUCT' | 'CLOSING';

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
const MAX_SPEECH_TEXT_LENGTH = 380;

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

export function normalizeTextForVietnameseTts(raw: unknown, maxLength = 220): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\[(?:SKU|Mã|ID)[^\]]*\]/gi, ' ')
    .replace(/<\s*(?=\d)/g, 'dưới ')
    .replace(/>\s*(?=\d)/g, 'trên ')
    .replace(/[<>]/g, ' ')
    .replace(/\b24\s*\/\s*7\b/g, 'hai tư trên bảy')
    .replace(/(\p{L})\s*\/\s*(\p{L})/gu, '$1 và $2')
    .replace(/&/g, ' và ')
    .replace(/(\d)\s*%/g, '$1 phần trăm')
    .replace(/°C\b/g, ' độ C')
    .replace(/\bm(?:2|²)\b/gi, ' mét vuông')
    .replace(/\bkWh\b/gi, ' ki lô oát giờ')
    .replace(/\bmAh\b/gi, ' mi li am pe giờ')
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

export function resolveBackendTtsConfig(): {
  provider: TtsProviderId;
  apiKey: string;
  requiresApiKey: boolean;
  voice: string;
  timeoutMs: number;
  rateLimitPerMin: number;
  endpointOverride?: string;
} {
  const rawProvider = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
  let provider: TtsProviderId = 'gtts';

  if (
    rawProvider === 'google' ||
    rawProvider === 'viettel' ||
    rawProvider === 'fpt' ||
    rawProvider === 'gtts'
  ) {
    provider = rawProvider;
  } else if (process.env.GOOGLE_TTS_API_KEY) {
    provider = 'google';
  } else if (process.env.VIETTEL_TTS_API_KEY) {
    provider = 'viettel';
  } else if (process.env.FPT_TTS_API_KEY || process.env.TTS_API_KEY) {
    provider = 'fpt';
  }

  const apiKey = (
    process.env.TTS_API_KEY ||
    (provider === 'google' ? process.env.GOOGLE_TTS_API_KEY : '') ||
    (provider === 'viettel' ? process.env.VIETTEL_TTS_API_KEY : '') ||
    (provider === 'fpt' ? process.env.FPT_TTS_API_KEY : '') ||
    ''
  ).trim();

  const requiresApiKey = provider !== 'gtts';

  const defaultVoice =
    provider === 'google'
      ? 'vi-VN-Neural2-A'
      : provider === 'viettel'
        ? 'hn-quynhanh'
        : provider === 'fpt'
          ? 'banmai'
          : 'vi-VN-Standard-A';

  const voice = (process.env.TTS_VOICE || defaultVoice).trim();
  const timeoutMs = Math.max(1000, Math.min(20000, Number(process.env.TTS_TIMEOUT_MS || 8000)));
  const rateLimitPerMin = Math.max(5, Math.min(300, Number(process.env.TTS_RATE_LIMIT_PER_MIN || 30)));
  const endpointOverride = (process.env.TTS_API_ENDPOINT || '').trim() || undefined;

  return {
    provider,
    apiKey,
    requiresApiKey,
    voice,
    timeoutMs,
    rateLimitPerMin,
    endpointOverride,
  };
}

export class ExpoService {
  private readonly ttsAudioCache = new Map<string, CachedAudioEntry>();
  private ttsTotalCacheBytes = 0;
  private readonly ttsInFlight = new Map<string, Promise<{ buffer: Buffer; mimeType: string }>>();
  private readonly ttsRateBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly db: ExpoDatabase) {}

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
  buildVerifiedNpcStepSpeechText(params: {
    boothId: string;
    stepType: NpcSpeechStepType;
    slotId?: string | null;
    productId?: string | null;
  }): string {
    const booth = this.db.getBoothById(params.boothId);
    if (!booth) {
      throw new TtsServiceError('Không tìm thấy gian hàng.', 404, 'BOOTH_NOT_FOUND');
    }

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
      const cleanName = sanitizeTtsText(p.name, 140);
      if (!cleanName) continue;
      if (seenProductIds.has(p.id)) continue;
      seenProductIds.add(p.id);
      validSlotViews.push(sv);
    }

    const totalProducts = validSlotViews.length;
    const assistantName = resolveAssistantNameForBooth(booth);
    const cleanBoothName = sanitizeTtsText(booth.name, 100) || 'Gian hàng triển lãm';
    const cleanTagline = sanitizeTtsText(booth.tagline, 120);

    let speechText = '';

    if (params.stepType === 'GREETING') {
      if (totalProducts === 0) {
        speechText = `Dạ xin chào quý khách! Em là ${assistantName}, chuyên viên tư vấn tại gian hàng ${cleanBoothName}. Hiện tại gian hàng chưa có sản phẩm nào được trưng bày trên kệ. Em cảm ơn quý khách đã ghé thăm ạ!`;
      } else {
        const taglineClause = cleanTagline
          ? `, chuyên về ${cleanTagline.replace(/\.$/, '')}`
          : '';
        const spokenCount = numberToVietnameseWords(totalProducts) || String(totalProducts);
        speechText = `Dạ xin chào quý khách! Em là ${assistantName}, tư vấn viên tại gian hàng ${cleanBoothName}${taglineClause}. Hôm nay, em xin phép giới thiệu ${spokenCount} sản phẩm tiêu biểu đang trưng bày tại gian hàng mình ạ.`;
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
      const cleanName = sanitizeTtsText(product.name, 115);
      const cleanDesc = sanitizeTtsText(product.description, 155);
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

    const normalized = speechText.replace(/\s+/g, ' ').trim().slice(0, MAX_SPEECH_TEXT_LENGTH);
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
    const speechText = this.buildVerifiedNpcStepSpeechText(params);

    // 2. Compute deterministic SHA-256 cache key (reflects provider, voice, prosody v2, and normalized text)
    const cacheKey = computeTtsCacheKey(
      cfg.provider,
      cfg.voice,
      'vi-VN',
      'v2-natural-0.96',
      speechText
    );

    // 3. Check in-memory LRU cache first (0 provider cost on cache hit)
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

    // 4. Enforce per-IP rate limit before calling external provider
    this.checkTtsRateLimit(params.clientIp || 'anonymous', cfg.rateLimitPerMin);

    // 5. Verify API Key is configured before making external keyed provider call
    if (cfg.requiresApiKey && !cfg.apiKey) {
      throw new TtsServiceError(
        `Dịch vụ giọng đọc Tiếng Việt đám mây (${cfg.provider.toUpperCase()}) chưa được cấu hình khóa TTS_API_KEY trên máy chủ. Đang hiển thị phụ đề tự động.`,
        503,
        'TTS_NOT_CONFIGURED'
      );
    }

    // 6. Deduplicate concurrent in-flight requests for the exact same cacheKey
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
    cfg: {
      provider: TtsProviderId;
      apiKey: string;
      voice: string;
      timeoutMs: number;
      endpointOverride?: string;
    },
    speechText: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
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
