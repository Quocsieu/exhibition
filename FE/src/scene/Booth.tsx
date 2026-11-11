import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import {
  type Booth as BoothType,
  type Product,
  type BoothSlotView,
  BOOTH_SLOT_DEFINITIONS,
} from '../types/expo';
import { formatCurrency } from '../components/ProductPanel';
import {
  type BoothVisualTheme,
  createBoothFasciaTexture,
  createBoothSignTexture,
  createEnterpriseBackdropTexture,
  createProductDisplayCardTexture,
  createProductTagTexture,
} from './sceneTextures';
import { cloneCachedAsset, getBoothGlbAssetId } from './assetLoader';

export interface BoothProps {
  booth: BoothType;
  productCount: number;
  slots?: BoothSlotView[];
  selectedProductId?: string | null;
  onSelectProduct?: (product: Product) => void;
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

// Trade Fair Exhibition Stand Architecture Geometries
const BACKDROP_FRAME_GEOM = new THREE.BoxGeometry(4.12, 2.46, 0.12);
const BACKDROP_GLOW_BORDER_GEOM = new THREE.BoxGeometry(4.2, 2.54, 0.08);
const BACKDROP_CANVAS_GEOM = new THREE.PlaneGeometry(3.96, 2.28);
const BACKDROP_LIGHT_BAR_GEOM = new THREE.BoxGeometry(3.8, 0.07, 0.22);

// Front Exhibition Counter (Centered at x = 0, z = 1.25; top surface at y = 1.04)
const EXPO_COUNTER_BODY_GEOM = new THREE.BoxGeometry(2.36, 0.68, 0.78);
const EXPO_COUNTER_TOP_GEOM = new THREE.BoxGeometry(2.48, 0.06, 0.88);
const EXPO_COUNTER_FRONT_PANEL_GEOM = new THREE.BoxGeometry(2.14, 0.48, 0.04);
const EXPO_COUNTER_LED_STRIP_GEOM = new THREE.BoxGeometry(2.44, 0.04, 0.86);

// Symmetric Stepped 2-Tier Exhibition Display Racks (Left & Right)
const STEPPED_RACK_PILLAR_GEOM = new THREE.BoxGeometry(1.16, 1.2, 0.62);
const STEPPED_RACK_LOWER_BASE_GEOM = new THREE.BoxGeometry(1.16, 0.54, 0.62);
const STEPPED_SHELF_BOARD_GEOM = new THREE.BoxGeometry(1.24, 0.06, 0.68);
const STEPPED_SHELF_TRIM_GEOM = new THREE.BoxGeometry(1.26, 0.025, 0.7);
const STEPPED_RACK_BACKBOARD_GEOM = new THREE.BoxGeometry(1.24, 0.72, 0.06);

// Slot Product Stand Geometries (Strictly bounded inside slot.maxSize)
const SLOT_EMPTY_MAT_GEOM = new THREE.BoxGeometry(0.68, 0.008, 0.46);
const SLOT_PEDESTAL_BASE_GEOM = new THREE.CylinderGeometry(0.28, 0.32, 0.05, 18);
const SLOT_PEDESTAL_RING_GEOM = new THREE.RingGeometry(0.28, 0.34, 24);
const SLOT_CARD_FRAME_GEOM = new THREE.BoxGeometry(0.66, 0.48, 0.035);
const SLOT_CARD_PLANE_GEOM = new THREE.PlaneGeometry(0.62, 0.44);
const SLOT_CALLOUT_TAG_GEOM = new THREE.PlaneGeometry(1.52, 0.42);

// 3D Product Category Artifact Geometries (placed in front of card on slot plinth)
const PROD_TECH_ARTIFACT_GEOM = new THREE.OctahedronGeometry(0.11, 0);
const PROD_LIVING_ARTIFACT_GEOM = new THREE.CylinderGeometry(0.11, 0.09, 0.18, 14);
const PROD_COFFEE_ARTIFACT_GEOM = new THREE.BoxGeometry(0.16, 0.22, 0.12);
const PROD_ROBOT_ARTIFACT_GEOM = new THREE.TorusKnotGeometry(0.085, 0.026, 24, 6);
const PROD_ENERGY_ARTIFACT_GEOM = new THREE.BoxGeometry(0.2, 0.16, 0.12);

const PERGOLA_RAFTER_GEOM = new THREE.BoxGeometry(0.16, 0.22, 4.6);
const AWNING_SLAT_GEOM = new THREE.BoxGeometry(0.94, 0.1, 1.15);
const LANTERN_BULB_GEOM = new THREE.SphereGeometry(0.13, 10, 10);
const CEIL_LIGHT_GEOM = new THREE.BoxGeometry(1.45, 0.06, 0.18);
const SIGN_BILLBOARD_GEOM = new THREE.PlaneGeometry(4.65, 1.54);

const TOTEM_BODY_GEOM = new THREE.BoxGeometry(0.56, 1.92, 0.16);
const TOTEM_BASE_GEOM = new THREE.BoxGeometry(0.68, 0.08, 0.36);
const TOTEM_SCREEN_GEOM = new THREE.PlaneGeometry(0.46, 1.18);

const BEACON_RING_GEOM = new THREE.RingGeometry(0.34, 0.48, 24);
const BEACON_CORE_GEOM = new THREE.CircleGeometry(0.26, 20);

const HALO_RING_LARGE_GEOM = new THREE.TorusGeometry(0.74, 0.048, 10, 28);
const HALO_RING_SMALL_GEOM = new THREE.TorusGeometry(0.46, 0.038, 10, 24);
const SOLAR_PANEL_GEOM = new THREE.BoxGeometry(1.38, 0.07, 1.25);
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
const EMPTY_SLOT_MAT = new THREE.MeshStandardMaterial({
  color: '#475569',
  roughness: 0.65,
  metalness: 0.1,
});
const GOLD_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const EMERALD_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const WARM_BULB_MAT = new THREE.MeshBasicMaterial({ color: '#fde68a' });
const WHITE_LIGHT_MAT = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

interface SlotProductDisplayProps {
  slotIndex: number;
  slotView: BoothSlotView;
  theme: BoothVisualTheme;
  accentColor: string;
  isSelected: boolean;
  isBoothSelected: boolean;
  brandMat: THREE.Material;
  onSelectProduct?: (product: Product) => void;
}

const SlotProductDisplay: React.FC<SlotProductDisplayProps> = React.memo(
  ({
    slotIndex,
    slotView,
    theme,
    accentColor,
    isSelected,
    isBoothSelected,
    brandMat,
    onSelectProduct,
  }) => {
    const [hovered, setHovered] = useState(false);
    const artifactRef = useRef<THREE.Mesh>(null);
    const { slot, product } = slotView;
    const highlighted = isSelected || hovered;

    const textures = useMemo(() => {
      if (!product) return null;
      const priceText = formatCurrency(product.price, product.currency);
      const imageUrl = product.images?.[0] || '';
      return {
        cardIdle: createProductDisplayCardTexture({
          slotLabel: `${slot.slotId.toUpperCase()} · ${slot.label}`,
          name: product.name,
          priceText,
          sku: product.sku,
          imageUrl,
          accentColor,
          selected: false,
        }),
        cardActive: createProductDisplayCardTexture({
          slotLabel: `${slot.slotId.toUpperCase()} · ${slot.label}`,
          name: product.name,
          priceText,
          sku: product.sku,
          imageUrl,
          accentColor,
          selected: true,
        }),
        tagIdle: createProductTagTexture({
          index: slotIndex + 1,
          name: product.name,
          priceText,
          color: accentColor,
          selected: false,
        }),
        tagActive: createProductTagTexture({
          index: slotIndex + 1,
          name: product.name,
          priceText,
          color: accentColor,
          selected: true,
        }),
      };
    }, [product, slot.slotId, slot.label, accentColor, slotIndex]);

    useEffect(() => {
      return () => {
        if (textures) {
          textures.cardIdle.dispose();
          textures.cardActive.dispose();
          textures.tagIdle.dispose();
          textures.tagActive.dispose();
        }
      };
    }, [textures]);

    useFrame((_, delta) => {
      if (artifactRef.current && product) {
        artifactRef.current.rotation.y += delta * (highlighted ? 1.6 : 0.65);
      }
    });

    // Scale guard to guarantee the display fits strictly inside slot.maxSize
    const [maxW, maxH, maxD] = slot.maxSize;
    const scaleX = Math.min(1, maxW / 0.78);
    const scaleY = Math.min(1, maxH / 0.62);
    const scaleZ = Math.min(1, maxD / 0.56);
    const fitScale = Math.min(scaleX, scaleY, scaleZ);

    const artifactGeom =
      theme === 'living'
        ? PROD_LIVING_ARTIFACT_GEOM
        : theme === 'coffee'
          ? PROD_COFFEE_ARTIFACT_GEOM
          : theme === 'robotics'
            ? PROD_ROBOT_ARTIFACT_GEOM
            : theme === 'energy'
              ? PROD_ENERGY_ARTIFACT_GEOM
              : PROD_TECH_ARTIFACT_GEOM;

    return (
      <group
        position={slot.position}
        rotation={slot.rotation}
        onClick={
          product && onSelectProduct
            ? (e) => {
                e.stopPropagation();
                onSelectProduct(product);
              }
            : undefined
        }
        onPointerOver={
          product
            ? (e) => {
                e.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          product
            ? () => {
                setHovered(false);
                document.body.style.cursor = 'auto';
              }
            : undefined
        }
      >
        {!product ? (
          /* Empty Slot: Clean natural recessed shelf pad — zero fake product */
          <mesh position={[0, 0.004, 0]} geometry={SLOT_EMPTY_MAT_GEOM} material={EMPTY_SLOT_MAT} />
        ) : (
          /* Occupied Slot: Flush 3D Display Plinth + Product Display Stand + 3D Artifact */
          <group scale={[fitScale, fitScale, fitScale]}>
            {/* Flush Display Plinth sitting directly at y = 0 on the shelf/counter surface */}
            <mesh
              position={[0, 0.025, 0]}
              castShadow
              receiveShadow
              geometry={SLOT_PEDESTAL_BASE_GEOM}
              material={DARK_NAVY_MAT}
            />
            <mesh
              position={[0, 0.052, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={SLOT_PEDESTAL_RING_GEOM}
              material={highlighted ? GOLD_BASIC_MAT : CYAN_GLOW_MAT}
            />

            {/* Framed 3D Product Visual Display Stand Card */}
            <group position={[0, 0.29, -0.06]}>
              <mesh
                geometry={SLOT_CARD_FRAME_GEOM}
                material={highlighted ? GOLD_SHOWCASE_MAT : DARK_NAVY_MAT}
              />
              {textures && (
                <mesh position={[0, 0, 0.02]} geometry={SLOT_CARD_PLANE_GEOM}>
                  <meshBasicMaterial
                    map={highlighted ? textures.cardActive : textures.cardIdle}
                  />
                </mesh>
              )}
            </group>

            {/* 3D Product Sculpture / Model on Front Half of Slot Plinth */}
            <mesh
              ref={artifactRef}
              position={[0, 0.16, 0.15]}
              castShadow
              geometry={artifactGeom}
              material={highlighted ? GOLD_SHOWCASE_MAT : brandMat}
            />

            {/* Interactive Floating Callout Badge when in Shop Showcase or Hovered */}
            {textures && (isBoothSelected || highlighted) && (
              <Billboard position={[0, 0.68, 0]}>
                <mesh
                  geometry={SLOT_CALLOUT_TAG_GEOM}
                  scale={highlighted ? [1.08, 1.08, 1] : [0.96, 0.96, 1]}
                >
                  <meshBasicMaterial
                    map={highlighted ? textures.tagActive : textures.tagIdle}
                    transparent
                    depthWrite={false}
                  />
                </mesh>
              </Billboard>
            )}
          </group>
        )}
      </group>
    );
  }
);

export const Booth: React.FC<BoothProps> = React.memo(
  ({
    booth,
    productCount,
    slots,
    selectedProductId = null,
    onSelectProduct,
    isSelected,
    onSelect,
    visible = true,
  }) => {
    const [hovered, setHovered] = useState(false);
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

    const resolvedSlots = useMemo<BoothSlotView[]>(() => {
      if (slots && slots.length > 0) {
        return slots;
      }
      return BOOTH_SLOT_DEFINITIONS.map((slot) => ({
        boothId: booth.id,
        slot,
        productId: null,
        product: null,
        updatedAt: null,
      }));
    }, [slots, booth.id]);

    const occupiedSlotCount = useMemo(
      () => resolvedSlots.filter((s) => Boolean(s.product)).length,
      [resolvedSlots]
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

    // Pre-generate and cache Fascia, Enterprise Backdrop, Idle Sign, and Active Sign textures
    const { fasciaTexture, backdropTexture, idleSignTexture, activeSignTexture } = useMemo(() => {
      return {
        fasciaTexture: createBoothFasciaTexture({
          name: booth.companyName || booth.name,
          category: booth.category,
          color: booth.color,
          theme,
        }),
        backdropTexture: createEnterpriseBackdropTexture({
          name: booth.name,
          companyName: booth.companyName || booth.name,
          category: booth.category,
          tagline: booth.tagline,
          color: booth.color,
          logoUrl: booth.logoUrl,
          bannerUrl: booth.bannerUrl,
          occupiedSlots: occupiedSlotCount || productCount,
          totalSlots: BOOTH_SLOT_DEFINITIONS.length,
          theme,
        }),
        idleSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.companyName || booth.category,
          productCount: occupiedSlotCount || productCount,
          color: booth.color,
          active: false,
          theme,
        }),
        activeSignTexture: createBoothSignTexture({
          name: booth.name,
          category: booth.companyName || booth.category,
          productCount: occupiedSlotCount || productCount,
          color: booth.color,
          active: true,
          theme,
        }),
      };
    }, [
      booth.name,
      booth.companyName,
      booth.category,
      booth.tagline,
      booth.color,
      booth.logoUrl,
      booth.bannerUrl,
      occupiedSlotCount,
      productCount,
      theme,
    ]);

    useEffect(() => {
      return () => {
        fasciaTexture.dispose();
        backdropTexture.dispose();
        idleSignTexture.dispose();
        activeSignTexture.dispose();
      };
    }, [fasciaTexture, backdropTexture, idleSignTexture, activeSignTexture]);

    const currentSignTexture = active ? activeSignTexture : idleSignTexture;

    const shelfBodyMat =
      theme === 'living' || theme === 'coffee'
        ? WARM_OAK_MAT
        : theme === 'design'
          ? VIOLET_ART_MAT
          : SLATE_DARK_MAT;

    const shelfTopMat =
      theme === 'living' || theme === 'coffee' ? CREAM_WALL_MAT : WHITE_GLOSS_MAT;

    useFrame(({ clock }) => {
      if (!visible) return;
      const t = clock.getElapsedTime();
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
            2. REAL-WORLD TRADE FAIR EXHIBITION STAND ARCHITECTURE:
               A) LARGE ILLUMINATED REAR ENTERPRISE BACKDROP WALL
               B) FRONT EXHIBITION RECEPTION & DISPLAY COUNTER (slot_01, slot_02)
               C) SYMMETRIC LEFT & RIGHT 2-TIER STEPPED DISPLAY SHELVES (slot_03..06)
           ================================================================ */}

        {/* A) Large Rear Enterprise Backdrop Wall (Company Name, Logo, Key Visual) */}
        <group position={[0, 1.86, -vd / 2 + 0.18]}>
          <mesh position={[0, 0, -0.02]} geometry={BACKDROP_GLOW_BORDER_GEOM} material={brandBasicMat} />
          <mesh geometry={BACKDROP_FRAME_GEOM} material={DARK_NAVY_MAT} />
          <mesh position={[0, 0, 0.065]} geometry={BACKDROP_CANVAS_GEOM}>
            <meshBasicMaterial map={backdropTexture} />
          </mesh>
          {/* Overhead Exhibition Backdrop Light Bar */}
          <mesh
            position={[0, 1.28, 0.12]}
            geometry={BACKDROP_LIGHT_BAR_GEOM}
            material={WHITE_LIGHT_MAT}
          />
        </group>

        {/* B) Front Exhibition Counter (Centered at x = 0, z = 1.25; top surface at y = 1.04) */}
        <group position={[0, 0, 1.25]}>
          <mesh
            position={[0, 0.67, 0]}
            castShadow
            receiveShadow
            geometry={EXPO_COUNTER_BODY_GEOM}
            material={shelfTopMat}
          />
          <mesh
            position={[0, 1.01, 0]}
            castShadow
            receiveShadow
            geometry={EXPO_COUNTER_TOP_GEOM}
            material={shelfBodyMat}
          />
          <mesh
            position={[0, 0.975, 0]}
            geometry={EXPO_COUNTER_LED_STRIP_GEOM}
            material={brandBasicMat}
          />
          <mesh
            position={[0, 0.66, 0.39]}
            geometry={EXPO_COUNTER_FRONT_PANEL_GEOM}
            material={brandStandardMat}
          />
        </group>

        {/* C1) Left Symmetric 2-Tier Stepped Exhibition Display Shelf (slot_03 Upper, slot_04 Lower) */}
        <group>
          {/* Upper Tier Structure (Centered at [-2.12, y, -0.32], top surface at y = 1.54) */}
          <group position={[-2.12, 0, -0.32]} rotation={[0, 0.36, 0]}>
            <mesh
              position={[0, 0.9, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_RACK_PILLAR_GEOM}
              material={shelfBodyMat}
            />
            <mesh
              position={[0, 1.51, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_SHELF_BOARD_GEOM}
              material={shelfTopMat}
            />
            <mesh
              position={[0, 1.47, 0]}
              geometry={STEPPED_SHELF_TRIM_GEOM}
              material={brandBasicMat}
            />
            <mesh
              position={[0, 1.88, -0.31]}
              geometry={STEPPED_RACK_BACKBOARD_GEOM}
              material={DARK_NAVY_MAT}
            />
          </group>

          {/* Lower Tier Structure (Centered at [-2.12, y, 0.34], top surface at y = 0.88) */}
          <group position={[-2.12, 0, 0.34]} rotation={[0, 0.36, 0]}>
            <mesh
              position={[0, 0.57, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_RACK_LOWER_BASE_GEOM}
              material={shelfBodyMat}
            />
            <mesh
              position={[0, 0.85, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_SHELF_BOARD_GEOM}
              material={shelfTopMat}
            />
            <mesh
              position={[0, 0.81, 0]}
              geometry={STEPPED_SHELF_TRIM_GEOM}
              material={brandBasicMat}
            />
          </group>
        </group>

        {/* C2) Right Symmetric 2-Tier Stepped Exhibition Display Shelf (slot_05 Upper, slot_06 Lower) */}
        <group>
          {/* Upper Tier Structure (Centered at [2.12, y, -0.32], top surface at y = 1.54) */}
          <group position={[2.12, 0, -0.32]} rotation={[0, -0.36, 0]}>
            <mesh
              position={[0, 0.9, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_RACK_PILLAR_GEOM}
              material={shelfBodyMat}
            />
            <mesh
              position={[0, 1.51, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_SHELF_BOARD_GEOM}
              material={shelfTopMat}
            />
            <mesh
              position={[0, 1.47, 0]}
              geometry={STEPPED_SHELF_TRIM_GEOM}
              material={brandBasicMat}
            />
            <mesh
              position={[0, 1.88, -0.31]}
              geometry={STEPPED_RACK_BACKBOARD_GEOM}
              material={DARK_NAVY_MAT}
            />
          </group>

          {/* Lower Tier Structure (Centered at [2.12, y, 0.34], top surface at y = 0.88) */}
          <group position={[2.12, 0, 0.34]} rotation={[0, -0.36, 0]}>
            <mesh
              position={[0, 0.57, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_RACK_LOWER_BASE_GEOM}
              material={shelfBodyMat}
            />
            <mesh
              position={[0, 0.85, 0]}
              castShadow
              receiveShadow
              geometry={STEPPED_SHELF_BOARD_GEOM}
              material={shelfTopMat}
            />
            <mesh
              position={[0, 0.81, 0]}
              geometry={STEPPED_SHELF_TRIM_GEOM}
              material={brandBasicMat}
            />
          </group>
        </group>

        {/* ================================================================
            3. DETERMINISTIC 3D SLOT PRODUCT RENDERING (`slot_01` .. `slot_06`)
           ================================================================ */}
        {resolvedSlots.map((slotView, idx) => (
          <SlotProductDisplay
            key={slotView.slot.slotId}
            slotIndex={idx}
            slotView={slotView}
            theme={theme}
            accentColor={booth.color}
            isSelected={Boolean(slotView.product && selectedProductId === slotView.product.id)}
            isBoothSelected={isSelected}
            brandMat={brandFlatMat}
            onSelectProduct={onSelectProduct}
          />
        ))}

        {/* ================================================================
            4. ARCHITECTURAL ROOF, FASCIA HEADER & FRONT PILLARS BY THEME
           ================================================================ */}
        {theme === 'tech' && (
          <group>
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

            <group position={[vw / 2 - 0.18, 0.18, vd / 2 - 0.22]}>
              <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
              <mesh position={[0, WALL_HEIGHT * 0.65, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
            </group>
            <group position={[-vw / 2 + 0.36, 0.18, vd / 2 - 0.2]}>
              <mesh position={[0, 0.04, 0]} geometry={TOTEM_BASE_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 0.98, 0]} geometry={TOTEM_BODY_GEOM} material={DARK_NAVY_MAT} />
              <mesh position={[0, 1.06, 0.085]} geometry={TOTEM_SCREEN_GEOM} material={CYAN_GLOW_MAT} />
            </group>
          </group>
        )}

        {theme === 'living' && (
          <group>
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
            </group>

            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`oak-pil-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={WARM_OAK_MAT} />
                <mesh position={[idx === 0 ? 0.42 : -0.42, 0.19, 0.25]} geometry={PLANT_POT_GEOM} material={CREAM_WALL_MAT} />
                <mesh position={[idx === 0 ? 0.42 : -0.42, 0.52, 0.25]} geometry={PLANT_BUSH_GEOM} material={EMERALD_PLANT_MAT} />
              </group>
            ))}
          </group>
        )}

        {theme === 'coffee' && (
          <group>
            <group position={[0, WALL_HEIGHT + 0.26, 0.08]}>
              <mesh position={[0, 0, vd / 2 + 0.06]} castShadow material={ESPRESSO_WOOD_MAT}>
                <boxGeometry args={[vw + 0.46, 0.58, 0.4]} />
              </mesh>
              <mesh position={[0, 0, vd / 2 + 0.27]}>
                <planeGeometry args={[vw + 0.2, 0.54]} />
                <meshBasicMaterial map={fasciaTexture} />
              </mesh>
              {[-2.4, -1.44, -0.48, 0.48, 1.44, 2.4].map((ax, idx) => (
                <mesh
                  key={`cafe-awning-${idx}`}
                  position={[ax, -0.34, vd / 2 + 0.56]}
                  rotation={[0.34, 0, 0]}
                  geometry={AWNING_SLAT_GEOM}
                  material={idx % 2 === 0 ? COPPER_CRAFT_MAT : CREAM_WALL_MAT}
                />
              ))}
              {[-2.1, -1.05, 0, 1.05, 2.1].map((lx, idx) => (
                <mesh
                  key={`cafe-bulb-${idx}`}
                  position={[lx, -0.56, vd / 2 + 0.48]}
                  geometry={LANTERN_BULB_GEOM}
                  material={WARM_BULB_MAT}
                />
              ))}
            </group>

            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`cafe-col-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={ESPRESSO_WOOD_MAT} />
                <mesh position={[idx === 0 ? 0.45 : -0.45, 0.19, 0.28]} geometry={PLANT_POT_GEOM} material={COPPER_CRAFT_MAT} />
                <mesh position={[idx === 0 ? 0.45 : -0.45, 0.52, 0.28]} geometry={PLANT_BUSH_GEOM} material={EMERALD_PLANT_MAT} />
              </group>
            ))}
          </group>
        )}

        {theme === 'robotics' && (
          <group>
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

            {[-vw / 2 + 0.22, vw / 2 - 0.22].map((px, idx) => (
              <group key={`rob-truss-${idx}`} position={[px, 0.18, vd / 2 - 0.2]}>
                <mesh position={[0, 0.09, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
                <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
                <mesh position={[0, WALL_HEIGHT * 0.4, 0]} geometry={TRUSS_RING_GEOM} material={GOLD_BASIC_MAT} />
                <mesh position={[0, WALL_HEIGHT * 0.78, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
              </group>
            ))}
          </group>
        )}

        {theme === 'design' && (
          <group>
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
          </group>
        )}

        {theme === 'energy' && (
          <group>
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
          </group>
        )}

        {/* ================================================================
            5. GRAND STOREFRONT SIGNBOARD (Positioned on Front Roof Crown)
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
