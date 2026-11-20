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
import { fetchExternalProductHtml, extractProductFromHtml } from '../integrations/productAdapter.js';
import { z } from 'zod';

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
  onLayoutPublished?: (version: ExhibitionVersionDetail) => void
): Router {
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
      res.json({ assignment });
    } catch (err) {
      res.status(getHttpStatus(err, 400)).json({ error: (err as Error).message });
    }
  });

  router.delete('/booths/:id/slots/:slotId', requireAdminAuth, (req: Request, res: Response) => {
    v28Db.clearBoothSlot(getParam(req.params.id), getParam(req.params.slotId));
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
  // D. URL PRODUCT IMPORT COMPATIBILITY (REUSES SSRF-SAFE productAdapter.ts)
  // ============================================================================
  router.post('/imports/url', requireAdminAuth, async (req: Request, res: Response) => {
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

    try {
      const { html, finalUrl } = await fetchExternalProductHtml(parsed.data.url);
      const draft = extractProductFromHtml(html, finalUrl);
      if (!parsed.data.saveToCatalog) {
        res.json({ draft, saved: false });
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
    try {
      const version = exhibitionService.createDraftVersion(getParam(req.params.id), parsed.data);
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

  return router;
}
