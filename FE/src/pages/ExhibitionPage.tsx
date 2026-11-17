import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type Booth,
  type Product,
  type BoothSlotAssignment,
  type BoothSlotView,
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
  FALLBACK_SLOT_ASSIGNMENTS,
  CENTRAL_SPAWN_POINT,
  getBoothApproachPoint,
  isPointWalkable,
} from '../types/expo';
import { ExhibitionScene, type CameraViewMode } from '../scene/ExhibitionScene';
import { useClickToMove, type PlayerTransform } from '../controls/useClickToMove';
import { MobileJoystick } from '../controls/MobileJoystick';
import { BoothPanel } from '../components/BoothPanel';
import { NpcAssistantPanel } from '../components/NpcAssistantPanel';
import { LoadingScreen } from '../components/LoadingScreen';
import { useRealtime } from '../hooks/useRealtime';
import {
  type NpcAnimationClipName,
  type NpcAudioRuntimeState,
  type NpcPresentationPlan,
  type NpcSessionStatus,
  buildBoothPresentationPlan,
  resolveVietnameseVoiceAsync,
  selectVietnameseVoice,
} from '../services/npcPresentationService';
import {
  apiClient,
  buildBoothSlotViews,
  EXPO_DATA_MUTATED_EVENT,
  EXPO_DATA_SYNC_CHANNEL,
  EXPO_DATA_UPDATED_STORAGE_KEY,
} from '../services/api';

const AVATAR_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
];

const OVERVIEW_DEFAULT_ZOOM = 18.5;
const EXPLORE_DEFAULT_ZOOM = 34;
const FOCUS_DEFAULT_ZOOM = 48;

function getStoredIdentity(): { name: string; color: string } {
  const savedName = sessionStorage.getItem('expo_visitor_name');
  const savedColor = sessionStorage.getItem('expo_visitor_color');
  if (savedName && savedColor) {
    return { name: savedName, color: savedColor };
  }
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const name = savedName || `Khách #${randomSuffix}`;
  const color = savedColor || AVATAR_COLORS[randomSuffix % AVATAR_COLORS.length];
  sessionStorage.setItem('expo_visitor_name', name);
  sessionStorage.setItem('expo_visitor_color', color);
  return { name, color };
}

function getInitialVisitorSpawn(): {
  x: number;
  z: number;
  rotationY: number;
  restored: boolean;
} {
  try {
    const raw = sessionStorage.getItem('expo_visitor_pos');
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: unknown; z?: unknown; rotationY?: unknown };
      if (
        typeof parsed.x === 'number' &&
        Number.isFinite(parsed.x) &&
        typeof parsed.z === 'number' &&
        Number.isFinite(parsed.z) &&
        isPointWalkable(parsed.x, parsed.z, DEFAULT_BOOTHS)
      ) {
        return {
          x: parsed.x,
          z: parsed.z,
          rotationY:
            typeof parsed.rotationY === 'number' && Number.isFinite(parsed.rotationY)
              ? parsed.rotationY
              : CENTRAL_SPAWN_POINT.rotationY,
          restored: true,
        };
      }
    }
  } catch {
    // Ignore storage read errors and fall back to Central Plaza spawn
  }
  return {
    x: CENTRAL_SPAWN_POINT.x,
    z: CENTRAL_SPAWN_POINT.z,
    rotationY: CENTRAL_SPAWN_POINT.rotationY,
    restored: false,
  };
}

export interface ExhibitionPageProps {
  initialFocusBoothId?: string | null;
  onOpenAdmin: () => void;
}

export const ExhibitionPage: React.FC<ExhibitionPageProps> = ({
  initialFocusBoothId = null,
  onOpenAdmin,
}) => {
  const initialIdentity = useMemo(() => getStoredIdentity(), []);
  const initialSpawn = useMemo(() => getInitialVisitorSpawn(), []);
  const hasLockedPositionRef = useRef<boolean>(initialSpawn.restored);
  const [playerName, setPlayerName] = useState(initialIdentity.name);
  const [playerColor, setPlayerColor] = useState(initialIdentity.color);

  const [booths, setBooths] = useState<Booth[]>(DEFAULT_BOOTHS);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [slotAssignments, setSlotAssignments] = useState<BoothSlotAssignment[]>(
    FALLBACK_SLOT_ASSIGNMENTS
  );
  const [loadingData, setLoadingData] = useState(true);
  const [dataWarning, setDataWarning] = useState<string | null>(null);

  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [focusedBooth, setFocusedBooth] = useState<Booth | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('explore');
  const previousExteriorModeRef = useRef<'overview' | 'explore'>('explore');
  const cameraYawRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(EXPLORE_DEFAULT_ZOOM);
  const [showHelp, setShowHelp] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(playerName);
  const [draftColor, setDraftColor] = useState(playerColor);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const pointerLockToggleRequestRef = useRef<(() => void) | null>(null);

  // NPC Sales Assistant Presentation State Machine & Speech Synthesis Refs
  const [npcPlan, setNpcPlan] = useState<NpcPresentationPlan | null>(null);
  const [npcStatus, setNpcStatus] = useState<NpcSessionStatus>('IDLE');
  const [npcAudioState, setNpcAudioState] = useState<NpcAudioRuntimeState>('IDLE');
  const [npcVoiceNotice, setNpcVoiceNotice] = useState<string | null>(null);
  const [npcStepIndex, setNpcStepIndex] = useState<number>(0);
  const [npcAnimation, setNpcAnimation] = useState<NpcAnimationClipName>('IDLE');
  const [npcMuted, setNpcMuted] = useState<boolean>(false);
  const [hasVietnameseVoice, setHasVietnameseVoice] = useState<boolean>(false);
  const npcMutedRef = useRef<boolean>(false);
  npcMutedRef.current = npcMuted;
  const utteranceTokenRef = useRef<number>(0);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const animTimerRef = useRef<number | null>(null);
  const voiceWatchdogTimerRef = useRef<number | null>(null);

  const cancelNpcAudioAndTimers = useCallback(() => {
    utteranceTokenRef.current += 1;
    if (ttsAbortControllerRef.current) {
      try {
        ttsAbortControllerRef.current.abort();
      } catch {
        // ignore abort errors
      }
      ttsAbortControllerRef.current = null;
    }
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (voiceWatchdogTimerRef.current !== null) {
      window.clearTimeout(voiceWatchdogTimerRef.current);
      voiceWatchdogTimerRef.current = null;
    }
    if (audioElementRef.current) {
      const audioEl = audioElementRef.current;
      audioEl.onplay = null;
      audioEl.onended = null;
      audioEl.onerror = null;
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      } catch {
        // ignore audio cleanup errors
      }
      audioElementRef.current = null;
    }
    if (activeObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      } catch {
        // ignore revokeObjectURL errors
      }
      activeObjectUrlRef.current = null;
    }
    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.onstart = null;
      activeUtteranceRef.current.onend = null;
      activeUtteranceRef.current.onerror = null;
      activeUtteranceRef.current = null;
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        if (synth.speaking || synth.pending || synth.paused) {
          synth.cancel();
        }
      }
    } catch {
      // Ignore speechSynthesis errors in restricted environments
    }
  }, []);

  const closeNpcSession = useCallback(() => {
    cancelNpcAudioAndTimers();
    setNpcPlan(null);
    setNpcStatus('IDLE');
    setNpcAudioState('IDLE');
    setNpcVoiceNotice(null);
    setNpcStepIndex(0);
    setNpcAnimation('IDLE');
  }, [cancelNpcAudioAndTimers]);

  // Detect Vietnamese voice support (`vi-VN` / `vi`)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const syncVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        setHasVietnameseVoice(Boolean(selectVietnameseVoice(voices)));
      } catch {
        setHasVietnameseVoice(false);
      }
    };
    syncVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', syncVoices);
    };
  }, []);

  // Ensure speech & timers are always stopped on unmount
  useEffect(() => {
    return () => {
      cancelNpcAudioAndTimers();
    };
  }, [cancelNpcAudioAndTimers]);

  const nameInputId = useId();
  const boothSelectId = useId();

  const lastSilentRefreshAtRef = useRef<number>(0);
  const isSilentRefreshingFlagRef = useRef<boolean>(false);
  const pendingSocketRefreshRef = useRef<boolean>(false);
  const socketDebounceTimerRef = useRef<number | null>(null);

  const loadExpoData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [fetchedBooths, fetchedProducts, fetchedSlots] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
        apiClient.getSlots().catch(() => ({
          slotDefinitions: [],
          assignments: FALLBACK_SLOT_ASSIGNMENTS,
        })),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      setDataWarning(null);
      lastSilentRefreshAtRef.current = Date.now();
    } catch {
      setBooths(DEFAULT_BOOTHS);
      setProducts(DEFAULT_PRODUCTS);
      setSlotAssignments(FALLBACK_SLOT_ASSIGNMENTS);
      setDataWarning('Đang hiển thị dữ liệu mẫu cục bộ (Chưa kết nối được API Backend).');
    } finally {
      setLoadingData(false);
    }
  }, []);

  const refreshExpoDataSilently = useCallback(async (force = false) => {
    const now = Date.now();
    if (isSilentRefreshingFlagRef.current) {
      if (force) pendingSocketRefreshRef.current = true;
      return;
    }
    if (!force && now - lastSilentRefreshAtRef.current < 4000) return;

    isSilentRefreshingFlagRef.current = true;
    lastSilentRefreshAtRef.current = now;
    try {
      const [fetchedBooths, fetchedProducts, fetchedSlots] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
        apiClient.getSlots(),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      setDataWarning(null);
    } catch {
      // Keep current in-memory state if background refresh encounters transient network error
    } finally {
      isSilentRefreshingFlagRef.current = false;
      if (pendingSocketRefreshRef.current) {
        pendingSocketRefreshRef.current = false;
        void refreshExpoDataSilently(true);
      }
    }
  }, []);

  const handleRealtimeDataUpdated = useCallback(() => {
    if (socketDebounceTimerRef.current) {
      window.clearTimeout(socketDebounceTimerRef.current);
    }
    socketDebounceTimerRef.current = window.setTimeout(() => {
      socketDebounceTimerRef.current = null;
      void refreshExpoDataSilently(true);
    }, 120);
  }, [refreshExpoDataSilently]);

  useEffect(() => {
    return () => {
      if (socketDebounceTimerRef.current) {
        window.clearTimeout(socketDebounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void loadExpoData();
  }, [loadExpoData]);

  // Keep selectedBooth, focusedBooth, and selectedProduct synchronized whenever
  // booths or products state refreshes so the 3D scene & panels never hold stale snapshots.
  useEffect(() => {
    setSelectedBooth((prev) => (prev ? booths.find((b) => b.id === prev.id) ?? null : null));
    setFocusedBooth((prev) => (prev ? booths.find((b) => b.id === prev.id) ?? null : null));
  }, [booths]);

  useEffect(() => {
    setSelectedProduct((prev) => (prev ? products.find((p) => p.id === prev.id) ?? null : null));
  }, [products]);

  // Listen for window focus, visibility change, and cross-tab BroadcastChannel/storage events
  // so edits made in Admin (in another tab or window) immediately sync to the 3D visitor view.
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshExpoDataSilently(false);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === EXPO_DATA_UPDATED_STORAGE_KEY) {
        void refreshExpoDataSilently(true);
      }
    };
    const handleCustomMutated = () => {
      void refreshExpoDataSilently(true);
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(EXPO_DATA_MUTATED_EVENT, handleCustomMutated);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(EXPO_DATA_SYNC_CHANNEL);
        bc.onmessage = () => {
          void refreshExpoDataSilently(true);
        };
      }
    } catch {
      bc = null;
    }

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EXPO_DATA_MUTATED_EVENT, handleCustomMutated);
      bc?.close();
    };
  }, [refreshExpoDataSilently]);

  const handleSelectBooth = useCallback(
    (booth: Booth) => {
      if (npcPlan && npcPlan.booth.id !== booth.id) {
        closeNpcSession();
      }
      setCameraMode((prev) => {
        if (prev === 'overview' || prev === 'explore') {
          previousExteriorModeRef.current = prev;
        }
        return 'focus';
      });
      const latestBooth = booths.find((b) => b.id === booth.id) || booth;
      setSelectedBooth(latestBooth);
      setSelectedProduct(null);
      setFocusedBooth(latestBooth);
      setZoom(FOCUS_DEFAULT_ZOOM);
      void refreshExpoDataSilently();
    },
    [booths, closeNpcSession, npcPlan, refreshExpoDataSilently]
  );

  useEffect(() => {
    if (!initialFocusBoothId || loadingData) return;
    const targetBooth = booths.find((b) => b.id === initialFocusBoothId);
    if (targetBooth) {
      handleSelectBooth(targetBooth);
    }
  }, [initialFocusBoothId, loadingData, booths, handleSelectBooth]);

  const handleReachBooth = useCallback(
    (booth: Booth) => {
      setCameraMode((prev) => {
        if (prev === 'overview' || prev === 'explore') {
          previousExteriorModeRef.current = prev;
        }
        return 'focus';
      });
      const latestBooth = booths.find((b) => b.id === booth.id) || booth;
      setSelectedBooth(latestBooth);
      setSelectedProduct(null);
      setFocusedBooth(latestBooth);
      setZoom(FOCUS_DEFAULT_ZOOM);
      void refreshExpoDataSilently();
    },
    [booths, refreshExpoDataSilently]
  );

  const emitMovementRef = useRef<
    ((payload: {
      x: number;
      z: number;
      rotationY: number;
      state: 'idle' | 'walk';
      activeBoothId?: string | null;
    }) => void) | null
  >(null);

  const handleTransformChange = useCallback(
    (nextTransform: PlayerTransform) => {
      hasLockedPositionRef.current = true;
      if (nextTransform.state === 'idle') {
        try {
          sessionStorage.setItem(
            'expo_visitor_pos',
            JSON.stringify({
              x: nextTransform.x,
              z: nextTransform.z,
              rotationY: nextTransform.rotationY,
            })
          );
        } catch {
          // Ignore storage quota errors
        }
      }
      emitMovementRef.current?.({
        x: nextTransform.x,
        z: nextTransform.z,
        rotationY: nextTransform.rotationY,
        state: nextTransform.state,
        activeBoothId: selectedBooth?.id ?? null,
      });
    },
    [selectedBooth?.id]
  );

  const {
    transformRef,
    activePath,
    moveToPoint,
    setJoystickInput,
    forcePosition,
    stepMovement,
  } = useClickToMove({
    booths,
    initialPosition: initialSpawn,
    disabled: false,
    cameraYawRef,
    onTransformChange: handleTransformChange,
    onReachBooth: handleReachBooth,
  });

  const {
    isConnected,
    onlineCount,
    remoteVisitors,
    remoteVisitorsLiveRef,
    emitMovement,
    emitProfileUpdate,
  } = useRealtime({
    initialName: initialIdentity.name,
    initialColor: initialIdentity.color,
    getLiveTransform: () =>
      hasLockedPositionRef.current
        ? {
            x: transformRef.current.x,
            z: transformRef.current.z,
            rotationY: transformRef.current.rotationY,
          }
        : null,
    onWorldInitSelf: (self) => {
      if (!hasLockedPositionRef.current) {
        hasLockedPositionRef.current = true;
        transformRef.current.x = self.x;
        transformRef.current.z = self.z;
        transformRef.current.rotationY = self.rotationY;
      }
    },
    onMoveRejected: (x, z) => {
      forcePosition(x, z);
    },
    onDataUpdated: handleRealtimeDataUpdated,
  });

  emitMovementRef.current = emitMovement;

  const handleReturnToExplore = useCallback(() => {
    closeNpcSession();
    const restoredMode = previousExteriorModeRef.current;
    setCameraMode(restoredMode);
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(restoredMode === 'overview' ? OVERVIEW_DEFAULT_ZOOM : EXPLORE_DEFAULT_ZOOM);
  }, [closeNpcSession]);

  const handleSwitchToOverview = useCallback(() => {
    closeNpcSession();
    previousExteriorModeRef.current = 'overview';
    setCameraMode('overview');
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(OVERVIEW_DEFAULT_ZOOM);
  }, [closeNpcSession]);

  const handleSwitchToExplore = useCallback(() => {
    closeNpcSession();
    previousExteriorModeRef.current = 'explore';
    setCameraMode('explore');
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(EXPLORE_DEFAULT_ZOOM);
  }, [closeNpcSession]);

  // Consistent WASD / Arrow behavior during Booth Focus Mode:
  // Pressing movement keys automatically exits Booth Focus back to Explore Mode
  // so camera follow and character movement resume seamlessly.
  useEffect(() => {
    if (cameraMode !== 'focus') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        closeNpcSession();
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cameraMode, closeNpcSession]);

  const handleJoystickMove = useCallback(
    (dx: number, dz: number) => {
      if ((dx !== 0 || dz !== 0) && cameraMode === 'focus') {
        closeNpcSession();
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
      }
      setJoystickInput(dx, dz);
    },
    [cameraMode, closeNpcSession, setJoystickInput]
  );

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftName.trim().slice(0, 32);
    if (cleaned) {
      setPlayerName(cleaned);
      sessionStorage.setItem('expo_visitor_name', cleaned);
      setPlayerColor(draftColor);
      sessionStorage.setItem('expo_visitor_color', draftColor);
      emitProfileUpdate(cleaned, draftColor);
    }
    setEditingProfile(false);
  };

  const handleWalkToBooth = useCallback(
    (booth: Booth) => {
      setSelectedBooth(null);
      setFocusedBooth(booth);
      setCameraMode('explore');
      setZoom(EXPLORE_DEFAULT_ZOOM);
      const approach = getBoothApproachPoint(booth);
      moveToPoint(approach.x, approach.z, booth);
    },
    [moveToPoint]
  );

  const handleGroundClick = useCallback(
    (x: number, z: number) => {
      if (cameraMode === 'focus') {
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
        return;
      }
      moveToPoint(x, z);
    },
    [cameraMode, moveToPoint]
  );

  const slotsByBooth = useMemo<Record<string, BoothSlotView[]>>(() => {
    const map: Record<string, BoothSlotView[]> = {};
    for (const b of booths) {
      map[b.id] = buildBoothSlotViews(b.id, products, slotAssignments);
    }
    return map;
  }, [booths, products, slotAssignments]);

  const productCountByBooth = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of booths) {
      const occupied = (slotsByBooth[b.id] || []).filter((s) => Boolean(s.product)).length;
      const totalBoothProds = products.filter((p) => p.boothId === b.id).length;
      counts[b.id] = occupied > 0 ? occupied : totalBoothProds;
    }
    return counts;
  }, [booths, products, slotsByBooth]);

  const playNpcStep = useCallback(
    (plan: NpcPresentationPlan, stepIdx: number, mutedOverride?: boolean) => {
      cancelNpcAudioAndTimers();
      const token = utteranceTokenRef.current;

      if (stepIdx < 0 || stepIdx >= plan.steps.length) {
        setNpcStatus('COMPLETED');
        setNpcAudioState('IDLE');
        setNpcAnimation('IDLE');
        return;
      }

      const step = plan.steps[stepIdx];
      setNpcStepIndex(stepIdx);
      setNpcStatus(stepIdx === 0 ? 'GREETING' : 'PRESENTING');

      const readingDurationMs = Math.min(9000, Math.max(3600, step.text.length * 52));
      const effectiveMuted = mutedOverride !== undefined ? mutedOverride : npcMutedRef.current;

      const triggerActiveStepAnimation = () => {
        if (utteranceTokenRef.current !== token) return;
        const initialAnim: NpcAnimationClipName =
          step.type === 'PRODUCT' ? 'PRESENT' : 'WAVE';
        setNpcAnimation(initialAnim);
        if (animTimerRef.current !== null) {
          window.clearTimeout(animTimerRef.current);
        }
        animTimerRef.current = window.setTimeout(() => {
          if (utteranceTokenRef.current === token) {
            setNpcAnimation('TALKING');
          }
        }, step.type === 'PRODUCT' ? 1600 : 1350);
      };

      const advanceToNext = () => {
        if (utteranceTokenRef.current !== token) return;
        if (stepIdx + 1 < plan.steps.length) {
          playNpcStep(plan, stepIdx + 1);
        } else {
          setNpcStatus('COMPLETED');
          setNpcAudioState('IDLE');
          setNpcAnimation('IDLE');
        }
      };

      if (effectiveMuted) {
        setNpcAudioState('MUTED');
        triggerActiveStepAnimation();
        stepTimerRef.current = window.setTimeout(advanceToNext, readingDurationMs);
        return;
      }

      // Fallback helper: Only uses Web Speech API if a genuine Vietnamese (`vi-VN` / `vi`) voice exists;
      // otherwise enters Subtitle-Only Mode with the clear reason message.
      const runFallbackOrSubtitleMode = (backendErrorNotice: string) => {
        if (utteranceTokenRef.current !== token) return;
        triggerActiveStepAnimation();

        const startLocalViVoiceOrSubtitles = (viVoice: SpeechSynthesisVoice | null) => {
          if (utteranceTokenRef.current !== token) return;

          if (!viVoice) {
            setHasVietnameseVoice(false);
            setNpcAudioState('NO_VI_VOICE');
            setNpcVoiceNotice(backendErrorNotice);
            stepTimerRef.current = window.setTimeout(advanceToNext, readingDurationMs);
            return;
          }

          setHasVietnameseVoice(true);
          try {
            const synth = window.speechSynthesis;
            if (synth.paused) {
              synth.resume();
            }
            const utterance = new SpeechSynthesisUtterance(step.text);
            activeUtteranceRef.current = utterance;
            try {
              utterance.voice = viVoice;
            } catch {
              // Allow non-native SpeechSynthesisVoice wrappers while preserving lang
            }
            utterance.lang = viVoice.lang || 'vi-VN';
            utterance.volume = 1.0;
            utterance.rate = 0.96;
            utterance.pitch = 1.02;

            utterance.onstart = () => {
              if (utteranceTokenRef.current !== token) return;
              if (voiceWatchdogTimerRef.current !== null) {
                window.clearTimeout(voiceWatchdogTimerRef.current);
                voiceWatchdogTimerRef.current = null;
              }
              setNpcAudioState('SPEAKING');
              setNpcVoiceNotice(`${viVoice.name} (${viVoice.lang})`);
              if (stepTimerRef.current !== null) {
                window.clearTimeout(stepTimerRef.current);
              }
              const maxSpeechSafetyMs = Math.max(28000, step.text.length * 165);
              stepTimerRef.current = window.setTimeout(advanceToNext, maxSpeechSafetyMs);
            };

            utterance.onend = () => {
              if (utteranceTokenRef.current !== token) return;
              activeUtteranceRef.current = null;
              if (voiceWatchdogTimerRef.current !== null) {
                window.clearTimeout(voiceWatchdogTimerRef.current);
                voiceWatchdogTimerRef.current = null;
              }
              if (stepTimerRef.current !== null) {
                window.clearTimeout(stepTimerRef.current);
              }
              stepTimerRef.current = window.setTimeout(advanceToNext, 420);
            };

            utterance.onerror = (ev) => {
              if (utteranceTokenRef.current !== token) return;
              activeUtteranceRef.current = null;
              const errCode = (ev as SpeechSynthesisErrorEvent)?.error || 'speech-error';
              if (errCode === 'canceled' || errCode === 'interrupted') return;
              setNpcAudioState('AUDIO_ERROR');
              setNpcVoiceNotice(backendErrorNotice);
              if (stepTimerRef.current === null) {
                stepTimerRef.current = window.setTimeout(advanceToNext, readingDurationMs);
              }
            };

            stepTimerRef.current = window.setTimeout(advanceToNext, readingDurationMs);
            synth.speak(utterance);
          } catch {
            setNpcAudioState('AUDIO_ERROR');
            setNpcVoiceNotice(backendErrorNotice);
            stepTimerRef.current = window.setTimeout(advanceToNext, readingDurationMs);
          }
        };

        if (
          typeof window !== 'undefined' &&
          'speechSynthesis' in window &&
          typeof SpeechSynthesisUtterance !== 'undefined'
        ) {
          let immediateVoices: SpeechSynthesisVoice[] = [];
          try {
            immediateVoices = window.speechSynthesis.getVoices() || [];
          } catch {
            immediateVoices = [];
          }
          if (immediateVoices.length > 0) {
            startLocalViVoiceOrSubtitles(selectVietnameseVoice(immediateVoices));
          } else {
            void resolveVietnameseVoiceAsync(500).then((res) => {
              startLocalViVoiceOrSubtitles(res.voice);
            });
          }
        } else {
          startLocalViVoiceOrSubtitles(null);
        }
      };

      // Primary Path: Backend Vietnamese Female TTS (`POST /api/npc/tts`) -> HTMLAudioElement
      // Phase 5: While loading audio, NPC remains in waiting state (`IDLE` animation, `CHECKING_VOICE`)
      setNpcAudioState('CHECKING_VOICE');
      setNpcVoiceNotice('Đang tải âm thanh giọng nữ Tiếng Việt từ máy chủ...');
      setNpcAnimation('IDLE');

      const abortController = new AbortController();
      ttsAbortControllerRef.current = abortController;

      void apiClient
        .synthesizeNpcSpeech(
          {
            boothId: plan.booth.id,
            stepType: step.type,
            slotId: step.slotId,
            productId: step.product?.id ?? null,
          },
          abortController.signal
        )
        .then(async (ttsResult) => {
          if (utteranceTokenRef.current !== token) return;
          ttsAbortControllerRef.current = null;

          const objectUrl = URL.createObjectURL(ttsResult.blob);
          activeObjectUrlRef.current = objectUrl;

          const audio = new Audio(objectUrl);
          audio.preload = 'auto';
          audio.volume = 1.0;
          audio.playbackRate = 1.0;
          audio.defaultPlaybackRate = 1.0;
          (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
          audio.muted = npcMutedRef.current;
          audioElementRef.current = audio;

          const voiceLabel = `Giọng nữ Tiếng Việt (${ttsResult.provider.toUpperCase()} · ${ttsResult.voice})`;

          audio.onplay = () => {
            if (utteranceTokenRef.current !== token) return;
            setHasVietnameseVoice(true);
            setNpcAudioState(npcMutedRef.current ? 'MUTED' : 'SPEAKING');
            setNpcVoiceNotice(voiceLabel);
            triggerActiveStepAnimation();
          };

          audio.onended = () => {
            if (utteranceTokenRef.current !== token) return;
            if (stepTimerRef.current !== null) {
              window.clearTimeout(stepTimerRef.current);
            }
            stepTimerRef.current = window.setTimeout(advanceToNext, 380);
          };

          audio.onerror = () => {
            if (utteranceTokenRef.current !== token) return;
            runFallbackOrSubtitleMode(
              'Không thể giải mã dữ liệu âm thanh trình duyệt — Đang hiển thị phụ đề tiếng Việt.'
            );
          };

          try {
            await audio.play();
          } catch (playErr) {
            if (utteranceTokenRef.current !== token) return;
            const errName = (playErr as Error)?.name || '';
            const msg =
              errName === 'NotAllowedError'
                ? 'Trình duyệt chặn tự động phát âm thanh — Hãy nhấn "🔄 Thử lại âm thanh" để nghe.'
                : 'Không thể phát âm thanh trên trình duyệt — Đang hiển thị phụ đề tiếng Việt.';
            runFallbackOrSubtitleMode(msg);
          }
        })
        .catch((err: Error & { code?: string }) => {
          if (utteranceTokenRef.current !== token) return;
          if (err?.name === 'AbortError') return;
          ttsAbortControllerRef.current = null;
          runFallbackOrSubtitleMode(
            err?.message ||
              'Dịch vụ giọng đọc đám mây hiện chưa khả dụng — Đang hiển thị phụ đề tiếng Việt.'
          );
        });
    },
    [cancelNpcAudioAndTimers]
  );

  const handleActivateNpc = useCallback(
    (booth: Booth) => {
      const latestBooth = booths.find((b) => b.id === booth.id) || booth;
      setCameraMode((prev) => {
        if (prev === 'overview' || prev === 'explore') {
          previousExteriorModeRef.current = prev;
        }
        return 'focus';
      });
      setSelectedBooth(latestBooth);
      setFocusedBooth(latestBooth);
      setSelectedProduct(null);
      setZoom(FOCUS_DEFAULT_ZOOM);

      const plan = buildBoothPresentationPlan(
        latestBooth,
        slotsByBooth[latestBooth.id],
        products
      );
      setNpcPlan(plan);
      playNpcStep(plan, 0);
    },
    [booths, playNpcStep, products, slotsByBooth]
  );

  const handleNpcPause = useCallback(() => {
    if (!npcPlan) return;
    if (ttsAbortControllerRef.current) {
      try {
        ttsAbortControllerRef.current.abort();
      } catch {
        // ignore
      }
      ttsAbortControllerRef.current = null;
    }
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (voiceWatchdogTimerRef.current !== null) {
      window.clearTimeout(voiceWatchdogTimerRef.current);
      voiceWatchdogTimerRef.current = null;
    }
    if (audioElementRef.current && !audioElementRef.current.paused) {
      try {
        audioElementRef.current.pause();
      } catch {
        // ignore
      }
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
        }
      }
    } catch {
      // Ignore pause errors
    }
    setNpcStatus('PAUSED');
    setNpcAudioState('PAUSED');
    setNpcAnimation('IDLE');
  }, [npcPlan]);

  const handleNpcResume = useCallback(() => {
    if (!npcPlan) return;
    // 1. If HTMLAudioElement is paused mid-clip, resume directly from current timestamp
    if (
      audioElementRef.current &&
      audioElementRef.current.paused &&
      !audioElementRef.current.ended &&
      audioElementRef.current.currentTime > 0
    ) {
      setNpcStatus(npcStepIndex === 0 ? 'GREETING' : 'PRESENTING');
      setNpcAudioState(npcMutedRef.current ? 'MUTED' : 'SPEAKING');
      setNpcAnimation('TALKING');
      void audioElementRef.current.play().catch(() => {
        playNpcStep(npcPlan, npcStepIndex);
      });
      return;
    }

    // 2. If fallback Web Speech API is paused mid-utterance, resume it
    try {
      if (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.paused &&
        window.speechSynthesis.speaking &&
        activeUtteranceRef.current
      ) {
        window.speechSynthesis.resume();
        const token = utteranceTokenRef.current;
        const step = npcPlan.steps[npcStepIndex];
        setNpcStatus(npcStepIndex === 0 ? 'GREETING' : 'PRESENTING');
        setNpcAudioState('SPEAKING');
        setNpcAnimation('TALKING');
        const safetyMs = Math.max(20000, (step?.text.length || 80) * 150);
        stepTimerRef.current = window.setTimeout(() => {
          if (utteranceTokenRef.current !== token) return;
          if (npcStepIndex + 1 < npcPlan.steps.length) {
            playNpcStep(npcPlan, npcStepIndex + 1);
          } else {
            setNpcStatus('COMPLETED');
            setNpcAudioState('IDLE');
            setNpcAnimation('IDLE');
          }
        }, safetyMs);
        return;
      }
    } catch {
      // Fall back to replaying current step cleanly
    }

    playNpcStep(npcPlan, npcStepIndex);
  }, [npcPlan, npcStepIndex, playNpcStep]);

  const handleNpcRetryAudio = useCallback(() => {
    if (!npcPlan) return;
    if (npcMutedRef.current) {
      npcMutedRef.current = false;
      setNpcMuted(false);
    }
    playNpcStep(npcPlan, npcStepIndex, false);
  }, [npcPlan, npcStepIndex, playNpcStep]);

  const handleNpcPrevious = useCallback(() => {
    if (!npcPlan || npcStepIndex <= 0) return;
    playNpcStep(npcPlan, npcStepIndex - 1);
  }, [npcPlan, npcStepIndex, playNpcStep]);

  const handleNpcNext = useCallback(() => {
    if (!npcPlan || npcStepIndex >= npcPlan.steps.length - 1) return;
    playNpcStep(npcPlan, npcStepIndex + 1);
  }, [npcPlan, npcStepIndex, playNpcStep]);

  const handleNpcStop = useCallback(() => {
    cancelNpcAudioAndTimers();
    setNpcStatus('CANCELLED');
    setNpcAudioState('IDLE');
    setNpcAnimation('IDLE');
  }, [cancelNpcAudioAndTimers]);

  const handleNpcRestart = useCallback(() => {
    if (!npcPlan) return;
    const latestBooth = booths.find((b) => b.id === npcPlan.booth.id) || npcPlan.booth;
    const refreshedPlan = buildBoothPresentationPlan(
      latestBooth,
      slotsByBooth[latestBooth.id],
      products
    );
    setNpcPlan(refreshedPlan);
    playNpcStep(refreshedPlan, 0);
  }, [booths, npcPlan, playNpcStep, products, slotsByBooth]);

  const handleNpcToggleMute = useCallback(() => {
    const nextMuted = !npcMutedRef.current;
    npcMutedRef.current = nextMuted;
    setNpcMuted(nextMuted);

    // If HTMLAudioElement is currently playing, toggle its .muted property in real time without restarting!
    if (
      audioElementRef.current &&
      !audioElementRef.current.paused &&
      !audioElementRef.current.ended
    ) {
      audioElementRef.current.muted = nextMuted;
      setNpcAudioState(nextMuted ? 'MUTED' : 'SPEAKING');
      return;
    }

    if (nextMuted) {
      setNpcAudioState('MUTED');
    }
    if (npcPlan && (npcStatus === 'GREETING' || npcStatus === 'PRESENTING')) {
      playNpcStep(npcPlan, npcStepIndex, nextMuted);
    }
  }, [npcPlan, npcStatus, npcStepIndex, playNpcStep]);

  const currentNpcStep =
    npcPlan && npcStatus !== 'IDLE'
      ? npcPlan.steps[Math.min(Math.max(0, npcStepIndex), npcPlan.steps.length - 1)]
      : null;
  const npcHighlightedProductId =
    npcStatus === 'GREETING' || npcStatus === 'PRESENTING' || npcStatus === 'PAUSED'
      ? currentNpcStep?.product?.id ?? null
      : null;

  const handleSelectSlotProduct = useCallback(
    (product: Product | null) => {
      if (!product) {
        setSelectedProduct(null);
        return;
      }
      if (npcPlan && (npcStatus === 'GREETING' || npcStatus === 'PRESENTING')) {
        handleNpcPause();
      }
      const ownerBooth = booths.find((b) => b.id === product.boothId) || selectedBooth;
      if (ownerBooth && selectedBooth?.id !== ownerBooth.id) {
        setSelectedBooth(ownerBooth);
        setFocusedBooth(ownerBooth);
        setCameraMode('focus');
        setZoom(FOCUS_DEFAULT_ZOOM);
      }
      setSelectedProduct(product);
    },
    [booths, handleNpcPause, npcPlan, npcStatus, selectedBooth]
  );

  const activeBoothProducts = useMemo(() => {
    const targetId = selectedBooth?.id || focusedBooth?.id;
    if (!targetId) return [];
    return products.filter((p) => p.boothId === targetId);
  }, [products, selectedBooth?.id, focusedBooth?.id]);

  const playerDescriptor = useMemo(
    () => ({
      name: playerName,
      color: playerColor,
      x: transformRef.current.x,
      z: transformRef.current.z,
      rotationY: transformRef.current.rotationY,
      state: transformRef.current.state,
    }),
    [playerName, playerColor, transformRef]
  );

  const isBoothShowcaseActive = cameraMode === 'focus' && Boolean(selectedBooth || focusedBooth);
  const isPointerLockBlocked = Boolean(
    cameraMode !== 'explore' ||
      selectedProduct ||
      editingProfile ||
      (npcPlan && npcStatus !== 'IDLE')
  );

  const handleOpenAdminSafe = useCallback(() => {
    try {
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    } catch {
      // ignore
    }
    onOpenAdmin();
  }, [onOpenAdmin]);

  return (
    <main className="expo-viewport">
      {/* Top Bar HUD — Hidden during close-up Booth Showcase mode */}
      {!isBoothShowcaseActive && (
        <header className="expo-hud-top">
          <div className="expo-hud-top__brand">
            <div className="expo-hud-top__logo">3D</div>
            <div>
              <h1 className="expo-hud-top__title">Virtual Expo Plaza</h1>
              <div className="expo-hud-top__status">
                <span
                  className={`status-dot ${
                    isConnected ? 'status-dot--online' : 'status-dot--offline'
                  }`}
                />
                <span>
                  {isConnected
                    ? `${onlineCount} khách đang trực tuyến`
                    : 'Chế độ ngoại tuyến / Đang kết nối...'}
                </span>
              </div>
            </div>
          </div>

          <div className="expo-hud-top__nav">
            <div className="hud-booth-picker">
              <label htmlFor={boothSelectId} className="visually-hidden">
                Chọn gian hàng để di chuyển tới
              </label>
              <select
                id={boothSelectId}
                name="boothQuickNav"
                className="hud-select"
                defaultValue=""
                onChange={(e) => {
                  const booth = booths.find((b) => b.id === e.target.value);
                  if (booth) {
                    handleWalkToBooth(booth);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>
                  📍 Đi nhanh tới gian hàng ({booths.length})...
                </option>
                {booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.category}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setDraftName(playerName);
                setDraftColor(playerColor);
                setEditingProfile((v) => !v);
              }}
            >
              <span className="avatar-dot" style={{ backgroundColor: playerColor }} />
              {playerName} ✎
            </button>

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
            >
              ❓ Hướng dẫn
            </button>

            <button type="button" className="btn btn--primary btn--sm" onClick={handleOpenAdminSafe}>
              ⚙️ Quản trị (Dashboard)
            </button>
          </div>
        </header>
      )}

      {/* Profile Editor Popover */}
      {!isBoothShowcaseActive && editingProfile && (
        <div className="hud-profile-card" role="region" aria-label="Đổi tên và màu nhân vật">
          <form onSubmit={handleProfileSubmit} className="hud-profile-form">
            <div className="form-field">
              <label htmlFor={nameInputId}>Tên hiển thị của bạn (1–32 ký tự)</label>
              <input
                id={nameInputId}
                name="visitorName"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                minLength={1}
                maxLength={32}
                required
                autoComplete="nickname"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>

            <fieldset className="color-picker-fieldset">
              <legend>Màu nhận diện nhân vật</legend>
              <div className="color-swatches">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${draftColor === c ? 'color-swatch--selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setDraftColor(c)}
                    aria-label={`Chọn màu ${c}`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="hud-profile-form__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setEditingProfile(false)}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn--primary btn--sm">
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Hybrid Camera Controls & Booth Directory Mini Dock — Hidden during Booth Showcase mode */}
      {!isBoothShowcaseActive && (
        <aside
          className={`expo-hud-dock ${selectedBooth ? 'expo-hud-dock--panel-open' : ''}`}
          aria-label="Điều khiển góc nhìn camera và danh sách gian hàng"
        >
          <div className="camera-mode-bar" role="group" aria-label="Chế độ góc nhìn Camera">
            <button
              type="button"
              className={`camera-mode-btn ${
                cameraMode === 'overview' ? 'camera-mode-btn--active' : ''
              }`}
              onClick={handleSwitchToOverview}
              aria-pressed={cameraMode === 'overview'}
              title="Nhìn tổng thể toàn bộ khu triển lãm 6 gian hàng"
            >
              🌐 Toàn cảnh
            </button>

            <button
              type="button"
              className={`camera-mode-btn ${
                cameraMode === 'explore' ? 'camera-mode-btn--active' : ''
              }`}
              onClick={handleSwitchToExplore}
              aria-pressed={cameraMode === 'explore'}
              title="Camera góc nhìn thứ 3 (Third-person) đi theo sau nhân vật"
            >
              🚶 Tham quan
            </button>

            {cameraMode === 'explore' && (
              <button
                type="button"
                className={`camera-mode-btn camera-mode-btn--pointer-lock ${
                  isPointerLocked ? 'camera-mode-btn--active' : ''
                }`}
                onClick={() => pointerLockToggleRequestRef.current?.()}
                aria-pressed={isPointerLocked}
                title={
                  isPointerLocked
                    ? 'Đang khóa con trỏ chuột kiểu game 3D — Nhấn phím Esc để thoát'
                    : 'Khóa chuột góc nhìn 3D: Rê chuột tự do để xoay camera 360° không cần giữ nút chuột (Nhấn Esc để thoát)'
                }
              >
                {isPointerLocked ? '🎯 Đang khóa chuột (Esc)' : '🎯 Khóa chuột 3D'}
              </button>
            )}

            <div className="zoom-controls">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.min(60, z + 4))}
                title="Phóng to góc nhìn"
                aria-label="Phóng to góc nhìn"
              >
                ＋
              </button>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.max(14, z - 4))}
                title="Thu nhỏ góc nhìn"
                aria-label="Thu nhỏ góc nhìn"
              >
                －
              </button>
            </div>
          </div>

          <div className="booth-mini-list">
            <span className="booth-mini-list__title">
              Gian hàng nổi bật (Bấm để xem cận cảnh)
            </span>
            <div className="booth-mini-list__chips">
              {booths.map((booth) => {
                const isFocused =
                  selectedBooth?.id === booth.id ||
                  (cameraMode === 'focus' && focusedBooth?.id === booth.id);
                return (
                  <button
                    key={booth.id}
                    type="button"
                    className={`booth-chip ${isFocused ? 'booth-chip--active' : ''}`}
                    onClick={() => handleSelectBooth(booth)}
                    title={`Tập trung camera và xem sản phẩm tại ${booth.name}`}
                  >
                    <span className="booth-chip__dot" style={{ backgroundColor: booth.color }} />
                    <span className="booth-chip__name">{booth.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* Onboarding Controls Guide — Hidden during Booth Showcase mode */}
      {!isBoothShowcaseActive && showHelp && (
        <aside className="expo-help-card" aria-label="Hướng dẫn điều khiển">
          <div className="expo-help-card__header">
            <strong>🎮 Hướng dẫn tham quan triển lãm</strong>
            <button
              type="button"
              className="expo-help-card__close"
              onClick={() => setShowHelp(false)}
              aria-label="Ẩn hướng dẫn"
            >
              ✕
            </button>
          </div>
          <ul className="expo-help-card__list">
            <li>
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> hoặc <strong>Phím mũi tên</strong>: Di chuyển nhân vật theo hướng nhìn camera.
            </li>
            <li>
              <strong>Click vào khung cảnh 3D</strong> hoặc bấm <strong>🎯 Khóa chuột 3D</strong> (PC): Rê chuột tự do để xoay góc nhìn 360° kiểu game 3D mà không cần giữ nút chuột (<kbd>Esc</kbd> để hiện lại con trỏ); hoặc <strong>Vuốt màn hình</strong> trên điện thoại.
            </li>
            <li>
              <strong>Joystick cảm ứng</strong> (Góc dưới trái): Di chuyển nhân vật trên điện thoại/máy tính bảng (hỗ trợ vừa đi vừa vuốt xoay góc nhìn).
            </li>
            <li>
              <strong>3 chế độ Camera</strong>: Chọn <em>Toàn cảnh</em> (Isometric 2.5D — hỗ trợ click sàn tìm đường A*), <em>Tham quan</em> (Third-person theo nhân vật), hoặc <em>Click vào Gian hàng</em> để xem cận cảnh sản phẩm.
            </li>
          </ul>
        </aside>
      )}

      {!isBoothShowcaseActive && cameraMode === 'explore' && isPointerLocked && (
        <div className="pointer-lock-status-pill" role="status" aria-live="polite">
          🎯 Đang bật góc nhìn chuột 3D — Rê chuột để xoay camera · Nhấn <kbd>Esc</kbd> để hiện con trỏ
        </div>
      )}

      <LoadingScreen loading={loadingData} warningMessage={dataWarning} />

      <ExhibitionScene
        booths={booths}
        productCountByBooth={productCountByBooth}
        slotsByBooth={slotsByBooth}
        activeBoothProducts={activeBoothProducts}
        selectedProductId={selectedProduct?.id ?? null}
        npcHighlightedProductId={npcHighlightedProductId}
        activeNpcBoothId={npcPlan && npcStatus !== 'IDLE' ? npcPlan.booth.id : null}
        activeNpcAnimation={npcAnimation}
        onActivateNpc={handleActivateNpc}
        onSelectProduct={handleSelectSlotProduct}
        player={playerDescriptor}
        playerTransformRef={transformRef}
        cameraYawRef={cameraYawRef}
        onStepMovement={stepMovement}
        remoteVisitors={remoteVisitors}
        remoteVisitorsLiveRef={remoteVisitorsLiveRef}
        activePath={activePath}
        selectedBoothId={selectedBooth?.id ?? null}
        focusedBooth={focusedBooth}
        cameraMode={cameraMode}
        onSelectBooth={handleSelectBooth}
        onGroundClick={handleGroundClick}
        zoom={zoom}
        onZoomChange={setZoom}
        isPointerLockBlocked={isPointerLockBlocked}
        onPointerLockChange={setIsPointerLocked}
        pointerLockToggleRequestRef={pointerLockToggleRequestRef}
      />

      {!isBoothShowcaseActive && <MobileJoystick onMove={handleJoystickMove} />}

      <BoothPanel
        booth={selectedBooth}
        products={products}
        slots={selectedBooth ? slotsByBooth[selectedBooth.id] : undefined}
        selectedProduct={selectedProduct}
        onSelectProduct={handleSelectSlotProduct}
        onActivateNpc={handleActivateNpc}
        onClose={handleReturnToExplore}
        onWalkToBooth={handleWalkToBooth}
      />

      <NpcAssistantPanel
        plan={npcPlan}
        status={npcStatus}
        audioState={npcAudioState}
        voiceNotice={npcVoiceNotice}
        currentStepIndex={npcStepIndex}
        isMuted={npcMuted}
        hasVietnameseVoice={hasVietnameseVoice}
        onPause={handleNpcPause}
        onResume={handleNpcResume}
        onPrevious={handleNpcPrevious}
        onNext={handleNpcNext}
        onStop={handleNpcStop}
        onRestart={handleNpcRestart}
        onRetryAudio={handleNpcRetryAudio}
        onToggleMute={handleNpcToggleMute}
        onClose={closeNpcSession}
        onInspectProduct={handleSelectSlotProduct}
      />
    </main>
  );
};
