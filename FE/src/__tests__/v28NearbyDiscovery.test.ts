import { describe, expect, it } from 'vitest';
import { generateDynamicExhibitionLayout } from '../../../BE/src/services/v28/layoutGenerator';
import {
  buildNearbyDiscoveryIndex,
  findNearbyBooths,
  isAvatarInFrontOfBooth,
  NEARBY_ENTER_RADIUS_M,
  NEARBY_EXIT_RADIUS_M,
} from '../scene/v28/v28NearbyDiscovery';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
} from '../services/v28Api';

function makeProduct(id: string, boothId: string, name: string, price: number): V28Product {
  return {
    id,
    companyId: 'comp-1',
    boothId,
    name,
    sku: `SKU-${id}`,
    price,
    currency: 'VND',
    description: `Mô tả ${name}`,
    images: [],
    videoUrl: '',
    modelUrl: '',
    sourceUrl: '',
    contactUrl: '',
    inStock: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function create100BoothWorld(): Pick<V28ExhibitionVersionDetail, 'booths' | 'hallBounds'> {
  const layout = generateDynamicExhibitionLayout({
    targetBoothCount: 100,
    zoneCount: 10,
    boothsPerZone: 10,
  });

  const booths: V28BoothPlacementView[] = layout.placements.map((p) => {
    const num = p.slotIndex + 1;
    const boothId = `booth-${String(num).padStart(3, '0')}`;
    const hasProducts = num === 1 || num === 4 || num === 50;
    return {
      versionId: 'v-phase3-test',
      boothId,
      boothName: `Gian #${num}`,
      tagline: '',
      description: '',
      category: 'Công nghệ',
      color: '#0ea5e9',
      companyId: 'comp-1',
      companyName: `Doanh nghiệp #${num}`,
      zoneId: `zone-${p.zoneCode}`,
      zoneCode: p.zoneCode,
      zoneName: `Khu ${p.zoneCode}`,
      slotIndex: p.slotIndex,
      positionX: p.positionX,
      positionZ: p.positionZ,
      rotationY: p.rotationY,
      archetypeId: p.archetypeId,
      archetypeLabel: p.archetypeId,
      archetypeTheme: 'tech',
      glbPath: '',
      footprintWidth: p.footprintWidth,
      footprintDepth: p.footprintDepth,
      approachPoint: p.approachPoint,
      focusCameraPoint: p.focusCameraPoint,
      placementStatus: 'placed',
      slots: hasProducts
        ? [
            {
              slotId: 'slot_1',
              product: makeProduct(`prod-${num}-1`, boothId, `Sản phẩm A của Gian #${num}`, 1990000),
            },
            {
              slotId: 'slot_2',
              product: makeProduct(`prod-${num}-2`, boothId, `Sản phẩm B không giá #${num}`, 0),
            },
          ]
        : [],
      assignedSlotCount: hasProducts ? 2 : 0,
    };
  });

  return { booths, hallBounds: layout.hallBounds };
}

describe('Grand Expo V28 Phase 3 — Contextual Nearby Booth & Product Discovery', () => {
  it('1-3. Detects Booth #1, #50, and #100 accurately as top-1 when avatar stands at their approachPoints', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);

    for (const num of [1, 50, 100]) {
      const target = world.booths[num - 1];
      const results = findNearbyBooths(index, target.approachPoint);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0].booth.boothId).toBe(target.boothId);
      expect(results[0].boothNumber).toBe(num);
      expect(results[0].approachDistanceM).toBeCloseTo(0, 1);
    }
  });

  it('4. Avatar on central boulevard near Zone A/F entrance sees bordering booths without cross-back-wall leakage', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);
    // Standing on central boulevard (x = 0) at z = -131.88 (aligned with #7 and #57 approachPoints)
    const results = findNearbyBooths(index, { x: 0, z: -131.88 });
    const nums = results.map((r) => r.boothNumber);
    expect(nums).toContain(7);
    expect(nums).toContain(57);
    // Must never include Zone B booths from across the closed back wall
    expect(nums.every((n) => n <= 10 || (n >= 51 && n <= 60))).toBe(true);
  });

  it('5. Rejects opposite-row booths across U-zone courtyard and back-wall booths across inter-zone corridor', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);

    // Standing right in front of Booth #4 (North arm of Zone A): opposite Booth #8 (South arm) is 25.3m away -> excluded
    const b4 = world.booths[3];
    const b8 = world.booths[7];
    const b14 = world.booths[13]; // North arm of Zone B (back-to-back with #8)

    const nearB4 = findNearbyBooths(index, b4.approachPoint);
    expect(nearB4.map((r) => r.boothNumber)).toContain(4);
    expect(nearB4.map((r) => r.boothNumber)).not.toContain(8);

    // Standing in the inter-zone corridor BEHIND the back walls of #8 (z=-100.55) and #14 (z=-82.05)
    const behindWallPos = { x: -50.86, z: -91.3 };
    expect(isAvatarInFrontOfBooth(behindWallPos.x, behindWallPos.z, b8)).toBe(false);
    expect(isAvatarInFrontOfBooth(behindWallPos.x, behindWallPos.z, b14)).toBe(false);
    const fromCorridor = findNearbyBooths(index, behindWallPos);
    expect(fromCorridor.map((r) => r.boothNumber)).not.toContain(8);
    expect(fromCorridor.map((r) => r.boothNumber)).not.toContain(14);
  });

  it('6. U-corner avatar near #1 and #4 detects both corner booths with clear line-of-sight', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);
    // NW courtyard corner of Zone A between #1 (-55.52, -130.33) and #4 (-50.96, -131.88)
    const cornerPos = { x: -53.2, z: -131.1 };
    const results = findNearbyBooths(index, cornerPos);
    const nums = results.map((r) => r.boothNumber);
    expect(nums).toContain(1);
    expect(nums).toContain(4);
  });

  it('7. Hysteresis prevents flickering when moving across the enter/exit boundary', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);
    const b1 = world.booths[0]; // faces +X from ap.x = -55.52

    // Just outside enterRadius (19.5m east of #1.ap): NOT detected initially
    const boundaryPos = { x: b1.approachPoint.x + (NEARBY_ENTER_RADIUS_M + 1.0), z: b1.approachPoint.z };
    const fresh = findNearbyBooths(index, boundaryPos, { maxResults: 10 });
    expect(fresh.map((r) => r.booth.boothId)).not.toContain(b1.boothId);

    // If #1 was previously active, staying at 19.5m (< exitRadius 21.0m) KEEPS it active (hysteresis)
    const retained = findNearbyBooths(index, boundaryPos, {
      prevNearbyIds: new Set([b1.boothId]),
      maxResults: 10,
    });
    expect(retained.map((r) => r.booth.boothId)).toContain(b1.boothId);

    // Beyond exitRadius (22.0m): cleanly exits
    const farPos = { x: b1.approachPoint.x + (NEARBY_EXIT_RADIUS_M + 1.0), z: b1.approachPoint.z };
    const exited = findNearbyBooths(index, farPos, {
      prevNearbyIds: new Set([b1.boothId]),
      maxResults: 10,
    });
    expect(exited.map((r) => r.booth.boothId)).not.toContain(b1.boothId);
  });

  it('8-10. Excludes booths with missing/invalid approachPoint, handles empty products, and reflects updated product data strictly per booth', () => {
    const world = create100BoothWorld();
    // Corrupt #2's approachPoint (NaN) -> must be excluded cleanly
    world.booths[1] = {
      ...world.booths[1],
      approachPoint: { x: Number.NaN, z: world.booths[1].approachPoint.z },
    };

    const index = buildNearbyDiscoveryIndex(world);
    const near1 = findNearbyBooths(index, world.booths[0].approachPoint);
    expect(near1.map((r) => r.boothNumber)).not.toContain(2);
    expect(near1[0].products.length).toBe(2);
    expect(near1[0].products.every((p) => p.boothId === world.booths[0].boothId)).toBe(true);

    // Booth #100 has 0 products -> empty array (no fake data)
    const near100 = findNearbyBooths(index, world.booths[99].approachPoint);
    expect(near100[0].boothNumber).toBe(100);
    expect(near100[0].products).toEqual([]);

    // Update product data on #100 and rebuild index -> immediately reflected
    world.booths[99] = {
      ...world.booths[99],
      slots: [
        {
          slotId: 'slot_1',
          product: makeProduct('prod-100-new', world.booths[99].boothId, 'Sản phẩm mới #100', 4500000),
        },
      ],
      assignedSlotCount: 1,
    };
    const updatedIndex = buildNearbyDiscoveryIndex(world);
    const near100Updated = findNearbyBooths(updatedIndex, world.booths[99].approachPoint);
    expect(near100Updated[0].products.length).toBe(1);
    expect(near100Updated[0].products[0].product.name).toBe('Sản phẩm mới #100');
  });

  it('11-12. Pure read-only discovery never mutates booths, never marks visited, and completes < 2ms on 100 booths', () => {
    const world = create100BoothWorld();
    const index = buildNearbyDiscoveryIndex(world);
    const snapshotBefore = JSON.stringify(world.booths[0]);

    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      findNearbyBooths(index, { x: -55 + (i % 10), z: -130 + (i % 5) });
    }
    const avgMs = (performance.now() - t0) / 50;

    expect(JSON.stringify(world.booths[0])).toBe(snapshotBefore);
    expect(avgMs).toBeLessThan(2.0);
  });
});
