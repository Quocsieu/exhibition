import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_BOUNDS } from '../types/expo';
import {
  createBannerSignTexture,
  createPlazaMedallionTexture,
  createPlazaTileTexture,
} from './sceneTextures';

export interface EnvironmentProps {
  onGroundClick: (point: THREE.Vector3) => void;
  clickMarker: { x: number; z: number } | null;
}

interface PlanterIslandConfig {
  x: number;
  z: number;
  benchOffsetZ: number;
  signText?: { title: string; subtitle: string; color: string };
}

const CENTRAL_PLANTER_ISLANDS: PlanterIslandConfig[] = [
  {
    x: -6,
    z: -5,
    benchOffsetZ: 0.62,
    signText: {
      title: '↖ KHU CÔNG NGHỆ & NỘI THẤT',
      subtitle: 'Aether Tech · Nordic Living',
      color: '#0ea5e9',
    },
  },
  {
    x: 6,
    z: -5,
    benchOffsetZ: 0.62,
    signText: {
      title: '↗ KHU NÔNG SẢN & ĐẶC SẢN',
      subtitle: 'EcoVita Roastery · Bắc Sân',
      color: '#10b981',
    },
  },
  {
    x: -6,
    z: 5,
    benchOffsetZ: -0.62,
    signText: {
      title: '↙ KHU ROBOTICS & TỰ ĐỘNG HÓA',
      subtitle: 'Kinetix AI · Tây Nam',
      color: '#6366f1',
    },
  },
  {
    x: 6,
    z: 5,
    benchOffsetZ: -0.62,
    signText: {
      title: '↘ KHU THIẾT KẾ & NĂNG LƯỢNG',
      subtitle: 'Lumina Design · Solaris Energy',
      color: '#ec4899',
    },
  },
];

const PERIMETER_TREES: [number, number, number][] = [
  [-20.5, -18.5, 1.15],
  [20.5, -18.5, 1.1],
  [-20.5, 18.5, 1.05],
  [20.5, 18.5, 1.15],
  [-21.2, -1.0, 1.2],
  [21.2, -1.0, 1.2],
  [-9.5, -20.5, 1.0],
  [9.5, -20.5, 1.0],
];

const ALL_TREES: { x: number; z: number; scale: number }[] = [
  ...CENTRAL_PLANTER_ISLANDS.map((island) => ({ x: island.x, z: island.z, scale: 1.08 })),
  ...PERIMETER_TREES.map(([x, z, scale]) => ({ x, z, scale })),
];

const ALL_BENCHES: { x: number; z: number; rotationY: number }[] = [
  { x: 0, z: 2.18, rotationY: 0 },
  { x: 0, z: -2.18, rotationY: Math.PI },
  { x: 2.18, z: 0, rotationY: Math.PI / 2 },
  { x: -2.18, z: 0, rotationY: -Math.PI / 2 },
  ...CENTRAL_PLANTER_ISLANDS.map((island) => ({
    x: island.x,
    z: island.z + island.benchOffsetZ,
    rotationY: island.benchOffsetZ > 0 ? 0 : Math.PI,
  })),
];

const PERIMETER_LAMPS: [number, number][] = [
  [-3.8, 15.5],
  [3.8, 15.5],
  [-3.8, -8.5],
  [3.8, -8.5],
  [-16.5, -3.5],
  [16.5, -3.5],
  [-16.5, 3.5],
  [16.5, 3.5],
];

const BOOTH_CONNECTOR_PATHS: {
  x: number;
  z: number;
  w: number;
  d: number;
  ry: number;
  accent: string;
}[] = [
  { x: -9.2, z: -6.8, w: 3.1, d: 6.8, ry: Math.atan2(12.5, 9), accent: '#0ea5e9' },
  { x: 0, z: -8.8, w: 3.3, d: 6.4, ry: 0, accent: '#10b981' },
  { x: 9.2, z: -6.8, w: 3.1, d: 6.8, ry: Math.atan2(-12.5, 9), accent: '#f59e0b' },
  { x: -9.2, z: 6.8, w: 3.1, d: 6.8, ry: Math.atan2(12.5, -9), accent: '#6366f1' },
  { x: 9.2, z: 6.8, w: 3.1, d: 6.8, ry: Math.atan2(-12.5, -9), accent: '#ec4899' },
  { x: 0, z: 8.8, w: 3.3, d: 6.4, ry: Math.PI, accent: '#14b8a6' },
];

// Stylized 3D City Background Skyline Silhouettes (Placed outside N/W/E perimeter, zero collision)
const STYLIZED_CITY_BUILDINGS: {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}[] = [
  { x: -32, z: -31, sx: 6.5, sy: 9.5, sz: 5.5 },
  { x: -23, z: -33, sx: 5.8, sy: 12.2, sz: 5.2 },
  { x: -13, z: -34, sx: 6.8, sy: 8.6, sz: 5.4 },
  { x: 0, z: -35, sx: 7.4, sy: 13.8, sz: 5.8 },
  { x: 13, z: -34, sx: 6.4, sy: 9.8, sz: 5.4 },
  { x: 23, z: -33, sx: 5.8, sy: 11.4, sz: 5.2 },
  { x: 32, z: -31, sx: 6.5, sy: 8.8, sz: 5.5 },
  { x: -34, z: -18, sx: 5.5, sy: 10.5, sz: 6.2 },
  { x: -35, z: -6, sx: 5.6, sy: 8.2, sz: 6.0 },
  { x: -34, z: 7, sx: 5.4, sy: 9.4, sz: 5.8 },
  { x: 34, z: -18, sx: 5.5, sy: 9.2, sz: 6.2 },
  { x: 35, z: -6, sx: 5.6, sy: 7.8, sz: 6.0 },
];

// Distant Low-Poly Parkland Hills around the outer horizon
const HORIZON_HILLS: { x: number; z: number; sx: number; sy: number; sz: number }[] = [
  { x: -42, z: -40, sx: 16, sy: 5.2, sz: 12 },
  { x: -16, z: -44, sx: 18, sy: 6.4, sz: 14 },
  { x: 16, z: -44, sx: 18, sy: 5.8, sz: 14 },
  { x: 42, z: -40, sx: 16, sy: 4.8, sz: 12 },
  { x: -44, z: -14, sx: 12, sy: 4.6, sz: 16 },
  { x: -44, z: 14, sx: 12, sy: 4.2, sz: 15 },
];

// 4 Cozy Perimeter Rest Lounge Zones (located in outer garden corners, clear of all walkways)
const REST_LOUNGE_ZONES: { x: number; z: number; color: string }[] = [
  { x: -18.8, z: -15.5, color: '#0ea5e9' },
  { x: 18.8, z: -15.5, color: '#f59e0b' },
  { x: -18.8, z: 14.8, color: '#6366f1' },
  { x: 18.8, z: 14.8, color: '#10b981' },
];

// 8 Perimeter Festival Flag Totems along outer balustrade
const FESTIVAL_TOTEMS: { x: number; z: number; ry: number }[] = [
  { x: -22.6, z: -12.5, ry: Math.PI / 2 },
  { x: -22.6, z: -4.5, ry: Math.PI / 2 },
  { x: -22.6, z: 4.5, ry: Math.PI / 2 },
  { x: -22.6, z: 12.5, ry: Math.PI / 2 },
  { x: 22.6, z: -12.5, ry: -Math.PI / 2 },
  { x: 22.6, z: -4.5, ry: -Math.PI / 2 },
  { x: 22.6, z: 4.5, ry: -Math.PI / 2 },
  { x: 22.6, z: 12.5, ry: -Math.PI / 2 },
];

// Colorful Flower Clusters placed inside central planters & entrance beds
const FLOWER_CLUSTERS_PINK: [number, number, number][] = [
  [-6.45, 0.62, -5.45],
  [-5.55, 0.62, -4.55],
  [6.45, 0.62, -5.45],
  [5.55, 0.62, -4.55],
  [-6.45, 0.62, 5.45],
  [6.45, 0.62, 5.45],
  [-6.2, 0.42, 20.8],
  [6.2, 0.42, 20.8],
];

const FLOWER_CLUSTERS_GOLD: [number, number, number][] = [
  [-6.45, 0.62, -4.55],
  [6.45, 0.62, -4.55],
  [-5.55, 0.62, 5.45],
  [-6.45, 0.62, 4.55],
  [5.55, 0.62, 5.45],
  [6.45, 0.62, 4.55],
  [-6.6, 0.42, 21.1],
  [6.6, 0.42, 21.1],
];

// Shared module-level Geometries & Materials to minimize WebGL memory & state switches
const TREE_TRUNK_GEOM = new THREE.CylinderGeometry(0.14, 0.22, 1.2, 7);
const TREE_LOW_GEOM = new THREE.DodecahedronGeometry(0.92, 0);
const TREE_MID_GEOM = new THREE.DodecahedronGeometry(0.68, 0);
const TREE_TOP_GEOM = new THREE.IcosahedronGeometry(0.48, 0);
const TREE_BASE_GEOM = new THREE.CylinderGeometry(0.85, 0.95, 0.44, 12);

const FLOWER_BUSH_GEOM = new THREE.DodecahedronGeometry(0.24, 0);
const FLOWER_BLOSSOM_GEOM = new THREE.IcosahedronGeometry(0.15, 0);

const PARASOL_POLE_GEOM = new THREE.CylinderGeometry(0.05, 0.06, 2.35, 8);
const PARASOL_CANOPY_GEOM = new THREE.ConeGeometry(1.55, 0.58, 8);
const LOUNGE_TABLE_TOP_GEOM = new THREE.CylinderGeometry(0.68, 0.68, 0.07, 14);
const LOUNGE_TABLE_BASE_GEOM = new THREE.CylinderGeometry(0.12, 0.34, 0.72, 10);

const FLAG_POLE_GEOM = new THREE.CylinderGeometry(0.04, 0.06, 3.6, 8);
const FLAG_BANNER_GEOM = new THREE.BoxGeometry(0.04, 1.45, 0.58);

const TREE_TRUNK_MAT = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 });
const TREE_LOW_MAT = new THREE.MeshStandardMaterial({
  color: '#059669',
  roughness: 0.65,
  flatShading: true,
});
const TREE_MID_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.6,
  flatShading: true,
});
const TREE_TOP_MAT = new THREE.MeshStandardMaterial({
  color: '#34d399',
  roughness: 0.55,
  flatShading: true,
});
const SLATE_POT_MAT = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.7 });

const FLOWER_PINK_MAT = new THREE.MeshStandardMaterial({
  color: '#f43f5e',
  roughness: 0.45,
  flatShading: true,
});
const FLOWER_GOLD_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  roughness: 0.4,
  flatShading: true,
});

const PARASOL_CREAM_MAT = new THREE.MeshStandardMaterial({
  color: '#fffbeb',
  roughness: 0.45,
  flatShading: true,
});
const TABLE_WHITE_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.3,
});
const FLAG_ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#0ea5e9',
  roughness: 0.38,
});

const BENCH_SEAT_GEOM = new THREE.BoxGeometry(1.28, 0.07, 0.42);
const BENCH_BACK_GEOM = new THREE.BoxGeometry(1.26, 0.28, 0.06);
const BENCH_LEG_GEOM = new THREE.BoxGeometry(0.07, 0.48, 0.44);
const BENCH_WOOD_MAT = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.6 });
const BENCH_IRON_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  metalness: 0.5,
  roughness: 0.4,
});

const LAMP_BASE_GEOM = new THREE.CylinderGeometry(0.18, 0.26, 0.34, 10);
const LAMP_POLE_GEOM = new THREE.CylinderGeometry(0.05, 0.075, 2.65, 10);
const LAMP_HOOD_GEOM = new THREE.ConeGeometry(0.36, 0.2, 12);
const LAMP_BULB_GEOM = new THREE.SphereGeometry(0.22, 10, 10);
const LAMP_POOL_GEOM = new THREE.CircleGeometry(1.55, 20);
const LAMP_POLE_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  metalness: 0.65,
  roughness: 0.32,
});
const LAMP_BULB_MAT = new THREE.MeshBasicMaterial({ color: '#fde68a' });
const LAMP_POOL_MAT = new THREE.MeshBasicMaterial({
  color: '#fef08a',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});

// Stylized 3D City Horizon & Distant Hills Instanced Geometries & Materials
const CITY_TOWER_GEOM = new THREE.BoxGeometry(1, 1, 1);
const CITY_CROWN_GEOM = new THREE.BoxGeometry(0.82, 0.16, 0.82);
const HORIZON_HILL_GEOM = new THREE.DodecahedronGeometry(1, 1);
const CITY_TOWER_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.72,
  metalness: 0.12,
});
const CITY_CROWN_MAT = new THREE.MeshStandardMaterial({
  color: '#94a3b8',
  roughness: 0.6,
});
const HORIZON_HILL_MAT = new THREE.MeshStandardMaterial({
  color: '#86efac',
  roughness: 0.85,
  flatShading: true,
});

const PLANTER_BOX_GEOM = new THREE.BoxGeometry(1.52, 0.48, 1.52);
const PLANTER_SOIL_GEOM = new THREE.BoxGeometry(1.3, 0.08, 1.3);
const PLANTER_BOX_MAT = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.65 });
const PLANTER_SOIL_MAT = new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.9 });

export const Environment: React.FC<EnvironmentProps> = React.memo(
  ({ onGroundClick, clickMarker }) => {
    const width = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const depth = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;

    const sculptureRef = useRef<THREE.Group>(null);
    const outerRingRef = useRef<THREE.Mesh>(null);
    const markerGroupRef = useRef<THREE.Group>(null);

    const plazaTileTexture = useMemo(() => createPlazaTileTexture(), []);
    const plazaMedallionTexture = useMemo(() => createPlazaMedallionTexture(), []);

    const plazaBannerTexture = useMemo(
      () =>
        createBannerSignTexture({
          title: '🌐 QUẢNG TRƯỜNG TRUNG TÂM',
          subtitle: 'Virtual Expo 2.5D · Giao lộ 6 Gian hàng Thương mại',
          accentColor: '#38bdf8',
        }),
      []
    );

    const entranceBannerTexture = useMemo(
      () =>
        createBannerSignTexture({
          title: '✨ CỔNG CHÀO VIRTUAL EXPO 2.5D ✨',
          subtitle: 'Chào mừng khách tham quan · Bấm vào gian hàng để mở Cửa hàng 3D',
          accentColor: '#0ea5e9',
        }),
      []
    );

    const directoryKioskTexture = useMemo(
      () =>
        createBannerSignTexture({
          title: '🗺️ BẢNG THÔNG TIN TRIỂN LÃM',
          subtitle: '6 Gian hàng Chính hãng · Công nghệ · Nội thất · Cà phê · Robot · Thiết kế · Năng lượng',
          accentColor: '#fbbf24',
        }),
      []
    );

    const wayfindingTextures = useMemo(
      () =>
        CENTRAL_PLANTER_ISLANDS.map((island) =>
          island.signText
            ? createBannerSignTexture({
                title: island.signText.title,
                subtitle: island.signText.subtitle,
                accentColor: island.signText.color,
              })
            : null
        ),
      []
    );

    useEffect(() => {
      return () => {
        plazaTileTexture.dispose();
        plazaMedallionTexture.dispose();
        plazaBannerTexture.dispose();
        entranceBannerTexture.dispose();
        directoryKioskTexture.dispose();
        wayfindingTextures.forEach((tex) => tex?.dispose());
      };
    }, [
      plazaTileTexture,
      plazaMedallionTexture,
      plazaBannerTexture,
      entranceBannerTexture,
      directoryKioskTexture,
      wayfindingTextures,
    ]);

    useFrame(({ clock }, delta) => {
      const t = clock.getElapsedTime();
      if (sculptureRef.current) {
        sculptureRef.current.rotation.y += delta * 0.55;
        sculptureRef.current.position.y = 1.65 + Math.sin(t * 2.0) * 0.08;
      }
      if (outerRingRef.current) {
        outerRingRef.current.rotation.z = t * 0.4;
        outerRingRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 1.3) * 0.22;
      }
      if (markerGroupRef.current) {
        const pulse = 1 + Math.sin(t * 6) * 0.14;
        markerGroupRef.current.scale.set(pulse, 1, pulse);
      }
    });

    return (
      <group>
        {/* ================================================================
            0. STYLIZED 3D CITY PARKLAND & SKYLINE BACKDROP (Zero Collision)
           ================================================================ */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]}>
          <planeGeometry args={[156, 156]} />
          <meshStandardMaterial color="#bbf7d0" roughness={0.92} />
        </mesh>

        {/* Instanced Distant Rolling Hills */}
        <Instances geometry={HORIZON_HILL_GEOM} material={HORIZON_HILL_MAT}>
          {HORIZON_HILLS.map((h, i) => (
            <Instance
              key={`hill-${i}`}
              position={[h.x, h.sy * 0.22 - 0.6, h.z]}
              scale={[h.sx, h.sy, h.sz]}
            />
          ))}
        </Instances>

        {/* Instanced Stylized 3D City Background Buildings */}
        <Instances geometry={CITY_TOWER_GEOM} material={CITY_TOWER_MAT}>
          {STYLIZED_CITY_BUILDINGS.map((b, i) => (
            <Instance
              key={`ctower-${i}`}
              position={[b.x, b.sy / 2 - 0.65, b.z]}
              scale={[b.sx, b.sy, b.sz]}
            />
          ))}
        </Instances>
        <Instances geometry={CITY_CROWN_GEOM} material={CITY_CROWN_MAT}>
          {STYLIZED_CITY_BUILDINGS.map((b, i) => (
            <Instance
              key={`ccrown-${i}`}
              position={[b.x, b.sy - 0.55, b.z]}
              scale={[b.sx, 1, b.sz]}
            />
          ))}
        </Instances>

        {/* ================================================================
            1. MULTI-TIERED ARCHITECTURAL FOUNDATION PODIUM & TILED COURTYARD
           ================================================================ */}
        <mesh position={[0, -0.65, 0]}>
          <boxGeometry args={[width + 5.5, 1.1, depth + 5.5]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>

        <mesh position={[0, -0.14, 0]}>
          <boxGeometry args={[width + 2.2, 0.24, depth + 2.2]} />
          <meshStandardMaterial color="#64748b" roughness={0.68} />
        </mesh>

        <mesh position={[0, -0.03, 0]}>
          <boxGeometry args={[width + 0.6, 0.05, depth + 0.6]} />
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>

        {/* Interactive Main Courtyard Ground Plane with Seamless Stone Tile Texture */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onGroundClick(e.point);
          }}
        >
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial map={plazaTileTexture} color="#f8fafc" roughness={0.72} />
        </mesh>

        {/* ================================================================
            2. STRUCTURED WALKWAY, BOULEVARD & 6 RADIAL CENTRAL PLAZA AVENUES
           ================================================================ */}
        <group position={[0, 0.014, 1.5]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[5.8, depth - 3.6]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.58} />
          </mesh>
          <mesh position={[-2.95, 0.018, 0]}>
            <boxGeometry args={[0.22, 0.036, depth - 3.6]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.45} />
          </mesh>
          <mesh position={[2.95, 0.018, 0]}>
            <boxGeometry args={[0.22, 0.036, depth - 3.6]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.45} />
          </mesh>
        </group>

        <group position={[0, 0.016, -0.5]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[width - 3.6, 5.6]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.58} />
          </mesh>
          <mesh position={[0, 0.018, -2.85]}>
            <boxGeometry args={[width - 3.6, 0.036, 0.22]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.018, 2.85]}>
            <boxGeometry args={[width - 3.6, 0.036, 0.22]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.45} />
          </mesh>
        </group>

        {/* 6 Radial Avenues from Central Plaza Ring to All 6 Booth Entrances */}
        {BOOTH_CONNECTOR_PATHS.map((conn, idx) => (
          <group
            key={`conn-${idx}`}
            position={[conn.x, 0.013, conn.z]}
            rotation={[0, conn.ry, 0]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[conn.w, conn.d]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.62} />
            </mesh>
            <mesh position={[-conn.w / 2, 0.016, 0]}>
              <boxGeometry args={[0.16, 0.032, conn.d]} />
              <meshBasicMaterial color={conn.accent} />
            </mesh>
            <mesh position={[conn.w / 2, 0.016, 0]}>
              <boxGeometry args={[0.16, 0.032, conn.d]} />
              <meshBasicMaterial color={conn.accent} />
            </mesh>
          </group>
        ))}

        {/* Entrance Welcome Carpet */}
        <group position={[0, 0.02, 18.6]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[4.8, 4.8]} />
            <meshStandardMaterial color="#0284c7" roughness={0.62} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <planeGeometry args={[4.2, 4.3]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.55} />
          </mesh>
        </group>

        {/* ================================================================
            3. CENTRAL PLAZA COMPASS MEDALLION & LOW ARCHITECTURAL CENTERPIECE
           ================================================================ */}
        <group position={[0, 0, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]} receiveShadow>
            <circleGeometry args={[8.2, 48]} />
            <meshStandardMaterial map={plazaMedallionTexture} roughness={0.52} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]}>
            <ringGeometry args={[7.15, 7.5, 48]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.82} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]}>
            <ringGeometry args={[5.35, 5.55, 48]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.88} />
          </mesh>

          <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[2.1, 2.3, 0.36, 24]} />
            <meshStandardMaterial color="#334155" roughness={0.48} />
          </mesh>
          <mesh position={[0, 0.39, 0]} receiveShadow>
            <cylinderGeometry args={[1.88, 1.98, 0.12, 24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <cylinderGeometry args={[1.72, 1.72, 0.05, 24]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0284c7"
              emissiveIntensity={0.42}
              roughness={0.14}
              metalness={0.45}
            />
          </mesh>

          <mesh position={[0, 0.82, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.62, 0.72, 8]} />
            <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.4} />
          </mesh>

          <group ref={sculptureRef} position={[0, 1.65, 0]}>
            <mesh castShadow>
              <octahedronGeometry args={[0.72, 0]} />
              <meshStandardMaterial
                color="#0ea5e9"
                emissive="#0284c7"
                emissiveIntensity={0.3}
                metalness={0.65}
                roughness={0.18}
                flatShading
              />
            </mesh>
            <mesh rotation={[0, Math.PI / 4, 0]}>
              <octahedronGeometry args={[0.88, 0]} />
              <meshStandardMaterial color="#f8fafc" wireframe />
            </mesh>
          </group>

          <mesh ref={outerRingRef} position={[0, 1.65, 0]}>
            <torusGeometry args={[1.05, 0.04, 10, 32]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.2} />
          </mesh>

          <Billboard position={[0, 3.05, 0]}>
            <mesh>
              <planeGeometry args={[4.2, 0.88]} />
              <meshBasicMaterial map={plazaBannerTexture} transparent depthWrite={false} />
            </mesh>
          </Billboard>
        </group>

        {/* ================================================================
            4. GRAND SOUTH ENTRANCE ARCHWAY & INFO DIRECTORY KIOSK (Z = 21)
           ================================================================ */}
        <group position={[0, 0, 21]}>
          {[-4.4, 4.4].map((px, i) => (
            <group key={`arch-pillar-${i}`} position={[px, 0, 0]}>
              <mesh position={[0, 0.4, 0]} receiveShadow>
                <boxGeometry args={[1.55, 0.8, 1.55]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
              </mesh>
              <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.22, 4.6, 1.22]} />
                <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.3} />
              </mesh>
              <mesh position={[0, 2.5, 0.63]}>
                <boxGeometry args={[0.16, 3.8, 0.04]} />
                <meshBasicMaterial color="#38bdf8" />
              </mesh>
              <mesh position={[0, 2.5, -0.63]}>
                <boxGeometry args={[0.16, 3.8, 0.04]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
            </group>
          ))}

          {/* Flanking Entrance Flower Beds */}
          {[-6.4, 6.4].map((fx, i) => (
            <group key={`gate-flowerbed-${i}`} position={[fx, 0.16, -0.1]}>
              <mesh receiveShadow material={PLANTER_BOX_MAT}>
                <boxGeometry args={[1.6, 0.32, 1.1]} />
              </mesh>
              <mesh position={[0, 0.18, 0]} material={PLANTER_SOIL_MAT}>
                <boxGeometry args={[1.4, 0.06, 0.92]} />
              </mesh>
            </group>
          ))}

          <mesh position={[0, 4.95, 0]} castShadow receiveShadow>
            <boxGeometry args={[12.2, 0.95, 1.85]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.4} />
          </mesh>

          <mesh position={[0, 5.55, 0]}>
            <boxGeometry args={[13.0, 0.28, 2.3]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.3} metalness={0.25} />
          </mesh>

          <mesh position={[0, 4.45, 0]}>
            <boxGeometry args={[7.8, 0.09, 0.48]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>

          <Billboard position={[0, 6.48, 0]}>
            <mesh>
              <planeGeometry args={[6.6, 1.36]} />
              <meshBasicMaterial map={entranceBannerTexture} transparent depthWrite={false} />
            </mesh>
          </Billboard>
        </group>

        {/* Exhibition Directory Info Board Kiosk (East of Entrance Gate) */}
        <group position={[6.4, 0, 18.8]} rotation={[0, -0.35, 0]}>
          <mesh position={[0, 0.12, 0]} material={BENCH_IRON_MAT}>
            <boxGeometry args={[1.4, 0.24, 0.52]} />
          </mesh>
          <mesh position={[0, 1.15, 0]} material={LAMP_POLE_MAT}>
            <boxGeometry args={[1.18, 1.85, 0.18]} />
          </mesh>
          <Billboard position={[0, 2.45, 0]}>
            <mesh>
              <planeGeometry args={[3.8, 0.8]} />
              <meshBasicMaterial map={directoryKioskTexture} transparent depthWrite={false} />
            </mesh>
          </Billboard>
        </group>

        {/* ================================================================
            5. CENTRAL PLANTER ISLANDS & WAYFINDING SIGNS
           ================================================================ */}
        {CENTRAL_PLANTER_ISLANDS.map((island, idx) => {
          const signTexture = wayfindingTextures[idx];
          return (
            <group key={`planter-island-${idx}`} position={[island.x, 0, island.z]}>
              <mesh
                geometry={PLANTER_BOX_GEOM}
                material={PLANTER_BOX_MAT}
                position={[0, 0.24, 0]}
                castShadow
                receiveShadow
              />
              <mesh
                geometry={PLANTER_SOIL_GEOM}
                material={PLANTER_SOIL_MAT}
                position={[0, 0.5, 0]}
              />
              {signTexture && (
                <Billboard position={[0, 3.65, 0]}>
                  <mesh>
                    <planeGeometry args={[3.6, 0.76]} />
                    <meshBasicMaterial map={signTexture} transparent depthWrite={false} />
                  </mesh>
                </Billboard>
              )}
            </group>
          );
        })}

        {/* ================================================================
            6. INSTANCED TREES, FLOWER BUSHES, LOUNGE PAVILIONS, BENCHES & LAMPS
           ================================================================ */}
        {/* 12 Instanced Trees (4 draw calls total) */}
        <Instances geometry={TREE_TRUNK_GEOM} material={TREE_TRUNK_MAT} castShadow>
          {ALL_TREES.map((t, i) => (
            <Instance
              key={`trunk-${i}`}
              position={[t.x, 0.95 * t.scale, t.z]}
              scale={[t.scale, t.scale, t.scale]}
            />
          ))}
        </Instances>
        <Instances geometry={TREE_LOW_GEOM} material={TREE_LOW_MAT} castShadow>
          {ALL_TREES.map((t, i) => (
            <Instance
              key={`low-${i}`}
              position={[t.x, 1.85 * t.scale, t.z]}
              scale={[t.scale, t.scale, t.scale]}
            />
          ))}
        </Instances>
        <Instances geometry={TREE_MID_GEOM} material={TREE_MID_MAT}>
          {ALL_TREES.map((t, i) => (
            <Instance
              key={`mid-${i}`}
              position={[t.x + 0.24 * t.scale, 2.42 * t.scale, t.z - 0.16 * t.scale]}
              scale={[t.scale, t.scale, t.scale]}
            />
          ))}
        </Instances>
        <Instances geometry={TREE_TOP_GEOM} material={TREE_TOP_MAT}>
          {ALL_TREES.map((t, i) => (
            <Instance
              key={`top-${i}`}
              position={[t.x - 0.18 * t.scale, 2.82 * t.scale, t.z + 0.14 * t.scale]}
              scale={[t.scale, t.scale, t.scale]}
            />
          ))}
        </Instances>

        {/* Instanced Colorful Flower Bushes & Blossoms in Planters (3 draw calls total) */}
        <Instances geometry={FLOWER_BUSH_GEOM} material={TREE_MID_MAT}>
          {[...FLOWER_CLUSTERS_PINK, ...FLOWER_CLUSTERS_GOLD].map(([fx, fy, fz], i) => (
            <Instance key={`fbush-${i}`} position={[fx, fy, fz]} />
          ))}
        </Instances>
        <Instances geometry={FLOWER_BLOSSOM_GEOM} material={FLOWER_PINK_MAT}>
          {FLOWER_CLUSTERS_PINK.map(([fx, fy, fz], i) => (
            <Instance key={`fpink-${i}`} position={[fx, fy + 0.18, fz]} />
          ))}
        </Instances>
        <Instances geometry={FLOWER_BLOSSOM_GEOM} material={FLOWER_GOLD_MAT}>
          {FLOWER_CLUSTERS_GOLD.map(([fx, fy, fz], i) => (
            <Instance key={`fgold-${i}`} position={[fx, fy + 0.18, fz]} />
          ))}
        </Instances>

        {/* 4 Instanced Perimeter Rest Lounge Pavilions (Tables & Parasol Umbrellas) */}
        <Instances geometry={LOUNGE_TABLE_BASE_GEOM} material={BENCH_IRON_MAT}>
          {REST_LOUNGE_ZONES.map((z, i) => (
            <Instance key={`ltbase-${i}`} position={[z.x, 0.36, z.z]} />
          ))}
        </Instances>
        <Instances geometry={LOUNGE_TABLE_TOP_GEOM} material={TABLE_WHITE_MAT}>
          {REST_LOUNGE_ZONES.map((z, i) => (
            <Instance key={`lttop-${i}`} position={[z.x, 0.74, z.z]} />
          ))}
        </Instances>
        <Instances geometry={PARASOL_POLE_GEOM} material={LAMP_POLE_MAT}>
          {REST_LOUNGE_ZONES.map((z, i) => (
            <Instance key={`ppole-${i}`} position={[z.x, 1.18, z.z]} />
          ))}
        </Instances>
        <Instances geometry={PARASOL_CANOPY_GEOM} material={PARASOL_CREAM_MAT}>
          {REST_LOUNGE_ZONES.map((z, i) => (
            <Instance key={`pcanopy-${i}`} position={[z.x, 2.38, z.z]} />
          ))}
        </Instances>

        {/* 8 Instanced Perimeter Festival Flag Totems */}
        <Instances geometry={FLAG_POLE_GEOM} material={LAMP_POLE_MAT}>
          {FESTIVAL_TOTEMS.map((f, i) => (
            <Instance key={`fpole-${i}`} position={[f.x, 1.8, f.z]} />
          ))}
        </Instances>
        <Instances geometry={FLAG_BANNER_GEOM} material={FLAG_ACCENT_MAT}>
          {FESTIVAL_TOTEMS.map((f, i) => (
            <Instance
              key={`fbanner-${i}`}
              position={[f.x + (f.x < 0 ? 0.28 : -0.28), 2.65, f.z]}
              rotation={[0, f.ry, 0]}
            />
          ))}
        </Instances>

        {/* 8 Instanced Perimeter Tree Planter Bases */}
        <Instances geometry={TREE_BASE_GEOM} material={SLATE_POT_MAT} receiveShadow>
          {PERIMETER_TREES.map(([tx, tz], i) => (
            <Instance key={`tbase-${i}`} position={[tx, 0.22, tz]} />
          ))}
        </Instances>

        {/* 8 Instanced Park Benches */}
        <Instances geometry={BENCH_SEAT_GEOM} material={BENCH_WOOD_MAT} castShadow>
          {ALL_BENCHES.map((b, i) => (
            <Instance
              key={`bseat-${i}`}
              position={[b.x, 0.34, b.z]}
              rotation={[0, b.rotationY, 0]}
            />
          ))}
        </Instances>
        <Instances geometry={BENCH_BACK_GEOM} material={BENCH_WOOD_MAT}>
          {ALL_BENCHES.map((b, i) => {
            const sin = Math.sin(b.rotationY);
            const cos = Math.cos(b.rotationY);
            return (
              <Instance
                key={`bback-${i}`}
                position={[b.x - sin * 0.17, 0.56, b.z - cos * 0.17]}
                rotation={[0, b.rotationY, 0]}
              />
            );
          })}
        </Instances>
        <Instances geometry={BENCH_LEG_GEOM} material={BENCH_IRON_MAT}>
          {ALL_BENCHES.flatMap((b, i) => {
            const cos = Math.cos(b.rotationY);
            const sin = Math.sin(b.rotationY);
            return [
              <Instance
                key={`bleg-l-${i}`}
                position={[b.x - cos * 0.54, 0.24, b.z + sin * 0.54]}
                rotation={[0, b.rotationY, 0]}
              />,
              <Instance
                key={`bleg-r-${i}`}
                position={[b.x + cos * 0.54, 0.24, b.z - sin * 0.54]}
                rotation={[0, b.rotationY, 0]}
              />,
            ];
          })}
        </Instances>

        {/* 8 Instanced Boulevard Lamp Posts with Metallic Hoods & Warm Ground Light Pools */}
        <Instances geometry={LAMP_BASE_GEOM} material={BENCH_IRON_MAT}>
          {PERIMETER_LAMPS.map(([lx, lz], i) => (
            <Instance key={`lbase-${i}`} position={[lx, 0.15, lz]} />
          ))}
        </Instances>
        <Instances geometry={LAMP_POLE_GEOM} material={LAMP_POLE_MAT} castShadow>
          {PERIMETER_LAMPS.map(([lx, lz], i) => (
            <Instance key={`lpole-${i}`} position={[lx, 1.55, lz]} />
          ))}
        </Instances>
        <Instances geometry={LAMP_BULB_GEOM} material={LAMP_BULB_MAT}>
          {PERIMETER_LAMPS.map(([lx, lz], i) => (
            <Instance key={`lbulb-${i}`} position={[lx, 2.95, lz]} />
          ))}
        </Instances>
        <Instances geometry={LAMP_HOOD_GEOM} material={LAMP_POLE_MAT}>
          {PERIMETER_LAMPS.map(([lx, lz], i) => (
            <Instance key={`lhood-${i}`} position={[lx, 3.12, lz]} />
          ))}
        </Instances>
        <Instances geometry={LAMP_POOL_GEOM} material={LAMP_POOL_MAT}>
          {PERIMETER_LAMPS.map(([lx, lz], i) => (
            <Instance
              key={`lpool-${i}`}
              position={[lx, 0.019, lz]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          ))}
        </Instances>

        {/* Perimeter Balustrades */}
        <mesh position={[0, 0.45, WORLD_BOUNDS.minZ]} receiveShadow>
          <boxGeometry args={[width, 0.9, 0.28]} />
          <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[WORLD_BOUNDS.minX, 0.45, 0]} receiveShadow>
          <boxGeometry args={[0.28, 0.9, depth]} />
          <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[WORLD_BOUNDS.maxX, 0.45, 0]} receiveShadow>
          <boxGeometry args={[0.28, 0.9, depth]} />
          <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[-14.8, 0.38, WORLD_BOUNDS.maxZ]} receiveShadow>
          <boxGeometry args={[18.4, 0.76, 0.28]} />
          <meshStandardMaterial color="#475569" roughness={0.45} />
        </mesh>
        <mesh position={[14.8, 0.38, WORLD_BOUNDS.maxZ]} receiveShadow>
          <boxGeometry args={[18.4, 0.76, 0.28]} />
          <meshStandardMaterial color="#475569" roughness={0.45} />
        </mesh>

        {/* ================================================================
            7. CLICK-TO-MOVE TARGET INDICATOR
           ================================================================ */}
        {clickMarker && (
          <group ref={markerGroupRef} position={[clickMarker.x, 0.04, clickMarker.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.56, 28]} />
              <meshBasicMaterial color="#f59e0b" />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.18, 20]} />
              <meshBasicMaterial color="#fde68a" />
            </mesh>
            <mesh position={[0, 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
              <octahedronGeometry args={[0.16, 0]} />
              <meshBasicMaterial color="#f59e0b" />
            </mesh>
          </group>
        )}
      </group>
    );
  }
);
