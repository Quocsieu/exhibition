import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { V28AudioCacheService, LocalAudioStorageAdapter } from '../services/v28/audioCacheService.js';
import { V28AiConsultantService } from '../services/v28/aiConsultantService.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { resolveHybridTtsConfig } from '../services/v28/tts/ttsConfig.js';

function makeValidWavBuffer(): Buffer {
  const sampleRate = 24000;
  const numSamples = 2400;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('Phase A — Product-Specific NPC Consultation & Grounded AI Chat', () => {
  let tmpDir: string;
  let v28Db: V28CatalogDatabase;
  let exhibitionService: V28ExhibitionService;
  let audioCacheService: V28AudioCacheService;
  let aiConsultantService: V28AiConsultantService;
  let server: http.Server;
  let baseUrl: string;
  let boothId: string;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase-a-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const audioDir = path.join(tmpDir, 'audio');

    v28Db = new V28CatalogDatabase(dbPath);
    exhibitionService = new V28ExhibitionService(v28Db);
    audioCacheService = new V28AudioCacheService(v28Db, new LocalAudioStorageAdapter(audioDir));
    aiConsultantService = new V28AiConsultantService(v28Db, exhibitionService);

    const world = exhibitionService.getActiveExhibitionWorld();
    const targetBooth = world.booths[0];
    boothId = targetBooth.boothId;

    const ownerCompanyId =
      targetBooth.companyId ||
      v28Db.createCompany({
        name: 'Nông Sản Thử Nghiệm Phase A',
        description: 'Doanh nghiệp kiểm thử tư vấn sản phẩm theo productId',
        contactEmail: 'contact@phasea.test',
        contactUrl: 'https://phasea.test',
      }).id;

    const pA = v28Db.createProduct({
      companyId: ownerCompanyId,
      name: 'Trà Shan Tuyết Cổ Thụ',
      sku: 'TRA-A-01',
      price: 350000,
      currency: 'VND',
      inStock: true,
      description: 'Thu hái từ cây chè cổ thụ 200 năm tuổi, hương cốm thanh nhẹ.',
      images: ['https://phasea.test/tra-a.jpg'],
      sourceUrl: 'https://phasea.test/tra-a',
    });

    const pB = v28Db.createProduct({
      companyId: ownerCompanyId,
      name: 'Trà Shan Tuyết Cổ Thụ',
      sku: 'TRA-B-02',
      price: 690000,
      currency: 'VND',
      inStock: false,
      description: 'Phiên bản hộp quà biếu thượng hạng 500g ép bánh.',
      images: ['https://phasea.test/tra-b.jpg'],
      sourceUrl: 'https://phasea.test/tra-b',
    });

    productAId = pA.id;
    productBId = pB.id;

    // Assign both products to slots 1 and 2 of the active booth
    const conn = v28Db.getConnection();
    conn.prepare('UPDATE booths SET company_id = ? WHERE id = ?').run(ownerCompanyId, boothId);
    conn
      .prepare(
        `INSERT OR REPLACE INTO booth_slot_assignments (booth_id, slot_id, product_id)
         VALUES (?, 'slot_01', ?), (?, 'slot_02', ?)`
      )
      .run(boothId, productAId, boothId, productBId);
    conn
      .prepare(
        `INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id)
         VALUES (?, ?, 'slot_01', ?), (?, ?, 'slot_02', ?)`
      )
      .run(world.versionId, boothId, productAId, world.versionId, boothId, productBId);

    // Pre-upload real valid WAV for productAId to verify Audio-First priority without calling TTS
    await audioCacheService.uploadAdminAudio({
      entityType: 'product',
      entityId: productAId,
      slotKey: 'slot_01',
      transcript: 'Bản thu âm sẵn cho Trà Shan Tuyết mã TRA-A-01 giá 350.000 VND.',
      fileBuffer: makeValidWavBuffer(),
      mimeType: 'audio/wav',
      uploadedBy: 'test-admin',
    });

    const app = express();
    app.use(express.json());
    app.use(
      '/api/v28',
      createV28ApiRoutes(v28Db, undefined, exhibitionService, undefined, audioCacheService, aiConsultantService)
    );

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v28`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    v28Db?.close();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('keeps FPT.AI disabled by default and prioritizes Gemini -> Vbee -> Edge Neural TTS', () => {
    const cfg = resolveHybridTtsConfig({});
    expect(cfg.providerPriority).toEqual(['gemini', 'vbee', 'edge']);
    expect(cfg.fptEnabled).toBe(false);
    expect(cfg.fptAllowPaid).toBe(false);
  });

  it('resolves product consultation strictly by productId and prioritizes pre-recorded audio without re-calling TTS', async () => {
    const resA = await fetch(
      `${baseUrl}/booths/${encodeURIComponent(boothId)}/products/${encodeURIComponent(productAId)}/consultation`
    );
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as {
      productId: string;
      slotId: string;
      script: string;
      source: string;
      cacheHit: boolean;
      audio: { audioUrl: string; entityId: string } | null;
      product: { sku: string; price: number };
    };
    expect(bodyA.productId).toBe(productAId);
    expect(bodyA.slotId).toBe('slot_01');
    expect(bodyA.product.sku).toBe('TRA-A-01');
    expect(bodyA.product.price).toBe(350000);
    expect(bodyA.source).toBe('uploaded');
    expect(bodyA.cacheHit).toBe(true);
    expect(bodyA.audio?.entityId).toBe(productAId);
    expect(bodyA.script).toContain('TRA-A-01');

    // Second product has identical name but different productId -> must return product B's real data!
    const resB = await fetch(
      `${baseUrl}/booths/${encodeURIComponent(boothId)}/products/${encodeURIComponent(productBId)}/consultation`
    );
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as {
      productId: string;
      slotId: string;
      script: string;
      product: { sku: string; price: number; inStock: boolean };
    };
    expect(bodyB.productId).toBe(productBId);
    expect(bodyB.slotId).toBe('slot_02');
    expect(bodyB.product.sku).toBe('TRA-B-02');
    expect(bodyB.product.price).toBe(690000);
    expect(bodyB.product.inStock).toBe(false);
    expect(bodyB.script).toContain('690.000');
    expect(bodyB.script).toContain('tạm hết hàng');
  });

  it('returns 404 when productId is not displayed in the requested booth', async () => {
    const res = await fetch(
      `${baseUrl}/booths/${encodeURIComponent(boothId)}/products/non-existent-product-id/consultation`
    );
    expect(res.status).toBe(404);
  });

  it('grounds AI Chat strictly on exact productId when provided, and preserves booth-wide chat when omitted', async () => {
    const resProdB = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boothId,
        productId: productBId,
        message: 'Sản phẩm này giá bao nhiêu và còn hàng không?',
      }),
    });
    expect(resProdB.status).toBe(200);
    const chatB = (await resProdB.json()) as {
      reply: string;
      groundedBoothId: string;
      groundedProductId?: string;
    };
    expect(chatB.groundedBoothId).toBe(boothId);
    expect(chatB.groundedProductId).toBe(productBId);
    expect(chatB.reply).toContain('690.000');
    expect(chatB.reply).toContain('TRA-B-02');
    expect(chatB.reply).not.toContain('350.000');

    // Honesty guard: never fabricates warranty/promotions
    const resWarranty = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boothId,
        productId: productAId,
        message: 'Sản phẩm này có bảo hành hay khuyến mãi gì không?',
      }),
    });
    expect(resWarranty.status).toBe(200);
    const chatWarranty = (await resWarranty.json()) as { reply: string; groundedProductId?: string };
    expect(chatWarranty.groundedProductId).toBe(productAId);
    expect(chatWarranty.reply).toContain('chưa có thông tin chi tiết về chính sách bảo hành hoặc khuyến mãi');

    // Booth-wide chat preserved when productId is omitted
    const resBooth = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boothId,
        message: 'Gian hàng có những sản phẩm nào?',
      }),
    });
    expect(resBooth.status).toBe(200);
    const chatBooth = (await resBooth.json()) as { reply: string; groundedProductId?: string };
    expect(chatBooth.groundedProductId).toBeUndefined();
    expect(chatBooth.reply).toContain('/6 sản phẩm');
    expect(chatBooth.reply).toContain('350.000 VND');
    expect(chatBooth.reply).toContain('690.000 VND');
  });
});
