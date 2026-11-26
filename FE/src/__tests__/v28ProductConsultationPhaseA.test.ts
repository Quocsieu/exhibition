import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoothConsultationSteps,
  buildProductConsultationSteps,
} from '../services/npcConsultationScript';
import type { V28BoothPlacementView, V28Product } from '../services/v28Api';

function makeMockProduct(overrides: Partial<V28Product>): V28Product {
  return {
    id: overrides.id || 'prod-1',
    companyId: 'comp-1',
    boothId: 'booth-test-1',
    name: overrides.name || 'Mật ong hoa cà phê',
    sku: overrides.sku || 'MO-01',
    price: overrides.price ?? 180000,
    currency: overrides.currency || 'VND',
    inStock: overrides.inStock ?? true,
    description: overrides.description ?? 'Thu hoạch tự nhiên tại Tây Nguyên, chai 500ml.',
    images: overrides.images || ['/api/v28/product-images/sample.jpg'],
    videoUrl: '',
    modelUrl: '',
    sourceUrl: overrides.sourceUrl || 'https://example.com/p1',
    contactUrl: '',
    status: 'active',
  } as unknown as V28Product;
}

function makeMockBooth(products: V28Product[]): V28BoothPlacementView {
  return {
    boothId: 'booth-test-1',
    boothName: 'Gian hàng Đặc sản Tây Nguyên',
    companyId: 'comp-1',
    companyName: 'HTX Nông Sản Tây Nguyên',
    category: 'Nông sản',
    zoneId: 'zone-1',
    zoneName: 'Khu 1 - Nông sản',
    color: '#0ea5e9',
    description: 'Chuyên các sản phẩm đặc sản Tây Nguyên.',
    contactUrl: 'https://example.com',
    positionX: 0,
    positionZ: 0,
    rotationY: 0,
    width: 6,
    depth: 5,
    approachPoint: { x: 0, z: 5 },
    slots: products.map((p, i) => ({
      slotId: `slot_0${i + 1}`,
      product: p,
    })),
  } as unknown as V28BoothPlacementView;
}

describe('Phase A FE — Product-Specific Consultation Script & Interaction Guards', () => {
  it('builds grounded single-product consultation strictly by productId even when names match', () => {
    const p1 = makeMockProduct({
      id: 'prod-exact-1',
      name: 'Cà phê Arabica Cầu Đất',
      price: 220000,
      inStock: true,
      description: 'Rang mộc nguyên chất 250g.',
    });
    const p2 = makeMockProduct({
      id: 'prod-exact-2',
      name: 'Cà phê Arabica Cầu Đất',
      price: 410000,
      inStock: false,
      description: 'Hộp quà tặng cao cấp 500g.',
    });
    const booth = makeMockBooth([p1, p2]);

    const stepsP2 = buildProductConsultationSteps(booth, p2, 'slot_01');
    expect(stepsP2).toHaveLength(1);
    expect(stepsP2[0].type).toBe('PRODUCT');
    expect(stepsP2[0].product?.id).toBe('prod-exact-2');
    expect(stepsP2[0].slotKey).toBe('slot_02');
    expect(stepsP2[0].naturalSpeechText).toContain('410.000');
    expect(stepsP2[0].naturalSpeechText).toContain('tạm hết hàng');
    expect(stepsP2[0].naturalSpeechText).not.toContain('220.000');
  });

  it('preserves full booth-wide consultation steps (Greeting -> Products -> Closing)', () => {
    const p1 = makeMockProduct({ id: 'p-1', name: 'Sản phẩm 1' });
    const p2 = makeMockProduct({ id: 'p-2', name: 'Sản phẩm 2' });
    const booth = makeMockBooth([p1, p2]);

    const boothSteps = buildBoothConsultationSteps(booth);
    expect(boothSteps.length).toBe(4);
    expect(boothSteps[0].type).toBe('GREETING');
    expect(boothSteps[1].type).toBe('PRODUCT');
    expect(boothSteps[2].type).toBe('PRODUCT');
    expect(boothSteps[3].type).toBe('CLOSING');
  });

  it('enforces non-auto-open AI chat, stale-response cancellation, and productId context in UI wiring', () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../pages/DynamicExhibitionPage.tsx'),
      'utf8'
    );
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, '../hooks/useNpcConsultationSession.ts'),
      'utf8'
    );
    const chatSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/v28/V28NpcChatModal.tsx'),
      'utf8'
    );

    // Product click starts product consultation and explicitly keeps AI chat closed
    expect(pageSrc).toContain('npcSession.startProductConsultation(booth, product, slotId)');
    expect(pageSrc).toContain('setNpcChatOpen(false)');
    // Closing product stops product consultation playback
    expect(pageSrc).toContain("if (npcSession.consultationMode === 'product')");
    // Rapid-click race condition guard: nonce increment + AbortController + cleanupActiveAudio
    expect(hookSrc).toContain('sessionNonceRef.current += 1');
    expect(hookSrc).toContain('fetchController.signal.aborted');
    expect(hookSrc).toMatch(/v28Api\s*\.getProductConsultation\(/);
    // DIRECT_TTS_LOCKED skips Audio TTS & getProductConsultation in HybridPlaybackCoordinator
    expect(hookSrc).toContain('directTtsOnly: true');
    // AI Chat binds productId when open
    expect(chatSrc).toContain('productId: reqProductId');
  });
});
