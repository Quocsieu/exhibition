import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { V28CatalogDatabase } from '../database/v28Database.js';
import { V28ExhibitionService } from '../services/v28/exhibitionService.js';
import {
  V28SpatialAoiEngine,
  V28_REALTIME_NAMESPACE,
  MOBILE_AVATAR_BUDGET,
} from '../realtime/v28/spatialAoiEngine.js';

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

describe('V28 PHASE 4 — 100 Booths, Spatial AOI, Security Guards, Hotspot Budget & Live Publish', () => {
  it('enforces 3x3 AOI filtering, 0 duplicate logical events, security guards, hotspot budget, live publish relocation, and zero cross-world leakage', async () => {
    const v28Db = new V28CatalogDatabase(':memory:');
    const exhSvc = new V28ExhibitionService(v28Db);
    const exh = exhSvc.createExhibition({ name: 'Grand Expo 100', targetBoothCount: 100, preferredZoneCapacity: 10 });
    const v100 = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId!);
    expect(v100.booths.length).toBe(100);
    expect(v100.zones.length).toBe(6); // 6 Category-Based Zones (Phase 8.3)
    expect(v100.clusters.length).toBeGreaterThanOrEqual(17);
    expect(v100.validation.valid).toBe(true);

    const httpServer = http.createServer();
    const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
    const aoi = new V28SpatialAoiEngine(io, v100);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const clients: ClientSocket[] = [];
    const connectV28 = (name: string, deviceTier: 'desktop' | 'mobile' = 'desktop') => {
      const c = ioClient(`${baseUrl}${V28_REALTIME_NAMESPACE}`, {
        transports: ['websocket'],
        auth: { name, color: '#0ea5e9', deviceTier },
      });
      clients.push(c);
      return c;
    };

    try {
      // 1. Cross-world isolation: legacy root namespace client receives ZERO V28 events
      const legacyClient = ioClient(baseUrl, { transports: ['websocket'] });
      clients.push(legacyClient);
      let legacyGotV28 = false;
      legacyClient.on('v28:delta', () => { legacyGotV28 = true; });
      legacyClient.on('v28:snapshot', () => { legacyGotV28 = true; });
      legacyClient.on('v28:layout_changed', () => { legacyGotV28 = true; });

      // 2. Connect Visitor A (desktop) and Visitor B (desktop)
      const cA = connectV28('Visitor A', 'desktop');
      const snapA = await waitForEvent<{ sessionId: string; versionId: string; self: { x: number; z: number } }>(
        cA,
        'v28:snapshot'
      );
      expect(snapA.versionId).toBe(v100.versionId);

      const cB = connectV28('Visitor B', 'desktop');
      const snapB = await waitForEvent<{ sessionId: string; onlineCount: number; avatars: Array<{ sessionId: string }> }>(
        cB,
        'v28:snapshot'
      );
      expect(snapB.onlineCount).toBe(2);
      expect(snapB.avatars.some((a) => a.sessionId === snapA.sessionId)).toBe(true);

      // 3. Track duplicate logical updates on A while B moves
      const seenSeqs = new Set<string>();
      let duplicateLogicalCount = 0;
      cA.on('v28:delta', (delta: { upsert: Array<{ sessionId: string; seq: number }> }) => {
        for (const u of delta.upsert) {
          const key = `${u.sessionId}:${u.seq}`;
          if (seenSeqs.has(key)) duplicateLogicalCount++;
          seenSeqs.add(key);
        }
      });

      // Valid move by B along central avenue — wait specifically for delta carrying seq === 1
      const deltaPromise = new Promise<{ upsert: Array<{ sessionId: string; seq: number }> }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for seq=1 delta')), 4000);
        const handler = (d: { upsert: Array<{ sessionId: string; seq: number }> }) => {
          if (d.upsert.some((u) => u.sessionId === snapB.sessionId && u.seq === 1)) {
            clearTimeout(timer);
            cA.off('v28:delta', handler);
            resolve(d);
          }
        };
        cA.on('v28:delta', handler);
      });
      cB.emit('v28:move', {
        sessionId: snapB.sessionId,
        versionId: v100.versionId,
        seq: 1,
        x: 0.5,
        z: v100.spawnPoint.z - 1.5,
        rotationY: Math.PI,
      });
      const firstDelta = await deltaPromise;
      expect(firstDelta.upsert.some((u) => u.sessionId === snapB.sessionId && u.seq === 1)).toBe(true);
      expect(duplicateLogicalCount).toBe(0);

      // 4. Security Guards:
      // 4a. Speed-hack rejection
      const corrPromise = waitForEvent<{ reason: string }>(cB, 'v28:correction');
      cB.emit('v28:move', {
        sessionId: snapB.sessionId,
        versionId: v100.versionId,
        seq: 2,
        x: 0,
        z: -50, // 100+ meters in 1 tick -> speed hack!
        rotationY: 0,
      });
      const corr = await corrPromise;
      expect(corr.reason).toBe('speed_limit');

      // 4b. Booth-collision teleport rejection
      const firstBooth = v100.booths[0];
      const errPromise = waitForEvent<{ code: string }>(cB, 'v28:error');
      cB.emit('v28:teleport', {
        versionId: v100.versionId,
        seq: 3,
        x: firstBooth.positionX,
        z: firstBooth.positionZ, // inside booth AABB!
        rotationY: 0,
      });
      const errEvt = await errPromise;
      expect(errEvt.code).toBe('INVALID_TELEPORT_TARGET');

      // 4c. Stale versionId dropped
      const beforeStale = aoi.metrics.staleUpdatesDropped;
      cB.emit('v28:move', {
        sessionId: snapB.sessionId,
        versionId: 'ver-stale-old',
        seq: 4,
        x: 0.5,
        z: v100.spawnPoint.z - 2.0,
        rotationY: Math.PI,
      });
      await new Promise((r) => setTimeout(r, 80));
      expect(aoi.metrics.staleUpdatesDropped).toBeGreaterThan(beforeStale);

      // 5. Hotspot Render Budget (Mobile cap = 15, accurate totalOnlineCount & overflowCount)
      const mobileClient = connectV28('Mobile Hotspot', 'mobile');
      await waitForEvent(mobileClient, 'v28:snapshot');

      // Spawn 20 more visitors into the same spawn cell -> 23 total online (> 15 mobile cap!)
      const hotspotSnaps = await Promise.all(
        Array.from({ length: 20 }, (_, i) => {
          const c = connectV28(`Hotspot-${i}`, 'desktop');
          return waitForEvent(c, 'v28:snapshot');
        })
      );
      expect(hotspotSnaps.length).toBe(20);

      // Wait one tick and check mobile client's snapshot via teleport to spawn
      const mobileSnapPromise = waitForEvent<{
        onlineCount: number;
        nearbyCount: number;
        overflowCount: number;
        avatars: unknown[];
      }>(mobileClient, 'v28:snapshot');
      mobileClient.emit('v28:teleport', {
        versionId: v100.versionId,
        seq: 1,
        x: v100.spawnPoint.x,
        z: v100.spawnPoint.z,
        rotationY: Math.PI,
      });
      const mobileSnap = await mobileSnapPromise;
      expect(mobileSnap.onlineCount).toBe(23);
      expect(mobileSnap.avatars.length).toBe(MOBILE_AVATAR_BUDGET);
      expect(mobileSnap.overflowCount).toBe(22 - MOBILE_AVATAR_BUDGET);

      // 6. Live Layout Publish while visitors are online -> broadcasts v28:layout_changed
      const layoutChangedPromise = waitForEvent<{ versionId: string; boothCount: number }>(
        cA,
        'v28:layout_changed'
      );
      const draft20 = exhSvc.createDraftVersion(exh.id, { targetBoothCount: 20, preferredZoneCapacity: 10 });
      const pub20 = exhSvc.publishVersion(exh.id, draft20.versionId);
      aoi.onLayoutPublished(pub20);
      const lcEvt = await layoutChangedPromise;
      expect(lcEvt.versionId).toBe(pub20.versionId);
      expect(lcEvt.boothCount).toBe(20);

      // 7. Confirm zero cross-world leakage to legacy namespace
      expect(legacyGotV28).toBe(false);
    } finally {
      for (const c of clients) c.disconnect();
      aoi.dispose();
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      v28Db.close();
    }
  });
});
