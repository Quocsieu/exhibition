import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Express } from 'express';
import cors from 'cors';
import type { Server } from 'socket.io';
import { ExpoDatabase } from './database/db.js';
import { V28CatalogDatabase } from './database/v28Database.js';
import { CloudDbSyncManager } from './database/cloudDbSync.js';
import { ExpoService } from './services/expoService.js';
import { ExpoController, type DataMutationCallback } from './controllers/expoController.js';
import { createApiRoutes } from './routes/apiRoutes.js';
import { createV28ApiRoutes } from './routes/v28Routes.js';
import { V28ExhibitionService } from './services/v28/exhibitionService.js';
import { V28SpatialAoiEngine } from './realtime/v28/spatialAoiEngine.js';
import { attachSocketServer } from './realtime/socketServer.js';
import type { ServerToClientEvents, ClientToServerEvents } from './schemas/expoSchemas.js';

const BE_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.VITEST) {
  dotenv.config({ path: path.resolve(BE_ROOT_DIR, '.env') });
}

export type CorsOriginConfig =
  | string
  | string[]
  | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);

export function buildCorsOriginChecker(rawCors: string = '*'): CorsOriginConfig {
  const trimmed = rawCors.trim();
  if (!trimmed || trimmed === '*') {
    return '*';
  }

  const allowedList = trimmed
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = origin.replace(/\/+$/, '');
    const isProd = process.env.NODE_ENV === 'production';
    const hasExplicitAllowlist = allowedList.length > 0 && !allowedList.includes('*');
    // V28-AUDIT-035B: Enforce strict CORS allowlist in production; no wildcard *.vercel.app bypass
    const isAllowed =
      allowedList.includes('*') ||
      allowedList.includes(normalized) ||
      (!isProd && !hasExplicitAllowlist && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) ||
      /^https?:\/\/([a-z0-9-]+\.)*mbws\.vn$/i.test(normalized);

    callback(null, isAllowed);
  };
}

export function resolveTrustProxyConfig(raw?: string): boolean | number | string {
  const val = (raw ?? process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (!val || val === 'false' || val === '0' || val === 'off') return false;
  if (val === 'loopback' || val === 'linklocal' || val === 'uniquelocal') return val;
  if (/^\d+$/.test(val)) {
    const hops = Number(val);
    if (Number.isInteger(hops) && hops >= 1 && hops <= 5) return hops;
  }
  // Fail closed: never allow unvalidated 'true' or arbitrary strings
  return false;
}

export function createApp(
  db: ExpoDatabase,
  corsOrigin: CorsOriginConfig = '*',
  onMutation?: DataMutationCallback,
  v28Db?: V28CatalogDatabase,
  cloudSync?: CloudDbSyncManager | null
): Express {
  const app = express();
  // Phase 3 Hardening: Explicit env-validated trust proxy (defaults safely to false; never hardcoded true)
  app.set('trust proxy', resolveTrustProxyConfig());
  app.use(
    cors({
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: [
        'X-TTS-Cache',
        'X-TTS-Provider',
        'X-TTS-Voice',
        'X-TTS-Chunk-Index',
        'X-TTS-Total-Chunks',
      ],
    })
  );
  // Phase 5 Hardening: Skip global 1mb JSON parser ONLY for the Excel base64 upload endpoint so valid <=5MB Excel (~7MB base64) is not rejected before v28Routes
  const globalJsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (req.path === '/api/v28/imports/excel/preview') {
      next();
      return;
    }
    globalJsonParser(req, res, next);
  });

  if (cloudSync) {
    // Auto-sync SQLite snapshots to Cloud PostgreSQL after any successful mutating API request
    app.use((req, res, next) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        res.on('finish', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return;
          if (req.path.startsWith('/api/v28/')) {
            if (
              req.path.includes('/auth/') ||
              req.path.includes('/ai/chat') ||
              req.path.includes('/ai/voice')
            ) {
              return;
            }
            const isPublish = req.path.endsWith('/publish');
            cloudSync.scheduleSync('v28', isPublish);
          } else if (req.path.startsWith('/api/')) {
            if (req.path.includes('/auth/') || req.path.includes('/tts')) return;
            cloudSync.scheduleSync('v27', false);
          }
        });
      }
      next();
    });
  }

  const service = new ExpoService(db);
  app.locals.expoService = service;
  const controller = new ExpoController(service, (payload) => {
    onMutation?.(payload);
    const io = app.get('io') as Server<ClientToServerEvents, ServerToClientEvents> | undefined;
    if (io) {
      io.emit('expo:data-updated', {
        ...payload,
        timestamp: Date.now(),
      });
    }
  });
  app.use('/api', createApiRoutes(controller));

  if (v28Db) {
    app.locals.v28Db = v28Db;
    const v28ExhibitionService = new V28ExhibitionService(v28Db);
    app.locals.v28ExhibitionService = v28ExhibitionService;
    app.use(
      '/api/v28',
      createV28ApiRoutes(v28Db, undefined, v28ExhibitionService, (publishedVersion) => {
        const aoi = app.locals.v28SpatialAoi as V28SpatialAoiEngine | undefined;
        aoi?.onLayoutPublished(publishedVersion);
        cloudSync?.scheduleSync('v28', true);
      })
    );
  }

  return app;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  void (async () => {
    const PORT = Number(process.env.PORT || 4000);
    const CORS_ORIGIN = buildCorsOriginChecker(process.env.CORS_ORIGIN || '*');
    const rawDbPath = process.env.SQLITE_DB_PATH || './data/expo.db';
    const dbPath =
      rawDbPath === ':memory:' || path.isAbsolute(rawDbPath)
        ? rawDbPath
        : path.resolve(BE_ROOT_DIR, rawDbPath);

    const rawV28DbPath = process.env.V28_SQLITE_DB_PATH || './data/expo_v28_dev.db';
    const v28DbPath =
      rawV28DbPath === ':memory:' || path.isAbsolute(rawV28DbPath)
        ? rawV28DbPath
        : path.resolve(BE_ROOT_DIR, rawV28DbPath);

    // Optional Cloud DB Persistence (Neon / Supabase / Render PostgreSQL via DATABASE_URL)
    const cloudSync = CloudDbSyncManager.fromEnv();
    if (cloudSync) {
      try {
        await cloudSync.init();
        await cloudSync.restoreDatabase('v27', dbPath);
        await cloudSync.restoreDatabase('v28', v28DbPath);
        console.log('[Virtual Expo BE] Cloud DB Persistence: ENABLED (PostgreSQL Snapshot Sync)');
      } catch (err) {
        console.error('[Virtual Expo BE] Cloud DB restore failed — falling back to local SQLite:', err);
      }
    }

    const db = new ExpoDatabase(dbPath);
    const v28Db = new V28CatalogDatabase(v28DbPath);

    if (cloudSync) {
      cloudSync.registerDatabase({
        dbKey: 'v27',
        filePath: dbPath,
      });
      cloudSync.registerDatabase({
        dbKey: 'v28',
        filePath: v28DbPath,
        checkpoint: () => v28Db.getConnection().exec('PRAGMA wal_checkpoint(TRUNCATE);'),
      });
      // Seed initial snapshot to cloud if remote DB was empty on first boot
      void cloudSync.flushAll();
    }

    const app = createApp(db, CORS_ORIGIN, undefined, v28Db, cloudSync);
    const httpServer = http.createServer(app);
    // Phase 4.2 Hardening: Configurable HTTP timeouts compatible with Nginx/Plesk reverse proxy & long imports
    httpServer.keepAliveTimeout = Math.max(5000, Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000));
    httpServer.headersTimeout = Math.max(
      httpServer.keepAliveTimeout + 1000,
      Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000)
    );
    httpServer.requestTimeout = Math.max(10000, Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 60000));

    const io = attachSocketServer(httpServer, db, CORS_ORIGIN);
    app.set('io', io);

    const v28ExhService = app.locals.v28ExhibitionService as V28ExhibitionService | undefined;
    const v28SpatialAoi = v28ExhService
      ? new V28SpatialAoiEngine(io, v28ExhService.getActiveExhibitionWorld())
      : undefined;
    if (v28SpatialAoi) {
      app.locals.v28SpatialAoi = v28SpatialAoi;
    }

    httpServer.listen(PORT, () => {
      console.log(`[Virtual Expo BE] Running on http://localhost:${PORT}`);
      console.log(`[Virtual Expo BE] Legacy V27.5 DB: ${dbPath}`);
      console.log(`[Virtual Expo BE] Isolated V28 DB: ${v28DbPath}`);
      const svc = app.locals.expoService as ExpoService | undefined;
      svc?.prewarmTtsWorker();
    });

    const gracefulShutdown = () => {
      const svc = app.locals.expoService as ExpoService | undefined;
      // V28-AUDIT-033B: Close Socket.IO & force-exit fallback so active WebSockets never hang shutdown
      const forceTimer = setTimeout(() => process.exit(0), 5000);
      forceTimer.unref?.();
      void Promise.allSettled([
        svc ? svc.shutdown() : Promise.resolve(),
        cloudSync ? cloudSync.close() : Promise.resolve(),
      ]).finally(() => {
        try {
          v28SpatialAoi?.dispose();
          io.close();
        } catch {
          // ignore
        }
        httpServer.close(() => {
          try {
            db.close();
            v28Db.close();
          } catch {
            // ignore
          }
          clearTimeout(forceTimer);
          process.exit(0);
        });
      });
    };

    process.once('SIGINT', gracefulShutdown);
    process.once('SIGTERM', gracefulShutdown);
  })();
}
