import {
  DEFAULT_DESKTOP_STREAMING,
  DEFAULT_MOBILE_STREAMING,
  type StreamingThresholds,
} from './spatialStreaming';

export type V28GraphicsQualityMode = 'auto' | 'performance' | 'quality';

export interface V28ViewportInfo {
  width: number;
  height: number;
  isTouchCapable: boolean;
  isMobilePortrait: boolean;
  isMobileLandscape: boolean;
  isMobileViewport: boolean;
  isTabletViewport: boolean;
}

export interface FloatingJoystickConfig {
  maxRadiusPx: number;
  deadZoneRatio: number;
  dragActivationPx: number;
}

export const DEFAULT_FLOATING_JOYSTICK_CONFIG: FloatingJoystickConfig = {
  maxRadiusPx: 52,
  deadZoneRatio: 0.14,
  dragActivationPx: 10,
};

export interface FloatingJoystickVectorResult {
  knobX: number;
  knobY: number;
  moveX: number;
  moveY: number;
  magnitude: number;
  inDeadZone: boolean;
}

export interface FloatingJoystickVisualState {
  visible: boolean;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  magnitude: number;
}

export interface V28GraphicsProfile {
  mode: V28GraphicsQualityMode;
  resolvedTier: 'performance' | 'balanced' | 'quality';
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: 512 | 768 | 1024;
  antialias: boolean;
  streamingThresholds: StreamingThresholds;
}

const PERFORMANCE_MOBILE_STREAMING: StreamingThresholds = {
  ring0Enter: 17,
  ring0Leave: 22,
  ring1Enter: 32,
  ring1Leave: 38,
  maxNearBooths: 6,
};

/**
 * Classifies viewport dimensions + touch capability cleanly without breaking desktop layouts.
 * Covers:
 * - Portrait phones: 320x568, 375x667, 390x844, 430x932
 * - Landscape phones: 667x375, 844x390, 932x430
 * - Touch tablets: 768x1024
 */
export function classifyV28Viewport(
  width: number,
  height: number,
  isTouchCapable = false
): V28ViewportInfo {
  const safeW = Math.max(320, width || 1280);
  const safeH = Math.max(320, height || 720);
  const isPortrait = safeH >= safeW;
  const isMobilePortrait = safeW <= 640 && isPortrait;
  const isMobileLandscape = safeW <= 960 && safeH <= 500 && !isPortrait;
  const isTabletViewport = safeW > 640 && safeW <= 1024 && safeH > 500 && isTouchCapable;
  const isMobileViewport = isMobilePortrait || isMobileLandscape || (safeW <= 768 && isTouchCapable);

  return {
    width: safeW,
    height: safeH,
    isTouchCapable,
    isMobilePortrait,
    isMobileLandscape,
    isMobileViewport,
    isTabletViewport,
  };
}

export function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  );
}

/**
 * Pure 360-degree floating joystick math with dead-zone smoothing and strict unit-circle clamping.
 * Diagonal vectors are normalized so character speed never exceeds 1.0x max speed.
 */
export function computeFloatingJoystickVector(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  config: FloatingJoystickConfig = DEFAULT_FLOATING_JOYSTICK_CONFIG
): FloatingJoystickVectorResult {
  const dx = currentX - originX;
  const dy = currentY - originY;
  const dist = Math.hypot(dx, dy);
  const maxR = Math.max(20, config.maxRadiusPx);

  if (dist <= 0.0001) {
    return { knobX: 0, knobY: 0, moveX: 0, moveY: 0, magnitude: 0, inDeadZone: true };
  }

  const clampedDist = Math.min(dist, maxR);
  const unitX = dx / dist;
  const unitY = dy / dist;
  const knobX = unitX * clampedDist;
  const knobY = unitY * clampedDist;

  const rawNorm = clampedDist / maxR;
  const dz = Math.min(0.45, Math.max(0, config.deadZoneRatio));

  if (rawNorm <= dz) {
    return { knobX, knobY, moveX: 0, moveY: 0, magnitude: 0, inDeadZone: true };
  }

  // Smooth progressive ramp from 0 at deadzone edge to 1.0 at maxRadius
  const effectiveMag = Math.min(1, (rawNorm - dz) / Math.max(0.01, 1 - dz));
  return {
    knobX,
    knobY,
    moveX: unitX * effectiveMag,
    moveY: unitY * effectiveMag,
    magnitude: effectiveMag,
    inDeadZone: false,
  };
}

/**
 * Adaptive Quality resolver for Three.js / React Three Fiber.
 * Preserves exact desktop defaults (`dpr: [1, 2]`, `shadows: true`, `shadowMapSize: 1024`).
 */
export function resolveV28GraphicsProfile(
  mode: V28GraphicsQualityMode,
  isMobileViewport: boolean,
  hardwareConcurrency?: number,
  deviceMemoryGb?: number
): V28GraphicsProfile {
  const cores = hardwareConcurrency ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) ?? 8;
  const mem =
    deviceMemoryGb ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);
  const isLowEndDevice = cores <= 4 || (typeof mem === 'number' && mem <= 4);

  if (mode === 'performance') {
    return {
      mode,
      resolvedTier: 'performance',
      dpr: [1, 1],
      shadows: false,
      shadowMapSize: 512,
      antialias: false,
      streamingThresholds: isMobileViewport ? PERFORMANCE_MOBILE_STREAMING : DEFAULT_MOBILE_STREAMING,
    };
  }

  if (mode === 'quality') {
    return {
      mode,
      resolvedTier: 'quality',
      dpr: isMobileViewport ? [1, 1.5] : [1, 2],
      shadows: true,
      shadowMapSize: 1024,
      antialias: true,
      streamingThresholds: isMobileViewport ? DEFAULT_MOBILE_STREAMING : DEFAULT_DESKTOP_STREAMING,
    };
  }

  // AUTO mode
  if (isMobileViewport) {
    if (isLowEndDevice) {
      return {
        mode,
        resolvedTier: 'performance',
        dpr: [1, 1.15],
        shadows: false,
        shadowMapSize: 512,
        antialias: true,
        streamingThresholds: PERFORMANCE_MOBILE_STREAMING,
      };
    }
    return {
      mode,
      resolvedTier: 'balanced',
      dpr: [1, 1.25],
      shadows: true,
      shadowMapSize: 512,
      antialias: true,
      streamingThresholds: DEFAULT_MOBILE_STREAMING,
    };
  }

  // Desktop AUTO — 100% preserved baseline behavior
  return {
    mode,
    resolvedTier: 'quality',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 1024,
    antialias: true,
    streamingThresholds: DEFAULT_DESKTOP_STREAMING,
  };
}

export interface MultiTouchPointerInput {
  pointerId: number;
  pointerType: string;
  button: number;
  clientX: number;
  clientY: number;
}

export interface MultiTouchCallbacks {
  getCameraMode: () => 'overview' | 'explore' | 'focus';
  getViewportSize?: () => { width: number; height: number };
  onJoystickVector: (vec: { x: number; y: number }) => void;
  onJoystickVisual: (visual: FloatingJoystickVisualState) => void;
  onCameraOrbitDelta: (dx: number, dy: number, pointerType: string) => void;
  onCameraOrbitEnd: () => void;
  onSuppressClickUntil: (timestampMs: number) => void;
  now?: () => number;
}

/**
 * Orientation-aware 50/50 touch control zone classifier:
 * - Portrait (height >= width): Bottom 50% = Floating Joystick, Top 50% = Free Camera Swipe.
 * - Landscape (width > height): Left 50% = Floating Joystick, Right 50% = Free Camera Swipe.
 */
export function isTouchPointInJoystickZone(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);
  if (safeH >= safeW) {
    // Portrait: bottom 50% is Floating Joystick
    return clientY >= safeH * 0.5;
  }
  // Landscape: left 50% is Floating Joystick
  return clientX < safeW * 0.5;
}

/**
 * Deterministic orientation-aware split-zone multi-touch + desktop mouse gesture state machine:
 * - Mouse (Desktop): single-pointer drag anywhere orbits camera (100% identical to baseline).
 * - Touch / Pen (Portrait: height >= width):
 *   - Bottom 50% (`clientY >= height / 2`): Floating Joystick 360° at touch point.
 *   - Top 50% (`clientY < height / 2`): Free camera yaw/pitch swipe (NEVER spawns a joystick).
 * - Touch / Pen (Landscape: width > height):
 *   - Left 50% (`clientX < width / 2`): Floating Joystick 360° at touch point.
 *   - Right 50% (`clientX >= width / 2`): Free camera yaw/pitch swipe (NEVER spawns a joystick).
 * - Simultaneous two-finger play: one finger moves + one finger orbits independently.
 * - Pointer ownership stays locked to `pointerId` for the entire gesture even when crossing 50%.
 * - Screen rotation / pointer up / cancel / lostcapture / blur / visibility hidden => immediate zero-velocity stop.
 */
export class V28MultiTouchGestureController {
  private readonly config: FloatingJoystickConfig;
  private readonly cb: MultiTouchCallbacks;
  private readonly nowFn: () => number;
  private readonly getViewportSizeFn: () => { width: number; height: number };

  private joystickPtr: {
    pointerId: number;
    startX: number;
    startY: number;
    activated: boolean;
  } | null = null;

  private orbitPtr: {
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragged: boolean;
  } | null = null;

  constructor(callbacks: MultiTouchCallbacks, config: FloatingJoystickConfig = DEFAULT_FLOATING_JOYSTICK_CONFIG) {
    this.cb = callbacks;
    this.config = config;
    this.nowFn = callbacks.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.getViewportSizeFn =
      callbacks.getViewportSize ??
      (() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 390,
        height: typeof window !== 'undefined' ? window.innerHeight : 844,
      }));
  }

  public isJoystickActive(): boolean {
    return Boolean(this.joystickPtr?.activated);
  }

  public isOrbitDragging(): boolean {
    return Boolean(this.orbitPtr?.dragged);
  }

  public getActivePointerIds(): { joystickPointerId: number | null; cameraPointerId: number | null } {
    return {
      joystickPointerId: this.joystickPtr ? this.joystickPtr.pointerId : null,
      cameraPointerId: this.orbitPtr ? this.orbitPtr.pointerId : null,
    };
  }

  public handlePointerDown(input: MultiTouchPointerInput): 'joystick-pending' | 'orbit' | 'ignored' {
    if (this.cb.getCameraMode() === 'focus') {
      return 'ignored';
    }

    // Desktop Mouse -> preserved single-pointer camera orbit anywhere on canvas
    if (input.pointerType === 'mouse') {
      if (input.button !== 0) return 'ignored';
      this.orbitPtr = {
        pointerId: input.pointerId,
        pointerType: 'mouse',
        startX: input.clientX,
        startY: input.clientY,
        lastX: input.clientX,
        lastY: input.clientY,
        dragged: false,
      };
      return 'orbit';
    }

    // Touch / Pen: orientation-aware 50/50 split (Portrait: bottom/top; Landscape: left/right)
    const { width, height } = this.getViewportSizeFn();
    const inJoystickZone = isTouchPointInJoystickZone(input.clientX, input.clientY, width, height);

    if (inJoystickZone) {
      // Movement zone: Floating Joystick 360° (never spawns a 2nd joystick if already active)
      if (!this.joystickPtr && this.orbitPtr?.pointerId !== input.pointerId) {
        this.joystickPtr = {
          pointerId: input.pointerId,
          startX: input.clientX,
          startY: input.clientY,
          activated: false,
        };
        return 'joystick-pending';
      }
      return 'ignored';
    }

    // Camera zone: Free camera swipe (NEVER creates a joystick)
    if (!this.orbitPtr && this.joystickPtr?.pointerId !== input.pointerId) {
      this.orbitPtr = {
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        startX: input.clientX,
        startY: input.clientY,
        lastX: input.clientX,
        lastY: input.clientY,
        dragged: false,
      };
      return 'orbit';
    }

    return 'ignored';
  }

  public handlePointerMove(input: MultiTouchPointerInput): void {
    if (this.cb.getCameraMode() === 'focus') {
      this.resetAll();
      return;
    }

    // 1. Floating Joystick finger
    if (this.joystickPtr && this.joystickPtr.pointerId === input.pointerId) {
      const disp = Math.hypot(input.clientX - this.joystickPtr.startX, input.clientY - this.joystickPtr.startY);
      if (!this.joystickPtr.activated) {
        if (disp < this.config.dragActivationPx) {
          return;
        }
        this.joystickPtr.activated = true;
      }

      const vec = computeFloatingJoystickVector(
        this.joystickPtr.startX,
        this.joystickPtr.startY,
        input.clientX,
        input.clientY,
        this.config
      );

      this.cb.onJoystickVector({ x: vec.moveX, y: vec.moveY });
      this.cb.onJoystickVisual({
        visible: true,
        originX: this.joystickPtr.startX,
        originY: this.joystickPtr.startY,
        knobX: vec.knobX,
        knobY: vec.knobY,
        magnitude: vec.magnitude,
      });
      return;
    }

    // 2. Camera Orbit finger (Mouse OR 2nd Touch finger)
    if (this.orbitPtr && this.orbitPtr.pointerId === input.pointerId) {
      const totalDisp = Math.hypot(input.clientX - this.orbitPtr.startX, input.clientY - this.orbitPtr.startY);
      const threshold = this.orbitPtr.pointerType === 'mouse' ? 6 : 6;
      if (!this.orbitPtr.dragged && totalDisp <= threshold) {
        return;
      }
      this.orbitPtr.dragged = true;
      const dx = input.clientX - this.orbitPtr.lastX;
      const dy = input.clientY - this.orbitPtr.lastY;
      this.orbitPtr.lastX = input.clientX;
      this.orbitPtr.lastY = input.clientY;
      this.cb.onCameraOrbitDelta(dx, dy, this.orbitPtr.pointerType);
    }
  }

  public handlePointerEnd(pointerId: number): void {
    if (this.joystickPtr && this.joystickPtr.pointerId === pointerId) {
      const wasActivated = this.joystickPtr.activated;
      this.joystickPtr = null;
      this.cb.onJoystickVector({ x: 0, y: 0 });
      this.cb.onJoystickVisual({
        visible: false,
        originX: 0,
        originY: 0,
        knobX: 0,
        knobY: 0,
        magnitude: 0,
      });
      if (wasActivated) {
        this.cb.onSuppressClickUntil(this.nowFn() + 260);
      }
      return;
    }

    if (this.orbitPtr && this.orbitPtr.pointerId === pointerId) {
      const wasDragged = this.orbitPtr.dragged;
      this.orbitPtr = null;
      this.cb.onCameraOrbitEnd();
      if (wasDragged) {
        this.cb.onSuppressClickUntil(this.nowFn() + 240);
      }
    }
  }

  public resetAll(): void {
    const hadJoy = Boolean(this.joystickPtr?.activated);
    const hadOrbit = Boolean(this.orbitPtr?.dragged);
    this.joystickPtr = null;
    this.orbitPtr = null;
    this.cb.onJoystickVector({ x: 0, y: 0 });
    this.cb.onJoystickVisual({
      visible: false,
      originX: 0,
      originY: 0,
      knobX: 0,
      knobY: 0,
      magnitude: 0,
    });
    if (hadOrbit) {
      this.cb.onCameraOrbitEnd();
    }
    if (hadJoy || hadOrbit) {
      this.cb.onSuppressClickUntil(this.nowFn() + 220);
    }
  }
}
