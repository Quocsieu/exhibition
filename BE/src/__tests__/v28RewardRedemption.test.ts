import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { ExpoDatabase } from '../database/db.js';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { issueAdminToken } from '../middleware/adminAuth.js';
import { createApp } from '../server.js';

async function startServer(dbPath: string) {
  const legacyDb = new ExpoDatabase(':memory:');
  const v28Db = new V28CatalogDatabase(dbPath);
  const app = createApp(legacyDb, '*', undefined, v28Db);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}/api/v28`;
  const exhService = app.locals.v28ExhibitionService as V28ExhibitionService;

  return {
    baseUrl,
    v28Db,
    exhService,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          v28Db.close();
          legacyDb.close();
          resolve();
        });
      }),
  };
}

function seedVisitsDirectly(
  v28Db: V28CatalogDatabase,
  visitorToken: string,
  exhibitionId: string,
  versionId: string,
  boothIds: string[],
  timestampIso = '2026-11-21 09:00:00'
) {
  const db = v28Db.getConnection();
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const hash = crypto.createHash('sha256').update(visitorToken, 'utf8').digest('hex');
  const row = db
    .prepare('SELECT visitor_id FROM visitor_sessions WHERE token_hash = ?')
    .get(hash) as { visitor_id: string };
  const ins = db.prepare(
    `INSERT OR IGNORE INTO visitor_booth_visits
       (visitor_id, exhibition_id, version_id, booth_id, interaction_type, first_visited_at)
     VALUES (?, ?, ?, ?, 'booth_focus', ?)`
  );
  for (const bid of boothIds) {
    ins.run(row.visitor_id, exhibitionId, versionId, bid, timestampIso);
  }
}

describe('Grand Expo V28 Phase 5 — Visitor Rewards Redemption, Risk Flags & Admin Verification', () => {
  it('verifies Eligibility (0/29/30/dup/cross-version/cross-visitor), Redemption concurrency/XSS/consent, Risk Flags, Admin State Machine & Restart', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v28-phase5-rewards-'));
    const dbFile = path.join(tmpDir, 'v28_rewards.db');
    let srv = await startServer(dbFile);

    try {
      // Create & publish a 35-booth world so we can test 0, 29, 30, and cross-version isolation
      const activeWorldRes = await fetch(`${srv.baseUrl}/exhibitions/active`);
      const { world: initialWorld } = (await activeWorldRes.json()) as {
        world: { exhibitionId: string; versionId: string; booths: Array<{ boothId: string }> };
      };
      const draft35 = srv.exhService.createDraftVersion(initialWorld.exhibitionId, {
        targetBoothCount: 35,
        zoneCount: 4,
        boothsPerZone: 9,
      });

      const adminToken = issueAdminToken('admin');
      const visitorARes = await fetch(`${srv.baseUrl}/visitor/session`, { method: 'POST' });
      const { visitorToken: tokenA } = (await visitorARes.json()) as { visitorToken: string };
      const visitorBRes = await fetch(`${srv.baseUrl}/visitor/session`, { method: 'POST' });
      const { visitorToken: tokenB } = (await visitorBRes.json()) as { visitorToken: string };

      // 1. 0/35 -> NOT eligible
      const st0 = await fetch(
        `${srv.baseUrl}/visitor/reward-status?versionId=${encodeURIComponent(draft35.versionId)}`,
        { headers: { 'X-Visitor-Token': tokenA } }
      ).then((r) => r.json());
      expect(st0.recordedUniqueBooths).toBe(0);
      expect(st0.requiredUniqueBooths).toBe(30);
      expect(st0.eligibleToSubmit).toBe(false);

      // 2. Trying to submit at 0/35 (even spoofing visitedCount=50, status='APPROVED') -> 400
      const earlySubmit = await fetch(`${srv.baseUrl}/visitor/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': tokenA },
        body: JSON.stringify({
          versionId: draft35.versionId,
          recipientName: 'Nguyen Van A',
          contactPhone: '0901234567',
          consentAccepted: true,
          visitedCount: 50,
          status: 'APPROVED',
        }),
      });
      expect(earlySubmit.status).toBe(400);

      // 3. Seed 29 unique booths in draft35 + 5 booths in initialWorld (different version!) -> STILL 29, NOT eligible
      seedVisitsDirectly(
        srv.v28Db,
        tokenA,
        draft35.exhibitionId,
        draft35.versionId,
        draft35.booths.slice(0, 29).map((b) => b.boothId)
      );
      seedVisitsDirectly(
        srv.v28Db,
        tokenA,
        initialWorld.exhibitionId,
        initialWorld.versionId,
        initialWorld.booths.slice(0, 5).map((b) => b.boothId)
      );
      const st29 = await fetch(
        `${srv.baseUrl}/visitor/reward-status?versionId=${encodeURIComponent(draft35.versionId)}`,
        { headers: { 'X-Visitor-Token': tokenA } }
      ).then((r) => r.json());
      expect(st29.recordedUniqueBooths).toBe(29);
      expect(st29.eligibleToSubmit).toBe(false);

      // 4. Add 30th unique booth (all 30 at same timestamp -> triggers RAPID_COMPLETION + BURST_VISIT_VELOCITY risk flags!)
      seedVisitsDirectly(
        srv.v28Db,
        tokenA,
        draft35.exhibitionId,
        draft35.versionId,
        [draft35.booths[29].boothId]
      );
      const st30 = await fetch(
        `${srv.baseUrl}/visitor/reward-status?versionId=${encodeURIComponent(draft35.versionId)}`,
        { headers: { 'X-Visitor-Token': tokenA } }
      ).then((r) => r.json());
      expect(st30.recordedUniqueBooths).toBe(30);
      expect(st30.eligibleToSubmit).toBe(true);

      // 5. Missing consent -> 400; Missing both phone & email -> 400; Forged token -> 401
      const noConsent = await fetch(`${srv.baseUrl}/visitor/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': tokenA },
        body: JSON.stringify({
          versionId: draft35.versionId,
          recipientName: 'Nguyen Van A',
          contactPhone: '0901234567',
          consentAccepted: false,
        }),
      });
      expect(noConsent.status).toBe(400);

      const noContact = await fetch(`${srv.baseUrl}/visitor/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': tokenA },
        body: JSON.stringify({
          versionId: draft35.versionId,
          recipientName: 'Nguyen Van A',
          consentAccepted: true,
        }),
      });
      expect(noContact.status).toBe(400);

      const forgedSubmit = await fetch(`${srv.baseUrl}/visitor/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': 'v28v_' + 'f'.repeat(64) },
        body: JSON.stringify({
          versionId: draft35.versionId,
          recipientName: 'Fake',
          contactPhone: '0901234567',
          consentAccepted: true,
        }),
      });
      expect(forgedSubmit.status).toBe(401);

      // 6. Concurrent submit (5 parallel requests with XSS attempt in name) -> strictly ONE 201, FOUR 409, XSS stripped!
      const concSubmit = await Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(`${srv.baseUrl}/visitor/redemptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Visitor-Token': tokenA },
            body: JSON.stringify({
              versionId: draft35.versionId,
              recipientName: '<script>alert(1)</script>Nguyen Van A',
              contactEmail: 'visitorA@example.com',
              consentAccepted: true,
            }),
          }).then(async (r) => ({ status: r.status, body: await r.json() }))
        )
      );
      expect(concSubmit.filter((r) => r.status === 201).length).toBe(1);
      expect(concSubmit.filter((r) => r.status === 409 || r.status === 429).length).toBe(4);
      expect(concSubmit.some((r) => r.status === 409)).toBe(true);
      const created = concSubmit.find((r) => r.status === 201)!.body;
      expect(created.redemption.status).toBe('PENDING'); // NEVER auto-fulfilled!
      expect(created.redemption.recipientName).toBe('Nguyen Van A');
      expect(created.redemption.maskedContact).toBe('vi***@example.com');
      const redemptionId = created.redemption.id as string;

      // 7. Visitor B cannot see Visitor A's redemption & Guest cannot call Admin API
      const stB = await fetch(
        `${srv.baseUrl}/visitor/reward-status?versionId=${encodeURIComponent(draft35.versionId)}`,
        { headers: { 'X-Visitor-Token': tokenB } }
      ).then((r) => r.json());
      expect(stB.redemption).toBeNull();
      expect(stB.recordedUniqueBooths).toBe(0);

      const guestAdminCall = await fetch(`${srv.baseUrl}/admin/redemptions`, {
        headers: { 'X-Visitor-Token': tokenA },
      });
      expect(guestAdminCall.status).toBe(401);

      // 8. Admin inspects list & detail -> sees HIGH riskLevel + RAPID_COMPLETION + BURST_VISIT_VELOCITY flags!
      const listRes = await fetch(`${srv.baseUrl}/admin/redemptions`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.status).toBe(200);
      const { redemptions } = (await listRes.json()) as { redemptions: Array<Record<string, unknown>> };
      expect(redemptions.length).toBe(1);
      expect(redemptions[0].riskLevel).toBe('high');
      expect(redemptions[0].riskFlags).toContain('RAPID_COMPLETION');
      expect(redemptions[0].riskFlags).toContain('BURST_VISIT_VELOCITY');

      const detailRes = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(detailRes.status).toBe(200);
      const { redemption: detail } = (await detailRes.json()) as {
        redemption: { visits: unknown[]; auditLogs: unknown[] };
      };
      expect(detail.visits.length).toBe(30);
      expect(detail.auditLogs.length).toBe(1);

      // 9. Illegal state transition: PENDING -> FULFILLED directly -> 409!
      const badFulfill = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ note: 'Skip approve' }),
      });
      expect(badFulfill.status).toBe(409);

      // 10. Two Admins review concurrently (one Approve, one Reject) -> strictly ONE 200, ONE 409 (no overwrite!)
      const [rev1, rev2] = await Promise.all([
        fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ decision: 'APPROVED' }),
        }),
        fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ decision: 'REJECTED', rejectionReason: 'Nghi vấn bất thường' }),
        }),
      ]);
      const revStatuses = [rev1.status, rev2.status].sort();
      expect(revStatuses).toEqual([200, 409]);

      // Ensure if APPROVED won, test fulfill + double-fulfill block (if REJECTED won, test fulfill blocked!)
      const afterRev = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).then((r) => r.json());

      if (afterRev.redemption.status === 'APPROVED') {
        const ful1 = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/fulfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ note: 'Đã trao quà tại quầy' }),
        });
        expect(ful1.status).toBe(200);
        const ful2 = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/fulfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ note: 'Trao lần 2' }),
        });
        expect(ful2.status).toBe(409); // Cannot fulfill twice!
      } else {
        const fulRejected = await fetch(`${srv.baseUrl}/admin/redemptions/${redemptionId}/fulfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({}),
        });
        expect(fulRejected.status).toBe(409);
      }

      // 11. Restart BE -> redemption & audit logs persist 100%
      await srv.close();
      srv = await startServer(dbFile);
      const afterRestart = await fetch(
        `${srv.baseUrl}/visitor/reward-status?versionId=${encodeURIComponent(draft35.versionId)}`,
        { headers: { 'X-Visitor-Token': tokenA } }
      ).then((r) => r.json());
      expect(afterRestart.redemption).not.toBeNull();
      expect(afterRestart.redemption.id).toBe(redemptionId);
      expect(afterRestart.eligibleToSubmit).toBe(false);
    } finally {
      await srv.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 20000);
});
