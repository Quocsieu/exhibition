import crypto from 'node:crypto';
import fs from 'node:fs';
import express, { Router, type Request, type Response } from 'express';
import {
  requireAdminAuth,
  isRequestAuthenticatedAdmin,
  getDemoAccountCredentials,
} from '../middleware/adminAuth.js';
import type { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExcelImportService, MAX_EXCEL_FILE_BYTES } from '../services/v28ExcelImportService.js';
import {
  CreateCompanyInputSchema,
  UpdateCompanyInputSchema,
  CreateV28ProductInputSchema,
  UpdateV28ProductInputSchema,
  ExcelDuplicateStrategySchema,
  V28UrlImportInputSchema,
  CreateExhibitionInputSchema,
  CreateDraftLayoutInputSchema,
  UpdateZoneInputSchema,
  UpdateDraftBoothPlacementInputSchema,
  RollbackVersionInputSchema,
} from '../schemas/v28Schemas.js';
import { V28ExhibitionService, type ExhibitionVersionDetail } from '../services/v28/exhibitionService.js';
import { V28CategoryService } from '../services/v28/categoryService.js';
import { V28AudioCacheService } from '../services/v28/audioCacheService.js';
import { V28AiConsultantService } from '../services/v28/aiConsultantService.js';
import {
  fetchExternalProductHtml,
  fetchExternalText,
  extractProductFromHtml,
  extractBreadcrumbCategoryFromHtml,
  extractSellerOrganizationFromHtml,
  extractProductBrandFromHtml,
  createCrawlBudget,
  ExternalFetchError,
  MAX_SITEMAP_BYTES,
  MAX_TOTAL_CRAWL_BYTES,
} from '../integrations/productAdapter.js';
import { z } from 'zod';

export function sanitizePlainText(raw: string, maxLen = 2000): string {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

const URL_IMPORT_RATE_WINDOW_MS = 60_000;
const URL_IMPORT_MAX_PER_WINDOW = 15;
const urlImportHistory = new Map<string, number[]>();

function checkUrlImportRateLimit(actorKey: string): boolean {
  const now = Date.now();
  const recent = (urlImportHistory.get(actorKey) || []).filter((ts) => now - ts < URL_IMPORT_RATE_WINDOW_MS);
  if (recent.length >= URL_IMPORT_MAX_PER_WINDOW) {
    urlImportHistory.set(actorKey, recent);
    return false;
  }
  recent.push(now);
  urlImportHistory.set(actorKey, recent);
  return true;
}

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

const ExcelPreviewBodySchema = z.object({
  companyId: z.string().trim().min(1, 'Bắt buộc chọn doanh nghiệp'),
  filename: z.string().trim().min(1).max(200).default('import.xlsx'),
  fileBase64: z.string().min(1, 'Thiếu dữ liệu tệp Excel'),
});

const ExcelCommitBodySchema = z.object({
  previewToken: z.string().min(10, 'Thiếu previewToken'),
  duplicateStrategy: ExcelDuplicateStrategySchema.default('skip'),
});

const AssignBoothSlotBodySchema = z.object({
  productId: z.string().trim().min(1, 'Thiếu productId'),
});

function getHttpStatus(err: unknown, fallback = 400): number {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return typeof code === 'number' && code >= 400 && code < 600 ? code : fallback;
}

export function createV28ApiRoutes(
  v28Db: V28CatalogDatabase,
  excelService = new V28ExcelImportService(v28Db),
  exhibitionService = new V28ExhibitionService(v28Db),
  onLayoutPublished?: (version: ExhibitionVersionDetail) => void,
  audioCacheService = new V28AudioCacheService(v28Db),
  aiConsultantService = new V28AiConsultantService(v28Db, exhibitionService)
): Router {
  const categoryService = new V28CategoryService(v28Db);
  const router = Router();
  // Phase 5 Hardening: Strict 512kb default for V28 routes; 8mb ONLY on /imports/excel/preview
  const excelUploadJsonParser = express.json({ limit: '8mb' });
  const defaultV28JsonParser = express.json({ limit: '512kb' });
  router.use((req, res, next) => {
    if (req.path === '/imports/excel/preview') {
      next();
      return;
    }
    defaultV28JsonParser(req, res, next);
  });

  // Phase 2 Hardening: Single-entry in-memory cache + ETag for public Published Active World ONLY
  // Note: Single-instance in-memory cache; multi-instance deployments require shared Redis/pub-sub invalidation.
  let publishedWorldCache: {
    versionId: string;
    jsonBody: string;
    etag: string;
    builtAt: number;
  } | null = null;
  const invalidatePublishedWorldCache = () => {
    publishedWorldCache = null;
  };

  // Health & Isolation Status
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: 'v28-phase1',
      migration: v28Db.lastMigrationReport,
    });
  });

  // ============================================================================
  // A. COMPANY MANAGEMENT
  // ============================================================================
  router.get('/companies', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const status = rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : 'all';
    const companies = v28Db.listCompanies({ q, status });
    res.json({ companies });
  });

  router.get('/companies/:id', (req: Request, res: Response) => {
    const company = v28Db.getCompanyById(getParam(req.params.id));
    if (!company) {
      res.status(404).json({ error: 'Không tìm thấy doanh nghiệp.' });
      return;
    }
    res.json({ company });
  });

  router.post('/companies', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = CreateCompanyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu doanh nghiệp không hợp lệ.' });
      return;
    }
    try {
      const company = v28Db.createCompany(parsed.data);
      res.status(201).json({ company });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.patch('/companies/:id', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = UpdateCompanyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ.' });
      return;
    }
    try {
      const company = v28Db.updateCompany(getParam(req.params.id), parsed.data);
      if (!company) {
        res.status(404).json({ error: 'Không tìm thấy doanh nghiệp.' });
        return;
      }
      invalidatePublishedWorldCache();
      res.json({ company });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // B. INDEPENDENT PRODUCT CATALOG
  // ============================================================================
  router.get('/products', (req: Request, res: Response) => {
    const companyId = typeof req.query.companyId === 'string' && req.query.companyId ? req.query.companyId : undefined;
    const boothId = typeof req.query.boothId === 'string' && req.query.boothId ? req.query.boothId : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const status = rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : 'all';
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    const result = v28Db.listProducts({ companyId, boothId, q, status, page, limit });
    res.json(result);
  });

  router.get('/products/:id', (req: Request, res: Response) => {
    const product = v28Db.getProductById(getParam(req.params.id));
    if (!product) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      return;
    }
    res.json({ product });
  });

  router.post('/products', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = CreateV28ProductInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu sản phẩm không hợp lệ.' });
      return;
    }
    try {
      const product = v28Db.createProduct(parsed.data);
      res.status(201).json({ product });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.patch('/products/:id', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = UpdateV28ProductInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật sản phẩm không hợp lệ.' });
      return;
    }
    try {
      const product = v28Db.updateProduct(getParam(req.params.id), parsed.data);
      if (!product) {
        res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
        return;
      }
      invalidatePublishedWorldCache();
      // Trigger non-blocking incremental audio cache refresh for active booths displaying this product
      try {
        const activeWorld = exhibitionService.getActiveExhibitionWorld();
        const affectedBooths = activeWorld.booths.filter((b) =>
          b.slots.some((s) => s.product?.id === product.id)
        );
        for (const b of affectedBooths) {
          void audioCacheService.getOrPrepareBoothAudioPack(b).catch(() => {});
        }
      } catch {
        // ignore if no active exhibition yet
      }
      res.json({ product });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // B2. V28 BOOTHS & OWNERSHIP-GUARDED DISPLAY SLOTS
  // ============================================================================
  router.get('/booths', (req: Request, res: Response) => {
    const companyId = typeof req.query.companyId === 'string' && req.query.companyId ? req.query.companyId : undefined;
    const includeArchived = req.query.includeArchived === 'true';
    res.json({
      booths: v28Db.listBooths({ companyId, includeArchived }),
      slots: v28Db.listBoothSlotAssignments(),
    });
  });

  router.patch('/booths/:id/archive', requireAdminAuth, (req: Request, res: Response) => {
    const booth = v28Db.archiveBooth(getParam(req.params.id));
    if (!booth) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng.' });
      return;
    }
    res.json({ booth });
  });

  router.put('/booths/:id/slots/:slotId', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = AssignBoothSlotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thiếu productId.' });
      return;
    }
    try {
      const assignment = v28Db.assignBoothSlot(
        getParam(req.params.id),
        getParam(req.params.slotId),
        parsed.data.productId
      );
      invalidatePublishedWorldCache();
      try {
        const activeWorld = exhibitionService.getActiveExhibitionWorld();
        onLayoutPublished?.(activeWorld);
        const booth = activeWorld.booths.find((b) => b.boothId === getParam(req.params.id));
        if (booth) {
          void audioCacheService.getOrPrepareBoothAudioPack(booth).catch(() => {});
        }
      } catch {
        // ignore if no active exhibition yet
      }
      res.json({ assignment });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.delete('/booths/:id/slots/:slotId', requireAdminAuth, (req: Request, res: Response) => {
    v28Db.clearBoothSlot(getParam(req.params.id), getParam(req.params.slotId));
    invalidatePublishedWorldCache();
    try {
      onLayoutPublished?.(exhibitionService.getActiveExhibitionWorld());
    } catch {
      // ignore if no active exhibition yet
    }
    res.json({ cleared: true });
  });

  // ============================================================================
  // C. EXCEL IMPORT PIPELINE (PREVIEW -> COMMIT -> REPORT / CSV)
  // ============================================================================
  router.post(
    '/imports/excel/preview',
    requireAdminAuth,
    excelUploadJsonParser,
    async (req: Request, res: Response) => {
    const parsed = ExcelPreviewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thiếu dữ liệu upload Excel.' });
      return;
    }

    const base64Clean = parsed.data.fileBase64.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(base64Clean, 'base64');
    if (fileBuffer.length > MAX_EXCEL_FILE_BYTES) {
      res.status(413).json({ error: 'Dung lượng tệp vượt quá giới hạn tối đa 5 MB.' });
      return;
    }

    const adminUsername = (res.locals.adminUsername as string | undefined) || 'admin';
    try {
      const preview = await excelService.createPreview({
        companyId: parsed.data.companyId,
        adminUsername,
        filename: parsed.data.filename,
        fileBuffer,
      });
      res.json(preview);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/imports/excel/commit', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = ExcelCommitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thiếu previewToken hoặc chiến lược trùng.' });
      return;
    }
    const adminUsername = (res.locals.adminUsername as string | undefined) || 'admin';
    try {
      const report = excelService.commitPreview({
        previewToken: parsed.data.previewToken,
        adminUsername,
        duplicateStrategy: parsed.data.duplicateStrategy,
      });
      res.json({ report });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/imports/:jobId/report', requireAdminAuth, (req: Request, res: Response) => {
    const report = v28Db.getImportJobReport(getParam(req.params.jobId));
    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo import.' });
      return;
    }
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="import-errors-${report.jobId}.csv"`);
      res.send(excelService.formatErrorsCsv(report));
      return;
    }
    res.json({ report });
  });

  // ============================================================================
  // D. URL PRODUCT IMPORT COMPATIBILITY (REUSES SSRF-SAFE productAdapter.ts + RATE LIMIT + XSS GUARD)
  // ============================================================================
  router.post('/imports/url', requireAdminAuth, async (req: Request, res: Response) => {
    const actorKey = `${(res.locals.adminUsername as string | undefined) || 'admin'}:${req.ip || 'local'}`;
    if (!checkUrlImportRateLimit(actorKey)) {
      res.status(429).json({
        error: `Vượt quá giới hạn trích xuất URL (${URL_IMPORT_MAX_PER_WINDOW} lượt/phút). Vui lòng thử lại sau.`,
      });
      return;
    }

    const parsed = V28UrlImportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu import URL không hợp lệ.' });
      return;
    }

    const company = v28Db.getCompanyById(parsed.data.companyId);
    if (!company || company.status !== 'active') {
      res.status(404).json({ error: 'Doanh nghiệp không tồn tại hoặc đang bị vô hiệu hóa.' });
      return;
    }

    // Booth ownership verification when boothId is provided
    if (parsed.data.boothId) {
      const targetBooth = v28Db.listBooths({ includeArchived: true }).find((b) => b.id === parsed.data.boothId);
      if (!targetBooth) {
        res.status(404).json({ error: 'Gian hàng đích không tồn tại.' });
        return;
      }
      if (targetBooth.companyId && targetBooth.companyId !== company.id) {
        res.status(403).json({
          error: `Gian hàng "${targetBooth.name}" không thuộc quyền quản lý của doanh nghiệp "${company.name}".`,
        });
        return;
      }
    }

    try {
      // Duplicate URL import protection per company
      const dup = categoryService.findDuplicateProductBySourceUrl(parsed.data.companyId, parsed.data.url);
      if (dup && parsed.data.saveToCatalog) {
        res.status(409).json({
          error: `URL này đã được nhập trước đó cho doanh nghiệp (sản phẩm "${dup.name}").`,
          existingProductId: dup.id,
        });
        return;
      }
      const { html, finalUrl } = await fetchExternalProductHtml(parsed.data.url);
      const rawDraft = extractProductFromHtml(html, finalUrl);
      const draft = {
        ...rawDraft,
        name: sanitizePlainText(rawDraft.name, 180),
        description: sanitizePlainText(rawDraft.description || '', 2000),
        sku: sanitizePlainText(rawDraft.sku || '', 80),
      };

      if (!parsed.data.saveToCatalog) {
        res.json({
          draft,
          saved: false,
          duplicateWarning: dup
            ? { existingProductId: dup.id, existingProductName: dup.name }
            : null,
        });
        return;
      }

      const product = v28Db.createProduct({
        companyId: parsed.data.companyId,
        boothId: parsed.data.boothId || null,
        name: draft.name,
        sku: draft.sku || '',
        price: draft.price || 0,
        currency: draft.currency || 'VND',
        description: draft.description || '',
        images: draft.images || [],
        videoUrl: draft.videoUrl || '',
        modelUrl: '',
        sourceUrl: draft.sourceUrl || parsed.data.url,
        contactUrl: '',
        inStock: draft.inStock ?? true,
        status: 'active',
      });
      res.status(201).json({ draft, product, saved: true });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // Business Website Product Discovery (bounded pages & byte budget, SSRF/PrivateIP/Redirect/XSS/RateLimit guarded)
  router.post('/imports/website', requireAdminAuth, async (req: Request, res: Response) => {
    const actorKey = `${(res.locals.adminUsername as string | undefined) || 'admin'}:${req.ip || 'local'}`;
    if (!checkUrlImportRateLimit(actorKey)) {
      res.status(429).json({
        error: `Vượt quá giới hạn trích xuất URL (${URL_IMPORT_MAX_PER_WINDOW} lượt/phút). Vui lòng thử lại sau.`,
        errorCode: 'HTTP_429',
      });
      return;
    }

    const body = (req.body || {}) as {
      companyId?: string;
      url?: string;
      maxPages?: number;
      autoDetectCompany?: boolean;
    };
    if (!body.url) {
      res.status(400).json({ error: 'Vui lòng nhập URL website.' });
      return;
    }

    let company: { id: string; name: string; status: string } | null = body.companyId
      ? v28Db.getCompanyById(body.companyId)
      : null;
    if (body.companyId && (!company || company.status !== 'active')) {
      res.status(404).json({ error: 'Doanh nghiệp không tồn tại hoặc đang bị vô hiệu hóa.' });
      return;
    }
    if (!company && !body.autoDetectCompany) {
      res.status(400).json({ error: 'Vui lòng chọn doanh nghiệp hoặc bật chế độ tự động nhận diện doanh nghiệp.' });
      return;
    }

    const maxPages = Math.max(1, Math.min(25, Number(body.maxPages) || 15));
    const budget = createCrawlBudget(MAX_TOTAL_CRAWL_BYTES);
    const stopReasons: string[] = [];
    let pageErrors = 0;

    const NON_PRODUCT_PATH_RE =
      /\/(login|signin|signup|register|cart|checkout|account|user|search|contact|lien-he|tin-tuc|news|blog|chinh-sach|policy|tuyen-dung|career|huong-dan|guide|faq|about|gioi-thieu|he-thong-cua-hang|tra-cuu|bao-hanh|sitemap)/i;

    const isLikelyProductPath = (pathname: string): boolean => {
      const p = pathname.toLowerCase();
      if (NON_PRODUCT_PATH_RE.test(p)) return false;
      if (
        p.includes('/product') ||
        p.includes('/san-pham') ||
        p.includes('/item') ||
        p.includes('/shop/') ||
        p.includes('/p/') ||
        p.includes('/sp/')
      ) {
        return true;
      }
      // E-commerce product slugs ending with .html containing a model/spec digit (avoids Vietnamese category slugs like /may-tinh-de-ban.html)
      if (/^\/[a-z0-9]+-[a-z0-9-]+\.html$/i.test(p)) {
        const slug = p.slice(1, -5);
        if (/\d/.test(slug)) {
          return true;
        }
      }
      return false;
    };

    const isLikelyCategoryPath = (pathname: string): boolean => {
      const p = pathname.toLowerCase();
      if (NON_PRODUCT_PATH_RE.test(p)) return false;
      return (
        /^\/[a-z0-9-]+\.html$/i.test(p) ||
        p.includes('/category') ||
        p.includes('/danh-muc') ||
        p.includes('/collections/')
      );
    };

    const collectLinksFromHtml = (
      html: string,
      baseUrl: string,
      origin: string,
      seenLinks: Set<string>,
      productLinks: string[],
      categoryLinks: string[],
      maxCollect: number
    ) => {
      const hrefMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi);
      for (const m of hrefMatches) {
        if (productLinks.length >= maxCollect && categoryLinks.length >= 4) break;
        const href = m[1].trim();
        if (
          !href ||
          href.startsWith('#') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('javascript:')
        ) {
          continue;
        }
        try {
          const absUrl = new URL(href, baseUrl);
          if (absUrl.origin !== origin) continue;
          const cleaned = absUrl.toString().replace(/#.*$/, '');
          if (seenLinks.has(cleaned)) continue;
          if (isLikelyProductPath(absUrl.pathname)) {
            if (productLinks.length < maxCollect) {
              seenLinks.add(cleaned);
              productLinks.push(cleaned);
            }
          } else if (isLikelyCategoryPath(absUrl.pathname)) {
            if (categoryLinks.length < 4) {
              seenLinks.add(cleaned);
              categoryLinks.push(cleaned);
            }
          }
        } catch {
          // ignore invalid href
        }
      }
    };

    const discoverProductLinksFromSitemap = async (
      origin: string,
      seenLinks: Set<string>,
      limit: number
    ): Promise<string[]> => {
      const found: string[] = [];
      const sitemapUrls: string[] = [];
      try {
        const robots = await fetchExternalText(`${origin}/robots.txt`, {
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
      } catch {
        // robots.txt optional
      }
      if (sitemapUrls.length === 0) {
        sitemapUrls.push(`${origin}/sitemap.xml`);
      }

      const inspectXml = async (xmlUrl: string, depth: number) => {
        if (found.length >= limit || depth > 2) return;
        try {
          const xmlRes = await fetchExternalText(xmlUrl, {
            maxBytes: MAX_SITEMAP_BYTES,
            budget,
            accept: 'application/xml,text/xml,*/*;q=0.5',
            allowedContentTypes: ['xml', 'text/plain'],
            checkCaptcha: false,
            resourceLabel: 'sitemap XML',
          });
          const locs = [...xmlRes.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
          // Sitemap index? Prioritize product sitemaps!
          const childSitemaps = locs.filter((u) => /\.xml(\?|$)/i.test(u));
          if (childSitemaps.length > 0) {
            const preferred = childSitemaps.filter((u) => /product|san-pham/i.test(u));
            const toVisit = (preferred.length > 0 ? preferred : childSitemaps).slice(0, 3);
            for (const child of toVisit) {
              if (found.length >= limit) break;
              try {
                if (new URL(child).origin === origin) {
                  await inspectXml(child, depth + 1);
                }
              } catch {}
            }
            return;
          }
          for (const loc of locs) {
            if (found.length >= limit) break;
            try {
              const u = new URL(loc);
              if (u.origin !== origin) continue;
              const cleaned = u.toString().replace(/#.*$/, '');
              if (seenLinks.has(cleaned)) continue;
              if (isLikelyProductPath(u.pathname)) {
                seenLinks.add(cleaned);
                found.push(cleaned);
              }
            } catch {}
          }
        } catch {
          // ignore unreachable/oversized sitemap safely
        }
      };

      await inspectXml(sitemapUrls[0], 0);
      return found;
    };

    try {
      let rootHtml = '';
      let finalUrl = body.url.trim();
      let rootOversizedFallback = false;
      let pagesScanned = 0;

      try {
        const rootRes = await fetchExternalProductHtml(finalUrl, { budget });
        rootHtml = rootRes.html;
        finalUrl = rootRes.finalUrl;
        pagesScanned = 1;
      } catch (rootErr) {
        // If homepage itself exceeds safe size cap, try lightweight public sitemap fallback (still strictly SSRF & size guarded!)
        if (rootErr instanceof ExternalFetchError && rootErr.code === 'SIZE_LIMIT') {
          rootOversizedFallback = true;
          finalUrl = new URL(finalUrl).toString();
        } else {
          throw rootErr;
        }
      }

      const rootOrigin = new URL(finalUrl).origin;
      let detectedSeller = rootHtml
        ? extractSellerOrganizationFromHtml(rootHtml, finalUrl)
        : extractSellerOrganizationFromHtml('', finalUrl);

      // Auto-resolve / match Seller Company by canonical domain or verified organization name (I5)
      let sellerResolution: {
        companyId: string | null;
        companyName: string;
        canonicalDomain: string;
        confidence: 'verified' | 'needs_confirmation';
        evidence: string;
        created: boolean;
        matchedBy: string;
      } = {
        companyId: company?.id ?? null,
        companyName: detectedSeller.name || company?.name || '',
        canonicalDomain: detectedSeller.canonicalDomain,
        confidence: detectedSeller.confidence,
        evidence: detectedSeller.evidence,
        created: false,
        matchedBy: company ? 'provided' : 'none',
      };

      const applySellerDetection = (htmlSample: string, sampleUrl: string) => {
        if (detectedSeller.confidence === 'verified' && detectedSeller.name) return;
        const next = extractSellerOrganizationFromHtml(htmlSample, sampleUrl);
        if (next.name && (next.confidence === 'verified' || !detectedSeller.name)) {
          detectedSeller = next;
        }
      };

      const finalizeSellerCompany = () => {
        if (body.autoDetectCompany || !company) {
          const resComp = v28Db.findOrCreateCompanyByWebsite({
            name: detectedSeller.name,
            canonicalDomain: detectedSeller.canonicalDomain,
            websiteUrl: detectedSeller.websiteUrl,
            logoUrl: detectedSeller.logoUrl,
            contactEmail: detectedSeller.contactEmail,
            description: detectedSeller.description,
            allowCreate: detectedSeller.confidence === 'verified',
          });
          if (resComp.company) {
            company = resComp.company;
            sellerResolution = {
              companyId: resComp.company.id,
              companyName: resComp.company.name,
              canonicalDomain: detectedSeller.canonicalDomain,
              confidence: detectedSeller.confidence,
              evidence: detectedSeller.evidence,
              created: resComp.created,
              matchedBy: resComp.matchedBy,
            };
          } else {
            sellerResolution = {
              companyId: company?.id ?? null,
              companyName: detectedSeller.name || company?.name || '',
              canonicalDomain: detectedSeller.canonicalDomain,
              confidence: 'needs_confirmation',
              evidence: detectedSeller.evidence,
              created: false,
              matchedBy: company ? 'fallback_selected' : 'none',
            };
          }
        }
      };

      if (rootHtml) {
        finalizeSellerCompany();
      }
      if (rootOversizedFallback) {
        stopReasons.push('homepage_oversized_sitemap_fallback');
      }

      const discovered: Array<{
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
      }> = [];
      const seenUrls = new Set<string>();
      const seenNames = new Set<string>();

      const pushCandidate = (
        draft: ReturnType<typeof extractProductFromHtml>,
        urlKey: string,
        categoryHint = '',
        brandHint = ''
      ) => {
        const cleanName = sanitizePlainText(draft.name || '', 180);
        if (!cleanName || cleanName.length < 2) return;
        const normUrl = urlKey.replace(/#.*$/, '').replace(/\/+$/, '');
        const normName = cleanName.toLowerCase();
        if (seenUrls.has(normUrl) || seenNames.has(normName)) return;
        seenUrls.add(normUrl);
        seenNames.add(normName);
        const dup = company ? categoryService.findDuplicateProductBySourceUrl(company.id, normUrl) : null;
        discovered.push({
          name: cleanName,
          brand: sanitizePlainText(brandHint, 80),
          sku: sanitizePlainText(draft.sku || '', 80),
          price: typeof draft.price === 'number' && Number.isFinite(draft.price) && draft.price > 0 ? draft.price : 0,
          currency: draft.currency || 'VND',
          description: sanitizePlainText(draft.description || '', 1200),
          images: Array.isArray(draft.images) ? draft.images.slice(0, 4) : [],
          category: sanitizePlainText(categoryHint, 80),
          sourceUrl: normUrl,
          inStock: draft.inStock ?? true,
          alreadyInCatalog: Boolean(dup),
        });
      };

      const candidateLinks: string[] = [];
      const categoryLinks: string[] = [];
      const seenLinks = new Set<string>([finalUrl.replace(/#.*$/, '')]);

      // 1. Parse JSON-LD Product / ItemList directly on landing page if present
      if (rootHtml) {
        const rootCat = extractBreadcrumbCategoryFromHtml(rootHtml);
        const ldMatches = rootHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        for (const m of ldMatches) {
          try {
            const parsedLd = JSON.parse(m[1].trim());
            const nodes: Array<Record<string, unknown>> = Array.isArray(parsedLd)
              ? parsedLd
              : Array.isArray(parsedLd?.['@graph'])
                ? parsedLd['@graph']
                : [parsedLd];
            for (const node of nodes) {
              if (!node || typeof node !== 'object') continue;
              if (node['@type'] === 'Product' && typeof node.name === 'string') {
                const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                const rawPrice = Number((offers as Record<string, unknown> | undefined)?.price || 0);
                const rawImg = Array.isArray(node.image) ? node.image[0] : node.image;
                const imgUrl = typeof rawImg === 'string' ? rawImg : (rawImg as { url?: string } | undefined)?.url || '';
                let itemUrl = finalUrl;
                if (typeof node.url === 'string') {
                  try {
                    const parsedItem = new URL(node.url, finalUrl);
                    if (parsedItem.protocol === 'http:' || parsedItem.protocol === 'https:') {
                      itemUrl = parsedItem.toString();
                    }
                  } catch {
                    itemUrl = finalUrl;
                  }
                }
                const nodeCat = typeof node.category === 'string' ? node.category : rootCat;
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
                    images: imgUrl && /^https?:\/\//i.test(imgUrl) ? [imgUrl] : [],
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
                      const abs = new URL(u, finalUrl).toString().replace(/#.*$/, '');
                      if (new URL(abs).origin === rootOrigin && !seenLinks.has(abs)) {
                        seenLinks.add(abs);
                        candidateLinks.push(abs);
                      }
                    } catch {}
                  }
                }
              }
            }
          } catch {
            // ignore malformed JSON-LD block
          }
        }

        // 2. Discover same-origin public product & category links on landing page
        collectLinksFromHtml(rootHtml, finalUrl, rootOrigin, seenLinks, candidateLinks, categoryLinks, maxPages * 2);
      }

      // 3. If landing page is a homepage with category links (or oversized), expand via up to 2 category pages OR public sitemap
      if (candidateLinks.length < Math.min(4, maxPages) && categoryLinks.length > 0 && pagesScanned < maxPages) {
        for (const catUrl of categoryLinks.slice(0, 2)) {
          if (pagesScanned >= maxPages - 1 || candidateLinks.length >= maxPages) break;
          try {
            const catRes = await fetchExternalProductHtml(catUrl, { budget });
            pagesScanned++;
            collectLinksFromHtml(
              catRes.html,
              catRes.finalUrl,
              rootOrigin,
              seenLinks,
              candidateLinks,
              [],
              maxPages * 2
            );
          } catch {
            // skip unreachable category page safely
          }
        }
      }

      if (candidateLinks.length < Math.min(4, maxPages)) {
        const sitemapProducts = await discoverProductLinksFromSitemap(rootOrigin, seenLinks, maxPages);
        for (const smLink of sitemapProducts) {
          if (candidateLinks.length >= maxPages * 2) break;
          candidateLinks.push(smLink);
        }
      }

      // 4. Fetch bounded candidate product pages and extract real structured product data
      for (const link of candidateLinks) {
        if (pagesScanned >= maxPages) {
          stopReasons.push(`max_pages_limit:${maxPages}`);
          break;
        }
        if (budget.totalBytesRead >= budget.maxTotalBytes) {
          stopReasons.push(`byte_budget_limit:${budget.maxTotalBytes}`);
          break;
        }
        try {
          const sub = await fetchExternalProductHtml(link, { budget });
          pagesScanned++;
          applySellerDetection(sub.html, sub.finalUrl);
          if (!company && detectedSeller.name) {
            finalizeSellerCompany();
          }
          const subDraft = extractProductFromHtml(sub.html, sub.finalUrl);
          const subCat = extractBreadcrumbCategoryFromHtml(sub.html);
          const subBrand = extractProductBrandFromHtml(sub.html);
          // Only accept genuine product pages (JSON-LD Product, priced item, or OpenGraph with image on non-root path)
          const subPath = new URL(sub.finalUrl).pathname.replace(/\/+$/, '');
          const isRootLanding = !subPath || subPath === '/';
          if (
            subDraft.extractionMethod === 'json-ld' ||
            subDraft.price > 0 ||
            (!isRootLanding && subDraft.extractionMethod === 'opengraph' && subDraft.images.length > 0)
          ) {
            pushCandidate(subDraft, sub.finalUrl, subCat, subBrand);
          }
        } catch {
          pageErrors++;
        }
      }

      finalizeSellerCompany();

      // 5. Fallback: if landing page itself is a single product page (has real product signal, not a generic homepage)
      if (discovered.length === 0 && rootHtml) {
        const rootDraft = extractProductFromHtml(rootHtml, finalUrl);
        const rootCat = extractBreadcrumbCategoryFromHtml(rootHtml);
        const rootBrand = extractProductBrandFromHtml(rootHtml);
        if (
          rootDraft.name &&
          rootDraft.name.trim().length >= 2 &&
          (rootDraft.extractionMethod === 'json-ld' || rootDraft.price > 0)
        ) {
          pushCandidate(rootDraft, finalUrl, rootCat, rootBrand);
        }
      }

      if (discovered.length === 0 && rootOversizedFallback) {
        res.status(413).json({
          error:
            'Trang chủ vượt quá giới hạn dung lượng an toàn (3.5 MB) và không tìm thấy sản phẩm công khai trong sitemap. Vui lòng nhập URL trang danh mục, URL sản phẩm cụ thể hoặc dùng Excel.',
          errorCode: 'SIZE_LIMIT',
        });
        return;
      }

      const duplicateCount = discovered.filter((d) => d.alreadyInCatalog).length;
      const newCount = discovered.length - duplicateCount;
      const uniqueStopReasons = Array.from(new Set(stopReasons));
      const coverageReport = {
        pagesScanned,
        productUrlsDiscovered: candidateLinks.length,
        extractedValidCount: discovered.length,
        newCount,
        duplicateCount,
        errorCount: pageErrors,
        totalBytesRead: budget.totalBytesRead,
        stopReasons: uniqueStopReasons,
        coverageStatus: 'IMPORT_COMPLETED' as const,
        fullCatalogVerified: false,
      };

      res.json({
        siteUrl: finalUrl,
        pagesScanned,
        totalBytesRead: budget.totalBytesRead,
        detectedCompany: sellerResolution,
        coverageReport,
        discoveredProducts: discovered,
        note:
          discovered.length > 0
            ? `Đã quét ${pagesScanned} trang (phát hiện ${candidateLinks.length} URL sản phẩm, trích xuất hợp lệ ${discovered.length} SP: ${newCount} mới, ${duplicateCount} đã có, ${pageErrors} trang lỗi · ${(budget.totalBytesRead / (1024 * 1024)).toFixed(2)} MB). Trạng thái: IMPORT COMPLETED (có giới hạn crawl an toàn).`
            : 'Không tìm thấy dữ liệu sản phẩm công khai có cấu trúc trên trang này. Bạn có thể nhập URL trang danh mục, URL sản phẩm cụ thể hoặc dùng tệp Excel.',
      });
    } catch (err) {
      const errorCode = err instanceof ExternalFetchError ? err.code : 'HTTP_ERROR';
      const status =
        err instanceof ExternalFetchError && err.code === 'SIZE_LIMIT'
          ? 413
          : err instanceof ExternalFetchError && err.code === 'TIMEOUT'
            ? 504
            : err instanceof ExternalFetchError && (err.code === 'HTTP_403' || err.code === 'CAPTCHA_BLOCKED')
              ? 403
              : err instanceof ExternalFetchError && err.code === 'HTTP_429'
                ? 429
                : getHttpStatus(err, 400);
      res.status(status).json({ error: (err as Error).message, errorCode });
    }
  });

  // ============================================================================
  // E. PHASE 2 — DYNAMIC EXHIBITIONS, VERSIONS, ZONES, PLACEMENTS & PUBLISH
  // ============================================================================
  // Phase 7 — Safe Local-Only Demo Login Config (NEVER returns credentials in production)
  router.get('/auth/demo-config', (_req: Request, res: Response) => {
    const demo = getDemoAccountCredentials();
    if (!demo) {
      res.json({ demoEnabled: false });
      return;
    }
    res.json({
      demoEnabled: true,
      label: 'Tài khoản dùng thử',
      username: demo.username,
      password: demo.password,
    });
  });

  router.get('/archetypes', (_req: Request, res: Response) => {
    res.json({ archetypes: exhibitionService.listArchetypes() });
  });

  router.get('/exhibitions/active', (req: Request, res: Response) => {
    try {
      const previewVersionId =
        typeof req.query.previewVersionId === 'string' && req.query.previewVersionId
          ? req.query.previewVersionId
          : undefined;
      // V28-AUDIT-012: Unpublished Draft/Archived preview requires valid Admin authentication!
      if (previewVersionId && !isRequestAuthenticatedAdmin(req)) {
        res.status(401).json({ error: 'Yêu cầu xác thực quản trị viên để xem trước phiên bản chưa xuất bản.' });
        return;
      }

      // Phase 2 Hardening: Serve public Published Active World from bounded in-memory JSON + ETag cache
      if (!previewVersionId) {
        if (!publishedWorldCache) {
          const world = exhibitionService.getActiveExhibitionWorld();
          const jsonBody = JSON.stringify({ world });
          if (world.status === 'published') {
            const etag = `"v28-${world.versionId}-${crypto.createHash('sha1').update(jsonBody).digest('hex').slice(0, 12)}"`;
            publishedWorldCache = { versionId: world.versionId, jsonBody, etag, builtAt: Date.now() };
          } else {
            // Never cache Draft/Archived responses in public cache
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.send(jsonBody);
            return;
          }
        }
        res.setHeader('ETag', publishedWorldCache.etag);
        res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
        if (req.headers['if-none-match'] === publishedWorldCache.etag) {
          res.status(304).end();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(publishedWorldCache.jsonBody);
        return;
      }

      const world = exhibitionService.getActiveExhibitionWorld(previewVersionId);
      res.json({ world });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/exhibitions', (req: Request, res: Response) => {
    exhibitionService.ensureDefaultExhibition(20);
    const all = exhibitionService.listExhibitions();
    // V28-AUDIT-012: Hide Draft/Archived version metadata from unauthenticated guests
    if (!isRequestAuthenticatedAdmin(req)) {
      const sanitized = all.map((e) => ({
        ...e,
        latestDraftVersionId: null,
        versions: e.versions.filter((v) => v.status === 'published'),
      }));
      res.json({ exhibitions: sanitized });
      return;
    }
    res.json({ exhibitions: all });
  });

  router.post('/exhibitions', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = CreateExhibitionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu triển lãm không hợp lệ.' });
      return;
    }
    try {
      const exhibition = exhibitionService.createExhibition(parsed.data);
      res.status(201).json({ exhibition });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/exhibitions/:id/drafts', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = CreateDraftLayoutInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Cấu hình layout không hợp lệ.' });
      return;
    }
    const { zoneCount, boothsPerZone, requireProductSource, productSource, sourceUrl, sourceFilename } = parsed.data;
    if (requireProductSource) {
      if (!productSource || (productSource !== 'url' && productSource !== 'excel')) {
        res.status(400).json({ error: 'Bắt buộc chọn nguồn sản phẩm (URL website hoặc tệp Excel) khi tạo triển lãm mới.' });
        return;
      }
      if (productSource === 'url') {
        const rawUrl = (sourceUrl || '').trim();
        let validUrl = false;
        try {
          const u = new URL(rawUrl);
          validUrl = u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          validUrl = false;
        }
        if (!validUrl) {
          res.status(400).json({ error: 'Vui lòng nhập URL website hợp lệ (http:// hoặc https://).' });
          return;
        }
      }
      if (productSource === 'excel') {
        const fn = (sourceFilename || '').trim().toLowerCase();
        if (!fn || (!fn.endsWith('.xlsx') && !fn.endsWith('.xls') && !fn.endsWith('.csv'))) {
          res.status(400).json({ error: 'Vui lòng chọn tệp Excel hợp lệ (.xlsx, .xls hoặc .csv).' });
          return;
        }
      }
    }
    const computedTotal =
      zoneCount && boothsPerZone
        ? zoneCount * boothsPerZone
        : parsed.data.targetBoothCount ?? 100;
    if (computedTotal < 1 || computedTotal > 300) {
      res.status(400).json({ error: 'Tổng số gian hàng phải nằm trong khoảng 1 đến 300 gian.' });
      return;
    }
    try {
      const version = exhibitionService.createDraftVersion(getParam(req.params.id), {
        ...parsed.data,
        targetBoothCount: computedTotal,
      });
      res.status(201).json({ version });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post(
    '/exhibitions/:id/versions/:versionId/auto-allocate',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const body = (req.body || {}) as {
          companyId?: string;
          productIds?: string[];
          categoryHints?: Record<string, string>;
        };
        const result = exhibitionService.autoAllocateDraftProducts(getParam(req.params.versionId), {
          companyId: typeof body.companyId === 'string' ? body.companyId : undefined,
          productIds: Array.isArray(body.productIds)
            ? body.productIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            : undefined,
          categoryHints:
            body.categoryHints && typeof body.categoryHints === 'object' ? body.categoryHints : undefined,
          expectedExhibitionId: getParam(req.params.id),
        });
        res.json(result);
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.get('/exhibitions/:id/versions/:versionId', (req: Request, res: Response) => {
    const version = exhibitionService.getVersionDetail(getParam(req.params.versionId));
    if (!version || version.exhibitionId !== getParam(req.params.id)) {
      res.status(404).json({ error: 'Không tìm thấy phiên bản triển lãm.' });
      return;
    }
    // V28-AUDIT-012: Draft/Archived versions require Admin authentication
    if (version.status !== 'published' && !isRequestAuthenticatedAdmin(req)) {
      res.status(401).json({ error: 'Yêu cầu xác thực quản trị viên để xem phiên bản Draft/Archived.' });
      return;
    }
    res.json({ version });
  });

  router.patch('/exhibitions/:id/versions/:versionId/zones/:zoneId', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = UpdateZoneInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật khu không hợp lệ.' });
      return;
    }
    try {
      const version = exhibitionService.updateDraftZone(
        getParam(req.params.versionId),
        getParam(req.params.zoneId),
        parsed.data,
        getParam(req.params.id)
      );
      res.json({ version });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.patch(
    '/exhibitions/:id/versions/:versionId/booths/:boothId',
    requireAdminAuth,
    (req: Request, res: Response) => {
      const parsed = UpdateDraftBoothPlacementInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật gian hàng không hợp lệ.' });
        return;
      }
      try {
        const version = exhibitionService.updateDraftBoothPlacement(
          getParam(req.params.versionId),
          getParam(req.params.boothId),
          parsed.data,
          getParam(req.params.id)
        );
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.delete(
    '/exhibitions/:id/versions/:versionId/booths/:boothId',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const forceUnassign = req.query.forceUnassign === 'true';
        const version = exhibitionService.deleteDraftBoothPlacement(
          getParam(req.params.versionId),
          getParam(req.params.boothId),
          { forceUnassign, expectedExhibitionId: getParam(req.params.id) }
        );
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  // V28-AUDIT-001: Isolated Draft slot assignment endpoints (never touch Published live slots!)
  router.put(
    '/exhibitions/:id/versions/:versionId/booths/:boothId/slots/:slotId',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const productId = typeof (req.body as { productId?: unknown })?.productId === 'string'
          ? (req.body as { productId: string }).productId
          : null;
        if (!productId) {
          res.status(400).json({ error: 'Thiếu productId để gán vào slot.' });
          return;
        }
        const version = exhibitionService.assignDraftBoothSlot(
          getParam(req.params.versionId),
          getParam(req.params.boothId),
          getParam(req.params.slotId),
          productId,
          getParam(req.params.id)
        );
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.delete(
    '/exhibitions/:id/versions/:versionId/booths/:boothId/slots/:slotId',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const version = exhibitionService.assignDraftBoothSlot(
          getParam(req.params.versionId),
          getParam(req.params.boothId),
          getParam(req.params.slotId),
          null,
          getParam(req.params.id)
        );
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/exhibitions/:id/versions/:versionId/publish',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const version = exhibitionService.publishVersion(
          getParam(req.params.id),
          getParam(req.params.versionId)
        );
        invalidatePublishedWorldCache();
        onLayoutPublished?.(version);
        // Incremental non-blocking audio cache check/warm on publish (reuses unchanged content hashes)
        void audioCacheService.syncVersionAudioIncremental(version, 20).catch(() => {});
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post('/exhibitions/:id/rollback', requireAdminAuth, (req: Request, res: Response) => {
    const parsed = RollbackVersionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thiếu targetVersionId.' });
      return;
    }
    try {
      const version = exhibitionService.rollbackVersion(
        getParam(req.params.id),
        parsed.data.targetVersionId
      );
      invalidatePublishedWorldCache();
      onLayoutPublished?.(version);
      res.json({ version });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // F. PHASE 4.2 — CATEGORIES & CATEGORY-BASED ZONE ALLOCATION PLANNER
  // ============================================================================
  router.get('/categories', (_req: Request, res: Response) => {
    res.json({ categories: categoryService.listCategories() });
  });

  router.post('/categories', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const { name, description, color } = (req.body || {}) as Record<string, string>;
      // V28-AUDIT-035C: Strict hex color validation
      const safeColor = color && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : undefined;
      if (color && !safeColor) {
        res.status(400).json({ error: 'Mã màu danh mục không hợp lệ (chỉ chấp nhận định dạng #RRGGBB).' });
        return;
      }
      const category = categoryService.createCategory({ name: name || '', description, color: safeColor });
      res.status(201).json({ category });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/categories/plan', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        targetBoothCount?: number;
        allocations?: Array<{ categoryId: string; boothCount: number }>;
      };
      const plan = categoryService.planCategoryZones(
        Number(body.targetBoothCount || 20),
        body.allocations
      );
      res.json({ plan });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // G. PHASE 5 — PRE-GENERATED CACHED AUDIO PIPELINE & STREAMING
  // ============================================================================
  router.get('/audio/overview', requireAdminAuth, (req: Request, res: Response) => {
    const limit = Number(req.query.limit || 50);
    res.json({ overview: audioCacheService.getAdminAudioOverview(limit) });
  });

  router.post('/booths/:id/audio/retry', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const boothId = getParam(req.params.id);
      const activeWorld = exhibitionService.getActiveExhibitionWorld();
      const booth = activeWorld.booths.find((b) => b.boothId === boothId);
      if (!booth) {
        res.status(404).json({ error: 'Gian hàng không thuộc phiên bản đang công bố.' });
        return;
      }
      const pack = await audioCacheService.retryBoothAudio(booth);
      res.json(pack);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // Per-IP rate limiter for public audio endpoint (V28-AUDIT-013)
  const audioGetHistory = new Map<string, number[]>();
  const checkAudioGetRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const recent = (audioGetHistory.get(ip) || []).filter((ts) => now - ts < 60_000);
    if (recent.length >= 40) return false;
    recent.push(now);
    audioGetHistory.set(ip, recent);
    if (audioGetHistory.size > 500) {
      for (const [k, arr] of audioGetHistory.entries()) {
        if (arr.every((ts) => now - ts >= 60_000)) audioGetHistory.delete(k);
      }
    }
    return true;
  };

  router.get('/booths/:id/audio', async (req: Request, res: Response) => {
    try {
      const isAdmin = isRequestAuthenticatedAdmin(req);
      if (!isAdmin && !checkAudioGetRateLimit(req.ip || 'anon')) {
        res.status(429).json({ error: 'Quá nhiều yêu cầu tải âm thanh. Vui lòng thử lại sau ít phút.' });
        return;
      }
      const boothId = getParam(req.params.id);
      const activeWorld = exhibitionService.getActiveExhibitionWorld();
      const booth = activeWorld.booths.find((b) => b.boothId === boothId);
      if (!booth) {
        res.status(404).json({ error: 'Gian hàng không thuộc phiên bản đang công bố.' });
        return;
      }
      // V28-AUDIT-013: Unauthenticated GET serves ready cache / local fallback without triggering paid live TTS
      const pack = await audioCacheService.getOrPrepareBoothAudioPack(booth, { allowLiveSynthesis: isAdmin });
      res.json(pack);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/audio/:audioId/stream', async (req: Request, res: Response) => {
    try {
      const audioId = getParam(req.params.audioId);
      const source = await audioCacheService.getAudioStreamSource(audioId);
      if (!source) {
        res.status(404).json({ error: 'Không tìm thấy tệp âm thanh hợp lệ.' });
        return;
      }
      const total = source.kind === 'file' ? source.size : source.buffer.length;
      res.setHeader('Content-Type', source.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const sendRange = (start: number, end: number, isPartial: boolean) => {
        const len = end - start + 1;
        if (isPartial) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        }
        res.setHeader('Content-Length', String(len));
        if (source.kind === 'file') {
          // Phase 6.1 Hardening: True file streaming with backpressure & clean FD release on client disconnect
          const stream = fs.createReadStream(source.filePath, { start, end });
          res.on('close', () => {
            if (!stream.destroyed) stream.destroy();
          });
          stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
            else res.end();
          });
          stream.pipe(res);
        } else {
          res.send(isPartial ? source.buffer.subarray(start, end + 1) : source.buffer);
        }
      };

      const rangeHeader = req.headers.range;
      if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader.trim())) {
        const [rawStart, rawEnd] = rangeHeader.replace(/bytes=/i, '').split('-');
        let start: number;
        let end: number;
        if (!rawStart && rawEnd) {
          // V28-AUDIT-045: RFC 9110 suffix-byte-range-spec (e.g., bytes=-500)
          const suffixLen = Number(rawEnd);
          if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
            return;
          }
          start = Math.max(0, total - suffixLen);
          end = total - 1;
        } else {
          start = rawStart ? Number(rawStart) : 0;
          end = rawEnd ? Math.min(total - 1, Number(rawEnd)) : total - 1;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        sendRange(start, end, true);
        return;
      }

      sendRange(0, total - 1, false);
    } catch (err) {
      res.status(getHttpStatus(err, 500)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // H. PHASE 6 — GEMINI AI CHAT & LIVE VOICE (GROUNDED + QUOTA CONTROLLED)
  // ============================================================================
  router.get('/ai/status', (req: Request, res: Response) => {
    const base = aiConsultantService.getProviderStatus();
    // V28-AUDIT-046: Only expose internal usage & cost telemetry to authenticated admins
    if (!isRequestAuthenticatedAdmin(req)) {
      res.json(base);
      return;
    }
    res.json({
      ...base,
      usage: aiConsultantService.getUsageSummary(),
      audioCacheMetrics: audioCacheService.metrics,
    });
  });

  router.post('/ai/chat', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { boothId?: string; userId?: string; message?: string };
      if (!body.boothId || !body.message) {
        res.status(400).json({ error: 'Thiếu boothId hoặc nội dung câu hỏi.' });
        return;
      }
      // V28-AUDIT-014: Always key rate-limiting by server-derived IP (never trust client body.userId)
      const serverIdentity = req.ip || req.socket.remoteAddress || 'anon';
      const response = await aiConsultantService.chatWithBoothNpc({
        boothId: body.boothId,
        userId: serverIdentity,
        message: body.message,
      });
      res.json(response);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/ai/voice/start', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { boothId?: string; userId?: string };
      if (!body.boothId) {
        res.status(400).json({ error: 'Thiếu boothId.' });
        return;
      }
      // V28-AUDIT-014: Always key voice quota by server-derived IP (never trust client body.userId)
      const serverIdentity = req.ip || req.socket.remoteAddress || 'anon';
      const session = aiConsultantService.startVoiceSession({
        boothId: body.boothId,
        userId: serverIdentity,
      });
      res.status(201).json({ session });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/ai/voice/:sessionId/turn', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { transcript?: string };
      if (!body.transcript) {
        res.status(400).json({ error: 'Thiếu transcript giọng nói.' });
        return;
      }
      const result = await aiConsultantService.processVoiceTurn({
        sessionId: getParam(req.params.sessionId),
        transcript: body.transcript,
      });
      res.json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/ai/voice/:sessionId/end', (req: Request, res: Response) => {
    const result = aiConsultantService.endVoiceSession(getParam(req.params.sessionId));
    res.json(result);
  });

  return router;
}
