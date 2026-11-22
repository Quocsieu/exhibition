import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { V28ExhibitionVersionDetail } from '../../services/v28Api';

export interface YouthArchPlacementSpec {
  x: number;
  z: number;
  pillarOffsetX: number;
  clearSpanWidth: number;
  clearHeight: number;
  totalHeight: number;
  totalWidth: number;
}

/**
 * Compute exact entrance arch placement & dimensions strictly from live World bounds.
 * Never mutates layoutGenerator, booth coordinates, spawnPoint, or walkableRegions.
 *
 * Placement invariants (100-booth U-shaped World):
 * - Centered on centralAvenueBounds X (x = 0).
 * - Positioned at the North edge of welcomeAreaBounds (z = welcomeAreaBounds.minZ + 1.2 = 128.12),
 *   ~9.8m directly ahead of spawnPoint (0, 137.93) facing +Z toward arriving visitors.
 * - Pillars stand outside the central walking lane at x = ±7.35m (13.2m clear walking span).
 * - Clear headroom = 5.4m (well above avatar 1.8m & explore camera 3.2m); crown = 8.6m (< 13m eave).
 */
export function computeYouthArchPlacement(
  world: Pick<
    V28ExhibitionVersionDetail,
    'centralAvenueBounds' | 'welcomeAreaBounds' | 'hallBounds' | 'roofBounds'
  >
): YouthArchPlacementSpec {
  const aveMinX = world.centralAvenueBounds?.minX ?? -7;
  const aveMaxX = world.centralAvenueBounds?.maxX ?? 7;
  const centerX = (aveMinX + aveMaxX) / 2;
  const avenueWidth = Math.max(8, aveMaxX - aveMinX);

  const welcomeMinZ = world.welcomeAreaBounds?.minZ ?? 126.92;
  // Positioned at the grand entrance threshold into the central avenue (~16m ahead of spawn, ~21.4m from spawn camera)
  // so the full arch crown, exhibition title board, and both logo medallions frame cleanly below the top HUD bar!
  const archZ = welcomeMinZ - 5.0;

  const pillarWidth = 1.4;
  const pillarOffsetX = avenueWidth / 2 + 0.35; // Just outside central avenue edge (7.35m for 14m avenue)
  const clearSpanWidth = Math.max(6, pillarOffsetX * 2 - pillarWidth);
  const clearHeight = 4.6;
  const maxRoofClear = (world.roofBounds?.eaveHeight ?? 13) - 1.5;
  const totalHeight = Math.min(7.5, maxRoofClear);
  const totalWidth = pillarOffsetX * 2 + pillarWidth + 1.2;

  return {
    x: centerX,
    z: archZ,
    pillarOffsetX,
    clearSpanWidth,
    clearHeight,
    totalHeight,
    totalWidth,
  };
}

export const OFFICIAL_ARCH_TITLE = 'CON ĐƯỜNG NÔNG SẢN';
export const OFFICIAL_ARCH_SUBTITLE = 'TRIỂN LÃM 3D THANH NIÊN KHỞI NGHIỆP';

function createArchSignageTexture(_exhibitionName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Rich Youth Blue -> Deep Emerald-Teal agricultural exhibition gradient backdrop
    const grad = ctx.createLinearGradient(0, 0, 1536, 320);
    grad.addColorStop(0, '#003d82');
    grad.addColorStop(0.28, '#0057b8');
    grad.addColorStop(0.72, '#0369a1');
    grad.addColorStop(1, '#047857');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1536, 320);

    // Subtle radial highlight behind center title
    const glow = ctx.createRadialGradient(768, 155, 40, 768, 155, 620);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1536, 320);

    // Architectural double hairline border & warm harvest gold edge strips
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 0, 1536, 10);
    ctx.fillRect(0, 310, 1536, 10);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 1488, 272);

    // Subtle stylized harvest leaf accents flanking the official title
    const drawLeafAccent = (cx: number, cy: number, flip: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(flip, 1);
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(36, -34, 72, -6);
      ctx.quadraticCurveTo(36, 20, 0, 0);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(10, 14);
      ctx.quadraticCurveTo(42, 34, 70, 12);
      ctx.quadraticCurveTo(38, 4, 10, 14);
      ctx.fill();
      ctx.restore();
    };
    drawLeafAccent(86, 156, 1);
    drawLeafAccent(1450, 156, -1);

    // Official Phase 5 Entrance Arch Title with crisp full Vietnamese diacritics
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 94px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
    ctx.fillText(OFFICIAL_ARCH_TITLE, 768, 134);

    // Refined gold-white subtitle ribbon
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fef08a';
    ctx.font = '700 32px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
    ctx.fillText(OFFICIAL_ARCH_SUBTITLE, 768, 236);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Optional official organization logo disc.
 * Strictly loads ONLY if a verified image asset URL is explicitly provided and loads cleanly.
 * Never fabricates or draws imitation organization emblems.
 */
const LogoMountSlot: React.FC<{
  position: [number, number, number];
  logoUrl?: string | null;
  radius?: number;
}> = React.memo(({ position, logoUrl, radius = 0.88 }) => {
  const [logoState, setLogoState] = useState<{ tex: THREE.Texture; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!logoUrl) {
      setLogoState(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      logoUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const img = tex.image as { width?: number; height?: number } | undefined;
        const aspect = img?.width && img?.height ? img.width / img.height : 1;
        const maxDim = radius * 1.66;
        const w = aspect >= 1 ? maxDim : maxDim * aspect;
        const h = aspect >= 1 ? maxDim / aspect : maxDim;
        setLogoState({ tex, w, h });
      },
      undefined,
      () => {
        if (!cancelled) setLogoState(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [logoUrl, radius]);

  useEffect(() => {
    return () => {
      logoState?.tex.dispose();
    };
  }, [logoState]);

  return (
    <group position={position}>
      {/* Sculpted outer Youth Blue medallion rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius + 0.14, radius + 0.16, 0.24, 32]} />
        <meshStandardMaterial color="#0057b8" roughness={0.32} metalness={0.25} />
      </mesh>
      {/* Subtle sky-blue LED halo ring (front & rear) */}
      <mesh position={[0, 0, 0.125]}>
        <ringGeometry args={[radius + 0.03, radius + 0.09, 32]} />
        <meshStandardMaterial
          color="#bae6fd"
          emissive="#38bdf8"
          emissiveIntensity={0.75}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 0, -0.125]} rotation={[0, Math.PI, 0]}>
        <ringGeometry args={[radius + 0.03, radius + 0.09, 32]} />
        <meshStandardMaterial
          color="#bae6fd"
          emissive="#38bdf8"
          emissiveIntensity={0.75}
          roughness={0.2}
        />
      </mesh>
      {/* Clean white mounting plate (front & rear) */}
      <mesh position={[0, 0, 0.13]}>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, -0.13]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.05} />
      </mesh>
      {/* Official logo texture ONLY when real verified asset is supplied (preserves exact natural aspect ratio & true colors!) */}
      {logoState && (
        <>
          <mesh position={[0, 0, 0.14]}>
            <planeGeometry args={[logoState.w, logoState.h]} />
            <meshBasicMaterial map={logoState.tex} transparent toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.14]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[logoState.w, logoState.h]} />
            <meshBasicMaterial map={logoState.tex} transparent toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
});

export interface YouthEntranceArch3DProps {
  world: V28ExhibitionVersionDetail;
  /** Official transparent PNG/SVG URL for Đoàn TNCS Hồ Chí Minh logo (omit if asset not yet supplied). */
  leftLogoUrl?: string | null;
  /** Official transparent PNG/SVG URL for Hội LHTN Việt Nam logo (omit if asset not yet supplied). */
  rightLogoUrl?: string | null;
}

const YOUTH_BLUE_MAT = new THREE.MeshStandardMaterial({
  color: '#0057b8',
  roughness: 0.34,
  metalness: 0.22,
});

const YOUTH_BLUE_DEEP_MAT = new THREE.MeshStandardMaterial({
  color: '#003d82',
  roughness: 0.38,
  metalness: 0.28,
});

const ARCH_WHITE_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.42,
  metalness: 0.08,
});

const ARCH_SILVER_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.28,
  metalness: 0.65,
});

const LED_ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#e0f2fe',
  emissive: '#38bdf8',
  emissiveIntensity: 0.72,
  roughness: 0.2,
});

const AGRI_EMERALD_MAT = new THREE.MeshStandardMaterial({
  color: '#059669',
  roughness: 0.34,
  metalness: 0.18,
});

const HARVEST_GOLD_MAT = new THREE.MeshStandardMaterial({
  color: '#eab308',
  roughness: 0.26,
  metalness: 0.62,
});

/**
 * Grand Expo V28 Phase 6 — Youth-Themed Architectural 3D Entrance Arch.
 * - Youth Blue (#0057b8) + Satin White (#f8fafc) + subtle sky-blue LED trim.
 * - Multi-layered sculpted pillars, stepped plinths, beveled header canopy, dynamic exhibition title,
 *   and two symmetric 1:1 medallion mounting slots for official organization logos.
 * - Lightweight (< 35 meshes, shared materials, 0 shadows, 0 post-processing, 0 layout mutation).
 */
export const YouthEntranceArch3D: React.FC<YouthEntranceArch3DProps> = React.memo(
  ({ world, leftLogoUrl = null, rightLogoUrl = null }) => {
    const spec = useMemo(() => computeYouthArchPlacement(world), [world]);
    const signageTex = useMemo(
      () => createArchSignageTexture(world.exhibitionName),
      [world.exhibitionName]
    );

    useEffect(() => () => signageTex.dispose(), [signageTex]);

    const pillarH = spec.clearHeight + 1.0; // 6.4m
    const beamY = spec.clearHeight + 1.15; // 6.55m center of main lintel
    const beamWidth = spec.pillarOffsetX * 2 + 2.2;
    const signW = Math.min(10.4, spec.clearSpanWidth - 2.6);
    const signH = 2.15;
    const logoOffsetX = spec.pillarOffsetX - 0.1;

    return (
      <group name="V28YouthEntranceArch3D" position={[spec.x, 0, spec.z]}>
        {/* Left & Right Sculpted Architectural Pillars */}
        {([-1, 1] as const).map((side) => {
          const px = side * spec.pillarOffsetX;
          return (
            <group key={side} position={[px, 0, 0]}>
              {/* Stepped Architectural Plinth Base */}
              <mesh position={[0, 0.18, 0]} material={YOUTH_BLUE_DEEP_MAT}>
                <boxGeometry args={[2.1, 0.36, 2.2]} />
              </mesh>
              <mesh position={[0, 0.48, 0]} material={ARCH_WHITE_MAT}>
                <boxGeometry args={[1.75, 0.24, 1.85]} />
              </mesh>

              {/* Main Satin White Structural Column */}
              <mesh position={[0, pillarH / 2 + 0.4, 0]} material={ARCH_WHITE_MAT}>
                <boxGeometry args={[1.3, pillarH, 1.45]} />
              </mesh>

              {/* Outer Youth Blue Architectural Wing Fin (adds depth & modern silhouette) */}
              <mesh position={[side * 0.72, pillarH / 2 + 0.5, 0]} material={YOUTH_BLUE_MAT}>
                <boxGeometry args={[0.36, pillarH + 0.5, 1.75]} />
              </mesh>

              {/* Front & Rear Vertical LED Accent Strips */}
              <mesh position={[-side * 0.42, pillarH / 2 + 0.4, 0.74]} material={LED_ACCENT_MAT}>
                <boxGeometry args={[0.1, pillarH - 0.4, 0.05]} />
              </mesh>
              <mesh position={[-side * 0.42, pillarH / 2 + 0.4, -0.74]} material={LED_ACCENT_MAT}>
                <boxGeometry args={[0.1, pillarH - 0.4, 0.05]} />
              </mesh>

              {/* Metallic Silver Collar Band */}
              <mesh position={[0, spec.clearHeight - 0.15, 0]} material={ARCH_SILVER_MAT}>
                <boxGeometry args={[1.55, 0.16, 1.68]} />
              </mesh>

              {/* Angled Inner Architectural Knee Brace (clear above 4.8m) */}
              <mesh
                position={[-side * 0.85, spec.clearHeight - 0.25, 0]}
                rotation={[0, 0, side * 0.65]}
                material={YOUTH_BLUE_MAT}
              >
                <boxGeometry args={[0.32, 1.4, 1.1]} />
              </mesh>
            </group>
          );
        })}

        {/* Main Horizontal Architectural Lintel & Canopy */}
        <group position={[0, beamY, 0]}>
          {/* Lower White Soffit Beam */}
          <mesh position={[0, -0.82, 0]} material={ARCH_WHITE_MAT}>
            <boxGeometry args={[beamWidth, 0.42, 1.85]} />
          </mesh>

          {/* Subtle LED Underside Edge Strip (front & rear) */}
          <mesh position={[0, -1.04, 0.88]} material={LED_ACCENT_MAT}>
            <boxGeometry args={[beamWidth - 0.8, 0.07, 0.08]} />
          </mesh>
          <mesh position={[0, -1.04, -0.88]} material={LED_ACCENT_MAT}>
            <boxGeometry args={[beamWidth - 0.8, 0.07, 0.08]} />
          </mesh>

          {/* Primary Youth Blue Structural Fascia Box */}
          <mesh position={[0, 0.28, 0]} material={YOUTH_BLUE_MAT}>
            <boxGeometry args={[beamWidth + 0.6, 1.85, 1.62]} />
          </mesh>

          {/* Sculpted White Upper Crown Canopy Wing + Phase 5 Agricultural Emerald/Gold Crest */}
          <mesh position={[0, 1.38, 0]} material={ARCH_WHITE_MAT}>
            <boxGeometry args={[beamWidth + 1.4, 0.34, 2.05]} />
          </mesh>
          <mesh position={[0, 1.66, 0]} material={AGRI_EMERALD_MAT}>
            <boxGeometry args={[signW + 2.0, 0.28, 1.76]} />
          </mesh>
          <mesh position={[0, 1.86, 0]} material={HARVEST_GOLD_MAT}>
            <boxGeometry args={[signW + 0.4, 0.12, 1.48]} />
          </mesh>
          {/* Top LED Crown Accent */}
          <mesh position={[0, 1.56, 1.03]} material={HARVEST_GOLD_MAT}>
            <boxGeometry args={[beamWidth + 1.0, 0.08, 0.06]} />
          </mesh>
          <mesh position={[0, 1.56, -1.03]} material={HARVEST_GOLD_MAT}>
            <boxGeometry args={[beamWidth + 1.0, 0.08, 0.06]} />
          </mesh>

          {/* Front Exhibition Name Board (facing +Z toward arriving visitors at spawn) */}
          <mesh position={[0, 0.28, 0.83]}>
            <planeGeometry args={[signW, signH]} />
            <meshBasicMaterial map={signageTex} toneMapped={false} />
          </mesh>

          {/* Rear Exhibition Name Board (facing -Z when looking back from inside the hall) */}
          <mesh position={[0, 0.28, -0.83]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[signW, signH]} />
            <meshBasicMaterial map={signageTex} toneMapped={false} />
          </mesh>

          {/* Symmetric Organization Logo Mounting Slots (Left: Đoàn TNCS HCM, Right: Hội LHTN VN) */}
          <LogoMountSlot position={[-logoOffsetX, 0.32, 0.82]} logoUrl={leftLogoUrl} radius={0.86} />
          <LogoMountSlot position={[logoOffsetX, 0.32, 0.82]} logoUrl={rightLogoUrl} radius={0.86} />
        </group>
      </group>
    );
  }
);
