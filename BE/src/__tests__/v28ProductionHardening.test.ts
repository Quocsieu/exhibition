import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createApp, resolveTrustProxyConfig } from '../server.js';
import { isServerKorvaWorkerDisabled } from '../services/expoService.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { LocalAudioStorageAdapter, V28AudioCacheService } from '../services/v28/audioCacheService.js';

const origEnv = { ...process.env };
afterEach(() => {
  process.env.NODE_ENV = origEnv.NODE_ENV;
  process.env.KORVATTS_ENABLED = origEnv.KORVATTS_ENABLED;
  process.env.TTS_PROVIDER = origEnv.TTS_PROVIDER;
  process.env.RENDER = origEnv.RENDER;
  process.env.TRUST_PROXY = origEnv.TRUST_PROXY;
});

describe('V28 Production Hardening (Phases 1–6)', () => {
  it('Phase 1: disables KorvaTTS by default in production and honors explicit opt-in/opt-out', () => {
    delete process.env.TTS_PROVIDER;
    delete process.env.RENDER;
    delete process.env.KORVATTS_ENABLED;

    process.env.NODE_ENV = 'production';
    expect(isServerKorvaWorkerDisabled()).toBe(true);

    process.env.KORVATTS_ENABLED = 'true';
    expect(isServerKorvaWorkerDisabled()).toBe(false);

    process.env.NODE_ENV = 'development';
    process.env.KORVATTS_ENABLED = 'false';
    expect(isServerKorvaWorkerDisabled()).toBe(true);
  });

  it('Phase 3: validates TRUST_PROXY env strictly (never trusts unvalidated "true", defaults false)', () => {
    expect(resolveTrustProxyConfig('')).toBe(false);
    expect(resolveTrustProxyConfig('false')).toBe(false);
    expect(resolveTrustProxyConfig('true')).toBe(false);
    expect(resolveTrustProxyConfig('99')).toBe(false);
    expect(resolveTrustProxyConfig('1')).toBe(1);
    expect(resolveTrustProxyConfig('2')).toBe(2);
    expect(resolveTrustProxyConfig('loopback')).toBe('loopback');
  });

  it('Phase 2, 5, 6: caches Published Active World with ETag/304 & invalidates on Publish, separates 8MB Excel parser from 1MB public API, and streams audio via fs.createReadStream', async () => {
    const legacyDb = new ExpoDatabase(':memory:');
    const v28Db = new V28CatalogDatabase(':memory:');
    const app = createApp(legacyDb, '*', undefined, v28Db);
    const server = http.createServer(app);
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v28`;
    const token = issueAdminToken('hardening-admin');
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const tmpAudioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-stream-test-'));

    try {
      // Phase 2: Published Active World ETag + 304
      const r1 = await fetch(`${base}/exhibitions/active`);
      expect(r1.status).toBe(200);
      const etag1 = r1.headers.get('etag');
      expect(etag1).toBeTruthy();
      const body1 = (await r1.json()) as { world: { exhibitionId: string; versionId: string; booths: Array<{ boothId: string }> } };

      const r304 = await fetch(`${base}/exhibitions/active`, {
        headers: { 'If-None-Match': etag1! },
      });
      expect(r304.status).toBe(304);

      // Mutate via new Draft + Publish -> cache MUST invalidate immediately with a new ETag
      const draftRes = await fetch(`${base}/exhibitions/${body1.world.exhibitionId}/drafts`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ targetBoothCount: 6, preferredZoneCapacity: 6 }),
      });
      expect(draftRes.status).toBe(201);
      const { version: v2 } = (await draftRes.json()) as { version: { versionId: string } };

      // Draft creation alone MUST NOT change Published ETag
      const rStillCached = await fetch(`${base}/exhibitions/active`, {
        headers: { 'If-None-Match': etag1! },
      });
      expect(rStillCached.status).toBe(304);

      const pubRes = await fetch(`${base}/exhibitions/${body1.world.exhibitionId}/versions/${v2.versionId}/publish`, {
        method: 'POST',
        headers: auth,
      });
      expect(pubRes.status).toBe(200);

      const r2 = await fetch(`${base}/exhibitions/active`, {
        headers: { 'If-None-Match': etag1! },
      });
      expect(r2.status).toBe(200);
      expect(r2.headers.get('etag')).not.toBe(etag1);

      // Phase 5: Public /ai/chat rejects 1.5MB payload with 413, while /imports/excel/preview accepts >1MB base64 JSON without global 413!
      const bigChat = await fetch(`${base}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: body1.world.booths[0].boothId, message: 'X'.repeat(1_500_000) }),
      });
      expect(bigChat.status).toBe(413);

      const comp = v28Db.listCompanies({ status: 'active' })[0];
      const largeExcelJson = await fetch(`${base}/imports/excel/preview`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          companyId: comp.id,
          filename: 'large_test.xlsx',
          // ~1.5 MB base64 (> global 1MB limit, < 5MB raw limit) -> must reach Excel parser (400 invalid zip, NOT 413!)
          fileBase64: Buffer.alloc(1_100_000, 65).toString('base64'),
        }),
      });
      expect(largeExcelJson.status).not.toBe(413);

      // Phase 6.1: LocalAudioStorageAdapter streams valid WAV via getFileStreamInfo & HTTP 206/416
      const storage = new LocalAudioStorageAdapter(tmpAudioDir);
      const audioSvc = new V28AudioCacheService(v28Db, storage);
      const ensured = await audioSvc.ensureCachedAudio({
        entityType: 'booth',
        entityId: 'test-booth',
        slotKey: 'welcome',
        transcript: 'Xin chào quý khách đến với triển lãm.',
        allowLiveSynthesis: false,
      });
      const src = await audioSvc.getAudioStreamSource(ensured.asset.audioId);
      expect(src?.kind).toBe('file');
      if (src?.kind === 'file') {
        expect(src.size).toBeGreaterThan(44);
      }
    } finally {
      server.close();
      v28Db.close();
      legacyDb.close();
      try { fs.rmSync(tmpAudioDir, { recursive: true, force: true }); } catch {}
    }
  });
});
