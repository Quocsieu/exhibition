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
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
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
        source_url TEXT NOT NULL,
        contact_url TEXT NOT NULL DEFAULT '',
        sku TEXT NOT NULL DEFAULT '',
        in_stock INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
      );
    `);
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM booths').get() as { count: number };
    if (row.count > 0) return;

    const insertBooth = this.db.prepare(`
      INSERT INTO booths (
        id, name, tagline, description, category, color,
        logo_url, banner_url, contact_email, contact_url,
        position_x, position_z, rotation_y, width, depth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of DEFAULT_BOOTHS) {
      insertBooth.run(
        b.id,
        b.name,
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
        images_json, video_url, source_url, contact_url, sku, in_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        p.sourceUrl,
        p.contactUrl || '',
        p.sku || '',
        p.inStock ? 1 : 0
      );
    }
  }

  private mapBoothRow(row: Record<string, unknown>): Booth {
    return {
      id: String(row.id),
      name: String(row.name),
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
          id, name, tagline, description, category, color,
          logo_url, banner_url, contact_email, contact_url,
          position_x, position_z, rotation_y, width, depth
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
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
          name = ?, tagline = ?, description = ?, category = ?, color = ?,
          logo_url = ?, banner_url = ?, contact_email = ?, contact_url = ?,
          position_x = ?, position_z = ?, rotation_y = ?, width = ?, depth = ?
        WHERE id = ?`
      )
      .run(
        merged.name,
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
          images_json, video_url, source_url, contact_url, sku, in_stock
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          images_json = ?, video_url = ?, source_url = ?, contact_url = ?, sku = ?, in_stock = ?
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

  close(): void {
    this.db.close();
  }
}
