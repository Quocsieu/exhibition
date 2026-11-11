import { useRef, useState, useCallback } from 'react';
import {
  type Booth,
  type Point2D,
  PLAYER_SPEED,
  CENTRAL_SPAWN_POINT,
  resolveMovementWithSlide,
  findPathAStar,
} from '../types/expo';
import { useKeyboard } from './useKeyboard';

export interface PlayerTransform {
  x: number;
  z: number;
  rotationY: number;
  state: 'idle' | 'walk';
}

export interface UseClickToMoveOptions {
  booths: Booth[];
  initialPosition?: { x: number; z: number; rotationY?: number };
  disabled?: boolean;
  cameraYawRef?: React.MutableRefObject<number | null>;
  onTransformChange?: (transform: PlayerTransform) => void;
  onReachBooth?: (booth: Booth) => void;
}

export function useClickToMove({
  booths,
  initialPosition = CENTRAL_SPAWN_POINT,
  disabled = false,
  cameraYawRef,
  onTransformChange,
  onReachBooth,
}: UseClickToMoveOptions) {
  const transformRef = useRef<PlayerTransform>({
    x: initialPosition.x,
    z: initialPosition.z,
    rotationY: initialPosition.rotationY ?? CENTRAL_SPAWN_POINT.rotationY,
    state: 'idle',
  });

  const [activePath, setActivePath] = useState<Point2D[]>([]);

  const pathRef = useRef<Point2D[]>([]);
  const pendingBoothRef = useRef<Booth | null>(null);
  const joystickVecRef = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 });
  const boothsRef = useRef<Booth[]>(booths);
  boothsRef.current = booths;
  const disabledRef = useRef<boolean>(disabled);
  disabledRef.current = disabled;

  const onTransformChangeRef = useRef(onTransformChange);
  onTransformChangeRef.current = onTransformChange;

  const onReachBoothRef = useRef(onReachBooth);
  onReachBoothRef.current = onReachBooth;

  const cancelAutoPath = useCallback(() => {
    if (pathRef.current.length > 0) {
      pathRef.current = [];
      pendingBoothRef.current = null;
      setActivePath([]);
    }
  }, []);

  const keysPressedRef = useKeyboard({
    disabled,
    onManualInput: cancelAutoPath,
  });

  const setJoystickInput = useCallback(
    (dx: number, dz: number) => {
      joystickVecRef.current = { dx, dz };
      if (Math.hypot(dx, dz) > 0.05) {
        cancelAutoPath();
      }
    },
    [cancelAutoPath]
  );

  const moveToPoint = useCallback((targetX: number, targetZ: number, targetBooth?: Booth) => {
    const current = transformRef.current;
    const computedPath = findPathAStar(current.x, current.z, targetX, targetZ, boothsRef.current);
    pathRef.current = computedPath;
    pendingBoothRef.current = targetBooth ?? null;
    setActivePath(
      computedPath.length > 0 ? [{ x: current.x, z: current.z }, ...computedPath] : []
    );
  }, []);

  const forcePosition = useCallback((x: number, z: number) => {
    pathRef.current = [];
    pendingBoothRef.current = null;
    setActivePath([]);
    const next: PlayerTransform = {
      ...transformRef.current,
      x,
      z,
      state: 'idle',
    };
    transformRef.current = next;
    onTransformChangeRef.current?.({
      x: Number(x.toFixed(3)),
      z: Number(z.toFixed(3)),
      rotationY: Number(next.rotationY.toFixed(3)),
      state: 'idle',
    });
  }, []);

  const stepMovement = useCallback(
    (rawDeltaSeconds: number) => {
      const dt = Math.min(0.05, Math.max(0, rawDeltaSeconds));
      if (dt <= 0) return;

      const current = transformRef.current;
      const isDisabled = disabledRef.current;
      let moveX = 0;
      let moveZ = 0;

      if (!isDisabled) {
        const keys = keysPressedRef.current;
        if (keys.has('w') || keys.has('arrowup')) moveZ -= 1;
        if (keys.has('s') || keys.has('arrowdown')) moveZ += 1;
        if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
        if (keys.has('d') || keys.has('arrowright')) moveX += 1;

        const joy = joystickVecRef.current;
        if (Math.hypot(joy.dx, joy.dz) > 0.05) {
          moveX += joy.dx;
          moveZ += joy.dz;
        }
      }

      const manualLen = Math.hypot(moveX, moveZ);
      let nextX = current.x;
      let nextZ = current.z;
      let nextRot = current.rotationY;
      let nextState: 'idle' | 'walk' = 'idle';

      if (manualLen > 0.05) {
        const localX = moveX / Math.max(1, manualLen);
        const localZ = moveZ / Math.max(1, manualLen);
        let normX = localX;
        let normZ = localZ;

        const activeCamYaw = cameraYawRef?.current;
        if (typeof activeCamYaw === 'number' && Number.isFinite(activeCamYaw)) {
          // Camera-relative movement in Third-Person Explore Mode:
          // Forward unit vector: (sin(yaw), cos(yaw)), Right unit vector: (-cos(yaw), sin(yaw))
          const fwdX = Math.sin(activeCamYaw);
          const fwdZ = Math.cos(activeCamYaw);
          const rightX = -Math.cos(activeCamYaw);
          const rightZ = Math.sin(activeCamYaw);
          const forwardAmount = -localZ;
          const rightAmount = localX;
          normX = forwardAmount * fwdX + rightAmount * rightX;
          normZ = forwardAmount * fwdZ + rightAmount * rightZ;
        }

        const desiredX = current.x + normX * PLAYER_SPEED * dt;
        const desiredZ = current.z + normZ * PLAYER_SPEED * dt;

        const resolved = resolveMovementWithSlide(
          current.x,
          current.z,
          desiredX,
          desiredZ,
          boothsRef.current
        );
        nextX = resolved.x;
        nextZ = resolved.z;
        nextRot = Math.atan2(normX, normZ);
        nextState = 'walk';
      } else if (pathRef.current.length > 0 && !isDisabled) {
        const waypoint = pathRef.current[0];
        const dx = waypoint.x - current.x;
        const dz = waypoint.z - current.z;
        const dist = Math.hypot(dx, dz);
        const stepDist = PLAYER_SPEED * dt;

        if (dist <= stepDist + 0.08) {
          const resolved = resolveMovementWithSlide(
            current.x,
            current.z,
            waypoint.x,
            waypoint.z,
            boothsRef.current
          );
          nextX = resolved.x;
          nextZ = resolved.z;
          pathRef.current = pathRef.current.slice(1);

          if (pathRef.current.length === 0) {
            nextState = 'idle';
            setActivePath([]);
            if (pendingBoothRef.current) {
              const booth = pendingBoothRef.current;
              pendingBoothRef.current = null;
              onReachBoothRef.current?.(booth);
            }
          } else {
            nextState = 'walk';
            setActivePath([{ x: nextX, z: nextZ }, ...pathRef.current]);
          }
        } else {
          const normX = dx / dist;
          const normZ = dz / dist;
          const desiredX = current.x + normX * stepDist;
          const desiredZ = current.z + normZ * stepDist;
          const resolved = resolveMovementWithSlide(
            current.x,
            current.z,
            desiredX,
            desiredZ,
            boothsRef.current
          );
          nextX = resolved.x;
          nextZ = resolved.z;
          nextRot = Math.atan2(normX, normZ);
          nextState = 'walk';

          if (Math.hypot(nextX - current.x, nextZ - current.z) < 0.0005 * (dt / 0.016)) {
            pathRef.current = [];
            pendingBoothRef.current = null;
            setActivePath([]);
            nextState = 'idle';
          }
        }
      }

      const changed =
        Math.abs(nextX - current.x) > 0.0001 ||
        Math.abs(nextZ - current.z) > 0.0001 ||
        Math.abs(nextRot - current.rotationY) > 0.002 ||
        nextState !== current.state;

      if (changed) {
        current.x = nextX;
        current.z = nextZ;
        current.rotationY = nextRot;
        current.state = nextState;

        onTransformChangeRef.current?.({
          x: Number(nextX.toFixed(3)),
          z: Number(nextZ.toFixed(3)),
          rotationY: Number(nextRot.toFixed(3)),
          state: nextState,
        });
      }
    },
    [keysPressedRef, cameraYawRef]
  );

  return {
    transformRef,
    activePath,
    moveToPoint,
    setJoystickInput,
    cancelAutoPath,
    forcePosition,
    stepMovement,
  };
}
