import React, { useCallback, useEffect, useState } from 'react';
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

export interface DynamicExhibitionPageProps {
  onOpenAdmin: () => void;
}

export const DynamicExhibitionPage: React.FC<DynamicExhibitionPageProps> = ({ onOpenAdmin }) => {
  const [world, setWorld] = useState<V28ExhibitionVersionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [cameraMode, setCameraMode] = useState<V28CameraMode>('overview');
  const [focusedBooth, setFocusedBooth] = useState<V28BoothPlacementView | null>(null);
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

  const previewVersionId = new URLSearchParams(window.location.search).get('previewVersionId');

  useEffect(() => {
    const onResize = () => {
      setIsMobilePortrait(window.innerWidth <= 640 && window.innerHeight >= window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  const handleTeleportToBooth = useCallback((booth: V28BoothPlacementView) => {
    const lookRot = Math.atan2(
      booth.positionX - booth.approachPoint.x,
      booth.positionZ - booth.approachPoint.z
    );
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: { x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot },
    }));
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setCameraMode('focus');
  }, []);

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
        onPlayerMove={setPlayerPos}
        onFloorClick={handleFloorClick}
        onFocusBooth={handleFocusBooth}
        onSelectProduct={handleSelectProduct}
      />

      <DynamicWorldHud
        world={world}
        isPreviewMode={Boolean(previewVersionId)}
        cameraMode={cameraMode}
        isMobilePortrait={isMobilePortrait}
        playerPos={playerPos}
        focusedBooth={focusedBooth}
        selectedProduct={selectedProduct}
        onChangeCameraMode={(mode) => {
          setCameraMode(mode);
          if (mode !== 'focus') {
            setFocusedBooth(null);
            setSelectedProduct(null);
          }
        }}
        onTeleportToBooth={handleTeleportToBooth}
        onSelectProduct={handleSelectProduct}
        onCloseProduct={() => setSelectedProduct(null)}
        onCloseFocus={() => {
          setFocusedBooth(null);
          setSelectedProduct(null);
          setCameraMode('explore');
        }}
        onJoystickChange={setJoystickVec}
        onOpenAdmin={onOpenAdmin}
      />
    </div>
  );
};
