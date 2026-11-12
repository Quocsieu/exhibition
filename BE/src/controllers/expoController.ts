import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateBoothInputSchema,
  UpdateBoothInputSchema,
  CreateProductInputSchema,
  UpdateProductInputSchema,
  AssignSlotBodySchema,
} from '../schemas/expoSchemas.js';
import type { ExpoService } from '../services/expoService.js';
import {
  authenticateAdminCredentials,
  verifyAdminToken,
} from '../middleware/adminAuth.js';

const ExtractUrlBodySchema = z.object({
  url: z.string().min(4).max(2048),
});

const BatchImportBodySchema = z.object({
  boothId: z.string().min(1),
  format: z.enum(['json', 'csv']),
  content: z.string().min(2).max(500_000),
});

export type DataMutationCallback = (payload: {
  entityType: 'booth' | 'product' | 'slot' | 'all';
  entityId?: string;
  boothId?: string;
}) => void;

export class ExpoController {
  constructor(
    private readonly service: ExpoService,
    private readonly onMutation?: DataMutationCallback
  ) {}

  // Admin Auth
  loginAdmin = (req: Request, res: Response): void => {
    const { username, password } = req.body || {};
    const token = authenticateAdminCredentials(username, password);
    if (!token) {
      res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu quản trị.' });
      return;
    }
    res.json({ token, username });
  };

  verifyAdmin = (req: Request, res: Response): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ authenticated: false });
      return;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const verified = verifyAdminToken(token);
    if (!verified.valid) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, username: verified.username });
  };

  // Booths
  listBooths = (_req: Request, res: Response): void => {
    res.json({ booths: this.service.listBooths() });
  };

  getBooth = (req: Request, res: Response): void => {
    const id = String(req.params.id);
    const booth = this.service.getBoothById(id);
    if (!booth) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng.' });
      return;
    }
    const products = this.service.listProducts(booth.id);
    const slots = this.service.getBoothSlots(booth.id);
    res.json({ booth, products, slots });
  };

  createBooth = (req: Request, res: Response): void => {
    const parsed = CreateBoothInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu gian hàng không hợp lệ.',
        issues: parsed.error.issues,
      });
      return;
    }
    try {
      const booth = this.service.createBooth(parsed.data);
      this.onMutation?.({ entityType: 'booth', entityId: booth.id, boothId: booth.id });
      res.status(201).json({ booth });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Không thể tạo gian hàng.',
      });
    }
  };

  updateBooth = (req: Request, res: Response): void => {
    const parsed = UpdateBoothInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ.',
        issues: parsed.error.issues,
      });
      return;
    }
    const updated = this.service.updateBooth(String(req.params.id), parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng để cập nhật.' });
      return;
    }
    this.onMutation?.({ entityType: 'booth', entityId: updated.id, boothId: updated.id });
    res.json({ booth: updated });
  };

  deleteBooth = (req: Request, res: Response): void => {
    const deleted = this.service.deleteBooth(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng để xóa.' });
      return;
    }
    this.onMutation?.({ entityType: 'booth', entityId: String(req.params.id) });
    res.json({ success: true });
  };

  // Products
  listProducts = (req: Request, res: Response): void => {
    const boothId = typeof req.query.boothId === 'string' ? req.query.boothId : undefined;
    res.json({ products: this.service.listProducts(boothId) });
  };

  getProduct = (req: Request, res: Response): void => {
    const product = this.service.getProductById(String(req.params.id));
    if (!product) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      return;
    }
    res.json({ product });
  };

  createProduct = (req: Request, res: Response): void => {
    const parsed = CreateProductInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu sản phẩm không hợp lệ.',
        issues: parsed.error.issues,
      });
      return;
    }
    try {
      const product = this.service.createProduct(parsed.data);
      this.onMutation?.({ entityType: 'product', entityId: product.id, boothId: product.boothId });
      res.status(201).json({ product });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Không thể tạo sản phẩm.',
      });
    }
  };

  updateProduct = (req: Request, res: Response): void => {
    const parsed = UpdateProductInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu cập nhật sản phẩm không hợp lệ.',
        issues: parsed.error.issues,
      });
      return;
    }
    try {
      const updated = this.service.updateProduct(String(req.params.id), parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Không tìm thấy sản phẩm để cập nhật.' });
        return;
      }
      this.onMutation?.({ entityType: 'product', entityId: updated.id, boothId: updated.boothId });
      res.json({ product: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Không thể cập nhật sản phẩm.',
      });
    }
  };

  deleteProduct = (req: Request, res: Response): void => {
    const deleted = this.service.deleteProduct(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm để xóa.' });
      return;
    }
    this.onMutation?.({ entityType: 'product', entityId: String(req.params.id) });
    res.json({ success: true });
  };

  // Integrations
  extractUrl = async (req: Request, res: Response): Promise<void> => {
    const parsed = ExtractUrlBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Vui lòng cung cấp URL hợp lệ.' });
      return;
    }
    try {
      const draft = await this.service.extractFromExternalUrl(parsed.data.url);
      res.json({ draft });
    } catch (err) {
      res.status(422).json({
        error:
          err instanceof Error
            ? err.message
            : 'Không thể trích xuất dữ liệu từ URL này. Vui lòng nhập thủ công hoặc dùng CSV/JSON.',
      });
    }
  };

  importBatch = (req: Request, res: Response): void => {
    const parsed = BatchImportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu import không hợp lệ.',
      });
      return;
    }

    const { boothId, format, content } = parsed.data;
    const booth = this.service.getBoothById(boothId);
    if (!booth) {
      res.status(404).json({ error: `Gian hàng '${boothId}' không tồn tại.` });
      return;
    }

    try {
      const created = this.service.importBatchProducts(boothId, format, content);
      this.onMutation?.({ entityType: 'product', boothId });
      res.status(201).json({
        importedCount: created.length,
        products: created,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Lỗi khi xử lý dữ liệu import.',
      });
    }
  };

  // Slots & Booth Slot Assignments
  listSlots = (req: Request, res: Response): void => {
    const boothId = typeof req.query.boothId === 'string' ? req.query.boothId : undefined;
    res.json({
      slotDefinitions: this.service.listSlotDefinitions(),
      assignments: this.service.listSlotAssignments(boothId),
    });
  };

  getBoothSlots = (req: Request, res: Response): void => {
    const boothId = String(req.params.id);
    const booth = this.service.getBoothById(boothId);
    if (!booth) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng.' });
      return;
    }
    const slots = this.service.getBoothSlots(boothId);
    res.json({
      booth,
      slotDefinitions: this.service.listSlotDefinitions(),
      slots,
    });
  };

  assignBoothSlot = (req: Request, res: Response): void => {
    const boothId = String(req.params.id);
    const slotId = String(req.params.slotId);
    const parsed = AssignSlotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dữ liệu gán sản phẩm vào slot không hợp lệ.',
        issues: parsed.error.issues,
      });
      return;
    }

    try {
      const rawProductId = parsed.data.productId;
      const updatedSlot =
        rawProductId === null || rawProductId.trim() === ''
          ? this.service.clearBoothSlot(boothId, slotId)
          : this.service.assignProductToSlot(boothId, slotId, rawProductId.trim());
      const slots = this.service.getBoothSlots(boothId);
      this.onMutation?.({ entityType: 'slot', entityId: slotId, boothId });
      res.json({
        slot: updatedSlot,
        slots,
      });
    } catch (err) {
      const status = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Không thể gán sản phẩm vào vị trí trưng bày.',
      });
    }
  };

  clearBoothSlot = (req: Request, res: Response): void => {
    const boothId = String(req.params.id);
    const slotId = String(req.params.slotId);
    try {
      const clearedSlot = this.service.clearBoothSlot(boothId, slotId);
      const slots = this.service.getBoothSlots(boothId);
      this.onMutation?.({ entityType: 'slot', entityId: slotId, boothId });
      res.json({
        slot: clearedSlot,
        slots,
      });
    } catch (err) {
      const status = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Không thể gỡ sản phẩm khỏi vị trí trưng bày.',
      });
    }
  };
}
