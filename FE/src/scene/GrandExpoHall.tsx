import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GrandExpoPlazaAmenities } from './GrandExpoPlazaAmenities';
import { createGrandExpoMedallionTexture } from './sceneTextures';
import {
  V27_0_BOOTH_LAYOUT_SPECS,
  V27_0_HALL_DIMENSIONS,
  V27_BOOTH_LAYOUT_SPECS,
  V27_HALL_DIMENSIONS,
  type ExpoWorldVersion,
} from './worldLayout';

export interface GrandExpoHallProps {
  onGroundClick: (point: THREE.Vector3) => void;
  clickMarker: { x: number; z: number } | null;
  worldVersion?: ExpoWorldVersion;
}

// ============================================================================
// Shared Module-Level Geometries & Materials (Zero per-render allocations)
// ============================================================================
const MAT_HALL_BASE_SLAB = new THREE.MeshStandardMaterial({
  color: '#1e2530',
  roughness: 0.65,
  metalness: 0.15,
});

const MAT_WALL_MATTE = new THREE.MeshStandardMaterial({
  color: '#eef1f6',
  roughness: 0.56,
  metalness: 0.04,
});

const MAT_WALL_PLINTH = new THREE.MeshStandardMaterial({
  color: '#252d3a',
  roughness: 0.48,
  metalness: 0.24,
});

const MAT_BRUSHED_ALU = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.26,
  metalness: 0.84,
});

const MAT_CHAMPAGNE_INLAY = new THREE.MeshStandardMaterial({
  color: '#d6be96',
  roughness: 0.28,
  metalness: 0.78,
});

const MAT_DARK_GRAPHITE = new THREE.MeshStandardMaterial({
  color: '#151c27',
  roughness: 0.36,
  metalness: 0.52,
});

const MAT_BOOTH_ZONE_PAD = new THREE.MeshStandardMaterial({
  color: '#cfd6e0',
  roughness: 0.52,
  metalness: 0.08,
});

const MAT_BENCH_OAK = new THREE.MeshStandardMaterial({
  color: '#c9a374',
  roughness: 0.54,
  metalness: 0.04,
});

const MAT_COVE_WARM_LIGHT = new THREE.MeshBasicMaterial({
  color: '#f8fafc',
});

const MAT_ACCENT_CYAN_LINE = new THREE.MeshBasicMaterial({
  color: '#38bdf8',
});

const MAT_CLICK_RING = new THREE.MeshBasicMaterial({
  color: '#0ea5e9',
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
});

const CLICK_RING_GEOM = new THREE.RingGeometry(0.28, 0.44, 24);
const CLICK_DOT_GEOM = new THREE.CircleGeometry(0.14, 16);

function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return { width: w, height: h, getContext: () => null } as unknown as HTMLCanvasElement;
}

function createGrandHallFloorTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Satin architectural light-gray terrazzo / technical epoxy slab
    ctx.fillStyle = '#e4e8ee';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle tonal variation across 2x2 architectural slab panels
    const tones = ['#e6eaf0', '#e0e5ec', '#e2e7ee', '#e7ebf1'];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = tones[r * 2 + c];
        ctx.fillRect(c * 256 + 2, r * 256 + 2, 252, 252);
      }
    }

    // Fine mineral terrazzo micro-flecks (deterministic)
    for (let i = 0; i < 420; i++) {
      const fx = ((i * 197 + 31) % 508) + 2;
      const fy = ((i * 313 + 67) % 508) + 2;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(fx, fy, 2, 2);
    }

    // Crisp recessed architectural expansion joints
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 258);
    ctx.lineTo(512, 258);
    ctx.moveTo(258, 0);
    ctx.lineTo(258, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 10);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createCentralAvenueTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Warm light honed travertine / architectural gallery stone runner
    ctx.fillStyle = '#f2efe9';
    ctx.fillRect(0, 0, 512, 512);

    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#e8e4dc');
    grad.addColorStop(0.14, '#f5f2ec');
    grad.addColorStop(0.5, '#f8f6f1');
    grad.addColorStop(0.86, '#f5f2ec');
    grad.addColorStop(1, '#e8e4dc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle horizontal stone slab joints
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;
    for (const y of [128, 256, 384]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Center subtle directional architectural chevron/guide inlay
    ctx.strokeStyle = 'rgba(180, 152, 108, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createGrandEntranceSignTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(1536, 256);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1536, 256);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#16233b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1536, 256);

    // Champagne gold architectural top & bottom framing hairlines
    ctx.fillStyle = '#d6be96';
    ctx.fillRect(28, 18, 1480, 5);
    ctx.fillRect(28, 233, 1480, 5);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 84px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('GRAND EXPO WORLD', 768, 126);

    ctx.fillStyle = '#7dd3fc';
    ctx.font = '700 32px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('TRUNG TÂM TRIỂN LÃM THƯƠNG MẠI 3D  ·  6 GIAN HÀNG TIÊU BIỂU', 768, 192);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createWayfindingTexture(side: 'left' | 'right'): THREE.CanvasTexture {
  const canvas = createCanvas(512, 768);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 768);

    ctx.strokeStyle = '#d6be96';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 476, 732);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 34, 448, 112);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '800 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('CHỈ DẪN KHU TRIỂN LÃM', 256, 78);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 32px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText(side === 'left' ? 'CÁNH TRÁI & CUỐI SẢNH' : 'CÁNH PHẢI & CUỐI SẢNH', 256, 122);

    const rows =
      side === 'left'
        ? [
            { dir: '← GẦN CỬA', title: 'EcoVita Coffee', sub: 'Thực phẩm & Nông sản', color: '#f59e0b' },
            { dir: '↖ PHÍA XA', title: 'Aether Tech Lab', sub: 'Công nghệ & Điện tử', color: '#38bdf8' },
            { dir: '↑ CUỐI SẢNH', title: 'Nordic Living', sub: 'Nội thất & Kiến trúc', color: '#10b981' },
          ]
        : [
            { dir: '→ GẦN CỬA', title: 'Kinetix Robotics', sub: 'Tự động hóa & AI', color: '#818cf8' },
            { dir: '↗ PHÍA XA', title: 'Solaris Energy', sub: 'Năng lượng xanh', color: '#34d399' },
            { dir: '↑ CUỐI SẢNH', title: 'Lumina Design', sub: 'Thiết kế & Ánh sáng', color: '#f472b6' },
          ];

    rows.forEach((row, idx) => {
      const y = 186 + idx * 176;
      ctx.fillStyle = '#162033';
      ctx.fillRect(42, y, 428, 148);
      ctx.fillStyle = row.color;
      ctx.fillRect(42, y, 10, 148);

      ctx.textAlign = 'left';
      ctx.fillStyle = row.color;
      ctx.font = '800 24px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(row.dir, 72, y + 42);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 34px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(row.title, 72, y + 90);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 22px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(row.sub, 72, y + 128);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export const GrandExpoHall: React.FC<GrandExpoHallProps> = React.memo(
  ({ onGroundClick, clickMarker, worldVersion = 'v27' }) => {
    const clickRingRef = useRef<THREE.Mesh>(null);

    const { floorTex, avenueTex, entranceSignTex, wayfindingLeftTex, wayfindingRightTex, medallionTex } =
      useMemo(
        () => ({
          floorTex: createGrandHallFloorTexture(),
          avenueTex: createCentralAvenueTexture(),
          entranceSignTex: createGrandEntranceSignTexture(),
          wayfindingLeftTex: createWayfindingTexture('left'),
          wayfindingRightTex: createWayfindingTexture('right'),
          medallionTex: createGrandExpoMedallionTexture(),
        }),
        []
      );

    useEffect(() => {
      return () => {
        floorTex.dispose();
        avenueTex.dispose();
        entranceSignTex.dispose();
        wayfindingLeftTex.dispose();
        wayfindingRightTex.dispose();
        medallionTex.dispose();
      };
    }, [floorTex, avenueTex, entranceSignTex, wayfindingLeftTex, wayfindingRightTex, medallionTex]);

    useFrame(({ clock }) => {
      if (clickRingRef.current) {
        const s = 1 + Math.sin(clock.getElapsedTime() * 5) * 0.14;
        clickRingRef.current.scale.set(s, s, 1);
      }
    });

    const isExpandedV271 = worldVersion !== 'v27_0';
    const dims = isExpandedV271 ? V27_HALL_DIMENSIONS : V27_0_HALL_DIMENSIONS;
    const boothSpecs = isExpandedV271 ? V27_BOOTH_LAYOUT_SPECS : V27_0_BOOTH_LAYOUT_SPECS;

    const hallW = dims.width; // 51.2m (V27.1) vs 42m (V27.0)
    const hallD = dims.depth; // 46.0m (V27.1) vs 38m (V27.0)
    const avenueW = dims.centralAvenueWidth; // 10.2m (V27.1) vs 8.4m (V27.0)
    const avenueD = isExpandedV271 ? 34.4 : 27.6;
    const avenueCenterZ = isExpandedV271 ? 3.8 : 3.2;

    const northWallZ = isExpandedV271 ? -22.2 : -18.2;
    const northWallSpan = isExpandedV271 ? 48.4 : 39.2;
    const sideWallX = isExpandedV271 ? 24.0 : 19.4;
    const sideWallSpan = isExpandedV271 ? 44.4 : 36.6;
    const southWallZ = isExpandedV271 ? 21.8 : 18.0;
    const southFlankX = isExpandedV271 ? 17.8 : 14.3;
    const southFlankW = isExpandedV271 ? 12.6 : 10.4;
    const entrancePylonX = isExpandedV271 ? 10.8 : 8.8;
    const entranceBeamW = isExpandedV271 ? 23.2 : 19.2;
    const wayfindingX = isExpandedV271 ? 8.2 : 6.6;
    const wayfindingZ = isExpandedV271 ? 17.2 : 13.85;
    const benchX = isExpandedV271 ? 16.8 : 13.2;
    const benchZ = isExpandedV271 ? 20.1 : 16.5;

    // Perimeter pilaster positions along North, West, and East architectural walls
    const northPilasters = isExpandedV271
      ? [-20.4, -13.6, -6.8, 0, 6.8, 13.6, 20.4]
      : [-16.5, -11.0, -5.5, 0, 5.5, 11.0, 16.5];
    const sidePilasters = isExpandedV271
      ? [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5]
      : [-14.0, -8.4, -2.8, 2.8, 8.4, 14.0];
    const avenueBandsZ = isExpandedV271 ? [-6.4, -0.4, 6.0, 12.4, 17.6] : [-5.2, 0.0, 4.8, 9.8];
    const northPlazaZ = isExpandedV271 ? -11.2 : -8.8;
    const northPlazaW = isExpandedV271 ? 22.4 : 17.8;

    // V27.2 Phase 2: Merge static repeated perimeter pilasters & avenue bands by material (-48 draw calls, pixel-identical)
    const mergedStaticGeoms = useMemo(() => {
      const aluParts: THREE.BufferGeometry[] = [];
      const champagneParts: THREE.BufferGeometry[] = [];
      const pushBox = (
        arr: THREE.BufferGeometry[],
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number
      ) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        arr.push(g);
      };

      for (const px of northPilasters) {
        pushBox(aluParts, 0.26, 3.45, 0.14, px, 2.05, northWallZ + 0.22);
        if (isExpandedV271) {
          pushBox(champagneParts, 0.045, 3.20, 0.02, px, 2.05, northWallZ + 0.295);
        }
      }
      for (const side of [-1, 1] as const) {
        for (const pz of sidePilasters) {
          pushBox(aluParts, 0.14, 3.45, 0.26, side * sideWallX - side * 0.22, 2.05, pz);
          if (isExpandedV271) {
            pushBox(champagneParts, 0.02, 3.20, 0.045, side * sideWallX - side * 0.295, 2.05, pz);
          }
        }
      }
      for (const tz of avenueBandsZ) {
        pushBox(champagneParts, avenueW - 0.2, 0.008, 0.09, 0, 0.012, tz);
      }
      // Merge outer floor edge coping into aluParts
      pushBox(aluParts, hallW + 0.3, 0.04, 0.24, 0, 0.015, -hallD / 2);
      pushBox(aluParts, hallW + 0.3, 0.04, 0.24, 0, 0.015, hallD / 2);
      pushBox(aluParts, 0.24, 0.04, hallD + 0.3, -hallW / 2, 0.015, 0);
      pushBox(aluParts, 0.24, 0.04, hallD + 0.3, hallW / 2, 0.015, 0);

      const mergedAlu = mergeGeometries(aluParts, false);
      const mergedChampagne = champagneParts.length ? mergeGeometries(champagneParts, false) : null;
      aluParts.forEach((g) => g.dispose());
      champagneParts.forEach((g) => g.dispose());
      return { mergedAlu, mergedChampagne };
    }, [isExpandedV271, northWallZ, sideWallX, avenueW, hallW, hallD]);

    useEffect(() => {
      return () => {
        mergedStaticGeoms.mergedAlu?.dispose();
        mergedStaticGeoms.mergedChampagne?.dispose();
      };
    }, [mergedStaticGeoms]);

    return (
      <group name={isExpandedV271 ? 'GrandExpoHall_v27_1' : 'GrandExpoHall_v27_0'}>
        {/* ================================================================
            A. EXHIBITION FLOOR & ARCHITECTURAL DIORAMA BASE
           ================================================================ */}
        {/* Outer architectural diorama foundation plinth */}
        <mesh position={[0, -0.36, 0]} receiveShadow material={MAT_HALL_BASE_SLAB}>
          <boxGeometry args={[hallW + 2.4, 0.68, hallD + 2.4]} />
        </mesh>

        {/* Main satin terrazzo / epoxy exhibition hall floor */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onGroundClick(e.point);
          }}
        >
          <planeGeometry args={[hallW, hallD]} />
          <meshStandardMaterial map={floorTex} roughness={0.44} metalness={0.08} />
        </mesh>

        {/* Merged Static Architectural Trim & Pilasters (V27.2 Draw-Call Batching) */}
        {mergedStaticGeoms.mergedAlu && (
          <mesh geometry={mergedStaticGeoms.mergedAlu} material={MAT_BRUSHED_ALU} />
        )}
        {mergedStaticGeoms.mergedChampagne && (
          <mesh geometry={mergedStaticGeoms.mergedChampagne} material={MAT_CHAMPAGNE_INLAY} />
        )}

        {/* ================================================================
            B. GRAND CENTRAL AVENUE (Unobstructed 10.2m x 34.4m Promenade in V27.1)
           ================================================================ */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, avenueCenterZ]} receiveShadow>
          <planeGeometry args={[avenueW, avenueD]} />
          <meshStandardMaterial map={avenueTex} roughness={0.42} metalness={0.06} />
        </mesh>

        {/* Flush brushed-champagne metallic avenue border inlays & subtle guide lines */}
        {[-avenueW / 2 - 0.05, avenueW / 2 + 0.05].map((ax) => (
          <group key={`avenue-rail-${ax}`}>
            <mesh position={[ax, 0.012, avenueCenterZ]} material={MAT_CHAMPAGNE_INLAY}>
              <boxGeometry args={[0.14, 0.014, avenueD]} />
            </mesh>
            <mesh
              position={[ax + (ax < 0 ? -0.11 : 0.11), 0.011, avenueCenterZ]}
              material={MAT_ACCENT_CYAN_LINE}
            >
              <boxGeometry args={[0.032, 0.008, avenueD - 0.6]} />
            </mesh>
          </group>
        ))}

        {/* Controlled Grand Hall Floor Polish: Center Medallion (Transverse bands merged above) */}
        <group position={[0, 0.013, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh material={MAT_CHAMPAGNE_INLAY}>
            <ringGeometry args={[2.05, 2.24, 48]} />
          </mesh>
          <mesh material={MAT_BRUSHED_ALU}>
            <ringGeometry args={[1.45, 1.54, 48]} />
          </mesh>
          <mesh material={MAT_ACCENT_CYAN_LINE}>
            <ringGeometry args={[1.95, 2.00, 48]} />
          </mesh>
        </group>

        {/* North Avenue Cross-Plaza Concourse (connects left/right wings & north booths) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, northPlazaZ]} receiveShadow>
          <planeGeometry args={[northPlazaW, 4.2]} />
          <meshStandardMaterial map={avenueTex} roughness={0.42} metalness={0.06} />
        </mesh>
        <mesh position={[0, 0.013, northPlazaZ - 2.12]} material={MAT_CHAMPAGNE_INLAY}>
          <boxGeometry args={[northPlazaW, 0.012, 0.12]} />
        </mesh>
        <mesh position={[0, 0.013, northPlazaZ + 2.12]} material={MAT_CHAMPAGNE_INLAY}>
          <boxGeometry args={[northPlazaW, 0.012, 0.08]} />
        </mesh>

        {/* Subtle Exhibition Zone Floor Pads beneath each of the 6 Booth positions (1:1 booth scale) */}
        {boothSpecs.map((spec) => (
          <group
            key={`zone-pad-${spec.boothId}`}
            position={[spec.positionX, 0.005, spec.positionZ]}
            rotation={[0, spec.rotationY, 0]}
          >
            <mesh receiveShadow material={MAT_BOOTH_ZONE_PAD}>
              <boxGeometry args={[8.1, 0.012, 6.4]} />
            </mesh>
            <mesh position={[0, 0.008, 3.22]} material={MAT_BRUSHED_ALU}>
              <boxGeometry args={[8.14, 0.008, 0.06]} />
            </mesh>
          </group>
        ))}

        {/* ================================================================
            C. OPEN-TOP PERIMETER ARCHITECTURE (Layered Low Walls, NO ROOF!)
           ================================================================ */}
        {/* North Rear Architectural Hall Wall + Central Focal Architectural Feature */}
        <group position={[0, 0, northWallZ]}>
          <mesh position={[0, 0.22, 0]} receiveShadow material={MAT_WALL_PLINTH}>
            <boxGeometry args={[northWallSpan, 0.44, 0.56]} />
          </mesh>
          <mesh position={[0, 2.08, -0.04]} receiveShadow material={MAT_WALL_MATTE}>
            <boxGeometry args={[northWallSpan - 0.2, 3.30, 0.44]} />
          </mesh>
          <mesh position={[0, 3.78, 0]} material={MAT_BRUSHED_ALU}>
            <boxGeometry args={[northWallSpan + 0.2, 0.14, 0.62]} />
          </mesh>
          <mesh position={[0, 3.56, 0.21]} material={MAT_COVE_WARM_LIGHT}>
            <boxGeometry args={[northWallSpan - 1.0, 0.045, 0.04]} />
          </mesh>
          {/* North-End Architectural Focal Emblem Feature (Replaced by full Check-In Stage in V27.3!) */}
          {false && isExpandedV271 && (
            <group position={[0, 2.25, 0.26]}>
              <mesh material={MAT_DARK_GRAPHITE}>
                <boxGeometry args={[5.2, 2.8, 0.16]} />
              </mesh>
              <mesh position={[0, 1.44, 0.02]} material={MAT_CHAMPAGNE_INLAY}>
                <boxGeometry args={[5.32, 0.08, 0.20]} />
              </mesh>
              <mesh position={[0, -1.44, 0.02]} material={MAT_CHAMPAGNE_INLAY}>
                <boxGeometry args={[5.32, 0.08, 0.20]} />
              </mesh>
              <mesh position={[0, 0, 0.09]} material={MAT_ACCENT_CYAN_LINE}>
                <boxGeometry args={[0.06, 2.2, 0.02]} />
              </mesh>
              <mesh position={[0, 0, 0.095]} material={MAT_CHAMPAGNE_INLAY}>
                <ringGeometry args={[0.62, 0.72, 36]} />
              </mesh>
            </group>
          )}
        </group>

        {/* West & East Side Architectural Hall Walls */}
        {([-1, 1] as const).map((side) => (
          <group key={`side-wall-${side}`} position={[side * sideWallX, 0, 0]}>
            <mesh position={[0, 0.22, 0]} receiveShadow material={MAT_WALL_PLINTH}>
              <boxGeometry args={[0.56, 0.44, sideWallSpan]} />
            </mesh>
            <mesh position={[side * 0.04, 2.08, 0]} receiveShadow material={MAT_WALL_MATTE}>
              <boxGeometry args={[0.44, 3.30, sideWallSpan - 0.2]} />
            </mesh>
            <mesh position={[0, 3.78, 0]} material={MAT_BRUSHED_ALU}>
              <boxGeometry args={[0.62, 0.14, sideWallSpan + 0.2]} />
            </mesh>
            <mesh position={[-side * 0.21, 3.56, 0]} material={MAT_COVE_WARM_LIGHT}>
              <boxGeometry args={[0.04, 0.045, sideWallSpan - 1.0]} />
            </mesh>
          </group>
        ))}

        {/* South Flanking Perimeter Walls (leaving wide open central Grand Entrance!) */}
        {([-1, 1] as const).map((side) => (
          <group key={`south-flank-${side}`} position={[side * southFlankX, 0, southWallZ]}>
            <mesh position={[0, 0.22, 0]} receiveShadow material={MAT_WALL_PLINTH}>
              <boxGeometry args={[southFlankW, 0.44, 0.56]} />
            </mesh>
            <mesh position={[0, 2.08, 0]} receiveShadow material={MAT_WALL_MATTE}>
              <boxGeometry args={[southFlankW - 0.2, 3.30, 0.44]} />
            </mesh>
            <mesh position={[0, 3.78, 0]} material={MAT_BRUSHED_ALU}>
              <boxGeometry args={[southFlankW + 0.2, 0.14, 0.62]} />
            </mesh>
          </group>
        ))}

        {/* ================================================================
            D. MAIN ENTRANCE PORTAL — GRAND EXPO WORLD
           ================================================================ */}
        <group position={[0, 0, southWallZ]}>
          {/* Twin Sculpted Entrance Pylons */}
          {([-entrancePylonX, entrancePylonX] as const).map((px) => (
            <group key={`ent-pylon-${px}`} position={[px, 0, 0]}>
              <mesh position={[0, 0.18, 0]} castShadow receiveShadow material={MAT_WALL_PLINTH}>
                <boxGeometry args={[1.56, 0.36, 1.72]} />
              </mesh>
              <mesh position={[0, 3.15, 0]} castShadow receiveShadow material={MAT_DARK_GRAPHITE}>
                <boxGeometry args={[1.32, 5.62, 1.44]} />
              </mesh>
              <mesh position={[0, 3.15, 0.73]} material={MAT_BRUSHED_ALU}>
                <boxGeometry args={[1.38, 5.56, 0.06]} />
              </mesh>
              <mesh position={[0, 3.15, -0.73]} material={MAT_BRUSHED_ALU}>
                <boxGeometry args={[1.38, 5.56, 0.06]} />
              </mesh>
              <mesh position={[px < 0 ? 0.68 : -0.68, 2.9, 0]} material={MAT_ACCENT_CYAN_LINE}>
                <boxGeometry args={[0.04, 4.6, 0.08]} />
              </mesh>
            </group>
          ))}

          {/* Overhead Grand Entrance Fascia Beam (5.0m+ clear headroom) */}
          <mesh position={[0, 5.68, 0]} castShadow material={MAT_DARK_GRAPHITE}>
            <boxGeometry args={[entranceBeamW, 1.38, 0.88]} />
          </mesh>
          <mesh position={[0, 6.40, 0]} material={MAT_BRUSHED_ALU}>
            <boxGeometry args={[entranceBeamW + 0.2, 0.10, 0.96]} />
          </mesh>
          <mesh position={[0, 4.96, 0]} material={MAT_CHAMPAGNE_INLAY}>
            <boxGeometry args={[entranceBeamW + 0.2, 0.08, 0.94]} />
          </mesh>

          {/* Dual-Sided GRAND EXPO WORLD Illuminated Signage */}
          <mesh position={[0, 5.68, 0.45]}>
            <planeGeometry args={[entranceBeamW - 3.0, 1.18]} />
            <meshBasicMaterial map={entranceSignTex} toneMapped={false} />
          </mesh>
          <mesh position={[0, 5.68, -0.45]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[entranceBeamW - 3.0, 1.18]} />
            <meshBasicMaterial map={entranceSignTex} toneMapped={false} />
          </mesh>
        </group>

        {/* ================================================================
            E. V27.4 / V27.3 PLAZA AMENITIES + CENTRAL AVENUE ARCHITECTURAL REFINEMENT
               OR LEGACY V27.0 WAYFINDING & BENCHES
           ================================================================ */}
        {isExpandedV271 ? (
          <>
            <GrandExpoPlazaAmenities />
            {/* V27.4 Phase 4 — Grand Expo World Central Avenue Floor Medallion (flush, zero obstacles!) */}
            <mesh position={[0, 0.018, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[2.65, 48]} />
              <meshBasicMaterial map={medallionTex} transparent toneMapped={false} />
            </mesh>
            {/* V27.4 Phase 4 — Warm Recessed LED Guide Strips flanking the 10.2m Central Avenue */}
            {([-5.12, 5.12] as const).map((gx) => (
              <mesh key={`avenue-led-${gx}`} position={[gx, 0.016, 3.8]}>
                <boxGeometry args={[0.07, 0.012, 33.8]} />
                <meshBasicMaterial color="#e8cfa0" />
              </mesh>
            ))}
            {/* V27.4 Phase 5 — Warm Architectural Cove Accent Strips along Perimeter Walls */}
            <mesh position={[0, 3.42, northWallZ + 0.34]}>
              <boxGeometry args={[northWallSpan - 1.2, 0.06, 0.04]} />
              <meshBasicMaterial color="#f5e3be" />
            </mesh>
            {([-1, 1] as const).map((side) => (
              <mesh
                key={`side-cove-${side}`}
                position={[side * (sideWallX - 0.34), 3.42, 0]}
              >
                <boxGeometry args={[0.04, 0.06, sideWallSpan - 1.6]} />
                <meshBasicMaterial color="#f5e3be" />
              </mesh>
            ))}
            {/* V27.4 Phase 5 — 4 Corner Architectural Landscape Planters (clear of walkways & colliders) */}
            {([
              [-22.1, -20.4],
              [22.1, -20.4],
              [-22.1, 20.1],
              [22.1, 20.1],
            ] as const).map(([cx, cz], idx) => (
              <group key={`corner-planter-${idx}`} position={[cx, 0, cz]}>
                <mesh position={[0, 0.28, 0]} material={MAT_DARK_GRAPHITE}>
                  <boxGeometry args={[2.4, 0.56, 1.4]} />
                </mesh>
                <mesh position={[0, 0.58, 0]} material={MAT_CHAMPAGNE_INLAY}>
                  <boxGeometry args={[2.46, 0.05, 1.46]} />
                </mesh>
                {([-0.68, 0, 0.68] as const).map((sx, sIdx) => (
                  <mesh key={`shrub-${sIdx}`} position={[sx, 0.86 + (sIdx === 1 ? 0.1 : 0), 0]}>
                    <icosahedronGeometry args={[0.38, 1]} />
                    <meshStandardMaterial color={sIdx === 1 ? '#2e7d52' : '#236340'} roughness={0.72} />
                  </mesh>
                ))}
              </group>
            ))}
          </>
        ) : (
          <>
            {([
              { side: 'left' as const, x: -wayfindingX, rotY: 0.28, tex: wayfindingLeftTex },
              { side: 'right' as const, x: wayfindingX, rotY: -0.28, tex: wayfindingRightTex },
            ] as const).map((p) => (
              <group key={`wayfinding-${p.side}`} position={[p.x, 0, wayfindingZ]} rotation={[0, p.rotY, 0]}>
                <mesh position={[0, 0.08, 0]} castShadow receiveShadow material={MAT_WALL_PLINTH}>
                  <boxGeometry args={[0.96, 0.16, 0.44]} />
                </mesh>
                <mesh position={[0, 1.32, 0]} castShadow receiveShadow material={MAT_DARK_GRAPHITE}>
                  <boxGeometry args={[0.84, 2.34, 0.16]} />
                </mesh>
                <mesh position={[0, 1.32, 0]} material={MAT_BRUSHED_ALU}>
                  <boxGeometry args={[0.88, 2.38, 0.12]} />
                </mesh>
                <mesh position={[0, 1.42, 0.086]}>
                  <planeGeometry args={[0.74, 1.12]} />
                  <meshBasicMaterial map={p.tex} toneMapped={false} />
                </mesh>
                <mesh position={[0, 1.42, -0.086]} rotation={[0, Math.PI, 0]}>
                  <planeGeometry args={[0.74, 1.12]} />
                  <meshBasicMaterial map={p.tex} toneMapped={false} />
                </mesh>
              </group>
            ))}

            {([-benchX, benchX] as const).map((bx) => (
              <group key={`gallery-bench-${bx}`} position={[bx, 0, benchZ]}>
                <mesh position={[-0.95, 0.22, 0]} castShadow material={MAT_DARK_GRAPHITE}>
                  <boxGeometry args={[0.12, 0.44, 0.56]} />
                </mesh>
                <mesh position={[0.95, 0.22, 0]} castShadow material={MAT_DARK_GRAPHITE}>
                  <boxGeometry args={[0.12, 0.44, 0.56]} />
                </mesh>
                <mesh position={[0, 0.46, 0]} castShadow receiveShadow material={MAT_BENCH_OAK}>
                  <boxGeometry args={[2.35, 0.08, 0.62]} />
                </mesh>
              </group>
            ))}
          </>
        )}

        {/* Click-to-Move Destination Marker */}
        {clickMarker && (
          <group position={[clickMarker.x, 0.03, clickMarker.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh ref={clickRingRef} geometry={CLICK_RING_GEOM} material={MAT_CLICK_RING} />
            <mesh geometry={CLICK_DOT_GEOM} material={MAT_ACCENT_CYAN_LINE} />
          </group>
        )}
      </group>
    );
  }
);
