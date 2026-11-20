import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import { slugifyCompanyName } from '../../schemas/v28Schemas.js';

export const MAX_TESTED_PUBLISH_BOOTHS = 200;
export const RECOMMENDED_WARNING_BOOTHS = 100;

export interface V28Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface CategoryAllocationItem {
  categoryId: string;
  boothCount: number;
}

export interface CategoryAllocationPlan {
  targetBoothCount: number;
  allocatedTotal: number;
  mismatch: number;
  warnings: string[];
  canPublish: boolean;
  zones: Array<{
    code: string;
    categoryId: string;
    categoryName: string;
    displayName: string;
    boothCount: number;
    color: string;
  }>;
}

export class V28CategoryService {
  constructor(private readonly v28Db: V28CatalogDatabase) {}

  private get db() {
    return this.v28Db.getConnection();
  }

  public listCategories(): V28Category[] {
    const rows = this.db
      .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      description: String(r.description || ''),
      color: String(r.color || '#0ea5e9'),
      sortOrder: Number(r.sort_order || 1),
      createdAt: String(r.created_at || ''),
    }));
  }

  public createCategory(input: { name: string; description?: string; color?: string }): V28Category {
    const name = input.name.trim();
    if (name.length < 2) {
      throw Object.assign(new Error('Tên danh mục tối thiểu 2 ký tự.'), { statusCode: 400 });
    }
    const baseSlug = slugifyCompanyName(name);
    let slug = baseSlug;
    let suffix = 2;
    while (this.db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }
    const id = `cat-${crypto.randomBytes(4).toString('hex')}`;
    const maxOrder = Number(
      ((this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories').get() as { m: number })?.m) || 0
    );
    this.db
      .prepare(
        `INSERT INTO categories (id, name, slug, description, color, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(id, name, slug, (input.description || '').trim(), input.color || '#0ea5e9', maxOrder + 1);

    return this.listCategories().find((c) => c.id === id)!;
  }

  /**
   * Build category-based zone allocation plan:
   * - Default zone name formula: `Khu ${category.name}` (with sequential index if split into multiple physical zones).
   * - Never infers booth demand solely from product count; uses Admin's explicit allocation or balanced distribution.
   * - Warns when sum(allocations) != targetBoothCount or exceeds verified operational limits.
   */
  public planCategoryZones(
    targetBoothCount: number,
    allocations?: CategoryAllocationItem[],
    maxBoothsPerPhysicalZone = 20
  ): CategoryAllocationPlan {
    const categories = this.listCategories();
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const warnings: string[] = [];

    if (targetBoothCount > MAX_TESTED_PUBLISH_BOOTHS) {
      warnings.push(
        `Số gian (${targetBoothCount}) vượt quá giới hạn vận hành đã xác nhận (${MAX_TESTED_PUBLISH_BOOTHS} gian). Không cho phép Publish.`
      );
    } else if (targetBoothCount > RECOMMENDED_WARNING_BOOTHS) {
      warnings.push(
        `Số gian (${targetBoothCount}) vượt mức kiểm thử trình duyệt chuẩn (${RECOMMENDED_WARNING_BOOTHS} gian). Khuyến nghị kiểm tra hiệu năng trước khi mở rộng.`
      );
    }

    let resolvedAllocations: CategoryAllocationItem[];
    if (allocations && allocations.length > 0) {
      resolvedAllocations = allocations.filter((a) => a.boothCount > 0 && catMap.has(a.categoryId));
    } else {
      // Balanced distribution across available categories when Admin hasn't manually split
      const activeCats = categories.slice(0, Math.min(categories.length, Math.max(1, Math.ceil(targetBoothCount / 10))));
      const base = Math.floor(targetBoothCount / activeCats.length);
      let rem = targetBoothCount % activeCats.length;
      resolvedAllocations = activeCats.map((c) => {
        const extra = rem > 0 ? 1 : 0;
        if (rem > 0) rem--;
        return { categoryId: c.id, boothCount: base + extra };
      });
    }

    const allocatedTotal = resolvedAllocations.reduce((s, a) => s + a.boothCount, 0);
    const mismatch = targetBoothCount - allocatedTotal;
    if (mismatch !== 0) {
      warnings.push(
        `Tổng phân bổ danh mục (${allocatedTotal} gian) khác tổng số gian cấu hình (${targetBoothCount} gian, lệch ${mismatch > 0 ? `+${mismatch}` : mismatch}).`
      );
    }

    const zones: CategoryAllocationPlan['zones'] = [];
    let zoneIdx = 0;
    for (const alloc of resolvedAllocations) {
      const cat = catMap.get(alloc.categoryId)!;
      const splitCount = Math.max(1, Math.ceil(alloc.boothCount / maxBoothsPerPhysicalZone));
      let remaining = alloc.boothCount;
      for (let s = 0; s < splitCount; s++) {
        const count = Math.min(remaining, Math.ceil(remaining / (splitCount - s)));
        remaining -= count;
        const code = String.fromCharCode(65 + (zoneIdx % 26)) + (zoneIdx >= 26 ? String(Math.floor(zoneIdx / 26)) : '');
        const displayName = splitCount > 1 ? `Khu ${cat.name} ${s + 1}` : `Khu ${cat.name}`;
        zones.push({
          code,
          categoryId: cat.id,
          categoryName: cat.name,
          displayName,
          boothCount: count,
          color: cat.color,
        });
        zoneIdx++;
      }
    }

    return {
      targetBoothCount,
      allocatedTotal,
      mismatch,
      warnings,
      canPublish: targetBoothCount <= MAX_TESTED_PUBLISH_BOOTHS && mismatch === 0 && targetBoothCount >= 1,
      zones,
    };
  }

  /**
   * Duplicate URL import guard for a company's product catalog.
   */
  public findDuplicateProductBySourceUrl(companyId: string, sourceUrl: string): { id: string; name: string } | null {
    const normalized = sourceUrl.trim().replace(/\/+$/, '').toLowerCase();
    const rows = this.db
      .prepare('SELECT id, name, source_url FROM products WHERE company_id = ?')
      .all(companyId) as Array<{ id: string; name: string; source_url: string }>;
    for (const r of rows) {
      if (String(r.source_url || '').trim().replace(/\/+$/, '').toLowerCase() === normalized) {
        return { id: r.id, name: r.name };
      }
    }
    return null;
  }

  /**
   * Resolves an existing category by normalized name or creates one cleanly when
   * structured e-commerce categories (e.g. Điện thoại, Laptop, Âm thanh, Phụ kiện) are detected.
   */
  public resolveOrCreateCategoryByName(rawName: string, color = '#0ea5e9'): V28Category {
    const cleaned = rawName.trim().slice(0, 64);
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const targetNorm = normalize(cleaned);
    const existing = this.listCategories().find((c) => normalize(c.name) === targetNorm);
    if (existing) return existing;
    return this.createCategory({ name: cleaned, description: `Danh mục sản phẩm: ${cleaned}`, color });
  }

  /**
   * Classifies a product into a granular exhibition category using structured hints
   * and high-confidence Vietnamese/English product taxonomy rules. Marks ambiguous items
   * as `uncertain` for Admin review — never guessing from a single vague word.
   */
  public classifyProductCategory(input: {
    name: string;
    description?: string;
    categoryHint?: string;
  }): {
    categoryId: string | null;
    categoryName: string;
    confidence: 'high' | 'uncertain';
    matchedBy: string;
  } {
    const categories = this.listCategories();

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .trim();

    const hintNorm = normalize(input.categoryHint || '');
    const textNorm = normalize(`${input.categoryHint || ''} ${input.name || ''} ${input.description || ''}`);

    // 1. Granular product taxonomy (Phone / Laptop / Tablet / Audio / Accessories / Smart Watch)
    //    Ensures zones organize by PRODUCT TYPE (Khu Điện thoại, Khu Laptop, Khu Âm thanh...) per I6!
    const granularRules: Array<{ canonicalName: string; color: string; keywords: string[] }> = [
      {
        canonicalName: 'Điện thoại',
        color: '#0ea5e9',
        keywords: ['iphone', 'samsung galaxy', 'galaxy a', 'galaxy s', 'galaxy z', 'xiaomi', 'redmi', 'oppo find', 'oppo reno', 'vivo', 'realme', 'dien thoai', 'smartphone'],
      },
      {
        canonicalName: 'Laptop & Máy tính',
        color: '#6366f1',
        keywords: ['laptop', 'macbook', 'thinkpad', 'zenbook', 'vivobook', 'ideapad', 'may tinh xach tay', 'pc gaming', 'man hinh may tinh'],
      },
      {
        canonicalName: 'Máy tính bảng',
        color: '#8b5cf6',
        keywords: ['ipad', 'tablet', 'may tinh bang', 'galaxy tab', 'honor pad', 'xiaomi pad'],
      },
      {
        canonicalName: 'Âm thanh',
        color: '#ec4899',
        keywords: ['tai nghe', 'headphone', 'earbuds', 'airpods', 'sony wh', 'loa bluetooth', 'soundbar', 'am thanh', 'microphone'],
      },
      {
        canonicalName: 'Phụ kiện công nghệ',
        color: '#f59e0b',
        keywords: ['sac du phong', 'cap sac', 'op lung', 'ban phim', 'chuot khong day', 'dong ho thong minh', 'smartwatch', 'apple watch', 'phu kien'],
      },
    ];

    for (const rule of granularRules) {
      const hitKw = rule.keywords.find((kw) => textNorm.includes(kw));
      if (hitKw) {
        const cat = this.resolveOrCreateCategoryByName(rule.canonicalName, rule.color);
        return { categoryId: cat.id, categoryName: cat.name, confidence: 'high', matchedBy: `taxonomy:${hitKw}` };
      }
    }

    // 2. Direct match against existing category name or slug from structured breadcrumb hint
    if (hintNorm.length >= 2) {
      for (const cat of categories) {
        const catNorm = normalize(cat.name);
        const slugNorm = normalize(cat.slug.replace(/-/g, ' '));
        if (hintNorm.includes(catNorm) || catNorm.includes(hintNorm) || hintNorm.includes(slugNorm)) {
          return { categoryId: cat.id, categoryName: cat.name, confidence: 'high', matchedBy: 'hint' };
        }
      }
      // If structured breadcrumb hint is clean and specific (2..40 chars), create a dedicated category for it
      const cleanHint = (input.categoryHint || '').trim();
      if (cleanHint.length >= 3 && cleanHint.length <= 40 && !/^trang chu|home|san pham|products$/i.test(hintNorm)) {
        const cat = this.resolveOrCreateCategoryByName(cleanHint);
        return { categoryId: cat.id, categoryName: cat.name, confidence: 'high', matchedBy: 'structured-hint' };
      }
    }

    // 3. Existing industry categories (Furniture, Food, Robotics, Lighting, Energy, IoT)
    const keywordRules: Array<{ catKeywords: string[]; productKeywords: string[] }> = [
      {
        catKeywords: ['cong nghe', 'dien tu', 'tech', 'iot'],
        productKeywords: ['iot', 'sensor', 'cam bien', 'kinh ar', 'hub', 'wifi', 'bluetooth', 'camera'],
      },
      {
        catKeywords: ['noi that', 'kien truc', 'living', 'furniture'],
        productKeywords: ['ghe', 'ban lam viec', 'sofa', 'tu', 'giuong', 'noi that', 'go', 'cong thai hoc', 'ergo'],
      },
      {
        catKeywords: ['thuc pham', 'nong san', 'coffee', 'ca phe', 'food'],
        productKeywords: ['ca phe', 'coffee', 'arabica', 'robusta', 'tra', 'thuc pham', 'nong san', 'drip', 'huu co', 'organic'],
      },
      {
        catKeywords: ['tu dong hoa', 'san xuat', 'robot', 'kinetix'],
        productKeywords: ['robot', 'cobot', 'amr', 'tu dong', 'cam bien cong nghiep', 'plc', 'cnc', 'kho van'],
      },
      {
        catKeywords: ['thiet ke', 'doi song', 'den', 'lighting', 'lumina'],
        productKeywords: ['den', 'lamp', 'lighting', 'tieu am', 'acoustic', 'trang tri', 'decor', 'cri'],
      },
      {
        catKeywords: ['nang luong', 'xanh', 'energy', 'solar'],
        productKeywords: ['pin luu tru', 'dien mat troi', 'solar', 'inverter', 'bien tan', 'tram sac xe dien', 'ev charger', 'kwh', 'lithium'],
      },
    ];

    for (const rule of keywordRules) {
      const hitKw = rule.productKeywords.find((kw) => textNorm.includes(kw));
      if (!hitKw) continue;
      const matchedCat = categories.find((c) => {
        const cn = normalize(`${c.name} ${c.slug} ${c.description}`);
        return rule.catKeywords.some((ck) => cn.includes(ck));
      });
      if (matchedCat) {
        return { categoryId: matchedCat.id, categoryName: matchedCat.name, confidence: 'high', matchedBy: `keyword:${hitKw}` };
      }
    }

    return {
      categoryId: null,
      categoryName: 'Cần Admin kiểm tra',
      confidence: 'uncertain',
      matchedBy: 'none',
    };
  }
}
