export const V28_ONBOARDING_STORAGE_KEY = 'v28_onboarding_v1';
export const ONBOARDING_MOVE_THRESHOLD_METERS = 1.5;
export const ONBOARDING_ROTATE_THRESHOLD_RAD = 0.25;

export type V28OnboardingStep =
  | 'welcome'
  | 'move'
  | 'rotate'
  | 'explore_booth'
  | 'complete';

export type V28OnboardingStatus =
  | 'idle'
  | 'in_progress'
  | 'completed'
  | 'skipped';

export interface V28OnboardingPersistedData {
  version: 1;
  status: V28OnboardingStatus;
  step: V28OnboardingStep;
  updatedAt: number;
}

export interface V28OnboardingState {
  status: V28OnboardingStatus;
  step: V28OnboardingStep;
  /** Relative baseline captured when entering 'move' (never hardcoded to spawn). */
  moveOrigin: { x: number; z: number } | null;
  /** Relative baseline captured when entering 'rotate'. */
  rotateOriginYaw: number | null;
  moveDistanceMeters: number;
  rotateDeltaRad: number;
}

/**
 * Phase 3 Integration Contract:
 * Allows the future 3D Welcome Guide Character to react to onboarding steps
 * without coupling to SalesAssistantNpc or useNpcConsultationSession.
 */
export interface V28OnboardingGuideSignal {
  active: boolean;
  step: V28OnboardingStep;
  status: V28OnboardingStatus;
  suggestedAnim: 'wave' | 'point_walk' | 'point_camera' | 'point_map' | 'celebrate' | 'idle';
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const VALID_STEPS: ReadonlySet<string> = new Set<V28OnboardingStep>([
  'welcome',
  'move',
  'rotate',
  'explore_booth',
  'complete',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set<V28OnboardingStatus>([
  'idle',
  'in_progress',
  'completed',
  'skipped',
]);

/**
 * Shortest unsigned angular distance in radians, safe across -PI / +PI wrap-around.
 */
export function computeWrappedYawDelta(currentYaw: number, originYaw: number): number {
  const diff = Math.atan2(Math.sin(currentYaw - originYaw), Math.cos(currentYaw - originYaw));
  return Math.abs(diff);
}

export function computePlanarDistance(
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function safeReadOnboardingStorage(storage?: StorageLike | null): V28OnboardingPersistedData | null {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return null;
    const raw = target.getItem(V28_ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<V28OnboardingPersistedData>;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.status === 'string' &&
      VALID_STATUSES.has(parsed.status) &&
      typeof parsed.step === 'string' &&
      VALID_STEPS.has(parsed.step)
    ) {
      return {
        version: 1,
        status: parsed.status as V28OnboardingStatus,
        step: parsed.step as V28OnboardingStep,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function safeWriteOnboardingStorage(
  data: { status: V28OnboardingStatus; step: V28OnboardingStep },
  storage?: StorageLike | null
): boolean {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return false;
    const payload: V28OnboardingPersistedData = {
      version: 1,
      status: data.status,
      step: data.step,
      updatedAt: Date.now(),
    };
    target.setItem(V28_ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function createInitialOnboardingState(
  storage?: StorageLike | null,
  options?: { autoStart?: boolean }
): V28OnboardingState {
  const autoStart = options?.autoStart ?? true;
  if (!autoStart) {
    return {
      status: 'idle',
      step: 'welcome',
      moveOrigin: null,
      rotateOriginYaw: null,
      moveDistanceMeters: 0,
      rotateDeltaRad: 0,
    };
  }
  const persisted = safeReadOnboardingStorage(storage);
  if (!persisted) {
    return {
      status: 'in_progress',
      step: 'welcome',
      moveOrigin: null,
      rotateOriginYaw: null,
      moveDistanceMeters: 0,
      rotateDeltaRad: 0,
    };
  }
  return {
    status: persisted.status,
    step: persisted.step,
    moveOrigin: null,
    rotateOriginYaw: null,
    moveDistanceMeters: 0,
    rotateDeltaRad: 0,
  };
}

export type V28OnboardingAction =
  | { type: 'START'; currentPos: { x: number; z: number } }
  | { type: 'OBSERVE_MOVE'; currentPos: { x: number; z: number }; currentYaw: number }
  | { type: 'OBSERVE_ROTATE'; currentYaw: number }
  | { type: 'OBSERVE_EXPLORE_INTERACTION' }
  | { type: 'SKIP' }
  | { type: 'COMPLETE' }
  | { type: 'REPLAY' };

export function reduceOnboardingState(
  state: V28OnboardingState,
  action: V28OnboardingAction
): { next: V28OnboardingState; shouldPersist: boolean } {
  switch (action.type) {
    case 'START': {
      if (state.status !== 'in_progress' || state.step !== 'welcome') {
        return { next: state, shouldPersist: false };
      }
      return {
        next: {
          status: 'in_progress',
          step: 'move',
          moveOrigin: { x: action.currentPos.x, z: action.currentPos.z },
          rotateOriginYaw: null,
          moveDistanceMeters: 0,
          rotateDeltaRad: 0,
        },
        shouldPersist: true,
      };
    }

    case 'OBSERVE_MOVE': {
      if (state.status !== 'in_progress' || state.step !== 'move') {
        return { next: state, shouldPersist: false };
      }
      const origin = state.moveOrigin ?? { x: action.currentPos.x, z: action.currentPos.z };
      const dist = computePlanarDistance(action.currentPos, origin);
      if (dist >= ONBOARDING_MOVE_THRESHOLD_METERS) {
        return {
          next: {
            ...state,
            step: 'rotate',
            moveOrigin: origin,
            moveDistanceMeters: dist,
            rotateOriginYaw: action.currentYaw,
            rotateDeltaRad: 0,
          },
          shouldPersist: true,
        };
      }
      // Capture origin or update live progress WITHOUT writing localStorage every frame!
      if (!state.moveOrigin || Math.abs(dist - state.moveDistanceMeters) >= 0.05) {
        return {
          next: {
            ...state,
            moveOrigin: origin,
            moveDistanceMeters: dist,
          },
          shouldPersist: false,
        };
      }
      return { next: state, shouldPersist: false };
    }

    case 'OBSERVE_ROTATE': {
      if (state.status !== 'in_progress' || state.step !== 'rotate') {
        return { next: state, shouldPersist: false };
      }
      const originYaw = state.rotateOriginYaw ?? action.currentYaw;
      const delta = computeWrappedYawDelta(action.currentYaw, originYaw);
      if (delta >= ONBOARDING_ROTATE_THRESHOLD_RAD) {
        return {
          next: {
            ...state,
            step: 'explore_booth',
            rotateOriginYaw: originYaw,
            rotateDeltaRad: delta,
          },
          shouldPersist: true,
        };
      }
      if (state.rotateOriginYaw === null || Math.abs(delta - state.rotateDeltaRad) >= 0.03) {
        return {
          next: {
            ...state,
            rotateOriginYaw: originYaw,
            rotateDeltaRad: delta,
          },
          shouldPersist: false,
        };
      }
      return { next: state, shouldPersist: false };
    }

    case 'OBSERVE_EXPLORE_INTERACTION': {
      if (state.status !== 'in_progress' || state.step !== 'explore_booth') {
        return { next: state, shouldPersist: false };
      }
      return {
        next: {
          ...state,
          step: 'complete',
        },
        shouldPersist: true,
      };
    }

    case 'SKIP': {
      if (state.status === 'skipped') {
        return { next: state, shouldPersist: false };
      }
      return {
        next: {
          ...state,
          status: 'skipped',
        },
        shouldPersist: true,
      };
    }

    case 'COMPLETE': {
      if (state.status === 'completed' && state.step === 'complete') {
        return { next: state, shouldPersist: false };
      }
      return {
        next: {
          ...state,
          status: 'completed',
          step: 'complete',
        },
        shouldPersist: true,
      };
    }

    case 'REPLAY': {
      return {
        next: {
          status: 'in_progress',
          step: 'welcome',
          moveOrigin: null,
          rotateOriginYaw: null,
          moveDistanceMeters: 0,
          rotateDeltaRad: 0,
        },
        shouldPersist: true,
      };
    }
  }
}

export function shouldSuppressOnboardingOverlay(opts: {
  status: V28OnboardingStatus;
  step: V28OnboardingStep;
  directoryOpen: boolean;
  mobileMenuOpen: boolean;
  rewardModalOpen: boolean;
  desktopGuideModalOpen: boolean;
  npcChatOpen: boolean;
  isBoothFocusActive: boolean;
}): boolean {
  if (opts.status !== 'in_progress') return true;
  if (opts.mobileMenuOpen || opts.rewardModalOpen || opts.desktopGuideModalOpen || opts.npcChatOpen) {
    return true;
  }
  if (opts.directoryOpen) return true;
  if (opts.isBoothFocusActive && opts.step !== 'complete') return true;
  return false;
}

export function deriveGuideCharacterSignal(state: V28OnboardingState): V28OnboardingGuideSignal {
  if (state.status !== 'in_progress') {
    return { active: false, step: state.step, status: state.status, suggestedAnim: 'idle' };
  }
  const animMap: Record<V28OnboardingStep, V28OnboardingGuideSignal['suggestedAnim']> = {
    welcome: 'wave',
    move: 'point_walk',
    rotate: 'point_camera',
    explore_booth: 'point_map',
    complete: 'celebrate',
  };
  return {
    active: true,
    step: state.step,
    status: state.status,
    suggestedAnim: animMap[state.step],
  };
}
