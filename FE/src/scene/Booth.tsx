import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth as BoothType } from '../types/expo';
import {
  type BoothVisualTheme,
  createBoothFasciaTexture,
  createBoothPosterTexture,
  createBoothSignTexture,
} from './sceneTextures';
import { cloneCachedAsset, getBoothGlbAssetId } from './assetLoader';

export interface BoothProps {
  booth: BoothType;
  productCount: number;
  isSelected: boolean;
  onSelect: (booth: BoothType) => void;
  visible?: boolean;
}

export function resolveBoothTheme(booth: BoothType): BoothVisualTheme {
  const id = booth.id.toLowerCase();
  const cat = booth.category.toLowerCase();
  if (id.includes('aether') || cat.includes('công nghệ') || cat.includes('điện tử') || cat.includes('tech')) {
    return 'tech';
  }
  if (id.includes('nordic') || cat.includes('nội thất') || cat.includes('kiến trúc') || cat.includes('living')) {
    return 'living';
  }
  if (id.includes('ecovita') || cat.includes('thực phẩm') || cat.includes('nông sản') || cat.includes('cà phê')) {
    return 'coffee';
  }
  if (id.includes('kinetix') || cat.includes('tự động') || cat.includes('robot') || cat.includes('sản xuất')) {
    return 'robotics';
  }
  if (id.includes('lumina') || cat.includes('thiết kế') || cat.includes('đời sống') || cat.includes('design')) {
    return 'design';
  }
  if (id.includes('solaris') || cat.includes('năng lượng') || cat.includes('xanh') || cat.includes('energy')) {
    return 'energy';
  }
  return 'tech';
}

const WALL_HEIGHT = 3.45;

// ============================================================================
// Shared Module-Level Geometries across all 6 booths (PERF-04: Zero duplicate VBOs)
// ============================================================================
const TRUSS_BASE_GEOM = new THREE.CylinderGeometry(0.2, 0.25, 0.18, 10);
const TRUSS_PILLAR_GEOM = new THREE.CylinderGeometry(0.12, 0.12, WALL_HEIGHT, 10);
const SQUARE_PILLAR_GEOM = new THREE.BoxGeometry(0.24, WALL_HEIGHT, 0.24);
const TRUSS_RING_GEOM = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10);

const COUNTER_BODY_GEOM = new THREE.BoxGeometry(1.78, 0.92, 0.76);
const COUNTER_TOP_GEOM = new THREE.BoxGeometry(1.9, 0.08, 0.86);
const COUNTER_FRONT_GEOM = new THREE.BoxGeometry(1.56, 0.64, 0.04);
const CAFE_COUNTER_GEOM = new THREE.BoxGeometry(2.35, 0.94, 0.82);
const CAFE_TOP_GEOM = new THREE.BoxGeometry(2.48, 0.08, 0.92);
const PASTRY_GLASS_GEOM = new THREE.BoxGeometry(0.86, 0.44, 0.52);

const MONITOR_GEOM = new THREE.BoxGeometry(0.52, 0.34, 0.05);
const TABLET_STAND_GEOM = new THREE.BoxGeometry(0.28, 0.22, 0.04);
const STOOL_POLE_GEOM = new THREE.CylinderGeometry(0.045, 0.045, 0.64, 8);
const STOOL_SEAT_GEOM = new THREE.CylinderGeometry(0.22, 0.19, 0.08, 12);

const PEDESTAL_ONE_GEOM = new THREE.CylinderGeometry(0.46, 0.52, 0.84, 16);
const PEDESTAL_ONE_RING_GEOM = new THREE.CylinderGeometry(0.49, 0.49, 0.05, 16);
const SHOWCASE_OCTA_GEOM = new THREE.OctahedronGeometry(0.34, 0);
const SHOWCASE_HOLO_RING_GEOM = new THREE.TorusGeometry(0.44, 0.03, 10, 24);

const PEDESTAL_TWO_GEOM = new THREE.CylinderGeometry(0.38, 0.44, 0.72, 14);
const PEDESTAL_TWO_RING_GEOM = new THREE.CylinderGeometry(0.41, 0.41, 0.04, 14);
const SHOWCASE_TORUS_GEOM = new THREE.TorusKnotGeometry(0.22, 0.055, 28, 6);

const SHELF_BACK_GEOM = new THREE.BoxGeometry(1.48, 2.35, 0.08);
const SHELF_BOARD_GEOM = new THREE.BoxGeometry(1.42, 0.06, 0.42);
const SHELF_BOX_GEOM = new THREE.BoxGeometry(0.28, 0.28, 0.24);
const SHELF_CYL_GEOM = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 10);
const SHELF_SPHERE_GEOM = new THREE.SphereGeometry(0.14, 10, 10);

const LOUVER_FIN_GEOM = new THREE.BoxGeometry(0.14, WALL_HEIGHT - 0.2, 0.14);
const PERGOLA_RAFTER_GEOM = new THREE.BoxGeometry(0.16, 0.22, 4.6);
const AWNING_SLAT_GEOM = new THREE.BoxGeometry(0.94, 0.1, 1.15);
const LANTERN_BULB_GEOM = new THREE.SphereGeometry(0.13, 10, 10);
const CEIL_LIGHT_GEOM = new THREE.BoxGeometry(1.45, 0.06, 0.18);
const SIGN_BILLBOARD_GEOM = new THREE.PlaneGeometry(4.65, 1.54);

const POSTER_FRAME_GEOM = new THREE.BoxGeometry(2.42, 1.56, 0.08);
const POSTER_PLANE_GEOM = new THREE.PlaneGeometry(2.26, 1.42);
const SIDE_SCREEN_GEOM = new THREE.BoxGeometry(0.95, 1.32, 0.06);

const TOTEM_BODY_GEOM = new THREE.BoxGeometry(0.56, 1.92, 0.16);
const TOTEM_BASE_GEOM = new THREE.BoxGeometry(0.68, 0.08, 0.36);
const TOTEM_SCREEN_GEOM = new THREE.PlaneGeometry(0.46, 1.18);

const BEACON_RING_GEOM = new THREE.RingGeometry(0.34, 0.48, 24);
const BEACON_CORE_GEOM = new THREE.CircleGeometry(0.26, 20);

// Theme-Specific Geometries
const SERVER_RACK_GEOM = new THREE.BoxGeometry(0.68, 2.05, 0.58);
const SERVER_LED_STRIP_GEOM = new THREE.BoxGeometry(0.48, 0.06, 0.02);

const SOFA_BASE_GEOM = new THREE.BoxGeometry(1.75, 0.36, 0.78);
const SOFA_BACK_GEOM = new THREE.BoxGeometry(1.75, 0.48, 0.2);
const SOFA_ARM_GEOM = new THREE.BoxGeometry(0.2, 0.52, 0.78);
const COFFEE_TABLE_GEOM = new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16);
const COFFEE_TABLE_LEG_GEOM = new THREE.CylinderGeometry(0.05, 0.05, 0.38, 8);
const DESK_TOP_GEOM = new THREE.BoxGeometry(1.46, 0.07, 0.74);
const DESK_LEG_GEOM = new THREE.BoxGeometry(0.08, 0.74, 0.56);
const CHAIR_SEAT_GEOM = new THREE.BoxGeometry(0.48, 0.07, 0.46);
const CHAIR_BACK_GEOM = new THREE.BoxGeometry(0.46, 0.56, 0.07);
const LAMP_STEM_GEOM = new THREE.CylinderGeometry(0.03, 0.05, 1.55, 8);
const LAMP_SHADE_GEOM = new THREE.ConeGeometry(0.26, 0.32, 12);

const ROASTER_DRUM_GEOM = new THREE.CylinderGeometry(0.34, 0.34, 0.62, 14);
const ROASTER_HOPPER_GEOM = new THREE.ConeGeometry(0.25, 0.36, 12);
const COFFEE_BAG_GEOM = new THREE.BoxGeometry(0.36, 0.46, 0.26);
const ESPRESSO_MACHINE_GEOM = new THREE.BoxGeometry(0.66, 0.46, 0.4);
const GRINDER_HOPPER_GEOM = new THREE.CylinderGeometry(0.11, 0.08, 0.38, 10);

const ROBOT_BASE_GEOM = new THREE.CylinderGeometry(0.38, 0.44, 0.3, 14);
const ROBOT_LOWER_ARM_GEOM = new THREE.BoxGeometry(0.18, 0.72, 0.18);
const ROBOT_UPPER_ARM_GEOM = new THREE.BoxGeometry(0.15, 0.6, 0.15);
const ROBOT_JOINT_GEOM = new THREE.SphereGeometry(0.15, 10, 10);
const AMR_CHASSIS_GEOM = new THREE.BoxGeometry(0.96, 0.26, 0.72);
const AMR_LIDAR_GEOM = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12);

const HEX_TILE_GEOM = new THREE.CylinderGeometry(0.29, 0.29, 0.08, 6);
const HALO_RING_LARGE_GEOM = new THREE.TorusGeometry(0.74, 0.048, 10, 28);
const HALO_RING_SMALL_GEOM = new THREE.TorusGeometry(0.46, 0.038, 10, 24);
const EASEL_FRAME_GEOM = new THREE.BoxGeometry(0.78, 0.96, 0.06);
const EASEL_LEG_GEOM = new THREE.CylinderGeometry(0.03, 0.03, 1.65, 6);

const SOLAR_PANEL_GEOM = new THREE.BoxGeometry(1.38, 0.07, 1.25);
const POWERWALL_BODY_GEOM = new THREE.BoxGeometry(0.82, 1.38, 0.22);
const EV_CHARGER_BODY_GEOM = new THREE.BoxGeometry(0.46, 1.62, 0.34);
const PLANT_BUSH_GEOM = new THREE.DodecahedronGeometry(0.28, 0);
const PLANT_POT_GEOM = new THREE.CylinderGeometry(0.26, 0.2, 0.38, 10);

// ============================================================================
// Shared Module-Level Materials across all 6 booths
// ============================================================================
const DARK_NAVY_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  roughness: 0.38,
  metalness: 0.25,
});
const SLATE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45 });
const SLATE_MID_MAT = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 });
const WHITE_GLOSS_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.24 });
const CREAM_WALL_MAT = new THREE.MeshStandardMaterial({ color: '#fffbeb', roughness: 0.55 });
const CREAM_SOFA_MAT = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.65 });
const CARPET_MAT = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.72 });
const CHROME_PILLAR_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  metalness: 0.72,
  roughness: 0.22,
});
const GOLD_SHOWCASE_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  metalness: 0.68,
  roughness: 0.2,
});
const COPPER_CRAFT_MAT = new THREE.MeshStandardMaterial({
  color: '#d97706',
  metalness: 0.62,
  roughness: 0.26,
});
const WARM_OAK_MAT = new THREE.MeshStandardMaterial({
  color: '#b45309',
  roughness: 0.52,
  metalness: 0.08,
});
const ESPRESSO_WOOD_MAT = new THREE.MeshStandardMaterial({
  color: '#451a03',
  roughness: 0.58,
});
const TERRACOTTA_FLOOR_MAT = new THREE.MeshStandardMaterial({
  color: '#9a3412',
  roughness: 0.68,
});
const BURLAP_MAT = new THREE.MeshStandardMaterial({
  color: '#a16207',
  roughness: 0.78,
});
const SOLAR_CELL_MAT = new THREE.MeshStandardMaterial({
  color: '#0284c7',
  metalness: 0.68,
  roughness: 0.16,
});
const EMERALD_PLANT_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.5,
  flatShading: true,
});
const MAGENTA_ART_MAT = new THREE.MeshStandardMaterial({
  color: '#ec4899',
  roughness: 0.35,
});
const VIOLET_ART_MAT = new THREE.MeshStandardMaterial({
  color: '#7c3aed',
  roughness: 0.4,
});
const GLASS_TINT_MAT = new THREE.MeshStandardMaterial({
  color: '#bae6fd',
  transparent: true,
  opacity: 0.45,
  roughness: 0.15,
});
const GOLD_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const EMERALD_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const WARM_BULB_MAT = new THREE.MeshBasicMaterial({ color: '#fde68a' });
const WHITE_LIGHT_MAT = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

export const Booth: React.FC<BoothProps> = React.memo(
  ({ booth, productCount, isSelected, onSelect, visible = true }) => {
    const [hovered, setHovered] = useState(false);
    const showcasePrimaryRef = useRef<THREE.Object3D | null>(null);
    const showcaseSecondaryRef = useRef<THREE.Object3D | null>(null);
    const beaconRingRef = useRef<THREE.Mesh>(null);

    const w = booth.width || 5.6;
    const d = booth.depth || 4.2;
    const vw = Math.max(w, 6.0);
    const vd = Math.max(d, 4.4);
    const active = hovered || isSelected;
    const theme = useMemo(() => resolveBoothTheme(booth), [booth]);
    const exteriorShell = useMemo(
      () => cloneCachedAsset(getBoothGlbAssetId(theme)),
      [theme]
    );

    const brandStandardMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.3,
          metalness: 0.18,
        }),
      [booth.color]
    );

    const brandFlatMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          metalness: 0.58,
          roughness: 0.18,
          flatShading: true,
        }),
      [booth.color]
    );

    const brandBasicMat = useMemo(
      () => new THREE.MeshBasicMaterial({ color: booth.color }),
      [booth.color]
    );

    useEffect(() => {
      return () => {
        brandStandardMat.dispose();
        brandFlatMat.dispose();
        brandBasicMat.dispose();
      };
    }, [brandStandardMat, brandFlatMat, brandBasicMat]);

    // Pre-generate and cache Fascia, Poster, Idle Sign, and Active Sign textures with Theme Palette (PERF-05)
    const { fasciaTexture, posterTexture, idleSignTexture, activeSignTexture } = useMemo(() => {
      return {
        fasciaTexture: createBoothFasciaTexture({
          name: booth.name,
          category: booth.category,
          color: booth.color,
          theme,
        }),
        posterTexture: createBoothPosterTexture({
          name: booth.name,
          category: booth.category,
          tagline: booth.tagline,
          color: booth.color,
          productCount,
          theme,
        }),
        idleSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.category,
          productCount,
          color: booth.color,
          active: false,
          theme,
        }),
        activeSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.category,
          productCount,
          color: booth.color,
          active: true,
          theme,
        }),
      };
    }, [booth.name, booth.category, booth.tagline, productCount, booth.color, theme]);

    useEffect(() => {
      return () => {
        fasciaTexture.dispose();
        posterTexture.dispose();
        idleSignTexture.dispose();
        activeSignTexture.dispose();
      };
    }, [fasciaTexture, posterTexture, idleSignTexture, activeSignTexture]);

    const currentSignTexture = active ? activeSignTexture : idleSignTexture;

    useFrame(({ clock }, delta) => {
      if (!visible) return;
      const t = clock.getElapsedTime();
      if (showcasePrimaryRef.current) {
        showcasePrimaryRef.current.rotation.y += delta * 0.95;
      }
      if (showcaseSecondaryRef.current) {
        showcaseSecondaryRef.current.rotation.y -= delta * 0.75;
      }
      if (beaconRingRef.current) {
        const pulse = active ? 1.18 + Math.sin(t * 5) * 0.1 : 1.0 + Math.sin(t * 2.5) * 0.05;
        beaconRingRef.current.scale.set(pulse, pulse, 1);
      }
    });

    return (
      <group
        visible={visible}
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY || 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(booth);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* ================================================================
            1. BESPOKE 3D ARCHITECTURAL BUILDING SHELL (`booth-*.glb` asset)
               Unique sculpted roof, facade, wings, entrance steps & rooftop crown!
           ================================================================ */}
        <primitive object={exteriorShell} />

        {/* Active Selection Glow Trim & Interactive Entrance Beacon */}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[vw + 1.35, 0.04, vd + 1.15]} />
          <meshBasicMaterial
            color={booth.color}
            transparent
            opacity={active ? 0.95 : 0.45}
          />
        </mesh>

        {/* Inner Showroom Rug / Zone Mat */}
        <mesh
          position={[0, 0.325, 0.08]}
          receiveShadow
          material={
            theme === 'living' || theme === 'coffee'
              ? CREAM_WALL_MAT
              : theme === 'robotics'
                ? SLATE_MID_MAT
                : CARPET_MAT
          }
        >
          <boxGeometry args={[vw - 0.56, 0.015, vd - 0.52]} />
        </mesh>

        {/* Interactive Approach Beacon on Front Entrance Terrace */}
        <group position={[-vw * 0.18, 0.08, vd / 2 + 1.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh
            ref={beaconRingRef}
            geometry={BEACON_RING_GEOM}
            material={active ? GOLD_BASIC_MAT : brandBasicMat}
          />
          <mesh geometry={BEACON_CORE_GEOM} material={DARK_NAVY_MAT} />
        </group>

        {/* ================================================================
            2. INTERIOR BACKWALL PRESENTATION POSTER & 3-TIER DISPLAY RACK
           ================================================================ */}
        {/* Background Presentation Poster / Screen */}
        <group position={[0.62, 1.98, -vd / 2 + 0.04]}>
          <mesh geometry={POSTER_FRAME_GEOM} material={DARK_NAVY_MAT} />
          <mesh position={[0, 0, 0.045]} geometry={POSTER_PLANE_GEOM}>
            <meshBasicMaterial map={posterTexture} />
          </mesh>
        </group>

        {/* Background-Left 3-Tier Product Display Rack */}
        <group position={[-vw * 0.31, 0.28, -vd / 2 + 0.22]}>
          <mesh
            position={[0, 1.16, -0.16]}
            geometry={SHELF_BACK_GEOM}
            material={theme === 'living' || theme === 'coffee' ? WARM_OAK_MAT : SLATE_DARK_MAT}
          />
          {[0.66, 1.32, 1.98].map((shelfY, idx) => (
            <group key={`shelf-${idx}`} position={[0, shelfY, 0]}>
              <mesh
                geometry={SHELF_BOARD_GEOM}
                material={theme === 'living' || theme === 'coffee' ? CREAM_WALL_MAT : WHITE_GLOSS_MAT}
              />
              <mesh
                position={[-0.36, 0.17, 0]}
                geometry={SHELF_BOX_GEOM}
                material={brandStandardMat}
              />
              <mesh
                position={[0.02, 0.16, 0]}
                geometry={SHELF_CYL_GEOM}
                material={theme === 'coffee' ? COPPER_CRAFT_MAT : GOLD_SHOWCASE_MAT}
              />
              <mesh
                position={[0.38, 0.16, 0]}
                geometry={SHELF_SPHERE_GEOM}
                material={theme === 'energy' || theme === 'living' ? EMERALD_PLANT_MAT : CHROME_PILLAR_MAT}
              />
            </group>
          ))}
        </group>

        {/* ================================================================
            3. UNIQUE ARCHITECTURAL ROOF, FAÇADE & FOREGROUND/MIDGROUND BY THEME
           ================================================================ */}

        {/* -------------------- BOOTH 1: FUTURISTIC TECH STORE -------------------- */}
        {theme === 'tech' && (
          <group>
            {/* Futuristic Cyber-Visor Roof, Twin 5G Radar Domes & Neon Pillars */}
            <group position={[0, WALL_HEIGHT + 0.28, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={DARK_NAVY_MAT}>
                <boxGeometry args={[vw + 0.44, 0.62, 0.42]} />
              </mesh>
              <mesh position={[0, 0.34, vd / 2 + 0.08]} material={CYAN_GLOW_MAT}>
                <boxGeometry args={[vw + 0.48, 0.08, 0.46]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.28]}>
                <planeGeometry args={[vw + 0.2, 0.56]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>
              <mesh position={[-vw * 0.22, -0.12, 0]} geometry={CEIL_LIGHT_GEOM} material={CYAN_GLOW_MAT} />
              <mesh position={[vw * 0.22, -0.12, 0]} geometry={CEIL_LIGHT_GEOM} material={WHITE_LIGHT_MAT} />
            </group>

            {/* Front Right Cyber Pillar & Dual Holographic Totem */}
            <group position={[vw / 2 - 0.18, 0.18, vd / 2 - 0.22]}>
              <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
              <mesh position={[0, WALL_HEIGHT * 0.65, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
            </group>
            <group position={[-vw / 2 + 0.36, 0.18, vd / 2 - 0.2]}>
              <mesh position={[0, 0.04, 0]} geometry={TOTEM_BASE_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.98, 0]} geometry={TOTEM_BODY_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 1.06, 0.085]} geometry={TOTEM_SCREEN_GEOM} material={CYAN_GLOW_MAT} />
            </group>

            {/* Foreground Right: Futuristic White-Gloss & Neon Demo Bar */}
            <group position={[vw * 0.22, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.46, 0]} receiveShadow geometry={COUNTER_BODY_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.46, 0.39]} geometry={COUNTER_FRONT_GEOM} material={CYAN_GLOW_MAT} />
              <mesh position={[-0.36, 1.14, 0.06]} rotation={[0, -0.2, 0]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0.36, 1.14, 0.06]} rotation={[0, 0.2, 0]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
            </group>

            {/* Midground Left: Holographic AR & IoT Core Pedestal */}
            <group position={[-vw * 0.23, 0.18, vd * 0.16]}>
              <mesh position={[0, 0.42, 0]} receiveShadow geometry={PEDESTAL_ONE_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={CYAN_GLOW_MAT} />
              <group ref={showcasePrimaryRef as React.RefObject<THREE.Group>} position={[0, 1.26, 0]}>
                <mesh geometry={SHOWCASE_OCTA_GEOM} material={brandFlatMat} />
                <mesh rotation={[Math.PI / 3, 0, 0]} geometry={SHOWCASE_HOLO_RING_GEOM} material={CYAN_GLOW_MAT} />
              </group>
            </group>

            {/* Midground Center: Smart AetherGlass AR Display */}
            <group position={[0.02, 0.18, -0.1]}>
              <mesh position={[0, 0.36, 0]} geometry={PEDESTAL_TWO_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.73, 0]} geometry={PEDESTAL_TWO_RING_GEOM} material={brandBasicMat} />
              <mesh
                ref={showcaseSecondaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.05, 0]}
                geometry={SHOWCASE_TORUS_GEOM}
                material={CHROME_PILLAR_MAT}
              />
            </group>

            {/* Background Right: Edge Server Rack & Telemetry Screen */}
            <group position={[vw * 0.35, 0.18, -vd * 0.2]}>
              <mesh position={[0, 1.02, 0]} geometry={SERVER_RACK_GEOM} material={DARK_NAVY_MAT} />
              {[0.55, 0.9, 1.25, 1.6].map((ly, i) => (
                <mesh
                  key={`srv-led-${i}`}
                  position={[0, ly, 0.3]}
                  geometry={SERVER_LED_STRIP_GEOM}
                  material={i % 2 === 0 ? CYAN_GLOW_MAT : brandBasicMat}
                />
              ))}
            </group>
          </group>
        )}

        {/* -------------------- BOOTH 2: COZY INTERIOR SHOWROOM -------------------- */}
        {theme === 'living' && (
          <group>
            {/* Warm Scandinavian Timber Pergola Roof & Rafters */}
            <group position={[0, WALL_HEIGHT + 0.26, 0.06]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={WARM_OAK_MAT}>
                <boxGeometry args={[vw + 0.42, 0.56, 0.38]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.26]}>
                <planeGeometry args={[vw + 0.16, 0.52]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>
              {[-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4].map((rx, idx) => (
                <mesh
                  key={`rafter-${idx}`}
                  position={[rx, 0.06, 0]}
                  geometry={PERGOLA_RAFTER_GEOM}
                  material={WARM_OAK_MAT}
                />
              ))}
              {/* Rooftop Scandinavian Garden Planter Boxes */}
              {[-1.95, 1.95].map((gx, idx) => (
                <group key={`roof-garden-${idx}`} position={[gx, 0.22, -0.85]}>
                  <mesh geometry={PLANT_POT_GEOM} material={CREAM_WALL_MAT} />
                  <mesh position={[0, 0.28, 0]} geometry={PLANT_BUSH_GEOM} material={EMERALD_PLANT_MAT} />
                </group>
              ))}
            </group>

            {/* Warm Oak Square Front Pillars & Lush Potted Plants */}
            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`oak-pil-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={WARM_OAK_MAT} />
                <mesh position={[idx === 0 ? 0.42 : -0.42, 0.19, 0.25]} geometry={PLANT_POT_GEOM} material={CREAM_WALL_MAT} />
                <mesh position={[idx === 0 ? 0.42 : -0.42, 0.52, 0.25]} geometry={PLANT_BUSH_GEOM} material={EMERALD_PLANT_MAT} />
              </group>
            ))}

            {/* Foreground Right: Warm Timber & Cream Reception Console */}
            <group position={[vw * 0.23, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.46, 0]} receiveShadow geometry={COUNTER_BODY_GEOM} material={CREAM_WALL_MAT} />
              <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[0, 0.46, 0.39]} geometry={COUNTER_FRONT_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[-0.35, 1.12, 0.04]} geometry={MONITOR_GEOM} material={ESPRESSO_WOOD_MAT} />
            </group>

            {/* Foreground/Midground Left: Cozy L-Sofa, Round Coffee Table & Floor Lamp */}
            <group position={[-vw * 0.2, 0.18, vd * 0.16]}>
              <mesh position={[0, 0.22, 0]} receiveShadow geometry={SOFA_BASE_GEOM} material={CREAM_SOFA_MAT} />
              <mesh position={[0, 0.52, -0.28]} geometry={SOFA_BACK_GEOM} material={CREAM_SOFA_MAT} />
              <mesh position={[-0.78, 0.34, 0]} geometry={SOFA_ARM_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[0.78, 0.34, 0]} geometry={SOFA_ARM_GEOM} material={WARM_OAK_MAT} />
              {/* Throw Pillows */}
              <mesh position={[-0.45, 0.48, -0.1]} geometry={SHELF_BOX_GEOM} material={EMERALD_PLANT_MAT} />
              <mesh position={[0.45, 0.48, -0.1]} geometry={SHELF_BOX_GEOM} material={COPPER_CRAFT_MAT} />
              {/* Round Coffee Table in front of Sofa */}
              <group position={[0, 0, 0.72]}>
                <mesh position={[0, 0.4, 0]} geometry={COFFEE_TABLE_GEOM} material={WARM_OAK_MAT} />
                <mesh position={[0, 0.2, 0]} geometry={COFFEE_TABLE_LEG_GEOM} material={ESPRESSO_WOOD_MAT} />
              </group>
              {/* Golden Arch Floor Lamp */}
              <group position={[-1.08, 0, -0.22]}>
                <mesh position={[0, 0.78, 0]} geometry={LAMP_STEM_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh position={[0, 1.58, 0]} geometry={LAMP_SHADE_GEOM} material={WARM_BULB_MAT} />
              </group>
            </group>

            {/* Midground Center-Right: Fjäll Standing Desk & AirMesh Chair */}
            <group position={[0.35, 0.18, -0.25]}>
              <mesh position={[0, 0.76, 0]} geometry={DESK_TOP_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[-0.56, 0.38, 0]} geometry={DESK_LEG_GEOM} material={ESPRESSO_WOOD_MAT} />
              <mesh position={[0.56, 0.38, 0]} geometry={DESK_LEG_GEOM} material={ESPRESSO_WOOD_MAT} />
              <mesh position={[0, 0.98, -0.14]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              <group position={[0, 0, 0.52]}>
                <mesh position={[0, 0.46, 0]} geometry={CHAIR_SEAT_GEOM} material={ESPRESSO_WOOD_MAT} />
                <mesh position={[0, 0.78, 0.18]} geometry={CHAIR_BACK_GEOM} material={EMERALD_PLANT_MAT} />
              </group>
            </group>
          </group>
        )}

        {/* -------------------- BOOTH 3: COZY CAFÉ & CRAFT SHOP -------------------- */}
        {theme === 'coffee' && (
          <group>
            {/* Cozy Striped Café Awning Roof, Timber Header & Hanging Warm Lanterns */}
            <group position={[0, WALL_HEIGHT + 0.26, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={ESPRESSO_WOOD_MAT}>
                <boxGeometry args={[vw + 0.46, 0.58, 0.4]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.27]}>
                <planeGeometry args={[vw + 0.2, 0.54]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>

              {/* 6-Stripe Scalloped Café Awning Visor */}
              {[-2.4, -1.44, -0.48, 0.48, 1.44, 2.4].map((ax, idx) => (
                <mesh
                  key={`cafe-awning-${idx}`}
                  position={[ax, -0.34, vd / 2 + 0.56]}
                  rotation={[0.34, 0, 0]}
                  geometry={AWNING_SLAT_GEOM}
                  material={idx % 2 === 0 ? COPPER_CRAFT_MAT : CREAM_WALL_MAT}
                />
              ))}

              {/* 5 Warm Glowing Bistro Lanterns */}
              {[-2.1, -1.05, 0, 1.05, 2.1].map((lx, idx) => (
                <mesh
                  key={`cafe-bulb-${idx}`}
                  position={[lx, -0.56, vd / 2 + 0.48]}
                  geometry={LANTERN_BULB_GEOM}
                  material={WARM_BULB_MAT}
                />
              ))}
            </group>

            {/* Warm Timber Café Columns & Entrance Greenery */}
            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`cafe-col-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={ESPRESSO_WOOD_MAT} />
                <mesh position={[idx === 0 ? 0.45 : -0.45, 0.19, 0.28]} geometry={PLANT_POT_GEOM} material={COPPER_CRAFT_MAT} />
                <mesh position={[idx === 0 ? 0.45 : -0.45, 0.52, 0.28]} geometry={PLANT_BUSH_GEOM} material={EMERALD_PLANT_MAT} />
              </group>
            ))}

            {/* Foreground Right-Center: Wide Front-Facing Barista Counter, Espresso Machine & Glass Case */}
            <group position={[vw * 0.16, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.47, 0]} receiveShadow geometry={CAFE_COUNTER_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[0, 0.96, 0]} geometry={CAFE_TOP_GEOM} material={CREAM_WALL_MAT} />
              <mesh position={[0, 0.47, 0.42]} geometry={COUNTER_FRONT_GEOM} material={ESPRESSO_WOOD_MAT} />
              {/* Copper Commercial Espresso Machine */}
              <mesh position={[-0.52, 1.22, 0]} geometry={ESPRESSO_MACHINE_GEOM} material={COPPER_CRAFT_MAT} />
              {/* Twin Conical Bean Grinders */}
              <mesh position={[0.02, 1.18, -0.05]} geometry={GRINDER_HOPPER_GEOM} material={ESPRESSO_WOOD_MAT} />
              <mesh position={[0.24, 1.18, -0.05]} geometry={GRINDER_HOPPER_GEOM} material={ESPRESSO_WOOD_MAT} />
              {/* Glass Artisan Drip-Box & Pastry Display Case */}
              <mesh position={[0.72, 1.2, 0.06]} geometry={PASTRY_GLASS_GEOM} material={GLASS_TINT_MAT} />
            </group>

            {/* Foreground/Midground Left: Artisanal Copper Drum Coffee Roaster */}
            <group position={[-vw * 0.25, 0.18, vd * 0.16]}>
              <mesh position={[0, 0.42, 0]} receiveShadow geometry={PEDESTAL_ONE_GEOM} material={ESPRESSO_WOOD_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={GOLD_BASIC_MAT} />
              <group position={[0, 1.14, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]} geometry={ROASTER_DRUM_GEOM} material={COPPER_CRAFT_MAT} />
                <mesh position={[0, 0.44, 0]} geometry={ROASTER_HOPPER_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh
                  ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                  position={[0, 0, 0.36]}
                  geometry={SHOWCASE_HOLO_RING_GEOM}
                  material={GOLD_SHOWCASE_MAT}
                />
              </group>
            </group>

            {/* Midground Center: Stacked Cau Dat Arabica Burlap Coffee Sacks */}
            <group position={[-0.25, 0.18, -0.25]}>
              <mesh position={[-0.24, 0.23, 0]} geometry={COFFEE_BAG_GEOM} material={BURLAP_MAT} />
              <mesh position={[0.2, 0.23, 0.06]} geometry={COFFEE_BAG_GEOM} material={BURLAP_MAT} />
              <mesh position={[-0.02, 0.66, 0.02]} geometry={COFFEE_BAG_GEOM} material={COPPER_CRAFT_MAT} />
            </group>
          </group>
        )}

        {/* -------------------- BOOTH 4: ROBOTICS LABORATORY -------------------- */}
        {theme === 'robotics' && (
          <group>
            {/* Heavy-Duty Space-Frame Steel Gantry Roof */}
            <group position={[0, WALL_HEIGHT + 0.28, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={SLATE_DARK_MAT}>
                <boxGeometry args={[vw + 0.46, 0.62, 0.44]} />
              </mesh>
              <mesh position={[0, 0.34, vd / 2 + 0.06]} material={GOLD_BASIC_MAT}>
                <boxGeometry args={[vw + 0.48, 0.08, 0.46]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.29]}>
                <planeGeometry args={[vw + 0.2, 0.56]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>
            </group>

            {/* Dual Industrial Chrome Gantry Truss Columns */}
            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`rob-truss-${idx}`} position={[px, 0.18, vd / 2 - 0.2]}>
                <mesh position={[0, 0.09, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
                <mesh position={[0, WALL_HEIGHT * 0.4, 0]} geometry={TRUSS_RING_GEOM} material={GOLD_BASIC_MAT} />
                <mesh position={[0, WALL_HEIGHT * 0.78, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
              </group>
            ))}

            {/* Foreground Right: Robotics Command & Telemetry Console */}
            <group position={[vw * 0.22, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.46, 0]} receiveShadow geometry={COUNTER_BODY_GEOM} material={SLATE_MID_MAT} />
              <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.46, 0.39]} geometry={COUNTER_FRONT_GEOM} material={brandStandardMat} />
              <mesh position={[-0.42, 1.14, 0.05]} rotation={[0, -0.25, 0]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0.12, 1.14, 0.02]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0.58, 1.06, 0.12]} geometry={SHELF_SPHERE_GEOM} material={GOLD_BASIC_MAT} />
            </group>

            {/* Foreground/Midground Left: 6-Axis Articulated Cobot Test Cell */}
            <group position={[-vw * 0.22, 0.18, vd * 0.14]}>
              <mesh position={[0, 0.42, 0]} receiveShadow geometry={PEDESTAL_ONE_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={GOLD_BASIC_MAT} />
              <mesh position={[0, 0.98, 0]} geometry={ROBOT_BASE_GEOM} material={CHROME_PILLAR_MAT} />
              <group ref={showcasePrimaryRef as React.RefObject<THREE.Group>} position={[0, 1.14, 0]}>
                <mesh position={[0, 0.34, 0]} geometry={ROBOT_LOWER_ARM_GEOM} material={brandStandardMat} />
                <mesh position={[0, 0.72, 0]} geometry={ROBOT_JOINT_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh
                  position={[0.2, 0.96, 0.12]}
                  rotation={[0.35, 0, -0.45]}
                  geometry={ROBOT_UPPER_ARM_GEOM}
                  material={CHROME_PILLAR_MAT}
                />
              </group>
            </group>

            {/* Midground Center: Kinetix Rover AMR-200 Autonomous Warehouse Robot */}
            <group position={[0.02, 0.18, 0.15]}>
              <mesh position={[0, 0.15, 0]} geometry={AMR_CHASSIS_GEOM} material={brandStandardMat} />
              <mesh position={[0, 0.32, 0.2]} geometry={AMR_LIDAR_GEOM} material={CYAN_GLOW_MAT} />
              <mesh
                ref={showcaseSecondaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 0.46, -0.08]}
                geometry={SHELF_BOX_GEOM}
                material={GOLD_SHOWCASE_MAT}
              />
            </group>
          </group>
        )}

        {/* -------------------- BOOTH 5: ART & DESIGN STUDIO -------------------- */}
        {theme === 'design' && (
          <group>
            {/* Sculptural Gallery Fascia & Suspended Double-Ring Halo Chandelier */}
            <group position={[0, WALL_HEIGHT + 0.28, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={VIOLET_ART_MAT}>
                <boxGeometry args={[vw + 0.44, 0.6, 0.4]} />
              </mesh>
              <mesh position={[0, 0.34, vd / 2 + 0.08]} material={MAGENTA_ART_MAT}>
                <boxGeometry args={[vw + 0.48, 0.1, 0.44]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.28]}>
                <planeGeometry args={[vw + 0.2, 0.54]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>

              {/* Suspended Double-Ring Halo Chandeliers */}
              <group position={[0, -0.58, 0.1]}>
                <mesh rotation={[Math.PI / 2, 0.12, 0]} geometry={HALO_RING_LARGE_GEOM} material={WHITE_LIGHT_MAT} />
                <mesh
                  rotation={[Math.PI / 2, -0.18, 0]}
                  position={[0, -0.24, 0]}
                  geometry={HALO_RING_SMALL_GEOM}
                  material={MAGENTA_ART_MAT}
                />
              </group>
            </group>

            {/* Foreground Right: Sculptural Studio Reception Podium */}
            <group position={[vw * 0.22, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.46, 0]} receiveShadow geometry={COUNTER_BODY_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={VIOLET_ART_MAT} />
              <mesh position={[0, 0.46, 0.39]} geometry={COUNTER_FRONT_GEOM} material={MAGENTA_ART_MAT} />
              <mesh position={[0, 1.12, 0.05]} geometry={MONITOR_GEOM} material={GOLD_SHOWCASE_MAT} />
            </group>

            {/* Foreground Left: Artist Easel with Framed Canvas & Sculptural Luminaire Plinth */}
            <group position={[-vw * 0.24, 0.18, vd * 0.18]}>
              <mesh position={[0, 0.42, 0]} receiveShadow geometry={PEDESTAL_ONE_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={MAGENTA_ART_MAT} />
              <mesh
                ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.22, 0]}
                geometry={SHOWCASE_TORUS_GEOM}
                material={brandFlatMat}
              />
            </group>

            {/* Midground Center-Left: Studio Artist Easel */}
            <group position={[-0.25, 0.18, 0.05]} rotation={[0, 0.22, 0]}>
              <mesh position={[0, 0.82, 0]} rotation={[-0.12, 0, 0]} geometry={EASEL_LEG_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[0, 0.96, 0.06]} rotation={[-0.12, 0, 0]} geometry={EASEL_FRAME_GEOM} material={GOLD_SHOWCASE_MAT} />
              <mesh
                position={[0, 0.96, 0.08]}
                rotation={[-0.12, 0, 0]}
                scale={[0.84, 0.84, 1]}
                geometry={EASEL_FRAME_GEOM}
                material={MAGENTA_ART_MAT}
              />
            </group>

            {/* Background Wall: 3D Hexagonal Acoustic PET Tile Mosaic */}
            <group position={[-0.45, 2.55, -vd / 2 + 0.35]}>
              {[
                [-0.55, 0.2],
                [0.0, 0.35],
                [0.55, 0.2],
                [-0.28, -0.22],
                [0.28, -0.22],
              ].map(([hx, hy], idx) => (
                <mesh
                  key={`hex-${idx}`}
                  position={[hx, hy, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  geometry={HEX_TILE_GEOM}
                  material={idx % 2 === 0 ? MAGENTA_ART_MAT : GOLD_SHOWCASE_MAT}
                />
              ))}
            </group>
          </group>
        )}

        {/* -------------------- BOOTH 6: GREEN ENERGY PAVILION -------------------- */}
        {theme === 'energy' && (
          <group>
            {/* Eco-Architectural Roof with 4 Angled Bifacial Solar PV Panels */}
            <group position={[0, WALL_HEIGHT + 0.28, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={DARK_NAVY_MAT}>
                <boxGeometry args={[vw + 0.44, 0.58, 0.4]} />
              </mesh>
              <mesh position={[0, 0.33, vd / 2 + 0.08]} material={EMERALD_GLOW_MAT}>
                <boxGeometry args={[vw + 0.48, 0.09, 0.44]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.28]}>
                <planeGeometry args={[vw + 0.2, 0.54]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>

              {/* 4 Tilted Rooftop Solar PV Modules (Visible from front elevation!) */}
              {[-2.1, -0.7, 0.7, 2.1].map((sx, idx) => (
                <mesh
                  key={`solar-pv-${idx}`}
                  position={[sx, 0.48, 0.35]}
                  rotation={[0.42, 0, 0]}
                  geometry={SOLAR_PANEL_GEOM}
                  material={SOLAR_CELL_MAT}
                />
              ))}
            </group>

            {/* Living Green Biophilic Columns at Front Corners */}
            {[-vw / 2 + 0.24, vw / 2 - 0.24].map((px, idx) => (
              <group key={`eco-col-${idx}`} position={[px, 0.18, vd / 2 - 0.2]}>
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={WHITE_GLOSS_MAT} />
                {[0.65, 1.35, 2.05].map((py, bIdx) => (
                  <mesh
                    key={`vine-${bIdx}`}
                    position={[0, py, 0.16]}
                    geometry={PLANT_BUSH_GEOM}
                    material={EMERALD_PLANT_MAT}
                  />
                ))}
              </group>
            ))}

            {/* Foreground Right: Eco-White & Emerald Smart Grid Demo Counter */}
            <group position={[vw * 0.22, 0.18, vd * 0.22]}>
              <mesh position={[0, 0.46, 0]} receiveShadow geometry={COUNTER_BODY_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={EMERALD_PLANT_MAT} />
              <mesh position={[0, 0.46, 0.39]} geometry={COUNTER_FRONT_GEOM} material={brandStandardMat} />
              <mesh position={[-0.32, 1.12, 0.05]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0.32, 1.12, 0.05]} geometry={SHELF_BOX_GEOM} material={SOLAR_CELL_MAT} />
            </group>

            {/* Foreground Left: Solaris ChargeBox 22kW EV Fast-Charger Totem */}
            <group position={[-vw * 0.24, 0.18, vd * 0.18]}>
              <mesh position={[0, 0.81, 0]} geometry={EV_CHARGER_BODY_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 1.02, 0.18]} geometry={TABLET_STAND_GEOM} material={EMERALD_GLOW_MAT} />
              <mesh
                ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.82, 0]}
                geometry={SHOWCASE_OCTA_GEOM}
                material={brandFlatMat}
              />
            </group>

            {/* Background Right: Twin Solaris PowerWall 10kWh LFP Battery Packs */}
            <group position={[vw * 0.33, 1.32, -vd / 2 + 0.42]}>
              <mesh geometry={POWERWALL_BODY_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.22, 0.12]} geometry={SERVER_LED_STRIP_GEOM} material={EMERALD_GLOW_MAT} />
              <mesh position={[0, 0.0, 0.12]} geometry={SERVER_LED_STRIP_GEOM} material={EMERALD_GLOW_MAT} />
              <mesh position={[0, -0.22, 0.12]} geometry={SERVER_LED_STRIP_GEOM} material={CYAN_GLOW_MAT} />
            </group>
          </group>
        )}

        {/* ================================================================
            4. GRAND STOREFRONT SIGNBOARD (Positioned on Front Roof Crown)
               Readable both from Front-Facing Eye-Level Camera & Isometric Overview!
           ================================================================ */}
        <Billboard position={[0, WALL_HEIGHT + 1.18, vd / 2 - 0.15]}>
          <mesh
            geometry={SIGN_BILLBOARD_GEOM}
            scale={active ? [1.06, 1.06, 1] : [1, 1, 1]}
          >
            <meshBasicMaterial map={currentSignTexture} transparent depthWrite={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);
