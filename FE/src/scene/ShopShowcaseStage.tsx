import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Booth, Product } from '../types/expo';
import { formatCurrency } from '../components/ProductPanel';
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
const AWNING_STRIPE_GEOM = new THREE.BoxGeometry(0.92, 0.08, 1.15);
const AWNING_VALANCE_GEOM = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12);
const LANTERN_CORD_GEOM = new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6);
const LANTERN_GLOBE_GEOM = new THREE.SphereGeometry(0.13, 10, 10);

const FLOWER_BOX_GEOM = new THREE.BoxGeometry(1.18, 0.36, 0.46);
const FLOWER_SOIL_GEOM = new THREE.BoxGeometry(1.06, 0.06, 0.36);
const SHRUB_BUSH_GEOM = new THREE.DodecahedronGeometry(0.24, 0);
const FLOWER_BLOSSOM_GEOM = new THREE.IcosahedronGeometry(0.12, 0);

const AFRAME_BOARD_GEOM = new THREE.BoxGeometry(0.56, 0.86, 0.06);

const STAFF_TORSO_GEOM = new THREE.CapsuleGeometry(0.18, 0.36, 5, 10);
const STAFF_HEAD_GEOM = new THREE.SphereGeometry(0.19, 12, 12);
const STAFF_ARM_GEOM = new THREE.CapsuleGeometry(0.065, 0.24, 4, 8);
const STAFF_APRON_GEOM = new THREE.BoxGeometry(0.32, 0.38, 0.04);
const STAFF_BADGE_GEOM = new THREE.PlaneGeometry(2.1, 0.44);

const HOTSPOT_RING_GEOM = new THREE.RingGeometry(0.32, 0.44, 24);
const HOTSPOT_DISC_GEOM = new THREE.CylinderGeometry(0.32, 0.36, 0.12, 16);
const HOTSPOT_TAG_GEOM = new THREE.PlaneGeometry(2.25, 0.64);
const HOTSPOT_STEM_GEOM = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6);

const CREAM_AWNING_MAT = new THREE.MeshStandardMaterial({
  color: '#fffbeb',
  roughness: 0.45,
});
const WARM_LANTERN_MAT = new THREE.MeshBasicMaterial({ color: '#fde68a' });
const CORD_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 });
const WOOD_PLANTER_MAT = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.68 });
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
const WHITE_APRON_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });

// Predefined relative 3D coordinates inside the booth for up to 4 interactive product hotspots
const PRODUCT_HOTSPOT_OFFSETS: [number, number, number][] = [
  [-1.35, 1.05, 0.78], // 1: Front-Left Hero Pedestal
  [0.95, 1.18, 0.95],  // 2: Front-Right Reception Counter Demo Spot
  [-1.65, 1.45, -1.45], // 3: Back-Left Display Shelf Spot
  [0.15, 0.96, -0.15], // 4: Center Showroom Spot
];

export const ShopShowcaseStage: React.FC<ShopShowcaseStageProps> = React.memo(
  ({ booth, products, selectedProductId, onSelectProduct }) => {
    const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
    const staffGroupRef = useRef<THREE.Group>(null);
    const staffRightArmRef = useRef<THREE.Mesh>(null);
    const hotspotRefs = useRef<(THREE.Group | null)[]>([]);

    const vw = Math.max(booth.width || 5.6, 5.8);
    const vd = Math.max(booth.depth || 4.2, 4.3);

    const featuredProducts = useMemo(() => products.slice(0, 4), [products]);

    const brandAwningMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.38,
          metalness: 0.12,
        }),
      [booth.color]
    );

    const staffBadgeTexture = useMemo(
      () =>
        createBannerSignTexture({
          title: '💁 TƯ VẤN VIÊN GIAN HÀNG',
          subtitle: `${booth.name} · Sẵn sàng hỗ trợ`,
          accentColor: booth.color,
        }),
      [booth.name, booth.color]
    );

    // Pre-generate idle & selected 3D tags for each featured product (cached, 0 per-frame allocation)
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
            PRODUCT_HOTSPOT_OFFSETS[i][1] + Math.sin(t * 2.8 + i * 1.1) * 0.045;
        }
      }
    });

    const stripeCount = 6;
    const stripeSpacing = (vw + 0.1) / stripeCount;

    return (
      <group
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY || 0, 0]}
      >
        {/* Warm Interior Commercial Glow (Only active for the focused shop) */}
        <pointLight
          position={[0, 2.85, 0.4]}
          color="#fef08a"
          intensity={1.15}
          distance={9.5}
        />

        {/* ================================================================
            1. COZY STRIPED STOREFRONT AWNING & WARM FAIRY LANTERNS
           ================================================================ */}
        <group position={[0, 3.28, vd / 2 + 0.62]}>
          {Array.from({ length: stripeCount }).map((_, idx) => {
            const sx = -vw / 2 + stripeSpacing * (idx + 0.5);
            const isBrand = idx % 2 === 0;
            return (
              <group key={`awning-stripe-${idx}`} position={[sx, 0, 0]}>
                <mesh
                  rotation={[0.32, 0, 0]}
                  geometry={AWNING_STRIPE_GEOM}
                  material={isBrand ? brandAwningMat : CREAM_AWNING_MAT}
                />
                <mesh
                  position={[0, -0.18, 0.54]}
                  rotation={[Math.PI / 2, 0, 0]}
                  geometry={AWNING_VALANCE_GEOM}
                  material={isBrand ? brandAwningMat : CREAM_AWNING_MAT}
                />
              </group>
            );
          })}

          {/* Warm Hanging Storefront Lantern Globes */}
          {[-vw * 0.36, -vw * 0.12, vw * 0.12, vw * 0.36].map((lx, idx) => (
            <group key={`lantern-${idx}`} position={[lx, -0.22, 0.36]}>
              <mesh position={[0, 0.16, 0]} geometry={LANTERN_CORD_GEOM} material={CORD_DARK_MAT} />
              <mesh geometry={LANTERN_GLOBE_GEOM} material={WARM_LANTERN_MAT} />
            </group>
          ))}
        </group>

        {/* ================================================================
            2. ENTRANCE FLORAL PLANTER BOXES & A-FRAME WELCOME CHALKBOARD
           ================================================================ */}
        {[
          [-vw / 2 + 0.65, vd / 2 + 0.34],
          [vw / 2 - 0.65, vd / 2 + 0.34],
        ].map(([fx, fz], idx) => (
          <group key={`flower-box-${idx}`} position={[fx, 0.18, fz]}>
            <mesh position={[0, 0.18, 0]} geometry={FLOWER_BOX_GEOM} material={WOOD_PLANTER_MAT} />
            <mesh position={[0, 0.37, 0]} geometry={FLOWER_SOIL_GEOM} material={SOIL_DARK_MAT} />
            {[-0.32, 0, 0.32].map((bx, bIdx) => (
              <group key={`shrub-${bIdx}`} position={[bx, 0.52, 0]}>
                <mesh geometry={SHRUB_BUSH_GEOM} material={FOLIAGE_GREEN_MAT} />
                <mesh
                  position={[0.06, 0.18, 0.06]}
                  geometry={FLOWER_BLOSSOM_GEOM}
                  material={bIdx % 2 === 0 ? BLOSSOM_PINK_MAT : BLOSSOM_GOLD_MAT}
                />
              </group>
            ))}
          </group>
        ))}

        {/* Sidewalk A-Frame Welcome Signboard */}
        <group position={[vw * 0.36, 0.18, vd / 2 + 0.72]} rotation={[0, -0.35, 0]}>
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

        {/* ================================================================
            3. DECORATIVE LOW-POLY SHOPKEEPER / CONSULTANT BEHIND COUNTER
               (Local visual prop only — zero network/multiplayer state)
           ================================================================ */}
        <group ref={staffGroupRef} position={[vw * 0.22, 0.18, vd * 0.22 - 0.58]}>
          {/* Torso & Branded Outfit */}
          <mesh position={[0, 0.72, 0]} geometry={STAFF_TORSO_GEOM} material={brandAwningMat} />
          <mesh position={[0, 0.68, 0.17]} geometry={STAFF_APRON_GEOM} material={WHITE_APRON_MAT} />
          {/* Head */}
          <mesh position={[0, 1.18, 0]} geometry={STAFF_HEAD_GEOM} material={STAFF_SKIN_MAT} />
          <mesh
            position={[0, 1.24, -0.02]}
            scale={[1.04, 0.85, 1.04]}
            geometry={STAFF_HEAD_GEOM}
            material={STAFF_DARK_MAT}
          />
          {/* Left Arm */}
          <mesh
            position={[-0.26, 0.76, 0.08]}
            rotation={[0.3, 0, 0.2]}
            geometry={STAFF_ARM_GEOM}
            material={brandAwningMat}
          />
          {/* Right Greeting Arm */}
          <mesh
            ref={staffRightArmRef}
            position={[0.26, 0.86, 0.12]}
            rotation={[0, 0, -0.45]}
            geometry={STAFF_ARM_GEOM}
            material={brandAwningMat}
          />

          <Billboard position={[0, 1.68, 0]}>
            <mesh geometry={STAFF_BADGE_GEOM}>
              <meshBasicMaterial map={staffBadgeTexture} transparent depthWrite={false} />
            </mesh>
          </Billboard>
        </group>

        {/* ================================================================
            4. INTERACTIVE 3D PRODUCT DISPLAY HOTSPOTS (Bound to real products)
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
              {/* Glowing Product Pedestal Base Disc & Ring */}
              <mesh geometry={HOTSPOT_DISC_GEOM} material={STAFF_DARK_MAT} />
              <mesh
                position={[0, 0.07, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                geometry={HOTSPOT_RING_GEOM}
                material={isHighlighted ? GOLD_RING_MAT : CYAN_RING_MAT}
              />
              <mesh position={[0, 0.32, 0]} geometry={HOTSPOT_STEM_GEOM} material={CORD_DARK_MAT} />

              {/* Floating 3D Product Price & Name Tag */}
              {tagTex && (
                <Billboard position={[0, 0.72, 0]}>
                  <mesh
                    geometry={HOTSPOT_TAG_GEOM}
                    scale={isHighlighted ? [1.1, 1.1, 1] : [1, 1, 1]}
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
