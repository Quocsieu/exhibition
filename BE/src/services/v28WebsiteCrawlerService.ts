import {
  createCrawlBudget,
  ExternalFetchError,
  extractBreadcrumbCategoryFromHtml,
  extractProductBrandFromHtml,
  extractProductFromHtml,
  extractSellerOrganizationFromHtml,
  fetchExternalProductHtml,
  fetchExternalText,
  MAX_SITEMAP_BYTES,
  type CrawlBudget,
  type DetectedSellerOrganization,
} from '../integrations/productAdapter.js';

export const MIN_TARGET_PRODUCTS = 1;
export const MAX_TARGET_PRODUCTS = 120;
export const DEFAULT_TARGET_PRODUCTS = 15;
export const MAX_CRAWL_PAGES_CAP = 130;
export const MAX_TARGET_CRAWL_BYTES = 24_000_000; // 24 MB safe decompressed total budget
export const MAX_CRAWL_DURATION_MS = 60_000; // 60s hard wall-clock budget

export type CrawlStopReason =
  | 'TARGET_REACHED'
  | 'SOURCE_EXHAUSTED'
  | 'RESOURCE_LIMIT'
  | 'ACCESS_BLOCKED'
  | 'NETWORK_ERROR';

export interface DiscoveredWebsiteProduct {
  name: string;
  brand: string;
  sku: string;
  price: number;
  currency: string;
  description: string;
  images: string[];
  category: string;
  sourceUrl: string;
  inStock: boolean;
  alreadyInCatalog: boolean;
}

export interface WebsiteCrawlCoverageReport {
  targetCount: number;
  shortfall: number;
  stopReason: CrawlStopReason;
  pagesScanned: number;
  maxPagesBudget: number;
  productUrlsDiscovered: number;
  extractedValidCount: number;
  newCount: number;
  duplicateCount: number;
  inCrawlDuplicatesSkipped: number;
  errorCount: number;
  totalBytesRead: number;
  stopReasons: string[];
  coverageStatus: 'TARGET_REACHED' | 'PARTIAL' | 'EMPTY';
  fullCatalogVerified: boolean;
}

export interface WebsiteCrawlDeps {
  fetchHtml?: (
    url: string,
    opts?: { budget?: CrawlBudget }
  ) => Promise<{ html: string; finalUrl: string; bytesRead?: number }>;
  fetchText?: (
    url: string,
    opts?: Parameters<typeof fetchExternalText>[1]
  ) => Promise<{ text: string; finalUrl: string; bytesRead: number; contentType: string }>;
  findDuplicateByUrl?: (url: string) => boolean;
  sanitizePlainText?: (raw: string, maxLen: number) => string;
  maxDurationMs?: number;
}

export interface WebsiteCrawlOptions {
  url: string;
  targetCount?: number;
  maxPages?: number;
  maxTotalBytes?: number;
}

export interface WebsiteCrawlResult {
  siteUrl: string;
  pagesScanned: number;
  totalBytesRead: number;
  detectedSeller: DetectedSellerOrganization;
  discoveredProducts: DiscoveredWebsiteProduct[];
  coverageReport: WebsiteCrawlCoverageReport;
  note: string;
}

const NON_PRODUCT_PATH_RE =
  /\/(login|signin|signup|register|cart|checkout|account|user|search|contact|lien-he|tin-tuc|news|blog|chinh-sach|policy|tuyen-dung|career|huong-dan|guide|faq|about|gioi-thieu|he-thong-cua-hang|tra-cuu|bao-hanh|sitemap)/i;

const TRACKING_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
]);

export function normalizeDiscoveryUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    const qs = u.searchParams.toString();
    const pathClean = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin}${pathClean}${qs ? `?${qs}` : ''}`;
  } catch {
    return rawUrl.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

export function isLikelyProductPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (NON_PRODUCT_PATH_RE.test(p)) return false;
  if (/\/page\/\d+\/?$/i.test(p)) return false;
  if (
    p.includes('/product') ||
    p.includes('/san-pham/') ||
    p.includes('/item/') ||
    p.includes('/shop/') ||
    p.includes('/p/') ||
    p.includes('/sp/')
  ) {
    // Reject bare category roots like `/san-pham/` or `/products/`
    const trimmed = p.replace(/\/+$/, '');
    if (trimmed === '/product' || trimmed === '/products' || trimmed === '/san-pham' || trimmed === '/shop') {
      return false;
    }
    return true;
  }
  if (/^\/[a-z0-9]+-[a-z0-9-]+\.html$/i.test(p)) {
    const slug = p.slice(1, -5);
    if (/\d/.test(slug)) return true;
  }
  return false;
}

export function isLikelyCategoryPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (NON_PRODUCT_PATH_RE.test(p)) return false;
  const trimmed = p.replace(/\/+$/, '');
  return (
    trimmed === '/san-pham' ||
    trimmed === '/products' ||
    trimmed === '/shop' ||
    /^\/[a-z0-9-]+\.html$/i.test(p) ||
    p.includes('/category') ||
    p.includes('/danh-muc') ||
    p.includes('/collections/')
  );
}

export function isLikelyPaginationUrl(urlObj: URL, relAttr = ''): boolean {
  if (/\bnext\b/i.test(relAttr)) return true;
  const p = urlObj.pathname.toLowerCase();
  if (/\/page\/\d+\/?$/i.test(p)) return true;
  const pageParam = urlObj.searchParams.get('page') || urlObj.searchParams.get('p') || urlObj.searchParams.get('paged');
  if (pageParam && /^\d+$/.test(pageParam) && Number(pageParam) >= 2) return true;
  return false;
}

function defaultSanitizePlainText(raw: string, maxLen: number): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function validateTargetCount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_TARGET_PRODUCTS;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < MIN_TARGET_PRODUCTS || num > MAX_TARGET_PRODUCTS) {
    const err = new Error(
      `Số lượng sản phẩm cần lấy (targetCount) phải là số nguyên từ ${MIN_TARGET_PRODUCTS} đến ${MAX_TARGET_PRODUCTS}.`
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return num;
}

/**
 * Target-based, bounded, SSRF-safe website product crawler (Phase 1).
 * - Stops immediately upon reaching `targetCount` valid unique products (`TARGET_REACHED`).
 * - Supports Homepage, Category (+ HTML pagination `?page=N`, `/page/N`, `rel="next"`), Sitemap, and Product Detail.
 * - Strictly distinguishes `TARGET_REACHED`, `SOURCE_EXHAUSTED`, `RESOURCE_LIMIT`, `ACCESS_BLOCKED`, and `NETWORK_ERROR`.
 */
export async function crawlWebsiteForProducts(
  options: WebsiteCrawlOptions,
  deps?: WebsiteCrawlDeps
): Promise<WebsiteCrawlResult> {
  const targetCount = validateTargetCount(options.targetCount);
  const requestedMaxPages =
    options.maxPages !== undefined ? Math.max(1, Math.min(MAX_CRAWL_PAGES_CAP, Number(options.maxPages))) : undefined;
  const maxPages = requestedMaxPages ?? Math.min(MAX_CRAWL_PAGES_CAP, Math.max(15, targetCount + 12));
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TARGET_CRAWL_BYTES;
  const maxDurationMs = deps?.maxDurationMs ?? MAX_CRAWL_DURATION_MS;
  const startedAt = Date.now();

  const fetchHtml = deps?.fetchHtml ?? fetchExternalProductHtml;
  const fetchText = deps?.fetchText ?? fetchExternalText;
  const findDup = deps?.findDuplicateByUrl ?? (() => false);
  const sanitize = deps?.sanitizePlainText ?? defaultSanitizePlainText;

  const budget = createCrawlBudget(maxTotalBytes);
  const stopReasons: string[] = [];
  let pagesScanned = 0;
  let pageErrors = 0;
  let blockedErrors = 0;
  let networkErrors = 0;
  let inCrawlDuplicatesSkipped = 0;
  let hitResourceLimit = false;

  const isOverDeadline = () => Date.now() - startedAt >= maxDurationMs;

  const discovered: DiscoveredWebsiteProduct[] = [];
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  const seenSkus = new Set<string>();

  const pushCandidate = (
    draft: ReturnType<typeof extractProductFromHtml>,
    urlKey: string,
    categoryHint = '',
    brandHint = ''
  ): boolean => {
    if (discovered.length >= targetCount) return false;
    const cleanName = sanitize(draft.name || '', 180);
    if (!cleanName || cleanName.length < 2) return false;
    const normUrl = normalizeDiscoveryUrl(urlKey);
    const normName = cleanName.toLowerCase();
    const cleanSku = sanitize(draft.sku || '', 80);
    const normSku = cleanSku.toLowerCase();

    if (seenUrls.has(normUrl) || seenNames.has(normName) || (normSku && seenSkus.has(normSku))) {
      inCrawlDuplicatesSkipped++;
      return false;
    }

    seenUrls.add(normUrl);
    seenNames.add(normName);
    if (normSku) seenSkus.add(normSku);

    discovered.push({
      name: cleanName,
      brand: sanitize(brandHint, 80),
      sku: cleanSku,
      price: typeof draft.price === 'number' && Number.isFinite(draft.price) && draft.price > 0 ? draft.price : 0,
      currency: draft.currency || 'VND',
      description: sanitize(draft.description || '', 1200),
      images: Array.isArray(draft.images) ? draft.images.slice(0, 4) : [],
      category: sanitize(categoryHint, 80),
      sourceUrl: normUrl,
      inStock: draft.inStock ?? true,
      alreadyInCatalog: Boolean(findDup(normUrl)),
    });
    return true;
  };

  const candidateLinks: string[] = [];
  const categoryLinks: string[] = [];
  const paginationLinks: string[] = [];
  const seenLinks = new Set<string>();

  const collectLinksFromHtml = (html: string, baseUrl: string, origin: string, maxCollect: number) => {
    // Check <link rel="next" href="..."> first
    const linkNextMatches = html.matchAll(/<link[^>]+rel=["'][^"']*next[^"']*["'][^>]+href=["']([^"']+)["']/gi);
    for (const m of linkNextMatches) {
      try {
        const absUrl = new URL(m[1].trim(), baseUrl);
        if (absUrl.origin !== origin) continue;
        const cleaned = normalizeDiscoveryUrl(absUrl.toString());
        if (!seenLinks.has(cleaned) && paginationLinks.length < 15) {
          seenLinks.add(cleaned);
          paginationLinks.push(cleaned);
        }
      } catch {}
    }

    const aTagMatches = html.matchAll(/<a\s+([^>]+)>/gi);
    for (const m of aTagMatches) {
      if (candidateLinks.length >= maxCollect && categoryLinks.length >= 6 && paginationLinks.length >= 15) break;
      const attrs = m[1];
      const hrefMatch = /href=["']([^"']+)["']/i.exec(attrs);
      if (!hrefMatch) continue;
      const relMatch = /rel=["']([^"']+)["']/i.exec(attrs);
      const href = hrefMatch[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        continue;
      }
      try {
        const absUrl = new URL(href, baseUrl);
        if (absUrl.origin !== origin) continue;
        const cleaned = normalizeDiscoveryUrl(absUrl.toString());
        if (seenLinks.has(cleaned)) continue;

        if (isLikelyPaginationUrl(absUrl, relMatch?.[1] || '')) {
          if (paginationLinks.length < 15) {
            seenLinks.add(cleaned);
            paginationLinks.push(cleaned);
          }
        } else if (isLikelyProductPath(absUrl.pathname)) {
          if (candidateLinks.length < maxCollect) {
            seenLinks.add(cleaned);
            candidateLinks.push(cleaned);
          }
        } else if (isLikelyCategoryPath(absUrl.pathname)) {
          if (categoryLinks.length < 6) {
            seenLinks.add(cleaned);
            categoryLinks.push(cleaned);
          }
        }
      } catch {}
    }
  };

  const extractInlineJsonLdProducts = (html: string, pageUrl: string, origin: string) => {
    const pageCat = extractBreadcrumbCategoryFromHtml(html);
    const ldMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of ldMatches) {
      if (discovered.length >= targetCount) break;
      try {
        const parsedLd = JSON.parse(m[1].trim());
        const nodes: Array<Record<string, unknown>> = Array.isArray(parsedLd)
          ? parsedLd
          : Array.isArray(parsedLd?.['@graph'])
            ? parsedLd['@graph']
            : [parsedLd];
        for (const node of nodes) {
          if (discovered.length >= targetCount) break;
          if (!node || typeof node !== 'object') continue;
          if (node['@type'] === 'Product' && typeof node.name === 'string') {
            const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
            const rawPrice = Number((offers as Record<string, unknown> | undefined)?.price ?? (offers as Record<string, unknown> | undefined)?.lowPrice ?? 0);
            const rawImg = Array.isArray(node.image) ? node.image[0] : node.image;
            const rawImgStr = typeof rawImg === 'string' ? rawImg : (rawImg as { url?: string } | undefined)?.url || '';
            let resolvedImg = '';
            if (rawImgStr) {
              try {
                const uImg = new URL(rawImgStr, pageUrl);
                if (uImg.protocol === 'http:' || uImg.protocol === 'https:') resolvedImg = uImg.toString();
              } catch {}
            }
            let itemUrl = pageUrl;
            if (typeof node.url === 'string') {
              try {
                const parsedItem = new URL(node.url, pageUrl);
                if (parsedItem.protocol === 'http:' || parsedItem.protocol === 'https:') itemUrl = parsedItem.toString();
              } catch {}
            }
            const nodeCat = typeof node.category === 'string' ? node.category : pageCat;
            pushCandidate(
              {
                name: node.name,
                sku: typeof node.sku === 'string' ? node.sku : '',
                price: Number.isFinite(rawPrice) ? rawPrice : 0,
                currency:
                  typeof (offers as Record<string, unknown> | undefined)?.priceCurrency === 'string'
                    ? String((offers as Record<string, unknown>).priceCurrency)
                    : 'VND',
                description: typeof node.description === 'string' ? node.description : '',
                images: resolvedImg ? [resolvedImg] : [],
                videoUrl: '',
                sourceUrl: itemUrl,
                inStock: true,
                extractionMethod: 'json-ld',
                warnings: [],
              },
              itemUrl,
              nodeCat
            );
          } else if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
            for (const el of node.itemListElement) {
              const u = typeof el?.url === 'string' ? el.url : typeof el?.item?.url === 'string' ? el.item.url : '';
              if (u) {
                try {
                  const abs = normalizeDiscoveryUrl(new URL(u, pageUrl).toString());
                  if (new URL(abs).origin === origin && !seenLinks.has(abs)) {
                    seenLinks.add(abs);
                    candidateLinks.push(abs);
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}
    }
  };

  const discoverProductLinksFromSitemap = async (origin: string, limit: number): Promise<string[]> => {
    const found: string[] = [];
    const sitemapUrls: string[] = [];
    try {
      const robots = await fetchText(`${origin}/robots.txt`, {
        maxBytes: 200_000,
        budget,
        accept: 'text/plain,*/*;q=0.5',
        allowedContentTypes: ['text/plain', 'text/html'],
        checkCaptcha: false,
        resourceLabel: 'robots.txt',
      });
      for (const line of robots.text.split(/\r?\n/)) {
        const sm = /^sitemap:\s*(https?:\/\/\S+)/i.exec(line.trim());
        if (sm && sm[1]) {
          try {
            const smUrl = new URL(sm[1]);
            if (smUrl.origin === origin) sitemapUrls.push(smUrl.toString());
          } catch {}
        }
      }
    } catch {}
    if (sitemapUrls.length === 0) {
      sitemapUrls.push(`${origin}/sitemap.xml`);
    }

    const inspectXml = async (xmlUrl: string, depth: number) => {
      if (found.length >= limit || depth > 2 || isOverDeadline()) return;
      try {
        const xmlRes = await fetchText(xmlUrl, {
          maxBytes: MAX_SITEMAP_BYTES,
          budget,
          accept: 'application/xml,text/xml,*/*;q=0.5',
          allowedContentTypes: ['xml', 'text/plain'],
          checkCaptcha: false,
          resourceLabel: 'sitemap XML',
        });
        const locs = [...xmlRes.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
        const childSitemaps = locs.filter((u) => /\.xml(\?|$)/i.test(u));
        if (childSitemaps.length > 0) {
          const preferred = childSitemaps.filter((u) => /product|san-pham/i.test(u));
          const toVisit = (preferred.length > 0 ? preferred : childSitemaps).slice(0, 5);
          for (const child of toVisit) {
            if (found.length >= limit) break;
            try {
              if (new URL(child).origin === origin) await inspectXml(child, depth + 1);
            } catch {}
          }
          return;
        }
        for (const loc of locs) {
          if (found.length >= limit) break;
          try {
            const u = new URL(loc);
            if (u.origin !== origin) continue;
            const cleaned = normalizeDiscoveryUrl(u.toString());
            if (seenLinks.has(cleaned)) continue;
            if (isLikelyProductPath(u.pathname)) {
              seenLinks.add(cleaned);
              found.push(cleaned);
            }
          } catch {}
        }
      } catch {}
    };

    await inspectXml(sitemapUrls[0], 0);
    return found;
  };

  // 1. Fetch landing URL
  let rootHtml = '';
  let finalUrl = options.url.trim();
  let rootOversizedFallback = false;

  try {
    const rootRes = await fetchHtml(finalUrl, { budget });
    rootHtml = rootRes.html;
    finalUrl = rootRes.finalUrl;
    pagesScanned = 1;
  } catch (rootErr) {
    if (rootErr instanceof ExternalFetchError && rootErr.code === 'SIZE_LIMIT') {
      rootOversizedFallback = true;
      finalUrl = new URL(finalUrl).toString();
      stopReasons.push('homepage_oversized_sitemap_fallback');
    } else {
      throw rootErr;
    }
  }

  seenLinks.add(normalizeDiscoveryUrl(finalUrl));
  const rootOrigin = new URL(finalUrl).origin;
  let detectedSeller = rootHtml
    ? extractSellerOrganizationFromHtml(rootHtml, finalUrl)
    : extractSellerOrganizationFromHtml('', finalUrl);

  const applySellerDetection = (htmlSample: string, sampleUrl: string) => {
    if (detectedSeller.confidence === 'verified' && detectedSeller.name) return;
    const next = extractSellerOrganizationFromHtml(htmlSample, sampleUrl);
    if (next.name && (next.confidence === 'verified' || !detectedSeller.name)) {
      detectedSeller = next;
    }
  };

  const maxCollectLinks = Math.max(targetCount * 2, 40);

  if (rootHtml) {
    extractInlineJsonLdProducts(rootHtml, finalUrl, rootOrigin);
    if (discovered.length < targetCount) {
      collectLinksFromHtml(rootHtml, finalUrl, rootOrigin, maxCollectLinks);
    }
  }

  // 2. Follow HTML pagination pages (?page=2, /page/2, rel="next") if target not reached yet
  let paginationIdx = 0;
  while (
    discovered.length < targetCount &&
    candidateLinks.length + discovered.length < targetCount + 10 &&
    paginationIdx < paginationLinks.length
  ) {
    if (pagesScanned >= maxPages) {
      hitResourceLimit = true;
      stopReasons.push(`max_pages_limit:${maxPages}`);
      break;
    }
    if (budget.totalBytesRead >= budget.maxTotalBytes) {
      hitResourceLimit = true;
      stopReasons.push(`byte_budget_limit:${budget.maxTotalBytes}`);
      break;
    }
    if (isOverDeadline()) {
      hitResourceLimit = true;
      stopReasons.push(`duration_limit:${maxDurationMs}`);
      break;
    }
    const nextPageUrl = paginationLinks[paginationIdx++];
    try {
      const pageRes = await fetchHtml(nextPageUrl, { budget });
      pagesScanned++;
      extractInlineJsonLdProducts(pageRes.html, pageRes.finalUrl, rootOrigin);
      if (discovered.length < targetCount) {
        collectLinksFromHtml(pageRes.html, pageRes.finalUrl, rootOrigin, maxCollectLinks);
      }
    } catch (err) {
      pageErrors++;
      if (err instanceof ExternalFetchError && (err.code === 'HTTP_403' || err.code === 'HTTP_429' || err.code === 'CAPTCHA_BLOCKED')) {
        blockedErrors++;
      } else {
        networkErrors++;
      }
    }
  }

  // 3. Expand category pages if we still don't have enough candidate URLs to reach targetCount
  if (discovered.length < targetCount && candidateLinks.length + discovered.length < targetCount && categoryLinks.length > 0) {
    for (const catUrl of categoryLinks.slice(0, 6)) {
      if (discovered.length >= targetCount || candidateLinks.length + discovered.length >= targetCount + 10) break;
      if (pagesScanned >= maxPages - 1) {
        hitResourceLimit = true;
        stopReasons.push(`max_pages_limit:${maxPages}`);
        break;
      }
      if (budget.totalBytesRead >= budget.maxTotalBytes || isOverDeadline()) {
        hitResourceLimit = true;
        break;
      }
      try {
        const catRes = await fetchHtml(catUrl, { budget });
        pagesScanned++;
        extractInlineJsonLdProducts(catRes.html, catRes.finalUrl, rootOrigin);
        if (discovered.length < targetCount) {
          collectLinksFromHtml(catRes.html, catRes.finalUrl, rootOrigin, maxCollectLinks);
        }
      } catch {
        pageErrors++;
      }
    }
  }

  // 4. Sitemap fallback if still short of targetCount
  if (discovered.length < targetCount && candidateLinks.length + discovered.length < targetCount && !hitResourceLimit) {
    const needed = Math.max(targetCount * 2 - candidateLinks.length, targetCount);
    const sitemapProducts = await discoverProductLinksFromSitemap(rootOrigin, needed);
    for (const smLink of sitemapProducts) {
      if (candidateLinks.length >= maxCollectLinks) break;
      candidateLinks.push(smLink);
    }
  }

  // 5. Fetch candidate product detail pages until targetCount is reached or budget/links exhausted
  let processedCandidates = 0;
  for (const link of candidateLinks) {
    if (discovered.length >= targetCount) break;
    if (pagesScanned >= maxPages) {
      hitResourceLimit = true;
      stopReasons.push(`max_pages_limit:${maxPages}`);
      break;
    }
    if (budget.totalBytesRead >= budget.maxTotalBytes) {
      hitResourceLimit = true;
      stopReasons.push(`byte_budget_limit:${budget.maxTotalBytes}`);
      break;
    }
    if (isOverDeadline()) {
      hitResourceLimit = true;
      stopReasons.push(`duration_limit:${maxDurationMs}`);
      break;
    }
    processedCandidates++;
    try {
      const sub = await fetchHtml(link, { budget });
      pagesScanned++;
      applySellerDetection(sub.html, sub.finalUrl);
      const subDraft = extractProductFromHtml(sub.html, sub.finalUrl);
      const subCat = extractBreadcrumbCategoryFromHtml(sub.html);
      const subBrand = extractProductBrandFromHtml(sub.html);
      const subPath = new URL(sub.finalUrl).pathname.replace(/\/+$/, '');
      const isRootLanding = !subPath || subPath === '/';
      if (
        subDraft.extractionMethod === 'json-ld' ||
        subDraft.price > 0 ||
        (!isRootLanding && subDraft.extractionMethod === 'opengraph' && subDraft.images.length > 0)
      ) {
        pushCandidate(subDraft, sub.finalUrl, subCat, subBrand);
      }
    } catch (err) {
      pageErrors++;
      if (err instanceof ExternalFetchError && (err.code === 'HTTP_403' || err.code === 'HTTP_429' || err.code === 'CAPTCHA_BLOCKED')) {
        blockedErrors++;
      } else {
        networkErrors++;
      }
    }
  }

  // 6. Fallback: landing page itself is a single product page
  if (discovered.length === 0 && rootHtml) {
    const rootDraft = extractProductFromHtml(rootHtml, finalUrl);
    const rootCat = extractBreadcrumbCategoryFromHtml(rootHtml);
    const rootBrand = extractProductBrandFromHtml(rootHtml);
    if (
      rootDraft.name &&
      rootDraft.name.trim().length >= 2 &&
      (rootDraft.extractionMethod === 'json-ld' || rootDraft.price > 0 || (rootDraft.extractionMethod === 'opengraph' && rootDraft.images.length > 0))
    ) {
      pushCandidate(rootDraft, finalUrl, rootCat, rootBrand);
    }
  }

  if (discovered.length === 0 && rootOversizedFallback) {
    throw new ExternalFetchError(
      'Trang chủ vượt quá giới hạn dung lượng an toàn (3.5 MB) và không tìm thấy sản phẩm công khai trong sitemap.',
      'SIZE_LIMIT'
    );
  }

  // Classify exact semantic stopReason (never blame source exhaustion when stopped by resource limit!)
  let stopReason: CrawlStopReason;
  if (discovered.length >= targetCount) {
    stopReason = 'TARGET_REACHED';
  } else if (hitResourceLimit || processedCandidates < candidateLinks.length) {
    stopReason = 'RESOURCE_LIMIT';
  } else if (blockedErrors > 0 && discovered.length === 0) {
    stopReason = 'ACCESS_BLOCKED';
  } else if (networkErrors > 0 && discovered.length === 0 && pageErrors === candidateLinks.length && candidateLinks.length > 0) {
    stopReason = 'NETWORK_ERROR';
  } else {
    stopReason = 'SOURCE_EXHAUSTED';
  }

  const shortfall = Math.max(0, targetCount - discovered.length);
  const duplicateCount = discovered.filter((d) => d.alreadyInCatalog).length;
  const newCount = discovered.length - duplicateCount;
  const uniqueStopReasons = Array.from(new Set([...stopReasons, stopReason]));
  const coverageStatus: WebsiteCrawlCoverageReport['coverageStatus'] =
    discovered.length >= targetCount ? 'TARGET_REACHED' : discovered.length > 0 ? 'PARTIAL' : 'EMPTY';

  const reasonLabelMap: Record<CrawlStopReason, string> = {
    TARGET_REACHED: `Đã đạt đủ mục tiêu ${discovered.length}/${targetCount} SP`,
    SOURCE_EXHAUSTED: `Website chỉ có ${discovered.length}/${targetCount} SP hợp lệ (thiếu ${shortfall} SP)`,
    RESOURCE_LIMIT: `Dừng tại ${discovered.length}/${targetCount} SP do chạm giới hạn tài nguyên crawl an toàn`,
    ACCESS_BLOCKED: `Bị website nguồn chặn truy cập (403/429/CAPTCHA)`,
    NETWORK_ERROR: `Lỗi kết nối mạng / timeout khi quét website`,
  };

  return {
    siteUrl: finalUrl,
    pagesScanned,
    totalBytesRead: budget.totalBytesRead,
    detectedSeller,
    discoveredProducts: discovered,
    coverageReport: {
      targetCount,
      shortfall,
      stopReason,
      pagesScanned,
      maxPagesBudget: maxPages,
      productUrlsDiscovered: candidateLinks.length,
      extractedValidCount: discovered.length,
      newCount,
      duplicateCount,
      inCrawlDuplicatesSkipped,
      errorCount: pageErrors,
      totalBytesRead: budget.totalBytesRead,
      stopReasons: uniqueStopReasons,
      coverageStatus,
      fullCatalogVerified: false,
    },
    note: `${reasonLabelMap[stopReason]} · Quét ${pagesScanned}/${maxPages} trang · Trùng bỏ qua: ${inCrawlDuplicatesSkipped} · ${(budget.totalBytesRead / (1024 * 1024)).toFixed(2)} MB.`,
  };
}
