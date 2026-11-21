import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { createApp } from '../server.js';
import { issueAdminToken } from '../middleware/adminAuth.js';

describe('V28 Phase 10 — Admin-Configurable Reward Eligibility Policy', () => {
  let tmpDbPath: string;
  let legacyDb: ExpoDatabase;
  let v28Db: V28CatalogDatabase;
  let exhibitionService: V28ExhibitionService;
  let server: http.Server;
  let baseUrl: string;
  let adminToken: string;

  async function bootOnPath(dbPath: string) {
    legacyDb = new ExpoDatabase(':memory:');
    v28Db = new V28CatalogDatabase(dbPath);
    exhibitionService = new V28ExhibitionService(v28Db);
    const app = createApp(legacyDb, '*', undefined, v28Db);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v28`;
    adminToken = issueAdminToken('admin-p10');
  }

  async function shutdown() {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    v28Db.close();
    legacyDb.close();
  }

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `v28_p10_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    await bootOnPath(tmpDbPath);
  });

  afterEach(async () => {
    await shutdown();
    try {
      fs.unlinkSync(tmpDbPath);
    } catch {
      // ignore
    }
  });

  async function api(method: string, route: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  function setupPublishedExhibition(zoneCount = 3, boothsPerZone = 10) {
    const owner = v28Db.createCompany({
      name: 'Youth Expo Owner',
      category: 'Tech',
      description: 'Owner',
      status: 'active',
    });
    const prod = v28Db.createProduct({
      companyId: owner.id,
      name: 'Demo Product',
      price: 100000,
      currency: 'VND',
      description: 'Desc',
      images: [],
      inStock: true,
    });
    const exh = exhibitionService.createExhibition({
      name: 'Grand Expo Phase 10',
      targetBoothCount: zoneCount * boothsPerZone,
    });
    const draft = exhibitionService.createDraftVersion(exh.id, {
      targetBoothCount: zoneCount * boothsPerZone,
      zoneCount,
      boothsPerZone,
      ownerCompanyId: owner.id,
    });
    const slotId = draft.booths[0].slots[0].slotId;
    v28Db
      .getConnection()
      .prepare(
        `INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(draft.versionId, draft.booths[0].boothId, slotId, prod.id);
    const published = exhibitionService.publishVersion(exh.id, draft.versionId);
    return { exh, published, owner };
  }

  it('1. Rejects guest (401) and invalid thresholds (0, negative, decimal, string, > active booths), allows 10/20/30 and persists across restart', async () => {
    const { published } = setupPublishedExhibition(3, 10); // 30 active booths
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Guest blocked
    const guestPut = await api('PUT', '/admin/reward-policy', {
      versionId: published.versionId,
      requiredUniqueBooths: 15,
    });
    expect(guestPut.status).toBe(401);

    // Invalid inputs rejected
    for (const invalidVal of [0, -5, 12.5, '20', 31, null]) {
      const bad = await api(
        'PUT',
        '/admin/reward-policy',
        { versionId: published.versionId, requiredUniqueBooths: invalidVal },
        auth
      );
      expect(bad.status).toBe(400);
    }

    // Valid updates: 10 -> 20 -> 30 -> 12
    for (const validVal of [10, 20, 30, 12]) {
      const ok = await api(
        'PUT',
        '/admin/reward-policy',
        { versionId: published.versionId, requiredUniqueBooths: validVal },
        auth
      );
      expect(ok.status).toBe(200);
      expect(ok.body.policy.requiredUniqueBooths).toBe(validVal);
      expect(ok.body.totalActiveBooths).toBe(30);
    }

    // Simulate backend restart -> threshold 12 persists!
    await shutdown();
    await bootOnPath(tmpDbPath);

    const afterRestart = await api(
      'GET',
      `/admin/reward-policy?versionId=${encodeURIComponent(published.versionId)}`,
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body.policy.requiredUniqueBooths).toBe(12);
  });

  it('2. Dynamically updates visitor eligibility without auto-fulfilling, preserves existing redemptions, and enforces version isolation + Phase 8 warning', async () => {
    const { exh, published, owner } = setupPublishedExhibition(3, 10); // 30 booths
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Create a second draft version to test version isolation
    const draftB = exhibitionService.createDraftVersion(exh.id, {
      targetBoothCount: 30,
      zoneCount: 3,
      boothsPerZone: 10,
      ownerCompanyId: owner.id,
    });

    // Set published version threshold to 15; draftB must still stay at default 30
    const set15 = await api(
      'PUT',
      '/admin/reward-policy',
      { versionId: published.versionId, requiredUniqueBooths: 15 },
      auth
    );
    expect(set15.status).toBe(200);

    const policyB = await api(
      'GET',
      `/admin/reward-policy?versionId=${encodeURIComponent(draftB.versionId)}`,
      undefined,
      auth
    );
    expect(policyB.status).toBe(200);
    expect(policyB.body.policy.requiredUniqueBooths).toBe(30);

    // Create visitor and seed 12 verified visits
    const sess = await api('POST', '/visitor/session', {});
    const vToken = sess.body.visitorToken;
    const db = v28Db.getConnection();
    const vRow = db.prepare('SELECT visitor_id FROM visitor_sessions LIMIT 1').get() as { visitor_id: string };
    const visitorId = String(vRow.visitor_id);
    for (let i = 0; i < 12; i++) {
      db.prepare(
        `INSERT INTO visitor_booth_visits (visitor_id, exhibition_id, version_id, booth_id, interaction_type)
         VALUES (?, ?, ?, ?, 'booth_focus')`
      ).run(visitorId, exh.id, published.versionId, published.booths[i].boothId);
    }

    // At threshold 15 -> NOT eligible (12/15)
    const statusAt15 = await api(
      'GET',
      `/visitor/reward-status?versionId=${encodeURIComponent(published.versionId)}`,
      undefined,
      { 'X-Visitor-Token': vToken }
    );
    expect(statusAt15.status).toBe(200);
    expect(statusAt15.body.requiredUniqueBooths).toBe(15);
    expect(statusAt15.body.eligibleToSubmit).toBe(false);

    // Admin lowers threshold to 10 -> visitor is now eligible (12/10)
    const set10 = await api(
      'PUT',
      '/admin/reward-policy',
      { versionId: published.versionId, requiredUniqueBooths: 10 },
      auth
    );
    expect(set10.status).toBe(200);

    const statusAt10 = await api(
      'GET',
      `/visitor/reward-status?versionId=${encodeURIComponent(published.versionId)}`,
      undefined,
      { 'X-Visitor-Token': vToken }
    );
    expect(statusAt10.body.requiredUniqueBooths).toBe(10);
    expect(statusAt10.body.eligibleToSubmit).toBe(true);

    // Visitor submits redemption -> created as PENDING with snapshotted requiredUniqueBooths = 10 (never auto-fulfilled!)
    const submitRes = await api(
      'POST',
      '/visitor/redemptions',
      {
        versionId: published.versionId,
        recipientName: 'Nguyen Van A',
        contactPhone: '0901234567',
        consentAccepted: true,
      },
      { 'X-Visitor-Token': vToken }
    );
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.redemption.status).toBe('PENDING');
    expect(submitRes.body.redemption.requiredUniqueBooths).toBe(10);

    // Admin raises threshold to 25 -> existing PENDING redemption stays PENDING with snapshotted 10!
    const set25 = await api(
      'PUT',
      '/admin/reward-policy',
      { versionId: published.versionId, requiredUniqueBooths: 25 },
      auth
    );
    expect(set25.status).toBe(200);

    const statusAfterRaise = await api(
      'GET',
      `/visitor/reward-status?versionId=${encodeURIComponent(published.versionId)}`,
      undefined,
      { 'X-Visitor-Token': vToken }
    );
    expect(statusAfterRaise.body.redemption.status).toBe('PENDING');
    expect(statusAfterRaise.body.redemption.requiredUniqueBooths).toBe(10);

    // Phase 8 compatibility: Admin removes Zone C (10 empty booths) -> 20 active booths remain (< saved threshold 25)
    // Saved policy stays 25 (NOT silently mutated), and policyExceedsActiveBooths === true!
    const zoneC = published.zones.find((z) => z.code === 'C')!;
    const rmZoneC = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'zone', zoneId: zoneC.id },
      auth
    );
    expect(rmZoneC.status).toBe(200);
    expect(rmZoneC.body.remainingBoothCount).toBe(20);

    const policyWarn = await api(
      'GET',
      `/admin/reward-policy?versionId=${encodeURIComponent(published.versionId)}`,
      undefined,
      auth
    );
    expect(policyWarn.status).toBe(200);
    expect(policyWarn.body.totalActiveBooths).toBe(20);
    expect(policyWarn.body.policy.requiredUniqueBooths).toBe(25);
    expect(policyWarn.body.policyExceedsActiveBooths).toBe(true);

    // Admin trying to save 21 (> 20 active) is rejected (400)
    const badSave = await api(
      'PUT',
      '/admin/reward-policy',
      { versionId: published.versionId, requiredUniqueBooths: 21 },
      auth
    );
    expect(badSave.status).toBe(400);
  });
});
