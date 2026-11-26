import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FAVORITE_BOOTHS_STORAGE_KEY,
  loadFavoriteBoothIds,
  resolveFavoriteBoothEntries,
  saveFavoriteBoothIds,
  toggleFavoriteBoothId,
} from '../services/v28FavoriteBooths';
import { V28_ICON_ASSET_URLS } from '../components/v28/V28SvgIcon';
import type { V28BoothPlacementView } from '../services/v28Api';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function makeBooth(slotIndex: number, id?: string): V28BoothPlacementView {
  return {
    versionId: 'v-test',
    boothId: id ?? `booth-${slotIndex + 1}`,
    boothName: `Gian #${slotIndex + 1}`,
    tagline: '',
    description: '',
    category: 'Công nghệ',
    color: '#0ea5e9',
    companyId: `comp-${slotIndex + 1}`,
    companyName: `Doanh nghiệp #${slotIndex + 1}`,
    zoneId: 'zone-A',
    zoneCode: 'A',
    zoneName: 'Khu A',
    slotIndex,
    positionX: slotIndex * 10,
    positionZ: 0,
    rotationY: 0,
    archetypeId: 'signature_ring',
    archetypeLabel: 'Signature Ring',
    archetypeTheme: 'tech',
    glbPath: '',
    footprintWidth: 6.72,
    footprintDepth: 5.0,
    approachPoint: { x: slotIndex * 10, z: 4 },
    focusCameraPoint: { x: slotIndex * 10, z: 8 },
    placementStatus: 'placed',
    slots: [],
    assignedSlotCount: 0,
  };
}

describe('V28 Favorite / Pinned Booths Feature', () => {
  it('toggles, deduplicates, persists, and reloads favorite booth IDs cleanly', () => {
    const storage = createMemoryStorage();
    expect(loadFavoriteBoothIds(storage)).toEqual([]);

    const added1 = toggleFavoriteBoothId([], 'booth-10');
    expect(added1).toEqual({ nextIds: ['booth-10'], isFavorite: true });

    const added2 = toggleFavoriteBoothId(added1.nextIds, 'booth-3');
    expect(added2).toEqual({ nextIds: ['booth-10', 'booth-3'], isFavorite: true });

    saveFavoriteBoothIds(['booth-10', 'booth-3', 'booth-10', ' '], storage);
    expect(JSON.parse(storage.getItem(FAVORITE_BOOTHS_STORAGE_KEY) || '[]')).toEqual(['booth-10', 'booth-3']);
    expect(loadFavoriteBoothIds(storage)).toEqual(['booth-10', 'booth-3']);

    const removed = toggleFavoriteBoothId(added2.nextIds, 'booth-10');
    expect(removed).toEqual({ nextIds: ['booth-3'], isFavorite: false });

    // Corrupted JSON falls back safely to []
    storage.setItem(FAVORITE_BOOTHS_STORAGE_KEY, '{bad-json');
    expect(loadFavoriteBoothIds(storage)).toEqual([]);
  });

  it('resolves favorite booth entries sorted by canonical booth number and skips removed booths', () => {
    const booths = [makeBooth(14, 'booth-15'), makeBooth(2, 'booth-3'), makeBooth(7, 'booth-8')];
    const favSet = new Set(['booth-15', 'booth-3', 'booth-deleted']);
    const resolved = resolveFavoriteBoothEntries(booths, favSet);

    expect(resolved.map((e) => ({ id: e.booth.boothId, num: e.boothNumber }))).toEqual([
      { id: 'booth-3', num: 3 },
      { id: 'booth-15', num: 15 },
    ]);
  });

  it('registers heart and heart-filled static SVG assets safely', () => {
    const iconsDir = path.resolve(process.cwd(), 'FE/src/assets/icons/v28');
    for (const name of ['heart', 'heart-filled'] as const) {
      const filePath = path.join(iconsDir, `${name}.svg`);
      expect(fs.existsSync(filePath), `Missing SVG icon: ${filePath}`).toBe(true);
      const raw = fs.readFileSync(filePath, 'utf8');
      expect(raw).toContain('<svg');
      expect(raw).toContain('</svg>');
      expect(typeof V28_ICON_ASSET_URLS[name]).toBe('string');
      expect(V28_ICON_ASSET_URLS[name].length).toBeGreaterThan(0);
    }
  });

  it('wires 3D signboard favorite button and 2D map favorites quick-jump list', () => {
    const booth3dSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/scene/v28/DynamicBooth3D.tsx'),
      'utf8'
    );
    expect(booth3dSrc).toContain('booth-sign-favorite-');
    expect(booth3dSrc).toContain('onToggleFavorite');

    const map2dSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'FE/src/components/v28/InteractiveMap2D.tsx'),
      'utf8'
    );
    expect(map2dSrc).toContain('v28-map-favorites-list');
    expect(map2dSrc).toContain('v28-map-favorites-filter-btn');
    expect(map2dSrc).toContain('v28-map-favorite-go-');
    expect(map2dSrc).toContain('Gian hàng yêu thích');
  });
});
