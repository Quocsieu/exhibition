import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
  V28ZoneRecord,
} from '../../services/v28Api';
import { DynamicBooth3D } from './DynamicBooth3D';
import { NavigationPath3D } from './NavigationPath3D';
import { CharacterNavigationRing3D } from './CharacterNavigationRing3D';
import { getV28BoothSlotSpec } from './v28ProductSlotLayouts';
import type { V28NpcAnimState } from './DynamicBoothNpc3D';
import type { HighlightedBoothProduct, NpcSessionState } from '../../hooks/useNpcConsultationSession';
import {
  advanceAutoWalkWaypoints,
  type GuidedRouteResult,
  type RoutePoint,
} from '../../services/v28NavigationEngine';
import { getTextureCacheStats } from './v28BoothAssets';
import { V27VisualKitLayer, useV27TerrazzoFloorTexture } from './V27VisualKit';
import { YouthEntranceArch3D } from './YouthEntranceArch3D';
import type { V28OnboardingGuideSignal } from '../../services/v28OnboardingStateMachine';
import {
  clampCameraPosition,
  clampPointToWalkable,
  computeRotatedBoothCollider,
  deriveWalkableRegions,
  isPointWalkable,
  stepSeamlessFreeMove,
} from './v28NavigationBounds';
import {
  computeV28BoothFocusCamera,
  computeV28CameraRelativeMove,
  computeV28ExploreCamera,
  shortestAngleDiff,
  V28_EXPLORE_FOV,
  V28_FOCUS_FOV,
  V28_OVERVIEW_FOV,
} from './v28CameraController';
import { AvatarCharacter } from '../LocalPlayer';
import { SalesAssistantNpc } from '../SalesAssistantNpc';
import type { Booth as LegacyBooth } from '../../types/expo';
import type { NpcAnimationClipName } from '../../services/npcPresentationService';
import {
  DRAG_YAW_SENSITIVITY,
  DRAG_PITCH_SENSITIVITY,
  TOUCH_YAW_SENSITIVITY,
  TOUCH_PITCH_SENSITIVITY,
  MIN_CAMERA_PITCH,
  MAX_CAMERA_PITCH,
} from '../cameraConstants';
import {
  resolveV28GraphicsProfile,
  V28MultiTouchGestureController,
  type FloatingJoystickVisualState,
  type V28GraphicsQualityMode,
} from './v28MobileControls';

function toV27NpcAnim(state: V28NpcAnimState): NpcAnimationClipName {
  if (state === 'greet' || state === 'farewell') return 'WAVE';
  if (state === 'point') return 'PRESENT';
  if (state === 'talk' || state === 'listen') return 'TALKING';
  return 'IDLE';
}

function toLegacyBoothAdapter(b: V28BoothPlacementView): LegacyBooth {
  return {
    id: b.boothId,
    name: b.boothName,
    companyName: b.companyName,
    tagline: b.tagline,
    description: b.description,
    category: b.category,
    color: b.color,
    logoUrl: '',
    bannerUrl: '',
    contactEmail: '',
    contactUrl: '',
    positionX: b.positionX,
    positionZ: b.positionZ,
    rotationY: b.rotationY,
    width: b.footprintWidth,
    depth: b.footprintDepth,
  };
}

export type V28CameraMode = 'overview' | 'explore' | 'focus';

export interface V28PlayerState {
  x: number;
  z: number;
  rotationY: number;
}

export interface V28RemoteAvatarView {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface DynamicExhibitionSceneProps {
  world: V28ExhibitionVersionDetail;
  cameraMode: V28CameraMode;
  focusedBooth: V28BoothPlacementView | null;
  playerTarget: { x: number; z: number } | null;
  autoWalkRequest?: { nonce: number; waypoints: RoutePoint[] } | null;
  activeTargetBoothId?: string | null;
  activeTargetZoneId?: string | null;
  teleportNonce: number;
  teleportPos: { x: number; z: number; rotationY: number; alignCamera?: boolean } | null;
  joystickVector: { x: number; y: number };
  joystickVectorRef?: React.MutableRefObject<{ x: number; y: number }>;
  zoomRequest?: { delta: number; nonce: number };
  isMobilePortrait: boolean;
  isMobileViewport?: boolean;
  graphicsQuality?: V28GraphicsQualityMode;
  boothLodMap?: Record<string, 0 | 1 | 2>;
  remoteAvatars?: V28RemoteAvatarView[];
  npcAnimState?: V28NpcAnimState;
  isNpcSpeaking?: boolean;
  npcSessionState?: NpcSessionState;
  activeNpcBoothId?: string | null;
  highlightedProduct?: HighlightedBoothProduct | null;
  guidedRoute?: GuidedRouteResult | null;
  activeNavWaypoints?: RoutePoint[] | null;
  onCameraYawChange?: (yaw: number) => void;
  playerName?: string;
  playerColor?: string;
  onPlayerMove?: (pos: V28PlayerState) => void;
  onFloorClick: (x: number, z: number) => void;
  onClickBoothIndicator?: (booth: V28BoothPlacementView) => void;
  onClickZoneIndicator?: (zoneId: string) => void;
  onAutoWalkComplete?: () => void;
  onAutoWalkCancel?: () => void;
  onFocusBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  visitedBoothIds?: ReadonlySet<string>;
  favoriteBoothIds?: ReadonlySet<string>;
  onToggleFavoriteBooth?: (booth: V28BoothPlacementView) => void;
  onClickNpc?: (booth: V28BoothPlacementView) => void;
  onboardingGuideSignal?: V28OnboardingGuideSignal | null;
  onClickWelcomeGuide?: () => void;
  onOpenDirectoryMap?: () => void;
  onFloatingJoystickVisual?: (state: FloatingJoystickVisualState) => void;
  renderRoof?: (props: { cameraMode: V28CameraMode; isMobilePortrait: boolean }) => React.ReactNode;
  renderFarProxies?: () => React.ReactNode;
}

function createZoneBannerTexture(code: string, displayName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(0, 0, 112, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, 56, 64);
  ctx.textAlign = 'left';
  ctx.font = 'bold 34px system-ui, sans-serif';
  const label = displayName.length > 20 ? `${displayName.slice(0, 19)}…` : displayName;
  ctx.fillText(label, 134, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ZoneBanner: React.FC<{ zone: V28ZoneRecord }> = React.memo(({ zone }) => {
  const tex = useMemo(() => createZoneBannerTexture(zone.code, zone.displayName), [zone.code, zone.displayName]);
  useEffect(() => () => tex.dispose(), [tex]);
  const cx = (zone.bounds.minX + zone.bounds.maxX) / 2;
  const cz = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
  return (
    <group position={[cx, 6.2, cz]}>
      <mesh>
        <planeGeometry args={[5.4, 1.35]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
});

const RemoteAvatarsLayer: React.FC<{ avatars: V28RemoteAvatarView[] }> = React.memo(({ avatars }) => {
  if (avatars.length === 0) return null;
  return (
    <group name="V28RemoteV27Visitors">
      {avatars.map((av) => (
        <AvatarCharacter
          key={av.sessionId}
          name={av.name}
          color={av.color || '#10b981'}
          position={[av.x, 0, av.z]}
          rotationY={av.rotationY}
          state="idle"
        />
      ))}
    </group>
  );
});

interface InnerSceneProps extends DynamicExhibitionSceneProps {}

const InnerDynamicScene: React.FC<InnerSceneProps> = ({
  world,
  cameraMode,
  focusedBooth,
  playerTarget,
  autoWalkRequest = null,
  activeTargetBoothId = null,
  activeTargetZoneId = null,
  teleportNonce,
  teleportPos,
  joystickVector,
  joystickVectorRef,
  zoomRequest,
  isMobilePortrait,
  isMobileViewport = false,
  graphicsQuality = 'auto',
  boothLodMap,
  remoteAvatars = [],
  npcAnimState = 'idle',
  isNpcSpeaking = false,
  npcSessionState = 'IDLE',
  activeNpcBoothId = null,
  highlightedProduct = null,
  guidedRoute = null,
  activeNavWaypoints = null,
  onCameraYawChange,
  playerName = 'Khách V28',
  playerColor = '#0ea5e9',
  onPlayerMove,
  onFloorClick,
  onClickBoothIndicator,
  onClickZoneIndicator,
  onAutoWalkComplete,
  onAutoWalkCancel,
  onFocusBooth,
  onSelectProduct,
  visitedBoothIds,
  favoriteBoothIds,
  onToggleFavoriteBooth,
  onClickNpc,
  onboardingGuideSignal = null,
  onClickWelcomeGuide,
  onOpenDirectoryMap,
  onFloatingJoystickVisual,
  renderRoof,
  renderFarProxies,
}) => {
  const { camera, gl, size } = useThree();
  const graphicsProfile = useMemo(
    () => resolveV28GraphicsProfile(graphicsQuality, isMobileViewport || isMobilePortrait),
    [graphicsQuality, isMobileViewport, isMobilePortrait]
  );
  const internalJoystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeJoystickRef = joystickVectorRef ?? internalJoystickRef;
  const onFloatingJoystickVisualRef = useRef(onFloatingJoystickVisual);
  onFloatingJoystickVisualRef.current = onFloatingJoystickVisual;
  const gestureControllerRef = useRef<V28MultiTouchGestureController | null>(null);
  const avatarRef = useRef<THREE.Group>(null);
  const playerPosRef = useRef<V28PlayerState & { state: 'idle' | 'walk' }>({
    x: world.spawnPoint.x,
    z: world.spawnPoint.z,
    rotationY: world.spawnPoint.rotationY,
    state: 'idle',
  });
  const keysRef = useRef<Record<string, boolean>>({});
  const moveTargetRef = useRef<{ x: number; z: number } | null>(null);
  const autoWalkQueueRef = useRef<RoutePoint[]>([]);
  const onAutoWalkCompleteRef = useRef(onAutoWalkComplete);
  onAutoWalkCompleteRef.current = onAutoWalkComplete;
  const onAutoWalkCancelRef = useRef(onAutoWalkCancel);
  onAutoWalkCancelRef.current = onAutoWalkCancel;
  const lastReportRef = useRef<number>(0);
  const cameraModeRef = useRef<V28CameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const camOrbitRef = useRef<{
    exploreYaw: number;
    explorePitch: number;
    overviewYaw: number;
    zoomScale: number;
    isDragging: boolean;
    lastManualOrbitAt: number;
  }>({
    exploreYaw: world.spawnPoint.rotationY,
    explorePitch: 0,
    overviewYaw: 0,
    zoomScale: 1.0,
    isDragging: false,
    lastManualOrbitAt: 0,
  });
  const smoothedExploreYawRef = useRef<number>(world.spawnPoint.rotationY);
  const smoothedExplorePitchRef = useRef<number>(0);
  const smoothedOverviewYawRef = useRef<number>(0);
  const wasExploreModeRef = useRef<boolean>(false);
  const lastFocusedBoothIdRef = useRef<string | null>(null);
  const initCamX = world.spawnPoint.x - Math.sin(world.spawnPoint.rotationY) * 6.5;
  const initCamZ = world.spawnPoint.z - Math.cos(world.spawnPoint.rotationY) * 6.5;
  const smoothedCamPosRef = useRef<THREE.Vector3>(
    cameraMode === 'explore'
      ? new THREE.Vector3(initCamX, 3.2, initCamZ)
      : new THREE.Vector3(0, 32, 48)
  );
  const smoothedLookAtRef = useRef<THREE.Vector3>(
    cameraMode === 'explore'
      ? new THREE.Vector3(world.spawnPoint.x, 1.5, world.spawnPoint.z)
      : new THREE.Vector3(0, 0, 0)
  );
  const hasInitializedCamRef = useRef<boolean>(false);
  const suppressClickUntilRef = useRef<number>(0);
  const terrazzoTex = useV27TerrazzoFloorTexture(world.hallWidth, world.hallDepth);
  const fpsAccumRef = useRef<{ frames: number; lastTime: number; fps: number; frameTimeMs: number }>({
    frames: 0,
    lastTime: performance.now(),
    fps: 60,
    frameTimeMs: 16.7,
  });

  const shouldSuppressInteractionClick = () =>
    Boolean(gestureControllerRef.current?.isJoystickActive()) ||
    Boolean(gestureControllerRef.current?.isOrbitDragging()) ||
    performance.now() < suppressClickUntilRef.current;

  // Reset active touch gestures whenever entering Focus mode so joystick never stays stuck
  useEffect(() => {
    if (cameraMode === 'focus') {
      gestureControllerRef.current?.resetAll();
    }
  }, [cameraMode]);

  // Apply HUD Zoom + / - button requests within safe camera zoomScale bounds (locked during Focus like V27.5)
  useEffect(() => {
    if (!zoomRequest || zoomRequest.nonce === 0) return;
    if (cameraModeRef.current === 'focus') return;
    camOrbitRef.current.zoomScale = THREE.MathUtils.clamp(
      camOrbitRef.current.zoomScale + zoomRequest.delta,
      0.55,
      1.75
    );
  }, [zoomRequest]);

  // Reset spawn when world version changes
  useEffect(() => {
    playerPosRef.current = {
      x: world.spawnPoint.x,
      z: world.spawnPoint.z,
      rotationY: world.spawnPoint.rotationY,
      state: 'idle',
    };
    moveTargetRef.current = null;
    if (avatarRef.current) {
      avatarRef.current.position.set(world.spawnPoint.x, 0, world.spawnPoint.z);
    }
  }, [world.versionId, world.spawnPoint.x, world.spawnPoint.z, world.spawnPoint.rotationY]);

  // Precomputed ROTATED booth AABBs & adaptive multi-region walkable areas
  const boothColliders = useMemo(
    () => world.booths.map((b) => computeRotatedBoothCollider(b, 0.35)),
    [world.booths]
  );
  const walkableRegions = useMemo(() => deriveWalkableRegions(world), [world]);

  const isWalkable = (x: number, z: number) =>
    isPointWalkable(x, z, walkableRegions, boothColliders);

  // Phase 8 Revision: If realtime zone compaction moves geometry over the avatar's current spot
  // or shrinks hallBounds around it, safely nudge avatar to nearest valid walkable point (never moves valid users).
  useEffect(() => {
    const p = playerPosRef.current;
    if (!isPointWalkable(p.x, p.z, walkableRegions, boothColliders)) {
      const safe = clampPointToWalkable(p.x, p.z, walkableRegions, boothColliders, world.spawnPoint);
      playerPosRef.current = { ...p, x: safe.x, z: safe.z, state: 'idle' };
      moveTargetRef.current = null;
      if (avatarRef.current) {
        avatarRef.current.position.set(safe.x, 0, safe.z);
      }
      onPlayerMove?.({ ...playerPosRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkableRegions, boothColliders]);

  // Apply click/tap target clamped to valid walkable space (cancels any active Auto-Walk)
  useEffect(() => {
    if (playerTarget) {
      autoWalkQueueRef.current = [];
      const safe = clampPointToWalkable(
        playerTarget.x,
        playerTarget.z,
        walkableRegions,
        boothColliders,
        playerPosRef.current
      );
      moveTargetRef.current = { x: safe.x, z: safe.z };
    }
  }, [playerTarget, walkableRegions, boothColliders]);

  // H3: Apply multi-waypoint Auto-Walk request (strictly walk-to-target along walkwayGraph, never teleport)
  useEffect(() => {
    if (!autoWalkRequest || !autoWalkRequest.waypoints || autoWalkRequest.waypoints.length === 0) {
      autoWalkQueueRef.current = [];
      return;
    }
    moveTargetRef.current = null;
    const p = playerPosRef.current;
    const cleaned = autoWalkRequest.waypoints.filter(
      (pt, idx) => idx > 0 || Math.hypot(pt.x - p.x, pt.z - p.z) > 0.55
    );
    autoWalkQueueRef.current = cleaned;
  }, [autoWalkRequest]);

  // Apply instant teleport (strictly validated & clamped into valid walkable regions)
  useEffect(() => {
    if (teleportPos) {
      const safe = clampPointToWalkable(
        teleportPos.x,
        teleportPos.z,
        walkableRegions,
        boothColliders,
        world.spawnPoint
      );
      playerPosRef.current = { x: safe.x, z: safe.z, rotationY: teleportPos.rotationY, state: 'idle' };
      moveTargetRef.current = null;
      autoWalkQueueRef.current = [];
      if (teleportPos.alignCamera) {
        camOrbitRef.current.exploreYaw = teleportPos.rotationY;
      }
      if (avatarRef.current) {
        avatarRef.current.position.set(safe.x, 0, safe.z);
        avatarRef.current.rotation.y = teleportPos.rotationY;
      }
      onPlayerMove?.({ ...playerPosRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleportNonce]);

  // Desktop WASD + Mouse Drag-to-Rotate + Mobile Floating Joystick 360° & 2nd-Finger Multi-Touch Camera Orbit
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      keysRef.current[e.code] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const canvasEl = gl.domElement;
    const prevTouchAction = canvasEl.style.touchAction;
    canvasEl.style.touchAction = 'none';

    const controller = new V28MultiTouchGestureController({
      getCameraMode: () => cameraModeRef.current,
      getViewportSize: () => ({
        width: canvasEl.clientWidth || window.innerWidth,
        height: canvasEl.clientHeight || window.innerHeight,
      }),
      onJoystickVector: (vec) => {
        activeJoystickRef.current.x = vec.x;
        activeJoystickRef.current.y = vec.y;
      },
      onJoystickVisual: (visual) => {
        onFloatingJoystickVisualRef.current?.(visual);
      },
      onCameraOrbitDelta: (dx, dy, pointerType) => {
        camOrbitRef.current.isDragging = true;
        camOrbitRef.current.lastManualOrbitAt = performance.now();
        const yawSens = pointerType === 'touch' ? TOUCH_YAW_SENSITIVITY : DRAG_YAW_SENSITIVITY;
        const pitchSens = pointerType === 'touch' ? TOUCH_PITCH_SENSITIVITY : DRAG_PITCH_SENSITIVITY;
        const safeDx = THREE.MathUtils.clamp(dx, -140, 140);
        const safeDy = THREE.MathUtils.clamp(dy, -140, 140);

        if (cameraModeRef.current === 'explore') {
          camOrbitRef.current.exploreYaw -= safeDx * yawSens;
          camOrbitRef.current.explorePitch = THREE.MathUtils.clamp(
            camOrbitRef.current.explorePitch - safeDy * pitchSens,
            MIN_CAMERA_PITCH,
            MAX_CAMERA_PITCH
          );
        } else if (cameraModeRef.current === 'overview') {
          camOrbitRef.current.overviewYaw -= safeDx * yawSens;
        }
      },
      onCameraOrbitEnd: () => {
        camOrbitRef.current.isDragging = false;
      },
      onSuppressClickUntil: (ts) => {
        suppressClickUntilRef.current = Math.max(suppressClickUntilRef.current, ts);
      },
    });
    gestureControllerRef.current = controller;

    let activeDragStart: { id: number; x: number; y: number; dragged: boolean } | null = null;
    const onPtrDown = (e: PointerEvent) => {
      activeDragStart = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false };
      const role = controller.handlePointerDown({
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (role !== 'ignored' && typeof canvasEl.setPointerCapture === 'function') {
        try {
          canvasEl.setPointerCapture(e.pointerId);
        } catch {
          // ignore pointer capture failures on synthetic/unsupported events
        }
      }
    };
    const onPtrMove = (e: PointerEvent) => {
      if (activeDragStart && activeDragStart.id === e.pointerId && !activeDragStart.dragged) {
        if (Math.hypot(e.clientX - activeDragStart.x, e.clientY - activeDragStart.y) >= 8) {
          activeDragStart.dragged = true;
          suppressClickUntilRef.current = Math.max(suppressClickUntilRef.current, performance.now() + 260);
        }
      }
      controller.handlePointerMove({
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };
    const onPtrUpOrCancel = (e: PointerEvent) => {
      if (activeDragStart && activeDragStart.id === e.pointerId) {
        if (activeDragStart.dragged || Math.hypot(e.clientX - activeDragStart.x, e.clientY - activeDragStart.y) >= 8) {
          suppressClickUntilRef.current = Math.max(suppressClickUntilRef.current, performance.now() + 260);
        }
        activeDragStart = null;
      }
      controller.handlePointerEnd(e.pointerId);
      if (typeof canvasEl.hasPointerCapture === 'function' && canvasEl.hasPointerCapture(e.pointerId)) {
        try {
          canvasEl.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    };
    const onLostCapture = (e: PointerEvent) => {
      controller.handlePointerEnd(e.pointerId);
    };
    const onBlur = () => {
      keysRef.current = {};
      controller.resetAll();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        keysRef.current = {};
        controller.resetAll();
      }
    };
    let lastIsPortrait = (canvasEl.clientHeight || window.innerHeight) >= (canvasEl.clientWidth || window.innerWidth);
    const onOrientationChange = () => {
      controller.resetAll();
      lastIsPortrait = (canvasEl.clientHeight || window.innerHeight) >= (canvasEl.clientWidth || window.innerWidth);
    };
    const onResize = () => {
      const nextIsPortrait = (canvasEl.clientHeight || window.innerHeight) >= (canvasEl.clientWidth || window.innerWidth);
      if (nextIsPortrait !== lastIsPortrait) {
        lastIsPortrait = nextIsPortrait;
        controller.resetAll();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (cameraModeRef.current === 'focus') return;
      camOrbitRef.current.zoomScale = THREE.MathUtils.clamp(
        camOrbitRef.current.zoomScale + e.deltaY * 0.0006,
        0.55,
        1.75
      );
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvasEl.addEventListener('pointerdown', onPtrDown);
    canvasEl.addEventListener('lostpointercapture', onLostCapture);
    window.addEventListener('pointermove', onPtrMove);
    window.addEventListener('pointerup', onPtrUpOrCancel);
    window.addEventListener('pointercancel', onPtrUpOrCancel);
    canvasEl.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      controller.resetAll();
      gestureControllerRef.current = null;
      canvasEl.style.touchAction = prevTouchAction;
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvasEl.removeEventListener('pointerdown', onPtrDown);
      canvasEl.removeEventListener('lostpointercapture', onLostCapture);
      window.removeEventListener('pointermove', onPtrMove);
      window.removeEventListener('pointerup', onPtrUpOrCancel);
      window.removeEventListener('pointercancel', onPtrUpOrCancel);
      canvasEl.removeEventListener('wheel', onWheel);
    };
  }, [gl.domElement, activeJoystickRef]);

  const lookTargetVec = useMemo(() => new THREE.Vector3(), []);
  const desiredCamPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(0.05, rawDelta);
    const p = playerPosRef.current;
    const speed = 11.0;

    // 1. Gather directional input (WASD + Arrows + Mobile Joystick) — disabled during Focus like V27.5
    let inputX = 0;
    let inputZ = 0;
    if (cameraMode !== 'focus') {
      const k = keysRef.current;
      if (k['KeyW'] || k['ArrowUp']) inputZ -= 1;
      if (k['KeyS'] || k['ArrowDown']) inputZ += 1;
      if (k['KeyA'] || k['ArrowLeft']) inputX -= 1;
      if (k['KeyD'] || k['ArrowRight']) inputX += 1;
      const joyX = Math.abs(activeJoystickRef.current.x) > 0.01 ? activeJoystickRef.current.x : joystickVector.x;
      const joyY = Math.abs(activeJoystickRef.current.y) > 0.01 ? activeJoystickRef.current.y : joystickVector.y;
      if (Math.abs(joyX) > 0.01 || Math.abs(joyY) > 0.01) {
        inputX += joyX;
        inputZ += joyY;
      }
    }

    // V28-AUDIT-028: Align WASD/Joystick movement to camera yaw in BOTH Explore and dragged Overview modes
    const activeMoveYaw =
      cameraMode === 'explore'
        ? smoothedExploreYawRef.current
        : Math.abs(smoothedOverviewYawRef.current) > 0.01
          ? smoothedOverviewYawRef.current
          : null;
    const moveVec = computeV28CameraRelativeMove(inputX, inputZ, activeMoveYaw);

    let moved = false;
    if (moveVec.magnitude > 0.05) {
      moveTargetRef.current = null;
      if (autoWalkQueueRef.current.length > 0) {
        autoWalkQueueRef.current = [];
        onAutoWalkCancelRef.current?.();
      }
      const nx = p.x + moveVec.moveX * speed * dt;
      const nz = p.z + moveVec.moveZ * speed * dt;
      if (isWalkable(nx, p.z)) {
        p.x = nx;
        moved = true;
      }
      if (isWalkable(p.x, nz)) {
        p.z = nz;
        moved = true;
      }
      p.rotationY = Math.atan2(moveVec.moveX, moveVec.moveZ);
    } else if (cameraMode !== 'focus' && autoWalkQueueRef.current.length > 0) {
      const stepRes = advanceAutoWalkWaypoints(p, autoWalkQueueRef.current, speed * dt, isWalkable, 0.55);
      autoWalkQueueRef.current = stepRes.remainingWaypoints;
      if (stepRes.moved) {
        p.x = stepRes.x;
        p.z = stepRes.z;
        p.rotationY = stepRes.rotationY;
        moved = true;
      }
      if (stepRes.completed) {
        autoWalkQueueRef.current = [];
        onAutoWalkCompleteRef.current?.();
      } else if (stepRes.stalled) {
        autoWalkQueueRef.current = [];
        onAutoWalkCancelRef.current?.();
      }
    } else if (cameraMode !== 'focus' && moveTargetRef.current) {
      const stepRes = stepSeamlessFreeMove(p, moveTargetRef.current, speed * dt, isWalkable);
      if (stepRes.reached || stepRes.blocked) {
        moveTargetRef.current = null;
      } else if (stepRes.moved) {
        p.x = stepRes.x;
        p.z = stepRes.z;
        if (Math.hypot(stepRes.moveX, stepRes.moveZ) > 1e-4) {
          p.rotationY = Math.atan2(stepRes.moveX, stepRes.moveZ);
        }
        moved = true;
      }
    }

    p.state = moved ? 'walk' : 'idle';
    if (avatarRef.current) {
      avatarRef.current.position.set(p.x, 0, p.z);
      avatarRef.current.rotation.y = p.rotationY;
    }

    // 2. Smooth Camera Controller (Exact V27.5 Behavioral Parity on Dynamic V28 World)
    const perspCam = camera as THREE.PerspectiveCamera;
    const { zoomScale } = camOrbitRef.current;
    let targetFov = V28_OVERVIEW_FOV;
    let camLerpSpeed = 8.0;

    if (cameraMode === 'focus' && focusedBooth) {
      wasExploreModeRef.current = false;
      const focusPose = computeV28BoothFocusCamera(
        focusedBooth,
        size.width,
        size.height,
        world.hallBounds,
        boothColliders
      );
      targetFov = focusPose.fov;
      camLerpSpeed = 8.5;

      // Glide smoothly in from the booth's own front corridor when entering Focus (zero wall/roof sweep)
      if (lastFocusedBoothIdRef.current !== focusedBooth.boothId) {
        lastFocusedBoothIdRef.current = focusedBooth.boothId;
        smoothedCamPosRef.current.copy(focusPose.entryPosition);
        smoothedLookAtRef.current.copy(focusPose.lookAtTarget);
        hasInitializedCamRef.current = true;
      }

      desiredCamPos.copy(focusPose.cameraPosition);
      lookTargetVec.copy(focusPose.lookAtTarget);
    } else {
      lastFocusedBoothIdRef.current = null;

      if (cameraMode === 'explore') {
        targetFov = V28_EXPLORE_FOV;
        camLerpSpeed = 12.0;

        if (!wasExploreModeRef.current) {
          wasExploreModeRef.current = true;
          smoothedExploreYawRef.current = p.rotationY;
          smoothedExplorePitchRef.current = 0;
          camOrbitRef.current.exploreYaw = p.rotationY;
          camOrbitRef.current.explorePitch = 0;
          const initTp = computeV28ExploreCamera(
            p.x,
            p.z,
            smoothedExploreYawRef.current,
            smoothedExplorePitchRef.current,
            zoomScale,
            world.hallBounds,
            boothColliders
          );
          smoothedCamPosRef.current.copy(initTp.cameraPosition);
          smoothedLookAtRef.current.copy(initTp.lookAtTarget);
          hasInitializedCamRef.current = true;
        } else {
          // Smoothly align yaw behind avatar during click-to-move / H3 Auto-Walk when not manually orbiting
          if (
            (moveTargetRef.current || autoWalkQueueRef.current.length > 0) &&
            moved &&
            !camOrbitRef.current.isDragging &&
            performance.now() - camOrbitRef.current.lastManualOrbitAt > 1600
          ) {
            const autoDiff = shortestAngleDiff(camOrbitRef.current.exploreYaw, p.rotationY);
            camOrbitRef.current.exploreYaw += autoDiff * (1 - Math.exp(-3.6 * dt));
          }
          const orbitAlpha = 1 - Math.exp(-18 * dt);
          smoothedExploreYawRef.current +=
            shortestAngleDiff(smoothedExploreYawRef.current, camOrbitRef.current.exploreYaw) * orbitAlpha;
          smoothedExplorePitchRef.current = THREE.MathUtils.lerp(
            smoothedExplorePitchRef.current,
            camOrbitRef.current.explorePitch,
            orbitAlpha
          );
        }

        const tp = computeV28ExploreCamera(
          p.x,
          p.z,
          smoothedExploreYawRef.current,
          smoothedExplorePitchRef.current,
          zoomScale,
          world.hallBounds,
          boothColliders
        );
        desiredCamPos.copy(tp.cameraPosition);
        lookTargetVec.copy(tp.lookAtTarget);
      } else {
        // MODE A — OVERVIEW
        wasExploreModeRef.current = false;
        targetFov = V28_OVERVIEW_FOV;
        camLerpSpeed = 7.5;

        const isoYawDiff = shortestAngleDiff(smoothedOverviewYawRef.current, camOrbitRef.current.overviewYaw);
        if (Math.abs(isoYawDiff) > 1e-4) {
          smoothedOverviewYawRef.current += isoYawDiff * (1 - Math.exp(-16 * dt));
        }

        const ob = world.cameraOverviewBounds;
        const portraitMult = isMobilePortrait ? 1.32 : 1.0;
        const dist = ob.recommendedDistance * portraitMult * 0.74 * zoomScale;
        const elev = ob.recommendedHeight * portraitMult * zoomScale;
        desiredCamPos.set(
          ob.centerX + Math.sin(smoothedOverviewYawRef.current) * dist,
          Math.max(18, elev),
          ob.centerZ + Math.cos(smoothedOverviewYawRef.current) * dist
        );
        lookTargetVec.set(ob.centerX, 0, ob.centerZ);
      }
    }

    const clampedCam = clampCameraPosition(
      desiredCamPos,
      world.hallBounds,
      cameraMode,
      world.cameraOverviewBounds.radius
    );
    desiredCamPos.set(clampedCam.x, clampedCam.y, clampedCam.z);

    if (!hasInitializedCamRef.current) {
      smoothedCamPosRef.current.copy(desiredCamPos);
      smoothedLookAtRef.current.copy(lookTargetVec);
      hasInitializedCamRef.current = true;
    } else {
      const alpha = 1 - Math.exp(-camLerpSpeed * dt);
      smoothedCamPosRef.current.lerp(desiredCamPos, alpha);
      smoothedLookAtRef.current.lerp(lookTargetVec, alpha);
    }

    if (typeof perspCam.fov === 'number' && Math.abs(perspCam.fov - targetFov) > 0.08) {
      perspCam.fov =
        cameraMode === 'focus'
          ? targetFov
          : THREE.MathUtils.lerp(perspCam.fov, targetFov, 1 - Math.exp(-8 * dt));
      perspCam.updateProjectionMatrix();
    }

    camera.position.copy(smoothedCamPosRef.current);
    camera.lookAt(smoothedLookAtRef.current);

    // 3. Throttled position callback & debug telemetry
    const now = performance.now();
    fpsAccumRef.current.frames++;
    if (now - fpsAccumRef.current.lastTime >= 500) {
      const elapsed = now - fpsAccumRef.current.lastTime;
      fpsAccumRef.current.fps = Math.round((fpsAccumRef.current.frames * 1000) / elapsed);
      fpsAccumRef.current.frameTimeMs = Math.round((elapsed / Math.max(1, fpsAccumRef.current.frames)) * 10) / 10;
      fpsAccumRef.current.frames = 0;
      fpsAccumRef.current.lastTime = now;
    }

    if (now - lastReportRef.current > 160) {
      lastReportRef.current = now;
      if (moved) {
        onPlayerMove?.({ ...p });
      }
      if (onCameraYawChange) {
        const activeYaw =
          cameraMode === 'explore' ? smoothedExploreYawRef.current : smoothedOverviewYawRef.current;
        onCameraYawChange(activeYaw);
      }
    }

    // Read-only telemetry for QA & Phase 3/4/6 profiling
    const lodCounts = { near: 0, mid: 0, far: 0 };
    if (boothLodMap) {
      for (const b of world.booths) {
        const tier = boothLodMap[b.boothId] ?? 0;
        if (tier === 0) lodCounts.near++;
        else if (tier === 1) lodCounts.mid++;
        else lodCounts.far++;
      }
    } else {
      lodCounts.near = world.booths.length;
    }

    const perfMem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const jsHeapMB = perfMem ? Math.round((perfMem.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : null;

    (window as unknown as Record<string, unknown>).__V28_DEBUG__ = {
      versionId: world.versionId,
      boothCount: world.booths.length,
      zoneCount: world.zones.length,
      clusterCount: world.clusters?.length ?? 0,
      cameraMode,
      roofCutawayActive: cameraMode === 'overview',
      fps: fpsAccumRef.current.fps,
      frameTimeMs: fpsAccumRef.current.frameTimeMs,
      jsHeapMB,
      graphicsQuality: graphicsProfile.mode,
      graphicsTier: graphicsProfile.resolvedTier,
      dpr: gl.getPixelRatio(),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      textureCache: getTextureCacheStats(),
      lodCounts,
      walkableRegionCount: walkableRegions.length,
      player: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 },
      autoWalkActive: autoWalkQueueRef.current.length > 0,
      autoWalkRemainingWaypoints: autoWalkQueueRef.current.length,
      cameraPos: {
        x: Math.round(camera.position.x * 10) / 10,
        y: Math.round(camera.position.y * 10) / 10,
        z: Math.round(camera.position.z * 10) / 10,
      },
      remoteAvatarCount: remoteAvatars.length,
    };
  });

  return (
    <>
      {/* Bright Architectural Exhibition Lighting matched to V27.5 */}
      <color attach="background" args={['#eef2f7']} />
      <fog attach="fog" args={['#eef2f7', Math.max(110, world.hallDepth * 0.95), Math.max(240, world.hallDepth * 2.4)]} />
      <ambientLight intensity={0.82} color="#ffffff" />
      <hemisphereLight args={['#f0f6ff', '#d8dee8', 0.72]} />
      <directionalLight
        position={[world.hallWidth * 0.35, 48, world.hallDepth * 0.3]}
        intensity={1.18}
        color="#fffbf0"
        castShadow={graphicsProfile.shadows}
        shadow-mapSize-width={graphicsProfile.shadowMapSize}
        shadow-mapSize-height={graphicsProfile.shadowMapSize}
      />

      {/* Dynamic Hall Floor with V27.5 Satin Architectural Terrazzo Texture */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (shouldSuppressInteractionClick()) return;
          e.stopPropagation();
          if (cameraMode === 'focus') {
            onFloorClick(e.point.x, e.point.z);
            return;
          }
          const safe = clampPointToWalkable(
            e.point.x,
            e.point.z,
            walkableRegions,
            boothColliders,
            playerPosRef.current
          );
          onFloorClick(safe.x, safe.z);
        }}
      >
        <planeGeometry args={[world.hallWidth, world.hallDepth]} />
        <meshStandardMaterial map={terrazzoTex} roughness={0.62} metalness={0.08} />
      </mesh>

      {/* Architectural Perimeter Floor Apron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[world.hallWidth + 50, world.hallDepth + 50]} />
        <meshStandardMaterial color="#cfd7e3" roughness={0.88} />
      </mesh>

      {/* V27.5 Visual Heritage Layer: Central Avenue, Champagne Inlays, Welcome Plaza, Check-In Stage & Streamed Cluster Courtyards */}
      <V27VisualKitLayer
        world={world}
        playerX={playerPosRef.current.x}
        playerZ={playerPosRef.current.z}
        isOverview={cameraMode === 'overview'}
        onOpenDirectoryMap={onOpenDirectoryMap}
      />

      {/* Phase 6: Youth-Themed 3D Entrance Arch (Positioned from live welcomeAreaBounds & centralAvenueBounds; zero layout mutation) */}
      <YouthEntranceArch3D
        world={world}
        leftLogoUrl="/logos/doan-tncs-hcm.png"
        rightLogoUrl="/logos/hoi-lhtn-vn.png"
      />

      {/* Zone Overhead Banners */}
      {world.zones.map((z) => (
        <ZoneBanner key={z.id} zone={z} />
      ))}

      {/* Dynamic Booths (6 V27.4 GLB Archetypes reused via shared cache; V28-AUDIT-026: omit unused npcAnimState to preserve React.memo) */}
      {world.booths.map((booth) => {
        const isBoothHighlighted = highlightedProduct?.boothId === booth.boothId;
        return (
          <DynamicBooth3D
            key={booth.boothId}
            booth={booth}
            lodTier={boothLodMap ? (boothLodMap[booth.boothId] ?? 0) : 0}
            isFocused={focusedBooth?.boothId === booth.boothId}
            isVisited={Boolean(visitedBoothIds?.has(booth.boothId))}
            isFavorite={Boolean(favoriteBoothIds?.has(booth.boothId))}
            highlightedSlotId={isBoothHighlighted ? highlightedProduct?.slotId : null}
            highlightedProductId={isBoothHighlighted ? highlightedProduct?.productId : null}
            onFocusBooth={(b) => {
              if (shouldSuppressInteractionClick()) return;
              onFocusBooth(b);
            }}
            onSelectProduct={(b, prod, sId) => {
              if (shouldSuppressInteractionClick()) return;
              onSelectProduct(b, prod, sId);
            }}
            onToggleFavorite={
              onToggleFavoriteBooth
                ? (b) => {
                    if (shouldSuppressInteractionClick()) return;
                    onToggleFavoriteBooth(b);
                  }
                : undefined
            }
          />
        );
      })}

      {/* Authentic V27.5 Sales Assistant NPCs (Mounted in booth-local space ONLY for Ring 0 Near Booths — 100% V27.5 model, rig & animations!) */}
      {world.booths
        .filter((b) => (boothLodMap ? (boothLodMap[b.boothId] ?? 0) === 0 : true))
        .map((booth) => {
          const isThisNpcActiveBooth = activeNpcBoothId === booth.boothId;
          const isThisNpcSpeaking = isThisNpcActiveBooth && (npcSessionState === 'SPEAKING' || npcSessionState === 'LOADING' || Boolean(isNpcSpeaking));
          const npcStatusLabel = (() => {
            if (!isThisNpcActiveBooth) return '🎙 Nghe tư vấn';
            if (npcSessionState === 'LOADING') return '⏳ Đang chuẩn bị...';
            if (npcSessionState === 'SPEAKING') return '🔊 Đang tư vấn · Tạm dừng';
            if (npcSessionState === 'PAUSED') return '⏸ Bấm để tiếp tục';
            if (npcSessionState === 'COMPLETED') return '🔄 Nghe lại tư vấn';
            if (npcSessionState === 'ERROR') return '🎙 Thử nghe lại';
            return '🎙 Nghe tư vấn';
          })();
          const lookTargetLocalX =
            isThisNpcSpeaking && highlightedProduct?.boothId === booth.boothId
              ? getV28BoothSlotSpec(booth.archetypeId, highlightedProduct.slotId).position[0]
              : null;

          return (
            <group
              key={`v27-npc-${booth.boothId}`}
              position={[booth.positionX, 0, booth.positionZ]}
              rotation={[0, booth.rotationY, 0]}
            >
              <SalesAssistantNpc
                booth={toLegacyBoothAdapter(booth)}
                isActiveSession={isThisNpcSpeaking}
                activeAnimation={isThisNpcSpeaking ? toV27NpcAnim(npcAnimState) : 'IDLE'}
                actionLabel="🎙 Nghe tư vấn"
                statusLabel={npcStatusLabel}
                lookTargetLocalX={lookTargetLocalX}
                onActivate={() => {
                  if (shouldSuppressInteractionClick()) return;
                  onClickNpc?.(booth);
                }}
              />
            </group>
          );
        })}

      {/* Phase 2.3 & H3: Intelligent 3D Walkway Guided Path & Arrival Beacon (supports Booth & Zone Auto-Walk) */}
      <NavigationPath3D
        route={
          activeNavWaypoints && activeNavWaypoints.length >= 2
            ? { waypoints: activeNavWaypoints }
            : guidedRoute
        }
      />

      {/* UAT Fix 01 & H3: Clickable Character-Anchored 3D World-Space Navigation Indicators */}
      <CharacterNavigationRing3D
        world={world}
        liveTransform={() => playerPosRef.current}
        visible={cameraMode !== 'focus'}
        guidedRoute={guidedRoute}
        activeTargetBoothId={activeTargetBoothId}
        activeTargetZoneId={activeTargetZoneId}
        shouldSuppressClick={shouldSuppressInteractionClick}
        onClickBoothIndicator={onClickBoothIndicator}
        onClickZoneIndicator={onClickZoneIndicator}
      />

      {/* Optional Phase 3 Far Instanced Proxies & Parametric Roof */}
      {renderFarProxies?.()}
      {renderRoof?.({ cameraMode, isMobilePortrait })}

      {/* Authentic V27.5 Stylized Visitor Avatar (full character + walk cycle + overhead nametag!) */}
      <AvatarCharacter
        name={playerName}
        color={playerColor}
        isSelf
        liveTransform={() => playerPosRef.current}
        activeBoothName={focusedBooth?.boothName ?? null}
      />

      {/* Remote Visitors (Authentic V27.5 VisitorAvatar via Phase 4 Spatial AOI) */}
      <RemoteAvatarsLayer avatars={remoteAvatars} />
    </>
  );
};

export const DynamicExhibitionScene: React.FC<DynamicExhibitionSceneProps> = (props) => {
  const graphicsProfile = useMemo(
    () =>
      resolveV28GraphicsProfile(
        props.graphicsQuality ?? 'auto',
        Boolean(props.isMobileViewport || props.isMobilePortrait)
      ),
    [props.graphicsQuality, props.isMobileViewport, props.isMobilePortrait]
  );
  const spawnCamX = props.world.spawnPoint.x - Math.sin(props.world.spawnPoint.rotationY) * 6.5;
  const spawnCamZ = props.world.spawnPoint.z - Math.cos(props.world.spawnPoint.rotationY) * 6.5;
  const initialCamPos: [number, number, number] =
    props.cameraMode === 'explore' ? [spawnCamX, 3.2, spawnCamZ] : [0, 32, 48];
  return (
    <Canvas
      shadows={graphicsProfile.shadows}
      dpr={graphicsProfile.dpr}
      camera={{ fov: 48, near: 0.3, far: Math.max(450, props.world.hallDepth * 3.0), position: initialCamPos }}
      gl={{ antialias: graphicsProfile.antialias, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const onLost = (ev: Event) => {
          ev.preventDefault();
        };
        const onRestored = () => {
          gl.resetState();
        };
        canvas.addEventListener('webglcontextlost', onLost, false);
        canvas.addEventListener('webglcontextrestored', onRestored, false);
      }}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    >
      <InnerDynamicScene {...props} />
    </Canvas>
  );
};
