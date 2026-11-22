import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  AGRI_DEMO_BOOTH_SPECS,
  applyAgriDemoShowcaseOverlay,
  inferProductShape3D,
} from '../services/v28AgriDemoShowcase';
import { findSimilarBooths } from '../services/similarBooths';
import { buildBoothConsultationSteps } from '../services/npcConsultationScript';
import type { V28ExhibitionVersionDetail } from '../services/v28Api';

const SNAPSHOT_PATH =
  'C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/scratch/prod_world_snapshot.json';

describe('Grand Expo V28 Phase 3 — Agricultural Product Showcase (10 Booths, 6 Archetypes, 2D+3D)', () => {
  it('P3-T01..T04, P3-T15: overlays 10 agricultural demo booths across all 6 archetypes without touching CELLPHONES booths', () => {
    expect(AGRI_DEMO_BOOTH_SPECS).toHaveLength(10);
    if (!fs.existsSync(SNAPSHOT_PATH)) return;
    const rawWorld = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as V28ExhibitionVersionDetail;
    const originalPopulatedIds = rawWorld.booths.filter((b) => b.assignedSlotCount > 0).map((b) => b.boothId);

    const { world, appliedBoothIds } = applyAgriDemoShowcaseOverlay(rawWorld);
    expect(appliedBoothIds).toHaveLength(10);

    // Original CELLPHONES booths must be 100% untouched
    for (const origId of originalPopulatedIds) {
      expect(appliedBoothIds.includes(origId)).toBe(false);
      const before = rawWorld.booths.find((b) => b.boothId === origId)!;
      const after = world.booths.find((b) => b.boothId === origId)!;
      expect(after.assignedSlotCount).toBe(before.assignedSlotCount);
      expect(after.boothName).toBe(before.boothName);
      expect(after.zoneCategoryTag).toBe(before.zoneCategoryTag);
    }

    // Applied 10 booths must cover all 6 archetypes & each has valid 2D image + 3D shape + agricultural category metadata (P2-01)
    const appliedBooths = world.booths.filter((b) => appliedBoothIds.includes(b.boothId));
    const archetypes = new Set(appliedBooths.map((b) => b.archetypeId));
    expect(archetypes.size).toBe(6);

    for (const b of appliedBooths) {
      expect(b.assignedSlotCount).toBe(2);
      expect(b.category).toBe('Nông sản');
      expect(b.zoneCategoryTag).toContain('Nông sản');
      expect(b.zoneCategoryTag).not.toMatch(/Điện thoại|Âm thanh|Máy tính bảng/i);
      const prods = b.slots.filter((s) => Boolean(s.product)).map((s) => s.product!);
      for (const p of prods) {
        expect(p.images[0]).toContain('data:image/svg+xml');
        expect(inferProductShape3D(p)).not.toBeNull();
      }
      // NPC narration & product highlight linkage
      const steps = buildBoothConsultationSteps(b);
      const prodSteps = steps.filter((s) => s.type === 'PRODUCT');
      expect(prodSteps).toHaveLength(2);
      expect(prodSteps[0].product?.id).toBe(prods[0].id);

      // Similar booth suggestions return real agricultural peers (excluding self)
      const sims = findSimilarBooths(b, world.booths, 3);
      expect(sims.length).toBeGreaterThan(0);
      expect(sims.every((s) => s.booth.boothId !== b.boothId)).toBe(true);
    }
  });
});
