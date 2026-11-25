import dns from 'node:dns/promises';
import net from 'node:net';
import {
  type CreateProductInput,
  type ExtractedProductDraft,
  CreateProductInputSchema,
  ExtractedProductDraftSchema,
} from '../schemas/expoSchemas.js';

const MAX_HTML_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    const mappedV4 = normalized.slice('::ffff:'.length);
    if (net.isIPv4(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
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

export async function fetchExternalProductHtml(initialUrl: string): Promise<{
  html: string;
  finalUrl: string;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validatedUrl = await validateExternalUrlSafety(currentUrl);

    const response = await fetch(validatedUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'VirtualExpo25D-ProductImporter/1.0 (+https://example.com)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Trang web chuyển hướng (redirect) nhưng không có đích đến.');
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error('Quá số lần chuyển hướng (redirect) cho phép.');
      }
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Website nguồn trả về mã lỗi HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new Error(`Loại nội dung không được hỗ trợ (${contentType}). Chỉ hỗ trợ trang HTML.`);
    }

    if (!response.body) {
      throw new Error('Phản hồi từ website nguồn rỗng.');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_HTML_BYTES) {
          await reader.cancel();
          throw new Error('Dung lượng trang web vượt quá giới hạn an toàn (1 MB).');
        }
        chunks.push(value);
      }
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const html = new TextDecoder('utf-8').decode(combined);
    return { html, finalUrl: validatedUrl.toString() };
  }

  throw new Error('Không thể tải nội dung từ URL.');
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
