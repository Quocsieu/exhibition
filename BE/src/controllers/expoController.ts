import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateBoothInputSchema,
  UpdateBoothInputSchema,
  CreateProductInputSchema,
  UpdateProductInputSchema,
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

export class ExpoController {
  constructor(private readonly service: ExpoService) {}

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
    res.json({ booth, products });
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
    res.json({ booth: updated });
  };

  deleteBooth = (req: Request, res: Response): void => {
    const deleted = this.service.deleteBooth(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng để xóa.' });
      return;
    }
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
}
