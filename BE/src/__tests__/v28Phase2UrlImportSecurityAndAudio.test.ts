import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { createV28ApiRoutes, sanitizePlainText } from '../routes/v28Routes.js';
import {
  V28AudioCacheService,
  LocalAudioStorageAdapter,
  type AudioStorageAdapter,
} from '../services/v28/audioCacheService.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { extractProductFromHtml } from '../integrations/productAdapter.js';

describe('V28 PHASE 2 — URL Import Security (SSRF/PrivateIP/Scheme/Ownership/XSS/RateLimit) & Audio Cache Lifecycle', () => {
  it('enforces auth, scheme, SSRF/Private IP, cross-company booth ownership, XSS stripping & rate limiting on /api/v28/imports/url', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use('/api/v28', createV28ApiRoutes(v28Db));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v28`;
    const token = issueAdminToken('admin-p2-sec');

    try {
      const compA = v28Db.createCompany({ name: 'Alpha Tech' });
      const compB = v28Db.createCompany({ name: 'Beta Corp' });
      const exhSvc = new V28ExhibitionService(v28Db);
      const exh = exhSvc.createExhibition({ name: 'Sec Test Expo', targetBoothCount: 6 });
      const draft = exhSvc.getVersionDetail(exh.latestDraftVersionId!)!;
      const boothOwnedByB = draft.booths[0].boothId;
      v28Db.getConnection().prepare('UPDATE booths SET company_id = ? WHERE id = ?').run(compB.id, boothOwnedByB);

      // 1. Unauthenticated blocked (401)
      const unauthRes = await fetch(`${base}/imports/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: compA.id, url: 'https://example.com/item' }),
      });
      expect(unauthRes.status).toBe(401);

      const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // 2. Cross-company booth ownership blocked (403)
      const crossRes = await fetch(`${base}/imports/url`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          companyId: compA.id,
          boothId: boothOwnedByB,
          url: 'https://example.com/item',
        }),
      });
      expect(crossRes.status).toBe(403);

      // 3. SSRF, Private IPs & invalid schemes all blocked (400)
      const blockedUrls = [
        'file:///etc/passwd',
        'javascript:alert(1)',
        'http://127.0.0.1:4000/api/admin/login',
        'http://localhost:5173/',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/admin',
        'http://192.168.1.1/router',
        'http://[::1]:4000/',
      ];
      for (const badUrl of blockedUrls) {
        const res = await fetch(`${base}/imports/url`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ companyId: compA.id, url: badUrl, saveToCatalog: false }),
        });
        expect(res.status, `expected 400 for ${badUrl}`).toBe(400);
      }

      // 4. XSS stripping in HTML extractor
      const maliciousHtml = `
        <html><head>
          <title>Smart Lamp &lt;script&gt;alert(1)&lt;/script&gt;</title>
          <meta property="og:description" content="Clean lamp <script>evil()</script> with warranty" />
        </head><body><h1>Smart Lamp</h1></body></html>
      `;
      const extracted = extractProductFromHtml(maliciousHtml, 'https://shop.example.com/lamp');
      expect(sanitizePlainText(extracted.name).toLowerCase()).not.toContain('<script');
      expect(sanitizePlainText(extracted.description || '').toLowerCase()).not.toContain('<script');

      // 5. Rate limit triggers 429 after 15 calls in 60s window
      let saw429 = false;
      for (let i = 0; i < 12; i++) {
        const r = await fetch(`${base}/imports/url`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ companyId: compA.id, url: 'http://127.0.0.1/', saveToCatalog: false }),
        });
        if (r.status === 429) {
          saw429 = true;
          break;
        }
      }
      expect(saw429).toBe(true);
    } finally {
      server.close();
      v28Db.close();
    }
  });

  it('tracks Pending/Ready/Failed audio states, supports safe retry recovery, and reports honest Local Fallback provider', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p2-audio-'));
    const realStorage = new LocalAudioStorageAdapter(tmpDir);
    let failOnce = true;

    const flakyStorage: AudioStorageAdapter = {
      driverName: 'flaky_test_fs',
      async put(key, buf) {
        if (failOnce) {
          failOnce = false;
          throw new Error('Simulated disk I/O error');
        }
        return realStorage.put(key, buf);
      },
      get: (k) => realStorage.get(k),
      exists: (k) => realStorage.exists(k),
    };

    try {
      const exhSvc = new V28ExhibitionService(v28Db);
      const exh = exhSvc.createExhibition({ name: 'Audio Retry Expo', targetBoothCount: 6 });
      const pub = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId!);
      const booth = pub.booths[0];

      const audioSvc = new V28AudioCacheService(v28Db, flakyStorage);

      // First attempt fails on storage put -> recorded as 'failed'
      await expect(audioSvc.getOrPrepareBoothAudioPack(booth)).rejects.toThrow('Simulated disk I/O error');
      const overviewAfterFail = audioSvc.getAdminAudioOverview();
      expect(overviewAfterFail.failedCount).toBe(1);
      expect(overviewAfterFail.liveGeminiTtsEnabled).toBe(false);
      expect(overviewAfterFail.providerLabel).toContain('LIVE GEMINI TTS NOT VERIFIED');

      // Safe retry clears failed record and succeeds -> ready!
      const retried = await audioSvc.retryBoothAudio(booth);
      expect(retried.clips.length).toBeGreaterThanOrEqual(2);
      expect(retried.clips.every((c) => c.status === 'ready')).toBe(true);

      const overviewAfterRetry = audioSvc.getAdminAudioOverview();
      expect(overviewAfterRetry.failedCount).toBe(0);
      expect(overviewAfterRetry.readyCount).toBeGreaterThanOrEqual(2);

      // Second call hits cache 100% (ZERO regeneration!)
      const second = await audioSvc.getOrPrepareBoothAudioPack(booth);
      expect(second.cacheHits).toBe(retried.clips.length);
      expect(second.generatedCount).toBe(0);
    } finally {
      v28Db.close();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
