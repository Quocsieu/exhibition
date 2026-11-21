import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStoredVisitorToken,
  v28Api,
  v28RewardApi,
  v28VisitorApi,
  type V28BoothPlacementView,
  type V28ExhibitionVersionDetail,
  type V28Product,
  type V28VisitorInteractionType,
  type V28VisitorRewardStatusResponse,
} from '../services/v28Api';
import {
  DynamicExhibitionScene,
  type V28CameraMode,
  type V28PlayerState,
} from '../scene/v28/DynamicExhibitionScene';
import { DynamicWorldHud } from '../components/v28/DynamicWorldHud';
import { setCachedLiveTtsConfigured } from '../components/v28/V28NpcConsultantPanel';
import {
  FloatingJoystickOverlay,
  type FloatingJoystickOverlayHandle,
} from '../components/v28/FloatingJoystickOverlay';
import {
  computeStreamingLodMap,
  type BoothLodTier,
} from '../scene/v28/spatialStreaming';
import {
  classifyV28Viewport,
  detectTouchCapable,
  resolveV28GraphicsProfile,
  type V28GraphicsQualityMode,
  type V28ViewportInfo,
} from '../scene/v28/v28MobileControls';
import { ParametricExpoRoof } from '../scene/v28/ParametricExpoRoof';
import { useV28SpatialRealtime } from '../hooks/useV28SpatialRealtime';
import { piperBrowserTts, shouldAllowPiperBackgroundPrewarm } from '../services/hybridTtsAdapter';
import { resolveNpcTtsMode } from '../services/npcTtsConfig';
import { npcHybridTtsEngine, shouldAllowHybridPreload } from '../services/npcHybridTtsEngine';
import { extractBoothConsultationChunks } from '../services/npcConsultationScript';
import type { V28NpcAnimState } from '../scene/v28/DynamicBoothNpc3D';

export interface DynamicExhibitionPageProps {
  onOpenAdmin: () => void;
}

export const DynamicExhibitionPage: React.FC<DynamicExhibitionPageProps> = ({ onOpenAdmin }) => {
  const [world, setWorld] = useState<V28ExhibitionVersionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [cameraMode, setCameraMode] = useState<V28CameraMode>('explore');
  const previousExteriorModeRef = useRef<'overview' | 'explore'>('explore');
  const [focusedBooth, setFocusedBooth] = useState<V28BoothPlacementView | null>(null);
  const [npcPanelOpen, setNpcPanelOpen] = useState<boolean>(false);
  const [npcAnimState, setNpcAnimState] = useState<V28NpcAnimState>('idle');
  const [directoryOpenNonce, setDirectoryOpenNonce] = useState<number>(0);

  // Exact V27.5 Visitor Profile identity (sessionStorage: expo_visitor_name & expo_visitor_color)
  const [playerName, setPlayerName] = useState<string>(() => {
    const saved = sessionStorage.getItem('expo_visitor_name');
    if (saved) return saved;
    const generated = `Khách #${Math.floor(100 + Math.random() * 900)}`;
    sessionStorage.setItem('expo_visitor_name', generated);
    return generated;
  });
  const [playerColor, setPlayerColor] = useState<string>(() => {
    const saved = sessionStorage.getItem('expo_visitor_color');
    if (saved) return saved;
    const defaultCol = '#0ea5e9';
    sessionStorage.setItem('expo_visitor_color', defaultCol);
    return defaultCol;
  });
  const [selectedProduct, setSelectedProduct] = useState<{
    booth: V28BoothPlacementView;
    product: V28Product;
    slotId: string;
  } | null>(null);
  const [playerTarget, setPlayerTarget] = useState<{ x: number; z: number } | null>(null);
  const [teleportState, setTeleportState] = useState<{
    nonce: number;
    pos: { x: number; z: number; rotationY: number } | null;
  }>({ nonce: 0, pos: null });
  const [playerPos, setPlayerPos] = useState<V28PlayerState>({ x: 0, z: 20, rotationY: Math.PI });
  const joystickVecRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const floatingJoystickRef = useRef<FloatingJoystickOverlayHandle | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; nonce: number }>({ delta: 0, nonce: 0 });
  const [viewport, setViewport] = useState<V28ViewportInfo>(() =>
    classifyV28Viewport(window.innerWidth, window.innerHeight, detectTouchCapable())
  );
  const isMobilePortrait = viewport.isMobilePortrait;
  const isMobileViewport = viewport.isMobileViewport;
  const [graphicsQuality, setGraphicsQuality] = useState<V28GraphicsQualityMode>(() => {
    const saved = localStorage.getItem('v28_graphics_quality');
    if (saved === 'performance' || saved === 'quality' || saved === 'auto') return saved;
    return 'auto';
  });
  const [boothLodMap, setBoothLodMap] = useState<Record<string, BoothLodTier>>({});
  const lodMapRef = useRef<Record<string, BoothLodTier>>({});

  // Phase 4: Server-Verified Visitor Journey Tracking (never fakes visited; server DB is source of truth)
  const [visitedBoothIds, setVisitedBoothIds] = useState<Set<string>>(() => new Set());
  const [journeyStatus, setJourneyStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rewardStatus, setRewardStatus] = useState<V28VisitorRewardStatusResponse | null>(null);
  const visitedBoothIdsRef = useRef<Set<string>>(new Set());
  const inFlightVisitBoothsRef = useRef<Set<string>>(new Set());
  const journeyChannelRef = useRef<BroadcastChannel | null>(null);
  const activeEngagementRef = useRef<{
    boothId: string;
    versionId: string;
    token: string;
    startedAt: number;
    minDwellFocusMs: number;
    minDwellInteractMs: number;
  } | null>(null);
  const [engagementReadyNonce, setEngagementReadyNonce] = useState<number>(0);

  const handleChangeGraphicsQuality = useCallback((mode: V28GraphicsQualityMode) => {
    setGraphicsQuality(mode);
    try {
      localStorage.setItem('v28_graphics_quality', mode);
    } catch {
      // ignore storage error
    }
  }, []);

  // Recompute 3-Ring Spatial Streaming LOD map with staggered mount queue on movement/camera/focus change
  useEffect(() => {
    if (!world) return;
    const profile = resolveV28GraphicsProfile(graphicsQuality, isMobileViewport);
    const thresholds = profile.streamingThresholds;
    const anchorX = focusedBooth ? focusedBooth.positionX : playerPos.x;
    const anchorZ = focusedBooth ? focusedBooth.positionZ : playerPos.z;

    const tickStreaming = () => {
      const next = computeStreamingLodMap({
        booths: world.booths,
        anchorX,
        anchorZ,
        cameraMode,
        focusedBoothId: focusedBooth?.boothId ?? null,
        prevLodMap: lodMapRef.current,
        thresholds,
        maxPromotionsPerTick: 6,
      });
      lodMapRef.current = next;
      setBoothLodMap(next);
    };

    tickStreaming();
    // Follow-up tick to drain staggered mount queue smoothly after rapid teleport
    const timer = window.setTimeout(tickStreaming, 180);
    return () => window.clearTimeout(timer);
  }, [world, playerPos.x, playerPos.z, cameraMode, focusedBooth, isMobileViewport, graphicsQuality]);

  const previewVersionId = new URLSearchParams(window.location.search).get('previewVersionId');

  useEffect(() => {
    const onResize = () => {
      setViewport(classifyV28Viewport(window.innerWidth, window.innerHeight, detectTouchCapable()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const hasLoadedWorldRef = useRef<boolean>(false);

  const loadActiveWorld = useCallback(async (bypassCache = false) => {
    // V28-AUDIT-024: Only show full-page loader on initial load so live reload NEVER unmounts WebGL <Canvas>!
    if (!hasLoadedWorldRef.current) {
      setLoading(true);
    }
    setError('');
    try {
      const { world: loaded } = await v28Api.getActiveWorld(previewVersionId, bypassCache);
      const isInitial = !hasLoadedWorldRef.current;
      hasLoadedWorldRef.current = true;
      setWorld(loaded);
      if (isInitial) {
        setPlayerPos({
          x: loaded.spawnPoint.x,
          z: loaded.spawnPoint.z,
          rotationY: loaded.spawnPoint.rotationY,
        });
      } else {
        // Reconcile focused booth & product against refreshed layout
        setFocusedBooth((prev) => {
          if (!prev) return null;
          const next = loaded.booths.find((b) => b.boothId === prev.boothId) || null;
          if (!next) {
            setNpcPanelOpen(false);
            setNpcAnimState('idle');
            setCameraMode((cm) => (cm === 'focus' ? 'explore' : cm));
          }
          return next;
        });
        setSelectedProduct((prev) => {
          if (!prev) return null;
          const nextBooth = loaded.booths.find((b) => b.boothId === prev.booth.boothId);
          const nextSlot = nextBooth?.slots.find((s) => s.slotId === prev.slotId);
          return nextBooth && nextSlot?.product
            ? { booth: nextBooth, product: nextSlot.product, slotId: prev.slotId }
            : null;
        });
      }
    } catch (e) {
      setError((e as Error).message || 'Không thể tải dữ liệu triển lãm V28.');
    } finally {
      setLoading(false);
    }
  }, [previewVersionId]);

  useEffect(() => {
    loadActiveWorld();
  }, [loadActiveWorld]);

  // Controlled cache-only Piper WASM prewarm AFTER World 3D has loaded:
  // ONLY warms the worker if the model is ALREADY cached in CacheStorage (0 network bytes for non-NPC visitors!)
  useEffect(() => {
    if (loading || !world) return;
    if (!shouldAllowPiperBackgroundPrewarm().allowed) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void v28Api
        .getAiStatus()
        .then((st) => {
          const liveTts = Boolean((st as { liveTtsConfigured?: boolean }).liveTtsConfigured);
          setCachedLiveTtsConfigured(liveTts);
          if (cancelled || liveTts) return;
          void piperBrowserTts.prewarmInBackground({ cacheOnly: true });
        })
        .catch(() => {
          if (!cancelled) {
            void piperBrowserTts.prewarmInBackground({ cacheOnly: true });
          }
        });
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, world]);

  // P1 Smart Preloading (ONLY active when NPC_TTS_MODE === 'hybrid'; 0 bytes in 'legacy' mode):
  // 1) After World 3D finishes loading, warm ONLY the lightweight pregen manifest (~2 KB, 0 MB ONNX).
  useEffect(() => {
    if (loading || !world) return;
    if (resolveNpcTtsMode() !== 'hybrid') return;
    if (!shouldAllowHybridPreload().allowed) return;
    const timer = window.setTimeout(() => {
      void npcHybridTtsEngine.warmManifest();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [loading, world]);

  // 2) When visitor focuses a booth, selectively preload that booth's pre-generated chunks (max concurrency 2,
  //    cancellable on booth switch, 0 MB ONNX, 0 auto-play) so clicking "Nghe tư vấn" is instant!
  useEffect(() => {
    if (!focusedBooth || cameraMode !== 'focus') return;
    if (resolveNpcTtsMode() !== 'hybrid') return;
    if (!shouldAllowHybridPreload().allowed) return;

    const controller = new AbortController();
    const chunks = extractBoothConsultationChunks(focusedBooth);
    void npcHybridTtsEngine.preloadChunks(chunks, {
      signal: controller.signal,
      maxConcurrency: 2,
      maxChunks: 16,
    });

    return () => {
      controller.abort();
    };
  }, [focusedBooth, cameraMode]);

  // Phase 4: Hydrate server-verified visitor journey on world load & sync across browser tabs
  useEffect(() => {
    if (!world?.versionId) return;
    let cancelled = false;
    setJourneyStatus('loading');

    const loadJourney = async () => {
      try {
        const journey = await v28VisitorApi.getJourney(world.versionId);
        if (cancelled) return;
        const nextSet = new Set(journey.visitedBoothIds);
        visitedBoothIdsRef.current = nextSet;
        setVisitedBoothIds(nextSet);
        setJourneyStatus('ready');
        try {
          const rw = await v28RewardApi.getVisitorRewardStatus(world.versionId);
          if (!cancelled) setRewardStatus(rw);
        } catch {
          // ignore non-blocking reward status error
        }
      } catch {
        if (!cancelled) {
          setJourneyStatus('error');
        }
      }
    };

    void loadJourney();

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('v28-visitor-journey');
      journeyChannelRef.current = ch;
      ch.onmessage = (ev) => {
        const msg = ev.data as { versionId?: string; visitedBoothIds?: string[] } | null;
        if (!msg || msg.versionId !== world.versionId || !Array.isArray(msg.visitedBoothIds)) return;
        const merged = new Set(msg.visitedBoothIds);
        visitedBoothIdsRef.current = merged;
        setVisitedBoothIds(merged);
        setJourneyStatus('ready');
      };
    } catch {
      // BroadcastChannel not supported
    }

    return () => {
      cancelled = true;
      journeyChannelRef.current = null;
      try {
        ch?.close();
      } catch {
        // ignore
      }
    };
  }, [world?.versionId]);

  const submitVerifiedVisit = useCallback(
    async (
      booth: V28BoothPlacementView,
      interactionType: V28VisitorInteractionType,
      engagementToken: string
    ) => {
      if (!world?.versionId) return;
      if (visitedBoothIdsRef.current.has(booth.boothId)) return;
      if (inFlightVisitBoothsRef.current.has(booth.boothId)) return;
      if (!engagementToken) return;

      const ap = booth.approachPoint;
      if (!ap || !Number.isFinite(ap.x) || !Number.isFinite(ap.z)) return;
      // Client-side pre-filter (server enforces authoritative Socket.IO proximity & dwell independently)
      const dist = Math.hypot(playerPos.x - ap.x, playerPos.z - ap.z);
      if (dist > 12.0) return;

      inFlightVisitBoothsRef.current.add(booth.boothId);
      try {
        const res = await v28VisitorApi.recordVisit({
          versionId: world.versionId,
          boothId: booth.boothId,
          interactionType,
          engagementToken,
        });
        const nextSet = new Set(res.visitedBoothIds);
        visitedBoothIdsRef.current = nextSet;
        setVisitedBoothIds(nextSet);
        setJourneyStatus('ready');
        void v28RewardApi
          .getVisitorRewardStatus(world.versionId)
          .then((rw) => setRewardStatus(rw))
          .catch(() => undefined);
        try {
          journeyChannelRef.current?.postMessage({
            versionId: world.versionId,
            visitedBoothIds: res.visitedBoothIds,
          });
        } catch {
          // ignore
        }
      } catch {
        // Server rejected (e.g. out of range, dwell too short, cooldown/rate-limited, offline): NEVER increment client count!
      } finally {
        inFlightVisitBoothsRef.current.delete(booth.boothId);
      }
    },
    [world?.versionId, playerPos.x, playerPos.z]
  );

  const activeVersionIdRef = useRef<string | null>(null);
  activeVersionIdRef.current = world?.versionId ?? null;

  const refreshRewardStatusOnly = useCallback(async () => {
    const vid = activeVersionIdRef.current;
    if (!vid) return;
    try {
      const rw = await v28RewardApi.getVisitorRewardStatus(vid);
      setRewardStatus(rw);
    } catch {
      // ignore non-blocking reward status refresh error
    }
  }, []);

  // Listen for instant cross-tab V28 Admin sync (Publish / Slot Update / Empty Booth Removal / Reward Policy)
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('v28-expo-sync');
      ch.onmessage = (ev) => {
        const msg = ev.data as { reason?: string } | null;
        if (msg?.reason === 'reward_policy_updated') {
          void refreshRewardStatusOnly();
          return;
        }
        void loadActiveWorld(true);
        void refreshRewardStatusOnly();
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      try {
        ch?.close();
      } catch {
        // ignore
      }
    };
  }, [loadActiveWorld, refreshRewardStatusOnly]);

  const { remoteAvatars, onlineCount, overflowCount, sendMove, sendTeleport, sendProfile, bindVisitorToken } =
    useV28SpatialRealtime({
      versionId: world?.versionId ?? null,
      isMobilePortrait,
      onLayoutChanged: () => {
        void loadActiveWorld(true);
        void refreshRewardStatusOnly();
      },
    });

  // Phase 4 Security Hardening: Bind authenticated visitorToken to `/v28-dynamic` socket once journey session is ready
  useEffect(() => {
    if (journeyStatus !== 'ready') return;
    const token = getStoredVisitorToken();
    if (token) {
      bindVisitorToken(token);
    }
  }, [journeyStatus, bindVisitorToken]);

  // Step 1 of Server-Verified Visit Proof: Start server-timed engagement when focusing an unvisited booth
  useEffect(() => {
    if (!world?.versionId || cameraMode !== 'focus' || !focusedBooth) {
      activeEngagementRef.current = null;
      return;
    }
    if (visitedBoothIdsRef.current.has(focusedBooth.boothId)) {
      activeEngagementRef.current = null;
      return;
    }

    let cancelled = false;
    const targetVersionId = world.versionId;
    const targetBoothId = focusedBooth.boothId;

    const beginEngagement = async () => {
      const tok = getStoredVisitorToken();
      if (tok) bindVisitorToken(tok);
      // Small grace delay so in-flight v28:teleport / v28:move reaches server before /engage proximity check
      await new Promise((r) => window.setTimeout(r, 150));
      if (cancelled) return;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const eng = await v28VisitorApi.startVisitEngagement({
            versionId: targetVersionId,
            boothId: targetBoothId,
          });
          if (cancelled) return;
          activeEngagementRef.current = {
            boothId: targetBoothId,
            versionId: targetVersionId,
            token: eng.engagementToken,
            startedAt: Date.now(),
            minDwellFocusMs: eng.minDwellFocusMs,
            minDwellInteractMs: eng.minDwellInteractMs,
          };
          setEngagementReadyNonce((n) => n + 1);
          return;
        } catch {
          if (cancelled || attempt === 1) return;
          await new Promise((r) => window.setTimeout(r, 300));
        }
      }
    };

    void beginEngagement();
    return () => {
      cancelled = true;
      if (activeEngagementRef.current?.boothId === targetBoothId) {
        activeEngagementRef.current = null;
      }
    };
  }, [world?.versionId, cameraMode, focusedBooth?.boothId, bindVisitorToken]);

  // Step 2 of Server-Verified Visit Proof: Complete visit ONLY after server-verified engagement + dwell time
  useEffect(() => {
    if (!world || cameraMode !== 'focus' || !focusedBooth) return;
    if (visitedBoothIdsRef.current.has(focusedBooth.boothId)) return;

    const eng = activeEngagementRef.current;
    if (!eng || eng.boothId !== focusedBooth.boothId || eng.versionId !== world.versionId) {
      return;
    }

    const elapsed = Date.now() - eng.startedAt;
    if (selectedProduct && selectedProduct.booth.boothId === focusedBooth.boothId) {
      const waitMs = Math.max(0, eng.minDwellInteractMs + 60 - elapsed);
      const timer = window.setTimeout(() => {
        void submitVerifiedVisit(focusedBooth, 'product_inspect', eng.token);
      }, waitMs);
      return () => window.clearTimeout(timer);
    }
    if (npcPanelOpen) {
      const waitMs = Math.max(0, eng.minDwellInteractMs + 60 - elapsed);
      const timer = window.setTimeout(() => {
        void submitVerifiedVisit(focusedBooth, 'npc_consult', eng.token);
      }, waitMs);
      return () => window.clearTimeout(timer);
    }

    const waitMs = Math.max(0, eng.minDwellFocusMs + 100 - elapsed);
    const dwellTimer = window.setTimeout(() => {
      void submitVerifiedVisit(focusedBooth, 'booth_focus', eng.token);
    }, waitMs);
    return () => window.clearTimeout(dwellTimer);
  }, [
    world,
    cameraMode,
    focusedBooth,
    selectedProduct,
    npcPanelOpen,
    engagementReadyNonce,
    submitVerifiedVisit,
  ]);

  const handleUpdateVisitorProfile = useCallback(
    (nextName: string, nextColor: string) => {
      const cleaned = nextName.trim().slice(0, 32);
      if (!cleaned) return;
      setPlayerName(cleaned);
      setPlayerColor(nextColor);
      sessionStorage.setItem('expo_visitor_name', cleaned);
      sessionStorage.setItem('expo_visitor_color', nextColor);
      sendProfile(cleaned, nextColor);
    },
    [sendProfile]
  );

  const handleTeleportToBooth = useCallback((booth: V28BoothPlacementView) => {
    if (cameraMode === 'overview' || cameraMode === 'explore') {
      previousExteriorModeRef.current = cameraMode;
    }
    const lookRot = Math.atan2(
      booth.positionX - booth.approachPoint.x,
      booth.positionZ - booth.approachPoint.z
    );
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: { x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot },
    }));
    setPlayerPos({ x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot });
    sendTeleport(booth.approachPoint.x, booth.approachPoint.z, lookRot);
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setCameraMode('focus');
  }, [cameraMode, sendTeleport]);

  const handleFocusBooth = useCallback((booth: V28BoothPlacementView) => {
    if (cameraMode === 'overview' || cameraMode === 'explore') {
      previousExteriorModeRef.current = cameraMode;
    }
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setCameraMode('focus');
  }, [cameraMode]);

  const handleSelectProduct = useCallback(
    (booth: V28BoothPlacementView, product: V28Product, slotId: string) => {
      if (cameraMode === 'overview' || cameraMode === 'explore') {
        previousExteriorModeRef.current = cameraMode;
      }
      setFocusedBooth(booth);
      setSelectedProduct({ booth, product, slotId });
      setCameraMode('focus');
    },
    [cameraMode]
  );

  const handleExitBoothFocus = useCallback((forceExplore = false) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcPanelOpen(false);
    setNpcAnimState('idle');
    setCameraMode(forceExplore ? 'explore' : previousExteriorModeRef.current);
  }, []);

  // Single unified Escape & WASD keyboard handler (Modal-first priority matching V27.5 BoothPanel)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
      if (e.key === 'Escape') {
        if (selectedProduct) {
          e.preventDefault();
          setSelectedProduct(null);
          return;
        }
        if (cameraMode === 'focus' || focusedBooth || npcPanelOpen) {
          e.preventDefault();
          handleExitBoothFocus(false);
          return;
        }
      }
      if (
        !isTyping &&
        cameraMode === 'focus' &&
        (e.code === 'KeyW' ||
          e.code === 'KeyA' ||
          e.code === 'KeyS' ||
          e.code === 'KeyD' ||
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight')
      ) {
        handleExitBoothFocus(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cameraMode, focusedBooth, selectedProduct, npcPanelOpen, handleExitBoothFocus]);

  const handleReturnToCenter = useCallback(() => {
    if (!world) return;
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcPanelOpen(false);
    setNpcAnimState('idle');
    setPlayerTarget(null);
    setCameraMode('explore');
    previousExteriorModeRef.current = 'explore';
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: {
        x: world.spawnPoint.x,
        z: world.spawnPoint.z,
        rotationY: world.spawnPoint.rotationY,
      },
    }));
    sendTeleport(world.spawnPoint.x, world.spawnPoint.z, world.spawnPoint.rotationY);
  }, [world, sendTeleport]);

  const handleFloorClick = useCallback((x: number, z: number) => {
    if (cameraMode === 'focus') {
      handleExitBoothFocus(true);
      return;
    }
    setPlayerTarget({ x, z });
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcPanelOpen(false);
    setNpcAnimState('idle');
  }, [cameraMode, handleExitBoothFocus]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, var(--v28-youth-blue-deep, #003d82) 0%, #0f172a 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
          Đang tải Grand Expo World V28...
        </div>
        <div style={{ fontSize: 13, color: '#bae6fd' }}>
          Đang chuẩn bị không gian triển lãm 3D 100 gian hàng
        </div>
      </div>
    );
  }

  if (error || !world) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#fecaca',
          fontFamily: 'system-ui, sans-serif',
          padding: 20,
        }}
      >
        <div>⚠️ {error || 'Không có dữ liệu triển lãm V28.'}</div>
        <button
          type="button"
          onClick={() => { void loadActiveWorld(true); }}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer' }}
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden', background: '#dbeafe' }}>
      <DynamicExhibitionScene
        world={world}
        cameraMode={cameraMode}
        focusedBooth={focusedBooth}
        playerTarget={playerTarget}
        teleportNonce={teleportState.nonce}
        teleportPos={teleportState.pos}
        joystickVector={{ x: 0, y: 0 }}
        joystickVectorRef={joystickVecRef}
        zoomRequest={zoomRequest}
        isMobilePortrait={isMobilePortrait}
        isMobileViewport={isMobileViewport}
        graphicsQuality={graphicsQuality}
        boothLodMap={boothLodMap}
        remoteAvatars={remoteAvatars}
        npcAnimState={npcAnimState}
        isNpcSpeaking={npcPanelOpen && npcAnimState !== 'idle'}
        playerName={playerName}
        playerColor={playerColor}
        onPlayerMove={(pos) => {
          setPlayerPos(pos);
          sendMove(pos.x, pos.z, pos.rotationY);
        }}
        onFloorClick={handleFloorClick}
        onFocusBooth={handleFocusBooth}
        onSelectProduct={handleSelectProduct}
        onClickNpc={(booth) => {
          if (cameraMode === 'overview' || cameraMode === 'explore') {
            previousExteriorModeRef.current = cameraMode;
          }
          setFocusedBooth(booth);
          setSelectedProduct(null);
          setNpcPanelOpen(true);
          setCameraMode('focus');
        }}
        onOpenDirectoryMap={() => setDirectoryOpenNonce((n) => n + 1)}
        onFloatingJoystickVisual={(visual) => {
          floatingJoystickRef.current?.update(visual);
        }}
        renderRoof={({ cameraMode: cm, isMobilePortrait: mp }) => (
          <ParametricExpoRoof roofBounds={world.roofBounds} cameraMode={cm} isMobilePortrait={mp} />
        )}
      />

      <FloatingJoystickOverlay ref={floatingJoystickRef} />

      <DynamicWorldHud
        world={world}
        isPreviewMode={Boolean(previewVersionId)}
        cameraMode={cameraMode}
        isMobilePortrait={isMobilePortrait}
        isMobileViewport={isMobileViewport}
        isMobileLandscape={viewport.isMobileLandscape}
        graphicsQuality={graphicsQuality}
        onChangeGraphicsQuality={handleChangeGraphicsQuality}
        onReturnToCenter={handleReturnToCenter}
        playerPos={playerPos}
        visitedBoothIds={visitedBoothIds}
        journeyStatus={journeyStatus}
        rewardStatus={rewardStatus}
        onRewardStatusUpdated={setRewardStatus}
        focusedBooth={focusedBooth}
        selectedProduct={selectedProduct}
        npcPanelOpen={npcPanelOpen}
        directoryOpenNonce={directoryOpenNonce}
        playerName={playerName}
        playerColor={playerColor}
        onUpdateVisitorProfile={handleUpdateVisitorProfile}
        onlineCount={onlineCount}
        overflowVisitorCount={overflowCount}
        onChangeCameraMode={(mode) => {
          if (mode === 'overview' || mode === 'explore') {
            previousExteriorModeRef.current = mode;
          }
          setCameraMode(mode);
          if (mode !== 'focus') {
            setFocusedBooth(null);
            setSelectedProduct(null);
            setNpcPanelOpen(false);
            setNpcAnimState('idle');
          }
        }}
        onTeleportToBooth={handleTeleportToBooth}
        onSelectProduct={handleSelectProduct}
        onCloseProduct={() => setSelectedProduct(null)}
        onCloseFocus={() => handleExitBoothFocus(false)}
        onOpenNpcPanel={() => setNpcPanelOpen(true)}
        onCloseNpcPanel={() => {
          setNpcPanelOpen(false);
          setNpcAnimState('idle');
        }}
        onNpcAnimStateChange={setNpcAnimState}
        onJoystickChange={(vec) => {
          if ((Math.abs(vec.x) > 0.08 || Math.abs(vec.y) > 0.08) && cameraMode === 'focus') {
            handleExitBoothFocus(true);
          }
          joystickVecRef.current.x = vec.x;
          joystickVecRef.current.y = vec.y;
        }}
        onZoomIn={() => setZoomRequest((z) => ({ delta: -0.15, nonce: z.nonce + 1 }))}
        onZoomOut={() => setZoomRequest((z) => ({ delta: 0.15, nonce: z.nonce + 1 }))}
        onOpenAdmin={onOpenAdmin}
      />
    </div>
  );
};
