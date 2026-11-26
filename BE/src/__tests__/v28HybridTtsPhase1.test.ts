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
  isValidWavBuffer,
} from '../services/v28/audioCacheService.js';
import { MultiProviderTtsService } from '../services/v28/tts/multiProviderTtsService.js';
import { GeminiTtsProvider } from '../services/v28/tts/providers/geminiTtsProvider.js';
import { VbeeTtsProvider } from '../services/v28/tts/providers/vbeeTtsProvider.js';
import { EdgeNeuralTtsProvider } from '../services/v28/tts/providers/edgeNeuralTtsProvider.js';
import { FptTtsProvider } from '../services/v28/tts/providers/fptTtsProvider.js';
import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../services/v28/tts/ttsConfig.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import type { TtsProviderAdapter, TtsSynthesisResult } from '../services/v28/tts/ttsTypes.js';
import { TtsProviderError } from '../services/v28/tts/ttsTypes.js';

function makeValidWav(samples = 1200): Buffer {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    pcm.writeInt16LE(Math.round(Math.sin(i / 10) * 10000), i * 2);
  }
  return ensureValidWavBuffer(pcm, 24000, 1, 16);
}

function makeValidMp3(size = 512): Buffer {
  const buf = Buffer.alloc(size, 0x55);
  buf.write('ID3', 0, 'ascii');
  buf[3] = 3;
  buf[4] = 0;
  return buf;
}

function makeConfig(overrides?: Partial<HybridTtsRuntimeConfig>): HybridTtsRuntimeConfig {
  return {
    ...resolveHybridTtsConfig({}),
    geminiEnabled: true,
    geminiApiKey: 'AIzaTestFakeKeyForUnitTest123456',
    vbeeEnabled: true,
    vbeeApiToken: 'vbee-test-token-123456',
    vbeeAppId: 'vbee-app-123',
    edgeEnabled: true,
    azureSpeechKey: 'azure-test-key-123456',
    azureSpeechRegion: 'southeastasia',
    fptEnabled: false,
    fptAllowPaid: false,
    fptApiKey: 'fpt-secret-key-should-never-be-called',
    maxRetries: 0,
    ...overrides,
  };
}

describe('GRAND EXPO V28 — PHASE 1: Hybrid Multi-Provider TTS, Audio-First Cache & Admin Management', () => {
  let tmpDir: string;
  let dbPath: string;
  let audioDir: string;
  let v28Db: V28CatalogDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase1-tts-'));
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

  it('TC01 — Gemini Audio TTS synthesizes valid Vietnamese WAV (mocked official REST response)', async () => {
    const rawPcm = Buffer.alloc(4800, 12);
    const gemini = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'audio/L16;rate=24000',
                        data: rawPcm.toString('base64'),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });

    const service = new MultiProviderTtsService({
      getConfig: () => makeConfig(),
      adapters: { gemini },
    });

    const outcome = await service.synthesizeWithFallback({
      text: 'Gạo ST25 Ông Cua túi 5 kg giá 245.000 VNĐ.',
    });

    expect(outcome.result.provider).toBe('gemini');
    expect(outcome.fallbackUsed).toBe(false);
    expect(isValidWavBuffer(outcome.result.buffer)).toBe(true);
    expect(outcome.result.voiceId).toBe('Kore');
    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.attempts[0].ok).toBe(true);
  });

  it('TC02 — Gemini failure triggers Vbee TTS fallback #1 seamlessly', async () => {
    let geminiCalls = 0;
    let vbeeCalls = 0;
    let edgeCalls = 0;

    const gemini = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => {
        geminiCalls++;
        return new Response('quota exhausted', { status: 429 });
      },
    });
    const vbee = new VbeeTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => {
        vbeeCalls++;
        return new Response(new Uint8Array(makeValidMp3()), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      },
    });
    const edge = new EdgeNeuralTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => {
        edgeCalls++;
        return new Response(new Uint8Array(makeValidMp3()), { status: 200 });
      },
    });

    const service = new MultiProviderTtsService({
      getConfig: () => makeConfig(),
      adapters: { gemini, vbee, edge },
    });

    const outcome = await service.synthesizeWithFallback({
      text: 'Cà phê Arabica Cầu Đất hộp 500g.',
    });

    expect(geminiCalls).toBe(1);
    expect(vbeeCalls).toBe(1);
    expect(edgeCalls).toBe(0); // Sequential — never called simultaneously!
    expect(outcome.result.provider).toBe('vbee');
    expect(outcome.fallbackUsed).toBe(true);
    expect(outcome.result.mimeType).toBe('audio/mpeg');
  });

  it('TC03 & TC04 — Gemini & Vbee fail -> Edge Neural TTS succeeds; FPT.AI is NEVER called when disabled', async () => {
    let fptCalls = 0;
    const gemini = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => new Response('service unavailable', { status: 503 }),
    });
    const vbee = new VbeeTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => {
        throw new Error('ECONNRESET');
      },
    });
    const edge = new EdgeNeuralTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () =>
        new Response(new Uint8Array(makeValidMp3()), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
    });
    const fpt = new FptTtsProvider({
      getConfig: () => makeConfig({ fptEnabled: false, fptAllowPaid: false }),
      fetchFn: async () => {
        fptCalls++;
        return new Response(new Uint8Array(makeValidMp3()), { status: 200 });
      },
    });

    const service = new MultiProviderTtsService({
      getConfig: () => makeConfig({ fptEnabled: false, fptAllowPaid: false }),
      adapters: { gemini, vbee, edge, fpt },
    });

    const outcome = await service.synthesizeWithFallback({
      text: 'Mật ong hoa cà phê Tây Nguyên 750ml.',
    });
    expect(outcome.result.provider).toBe('edge');
    expect(outcome.fallbackUsed).toBe(true);
    expect(fptCalls).toBe(0);

    // Even when all 3 enabled providers fail, FPT.AI is still NEVER called
    const failingEdge = new EdgeNeuralTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => new Response('error', { status: 503 }),
    });
    const serviceAllFail = new MultiProviderTtsService({
      getConfig: () => makeConfig({ fptEnabled: false, fptAllowPaid: false }),
      adapters: { gemini, vbee, edge: failingEdge, fpt },
    });
    await expect(
      serviceAllFail.synthesizeWithFallback({ text: 'Test all fail' })
    ).rejects.toThrow(TtsProviderError);
    expect(fptCalls).toBe(0);
  });

  it('TC05, TC06, TC07, TC08, TC09, TC10 — Audio-first (uploaded & pregen), cache hit/miss, single-flight dedupe & persistence across restart', async () => {
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
        await new Promise((r) => setTimeout(r, 40));
        return {
          buffer: makeValidWav(),
          mimeType: 'audio/wav',
          audioFormat: 'wav',
          durationSec: 1.5,
          provider: 'gemini',
          modelId: 'gemini-3.8-flash-tts',
          voiceId: req.voiceId || 'Kore',
          language: 'vi-VN',
          synthMs: 40,
          estimatedChars: req.text.length,
        };
      },
    };

    const storage = new LocalAudioStorageAdapter(audioDir);
    const ttsService = new MultiProviderTtsService({
      getConfig: () => makeConfig(),
      adapters: { gemini: mockGemini },
    });
    const cacheService = new V28AudioCacheService(v28Db, storage, ttsService);

    // TC07 & TC09: Concurrent visitors requesting same uncached text -> single-flight (only 1 TTS call!)
    const [r1, r2, r3] = await Promise.all([
      cacheService.synthesizeRealtimeCached({ text: 'Xin chào triển lãm nông sản 2026.' }),
      cacheService.synthesizeRealtimeCached({ text: 'Xin chào triển lãm nông sản 2026.' }),
      cacheService.synthesizeRealtimeCached({ text: 'Xin chào triển lãm nông sản 2026.' }),
    ]);
    expect(providerCalls).toBe(1);
    expect(r1.asset.audioId).toBe(r2.asset.audioId);
    expect(r2.asset.audioId).toBe(r3.asset.audioId);
    expect(cacheService.metrics.inFlightDeduplicated).toBeGreaterThanOrEqual(2);

    // TC08: Subsequent request hits persistent cache (0 new TTS calls)
    const r4 = await cacheService.synthesizeRealtimeCached({ text: 'Xin chào triển lãm nông sản 2026.' });
    expect(r4.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);

    // TC06: Pre-generated audio resolves audio-first without calling TTS
    const company = v28Db.createCompany({ name: 'Nông Sản Test', category: 'Food' });
    const prod = v28Db.createProduct({
      companyId: company.id,
      name: 'Trà Sen Tây Hồ',
      price: 350000,
      currency: 'VND',
      description: 'Trà sen ướp tự nhiên',
    });
    await cacheService.generateAdminAudio({
      entityType: 'product',
      entityId: prod.id,
      transcript: 'Sản phẩm Trà Sen Tây Hồ giá 350.000 đồng.',
    });
    expect(providerCalls).toBe(2);

    const pregenResolved = await cacheService.resolveAudioFirst({
      entityType: 'product',
      entityId: prod.id,
    });
    expect(pregenResolved?.source).toBe('pre_generated');
    expect(providerCalls).toBe(2);

    // TC05: Admin uploaded audio overrides pre-generated and NEVER calls TTS
    const uploaded = await cacheService.uploadAdminAudio({
      entityType: 'product',
      entityId: prod.id,
      transcript: 'Bản thu âm chuyên viên giới thiệu Trà Sen Tây Hồ.',
      filename: 'tra-sen.mp3',
      mimeType: 'audio/mpeg',
      fileBuffer: makeValidMp3(1024),
    });
    expect(uploaded.sourceType).toBe('uploaded');
    const uploadedResolved = await cacheService.resolveAudioFirst({
      entityType: 'product',
      entityId: prod.id,
    });
    expect(uploadedResolved?.source).toBe('uploaded');
    expect(uploadedResolved?.asset.audioId).toBe(uploaded.audioId);
    expect(providerCalls).toBe(2);

    // TC10: Persistence across server restart (re-open DB & LocalAudioStorageAdapter)
    v28Db.close();
    const restartedDb = new V28CatalogDatabase(dbPath);
    const restartedCache = new V28AudioCacheService(
      restartedDb,
      new LocalAudioStorageAdapter(audioDir),
      ttsService
    );
    const afterRestart = await restartedCache.resolveAudioFirst({
      entityType: 'product',
      entityId: prod.id,
    });
    expect(afterRestart?.source).toBe('uploaded');
    expect(afterRestart?.asset.audioId).toBe(uploaded.audioId);
    const streamSrc = await restartedCache.getAudioStreamSource(uploaded.audioId);
    expect(streamSrc).not.toBeNull();
    restartedDb.close();
    // Re-open so afterEach close is clean
    v28Db = new V28CatalogDatabase(dbPath);
  });

  it('TC11, TC12, TC13, TC14, TC15, TC20, TC21, TC22, TC25 — Full HTTP Admin API, upload validation, product edit staleness, batch concurrency/cancel, auth & rate limit', async () => {
    let activeSynth = 0;
    let maxConcurrentSynth = 0;
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
        activeSynth++;
        maxConcurrentSynth = Math.max(maxConcurrentSynth, activeSynth);
        await new Promise((r) => setTimeout(r, 60));
        activeSynth--;
        return {
          buffer: makeValidWav(),
          mimeType: 'audio/wav',
          audioFormat: 'wav',
          durationSec: 1.2,
          provider: 'gemini',
          modelId: 'gemini-3.8-flash-tts',
          voiceId: 'Kore',
          language: 'vi-VN',
          synthMs: 60,
          estimatedChars: req.text.length,
        };
      },
    };

    const storage = new LocalAudioStorageAdapter(audioDir);
    const ttsService = new MultiProviderTtsService({
      getConfig: () => makeConfig({ batchConcurrency: 2, rateLimitPerMin: 5 }),
      adapters: { gemini: mockGemini },
    });
    const audioCache = new V28AudioCacheService(v28Db, storage, ttsService);
    const exhService = new V28ExhibitionService(v28Db);
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService, undefined, audioCache));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v28`;
    const adminToken = issueAdminToken('admin');

    try {
      // TC21: Providers endpoint works safely with no secrets leaked
      const provRes = await fetch(`${base}/tts/providers`);
      expect(provRes.status).toBe(200);
      const provBody = await provRes.text();
      expect(provBody).not.toContain('AIzaTestFakeKey');
      expect(provBody).not.toContain('vbee-test-token');

      // TC25: Admin authorization required on /admin/audio/*
      const unauthRes = await fetch(`${base}/admin/audio/items`);
      expect(unauthRes.status).toBe(401);

      const company = v28Db.createCompany({ name: 'HTX Nông Sản', category: 'Agri' });
      const products = [];
      for (let i = 1; i <= 5; i++) {
        products.push(
          v28Db.createProduct({
            companyId: company.id,
            name: `Sản phẩm nông sản ${i}`,
            price: 100000 * i,
            currency: 'VND',
            description: `Mô tả đặc sản vùng miền số ${i}`,
          })
        );
      }

      // TC12: Valid MP3 upload succeeds
      const uploadOk = await fetch(`${base}/admin/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          entityType: 'product',
          entityId: products[0].id,
          transcript: 'Giới thiệu thu âm sản phẩm 1',
          filename: 'sp1.mp3',
          mimeType: 'audio/mpeg',
          fileBase64: makeValidMp3(600).toString('base64'),
        }),
      });
      expect(uploadOk.status).toBe(201);
      const uploadedJson = (await uploadOk.json()) as { asset: { audioId: string; sourceType: string } };
      expect(uploadedJson.asset.sourceType).toBe('uploaded');

      // TC13: Reject invalid audio file (fake text disguised as MP3)
      const uploadBad = await fetch(`${base}/admin/audio/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          entityType: 'product',
          entityId: products[0].id,
          filename: 'malware.mp3',
          mimeType: 'audio/mpeg',
          fileBase64: Buffer.from('not an audio file at all! <script>alert(1)</script>').toString('base64'),
        }),
      });
      expect(uploadBad.status).toBe(400);

      // TC11: Editing product marks its audio as `needs_update` without deleting manual recording
      const patchRes = await fetch(`${base}/products/${products[0].id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ price: 155000 }),
      });
      expect(patchRes.status).toBe(200);
      const itemsAfterEdit = (await (
        await fetch(`${base}/admin/audio/items?entityType=product&companyId=${encodeURIComponent(company.id)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).json()) as { items: Array<{ entityId: string; status: string; needsUpdate: boolean; sourceType: string }> };
      const editedItem = itemsAfterEdit.items.find((x) => x.entityId === products[0].id);
      expect(editedItem?.status).toBe('needs_update');
      expect(editedItem?.needsUpdate).toBe(true);
      expect(editedItem?.sourceType).toBe('uploaded'); // Manual recording preserved!

      // Phase 1.1.3: Preview & approve voice before batch start
      const prevRes = await fetch(`${base}/admin/audio/voice/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ provider: 'gemini', voiceId: 'Kore' }),
      });
      expect(prevRes.status).toBe(200);
      const prevJson = (await prevRes.json()) as { preview: { configSignature: string } };
      const approveRes = await fetch(`${base}/admin/audio/voice/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ configSignature: prevJson.preview.configSignature }),
      });
      expect(approveRes.status).toBe(200);

      // TC14: Batch requires explicit confirmation (`confirmed: true`) and enforces concurrency <= 2
      const batchUnconfirmed = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirmed: false, entityType: 'product' }),
      });
      expect(batchUnconfirmed.status).toBe(400);

      const batchStart = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirmed: true, entityType: 'product', companyId: company.id, concurrency: 2 }),
      });
      expect(batchStart.status).toBe(202);
      const startedJob = (await batchStart.json()) as { job: { jobId: string; totalItems: number } };
      expect(startedJob.job.totalItems).toBeGreaterThanOrEqual(4);

      // Poll until completed
      let finalJob: { status: string; succeededItems: number; totalItems: number } | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 40));
        const jRes = await fetch(`${base}/admin/audio/batch/${startedJob.job.jobId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const jData = (await jRes.json()) as { job: { status: string; succeededItems: number; totalItems: number } };
        finalJob = jData.job;
        if (finalJob.status === 'completed') break;
      }
      expect(finalJob?.status).toBe('completed');
      expect(maxConcurrentSynth).toBeLessThanOrEqual(2);

      // TC15: Cancel batch job
      for (const p of products.slice(1)) {
        audioCache.markEntityAudioNeedsUpdate('product', p.id);
      }
      const batchStart2 = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ confirmed: true, entityType: 'product', companyId: company.id, concurrency: 1 }),
      });
      const job2 = ((await batchStart2.json()) as { job: { jobId: string } }).job;
      const cancelRes = await fetch(`${base}/admin/audio/batch/${job2.jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(cancelRes.status).toBe(200);
      const cancelled = ((await cancelRes.json()) as { job: { status: string } }).job;
      expect(cancelled.status).toBe('cancelled');

      // TC25: Public rate limit on /tts/synthesize (limit=5/min in test config)
      let got429 = false;
      for (let i = 0; i < 8; i++) {
        const sr = await fetch(`${base}/tts/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Câu kiểm thử rate limit số ${i}` }),
        });
        if (sr.status === 429) {
          got429 = true;
          break;
        }
      }
      expect(got429).toBe(true);
    } finally {
      server.close();
    }
  });

  it('TC20 & TC21 — Server handles zero API keys & all providers unavailable safely without crashing', async () => {
    const emptyCfg = makeConfig({
      geminiApiKey: '',
      vbeeApiToken: '',
      vbeeAppId: '',
      azureSpeechKey: '',
      edgeUnofficialEnabled: false,
      fptEnabled: false,
      fptApiKey: '',
    });
    const ttsService = new MultiProviderTtsService({ getConfig: () => emptyCfg });
    expect(ttsService.hasAnyAvailableProvider()).toBe(false);
    const statuses = ttsService.listProviderStatuses();
    expect(statuses.length).toBeGreaterThanOrEqual(4);
    expect(statuses.every((s) => s.available === false)).toBe(true);

    await expect(
      ttsService.synthesizeWithFallback({ text: 'Kiểm tra không có API key' })
    ).rejects.toThrow(TtsProviderError);
  });
});
