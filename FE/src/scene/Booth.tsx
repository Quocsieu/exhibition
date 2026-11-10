import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth as BoothType } from '../types/expo';
import {
  createBoothFasciaTexture,
  createBoothPosterTexture,
  createBoothSignTexture,
} from './sceneTextures';

export interface BoothProps {
  booth: BoothType;
  productCount: number;
  isSelected: boolean;
  onSelect: (booth: BoothType) => void;
}

type BoothThemeKind = 'tech' | 'living' | 'coffee' | 'robotics' | 'design' | 'energy';

function resolveBoothTheme(booth: BoothType): BoothThemeKind {
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
const TRUSS_PILLAR_GEOM = new THREE.CylinderGeometry(0.11, 0.11, WALL_HEIGHT, 10);
const TRUSS_RING_GEOM = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 10);

const COUNTER_BODY_GEOM = new THREE.BoxGeometry(1.76, 0.92, 0.74);
const COUNTER_TOP_GEOM = new THREE.BoxGeometry(1.88, 0.07, 0.84);
const COUNTER_FRONT_GEOM = new THREE.BoxGeometry(1.54, 0.64, 0.04);
const MONITOR_GEOM = new THREE.BoxGeometry(0.5, 0.32, 0.05);
const TABLET_STAND_GEOM = new THREE.BoxGeometry(0.28, 0.22, 0.04);
const STOOL_POLE_GEOM = new THREE.CylinderGeometry(0.045, 0.045, 0.64, 8);
const STOOL_SEAT_GEOM = new THREE.CylinderGeometry(0.22, 0.19, 0.08, 12);

const PEDESTAL_ONE_GEOM = new THREE.CylinderGeometry(0.46, 0.52, 0.84, 16);
const PEDESTAL_ONE_RING_GEOM = new THREE.CylinderGeometry(0.49, 0.49, 0.05, 16);
const SHOWCASE_OCTA_GEOM = new THREE.OctahedronGeometry(0.32, 0);
const SHOWCASE_HOLO_RING_GEOM = new THREE.TorusGeometry(0.42, 0.028, 10, 24);

const PEDESTAL_TWO_GEOM = new THREE.CylinderGeometry(0.38, 0.44, 0.72, 14);
const PEDESTAL_TWO_RING_GEOM = new THREE.CylinderGeometry(0.41, 0.41, 0.04, 14);
const SHOWCASE_TORUS_GEOM = new THREE.TorusKnotGeometry(0.2, 0.055, 28, 6);

const SHELF_BACK_GEOM = new THREE.BoxGeometry(1.42, 2.25, 0.08);
const SHELF_BOARD_GEOM = new THREE.BoxGeometry(1.36, 0.06, 0.42);
const SHELF_BOX_GEOM = new THREE.BoxGeometry(0.28, 0.28, 0.24);
const SHELF_CYL_GEOM = new THREE.CylinderGeometry(0.14, 0.14, 0.26, 10);
const SHELF_SPHERE_GEOM = new THREE.SphereGeometry(0.14, 10, 10);

const LOUVER_FIN_GEOM = new THREE.BoxGeometry(0.14, WALL_HEIGHT - 0.24, 0.14);
const CEIL_LIGHT_GEOM = new THREE.BoxGeometry(1.35, 0.06, 0.18);
const SIGN_BILLBOARD_GEOM = new THREE.PlaneGeometry(4.45, 1.52);

const POSTER_FRAME_GEOM = new THREE.BoxGeometry(2.38, 1.52, 0.08);
const POSTER_PLANE_GEOM = new THREE.PlaneGeometry(2.22, 1.38);

const TOTEM_BODY_GEOM = new THREE.BoxGeometry(0.56, 1.88, 0.16);
const TOTEM_BASE_GEOM = new THREE.BoxGeometry(0.68, 0.08, 0.36);
const TOTEM_SCREEN_GEOM = new THREE.PlaneGeometry(0.46, 1.15);

const BEACON_RING_GEOM = new THREE.RingGeometry(0.34, 0.48, 24);
const BEACON_CORE_GEOM = new THREE.CircleGeometry(0.26, 20);

// Industry-Specific Shared Geometries
const SERVER_RACK_GEOM = new THREE.BoxGeometry(0.62, 1.85, 0.56);
const SERVER_LED_STRIP_GEOM = new THREE.BoxGeometry(0.46, 0.06, 0.02);

const DESK_TOP_GEOM = new THREE.BoxGeometry(1.52, 0.07, 0.78);
const DESK_LEG_GEOM = new THREE.BoxGeometry(0.08, 0.74, 0.58);
const CHAIR_SEAT_GEOM = new THREE.BoxGeometry(0.48, 0.07, 0.46);
const CHAIR_BACK_GEOM = new THREE.BoxGeometry(0.46, 0.56, 0.07);
const LAMP_STEM_GEOM = new THREE.CylinderGeometry(0.03, 0.05, 1.45, 8);
const LAMP_SHADE_GEOM = new THREE.ConeGeometry(0.24, 0.28, 12);

const ROASTER_DRUM_GEOM = new THREE.CylinderGeometry(0.32, 0.32, 0.58, 14);
const ROASTER_HOPPER_GEOM = new THREE.ConeGeometry(0.24, 0.34, 12);
const COFFEE_BAG_GEOM = new THREE.BoxGeometry(0.34, 0.44, 0.24);
const ESPRESSO_MACHINE_GEOM = new THREE.BoxGeometry(0.58, 0.42, 0.38);

const ROBOT_BASE_GEOM = new THREE.CylinderGeometry(0.34, 0.4, 0.28, 14);
const ROBOT_LOWER_ARM_GEOM = new THREE.BoxGeometry(0.16, 0.68, 0.16);
const ROBOT_UPPER_ARM_GEOM = new THREE.BoxGeometry(0.14, 0.56, 0.14);
const ROBOT_JOINT_GEOM = new THREE.SphereGeometry(0.14, 10, 10);
const AMR_CHASSIS_GEOM = new THREE.BoxGeometry(0.92, 0.24, 0.68);
const AMR_LIDAR_GEOM = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12);

const HEX_TILE_GEOM = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6);
const HALO_RING_LARGE_GEOM = new THREE.TorusGeometry(0.68, 0.045, 10, 28);
const HALO_RING_SMALL_GEOM = new THREE.TorusGeometry(0.42, 0.035, 10, 24);

const SOLAR_PANEL_GEOM = new THREE.BoxGeometry(1.75, 0.06, 1.05);
const POWERWALL_BODY_GEOM = new THREE.BoxGeometry(0.78, 1.32, 0.2);
const EV_CHARGER_BODY_GEOM = new THREE.BoxGeometry(0.44, 1.54, 0.32);

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
const WHITE_GLOSS_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 });
const LIGHT_SURFACE_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.34 });
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
  roughness: 0.55,
  metalness: 0.08,
});
const BURLAP_MAT = new THREE.MeshStandardMaterial({
  color: '#a16207',
  roughness: 0.78,
});
const SOLAR_CELL_MAT = new THREE.MeshStandardMaterial({
  color: '#0284c7',
  metalness: 0.65,
  roughness: 0.18,
});
const EMERALD_PLANT_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.5,
});
const GOLD_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const EMERALD_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const WHITE_LIGHT_MAT = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

interface ThemeProps {
  theme: BoothThemeKind;
  vw: number;
  vd: number;
  brandStandardMat: THREE.MeshStandardMaterial;
  brandFlatMat: THREE.MeshStandardMaterial;
  brandBasicMat: THREE.MeshBasicMaterial;
  showcasePrimaryRef: React.RefObject<THREE.Object3D | null>;
  showcaseSecondaryRef: React.RefObject<THREE.Object3D | null>;
}

const BoothThemeShowcase: React.FC<ThemeProps> = React.memo(
  ({
    theme,
    vw,
    vd,
    brandStandardMat,
    brandFlatMat,
    brandBasicMat,
    showcasePrimaryRef,
    showcaseSecondaryRef,
  }) => {
    switch (theme) {
      case 'tech':
        return (
          <group>
            {/* Front-Left Hero: Holographic AR & IoT Sensor Core */}
            <group position={[-vw * 0.24, 0.18, vd * 0.18]}>
              <mesh position={[0, 0.42, 0]} receiveShadow geometry={PEDESTAL_ONE_GEOM} material={LIGHT_SURFACE_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={brandBasicMat} />
              <group ref={showcasePrimaryRef as React.RefObject<THREE.Group>} position={[0, 1.24, 0]}>
                <mesh geometry={SHOWCASE_OCTA_GEOM} material={brandFlatMat} />
                <mesh rotation={[Math.PI / 3, 0, 0]} geometry={SHOWCASE_HOLO_RING_GEOM} material={CYAN_GLOW_MAT} />
              </group>
            </group>

            {/* Right Wing Edge Server Rack & Telemetry Hub */}
            <group position={[vw * 0.34, 0.18, -vd * 0.18]}>
              <mesh position={[0, 0.92, 0]} geometry={SERVER_RACK_GEOM} material={DARK_NAVY_MAT} />
              {[0.55, 0.85, 1.15, 1.45].map((ly, i) => (
                <mesh
                  key={`srv-led-${i}`}
                  position={[0, ly, 0.29]}
                  geometry={SERVER_LED_STRIP_GEOM}
                  material={i % 2 === 0 ? CYAN_GLOW_MAT : brandBasicMat}
                />
              ))}
            </group>

            {/* Center Pedestal: Smart AetherGlass AR Display */}
            <group position={[0.05, 0.18, -0.15]}>
              <mesh position={[0, 0.36, 0]} geometry={PEDESTAL_TWO_GEOM} material={SLATE_DARK_MAT} />
              <mesh position={[0, 0.73, 0]} geometry={PEDESTAL_TWO_RING_GEOM} material={CYAN_GLOW_MAT} />
              <mesh
                ref={showcaseSecondaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.02, 0]}
                geometry={SHOWCASE_TORUS_GEOM}
                material={CHROME_PILLAR_MAT}
              />
            </group>
          </group>
        );

      case 'living':
        return (
          <group>
            {/* Front-Left Showroom: Fjäll Motorized Standing Desk + AirMesh Ergonomic Chair */}
            <group position={[-vw * 0.18, 0.18, vd * 0.08]}>
              {/* Standing Desk */}
              <mesh position={[0, 0.76, 0]} geometry={DESK_TOP_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[-0.58, 0.38, 0]} geometry={DESK_LEG_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0.58, 0.38, 0]} geometry={DESK_LEG_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.98, -0.14]} geometry={MONITOR_GEOM} material={DARK_NAVY_MAT} />
              {/* Ergonomic Chair */}
              <group position={[0, 0, 0.56]}>
                <mesh position={[0, 0.46, 0]} geometry={CHAIR_SEAT_GEOM} material={SLATE_DARK_MAT} />
                <mesh position={[0, 0.78, 0.2]} geometry={CHAIR_BACK_GEOM} material={brandStandardMat} />
                <mesh position={[0, 0.23, 0]} geometry={STOOL_POLE_GEOM} material={CHROME_PILLAR_MAT} />
              </group>
              {/* Nordic Floor Lamp */}
              <group position={[-0.95, 0, -0.25]}>
                <mesh position={[0, 0.72, 0]} geometry={LAMP_STEM_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh position={[0, 1.48, 0]} geometry={LAMP_SHADE_GEOM} material={WHITE_LIGHT_MAT} />
              </group>
            </group>

            {/* Right-Back Architectural Sculpture Pedestal */}
            <group position={[vw * 0.28, 0.18, -vd * 0.18]}>
              <mesh position={[0, 0.36, 0]} geometry={PEDESTAL_TWO_GEOM} material={WARM_OAK_MAT} />
              <mesh position={[0, 0.73, 0]} geometry={PEDESTAL_TWO_RING_GEOM} material={brandBasicMat} />
              <mesh
                ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.06, 0]}
                geometry={SHOWCASE_OCTA_GEOM}
                material={EMERALD_PLANT_MAT}
              />
            </group>
          </group>
        );

      case 'coffee':
        return (
          <group>
            {/* Front-Left Hero: Artisanal Copper Drum Coffee Roaster */}
            <group position={[-vw * 0.24, 0.18, vd * 0.16]}>
              <mesh position={[0, 0.42, 0]} geometry={PEDESTAL_ONE_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={GOLD_BASIC_MAT} />
              <group position={[0, 1.12, 0]}>
                <mesh
                  rotation={[0, 0, Math.PI / 2]}
                  geometry={ROASTER_DRUM_GEOM}
                  material={COPPER_CRAFT_MAT}
                />
                <mesh position={[0, 0.42, 0]} geometry={ROASTER_HOPPER_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh
                  ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                  position={[0, 0, 0.34]}
                  geometry={SHOWCASE_HOLO_RING_GEOM}
                  material={GOLD_SHOWCASE_MAT}
                />
              </group>
            </group>

            {/* Stacked Cau Dat Arabica Burlap Sacks & Specialty Gift Boxes */}
            <group position={[0.06, 0.18, -0.22]}>
              <mesh position={[-0.22, 0.22, 0]} geometry={COFFEE_BAG_GEOM} material={BURLAP_MAT} />
              <mesh position={[0.18, 0.22, 0.06]} geometry={COFFEE_BAG_GEOM} material={BURLAP_MAT} />
              <mesh position={[-0.02, 0.62, 0.02]} geometry={COFFEE_BAG_GEOM} material={brandStandardMat} />
            </group>

            {/* Commercial Espresso Bar Machine on Counter */}
            <mesh
              position={[vw * 0.22, 1.28, vd * 0.22]}
              geometry={ESPRESSO_MACHINE_GEOM}
              material={COPPER_CRAFT_MAT}
            />
          </group>
        );

      case 'robotics':
        return (
          <group>
            {/* Front-Left Hero: 6-Axis Articulated Collaborative Robot Arm (Cobot) */}
            <group position={[-vw * 0.22, 0.18, vd * 0.14]}>
              <mesh position={[0, 0.42, 0]} geometry={PEDESTAL_ONE_GEOM} material={SLATE_DARK_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={GOLD_BASIC_MAT} />
              <mesh position={[0, 0.98, 0]} geometry={ROBOT_BASE_GEOM} material={DARK_NAVY_MAT} />
              <group ref={showcasePrimaryRef as React.RefObject<THREE.Group>} position={[0, 1.12, 0]}>
                <mesh position={[0, 0.32, 0]} geometry={ROBOT_LOWER_ARM_GEOM} material={brandStandardMat} />
                <mesh position={[0, 0.68, 0]} geometry={ROBOT_JOINT_GEOM} material={GOLD_SHOWCASE_MAT} />
                <mesh
                  position={[0.18, 0.92, 0.12]}
                  rotation={[0.35, 0, -0.45]}
                  geometry={ROBOT_UPPER_ARM_GEOM}
                  material={CHROME_PILLAR_MAT}
                />
              </group>
            </group>

            {/* Center Floor Pad: Kinetix Rover AMR-200 Autonomous Warehouse Robot */}
            <group position={[0.08, 0.18, 0.05]}>
              <mesh position={[0, 0.14, 0]} geometry={AMR_CHASSIS_GEOM} material={brandStandardMat} />
              <mesh position={[0, 0.28, 0.18]} geometry={AMR_LIDAR_GEOM} material={CYAN_GLOW_MAT} />
              <mesh
                ref={showcaseSecondaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 0.42, -0.08]}
                geometry={SHELF_BOX_GEOM}
                material={GOLD_SHOWCASE_MAT}
              />
            </group>
          </group>
        );

      case 'design':
        return (
          <group>
            {/* Backwall 3D Acoustic Hexagonal Tile Art Mosaic */}
            <group position={[0.35, 2.05, -vd / 2 + 0.36]}>
              {[
                [-0.65, 0.28],
                [-0.22, 0.52],
                [0.22, 0.28],
                [0.65, 0.52],
                [-0.44, -0.22],
                [0.0, -0.22],
                [0.44, -0.22],
              ].map(([hx, hy], idx) => (
                <mesh
                  key={`hex-${idx}`}
                  position={[hx, hy, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  geometry={HEX_TILE_GEOM}
                  material={idx % 2 === 0 ? brandStandardMat : GOLD_SHOWCASE_MAT}
                />
              ))}
            </group>

            {/* Suspended Double-Ring Halo Chandelier */}
            <group position={[0, WALL_HEIGHT - 0.38, 0.15]}>
              <mesh
                rotation={[Math.PI / 2, 0.12, 0]}
                geometry={HALO_RING_LARGE_GEOM}
                material={WHITE_LIGHT_MAT}
              />
              <mesh
                rotation={[Math.PI / 2, -0.18, 0]}
                position={[0, -0.22, 0]}
                geometry={HALO_RING_SMALL_GEOM}
                material={brandBasicMat}
              />
            </group>

            {/* Front-Left Sculptural Luminaire Pedestal */}
            <group position={[-vw * 0.24, 0.18, vd * 0.18]}>
              <mesh position={[0, 0.42, 0]} geometry={PEDESTAL_ONE_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.85, 0]} geometry={PEDESTAL_ONE_RING_GEOM} material={brandBasicMat} />
              <mesh
                ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.2, 0]}
                geometry={SHOWCASE_TORUS_GEOM}
                material={brandFlatMat}
              />
            </group>
          </group>
        );

      case 'energy':
        return (
          <group>
            {/* Rooftop Angled Bifacial Solar PV Array */}
            <group position={[0, WALL_HEIGHT + 0.62, -0.1]}>
              <mesh
                position={[-1.05, 0, 0]}
                rotation={[0.32, 0, 0]}
                geometry={SOLAR_PANEL_GEOM}
                material={SOLAR_CELL_MAT}
              />
              <mesh
                position={[1.05, 0, 0]}
                rotation={[0.32, 0, 0]}
                geometry={SOLAR_PANEL_GEOM}
                material={SOLAR_CELL_MAT}
              />
            </group>

            {/* Back-Right Solaris LFP PowerWall 10kWh Battery Unit */}
            <group position={[vw * 0.31, 1.25, -vd / 2 + 0.4]}>
              <mesh geometry={POWERWALL_BODY_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh position={[0, 0.15, 0.11]} geometry={SERVER_LED_STRIP_GEOM} material={EMERALD_GLOW_MAT} />
              <mesh position={[0, -0.15, 0.11]} geometry={SERVER_LED_STRIP_GEOM} material={CYAN_GLOW_MAT} />
            </group>

            {/* Front-Left Solaris ChargeBox 22kW Smart EV Supercharger Totem */}
            <group position={[-vw * 0.24, 0.18, vd * 0.18]}>
              <mesh position={[0, 0.77, 0]} geometry={EV_CHARGER_BODY_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.95, 0.17]} geometry={TABLET_STAND_GEOM} material={EMERALD_GLOW_MAT} />
              <mesh
                ref={showcasePrimaryRef as React.RefObject<THREE.Mesh>}
                position={[0, 1.72, 0]}
                geometry={SHOWCASE_OCTA_GEOM}
                material={brandFlatMat}
              />
            </group>
          </group>
        );
    }
  }
);

export const Booth: React.FC<BoothProps> = React.memo(
  ({ booth, productCount, isSelected, onSelect }) => {
    const [hovered, setHovered] = useState(false);
    const showcasePrimaryRef = useRef<THREE.Object3D | null>(null);
    const showcaseSecondaryRef = useRef<THREE.Object3D | null>(null);
    const beaconRingRef = useRef<THREE.Mesh>(null);

    const w = booth.width || 5.6;
    const d = booth.depth || 4.2;
    // Open-front architectural framing extends slightly wider/deeper visually
    const vw = Math.max(w, 5.8);
    const vd = Math.max(d, 4.3);
    const active = hovered || isSelected;
    const theme = useMemo(() => resolveBoothTheme(booth), [booth]);

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

    // Pre-generate and cache Fascia, Poster, Idle Sign, and Active Sign textures (PERF-05)
    const { fasciaTexture, posterTexture, idleSignTexture, activeSignTexture } = useMemo(() => {
      return {
        fasciaTexture: createBoothFasciaTexture({
          name: booth.name,
          category: booth.category,
          color: booth.color,
        }),
        posterTexture: createBoothPosterTexture({
          name: booth.name,
          category: booth.category,
          tagline: booth.tagline,
          color: booth.color,
          productCount,
        }),
        idleSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.category,
          productCount,
          color: booth.color,
          active: false,
        }),
        activeSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.category,
          productCount,
          color: booth.color,
          active: true,
        }),
      };
    }, [booth.name, booth.category, booth.tagline, productCount, booth.color]);

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
            1. STEPPED PAVILION FLOOR DECK & INTERACTIVE ENTRANCE BEACON
           ================================================================ */}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[vw + 0.34, 0.05, vd + 0.34]} />
          <meshBasicMaterial
            color={booth.color}
            transparent
            opacity={active ? 1.0 : 0.72}
          />
        </mesh>

        <mesh
          position={[0, 0.09, 0]}
          receiveShadow
          material={active ? WHITE_GLOSS_MAT : LIGHT_SURFACE_MAT}
        >
          <boxGeometry args={[vw, 0.18, vd]} />
        </mesh>

        <mesh position={[0, 0.185, 0.1]} receiveShadow material={CARPET_MAT}>
          <boxGeometry args={[vw - 0.52, 0.015, vd - 0.48]} />
        </mesh>

        {/* Front Welcome Step Ramp & Glowing Interactive Point Beacon */}
        <group position={[0, 0.04, vd / 2 + 0.36]}>
          <mesh receiveShadow material={SLATE_DARK_MAT}>
            <boxGeometry args={[vw * 0.62, 0.06, 0.62]} />
          </mesh>
          <mesh position={[0, 0.036, 0]} material={brandBasicMat}>
            <boxGeometry args={[vw * 0.54, 0.012, 0.42]} />
          </mesh>

          {/* Interactive Walk-up Floor Beacon */}
          <group position={[-vw * 0.18, 0.045, 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh
              ref={beaconRingRef}
              geometry={BEACON_RING_GEOM}
              material={active ? GOLD_BASIC_MAT : brandBasicMat}
            />
            <mesh geometry={BEACON_CORE_GEOM} material={DARK_NAVY_MAT} />
          </group>
        </group>

        {/* ================================================================
            2. OPEN-FRONT ARCHITECTURAL BACKWALL, POSTER & LOUVERED WING
           ================================================================ */}
        {/* Main Structural Back Wall (Primary Shadow Caster 1/3) */}
        <mesh
          position={[0, WALL_HEIGHT / 2 + 0.18, -vd / 2 + 0.14]}
          castShadow
          receiveShadow
          material={DARK_NAVY_MAT}
        >
          <boxGeometry args={[vw, WALL_HEIGHT, 0.26]} />
        </mesh>

        {/* Brand Color Backwall Architectural Panel */}
        <mesh
          position={[0, WALL_HEIGHT / 2 + 0.18, -vd / 2 + 0.29]}
          material={brandStandardMat}
        >
          <boxGeometry args={[vw - 0.44, WALL_HEIGHT - 0.36, 0.05]} />
        </mesh>

        {/* Backwall Info Poster & LED Presentation Display */}
        <group position={[0.55, 1.88, -vd / 2 + 0.36]}>
          <mesh geometry={POSTER_FRAME_GEOM} material={DARK_NAVY_MAT} />
          <mesh position={[0, 0, 0.045]} geometry={POSTER_PLANE_GEOM}>
            <meshBasicMaterial map={posterTexture} />
          </mesh>
        </group>

        {/* Back-Left 3-Tier Illuminated Product Display Rack */}
        <group position={[-vw * 0.3, 0.18, -vd / 2 + 0.46]}>
          <mesh position={[0, 1.12, -0.16]} geometry={SHELF_BACK_GEOM} material={SLATE_DARK_MAT} />
          {[0.68, 1.32, 1.96].map((shelfY, idx) => (
            <group key={`shelf-${idx}`} position={[0, shelfY, 0]}>
              <mesh geometry={SHELF_BOARD_GEOM} material={WHITE_GLOSS_MAT} />
              <mesh
                position={[-0.34, 0.17, 0]}
                geometry={SHELF_BOX_GEOM}
                material={brandStandardMat}
              />
              <mesh
                position={[0.02, 0.16, 0]}
                geometry={SHELF_CYL_GEOM}
                material={GOLD_SHOWCASE_MAT}
              />
              <mesh
                position={[0.36, 0.16, 0]}
                geometry={SHELF_SPHERE_GEOM}
                material={CHROME_PILLAR_MAT}
              />
            </group>
          ))}
        </group>

        {/* Half-Depth Left Wing Partition Wall (Primary Shadow Caster 2/3) */}
        <group position={[-vw / 2 + 0.12, 0.18, 0]}>
          <mesh
            position={[0, WALL_HEIGHT / 2, -vd * 0.22]}
            castShadow
            receiveShadow
            material={SLATE_DARK_MAT}
          >
            <boxGeometry args={[0.2, WALL_HEIGHT, vd * 0.54]} />
          </mesh>
          {[-0.05, 0.42, 0.88].map((finZ, idx) => (
            <mesh
              key={`fin-${idx}`}
              position={[0.04, WALL_HEIGHT / 2, finZ]}
              geometry={LOUVER_FIN_GEOM}
              material={brandStandardMat}
            />
          ))}
        </group>

        {/* Front-Left Vertical Digital Info Totem */}
        <group position={[-vw / 2 + 0.36, 0.18, vd / 2 - 0.24]}>
          <mesh position={[0, 0.04, 0]} geometry={TOTEM_BASE_GEOM} material={DARK_NAVY_MAT} />
          <mesh position={[0, 0.98, 0]} geometry={TOTEM_BODY_GEOM} material={SLATE_DARK_MAT} />
          <mesh position={[0, 1.06, 0.085]} geometry={TOTEM_SCREEN_GEOM} material={brandBasicMat} />
        </group>

        {/* Front-Right Space-Frame Truss Pillar (Open Sightline into Interior) */}
        <group position={[vw / 2 - 0.18, 0.18, vd / 2 - 0.22]}>
          <mesh position={[0, 0.09, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
          <mesh
            position={[0, WALL_HEIGHT / 2, 0]}
            geometry={TRUSS_PILLAR_GEOM}
            material={CHROME_PILLAR_MAT}
          />
          <mesh
            position={[0, WALL_HEIGHT * 0.74, 0]}
            geometry={TRUSS_RING_GEOM}
            material={brandBasicMat}
          />
        </group>

        {/* Right Side Low Open Guardrail */}
        <mesh
          position={[vw / 2 - 0.15, 0.54, -0.12]}
          receiveShadow
          material={SLATE_MID_MAT}
        >
          <boxGeometry args={[0.14, 0.68, vd * 0.64]} />
        </mesh>

        {/* ================================================================
            3. OPEN-SKYLIGHT PORTAL ROOF CANOPY & 3D FASCIA HEADER
               (Open center cutout prevents occluding interior or visitors)
           ================================================================ */}
        <group position={[0, WALL_HEIGHT + 0.28, 0.06]}>
          {/* Front Fascia Structural Beam (Primary Shadow Caster 3/3) */}
          <mesh position={[0, 0, vd / 2 + 0.04]} castShadow receiveShadow material={DARK_NAVY_MAT}>
            <boxGeometry args={[vw + 0.36, 0.58, 0.36]} />
          </mesh>

          {/* Top Accent Trim on Front Fascia */}
          <mesh position={[0, 0.32, vd / 2 + 0.04]} material={brandStandardMat}>
            <boxGeometry args={[vw + 0.4, 0.1, 0.4]} />
          </mesh>

          {/* Front 3D Fascia Header Signboard */}
          <mesh position={[0, 0, vd / 2 + 0.23]}>
            <planeGeometry args={[vw + 0.18, 0.54]} />
            <meshBasicMaterial map={fasciaTexture} />
          </mesh>

          {/* Rear Canopy Header Beam */}
          <mesh position={[0, 0, -vd / 2 + 0.12]} material={DARK_NAVY_MAT}>
            <boxGeometry args={[vw + 0.36, 0.28, 0.48]} />
          </mesh>

          {/* Left & Right Cantilevered Portal Side Beams */}
          <mesh position={[-vw / 2 - 0.02, 0, 0]} material={DARK_NAVY_MAT}>
            <boxGeometry args={[0.32, 0.26, vd + 0.2]} />
          </mesh>
          <mesh position={[vw / 2 + 0.02, 0, 0]} material={DARK_NAVY_MAT}>
            <boxGeometry args={[0.32, 0.26, vd + 0.2]} />
          </mesh>

          {/* Suspended Decorative LED Light Bars */}
          <mesh position={[-vw * 0.22, -0.1, -0.2]} geometry={CEIL_LIGHT_GEOM} material={WHITE_LIGHT_MAT} />
          <mesh position={[vw * 0.22, -0.1, -0.2]} geometry={CEIL_LIGHT_GEOM} material={WHITE_LIGHT_MAT} />
        </group>

        {/* ================================================================
            4. RECEPTION COUNTER DESK & INDUSTRY-SPECIFIC 3D SHOWCASE
           ================================================================ */}
        <group position={[vw * 0.22, 0.18, vd * 0.22]}>
          <mesh
            position={[0, 0.46, 0]}
            receiveShadow
            geometry={COUNTER_BODY_GEOM}
            material={WHITE_GLOSS_MAT}
          />
          <mesh position={[0, 0.94, 0]} geometry={COUNTER_TOP_GEOM} material={DARK_NAVY_MAT} />
          <mesh
            position={[0, 0.46, 0.38]}
            geometry={COUNTER_FRONT_GEOM}
            material={brandStandardMat}
          />
          <mesh
            position={[-0.32, 1.12, 0.06]}
            rotation={[0, -0.22, 0]}
            geometry={MONITOR_GEOM}
            material={SLATE_DARK_MAT}
          />
          <mesh
            position={[0.38, 1.06, 0.14]}
            rotation={[-0.35, 0.2, 0]}
            geometry={TABLET_STAND_GEOM}
            material={brandBasicMat}
          />
          <group position={[0.12, 0, -0.62]}>
            <mesh position={[0, 0.32, 0]} geometry={STOOL_POLE_GEOM} material={CHROME_PILLAR_MAT} />
            <mesh position={[0, 0.65, 0]} geometry={STOOL_SEAT_GEOM} material={DARK_NAVY_MAT} />
          </group>
        </group>

        {/* Industry-Specific 3D Showcase Props (Tech / Living / Coffee / Robotics / Design / Energy) */}
        <BoothThemeShowcase
          theme={theme}
          vw={vw}
          vd={vd}
          brandStandardMat={brandStandardMat}
          brandFlatMat={brandFlatMat}
          brandBasicMat={brandBasicMat}
          showcasePrimaryRef={showcasePrimaryRef}
          showcaseSecondaryRef={showcaseSecondaryRef}
        />

        {/* ================================================================
            5. FLOATING 3D INTERACTIVE SIGNBOARD BILLBOARD
           ================================================================ */}
        <Billboard position={[0, WALL_HEIGHT + 1.68, 0]}>
          <mesh
            geometry={SIGN_BILLBOARD_GEOM}
            scale={active ? [1.08, 1.08, 1] : [1, 1, 1]}
          >
            <meshBasicMaterial map={currentSignTexture} transparent depthWrite={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);
