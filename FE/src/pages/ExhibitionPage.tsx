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
import {
  applyWorldLayoutToBooths,
  getWorldRuntimeConfig,
  resolveExpoWorldVersion,
  type ExpoWorldVersion,
} from '../scene/worldLayout';
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
import {
  buildPiperStepPlanFromDisplayText,
  checkBrowserPiperCapability,
  piperBrowserTts,
  resolveTtsProviderConfig,
  type PiperProgressEvent,
} from '../services/hybridTtsAdapter';

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

function getInitialVisitorSpawn(worldVersion: ExpoWorldVersion): {
  x: number;
  z: number;
  rotationY: number;
  restored: boolean;
} {
  const cfg = getWorldRuntimeConfig(worldVersion);
  const worldDefaultBooths = applyWorldLayoutToBooths(DEFAULT_BOOTHS, worldVersion);
  try {
    const raw = sessionStorage.getItem(cfg.storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: unknown; z?: unknown; rotationY?: unknown };
      if (
        typeof parsed.x === 'number' &&
        Number.isFinite(parsed.x) &&
        typeof parsed.z === 'number' &&
        Number.isFinite(parsed.z) &&
        isPointWalkable(parsed.x, parsed.z, worldDefaultBooths, undefined, cfg.navOptions)
      ) {
        return {
          x: parsed.x,
          z: parsed.z,
          rotationY:
            typeof parsed.rotationY === 'number' && Number.isFinite(parsed.rotationY)
              ? parsed.rotationY
              : cfg.spawnPoint.rotationY,
          restored: true,
        };
      }
    }
  } catch {
    // Ignore storage read errors and fall back to active world spawn
  }
  return {
    x: cfg.spawnPoint.x,
    z: cfg.spawnPoint.z,
    rotationY: cfg.spawnPoint.rotationY,
    restored: false,
  };
}

export interface ExhibitionPageProps {
  initialFocusBoothId?: string | null;
  onOpenAdmin?: () => void;
}

export const ExhibitionPage: React.FC<ExhibitionPageProps> = ({
  initialFocusBoothId = null,
}) => {
  const worldVersion = useMemo<ExpoWorldVersion>(() => resolveExpoWorldVersion(), []);
  const worldConfig = useMemo(() => getWorldRuntimeConfig(worldVersion), [worldVersion]);
  const initialIdentity = useMemo(() => getStoredIdentity(), []);
  const initialSpawn = useMemo(() => getInitialVisitorSpawn(worldVersion), [worldVersion]);
  const hasLockedPositionRef = useRef<boolean>(initialSpawn.restored);
  const [playerName, setPlayerName] = useState(initialIdentity.name);
  const [playerColor, setPlayerColor] = useState(initialIdentity.color);

  const [booths, setBooths] = useState<Booth[]>(() =>
    applyWorldLayoutToBooths(DEFAULT_BOOTHS, worldVersion)
  );
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
  const [showHelp, setShowHelp] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(playerName);
  const [draftColor, setDraftColor] = useState(playerColor);

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
  const ttsPrefetchAbortRef = useRef<AbortController | null>(null);
  const chunkSessionRef = useRef<{
    token: number;
    stepIdx: number;
    paused: boolean;
    nextChunkIndex: number;
    abortAll: () => void;
    resumePendingChunk: () => void;
  } | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const animTimerRef = useRef<number | null>(null);
  const voiceWatchdogTimerRef = useRef<number | null>(null);

  const cancelNpcAudioAndTimers = useCallback(() => {
    utteranceTokenRef.current += 1;
    if (chunkSessionRef.current) {
      try {
        chunkSessionRef.current.abortAll();
      } catch {
        // ignore abort errors
      }
      chunkSessionRef.current = null;
    }
    if (ttsAbortControllerRef.current) {
      try {
        ttsAbortControllerRef.current.abort();
      } catch {
        // ignore abort errors
      }
      ttsAbortControllerRef.current = null;
    }
    if (ttsPrefetchAbortRef.current) {
      try {
        ttsPrefetchAbortRef.current.abort();
      } catch {
        // ignore abort errors
      }
      ttsPrefetchAbortRef.current = null;
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
    piperBrowserTts.scheduleIdleRelease();
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

  // Ensure speech, timers, and browser TTS worker are always cleaned up on unmount
  useEffect(() => {
    return () => {
      cancelNpcAudioAndTimers();
      void piperBrowserTts.disposeWorker();
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
      setBooths(applyWorldLayoutToBooths(fetchedBooths, worldVersion));
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      setDataWarning(null);
      lastSilentRefreshAtRef.current = Date.now();
    } catch {
      setBooths(applyWorldLayoutToBooths(DEFAULT_BOOTHS, worldVersion));
      setProducts(DEFAULT_PRODUCTS);
      setSlotAssignments(FALLBACK_SLOT_ASSIGNMENTS);
      setDataWarning('Đang hiển thị dữ liệu mẫu cục bộ (Chưa kết nối được API Backend).');
    } finally {
      setLoadingData(false);
    }
  }, [worldVersion]);

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
      setBooths(applyWorldLayoutToBooths(fetchedBooths, worldVersion));
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
  }, [worldVersion]);

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
            worldConfig.storageKey,
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
    [selectedBooth?.id, worldConfig.storageKey]
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
    navOptions: worldConfig.navOptions,
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
    worldVersion,
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
      // Authoritative server-side collision & bounds enforcement for both V26 and V27
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
    setZoom(restoredMode === 'overview' ? worldConfig.overviewDefaultZoom : EXPLORE_DEFAULT_ZOOM);
  }, [closeNpcSession, worldConfig.overviewDefaultZoom]);

  const handleSwitchToOverview = useCallback(() => {
    closeNpcSession();
    previousExteriorModeRef.current = 'overview';
    setCameraMode('overview');
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(worldConfig.overviewDefaultZoom);
  }, [closeNpcSession, worldConfig.overviewDefaultZoom]);

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
        setNpcAudioState('ENDED');
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
          setNpcAudioState('ENDED');
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

      // Hybrid TTS Path (`local-korvatts` on Localhost | `browser-piper` WASM on Production/Cloud)
      // While preparing audio, NPC stays in natural `IDLE` pose (never enters TALKING before real audio plays)
      setNpcAudioState('GENERATING_AUDIO');
      setNpcVoiceNotice('Đang chuẩn bị đoạn âm thanh đầu tiên...');
      setNpcAnimation('IDLE');

      const CHUNK_UX_TIMEOUT_MS = 48_000;
      const chunkControllers = new Map<number, AbortController>();
      const chunkTimers = new Map<number, number>();
      const chunkPromises = new Map<
        number,
        Promise<{
          blob: Blob;
          cacheStatus: string;
          provider: string;
          voice: string;
        }>
      >();
      const preloadedAudios = new Map<number, { audio: HTMLAudioElement; objectUrl: string }>();
      let sessionCancelled = false;
      let lastChunkEndedAtMs = 0;

      const manifestCtrl = new AbortController();
      ttsAbortControllerRef.current = manifestCtrl;
      const manifestTimer = window.setTimeout(() => {
        try {
          manifestCtrl.abort();
        } catch {
          // ignore
        }
      }, 15_000);

      const disposePreloadedAudioEntry = (entry: { audio: HTMLAudioElement; objectUrl: string }) => {
        entry.audio.onplay = null;
        entry.audio.onended = null;
        entry.audio.onerror = null;
        try {
          entry.audio.pause();
          entry.audio.removeAttribute('src');
          entry.audio.load();
        } catch {
          // ignore
        }
        try {
          URL.revokeObjectURL(entry.objectUrl);
        } catch {
          // ignore
        }
      };

      const cleanupAllChunkRequests = () => {
        sessionCancelled = true;
        window.clearTimeout(manifestTimer);
        for (const t of chunkTimers.values()) {
          window.clearTimeout(t);
        }
        chunkTimers.clear();
        for (const ctrl of chunkControllers.values()) {
          try {
            ctrl.abort();
          } catch {
            // ignore
          }
        }
        chunkControllers.clear();
        for (const entry of preloadedAudios.values()) {
          disposePreloadedAudioEntry(entry);
        }
        preloadedAudios.clear();
      };

      const preloadDecodedAudioIfNeeded = (
        chunkIdx: number,
        p: Promise<{ blob: Blob; cacheStatus: string; provider: string; voice: string }>
      ) => {
        void p
          .then((res) => {
            if (utteranceTokenRef.current !== token || sessionCancelled) return;
            if (preloadedAudios.has(chunkIdx)) return;
            // Pre-decode WAV in HTMLAudioElement while previous chunk is still playing to minimize inter-chunk gap
            const objectUrl = URL.createObjectURL(res.blob);
            const preAudio = new Audio(objectUrl);
            preAudio.preload = 'auto';
            preAudio.load();
            preloadedAudios.set(chunkIdx, { audio: preAudio, objectUrl });
          })
          .catch(() => undefined);
      };

      let activeMode: 'local-korvatts' | 'browser-piper' =
        resolveTtsProviderConfig().preferredInitial;
      let piperChunks: string[] = [];

      const formatMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

      const ensureServerKorvaChunkRequest = (
        chunkIdx: number,
        priority: 'ACTIVE_PLAYBACK' | 'NEXT_CHUNK' | 'PREFETCH'
      ) => {
        const existing = chunkPromises.get(chunkIdx);
        if (existing) return existing;

        const ctrl = new AbortController();
        chunkControllers.set(chunkIdx, ctrl);
        let didUxTimeout = false;

        const uxTimer = window.setTimeout(() => {
          didUxTimeout = true;
          try {
            ctrl.abort();
          } catch {
            // ignore
          }
        }, CHUNK_UX_TIMEOUT_MS);
        chunkTimers.set(chunkIdx, uxTimer);

        const p = apiClient
          .synthesizeNpcSpeech(
            {
              boothId: plan.booth.id,
              stepType: step.type,
              slotId: step.slotId,
              productId: step.product?.id ?? null,
              chunkIndex: chunkIdx,
              priority,
            },
            ctrl.signal
          )
          .catch((err: Error & { code?: string }) => {
            if (didUxTimeout && !sessionCancelled) {
              const timeoutErr = new Error(
                'Quá trình tổng hợp âm thanh trên CPU mất nhiều thời gian hơn dự kiến — Đang hiển thị phụ đề tiếng Việt. Bạn có thể nhấn "🔄 Thử lại âm thanh" sau ít giây.'
              ) as Error & { code?: string };
              timeoutErr.code = 'TTS_UX_TIMEOUT';
              throw timeoutErr;
            }
            throw err;
          })
          .finally(() => {
            const timerId = chunkTimers.get(chunkIdx);
            if (timerId !== undefined) {
              window.clearTimeout(timerId);
              chunkTimers.delete(chunkIdx);
            }
            chunkControllers.delete(chunkIdx);
          });

        p.catch(() => undefined);
        chunkPromises.set(chunkIdx, p);
        if (priority === 'NEXT_CHUNK') {
          preloadDecodedAudioIfNeeded(chunkIdx, p);
        }
        return p;
      };

      const ensureBrowserPiperChunkRequest = (
        chunkIdx: number,
        totalChunks: number,
        isCurrentForeground: boolean
      ) => {
        const existing = chunkPromises.get(chunkIdx);
        if (existing) return existing;

        const ctrl = new AbortController();
        chunkControllers.set(chunkIdx, ctrl);
        const normalizedChunkText = piperChunks[chunkIdx] || '';

        const onProgress = isCurrentForeground
          ? (ev: PiperProgressEvent) => {
              if (utteranceTokenRef.current !== token || sessionCancelled) return;
              // Never overwrite PLAYING banner if audio is already speaking
              if (audioElementRef.current && !audioElementRef.current.paused) return;

              if (ev.stage === 'downloading') {
                setNpcAudioState('MODEL_LOADING');
                const pctText = ev.percent !== null ? ` (${ev.percent}%)` : '';
                setNpcVoiceNotice(
                  `Đang tải gói giọng nữ tiếng Việt lần đầu: ${formatMb(ev.loadedBytes)} / ${formatMb(ev.totalBytes)} MB${pctText}...`
                );
              } else if (ev.stage === 'initializing') {
                setNpcAudioState('MODEL_LOADING');
                setNpcVoiceNotice('Đang khởi tạo bộ đọc giọng nữ trên trình duyệt...');
              } else {
                setNpcAudioState('GENERATING_AUDIO');
                setNpcVoiceNotice(
                  totalChunks > 1
                    ? `Đang tạo đoạn âm thanh ${chunkIdx + 1}/${totalChunks} (Giọng nữ VAIS-1000)...`
                    : 'Đang tạo âm thanh giọng nữ tiếng Việt (VAIS-1000)...'
                );
              }
            }
          : undefined;

        const p = piperBrowserTts
          .synthesizeNormalizedChunk({
            normalizedText: normalizedChunkText,
            signal: ctrl.signal,
            onProgress,
          })
          .finally(() => {
            chunkControllers.delete(chunkIdx);
          });

        p.catch(() => undefined);
        chunkPromises.set(chunkIdx, p);
        if (!isCurrentForeground) {
          preloadDecodedAudioIfNeeded(chunkIdx, p);
        }
        return p;
      };

      const ensureChunkRequest = (
        chunkIdx: number,
        priority: 'ACTIVE_PLAYBACK' | 'NEXT_CHUNK' | 'PREFETCH',
        totalChunks: number
      ) => {
        if (activeMode === 'browser-piper') {
          return ensureBrowserPiperChunkRequest(
            chunkIdx,
            totalChunks,
            priority === 'ACTIVE_PLAYBACK'
          );
        }
        return ensureServerKorvaChunkRequest(chunkIdx, priority);
      };

      let playChunkAtFn: (chunkIdx: number, totalChunks: number) => void = () => undefined;

      const sessionObj = {
        token,
        stepIdx,
        paused: false,
        nextChunkIndex: 0,
        abortAll: cleanupAllChunkRequests,
        resumePendingChunk: () => {
          if (utteranceTokenRef.current !== token || sessionCancelled) return;
          sessionObj.paused = false;
          playChunkAtFn(sessionObj.nextChunkIndex, totalResolvedChunks);
        },
      };
      chunkSessionRef.current = sessionObj;
      let totalResolvedChunks = 1;

      playChunkAtFn = (chunkIdx: number, totalChunks: number) => {
        if (utteranceTokenRef.current !== token || sessionCancelled) return;
        sessionObj.nextChunkIndex = chunkIdx;
        if (sessionObj.paused) return;

        // Kick off current chunk (ACTIVE_PLAYBACK) and immediately pipeline chunkIdx + 1 (NEXT_CHUNK)
        const currentPromise = ensureChunkRequest(chunkIdx, 'ACTIVE_PLAYBACK', totalChunks);
        if (chunkIdx + 1 < totalChunks) {
          ensureChunkRequest(chunkIdx + 1, 'NEXT_CHUNK', totalChunks);
        }

        if (chunkIdx > 0 && !preloadedAudios.has(chunkIdx)) {
          setNpcAudioState((prev) =>
            prev === 'PLAYING' || prev === 'SPEAKING' ? 'GENERATING_AUDIO' : prev
          );
          setNpcAnimation('IDLE');
          setNpcVoiceNotice(`Đang chuẩn bị tiếp đoạn ${chunkIdx + 1}/${totalChunks}...`);
        }

        void currentPromise
          .then(async (ttsResult) => {
            if (utteranceTokenRef.current !== token || sessionCancelled) return;
            if (sessionObj.paused) return;

            // Clean up previous chunk audio element & object URL before starting current chunk
            if (audioElementRef.current) {
              const prevAudio = audioElementRef.current;
              prevAudio.onplay = null;
              prevAudio.onended = null;
              prevAudio.onerror = null;
              try {
                prevAudio.pause();
                prevAudio.removeAttribute('src');
              } catch {
                // ignore
              }
              audioElementRef.current = null;
            }
            if (activeObjectUrlRef.current) {
              try {
                URL.revokeObjectURL(activeObjectUrlRef.current);
              } catch {
                // ignore
              }
              activeObjectUrlRef.current = null;
            }

            setNpcAudioState('AUDIO_READY');
            const preloaded = preloadedAudios.get(chunkIdx);
            let audio: HTMLAudioElement;
            let objectUrl: string;
            if (preloaded) {
              preloadedAudios.delete(chunkIdx);
              audio = preloaded.audio;
              objectUrl = preloaded.objectUrl;
            } else {
              objectUrl = URL.createObjectURL(ttsResult.blob);
              audio = new Audio(objectUrl);
              audio.preload = 'auto';
            }

            activeObjectUrlRef.current = objectUrl;
            audio.volume = 1.0;
            audio.playbackRate = 1.0;
            audio.defaultPlaybackRate = 1.0;
            (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
            audio.muted = npcMutedRef.current;
            audioElementRef.current = audio;

            const voiceDisplay =
              ttsResult.voice === 'phuong_linh' ? 'Phương Linh' : ttsResult.voice;
            const providerBadge =
              ttsResult.provider === 'browser-piper'
                ? 'Piper WASM'
                : ttsResult.provider.toUpperCase();
            const voiceLabel =
              totalChunks > 1
                ? `Giọng nữ ${voiceDisplay} · Đoạn ${chunkIdx + 1}/${totalChunks}`
                : `Giọng nữ ${voiceDisplay} (${providerBadge})`;

            audio.onplay = () => {
              if (utteranceTokenRef.current !== token || sessionCancelled) return;
              if (chunkIdx > 0 && lastChunkEndedAtMs > 0 && typeof window !== 'undefined') {
                (window as Window & { __lastNpcInterChunkGapMs?: number }).__lastNpcInterChunkGapMs =
                  Math.max(0, Math.round(performance.now() - lastChunkEndedAtMs));
              }
              setHasVietnameseVoice(true);
              setNpcAudioState(npcMutedRef.current ? 'MUTED' : 'PLAYING');
              setNpcVoiceNotice(voiceLabel);
              if (chunkIdx === 0) {
                triggerActiveStepAnimation();
              } else {
                setNpcAnimation('TALKING');
              }

              // Pipeline lookahead: while the final chunk of this step plays, prefetch chunk 0 of stepIdx + 1
              if (chunkIdx === totalChunks - 1) {
                const nextStep = plan.steps[stepIdx + 1];
                if (nextStep && !npcMutedRef.current) {
                  if (ttsPrefetchAbortRef.current) {
                    try {
                      ttsPrefetchAbortRef.current.abort();
                    } catch {
                      // ignore
                    }
                  }
                  const prefetchCtrl = new AbortController();
                  ttsPrefetchAbortRef.current = prefetchCtrl;

                  if (activeMode === 'browser-piper') {
                    const nextPiperPlan = buildPiperStepPlanFromDisplayText(nextStep.text);
                    const firstNextChunk = nextPiperPlan.chunks[0];
                    if (firstNextChunk) {
                      void piperBrowserTts
                        .synthesizeNormalizedChunk({
                          normalizedText: firstNextChunk,
                          signal: prefetchCtrl.signal,
                        })
                        .catch(() => undefined);
                    }
                  } else {
                    void apiClient
                      .synthesizeNpcSpeech(
                        {
                          boothId: plan.booth.id,
                          stepType: nextStep.type,
                          slotId: nextStep.slotId,
                          productId: nextStep.product?.id ?? null,
                          chunkIndex: 0,
                          priority: 'PREFETCH',
                        },
                        prefetchCtrl.signal
                      )
                      .catch(() => undefined);
                  }
                }
              }
            };

            audio.onended = () => {
              if (utteranceTokenRef.current !== token || sessionCancelled) return;
              lastChunkEndedAtMs = performance.now();
              if (activeObjectUrlRef.current === objectUrl) {
                try {
                  URL.revokeObjectURL(objectUrl);
                } catch {
                  // ignore
                }
                activeObjectUrlRef.current = null;
              }
              audioElementRef.current = null;

              if (chunkIdx + 1 < totalChunks) {
                playChunkAtFn(chunkIdx + 1, totalChunks);
              } else {
                chunkSessionRef.current = null;
                if (stepTimerRef.current !== null) {
                  window.clearTimeout(stepTimerRef.current);
                }
                stepTimerRef.current = window.setTimeout(advanceToNext, 280);
              }
            };

            audio.onerror = () => {
              if (utteranceTokenRef.current !== token || sessionCancelled) return;
              cleanupAllChunkRequests();
              runFallbackOrSubtitleMode(
                'Không thể giải mã dữ liệu âm thanh trình duyệt — Đang hiển thị phụ đề tiếng Việt.'
              );
            };

            try {
              await audio.play();
            } catch (playErr) {
              if (utteranceTokenRef.current !== token || sessionCancelled) return;
              cleanupAllChunkRequests();
              const errName = (playErr as Error)?.name || '';
              const msg =
                errName === 'NotAllowedError'
                  ? 'Trình duyệt chặn tự động phát âm thanh — Hãy nhấn "🔄 Thử lại âm thanh" để nghe.'
                  : 'Không thể phát âm thanh trên trình duyệt — Đang hiển thị phụ đề tiếng Việt.';
              runFallbackOrSubtitleMode(msg);
            }
          })
          .catch((err: Error & { code?: string }) => {
            if (utteranceTokenRef.current !== token || sessionCancelled) return;
            if (err?.name === 'AbortError') return;
            cleanupAllChunkRequests();
            runFallbackOrSubtitleMode(
              err?.message ||
                'Dịch vụ giọng đọc hiện chưa khả dụng — Đang hiển thị phụ đề tiếng Việt.'
            );
          });
      };

      const startBrowserPiperMode = () => {
        window.clearTimeout(manifestTimer);
        ttsAbortControllerRef.current = null;

        const cap = checkBrowserPiperCapability();
        if (!cap.supported) {
          cleanupAllChunkRequests();
          runFallbackOrSubtitleMode(
            cap.reason ||
              'Trình duyệt không hỗ trợ bộ đọc giọng nói WASM — Đang hiển thị phụ đề tiếng Việt.'
          );
          return;
        }

        activeMode = 'browser-piper';
        piperBrowserTts.cancelIdleRelease();
        const built = buildPiperStepPlanFromDisplayText(step.text);
        piperChunks = built.chunks;
        totalResolvedChunks = Math.max(1, piperChunks.length);

        setNpcAudioState('GENERATING_AUDIO');
        setNpcVoiceNotice(
          totalResolvedChunks > 1
            ? `Đang chuẩn bị đoạn âm thanh 1/${totalResolvedChunks} (Giọng nữ VAIS-1000)...`
            : 'Đang chuẩn bị giọng nữ tiếng Việt (VAIS-1000)...'
        );

        playChunkAtFn(0, totalResolvedChunks);
      };

      const providerDecision = resolveTtsProviderConfig();
      if (providerDecision.preferredInitial === 'browser-piper') {
        startBrowserPiperMode();
        return;
      }

      // Localhost (`local-korvatts` preferred): Use Backend KorvaTTS (`phuong_linh`), falling over to
      // `browser-piper` in `auto` mode only if local KorvaTTS worker is unavailable/failed.
      void apiClient
        .getNpcSpeechManifest(
          {
            boothId: plan.booth.id,
            stepType: step.type,
            slotId: step.slotId,
            productId: step.product?.id ?? null,
          },
          manifestCtrl.signal
        )
        .then((manifest) => {
          window.clearTimeout(manifestTimer);
          if (utteranceTokenRef.current !== token || sessionCancelled) return;
          ttsAbortControllerRef.current = null;

          if (manifest.workerState === 'failed' && providerDecision.configured === 'auto') {
            startBrowserPiperMode();
            return;
          }

          activeMode = 'local-korvatts';
          totalResolvedChunks = Math.max(1, manifest.totalChunks || 1);
          const firstCached = Boolean(manifest.chunks?.[0]?.cached);

          if (
            !firstCached &&
            (manifest.workerState === 'starting' || manifest.workerState === 'stopped')
          ) {
            setNpcAudioState('MODEL_LOADING');
            setNpcVoiceNotice('Đang khởi tạo mô hình giọng nữ Phương Linh trên máy chủ...');
          } else if (firstCached) {
            setNpcAudioState('GENERATING_AUDIO');
            setNpcVoiceNotice('Đang nạp âm thanh có sẵn từ bộ nhớ đệm...');
          } else {
            setNpcAudioState('GENERATING_AUDIO');
            setNpcVoiceNotice(
              totalResolvedChunks > 1
                ? `Đang tạo đoạn âm thanh 1/${totalResolvedChunks} (Giọng nữ Phương Linh)...`
                : 'Đang tạo âm thanh giọng nữ Phương Linh...'
            );
          }

          playChunkAtFn(0, totalResolvedChunks);
        })
        .catch((err: Error & { code?: string }) => {
          window.clearTimeout(manifestTimer);
          if (utteranceTokenRef.current !== token || sessionCancelled) return;
          if (err?.name === 'AbortError') return;
          ttsAbortControllerRef.current = null;

          if (providerDecision.configured === 'auto') {
            startBrowserPiperMode();
            return;
          }

          cleanupAllChunkRequests();
          runFallbackOrSubtitleMode(
            err?.message ||
              'Dịch vụ giọng đọc hiện chưa khả dụng — Đang hiển thị phụ đề tiếng Việt.'
          );
        });
    },
    [cancelNpcAudioAndTimers]
  );

  // Keep active NPC consultation plan synchronized when Admin updates booth/product/slot data in real time
  useEffect(() => {
    if (!npcPlan || npcStatus === 'IDLE') return;
    const latestBooth = booths.find((b) => b.id === npcPlan.booth.id);
    if (!latestBooth) return;

    const refreshedPlan = buildBoothPresentationPlan(
      latestBooth,
      slotsByBooth[latestBooth.id],
      products
    );
    const prevSignature = npcPlan.steps.map((s) => s.text).join('\n');
    const nextSignature = refreshedPlan.steps.map((s) => s.text).join('\n');
    if (prevSignature === nextSignature) return;

    const clampedIdx = Math.min(Math.max(0, npcStepIndex), refreshedPlan.steps.length - 1);
    const currentStepChanged =
      (npcPlan.steps[npcStepIndex]?.text || '') !== (refreshedPlan.steps[clampedIdx]?.text || '');

    setNpcPlan(refreshedPlan);
    if (
      currentStepChanged &&
      (npcStatus === 'GREETING' || npcStatus === 'PRESENTING')
    ) {
      playNpcStep(refreshedPlan, clampedIdx);
    }
  }, [booths, npcPlan, npcStatus, npcStepIndex, playNpcStep, products, slotsByBooth]);

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
    if (chunkSessionRef.current) {
      chunkSessionRef.current.paused = true;
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
    // 1. If HTMLAudioElement is paused mid-chunk, resume directly from current timestamp (and continue remaining chunks onended)
    if (
      audioElementRef.current &&
      audioElementRef.current.paused &&
      !audioElementRef.current.ended &&
      audioElementRef.current.currentTime > 0
    ) {
      if (chunkSessionRef.current) {
        chunkSessionRef.current.paused = false;
      }
      setNpcStatus(npcStepIndex === 0 ? 'GREETING' : 'PRESENTING');
      setNpcAudioState(npcMutedRef.current ? 'MUTED' : 'PLAYING');
      setNpcAnimation('TALKING');
      void audioElementRef.current.play().catch(() => {
        playNpcStep(npcPlan, npcStepIndex);
      });
      return;
    }

    // 1b. If paused while waiting for an in-flight chunk synthesis, resume the chunk pipeline seamlessly
    if (chunkSessionRef.current && chunkSessionRef.current.stepIdx === npcStepIndex) {
      setNpcStatus(npcStepIndex === 0 ? 'GREETING' : 'PRESENTING');
      setNpcAudioState('GENERATING_AUDIO');
      setNpcAnimation('IDLE');
      chunkSessionRef.current.resumePendingChunk();
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
      setNpcAudioState(nextMuted ? 'MUTED' : 'PLAYING');
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
              <strong>Click trái vào mặt sàn</strong> để nhân vật tự di chuyển đến điểm chọn; <strong>giữ chuột trái và kéo</strong> (hoặc <strong>vuốt màn hình</strong> trên điện thoại) để xoay góc nhìn camera 360°.
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
        worldVersion={worldVersion}
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
