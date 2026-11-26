import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialOnboardingState,
  deriveGuideCharacterSignal,
  reduceOnboardingState,
  safeWriteOnboardingStorage,
  shouldSuppressOnboardingOverlay,
  type V28OnboardingAction,
  type V28OnboardingGuideSignal,
  type V28OnboardingState,
} from '../services/v28OnboardingStateMachine';

export interface UseV28OnboardingParams {
  playerPos: { x: number; z: number };
  cameraYaw: number;
  directoryOpen: boolean;
  hasFocusedBooth: boolean;
  mobileMenuOpen: boolean;
  rewardModalOpen: boolean;
  desktopGuideModalOpen: boolean;
  npcChatOpen: boolean;
  isBoothFocusActive: boolean;
}

export interface UseV28OnboardingResult {
  state: V28OnboardingState;
  isVisible: boolean;
  highlightMapButton: boolean;
  guideSignal: V28OnboardingGuideSignal;
  start: () => void;
  skip: () => void;
  complete: () => void;
  replay: () => void;
}

export function useV28Onboarding({
  playerPos,
  cameraYaw,
  directoryOpen,
  hasFocusedBooth,
  mobileMenuOpen,
  rewardModalOpen,
  desktopGuideModalOpen,
  npcChatOpen,
  isBoothFocusActive,
}: UseV28OnboardingParams): UseV28OnboardingResult {
  // Phase 2: Disable automatic onboarding popup on World entry; starts idle until manually triggered via Replay / Welcome NPC
  const [state, setState] = useState<V28OnboardingState>(() =>
    createInitialOnboardingState(undefined, { autoStart: false })
  );
  const latestPosRef = useRef(playerPos);
  const latestYawRef = useRef(cameraYaw);

  latestPosRef.current = playerPos;
  latestYawRef.current = cameraYaw;

  const dispatch = useCallback((action: V28OnboardingAction) => {
    setState((prev) => {
      const { next, shouldPersist } = reduceOnboardingState(prev, action);
      if (shouldPersist) {
        safeWriteOnboardingStorage({ status: next.status, step: next.step });
      }
      return next;
    });
  }, []);

  // Step 2: Observe genuine avatar movement (>= 1.5m from relative origin)
  useEffect(() => {
    if (state.status !== 'in_progress' || state.step !== 'move') return;
    dispatch({
      type: 'OBSERVE_MOVE',
      currentPos: { x: playerPos.x, z: playerPos.z },
      currentYaw: latestYawRef.current,
    });
  }, [state.status, state.step, playerPos.x, playerPos.z, dispatch]);

  // Step 3: Observe genuine camera rotation (>= 0.25 rad wrapped delta)
  useEffect(() => {
    if (state.status !== 'in_progress' || state.step !== 'rotate') return;
    dispatch({
      type: 'OBSERVE_ROTATE',
      currentYaw: cameraYaw,
    });
  }, [state.status, state.step, cameraYaw, dispatch]);

  // Step 4: Observe opening 2D Map / Booth Directory OR focusing any booth
  useEffect(() => {
    if (state.status !== 'in_progress' || state.step !== 'explore_booth') return;
    if (directoryOpen || hasFocusedBooth) {
      dispatch({ type: 'OBSERVE_EXPLORE_INTERACTION' });
    }
  }, [state.status, state.step, directoryOpen, hasFocusedBooth, dispatch]);

  const start = useCallback(() => {
    dispatch({
      type: 'START',
      currentPos: { x: latestPosRef.current.x, z: latestPosRef.current.z },
    });
  }, [dispatch]);

  const skip = useCallback(() => {
    dispatch({ type: 'SKIP' });
  }, [dispatch]);

  const complete = useCallback(() => {
    dispatch({ type: 'COMPLETE' });
  }, [dispatch]);

  const replay = useCallback(() => {
    dispatch({ type: 'REPLAY' });
  }, [dispatch]);

  const suppressed = shouldSuppressOnboardingOverlay({
    status: state.status,
    step: state.step,
    directoryOpen,
    mobileMenuOpen,
    rewardModalOpen,
    desktopGuideModalOpen,
    npcChatOpen,
    isBoothFocusActive,
  });

  const guideSignal = useMemo(() => deriveGuideCharacterSignal(state), [state]);

  return {
    state,
    isVisible: !suppressed,
    highlightMapButton: state.status === 'in_progress' && state.step === 'explore_booth' && !suppressed,
    guideSignal,
    start,
    skip,
    complete,
    replay,
  };
}
