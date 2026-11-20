import { describe, it, expect, vi, afterEach } from 'vitest';
import dns from 'node:dns/promises';
import {
  isPrivateOrReservedIp,
  validateExternalUrlSafety,
  fetchExternalProductHtml,
  extractProductFromHtml,
  extractBreadcrumbCategoryFromHtml,
  createCrawlBudget,
  ExternalFetchError,
  MAX_HTML_BYTES,
  MAX_TOTAL_CRAWL_BYTES,
} from '../integrations/productAdapter.js';
import { sanitizePlainText } from '../routes/v28Routes.js';

function makeStreamResponse(
  body: string | Uint8Array[],
  init?: { status?: number; headers?: Record<string, string> }
): Response {
  const chunks =
    typeof body === 'string' ? [new TextEncoder().encode(body)] : body;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(stream, {
    status: init?.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init?.headers || {}) },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('V28 Website Product Import — Security, Streaming Limits & Extraction', () => {
  it('Test 2: extracts Product JSON-LD + BreadcrumbList category from small website HTML', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Sample Phone Store</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Galaxy Ultra X1",
              "sku": "GUX1-256",
              "description": "Flagship smartphone 256GB",
              "image": ["https://cdn.example.com/gux1.jpg"],
              "offers": {
                "@type": "Offer",
                "price": "24990000",
                "priceCurrency": "VND",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "item": { "name": "Trang chủ" } },
                { "@type": "ListItem", "position": 2, "item": { "name": "Điện thoại" } },
                { "@type": "ListItem", "position": 3, "item": { "name": "Galaxy Ultra X1" } }
              ]
            }
          </script>
        </head>
        <body><h1>Galaxy Ultra X1</h1></body>
      </html>
    `;

    const draft = extractProductFromHtml(html, 'https://shop.example.com/galaxy-ultra-x1.html');
    const cat = extractBreadcrumbCategoryFromHtml(html);

    expect(draft.name).toBe('Galaxy Ultra X1');
    expect(draft.sku).toBe('GUX1-256');
    expect(draft.price).toBe(24990000);
    expect(draft.currency).toBe('VND');
    expect(draft.images).toEqual(['https://cdn.example.com/gux1.jpg']);
    expect(draft.extractionMethod).toBe('json-ld');
    expect(cat).toBe('Điện thoại');
  });

  it('Test 3: cancels oversized streamed response (> maxBytes) and enforces total crawl budget without OOM', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);

    // 3a. Streaming chunk overflow (no Content-Length header, chunked transfer)
    const bigChunk = new Uint8Array(200_000).fill(65); // 200 KB per chunk
    let emitted = 0;
    const hugeStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted++;
        controller.enqueue(bigChunk);
        if (emitted > 40) controller.close(); // would be 8 MB if not cancelled!
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(hugeStream, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );

    await expect(
      fetchExternalProductHtml('https://large.example.com/', { maxBytes: 500_000 })
    ).rejects.toMatchObject({
      name: 'ExternalFetchError',
      code: 'SIZE_LIMIT',
    });
    expect(emitted).toBeLessThan(10); // stream was cancelled early!

    // 3b. Declared Content-Length > maxBytes fast-rejected
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse('<html></html>', {
        headers: { 'content-length': String(MAX_HTML_BYTES + 1024) },
      })
    );
    await expect(fetchExternalProductHtml('https://huge-header.example.com/')).rejects.toMatchObject({
      code: 'SIZE_LIMIT',
    });

    // 3c. Total crawl budget limit across multiple pages
    const budget = createCrawlBudget(1_000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeStreamResponse('a'.repeat(1_500))
    );
    await expect(fetchExternalProductHtml('https://budget.example.com/', { budget })).rejects.toMatchObject({
      code: 'TOTAL_BUDGET_LIMIT',
    });
    expect(MAX_HTML_BYTES).toBeGreaterThan(1_000_000);
    expect(MAX_TOTAL_CRAWL_BYTES).toBeGreaterThanOrEqual(MAX_HTML_BYTES);
  });

  it('Test 4: website without structured product data does not fabricate price or JSON-LD', () => {
    const html = `<html><head><title>Corporate About Page</title></head><body><p>Welcome</p></body></html>`;
    const draft = extractProductFromHtml(html, 'https://corp.example.com/');
    expect(draft.extractionMethod).toBe('meta-fallback');
    expect(draft.price).toBe(0);
    expect(draft.images).toEqual([]);
  });

  it('Test 5: blocks localhost, private IPs, internal redirects, DNS rebinding, timeout, 403/429/CAPTCHA & sanitizes XSS HTML', async () => {
    // 5a. Private / loopback / link-local / IPv4-mapped IPv6
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);

    // 5b. Localhost / internal domains
    await expect(validateExternalUrlSafety('http://localhost:4000/admin')).rejects.toThrow(/localhost/i);
    await expect(validateExternalUrlSafety('http://127.0.0.1/secret')).rejects.toThrow(/IP nội bộ/i);
    await expect(validateExternalUrlSafety('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/IP nội bộ/i);
    await expect(validateExternalUrlSafety('http://service.internal/api')).rejects.toThrow(/localhost/i);

    // 5c. DNS rebinding to private IP
    vi.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '10.10.0.2', family: 4 }] as any);
    await expect(validateExternalUrlSafety('https://rebind.evil.test/')).rejects.toThrow(/IP nội bộ/i);

    // 5d. Internal redirect hop blocked!
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:4000/internal' } })
    );
    await expect(fetchExternalProductHtml('https://public.example.com/redir')).rejects.toThrow(/IP nội bộ/i);

    // 5e. Timeout error classification
    const timeoutErr = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(timeoutErr);
    await expect(fetchExternalProductHtml('https://slow.example.com/')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });

    // 5f. HTTP 403 / 429 / CAPTCHA classification (never bypassed)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    await expect(fetchExternalProductHtml('https://blocked.example.com/')).rejects.toMatchObject({
      code: 'HTTP_403',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));
    await expect(fetchExternalProductHtml('https://rate.example.com/')).rejects.toMatchObject({
      code: 'HTTP_429',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeStreamResponse('<html><head><title>Just a moment...</title></head><body>cf-browser-verification Verify you are human</body></html>')
    );
    await expect(fetchExternalProductHtml('https://captcha.example.com/')).rejects.toMatchObject({
      code: 'CAPTCHA_BLOCKED',
    });

    // 5g. Malicious HTML sanitization (XSS stripped)
    const dirty = '<script>alert("xss")</script><b>Phone</b> <a href="javascript:alert(1)">Buy</a>';
    const cleaned = sanitizePlainText(dirty);
    expect(cleaned).not.toContain('<script>');
    expect(cleaned).not.toContain('alert(');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).toContain('Phone');
  });
});
