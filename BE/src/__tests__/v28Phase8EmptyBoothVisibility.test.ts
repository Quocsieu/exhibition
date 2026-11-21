import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  V28VisitorJourneyService,
  VISIT_MIN_COOLDOWN_MS,
  VISIT_MIN_DWELL_MS_INTERACT,
} from '../services/v28/visitorJourneyService.js';
import { attachSocketServer } from '../realtime/socketServer.js';
import { V28SpatialAoiEngine } from '../realtime/v28/spatialAoiEngine.js';
import { createApp } from '../server.js';
import { issueAdminToken } from '../middleware/adminAuth.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('V28 Phase 8 Revision — Permanent Empty Booth Removal & Zone-Aware U-Shaped Compaction', () => {
  let legacyDb: ExpoDatabase;
  let v28Db: V28CatalogDatabase;
  let exhibitionService: V28ExhibitionService;
  let server: http.Server;
  let io: ReturnType<typeof attachSocketServer>;
  let spatialAoi: V28SpatialAoiEngine;
  let origin: string;
  let baseUrl: string;
  let adminToken: string;

  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    legacyDb = new ExpoDatabase(':memory:');
    v28Db = new V28CatalogDatabase(':memory:');
    app = createApp(legacyDb, '*', undefined, v28Db);
    exhibitionService = app.locals.v28ExhibitionService as V28ExhibitionService;
    server = http.createServer(app);
    io = attachSocketServer(server, legacyDb, '*');
    app.set('io', io);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as { port: number };
    origin = `http://127.0.0.1:${addr.port}`;
    baseUrl = `${origin}/api/v28`;
    adminToken = issueAdminToken('admin-test');
  });

  afterEach(async () => {
    spatialAoi?.dispose();
    io?.close();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    v28Db.close();
    legacyDb.close();
  });

  async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  function setupExhibitionWithZones(zoneCount = 4, boothsPerZone = 10) {
    const owner = v28Db.createCompany({
      name: 'Owner Single Business',
      category: 'Tech',
      description: 'Main owner',
      status: 'active',
    });
    const otherTenant = v28Db.createCompany({
      name: 'Independent Tenant Co',
      category: 'Energy',
      description: 'Distinct tenant',
      status: 'active',
    });
    const prod = v28Db.createProduct({
      companyId: owner.id,
      name: 'Flagship Phone',
      price: 19900000,
      currency: 'VND',
      description: 'Test product',
      images: [],
      inStock: true,
    });

    const exh = exhibitionService.createExhibition({
      name: 'Grand Expo Phase 8 Revision',
      targetBoothCount: zoneCount * boothsPerZone,
    });
    const draft = exhibitionService.createDraftVersion(exh.id, {
      targetBoothCount: zoneCount * boothsPerZone,
      zoneCount,
      boothsPerZone,
      ownerCompanyId: owner.id,
    });

    // Assign 1 product to booth #1 (slotIndex 0, Zone A)
    const booth1 = draft.booths[0];
    const db = v28Db.getConnection();
    const slotId = booth1.slots[0].slotId;
    db.prepare(
      `INSERT OR REPLACE INTO exhibition_version_booth_slots (version_id, booth_id, slot_id, product_id)
       VALUES (?, ?, ?, ?)`
    ).run(draft.versionId, booth1.boothId, slotId, prod.id);

    const published = exhibitionService.publishVersion(exh.id, draft.versionId);
    return { exh, published, owner, otherTenant, prod };
  }

  it('1. Rejects guest (401), protects product & distinct tenant booths (400), and keeps exact coordinates on partial zone deletion', async () => {
    const { exh, published, otherTenant } = setupExhibitionWithZones(4, 10);
    const b1 = published.booths[0];
    const b2 = published.booths[1];
    const b5 = published.booths[4];
    const b6 = published.booths[5];

    v28Db
      .getConnection()
      .prepare('UPDATE exhibition_version_booth_meta SET company_id = ? WHERE version_id = ? AND booth_id = ?')
      .run(otherTenant.id, published.versionId, b2.boothId);

    const auth = { Authorization: `Bearer ${adminToken}` };

    const guestRes = await api('POST', `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`, {
      mode: 'single',
      boothId: b5.boothId,
    });
    expect(guestRes.status).toBe(401);

    const prodRes = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'single', boothId: b1.boothId },
      auth
    );
    expect(prodRes.status).toBe(400);

    const tenantRes = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'single', boothId: b2.boothId },
      auth
    );
    expect(tenantRes.status).toBe(400);

    const del1 = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'single', boothId: b5.boothId },
      auth
    );
    expect(del1.status).toBe(200);
    expect(del1.body.removedCount).toBe(1);
    expect(del1.body.compacted).toBe(false);
    expect(del1.body.remainingBoothCount).toBe(39);
    expect(del1.body.remainingZoneCount).toBe(4);

    // Already removed -> 409
    const dupDel = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'single', boothId: b5.boothId },
      auth
    );
    expect(dupDel.status).toBe(409);

    const activeRes = await api('GET', '/exhibitions/active');
    expect(activeRes.status).toBe(200);
    const liveB6 = activeRes.body.world.booths.find((b: { boothId: string }) => b.boothId === b6.boothId);
    expect(liveB6).toBeTruthy();
    expect(liveB6.slotIndex).toBe(b6.slotIndex);
    expect(liveB6.positionX).toBe(b6.positionX);
    expect(liveB6.positionZ).toBe(b6.positionZ);
    expect(liveB6.rotationY).toBe(b6.rotationY);
  });

  it('2. Compacts deterministically ONLY when an entire zone is removed, validates 0 overlaps/out-of-bounds, and preserves booth identities', async () => {
    const { exh, published } = setupExhibitionWithZones(4, 10);
    const zoneB = published.zones.find((z) => z.code === 'B')!;
    const zoneC = published.zones.find((z) => z.code === 'C')!;
    const auth = { Authorization: `Bearer ${adminToken}` };

    const delZoneB = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'zone', zoneId: zoneB.id },
      auth
    );
    expect(delZoneB.status).toBe(200);
    expect(delZoneB.body.removedCount).toBe(10);
    expect(delZoneB.body.compacted).toBe(true);
    expect(delZoneB.body.removedZoneCodes).toEqual(['B']);
    expect(delZoneB.body.remainingBoothCount).toBe(30);
    expect(delZoneB.body.remainingZoneCount).toBe(3);
    expect(delZoneB.body.version.zones.map((z: { code: string }) => z.code)).toEqual(['A', 'C', 'D']);
    expect(delZoneB.body.version.validation.valid).toBe(true);
    expect(delZoneB.body.version.validation.stats.overlapCount).toBe(0);
    expect(delZoneB.body.version.validation.stats.outOfBoundsCount).toBe(0);
    expect(delZoneB.body.version.validation.stats.unreachableBoothCount).toBe(0);

    const delZoneC = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'zone', zoneId: zoneC.id },
      auth
    );
    expect(delZoneC.status).toBe(200);
    expect(delZoneC.body.compacted).toBe(true);
    expect(delZoneC.body.remainingZoneCount).toBe(2);
    expect(delZoneC.body.version.zones.map((z: { code: string }) => z.code)).toEqual(['A', 'D']);
    expect(delZoneC.body.version.hallDepth).toBeLessThan(published.hallDepth);
    expect(delZoneC.body.version.validation.valid).toBe(true);

    const firstZoneDBooth = delZoneC.body.version.booths.find((b: { zoneCode: string }) => b.zoneCode === 'D');
    expect(firstZoneDBooth.slotIndex).toBe(30);
  });

  it('3. Deletes ALL empty booths (1 centered U-zone) + verifies Journey/Reward compatibility & compacted visit proximity', async () => {
    const { exh, published } = setupExhibitionWithZones(4, 10);
    const journeyService = app.locals.v28VisitorJourneyService as V28VisitorJourneyService;
    spatialAoi = new V28SpatialAoiEngine(io, published, {
      resolveVisitorId: (rawToken) => journeyService.tryResolveVisitorId(rawToken),
    });
    app.locals.v28SpatialAoi = spatialAoi;
    const b1 = published.booths[0];
    const b15 = published.booths[14];
    const auth = { Authorization: `Bearer ${adminToken}` };

    const sessRes = await api('POST', '/visitor/session', {});
    expect(sessRes.status).toBe(201);
    const token = sessRes.body.visitorToken;

    const sock: ClientSocket = ioClient(`${origin}/v28-dynamic`, {
      transports: ['websocket'],
      auth: { name: 'Phase8 QA', color: '#0ea5e9', visitorToken: token },
    });
    try {
      await new Promise<void>((r) => sock.once('v28:snapshot', () => r()));
      const tp1 = new Promise<void>((r) => sock.once('v28:snapshot', () => r()));
      sock.emit('v28:teleport', { versionId: published.versionId, seq: 1, x: b15.approachPoint.x, z: b15.approachPoint.z, rotationY: 0 });
      await tp1;

      const eng15 = await api(
        'POST',
        '/visitor/visits/engage',
        { versionId: published.versionId, boothId: b15.boothId },
        { 'X-Visitor-Token': token }
      );
      expect(eng15.status).toBe(201);
      await sleep(VISIT_MIN_DWELL_MS_INTERACT + 80);

      const visit15 = await api(
        'POST',
        '/visitor/visits',
        {
          versionId: published.versionId,
          boothId: b15.boothId,
          interactionType: 'npc_consult',
          engagementToken: eng15.body.engagementToken,
        },
        { 'X-Visitor-Token': token }
      );
      expect(visit15.status).toBe(201);
      expect(visit15.body.recorded).toBe(true);

      const delAll = await api(
        'POST',
        `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
        { mode: 'all' },
        auth
      );
      expect(delAll.status).toBe(200);
      expect(delAll.body.removedCount).toBe(39);
      expect(delAll.body.compacted).toBe(true);
      expect(delAll.body.remainingBoothCount).toBe(1);
      expect(delAll.body.remainingZoneCount).toBe(1);
      expect(delAll.body.version.validation.valid).toBe(true);
      expect(delAll.body.version.clusters[0].openingDirection).toBe('south');

      const journeyRes = await api(
        'GET',
        `/visitor/journey?versionId=${encodeURIComponent(published.versionId)}`,
        undefined,
        { 'X-Visitor-Token': token }
      );
      expect(journeyRes.status).toBe(200);
      expect(journeyRes.body.totalBooths).toBe(1);
      expect(journeyRes.body.visitedCount).toBe(1);
      expect(journeyRes.body.visitedBoothIds).toContain(b15.boothId);

      const blockedVisit = await api(
        'POST',
        '/visitor/visits/engage',
        {
          versionId: published.versionId,
          boothId: b15.boothId,
        },
        { 'X-Visitor-Token': token }
      );
      expect(blockedVisit.status).toBe(404);

      const compactedB1 = delAll.body.version.booths.find((b: { boothId: string }) => b.boothId === b1.boothId);
      const tp2 = new Promise<void>((r) => sock.once('v28:snapshot', () => r()));
      sock.emit('v28:teleport', { versionId: published.versionId, seq: 2, x: compactedB1.approachPoint.x, z: compactedB1.approachPoint.z, rotationY: 0 });
      await tp2;

      const engB1 = await api(
        'POST',
        '/visitor/visits/engage',
        { versionId: published.versionId, boothId: compactedB1.boothId },
        { 'X-Visitor-Token': token }
      );
      expect(engB1.status).toBe(201);
      await sleep(VISIT_MIN_COOLDOWN_MS + 80);

      const visitCompactedB1 = await api(
        'POST',
        '/visitor/visits',
        {
          versionId: published.versionId,
          boothId: compactedB1.boothId,
          interactionType: 'npc_consult',
          engagementToken: engB1.body.engagementToken,
        },
        { 'X-Visitor-Token': token }
      );
      expect(visitCompactedB1.status).toBe(201);
      expect(visitCompactedB1.body.recorded).toBe(true);
    } finally {
      sock.disconnect();
    }
  }, 15000);

  it('4. Enforces version isolation and blocks deleting the very last active booth of an exhibition', async () => {
    const { exh, published, owner } = setupExhibitionWithZones(2, 6);
    const auth = { Authorization: `Bearer ${adminToken}` };
    const draftB = exhibitionService.createDraftVersion(exh.id, {
      targetBoothCount: 12,
      zoneCount: 2,
      boothsPerZone: 6,
      ownerCompanyId: owner.id,
    });

    const delA = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${published.versionId}/empty-booths/remove`,
      { mode: 'all' },
      auth
    );
    expect(delA.status).toBe(200);
    expect(delA.body.remainingBoothCount).toBe(1);

    const detailB = exhibitionService.getVersionDetail(draftB.versionId, { includeHidden: false })!;
    expect(detailB.booths.length).toBe(12);
    expect(detailB.zones.length).toBe(2);

    // Clear slots in draftB so all 12 booths are empty -> attempting to delete ALL must be blocked (400)
    v28Db
      .getConnection()
      .prepare('DELETE FROM exhibition_version_booth_slots WHERE version_id = ?')
      .run(draftB.versionId);

    const blockAllEmpty = await api(
      'POST',
      `/exhibitions/${exh.id}/versions/${draftB.versionId}/empty-booths/remove`,
      { mode: 'all' },
      auth
    );
    expect(blockAllEmpty.status).toBe(400);
  });
});
