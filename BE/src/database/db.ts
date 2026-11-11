import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  type Booth,
  type CreateBoothInput,
  type UpdateBoothInput,
  type Product,
  type CreateProductInput,
  type UpdateProductInput,
  type BoothSlotDefinition,
  type BoothSlotAssignment,
  type BoothSlotView,
  BOOTH_SLOT_DEFINITIONS,
  VALID_BOOTH_SLOT_IDS,
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
  DEFAULT_SLOT_ASSIGNMENTS,
} from '../schemas/expoSchemas.js';

export class ExpoDatabase {
  private db: DatabaseSync;
  private boothsCache: Booth[] | null = null;

  constructor(dbPath = process.env.SQLITE_DB_PATH || './data/expo.db') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS booths (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        tagline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'General',
        color TEXT NOT NULL DEFAULT '#0ea5e9',
        logo_url TEXT NOT NULL DEFAULT '',
        banner_url TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',
        contact_url TEXT NOT NULL DEFAULT '',
        position_x REAL NOT NULL,
        position_z REAL NOT NULL,
        rotation_y REAL NOT NULL DEFAULT 0,
        width REAL NOT NULL DEFAULT 4.8,
        depth REAL NOT NULL DEFAULT 3.8
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        booth_id TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'VND',
        description TEXT NOT NULL DEFAULT '',
        images_json TEXT NOT NULL DEFAULT '[]',
        video_url TEXT NOT NULL DEFAULT '',
        model_url TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL,
        contact_url TEXT NOT NULL DEFAULT '',
        sku TEXT NOT NULL DEFAULT '',
        in_stock INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS booth_slot_assignments (
        booth_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (booth_id, slot_id),
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

    const boothCols = this.db.prepare('PRAGMA table_info(booths)').all() as { name: string }[];
    if (!boothCols.some((c) => c.name === 'company_name')) {
      this.db.exec("ALTER TABLE booths ADD COLUMN company_name TEXT NOT NULL DEFAULT '';");
    }

    const productCols = this.db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
    if (!productCols.some((c) => c.name === 'model_url')) {
      this.db.exec("ALTER TABLE products ADD COLUMN model_url TEXT NOT NULL DEFAULT '';");
    }
  }

  private seedDefaultSlotAssignments(): void {
    const versionRow = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    const currentVersion = Number(versionRow?.user_version || 0);
    if (currentVersion >= 2) {
      return;
    }

    const upsertSlot = this.db.prepare(`
      INSERT INTO booth_slot_assignments (booth_id, slot_id, product_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(booth_id, slot_id) DO NOTHING
    `);

    for (const item of DEFAULT_SLOT_ASSIGNMENTS) {
      const boothExists = this.getBoothById(item.boothId);
      const product = this.getProductById(item.productId);
      if (boothExists && product && product.boothId === item.boothId) {
        upsertSlot.run(item.boothId, item.slotId, item.productId);
      }
    }

    // Backfill company_name on default booths if empty
    const updateCompany = this.db.prepare(
      "UPDATE booths SET company_name = ? WHERE id = ? AND (company_name = '' OR company_name IS NULL)"
    );
    for (const b of DEFAULT_BOOTHS) {
      if (b.companyName) {
        updateCompany.run(b.companyName, b.id);
      }
    }
    this.boothsCache = null;

    this.db.exec('PRAGMA user_version = 2;');
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM booths').get() as { count: number };
    if (row.count > 0) {
      // Ensure legacy default booths (all rotation_y = 0) are migrated to Central Plaza inward-facing layout
      const solaris = this.db
        .prepare('SELECT rotation_y FROM booths WHERE id = ?')
        .get('booth-solaris-energy') as { rotation_y: number } | undefined;
      if (solaris && Math.abs(Number(solaris.rotation_y)) < 0.01) {
        const updateLayout = this.db.prepare(
          'UPDATE booths SET position_x = ?, position_z = ?, rotation_y = ? WHERE id = ?'
        );
        for (const b of DEFAULT_BOOTHS) {
          updateLayout.run(b.positionX, b.positionZ, b.rotationY || 0, b.id);
        }
      }
      this.seedDefaultSlotAssignments();
      return;
    }

    const insertBooth = this.db.prepare(`
      INSERT INTO booths (
        id, name, company_name, tagline, description, category, color,
        logo_url, banner_url, contact_email, contact_url,
        position_x, position_z, rotation_y, width, depth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of DEFAULT_BOOTHS) {
      insertBooth.run(
        b.id,
        b.name,
        b.companyName || b.name,
        b.tagline,
        b.description,
        b.category,
        b.color,
        b.logoUrl || '',
        b.bannerUrl || '',
        b.contactEmail || '',
        b.contactUrl || '',
        b.positionX,
        b.positionZ,
        b.rotationY || 0,
        b.width || 4.8,
        b.depth || 3.8
      );
    }

    const insertProduct = this.db.prepare(`
      INSERT INTO products (
        id, booth_id, name, price, currency, description,
        images_json, video_url, model_url, source_url, contact_url, sku, in_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of DEFAULT_PRODUCTS) {
      insertProduct.run(
        p.id,
        p.boothId,
        p.name,
        p.price,
        p.currency,
        p.description,
        JSON.stringify(p.images || []),
        p.videoUrl || '',
        p.modelUrl || '',
        p.sourceUrl,
        p.contactUrl || '',
        p.sku || '',
        p.inStock ? 1 : 0
      );
    }

    this.seedDefaultSlotAssignments();
  }

  private mapBoothRow(row: Record<string, unknown>): Booth {
    return {
      id: String(row.id),
      name: String(row.name),
      companyName: String(row.company_name || row.name || ''),
      tagline: String(row.tagline || ''),
      description: String(row.description || ''),
      category: String(row.category || 'General'),
      color: String(row.color || '#0ea5e9'),
      logoUrl: String(row.logo_url || ''),
      bannerUrl: String(row.banner_url || ''),
      contactEmail: String(row.contact_email || ''),
      contactUrl: String(row.contact_url || ''),
      positionX: Number(row.position_x),
      positionZ: Number(row.position_z),
      rotationY: Number(row.rotation_y || 0),
      width: Number(row.width || 4.8),
      depth: Number(row.depth || 3.8),
    };
  }

  private mapProductRow(row: Record<string, unknown>): Product {
    let images: string[] = [];
    try {
      const parsed = JSON.parse(String(row.images_json || '[]'));
      if (Array.isArray(parsed)) {
        images = parsed.map(String);
      }
    } catch {
      images = [];
    }

    return {
      id: String(row.id),
      boothId: String(row.booth_id),
      name: String(row.name),
      price: Number(row.price),
      currency: String(row.currency || 'VND'),
      description: String(row.description || ''),
      images,
      videoUrl: String(row.video_url || ''),
      modelUrl: String(row.model_url || ''),
      sourceUrl: String(row.source_url),
      contactUrl: String(row.contact_url || ''),
      sku: String(row.sku || ''),
      inStock: Boolean(row.in_stock),
    };
  }

  listBooths(): Booth[] {
    if (this.boothsCache) {
      return this.boothsCache;
    }
    const rows = this.db.prepare('SELECT * FROM booths ORDER BY rowid ASC').all() as Record<
      string,
      unknown
    >[];
    this.boothsCache = rows.map((r) => this.mapBoothRow(r));
    return this.boothsCache;
  }

  getBoothById(id: string): Booth | null {
    const row = this.db.prepare('SELECT * FROM booths WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapBoothRow(row) : null;
  }

  createBooth(input: CreateBoothInput): Booth {
    const id = input.id || `booth-${crypto.randomUUID().slice(0, 8)}`;
    this.db
      .prepare(
        `INSERT INTO booths (
          id, name, company_name, tagline, description, category, color,
          logo_url, banner_url, contact_email, contact_url,
          position_x, position_z, rotation_y, width, depth
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.companyName || input.name,
        input.tagline || '',
        input.description || '',
        input.category || 'General',
        input.color || '#0ea5e9',
        input.logoUrl || '',
        input.bannerUrl || '',
        input.contactEmail || '',
        input.contactUrl || '',
        input.positionX,
        input.positionZ,
        input.rotationY ?? 0,
        input.width ?? 4.8,
        input.depth ?? 3.8
      );
    this.boothsCache = null;
    return this.getBoothById(id)!;
  }

  updateBooth(id: string, input: UpdateBoothInput): Booth | null {
    const existing = this.getBoothById(id);
    if (!existing) return null;

    const merged: Booth = {
      ...existing,
      ...input,
      id,
    };

    this.db
      .prepare(
        `UPDATE booths SET
          name = ?, company_name = ?, tagline = ?, description = ?, category = ?, color = ?,
          logo_url = ?, banner_url = ?, contact_email = ?, contact_url = ?,
          position_x = ?, position_z = ?, rotation_y = ?, width = ?, depth = ?
        WHERE id = ?`
      )
      .run(
        merged.name,
        merged.companyName || merged.name,
        merged.tagline,
        merged.description,
        merged.category,
        merged.color,
        merged.logoUrl || '',
        merged.bannerUrl || '',
        merged.contactEmail || '',
        merged.contactUrl || '',
        merged.positionX,
        merged.positionZ,
        merged.rotationY,
        merged.width,
        merged.depth,
        id
      );

    this.boothsCache = null;
    return this.getBoothById(id);
  }

  deleteBooth(id: string): boolean {
    const res = this.db.prepare('DELETE FROM booths WHERE id = ?').run(id);
    if (res.changes > 0) {
      this.boothsCache = null;
      return true;
    }
    return false;
  }

  listProducts(boothId?: string): Product[] {
    if (boothId) {
      const rows = this.db
        .prepare('SELECT * FROM products WHERE booth_id = ? ORDER BY rowid ASC')
        .all(boothId) as Record<string, unknown>[];
      return rows.map((r) => this.mapProductRow(r));
    }
    const rows = this.db.prepare('SELECT * FROM products ORDER BY rowid ASC').all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.mapProductRow(r));
  }

  getProductById(id: string): Product | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapProductRow(row) : null;
  }

  createProduct(input: CreateProductInput): Product {
    const booth = this.getBoothById(input.boothId);
    if (!booth) {
      throw new Error(`Gian hàng '${input.boothId}' không tồn tại.`);
    }
    const id = input.id || `prod-${crypto.randomUUID().slice(0, 8)}`;
    this.db
      .prepare(
        `INSERT INTO products (
          id, booth_id, name, price, currency, description,
          images_json, video_url, model_url, source_url, contact_url, sku, in_stock
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.boothId,
        input.name,
        input.price,
        input.currency || 'VND',
        input.description || '',
        JSON.stringify(input.images || []),
        input.videoUrl || '',
        input.modelUrl || '',
        input.sourceUrl,
        input.contactUrl || '',
        input.sku || '',
        input.inStock ?? true ? 1 : 0
      );
    return this.getProductById(id)!;
  }

  updateProduct(id: string, input: UpdateProductInput): Product | null {
    const existing = this.getProductById(id);
    if (!existing) return null;

    if (input.boothId && input.boothId !== existing.boothId) {
      const targetBooth = this.getBoothById(input.boothId);
      if (!targetBooth) {
        throw new Error(`Gian hàng đích '${input.boothId}' không tồn tại.`);
      }
      // If product moves to another booth, remove its slot assignments from old booth
      this.db
        .prepare('DELETE FROM booth_slot_assignments WHERE product_id = ? AND booth_id != ?')
        .run(id, input.boothId);
    }

    const merged: Product = {
      ...existing,
      ...input,
      id,
    };

    this.db
      .prepare(
        `UPDATE products SET
          booth_id = ?, name = ?, price = ?, currency = ?, description = ?,
          images_json = ?, video_url = ?, model_url = ?, source_url = ?, contact_url = ?, sku = ?, in_stock = ?
        WHERE id = ?`
      )
      .run(
        merged.boothId,
        merged.name,
        merged.price,
        merged.currency,
        merged.description,
        JSON.stringify(merged.images || []),
        merged.videoUrl || '',
        merged.modelUrl || '',
        merged.sourceUrl,
        merged.contactUrl || '',
        merged.sku || '',
        merged.inStock ? 1 : 0,
        id
      );

    return this.getProductById(id);
  }

  deleteProduct(id: string): boolean {
    const res = this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return res.changes > 0;
  }

  listSlotDefinitions(): BoothSlotDefinition[] {
    return BOOTH_SLOT_DEFINITIONS;
  }

  listSlotAssignments(boothId?: string): BoothSlotAssignment[] {
    const rows = boothId
      ? (this.db
          .prepare(
            'SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments WHERE booth_id = ? ORDER BY slot_id ASC'
          )
          .all(boothId) as Record<string, unknown>[])
      : (this.db
          .prepare(
            'SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments ORDER BY booth_id ASC, slot_id ASC'
          )
          .all() as Record<string, unknown>[]);

    return rows.map((row) => ({
      boothId: String(row.booth_id),
      slotId: String(row.slot_id),
      productId: String(row.product_id),
      updatedAt: String(row.updated_at || new Date().toISOString()),
    }));
  }

  getBoothSlots(boothId: string): BoothSlotView[] {
    const booth = this.getBoothById(boothId);
    if (!booth) {
      throw new Error(`Gian hàng '${boothId}' không tồn tại.`);
    }

    const assignments = this.listSlotAssignments(boothId);
    const assignmentBySlot = new Map<string, BoothSlotAssignment>();
    for (const a of assignments) {
      assignmentBySlot.set(a.slotId, a);
    }

    const products = this.listProducts(boothId);
    const productById = new Map<string, Product>();
    for (const p of products) {
      productById.set(p.id, p);
    }

    return BOOTH_SLOT_DEFINITIONS.map((slot) => {
      const assignment = assignmentBySlot.get(slot.slotId);
      const product = assignment ? productById.get(assignment.productId) || this.getProductById(assignment.productId) : null;
      return {
        boothId,
        slot,
        productId: product ? product.id : null,
        product: product || null,
        updatedAt: assignment?.updatedAt ?? null,
      };
    });
  }

  assignProductToSlot(boothId: string, slotId: string, productId: string): BoothSlotView {
    const booth = this.getBoothById(boothId);
    if (!booth) {
      const err = new Error(`Gian hàng '${boothId}' không tồn tại.`);
      (err as Error & { statusCode?: number }).statusCode = 404;
      throw err;
    }

    if (!VALID_BOOTH_SLOT_IDS.has(slotId)) {
      const err = new Error(`Vị trí trưng bày (slot '${slotId}') không hợp lệ hoặc không thuộc gian hàng.`);
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const product = this.getProductById(productId);
    if (!product) {
      const err = new Error(`Sản phẩm '${productId}' không tồn tại.`);
      (err as Error & { statusCode?: number }).statusCode = 404;
      throw err;
    }

    if (product.boothId !== boothId) {
      const err = new Error(
        `Sản phẩm '${product.name}' thuộc gian hàng '${product.boothId}', không thể gán sang gian hàng '${boothId}'.`
      );
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    this.db
      .prepare(
        `INSERT INTO booth_slot_assignments (booth_id, slot_id, product_id, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(booth_id, slot_id) DO UPDATE SET
           product_id = excluded.product_id,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(boothId, slotId, productId);

    const slots = this.getBoothSlots(boothId);
    return slots.find((s) => s.slot.slotId === slotId)!;
  }

  clearBoothSlot(boothId: string, slotId: string): BoothSlotView {
    const booth = this.getBoothById(boothId);
    if (!booth) {
      const err = new Error(`Gian hàng '${boothId}' không tồn tại.`);
      (err as Error & { statusCode?: number }).statusCode = 404;
      throw err;
    }

    if (!VALID_BOOTH_SLOT_IDS.has(slotId)) {
      const err = new Error(`Vị trí trưng bày (slot '${slotId}') không hợp lệ hoặc không thuộc gian hàng.`);
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    this.db
      .prepare('DELETE FROM booth_slot_assignments WHERE booth_id = ? AND slot_id = ?')
      .run(boothId, slotId);

    const slots = this.getBoothSlots(boothId);
    return slots.find((s) => s.slot.slotId === slotId)!;
  }

  close(): void {
    this.db.close();
  }
}
