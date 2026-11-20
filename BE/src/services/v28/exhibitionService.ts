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
  companyId: string | null;
  companyName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
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
  createdAt: string;
  publishedAt: string | null;
  hallWidth: number;
  hallDepth: number;
  hallBounds: RectBounds;
  walkableBounds: RectBounds;
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
  constructor(private readonly v28Db: V28CatalogDatabase) {}

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
        (this.db.prepare('SELECT COUNT(*) as c FROM zones WHERE version_id = ?').get(activeVersionId) as { c: number })
          .c
      );
      activeBoothCount = Number(
        (
          this.db
            .prepare('SELECT COUNT(*) as c FROM exhibition_version_booths WHERE version_id = ?')
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
    input: LayoutGeneratorInput & { baseVersionId?: string }
  ): ExhibitionVersionDetail {
    const exh = this.db.prepare('SELECT id FROM exhibitions WHERE id = ?').get(exhibitionId) as
      | { id: string }
      | undefined;
    if (!exh) {
      throw httpError(404, 'Không tìm thấy triển lãm.');
    }

    // Phase 8.3: Auto-derive Category-Based Zones (`Khu + Tên danh mục`) from DB categories when not explicitly supplied
    let effectiveCategoryZones = input.categoryZones;
    if (!effectiveCategoryZones || effectiveCategoryZones.length === 0) {
      const catRows = this.db
        .prepare('SELECT id, name FROM categories ORDER BY sort_order ASC, name ASC')
        .all() as Array<{ id: string; name: string }>;
      if (catRows.length > 0) {
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
    }

    const layout = generateDynamicExhibitionLayout({
      ...input,
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
      //    Original non-v28 booths first (sorted by id), then v28-booth-XXX sorted by id.
      const existingBoothRows = this.db
        .prepare(
          `SELECT id, company_id, name FROM booths
           ORDER BY CASE WHEN id LIKE 'v28-booth-%' THEN 1 ELSE 0 END ASC, id ASC`
        )
        .all() as Array<{ id: string; company_id: string | null; name: string }>;

      const boothIdsToUse: string[] = [];
      for (const b of existingBoothRows) {
        if (boothIdsToUse.length < layout.placements.length) {
          boothIdsToUse.push(b.id);
        }
      }

      // 2. Provision additional booths ONLY if targetBoothCount exceeds total existing booths
      const insertBooth = this.db.prepare(`
        INSERT INTO booths (
          id, name, company_name, tagline, description, category, color,
          logo_url, banner_url, contact_email, contact_url,
          position_x, position_z, rotation_y, width, depth, company_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);

      let nextNum = existingBoothRows.length + 1;
      const existingIdSet = new Set(existingBoothRows.map((b) => b.id));
      while (boothIdsToUse.length < layout.placements.length) {
        let candidateId = `v28-booth-${String(nextNum).padStart(3, '0')}`;
        while (existingIdSet.has(candidateId)) {
          nextNum++;
          candidateId = `v28-booth-${String(nextNum).padStart(3, '0')}`;
        }
        existingIdSet.add(candidateId);
        const slotIdx = boothIdsToUse.length;
        const placement = layout.placements[slotIdx];
        const comp = activeCompanies[slotIdx % activeCompanies.length];
        const color = BRAND_COLORS[slotIdx % BRAND_COLORS.length];
        const boothLabel = `${comp.name} #${Math.floor(slotIdx / activeCompanies.length) + 1}`;

        insertBooth.run(
          candidateId,
          boothLabel,
          comp.name,
          comp.category || 'Triển lãm V28',
          comp.description || `Gian hàng trưng bày của ${comp.name}`,
          comp.category || 'General',
          color,
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

      // 3. Insert exhibition_versions row
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
            config: layout.config,
            hallWidth: layout.hallWidth,
            hallDepth: layout.hallDepth,
            hallBounds: layout.hallBounds,
            walkableBounds: layout.walkableBounds,
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

      // 5. Insert exhibition_version_booths placements
      const insertPlacement = this.db.prepare(`
        INSERT INTO exhibition_version_booths (
          version_id, booth_id, zone_id, slot_index,
          position_x, position_z, rotation_y, archetype_id, placement_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'placed')
      `);
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
      }
    });

    return this.getVersionDetail(versionId)!;
  }

  public getVersionDetail(versionId: string): ExhibitionVersionDetail | null {
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

    const placementRows = this.db
      .prepare(
        `SELECT evb.*, b.name as booth_name, b.tagline, b.description, b.category, b.color,
                b.company_id, COALESCE(c.name, b.company_name, b.name) as company_name,
                z.code as zone_code, z.display_name as zone_name
         FROM exhibition_version_booths evb
         JOIN booths b ON b.id = evb.booth_id
         JOIN zones z ON z.id = evb.zone_id
         LEFT JOIN companies c ON c.id = b.company_id
         WHERE evb.version_id = ?
         ORDER BY evb.slot_index ASC`
      )
      .all(versionId) as Array<Record<string, unknown>>;

    // Batch-load all slot assignments + products for booths in this version (zero N+1 queries!)
    const slotRows = this.db
      .prepare(
        `SELECT bsa.booth_id AS assigned_booth_id, bsa.slot_id, p.*
         FROM booth_slot_assignments bsa
         JOIN products p ON p.id = bsa.product_id
         WHERE bsa.booth_id IN (SELECT booth_id FROM exhibition_version_booths WHERE version_id = ?)`
      )
      .all(versionId) as Array<Record<string, unknown>>;

    const slotsByBooth = new Map<string, Map<string, V28Product>>();
    for (const r of slotRows) {
      const bId = String(r.assigned_booth_id);
      if (!slotsByBooth.has(bId)) slotsByBooth.set(bId, new Map());
      let images: string[] = [];
      try {
        const parsed = JSON.parse(String(r.images_json || '[]'));
        if (Array.isArray(parsed)) images = parsed.map(String);
      } catch {}
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
        companyId: row.company_id ? String(row.company_id) : null,
        companyName: String(row.company_name || row.booth_name),
        zoneId: String(row.zone_id),
        zoneCode: String(row.zone_code),
        zoneName: String(row.zone_name),
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

    const zones: ExhibitionZoneRecord[] = zoneRows.map((z) => ({
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

    const clusters: GeneratedClusterSpec[] = Array.isArray(layoutMeta.clusters)
      ? layoutMeta.clusters
      : [];

    const validation = validateExhibitionLayout({
      hallBounds: layoutMeta.hallBounds,
      centralAvenueBounds: layoutMeta.centralAvenueBounds,
      welcomeAreaBounds: layoutMeta.welcomeAreaBounds,
      walkwayGraph: layoutMeta.walkwayGraph,
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
      })),
      placements: booths.map((b) => ({
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

    return {
      exhibitionId: String(ver.exhibition_id),
      exhibitionName: String(ver.exhibition_name),
      versionId,
      versionNumber: Number(ver.version_number),
      status: String(ver.status) as ExhibitionVersionStatus,
      targetBoothCount: Number(ver.target_booth_count),
      createdAt: String(ver.created_at),
      publishedAt: ver.published_at ? String(ver.published_at) : null,
      hallWidth: Number(layoutMeta.hallWidth || 80),
      hallDepth: Number(layoutMeta.hallDepth || 80),
      hallBounds: layoutMeta.hallBounds,
      walkableBounds: layoutMeta.walkableBounds,
      centralAvenueBounds: layoutMeta.centralAvenueBounds,
      welcomeAreaBounds: layoutMeta.welcomeAreaBounds,
      spawnPoint: layoutMeta.spawnPoint,
      directoryPoint: layoutMeta.directoryPoint,
      cameraOverviewBounds: layoutMeta.cameraOverviewBounds,
      roofBounds,
      walkwayGraph: layoutMeta.walkwayGraph,
      clusters,
      zones,
      booths,
      validation,
    };
  }

  public getActiveExhibitionWorld(previewVersionId?: string): ExhibitionVersionDetail {
    if (previewVersionId) {
      const preview = this.getVersionDetail(previewVersionId);
      if (!preview) {
        throw httpError(404, 'Không tìm thấy phiên bản xem trước.');
      }
      return preview;
    }

    const exh = this.ensureDefaultExhibition(20);
    const targetVersionId = exh.activeVersionId || exh.latestDraftVersionId;
    if (!targetVersionId) {
      throw httpError(404, 'Chưa có phiên bản triển lãm nào.');
    }
    return this.getVersionDetail(targetVersionId)!;
  }

  private assertDraftVersion(versionId: string): { exhibitionId: string } {
    const row = this.db
      .prepare('SELECT exhibition_id, status FROM exhibition_versions WHERE id = ?')
      .get(versionId) as { exhibition_id: string; status: string } | undefined;
    if (!row) {
      throw httpError(404, 'Không tìm thấy phiên bản layout.');
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
    patch: { displayName?: string; categoryTag?: string }
  ): ExhibitionVersionDetail {
    this.assertDraftVersion(versionId);
    const existing = this.db
      .prepare('SELECT id, display_name, category_tag FROM zones WHERE id = ? AND version_id = ?')
      .get(zoneId, versionId) as { id: string; display_name: string; category_tag: string } | undefined;
    if (!existing) {
      throw httpError(404, 'Không tìm thấy phân khu trong bản Draft.');
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
    }
  ): ExhibitionVersionDetail {
    this.assertDraftVersion(versionId);
    const currentDetail = this.getVersionDetail(versionId);
    if (!currentDetail) throw httpError(404, 'Không tìm thấy phiên bản.');

    const target = currentDetail.booths.find((b) => b.boothId === boothId);
    if (!target) throw httpError(404, 'Gian hàng không thuộc phiên bản Draft này.');

    // Validate company ownership invariant if reassigning companyId
    if (patch.companyId && patch.companyId !== target.companyId) {
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

      if (patch.companyId) {
        const comp = this.v28Db.getCompanyById(patch.companyId)!;
        this.db
          .prepare('UPDATE booths SET company_id = ?, company_name = ? WHERE id = ?')
          .run(comp.id, comp.name, boothId);
      }
      if (patch.boothName) {
        this.db.prepare('UPDATE booths SET name = ? WHERE id = ?').run(patch.boothName, boothId);
      }
    });

    return this.getVersionDetail(versionId)!;
  }

  /**
   * Publish a Draft version atomically after verifying:
   *  1. Full layout geometry & walkway connectivity validation
   *  2. Company ownership invariants on all assigned booth slots
   *  3. Active/archived booth lifecycle sync (non-destructive)
   */
  public publishVersion(exhibitionId: string, versionId: string): ExhibitionVersionDetail {
    const detail = this.getVersionDetail(versionId);
    if (!detail || detail.exhibitionId !== exhibitionId) {
      throw httpError(404, 'Không tìm thấy phiên bản cần Publish.');
    }
    if (detail.status !== 'draft') {
      throw httpError(409, 'Chỉ có thể Publish phiên bản đang ở trạng thái Draft.');
    }
    if (!detail.validation.valid) {
      throw httpError(
        400,
        `Layout không hợp lệ, không thể Publish: ${detail.validation.errors.slice(0, 3).join(' | ')}`
      );
    }

    // Verify Company Ownership on every booth's assigned slots
    for (const b of detail.booths) {
      if (!b.companyId) {
        throw httpError(400, `Gian hàng "${b.boothName}" chưa được gán doanh nghiệp.`);
      }
      for (const s of b.slots) {
        if (s.product && s.product.companyId !== b.companyId) {
          throw httpError(
            409,
            `Vi phạm sở hữu doanh nghiệp tại gian "${b.boothName}" (${s.slotId}): sản phẩm "${s.product.name}" thuộc doanh nghiệp khác.`
          );
        }
      }
    }

    this.v28Db.runInTransaction(() => {
      // Archive any currently published version of this exhibition (preserving snapshot for rollback!)
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

      // Sync booth active/archived display status non-destructively (NEVER deleting booths, products, or slots)
      const activeIds = new Set(detail.booths.map((b) => b.boothId));
      const allBoothIds = (this.db.prepare('SELECT id FROM booths').all() as Array<{ id: string }>).map(
        (r) => r.id
      );
      const setStatus = this.db.prepare('UPDATE booths SET status = ? WHERE id = ?');
      for (const bId of allBoothIds) {
        setStatus.run(activeIds.has(bId) ? 'active' : 'archived', bId);
      }
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
    });

    return this.getVersionDetail(targetVersionId)!;
  }

  public listArchetypes() {
    return V28_ARCHETYPES;
  }
}
