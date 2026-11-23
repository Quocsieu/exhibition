import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import type { V28CatalogDatabase } from '../database/v28Database.js';
import {
  ExcelProductRowSchema,
  type ExcelDuplicateStrategy,
  type ExcelProductRow,
  type ExcelRowValidationItem,
  type ImportJobReport,
} from '../schemas/v28Schemas.js';

export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_EXCEL_DATA_ROWS = 1_000;
const PREVIEW_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface PendingPreviewJob {
  jobId: string;
  companyId: string;
  adminUsername: string;
  filename: string;
  expiresAt: number;
  committed: boolean;
  rows: ExcelRowValidationItem[];
}

export interface ExcelPreviewResponse {
  jobId: string;
  previewToken: string;
  expiresAt: string;
  companyId: string;
  filename: string;
  summary: {
    totalRows: number;
    validCount: number;
    duplicateInFileCount: number;
    duplicateInDbCount: number;
    errorCount: number;
  };
  rows: ExcelRowValidationItem[];
}

function getPreviewSigningSecret(): string {
  return process.env.ADMIN_TOKEN_SECRET || 'virtual-expo-v28-excel-preview-secret';
}

function signPreviewToken(payload: {
  jobId: string;
  companyId: string;
  adminUsername: string;
  exp: number;
}): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getPreviewSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyPreviewToken(token: string): {
  valid: boolean;
  expired?: boolean;
  payload?: { jobId: string; companyId: string; adminUsername: string; exp: number };
} {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false };
  }
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return { valid: false };

  const expected = crypto
    .createHmac('sha256', getPreviewSigningSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      jobId?: string;
      companyId?: string;
      adminUsername?: string;
      exp?: number;
    };
    if (
      typeof decoded.jobId !== 'string' ||
      typeof decoded.companyId !== 'string' ||
      typeof decoded.adminUsername !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return { valid: false };
    }
    if (Date.now() > decoded.exp) {
      return { valid: false, expired: true };
    }
    return {
      valid: true,
      payload: {
        jobId: decoded.jobId,
        companyId: decoded.companyId,
        adminUsername: decoded.adminUsername,
        exp: decoded.exp,
      },
    };
  } catch {
    return { valid: false };
  }
}

function isZipMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_ALIASES: Record<string, keyof ExcelProductRow | 'inStock'> = {
  name: 'name',
  ten: 'name',
  ten_san_pham: 'name',
  product_name: 'name',
  sku: 'sku',
  ma_sku: 'sku',
  ma_sp: 'sku',
  ma_san_pham: 'sku',
  price: 'price',
  gia: 'price',
  gia_ban: 'price',
  currency: 'currency',
  tien_te: 'currency',
  don_vi_tien: 'currency',
  description: 'description',
  mo_ta: 'description',
  image_url: 'imageUrl',
  image: 'imageUrl',
  hinh_anh: 'imageUrl',
  anh_san_pham: 'imageUrl',
  source_url: 'sourceUrl',
  url: 'sourceUrl',
  link_san_pham: 'sourceUrl',
  contact_url: 'contactUrl',
  lien_he: 'contactUrl',
  in_stock: 'inStock',
  con_hang: 'inStock',
};

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.hyperlink === 'string') return obj.hyperlink.trim();
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((r) => r.text || '').join('').trim();
    }
    if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
  }
  return String(val).trim();
}

export class V28ExcelImportService {
  private pendingJobs = new Map<string, PendingPreviewJob>();

  constructor(private readonly db: V28CatalogDatabase) {}

  private pruneExpiredJobs(): void {
    const now = Date.now();
    for (const [id, job] of this.pendingJobs.entries()) {
      if (job.expiresAt < now - 5 * 60 * 1000) {
        this.pendingJobs.delete(id);
      }
    }
  }

  /**
   * Step 1–3: Parse, validate, detect in-file & DB duplicates, and issue a signed Preview Token.
   * NEVER writes to the database.
   */
  async createPreview(options: {
    companyId: string;
    adminUsername: string;
    filename: string;
    fileBuffer: Buffer;
    ttlMs?: number;
  }): Promise<ExcelPreviewResponse> {
    this.pruneExpiredJobs();

    const company = this.db.getCompanyById(options.companyId);
    if (!company) {
      const err = new Error(`Không tìm thấy doanh nghiệp '${options.companyId}'.`) as Error & {
        statusCode?: number;
      };
      err.statusCode = 404;
      throw err;
    }
    if (company.status !== 'active') {
      const err = new Error('Doanh nghiệp đang bị vô hiệu hóa, không thể import sản phẩm.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
      const err = new Error('Tệp Excel trống hoặc không hợp lệ.') as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (options.fileBuffer.length > MAX_EXCEL_FILE_BYTES) {
      const err = new Error(
        `Dung lượng tệp vượt quá giới hạn tối đa ${MAX_EXCEL_FILE_BYTES / (1024 * 1024)} MB.`
      ) as Error & { statusCode?: number };
      err.statusCode = 413;
      throw err;
    }
    // Never trust extension or MIME type alone — inspect ZIP/XLSX magic bytes
    if (!isZipMagicBytes(options.fileBuffer)) {
      const err = new Error(
        'Định dạng tệp không hợp lệ. Chỉ chấp nhận tệp Excel .xlsx đúng cấu trúc.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(options.fileBuffer as unknown as ExcelJS.Buffer);
    } catch {
      const err = new Error('Không thể đọc tệp Excel — tệp bị hỏng hoặc không đúng chuẩn .xlsx.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      const err = new Error('Sheet Excel trống hoặc chưa có dòng dữ liệu sản phẩm.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    // Parse header row (row 1)
    const headerRow = sheet.getRow(1);
    const colMap = new Map<number, string>();
    headerRow.eachCell((cell, colNumber) => {
      const key = normalizeHeaderKey(cellToString(cell.value));
      const mapped = HEADER_ALIASES[key];
      if (mapped) {
        colMap.set(colNumber, mapped);
      }
    });

    if (![...colMap.values()].includes('name') || ![...colMap.values()].includes('sku')) {
      const err = new Error(
        'Thiếu cột bắt buộc trong dòng tiêu đề Excel (cần ít nhất các cột: name, sku, price).'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const dataRowCount = sheet.rowCount - 1;
    if (dataRowCount > MAX_EXCEL_DATA_ROWS) {
      const err = new Error(
        `Số dòng dữ liệu (${dataRowCount}) vượt quá giới hạn tối đa ${MAX_EXCEL_DATA_ROWS} dòng/lần import.`
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const rows: ExcelRowValidationItem[] = [];
    const seenSkusInFile = new Set<string>();
    let validCount = 0;
    let duplicateInFileCount = 0;
    let duplicateInDbCount = 0;
    let errorCount = 0;

    for (let r = 2; r <= sheet.rowCount; r++) {
      const excelRow = sheet.getRow(r);
      const raw: Record<string, string> = {};
      let hasAnyValue = false;
      colMap.forEach((field, colNum) => {
        const val = cellToString(excelRow.getCell(colNum).value);
        if (val !== '') hasAnyValue = true;
        raw[field] = val;
      });
      if (!hasAnyValue) continue;

      const rawPrice = (raw.price || '').replace(/[,_\s]/g, '');
      const parsedPrice = rawPrice === '' ? Number.NaN : Number(rawPrice);
      const parsedInStock =
        raw.inStock === undefined || raw.inStock === ''
          ? true
          : !['0', 'false', 'no', 'het', 'hết'].includes(raw.inStock.toLowerCase());

      const candidate = {
        name: raw.name || '',
        sku: raw.sku || '',
        price: parsedPrice,
        currency: (raw.currency || 'VND').toUpperCase(),
        description: raw.description || '',
        imageUrl: raw.imageUrl || '',
        sourceUrl: raw.sourceUrl || '',
        contactUrl: raw.contactUrl || '',
        inStock: parsedInStock,
      };

      const parsed = ExcelProductRowSchema.safeParse(candidate);
      if (!parsed.success) {
        const errs = parsed.error.issues.map((i) => i.message);
        rows.push({ rowNumber: r, status: 'error', errors: errs, raw });
        errorCount++;
        continue;
      }

      const normSku = parsed.data.sku.trim().toLowerCase();
      if (seenSkusInFile.has(normSku)) {
        rows.push({
          rowNumber: r,
          status: 'duplicate_in_file',
          errors: [`Trùng mã SKU '${parsed.data.sku}' ngay trong tệp Excel.`],
          data: parsed.data,
          raw,
        });
        duplicateInFileCount++;
        continue;
      }
      seenSkusInFile.add(normSku);

      const existing = this.db.findProductByCompanyAndSku(options.companyId, parsed.data.sku);
      if (existing) {
        rows.push({
          rowNumber: r,
          status: 'duplicate_in_db',
          errors: [`Mã SKU '${parsed.data.sku}' đã tồn tại trong kho sản phẩm của doanh nghiệp.`],
          existingProductId: existing.id,
          data: parsed.data,
          raw,
        });
        duplicateInDbCount++;
        continue;
      }

      rows.push({
        rowNumber: r,
        status: 'valid',
        errors: [],
        data: parsed.data,
        raw,
      });
      validCount++;
    }

    const jobId = `imp-${crypto.randomUUID().slice(0, 10)}`;
    const ttl = options.ttlMs ?? PREVIEW_TTL_MS;
    const expiresAt = Date.now() + ttl;
    const previewToken = signPreviewToken({
      jobId,
      companyId: options.companyId,
      adminUsername: options.adminUsername,
      exp: expiresAt,
    });

    this.pendingJobs.set(jobId, {
      jobId,
      companyId: options.companyId,
      adminUsername: options.adminUsername,
      filename: options.filename || 'import.xlsx',
      expiresAt,
      committed: false,
      rows,
    });

    return {
      jobId,
      previewToken,
      expiresAt: new Date(expiresAt).toISOString(),
      companyId: options.companyId,
      filename: options.filename || 'import.xlsx',
      summary: {
        totalRows: rows.length,
        validCount,
        duplicateInFileCount,
        duplicateInDbCount,
        errorCount,
      },
      rows,
    };
  }

  /**
   * Step 4–5: Commit a validated preview job inside a single SQLite transaction.
   * Enforces signed token verification, TTL expiry, admin/company match, single-use
   * double-submit protection, and live duplicate re-check at commit time.
   */
  commitPreview(options: {
    previewToken: string;
    adminUsername: string;
    duplicateStrategy: ExcelDuplicateStrategy;
    simulateFailureAtRow?: number; // Test-only hook for transaction rollback verification
  }): ImportJobReport {
    const t0 = Date.now();
    const verified = verifyPreviewToken(options.previewToken);
    if (!verified.valid || !verified.payload) {
      const err = new Error(
        verified.expired
          ? 'Preview token đã hết hạn. Vui lòng tải lại tệp Excel để xem trước.'
          : 'Preview token không hợp lệ hoặc đã bị chỉnh sửa.'
      ) as Error & { statusCode?: number };
      err.statusCode = verified.expired ? 410 : 400;
      throw err;
    }

    const { jobId, companyId, adminUsername } = verified.payload;
    if (adminUsername !== options.adminUsername) {
      const err = new Error('Preview token không thuộc phiên quản trị hiện tại.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 403;
      throw err;
    }

    const job = this.pendingJobs.get(jobId);
    if (!job || job.companyId !== companyId) {
      const err = new Error('Không tìm thấy phiên xem trước import hoặc phiên đã hết hạn.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 404;
      throw err;
    }
    if (job.committed) {
      const err = new Error('Phiên import này đã được xác nhận ghi dữ liệu trước đó (chặn commit 2 lần).') as Error & {
        statusCode?: number;
      };
      err.statusCode = 409;
      throw err;
    }

    const company = this.db.getCompanyById(companyId);
    if (!company || company.status !== 'active') {
      const err = new Error('Doanh nghiệp không tồn tại hoặc đã bị vô hiệu hóa.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const committedProductIds: string[] = [];
    const errors: Array<{ rowNumber: number; sku?: string; reason: string }> = [];

    this.db.runInTransaction(() => {
      for (const row of job.rows) {
        if (options.simulateFailureAtRow && row.rowNumber === options.simulateFailureAtRow) {
          throw new Error(`Simulated transaction failure at row ${row.rowNumber}`);
        }

        if (row.status === 'error' || !row.data) {
          failedCount++;
          errors.push({
            rowNumber: row.rowNumber,
            sku: row.raw?.sku,
            reason: row.errors.join('; ') || 'Dữ liệu không hợp lệ',
          });
          continue;
        }

        if (row.status === 'duplicate_in_file') {
          skippedCount++;
          errors.push({
            rowNumber: row.rowNumber,
            sku: row.data.sku,
            reason: 'Bỏ qua: trùng mã SKU trong cùng tệp Excel (không tự ý sinh SKU giả).',
          });
          continue;
        }

        // Re-check live DB at commit time to handle concurrent edits between preview and commit
        const liveExisting = this.db.findProductByCompanyAndSku(companyId, row.data.sku);
        if (liveExisting) {
          if (options.duplicateStrategy === 'skip') {
            skippedCount++;
            committedProductIds.push(liveExisting.id);
            continue;
          }
          if (options.duplicateStrategy === 'update') {
            this.db.updateProduct(liveExisting.id, {
              name: row.data.name,
              price: row.data.price,
              currency: row.data.currency,
              description: row.data.description,
              images: row.data.imageUrl ? [row.data.imageUrl] : liveExisting.images,
              sourceUrl: row.data.sourceUrl || liveExisting.sourceUrl,
              contactUrl: row.data.contactUrl || liveExisting.contactUrl,
              inStock: row.data.inStock,
            });
            updatedCount++;
            committedProductIds.push(liveExisting.id);
            continue;
          }
          // Strategy === 'create': unique SKU constraint MUST NOT be bypassed by fabricating fake SKUs
          failedCount++;
          errors.push({
            rowNumber: row.rowNumber,
            sku: row.data.sku,
            reason: `Không thể tạo mới: mã SKU '${row.data.sku}' đã tồn tại (vi phạm unique SKU theo doanh nghiệp).`,
          });
          continue;
        }

        const createdProd = this.db.createProduct({
          companyId,
          boothId: null,
          name: row.data.name,
          sku: row.data.sku,
          price: row.data.price,
          currency: row.data.currency,
          description: row.data.description,
          images: row.data.imageUrl ? [row.data.imageUrl] : [],
          videoUrl: '',
          modelUrl: '',
          sourceUrl: row.data.sourceUrl,
          contactUrl: row.data.contactUrl || '',
          inStock: row.data.inStock ?? true,
          status: 'active',
        });
        createdCount++;
        committedProductIds.push(createdProd.id);
      }

      const report: ImportJobReport = {
        jobId,
        companyId,
        sourceType: 'excel',
        filename: job.filename,
        status: 'committed',
        duplicateStrategy: options.duplicateStrategy,
        totalRows: job.rows.length,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        durationMs: Math.max(1, Date.now() - t0),
        errors,
        createdAt: new Date().toISOString(),
      };
      this.db.saveImportJobReport(report);
    });

    job.committed = true;
    const saved = this.db.getImportJobReport(jobId)!;
    return { ...saved, productIds: committedProductIds };
  }

  formatErrorsCsv(report: ImportJobReport): string {
    const escapeCsv = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = 'row_number,sku,reason';
    const lines = report.errors.map(
      (e) => `${e.rowNumber},${escapeCsv(e.sku || '')},${escapeCsv(e.reason)}`
    );
    return [header, ...lines].join('\n');
  }
}
