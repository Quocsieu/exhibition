/**
 * GRAND EXPO WORLD V28 — PHASE 4.3 SEPARATE-PROCESS REALTIME LOAD TEST
 *
 * Spawns the V28 Socket.IO Spatial AOI server in a DEDICATED child process,
 * while the parent process drives 100 / 300 / 500 concurrent Socket.IO clients
 * so server event-loop lag & latency are measured cleanly without client contention!
 */
import { fork } from 'node:child_process';
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
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 10) / 10;
}

if (process.argv.includes('--server-child')) {
  // CHILD PROCESS: Dedicated V28 Spatial AOI Server
  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();

  const v28Db = new V28CatalogDatabase(':memory:');
  const exhSvc = new V28ExhibitionService(v28Db);
  const exh = exhSvc.createExhibition({ name: 'SepProc 100', targetBoothCount: 100, preferredZoneCapacity: 10 });
  const v100 = exhSvc.publishVersion(exh.id, exh.latestDraftVersionId);

  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  const aoi = new V28SpatialAoiEngine(io, v100);

  httpServer.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port;
    process.send({
      type: 'ready',
      port,
      versionId: v100.versionId,
      spawnPoint: v100.spawnPoint,
    });
  });

  process.on('message', (msg) => {
    if (msg?.type === 'stats') {
      process.send({
        type: 'stats_reply',
        rssMB: Math.round((process.memoryUsage().rss / 1048576) * 10) / 10,
        eventLoopLagP95Ms: Math.round((eld.percentile(95) / 1e6) * 10) / 10,
        metrics: aoi.metrics,
      });
    } else if (msg?.type === 'shutdown') {
      aoi.dispose();
      io.close();
      httpServer.close(() => {
        v28Db.close();
        process.exit(0);
      });
    }
  });
} else {
  // PARENT PROCESS: Load Generator driving the isolated server child process
  const runScenario = async ({ baseUrl, count, versionId, spawnPoint, mode, durationMs = 3000 }) => {
    const clients = [];
    const latencies = [];
    let connectedCount = 0;
    let duplicateLogical = 0;
    let totalDeltaMsgs = 0;
    let maxAvatarsSeen = 0;
    let maxOverflowSeen = 0;

    const batchSize = 50;
    const tStart = performance.now();
    for (let start = 0; start < count; start += batchSize) {
      const size = Math.min(batchSize, count - start);
      const batch = await Promise.all(
        Array.from({ length: size }, (_, j) => {
          const i = start + j;
          return new Promise((resolve) => {
            const c = ioClient(`${baseUrl}${V28_REALTIME_NAMESPACE}`, {
              transports: ['websocket'],
              auth: { name: `Bot-${i}`, color: '#0ea5e9', deviceTier: i % 3 === 0 ? 'mobile' : 'desktop' },
              reconnection: mode === 'reconnect_storm',
            });
            const seen = new Map();
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
              latencies.push(Math.max(0, Date.now() - delta.serverTs));
              maxAvatarsSeen = Math.max(maxAvatarsSeen, (delta.upsert || []).length);
              maxOverflowSeen = Math.max(maxOverflowSeen, delta.overflowCount || 0);
              for (const leftId of delta.leave || []) seen.delete(leftId);
              for (const u of delta.upsert || []) {
                const prev = seen.get(u.sessionId);
                if (prev !== undefined && prev === u.seq) duplicateLogical++;
                seen.set(u.sessionId, u.seq);
              }
            });
            c.on('connect_error', () => resolve({ c, getSessionId: () => '', nextSeq: () => 0 }));
          });
        })
      );
      clients.push(...batch);
    }

    let reconnectSuccess = 0;
    if (mode === 'uniform') {
      for (let i = 0; i < clients.length; i++) {
        const bot = clients[i];
        bot.c.emit('v28:teleport', {
          versionId,
          seq: bot.nextSeq(),
          x: ((i % 7) - 3) * 1.0,
          z: spawnPoint.z - (i % 40) * 2.5,
          rotationY: Math.PI,
        });
      }
      await sleep(250);
      for (let s = 0; s < 5; s++) {
        for (let i = 0; i < clients.length; i++) {
          const bot = clients[i];
          bot.c.emit('v28:move', {
            sessionId: bot.getSessionId(),
            versionId,
            seq: bot.nextSeq(),
            x: ((i % 7) - 3) * 1.0,
            z: spawnPoint.z - (i % 40) * 2.5 - (s + 1) * 0.5,
            rotationY: Math.PI,
          });
        }
        await sleep(Math.round(durationMs / 5));
      }
    } else if (mode === 'hotspot') {
      for (let s = 0; s < 5; s++) {
        for (let i = 0; i < clients.length; i++) {
          const bot = clients[i];
          bot.c.emit('v28:move', {
            sessionId: bot.getSessionId(),
            versionId,
            seq: bot.nextSeq(),
            x: ((i % 9) - 4) * 0.4 + (s % 2 === 0 ? 0.2 : -0.2),
            z: spawnPoint.z - (i % 5) * 0.35,
            rotationY: 0,
          });
        }
        await sleep(Math.round(durationMs / 5));
      }
    } else if (mode === 'teleport_storm') {
      for (let w = 0; w < 2; w++) {
        for (let i = 0; i < clients.length; i++) {
          const bot = clients[i];
          bot.c.emit('v28:teleport', {
            versionId,
            seq: bot.nextSeq(),
            x: ((i % 5) - 2) * 1.2,
            z: spawnPoint.z - ((i + w * 19) % 35) * 2.5,
            rotationY: 0,
          });
        }
        await sleep(1000);
      }
    } else if (mode === 'reconnect_storm') {
      for (const bot of clients) bot.c.disconnect();
      await sleep(350);
      await Promise.all(
        clients.map(
          (bot) =>
            new Promise((resolve) => {
              const t = setTimeout(() => resolve(false), 4500);
              bot.c.once('v28:snapshot', () => {
                clearTimeout(t);
                reconnectSuccess++;
                resolve(true);
              });
              bot.c.connect();
            })
        )
      );
    }

    const elapsedMs = Math.round(performance.now() - tStart);
    for (const bot of clients) bot.c.disconnect();
    await sleep(300);
    latencies.sort((a, b) => a - b);

    return {
      mode,
      targetClients: count,
      connectedCount,
      elapsedMs,
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
  };

  (async () => {
    const child = fork(new URL(import.meta.url), ['--server-child']);
    const ready = await new Promise((resolve) => {
      child.once('message', (m) => resolve(m));
    });
    const baseUrl = `http://127.0.0.1:${ready.port}`;

    const getServerStats = () =>
      new Promise((resolve) => {
        child.once('message', (m) => resolve(m));
        child.send({ type: 'stats' });
      });

    try {
      const A100 = await runScenario({ baseUrl, count: 100, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'uniform' });
      const A300 = await runScenario({ baseUrl, count: 300, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'uniform' });
      const A500 = await runScenario({ baseUrl, count: 500, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'uniform' });
      const B500 = await runScenario({ baseUrl, count: 500, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'hotspot' });
      const C200 = await runScenario({ baseUrl, count: 200, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'teleport_storm' });
      const D250 = await runScenario({ baseUrl, count: 250, versionId: ready.versionId, spawnPoint: ready.spawnPoint, mode: 'reconnect_storm' });
      const serverStats = await getServerStats();

      console.log(
        JSON.stringify(
          {
            architecture: 'SEPARATE_PROCESS (dedicated server child process + parent load generator)',
            environment: {
              platform: `${os.platform()} ${os.release()}`,
              cpuModel: os.cpus()[0]?.model || 'unknown',
              cpuCores: os.cpus().length,
              totalRamGB: Math.round((os.totalmem() / 1073741824) * 10) / 10,
              nodeVersion: process.version,
            },
            serverStats,
            scenarios: {
              A_uniform_100: A100,
              A_uniform_300: A300,
              A_uniform_500: A500,
              B_hotspot_500: B500,
              C_teleport_storm_200: C200,
              D_reconnect_storm_250: D250,
              E_15min_soak: 'NOT VERIFIED (15-min sustained soak not executed in interactive session)',
            },
          },
          null,
          2
        )
      );
    } finally {
      child.send({ type: 'shutdown' });
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
