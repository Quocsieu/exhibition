import type { V28BoothPlacementView, V28Product } from './v28Api';
import { getNpcAssistantProfile } from './npcPresentationService';
import { formatCurrency } from '../components/ProductPanel';
import { buildPiperStepPlanFromDisplayText } from './hybridTtsAdapter';

export interface BoothConsultationStep {
  stepIndex: number;
  type: 'GREETING' | 'PRODUCT' | 'CLOSING';
  slotKey: string;
  slotLabel: string | null;
  product: V28Product | null;
  productIndex: number | null;
  totalProducts: number;
  fallbackText: string;
}

/**
 * Single source of truth for V28 NPC consultation step scripts (Greeting -> Product 1..N -> Closing).
 * Shared between V28NpcConsultantPanel (playback) and DynamicExhibitionPage (Hybrid smart preloading)
 * so preloaded content hashes match playback chunks 100% identically.
 */
export function buildBoothConsultationSteps(booth: V28BoothPlacementView): BoothConsultationStep[] {
  const profile = getNpcAssistantProfile({
    id: booth.boothId,
    name: booth.boothName,
    category: booth.category,
    color: booth.color,
  });

  const validSlots = booth.slots.filter((s) => Boolean(s.product));
  const totalProducts = validSlots.length;
  const list: BoothConsultationStep[] = [
    {
      stepIndex: 0,
      type: 'GREETING',
      slotKey: 'welcome',
      slotLabel: null,
      product: null,
      productIndex: null,
      totalProducts,
      fallbackText: `Xin chào quý khách đến với gian hàng ${booth.boothName} của ${booth.companyName} tại ${booth.zoneName}. Tôi là ${profile.assistantName}, rất hân hạnh được giới thiệu các sản phẩm trưng bày tới quý khách.`,
    },
  ];

  validSlots.forEach((s, idx) => {
    const p = s.product!;
    const priceStr =
      p.price > 0
        ? `Giá niêm yết ${formatCurrency(p.price, p.currency)}.`
        : 'Quý khách vui lòng liên hệ gian hàng để nhận báo giá chi tiết.';
    list.push({
      stepIndex: list.length,
      type: 'PRODUCT',
      slotKey: s.slotId,
      slotLabel: `Kệ trưng bày #${idx + 1}`,
      product: p,
      productIndex: idx + 1,
      totalProducts,
      fallbackText: `Sản phẩm ${p.name}. ${priceStr} ${p.description || ''}`.trim(),
    });
  });

  list.push({
    stepIndex: list.length,
    type: 'CLOSING',
    slotKey: 'closing',
    slotLabel: null,
    product: null,
    productIndex: null,
    totalProducts,
    fallbackText: `Cảm ơn quý khách đã tham quan gian hàng ${booth.boothName} của ${booth.companyName}. Nếu quý khách cần tư vấn thêm, vui lòng chuyển sang tab Chat để trò chuyện trực tiếp với tôi.`,
  });

  return list;
}

/**
 * Extracts ordered, deduplicated normalized Piper chunks for a booth's full consultation
 * (used for Smart Preloading when visitor focuses/approaches a booth in Hybrid mode).
 */
export function extractBoothConsultationChunks(booth: V28BoothPlacementView): string[] {
  const steps = buildBoothConsultationSteps(booth);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const step of steps) {
    const { chunks } = buildPiperStepPlanFromDisplayText(step.fallbackText);
    for (const c of chunks) {
      if (c && !seen.has(c)) {
        seen.add(c);
        ordered.push(c);
      }
    }
  }
  return ordered;
}
