import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatV28ProductPrice } from '../services/v28Api';
import {
  mapRawDiscoveredItemsToEditable,
  validatePreviewProductItem,
} from '../components/adminV28/WebsiteProductPreviewPanel';

describe('Phase 4 Frontend — Unified Website Preview, Contact Price Display & Validation', () => {
  it('1. formatV28ProductPrice preserves "Liên hệ" (never 0đ) and formats listed VND prices cleanly', () => {
    expect(
      formatV28ProductPrice({
        price: null,
        priceAmount: null,
        priceStatus: 'contact',
        priceDisplay: 'Liên hệ',
        currency: '',
      })
    ).toBe('Liên hệ');

    expect(
      formatV28ProductPrice({
        price: 0,
        priceAmount: null,
        priceStatus: 'contact',
        currency: 'VND',
      })
    ).toBe('Liên hệ');

    const listed = formatV28ProductPrice({
      price: 1050000,
      priceAmount: 1050000,
      priceStatus: 'listed',
      currency: 'VND',
    });
    expect(listed).toContain('1.050.000');
    expect(listed).not.toBe('Liên hệ');
  });

  it('2. mapRawDiscoveredItemsToEditable & validatePreviewProductItem handle 65-item mixed list, duplicates & invalid edits', () => {
    const mapped = mapRawDiscoveredItemsToEditable([
      {
        name: 'Muối Tôm Hủ 100g',
        sku: '',
        price: null,
        priceStatus: 'contact',
        priceDisplay: 'Liên hệ',
        currency: '',
        category: 'muối',
        description: 'Đặc sản Cà Mau',
        images: ['http://nongsanviet.pro/FileUpLoad/news/1782MUOI%20TOM.jpg'],
        sourceUrl: 'http://nongsanviet.pro/ProductDetail?ID=102',
        inStock: true,
        alreadyInCatalog: false,
      },
      {
        name: 'Khô Tôm Bạc',
        sku: 'KT-96',
        price: 1050000,
        priceStatus: 'listed',
        priceDisplay: '1,050,000 VND',
        currency: 'VND',
        category: 'KHÔ TÔM',
        description: '',
        images: ['http://nongsanviet.pro/FileUpLoad/news/kho-tom.jpg'],
        sourceUrl: 'http://nongsanviet.pro/ProductDetail?ID=96',
        inStock: true,
        alreadyInCatalog: true,
      },
      {
        name: 'X', // invalid (<2 chars)
        sku: '',
        price: 10000,
        priceStatus: 'listed',
        currency: 'VND',
        description: '',
        images: [],
        sourceUrl: 'http://nongsanviet.pro/ProductDetail?ID=999',
        inStock: true,
        alreadyInCatalog: false,
      },
    ]);

    expect(mapped[0].price).toBeNull();
    expect(mapped[0].priceStatus).toBe('contact');
    expect(mapped[0].category).toBe('muối');
    expect(mapped[0].selected).toBe(true);
    expect(validatePreviewProductItem(mapped[0])).toBeNull();

    // Existing item in catalog defaults to unselected to prevent duplicate import
    expect(mapped[1].alreadyInCatalog).toBe(true);
    expect(mapped[1].selected).toBe(false);
    expect(validatePreviewProductItem(mapped[1])).toBeNull();

    // Invalid item (<2 chars) is blocked from selection & saving
    expect(mapped[2].selected).toBe(false);
    expect(validatePreviewProductItem(mapped[2])).toMatch(/ít nhất 2 ký tự/i);
  });

  it('3. Synchronizes WebsiteProductPreviewPanel & Draft-isolated slot assignment across ExhibitionConfigurator, ProductCatalog, and BoothInspectorPanel', () => {
    const adminDir = path.resolve(__dirname, '../components/adminV28');
    const configuratorSrc = fs.readFileSync(path.join(adminDir, 'ExhibitionConfigurator.tsx'), 'utf8');
    const catalogSrc = fs.readFileSync(path.join(adminDir, 'ProductCatalog.tsx'), 'utf8');
    const inspectorSrc = fs.readFileSync(path.join(adminDir, 'BoothInspectorPanel.tsx'), 'utf8');

    expect(configuratorSrc).toContain('WebsiteProductPreviewPanel');
    expect(configuratorSrc).toContain("useState<'full' | 'target'>('full')");
    expect(configuratorSrc).toContain('assignDraftSlot');
    expect(configuratorSrc).toContain('clearDraftSlot');

    expect(catalogSrc).toContain('WebsiteProductPreviewPanel');
    expect(catalogSrc).toContain("discoveryMode: 'full'");
    expect(catalogSrc).toContain('formatV28ProductPrice');

    expect(inspectorSrc).toContain('WebsiteProductPreviewPanel');
    expect(inspectorSrc).toContain("discoveryMode: 'full'");
    expect(inspectorSrc).toContain('formatV28ProductPrice');
  });
});
