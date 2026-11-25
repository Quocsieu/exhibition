import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.resolve(ROOT, '.env') });

const BE_PORT = Number(process.env.PORT || 4100);
const FE_PORT = Number(process.env.FE_PORT || 4173);
const PROD_ORIGIN = 'https://exhibition-xl20.onrender.com';
const V28_PROXY_TARGET = (process.env.V28_API_PROXY_TARGET || PROD_ORIGIN).replace(/\/+$/, '');
const LOCAL_BE_ORIGIN = `http://127.0.0.1:${BE_PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
};

function proxyRequest(req, res, targetBase) {
  const targetUrl = new URL(req.url || '/', targetBase);
  const client = targetUrl.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: targetUrl.host };
  delete headers.origin;
  delete headers.referer;

  const proxyReq = client.request(
    targetUrl,
    { method: req.method, headers },
    (proxyRes) => {
      const resHeaders = { ...proxyRes.headers };
      resHeaders['access-control-allow-origin'] = '*';
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 502, resHeaders);
      }
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Local proxy error: ${err.message}` }));
    } else if (!res.writableEnded) {
      res.end();
    }
  });
  req.pipe(proxyReq);
}

// 1. Start local Backup Backend on BE_PORT (default 4100, isolated from main project's 4000)
const tsxCli = path.resolve(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const beChild = spawn(process.execPath, [tsxCli, 'watch', 'src/server.ts'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(BE_PORT),
    SQLITE_DB_PATH: process.env.SQLITE_DB_PATH || './data/expo.db',
  },
  stdio: 'inherit',
});

beChild.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`[exhibition_backup] Backend exited with code ${code}`);
  }
});

// 2. Start local Frontend static + API proxy server on FE_PORT (default 4173)
const feServer = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  const pathname = decodeURIComponent(reqUrl.split('?')[0]);

  // All FE API, Socket.IO & uploads -> V28_PROXY_TARGET so auth (/api/admin/login, /api/admin/me),
  // V28 routes (/api/v28/*), and catalog routes (/api/products, /api/booths, ...) share one backend & token secret.
  // Local Backup BE remains directly accessible on http://localhost:${BE_PORT}/api/*
  if (pathname.startsWith('/api/') || pathname.startsWith('/socket.io/') || pathname.startsWith('/uploads/')) {
    proxyRequest(req, res, V28_PROXY_TARGET);
    return;
  }

  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.css') {
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (ext === '.js' && pathname.startsWith('/assets/')) {
    const content = fs
      .readFileSync(filePath, 'utf8')
      .replaceAll(PROD_ORIGIN, `http://localhost:${FE_PORT}`);
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(content);
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

feServer.on('error', (err) => {
  console.error(`[exhibition_backup] Frontend server error on port ${FE_PORT}:`, err.message);
  process.exitCode = 1;
});

feServer.listen(FE_PORT, () => {
  console.log(`[exhibition_backup FE] Running on http://localhost:${FE_PORT}`);
  console.log(`[exhibition_backup BE] Expected on http://localhost:${BE_PORT} (SQLite: ./data/expo.db)`);
  console.log(`[exhibition_backup Proxy] /api/* -> ${V28_PROXY_TARGET} (Local BE: ${LOCAL_BE_ORIGIN})`);
});

const shutdown = () => {
  feServer.close(() => {
    if (beChild.pid && !beChild.killed) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(beChild.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        beChild.kill('SIGTERM');
      }
    }
    process.exit(0);
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
