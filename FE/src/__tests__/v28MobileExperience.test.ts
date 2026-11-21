import { describe, expect, it, vi } from 'vitest';
import {
  classifyV28Viewport,
  computeFloatingJoystickVector,
  DEFAULT_FLOATING_JOYSTICK_CONFIG,
  isTouchPointInJoystickZone,
  resolveV28GraphicsProfile,
  V28MultiTouchGestureController,
  type FloatingJoystickVisualState,
} from '../scene/v28/v28MobileControls';
import { computeV28CameraRelativeMove } from '../scene/v28/v28CameraController';

describe('Grand Expo V28 Mobile Experience — Orientation-Aware Split Touch Controls & Adaptive Quality', () => {
  it('classifies all 7 required mobile/tablet viewports accurately while preserving desktop', () => {
    const mobilePortraitSizes = [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
    ];
    for (const [w, h] of mobilePortraitSizes) {
      const vp = classifyV28Viewport(w, h, true);
      expect(vp.isMobilePortrait).toBe(true);
      expect(vp.isMobileViewport).toBe(true);
    }

    const mobileLandscapeSizes = [
      [667, 375],
      [844, 390],
    ];
    for (const [w, h] of mobileLandscapeSizes) {
      const vp = classifyV28Viewport(w, h, true);
      expect(vp.isMobileLandscape).toBe(true);
      expect(vp.isMobileViewport).toBe(true);
    }

    const tablet = classifyV28Viewport(768, 1024, true);
    expect(tablet.isTabletViewport).toBe(true);
    expect(tablet.isMobileViewport).toBe(true);

    const desktop = classifyV28Viewport(1440, 900, false);
    expect(desktop.isMobileViewport).toBe(false);
    expect(desktop.isMobilePortrait).toBe(false);
    expect(desktop.isMobileLandscape).toBe(false);
  });

  it('computes 360-degree floating joystick vectors with dead zone, radius clamp, and diagonal normalization', () => {
    const tiny = computeFloatingJoystickVector(120, 620, 124, 623);
    expect(tiny.inDeadZone).toBe(true);
    expect(tiny.magnitude).toBe(0);
    expect(tiny.moveX).toBe(0);
    expect(tiny.moveY).toBe(0);

    const diag = computeFloatingJoystickVector(120, 620, 300, 440);
    expect(diag.inDeadZone).toBe(false);
    expect(diag.magnitude).toBeCloseTo(1.0, 5);
    expect(Math.hypot(diag.moveX, diag.moveY)).toBeLessThanOrEqual(1.0001);
    expect(Math.hypot(diag.knobX, diag.knobY)).toBeCloseTo(DEFAULT_FLOATING_JOYSTICK_CONFIG.maxRadiusPx, 3);

    const camMove = computeV28CameraRelativeMove(diag.moveX, diag.moveY, Math.PI / 4);
    expect(Math.hypot(camMove.moveX, camMove.moveZ)).toBeLessThanOrEqual(1.0001);
  });

  it('splits Portrait vertically (bottom 50% joystick / top 50% camera) and Landscape horizontally (left 50% joystick / right 50% camera)', () => {
    // Portrait 390x844 -> vertical split at y = 422
    expect(isTouchPointInJoystickZone(100, 200, 390, 844)).toBe(false); // top-left -> camera
    expect(isTouchPointInJoystickZone(320, 421, 390, 844)).toBe(false); // top-right -> camera
    expect(isTouchPointInJoystickZone(320, 422, 390, 844)).toBe(true); // bottom-right -> joystick
    expect(isTouchPointInJoystickZone(80, 700, 390, 844)).toBe(true); // bottom-left -> joystick

    // Landscape 844x390 -> horizontal split at x = 422
    expect(isTouchPointInJoystickZone(200, 100, 844, 390)).toBe(true); // top-left -> joystick
    expect(isTouchPointInJoystickZone(421, 350, 844, 390)).toBe(true); // bottom-left -> joystick
    expect(isTouchPointInJoystickZone(422, 100, 844, 390)).toBe(false); // top-right -> camera
    expect(isTouchPointInJoystickZone(700, 350, 844, 390)).toBe(false); // bottom-right -> camera
  });

  it('handles Portrait simultaneous multi-touch (bottom joystick + top camera) and keeps pointerId across 50% line', () => {
    const joyVecs: Array<{ x: number; y: number }> = [];
    const visuals: FloatingJoystickVisualState[] = [];
    const orbitDeltas: Array<{ dx: number; dy: number }> = [];
    const onOrbitEnd = vi.fn();

    const ctrl = new V28MultiTouchGestureController({
      getCameraMode: () => 'explore',
      getViewportSize: () => ({ width: 390, height: 844 }), // Portrait -> split at y = 422
      onJoystickVector: (v) => joyVecs.push(v),
      onJoystickVisual: (v) => visuals.push(v),
      onCameraOrbitDelta: (dx, dy) => orbitDeltas.push({ dx, dy }),
      onCameraOrbitEnd: onOrbitEnd,
      onSuppressClickUntil: () => {},
      now: () => 2000,
    });

    // Finger 1 starts in TOP half (y=200 < 422) -> camera orbit ONLY, never spawns joystick
    expect(ctrl.handlePointerDown({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 200, clientY: 200 })).toBe(
      'orbit'
    );
    // Finger 2 starts in BOTTOM half (y=640 >= 422, right side x=310) -> floating joystick at (310, 640)!
    expect(ctrl.handlePointerDown({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 310, clientY: 640 })).toBe(
      'joystick-pending'
    );
    expect(ctrl.getActivePointerIds()).toEqual({ joystickPointerId: 2, cameraPointerId: 1 });

    // Finger 2 drags UP past y=422 into top half -> still controls joystick anchored at (310, 640)!
    ctrl.handlePointerMove({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 310, clientY: 380 });
    expect(ctrl.isJoystickActive()).toBe(true);
    expect(visuals[visuals.length - 1]?.originX).toBe(310);
    expect(visuals[visuals.length - 1]?.originY).toBe(640);
    expect(joyVecs[joyVecs.length - 1]?.y).toBeCloseTo(-1.0, 4);

    // Finger 1 swipes DOWN past y=422 into bottom half -> still orbits camera!
    ctrl.handlePointerMove({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 260, clientY: 460 });
    expect(ctrl.isOrbitDragging()).toBe(true);
    expect(orbitDeltas[orbitDeltas.length - 1]?.dx).toBe(60);

    // Releasing camera finger (1) does NOT stop active joystick (2)
    ctrl.handlePointerEnd(1);
    expect(onOrbitEnd).toHaveBeenCalledTimes(1);
    expect(ctrl.isJoystickActive()).toBe(true);

    // Releasing joystick finger (2) stops movement immediately
    ctrl.handlePointerEnd(2);
    expect(ctrl.isJoystickActive()).toBe(false);
    expect(joyVecs[joyVecs.length - 1]).toEqual({ x: 0, y: 0 });
  });

  it('auto-switches split zones on orientation change and safely cancels active gestures during rotation', () => {
    let vp = { width: 390, height: 844 }; // Start Portrait
    const joyVecs: Array<{ x: number; y: number }> = [];
    const visuals: FloatingJoystickVisualState[] = [];

    const ctrl = new V28MultiTouchGestureController({
      getCameraMode: () => 'explore',
      getViewportSize: () => vp,
      onJoystickVector: (v) => joyVecs.push(v),
      onJoystickVisual: (v) => visuals.push(v),
      onCameraOrbitDelta: () => {},
      onCameraOrbitEnd: () => {},
      onSuppressClickUntil: () => {},
    });

    // Start dragging in Portrait bottom half
    ctrl.handlePointerDown({ pointerId: 10, pointerType: 'touch', button: 0, clientX: 180, clientY: 650 });
    ctrl.handlePointerMove({ pointerId: 10, pointerType: 'touch', button: 0, clientX: 180, clientY: 590 });
    expect(ctrl.isJoystickActive()).toBe(true);

    // Phone rotates to Landscape 844x390 -> orientation handler calls resetAll()
    vp = { width: 844, height: 390 };
    ctrl.resetAll();
    expect(ctrl.isJoystickActive()).toBe(false);
    expect(joyVecs[joyVecs.length - 1]).toEqual({ x: 0, y: 0 });
    expect(visuals[visuals.length - 1]?.visible).toBe(false);

    // Now in Landscape: LEFT half (x=200 < 422, even top y=80) = joystick; RIGHT half (x=600 >= 422) = camera!
    expect(ctrl.handlePointerDown({ pointerId: 11, pointerType: 'touch', button: 0, clientX: 200, clientY: 80 })).toBe(
      'joystick-pending'
    );
    expect(ctrl.handlePointerDown({ pointerId: 12, pointerType: 'touch', button: 0, clientX: 600, clientY: 300 })).toBe(
      'orbit'
    );
    expect(ctrl.getActivePointerIds()).toEqual({ joystickPointerId: 11, cameraPointerId: 12 });
    ctrl.resetAll();
  });

  it('distinguishes quick tap on either zone from drag so booth/product/NPC clicks never conflict', () => {
    const onSuppress = vi.fn();
    const ctrl = new V28MultiTouchGestureController({
      getCameraMode: () => 'explore',
      getViewportSize: () => ({ width: 390, height: 844 }),
      onJoystickVector: () => {},
      onJoystickVisual: () => {},
      onCameraOrbitDelta: () => {},
      onCameraOrbitEnd: () => {},
      onSuppressClickUntil: onSuppress,
      now: () => 1000,
    });

    // Quick tap in bottom half (joystick zone)
    ctrl.handlePointerDown({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 190, clientY: 620 });
    ctrl.handlePointerMove({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 193, clientY: 622 });
    ctrl.handlePointerEnd(1);

    // Quick tap in top half (camera zone)
    ctrl.handlePointerDown({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 190, clientY: 200 });
    ctrl.handlePointerMove({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 192, clientY: 201 });
    ctrl.handlePointerEnd(2);

    expect(onSuppress).not.toHaveBeenCalled();
  });

  it('preserves desktop mouse orbit anywhere on canvas and immediately resets on focus or blur', () => {
    let mode: 'overview' | 'explore' | 'focus' = 'explore';
    const lastJoy = { x: 0, y: 0 };
    const onOrbit = vi.fn();

    const ctrl = new V28MultiTouchGestureController({
      getCameraMode: () => mode,
      getViewportSize: () => ({ width: 1440, height: 900 }),
      onJoystickVector: (v) => {
        lastJoy.x = v.x;
        lastJoy.y = v.y;
      },
      onJoystickVisual: () => {},
      onCameraOrbitDelta: onOrbit,
      onCameraOrbitEnd: () => {},
      onSuppressClickUntil: () => {},
    });

    // Desktop mouse drag in bottom-left -> STILL orbits camera, never spawns joystick!
    expect(ctrl.handlePointerDown({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 700 })).toBe(
      'orbit'
    );
    ctrl.handlePointerMove({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 250, clientY: 705 });
    expect(ctrl.isJoystickActive()).toBe(false);
    expect(onOrbit).toHaveBeenCalledTimes(1);
    ctrl.handlePointerEnd(1);

    // Touch drag -> pointercancel / resetAll stops movement immediately
    ctrl.handlePointerDown({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 100, clientY: 500 });
    ctrl.handlePointerMove({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 100, clientY: 440 });
    expect(lastJoy.y).toBeLessThan(-0.8);
    ctrl.resetAll();
    expect(lastJoy).toEqual({ x: 0, y: 0 });

    // Focus mode ignores new touch gestures
    mode = 'focus';
    expect(ctrl.handlePointerDown({ pointerId: 3, pointerType: 'touch', button: 0, clientX: 100, clientY: 500 })).toBe(
      'ignored'
    );
  });

  it('resolves Adaptive Quality profiles for mobile and preserves exact desktop defaults', () => {
    const desktopAuto = resolveV28GraphicsProfile('auto', false, 8, 16);
    expect(desktopAuto.dpr).toEqual([1, 2]);
    expect(desktopAuto.shadows).toBe(true);
    expect(desktopAuto.shadowMapSize).toBe(1024);

    const mobileAutoMid = resolveV28GraphicsProfile('auto', true, 8, 8);
    expect(mobileAutoMid.dpr).toEqual([1, 1.25]);
    expect(mobileAutoMid.shadowMapSize).toBe(512);

    const mobileAutoLow = resolveV28GraphicsProfile('auto', true, 4, 4);
    expect(mobileAutoLow.shadows).toBe(false);
    expect(mobileAutoLow.dpr).toEqual([1, 1.15]);

    const mobilePerf = resolveV28GraphicsProfile('performance', true, 8, 8);
    expect(mobilePerf.dpr).toEqual([1, 1]);
    expect(mobilePerf.shadows).toBe(false);
    expect(mobilePerf.antialias).toBe(false);

    const mobileQuality = resolveV28GraphicsProfile('quality', true, 8, 8);
    expect(mobileQuality.dpr).toEqual([1, 1.5]);
    expect(mobileQuality.shadows).toBe(true);
    expect(mobileQuality.shadowMapSize).toBe(1024);
  });
});
