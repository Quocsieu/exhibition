import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildBoothConsultationSteps,
  buildGroundedProductScript,
} from '../services/npcConsultationScript';
import { NpcAudioFirstService } from '../services/npcAudioFirstService';
import type { V28BoothPlacementView, V28Product } from '../services/v28Api';

function makeProduct(overrides: Partial<V28Product>): V28Product {
  return {
    id: 'prod-1',
    companyId: 'comp-1',
    boothId: 'booth-1',
    name: 'Sản phẩm mẫu',
    sku: 'SKU-1',
    price: 150000,
    currency: 'VND',
    description: 'Mô tả thực tế từ doanh nghiệp.',
    images: [],
    videoUrl: '',
    modelUrl: '',
    sourceUrl: '',
    contactUrl: '',
    inStock: true,
    status: 'active',
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
    ...overrides,
  };
}

function makeBooth(products: V28Product[]): V28BoothPlacementView {
  return {
    boothId: 'booth-1',
    boothName: 'Gian hàng Nông Sản Việt',
    companyId: 'comp-1',
    companyName: 'HTX Nông Sản Việt',
    category: 'Thực phẩm',
    color: '#10b981',
    description: 'Chuyên nông sản đặc sản vùng miền',
    contactEmail: 'info@example.com',
    contactUrl: 'https://example.com',
    zoneId: 'zone-1',
    zoneCode: 'A',
    zoneName: 'Khu Nông Sản',
    slotIndex: 0,
    positionX: 0,
    positionZ: 0,
    rotationY: 0,
    archetypeId: 'grand_portal',
    approachPoint: { x: 0, z: 4 },
    slots: products.map((p, idx) => ({
      slotId: `slot_0${idx + 1}`,
      product: p,
    })),
  } as unknown as V28BoothPlacementView;
}

describe('GRAND EXPO V28 — PHASE 2: Frontend Product Consultation Script, Rapid Clicks & Context Guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('TC12 & TC13 — Grounded product script handles empty description & contact price honestly without fabricating data', () => {
    const booth = makeBooth([]);
    const prodNoDescContact = makeProduct({
      id: 'prod-contact',
      name: 'Mật Ong Rừng U Minh',
      price: 0,
      priceStatus: 'contact',
      description: '',
      inStock: true,
    });

    const script = buildGroundedProductScript(booth, prodNoDescContact);
    expect(script).toContain('Mật Ong Rừng U Minh');
    expect(script).toContain('giá liên hệ trực tiếp tại gian hàng');
    expect(script).toContain('HTX Nông Sản Việt');
    expect(script).not.toMatch(/undefined|null|NaN|\s{2,}/);
  });

  it('TC03, TC04, TC05 — Rapid 10-product click simulation aborts older fetches and drops late responses', async () => {
    const svc = new NpcAudioFirstService();
    const controllers: AbortController[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        // Simulate older product A being SLOWER (60ms) than newer product B (5ms)
        const isSlow = String(url).includes('aud-1');
        await new Promise((r) => setTimeout(r, isSlow ? 60 : 5));
        if (init?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return new Response(new Uint8Array(128).fill(7), { status: 200 });
      })
    );

    const promises = [];
    for (let i = 1; i <= 10; i++) {
      // Abort previous product request before starting next (exact same pattern as useNpcConsultationSession)
      if (controllers.length > 0) {
        controllers[controllers.length - 1].abort();
      }
      const ctrl = new AbortController();
      controllers.push(ctrl);
      promises.push(
        svc.fetchAudioBlobFromUrl({
          audioId: `aud-${i}`,
          audioUrl: `/api/v28/audio/aud-${i}/stream`,
          source: 'pre_generated',
          provider: 'gemini',
          voiceId: 'Kore',
          signal: ctrl.signal,
        })
      );
    }

    const results = await Promise.all(promises);
    // All 9 earlier products aborted/null; ONLY the 10th (latest) product resolves!
    for (let i = 0; i < 9; i++) {
      expect(results[i]).toBeNull();
    }
    expect(results[9]?.audioId).toBe('aud-10');
  });

  it('TC21 — Booth-wide consultation script builder remains 100% intact', () => {
    const p1 = makeProduct({ id: 'p1', name: 'Gạo ST25', price: 245000 });
    const p2 = makeProduct({ id: 'p2', name: 'Trà Sen', price: 320000 });
    const booth = makeBooth([p1, p2]);
    const steps = buildBoothConsultationSteps(booth);
    expect(steps).toHaveLength(4); // GREETING + 2 PRODUCTS + CLOSING
    expect(steps[0].type).toBe('GREETING');
    expect(steps[1].product?.id).toBe('p1');
    expect(steps[2].product?.id).toBe('p2');
    expect(steps[3].type).toBe('CLOSING');
  });
});
