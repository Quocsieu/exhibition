import type { V28BoothPlacementView } from './v28Api';

export const FAVORITE_BOOTHS_STORAGE_KEY = 'v28_favorite_booths';

function getDefaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadFavoriteBoothIds(storage?: Storage | null): string[] {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return [];
  try {
    const raw = store.getItem(FAVORITE_BOOTHS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          result.push(trimmed);
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function saveFavoriteBoothIds(ids: readonly string[], storage?: Storage | null): void {
  const store = storage === undefined ? getDefaultStorage() : storage;
  if (!store) return;
  try {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    store.setItem(FAVORITE_BOOTHS_STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function toggleFavoriteBoothId(
  currentIds: readonly string[],
  boothId: string
): { nextIds: string[]; isFavorite: boolean } {
  const normalized = boothId.trim();
  if (!normalized) {
    return { nextIds: [...currentIds], isFavorite: false };
  }
  const exists = currentIds.includes(normalized);
  if (exists) {
    return {
      nextIds: currentIds.filter((id) => id !== normalized),
      isFavorite: false,
    };
  }
  return {
    nextIds: [...currentIds, normalized],
    isFavorite: true,
  };
}

export interface FavoriteBoothEntry {
  booth: V28BoothPlacementView;
  boothNumber: number;
}

export function resolveFavoriteBoothEntries(
  worldBooths: readonly V28BoothPlacementView[],
  favoriteIds: ReadonlySet<string>
): FavoriteBoothEntry[] {
  if (favoriteIds.size === 0 || worldBooths.length === 0) return [];
  return worldBooths
    .map((booth, idx) => ({
      booth,
      boothNumber:
        typeof booth.slotIndex === 'number' && Number.isFinite(booth.slotIndex) && booth.slotIndex >= 0
          ? Math.floor(booth.slotIndex) + 1
          : idx + 1,
    }))
    .filter((entry) => favoriteIds.has(entry.booth.boothId))
    .sort((a, b) => a.boothNumber - b.boothNumber);
}
