import type { V28BoothPlacementView } from './v28Api';

export interface SimilarBoothSuggestion {
  booth: V28BoothPlacementView;
  matchReason: string;
  productGroupLabel: string;
  score: number;
  distance: number;
}

const STOP_WORDS = new Set([
  'sản', 'phẩm', 'gian', 'hàng', 'chính', 'hãng', 'tại', 'của', 'và', 'cho',
  'với', 'các', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
  'mới', 'cao', 'cấp', 'giá', 'tốt', 'khuyến', 'mãi', 'giảm', 'ngay', 'mua', 'quà', 'tặng',
  'the', 'and', 'for', 'with', 'pro', 'max', 'plus', 'ultra', 'vn', 'gb', 'tb',
]);

function normalizeTokens(text: string): Set<string> {
  // Preserve Vietnamese diacritics so distinct words (e.g. "hoa" vs "hóa", "mật" vs "mất") never false-match
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const out = new Set<string>();
  for (const part of cleaned.split(/\s+/)) {
    if (part.length >= 3 && !STOP_WORDS.has(part)) {
      out.add(part);
    }
  }
  return out;
}

function extractBoothProductTokens(booth: V28BoothPlacementView): Set<string> {
  const combined = booth.slots
    .map((s) => (s.product ? `${s.product.name} ${s.product.description || ''}` : ''))
    .join(' ');
  return normalizeTokens(combined);
}

/**
 * Recommends up to `maxResults` genuinely related booths from real exhibition data.
 *
 * Rules:
 * - Never includes the current booth.
 * - Requires a real match signal: same category, same zone, or overlapping product keywords.
 * - Strongly prioritizes booths that actually have displayed products (`assignedSlotCount > 0`).
 * - Breaks ties by physical proximity (`distance` in meters).
 * - Returns `[]` when no genuinely related booth exists.
 */
export function findSimilarBooths(
  currentBooth: V28BoothPlacementView | null | undefined,
  allBooths: V28BoothPlacementView[],
  maxResults = 3
): SimilarBoothSuggestion[] {
  if (!currentBooth || !Array.isArray(allBooths) || allBooths.length <= 1 || maxResults <= 0) {
    return [];
  }

  const curCat = (currentBooth.category || '').trim().toLowerCase();
  const curZone = (currentBooth.zoneCode || '').trim().toLowerCase();
  const curProductTokens = extractBoothProductTokens(currentBooth);

  const candidates: SimilarBoothSuggestion[] = [];

  for (const other of allBooths) {
    if (other.boothId === currentBooth.boothId) continue;

    const otherCat = (other.category || '').trim().toLowerCase();
    const otherZone = (other.zoneCode || '').trim().toLowerCase();
    const sameCategory = Boolean(curCat && otherCat && curCat === otherCat);
    const sameZone = Boolean(curZone && otherZone && curZone === otherZone);

    let sharedProductHits = 0;
    if (curProductTokens.size > 0 && other.assignedSlotCount > 0) {
      const otherTokens = extractBoothProductTokens(other);
      for (const tok of curProductTokens) {
        if (otherTokens.has(tok)) sharedProductHits += 1;
      }
    }

    // Require genuine domain relation: same category, same zone, or >= 2 distinct product keywords
    if (!sameCategory && !sameZone && sharedProductHits < 2) {
      continue;
    }

    const hasProducts = other.assignedSlotCount > 0;
    const distance = Math.hypot(
      other.positionX - currentBooth.positionX,
      other.positionZ - currentBooth.positionZ
    );

    let score = 0;
    if (hasProducts) score += 100;
    if (sharedProductHits > 0) score += Math.min(60, sharedProductHits * 15);
    if (sameCategory) score += 40;
    if (sameZone) score += 25;
    // Slight proximity bonus (up to +15 for nearby booths)
    score += Math.max(0, 15 - distance * 0.25);

    const matchReason =
      sharedProductHits > 0
        ? 'Sản phẩm tương tự'
        : sameCategory
          ? 'Cùng danh mục'
          : 'Cùng khu vực';

    const productGroupLabel = other.zoneName || other.category || 'Triển lãm';

    candidates.push({
      booth: other,
      matchReason,
      productGroupLabel,
      score,
      distance,
    });
  }

  // If there are booths with real products, prioritize them first; still allow same-category booths if none have products
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.distance - b.distance;
  });

  return candidates.slice(0, maxResults);
}
