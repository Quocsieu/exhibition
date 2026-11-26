import { describe, expect, it } from 'vitest';
import http from 'node:http';
import express from 'express';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { createV28ApiRoutes } from '../routes/v28Routes.js';
import {
  V28SupertonicTtsService,
  preprocessSupertonicText,
  sanitizeSupertonicTokenRow,
  trimFloat32SpeechSilence,
} from '../services/v28/supertonicTtsService.js';

describe('V28 Phase B — Supertonic 3 TTS Adapter, Resource Guard & Hybrid Piper Fallback Contract', () => {
  it('expands Vietnamese currency/symbols (₫ -> đồng), blocks all -1 unmapped indices, and trims head/tail silence', () => {
    const processed = preprocessSupertonicText('Giá niêm yết ba mươi hai triệu ₫ • giảm 15% ở 25°C.', 'vi');
    expect(processed).toContain('đồng'.normalize('NFKD'));
    expect(processed).not.toContain('₫');
    expect(processed).toContain('phần trăm'.normalize('NFKD'));

    // Simulate unicode_indexer.json with -1 unmapped slots: zero negative indices may ever survive
    const mockIndexer = new Array(65536).fill(-1);
    mockIndexer[32] = 2; // space
    mockIndexer['<'.charCodeAt(0)] = 10;
    mockIndexer['>'.charCodeAt(0)] = 11;
    mockIndexer['/'.charCodeAt(0)] = 12;
    mockIndexer['v'.charCodeAt(0)] = 20;
    mockIndexer['i'.charCodeAt(0)] = 21;
    const row = sanitizeSupertonicTokenRow('<vi>Giá ₫ 🚀</vi>', mockIndexer);
    expect(row.length).toBeGreaterThan(0);
    expect(row.every((v) => v >= 0)).toBe(true);

    // Trim 500ms head + 350ms mid pause + 500ms tail silence down to compact natural bounds
    const sr = 10000;
    const raw = new Float32Array(sr * 2.5); // 2.5s
    for (let i = Math.floor(sr * 0.5); i < Math.floor(sr * 0.9); i++) {
      raw[i] = Math.sin(i * 0.2) * 0.25;
    }
    // 0.9s..1.35s = 450ms internal pause -> compacted down to ~120ms!
    for (let i = Math.floor(sr * 1.35); i < Math.floor(sr * 1.85); i++) {
      raw[i] = Math.sin(i * 0.2) * 0.25;
    }
    const trimmed = trimFloat32SpeechSilence(raw, sr);
    expect(trimmed.length).toBeLessThan(sr * 1.2);
    expect(trimmed.length).toBeGreaterThan(sr * 0.95);
  });

  it('safely disables Supertonic and returns 503 + fallback=hybrid-piper when model files are missing or system RAM is below Render safety threshold', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const exhSvc = new V28ExhibitionService(v28Db);
    const lowRamSvc = new V28SupertonicTtsService({
      modelDir: '/nonexistent/supertonic3',
      enabledMode: 'auto',
      defaultPreset: 'F3',
      minRequiredRamMb: 999_999, // Simulates low-RAM Render 512MB tier
    });

    const app = express();
    app.use('/api/v28', createV28ApiRoutes(v28Db, undefined, exhSvc, undefined, undefined, undefined, undefined, undefined, lowRamSvc));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const statusRes = await fetch(`${baseUrl}/api/v28/tts/supertonic/status`);
      expect(statusRes.status).toBe(200);
      const status = (await statusRes.json()) as {
        provider: string;
        enabled: boolean;
        ready: boolean;
        voicePreset: string;
        speed: number;
        lang: string;
        fallbackProvider: string;
        reason?: string;
      };
      expect(status.provider).toBe('supertonic3');
      expect(status.enabled).toBe(false);
      expect(status.ready).toBe(false);
      expect(status.voicePreset).toBe('F3');
      expect(status.speed).toBe(1.32);
      expect(status.lang).toBe('vi');
      expect(status.fallbackProvider).toBe('hybrid-piper');
      expect(status.reason).toContain('Hybrid Piper');

      // Empty text -> 400
      const badRes = await fetch(`${baseUrl}/api/v28/tts/supertonic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      });
      expect(badRes.status).toBe(400);

      // Valid text on low-RAM / missing-model server -> 503 with explicit fallback signal
      const synthRes = await fetch(`${baseUrl}/api/v28/tts/supertonic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Xin chào quý khách đến với gian hàng.' }),
      });
      expect(synthRes.status).toBe(503);
      const synthErr = (await synthRes.json()) as { fallback: string };
      expect(synthErr.fallback).toBe('hybrid-piper');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
