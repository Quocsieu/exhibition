import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  type ServerToClientEvents,
  type ClientToServerEvents,
  type VisitorState,
  VisitorMovePayloadSchema,
  VisitorProfilePayloadSchema,
  MOVE_EVENT_MIN_INTERVAL_MS,
  MAX_SERVER_SPEED,
  isPointWalkable,
} from '../schemas/expoSchemas.js';
import type { ExpoDatabase } from '../database/db.js';

interface InternalVisitorRecord {
  state: VisitorState;
  lastMoveEventAt: number;
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
  corsOrigin: string | string[] = '*'
): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  const visitors = new Map<string, InternalVisitorRecord>();

  io.on('connection', (socket) => {
    const auth = (socket.handshake.auth || {}) as Record<string, unknown>;
    const rawName = typeof auth.name === 'string' ? auth.name.trim().slice(0, 32) : '';
    const rawColor =
      typeof auth.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(auth.color)
        ? auth.color
        : DEFAULT_COLORS[visitors.size % DEFAULT_COLORS.length];

    const spawnOffsetX = ((visitors.size % 5) - 2) * 0.9;
    const initialVisitor: VisitorState = {
      sessionId: socket.id,
      name: rawName || `Khách #${socket.id.slice(0, 4)}`,
      color: rawColor,
      x: spawnOffsetX,
      z: 17.5,
      rotationY: Math.PI,
      state: 'idle',
      activeBoothId: null,
      updatedAt: Date.now(),
    };

    visitors.set(socket.id, {
      state: initialVisitor,
      lastMoveEventAt: 0,
    });

    const allStates = Array.from(visitors.values()).map((v) => v.state);

    socket.emit('world:init', {
      self: initialVisitor,
      visitors: allStates,
      onlineCount: visitors.size,
    });

    socket.broadcast.emit('visitor:joined', initialVisitor);
    io.emit('visitors:count', { onlineCount: visitors.size });

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

      if (!isPointWalkable(x, z, booths)) {
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

      socket.broadcast.emit('visitor:moved', record.state);
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

      io.emit('visitor:updated', record.state);
    });

    socket.on('disconnect', () => {
      visitors.delete(socket.id);
      io.emit('visitor:left', {
        sessionId: socket.id,
        onlineCount: visitors.size,
      });
    });
  });

  return io;
}
