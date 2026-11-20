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
}
