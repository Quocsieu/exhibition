import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Socket } from 'node:net';

export default defineConfig({
  plugins: [react()],
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
