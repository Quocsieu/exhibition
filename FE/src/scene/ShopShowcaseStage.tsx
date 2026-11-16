import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Booth, Product, BoothSlotView } from '../types/expo';
import { resolveBoothTheme } from './Booth';

export interface ShopShowcaseStageProps {
  booth: Booth;
  products: Product[];
  slots?: BoothSlotView[];
  selectedProductId: string | null;
  onSelectProduct: (product: Product) => void;
}

// ============================================================================
// Shared Module-Level Geometries & Materials (PERF-04 & PERF-05 Compliant)
// ============================================================================
const COURTYARD_PAD_GEOM = new THREE.BoxGeometry(9.6, 0.04, 4.2);
const COURTYARD_TRIM_GEOM = new THREE.BoxGeometry(9.8, 0.02, 0.14);

const LANTERN_CORD_GEOM = new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6);
const LANTERN_GLOBE_GEOM = new THREE.SphereGeometry(0.12, 10, 10);

const FLOWER_BOX_GEOM = new THREE.BoxGeometry(1.22, 0.36, 0.48);
const FLOWER_SOIL_GEOM = new THREE.BoxGeometry(1.1, 0.06, 0.38);
const SHRUB_BUSH_GEOM = new THREE.DodecahedronGeometry(0.24, 0);
const FLOWER_BLOSSOM_GEOM = new THREE.IcosahedronGeometry(0.12, 0);

const BOLLARD_POST_GEOM = new THREE.CylinderGeometry(0.09, 0.11, 0.82, 10);
const BOLLARD_TOP_GEOM = new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10);
const AFRAME_BOARD_GEOM = new THREE.BoxGeometry(0.56, 0.86, 0.06);

const COURTYARD_STONE_MAT = new THREE.MeshStandardMaterial({
  color: '#334155',
  roughness: 0.72,
});
const WARM_LANTERN_MAT = new THREE.MeshBasicMaterial({ color: '#fde68a' });
const CORD_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 });
const WOOD_PLANTER_MAT = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.68 });
const WHITE_PLANTER_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
const SOIL_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.9 });
const FOLIAGE_GREEN_MAT = new THREE.MeshStandardMaterial({
  color: '#10b981',
  roughness: 0.55,
  flatShading: true,
});
const BLOSSOM_PINK_MAT = new THREE.MeshStandardMaterial({
  color: '#f43f5e',
  roughness: 0.4,
  flatShading: true,
});
const BLOSSOM_GOLD_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  roughness: 0.35,
  flatShading: true,
});
const STAFF_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 });
const GOLD_RING_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_RING_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const EMERALD_RING_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });

export const ShopShowcaseStage: React.FC<ShopShowcaseStageProps> = React.memo(
  ({ booth }) => {
    const vw = Math.max(booth.width || 5.6, 6.0);
    const vd = Math.max(booth.depth || 4.2, 4.4);
    const theme = useMemo(() => resolveBoothTheme(booth), [booth]);

    const brandAwningMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.36,
          metalness: 0.14,
        }),
      [booth.color]
    );

    useEffect(() => {
      return () => {
        brandAwningMat.dispose();
      };
    }, [brandAwningMat]);

    return (
      <group
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY || 0, 0]}
      >
        {/* Product-First Showroom Lighting Rig (Only active for the focused shop) */}
        <pointLight
          position={[0, 2.35, 2.15]}
          color="#fffbeb"
          intensity={1.55}
          distance={12}
        />
        <pointLight
          position={[-2.4, 2.0, 2.0]}
          color="#f8fafc"
          intensity={0.95}
          distance={8}
        />
        <pointLight
          position={[2.4, 2.0, 2.0]}
          color="#f8fafc"
          intensity={0.95}
          distance={8}
        />

        {/* ================================================================
            1. FOREGROUND LAYER: STOREFRONT COURTYARD SIDEWALK & FLANKING DECOR
           ================================================================ */}
        <mesh position={[0, 0.018, vd / 2 + 1.45]} receiveShadow geometry={COURTYARD_PAD_GEOM} material={COURTYARD_STONE_MAT} />
        <mesh position={[0, 0.032, vd / 2 + 3.45]} geometry={COURTYARD_TRIM_GEOM} material={brandAwningMat} />

        {/* Hanging Warm Storefront Lanterns at Outer Corners Only (Zero Central Backdrop Obstruction) */}
        {[-vw * 0.44, vw * 0.44].map((lx, idx) => (
          <group key={`lantern-${idx}`} position={[lx, 3.16, vd / 2 + 0.32]}>
            <mesh position={[0, 0.15, 0]} geometry={LANTERN_CORD_GEOM} material={CORD_DARK_MAT} />
            <mesh geometry={LANTERN_GLOBE_GEOM} material={WARM_LANTERN_MAT} />
          </group>
        ))}

        {/* Theme-Specific Foreground Flanking Decor (Left & Right of Storefront Entrance) */}
        {theme === 'tech' || theme === 'robotics' ? (
          <>
            {[
              [-vw / 2 - 0.55, vd / 2 + 0.55],
              [vw / 2 + 0.55, vd / 2 + 0.55],
              [-vw / 2 - 0.55, vd / 2 + 1.85],
              [vw / 2 + 0.55, vd / 2 + 1.85],
            ].map(([bx, bz], idx) => (
              <group key={`bollard-${idx}`} position={[bx, 0.02, bz]}>
                <mesh position={[0, 0.41, 0]} geometry={BOLLARD_POST_GEOM} material={STAFF_DARK_MAT} />
                <mesh
                  position={[0, 0.86, 0]}
                  geometry={BOLLARD_TOP_GEOM}
                  material={theme === 'tech' ? CYAN_RING_MAT : GOLD_RING_MAT}
                />
              </group>
            ))}
          </>
        ) : (
          <>
            {[
              [-vw / 2 - 0.45, vd / 2 + 0.48],
              [vw / 2 + 0.45, vd / 2 + 0.48],
            ].map(([fx, fz], idx) => (
              <group key={`flower-box-${idx}`} position={[fx, 0.04, fz]}>
                <mesh
                  position={[0, 0.18, 0]}
                  geometry={FLOWER_BOX_GEOM}
                  material={theme === 'energy' || theme === 'design' ? WHITE_PLANTER_MAT : WOOD_PLANTER_MAT}
                />
                <mesh position={[0, 0.37, 0]} geometry={FLOWER_SOIL_GEOM} material={SOIL_DARK_MAT} />
                {[-0.34, 0, 0.34].map((bx, bIdx) => (
                  <group key={`shrub-${bIdx}`} position={[bx, 0.52, 0]}>
                    <mesh geometry={SHRUB_BUSH_GEOM} material={FOLIAGE_GREEN_MAT} />
                    <mesh
                      position={[0.06, 0.18, 0.06]}
                      geometry={FLOWER_BLOSSOM_GEOM}
                      material={
                        theme === 'energy'
                          ? EMERALD_RING_MAT
                          : bIdx % 2 === 0
                            ? BLOSSOM_PINK_MAT
                            : BLOSSOM_GOLD_MAT
                      }
                    />
                  </group>
                ))}
              </group>
            ))}

            {/* Sidewalk A-Frame Welcome Signboard */}
            <group position={[vw / 2 + 0.52, 0.04, vd / 2 + 1.55]} rotation={[0, -0.32, 0]}>
              <mesh
                position={[0, 0.42, 0.12]}
                rotation={[-0.22, 0, 0]}
                geometry={AFRAME_BOARD_GEOM}
                material={STAFF_DARK_MAT}
              />
              <mesh
                position={[0, 0.42, -0.12]}
                rotation={[0.22, 0, 0]}
                geometry={AFRAME_BOARD_GEOM}
                material={STAFF_DARK_MAT}
              />
              <mesh
                position={[0, 0.44, 0.16]}
                rotation={[-0.22, 0, 0]}
                scale={[0.82, 0.78, 1]}
                geometry={AFRAME_BOARD_GEOM}
                material={brandAwningMat}
              />
            </group>
          </>
        )}
      </group>
    );
  }
);
