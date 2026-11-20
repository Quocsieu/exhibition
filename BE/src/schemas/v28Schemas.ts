import { z } from 'zod';

export const EntityStatusSchema = z.enum(['active', 'inactive']);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

export const BoothLifecycleStatusSchema = z.enum(['active', 'archived']);
export type BoothLifecycleStatus = z.infer<typeof BoothLifecycleStatusSchema>;

const OptionalHttpUrlSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const u = new URL(val);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL phải bắt đầu bằng http:// hoặc https://' }
  )
  .default('');

export const CompanySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(2, 'Tên doanh nghiệp tối thiểu 2 ký tự').max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang'),
  description: z.string().max(4000).default(''),
  category: z.string().trim().min(1).max(100).default('General'),
  logoUrl: OptionalHttpUrlSchema,
  bannerUrl: OptionalHttpUrlSchema,
  contactEmail: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Email liên hệ không hợp lệ',
    })
    .default(''),
  contactUrl: OptionalHttpUrlSchema,
  status: EntityStatusSchema.default('active'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Company = z.infer<typeof CompanySchema>;

export const CreateCompanyInputSchema = z.object({
  name: z.string().trim().min(2, 'Tên doanh nghiệp tối thiểu 2 ký tự').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang')
    .optional(),
  description: z.string().max(4000).optional().default(''),
  category: z.string().trim().min(1).max(100).optional().default('General'),
  logoUrl: OptionalHttpUrlSchema.optional().default(''),
  bannerUrl: OptionalHttpUrlSchema.optional().default(''),
  contactEmail: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Email liên hệ không hợp lệ',
    })
    .optional()
    .default(''),
  contactUrl: OptionalHttpUrlSchema.optional().default(''),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;

export const UpdateCompanyInputSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(4000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  logoUrl: OptionalHttpUrlSchema.optional(),
  bannerUrl: OptionalHttpUrlSchema.optional(),
  contactEmail: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Email liên hệ không hợp lệ',
    })
    .optional(),
  contactUrl: OptionalHttpUrlSchema.optional(),
  status: EntityStatusSchema.optional(),
});

export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInputSchema>;

export interface V28Product {
  id: string;
  companyId: string;
  boothId: string | null;
  name: string;
  sku: string;
  price: number;
  currency: string;
  description: string;
  images: string[];
  videoUrl: string;
  modelUrl: string;
  sourceUrl: string;
  contactUrl: string;
  inStock: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export const CreateV28ProductInputSchema = z.object({
  companyId: z.string().trim().min(1, 'Bắt buộc chọn doanh nghiệp').max(80),
  boothId: z.string().trim().max(80).nullable().optional().default(null),
  name: z.string().trim().min(2, 'Tên sản phẩm tối thiểu 2 ký tự').max(200),
  sku: z.string().trim().max(100).optional().default(''),
  price: z.number().finite().nonnegative('Giá sản phẩm không được âm'),
  currency: z.string().trim().min(1).max(10).optional().default('VND'),
  description: z.string().max(5000).optional().default(''),
  images: z.array(OptionalHttpUrlSchema).max(10).optional().default([]),
  videoUrl: OptionalHttpUrlSchema.optional().default(''),
  modelUrl: z.string().trim().max(500).optional().default(''),
  sourceUrl: OptionalHttpUrlSchema.optional().default(''),
  contactUrl: OptionalHttpUrlSchema.optional().default(''),
  inStock: z.boolean().optional().default(true),
  status: EntityStatusSchema.optional().default('active'),
});

export type CreateV28ProductInput = z.infer<typeof CreateV28ProductInputSchema>;

export const UpdateV28ProductInputSchema = z.object({
  boothId: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(2).max(200).optional(),
  sku: z.string().trim().max(100).optional(),
  price: z.number().finite().nonnegative('Giá sản phẩm không được âm').optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  description: z.string().max(5000).optional(),
  images: z.array(OptionalHttpUrlSchema).max(10).optional(),
  videoUrl: OptionalHttpUrlSchema.optional(),
  modelUrl: z.string().trim().max(500).optional(),
  sourceUrl: OptionalHttpUrlSchema.optional(),
  contactUrl: OptionalHttpUrlSchema.optional(),
  inStock: z.boolean().optional(),
  status: EntityStatusSchema.optional(),
});

export type UpdateV28ProductInput = z.infer<typeof UpdateV28ProductInputSchema>;

export const ExcelDuplicateStrategySchema = z.enum(['skip', 'update', 'create']);
export type ExcelDuplicateStrategy = z.infer<typeof ExcelDuplicateStrategySchema>;

export const ExcelProductRowSchema = z.object({
  name: z.string().trim().min(2, 'Thiếu hoặc tên sản phẩm quá ngắn (<2 ký tự)').max(200),
  sku: z.string().trim().min(1, 'Thiếu mã SKU').max(100),
  price: z.number().finite('Giá không hợp lệ').nonnegative('Giá sản phẩm không được âm'),
  currency: z.string().trim().min(1).max(10).default('VND'),
  description: z.string().max(5000).default(''),
  imageUrl: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'image_url không phải URL http(s) hợp lệ' }
    )
    .default(''),
  sourceUrl: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'source_url không phải URL http(s) hợp lệ' }
    )
    .default(''),
  contactUrl: OptionalHttpUrlSchema.optional().default(''),
  inStock: z.boolean().optional().default(true),
});

export type ExcelProductRow = z.infer<typeof ExcelProductRowSchema>;

export interface ExcelRowValidationItem {
  rowNumber: number;
  status: 'valid' | 'duplicate_in_file' | 'duplicate_in_db' | 'error';
  errors: string[];
  existingProductId?: string;
  data?: ExcelProductRow;
  raw?: Record<string, string>;
}

export interface ImportJobReport {
  jobId: string;
  companyId: string;
  sourceType: 'excel' | 'url';
  filename: string;
  status: 'committed' | 'failed';
  duplicateStrategy: ExcelDuplicateStrategy;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  errors: Array<{ rowNumber: number; sku?: string; reason: string }>;
  createdAt: string;
}

export const V28UrlImportInputSchema = z.object({
  companyId: z.string().trim().min(1, 'Bắt buộc chọn doanh nghiệp'),
  boothId: z.string().trim().nullable().optional().default(null),
  url: z.string().trim().url('URL sản phẩm không hợp lệ'),
  saveToCatalog: z.boolean().optional().default(true),
});

// ============================================================================
// PHASE 2: DYNAMIC EXHIBITIONS, VERSIONS, ZONES & BOOTH PLACEMENTS
// ============================================================================
export const V28ArchetypeIdSchema = z.enum([
  'signature_ring',
  'organic_flow',
  'grand_portal',
  'wave_pavilion',
  'gallery_arch',
  'dynamic_frame',
]);

export const ExhibitionVersionStatusSchema = z.enum(['draft', 'published', 'archived']);
export type ExhibitionVersionStatus = z.infer<typeof ExhibitionVersionStatusSchema>;

export const CreateExhibitionInputSchema = z.object({
  name: z.string().trim().min(2, 'Tên triển lãm tối thiểu 2 ký tự').max(140),
  targetBoothCount: z.number().int().min(1).max(200).optional().default(20),
  preferredZoneCapacity: z.number().int().min(4).max(50).optional().default(10),
});

export const CreateDraftLayoutInputSchema = z.object({
  targetBoothCount: z.number().int().min(1, 'Tối thiểu 1 gian hàng').max(200, 'Tối đa 200 gian hàng'),
  preferredZoneCapacity: z.number().int().min(4).max(50).optional().default(10),
  hallStyle: z.enum(['grand_expo', 'modular_pavilion']).optional().default('grand_expo'),
  mainAvenueWidth: z.number().min(8).max(20).optional().default(10),
  aisleWidth: z.number().min(7.6).max(16).optional().default(8.4),
  perimeterWidth: z.number().min(5).max(15).optional().default(6),
  layoutSeed: z.number().int().min(0).max(9999).optional().default(28),
  baseVersionId: z.string().trim().optional(),
});

export const UpdateZoneInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Tên khu không được trống').max(100).optional(),
  categoryTag: z.string().trim().max(100).optional(),
});

export const UpdateDraftBoothPlacementInputSchema = z.object({
  positionX: z.number().finite().optional(),
  positionZ: z.number().finite().optional(),
  rotationY: z.number().finite().optional(),
  archetypeId: V28ArchetypeIdSchema.optional(),
  companyId: z.string().trim().min(1).optional(),
  zoneId: z.string().trim().min(1).optional(),
  boothName: z.string().trim().min(2).max(120).optional(),
});

export const RollbackVersionInputSchema = z.object({
  targetVersionId: z.string().trim().min(1, 'Thiếu targetVersionId'),
});

export function slugifyCompanyName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'company';
}
