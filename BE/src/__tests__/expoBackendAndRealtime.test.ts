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
});
