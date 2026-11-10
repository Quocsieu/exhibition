import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth as BoothType } from '../types/expo';
import { createBoothFasciaTexture, createBoothSignTexture } from './sceneTextures';

export interface BoothProps {
  booth: BoothType;
  productCount: number;
  isSelected: boolean;
  onSelect: (booth: BoothType) => void;
}

const WALL_HEIGHT = 3.05;

// Shared module-level Geometries across all 6 booths (PERF-04)
const TRUSS_BASE_GEOM = new THREE.CylinderGeometry(0.18, 0.22, 0.16, 10);
const TRUSS_PILLAR_GEOM = new THREE.CylinderGeometry(0.1, 0.1, WALL_HEIGHT, 10);
const TRUSS_RING_GEOM = new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10);

const COUNTER_BODY_GEOM = new THREE.BoxGeometry(1.58, 0.88, 0.68);
const COUNTER_TOP_GEOM = new THREE.BoxGeometry(1.68, 0.06, 0.76);
const COUNTER_FRONT_GEOM = new THREE.BoxGeometry(1.38, 0.62, 0.03);
const MONITOR_GEOM = new THREE.BoxGeometry(0.46, 0.3, 0.05);
const STOOL_POLE_GEOM = new THREE.CylinderGeometry(0.04, 0.04, 0.64, 8);
const STOOL_SEAT_GEOM = new THREE.CylinderGeometry(0.2, 0.18, 0.08, 12);

const PEDESTAL_ONE_GEOM = new THREE.CylinderGeometry(0.38, 0.44, 0.8, 14);
const PEDESTAL_ONE_RING_GEOM = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14);
const SHOWCASE_OCTA_GEOM = new THREE.OctahedronGeometry(0.26, 0);

const PEDESTAL_TWO_GEOM = new THREE.CylinderGeometry(0.34, 0.38, 0.68, 14);
const PEDESTAL_TWO_RING_GEOM = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 14);
const SHOWCASE_TORUS_GEOM = new THREE.TorusKnotGeometry(0.16, 0.05, 24, 6);

const SHELF_BOARD_GEOM = new THREE.BoxGeometry(1.15, 0.06, 0.36);
const SHELF_BOX_GEOM = new THREE.BoxGeometry(0.24, 0.24, 0.22);
const SHELF_CYL_GEOM = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10);

const LOUVER_FIN_GEOM = new THREE.BoxGeometry(0.12, WALL_HEIGHT - 0.2, 0.12);
const CEIL_LIGHT_GEOM = new THREE.PlaneGeometry(0.75, 1.6);
const SIGN_BILLBOARD_GEOM = new THREE.PlaneGeometry(3.9, 1.34);

const LED_FRAME_GEOM = new THREE.BoxGeometry(1.95, 1.12, 0.06);
const LED_INNER_GEOM = new THREE.PlaneGeometry(1.8, 0.96);

// Shared module-level Materials across all 6 booths
const DARK_NAVY_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  roughness: 0.4,
  metalness: 0.25,
});
const SLATE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45 });
const SLATE_MID_MAT = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5 });
const WHITE_GLOSS_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28 });
const LIGHT_SURFACE_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
const CARPET_MAT = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.75 });
const CHROME_PILLAR_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  metalness: 0.7,
  roughness: 0.25,
});
const GOLD_SHOWCASE_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  metalness: 0.65,
  roughness: 0.22,
});
const GOLD_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const WHITE_LIGHT_MAT = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

export const Booth: React.FC<BoothProps> = React.memo(
  ({ booth, productCount, isSelected, onSelect }) => {
    const [hovered, setHovered] = useState(false);
    const showcaseLeftRef = useRef<THREE.Mesh>(null);
    const showcaseCenterRef = useRef<THREE.Mesh>(null);

    const w = booth.width || 4.8;
    const d = booth.depth || 3.8;
    const active = hovered || isSelected;

    const brandStandardMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.32,
          metalness: 0.18,
        }),
      [booth.color]
    );

    const brandFlatMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          metalness: 0.6,
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

    // Pre-generate and cache both idle and active sign textures so hovering
    // never allocates new CanvasTextures or leaks VRAM (PERF-05)
    const { fasciaTexture, idleSignTexture, activeSignTexture } = useMemo(() => {
      return {
        fasciaTexture: createBoothFasciaTexture({
          name: booth.name,
          category: booth.category,
          color: booth.color,
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
    }, [booth.name, booth.category, productCount, booth.color]);

    useEffect(() => {
      return () => {
        fasciaTexture.dispose();
        idleSignTexture.dispose();
        activeSignTexture.dispose();
      };
    }, [fasciaTexture, idleSignTexture, activeSignTexture]);

    const currentSignTexture = active ? activeSignTexture : idleSignTexture;

    useFrame(({ clock }, delta) => {
      const t = clock.getElapsedTime();
      if (showcaseLeftRef.current) {
        showcaseLeftRef.current.rotation.y += delta * 1.1;
        showcaseLeftRef.current.position.y = 1.12 + Math.sin(t * 2.4) * 0.05;
      }
      if (showcaseCenterRef.current) {
        showcaseCenterRef.current.rotation.y -= delta * 0.85;
        showcaseCenterRef.current.rotation.x = Math.sin(t * 1.6) * 0.25;
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
            1. STEPPED PAVILION FLOOR DECK & APPROACH ZONE
           ================================================================ */}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[w + 0.24, 0.05, d + 0.24]} />
          <meshBasicMaterial
            color={booth.color}
            transparent
            opacity={active ? 0.98 : 0.65}
          />
        </mesh>

        <mesh
          position={[0, 0.09, 0]}
          receiveShadow
          material={active ? WHITE_GLOSS_MAT : LIGHT_SURFACE_MAT}
        >
          <boxGeometry args={[w, 0.18, d]} />
        </mesh>

        <mesh position={[0, 0.185, 0.08]} receiveShadow material={CARPET_MAT}>
          <boxGeometry args={[w - 0.55, 0.015, d - 0.55]} />
        </mesh>

        <group position={[0, 0.04, d / 2 + 0.32]}>
          <mesh receiveShadow material={SLATE_DARK_MAT}>
            <boxGeometry args={[w * 0.58, 0.06, 0.56]} />
          </mesh>
          <mesh position={[0, 0.035, 0]} material={brandBasicMat}>
            <boxGeometry args={[w * 0.5, 0.01, 0.38]} />
          </mesh>
        </group>

        {/* ================================================================
            2. ARCHITECTURAL BACKWALL, LED SCREEN & LOUVERED WING WALLS
           ================================================================ */}
        {/* Main Structural Back Wall (Primary Shadow Caster 1/3) */}
        <mesh
          position={[0, WALL_HEIGHT / 2 + 0.18, -d / 2 + 0.14]}
          castShadow
          receiveShadow
          material={DARK_NAVY_MAT}
        >
          <boxGeometry args={[w, WALL_HEIGHT, 0.26]} />
        </mesh>

        <mesh
          position={[0, WALL_HEIGHT / 2 + 0.18, -d / 2 + 0.29]}
          material={brandStandardMat}
        >
          <boxGeometry args={[w - 0.48, WALL_HEIGHT - 0.42, 0.05]} />
        </mesh>

        <mesh
          position={[0.35, WALL_HEIGHT / 2 + 0.18, -d / 2 + 0.33]}
          material={SLATE_DARK_MAT}
        >
          <boxGeometry args={[w * 0.52, WALL_HEIGHT - 0.72, 0.06]} />
        </mesh>

        {/* Mounted 3D LED Presentation Screen */}
        <group position={[0.35, 1.82, -d / 2 + 0.38]}>
          <mesh geometry={LED_FRAME_GEOM} material={DARK_NAVY_MAT} />
          <mesh position={[0, 0, 0.032]} geometry={LED_INNER_GEOM} material={brandBasicMat} />
        </group>

        {/* Back-Left Wall Product Display Shelving Unit */}
        <group position={[-w * 0.31, 0.18, -d / 2 + 0.42]}>
          {[0.75, 1.35, 1.95].map((shelfY, idx) => (
            <group key={`shelf-${idx}`} position={[0, shelfY, 0]}>
              <mesh geometry={SHELF_BOARD_GEOM} material={LIGHT_SURFACE_MAT} />
              <mesh
                position={[-0.28, 0.16, 0]}
                geometry={SHELF_BOX_GEOM}
                material={brandStandardMat}
              />
              <mesh
                position={[0.24, 0.14, 0]}
                geometry={SHELF_CYL_GEOM}
                material={CHROME_PILLAR_MAT}
              />
            </group>
          ))}
        </group>

        {/* Left Wing Partition Wall (Primary Shadow Caster 2/3) */}
        <group position={[-w / 2 + 0.12, 0.18, 0]}>
          <mesh
            position={[0, WALL_HEIGHT / 2, -d * 0.18]}
            castShadow
            receiveShadow
            material={SLATE_DARK_MAT}
          >
            <boxGeometry args={[0.2, WALL_HEIGHT, d * 0.62]} />
          </mesh>
          {[-0.15, 0.28, 0.72].map((finZ, idx) => (
            <mesh
              key={`fin-${idx}`}
              position={[0.04, WALL_HEIGHT / 2, finZ]}
              geometry={LOUVER_FIN_GEOM}
              material={brandStandardMat}
            />
          ))}
        </group>

        {/* Front Space-Frame Truss Pillars */}
        {[
          [w / 2 - 0.18, d / 2 - 0.22],
          [-w / 2 + 0.18, d / 2 - 0.22],
        ].map(([px, pz], idx) => (
          <group key={`truss-${idx}`} position={[px, 0.18, pz]}>
            <mesh position={[0, 0.08, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
            <mesh
              position={[0, WALL_HEIGHT / 2, 0]}
              geometry={TRUSS_PILLAR_GEOM}
              material={CHROME_PILLAR_MAT}
            />
            <mesh
              position={[0, WALL_HEIGHT * 0.72, 0]}
              geometry={TRUSS_RING_GEOM}
              material={brandBasicMat}
            />
          </group>
        ))}

        {/* Right Side Low Display Rail */}
        <mesh
          position={[w / 2 - 0.15, 0.58, -0.15]}
          receiveShadow
          material={SLATE_MID_MAT}
        >
          <boxGeometry args={[0.14, 0.78, d * 0.68]} />
        </mesh>

        {/* ================================================================
            3. CANTILEVERED CANOPY ROOF & 3D FASCIA HEADER
           ================================================================ */}
        <group position={[0, WALL_HEIGHT + 0.28, 0.08]}>
          {/* Lower Structural Canopy Deck (Primary Shadow Caster 3/3) */}
          <mesh castShadow receiveShadow material={DARK_NAVY_MAT}>
            <boxGeometry args={[w + 0.34, 0.26, d + 0.38]} />
          </mesh>

          <mesh position={[0, 0.18, -0.05]} material={brandStandardMat}>
            <boxGeometry args={[w + 0.12, 0.14, d + 0.12]} />
          </mesh>

          {/* Front 3D Fascia Header Signboard */}
          <mesh position={[0, 0.04, (d + 0.38) / 2 + 0.02]}>
            <planeGeometry args={[w + 0.1, 0.56]} />
            <meshBasicMaterial map={fasciaTexture} />
          </mesh>

          {/* Under-Canopy Ceiling Light Panels */}
          <mesh
            position={[0, -0.135, 0.2]}
            rotation={[Math.PI / 2, 0, 0]}
            geometry={CEIL_LIGHT_GEOM}
            material={WHITE_LIGHT_MAT}
          />
        </group>

        {/* ================================================================
            4. RECEPTION COUNTER DESK & PRODUCT DISPLAY PEDESTALS
           ================================================================ */}
        <group position={[w * 0.24, 0.18, d * 0.22]}>
          <mesh
            position={[0, 0.44, 0]}
            receiveShadow
            geometry={COUNTER_BODY_GEOM}
            material={WHITE_GLOSS_MAT}
          />
          <mesh position={[0, 0.9, 0]} geometry={COUNTER_TOP_GEOM} material={DARK_NAVY_MAT} />
          <mesh
            position={[0, 0.44, 0.35]}
            geometry={COUNTER_FRONT_GEOM}
            material={brandStandardMat}
          />
          <mesh
            position={[-0.25, 1.08, 0.05]}
            rotation={[0, -0.25, 0]}
            geometry={MONITOR_GEOM}
            material={SLATE_DARK_MAT}
          />
          <group position={[0.15, 0, -0.58]}>
            <mesh position={[0, 0.32, 0]} geometry={STOOL_POLE_GEOM} material={CHROME_PILLAR_MAT} />
            <mesh position={[0, 0.65, 0]} geometry={STOOL_SEAT_GEOM} material={DARK_NAVY_MAT} />
          </group>
        </group>

        {/* Primary Hero Product Pedestal (Front-Left) */}
        <group position={[-w * 0.25, 0.18, d * 0.18]}>
          <mesh
            position={[0, 0.4, 0]}
            receiveShadow
            geometry={PEDESTAL_ONE_GEOM}
            material={LIGHT_SURFACE_MAT}
          />
          <mesh
            position={[0, 0.81, 0]}
            geometry={PEDESTAL_ONE_RING_GEOM}
            material={brandBasicMat}
          />
          <mesh
            ref={showcaseLeftRef}
            position={[0, 1.12, 0]}
            geometry={SHOWCASE_OCTA_GEOM}
            material={brandFlatMat}
          />
        </group>

        {/* Secondary Product Pedestal (Center-Back) */}
        <group position={[-0.08, 0.18, -0.25]}>
          <mesh
            position={[0, 0.34, 0]}
            receiveShadow
            geometry={PEDESTAL_TWO_GEOM}
            material={LIGHT_SURFACE_MAT}
          />
          <mesh
            position={[0, 0.69, 0]}
            geometry={PEDESTAL_TWO_RING_GEOM}
            material={GOLD_BASIC_MAT}
          />
          <mesh
            ref={showcaseCenterRef}
            position={[0, 1.0, 0]}
            geometry={SHOWCASE_TORUS_GEOM}
            material={GOLD_SHOWCASE_MAT}
          />
        </group>

        {/* ================================================================
            5. FLOATING 3D INTERACTIVE SIGNBOARD BILLBOARD
           ================================================================ */}
        <Billboard position={[0, WALL_HEIGHT + 1.55, 0]}>
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
