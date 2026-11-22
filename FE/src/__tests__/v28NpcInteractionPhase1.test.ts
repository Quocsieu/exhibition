import { describe, expect, it } from 'vitest';
import { findSimilarBooths } from '../services/similarBooths';
import { buildBoothConsultationSteps } from '../services/npcConsultationScript';
import type { V28BoothPlacementView, V28Product } from '../services/v28Api';

function makeProduct(id: string, name: string, description = '', price = 150000): V28Product {
  return {
    id,
    companyId: 'c1',
    boothId: 'b1',
    name,
    sku: `SKU-${id}`,
    price,
    currency: 'VND',
    description,
    images: [],
    videoUrl: '',
    modelUrl: '',
    sourceUrl: '',
    contactUrl: '',
    inStock: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeBooth(overrides: Partial<V28BoothPlacementView> & { boothId: string; slotIndex: number }): V28BoothPlacementView {
  const slots = overrides.slots || [];
  const px = overrides.positionX ?? 0;
  const pz = overrides.positionZ ?? 0;
  return {
    versionId: 'v-test',
    boothId: overrides.boothId,
    boothName: overrides.boothName || `Gian #${overrides.slotIndex + 1}`,
    companyId: 'c1',
    companyName: overrides.companyName || `DN #${overrides.slotIndex + 1}`,
    tagline: '',
    description: '',
    category: overrides.category || 'Nông sản',
    color: '#10b981',
    logoUrl: '',
    contactUrl: '',
    zoneId: overrides.zoneId || 'z1',
    zoneCode: overrides.zoneCode || 'A',
    zoneName: overrides.zoneName || 'Khu Nông sản',
    slotIndex: overrides.slotIndex,
    archetypeId: 'signature_ring',
    archetypeLabel: 'Signature Ring',
    archetypeTheme: 'modern',
    glbPath: '/models/booths/v27_4/booth_01_signature_ring_v27_4.glb',
    positionX: px,
    positionZ: pz,
    rotationY: 0,
    footprintWidth: 7,
    footprintDepth: 6,
    approachPoint: { x: px, z: pz + 4.5 },
    focusCameraPoint: { x: px, z: pz + 5.5 },
    placementStatus: 'occupied',
    slots,
    assignedSlotCount: slots.filter((s) => Boolean(s.product)).length,
  };
}

describe('Grand Expo V28 Phase 1 — NPC Interaction, Product Showcase & Similar Booths', () => {
  it('recommends up to 3 genuinely similar agricultural booths (mật ong / trái cây / đóng chai), prioritizes booths with products & excludes self', () => {
    const honeyCurrent = makeBooth({
      boothId: 'b-honey-1',
      slotIndex: 0,
      boothName: 'Mật Ong Rừng Tây Nguyên',
      category: 'Nông sản',
      zoneCode: 'A',
      positionX: 0,
      positionZ: 0,
      slots: [
        { slotId: 'slot-1', product: makeProduct('p1', 'Mật ong hoa cà phê nguyên chất', 'Đóng chai thủy tinh 500ml') },
      ],
    });

    const honeyPeerNear = makeBooth({
      boothId: 'b-honey-2',
      slotIndex: 1,
      boothName: 'Mật Ong Hoa Nhãn Hưng Yên',
      category: 'Nông sản',
      zoneCode: 'A',
      positionX: 10,
      positionZ: 0,
      slots: [
        { slotId: 'slot-1', product: makeProduct('p2', 'Mật ong nguyên chất đóng chai', 'Mật ong sạch') },
      ],
    });

    const fruitPeer = makeBooth({
      boothId: 'b-fruit-3',
      slotIndex: 2,
      boothName: 'Trái Cây Sấy Đà Lạt',
      category: 'Nông sản',
      zoneCode: 'A',
      positionX: 18,
      positionZ: 0,
      slots: [
        { slotId: 'slot-1', product: makeProduct('p3', 'Trái cây sấy giòn đóng hộp', 'Đặc sản nông sản') },
      ],
    });

    const emptySameCategory = makeBooth({
      boothId: 'b-empty-4',
      slotIndex: 3,
      boothName: 'Gian Nông sản trống',
      category: 'Nông sản',
      zoneCode: 'A',
      positionX: 5,
      positionZ: 0,
      slots: [],
    });

    const unrelatedTech = makeBooth({
      boothId: 'b-tech-99',
      slotIndex: 98,
      boothName: 'Robot Công Nghiệp',
      category: 'Công nghệ',
      zoneCode: 'Z',
      positionX: 4,
      positionZ: 0,
      slots: [
        { slotId: 'slot-1', product: makeProduct('p99', 'Cánh tay Robot 6 trục', 'Tự động hóa') },
      ],
    });

    const results = findSimilarBooths(
      honeyCurrent,
      [honeyCurrent, honeyPeerNear, fruitPeer, emptySameCategory, unrelatedTech],
      3
    );

    expect(results.length).toBe(3);
    expect(results.some((r) => r.booth.boothId === honeyCurrent.boothId)).toBe(false);
    expect(results.some((r) => r.booth.boothId === unrelatedTech.boothId)).toBe(false);
    expect(results[0].booth.boothId).toBe('b-honey-2');
    expect(results[1].booth.boothId).toBe('b-fruit-3');
    expect(results[2].booth.boothId).toBe('b-empty-4');
  });

  it('returns empty array when no genuinely related booth exists (never fabricates suggestions)', () => {
    const solo = makeBooth({
      boothId: 'b-solo',
      slotIndex: 0,
      category: 'Mật ong',
      zoneCode: 'A',
      slots: [{ slotId: 'slot-1', product: makeProduct('p1', 'Mật ong nguyên chất') }],
    });
    const unrelated = makeBooth({
      boothId: 'b-other',
      slotIndex: 1,
      category: 'Điện tử',
      zoneCode: 'B',
      slots: [{ slotId: 'slot-1', product: makeProduct('p2', 'Tivi OLED 4K') }],
    });

    expect(findSimilarBooths(solo, [solo, unrelated], 3)).toEqual([]);
  });

  it('produces zero PRODUCT steps for an empty booth and preserves exact slotId + product.id linkage for populated booths', () => {
    const emptyBooth = makeBooth({ boothId: 'b-empty', slotIndex: 49, slots: [] });
    const emptySteps = buildBoothConsultationSteps(emptyBooth);
    expect(emptySteps.filter((s) => s.type === 'PRODUCT')).toHaveLength(0);
    expect(emptySteps.map((s) => s.type)).toEqual(['GREETING', 'CLOSING']);

    const populated = makeBooth({
      boothId: 'b-pop',
      slotIndex: 0,
      slots: [
        { slotId: 'slot-1', product: makeProduct('prod-honey', 'Mật ong nguyên chất') },
        { slotId: 'slot-2', product: null },
        { slotId: 'slot-3', product: makeProduct('prod-fruit', 'Trái cây tươi') },
      ],
    });
    const popSteps = buildBoothConsultationSteps(populated);
    const productSteps = popSteps.filter((s) => s.type === 'PRODUCT');
    expect(productSteps).toHaveLength(2);
    expect(productSteps[0].slotKey).toBe('slot-1');
    expect(productSteps[0].product?.id).toBe('prod-honey');
    expect(productSteps[1].slotKey).toBe('slot-3');
    expect(productSteps[1].product?.id).toBe('prod-fruit');
  });
});
