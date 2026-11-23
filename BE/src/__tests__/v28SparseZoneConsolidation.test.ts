import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  planSparseZoneConsolidation,
  type CompactableBoothInput,
  type CompactableZoneInput,
} from '../services/v28/zoneCompaction.js';

function makeMockZonesAndBooths(counts: Array<{ code: string; count: number }>) {
  const zones: CompactableZoneInput[] = [];
  const booths: CompactableBoothInput[] = [];
  let slotIndex = 0;

  counts.forEach((entry, zIdx) => {
    const zoneId = `zone-${entry.code}`;
    zones.push({
      id: zoneId,
      versionId: 'ver-1',
      code: entry.code,
      categoryId: null,
      displayName: `Khu ${entry.code}`,
      categoryTag: `Phân khu ${entry.code}`,
      bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
      sortOrder: zIdx,
      boothCount: entry.count,
    });
    for (let i = 0; i < entry.count; i++) {
      booths.push({
        boothId: `booth-${entry.code}-${i + 1}`,
        zoneId,
        zoneCode: entry.code,
        slotIndex: slotIndex++,
        positionX: 0,
        positionZ: 0,
        rotationY: 0,
        archetypeId: 'signature_ring',
        footprintWidth: 8.4,
        footprintDepth: 6.49,
        approachPoint: { x: 0, z: 4 },
        focusCameraPoint: { x: 0, z: 6 },
      });
    }
  });

  return { zones, booths };
}

describe('V28 Option A — Sparse Zone Consolidation', () => {
  it('plans consolidation for 27 booths across 10 zones (10,2,1,1,1,1,1,1,1,8) into 3 zones (10,9,8)', () => {
    const { zones, booths } = makeMockZonesAndBooths([
      { code: 'A', count: 10 },
      { code: 'B', count: 2 },
      { code: 'C', count: 1 },
      { code: 'D', count: 1 },
      { code: 'E', count: 1 },
      { code: 'F', count: 1 },
      { code: 'G', count: 1 },
      { code: 'H', count: 1 },
      { code: 'I', count: 1 },
      { code: 'J', count: 8 },
    ]);

    const plan = planSparseZoneConsolidation(zones, booths, { sparseThreshold: 3 });
    expect(plan.canConsolidate).toBe(true);
    expect(plan.previousZoneCount).toBe(10);
    expect(plan.nextZoneCount).toBe(3);
    expect(plan.mergedZoneCodes).toEqual(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(plan.movedBoothCount).toBe(9);
    expect(plan.plannedZones.map((z) => ({ name: z.displayName, count: z.booths.length }))).toEqual([
      { name: 'Khu A', count: 10 },
      { name: 'Khu Tổng hợp', count: 9 },
      { name: 'Khu J', count: 8 },
    ]);
  });

  it('splits sparse pool evenly into multiple merged zones when exceeding maxBoothsPerZone', () => {
    const { zones, booths } = makeMockZonesAndBooths(
      Array.from({ length: 15 }, (_, i) => ({
        code: String.fromCharCode(65 + i),
        count: 1,
      }))
    );

    const plan = planSparseZoneConsolidation(zones, booths, {
      sparseThreshold: 3,
      maxBoothsPerZone: 10,
    });
    expect(plan.canConsolidate).toBe(true);
    expect(plan.previousZoneCount).toBe(15);
    expect(plan.nextZoneCount).toBe(2);
    expect(plan.plannedZones.map((z) => ({ name: z.displayName, count: z.booths.length }))).toEqual([
      { name: 'Khu Tổng hợp 1', count: 8 },
      { name: 'Khu Tổng hợp 2', count: 7 },
    ]);
  });

  it('returns canConsolidate=false when fewer than 2 sparse zones exist', () => {
    const { zones, booths } = makeMockZonesAndBooths([
      { code: 'A', count: 10 },
      { code: 'B', count: 2 },
      { code: 'C', count: 8 },
    ]);
    const plan = planSparseZoneConsolidation(zones, booths, { sparseThreshold: 3 });
    expect(plan.canConsolidate).toBe(false);
    expect(plan.nextZoneCount).toBe(3);
  });

  describe('SQLite + V28ExhibitionService integration', () => {
    let legacyDb: ExpoDatabase;
    let v28Db: V28CatalogDatabase;
    let service: V28ExhibitionService;

    beforeEach(() => {
      legacyDb = new ExpoDatabase(':memory:');
      v28Db = new V28CatalogDatabase(':memory:');
      service = new V28ExhibitionService(v28Db);
    });

    afterEach(() => {
      v28Db.close();
      legacyDb.close();
    });

    it('consolidates sparse zones on a published 10-zone exhibition into 3 valid U-zones while preserving all booth IDs and product slots', () => {
      const comp = v28Db.createCompany({
        name: 'Consolidation Test Co',
        category: 'Nông sản',
      });
      const product = v28Db.createProduct({
        companyId: comp.id,
        name: 'Sản phẩm mẫu',
        category: 'Nông sản',
        price: 120000,
      });

      const exh = service.createExhibition({
        name: 'Triển lãm Test Gộp Khu',
      });
      const draft = service.createDraftVersion(exh.id, {
        targetBoothCount: 100,
        zoneCount: 10,
        boothsPerZone: 10,
        ownerCompanyId: comp.id,
      });

      // Assign 1 product to 27 booths: 10 in zone 0, 2 in zone 1, 1 each in zones 2..8, 8 in zone 9
      const keepPerZone = [10, 2, 1, 1, 1, 1, 1, 1, 1, 8];
      const expectedKeptBoothIds: string[] = [];
      const sortedZones = [...draft.zones].sort((a, b) => a.sortOrder - b.sortOrder);

      sortedZones.forEach((zone, zIdx) => {
        const zBooths = draft.booths
          .filter((b) => b.zoneId === zone.id)
          .sort((a, b) => a.slotIndex - b.slotIndex);
        const keepCount = keepPerZone[zIdx];
        for (let i = 0; i < keepCount; i++) {
          const b = zBooths[i];
          service.assignDraftBoothSlot(draft.versionId, b.boothId, 'slot_01', product.id);
          expectedKeptBoothIds.push(b.boothId);
        }
      });

      service.publishVersion(exh.id, draft.versionId);

      // Sync live slots into the published version snapshot
      const preRemoval = service.removeEmptyBooths(exh.id, draft.versionId, { mode: 'all' });
      expect(preRemoval.removedCount).toBe(73);
      expect(preRemoval.remainingBoothCount).toBe(27);
      expect(preRemoval.remainingZoneCount).toBe(10); // Every zone still has >= 1 booth!

      // Now run Option A sparse zone consolidation
      const consolidated = service.consolidateSparseZones(exh.id, draft.versionId, {
        sparseThreshold: 3,
      });
      expect(consolidated.consolidated).toBe(true);
      expect(consolidated.isPublishedVersion).toBe(true);
      expect(consolidated.previousZoneCount).toBe(10);
      expect(consolidated.remainingZoneCount).toBe(3);
      expect(consolidated.movedBoothCount).toBe(9);
      expect(consolidated.totalBoothCount).toBe(27);
      expect(consolidated.version.validation.valid).toBe(true);
      expect(consolidated.version.zones.map((z) => z.boothCount)).toEqual([10, 9, 8]);

      // All 27 booth IDs and their product slots must be 100% preserved
      const afterBoothIds = consolidated.version.booths.map((b) => b.boothId).sort();
      expect(afterBoothIds).toEqual([...expectedKeptBoothIds].sort());
      for (const b of consolidated.version.booths) {
        expect(b.assignedSlotCount).toBe(1);
      }

      // Calling a second time is a safe no-op
      const secondRun = service.consolidateSparseZones(exh.id, draft.versionId, {
        sparseThreshold: 3,
      });
      expect(secondRun.consolidated).toBe(false);
      expect(secondRun.remainingZoneCount).toBe(3);
    });
  });
});
