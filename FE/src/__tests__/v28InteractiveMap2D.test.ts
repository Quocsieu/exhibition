import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import {
  getBoothMapFootprint,
  getCanonicalBoothNumber,
  resolveMapBoothVisualStyle,
  validateMap2DDataConsistency,
} from '../components/v28/InteractiveMap2D';
import type { V28BoothPlacementView, V28ExhibitionVersionDetail } from '../services/v28Api';

describe('Grand Expo V28 Phase 2 — 2D Interactive Map U-Shaped Consistency & Numbering', () => {
  it('validates 100/100 booths, 10 U-shaped zones, stable 1-100 numbering, and exact 1:1 3D X/Z projection', () => {
    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: 100,
      zoneCount: 10,
      boothsPerZone: 10,
    });

    const booths: V28BoothPlacementView[] = layout.placements.map((p) => ({
      versionId: 'v-test',
      boothId: `booth-${String(p.slotIndex + 1).padStart(3, '0')}`,
      boothName: `Gian #${p.slotIndex + 1}`,
      tagline: '',
      description: '',
      category: 'Công nghệ',
      color: '#0ea5e9',
      companyId: 'comp-1',
      companyName: 'Test Corp',
      zoneId: `zone-${p.zoneCode}`,
      zoneCode: p.zoneCode,
      zoneName: `Khu ${p.zoneCode}`,
      slotIndex: p.slotIndex,
      positionX: p.positionX,
      positionZ: p.positionZ,
      rotationY: p.rotationY,
      archetypeId: p.archetypeId,
      archetypeLabel: p.archetypeId,
      archetypeTheme: 'tech',
      glbPath: '',
      footprintWidth: p.footprintWidth,
      footprintDepth: p.footprintDepth,
      approachPoint: p.approachPoint,
      focusCameraPoint: p.focusCameraPoint,
      placementStatus: 'placed',
      slots: [],
      assignedSlotCount: 0,
    }));

    const worldLike: Pick<V28ExhibitionVersionDetail, 'booths' | 'zones' | 'hallBounds'> = {
      booths,
      zones: layout.zones.map((z, idx) => ({
        id: `zone-${z.code}`,
        versionId: 'v-test',
        code: z.code,
        displayName: z.displayName,
        categoryTag: z.categoryTag,
        bounds: z.bounds,
        sortOrder: idx,
        boothCount: z.boothCount,
      })),
      hallBounds: layout.hallBounds,
    };

    const report = validateMap2DDataConsistency(worldLike);
    expect(report.valid).toBe(true);
    expect(report.boothCount).toBe(100);
    expect(report.zoneCount).toBe(10);
    expect(report.uniqueBoothIds).toBe(100);
    expect(report.uniqueBoothNumbers).toBe(100);
    expect(report.minNumber).toBe(1);
    expect(report.maxNumber).toBe(100);
    expect(report.outOfBoundsCount).toBe(0);
    expect(report.duplicateCoordinateCount).toBe(0);

    // Booth #1, mid-row #50, and #100 project 1:1 to their exact World 3D X/Z coordinates
    for (const idx of [0, 49, 99]) {
      const b = booths[idx];
      expect(getCanonicalBoothNumber(b)).toBe(idx + 1);
      const fp = getBoothMapFootprint(b);
      expect(fp.cx).toBeCloseTo(b.positionX, 5);
      expect(fp.cy).toBeCloseTo(b.positionZ, 5);
      expect(fp.width).toBeGreaterThan(5);
      expect(fp.height).toBeGreaterThan(5);
    }

    // Stability: changing company/booth name does NOT change canonical booth number
    const renamedBooth = { ...booths[49], companyName: 'New Brand LLC', boothName: 'Flagship Hall' };
    expect(getCanonicalBoothNumber(renamedBooth)).toBe(50);

    // U-shaped preservation: central boulevard remains completely clear of all 100 booths
    for (const b of booths) {
      const inCentralAvenue =
        b.positionX > layout.centralAvenueBounds.minX && b.positionX < layout.centralAvenueBounds.maxX;
      expect(inCentralAvenue).toBe(false);
    }
  });

  it('Phase 11: resolves dark unvisited, bright visited (+ check indicator), and distinct selected outline without overriding visited fill', () => {
    const unvisited = resolveMapBoothVisualStyle({
      isVisited: false,
      isSelected: false,
      isHovered: false,
      isFilteredIn: true,
    });
    expect(unvisited.tone).toBe('dark');
    expect(unvisited.fill).toBe('#1e293b');
    expect(unvisited.showVisitedCheck).toBe(false);

    const visited = resolveMapBoothVisualStyle({
      isVisited: true,
      isSelected: false,
      isHovered: false,
      isFilteredIn: true,
    });
    expect(visited.tone).toBe('bright');
    expect(visited.fill).toBe('#38bdf8');
    expect(visited.showVisitedCheck).toBe(true);

    const selectedUnvisited = resolveMapBoothVisualStyle({
      isVisited: false,
      isSelected: true,
      isHovered: false,
      isFilteredIn: true,
    });
    expect(selectedUnvisited.tone).toBe('dark');
    expect(selectedUnvisited.fill).toBe('#1e293b');
    expect(selectedUnvisited.stroke).toBe('#f59e0b');
    expect(selectedUnvisited.showVisitedCheck).toBe(false);

    const selectedVisited = resolveMapBoothVisualStyle({
      isVisited: true,
      isSelected: true,
      isHovered: false,
      isFilteredIn: true,
    });
    expect(selectedVisited.tone).toBe('bright');
    expect(selectedVisited.fill).toBe('#38bdf8');
    expect(selectedVisited.stroke).toBe('#f59e0b');
    expect(selectedVisited.showVisitedCheck).toBe(true);
  });
});
