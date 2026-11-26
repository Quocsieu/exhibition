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
  naturalSpeechText?: string;
}

function cleanBoothHostTitle(booth: V28BoothPlacementView): string {
  const company = String(booth.companyName || '').replace(/\s+/g, ' ').trim();
  const rawBooth = String(booth.boothName || '')
    .replace(/\s*#\d+\b/g, '')
    .split(/\s*[·|]\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (company && (!rawBooth || company.toLowerCase() === rawBooth.toLowerCase() || booth.boothName.includes('·'))) {
    return company;
  }
  return rawBooth || company || 'triển lãm';
}

function cleanProductSpokenTitle(rawName: string): string {
  let name = String(rawName || '')
    // Strip scraped HTML <title> suffixes after `|` (e.g. "| Triển lãm số Con đường nông sản")
    .split(/\s*\|\s*/)[0]
    .replace(/\s+[–—-]\s+(?:Triển lãm|Website|Trang chủ|Cửa hàng|Chính hãng).*$/i, '')
    .replace(/^Đặc sản tuyển chọn\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name || String(rawName || '').trim();
}

function cleanProductSpokenHighlight(rawDesc: string | undefined, cleanName: string): string {
  if (!rawDesc) return '';
  let desc = String(rawDesc)
    .split(/\s*\|\s*/)[0]
    .replace(/<[^>]*>/g, ' ')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc || desc.toLowerCase() === cleanName.toLowerCase()) return '';
  // Take only the first concise sentence so NPC never drones through a wall of scraped specs
  const firstSentence = desc.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/g, '').trim();
  if (firstSentence.length <= 96) return firstSentence;
  const cut = firstSentence.slice(0, 94);
  const commaIdx = cut.lastIndexOf(', ');
  if (commaIdx >= 42) return cut.slice(0, commaIdx).trim();
  const spaceIdx = cut.lastIndexOf(' ');
  return (spaceIdx >= 50 ? cut.slice(0, spaceIdx) : cut).replace(/[,;:\s]+$/, '').trim();
}

/**
 * Builds a grounded, single-product Vietnamese consultation script strictly from real database fields
 * (name, listed price or contact status, stock, description, company/booth). NEVER fabricates claims.
 */
export function buildGroundedProductScript(
  booth: Pick<V28BoothPlacementView, 'boothName' | 'companyName'>,
  product: Pick<V28Product, 'name' | 'price' | 'priceStatus' | 'currency' | 'inStock' | 'description'>
): string {
  const cleanName = cleanProductSpokenTitle(product.name);
  const isContact = product.priceStatus === 'contact' || !(Number(product.price) > 0);
  const priceClause = isContact
    ? 'có giá liên hệ trực tiếp tại gian hàng'
    : `có giá niêm yết ${formatCurrency(Number(product.price), product.currency || 'VND')}`;
  const stockClause = product.inStock
    ? 'Hiện đang còn hàng.'
    : 'Hiện tạm hết hàng, quý khách có thể liên hệ đặt trước.';
  const shortDesc = cleanProductSpokenHighlight(product.description, cleanName);
  const descClause = shortDesc ? ` ${shortDesc.endsWith('.') ? shortDesc : `${shortDesc}.`}` : '';
  const hostName = String(booth.companyName || booth.boothName || '').trim();
  return `Sản phẩm ${cleanName}${hostName ? ` tại gian hàng ${hostName}` : ''} ${priceClause}. ${stockClause}${descClause}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Single source of truth for V28 NPC consultation step scripts (Greeting -> Product 1..N -> Closing).
 * - `fallbackText`: Preserved 100% unchanged for Hybrid pregen `manifest.json` SHA-256 parity.
 * - `naturalSpeechText`: Warm, concise, conversational Vietnamese consultant script for Supertonic 3.
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
  const hostTitle = cleanBoothHostTitle(booth);

  const naturalGreeting =
    totalProducts > 0
      ? `Dạ xin chào quý khách! Em là ${profile.assistantName} tại gian hàng ${hostTitle}, mời quý khách cùng điểm qua các sản phẩm nổi bật hôm nay nhé!`
      : `Dạ xin chào quý khách đã ghé thăm gian hàng ${hostTitle}! Hiện kệ trưng bày đang được cập nhật mẫu mới ạ.`;

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
      naturalSpeechText: naturalGreeting,
    },
  ];

  validSlots.forEach((s, idx) => {
    const p = s.product!;
    const priceStr =
      p.price > 0
        ? `Giá niêm yết ${formatCurrency(p.price, p.currency)}.`
        : 'Quý khách vui lòng liên hệ gian hàng để nhận báo giá chi tiết.';

    const cleanName = cleanProductSpokenTitle(p.name);
    const shortDesc = cleanProductSpokenHighlight(p.description, cleanName);
    const descClause = shortDesc ? `, ${shortDesc.charAt(0).toLowerCase()}${shortDesc.slice(1)}` : '';
    const naturalPriceClause =
      p.price > 0
        ? idx % 2 === 0
          ? `, mức giá ${formatCurrency(p.price, p.currency)}`
          : `, giá ${formatCurrency(p.price, p.currency)}`
        : ', giá liên hệ trực tiếp tại quầy';

    let leadPhrase = 'Tiếp theo là';
    if (idx === 0) {
      leadPhrase = 'Mở đầu là';
    } else if (idx === totalProducts - 1 && totalProducts > 1) {
      leadPhrase = 'Và cuối cùng là';
    } else if (idx === 1) {
      leadPhrase = 'Tiếp theo là';
    } else if (idx === 2) {
      leadPhrase = 'Kế đến em xin giới thiệu';
    } else if (idx === 3) {
      leadPhrase = 'Bên cạnh đó là';
    } else {
      leadPhrase = 'Quý khách cũng có thể tham khảo';
    }

    list.push({
      stepIndex: list.length,
      type: 'PRODUCT',
      slotKey: s.slotId,
      slotLabel: `Kệ trưng bày #${idx + 1}`,
      product: p,
      productIndex: idx + 1,
      totalProducts,
      fallbackText: `Sản phẩm ${p.name}. ${priceStr} ${p.description || ''}`.trim(),
      naturalSpeechText: `${leadPhrase} ${cleanName}${descClause}${naturalPriceClause}.`,
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
    naturalSpeechText: `Dạ cảm ơn quý khách đã ghé thăm gian hàng! Quý khách có thể nhấn vào từng kệ để xem chi tiết sản phẩm nhé!`,
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

/**
 * Builds a single-product consultation script strictly grounded in real product data
 * (matched by exact `product.id` inside `booth.slots` when present).
 * Never fabricates specs, warranty, or promotions.
 */
export function buildProductConsultationSteps(
  booth: V28BoothPlacementView,
  product: V28Product,
  slotId: string
): BoothConsultationStep[] {
  const matchedSlot =
    booth.slots.find((s) => s.product && s.product.id === product.id) ||
    booth.slots.find((s) => s.slotId === slotId && s.product) ||
    null;
  const resolvedProduct = matchedSlot?.product ?? product;
  const resolvedSlotId = matchedSlot?.slotId ?? slotId;
  const validSlots = booth.slots.filter((s) => Boolean(s.product));
  const productIdx = validSlots.findIndex((s) => s.product?.id === resolvedProduct.id);

  const cleanName = cleanProductSpokenTitle(resolvedProduct.name);
  const hostTitle = cleanBoothHostTitle(booth);
  const priceStr =
    resolvedProduct.price > 0
      ? `Giá niêm yết ${formatCurrency(resolvedProduct.price, resolvedProduct.currency)}.`
      : 'Giá liên hệ trực tiếp tại gian hàng.';
  const stockStr = resolvedProduct.inStock
    ? 'Sản phẩm hiện đang còn hàng.'
    : 'Sản phẩm hiện tạm hết hàng, quý khách có thể liên hệ đặt trước.';
  const shortDesc = cleanProductSpokenHighlight(resolvedProduct.description, cleanName);
  const descSentence = shortDesc ? ` ${shortDesc}.` : '';

  const naturalPriceClause =
    resolvedProduct.price > 0
      ? `có giá niêm yết ${formatCurrency(resolvedProduct.price, resolvedProduct.currency)}`
      : 'có giá liên hệ trực tiếp tại gian hàng';

  const fallbackText =
    `Sản phẩm ${resolvedProduct.name} tại gian hàng ${hostTitle}. ${priceStr} ${stockStr}${descSentence}`
      .replace(/\s+/g, ' ')
      .trim();

  const naturalSpeechText =
    `Dạ đây là sản phẩm ${cleanName} tại gian hàng ${hostTitle}, ${naturalPriceClause}. ${stockStr}${descSentence}`
      .replace(/\s+/g, ' ')
      .trim();

  return [
    {
      stepIndex: 0,
      type: 'PRODUCT',
      slotKey: resolvedSlotId,
      slotLabel: productIdx >= 0 ? `Kệ trưng bày #${productIdx + 1}` : resolvedSlotId.toUpperCase(),
      product: resolvedProduct,
      productIndex: productIdx >= 0 ? productIdx + 1 : 1,
      totalProducts: Math.max(1, validSlots.length),
      fallbackText,
      naturalSpeechText,
    },
  ];
}
