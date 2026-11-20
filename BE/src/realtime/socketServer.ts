import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  type ServerToClientEvents,
  type ClientToServerEvents,
  type VisitorState,
  type ExpoWorldVersion,
  VisitorMovePayloadSchema,
  VisitorProfilePayloadSchema,
  MOVE_EVENT_MIN_INTERVAL_MS,
  MAX_SERVER_SPEED,
  PLAYER_RADIUS,
  CENTRAL_SPAWN_SLOTS,
  V27_0_SPAWN_SLOTS,
  V27_SPAWN_SLOTS,
  normalizeExpoWorldVersion,
  isPointWalkable,
} from '../schemas/expoSchemas.js';
import type { ExpoDatabase } from '../database/db.js';
import type { CorsOriginConfig } from '../server.js';

interface InternalVisitorRecord {
  state: VisitorState;
  worldVersion: ExpoWorldVersion;
  lastMoveEventAt: number;
}

function getWorldRoomName(worldVersion: ExpoWorldVersion): string {
  return `world:${worldVersion}`;
}

const DEFAULT_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
];

export function attachSocketServer(
  httpServer: HttpServer,
  db: ExpoDatabase,
  corsOrigin: CorsOriginConfig = '*'
): Server<ClientToServerEvents, ServerToClientEvents> {
  // Phase 4.1 Hardening: Bounded message buffer, ping timeouts, and configurable total + NAT-safe per-IP connection caps
  const maxHttpBufferSize = Math.max(4096, Number(process.env.SOCKET_MAX_BUFFER_BYTES || 16 * 1024));
  const pingTimeout = Math.max(5000, Number(process.env.SOCKET_PING_TIMEOUT_MS || 20000));
  const pingInterval = Math.max(5000, Number(process.env.SOCKET_PING_INTERVAL_MS || 25000));
  const maxTotalSockets = Math.max(20, Number(process.env.SOCKET_MAX_CONNECTIONS || 300));
  const maxSocketsPerIp = Math.max(5, Number(process.env.SOCKET_MAX_PER_IP || 60));

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize,
    pingTimeout,
    pingInterval,
  });

  const socketsByIp = new Map<string, number>();
  const enforceConnectionCap = (socket: { handshake: { address?: string }; on: (ev: 'disconnect', fn: () => void) => unknown }, next: (err?: Error) => void) => {
    const totalNow = io.engine.clientsCount;
    if (totalNow >= maxTotalSockets) {
      next(new Error('Máy chủ đang đạt giới hạn kết nối realtime đồng thời. Vui lòng thử lại sau.'));
      return;
    }
    const ip = socket.handshake.address || 'unknown';
    const ipCount = socketsByIp.get(ip) || 0;
    if (ipCount >= maxSocketsPerIp) {
      next(new Error('Quá nhiều kết nối đồng thời từ cùng một địa chỉ mạng.'));
      return;
    }
    socketsByIp.set(ip, ipCount + 1);
    socket.on('disconnect', () => {
      const cur = socketsByIp.get(ip) || 1;
      if (cur <= 1) socketsByIp.delete(ip);
      else socketsByIp.set(ip, cur - 1);
    });
    next();
  };

  io.use(enforceConnectionCap);
  io.of('/v28-dynamic').use(enforceConnectionCap);

  const visitors = new Map<string, InternalVisitorRecord>();

  const getWorldVisitorStates = (worldVersion: ExpoWorldVersion): VisitorState[] => {
    const states: VisitorState[] = [];
    for (const rec of visitors.values()) {
      if (rec.worldVersion === worldVersion) {
        states.push(rec.state);
      }
    }
    return states;
  };

  io.on('connection', (socket) => {
    const auth = (socket.handshake.auth || {}) as Record<string, unknown>;
    // Lock worldVersion at handshake against strict allowlist — cannot be mutated mid-session
    const worldVersion: ExpoWorldVersion = normalizeExpoWorldVersion(auth.worldVersion);
    const worldRoom = getWorldRoomName(worldVersion);
    void socket.join(worldRoom);

    const existingInWorld = getWorldVisitorStates(worldVersion);
    const rawName = typeof auth.name === 'string' ? auth.name.trim().slice(0, 32) : '';
    const rawColor =
      typeof auth.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(auth.color)
        ? auth.color
        : DEFAULT_COLORS[existingInWorld.length % DEFAULT_COLORS.length];

    const spawnSlots =
      worldVersion === 'v27'
        ? V27_SPAWN_SLOTS
        : worldVersion === 'v27_0'
          ? V27_0_SPAWN_SLOTS
          : CENTRAL_SPAWN_SLOTS;
    const defaultSlot = spawnSlots[existingInWorld.length % spawnSlots.length];
    const boothsOnConnect = db.listBooths();
    const rawAuthX = typeof auth.x === 'number' && Number.isFinite(auth.x) ? auth.x : null;
    const rawAuthZ = typeof auth.z === 'number' && Number.isFinite(auth.z) ? auth.z : null;
    const rawAuthRot =
      typeof auth.rotationY === 'number' && Number.isFinite(auth.rotationY)
        ? auth.rotationY
        : defaultSlot.rotationY;

    const canRestoreAuthPos =
      rawAuthX !== null &&
      rawAuthZ !== null &&
      isPointWalkable(rawAuthX, rawAuthZ, boothsOnConnect, PLAYER_RADIUS, worldVersion);

    const initialVisitor: VisitorState = {
      sessionId: socket.id,
      name: rawName || `Khách #${socket.id.slice(0, 4)}`,
      color: rawColor,
      x: canRestoreAuthPos ? Number(rawAuthX.toFixed(3)) : defaultSlot.x,
      z: canRestoreAuthPos ? Number(rawAuthZ.toFixed(3)) : defaultSlot.z,
      rotationY: Number(rawAuthRot.toFixed(3)),
      state: 'idle',
      activeBoothId: null,
      updatedAt: Date.now(),
    };

    visitors.set(socket.id, {
      state: initialVisitor,
      worldVersion,
      lastMoveEventAt: 0,
    });

    const worldStates = getWorldVisitorStates(worldVersion);

    socket.emit('world:init', {
      self: initialVisitor,
      visitors: worldStates,
      onlineCount: worldStates.length,
    });

    socket.to(worldRoom).emit('visitor:joined', initialVisitor);
    io.to(worldRoom).emit('visitors:count', { onlineCount: worldStates.length });

    socket.on('visitor:move', (rawPayload) => {
      const record = visitors.get(socket.id);
      if (!record) return;

      const now = Date.now();
      if (
        rawPayload?.state !== 'idle' &&
        now - record.lastMoveEventAt < MOVE_EVENT_MIN_INTERVAL_MS * 0.7
      ) {
        return;
      }

      const parsed = VisitorMovePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        socket.emit('move:rejected', {
          x: record.state.x,
          z: record.state.z,
          reason: 'Dữ liệu tọa độ không hợp lệ.',
        });
        return;
      }

      const { x, z, rotationY, state, activeBoothId } = parsed.data;
      const booths = db.listBooths();

      if (!isPointWalkable(x, z, booths, PLAYER_RADIUS, record.worldVersion)) {
        socket.emit('move:rejected', {
          x: record.state.x,
          z: record.state.z,
          reason: 'Vị trí nằm ngoài ranh giới hoặc va chạm vật cản.',
        });
        return;
      }

      const dtSeconds = Math.max(0.015, (now - record.state.updatedAt) / 1000);
      const dist = Math.hypot(x - record.state.x, z - record.state.z);
      const maxAllowedDist = MAX_SERVER_SPEED * dtSeconds + 1.6;
      if (dist > maxAllowedDist) {
        socket.emit('move:rejected', {
          x: record.state.x,
          z: record.state.z,
          reason: 'Tốc độ di chuyển vượt quá giới hạn cho phép.',
        });
        return;
      }

      record.lastMoveEventAt = now;
      record.state = {
        ...record.state,
        x: Number(x.toFixed(3)),
        z: Number(z.toFixed(3)),
        rotationY: Number(rotationY.toFixed(3)),
        state,
        activeBoothId: activeBoothId ?? null,
        updatedAt: now,
      };

      socket.to(getWorldRoomName(record.worldVersion)).emit('visitor:moved', record.state);
    });

    socket.on('visitor:profile', (rawProfile) => {
      const record = visitors.get(socket.id);
      if (!record) return;

      const parsed = VisitorProfilePayloadSchema.safeParse(rawProfile);
      if (!parsed.success) return;

      record.state = {
        ...record.state,
        name: parsed.data.name,
        color: parsed.data.color || record.state.color,
        updatedAt: Date.now(),
      };

      io.to(getWorldRoomName(record.worldVersion)).emit('visitor:updated', record.state);
    });

    socket.on('disconnect', () => {
      const record = visitors.get(socket.id);
      visitors.delete(socket.id);
      if (!record) return;
      const room = getWorldRoomName(record.worldVersion);
      const remainingCount = getWorldVisitorStates(record.worldVersion).length;
      io.to(room).emit('visitor:left', {
        sessionId: socket.id,
        onlineCount: remainingCount,
      });
    });
  });

  return io;
}
