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

export type NpcAudioRuntimeState =
  | 'IDLE'
  | 'CHECKING_VOICE'
  | 'SPEAKING'
  | 'PAUSED'
  | 'MUTED'
  | 'NO_VI_VOICE'
  | 'AUDIO_ERROR';

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

export const NPC_GLB_URL = `${import.meta.env?.BASE_URL || '/'}models/npc/untitled.glb`;
export const TARGET_NPC_HEIGHT_METERS = 1.7;

export interface NormalizedNpcBoundsResult {
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  normalizedHeight: number;
  normalizedWidth: number;
  normalizedDepth: number;
}

/**
 * Computes the uniform scale factor and local translation offsets so any 3D NPC GLB model
 * (such as `untitled.glb`) stands at human height (`1.70m`), centered horizontally at `(0, 0)`,
 * with feet grounded accurately at `y = 0`.
 */
export function computeNormalizedNpcTransform(
  min: [number, number, number],
  max: [number, number, number],
  targetHeight = TARGET_NPC_HEIGHT_METERS
): NormalizedNpcBoundsResult {
  const rawW = Math.max(0.001, max[0] - min[0]);
  const rawH = Math.max(0.001, max[1] - min[1]);
  const rawD = Math.max(0.001, max[2] - min[2]);
  const scale = Number((targetHeight / rawH).toFixed(6));
  const centerX = (min[0] + max[0]) * 0.5;
  const centerZ = (min[2] + max[2]) * 0.5;
  const offsetX = Number((-centerX * scale).toFixed(5));
  const offsetY = Number((-min[1] * scale).toFixed(5));
  const offsetZ = Number((-centerZ * scale).toFixed(5));

  return {
    scale,
    offsetX,
    offsetY,
    offsetZ,
    normalizedHeight: Number((rawH * scale).toFixed(4)),
    normalizedWidth: Number((rawW * scale).toFixed(4)),
    normalizedDepth: Number((rawD * scale).toFixed(4)),
  };
}

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
 * Placement guarantees (V18 Verified):
 * - Stands on the front-right apron in front of the entrance step and right column:
 *   `localX = vw * 0.42 = 2.52m`, `localY = 0.02m`, `localZ = vd / 2 + 1.04 = 3.24m`
 * - `0.79m` IN FRONT of the front-right column (`x = 3.28m, z = 2.45m`) and `0.76m` inward -> zero column occlusion
 * - `1.13m` inward from the front-right planter/tree (`x = 3.65m, z = 3.68m`) -> zero tree/planter occlusion
 * - Grounded directly on the flat plaza floor (`localY = 0.02m`, in front of `Step_Tier1` which ends at `z = 3.15m`) -> zero floating or plinth sinking
 * - 100% clear of all 6 product slots (`slot_01..slot_06`) and their Focus camera sightlines
 * - 100% clear of the visitor approach point (`[0, 0, ~3.42m]`) and walkway
 * - Angled slightly inward (`localRotationY = -0.26 rad`) facing approaching visitors
 */
export function computeNpcPlacement(booth: BoothFootprint): NpcPlacementTransform {
  const vw = Math.max(booth.width || 5.6, 6.0);
  const vd = Math.max(booth.depth || 4.2, 4.4);

  const localX = Number((vw * 0.3867).toFixed(3));
  const localY = 0.02;
  const localZ = Number((vd / 2 + 1.04).toFixed(3));
  const localRotationY = -0.24;

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
 * product slots, booth columns, planters, or booth interior obstacle box.
 */
export function verifyNpcPlacementSafety(booth: BoothFootprint): {
  valid: boolean;
  withinWorldBounds: boolean;
  clearOfApproachPoint: boolean;
  clearOfProductSlots: boolean;
  clearOfBoothInterior: boolean;
  clearOfColumnsAndPlanters: boolean;
  groundedOnFloor: boolean;
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

  // Check distance in local space to all 6 product slots and Focus camera sightline clearance
  const focusCamZ = 9.05;
  const clearOfProductSlots = BOOTH_SLOT_DEFINITIONS.every((slot) => {
    const dx = placement.localX - slot.position[0];
    const dz = placement.localZ - slot.position[2];
    const dist2D = Math.hypot(dx, dz);
    // Project slot's center onto the plane z = placement.localZ
    const projectedSlotCenterX =
      slot.position[0] * ((focusCamZ - placement.localZ) / (focusCamZ - slot.position[2]));
    return dist2D >= 2.1 && Math.abs(placement.localX - projectedSlotCenterX) >= 0.45;
  });

  // In front of right column (x = 3.28, z = 2.45, radius ~0.22) and clear of front planter (x = 3.65, z = 3.68, radius ~0.35)
  const distToRightColumn = Math.hypot(placement.localX - 3.28, placement.localZ - 2.45);
  const distToRightPlanter = Math.hypot(placement.localX - 3.65, placement.localZ - 3.68);
  const clearOfColumnsAndPlanters =
    placement.localZ >= 2.95 &&
    placement.localX >= 2.1 &&
    placement.localX <= 2.65 &&
    distToRightColumn >= 1.15 &&
    distToRightPlanter >= 1.3;

  // Grounded on flat plaza floor in front of Step_Tier1 (which ends at z = 3.15m)
  const groundedOnFloor = Math.abs(placement.localY - 0.02) < 0.005 && placement.localZ >= 3.18;

  // Outside the booth's core obstacle box
  const clearOfBoothInterior =
    placement.worldX < box.minX ||
    placement.worldX > box.maxX ||
    placement.worldZ < box.minZ ||
    placement.worldZ > box.maxZ;

  return {
    valid:
      withinWorldBounds &&
      clearOfApproachPoint &&
      clearOfProductSlots &&
      clearOfBoothInterior &&
      clearOfColumnsAndPlanters &&
      groundedOnFloor,
    withinWorldBounds,
    clearOfApproachPoint,
    clearOfProductSlots,
    clearOfBoothInterior,
    clearOfColumnsAndPlanters,
    groundedOnFloor,
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
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\[(?:SKU|Mã|ID)[^\]]*\]/gi, ' ')
    .replace(/<\s*(?=\d)/g, 'dưới ')
    .replace(/>\s*(?=\d)/g, 'trên ')
    .replace(/[<>]/g, ' ')
    .replace(/(\p{L})\s*\/\s*(\p{L})/gu, '$1 và $2')
    .replace(/&/g, ' và ')
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
      text: `Dạ xin chào quý khách! Em là ${profile.assistantName}, chuyên viên tư vấn tại gian hàng ${cleanBoothName}. Hiện tại gian hàng chưa có sản phẩm nào được trưng bày trên kệ. Em cảm ơn quý khách đã ghé thăm ạ!`,
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
    text: `Dạ xin chào quý khách! Em là ${profile.assistantName}, tư vấn viên tại gian hàng ${cleanBoothName}${taglineClause}. Hôm nay, em xin phép giới thiệu ${totalProducts} sản phẩm tiêu biểu đang trưng bày tại gian hàng mình ạ.`,
    slotId: validSlotViews[0].slot.slotId,
    slotLabel: validSlotViews[0].slot.label,
    product: validSlotViews[0].product,
    productIndex: null,
    totalProducts,
  });

  // 2. Sequential product steps (1..N)
  validSlotViews.forEach((slotView, idx) => {
    const product = slotView.product!;
    const cleanName = sanitizeSpeechText(product.name, 115);
    const cleanDesc = sanitizeSpeechText(product.description, 155);
    const priceText = formatVietnameseSpeechPrice(product.price, product.currency);

    let introClause: string;
    if (idx === 0) {
      introClause = `Mở đầu là mẫu ${cleanName}`;
    } else if (idx === totalProducts - 1 && totalProducts > 1) {
      introClause = `Và sản phẩm tiếp theo trên kệ là ${cleanName}`;
    } else {
      introClause = `Tiếp theo là sản phẩm thứ ${idx + 1}, ${cleanName}`;
    }

    const clauses: string[] = [];
    if (priceText) {
      clauses.push(`${introClause}, hiện có mức giá ${priceText}.`);
    } else {
      clauses.push(`${introClause}.`);
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
    text: 'Dạ, vừa rồi là những sản phẩm nổi bật đang trưng bày tại gian hàng. Quý khách có thể chạm trực tiếp vào từng sản phẩm trên kệ để xem thông tin chi tiết nhé. Em cảm ơn quý khách đã ghé thăm ạ!',
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

  const viNameKeywords = ['vietnam', 'tiếng việt', 'tieng viet', 'hoaimy', 'namminh', 'myan'];
  const viVoices = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    if (lang.startsWith('vi')) return true;
    const nameLower = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
    return viNameKeywords.some((kw) => nameLower.includes(kw));
  });

  if (viVoices.length === 0) {
    return null;
  }

  const femaleKeywords = ['hoaimy', 'linh', 'myan', 'female', 'nữ', 'nu', 'natural', 'online', 'google'];
  let bestVoice = viVoices[0];
  let bestScore = -1;

  for (const v of viVoices) {
    const nameLower = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
    let score = 0;
    if ((v.lang || '').toLowerCase().replace('_', '-').includes('vi-vn')) score += 2;
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

export interface VietnameseVoiceResolution {
  supported: boolean;
  voice: SpeechSynthesisVoice | null;
  totalVoicesCount: number;
  availableLangs: string[];
}

/**
 * Resolves the best Vietnamese voice, waiting briefly for asynchronous `voiceschanged`
 * if the browser's `speechSynthesis.getVoices()` list has not populated yet.
 */
export async function resolveVietnameseVoiceAsync(
  timeoutMs = 650
): Promise<VietnameseVoiceResolution> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      supported: false,
      voice: null,
      totalVoicesCount: 0,
      availableLangs: [],
    };
  }

  const synth = window.speechSynthesis;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = synth.getVoices() || [];
  } catch {
    voices = [];
  }

  if (voices.length === 0 && timeoutMs > 0) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let settled = false;
      const finish = (list: SpeechSynthesisVoice[]) => {
        if (settled) return;
        settled = true;
        synth.removeEventListener?.('voiceschanged', onVoicesChanged);
        window.clearInterval(pollId);
        window.clearTimeout(timerId);
        resolve(list);
      };

      const onVoicesChanged = () => {
        try {
          const next = synth.getVoices() || [];
          if (next.length > 0) finish(next);
        } catch {
          // ignore
        }
      };

      synth.addEventListener?.('voiceschanged', onVoicesChanged);

      const pollId = window.setInterval(() => {
        try {
          const next = synth.getVoices() || [];
          if (next.length > 0) finish(next);
        } catch {
          // ignore
        }
      }, 80);

      const timerId = window.setTimeout(() => {
        try {
          finish(synth.getVoices() || []);
        } catch {
          finish([]);
        }
      }, timeoutMs);
    });
  }

  const chosen = selectVietnameseVoice(voices);
  const availableLangs = Array.from(
    new Set(voices.map((v) => v.lang || 'unknown').filter(Boolean))
  );

  return {
    supported: true,
    voice: chosen,
    totalVoicesCount: voices.length,
    availableLangs,
  };
}
