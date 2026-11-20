import http from 'node:http';
import os from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { V28CatalogDatabase } from '../../BE/dist/database/v28Database.js';
import { V28ExhibitionService } from '../../BE/dist/services/v28/exhibitionService.js';
import {
  V28SpatialAoiEngine,
  V28_REALTIME_NAMESPACE,
} from '../../BE/dist/realtime/v28/spatialAoiEngine.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 10) / 10;
}

async function runScenario({ baseUrl, count, versionId, spawnPoint, mode, durationMs = 3500 }) {
  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();

  const clients = [];
  const latencies = [];
  let connectedCount = 0;
  let duplicateLogical = 0;
  let totalDeltaMsgs = 0;
  let maxAvatarsSeen = 0;
  let maxOverflowSeen = 0;
  const seenPerClient = new Map();

  const connectBatch = async (startIdx, batchSize) => {
    const proms = [];
    for (let i = startIdx; i < startIdx + batchSize; i++) {
      proms.push(
        new Promise((resolve) => {
          const c = ioClient(`${baseUrl}${V28_REALTIME_NAMESPACE}`, {
            transports: ['websocket'],
            auth: {
              name: `Bot-${i}`,
              color: '#0ea5e9',
              deviceTier: i % 3 === 0 ? 'mobile' : 'desktop',
            },
            reconnection: mode === 'reconnect_storm',
          });
          const seen = new Map();
          seenPerClient.set(i, seen);
          let mySessionId = '';
          let seq = 0;

          c.once('v28:snapshot', (snap) => {
            mySessionId = snap.sessionId;
            connectedCount++;
            maxAvatarsSeen = Math.max(maxAvatarsSeen, (snap.avatars || []).length);
            maxOverflowSeen = Math.max(maxOverflowSeen, snap.overflowCount || 0);
            resolve({ c, getSessionId: () => mySessionId, nextSeq: () => ++seq });
          });

          c.on('v28:delta', (delta) => {
            totalDeltaMsgs++;
            const lat = Math.max(0, Date.now() - delta.serverTs);
            latencies.push(lat);
            maxAvatarsSeen = Math.max(maxAvatarsSeen, (delta.upsert || []).length);
            maxOverflowSeen = Math.max(maxOverflowSeen, delta.overflowCount || 0);
            for (const leftId of delta.leave || []) {
              seen.delete(leftId);
            }
            for (const u of delta.upsert || []) {
              const prevSeq = seen.get(u.sessionId);
              if (prevSeq !== undefined && prevSeq === u.seq) duplicateLogical++;
              seen.set(u.sessionId, u.seq);
            }
          });

          c.on('connect_error', () => resolve({ c, getSessionId: () => '', nextSeq: () => 0 }));
        })
      );
    }
    const batch = await Promise.all(proms);
    clients.push(...batch);
  };

  const tStart = performance.now();
  const batchSize = 50;
  for (let i = 0; i < count; i += batchSize) {
    await connectBatch(i, Math.min(batchSize, count - i));
  }

  let reconnectSuccess = 0;
  if (mode === 'uniform') {
    // Spread bots cleanly along Central Avenue (x in [-3.5, +3.5], z across hall) via teleport then walk
    for (let i = 0; i < clients.length; i++) {
      const bot = clients[i];
      const tx = ((i % 7) - 3) * 1.0;
      const tz = spawnPoint.z - (i % 40) * 2.5;
      bot.c.emit('v28:teleport', { versionId, seq: bot.nextSeq(), x: tx, z: tz, rotationY: Math.PI });
    }
    await sleep(300);
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < clients.length; i++) {
        const bot = clients[i];
        const tx = ((i % 7) - 3) * 1.0;
        const tz = spawnPoint.z - (i % 40) * 2.5 - (s + 1) * 0.6;
        bot.c.emit('v28:move', {
          sessionId: bot.getSessionId(),
          versionId,
          seq: bot.nextSeq(),
          x: tx,
          z: tz,
          rotationY: Math.PI,
        });
      }
      await sleep(Math.round(durationMs / steps));
    }
  } else if (mode === 'hotspot') {
    // All 500 bots stay packed inside the SAME spawn cell & micro-step
    const steps = 5;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < clients.length; i++) {
        const bot = clients[i];
        const jitterX = ((i % 9) - 4) * 0.4 + (s % 2 === 0 ? 0.2 : -0.2);
        const jitterZ = spawnPoint.z - (i % 5) * 0.35;
        bot.c.emit('v28:move', {
          sessionId: bot.getSessionId(),
          versionId,
          seq: bot.nextSeq(),
          x: jitterX,
          z: jitterZ,
          rotationY: 0,
        });
      }
      await sleep(Math.round(durationMs / steps));
    }
  } else if (mode === 'teleport_storm') {
    // 200 bots teleporting within 3 seconds
    for (let wave = 0; wave < 2; wave++) {
      for (let i = 0; i < clients.length; i++) {
        const bot = clients[i];
        const tx = ((i % 5) - 2) * 1.2;
        const tz = spawnPoint.z - ((i + wave * 17) % 35) * 2.5;
        bot.c.emit('v28:teleport', { versionId, seq: bot.nextSeq(), x: tx, z: tz, rotationY: 0 });
      }
      await sleep(1200);
    }
  } else if (mode === 'reconnect_storm') {
    // Disconnect all 250 bots and reconnect them within 5s
    for (const bot of clients) bot.c.disconnect();
    await sleep(400);
    const reconProms = clients.map(
      (bot) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 4500);
          bot.c.once('v28:snapshot', () => {
            clearTimeout(timer);
            reconnectSuccess++;
            resolve(true);
          });
          bot.c.connect();
        })
    );
    await Promise.all(reconProms);
  }

  const elapsedMs = Math.round(performance.now() - tStart);
  eld.disable();

  for (const bot of clients) {
    bot.c.disconnect();
  }
  await sleep(300);

  latencies.sort((a, b) => a - b);
  return {
    mode,
    targetClients: count,
    connectedCount,
    elapsedMs,
    rssMB: Math.round((process.memoryUsage().rss / 1048576) * 10) / 10,
    eventLoopLagP95Ms: Math.round((eld.percentile(95) / 1e6) * 10) / 10,
    totalDeltaMsgs,
    duplicateLogicalEvents: duplicateLogical,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    maxAvatarsInSingleDelta: maxAvatarsSeen,
    maxOverflowSeen,
    ...(mode === 'reconnect_storm' ? { reconnectSuccess, reconnectRatePct: Math.round((reconnectSuccess / count) * 1000) / 10 } : {}),
  };
}

async function main() {
  const v28Db = new V28CatalogDatabase(':memory:');
  const exhSvc = new V28ExhibitionService(v28Db);
  const exh = exhSvc.createExhibition({ name: 'LoadTest 100', targetBoothCount: 100, preferredZoneCapacity: 10 });
  const v100 = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId);

  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e6,
  });
  const aoi = new V28SpatialAoiEngine(io, v100);

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const envInfo = {
    platform: `${os.platform()} ${os.release()}`,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    cpuCores: os.cpus().length,
    totalRamGB: Math.round((os.totalmem() / 1073741824) * 10) / 10,
    nodeVersion: process.version,
    booths: v100.booths.length,
    zones: v100.zones.length,
  };

  try {
    const scenarioA100 = await runScenario({ baseUrl, count: 100, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'uniform' });
    const scenarioA300 = await runScenario({ baseUrl, count: 300, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'uniform' });
    const scenarioA500 = await runScenario({ baseUrl, count: 500, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'uniform' });
    const scenarioBHotspot500 = await runScenario({ baseUrl, count: 500, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'hotspot' });
    const scenarioCTeleport200 = await runScenario({ baseUrl, count: 200, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'teleport_storm' });
    const scenarioDReconnect250 = await runScenario({ baseUrl, count: 250, versionId: v100.versionId, spawnPoint: v100.spawnPoint, mode: 'reconnect_storm' });

    console.log(
      JSON.stringify(
        {
          environment: envInfo,
          serverMetrics: aoi.metrics,
          scenarios: {
            A_uniform_100: scenarioA100,
            A_uniform_300: scenarioA300,
            A_uniform_500: scenarioA500,
            B_hotspot_500: scenarioBHotspot500,
            C_teleport_storm_200: scenarioCTeleport200,
            D_reconnect_storm_250: scenarioDReconnect250,
            E_15min_soak: 'NOT RUN (short sustained runs executed above; full 15-min soak deferred to dedicated staging run)',
          },
        },
        null,
        2
      )
    );
  } finally {
    aoi.dispose();
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    v28Db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
