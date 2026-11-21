import dns from 'node:dns/promises';
import net from 'node:net';
import {
  type CreateProductInput,
  type ExtractedProductDraft,
  CreateProductInputSchema,
  ExtractedProductDraftSchema,
} from '../schemas/expoSchemas.js';

export const MAX_HTML_BYTES = 3_500_000; // 3.5 MB decompressed per HTML page (safe for modern SSR e-commerce)
export const MAX_SITEMAP_BYTES = 2_000_000; // 2 MB per robots.txt / sitemap XML
export const MAX_TOTAL_CRAWL_BYTES = 12_000_000; // 12 MB total decompressed budget per website discovery
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type ExternalFetchErrorCode =
  | 'SIZE_LIMIT'
  | 'TOTAL_BUDGET_LIMIT'
  | 'TIMEOUT'
  | 'HTTP_403'
  | 'HTTP_429'
  | 'HTTP_ERROR'
  | 'CAPTCHA_BLOCKED'
  | 'SSRF_BLOCKED'
  | 'UNSUPPORTED_CONTENT'
  | 'EMPTY_BODY'
  | 'INVALID_URL';

export class ExternalFetchError extends Error {
  readonly code: ExternalFetchErrorCode;
  readonly statusCode?: number;
  readonly bytesRead?: number;

  constructor(
    message: string,
    code: ExternalFetchErrorCode,
    opts?: { statusCode?: number; bytesRead?: number }
  ) {
    super(message);
    this.name = 'ExternalFetchError';
    this.code = code;
    this.statusCode = opts?.statusCode;
    this.bytesRead = opts?.bytesRead;
  }
}

export interface CrawlBudget {
  totalBytesRead: number;
  maxTotalBytes: number;
}

export function createCrawlBudget(maxTotalBytes = MAX_TOTAL_CRAWL_BYTES): CrawlBudget {
  return { totalBytesRead: 0, maxTotalBytes };
}

function looksLikeCaptchaOrBotChallenge(html: string): boolean {
  const sample = html.slice(0, 60_000).toLowerCase();
  return (
    sample.includes('cf-browser-verification') ||
    sample.includes('challenges.cloudflare.com/turnstile') ||
    sample.includes('just a moment...') ||
    sample.includes('checking your browser before accessing') ||
    sample.includes('verify you are human') ||
    sample.includes('g-recaptcha') && sample.includes('captcha') && sample.length < 15_000
  );
}

function decodeIpv4MappedIpv6Hex(tail: string): string | null {
  if (net.isIPv4(tail)) return tail;
  const parts = tail.split(':');
  if (parts.length !== 2) return null;
  const hi = parseInt(parts[0], 16);
  const lo = parseInt(parts[1], 16);
  if (
    !Number.isInteger(hi) ||
    !Number.isInteger(lo) ||
    hi < 0 ||
    hi > 0xffff ||
    lo < 0 ||
    lo > 0xffff ||
    !/^[0-9a-f]{1,4}$/i.test(parts[0]) ||
    !/^[0-9a-f]{1,4}$/i.test(parts[1])
  ) {
    return null;
  }
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // V28-AUDIT-010: Handle BOTH dotted-quad (::ffff:127.0.0.1) AND hex-normalized (::ffff:7f00:1) IPv4-mapped IPv6!
  if (normalized.startsWith('::ffff:')) {
    const tail = normalized.slice('::ffff:'.length);
    const mappedV4 = decodeIpv4MappedIpv6Hex(tail);
    if (!mappedV4) return true; // Fail closed for any unrecognized ::ffff: form
    return isPrivateOrReservedIp(mappedV4);
  }

  // Block NAT64 well-known prefix 64:ff9b::/96 (can wrap private IPv4 addresses)
  if (normalized.startsWith('64:ff9b:')) {
    return true;
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b, c] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark private
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export async function validateExternalUrlSafety(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL không hợp lệ.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ chấp nhận giao thức HTTP hoặc HTTPS.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL không được chứa thông tin xác thực nội bộ.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Chặn truy cập localhost và tên miền nội bộ (Bảo mật SSRF).');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('Chặn truy cập địa chỉ IP nội bộ / loopback / link-local (Bảo mật SSRF).');
    }
    return parsed;
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Không thể phân giải tên miền '${hostname}'.`);
  }

  if (!records || records.length === 0) {
    throw new Error(`Tên miền '${hostname}' không có bản ghi IP hợp lệ.`);
  }

  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error(
        `Tên miền '${hostname}' trỏ về địa chỉ IP nội bộ (${rec.address}) — Đã chặn truy cập.`
      );
    }
  }

  return parsed;
}

export async function validateExternalUrlSafetyWithIp(rawUrl: string): Promise<{
  url: URL;
  pinnedIp: string;
  pinnedFamily: number;
}> {
  const parsed = await validateExternalUrlSafety(rawUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) {
    return { url: parsed, pinnedIp: hostname, pinnedFamily: net.isIP(hostname) };
  }
  const records = await dns.lookup(hostname, { all: true });
  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error(
        `Tên miền '${hostname}' trỏ về địa chỉ IP nội bộ (${rec.address}) — Đã chặn truy cập.`
      );
    }
  }
  return { url: parsed, pinnedIp: records[0].address, pinnedFamily: records[0].family };
}

async function createPinnedDispatcher(
  pinnedIp: string,
  pinnedFamily: number
): Promise<{ dispatcher?: unknown; close: () => Promise<void> }> {
  try {
    const modName = 'undici';
    const undici = (await import(modName)) as {
      Agent?: new (opts: Record<string, unknown>) => { close: () => Promise<void> };
    };
    if (!undici?.Agent) return { close: async () => { } };
    const agent = new undici.Agent({
      connect: {
        lookup: (
          _hostname: string,
          opts: { all?: boolean } | ((err: Error | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void),
          cb?: (err: Error | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void
        ) => {
          const callback = typeof opts === 'function' ? opts : cb!;
          const wantAll = typeof opts === 'object' && opts !== null && Boolean(opts.all);
          if (wantAll) {
            callback(null, [{ address: pinnedIp, family: pinnedFamily }]);
          } else {
            callback(null, pinnedIp, pinnedFamily);
          }
        },
      },
    });
    return { dispatcher: agent, close: () => agent.close().catch(() => { }) };
  } catch {
    return { close: async () => { } };
  }
}

export async function fetchExternalText(
  initialUrl: string,
  options?: {
    maxBytes?: number;
    budget?: CrawlBudget;
    accept?: string;
    allowedContentTypes?: string[];
    checkCaptcha?: boolean;
    resourceLabel?: string;
  }
): Promise<{
  text: string;
  finalUrl: string;
  bytesRead: number;
  contentType: string;
}> {
  const maxBytes = options?.maxBytes ?? MAX_HTML_BYTES;
  const budget = options?.budget;
  const resourceLabel = options?.resourceLabel || 'trang web';
  const accept = options?.accept || 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';
  const allowedContentTypes = options?.allowedContentTypes ?? ['text/html', 'application/xhtml+xml'];

  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url: validatedUrl, pinnedIp, pinnedFamily } = await validateExternalUrlSafetyWithIp(currentUrl);
    const pinned = await createPinnedDispatcher(pinnedIp, pinnedFamily);

    let response: Response;
    try {
      const fetchOpts: RequestInit & { dispatcher?: unknown } = {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'VirtualExpo25D-ProductImporter/1.0 (+https://example.com)',
          Accept: accept,
        },
      };
      if (pinned.dispatcher) {
        fetchOpts.dispatcher = pinned.dispatcher;
      }
      response = await fetch(validatedUrl.toString(), fetchOpts);
    } catch (err) {
      await pinned.close();
      const e = err as Error;
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /timeout|aborted/i.test(e?.message || '')) {
        throw new ExternalFetchError(
          `Hết thời gian chờ phản hồi (${Math.round(FETCH_TIMEOUT_MS / 1000)} giây) khi kết nối tới website nguồn.`,
          'TIMEOUT'
        );
      }
      throw new ExternalFetchError(`Không thể kết nối tới website nguồn: ${e?.message || 'Lỗi mạng'}.`, 'HTTP_ERROR');
    } finally {
      // Close pinned agent after response headers are received (stream keeps socket alive until done)
      void pinned.close();
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ExternalFetchError('Trang web chuyển hướng (redirect) nhưng không có đích đến.', 'HTTP_ERROR', {
          statusCode: response.status,
        });
      }
      if (hop === MAX_REDIRECTS) {
        throw new ExternalFetchError('Quá số lần chuyển hướng (redirect) cho phép.', 'HTTP_ERROR', {
          statusCode: response.status,
        });
      }
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }

    if (response.status === 403) {
      throw new ExternalFetchError(
        'Website nguồn từ chối truy cập tự động (HTTP 403 Forbidden). Vui lòng thử URL danh mục/sản phẩm khác hoặc dùng Excel.',
        'HTTP_403',
        { statusCode: 403 }
      );
    }

    if (response.status === 429) {
      throw new ExternalFetchError(
        'Website nguồn giới hạn tần suất truy cập (HTTP 429 Too Many Requests). Vui lòng thử lại sau ít phút hoặc dùng Excel.',
        'HTTP_429',
        { statusCode: 429 }
      );
    }

    if (!response.ok) {
      throw new ExternalFetchError(`Website nguồn trả về mã lỗi HTTP ${response.status}.`, 'HTTP_ERROR', {
        statusCode: response.status,
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      allowedContentTypes.length > 0 &&
      !allowedContentTypes.some((allowed) => contentType.includes(allowed))
    ) {
      throw new ExternalFetchError(
        `Loại nội dung không được hỗ trợ (${contentType}).`,
        'UNSUPPORTED_CONTENT'
      );
    }

    // Pre-check Content-Length header when present (fast reject before reading body)
    const rawContentLength = response.headers.get('content-length');
    if (rawContentLength) {
      const declaredBytes = Number(rawContentLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        await response.body?.cancel().catch(() => { });
        throw new ExternalFetchError(
          `Dung lượng ${resourceLabel} (${(declaredBytes / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn an toàn (${(maxBytes / (1024 * 1024)).toFixed(1)} MB).`,
          'SIZE_LIMIT',
          { bytesRead: declaredBytes }
        );
      }
    }

    if (!response.body) {
      throw new ExternalFetchError('Phản hồi từ website nguồn rỗng.', 'EMPTY_BODY');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await reader.read();
      } catch (err) {
        const e = err as Error;
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /timeout|aborted/i.test(e?.message || '')) {
          throw new ExternalFetchError(
            `Hết thời gian đọc dữ liệu từ website nguồn (${Math.round(FETCH_TIMEOUT_MS / 1000)} giây).`,
            'TIMEOUT',
            { bytesRead: totalBytes }
          );
        }
        throw err;
      }

      if (step.done) break;
      if (step.value) {
        totalBytes += step.value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => { });
          throw new ExternalFetchError(
            `Dung lượng ${resourceLabel} sau giải nén vượt quá giới hạn an toàn (${(maxBytes / (1024 * 1024)).toFixed(1)} MB).`,
            'SIZE_LIMIT',
            { bytesRead: totalBytes }
          );
        }
        if (budget && budget.totalBytesRead + totalBytes > budget.maxTotalBytes) {
          await reader.cancel().catch(() => { });
          throw new ExternalFetchError(
            `Tổng dung lượng dữ liệu tải từ website vượt quá giới hạn an toàn (${(budget.maxTotalBytes / (1024 * 1024)).toFixed(1)} MB).`,
            'TOTAL_BUDGET_LIMIT',
            { bytesRead: totalBytes }
          );
        }
        chunks.push(step.value);
      }
    }

    if (budget) {
      budget.totalBytesRead += totalBytes;
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder('utf-8').decode(combined);
    if (options?.checkCaptcha !== false && looksLikeCaptchaOrBotChallenge(text)) {
      throw new ExternalFetchError(
        'Website nguồn đang bật cơ chế chống bot / CAPTCHA nên không thể trích xuất tự động. Vui lòng nhập URL sản phẩm cụ thể hoặc dùng Excel.',
        'CAPTCHA_BLOCKED',
        { bytesRead: totalBytes }
      );
    }

    return { text, finalUrl: validatedUrl.toString(), bytesRead: totalBytes, contentType };
  }

  throw new ExternalFetchError('Không thể tải nội dung từ URL.', 'HTTP_ERROR');
}

export async function fetchExternalProductHtml(
  initialUrl: string,
  options?: { maxBytes?: number; budget?: CrawlBudget }
): Promise<{
  html: string;
  finalUrl: string;
  bytesRead: number;
}> {
  const res = await fetchExternalText(initialUrl, {
    maxBytes: options?.maxBytes ?? MAX_HTML_BYTES,
    budget: options?.budget,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
    checkCaptcha: true,
    resourceLabel: 'trang web',
  });
  return { html: res.text, finalUrl: res.finalUrl, bytesRead: res.bytesRead };
}

export function extractBreadcrumbCategoryFromHtml(html: string): string {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      const nodes: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (node['@type'] === 'Product' && typeof node.category === 'string' && node.category.trim()) {
          return decodeHtmlEntities(node.category).slice(0, 80);
        }
        if (node['@type'] === 'BreadcrumbList' && Array.isArray(node.itemListElement)) {
          // Typically index 0 is Home/Brand, index 1 is main category (e.g. "Điện thoại", "Laptop")
          const items = node.itemListElement as Array<Record<string, unknown>>;
          const candidate = items.length >= 3 ? items[1] : items.length === 2 ? items[1] : null;
          const itemObj = (candidate?.item && typeof candidate.item === 'object'
            ? candidate.item
            : candidate) as Record<string, unknown> | null;
          if (itemObj && typeof itemObj.name === 'string' && itemObj.name.trim()) {
            const cat = decodeHtmlEntities(itemObj.name).slice(0, 80);
            if (!/^(trang chủ|home)$/i.test(cat)) return cat;
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return '';
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function resolveUrlMaybe(candidate: string | undefined, baseUrl: string): string {
  if (!candidate || typeof candidate !== 'string') return '';
  const trimmed = candidate.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return '';
  }
}

function findProductNodeInJsonLd(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNodeInJsonLd(item);
      if (found) return found;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  const rawType = obj['@type'];
  const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType || '')];
  if (types.some((t) => t.toLowerCase().includes('product'))) {
    return obj;
  }

  if (Array.isArray(obj['@graph'])) {
    const found = findProductNodeInJsonLd(obj['@graph']);
    if (found) return found;
  }

  return null;
}

export function extractProductFromHtml(html: string, sourceUrl: string): ExtractedProductDraft {
  let name = '';
  let description = '';
  let price = 0;
  let currency = 'VND';
  let sku = '';
  let inStock = true;
  let videoUrl = '';
  const images: string[] = [];
  const warnings: string[] = [];
  let hasJsonLdProduct = false;
  let hasOpenGraph = false;

  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      const productNode = findProductNodeInJsonLd(parsed);
      if (productNode) {
        hasJsonLdProduct = true;
        if (typeof productNode.name === 'string') {
          name = decodeHtmlEntities(productNode.name);
        }
        if (typeof productNode.description === 'string') {
          description = decodeHtmlEntities(productNode.description);
        }
        if (typeof productNode.sku === 'string') {
          sku = productNode.sku.trim();
        }

        const rawImg = productNode.image;
        if (typeof rawImg === 'string') {
          const resolved = resolveUrlMaybe(rawImg, sourceUrl);
          if (resolved) images.push(resolved);
        } else if (Array.isArray(rawImg)) {
          for (const item of rawImg) {
            if (typeof item === 'string') {
              const resolved = resolveUrlMaybe(item, sourceUrl);
              if (resolved) images.push(resolved);
            } else if (item && typeof item === 'object' && 'url' in item) {
              const resolved = resolveUrlMaybe(String((item as { url: unknown }).url), sourceUrl);
              if (resolved) images.push(resolved);
            }
          }
        } else if (rawImg && typeof rawImg === 'object' && 'url' in rawImg) {
          const resolved = resolveUrlMaybe(String((rawImg as { url: unknown }).url), sourceUrl);
          if (resolved) images.push(resolved);
        }

        const rawOffers = productNode.offers;
        const offerObj = Array.isArray(rawOffers) ? rawOffers[0] : rawOffers;
        if (offerObj && typeof offerObj === 'object') {
          const offer = offerObj as Record<string, unknown>;
          const rawPrice = offer.price ?? offer.lowPrice;
          if (rawPrice !== undefined && rawPrice !== null) {
            const numPrice = Number(String(rawPrice).replace(/[^0-9.]/g, ''));
            if (!Number.isNaN(numPrice) && numPrice >= 0) {
              price = numPrice;
            }
          }
          if (typeof offer.priceCurrency === 'string' && offer.priceCurrency.trim()) {
            currency = offer.priceCurrency.trim().toUpperCase();
          }
          if (typeof offer.availability === 'string') {
            inStock = !offer.availability.toLowerCase().includes('outofstock');
          }
        }
        break;
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  const metaRegex = /<meta\s+([^>]+)>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const attrs = metaMatch[1];
    const propMatch = /(?:property|name)=["']([^"']+)["']/i.exec(attrs);
    const contentMatch = /content=["']([^"']*)["']/i.exec(attrs);
    if (!propMatch || !contentMatch) continue;

    const key = propMatch[1].toLowerCase().trim();
    const val = decodeHtmlEntities(contentMatch[1]);
    if (!val) continue;

    if (key === 'og:title' && !name) {
      name = val;
      hasOpenGraph = true;
    } else if ((key === 'og:description' || key === 'description') && !description) {
      description = val;
      if (key === 'og:description') hasOpenGraph = true;
    } else if (key === 'og:image' || key === 'og:image:secure_url') {
      const resolved = resolveUrlMaybe(val, sourceUrl);
      if (resolved && !images.includes(resolved)) {
        images.push(resolved);
        hasOpenGraph = true;
      }
    } else if (key === 'og:video' || key === 'og:video:secure_url') {
      const resolved = resolveUrlMaybe(val, sourceUrl);
      if (resolved && !videoUrl) {
        videoUrl = resolved;
        hasOpenGraph = true;
      }
    } else if (
      (key === 'product:price:amount' || key === 'og:price:amount') &&
      price === 0
    ) {
      const numPrice = Number(val.replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(numPrice) && numPrice > 0) {
        price = numPrice;
        hasOpenGraph = true;
      }
    } else if (key === 'product:price:currency' || key === 'og:price:currency') {
      currency = val.toUpperCase();
    }
  }

  if (!name) {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (titleMatch && titleMatch[1]) {
      name = decodeHtmlEntities(titleMatch[1]);
    }
  }

  if (!name) {
    warnings.push('Không tìm thấy tên sản phẩm tự động — Vui lòng nhập tên sản phẩm.');
  }
  if (price === 0) {
    warnings.push('Không tìm thấy giá bán trong dữ liệu cấu trúc — Vui lòng kiểm tra và nhập giá.');
  }
  if (images.length === 0) {
    warnings.push('Không tìm thấy ảnh sản phẩm — Bạn có thể dán thêm URL hình ảnh.');
  }

  const extractionMethod: ExtractedProductDraft['extractionMethod'] = hasJsonLdProduct
    ? 'json-ld'
    : hasOpenGraph
      ? 'opengraph'
      : name
        ? 'meta-fallback'
        : 'partial';

  return ExtractedProductDraftSchema.parse({
    name,
    price,
    currency,
    description,
    images,
    videoUrl,
    sourceUrl,
    sku,
    inStock,
    extractionMethod,
    warnings,
  });
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseBatchProducts(
  boothId: string,
  format: 'json' | 'csv',
  content: string
): CreateProductInput[] {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Nội dung import không được để trống.');
  }

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Định dạng JSON không hợp lệ.');
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0 || items.length > 100) {
      throw new Error('Số lượng sản phẩm import mỗi lần phải từ 1 đến 100.');
    }

    return items.map((raw, idx) => {
      const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const images = Array.isArray(obj.images)
        ? obj.images.map(String)
        : typeof obj.imageUrl === 'string' && obj.imageUrl
          ? [obj.imageUrl]
          : [];

      const res = CreateProductInputSchema.safeParse({
        boothId,
        name: String(obj.name || ''),
        price: Number(obj.price ?? 0),
        currency: String(obj.currency || 'VND'),
        description: String(obj.description || ''),
        images,
        videoUrl: String(obj.videoUrl || ''),
        sourceUrl: String(obj.sourceUrl || 'https://example.com'),
        contactUrl: String(obj.contactUrl || ''),
        sku: String(obj.sku || ''),
        inStock: obj.inStock === undefined ? true : Boolean(obj.inStock),
      });

      if (!res.success) {
        throw new Error(`Dòng JSON #${idx + 1} không hợp lệ: ${res.error.issues[0]?.message}`);
      }
      return res.data;
    });
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('File CSV cần có dòng tiêu đề (header) và ít nhất 1 dòng dữ liệu.');
  }

  const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: CreateProductInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      rec[h] = cols[colIdx] ?? '';
    });

    const imageUrl = rec.imageurl || rec.image || rec.images || '';
    const res = CreateProductInputSchema.safeParse({
      boothId,
      name: rec.name || rec.title || '',
      price: Number(rec.price || 0),
      currency: rec.currency || 'VND',
      description: rec.description || '',
      images: imageUrl ? imageUrl.split('|').map((s) => s.trim()).filter(Boolean) : [],
      videoUrl: rec.videourl || '',
      sourceUrl: rec.sourceurl || rec.url || 'https://example.com',
      contactUrl: rec.contacturl || '',
      sku: rec.sku || '',
      inStock: rec.instock ? rec.instock.toLowerCase() !== 'false' : true,
    });

    if (!res.success) {
      throw new Error(`Dòng CSV #${i} không hợp lệ: ${res.error.issues[0]?.message}`);
    }
    rows.push(res.data);
  }

  return rows;
}

export interface DetectedSellerOrganization {
  name: string;
  canonicalDomain: string;
  websiteUrl: string;
  logoUrl: string;
  contactEmail: string;
  description: string;
  confidence: 'verified' | 'needs_confirmation';
  evidence: string;
}

function normalizeCanonicalHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Extracts the website's seller / owning organization (e.g. "CellphoneS") strictly from
 * structured data (Schema.org Organization / Store / LocalBusiness / WebSite), og:site_name,
 * application-name, and canonical domain — NEVER guessing a brand from a bare domain alone
 * without verifiable evidence, and NEVER confusing individual product brands (Apple/Samsung)
 * with the website's seller entity.
 */
export function extractSellerOrganizationFromHtml(
  html: string,
  sourceUrl: string
): DetectedSellerOrganization {
  const canonicalDomain = normalizeCanonicalHost(sourceUrl);
  const origin = (() => {
    try {
      return new URL(sourceUrl).origin;
    } catch {
      return sourceUrl;
    }
  })();

  let name = '';
  let logoUrl = '';
  let contactEmail = '';
  let description = '';
  let evidence = 'none';
  let confidence: 'verified' | 'needs_confirmation' = 'needs_confirmation';

  // 1. Schema.org Organization / Store / LocalBusiness / WebSite.publisher
  const jsonLdBlocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const stack: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? [...parsed]
        : Array.isArray(parsed?.['@graph'])
          ? [...parsed['@graph']]
          : [parsed];

      while (stack.length > 0) {
        const node = stack.shift();
        if (!node || typeof node !== 'object') continue;
        const rawType = node['@type'];
        const types = (Array.isArray(rawType) ? rawType : [rawType])
          .map((t) => String(t || '').toLowerCase());

        const isOrg = types.some((t) =>
          t === 'organization' ||
          t === 'store' ||
          t === 'localbusiness' ||
          t === 'corporation' ||
          t === 'onlinestore' ||
          t.endsWith('store')
        );
        const isWebSite = types.includes('website');

        if (isOrg && typeof node.name === 'string' && node.name.trim().length >= 2) {
          name = decodeHtmlEntities(node.name).slice(0, 120);
          evidence = 'json-ld-organization';
          confidence = 'verified';
          if (!logoUrl) {
            const rawLogo = node.logo;
            const lUrl = typeof rawLogo === 'string' ? rawLogo : (rawLogo as { url?: string } | undefined)?.url || '';
            logoUrl = resolveUrlMaybe(lUrl, sourceUrl);
          }
          if (!contactEmail && typeof node.email === 'string') {
            contactEmail = node.email.replace(/^mailto:/i, '').trim().slice(0, 120);
          }
          if (!description && typeof node.description === 'string') {
            description = decodeHtmlEntities(node.description).slice(0, 300);
          }
          break;
        }

        if (isWebSite) {
          if (node.publisher && typeof node.publisher === 'object') {
            stack.unshift(node.publisher as Record<string, unknown>);
          }
          if (!name && typeof node.name === 'string' && node.name.trim().length >= 2) {
            name = decodeHtmlEntities(node.name).slice(0, 120);
            evidence = 'json-ld-website';
            confidence = 'verified';
          }
        }
      }
      if (confidence === 'verified' && name) break;
    } catch {
      // ignore malformed JSON-LD block
    }
  }

  // 2. Meta tags: og:site_name, application-name, apple-mobile-web-app-title
  if (!name) {
    const metaMatches = html.matchAll(/<meta\s+[^>]*>/gi);
    for (const m of metaMatches) {
      const tag = m[0];
      const prop = (/(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1] || '').toLowerCase();
      const content = (/content=["']([^"']*)["']/i.exec(tag)?.[1] || '').trim();
      if (!content) continue;
      if (prop === 'og:site_name' || prop === 'application-name' || prop === 'apple-mobile-web-app-title') {
        const cleaned = decodeHtmlEntities(content).slice(0, 120);
        if (cleaned.length >= 2) {
          name = cleaned;
          evidence = `meta:${prop}`;
          // Verify against canonical domain stem if possible
          const stem = canonicalDomain.split('.')[0] || '';
          const normName = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
          confidence = stem.length >= 3 && (normName.includes(stem) || stem.includes(normName))
            ? 'verified'
            : 'needs_confirmation';
          break;
        }
      }
    }
  }

  // 3. Extract public email fallback if missing
  if (!contactEmail) {
    const mailMatch = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(html);
    if (mailMatch?.[1]) {
      contactEmail = mailMatch[1].trim().slice(0, 120);
    }
  }

  return {
    name,
    canonicalDomain,
    websiteUrl: origin,
    logoUrl,
    contactEmail,
    description,
    confidence: name && confidence === 'verified' ? 'verified' : 'needs_confirmation',
    evidence,
  };
}

/**
 * Extracts the product's manufacturer Brand (e.g. Apple, Samsung, Sony) separately from Seller.
 */
export function extractProductBrandFromHtml(html: string): string {
  const jsonLdBlocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const nodes: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const t = Array.isArray(node['@type']) ? node['@type'].join(',') : String(node['@type'] || '');
        if (!/product/i.test(t)) continue;
        const b = node.brand;
        if (typeof b === 'string' && b.trim()) return decodeHtmlEntities(b).slice(0, 80);
        if (b && typeof b === 'object' && typeof (b as { name?: string }).name === 'string') {
          return decodeHtmlEntities((b as { name: string }).name).slice(0, 80);
        }
      }
    } catch {
      // ignore
    }
  }
  return '';
}
