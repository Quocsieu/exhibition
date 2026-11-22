import * as THREE from 'three';
import type { V28BoothPlacementView, V28RectBounds } from '../../services/v28Api';
import { isPointInRect, type RotatedCollider } from './v28NavigationBounds';

export const V28_FOCUS_FOV = 38;
export const V28_PORTRAIT_FOCUS_FOV = 42;
export const V28_EXPLORE_FOV = 50;
export const V28_OVERVIEW_FOV = 46;

export interface V28FocusCameraPose {
  cameraPosition: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
  entryPosition: THREE.Vector3;
  fov: number;
  distance: number;
  instanceScale: number;
  forward: { x: number; z: number };
}

export interface V28ExploreCameraPose {
  cameraPosition: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
  fov: number;
  safeDistance: number;
}

/**
 * Shortest signed angular difference in radians in [-PI, PI].
 */
export function shortestAngleDiff(fromAngle: number, toAngle: number): number {
  return Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
}

/**
 * Computes the unit forward vector (+Z in booth local space) in world coordinates.
 */
export function getBoothForwardVector(rotationY: number): { x: number; z: number } {
  return {
    x: Math.sin(rotationY),
    z: Math.cos(rotationY),
  };
}

/**
 * Transforms a booth-local coordinate (lx, ly, lz) into world coordinates using
 * the booth's exact world position and rotationY (identical convention to V27.5).
 */
export function boothLocalToWorld(
  booth: Pick<V28BoothPlacementView, 'positionX' | 'positionZ' | 'rotationY'>,
  lx: number,
  ly: number,
  lz: number
): THREE.Vector3 {
  const cosR = Math.cos(booth.rotationY);
  const sinR = Math.sin(booth.rotationY);
  return new THREE.Vector3(
    booth.positionX + lx * cosR + lz * sinR,
    ly,
    booth.positionZ - lx * sinR + lz * cosR
  );
}

/**
 * Computes the exact front-facing Booth Focus camera pose for any V28 booth placement,
 * achieving visual and behavioral parity with V27.5 while dynamically adapting to:
 *  - Any booth position & rotationY (including ±90° U-wings and 180° opposite rows)
 *  - Booth scale (1.25× Phase 9 scale or 1.0× legacy scale) & all 6 archetypes
 *  - Viewport aspect ratio (Desktop 16:9, Tablet 4:3/3:4, Mobile portrait/landscape)
 *  - Dynamic hall bounds & neighboring booth colliders (never clipping walls or leaving bounds)
 */
export function computeV28BoothFocusCamera(
  booth: Pick<
    V28BoothPlacementView,
    'boothId' | 'positionX' | 'positionZ' | 'rotationY' | 'footprintWidth' | 'footprintDepth' | 'archetypeId'
  >,
  viewportWidth: number,
  viewportHeight: number,
  hallBounds?: V28RectBounds,
  boothColliders: readonly RotatedCollider[] = []
): V28FocusCameraPose {
  const safeW = Math.max(320, viewportWidth || 1280);
  const safeH = Math.max(320, viewportHeight || 720);
  const aspect = safeW / safeH;
  const isPortrait = safeW < safeH;
  const isMobileLandscape = safeW <= 960 && safeH <= 500 && safeW > safeH;

  const baseGlbWidth = booth.archetypeId === 'dynamic_frame' ? 6.87 : 6.72;
  const instanceScale = THREE.MathUtils.clamp(
    (booth.footprintWidth || baseGlbWidth) / baseGlbWidth,
    1.0,
    1.5
  );

  const effectiveFocusFov = isPortrait ? V28_PORTRAIT_FOCUS_FOV : V28_FOCUS_FOV;
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(effectiveFocusFov / 2));
  const effectiveWidth = Math.max(booth.footprintWidth || baseGlbWidth, baseGlbWidth * instanceScale);
  const halfDepth = (booth.footprintDepth || 5.0 * instanceScale) / 2;

  // Top of signage board in world meters (accounting for wave_pavilion taller arch + sign height)
  const signCenterY = (booth.archetypeId === 'wave_pavilion' ? 3.85 : 3.45) * instanceScale;
  const signTopY = signCenterY + 0.55 * instanceScale;

  // UAT Fix 04: ~14-16% closer Focus framing so booth, products & signage fill the viewport prominently
  // while keeping full signage, all 6 product zones, and the 3D NPC cleanly inside frame with 0 clipping.
  const widthMarginFactor = isPortrait ? 0.57 : 0.51;
  const distForWidth = halfDepth + (effectiveWidth * widthMarginFactor) / Math.max(0.24, tanHalfFov * aspect);

  // Reserve clean headroom at top for the slim Focus HUD bar and floor apron below
  const verticalHalfSpan = signTopY * (isMobileLandscape ? 0.56 : 0.50);
  const distForHeight = halfDepth + verticalHalfSpan / tanHalfFov;

  const minSafeDist = halfDepth + 4.15 * instanceScale;
  const maxSafeDist = isPortrait ? 26.0 : 17.0;
  let localCamZ = THREE.MathUtils.clamp(
    Math.max(distForWidth, distForHeight, 8.0 * instanceScale),
    minSafeDist,
    maxSafeDist
  );

  // Eye-level slightly elevated front view looking gently downward (V27.5 reference framing).
  // In narrow Portrait viewports (e.g. 390x844), offset look/cam X slightly toward the right-front NPC
  // so the full booth signage, 6 products, AND the 3D NPC stay cleanly inside frame (Desktop & Landscape unchanged).
  const localCamX = isPortrait ? 0.48 * instanceScale : 0;
  const localLookX = isPortrait ? 0.45 * instanceScale : 0;
  const localCamY = (isPortrait ? 2.65 : isMobileLandscape ? 2.28 : 2.38) * instanceScale;
  const localLookY = (isPortrait ? 2.04 : isMobileLandscape ? 1.85 : 1.92) * instanceScale;
  const localLookZ = -0.32 * instanceScale;

  // Ensure camera position stays inside dynamic hallBounds and outside OTHER booths' colliders
  const otherColliders = boothColliders.filter((c) => c.boothId !== booth.boothId);
  const margin = 1.2;
  const isPoseClear = (distZ: number): boolean => {
    const pt = boothLocalToWorld(booth, localCamX, localCamY, distZ);
    if (hallBounds) {
      if (
        pt.x < hallBounds.minX + margin ||
        pt.x > hallBounds.maxX - margin ||
        pt.z < hallBounds.minZ + margin ||
        pt.z > hallBounds.maxZ - margin
      ) {
        return false;
      }
    }
    for (let i = 0; i < otherColliders.length; i++) {
      if (isPointInRect(pt.x, pt.z, otherColliders[i])) {
        return false;
      }
    }
    return true;
  };

  if (!isPoseClear(localCamZ)) {
    // Pull smoothly closer along the booth's own forward vector until clear of walls/bounds
    const minPullDist = halfDepth + 3.4 * instanceScale;
    let candidate = localCamZ;
    while (candidate > minPullDist) {
      candidate = Math.max(minPullDist, candidate - 0.5);
      if (isPoseClear(candidate)) {
        localCamZ = candidate;
        break;
      }
    }
  }

  const cameraPosition = boothLocalToWorld(booth, localCamX, localCamY, localCamZ);
  const lookAtTarget = boothLocalToWorld(booth, localLookX, localLookY, localLookZ);
  const entryDist = Math.min(localCamZ + 2.1 * instanceScale, maxSafeDist);
  const entryPosition = isPoseClear(entryDist)
    ? boothLocalToWorld(booth, localCamX, localCamY + 0.55 * instanceScale, entryDist)
    : boothLocalToWorld(booth, localCamX, localCamY + 0.35 * instanceScale, localCamZ);

  return {
    cameraPosition,
    lookAtTarget,
    entryPosition,
    fov: effectiveFocusFov,
    distance: localCamZ,
    instanceScale,
    forward: getBoothForwardVector(booth.rotationY),
  };
}

/**
 * Computes V27.5-parity Low-Angle Third-Person (`Tham quan`) camera position & lookAt target:
 * - Stands behind the visitor along cameraYaw, slightly above shoulder height
 * - Looks forward down the corridor along cameraYaw
 * - Pulls closer automatically if a booth collider or hall boundary lies behind the visitor
 */
export function computeV28ExploreCamera(
  playerX: number,
  playerZ: number,
  cameraYaw: number,
  cameraPitch: number,
  zoomScale: number,
  hallBounds: V28RectBounds,
  boothColliders: readonly RotatedCollider[]
): V28ExploreCameraPose {
  const safeZoom = THREE.MathUtils.clamp(zoomScale, 0.55, 1.75);
  const safePitch = THREE.MathUtils.clamp(cameraPitch, -0.38, 0.42);

  const desiredDist = THREE.MathUtils.clamp(5.4 * safeZoom, 3.4, 8.6);
  const baseCamHeight = THREE.MathUtils.clamp(2.38 * safeZoom, 1.72, 3.55);
  const pitchedCamHeight =
    safePitch === 0
      ? baseCamHeight
      : THREE.MathUtils.clamp(baseCamHeight - Math.sin(safePitch) * 1.05, 1.35, 5.2);

  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);

  let safeDist = desiredDist;
  const checkFractions = [0.35, 0.55, 0.75, 1.0];
  for (const frac of checkFractions) {
    const testDist = desiredDist * frac;
    const tx = playerX - fwdX * testDist;
    const tz = playerZ - fwdZ * testDist;
    const outOfBounds =
      tx < hallBounds.minX + 0.6 ||
      tx > hallBounds.maxX - 0.6 ||
      tz < hallBounds.minZ + 0.6 ||
      tz > hallBounds.maxZ - 0.6;
    const hitsBooth = boothColliders.some((c) => isPointInRect(tx, tz, c));
    if (outOfBounds || hitsBooth) {
      safeDist = Math.max(2.15, desiredDist * Math.max(0.25, frac - 0.22));
      break;
    }
  }

  const camX = THREE.MathUtils.clamp(playerX - fwdX * safeDist, hallBounds.minX + 0.6, hallBounds.maxX - 0.6);
  const camZ = THREE.MathUtils.clamp(playerZ - fwdZ * safeDist, hallBounds.minZ + 0.6, hallBounds.maxZ - 0.6);
  const camY = Math.max(1.35, pitchedCamHeight);

  const lookAheadDist = 4.2;
  const lookX = playerX + fwdX * lookAheadDist;
  const lookZ = playerZ + fwdZ * lookAheadDist;
  const lookY =
    safePitch === 0
      ? 1.52
      : THREE.MathUtils.clamp(1.52 + Math.sin(safePitch) * 1.75, 0.45, 3.35);

  return {
    cameraPosition: new THREE.Vector3(camX, camY, camZ),
    lookAtTarget: new THREE.Vector3(lookX, lookY, lookZ),
    fov: V28_EXPLORE_FOV,
    safeDistance: safeDist,
  };
}

/**
 * Computes normalized world-space movement vector from local input (WASD / Arrow / Joystick)
 * relative to the active camera heading (exact V27.5 camera-relative parity).
 *
 * Input convention:
 *  - inputZ < 0 => Forward (W / ArrowUp / Joystick Up)
 *  - inputZ > 0 => Backward (S / ArrowDown / Joystick Down)
 *  - inputX < 0 => Left (A / ArrowLeft / Joystick Left)
 *  - inputX > 0 => Right (D / ArrowRight / Joystick Right)
 */
export function computeV28CameraRelativeMove(
  inputX: number,
  inputZ: number,
  cameraYaw: number | null
): { moveX: number; moveZ: number; magnitude: number } {
  const len = Math.hypot(inputX, inputZ);
  if (len <= 0.05) {
    return { moveX: 0, moveZ: 0, magnitude: 0 };
  }
  const localX = inputX / Math.max(1, len);
  const localZ = inputZ / Math.max(1, len);

  if (typeof cameraYaw === 'number' && Number.isFinite(cameraYaw)) {
    const fwdX = Math.sin(cameraYaw);
    const fwdZ = Math.cos(cameraYaw);
    const rightX = -Math.cos(cameraYaw);
    const rightZ = Math.sin(cameraYaw);
    const forwardAmount = -localZ;
    const rightAmount = localX;
    const worldX = forwardAmount * fwdX + rightAmount * rightX;
    const worldZ = forwardAmount * fwdZ + rightAmount * rightZ;
    const worldLen = Math.hypot(worldX, worldZ) || 1;
    const scale = Math.min(1, len);
    return {
      moveX: (worldX / worldLen) * scale,
      moveZ: (worldZ / worldLen) * scale,
      magnitude: scale,
    };
  }

  return {
    moveX: localX,
    moveZ: localZ,
    magnitude: Math.min(1, len),
  };
}
