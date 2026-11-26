import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import {
  classifyMinimapBoothStatus,
  computeMinimapViewBox,
  getMinimapBoothFill,
} from '../components/v28/WorldMinimapTopRight';
import { worldToLandscapeMapPoint, worldHeadingToLandscapeDir } from '../components/v28/InteractiveMap2D';
import fs from 'node:fs';
import path from 'node:path';

describe('Grand Expo V28 H1 + H2 — World HUD Compaction & Top-Right Interactive Minimap', () => {
  it('H2: computes landscape SVG viewBox from real 100-booth hallBounds with all booths inside viewBox', () => {
    const layout = generateDynamicExhibitionLayout({
      targetBoothCount: 100,
      zoneCount: 10,
      boothsPerZone: 10,
    });
    const vb = computeMinimapViewBox(layout.hallBounds, 8);
    expect(vb.width).toBeGreaterThan(vb.height);
    expect(vb.viewBoxStr).toBe(`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`);

    for (const p of layout.placements) {
      const pt = worldToLandscapeMapPoint(p.positionX, p.positionZ);
      expect(pt.mx).toBeGreaterThanOrEqual(vb.minX);
      expect(pt.mx).toBeLessThanOrEqual(vb.minX + vb.width);
      expect(pt.my).toBeGreaterThanOrEqual(vb.minY);
      expect(pt.my).toBeLessThanOrEqual(vb.minY + vb.height);
    }

    // Spawn facing -Z points right (+1, 0) in landscape minimap
    const dir = worldHeadingToLandscapeDir(Math.PI);
    expect(dir.dx).toBeCloseTo(1, 5);
    expect(dir.dy).toBeCloseTo(0, 5);
  });

  it('H2: distinguishes visited, populated, and empty booths cleanly on Minimap', () => {
    const visited = new Set(['booth-001']);
    expect(classifyMinimapBoothStatus({ boothId: 'booth-001', assignedSlotCount: 2 }, visited)).toBe('visited');
    expect(classifyMinimapBoothStatus({ boothId: 'booth-002', assignedSlotCount: 3 }, visited)).toBe('populated');
    expect(classifyMinimapBoothStatus({ boothId: 'booth-003', assignedSlotCount: 0 }, visited)).toBe('empty');

    expect(getMinimapBoothFill('visited')).not.toBe(getMinimapBoothFill('populated'));
    expect(getMinimapBoothFill('populated')).not.toBe(getMinimapBoothFill('empty'));
  });

  it('H1 + H2: removes wide horizontal Top Header, mounts Top-Right Minimap + ⋯ menu, and defaults NearbyDiscoveryWidget collapsed at bottom-left', () => {
    const hudSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/components/v28/DynamicWorldHud.tsx'),
      'utf8'
    );
    const nearbySrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/components/v28/NearbyDiscoveryWidget.tsx'),
      'utf8'
    );

    // Wide horizontal header removed & Overview / Onboarding overlay removed
    expect(hudSrc).not.toContain('data-testid="v28-desktop-top-bar"');
    expect(hudSrc).not.toContain('aria-label="Thanh tiêu đề triển lãm"');
    expect(hudSrc).not.toContain('Toàn cảnh');
    expect(hudSrc).not.toContain('<OnboardingOverlay');
    // Top-right cluster + Minimap + ⋯ menu present
    expect(hudSrc).toContain('data-testid="v28-top-right-hud-cluster"');
    expect(hudSrc).toContain('<WorldMinimapTopRight');
    expect(hudSrc).toContain('data-testid="v28-hud-more-btn"');
    expect(hudSrc).toContain('data-testid="v28-visit-progress"');
    expect(hudSrc).toContain('data-testid="v28-reward-trigger"');

    // NearbyDiscoveryWidget defaults collapsed on both Desktop & Mobile and anchors bottom-left
    expect(nearbySrc).toContain('useState<boolean>(false)');
    expect(nearbySrc).toContain('bottom: bottomOffset');
    expect(nearbySrc).toContain('left: leftOffset');
    expect(nearbySrc).toContain('data-testid="v28-nearby-expand-btn"');
  });

  it('Phase 5: removes Legacy Admin button from AdminV28Page and uses real SVG icon assets', () => {
    const adminSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/pages/AdminV28Page.tsx'),
      'utf8'
    );
    const iconDir = path.resolve(process.cwd(), 'FE/src/assets/icons/v28');

    expect(adminSrc).not.toContain('Quản trị bản cũ');
    expect(adminSrc).not.toContain('🏛️');
    expect(adminSrc).toContain('<V28SvgIcon name="dashboard"');
    expect(adminSrc).toContain('<V28SvgIcon name="sparkles"');
    expect(adminSrc).toContain('<V28SvgIcon name="gift"');
    expect(adminSrc).toContain('<V28SvgIcon name="globe"');
    expect(adminSrc).toContain('<V28SvgIcon name="logout"');

    for (const file of ['dashboard.svg', 'sparkles.svg', 'logout.svg', 'warning.svg', 'check.svg', 'edit.svg', 'compass.svg']) {
      expect(fs.existsSync(path.join(iconDir, file))).toBe(true);
    }
  });
});
