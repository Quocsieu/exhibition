import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import {
  type Booth as BoothType,
  type BoothSlotView,
  type Point2D,
  type Product,
  type VisitorState,
  WORLD_BOUNDS,
  getBoothObstacleBox,
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
  cameraYawRef?: React.MutableRefObject<number | null>;
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
  onZoomChange?: (updater: (prevZoom: number) => number) => void;
}

export interface ShopShowcaseCameraTargets {
  cameraPosition: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
  entryPosition: THREE.Vector3;
}

export interface ThirdPersonCameraTargets {
  cameraPosition: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
}

const ISOMETRIC_OFFSET = new THREE.Vector3(16, 26, 22);
const MIN_CAMERA_ZOOM = 14;
const MAX_CAMERA_ZOOM = 64;
const SHOP_SHOWCASE_FOV = 38;
const THIRD_PERSON_FOV = 50;
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
    // Full-screen Shop Showcase: closer eye-level framing so all 6 product slots and backdrop are large & clear
    localCamZ = 9.35;
    localCamY = 2.15;
    localLookY = 1.96;
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
  const entryPosition = toWorld(panX, localCamY + 0.65, localCamZ + 2.2);

  return {
    cameraPosition,
    lookAtTarget,
    entryPosition,
  };
}

/**
 * Computes the Low-Angle Third-Person (`Tham quan`) camera position and forward lookAt target:
 * - Positioned behind and slightly above the character (`y = 1.75..3.0m`)
 * - Looking forward along the walkway so the visitor sees the character, pavement, booths on both sides, and spatial depth
 * - Prevents ground clipping (`y >= 1.65m`) and pulls closer if a booth obstacle box is behind the character
 */
export function computeThirdPersonCameraTargets(
  playerX: number,
  playerZ: number,
  cameraYaw: number,
  zoom: number,
  booths: BoothType[],
  cameraPitch = 0
): ThirdPersonCameraTargets {
  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const clampedPitch = THREE.MathUtils.clamp(cameraPitch, -0.42, 0.48);
  const zoomRatio = 34 / clampedZoom;
  const desiredDist = THREE.MathUtils.clamp(5.2 * zoomRatio, 3.5, 7.4);
  const baseCamHeight = THREE.MathUtils.clamp(2.26 * zoomRatio, 1.72, 3.05);
  const pitchedCamHeight =
    clampedPitch === 0
      ? baseCamHeight
      : THREE.MathUtils.clamp(baseCamHeight - Math.sin(clampedPitch) * 0.95, 1.32, 3.55);

  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);

  // Raycast sample points behind the character to prevent clipping inside booth walls
  let safeDist = desiredDist;
  const obstacleBoxes = booths.map((b) => getBoothObstacleBox(b));
  const checkFractions = [0.35, 0.55, 0.75, 1.0];

  for (const frac of checkFractions) {
    const testDist = desiredDist * frac;
    const tx = playerX - fwdX * testDist;
    const tz = playerZ - fwdZ * testDist;

    const outOfBounds =
      tx < WORLD_BOUNDS.minX + 1.0 ||
      tx > WORLD_BOUNDS.maxX - 1.0 ||
      tz < WORLD_BOUNDS.minZ + 1.0 ||
      tz > WORLD_BOUNDS.maxZ - 1.0;

    const hitsBooth = obstacleBoxes.some(
      (box) => tx >= box.minX && tx <= box.maxX && tz >= box.minZ && tz <= box.maxZ
    );

    if (outOfBounds || hitsBooth) {
      safeDist = Math.max(2.15, desiredDist * Math.max(0.25, frac - 0.22));
      break;
    }
  }

  const camX = THREE.MathUtils.clamp(
    playerX - fwdX * safeDist,
    WORLD_BOUNDS.minX + 0.9,
    WORLD_BOUNDS.maxX - 0.9
  );
  const camZ = THREE.MathUtils.clamp(
    playerZ - fwdZ * safeDist,
    WORLD_BOUNDS.minZ + 0.9,
    WORLD_BOUNDS.maxZ - 0.9
  );
  const camY = clampedPitch === 0 ? Math.max(1.65, baseCamHeight) : Math.max(1.32, pitchedCamHeight);

  const lookAheadDist = 3.4;
  const lookX = playerX + fwdX * lookAheadDist;
  const lookY =
    clampedPitch === 0
      ? 1.46
      : THREE.MathUtils.clamp(1.46 + Math.sin(clampedPitch) * 1.65, 0.45, 3.25);
  const lookZ = playerZ + fwdZ * lookAheadDist;

  return {
    cameraPosition: new THREE.Vector3(camX, camY, camZ),
    lookAtTarget: new THREE.Vector3(lookX, lookY, lookZ),
  };
}

function shortestAngleDiff(fromAngle: number, toAngle: number): number {
  return Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
}

interface ExploreOrbitState {
  yaw: number;
  pitch: number;
  isDragging: boolean;
}

interface HybridCameraRigProps {
  orthoCamRef: React.RefObject<THREE.OrthographicCamera | null>;
  perspCamRef: React.RefObject<THREE.PerspectiveCamera | null>;
  booths: BoothType[];
  targetX: number;
  targetZ: number;
  targetRotY: number;
  playerTransformRef?: React.MutableRefObject<PlayerTransform>;
  cameraYawRef?: React.MutableRefObject<number | null>;
  orbitStateRef: React.MutableRefObject<ExploreOrbitState>;
  hasActiveAutoPath: boolean;
  onStepMovement?: (delta: number) => void;
  cameraMode: CameraViewMode;
  focusedBooth: BoothType | null;
  isPanelOpen: boolean;
  zoom: number;
}

const HybridCameraRig: React.FC<HybridCameraRigProps> = ({
  orthoCamRef,
  perspCamRef,
  booths,
  targetX,
  targetZ,
  targetRotY,
  playerTransformRef,
  cameraYawRef,
  orbitStateRef,
  hasActiveAutoPath,
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
  const initRotY = playerTransformRef ? playerTransformRef.current.rotationY : targetRotY;
  const initFocusX = THREE.MathUtils.clamp(initX * 0.9, -18, 18);
  const initFocusZ = THREE.MathUtils.clamp(initZ * 0.85 - 1.2, -16, 16);

  // Mode A: Isometric camera state (Overview mode)
  const smoothedIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));
  const desiredIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));

  // Mode B: Low-Angle Third-Person camera state (Explore mode)
  const tpCamYawRef = useRef<number>(initRotY);
  const tpCamPitchRef = useRef<number>(0);
  const smoothedTpCamPos = useRef(
    new THREE.Vector3(
      initX - Math.sin(initRotY) * 5.2,
      2.26,
      initZ - Math.cos(initRotY) * 5.2
    )
  );
  const smoothedTpLookAt = useRef(
    new THREE.Vector3(
      initX + Math.sin(initRotY) * 3.4,
      1.46,
      initZ + Math.cos(initRotY) * 3.4
    )
  );
  const wasExploreModeRef = useRef<boolean>(false);

  // Mode C: Front-facing Shop Showcase perspective camera state (Focus mode)
  const smoothedShopCamPos = useRef(new THREE.Vector3(0, 2.15, 10));
  const smoothedShopLookAt = useRef(new THREE.Vector3(0, 1.96, 0));
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

    // 1. Sync cameraYawRef before stepping movement so WASD/Joystick uses Third-Person heading in Explore Mode
    if (cameraYawRef) {
      cameraYawRef.current = cameraMode === 'explore' ? tpCamYawRef.current : null;
    }

    // 2. Advance local player movement in the unified R3F frame loop
    if (onStepMovement) {
      onStepMovement(rawDelta);
    }

    const liveX = playerTransformRef ? playerTransformRef.current.x : targetX;
    const liveZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
    const liveRotY = playerTransformRef ? playerTransformRef.current.rotationY : targetRotY;
    const liveState = playerTransformRef ? playerTransformRef.current.state : 'idle';

    // 3. Keep Overview isometric target updated
    if (cameraMode === 'overview') {
      desiredIsoTarget.current.set(0, 0.2, 0.8);
    } else {
      const nextFocusX = THREE.MathUtils.clamp(liveX * 0.9, -18, 18);
      const nextFocusZ = THREE.MathUtils.clamp(liveZ * 0.85 - 1.2, -16, 16);
      desiredIsoTarget.current.set(nextFocusX, 0.45, nextFocusZ);
    }

    const isoPosAlpha = 1 - Math.exp(-6.5 * delta);
    const isoZoomAlpha = 1 - Math.exp(-7.5 * delta);
    smoothedIsoTarget.current.lerp(desiredIsoTarget.current, isoPosAlpha);

    const isShopShowcase = cameraMode === 'focus' && focusedBooth !== null;

    // ========================================================================
    // MODE C — XEM GIAN HÀNG (Shop Showcase Eye-Level Perspective Camera)
    // ========================================================================
    if (isShopShowcase && focusedBooth) {
      wasExploreModeRef.current = false;
      const perspCam = perspCamRef.current;
      if (!perspCam) return;

      if (Math.abs(perspCam.fov - SHOP_SHOWCASE_FOV) > 0.1) {
        perspCam.fov = SHOP_SHOWCASE_FOV;
        perspCam.updateProjectionMatrix();
      }

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

    lastFocusedBoothIdRef.current = null;

    // ========================================================================
    // MODE B — THAM QUAN (Low-Angle Third-Person Perspective Camera)
    // ========================================================================
    if (cameraMode === 'explore') {
      const perspCam = perspCamRef.current;
      if (!perspCam) return;

      if (Math.abs(perspCam.fov - THIRD_PERSON_FOV) > 0.1) {
        perspCam.fov = THIRD_PERSON_FOV;
        perspCam.updateProjectionMatrix();
      }

      if (!wasExploreModeRef.current) {
        wasExploreModeRef.current = true;
        tpCamYawRef.current = liveRotY;
        tpCamPitchRef.current = 0;
        orbitStateRef.current.yaw = liveRotY;
        orbitStateRef.current.pitch = 0;
        const initTp = computeThirdPersonCameraTargets(
          liveX,
          liveZ,
          tpCamYawRef.current,
          clampedZoom,
          booths,
          tpCamPitchRef.current
        );
        smoothedTpCamPos.current.copy(initTp.cameraPosition);
        smoothedTpLookAt.current.copy(initTp.lookAtTarget);
      } else {
        // When following an auto-path from the quick-nav dropdown and user is not dragging camera,
        // smoothly align orbit yaw behind the path direction.
        if (hasActiveAutoPath && liveState === 'walk' && !orbitStateRef.current.isDragging) {
          const autoDiff = shortestAngleDiff(orbitStateRef.current.yaw, liveRotY);
          const autoAlpha = 1 - Math.exp(-3.6 * delta);
          orbitStateRef.current.yaw += autoDiff * autoAlpha;
        }

        // Smoothly damp camera yaw & pitch toward user's mouse-drag / touch-swipe target
        const orbitAlpha = 1 - Math.exp(-18 * delta);
        const yawDiff = shortestAngleDiff(tpCamYawRef.current, orbitStateRef.current.yaw);
        tpCamYawRef.current += yawDiff * orbitAlpha;
        tpCamPitchRef.current = THREE.MathUtils.lerp(
          tpCamPitchRef.current,
          orbitStateRef.current.pitch,
          orbitAlpha
        );
      }

      if (cameraYawRef) {
        cameraYawRef.current = tpCamYawRef.current;
      }

      const tpTargets = computeThirdPersonCameraTargets(
        liveX,
        liveZ,
        tpCamYawRef.current,
        clampedZoom,
        booths,
        tpCamPitchRef.current
      );

      const tpAlpha = 1 - Math.exp(-12 * delta);
      smoothedTpCamPos.current.lerp(tpTargets.cameraPosition, tpAlpha);
      smoothedTpLookAt.current.lerp(tpTargets.lookAtTarget, tpAlpha);

      perspCam.position.copy(smoothedTpCamPos.current);
      perspCam.lookAt(smoothedTpLookAt.current);
      perspCam.updateMatrixWorld();
      return;
    }

    // ========================================================================
    // MODE A — TOÀN CẢNH (2.5D Isometric Orthographic Camera)
    // ========================================================================
    wasExploreModeRef.current = false;
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
    cameraYawRef,
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
    onZoomChange,
  }) => {
    const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
    const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);

    const orbitStateRef = useRef<ExploreOrbitState>({
      yaw: playerTransformRef ? playerTransformRef.current.rotationY : player.rotationY,
      pitch: 0,
      isDragging: false,
    });
    const activePointerIdRef = useRef<number | null>(null);
    const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const dragDistanceRef = useRef<number>(0);
    const suppressClickUntilRef = useRef<number>(0);
    const [isDraggingOrbit, setIsDraggingOrbit] = useState(false);

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
    const isOverviewMode = cameraMode === 'overview';
    const isExploreMode = cameraMode === 'explore';

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
        if (performance.now() < suppressClickUntilRef.current) return;
        // In Third-Person Explore Mode, clicking/tapping the ground does NOT auto-walk
        if (cameraMode === 'explore') return;
        onGroundClick(pt.x, pt.z);
      },
      [cameraMode, onGroundClick]
    );

    const handleBoothSelect = useCallback(
      (booth: BoothType) => {
        if (performance.now() < suppressClickUntilRef.current) return;
        onSelectBooth(booth);
      },
      [onSelectBooth]
    );

    const handleProductSelect = useCallback(
      (product: Product) => {
        if (performance.now() < suppressClickUntilRef.current) return;
        onSelectProduct?.(product);
      },
      [onSelectProduct]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (cameraMode !== 'explore') return;
        // On PC mouse, only rotate with Left Mouse Button (button === 0)
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (activePointerIdRef.current !== null) return;

        activePointerIdRef.current = e.pointerId;
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
        dragDistanceRef.current = 0;
      },
      [cameraMode]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (cameraMode !== 'explore' || e.pointerId !== activePointerIdRef.current) return;

        const dx = e.clientX - lastPointerPosRef.current.x;
        const dy = e.clientY - lastPointerPosRef.current.y;
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };

        const stepDist = Math.hypot(dx, dy);
        dragDistanceRef.current += stepDist;

        if (dragDistanceRef.current > 3) {
          if (!orbitStateRef.current.isDragging) {
            orbitStateRef.current.isDragging = true;
            setIsDraggingOrbit(true);
          }
          const yawSens = e.pointerType === 'touch' ? 0.0068 : 0.0052;
          const pitchSens = e.pointerType === 'touch' ? 0.0046 : 0.0038;
          orbitStateRef.current.yaw -= dx * yawSens;
          orbitStateRef.current.pitch = THREE.MathUtils.clamp(
            orbitStateRef.current.pitch - dy * pitchSens,
            -0.42,
            0.48
          );
        }
      },
      [cameraMode]
    );

    const handlePointerUpOrCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      if (dragDistanceRef.current > 6) {
        suppressClickUntilRef.current = performance.now() + 140;
      }
      activePointerIdRef.current = null;
      orbitStateRef.current.isDragging = false;
      setIsDraggingOrbit(false);
    }, []);

    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLDivElement>) => {
        if (!onZoomChange || cameraMode === 'focus') return;
        const deltaZoom = e.deltaY < 0 ? 2.5 : -2.5;
        onZoomChange((prev) =>
          THREE.MathUtils.clamp(prev + deltaZoom, MIN_CAMERA_ZOOM, 60)
        );
      },
      [cameraMode, onZoomChange]
    );

    return (
      <div
        className={`expo-canvas-container ${
          isExploreMode ? 'expo-canvas-container--explore' : ''
        } ${isDraggingOrbit ? 'expo-canvas-container--dragging' : ''}`}
        aria-label="Không gian triển lãm 3D"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onPointerLeave={handlePointerUpOrCancel}
        onWheel={handleWheel}
      >
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
          <color attach="background" args={['#cfe4f7']} />
          <fog attach="fog" args={['#cfe4f7', 86, 195]} />

          {/* MODE A: Exterior 2.5D Isometric Orthographic Camera (Overview Mode) */}
          <OrthographicCamera
            ref={orthoCamRef}
            makeDefault={isOverviewMode}
            position={[16, 26, 28]}
            zoom={34}
            near={0.1}
            far={320}
          />

          {/* MODE B (Third-Person Explore) & MODE C (Shop Showcase Focus): Perspective Camera */}
          <PerspectiveCamera
            ref={perspCamRef}
            makeDefault={!isOverviewMode}
            fov={isShopShowcase ? SHOP_SHOWCASE_FOV : THIRD_PERSON_FOV}
            near={0.2}
            far={220}
            position={[0, 2.26, 9]}
          />

          <HybridCameraRig
            orthoCamRef={orthoCamRef}
            perspCamRef={perspCamRef}
            booths={booths}
            targetX={player.x}
            targetZ={player.z}
            targetRotY={player.rotationY}
            playerTransformRef={playerTransformRef}
            cameraYawRef={cameraYawRef}
            orbitStateRef={orbitStateRef}
            hasActiveAutoPath={activePath.length > 0}
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
              onSelectProduct={handleProductSelect}
              isSelected={
                selectedBoothId === booth.id ||
                (cameraMode === 'focus' && activeFocusedBooth?.id === booth.id)
              }
              visible={!isShopShowcase || activeFocusedBooth?.id === booth.id}
              onSelect={handleBoothSelect}
            />
          ))}

          {/* Conditionally Mounted Shop Showcase 3D Stage (Only active when viewing a booth) */}
          {isShopShowcase && activeFocusedBooth && onSelectProduct && (
            <ShopShowcaseStage
              booth={activeFocusedBooth}
              products={activeBoothProducts}
              slots={slotsByBooth?.[activeFocusedBooth.id]}
              selectedProductId={selectedProductId}
              onSelectProduct={handleProductSelect}
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
