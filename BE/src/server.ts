import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Express } from 'express';
import cors from 'cors';
import type { Server } from 'socket.io';
import { ExpoDatabase } from './database/db.js';
import { V28CatalogDatabase } from './database/v28Database.js';
import { ExpoService } from './services/expoService.js';
import { ExpoController, type DataMutationCallback } from './controllers/expoController.js';
import { createApiRoutes } from './routes/apiRoutes.js';
import { createV28ApiRoutes } from './routes/v28Routes.js';
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
    const isAllowed =
      allowedList.includes('*') ||
      allowedList.includes(normalized) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalized);

    callback(null, isAllowed);
  };
}

export function createApp(
  db: ExpoDatabase,
  corsOrigin: CorsOriginConfig = '*',
  onMutation?: DataMutationCallback,
  v28Db?: V28CatalogDatabase
): Express {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

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
    app.use('/api/v28', createV28ApiRoutes(v28Db));
  }

  return app;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
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

  const db = new ExpoDatabase(dbPath);
  const v28Db = new V28CatalogDatabase(v28DbPath);
  const app = createApp(db, CORS_ORIGIN, undefined, v28Db);
  const httpServer = http.createServer(app);

  const io = attachSocketServer(httpServer, db, CORS_ORIGIN);
  app.set('io', io);

  httpServer.listen(PORT, () => {
    console.log(`[Virtual Expo BE] Running on http://localhost:${PORT}`);
    console.log(`[Virtual Expo BE] Legacy V27.5 DB: ${dbPath}`);
    console.log(`[Virtual Expo BE] Isolated V28 DB: ${v28DbPath}`);
    const svc = app.locals.expoService as ExpoService | undefined;
    svc?.prewarmTtsWorker();
  });

  const gracefulShutdown = () => {
    const svc = app.locals.expoService as ExpoService | undefined;
    void (svc ? svc.shutdown() : Promise.resolve()).finally(() => {
      httpServer.close(() => {
        try {
          db.close();
          v28Db.close();
        } catch {
          // ignore
        }
        process.exit(0);
      });
    });
  };

  process.once('SIGINT', gracefulShutdown);
  process.once('SIGTERM', gracefulShutdown);
}
