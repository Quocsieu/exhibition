import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import {
  ARCHETYPE_MAP,
  V28_ARCHETYPES,
  generateDynamicExhibitionLayout,
  validateExhibitionLayout,
  getBoothWorldAabb,
  type GeneratedClusterSpec,
  type GeneratedExhibitionLayout,
  type LayoutGeneratorInput,
  type LayoutValidationResult,
  type RectBounds,
  type RoofBoundsMetadata,
  type V28ArchetypeId,
} from './layoutGenerator.js';
import { VALID_BOOTH_SLOT_IDS } from '../../schemas/expoSchemas.js';
import type { ExhibitionVersionStatus, V28Product } from '../../schemas/v28Schemas.js';
import { V28CategoryService } from './categoryService.js';
import {
  computeZoneAwareCompactedLayout,
  planSparseZoneConsolidation,
} from './zoneCompaction.js';

export interface ExhibitionSummary {
  id: string;
  name: string;
  status: string;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  activeBoothCount: number;
  activeZoneCount: number;
  latestDraftVersionId: string | null;
  latestDraftVersionNumber: number | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: ExhibitionVersionStatus;
    targetBoothCount: number;
    createdAt: string;
    publishedAt: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ExhibitionZoneRecord {
  id: string;
  versionId: string;
  code: string;
  categoryId: string | null;
  displayName: string;
  categoryTag: string;
  bounds: RectBounds;
  sortOrder: number;
  boothCount: number;
}

export interface ResolvedBoothSlotView {
  slotId: string;
  product: V28Product | null;
}

export interface ExhibitionBoothPlacementView {
  versionId: string;
  boothId: string;
  boothName: string;
  tagline: string;
  description: string;
  category: string;
  color: string;
  logoUrl?: string;
  contactUrl?: string;
  contactEmail?: string;
  companyId: string | null;
  companyName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  zoneCategoryTag?: string;
  slotIndex: number;
  positionX: number;
  positionZ: number;
  rotationY: number;
  archetypeId: V28ArchetypeId;
  archetypeLabel: string;
  archetypeTheme: string;
  glbPath: string;
  footprintWidth: number;
  footprintDepth: number;
  approachPoint: { x: number; z: number };
  focusCameraPoint: { x: number; z: number };
  placementStatus: string;
  slots: ResolvedBoothSlotView[];
  assignedSlotCount: number;
}

export interface ExhibitionVersionDetail {
  exhibitionId: string;
  exhibitionName: string;
  versionId: string;
  versionNumber: number;
  status: ExhibitionVersionStatus;
  targetBoothCount: number;
  ownerCompanyId?: string | null;
  ownerCompany?: {
    id: string;
    name: string;
    logoUrl: string;
    contactUrl: string;
    contactEmail: string;
  } | null;
  createdAt: string;
  publishedAt: string | null;
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
  walkableRegions?: RectBounds[];
  centralAvenueBounds: RectBounds;
  welcomeAreaBounds: RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
  cameraOverviewBounds: GeneratedExhibitionLayout['cameraOverviewBounds'];
  roofBounds: RoofBoundsMetadata;
  walkwayGraph: GeneratedExhibitionLayout['walkwayGraph'];
  clusters: GeneratedClusterSpec[];
  zones: ExhibitionZoneRecord[];
  booths: ExhibitionBoothPlacementView[];
  validation: LayoutValidationResult;
}

const BRAND_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316'];

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export class V28ExhibitionService {
  constructor(private readonly v28Db: V28CatalogDatabase) { }

  private get db() {
    return this.v28Db.getConnection();
  }

  /**
   * Ensure at least one published exhibition exists for ?world=dynamic.
   * Safe & idempotent: does nothing if an exhibition already exists.
   */
  public ensureDefaultExhibition(targetBoothCount = 20): ExhibitionSummary {
    const existing = this.listExhibitions();
    if (existing.length > 0) {
      return existing[0];
    }
    const created = this.createExhibition({
      name: 'Grand Expo World V28',
      targetBoothCount,
      preferredZoneCapacity: 10,
    });
    if (created.latestDraftVersionId) {
      this.publishVersion(created.id, created.latestDraftVersionId);
    }
    return this.getExhibitionSummary(created.id)!;
  }

  public listExhibitions(): ExhibitionSummary[] {
    const rows = this.db
      .prepare('SELECT id FROM exhibitions ORDER BY created_at ASC')
      .all() as Array<{ id: string }>;
    return rows.map((r) => this.getExhibitionSummary(r.id)!).filter(Boolean);
  }

  public getExhibitionSummary(exhibitionId: string): ExhibitionSummary | null {
    const exh = this.db
      .prepare('SELECT * FROM exhibitions WHERE id = ?')
      .get(exhibitionId) as Record<string, unknown> | undefined;
    if (!exh) return null;

    const versions = (
      this.db
        .prepare(
          'SELECT id, version_number, status, target_booth_count, created_at, published_at FROM exhibition_versions WHERE exhibition_id = ? ORDER BY version_number DESC'
        )
        .all(exhibitionId) as Array<Record<string, unknown>>
    ).map((v) => ({
      id: String(v.id),
      versionNumber: Number(v.version_number),
      status: String(v.status) as ExhibitionVersionStatus,
      targetBoothCount: Number(v.target_booth_count),
      createdAt: String(v.created_at),
      publishedAt: v.published_at ? String(v.published_at) : null,
    }));

    const activeVersionId = exh.active_version_id ? String(exh.active_version_id) : null;
    const activeVersion = versions.find((v) => v.id === activeVersionId) || null;
    const latestDraft = versions.find((v) => v.status === 'draft') || null;

    let activeZoneCount = 0;
    let activeBoothCount = 0;
    if (activeVersionId) {
      activeZoneCount = Number(
        (
          this.db
            .prepare(
              `SELECT COUNT(DISTINCT zone_id) as c FROM exhibition_version_booths
               WHERE version_id = ? AND COALESCE(placement_status, 'placed') NOT IN ('hidden', 'removed')`
            )
            .get(activeVersionId) as { c: number }
        ).c
      );
      activeBoothCount = Number(
        (
          this.db
            .prepare(
              `SELECT COUNT(*) as c FROM exhibition_version_booths
               WHERE version_id = ? AND COALESCE(placement_status, 'placed') NOT IN ('hidden', 'removed')`
            )
            .get(activeVersionId) as { c: number }
        ).c
      );
    }

    return {
      id: String(exh.id),
      name: String(exh.name),
      status: String(exh.status),
      activeVersionId,
      activeVersionNumber: activeVersion ? activeVersion.versionNumber : null,
      activeBoothCount,
      activeZoneCount,
      latestDraftVersionId: latestDraft ? latestDraft.id : null,
      latestDraftVersionNumber: latestDraft ? latestDraft.versionNumber : null,
      versions,
      createdAt: String(exh.created_at),
      updatedAt: String(exh.updated_at),
    };
  }

  public createExhibition(input: {
    name: string;
    targetBoothCount?: number;
    preferredZoneCapacity?: number;
  }): ExhibitionSummary {
    const id = `exh-${crypto.randomBytes(4).toString('hex')}`;
    this.db
      .prepare(
        `INSERT INTO exhibitions (id, name, status, active_version_id, created_at, updated_at)
         VALUES (?, ?, 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(id, input.name.trim());

    this.createDraftVersion(id, {
      targetBoothCount: input.targetBoothCount ?? 20,
      preferredZoneCapacity: input.preferredZoneCapacity ?? 10,
    });

    return this.getExhibitionSummary(id)!;
  }

  /**
   * Create a new Draft layout version for an exhibition.
   * Stable Booth ID Reuse Guarantee:
   * - Reuses existing booths in deterministic order (original V27.5 booths first, then v28-booth-007..NNN).
   * - When downsizing (e.g. 20 -> 10), extra booths are NEVER deleted; their products & slot assignments stay intact.
   * - When upsizing again (e.g. 10 -> 20), the exact same previously created booth IDs are restored first!
   */
  public createDraftVersion(
    exhibitionId: string,
    input: LayoutGeneratorInput & { baseVersionId?: string; ownerCompanyId?: string }
  ): ExhibitionVersionDetail {
    const exh = this.db.prepare('SELECT id FROM exhibitions WHERE id = ?').get(exhibitionId) as
      | { id: string }
      | undefined;
    if (!exh) {
      throw httpError(404, 'Không tìm thấy triển lãm.');
    }

    const explicitOwnerCompany = input.ownerCompanyId
      ? this.v28Db.getCompanyById(input.ownerCompanyId)
      : null;
    if (input.ownerCompanyId && (!explicitOwnerCompany || explicitOwnerCompany.status !== 'active')) {
      throw httpError(404, `Doanh nghiệp sở hữu '${input.ownerCompanyId}' không tồn tại hoặc đang bị vô hiệu hóa.`);
    }

    // Derive Category-Based Zones:
    // - If Admin explicitly specifies `zoneCount` x `boothsPerZone`, create EXACTLY `zoneCount` zones
    //   with `boothsPerZone` booths each (attaching DB categories in order, and clean Khu X for extra zones).
    // - Otherwise auto-derive from DB categories as before.
    let effectiveCategoryZones = input.categoryZones;
    const catRows = this.db
      .prepare('SELECT id, name FROM categories ORDER BY sort_order ASC, name ASC')
      .all() as Array<{ id: string; name: string }>;

    if ((!effectiveCategoryZones || effectiveCategoryZones.length === 0) && input.zoneCount && input.boothsPerZone) {
      const zc = Math.max(1, Math.min(30, Math.floor(input.zoneCount)));
      const bpz = Math.max(1, Math.min(50, Math.floor(input.boothsPerZone)));
      effectiveCategoryZones = Array.from({ length: zc }, (_, idx) => {
        const cat = catRows[idx];
        const code = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? String(Math.floor(idx / 26)) : '');
        return {
          categoryId: cat ? cat.id : '',
          categoryName: cat ? cat.name : `Khu ${code}`,
          boothCount: bpz,
        };
      });
    } else if ((!effectiveCategoryZones || effectiveCategoryZones.length === 0) && catRows.length > 0) {
      const count = Math.max(1, Math.floor(input.targetBoothCount));
      const activeCatCount = Math.min(catRows.length, Math.max(1, Math.ceil(count / 12)));
      const chosen = catRows.slice(0, activeCatCount);
      const base = Math.floor(count / chosen.length);
      let rem = count % chosen.length;
      effectiveCategoryZones = chosen.map((c) => {
        const extra = rem > 0 ? 1 : 0;
        if (rem > 0) rem--;
        return { categoryId: c.id, categoryName: c.name, boothCount: base + extra };
      });
    }

    const effectiveTargetBoothCount =
      input.zoneCount && input.boothsPerZone
        ? Math.floor(input.zoneCount) * Math.floor(input.boothsPerZone)
        : input.targetBoothCount;

    const layout = generateDynamicExhibitionLayout({
      ...input,
      targetBoothCount: effectiveTargetBoothCount,
      categoryZones: effectiveCategoryZones,
    });
    const activeCompanies = this.v28Db.listCompanies({ status: 'active' });
    if (activeCompanies.length === 0) {
      throw httpError(400, 'Cần có ít nhất 1 doanh nghiệp đang hoạt động để sinh layout.');
    }

    // Preserve custom zone names from baseVersionId (or active version) if available
    const existingZoneNames = new Map<string, { displayName: string; categoryTag: string }>();
    const refVersionId =
      input.baseVersionId ||
      (
        this.db.prepare('SELECT active_version_id FROM exhibitions WHERE id = ?').get(exhibitionId) as
        | { active_version_id: string | null }
        | undefined
      )?.active_version_id;
    if (refVersionId) {
      const prevZones = this.db
        .prepare('SELECT code, display_name, category_tag FROM zones WHERE version_id = ?')
        .all(refVersionId) as Array<{ code: string; display_name: string; category_tag: string }>;
      for (const z of prevZones) {
        existingZoneNames.set(z.code, { displayName: z.display_name, categoryTag: z.category_tag });
      }
    }

    const versionId = `ver-${crypto.randomBytes(5).toString('hex')}`;

    this.v28Db.runInTransaction(() => {
      const maxVerRow = this.db
        .prepare('SELECT COALESCE(MAX(version_number), 0) as m FROM exhibition_versions WHERE exhibition_id = ?')
        .get(exhibitionId) as { m: number };
      const nextVersionNumber = Number(maxVerRow.m) + 1;

      // 1. Collect existing booths in deterministic stable order:
      //    SINGLE-BUSINESS MODE (`explicitOwnerCompany`): reuse ONLY booths owned by this single company
      //    so ZERO demo/other-company booths ever leak into this exhibition!
      const existingBoothRows = explicitOwnerCompany
        ? (this.db
          .prepare(
            `SELECT id, company_id, name FROM booths
               WHERE company_id = ?
               ORDER BY id ASC`
          )
          .all(explicitOwnerCompany.id) as Array<{ id: string; company_id: string | null; name: string }>)
        : (this.db
          .prepare(
            `SELECT id, company_id, name FROM booths
               ORDER BY CASE WHEN id LIKE 'v28-booth-%' THEN 1 ELSE 0 END ASC, id ASC`
          )
          .all() as Array<{ id: string; company_id: string | null; name: string }>);

      const boothIdsToUse: string[] = [];
      for (const b of existingBoothRows) {
        if (boothIdsToUse.length < layout.placements.length) {
          boothIdsToUse.push(b.id);
        }
      }

      // 2. Provision additional booths ONLY if targetBoothCount exceeds existing booths
      const insertBooth = this.db.prepare(`
        INSERT INTO booths (
          id, name, company_name, tagline, description, category, color,
          logo_url, banner_url, contact_email, contact_url,
          position_x, position_z, rotation_y, width, depth, company_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);

      const allExistingBoothIds = new Set(
        (this.db.prepare('SELECT id FROM booths').all() as Array<{ id: string }>).map((r) => r.id)
      );
      const ownerPrefix = explicitOwnerCompany
        ? `v28-${explicitOwnerCompany.id.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase()}-b`
        : 'v28-booth-';
      let nextNum = existingBoothRows.length + 1;
      while (boothIdsToUse.length < layout.placements.length) {
        let candidateId = `${ownerPrefix}${String(nextNum).padStart(3, '0')}`;
        while (allExistingBoothIds.has(candidateId)) {
          nextNum++;
          candidateId = `${ownerPrefix}${String(nextNum).padStart(3, '0')}`;
        }
        allExistingBoothIds.add(candidateId);
        const slotIdx = boothIdsToUse.length;
        const placement = layout.placements[slotIdx];
        const comp = explicitOwnerCompany || activeCompanies[slotIdx % activeCompanies.length];
        const color = BRAND_COLORS[slotIdx % BRAND_COLORS.length];
        const boothLabel = explicitOwnerCompany
          ? `${comp.name} — Gian #${slotIdx + 1}`
          : `${comp.name} #${Math.floor(slotIdx / activeCompanies.length) + 1}`;

        insertBooth.run(
          candidateId,
          boothLabel,
          comp.name,
          comp.category || 'Triển lãm V28',
          comp.description || `Gian hàng trưng bày của ${comp.name}`,
          comp.category || 'General',
          color,
          comp.logoUrl || '',
          comp.contactEmail || '',
          comp.contactUrl || '',
          placement.positionX,
          placement.positionZ,
          placement.rotationY,
          placement.footprintWidth,
          placement.footprintDepth,
          comp.id
        );
        boothIdsToUse.push(candidateId);
        nextNum++;
      }

      // 3. Insert exhibition_versions row (recording ownerCompanyId for single-business invariant!)
      this.db
        .prepare(
          `INSERT INTO exhibition_versions (
            id, exhibition_id, version_number, status, target_booth_count,
            layout_config_json, roof_config_json, created_at, published_at
          ) VALUES (?, ?, ?, 'draft', ?, ?, ?, CURRENT_TIMESTAMP, NULL)`
        )
        .run(
          versionId,
          exhibitionId,
          nextVersionNumber,
          layout.placements.length,
          JSON.stringify({
            ownerCompanyId: explicitOwnerCompany ? explicitOwnerCompany.id : null,
            config: layout.config,
            hallWidth: layout.hallWidth,
            hallDepth: layout.hallDepth,
            hallBounds: layout.hallBounds,
            walkableBounds: layout.walkableBounds,
            walkableRegions: layout.walkableRegions,
            centralAvenueBounds: layout.centralAvenueBounds,
            welcomeAreaBounds: layout.welcomeAreaBounds,
            spawnPoint: layout.spawnPoint,
            directoryPoint: layout.directoryPoint,
            cameraOverviewBounds: layout.cameraOverviewBounds,
            walkwayGraph: layout.walkwayGraph,
            clusters: layout.clusters,
          }),
          JSON.stringify(layout.roofBounds)
        );

      // 4. Insert zones (preserving stable category_id)
      const zoneIdByCode = new Map<string, string>();
      const insertZone = this.db.prepare(`
        INSERT INTO zones (id, version_id, code, display_name, category_tag, bounds_json, sort_order, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const z of layout.zones) {
        const zId = `zone-${versionId}-${z.code}`;
        const preserved = existingZoneNames.get(z.code);
        const keepPreservedName =
          preserved && (!z.categoryId || !/^Khu\s+[A-Z]+$/i.test(preserved.displayName));
        insertZone.run(
          zId,
          versionId,
          z.code,
          keepPreservedName ? preserved.displayName : z.displayName,
          keepPreservedName ? preserved.categoryTag : z.categoryTag,
          JSON.stringify(z.bounds),
          z.sortOrder,
          z.categoryId || null
        );
        zoneIdByCode.set(z.code, zId);
      }

      // 5. Freeze currently active published version snapshot (if any) before creating the new Draft
      const prevPubRow = this.db
        .prepare("SELECT id FROM exhibition_versions WHERE exhibition_id = ? AND status = 'published' LIMIT 1")
        .get(exhibitionId) as { id: string } | undefined;
      if (prevPubRow?.id) {
        this.ensureVersionSnapshot(prevPubRow.id);
      }

      // 6. Insert exhibition_version_booths placements + isolated per-version metadata & slot snapshots
      const insertPlacement = this.db.prepare(`
        INSERT INTO exhibition_version_booths (
          version_id, booth_id, zone_id, slot_index,
          position_x, position_z, rotation_y, archetype_id, placement_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'placed')
      `);
      const insertMeta = this.db.prepare(`
        INSERT OR REPLACE INTO exhibition_version_booth_meta (
          version_id, booth_id, booth_name, category, company_id, company_name
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertDraftSlot = this.db.prepare(`
        INSERT OR REPLACE INTO exhibition_version_booth_slots (
          version_id, booth_id, slot_id, product_id, updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const baseSnapshotId = input.baseVersionId || prevPubRow?.id || null;
      const baseHasSnap = baseSnapshotId ? this.hasVersionSnapshot(baseSnapshotId) : false;

      for (let i = 0; i < layout.placements.length; i++) {
        const p = layout.placements[i];
        const bId = boothIdsToUse[i];
        const zId = zoneIdByCode.get(p.zoneCode)!;
        insertPlacement.run(
          versionId,
          bId,
          zId,
          p.slotIndex,
          p.positionX,
          p.positionZ,
          p.rotationY,
          p.archetypeId
        );

        const bRow = this.db
          .prepare(
            `SELECT b.name, b.category, b.company_id, COALESCE(c.name, b.company_name, b.name) as company_name
             FROM booths b
             LEFT JOIN companies c ON c.id = b.company_id
             WHERE b.id = ?`
          )
          .get(bId) as { name: string; category: string; company_id: string | null; company_name: string } | undefined;
        if (bRow) {
          insertMeta.run(versionId, bId, bRow.name, bRow.category || 'General', bRow.company_id, bRow.company_name || '');
        }

        // Copy existing slot assignments for this booth into the Draft's isolated slot table:
        // - If this booth exists in baseSnapshotId, copy strictly from baseSnapshotId (isolated!)
        // - If this booth is being re-activated from archived history (not in baseSnapshotId), restore from booth_slot_assignments
        const boothInBaseSnap =
          baseHasSnap && baseSnapshotId
            ? Boolean(
              this.db
                .prepare('SELECT 1 FROM exhibition_version_booths WHERE version_id = ? AND booth_id = ? LIMIT 1')
                .get(baseSnapshotId, bId)
            )
            : false;
        const existingSlots = boothInBaseSnap && baseSnapshotId
          ? (this.db
            .prepare(
              `SELECT s.slot_id, s.product_id, p.company_id
                 FROM exhibition_version_booth_slots s
                 JOIN products p ON p.id = s.product_id
                 WHERE s.version_id = ? AND s.booth_id = ? AND p.status = 'active'`
            )
            .all(baseSnapshotId, bId) as Array<{ slot_id: string; product_id: string; company_id: string }>)
          : (this.db
            .prepare(
              `SELECT s.slot_id, s.product_id, p.company_id
                 FROM booth_slot_assignments s
                 JOIN products p ON p.id = s.product_id
                 WHERE s.booth_id = ? AND p.status = 'active'`
            )
            .all(bId) as Array<{ slot_id: string; product_id: string; company_id: string }>);
        for (const s of existingSlots) {
          if (!bRow?.company_id || s.company_id === bRow.company_id) {
            insertDraftSlot.run(versionId, bId, s.slot_id, s.product_id);
          }
        }
      }
    });

    return this.getVersionDetail(versionId)!;
  }

  private hasVersionSnapshot(versionId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM exhibition_version_booth_meta WHERE version_id = ? LIMIT 1')
      .get(versionId);
    return Boolean(row);
  }

  /**
   * Lazily freezes a version's booth metadata & slot assignments into the per-version snapshot tables
   * so legacy versions become 100% immutable before any Draft mutates them.
   */
  public ensureVersionSnapshot(versionId: string): void {
    if (this.hasVersionSnapshot(versionId)) return;
    const rows = this.db
      .prepare(
        `SELECT evb.booth_id, b.name, b.category, b.company_id, COALESCE(c.name, b.company_name, b.name) as company_name
         FROM exhibition_version_booths evb
         JOIN booths b ON b.id = evb.booth_id
         LEFT JOIN companies c ON c.id = b.company_id
         WHERE evb.version_id = ?`
      )
      .all(versionId) as Array<{
        booth_id: string;
        name: string;
        category: string;
        company_id: string | null;
        company_name: string;
      }>;
    if (rows.length === 0) return;

    const insMeta = this.db.prepare(`
      INSERT OR IGNORE INTO exhibition_version_booth_meta (
        version_id, booth_id, booth_name, category, company_id, company_name
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insSlot = this.db.prepare(`
      INSERT OR IGNORE INTO exhibition_version_booth_slots (
        version_id, booth_id, slot_id, product_id, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const r of rows) {
      insMeta.run(versionId, r.booth_id, r.name, r.category || 'General', r.company_id, r.company_name || '');
      const liveSlots = this.db
        .prepare('SELECT slot_id, product_id FROM booth_slot_assignments WHERE booth_id = ?')
        .all(r.booth_id) as Array<{ slot_id: string; product_id: string }>;
      for (const s of liveSlots) {
        insSlot.run(versionId, r.booth_id, s.slot_id, s.product_id);
      }
    }
  }

  /**
   * Synchronizes a published/rolled-back version's immutable snapshot into global `booths` & `booth_slot_assignments`,
   * and recalculates `booths.status` across ALL exhibitions' active published versions.
   */
  private syncVersionSnapshotToLiveTables(versionId: string): void {
    this.ensureVersionSnapshot(versionId);
    const metaRows = this.db
      .prepare('SELECT booth_id, booth_name, category, company_id, company_name FROM exhibition_version_booth_meta WHERE version_id = ?')
      .all(versionId) as Array<{
        booth_id: string;
        booth_name: string;
        category: string;
        company_id: string | null;
        company_name: string;
      }>;
    const updBooth = this.db.prepare(
      'UPDATE booths SET name = ?, category = ?, company_id = ?, company_name = ? WHERE id = ?'
    );
    const delSlots = this.db.prepare('DELETE FROM booth_slot_assignments WHERE booth_id = ?');
    const insLiveSlot = this.db.prepare(
      `INSERT OR REPLACE INTO booth_slot_assignments (booth_id, slot_id, product_id, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    );

    for (const m of metaRows) {
      updBooth.run(m.booth_name, m.category || 'General', m.company_id, m.company_name || '', m.booth_id);
      delSlots.run(m.booth_id);
      const snapSlots = this.db
        .prepare('SELECT slot_id, product_id FROM exhibition_version_booth_slots WHERE version_id = ? AND booth_id = ?')
        .all(versionId, m.booth_id) as Array<{ slot_id: string; product_id: string }>;
      for (const s of snapSlots) {
        insLiveSlot.run(m.booth_id, s.slot_id, s.product_id);
      }
    }

    // Recompute active/archived status across ALL exhibitions' active published versions (MED-02)
    const activeRows = this.db
      .prepare(
        `SELECT DISTINCT evb.booth_id
         FROM exhibition_version_booths evb
         JOIN exhibitions e ON e.active_version_id = evb.version_id`
      )
      .all() as Array<{ booth_id: string }>;
    const activeIds = new Set(activeRows.map((r) => r.booth_id));
    const allBoothIds = (this.db.prepare('SELECT id FROM booths').all() as Array<{ id: string }>).map((r) => r.id);
    const setStatus = this.db.prepare('UPDATE booths SET status = ? WHERE id = ?');
    for (const bId of allBoothIds) {
      setStatus.run(activeIds.has(bId) ? 'active' : 'archived', bId);
    }
  }

  public getVersionDetail(
    versionId: string,
    options?: { includeHidden?: boolean }
  ): ExhibitionVersionDetail | null {
    const includeHidden = options?.includeHidden === true;
    const ver = this.db
      .prepare(
        `SELECT v.*, e.name as exhibition_name
         FROM exhibition_versions v
         JOIN exhibitions e ON e.id = v.exhibition_id
         WHERE v.id = ?`
      )
      .get(versionId) as Record<string, unknown> | undefined;
    if (!ver) return null;

    const layoutMeta = JSON.parse(String(ver.layout_config_json || '{}'));
    const roofBounds: RoofBoundsMetadata = JSON.parse(String(ver.roof_config_json || '{}'));

    const zoneRows = this.db
      .prepare('SELECT * FROM zones WHERE version_id = ? ORDER BY sort_order ASC')
      .all(versionId) as Array<Record<string, unknown>>;

    const hasSnap = this.hasVersionSnapshot(versionId);

    const placementRows = this.db
      .prepare(
        `SELECT evb.*,
                COALESCE(evbm.booth_name, b.name) as booth_name,
                b.tagline, b.description,
                COALESCE(NULLIF(evbm.category, ''), b.category) as category,
                b.color,
                COALESCE(evbm.company_id, b.company_id) as company_id,
                COALESCE(NULLIF(c.name, ''), NULLIF(evbm.company_name, ''), b.company_name, b.name) as company_name,
                COALESCE(NULLIF(c.logo_url, ''), b.logo_url, '') as logo_url,
                COALESCE(NULLIF(c.contact_url, ''), b.contact_url, '') as contact_url,
                COALESCE(NULLIF(c.contact_email, ''), b.contact_email, '') as contact_email,
                z.code as zone_code, z.display_name as zone_name, z.category_tag as zone_category_tag
         FROM exhibition_version_booths evb
         JOIN booths b ON b.id = evb.booth_id
         JOIN zones z ON z.id = evb.zone_id
         LEFT JOIN exhibition_version_booth_meta evbm ON evbm.version_id = evb.version_id AND evbm.booth_id = evb.booth_id
         LEFT JOIN companies c ON c.id = COALESCE(evbm.company_id, b.company_id)
         WHERE evb.version_id = ?
           AND COALESCE(evb.placement_status, 'placed') != 'removed'
           ${includeHidden ? '' : "AND COALESCE(evb.placement_status, 'placed') != 'hidden'"}
         ORDER BY evb.slot_index ASC`
      )
      .all(versionId) as Array<Record<string, unknown>>;

    // Batch-load all slot assignments + products for booths in this version (isolated by version_id when snapshotted!)
    const slotRows = hasSnap
      ? (this.db
        .prepare(
          `SELECT evbs.booth_id AS assigned_booth_id, evbs.slot_id, p.*
             FROM exhibition_version_booth_slots evbs
             JOIN products p ON p.id = evbs.product_id
             WHERE evbs.version_id = ?`
        )
        .all(versionId) as Array<Record<string, unknown>>)
      : (this.db
        .prepare(
          `SELECT bsa.booth_id AS assigned_booth_id, bsa.slot_id, p.*
             FROM booth_slot_assignments bsa
             JOIN products p ON p.id = bsa.product_id
             WHERE bsa.booth_id IN (SELECT booth_id FROM exhibition_version_booths WHERE version_id = ?)`
        )
        .all(versionId) as Array<Record<string, unknown>>);

    const slotsByBooth = new Map<string, Map<string, V28Product>>();
    for (const r of slotRows) {
      const bId = String(r.assigned_booth_id);
      if (!slotsByBooth.has(bId)) slotsByBooth.set(bId, new Map());
      let images: string[] = [];
      try {
        const parsed = JSON.parse(String(r.images_json || '[]'));
        if (Array.isArray(parsed)) images = parsed.map(String);
      } catch { }
      slotsByBooth.get(bId)!.set(String(r.slot_id), {
        id: String(r.id),
        companyId: String(r.company_id),
        boothId: r.booth_id ? String(r.booth_id) : null,
        name: String(r.name),
        price: Number(r.price || 0),
        currency: String(r.currency || 'VND'),
        description: String(r.description || ''),
        images,
        videoUrl: String(r.video_url || ''),
        modelUrl: String(r.model_url || ''),
        sourceUrl: String(r.source_url || ''),
        contactUrl: String(r.contact_url || ''),
        sku: String(r.sku || ''),
        inStock: Boolean(r.in_stock),
        status: String(r.status || 'active') as 'active' | 'inactive',
        createdAt: String(r.created_at || ''),
        updatedAt: String(r.updated_at || ''),
      });
    }

    const booths: ExhibitionBoothPlacementView[] = placementRows.map((row) => {
      const archetypeId = (ARCHETYPE_MAP[String(row.archetype_id) as V28ArchetypeId]
        ? String(row.archetype_id)
        : 'grand_portal') as V28ArchetypeId;
      const spec = ARCHETYPE_MAP[archetypeId];
      const px = Number(row.position_x);
      const pz = Number(row.position_z);
      const rotY = Number(row.rotation_y || 0);
      const fx = Math.sin(rotY);
      const fz = Math.cos(rotY);
      const bId = String(row.booth_id);
      const slotMap = slotsByBooth.get(bId);
      const slots: ResolvedBoothSlotView[] = Array.from(VALID_BOOTH_SLOT_IDS).map((slotId) => ({
        slotId,
        product: slotMap?.get(slotId) || null,
      }));
      const assignedSlotCount = slots.filter((s) => s.product !== null).length;

      return {
        versionId,
        boothId: bId,
        boothName: String(row.booth_name),
        tagline: String(row.tagline || ''),
        description: String(row.description || ''),
        category: String(row.category || 'General'),
        color: String(row.color || '#0ea5e9'),
        logoUrl: String(row.logo_url || ''),
        contactUrl: String(row.contact_url || ''),
        contactEmail: String(row.contact_email || ''),
        companyId: row.company_id ? String(row.company_id) : null,
        companyName: String(row.company_name || row.booth_name),
        zoneId: String(row.zone_id),
        zoneCode: String(row.zone_code),
        zoneName: String(row.zone_name),
        zoneCategoryTag: String(row.zone_category_tag || ''),
        slotIndex: Number(row.slot_index),
        positionX: px,
        positionZ: pz,
        rotationY: rotY,
        archetypeId,
        archetypeLabel: spec.label,
        archetypeTheme: spec.theme,
        glbPath: spec.glbPath,
        footprintWidth: spec.width,
        footprintDepth: spec.depth,
        approachPoint: {
          x: Math.round((px + fx * (spec.depth / 2 + 2.2)) * 100) / 100,
          z: Math.round((pz + fz * (spec.depth / 2 + 2.2)) * 100) / 100,
        },
        focusCameraPoint: {
          x: Math.round((px + fx * (spec.depth / 2 + 4.2)) * 100) / 100,
          z: Math.round((pz + fz * (spec.depth / 2 + 4.2)) * 100) / 100,
        },
        placementStatus: String(row.placement_status || 'placed'),
        slots,
        assignedSlotCount,
      };
    });

    const boothCountByZone = new Map<string, number>();
    for (const b of booths) {
      boothCountByZone.set(b.zoneId, (boothCountByZone.get(b.zoneId) || 0) + 1);
    }

    const rawZones: ExhibitionZoneRecord[] = zoneRows.map((z) => ({
      id: String(z.id),
      versionId,
      code: String(z.code),
      categoryId: z.category_id ? String(z.category_id) : null,
      displayName: String(z.display_name),
      categoryTag: String(z.category_tag || ''),
      bounds: JSON.parse(String(z.bounds_json || '{}')),
      sortOrder: Number(z.sort_order),
      boothCount: boothCountByZone.get(String(z.id)) || 0,
    }));

    const compactedLayout = computeZoneAwareCompactedLayout(
      layoutMeta,
      rawZones,
      booths,
      roofBounds
    );
    const zones = compactedLayout.zones;
    const clusters = compactedLayout.clusters;
    const finalBooths = compactedLayout.booths;

    const validation = validateExhibitionLayout({
      hallBounds: compactedLayout.hallBounds,
      centralAvenueBounds: compactedLayout.centralAvenueBounds,
      welcomeAreaBounds: compactedLayout.welcomeAreaBounds,
      walkwayGraph: compactedLayout.walkwayGraph,
      clusters,
      zones: zones.map((z) => ({
        code: z.code,
        categoryId: z.categoryId,
        displayName: z.displayName,
        categoryTag: z.categoryTag,
        bounds: z.bounds,
        sortOrder: z.sortOrder,
        boothCount: z.boothCount,
        clusterCount: clusters.filter((c) => c.zoneCode === z.code).length || 1,
        openingDirection: clusters.find((c) => c.zoneCode === z.code)?.openingDirection || 'south',
      })),
      placements: finalBooths.map((b) => ({
        slotIndex: b.slotIndex,
        clusterId: 'cluster-01',
        clusterIndex: 0,
        zoneCode: b.zoneCode,
        categoryId: null,
        positionX: b.positionX,
        positionZ: b.positionZ,
        rotationY: b.rotationY,
        archetypeId: b.archetypeId,
        footprintWidth: b.footprintWidth,
        footprintDepth: b.footprintDepth,
        approachPoint: b.approachPoint,
        focusCameraPoint: b.focusCameraPoint,
      })),
    });

    const explicitOwnerId =
      typeof (layoutMeta as { ownerCompanyId?: unknown }).ownerCompanyId === 'string' &&
        (layoutMeta as { ownerCompanyId?: string }).ownerCompanyId
        ? (layoutMeta as { ownerCompanyId: string }).ownerCompanyId
        : null;
    const distinctBoothOwners = Array.from(
      new Set(finalBooths.map((b) => b.companyId).filter((id): id is string => Boolean(id)))
    );
    const resolvedOwnerId = explicitOwnerId || (distinctBoothOwners.length === 1 ? distinctBoothOwners[0] : null);
    const resolvedOwnerRow = resolvedOwnerId ? this.v28Db.getCompanyById(resolvedOwnerId) : null;
    const ownerCompany = resolvedOwnerRow
      ? {
        id: resolvedOwnerRow.id,
        name: resolvedOwnerRow.name,
        logoUrl: resolvedOwnerRow.logoUrl || '',
        contactUrl: resolvedOwnerRow.contactUrl || '',
        contactEmail: resolvedOwnerRow.contactEmail || '',
      }
      : null;

    return {
      exhibitionId: String(ver.exhibition_id),
      exhibitionName: String(ver.exhibition_name),
      versionId,
      versionNumber: Number(ver.version_number),
      status: String(ver.status) as ExhibitionVersionStatus,
      targetBoothCount: Number(ver.target_booth_count),
      ownerCompanyId: resolvedOwnerId,
      ownerCompany,
      createdAt: String(ver.created_at),
      publishedAt: ver.published_at ? String(ver.published_at) : null,
      hallWidth: compactedLayout.hallWidth,
      hallDepth: compactedLayout.hallDepth,
      hallBounds: compactedLayout.hallBounds,
      walkableBounds: compactedLayout.walkableBounds,
      walkableRegions: compactedLayout.walkableRegions.length > 0 ? compactedLayout.walkableRegions : undefined,
      centralAvenueBounds: compactedLayout.centralAvenueBounds,
      welcomeAreaBounds: compactedLayout.welcomeAreaBounds,
      spawnPoint: compactedLayout.spawnPoint,
      directoryPoint: compactedLayout.directoryPoint,
      cameraOverviewBounds: compactedLayout.cameraOverviewBounds,
      roofBounds: compactedLayout.roofBounds,
      walkwayGraph: compactedLayout.walkwayGraph,
      clusters,
      zones,
      booths: finalBooths,
      validation,
    };
  }

  public getActiveExhibitionWorld(previewVersionId?: string): ExhibitionVersionDetail {
    if (previewVersionId) {
      const preview = this.getVersionDetail(previewVersionId, { includeHidden: false });
      if (!preview) {
        throw httpError(404, 'Không tìm thấy phiên bản xem trước.');
      }
      return preview;
    }

    const latestActiveExh = this.db
      .prepare(
        `SELECT id, active_version_id FROM exhibitions
         WHERE active_version_id IS NOT NULL
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`
      )
      .get() as { id: string; active_version_id: string } | undefined;
    if (latestActiveExh?.active_version_id) {
      const activeDetail = this.getVersionDetail(latestActiveExh.active_version_id, { includeHidden: false });
      if (activeDetail) return activeDetail;
    }

    const exh = this.ensureDefaultExhibition(20);
    const targetVersionId = exh.activeVersionId || exh.latestDraftVersionId;
    if (!targetVersionId) {
      throw httpError(404, 'Chưa có phiên bản triển lãm nào.');
    }
    return this.getVersionDetail(targetVersionId, { includeHidden: false })!;
  }

  /**
   * Phase 8 — Hide or restore an empty booth in a specific exhibition version.
   * - Reuses existing `exhibition_version_booths.placement_status` ('placed' | 'hidden').
   * - Never deletes slot_index, coordinates, or historical visitor/reward records.
   * - Rejects hiding booths that have assigned products OR a distinct non-owner tenant company.
   */
  public setVersionBoothVisibility(
    exhibitionId: string,
    versionId: string,
    boothId: string,
    hidden: boolean
  ): {
    adminVersion: ExhibitionVersionDetail;
    publicActiveWorld: ExhibitionVersionDetail | null;
    isPublishedVersion: boolean;
  } {
    const verRow = this.db
      .prepare('SELECT id, exhibition_id, status FROM exhibition_versions WHERE id = ? AND exhibition_id = ?')
      .get(versionId, exhibitionId) as { id?: string; exhibition_id?: string; status?: string } | undefined;
    if (!verRow?.id) {
      throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    }

    const fullBefore = this.getVersionDetail(versionId, { includeHidden: true });
    if (!fullBefore) {
      throw httpError(404, 'Không tìm thấy chi tiết phiên bản triển lãm.');
    }

    const targetBooth = fullBefore.booths.find((b) => b.boothId === boothId);
    if (!targetBooth) {
      throw httpError(404, 'Không tìm thấy gian hàng trong phiên bản triển lãm này.');
    }

    if (hidden) {
      const hasProducts = targetBooth.assignedSlotCount > 0;
      const ownerId = fullBefore.ownerCompanyId || null;
      const hasDistinctTenantBusiness = Boolean(
        targetBooth.companyId && (!ownerId || targetBooth.companyId !== ownerId)
      );

      if (hasProducts) {
        throw httpError(
          400,
          `Không thể ẩn gian hàng #${targetBooth.slotIndex + 1} vì đang có ${targetBooth.assignedSlotCount} sản phẩm trưng bày.`
        );
      }

      if (hasDistinctTenantBusiness) {
        throw httpError(
          400,
          `Không thể ẩn gian hàng #${targetBooth.slotIndex + 1} vì đang được gán cho doanh nghiệp "${targetBooth.companyName}".`
        );
      }
    }

    const nextStatus = hidden ? 'hidden' : 'placed';
    this.db
      .prepare(
        `UPDATE exhibition_version_booths
         SET placement_status = ?
         WHERE version_id = ? AND booth_id = ?`
      )
      .run(nextStatus, versionId, boothId);

    const adminVersion = this.getVersionDetail(versionId, { includeHidden: true });
    if (!adminVersion) {
      throw httpError(500, 'Không thể tải lại phiên bản triển lãm sau khi cập nhật.');
    }

    const isPublishedVersion = verRow.status === 'published';
    const publicActiveWorld = isPublishedVersion
      ? this.getVersionDetail(versionId, { includeHidden: false })
      : null;

    return {
      adminVersion,
      publicActiveWorld,
      isPublishedVersion,
    };
  }

  /**
   * Phase 8 Revision — Permanently remove empty booths (single, by zone, or all) in an exhibition version.
   * - Atomic SQLite transaction (all-or-nothing, zero half-deletes).
   * - Marks `exhibition_version_booths.placement_status = 'removed'` (tombstone):
   *   preserves original canonical `slot_index` & coordinates for deterministic zone-aware compaction
   *   and NEVER cascade-deletes `booths`, `companies`, `products`, `visitor_booth_visits`, or `reward_redemptions`.
   * - Server independently validates every candidate booth (never trusts FE list).
   * - Blocks removing booths with assigned products, distinct tenant company, or leaving 0 active booths.
   */
  public removeEmptyBooths(
    exhibitionId: string,
    versionId: string,
    input: {
      mode: 'single' | 'zone' | 'all';
      boothId?: string;
      zoneId?: string;
    }
  ): {
    version: ExhibitionVersionDetail;
    publicActiveWorld: ExhibitionVersionDetail | null;
    isPublishedVersion: boolean;
    removedBoothIds: string[];
    removedCount: number;
    removedZoneCodes: string[];
    compacted: boolean;
    remainingBoothCount: number;
    remainingZoneCount: number;
  } {
    const verRow = this.db
      .prepare('SELECT id, exhibition_id, status FROM exhibition_versions WHERE id = ? AND exhibition_id = ?')
      .get(versionId, exhibitionId) as { id?: string; exhibition_id?: string; status?: string } | undefined;
    if (!verRow?.id) {
      throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    }

    let removedBoothIds: string[] = [];
    let zonesBeforeCount = 0;
    let zoneCodesBefore: string[] = [];

    this.v28Db.runInTransaction(() => {
      const current = this.getVersionDetail(versionId, { includeHidden: false });
      if (!current) {
        throw httpError(404, 'Không tìm thấy chi tiết phiên bản triển lãm.');
      }

      zonesBeforeCount = current.zones.length;
      zoneCodesBefore = current.zones.map((z) => z.code);
      const ownerId = current.ownerCompanyId || null;

      const isBoothEligibleEmpty = (b: ExhibitionBoothPlacementView): { ok: boolean; reason?: string } => {
        if (b.assignedSlotCount > 0) {
          return {
            ok: false,
            reason: `Không thể xóa gian hàng #${b.slotIndex + 1} vì đang có ${b.assignedSlotCount} sản phẩm trưng bày.`,
          };
        }
        const hasDistinctTenant = Boolean(b.companyId && (!ownerId || b.companyId !== ownerId));
        if (hasDistinctTenant) {
          return {
            ok: false,
            reason: `Không thể xóa gian hàng #${b.slotIndex + 1} vì đang thuộc doanh nghiệp thuê "${b.companyName}".`,
          };
        }
        return { ok: true };
      };

      const targetBoothIds: string[] = [];

      if (input.mode === 'single') {
        const boothId = String(input.boothId || '').trim();
        if (!boothId) {
          throw httpError(400, 'Thiếu mã gian hàng cần xóa.');
        }
        const rawStatusRow = this.db
          .prepare('SELECT placement_status FROM exhibition_version_booths WHERE version_id = ? AND booth_id = ?')
          .get(versionId, boothId) as { placement_status?: string } | undefined;
        if (!rawStatusRow) {
          throw httpError(404, 'Không tìm thấy gian hàng trong phiên bản triển lãm này.');
        }
        if (rawStatusRow.placement_status === 'removed') {
          throw httpError(409, 'Gian hàng này đã bị xóa khỏi phiên bản triển lãm trước đó.');
        }

        const targetBooth = current.booths.find((b) => b.boothId === boothId);
        if (!targetBooth) {
          throw httpError(404, 'Không tìm thấy gian hàng đang hoạt động trong phiên bản này.');
        }
        const check = isBoothEligibleEmpty(targetBooth);
        if (!check.ok) {
          throw httpError(400, check.reason || 'Gian hàng không đủ điều kiện xóa.');
        }
        targetBoothIds.push(targetBooth.boothId);
      } else if (input.mode === 'zone') {
        const zoneId = String(input.zoneId || '').trim();
        if (!zoneId) {
          throw httpError(400, 'Thiếu mã khu cần xóa gian trống.');
        }
        const targetZone = current.zones.find((z) => z.id === zoneId);
        if (!targetZone) {
          throw httpError(404, 'Không tìm thấy khu đang hoạt động trong phiên bản triển lãm này.');
        }
        const zoneBooths = current.booths.filter((b) => b.zoneId === zoneId);
        for (const b of zoneBooths) {
          if (isBoothEligibleEmpty(b).ok) {
            targetBoothIds.push(b.boothId);
          }
        }
      } else if (input.mode === 'all') {
        for (const b of current.booths) {
          if (isBoothEligibleEmpty(b).ok) {
            targetBoothIds.push(b.boothId);
          }
        }
      } else {
        throw httpError(400, 'Chế độ xóa không hợp lệ.');
      }

      if (targetBoothIds.length === 0) {
        removedBoothIds = [];
        return;
      }

      if (current.booths.length - targetBoothIds.length < 1) {
        throw httpError(
          400,
          'Không thể xóa toàn bộ gian hàng khiến triển lãm không còn gian nào hoạt động (cần giữ lại ít nhất 1 gian).'
        );
      }

      const updateStmt = this.db.prepare(
        `UPDATE exhibition_version_booths
         SET placement_status = 'removed'
         WHERE version_id = ? AND booth_id = ? AND COALESCE(placement_status, 'placed') != 'removed'`
      );
      for (const bId of targetBoothIds) {
        const res = updateStmt.run(versionId, bId);
        if (Number(res.changes || 0) > 0) {
          removedBoothIds.push(bId);
        }
      }
    });

    const updatedVersion = this.getVersionDetail(versionId, { includeHidden: false });
    if (!updatedVersion) {
      throw httpError(500, 'Không thể tải lại phiên bản triển lãm sau khi xóa gian trống.');
    }

    const remainingZoneSet = new Set(updatedVersion.zones.map((z) => z.code));
    const removedZoneCodes = zoneCodesBefore.filter((code) => !remainingZoneSet.has(code));
    const compacted = updatedVersion.zones.length < zonesBeforeCount;
    const isPublishedVersion = verRow.status === 'published';

    return {
      version: updatedVersion,
      publicActiveWorld: isPublishedVersion ? updatedVersion : null,
      isPublishedVersion,
      removedBoothIds,
      removedCount: removedBoothIds.length,
      removedZoneCodes,
      compacted,
      remainingBoothCount: updatedVersion.booths.length,
      remainingZoneCount: updatedVersion.zones.length,
    };
  }

  /**
   * Option A — Consolidate Sparse Zones:
   * Keeps dense zones (> sparseThreshold booths) intact, while merging sparse zones
   * (<= sparseThreshold booths) into consolidated zone(s) capped at maxBoothsPerZone,
   * and regenerates a clean U-shaped layout via generateDynamicExhibitionLayout.
   * Preserves all booth IDs, product slots, booth metadata, and archetypes.
   */
  public consolidateSparseZones(
    exhibitionId: string,
    versionId: string,
    options?: {
      sparseThreshold?: number;
      maxBoothsPerZone?: number;
    }
  ): {
    version: ExhibitionVersionDetail;
    publicActiveWorld: ExhibitionVersionDetail | null;
    isPublishedVersion: boolean;
    consolidated: boolean;
    mergedZoneCodes: string[];
    movedBoothCount: number;
    previousZoneCount: number;
    remainingZoneCount: number;
    totalBoothCount: number;
  } {
    const verRow = this.db
      .prepare('SELECT id, exhibition_id, status, layout_config_json FROM exhibition_versions WHERE id = ? AND exhibition_id = ?')
      .get(versionId, exhibitionId) as
      | { id: string; exhibition_id: string; status: string; layout_config_json: string | null }
      | undefined;
    if (!verRow?.id) {
      throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    }
    if (verRow.status === 'archived') {
      throw httpError(409, 'Không thể gộp phân khu trên phiên bản đã lưu trữ (Archived).');
    }

    const current = this.getVersionDetail(versionId, { includeHidden: false });
    if (!current) {
      throw httpError(404, 'Không tìm thấy chi tiết phiên bản triển lãm.');
    }

    const plan = planSparseZoneConsolidation(current.zones, current.booths, options);
    const isPublishedVersion = verRow.status === 'published';

    if (!plan.canConsolidate) {
      return {
        version: current,
        publicActiveWorld: isPublishedVersion ? current : null,
        isPublishedVersion,
        consolidated: false,
        mergedZoneCodes: [],
        movedBoothCount: 0,
        previousZoneCount: current.zones.length,
        remainingZoneCount: current.zones.length,
        totalBoothCount: current.booths.length,
      };
    }

    const existingMeta = JSON.parse(String(verRow.layout_config_json || '{}')) as {
      ownerCompanyId?: string | null;
      config?: Partial<LayoutGeneratorInput>;
    };
    const prevCfg = existingMeta.config || {};
    const totalBoothCount = plan.plannedZones.reduce((sum, z) => sum + z.booths.length, 0);

    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: totalBoothCount,
      preferredZoneCapacity: plan.maxBoothsPerZone,
      hallStyle: prevCfg.hallStyle ?? 'grand_expo',
      mainAvenueWidth: prevCfg.mainAvenueWidth,
      aisleWidth: prevCfg.aisleWidth,
      perimeterWidth: prevCfg.perimeterWidth,
      boothGap: prevCfg.boothGap,
      layoutSeed: prevCfg.layoutSeed ?? 28,
      categoryZones: plan.plannedZones.map((pz, idx) => ({
        categoryId: pz.categoryId || `merged-zone-${idx + 1}`,
        categoryName: pz.displayName,
        boothCount: pz.booths.length,
      })),
    });

    if (layout.zones.length !== plan.plannedZones.length || layout.placements.length !== totalBoothCount) {
      throw httpError(500, 'Không thể tính toán lại sơ đồ chữ U sau khi gộp các khu thưa.');
    }

    this.v28Db.runInTransaction(() => {
      // Preserve existing per-booth category_id from exhibition_version_booths
      const existingCatRows = this.db
        .prepare('SELECT booth_id, category_id FROM exhibition_version_booths WHERE version_id = ?')
        .all(versionId) as Array<{ booth_id: string; category_id: string | null }>;
      const boothCategoryById = new Map<string, string | null>();
      for (const r of existingCatRows) {
        boothCategoryById.set(r.booth_id, r.category_id || null);
      }

      // Remove old placements first (satisfies FK to zones), then replace zones
      this.db.prepare('DELETE FROM exhibition_version_booths WHERE version_id = ?').run(versionId);
      this.db.prepare('DELETE FROM zones WHERE version_id = ?').run(versionId);

      const insertZone = this.db.prepare(`
        INSERT INTO zones (id, version_id, code, display_name, category_tag, bounds_json, sort_order, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const zoneIdByCode = new Map<string, string>();
      for (let i = 0; i < layout.zones.length; i++) {
        const genZone = layout.zones[i];
        const planned = plan.plannedZones[i];
        const zId = `zone-${versionId}-${genZone.code}`;
        insertZone.run(
          zId,
          versionId,
          genZone.code,
          planned.displayName,
          planned.categoryTag || genZone.categoryTag,
          JSON.stringify(genZone.bounds),
          genZone.sortOrder,
          planned.categoryId || null
        );
        zoneIdByCode.set(genZone.code, zId);
      }

      const insertPlacement = this.db.prepare(`
        INSERT INTO exhibition_version_booths (
          version_id, booth_id, zone_id, slot_index,
          position_x, position_z, rotation_y, archetype_id, placement_status, category_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'placed', ?)
      `);

      const orderedBooths = plan.plannedZones.flatMap((pz) => pz.booths);
      for (let i = 0; i < layout.placements.length; i++) {
        const p = layout.placements[i];
        const b = orderedBooths[i];
        const zId = zoneIdByCode.get(p.zoneCode)!;
        insertPlacement.run(
          versionId,
          b.boothId,
          zId,
          p.slotIndex,
          p.positionX,
          p.positionZ,
          p.rotationY,
          b.archetypeId || p.archetypeId,
          boothCategoryById.get(b.boothId) ?? null
        );
      }

      this.db
        .prepare(
          `UPDATE exhibition_versions
           SET target_booth_count = ?,
               layout_config_json = ?,
               roof_config_json = ?
           WHERE id = ?`
        )
        .run(
          totalBoothCount,
          JSON.stringify({
            ownerCompanyId: existingMeta.ownerCompanyId ?? null,
            config: layout.config,
            hallWidth: layout.hallWidth,
            hallDepth: layout.hallDepth,
            hallBounds: layout.hallBounds,
            walkableBounds: layout.walkableBounds,
            walkableRegions: layout.walkableRegions,
            centralAvenueBounds: layout.centralAvenueBounds,
            welcomeAreaBounds: layout.welcomeAreaBounds,
            spawnPoint: layout.spawnPoint,
            directoryPoint: layout.directoryPoint,
            cameraOverviewBounds: layout.cameraOverviewBounds,
            walkwayGraph: layout.walkwayGraph,
            clusters: layout.clusters,
          }),
          JSON.stringify(layout.roofBounds),
          versionId
        );
    });

    const updatedVersion = this.getVersionDetail(versionId, { includeHidden: false });
    if (!updatedVersion) {
      throw httpError(500, 'Không thể tải lại phiên bản triển lãm sau khi gộp khu thưa.');
    }

    return {
      version: updatedVersion,
      publicActiveWorld: isPublishedVersion ? updatedVersion : null,
      isPublishedVersion,
      consolidated: true,
      mergedZoneCodes: plan.mergedZoneCodes,
      movedBoothCount: plan.movedBoothCount,
      previousZoneCount: plan.previousZoneCount,
      remainingZoneCount: updatedVersion.zones.length,
      totalBoothCount: updatedVersion.booths.length,
    };
  }

  private assertDraftVersion(versionId: string, expectedExhibitionId?: string): { exhibitionId: string } {
    const row = this.db
      .prepare('SELECT exhibition_id, status FROM exhibition_versions WHERE id = ?')
      .get(versionId) as { exhibition_id: string; status: string } | undefined;
    if (!row) {
      throw httpError(404, 'Không tìm thấy phiên bản layout.');
    }
    if (expectedExhibitionId && row.exhibition_id !== expectedExhibitionId) {
      throw httpError(404, 'Phiên bản layout không thuộc triển lãm này.');
    }
    if (row.status !== 'draft') {
      throw httpError(
        409,
        'Phiên bản đã Publish hoặc Archived là bất biến. Vui lòng tạo bản Draft mới để chỉnh sửa.'
      );
    }
    return { exhibitionId: row.exhibition_id };
  }

  public updateDraftZone(
    versionId: string,
    zoneId: string,
    patch: { displayName?: string; categoryTag?: string },
    expectedExhibitionId?: string
  ): ExhibitionVersionDetail {
    const versionRow = this.db
      .prepare('SELECT id, exhibition_id, status FROM exhibition_versions WHERE id = ?')
      .get(versionId) as { id: string; exhibition_id: string; status: string } | undefined;
    if (!versionRow || (expectedExhibitionId && versionRow.exhibition_id !== expectedExhibitionId)) {
      throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    }
    if (versionRow.status === 'archived') {
      throw httpError(409, 'Không thể đổi tên phân khu trên phiên bản đã lưu trữ (Archived).');
    }
    const existing = this.db
      .prepare('SELECT id, display_name, category_tag FROM zones WHERE id = ? AND version_id = ?')
      .get(zoneId, versionId) as { id: string; display_name: string; category_tag: string } | undefined;
    if (!existing) {
      throw httpError(404, 'Không tìm thấy phân khu trong phiên bản triển lãm.');
    }
    this.db
      .prepare('UPDATE zones SET display_name = ?, category_tag = ? WHERE id = ?')
      .run(
        patch.displayName ?? existing.display_name,
        patch.categoryTag ?? existing.category_tag,
        zoneId
      );
    return this.getVersionDetail(versionId)!;
  }

  public updateDraftBoothPlacement(
    versionId: string,
    boothId: string,
    patch: {
      positionX?: number;
      positionZ?: number;
      rotationY?: number;
      archetypeId?: V28ArchetypeId;
      companyId?: string;
      zoneId?: string;
      boothName?: string;
    },
    expectedExhibitionId?: string
  ): ExhibitionVersionDetail {
    this.assertDraftVersion(versionId, expectedExhibitionId);
    const currentDetail = this.getVersionDetail(versionId);
    if (!currentDetail) throw httpError(404, 'Không tìm thấy phiên bản.');

    const target = currentDetail.booths.find((b) => b.boothId === boothId);
    if (!target) throw httpError(404, 'Gian hàng không thuộc phiên bản Draft này.');

    // Validate patch.zoneId belongs to this exact versionId (MED-01)
    if (patch.zoneId && patch.zoneId !== target.zoneId) {
      const zoneOk = this.db
        .prepare('SELECT 1 FROM zones WHERE id = ? AND version_id = ?')
        .get(patch.zoneId, versionId);
      if (!zoneOk) {
        throw httpError(400, 'Khu vực được chọn không thuộc phiên bản Draft này.');
      }
    }

    // Validate company ownership invariant if reassigning companyId
    if (patch.companyId && patch.companyId !== target.companyId) {
      if (currentDetail.ownerCompanyId && patch.companyId !== currentDetail.ownerCompanyId) {
        throw httpError(
          409,
          `Vi phạm mô hình triển lãm một doanh nghiệp: bản Draft này thuộc về '${currentDetail.ownerCompany?.name || currentDetail.ownerCompanyId}'. Không thể gán gian hàng sang doanh nghiệp khác.`
        );
      }
      const comp = this.v28Db.getCompanyById(patch.companyId);
      if (!comp || comp.status !== 'active') {
        throw httpError(404, 'Doanh nghiệp được chọn không tồn tại hoặc đang bị vô hiệu hóa.');
      }
      if (target.assignedSlotCount > 0) {
        throw httpError(
          409,
          'Không thể đổi doanh nghiệp khi gian hàng đang trưng bày sản phẩm của doanh nghiệp cũ. Vui lòng gỡ sản phẩm khỏi 6 vị trí trước.'
        );
      }
    }

    const nextX = patch.positionX ?? target.positionX;
    const nextZ = patch.positionZ ?? target.positionZ;
    const nextRot = patch.rotationY ?? target.rotationY;
    const nextArch = patch.archetypeId ?? target.archetypeId;

    // Validate bounds & overlap against all other booths in this Draft
    const nextBox = getBoothWorldAabb(nextX, nextZ, nextRot, nextArch, 0.2);
    const strictBox = getBoothWorldAabb(nextX, nextZ, nextRot, nextArch, 0);
    if (
      strictBox.minX < currentDetail.hallBounds.minX + 1.0 ||
      strictBox.maxX > currentDetail.hallBounds.maxX - 1.0 ||
      strictBox.minZ < currentDetail.hallBounds.minZ + 1.0 ||
      strictBox.maxZ > currentDetail.hallBounds.maxZ - 1.0
    ) {
      throw httpError(400, 'Vị trí mới nằm ngoài giới hạn khuôn viên.');
    }

    for (const other of currentDetail.booths) {
      if (other.boothId === boothId) continue;
      const otherBox = getBoothWorldAabb(other.positionX, other.positionZ, other.rotationY, other.archetypeId, 0.2);
      if (
        nextBox.minX < otherBox.maxX - 0.01 &&
        nextBox.maxX > otherBox.minX + 0.01 &&
        nextBox.minZ < otherBox.maxZ - 0.01 &&
        nextBox.maxZ > otherBox.minZ + 0.01
      ) {
        throw httpError(400, `Vị trí mới bị chồng lấn với gian hàng "${other.boothName}".`);
      }
    }

    this.v28Db.runInTransaction(() => {
      this.ensureVersionSnapshot(versionId);
      this.db
        .prepare(
          `UPDATE exhibition_version_booths
           SET position_x = ?, position_z = ?, rotation_y = ?, archetype_id = ?, zone_id = ?
           WHERE version_id = ? AND booth_id = ?`
        )
        .run(
          nextX,
          nextZ,
          nextRot,
          nextArch,
          patch.zoneId ?? target.zoneId,
          versionId,
          boothId
        );

      const nextCompany = patch.companyId ? this.v28Db.getCompanyById(patch.companyId)! : null;
      const nextBoothName = patch.boothName ?? target.boothName;
      const nextCompanyId = nextCompany ? nextCompany.id : target.companyId;
      const nextCompanyName = nextCompany ? nextCompany.name : target.companyName;

      // V28-AUDIT-001: Write metadata strictly to this Draft's snapshot table (NEVER mutate live `booths`!)
      this.db
        .prepare(
          `INSERT INTO exhibition_version_booth_meta (version_id, booth_id, booth_name, category, company_id, company_name)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(version_id, booth_id) DO UPDATE SET
             booth_name = excluded.booth_name,
             company_id = excluded.company_id,
             company_name = excluded.company_name`
        )
        .run(versionId, boothId, nextBoothName, target.category || 'General', nextCompanyId, nextCompanyName);
    });

    return this.getVersionDetail(versionId)!;
  }

  /**
   * Assign or clear a product slot inside a Draft version's isolated snapshot (V28-AUDIT-001)
   * OR directly on the active Published version (syncing live `booth_slot_assignments` + snapshot).
   * Archived versions remain strictly immutable.
   */
  public assignDraftBoothSlot(
    versionId: string,
    boothId: string,
    slotId: string,
    productId: string | null,
    expectedExhibitionId?: string
  ): ExhibitionVersionDetail {
    const verRow = this.db
      .prepare('SELECT id, exhibition_id, status FROM exhibition_versions WHERE id = ?')
      .get(versionId) as { id: string; exhibition_id: string; status: string } | undefined;
    if (!verRow) throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    if (expectedExhibitionId && verRow.exhibition_id !== expectedExhibitionId) {
      throw httpError(404, 'Phiên bản không thuộc triển lãm này.');
    }
    if (verRow.status === 'archived') {
      throw httpError(400, 'Phiên bản đã Archived là bất biến. Vui lòng tạo bản Draft mới để chỉnh sửa.');
    }
    const isPublished = verRow.status === 'published';

    if (!VALID_BOOTH_SLOT_IDS.has(slotId)) {
      throw httpError(400, `Slot '${slotId}' không hợp lệ (chỉ chấp nhận slot_01..slot_06).`);
    }
    const detail = this.getVersionDetail(versionId);
    if (!detail) throw httpError(404, 'Không tìm thấy phiên bản triển lãm.');
    const target = detail.booths.find((b) => b.boothId === boothId);
    if (!target) throw httpError(404, 'Gian hàng không thuộc phiên bản này.');

    if (productId) {
      const prod = this.v28Db.getProductById(productId);
      if (!prod) throw httpError(404, `Không tìm thấy sản phẩm '${productId}'.`);
      if (prod.status !== 'active') {
        throw httpError(400, `Sản phẩm '${prod.name}' đang bị ẩn (inactive), không thể gán.`);
      }
      if (!target.companyId || target.companyId !== prod.companyId) {
        throw httpError(403, 'Không thể gán sản phẩm thuộc doanh nghiệp khác vào gian hàng này.');
      }
    }

    this.v28Db.runInTransaction(() => {
      this.ensureVersionSnapshot(versionId);
      if (!productId) {
        this.db
          .prepare('DELETE FROM exhibition_version_booth_slots WHERE version_id = ? AND booth_id = ? AND slot_id = ?')
          .run(versionId, boothId, slotId);
        if (isPublished) {
          this.v28Db.clearBoothSlot(boothId, slotId);
        }
      } else {
        this.db
          .prepare(
            `INSERT INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(version_id, booth_id, slot_id) DO UPDATE SET
               product_id = excluded.product_id,
               updated_at = CURRENT_TIMESTAMP`
          )
          .run(versionId, boothId, slotId, productId);
        if (isPublished) {
          this.v28Db.assignBoothSlot(boothId, slotId, productId);
        }
      }
    });

    return this.getVersionDetail(versionId)!;
  }

  /**
   * Safely remove a booth from a Draft version (Section 9):
   * - NEVER deletes products from Catalog or deletes Companies.
   * - NEVER mutates Published version's slots or metadata (V28-AUDIT-001).
   * - If the booth currently has assigned products in its 6 slots, requires explicit `forceUnassign=true`.
   * - Updates `target_booth_count` on the draft version so the deleted booth is NEVER auto-recreated.
   */
  public deleteDraftBoothPlacement(
    versionId: string,
    boothId: string,
    options?: { forceUnassign?: boolean; expectedExhibitionId?: string }
  ): ExhibitionVersionDetail {
    this.assertDraftVersion(versionId, options?.expectedExhibitionId);

    const currentDetail = this.getVersionDetail(versionId)!;
    const target = currentDetail.booths.find((b) => b.boothId === boothId);
    if (!target) {
      throw httpError(404, 'Gian hàng không nằm trong phiên bản Draft này.');
    }
    if (currentDetail.booths.length <= 1) {
      throw httpError(400, 'Không thể xóa gian hàng cuối cùng của triển lãm.');
    }
    if (target.assignedSlotCount > 0 && !options?.forceUnassign) {
      throw httpError(
        409,
        `Gian hàng "${target.boothName}" đang có ${target.assignedSlotCount} sản phẩm trưng bày. Hãy xác nhận gỡ sản phẩm khỏi slot (không xóa khỏi Catalog) trước khi xóa gian.`
      );
    }

    this.v28Db.runInTransaction(() => {
      this.ensureVersionSnapshot(versionId);
      // V28-AUDIT-001: Only remove from THIS Draft's isolated tables; Published snapshot & live slots stay 100% intact!
      this.db
        .prepare('DELETE FROM exhibition_version_booth_slots WHERE version_id = ? AND booth_id = ?')
        .run(versionId, boothId);
      this.db
        .prepare('DELETE FROM exhibition_version_booth_meta WHERE version_id = ? AND booth_id = ?')
        .run(versionId, boothId);
      this.db
        .prepare('DELETE FROM exhibition_version_booths WHERE version_id = ? AND booth_id = ?')
        .run(versionId, boothId);
      const nextCount = Math.max(1, currentDetail.booths.length - 1);
      this.db
        .prepare('UPDATE exhibition_versions SET target_booth_count = ? WHERE id = ?')
        .run(nextCount, versionId);
    });

    return this.getVersionDetail(versionId)!;
  }

  /**
   * Publish a Draft version atomically after verifying:
   *  1. Full layout geometry, booth count bounds (1..200) & walkway connectivity validation
   *  2. Active company & active product status + Company ownership invariants on all assigned booth slots
   *  3. Immutable snapshot freeze + live table sync + non-destructive active/archived lifecycle
   */
  public publishVersion(exhibitionId: string, versionId: string): ExhibitionVersionDetail {
    const detail = this.getVersionDetail(versionId);
    if (!detail || detail.exhibitionId !== exhibitionId) {
      throw httpError(404, 'Không tìm thấy phiên bản cần Publish.');
    }
    if (detail.status !== 'draft') {
      throw httpError(409, 'Chỉ có thể Publish phiên bản đang ở trạng thái Draft.');
    }
    if (detail.booths.length === 0) {
      throw httpError(400, 'Không thể Publish triển lãm chưa có gian hàng nào.');
    }
    if (detail.booths.length > 200) {
      throw httpError(
        400,
        `Số gian hàng (${detail.booths.length}) vượt quá giới hạn Publish an toàn tối đa 200 gian hàng.`
      );
    }
    if (!detail.validation.valid) {
      throw httpError(
        400,
        `Layout không hợp lệ, không thể Publish: ${detail.validation.errors.slice(0, 3).join(' | ')}`
      );
    }

    // Verify Single-Business Exhibition Owner Invariant (when ownerCompanyId is set on this Draft)
    const explicitOwnerId = detail.ownerCompanyId || null;
    if (explicitOwnerId) {
      const invalidOwnerBooth = detail.booths.find((b) => b.companyId !== explicitOwnerId);
      if (invalidOwnerBooth) {
        throw httpError(
          409,
          `Vi phạm mô hình triển lãm một doanh nghiệp: gian "${invalidOwnerBooth.boothName}" thuộc doanh nghiệp khác ('${invalidOwnerBooth.companyName}'). Mọi gian hàng trong triển lãm phải thuộc cùng một doanh nghiệp sở hữu.`
        );
      }
      // Also guard against direct DB corruption of underlying booths table for Draft booths
      const rawMismatch = this.db
        .prepare(
          `SELECT b.name, b.company_name FROM exhibition_version_booths evb
           JOIN booths b ON b.id = evb.booth_id
           WHERE evb.version_id = ? AND b.company_id IS NOT NULL AND b.company_id != ?
           LIMIT 1`
        )
        .get(versionId, explicitOwnerId) as { name: string; company_name: string } | undefined;
      if (rawMismatch) {
        throw httpError(
          409,
          `Vi phạm mô hình triển lãm một doanh nghiệp: gian "${rawMismatch.name}" thuộc doanh nghiệp khác ('${rawMismatch.company_name}'). Mọi gian hàng trong triển lãm phải thuộc cùng một doanh nghiệp sở hữu.`
        );
      }
    }

    // Verify Active Company, Active Product & Company Ownership on every booth's assigned slots (V28-AUDIT-014C)
    const activeCompanyCache = new Map<string, boolean>();
    for (const b of detail.booths) {
      if (!b.companyId) {
        throw httpError(400, `Gian hàng "${b.boothName}" chưa được gán doanh nghiệp.`);
      }
      if (!activeCompanyCache.has(b.companyId)) {
        const comp = this.v28Db.getCompanyById(b.companyId);
        activeCompanyCache.set(b.companyId, Boolean(comp && comp.status === 'active'));
      }
      if (!activeCompanyCache.get(b.companyId)) {
        throw httpError(
          409,
          `Doanh nghiệp sở hữu gian "${b.boothName}" không tồn tại hoặc đang bị vô hiệu hóa (inactive).`
        );
      }
      for (const s of b.slots) {
        if (s.product) {
          if (s.product.status !== 'active') {
            throw httpError(
              409,
              `Sản phẩm "${s.product.name}" tại gian "${b.boothName}" (${s.slotId}) đang ở trạng thái tạm ẩn (inactive).`
            );
          }
          if (s.product.companyId !== b.companyId) {
            throw httpError(
              409,
              `Vi phạm sở hữu doanh nghiệp tại gian "${b.boothName}" (${s.slotId}): sản phẩm "${s.product.name}" thuộc doanh nghiệp khác.`
            );
          }
        }
      }
    }

    this.v28Db.runInTransaction(() => {
      // Freeze previous published version snapshot before archiving it (guarantees lossless rollback!)
      const prevPub = this.db
        .prepare("SELECT id FROM exhibition_versions WHERE exhibition_id = ? AND status = 'published' LIMIT 1")
        .get(exhibitionId) as { id: string } | undefined;
      if (prevPub?.id) {
        this.ensureVersionSnapshot(prevPub.id);
      }
      this.ensureVersionSnapshot(versionId);

      // Archive any currently published version of this exhibition
      this.db
        .prepare(
          `UPDATE exhibition_versions SET status = 'archived'
           WHERE exhibition_id = ? AND status = 'published'`
        )
        .run(exhibitionId);

      // Mark target version published
      this.db
        .prepare(
          `UPDATE exhibition_versions SET status = 'published', published_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(versionId);

      // Update exhibition active_version_id
      this.db
        .prepare(
          `UPDATE exhibitions SET active_version_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(versionId, exhibitionId);

      // Sync target snapshot to live tables + recalculate active/archived status across all exhibitions
      this.syncVersionSnapshotToLiveTables(versionId);
    });

    return this.getVersionDetail(versionId)!;
  }

  public rollbackVersion(exhibitionId: string, targetVersionId: string): ExhibitionVersionDetail {
    const target = this.getVersionDetail(targetVersionId);
    if (!target || target.exhibitionId !== exhibitionId) {
      throw httpError(404, 'Không tìm thấy phiên bản đích để rollback.');
    }
    if (target.status === 'draft') {
      throw httpError(400, 'Không thể rollback sang bản Draft chưa từng Publish.');
    }

    this.v28Db.runInTransaction(() => {
      const currPub = this.db
        .prepare("SELECT id FROM exhibition_versions WHERE exhibition_id = ? AND status = 'published' LIMIT 1")
        .get(exhibitionId) as { id: string } | undefined;
      if (currPub?.id) {
        this.ensureVersionSnapshot(currPub.id);
      }
      this.ensureVersionSnapshot(targetVersionId);

      this.db
        .prepare(
          `UPDATE exhibition_versions SET status = 'archived'
           WHERE exhibition_id = ? AND status = 'published'`
        )
        .run(exhibitionId);
      this.db
        .prepare("UPDATE exhibition_versions SET status = 'published' WHERE id = ?")
        .run(targetVersionId);
      this.db
        .prepare('UPDATE exhibitions SET active_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(targetVersionId, exhibitionId);

      // Restore booths metadata, booths.status & booth_slot_assignments from targetVersionId's snapshot (V28-AUDIT-001 & MED-02)
      this.syncVersionSnapshotToLiveTables(targetVersionId);
    });

    return this.getVersionDetail(targetVersionId)!;
  }

  public listArchetypes() {
    return V28_ARCHETYPES;
  }

  /**
   * Deterministic, atomic auto-classification & auto-allocation of Catalog / newly imported products
   * into Draft booths & slots (max 6 slots/booth, strict company ownership, zero cross-company mixing,
   * zero duplicate-slice cloning across booths, zero silent error swallowing).
   */
  public autoAllocateDraftProducts(
    versionId: string,
    options?: {
      companyId?: string;
      productIds?: string[];
      categoryHints?: Record<string, string>;
      organizeZonesByCategory?: boolean;
      expectedExhibitionId?: string;
    }
  ): {
    version: ExhibitionVersionDetail;
    assignedSlots: number;
    boothsFilled: number;
    assignedProductIds: string[];
    overflowProductIds: string[];
    uncertainProducts: Array<{ productId: string; name: string; reason: string }>;
    classifiedCount: number;
    zoneDecisions: Array<{
      zoneId: string;
      zoneCode: string;
      displayName: string;
      categoryName: string;
      productCount: number;
      status: 'assigned_category' | 'merged_general' | 'unassigned_empty';
    }>;
  } {
    const detail = this.getVersionDetail(versionId);
    if (!detail || (options?.expectedExhibitionId && detail.exhibitionId !== options.expectedExhibitionId)) {
      throw httpError(404, 'Không tìm thấy phiên bản Draft để phân bổ sản phẩm.');
    }
    if (detail.status !== 'draft') {
      throw httpError(409, 'Chỉ có thể tự động phân bổ sản phẩm trên phiên bản Draft.');
    }

    const SLOT_KEYS = ['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06'] as const;
    const categoryService = new V28CategoryService(this.v28Db);

    // Enforce Single-Business Exhibition Owner Invariant when Draft has an explicit ownerCompanyId
    const requestedCompanyId = options?.companyId?.trim() || null;
    if (detail.ownerCompanyId && requestedCompanyId && requestedCompanyId !== detail.ownerCompanyId) {
      throw httpError(
        409,
        `Vi phạm mô hình triển lãm một doanh nghiệp: bản Draft này thuộc doanh nghiệp '${detail.ownerCompany?.name || detail.ownerCompanyId}', không thể phân bổ sản phẩm của doanh nghiệp khác.`
      );
    }

    // Load candidate products grouped by company
    const targetCompanyId = detail.ownerCompanyId || requestedCompanyId || null;
    const priorityIds = new Set((options?.productIds || []).filter(Boolean));
    const categoryHints = options?.categoryHints || {};
    const organizeZonesByCategory = options?.organizeZonesByCategory !== false;

    const allProducts = this.v28Db.listProducts({
      companyId: targetCompanyId || undefined,
      status: 'active',
      page: 1,
      limit: 1000,
    }).items;

    const assignedProductIds: string[] = [];
    const overflowProductIds: string[] = [];
    const uncertainProducts: Array<{ productId: string; name: string; reason: string }> = [];
    const zoneDecisions: Array<{
      zoneId: string;
      zoneCode: string;
      displayName: string;
      categoryName: string;
      productCount: number;
      status: 'assigned_category' | 'merged_general' | 'unassigned_empty';
    }> = [];
    const filledBoothIds = new Set<string>();
    let assignedSlots = 0;
    let classifiedCount = 0;

    this.v28Db.runInTransaction(() => {
      this.ensureVersionSnapshot(versionId);
      const upsertDraftSlotStmt = this.db.prepare(
        `INSERT INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(version_id, booth_id, slot_id) DO UPDATE SET
           product_id = excluded.product_id,
           updated_at = CURRENT_TIMESTAMP`
      );
      // 1. Classify products & persist category_id when confident
      const updateCatStmt = this.db.prepare('UPDATE products SET category_id = ? WHERE id = ?');
      const productCategoryMap = new Map<string, { categoryId: string | null; categoryName: string }>();
      const productsByCompany = new Map<string, typeof allProducts>();

      for (const prod of allProducts) {
        if (priorityIds.size === 0 || priorityIds.has(prod.id)) {
          const cls = categoryService.classifyProductCategory({
            name: prod.name,
            description: prod.description,
            categoryHint: categoryHints[prod.id] || '',
          });
          if (cls.categoryId) {
            updateCatStmt.run(cls.categoryId, prod.id);
            productCategoryMap.set(prod.id, { categoryId: cls.categoryId, categoryName: cls.categoryName });
            classifiedCount++;
          } else {
            productCategoryMap.set(prod.id, { categoryId: null, categoryName: 'Cần Admin kiểm tra' });
            uncertainProducts.push({
              productId: prod.id,
              name: prod.name,
              reason: 'Không khớp rõ danh mục tự động — cần Admin kiểm tra',
            });
          }
        }
        const list = productsByCompany.get(prod.companyId) || [];
        list.push(prod);
        productsByCompany.set(prod.companyId, list);
      }

      // 2. I6: Organize Draft Zones by REAL product categories (NOT company name, NEVER fabricating fake categories)
      const targetProducts =
        priorityIds.size > 0
          ? allProducts.filter((p) => priorityIds.has(p.id))
          : allProducts;

      const categoryGroups = new Map<string, { categoryId: string | null; categoryName: string; products: typeof allProducts }>();
      for (const p of targetProducts) {
        const info = productCategoryMap.get(p.id) || { categoryId: null, categoryName: 'Chưa phân loại' };
        const key = info.categoryId || '__uncertain__';
        const g = categoryGroups.get(key) || { categoryId: info.categoryId, categoryName: info.categoryName, products: [] };
        g.products.push(p);
        categoryGroups.set(key, g);
      }

      const sortedRealCats = Array.from(categoryGroups.values())
        .filter((g) => g.categoryId !== null)
        .sort((a, b) => b.products.length - a.products.length);

      const zoneCategoryAssignments = new Map<string, { categoryId: string | null; categoryName: string; products: typeof allProducts }>();

      if (organizeZonesByCategory && sortedRealCats.length > 0 && detail.zones.length > 0) {
        const updateZoneStmt = this.db.prepare(
          'UPDATE zones SET display_name = ?, category_tag = ?, category_id = ? WHERE id = ?'
        );
        const updateBoothCompanyStmt = this.db.prepare(
          `UPDATE exhibition_version_booth_meta SET company_id = ?, company_name = ?
           WHERE version_id = ? AND booth_id = ?`
        );
        const updateBoothMetaStmt = this.db.prepare(
          `INSERT INTO exhibition_version_booth_meta (version_id, booth_id, booth_name, category, company_id, company_name)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(version_id, booth_id) DO UPDATE SET
             booth_name = excluded.booth_name,
             category = excluded.category,
             company_id = excluded.company_id,
             company_name = excluded.company_name`
        );
        const targetCompanyObj = targetCompanyId ? this.v28Db.getCompanyById(targetCompanyId) : null;

        if (sortedRealCats.length <= detail.zones.length) {
          for (let i = 0; i < detail.zones.length; i++) {
            const z = detail.zones[i];
            if (i < sortedRealCats.length) {
              const cat = sortedRealCats[i];
              const disp = cat.categoryName.startsWith('Khu ') ? cat.categoryName : `Khu ${cat.categoryName}`;
              updateZoneStmt.run(disp, cat.categoryName, cat.categoryId, z.id);
              zoneCategoryAssignments.set(z.id, cat);
              zoneDecisions.push({
                zoneId: z.id,
                zoneCode: z.code,
                displayName: disp,
                categoryName: cat.categoryName,
                productCount: cat.products.length,
                status: 'assigned_category',
              });
            } else {
              // Extra zones beyond real categories: explicitly mark unassigned (NEVER invent fake categories!)
              const disp = `Khu Chưa phân bổ (${z.code})`;
              updateZoneStmt.run(disp, 'Chưa phân bổ', null, z.id);
              zoneDecisions.push({
                zoneId: z.id,
                zoneCode: z.code,
                displayName: disp,
                categoryName: 'Chưa phân bổ',
                productCount: 0,
                status: 'unassigned_empty',
              });
            }
          }
        } else {
          // More real categories than zones: top (N-1) get dedicated zones, remainder merge into Khu Tổng hợp
          const dedicatedCount = Math.max(0, detail.zones.length - 1);
          for (let i = 0; i < dedicatedCount; i++) {
            const z = detail.zones[i];
            const cat = sortedRealCats[i];
            const disp = cat.categoryName.startsWith('Khu ') ? cat.categoryName : `Khu ${cat.categoryName}`;
            updateZoneStmt.run(disp, cat.categoryName, cat.categoryId, z.id);
            zoneCategoryAssignments.set(z.id, cat);
            zoneDecisions.push({
              zoneId: z.id,
              zoneCode: z.code,
              displayName: disp,
              categoryName: cat.categoryName,
              productCount: cat.products.length,
              status: 'assigned_category',
            });
          }
          const lastZone = detail.zones[detail.zones.length - 1];
          const mergedProducts = sortedRealCats.slice(dedicatedCount).flatMap((c) => c.products);
          const mergedLabel = sortedRealCats
            .slice(dedicatedCount)
            .map((c) => c.categoryName)
            .slice(0, 3)
            .join(', ');
          updateZoneStmt.run('Khu Tổng hợp', mergedLabel || 'Tổng hợp', null, lastZone.id);
          zoneCategoryAssignments.set(lastZone.id, {
            categoryId: null,
            categoryName: mergedLabel || 'Tổng hợp',
            products: mergedProducts,
          });
          zoneDecisions.push({
            zoneId: lastZone.id,
            zoneCode: lastZone.code,
            displayName: 'Khu Tổng hợp',
            categoryName: mergedLabel || 'Tổng hợp',
            productCount: mergedProducts.length,
            status: 'merged_general',
          });
        }

        // Allocate each category's products into booths inside THAT category's zone (ensuring owning company on Draft-only booths!)
        if (targetCompanyObj) {
          const alreadyPlacedIds = new Set<string>();
          for (const b of detail.booths) {
            for (const s of b.slots) {
              if (s.product?.id) alreadyPlacedIds.add(s.product.id);
            }
          }

          for (const [zoneId, group] of zoneCategoryAssignments.entries()) {
            const unplaced = group.products.filter((p) => !alreadyPlacedIds.has(p.id));
            if (unplaced.length === 0) continue;

            const zoneBooths = detail.booths.filter((b) => b.zoneId === zoneId);
            // Prefer booths already owned by targetCompany, then empty Draft booths (v28-booth-*)
            const candidateBooths = [
              ...zoneBooths.filter((b) => b.companyId === targetCompanyObj.id),
              ...zoneBooths.filter(
                (b) => b.companyId !== targetCompanyObj.id && b.assignedSlotCount === 0 && b.boothId.startsWith('v28-booth-')
              ),
            ];

            let cursor = 0;
            let zoneBoothOrdinal = 0;
            for (const b of candidateBooths) {
              if (cursor >= unplaced.length) break;
              zoneBoothOrdinal++;
              if (b.companyId !== targetCompanyObj.id) {
                updateBoothCompanyStmt.run(targetCompanyObj.id, targetCompanyObj.name, versionId, b.boothId);
              }
              const occupied = new Set(b.slots.filter((s) => s.product?.id).map((s) => s.slotId));
              const freeSlots = SLOT_KEYS.filter((k) => !occupied.has(k));
              let placedInThisBooth = 0;
              for (const slotId of freeSlots) {
                if (cursor >= unplaced.length) break;
                const prod = unplaced[cursor++];
                upsertDraftSlotStmt.run(versionId, b.boothId, slotId, prod.id);
                alreadyPlacedIds.add(prod.id);
                assignedSlots++;
                placedInThisBooth++;
                filledBoothIds.add(b.boothId);
                assignedProductIds.push(prod.id);
              }
              if (placedInThisBooth > 0) {
                const cleanBoothTitle = `${targetCompanyObj.name} · ${group.categoryName} #${zoneBoothOrdinal}`;
                updateBoothMetaStmt.run(
                  versionId,
                  b.boothId,
                  cleanBoothTitle,
                  group.categoryName,
                  targetCompanyObj.id,
                  targetCompanyObj.name
                );
              }
            }
          }
        }
      }

      // 3. Allocate any remaining unplaced products (including uncertain-category products) strictly within owning company's booths
      const placedNow = new Set<string>(assignedProductIds);
      for (const b of detail.booths) {
        for (const s of b.slots) {
          if (s.product?.id) placedNow.add(s.product.id);
        }
      }

      for (const [compId, compProducts] of productsByCompany.entries()) {
        const orderedProducts = [
          ...compProducts.filter((p) => priorityIds.has(p.id) && !placedNow.has(p.id)),
          ...compProducts.filter((p) => !priorityIds.has(p.id) && !placedNow.has(p.id)),
        ];
        if (orderedProducts.length === 0) continue;

        const compBooths = detail.booths.filter((b) => b.companyId === compId);
        if (compBooths.length === 0) {
          for (const p of orderedProducts) {
            if (priorityIds.size === 0 || priorityIds.has(p.id)) {
              overflowProductIds.push(p.id);
            }
          }
          continue;
        }

        const freeSlotsByBooth: Array<{ boothId: string; freeSlots: string[] }> = [];
        for (const b of compBooths) {
          const currentRows = this.db
            .prepare('SELECT slot_id FROM exhibition_version_booth_slots WHERE version_id = ? AND booth_id = ?')
            .all(versionId, b.boothId) as Array<{ slot_id: string }>;
          const occupiedSlotIds = new Set(currentRows.map((r) => r.slot_id));
          const freeSlots = SLOT_KEYS.filter((k) => !occupiedSlotIds.has(k));
          freeSlotsByBooth.push({ boothId: b.boothId, freeSlots });
        }

        freeSlotsByBooth.sort((a, b) => b.freeSlots.length - a.freeSlots.length);

        let prodCursor = 0;
        for (const entry of freeSlotsByBooth) {
          for (const slotId of entry.freeSlots) {
            if (prodCursor >= orderedProducts.length) break;
            const prod = orderedProducts[prodCursor++];
            upsertDraftSlotStmt.run(versionId, entry.boothId, slotId, prod.id);
            placedNow.add(prod.id);
            assignedSlots++;
            filledBoothIds.add(entry.boothId);
            assignedProductIds.push(prod.id);
          }
          if (prodCursor >= orderedProducts.length) break;
        }

        while (prodCursor < orderedProducts.length) {
          overflowProductIds.push(orderedProducts[prodCursor++].id);
        }
      }
    });

    return {
      version: this.getVersionDetail(versionId)!,
      assignedSlots,
      boothsFilled: filledBoothIds.size,
      assignedProductIds,
      overflowProductIds,
      uncertainProducts,
      classifiedCount,
      zoneDecisions,
    };
  }
}
