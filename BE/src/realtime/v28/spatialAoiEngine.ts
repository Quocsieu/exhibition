import crypto from 'node:crypto';
import type { Namespace, Server as SocketIOServer, Socket } from 'socket.io';
import type { ExhibitionVersionDetail } from '../../services/v28/exhibitionService.js';

export const V28_REALTIME_NAMESPACE = '/v28-dynamic';
export const AOI_CELL_SIZE = 20; // 20m x 20m spatial hash cells
export const TICK_INTERVAL_MS = 100; // 10 Hz server tick batching
export const MAX_WALK_SPEED_MPS = 14.0; // generous over 11 m/s client walk speed
export const MAX_SERVER_AVATAR_BUDGET = 30;
export const MOBILE_AVATAR_BUDGET = 15;
export const MAX_MOVE_EVENTS_PER_SEC = 20;
export const MAX_TELEPORTS_PER_SEC = 3;

export interface InMemoryCollisionIndex {
  versionId: string;
  versionNumber: number;
  walkableBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawnPoint: { x: number; z: number; rotationY: number };
  boothAabbs: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}

export interface SpatialVisitorState {
  sessionId: string;
  socketId: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotationY: number;
  cellX: number;
  cellZ: number;
  versionId: string;
  lastSeq: number;
  renderBudget: number;
  lastMoveTs: number;
  moveWindowStart: number;
  moveWindowCount: number;
  teleportWindowStart: number;
  teleportWindowCount: number;
  dirty: boolean;
}

export interface AoiVisitorPayload {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotationY: number;
  seq: number;
}

export interface AoiTickMetrics {
  broadcastTicks: number;
  socketDeliveries: number;
  rejectedMoves: number;
  rejectedTeleports: number;
  staleUpdatesDropped: number;
  activeVisitors: number;
}

export function buildCollisionIndex(version: ExhibitionVersionDetail): InMemoryCollisionIndex {
  return {
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    walkableBounds: { ...version.walkableBounds },
    spawnPoint: { ...version.spawnPoint },
    boothAabbs: version.booths.map((b) => ({
      minX: b.positionX - b.footprintWidth / 2 - 0.25,
      maxX: b.positionX + b.footprintWidth / 2 + 0.25,
      minZ: b.positionZ - b.footprintDepth / 2 - 0.25,
      maxZ: b.positionZ + b.footprintDepth / 2 + 0.25,
    })),
  };
}

export function isPositionWalkableInIndex(
  index: InMemoryCollisionIndex,
  x: number,
  z: number
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (
    x < index.walkableBounds.minX ||
    x > index.walkableBounds.maxX ||
    z < index.walkableBounds.minZ ||
    z > index.walkableBounds.maxZ
  ) {
    return false;
  }
  for (const box of index.boothAabbs) {
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
      return false;
    }
  }
  return true;
}

export function cellCoordsForPosition(x: number, z: number): { cellX: number; cellZ: number } {
  return {
    cellX: Math.floor(x / AOI_CELL_SIZE),
    cellZ: Math.floor(z / AOI_CELL_SIZE),
  };
}

function cellKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

/**
 * Isolated Grand Expo World V28 Spatial AOI Realtime Engine.
 *
 * Guarantees:
 * - Mounted exclusively on Socket.IO namespace `/v28-dynamic` (zero cross-world room leakage).
 * - Each visitor belongs to strictly ONE Home Cell; receives deduplicated 3x3 AOI updates.
 * - Zero SQLite reads on movement events (uses in-memory CollisionIndex rebuilt on Publish).
 * - Server-authoritative bounds, booth collision, speed, teleport, versionId, seq & rate-limit validation.
 * - Hotspot-safe nearest-K render budget (<= 15 mobile / <= 30 desktop) with accurate global onlineCount & overflowCount.
 */
export class V28SpatialAoiEngine {
  private readonly nsp: Namespace;
  private collisionIndex: InMemoryCollisionIndex;
  private readonly visitorsBySocket = new Map<string, SpatialVisitorState>();
  private readonly cells = new Map<string, Set<string>>(); // cellKey -> Set<socketId>
  private readonly lastSentVisibleBySocket = new Map<string, Map<string, number>>(); // socketId -> Map<sessionId, lastSentSeq>
  private tickTimer: NodeJS.Timeout | null = null;
  public readonly metrics: AoiTickMetrics = {
    broadcastTicks: 0,
    socketDeliveries: 0,
    rejectedMoves: 0,
    rejectedTeleports: 0,
    staleUpdatesDropped: 0,
    activeVisitors: 0,
  };

  constructor(io: SocketIOServer, initialVersion: ExhibitionVersionDetail) {
    this.nsp = io.of(V28_REALTIME_NAMESPACE);
    this.collisionIndex = buildCollisionIndex(initialVersion);
    this.bindNamespaceEvents();
    this.startTickLoop();
  }

  public getActiveVersionId(): string {
    return this.collisionIndex.versionId;
  }

  public getCollisionIndex(): InMemoryCollisionIndex {
    return this.collisionIndex;
  }

  private addVisitorToCell(socketId: string, cx: number, cz: number): void {
    const key = cellKey(cx, cz);
    let set = this.cells.get(key);
    if (!set) {
      set = new Set();
      this.cells.set(key, set);
    }
    set.add(socketId);
  }

  private removeVisitorFromCell(socketId: string, cx: number, cz: number): void {
    const key = cellKey(cx, cz);
    const set = this.cells.get(key);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.cells.delete(key);
  }

  private moveVisitorHomeCell(v: SpatialVisitorState, newCx: number, newCz: number): void {
    if (v.cellX === newCx && v.cellZ === newCz) return;
    this.removeVisitorFromCell(v.socketId, v.cellX, v.cellZ);
    v.cellX = newCx;
    v.cellZ = newCz;
    this.addVisitorToCell(v.socketId, newCx, newCz);
  }

  private collectNearbyCandidates(v: SpatialVisitorState): {
    nearest: SpatialVisitorState[];
    nearbyTotal: number;
    overflowCount: number;
  } {
    const budget = v.renderBudget;
    const scanCap = budget * 3; // Bounded hotspot scan prevents O(N^2 log N) under 500-user single-cell congestion
    let nearbyTotal = 0;
    const candidates: Array<{ visitor: SpatialVisitorState; distSq: number }> = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const set = this.cells.get(cellKey(v.cellX + dx, v.cellZ + dz));
        if (!set) continue;
        for (const otherSocketId of set) {
          if (otherSocketId === v.socketId) continue;
          nearbyTotal++;
          if (candidates.length < scanCap) {
            const other = this.visitorsBySocket.get(otherSocketId);
            if (!other) continue;
            const distSq = (other.x - v.x) ** 2 + (other.z - v.z) ** 2;
            candidates.push({ visitor: other, distSq });
          }
        }
      }
    }

    if (candidates.length > budget) {
      candidates.sort((a, b) => a.distSq - b.distSq);
    }
    const capped = candidates.slice(0, budget).map((c) => c.visitor);
    const overflowCount = Math.max(0, nearbyTotal - capped.length);
    return { nearest: capped, nearbyTotal, overflowCount };
  }

  private sendSnapshotToSocket(socket: Socket, v: SpatialVisitorState): void {
    const { nearest, nearbyTotal, overflowCount } = this.collectNearbyCandidates(v);
    const visibleMap = new Map<string, number>();
    const avatars: AoiVisitorPayload[] = nearest.map((o) => {
      visibleMap.set(o.sessionId, o.lastSeq);
      return {
        sessionId: o.sessionId,
        name: o.name,
        color: o.color,
        x: Math.round(o.x * 100) / 100,
        z: Math.round(o.z * 100) / 100,
        rotationY: Math.round(o.rotationY * 1000) / 1000,
        seq: o.lastSeq,
      };
    });
    this.lastSentVisibleBySocket.set(v.socketId, visibleMap);
    this.metrics.socketDeliveries++;
    socket.emit('v28:snapshot', {
      sessionId: v.sessionId,
      versionId: this.collisionIndex.versionId,
      serverTs: Date.now(),
      self: { x: v.x, z: v.z, rotationY: v.rotationY },
      onlineCount: this.visitorsBySocket.size,
      nearbyCount: nearbyTotal,
      overflowCount,
      avatars,
    });
  }

  private bindNamespaceEvents(): void {
    this.nsp.on('connection', (socket: Socket) => {
      const auth = (socket.handshake.auth || {}) as Record<string, unknown>;
      const rawName = typeof auth.name === 'string' && auth.name.trim() ? auth.name.trim().slice(0, 40) : 'Khách V28';
      const rawColor =
        typeof auth.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(auth.color) ? auth.color : '#0ea5e9';
      // Server-side render budget clamp: client-reported deviceTier can NEVER exceed MAX_SERVER_AVATAR_BUDGET
      const isMobileHint = auth.deviceTier === 'mobile';
      const renderBudget = isMobileHint ? MOBILE_AVATAR_BUDGET : MAX_SERVER_AVATAR_BUDGET;

      const spawn = this.collisionIndex.spawnPoint;
      const { cellX, cellZ } = cellCoordsForPosition(spawn.x, spawn.z);
      const now = Date.now();
      const sessionId = `v28s-${crypto.randomBytes(6).toString('hex')}`;

      const state: SpatialVisitorState = {
        sessionId,
        socketId: socket.id,
        name: rawName,
        color: rawColor,
        x: spawn.x,
        z: spawn.z,
        rotationY: spawn.rotationY,
        cellX,
        cellZ,
        versionId: this.collisionIndex.versionId,
        lastSeq: 0,
        renderBudget,
        lastMoveTs: now,
        moveWindowStart: now,
        moveWindowCount: 0,
        teleportWindowStart: now,
        teleportWindowCount: 0,
        dirty: true,
      };

      this.visitorsBySocket.set(socket.id, state);
      this.addVisitorToCell(socket.id, cellX, cellZ);
      this.metrics.activeVisitors = this.visitorsBySocket.size;

      // Send authoritative initial snapshot
      this.sendSnapshotToSocket(socket, state);

      // Authoritative Move Handler
      socket.on('v28:move', (payload: unknown) => {
        const v = this.visitorsBySocket.get(socket.id);
        if (!v || !payload || typeof payload !== 'object') return;
        const data = payload as Record<string, unknown>;

        // Reject stale versionId
        if (typeof data.versionId === 'string' && data.versionId !== this.collisionIndex.versionId) {
          this.metrics.staleUpdatesDropped++;
          return;
        }
        // Reject spoofed sessionId if provided
        if (typeof data.sessionId === 'string' && data.sessionId !== v.sessionId) {
          this.metrics.rejectedMoves++;
          return;
        }
        // Monotonic seq check
        const seq = Number(data.seq);
        if (!Number.isInteger(seq) || seq <= v.lastSeq) {
          this.metrics.staleUpdatesDropped++;
          return;
        }

        // Per-socket rate limit
        const ts = Date.now();
        if (ts - v.moveWindowStart >= 1000) {
          v.moveWindowStart = ts;
          v.moveWindowCount = 0;
        }
        v.moveWindowCount++;
        if (v.moveWindowCount > MAX_MOVE_EVENTS_PER_SEC) {
          this.metrics.rejectedMoves++;
          return;
        }

        const nx = Number(data.x);
        const nz = Number(data.z);
        const rotY = Number(data.rotationY ?? v.rotationY);
        if (!Number.isFinite(nx) || !Number.isFinite(nz) || !Number.isFinite(rotY)) {
          this.metrics.rejectedMoves++;
          return;
        }

        // Speed-hack guard (allow burst slack >= 0.25s)
        const dtSec = Math.max(0.25, (ts - v.lastMoveTs) / 1000);
        const dist = Math.hypot(nx - v.x, nz - v.z);
        if (dist > MAX_WALK_SPEED_MPS * dtSec * 1.45) {
          this.metrics.rejectedMoves++;
          socket.emit('v28:correction', {
            reason: 'speed_limit',
            x: v.x,
            z: v.z,
            rotationY: v.rotationY,
            serverTs: ts,
          });
          return;
        }

        // In-memory collision & walkable bounds check (ZERO SQLite reads)
        if (!isPositionWalkableInIndex(this.collisionIndex, nx, nz)) {
          this.metrics.rejectedMoves++;
          socket.emit('v28:correction', {
            reason: 'collision_or_bounds',
            x: v.x,
            z: v.z,
            rotationY: v.rotationY,
            serverTs: ts,
          });
          return;
        }

        v.x = nx;
        v.z = nz;
        v.rotationY = rotY;
        v.lastSeq = seq;
        v.lastMoveTs = ts;
        v.dirty = true;

        const { cellX: ncx, cellZ: ncz } = cellCoordsForPosition(nx, nz);
        this.moveVisitorHomeCell(v, ncx, ncz);
      });

      // Authoritative Teleport Handler
      socket.on('v28:teleport', (payload: unknown) => {
        const v = this.visitorsBySocket.get(socket.id);
        if (!v || !payload || typeof payload !== 'object') return;
        const data = payload as Record<string, unknown>;

        if (typeof data.versionId === 'string' && data.versionId !== this.collisionIndex.versionId) {
          this.metrics.staleUpdatesDropped++;
          return;
        }

        const ts = Date.now();
        if (ts - v.teleportWindowStart >= 1000) {
          v.teleportWindowStart = ts;
          v.teleportWindowCount = 0;
        }
        v.teleportWindowCount++;
        if (v.teleportWindowCount > MAX_TELEPORTS_PER_SEC) {
          this.metrics.rejectedTeleports++;
          socket.emit('v28:error', { code: 'TELEPORT_RATE_LIMIT', message: 'Thao tác dịch chuyển quá nhanh.' });
          return;
        }

        const nx = Number(data.x);
        const nz = Number(data.z);
        const rotY = Number(data.rotationY ?? 0);
        if (!isPositionWalkableInIndex(this.collisionIndex, nx, nz)) {
          this.metrics.rejectedTeleports++;
          socket.emit('v28:error', { code: 'INVALID_TELEPORT_TARGET', message: 'Điểm dịch chuyển không hợp lệ.' });
          return;
        }

        const seq = Number(data.seq);
        if (Number.isInteger(seq) && seq > v.lastSeq) {
          v.lastSeq = seq;
        } else {
          v.lastSeq++;
        }

        v.x = nx;
        v.z = nz;
        v.rotationY = Number.isFinite(rotY) ? rotY : 0;
        v.lastMoveTs = ts;
        v.dirty = true;

        const { cellX: ncx, cellZ: ncz } = cellCoordsForPosition(nx, nz);
        this.moveVisitorHomeCell(v, ncx, ncz);

        // Immediately send fresh AOI snapshot for the new destination cell
        this.sendSnapshotToSocket(socket, v);
      });

      // Client confirms new layout version
      socket.on('v28:version_ack', (payload: unknown) => {
        const v = this.visitorsBySocket.get(socket.id);
        if (!v || !payload || typeof payload !== 'object') return;
        const verId = (payload as Record<string, unknown>).versionId;
        if (verId === this.collisionIndex.versionId) {
          v.versionId = verId;
          this.sendSnapshotToSocket(socket, v);
        }
      });

      socket.on('disconnect', () => {
        const v = this.visitorsBySocket.get(socket.id);
        if (v) {
          this.removeVisitorFromCell(socket.id, v.cellX, v.cellZ);
          this.visitorsBySocket.delete(socket.id);
          this.lastSentVisibleBySocket.delete(socket.id);
          this.metrics.activeVisitors = this.visitorsBySocket.size;
        }
      });
    });
  }

  /**
   * 10 Hz Tick Batching Loop:
   * Builds per-recipient DEDUPLICATED AOI deltas (enter / update / leave).
   * Guarantees 0 duplicate logical events per recipient even across overlapping 3x3 cells!
   */
  private startTickLoop(): void {
    this.tickTimer = setInterval(() => {
      if (this.visitorsBySocket.size === 0) return;
      this.metrics.broadcastTicks++;
      const serverTs = Date.now();
      const onlineCount = this.visitorsBySocket.size;

      for (const [socketId, recipient] of this.visitorsBySocket.entries()) {
        const socket = this.nsp.sockets.get(socketId);
        if (!socket) continue;

        const { nearest, nearbyTotal, overflowCount } = this.collectNearbyCandidates(recipient);
        const prevVisible = this.lastSentVisibleBySocket.get(socketId) || new Map<string, number>();
        const nextVisible = new Map<string, number>();
        const upsert: AoiVisitorPayload[] = [];
        const leave: string[] = [];

        for (const other of nearest) {
          const prevSeq = prevVisible.get(other.sessionId);
          nextVisible.set(other.sessionId, other.lastSeq);
          // Send ONLY if newly entered AOI OR has a strictly newer seq (guarantees 0 duplicate logical updates)
          if (prevSeq === undefined || (other.dirty && other.lastSeq > prevSeq)) {
            upsert.push({
              sessionId: other.sessionId,
              name: other.name,
              color: other.color,
              x: Math.round(other.x * 100) / 100,
              z: Math.round(other.z * 100) / 100,
              rotationY: Math.round(other.rotationY * 1000) / 1000,
              seq: other.lastSeq,
            });
          }
        }

        for (const oldSessionId of prevVisible.keys()) {
          if (!nextVisible.has(oldSessionId)) {
            leave.push(oldSessionId);
          }
        }

        this.lastSentVisibleBySocket.set(socketId, nextVisible);

        if (upsert.length > 0 || leave.length > 0) {
          this.metrics.socketDeliveries++;
          socket.emit('v28:delta', {
            versionId: this.collisionIndex.versionId,
            serverTs,
            onlineCount,
            nearbyCount: nearbyTotal,
            overflowCount,
            upsert,
            leave,
          });
        }
      }

      // Clear dirty flags after tick dispatch
      for (const v of this.visitorsBySocket.values()) {
        v.dirty = false;
      }
    }, TICK_INTERVAL_MS);
    this.tickTimer.unref();
  }

  /**
   * Live Layout Publish while visitors are online (Part D5):
   * 1. Rebuild in-memory CollisionIndex
   * 2. Relocate any visitor now inside a booth or out-of-bounds to safe spawnPoint
   * 3. Broadcast v28:layout_changed to all connected /v28-dynamic clients
   */
  public onLayoutPublished(newVersion: ExhibitionVersionDetail): {
    relocatedSessionIds: string[];
  } {
    this.collisionIndex = buildCollisionIndex(newVersion);
    const relocatedSessionIds: string[] = [];
    const spawn = this.collisionIndex.spawnPoint;

    for (const v of this.visitorsBySocket.values()) {
      v.versionId = this.collisionIndex.versionId;
      if (!isPositionWalkableInIndex(this.collisionIndex, v.x, v.z)) {
        v.x = spawn.x;
        v.z = spawn.z;
        v.rotationY = spawn.rotationY;
        v.lastSeq++;
        v.dirty = true;
        const { cellX, cellZ } = cellCoordsForPosition(v.x, v.z);
        this.moveVisitorHomeCell(v, cellX, cellZ);
        relocatedSessionIds.push(v.sessionId);
      }
    }

    this.nsp.emit('v28:layout_changed', {
      versionId: newVersion.versionId,
      versionNumber: newVersion.versionNumber,
      boothCount: newVersion.booths.length,
      relocatedSessionIds,
      spawnPoint: spawn,
      serverTs: Date.now(),
    });

    return { relocatedSessionIds };
  }

  public dispose(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.visitorsBySocket.clear();
    this.cells.clear();
    this.lastSentVisibleBySocket.clear();
  }
}
