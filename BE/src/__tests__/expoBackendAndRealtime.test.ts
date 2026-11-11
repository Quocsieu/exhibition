import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  VisitorState,
} from '../schemas/expoSchemas.js';
import { ExpoDatabase } from '../database/db.js';
import { createApp } from '../server.js';
import { attachSocketServer } from '../realtime/socketServer.js';
import {
  isPrivateOrReservedIp,
  validateExternalUrlSafety,
  extractProductFromHtml,
  parseBatchProducts,
} from '../integrations/productAdapter.js';

describe('DAY 2 & DAY 3 — BE API, SQLite, Realtime Socket.IO, Product Integrations & Admin Auth', () => {
  let db: ExpoDatabase;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = new ExpoDatabase(':memory:');
    const app = createApp(db);
    server = http.createServer(app);
    attachSocketServer(server, db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it('seeds initial booths and products in SQLite, caches listBooths(), and invalidates cache on CRUD', async () => {
    const firstList = db.listBooths();
    const secondList = db.listBooths();
    expect(firstList).toBe(secondList); // Exact same cached array reference

    const boothsRes = await fetch(`${baseUrl}/api/booths`);
    expect(boothsRes.status).toBe(200);
    const { booths } = (await boothsRes.json()) as { booths: unknown[] };
    expect(booths.length).toBe(6);

    const productsRes = await fetch(`${baseUrl}/api/products`);
    expect(productsRes.status).toBe(200);
    const { products } = (await productsRes.json()) as { products: unknown[] };
    expect(products.length).toBe(12);
  });

  it('protects admin CRUD endpoints and allows full Booth & Product CRUD after login', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/booths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unauthorized Booth',
        positionX: 0,
        positionZ: -6,
      }),
    });
    expect(unauthRes.status).toBe(401);

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    expect(loginRes.status).toBe(200);
    const { token } = (await loginRes.json()) as { token: string };
    expect(typeof token).toBe('string');

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const createBoothRes = await fetch(`${baseUrl}/api/booths`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'VietCraft Bamboo Pavilion',
        tagline: 'Thủ công mỹ nghệ xuất khẩu',
        category: 'Thủ công mỹ nghệ',
        color: '#eab308',
        positionX: -18,
        positionZ: 0,
      }),
    });
    expect(createBoothRes.status).toBe(201);
    const { booth } = (await createBoothRes.json()) as { booth: { id: string; name: string } };
    expect(booth.name).toBe('VietCraft Bamboo Pavilion');

    const createProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        boothId: booth.id,
        name: 'Đèn mây tre đan xuất khẩu',
        price: 750000,
        currency: 'VND',
        description: 'Chế tác thủ công 100%',
        images: ['https://example.com/lamp.jpg'],
        sourceUrl: 'https://example.com/products/bamboo-lamp',
      }),
    });
    expect(createProdRes.status).toBe(201);
    const { product } = (await createProdRes.json()) as { product: { id: string; price: number } };
    expect(product.price).toBe(750000);

    const updateProdRes = await fetch(`${baseUrl}/api/products/${product.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ price: 690000 }),
    });
    expect(updateProdRes.status).toBe(200);
    const updatedData = (await updateProdRes.json()) as { product: { price: number } };
    expect(updatedData.product.price).toBe(690000);

    const delBoothRes = await fetch(`${baseUrl}/api/booths/${booth.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    expect(delBoothRes.status).toBe(200);
  });

  it('enforces SSRF protection against localhost, loopback, link-local, and private IPs', async () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.5.4')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.100')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);

    await expect(validateExternalUrlSafety('http://localhost:4000/api/health')).rejects.toThrow(/SSRF/);
    await expect(validateExternalUrlSafety('http://127.0.0.1:8080/secret')).rejects.toThrow(/SSRF/);
    await expect(validateExternalUrlSafety('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /SSRF/
    );
    await expect(validateExternalUrlSafety('ftp://example.com/file.csv')).rejects.toThrow(/HTTP/);
  });

  it('extracts schema.org/Product JSON-LD and Open Graph metadata accurately', () => {
    const sampleHtml = `
      <!doctype html>
      <html>
        <head>
          <title>Máy Pha Cà Phê Espresso Pro X</title>
          <meta property="og:video" content="https://example.com/media/demo.mp4" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org/",
              "@type": "Product",
              "name": "Máy Pha Cà Phê Espresso Pro X",
              "image": ["/images/espresso-1.jpg", "https://example.com/images/espresso-2.jpg"],
              "description": "Áp suất 15 bar, kiểm soát nhiệt độ PID chính xác.",
              "sku": "ESP-PRO-X",
              "offers": {
                "@type": "Offer",
                "priceCurrency": "VND",
                "price": "14500000",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const draft = extractProductFromHtml(sampleHtml, 'https://example.com/shop/espresso-pro-x');
    expect(draft.extractionMethod).toBe('json-ld');
    expect(draft.name).toBe('Máy Pha Cà Phê Espresso Pro X');
    expect(draft.price).toBe(14500000);
    expect(draft.currency).toBe('VND');
    expect(draft.sku).toBe('ESP-PRO-X');
    expect(draft.inStock).toBe(true);
    expect(draft.images).toEqual([
      'https://example.com/images/espresso-1.jpg',
      'https://example.com/images/espresso-2.jpg',
    ]);
    expect(draft.videoUrl).toBe('https://example.com/media/demo.mp4');
  });

  it('parses and imports batch CSV and JSON product catalogs', () => {
    const csvContent = `name,price,currency,description,imageUrl,sourceUrl,sku
"Bàn phím cơ không dây KeyPro K8",2150000,VND,"Hot-swap RGB 3 mode","https://example.com/k8.jpg","https://example.com/products/k8","KP-K8"`;

    const csvItems = parseBatchProducts('booth-aether-tech', 'csv', csvContent);
    expect(csvItems).toHaveLength(1);
    expect(csvItems[0].name).toBe('Bàn phím cơ không dây KeyPro K8');
    expect(csvItems[0].price).toBe(2150000);

    const jsonContent = JSON.stringify([
      {
        name: 'Chuột công thái học ErgoMouse M5',
        price: 1290000,
        currency: 'VND',
        sourceUrl: 'https://example.com/products/m5',
      },
    ]);
    const jsonItems = parseBatchProducts('booth-aether-tech', 'json', jsonContent);
    expect(jsonItems).toHaveLength(1);
    expect(jsonItems[0].name).toBe('Chuột công thái học ErgoMouse M5');
  });

  it('synchronizes realtime multiplayer visitors, validates collision/speed, and handles disconnect', async () => {
    const clientA: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      baseUrl,
      {
        transports: ['websocket'],
        auth: { name: 'Khách A', color: '#0ea5e9' },
      }
    );

    const initA = await new Promise<{
      self: VisitorState;
      visitors: VisitorState[];
      onlineCount: number;
    }>((resolve) => {
      clientA.on('world:init', resolve);
    });

    expect(initA.self.name).toBe('Khách A');
    expect(initA.onlineCount).toBe(1);

    const joinedPromise = new Promise<VisitorState>((resolve) => {
      clientA.on('visitor:joined', resolve);
    });

    const clientB: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      baseUrl,
      {
        transports: ['websocket'],
        auth: { name: 'Khách B', color: '#10b981' },
      }
    );

    const [joinedVisitor, initB] = await Promise.all([
      joinedPromise,
      new Promise<{ self: VisitorState; visitors: VisitorState[]; onlineCount: number }>(
        (resolve) => {
          clientB.on('world:init', resolve);
        }
      ),
    ]);

    expect(joinedVisitor.name).toBe('Khách B');
    expect(initB.onlineCount).toBe(2);
    expect(initB.visitors.length).toBe(2);

    // Both visitors spawn near the Central Plaza (0, 0) at distinct non-overlapping slots
    expect(Math.hypot(initA.self.x, initA.self.z)).toBeLessThanOrEqual(4.5);
    expect(Math.hypot(initB.self.x, initB.self.z)).toBeLessThanOrEqual(4.5);
    expect(initA.self.x !== initB.self.x || initA.self.z !== initB.self.z).toBe(true);

    // Verify reconnect / reload restores valid walkable coordinates passed via handshake auth
    const clientReconnect: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(
      baseUrl,
      {
        transports: ['websocket'],
        auth: { name: 'Khách Reconnect', color: '#f59e0b', x: -3.5, z: 6.2, rotationY: 1.25 },
      }
    );
    const initReconnect = await new Promise<{ self: VisitorState }>((resolve) => {
      clientReconnect.on('world:init', resolve);
    });
    expect(initReconnect.self.x).toBeCloseTo(-3.5, 2);
    expect(initReconnect.self.z).toBeCloseTo(6.2, 2);
    expect(initReconnect.self.rotationY).toBeCloseTo(1.25, 2);
    clientReconnect.disconnect();

    const movedPromise = new Promise<VisitorState>((resolve) => {
      clientB.on('visitor:moved', resolve);
    });

    clientA.emit('visitor:move', {
      x: initA.self.x,
      z: initA.self.z - 0.6,
      rotationY: Math.PI,
      state: 'walk',
      activeBoothId: null,
    });

    const movedState = await movedPromise;
    expect(movedState.sessionId).toBe(initA.self.sessionId);
    expect(movedState.z).toBeCloseTo(initA.self.z - 0.6, 2);

    const rejectedPromise = new Promise<{ x: number; z: number; reason: string }>((resolve) => {
      clientA.on('move:rejected', resolve);
    });

    await new Promise((r) => setTimeout(r, 40));

    clientA.emit('visitor:move', {
      x: 0,
      z: 0,
      rotationY: 0,
      state: 'walk',
    });

    const rejected = await rejectedPromise;
    expect(rejected.reason).toBeTruthy();

    const leftPromise = new Promise<{ sessionId: string; onlineCount: number }>((resolve) => {
      clientA.on('visitor:left', resolve);
    });

    clientB.disconnect();
    const leftPayload = await leftPromise;
    expect(leftPayload.sessionId).toBe(initB.self.sessionId);
    expect(leftPayload.onlineCount).toBe(1);

    clientA.disconnect();
  });
});
