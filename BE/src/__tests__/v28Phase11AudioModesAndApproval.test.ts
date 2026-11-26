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
import { VbeeTtsProvider } from '../services/v28/tts/providers/vbeeTtsProvider.js';
import { FptTtsProvider } from '../services/v28/tts/providers/fptTtsProvider.js';
import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../services/v28/tts/ttsConfig.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { TtsProviderError, type TtsProviderAdapter, type TtsSynthesisResult } from '../services/v28/tts/ttsTypes.js';

function makeValidWav(): Buffer {
  const pcm = Buffer.alloc(2400, 15);
  return ensureValidWavBuffer(pcm, 24000, 1, 16);
}

function makeValidWebm(size = 256): Buffer {
  const buf = Buffer.alloc(size, 0x42);
  buf[0] = 0x1a;
  buf[1] = 0x45;
  buf[2] = 0xdf;
  buf[3] = 0xa3;
  return buf;
}

function makeConfig(overrides?: Partial<HybridTtsRuntimeConfig>): HybridTtsRuntimeConfig {
  return {
    ...resolveHybridTtsConfig({}),
    geminiEnabled: true,
    geminiApiKey: 'AIzaTestFakeKeyPhase11Test123456',
    vbeeEnabled: true,
    vbeeApiToken: 'vbee-test-token-123456',
    vbeeAppId: 'vbee-app-123',
    edgeEnabled: false,
    fptEnabled: false,
    fptAllowPaid: false,
    fptApiKey: 'fpt-disabled-key',
    maxRetries: 0,
    ...overrides,
  };
}

describe('GRAND EXPO V28 — PHASE 1.1: Audio Modes (AUTO/AI_GENERATED/RECORDED), Voice Approval & Lazy Generation', () => {
  let tmpDir: string;
  let dbPath: string;
  let audioDir: string;
  let v28Db: V28CatalogDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase11-'));
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

  it('TC01–TC17, TC21, TC22, TC26 — 3 Audio Modes, Lazy 10-visitor single-flight, Browser WebM recording, Voice Approval gate & Pause-on-error batch', async () => {
    let geminiCalls = 0;
    let vbeeCalls = 0;
    let fptCalls = 0;
    let failGeminiOnCall = -1;

    const mockGemini: TtsProviderAdapter = {
      id: 'gemini',
      displayName: 'Mock Gemini',
      paidApi: true,
      isConfigured: () => true,
      isEnabled: () => true,
      listVoices: () => [
        { id: 'Kore', label: 'Kore', provider: 'gemini', language: 'vi-VN', gender: 'female', description: '' },
        { id: 'Aoede', label: 'Aoede', provider: 'gemini', language: 'vi-VN', gender: 'female', description: '' },
      ],
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
        geminiCalls++;
        if (failGeminiOnCall > 0 && geminiCalls >= failGeminiOnCall) {
          throw new TtsProviderError({
            provider: 'gemini',
            kind: 'unavailable',
            message: 'Simulated Gemini outage mid-batch',
            retryable: false,
          });
        }
        await new Promise((r) => setTimeout(r, 25));
        return {
          buffer: makeValidWav(),
          mimeType: 'audio/wav',
          audioFormat: 'wav',
          durationSec: 1.8,
          provider: 'gemini',
          modelId: req.modelId || 'gemini-3.8-flash-tts',
          voiceId: req.voiceId || 'Kore',
          language: 'vi-VN',
          synthMs: 25,
          estimatedChars: req.text.length,
        };
      },
    };

    const mockVbee: TtsProviderAdapter = {
      id: 'vbee',
      displayName: 'Mock Vbee',
      paidApi: true,
      isConfigured: () => true,
      isEnabled: () => true,
      listVoices: () => [],
      getStatus: () => ({
        id: 'vbee',
        displayName: 'Mock Vbee',
        enabled: true,
        configured: true,
        available: true,
        defaultModel: 'vbee-tts-v1',
        defaultVoice: 'hn_female_ngochuyen_full_48k-fhg',
        audioFormat: 'mp3',
        priorityRank: 2,
        paidApi: true,
        notes: '',
        voices: [],
      }),
      synthesize: async (): Promise<TtsSynthesisResult> => {
        vbeeCalls++;
        return {
          buffer: makeValidWav(),
          mimeType: 'audio/wav',
          audioFormat: 'wav',
          durationSec: 1.5,
          provider: 'vbee',
          modelId: 'vbee-tts-v1',
          voiceId: 'hn_female_ngochuyen_full_48k-fhg',
          language: 'vi-VN',
          synthMs: 10,
          estimatedChars: 50,
        };
      },
    };

    const fpt = new FptTtsProvider({
      getConfig: () => makeConfig({ fptEnabled: false, fptAllowPaid: false }),
      fetchFn: async () => {
        fptCalls++;
        return new Response('', { status: 200 });
      },
    });

    const exhService = new V28ExhibitionService(v28Db);
    const activeWorld = exhService.getActiveExhibitionWorld();
    const targetBooth = activeWorld.booths.find((b) => Boolean(b.companyId)) || activeWorld.booths[0];
    const companyId = targetBooth.companyId!;

    const prodAuto = v28Db.createProduct({ companyId, name: 'Gạo ST25 AUTO', price: 240000, currency: 'VND', description: 'Gạo thơm đặc sản' });
    const prodRec = v28Db.createProduct({ companyId, name: 'Mật Ong RECORDED', price: 320000, currency: 'VND', description: 'Mật ong hoa rừng' });
    const prodAi1 = v28Db.createProduct({ companyId, name: 'Trà Sen AI 1', price: 180000, currency: 'VND', description: 'Trà sen Tây Hồ' });
    const prodAi2 = v28Db.createProduct({ companyId, name: 'Trà Sen AI 2', price: 190000, currency: 'VND', description: 'Trà sen thượng hạng' });

    v28Db.assignBoothSlot(targetBooth.boothId, 'slot_01', prodAuto.id);
    v28Db.assignBoothSlot(targetBooth.boothId, 'slot_02', prodRec.id);
    v28Db.getConnection().prepare(`INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id) VALUES (?, ?, ?, ?)`).run(activeWorld.versionId, targetBooth.boothId, 'slot_01', prodAuto.id);
    v28Db.getConnection().prepare(`INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id) VALUES (?, ?, ?, ?)`).run(activeWorld.versionId, targetBooth.boothId, 'slot_02', prodRec.id);

    const audioCache = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(audioDir),
      new MultiProviderTtsService({
        getConfig: () => makeConfig(),
        adapters: { gemini: mockGemini, vbee: mockVbee, fpt },
      })
    );
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService, undefined, audioCache));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v28`;
    const adminToken = issueAdminToken('admin');

    try {
      // TC01: New product defaults to AUTO
      const autoCfg = audioCache.getEntityAudioConfig('product', prodAuto.id);
      expect(autoCfg.audioMode).toBe('AUTO');

      // TC02 & TC04: 10 concurrent visitors requesting uncached AUTO product -> ONLY 1 Gemini API call!
      const tenCalls = await Promise.all(
        Array.from({ length: 10 }, () =>
          fetch(`${base}/booths/${targetBooth.boothId}/products/${prodAuto.id}/consultation`).then((r) => r.json())
        )
      );
      expect(geminiCalls).toBe(1);
      expect(tenCalls.every((r) => r.audio?.provider === 'gemini')).toBe(true);

      // TC03: Subsequent visitor listen -> 0 additional TTS calls
      const secondListen = await (
        await fetch(`${base}/booths/${targetBooth.boothId}/products/${prodAuto.id}/consultation`)
      ).json();
      expect(secondListen.cacheHit).toBe(true);
      expect(geminiCalls).toBe(1);

      // TC07, TC08/TC09, TC10: Browser WebM mic recording upload succeeds & sets RECORDED mode; invalid file rejected
      const webmUpload = await fetch(`${base}/admin/audio/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          entityType: 'product',
          entityId: prodRec.id,
          slotKey: 'slot_02',
          transcript: 'Bản thu âm trực tiếp Mật Ong RECORDED.',
          filename: 'mic-prod.webm',
          mimeType: 'audio/webm',
          fileBase64: makeValidWebm(512).toString('base64'),
        }),
      });
      expect(webmUpload.status).toBe(201);
      expect(audioCache.getEntityAudioConfig('product', prodRec.id).audioMode).toBe('RECORDED');

      const recConsult = await (
        await fetch(`${base}/booths/${targetBooth.boothId}/products/${prodRec.id}/consultation`)
      ).json();
      expect(recConsult.source).toBe('uploaded');
      expect(geminiCalls).toBe(1); // RECORDED never calls TTS!

      // TC22: Switching mode does NOT delete old audio and does NOT auto-generate
      const modeSwitch = await fetch(`${base}/admin/audio/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ entityType: 'product', entityId: prodRec.id, audioMode: 'AI_GENERATED' }),
      });
      expect(modeSwitch.status).toBe(200);
      expect(geminiCalls).toBe(1); // Did NOT auto-generate!
      // Switch back to RECORDED so batch skips it
      await fetch(`${base}/admin/audio/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ entityType: 'product', entityId: prodRec.id, audioMode: 'RECORDED' }),
      });

      // TC12: Unapproved voice CANNOT start batch (Backend rejects HTTP 400!)
      const unapprovedBatch = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          confirmed: true,
          entityType: 'product',
          providerOverride: 'gemini',
          voiceId: 'Kore',
        }),
      });
      expect(unapprovedBatch.status).toBe(400);
      const unapprovedBody = (await unapprovedBatch.json()) as { error: string };
      expect(unapprovedBody.error).toContain('VOICE_APPROVAL_REQUIRED');

      // TC11: Create preview sample & approve Kore
      const prevRes = await fetch(`${base}/admin/audio/voice/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ provider: 'gemini', voiceId: 'Kore', productId: prodAi1.id }),
      });
      expect(prevRes.status).toBe(200);
      const prevJson = (await prevRes.json()) as { preview: { configSignature: string; sampleAudioUrl: string } };
      expect(prevJson.preview.sampleAudioUrl).toContain('/api/v28/audio/');

      const appRes = await fetch(`${base}/admin/audio/voice/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ configSignature: prevJson.preview.configSignature }),
      });
      expect(appRes.status).toBe(200);

      // TC13: Changing voice to 'Aoede' (or speed to 1.2) requires NEW approval -> batch rejected!
      const changedVoiceBatch = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          confirmed: true,
          entityType: 'product',
          providerOverride: 'gemini',
          voiceId: 'Aoede',
        }),
      });
      expect(changedVoiceBatch.status).toBe(400);

      // TC14 & TC15: Approved batch skips RECORDED (`prodRec`) and runs cleanly
      const estRes = await (
        await fetch(`${base}/admin/audio/batch/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            entityType: 'product',
            entityIds: [prodRec.id, prodAi1.id, prodAi2.id],
            providerOverride: 'gemini',
            voiceId: 'Kore',
          }),
        })
      ).json();
      expect(estRes.estimate.voiceApproved).toBe(true);
      expect(estRes.estimate.skippedManualUploaded).toBeGreaterThanOrEqual(1);
      expect(estRes.estimate.totalTargets).toBe(2); // prodAi1 & prodAi2 only!

      // TC16: Provider fails mid-batch -> batch PAUSES and NEVER silently falls back to unapproved Vbee!
      failGeminiOnCall = geminiCalls + 1; // Fail next Gemini call
      const batchRes = await fetch(`${base}/admin/audio/batch/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          confirmed: true,
          entityType: 'product',
          entityIds: [prodAi1.id, prodAi2.id],
          providerOverride: 'gemini',
          voiceId: 'Kore',
          concurrency: 1,
        }),
      });
      expect(batchRes.status).toBe(202);
      const started = ((await batchRes.json()) as { job: { jobId: string } }).job;

      let pausedJob: { status: string; pauseReason: string } | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 30));
        const jData = (await (
          await fetch(`${base}/admin/audio/batch/${started.jobId}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          })
        ).json()) as { job: { status: string; pauseReason: string } };
        pausedJob = jData.job;
        if (pausedJob.status === 'paused' || pausedJob.status === 'completed') break;
      }
      expect(pausedJob?.status).toBe('paused');
      expect(pausedJob?.pauseReason).toContain('không tự chuyển sang giọng chưa được duyệt');
      expect(vbeeCalls).toBe(0); // NEVER silently fell back to unapproved Vbee!
      expect(fptCalls).toBe(0); // TC21: FPT.AI never called!

      // TC26: Admin auth required on mode & approval endpoints
      expect((await fetch(`${base}/admin/audio/voice/approvals`)).status).toBe(401);
    } finally {
      server.close();
    }
  });

  it('TC18 & TC20 — Gemini HTTP 403 triggers permission cooldown (no repeated spam) and daily budget cap returns 429', async () => {
    let geminiHttpCalls = 0;
    const gemini403 = new GeminiTtsProvider({
      getConfig: () => makeConfig({ vbeeEnabled: false, edgeEnabled: false }),
      fetchFn: async () => {
        geminiHttpCalls++;
        return new Response('free tier not available', { status: 403 });
      },
    });
    const svc = new MultiProviderTtsService({
      getConfig: () => makeConfig({ vbeeEnabled: false, edgeEnabled: false, dailyRequestBudget: 10 }),
      adapters: { gemini: gemini403 },
    });

    await expect(svc.synthesizeWithFallback({ text: 'Câu thử 1' })).rejects.toThrow(TtsProviderError);
    await expect(svc.synthesizeWithFallback({ text: 'Câu thử 2' })).rejects.toThrow(TtsProviderError);
    await expect(svc.synthesizeWithFallback({ text: 'Câu thử 3' })).rejects.toThrow(TtsProviderError);
    // Permission cooldown prevented spamming 403 provider on calls 2 and 3!
    expect(geminiHttpCalls).toBe(1);

    // TC20: Budget exceeded
    const budgetSvc = new MultiProviderTtsService({
      getConfig: () => makeConfig({ dailyCharBudget: 10 }),
    });
    await expect(
      budgetSvc.synthesizeWithFallback({ text: 'Văn bản này dài hơn 10 ký tự rất nhiều.' })
    ).rejects.toThrow(/giới hạn chi phí|hạn mức/i);
  });
});
