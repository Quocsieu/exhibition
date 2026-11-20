import * as THREE from 'three';
import type { V28ArchetypeId, V28BoothPlacementView } from '../../services/v28Api';
import type { ArchitecturalDisplayStyle } from '../sceneTextures';

export type V28SlotId = 'slot_01' | 'slot_02' | 'slot_03' | 'slot_04' | 'slot_05' | 'slot_06';

export const V28_ORDERED_SLOT_IDS: readonly V28SlotId[] = [
  'slot_01',
  'slot_02',
  'slot_03',
  'slot_04',
  'slot_05',
  'slot_06',
] as const;

export interface V28ArchetypeSlotSpec {
  slotId: V28SlotId;
  furnitureZone: 'counter' | 'podium' | 'shelf';
  furnitureSurface: string;
  /** Unscaled GLB-space local position resting flush on the physical furniture surface */
  position: readonly [number, number, number];
  /** Local Y rotation in radians so the product card faces the visitor cleanly */
  rotationY: number;
  /** Unscaled stand scale factor matched to V27.4 GLB furniture proportions */
  scale: number;
  displayStyle: ArchitecturalDisplayStyle;
}

/**
 * Exact measured 6-slot product display layouts for all 6 V27.4 GLB archetypes reused in V28.
 * Coordinates live in the unscaled GLB local space (bottom normalized to y = 0).
 * DynamicBooth3D wraps BOTH the GLB primitive AND these slots in the same `instanceScale`
 * (1.25×) group so every display stand sits 100% flush on its real physical counter, podium,
 * shelf, kiosk, or recessed wall niche with zero floating, sinking, or double-scaling.
 */
export const V28_ARCHETYPE_SLOT_LAYOUTS: Record<V28ArchetypeId, readonly V28ArchetypeSlotSpec[]> = {
  // Booth 01 — Signature Ring (booth_01_signature_ring_v27_4.glb)
  signature_ring: [
    { slotId: 'slot_01', furnitureZone: 'podium', furnitureSurface: 'Đảo trung tâm Hero (Center Island)', position: [0.0, 0.98, 0.15], rotationY: 0.0, scale: 0.72, displayStyle: 'physical-stand' },
    { slotId: 'slot_02', furnitureZone: 'podium', furnitureSurface: 'Bục tròn trái phía trước (Front-Left Round Pedestal)', position: [-1.25, 0.91, 0.85], rotationY: 0.24, scale: 0.62, displayStyle: 'tabletop-display' },
    { slotId: 'slot_03', furnitureZone: 'counter', furnitureSurface: 'Quầy trưng bày bên phải sau (Rear-Right Counter)', position: [1.15, 1.11, -0.95], rotationY: -0.22, scale: 0.64, displayStyle: 'gallery-frame' },
    { slotId: 'slot_04', furnitureZone: 'counter', furnitureSurface: 'Bàn tư vấn bên phải (Right Consultation Desk)', position: [2.02, 1.03, 0.62], rotationY: -0.52, scale: 0.56, displayStyle: 'tabletop-display' },
    { slotId: 'slot_05', furnitureZone: 'shelf', furnitureSurface: 'Kệ vòng cung sau giữa-trái (Rear Curved Arc Shelf #1)', position: [-0.45, 1.22, -1.78], rotationY: 0.16, scale: 0.58, displayStyle: 'gallery-frame' },
    { slotId: 'slot_06', furnitureZone: 'shelf', furnitureSurface: 'Kệ vòng cung sau bên trái (Rear Curved Arc Shelf #2)', position: [-1.32, 1.22, -1.42], rotationY: 0.45, scale: 0.56, displayStyle: 'gallery-frame' },
  ],
  // Booth 02 — Organic Flow (booth_02_organic_flow_v27_4.glb)
  organic_flow: [
    { slotId: 'slot_01', furnitureZone: 'podium', furnitureSurface: 'Bục điêu khắc trung tâm trái (Center-Left Pill Pedestal)', position: [-0.45, 0.96, 0.35], rotationY: 0.28, scale: 0.70, displayStyle: 'gallery-frame' },
    { slotId: 'slot_02', furnitureZone: 'podium', furnitureSurface: 'Bục trưng bày trung tâm phải (Center-Right Pedestal)', position: [0.92, 1.08, -0.65], rotationY: -0.22, scale: 0.66, displayStyle: 'gallery-frame' },
    { slotId: 'slot_03', furnitureZone: 'counter', furnitureSurface: 'Bục thấp trưng bày trái sau (Rear-Left Low Stand)', position: [-1.15, 0.82, -0.72], rotationY: 0.32, scale: 0.60, displayStyle: 'physical-stand' },
    { slotId: 'slot_04', furnitureZone: 'counter', furnitureSurface: 'Quầy oval bên trái (Left Oval Desk)', position: [-2.05, 1.00, 0.65], rotationY: 0.36, scale: 0.56, displayStyle: 'tabletop-display' },
    { slotId: 'slot_05', furnitureZone: 'shelf', furnitureSurface: 'Hốc kệ tường cong bên phải (Right S-Curve Wall Niche)', position: [1.95, 1.00, -1.25], rotationY: -0.42, scale: 0.54, displayStyle: 'wall-niche' },
    { slotId: 'slot_06', furnitureZone: 'shelf', furnitureSurface: 'Kệ tường cong phía sau (Rear S-Curve Gallery Shelf)', position: [0.15, 1.24, -1.55], rotationY: 0.0, scale: 0.60, displayStyle: 'gallery-frame' },
  ],
  // Booth 03 — Grand Portal (booth_03_grand_portal_v27_4.glb)
  grand_portal: [
    { slotId: 'slot_01', furnitureZone: 'podium', furnitureSurface: 'Đảo demo bậc thang trung tâm (Stepped Demo Island)', position: [0.55, 0.99, 0.58], rotationY: -0.16, scale: 0.70, displayStyle: 'physical-stand' },
    { slotId: 'slot_02', furnitureZone: 'counter', furnitureSurface: 'Quầy chữ L bên trái (Left L-Counter)', position: [-1.45, 1.01, 0.82], rotationY: 0.18, scale: 0.64, displayStyle: 'tabletop-display' },
    { slotId: 'slot_03', furnitureZone: 'podium', furnitureSurface: 'Kiosk kỹ thuật số bên phải (Right Digital Kiosk)', position: [1.98, 1.18, -0.38], rotationY: -0.38, scale: 0.66, displayStyle: 'digital-kiosk' },
    { slotId: 'slot_04', furnitureZone: 'counter', furnitureSurface: 'Kệ tường media trung tâm sau (Rear Center Media Wall)', position: [-0.35, 1.25, -1.78], rotationY: 0.0, scale: 0.72, displayStyle: 'shelf-screen' },
    { slotId: 'slot_05', furnitureZone: 'shelf', furnitureSurface: 'Kệ trưng bày bên trái sau (Rear-Left Blade Shelf)', position: [-2.35, 1.00, -1.48], rotationY: 0.14, scale: 0.56, displayStyle: 'shelf-screen' },
    { slotId: 'slot_06', furnitureZone: 'shelf', furnitureSurface: 'Kệ trưng bày bên phải sau (Rear-Right Blade Shelf)', position: [1.55, 1.00, -1.48], rotationY: -0.14, scale: 0.56, displayStyle: 'shelf-screen' },
  ],
  // Booth 04 — Wave Pavilion (booth_04_wave_pavilion_v27_4.glb)
  wave_pavilion: [
    { slotId: 'slot_01', furnitureZone: 'podium', furnitureSurface: 'Cụm bục trưng bày trái-giữa #1 (Left-Center Pedestal #1)', position: [-0.92, 0.98, 0.58], rotationY: 0.22, scale: 0.70, displayStyle: 'physical-stand' },
    { slotId: 'slot_02', furnitureZone: 'podium', furnitureSurface: 'Cụm bục trưng bày trung tâm #2 (Center Pedestal #2)', position: [-0.18, 1.08, -0.35], rotationY: 0.08, scale: 0.66, displayStyle: 'tabletop-display' },
    { slotId: 'slot_03', furnitureZone: 'counter', furnitureSurface: 'Quầy sóng bên phải trước (Right Wave Bar Front)', position: [1.92, 1.02, 0.42], rotationY: -0.88, scale: 0.60, displayStyle: 'tabletop-display' },
    { slotId: 'slot_04', furnitureZone: 'counter', furnitureSurface: 'Quầy sóng bên phải sau (Right Wave Bar Rear)', position: [1.92, 1.02, -0.58], rotationY: -0.88, scale: 0.60, displayStyle: 'tabletop-display' },
    { slotId: 'slot_05', furnitureZone: 'shelf', furnitureSurface: 'Bục thấp bên trái (Left Low Pedestal)', position: [-1.62, 0.78, 0.12], rotationY: 0.34, scale: 0.58, displayStyle: 'physical-stand' },
    { slotId: 'slot_06', furnitureZone: 'shelf', furnitureSurface: 'Màn hình/Kiosk góc trái sau (Rear-Left Promo Kiosk)', position: [-1.86, 1.18, -1.08], rotationY: 0.48, scale: 0.64, displayStyle: 'digital-kiosk' },
  ],
  // Booth 05 — Gallery Arch (booth_05_gallery_arch_v27_4.glb)
  gallery_arch: [
    { slotId: 'slot_01', furnitureZone: 'counter', furnitureSurface: 'Đảo trưng bày trung tâm trái (Center Island Riser Left)', position: [-0.72, 1.02, -0.05], rotationY: 0.14, scale: 0.68, displayStyle: 'gallery-frame' },
    { slotId: 'slot_02', furnitureZone: 'counter', furnitureSurface: 'Đảo trưng bày trung tâm phải (Center Island Riser Right)', position: [0.58, 0.91, -0.05], rotationY: -0.14, scale: 0.66, displayStyle: 'tabletop-display' },
    { slotId: 'slot_03', furnitureZone: 'shelf', furnitureSurface: 'Hốc vòm tường sau giữa (Rear Center Arched Niche)', position: [0.0, 1.50, -1.68], rotationY: 0.0, scale: 0.62, displayStyle: 'wall-niche' },
    { slotId: 'slot_04', furnitureZone: 'shelf', furnitureSurface: 'Hốc vòm tường sau trái (Rear Left Arched Niche)', position: [-1.92, 1.50, -1.68], rotationY: 0.12, scale: 0.60, displayStyle: 'wall-niche' },
    { slotId: 'slot_05', furnitureZone: 'podium', furnitureSurface: 'Hốc vòm tường sau phải (Rear Right Arched Niche)', position: [1.92, 1.50, -1.68], rotationY: -0.12, scale: 0.60, displayStyle: 'wall-niche' },
    { slotId: 'slot_06', furnitureZone: 'podium', furnitureSurface: 'Quầy boutique bên phải (Right Boutique Desk)', position: [1.98, 1.01, -0.68], rotationY: -0.42, scale: 0.56, displayStyle: 'tabletop-display' },
  ],
  // Booth 06 — Dynamic Frame (booth_06_dynamic_frame_v27_4.glb)
  dynamic_frame: [
    { slotId: 'slot_01', furnitureZone: 'podium', furnitureSurface: 'Bục đa diện bên trái trước (Left Twin Faceted Pod #1)', position: [-1.35, 0.99, 0.62], rotationY: 0.24, scale: 0.70, displayStyle: 'physical-stand' },
    { slotId: 'slot_02', furnitureZone: 'counter', furnitureSurface: 'Quầy nghiêng phải phía trước (Front-Right Angled Counter)', position: [1.35, 1.00, 0.78], rotationY: -0.32, scale: 0.66, displayStyle: 'tabletop-display' },
    { slotId: 'slot_03', furnitureZone: 'podium', furnitureSurface: 'Bục đa diện trung tâm sau (Center-Left Pod #2)', position: [-0.62, 1.11, -0.65], rotationY: 0.16, scale: 0.66, displayStyle: 'physical-stand' },
    { slotId: 'slot_04', furnitureZone: 'counter', furnitureSurface: 'Trụ kỹ thuật số trái sau (Rear-Left Digital Monolith)', position: [-2.12, 1.24, -0.84], rotationY: 0.42, scale: 0.64, displayStyle: 'digital-kiosk' },
    { slotId: 'slot_05', furnitureZone: 'shelf', furnitureSurface: 'Kệ nổi bên phải trước (Right Floating Shelf #1)', position: [2.52, 1.10, 0.28], rotationY: -1.48, scale: 0.54, displayStyle: 'shelf-screen' },
    { slotId: 'slot_06', furnitureZone: 'shelf', furnitureSurface: 'Kệ nổi bên phải sau (Right Floating Shelf #2)', position: [2.52, 1.10, -0.58], rotationY: -1.48, scale: 0.54, displayStyle: 'shelf-screen' },
  ],
};

export function getV28BoothInstanceScale(
  booth: Pick<V28BoothPlacementView, 'archetypeId' | 'footprintWidth'>
): number {
  const baseGlbWidth = booth.archetypeId === 'dynamic_frame' ? 6.87 : 6.72;
  return THREE.MathUtils.clamp((booth.footprintWidth || baseGlbWidth) / baseGlbWidth, 1.0, 1.5);
}

/**
 * Deterministically resolves the exact physical slot transform for a given archetype & slotId (`slot_01..slot_06`).
 * Guarantees stable slot mapping: clearing slot_01 NEVER shifts slot_02's product into slot_01's furniture position.
 */
export function getV28BoothSlotSpec(
  archetypeId: V28ArchetypeId,
  slotId: string
): V28ArchetypeSlotSpec {
  const layout = V28_ARCHETYPE_SLOT_LAYOUTS[archetypeId] || V28_ARCHETYPE_SLOT_LAYOUTS.grand_portal;
  const exact = layout.find((s) => s.slotId === slotId);
  if (exact) return exact;
  const idxMatch = /slot_0?(\d+)/i.exec(slotId);
  const idx = idxMatch ? Math.max(0, (Number(idxMatch[1]) - 1) % layout.length) : 0;
  return layout[idx];
}

/**
 * Computes exact booth-local (post-instanceScale) and world-space transforms for a product slot.
 * Used both for verification tests and geometry alignment audits.
 */
export function computeV28SlotWorldTransform(
  booth: Pick<
    V28BoothPlacementView,
    'archetypeId' | 'footprintWidth' | 'positionX' | 'positionZ' | 'rotationY'
  >,
  slotId: string
): {
  spec: V28ArchetypeSlotSpec;
  instanceScale: number;
  scaledLocalPosition: THREE.Vector3;
  worldPosition: THREE.Vector3;
  worldRotationY: number;
  effectiveStandScale: number;
} {
  const spec = getV28BoothSlotSpec(booth.archetypeId, slotId);
  const instanceScale = getV28BoothInstanceScale(booth);
  const lx = spec.position[0] * instanceScale;
  const ly = spec.position[1] * instanceScale;
  const lz = spec.position[2] * instanceScale;

  const cosR = Math.cos(booth.rotationY);
  const sinR = Math.sin(booth.rotationY);
  const worldPosition = new THREE.Vector3(
    booth.positionX + lx * cosR + lz * sinR,
    ly,
    booth.positionZ - lx * sinR + lz * cosR
  );

  return {
    spec,
    instanceScale,
    scaledLocalPosition: new THREE.Vector3(lx, ly, lz),
    worldPosition,
    worldRotationY: booth.rotationY + spec.rotationY,
    effectiveStandScale: spec.scale * instanceScale,
  };
}
