import express, { Router, type Request, type Response } from 'express';
import { requireAdminAuth } from '../middleware/adminAuth.js';
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
import { fetchExternalProductHtml, extractProductFromHtml } from '../integrations/productAdapter.js';
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
  // Allow up to ~7.5MB JSON body specifically on V28 routes for 5MB base64-encoded .xlsx uploads
  router.use(express.json({ limit: '8mb' }));

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
  router.post('/imports/excel/preview', requireAdminAuth, async (req: Request, res: Response) => {
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

  // Business Website Product Discovery (bounded max 6 pages, SSRF/PrivateIP/Redirect/XSS/RateLimit guarded)
  router.post('/imports/website', requireAdminAuth, async (req: Request, res: Response) => {
    const actorKey = `${(res.locals.adminUsername as string | undefined) || 'admin'}:${req.ip || 'local'}`;
    if (!checkUrlImportRateLimit(actorKey)) {
      res.status(429).json({
        error: `Vượt quá giới hạn trích xuất URL (${URL_IMPORT_MAX_PER_WINDOW} lượt/phút). Vui lòng thử lại sau.`,
      });
      return;
    }

    const body = (req.body || {}) as { companyId?: string; url?: string; maxPages?: number };
    if (!body.companyId || !body.url) {
      res.status(400).json({ error: 'Vui lòng chọn doanh nghiệp và nhập URL website.' });
      return;
    }

    const company = v28Db.getCompanyById(body.companyId);
    if (!company || company.status !== 'active') {
      res.status(404).json({ error: 'Doanh nghiệp không tồn tại hoặc đang bị vô hiệu hóa.' });
      return;
    }

    const maxPages = Math.max(1, Math.min(6, Number(body.maxPages) || 6));

    try {
      const { html: rootHtml, finalUrl } = await fetchExternalProductHtml(body.url.trim());
      const rootOrigin = new URL(finalUrl).origin;
      const discovered: Array<{
        name: string;
        sku: string;
        price: number;
        currency: string;
        description: string;
        images: string[];
        sourceUrl: string;
        inStock: boolean;
        alreadyInCatalog: boolean;
      }> = [];
      const seenUrls = new Set<string>();
      const seenNames = new Set<string>();

      const pushCandidate = (draft: ReturnType<typeof extractProductFromHtml>, urlKey: string) => {
        const cleanName = sanitizePlainText(draft.name || '', 180);
        if (!cleanName || cleanName.length < 2) return;
        const normUrl = urlKey.replace(/#.*$/, '').replace(/\/+$/, '');
        const normName = cleanName.toLowerCase();
        if (seenUrls.has(normUrl) || seenNames.has(normName)) return;
        seenUrls.add(normUrl);
        seenNames.add(normName);
        const dup = categoryService.findDuplicateProductBySourceUrl(company.id, normUrl);
        discovered.push({
          name: cleanName,
          sku: sanitizePlainText(draft.sku || '', 80),
          price: typeof draft.price === 'number' && Number.isFinite(draft.price) && draft.price > 0 ? draft.price : 0,
          currency: draft.currency || 'VND',
          description: sanitizePlainText(draft.description || '', 1200),
          images: Array.isArray(draft.images) ? draft.images.slice(0, 4) : [],
          sourceUrl: normUrl,
          inStock: draft.inStock ?? true,
          alreadyInCatalog: Boolean(dup),
        });
      };

      // 1. Parse JSON-LD Product / ItemList directly on landing page if present
      const ldMatches = rootHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      const candidateLinks: string[] = [];
      const seenLinks = new Set<string>([finalUrl.replace(/#.*$/, '')]);

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
              const itemUrl = typeof node.url === 'string' ? new URL(node.url, finalUrl).toString() : finalUrl;
              pushCandidate(
                {
                  name: node.name,
                  sku: typeof node.sku === 'string' ? node.sku : '',
                  price: Number.isFinite(rawPrice) ? rawPrice : 0,
                  currency: typeof (offers as Record<string, unknown> | undefined)?.priceCurrency === 'string'
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
                itemUrl
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

      // 2. Discover same-origin public product links on landing page (strictly bounded to maxPages)
      const hrefMatches = rootHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi);
      for (const m of hrefMatches) {
        if (candidateLinks.length >= maxPages) break;
        const href = m[1].trim();
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
        try {
          const absUrl = new URL(href, finalUrl);
          if (absUrl.origin !== rootOrigin) continue;
          const p = absUrl.pathname.toLowerCase();
          if (
            p.includes('/product') ||
            p.includes('/san-pham') ||
            p.includes('/item') ||
            p.includes('/shop/') ||
            p.includes('/p/') ||
            p.includes('/sp/')
          ) {
            const cleaned = absUrl.toString().replace(/#.*$/, '');
            if (!seenLinks.has(cleaned)) {
              seenLinks.add(cleaned);
              candidateLinks.push(cleaned);
            }
          }
        } catch {
          // ignore invalid href
        }
      }

      let pagesScanned = 1;
      for (const link of candidateLinks.slice(0, maxPages - 1)) {
        try {
          const sub = await fetchExternalProductHtml(link);
          pagesScanned++;
          const subDraft = extractProductFromHtml(sub.html, sub.finalUrl);
          pushCandidate(subDraft, sub.finalUrl);
        } catch {
          // skip blocked/unparseable subpage safely
        }
      }

      // 3. Fallback: if landing page itself is a single product page and nothing else matched
      if (discovered.length === 0) {
        const rootDraft = extractProductFromHtml(rootHtml, finalUrl);
        if (rootDraft.name && rootDraft.name.trim().length >= 2) {
          pushCandidate(rootDraft, finalUrl);
        }
      }

      res.json({
        siteUrl: finalUrl,
        pagesScanned,
        discoveredProducts: discovered,
        note:
          discovered.length > 0
            ? `Đã tìm thấy ${discovered.length} sản phẩm công khai từ ${pagesScanned} trang (giới hạn an toàn tối đa ${maxPages} trang).`
            : 'Không tìm thấy dữ liệu sản phẩm có cấu trúc trên trang này. Bạn có thể nhập thủ công bên dưới.',
      });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // E. PHASE 2 — DYNAMIC EXHIBITIONS, VERSIONS, ZONES, PLACEMENTS & PUBLISH
  // ============================================================================
  router.get('/archetypes', (_req: Request, res: Response) => {
    res.json({ archetypes: exhibitionService.listArchetypes() });
  });

  router.get('/exhibitions/active', (req: Request, res: Response) => {
    try {
      const previewVersionId =
        typeof req.query.previewVersionId === 'string' && req.query.previewVersionId
          ? req.query.previewVersionId
          : undefined;
      const world = exhibitionService.getActiveExhibitionWorld(previewVersionId);
      res.json({ world });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/exhibitions', (_req: Request, res: Response) => {
    exhibitionService.ensureDefaultExhibition(20);
    res.json({ exhibitions: exhibitionService.listExhibitions() });
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
    const { zoneCount, boothsPerZone } = parsed.data;
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

  router.get('/exhibitions/:id/versions/:versionId', (req: Request, res: Response) => {
    const version = exhibitionService.getVersionDetail(getParam(req.params.versionId));
    if (!version || version.exhibitionId !== getParam(req.params.id)) {
      res.status(404).json({ error: 'Không tìm thấy phiên bản triển lãm.' });
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
        parsed.data
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
          parsed.data
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
          { forceUnassign }
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
      const category = categoryService.createCategory({ name: name || '', description, color });
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

  router.get('/booths/:id/audio', async (req: Request, res: Response) => {
    try {
      const boothId = getParam(req.params.id);
      const activeWorld = exhibitionService.getActiveExhibitionWorld();
      const booth = activeWorld.booths.find((b) => b.boothId === boothId);
      if (!booth) {
        res.status(404).json({ error: 'Gian hàng không thuộc phiên bản đang công bố.' });
        return;
      }
      const pack = await audioCacheService.getOrPrepareBoothAudioPack(booth);
      res.json(pack);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/audio/:audioId/stream', async (req: Request, res: Response) => {
    try {
      const audioId = getParam(req.params.audioId);
      const result = await audioCacheService.getAudioStreamBuffer(audioId);
      if (!result) {
        res.status(404).json({ error: 'Không tìm thấy tệp âm thanh.' });
        return;
      }
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(result.buffer);
    } catch (err) {
      res.status(getHttpStatus(err, 500)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // H. PHASE 6 — GEMINI AI CHAT & LIVE VOICE (GROUNDED + QUOTA CONTROLLED)
  // ============================================================================
  router.get('/ai/status', (_req: Request, res: Response) => {
    res.json({
      ...aiConsultantService.getProviderStatus(),
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
      const response = await aiConsultantService.chatWithBoothNpc({
        boothId: body.boothId,
        userId: body.userId || req.ip || 'anon',
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
      const session = aiConsultantService.startVoiceSession({
        boothId: body.boothId,
        userId: body.userId || req.ip || 'anon',
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
