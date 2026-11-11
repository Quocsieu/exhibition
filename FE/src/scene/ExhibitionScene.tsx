import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type {
  Booth as BoothType,
  BoothSlotView,
  Point2D,
  Product,
  VisitorState,
} from '../types/expo';
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
  slotsByBooth?: Record<string, BoothSlotView[]>;
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

export interface ShopShowcaseCameraTargets {
  cameraPosition: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
  entryPosition: THREE.Vector3;
}

const ISOMETRIC_OFFSET = new THREE.Vector3(16, 26, 22);
const MIN_CAMERA_ZOOM = 14;
const MAX_CAMERA_ZOOM = 64;
const SHOP_SHOWCASE_FOV = 38;
const EMPTY_PRODUCTS: Product[] = [];

/**
 * Computes the front-facing eye-level camera position and lookAt target in world coordinates
 * from a booth's local coordinate system (positionX, positionZ, rotationY, width, depth).
 *
 * Guarantees:
 * - Camera always stands in front of the open storefront (+Z in booth local space)
 * - Near eye-level elevation (~2.15m), looking straight into the shop interior (-Z in booth local space)
 * - Responsive framing for Desktop split-screen (right drawer open) vs Mobile bottom-sheet
 */
export function computeShopShowcaseCameraTargets(
  booth: Pick<BoothType, 'positionX' | 'positionZ' | 'rotationY' | 'width' | 'depth'>,
  viewportWidth: number,
  viewportHeight: number,
  isPanelOpen: boolean
): ShopShowcaseCameraTargets {
  const safeWidth = Math.max(viewportWidth, 320);
  const safeHeight = Math.max(viewportHeight, 320);
  const aspect = safeWidth / safeHeight;
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(SHOP_SHOWCASE_FOV / 2));

  const isDesktopSplit = isPanelOpen && safeWidth > 860;
  const isMobileSheet = isPanelOpen && safeWidth <= 860;

  let localCamZ: number;
  let localCamY: number;
  let localLookY: number;
  const localLookZ = -0.45;
  let panX = 0;

  if (isDesktopSplit) {
    // Drawer occupies min(500px, 44vw) on the right side of the screen
    const drawerFraction = Math.min(500 / safeWidth, 0.44);
    const openFraction = Math.max(0.52, 1 - drawerFraction);
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.62;
    const distForWidth =
      1.6 + halfSpanRequired / Math.max(0.32, openFraction * tanHalfFov * aspect);
    const distForHeight = 2.25 + 2.95 / tanHalfFov;
    localCamZ = THREE.MathUtils.clamp(Math.max(distForWidth, distForHeight), 10.6, 15.8);
    localCamY = 2.22;
    localLookY = 2.12;

    // Shift both camera and lookAt along local +X so the shop sits in the open left viewport
    // while keeping the sightline 100% perpendicular (0 deg horizontal angle) to the storefront
    const frustumHalfWidthAtCenter = localCamZ * tanHalfFov * aspect;
    panX = drawerFraction * 0.88 * frustumHalfWidthAtCenter;
  } else if (isMobileSheet) {
    // Bottom sheet occupies up to 62vh on mobile; frame storefront in the upper viewport
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.6;
    const distForWidth = 1.8 + halfSpanRequired / Math.max(0.24, tanHalfFov * aspect);
    localCamZ = THREE.MathUtils.clamp(Math.max(distForWidth, 11.8), 11.8, 17.5);
    localCamY = 2.15;
    localLookY = 0.72;
    panX = 0;
  } else {
    localCamZ = 10.8;
    localCamY = 2.2;
    localLookY = 2.1;
    panX = 0;
  }

  const cosR = Math.cos(booth.rotationY);
  const sinR = Math.sin(booth.rotationY);

  const toWorld = (lx: number, ly: number, lz: number): THREE.Vector3 =>
    new THREE.Vector3(
      booth.positionX + lx * cosR + lz * sinR,
      ly,
      booth.positionZ - lx * sinR + lz * cosR
    );

  const cameraPosition = toWorld(panX, localCamY, localCamZ);
  const lookAtTarget = toWorld(panX, localLookY, localLookZ);
  const entryPosition = toWorld(panX, localCamY + 0.75, localCamZ + 2.6);

  return {
    cameraPosition,
    lookAtTarget,
    entryPosition,
  };
}

interface HybridCameraRigProps {
  orthoCamRef: React.RefObject<THREE.OrthographicCamera | null>;
  perspCamRef: React.RefObject<THREE.PerspectiveCamera | null>;
  targetX: number;
  targetZ: number;
  playerTransformRef?: React.MutableRefObject<PlayerTransform>;
  onStepMovement?: (delta: number) => void;
  cameraMode: CameraViewMode;
  focusedBooth: BoothType | null;
  isPanelOpen: boolean;
  zoom: number;
}

const HybridCameraRig: React.FC<HybridCameraRigProps> = ({
  orthoCamRef,
  perspCamRef,
  targetX,
  targetZ,
  playerTransformRef,
  onStepMovement,
  cameraMode,
  focusedBooth,
  isPanelOpen,
  zoom,
}) => {
  const size = useThree((state) => state.size);

  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const initX = playerTransformRef ? playerTransformRef.current.x : targetX;
  const initZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
  const initFocusX = THREE.MathUtils.clamp(initX * 0.9, -18, 18);
  const initFocusZ = THREE.MathUtils.clamp(initZ * 0.85 - 1.2, -16, 16);

  // Isometric camera state (Overview & Explore modes)
  const smoothedIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));
  const desiredIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));

  // Front-facing Shop Showcase perspective camera state (Focus mode)
  const smoothedShopCamPos = useRef(new THREE.Vector3(0, 2.2, 12));
  const smoothedShopLookAt = useRef(new THREE.Vector3(0, 2.1, 0));
  const lastFocusedBoothIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const orthoCam = orthoCamRef.current;
    if (orthoCam) {
      orthoCam.near = 0.1;
      orthoCam.far = 320;
      orthoCam.position.copy(smoothedIsoTarget.current).add(ISOMETRIC_OFFSET);
      orthoCam.lookAt(smoothedIsoTarget.current);
      orthoCam.zoom = clampedZoom;
      orthoCam.updateProjectionMatrix();
      orthoCam.updateMatrixWorld();
    }
  }, [orthoCamRef, size.width, size.height]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);

    // 1. Advance local player movement first in the unified R3F frame loop
    if (onStepMovement) {
      onStepMovement(rawDelta);
    }

    // 2. Always keep exterior isometric target updated so returning from Shop Showcase is seamless
    if (cameraMode === 'overview') {
      desiredIsoTarget.current.set(0, 0.2, 0.8);
    } else {
      const liveX = playerTransformRef ? playerTransformRef.current.x : targetX;
      const liveZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
      const nextFocusX = THREE.MathUtils.clamp(liveX * 0.9, -18, 18);
      const nextFocusZ = THREE.MathUtils.clamp(liveZ * 0.85 - 1.2, -16, 16);
      desiredIsoTarget.current.set(nextFocusX, 0.45, nextFocusZ);
    }

    const isoPosAlpha = 1 - Math.exp(-6.5 * delta);
    const isoZoomAlpha = 1 - Math.exp(-7.5 * delta);
    smoothedIsoTarget.current.lerp(desiredIsoTarget.current, isoPosAlpha);

    const isShopShowcase = cameraMode === 'focus' && focusedBooth !== null;

    if (isShopShowcase && focusedBooth) {
      const perspCam = perspCamRef.current;
      if (!perspCam) return;

      const targets = computeShopShowcaseCameraTargets(
        focusedBooth,
        size.width,
        size.height,
        isPanelOpen
      );

      // When newly entering a booth's Shop Showcase, start from a gentle front-entry offset
      // in that booth's own front corridor so the camera never sweeps through roofs or walls
      if (lastFocusedBoothIdRef.current !== focusedBooth.id) {
        lastFocusedBoothIdRef.current = focusedBooth.id;
        smoothedShopCamPos.current.copy(targets.entryPosition);
        smoothedShopLookAt.current.copy(targets.lookAtTarget);
      }

      const focusAlpha = 1 - Math.exp(-8.5 * delta);
      smoothedShopCamPos.current.lerp(targets.cameraPosition, focusAlpha);
      smoothedShopLookAt.current.lerp(targets.lookAtTarget, focusAlpha);

      perspCam.position.copy(smoothedShopCamPos.current);
      perspCam.lookAt(smoothedShopLookAt.current);
      perspCam.updateMatrixWorld();
      return;
    }

    // Reset booth focus tracker when back in exterior Overview / Explore mode
    lastFocusedBoothIdRef.current = null;

    const orthoCam = orthoCamRef.current;
    if (orthoCam) {
      orthoCam.position.copy(smoothedIsoTarget.current).add(ISOMETRIC_OFFSET);
      orthoCam.lookAt(smoothedIsoTarget.current);

      if (Math.abs(orthoCam.zoom - clampedZoom) > 0.015) {
        orthoCam.zoom = THREE.MathUtils.lerp(orthoCam.zoom, clampedZoom, isoZoomAlpha);
        orthoCam.updateProjectionMatrix();
      }
      orthoCam.updateMatrixWorld();
    }
  });

  return null;
};

export const ExhibitionScene: React.FC<ExhibitionSceneProps> = React.memo(
  ({
    booths,
    productCountByBooth,
    slotsByBooth,
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
    const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
    const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);

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

    const isShopShowcase = cameraMode === 'focus' && activeFocusedBooth !== null;

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
          gl={{
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.06,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          camera={{
            position: [16, 26, 28],
            zoom: 34,
            near: 0.1,
            far: 320,
          }}
        >
          <color attach="background" args={['#dce8f5']} />
          <fog attach="fog" args={['#dce8f5', 82, 185]} />

          {/* Exterior Isometric Orthographic Camera (Overview & Explore Modes) */}
          <OrthographicCamera
            ref={orthoCamRef}
            makeDefault={!isShopShowcase}
            position={[16, 26, 28]}
            zoom={34}
            near={0.1}
            far={320}
          />

          {/* Front-Facing Eye-Level Shop Showcase Perspective Camera (Focus Mode) */}
          <PerspectiveCamera
            ref={perspCamRef}
            makeDefault={isShopShowcase}
            fov={SHOP_SHOWCASE_FOV}
            near={0.2}
            far={160}
            position={[0, 2.2, 12]}
          />

          <HybridCameraRig
            orthoCamRef={orthoCamRef}
            perspCamRef={perspCamRef}
            targetX={player.x}
            targetZ={player.z}
            playerTransformRef={playerTransformRef}
            onStepMovement={onStepMovement}
            cameraMode={cameraMode}
            focusedBooth={activeFocusedBooth}
            isPanelOpen={false}
            zoom={zoom}
          />

          {/* Stylized 3D City Daylight & Golden-Hour Architectural Lighting */}
          <ambientLight intensity={0.82} />
          <hemisphereLight args={['#f0f9ff', '#64748b', 0.78]} />
          <directionalLight
            position={[24, 38, 20]}
            intensity={1.52}
            color="#fffbeb"
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
          <directionalLight position={[-20, 24, -18]} intensity={0.52} color="#93c5fd" />
          <pointLight position={[0, 5.2, 0]} intensity={0.75} distance={20} color="#fde68a" />

          <Environment
            onGroundClick={handleEnvironmentGroundClick}
            clickMarker={clickMarker}
          />

          {!isShopShowcase && linePoints.length >= 2 && (
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
              slots={slotsByBooth?.[booth.id]}
              selectedProductId={selectedProductId}
              onSelectProduct={onSelectProduct}
              isSelected={
                selectedBoothId === booth.id ||
                (cameraMode === 'focus' && activeFocusedBooth?.id === booth.id)
              }
              visible={!isShopShowcase || activeFocusedBooth?.id === booth.id}
              onSelect={onSelectBooth}
            />
          ))}

          {/* Conditionally Mounted Shop Showcase 3D Stage (Only active when viewing a booth) */}
          {isShopShowcase && activeFocusedBooth && onSelectProduct && (
            <ShopShowcaseStage
              booth={activeFocusedBooth}
              products={activeBoothProducts}
              slots={slotsByBooth?.[activeFocusedBooth.id]}
              selectedProductId={selectedProductId}
              onSelectProduct={onSelectProduct}
            />
          )}

          {/* Hide exterior avatars during front-facing Shop Showcase so they never photobomb the lens */}
          {!isShopShowcase && (
            <>
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
            </>
          )}
        </Canvas>
      </div>
    );
  }
);
