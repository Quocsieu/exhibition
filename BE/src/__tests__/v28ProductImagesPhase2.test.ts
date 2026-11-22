import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectImageFormatFromBytes,
  MAX_PRODUCT_IMAGE_BYTES,
  V28ProductImageService,
} from '../services/v28ProductImageService.js';
import { extractProductFromHtml } from '../integrations/productAdapter.js';

const FAKE_JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x11)]);
const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0x22)]);
const FAKE_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(64, 0x33),
]);

function mockBinaryResponse(buf: Buffer, status = 200, headers?: Record<string, string>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
}

describe('Phase 2 — Product Image Reliability (Quality Gate 2)', () => {
  it('extracts relative, lazy-load (data-src), and srcset product images while filtering out logos/banners', () => {
    const html = `<html><head><title>Xoài Sấy Dẻo Đà Lạt</title></head><body>
      <img src="/assets/site-logo.png" alt="Logo" />
      <img src="/assets/home-banner.jpg" class="banner" />
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/uploads/xoai-say-deo.webp" alt="Xoài sấy" />
      <img srcset="/uploads/xoai-small.jpg 320w, /uploads/xoai-large.jpg 1024w" alt="Xoài" />
    </body></html>`;
    const draft = extractProductFromHtml(html, 'https://farm.example.com/san-pham/xoai-say');
    expect(draft.images).toEqual([
      'https://farm.example.com/uploads/xoai-say-deo.webp',
      'https://farm.example.com/uploads/xoai-large.jpg',
    ]);
  });

  it('ingests JPG, PNG, and WebP safely into content-addressed local store and rejects HTML disguised as image', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-img-p2-'));
    try {
      const svc = new V28ProductImageService(tmpDir);
      const allowValidate = async (u: string) => ({ url: new URL(u), pinnedIp: '93.184.216.34', pinnedFamily: 4 });

      const rJpg = await svc.ingestImageUrl('https://cdn.example.com/a.jpg', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(FAKE_JPG, 200),
      });
      expect(rJpg.ok).toBe(true);
      expect(rJpg.storedUrl).toMatch(/^\/api\/v28\/product-images\/[a-f0-9]{16}\.jpg$/);
      expect(svc.resolveStoredFile(rJpg.filename!)).not.toBeNull();

      const rPng = await svc.ingestImageUrl('https://cdn.example.com/b.png', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(FAKE_PNG, 200),
      });
      expect(rPng.ok).toBe(true);
      expect(rPng.mimeType).toBe('image/png');

      const rWebp = await svc.ingestImageUrl('https://cdn.example.com/c.webp', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(FAKE_WEBP, 200),
      });
      expect(rWebp.ok).toBe(true);
      expect(rWebp.mimeType).toBe('image/webp');

      // HTML disguised as .jpg must be rejected
      const rHtml = await svc.ingestImageUrl('https://cdn.example.com/fake.jpg', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(Buffer.from('<html>403 Forbidden</html>'), 200),
      });
      expect(rHtml.ok).toBe(false);
      expect(rHtml.errorCode).toBe('UNSUPPORTED_CONTENT');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks SSRF URLs, oversized images (>5MB), and handles HTTP 403/404 gracefully', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-img-sec-'));
    try {
      const svc = new V28ProductImageService(tmpDir);
      const ssrfRes = await svc.ingestImageUrl('http://127.0.0.1:4000/secret.png');
      expect(ssrfRes.ok).toBe(false);
      expect(ssrfRes.errorCode).toBe('SSRF_BLOCKED');

      const metaRes = await svc.ingestImageUrl('http://169.254.169.254/latest/meta-data/');
      expect(metaRes.ok).toBe(false);
      expect(metaRes.errorCode).toBe('SSRF_BLOCKED');

      const allowValidate = async (u: string) => ({ url: new URL(u), pinnedIp: '93.184.216.34', pinnedFamily: 4 });
      const bigRes = await svc.ingestImageUrl('https://cdn.example.com/huge.jpg', {
        validateUrl: allowValidate,
        fetchFn: async () =>
          mockBinaryResponse(FAKE_JPG, 200, { 'content-length': String(MAX_PRODUCT_IMAGE_BYTES + 1024) }),
      });
      expect(bigRes.ok).toBe(false);
      expect(bigRes.errorCode).toBe('SIZE_LIMIT');

      const forbiddenRes = await svc.ingestImageUrl('https://cdn.example.com/hotlink.jpg', {
        validateUrl: allowValidate,
        fetchFn: async () => mockBinaryResponse(Buffer.from('denied'), 403),
      });
      expect(forbiddenRes.ok).toBe(false);
      expect(forbiddenRes.errorCode).toBe('HTTP_403');
      expect(detectImageFormatFromBytes(Buffer.from('not-an-image'))).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
