import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  V28VisitorJourneyService,
  VISIT_MIN_COOLDOWN_MS,
  VISIT_MIN_DWELL_MS_FOCUS,
  VISIT_MIN_DWELL_MS_INTERACT,
} from '../services/v28/visitorJourneyService.js';
import { attachSocketServer } from '../realtime/socketServer.js';
import { V28SpatialAoiEngine } from '../realtime/v28/spatialAoiEngine.js';
import { createApp } from '../server.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startHardenedTestServer(v28DbPath: string) {
  const legacyDb = new ExpoDatabase(':memory:');
  const v28Db = new V28CatalogDatabase(v28DbPath);
  const app = createApp(legacyDb, '*', undefined, v28Db);
  const server = http.createServer(app);
  const io = attachSocketServer(server, legacyDb, '*');
  app.set('io', io);
  const exhService = app.locals.v28ExhibitionService as V28ExhibitionService;
  const journeyService = app.locals.v28VisitorJourneyService as V28VisitorJourneyService;
  const spatialAoi = new V28SpatialAoiEngine(io, exhService.getActiveExhibitionWorld(), {
    resolveVisitorId: (rawToken) => journeyService.tryResolveVisitorId(rawToken),
  });
  app.locals.v28SpatialAoi = spatialAoi;

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const origin = `http://127.0.0.1:${addr.port}`;
  const baseUrl = `${origin}/api/v28`;

  return {
    origin,
    baseUrl,
    v28Db,
    exhService,
    journeyService,
    spatialAoi,
    close: () =>
      new Promise<void>((resolve) => {
        spatialAoi.dispose();
        io.close();
        server.close(() => {
          v28Db.close();
          legacyDb.close();
          resolve();
        });
      }),
  };
}

async function connectVisitorSocket(origin: string, visitorToken?: string): Promise<ClientSocket> {
  const sock = ioClient(`${origin}/v28-dynamic`, {
    transports: ['websocket'],
    auth: {
      name: 'QA Visitor',
      color: '#0ea5e9',
      ...(visitorToken ? { visitorToken } : {}),
    },
  });
  await new Promise<void>((resolve) => sock.once('v28:snapshot', () => resolve()));
  return sock;
}

async function teleportSocket(
  sock: ClientSocket,
  versionId: string,
  seq: number,
  x: number,
  z: number
): Promise<void> {
  const snapPromise = new Promise<void>((resolve) => sock.once('v28:snapshot', () => resolve()));
  sock.emit('v28:teleport', { versionId, seq, x, z, rotationY: 0 });
  await snapPromise;
}

describe('Grand Expo V28 Phase 4 — Hardened Server-Verified Visitor Journey Tracking', () => {
  it('blocks forged HTTP/Socket.IO visits, enforces server dwell/proximity/anti-replay/cooldown, and preserves legitimate journeys & restart', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase4-hardened-'));
    const dbFile = path.join(tmpDir, 'v28_journey_hardened.db');

    let srv = await startHardenedTestServer(dbFile);
    const openSockets: ClientSocket[] = [];
    try {
      const worldRes = await fetch(`${srv.baseUrl}/exhibitions/active`);
      expect(worldRes.status).toBe(200);
      const { world } = (await worldRes.json()) as {
        world: {
          exhibitionId: string;
          versionId: string;
          booths: Array<{
            boothId: string;
            approachPoint: { x: number; z: number };
            positionX: number;
            positionZ: number;
            assignedSlotCount: number;
          }>;
        };
      };
      expect(world.booths.length).toBeGreaterThanOrEqual(6);
      const b1 = world.booths[0];
      const b2 = world.booths[1];
      const b3 = world.booths[2];
      const b4 = world.booths[3];

      const otherDraft = srv.exhService.createDraftVersion(world.exhibitionId, {
        targetBoothCount: 6,
        zoneCount: 1,
        boothsPerZone: 6,
      });

      // 1. Missing / forged visitor token -> 401
      expect((await fetch(`${srv.baseUrl}/visitor/journey`)).status).toBe(401);
      expect(
        (
          await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': 'v28v_' + 'a'.repeat(64) },
            body: JSON.stringify({ versionId: world.versionId, boothId: b1.boothId }),
          })
        ).status
      ).toBe(401);

      // Mint legitimate Visitor A session
      const sessARes = await fetch(`${srv.baseUrl}/visitor/session`, { method: 'POST' });
      expect(sessARes.status).toBe(201);
      const sessA = (await sessARes.json()) as { visitorToken: string; resumed: boolean };
      expect(sessA.visitorToken).toMatch(/^v28v_[0-9a-f]{64}$/);

      // 2. ATTACK: Direct HTTP forged coordinates WITHOUT entering World (no socket) -> 422!
      const forgedHttpVisit = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b1.boothId,
          interactionType: 'booth_focus',
          avatarX: b1.approachPoint.x,
          avatarZ: b1.approachPoint.z,
          isNearBooth: true,
          focusDurationMs: 10000,
        }),
      });
      expect(forgedHttpVisit.status).toBe(422);

      const forgedHttpEngage = await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({ versionId: world.versionId, boothId: b1.boothId }),
      });
      expect(forgedHttpEngage.status).toBe(422);

      // Connect Visitor A to /v28-dynamic (starts at spawnPoint, far from b1)
      const sockA = await connectVisitorSocket(srv.origin, sessA.visitorToken);
      openSockets.push(sockA);

      // 3. ATTACK: Socket connected at spawn (far away), client sends forged avatarX/avatarZ -> 422!
      const engageAtSpawn = await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({ versionId: world.versionId, boothId: b1.boothId }),
      });
      expect(engageAtSpawn.status).toBe(422);

      // 4. Non-existent booth & wrong version -> 404
      expect(
        (
          await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
            body: JSON.stringify({ versionId: world.versionId, boothId: 'booth-missing-999' }),
          })
        ).status
      ).toBe(404);
      expect(
        (
          await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
            body: JSON.stringify({ versionId: 'ver-missing-999', boothId: b1.boothId }),
          })
        ).status
      ).toBe(404);

      // 5. Legitimate teleport to Booth #1 -> does NOT count as visited on its own!
      await teleportSocket(sockA, world.versionId, 1, b1.approachPoint.x, b1.approachPoint.z);
      const journeyAfterTeleport = (await (
        await fetch(`${srv.baseUrl}/visitor/journey?versionId=${encodeURIComponent(world.versionId)}`, {
          headers: { 'X-Visitor-Token': sessA.visitorToken },
        })
      ).json()) as { visitedCount: number };
      expect(journeyAfterTeleport.visitedCount).toBe(0);

      // 6. Start engagement at Booth #1 -> ATTACK: immediate submit with fake focusDurationMs (0ms server dwell) -> 422!
      const eng1Res = await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({ versionId: world.versionId, boothId: b1.boothId }),
      });
      expect(eng1Res.status).toBe(201);
      const eng1 = (await eng1Res.json()) as { engagementToken: string };

      const fakeDwellRes = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b1.boothId,
          interactionType: 'booth_focus',
          engagementToken: eng1.engagementToken,
          focusDurationMs: 99999,
        }),
      });
      expect(fakeDwellRes.status).toBe(422);

      // Invalid interactionType -> 400
      expect(
        (
          await fetch(`${srv.baseUrl}/visitor/visits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
            body: JSON.stringify({
              versionId: world.versionId,
              boothId: b1.boothId,
              interactionType: 'map_click',
              engagementToken: eng1.engagementToken,
            }),
          })
        ).status
      ).toBe(400);

      // 7. Wait real server dwell (>= 1,400ms) -> valid visit recorded (+1), spoofed fields ignored!
      await sleep(VISIT_MIN_DWELL_MS_FOCUS + 80);
      const validVisitRes = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b1.boothId,
          interactionType: 'booth_focus',
          engagementToken: eng1.engagementToken,
          visitedCount: 99,
          firstVisitedAt: '1999-01-01T00:00:00Z',
        }),
      });
      expect(validVisitRes.status).toBe(201);
      const validVisit = (await validVisitRes.json()) as {
        recorded: boolean;
        duplicate: boolean;
        visitedCount: number;
        firstVisitedAt: string;
        visitedBoothIds: string[];
      };
      expect(validVisit.recorded).toBe(true);
      expect(validVisit.duplicate).toBe(false);
      expect(validVisit.visitedCount).toBe(1);
      expect(validVisit.firstVisitedAt).not.toBe('1999-01-01T00:00:00Z');
      expect(validVisit.visitedBoothIds).toEqual([b1.boothId]);

      // 8. Duplicate submission for Booth #1 -> strictly idempotent (200, duplicate=true, count stays 1)
      for (let i = 0; i < 5; i++) {
        const dupRes = await fetch(`${srv.baseUrl}/visitor/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
          body: JSON.stringify({
            versionId: world.versionId,
            boothId: b1.boothId,
            interactionType: 'product_inspect',
            engagementToken: eng1.engagementToken,
          }),
        });
        expect(dupRes.status).toBe(200);
        const dupJson = (await dupRes.json()) as { recorded: boolean; duplicate: boolean; visitedCount: number };
        expect(dupJson.recorded).toBe(false);
        expect(dupJson.duplicate).toBe(true);
        expect(dupJson.visitedCount).toBe(1);
      }

      // 9. ATTACK: Rapid booth hopping to Booth #2 (< 2.5s cooldown) -> 429!
      await teleportSocket(sockA, world.versionId, 2, b2.approachPoint.x, b2.approachPoint.z);
      // ATTACK: Replay Booth #1's engagementToken on Booth #2 -> 422!
      const replayOnB2 = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b2.boothId,
          interactionType: 'npc_consult',
          engagementToken: eng1.engagementToken,
        }),
      });
      expect(replayOnB2.status).toBe(422);

      const eng2Res = await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({ versionId: world.versionId, boothId: b2.boothId }),
      });
      expect(eng2Res.status).toBe(201);
      const eng2 = (await eng2Res.json()) as { engagementToken: string };
      await sleep(VISIT_MIN_DWELL_MS_INTERACT + 80);

      // Immediately after 680ms (< 2,500ms since b1) -> cooldown rejects with 429!
      const rapidHopRes = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b2.boothId,
          interactionType: 'npc_consult',
          engagementToken: eng2.engagementToken,
        }),
      });
      expect(rapidHopRes.status).toBe(429);

      // 10. Wait remaining cooldown -> 20 concurrent requests for Booth #2 -> strictly 1 recorded, 19 duplicate!
      await sleep(VISIT_MIN_COOLDOWN_MS);
      const concResponses = await Promise.all(
        Array.from({ length: 20 }, () =>
          fetch(`${srv.baseUrl}/visitor/visits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
            body: JSON.stringify({
              versionId: world.versionId,
              boothId: b2.boothId,
              interactionType: 'npc_consult',
              engagementToken: eng2.engagementToken,
            }),
          }).then((r) => r.json() as Promise<{ recorded: boolean; duplicate: boolean; visitedCount: number }>)
        )
      );
      expect(concResponses.filter((r) => r.recorded).length).toBe(1);
      expect(concResponses.filter((r) => r.duplicate).length).toBe(19);
      expect(concResponses.every((r) => r.visitedCount === 2)).toBe(true);

      // 11. Two Tabs: Open a 2nd socket for Visitor A, teleport Tab 2 to Booth #3 -> valid!
      const sockATab2 = await connectVisitorSocket(srv.origin, sessA.visitorToken);
      openSockets.push(sockATab2);
      await teleportSocket(sockATab2, world.versionId, 1, b3.approachPoint.x, b3.approachPoint.z);
      const eng3 = (await (
        await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
          body: JSON.stringify({ versionId: world.versionId, boothId: b3.boothId }),
        })
      ).json()) as { engagementToken: string };
      await sleep(VISIT_MIN_COOLDOWN_MS + 100);
      const tab2Visit = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b3.boothId,
          interactionType: 'product_inspect',
          engagementToken: eng3.engagementToken,
        }),
      });
      expect(tab2Visit.status).toBe(201);
      expect(((await tab2Visit.json()) as { visitedCount: number }).visitedCount).toBe(3);

      // 12. Visitor isolation & version isolation & expired session -> 401
      const sessB = (await (await fetch(`${srv.baseUrl}/visitor/session`, { method: 'POST' })).json()) as {
        visitorToken: string;
      };
      const journeyB = (await (
        await fetch(`${srv.baseUrl}/visitor/journey?versionId=${encodeURIComponent(world.versionId)}`, {
          headers: { 'X-Visitor-Token': sessB.visitorToken },
        })
      ).json()) as { visitedCount: number };
      expect(journeyB.visitedCount).toBe(0);

      // Cross-visitor engagementToken theft -> 422!
      const sockB = await connectVisitorSocket(srv.origin, sessB.visitorToken);
      openSockets.push(sockB);
      await teleportSocket(sockB, world.versionId, 1, b3.approachPoint.x, b3.approachPoint.z);
      const stolenEng = await fetch(`${srv.baseUrl}/visitor/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessB.visitorToken },
        body: JSON.stringify({
          versionId: world.versionId,
          boothId: b3.boothId,
          interactionType: 'product_inspect',
          engagementToken: eng3.engagementToken,
        }),
      });
      expect(stolenEng.status).toBe(422);

      // Version isolation
      const otherVerJourney = (await (
        await fetch(`${srv.baseUrl}/visitor/journey?versionId=${encodeURIComponent(otherDraft.versionId)}`, {
          headers: { 'X-Visitor-Token': sessA.visitorToken },
        })
      ).json()) as { visitedCount: number };
      expect(otherVerJourney.visitedCount).toBe(0);

      // Session expiration -> 401
      const sessExp = (await (await fetch(`${srv.baseUrl}/visitor/session`, { method: 'POST' })).json()) as {
        visitorToken: string;
      };
      srv.v28Db
        .getConnection()
        .prepare("UPDATE visitor_sessions SET expires_at = '2020-01-01T00:00:00.000Z' WHERE visitor_id = ?")
        .run(srv.journeyService.resolveVisitorId(sessExp.visitorToken));
      expect(
        (
          await fetch(`${srv.baseUrl}/visitor/journey?versionId=${encodeURIComponent(world.versionId)}`, {
            headers: { 'X-Visitor-Token': sessExp.visitorToken },
          })
        ).status
      ).toBe(401);

      // 13. Removed booth -> 404 even when standing at its old coordinates
      const emptyBooth = world.booths.find((b) => b.assignedSlotCount === 0 && b.boothId !== b1.boothId && b.boothId !== b2.boothId && b.boothId !== b3.boothId) || b4;
      srv.v28Db
        .getConnection()
        .prepare("UPDATE exhibition_version_booths SET placement_status = 'removed' WHERE version_id = ? AND booth_id = ?")
        .run(world.versionId, emptyBooth.boothId);
      await teleportSocket(sockA, world.versionId, 3, emptyBooth.approachPoint.x, emptyBooth.approachPoint.z);
      const removedBoothRes = await fetch(`${srv.baseUrl}/visitor/visits/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': sessA.visitorToken },
        body: JSON.stringify({ versionId: world.versionId, boothId: emptyBooth.boothId }),
      });
      expect(removedBoothRes.status).toBe(404);

      // 14. Direct DB check & Backend restart persistence
      const dbCount = srv.v28Db
        .getConnection()
        .prepare('SELECT COUNT(*) as c FROM visitor_booth_visits')
        .get() as { c: number };
      expect(dbCount.c).toBe(3);

      for (const s of openSockets) s.disconnect();
      openSockets.length = 0;

      await srv.close();
      srv = await startHardenedTestServer(dbFile);

      const resumeRes = await fetch(`${srv.baseUrl}/visitor/session`, {
        method: 'POST',
        headers: { 'X-Visitor-Token': sessA.visitorToken },
      });
      expect(resumeRes.status).toBe(200);
      const afterRestartJourney = (await (
        await fetch(`${srv.baseUrl}/visitor/journey?versionId=${encodeURIComponent(world.versionId)}`, {
          headers: { 'X-Visitor-Token': sessA.visitorToken },
        })
      ).json()) as { visitedCount: number; visitedBoothIds: string[] };
      expect(afterRestartJourney.visitedCount).toBe(3);
      expect(afterRestartJourney.visitedBoothIds).toEqual([b1.boothId, b2.boothId, b3.boothId]);
    } finally {
      for (const s of openSockets) s.disconnect();
      await srv.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);
});
