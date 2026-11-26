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
} from '../services/v28/audioCacheService.js';
import { MultiProviderTtsService } from '../services/v28/tts/multiProviderTtsService.js';
import { GeminiTtsProvider } from '../services/v28/tts/providers/geminiTtsProvider.js';
import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from '../services/v28/tts/ttsConfig.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { TtsProviderError } from '../services/v28/tts/ttsTypes.js';

function makeConfig(overrides?: Partial<HybridTtsRuntimeConfig>): HybridTtsRuntimeConfig {
  return {
    ...resolveHybridTtsConfig({}),
    geminiEnabled: true,
    geminiApiKey: 'AIzaTestFakeKeyPhase12Health12345',
    vbeeEnabled: true,
    vbeeApiToken: '',
    vbeeAppId: '',
    edgeEnabled: true,
    azureSpeechKey: '',
    edgeUnofficialEnabled: false,
    fptEnabled: false,
    fptAllowPaid: false,
    maxRetries: 0,
    ...overrides,
  };
}

describe('GRAND EXPO V28 — PHASE 1.2: Provider Health States, 403 Cooldown, No Duplicate Failed Rows & Company Scope', () => {
  let tmpDir: string;
  let dbPath: string;
  let audioDir: string;
  let v28Db: V28CatalogDatabase;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase12-'));
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

  it('TC01, TC02, TC03 — Configured unverified provider NEVER shows ready_verified; HTTP 403 transitions to permission_denied + circuit breaker blocks repeated spam', async () => {
    let httpCalls = 0;
    const gemini403 = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => {
        httpCalls++;
        return new Response('The Gemini API free tier is not available for this project.', { status: 403 });
      },
    });
    const svc = new MultiProviderTtsService({
      getConfig: () => makeConfig(),
      adapters: { gemini: gemini403 },
    });

    // TC02: Before any live call, status must be configured_unverified (NOT ready_verified!)
    const before = svc.listProviderStatuses().find((p) => p.id === 'gemini');
    expect(before?.healthState).toBe('configured_unverified');
    expect(before?.healthLabel).toContain('chưa kiểm chứng');

    // TC01: First call triggers HTTP 403 -> transitions immediately to permission_denied
    await expect(svc.synthesizeWithFallback({ text: 'Test 403 #1' })).rejects.toThrow(TtsProviderError);
    const after = svc.listProviderStatuses().find((p) => p.id === 'gemini');
    expect(after?.healthState).toBe('permission_denied');
    expect(after?.available).toBe(false);
    expect(after?.cooldownRemainingSec).toBeGreaterThan(0);

    // TC03: Subsequent calls within cooldown do NOT spam Gemini HTTP endpoint
    await expect(svc.synthesizeWithFallback({ text: 'Test 403 #2' })).rejects.toThrow(TtsProviderError);
    await expect(svc.synthesizeWithFallback({ text: 'Test 403 #3' })).rejects.toThrow(TtsProviderError);
    expect(httpCalls).toBe(1);
  });

  it('TC17 & TC19 — Prevents duplicate failed records on repeated errors & scopes Admin audio product list strictly to active owner company', async () => {
    const gemini403 = new GeminiTtsProvider({
      getConfig: () => makeConfig(),
      fetchFn: async () => new Response('permission denied', { status: 403 }),
    });
    const ttsSvc = new MultiProviderTtsService({
      getConfig: () => makeConfig(),
      adapters: { gemini: gemini403 },
    });
    const audioCache = new V28AudioCacheService(v28Db, new LocalAudioStorageAdapter(audioDir), ttsSvc);
    const exhService = new V28ExhibitionService(v28Db);

    // Create an agricultural company and publish an exhibition owned by it (separate from seeded demo companies)
    const agriCompany = v28Db.createCompany({ name: 'Con Đường Nông Sản', category: 'Food' });
    const agriProd = v28Db.createProduct({
      companyId: agriCompany.id,
      name: 'Gạo ST25 Đặc Sản',
      price: 245000,
      currency: 'VND',
      description: 'Nông sản sạch',
    });
    const otherCompany = v28Db.createCompany({ name: 'Solar Demo Co', category: 'Energy' });
    const solarProd = v28Db.createProduct({
      companyId: otherCompany.id,
      name: 'Tấm Pin Mặt Trời 500W',
      price: 3500000,
      currency: 'VND',
      description: 'Thiết bị năng lượng cũ',
    });

    // TC19: Filtering by agriCompany excludes solarProd completely without deleting solarProd!
    const scoped = audioCache.listAdminAudioItems({
      entityType: 'product',
      companyId: agriCompany.id,
      limit: 50,
    });
    expect(scoped.items.some((i) => i.entityId === agriProd.id)).toBe(true);
    expect(scoped.items.some((i) => i.entityId === solarProd.id)).toBe(false);
    // Old product still intact in DB!
    expect(v28Db.getProductById(solarProd.id)).not.toBeNull();

    // TC17: Repeated failed ensureCachedAudio calls for same entity+slot+hash do NOT create duplicate failed rows
    process.env.V28_ENABLE_LIVE_AI = 'true';
    try {
      await expect(
        audioCache.ensureCachedAudio({
          entityType: 'product',
          entityId: agriProd.id,
          slotKey: 'intro',
          transcript: 'Sản phẩm Gạo ST25',
          allowLiveSynthesis: true,
        })
      ).rejects.toThrow();
      await expect(
        audioCache.ensureCachedAudio({
          entityType: 'product',
          entityId: agriProd.id,
          slotKey: 'intro',
          transcript: 'Sản phẩm Gạo ST25',
          allowLiveSynthesis: true,
        })
      ).rejects.toThrow();

      const failedRows = v28Db
        .getConnection()
        .prepare("SELECT COUNT(*) as c FROM audio_assets WHERE entity_id = ? AND status = 'failed'")
        .get(agriProd.id) as { c: number };
      expect(failedRows.c).toBe(1);
    } finally {
      delete process.env.V28_ENABLE_LIVE_AI;
    }

    // Verify HTTP endpoint /admin/audio/providers/check requires admin auth & returns honest status
    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhService, undefined, audioCache));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v28`;
    const adminToken = issueAdminToken('admin');
    try {
      const checkRes = await fetch(`${base}/admin/audio/providers/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ provider: 'vbee', runLiveSynthesis: false }),
      });
      expect(checkRes.status).toBe(200);
      const checkJson = (await checkRes.json()) as { ok: boolean; status: { healthState: string } };
      expect(checkJson.ok).toBe(false);
      expect(checkJson.status.healthState).toBe('unconfigured');
    } finally {
      server.close();
    }
  });
});
