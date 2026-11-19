import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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
  type ArchitecturalDisplayStyle,
  createBoothSignTexture,
  createEnterpriseBackdropTexture,
  createProductDisplayCardTexture,
  createArchitecturalProductDisplayTexture,
  createArchitecturalSignTexture,
} from './sceneTextures';
import { cloneCachedAsset, getBoothGlbAssetId, resolveBoothModelVersion } from './assetLoader';
import { RooflessBoothShell } from './RooflessBoothShell';
import { ExteriorAssets, type ExteriorPlacement } from './ExteriorAssets';
import { SalesAssistantNpc } from './SalesAssistantNpc';
import type { NpcAnimationClipName } from '../services/npcPresentationService';

export interface BoothProps {
  booth: BoothType;
  productCount: number;
  slots?: BoothSlotView[];
  selectedProductId?: string | null;
  npcHighlightedProductId?: string | null;
  isActiveNpcSession?: boolean;
  activeNpcAnimation?: NpcAnimationClipName;
  onActivateNpc?: (booth: BoothType) => void;
  onSelectProduct?: (product: Product) => void;
  isSelected: boolean;
  onSelect: (booth: BoothType) => void;
  visible?: boolean;
  showParkPlanters?: boolean;
  worldVersion?: 'v26' | 'v27_0' | 'v27';
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

// KHU B — Main Showroom Podium (Centered at x = 0, z = 0.92; low-profile top surface at y = 0.56)
const EXPO_COUNTER_BODY_GEOM = new THREE.BoxGeometry(3.32, 0.26, 0.84);
const EXPO_COUNTER_TOP_GEOM = new THREE.BoxGeometry(3.44, 0.05, 0.92);
const EXPO_COUNTER_FRONT_PANEL_GEOM = new THREE.BoxGeometry(3.12, 0.18, 0.04);
const EXPO_COUNTER_LED_STRIP_GEOM = new THREE.BoxGeometry(3.4, 0.035, 0.9);
const COUNTER_PLINTH_BASE_GEOM = new THREE.BoxGeometry(3.18, 0.08, 0.74);
const COUNTER_TOP_TRIM_GEOM = new THREE.BoxGeometry(3.48, 0.018, 0.96);

// KHU C — Symmetric 2-Tier Secondary Showroom Racks (Flanking at x = ±2.44m)
const STEPPED_RACK_PILLAR_GEOM = new THREE.BoxGeometry(1.18, 1.38, 0.64);
const STEPPED_RACK_LOWER_BASE_GEOM = new THREE.BoxGeometry(1.24, 0.14, 0.68);
const STEPPED_SHELF_BOARD_GEOM = new THREE.BoxGeometry(1.3, 0.055, 0.74);
const STEPPED_SHELF_TRIM_GEOM = new THREE.BoxGeometry(1.32, 0.025, 0.76);
const STEPPED_RACK_BACKBOARD_GEOM = new THREE.BoxGeometry(1.28, 1.18, 0.05);
const SHELF_STRUT_ROD_GEOM = new THREE.CylinderGeometry(0.018, 0.018, 1.22, 8);
const SHELF_CORNER_BRACKET_GEOM = new THREE.BoxGeometry(0.08, 0.12, 0.08);

// Portrait Showroom Product Display Panel Geometries
const SLOT_STAND_BASE_GEOM = new THREE.BoxGeometry(1.08, 0.036, 0.36);
const SLOT_STAND_LED_TRIM_GEOM = new THREE.BoxGeometry(1.11, 0.012, 0.38);
const SLOT_STAND_STRUT_GEOM = new THREE.BoxGeometry(0.26, 0.48, 0.05);
const SLOT_CARD_FRAME_GEOM = new THREE.BoxGeometry(1.14, 1.38, 0.046);
const SLOT_CARD_BEZEL_GEOM = new THREE.BoxGeometry(1.18, 1.42, 0.03);
const SLOT_CARD_PLANE_GEOM = new THREE.PlaneGeometry(1.1, 1.33);

// Flush Backdrop Recessed Display Bay Geometries (Fits cleanly inside the two 1.61m × 1.75m backdrop bays)
export const BACKDROP_LEFT_BAY_LOCAL_POS: readonly [number, number, number] = [-0.882, 1.674, -1.842];
export const BACKDROP_RIGHT_BAY_LOCAL_POS: readonly [number, number, number] = [0.882, 1.674, -1.842];
const BACKDROP_BAY_BEZEL_GEOM = new THREE.BoxGeometry(1.5, 1.64, 0.012);
const BACKDROP_BAY_FRAME_GEOM = new THREE.BoxGeometry(1.46, 1.6, 0.014);
const BACKDROP_BAY_PLANE_GEOM = new THREE.PlaneGeometry(1.42, 1.56);

export interface ResolvedBoothDisplaySlots {
  leftBackdropSlot: BoothSlotView | null;
  rightBackdropSlot: BoothSlotView | null;
  remainingShelfSlots: BoothSlotView[];
}

/**
 * Deterministically maps a booth's 6 `BoothSlotView` records (`slot_01..slot_06`) into the two
 * built-in Backdrop Display Bays (`leftBackdropSlot`, `rightBackdropSlot`) and any overflow
 * secondary shelf slots (`remainingShelfSlots`), without altering `slotId`, `productId`, or Admin data:
 * - Removes all protruding standing panels from the front center counter (`slot_01`, `slot_02`).
 * - Places up to 2 primary occupied products into the Left & Right Backdrop Bays (`0` -> both empty,
 *   `1` -> single bay occupied & other empty, `2` -> both bays occupied, `>2` -> 2 bays occupied + remaining on shelves).
 */
export function resolveBoothBackdropAndShelfSlots(
  resolvedSlots: BoothSlotView[]
): ResolvedBoothDisplaySlots {
  const byId = new Map<string, BoothSlotView>();
  for (const sv of resolvedSlots) {
    byId.set(sv.slot.slotId, sv);
  }

  const occupied = resolvedSlots.filter((sv) => Boolean(sv.product));
  let leftBackdropSlot: BoothSlotView | null = null;
  let rightBackdropSlot: BoothSlotView | null = null;

  const slot01 = byId.get('slot_01');
  const slot02 = byId.get('slot_02');

  if (slot01?.product) {
    leftBackdropSlot = slot01;
  }
  if (slot02?.product) {
    rightBackdropSlot = slot02;
  }

  const unassignedShelfOccupied = occupied.filter(
    (sv) => sv !== leftBackdropSlot && sv !== rightBackdropSlot && sv.slot.zone !== 'counter'
  );

  if (occupied.length === 1 && !leftBackdropSlot && !rightBackdropSlot && unassignedShelfOccupied.length === 1) {
    const only = unassignedShelfOccupied[0];
    if (only.slot.zone === 'right-shelf') {
      rightBackdropSlot = only;
    } else {
      leftBackdropSlot = only;
    }
  } else {
    if (!leftBackdropSlot && unassignedShelfOccupied.length > 0) {
      const preferredLeft =
        unassignedShelfOccupied.find((sv) => sv.slot.zone === 'left-shelf') ||
        unassignedShelfOccupied[0];
      leftBackdropSlot = preferredLeft;
    }

    const afterLeft = unassignedShelfOccupied.filter((sv) => sv !== leftBackdropSlot);
    if (!rightBackdropSlot && afterLeft.length > 0) {
      const preferredRight =
        afterLeft.find((sv) => sv.slot.zone === 'right-shelf') || afterLeft[0];
      rightBackdropSlot = preferredRight;
    }
  }

  const remainingShelfSlots = occupied.filter(
    (sv) =>
      sv !== leftBackdropSlot &&
      sv !== rightBackdropSlot &&
      sv.slot.zone !== 'counter'
  );

  return {
    leftBackdropSlot,
    rightBackdropSlot,
    remainingShelfSlots,
  };
}

const SIGN_HOOD_VISOR_GEOM = new THREE.BoxGeometry(1, 0.06, 0.44);
const SIGN_BRACKET_GEOM = new THREE.BoxGeometry(0.12, 0.42, 0.22);
const TRUSS_GUSSET_GEOM = new THREE.BoxGeometry(0.28, 0.04, 0.28);


const TOTEM_BODY_GEOM = new THREE.BoxGeometry(0.56, 1.92, 0.16);
const TOTEM_BASE_GEOM = new THREE.BoxGeometry(0.68, 0.08, 0.36);
const TOTEM_SCREEN_GEOM = new THREE.PlaneGeometry(0.46, 1.18);

const BEACON_RING_GEOM = new THREE.RingGeometry(0.34, 0.48, 24);
const BEACON_CORE_GEOM = new THREE.CircleGeometry(0.26, 20);

const PLANT_BUSH_GEOM = new THREE.DodecahedronGeometry(0.28, 0);

// ============================================================================
// Shared Module-Level Materials across all 6 booths
// ============================================================================
const DARK_NAVY_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  roughness: 0.38,
  metalness: 0.25,
});
const SLATE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45 });
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
const OAK_SLAT_MAT = new THREE.MeshStandardMaterial({
  color: '#c27803',
  roughness: 0.62,
  metalness: 0.08,
});
const ANODIZED_TITANIUM_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.28,
  metalness: 0.75,
});
const BRASS_ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#d97706',
  metalness: 0.78,
  roughness: 0.25,
});
const GOLD_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
const CYAN_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const EMERALD_GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#34d399' });
const WHITE_LIGHT_MAT = new THREE.MeshBasicMaterial({ color: '#f8fafc' });

interface SlotGlbModelProps {
  url: string;
}

const SlotGlbModel: React.FC<SlotGlbModelProps> = ({ url }) => {
  const gltf = useGLTF(url);
  const clonedScene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 0.56 / maxDim;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale + 0.04, -center.z * scale);
    return clone;
  }, [gltf.scene]);

  return <primitive object={clonedScene} />;
};

class SlotModelErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface InSpaceDisplaySlotSpec {
  mode: 'in-space' | 'backdrop';
  position: readonly [number, number, number];
  rotationY: number;
  scale: number;
  displayStyle?: ArchitecturalDisplayStyle;
}

interface V274SignageSpec {
  position: readonly [number, number, number];
  backPosition: readonly [number, number, number];
  width: number;
  height: number;
}

/**
 * V27.4 Phase 3 — Per-Booth Slim Architectural Signage Placement.
 * Leaves arches (Organic Flow, Gallery Arch), overhead ring (Signature Ring),
 * and sculpted wave canopy (Wave Pavilion) completely unobstructed.
 */
const V27_4_SIGNAGE_CONFIGS: Record<BoothVisualTheme, V274SignageSpec> = {
  living: { position: [0, 3.64, 2.18], backPosition: [0, 3.64, 1.94], width: 4.95, height: 0.34 },
  design: { position: [0, 3.74, 2.02], backPosition: [0, 3.74, 1.88], width: 3.85, height: 0.32 },
  tech: { position: [0, 3.58, 2.18], backPosition: [0, 3.58, 1.66], width: 5.15, height: 0.36 },
  energy: { position: [-0.55, 3.56, 2.10], backPosition: [-0.55, 3.56, 1.80], width: 4.35, height: 0.32 },
  coffee: { position: [0, 3.74, 2.04], backPosition: [0, 3.74, 1.90], width: 3.95, height: 0.32 },
  robotics: { position: [0, 3.56, 2.11], backPosition: [0, 3.56, 1.73], width: 5.05, height: 0.34 },
};

/**
 * V27.4 Phase 1 & 2 — Full 6-Slot Architectural Product Display Layouts per Booth.
 * Each booth uses its own bespoke physical furniture (circular island, pill pedestals,
 * L-counter, wave bar, gallery island risers, faceted pods, niches, kiosks) and
 * its matching ArchitecturalDisplayStyle — works cleanly for 0, 1, 3, or 6 products.
 */
const V27_4_PRODUCT_DISPLAY_LAYOUTS: Record<BoothVisualTheme, readonly InSpaceDisplaySlotSpec[]> = {
  // Booth 01 — Signature Ring (Luxury Circular Showroom): Hero center island + flanking round pedestals + right desk + curved arc shelves
  living: [
    { mode: 'in-space', position: [0.0, 0.98, 0.15], rotationY: 0.0, scale: 0.72, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-1.25, 0.91, 0.85], rotationY: 0.24, scale: 0.62, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [1.15, 1.11, -0.95], rotationY: -0.22, scale: 0.64, displayStyle: 'gallery-frame' },
    { mode: 'in-space', position: [2.02, 1.03, 0.62], rotationY: -0.52, scale: 0.56, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [-0.45, 1.22, -1.78], rotationY: 0.16, scale: 0.58, displayStyle: 'gallery-frame' },
    { mode: 'in-space', position: [-1.32, 1.22, -1.42], rotationY: 0.45, scale: 0.56, displayStyle: 'gallery-frame' },
  ],
  // Booth 02 — Organic Flow (Immersive Creative Gallery): Off-axis sculptural pill pedestals + oval desk + S-curve wall
  design: [
    { mode: 'in-space', position: [-0.45, 0.96, 0.35], rotationY: 0.28, scale: 0.70, displayStyle: 'gallery-frame' },
    { mode: 'in-space', position: [0.92, 1.08, -0.65], rotationY: -0.22, scale: 0.66, displayStyle: 'gallery-frame' },
    { mode: 'in-space', position: [-1.15, 0.82, -0.72], rotationY: 0.32, scale: 0.60, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-2.05, 1.00, 0.65], rotationY: 0.36, scale: 0.56, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [1.95, 1.00, -1.25], rotationY: -0.42, scale: 0.54, displayStyle: 'wall-niche' },
    { mode: 'in-space', position: [0.15, 1.24, -1.55], rotationY: 0.0, scale: 0.60, displayStyle: 'gallery-frame' },
  ],
  // Booth 03 — Grand Portal (Modular Digital Experience): Stepped demo island + L-counter + digital kiosk + rear media wall + blade shelves
  tech: [
    { mode: 'in-space', position: [0.55, 0.99, 0.58], rotationY: -0.16, scale: 0.70, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-1.45, 1.01, 0.82], rotationY: 0.18, scale: 0.64, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [1.98, 1.18, -0.38], rotationY: -0.38, scale: 0.66, displayStyle: 'digital-kiosk' },
    { mode: 'in-space', position: [-0.35, 1.25, -1.78], rotationY: 0.0, scale: 0.72, displayStyle: 'shelf-screen' },
    { mode: 'in-space', position: [-2.35, 1.00, -1.48], rotationY: 0.14, scale: 0.56, displayStyle: 'shelf-screen' },
    { mode: 'in-space', position: [1.55, 1.00, -1.48], rotationY: -0.14, scale: 0.56, displayStyle: 'shelf-screen' },
  ],
  // Booth 04 — Wave Pavilion (Open Interactive Showcase): Left-center 3-pedestal cluster + depthwise right wave bar + angled promo screen
  energy: [
    { mode: 'in-space', position: [-0.92, 0.98, 0.58], rotationY: 0.22, scale: 0.70, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-0.18, 1.08, -0.35], rotationY: 0.08, scale: 0.66, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [1.92, 1.02, 0.42], rotationY: -0.88, scale: 0.60, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [1.92, 1.02, -0.58], rotationY: -0.88, scale: 0.60, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [-1.62, 0.78, 0.12], rotationY: 0.34, scale: 0.58, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-1.86, 1.18, -1.08], rotationY: 0.48, scale: 0.64, displayStyle: 'digital-kiosk' },
  ],
  // Booth 05 — Gallery Arch (Boutique Architectural Gallery): Low elongated central island risers + 3 rear recessed arched niches + boutique desk
  coffee: [
    { mode: 'in-space', position: [-0.72, 1.02, -0.05], rotationY: 0.14, scale: 0.68, displayStyle: 'gallery-frame' },
    { mode: 'in-space', position: [0.58, 0.91, -0.05], rotationY: -0.14, scale: 0.66, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [0.0, 1.50, -1.68], rotationY: 0.0, scale: 0.62, displayStyle: 'wall-niche' },
    { mode: 'in-space', position: [-1.92, 1.50, -1.68], rotationY: 0.12, scale: 0.60, displayStyle: 'wall-niche' },
    { mode: 'in-space', position: [1.92, 1.50, -1.68], rotationY: -0.12, scale: 0.60, displayStyle: 'wall-niche' },
    { mode: 'in-space', position: [1.98, 1.01, -0.68], rotationY: -0.42, scale: 0.56, displayStyle: 'tabletop-display' },
  ],
  // Booth 06 — Dynamic Frame (Futuristic Modular Lab): Left twin faceted pods + front-right angled counter + digital monolith + floating right shelves
  robotics: [
    { mode: 'in-space', position: [-1.35, 0.99, 0.62], rotationY: 0.24, scale: 0.70, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [1.35, 1.00, 0.78], rotationY: -0.32, scale: 0.66, displayStyle: 'tabletop-display' },
    { mode: 'in-space', position: [-0.62, 1.11, -0.65], rotationY: 0.16, scale: 0.66, displayStyle: 'physical-stand' },
    { mode: 'in-space', position: [-2.12, 1.24, -0.84], rotationY: 0.42, scale: 0.64, displayStyle: 'digital-kiosk' },
    { mode: 'in-space', position: [2.52, 1.10, 0.28], rotationY: -1.48, scale: 0.54, displayStyle: 'shelf-screen' },
    { mode: 'in-space', position: [2.52, 1.10, -0.58], rotationY: -1.48, scale: 0.54, displayStyle: 'shelf-screen' },
  ],
};

/**
 * V27.1 Phase 3 — Universal In-Space Architectural Product Showcase Layouts.
 * Each of the 6 V4 booth archetypes presents real DB products on distinct physical
 * architectural surfaces (pedestals, curved counters, recessed feature bays) instead of
 * uniform flat back-wall cards, while keeping 100% of boothId/slotId/Admin data unchanged.
 */
const V27_1_IN_SPACE_SHOWCASE_LAYOUTS: Record<
  BoothVisualTheme,
  { primary: InSpaceDisplaySlotSpec; secondary: InSpaceDisplaySlotSpec }
> = {
  // Booth 01 — Signature Ring (V27.3 Luxury Showroom): Center-right hero pedestal + Front-left curved counter
  living: {
    primary: { mode: 'in-space', position: [0.58, 1.04, 0.68], rotationY: -0.18, scale: 0.72 },
    secondary: { mode: 'in-space', position: [-1.52, 1.04, 0.92], rotationY: 0.16, scale: 0.70 },
  },
  // Booth 02 — Organic Flow (V27.3 Creative Gallery): Rear arched gallery bay + Front-right pastel pill plinth
  design: {
    primary: { mode: 'backdrop', position: [-0.84, 1.68, -1.83], rotationY: 0, scale: 1.0 },
    secondary: { mode: 'in-space', position: [0.86, 0.99, 0.56], rotationY: -0.24, scale: 0.70 },
  },
  // Booth 03 — Grand Portal (V27.3 Digital Experience): Stepped center-right podium + Rear flagship screen
  tech: {
    primary: { mode: 'in-space', position: [0.92, 1.01, 0.58], rotationY: -0.18, scale: 0.74 },
    secondary: { mode: 'backdrop', position: [-0.86, 1.68, -1.83], rotationY: 0, scale: 1.0 },
  },
  // Booth 04 — Wave Pavilion (V27.3 Interactive Showcase): Sweeping wave counter + Orange cluster pedestal
  energy: {
    primary: { mode: 'in-space', position: [-1.05, 1.06, 0.84], rotationY: 0.14, scale: 0.74 },
    secondary: { mode: 'in-space', position: [0.96, 1.01, 0.56], rotationY: -0.24, scale: 0.70 },
  },
  // Booth 05 — Gallery Arch (V27.3 Boutique Exhibition): Natural stone hero plinth + Recessed gallery bay
  coffee: {
    primary: { mode: 'in-space', position: [0.92, 1.03, 0.58], rotationY: -0.20, scale: 0.72 },
    secondary: { mode: 'backdrop', position: [-0.88, 1.68, -1.83], rotationY: 0, scale: 1.0 },
  },
  // Booth 06 — Dynamic Frame (V27.3 Modern Innovation): Angular violet pedestal + Multi-tier demo counter
  robotics: {
    primary: { mode: 'in-space', position: [0.94, 1.02, 0.58], rotationY: -0.24, scale: 0.72 },
    secondary: { mode: 'in-space', position: [-1.14, 1.05, 0.80], rotationY: 0.18, scale: 0.72 },
  },
};

interface SlotProductDisplayProps {
  slotView: BoothSlotView;
  accentColor: string;
  isSelected: boolean;
  brandMat: THREE.Material;
  onSelectProduct?: (product: Product) => void;
  placementMode?: 'backdrop' | 'shelf' | 'in-space';
  backdropLocalPos?: readonly [number, number, number];
  inSpaceTransform?: InSpaceDisplaySlotSpec;
}

const SlotProductDisplay: React.FC<SlotProductDisplayProps> = React.memo(
  ({
    slotView,
    accentColor,
    isSelected,
    brandMat,
    onSelectProduct,
    placementMode = 'shelf',
    backdropLocalPos,
    inSpaceTransform,
  }) => {
    const [hovered, setHovered] = useState(false);
    const { slot, product } = slotView;
    const highlighted = isSelected || hovered;

    const cardTexture = useMemo(() => {
      if (!product) return null;
      const priceText = formatCurrency(product.price, product.currency);
      const imageUrl = product.images?.[0] || '';
      if (inSpaceTransform?.displayStyle) {
        return createArchitecturalProductDisplayTexture({
          name: product.name,
          priceText,
          imageUrl,
          accentColor,
          selected: isSelected,
          style: inSpaceTransform.displayStyle,
        });
      }
      return createProductDisplayCardTexture({
        slotLabel: `${slot.slotId.toUpperCase()} · ${slot.label}`,
        name: product.name,
        priceText,
        sku: product.sku,
        imageUrl,
        accentColor,
        selected: isSelected,
      });
    }, [
      product,
      product?.id,
      product?.name,
      product?.price,
      product?.currency,
      product?.sku,
      product?.images?.[0],
      slot.slotId,
      slot.label,
      accentColor,
      isSelected,
      inSpaceTransform?.displayStyle,
    ]);

    useEffect(() => {
      return () => {
        if (cardTexture) {
          cardTexture.dispose();
        }
      };
    }, [cardTexture]);

    if (!product) {
      return null;
    }

    // Mode 1: Flush Backdrop Display Bay Integration (Zero protruding stand, mounted inside backdrop recess)
    if (placementMode === 'backdrop' && backdropLocalPos) {
      const bayScale: [number, number, number] = highlighted ? [1.018, 1.018, 1] : [1, 1, 1];
      return (
        <group
          position={[backdropLocalPos[0], backdropLocalPos[1], backdropLocalPos[2]]}
          scale={bayScale}
          onClick={
            onSelectProduct
              ? (e) => {
                  e.stopPropagation();
                  onSelectProduct(product);
                }
              : undefined
          }
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            document.body.style.cursor = 'auto';
          }}
        >
          {/* Flush recessed outer highlight trim */}
          <mesh
            position={[0, 0, -0.004]}
            geometry={BACKDROP_BAY_BEZEL_GEOM}
            material={highlighted ? GOLD_BASIC_MAT : brandMat}
          />
          {/* Thin architectural display backing */}
          <mesh
            geometry={BACKDROP_BAY_FRAME_GEOM}
            material={highlighted ? GOLD_SHOWCASE_MAT : DARK_NAVY_MAT}
          />
          {/* Crisp Product Photo, Name, Price & Detail CTA Surface */}
          {cardTexture && (
            <mesh position={[0, 0, 0.009]} geometry={BACKDROP_BAY_PLANE_GEOM}>
              <meshBasicMaterial map={cardTexture} toneMapped={false} />
            </mesh>
          )}
        </group>
      );
    }

    // Mode 1B: V27.1 Universal In-Space Architectural Pedestal / Counter Display Stand
    if (placementMode === 'in-space' && inSpaceTransform) {
      const s = highlighted ? inSpaceTransform.scale * 1.04 : inSpaceTransform.scale;
      return (
        <group
          position={[
            inSpaceTransform.position[0],
            inSpaceTransform.position[1],
            inSpaceTransform.position[2],
          ]}
          rotation={[0, inSpaceTransform.rotationY, 0]}
          onClick={
            onSelectProduct
              ? (e) => {
                  e.stopPropagation();
                  onSelectProduct(product);
                }
              : undefined
          }
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
            document.body.style.cursor = 'auto';
          }}
        >
          <group scale={[s, s, s]}>
            {/* Weighted Architectural Metallic Display Base */}
            <mesh position={[0, 0.018, 0]} geometry={SLOT_STAND_BASE_GEOM} material={DARK_NAVY_MAT} />
            <mesh
              position={[0, 0.04, 0]}
              geometry={SLOT_STAND_LED_TRIM_GEOM}
              material={highlighted ? GOLD_BASIC_MAT : brandMat}
            />
            {/* Rear Angled Structural Easel Strut */}
            <mesh
              position={[0, 0.24, -0.10]}
              rotation={[0.26, 0, 0]}
              geometry={SLOT_STAND_STRUT_GEOM}
              material={SLATE_DARK_MAT}
            />
            {/* Beveled 3D Architectural Display Frame with Real Depth */}
            <group position={[0, 0.73, 0.02]} rotation={[-0.08, 0, 0]}>
              <mesh
                position={[0, 0, -0.006]}
                geometry={SLOT_CARD_BEZEL_GEOM}
                material={highlighted ? GOLD_BASIC_MAT : brandMat}
              />
              <mesh
                geometry={SLOT_CARD_FRAME_GEOM}
                material={highlighted ? GOLD_SHOWCASE_MAT : DARK_NAVY_MAT}
              />
              {cardTexture && (
                <mesh position={[0, 0, 0.026]} geometry={SLOT_CARD_PLANE_GEOM}>
                  <meshBasicMaterial map={cardTexture} toneMapped={false} />
                </mesh>
              )}
            </group>
          </group>
        </group>
      );
    }

    // Mode 2: Overflow Secondary Shelf Slots (>2 products on booth, e.g. slot_03..slot_06)
    const baseScale: [number, number, number] = [0.98, 0.85, 1.0];
    const displayScale: [number, number, number] = highlighted
      ? [baseScale[0] * 1.03, baseScale[1] * 1.03, baseScale[2] * 1.03]
      : baseScale;
    const facingYawOffset =
      slot.zone === 'left-shelf' ? -0.06 : slot.zone === 'right-shelf' ? 0.06 : 0;

    const hasValidModelUrl = Boolean(
      product.modelUrl && /\.(glb|gltf)(\?.*)?$/i.test(product.modelUrl.trim())
    );

    const renderFramedPhotoStand = () => (
      <group position={[0, 0.725, 0.026]} rotation={[-0.02, 0, 0]}>
        <mesh
          position={[0, 0, -0.005]}
          geometry={SLOT_CARD_BEZEL_GEOM}
          material={highlighted ? GOLD_BASIC_MAT : brandMat}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={SLOT_CARD_FRAME_GEOM}
          material={highlighted ? GOLD_SHOWCASE_MAT : DARK_NAVY_MAT}
        />
        {cardTexture && (
          <mesh position={[0, 0, 0.025]} geometry={SLOT_CARD_PLANE_GEOM}>
            <meshBasicMaterial map={cardTexture} toneMapped={false} />
          </mesh>
        )}
      </group>
    );

    return (
      <group
        position={slot.position}
        rotation={[slot.rotation[0], slot.rotation[1] + facingYawOffset, slot.rotation[2]]}
        onClick={
          onSelectProduct
            ? (e) => {
                e.stopPropagation();
                onSelectProduct(product);
              }
            : undefined
        }
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <group scale={displayScale}>
          <mesh
            position={[0, 0.019, 0]}
            castShadow
            receiveShadow
            geometry={SLOT_STAND_BASE_GEOM}
            material={DARK_NAVY_MAT}
          />
          <mesh
            position={[0, 0.04, 0]}
            geometry={SLOT_STAND_LED_TRIM_GEOM}
            material={highlighted ? GOLD_BASIC_MAT : brandMat}
          />
          <mesh
            position={[0, 0.19, -0.075]}
            rotation={[0.22, 0, 0]}
            castShadow
            geometry={SLOT_STAND_STRUT_GEOM}
            material={SLATE_DARK_MAT}
          />

          {hasValidModelUrl && product.modelUrl ? (
            <SlotModelErrorBoundary fallback={renderFramedPhotoStand()}>
              <Suspense fallback={renderFramedPhotoStand()}>
                <SlotGlbModel url={product.modelUrl.trim()} />
              </Suspense>
            </SlotModelErrorBoundary>
          ) : (
            renderFramedPhotoStand()
          )}
        </group>
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
    npcHighlightedProductId = null,
    isActiveNpcSession = false,
    activeNpcAnimation = 'IDLE',
    onActivateNpc,
    onSelectProduct,
    isSelected,
    onSelect,
    visible = true,
    showParkPlanters = true,
    worldVersion = 'v26',
  }) => {
    const [hovered, setHovered] = useState(false);
    const beaconRingRef = useRef<THREE.Mesh>(null);

    const w = booth.width || 5.6;
    const d = booth.depth || 4.2;
    const vw = Math.max(w, 6.0);
    const vd = Math.max(d, 4.4);
    const active = hovered || isSelected;
    const theme = useMemo(() => resolveBoothTheme(booth), [booth]);
    const boothModelVersion = useMemo(
      () => resolveBoothModelVersion(theme, { worldVersion }),
      [theme, worldVersion]
    );
    const isBoothV274 = boothModelVersion === 'v27_4';
    const isBoothV4 = boothModelVersion === 'v4' || boothModelVersion === 'v27_3' || isBoothV274;
    const isBoothV2 = true;
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

    const { leftBackdropSlot, rightBackdropSlot, remainingShelfSlots } = useMemo(
      () => resolveBoothBackdropAndShelfSlots(resolvedSlots),
      [resolvedSlots]
    );

    const leftBayPos = useMemo<readonly [number, number, number]>(
      () =>
        isBoothV2
          ? BACKDROP_LEFT_BAY_LOCAL_POS
          : [-0.882, 1.674, -vd / 2 + 0.263],
      [isBoothV2, vd]
    );

    const rightBayPos = useMemo<readonly [number, number, number]>(
      () =>
        isBoothV2
          ? BACKDROP_RIGHT_BAY_LOCAL_POS
          : [0.882, 1.674, -vd / 2 + 0.263],
      [isBoothV2, vd]
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

    // Pre-generate and cache Unified Brand Header (Idle/Active) and Calm Showroom Backdrop textures
    const { backdropTexture, idleSignTexture, activeSignTexture } = useMemo(() => {
      const enterpriseTitle = booth.companyName || booth.name;
      const standSubtitle =
        booth.companyName && booth.companyName !== booth.name
          ? `${booth.name} · ${booth.category}`
          : booth.category;
      return {
        backdropTexture: createEnterpriseBackdropTexture({
          name: booth.name,
          companyName: enterpriseTitle,
          category: booth.category,
          tagline: booth.tagline,
          description: booth.description,
          color: booth.color,
          logoUrl: booth.logoUrl,
          bannerUrl: booth.bannerUrl,
          contactUrl: booth.contactUrl,
          contactEmail: booth.contactEmail,
          occupiedSlots: occupiedSlotCount || productCount,
          totalSlots: BOOTH_SLOT_DEFINITIONS.length,
          theme,
        }),
        idleSignTexture: isBoothV274
          ? createArchitecturalSignTexture({
              name: enterpriseTitle,
              category: standSubtitle,
              productCount: occupiedSlotCount || productCount,
              color: booth.color,
              active: false,
              theme,
            })
          : createBoothSignTexture({
              name: enterpriseTitle,
              category: standSubtitle,
              productCount: occupiedSlotCount || productCount,
              color: booth.color,
              active: false,
              theme,
            }),
        activeSignTexture: isBoothV274
          ? createArchitecturalSignTexture({
              name: enterpriseTitle,
              category: standSubtitle,
              productCount: occupiedSlotCount || productCount,
              color: booth.color,
              active: true,
              theme,
            })
          : createBoothSignTexture({
              name: enterpriseTitle,
              category: standSubtitle,
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
      booth.description,
      booth.color,
      booth.logoUrl,
      booth.bannerUrl,
      booth.contactUrl,
      booth.contactEmail,
      occupiedSlotCount,
      productCount,
      theme,
      isBoothV274,
    ]);

    useEffect(() => {
      return () => {
        backdropTexture.dispose();
        idleSignTexture.dispose();
        activeSignTexture.dispose();
      };
    }, [backdropTexture, idleSignTexture, activeSignTexture]);

    const currentSignTexture = active ? activeSignTexture : idleSignTexture;

    const shelfBodyMat =
      theme === 'living' || theme === 'coffee'
        ? WARM_OAK_MAT
        : theme === 'design'
          ? VIOLET_ART_MAT
          : SLATE_DARK_MAT;

    const shelfTopMat =
      theme === 'living' || theme === 'coffee' ? CREAM_WALL_MAT : WHITE_GLOSS_MAT;

    const rackBackboardMat =
      theme === 'living' || theme === 'coffee'
        ? OAK_SLAT_MAT
        : theme === 'design'
          ? VIOLET_ART_MAT
          : theme === 'energy'
            ? WHITE_GLOSS_MAT
            : ANODIZED_TITANIUM_MAT;

    useFrame(({ clock }) => {
      if (!visible) return;
      const t = clock.getElapsedTime();
      if (beaconRingRef.current) {
        const pulse = active ? 1.18 + Math.sin(t * 5) * 0.1 : 1.0 + Math.sin(t * 2.5) * 0.05;
        beaconRingRef.current.scale.set(pulse, pulse, 1);
      }
    });

    const boothDecorPlacements = useMemo<ExteriorPlacement[]>(() => {
      // Position front-booth trees (`tree-gian.glb`) cleanly outside the V2 booth plinth (X: ±3.62, Z: 2.72)
      // and front steps (X: ±2.82, Z: 3.17) in front of the front facade corners (Task B)
      const cornerX = 3.65;
      const frontZ = 3.68;
      switch (theme) {
        case 'tech':
          return [{ position: [-cornerX, 0.02, frontZ], rotation: 0.2 }];
        case 'living':
          return [
            { position: [-cornerX, 0.02, frontZ], rotation: 0.15 },
            { position: [cornerX, 0.02, frontZ], rotation: -0.15 },
          ];
        case 'coffee':
          return [
            { position: [-cornerX, 0.02, frontZ], rotation: 0.2 },
            { position: [cornerX, 0.02, frontZ], rotation: -0.2 },
          ];
        case 'robotics':
          return [{ position: [cornerX, 0.02, frontZ], rotation: -0.2 }];
        case 'design':
          return [
            { position: [-cornerX, 0.02, frontZ], rotation: 0.2 },
            { position: [cornerX, 0.02, frontZ], rotation: -0.2 },
          ];
        case 'energy':
          return [
            { position: [-cornerX, 0.02, frontZ], rotation: 0.15 },
            { position: [cornerX, 0.02, frontZ], rotation: -0.15 },
          ];
        default:
          return [];
      }
    }, [theme, vw, vd]);

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
        {/* Architectural Landscaping Decorator (Legacy V26 Park Planter Trees only — disabled in V27 Grand Expo Hall) */}
        {showParkPlanters && <ExteriorAssets id="booth-planter" placements={boothDecorPlacements} />}
        {/* ================================================================
            1. ROOFLESS BLENDER FRAME + ORIGINAL EXHIBITION FLOOR
               (For V2 booths, passes isV2={true} to load bespoke V2 GLBs)
           ================================================================ */}
        <RooflessBoothShell
          theme={theme}
          fallback={exteriorShell}
          isV2={isBoothV2}
          worldVersion={worldVersion}
        />

        {/* Active Selection Glow Trim & Interactive Entrance Beacon */}
        {(!isBoothV4 || active) && (
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[vw + 1.38, 0.05, vd + 1.18]} />
            <meshBasicMaterial
              color={booth.color}
              transparent
              opacity={active ? 0.92 : 0.72}
            />
          </mesh>
        )}

        {/* Inner Showroom Rug / Zone Mat (Disabled for V2 because V2 has its own composite deck) */}
        {!isBoothV2 && (
          <mesh
            position={[0, 0.325, 0.08]}
            receiveShadow
            material={
              theme === 'living' || theme === 'coffee'
                ? CREAM_WALL_MAT
                : CARPET_MAT
            }
          >
            <boxGeometry args={[vw - 0.56, 0.015, vd - 0.52]} />
          </mesh>
        )}

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
               KHU A) SINGLE UNIFIED BRAND HEADER AT TOP + CALM REAR BACKDROP WALL
               KHU B) MAIN PRODUCT DISPLAY PODIUM (slot_01, slot_02 HERO CENTER STAGE)
               KHU C) SYMMETRIC LEFT & RIGHT 2-TIER SECONDARY SHELVES (slot_03..06)
           ================================================================ */}

        {/* Rear Architectural Showroom Backdrop Wall (Omitted for V27.4 so bespoke Blender gallery walls & niches shine!) */}
        {isBoothV274 ? null : isBoothV2 ? (
          /* For V2/V3/V4/V27.3 booths, the solid outer casing & frame are in the GLB at z = -1.95m.
             The dynamic backdrop canvas plane is placed facing +Z (front) at z = -1.86m (well in front of the GLB frame) */
          <group position={[0, 1.82, 0]}>
            <mesh position={[0, 0, -1.86]} geometry={BACKDROP_CANVAS_GEOM}>
              <meshBasicMaterial map={backdropTexture} toneMapped={false} />
            </mesh>
          </group>
        ) : (
          <group position={[0, 1.82, -vd / 2 + 0.18]}>
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
        )}

        {/* KHU B — Main Product Display Podium (Centered at x = 0, z = 0.92; low-profile top surface at y = 0.56)
            Disabled for V2 because V2 has its own bespoke PBR hero counter! */}
        {!isBoothV2 && (
          <group position={[0, 0, 0.92]}>
            {/* Recessed Plinth Kickplate at y = 0.04 */}
            <mesh
              position={[0, 0.04, 0]}
              geometry={COUNTER_PLINTH_BASE_GEOM}
              material={SLATE_DARK_MAT}
            />
            <mesh
              position={[0, 0.41, 0]}
              castShadow
              receiveShadow
              geometry={EXPO_COUNTER_BODY_GEOM}
              material={shelfTopMat}
            />
            <mesh
              position={[0, 0.535, 0]}
              castShadow
              receiveShadow
              geometry={EXPO_COUNTER_TOP_GEOM}
              material={shelfBodyMat}
            />
            {/* Metallic Top Edge Perimeter Trim */}
            <mesh
              position={[0, 0.555, 0]}
              geometry={COUNTER_TOP_TRIM_GEOM}
              material={BRASS_ACCENT_MAT}
            />
            <mesh
              position={[0, 0.505, 0]}
              geometry={EXPO_COUNTER_LED_STRIP_GEOM}
              material={brandBasicMat}
            />
            <mesh
              position={[0, 0.41, 0.43]}
              geometry={EXPO_COUNTER_FRONT_PANEL_GEOM}
              material={brandStandardMat}
            />
          </group>
        )}

        {/* KHU C1 & C2 — Symmetric 2-Tier Secondary Shelves
            Disabled for V2 because V2 has its own bespoke PBR display shelves! */}
        {!isBoothV2 && (
          <>
            {/* KHU C1 — Left Symmetric 2-Tier Secondary Product Shelf (slot_03 Upper, slot_04 Lower) */}
            <group>
              {/* Upper Tier Structure (Centered at [-2.44, y, 0.68], top surface at y = 1.72) */}
              <group position={[-2.44, 0, 0.68]} rotation={[0, 0.2, 0]}>
                <mesh
                  position={[0, 0.98, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_RACK_PILLAR_GEOM}
                  material={shelfBodyMat}
                />
                <mesh
                  position={[0, 1.69, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_SHELF_BOARD_GEOM}
                  material={shelfTopMat}
                />
                <mesh
                  position={[0, 1.66, 0]}
                  geometry={STEPPED_SHELF_TRIM_GEOM}
                  material={brandBasicMat}
                />
                <mesh
                  position={[0, 2.3, -0.35]}
                  geometry={STEPPED_RACK_BACKBOARD_GEOM}
                  material={rackBackboardMat}
                />
                {/* Structural Stand-Off Struts */}
                {[-0.52, 0.52].map((sx, idx) => (
                  <mesh
                    key={`lstrut-${idx}`}
                    position={[sx, 0.62, 0.18]}
                    geometry={SHELF_STRUT_ROD_GEOM}
                    material={CHROME_PILLAR_MAT}
                  />
                ))}
              </group>

              {/* Lower Tier Structure (Centered at [-2.44, y, 1.12], top surface at y = 0.42) */}
              <group position={[-2.44, 0, 1.12]} rotation={[0, 0.2, 0]}>
                <mesh
                  position={[0, 0.32, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_RACK_LOWER_BASE_GEOM}
                  material={shelfBodyMat}
                />
                <mesh
                  position={[0, 0.39, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_SHELF_BOARD_GEOM}
                  material={shelfTopMat}
                />
                <mesh
                  position={[0, 0.365, 0]}
                  geometry={STEPPED_SHELF_TRIM_GEOM}
                  material={brandBasicMat}
                />
                {/* Chrome Corner Reinforcement Brackets */}
                {[-0.58, 0.58].map((bx, idx) => (
                  <mesh
                    key={`lbracket-${idx}`}
                    position={[bx, 0.38, 0.32]}
                    geometry={SHELF_CORNER_BRACKET_GEOM}
                    material={CHROME_PILLAR_MAT}
                  />
                ))}
              </group>
            </group>

            {/* KHU C2 — Right Symmetric 2-Tier Secondary Product Shelf (slot_05 Upper, slot_06 Lower) */}
            <group>
              {/* Upper Tier Structure (Centered at [2.44, y, 0.68], top surface at y = 1.72) */}
              <group position={[2.44, 0, 0.68]} rotation={[0, -0.2, 0]}>
                <mesh
                  position={[0, 0.98, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_RACK_PILLAR_GEOM}
                  material={shelfBodyMat}
                />
                <mesh
                  position={[0, 1.69, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_SHELF_BOARD_GEOM}
                  material={shelfTopMat}
                />
                <mesh
                  position={[0, 1.66, 0]}
                  geometry={STEPPED_SHELF_TRIM_GEOM}
                  material={brandBasicMat}
                />
                <mesh
                  position={[0, 2.3, -0.35]}
                  geometry={STEPPED_RACK_BACKBOARD_GEOM}
                  material={rackBackboardMat}
                />
                {/* Structural Stand-Off Struts */}
                {[-0.52, 0.52].map((sx, idx) => (
                  <mesh
                    key={`rstrut-${idx}`}
                    position={[sx, 0.62, 0.18]}
                    geometry={SHELF_STRUT_ROD_GEOM}
                    material={CHROME_PILLAR_MAT}
                  />
                ))}
              </group>

              {/* Lower Tier Structure (Centered at [2.44, y, 1.12], top surface at y = 0.42) */}
              <group position={[2.44, 0, 1.12]} rotation={[0, -0.2, 0]}>
                <mesh
                  position={[0, 0.32, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_RACK_LOWER_BASE_GEOM}
                  material={shelfBodyMat}
                />
                <mesh
                  position={[0, 0.39, 0]}
                  castShadow
                  receiveShadow
                  geometry={STEPPED_SHELF_BOARD_GEOM}
                  material={shelfTopMat}
                />
                <mesh
                  position={[0, 0.365, 0]}
                  geometry={STEPPED_SHELF_TRIM_GEOM}
                  material={brandBasicMat}
                />
                {/* Chrome Corner Reinforcement Brackets */}
                {[-0.58, 0.58].map((bx, idx) => (
                  <mesh
                    key={`rbracket-${idx}`}
                    position={[bx, 0.38, 0.32]}
                    geometry={SHELF_CORNER_BRACKET_GEOM}
                    material={CHROME_PILLAR_MAT}
                  />
                ))}
              </group>
            </group>
          </>
        )}

        {/* ================================================================
            3. UNIVERSAL PRODUCT DISPLAYS:
               - V27.4: All 6 slots mapped onto bespoke per-booth architectural furniture with gallery-grade displays
               - V27.3 / V27.1: Bespoke per-booth In-Space Pedestal/Counter/Wall Showcase
               - V27.0 / V26.1: Flush Backdrop Display Bays + Overflow Secondary Shelves
           ================================================================ */}
        {isBoothV274 ? (
          resolvedSlots
            .filter((sv) => Boolean(sv.product))
            .map((slotView, idx) => {
              const specs = V27_4_PRODUCT_DISPLAY_LAYOUTS[theme];
              const spec = specs[idx % specs.length];
              return (
                <SlotProductDisplay
                  key={`v274-slot-${slotView.slot.slotId}`}
                  slotView={slotView}
                  accentColor={booth.color}
                  isSelected={Boolean(
                    slotView.product &&
                      (selectedProductId === slotView.product.id ||
                        npcHighlightedProductId === slotView.product.id)
                  )}
                  brandMat={brandFlatMat}
                  onSelectProduct={onSelectProduct}
                  placementMode="in-space"
                  inSpaceTransform={spec}
                />
              );
            })
        ) : (
          <>
            {leftBackdropSlot && (() => {
              const v271Spec =
                worldVersion === 'v27' && isBoothV4
                  ? V27_1_IN_SPACE_SHOWCASE_LAYOUTS[theme].primary
                  : null;
              return (
                <SlotProductDisplay
                  key={`backdrop-left-${leftBackdropSlot.slot.slotId}`}
                  slotView={leftBackdropSlot}
                  accentColor={booth.color}
                  isSelected={Boolean(
                    leftBackdropSlot.product &&
                      (selectedProductId === leftBackdropSlot.product.id ||
                        npcHighlightedProductId === leftBackdropSlot.product.id)
                  )}
                  brandMat={brandFlatMat}
                  onSelectProduct={onSelectProduct}
                  placementMode={v271Spec ? v271Spec.mode : 'backdrop'}
                  backdropLocalPos={v271Spec?.mode === 'backdrop' ? v271Spec.position : leftBayPos}
                  inSpaceTransform={v271Spec?.mode === 'in-space' ? v271Spec : undefined}
                />
              );
            })()}

            {rightBackdropSlot && (() => {
              const v271Spec =
                worldVersion === 'v27' && isBoothV4
                  ? V27_1_IN_SPACE_SHOWCASE_LAYOUTS[theme].secondary
                  : null;
              return (
                <SlotProductDisplay
                  key={`backdrop-right-${rightBackdropSlot.slot.slotId}`}
                  slotView={rightBackdropSlot}
                  accentColor={booth.color}
                  isSelected={Boolean(
                    rightBackdropSlot.product &&
                      (selectedProductId === rightBackdropSlot.product.id ||
                        npcHighlightedProductId === rightBackdropSlot.product.id)
                  )}
                  brandMat={brandFlatMat}
                  onSelectProduct={onSelectProduct}
                  placementMode={v271Spec ? v271Spec.mode : 'backdrop'}
                  backdropLocalPos={v271Spec?.mode === 'backdrop' ? v271Spec.position : rightBayPos}
                  inSpaceTransform={v271Spec?.mode === 'in-space' ? v271Spec : undefined}
                />
              );
            })()}

            {remainingShelfSlots.map((slotView) => (
              <SlotProductDisplay
                key={slotView.slot.slotId}
                slotView={slotView}
                accentColor={booth.color}
                isSelected={Boolean(
                  slotView.product &&
                    (selectedProductId === slotView.product.id ||
                      npcHighlightedProductId === slotView.product.id)
                )}
                brandMat={brandFlatMat}
                onSelectProduct={onSelectProduct}
                placementMode="shelf"
              />
            ))}
          </>
        )}

        {/* ================================================================
            3B. VIETNAMESE FEMALE 3D SALES ASSISTANT NPC BESIDE BOOTH ENTRANCE
           ================================================================ */}
        <SalesAssistantNpc
          booth={booth}
          isActiveSession={isActiveNpcSession}
          activeAnimation={activeNpcAnimation}
          onActivate={onActivateNpc || onSelect}
          visible={visible}
        />

        {/* ================================================================
            4. KHU A — SINGLE UNIFIED BRAND HEADER & OUTWARD-FRAMED PILLARS BY THEME
               (For V2 booths, heavy framing, brackets, visor hood and theme structures are in the GLB.
                The dynamic canvas plane is placed directly on the front face at z = 3.60m, y = 3.38m)
           ================================================================ */}
        {isBoothV2 ? (
          isBoothV274 ? (() => {
            const signCfg = V27_4_SIGNAGE_CONFIGS[theme];
            return (
              <group position={[0, 0, 0]}>
                <mesh position={[signCfg.position[0], signCfg.position[1], signCfg.position[2]]}>
                  <planeGeometry args={[signCfg.width, signCfg.height]} />
                  <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                </mesh>
                <mesh
                  position={[signCfg.backPosition[0], signCfg.backPosition[1], signCfg.backPosition[2]]}
                  rotation={[0, Math.PI, 0]}
                >
                  <planeGeometry args={[signCfg.width, signCfg.height]} />
                  <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                </mesh>
              </group>
            );
          })() : isBoothV4 ? (
            <group position={[0, 0, 0]}>
              <mesh position={[0, 3.43, 2.27]}>
                <planeGeometry args={worldVersion === 'v27' ? [5.28, 0.46] : [5.76, 0.62]} />
                <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
              </mesh>
              <mesh position={[0, 3.43, 1.84]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={worldVersion === 'v27' ? [5.28, 0.46] : [5.76, 0.62]} />
                <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
              </mesh>
            </group>
          ) : (
            <group position={[0, 0, 0]}>
              <mesh position={[0, 3.38, 3.60]}>
                <planeGeometry args={[vw + 0.36, 0.68]} />
                <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
              </mesh>
              <mesh position={[0, 3.38, 3.36]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[vw + 0.36, 0.68]} />
                <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
              </mesh>
            </group>
          )
        ) : (
          <>
            {theme === 'tech' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={DARK_NAVY_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Visor Cornice & Side Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={brandStandardMat} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`tech-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={DARK_NAVY_MAT} />
                  ))}
                  <mesh position={[0, -0.26, vd / 2 + 0.44]} material={CYAN_GLOW_MAT}>
                    <boxGeometry args={[vw + 0.6, 0.06, 0.38]} />
                  </mesh>
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>

                <group position={[vw / 2 + 0.28, 0.18, vd / 2 - 0.22]}>
                  <mesh position={[0, 0.08, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
                  <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
                  <mesh position={[0, WALL_HEIGHT * 0.65, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
                </group>
                <group position={[-vw / 2 - 0.48, 0.18, vd / 2 - 0.2]}>
                  <mesh position={[0, 0.04, 0]} geometry={TOTEM_BASE_GEOM} material={DARK_NAVY_MAT} />
                  <mesh position={[0, 0.98, 0]} geometry={TOTEM_BODY_GEOM} material={DARK_NAVY_MAT} />
                  <mesh position={[0, 1.06, 0.085]} geometry={TOTEM_SCREEN_GEOM} material={CYAN_GLOW_MAT} />
                </group>
              </group>
            )}

            {theme === 'living' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={WARM_OAK_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Timber Cornice & Side Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={WARM_OAK_MAT} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`living-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={WARM_OAK_MAT} />
                  ))}
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>

                {[-vw / 2 - 0.28, vw / 2 + 0.28].map((px, idx) => (
                  <group key={`oak-pil-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                    <mesh position={[0, 0.08, 0]} geometry={TRUSS_BASE_GEOM} material={WARM_OAK_MAT} />
                    <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={WARM_OAK_MAT} />
                  </group>
                ))}
              </group>
            )}

            {theme === 'coffee' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={ESPRESSO_WOOD_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Copper Cornice & Side Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={COPPER_CRAFT_MAT} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`coffee-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={ESPRESSO_WOOD_MAT} />
                  ))}
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>

                {[-vw / 2 - 0.28, vw / 2 + 0.28].map((px, idx) => (
                  <group key={`cafe-col-${idx}`} position={[px, 0.18, vd / 2 - 0.18]}>
                    <mesh position={[0, 0.08, 0]} geometry={TRUSS_BASE_GEOM} material={ESPRESSO_WOOD_MAT} />
                    <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={SQUARE_PILLAR_GEOM} material={ESPRESSO_WOOD_MAT} />
                  </group>
                ))}
              </group>
            )}

            {theme === 'robotics' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={SLATE_DARK_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Dark Slate Cornice & Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={SLATE_DARK_MAT} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`rob-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={DARK_NAVY_MAT} />
                  ))}
                  <mesh position={[0, -0.26, vd / 2 + 0.44]} material={GOLD_BASIC_MAT}>
                    <boxGeometry args={[vw + 0.6, 0.06, 0.38]} />
                  </mesh>
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>

                {[-vw / 2 - 0.28, vw / 2 + 0.28].map((px, idx) => (
                  <group key={`rob-truss-${idx}`} position={[px, 0.18, vd / 2 - 0.2]}>
                    <mesh position={[0, 0.09, 0]} geometry={TRUSS_BASE_GEOM} material={DARK_NAVY_MAT} />
                    <mesh position={[0, WALL_HEIGHT / 2, 0]} geometry={TRUSS_PILLAR_GEOM} material={CHROME_PILLAR_MAT} />
                    <mesh position={[0, WALL_HEIGHT * 0.4, 0]} geometry={TRUSS_RING_GEOM} material={GOLD_BASIC_MAT} />
                    <mesh position={[0, WALL_HEIGHT * 0.78, 0]} geometry={TRUSS_RING_GEOM} material={CYAN_GLOW_MAT} />
                    <mesh position={[0, WALL_HEIGHT * 0.95, 0]} geometry={TRUSS_GUSSET_GEOM} material={SLATE_DARK_MAT} />
                  </group>
                ))}
              </group>
            )}

            {theme === 'design' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={VIOLET_ART_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Magenta Cornice & Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={MAGENTA_ART_MAT} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`design-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={VIOLET_ART_MAT} />
                  ))}
                  <mesh position={[0, -0.26, vd / 2 + 0.44]} material={MAGENTA_ART_MAT}>
                    <boxGeometry args={[vw + 0.6, 0.07, 0.38]} />
                  </mesh>
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>
              </group>
            )}

            {theme === 'energy' && (
              <group>
                <group position={[0, WALL_HEIGHT + 0.58, 0.72]}>
                  <mesh position={[0, -0.65, vd / 2 + 0.42]} castShadow material={DARK_NAVY_MAT}>
                    <boxGeometry args={[vw + 0.56, 0.74, 0.34]} />
                  </mesh>
                  {/* Top Architectural Emerald Cornice & Brackets */}
                  <mesh position={[0, -0.25, vd / 2 + 0.46]} geometry={SIGN_HOOD_VISOR_GEOM} scale={[vw + 0.66, 1, 1]} material={EMERALD_GLOW_MAT} />
                  {[-vw / 2 - 0.24, vw / 2 + 0.24].map((bx, idx) => (
                    <mesh key={`energy-bracket-${idx}`} position={[bx, -0.65, vd / 2 + 0.38]} geometry={SIGN_BRACKET_GEOM} material={DARK_NAVY_MAT} />
                  ))}
                  <mesh position={[0, -0.26, vd / 2 + 0.44]} material={EMERALD_GLOW_MAT}>
                    <boxGeometry args={[vw + 0.6, 0.07, 0.38]} />
                  </mesh>
                  <mesh position={[0, -0.65, vd / 2 + 0.6]}>
                    <planeGeometry args={[vw + 0.36, 0.68]} />
                    <meshBasicMaterial map={currentSignTexture} transparent toneMapped={false} />
                  </mesh>
                </group>

                {[-vw / 2 - 0.28, vw / 2 + 0.28].map((px, idx) => (
                  <group key={`eco-col-${idx}`} position={[px, 0.18, vd / 2 - 0.2]}>
                    <mesh position={[0, 0.08, 0]} geometry={TRUSS_BASE_GEOM} material={WHITE_GLOSS_MAT} />
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
          </>
        )}
      </group>
    );
  }
);
