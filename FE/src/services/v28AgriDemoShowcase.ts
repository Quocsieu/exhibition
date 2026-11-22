import type { V28BoothPlacementView, V28ExhibitionVersionDetail, V28Product } from './v28Api';

export type AgriProductShape3D = 'jar' | 'bottle' | 'pouch' | 'box' | 'basket' | 'can';

export interface AgriDemoBoothSpec {
  groupIndex: number;
  groupName: string;
  companyName: string;
  boothName: string;
  category: string;
  accentColor: string;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    price: number;
    description: string;
    shape3D: AgriProductShape3D;
    labelColor: string;
    emoji: string;
  }>;
}

/**
 * 10 isolated Agricultural Demo Showcase booths (Phase 3.1).
 * Strictly demo data — never overwrites Production DB or CELLPHONES booths.
 */
export const AGRI_DEMO_BOOTH_SPECS: readonly AgriDemoBoothSpec[] = [
  {
    groupIndex: 1,
    groupName: 'Sản phẩm từ dừa',
    companyName: 'HTX Dừa Xanh Bến Tre (Demo)',
    boothName: 'Gian Nông Sản — Dừa Bến Tre',
    category: 'Nông sản',
    accentColor: '#15803d',
    products: [
      { id: 'agri-p01', sku: 'AGRI-DUA-01', name: 'Dầu dừa ép lạnh nguyên chất 250ml', price: 145000, description: 'Sản phẩm demo: dầu dừa ép lạnh đóng chai thủy tinh.', shape3D: 'bottle', labelColor: '#15803d', emoji: '🥥' },
      { id: 'agri-p02', sku: 'AGRI-DUA-02', name: 'Mứt dừa non sấy giòn hộp 300g', price: 95000, description: 'Sản phẩm demo: mứt dừa non đóng hộp tiện lợi.', shape3D: 'box', labelColor: '#166534', emoji: '🥥' },
    ],
  },
  {
    groupIndex: 2,
    groupName: 'Mật ong',
    companyName: 'Nông Trại Mật Ong Tây Nguyên (Demo)',
    boothName: 'Gian Nông Sản — Mật Ong Nguyên Chất',
    category: 'Nông sản',
    accentColor: '#d97706',
    products: [
      { id: 'agri-p03', sku: 'AGRI-ONG-01', name: 'Mật ong hoa cà phê nguyên chất 500ml', price: 220000, description: 'Sản phẩm demo: mật ong hoa cà phê đóng hũ thủy tinh.', shape3D: 'jar', labelColor: '#d97706', emoji: '🍯' },
      { id: 'agri-p04', sku: 'AGRI-ONG-02', name: 'Mật ong rừng hoa nhãn 350ml', price: 185000, description: 'Sản phẩm demo: mật ong hoa nhãn đóng chai.', shape3D: 'bottle', labelColor: '#b45309', emoji: '🍯' },
    ],
  },
  {
    groupIndex: 3,
    groupName: 'Trái cây sấy',
    companyName: 'Đà Lạt Farm Sấy Dẻo (Demo)',
    boothName: 'Gian Nông Sản — Trái Cây Sấy',
    category: 'Nông sản',
    accentColor: '#ea580c',
    products: [
      { id: 'agri-p05', sku: 'AGRI-SAY-01', name: 'Xoài sấy dẻo tự nhiên túi 250g', price: 89000, description: 'Sản phẩm demo: xoài sấy dẻo đóng túi zip giữ hương vị.', shape3D: 'pouch', labelColor: '#ea580c', emoji: '🥭' },
      { id: 'agri-p06', sku: 'AGRI-SAY-02', name: 'Mít sấy giòn chân không hộp 300g', price: 105000, description: 'Sản phẩm demo: mít sấy giòn không đường.', shape3D: 'box', labelColor: '#c2410c', emoji: '🍍' },
    ],
  },
  {
    groupIndex: 4,
    groupName: 'Trái cây tươi',
    companyName: 'Vườn Trái Cây Miền Tây (Demo)',
    boothName: 'Gian Nông Sản — Trái Cây Tươi',
    category: 'Nông sản',
    accentColor: '#16a34a',
    products: [
      { id: 'agri-p07', sku: 'AGRI-TUOI-01', name: 'Bưởi da xanh giỏ quà 2kg', price: 135000, description: 'Sản phẩm demo: bưởi da xanh tuyển chọn.', shape3D: 'basket', labelColor: '#16a34a', emoji: '🍈' },
      { id: 'agri-p08', sku: 'AGRI-TUOI-02', name: 'Thanh long ruột đỏ hộp 1.5kg', price: 78000, description: 'Sản phẩm demo: thanh long ruột đỏ thu hoạch mới.', shape3D: 'box', labelColor: '#dc2626', emoji: '🐉' },
    ],
  },
  {
    groupIndex: 5,
    groupName: 'Cà phê',
    companyName: 'Cà Phê Rang Mộc Buôn Ma Thuột (Demo)',
    boothName: 'Gian Nông Sản — Cà Phê Rang Xay',
    category: 'Nông sản',
    accentColor: '#78350f',
    products: [
      { id: 'agri-p09', sku: 'AGRI-CAPHE-01', name: 'Cà phê Robusta rang mộc túi 500g', price: 165000, description: 'Sản phẩm demo: cà phê Robusta nguyên hạt rang mộc.', shape3D: 'pouch', labelColor: '#78350f', emoji: '☕' },
      { id: 'agri-p10', sku: 'AGRI-CAPHE-02', name: 'Cà phê Arabica Cầu Đất lon 250g', price: 195000, description: 'Sản phẩm demo: cà phê Arabica đóng lon thiếc kín khí.', shape3D: 'can', labelColor: '#451a03', emoji: '☕' },
    ],
  },
  {
    groupIndex: 6,
    groupName: 'Trà và thảo mộc',
    companyName: 'Trà Shan Tuyết & Thảo Mộc (Demo)',
    boothName: 'Gian Nông Sản — Trà & Thảo Mộc',
    category: 'Nông sản',
    accentColor: '#0f766e',
    products: [
      { id: 'agri-p11', sku: 'AGRI-TRA-01', name: 'Trà xanh Thái Nguyên hộp 200g', price: 140000, description: 'Sản phẩm demo: trà búp xanh đóng hộp quà.', shape3D: 'box', labelColor: '#0f766e', emoji: '🍵' },
      { id: 'agri-p12', sku: 'AGRI-TRA-02', name: 'Trà hoa cúc thảo mộc hũ 100g', price: 115000, description: 'Sản phẩm demo: trà hoa cúc sấy lạnh đóng hũ.', shape3D: 'jar', labelColor: '#0d9488', emoji: '🌼' },
    ],
  },
  {
    groupIndex: 7,
    groupName: 'Gạo và ngũ cốc',
    companyName: 'Lúa Gạo Đồng Bằng Sông Cửu Long (Demo)',
    boothName: 'Gian Nông Sản — Gạo & Ngũ Cốc',
    category: 'Nông sản',
    accentColor: '#ca8a04',
    products: [
      { id: 'agri-p13', sku: 'AGRI-GAO-01', name: 'Gạo thơm đặc sản túi 2kg', price: 98000, description: 'Sản phẩm demo: gạo thơm hạt dài đóng túi hút chân không.', shape3D: 'pouch', labelColor: '#ca8a04', emoji: '🌾' },
      { id: 'agri-p14', sku: 'AGRI-GAO-02', name: 'Ngũ cốc gạo lứt rang hộp 400g', price: 112000, description: 'Sản phẩm demo: ngũ cốc gạo lứt nguyên cám.', shape3D: 'box', labelColor: '#a16207', emoji: '🌾' },
    ],
  },
  {
    groupIndex: 8,
    groupName: 'Hạt dinh dưỡng',
    companyName: 'Hạt Dinh Dưỡng Bình Phước (Demo)',
    boothName: 'Gian Nông Sản — Hạt Dinh Dưỡng',
    category: 'Nông sản',
    accentColor: '#92400e',
    products: [
      { id: 'agri-p15', sku: 'AGRI-HAT-01', name: 'Hạt điều rang củi vỏ lụa lon 500g', price: 210000, description: 'Sản phẩm demo: hạt điều rang củi giòn béo đóng lon.', shape3D: 'can', labelColor: '#92400e', emoji: '🥜' },
      { id: 'agri-p16', sku: 'AGRI-HAT-02', name: 'Hạt mắc ca nứt vỏ hũ 350g', price: 175000, description: 'Sản phẩm demo: hạt mắc ca sấy nứt vỏ đóng hũ.', shape3D: 'jar', labelColor: '#78350f', emoji: '🌰' },
    ],
  },
  {
    groupIndex: 9,
    groupName: 'Gia vị nông sản',
    companyName: 'Gia Vị Đặc Sản Phú Quốc & Tây Bắc (Demo)',
    boothName: 'Gian Nông Sản — Gia Vị Nông Sản',
    category: 'Nông sản',
    accentColor: '#b91c1c',
    products: [
      { id: 'agri-p17', sku: 'AGRI-GV-01', name: 'Tiêu đen hạt chín cây hũ 150g', price: 85000, description: 'Sản phẩm demo: tiêu đen nguyên hạt đóng hũ thủy tinh.', shape3D: 'jar', labelColor: '#b91c1c', emoji: '🌶️' },
      { id: 'agri-p18', sku: 'AGRI-GV-02', name: 'Muối ớt chanh đặc sản chai 200ml', price: 48000, description: 'Sản phẩm demo: sốt chấm muối ớt chanh đóng chai.', shape3D: 'bottle', labelColor: '#15803d', emoji: '🍋' },
    ],
  },
  {
    groupIndex: 10,
    groupName: 'Nước uống từ nông sản',
    companyName: 'Đồ Uống Nông Sản Tự Nhiên (Demo)',
    boothName: 'Gian Nông Sản — Nước Uống Tự Nhiên',
    category: 'Nông sản',
    accentColor: '#0284c7',
    products: [
      { id: 'agri-p19', sku: 'AGRI-NUOC-01', name: 'Nước ép chanh dây mật ong chai 330ml', price: 35000, description: 'Sản phẩm demo: nước ép trái cây tự nhiên đóng chai.', shape3D: 'bottle', labelColor: '#0284c7', emoji: '🧃' },
      { id: 'agri-p20', sku: 'AGRI-NUOC-02', name: 'Nước cốt dâu tằm Đà Lạt chai 500ml', price: 118000, description: 'Sản phẩm demo: siro dâu tằm nguyên chất đóng chai.', shape3D: 'bottle', labelColor: '#7e22ce', emoji: '🍇' },
    ],
  },
];

/**
 * Infers a 3D product geometry shape from product name/description/sku so both demo agricultural
 * products and real Admin products get fitting 3D props alongside their 2D product card.
 */
export function inferProductShape3D(product: Pick<V28Product, 'name' | 'description' | 'sku'>): AgriProductShape3D | null {
  const txt = `${product.name} ${product.description || ''} ${product.sku || ''}`.toLowerCase();
  // Check explicit container keywords first so "nước ép ... mật ong chai" or "mật ong ... đóng chai" renders as bottle
  if (/chai|dầu dừa|nước ép|nước cốt|muối ớt|sốt/.test(txt)) return 'bottle';
  if (/mật ong|hũ|tiêu|mắc ca|thảo mộc/.test(txt)) return 'jar';
  if (/túi|gạo|xoài sấy|robusta|rang mộc/.test(txt)) return 'pouch';
  if (/lon|hạt điều|arabica/.test(txt)) return 'can';
  if (/giỏ|bưởi|trái cây tươi/.test(txt)) return 'basket';
  if (/hộp|mứt|mít sấy|thanh long|trà xanh|ngũ cốc/.test(txt)) return 'box';
  return null;
}

function buildPackagingSvgDataUrl(title: string, price: number, color: string, emoji: string): string {
  const safeTitle = title.replace(/[<>&"']/g, '');
  const priceStr = `${price.toLocaleString('vi-VN')} đ`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="320" height="320" rx="24" fill="url(#g)"/>
    <circle cx="160" cy="118" r="56" fill="rgba(255,255,255,0.16)"/>
    <text x="160" y="138" font-size="56" text-anchor="middle">${emoji}</text>
    <text x="160" y="218" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="700" text-anchor="middle">${safeTitle.slice(0, 26)}</text>
    <text x="160" y="252" fill="#fde68a" font-family="sans-serif" font-size="20" font-weight="800" text-anchor="middle">${priceStr}</text>
    <text x="160" y="290" fill="rgba(255,255,255,0.72)" font-family="sans-serif" font-size="12" text-anchor="middle">NÔNG SẢN DEMO · GRAND EXPO V28</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Non-destructively overlays the 10 Agricultural Demo Booths onto 10 empty booths covering all 6 archetypes
 * in a cloned world view (NEVER mutates Production DB or CELLPHONES booths!).
 */
export function applyAgriDemoShowcaseOverlay(
  world: V28ExhibitionVersionDetail
): { world: V28ExhibitionVersionDetail; appliedBoothIds: string[] } {
  const emptyBooths = world.booths.filter((b) => b.assignedSlotCount === 0);
  if (emptyBooths.length < 10) {
    return { world, appliedBoothIds: [] };
  }

  // Pick 10 empty booths guaranteeing all 6 archetypes are covered first
  const selected: V28BoothPlacementView[] = [];
  const usedIds = new Set<string>();
  const seenArchetypes = new Set<string>();

  for (const b of emptyBooths) {
    if (!seenArchetypes.has(b.archetypeId)) {
      seenArchetypes.add(b.archetypeId);
      selected.push(b);
      usedIds.add(b.boothId);
      if (selected.length === 10) break;
    }
  }
  for (const b of emptyBooths) {
    if (selected.length >= 10) break;
    if (!usedIds.has(b.boothId)) {
      selected.push(b);
      usedIds.add(b.boothId);
    }
  }

  const overlayMap = new Map<string, AgriDemoBoothSpec>();
  selected.forEach((b, idx) => {
    if (AGRI_DEMO_BOOTH_SPECS[idx]) {
      overlayMap.set(b.boothId, AGRI_DEMO_BOOTH_SPECS[idx]);
    }
  });

  const nextBooths: V28BoothPlacementView[] = world.booths.map((b) => {
    const spec = overlayMap.get(b.boothId);
    if (!spec) return b;
    const nextSlots = b.slots.map((slot, sIdx) => {
      const pSpec = spec.products[sIdx];
      if (!pSpec) return slot;
      const prod: V28Product = {
        id: pSpec.id,
        companyId: `demo-co-${spec.groupIndex}`,
        boothId: b.boothId,
        name: pSpec.name,
        sku: pSpec.sku,
        price: pSpec.price,
        currency: 'VND',
        description: pSpec.description,
        images: [buildPackagingSvgDataUrl(pSpec.name, pSpec.price, pSpec.labelColor, pSpec.emoji)],
        videoUrl: '',
        modelUrl: '',
        sourceUrl: '',
        contactUrl: '',
        inStock: true,
        status: 'active',
        createdAt: '2026-11-22T00:00:00Z',
        updatedAt: '2026-11-22T00:00:00Z',
      };
      return { ...slot, product: prod };
    });
    return {
      ...b,
      boothName: spec.boothName,
      companyName: spec.companyName,
      category: spec.category,
      zoneCategoryTag: `${spec.category} — ${spec.groupName}`,
      zoneName: `Khu ${b.zoneCode} — ${spec.category}`,
      color: spec.accentColor,
      slots: nextSlots,
      assignedSlotCount: nextSlots.filter((s) => Boolean(s.product)).length,
    };
  });

  return {
    world: { ...world, booths: nextBooths },
    appliedBoothIds: selected.map((b) => b.boothId),
  };
}
