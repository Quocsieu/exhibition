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
import {
  computeTtsCacheKey,
  normalizeTextForVietnameseTts,
  numberToVietnameseWords,
  splitVietnameseSpeechIntoChunks,
} from '../services/expoService.js';

describe('DAY 2 & DAY 3 — BE API, SQLite, Realtime Socket.IO, Product Integrations & Admin Auth', () => {
  let db: ExpoDatabase;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = new ExpoDatabase(':memory:');
    const app = createApp(db);
    server = http.createServer(app);
    const io = attachSocketServer(server, db);
    app.set('io', io);

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

  it('synthesizes Vietnamese Female NPC audio via POST /api/npc/tts with booth/product verification, SHA-256 caching, rate limiting, timeout, and zero secret leakage', async () => {
    const savedEnv = {
      TTS_PROVIDER: process.env.TTS_PROVIDER,
      TTS_API_KEY: process.env.TTS_API_KEY,
      TTS_VOICE: process.env.TTS_VOICE,
      TTS_API_ENDPOINT: process.env.TTS_API_ENDPOINT,
      TTS_TIMEOUT_MS: process.env.TTS_TIMEOUT_MS,
      TTS_RATE_LIMIT_PER_MIN: process.env.TTS_RATE_LIMIT_PER_MIN,
    };

    let mockMode: 'ok' | '429' | '500' | '401' | 'timeout' = 'ok';
    let providerCallCount = 0;
    let lastReceivedBody: Record<string, unknown> = {};

    const mockProviderServer = http.createServer(async (req, res) => {
      providerCallCount += 1;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      try {
        lastReceivedBody = JSON.parse(rawBody);
      } catch {
        lastReceivedBody = { rawBody };
      }

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
        res.end(JSON.stringify({ error: 'Invalid secret token' }));
        return;
      }
      if (mockMode === 'timeout') {
        await new Promise((r) => setTimeout(r, 2000));
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        res.end(Buffer.alloc(256, 0x49));
        return;
      }

      // Valid synthetic MP3 frame buffer (>= 64 bytes)
      const mp3Buffer = Buffer.alloc(512, 0x49);
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

      // 1b. Zero-key default provider ('gtts'): works out-of-the-box without TTS_API_KEY!
      delete process.env.TTS_PROVIDER;
      delete process.env.TTS_API_KEY;
      delete process.env.TTS_VOICE;
      process.env.TTS_API_ENDPOINT = `http://127.0.0.1:${providerPort}/translate_tts`;

      const gttsMissRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'CLOSING' }),
      });
      expect(gttsMissRes.status).toBe(200);
      expect(gttsMissRes.headers.get('content-type')).toContain('audio/mpeg');
      expect(gttsMissRes.headers.get('x-tts-provider')).toBe('gtts');
      expect(gttsMissRes.headers.get('x-tts-voice')).toBe('vi-VN-Standard-A');
      expect(gttsMissRes.headers.get('x-tts-cache')).toBe('MISS');
      const gttsBuf = await gttsMissRes.arrayBuffer();
      expect(gttsBuf.byteLength).toBeGreaterThanOrEqual(512);

      const gttsHitRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'CLOSING' }),
      });
      expect(gttsHitRes.status).toBe(200);
      expect(gttsHitRes.headers.get('x-tts-cache')).toBe('HIT');

      providerCallCount = 0;

      // 2. Explicit keyed provider ('viettel') with missing API Key -> returns 503 TTS_NOT_CONFIGURED without calling provider
      process.env.TTS_PROVIDER = 'viettel';
      process.env.TTS_API_KEY = '';
      process.env.TTS_API_ENDPOINT = `http://127.0.0.1:${providerPort}/tts`;

      const noKeyRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(noKeyRes.status).toBe(503);
      const noKeyJson = (await noKeyRes.json()) as { code: string; error: string };
      expect(noKeyJson.code).toBe('TTS_NOT_CONFIGURED');
      expect(providerCallCount).toBe(0);

      // 3. Valid API Key -> Cache MISS on 1st call, Cache HIT on 2nd call (0 duplicate provider calls)
      const secretKey = 'SECRET_TTS_TOKEN_999888777';
      process.env.TTS_API_KEY = secretKey;
      process.env.TTS_VOICE = 'hn-quynhanh';
      process.env.TTS_TIMEOUT_MS = '1200';
      process.env.TTS_RATE_LIMIT_PER_MIN = '30';

      const missRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(missRes.status).toBe(200);
      expect(missRes.headers.get('content-type')).toContain('audio/mpeg');
      expect(missRes.headers.get('x-tts-cache')).toBe('MISS');
      expect(missRes.headers.get('x-tts-provider')).toBe('viettel');
      expect(missRes.headers.get('x-tts-voice')).toBe('hn-quynhanh');
      const missBuf = await missRes.arrayBuffer();
      expect(missBuf.byteLength).toBe(512);
      expect(providerCallCount).toBe(1);
      expect(String(lastReceivedBody.text)).toContain('Minh Châu');
      expect(String(lastReceivedBody.text)).toContain('Nordic Living Studio');

      const hitRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-nordic-living', stepType: 'GREETING' }),
      });
      expect(hitRes.status).toBe(200);
      expect(hitRes.headers.get('x-tts-cache')).toBe('HIT');
      expect(providerCallCount).toBe(1); // Provider was NOT called again!

      // 4. Provider 429, 500, 401 (no secret leak), and Timeout (504)
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
        body: JSON.stringify({ boothId: 'booth-aether-tech', stepType: 'CLOSING' }),
      });
      expect(err500Res.status).toBe(502);

      mockMode = '401';
      const err401Res = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-ecovita-craft', stepType: 'GREETING' }),
      });
      expect(err401Res.status).toBe(502);
      const err401Text = await err401Res.text();
      expect(err401Text.includes(secretKey)).toBe(false); // Never leaks secret!

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

      // 5. Rate limiting per IP (429 RATE_LIMITED)
      mockMode = 'ok';
      process.env.TTS_RATE_LIMIT_PER_MIN = '5';
      const rateLimitedRes = await fetch(`${baseUrl}/api/npc/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothId: 'booth-solaris-energy', stepType: 'GREETING' }),
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

  it('normalizes Vietnamese numbers, prices, technical symbols, and sentence boundaries for human-like TTS speech', () => {
    expect(numberToVietnameseWords(6850000)).toBe('sáu triệu tám trăm năm mươi nghìn');
    expect(numberToVietnameseWords(12900000)).toBe('mười hai triệu chín trăm nghìn');
    expect(numberToVietnameseWords(1050000)).toBe('một triệu không trăm năm mươi nghìn');
    expect(numberToVietnameseWords(25400000)).toBe('hai mươi lăm triệu bốn trăm nghìn');
    expect(numberToVietnameseWords(31000000)).toBe('ba mươi mốt triệu');

    const normalized = normalizeTextForVietnameseTts(
      '<b>Cà phê/Trà</b> 100% nguyên chất https://example.com/item [SKU: CF-01] undefined — 24/7'
    );
    expect(normalized).toContain('Cà phê và Trà');
    expect(normalized).toContain('100 phần trăm');
    expect(normalized).toContain('hai tư trên bảy');
    expect(normalized).not.toContain('https://');
    expect(normalized).not.toContain('SKU');
    expect(normalized).not.toContain('undefined');

    const sentences = splitVietnameseSpeechIntoChunks(
      'Dạ xin chào quý khách! Em là Minh Châu, tư vấn viên tại gian hàng. Hôm nay em xin giới thiệu hai sản phẩm tiêu biểu ạ.'
    );
    expect(sentences).toHaveLength(3);

    // Cache key changes when prosody/version tag changes
    const k1 = computeTtsCacheKey('gtts', 'vi-VN-Standard-A', 'vi-VN', 'v1', 'Xin chào');
    const k2 = computeTtsCacheKey('gtts', 'vi-VN-Standard-A', 'vi-VN', 'v2-natural-0.96', 'Xin chào');
    expect(k1).not.toBe(k2);
  });
});
