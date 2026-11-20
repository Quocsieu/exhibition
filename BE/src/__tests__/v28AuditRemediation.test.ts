import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { ExpoDatabase } from '../database/db.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import { createApp } from '../server.js';
import {
  isPrivateOrReservedIp,
  validateExternalUrlSafety,
} from '../integrations/productAdapter.js';
import {
  authenticateAdminCredentials,
  isDemoLoginEnabled,
  getDemoAccountCredentials,
  resetAdminLoginRateLimitForTests,
} from '../middleware/adminAuth.js';

const origEnv = { ...process.env };
afterEach(() => {
  process.env.NODE_ENV = origEnv.NODE_ENV;
  process.env.ADMIN_DEMO_MODE = origEnv.ADMIN_DEMO_MODE;
  process.env.ADMIN_USERNAME = origEnv.ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD = origEnv.ADMIN_PASSWORD;
  resetAdminLoginRateLimitForTests();
});

describe('V28 Full Audit Remediation — Phase 1 (Draft/Published Isolation), Phase 2 (Security) & Phase 7 (Demo Login)', () => {
  it('V28-AUDIT-001: Draft edits, deletes, slot swaps & auto-allocate NEVER mutate Published v1; Publish v2 & Rollback v1 restore exact snapshots', () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const service = new V28ExhibitionService(v28Db);
    const comp = v28Db.listCompanies({ status: 'active' })[0];
    const prods = v28Db.listProducts({ companyId: comp.id, status: 'active' }).items;
    expect(prods.length).toBeGreaterThanOrEqual(2);

    const exh = service.createExhibition({
      name: 'Snapshot Test Expo',
      targetBoothCount: 6,
      preferredZoneCapacity: 6,
      ownerCompanyId: comp.id,
    });
    const v1Id = exh.latestDraftVersionId!;
    const v1Draft = service.getVersionDetail(v1Id)!;
    const b0 = v1Draft.booths[0];
    const b1 = v1Draft.booths[1];

    // Assign product to b0 in Draft v1 and publish v1
    service.assignDraftBoothSlot(v1Id, b0.boothId, 'slot_01', prods[0].id, exh.id);
    service.updateDraftBoothPlacement(v1Id, b0.boothId, { boothName: 'Published Booth Alpha' }, exh.id);
    const pubV1 = service.publishVersion(exh.id, v1Id);
    expect(pubV1.status).toBe('published');
    expect(pubV1.booths.length).toBe(6);
    expect(pubV1.booths.find((b) => b.boothId === b0.boothId)?.boothName).toBe('Published Booth Alpha');
    expect(pubV1.booths.find((b) => b.boothId === b0.boothId)?.slots.find((s) => s.slotId === 'slot_01')?.product?.id).toBe(prods[0].id);

    // Create Draft v2 from Published v1
    const v2Draft = service.createDraftVersion(exh.id, {
      targetBoothCount: 6,
      preferredZoneCapacity: 6,
      baseVersionId: v1Id,
      ownerCompanyId: comp.id,
    });

    // Mutate Draft v2 heavily: rename first booth, swap slot_01 to prods[1], delete second booth with forceUnassign, run auto-allocate
    const v2b0 = v2Draft.booths[0];
    const v2b1 = v2Draft.booths[1];
    service.updateDraftBoothPlacement(v2Draft.versionId, v2b0.boothId, { boothName: 'Draft V2 Renamed Booth' }, exh.id);
    service.assignDraftBoothSlot(v2Draft.versionId, v2b0.boothId, 'slot_01', prods[1].id, exh.id);
    service.deleteDraftBoothPlacement(v2Draft.versionId, v2b1.boothId, { forceUnassign: true, expectedExhibitionId: exh.id });
    service.autoAllocateDraftProducts(v2Draft.versionId, { companyId: comp.id, expectedExhibitionId: exh.id });

    // ASSERT: Published v1 (Active World) is 100% UNCHANGED!
    const activeBeforePublish = service.getActiveExhibitionWorld();
    expect(activeBeforePublish.versionId).toBe(v1Id);
    expect(activeBeforePublish.booths.length).toBe(6);
    expect(activeBeforePublish.booths.find((b) => b.boothId === b0.boothId)?.boothName).toBe('Published Booth Alpha');
    expect(activeBeforePublish.booths.find((b) => b.boothId === b0.boothId)?.slots.find((s) => s.slotId === 'slot_01')?.product?.id).toBe(prods[0].id);
    expect(activeBeforePublish.booths.some((b) => b.boothId === b1.boothId)).toBe(true);

    // Publish v2 -> Active World switches cleanly to v2 (5 booths, renamed v2b0, prods[1] in slot_01)
    const pubV2 = service.publishVersion(exh.id, v2Draft.versionId);
    expect(pubV2.booths.length).toBe(5);
    expect(service.getActiveExhibitionWorld().versionId).toBe(v2Draft.versionId);
    expect(service.getActiveExhibitionWorld().booths.find((b) => b.boothId === v2b0.boothId)?.boothName).toBe('Draft V2 Renamed Booth');
    expect(service.getActiveExhibitionWorld().booths.find((b) => b.boothId === v2b0.boothId)?.slots.find((s) => s.slotId === 'slot_01')?.product?.id).toBe(prods[1].id);

    // Rollback to v1 -> Active World, booths.status, and booth_slot_assignments restore v1 100%!
    const rolled = service.rollbackVersion(exh.id, v1Id);
    expect(rolled.versionId).toBe(v1Id);
    expect(rolled.booths.length).toBe(6);
    expect(rolled.booths.find((b) => b.boothId === b0.boothId)?.boothName).toBe('Published Booth Alpha');
    expect(rolled.booths.find((b) => b.boothId === b0.boothId)?.slots.find((s) => s.slotId === 'slot_01')?.product?.id).toBe(prods[0].id);
    expect(v28Db.getBoothById(b1.boothId)?.status).toBe('active');
    v28Db.close();
  });

  it('V28-AUDIT-010: blocks IPv4-mapped IPv6 hex normalization (::ffff:7f00:1, ::ffff:a9fe:a9fe) and NAT64', async () => {
    expect(isPrivateOrReservedIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:a9fe:a9fe')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:c0a8:101')).toBe(true);
    expect(isPrivateOrReservedIp('64:ff9b::127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:5db8:d822')).toBe(false); // 93.184.216.34 (public)
    await expect(validateExternalUrlSafety('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/IP nội bộ/i);
    await expect(validateExternalUrlSafety('http://[::ffff:169.254.169.254]/latest/meta-data')).rejects.toThrow(/IP nội bộ/i);
  });

  it('V28-AUDIT-012, 014B, 035C, 046 & Phase 7: protects Drafts, enforces exhibitionId/color validation, and gates Demo Login strictly to non-prod', async () => {
    const legacyDb = new ExpoDatabase(':memory:');
    const v28Db = new V28CatalogDatabase(':memory:');
    const app = createApp(legacyDb, '*', undefined, v28Db);
    const server = http.createServer(app);
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v28`;

    try {
      // Phase 7: Demo mode ON in local dev
      process.env.NODE_ENV = 'development';
      process.env.ADMIN_DEMO_MODE = 'true';
      process.env.ADMIN_PASSWORD = 'super-secret-real-pass';
      expect(isDemoLoginEnabled()).toBe(true);
      const demoCfgRes = await fetch(`${base}/auth/demo-config`);
      const demoCfg = (await demoCfgRes.json()) as { demoEnabled: boolean; label?: string; username?: string; password?: string };
      expect(demoCfg.demoEnabled).toBe(true);
      expect(demoCfg.label).toBe('Tài khoản dùng thử');
      expect(demoCfg.password).not.toBe('super-secret-real-pass');

      // Demo credentials authenticate cleanly via real backend auth
      const demoToken = authenticateAdminCredentials(demoCfg.username, demoCfg.password);
      expect(demoToken).toBeTruthy();
      expect(authenticateAdminCredentials(demoCfg.username, 'wrong-pass')).toBeNull();

      // Create an exhibition with Draft
      const exhRes = await fetch(`${base}/exhibitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoToken}` },
        body: JSON.stringify({ name: 'Auth Guard Expo', targetBoothCount: 6, preferredZoneCapacity: 6 }),
      });
      const { exhibition } = (await exhRes.json()) as { exhibition: { id: string; latestDraftVersionId: string } };

      // V28-AUDIT-012: Unauthenticated guest cannot preview Draft or fetch Draft version
      const unauthPreview = await fetch(`${base}/exhibitions/active?previewVersionId=${exhibition.latestDraftVersionId}`);
      expect(unauthPreview.status).toBe(401);
      const unauthDraft = await fetch(`${base}/exhibitions/${exhibition.id}/versions/${exhibition.latestDraftVersionId}`);
      expect(unauthDraft.status).toBe(401);

      // V28-AUDIT-014B: Wrong exhibitionId on Draft mutation returns 404
      const wrongExhPatch = await fetch(
        `${base}/exhibitions/exh-nonexistent/versions/${exhibition.latestDraftVersionId}/booths/any-booth`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoToken}` },
          body: JSON.stringify({ boothName: 'Hack' }),
        }
      );
      expect(wrongExhPatch.status).toBe(404);

      // V28-AUDIT-035C: Invalid CSS color rejected on POST /categories
      const badColor = await fetch(`${base}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoToken}` },
        body: JSON.stringify({ name: 'Bad Color', color: 'red;background:url(x)' }),
      });
      expect(badColor.status).toBe(400);

      // V28-AUDIT-046: Unauthenticated /ai/status omits internal usage & audioCacheMetrics
      const pubAi = (await (await fetch(`${base}/ai/status`)).json()) as Record<string, unknown>;
      expect(pubAi.usage).toBeUndefined();
      expect(pubAi.audioCacheMetrics).toBeUndefined();

      // Phase 7: Demo mode OFF in production -> zero credentials exposed & demo login rejected
      process.env.NODE_ENV = 'production';
      expect(isDemoLoginEnabled()).toBe(false);
      expect(getDemoAccountCredentials()).toBeNull();
      const prodCfg = (await (await fetch(`${base}/auth/demo-config`)).json()) as { demoEnabled: boolean; password?: string };
      expect(prodCfg.demoEnabled).toBe(false);
      expect(prodCfg.password).toBeUndefined();
      expect(authenticateAdminCredentials(demoCfg.username, demoCfg.password)).toBeNull();
    } finally {
      server.close();
      v28Db.close();
      legacyDb.close();
    }
  });
});
