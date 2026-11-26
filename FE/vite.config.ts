import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Socket } from 'node:net';

const FE_DIR = path.dirname(fileURLToPath(import.meta.url));
const localPiperPhonemize = path.resolve(
  FE_DIR,
  'node_modules/@mintplex-labs/piper-tts-web/dist/piper-o91UDS6e.js'
);
const workspacePiperPhonemize = path.resolve(
  FE_DIR,
  '../node_modules/@mintplex-labs/piper-tts-web/dist/piper-o91UDS6e.js'
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@piper-phonemize-internal': fs.existsSync(localPiperPhonemize)
        ? localPiperPhonemize
        : workspacePiperPhonemize,
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('/three/')) {
            return 'three-core';
          }
          if (
            id.includes('/@react-three/') ||
            id.includes('/three-stdlib/') ||
            id.includes('/troika-')
          ) {
            return 'r3f-drei';
          }
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')) {
            return 'realtime-vendor';
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@mintplex-labs/piper-tts-web'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          // Prevent write ECONNABORTED / ECONNRESET when browser or target closes WS connection mid-stream
          proxy.on('proxyReqWs', (proxyReq, _req, socket) => {
            const clientSocket = socket as Socket;
            clientSocket.on('close', () => {
              if (!proxyReq.destroyed) {
                proxyReq.destroy();
              }
            });
          });
          proxy.on('open', (proxySocket) => {
            proxySocket.on('error', (err: NodeJS.ErrnoException) => {
              if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
                return;
              }
            });
          });
        },
      },
    },
  },
});
