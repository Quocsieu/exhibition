import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOOTHS,
  WORLD_BOUNDS,
  CENTRAL_SPAWN_POINT,
  CENTRAL_SPAWN_SLOTS,
  getBoothObstacleBox,
  getBoothApproachPoint,
  isWithinWorldBounds,
  isPointWalkable,
  resolveMovementWithSlide,
  findPathAStar,
  type BoothFootprint,
} from '../types/expo';
import {
  createBoothSignTexture,
  createBoothFasciaTexture,
  createBoothPosterTexture,
  createProductTagTexture,
  createAvatarNametagTexture,
  createPlazaTileTexture,
  createPlazaTileBumpTexture,
  createPlazaMedallionTexture,
  getActiveCanvasTextureCount,
} from '../scene/sceneTextures';
import {
  GLB_ASSET_PATHS,
  type GlbAssetId,
  cloneCachedAsset,
  disposeCachedAssets,
  getBoothGlbAssetId,
  getCachedAssetStats,
} from '../scene/assetLoader';
import { resolveBoothTheme } from '../scene/Booth';
import { computeShopShowcaseCameraTargets } from '../scene/ExhibitionScene';
import {
  DEFAULT_PRODUCTION_BACKEND_URL,
  normalizeBackendOrigin,
} from '../config/apiConfig';

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
    const box = getBoothObstacleBox(booth);
    const frontEdgeZ = box.maxZ + 0.6;

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
    const path = findPathAStar(-3.5, 8, -3.5, 3.6, DEFAULT_BOOTHS);
    expect(path.length).toBe(1);
    expect(path[0].x).toBeCloseTo(-3.5, 1);
    expect(path[0].z).toBeCloseTo(3.6, 1);
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

  it('places Central Plaza spawn at a valid walkable central position and oriented 6 booths facing inward', () => {
    // 1. Central spawn & all multiplayer central spawn slots are walkable and near center (0, 0)
    expect(isPointWalkable(CENTRAL_SPAWN_POINT.x, CENTRAL_SPAWN_POINT.z, DEFAULT_BOOTHS)).toBe(true);
    expect(Math.hypot(CENTRAL_SPAWN_POINT.x, CENTRAL_SPAWN_POINT.z)).toBeLessThanOrEqual(4.5);

    for (const slot of CENTRAL_SPAWN_SLOTS) {
      expect(isPointWalkable(slot.x, slot.z, DEFAULT_BOOTHS)).toBe(true);
      expect(Math.hypot(slot.x, slot.z)).toBeLessThanOrEqual(4.5);
    }

    // 2. All 6 booths surround the Central Plaza (0, 0) and face inward toward (0, 0)
    expect(DEFAULT_BOOTHS).toHaveLength(6);
    const boxes = DEFAULT_BOOTHS.map(getBoothObstacleBox);

    for (let i = 0; i < DEFAULT_BOOTHS.length; i++) {
      const booth = DEFAULT_BOOTHS[i];
      const distFromCenter = Math.hypot(booth.positionX, booth.positionZ);
      expect(distFromCenter).toBeGreaterThanOrEqual(11);
      expect(distFromCenter).toBeLessThanOrEqual(17);

      // Forward vector of booth in Three.js: (sin(rotationY), cos(rotationY))
      const forwardX = Math.sin(booth.rotationY);
      const forwardZ = Math.cos(booth.rotationY);

      // Unit vector from booth toward Central Plaza origin (0, 0)
      const toCenterX = -booth.positionX / distFromCenter;
      const toCenterZ = -booth.positionZ / distFromCenter;

      const dotTowardCenter = forwardX * toCenterX + forwardZ * toCenterZ;
      expect(dotTowardCenter).toBeGreaterThan(0.999);

      // Ensure no two booths overlap
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps =
          a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('finds valid walkable paths from Central Plaza spawn (0, 3.6) to all 6 default booths', () => {
    for (const booth of DEFAULT_BOOTHS) {
      const approach = getBoothApproachPoint(booth);
      expect(isPointWalkable(approach.x, approach.z, DEFAULT_BOOTHS)).toBe(true);

      const path = findPathAStar(
        CENTRAL_SPAWN_POINT.x,
        CENTRAL_SPAWN_POINT.z,
        approach.x,
        approach.z,
        DEFAULT_BOOTHS
      );
      expect(path.length).toBeGreaterThan(0);

      const dest = path[path.length - 1];
      expect(dest.x).toBeCloseTo(approach.x, 1);
      expect(dest.z).toBeCloseTo(approach.z, 1);

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
      const approach = getBoothApproachPoint(targetBooth);
      const t0 = performance.now();
      const path = findPathAStar(
        CENTRAL_SPAWN_POINT.x,
        CENTRAL_SPAWN_POINT.z,
        approach.x,
        approach.z,
        DEFAULT_BOOTHS
      );
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
    const tex4 = createBoothPosterTexture({
      name: 'Aether Tech Lab',
      category: 'Công nghệ & Điện tử',
      tagline: 'Thiết bị phần cứng thông minh & IoT công nghiệp',
      color: '#0ea5e9',
      productCount: 4,
    });
    const tex5 = createBoothFasciaTexture({
      name: 'Aether Tech Lab',
      category: 'Công nghệ & Điện tử',
      color: '#0ea5e9',
    });
    const tex6 = createProductTagTexture({
      index: 1,
      name: 'Trạm Cảm Biến AetherSense X1',
      priceText: '6.850.000 ₫',
      color: '#0ea5e9',
      selected: true,
    });
    const tex7 = createPlazaTileTexture();
    const tex8 = createPlazaMedallionTexture();

    expect(getActiveCanvasTextureCount()).toBe(baseline + 8);

    tex1.dispose();
    tex1.dispose(); // idempotent double-dispose check
    expect(getActiveCanvasTextureCount()).toBe(baseline + 7);

    tex2.dispose();
    tex3.dispose();
    tex4.dispose();
    tex5.dispose();
    tex6.dispose();
    tex7.dispose();
    tex8.dispose();
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('resolves all 6 default booths to 6 distinct industry themes and disposes their themed textures cleanly', () => {
    const baseline = getActiveCanvasTextureCount();
    const resolvedThemes = DEFAULT_BOOTHS.map((booth) => resolveBoothTheme(booth));

    expect(resolvedThemes).toEqual([
      'tech',
      'living',
      'coffee',
      'robotics',
      'design',
      'energy',
    ]);
    expect(new Set(resolvedThemes).size).toBe(6);

    const createdTextures = DEFAULT_BOOTHS.flatMap((booth) => {
      const theme = resolveBoothTheme(booth);
      return [
        createBoothSignTexture({
          name: booth.name,
          category: booth.category,
          productCount: 3,
          color: booth.color,
          active: false,
          theme,
        }),
        createBoothFasciaTexture({
          name: booth.name,
          category: booth.category,
          color: booth.color,
          theme,
        }),
        createBoothPosterTexture({
          name: booth.name,
          category: booth.category,
          tagline: booth.description,
          color: booth.color,
          productCount: 3,
          theme,
        }),
      ];
    });

    expect(getActiveCanvasTextureCount()).toBe(baseline + 18);
    createdTextures.forEach((t) => t.dispose());
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('computes a front-facing eye-level Shop Showcase camera (not top-down) across all booth rotations and viewports', () => {
    for (const booth of DEFAULT_BOOTHS) {
      // 1. Desktop split-screen (1440x900, drawer open)
      const desktop = computeShopShowcaseCameraTargets(booth, 1440, 900, true);
      expect(desktop.cameraPosition.y).toBeGreaterThanOrEqual(2.0);
      expect(desktop.cameraPosition.y).toBeLessThanOrEqual(2.5);

      // View direction from camera to lookAt must point horizontally into the booth (-Z in local space)
      const viewDirX = desktop.lookAtTarget.x - desktop.cameraPosition.x;
      const viewDirY = desktop.lookAtTarget.y - desktop.cameraPosition.y;
      const viewDirZ = desktop.lookAtTarget.z - desktop.cameraPosition.z;
      const horizDist = Math.hypot(viewDirX, viewDirZ);
      const pitchDeg = Math.abs((Math.atan2(viewDirY, horizDist) * 180) / Math.PI);

      // Pitch is nearly horizontal (< 3 deg), never top-down (~45-60 deg)
      expect(pitchDeg).toBeLessThan(3);

      // Check alignment with booth's inward normal (-sin(rotY), -cos(rotY))
      const inwardNormalX = -Math.sin(booth.rotationY);
      const inwardNormalZ = -Math.cos(booth.rotationY);
      const dotInward =
        (viewDirX / horizDist) * inwardNormalX + (viewDirZ / horizDist) * inwardNormalZ;
      expect(dotInward).toBeCloseTo(1, 4);

      // 2. Mobile bottom-sheet (390x844, drawer open)
      const mobile = computeShopShowcaseCameraTargets(booth, 390, 844, true);
      expect(mobile.cameraPosition.y).toBeGreaterThanOrEqual(2.0);
      expect(mobile.cameraPosition.y).toBeLessThanOrEqual(2.5);
    }

    // Also verify a rotated booth (e.g. facing North / rotationY = Math.PI)
    const rotatedBooth = {
      ...DEFAULT_BOOTHS[2],
      rotationY: Math.PI,
    };
    const rotatedTargets = computeShopShowcaseCameraTargets(rotatedBooth, 1440, 900, false);
    // When rotationY = PI, local +Z points along world -Z, so camera stands at Z < booth.positionZ looking +Z
    expect(rotatedTargets.cameraPosition.z).toBeLessThan(rotatedBooth.positionZ - 8);
    expect(rotatedTargets.lookAtTarget.z).toBeGreaterThan(rotatedTargets.cameraPosition.z);
  });

  it('compiles, caches, clones, and disposes 12 distinct 3D GLB assets with shared GPU geometries', () => {
    disposeCachedAssets();
    expect(getCachedAssetStats().cachedAssetCount).toBe(0);

    const allAssetIds = Object.keys(GLB_ASSET_PATHS) as GlbAssetId[];
    expect(allAssetIds.length).toBe(12);

    // Verify all 6 booth architectural shells have distinct triangle counts (not recolored identical boxes)
    const boothTriangleSignatures = new Set<number>();
    for (const booth of DEFAULT_BOOTHS) {
      const theme = resolveBoothTheme(booth);
      const assetId = getBoothGlbAssetId(theme);
      const cloneA = cloneCachedAsset(assetId);
      const cloneB = cloneCachedAsset(assetId);

      let tris = 0;
      cloneA.traverse((obj) => {
        const mesh = obj as { isMesh?: boolean; geometry?: { index?: { count: number } | null; attributes: { position?: { count: number } } } };
        if (mesh.isMesh && mesh.geometry?.attributes.position) {
          tris += mesh.geometry.index
            ? Math.floor(mesh.geometry.index.count / 3)
            : Math.floor(mesh.geometry.attributes.position.count / 3);
        }
      });
      expect(tris).toBeGreaterThan(2500);
      boothTriangleSignatures.add(tris);

      // Verify cloneA and cloneB share the exact same underlying BufferGeometry reference
      const firstMeshA = cloneA.children.find((c) => (c as { isMesh?: boolean }).isMesh) as { geometry?: unknown } | undefined;
      const firstMeshB = cloneB.children.find((c) => (c as { isMesh?: boolean }).isMesh) as { geometry?: unknown } | undefined;
      expect(firstMeshA?.geometry).toBeDefined();
      expect(firstMeshA?.geometry).toBe(firstMeshB?.geometry);
    }
    expect(boothTriangleSignatures.size).toBe(6);

    // Load all 6 landscape/streetscape GLB assets as well
    for (const envId of [
      'env-tree-oak',
      'env-tree-blossom',
      'env-tree-pine',
      'env-street-lamp',
      'env-park-bench',
      'env-planter-urn',
    ] as GlbAssetId[]) {
      const envClone = cloneCachedAsset(envId);
      expect(envClone.children.length).toBeGreaterThanOrEqual(4);
    }

    const stats = getCachedAssetStats();
    expect(stats.cachedAssetCount).toBe(12);
    expect(stats.totalTriangles).toBeGreaterThan(40000);

    // Also verify bump texture tracking & deterministic disposal
    const bumpBaseline = getActiveCanvasTextureCount();
    const bumpTex = createPlazaTileBumpTexture();
    expect(getActiveCanvasTextureCount()).toBe(bumpBaseline + 1);
    bumpTex.dispose();
    expect(getActiveCanvasTextureCount()).toBe(bumpBaseline);

    disposeCachedAssets();
    expect(getCachedAssetStats().cachedAssetCount).toBe(0);
  });

  it('normalizes production Backend Render URLs accurately across all env formats', () => {
    expect(DEFAULT_PRODUCTION_BACKEND_URL).toBe('https://exhibition-xl20.onrender.com');
    expect(normalizeBackendOrigin('https://exhibition-xl20.onrender.com/')).toBe(
      'https://exhibition-xl20.onrender.com'
    );
    expect(normalizeBackendOrigin('https://exhibition-xl20.onrender.com/api')).toBe(
      'https://exhibition-xl20.onrender.com'
    );
    expect(normalizeBackendOrigin('exhibition-xl20.onrender.com/api/')).toBe(
      'https://exhibition-xl20.onrender.com'
    );
    expect(normalizeBackendOrigin('localhost:4000/')).toBe('http://localhost:4000');
  });
});
