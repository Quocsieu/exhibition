import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOOTHS,
  WORLD_BOUNDS,
  isWithinWorldBounds,
  isPointWalkable,
  resolveMovementWithSlide,
  findPathAStar,
  type BoothFootprint,
} from '../types/expo';
import {
  createBoothSignTexture,
  createAvatarNametagTexture,
  getActiveCanvasTextureCount,
} from '../scene/sceneTextures';

describe('DAY 1 — FE 2.5D Movement, Collision & A* Pathfinding Engine', () => {
  it('enforces world boundary limits accurately', () => {
    expect(isWithinWorldBounds(0, 10)).toBe(true);
    expect(isWithinWorldBounds(WORLD_BOUNDS.minX, 0)).toBe(false);
    expect(isWithinWorldBounds(WORLD_BOUNDS.maxX, 0)).toBe(false);
    expect(isWithinWorldBounds(0, WORLD_BOUNDS.minZ)).toBe(false);
    expect(isWithinWorldBounds(0, WORLD_BOUNDS.maxZ)).toBe(false);
  });

  it('prevents walking into the central plaza monument or booth footprints', () => {
    expect(isPointWalkable(0, 0, DEFAULT_BOOTHS)).toBe(false);
    expect(isPointWalkable(0, 6, DEFAULT_BOOTHS)).toBe(true);

    for (const booth of DEFAULT_BOOTHS) {
      expect(isPointWalkable(booth.positionX, booth.positionZ, DEFAULT_BOOTHS)).toBe(false);
    }
  });

  it('resolves movement with smooth wall-sliding along obstacle edges', () => {
    const booth = DEFAULT_BOOTHS[0];
    const frontEdgeZ = booth.positionZ + booth.depth / 2 + 0.6;

    expect(isPointWalkable(booth.positionX, frontEdgeZ, DEFAULT_BOOTHS)).toBe(true);

    const res = resolveMovementWithSlide(
      booth.positionX,
      frontEdgeZ,
      booth.positionX + 0.5,
      frontEdgeZ - 0.8,
      DEFAULT_BOOTHS
    );

    expect(res.collided).toBe(true);
    expect(res.x).toBeCloseTo(booth.positionX + 0.5, 2);
    expect(res.z).toBeCloseTo(frontEdgeZ, 2);
    expect(isPointWalkable(res.x, res.z, DEFAULT_BOOTHS)).toBe(true);
  });

  it('computes a direct straight path when line of sight is unobstructed', () => {
    const path = findPathAStar(-7.5, 16, -7.5, 6, DEFAULT_BOOTHS);
    expect(path.length).toBe(1);
    expect(path[0].x).toBeCloseTo(-7.5, 1);
    expect(path[0].z).toBeCloseTo(6, 1);
  });

  it('computes an obstacle-avoiding A* path around the central plaza monument', () => {
    const path = findPathAStar(0, 5, 0, -5, DEFAULT_BOOTHS);
    expect(path.length).toBeGreaterThanOrEqual(2);

    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(0, 1);
    expect(last.z).toBeCloseTo(-5, 1);

    for (const wp of path) {
      expect(isPointWalkable(wp.x, wp.z, DEFAULT_BOOTHS)).toBe(true);
    }
  });

  it('finds valid walkable paths from entrance (0, 17.5) to all 6 default booths', () => {
    for (const booth of DEFAULT_BOOTHS) {
      const frontZ = booth.positionZ + booth.depth / 2 + 1.4;
      const path = findPathAStar(0, 17.5, booth.positionX, frontZ, DEFAULT_BOOTHS);
      expect(path.length).toBeGreaterThan(0);

      const dest = path[path.length - 1];
      expect(dest.x).toBeCloseTo(booth.positionX, 1);
      expect(dest.z).toBeCloseTo(frontZ, 1);

      for (const wp of path) {
        expect(isPointWalkable(wp.x, wp.z, DEFAULT_BOOTHS)).toBe(true);
      }
    }
  });

  it('snaps target to nearest walkable entrance when clicking directly inside a booth', () => {
    const booth = DEFAULT_BOOTHS[1];
    const path = findPathAStar(0, 6, booth.positionX, booth.positionZ, DEFAULT_BOOTHS);
    expect(path.length).toBeGreaterThan(0);

    const destination = path[path.length - 1];
    expect(isPointWalkable(destination.x, destination.z, DEFAULT_BOOTHS)).toBe(true);
  });

  it('recovers cleanly when start point is slightly inside an obstacle boundary', () => {
    const path = findPathAStar(0, 0, 0, 8, DEFAULT_BOOTHS);
    expect(path.length).toBeGreaterThan(0);
    const destination = path[path.length - 1];
    expect(destination.x).toBeCloseTo(0, 1);
    expect(destination.z).toBeCloseTo(8, 1);
  });

  it('returns empty path cleanly when destination is completely walled off', () => {
    const walledBooths: BoothFootprint[] = [
      ...DEFAULT_BOOTHS,
      { id: 'wall-n', positionX: -18, positionZ: -20, width: 8, depth: 1.5 },
      { id: 'wall-s', positionX: -18, positionZ: -14, width: 8, depth: 1.5 },
      { id: 'wall-e', positionX: -14.5, positionZ: -17, width: 1.5, depth: 6 },
      { id: 'wall-w', positionX: -21.5, positionZ: -17, width: 1.5, depth: 6 },
    ];
    const path = findPathAStar(0, 17.5, -18, -17, walledBooths);
    expect(path).toEqual([]);
  });

  it('automatically invalidates walkability cache when booth layout changes dynamically', () => {
    // Point (-8, 0) is walkable in default layout
    expect(isPointWalkable(-8, 0, DEFAULT_BOOTHS)).toBe(true);

    const updatedBooths: BoothFootprint[] = [
      ...DEFAULT_BOOTHS,
      {
        id: 'booth-dynamic-popup',
        positionX: -8,
        positionZ: 0,
        width: 4.8,
        depth: 3.8,
      },
    ];

    // Cache must invalidate immediately and detect new booth obstacle at (-8, 0)
    expect(isPointWalkable(-8, 0, updatedBooths)).toBe(false);

    const pathAroundNewBooth = findPathAStar(-8, 5, -8, -5, updatedBooths);
    expect(pathAroundNewBooth.length).toBeGreaterThanOrEqual(2);
    for (const wp of pathAroundNewBooth) {
      expect(isPointWalkable(wp.x, wp.z, updatedBooths)).toBe(true);
    }
  });

  it('executes 100 consecutive A* searches across the plaza in < 5ms average and < 16ms P99', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const targetBooth = DEFAULT_BOOTHS[i % DEFAULT_BOOTHS.length];
      const frontZ = targetBooth.positionZ + targetBooth.depth / 2 + 1.4;
      const t0 = performance.now();
      const path = findPathAStar(0, 17.5, targetBooth.positionX, frontZ, DEFAULT_BOOTHS);
      const t1 = performance.now();
      expect(path.length).toBeGreaterThan(0);
      samples.push(t1 - t0);
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((acc, v) => acc + v, 0) / samples.length;
    const p99 = samples[Math.floor(samples.length * 0.99)];

    expect(avg).toBeLessThan(5);
    expect(p99).toBeLessThan(16);
  });

  it('tracks and disposes CanvasTexture instances deterministically without memory leaks', () => {
    const baseline = getActiveCanvasTextureCount();

    const tex1 = createBoothSignTexture({
      name: 'Aether Tech Lab',
      category: 'Công nghệ',
      productCount: 4,
      color: '#0ea5e9',
      active: false,
    });
    const tex2 = createBoothSignTexture({
      name: 'Aether Tech Lab',
      category: 'Công nghệ',
      productCount: 4,
      color: '#0ea5e9',
      active: true,
    });
    const tex3 = createAvatarNametagTexture({
      name: 'Khách #101',
      color: '#10b981',
      isSelf: true,
      activeBoothName: 'Aether Tech Lab',
    });

    expect(getActiveCanvasTextureCount()).toBe(baseline + 3);

    tex1.dispose();
    tex1.dispose(); // idempotent double-dispose check
    expect(getActiveCanvasTextureCount()).toBe(baseline + 2);

    tex2.dispose();
    tex3.dispose();
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });
});
