import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { LocalAudioStorageAdapter, V28AudioCacheService } from '../services/v28/audioCacheService.js';
import { MultiProviderTtsService } from '../services/v28/tts/multiProviderTtsService.js';
import { V28VoiceApprovalService } from '../services/v28/tts/voiceApprovalService.js';
import { V28AudioBatchManager } from '../services/v28/tts/audioBatchManager.js';
import {
  resolveVoiceIdForProvider,
  TtsProviderError,
  type TtsProviderAdapter,
  type TtsSynthesisRequest,
} from '../services/v28/tts/ttsTypes.js';

function createFakeMp3Buffer(tag: string): Buffer {
  // Valid MP3 frame sync header (0xFF 0xF3) + payload
  const header = Buffer.from([0xff, 0xf3, 0x64, 0xc4]);
  const body = Buffer.alloc(1024, tag.charCodeAt(0) & 0xff);
  return Buffer.concat([header, body]);
}

function makeMockAdapter(params: {
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
    listVoices: () =>
      params.id === 'edge'
        ? [
            { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My', provider: 'edge', language: 'vi-VN', gender: 'female', description: '' },
            { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh', provider: 'edge', language: 'vi-VN', gender: 'male', description: '' },
          ]
        : [],
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
        durationSec: 2.0,
        provider: params.id,
        modelId: `${params.id}-neural`,
        voiceId: req.voiceId || 'vi-VN-HoaiMyNeural',
        language: 'vi-VN',
        synthMs: 12,
        estimatedChars: req.text.length,
      };
    },
  };
}

describe('GRAND EXPO V28 — PHASE 1.3: Neutral Voice Profiles, Preview Fallback, Approval Consistency & Scope', () => {
  it('maps neutral voice profiles cleanly across Gemini, Vbee, and Edge', () => {
    expect(resolveVoiceIdForProvider('female_standard', 'gemini')).toBe('Kore');
    expect(resolveVoiceIdForProvider('female_standard', 'vbee')).toBe('hn_female_ngochuyen_full_48k-fhg');
    expect(resolveVoiceIdForProvider('female_standard', 'edge')).toBe('vi-VN-HoaiMyNeural');

    expect(resolveVoiceIdForProvider('male_standard', 'gemini')).toBe('Puck');
    expect(resolveVoiceIdForProvider('male_standard', 'vbee')).toBe('hn_male_manhdung_news_48k-fhg');
    expect(resolveVoiceIdForProvider('male_standard', 'edge')).toBe('vi-VN-NamMinhNeural');

    // Cross-provider fallback mapping: Gemini "Kore" -> Edge "vi-VN-HoaiMyNeural"
    expect(resolveVoiceIdForProvider('Kore', 'edge')).toBe('vi-VN-HoaiMyNeural');
  });

  it('previews female & male neutral voices via automatic Gemini(403) -> Vbee(unconfigured) -> Edge fallback, never calls FPT, and enforces approval consistency', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase13-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const audioDir = path.join(tmpDir, 'audio');
    const v28Db = new V28CatalogDatabase(dbPath);

    let fptCalls = 0;
    const edgeCalls: Array<{ voiceId?: string; speed?: number }> = [];

    const ttsService = new MultiProviderTtsService({
      adapters: {
        gemini: makeMockAdapter({
          id: 'gemini',
          enabled: true,
          configured: true,
          onSynth: async () => {
            throw new TtsProviderError({
              provider: 'gemini',
              kind: 'permission_denied',
              statusCode: 403,
              message: 'Free tier not available (403)',
            });
          },
        }),
        vbee: makeMockAdapter({ id: 'vbee', enabled: true, configured: false }),
        edge: makeMockAdapter({
          id: 'edge',
          enabled: true,
          configured: true,
          onSynth: async (req) => {
            edgeCalls.push({ voiceId: req.voiceId, speed: req.speed });
            return createFakeMp3Buffer(req.voiceId || 'E');
          },
        }),
        fpt: makeMockAdapter({
          id: 'fpt',
          enabled: false,
          configured: false,
          onSynth: async () => {
            fptCalls++;
            return createFakeMp3Buffer('F');
          },
        }),
      },
    });

    const audioCacheService = new V28AudioCacheService(
      v28Db,
      new LocalAudioStorageAdapter(audioDir),
      ttsService
    );
    const voiceApprovalService = new V28VoiceApprovalService(v28Db, audioCacheService);
    const batchManager = new V28AudioBatchManager(v28Db, audioCacheService, voiceApprovalService);

    // 1. Preview female_standard with style -> automatically falls back to Edge vi-VN-HoaiMyNeural + honest limitation note
    const femaleRes = await voiceApprovalService.createVoicePreview({
      voiceProfile: 'female_standard',
      speed: 1.0,
      style: 'ấm áp',
      transcript: 'Xin chào quý khách đến với gian hàng.',
    });
    expect(femaleRes.preview.provider).toBe('edge');
    expect(femaleRes.preview.voiceId).toBe('vi-VN-HoaiMyNeural');
    expect(femaleRes.limitations.length).toBeGreaterThan(0);

    // 2. Preview male_standard -> automatically maps to Edge vi-VN-NamMinhNeural!
    const maleRes = await voiceApprovalService.createVoicePreview({
      voiceProfile: 'male_standard',
      speed: 1.05,
      transcript: 'Xin chào quý khách đến với gian hàng.',
    });
    expect(maleRes.preview.provider).toBe('edge');
    expect(maleRes.preview.voiceId).toBe('vi-VN-NamMinhNeural');
    expect(maleRes.preview.configSignature).not.toBe(femaleRes.preview.configSignature);

    // 3. FPT.AI must have 0 calls
    expect(fptCalls).toBe(0);
    expect(edgeCalls.map((c) => c.voiceId)).toEqual(['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural']);

    // 4. Unapproved configSignature MUST be rejected by startBatch
    expect(() =>
      batchManager.startBatch({
        confirmed: true,
        configSignature: maleRes.preview.configSignature,
      })
    ).toThrow(/VOICE_APPROVAL_REQUIRED/);

    // 5. After explicit approval, overview counts only REAL speech audios (never local-fallback chimes)
    const approved = voiceApprovalService.approveVoiceConfig({
      configSignature: maleRes.preview.configSignature,
      adminUsername: 'admin-test',
    });
    expect(approved.status).toBe('approved');

    // Insert a legacy local-fallback chime row and verify overview excludes it from readyCount
    const nowIso = new Date().toISOString();
    v28Db.getConnection().prepare(
      `INSERT INTO audio_assets (
        audio_id, entity_type, entity_id, slot_key, content_hash,
        language, voice_id, model_id, provider, source_type, speed, style, config_version,
        needs_update, is_active, original_filename, error_message,
        storage_key, mime_type, duration_sec, transcript, status, created_at, updated_at
      ) VALUES ('aud-chime-1', 'booth', 'b1', 'welcome', 'h1', 'vi-VN', 'Kore', 'gemini-3.8-flash-tts:local-fallback', 'local-fallback', 'pre_generated', 1.0, '', 'v1', 0, 1, '', '', 'k1.wav', 'audio/wav', 2.4, 'hi', 'ready', ?, ?)`
    ).run(nowIso, nowIso);

    const overview = audioCacheService.getAdminAudioOverview(20, {
      occupiedBoothCount: 23,
      totalBoothSlots: 100,
      activeProductCount: 132,
    });
    expect(overview.legacyChimeCount).toBe(1);
    expect(overview.realReadyCount).toBe(2); // Only the 2 real Edge previews, NOT the local-fallback chime!
    expect(overview.scope?.occupiedBoothCount).toBe(23);
    expect(overview.scope?.totalBoothSlots).toBe(100);

    v28Db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
