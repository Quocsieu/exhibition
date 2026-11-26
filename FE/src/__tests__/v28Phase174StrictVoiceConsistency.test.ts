import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HybridPlaybackCoordinator,
  type LockedAudioVoiceConfig,
} from '../services/hybridPlaybackController';
import { V28CatalogDatabase } from '../../../BE/src/database/v28Database';
import {
  LocalAudioStorageAdapter,
  V28AudioCacheService,
} from '../../../BE/src/services/v28/audioCacheService';
import type { ExhibitionBoothPlacementView } from '../../../BE/src/services/v28/exhibitionService';

const GEMINI_KORE: LockedAudioVoiceConfig = {
  engine: 'backend-audio-tts',
  provider: 'gemini',
  modelId: 'gemini-3.8-flash-tts',
  voiceId: 'Kore',
  voiceSignature: 'gemini|gemini-3.8-flash-tts|Kore',
};

function makeMinimalWav(): Buffer {
  const buf = Buffer.alloc(128);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(120, 4);
  buf.write('WAVE', 8);
  return buf;
}

describe('GRAND EXPO V28 — PHASE 1.7.4: Strict Booth Voice Consistency (ONE BOOTH — ONE VOICE)', () => {
  let tmpDir: string;
  let v28Db: V28CatalogDatabase;
  let audioDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-p174-'));
    v28Db = new V28CatalogDatabase(path.join(tmpDir, 'test.db'));
    audioDir = path.join(tmpDir, 'audio');
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      v28Db.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Two-Way Lock: AUDIO_TTS_LOCKED blocks silent fallback to DIRECT_TTS on later product error/timeout', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });

    // 1. Booth starts in UNLOCKED -> NPC plays Gemini Kore -> locks AUDIO_TTS_LOCKED
    const p1 = coord.start({
      boothId: 'booth-aether-tech',
      runAudioTts: async (ctx) => {
        expect(ctx.markAudioStarted(GEMINI_KORE)).toBe(true);
      },
      runDirectTts: async () => {},
    });
    await p1;
    expect(coord.lockManager.getLockState('booth-aether-tech')).toBe('AUDIO_TTS_LOCKED');

    // 2. Later product fails / has mismatched voice -> MUST NOT fall back to DIRECT_TTS!
    let directCalled = 0;
    const p2 = coord.start({
      boothId: 'booth-aether-tech',
      runAudioTts: async () => {
        throw new Error('Missing or mismatched voice clip');
      },
      runDirectTts: async () => {
        directCalled += 1;
      },
    });
    await p2;
    expect(directCalled).toBe(0);
    expect(coord.getState()).toBe('ERROR');
    expect(coord.lockManager.getLockState('booth-aether-tech')).toBe('AUDIO_TTS_LOCKED');
  });

  it('Voice Signature Guard: rejects Edge/Vbee/mismatched voiceId when AUDIO_TTS_LOCKED is Gemini Kore', () => {
    const coord = new HybridPlaybackCoordinator();
    coord.lockManager.lockBoothToAudioTts('booth-aether-tech', GEMINI_KORE);

    expect(coord.lockManager.matchesLockedAudioSignature('booth-aether-tech', 'gemini|gemini-3.8-flash-tts|Kore')).toBe(true);
    expect(coord.lockManager.matchesLockedAudioSignature('booth-aether-tech', 'edge|edge-neural-tts|vi-VN-HoaiMyNeural')).toBe(false);
    expect(coord.lockManager.matchesLockedAudioSignature('booth-aether-tech', 'vbee|vbee-tts-v1|hn_female_ngochuyen_full_48k-fhg')).toBe(false);
    expect(coord.lockManager.matchesLockedAudioSignature('booth-aether-tech', 'gemini|gemini-3.8-flash-tts|Aoede')).toBe(false);
  });

  it('5x Rapid-Click Race Guard: switching NPC <-> Product 5 times never overlaps or mixes voices', async () => {
    const coord = new HybridPlaybackCoordinator({ nowFn: () => Date.now() });
    coord.lockManager.lockBoothToDirectTts('booth-aether-tech', 'readiness_not_consistent');

    for (let iter = 0; iter < 5; iter += 1) {
      let audioCalls = 0;
      const played: string[] = [];
      void coord.start({
        boothId: 'booth-aether-tech',
        runAudioTts: async () => {
          audioCalls += 1;
        },
        runDirectTts: async (ctx) => {
          setTimeout(() => {
            if (ctx.markDirectStarted()) played.push(`npc-${iter}`);
          }, 20);
        },
      });
      void coord.start({
        boothId: 'booth-aether-tech',
        runAudioTts: async () => {
          audioCalls += 1;
        },
        runDirectTts: async (ctx) => {
          setTimeout(() => {
            if (ctx.markDirectStarted()) played.push(`prod-${iter}`);
          }, 20);
        },
      });
      await vi.advanceTimersByTimeAsync(50);
      expect(audioCalls).toBe(0);
      expect(played).toEqual([`prod-${iter}`]);
    }
  });

  it('BE Booth Audio Readiness: detects mixed/partial Gemini + local-fallback vs 100% consistent Gemini ready booth', async () => {
    const storage = new LocalAudioStorageAdapter(audioDir);
    const svc = new V28AudioCacheService(v28Db, storage);
    const comp = v28Db.createCompany({
      name: 'Aether Technologies Corp',
      category: 'Tech',
      description: 'Smart AR',
      logoUrl: '',
      bannerUrl: '',
      contactEmail: '',
      contactUrl: '',
    });
    const prod = v28Db.createProduct({
      companyId: comp.id,
      name: 'AetherGlass Lite',
      price: 18900000,
      currency: 'VND',
      description: 'AR glasses',
      status: 'active',
      contactUrl: '',
      boothId: null,
      images: [],
      modelUrl: '',
      videoUrl: '',
      sourceUrl: '',
      sku: 'AG-1',
      inStock: true,
    });

    const booth: ExhibitionBoothPlacementView = {
      boothId: 'booth-aether-tech',
      companyId: comp.id,
      companyName: comp.name,
      boothName: 'Aether Tech',
      zoneName: 'Zone A',
      category: 'Tech',
      description: 'Smart AR',
      boothTemplate: 'signature_ring',
      positionX: 0,
      positionZ: 0,
      rotationY: 0,
      zoneId: 'zone-a',
      slots: [
        {
          slotId: 'slot_01',
          slotIndex: 0,
          product: {
            id: prod.id,
            name: prod.name,
            price: prod.price,
            currency: prod.currency,
            inStock: true,
            description: prod.description,
            images: [],
            sku: 'AG-1',
            sourceUrl: '',
          },
        },
      ],
    } as unknown as ExhibitionBoothPlacementView;

    // 1. Only welcome uploaded/saved -> remaining clips missing/local-fallback -> ready=false
    await svc.uploadAdminAudio({
      entityType: 'booth',
      entityId: booth.boothId,
      slotKey: 'welcome',
      transcript: `Xin chào quý khách đến với gian hàng ${booth.boothName} của ${booth.companyName} tại ${booth.zoneName}. Tôi là trợ lý AI tư vấn sản phẩm, rất hân hạnh được hỗ trợ quý khách.`,
      fileBuffer: makeMinimalWav(),
      mimeType: 'audio/wav',
      filename: 'welcome.wav',
    });

    const partialPack = await svc.getOrPrepareBoothAudioPack(booth, { allowLiveSynthesis: false });
    expect(partialPack.voiceReadiness?.ready).toBe(false);
    expect(partialPack.voiceReadiness?.reason).toBe('missing_or_fallback');

    // 2. Save remaining clips with matching uploaded provider/voice -> ready=true!
    const introText = `${booth.companyName} mang đến giải pháp thuộc nhóm ${booth.category}. ${booth.description}`;
    const prodText = `Sản phẩm ${prod.name}. Giá niêm yết 18.900.000 VND. Hiện đang còn hàng. ${prod.description}`;
    const closingText = `Cảm ơn quý khách đã tham quan gian hàng ${booth.boothName} của ${booth.companyName}. Nếu quý khách cần tư vấn thêm về sản phẩm, vui lòng chuyển sang tab Chat để trò chuyện trực tiếp với tôi.`;

    await svc.uploadAdminAudio({
      entityType: 'booth',
      entityId: booth.boothId,
      slotKey: 'company_intro',
      transcript: introText,
      fileBuffer: makeMinimalWav(),
      mimeType: 'audio/wav',
      filename: 'intro.wav',
    });
    await svc.uploadAdminAudio({
      entityType: 'product',
      entityId: prod.id,
      slotKey: 'slot_01',
      transcript: prodText,
      fileBuffer: makeMinimalWav(),
      mimeType: 'audio/wav',
      filename: 'prod.wav',
    });
    await svc.uploadAdminAudio({
      entityType: 'booth',
      entityId: booth.boothId,
      slotKey: 'closing',
      transcript: closingText,
      fileBuffer: makeMinimalWav(),
      mimeType: 'audio/wav',
      filename: 'closing.wav',
    });

    const fullPack = await svc.getOrPrepareBoothAudioPack(booth, { allowLiveSynthesis: false });
    expect(fullPack.voiceReadiness?.ready).toBe(true);
    expect(fullPack.voiceReadiness?.reason).toBe('consistent_ready');
    expect(fullPack.voiceReadiness?.realReadyCount).toBe(4);
    expect(fullPack.voiceReadiness?.totalRequired).toBe(4);
  });
});
