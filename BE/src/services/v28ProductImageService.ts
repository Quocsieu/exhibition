import crypto from 'node:crypto';
import {
  ExternalFetchError,
  validateExternalUrlSafetyWithIp,
} from '../integrations/productAdapter.js';
import {
  createProductImageStoreFromEnv,
  LocalDiskProductImageStore,
  resolveMaxTotalImageBytesFromEnv,
  SAFE_STORED_IMAGE_FILENAME_RE,
  TieredProductImageStore,
  type ProductImageStore,
  type StoredImageRecord,
} from './v28ProductImageStorage.js';

export { SAFE_STORED_IMAGE_FILENAME_RE } from './v28ProductImageStorage.js';

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB max per image
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_REDIRECTS = 3;

export type AllowedImageExt = 'jpg' | 'png' | 'webp';

export interface IngestedImageResult {
  ok: boolean;
  storedUrl?: string;
  filename?: string;
  mimeType?: string;
  bytes?: number;
  deduplicated?: boolean;
  sourceUrl: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ImageFetchDeps {
  fetchFn?: typeof fetch;
  validateUrl?: typeof validateExternalUrlSafetyWithIp;
}

/**
 * Verifies real binary magic bytes for JPG, PNG, and WebP (rejects HTML/SVG/scripts disguised as images).
 */
export function detectImageFormatFromBytes(buf: Buffer): { ext: AllowedImageExt; mime: string } | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * SSRF-safe, content-addressed product image ingestion & persistent storage service (Phase 2 + Phase 5).
 * - Decoupled from local disk via `ProductImageStore` (PostgreSQL write-through + local disk read-through cache when DATABASE_URL is configured).
 * - Never acts as an open public proxy for arbitrary URLs (only Admin-authenticated ingestion writes files).
 * - Validates SSRF/private IPs on every redirect hop, enforces 10s timeout, 5MB limit, and real JPG/PNG/WebP magic bytes.
 * - Stores content-addressed files (`<sha256-16>.<ext>`) so existing product images are never overwritten.
 */
export class V28ProductImageService {
  private readonly store: ProductImageStore;
  private readonly localDiskStore: LocalDiskProductImageStore | null;

  constructor(storageOrDir: string | ProductImageStore) {
    if (typeof storageOrDir === 'string') {
      const local = new LocalDiskProductImageStore(storageOrDir, resolveMaxTotalImageBytesFromEnv());
      this.store = local;
      this.localDiskStore = local;
    } else {
      this.store = storageOrDir;
      this.localDiskStore =
        storageOrDir instanceof LocalDiskProductImageStore
          ? storageOrDir
          : storageOrDir instanceof TieredProductImageStore
            ? storageOrDir.getLocalCache()
            : null;
    }
  }

  public static fromEnv(): V28ProductImageService {
    return new V28ProductImageService(createProductImageStoreFromEnv());
  }

  public getStore(): ProductImageStore {
    return this.store;
  }

  public getStorageMode(): ProductImageStore['mode'] {
    return this.store.mode;
  }

  public getStorageDir(): string | null {
    return this.localDiskStore ? this.localDiskStore.getStorageDir() : null;
  }

  public async init(): Promise<void> {
    await this.store.init();
  }

  public async close(): Promise<void> {
    await this.store.close();
  }

  /**
   * Synchronous local-disk lookup (backward-compatible with legacy callers & Phase 2 tests).
   */
  public resolveStoredFile(filename: string): { filePath: string; mimeType: string } | null {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    return this.localDiskStore ? this.localDiskStore.resolveFilePathSync(filename) : null;
  }

  /**
   * Persistent async lookup with automatic read-through self-healing from durable storage (PostgreSQL) on cache miss.
   */
  public async getStoredImage(filename: string): Promise<StoredImageRecord | null> {
    if (!SAFE_STORED_IMAGE_FILENAME_RE.test(filename)) return null;
    return this.store.get(filename);
  }

  public async ingestImageUrl(
    rawUrl: string,
    deps?: ImageFetchDeps
  ): Promise<IngestedImageResult> {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return { ok: false, sourceUrl: trimmed, errorCode: 'INVALID_URL', errorMessage: 'Thiếu URL hình ảnh.' };
    }
    // Already ingested locally -> pass through without refetching
    if (trimmed.startsWith('/api/v28/product-images/')) {
      return { ok: true, storedUrl: trimmed, sourceUrl: trimmed, deduplicated: true };
    }

    const validateUrl = deps?.validateUrl ?? validateExternalUrlSafetyWithIp;
    const fetchFn = deps?.fetchFn ?? fetch;

    let currentUrl = trimmed;
    for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
      let validatedUrl: URL;
      try {
        const res = await validateUrl(currentUrl);
        validatedUrl = res.url;
      } catch (err) {
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: 'SSRF_BLOCKED',
          errorMessage: (err as Error).message,
        };
      }

      let response: Response;
      try {
        response = await fetchFn(validatedUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
          headers: {
            'User-Agent': 'VirtualExpo25D-ProductImporter/1.0 (+https://example.com)',
            Accept: 'image/webp,image/png,image/jpeg,*/*;q=0.5',
          },
        });
      } catch (err) {
        const e = err as Error;
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError' || /timeout|aborted/i.test(e?.message || '');
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          errorMessage: e?.message || 'Không thể tải ảnh từ nguồn.',
        };
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_IMAGE_REDIRECTS) {
          return {
            ok: false,
            sourceUrl: trimmed,
            errorCode: 'REDIRECT_ERROR',
            errorMessage: 'Quá số lần chuyển hướng khi tải ảnh.',
          };
        }
        currentUrl = new URL(location, validatedUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: response.status === 403 ? 'HTTP_403' : 'HTTP_ERROR',
          errorMessage: `Ảnh nguồn trả về HTTP ${response.status}.`,
        };
      }

      const contentLength = Number(response.headers.get('content-length') || '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_PRODUCT_IMAGE_BYTES) {
        await response.body?.cancel().catch(() => {});
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: 'SIZE_LIMIT',
          errorMessage: `Ảnh vượt quá giới hạn tối đa ${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB.`,
        };
      }

      if (!response.body) {
        return { ok: false, sourceUrl: trimmed, errorCode: 'EMPTY_BODY', errorMessage: 'Dữ liệu ảnh rỗng.' };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        while (true) {
          const step = await reader.read();
          if (step.done) break;
          if (step.value) {
            totalBytes += step.value.byteLength;
            if (totalBytes > MAX_PRODUCT_IMAGE_BYTES) {
              await reader.cancel().catch(() => {});
              return {
                ok: false,
                sourceUrl: trimmed,
                errorCode: 'SIZE_LIMIT',
                errorMessage: `Ảnh vượt quá giới hạn tối đa ${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB.`,
              };
            }
            chunks.push(step.value);
          }
        }
      } catch (err) {
        if (err instanceof ExternalFetchError) {
          return { ok: false, sourceUrl: trimmed, errorCode: err.code, errorMessage: err.message };
        }
        return { ok: false, sourceUrl: trimmed, errorCode: 'NETWORK_ERROR', errorMessage: (err as Error).message };
      }

      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      const detected = detectImageFormatFromBytes(buf);
      if (!detected) {
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: 'UNSUPPORTED_CONTENT',
          errorMessage: 'Tệp không phải ảnh JPG, PNG hoặc WebP hợp lệ.',
        };
      }

      const fullSha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const filename = `${fullSha256.slice(0, 16)}.${detected.ext}`;

      try {
        const putRes = await this.store.put({
          filename,
          mimeType: detected.mime,
          data: buf,
          bytes: buf.length,
          sha256: fullSha256,
          sourceUrl: trimmed,
        });
        return {
          ok: true,
          storedUrl: `/api/v28/product-images/${filename}`,
          filename,
          mimeType: detected.mime,
          bytes: buf.length,
          deduplicated: putRes.deduplicated,
          sourceUrl: trimmed,
        };
      } catch (err) {
        const msg = (err as Error).message || '';
        if (msg === 'STORAGE_QUOTA_EXCEEDED') {
          return {
            ok: false,
            sourceUrl: trimmed,
            errorCode: 'STORAGE_QUOTA_EXCEEDED',
            errorMessage: 'Kho lưu trữ ảnh sản phẩm đã đạt giới hạn dung lượng.',
          };
        }
        return {
          ok: false,
          sourceUrl: trimmed,
          errorCode: 'STORAGE_ERROR',
          errorMessage: `Lỗi lưu ảnh sản phẩm: ${msg}`,
        };
      }
    }

    return { ok: false, sourceUrl: trimmed, errorCode: 'REDIRECT_ERROR', errorMessage: 'Lỗi chuyển hướng tải ảnh.' };
  }
}
