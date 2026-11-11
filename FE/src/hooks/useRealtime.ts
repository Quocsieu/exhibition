import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  type ServerToClientEvents,
  type ClientToServerEvents,
  type VisitorState,
  type VisitorMovePayload,
  MOVE_EVENT_MIN_INTERVAL_MS,
} from '../types/expo';

export interface UseRealtimeOptions {
  initialName: string;
  initialColor: string;
  getLiveTransform?: () => { x: number; z: number; rotationY: number } | null;
  onWorldInitSelf?: (self: VisitorState) => void;
  onMoveRejected?: (x: number, z: number, reason: string) => void;
}

export function useRealtime({
  initialName,
  initialColor,
  getLiveTransform,
  onWorldInitSelf,
  onMoveRejected,
}: UseRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [selfSessionId, setSelfSessionId] = useState<string | null>(null);
  const [remoteVisitorsMap, setRemoteVisitorsMap] = useState<Record<string, VisitorState>>({});

  // Live mutable map for high-frequency coordinates (x, z, rotationY, state) read directly in R3F useFrame
  const remoteVisitorsLiveRef = useRef<Map<string, VisitorState>>(new Map());

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastEmitTimeRef = useRef(0);
  const pendingPayloadRef = useRef<VisitorMovePayload | null>(null);
  const trailingTimerRef = useRef<number | null>(null);

  const getLiveTransformRef = useRef(getLiveTransform);
  getLiveTransformRef.current = getLiveTransform;

  const onWorldInitSelfRef = useRef(onWorldInitSelf);
  onWorldInitSelfRef.current = onWorldInitSelf;

  const onMoveRejectedRef = useRef(onMoveRejected);
  onMoveRejectedRef.current = onMoveRejected;

  useEffect(() => {
    const rawSocketUrl =
      (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined);
    const socketUrl = rawSocketUrl ? rawSocketUrl.replace(/\/+$/, '') : undefined;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: (cb) => {
        const live = getLiveTransformRef.current?.();
        cb({
          name: initialName,
          color: initialColor,
          ...(live
            ? {
                x: live.x,
                z: live.z,
                rotationY: live.rotationY,
              }
            : {}),
        });
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('world:init', ({ self, visitors, onlineCount: count }) => {
      setSelfSessionId(self.sessionId);
      setOnlineCount(count);
      onWorldInitSelfRef.current?.(self);
      const map: Record<string, VisitorState> = {};
      const liveMap = new Map<string, VisitorState>();
      for (const v of visitors) {
        if (v.sessionId !== self.sessionId) {
          const clone = { ...v };
          map[v.sessionId] = clone;
          liveMap.set(v.sessionId, { ...v });
        }
      }
      remoteVisitorsLiveRef.current = liveMap;
      setRemoteVisitorsMap(map);
    });

    socket.on('visitor:joined', (visitor) => {
      remoteVisitorsLiveRef.current.set(visitor.sessionId, { ...visitor });
      setRemoteVisitorsMap((prev) => ({
        ...prev,
        [visitor.sessionId]: { ...visitor },
      }));
    });

    socket.on('visitor:moved', (visitor) => {
      const existing = remoteVisitorsLiveRef.current.get(visitor.sessionId);
      if (existing) {
        // Ignore out-of-order packets
        if (visitor.updatedAt < existing.updatedAt) {
          return;
        }
        const boothChanged = (existing.activeBoothId ?? null) !== (visitor.activeBoothId ?? null);
        existing.x = visitor.x;
        existing.z = visitor.z;
        existing.rotationY = visitor.rotationY;
        existing.state = visitor.state;
        existing.activeBoothId = visitor.activeBoothId;
        existing.updatedAt = visitor.updatedAt;

        if (boothChanged) {
          setRemoteVisitorsMap((prev) => ({
            ...prev,
            [visitor.sessionId]: { ...existing },
          }));
        }
      } else {
        remoteVisitorsLiveRef.current.set(visitor.sessionId, { ...visitor });
        setRemoteVisitorsMap((prev) => ({
          ...prev,
          [visitor.sessionId]: { ...visitor },
        }));
      }
    });

    socket.on('visitor:updated', (visitor) => {
      remoteVisitorsLiveRef.current.set(visitor.sessionId, { ...visitor });
      setRemoteVisitorsMap((prev) => ({
        ...prev,
        [visitor.sessionId]: { ...visitor },
      }));
    });

    socket.on('visitor:left', ({ sessionId, onlineCount: count }) => {
      setOnlineCount(count);
      remoteVisitorsLiveRef.current.delete(sessionId);
      setRemoteVisitorsMap((prev) => {
        if (!(sessionId in prev)) return prev;
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    });

    socket.on('visitors:count', ({ onlineCount: count }) => {
      setOnlineCount(count);
    });

    socket.on('move:rejected', ({ x, z, reason }) => {
      onMoveRejectedRef.current?.(x, z, reason);
    });

    // Defer socket.connect() to the next macrotask so React 18 StrictMode's
    // synchronous mount->unmount->remount cycle does not open and immediately
    // abort a TCP/WebSocket connection mid-handshake (avoiding write ECONNABORTED).
    const connectTimer = window.setTimeout(() => {
      socket.connect();
    }, 10);

    return () => {
      window.clearTimeout(connectTimer);
      if (trailingTimerRef.current) {
        window.clearTimeout(trailingTimerRef.current);
      }
      if (socket.connected || socket.active) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [initialName, initialColor]);

  const emitMovement = useCallback((payload: VisitorMovePayload) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    const now = performance.now();
    const elapsed = now - lastEmitTimeRef.current;

    if (elapsed >= MOVE_EVENT_MIN_INTERVAL_MS || payload.state === 'idle') {
      if (trailingTimerRef.current) {
        window.clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      lastEmitTimeRef.current = now;
      socket.emit('visitor:move', payload);
    } else {
      pendingPayloadRef.current = payload;
      if (!trailingTimerRef.current) {
        trailingTimerRef.current = window.setTimeout(() => {
          trailingTimerRef.current = null;
          if (pendingPayloadRef.current && socketRef.current?.connected) {
            lastEmitTimeRef.current = performance.now();
            socketRef.current.emit('visitor:move', pendingPayloadRef.current);
            pendingPayloadRef.current = null;
          }
        }, MOVE_EVENT_MIN_INTERVAL_MS - elapsed);
      }
    }
  }, []);

  const emitProfileUpdate = useCallback((name: string, color?: string) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit('visitor:profile', { name, color });
  }, []);

  const remoteVisitors = useMemo(() => Object.values(remoteVisitorsMap), [remoteVisitorsMap]);

  return {
    isConnected,
    onlineCount,
    selfSessionId,
    remoteVisitors,
    remoteVisitorsLiveRef,
    emitMovement,
    emitProfileUpdate,
  };
}
