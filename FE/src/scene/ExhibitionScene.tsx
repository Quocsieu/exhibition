import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth as BoothType, Point2D, VisitorState } from '../types/expo';
import type { PlayerTransform } from '../controls/useClickToMove';
import { Environment } from './Environment';
import { Booth } from './Booth';
import { LocalPlayer } from './LocalPlayer';
import { RemotePlayers } from './RemotePlayers';

export interface ExhibitionSceneProps {
  booths: BoothType[];
  productCountByBooth: Record<string, number>;
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
  onSelectBooth: (booth: BoothType) => void;
  onGroundClick: (x: number, z: number) => void;
  zoom?: number;
}

interface IsometricCameraRigProps {
  targetX: number;
  targetZ: number;
  playerTransformRef?: React.MutableRefObject<PlayerTransform>;
  onStepMovement?: (delta: number) => void;
  zoom: number;
}

const ISOMETRIC_OFFSET = new THREE.Vector3(16, 26, 22);
const MIN_CAMERA_ZOOM = 14;
const MAX_CAMERA_ZOOM = 44;

const IsometricCameraRig: React.FC<IsometricCameraRigProps> = ({
  targetX,
  targetZ,
  playerTransformRef,
  onStepMovement,
  zoom,
}) => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const initX = playerTransformRef ? playerTransformRef.current.x : targetX;
  const initZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
  const initFocusX = THREE.MathUtils.clamp(initX * 0.7, -14, 14);
  const initFocusZ = THREE.MathUtils.clamp(initZ * 0.5 - 2.0, -10, 10);

  const smoothedTarget = useRef(new THREE.Vector3(initFocusX, 0, initFocusZ));
  const desiredTarget = useRef(new THREE.Vector3(initFocusX, 0, initFocusZ));

  useLayoutEffect(() => {
    camera.near = 0.1;
    camera.far = 300;
    camera.position.copy(smoothedTarget.current).add(ISOMETRIC_OFFSET);
    camera.lookAt(smoothedTarget.current);
    camera.zoom = clampedZoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, size.width, size.height]);

  useFrame((_, delta) => {
    // 1. Advance local player movement first in the unified R3F frame loop
    if (onStepMovement) {
      onStepMovement(delta);
    }

    // 2. Read live coordinates in the exact same frame (zero 1-frame lag, zero rounding jitter)
    const liveX = playerTransformRef ? playerTransformRef.current.x : targetX;
    const liveZ = playerTransformRef ? playerTransformRef.current.z : targetZ;

    const nextFocusX = THREE.MathUtils.clamp(liveX * 0.7, -14, 14);
    const nextFocusZ = THREE.MathUtils.clamp(liveZ * 0.5 - 2.0, -10, 10);
    desiredTarget.current.set(nextFocusX, 0, nextFocusZ);
    smoothedTarget.current.lerp(desiredTarget.current, Math.min(1, delta * 6));

    camera.position.copy(smoothedTarget.current).add(ISOMETRIC_OFFSET);
    camera.lookAt(smoothedTarget.current);

    if (Math.abs(camera.zoom - clampedZoom) > 0.02) {
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, clampedZoom, Math.min(1, delta * 8));
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
    player,
    playerTransformRef,
    onStepMovement,
    remoteVisitors,
    remoteVisitorsLiveRef,
    activePath,
    selectedBoothId,
    onSelectBooth,
    onGroundClick,
    zoom = 22,
  }) => {
    const boothNamesById = useMemo(() => {
      const m = new Map<string, string>();
      booths.forEach((b) => m.set(b.id, b.name));
      return m;
    }, [booths]);

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
            zoom: 22,
            near: 0.1,
            far: 300,
          }}
        >
          <color attach="background" args={['#0f172a']} />
          <fog attach="fog" args={['#0f172a', 110, 210]} />

          <IsometricCameraRig
            targetX={player.x}
            targetZ={player.z}
            playerTransformRef={playerTransformRef}
            onStepMovement={onStepMovement}
            zoom={zoom}
          />

          {/* Soft Multi-Directional Architectural Lighting */}
          <ambientLight intensity={0.72} />
          <hemisphereLight args={['#f8fafc', '#334155', 0.6]} />
          <directionalLight
            position={[22, 36, 18]}
            intensity={1.35}
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
          <directionalLight position={[-18, 20, -16]} intensity={0.42} color="#bae6fd" />
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
              isSelected={selectedBoothId === booth.id}
              onSelect={onSelectBooth}
            />
          ))}

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
