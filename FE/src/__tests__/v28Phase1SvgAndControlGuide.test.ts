import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_GUIDE_SPECS,
  resolveControlGuideMode,
} from '../components/v28/VisualControlGuide';
import { V28_ICON_ASSET_URLS, type V28IconName } from '../components/v28/V28SvgIcon';

const ICON_NAMES: V28IconName[] = [
  'audio-on',
  'audio-off',
  'bolt',
  'camera',
  'chat',
  'close',
  'compass',
  'edit',
  'gamepad',
  'gift',
  'globe',
  'joystick',
  'map',
  'menu',
  'walk',
];

const GUIDE_FILES = [
  'control-desktop.svg',
  'control-mobile-portrait.svg',
  'control-mobile-landscape.svg',
];

describe('V28 Phase 1 — Real SVG Assets & Visual Control Guide', () => {
  it('verifies all 15 UI icon SVGs and 3 Visual Control Guide SVGs exist as clean, safe static SVG files', () => {
    const iconsDir = path.resolve(process.cwd(), 'FE/src/assets/icons/v28');
    const guidesDir = path.resolve(process.cwd(), 'FE/src/assets/guides/v28');

    for (const name of ICON_NAMES) {
      const filePath = path.join(iconsDir, `${name}.svg`);
      expect(fs.existsSync(filePath), `Missing icon SVG: ${filePath}`).toBe(true);
      const raw = fs.readFileSync(filePath, 'utf8');
      expect(raw).toContain('<svg');
      expect(raw).toContain('</svg>');
      expect(raw).not.toMatch(/<script|javascript:|onload=|onerror=/i);
      expect(typeof V28_ICON_ASSET_URLS[name]).toBe('string');
      expect(V28_ICON_ASSET_URLS[name].length).toBeGreaterThan(0);
    }

    for (const file of GUIDE_FILES) {
      const filePath = path.join(guidesDir, file);
      expect(fs.existsSync(filePath), `Missing guide SVG: ${filePath}`).toBe(true);
      const raw = fs.readFileSync(filePath, 'utf8');
      expect(raw).toContain('<svg');
      expect(raw).toContain('</svg>');
      expect(raw).not.toMatch(/<script|javascript:|onload=|onerror=/i);
    }
  });

  it('resolves Visual Control Guide mode accurately for desktop, mobile portrait, and mobile landscape', () => {
    expect(resolveControlGuideMode({ isMobileUi: false, isMobileLandscape: false })).toBe('desktop');
    expect(resolveControlGuideMode({ isMobileUi: true, isMobileLandscape: false })).toBe('mobile-portrait');
    expect(resolveControlGuideMode({ isMobileUi: true, isMobileLandscape: true })).toBe('mobile-landscape');

    expect(CONTROL_GUIDE_SPECS.desktop.svgUrl).toBeTruthy();
    expect(CONTROL_GUIDE_SPECS['mobile-portrait'].svgUrl).toBeTruthy();
    expect(CONTROL_GUIDE_SPECS['mobile-landscape'].svgUrl).toBeTruthy();
  });

  it('confirms DynamicWorldHud migrated all targeted UI emojis to V28SvgIcon and VisualControlGuide', () => {
    const hudSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/components/v28/DynamicWorldHud.tsx'),
      'utf8'
    );
    expect(hudSrc).toContain('V28SvgIcon');
    expect(hudSrc).toContain('VisualControlGuideContent');
    expect(hudSrc).toContain('VisualControlGuideModal');
    // Verify none of the replaced UI emojis remain in rendered JSX of DynamicWorldHud
    const replacedEmojis = ['🔇', '🔊', '💬', '🌐', '🎁', '🗺', '☰', '✎', '🧭', '⚡', '🎮', '🕹', '🎥', '🚶'];
    for (const emoji of replacedEmojis) {
      // Allow comments only; strip line & block comments before asserting
      const codeOnly = hudSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(codeOnly.includes(emoji), `Emoji ${emoji} still found in DynamicWorldHud.tsx`).toBe(false);
    }
  });
});
