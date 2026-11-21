import React, { useImperativeHandle, useRef } from 'react';
import type { FloatingJoystickVisualState } from '../../scene/v28/v28MobileControls';

export interface FloatingJoystickOverlayHandle {
  update: (state: FloatingJoystickVisualState) => void;
}

const OUTER_SIZE = 112;
const KNOB_SIZE = 46;
const HALF_OUTER = OUTER_SIZE / 2;
const HALF_KNOB = KNOB_SIZE / 2;

/**
 * Zero-re-render Floating Joystick 360° visual overlay.
 * Updates DOM transforms directly via imperative handle so 60fps touch drags trigger 0 React renders.
 */
export const FloatingJoystickOverlay = React.forwardRef<FloatingJoystickOverlayHandle>((_, ref) => {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(state: FloatingJoystickVisualState) {
        const ring = ringRef.current;
        const knob = knobRef.current;
        if (!ring || !knob) return;

        if (!state.visible) {
          ring.style.opacity = '0';
          ring.style.transform = `${ring.dataset.baseTransform || 'translate3d(-999px, -999px, 0)'} scale(0.84)`;
          knob.style.transform = 'translate3d(0px, 0px, 0)';
          return;
        }

        // Clamp visual ring within safe viewport margins so notch/edges never clip it
        const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
        const safeOriginX = Math.max(HALF_OUTER + 8, Math.min(vw - HALF_OUTER - 8, state.originX));
        const safeOriginY = Math.max(HALF_OUTER + 8, Math.min(vh - HALF_OUTER - 8, state.originY));

        const baseTransform = `translate3d(${Math.round(safeOriginX - HALF_OUTER)}px, ${Math.round(safeOriginY - HALF_OUTER)}px, 0)`;
        ring.dataset.baseTransform = baseTransform;
        ring.style.transform = `${baseTransform} scale(1)`;
        ring.style.opacity = '1';

        knob.style.transform = `translate3d(${state.knobX.toFixed(1)}px, ${state.knobY.toFixed(1)}px, 0)`;
        knob.style.boxShadow =
          state.magnitude > 0.15
            ? '0 6px 18px rgba(14, 165, 233, 0.36), inset 0 1px 1px rgba(255,255,255,0.65)'
            : '0 4px 12px rgba(15, 23, 42, 0.28), inset 0 1px 1px rgba(255,255,255,0.5)';
      },
    }),
    []
  );

  return (
    <div
      aria-hidden="true"
      className="v28-floating-joystick-layer"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 18,
        overflow: 'hidden',
      }}
    >
      <div
        ref={ringRef}
        className="v28-floating-joystick-ring"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: OUTER_SIZE,
          height: OUTER_SIZE,
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.24)',
          border: '1.5px solid rgba(255, 255, 255, 0.42)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.2), inset 0 0 0 1px rgba(148, 163, 184, 0.18)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: 0,
          transform: 'translate3d(-999px, -999px, 0) scale(0.84)',
          transition: 'opacity 140ms ease-out',
          willChange: 'transform, opacity',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={knobRef}
          className="v28-floating-joystick-knob"
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: '50%',
            marginLeft: 0,
            marginTop: 0,
            background: 'radial-gradient(circle at 35% 30%, rgba(248, 250, 252, 0.94), rgba(203, 213, 225, 0.82))',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.28)',
            willChange: 'transform',
            transform: 'translate3d(0px, 0px, 0)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.35)',
            left: HALF_OUTER - 3,
            top: HALF_OUTER - 3,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
});

FloatingJoystickOverlay.displayName = 'FloatingJoystickOverlay';
