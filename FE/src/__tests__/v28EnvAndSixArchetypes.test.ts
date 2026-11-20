import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeDynamicEnvPlacements,
  V28_ENV_ASSET_PATHS,
} from '../scene/v28/v28EnvPlacement';
import { computeRotatedBoothCollider, isPointInRect } from '../scene/v28/v28NavigationBounds';
import { generateDynamicExhibitionLayout, V28_ARCHETYPES } from '../../../BE/src/services/v28/layoutGenerator';
import type { V28ArchetypeId, V28BoothPlacementView } from '../services/v28Api';

const PUBLIC_DIR = path.resolve(process.cwd(), 'FE/public');
const VALID_ARCHETYPE_IDS = new Set<V28ArchetypeId>([
  'signature_ring',
  'organic_flow',
  'grand_portal',
  'wave_pavilion',
  'gallery_arch',
  'dynamic_frame',
]);

function readGlbMagic(filePath: string): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    return buf.toString('ascii');
  } finally {
    fs.closeSync(fd);
  }
}

describe('V28 Phase 4 (Dynamic Env Models) & Phase 5 (100% 6 GLB Archetypes)', () => {
  it('Phase 4: verifies all 6 selected /models/env/*.glb assets exist on disk, are valid glTF 2.0, and stay lightweight (<1MB)', () => {
    for (const [kind, relUrl] of Object.entries(V28_ENV_ASSET_PATHS)) {
      const fullPath = path.join(PUBLIC_DIR, relUrl.replace(/^\//, ''));
      expect(fs.existsSync(fullPath), `Missing env GLB for ${kind}: ${fullPath}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size, `Env GLB ${kind} exceeds 1MB budget`).toBeLessThan(1_024 * 1_024);
      expect(readGlbMagic(fullPath), `Invalid glTF magic in ${kind}`).toBe('glTF');
    }
  });

  it('Phase 5: verifies all 6 V27.4 booth archetype GLB files exist on disk with valid glTF 2.0 headers', () => {
    expect(V28_ARCHETYPES.length).toBe(6);
    for (const spec of V28_ARCHETYPES) {
      expect(VALID_ARCHETYPE_IDS.has(spec.id)).toBe(true);
      const fullPath = path.join(PUBLIC_DIR, spec.glbPath.replace(/^\//, ''));
      expect(fs.existsSync(fullPath), `Missing booth GLB for ${spec.id}: ${fullPath}`).toBe(true);
      expect(readGlbMagic(fullPath)).toBe('glTF');
    }
  });

  it('Phase 4 + Phase 5: validates 100% real 6 archetypes & collision-free env placements across 1x6, 2x10, 5x10, 10x10, and 10x20 layouts', () => {
    const configs = [
      { zoneCount: 1, boothsPerZone: 6 },
      { zoneCount: 2, boothsPerZone: 10 },
      { zoneCount: 5, boothsPerZone: 10 },
      { zoneCount: 10, boothsPerZone: 10 },
      { zoneCount: 10, boothsPerZone: 20 },
    ];

    for (const cfg of configs) {
      const total = cfg.zoneCount * cfg.boothsPerZone;
      const layout = generateDynamicExhibitionLayout({
        zoneCount: cfg.zoneCount,
        boothsPerZone: cfg.boothsPerZone,
        targetBoothCount: total,
      });

      expect(layout.placements.length).toBe(total);

      // Phase 5: 100% booths use one of the 6 real GLB archetypes
      const usedArchetypes = new Set<string>();
      for (const p of layout.placements) {
        expect(VALID_ARCHETYPE_IDS.has(p.archetypeId as V28ArchetypeId)).toBe(true);
        usedArchetypes.add(p.archetypeId);
      }
      expect(usedArchetypes.size).toBe(6);

      // Build lightweight V28BoothPlacementView views for env clearance validation
      const boothViews = layout.placements.map(
        (p, idx) =>
          ({
            boothId: `b-${idx}`,
            positionX: p.positionX,
            positionZ: p.positionZ,
            rotationY: p.rotationY,
            footprintWidth: p.footprintWidth,
            footprintDepth: p.footprintDepth,
            approachPoint: p.approachPoint,
            focusCameraPoint: p.focusCameraPoint,
          }) as V28BoothPlacementView
      );

      const envItems = computeDynamicEnvPlacements({
        hallBounds: layout.hallBounds,
        centralAvenueBounds: layout.centralAvenueBounds,
        welcomeAreaBounds: layout.welcomeAreaBounds,
        spawnPoint: layout.spawnPoint,
        directoryPoint: layout.directoryPoint,
        booths: boothViews,
      });

      expect(envItems.length).toBeGreaterThan(0);
      expect(envItems.length).toBeLessThanOrEqual(44);

      const colliders = boothViews.map((b) => computeRotatedBoothCollider(b, 1.0));
      for (const item of envItems) {
        const [x, y, z] = item.position;
        expect(y).toBe(0);
        expect(x).toBeGreaterThanOrEqual(layout.hallBounds.minX + 1.5);
        expect(x).toBeLessThanOrEqual(layout.hallBounds.maxX - 1.5);
        expect(z).toBeGreaterThanOrEqual(layout.hallBounds.minZ + 1.5);
        expect(z).toBeLessThanOrEqual(layout.hallBounds.maxZ - 1.5);
        expect(Math.hypot(x - layout.spawnPoint.x, z - layout.spawnPoint.z)).toBeGreaterThanOrEqual(4.0);
        for (const col of colliders) {
          expect(isPointInRect(x, z, col)).toBe(false);
        }
        for (const b of boothViews) {
          expect(Math.hypot(x - b.approachPoint.x, z - b.approachPoint.z)).toBeGreaterThanOrEqual(3.5);
          expect(Math.hypot(x - b.focusCameraPoint.x, z - b.focusCameraPoint.z)).toBeGreaterThanOrEqual(3.3);
        }
      }
    }
  });
});
