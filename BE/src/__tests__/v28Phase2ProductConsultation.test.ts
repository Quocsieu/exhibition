import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  LocalAudioStorageAdapter,
  V28AudioCacheService,
  ensureValidWavBuffer,
} from '../services/v28/audioCacheService.js';
import { MultiProviderTtsService } from '../services/v28/tts/multiProviderTtsService.js';
import { GeminiTtsProvider } from '../services/v28/tts/providers/geminiTtsProvider.js';
import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../services/v28/tts/ttsConfig.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import type { TtsProviderAdapter, TtsSynthesisResult } from '../services/v28/tts/ttsTypes.js';

function makeValidWav(): Buffer {
  const pcm = Buffer.alloc(2400, 10);
  return ensureValidWavBuffer(pcm, 24000, 1, 16);
}

function makeValidMp3(size = 512): Buffer {
  const buf = Buffer.alloc(size, 0x55);
  buf.write('ID3', 0, 'ascii');
  buf[3] = 3;
  return buf;
}

function makeConfig(overrides?: Partial<HybridTtsRuntimeConfig>): HybridTtsRuntimeConfig {
  return {
    ...resolveHybridTtsConfig({}),
    geminiEnabled: true,
    geminiApiKey: 'AIzaTestFakeKeyForPhase2Test12345',
    vbeeEnabled: false,
    edgeEnabled: false,
    fptEnabled: false,
    fptAllowPaid: false,
    maxRetries: 0,
    ...overrides,
  };
}

describe('GRAND EXPO V28 — PHASE 2: Product-Specific NPC Consultation & Context Chat', () => {
  let tmpDir: string;
  let dbPath: string;
  let audioDir: string;
  let v28Db: V28CatalogDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase2-prod-'));
    dbPath = path.join(tmpDir, 'test.db');
    audioDir = path.join(tmpDir, 'audio');
    v28Db = new V28CatalogDatabase(dbPath);
  });

  afterEach(() => {
    try {
      v28Db.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupPublishedBoothWithProducts() {
    const exhService = new V28ExhibitionService(v28Db);
    const activeWorld = exhService.getActiveExhibitionWorld();
    const targetBooth = activeWorld.booths.find((b) => Boolean(b.companyId)) || activeWorld.booths[0];
    const companyId = targetBooth.companyId!;

    const prodA = v28Db.createProduct({
      companyId,
      name: 'Gạo ST25 Đặc Sản Sóc Trăng 5kg',
      price: 245000,
      currency: 'VND',
      description: 'Hạt gạo dẻo thơm tự nhiên, đạt chuẩn OCOP 5 sao.',
      inStock: true,
    });
    const prodB = v28Db.createProduct({
      companyId,
      name: 'Mật Ong Hoa Cà Phê Nguyên Chất',
      price: 0, // Contact price (TC13)
      currency: 'VND',
      description: '', // Empty description (TC12)
      inStock: true,
    });

    v28Db.assignBoothSlot(targetBooth.boothId, 'slot_01', prodA.id);
    v28Db.assignBoothSlot(targetBooth.boothId, 'slot_02', prodB.id);
    // Sync published version slot table as well
    v28Db
      .getConnection()
      .prepare(
        `INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(activeWorld.versionId, targetBooth.boothId, 'slot_01', prodA.id);
    v28Db
      .getConnection()
      .prepare(
        `INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(activeWorld.versionId, targetBooth.boothId, 'slot_02', prodB.id);

    return { exhService, boothId: targetBooth.boothId, prodA, prodB };
  }

  it('TC01, TC02, TC07, TC08, TC09, TC12, TC13, TC14, TC23 — Product A/B resolution, Audio-First (uploaded/pregen/cache), empty desc, contact price & product-scoped AI chat', async () => {
    const { exhService, boothId, prodA, prodB } = setupPublishedBoothWithProducts();
    let providerCalls = 0;

    const mockGemini: TtsProviderAdapter = {
      id: 'gemini',
      displayName: 'Mock Gemini',
      paidApi: true,
      isConfigured: () => true,
      isEnabled: () => true,
      listVoices: () => [],
      getStatus: () => ({
        id: 'gemini',
        displayName: 'Mock Gemini',
        enabled: true,
        configured: true,
        available: true,
        defaultModel: 'gemini-3.8-flash-tts',
        defaultVoice: 'Kore',
        audioFormat: 'wav',
        priorityRank: 1,
        paidApi: true,
        notes: '',
        voices: [],
      }),
      synthesize: async (req): Promise<TtsSynthesisResult> => {
        providerCalls++;
        return {
          buffer: makeValidWav(),
          mimeType: 'audio/wav',
          audioFormat: 'wav',
          durationSec: 1.5,
          provider: 'gemini',
          modelId: 'gemini-3.8-flash-tts',
          voiceId: 'Kore',
          language: 'vi-VN',
          synthMs: 25,
          estimatedChars: req.text.length,
        };
      },
    };

    const audioCache = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(audioDir),
      new MultiProviderTtsService({
        getConfig: () => makeConfig(),
        adapters: { gemini: mockGemini },
      })
    );
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService, undefined, audioCache));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v28`;

    try {
      // TC01: Product A first call synthesizes & caches (1 call)
      const rA1 = await (await fetch(`${base}/booths/${boothId}/products/${prodA.id}/consultation`)).json();
      expect(rA1.productId).toBe(prodA.id);
      expect(rA1.script).toContain('Gạo ST25 Đặc Sản Sóc Trăng 5kg');
      expect(rA1.script).toContain('245');
      expect(rA1.audio?.provider).toBe('gemini');
      expect(providerCalls).toBe(1);

      // TC09 & TC23: Second call for Product A hits cache -> 0 new TTS calls!
      const rA2 = await (await fetch(`${base}/booths/${boothId}/products/${prodA.id}/consultation`)).json();
      expect(rA2.cacheHit).toBe(true);
      expect(rA2.audio?.audioId).toBe(rA1.audio?.audioId);
      expect(providerCalls).toBe(1);

      // TC08: Pre-generated audio for Product B -> 0 new TTS calls on consultation
      await audioCache.generateAdminAudio({
        entityType: 'product',
        entityId: prodB.id,
        slotKey: 'slot_02',
        transcript: 'Bản tạo sẵn giới thiệu Mật Ong Hoa Cà Phê Nguyên Chất, giá liên hệ.',
      });
      expect(providerCalls).toBe(2);

      // TC02, TC12, TC13: Product B returns exact Product B (empty desc + contact price), 0 new TTS calls
      const rB = await (await fetch(`${base}/booths/${boothId}/products/${prodB.id}/consultation`)).json();
      expect(rB.productId).toBe(prodB.id);
      expect(rB.source).toBe('pre_generated');
      expect(rB.script).toContain('Mật Ong Hoa Cà Phê Nguyên Chất');
      expect(rB.script.toLowerCase()).toContain('liên hệ');
      expect(providerCalls).toBe(2);

      // TC07: Uploaded admin recording overrides pre-generated for Product A -> 0 TTS calls!
      const uploaded = await audioCache.uploadAdminAudio({
        entityType: 'product',
        entityId: prodA.id,
        slotKey: 'slot_01',
        transcript: 'Bản thu âm chuyên viên giới thiệu Gạo ST25.',
        filename: 'st25-recorded.mp3',
        mimeType: 'audio/mpeg',
        fileBuffer: makeValidMp3(640),
      });
      const rA3 = await (await fetch(`${base}/booths/${boothId}/products/${prodA.id}/consultation`)).json();
      expect(rA3.source).toBe('uploaded');
      expect(rA3.audio?.audioId).toBe(uploaded.audioId);
      expect(providerCalls).toBe(2);

      // TC14: Chat strictly grounded in Product A, then switches to Product B cleanly
      const chatA = await (
        await fetch(`${base}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boothId,
            productId: prodA.id,
            message: 'Sản phẩm này giá bao nhiêu?',
          }),
        })
      ).json();
      expect(chatA.groundedProductId).toBe(prodA.id);
      expect(chatA.reply).toContain('Gạo ST25');
      expect(chatA.reply).not.toContain('Mật Ong');

      const chatB = await (
        await fetch(`${base}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boothId,
            productId: prodB.id,
            message: 'Cho tôi xem giá sản phẩm này?',
          }),
        })
      ).json();
      expect(chatB.groundedProductId).toBe(prodB.id);
      expect(chatB.reply).toContain('Mật Ong');
      expect(chatB.reply.toLowerCase()).toContain('liên hệ');
      expect(chatB.reply).not.toContain('Gạo ST25');
    } finally {
      server.close();
    }
  });

  it('TC10 & TC11 — Gemini HTTP 403 / all providers unavailable returns safe client_fallback with grounded script (never crashes, never returns chime)', async () => {
    const { exhService, boothId, prodB } = setupPublishedBoothWithProducts();
    const gemini403 = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            error: { code: 403, message: 'The Gemini API free tier is not available for this project.' },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        ),
    });

    const audioCache = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(audioDir),
      new MultiProviderTtsService({
        getConfig: () => makeConfig({ legacyFallbackEnabled: true }),
        adapters: { gemini: gemini403 },
      })
    );
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService, undefined, audioCache));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v28`;

    try {
      const res = await fetch(`${base}/booths/${boothId}/products/${prodB.id}/consultation`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.productId).toBe(prodB.id);
      expect(data.source).toBe('client_fallback');
      expect(data.audio).toBeNull(); // Never returns 440Hz chime!
      expect(data.script).toContain('Mật Ong Hoa Cà Phê Nguyên Chất');
      expect(data.script).toContain('giá liên hệ trực tiếp tại gian hàng');
      expect(data.legacyFallbackEnabled).toBe(true);
    } finally {
      server.close();
    }
  });
});
