import { describe, expect, it } from 'vitest';
import {
  computeV28SlotWorldTransform,
  getV28BoothInstanceScale,
  getV28BoothSlotSpec,
  V28_ARCHETYPE_SLOT_LAYOUTS,
  V28_ORDERED_SLOT_IDS,
} from '../scene/v28/v28ProductSlotLayouts';
import type { V28ArchetypeId } from '../services/v28Api';

const ALL_ARCHETYPES: V28ArchetypeId[] = [
  'signature_ring',
  'organic_flow',
  'grand_portal',
  'wave_pavilion',
  'gallery_arch',
  'dynamic_frame',
];

describe('V28 Product Display Slot Alignment across all 6 Archetypes & Scale 1.25', () => {
  it('defines exactly 6 unique, well-spaced, furniture-surface-aligned slots for every archetype', () => {
    for (const archetypeId of ALL_ARCHETYPES) {
      const specs = V28_ARCHETYPE_SLOT_LAYOUTS[archetypeId];
      expect(specs.length).toBe(6);

      const ids = specs.map((s) => s.slotId);
      expect(ids).toEqual(V28_ORDERED_SLOT_IDS);

      // Every slot sits on a real physical furniture surface inside the unscaled GLB bounds
      for (const s of specs) {
        const [x, y, z] = s.position;
        expect(Math.abs(x)).toBeLessThanOrEqual(2.8);
        expect(y).toBeGreaterThanOrEqual(0.75); // Never sinking into floor (y = 0)
        expect(y).toBeLessThanOrEqual(1.65); // Never floating into signage/roof
        expect(z).toBeGreaterThanOrEqual(-1.95);
        expect(z).toBeLessThanOrEqual(1.2);
        expect(s.scale).toBeGreaterThanOrEqual(0.5);
        expect(s.scale).toBeLessThanOrEqual(0.8);
        expect(Math.abs(s.rotationY)).toBeLessThanOrEqual(Math.PI / 2); // Always front-facing hemisphere
        expect(s.furnitureSurface.length).toBeGreaterThan(5);
      }

      // Zero overlapping slots within the same archetype (min 3D separation >= 0.70m unscaled)
      for (let i = 0; i < specs.length; i++) {
        for (let j = i + 1; j < specs.length; j++) {
          const a = specs[i].position;
          const b = specs[j].position;
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          expect(dist).toBeGreaterThanOrEqual(0.7);
        }
      }
    }
  });

  it('propagates Phase 9 booth scale 1.25x uniformly across X, Y, Z with zero double-scaling', () => {
    for (const archetypeId of ALL_ARCHETYPES) {
      const footprintWidth = archetypeId === 'dynamic_frame' ? 6.87 * 1.25 : 6.72 * 1.25;
      const booth = {
        archetypeId,
        footprintWidth,
        positionX: 0,
        positionZ: 0,
        rotationY: 0,
      };
      const scale = getV28BoothInstanceScale(booth);
      expect(scale).toBeCloseTo(1.25, 4);

      for (const slotId of V28_ORDERED_SLOT_IDS) {
        const tf = computeV28SlotWorldTransform(booth, slotId);
        expect(tf.instanceScale).toBeCloseTo(1.25, 4);
        expect(tf.scaledLocalPosition.x).toBeCloseTo(tf.spec.position[0] * 1.25, 4);
        expect(tf.scaledLocalPosition.y).toBeCloseTo(tf.spec.position[1] * 1.25, 4);
        expect(tf.scaledLocalPosition.z).toBeCloseTo(tf.spec.position[2] * 1.25, 4);
        expect(tf.effectiveStandScale).toBeCloseTo(tf.spec.scale * 1.25, 4);
        // Never double-scaled (1.25 * 1.25 = 1.5625)
        expect(tf.scaledLocalPosition.y).toBeLessThan(tf.spec.position[1] * 1.5);
      }
    }
  });

  it('preserves exact local-to-world position & visitor-facing rotation when booth rotates 0°, ±90°, 180°', () => {
    const rotations = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
    const baseSpec = getV28BoothSlotSpec('grand_portal', 'slot_01');
    const s = 1.25;

    for (const rot of rotations) {
      const booth = {
        archetypeId: 'grand_portal' as V28ArchetypeId,
        footprintWidth: 6.72 * s,
        positionX: 12,
        positionZ: -8,
        rotationY: rot,
      };
      const tf = computeV28SlotWorldTransform(booth, 'slot_01');

      const lx = baseSpec.position[0] * s;
      const ly = baseSpec.position[1] * s;
      const lz = baseSpec.position[2] * s;
      const expectedX = 12 + lx * Math.cos(rot) + lz * Math.sin(rot);
      const expectedZ = -8 - lx * Math.sin(rot) + lz * Math.cos(rot);

      expect(tf.worldPosition.x).toBeCloseTo(expectedX, 4);
      expect(tf.worldPosition.y).toBeCloseTo(ly, 4);
      expect(tf.worldPosition.z).toBeCloseTo(expectedZ, 4);
      expect(tf.worldRotationY).toBeCloseTo(rot + baseSpec.rotationY, 5);
    }
  });

  it('keeps deterministic Slot ID -> furniture mapping stable regardless of empty/occupied siblings', () => {
    const s2a = getV28BoothSlotSpec('gallery_arch', 'slot_02');
    const s2b = getV28BoothSlotSpec('gallery_arch', 'slot_02');
    const s5 = getV28BoothSlotSpec('gallery_arch', 'slot_05');

    expect(s2a).toBe(s2b);
    expect(s2a.slotId).toBe('slot_02');
    expect(s5.slotId).toBe('slot_05');
    expect(s2a.position).not.toEqual(s5.position);
  });
});
