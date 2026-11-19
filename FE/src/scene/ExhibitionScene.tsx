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
import { GrandExpoHall } from './GrandExpoHall';
import {
  type ExpoWorldVersion,
  V27_0_WORLD_BOUNDS,
  V27_WORLD_BOUNDS,
  isGrandHallWorld,
} from './worldLayout';
import { Booth } from './Booth';
import { ShopShowcaseStage } from './ShopShowcaseStage';
import { LocalPlayer } from './LocalPlayer';
import { RemotePlayers } from './RemotePlayers';
import type { NpcAnimationClipName } from '../services/npcPresentationService';

export type CameraViewMode = 'overview' | 'explore' | 'focus';

export interface ExhibitionSceneProps {
  booths: BoothType[];
  productCountByBooth: Record<string, number>;
  slotsByBooth?: Record<string, BoothSlotView[]>;
  activeBoothProducts?: Product[];
  selectedProductId?: string | null;
  npcHighlightedProductId?: string | null;
  activeNpcBoothId?: string | null;
  activeNpcAnimation?: NpcAnimationClipName;
  onActivateNpc?: (booth: BoothType) => void;
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
  worldVersion?: ExpoWorldVersion;
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
const ISOMETRIC_ORBIT_RADIUS = Math.hypot(ISOMETRIC_OFFSET.x, ISOMETRIC_OFFSET.z);
const ISOMETRIC_INITIAL_YAW = Math.atan2(ISOMETRIC_OFFSET.x, ISOMETRIC_OFFSET.z);
const MIN_CAMERA_ZOOM = 14;
const MAX_CAMERA_ZOOM = 64;
const SHOP_SHOWCASE_FOV = 38;
const THIRD_PERSON_FOV = 50;
const EMPTY_PRODUCTS: Product[] = [];

export const POINTER_LOCK_YAW_SENSITIVITY = 0.0026;
export const POINTER_LOCK_PITCH_SENSITIVITY = 0.0022;
export const DRAG_YAW_SENSITIVITY = 0.0052;
export const DRAG_PITCH_SENSITIVITY = 0.0038;
export const TOUCH_YAW_SENSITIVITY = 0.0068;
export const TOUCH_PITCH_SENSITIVITY = 0.0046;
export const CAMERA_DRAG_THRESHOLD_PX = 6;
export const TOUCH_DRAG_THRESHOLD_PX = 8;
export const MIN_CAMERA_PITCH = -0.38;
export const MAX_CAMERA_PITCH = 0.42;

/**
 * Classifies whether a pointer interaction from `(startX, startY)` to `(currentX, currentY)`
 * has exceeded the drag threshold (distinguishing camera drag-rotate from click-to-move / tap).
 */
export function classifyPointerGesture(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  pointerType: string = 'mouse'
): { isDrag: boolean; displacement: number; threshold: number } {
  const threshold = pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD_PX : CAMERA_DRAG_THRESHOLD_PX;
  const displacement = Math.hypot(currentX - startX, currentY - startY);
  return {
    isDrag: displacement > threshold,
    displacement,
    threshold,
  };
}

/**
 * Computes the next horizontal yaw and clamped vertical pitch from mouse-drag / touch-swipe deltas.
 * Clamps single-frame spikes so the camera never jumps or flips upside down.
 */
export function applyCameraDragDelta(
  currentYaw: number,
  currentPitch: number,
  deltaX: number,
  deltaY: number,
  pointerType: string = 'mouse'
): { yaw: number; pitch: number } {
  const yawSens = pointerType === 'touch' ? TOUCH_YAW_SENSITIVITY : DRAG_YAW_SENSITIVITY;
  const pitchSens = pointerType === 'touch' ? TOUCH_PITCH_SENSITIVITY : DRAG_PITCH_SENSITIVITY;
  const safeDx = Number.isFinite(deltaX) ? THREE.MathUtils.clamp(deltaX, -140, 140) : 0;
  const safeDy = Number.isFinite(deltaY) ? THREE.MathUtils.clamp(deltaY, -140, 140) : 0;
  const nextYaw = currentYaw - safeDx * yawSens;
  const nextPitch = THREE.MathUtils.clamp(
    currentPitch - safeDy * pitchSens,
    MIN_CAMERA_PITCH,
    MAX_CAMERA_PITCH
  );
  return { yaw: nextYaw, pitch: nextPitch };
}

/**
 * Retained math helper for yaw/pitch delta clamping compatibility.
 */
export function applyPointerLockMouseDelta(
  currentYaw: number,
  currentPitch: number,
  movementX: number,
  movementY: number,
  yawSensitivity = POINTER_LOCK_YAW_SENSITIVITY,
  pitchSensitivity = POINTER_LOCK_PITCH_SENSITIVITY
): { yaw: number; pitch: number } {
  const safeMovX = Number.isFinite(movementX) ? THREE.MathUtils.clamp(movementX, -180, 180) : 0;
  const safeMovY = Number.isFinite(movementY) ? THREE.MathUtils.clamp(movementY, -180, 180) : 0;
  const nextYaw = currentYaw - safeMovX * yawSensitivity;
  const nextPitch = THREE.MathUtils.clamp(
    currentPitch - safeMovY * pitchSensitivity,
    MIN_CAMERA_PITCH,
    MAX_CAMERA_PITCH
  );
  return { yaw: nextYaw, pitch: nextPitch };
}

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
  isPanelOpen: boolean,
  options?: { worldVersion?: ExpoWorldVersion; boothId?: string }
): ShopShowcaseCameraTargets {
  const safeWidth = Math.max(viewportWidth, 320);
  const safeHeight = Math.max(viewportHeight, 320);
  const aspect = safeWidth / safeHeight;
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(SHOP_SHOWCASE_FOV / 2));

  const isMobileLandscape = safeWidth <= 960 && safeHeight <= 500 && safeWidth > safeHeight;
  const isDesktopSplit = isPanelOpen && safeWidth > 860 && !isMobileLandscape;
  const isMobileSheet = isPanelOpen && safeWidth <= 860 && !isMobileLandscape;
  const isV27ThreeQuarter = options?.worldVersion === 'v27' && !isPanelOpen && !isMobileLandscape;

  let localCamZ: number;
  let localCamY: number;
  let localLookY: number;
  let localLookZ = -0.25;
  let panX = 0;
  let camAngleOffsetX = 0;

  if (isMobileLandscape) {
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.55;
    const distForWidth = 2.2 + halfSpanRequired / Math.max(0.26, tanHalfFov * aspect);
    localCamZ = THREE.MathUtils.clamp(Math.max(9.2, distForWidth), 9.2, 13.8);
    localCamY = 2.08;
    localLookY = 1.96;
    panX = isPanelOpen ? -0.65 : 0;
  } else if (isDesktopSplit) {
    const drawerFraction = Math.min(500 / safeWidth, 0.44);
    const openFraction = Math.max(0.52, 1 - drawerFraction);
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.58;
    const distForWidth =
      1.6 + halfSpanRequired / Math.max(0.32, openFraction * tanHalfFov * aspect);
    const distForHeight = 3.52 + 1.85 / tanHalfFov;
    localCamZ = THREE.MathUtils.clamp(Math.max(distForWidth, distForHeight), 9.05, 14.8);
    localCamY = 2.12;
    localLookY = 2.06;

    const frustumHalfWidthAtCenter = localCamZ * tanHalfFov * aspect;
    panX = drawerFraction * 0.88 * frustumHalfWidthAtCenter;
  } else if (isMobileSheet) {
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.58;
    const distForWidth = 1.8 + halfSpanRequired / Math.max(0.24, tanHalfFov * aspect);
    localCamZ = THREE.MathUtils.clamp(Math.max(distForWidth, 11.4), 11.4, 16.8);
    localCamY = 2.18;
    localLookY = 1.08;
    panX = 0;
  } else {
    const halfSpanRequired = Math.max(booth.width, 6.2) * 0.55;
    const distForWidth =
      2.4 + halfSpanRequired / Math.max(0.22, tanHalfFov * aspect);
    localCamZ = THREE.MathUtils.clamp(Math.max(9.05, distForWidth), 9.05, 15.2);
    if (isV27ThreeQuarter) {
      // V27.4 Phase 6 — Tailored 3/4 architectural Focus framing revealing interior depth,
      // custom counters, islands, shelves, products, and NPC with zero wall clipping.
      const bid = (options?.boothId || '').toLowerCase();
      if (bid.includes('nordic')) camAngleOffsetX = -1.45;
      else if (bid.includes('lumina')) camAngleOffsetX = 1.35;
      else if (bid.includes('aether')) camAngleOffsetX = 1.45;
      else if (bid.includes('solaris')) camAngleOffsetX = -1.50;
      else if (bid.includes('ecovita')) camAngleOffsetX = 1.35;
      else if (bid.includes('kinetix')) camAngleOffsetX = -1.45;
      else camAngleOffsetX = 1.25;
      localCamZ = THREE.MathUtils.clamp(localCamZ * 0.96, 8.85, 14.5);
      localCamY = 2.48;
      localLookY = 1.76;
      localLookZ = -0.35;
    } else {
      localCamY = 2.12;
      localLookY = 2.06;
    }
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

  const cameraPosition = toWorld(panX + camAngleOffsetX, localCamY, localCamZ);
  const lookAtTarget = toWorld(panX, localLookY, localLookZ);
  const entryPosition = toWorld(panX + camAngleOffsetX * 1.15, localCamY + 0.65, localCamZ + 2.2);

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
  cameraPitch = 0,
  worldVersion: ExpoWorldVersion = 'v26',
  isInitialWideFraming = false
): ThirdPersonCameraTargets {
  const isGrandHall = isGrandHallWorld(worldVersion);
  const activeBounds =
    worldVersion === 'v27'
      ? V27_WORLD_BOUNDS
      : worldVersion === 'v27_0'
        ? V27_0_WORLD_BOUNDS
        : WORLD_BOUNDS;
  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const clampedPitch = THREE.MathUtils.clamp(cameraPitch, -0.42, 0.48);
  const zoomRatio = 34 / clampedZoom;
  const desiredDist =
    isGrandHall && isInitialWideFraming
      ? worldVersion === 'v27'
        ? 5.6
        : 5.0
      : THREE.MathUtils.clamp(5.2 * zoomRatio, 3.5, 7.4);
  const baseCamHeight =
    isGrandHall && isInitialWideFraming
      ? worldVersion === 'v27'
        ? 6.15
        : 5.35
      : THREE.MathUtils.clamp(2.26 * zoomRatio, 1.72, 3.05);
  const pitchedCamHeight =
    clampedPitch === 0
      ? baseCamHeight
      : THREE.MathUtils.clamp(baseCamHeight - Math.sin(clampedPitch) * 0.95, 1.32, 6.45);

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
      tx < activeBounds.minX + 0.6 ||
      tx > activeBounds.maxX - 0.6 ||
      tz < activeBounds.minZ + 0.4 ||
      tz > activeBounds.maxZ + (isGrandHall ? 0.55 : -0.6);

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
    activeBounds.minX + 0.5,
    activeBounds.maxX - 0.5
  );
  const camZ = THREE.MathUtils.clamp(
    playerZ - fwdZ * safeDist,
    activeBounds.minZ + 0.5,
    activeBounds.maxZ + (isGrandHall ? 0.45 : -0.5)
  );
  const camY = clampedPitch === 0 ? Math.max(1.65, baseCamHeight) : Math.max(1.32, pitchedCamHeight);

  const lookAheadDist =
    isGrandHall && isInitialWideFraming ? (worldVersion === 'v27' ? 15.8 : 12.5) : 3.4;
  const lookX = playerX + fwdX * lookAheadDist;
  const lookY =
    isGrandHall && isInitialWideFraming
      ? 1.55
      : clampedPitch === 0
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
  isoYaw: number;
  isDragging: boolean;
  lastManualOrbitAt: number;
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
  worldVersion: ExpoWorldVersion;
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
  worldVersion,
}) => {
  const size = useThree((state) => state.size);

  const clampedZoom = THREE.MathUtils.clamp(zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const initX = playerTransformRef ? playerTransformRef.current.x : targetX;
  const initZ = playerTransformRef ? playerTransformRef.current.z : targetZ;
  const initRotY = playerTransformRef ? playerTransformRef.current.rotationY : targetRotY;
  const initFocusX = THREE.MathUtils.clamp(initX * 0.9, -18, 18);
  const initFocusZ = THREE.MathUtils.clamp(initZ * 0.85 - 1.2, -16, 16);

  // Mode A: Isometric camera state (Overview mode, supporting smooth 360° left-drag azimuth orbit)
  const smoothedIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));
  const desiredIsoTarget = useRef(new THREE.Vector3(initFocusX, 0.4, initFocusZ));
  const smoothedIsoYawRef = useRef<number>(ISOMETRIC_INITIAL_YAW);

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
  const v27HasUserMovedRef = useRef<boolean>(false);

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
      desiredIsoTarget.current.set(0, 0.2, worldVersion === 'v27' ? -1.0 : 0.8);
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
        isPanelOpen,
        { worldVersion, boothId: focusedBooth.id }
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

      const isGrandHall = isGrandHallWorld(worldVersion);
      if (isGrandHall && (liveState === 'walk' || orbitStateRef.current.isDragging)) {
        v27HasUserMovedRef.current = true;
      }
      const useV27InitialWide = isGrandHall && !v27HasUserMovedRef.current;
      const isPortrait = size.width < size.height;
      const targetExploreFov = useV27InitialWide
        ? isPortrait
          ? 70
          : worldVersion === 'v27'
            ? 62
            : 60
        : THIRD_PERSON_FOV;

      if (Math.abs(perspCam.fov - targetExploreFov) > 0.1) {
        perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetExploreFov, 1 - Math.exp(-8 * delta));
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
          tpCamPitchRef.current,
          worldVersion,
          useV27InitialWide
        );
        smoothedTpCamPos.current.copy(initTp.cameraPosition);
        smoothedTpLookAt.current.copy(initTp.lookAtTarget);
      } else {
        // When following an auto-path (Click-to-Move or quick-nav) and user is not actively dragging camera,
        // smoothly align orbit yaw behind the character's movement direction.
        if (
          hasActiveAutoPath &&
          liveState === 'walk' &&
          !orbitStateRef.current.isDragging &&
          performance.now() - orbitStateRef.current.lastManualOrbitAt > 1600
        ) {
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
        tpCamPitchRef.current,
        worldVersion,
        useV27InitialWide
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
      const isoYawDiff = shortestAngleDiff(smoothedIsoYawRef.current, orbitStateRef.current.isoYaw);
      if (Math.abs(isoYawDiff) > 1e-4) {
        const isoOrbitAlpha = 1 - Math.exp(-16 * delta);
        smoothedIsoYawRef.current += isoYawDiff * isoOrbitAlpha;
      }
      const offX = Math.sin(smoothedIsoYawRef.current) * ISOMETRIC_ORBIT_RADIUS;
      const offZ = Math.cos(smoothedIsoYawRef.current) * ISOMETRIC_ORBIT_RADIUS;
      orthoCam.position.set(
        smoothedIsoTarget.current.x + offX,
        smoothedIsoTarget.current.y + ISOMETRIC_OFFSET.y,
        smoothedIsoTarget.current.z + offZ
      );
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

/**
 * V27.2 Phase 3 — Adaptive Quality Controller with Strict Hysteresis.
 * Monitors rolling frame time after a 2.5s warm-up and smoothly adjusts WebGL pixelRatio
 * without remounting the Canvas, causing stutter, or reducing product/UI legibility.
 */
const AdaptiveQualityController: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  const { gl } = useThree();
  const tierRef = useRef<'high' | 'medium' | 'low'>(isMobile ? 'medium' : 'high');
  const warmupRef = useRef<number>(0);
  const accumTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lowStreakRef = useRef<number>(0);
  const highStreakRef = useRef<number>(0);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.25);
    if (warmupRef.current < 2.5) {
      warmupRef.current += dt;
      return;
    }
    accumTimeRef.current += dt;
    frameCountRef.current += 1;
    if (accumTimeRef.current < 1.5) return;

    const avgMs = (accumTimeRef.current * 1000) / Math.max(1, frameCountRef.current);
    accumTimeRef.current = 0;
    frameCountRef.current = 0;

    const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cur = tierRef.current;

    if (avgMs > 38) {
      lowStreakRef.current += 1;
      highStreakRef.current = 0;
      if (lowStreakRef.current >= 2) {
        lowStreakRef.current = 0;
        if (cur === 'high') {
          tierRef.current = 'medium';
          gl.setPixelRatio(Math.min(nativeDpr, 1.0));
        } else if (cur === 'medium') {
          tierRef.current = 'low';
          gl.setPixelRatio(Math.min(nativeDpr, 0.85));
        }
      }
    } else if (avgMs < 21) {
      highStreakRef.current += 1;
      lowStreakRef.current = 0;
      if (highStreakRef.current >= 3) {
        highStreakRef.current = 0;
        if (cur === 'low') {
          tierRef.current = 'medium';
          gl.setPixelRatio(Math.min(nativeDpr, 1.0));
        } else if (cur === 'medium' && !isMobile) {
          tierRef.current = 'high';
          gl.setPixelRatio(Math.min(nativeDpr, 1.25));
        }
      }
    } else {
      lowStreakRef.current = 0;
      highStreakRef.current = 0;
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
    npcHighlightedProductId = null,
    activeNpcBoothId = null,
    activeNpcAnimation = 'IDLE',
    onActivateNpc,
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
    worldVersion = 'v26',
  }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
    const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);

    const orbitStateRef = useRef<ExploreOrbitState>({
      yaw: playerTransformRef ? playerTransformRef.current.rotationY : player.rotationY,
      pitch: 0,
      isoYaw: ISOMETRIC_INITIAL_YAW,
      isDragging: false,
      lastManualOrbitAt: 0,
    });
    const activePointerIdRef = useRef<number | null>(null);
    const pointerStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const dragDistanceRef = useRef<number>(0);
    const isCurrentGestureDragRef = useRef<boolean>(false);
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

    const shouldSuppressInteractionClick = useCallback((): boolean => {
      return isCurrentGestureDragRef.current || performance.now() < suppressClickUntilRef.current;
    }, []);

    const handleEnvironmentGroundClick = useCallback(
      (pt: Point2D) => {
        if (shouldSuppressInteractionClick()) return;
        onGroundClick(pt.x, pt.z);
      },
      [onGroundClick, shouldSuppressInteractionClick]
    );

    const handleBoothSelect = useCallback(
      (booth: BoothType) => {
        if (shouldSuppressInteractionClick()) return;
        onSelectBooth(booth);
      },
      [onSelectBooth, shouldSuppressInteractionClick]
    );

    const handleNpcActivate = useCallback(
      (booth: BoothType) => {
        if (shouldSuppressInteractionClick()) return;
        onActivateNpc?.(booth);
      },
      [onActivateNpc, shouldSuppressInteractionClick]
    );

    const handleProductSelect = useCallback(
      (product: Product) => {
        if (shouldSuppressInteractionClick()) return;
        onSelectProduct?.(product);
      },
      [onSelectProduct, shouldSuppressInteractionClick]
    );

    const finishDragGesture = useCallback((pointerIdToRelease?: number) => {
      if (
        typeof pointerIdToRelease === 'number' &&
        containerRef.current &&
        typeof containerRef.current.hasPointerCapture === 'function'
      ) {
        try {
          if (containerRef.current.hasPointerCapture(pointerIdToRelease)) {
            containerRef.current.releasePointerCapture(pointerIdToRelease);
          }
        } catch {
          // ignore releasePointerCapture errors
        }
      }
      if (isCurrentGestureDragRef.current) {
        suppressClickUntilRef.current = performance.now() + 240;
      } else if (suppressClickUntilRef.current === Number.POSITIVE_INFINITY) {
        suppressClickUntilRef.current = 0;
      }
      activePointerIdRef.current = null;
      isCurrentGestureDragRef.current = false;
      orbitStateRef.current.isDragging = false;
      setIsDraggingOrbit(false);
    }, []);

    // Safety cleanup if user releases mouse button outside window or alt-tabs mid-drag
    React.useEffect(() => {
      if (typeof window === 'undefined') return;
      const onGlobalPointerEnd = (e: PointerEvent) => {
        if (activePointerIdRef.current !== null && e.pointerId === activePointerIdRef.current) {
          finishDragGesture(e.pointerId);
        }
      };
      const onWindowBlur = () => {
        if (activePointerIdRef.current !== null) {
          finishDragGesture(activePointerIdRef.current);
        }
      };
      window.addEventListener('pointerup', onGlobalPointerEnd);
      window.addEventListener('pointercancel', onGlobalPointerEnd);
      window.addEventListener('blur', onWindowBlur);
      return () => {
        window.removeEventListener('pointerup', onGlobalPointerEnd);
        window.removeEventListener('pointercancel', onGlobalPointerEnd);
        window.removeEventListener('blur', onWindowBlur);
      };
    }, [finishDragGesture]);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (cameraMode === 'focus') return;
        // Desktop: hold Left Mouse button (button === 0) to drag-rotate camera; Mobile: single-finger touch swipe
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (activePointerIdRef.current !== null) return;

        activePointerIdRef.current = e.pointerId;
        pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
        dragDistanceRef.current = 0;
        isCurrentGestureDragRef.current = false;
      },
      [cameraMode]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (cameraMode === 'focus' || e.pointerId !== activePointerIdRef.current) return;

        const dx = e.clientX - lastPointerPosRef.current.x;
        const dy = e.clientY - lastPointerPosRef.current.y;
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
        dragDistanceRef.current += Math.hypot(dx, dy);

        if (!isCurrentGestureDragRef.current) {
          const gesture = classifyPointerGesture(
            pointerStartPosRef.current.x,
            pointerStartPosRef.current.y,
            e.clientX,
            e.clientY,
            e.pointerType
          );
          if (!gesture.isDrag) {
            return;
          }
          isCurrentGestureDragRef.current = true;
          suppressClickUntilRef.current = Number.POSITIVE_INFINITY;
          orbitStateRef.current.isDragging = true;
          setIsDraggingOrbit(true);
          try {
            containerRef.current?.setPointerCapture?.(e.pointerId);
          } catch {
            // ignore pointer capture errors in synthetic test environments
          }
        }

        orbitStateRef.current.lastManualOrbitAt = performance.now();

        if (cameraMode === 'explore') {
          const next = applyCameraDragDelta(
            orbitStateRef.current.yaw,
            orbitStateRef.current.pitch,
            dx,
            dy,
            e.pointerType
          );
          orbitStateRef.current.yaw = next.yaw;
          orbitStateRef.current.pitch = next.pitch;
        } else if (cameraMode === 'overview') {
          const yawSens = e.pointerType === 'touch' ? TOUCH_YAW_SENSITIVITY : DRAG_YAW_SENSITIVITY;
          const safeDx = Number.isFinite(dx) ? THREE.MathUtils.clamp(dx, -140, 140) : 0;
          orbitStateRef.current.isoYaw -= safeDx * yawSens;
        }
      },
      [cameraMode]
    );

    const handlePointerUpOrCancel = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        finishDragGesture(e.pointerId);
      },
      [finishDragGesture]
    );

    const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (isCurrentGestureDragRef.current || performance.now() < suppressClickUntilRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
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

    const isGrandHall = isGrandHallWorld(worldVersion);
    // Adaptive Mobile Quality: cap DPR to 1 and disable expensive dynamic shadow pass on mobile viewports
    const isMobilePerfMode =
      typeof window !== 'undefined' &&
      (window.innerWidth <= 860 ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));

    return (
      <div
        ref={containerRef}
        className={`expo-canvas-container ${
          isExploreMode ? 'expo-canvas-container--explore' : ''
        } ${isDraggingOrbit ? 'expo-canvas-container--dragging' : ''}`}
        aria-label="Không gian triển lãm 3D"
        onClickCapture={handleClickCapture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onWheel={handleWheel}
      >
        <Canvas
          orthographic
          shadows={!isMobilePerfMode}
          dpr={isMobilePerfMode ? 1 : [1, 1.25]}
          gl={{
            antialias: !isMobilePerfMode,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.02,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          camera={{
            position: [16, 26, 28],
            zoom: 34,
            near: 0.1,
            far: 320,
          }}
        >
          <color attach="background" args={[isGrandHall ? '#dce6f2' : '#cfe4f7']} />
          <fog attach="fog" args={[isGrandHall ? '#dce6f2' : '#cfe4f7', 110, 260]} />
          <AdaptiveQualityController isMobile={isMobilePerfMode} />

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
            isPanelOpen={Boolean(activeNpcBoothId && activeFocusedBooth?.id === activeNpcBoothId)}
            zoom={zoom}
            worldVersion={worldVersion}
          />

          {/* Balanced Exhibition Daylight & Soft Architectural Fill Lighting */}
          <ambientLight intensity={isGrandHall ? 0.86 : 0.72} />
          <hemisphereLight args={['#f8fafc', '#94a3b8', isGrandHall ? 0.80 : 0.82]} />
          <directionalLight
            position={[28, 46, 24]}
            intensity={isGrandHall ? 1.24 : 1.38}
            color="#fffdf7"
            castShadow={!isMobilePerfMode}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={worldVersion === 'v27' ? -42 : -34}
            shadow-camera-right={worldVersion === 'v27' ? 42 : 34}
            shadow-camera-top={worldVersion === 'v27' ? 42 : 34}
            shadow-camera-bottom={worldVersion === 'v27' ? -42 : -34}
            shadow-camera-near={1}
            shadow-camera-far={140}
            shadow-bias={-0.00025}
            shadow-radius={2.5}
          />
          <directionalLight position={[-22, 28, -18]} intensity={0.68} color="#dbeafe" />
          <directionalLight position={[0, 26, 28]} intensity={0.44} color="#fff7ed" />
          {worldVersion === 'v26' && (
            <pointLight position={[0, 5.2, 0]} intensity={0.88} distance={22} color="#fde68a" />
          )}

          {isGrandHall ? (
            <GrandExpoHall
              onGroundClick={handleEnvironmentGroundClick}
              clickMarker={clickMarker}
              worldVersion={worldVersion}
            />
          ) : (
            <Environment
              onGroundClick={handleEnvironmentGroundClick}
              clickMarker={clickMarker}
            />
          )}

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
              npcHighlightedProductId={
                activeNpcBoothId === booth.id ? npcHighlightedProductId : null
              }
              isActiveNpcSession={activeNpcBoothId === booth.id}
              activeNpcAnimation={
                activeNpcBoothId === booth.id ? activeNpcAnimation : 'IDLE'
              }
              onActivateNpc={handleNpcActivate}
              onSelectProduct={handleProductSelect}
              isSelected={
                selectedBoothId === booth.id ||
                (cameraMode === 'focus' && activeFocusedBooth?.id === booth.id)
              }
              visible={!isShopShowcase || activeFocusedBooth?.id === booth.id}
              showParkPlanters={worldVersion === 'v26'}
              worldVersion={worldVersion}
              onSelect={handleBoothSelect}
            />
          ))}

          {/* Conditionally Mounted Shop Showcase 3D Stage:
              - In V26.1 Park World: mounts legacy storefront courtyard & lanterns
              - In V27 / V27.1 Grand Expo World: clean 3-point architectural gallery lighting ONLY (zero low-poly flowers/lanterns!) */}
          {isShopShowcase && activeFocusedBooth && onSelectProduct && (
            isGrandHall ? (
              <group
                position={[activeFocusedBooth.positionX, 0, activeFocusedBooth.positionZ]}
                rotation={[0, activeFocusedBooth.rotationY || 0, 0]}
              >
                <pointLight position={[0, 2.6, 2.4]} color="#fffdf7" intensity={1.35} distance={12} />
                <pointLight position={[-2.6, 2.2, 2.2]} color="#f8fafc" intensity={0.85} distance={9} />
                <pointLight position={[2.6, 2.2, 2.2]} color="#f8fafc" intensity={0.85} distance={9} />
              </group>
            ) : (
              <ShopShowcaseStage
                booth={activeFocusedBooth}
                products={activeBoothProducts}
                slots={slotsByBooth?.[activeFocusedBooth.id]}
                selectedProductId={selectedProductId}
                onSelectProduct={handleProductSelect}
              />
            )
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
