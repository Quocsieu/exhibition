import {
  type Booth,
  type BoothFootprint,
  type BoothSlotView,
  type Product,
  BOOTH_SLOT_DEFINITIONS,
  PLAYER_RADIUS,
  WORLD_BOUNDS,
  getBoothApproachPoint,
  getBoothObstacleBox,
} from '../types/expo';

export type NpcSessionStatus =
  | 'IDLE'
  | 'GREETING'
  | 'PRESENTING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR';

export type NpcAnimationClipName = 'IDLE' | 'WAVE' | 'TALKING' | 'PRESENT';

export interface NpcAssistantProfile {
  boothId: string;
  boothName: string;
  assistantName: string;
  roleTitle: string;
  accentColor: string;
}

export interface NpcPlacementTransform {
  localX: number;
  localY: number;
  localZ: number;
  localRotationY: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  worldRotationY: number;
}

export interface NpcPresentationStep {
  stepIndex: number;
  type: 'GREETING' | 'PRODUCT' | 'CLOSING';
  animation: NpcAnimationClipName;
  text: string;
  slotId: string | null;
  slotLabel: string | null;
  product: Product | null;
  productIndex: number | null; // 1-based index (1..N) when type === 'PRODUCT'
  totalProducts: number;
}

export interface NpcPresentationPlan {
  booth: Booth;
  profile: NpcAssistantProfile;
  validSlotViews: BoothSlotView[];
  steps: NpcPresentationStep[];
  totalProducts: number;
}

export const NPC_GLB_URL = `${import.meta.env?.BASE_URL || '/'}models/npc/vietnamese_female_assistant.glb`;

/**
 * Resolves the Vietnamese Female Sales Assistant's name and title for a booth.
 */
export function getNpcAssistantProfile(booth: Pick<Booth, 'id' | 'name' | 'category' | 'color'>): NpcAssistantProfile {
  const haystack = `${booth.id} ${booth.name} ${booth.category || ''}`.toLowerCase();

  let assistantName = 'Ngọc Anh';
  let roleTitle = 'Chuyên viên Tư vấn Triển lãm';

  if (haystack.includes('aether') || haystack.includes('công nghệ') || haystack.includes('điện tử') || haystack.includes('tech')) {
    assistantName = 'Ngọc Anh';
    roleTitle = 'Chuyên viên Tư vấn Công nghệ';
  } else if (haystack.includes('nordic') || haystack.includes('nội thất') || haystack.includes('kiến trúc') || haystack.includes('living')) {
    assistantName = 'Minh Châu';
    roleTitle = 'Chuyên viên Tư vấn Nội thất';
  } else if (haystack.includes('ecovita') || haystack.includes('thực phẩm') || haystack.includes('nông sản') || haystack.includes('cà phê')) {
    assistantName = 'Thảo Vy';
    roleTitle = 'Chuyên viên Tư vấn Nông sản & Cà phê';
  } else if (haystack.includes('kinetix') || haystack.includes('tự động') || haystack.includes('robot') || haystack.includes('sản xuất')) {
    assistantName = 'Khánh Linh';
    roleTitle = 'Chuyên viên Tư vấn Robot & AI';
  } else if (haystack.includes('lumina') || haystack.includes('thiết kế') || haystack.includes('đời sống') || haystack.includes('design')) {
    assistantName = 'Phương Nghi';
    roleTitle = 'Chuyên viên Tư vấn Thiết kế';
  } else if (haystack.includes('solaris') || haystack.includes('năng lượng') || haystack.includes('xanh') || haystack.includes('energy')) {
    assistantName = 'Bảo Trân';
    roleTitle = 'Chuyên viên Tư vấn Năng lượng Xanh';
  }

  return {
    boothId: booth.id,
    boothName: booth.name,
    assistantName,
    roleTitle,
    accentColor: booth.color || '#0ea5e9',
  };
}

/**
 * Computes the deterministic local and world placement for a booth's 3D Sales Assistant NPC.
 *
 * Placement guarantees:
 * - Stands beside the right storefront entrance (`localX = vw / 2 + 0.18 = 3.18m`, `localZ = vd / 2 + 0.25 = 2.45m`)
 * - 100% clear of all 6 product slots (`slot_01..slot_06` span `x = -3.03m .. +3.03m` at `z = 0.68..1.12m`)
 * - 100% clear of the visitor approach point (`[0, 0, ~3.8m]`) and walkway
 * - Angled slightly inward (`localRotationY = -0.28 rad`) facing approaching visitors
 */
export function computeNpcPlacement(booth: BoothFootprint): NpcPlacementTransform {
  const vw = Math.max(booth.width || 5.6, 6.0);
  const vd = Math.max(booth.depth || 4.2, 4.4);

  const localX = Number((vw / 2 + 0.18).toFixed(3));
  const localY = 0.02;
  const localZ = Number((vd / 2 + 0.25).toFixed(3));
  const localRotationY = -0.28;

  const ry = booth.rotationY || 0;
  const cosR = Math.cos(ry);
  const sinR = Math.sin(ry);

  const worldX = Number((booth.positionX + localX * cosR + localZ * sinR).toFixed(3));
  const worldY = localY;
  const worldZ = Number((booth.positionZ - localX * sinR + localZ * cosR).toFixed(3));
  const worldRotationY = Number((ry + localRotationY).toFixed(4));

  return {
    localX,
    localY,
    localZ,
    localRotationY,
    worldX,
    worldY,
    worldZ,
    worldRotationY,
  };
}

/**
 * Validates that a booth's NPC placement does not block the walkway, approach point,
 * product slots, or booth interior obstacle box.
 */
export function verifyNpcPlacementSafety(booth: BoothFootprint): {
  valid: boolean;
  withinWorldBounds: boolean;
  clearOfApproachPoint: boolean;
  clearOfProductSlots: boolean;
  clearOfBoothInterior: boolean;
  distanceToApproachPoint: number;
} {
  const placement = computeNpcPlacement(booth);
  const approach = getBoothApproachPoint(booth);
  const box = getBoothObstacleBox(booth);

  const withinWorldBounds =
    placement.worldX >= WORLD_BOUNDS.minX + PLAYER_RADIUS &&
    placement.worldX <= WORLD_BOUNDS.maxX - PLAYER_RADIUS &&
    placement.worldZ >= WORLD_BOUNDS.minZ + PLAYER_RADIUS &&
    placement.worldZ <= WORLD_BOUNDS.maxZ - PLAYER_RADIUS;

  const distanceToApproachPoint = Number(
    Math.hypot(placement.worldX - approach.x, placement.worldZ - approach.z).toFixed(3)
  );
  const clearOfApproachPoint = distanceToApproachPoint >= 1.6;

  // Check distance in local space to all 6 product slots
  const clearOfProductSlots = BOOTH_SLOT_DEFINITIONS.every((slot) => {
    const dx = placement.localX - slot.position[0];
    const dz = placement.localZ - slot.position[2];
    return Math.hypot(dx, dz) >= 1.25 && Math.abs(placement.localX) > Math.abs(slot.position[0]) + 0.55;
  });

  // Outside the booth's core obstacle box
  const clearOfBoothInterior =
    placement.worldX < box.minX ||
    placement.worldX > box.maxX ||
    placement.worldZ < box.minZ ||
    placement.worldZ > box.maxZ;

  return {
    valid: withinWorldBounds && clearOfApproachPoint && clearOfProductSlots && clearOfBoothInterior,
    withinWorldBounds,
    clearOfApproachPoint,
    clearOfProductSlots,
    clearOfBoothInterior,
    distanceToApproachPoint,
  };
}

/**
 * Strips HTML tags, undefined/null tokens, and normalizes whitespace for safe Vietnamese TTS & subtitles.
 */
export function sanitizeSpeechText(raw: unknown, maxLength = 220): string {
  if (typeof raw !== 'string') return '';
  let cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/<\s*(?=\d)/g, 'dưới ')
    .replace(/>\s*(?=\d)/g, 'trên ')
    .replace(/[<>]/g, ' ')
    .replace(/\b(undefined|null|NaN)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const lastSentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf(' '));
  const cut = lastSentenceEnd > maxLength * 0.6 ? slice.slice(0, lastSentenceEnd) : slice;
  return `${cut.replace(/[.,;:\s]+$/, '')}.`;
}

/**
 * Formats a product price for natural Vietnamese speech and subtitles.
 * Returns empty string if price is missing, zero, or invalid.
 */
export function formatVietnameseSpeechPrice(price: unknown, currency = 'VND'): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return '';
  }
  const upperCurr = (currency || 'VND').trim().toUpperCase();
  const formattedNumber = Math.round(price).toLocaleString('vi-VN');
  if (upperCurr === 'VND' || upperCurr === 'VNĐ' || upperCurr === '₫') {
    return `${formattedNumber} đồng`;
  }
  return `${formattedNumber} ${upperCurr}`;
}

/**
 * Filters a booth's slots in exact slot display order (`slot_01` .. `slot_06`),
 * returning only slots with a valid, active product belonging to `boothId`.
 */
export function filterValidBoothSlotProducts(
  boothId: string,
  slots: BoothSlotView[] | undefined,
  allValidProducts?: Product[]
): BoothSlotView[] {
  if (!slots || slots.length === 0) return [];

  const validProductMap = allValidProducts
    ? new Map<string, Product>(allValidProducts.map((p) => [p.id, p]))
    : null;

  const slotOrderMap = new Map<string, number>(
    BOOTH_SLOT_DEFINITIONS.map((def, idx) => [def.slotId, idx])
  );

  const sortedSlots = [...slots].sort((a, b) => {
    const orderA = slotOrderMap.get(a.slot.slotId) ?? 999;
    const orderB = slotOrderMap.get(b.slot.slotId) ?? 999;
    return orderA - orderB;
  });

  const seenProductIds = new Set<string>();
  const result: BoothSlotView[] = [];

  for (const slotView of sortedSlots) {
    const candidate = slotView.product;
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim()) continue;

    // Resolve fresh product record if allValidProducts is provided
    const latestProduct = validProductMap ? validProductMap.get(candidate.id) : candidate;
    if (!latestProduct) continue;

    // Must belong to this booth and have a valid name
    if (latestProduct.boothId !== boothId) continue;
    const cleanName = sanitizeSpeechText(latestProduct.name, 140);
    if (!cleanName) continue;

    // Avoid repeating the exact same product in the same presentation run
    if (seenProductIds.has(latestProduct.id)) continue;
    seenProductIds.add(latestProduct.id);

    result.push({
      ...slotView,
      productId: latestProduct.id,
      product: latestProduct,
    });
  }

  return result;
}

/**
 * Builds the complete sequential presentation plan (Greeting -> Product 1..N -> Closing)
 * from real booth, slot, and product data.
 */
export function buildBoothPresentationPlan(
  booth: Booth,
  slots: BoothSlotView[] | undefined,
  allValidProducts?: Product[]
): NpcPresentationPlan {
  const profile = getNpcAssistantProfile(booth);
  const validSlotViews = filterValidBoothSlotProducts(booth.id, slots, allValidProducts);
  const totalProducts = validSlotViews.length;
  const cleanBoothName = sanitizeSpeechText(booth.name, 100) || 'Gian hàng triển lãm';
  const cleanTagline = sanitizeSpeechText(booth.tagline, 120);

  const steps: NpcPresentationStep[] = [];

  if (totalProducts === 0) {
    steps.push({
      stepIndex: 0,
      type: 'GREETING',
      animation: 'WAVE',
      text: `Xin chào! Mình là ${profile.assistantName}. Chào mừng bạn đến với gian hàng ${cleanBoothName}. Hiện tại gian hàng chưa có sản phẩm nào được trưng bày trên kệ để giới thiệu. Cảm ơn bạn đã ghé thăm!`,
      slotId: null,
      slotLabel: null,
      product: null,
      productIndex: null,
      totalProducts: 0,
    });

    return {
      booth,
      profile,
      validSlotViews,
      steps,
      totalProducts: 0,
    };
  }

  // 1. Greeting step
  const taglineClause = cleanTagline ? `, chuyên về ${cleanTagline.replace(/\.$/, '')}` : '';
  steps.push({
    stepIndex: 0,
    type: 'GREETING',
    animation: 'WAVE',
    text: `Xin chào! Mình là ${profile.assistantName}. Chào mừng bạn đến với gian hàng ${cleanBoothName}${taglineClause}. Sau đây mình xin giới thiệu lần lượt ${totalProducts} sản phẩm đang được trưng bày tại gian hàng.`,
    slotId: validSlotViews[0].slot.slotId,
    slotLabel: validSlotViews[0].slot.label,
    product: validSlotViews[0].product,
    productIndex: null,
    totalProducts,
  });

  // 2. Sequential product steps (1..N)
  validSlotViews.forEach((slotView, idx) => {
    const product = slotView.product!;
    const cleanName = sanitizeSpeechText(product.name, 120);
    const cleanDesc = sanitizeSpeechText(product.description, 175);
    const priceText = formatVietnameseSpeechPrice(product.price, product.currency);

    let prefix: string;
    if (idx === 0) {
      prefix = 'Đầu tiên là sản phẩm';
    } else if (idx === totalProducts - 1 && totalProducts > 1) {
      prefix = 'Cuối cùng là sản phẩm';
    } else {
      prefix = `Tiếp theo là sản phẩm thứ ${idx + 1},`;
    }

    const clauses: string[] = [`${prefix} ${cleanName}.`];
    if (priceText) {
      clauses.push(`Sản phẩm có giá niêm yết ${priceText}.`);
    }
    if (cleanDesc) {
      clauses.push(cleanDesc.endsWith('.') ? cleanDesc : `${cleanDesc}.`);
    }

    steps.push({
      stepIndex: steps.length,
      type: 'PRODUCT',
      animation: 'PRESENT',
      text: clauses.join(' '),
      slotId: slotView.slot.slotId,
      slotLabel: slotView.slot.label,
      product,
      productIndex: idx + 1,
      totalProducts,
    });
  });

  // 3. Closing step
  steps.push({
    stepIndex: steps.length,
    type: 'CLOSING',
    animation: 'WAVE',
    text: `Đó là những sản phẩm đang được trưng bày tại gian hàng ${cleanBoothName}. Bạn có thể nhấn trực tiếp vào từng sản phẩm trên kệ để xem chi tiết. Cảm ơn bạn đã ghé thăm!`,
    slotId: null,
    slotLabel: null,
    product: null,
    productIndex: null,
    totalProducts,
  });

  return {
    booth,
    profile,
    validSlotViews,
    steps,
    totalProducts,
  };
}

/**
 * Selects the best available Vietnamese (`vi-VN` / `vi`) voice from Web Speech API.
 * Strictly returns `null` if no Vietnamese voice exists (never falls back to an English voice).
 */
export function selectVietnameseVoice(
  voices: SpeechSynthesisVoice[] | undefined | null
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const viVoices = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    return lang.startsWith('vi');
  });

  if (viVoices.length === 0) {
    return null;
  }

  const femaleKeywords = ['hoaimy', 'linh', 'myan', 'female', 'nữ', 'nu', 'natural', 'google'];
  let bestVoice = viVoices[0];
  let bestScore = -1;

  for (const v of viVoices) {
    const nameLower = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
    let score = 0;
    if ((v.lang || '').toLowerCase().includes('vi-vn')) score += 2;
    for (const kw of femaleKeywords) {
      if (nameLower.includes(kw)) score += 3;
    }
    if (v.localService) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestVoice = v;
    }
  }

  return bestVoice;
}
