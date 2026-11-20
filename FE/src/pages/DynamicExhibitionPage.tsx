import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  v28Api,
  type V28BoothPlacementView,
  type V28ExhibitionVersionDetail,
  type V28Product,
} from '../services/v28Api';
import {
  DynamicExhibitionScene,
  type V28CameraMode,
  type V28PlayerState,
} from '../scene/v28/DynamicExhibitionScene';
import { DynamicWorldHud } from '../components/v28/DynamicWorldHud';
import {
  computeStreamingLodMap,
  DEFAULT_DESKTOP_STREAMING,
  DEFAULT_MOBILE_STREAMING,
  type BoothLodTier,
} from '../scene/v28/spatialStreaming';
import { FarBoothInstancedProxy } from '../scene/v28/FarBoothInstancedProxy';
import { ParametricExpoRoof } from '../scene/v28/ParametricExpoRoof';
import { useV28SpatialRealtime } from '../hooks/useV28SpatialRealtime';
import type { V28NpcAnimState } from '../scene/v28/DynamicBoothNpc3D';

export interface DynamicExhibitionPageProps {
  onOpenAdmin: () => void;
}

export const DynamicExhibitionPage: React.FC<DynamicExhibitionPageProps> = ({ onOpenAdmin }) => {
  const [world, setWorld] = useState<V28ExhibitionVersionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [cameraMode, setCameraMode] = useState<V28CameraMode>('overview');
  const [focusedBooth, setFocusedBooth] = useState<V28BoothPlacementView | null>(null);
  const [npcPanelOpen, setNpcPanelOpen] = useState<boolean>(false);
  const [npcAnimState, setNpcAnimState] = useState<V28NpcAnimState>('idle');

  // Exact V27.5 Visitor Profile identity (sessionStorage: expo_visitor_name & expo_visitor_color)
  const [playerName, setPlayerName] = useState<string>(() => {
    const saved = sessionStorage.getItem('expo_visitor_name');
    if (saved) return saved;
    const generated = `Khách #${Math.floor(100 + Math.random() * 900)}`;
    sessionStorage.setItem('expo_visitor_name', generated);
    return generated;
  });
  const [playerColor, setPlayerColor] = useState<string>(() => {
    const saved = sessionStorage.getItem('expo_visitor_color');
    if (saved) return saved;
    const defaultCol = '#0ea5e9';
    sessionStorage.setItem('expo_visitor_color', defaultCol);
    return defaultCol;
  });
  const [selectedProduct, setSelectedProduct] = useState<{
    booth: V28BoothPlacementView;
    product: V28Product;
    slotId: string;
  } | null>(null);
  const [playerTarget, setPlayerTarget] = useState<{ x: number; z: number } | null>(null);
  const [teleportState, setTeleportState] = useState<{
    nonce: number;
    pos: { x: number; z: number; rotationY: number } | null;
  }>({ nonce: 0, pos: null });
  const [playerPos, setPlayerPos] = useState<V28PlayerState>({ x: 0, z: 20, rotationY: Math.PI });
  const [joystickVec, setJoystickVec] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMobilePortrait, setIsMobilePortrait] = useState<boolean>(
    () => window.innerWidth <= 640 && window.innerHeight >= window.innerWidth
  );
  const [boothLodMap, setBoothLodMap] = useState<Record<string, BoothLodTier>>({});
  const lodMapRef = useRef<Record<string, BoothLodTier>>({});

  // Recompute 3-Ring Spatial Streaming LOD map with staggered mount queue on movement/camera/focus change
  useEffect(() => {
    if (!world) return;
    const thresholds = isMobilePortrait ? DEFAULT_MOBILE_STREAMING : DEFAULT_DESKTOP_STREAMING;
    const anchorX = focusedBooth ? focusedBooth.positionX : playerPos.x;
    const anchorZ = focusedBooth ? focusedBooth.positionZ : playerPos.z;

    const tickStreaming = () => {
      const next = computeStreamingLodMap({
        booths: world.booths,
        anchorX,
        anchorZ,
        cameraMode,
        focusedBoothId: focusedBooth?.boothId ?? null,
        prevLodMap: lodMapRef.current,
        thresholds,
        maxPromotionsPerTick: 6,
      });
      lodMapRef.current = next;
      setBoothLodMap(next);
    };

    tickStreaming();
    // Follow-up tick to drain staggered mount queue smoothly after rapid teleport
    const timer = window.setTimeout(tickStreaming, 180);
    return () => window.clearTimeout(timer);
  }, [world, playerPos.x, playerPos.z, cameraMode, focusedBooth, isMobilePortrait]);

  const previewVersionId = new URLSearchParams(window.location.search).get('previewVersionId');

  useEffect(() => {
    const onResize = () => {
      setIsMobilePortrait(window.innerWidth <= 640 && window.innerHeight >= window.innerWidth);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedProduct(null);
        setNpcPanelOpen(false);
        setNpcAnimState('idle');
        setFocusedBooth(null);
        setCameraMode('explore');
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const loadActiveWorld = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { world: loaded } = await v28Api.getActiveWorld(previewVersionId);
      setWorld(loaded);
      setPlayerPos({
        x: loaded.spawnPoint.x,
        z: loaded.spawnPoint.z,
        rotationY: loaded.spawnPoint.rotationY,
      });
    } catch (e) {
      setError((e as Error).message || 'Không thể tải dữ liệu triển lãm V28.');
    } finally {
      setLoading(false);
    }
  }, [previewVersionId]);

  useEffect(() => {
    loadActiveWorld();
  }, [loadActiveWorld]);

  // Listen for instant cross-tab V28 Admin sync (Publish / Slot Update)
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('v28-expo-sync');
      ch.onmessage = () => {
        loadActiveWorld();
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      try {
        ch?.close();
      } catch {
        // ignore
      }
    };
  }, [loadActiveWorld]);

  const { remoteAvatars, onlineCount, overflowCount, sendMove, sendTeleport, sendProfile } =
    useV28SpatialRealtime({
      versionId: world?.versionId ?? null,
      isMobilePortrait,
      onLayoutChanged: loadActiveWorld,
    });

  const handleUpdateVisitorProfile = useCallback(
    (nextName: string, nextColor: string) => {
      const cleaned = nextName.trim().slice(0, 32);
      if (!cleaned) return;
      setPlayerName(cleaned);
      setPlayerColor(nextColor);
      sessionStorage.setItem('expo_visitor_name', cleaned);
      sessionStorage.setItem('expo_visitor_color', nextColor);
      sendProfile(cleaned, nextColor);
    },
    [sendProfile]
  );

  const handleTeleportToBooth = useCallback((booth: V28BoothPlacementView) => {
    const lookRot = Math.atan2(
      booth.positionX - booth.approachPoint.x,
      booth.positionZ - booth.approachPoint.z
    );
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: { x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot },
    }));
    sendTeleport(booth.approachPoint.x, booth.approachPoint.z, lookRot);
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setCameraMode('focus');
  }, [sendTeleport]);

  const handleFocusBooth = useCallback((booth: V28BoothPlacementView) => {
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setCameraMode('focus');
  }, []);

  const handleSelectProduct = useCallback(
    (booth: V28BoothPlacementView, product: V28Product, slotId: string) => {
      setFocusedBooth(booth);
      setSelectedProduct({ booth, product, slotId });
      setCameraMode('focus');
    },
    []
  );

  const handleFloorClick = useCallback((x: number, z: number) => {
    setPlayerTarget({ x, z });
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcPanelOpen(false);
    setNpcAnimState('idle');
    setCameraMode('explore');
  }, []);

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Đang tải Grand Expo World V28...
      </div>
    );
  }

  if (error || !world) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#fecaca',
          fontFamily: 'system-ui, sans-serif',
          padding: 20,
        }}
      >
        <div>⚠️ {error || 'Không có dữ liệu triển lãm V28.'}</div>
        <button
          type="button"
          onClick={loadActiveWorld}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer' }}
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden', background: '#dbeafe' }}>
      <DynamicExhibitionScene
        world={world}
        cameraMode={cameraMode}
        focusedBooth={focusedBooth}
        playerTarget={playerTarget}
        teleportNonce={teleportState.nonce}
        teleportPos={teleportState.pos}
        joystickVector={joystickVec}
        isMobilePortrait={isMobilePortrait}
        boothLodMap={boothLodMap}
        remoteAvatars={remoteAvatars}
        npcAnimState={npcAnimState}
        playerName={playerName}
        playerColor={playerColor}
        onPlayerMove={(pos) => {
          setPlayerPos(pos);
          sendMove(pos.x, pos.z, pos.rotationY);
        }}
        onFloorClick={handleFloorClick}
        onFocusBooth={handleFocusBooth}
        onSelectProduct={handleSelectProduct}
        onClickNpc={(booth) => {
          setFocusedBooth(booth);
          setSelectedProduct(null);
          setNpcPanelOpen(true);
          setCameraMode('focus');
        }}
        renderFarProxies={() => <FarBoothInstancedProxy booths={world.booths} lodMap={boothLodMap} />}
        renderRoof={({ cameraMode: cm, isMobilePortrait: mp }) => (
          <ParametricExpoRoof roofBounds={world.roofBounds} cameraMode={cm} isMobilePortrait={mp} />
        )}
      />

      <DynamicWorldHud
        world={world}
        isPreviewMode={Boolean(previewVersionId)}
        cameraMode={cameraMode}
        isMobilePortrait={isMobilePortrait}
        playerPos={playerPos}
        focusedBooth={focusedBooth}
        selectedProduct={selectedProduct}
        npcPanelOpen={npcPanelOpen}
        playerName={playerName}
        playerColor={playerColor}
        onUpdateVisitorProfile={handleUpdateVisitorProfile}
        onlineCount={onlineCount}
        overflowVisitorCount={overflowCount}
        onChangeCameraMode={(mode) => {
          setCameraMode(mode);
          if (mode !== 'focus') {
            setFocusedBooth(null);
            setSelectedProduct(null);
            setNpcPanelOpen(false);
            setNpcAnimState('idle');
          }
        }}
        onTeleportToBooth={handleTeleportToBooth}
        onSelectProduct={handleSelectProduct}
        onCloseProduct={() => setSelectedProduct(null)}
        onCloseFocus={() => {
          setFocusedBooth(null);
          setSelectedProduct(null);
          setNpcPanelOpen(false);
          setNpcAnimState('idle');
          setCameraMode('explore');
        }}
        onOpenNpcPanel={() => setNpcPanelOpen(true)}
        onCloseNpcPanel={() => {
          setNpcPanelOpen(false);
          setNpcAnimState('idle');
        }}
        onNpcAnimStateChange={setNpcAnimState}
        onJoystickChange={setJoystickVec}
        onOpenAdmin={onOpenAdmin}
      />
    </div>
  );
};
