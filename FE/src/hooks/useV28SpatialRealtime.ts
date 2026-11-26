import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { V28RemoteAvatarView } from '../scene/v28/DynamicExhibitionScene';
import { SOCKET_BASE_URL } from '../config/apiConfig';
import { getStoredVisitorToken } from '../services/v28Api';

const SOCKET_URL = (SOCKET_BASE_URL || '').replace(/\/+$/, '');

export interface UseV28SpatialRealtimeOptions {
  versionId: string | null;
  isMobilePortrait: boolean;
  onLayoutChanged: () => void;
  onAssignedColor?: (color: string) => void;
}

export function useV28SpatialRealtime({
  versionId,
  isMobilePortrait,
  onLayoutChanged,
  onAssignedColor,
}: UseV28SpatialRealtimeOptions) {
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string>('');
  const seqRef = useRef<number>(0);
  const versionIdRef = useRef<string | null>(versionId);
  versionIdRef.current = versionId;
  const onAssignedColorRef = useRef(onAssignedColor);
  onAssignedColorRef.current = onAssignedColor;

  const [remoteAvatars, setRemoteAvatars] = useState<V28RemoteAvatarView[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [overflowCount, setOverflowCount] = useState<number>(0);
  const avatarMapRef = useRef<Map<string, V28RemoteAvatarView>>(new Map());

  useEffect(() => {
    if (!versionId) return;
    const visitorName = sessionStorage.getItem('expo_visitor_name') || `Khách V28-${Math.floor(Math.random() * 900 + 100)}`;
    const visitorColor = sessionStorage.getItem('expo_visitor_color') || '#10b981';

    const socket = io(`${SOCKET_URL}/v28-dynamic`, {
      transports: ['websocket', 'polling'],
      // V28-AUDIT-009 + Phase 4 Hardening: Dynamic auth sends latest visitor name/color & verified visitorToken on every reconnect
      auth: (cb) => {
        cb({
          name: sessionStorage.getItem('expo_visitor_name') || visitorName,
          color: sessionStorage.getItem('expo_visitor_color') || visitorColor,
          colorCustomized: sessionStorage.getItem('expo_visitor_color_custom') === '1',
          deviceTier: isMobilePortrait ? 'mobile' : 'desktop',
          visitorToken: getStoredVisitorToken() || undefined,
        });
      },
      reconnection: true,
      reconnectionDelay: 800,
    });
    socketRef.current = socket;

    socket.on('v28:snapshot', (snap: {
      sessionId: string;
      versionId: string;
      self?: { x: number; z: number; rotationY: number; color?: string };
      onlineCount: number;
      overflowCount: number;
      avatars: V28RemoteAvatarView[];
    }) => {
      sessionIdRef.current = snap.sessionId;
      if (snap.self?.color && /^#[0-9a-fA-F]{6}$/.test(snap.self.color)) {
        onAssignedColorRef.current?.(snap.self.color);
      }
      setOnlineCount(Math.max(1, snap.onlineCount || 1));
      setOverflowCount(snap.overflowCount || 0);
      const map = new Map<string, V28RemoteAvatarView>();
      for (const av of snap.avatars || []) {
        // V28-AUDIT-032: Filter out self sessionId to prevent duplicate overlapping avatar
        if (av.sessionId === snap.sessionId) continue;
        map.set(av.sessionId, av);
      }
      avatarMapRef.current = map;
      setRemoteAvatars(Array.from(map.values()));
    });

    socket.on('v28:delta', (delta: {
      versionId: string;
      onlineCount: number;
      overflowCount: number;
      upsert: V28RemoteAvatarView[];
      leave: string[];
    }) => {
      // Drop stale updates from previous layout versions
      if (versionIdRef.current && delta.versionId !== versionIdRef.current) return;
      setOnlineCount(Math.max(1, delta.onlineCount || 1));
      setOverflowCount(delta.overflowCount || 0);
      const map = avatarMapRef.current;
      for (const id of delta.leave || []) map.delete(id);
      for (const av of delta.upsert || []) {
        if (av.sessionId === sessionIdRef.current) continue;
        map.set(av.sessionId, av);
      }
      setRemoteAvatars(Array.from(map.values()));
    });

    socket.on('v28:layout_changed', (evt: { versionId: string }) => {
      onLayoutChanged();
      socket.emit('v28:version_ack', { versionId: evt.versionId });
    });

    // V28-AUDIT-009: Clear stale ghost avatars immediately on disconnect
    socket.on('disconnect', () => {
      avatarMapRef.current.clear();
      setRemoteAvatars([]);
      setOnlineCount(1);
      setOverflowCount(0);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      avatarMapRef.current.clear();
      setRemoteAvatars([]);
      setOnlineCount(1);
      setOverflowCount(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(versionId), isMobilePortrait]);

  const sendMove = useCallback((x: number, z: number, rotationY: number) => {
    const s = socketRef.current;
    if (!s || !s.connected || !versionIdRef.current) return;
    seqRef.current++;
    s.emit('v28:move', {
      sessionId: sessionIdRef.current,
      versionId: versionIdRef.current,
      seq: seqRef.current,
      x,
      z,
      rotationY,
    });
  }, []);

  const sendTeleport = useCallback((x: number, z: number, rotationY: number) => {
    const s = socketRef.current;
    if (!s || !s.connected || !versionIdRef.current) return;
    seqRef.current++;
    s.emit('v28:teleport', {
      sessionId: sessionIdRef.current,
      versionId: versionIdRef.current,
      seq: seqRef.current,
      x,
      z,
      rotationY,
    });
  }, []);

  const sendProfile = useCallback((name: string, color: string) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('v28:profile', { name, color });
  }, []);

  const bindVisitorToken = useCallback((visitorToken: string) => {
    const s = socketRef.current;
    if (!s || !s.connected || !visitorToken) return;
    s.emit('v28:auth_visitor', { visitorToken });
  }, []);

  return {
    remoteAvatars,
    onlineCount,
    overflowCount,
    sendMove,
    sendTeleport,
    sendProfile,
    bindVisitorToken,
  };
}
