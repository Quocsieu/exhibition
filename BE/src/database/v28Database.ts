import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
  DEFAULT_SLOT_ASSIGNMENTS,
  VALID_BOOTH_SLOT_IDS,
  type Booth,
  type BoothSlotAssignment,
} from '../schemas/expoSchemas.js';
import {
  type Company,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type V28Product,
  type CreateV28ProductInput,
  type UpdateV28ProductInput,
  type ImportJobReport,
  type BoothLifecycleStatus,
  slugifyCompanyName,
} from '../schemas/v28Schemas.js';

export interface V28BoothRecord extends Booth {
  companyId: string | null;
  status: BoothLifecycleStatus;
}

export interface V28MigrationReport {
  fromVersion: number;
  toVersion: number;
  journalMode: string;
  foreignKeyCheckOk: boolean;
  integrityCheckOk: boolean;
  counts: {
    companies: number;
    booths: number;
    products: number;
    boothSlotAssignments: number;
    importJobs: number;
  };
}

/**
 * Isolated V28 Phase 1 Database (BE/data/expo_v28_dev.db).
 * NEVER opens or modifies the legacy V27.5 database (BE/data/expo.db).
 *
 * Key invariants:
 * - Company 1..N Booths, Company 1..N Products (independent catalog, booth_id nullable ON DELETE SET NULL).
 * - Booths are archived (status = 'archived'), never hard-deleted with product cascade.
 * - Booth slot assignments strictly enforce product.company_id === booth.company_id.
 * - Migration v2 -> v3 is idempotent, runs inside BEGIN IMMEDIATE, and verifies PRAGMA foreign_key_check + integrity_check.
 */
export class V28CatalogDatabase {
  private db: DatabaseSync;
  public readonly dbPath: string;
  public lastMigrationReport: V28MigrationReport;

  constructor(dbPath = process.env.V28_SQLITE_DB_PATH || './data/expo_v28_dev.db') {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.ensureBaseTablesIfEmpty();
    this.lastMigrationReport = this.runV28Migration();
  }

  private ensureBaseTablesIfEmpty(): void {
    const existing = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='booths'")
      .get() as { name?: string } | undefined;

    if (existing?.name === 'booths') {
      return;
    }

    // Fresh :memory: or brand-new dev DB: bootstrap with V27 base tables & default seed first
    this.db.exec(`
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

    const insBooth = this.db.prepare(`
      INSERT INTO booths (id, name, company_name, tagline, description, category, color,
        logo_url, banner_url, contact_email, contact_url, position_x, position_z, rotation_y, width, depth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of DEFAULT_BOOTHS) {
      insBooth.run(
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

    const insProd = this.db.prepare(`
      INSERT INTO products (id, booth_id, name, price, currency, description, images_json,
        video_url, model_url, source_url, contact_url, sku, in_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of DEFAULT_PRODUCTS) {
      insProd.run(
        p.id,
        p.boothId,
        p.name,
        p.price,
        p.currency,
        p.description,
        JSON.stringify(p.images || []),
        p.videoUrl || '',
        p.modelUrl || '',
        p.sourceUrl || '',
        p.contactUrl || '',
        p.sku || '',
        p.inStock ? 1 : 0
      );
    }

    const insSlot = this.db.prepare(`
      INSERT INTO booth_slot_assignments (booth_id, slot_id, product_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const s of DEFAULT_SLOT_ASSIGNMENTS) {
      insSlot.run(s.boothId, s.slotId, s.productId);
    }
    this.db.exec('PRAGMA user_version = 2;');
  }

  /**
   * Idempotent V28 Phase 1 Migration (user_version 2 -> 3).
   * Safe SQLite table-rebuild sequence: PRAGMA foreign_keys = OFF during BEGIN IMMEDIATE,
   * backfills deterministic Company records, rebuilds products with nullable booth_id
   * (ON DELETE SET NULL) & company_id (ON DELETE RESTRICT), preserves 100% of original
   * Booth IDs, Product IDs, and Slot Assignments, then verifies PRAGMA foreign_key_check & integrity_check.
   */
  public runV28Migration(): V28MigrationReport {
    const vRow = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    const fromVersion = Number(vRow?.user_version || 0);

    if (fromVersion < 3) {
      this.db.exec('PRAGMA foreign_keys = OFF;');
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        // 1. Create companies table
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'General',
            logo_url TEXT NOT NULL DEFAULT '',
            banner_url TEXT NOT NULL DEFAULT '',
            contact_email TEXT NOT NULL DEFAULT '',
            contact_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // 2. Extend booths table non-destructively
        const boothCols = this.db.prepare('PRAGMA table_info(booths)').all() as { name: string }[];
        if (!boothCols.some((c) => c.name === 'company_id')) {
          this.db.exec('ALTER TABLE booths ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;');
        }
        if (!boothCols.some((c) => c.name === 'status')) {
          this.db.exec("ALTER TABLE booths ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
        }

        // 3. Deterministic Company backfill for all existing booths (idempotent — zero duplicates on re-run)
        const existingBooths = this.db
          .prepare('SELECT id, name, company_name, description, category, logo_url, banner_url, contact_email, contact_url, company_id FROM booths ORDER BY id ASC')
          .all() as Array<Record<string, unknown>>;

        const insertCompany = this.db.prepare(`
          INSERT OR IGNORE INTO companies (
            id, name, slug, description, category, logo_url, banner_url, contact_email, contact_url, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        const linkBoothCompany = this.db.prepare('UPDATE booths SET company_id = ? WHERE id = ?');

        const usedSlugs = new Set<string>(
          (this.db.prepare('SELECT slug FROM companies').all() as Array<{ slug: string }>).map((r) => r.slug)
        );

        for (const b of existingBooths) {
          const boothId = String(b.id);
          const companyId = b.company_id ? String(b.company_id) : `company-${boothId}`;
          const compName = String(b.company_name || b.name || boothId).trim();
          let baseSlug = slugifyCompanyName(compName);
          let slug = baseSlug;
          let suffix = 2;
          while (usedSlugs.has(slug)) {
            slug = `${baseSlug}-${suffix++}`;
          }
          usedSlugs.add(slug);

          insertCompany.run(
            companyId,
            compName,
            slug,
            String(b.description || ''),
            String(b.category || 'General'),
            String(b.logo_url || ''),
            String(b.banner_url || ''),
            String(b.contact_email || ''),
            String(b.contact_url || '')
          );
          linkBoothCompany.run(companyId, boothId);
        }

        // Fallback default company in case an orphan product existed without a matching booth
        insertCompany.run(
          'company-default',
          'Grand Expo Default Company',
          'grand-expo-default',
          '',
          'General',
          '',
          '',
          '',
          ''
        );

        // 4. Rebuild products table: decouple booth_id (nullable, ON DELETE SET NULL) + bind company_id (NOT NULL, ON DELETE RESTRICT)
        this.db.exec(`
          CREATE TABLE products_v28_new (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            booth_id TEXT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'VND',
            description TEXT NOT NULL DEFAULT '',
            images_json TEXT NOT NULL DEFAULT '[]',
            video_url TEXT NOT NULL DEFAULT '',
            model_url TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            contact_url TEXT NOT NULL DEFAULT '',
            sku TEXT NOT NULL DEFAULT '',
            in_stock INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
            FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE SET NULL
          );
        `);

        this.db.exec(`
          INSERT INTO products_v28_new (
            id, company_id, booth_id, name, price, currency, description, images_json,
            video_url, model_url, source_url, contact_url, sku, in_stock, status, created_at, updated_at
          )
          SELECT
            p.id,
            COALESCE(b.company_id, 'company-default'),
            p.booth_id,
            p.name,
            p.price,
            p.currency,
            p.description,
            p.images_json,
            p.video_url,
            p.model_url,
            p.source_url,
            p.contact_url,
            p.sku,
            p.in_stock,
            'active',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          FROM products p
          LEFT JOIN booths b ON b.id = p.booth_id;
        `);

        // Rebuild booth_slot_assignments cleanly so FK points to the new products table
        this.db.exec(`
          CREATE TABLE booth_slot_assignments_v28_new (
            booth_id TEXT NOT NULL,
            slot_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (booth_id, slot_id),
            FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE RESTRICT,
            FOREIGN KEY (product_id) REFERENCES products_v28_new(id) ON DELETE CASCADE
          );
        `);
        this.db.exec(`
          INSERT INTO booth_slot_assignments_v28_new (booth_id, slot_id, product_id, updated_at)
          SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments;
        `);

        this.db.exec('DROP TABLE booth_slot_assignments;');
        this.db.exec('DROP TABLE products;');
        this.db.exec('ALTER TABLE products_v28_new RENAME TO products;');
        this.db.exec('ALTER TABLE booth_slot_assignments_v28_new RENAME TO booth_slot_assignments;');

        // 5. Create import_jobs table
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS import_jobs (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            filename TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            duplicate_strategy TEXT NOT NULL DEFAULT 'skip',
            total_rows INTEGER NOT NULL DEFAULT 0,
            created_count INTEGER NOT NULL DEFAULT 0,
            updated_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            report_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
          );
        `);

        // 6. Indexes & Unique SKU constraint per company (when SKU is non-empty)
        this.db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku_unique
            ON products(company_id, lower(trim(sku)))
            WHERE trim(sku) <> '';
          CREATE INDEX IF NOT EXISTS idx_products_company_status ON products(company_id, status);
          CREATE INDEX IF NOT EXISTS idx_booths_company_status ON booths(company_id, status);
          CREATE INDEX IF NOT EXISTS idx_import_jobs_company ON import_jobs(company_id, created_at);
        `);

        // Remove unused default company if no products/booths reference it
        const defaultRefs = Number(
          (
            this.db
              .prepare("SELECT COUNT(*) as c FROM products WHERE company_id = 'company-default'")
              .get() as { c: number }
          ).c
        );
        if (defaultRefs === 0) {
          this.db.exec("DELETE FROM companies WHERE id = 'company-default';");
        }

        this.db.exec('PRAGMA user_version = 3;');
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        this.db.exec('PRAGMA foreign_keys = ON;');
        throw err;
      }
      this.db.exec('PRAGMA foreign_keys = ON;');
    }

    // Phase 2 Migration: user_version 3 -> 4 (exhibitions, exhibition_versions, zones, exhibition_version_booths)
    const vAfterP1 = Number(
      ((this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined)?.user_version) || 0
    );
    if (vAfterP1 < 4) {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS exhibitions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            active_version_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS exhibition_versions (
            id TEXT PRIMARY KEY,
            exhibition_id TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            target_booth_count INTEGER NOT NULL,
            layout_config_json TEXT NOT NULL,
            roof_config_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            published_at TEXT NULL,
            UNIQUE (exhibition_id, version_number),
            FOREIGN KEY (exhibition_id) REFERENCES exhibitions(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS zones (
            id TEXT PRIMARY KEY,
            version_id TEXT NOT NULL,
            code TEXT NOT NULL,
            display_name TEXT NOT NULL,
            category_tag TEXT NOT NULL DEFAULT '',
            bounds_json TEXT NOT NULL DEFAULT '{}',
            sort_order INTEGER NOT NULL DEFAULT 1,
            UNIQUE (version_id, code),
            FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS exhibition_version_booths (
            version_id TEXT NOT NULL,
            booth_id TEXT NOT NULL,
            zone_id TEXT NOT NULL,
            slot_index INTEGER NOT NULL DEFAULT 0,
            position_x REAL NOT NULL,
            position_z REAL NOT NULL,
            rotation_y REAL NOT NULL DEFAULT 0,
            archetype_id TEXT NOT NULL DEFAULT 'grand_portal',
            placement_status TEXT NOT NULL DEFAULT 'placed',
            PRIMARY KEY (version_id, booth_id),
            FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE,
            FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE RESTRICT,
            FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE RESTRICT
          );

          CREATE INDEX IF NOT EXISTS idx_exhibition_versions_exh ON exhibition_versions(exhibition_id, status);
          CREATE INDEX IF NOT EXISTS idx_zones_version ON zones(version_id, sort_order);
          CREATE INDEX IF NOT EXISTS idx_evb_version_zone ON exhibition_version_booths(version_id, zone_id);
          CREATE INDEX IF NOT EXISTS idx_evb_booth ON exhibition_version_booths(booth_id);
        `);

        this.db.exec('PRAGMA user_version = 4;');
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    }

    // Phase 4.2 + 5 + 6 Migration: user_version 4 -> 5 (categories, audio_assets, booth_faqs, ai_usage_logs)
    const vAfterP2 = Number(
      ((this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined)?.user_version) || 0
    );
    if (vAfterP2 < 5) {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#0ea5e9',
            sort_order INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audio_assets (
            audio_id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            slot_key TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'vi-VN',
            voice_id TEXT NOT NULL DEFAULT 'vi-VN-default',
            model_id TEXT NOT NULL DEFAULT 'gemini-3.8-flash-lite-tts',
            storage_key TEXT NOT NULL,
            mime_type TEXT NOT NULL DEFAULT 'audio/wav',
            duration_sec REAL NOT NULL DEFAULT 0,
            transcript TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'ready',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (entity_type, entity_id, slot_key, content_hash)
          );

          CREATE TABLE IF NOT EXISTS booth_faqs (
            id TEXT PRIMARY KEY,
            booth_id TEXT NOT NULL,
            company_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            approved INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS ai_usage_logs (
            id TEXT PRIMARY KEY,
            booth_id TEXT NOT NULL,
            company_id TEXT NOT NULL,
            session_id TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL,
            provider TEXT NOT NULL,
            model_id TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            duration_sec REAL NOT NULL DEFAULT 0,
            estimated_cost_usd REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_audio_entity ON audio_assets(entity_type, entity_id, slot_key);
          CREATE INDEX IF NOT EXISTS idx_audio_hash ON audio_assets(content_hash);
          CREATE INDEX IF NOT EXISTS idx_faqs_booth ON booth_faqs(booth_id, approved);
          CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at, mode);
        `);

        // Add nullable category_id columns safely
        const prodCols = this.db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
        if (!prodCols.some((c) => c.name === 'category_id')) {
          this.db.exec('ALTER TABLE products ADD COLUMN category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL;');
        }
        const zoneCols = this.db.prepare('PRAGMA table_info(zones)').all() as { name: string }[];
        if (!zoneCols.some((c) => c.name === 'category_id')) {
          this.db.exec('ALTER TABLE zones ADD COLUMN category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL;');
        }
        const evbCols = this.db.prepare('PRAGMA table_info(exhibition_version_booths)').all() as { name: string }[];
        if (!evbCols.some((c) => c.name === 'category_id')) {
          this.db.exec('ALTER TABLE exhibition_version_booths ADD COLUMN category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL;');
        }

        // Seed 6 standard stable exhibition categories idempotently
        const defaultCats = [
          ['cat-tech', 'Công nghệ & Điện tử', 'cong-nghe-dien-tu', 'Thiết bị thông minh, AI, phần cứng & phần mềm', '#0ea5e9', 1],
          ['cat-living', 'Nội thất & Trang trí', 'noi-that-trang-tri', 'Kiến trúc, nội thất hiện đại & chiếu sáng', '#8b5cf6', 2],
          ['cat-food', 'Thực phẩm & Đồ uống', 'thuc-pham-do-uong', 'Nông sản, cà phê đặc sản & đồ uống hữu cơ', '#10b981', 3],
          ['cat-industrial', 'Thiết bị công nghiệp', 'thiet-bi-cong-nghiep', 'Tự động hóa, robot & sản xuất thông minh', '#f59e0b', 4],
          ['cat-energy', 'Năng lượng & Xanh', 'nang-luong-xanh', 'Điện mặt trời, lưu trữ & giải pháp bền vững', '#14b8a6', 5],
          ['cat-lifestyle', 'Thời trang & Mỹ phẩm', 'thoi-trang-my-pham', 'Thời trang thiết kế, làm đẹp & chăm sóc cá nhân', '#ec4899', 6],
        ] as const;
        const insCat = this.db.prepare(`
          INSERT OR IGNORE INTO categories (id, name, slug, description, color, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const c of defaultCats) {
          insCat.run(c[0], c[1], c[2], c[3], c[4], c[5]);
        }

        this.db.exec('PRAGMA user_version = 5;');
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    }

    // Phase 1 Hybrid TTS & Audio Management: Additive, non-destructive extension of audio_assets
    // Preserves 100% of existing audio_assets rows while adding provider, source_type, staleness, and batch job tracking.
    const audioCols = this.db.prepare('PRAGMA table_info(audio_assets)').all() as { name: string }[];
    const hasAudioCol = (name: string) => audioCols.some((c) => c.name === name);
    if (audioCols.length > 0) {
      const additiveColumns: Array<[string, string]> = [
        ['source_type', "TEXT NOT NULL DEFAULT 'pre_generated'"],
        ['provider', "TEXT NOT NULL DEFAULT 'gemini'"],
        ['speed', 'REAL NOT NULL DEFAULT 1.0'],
        ['style', "TEXT NOT NULL DEFAULT ''"],
        ['config_version', "TEXT NOT NULL DEFAULT 'v1'"],
        ['needs_update', 'INTEGER NOT NULL DEFAULT 0'],
        ['is_active', 'INTEGER NOT NULL DEFAULT 1'],
        ['original_filename', "TEXT NOT NULL DEFAULT ''"],
        ['error_message', "TEXT NOT NULL DEFAULT ''"],
        ['updated_at', "TEXT NOT NULL DEFAULT ''"],
      ];
      for (const [colName, colDef] of additiveColumns) {
        if (!hasAudioCol(colName)) {
          this.db.exec(`ALTER TABLE audio_assets ADD COLUMN ${colName} ${colDef};`);
        }
      }
      this.db.exec(`
        UPDATE audio_assets
        SET updated_at = COALESCE(NULLIF(updated_at, ''), created_at)
        WHERE updated_at = '';
        UPDATE audio_assets
        SET provider = 'local-fallback'
        WHERE provider = 'gemini' AND model_id LIKE '%local-fallback%';
        CREATE INDEX IF NOT EXISTS idx_audio_entity_active
          ON audio_assets(entity_type, entity_id, slot_key, is_active, status);
        CREATE INDEX IF NOT EXISTS idx_audio_storage_key
          ON audio_assets(storage_key);
      `);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_batch_jobs (
        job_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        total_items INTEGER NOT NULL DEFAULT 0,
        completed_items INTEGER NOT NULL DEFAULT 0,
        succeeded_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,
        concurrency INTEGER NOT NULL DEFAULT 2,
        provider_override TEXT NOT NULL DEFAULT '',
        voice_id TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT 'admin',
        errors_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Phase 1.1: Per-entity audio mode management (AUTO | AI_GENERATED | RECORDED)
      CREATE TABLE IF NOT EXISTS audio_entity_configs (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        audio_mode TEXT NOT NULL DEFAULT 'AUTO',
        preferred_provider TEXT NOT NULL DEFAULT '',
        model_id TEXT NOT NULL DEFAULT '',
        voice_id TEXT NOT NULL DEFAULT '',
        speed REAL NOT NULL DEFAULT 1.0,
        style TEXT NOT NULL DEFAULT '',
        custom_transcript TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_type, entity_id)
      );

      -- Phase 1.1: Backend-enforced Voice Sample Approval registry
      CREATE TABLE IF NOT EXISTS audio_voice_approvals (
        approval_id TEXT PRIMARY KEY,
        config_signature TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        voice_id TEXT NOT NULL,
        speed REAL NOT NULL DEFAULT 1.0,
        style TEXT NOT NULL DEFAULT '',
        sample_audio_id TEXT NOT NULL DEFAULT '',
        sample_transcript TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'previewed',
        approved_by TEXT NOT NULL DEFAULT '',
        approved_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Phase 1.1 additive column on audio_batch_jobs for pause_reason & approval_id
    const batchCols = this.db.prepare('PRAGMA table_info(audio_batch_jobs)').all() as { name: string }[];
    if (!batchCols.some((c) => c.name === 'pause_reason')) {
      this.db.exec("ALTER TABLE audio_batch_jobs ADD COLUMN pause_reason TEXT NOT NULL DEFAULT '';");
    }
    if (!batchCols.some((c) => c.name === 'approval_id')) {
      this.db.exec("ALTER TABLE audio_batch_jobs ADD COLUMN approval_id TEXT NOT NULL DEFAULT '';");
    }

    // Safe non-destructive backfill for existing entities that already have uploaded or pre_generated audio
    this.db.exec(`
      INSERT OR IGNORE INTO audio_entity_configs (entity_type, entity_id, audio_mode, updated_at)
      SELECT DISTINCT entity_type, entity_id, 'RECORDED', CURRENT_TIMESTAMP
      FROM audio_assets
      WHERE is_active = 1 AND status = 'ready' AND source_type = 'uploaded';

      INSERT OR IGNORE INTO audio_entity_configs (entity_type, entity_id, audio_mode, preferred_provider, model_id, voice_id, updated_at)
      SELECT entity_type, entity_id, 'AI_GENERATED', provider, model_id, voice_id, CURRENT_TIMESTAMP
      FROM audio_assets
      WHERE is_active = 1 AND status = 'ready' AND source_type = 'pre_generated'
        AND model_id NOT LIKE '%local-fallback%' AND provider != 'local-fallback'
      GROUP BY entity_type, entity_id;
    `);

    // Additive, idempotent per-version snapshot tables (V28-AUDIT-001: strict Draft/Published isolation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exhibition_version_booth_meta (
        version_id TEXT NOT NULL,
        booth_id TEXT NOT NULL,
        booth_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'General',
        company_id TEXT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (version_id, booth_id),
        FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS exhibition_version_booth_slots (
        version_id TEXT NOT NULL,
        booth_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (version_id, booth_id, slot_id),
        FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_evbm_version ON exhibition_version_booth_meta(version_id);
      CREATE INDEX IF NOT EXISTS idx_evbs_version ON exhibition_version_booth_slots(version_id, booth_id);

      -- Phase 4: Server-Verified Visitor Journey Tracking (additive, idempotent, zero PII)
      CREATE TABLE IF NOT EXISTS visitor_sessions (
        visitor_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS visitor_booth_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT NOT NULL,
        exhibition_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        booth_id TEXT NOT NULL,
        interaction_type TEXT NOT NULL DEFAULT 'booth_focus',
        first_visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (visitor_id, version_id, booth_id),
        FOREIGN KEY (visitor_id) REFERENCES visitor_sessions(visitor_id) ON DELETE CASCADE,
        FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vbv_visitor_version
        ON visitor_booth_visits(visitor_id, version_id);

      -- Phase 5: Visitor Rewards Redemption & Admin Verification (additive, idempotent)
      CREATE TABLE IF NOT EXISTS reward_policies (
        version_id TEXT PRIMARY KEY,
        required_unique_booths INTEGER NOT NULL DEFAULT 30,
        reward_title TEXT NOT NULL DEFAULT 'Quà tặng tham quan Grand Expo V28',
        reward_description TEXT NOT NULL DEFAULT 'Đăng ký xác minh nhận quà sau khi tham quan đủ số gian hàng quy định.',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reward_redemptions (
        id TEXT PRIMARY KEY,
        redemption_code TEXT NOT NULL UNIQUE,
        visitor_id TEXT NOT NULL,
        exhibition_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        contact_phone TEXT NULL,
        contact_email TEXT NULL,
        consent_accepted INTEGER NOT NULL DEFAULT 1,
        recorded_unique_booths INTEGER NOT NULL,
        required_unique_booths INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        risk_flags_json TEXT NOT NULL DEFAULT '[]',
        risk_level TEXT NOT NULL DEFAULT 'low',
        reviewed_by TEXT NULL,
        reviewed_at TEXT NULL,
        rejection_reason TEXT NULL,
        fulfilled_by TEXT NULL,
        fulfilled_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (visitor_id, version_id),
        FOREIGN KEY (visitor_id) REFERENCES visitor_sessions(visitor_id) ON DELETE CASCADE,
        FOREIGN KEY (version_id) REFERENCES exhibition_versions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reward_redemption_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redemption_id TEXT NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT NULL,
        to_status TEXT NOT NULL,
        actor TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (redemption_id) REFERENCES reward_redemptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_rr_version_status
        ON reward_redemptions(version_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_rral_redemption
        ON reward_redemption_audit_logs(redemption_id, created_at);
    `);

    const fkRows = this.db.prepare('PRAGMA foreign_key_check').all();
    const integrityRow = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const jmRow = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };

    if (fkRows.length > 0) {
      throw new Error(`SQLite foreign_key_check failed after V28 migration: ${JSON.stringify(fkRows)}`);
    }
    if (integrityRow.integrity_check !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrityRow.integrity_check}`);
    }

    return {
      fromVersion,
      toVersion: 5,
      journalMode: String(jmRow?.journal_mode || ''),
      foreignKeyCheckOk: fkRows.length === 0,
      integrityCheckOk: integrityRow.integrity_check === 'ok',
      counts: {
        companies: Number((this.db.prepare('SELECT COUNT(*) as c FROM companies').get() as { c: number }).c),
        booths: Number((this.db.prepare('SELECT COUNT(*) as c FROM booths').get() as { c: number }).c),
        products: Number((this.db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c),
        boothSlotAssignments: Number(
          (this.db.prepare('SELECT COUNT(*) as c FROM booth_slot_assignments').get() as { c: number }).c
        ),
        importJobs: Number((this.db.prepare('SELECT COUNT(*) as c FROM import_jobs').get() as { c: number }).c),
      },
    };
  }

  public getConnection(): DatabaseSync {
    return this.db;
  }

  // ============================================================================
  // COMPANY MANAGEMENT
  // ============================================================================
  private mapCompany(row: Record<string, unknown>): Company {
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      description: String(row.description || ''),
      category: String(row.category || 'General'),
      logoUrl: String(row.logo_url || ''),
      bannerUrl: String(row.banner_url || ''),
      contactEmail: String(row.contact_email || ''),
      contactUrl: String(row.contact_url || ''),
      status: row.status === 'inactive' ? 'inactive' : 'active',
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }

  listCompanies(filter?: { q?: string; status?: 'active' | 'inactive' | 'all' }): Array<
    Company & { boothCount: number; productCount: number }
  > {
    const where: string[] = [];
    const params: string[] = [];
    if (filter?.status && filter.status !== 'all') {
      where.push('c.status = ?');
      params.push(filter.status);
    }
    if (filter?.q && filter.q.trim()) {
      where.push('(lower(c.name) LIKE ? OR lower(c.slug) LIKE ? OR lower(c.category) LIKE ?)');
      const pat = `%${filter.q.trim().toLowerCase()}%`;
      params.push(pat, pat, pat);
    }
    const sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM booths b WHERE b.company_id = c.id AND b.status = 'active') as booth_count,
        (SELECT COUNT(*) FROM products p WHERE p.company_id = c.id AND p.status = 'active') as product_count
      FROM companies c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.created_at ASC, c.name ASC
    `;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ...this.mapCompany(r),
      boothCount: Number(r.booth_count || 0),
      productCount: Number(r.product_count || 0),
    }));
  }

  getCompanyById(id: string): (Company & { booths: V28BoothRecord[]; productCount: number }) | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    const booths = this.listBooths({ companyId: id, includeArchived: true });
    const productCount = Number(
      (
        this.db
          .prepare('SELECT COUNT(*) as c FROM products WHERE company_id = ?')
          .get(id) as { c: number }
      ).c
    );
    return {
      ...this.mapCompany(row),
      booths,
      productCount,
    };
  }

  createCompany(input: CreateCompanyInput): Company {
    const id = `company-${crypto.randomUUID().slice(0, 8)}`;
    let slug = input.slug || slugifyCompanyName(input.name);
    const existingSlug = this.db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug);
    if (existingSlug) {
      slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    }
    this.db
      .prepare(
        `INSERT INTO companies (
          id, name, slug, description, category, logo_url, banner_url, contact_email, contact_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(
        id,
        input.name,
        slug,
        input.description || '',
        input.category || 'General',
        input.logoUrl || '',
        input.bannerUrl || '',
        input.contactEmail || '',
        input.contactUrl || ''
      );
    const created = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Record<string, unknown>;
    return this.mapCompany(created);
  }

  /**
   * Matches an existing active Company by canonical domain or normalized name to prevent
   * duplicate companies on repeated URL imports. Creates a new Company only when `verified`
   * seller evidence is present and no match exists.
   */
  findOrCreateCompanyByWebsite(input: {
    name: string;
    canonicalDomain: string;
    websiteUrl: string;
    logoUrl?: string;
    contactEmail?: string;
    description?: string;
    allowCreate: boolean;
  }): { company: Company | null; created: boolean; matchedBy: 'domain' | 'name' | 'created' | 'none' } {
    const cleanDomain = input.canonicalDomain.trim().toLowerCase().replace(/^www\./, '');
    const normName = input.name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const activeCompanies = this.listCompanies({ status: 'active' });
    if (cleanDomain) {
      for (const c of activeCompanies) {
        try {
          const host = c.contactUrl ? new URL(c.contactUrl).hostname.toLowerCase().replace(/^www\./, '') : '';
          if (host && host === cleanDomain) {
            return { company: c, created: false, matchedBy: 'domain' };
          }
        } catch {
          // ignore malformed stored URL
        }
      }
    }

    if (normName.length >= 2) {
      for (const c of activeCompanies) {
        const cn = c.name
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        if (cn && cn === normName) {
          return { company: c, created: false, matchedBy: 'name' };
        }
      }
    }

    if (!input.allowCreate || input.name.trim().length < 2) {
      return { company: null, created: false, matchedBy: 'none' };
    }

    const created = this.createCompany({
      name: input.name.trim().slice(0, 120),
      description: input.description || `Đơn vị bán hàng được nhận diện từ ${cleanDomain || input.websiteUrl}`,
      category: 'Thương mại điện tử',
      logoUrl: input.logoUrl || '',
      bannerUrl: '',
      contactEmail: input.contactEmail || '',
      contactUrl: input.websiteUrl || (cleanDomain ? `https://${cleanDomain}` : ''),
    });
    return { company: created, created: true, matchedBy: 'created' };
  }

  updateCompany(id: string, patch: UpdateCompanyInput): Company | null {
    const current = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!current) return null;

    const nextName = patch.name ?? String(current.name);
    const nextSlug = patch.slug ?? String(current.slug);
    if (nextSlug !== current.slug) {
      const clash = this.db
        .prepare('SELECT id FROM companies WHERE slug = ? AND id <> ?')
        .get(nextSlug, id);
      if (clash) {
        throw new Error(`Slug doanh nghiệp '${nextSlug}' đã tồn tại.`);
      }
    }

    this.db
      .prepare(
        `UPDATE companies
         SET name = ?, slug = ?, description = ?, category = ?, logo_url = ?, banner_url = ?,
             contact_email = ?, contact_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        nextName,
        nextSlug,
        patch.description ?? String(current.description || ''),
        patch.category ?? String(current.category || 'General'),
        patch.logoUrl ?? String(current.logo_url || ''),
        patch.bannerUrl ?? String(current.banner_url || ''),
        patch.contactEmail ?? String(current.contact_email || ''),
        patch.contactUrl ?? String(current.contact_url || ''),
        patch.status ?? (current.status === 'inactive' ? 'inactive' : 'active'),
        id
      );

    // Sync company_name onto owned booths for signage consistency
    if (patch.name) {
      this.db.prepare('UPDATE booths SET company_name = ? WHERE company_id = ?').run(nextName, id);
    }

    const updated = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Record<string, unknown>;
    return this.mapCompany(updated);
  }

  // ============================================================================
  // BOOTHS & DISPLAY SLOTS (OWNERSHIP GUARD + NON-DESTRUCTIVE ARCHIVE)
  // ============================================================================
  private mapBooth(row: Record<string, unknown>): V28BoothRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      companyName: String(row.company_name || row.name),
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
      companyId: row.company_id ? String(row.company_id) : null,
      status: row.status === 'archived' ? 'archived' : 'active',
    };
  }

  listBooths(filter?: { companyId?: string; includeArchived?: boolean }): V28BoothRecord[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter?.companyId) {
      where.push('company_id = ?');
      params.push(filter.companyId);
    }
    if (!filter?.includeArchived) {
      where.push("status = 'active'");
    }
    const sql = `SELECT * FROM booths ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id ASC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapBooth(r));
  }

  getBoothById(id: string): V28BoothRecord | null {
    const row = this.db.prepare('SELECT * FROM booths WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapBooth(row) : null;
  }

  assignBoothCompany(boothId: string, companyId: string, options?: { enforceSlotCheck?: boolean }): V28BoothRecord | null {
    const booth = this.getBoothById(boothId);
    const company = this.getCompanyById(companyId);
    if (!booth || !company) return null;
    if (options?.enforceSlotCheck && booth.companyId && booth.companyId !== companyId) {
      const foreignSlot = this.db
        .prepare(
          `SELECT 1 FROM booth_slot_assignments bsa
           JOIN products p ON p.id = bsa.product_id
           WHERE bsa.booth_id = ? AND p.company_id != ?
           LIMIT 1`
        )
        .get(boothId, companyId);
      if (foreignSlot) {
        const err = new Error(
          `Không thể đổi doanh nghiệp sở hữu gian '${boothId}' khi gian đang có sản phẩm thuộc doanh nghiệp cũ. Hãy gỡ slot trước.`
        ) as Error & { statusCode?: number };
        err.statusCode = 409;
        throw err;
      }
    }
    this.db
      .prepare('UPDATE booths SET company_id = ?, company_name = ? WHERE id = ?')
      .run(companyId, company.name, boothId);
    return this.getBoothById(boothId);
  }

  /**
   * Non-destructive archive: NEVER deletes products or slot history!
   */
  archiveBooth(boothId: string): V28BoothRecord | null {
    const booth = this.getBoothById(boothId);
    if (!booth) return null;
    this.db.prepare("UPDATE booths SET status = 'archived' WHERE id = ?").run(boothId);
    return this.getBoothById(boothId);
  }

  restoreBooth(boothId: string): V28BoothRecord | null {
    const booth = this.getBoothById(boothId);
    if (!booth) return null;
    this.db.prepare("UPDATE booths SET status = 'active' WHERE id = ?").run(boothId);
    return this.getBoothById(boothId);
  }

  listBoothSlotAssignments(boothId?: string): BoothSlotAssignment[] {
    const rows = boothId
      ? (this.db
          .prepare('SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments WHERE booth_id = ? ORDER BY slot_id ASC')
          .all(boothId) as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments ORDER BY booth_id ASC, slot_id ASC')
          .all() as Array<Record<string, unknown>>);

    return rows.map((r) => ({
      boothId: String(r.booth_id),
      slotId: String(r.slot_id),
      productId: String(r.product_id),
      updatedAt: String(r.updated_at || ''),
    }));
  }

  /**
   * Assigns a Product from Company Catalog to a Booth Display Slot (slot_01..slot_06).
   * Enforces strict Company Ownership: product.companyId MUST equal booth.companyId.
   * Allows the same Product to be displayed on multiple slots within the same Company!
   */
  assignBoothSlot(boothId: string, slotId: string, productId: string): BoothSlotAssignment {
    if (!VALID_BOOTH_SLOT_IDS.has(slotId)) {
      throw new Error(`Slot '${slotId}' không hợp lệ (chỉ chấp nhận slot_01..slot_06).`);
    }
    const booth = this.getBoothById(boothId);
    if (!booth) {
      throw new Error(`Không tìm thấy gian hàng '${boothId}'.`);
    }
    if (booth.status === 'archived') {
      const inActiveDraft = this.db
        .prepare(
          `SELECT 1
           FROM exhibition_version_booths vb
           JOIN exhibition_versions v ON v.id = vb.version_id
           WHERE vb.booth_id = ? AND v.status = 'draft'
           LIMIT 1`
        )
        .get(boothId);
      if (!inActiveDraft) {
        throw new Error(`Gian hàng '${boothId}' đang ở trạng thái lưu trữ.`);
      }
    }
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Không tìm thấy sản phẩm '${productId}'.`);
    }
    if (product.status !== 'active') {
      const err = new Error(`Sản phẩm '${product.name}' đang ở trạng thái tạm ẩn (inactive), không thể gán trưng bày.`) as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }
    if (!booth.companyId || booth.companyId !== product.companyId) {
      const err = new Error(
        `Không thể gán sản phẩm thuộc doanh nghiệp '${product.companyId}' vào gian hàng của doanh nghiệp '${booth.companyId || 'chưa gắn'}'.`
      ) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }

    this.db
      .prepare(
        `INSERT INTO booth_slot_assignments (booth_id, slot_id, product_id, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(booth_id, slot_id) DO UPDATE SET product_id = excluded.product_id, updated_at = CURRENT_TIMESTAMP`
      )
      .run(boothId, slotId, productId);

    // Keep version-scoped snapshot in sync for active published version or initial unpublished draft
    this.db
      .prepare(
        `INSERT INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id, updated_at)
         SELECT evb.version_id, ?, ?, ?, CURRENT_TIMESTAMP
         FROM exhibition_version_booths evb
         JOIN exhibition_versions v ON v.id = evb.version_id
         JOIN exhibitions e ON e.id = v.exhibition_id
         WHERE evb.booth_id = ?
           AND (v.status = 'published' OR (v.status = 'draft' AND e.active_version_id IS NULL))
         ON CONFLICT(version_id, booth_id, slot_id) DO UPDATE SET
           product_id = excluded.product_id,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(boothId, slotId, productId, boothId);

    const row = this.db
      .prepare('SELECT booth_id, slot_id, product_id, updated_at FROM booth_slot_assignments WHERE booth_id = ? AND slot_id = ?')
      .get(boothId, slotId) as Record<string, unknown>;
    return {
      boothId: String(row.booth_id),
      slotId: String(row.slot_id),
      productId: String(row.product_id),
      updatedAt: String(row.updated_at || ''),
    };
  }

  clearBoothSlot(boothId: string, slotId: string): boolean {
    const res = this.db
      .prepare('DELETE FROM booth_slot_assignments WHERE booth_id = ? AND slot_id = ?')
      .run(boothId, slotId);
    this.db
      .prepare(
        `DELETE FROM exhibition_version_booth_slots
         WHERE booth_id = ? AND slot_id = ?
           AND version_id IN (
             SELECT v.id FROM exhibition_versions v
             JOIN exhibitions e ON e.id = v.exhibition_id
             WHERE v.status = 'published' OR (v.status = 'draft' AND e.active_version_id IS NULL)
           )`
      )
      .run(boothId, slotId);
    return Number(res.changes) > 0;
  }

  // ============================================================================
  // INDEPENDENT PRODUCT CATALOG (PAGINATION, FILTER, SEARCH)
  // ============================================================================
  private mapProduct(row: Record<string, unknown>): V28Product {
    let images: string[] = [];
    try {
      const parsed = JSON.parse(String(row.images_json || '[]'));
      if (Array.isArray(parsed)) images = parsed.map(String);
    } catch {
      images = [];
    }
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      boothId: row.booth_id ? String(row.booth_id) : null,
      name: String(row.name),
      sku: String(row.sku || ''),
      price: Number(row.price || 0),
      currency: String(row.currency || 'VND'),
      description: String(row.description || ''),
      images,
      videoUrl: String(row.video_url || ''),
      modelUrl: String(row.model_url || ''),
      sourceUrl: String(row.source_url || ''),
      contactUrl: String(row.contact_url || ''),
      inStock: Boolean(row.in_stock),
      status: row.status === 'inactive' ? 'inactive' : 'active',
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }

  listProducts(query?: {
    companyId?: string;
    boothId?: string;
    q?: string;
    status?: 'active' | 'inactive' | 'all';
    page?: number;
    limit?: number;
  }): {
    items: V28Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, Math.floor(query?.page || 1));
    const limit = Math.min(250, Math.max(1, Math.floor(query?.limit || 20)));
    const offset = (page - 1) * limit;

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (query?.companyId) {
      where.push('company_id = ?');
      params.push(query.companyId);
    }
    if (query?.boothId) {
      where.push('booth_id = ?');
      params.push(query.boothId);
    }
    if (query?.status && query.status !== 'all') {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query?.q && query.q.trim()) {
      where.push('(lower(name) LIKE ? OR lower(sku) LIKE ? OR lower(description) LIKE ?)');
      const pat = `%${query.q.trim().toLowerCase()}%`;
      params.push(pat, pat, pat);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(
      (
        this.db.prepare(`SELECT COUNT(*) as c FROM products ${whereSql}`).get(...params) as {
          c: number;
        }
      ).c
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM products ${whereSql} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    return {
      items: rows.map((r) => this.mapProduct(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  getProductById(id: string): V28Product | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapProduct(row) : null;
  }

  findProductByCompanyAndSku(companyId: string, sku: string): V28Product | null {
    const normalized = sku.trim().toLowerCase();
    if (!normalized) return null;
    const row = this.db
      .prepare('SELECT * FROM products WHERE company_id = ? AND lower(trim(sku)) = ?')
      .get(companyId, normalized) as Record<string, unknown> | undefined;
    return row ? this.mapProduct(row) : null;
  }

  createProduct(input: CreateV28ProductInput): V28Product {
    const company = this.getCompanyById(input.companyId);
    if (!company) {
      throw new Error(`Doanh nghiệp '${input.companyId}' không tồn tại.`);
    }
    if (input.boothId) {
      const booth = this.getBoothById(input.boothId);
      if (!booth || booth.companyId !== input.companyId) {
        const err = new Error('Gian hàng không thuộc doanh nghiệp đã chọn.') as Error & {
          statusCode?: number;
        };
        err.statusCode = 403;
        throw err;
      }
    }
    if (input.sku && input.sku.trim()) {
      const dup = this.findProductByCompanyAndSku(input.companyId, input.sku);
      if (dup) {
        const err = new Error(
          `Mã SKU '${input.sku.trim()}' đã tồn tại trong kho sản phẩm của doanh nghiệp.`
        ) as Error & { statusCode?: number };
        err.statusCode = 409;
        throw err;
      }
    }

    const id = `prod-${crypto.randomUUID().slice(0, 10)}`;
    this.db
      .prepare(
        `INSERT INTO products (
          id, company_id, booth_id, name, price, currency, description, images_json,
          video_url, model_url, source_url, contact_url, sku, in_stock, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(
        id,
        input.companyId,
        input.boothId || null,
        input.name,
        input.price,
        input.currency || 'VND',
        input.description || '',
        JSON.stringify(input.images || []),
        input.videoUrl || '',
        input.modelUrl || '',
        input.sourceUrl || '',
        input.contactUrl || '',
        input.sku || '',
        input.inStock === false ? 0 : 1,
        input.status || 'active'
      );

    return this.getProductById(id)!;
  }

  updateProduct(id: string, patch: UpdateV28ProductInput): V28Product | null {
    const current = this.getProductById(id);
    if (!current) return null;

    if (patch.boothId !== undefined && patch.boothId !== null) {
      const booth = this.getBoothById(patch.boothId);
      if (!booth || booth.companyId !== current.companyId) {
        const err = new Error('Gian hàng không thuộc cùng doanh nghiệp với sản phẩm.') as Error & {
          statusCode?: number;
        };
        err.statusCode = 403;
        throw err;
      }
    }

    const nextSku = patch.sku !== undefined ? patch.sku.trim() : current.sku;
    if (nextSku && nextSku.toLowerCase() !== current.sku.trim().toLowerCase()) {
      const dup = this.findProductByCompanyAndSku(current.companyId, nextSku);
      if (dup && dup.id !== id) {
        const err = new Error(`Mã SKU '${nextSku}' đã tồn tại trong doanh nghiệp.`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 409;
        throw err;
      }
    }

    this.db
      .prepare(
        `UPDATE products
         SET booth_id = ?, name = ?, sku = ?, price = ?, currency = ?, description = ?,
             images_json = ?, video_url = ?, model_url = ?, source_url = ?, contact_url = ?,
             in_stock = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        patch.boothId !== undefined ? patch.boothId : current.boothId,
        patch.name ?? current.name,
        nextSku,
        patch.price ?? current.price,
        patch.currency ?? current.currency,
        patch.description ?? current.description,
        JSON.stringify(patch.images ?? current.images),
        patch.videoUrl ?? current.videoUrl,
        patch.modelUrl ?? current.modelUrl,
        patch.sourceUrl ?? current.sourceUrl,
        patch.contactUrl ?? current.contactUrl,
        (patch.inStock ?? current.inStock) ? 1 : 0,
        patch.status ?? current.status,
        id
      );

    return this.getProductById(id);
  }

  // ============================================================================
  // TRANSACTIONAL HELPER & IMPORT JOB REPORTS
  // ============================================================================
  runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  saveImportJobReport(report: ImportJobReport): void {
    this.db
      .prepare(
        `INSERT INTO import_jobs (
          id, company_id, source_type, filename, status, duplicate_strategy,
          total_rows, created_count, updated_count, skipped_count, failed_count,
          duration_ms, report_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.jobId,
        report.companyId,
        report.sourceType,
        report.filename,
        report.status,
        report.duplicateStrategy,
        report.totalRows,
        report.createdCount,
        report.updatedCount,
        report.skippedCount,
        report.failedCount,
        report.durationMs,
        JSON.stringify(report.errors || []),
        report.createdAt
      );
  }

  getImportJobReport(jobId: string): ImportJobReport | null {
    const row = this.db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    let errors: Array<{ rowNumber: number; sku?: string; reason: string }> = [];
    try {
      const parsed = JSON.parse(String(row.report_json || '[]'));
      if (Array.isArray(parsed)) errors = parsed;
    } catch {
      errors = [];
    }
    return {
      jobId: String(row.id),
      companyId: String(row.company_id),
      sourceType: row.source_type === 'url' ? 'url' : 'excel',
      filename: String(row.filename || ''),
      status: row.status === 'failed' ? 'failed' : 'committed',
      duplicateStrategy:
        row.duplicate_strategy === 'update' || row.duplicate_strategy === 'create'
          ? row.duplicate_strategy
          : 'skip',
      totalRows: Number(row.total_rows || 0),
      createdCount: Number(row.created_count || 0),
      updatedCount: Number(row.updated_count || 0),
      skippedCount: Number(row.skipped_count || 0),
      failedCount: Number(row.failed_count || 0),
      durationMs: Number(row.duration_ms || 0),
      errors,
      createdAt: String(row.created_at || ''),
    };
  }

  close(): void {
    this.db.close();
  }
}
