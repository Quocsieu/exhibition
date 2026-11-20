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
  DRAG_YAW_SENSITIVITY,
  DRAG_PITCH_SENSITIVITY,
  TOUCH_YAW_SENSITIVITY,
  TOUCH_PITCH_SENSITIVITY,
  CAMERA_DRAG_THRESHOLD_PX,
  MIN_CAMERA_PITCH,
  MAX_CAMERA_PITCH,
} from '../ExhibitionScene';

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
  isMobilePortrait: boolean;
  boothLodMap?: Record<string, 0 | 1 | 2>;
  remoteAvatars?: V28RemoteAvatarView[];
  npcAnimState?: V28NpcAnimState;
  onPlayerMove?: (pos: V28PlayerState) => void;
  onFloorClick: (x: number, z: number) => void;
  onFocusBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  onClickNpc?: (booth: V28BoothPlacementView) => void;
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
    <group>
      {avatars.map((av) => (
        <group key={av.sessionId} position={[av.x, 0, av.z]} rotation={[0, av.rotationY, 0]}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <capsuleGeometry args={[0.26, 0.85, 6, 12]} />
            <meshStandardMaterial color={av.color || '#10b981'} roughness={0.45} />
          </mesh>
          <mesh position={[0, 1.56, 0]} castShadow>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
        </group>
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
  isMobilePortrait,
  boothLodMap,
  remoteAvatars = [],
  npcAnimState = 'idle',
  onPlayerMove,
  onFloorClick,
  onFocusBooth,
  onSelectProduct,
  onClickNpc,
  renderRoof,
  renderFarProxies,
}) => {
  const { camera, gl } = useThree();
  const avatarRef = useRef<THREE.Group>(null);
  const playerPosRef = useRef<V28PlayerState>({
    x: world.spawnPoint.x,
    z: world.spawnPoint.z,
    rotationY: world.spawnPoint.rotationY,
  });
  const keysRef = useRef<Record<string, boolean>>({});
  const moveTargetRef = useRef<{ x: number; z: number } | null>(null);
  const lastReportRef = useRef<number>(0);
  const camOrbitRef = useRef<{ yawOffset: number; pitchOffset: number; zoomScale: number }>({
    yawOffset: 0,
    pitchOffset: 0,
    zoomScale: 1.0,
  });
  const dragStateRef = useRef<{ active: boolean; pointerId: number; lastX: number; lastY: number; dragged: boolean }>({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    dragged: false,
  });
  const terrazzoTex = useV27TerrazzoFloorTexture(world.hallWidth, world.hallDepth);
  const fpsAccumRef = useRef<{ frames: number; lastTime: number; fps: number }>({
    frames: 0,
    lastTime: performance.now(),
    fps: 60,
  });

  // Reset spawn when world version changes
  useEffect(() => {
    playerPosRef.current = {
      x: world.spawnPoint.x,
      z: world.spawnPoint.z,
      rotationY: world.spawnPoint.rotationY,
    };
    moveTargetRef.current = null;
    if (avatarRef.current) {
      avatarRef.current.position.set(world.spawnPoint.x, 0, world.spawnPoint.z);
    }
  }, [world.versionId, world.spawnPoint.x, world.spawnPoint.z, world.spawnPoint.rotationY]);

  // Apply click/tap target
  useEffect(() => {
    if (playerTarget) {
      moveTargetRef.current = { ...playerTarget };
    }
  }, [playerTarget]);

  // Apply instant teleport
  useEffect(() => {
    if (teleportPos) {
      playerPosRef.current = { ...teleportPos };
      moveTargetRef.current = null;
      if (avatarRef.current) {
        avatarRef.current.position.set(teleportPos.x, 0, teleportPos.z);
        avatarRef.current.rotation.y = teleportPos.rotationY;
      }
      onPlayerMove?.({ ...playerPosRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleportNonce]);

  // Desktop WASD + V27.5 Drag-to-Rotate & Wheel Zoom listeners
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    const canvasEl = gl.domElement;
    const onPtrDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragStateRef.current = { active: true, pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, dragged: false };
    };
    const onPtrMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds.active || ds.pointerId !== e.pointerId) return;
      const dx = e.clientX - ds.lastX;
      const dy = e.clientY - ds.lastY;
      if (!ds.dragged && Math.hypot(dx, dy) < CAMERA_DRAG_THRESHOLD_PX) return;
      ds.dragged = true;
      ds.lastX = e.clientX;
      ds.lastY = e.clientY;
      const yawSens = e.pointerType === 'touch' ? TOUCH_YAW_SENSITIVITY : DRAG_YAW_SENSITIVITY;
      const pitchSens = e.pointerType === 'touch' ? TOUCH_PITCH_SENSITIVITY : DRAG_PITCH_SENSITIVITY;
      camOrbitRef.current.yawOffset -= THREE.MathUtils.clamp(dx, -120, 120) * yawSens;
      camOrbitRef.current.pitchOffset = THREE.MathUtils.clamp(
        camOrbitRef.current.pitchOffset + THREE.MathUtils.clamp(dy, -120, 120) * pitchSens,
        MIN_CAMERA_PITCH,
        MAX_CAMERA_PITCH
      );
    };
    const onPtrUp = (e: PointerEvent) => {
      if (dragStateRef.current.pointerId === e.pointerId) {
        dragStateRef.current.active = false;
      }
    };
    const onWheel = (e: WheelEvent) => {
      camOrbitRef.current.zoomScale = THREE.MathUtils.clamp(
        camOrbitRef.current.zoomScale + e.deltaY * 0.0006,
        0.55,
        1.75
      );
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    canvasEl.addEventListener('pointerdown', onPtrDown);
    window.addEventListener('pointermove', onPtrMove);
    window.addEventListener('pointerup', onPtrUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      canvasEl.removeEventListener('pointerdown', onPtrDown);
      window.removeEventListener('pointermove', onPtrMove);
      window.removeEventListener('pointerup', onPtrUp);
      canvasEl.removeEventListener('wheel', onWheel);
    };
  }, [gl.domElement]);

  // Precomputed booth AABBs for fast client-side walk collision
  const boothColliders = useMemo(
    () =>
      world.booths.map((b) => ({
        minX: b.positionX - b.footprintWidth / 2 - 0.35,
        maxX: b.positionX + b.footprintWidth / 2 + 0.35,
        minZ: b.positionZ - b.footprintDepth / 2 - 0.35,
        maxZ: b.positionZ + b.footprintDepth / 2 + 0.35,
      })),
    [world.booths]
  );

  const isWalkable = (x: number, z: number) => {
    if (
      x < world.walkableBounds.minX ||
      x > world.walkableBounds.maxX ||
      z < world.walkableBounds.minZ ||
      z > world.walkableBounds.maxZ
    ) {
      return false;
    }
    for (const c of boothColliders) {
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return false;
    }
    return true;
  };

  const lookTargetVec = useMemo(() => new THREE.Vector3(), []);
  const desiredCamPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(0.05, rawDelta);
    const p = playerPosRef.current;
    const speed = 11.0;

    // 1. Gather directional input (WASD + Mobile Joystick)
    let dx = 0;
    let dz = 0;
    const k = keysRef.current;
    if (k['w'] || k['arrowup']) dz -= 1;
    if (k['s'] || k['arrowdown']) dz += 1;
    if (k['a'] || k['arrowleft']) dx -= 1;
    if (k['d'] || k['arrowright']) dx += 1;
    if (Math.abs(joystickVector.x) > 0.08 || Math.abs(joystickVector.y) > 0.08) {
      dx += joystickVector.x;
      dz += joystickVector.y;
    }

    let moved = false;
    if (Math.hypot(dx, dz) > 0.05) {
      moveTargetRef.current = null;
      const len = Math.hypot(dx, dz);
      const nx = p.x + (dx / len) * speed * dt;
      const nz = p.z + (dz / len) * speed * dt;
      if (isWalkable(nx, p.z)) {
        p.x = nx;
        moved = true;
      }
      if (isWalkable(p.x, nz)) {
        p.z = nz;
        moved = true;
      }
      p.rotationY = Math.atan2(dx, dz);
    } else if (moveTargetRef.current) {
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

    if (avatarRef.current) {
      avatarRef.current.position.set(p.x, 0, p.z);
      avatarRef.current.rotation.y = p.rotationY;
    }

    // 2. Smooth Camera Controller (V27.5 Heritage Overview / Explore + Drag-Rotate & Zoom / Dynamic Focus)
    const { yawOffset, pitchOffset, zoomScale } = camOrbitRef.current;
    if (cameraMode === 'overview') {
      const ob = world.cameraOverviewBounds;
      const portraitMult = isMobilePortrait ? 1.32 : 1.0;
      const dist = ob.recommendedDistance * portraitMult * 0.74 * zoomScale;
      const elev = ob.recommendedHeight * portraitMult * zoomScale * (1 + pitchOffset * 0.45);
      desiredCamPos.set(
        ob.centerX + Math.sin(yawOffset) * dist,
        Math.max(18, elev),
        ob.centerZ + Math.cos(yawOffset) * dist
      );
      lookTargetVec.set(ob.centerX, 0, ob.centerZ);
    } else if (cameraMode === 'focus' && focusedBooth) {
      const liftY = isMobilePortrait ? 4.6 : 3.0;
      const extraDist = isMobilePortrait ? 2.4 : 0;
      const fx = Math.sin(focusedBooth.rotationY);
      const fz = Math.cos(focusedBooth.rotationY);
      desiredCamPos.set(
        focusedBooth.focusCameraPoint.x + fx * extraDist,
        liftY,
        focusedBooth.focusCameraPoint.z + fz * extraDist
      );
      lookTargetVec.set(focusedBooth.positionX, isMobilePortrait ? 1.8 : 1.5, focusedBooth.positionZ);
    } else {
      // Explore follow camera with V27.5 drag-to-rotate yaw/pitch & zoom
      const baseDist = (isMobilePortrait ? 12.2 : 9.8) * zoomScale;
      const baseY = (isMobilePortrait ? 10.5 : 8.2) * zoomScale + pitchOffset * 5.0;
      desiredCamPos.set(
        p.x + Math.sin(yawOffset) * baseDist,
        Math.max(3.2, baseY),
        p.z + Math.cos(yawOffset) * baseDist
      );
      lookTargetVec.set(p.x, 1.5, p.z - 2.0);
    }

    camera.position.lerp(desiredCamPos, Math.min(1, dt * 6.5));
    camera.lookAt(lookTargetVec);

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
      player: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 },
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
          if (dragStateRef.current.dragged) return;
          e.stopPropagation();
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
      />

      {/* Zone Overhead Banners */}
      {world.zones.map((z) => (
        <ZoneBanner key={z.id} zone={z} />
      ))}

      {/* Dynamic Booths (6 V27.4 GLB Archetypes reused via shared cache) */}
      {world.booths.map((booth) => (
        <DynamicBooth3D
          key={booth.boothId}
          booth={booth}
          lodTier={boothLodMap ? (boothLodMap[booth.boothId] ?? 0) : 0}
          isFocused={focusedBooth?.boothId === booth.boothId}
          npcAnimState={npcAnimState}
          onFocusBooth={onFocusBooth}
          onSelectProduct={onSelectProduct}
          onClickNpc={onClickNpc}
        />
      ))}

      {/* Optional Phase 3 Far Instanced Proxies & Parametric Roof */}
      {renderFarProxies?.()}
      {renderRoof?.({ cameraMode, isMobilePortrait })}

      {/* Local Visitor Avatar */}
      <group ref={avatarRef} position={[world.spawnPoint.x, 0, world.spawnPoint.z]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <capsuleGeometry args={[0.28, 0.9, 6, 12]} />
          <meshStandardMaterial color="#0284c7" roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <sphereGeometry args={[0.22, 14, 14]} />
          <meshStandardMaterial color="#fde68a" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.5, 20]} />
          <meshBasicMaterial color="#0284c7" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* Remote Visitors (Phase 4 Spatial AOI) */}
      <RemoteAvatarsLayer avatars={remoteAvatars} />
    </>
  );
};

export const DynamicExhibitionScene: React.FC<DynamicExhibitionSceneProps> = (props) => {
  return (
    <Canvas
      shadows
      dpr={props.isMobilePortrait ? [1, 1.5] : [1, 2]}
      camera={{ fov: 48, near: 0.3, far: 450, position: [0, 32, 48] }}
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
