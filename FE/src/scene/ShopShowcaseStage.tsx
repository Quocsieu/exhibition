import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth, Product } from '../types/expo';
import { formatCurrency } from '../components/ProductPanel';
import { resolveBoothTheme } from './Booth';
import { createBannerSignTexture, createProductTagTexture } from './sceneTextures';

export interface ShopShowcaseStageProps {
  booth: Booth;
  products: Product[];
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

const STAFF_TORSO_GEOM = new THREE.CapsuleGeometry(0.18, 0.36, 5, 10);
const STAFF_HEAD_GEOM = new THREE.SphereGeometry(0.19, 12, 12);
const STAFF_ARM_GEOM = new THREE.CapsuleGeometry(0.065, 0.24, 4, 8);
const STAFF_APRON_GEOM = new THREE.BoxGeometry(0.32, 0.38, 0.04);
const STAFF_BADGE_GEOM = new THREE.PlaneGeometry(1.95, 0.42);

const HOTSPOT_RING_GEOM = new THREE.RingGeometry(0.28, 0.4, 24);
const HOTSPOT_DISC_GEOM = new THREE.CylinderGeometry(0.28, 0.32, 0.1, 16);
const HOTSPOT_TAG_GEOM = new THREE.PlaneGeometry(1.95, 0.54);
const HOTSPOT_STEM_GEOM = new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6);

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
const STAFF_SKIN_MAT = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.45 });
const STAFF_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 });
const GOLD_RING_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_RING_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const EMERALD_RING_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const WHITE_APRON_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });

// Relative 3D coordinates inside the booth for up to 4 interactive product hotspots
const PRODUCT_HOTSPOT_OFFSETS: [number, number, number][] = [
  [-1.42, 0.88, 1.05], // 1: Foreground-Left Hero Showcase
  [1.08, 1.02, 1.15],  // 2: Foreground-Right Reception Counter Demo
  [-1.68, 1.38, -1.25], // 3: Background-Left Display Shelf
  [0.12, 0.82, -0.05], // 4: Midground-Center Showroom
];

function getStaffRoleTitle(theme: string): string {
  switch (theme) {
    case 'living':
      return '🛋️ KIẾN TRÚC SƯ NỘI THẤT';
    case 'coffee':
      return '☕ NGHỆ NHÂN RANG XAY';
    case 'robotics':
      return '🤖 KỸ SƯ ROBOTICS & AI';
    case 'design':
      return '🎨 GIÁM ĐỐC SÁNG TẠO';
    case 'energy':
      return '☀️ CHUYÊN GIA NĂNG LƯỢNG';
    default:
      return '⚡ CHUYÊN VIÊN CÔNG NGHỆ';
  }
}

export const ShopShowcaseStage: React.FC<ShopShowcaseStageProps> = React.memo(
  ({ booth, products, selectedProductId, onSelectProduct }) => {
    const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
    const staffGroupRef = useRef<THREE.Group>(null);
    const staffRightArmRef = useRef<THREE.Mesh>(null);
    const hotspotRefs = useRef<(THREE.Group | null)[]>([]);

    const vw = Math.max(booth.width || 5.6, 6.0);
    const vd = Math.max(booth.depth || 4.2, 4.4);
    const theme = useMemo(() => resolveBoothTheme(booth), [booth]);

    const featuredProducts = useMemo(() => products.slice(0, 4), [products]);

    const brandAwningMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.36,
          metalness: 0.14,
        }),
      [booth.color]
    );

    const staffBadgeTexture = useMemo(
      () =>
        createBannerSignTexture({
          title: getStaffRoleTitle(theme),
          subtitle: `${booth.name} · Sẵn sàng tư vấn`,
          accentColor: booth.color,
        }),
      [theme, booth.name, booth.color]
    );

    const productTagTextures = useMemo(() => {
      return featuredProducts.map((prod, idx) => {
        const priceText = formatCurrency(prod.price, prod.currency);
        return {
          productId: prod.id,
          idle: createProductTagTexture({
            index: idx + 1,
            name: prod.name,
            priceText,
            color: booth.color,
            selected: false,
          }),
          selected: createProductTagTexture({
            index: idx + 1,
            name: prod.name,
            priceText,
            color: booth.color,
            selected: true,
          }),
        };
      });
    }, [featuredProducts, booth.color]);

    useEffect(() => {
      return () => {
        brandAwningMat.dispose();
        staffBadgeTexture.dispose();
        productTagTextures.forEach((entry) => {
          entry.idle.dispose();
          entry.selected.dispose();
        });
      };
    }, [brandAwningMat, staffBadgeTexture, productTagTextures]);

    useFrame(({ clock }) => {
      const t = clock.getElapsedTime();
      if (staffGroupRef.current) {
        staffGroupRef.current.position.y = 0.18 + Math.sin(t * 2.2) * 0.025;
        staffGroupRef.current.rotation.y = Math.sin(t * 1.1) * 0.15;
      }
      if (staffRightArmRef.current) {
        staffRightArmRef.current.rotation.z = -0.45 + Math.sin(t * 3.2) * 0.22;
      }
      for (let i = 0; i < hotspotRefs.current.length; i++) {
        const grp = hotspotRefs.current[i];
        if (grp) {
          grp.position.y =
            PRODUCT_HOTSPOT_OFFSETS[i][1] + Math.sin(t * 2.8 + i * 1.1) * 0.04;
        }
      }
    });

    return (
      <group
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY || 0, 0]}
      >
        {/* Warm Interior Commercial Glow (Only active for the focused shop) */}
        <pointLight
          position={[0, 2.75, 0.8]}
          color="#fef08a"
          intensity={1.25}
          distance={11}
        />

        {/* ================================================================
            1. FOREGROUND LAYER: STOREFRONT COURTYARD SIDEWALK & FLANKING DECOR
           ================================================================ */}
        <mesh position={[0, 0.018, vd / 2 + 1.45]} receiveShadow geometry={COURTYARD_PAD_GEOM} material={COURTYARD_STONE_MAT} />
        <mesh position={[0, 0.032, vd / 2 + 3.45]} geometry={COURTYARD_TRIM_GEOM} material={brandAwningMat} />

        {/* Hanging Warm Storefront Lanterns under Front Roof Header */}
        {[-vw * 0.38, -vw * 0.14, vw * 0.14, vw * 0.38].map((lx, idx) => (
          <group key={`lantern-${idx}`} position={[lx, 3.12, vd / 2 + 0.32]}>
            <mesh position={[0, 0.15, 0]} geometry={LANTERN_CORD_GEOM} material={CORD_DARK_MAT} />
            <mesh geometry={LANTERN_GLOBE_GEOM} material={WARM_LANTERN_MAT} />
          </group>
        ))}

        {/* Theme-Specific Foreground Flanking Decor (Left & Right of Storefront Entrance) */}
        {theme === 'tech' || theme === 'robotics' ? (
          // Futuristic / Industrial Glowing Bollards flanking the entrance
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
          // Cozy Commercial Flower Boxes & Lush Greenery flanking the entrance
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

        {/* ================================================================
            2. MIDGROUND LAYER: DECORATIVE SPECIALIST / SHOPKEEPER BEHIND COUNTER
               (Local visual prop only — zero network/multiplayer state)
           ================================================================ */}
        <group ref={staffGroupRef} position={[vw * 0.22, 0.18, vd * 0.22 - 0.58]}>
          <mesh position={[0, 0.72, 0]} geometry={STAFF_TORSO_GEOM} material={brandAwningMat} />
          <mesh position={[0, 0.68, 0.17]} geometry={STAFF_APRON_GEOM} material={WHITE_APRON_MAT} />
          <mesh position={[0, 1.18, 0]} geometry={STAFF_HEAD_GEOM} material={STAFF_SKIN_MAT} />
          <mesh
            position={[0, 1.24, -0.02]}
            scale={[1.04, 0.85, 1.04]}
            geometry={STAFF_HEAD_GEOM}
            material={STAFF_DARK_MAT}
          />
          <mesh
            position={[-0.26, 0.76, 0.08]}
            rotation={[0.3, 0, 0.2]}
            geometry={STAFF_ARM_GEOM}
            material={brandAwningMat}
          />
          <mesh
            ref={staffRightArmRef}
            position={[0.26, 0.86, 0.12]}
            rotation={[0, 0, -0.45]}
            geometry={STAFF_ARM_GEOM}
            material={brandAwningMat}
          />

          <Billboard position={[0, 1.62, 0]}>
            <mesh geometry={STAFF_BADGE_GEOM}>
              <meshBasicMaterial map={staffBadgeTexture} transparent depthWrite={false} />
            </mesh>
          </Billboard>
        </group>

        {/* ================================================================
            3. INTERACTIVE 3D PRODUCT DISPLAY HOTSPOTS (Bound to real products)
           ================================================================ */}
        {featuredProducts.map((product, idx) => {
          const offset = PRODUCT_HOTSPOT_OFFSETS[idx];
          if (!offset) return null;
          const isSelected = selectedProductId === product.id;
          const isHovered = hoveredProductId === product.id;
          const isHighlighted = isSelected || isHovered;
          const tagEntry = productTagTextures[idx];
          const tagTex = isHighlighted ? tagEntry?.selected : tagEntry?.idle;

          return (
            <group
              key={product.id}
              ref={(el) => {
                hotspotRefs.current[idx] = el;
              }}
              position={[offset[0], offset[1], offset[2]]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectProduct(product);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredProductId(product.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredProductId(null);
                document.body.style.cursor = 'auto';
              }}
            >
              <mesh geometry={HOTSPOT_DISC_GEOM} material={STAFF_DARK_MAT} />
              <mesh
                position={[0, 0.06, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                geometry={HOTSPOT_RING_GEOM}
                material={isHighlighted ? GOLD_RING_MAT : CYAN_RING_MAT}
              />
              <mesh position={[0, 0.24, 0]} geometry={HOTSPOT_STEM_GEOM} material={CORD_DARK_MAT} />

              {tagTex && (
                <Billboard position={[0, 0.56, 0]}>
                  <mesh
                    geometry={HOTSPOT_TAG_GEOM}
                    scale={isHighlighted ? [1.08, 1.08, 1] : [1, 1, 1]}
                  >
                    <meshBasicMaterial map={tagTex} transparent depthWrite={false} />
                  </mesh>
                </Billboard>
              )}
            </group>
          );
        })}
      </group>
    );
  }
);
