import { describe, expect, it } from 'vitest';
import {
  crawlWebsiteForProducts,
  validateTargetCount,
} from '../services/v28WebsiteCrawlerService.js';
import { validateExternalUrlSafety, ExternalFetchError } from '../integrations/productAdapter.js';

function makeProductHtml(id: number, opts?: { name?: string; sku?: string; price?: number; img?: string }) {
  const name = opts?.name ?? `Nông Sản Đặc Sản #${id}`;
  const sku = opts?.sku ?? `AGRI-${String(id).padStart(3, '0')}`;
  const price = opts?.price ?? 100_000 + id * 1000;
  const img = opts?.img ?? `/images/sp-${id}.jpg`;
  return `<html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'HTX Nông Sản Việt',
    })}</script>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      sku,
      description: `Mô tả sản phẩm #${id}`,
      image: img,
      offers: { '@type': 'Offer', price: String(price), priceCurrency: 'VND', availability: 'https://schema.org/InStock' },
    })}</script>
  </head><body><h1>${name}</h1></body></html>`;
}

function createMockSite(routes: Record<string, string>) {
  const fetchedUrls: string[] = [];
  const fetchHtml = async (url: string, opts?: { budget?: { totalBytesRead: number; maxTotalBytes: number } }) => {
    fetchedUrls.push(url);
    const html = routes[url];
    if (!html) {
      throw new ExternalFetchError(`HTTP 404 for ${url}`, 'HTTP_ERROR', { statusCode: 404 });
    }
    const bytes = Buffer.byteLength(html, 'utf8');
    if (opts?.budget) {
      if (opts.budget.totalBytesRead + bytes > opts.budget.maxTotalBytes) {
        throw new ExternalFetchError('Budget exceeded', 'TOTAL_BUDGET_LIMIT', { bytesRead: bytes });
      }
      opts.budget.totalBytesRead += bytes;
    }
    return { html, finalUrl: url, bytesRead: bytes };
  };
  const fetchText = async (url: string) => {
    const text = routes[url];
    if (!text) throw new ExternalFetchError(`404 ${url}`, 'HTTP_ERROR', { statusCode: 404 });
    return { text, finalUrl: url, bytesRead: Buffer.byteLength(text, 'utf8'), contentType: 'application/xml' };
  };
  return { fetchHtml, fetchText, fetchedUrls };
}

describe('Phase 1 — Target-Based Website Crawler (Quality Gate 1)', () => {
  it('validates targetCount positive integer bounds [1..120]', () => {
    expect(validateTargetCount(undefined)).toBe(15);
    expect(validateTargetCount(6)).toBe(6);
    expect(validateTargetCount(60)).toBe(60);
    expect(validateTargetCount(120)).toBe(120);
    expect(() => validateTargetCount(0)).toThrow();
    expect(() => validateTargetCount(-5)).toThrow();
    expect(() => validateTargetCount(121)).toThrow();
    expect(() => validateTargetCount(3.5)).toThrow();
  });

  it('Homepage -> target 6 -> stops immediately at 6/6 (TARGET_REACHED)', async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/san-pham/sp-${i + 1}">SP ${i + 1}</a>`).join('\n');
    const routes: Record<string, string> = { 'https://agri.example.com/': `<html><body>${links}</body></html>` };
    for (let i = 1; i <= 20; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 6 }, mock);
    expect(res.discoveredProducts).toHaveLength(6);
    expect(res.coverageReport.stopReason).toBe('TARGET_REACHED');
    expect(res.coverageReport.shortfall).toBe(0);
    // Must stop right after landing + 6 product pages = 7 pages (NOT scanning all 20!)
    expect(mock.fetchedUrls.length).toBe(7);
  });

  it('Homepage -> target 60 -> reaches 60/60 (TARGET_REACHED)', async () => {
    const links = Array.from({ length: 80 }, (_, i) => `<a href="/san-pham/sp-${i + 1}">SP ${i + 1}</a>`).join('\n');
    const routes: Record<string, string> = { 'https://agri.example.com/': `<html><body>${links}</body></html>` };
    for (let i = 1; i <= 80; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 60 }, mock);
    expect(res.discoveredProducts).toHaveLength(60);
    expect(res.coverageReport.stopReason).toBe('TARGET_REACHED');
    expect(mock.fetchedUrls.length).toBe(61);
  });

  it('Category pagination (?page=2..4) -> reaches 60/60 (TARGET_REACHED)', async () => {
    const routes: Record<string, string> = {};
    for (let p = 1; p <= 4; p++) {
      const start = (p - 1) * 20 + 1;
      const items = Array.from({ length: 20 }, (_, i) => `<a href="/san-pham/sp-${start + i}">SP ${start + i}</a>`).join('\n');
      const nextLink = p < 4 ? `<a rel="next" href="/san-pham/?page=${p + 1}">Trang sau</a>` : '';
      const url = p === 1 ? 'https://agri.example.com/san-pham/' : `https://agri.example.com/san-pham?page=${p}`;
      routes[url] = `<html><body>${items}${nextLink}</body></html>`;
    }
    for (let i = 1; i <= 80; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/san-pham/', targetCount: 60 }, mock);
    expect(res.discoveredProducts).toHaveLength(60);
    expect(res.coverageReport.stopReason).toBe('TARGET_REACHED');
  });

  it('Product Detail -> 1/1 (TARGET_REACHED)', async () => {
    const routes: Record<string, string> = {
      'https://agri.example.com/san-pham/gao-st25': makeProductHtml(1, { name: 'Gạo ST25 5kg', sku: 'ST25-5KG', price: 185000 }),
    };
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/san-pham/gao-st25', targetCount: 1 }, mock);
    expect(res.discoveredProducts).toHaveLength(1);
    expect(res.discoveredProducts[0].name).toBe('Gạo ST25 5kg');
    expect(res.coverageReport.stopReason).toBe('TARGET_REACHED');
  });

  it('Website with 35 products & target 60 -> returns 35/60 PARTIAL (SOURCE_EXHAUSTED, shortfall=25)', async () => {
    const links = Array.from({ length: 35 }, (_, i) => `<a href="/san-pham/sp-${i + 1}">SP ${i + 1}</a>`).join('\n');
    const routes: Record<string, string> = { 'https://agri.example.com/': `<html><body>${links}</body></html>` };
    for (let i = 1; i <= 35; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 60 }, mock);
    expect(res.discoveredProducts).toHaveLength(35);
    expect(res.coverageReport.shortfall).toBe(25);
    expect(res.coverageReport.stopReason).toBe('SOURCE_EXHAUSTED');
    expect(res.coverageReport.coverageStatus).toBe('PARTIAL');
  });

  it('60 products with 10 duplicates -> counts only 50 unique products', async () => {
    const links = Array.from({ length: 60 }, (_, i) => `<a href="/san-pham/sp-${i + 1}">SP ${i + 1}</a>`).join('\n');
    const routes: Record<string, string> = { 'https://agri.example.com/': `<html><body>${links}</body></html>` };
    for (let i = 1; i <= 50; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    // 10 duplicate products (same name & SKU as 1..10 at different URLs)
    for (let i = 51; i <= 60; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i - 50);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 60 }, mock);
    expect(res.discoveredProducts).toHaveLength(50);
    expect(res.coverageReport.inCrawlDuplicatesSkipped).toBe(10);
    expect(res.coverageReport.stopReason).toBe('SOURCE_EXHAUSTED');
  });

  it('0 products -> returns 0/6 (EMPTY, SOURCE_EXHAUSTED)', async () => {
    const routes: Record<string, string> = { 'https://agri.example.com/': '<html><body><h1>Trang tin tức</h1></body></html>' };
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 6 }, mock);
    expect(res.discoveredProducts).toHaveLength(0);
    expect(res.coverageReport.coverageStatus).toBe('EMPTY');
    expect(res.coverageReport.stopReason).toBe('SOURCE_EXHAUSTED');
  });

  it('Distinguishes RESOURCE_LIMIT from SOURCE_EXHAUSTED when maxPages budget is reached', async () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/san-pham/sp-${i + 1}">SP ${i + 1}</a>`).join('\n');
    const routes: Record<string, string> = { 'https://agri.example.com/': `<html><body>${links}</body></html>` };
    for (let i = 1; i <= 30; i++) {
      routes[`https://agri.example.com/san-pham/sp-${i}`] = makeProductHtml(i);
    }
    const mock = createMockSite(routes);
    const res = await crawlWebsiteForProducts({ url: 'https://agri.example.com/', targetCount: 30, maxPages: 10 }, mock);
    expect(res.discoveredProducts).toHaveLength(9);
    expect(res.coverageReport.stopReason).toBe('RESOURCE_LIMIT');
    expect(res.coverageReport.stopReason).not.toBe('SOURCE_EXHAUSTED');
  });

  it('Preserves 8/8 SSRF & malicious URL protections', async () => {
    const bad = [
      'http://localhost/admin',
      'http://127.0.0.1:4000/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:7f00:1]/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://user:pass@example.com/',
    ];
    for (const u of bad) {
      await expect(validateExternalUrlSafety(u)).rejects.toThrow();
    }
  });
});
