import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import cors from 'cors';
import { ExpoDatabase } from './database/db.js';
import { ExpoService } from './services/expoService.js';
import { ExpoController } from './controllers/expoController.js';
import { createApiRoutes } from './routes/apiRoutes.js';
import { attachSocketServer } from './realtime/socketServer.js';

export function createApp(db: ExpoDatabase, corsOrigin: string | string[] = '*'): Express {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  const service = new ExpoService(db);
  const controller = new ExpoController(service);
  app.use('/api', createApiRoutes(controller));

  return app;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const PORT = Number(process.env.PORT || 4000);
  const rawCors = process.env.CORS_ORIGIN || '*';
  const CORS_ORIGIN =
    rawCors === '*'
      ? '*'
      : rawCors
          .split(',')
          .map((origin) => origin.trim().replace(/\/+$/, ''))
          .filter(Boolean);
  const dbPath = process.env.SQLITE_DB_PATH || './data/expo.db';

  const db = new ExpoDatabase(dbPath);
  const app = createApp(db, CORS_ORIGIN);
  const httpServer = http.createServer(app);

  attachSocketServer(httpServer, db, CORS_ORIGIN);

  httpServer.listen(PORT, () => {
    console.log(`[Virtual Expo BE] Running on http://localhost:${PORT}`);
  });
}
