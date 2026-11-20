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
import type { V28NpcAnimState } from './DynamicBoothNpc3D';
import { getTextureCacheStats } from './v28BoothAssets';
import { V27VisualKitLayer, useV27TerrazzoFloorTexture } from './V27VisualKit';
import {
  clampCameraPosition,
  clampPointToWalkable,
  computeRotatedBoothCollider,
  deriveWalkableRegions,
  isPointWalkable,
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
  CAMERA_DRAG_THRESHOLD_PX,
  MIN_CAMERA_PITCH,
  MAX_CAMERA_PITCH,
} from '../ExhibitionScene';

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
  teleportNonce: number;
  teleportPos: { x: number; z: number; rotationY: number } | null;
  joystickVector: { x: number; y: number };
  zoomRequest?: { delta: number; nonce: number };
  isMobilePortrait: boolean;
  boothLodMap?: Record<string, 0 | 1 | 2>;
  remoteAvatars?: V28RemoteAvatarView[];
  npcAnimState?: V28NpcAnimState;
  playerName?: string;
  playerColor?: string;
  onPlayerMove?: (pos: V28PlayerState) => void;
  onFloorClick: (x: number, z: number) => void;
  onFocusBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  onClickNpc?: (booth: V28BoothPlacementView) => void;
  onOpenDirectoryMap?: () => void;
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
  teleportNonce,
  teleportPos,
  joystickVector,
  zoomRequest,
  isMobilePortrait,
  boothLodMap,
  remoteAvatars = [],
  npcAnimState = 'idle',
  playerName = 'Khách V28',
  playerColor = '#0ea5e9',
  onPlayerMove,
  onFloorClick,
  onFocusBooth,
  onSelectProduct,
  onClickNpc,
  onOpenDirectoryMap,
  renderRoof,
  renderFarProxies,
}) => {
  const { camera, gl, size } = useThree();
  const avatarRef = useRef<THREE.Group>(null);
  const playerPosRef = useRef<V28PlayerState & { state: 'idle' | 'walk' }>({
    x: world.spawnPoint.x,
    z: world.spawnPoint.z,
    rotationY: world.spawnPoint.rotationY,
    state: 'idle',
  });
  const keysRef = useRef<Record<string, boolean>>({});
  const moveTargetRef = useRef<{ x: number; z: number } | null>(null);
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
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragged: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragged: false,
  });
  const suppressClickUntilRef = useRef<number>(0);
  const terrazzoTex = useV27TerrazzoFloorTexture(world.hallWidth, world.hallDepth);
  const fpsAccumRef = useRef<{ frames: number; lastTime: number; fps: number }>({
    frames: 0,
    lastTime: performance.now(),
    fps: 60,
  });

  const shouldSuppressInteractionClick = () =>
    dragStateRef.current.dragged || performance.now() < suppressClickUntilRef.current;

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

  // Apply click/tap target ONLY when inside valid walkable regions
  useEffect(() => {
    if (playerTarget) {
      if (isPointWalkable(playerTarget.x, playerTarget.z, walkableRegions, boothColliders)) {
        moveTargetRef.current = { ...playerTarget };
      } else {
        moveTargetRef.current = null;
      }
    }
  }, [playerTarget, walkableRegions, boothColliders]);

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
      if (avatarRef.current) {
        avatarRef.current.position.set(safe.x, 0, safe.z);
        avatarRef.current.rotation.y = teleportPos.rotationY;
      }
      onPlayerMove?.({ ...playerPosRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleportNonce]);

  // Desktop WASD (using e.code so Vietnamese Telex IME NEVER breaks W->ư, V28-AUDIT-027) + V27.5-parity Drag-to-Rotate & Wheel Zoom
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      keysRef.current[e.code] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    const canvasEl = gl.domElement;
    const finishDrag = () => {
      if (dragStateRef.current.dragged) {
        suppressClickUntilRef.current = performance.now() + 240;
      }
      dragStateRef.current.active = false;
      dragStateRef.current.pointerId = -1;
      dragStateRef.current.dragged = false;
      camOrbitRef.current.isDragging = false;
    };
    const onPtrDown = (e: PointerEvent) => {
      if (cameraModeRef.current === 'focus') return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragStateRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dragged: false,
      };
    };
    const onPtrMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (cameraModeRef.current === 'focus' || !ds.active || ds.pointerId !== e.pointerId) return;
      const dx = e.clientX - ds.lastX;
      const dy = e.clientY - ds.lastY;
      const totalDisp = Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY);
      const threshold = e.pointerType === 'touch' ? 8 : CAMERA_DRAG_THRESHOLD_PX;
      if (!ds.dragged && totalDisp <= threshold) return;
      ds.dragged = true;
      ds.lastX = e.clientX;
      ds.lastY = e.clientY;
      camOrbitRef.current.isDragging = true;
      camOrbitRef.current.lastManualOrbitAt = performance.now();

      const yawSens = e.pointerType === 'touch' ? TOUCH_YAW_SENSITIVITY : DRAG_YAW_SENSITIVITY;
      const pitchSens = e.pointerType === 'touch' ? TOUCH_PITCH_SENSITIVITY : DRAG_PITCH_SENSITIVITY;
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
    };
    const onPtrUpOrCancel = (e: PointerEvent) => {
      if (dragStateRef.current.active && dragStateRef.current.pointerId === e.pointerId) {
        finishDrag();
      }
    };
    const onBlur = () => {
      keysRef.current = {};
      if (dragStateRef.current.active) finishDrag();
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
    canvasEl.addEventListener('pointerdown', onPtrDown);
    window.addEventListener('pointermove', onPtrMove);
    window.addEventListener('pointerup', onPtrUpOrCancel);
    window.addEventListener('pointercancel', onPtrUpOrCancel);
    canvasEl.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      canvasEl.removeEventListener('pointerdown', onPtrDown);
      window.removeEventListener('pointermove', onPtrMove);
      window.removeEventListener('pointerup', onPtrUpOrCancel);
      window.removeEventListener('pointercancel', onPtrUpOrCancel);
      canvasEl.removeEventListener('wheel', onWheel);
    };
  }, [gl.domElement]);

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
      if (Math.abs(joystickVector.x) > 0.08 || Math.abs(joystickVector.y) > 0.08) {
        inputX += joystickVector.x;
        inputZ += joystickVector.y;
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
    } else if (cameraMode !== 'focus' && moveTargetRef.current) {
      const tx = moveTargetRef.current.x - p.x;
      const tz = moveTargetRef.current.z - p.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.35) {
        moveTargetRef.current = null;
      } else {
        const step = Math.min(dist, speed * dt);
        const nx = p.x + (tx / dist) * step;
        const nz = p.z + (tz / dist) * step;
        if (isWalkable(nx, nz)) {
          p.x = nx;
          p.z = nz;
          p.rotationY = Math.atan2(tx, tz);
          moved = true;
        } else {
          moveTargetRef.current = null;
        }
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
      targetFov = V28_FOCUS_FOV;
      camLerpSpeed = 8.5;

      const focusPose = computeV28BoothFocusCamera(
        focusedBooth,
        size.width,
        size.height,
        world.hallBounds,
        boothColliders
      );

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
          // Smoothly align yaw behind avatar during click-to-move auto-walk when not manually orbiting
          if (
            moveTargetRef.current &&
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
      fpsAccumRef.current.fps = Math.round(
        (fpsAccumRef.current.frames * 1000) / (now - fpsAccumRef.current.lastTime)
      );
      fpsAccumRef.current.frames = 0;
      fpsAccumRef.current.lastTime = now;
    }

    if (moved && now - lastReportRef.current > 120) {
      lastReportRef.current = now;
      onPlayerMove?.({ ...p });
    }

    // Read-only telemetry for QA & Phase 3/4 profiling
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

    (window as unknown as Record<string, unknown>).__V28_DEBUG__ = {
      versionId: world.versionId,
      boothCount: world.booths.length,
      zoneCount: world.zones.length,
      clusterCount: world.clusters?.length ?? 0,
      cameraMode,
      roofCutawayActive: cameraMode === 'overview',
      fps: fpsAccumRef.current.fps,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      textureCache: getTextureCacheStats(),
      lodCounts,
      walkableRegionCount: walkableRegions.length,
      player: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 },
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
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Dynamic Hall Floor with V27.5 Satin Architectural Terrazzo Texture */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (shouldSuppressInteractionClick()) return;
          e.stopPropagation();
          if (cameraMode !== 'focus' && !isWalkable(e.point.x, e.point.z)) return;
          onFloorClick(e.point.x, e.point.z);
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

      {/* Zone Overhead Banners */}
      {world.zones.map((z) => (
        <ZoneBanner key={z.id} zone={z} />
      ))}

      {/* Dynamic Booths (6 V27.4 GLB Archetypes reused via shared cache; V28-AUDIT-026: omit unused npcAnimState to preserve React.memo) */}
      {world.booths.map((booth) => (
        <DynamicBooth3D
          key={booth.boothId}
          booth={booth}
          lodTier={boothLodMap ? (boothLodMap[booth.boothId] ?? 0) : 0}
          isFocused={focusedBooth?.boothId === booth.boothId}
          onFocusBooth={(b) => {
            if (shouldSuppressInteractionClick()) return;
            onFocusBooth(b);
          }}
          onSelectProduct={(b, prod, sId) => {
            if (shouldSuppressInteractionClick()) return;
            onSelectProduct(b, prod, sId);
          }}
        />
      ))}

      {/* Authentic V27.5 Sales Assistant NPCs (Mounted in booth-local space ONLY for Ring 0 Near Booths — 100% V27.5 model, rig & animations!) */}
      {world.booths
        .filter((b) => (boothLodMap ? (boothLodMap[b.boothId] ?? 0) === 0 : true))
        .map((booth) => (
          <group
            key={`v27-npc-${booth.boothId}`}
            position={[booth.positionX, 0, booth.positionZ]}
            rotation={[0, booth.rotationY, 0]}
          >
            <SalesAssistantNpc
              booth={toLegacyBoothAdapter(booth)}
              isActiveSession={focusedBooth?.boothId === booth.boothId}
              activeAnimation={focusedBooth?.boothId === booth.boothId ? toV27NpcAnim(npcAnimState) : 'IDLE'}
              onActivate={() => {
                if (shouldSuppressInteractionClick()) return;
                onClickNpc?.(booth);
              }}
            />
          </group>
        ))}

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
  const spawnCamX = props.world.spawnPoint.x - Math.sin(props.world.spawnPoint.rotationY) * 6.5;
  const spawnCamZ = props.world.spawnPoint.z - Math.cos(props.world.spawnPoint.rotationY) * 6.5;
  const initialCamPos: [number, number, number] =
    props.cameraMode === 'explore' ? [spawnCamX, 3.2, spawnCamZ] : [0, 32, 48];
  return (
    <Canvas
      shadows
      dpr={props.isMobilePortrait ? [1, 1.5] : [1, 2]}
      camera={{ fov: 48, near: 0.3, far: Math.max(450, props.world.hallDepth * 3.0), position: initialCamPos }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
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
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <InnerDynamicScene {...props} />
    </Canvas>
  );
};
