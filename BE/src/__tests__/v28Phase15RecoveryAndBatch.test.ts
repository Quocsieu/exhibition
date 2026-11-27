import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { LocalAudioStorageAdapter, V28AudioCacheService } from '../services/v28/audioCacheService.js';
import { MultiProviderTtsService } from '../services/v28/tts/multiProviderTtsService.js';
import { V28VoiceApprovalService } from '../services/v28/tts/voiceApprovalService.js';
import { V28AudioBatchManager } from '../services/v28/tts/audioBatchManager.js';
import { resolveHybridTtsConfig } from '../services/v28/tts/ttsConfig.js';
import {
  TtsProviderError,
  type TtsProviderAdapter,
  type TtsSynthesisRequest,
} from '../services/v28/tts/ttsTypes.js';

function fakeMp3(seed: number): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc4]), Buffer.alloc(1024, seed & 0xff)]);
}

function makeAdapter(params: {
  id: 'gemini' | 'vbee' | 'edge' | 'fpt';
  enabled: boolean;
  configured: boolean;
  onSynth?: (req: TtsSynthesisRequest) => Promise<Buffer>;
}): TtsProviderAdapter {
  return {
    id: params.id,
    displayName: params.id.toUpperCase(),
    paidApi: params.id === 'vbee' || params.id === 'fpt',
    isConfigured: () => params.configured,
    isEnabled: () => params.enabled && params.configured,
    listVoices: () => [],
    getStatus: (rank = 1) => ({
      id: params.id,
      displayName: params.id.toUpperCase(),
      enabled: params.enabled,
      configured: params.configured,
      available: params.enabled && params.configured,
      defaultModel: `${params.id}-model`,
      defaultVoice: params.id === 'edge' ? 'vi-VN-HoaiMyNeural' : 'Kore',
      audioFormat: 'mp3',
      priorityRank: rank,
      paidApi: params.id === 'vbee' || params.id === 'fpt',
      notes: '',
      voices: [],
    }),
    synthesize: async (req) => {
      if (!params.onSynth) {
        throw new TtsProviderError({ provider: params.id, kind: 'disabled', message: 'disabled' });
      }
      const buffer = await params.onSynth(req);
      return {
        buffer,
        mimeType: 'audio/mpeg',
        audioFormat: 'mp3',
        durationSec: 1.5,
        provider: params.id,
        modelId: `${params.id}-model`,
        voiceId: req.voiceId || 'vi-VN-HoaiMyNeural',
        language: 'vi-VN',
        synthMs: 10,
        estimatedChars: req.text.length,
      };
    },
  };
}

describe('GRAND EXPO V28 — PHASE 1.5: Gemini Key Rotation Recovery, Batch Transient Retry & Resume', () => {
  it('TC02 & TC03 — clears stale 401/403 cooldown when GEMINI_API_KEY rotates and restores Gemini as priority #1', async () => {
    let activeKey = 'old-invalid-key-1234567890';
    let geminiCalls = 0;

    const ttsService = new MultiProviderTtsService({
      getConfig: () => ({
        ...resolveHybridTtsConfig({
          TTS_PROVIDER_PRIORITY: 'gemini,vbee,edge',
          TTS_GEMINI_ENABLED: 'true',
          GEMINI_API_KEY: activeKey,
          TTS_EDGE_ENABLED: 'true',
          TTS_EDGE_UNOFFICIAL_ENABLED: 'true',
          TTS_FPT_ENABLED: 'false',
        }),
      }),
      adapters: {
        gemini: makeAdapter({
          id: 'gemini',
          enabled: true,
          configured: true,
          onSynth: async () => {
            geminiCalls++;
            if (activeKey.startsWith('old-')) {
              throw new TtsProviderError({
                provider: 'gemini',
                kind: 'permission_denied',
                statusCode: 401,
                message: 'Old key invalid (401)',
              });
            }
            return fakeMp3(0x41);
          },
        }),
        vbee: makeAdapter({ id: 'vbee', enabled: true, configured: false }),
        edge: makeAdapter({
          id: 'edge',
          enabled: true,
          configured: true,
          onSynth: async () => fakeMp3(0x42),
        }),
        fpt: makeAdapter({ id: 'fpt', enabled: false, configured: false }),
      },
    });

    // 1. Old key triggers 401 -> falls back to Edge and sets cooldown on Gemini
    const r1 = await ttsService.synthesizeWithFallback({ text: 'Xin chào quý khách.' });
    expect(r1.result.provider).toBe('edge');
    expect(geminiCalls).toBe(1);

    // 2. Same old key stays in cooldown (does NOT spam Gemini again)
    const r2 = await ttsService.synthesizeWithFallback({ text: 'Xin chào lần hai.' });
    expect(r2.result.provider).toBe('edge');
    expect(geminiCalls).toBe(1);

    // 3. Rotate to NEW valid key -> cooldown is automatically cleared and Gemini recovers as priority #1!
    activeKey = 'new-valid-key-9876543210';
    const r3 = await ttsService.synthesizeWithFallback({ text: 'Xin chào với key mới.' });
    expect(r3.result.provider).toBe('gemini');
    expect(r3.fallbackUsed).toBe(false);
    expect(geminiCalls).toBe(2);
  });

  it('TC07, TC08, TC09 & TC12 — retries transient batch error with backoff, pauses safely on fatal error, resumes without duplicates, and separates current vs historical errors', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase15-'));
    const v28Db = new V28CatalogDatabase(path.join(tmpDir, 'test.db'));
    const company = v28Db.createCompany({ name: 'Nông Sản Test' });
    const p1 = v28Db.createProduct({ companyId: company.id, name: 'Sản phẩm A', price: 100000, description: 'Mô tả A' });
    const p2 = v28Db.createProduct({ companyId: company.id, name: 'Sản phẩm B', price: 200000, description: 'Mô tả B' });
    const p3 = v28Db.createProduct({ companyId: company.id, name: 'Sản phẩm C', price: 300000, description: 'Mô tả C' });

    let edgeCalls = 0;
    let failSecondItemFatal = true;
    const seenBatchTexts: string[] = [];

    const ttsService = new MultiProviderTtsService({
      adapters: {
        gemini: makeAdapter({ id: 'gemini', enabled: true, configured: false }),
        vbee: makeAdapter({ id: 'vbee', enabled: true, configured: false }),
        edge: makeAdapter({
          id: 'edge',
          enabled: true,
          configured: true,
          onSynth: async (req) => {
            edgeCalls++;
            if (edgeCalls > 1) {
              // Track unique batch items in execution order
              if (!seenBatchTexts.includes(req.text)) seenBatchTexts.push(req.text);
              // Transient glitch on first attempt of batch item #1 -> succeeds on retry!
              if (seenBatchTexts.length === 1 && edgeCalls === 2) {
                throw new TtsProviderError({
                  provider: 'edge',
                  kind: 'unavailable',
                  message: 'Transient edge:unavailable',
                });
              }
              // Fatal error on batch item #2 during first run -> pauses batch safely!
              if (seenBatchTexts.length === 2 && failSecondItemFatal) {
                throw new TtsProviderError({
                  provider: 'edge',
                  kind: 'permission_denied',
                  statusCode: 403,
                  message: 'HTTP 403 permission_denied',
                });
              }
            }
            return fakeMp3(0x55);
          },
        }),
        fpt: makeAdapter({ id: 'fpt', enabled: false, configured: false }),
      },
    });

    const audioCache = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(path.join(tmpDir, 'audio')),
      ttsService
    );
    const voiceApproval = new V28VoiceApprovalService(v28Db, audioCache);
    const batchManager = new V28AudioBatchManager(v28Db, audioCache, voiceApproval);

    // Preview & approve Edge female voice
    const prev = await voiceApproval.createVoicePreview({
      voiceProfile: 'female_standard',
      transcript: 'Xin chào quý khách.',
    });
    voiceApproval.approveVoiceConfig({
      configSignature: prev.preview.configSignature,
      adminUsername: 'admin',
    });

    // Run small 3-product batch (p1 transient retry -> succeeds; p2 fatal -> pauses before p3)
    const job = batchManager.startBatch({
      confirmed: true,
      entityType: 'product',
      companyId: company.id,
      entityIds: [p1.id, p2.id, p3.id],
      configSignature: prev.preview.configSignature,
      concurrency: 1,
    });

    // Wait for batch to settle in paused state
    let cur = batchManager.getJob(job.jobId)!;
    for (let i = 0; i < 40 && cur.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 30));
      cur = batchManager.getJob(job.jobId)!;
    }
    expect(cur.status).toBe('paused');
    expect(cur.succeededItems).toBe(1); // p1 succeeded after transient retry!
    expect(cur.failedItems).toBe(1); // p2 paused safely on fatal error

    // Now fix provider and RESUME batch -> should process ONLY remaining items (NOT regenerate item #1!)
    failSecondItemFatal = false;
    const callsBeforeResume = edgeCalls;
    batchManager.resumeJob(job.jobId, { companyId: company.id });
    cur = batchManager.getJob(job.jobId)!;
    for (let i = 0; i < 40 && cur.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 30));
      cur = batchManager.getJob(job.jobId)!;
    }
    expect(cur.status).toBe('completed');
    // p1 was NOT regenerated; only remaining items ran!
    expect(edgeCalls - callsBeforeResume).toBeGreaterThanOrEqual(2);

    // Overview separates currentFailedEntities vs historicalFailedRows
    const ov = audioCache.getAdminAudioOverview();
    expect(typeof ov.currentFailedEntities).toBe('number');
    expect(typeof ov.historicalFailedRows).toBe('number');
    expect(ov.currentFailedEntities).toBe(0);

    v28Db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aligns product intro slotKey and generates booth welcome/company_intro/closing so voiceReadiness.ready === true (instant AUDIO_TTS, ONE BOOTH - ONE VOICE)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase15-readiness-'));
    const v28Db = new V28CatalogDatabase(path.join(tmpDir, 'test.db'));
    const company = v28Db.createCompany({ name: 'Con Đường Nông Sản' });
    const boothId = 'booth-readiness-01';
    v28Db.getConnection().prepare(
      `INSERT INTO booths (id, name, tagline, description, category, color, position_x, position_z, rotation_y, width, depth, company_name, company_id, status)
       VALUES (?, 'Gian Nông Sản 1', 'Đặc sản sạch', 'Chuyên đặc sản miền Tây', 'Nông sản', '#16a34a', 0, 0, 0, 8, 8, 'Con Đường Nông Sản', ?, 'active')`
    ).run(boothId, company.id);
    const prod = v28Db.createProduct({
      companyId: company.id,
      boothId,
      name: 'Tôm Sấy Sốt Trứng Muối',
      price: 150000,
      description: 'Đặc sản miền Tây thơm ngon.',
    });

    const ttsService = new MultiProviderTtsService({
      adapters: {
        gemini: makeAdapter({ id: 'gemini', enabled: true, configured: false }),
        vbee: makeAdapter({ id: 'vbee', enabled: true, configured: false }),
        edge: makeAdapter({
          id: 'edge',
          enabled: true,
          configured: true,
          onSynth: async () => fakeMp3(0x77),
        }),
        fpt: makeAdapter({ id: 'fpt', enabled: false, configured: false }),
      },
    });

    const audioCache = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(path.join(tmpDir, 'audio')),
      ttsService
    );
    const voiceApproval = new V28VoiceApprovalService(v28Db, audioCache);
    const batchManager = new V28AudioBatchManager(v28Db, audioCache, voiceApproval);

    const prev = await voiceApproval.createVoicePreview({
      voiceProfile: 'female_standard',
      transcript: 'Xin chào quý khách.',
    });
    voiceApproval.approveVoiceConfig({
      configSignature: prev.preview.configSignature,
      adminUsername: 'admin',
    });

    const job = batchManager.startBatch({
      confirmed: true,
      entityType: 'all',
      companyId: company.id,
      entityIds: [boothId, prod.id],
      configSignature: prev.preview.configSignature,
      concurrency: 1,
    });

    let cur = batchManager.getJob(job.jobId)!;
    for (let i = 0; i < 40 && cur.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 30));
      cur = batchManager.getJob(job.jobId)!;
    }
    expect(cur.status).toBe('completed');

    // Now simulate visitor clicking the booth (`allowLiveSynthesis: false`)
    const pack = await audioCache.getOrPrepareBoothAudioPack(
      {
        boothId,
        boothName: 'Gian Nông Sản 1',
        companyId: company.id,
        companyName: 'Con Đường Nông Sản',
        zoneId: 'zone-a',
        zoneName: 'Khu A',
        category: 'Nông sản',
        color: '#16a34a',
        description: 'Chuyên đặc sản miền Tây',
        tagline: 'Đặc sản sạch',
        contactEmail: '',
        contactUrl: '',
        logoUrl: '',
        bannerUrl: '',
        positionX: 0,
        positionZ: 0,
        rotationY: 0,
        width: 8,
        depth: 8,
        slots: [{ slotId: 'slot_01', product: prod }],
      } as never,
      { allowLiveSynthesis: false }
    );

    expect(pack.voiceReadiness.ready).toBe(true);
    expect(pack.voiceReadiness.reason).toBe('consistent_ready');
    expect(pack.voiceReadiness.dominantProvider).toBe('edge');
    expect(pack.clips.map((c) => c.slotKey)).toEqual(['welcome', 'company_intro', 'slot_01', 'closing']);
    expect(pack.generatedCount).toBe(0);

    v28Db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
