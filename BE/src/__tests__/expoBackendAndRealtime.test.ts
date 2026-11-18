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
  resetAdminLoginRateLimitForTests,
  verifyAdminToken,
} from '../middleware/adminAuth.js';
import {
  isPrivateOrReservedIp,
  validateExternalUrlSafety,
  extractProductFromHtml,
  parseBatchProducts,
} from '../integrations/productAdapter.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import {
  AZURE_DEFAULT_OUTPUT_FORMAT,
  AZURE_DEFAULT_VOICE,
  KORVATTS_DEFAULT_LANGUAGE,
  KORVATTS_DEFAULT_SPEED,
  KORVATTS_DEFAULT_STEPS,
  KORVATTS_DEFAULT_VOICE,
  KORVATTS_MODEL_VERSION,
  ExpoService,
  buildAzureVietnameseSsml,
  chunkVietnameseConsultationSpeech,
  computeTtsCacheKey,
  concatenatePcm16WavBuffers,
  escapeSsmlXml,
  expandNumbersForKorvaVietnamese,
  isServerKorvaWorkerDisabled,
  isValidWavBuffer,
  normalizeTextForVietnameseTts,
  numberToVietnameseWords,
  resolveBackendTtsConfig,
  smoothVietnameseProductTitleForKorva,
  splitVietnameseSpeechIntoChunks,
} from '../services/expoService.js';

describe('DAY 2 & DAY 3 — BE API, SQLite, Realtime Socket.IO, Product Integrations & Admin Auth', () => {
  let db: ExpoDatabase;
  let appInstance: Express;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = new ExpoDatabase(':memory:');
    appInstance = createApp(db);
    server = http.createServer(appInstance);
    const io = attachSocketServer(server, db);
    appInstance.set('io', io);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    const svc = appInstance?.locals?.expoService as ExpoService | undefined;
    if (svc) {
      await svc.shutdown();
    }
    server.closeAllConnections?.();
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

  it('manages Booth & Slot product assignments with strict validation and IDOR protection', async () => {
    // 1. Public GET /api/slots returns 6 slot definitions and default seeded assignments
    const allSlotsRes = await fetch(`${baseUrl}/api/slots`);
    expect(allSlotsRes.status).toBe(200);
    const allSlotsData = (await allSlotsRes.json()) as {
      slotDefinitions: { slotId: string; zone: string }[];
      assignments: { boothId: string; slotId: string; productId: string }[];
    };
    expect(allSlotsData.slotDefinitions.length).toBe(6);
    expect(allSlotsData.slotDefinitions.map((s) => s.slotId)).toEqual([
      'slot_01',
      'slot_02',
      'slot_03',
      'slot_04',
      'slot_05',
      'slot_06',
    ]);
    expect(allSlotsData.assignments.length).toBeGreaterThanOrEqual(12);

    // 2. Public GET /api/booths/booth-aether-tech/slots returns 6 slot views for the booth
    const boothSlotsRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots`);
    expect(boothSlotsRes.status).toBe(200);
    const boothSlotsData = (await boothSlotsRes.json()) as {
      booth: { id: string; companyName?: string };
      slots: { slot: { slotId: string }; productId: string | null; product: { id: string } | null }[];
    };
    expect(boothSlotsData.booth.id).toBe('booth-aether-tech');
    expect(boothSlotsData.booth.companyName).toBeTruthy();
    expect(boothSlotsData.slots.length).toBe(6);

    // 3. Unauthenticated PUT / DELETE slot assignment is rejected with 401
    const unauthPut = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_03`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod-aether-core' }),
    });
    expect(unauthPut.status).toBe(401);

    // 4. Login as admin
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    const { token } = (await loginRes.json()) as { token: string };
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 5. Reject invalid slotId (400)
    const invalidSlotRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_99`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-aether-core' }),
    });
    expect(invalidSlotRes.status).toBe(400);

    // 6. Reject non-existent boothId (404)
    const invalidBoothRes = await fetch(`${baseUrl}/api/booths/booth-ghost/slots/slot_01`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-aether-core' }),
    });
    expect(invalidBoothRes.status).toBe(404);

    // 7. Reject non-existent productId (404)
    const invalidProdRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_01`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-does-not-exist' }),
    });
    expect(invalidProdRes.status).toBe(404);

    // 8. Reject cross-booth product assignment (IDOR protection -> 400)
    const crossBoothRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_04`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-nordic-desk-pro' }),
    });
    expect(crossBoothRes.status).toBe(400);

    // 9. Assign valid product to empty slot_04 of booth-aether-tech
    const assignRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_04`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-aether-glass-ar' }),
    });
    expect(assignRes.status).toBe(200);
    const assignData = (await assignRes.json()) as {
      slot: { productId: string | null; slot: { slotId: string } };
    };
    expect(assignData.slot.slot.slotId).toBe('slot_04');
    expect(assignData.slot.productId).toBe('prod-aether-glass-ar');

    // 10. Replace product in slot_04 with prod-aether-hub-x1 (no duplicate boothId + slotId)
    const replaceRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_04`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: 'prod-aether-hub-x1' }),
    });
    expect(replaceRes.status).toBe(200);
    const replaceData = (await replaceRes.json()) as {
      slot: { productId: string | null };
      slots: { slot: { slotId: string }; productId: string | null }[];
    };
    expect(replaceData.slot.productId).toBe('prod-aether-hub-x1');
    expect(replaceData.slots.filter((s) => s.slot.slotId === 'slot_04').length).toBe(1);

    // 11. Remove product from slot_04 via DELETE
    const clearRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_04`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    expect(clearRes.status).toBe(200);
    const clearData = (await clearRes.json()) as {
      slot: { productId: string | null; product: unknown };
    };
    expect(clearData.slot.productId).toBeNull();
    expect(clearData.slot.product).toBeNull();
  });

  it('verifies full Admin -> API -> SQLite -> Client data sync across Booth Info (Test 1), Slot Assign/Replace/Clear (Tests 2-4), and Product Details in Slot (Test 5)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    expect(loginRes.status).toBe(200);
    const { token } = (await loginRes.json()) as { token: string };
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // TEST 1: Update all Booth Management fields on booth-lumina-design
    const updateBoothRes = await fetch(`${baseUrl}/api/booths/booth-lumina-design`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'Lumina Creative Group Global',
        name: 'Lumina Studio Pavilion 2026',
        tagline: 'Không gian nghệ thuật số & thiết kế tương tác 3D',
        description: 'Trưng bày các tác phẩm điêu khắc ánh sáng và giải pháp trình chiếu kiến trúc.',
        category: 'Thiết kế & Nghệ thuật Số',
        color: '#d946ef',
        logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
        bannerUrl: 'https://images.unsplash.com/photo-1558655146-d09347e92766?w=800',
        contactUrl: 'https://lumina-creative.example.com',
        contactEmail: 'hello@lumina-creative.example.com',
      }),
    });
    expect(updateBoothRes.status).toBe(200);

    // Client fetches GET /api/booths -> must receive fresh updated booth fields (cache invalidated)
    const getBoothsRes = await fetch(`${baseUrl}/api/booths`);
    expect(getBoothsRes.status).toBe(200);
    const { booths } = (await getBoothsRes.json()) as {
      booths: Array<{
        id: string;
        companyName: string;
        name: string;
        tagline: string;
        description: string;
        category: string;
        color: string;
        logoUrl: string;
        bannerUrl: string;
        contactUrl: string;
        contactEmail: string;
      }>;
    };
    const lumina = booths.find((b) => b.id === 'booth-lumina-design')!;
    expect(lumina.companyName).toBe('Lumina Creative Group Global');
    expect(lumina.name).toBe('Lumina Studio Pavilion 2026');
    expect(lumina.tagline).toBe('Không gian nghệ thuật số & thiết kế tương tác 3D');
    expect(lumina.description).toBe(
      'Trưng bày các tác phẩm điêu khắc ánh sáng và giải pháp trình chiếu kiến trúc.'
    );
    expect(lumina.category).toBe('Thiết kế & Nghệ thuật Số');
    expect(lumina.color).toBe('#d946ef');
    expect(lumina.logoUrl).toBe('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200');
    expect(lumina.bannerUrl).toBe('https://images.unsplash.com/photo-1558655146-d09347e92766?w=800');
    expect(lumina.contactUrl).toBe('https://lumina-creative.example.com');
    expect(lumina.contactEmail).toBe('hello@lumina-creative.example.com');

    // TEST 2: Create a new product and assign it to an empty slot (after clearing slot_05)
    await fetch(`${baseUrl}/api/booths/booth-lumina-design/slots/slot_05`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const createNewProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        boothId: 'booth-lumina-design',
        name: 'Đèn Điêu Khắc Hologram Lumina Halo X',
        price: 12900000,
        currency: 'VND',
        description: 'Đèn nghệ thuật 3D chiếu sáng chuẩn studio.',
        images: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600'],
        sourceUrl: 'https://lumina-creative.example.com/products/halo-x',
        sku: 'LUM-HALO-X',
      }),
    });
    expect(createNewProdRes.status).toBe(201);
    const { product: newProd } = (await createNewProdRes.json()) as {
      product: { id: string; name: string };
    };

    const assignEmptySlotRes = await fetch(
      `${baseUrl}/api/booths/booth-lumina-design/slots/slot_05`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ productId: newProd.id }),
      }
    );
    expect(assignEmptySlotRes.status).toBe(200);

    // TEST 3: Replace product in occupied slot_01 with newProd
    const replaceSlotRes = await fetch(`${baseUrl}/api/booths/booth-lumina-design/slots/slot_01`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ productId: newProd.id }),
    });
    expect(replaceSlotRes.status).toBe(200);
    const replaceBody = (await replaceSlotRes.json()) as {
      slot: { productId: string; product: { name: string } };
    };
    expect(replaceBody.slot.productId).toBe(newProd.id);
    expect(replaceBody.slot.product.name).toBe('Đèn Điêu Khắc Hologram Lumina Halo X');

    // TEST 4: Remove product from slot_05 without deleting the product from warehouse
    const clearSlot05Res = await fetch(`${baseUrl}/api/booths/booth-lumina-design/slots/slot_05`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    expect(clearSlot05Res.status).toBe(200);
    const clearSlot05Body = (await clearSlot05Res.json()) as {
      slot: { productId: string | null; product: unknown };
    };
    expect(clearSlot05Body.slot.productId).toBeNull();
    expect(clearSlot05Body.slot.product).toBeNull();

    // Verify product still exists in warehouse
    const warehouseRes = await fetch(`${baseUrl}/api/products?boothId=booth-lumina-design`);
    const { products: luminaProducts } = (await warehouseRes.json()) as {
      products: Array<{ id: string }>;
    };
    expect(luminaProducts.some((p) => p.id === newProd.id)).toBe(true);

    // TEST 5: Update product details (name, price, description, images, sourceUrl, sku) while displayed in slot_01
    const updateProdInSlotRes = await fetch(`${baseUrl}/api/products/${newProd.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Đèn Điêu Khắc Hologram Lumina Halo X Pro',
        price: 14500000,
        description: 'Phiên bản Pro nâng cấp độ sáng 1200 lumens và cảm biến chuyển động.',
        images: ['https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600'],
        sourceUrl: 'https://lumina-creative.example.com/products/halo-x-pro',
        sku: 'LUM-HALO-X-PRO',
      }),
    });
    expect(updateProdInSlotRes.status).toBe(200);

    // Verify GET /api/booths/booth-lumina-design/slots reflects updated product in slot_01
    const boothSlotsRes = await fetch(`${baseUrl}/api/booths/booth-lumina-design/slots`);
    expect(boothSlotsRes.status).toBe(200);
    const { slots } = (await boothSlotsRes.json()) as {
      slots: Array<{
        slot: { slotId: string };
        product: {
          id: string;
          name: string;
          price: number;
          description: string;
          images: string[];
          sourceUrl: string;
          sku: string;
        } | null;
      }>;
    };
    const slot01 = slots.find((s) => s.slot.slotId === 'slot_01')!;
    expect(slot01.product?.name).toBe('Đèn Điêu Khắc Hologram Lumina Halo X Pro');
    expect(slot01.product?.price).toBe(14500000);
    expect(slot01.product?.description).toBe(
      'Phiên bản Pro nâng cấp độ sáng 1200 lumens và cảm biến chuyển động.'
    );
    expect(slot01.product?.images).toEqual([
      'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600',
    ]);
    expect(slot01.product?.sourceUrl).toBe('https://lumina-creative.example.com/products/halo-x-pro');
    expect(slot01.product?.sku).toBe('LUM-HALO-X-PRO');
  });

  it('broadcasts expo:data-updated event to connected socket clients on booth/product/slot mutations', async () => {
    const client: ClientSocket<ServerToClientEvents, ClientToServerEvents> = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    const receivedEvents: Array<{ entityType: string; entityId?: string; boothId?: string }> = [];
    client.on('expo:data-updated', (payload) => {
      receivedEvents.push(payload);
    });

    await new Promise<void>((resolve) => client.on('connect', () => resolve()));

    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    const { token } = (await loginRes.json()) as { token: string };

    // 1. Trigger booth update
    await fetch(`${baseUrl}/api/booths/booth-aether-tech`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Aether Realtime Test',
        companyName: 'Aether Realtime Corp',
      }),
    });

    // 2. Trigger slot assignment
    const slotPutRes = await fetch(`${baseUrl}/api/booths/booth-aether-tech/slots/slot_02`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        productId: 'prod-aether-glass-ar',
      }),
    });
    expect(slotPutRes.status).toBe(200);

    // Wait for events to arrive at socket client
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(receivedEvents.length).toBeGreaterThanOrEqual(2);
    const boothEvent = receivedEvents.find((e) => e.entityType === 'booth');
    expect(boothEvent).toBeDefined();
    expect(boothEvent?.boothId).toBe('booth-aether-tech');

    const slotEvent = receivedEvents.find((e) => e.entityType === 'slot');
    expect(slotEvent).toBeDefined();
    expect(slotEvent?.entityId).toBe('slot_02');

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('synthesizes Vietnamese Female NPC audio via Azure AI Speech (vi-VN-HoaiMyNeural) with booth/product verification, SSML escaping, SHA-256 cache isolation, rate limiting, timeout, and zero secret leakage', async () => {
    const savedEnv = {
      TTS_PROVIDER: process.env.TTS_PROVIDER,
      TTS_API_KEY: process.env.TTS_API_KEY,
      TTS_VOICE: process.env.TTS_VOICE,
      TTS_API_ENDPOINT: process.env.TTS_API_ENDPOINT,
      TTS_TIMEOUT_MS: process.env.TTS_TIMEOUT_MS,
      TTS_RATE_LIMIT_PER_MIN: process.env.TTS_RATE_LIMIT_PER_MIN,
      AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,
      AZURE_SPEECH_VOICE: process.env.AZURE_SPEECH_VOICE,
      AZURE_SPEECH_ENDPOINT: process.env.AZURE_SPEECH_ENDPOINT,
      AZURE_SPEECH_OUTPUT_FORMAT: process.env.AZURE_SPEECH_OUTPUT_FORMAT,
    };

    let mockMode: 'ok' | '429' | '500' | '401' | '403' | 'timeout' = 'ok';
    let providerCallCount = 0;
    let lastRawBody = '';
    let lastHeaders: http.IncomingHttpHeaders = {};

    const mockProviderServer = http.createServer(async (req, res) => {
      providerCallCount += 1;
      lastHeaders = req.headers;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      lastRawBody = Buffer.concat(chunks).toString('utf8');

      if (mockMode === '429') {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Quota exceeded' }));
        return;
      }
      if (mockMode === '500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upstream failure' }));
        return;
      }
      if (mockMode === '401') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PermissionDenied: Invalid subscription key' }));
        return;
      }
      if (mockMode === '403') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden region or disabled resource' }));
        return;
      }
      if (mockMode === 'timeout') {
        await new Promise((r) => setTimeout(r, 2000));
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(Buffer.alloc(256, 0x49));
        return;
      }

      // Valid synthetic MP3 frame buffer (>= 64 bytes)
      const mp3Buffer = Buffer.alloc(640, 0x49);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(mp3Buffer);
    });

    await new Promise<void>((resolve) => mockProviderServer.listen(0, '127.0.0.1', () => resolve()));
    const providerPort = (mockProviderServer.address() as AddressInfo).port;

    try {
      // 1. Input validation: reject invalid stepType (400), non-existent booth (404), and foreign product (400)
      const invalidStepRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'INVALID_STEP' }),
      });
      expect(invalidStepRes.status).toBe(400);

      const ghostBoothRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-does-not-exist', stepType: 'GREETING' }),
      });
      expect(ghostBoothRes.status).toBe(404);

      const foreignProductRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-nordic-living',
          stepType: 'PRODUCT',
          productId: 'prod-aether-hub-x1', // belongs to booth-aether-tech!
        }),
      });
      expect(foreignProductRes.status).toBe(400);

      // 2. Explicit 'azure' provider ('vi-VN-HoaiMyNeural'):
      //    When AZURE_SPEECH_KEY / AZURE_SPEECH_REGION are missing, returns 503 TTS_NOT_CONFIGURED
      //    and NEVER silently falls back to 'gtts' or makes external calls!
      process.env.TTS_PROVIDER = 'azure';
      delete process.env.TTS_API_KEY;
      delete process.env.TTS_VOICE;
      delete process.env.TTS_API_ENDPOINT;
      delete process.env.AZURE_SPEECH_KEY;
      delete process.env.AZURE_SPEECH_REGION;
      delete process.env.AZURE_SPEECH_VOICE;
      delete process.env.AZURE_SPEECH_ENDPOINT;
      process.env.TTS_RATE_LIMIT_PER_MIN = '60';

      const azureCfg = resolveBackendTtsConfig();
      expect(azureCfg.provider).toBe('azure');
      expect(azureCfg.voice).toBe(AZURE_DEFAULT_VOICE);
      expect(azureCfg.outputFormat).toBe(AZURE_DEFAULT_OUTPUT_FORMAT);

      const missingCredsRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(missingCredsRes.status).toBe(503);
      const missingCredsJson = (await missingCredsRes.json()) as { code: string; error: string };
      expect(missingCredsJson.code).toBe('TTS_NOT_CONFIGURED');
      expect(missingCredsJson.error).toContain('AZURE_SPEECH_KEY');
      expect(providerCallCount).toBe(0);

      // Missing AZURE_SPEECH_REGION (key set, region empty, no endpoint override) -> 503 TTS_NOT_CONFIGURED
      process.env.AZURE_SPEECH_KEY = 'MOCK_AZURE_KEY_ONLY';
      process.env.AZURE_SPEECH_REGION = '';
      const missingRegionRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(missingRegionRes.status).toBe(503);
      expect(providerCallCount).toBe(0);

      // 3. Cache isolation: Populate an explicit 'gtts' entry for EcoVita CLOSING, then switch to 'azure'
      //    and prove Azure NEVER serves the cached 'gtts' buffer!
      process.env.TTS_PROVIDER = 'gtts';
      process.env.TTS_API_ENDPOINT = `http://127.0.0.1:${providerPort}/translate_tts`;
      const gttsSeedRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'CLOSING' }),
      });
      expect(gttsSeedRes.status).toBe(200);
      expect(gttsSeedRes.headers.get('x-tts-provider')).toBe('gtts');
      expect(gttsSeedRes.headers.get('x-tts-cache')).toBe('MISS');

      // Switch to Azure AI Speech (`vi-VN-HoaiMyNeural`)
      process.env.TTS_PROVIDER = 'azure';
      delete process.env.TTS_API_ENDPOINT;
      const azureSecretKey = 'AZURE_SUPER_SECRET_KEY_888999000';
      process.env.AZURE_SPEECH_KEY = azureSecretKey;
      process.env.AZURE_SPEECH_REGION = 'southeastasia';
      process.env.AZURE_SPEECH_ENDPOINT = `http://127.0.0.1:${providerPort}/cognitiveservices/v1`;
      process.env.TTS_TIMEOUT_MS = '1200';
      providerCallCount = 0;

      // Request the EXACT same booth + step ('booth-ecovita-craft', 'CLOSING') -> MUST be Cache MISS on Azure!
      const azureIsolatedRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'CLOSING' }),
      });
      expect(azureIsolatedRes.status).toBe(200);
      expect(azureIsolatedRes.headers.get('x-tts-provider')).toBe('azure');
      expect(azureIsolatedRes.headers.get('x-tts-voice')).toBe('vi-VN-HoaiMyNeural');
      expect(azureIsolatedRes.headers.get('x-tts-cache')).toBe('MISS');
      expect(providerCallCount).toBe(1);

      // 4. Verify official Microsoft Azure REST headers, SSML payload, sequential multi-product steps, & cache HIT
      providerCallCount = 0;
      const greetMissRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
      });
      expect(greetMissRes.status).toBe(200);
      expect(greetMissRes.headers.get('content-type')).toContain('audio/mpeg');
      expect(greetMissRes.headers.get('x-tts-provider')).toBe('azure');
      expect(greetMissRes.headers.get('x-tts-voice')).toBe('vi-VN-HoaiMyNeural');
      expect(greetMissRes.headers.get('x-tts-cache')).toBe('MISS');
      // Never expose API key in response headers
      expect(JSON.stringify(Object.fromEntries(greetMissRes.headers.entries()))).not.toContain(
        azureSecretKey
      );
      const greetBuf = await greetMissRes.arrayBuffer();
      expect(greetBuf.byteLength).toBe(640);
      expect(providerCallCount).toBe(1);

      // Verify exact Microsoft REST headers & SSML XML body sent to Azure
      expect(lastHeaders['ocp-apim-subscription-key']).toBe(azureSecretKey);
      expect(String(lastHeaders['content-type'])).toContain('application/ssml+xml');
      expect(lastHeaders['x-microsoft-outputformat']).toBe('audio-24khz-96kbitrate-mono-mp3');
      expect(String(lastHeaders['user-agent'])).toContain('VirtualExpoPlaza3D-Backend');
      expect(lastRawBody).toContain('xml:lang="vi-VN"');
      expect(lastRawBody).toContain('<voice name="vi-VN-HoaiMyNeural">');
      expect(lastRawBody).toContain('<prosody rate="0%" pitch="0%">');
      expect(lastRawBody).toContain('Bảo Trân');
      expect(lastRawBody).toContain('Solaris Clean Energy');

      // Second identical request -> Cache HIT (0 extra Azure calls)
      const greetHitRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
      });
      expect(greetHitRes.status).toBe(200);
      expect(greetHitRes.headers.get('x-tts-cache')).toBe('HIT');
      expect(providerCallCount).toBe(1);

      // Sequential Product 1 & Product 2 on Solaris + Switching to Nordic booth
      const prod1Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'PRODUCT',
          slotId: 'slot_01',
          productId: 'prod-solaris-pack-10kw',
        }),
      });
      expect(prod1Res.status).toBe(200);
      expect(lastRawBody).toContain('năm mươi tư triệu đồng');
      expect(lastRawBody).toContain('Power Wall');
      expect(lastRawBody).toContain('10 ki lô oát giờ');

      const prod2Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'PRODUCT',
          slotId: 'slot_05',
          productId: 'prod-solaris-ev-charger',
        }),
      });
      expect(prod2Res.status).toBe(200);
      expect(lastRawBody).toContain('mười sáu triệu năm trăm nghìn đồng');
      expect(lastRawBody).toContain('Charge Box');
      expect(lastRawBody).toContain('22 ki lô oát');

      const switchBoothRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(switchBoothRes.status).toBe(200);
      expect(switchBoothRes.headers.get('x-tts-voice')).toBe('vi-VN-HoaiMyNeural');
      expect(lastRawBody).toContain('Minh Châu');

      // 5. Azure error handling: 401/403 (wrong credentials, zero secret leak), 429 (quota), 500, and Timeout (504)
      mockMode = '401';
      const err401Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'GREETING' }),
      });
      expect(err401Res.status).toBe(502);
      const err401Text = await err401Res.text();
      expect(err401Text).toContain('TTS_AUTH_FAILED');
      expect(err401Text.includes(azureSecretKey)).toBe(false);

      mockMode = '403';
      const err403Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-lumina-design', stepType: 'GREETING' }),
      });
      expect(err403Res.status).toBe(502);
      expect((await err403Res.text()).includes(azureSecretKey)).toBe(false);

      mockMode = '429';
      const quotaRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-aether-tech', stepType: 'GREETING' }),
      });
      expect(quotaRes.status).toBe(429);
      const quotaJson = (await quotaRes.json()) as { code: string };
      expect(quotaJson.code).toBe('TTS_PROVIDER_QUOTA');

      mockMode = '500';
      const err500Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-aether-tech',
          stepType: 'PRODUCT',
          slotId: 'slot_01',
          productId: 'prod-aether-hub-x1',
        }),
      });
      expect(err500Res.status).toBe(502);

      mockMode = 'timeout';
      process.env.TTS_TIMEOUT_MS = '1000';
      const timeoutRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-kinetix-robotics', stepType: 'GREETING' }),
      });
      expect(timeoutRes.status).toBe(504);
      const timeoutJson = (await timeoutRes.json()) as { code: string };
      expect(timeoutJson.code).toBe('TTS_TIMEOUT');

      // 6. Rate limiting per IP (429 RATE_LIMITED)
      mockMode = 'ok';
      process.env.TTS_RATE_LIMIT_PER_MIN = '5';
      const rateLimitedRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-aether-tech',
          stepType: 'PRODUCT',
          slotId: 'slot_03',
          productId: 'prod-aether-glass-ar',
        }),
      });
      expect(rateLimitedRes.status).toBe(429);
      const rateLimitedJson = (await rateLimitedRes.json()) as { code: string };
      expect(rateLimitedJson.code).toBe('RATE_LIMITED');
    } finally {
      await new Promise<void>((resolve) => mockProviderServer.close(() => resolve()));
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('normalizes Vietnamese numbers, prices, technical symbols, English compounds, and escapes SSML XML safely', () => {
    expect(numberToVietnameseWords(6850000)).toBe('sáu triệu tám trăm năm mươi nghìn');
    expect(numberToVietnameseWords(12900000)).toBe('mười hai triệu chín trăm nghìn');
    expect(numberToVietnameseWords(1050000)).toBe('một triệu không trăm năm mươi nghìn');
    expect(numberToVietnameseWords(25400000)).toBe('hai mươi lăm triệu bốn trăm nghìn');
    expect(numberToVietnameseWords(31000000)).toBe('ba mươi mốt triệu');

    const normalized = normalizeTextForVietnameseTts(
      '<b>Cà phê/Trà</b> 100% ở 1.550m, ±5mm, <42dB, 22kW, 120kg, 2700K–5000K, PowerWall https://example.com/item [SKU: CF-01] undefined — 24/7',
      300
    );
    expect(normalized).toContain('Cà phê và Trà');
    expect(normalized).toContain('100 phần trăm');
    expect(normalized).toContain('1550 mét');
    expect(normalized).toContain('cộng trừ 5 mi li mét');
    expect(normalized).toContain('dưới 42 đê xi ben');
    expect(normalized).toContain('22 ki lô oát');
    expect(normalized).toContain('120 ki lô gam');
    expect(normalized).toContain('2700 độ K đến 5000 độ K');
    expect(normalized).toContain('Power Wall');
    expect(normalized).toContain('hai tư trên bảy');
    expect(normalized).not.toContain('https://');
    expect(normalized).not.toContain('SKU');
    expect(normalized).not.toContain('undefined');

    // SSML XML escaping prevents injection of raw tags, ampersands, and quotes
    expect(escapeSsmlXml('A & B <script>"test"\'s</script>')).toBe(
      'A &amp; B &lt;script&gt;&quot;test&quot;&apos;s&lt;/script&gt;'
    );
    const ssml = buildAzureVietnameseSsml(
      'Dạ xin chào quý khách! Em là Bảo Trân & "Solaris" <10kWh>.',
      'vi-VN-HoaiMyNeural'
    );
    expect(ssml).toContain('xmlns="http://www.w3.org/2001/10/synthesis"');
    expect(ssml).toContain('xml:lang="vi-VN"');
    expect(ssml).toContain('<voice name="vi-VN-HoaiMyNeural">');
    expect(ssml).toContain('<break time="220ms"/>');
    expect(ssml).toContain('&amp;');
    expect(ssml).toContain('&lt;10kWh&gt;');
    expect(ssml).not.toContain('<10kWh>');

    const sentences = splitVietnameseSpeechIntoChunks(
      'Dạ xin chào quý khách! Em là Minh Châu, tư vấn viên tại gian hàng. Hôm nay em xin giới thiệu hai sản phẩm tiêu biểu ạ.'
    );
    expect(sentences).toHaveLength(3);

    // Cache key strictly separates korvatts vs azure vs gtts and different speed/steps/modelVersion tags
    const kGtts = computeTtsCacheKey('gtts', 'vi-VN-Standard-A', 'vi-VN', 'v24-gtts-1.0', 'Xin chào');
    const kAzure = computeTtsCacheKey(
      'azure',
      'vi-VN-HoaiMyNeural',
      'vi-VN',
      'v24-azure-audio-24khz-96kbitrate-mono-mp3-rate:0%-pitch:0%',
      'Xin chào'
    );
    const kKorva32 = computeTtsCacheKey(
      'korvatts',
      'phuong_linh',
      'vi',
      `${KORVATTS_MODEL_VERSION}|speed:1.05|steps:32`,
      'Xin chào'
    );
    const kKorva16 = computeTtsCacheKey(
      'korvatts',
      'phuong_linh',
      'vi',
      `${KORVATTS_MODEL_VERSION}|speed:1.05|steps:16`,
      'Xin chào'
    );
    expect(kGtts).not.toBe(kAzure);
    expect(kKorva32).not.toBe(kAzure);
    expect(kKorva32).not.toBe(kGtts);
    expect(kKorva32).not.toBe(kKorva16);

    // Title-Case Vietnamese product phrase smoothing preserves English brands while lowercasing Vietnamese common words
    expect(
      smoothVietnameseProductTitleForKorva('Pin Lưu Trữ Điện Mặt Trời Solaris PowerWall 10 ki lô oát giờ')
    ).toBe('pin lưu trữ điện mặt trời Solaris PowerWall 10 ki lô oát giờ');
    expect(smoothVietnameseProductTitleForKorva('Solar Battery 15 ki lô oát giờ')).toBe(
      'Solar Battery 15 ki lô oát giờ'
    );
  });

  it('integrates KorvaTTS as the zero-key default provider (audio/wav), updates speech dynamically on Admin edits, deduplicates concurrent requests, and enforces worker lifecycle error codes', async () => {
    const savedEnv = {
      TTS_PROVIDER: process.env.TTS_PROVIDER,
      KORVATTS_VOICE: process.env.KORVATTS_VOICE,
      KORVATTS_LANGUAGE: process.env.KORVATTS_LANGUAGE,
      KORVATTS_SPEED: process.env.KORVATTS_SPEED,
      KORVATTS_STEPS: process.env.KORVATTS_STEPS,
      KORVATTS_PYTHON_PATH: process.env.KORVATTS_PYTHON_PATH,
      KORVATTS_WORKER_SCRIPT: process.env.KORVATTS_WORKER_SCRIPT,
      KORVATTS_MAX_QUEUE: process.env.KORVATTS_MAX_QUEUE,
      KORVATTS_INIT_TIMEOUT_MS: process.env.KORVATTS_INIT_TIMEOUT_MS,
      KORVATTS_NON_BLOCKING_INIT: process.env.KORVATTS_NON_BLOCKING_INIT,
      TTS_TIMEOUT_MS: process.env.TTS_TIMEOUT_MS,
      TTS_RATE_LIMIT_PER_MIN: process.env.TTS_RATE_LIMIT_PER_MIN,
      AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
      AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,
    };

    const tmpWorkerFile = path.join(
      os.tmpdir(),
      `korva-mock-worker-${process.pid}-${Date.now()}.cjs`
    );

    // Lightweight Node JSON-Lines IPC mock matching korvaTtsWorker.py's exact stdin/stdout protocol
    const mockWorkerCode = `
      const readline = require('node:readline');
      const mode = process.env.MOCK_KORVA_MODE || 'ok';

      function makeWavBuffer(text) {
        const payload = Buffer.from(text, 'utf8');
        const pcmBytes = Math.max(200, payload.length * 2);
        const buf = Buffer.alloc(44 + pcmBytes, 0);
        buf.write('RIFF', 0, 'ascii');
        buf.writeUInt32LE(36 + pcmBytes, 4);
        buf.write('WAVE', 8, 'ascii');
        buf.write('fmt ', 12, 'ascii');
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20); // PCM
        buf.writeUInt16LE(1, 22); // mono
        buf.writeUInt32LE(44100, 24);
        buf.writeUInt32LE(88200, 28);
        buf.writeUInt16LE(2, 32);
        buf.writeUInt16LE(16, 34);
        buf.write('data', 36, 'ascii');
        buf.writeUInt32LE(pcmBytes, 40);
        payload.copy(buf, 44, 0, Math.min(payload.length, pcmBytes));
        return buf;
      }

      if (mode === 'load_fail') {
        process.stdout.write(JSON.stringify({ type: 'init_error', code: 'TTS_MODEL_LOAD_FAILED', message: 'Missing ONNX' }) + '\\n');
        process.exit(2);
      }

      const initDelay = mode === 'slow_init' ? 1500 : 10;
      setTimeout(() => {
        process.stdout.write(JSON.stringify({
          type: 'ready',
          korvaVersion: '0.1.3',
          checkpoint: 'e5c8c218',
          sampleRate: 44100,
          voices: ['phuong_linh', 'khanh_vy', 'ngoc_huyen']
        }) + '\\n');
      }, initDelay);

      const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        const msg = JSON.parse(line);
        if (msg.type === 'shutdown') {
          process.stdout.write(JSON.stringify({ type: 'shutdown_ack', id: msg.id }) + '\\n');
          process.exit(0);
        }
        if (msg.type === 'synthesize') {
          if (mode === 'synth_fail' || msg.text.includes('TRIGGER_SYNTH_ERROR')) {
            process.stdout.write(JSON.stringify({ id: msg.id, type: 'result', ok: false, code: 'TTS_SYNTHESIS_FAILED', message: 'Infer error' }) + '\\n');
            return;
          }
          const delay = mode === 'timeout' ? 1500 : mode === 'busy_slow' ? 220 : 25;
          setTimeout(() => {
            const wav = makeWavBuffer(msg.voice + '|' + msg.text);
            process.stdout.write(JSON.stringify({
              id: msg.id,
              type: 'result',
              ok: true,
              mimeType: 'audio/wav',
              sampleRate: 44100,
              durationSec: 2.5,
              audioBase64: wav.toString('base64')
            }) + '\\n');
          }, delay);
        }
      });
    `;
    fs.writeFileSync(tmpWorkerFile, mockWorkerCode, 'utf8');

    try {
      // 1. Verify KorvaTTS is the default provider with zero Azure/FPT/paid keys needed
      delete process.env.TTS_PROVIDER;
      delete process.env.AZURE_SPEECH_KEY;
      delete process.env.AZURE_SPEECH_REGION;
      delete process.env.KORVATTS_VOICE;
      process.env.KORVATTS_PYTHON_PATH = process.execPath;
      process.env.KORVATTS_WORKER_SCRIPT = tmpWorkerFile;
      process.env.TTS_RATE_LIMIT_PER_MIN = '120';
      process.env.MOCK_KORVA_MODE = 'ok';

      const defaultCfg = resolveBackendTtsConfig();
      expect(defaultCfg.provider).toBe('korvatts');
      expect(defaultCfg.voice).toBe(KORVATTS_DEFAULT_VOICE);
      expect(defaultCfg.korvaLang).toBe(KORVATTS_DEFAULT_LANGUAGE);
      expect(defaultCfg.korvaSpeed).toBe(KORVATTS_DEFAULT_SPEED);
      expect(defaultCfg.korvaSteps).toBe(KORVATTS_DEFAULT_STEPS);
      expect(defaultCfg.requiresApiKey).toBe(false);

      // 1b. Verify Vietnamese title casing smoother & numeral expansion for bilingual KorvaTTS
      expect(smoothVietnameseProductTitleForKorva('Pin Lưu Trữ Điện Mặt Trời Solaris PowerWall')).toBe(
        'pin lưu trữ điện mặt trời Solaris PowerWall'
      );
      expect(
        expandNumbersForKorvaVietnamese('Solar Battery 15 ki lô oát giờ, hơn 6000 chu kỳ (80 phần trăm DoD), IP65, PM2.5.')
      ).toBe(
        'Solar Battery mười lăm ki lô oát giờ, hơn sáu nghìn chu kỳ, tám mươi phần trăm DoD, IP sáu mươi lăm, PM hai phẩy năm.'
      );

      // 2. Valid WAV synthesis (Content-Type: audio/wav, never audio/mpeg) + Cache MISS -> HIT
      const greetMiss = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
      });
      expect(greetMiss.status).toBe(200);
      expect(greetMiss.headers.get('content-type')).toBe('audio/wav');
      expect(greetMiss.headers.get('x-tts-provider')).toBe('korvatts');
      expect(greetMiss.headers.get('x-tts-voice')).toBe('phuong_linh');
      expect(greetMiss.headers.get('x-tts-cache')).toBe('MISS');
      const greetWav = Buffer.from(await greetMiss.arrayBuffer());
      expect(isValidWavBuffer(greetWav)).toBe(true);
      const embeddedGreeting = greetWav.subarray(44).toString('utf8');
      expect(embeddedGreeting).toContain('Bảo Trân');
      expect(embeddedGreeting).toContain('Solaris Green Energy Group');

      const greetHit = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
      });
      expect(greetHit.status).toBe(200);
      expect(greetHit.headers.get('x-tts-cache')).toBe('HIT');

      // 3. Dynamic Admin Update (Brand: Solaris Green Energy -> Green Future; Product: PowerWall 10kWh -> Solar Battery 15kWh; Price: 54M -> 62M)
      const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
        }),
      });
      const { token } = (await loginRes.json()) as { token: string };
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      await fetch(`${baseUrl}/api/booths/booth-solaris-energy`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ companyName: 'Green Future' }),
      });
      await fetch(`${baseUrl}/api/products/prod-solaris-pack-10kw`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Solar Battery 15kWh',
          price: 62000000,
        }),
      });

      const updatedGreetRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
      });
      expect(updatedGreetRes.status).toBe(200);
      expect(updatedGreetRes.headers.get('x-tts-cache')).toBe('MISS'); // New content -> new cache key!
      const updatedGreetWav = Buffer.from(await updatedGreetRes.arrayBuffer());
      expect(updatedGreetWav.subarray(44).toString('utf8')).toContain('Green Future');

      const updatedProdRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'PRODUCT',
          slotId: 'slot_01',
          productId: 'prod-solaris-pack-10kw',
        }),
      });
      expect(updatedProdRes.status).toBe(200);
      expect(updatedProdRes.headers.get('x-tts-cache')).toBe('MISS');
      const updatedProdWav = Buffer.from(await updatedProdRes.arrayBuffer());
      const updatedProdPayload = updatedProdWav.subarray(44).toString('utf8');
      expect(updatedProdPayload).toContain('Solar Battery mười lăm ki lô oát giờ');
      expect(updatedProdPayload).toContain('sáu mươi hai triệu đồng');

      // 4. Two visitors requesting the exact same uncached speech concurrently -> deduplicated in-flight!
      const [vis1Res, vis2Res] = await Promise.all([
        fetch(`${baseUrl}/api/npc/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
        }),
        fetch(`${baseUrl}/api/npc/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
        }),
      ]);
      expect(vis1Res.status).toBe(200);
      expect(vis2Res.status).toBe(200);
      const buf1 = Buffer.from(await vis1Res.arrayBuffer());
      const buf2 = Buffer.from(await vis2Res.arrayBuffer());
      expect(buf1.equals(buf2)).toBe(true);

      // 5. Worker lifecycle error codes: TTS_BUSY, TTS_SYNTHESIS_FAILED, TTS_TIMEOUT, TTS_MODEL_NOT_READY, TTS_MODEL_LOAD_FAILED
      const svc = appInstance.locals.expoService as ExpoService;
      await svc.shutdown();

      // 5a. TTS_BUSY when distinct concurrent requests exceed KORVATTS_MAX_QUEUE=0
      process.env.MOCK_KORVA_MODE = 'busy_slow';
      process.env.KORVATTS_MAX_QUEUE = '0';
      const [busyFirst, busySecond] = await Promise.all([
        fetch(`${baseUrl}/api/npc/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boothId: 'booth-aether-tech', stepType: 'GREETING' }),
        }),
        fetch(`${baseUrl}/api/npc/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boothId: 'booth-lumina-design', stepType: 'GREETING' }),
        }),
      ]);
      const statuses = [busyFirst.status, busySecond.status].sort();
      expect(statuses).toEqual([200, 503]);
      const rejectedBusy = busyFirst.status === 503 ? busyFirst : busySecond;
      expect(((await rejectedBusy.json()) as { code: string }).code).toBe('TTS_BUSY');
      process.env.KORVATTS_MAX_QUEUE = '3';

      // 5b. TTS_SYNTHESIS_FAILED
      await svc.shutdown();
      process.env.MOCK_KORVA_MODE = 'synth_fail';
      const synthFailRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'GREETING' }),
      });
      expect(synthFailRes.status).toBe(502);
      expect(((await synthFailRes.json()) as { code: string }).code).toBe('TTS_SYNTHESIS_FAILED');

      // 5c. TTS_TIMEOUT
      await svc.shutdown();
      process.env.MOCK_KORVA_MODE = 'timeout';
      process.env.TTS_TIMEOUT_MS = '350';
      const timeoutRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-kinetix-robotics', stepType: 'GREETING' }),
      });
      expect(timeoutRes.status).toBe(504);
      expect(((await timeoutRes.json()) as { code: string }).code).toBe('TTS_TIMEOUT');
      delete process.env.TTS_TIMEOUT_MS;

      // 5d. TTS_MODEL_NOT_READY
      await svc.shutdown();
      process.env.MOCK_KORVA_MODE = 'slow_init';
      process.env.KORVATTS_INIT_TIMEOUT_MS = '250';
      const notReadyRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-kinetix-robotics', stepType: 'CLOSING' }),
      });
      expect(notReadyRes.status).toBe(503);
      expect(((await notReadyRes.json()) as { code: string }).code).toBe('TTS_MODEL_NOT_READY');
      delete process.env.KORVATTS_INIT_TIMEOUT_MS;

      // 5e. TTS_MODEL_LOAD_FAILED
      await svc.shutdown();
      process.env.MOCK_KORVA_MODE = 'load_fail';
      const loadFailRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-aether-tech',
          stepType: 'PRODUCT',
          slotId: 'slot_01',
          productId: 'prod-aether-hub-x1',
        }),
      });
      expect(loadFailRes.status).toBe(503);
      const loadFailJson = (await loadFailRes.json()) as { code: string; error: string };
      expect(loadFailJson.code).toBe('TTS_MODEL_LOAD_FAILED');
      expect(loadFailJson.error).not.toContain('Traceback');
    } finally {
      delete process.env.MOCK_KORVA_MODE;
      try {
        if (fs.existsSync(tmpWorkerFile)) fs.unlinkSync(tmpWorkerFile);
      } catch {
        // ignore
      }
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }, 15000);

  it('V25.5 — splits Vietnamese consultation speech safely without breaking brands/prices/units, persists atomic WAV disk cache across Backend restarts, enforces 3-tier priority queue, cancels aborted queued jobs, and recovers worker after crash', async () => {
    // 1. Verify chunkVietnameseConsultationSpeech never splits inside protected brands, products, prices, units, decimals, or abbreviations
    const complexConsultation =
      'Dạ xin chào quý khách, em là Bảo Trân, tư vấn viên tại gian hàng Solaris Clean Energy thuộc thương hiệu Solaris Green Energy Group tại TP. Hồ Chí Minh. Mở đầu là mẫu pin lưu trữ điện mặt trời Solaris PowerWall mười ki lô oát giờ, hiện có mức giá năm mươi tư triệu đồng, hiệu suất chín mươi tám phẩy năm phần trăm do Dr. Nam phát triển.';
    const chunks = chunkVietnameseConsultationSpeech(
      complexConsultation,
      [
        'Bảo Trân',
        'Solaris Clean Energy',
        'Solaris Green Energy Group',
        'pin lưu trữ điện mặt trời Solaris PowerWall mười ki lô oát giờ',
        'năm mươi tư triệu đồng',
      ],
      70,
      120
    );
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const joined = chunks.join(' ');
    expect(joined).toContain('Solaris Clean Energy');
    expect(joined).toContain('Solaris Green Energy Group');
    expect(joined).toContain('TP. Hồ Chí Minh');
    expect(joined).toContain('Dr. Nam');
    expect(joined).toContain('Solaris PowerWall mười ki lô oát giờ');
    expect(joined).toContain('năm mươi tư triệu đồng');
    expect(joined).toContain('chín mươi tám phẩy năm phần trăm');

    // Every protected phrase must appear intact inside at least one single chunk (never torn across chunk boundary)
    for (const mustStayIntact of [
      'Solaris Clean Energy',
      'Solaris Green Energy Group',
      'TP. Hồ Chí Minh',
      'Dr. Nam',
      'Solaris PowerWall mười ki lô oát giờ',
      'năm mươi tư triệu đồng',
      'chín mươi tám phẩy năm phần trăm',
    ]) {
      expect(chunks.some((c) => c.includes(mustStayIntact))).toBe(true);
    }

    const savedEnv = {
      TTS_PROVIDER: process.env.TTS_PROVIDER,
      KORVATTS_PYTHON_PATH: process.env.KORVATTS_PYTHON_PATH,
      KORVATTS_WORKER_SCRIPT: process.env.KORVATTS_WORKER_SCRIPT,
      KORVATTS_MAX_QUEUE: process.env.KORVATTS_MAX_QUEUE,
      TTS_TIMEOUT_MS: process.env.TTS_TIMEOUT_MS,
      KORVATTS_WORKER_HANG_MS: process.env.KORVATTS_WORKER_HANG_MS,
      TTS_DISK_CACHE_DIR: process.env.TTS_DISK_CACHE_DIR,
      TTS_DISK_CACHE_MAX_FILES: process.env.TTS_DISK_CACHE_MAX_FILES,
      TTS_RATE_LIMIT_PER_MIN: process.env.TTS_RATE_LIMIT_PER_MIN,
    };

    const tmpDiskCacheDir = path.join(
      os.tmpdir(),
      `v255-disk-cache-test-${process.pid}-${Date.now()}`
    );
    const tmpWorkerLogFile = path.join(
      os.tmpdir(),
      `v255-worker-log-${process.pid}-${Date.now()}.log`
    );
    const tmpWorkerFile = path.join(
      os.tmpdir(),
      `v255-korva-mock-${process.pid}-${Date.now()}.cjs`
    );

    const mockWorkerCode = `
      const fs = require('node:fs');
      const readline = require('node:readline');
      const logFile = process.env.V255_WORKER_LOG || '';

      function makeWavBuffer(text) {
        const payload = Buffer.from(text, 'utf8');
        const pcmBytes = Math.max(200, payload.length * 2 + (payload.length % 2));
        const buf = Buffer.alloc(44 + pcmBytes, 0);
        buf.write('RIFF', 0, 'ascii');
        buf.writeUInt32LE(36 + pcmBytes, 4);
        buf.write('WAVE', 8, 'ascii');
        buf.write('fmt ', 12, 'ascii');
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(44100, 24);
        buf.writeUInt32LE(88200, 28);
        buf.writeUInt16LE(2, 32);
        buf.writeUInt16LE(16, 34);
        buf.write('data', 36, 'ascii');
        buf.writeUInt32LE(pcmBytes, 40);
        payload.copy(buf, 44, 0, Math.min(payload.length, pcmBytes));
        return buf;
      }

      process.stdout.write(JSON.stringify({
        type: 'ready',
        pid: process.pid,
        korvaVersion: '0.1.3',
        checkpoint: 'e5c8c218',
        sampleRate: 44100,
        voices: ['phuong_linh']
      }) + '\\n');

      const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        const msg = JSON.parse(line);
        if (msg.type === 'shutdown') {
          process.stdout.write(JSON.stringify({ type: 'shutdown_ack', id: msg.id }) + '\\n');
          process.exit(0);
        }
        if (msg.type === 'synthesize') {
          if (logFile) {
            fs.appendFileSync(logFile, msg.text + '\\n', 'utf8');
          }
          if (logFile && fs.existsSync(logFile + '.trigger_crash')) {
            fs.unlinkSync(logFile + '.trigger_crash');
            process.exit(1);
          }
          const delayMs = Number(process.env.V255_SYNTH_DELAY_MS || '90');
          setTimeout(() => {
            const wav = makeWavBuffer(msg.voice + '|' + msg.text);
            process.stdout.write(JSON.stringify({
              id: msg.id,
              type: 'result',
              ok: true,
              mimeType: 'audio/wav',
              sampleRate: 44100,
              durationSec: 2.0,
              audioBase64: wav.toString('base64')
            }) + '\\n');
          }, delayMs);
        }
      });
    `;
    fs.writeFileSync(tmpWorkerFile, mockWorkerCode, 'utf8');

    try {
      delete process.env.TTS_PROVIDER;
      process.env.KORVATTS_PYTHON_PATH = process.execPath;
      process.env.KORVATTS_WORKER_SCRIPT = tmpWorkerFile;
      process.env.TTS_DISK_CACHE_DIR = tmpDiskCacheDir;
      process.env.TTS_RATE_LIMIT_PER_MIN = '200';
      process.env.KORVATTS_MAX_QUEUE = '8';
      process.env.V255_WORKER_LOG = tmpWorkerLogFile;
      process.env.V255_SYNTH_DELAY_MS = '90';

      // 2. Manifest + Chunked synthesis + Disk Cache persistence across simulated Backend restart
      const manifestRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'GREETING',
          mode: 'manifest',
        }),
      });
      expect(manifestRes.status).toBe(200);
      const manifestJson = (await manifestRes.json()) as {
        provider: string;
        voice: string;
        totalChunks: number;
        chunks: Array<{ chunkIndex: number; cached: boolean }>;
      };
      expect(manifestJson.provider).toBe('korvatts');
      expect(manifestJson.voice).toBe('phuong_linh');
      expect(manifestJson.totalChunks).toBeGreaterThanOrEqual(2);
      expect(manifestJson.chunks[0].cached).toBe(false);

      const chunk0Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'GREETING',
          chunkIndex: 0,
          priority: 'ACTIVE_PLAYBACK',
        }),
      });
      expect(chunk0Res.status).toBe(200);
      expect(chunk0Res.headers.get('x-tts-cache')).toBe('MISS');
      expect(chunk0Res.headers.get('x-tts-chunk-index')).toBe('0');
      expect(chunk0Res.headers.get('x-tts-total-chunks')).toBe(String(manifestJson.totalChunks));
      const chunk0Buf = Buffer.from(await chunk0Res.arrayBuffer());
      expect(isValidWavBuffer(chunk0Buf)).toBe(true);

      // Verify atomic disk file exists with zero leftover .tmp files
      const diskFiles = fs.readdirSync(tmpDiskCacheDir);
      expect(diskFiles.some((f) => f.endsWith('.wav'))).toBe(true);
      expect(diskFiles.some((f) => f.endsWith('.tmp'))).toBe(false);

      // Simulate full Backend restart: brand-new ExpoService with empty RAM cache serves HIT from disk!
      const restartedService = new ExpoService(db);
      expect(restartedService.getTtsCacheStats().entries).toBe(0);
      const logLinesBeforeDiskHit = fs.readFileSync(tmpWorkerLogFile, 'utf8').trim().split('\n').length;
      const diskHitResult = await restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-solaris-energy',
        stepType: 'GREETING',
        chunkIndex: 0,
      });
      expect(diskHitResult.cacheStatus).toBe('HIT');
      expect(diskHitResult.audioBuffer.equals(chunk0Buf)).toBe(true);
      const logLinesAfterDiskHit = fs.readFileSync(tmpWorkerLogFile, 'utf8').trim().split('\n').length;
      expect(logLinesAfterDiskHit).toBe(logLinesBeforeDiskHit); // 0 worker calls on disk cache HIT!

      // 3. Verify 3-tier priority ordering (ACTIVE_PLAYBACK > NEXT_CHUNK > PREFETCH) & cancellation of queued aborted requests
      fs.writeFileSync(tmpWorkerLogFile, '', 'utf8');
      process.env.V255_SYNTH_DELAY_MS = '140';

      // Start job 0 on worker so subsequent arrivals wait in pendingQueue
      const busyLeadPromise = restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-aether-tech',
        stepType: 'CLOSING',
        chunkIndex: 0,
        priority: 'ACTIVE_PLAYBACK',
      });
      await new Promise((r) => setTimeout(r, 20));

      // Enqueue: (a) aborted job, (b) PREFETCH job, (c) NEXT_CHUNK job, (d) ACTIVE_PLAYBACK job
      const abortCtrl = new AbortController();
      const cancelledPromise = restartedService
        .synthesizeNpcStepAudio({
          boothId: 'booth-ecovita-craft',
          stepType: 'GREETING',
          chunkIndex: 0,
          priority: 'ACTIVE_PLAYBACK',
          signal: abortCtrl.signal,
        })
        .catch((e) => e);
      await new Promise((r) => setTimeout(r, 10));
      abortCtrl.abort(); // Cancel while waiting in queue!

      const prefetchPromise = restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-lumina-design',
        stepType: 'GREETING',
        chunkIndex: 0,
        priority: 'PREFETCH',
      });
      const nextChunkPromise = restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-nordic-living',
        stepType: 'GREETING',
        chunkIndex: 0,
        priority: 'NEXT_CHUNK',
      });
      const activePriorityPromise = restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-kinetix-robotics',
        stepType: 'GREETING',
        chunkIndex: 0,
        priority: 'ACTIVE_PLAYBACK',
      });

      const cancelledErr = await cancelledPromise;
      expect((cancelledErr as { code?: string }).code).toBe('TTS_CANCELLED');

      await Promise.all([busyLeadPromise, prefetchPromise, nextChunkPromise, activePriorityPromise]);

      const executedLines = fs
        .readFileSync(tmpWorkerLogFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      // Aborted EcoVita greeting must NOT have been synthesized by the worker
      expect(executedLines.some((l) => l.includes('Thảo Vy'))).toBe(false);

      // Among the 3 queued jobs, ACTIVE_PLAYBACK (Khánh Linh) ran BEFORE NEXT_CHUNK (Minh Châu), which ran BEFORE PREFETCH (Phương Nghi)!
      const idxActive = executedLines.findIndex((l) => l.includes('Khánh Linh'));
      const idxNextChunk = executedLines.findIndex((l) => l.includes('Minh Châu'));
      const idxPrefetch = executedLines.findIndex((l) => l.includes('Phương Nghi'));
      expect(idxActive).toBeGreaterThan(0);
      expect(idxActive).toBeLessThan(idxNextChunk);
      expect(idxNextChunk).toBeLessThan(idxPrefetch);

      // 4. Verify auto-recovery after unexpected worker crash
      fs.writeFileSync(`${tmpWorkerLogFile}.trigger_crash`, '1', 'utf8');
      await expect(
        restartedService.synthesizeNpcStepAudio({
          boothId: 'booth-ecovita-craft',
          stepType: 'GREETING',
          chunkIndex: 0,
        })
      ).rejects.toMatchObject({ code: 'TTS_SYNTHESIS_FAILED' });

      // Next request automatically spawns a fresh worker and succeeds!
      const recoveredRes = await restartedService.synthesizeNpcStepAudio({
        boothId: 'booth-ecovita-craft',
        stepType: 'GREETING',
        chunkIndex: 0,
      });
      expect(isValidWavBuffer(recoveredRes.audioBuffer)).toBe(true);

      // Verify PCM16 WAV concatenation produces a valid combined RIFF WAVE
      const concatenated = concatenatePcm16WavBuffers([chunk0Buf, recoveredRes.audioBuffer], 100);
      expect(isValidWavBuffer(concatenated)).toBe(true);
      expect(concatenated.byteLength).toBeGreaterThan(
        chunk0Buf.byteLength + recoveredRes.audioBuffer.byteLength - 44
      );

      await restartedService.shutdown();
    } finally {
      delete process.env.V255_WORKER_LOG;
      delete process.env.V255_SYNTH_DELAY_MS;
      delete process.env.V255_CRASH_ONCE;
      for (const f of [tmpWorkerFile, tmpWorkerLogFile, `${tmpWorkerLogFile}.crashed`]) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
          // ignore
        }
      }
      try {
        if (fs.existsSync(tmpDiskCacheDir)) {
          fs.rmSync(tmpDiskCacheDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }, 20000);

  it('V25.6 — enforces strict Backend Admin authentication across all mutation/integration endpoints, rejects tampered/expired tokens, and blocks brute-force login attempts', async () => {
    resetAdminLoginRateLimitForTests();

    // 1. Every Admin mutation & integration endpoint strictly rejects Guest requests (missing or forged Bearer token)
    const protectedEndpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'POST', path: '/api/booths', body: { name: 'Test' } },
      { method: 'PUT', path: '/api/booths/booth-solaris-energy', body: { name: 'Hack' } },
      { method: 'DELETE', path: '/api/booths/booth-solaris-energy' },
      {
        method: 'PUT',
        path: '/api/booths/booth-solaris-energy/slots/slot_01',
        body: { productId: 'prod-solaris-pack-10kw' },
      },
      { method: 'DELETE', path: '/api/booths/booth-solaris-energy/slots/slot_01' },
      { method: 'POST', path: '/api/products', body: { name: 'Fake' } },
      { method: 'PUT', path: '/api/products/prod-solaris-pack-10kw', body: { price: 1 } },
      { method: 'DELETE', path: '/api/products/prod-solaris-pack-10kw' },
      {
        method: 'POST',
        path: '/api/integrations/extract-url',
        body: { url: 'https://example.com/item' },
      },
      {
        method: 'POST',
        path: '/api/integrations/import-batch',
        body: { boothId: 'booth-solaris-energy', format: 'json', content: '[]' },
      },
    ];

    for (const ep of protectedEndpoints) {
      const noAuthRes = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      expect(noAuthRes.status, `Expected 401 on Guest ${ep.method} ${ep.path}`).toBe(401);

      const forgedRes = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.forgedsignature',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      expect(forgedRes.status, `Expected 401 on Forged ${ep.method} ${ep.path}`).toBe(401);
    }

    // Verify malformed/non-finite token payloads never pass verifyAdminToken
    expect(verifyAdminToken('')).toEqual({ valid: false });
    expect(verifyAdminToken('onlyonepart')).toEqual({ valid: false });
    expect(verifyAdminToken('a.b.c')).toEqual({ valid: false });

    // 2. Brute-force protection on POST /api/admin/login per IP
    for (let i = 0; i < 10; i++) {
      const badRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.77',
        },
        body: JSON.stringify({ username: 'admin', password: `wrong-pass-${i}` }),
      });
      expect(badRes.status).toBe(401);
    }

    const lockedOutRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.77',
      },
      body: JSON.stringify({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    expect(lockedOutRes.status).toBe(429);

    // 3. Legitimate Admin from a clean IP still logs in & passes /api/admin/me verification
    const validLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.12',
      },
      body: JSON.stringify({
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'expo-admin-2026',
      }),
    });
    expect(validLoginRes.status).toBe(200);
    const { token } = (await validLoginRes.json()) as { token: string };
    expect(typeof token).toBe('string');

    const meRes = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({ authenticated: true, username: 'admin' });

    resetAdminLoginRateLimitForTests();
  });

  it('V25.8 — skips spawning KorvaTTS worker on Render/client-only TTS mode while still serving verified dynamic speech manifests', async () => {
    const saved = {
      TTS_PROVIDER: process.env.TTS_PROVIDER,
      KORVATTS_ENABLED: process.env.KORVATTS_ENABLED,
      RENDER: process.env.RENDER,
      KORVATTS_PYTHON_PATH: process.env.KORVATTS_PYTHON_PATH,
      KORVATTS_WORKER_SCRIPT: process.env.KORVATTS_WORKER_SCRIPT,
    };

    try {
      process.env.TTS_PROVIDER = 'browser-piper';
      expect(isServerKorvaWorkerDisabled()).toBe(true);

      const svc = appInstance.locals.expoService as ExpoService;
      svc.prewarmTtsWorker();
      expect(svc.getTtsWorkerState()).not.toBe('starting');

      const manifestRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: 'booth-solaris-energy',
          stepType: 'PRODUCT',
          slotId: 'slot_01',
          productId: 'prod-solaris-pack-10kw',
          mode: 'manifest',
        }),
      });
      expect(manifestRes.status).toBe(200);
      const manifestJson = (await manifestRes.json()) as {
        workerState: string;
        fullText: string;
        totalChunks: number;
      };
      expect(manifestJson.workerState).toBe('failed');
      expect(manifestJson.fullText).toContain('Solaris PowerWall');
      expect(manifestJson.totalChunks).toBeGreaterThanOrEqual(1);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
