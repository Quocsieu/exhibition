import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
import { V28VisitorJourneyService } from '../services/v28/visitorJourneyService.js';
import { V28RewardRedemptionService } from '../services/v28/rewardRedemptionService.js';
import {
  fetchExternalProductHtml,
  extractProductFromHtml,
  ExternalFetchError,
} from '../integrations/productAdapter.js';
import {
  crawlWebsiteForProducts,
  MAX_TARGET_PRODUCTS,
  validateTargetCount,
} from '../services/v28WebsiteCrawlerService.js';
import { V28ProductImageService } from '../services/v28ProductImageService.js';
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
  aiConsultantService = new V28AiConsultantService(v28Db, exhibitionService),
  visitorJourneyService = new V28VisitorJourneyService(v28Db, exhibitionService),
  productImageService = V28ProductImageService.fromEnv()
): Router {
  const categoryService = new V28CategoryService(v28Db);
  const rewardRedemptionService = new V28RewardRedemptionService(
    v28Db,
    exhibitionService,
    visitorJourneyService
  );
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
  router.get('/company', (req: Request, res: Response) => {
    const requestedExhId = typeof req.query.exhibitionId === 'string' ? req.query.exhibitionId.trim() : '';
    const activeCompanies = v28Db.listCompanies({ status: 'active' });
    let activeWorld: ReturnType<typeof exhibitionService.getActiveExhibitionWorld> | null = null;
    try {
      activeWorld = exhibitionService.getActiveExhibitionWorld();
    } catch {
      activeWorld = null;
    }
    const ownerId =
      activeWorld?.ownerCompanyId ||
      activeWorld?.booths.find((b) => b.companyId)?.companyId ||
      activeCompanies[0]?.id ||
      null;
    const ownerCompany = activeCompanies.find((c) => c.id === ownerId) || activeCompanies[0] || null;
    res.json({
      state: ownerCompany ? 'bound' : 'empty',
      exhibitionId: activeWorld?.exhibitionId || requestedExhId || null,
      exhibitionName: activeWorld?.exhibitionName || null,
      company: ownerCompany ? { ...ownerCompany, boothCount: ownerCompany.boothCount ?? 0, productCount: ownerCompany.productCount ?? 0 } : null,
      currentPublishedOwnerId: ownerCompany?.id || null,
      candidateCompanies: activeCompanies.map((c) => ({
        ...c,
        boothCount: c.boothCount ?? 0,
        productCount: c.productCount ?? 0,
      })),
    });
  });

  router.post('/company/select-owner', requireAdminAuth, (req: Request, res: Response) => {
    const body = (req.body || {}) as { companyId?: string; exhibitionId?: string };
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    if (!companyId) {
      res.status(400).json({ error: 'Thiếu companyId để chọn doanh nghiệp chủ sở hữu.' });
      return;
    }
    const chosen = v28Db.getCompanyById(companyId);
    if (!chosen || chosen.status !== 'active') {
      res.status(404).json({ error: 'Doanh nghiệp không tồn tại hoặc đang bị vô hiệu hóa.' });
      return;
    }
    const activeCompanies = v28Db.listCompanies({ status: 'active' });
    let activeWorld: ReturnType<typeof exhibitionService.getActiveExhibitionWorld> | null = null;
    try {
      activeWorld = exhibitionService.getActiveExhibitionWorld();
    } catch {
      activeWorld = null;
    }
    const chosenWithCounts = activeCompanies.find((c) => c.id === chosen.id);
    res.json({
      state: 'bound',
      exhibitionId: activeWorld?.exhibitionId || body.exhibitionId || null,
      exhibitionName: activeWorld?.exhibitionName || null,
      company: {
        ...chosen,
        boothCount: chosenWithCounts?.boothCount ?? 0,
        productCount: chosenWithCounts?.productCount ?? 0,
      },
      currentPublishedOwnerId: chosen.id,
      candidateCompanies: activeCompanies.map((c) => ({
        ...c,
        boothCount: c.boothCount ?? 0,
        productCount: c.productCount ?? 0,
      })),
    });
  });

  router.post('/company/replace', requireAdminAuth, (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const parsed = CreateCompanyInputSchema.safeParse({
      name: body.name,
      slug: body.slug,
      category: body.category || 'General',
      description: body.description || '',
      contactEmail: body.contactEmail || '',
      contactUrl: body.contactUrl || '',
      logoUrl: body.logoUrl || '',
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thông tin doanh nghiệp không hợp lệ.' });
      return;
    }
    try {
      const created = v28Db.createCompany(parsed.data);
      const activeCompanies = v28Db.listCompanies({ status: 'active' });
      let activeWorld: ReturnType<typeof exhibitionService.getActiveExhibitionWorld> | null = null;
      try {
        activeWorld = exhibitionService.getActiveExhibitionWorld();
      } catch {
        activeWorld = null;
      }
      const createdWithCounts = activeCompanies.find((c) => c.id === created.id);
      res.status(201).json({
        state: 'bound',
        exhibitionId:
          activeWorld?.exhibitionId ||
          (typeof body.exhibitionId === 'string' ? body.exhibitionId : null),
        exhibitionName: activeWorld?.exhibitionName || null,
        company: {
          ...created,
          boothCount: createdWithCounts?.boothCount ?? 0,
          productCount: createdWithCounts?.productCount ?? 0,
        },
        currentPublishedOwnerId: created.id,
        candidateCompanies: activeCompanies.map((c) => ({
          ...c,
          boothCount: c.boothCount ?? 0,
          productCount: c.productCount ?? 0,
        })),
      });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

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
          void audioCacheService.getOrPrepareBoothAudioPack(b).catch(() => { });
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
          void audioCacheService.getOrPrepareBoothAudioPack(booth).catch(() => { });
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
      const draftImages = Array.isArray(rawDraft.images) ? [...rawDraft.images] : [];
      if (draftImages[0] && /^https?:\/\//i.test(draftImages[0])) {
        try {
          const ingested = await productImageService.ingestImageUrl(draftImages[0]);
          if (ingested.ok && ingested.storedUrl) {
            draftImages[0] = ingested.storedUrl;
          }
        } catch {
          // Keep original URL as fallback
        }
      }
      const draft = {
        ...rawDraft,
        name: sanitizePlainText(rawDraft.name, 180),
        description: sanitizePlainText(rawDraft.description || '', 2000),
        sku: sanitizePlainText(rawDraft.sku || '', 80),
        images: draftImages,
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
      discoveryMode?: string;
      targetCount?: number;
      maxPages?: number;
      autoDetectCompany?: boolean;
    };
    if (!body.url) {
      res.status(400).json({ error: 'Vui lòng nhập URL website.' });
      return;
    }

    let targetCount: number;
    try {
      const hasExplicitTarget =
        body.targetCount !== undefined &&
        body.targetCount !== null &&
        (body.targetCount as unknown) !== '';
      const effectiveTarget =
        !hasExplicitTarget && String(body.discoveryMode || '').toLowerCase() === 'full'
          ? MAX_TARGET_PRODUCTS
          : body.targetCount;
      targetCount = validateTargetCount(effectiveTarget);
    } catch (valErr) {
      res.status(400).json({ error: (valErr as Error).message, errorCode: 'INVALID_TARGET_COUNT' });
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

    try {
      const crawlRes = await crawlWebsiteForProducts(
        {
          url: body.url,
          targetCount,
          maxPages: body.maxPages,
        },
        {
          findDuplicateByUrl: (u) => Boolean(company && categoryService.findDuplicateProductBySourceUrl(company.id, u)),
          sanitizePlainText,
        }
      );

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
        companyName: crawlRes.detectedSeller.name || company?.name || '',
        canonicalDomain: crawlRes.detectedSeller.canonicalDomain,
        confidence: crawlRes.detectedSeller.confidence,
        evidence: crawlRes.detectedSeller.evidence,
        created: false,
        matchedBy: company ? 'provided' : 'none',
      };

      if (body.autoDetectCompany || !company) {
        const resComp = v28Db.findOrCreateCompanyByWebsite({
          name: crawlRes.detectedSeller.name,
          canonicalDomain: crawlRes.detectedSeller.canonicalDomain,
          websiteUrl: crawlRes.detectedSeller.websiteUrl,
          logoUrl: crawlRes.detectedSeller.logoUrl,
          contactEmail: crawlRes.detectedSeller.contactEmail,
          description: crawlRes.detectedSeller.description,
          allowCreate: crawlRes.detectedSeller.confidence === 'verified',
        });
        if (resComp.company) {
          company = resComp.company;
          sellerResolution = {
            companyId: resComp.company.id,
            companyName: resComp.company.name,
            canonicalDomain: crawlRes.detectedSeller.canonicalDomain,
            confidence: crawlRes.detectedSeller.confidence,
            evidence: crawlRes.detectedSeller.evidence,
            created: resComp.created,
            matchedBy: resComp.matchedBy,
          };
        } else {
          sellerResolution = {
            companyId: company?.id ?? null,
            companyName: crawlRes.detectedSeller.name || company?.name || '',
            canonicalDomain: crawlRes.detectedSeller.canonicalDomain,
            confidence: 'needs_confirmation',
            evidence: crawlRes.detectedSeller.evidence,
            created: false,
            matchedBy: company ? 'fallback_selected' : 'none',
          };
        }
      }

      // Re-check DB duplicates if company was auto-created/matched after crawl
      const discovered = crawlRes.discoveredProducts.map((item) => ({
        ...item,
        alreadyInCatalog: company
          ? Boolean(categoryService.findDuplicateProductBySourceUrl(company.id, item.sourceUrl))
          : item.alreadyInCatalog,
      }));
      const duplicateCount = discovered.filter((d) => d.alreadyInCatalog).length;
      const newCount = discovered.length - duplicateCount;

      const discoveryStatus =
        discovered.length === 0
          ? 'empty'
          : crawlRes.coverageReport.stopReason === 'RESOURCE_LIMIT'
            ? 'partial'
            : 'complete';

      res.json({
        siteUrl: crawlRes.siteUrl,
        entryPageType: discovered.length === 1 && crawlRes.pagesScanned === 1 ? 'product' : 'catalog',
        discoveryStatus,
        discoveryStats: {
          pagesScanned: crawlRes.pagesScanned,
          productUrlsDiscovered: crawlRes.coverageReport.productUrlsDiscovered,
          extractedValidCount: discovered.length,
          newCount,
          duplicateCount,
          errorCount: crawlRes.coverageReport.errorCount,
          totalBytesRead: crawlRes.totalBytesRead,
          limitOrErrorReason:
            discovered.length === 0
              ? crawlRes.note
              : crawlRes.coverageReport.stopReason === 'RESOURCE_LIMIT'
                ? crawlRes.note
                : undefined,
        },
        pagesScanned: crawlRes.pagesScanned,
        totalBytesRead: crawlRes.totalBytesRead,
        detectedCompany: sellerResolution,
        coverageReport: {
          ...crawlRes.coverageReport,
          newCount,
          duplicateCount,
        },
        discoveredProducts: discovered,
        note: crawlRes.note,
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

  // Phase 2 — Safe Content-Addressed Product Image Serving (CORS-enabled for WebGL, strict regex, NO open proxy)
  let backgroundImageMirrorRunning = false;
  const mirrorMissingProductImagesInBackground = async (): Promise<{
    scanned: number;
    mirrored: number;
    failed: number;
  }> => {
    if (backgroundImageMirrorRunning) {
      return { scanned: 0, mirrored: 0, failed: 0 };
    }
    backgroundImageMirrorRunning = true;
    let scanned = 0;
    let mirrored = 0;
    let failed = 0;
    try {
      const productsRes = v28Db.listProducts({ status: 'active', page: 1, limit: 1000 });
      const candidates = productsRes.items.filter(
        (p) => Array.isArray(p.images) && p.images[0] && /^https?:\/\//i.test(p.images[0].trim())
      );
      scanned = candidates.length;
      const CONCURRENCY = 12;
      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const wave = candidates.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          wave.map(async (prod) => {
            const rawUrl = prod.images[0].trim();
            try {
              const ingested = await productImageService.ingestImageUrl(rawUrl);
              if (ingested.ok && ingested.storedUrl) {
                const nextImages = [ingested.storedUrl, ...prod.images.slice(1)];
                v28Db.updateProduct(prod.id, { images: nextImages });
                mirrored++;
              } else {
                failed++;
              }
            } catch {
              failed++;
            }
          })
        );
      }
      if (mirrored > 0) {
        invalidatePublishedWorldCache();
      }
    } finally {
      backgroundImageMirrorRunning = false;
    }
    return { scanned, mirrored, failed };
  };

  if (!process.env.VITEST) {
    setTimeout(() => {
      void mirrorMissingProductImagesInBackground().catch(() => {});
    }, 3_000).unref();
  }

  // Phase 3 — Atomic Batch Product Create/Upsert in a single SQLite transaction (replaces non-atomic FE POST loops)
  router.post('/products/batch', requireAdminAuth, async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      companyId?: string;
      duplicateStrategy?: 'skip' | 'update';
      products?: Array<{
        name?: string;
        sku?: string;
        price?: number;
        currency?: string;
        description?: string;
        images?: string[];
        sourceUrl?: string;
        contactUrl?: string;
        inStock?: boolean;
      }>;
    };
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    const strategy = body.duplicateStrategy === 'update' ? 'update' : 'skip';
    const items = Array.isArray(body.products) ? body.products : [];

    if (!companyId) {
      res.status(400).json({ error: 'Thiếu companyId.' });
      return;
    }
    const company = v28Db.getCompanyById(companyId);
    if (!company || company.status !== 'active') {
      res.status(404).json({ error: 'Doanh nghiệp không tồn tại hoặc đang bị vô hiệu hóa.' });
      return;
    }
    if (items.length === 0 || items.length > 1800) {
      res.status(400).json({ error: 'Số lượng sản phẩm mỗi batch phải từ 1 đến 1800.' });
      return;
    }

    // Mirror external primary images into CORS-safe persistent product-images storage (bounded concurrency & time budget)
    const mirroredPrimaryUrl = new Map<string, string>();
    const uniqueExternalPrimaryUrls = Array.from(
      new Set(
        items
          .map((raw) => (Array.isArray(raw?.images) ? String(raw.images[0] || '').trim() : ''))
          .filter((u) => /^https?:\/\//i.test(u))
      )
    );
    const mirrorDeadline = Date.now() + 35_000;
    const MIRROR_CONCURRENCY = 16;
    for (let i = 0; i < uniqueExternalPrimaryUrls.length; i += MIRROR_CONCURRENCY) {
      if (Date.now() >= mirrorDeadline) break;
      const wave = uniqueExternalPrimaryUrls.slice(i, i + MIRROR_CONCURRENCY);
      await Promise.allSettled(
        wave.map(async (url) => {
          try {
            const ingested = await productImageService.ingestImageUrl(url);
            if (ingested.ok && ingested.storedUrl) {
              mirroredPrimaryUrl.set(url, ingested.storedUrl);
            }
          } catch {
            // Keep original URL as fallback
          }
        })
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const createdProductIds: string[] = [];
    const productIds: string[] = [];
    const errors: Array<{ index: number; name?: string; reason: string }> = [];

    try {
      v28Db.runInTransaction(() => {
        for (let i = 0; i < items.length; i++) {
          const raw = items[i];
          const cleanName = sanitizePlainText(raw?.name || '', 180);
          if (cleanName.length < 2) {
            failedCount++;
            errors.push({ index: i, name: raw?.name, reason: 'Tên sản phẩm quá ngắn (<2 ký tự).' });
            continue;
          }
          const cleanSku = sanitizePlainText(raw?.sku || '', 80);
          const cleanSourceUrl = typeof raw?.sourceUrl === 'string' ? raw.sourceUrl.trim() : '';
          const cleanPrice = typeof raw?.price === 'number' && Number.isFinite(raw.price) && raw.price >= 0 ? raw.price : 0;
          const cleanCurrency = (raw?.currency || 'VND').trim().toUpperCase().slice(0, 10) || 'VND';
          const cleanDesc = sanitizePlainText(raw?.description || '', 2000);
          const rawImages = Array.isArray(raw?.images)
            ? raw.images.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).slice(0, 6)
            : [];
          const cleanImages = rawImages.map((u, idx) =>
            idx === 0 ? mirroredPrimaryUrl.get(u.trim()) || u.trim() : u.trim()
          );

          // Stable duplicate lookup: SKU -> Source URL -> Exact Name within company
          const existingBySku = cleanSku ? v28Db.findProductByCompanyAndSku(companyId, cleanSku) : null;
          const existingByUrl = !existingBySku && cleanSourceUrl
            ? categoryService.findDuplicateProductBySourceUrl(companyId, cleanSourceUrl)
            : null;
          const existing = existingBySku || existingByUrl;

          if (existing) {
            if (strategy === 'update') {
              const patch: Record<string, unknown> = {
                name: cleanName,
                price: cleanPrice,
                currency: cleanCurrency,
              };
              if (cleanDesc) patch.description = cleanDesc;
              if (cleanImages.length > 0) patch.images = cleanImages;
              if (cleanSourceUrl) patch.sourceUrl = cleanSourceUrl;
              if (typeof raw?.inStock === 'boolean') patch.inStock = raw.inStock;
              v28Db.updateProduct(existing.id, patch);
              updatedCount++;
              productIds.push(existing.id);
            } else {
              // Even when skipping duplicates, upgrade legacy raw external image URL to mirrored CORS-safe URL if available
              if (cleanImages.length > 0 && cleanImages[0].startsWith('/api/v28/product-images/')) {
                const fullExisting = v28Db.getProductById(existing.id);
                if (!fullExisting?.images?.[0] || !fullExisting.images[0].startsWith('/api/v28/product-images/')) {
                  v28Db.updateProduct(existing.id, { images: cleanImages });
                }
              }
              skippedCount++;
              productIds.push(existing.id);
            }
            continue;
          }

          const created = v28Db.createProduct({
            companyId,
            boothId: null,
            name: cleanName,
            sku: cleanSku,
            price: cleanPrice,
            currency: cleanCurrency,
            description: cleanDesc,
            images: cleanImages,
            videoUrl: '',
            modelUrl: '',
            sourceUrl: cleanSourceUrl,
            contactUrl: typeof raw?.contactUrl === 'string' ? raw.contactUrl.trim() : '',
            inStock: raw?.inStock ?? true,
            status: 'active',
          });
          createdCount++;
          createdProductIds.push(created.id);
          productIds.push(created.id);
        }
      });

      res.status(201).json({
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        createdProductIds,
        productIds,
        errors,
      });
      if (!process.env.VITEST && uniqueExternalPrimaryUrls.length > mirroredPrimaryUrl.size) {
        void mirrorMissingProductImagesInBackground().catch(() => {});
      }
    } catch (err) {
      res.status(getHttpStatus(err, 500)).json({
        error: `Lỗi transaction khi lưu batch sản phẩm (đã rollback toàn bộ): ${(err as Error).message}`,
      });
    }
  });

  router.get('/product-images/:filename', async (req: Request, res: Response) => {
    const filename = getParam(req.params.filename);
    try {
      const record = await productImageService.getStoredImage(filename);
      if (!record) {
        res.status(404).json({ error: 'Không tìm thấy ảnh sản phẩm.' });
        return;
      }
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Length', String(record.bytes));
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(record.data);
    } catch {
      res.status(500).json({ error: 'Lỗi khi đọc ảnh sản phẩm từ kho lưu trữ.' });
    }
  });

  router.post('/images/ingest', requireAdminAuth, async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      res.status(400).json({ error: 'Thiếu URL hình ảnh cần tải về.' });
      return;
    }
    const result = await productImageService.ingestImageUrl(url);
    if (!result.ok) {
      const status =
        result.errorCode === 'SIZE_LIMIT'
          ? 413
          : result.errorCode === 'TIMEOUT'
            ? 504
            : result.errorCode === 'HTTP_403' || result.errorCode === 'SSRF_BLOCKED'
              ? 403
              : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
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
          organizeZonesByCategory?: boolean;
          replaceExisting?: boolean;
        };
        const result = exhibitionService.autoAllocateDraftProducts(getParam(req.params.versionId), {
          companyId: typeof body.companyId === 'string' ? body.companyId : undefined,
          productIds: Array.isArray(body.productIds)
            ? body.productIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            : undefined,
          categoryHints:
            body.categoryHints && typeof body.categoryHints === 'object' ? body.categoryHints : undefined,
          organizeZonesByCategory: body.organizeZonesByCategory !== false,
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
      if (version.status === 'published') {
        invalidatePublishedWorldCache();
        onLayoutPublished?.(version);
      }
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
        if (version.status === 'published') {
          invalidatePublishedWorldCache();
          try {
            const activeWorld = exhibitionService.getActiveExhibitionWorld();
            onLayoutPublished?.(activeWorld);
            const booth = activeWorld.booths.find((b) => b.boothId === getParam(req.params.boothId));
            if (booth) {
              void audioCacheService.getOrPrepareBoothAudioPack(booth).catch(() => { });
            }
          } catch {
            // ignore if no active exhibition yet
          }
        }
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
        if (version.status === 'published') {
          invalidatePublishedWorldCache();
          try {
            onLayoutPublished?.(exhibitionService.getActiveExhibitionWorld());
          } catch {
            // ignore if no active exhibition yet
          }
        }
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  const BoothVisibilityBodySchema = z.object({
    hidden: z.boolean(),
  });

  router.patch(
    '/exhibitions/:id/versions/:versionId/booths/:boothId/visibility',
    requireAdminAuth,
    (req: Request, res: Response) => {
      const parsed = BoothVisibilityBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Thiếu trạng thái hidden (true/false) hợp lệ.' });
        return;
      }
      try {
        const result = exhibitionService.setVersionBoothVisibility(
          getParam(req.params.id),
          getParam(req.params.versionId),
          getParam(req.params.boothId),
          parsed.data.hidden
        );
        if (result.isPublishedVersion && result.publicActiveWorld) {
          invalidatePublishedWorldCache();
          onLayoutPublished?.(result.publicActiveWorld);
        }
        res.json({
          version: result.adminVersion,
          activeBoothCount: result.publicActiveWorld
            ? result.publicActiveWorld.booths.length
            : result.adminVersion.booths.filter((b) => b.placementStatus !== 'hidden').length,
        });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  const RemoveEmptyBoothsBodySchema = z.object({
    mode: z.enum(['single', 'zone', 'all']),
    boothId: z.string().trim().min(1).optional(),
    zoneId: z.string().trim().min(1).optional(),
  });

  router.post(
    '/exhibitions/:id/versions/:versionId/empty-booths/remove',
    requireAdminAuth,
    (req: Request, res: Response) => {
      const parsed = RemoveEmptyBoothsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Yêu cầu xóa gian trống không hợp lệ.' });
        return;
      }
      try {
        const exhibitionId = getParam(req.params.id);
        const versionId = getParam(req.params.versionId);
        const result = exhibitionService.removeEmptyBooths(
          exhibitionId,
          versionId,
          parsed.data
        );
        // Automatically consolidate sparse zones (<= 3 booths per zone) so Admin never ends up with 7 single-booth zones
        const consolidated = exhibitionService.consolidateSparseZones(exhibitionId, versionId, {
          sparseThreshold: 3,
          maxBoothsPerZone: 10,
        });
        const finalVersion = consolidated.consolidated ? consolidated.version : result.version;
        const finalPublicWorld = consolidated.consolidated
          ? consolidated.publicActiveWorld
          : result.publicActiveWorld;
        if (result.isPublishedVersion && finalPublicWorld && (result.removedCount > 0 || consolidated.consolidated)) {
          invalidatePublishedWorldCache();
          onLayoutPublished?.(finalPublicWorld);
        }
        res.json({
          version: finalVersion,
          removedBoothIds: result.removedBoothIds,
          removedCount: result.removedCount,
          removedZoneCodes: Array.from(new Set([...result.removedZoneCodes, ...consolidated.mergedZoneCodes])),
          compacted: result.compacted || consolidated.consolidated,
          consolidated: consolidated.consolidated,
          mergedZoneCodes: consolidated.mergedZoneCodes,
          remainingBoothCount: finalVersion.booths.length,
          remainingZoneCount: finalVersion.zones.length,
        });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/exhibitions/:id/versions/:versionId/consolidate-sparse-zones',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const body = (req.body || {}) as { sparseThreshold?: number; maxBoothsPerZone?: number };
        const result = exhibitionService.consolidateSparseZones(
          getParam(req.params.id),
          getParam(req.params.versionId),
          {
            sparseThreshold:
              typeof body.sparseThreshold === 'number' && Number.isFinite(body.sparseThreshold)
                ? body.sparseThreshold
                : 3,
            maxBoothsPerZone:
              typeof body.maxBoothsPerZone === 'number' && Number.isFinite(body.maxBoothsPerZone)
                ? body.maxBoothsPerZone
                : 10,
          }
        );
        if (result.isPublishedVersion && result.publicActiveWorld && result.consolidated) {
          invalidatePublishedWorldCache();
          onLayoutPublished?.(result.publicActiveWorld);
        }
        res.json(result);
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post('/products/mirror-missing-images', requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const report = await mirrorMissingProductImagesInBackground();
      res.json({ status: 'ok', ...report });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

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
        void audioCacheService.syncVersionAudioIncremental(version, 20).catch(() => { });
        res.json({ version });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/exhibitions/:id/working-draft',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const exhibitionId = getParam(req.params.id);
        const summary = exhibitionService.getExhibitionSummary(exhibitionId);
        if (!summary) {
          res.status(404).json({ error: 'Không tìm thấy triển lãm.' });
          return;
        }
        if (summary.latestDraftVersionId) {
          const existingDraft = exhibitionService.getVersionDetail(
            summary.latestDraftVersionId,
            { includeHidden: true }
          );
          if (existingDraft && existingDraft.exhibitionId === exhibitionId) {
            res.json({ version: existingDraft, created: false });
            return;
          }
        }
        const baseVersionId = summary.activeVersionId || summary.versions[0]?.id;
        const baseDetail = baseVersionId
          ? exhibitionService.getVersionDetail(baseVersionId, { includeHidden: true })
          : null;
        const targetBoothCount = Math.max(
          1,
          baseDetail?.booths.length || summary.activeBoothCount || 12
        );
        const zoneCount = Math.max(1, baseDetail?.zones.length || summary.activeZoneCount || 1);
        const boothsPerZone = Math.max(1, Math.ceil(targetBoothCount / zoneCount));
        const version = exhibitionService.createDraftVersion(exhibitionId, {
          targetBoothCount,
          zoneCount,
          boothsPerZone,
          preferredZoneCapacity: boothsPerZone,
          baseVersionId: baseVersionId || undefined,
          ownerCompanyId: baseDetail?.ownerCompanyId || undefined,
        });
        res.json({ version, created: true });
      } catch (err) {
        res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/exhibitions/:id/save-and-publish',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const exhibitionId = getParam(req.params.id);
        const body = (req.body || {}) as { versionId?: string };
        const summary = exhibitionService.getExhibitionSummary(exhibitionId);
        if (!summary) {
          res.status(404).json({ error: 'Không tìm thấy triển lãm.' });
          return;
        }
        const targetVersionId =
          (typeof body.versionId === 'string' && body.versionId.trim()) ||
          summary.latestDraftVersionId ||
          summary.activeVersionId;
        if (!targetVersionId) {
          res.status(404).json({ error: 'Không tìm thấy phiên bản triển lãm để xuất bản.' });
          return;
        }
        const currentDetail = exhibitionService.getVersionDetail(targetVersionId, {
          includeHidden: true,
        });
        if (!currentDetail || currentDetail.exhibitionId !== exhibitionId) {
          res.status(404).json({ error: 'Không tìm thấy phiên bản triển lãm.' });
          return;
        }
        // Automatically consolidate sparse zones (<= 3 booths/zone) before publishing
        try {
          exhibitionService.consolidateSparseZones(exhibitionId, targetVersionId, {
            sparseThreshold: 3,
            maxBoothsPerZone: 10,
          });
        } catch {
          // ignore if consolidation not applicable
        }
        const refreshedBeforePublish =
          exhibitionService.getVersionDetail(targetVersionId, { includeHidden: true }) || currentDetail;
        const version =
          refreshedBeforePublish.status === 'published'
            ? refreshedBeforePublish
            : exhibitionService.publishVersion(exhibitionId, targetVersionId);
        invalidatePublishedWorldCache();
        onLayoutPublished?.(version);
        void audioCacheService.syncVersionAudioIncremental(version, 20).catch(() => { });
        if (!process.env.VITEST) {
          void mirrorMissingProductImagesInBackground().catch(() => { });
        }
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

  // ============================================================================
  // PHASE 4 — SERVER-VERIFIED VISITOR JOURNEY TRACKING (HARDENED)
  // ============================================================================
  const StartBoothEngagementBodySchema = z.object({
    versionId: z.string().trim().min(1).max(120).optional(),
    boothId: z.string().trim().min(1, 'Thiếu mã gian hàng').max(120),
  });

  const RecordBoothVisitBodySchema = z.object({
    versionId: z.string().trim().min(1).max(120).optional(),
    boothId: z.string().trim().min(1, 'Thiếu mã gian hàng').max(120),
    interactionType: z.enum(['booth_focus', 'product_inspect', 'npc_consult']),
    engagementToken: z.string().trim().min(10, 'Thiếu mã phiên tương tác gian hàng').max(120).optional(),
    avatarX: z.number().finite().optional(),
    avatarZ: z.number().finite().optional(),
  });

  router.post('/visitor/session', (req: Request, res: Response) => {
    try {
      const existingToken =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : undefined;
      const session = visitorJourneyService.ensureSession(existingToken);
      res.status(session.resumed ? 200 : 201).json(session);
    } catch (err) {
      res.status(getHttpStatus(err, 500)).json({ error: (err as Error).message });
    }
  });

  router.get('/visitor/journey', (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : '';
      const versionId =
        typeof req.query.versionId === 'string' && req.query.versionId.trim()
          ? req.query.versionId.trim()
          : undefined;
      const journey = visitorJourneyService.getJourney(token, versionId);
      res.json(journey);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/visitor/visits/engage', (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : '';
      const parsed = StartBoothEngagementBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dữ liệu bắt đầu tương tác gian hàng không hợp lệ.',
        });
        return;
      }
      const result = visitorJourneyService.startEngagement({
        visitorToken: token,
        versionId: parsed.data.versionId,
        boothId: parsed.data.boothId,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/visitor/visits', (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : '';
      const parsed = RecordBoothVisitBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dữ liệu ghi nhận tham quan không hợp lệ.',
        });
        return;
      }
      const result = visitorJourneyService.recordVisit({
        visitorToken: token,
        versionId: parsed.data.versionId,
        boothId: parsed.data.boothId,
        interactionType: parsed.data.interactionType,
        engagementToken: parsed.data.engagementToken,
      });
      res.status(result.recorded ? 201 : 200).json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  // ============================================================================
  // PHASE 5 — VISITOR REWARDS REDEMPTION & ADMIN VERIFICATION
  // ============================================================================
  const SubmitRedemptionBodySchema = z.object({
    versionId: z.string().trim().min(1).max(120).optional(),
    recipientName: z.string().trim().min(2, 'Vui lòng nhập tên người nhận').max(120),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: z.string().trim().max(150).optional(),
    consentAccepted: z.boolean(),
  });

  const ReviewRedemptionBodySchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().max(350).optional(),
  });

  const FulfillRedemptionBodySchema = z.object({
    note: z.string().trim().max(350).optional(),
  });

  router.get('/visitor/reward-status', (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : '';
      const versionId =
        typeof req.query.versionId === 'string' && req.query.versionId.trim()
          ? req.query.versionId.trim()
          : undefined;
      const status = rewardRedemptionService.getVisitorRewardStatus(token, versionId);
      res.json(status);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/visitor/redemptions', (req: Request, res: Response) => {
    try {
      const token =
        typeof req.headers['x-visitor-token'] === 'string'
          ? req.headers['x-visitor-token'].trim()
          : '';
      const parsed = SubmitRedemptionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dữ liệu đăng ký nhận quà không hợp lệ.',
        });
        return;
      }
      const result = rewardRedemptionService.submitRedemption({
        visitorToken: token,
        versionId: parsed.data.versionId,
        recipientName: parsed.data.recipientName,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail,
        consentAccepted: parsed.data.consentAccepted,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/admin/reward-policy', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const versionId =
        typeof req.query.versionId === 'string' && req.query.versionId.trim()
          ? req.query.versionId.trim()
          : undefined;
      const result = rewardRedemptionService.getAdminPolicy(versionId);
      res.json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.put('/admin/reward-policy', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        versionId?: unknown;
        requiredUniqueBooths?: unknown;
        enabled?: unknown;
      };
      const versionId =
        typeof body.versionId === 'string' && body.versionId.trim()
          ? body.versionId.trim()
          : undefined;
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;
      const result = rewardRedemptionService.updatePolicy({
        versionId,
        requiredUniqueBooths: body.requiredUniqueBooths,
        enabled,
      });
      // Reuse existing Socket.IO layout_changed channel so live Visitors refresh reward policy without polling
      try {
        const activeWorld = exhibitionService.getActiveExhibitionWorld();
        if (activeWorld && activeWorld.versionId === result.versionId) {
          onLayoutPublished?.(activeWorld);
        }
      } catch {
        // ignore non-blocking broadcast error
      }
      res.json(result);
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/admin/redemptions', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const redemptions = rewardRedemptionService.listRedemptionsForAdmin({ versionId, status });
      res.json({ redemptions });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.get('/admin/redemptions/:id', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const detail = rewardRedemptionService.getRedemptionDetailForAdmin(getParam(req.params.id));
      res.json({ redemption: detail });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/admin/redemptions/:id/review', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const parsed = ReviewRedemptionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Dữ liệu duyệt yêu cầu không hợp lệ.',
        });
        return;
      }
      const adminUsername = String(res.locals.adminUsername || 'admin');
      const updated = rewardRedemptionService.reviewRedemption(getParam(req.params.id), {
        decision: parsed.data.decision,
        rejectionReason: parsed.data.rejectionReason,
        adminUsername,
      });
      res.json({ redemption: updated });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.post('/admin/redemptions/:id/fulfill', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const parsed = FulfillRedemptionBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Ghi chú trao quà không hợp lệ.' });
        return;
      }
      const adminUsername = String(res.locals.adminUsername || 'admin');
      const updated = rewardRedemptionService.fulfillRedemption(getParam(req.params.id), {
        note: parsed.data.note,
        adminUsername,
      });
      res.json({ redemption: updated });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  return router;
}
