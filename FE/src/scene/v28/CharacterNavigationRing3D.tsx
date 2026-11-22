import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { V28ExhibitionVersionDetail } from '../../services/v28Api';
import {
  computeWorldAnchoredIndicators,
  type GuidedRouteResult,
  type WorldAnchoredBoothIndicator,
  type WorldAnchoredZoneIndicator,
} from '../../services/v28NavigationEngine';

// Non-blocking raycast stub so 3D indicators NEVER intercept floor click-to-move or booth/NPC clicks!
const NO_RAYCAST = () => null;

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

const BoothIndicatorItem: React.FC<{ item: WorldAnchoredBoothIndicator; ringRadius: number }> = React.memo(
  ({ item, ringRadius }) => {
    const roundedDist = Math.round(item.distanceM);
    const labelTex = useMemo(
      () => createPillTexture(item.boothLabel, item.companyName, `${roundedDist}m`, '#38bdf8', false),
      [item.boothLabel, item.companyName, roundedDist]
    );
    useEffect(() => () => labelTex.dispose(), [labelTex]);

    const sinA = Math.sin(item.displayBearingRad);
    const cosA = Math.cos(item.displayBearingRad);
    const arrowX = sinA * ringRadius;
    const arrowZ = cosA * ringRadius;
    const labelRadius = ringRadius + 0.72;
    const labelX = sinA * labelRadius;
    const labelZ = cosA * labelRadius;

    return (
      <group>
        {/* Glowing blue 3D directional arrow pointing along true world bearing */}
        <group position={[arrowX, 0.06, arrowZ]} rotation={[0, item.worldBearingRad, 0]}>
          <mesh position={[0, 0, 0.16]} geometry={ARROW_HEAD_GEOM} material={BOOTH_ARROW_MAT} raycast={NO_RAYCAST} />
          <mesh position={[0, 0.01, 0.14]} scale={[0.55, 0.55, 0.55]} geometry={ARROW_HEAD_GEOM} material={BOOTH_ARROW_CORE_MAT} raycast={NO_RAYCAST} />
          <mesh position={[0, 0, -0.14]} geometry={ARROW_SHAFT_GEOM} material={BOOTH_ARROW_MAT} raycast={NO_RAYCAST} />
        </group>

        {/* Camera-facing upright billboard label (never inverted, respects depth so never covers avatar back) */}
        <Billboard position={[labelX, item.labelElevationM, labelZ]} follow>
          <mesh geometry={BOOTH_LABEL_GEOM} raycast={NO_RAYCAST} renderOrder={12}>
            <meshBasicMaterial map={labelTex} transparent depthTest depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);

const ZoneIndicatorItem: React.FC<{ item: WorldAnchoredZoneIndicator; ringRadius: number }> = React.memo(
  ({ item, ringRadius }) => {
    const labelTex = useMemo(
      () => createPillTexture(`Khu ${item.zoneCode}`, item.displayName, `${item.distanceM}m`, '#34d399', true),
      [item.zoneCode, item.displayName, item.distanceM]
    );
    useEffect(() => () => labelTex.dispose(), [labelTex]);

    const sinA = Math.sin(item.displayBearingRad);
    const cosA = Math.cos(item.displayBearingRad);
    const arrowX = sinA * ringRadius;
    const arrowZ = cosA * ringRadius;
    const labelX = sinA * (ringRadius + 0.58);
    const labelZ = cosA * (ringRadius + 0.58);

    return (
      <group>
        <group position={[arrowX, 0.05, arrowZ]} rotation={[0, item.worldBearingRad, 0]}>
          <mesh geometry={ZONE_ARROW_GEOM} material={ZONE_ARROW_MAT} raycast={NO_RAYCAST} />
        </group>
        <Billboard position={[labelX, 0.20, labelZ]} follow>
          <mesh
            geometry={item.displayName.trim() ? ZONE_LABEL_GEOM : COMPACT_ZONE_LABEL_GEOM}
            raycast={NO_RAYCAST}
            renderOrder={11}
          >
            <meshBasicMaterial map={labelTex} transparent depthTest depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);

export interface CharacterNavigationRing3DProps {
  world: V28ExhibitionVersionDetail;
  liveTransform: () => { x: number; z: number; rotationY: number };
  visible: boolean;
  guidedRoute: GuidedRouteResult | null;
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
  ({ world, liveTransform, visible, guidedRoute }) => {
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

    useFrame(({ clock }) => {
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

      // Expose read-only telemetry for UAT verification (dedicated key, never clobbered by __V28_DEBUG__)
      (window as unknown as Record<string, unknown>).__V28_CHAR_NAV__ = {
        visible,
        anchorX: Math.round(p.x * 100) / 100,
        anchorZ: Math.round(p.z * 100) / 100,
        boothCount: guidedRoute ? 0 : indicators.booths.length,
        zoneCount: indicators.zones.length,
        booths: indicators.booths.map((b) => ({
          id: b.boothId,
          label: b.boothLabel,
          distM: b.distanceM,
          worldBearingDeg: Math.round((b.worldBearingRad * 180) / Math.PI),
        })),
        zones: indicators.zones.map((z) => ({
          code: z.zoneCode,
          distM: z.distanceM,
          worldBearingDeg: Math.round((z.worldBearingRad * 180) / Math.PI),
        })),
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

        {/* Up to 3 Suggested Booth World-Space Directional Arrows + Camera-Facing Labels (hidden when explicit Dijkstra route is active) */}
        {!guidedRoute &&
          indicators.booths.map((item) => (
            <BoothIndicatorItem key={item.boothId} item={item} ringRadius={1.68} />
          ))}

        {/* Real-Data Zone World-Space Directional Indicators (outer flanking arc) */}
        {indicators.zones.map((item) => (
          <ZoneIndicatorItem key={item.zoneId} item={item} ringRadius={2.95} />
        ))}
      </group>
    );
  }
);
