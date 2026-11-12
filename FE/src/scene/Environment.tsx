import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_BOUNDS } from '../types/expo';
import {
  createAsphaltBumpTexture,
  createAsphaltRoadTexture,
  createBannerSignTexture,
  createCityBuildingFacadeTexture,
  createCrosswalkTexture,
  createPlazaMedallionTexture,
  createPlazaTileBumpTexture,
  createPlazaTileTexture,
  createSidewalkPaverTexture,
  createSkyDomeTexture,
} from './sceneTextures';
import { cloneCachedAsset, type GlbAssetId } from './assetLoader';

export interface EnvironmentProps {
  onGroundClick: (point: THREE.Vector3) => void;
  clickMarker: { x: number; z: number } | null;
}

export interface PlanterIslandConfig {
  x: number;
  z: number;
  benchOffsetZ: number;
  signPos: [number, number];
  signText?: { title: string; subtitle: string; color: string };
}

export const CENTRAL_PLANTER_ISLANDS: PlanterIslandConfig[] = [
  {
    x: -6,
    z: -5,
    benchOffsetZ: 0.62,
    signPos: [-5.6, -18.2],
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
    signPos: [5.6, -18.2],
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
    signPos: [-5.6, 18.2],
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
    signPos: [5.6, 18.2],
    signText: {
      title: '↘ KHU THIẾT KẾ & NĂNG LƯỢNG',
      subtitle: 'Lumina Design · Solaris Energy',
      color: '#ec4899',
    },
  },
];

// Task A: Perimeter & Avenue Trees positioned strictly along outer boulevard edges, street corners,
// and side gaps between booths — ZERO trees placed in front of the 6 booths so all facades,
// entrance doors, signboards, and radial walkways remain 100% unobstructed.
export const PERIMETER_TREES: [number, number, number][] = [
  [-20.5, -18.5, 1.18],
  [20.5, -18.5, 1.15],
  [-20.5, 18.5, 1.12],
  [20.5, 18.5, 1.16],
  [-21.4, 0.0, 1.22],
  [21.4, 0.0, 1.22],
  [-7.5, -20.2, 1.05],
  [7.5, -20.2, 1.05],
  [-9.2, 20.2, 1.08],
  [9.2, 20.2, 1.08],
];

export const ALL_TREES: {
  x: number;
  z: number;
  scale: number;
  ry: number;
  assetId: GlbAssetId;
}[] = [
  ...PERIMETER_TREES.map(([x, z, scale], idx) => ({
    x,
    z,
    scale,
    ry: idx * 0.85,
    assetId: (
      idx % 3 === 0
        ? 'env-tree-pine'
        : idx % 3 === 1
          ? 'env-tree-oak'
          : 'env-tree-blossom'
    ) as GlbAssetId,
  })),
  // Outer parkland trees framing the avenue outside the courtyard (zero collision)
  { x: -26.5, z: -12, scale: 1.38, ry: 0.4, assetId: 'env-tree-pine' },
  { x: 26.5, z: -12, scale: 1.38, ry: 1.8, assetId: 'env-tree-pine' },
  { x: -26.5, z: 8, scale: 1.32, ry: 2.1, assetId: 'env-tree-oak' },
  { x: 26.5, z: 8, scale: 1.32, ry: 0.9, assetId: 'env-tree-oak' },
  { x: -27.2, z: -2.5, scale: 1.25, ry: 1.3, assetId: 'env-tree-blossom' },
  { x: 27.2, z: 2.5, scale: 1.25, ry: 2.7, assetId: 'env-tree-blossom' },
];

export const PLANTER_URN_POSITIONS: [number, number][] = [
  [-5.8, 19.6],
  [5.8, 19.6],
  [-5.8, -19.2],
  [5.8, -19.2],
  [-18.8, -3.2],
  [18.8, -3.2],
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

export const PERIMETER_LAMPS: [number, number][] = [
  [-5.6, 17.2],
  [5.6, 17.2],
  [-5.6, -17.2],
  [5.6, -17.2],
  [-18.4, -3.6],
  [18.4, -3.6],
  [-18.4, 3.6],
  [18.4, 3.6],
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

// Stylized 3D City Background Skyline Silhouettes with Stepped Setback Facades
const STYLIZED_CITY_BUILDINGS: {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  setbackY?: number;
  setbackSx?: number;
  setbackSz?: number;
}[] = [
  { x: -32, z: -31, sx: 7.2, sy: 11.2, sz: 6.2, setbackY: 8.2, setbackSx: 5.4, setbackSz: 4.8 },
  { x: -23, z: -33, sx: 6.4, sy: 14.5, sz: 5.8, setbackY: 10.5, setbackSx: 4.8, setbackSz: 4.2 },
  { x: -13, z: -34, sx: 7.5, sy: 10.2, sz: 6.0, setbackY: 7.5, setbackSx: 5.6, setbackSz: 4.6 },
  { x: 0, z: -35, sx: 8.2, sy: 16.2, sz: 6.5, setbackY: 12.0, setbackSx: 6.2, setbackSz: 4.8 },
  { x: 13, z: -34, sx: 7.2, sy: 11.5, sz: 6.0, setbackY: 8.5, setbackSx: 5.2, setbackSz: 4.5 },
  { x: 23, z: -33, sx: 6.4, sy: 13.8, sz: 5.8, setbackY: 9.8, setbackSx: 4.6, setbackSz: 4.2 },
  { x: 32, z: -31, sx: 7.2, sy: 10.5, sz: 6.2, setbackY: 7.8, setbackSx: 5.4, setbackSz: 4.8 },
  { x: -34, z: -18, sx: 6.2, sy: 12.5, sz: 6.8, setbackY: 9.2, setbackSx: 4.8, setbackSz: 5.2 },
  { x: -35, z: -6, sx: 6.4, sy: 9.8, sz: 6.5, setbackY: 7.2, setbackSx: 4.8, setbackSz: 4.8 },
  { x: -34, z: 7, sx: 6.2, sy: 11.2, sz: 6.5, setbackY: 8.4, setbackSx: 4.6, setbackSz: 5.0 },
  { x: 34, z: -18, sx: 6.2, sy: 11.5, sz: 6.8, setbackY: 8.5, setbackSx: 4.8, setbackSz: 5.2 },
  { x: 35, z: -6, sx: 6.4, sy: 9.4, sz: 6.5, setbackY: 7.0, setbackSx: 4.8, setbackSz: 4.8 },
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

// Colorful Flower Clusters placed inside low-profile central planters & entrance beds
const FLOWER_CLUSTERS_PINK: [number, number, number][] = [
  [-6.35, 0.46, -5.35],
  [-5.65, 0.46, -4.65],
  [6.35, 0.46, -5.35],
  [5.65, 0.46, -4.65],
  [-6.35, 0.46, 5.35],
  [6.35, 0.46, 5.35],
  [-6.2, 0.42, 20.8],
  [6.2, 0.42, 20.8],
];

const FLOWER_CLUSTERS_GOLD: [number, number, number][] = [
  [-6.35, 0.46, -4.65],
  [6.35, 0.46, -4.65],
  [-5.65, 0.46, 5.35],
  [-6.35, 0.46, 4.65],
  [5.65, 0.46, 5.35],
  [6.35, 0.46, 4.65],
  [-6.6, 0.42, 21.1],
  [6.6, 0.42, 21.1],
];

// Shared module-level Geometries & Materials to minimize WebGL memory & state switches
const TREE_BASE_GEOM = new THREE.CylinderGeometry(0.85, 0.95, 0.44, 16);

const FLOWER_BUSH_GEOM = new THREE.DodecahedronGeometry(0.24, 1);
const FLOWER_BLOSSOM_GEOM = new THREE.IcosahedronGeometry(0.15, 1);

const PARASOL_POLE_GEOM = new THREE.CylinderGeometry(0.05, 0.06, 2.35, 10);
const PARASOL_CANOPY_GEOM = new THREE.ConeGeometry(1.55, 0.58, 12);
const LOUNGE_TABLE_TOP_GEOM = new THREE.CylinderGeometry(0.68, 0.68, 0.07, 16);
const LOUNGE_TABLE_BASE_GEOM = new THREE.CylinderGeometry(0.12, 0.34, 0.72, 12);

const FLAG_POLE_GEOM = new THREE.CylinderGeometry(0.04, 0.06, 3.6, 10);
const FLAG_BANNER_GEOM = new THREE.BoxGeometry(0.04, 1.45, 0.58);

// Instanced Exhibition Street Furniture: Illuminated Bollards, Recycling Bins & Wayfinding Posts
const BOLLARD_BODY_GEOM = new THREE.CylinderGeometry(0.11, 0.13, 0.78, 12);
const BOLLARD_GLOW_GEOM = new THREE.CylinderGeometry(0.115, 0.115, 0.14, 12);
const BIN_BODY_GEOM = new THREE.CylinderGeometry(0.2, 0.17, 0.64, 12);
const BIN_TOP_GEOM = new THREE.CylinderGeometry(0.22, 0.21, 0.08, 12);
const SIGNPOST_POLE_GEOM = new THREE.CylinderGeometry(0.055, 0.07, 2.05, 10);

export const PLAZA_BOLLARD_POSITIONS: [number, number][] = [
  [-4.8, 18.8],
  [4.8, 18.8],
  [-5.2, 16.2],
  [5.2, 16.2],
  [-12.2, -2.6],
  [-12.2, 2.6],
  [12.2, -2.6],
  [12.2, 2.6],
  [-17.4, -18.2],
  [17.4, -18.2],
];

export const EXHIBITION_BIN_POSITIONS: [number, number][] = [
  [-5.6, -17.6],
  [5.6, -17.6],
  [-5.6, 17.6],
  [5.6, 17.6],
  [-17.6, -15.5],
  [17.6, -15.5],
  [-17.6, 14.8],
  [17.6, 14.8],
];

const BOLLARD_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const BIN_BODY_MAT = new THREE.MeshStandardMaterial({
  color: '#334155',
  roughness: 0.42,
  metalness: 0.35,
});
const BIN_TOP_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.35,
  metalness: 0.2,
});

const TREE_MID_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.6,
});
const SLATE_POT_MAT = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.65 });

const FLOWER_PINK_MAT = new THREE.MeshStandardMaterial({
  color: '#f43f5e',
  roughness: 0.45,
});
const FLOWER_GOLD_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  roughness: 0.4,
});

const PARASOL_CREAM_MAT = new THREE.MeshStandardMaterial({
  color: '#fffbeb',
  roughness: 0.45,
});
const TABLE_WHITE_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.3,
});
const FLAG_ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#0ea5e9',
  roughness: 0.38,
});

const BENCH_IRON_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  metalness: 0.5,
  roughness: 0.4,
});

const LAMP_POOL_GEOM = new THREE.CircleGeometry(1.65, 24);
const LAMP_POLE_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  metalness: 0.65,
  roughness: 0.32,
});
const LAMP_POOL_MAT = new THREE.MeshBasicMaterial({
  color: '#fef08a',
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
});

// Stylized 3D City Horizon & Distant Hills Instanced Geometries & Materials
const CITY_TOWER_GEOM = new THREE.BoxGeometry(1, 1, 1);
const CITY_CROWN_GEOM = new THREE.ConeGeometry(0.72, 0.42, 4);
const HORIZON_HILL_GEOM = new THREE.IcosahedronGeometry(1, 2);
const CITY_CROWN_MAT = new THREE.MeshStandardMaterial({
  color: '#475569',
  roughness: 0.48,
  metalness: 0.25,
});
const HORIZON_HILL_MAT = new THREE.MeshStandardMaterial({
  color: '#86efac',
  roughness: 0.82,
});

const PLANTER_BOX_GEOM = new THREE.BoxGeometry(1.48, 0.36, 1.48);
const PLANTER_SOIL_GEOM = new THREE.BoxGeometry(1.26, 0.06, 1.26);
const PLANTER_BOX_MAT = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.65 });
const PLANTER_SOIL_MAT = new THREE.MeshStandardMaterial({ color: '#065f46', roughness: 0.9 });
const CURB_STONE_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.52,
  metalness: 0.08,
});

// Stylized 3D City Asphalt Road Network Segments (Outside Central Pedestrian Plaza r = 8.4m)
const ASPHALT_ROAD_SEGMENTS: {
  x: number;
  z: number;
  w: number;
  length: number;
  ry: number;
}[] = [
  // South Grand Entrance Boulevard (from Entrance Gate z=21.4 to South Plaza edge z=8.4)
  { x: 0, z: 14.9, w: 5.4, length: 13.0, ry: 0 },
  // West Cross-Avenue (from West perimeter x=-21.6 to West Plaza edge x=-8.4)
  { x: -15.0, z: 0, w: 5.2, length: 13.2, ry: Math.PI / 2 },
  // East Cross-Avenue (from East Plaza edge x=8.4 to East perimeter x=21.6)
  { x: 15.0, z: 0, w: 5.2, length: 13.2, ry: Math.PI / 2 },
  // Outer Perimeter Ring Road Segments (Stylized 3D City Boulevard loop)
  { x: 0, z: -19.8, w: 3.4, length: 42.4, ry: Math.PI / 2 },
  { x: -13.2, z: 19.8, w: 3.2, length: 16.0, ry: Math.PI / 2 },
  { x: 13.2, z: 19.8, w: 3.2, length: 16.0, ry: Math.PI / 2 },
  { x: -20.2, z: 0, w: 3.4, length: 36.2, ry: 0 },
  { x: 20.2, z: 0, w: 3.4, length: 36.2, ry: 0 },
];

// Zebra Crosswalks at Avenue & Plaza Intersections
const ZEBRA_CROSSWALKS: {
  x: number;
  z: number;
  w: number;
  d: number;
  ry: number;
}[] = [
  // 3 Main Avenue Crossings into Central Pedestrian Plaza
  { x: -9.5, z: 0, w: 4.8, d: 2.1, ry: Math.PI / 2 },
  { x: 9.5, z: 0, w: 4.8, d: 2.1, ry: Math.PI / 2 },
  { x: 0, z: 9.5, w: 5.0, d: 2.1, ry: 0 },
  // Grand South Entrance Gate Crossing
  { x: 0, z: 17.6, w: 5.0, d: 2.2, ry: 0 },
  // Outer Boulevard Pedestrian Crossings
  { x: -18.5, z: -3.2, w: 4.8, d: 1.9, ry: Math.PI / 2 },
  { x: 18.5, z: -3.2, w: 4.8, d: 1.9, ry: Math.PI / 2 },
  { x: -18.5, z: 3.2, w: 4.8, d: 1.9, ry: Math.PI / 2 },
  { x: 18.5, z: 3.2, w: 4.8, d: 1.9, ry: Math.PI / 2 },
];

export const Environment: React.FC<EnvironmentProps> = React.memo(
  ({ onGroundClick, clickMarker }) => {
    const width = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const depth = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;

    const sculptureRef = useRef<THREE.Group>(null);
    const outerRingRef = useRef<THREE.Mesh>(null);
    const markerGroupRef = useRef<THREE.Group>(null);

    const sidewalkPaverTexture = useMemo(() => createSidewalkPaverTexture(14, 14), []);
    const plazaTileTexture = useMemo(() => createPlazaTileTexture(), []);
    const plazaTileBumpTexture = useMemo(() => createPlazaTileBumpTexture(), []);
    const plazaMedallionTexture = useMemo(() => createPlazaMedallionTexture(), []);
    const asphaltRoadTexture = useMemo(() => createAsphaltRoadTexture(4), []);
    const asphaltBumpTexture = useMemo(() => createAsphaltBumpTexture(4), []);
    const crosswalkTexture = useMemo(() => createCrosswalkTexture(), []);
    const cityFacadeTexture = useMemo(() => createCityBuildingFacadeTexture(), []);
    const skyDomeTexture = useMemo(() => createSkyDomeTexture(), []);

    const cityTowerTexturedMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          map: cityFacadeTexture,
          color: '#f8fafc',
          roughness: 0.52,
          metalness: 0.18,
        }),
      [cityFacadeTexture]
    );

    const islandSignTextures = useMemo(
      () =>
        CENTRAL_PLANTER_ISLANDS.map((island) =>
          createBannerSignTexture({
            title: island.signText?.title || 'KHU TRIỂN LÃM',
            subtitle: island.signText?.subtitle || 'Virtual Expo Plaza',
            accentColor: island.signText?.color || '#0ea5e9',
          })
        ),
      []
    );

    const treeClones = useMemo(
      () => ALL_TREES.map((t) => ({ ...t, object: cloneCachedAsset(t.assetId) })),
      []
    );
    const benchClones = useMemo(
      () => ALL_BENCHES.map((b) => ({ ...b, object: cloneCachedAsset('env-park-bench') })),
      []
    );
    const lampClones = useMemo(
      () =>
        PERIMETER_LAMPS.map(([lx, lz]) => ({
          x: lx,
          z: lz,
          ry: Math.atan2(-lx, -lz),
          object: cloneCachedAsset('env-street-lamp'),
        })),
      []
    );
    const urnClones = useMemo(
      () =>
        PLANTER_URN_POSITIONS.map(([ux, uz]) => ({
          x: ux,
          z: uz,
          object: cloneCachedAsset('env-planter-urn'),
        })),
      []
    );

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

    useEffect(() => {
      return () => {
        sidewalkPaverTexture.dispose();
        plazaTileTexture.dispose();
        plazaTileBumpTexture.dispose();
        plazaMedallionTexture.dispose();
        asphaltRoadTexture.dispose();
        asphaltBumpTexture.dispose();
        crosswalkTexture.dispose();
        cityFacadeTexture.dispose();
        skyDomeTexture.dispose();
        cityTowerTexturedMat.dispose();
        islandSignTextures.forEach((tex) => tex.dispose());
        plazaBannerTexture.dispose();
        entranceBannerTexture.dispose();
        directoryKioskTexture.dispose();
      };
    }, [
      sidewalkPaverTexture,
      plazaTileTexture,
      plazaTileBumpTexture,
      plazaMedallionTexture,
      asphaltRoadTexture,
      asphaltBumpTexture,
      crosswalkTexture,
      cityFacadeTexture,
      skyDomeTexture,
      cityTowerTexturedMat,
      islandSignTextures,
      plazaBannerTexture,
      entranceBannerTexture,
      directoryKioskTexture,
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
            0. STYLIZED 3D CITY PARKLAND, SKY DOME & SKYLINE BACKDROP (Zero Collision)
           ================================================================ */}
        <mesh position={[0, -4, 0]}>
          <sphereGeometry args={[148, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
          <meshBasicMaterial map={skyDomeTexture} side={THREE.BackSide} fog={false} />
        </mesh>

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

        {/* Instanced Stylized 3D City Background Buildings with Architectural Facade Texture & Stepped Setbacks */}
        <Instances geometry={CITY_TOWER_GEOM} material={cityTowerTexturedMat}>
          {STYLIZED_CITY_BUILDINGS.map((b, i) => (
            <React.Fragment key={`ctower-grp-${i}`}>
              <Instance
                position={[b.x, b.sy / 2 - 0.65, b.z]}
                scale={[b.sx, b.sy, b.sz]}
              />
              {b.setbackY && b.setbackSx && b.setbackSz && (
                <Instance
                  position={[b.x, b.setbackY - 0.65 + (b.sy - b.setbackY) * 0.5, b.z]}
                  scale={[b.setbackSx, b.sy - b.setbackY + 1.8, b.setbackSz]}
                />
              )}
            </React.Fragment>
          ))}
        </Instances>
        <Instances geometry={CITY_CROWN_GEOM} material={CITY_CROWN_MAT}>
          {STYLIZED_CITY_BUILDINGS.map((b, i) => (
            <Instance
              key={`ccrown-${i}`}
              position={[b.x, b.sy + (b.setbackY ? 1.25 : 0) - 0.55, b.z]}
              scale={[b.setbackSx || b.sx, 1.2, b.setbackSz || b.sz]}
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

        {/* Interactive Main Courtyard Pedestrian Sidewalk Base with Running-Bond Paver Tiles & PBR Relief */}
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
          <meshStandardMaterial
            map={sidewalkPaverTexture}
            bumpMap={plazaTileBumpTexture}
            bumpScale={0.032}
            roughnessMap={plazaTileBumpTexture}
            color="#ffffff"
            roughness={0.62}
            metalness={0.04}
          />
        </mesh>

        {/* ================================================================
            2. STYLIZED 3D CITY ASPHALT ROAD NETWORK, ZEBRA CROSSWALKS,
               RAISED GRANITE CURBS & 6 TILED SIDEWALK PROMENADES
           ================================================================ */}
        {/* Stylized 3D City Asphalt Road Segments with White Shoulder Lines, Dashed Center Divider & Raised 3D Curbs */}
        {ASPHALT_ROAD_SEGMENTS.map((road, idx) => (
          <group
            key={`asphalt-road-${idx}`}
            position={[road.x, 0.011, road.z]}
            rotation={[0, road.ry, 0]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[road.w, road.length]} />
              <meshStandardMaterial
                map={asphaltRoadTexture}
                bumpMap={asphaltBumpTexture}
                bumpScale={0.022}
                roughnessMap={asphaltBumpTexture}
                roughness={0.78}
                metalness={0.05}
              />
            </mesh>
            {/* 3D Raised Granite Curbs (Bó vỉa hè) separating Asphalt Road from Tiled Sidewalks */}
            <mesh position={[-road.w / 2 - 0.14, 0.028, 0]} receiveShadow material={CURB_STONE_MAT}>
              <boxGeometry args={[0.28, 0.056, road.length]} />
            </mesh>
            <mesh position={[road.w / 2 + 0.14, 0.028, 0]} receiveShadow material={CURB_STONE_MAT}>
              <boxGeometry args={[0.28, 0.056, road.length]} />
            </mesh>
          </group>
        ))}

        {/* High-Contrast White Zebra Crosswalks at Avenue & Plaza Intersections */}
        {ZEBRA_CROSSWALKS.map((cw, idx) => (
          <mesh
            key={`crosswalk-${idx}`}
            position={[cw.x, 0.015, cw.z]}
            rotation={[-Math.PI / 2, 0, cw.ry]}
            receiveShadow
          >
            <planeGeometry args={[cw.w, cw.d]} />
            <meshStandardMaterial
              map={crosswalkTexture}
              bumpMap={asphaltBumpTexture}
              bumpScale={0.015}
              roughness={0.62}
              metalness={0.04}
            />
          </mesh>
        ))}

        {/* 6 Tiled Pedestrian Sidewalk Promenades from Central Plaza Ring to All 6 Booth Entrances */}
        {BOOTH_CONNECTOR_PATHS.map((conn, idx) => (
          <group
            key={`conn-${idx}`}
            position={[conn.x, 0.018, conn.z]}
            rotation={[0, conn.ry, 0]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[conn.w, conn.d]} />
              <meshStandardMaterial
                map={plazaTileTexture}
                bumpMap={plazaTileBumpTexture}
                bumpScale={0.03}
                roughnessMap={plazaTileBumpTexture}
                color="#ffffff"
                roughness={0.52}
                metalness={0.04}
              />
            </mesh>
            {/* Raised Granite Sidewalk Curbs along Booth Approach Walkways */}
            <mesh position={[-conn.w / 2 - 0.11, 0.024, 0]} receiveShadow material={CURB_STONE_MAT}>
              <boxGeometry args={[0.22, 0.048, conn.d]} />
            </mesh>
            <mesh position={[conn.w / 2 + 0.11, 0.024, 0]} receiveShadow material={CURB_STONE_MAT}>
              <boxGeometry args={[0.22, 0.048, conn.d]} />
            </mesh>
            <mesh position={[-conn.w / 2, 0.026, 0]}>
              <boxGeometry args={[0.1, 0.052, conn.d]} />
              <meshBasicMaterial color={conn.accent} />
            </mesh>
            <mesh position={[conn.w / 2, 0.026, 0]}>
              <boxGeometry args={[0.1, 0.052, conn.d]} />
              <meshBasicMaterial color={conn.accent} />
            </mesh>
          </group>
        ))}

        {/* Entrance Welcome Promenade Plaza Carpet */}
        <group position={[0, 0.02, 19.6]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[5.0, 2.8]} />
            <meshStandardMaterial color="#0284c7" roughness={0.62} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <planeGeometry args={[4.4, 2.4]} />
            <meshStandardMaterial color="#0ea5e9" roughness={0.55} />
          </mesh>
        </group>

        {/* ================================================================
            3. CENTRAL PEDESTRIAN PLAZA COMPASS MEDALLION & CENTERPIECE
           ================================================================ */}
        <group position={[0, 0, 0]}>
          {/* 3D Raised Circular Granite Curb Ring framing Central Pedestrian Plaza */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, 0]} receiveShadow material={CURB_STONE_MAT}>
            <ringGeometry args={[8.18, 8.52, 64]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.034, 0]} receiveShadow material={CURB_STONE_MAT}>
            <torusGeometry args={[8.35, 0.055, 12, 64]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]} receiveShadow>
            <circleGeometry args={[8.22, 64]} />
            <meshStandardMaterial
              map={plazaMedallionTexture}
              bumpMap={plazaTileBumpTexture}
              bumpScale={0.025}
              roughness={0.42}
              metalness={0.08}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.027, 0]}>
            <ringGeometry args={[7.15, 7.48, 64]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.88} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.029, 0]}>
            <ringGeometry args={[5.35, 5.55, 64]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.92} />
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
            5. LOW-PROFILE ORNAMENTAL FLOWER PLANTER BEDS & OUTER WAYFINDING SIGNS
               (Planter beds at (±6, ±5) are strictly low-profile y <= 0.48m so diagonal
                Shop Showcase camera sightlines to Aether, EcoVita, Kinetix, and Lumina
                are 100% unobstructed; tall wayfinding signposts stand at outer avenue
                corners (±5.6, ±16.8) outside all 6 camera frustum corridors)
           ================================================================ */}
        {CENTRAL_PLANTER_ISLANDS.map((island, idx) => (
          <React.Fragment key={`planter-island-${idx}`}>
            <group position={[island.x, 0, island.z]}>
              <mesh
                geometry={PLANTER_BOX_GEOM}
                material={PLANTER_BOX_MAT}
                position={[0, 0.18, 0]}
                castShadow
                receiveShadow
              />
              <mesh
                geometry={PLANTER_SOIL_GEOM}
                material={PLANTER_SOIL_MAT}
                position={[0, 0.37, 0]}
              />
            </group>

            <group position={[island.signPos[0], 0, island.signPos[1]]}>
              <mesh
                geometry={SIGNPOST_POLE_GEOM}
                material={LAMP_POLE_MAT}
                position={[0, 1.02, 0]}
                castShadow
              />
              {islandSignTextures[idx] && (
                <Billboard position={[0, 2.24, 0]}>
                  <mesh>
                    <planeGeometry args={[2.55, 0.54]} />
                    <meshBasicMaterial
                      map={islandSignTextures[idx]}
                      transparent
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                </Billboard>
              )}
            </group>
          </React.Fragment>
        ))}

        {/* Instanced Illuminated Plaza Bollards & Modern Recycling Bins */}
        <Instances geometry={BOLLARD_BODY_GEOM} material={LAMP_POLE_MAT} castShadow receiveShadow>
          {PLAZA_BOLLARD_POSITIONS.map(([bx, bz], i) => (
            <Instance key={`bollard-body-${i}`} position={[bx, 0.39, bz]} />
          ))}
        </Instances>
        <Instances geometry={BOLLARD_GLOW_GEOM} material={BOLLARD_GLOW_MAT}>
          {PLAZA_BOLLARD_POSITIONS.map(([bx, bz], i) => (
            <Instance key={`bollard-glow-${i}`} position={[bx, 0.68, bz]} />
          ))}
        </Instances>
        <Instances geometry={BIN_BODY_GEOM} material={BIN_BODY_MAT} castShadow receiveShadow>
          {EXHIBITION_BIN_POSITIONS.map(([rx, rz], i) => (
            <Instance key={`bin-body-${i}`} position={[rx, 0.32, rz]} />
          ))}
        </Instances>
        <Instances geometry={BIN_TOP_GEOM} material={BIN_TOP_MAT}>
          {EXHIBITION_BIN_POSITIONS.map(([rx, rz], i) => (
            <Instance key={`bin-top-${i}`} position={[rx, 0.66, rz]} />
          ))}
        </Instances>

        {/* ================================================================
            6. ASSET-DRIVEN TREES (`env-tree-*.glb`), BENCHES (`env-park-bench.glb`),
               STREET LAMPS (`env-street-lamp.glb`) & PLANTER URNS (`env-planter-urn.glb`)
           ================================================================ */}
        {/* 16 Multi-Species Sculpted 3D Trees (Oak, Blossom & Layered Pine/Cypress) */}
        {treeClones.map((t, i) => (
          <primitive
            key={`glb-tree-${i}`}
            object={t.object}
            position={[t.x, 0.22, t.z]}
            rotation={[0, t.ry, 0]}
            scale={[t.scale, t.scale, t.scale]}
          />
        ))}

        {/* 6 Sculpted Stone Planter Urns along Grand Avenue & Entrance */}
        {urnClones.map((u, i) => (
          <primitive
            key={`glb-urn-${i}`}
            object={u.object}
            position={[u.x, 0.02, u.z]}
          />
        ))}

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

        {/* 8 Ergonomic Contoured Slat Park Benches (`env-park-bench.glb`) */}
        {benchClones.map((b, i) => (
          <primitive
            key={`glb-bench-${i}`}
            object={b.object}
            position={[b.x, 0.02, b.z]}
            rotation={[0, b.rotationY, 0]}
          />
        ))}

        {/* 8 Architectural Swan-Neck Boulevard Street Lamps (`env-street-lamp.glb`) + Warm Light Pools */}
        {lampClones.map((l, i) => (
          <primitive
            key={`glb-lamp-${i}`}
            object={l.object}
            position={[l.x, 0.02, l.z]}
            rotation={[0, l.ry, 0]}
          />
        ))}
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
