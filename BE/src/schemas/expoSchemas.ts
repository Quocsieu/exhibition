import { z } from 'zod';

export const WORLD_BOUNDS = {
  minX: -24,
  maxX: 24,
  minZ: -24,
  maxZ: 24,
} as const;

export const PLAYER_RADIUS = 0.55;
export const PLAYER_SPEED = 7.0;
export const MAX_SERVER_SPEED = 11.5;
export const MOVE_EVENT_MIN_INTERVAL_MS = 30;

export const CENTRAL_SPAWN_POINT = {
  x: 0,
  z: 3.8,
  rotationY: Math.PI,
} as const;

export const CENTRAL_SPAWN_SLOTS: ReadonlyArray<{ x: number; z: number; rotationY: number }> = [
  { x: 0, z: 3.8, rotationY: Math.PI },
  { x: -1.2, z: 3.8, rotationY: Math.PI },
  { x: 1.2, z: 3.8, rotationY: Math.PI },
  { x: -2.2, z: 3.6, rotationY: Math.PI },
  { x: 2.2, z: 3.6, rotationY: Math.PI },
  { x: 0, z: -3.8, rotationY: 0 },
];

export interface ObstacleBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  label?: string;
}

export const STATIC_OBSTACLES: ObstacleBox[] = [
  { id: 'central-plaza-monument', minX: -2.4, maxX: 2.4, minZ: -2.4, maxZ: 2.4, label: 'Đài phun nước trung tâm' },
  { id: 'gate-pillar-left', minX: -5.2, maxX: -3.6, minZ: 20.2, maxZ: 21.8, label: 'Cột cổng trái' },
  { id: 'gate-pillar-right', minX: 3.6, maxX: 5.2, minZ: 20.2, maxZ: 21.8, label: 'Cột cổng phải' },
  { id: 'planter-nw', minX: -6.8, maxX: -5.2, minZ: -5.8, maxZ: -4.2, label: 'Bồn cây Tây Bắc' },
  { id: 'planter-ne', minX: 5.2, maxX: 6.8, minZ: -5.8, maxZ: -4.2, label: 'Bồn cây Đông Bắc' },
  { id: 'planter-sw', minX: -6.8, maxX: -5.2, minZ: 4.2, maxZ: 5.8, label: 'Bồn cây Tây Nam' },
  { id: 'planter-se', minX: 5.2, maxX: 6.8, minZ: 4.2, maxZ: 5.8, label: 'Bồn cây Đông Nam' },
];

export const BoothSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(2).max(120),
  companyName: z.string().max(150).optional().default(''),
  tagline: z.string().max(200).default(''),
  description: z.string().max(2000).default(''),
  category: z.string().max(100).default('General'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Màu sắc phải ở định dạng hex (#RRGGBB)').default('#0ea5e9'),
  logoUrl: z.string().url().optional().or(z.literal('')).default(''),
  bannerUrl: z.string().url().optional().or(z.literal('')).default(''),
  contactEmail: z.string().email().optional().or(z.literal('')).default(''),
  contactUrl: z.string().url().optional().or(z.literal('')).default(''),
  positionX: z.number().min(WORLD_BOUNDS.minX + 3).max(WORLD_BOUNDS.maxX - 3),
  positionZ: z.number().min(WORLD_BOUNDS.minZ + 3).max(WORLD_BOUNDS.maxZ - 3),
  rotationY: z.number().default(0),
  width: z.number().min(2).max(10).default(4.8),
  depth: z.number().min(2).max(10).default(3.8),
});

export type Booth = z.infer<typeof BoothSchema>;

export const CreateBoothInputSchema = BoothSchema.omit({ id: true }).extend({
  id: z.string().min(1).max(64).optional(),
});
export type CreateBoothInput = z.infer<typeof CreateBoothInputSchema>;

export const UpdateBoothInputSchema = BoothSchema.partial().omit({ id: true });
export type UpdateBoothInput = z.infer<typeof UpdateBoothInputSchema>;

export const ProductSchema = z.object({
  id: z.string().min(1).max(64),
  boothId: z.string().min(1).max(64),
  name: z.string().min(2).max(200),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(10).default('VND'),
  description: z.string().max(5000).default(''),
  images: z.array(z.string()).default([]),
  modelUrl: z.string().optional().default(''),
  videoUrl: z.string().url().optional().or(z.literal('')).default(''),
  sourceUrl: z.string().url(),
  contactUrl: z.string().url().optional().or(z.literal('')).default(''),
  sku: z.string().max(100).optional().or(z.literal('')).default(''),
  inStock: z.boolean().default(true),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductInputSchema = ProductSchema.omit({ id: true }).extend({
  id: z.string().min(1).max(64).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

export const UpdateProductInputSchema = ProductSchema.partial().omit({ id: true });
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;

// ============================================================================
// BOOTH SLOT DEFINITIONS & PRODUCT-SLOT ASSIGNMENT CONTRACTS
// ============================================================================

export type BoothSlotZone = 'counter' | 'left-shelf' | 'right-shelf';

export interface BoothSlotDefinition {
  slotId: string;
  label: string;
  zone: BoothSlotZone;
  position: [number, number, number];
  rotation: [number, number, number];
  rotationY: number;
  maxSize: [number, number, number];
}

export const BOOTH_SLOT_DEFINITIONS: BoothSlotDefinition[] = [
  {
    slotId: 'slot_01',
    label: 'Quầy Trưng Bày Chính — Vị trí Trái',
    zone: 'counter',
    position: [-0.68, 1.04, 1.25],
    rotation: [0, 0.1, 0],
    rotationY: 0.1,
    maxSize: [0.72, 0.68, 0.52],
  },
  {
    slotId: 'slot_02',
    label: 'Quầy Trưng Bày Chính — Vị trí Phải',
    zone: 'counter',
    position: [0.68, 1.04, 1.25],
    rotation: [0, -0.1, 0],
    rotationY: -0.1,
    maxSize: [0.72, 0.68, 0.52],
  },
  {
    slotId: 'slot_03',
    label: 'Kệ Trưng Bày Trái — Tầng Trên',
    zone: 'left-shelf',
    position: [-2.12, 1.54, -0.32],
    rotation: [0, 0.36, 0],
    rotationY: 0.36,
    maxSize: [0.68, 0.58, 0.44],
  },
  {
    slotId: 'slot_04',
    label: 'Kệ Trưng Bày Trái — Tầng Dưới',
    zone: 'left-shelf',
    position: [-2.12, 0.88, 0.34],
    rotation: [0, 0.36, 0],
    rotationY: 0.36,
    maxSize: [0.68, 0.58, 0.44],
  },
  {
    slotId: 'slot_05',
    label: 'Kệ Trưng Bày Phải — Tầng Trên',
    zone: 'right-shelf',
    position: [2.12, 1.54, -0.32],
    rotation: [0, -0.36, 0],
    rotationY: -0.36,
    maxSize: [0.68, 0.58, 0.44],
  },
  {
    slotId: 'slot_06',
    label: 'Kệ Trưng Bày Phải — Tầng Dưới',
    zone: 'right-shelf',
    position: [2.12, 0.88, 0.34],
    rotation: [0, -0.36, 0],
    rotationY: -0.36,
    maxSize: [0.68, 0.58, 0.44],
  },
];

export const VALID_BOOTH_SLOT_IDS = new Set<string>(
  BOOTH_SLOT_DEFINITIONS.map((s) => s.slotId)
);

export const BoothSlotAssignmentSchema = z.object({
  boothId: z.string().min(1).max(64),
  slotId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  updatedAt: z.string().optional(),
});

export type BoothSlotAssignment = z.infer<typeof BoothSlotAssignmentSchema>;

export interface BoothSlotView {
  boothId: string;
  slot: BoothSlotDefinition;
  productId: string | null;
  product: Product | null;
  updatedAt: string | null;
}

export const AssignSlotBodySchema = z.object({
  productId: z.string().min(1).max(64).nullable(),
});

export type AssignSlotBody = z.infer<typeof AssignSlotBodySchema>;

export const ExtractedProductDraftSchema = z.object({
  name: z.string().default(''),
  price: z.number().nonnegative().default(0),
  currency: z.string().default('VND'),
  description: z.string().default(''),
  images: z.array(z.string()).default([]),
  videoUrl: z.string().default(''),
  sourceUrl: z.string(),
  sku: z.string().default(''),
  inStock: z.boolean().default(true),
  extractionMethod: z.enum(['json-ld', 'opengraph', 'meta-fallback', 'partial']),
  warnings: z.array(z.string()).default([]),
});

export type ExtractedProductDraft = z.infer<typeof ExtractedProductDraftSchema>;

export const VisitorMovePayloadSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  rotationY: z.number().finite(),
  state: z.enum(['idle', 'walk']),
  activeBoothId: z.string().nullable().optional(),
});

export type VisitorMovePayload = z.infer<typeof VisitorMovePayloadSchema>;

export const VisitorProfilePayloadSchema = z.object({
  name: z.string().trim().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export type VisitorProfilePayload = z.infer<typeof VisitorProfilePayloadSchema>;

export interface VisitorState {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotationY: number;
  state: 'idle' | 'walk';
  activeBoothId?: string | null;
  updatedAt: number;
}

export interface ExpoDataUpdatedPayload {
  entityType: 'booth' | 'product' | 'slot' | 'all';
  entityId?: string;
  boothId?: string;
  timestamp: number;
}

export interface ServerToClientEvents {
  'world:init': (payload: {
    self: VisitorState;
    visitors: VisitorState[];
    onlineCount: number;
  }) => void;
  'visitor:joined': (visitor: VisitorState) => void;
  'visitor:moved': (visitor: VisitorState) => void;
  'visitor:updated': (visitor: VisitorState) => void;
  'visitor:left': (payload: { sessionId: string; onlineCount: number }) => void;
  'visitors:count': (payload: { onlineCount: number }) => void;
  'move:rejected': (payload: { x: number; z: number; reason: string }) => void;
  'expo:data-updated': (payload: ExpoDataUpdatedPayload) => void;
}

export interface ClientToServerEvents {
  'visitor:move': (payload: VisitorMovePayload) => void;
  'visitor:profile': (payload: VisitorProfilePayload) => void;
}

export interface BoothFootprint {
  id: string;
  positionX: number;
  positionZ: number;
  rotationY?: number;
  width: number;
  depth: number;
  name?: string;
}

export function getBoothObstacleBox(booth: BoothFootprint): ObstacleBox {
  const w = booth.width || 4.8;
  const d = booth.depth || 3.8;
  const ry = booth.rotationY || 0;
  const cos = Math.abs(Math.cos(ry));
  const sin = Math.abs(Math.sin(ry));
  const halfW = (w * cos + d * sin) / 2;
  const halfD = (w * sin + d * cos) / 2;
  return {
    id: `booth-${booth.id}`,
    minX: booth.positionX - halfW,
    maxX: booth.positionX + halfW,
    minZ: booth.positionZ - halfD,
    maxZ: booth.positionZ + halfD,
    label: booth.name || booth.id,
  };
}

export function getBoothApproachPoint(
  booth: BoothFootprint,
  clearance = 0.85
): { x: number; z: number } {
  const box = getBoothObstacleBox(booth);
  const halfW = (box.maxX - box.minX) / 2;
  const halfD = (box.maxZ - box.minZ) / 2;
  const ry = booth.rotationY ?? Math.atan2(-booth.positionX, -booth.positionZ);
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  const tx = (halfW + PLAYER_RADIUS) / Math.max(Math.abs(fx), 0.0001);
  const tz = (halfD + PLAYER_RADIUS) / Math.max(Math.abs(fz), 0.0001);
  const dist = Math.min(tx, tz) + clearance;
  return {
    x: Number((booth.positionX + fx * dist).toFixed(2)),
    z: Number((booth.positionZ + fz * dist).toFixed(2)),
  };
}

const obstacleWeakCache = new WeakMap<BoothFootprint[], ObstacleBox[]>();

export function getAllObstacles(booths: BoothFootprint[]): ObstacleBox[] {
  const cached = obstacleWeakCache.get(booths);
  if (cached) {
    return cached;
  }
  const built = [...STATIC_OBSTACLES, ...booths.map(getBoothObstacleBox)];
  obstacleWeakCache.set(booths, built);
  return built;
}

export function isWithinWorldBounds(x: number, z: number, margin = PLAYER_RADIUS): boolean {
  return (
    x >= WORLD_BOUNDS.minX + margin &&
    x <= WORLD_BOUNDS.maxX - margin &&
    z >= WORLD_BOUNDS.minZ + margin &&
    z <= WORLD_BOUNDS.maxZ - margin
  );
}

export function isBoxColliding(
  x: number,
  z: number,
  box: ObstacleBox,
  radius = PLAYER_RADIUS
): boolean {
  return (
    x >= box.minX - radius &&
    x <= box.maxX + radius &&
    z >= box.minZ - radius &&
    z <= box.maxZ + radius
  );
}

export function isPointWalkable(
  x: number,
  z: number,
  booths: BoothFootprint[],
  radius = PLAYER_RADIUS
): boolean {
  if (!isWithinWorldBounds(x, z, radius)) {
    return false;
  }
  const obstacles = getAllObstacles(booths);
  for (const box of obstacles) {
    if (isBoxColliding(x, z, box, radius)) {
      return false;
    }
  }
  return true;
}

export const DEFAULT_BOOTHS: Booth[] = [
  {
    id: 'booth-aether-tech',
    name: 'Aether Tech Lab',
    companyName: 'Aether Technologies Corp.',
    tagline: 'Thiết bị phần cứng thông minh & IoT công nghiệp',
    description:
      'Chuyên cung cấp thiết bị cảm biến môi trường, kính thực tế tăng cường doanh nghiệp và trạm điều khiển thông minh.',
    category: 'Công nghệ & Điện tử',
    color: '#0ea5e9',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'contact@aethertech.example.com',
    contactUrl: 'https://example.com/aether-tech',
    positionX: -12.5,
    positionZ: -9,
    rotationY: Number(Math.atan2(12.5, 9).toFixed(4)),
    width: 4.8,
    depth: 3.8,
  },
  {
    id: 'booth-nordic-living',
    name: 'Nordic Living Studio',
    companyName: 'Nordic Living Interiors AB',
    tagline: 'Nội thất công thái học & Không gian làm việc hiện đại',
    description:
      'Giải pháp nội thất văn phòng và gia đình thiết kế tối giản Bắc Âu, vật liệu gỗ FSC tái tạo và kim loại sơn tĩnh điện.',
    category: 'Nội thất & Kiến trúc',
    color: '#10b981',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'hello@nordicliving.example.com',
    contactUrl: 'https://example.com/nordic-living',
    positionX: 0,
    positionZ: -13,
    rotationY: 0,
    width: 5.2,
    depth: 3.8,
  },
  {
    id: 'booth-ecovita-craft',
    name: 'EcoVita Roastery & Craft',
    companyName: 'EcoVita Highland Roastery JSC',
    tagline: 'Cà phê đặc sản & Nông sản hữu cơ truy xuất nguồn gốc',
    description:
      'Hệ sinh thái nông sản bền vững từ vùng nguyên liệu Tây Nguyên, rang xay chuẩn SCA và đóng gói phân hủy sinh học.',
    category: 'Thực phẩm & Nông sản',
    color: '#f59e0b',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'export@ecovita.example.com',
    contactUrl: 'https://example.com/ecovita',
    positionX: 12.5,
    positionZ: -9,
    rotationY: Number(Math.atan2(-12.5, 9).toFixed(4)),
    width: 4.8,
    depth: 3.8,
  },
  {
    id: 'booth-kinetix-robotics',
    name: 'Kinetix Robotics & AI',
    companyName: 'Kinetix Automation & Robotics Co.',
    tagline: 'Robot tự hành AMR & Tự động hóa kho vận',
    description:
      'Cánh tay robot cộng tác (Cobot) và xe tự hành kho thông minh tích hợp thị giác máy tính thời gian thực.',
    category: 'Tự động hóa & Sản xuất',
    color: '#6366f1',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'sales@kinetix.example.com',
    contactUrl: 'https://example.com/kinetix-robotics',
    positionX: -12.5,
    positionZ: 9,
    rotationY: Number(Math.atan2(12.5, -9).toFixed(4)),
    width: 4.8,
    depth: 3.8,
  },
  {
    id: 'booth-lumina-design',
    name: 'Lumina Design Collective',
    companyName: 'Lumina Architectural Lighting Ltd.',
    tagline: 'Đèn kiến trúc & Vật liệu trang trí bền vững',
    description:
      'Bộ sưu tập đèn chiếu sáng nghệ thuật CRI 97+ và tấm tiêu âm sợi PET tái chế cho văn phòng, showroom và khách sạn.',
    category: 'Thiết kế & Đời sống',
    color: '#ec4899',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'studio@luminadesign.example.com',
    contactUrl: 'https://example.com/lumina-design',
    positionX: 12.5,
    positionZ: 9,
    rotationY: Number(Math.atan2(-12.5, -9).toFixed(4)),
    width: 4.8,
    depth: 3.8,
  },
  {
    id: 'booth-solaris-energy',
    name: 'Solaris Clean Energy',
    companyName: 'Solaris Green Energy Group',
    tagline: 'Lưu trữ năng lượng Lithium-LFP & Trạm sạc thông minh',
    description:
      'Giải pháp pin lưu trữ năng lượng mặt trời áp mái và bộ biến tần hybrid hiệu suất 98.4% cho doanh nghiệp và hộ gia đình.',
    category: 'Năng lượng xanh',
    color: '#14b8a6',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: 'info@solarisenergy.example.com',
    contactUrl: 'https://example.com/solaris-energy',
    positionX: 0,
    positionZ: 13,
    rotationY: Number(Math.PI.toFixed(4)),
    width: 5.2,
    depth: 3.8,
  },
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-aether-hub-x1',
    boothId: 'booth-aether-tech',
    name: 'Trạm Cảm Biến Môi Trường AetherSense X1',
    price: 6850000,
    currency: 'VND',
    description:
      'Trạm giám sát chất lượng không khí công nghiệp 8-trong-1 (PM2.5, CO2, TVOC, Nhiệt độ, Độ ẩm, Áp suất), kết nối Wi-Fi 6 / Modbus TCP và màn hình E-Ink siêu nét.',
    images: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    sourceUrl: 'https://example.com/products/aethersense-x1',
    contactUrl: 'https://example.com/contact?product=aethersense-x1',
    sku: 'ATH-X1-PRO',
    inStock: true,
  },
  {
    id: 'prod-aether-glass-ar',
    boothId: 'booth-aether-tech',
    name: 'Kính Hỗ Trợ Kỹ Thuật Từ Xa AetherGlass Lite',
    price: 18900000,
    currency: 'VND',
    description:
      'Kính thông minh AR hỗ trợ bảo trì nhà máy từ xa, camera 4K chống rung quang học, micro khử ồn công nghiệp 95dB và thời lượng pin 8 giờ liên tục.',
    images: [
      'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/aetherglass-lite',
    contactUrl: 'https://example.com/contact?product=aetherglass-lite',
    sku: 'ATH-AR-02',
    inStock: true,
  },
  {
    id: 'prod-nordic-desk-pro',
    boothId: 'booth-nordic-living',
    name: 'Bàn Nâng Hạ Công Thái Học Fjäll Standing Desk',
    price: 11500000,
    currency: 'VND',
    description:
      'Bàn làm việc nâng hạ 2 motor êm ái (<42dB), mặt gỗ sồi tự nhiên phủ dầu bảo vệ sinh thái, tải trọng 120kg cùng bộ nhớ 4 vị trí độ cao.',
    images: [
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/fjall-standing-desk',
    contactUrl: 'https://example.com/contact?product=fjall-standing-desk',
    sku: 'NRD-DSK-01',
    inStock: true,
  },
  {
    id: 'prod-nordic-chair-ergo',
    boothId: 'booth-nordic-living',
    name: 'Ghế Công Thái Học Nordic AirMesh Ultra',
    price: 8400000,
    currency: 'VND',
    description:
      'Thiết kế tựa lưng 3 vùng nâng đỡ cột sống chuẩn châu Âu EN-1335, lưới đàn hồi thoáng khí và kê tay 4D bọc da PU mềm mại.',
    images: [
      'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/nordic-airmesh-ultra',
    contactUrl: 'https://example.com/contact?product=nordic-airmesh-ultra',
    sku: 'NRD-CHR-02',
    inStock: true,
  },
  {
    id: 'prod-ecovita-arabica',
    boothId: 'booth-ecovita-craft',
    name: 'Cà Phê Đặc Sản Cầu Đất Arabica Honey Process (1kg)',
    price: 590000,
    currency: 'VND',
    description:
      'Hạt Arabica Cầu Đất thu hoạch chín 100% ở độ cao 1.550m, sơ chế Honey lên men tự nhiên, hương hoa trắng, cam vàng và hậu vị caramel ngọt dịu.',
    images: [
      'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/caudat-arabica-honey',
    contactUrl: 'https://example.com/contact?product=caudat-arabica-honey',
    sku: 'ECO-CF-1000',
    inStock: true,
  },
  {
    id: 'prod-ecovita-drip-gift',
    boothId: 'booth-ecovita-craft',
    name: 'Bộ Quà Tặng Doanh Nghiệp EcoVita Specialty Drip Box',
    price: 950000,
    currency: 'VND',
    description:
      'Hộp quà tặng gồm 20 túi cà phê phin giấy từ 4 vùng trồng đặc sản Việt Nam kèm bình giữ nhiệt tre tự nhiên khắc tên theo yêu cầu.',
    images: [
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/ecovita-drip-box',
    contactUrl: 'https://example.com/contact?product=ecovita-drip-box',
    sku: 'ECO-GIFT-02',
    inStock: true,
  },
  {
    id: 'prod-kinetix-amr-200',
    boothId: 'booth-kinetix-robotics',
    name: 'Robot Vận Chuyển Tự Hành Kinetix Rover AMR-200',
    price: 145000000,
    currency: 'VND',
    description:
      'Robot vận chuyển hàng hóa tự hành trong kho xưởng tải trọng 200kg, định vị LiDAR SLAM chính xác ±5mm, tự động về trạm sạc khi pin dưới 20%.',
    images: [
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    sourceUrl: 'https://example.com/products/kinetix-amr-200',
    contactUrl: 'https://example.com/contact?product=kinetix-amr-200',
    sku: 'KNX-AMR-200',
    inStock: true,
  },
  {
    id: 'prod-kinetix-vision-cam',
    boothId: 'booth-kinetix-robotics',
    name: 'Cụm Camera Kiểm Tra Ngoại Quan AI Kinetix EyePro',
    price: 29500000,
    currency: 'VND',
    description:
      'Hệ thống kiểm tra lỗi sản phẩm trên băng chuyền tốc độ 120 sản phẩm/phút, tích hợp NPU 16 TOPS phát hiện vết xước và sai lệch kích thước.',
    images: [
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/kinetix-eyepro',
    contactUrl: 'https://example.com/contact?product=kinetix-eyepro',
    sku: 'KNX-VIS-09',
    inStock: true,
  },
  {
    id: 'prod-lumina-halo-lamp',
    boothId: 'booth-lumina-design',
    name: 'Đèn Thả Kiến Trúc Lumina Halo Linear 120',
    price: 4600000,
    currency: 'VND',
    description:
      'Đèn thả trần nhôm nguyên khối anodized, ánh sáng kép chiếu trên/dưới đổi màu 2700K–5000K, chỉ số hoàn màu CRI 97 bảo vệ thị lực.',
    images: [
      'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/lumina-halo-linear',
    contactUrl: 'https://example.com/contact?product=lumina-halo-linear',
    sku: 'LUM-HL-120',
    inStock: true,
  },
  {
    id: 'prod-lumina-acoustic-hex',
    boothId: 'booth-lumina-design',
    name: 'Bộ 12 Tấm Tiêu Âm Nghệ Thuật Lumina Acoustic Hex',
    price: 2800000,
    currency: 'VND',
    description:
      'Tấm tiêu âm hình lục giác sản xuất từ 100% sợi nhựa tái chế PET đạt chuẩn chống cháy B1, hệ số hấp thụ âm thanh NRC 0.85.',
    images: [
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/lumina-acoustic-hex',
    contactUrl: 'https://example.com/contact?product=lumina-acoustic-hex',
    sku: 'LUM-HEX-12',
    inStock: true,
  },
  {
    id: 'prod-solaris-pack-10kw',
    boothId: 'booth-solaris-energy',
    name: 'Pin Lưu Trữ Điện Mặt Trời Solaris PowerWall 10kWh',
    price: 54000000,
    currency: 'VND',
    description:
      'Module lưu trữ điện năng LFP an toàn cao, tuổi thọ hơn 6.000 chu kỳ sạc xả (80% DoD), chuẩn kháng nước IP65 lắp đặt trong nhà hoặc ngoài trời.',
    images: [
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/solaris-powerwall-10kwh',
    contactUrl: 'https://example.com/contact?product=solaris-powerwall-10kwh',
    sku: 'SOL-LFP-10K',
    inStock: true,
  },
  {
    id: 'prod-solaris-ev-charger',
    boothId: 'booth-solaris-energy',
    name: 'Trạm Sạc Xe Điện Thông Minh Solaris ChargeBox 22kW',
    price: 16500000,
    currency: 'VND',
    description:
      'Bộ sạc AC Type-2 công suất 22kW, tự động cân bằng tải theo công suất điện mặt trời dư thừa, quản lý qua ứng dụng di động và thẻ từ RFID.',
    images: [
      'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=900&q=80',
    ],
    modelUrl: '',
    videoUrl: '',
    sourceUrl: 'https://example.com/products/solaris-chargebox-22kw',
    contactUrl: 'https://example.com/contact?product=solaris-chargebox-22kw',
    sku: 'SOL-EV-22K',
    inStock: true,
  },
];

export const DEFAULT_SLOT_ASSIGNMENTS: BoothSlotAssignment[] = [
  { boothId: 'booth-aether-tech', slotId: 'slot_01', productId: 'prod-aether-hub-x1' },
  { boothId: 'booth-aether-tech', slotId: 'slot_03', productId: 'prod-aether-glass-ar' },
  { boothId: 'booth-nordic-living', slotId: 'slot_01', productId: 'prod-nordic-desk-pro' },
  { boothId: 'booth-nordic-living', slotId: 'slot_03', productId: 'prod-nordic-chair-ergo' },
  { boothId: 'booth-ecovita-craft', slotId: 'slot_01', productId: 'prod-ecovita-arabica' },
  { boothId: 'booth-ecovita-craft', slotId: 'slot_02', productId: 'prod-ecovita-drip-gift' },
  { boothId: 'booth-kinetix-robotics', slotId: 'slot_01', productId: 'prod-kinetix-amr-200' },
  { boothId: 'booth-kinetix-robotics', slotId: 'slot_05', productId: 'prod-kinetix-vision-cam' },
  { boothId: 'booth-lumina-design', slotId: 'slot_01', productId: 'prod-lumina-halo-lamp' },
  { boothId: 'booth-lumina-design', slotId: 'slot_03', productId: 'prod-lumina-acoustic-hex' },
  { boothId: 'booth-solaris-energy', slotId: 'slot_01', productId: 'prod-solaris-pack-10kw' },
  { boothId: 'booth-solaris-energy', slotId: 'slot_05', productId: 'prod-solaris-ev-charger' },
];
