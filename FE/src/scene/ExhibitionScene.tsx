import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth as BoothType, Point2D, Product, VisitorState } from '../types/expo';
import type { PlayerTransform } from '../controls/useClickToMove';
import { Environment } from './Environment';
import { Booth } from './Booth';
import { ShopShowcaseStage } from './ShopShowcaseStage';
import { LocalPlayer } from './LocalPlayer';
import { RemotePlayers } from './RemotePlayers';

export type CameraViewMode = 'overview' | 'explore' | 'focus';

export interface ExhibitionSceneProps {
  booths: BoothType[];
  productCountByBooth: Record<string, number>;
  activeBoothProducts?: Product[];
  selectedProductId?: string | null;
  onSelectProduct?: (product: Product) => void;
  player: {
    name: string;
    color: string;
    x: number;
    z: number;
    rotationY: number;
    state: 'idle' | 'walk';
  };
  playerTransformRef?: React.MutableRefObject<PlayerTransform>;
  onStepMovement?: (delta: number) => void;
  remoteVisitors: VisitorState[];
  remoteVisitorsLiveRef?: React.MutableRefObject<Map<string, VisitorState>>;
  activePath: Point2D[];
  selectedBoothId: string | null;
  focusedBooth?: BoothType | null;
  cameraMode?: CameraViewMode;
  onSelectBooth: (booth: BoothType) => void;
  onGroundClick: (x: number, z: number) => void;
  zoom?: number;
}

interface IsometricCameraRigProps {
  targetX: number;
  targetZ: number;
  playerTransformRef?: React.MutableRefObject<PlayerTransform>;
  onStepMovement?: (delta: number) => void;
  cameraMode: CameraViewMode;
  focusedBooth: BoothType | null;
  isPanelOpen: boolean;
  zoom: number;
}

const ISOMETRIC_OFFSET = new THREE.Vector3(16, 26, 22);
const MIN_CAMERA_ZOOM = 14;
const MAX_CAMERA_ZOOM = 64;
const EMPTY_PRODUCTS: Product[] = [];

const IsometricCameraRig: React.FC<IsometricCameraRigProps> = ({
  targetX,
  targetZ,
  playerTransformRef,
  onStepMovement,
  cameraMode,
  focusedBooth,
  isPanelOpen,
  zoom,
}) => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const initX = playerTransformRef ? playerTransformRef.current.x : targetX;
  const initZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
  const initFocusX = THREE.MathUtils.clamp(initX * 0.9, -18, 18);
  const initFocusZ = THREE.MathUtils.clamp(initZ * 0.85 - 1.2, -16, 16);

  const smoothedTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));
  const desiredTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));

  useLayoutEffect(() => {
    camera.near = 0.1;
    camera.far = 320;
    camera.position.copy(smoothedTarget.current).add(ISOMETRIC_OFFSET);
    camera.lookAt(smoothedTarget.current);
    camera.zoom = clampedZoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, size.width, size.height]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);

    // 1. Advance local player movement first in the unified R3F frame loop
    if (onStepMovement) {
      onStepMovement(rawDelta);
    }

    // 2. Compute desired target based on Hybrid Isometric Camera Mode
    if (cameraMode === 'overview') {
      desiredTarget.current.set(0, 0.2, 0.8);
    } else if (cameraMode === 'focus' && focusedBooth) {
      // Offset toward screen-right when Shop Showcase drawer is open on desktop
      // so the 3D Shopfront occupies the open left 62% of the viewport cleanly
      const panelOffsetX = isPanelOpen && size.width > 860 ? 2.35 : 0.25;
      const panelOffsetZ = isPanelOpen && size.width > 860 ? -0.95 : 0.15;
      desiredTarget.current.set(
        focusedBooth.positionX + panelOffsetX,
        1.25,
        focusedBooth.positionZ + panelOffsetZ
      );
    } else {
      // Explore Mode (default): smoothly follow live player coordinates
      const liveX = playerTransformRef ? playerTransformRef.current.x : targetX;
      const liveZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
      const nextFocusX = THREE.MathUtils.clamp(liveX * 0.9, -18, 18);
      const nextFocusZ = THREE.MathUtils.clamp(liveZ * 0.85 - 1.2, -16, 16);
      desiredTarget.current.set(nextFocusX, 0.45, nextFocusZ);
    }

    // 3. Frame-rate independent exponential damping (zero camera jump, zero micro-stutter)
    const posAlpha = 1 - Math.exp(-6.5 * delta);
    const zoomAlpha = 1 - Math.exp(-7.5 * delta);

    smoothedTarget.current.lerp(desiredTarget.current, posAlpha);

    camera.position.copy(smoothedTarget.current).add(ISOMETRIC_OFFSET);
    camera.lookAt(smoothedTarget.current);

    if (Math.abs(camera.zoom - clampedZoom) > 0.015) {
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, clampedZoom, zoomAlpha);
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  });

  return null;
};

export const ExhibitionScene: React.FC<ExhibitionSceneProps> = React.memo(
  ({
    booths,
    productCountByBooth,
    activeBoothProducts = EMPTY_PRODUCTS,
    selectedProductId = null,
    onSelectProduct,
    player,
    playerTransformRef,
    onStepMovement,
    remoteVisitors,
    remoteVisitorsLiveRef,
    activePath,
    selectedBoothId,
    focusedBooth = null,
    cameraMode = 'explore',
    onSelectBooth,
    onGroundClick,
    zoom = 34,
  }) => {
    const boothNamesById = useMemo(() => {
      const m = new Map<string, string>();
      booths.forEach((b) => m.set(b.id, b.name));
      return m;
    }, [booths]);

    const activeFocusedBooth = useMemo(() => {
      if (focusedBooth) return focusedBooth;
      if (selectedBoothId) {
        return booths.find((b) => b.id === selectedBoothId) ?? null;
      }
      return null;
    }, [focusedBooth, selectedBoothId, booths]);

    const clickMarker =
      activePath.length > 0 ? activePath[activePath.length - 1] : null;

    const linePoints = useMemo(() => {
      if (activePath.length === 0) return [];
      const startX = playerTransformRef ? playerTransformRef.current.x : player.x;
      const startZ = playerTransformRef ? playerTransformRef.current.z : player.z;
      const pts: [number, number, number][] = [[startX, 0.08, startZ]];
      for (const wp of activePath) {
        pts.push([wp.x, 0.08, wp.z]);
      }
      return pts;
    }, [activePath, playerTransformRef, player.x, player.z]);

    const handleEnvironmentGroundClick = useCallback(
      (pt: Point2D) => {
        onGroundClick(pt.x, pt.z);
      },
      [onGroundClick]
    );

    return (
      <div className="expo-canvas-container" aria-label="Không gian triển lãm 3D Isometric">
        <Canvas
          orthographic
          shadows
          dpr={[1, 1.5]}
          camera={{
            position: [16, 26, 28],
            zoom: 34,
            near: 0.1,
            far: 320,
          }}
        >
          <color attach="background" args={['#0f172a']} />
          <fog attach="fog" args={['#0f172a', 110, 210]} />

          <IsometricCameraRig
            targetX={player.x}
            targetZ={player.z}
            playerTransformRef={playerTransformRef}
            onStepMovement={onStepMovement}
            cameraMode={cameraMode}
            focusedBooth={activeFocusedBooth}
            isPanelOpen={Boolean(selectedBoothId)}
            zoom={zoom}
          />

          {/* Soft Warm-Daylight Architectural Lighting */}
          <ambientLight intensity={0.76} />
          <hemisphereLight args={['#fffbeb', '#334155', 0.66]} />
          <directionalLight
            position={[22, 36, 18]}
            intensity={1.38}
            color="#fffef5"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-32}
            shadow-camera-right={32}
            shadow-camera-top={32}
            shadow-camera-bottom={-32}
            shadow-camera-near={1}
            shadow-camera-far={120}
            shadow-bias={-0.0004}
          />
          <directionalLight position={[-18, 20, -16]} intensity={0.46} color="#bae6fd" />
          <pointLight position={[0, 4.5, 0]} intensity={0.65} distance={18} color="#38bdf8" />

          <Environment
            onGroundClick={handleEnvironmentGroundClick}
            clickMarker={clickMarker}
          />

          {linePoints.length >= 2 && (
            <Line
              points={linePoints}
              color="#f59e0b"
              lineWidth={2.5}
              dashed
              dashSize={0.4}
              gapSize={0.2}
            />
          )}

          {booths.map((booth) => (
            <Booth
              key={booth.id}
              booth={booth}
              productCount={productCountByBooth[booth.id] ?? 0}
              isSelected={
                selectedBoothId === booth.id ||
                (cameraMode === 'focus' && activeFocusedBooth?.id === booth.id)
              }
              onSelect={onSelectBooth}
            />
          ))}

          {/* Conditionally Mounted Shop Showcase 3D Stage (Only active when viewing a booth) */}
          {cameraMode === 'focus' && activeFocusedBooth && onSelectProduct && (
            <ShopShowcaseStage
              booth={activeFocusedBooth}
              products={activeBoothProducts}
              selectedProductId={selectedProductId}
              onSelectProduct={onSelectProduct}
            />
          )}

          <LocalPlayer
            name={player.name}
            color={player.color}
            x={player.x}
            z={player.z}
            rotationY={player.rotationY}
            state={player.state}
            transformRef={playerTransformRef}
            activeBoothName={selectedBoothId ? boothNamesById.get(selectedBoothId) : null}
          />

          <RemotePlayers
            visitors={remoteVisitors}
            boothNamesById={boothNamesById}
            remoteVisitorsLiveRef={remoteVisitorsLiveRef}
          />
        </Canvas>
      </div>
    );
  }
);
