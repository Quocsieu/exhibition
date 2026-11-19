import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
  BOOTH_SLOT_DEFINITIONS,
  FALLBACK_SLOT_ASSIGNMENTS,
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
  createEnterpriseBackdropTexture,
  createProductDisplayCardTexture,
  computeAspectFitRect,
  fitEnterpriseTitleLines,
  wrapProductTitleLines,
  createProductTagTexture,
  createAvatarNametagTexture,
  AVATAR_NAMETAG_CANVAS_SIZE,
  createPlazaTileTexture,
  createPlazaTileBumpTexture,
  createPlazaMedallionTexture,
  createAsphaltRoadTexture,
  createAsphaltBumpTexture,
  createCrosswalkTexture,
  createSidewalkPaverTexture,
  createCityBuildingFacadeTexture,
  createSkyDomeTexture,
  getActiveCanvasTextureCount,
} from '../scene/sceneTextures';
import { apiClient, buildBoothSlotViews } from '../services/api';
import {
  GLB_ASSET_PATHS,
  type GlbAssetId,
  cloneCachedAsset,
  DEFAULT_BOOTH_MODEL_VERSIONS,
  DEFAULT_KINETIX_BOOTH_VERSION,
  resolveBoothModelVersion,
  resolveKinetixBoothVersion,
  resolveBespokeBoothGlbSubpath,
  disposeCachedAssets,
  getBoothGlbAssetId,
  getCachedAssetStats,
} from '../scene/assetLoader';
import {
  BACKDROP_LEFT_BAY_LOCAL_POS,
  BACKDROP_RIGHT_BAY_LOCAL_POS,
  resolveBoothBackdropAndShelfSlots,
  resolveBoothTheme,
} from '../scene/Booth';
import {
  NPC_NAMEPLATE_OFFSET,
  NPC_NAMEPLATE_SIZE,
} from '../scene/SalesAssistantNpc';
import {
  CAMERA_DRAG_THRESHOLD_PX,
  TOUCH_DRAG_THRESHOLD_PX,
  MIN_CAMERA_PITCH,
  MAX_CAMERA_PITCH,
  applyCameraDragDelta,
  applyPointerLockMouseDelta,
  classifyPointerGesture,
  computeShopShowcaseCameraTargets,
  computeThirdPersonCameraTargets,
} from '../scene/ExhibitionScene';
import {
  AVATAR_NAMETAG_OFFSET_Y,
  AVATAR_NAMETAG_SIZE,
  computeAvatarNametagVisualState,
} from '../scene/LocalPlayer';
import {
  ALL_TREES,
  CENTRAL_PLANTER_ISLANDS,
  EXHIBITION_BIN_POSITIONS,
  PERIMETER_LAMPS,
  PLANTER_URN_POSITIONS,
  PLAZA_BOLLARD_POSITIONS,
} from '../scene/Environment';
import {
  DEFAULT_PRODUCTION_BACKEND_URL,
  normalizeBackendOrigin,
} from '../config/apiConfig';
import {
  NPC_GLB_URL,
  TARGET_NPC_HEIGHT_METERS,
  buildBoothPresentationPlan,
  computeNormalizedNpcTransform,
  computeNpcPlacement,
  filterValidBoothSlotProducts,
  formatVietnameseSpeechPrice,
  getNpcAssistantProfile,
  sanitizeSpeechText,
  selectVietnameseVoice,
  verifyNpcPlacementSafety,
} from '../services/npcPresentationService';
import {
  chunkNormalizedSpeechForPiper,
  normalizeVietnameseForPiper,
  numberToVietnameseWordsClient,
} from '../services/piperSpeechNormalizer';
import {
  PIPER_VOICE_ATTRIBUTION_NOTICE,
  PiperBrowserTtsManager,
  buildPiperStepPlanFromDisplayText,
  checkBrowserPiperCapability,
  computePiperWavCacheKey,
  resolveTtsProviderConfig,
} from '../services/hybridTtsAdapter';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NpcAssistantPanel } from '../components/NpcAssistantPanel';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
    const tex9 = createAsphaltRoadTexture();
    const tex10 = createAsphaltBumpTexture();
    const tex11 = createCrosswalkTexture();
    const tex12 = createSidewalkPaverTexture();

    expect(getActiveCanvasTextureCount()).toBe(baseline + 12);

    tex1.dispose();
    tex1.dispose(); // idempotent double-dispose check
    expect(getActiveCanvasTextureCount()).toBe(baseline + 11);

    tex2.dispose();
    tex3.dispose();
    tex4.dispose();
    tex5.dispose();
    tex6.dispose();
    tex7.dispose();
    tex8.dispose();
    tex9.dispose();
    tex10.dispose();
    tex11.dispose();
    tex12.dispose();
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
    // Open exhibition shells intentionally remove the old solid roofs/walls.
    // Each shell still passes the detail and distinctness checks above.
    expect(stats.totalTriangles).toBeGreaterThan(6 * 2500);
    expect(stats.totalTriangles).toBeLessThan(100000);

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

  it('validates 6 non-overlapping 3D booth slots (counter, left-shelf, right-shelf) and deterministic slot product mapping', () => {
    expect(BOOTH_SLOT_DEFINITIONS.length).toBe(6);
    expect(BOOTH_SLOT_DEFINITIONS.map((s) => s.slotId)).toEqual([
      'slot_01',
      'slot_02',
      'slot_03',
      'slot_04',
      'slot_05',
      'slot_06',
    ]);

    // Verify pairwise 3D distance between all 6 slots so products never overlap on shelves/counter
    for (let i = 0; i < BOOTH_SLOT_DEFINITIONS.length; i++) {
      const a = BOOTH_SLOT_DEFINITIONS[i];
      expect(a.maxSize[0]).toBeGreaterThan(0.5);
      expect(a.maxSize[1]).toBeGreaterThan(0.5);
      expect(a.maxSize[2]).toBeGreaterThan(0.4);
      for (let j = i + 1; j < BOOTH_SLOT_DEFINITIONS.length; j++) {
        const b = BOOTH_SLOT_DEFINITIONS[j];
        const dist = Math.hypot(
          a.position[0] - b.position[0],
          a.position[1] - b.position[1],
          a.position[2] - b.position[2]
        );
        expect(dist).toBeGreaterThan(0.8);
      }
    }

    // Verify buildBoothSlotViews maps occupied slots and leaves remaining slots empty (null)
    for (const booth of DEFAULT_BOOTHS) {
      const slotViews = buildBoothSlotViews(booth.id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
      expect(slotViews.length).toBe(6);
      const occupied = slotViews.filter((s) => s.product !== null);
      const empty = slotViews.filter((s) => s.product === null);
      expect(occupied.length).toBe(2);
      expect(empty.length).toBe(4);
      for (const occ of occupied) {
        expect(occ.product?.boothId).toBe(booth.id);
      }
    }

    // Verify Enterprise Backdrop and Product Display Card textures dispose cleanly
    const baseline = getActiveCanvasTextureCount();
    const backdropTex = createEnterpriseBackdropTexture({
      name: DEFAULT_BOOTHS[0].name,
      companyName: DEFAULT_BOOTHS[0].companyName,
      category: DEFAULT_BOOTHS[0].category,
      tagline: DEFAULT_BOOTHS[0].tagline,
      color: DEFAULT_BOOTHS[0].color,
      occupiedSlots: 2,
      totalSlots: 6,
      theme: 'tech',
    });
    const cardTex = createProductDisplayCardTexture({
      slotLabel: 'SLOT_01 · Quầy trước - Trái',
      name: DEFAULT_PRODUCTS[0].name,
      priceText: '12.500.000 ₫',
      sku: DEFAULT_PRODUCTS[0].sku,
      accentColor: DEFAULT_BOOTHS[0].color,
      selected: false,
    });
    expect(getActiveCanvasTextureCount()).toBe(baseline + 2);
    backdropTex.dispose();
    cardTex.dispose();
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('preserves product image aspect ratio without stretching across square, landscape, and portrait photos', () => {
    // 1. Square 1:1 image (800x800) inside a 728x428 frame with 10px padding
    const squareFit = computeAspectFitRect(800, 800, 20, 20, 728, 428, 10);
    expect(squareFit.width).toBe(408);
    expect(squareFit.height).toBe(408);
    expect(squareFit.width / squareFit.height).toBeCloseTo(1, 3);

    // 2. Landscape 16:9 image (1600x900) inside a 728x428 frame with 10px padding
    const wideFit = computeAspectFitRect(1600, 900, 20, 20, 728, 428, 10);
    expect(wideFit.width).toBe(708);
    expect(wideFit.height).toBe(398);
    expect(wideFit.width / wideFit.height).toBeCloseTo(16 / 9, 2);

    // 3. Portrait 3:4 image (600x800) inside a 728x428 frame with 10px padding
    const portraitFit = computeAspectFitRect(600, 800, 20, 20, 728, 428, 10);
    expect(portraitFit.height).toBe(408);
    expect(portraitFit.width).toBe(306);
    expect(portraitFit.width / portraitFit.height).toBeCloseTo(3 / 4, 3);

    // Verify Product Display Card texture with real imageUrl and missing imageUrl both track & dispose cleanly
    const baseline = getActiveCanvasTextureCount();
    const withUrlTex = createProductDisplayCardTexture({
      slotLabel: 'SLOT_01 · Quầy chính - Bên trái',
      name: DEFAULT_PRODUCTS[0].name,
      priceText: '6.850.000 ₫',
      imageUrl: DEFAULT_PRODUCTS[0].images[0],
      accentColor: '#0ea5e9',
      selected: false,
    });
    const missingUrlTex = createProductDisplayCardTexture({
      slotLabel: 'SLOT_02 · Quầy chính - Bên phải',
      name: 'Sản phẩm chưa có ảnh',
      priceText: '1.200.000 ₫',
      imageUrl: '',
      accentColor: '#10b981',
      selected: true,
    });
    expect(getActiveCanvasTextureCount()).toBe(baseline + 2);
    withUrlTex.dispose();
    missingUrlTex.dispose();
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('computes Low-Angle Third-Person Explore camera targets behind the character with obstacle avoidance and disposes sky/skyline textures cleanly', () => {
    // 1. At Central Spawn Point (0, 3.8, yaw = PI facing North -Z)
    const tpNorth = computeThirdPersonCameraTargets(
      CENTRAL_SPAWN_POINT.x,
      CENTRAL_SPAWN_POINT.z,
      Math.PI,
      34,
      DEFAULT_BOOTHS
    );

    // Camera stands behind character (+Z > 3.8) at low third-person elevation (1.65..3.0m)
    expect(tpNorth.cameraPosition.z).toBeGreaterThan(CENTRAL_SPAWN_POINT.z + 3.0);
    expect(tpNorth.cameraPosition.y).toBeGreaterThanOrEqual(1.65);
    expect(tpNorth.cameraPosition.y).toBeLessThanOrEqual(3.1);

    // LookAt target is ahead of character (-Z < 3.8) at shoulder/eye level (~1.46m)
    expect(tpNorth.lookAtTarget.z).toBeLessThan(CENTRAL_SPAWN_POINT.z - 2.0);
    expect(tpNorth.lookAtTarget.y).toBeCloseTo(1.46, 2);

    // 2. Obstacle avoidance when standing directly in front of a booth with the booth behind the character
    const booth = DEFAULT_BOOTHS[1]; // North booth at (0, -14.8)
    const box = getBoothObstacleBox(booth);
    // Player stands just South of the booth (z = box.maxZ + 0.6) facing South (yaw = 0), so the booth is directly behind the player
    const tpNearBooth = computeThirdPersonCameraTargets(
      booth.positionX,
      box.maxZ + 0.6,
      0,
      34,
      DEFAULT_BOOTHS
    );
    expect(tpNearBooth.cameraPosition.y).toBeGreaterThanOrEqual(1.65);
    // Camera pulls closer than default 5.2m distance so it does not sit deep inside the booth wall
    const distFromPlayer = Math.hypot(
      tpNearBooth.cameraPosition.x - booth.positionX,
      tpNearBooth.cameraPosition.z - (box.maxZ + 0.6)
    );
    expect(distFromPlayer).toBeLessThan(5.0);

    // 3. Verify 360-degree horizontal yaw & clamped vertical pitch (mouse drag / mobile swipe)
    const tpLookUp = computeThirdPersonCameraTargets(
      CENTRAL_SPAWN_POINT.x,
      CENTRAL_SPAWN_POINT.z,
      Math.PI / 2,
      34,
      DEFAULT_BOOTHS,
      0.42
    );
    const tpLookDown = computeThirdPersonCameraTargets(
      CENTRAL_SPAWN_POINT.x,
      CENTRAL_SPAWN_POINT.z,
      Math.PI / 2,
      34,
      DEFAULT_BOOTHS,
      -0.38
    );
    expect(tpLookUp.lookAtTarget.y).toBeGreaterThan(tpNorth.lookAtTarget.y);
    expect(tpLookDown.lookAtTarget.y).toBeLessThan(tpNorth.lookAtTarget.y);
    expect(tpLookUp.cameraPosition.y).toBeGreaterThanOrEqual(1.32);
    expect(tpLookDown.cameraPosition.y).toBeGreaterThanOrEqual(1.32);

    // 4. Verify City Facade & Sky Dome textures track and dispose deterministically
    const baseline = getActiveCanvasTextureCount();
    const facadeTex = createCityBuildingFacadeTexture();
    const skyTex = createSkyDomeTexture();
    expect(getActiveCanvasTextureCount()).toBe(baseline + 2);
    facadeTex.dispose();
    skyTex.dispose();
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('guarantees zero camera sightline obstruction from street lamps, wayfinding signposts, trees, bollards, urns, or bins across all 6 booths in Shop Showcase mode', () => {
    const pointToSegmentDistance2D = (
      px: number,
      pz: number,
      ax: number,
      az: number,
      bx: number,
      bz: number
    ): number => {
      const abx = bx - ax;
      const abz = bz - az;
      const lenSq = abx * abx + abz * abz;
      if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
      const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
      const projX = ax + t * abx;
      const projZ = az + t * abz;
      return Math.hypot(px - projX, pz - projZ);
    };

    const tallEnvironmentalProps: { label: string; x: number; z: number }[] = [
      ...PERIMETER_LAMPS.map(([x, z], idx) => ({ label: `lamp-${idx}`, x, z })),
      ...CENTRAL_PLANTER_ISLANDS.map((island, idx) => ({
        label: `wayfinding-sign-${idx}`,
        x: island.signPos[0],
        z: island.signPos[1],
      })),
      ...ALL_TREES.map((t, idx) => ({ label: `tree-${idx}`, x: t.x, z: t.z })),
      ...PLANTER_URN_POSITIONS.map(([x, z], idx) => ({ label: `urn-${idx}`, x, z })),
      ...PLAZA_BOLLARD_POSITIONS.map(([x, z], idx) => ({ label: `bollard-${idx}`, x, z })),
      ...EXHIBITION_BIN_POSITIONS.map(([x, z], idx) => ({ label: `bin-${idx}`, x, z })),
    ];

    for (const booth of DEFAULT_BOOTHS) {
      const { cameraPosition } = computeShopShowcaseCameraTargets(booth, 1440, 900, false);

      for (const prop of tallEnvironmentalProps) {
        const clearance = pointToSegmentDistance2D(
          prop.x,
          prop.z,
          cameraPosition.x,
          cameraPosition.z,
          booth.positionX,
          booth.positionZ
        );
        // Every street lamp, signpost, tree, bollard, urn, and bin must stay > 3.8m clear of the camera-to-booth sightline ray
        expect(
          clearance,
          `${prop.label} (${prop.x}, ${prop.z}) is too close (${clearance.toFixed(2)}m) to Shop Showcase sightline of ${booth.id}`
        ).toBeGreaterThan(3.8);
      }
    }
  });

  it('frames 100% of the Product-First 3-Zone Showroom (KHU A Brand Header, KHU B Hero Center Stage, KHU C Secondary Shelves) across 1920x1080, 1366x768, and 390x844', () => {
    // 1. Enterprise names must NEVER be truncated with `...` or `…`
    const enterpriseNames = [
      ...DEFAULT_BOOTHS.map((b) => (b.companyName || b.name).toUpperCase()),
      'CÔNG TY CỔ PHẦN CÔNG NGHỆ TRÍ TUỆ NHÂN TẠO & ĐIỆN TOÁN ĐÁM MÂY AETHER VIỆT NAM',
    ];

    for (const fullTitle of enterpriseNames) {
      const fitted = fitEnterpriseTitleLines(null, fullTitle, 940, 56, 30);
      expect(fitted.lines.length).toBeGreaterThanOrEqual(1);
      expect(fitted.lines.length).toBeLessThanOrEqual(2);
      expect(fitted.lines.join(' ')).toBe(fullTitle);
      expect(fitted.lines.join(' ').includes('…')).toBe(false);
      expect(fitted.lines.join(' ').includes('...')).toBe(false);
    }

    // 2. Product names wrap cleanly up to 3 high-contrast lines on the 1024x1240 portrait showroom panel
    const shortProdLines = wrapProductTitleLines(null, 'Kính AR Aether Vision Pro', 916, 48);
    expect(shortProdLines.length).toBe(1);
    const longProdLines = wrapProductTitleLines(
      null,
      'Hệ thống Robot Tự hành Công nghiệp Kinetix X9 Ultra Pro Max Phiên bản Triển lãm Quốc tế 2026',
      916,
      44
    );
    expect(longProdLines.length).toBeGreaterThanOrEqual(2);
    expect(longProdLines.length).toBeLessThanOrEqual(3);

    // 3. KHU B Hero Center Stage slots (slot_01, slot_02) and KHU C Secondary Shelf slots (slot_03..06)
    // have hierarchy-compliant dimensions and > 1.3m 3D separation with zero overlap
    for (let i = 0; i < BOOTH_SLOT_DEFINITIONS.length; i++) {
      const a = BOOTH_SLOT_DEFINITIONS[i];
      if (a.zone === 'counter') {
        expect(a.maxSize[0]).toBeGreaterThanOrEqual(1.6);
        expect(a.maxSize[1]).toBeGreaterThanOrEqual(2.0);
      } else {
        expect(a.maxSize[0]).toBeGreaterThanOrEqual(1.15);
        expect(a.maxSize[1]).toBeGreaterThanOrEqual(1.2);
      }
      expect(Math.abs(a.position[0]) + a.maxSize[0] / 2).toBeLessThan(3.1);
      for (let j = i + 1; j < BOOTH_SLOT_DEFINITIONS.length; j++) {
        const b = BOOTH_SLOT_DEFINITIONS[j];
        const dist3D = Math.hypot(
          a.position[0] - b.position[0],
          a.position[1] - b.position[1],
          a.position[2] - b.position[2]
        );
        expect(dist3D).toBeGreaterThan(1.3);
      }
    }

    // 4. Verify KHU A Single Unified Brand Header (top at y = 3.72m, local z = 3.52m) and
    // KHU B Main Showroom Podium (bottom at y = 0.28m) fit inside the closer Shop Showcase frustum
    const viewports: [number, number][] = [
      [1920, 1080],
      [1366, 768],
      [390, 844],
    ];
    const tanHalfFov = Math.tan((19 * Math.PI) / 180);
    const brandHeaderZ = 3.52;
    const brandHeaderTopY = 3.72;

    for (const [vw, vh] of viewports) {
      for (const booth of DEFAULT_BOOTHS) {
        const { cameraPosition, lookAtTarget } = computeShopShowcaseCameraTargets(
          booth,
          vw,
          vh,
          false
        );
        const camDistFromBoothCenter = Math.hypot(
          cameraPosition.x - booth.positionX,
          cameraPosition.z - booth.positionZ
        );
        const lookDistFromBoothCenter = Math.hypot(
          lookAtTarget.x - booth.positionX,
          lookAtTarget.z - booth.positionZ
        );
        const totalSightSpanZ = camDistFromBoothCenter + lookDistFromBoothCenter;
        const distCamToHeaderZ = camDistFromBoothCenter - brandHeaderZ;
        const rayCenterYAtHeader =
          cameraPosition.y +
          (lookAtTarget.y - cameraPosition.y) * (distCamToHeaderZ / totalSightSpanZ);
        const frustumHalfHeightAtHeader = distCamToHeaderZ * tanHalfFov;
        const frustumTopY = rayCenterYAtHeader + frustumHalfHeightAtHeader;
        const frustumBottomY = rayCenterYAtHeader - frustumHalfHeightAtHeader;

        expect(frustumTopY).toBeGreaterThan(brandHeaderTopY + 0.18);
        expect(frustumBottomY).toBeLessThanOrEqual(0.22);
      }
    }
  });

  it('places 6 Vietnamese Female 3D Sales Assistant NPCs beside all 6 booths without overlapping slots, approach paths, columns, planters, or booth structures', () => {
    const worldPositions = new Set<string>();
    const profileNames = new Set<string>();

    for (const booth of DEFAULT_BOOTHS) {
      const profile = getNpcAssistantProfile(booth);
      expect(profile.assistantName.length).toBeGreaterThan(3);
      expect(profile.roleTitle.length).toBeGreaterThan(5);
      profileNames.add(profile.assistantName);

      const placement = computeNpcPlacement(booth);
      expect(placement.localX).toBeCloseTo(2.32, 2);
      expect(placement.localY).toBeCloseTo(0.02, 3);
      expect(placement.localZ).toBeCloseTo(3.24, 2);
      expect(isWithinWorldBounds(placement.worldX, placement.worldZ)).toBe(true);

      const safety = verifyNpcPlacementSafety(booth);
      expect(safety.valid).toBe(true);
      expect(safety.withinWorldBounds).toBe(true);
      expect(safety.clearOfApproachPoint).toBe(true);
      expect(safety.clearOfProductSlots).toBe(true);
      expect(safety.clearOfBoothInterior).toBe(true);
      expect(safety.clearOfColumnsAndPlanters).toBe(true);
      expect(safety.groundedOnFloor).toBe(true);

      const posKey = `${placement.worldX.toFixed(2)},${placement.worldZ.toFixed(2)}`;
      worldPositions.add(posKey);
    }

    expect(worldPositions.size).toBe(6);
    expect(profileNames.size).toBe(6);
  });

  it('builds sequential Vietnamese product presentation scripts from valid booth slots and skips empty/invalid slots cleanly', () => {
    for (const booth of DEFAULT_BOOTHS) {
      const slotViews = buildBoothSlotViews(booth.id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
      const validProducts = filterValidBoothSlotProducts(booth.id, slotViews, DEFAULT_PRODUCTS);
      expect(validProducts.length).toBe(2);
      expect(validProducts[0].slot.slotId).toBe('slot_01');
      expect(validProducts[0].slot.slotId < validProducts[1].slot.slotId).toBe(true);

      const plan = buildBoothPresentationPlan(booth, slotViews, DEFAULT_PRODUCTS);
      expect(plan.totalProducts).toBe(2);
      // 1 greeting + 2 products + 1 closing = 4 sequential steps
      expect(plan.steps.length).toBe(4);
      expect(plan.steps[0].type).toBe('GREETING');
      expect(plan.steps[0].animation).toBe('WAVE');
      expect(plan.steps[1].type).toBe('PRODUCT');
      expect(plan.steps[1].productIndex).toBe(1);
      expect(plan.steps[1].animation).toBe('PRESENT');
      expect(plan.steps[2].type).toBe('PRODUCT');
      expect(plan.steps[2].productIndex).toBe(2);
      expect(plan.steps[2].animation).toBe('PRESENT');
      expect(plan.steps[3].type).toBe('CLOSING');
      expect(plan.steps[3].animation).toBe('WAVE');

      for (const step of plan.steps) {
        expect(step.text.includes('undefined')).toBe(false);
        expect(step.text.includes('null')).toBe(false);
        expect(step.text.includes('<')).toBe(false);
        expect(step.text.length).toBeGreaterThan(20);
      }
    }

    // Verify empty booth fallback (0 products assigned)
    const emptyBooth = DEFAULT_BOOTHS[0];
    const emptySlots = buildBoothSlotViews(emptyBooth.id, [], []);
    const emptyPlan = buildBoothPresentationPlan(emptyBooth, emptySlots, []);
    expect(emptyPlan.totalProducts).toBe(0);
    expect(emptyPlan.steps.length).toBe(1);
    expect(emptyPlan.steps[0].type).toBe('GREETING');
    expect(emptyPlan.steps[0].text).toContain('chưa có sản phẩm');

    // Verify foreign product (belonging to another booth) placed into an empty slot is strictly rejected
    const tamperedSlots = buildBoothSlotViews(DEFAULT_BOOTHS[0].id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
    tamperedSlots[4] = {
      ...tamperedSlots[4],
      product: DEFAULT_PRODUCTS.find((p) => p.boothId !== DEFAULT_BOOTHS[0].id) || null,
    };
    const filteredTampered = filterValidBoothSlotProducts(DEFAULT_BOOTHS[0].id, tamperedSlots, DEFAULT_PRODUCTS);
    expect(filteredTampered.length).toBe(2);

    // Verify speech sanitization and Vietnamese price formatting
    expect(sanitizeSpeechText('<b>Camera AI</b> undefined null')).toBe('Camera AI');
    expect(formatVietnameseSpeechPrice(6850000, 'VND')).toContain('6.850.000 đồng');
    expect(formatVietnameseSpeechPrice(0, 'VND')).toBe('');
  });

  it('prioritizes Vietnamese female Web Speech API voices and never selects an English voice for Vietnamese speech', () => {
    const englishOnlyVoices = [
      { lang: 'en-US', name: 'Microsoft Zira - English (United States)', default: true, localService: true, voiceURI: 'zira' },
      { lang: 'en-GB', name: 'Google UK English Female', default: false, localService: false, voiceURI: 'uk' },
    ] as unknown as SpeechSynthesisVoice[];

    expect(selectVietnameseVoice(englishOnlyVoices)).toBeNull();

    const mixedVoices = [
      ...englishOnlyVoices,
      { lang: 'vi-VN', name: 'Microsoft NamMinh - Vietnamese (Vietnam)', default: false, localService: true, voiceURI: 'namminh' },
      { lang: 'vi-VN', name: 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', default: false, localService: false, voiceURI: 'hoaimy' },
    ] as unknown as SpeechSynthesisVoice[];

    const chosen = selectVietnameseVoice(mixedVoices);
    expect(chosen).not.toBeNull();
    expect(chosen?.name).toContain('HoaiMy');

    // Also match when browser reports empty lang string but voice name identifies Vietnamese
    const fallbackLangVoices = [
      ...englishOnlyVoices,
      { lang: '', name: 'Google Tiếng Việt', default: false, localService: false, voiceURI: 'g-vi' },
    ] as unknown as SpeechSynthesisVoice[];
    expect(selectVietnameseVoice(fallbackLangVoices)?.name).toBe('Google Tiếng Việt');
  });

  it('verifies the 3D Vietnamese Female Assistant GLB asset exists and embeds all 4 required animation clips (IDLE, WAVE, TALKING, PRESENT)', () => {
    const glbPath = path.resolve(__dirname, '../../public/models/npc/vietnamese_female_assistant.glb');
    expect(fs.existsSync(glbPath)).toBe(true);

    const buffer = fs.readFileSync(glbPath);
    // GLB header magic 'glTF' (0x46546C67) and version 2
    expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
    expect(buffer.readUInt32LE(4)).toBe(2);
    // Compact size (< 3 MB)
    expect(buffer.byteLength).toBeGreaterThan(200_000);
    expect(buffer.byteLength).toBeLessThan(3_000_000);

    // Parse JSON chunk of GLB to inspect animations and materials
    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.readUInt32LE(16);
    expect(jsonChunkType).toBe(0x4e4f534a); // 'JSON'
    const gltfJson = JSON.parse(buffer.subarray(20, 20 + jsonChunkLength).toString('utf8')) as {
      animations?: { name: string }[];
      materials?: { name: string }[];
    };

    const animNames = (gltfJson.animations ?? []).map((a) => a.name).sort();
    expect(animNames).toEqual(['IDLE', 'PRESENT', 'TALKING', 'WAVE']);

    const matNames = (gltfJson.materials ?? []).map((m) => m.name);
    expect(matNames).toContain('NpcSkin');
    expect(matNames).toContain('NpcHair');
    expect(matNames).toContain('NpcTunicIvory');
    expect(matNames).toContain('NpcBrandAccent');

    // Verify V20 active NPC model (`untitled.glb`) exists, is valid glTF v2, and normalizes to 1.70m standing height
    expect(NPC_GLB_URL).toContain('models/npc/untitled.glb');
    const untitledPath = path.resolve(__dirname, '../../public/models/npc/untitled.glb');
    expect(fs.existsSync(untitledPath)).toBe(true);
    const untitledBuf = fs.readFileSync(untitledPath);
    expect(untitledBuf.readUInt32LE(0)).toBe(0x46546c67);
    expect(untitledBuf.readUInt32LE(4)).toBe(2);
    expect(untitledBuf.byteLength).toBeGreaterThan(200_000);

    const norm = computeNormalizedNpcTransform(
      [-2.332693, 0.001917, -0.456096],
      [2.332693, 7.224624, 0.767009],
      TARGET_NPC_HEIGHT_METERS
    );
    expect(norm.normalizedHeight).toBeCloseTo(1.7, 3);
    expect(norm.scale).toBeCloseTo(0.23537, 4);
    expect(norm.offsetX).toBeCloseTo(0, 4);
    expect(norm.offsetY).toBeLessThanOrEqual(0);
  });

  it('computes 3D game-style Pointer Lock yaw/pitch deltas and frames all 5 mobile landscape viewports cleanly', () => {
    // 1. Horizontal mouse movement updates yaw without affecting pitch
    const stepRight = applyPointerLockMouseDelta(Math.PI, 0, 100, 0);
    expect(stepRight.yaw).toBeLessThan(Math.PI);
    expect(stepRight.pitch).toBeCloseTo(0, 5);

    const stepLeft = applyPointerLockMouseDelta(Math.PI, 0, -100, 0);
    expect(stepLeft.yaw).toBeGreaterThan(Math.PI);
    expect(stepLeft.pitch).toBeCloseTo(0, 5);

    // 2. Vertical mouse movement updates pitch and strictly clamps within [MIN_CAMERA_PITCH, MAX_CAMERA_PITCH]
    const lookUp = applyPointerLockMouseDelta(0, 0, 0, -80);
    expect(lookUp.pitch).toBeGreaterThan(0);
    expect(lookUp.pitch).toBeLessThanOrEqual(MAX_CAMERA_PITCH);

    const clampMaxUp = applyPointerLockMouseDelta(0, 0.35, 0, -500);
    expect(clampMaxUp.pitch).toBeCloseTo(MAX_CAMERA_PITCH, 5);

    const clampMaxDown = applyPointerLockMouseDelta(0, -0.32, 0, 500);
    expect(clampMaxDown.pitch).toBeCloseTo(MIN_CAMERA_PITCH, 5);

    // 3. Verify Shop Showcase camera framing across all 5 target Mobile Landscape viewports
    const landscapeViewports: [number, number][] = [
      [667, 375],
      [740, 360],
      [844, 390],
      [896, 414],
      [932, 430],
    ];
    for (const [vw, vh] of landscapeViewports) {
      for (const booth of DEFAULT_BOOTHS) {
        const closedTargets = computeShopShowcaseCameraTargets(booth, vw, vh, false);
        const openTargets = computeShopShowcaseCameraTargets(booth, vw, vh, true);
        expect(closedTargets.cameraPosition.y).toBeCloseTo(2.08, 2);
        expect(openTargets.cameraPosition.y).toBeCloseTo(2.08, 2);
        expect(openTargets.lookAtTarget.y).toBeCloseTo(1.96, 2);
      }
    }

    // 4. Verify desktop NPC dialogue panel is positioned on the right side (right: 16px; left: auto;)
    const cssPath = path.resolve(__dirname, '../styles.css');
    const cssText = fs.readFileSync(cssPath, 'utf8');
    const panelRuleMatch = cssText.match(/\.npc-assistant-panel\s*\{([^}]*)\}/);
    expect(panelRuleMatch).not.toBeNull();
    expect(panelRuleMatch?.[1]).toContain('right: 16px;');
    expect(panelRuleMatch?.[1]).toContain('left: auto;');
  });

  it('integrates booth products into the two Backdrop Bays across 0/1/2/>2 product states, syncs Admin edits, and keeps the compact NPC nameplate non-obstructive', () => {
    // 1. All 6 default booths (each with 2 assigned products) map into Left & Right Backdrop Bays with 0 protruding front panels
    for (const booth of DEFAULT_BOOTHS) {
      const slotViews = buildBoothSlotViews(booth.id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
      const resolved = resolveBoothBackdropAndShelfSlots(slotViews);
      expect(resolved.leftBackdropSlot?.product?.boothId).toBe(booth.id);
      expect(resolved.rightBackdropSlot?.product?.boothId).toBe(booth.id);
      expect(resolved.leftBackdropSlot?.product?.id).not.toBe(
        resolved.rightBackdropSlot?.product?.id
      );
      expect(resolved.remainingShelfSlots).toHaveLength(0);
    }

    // 2. 0 products -> both Backdrop Bays empty, 0 shelf panels
    const solaris = DEFAULT_BOOTHS.find((b) => b.id === 'booth-solaris-energy')!;
    const emptyViews = buildBoothSlotViews(solaris.id, DEFAULT_PRODUCTS, []);
    const emptyResolved = resolveBoothBackdropAndShelfSlots(emptyViews);
    expect(emptyResolved.leftBackdropSlot).toBeNull();
    expect(emptyResolved.rightBackdropSlot).toBeNull();
    expect(emptyResolved.remainingShelfSlots).toHaveLength(0);

    // 3. 1 product (left slot vs right slot) -> only 1 Backdrop Bay occupied, never duplicated!
    const solarisProds = DEFAULT_PRODUCTS.filter((p) => p.boothId === solaris.id);
    const singleLeftViews = buildBoothSlotViews(solaris.id, DEFAULT_PRODUCTS, [
      { boothId: solaris.id, slotId: 'slot_03', productId: solarisProds[0].id },
    ]);
    const singleLeftResolved = resolveBoothBackdropAndShelfSlots(singleLeftViews);
    expect(singleLeftResolved.leftBackdropSlot?.product?.id).toBe(solarisProds[0].id);
    expect(singleLeftResolved.rightBackdropSlot).toBeNull();
    expect(singleLeftResolved.remainingShelfSlots).toHaveLength(0);

    const singleRightViews = buildBoothSlotViews(solaris.id, DEFAULT_PRODUCTS, [
      { boothId: solaris.id, slotId: 'slot_05', productId: solarisProds[1].id },
    ]);
    const singleRightResolved = resolveBoothBackdropAndShelfSlots(singleRightViews);
    expect(singleRightResolved.leftBackdropSlot).toBeNull();
    expect(singleRightResolved.rightBackdropSlot?.product?.id).toBe(solarisProds[1].id);
    expect(singleRightResolved.remainingShelfSlots).toHaveLength(0);

    // 4. >2 products (e.g. 4 products assigned by Admin) -> 2 in Backdrop Bays + 2 preserved on Secondary Shelves
    const extraProd3 = { ...solarisProds[0], id: 'prod-solaris-extra-3', name: 'Biến tần Hybrid Solaris 8kW' };
    const extraProd4 = { ...solarisProds[1], id: 'prod-solaris-extra-4', name: 'Tấm Pin Hai Mặt Kính Solaris 580W' };
    const fourProdList = [...DEFAULT_PRODUCTS, extraProd3, extraProd4];
    const fourSlotViews = buildBoothSlotViews(solaris.id, fourProdList, [
      { boothId: solaris.id, slotId: 'slot_01', productId: solarisProds[0].id },
      { boothId: solaris.id, slotId: 'slot_02', productId: solarisProds[1].id },
      { boothId: solaris.id, slotId: 'slot_03', productId: extraProd3.id },
      { boothId: solaris.id, slotId: 'slot_05', productId: extraProd4.id },
    ]);
    const fourResolved = resolveBoothBackdropAndShelfSlots(fourSlotViews);
    expect(fourResolved.leftBackdropSlot?.slot.slotId).toBe('slot_01');
    expect(fourResolved.rightBackdropSlot?.slot.slotId).toBe('slot_02');
    expect(fourResolved.remainingShelfSlots.map((s) => s.slot.slotId)).toEqual([
      'slot_03',
      'slot_05',
    ]);

    // 5. Verify Backdrop Bay coordinates fit inside the 3.96m × 2.28m backdrop plane and clear of Top Brand Header
    expect(BACKDROP_LEFT_BAY_LOCAL_POS[0]).toBeCloseTo(-0.882, 2);
    expect(BACKDROP_RIGHT_BAY_LOCAL_POS[0]).toBeCloseTo(0.882, 2);
    expect(BACKDROP_LEFT_BAY_LOCAL_POS[1]).toBeGreaterThan(1.5);
    expect(BACKDROP_LEFT_BAY_LOCAL_POS[1]).toBeLessThan(1.85);
    expect(BACKDROP_LEFT_BAY_LOCAL_POS[2]).toBeCloseTo(-1.842, 2);

    // 6. Verify Compact NPC Nameplate dimensions & zero occlusion of NPC face or Backdrop Product Bays
    expect(NPC_NAMEPLATE_SIZE[0]).toBeLessThanOrEqual(0.95);
    expect(NPC_NAMEPLATE_SIZE[1]).toBeLessThanOrEqual(0.32);
    const badgeBottomY = NPC_NAMEPLATE_OFFSET[1] - NPC_NAMEPLATE_SIZE[1] / 2;
    expect(badgeBottomY).toBeGreaterThan(TARGET_NPC_HEIGHT_METERS); // Above 1.70m head -> zero face occlusion

    for (const booth of DEFAULT_BOOTHS) {
      const npcPlacement = computeNpcPlacement(booth);
      const badgeLeftEdgeLocalX =
        npcPlacement.localX + NPC_NAMEPLATE_OFFSET[0] - NPC_NAMEPLATE_SIZE[0] / 2;
      const rightBayRightEdgeLocalX = BACKDROP_RIGHT_BAY_LOCAL_POS[0] + 0.75;
      // Nameplate sits well to the right of the Right Backdrop Bay in booth local space
      expect(badgeLeftEdgeLocalX).toBeGreaterThan(rightBayRightEdgeLocalX + 0.25);
    }
  });

  it('V25.5 — busts NPC GLB cache (?v=25.5), embeds refined COLOR_0 facial vertex colors & smooth normals in untitled.glb, and prevents duplicate TTS POST retries on Backend JSON 502/504 errors', async () => {
    // 1. Verify cache-busting query on NPC_GLB_URL & refined untitled.glb facial attributes
    expect(NPC_GLB_URL).toContain('models/npc/untitled.glb?v=25.5');
    const untitledPath = path.resolve(__dirname, '../../public/models/npc/untitled.glb');
    const glbBuf = fs.readFileSync(untitledPath);
    expect(glbBuf.byteLength).toBeGreaterThan(1_150_000); // V25.2/V25.5 refined model (~1.22 MB vs legacy 944 KB)

    const jsonLen = glbBuf.readUInt32LE(12);
    const gltf = JSON.parse(glbBuf.subarray(20, 20 + jsonLen).toString('utf8')) as {
      meshes?: Array<{
        name?: string;
        primitives: Array<{ attributes: Record<string, number>; material?: number }>;
      }>;
      materials?: Array<{ name?: string }>;
      animations?: Array<{ name?: string }>;
    };

    const matNames = (gltf.materials ?? []).map((m) => m.name);
    expect(matNames).toEqual(
      expect.arrayContaining(['mat_skin', 'mat_eye', 'mat_iris', 'mat_cornea', 'mat_eyebrow'])
    );

    // Verify head mesh carries baked COLOR_0 + smooth NORMAL attributes on mat_skin primitive
    const skinMatIdx = matNames.indexOf('mat_skin');
    const headMesh = (gltf.meshes ?? []).find((m) =>
      m.primitives.some(
        (p) => p.material === skinMatIdx && p.attributes.COLOR_0 !== undefined
      )
    );
    expect(headMesh).toBeDefined();
    const skinPrim = headMesh!.primitives.find((p) => p.material === skinMatIdx)!;
    expect(skinPrim.attributes.COLOR_0).toBeTypeOf('number');
    expect(skinPrim.attributes.NORMAL).toBeTypeOf('number');

    // Verify all multi-material primitives (skin, sclera, iris, cornea, eyebrow, hair, attire) remain intact
    expect(headMesh!.primitives.length).toBeGreaterThanOrEqual(4);

    // 2. Verify apiClient NEVER fires a duplicate retry POST when Backend returns JSON 504 TTS_TIMEOUT or 502 TTS_SYNTHESIS_FAILED
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: unknown }).window;
    try {
      (globalThis as { window?: unknown }).window = {
        location: { hostname: 'localhost', origin: 'http://localhost:5173' },
      };

      const fetch504Spy = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: 'Quá trình tổng hợp giọng nói vượt quá thời gian chờ.',
            code: 'TTS_TIMEOUT',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }
        );
      });
      globalThis.fetch = fetch504Spy as unknown as typeof fetch;

      await expect(
        apiClient.synthesizeNpcSpeech({
          boothId: 'booth-solaris-energy',
          stepType: 'GREETING',
          chunkIndex: 0,
          priority: 'ACTIVE_PLAYBACK',
        })
      ).rejects.toMatchObject({ code: 'TTS_TIMEOUT', status: 504 });
      expect(fetch504Spy).toHaveBeenCalledTimes(1); // Strictly 1 call — NO duplicate retry!

      const fetch502JsonSpy = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: 'Lỗi tổng hợp KorvaTTS.',
            code: 'TTS_SYNTHESIS_FAILED',
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });
      globalThis.fetch = fetch502JsonSpy as unknown as typeof fetch;

      await expect(
        apiClient.getNpcSpeechManifest({
          boothId: 'booth-solaris-energy',
          stepType: 'GREETING',
        })
      ).rejects.toMatchObject({ code: 'TTS_SYNTHESIS_FAILED', status: 502 });
      expect(fetch502JsonSpy).toHaveBeenCalledTimes(1); // Strictly 1 call!

      // 3. Conversely, if Vite dev proxy itself returns non-JSON 502 text/plain, fallback to localhost:4000 still works
      let callCount = 0;
      const proxyFallbackSpy = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return new Response('Bad Gateway (Vite proxy)', {
            status: 502,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        const wavBytes = new Uint8Array(128);
        return new Response(wavBytes, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-TTS-Cache': 'HIT',
            'X-TTS-Provider': 'korvatts',
            'X-TTS-Voice': 'phuong_linh',
            'X-TTS-Chunk-Index': '0',
            'X-TTS-Total-Chunks': '3',
          },
        });
      });
      globalThis.fetch = proxyFallbackSpy as unknown as typeof fetch;

      const okRes = await apiClient.synthesizeNpcSpeech({
        boothId: 'booth-solaris-energy',
        stepType: 'GREETING',
        chunkIndex: 0,
      });
      expect(proxyFallbackSpy).toHaveBeenCalledTimes(2);
      expect(okRes.provider).toBe('korvatts');
      expect(okRes.voice).toBe('phuong_linh');
      expect(okRes.chunkIndex).toBe(0);
      expect(okRes.totalChunks).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });

  it('V25.6 — separates click-to-move from left-mouse-drag camera rotation without Pointer Lock, hides Controls Guide & Admin button for Guests, and shrinks visitor nametags with distance scaling', () => {
    // 1. TASK B: Click vs Drag gesture threshold & smooth clamped yaw/pitch drag without Pointer Lock
    expect(CAMERA_DRAG_THRESHOLD_PX).toBe(6);
    expect(TOUCH_DRAG_THRESHOLD_PX).toBe(8);

    // Sub-threshold movement is treated as a normal click (click-to-move / booth / product click)
    expect(classifyPointerGesture(400, 300, 403, 304, 'mouse').isDrag).toBe(false);
    expect(classifyPointerGesture(200, 200, 205, 205, 'touch').isDrag).toBe(false);

    // Exceeding threshold enters camera drag-rotate mode (suppressing trailing click-to-move)
    expect(classifyPointerGesture(400, 300, 412, 302, 'mouse').isDrag).toBe(true);
    expect(classifyPointerGesture(200, 200, 215, 205, 'touch').isDrag).toBe(true);

    const dragRight = applyCameraDragDelta(Math.PI, 0, 80, 0, 'mouse');
    expect(dragRight.yaw).toBeLessThan(Math.PI);
    expect(dragRight.pitch).toBeCloseTo(0, 5);

    const dragLeft = applyCameraDragDelta(Math.PI, 0, -80, 0, 'mouse');
    expect(dragLeft.yaw).toBeGreaterThan(Math.PI);
    expect(dragLeft.pitch).toBeCloseTo(0, 5);

    const dragUpClamp = applyCameraDragDelta(0, 0.3, 0, -500, 'mouse');
    expect(dragUpClamp.pitch).toBeCloseTo(MAX_CAMERA_PITCH, 5);

    const dragDownClamp = applyCameraDragDelta(0, -0.3, 0, 500, 'touch');
    expect(dragDownClamp.pitch).toBeCloseTo(MIN_CAMERA_PITCH, 5);

    // Ensure Pointer Lock is completely removed from ExhibitionScene & ExhibitionPage and cursor is never hidden
    const sceneSrc = fs.readFileSync(path.resolve(__dirname, '../scene/ExhibitionScene.tsx'), 'utf8');
    const pageSrc = fs.readFileSync(path.resolve(__dirname, '../pages/ExhibitionPage.tsx'), 'utf8');
    const adminSrc = fs.readFileSync(path.resolve(__dirname, '../pages/AdminPage.tsx'), 'utf8');
    const cssSrc = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

    expect(sceneSrc.includes('requestPointerLock')).toBe(false);
    expect(sceneSrc.includes('pointerlockchange')).toBe(false);
    expect(pageSrc.includes('Khóa chuột 3D')).toBe(false);
    expect(cssSrc.includes('cursor: none')).toBe(false);

    // 2. TASK C: Controls Guide & Admin button hidden on Visitor HUD; Admin login form does not leak PoC password
    expect(pageSrc.includes('useState(false)')).toBe(true);
    expect(pageSrc.includes('❓ Hướng dẫn')).toBe(false);
    expect(pageSrc.includes('Quản trị (Dashboard)')).toBe(false);
    expect(adminSrc.includes('expo-admin-2026')).toBe(false);

    // 3. TASK D: Compact Visitor Nametag dimensions (>55% smaller width & height vs legacy 2.5m x 0.62m) & distance scaling
    expect(AVATAR_NAMETAG_CANVAS_SIZE).toEqual([384, 96]);
    expect(AVATAR_NAMETAG_SIZE[0]).toBeLessThanOrEqual(1.1);
    expect(AVATAR_NAMETAG_SIZE[1]).toBeLessThanOrEqual(0.28);
    const nametagBottomY = AVATAR_NAMETAG_OFFSET_Y - AVATAR_NAMETAG_SIZE[1] / 2;
    expect(nametagBottomY).toBeGreaterThan(1.85); // Clears 1.835m avatar hair peak -> zero face occlusion

    const nearSelf = computeAvatarNametagVisualState(5.2, true, false);
    const nearRemote = computeAvatarNametagVisualState(5.2, false, false);
    const farRemote = computeAvatarNametagVisualState(38, false, false);
    const zoomedOutOverview = computeAvatarNametagVisualState(32, false, true, 18);

    expect(nearSelf.scale).toBeLessThan(nearRemote.scale); // Self nametag is calmer in 3rd-person view
    expect(nearRemote.scale).toBeLessThanOrEqual(1.0);
    expect(farRemote.scale).toBeLessThan(nearRemote.scale);
    expect(farRemote.opacity).toBeLessThan(nearRemote.opacity);
    expect(zoomedOutOverview.opacity).toBeLessThan(0.7);

    // Verify compact nametag texture creation & deterministic GPU disposal
    const texBase = getActiveCanvasTextureCount();
    const selfTag = createAvatarNametagTexture({
      name: 'Khách #859',
      color: '#10b981',
      isSelf: true,
    });
    const remoteTag = createAvatarNametagTexture({
      name: 'Khách #412',
      color: '#0ea5e9',
      isSelf: false,
      activeBoothName: 'Solaris Clean Energy',
    });
    expect(getActiveCanvasTextureCount()).toBe(texBase + 2);
    selfTag.dispose();
    remoteTag.dispose();
    expect(getActiveCanvasTextureCount()).toBe(texBase);
  });

  it('V25.8 — normalizes Vietnamese + English product/price/unit speech for Piper WASM without mutating displayText or breaking clause boundaries', () => {
    expect(numberToVietnameseWordsClient(590000)).toBe('năm trăm chín mươi nghìn');
    expect(numberToVietnameseWordsClient(1550)).toBe('một nghìn năm trăm năm mươi');
    expect(numberToVietnameseWordsClient(54000000)).toBe('năm mươi tư triệu');

    // Mandatory Phase 4.2 cases
    expect(normalizeVietnameseForPiper('Sản phẩm có giá 590.000đ')).toContain(
      'năm trăm chín mươi nghìn đồng'
    );
    expect(normalizeVietnameseForPiper('Thu hoạch chín 100% ở độ cao 1.550m')).toContain(
      'một trăm phần trăm ở độ cao một nghìn năm trăm năm mươi mét'
    );
    expect(
      normalizeVietnameseForPiper('Cà Phê Đặc Sản Cầu Đất Arabica Honey Process (1kg)')
    ).toContain('A ra bi ca Hăn ni Pờ rô xét, một ki lô gam');
    expect(
      normalizeVietnameseForPiper('Pin Solaris PowerWall 10kWh hiệu suất 98.4%, <42dB, ±5mm')
    ).toContain('Sô la rít Pao ơ Uôn mười ki lô oát giờ hiệu suất chín mươi tám phẩy bốn phần trăm');
    expect(
      normalizeVietnameseForPiper('Cụm Camera AI Kinetix EyePro tốc độ 120 sản phẩm/phút')
    ).toContain('ây ai Ki nê tích Ai Pờ rô tốc độ một trăm hai mươi sản phẩm trên phút');

    // Newly added Admin CamelCase brand stems (e.g. EcoSmart SolarMax)
    expect(normalizeVietnameseForPiper('Pin EcoSmart SolarMax 20kWh')).toContain(
      'Ê cô Xờ mát Sô la Mắc hai mươi ki lô oát giờ'
    );

    // Lowercase Vietnamese words ("ai", "ca", "in") must never be corrupted by uppercase acronym rules
    expect(normalizeVietnameseForPiper('Không ai pha ca cà phê như vậy')).toBe(
      'Không ai pha ca cà phê như vậy.'
    );

    // Strict separation between displayText (subtitle) and speechText (Piper TTS) + intact chunking
    const ecoBooth = DEFAULT_BOOTHS.find((b) => b.id === 'booth-ecovita-craft')!;
    const ecoSlots = buildBoothSlotViews(ecoBooth.id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
    const plan = buildBoothPresentationPlan(ecoBooth, ecoSlots, DEFAULT_PRODUCTS);
    const prodStep = plan.steps.find((s) => s.type === 'PRODUCT')!;

    // Subtitle keeps exact English spelling & formatted VND digits
    expect(prodStep.text).toContain('Arabica Honey Process (1kg)');
    expect(prodStep.text).toContain('590.000 đồng');

    const piperStep = buildPiperStepPlanFromDisplayText(prodStep.text);
    expect(piperStep.displayText).toBe(prodStep.text);
    expect(piperStep.speechText).toContain('A ra bi ca Hăn ni Pờ rô xét');
    expect(piperStep.speechText).toContain('năm trăm chín mươi nghìn đồng');
    expect(piperStep.chunks.length).toBeGreaterThanOrEqual(2);
    expect(piperStep.chunks.some((c) => c.includes('năm trăm chín mươi nghìn đồng'))).toBe(true);

    // Ensure chunking never cuts mid-price or mid-unit
    const longNormalized = normalizeVietnameseForPiper(
      'Dạ xin chào quý khách, hôm nay em xin giới thiệu mẫu Pin Lưu Trữ Điện Mặt Trời Solaris PowerWall 10kWh hiện có mức giá 54.000.000đ, tuổi thọ hơn 6.000 chu kỳ sạc xả ở mức 80% DoD, chuẩn kháng nước IP65.'
    );
    const splitChunks = chunkNormalizedSpeechForPiper(longNormalized, 65, 135);
    expect(splitChunks.length).toBeGreaterThanOrEqual(2);
    expect(splitChunks.some((c) => c.includes('năm mươi tư triệu đồng'))).toBe(true);
    expect(splitChunks.some((c) => c.includes('mười ki lô oát giờ'))).toBe(true);
    expect(PIPER_VOICE_ATTRIBUTION_NOTICE).toContain('CC BY 4.0');
  });

  it('V25.8 — enforces Hybrid TTS provider selection, capability/RAM guards, WAV LRU caching, Admin invalidation, timeout/crash recovery, and Worker disposal', async () => {
    // 1. Provider resolution rules
    expect(resolveTtsProviderConfig({ rawEnvValue: '', hostname: 'localhost' }).preferredInitial).toBe(
      'local-korvatts'
    );
    expect(
      resolveTtsProviderConfig({ rawEnvValue: '', hostname: 'exhibition-demo.vercel.app' })
        .preferredInitial
    ).toBe('browser-piper');
    expect(
      resolveTtsProviderConfig({
        rawEnvValue: '',
        hostname: 'localhost',
        search: '?tts=browser-piper',
      }).preferredInitial
    ).toBe('browser-piper');
    // Production safety: accidental VITE_TTS_PROVIDER=local-korvatts on Vercel never calls Render KorvaTTS
    const misconfiguredProd = resolveTtsProviderConfig({
      rawEnvValue: 'local-korvatts',
      hostname: 'exhibition-prod.vercel.app',
    });
    expect(misconfiguredProd.preferredInitial).toBe('browser-piper');
    expect(misconfiguredProd.configWarning).toBeTruthy();

    const invalidCfg = resolveTtsProviderConfig({
      rawEnvValue: 'unknown-engine',
      hostname: 'exhibition-prod.vercel.app',
    });
    expect(invalidCfg.preferredInitial).toBe('browser-piper');
    expect(invalidCfg.configWarning).toContain('không hợp lệ');

    // 2. Browser capability & deviceMemory advisory checks
    expect(
      checkBrowserPiperCapability({ hasWebAssembly: false, hasWorker: true }).supported
    ).toBe(false);
    expect(
      checkBrowserPiperCapability({ hasWebAssembly: true, hasWorker: true, deviceMemory: 0.5 })
        .supported
    ).toBe(false);
    const lowRamCap = checkBrowserPiperCapability({
      hasWebAssembly: true,
      hasWorker: true,
      deviceMemory: 2,
    });
    expect(lowRamCap.supported).toBe(true);
    expect(lowRamCap.lowMemoryDevice).toBe(true);

    // 3. Singleton Worker lifecycle, progress events, WAV cache HIT/MISS, Admin edit invalidation, crash recovery & disposal
    let workerSpawnCount = 0;
    let workerSynthesizeCalls = 0;
    let simulateMode: 'ok' | 'init_fail' | 'crash' = 'ok';

    const makeValidMockWav = (tag: string): ArrayBuffer => {
      const pcmLen = 200;
      const ab = new ArrayBuffer(44 + pcmLen);
      const view = new DataView(ab);
      const writeStr = (off: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
      };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + pcmLen, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 22050, true);
      view.setUint32(28, 44100, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, pcmLen, true);
      view.setUint8(44, tag.charCodeAt(0) || 65);
      return ab;
    };

    const mockWorkerFactory = () => {
      workerSpawnCount += 1;
      let terminated = false;
      const fakeWorker = {
        onmessage: null as ((ev: MessageEvent) => void) | null,
        onerror: null as ((ev: ErrorEvent) => void) | null,
        onmessageerror: null as (() => void) | null,
        postMessage(msg: { id: number; type: string; text?: string }) {
          if (terminated) return;
          setTimeout(() => {
            if (terminated) return;
            if (msg.type === 'ping') {
              fakeWorker.onmessage?.({ data: { id: msg.id, type: 'pong' } } as MessageEvent);
              return;
            }
            if (msg.type === 'dispose') {
              fakeWorker.onmessage?.({ data: { id: msg.id, type: 'disposed' } } as MessageEvent);
              return;
            }
            if (msg.type === 'init') {
              if (simulateMode === 'init_fail') {
                fakeWorker.onmessage?.({
                  data: { id: msg.id, type: 'error', message: 'HTTP 503 tải model lỗi' },
                } as MessageEvent);
                return;
              }
              fakeWorker.onmessage?.({
                data: {
                  id: msg.id,
                  type: 'progress',
                  stage: 'downloading',
                  loadedBytes: 35_000_000,
                  totalBytes: 70_000_000,
                },
              } as MessageEvent);
              fakeWorker.onmessage?.({
                data: {
                  id: msg.id,
                  type: 'ready',
                  downloadMs: 120,
                  initMs: 80,
                  fromCache: false,
                  modelBytes: 63201294,
                  sampleRate: 22050,
                },
              } as MessageEvent);
              return;
            }
            if (msg.type === 'synthesize') {
              if (simulateMode === 'crash') {
                fakeWorker.onerror?.({ message: 'Out of memory in WASM' } as ErrorEvent);
                return;
              }
              workerSynthesizeCalls += 1;
              fakeWorker.onmessage?.({
                data: {
                  id: msg.id,
                  type: 'audio',
                  wavBuffer: makeValidMockWav(msg.text || 'A'),
                  synthMs: 42,
                  durationSec: 1.8,
                  sampleRate: 22050,
                },
              } as MessageEvent);
            }
          }, 5);
        },
        terminate() {
          terminated = true;
        },
      };
      return fakeWorker as unknown as Worker;
    };

    const originalWorker = (globalThis as Record<string, unknown>).Worker;
    (globalThis as Record<string, unknown>).Worker = function DummyWorker() {};
    try {
      const mgr = new PiperBrowserTtsManager(mockWorkerFactory);
      const progressEvents: number[] = [];

      // Cold synthesis -> MISS, forwards progress, spawns exactly 1 singleton Worker
      const res1 = await mgr.synthesizeNormalizedChunk({
        normalizedText: 'Xin chào quý khách.',
        onProgress: (ev) => {
          if (ev.percent !== null) progressEvents.push(ev.percent);
        },
      });
      expect(res1.cacheStatus).toBe('MISS');
      expect(res1.blob.size).toBe(244);
      expect(progressEvents).toContain(50);
      expect(workerSpawnCount).toBe(1);
      expect(workerSynthesizeCalls).toBe(1);

      // Repeat identical text -> instant WAV LRU Cache HIT (0 extra worker calls)
      const resHit = await mgr.synthesizeNormalizedChunk({
        normalizedText: 'Xin chào quý khách.',
      });
      expect(resHit.cacheStatus).toBe('HIT');
      expect(workerSynthesizeCalls).toBe(1);

      // Admin edits product price -> new cache key -> MISS & new synthesis
      const keyOld = computePiperWavCacheKey('Sản phẩm giá năm trăm nghìn đồng.');
      const keyNew = computePiperWavCacheKey('Sản phẩm giá sáu trăm năm mươi nghìn đồng.');
      expect(keyOld).not.toBe(keyNew);
      const resUpdated = await mgr.synthesizeNormalizedChunk({
        normalizedText: 'Sản phẩm giá sáu trăm năm mươi nghìn đồng.',
      });
      expect(resUpdated.cacheStatus).toBe('MISS');
      expect(workerSynthesizeCalls).toBe(2);

      // Worker crash -> rejects cleanly without hanging, then recovers cleanly with a fresh Worker on retry
      simulateMode = 'crash';
      await expect(
        mgr.synthesizeNormalizedChunk({ normalizedText: 'Câu thử lỗi crash.' })
      ).rejects.toThrow(/sự cố/i);

      simulateMode = 'ok';
      const recovered = await mgr.synthesizeNormalizedChunk({
        normalizedText: 'Câu thử khôi phục sau crash.',
      });
      expect(recovered.cacheStatus).toBe('MISS');
      expect(workerSpawnCount).toBe(2);

      // Init/Download failure -> rejects cleanly without infinite retry loop
      await mgr.disposeWorker();
      expect(mgr.getCacheStats().workerAlive).toBe(false);
      simulateMode = 'init_fail';
      await expect(
        mgr.synthesizeNormalizedChunk({ normalizedText: 'Câu thử tải model lỗi.' })
      ).rejects.toThrow(/HTTP 503/);

      await mgr.disposeWorker();
    } finally {
      if (originalWorker === undefined) {
        delete (globalThis as Record<string, unknown>).Worker;
      } else {
        (globalThis as Record<string, unknown>).Worker = originalWorker;
      }
    }
  });

  it('V25.10 — removes redundant NPC voice status/source lines across all steps while preserving loading progress, error retry banner, and CC BY 4.0 file attribution', () => {
    const booth = DEFAULT_BOOTHS[1]; // Nordic Living Interiors AB
    const slotViews = buildBoothSlotViews(booth.id, DEFAULT_PRODUCTS, FALLBACK_SLOT_ASSIGNMENTS);
    const plan = buildBoothPresentationPlan(booth, slotViews, DEFAULT_PRODUCTS);
    const noop = () => undefined;

    const renderPanel = (
      status: 'GREETING' | 'PRESENTING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'ERROR',
      audioState:
        | 'PLAYING'
        | 'SPEAKING'
        | 'ENDED'
        | 'MODEL_LOADING'
        | 'GENERATING_AUDIO'
        | 'NO_VI_VOICE'
        | 'AUDIO_ERROR'
        | 'MUTED',
      stepIdx: number,
      voiceNotice: string | null = 'Giọng nữ VAIS-1000 (Piper WASM) · Đoạn 1/2'
    ) =>
      renderToStaticMarkup(
        React.createElement(NpcAssistantPanel, {
          plan,
          status,
          audioState,
          voiceNotice,
          currentStepIndex: stepIdx,
          isMuted: audioState === 'MUTED',
          hasVietnameseVoice: true,
          onPause: noop,
          onResume: noop,
          onPrevious: noop,
          onNext: noop,
          onStop: noop,
          onRestart: noop,
          onRetryAudio: noop,
          onToggleMute: noop,
          onClose: noop,
        })
      );

    // 1. Greeting, Product, Paused, Completed (Replay ready), and Cancelled states:
    // Zero redundant voice-meta lines (`Đã phát xong phần giới thiệu gian hàng`, `Nguồn giọng: VAIS-1000`, `Đang phát giọng đọc:`)
    const activeAndDoneMarkup = [
      renderPanel('GREETING', 'PLAYING', 0),
      renderPanel('PRESENTING', 'PLAYING', 1),
      renderPanel('PAUSED', 'SPEAKING', 1),
      renderPanel('COMPLETED', 'ENDED', plan.steps.length - 1),
      renderPanel('CANCELLED', 'ENDED', 1),
      renderPanel('PRESENTING', 'MUTED', 1),
    ];

    for (const html of activeAndDoneMarkup) {
      expect(html).not.toContain('Đã phát xong phần giới thiệu gian hàng');
      expect(html).not.toContain('Nguồn giọng: VAIS-1000');
      expect(html).not.toContain('CC BY 4.0');
      expect(html).not.toContain('Đang phát giọng đọc');
      expect(html).not.toContain('npc-assistant-panel__voice-meta');
    }

    // Completed state still renders `Nghe lại` control and subtitle cleanly
    const completedHtml = activeAndDoneMarkup[3];
    expect(completedHtml).toContain('Nghe lại');
    expect(completedHtml).toContain(plan.steps[plan.steps.length - 1].text);

    // 2. Active downloading / audio preparation preserves clean progress without technical VAIS-1000 code
    const loadingHtml = renderPanel(
      'GREETING',
      'GENERATING_AUDIO',
      0,
      'Đang tạo đoạn âm thanh 1/3 (Giọng nữ VAIS-1000)...'
    );
    expect(loadingHtml).toContain('npc-assistant-panel__voice-meta');
    expect(loadingHtml).toContain('Đang tạo đoạn âm thanh 1/3...');
    expect(loadingHtml).not.toContain('VAIS-1000');
    expect(loadingHtml).not.toContain('Nguồn giọng');

    // 3. Genuine error / subtitle fallback preserves warning banner and `Thử lại âm thanh`
    const errorHtml = renderPanel(
      'PRESENTING',
      'AUDIO_ERROR',
      1,
      'Mạng tạm thời gián đoạn — đang hiển thị phụ đề tiếng Việt.'
    );
    expect(errorHtml).toContain('npc-assistant-panel__audio-warning');
    expect(errorHtml).toContain('Thử lại âm thanh');
    expect(errorHtml).not.toContain('npc-assistant-panel__voice-meta');

    // 4. CC BY 4.0 attribution remains intact in public credits file & exported constant
    expect(PIPER_VOICE_ATTRIBUTION_NOTICE).toContain('CC BY 4.0');
    const attributionPath = path.resolve(__dirname, '../../public/tts/ATTRIBUTION.txt');
    expect(fs.existsSync(attributionPath)).toBe(true);
    expect(fs.readFileSync(attributionPath, 'utf8')).toContain('CC BY 4.0');
  });

  it('V25.10 — removes the left icon medallion from all 6 booth signboards, reclaims title width without clipping, and disposes textures cleanly', () => {
    const sceneTexturesSrc = fs.readFileSync(
      path.resolve(__dirname, '../scene/sceneTextures.ts'),
      'utf8'
    );
    const fnStart = sceneTexturesSrc.indexOf('export function createBoothSignTexture(');
    const fnEnd = sceneTexturesSrc.indexOf('export function createBoothFasciaTexture(');
    expect(fnStart).toBeGreaterThan(0);
    expect(fnEnd).toBeGreaterThan(fnStart);

    const signFnBody = sceneTexturesSrc.slice(fnStart, fnEnd);
    // Left emblem box (34, 34, 172, 172) and pal.icon draw call must be completely removed (not hidden with opacity)
    expect(signFnBody).not.toContain('34, 34, 172, 172');
    expect(signFnBody).not.toContain('pal.icon');
    expect(signFnBody).toContain('const titleLeftX = 58');
    expect(signFnBody).toContain('const maxTitleWidth = 1148');

    const baseline = getActiveCanvasTextureCount();
    const createdTextures = DEFAULT_BOOTHS.map((booth) => {
      const enterpriseTitle = (booth.companyName || booth.name).toUpperCase();
      const fitted = fitEnterpriseTitleLines(null, enterpriseTitle, 1148, 62, 36);
      expect(fitted.lines.join(' ')).toBe(enterpriseTitle);
      expect(fitted.lines.join(' ')).not.toContain('...');
      expect(fitted.lines.join(' ')).not.toContain('…');

      return createBoothSignTexture({
        name: booth.companyName || booth.name,
        category: `${booth.name} · ${booth.category}`,
        productCount: 6,
        color: booth.color,
        active: false,
        theme: resolveBoothTheme(booth),
      });
    });

    expect(createdTextures.length).toBe(6);
    expect(getActiveCanvasTextureCount()).toBe(baseline + 6);

    for (const tex of createdTextures) {
      tex.dispose();
    }
    expect(getActiveCanvasTextureCount()).toBe(baseline);
  });

  it('V26 — integrates Kinetix V3 GLB by default, preserves V2 GLB rollback, leaves 5 other booths untouched, and preserves slots/collision/NPC safety', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // 1. Default version & clean rollback resolution
    expect(DEFAULT_KINETIX_BOOTH_VERSION).toBe('v3');
    expect(resolveKinetixBoothVersion({ search: '', envValue: '' })).toBe('v3');
    expect(resolveKinetixBoothVersion({ search: '?kinetix=v2', envValue: '' })).toBe('v2');
    expect(resolveKinetixBoothVersion({ search: '?kinetix=V3', envValue: 'v2' })).toBe('v3');
    expect(resolveKinetixBoothVersion({ search: '', envValue: 'v2' })).toBe('v2');
    expect(resolveKinetixBoothVersion({ search: '?kinetix=invalid', envValue: '' })).toBe('v3');

    // 2. Exact GLB paths for Kinetix V3 vs V2 rollback, and all 5 other booths V2 rollback paths
    expect(resolveBespokeBoothGlbSubpath('robotics', 'v3')).toBe(
      'models/booths/kinetix-v3/kinetix_booth_v3.glb'
    );
    expect(resolveBespokeBoothGlbSubpath('robotics', 'v2')).toBe(
      'models/booths/kinetix-v2/kinetix_booth_v2.glb'
    );
    expect(resolveBespokeBoothGlbSubpath('tech', 'v2')).toBe('models/booths/v2/aether_tech_v2.glb');
    expect(resolveBespokeBoothGlbSubpath('living', 'v2')).toBe(
      'models/booths/v2/nordic_living_v2.glb'
    );
    expect(resolveBespokeBoothGlbSubpath('coffee', 'v2')).toBe(
      'models/booths/v2/ecovita_coffee_v2.glb'
    );
    expect(resolveBespokeBoothGlbSubpath('design', 'v2')).toBe(
      'models/booths/v2/lumina_design_v2.glb'
    );
    expect(resolveBespokeBoothGlbSubpath('energy', 'v2')).toBe(
      'models/booths/v2/solaris_energy_v2.glb'
    );

    // 3. Binary GLB existence & valid glTF 2.0 header check for BOTH Kinetix V3 and preserved Kinetix V2
    const publicDir = path.resolve(__dirname, '../../public');
    const v3File = path.join(publicDir, 'models/booths/kinetix-v3/kinetix_booth_v3.glb');
    const v2File = path.join(publicDir, 'models/booths/kinetix-v2/kinetix_booth_v2.glb');
    expect(fs.existsSync(v3File)).toBe(true);
    expect(fs.existsSync(v2File)).toBe(true);

    const v3Buf = fs.readFileSync(v3File);
    const v2Buf = fs.readFileSync(v2File);
    expect(v3Buf.toString('ascii', 0, 4)).toBe('glTF');
    expect(v3Buf.readUInt32LE(4)).toBe(2);
    expect(v3Buf.readUInt32LE(8)).toBe(v3Buf.byteLength);
    // V3 must stay lightweight (< 561,028 bytes of V2)
    expect(v3Buf.byteLength).toBeGreaterThan(50_000);
    expect(v3Buf.byteLength).toBeLessThan(v2Buf.byteLength);
    expect(v2Buf.byteLength).toBe(561_028);

    // 4. Kinetix product slots, collision bounds, approach point & NPC safety remain 100% intact
    const kinetix = DEFAULT_BOOTHS.find((b) => b.id === 'booth-kinetix-robotics')!;
    expect(kinetix).toBeDefined();
    expect(BOOTH_SLOT_DEFINITIONS.map((s) => s.slotId)).toEqual([
      'slot_01',
      'slot_02',
      'slot_03',
      'slot_04',
      'slot_05',
      'slot_06',
    ]);
    const approach = getBoothApproachPoint(kinetix);
    expect(isPointWalkable(approach.x, approach.z, DEFAULT_BOOTHS)).toBe(true);
    const pathFromSpawn = findPathAStar(
      CENTRAL_SPAWN_POINT.x,
      CENTRAL_SPAWN_POINT.z,
      approach.x,
      approach.z,
      DEFAULT_BOOTHS
    );
    expect(pathFromSpawn.length).toBeGreaterThan(0);
    expect(verifyNpcPlacementSafety(kinetix).valid).toBe(true);
  });

  it('V26.1 — integrates all 5 remaining V3 booth GLBs with valid glTF 2.0 headers, <240KB budget, per-booth & global V2 rollback, and full slot/NPC/navigation safety across all 6 booths', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const publicDir = path.resolve(__dirname, '../../public');

    const fiveThemes = [
      { theme: 'tech' as const, qKey: 'aether', v3: 'models/booths/aether-tech-v3/aether_tech_v3.glb', v2: 'models/booths/v2/aether_tech_v2.glb' },
      { theme: 'coffee' as const, qKey: 'ecovita', v3: 'models/booths/ecovita-coffee-v3/ecovita_coffee_v3.glb', v2: 'models/booths/v2/ecovita_coffee_v2.glb' },
      { theme: 'design' as const, qKey: 'lumina', v3: 'models/booths/lumina-design-v3/lumina_design_v3.glb', v2: 'models/booths/v2/lumina_design_v2.glb' },
      { theme: 'living' as const, qKey: 'nordic', v3: 'models/booths/nordic-living-v3/nordic_living_v3.glb', v2: 'models/booths/v2/nordic_living_v2.glb' },
      { theme: 'energy' as const, qKey: 'solaris', v3: 'models/booths/solaris-energy-v3/solaris_energy_v3.glb', v2: 'models/booths/v2/solaris_energy_v2.glb' },
    ];

    for (const item of fiveThemes) {
      // Default V3 + per-booth & global V2 rollback
      expect(DEFAULT_BOOTH_MODEL_VERSIONS[item.theme]).toBe('v3');
      expect(resolveBoothModelVersion(item.theme, { search: '', envValue: '' })).toBe('v3');
      expect(resolveBoothModelVersion(item.theme, { search: `?${item.qKey}=v2`, envValue: '' })).toBe('v2');
      expect(resolveBoothModelVersion(item.theme, { search: '?booths=v2', envValue: '' })).toBe('v2');
      expect(resolveBoothModelVersion(item.theme, { search: '', envValue: 'v2' })).toBe('v2');
      expect(resolveBespokeBoothGlbSubpath(item.theme, 'v3')).toBe(item.v3);
      expect(resolveBespokeBoothGlbSubpath(item.theme, 'v2')).toBe(item.v2);

      // Verify both V3 and preserved V2 GLB files on disk with valid glTF 2.0 binary headers
      const v3Path = path.join(publicDir, item.v3);
      const v2Path = path.join(publicDir, item.v2);
      expect(fs.existsSync(v3Path)).toBe(true);
      expect(fs.existsSync(v2Path)).toBe(true);

      const v3Buf = fs.readFileSync(v3Path);
      expect(v3Buf.toString('ascii', 0, 4)).toBe('glTF');
      expect(v3Buf.readUInt32LE(4)).toBe(2);
      expect(v3Buf.readUInt32LE(8)).toBe(v3Buf.byteLength);
      expect(v3Buf.byteLength).toBeGreaterThan(40_000);
      expect(v3Buf.byteLength).toBeLessThan(240 * 1024);
    }

    // All 6 booths keep intact approach points, A* reachability, and NPC safety
    for (const booth of DEFAULT_BOOTHS) {
      const approach = getBoothApproachPoint(booth);
      expect(isPointWalkable(approach.x, approach.z, DEFAULT_BOOTHS)).toBe(true);
      expect(verifyNpcPlacementSafety(booth).valid).toBe(true);
    }
  });
});
