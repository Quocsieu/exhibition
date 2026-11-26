import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { V28BoothPlacementView, V28ExhibitionVersionDetail } from '../../services/v28Api';
import {
  computeWorldAnchoredIndicators,
  type GuidedRouteResult,
  type WorldAnchoredBoothIndicator,
  type WorldAnchoredZoneIndicator,
} from '../../services/v28NavigationEngine';

// Non-blocking raycast stub for decorative ring/arrows (interactive labels allow raycast in H3)
const NO_RAYCAST = () => null;
const LABEL_CLICK_MAX_DRAG_PX = 6;
const LABEL_TAP_DEBOUNCE_MS = 280;

// Shared lightweight geometries & materials (zero per-frame allocations)
const COMPASS_RING_GEOM = new THREE.RingGeometry(1.42, 1.50, 48);
const COMPASS_RING_MAT = new THREE.MeshBasicMaterial({
  color: '#38bdf8',
  transparent: true,
  opacity: 0.42,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Sleek modern 3D directional arrow pointing along +Z
const ARROW_HEAD_GEOM = new THREE.ConeGeometry(0.19, 0.46, 4);
ARROW_HEAD_GEOM.rotateX(Math.PI / 2);
ARROW_HEAD_GEOM.scale(1.0, 0.35, 1.0);

const ARROW_SHAFT_GEOM = new THREE.BoxGeometry(0.10, 0.04, 0.28);

const BOOTH_ARROW_MAT = new THREE.MeshBasicMaterial({
  color: '#0ea5e9',
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});

const BOOTH_ARROW_CORE_MAT = new THREE.MeshBasicMaterial({
  color: '#bae6fd',
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});

const ZONE_ARROW_GEOM = new THREE.ConeGeometry(0.13, 0.30, 3);
ZONE_ARROW_GEOM.rotateX(Math.PI / 2);
ZONE_ARROW_GEOM.scale(1.0, 0.35, 1.0);

const ZONE_ARROW_MAT = new THREE.MeshBasicMaterial({
  color: '#10b981',
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});

const BOOTH_LABEL_GEOM = new THREE.PlaneGeometry(1.06, 0.28);
const ZONE_LABEL_GEOM = new THREE.PlaneGeometry(0.84, 0.22);
const COMPACT_ZONE_LABEL_GEOM = new THREE.PlaneGeometry(0.58, 0.22);

function createPillTexture(
  primary: string,
  secondary: string,
  distanceText: string,
  accentHex: string,
  isZone: boolean
): THREE.CanvasTexture {
  const hasSecondary = secondary.trim().length > 0;
  const isCompactZone = isZone && !hasSecondary;
  const canvas = document.createElement('canvas');
  canvas.width = isCompactZone ? 256 : isZone ? 384 : 512;
  canvas.height = isZone ? 100 : 136;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 6;
  const r = (h - pad * 2) / 2;

  ctx.clearRect(0, 0, w, h);

  // Dark glass pill backdrop
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fillStyle = isZone ? 'rgba(15, 23, 42, 0.86)' : 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  // Left accent pill badge
  const badgeW = isCompactZone ? 116 : isZone ? 96 : 112;
  ctx.beginPath();
  ctx.roundRect(pad + 10, pad + 12, badgeW, h - pad * 2 - 24, (h - pad * 2 - 24) / 2);
  ctx.fillStyle = accentHex;
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${isZone ? 30 : 34}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(primary, pad + 10 + badgeW / 2, h / 2 + 1);

  // Right distance badge
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7dd3fc';
  ctx.font = `800 ${isCompactZone ? 30 : isZone ? 26 : 32}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(distanceText, w - pad - 22, h / 2 + 1);

  // Middle label (only when secondary text exists — avoids truncation on unassigned zones!)
  if (hasSecondary) {
    const midX = pad + 10 + badgeW + 14;
    const maxMidW = w - pad - 110 - midX;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${isZone ? 26 : 30}px "Segoe UI", system-ui, sans-serif`;
    let clipped = secondary.trim();
    while (clipped.length > 3 && ctx.measureText(clipped).width > maxMidW) {
      clipped = `${clipped.slice(0, -2).trimEnd()}…`;
    }
    ctx.fillText(clipped, midX, h / 2 + 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

const BoothIndicatorItem: React.FC<{
  item: WorldAnchoredBoothIndicator;
  ringRadius: number;
  isActiveTarget: boolean;
  shouldSuppressClick?: () => boolean;
  onSelectBooth?: (booth: V28BoothPlacementView) => void;
}> = React.memo(({ item, ringRadius, isActiveTarget, shouldSuppressClick, onSelectBooth }) => {
  const [hovered, setHovered] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapAtRef = useRef<number>(0);

  const roundedDist = Math.round(item.distanceM);
  const accentHex = isActiveTarget ? '#fbbf24' : hovered ? '#7dd3fc' : '#38bdf8';
  const labelTex = useMemo(
    () => createPillTexture(item.boothLabel, item.companyName, `${roundedDist}m`, accentHex, false),
    [item.boothLabel, item.companyName, roundedDist, accentHex]
  );
  useEffect(() => () => labelTex.dispose(), [labelTex]);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      if (document.body.style.cursor === 'pointer') {
        document.body.style.cursor = 'auto';
      }
    };
  }, [hovered]);

  const sinA = Math.sin(item.displayBearingRad);
  const cosA = Math.cos(item.displayBearingRad);
  const arrowX = sinA * ringRadius;
  const arrowZ = cosA * ringRadius;
  const labelRadius = ringRadius + 0.72;
  const labelX = sinA * labelRadius;
  const labelZ = cosA * labelRadius;
  const scale = hovered || isActiveTarget ? 1.08 : 1.0;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!onSelectBooth) return;
    if (shouldSuppressClick?.()) return;
    if (pointerDownRef.current) {
      const dragPx = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y);
      pointerDownRef.current = null;
      if (dragPx > LABEL_CLICK_MAX_DRAG_PX) return;
    }
    const now = performance.now();
    if (now - lastTapAtRef.current < LABEL_TAP_DEBOUNCE_MS) return;
    lastTapAtRef.current = now;
    onSelectBooth(item.booth);
  };

  return (
    <group>
      {/* Decorative glowing blue 3D directional arrow (non-raycast) */}
      <group position={[arrowX, 0.06, arrowZ]} rotation={[0, item.worldBearingRad, 0]}>
        <mesh position={[0, 0, 0.16]} geometry={ARROW_HEAD_GEOM} material={BOOTH_ARROW_MAT} raycast={NO_RAYCAST} />
        <mesh position={[0, 0.01, 0.14]} scale={[0.55, 0.55, 0.55]} geometry={ARROW_HEAD_GEOM} material={BOOTH_ARROW_CORE_MAT} raycast={NO_RAYCAST} />
        <mesh position={[0, 0, -0.14]} geometry={ARROW_SHAFT_GEOM} material={BOOTH_ARROW_MAT} raycast={NO_RAYCAST} />
      </group>

      {/* Interactive camera-facing billboard label (raycast enabled ONLY on label plane) */}
      <Billboard position={[labelX, item.labelElevationM, labelZ]} follow>
        <mesh
          name={`nav-booth-label-${item.boothId}`}
          geometry={BOOTH_LABEL_GEOM}
          scale={[scale, scale, 1]}
          renderOrder={12}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <meshBasicMaterial map={labelTex} transparent depthTest depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
});

const ZoneIndicatorItem: React.FC<{
  item: WorldAnchoredZoneIndicator;
  ringRadius: number;
  isActiveTarget: boolean;
  shouldSuppressClick?: () => boolean;
  onSelectZone?: (zoneId: string) => void;
}> = React.memo(({ item, ringRadius, isActiveTarget, shouldSuppressClick, onSelectZone }) => {
  const [hovered, setHovered] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapAtRef = useRef<number>(0);

  const accentHex = isActiveTarget ? '#fbbf24' : hovered ? '#6ee7b7' : '#34d399';
  const labelTex = useMemo(
    () => createPillTexture(`Khu ${item.zoneCode}`, item.displayName, `${item.distanceM}m`, accentHex, true),
    [item.zoneCode, item.displayName, item.distanceM, accentHex]
  );
  useEffect(() => () => labelTex.dispose(), [labelTex]);
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      if (document.body.style.cursor === 'pointer') {
        document.body.style.cursor = 'auto';
      }
    };
  }, [hovered]);

  const sinA = Math.sin(item.displayBearingRad);
  const cosA = Math.cos(item.displayBearingRad);
  const arrowX = sinA * ringRadius;
  const arrowZ = cosA * ringRadius;
  const labelX = sinA * (ringRadius + 0.58);
  const labelZ = cosA * (ringRadius + 0.58);
  const scale = hovered || isActiveTarget ? 1.08 : 1.0;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!onSelectZone) return;
    if (shouldSuppressClick?.()) return;
    if (pointerDownRef.current) {
      const dragPx = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y);
      pointerDownRef.current = null;
      if (dragPx > LABEL_CLICK_MAX_DRAG_PX) return;
    }
    const now = performance.now();
    if (now - lastTapAtRef.current < LABEL_TAP_DEBOUNCE_MS) return;
    lastTapAtRef.current = now;
    onSelectZone(item.zoneId);
  };

  return (
    <group>
      <group position={[arrowX, 0.05, arrowZ]} rotation={[0, item.worldBearingRad, 0]}>
        <mesh geometry={ZONE_ARROW_GEOM} material={ZONE_ARROW_MAT} raycast={NO_RAYCAST} />
      </group>
      <Billboard position={[labelX, 0.22, labelZ]} follow>
        <mesh
          name={`nav-zone-label-${item.zoneId}`}
          geometry={item.displayName.trim() ? ZONE_LABEL_GEOM : COMPACT_ZONE_LABEL_GEOM}
          scale={[scale, scale, 1]}
          renderOrder={11}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
        >
          <meshBasicMaterial map={labelTex} transparent depthTest depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
});

export interface CharacterNavigationRing3DProps {
  world: V28ExhibitionVersionDetail;
  liveTransform: () => { x: number; z: number; rotationY: number };
  visible: boolean;
  guidedRoute: GuidedRouteResult | null;
  activeTargetBoothId?: string | null;
  activeTargetZoneId?: string | null;
  shouldSuppressClick?: () => boolean;
  onClickBoothIndicator?: (booth: V28BoothPlacementView) => void;
  onClickZoneIndicator?: (zoneId: string) => void;
}

/**
 * UAT Fix 01 — Character-Anchored 3D World-Space Navigation Indicators.
 * - Anchors smoothly to the avatar's feet every frame via `useFrame` (0 React re-renders per frame).
 * - Displays glowing blue 3D world-space directional arrows for up to 3 suggested booths
 *   plus real-data zone directions around the avatar's ground compass ring.
 * - Labels use Drei `<Billboard follow>` so text always faces the camera upright (never mirrored).
 * - Zero raycast hitboxes (`raycast={() => null}`) so WASD, click-to-move, joystick, booth & NPC clicks work identically.
 */
export const CharacterNavigationRing3D: React.FC<CharacterNavigationRing3DProps> = React.memo(
  ({
    world,
    liveTransform,
    visible,
    guidedRoute: _guidedRoute,
    activeTargetBoothId = null,
    activeTargetZoneId = null,
    shouldSuppressClick,
    onClickBoothIndicator,
    onClickZoneIndicator,
  }) => {
    const rootRef = useRef<THREE.Group>(null);
    const ringMeshRef = useRef<THREE.Mesh>(null);
    const lastEvalPosRef = useRef<{ x: number; z: number }>({ x: Number.NaN, z: Number.NaN });

    const [indicators, setIndicators] = useState<{
      booths: WorldAnchoredBoothIndicator[];
      zones: WorldAnchoredZoneIndicator[];
    }>(() => computeWorldAnchoredIndicators(world.spawnPoint, world.booths, world.zones, 3, 2));

    // Recompute immediately if world booths/zones change
    useEffect(() => {
      const p = liveTransform();
      lastEvalPosRef.current = { x: p.x, z: p.z };
      setIndicators(computeWorldAnchoredIndicators(p, world.booths, world.zones, 3, 2));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [world.booths, world.zones]);

    // Keep read-only telemetry synced even when hidden in Focus Mode
    useEffect(() => {
      if (!visible) {
        const p = liveTransform();
        (window as unknown as Record<string, unknown>).__V28_CHAR_NAV__ = {
          visible: false,
          anchorX: Math.round(p.x * 100) / 100,
          anchorZ: Math.round(p.z * 100) / 100,
          boothCount: 0,
          zoneCount: 0,
          booths: [],
          zones: [],
        };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    useFrame(({ clock, camera, size }) => {
      if (!rootRef.current) return;
      const p = liveTransform();
      rootRef.current.position.set(p.x, 0.04, p.z);

      if (ringMeshRef.current) {
        const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.8) * 0.025;
        ringMeshRef.current.scale.set(pulse, pulse, 1);
      }

      // Only refresh indicator distances/bearings when avatar moves >= 1.2m (zero per-frame React state churn!)
      const last = lastEvalPosRef.current;
      if (!Number.isFinite(last.x) || Math.hypot(p.x - last.x, p.z - last.z) >= 1.2) {
        lastEvalPosRef.current = { x: p.x, z: p.z };
        setIndicators(computeWorldAnchoredIndicators(p, world.booths, world.zones, 3, 2));
      }

      const projectToScreen = (wx: number, wy: number, wz: number) => {
        const v = new THREE.Vector3(wx, wy, wz).project(camera);
        return {
          screenX: Math.round(((v.x + 1) * 0.5) * size.width),
          screenY: Math.round(((-v.y + 1) * 0.5) * size.height),
        };
      };

      // Expose read-only telemetry + screen projections for UAT/H4 verification
      (window as unknown as Record<string, unknown>).__V28_CHAR_NAV__ = {
        visible,
        anchorX: Math.round(p.x * 100) / 100,
        anchorZ: Math.round(p.z * 100) / 100,
        boothCount: indicators.booths.length,
        zoneCount: indicators.zones.length,
        booths: indicators.booths.map((b) => {
          const r = 1.68 + 0.72;
          const wx = p.x + Math.sin(b.displayBearingRad) * r;
          const wy = 0.04 + b.labelElevationM;
          const wz = p.z + Math.cos(b.displayBearingRad) * r;
          return {
            id: b.boothId,
            label: b.boothLabel,
            distM: b.distanceM,
            worldBearingDeg: Math.round((b.worldBearingRad * 180) / Math.PI),
            ...projectToScreen(wx, wy, wz),
          };
        }),
        zones: indicators.zones.map((z) => {
          const r = 2.95 + 0.58;
          const wx = p.x + Math.sin(z.displayBearingRad) * r;
          const wy = 0.26;
          const wz = p.z + Math.cos(z.displayBearingRad) * r;
          return {
            id: z.zoneId,
            code: z.zoneCode,
            distM: z.distanceM,
            worldBearingDeg: Math.round((z.worldBearingRad * 180) / Math.PI),
            ...projectToScreen(wx, wy, wz),
          };
        }),
      };
    });

    if (!visible) return null;

    return (
      <group ref={rootRef} name="V28CharacterAnchoredNav3D" position={[world.spawnPoint.x, 0.04, world.spawnPoint.z]}>
        {/* Subtle glowing ground compass ring around avatar feet (outside avatar base, 0 raycast) */}
        <mesh
          ref={ringMeshRef}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={COMPASS_RING_GEOM}
          material={COMPASS_RING_MAT}
          raycast={NO_RAYCAST}
        />

        {/* H3: Clickable Booth World-Space Directional Labels (kept visible during Auto-Walk so user can switch target mid-route) */}
        {indicators.booths.map((item) => (
          <BoothIndicatorItem
            key={item.boothId}
            item={item}
            ringRadius={1.68}
            isActiveTarget={activeTargetBoothId === item.boothId}
            shouldSuppressClick={shouldSuppressClick}
            onSelectBooth={onClickBoothIndicator}
          />
        ))}

        {/* H3: Clickable Real-Data Zone World-Space Directional Indicators */}
        {indicators.zones.map((item) => (
          <ZoneIndicatorItem
            key={item.zoneId}
            item={item}
            ringRadius={2.95}
            isActiveTarget={activeTargetZoneId === item.zoneId}
            shouldSuppressClick={shouldSuppressClick}
            onSelectZone={onClickZoneIndicator}
          />
        ))}
      </group>
    );
  }
);
