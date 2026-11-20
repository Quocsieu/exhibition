import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  V28AudioCacheService,
  LocalAudioStorageAdapter,
  getConfiguredGeminiTtsModel,
  getConfiguredGeminiTtsVoice,
} from '../services/v28/audioCacheService.js';
import { V28AiConsultantService } from '../services/v28/aiConsultantService.js';

describe('V28 NPC AUDIO (GEMINI TTS PRE-GEN & CACHE) & AI CHAT', () => {
  it('supports pre-generation, cache hit, in-flight deduplication, content-hash versioning, restart persistence & stale pruning', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-npc-audio-'));
    const dbPath = path.join(tmpRoot, 'test_v28.db');
    const audioDir = path.join(tmpRoot, 'audio');

    let v28Db = new V28CatalogDatabase(dbPath);
    try {
      const exhSvc = new V28ExhibitionService(v28Db);
      const exh = exhSvc.createExhibition({ name: 'NPC Audio Test Expo', targetBoothCount: 6 });
      const pub = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId!);
      const booth = pub.booths[0];

      const storage = new LocalAudioStorageAdapter(audioDir);
      const audioSvc = new V28AudioCacheService(v28Db, storage);

      // Verify configurable model & voice defaults
      expect(getConfiguredGeminiTtsModel()).toBe('gemini-3.8-flash-tts');
      expect(getConfiguredGeminiTtsVoice()).toBe('Kore');

      // 1. First pre-generation -> creates welcome, company_intro, product slots, closing
      const first = await audioSvc.getOrPrepareBoothAudioPack(booth);
      expect(first.clips.some((c) => c.slotKey === 'welcome')).toBe(true);
      expect(first.clips.some((c) => c.slotKey === 'closing')).toBe(true);
      expect(first.clips.every((c) => c.status === 'ready')).toBe(true);
      expect(first.liveGeminiTtsEnabled).toBe(false);

      // 2. Second call -> 100% cache hits (0 regenerated!)
      const second = await audioSvc.getOrPrepareBoothAudioPack(booth);
      expect(second.cacheHits).toBe(first.clips.length);
      expect(second.generatedCount).toBe(0);

      // 3. Concurrent in-flight deduplication (5 parallel requests for same new text)
      const parallelResults = await Promise.all(
        Array.from({ length: 5 }, () =>
          audioSvc.ensureCachedAudio({
            entityType: 'booth',
            entityId: booth.boothId,
            slotKey: 'dedupe_test',
            transcript: 'Nội dung thử nghiệm chống tạo trùng đồng thời.',
          })
        )
      );
      expect(new Set(parallelResults.map((r) => r.asset.audioId)).size).toBe(1);
      expect(audioSvc.metrics.inFlightDeduplicated).toBeGreaterThanOrEqual(4);

      // 4. Content change -> creates new contentHash version
      const v1 = await audioSvc.ensureCachedAudio({
        entityType: 'booth',
        entityId: booth.boothId,
        slotKey: 'version_test',
        transcript: 'Phiên bản lời giới thiệu số 1.',
      });
      const v2 = await audioSvc.ensureCachedAudio({
        entityType: 'booth',
        entityId: booth.boothId,
        slotKey: 'version_test',
        transcript: 'Phiên bản lời giới thiệu số 2 đã cập nhật.',
      });
      expect(v1.asset.contentHash).not.toBe(v2.asset.contentHash);
      expect(v2.cacheHit).toBe(false);

      // 5. Stale cache pruning deletes superseded v1 but NEVER deletes active v2
      const pruned = await audioSvc.pruneStaleAudioCache(0);
      expect(pruned.deletedCount).toBeGreaterThanOrEqual(1);
      expect(await storage.exists(v2.asset.storageKey)).toBe(true);

      // 6. Restart persistence: close DB, reopen fresh instances -> 100% cache hits!
      v28Db.close();
      v28Db = new V28CatalogDatabase(dbPath);
      const restartedExhSvc = new V28ExhibitionService(v28Db);
      const restartedBooth = restartedExhSvc.getActiveExhibitionWorld().booths[0];
      const restartedAudioSvc = new V28AudioCacheService(v28Db, new LocalAudioStorageAdapter(audioDir));
      const afterRestart = await restartedAudioSvc.getOrPrepareBoothAudioPack(restartedBooth);
      expect(afterRestart.cacheHits).toBe(first.clips.length);
      expect(afterRestart.generatedCount).toBe(0);
    } finally {
      try { v28Db.close(); } catch {}
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    }
  });

  it('grounds AI Chat strictly to Booth & Company, blocks fabrication, enforces rate limit & never leaks API key', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    try {
      const exhSvc = new V28ExhibitionService(v28Db);
      const exh = exhSvc.createExhibition({ name: 'NPC Chat Test Expo', targetBoothCount: 6 });
      const pub = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId!);
      const booth = pub.booths[0];
      const aiSvc = new V28AiConsultantService(v28Db, exhSvc);

      // Grounded reply bound to booth
      const res = await aiSvc.chatWithBoothNpc({
        boothId: booth.boothId,
        userId: 'visitor-chat-1',
        message: 'Cho hỏi giá sản phẩm tại gian hàng này?',
      });
      expect(res.groundedBoothId).toBe(booth.boothId);
      expect(res.liveGeminiVerified).toBe(false);
      expect(res.provider).toBe('grounded_mock');
      expect(res.reply).not.toContain('AIza');

      // Asking about warranty/promo not in data -> honest "not available" response (no fabrication)
      const warrantyRes = await aiSvc.chatWithBoothNpc({
        boothId: booth.boothId,
        userId: 'visitor-chat-1',
        message: 'Sản phẩm có bảo hành 5 năm và giảm giá 50% không?',
      });
      expect(warrantyRes.groundedBoothId).toBe(booth.boothId);
      expect(warrantyRes.reply.toLowerCase()).not.toContain('giảm giá 50%');

      // Rate limit kicks in after 15 messages/min
      let rateLimited = false;
      for (let i = 0; i < 16; i++) {
        try {
          await aiSvc.chatWithBoothNpc({
            boothId: booth.boothId,
            userId: 'visitor-rate-test',
            message: `Câu hỏi số ${i + 1}`,
          });
        } catch (err) {
          if ((err as Error).message.includes('quá nhanh') || (err as Error).message.includes('giới hạn')) {
            rateLimited = true;
            break;
          }
        }
      }
      expect(rateLimited).toBe(true);
    } finally {
      v28Db.close();
    }
  });
});
