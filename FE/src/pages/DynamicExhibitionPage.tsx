import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { setCachedLiveTtsConfigured } from '../services/npcAudioClipGuard';
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
import {
  buildPiperStepPlanFromDisplayText,
  hasCachedPiperModelInBrowser,
  piperBrowserTts,
  shouldAllowPiperBackgroundPrewarm,
} from '../services/hybridTtsAdapter';
import {
  predictiveResourceGovernor,
  resolvePredictivePreSynthEnabled,
} from '../services/predictiveAudioScheduler';
import {
  resolveNpcTtsMode,
  resolveNpcTtsProvider,
  resolveSupertonicSpeed,
  resolveSupertonicVoicePreset,
} from '../services/npcTtsConfig';
import { npcHybridTtsEngine, shouldAllowHybridPreload } from '../services/npcHybridTtsEngine';
import {
  buildSupertonicStepChunks,
  supertonicTtsAdapter,
} from '../services/supertonicTtsAdapter';
import {
  buildBoothConsultationSteps,
  buildProductConsultationSteps,
  extractBoothConsultationChunks,
} from '../services/npcConsultationScript';
import { findSimilarBooths } from '../services/similarBooths';
import { applyAgriDemoShowcaseOverlay } from '../services/v28AgriDemoShowcase';
import {
  computeGuidedRoute,
  computeGuidedZoneRoute,
  type RoutePoint,
} from '../services/v28NavigationEngine';
import type { V28ZoneRecord } from '../services/v28Api';
import { useNpcConsultationSession } from '../hooks/useNpcConsultationSession';
import type { V28NpcAnimState } from '../scene/v28/DynamicBoothNpc3D';
import type { V28OnboardingGuideSignal } from '../services/v28OnboardingStateMachine';
import {
  loadFavoriteBoothIds,
  saveFavoriteBoothIds,
  toggleFavoriteBoothId,
} from '../services/v28FavoriteBooths';

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
  const [guidedTargetBooth, setGuidedTargetBooth] = useState<V28BoothPlacementView | null>(null);
  const [guidedTargetZone, setGuidedTargetZone] = useState<V28ZoneRecord | null>(null);
  const [autoWalkRequest, setAutoWalkRequest] = useState<{
    nonce: number;
    waypoints: RoutePoint[];
  } | null>(null);
  const [navNoticeToast, setNavNoticeToast] = useState<string | null>(null);
  const navNoticeTimerRef = useRef<number | null>(null);
  const [cameraYaw, setCameraYaw] = useState<number>(Math.PI);
  const lastYawUpdateRef = useRef<number>(Math.PI);
  const [npcChatOpen, setNpcChatOpen] = useState<boolean>(false);
  const [chatAnimState, setChatAnimState] = useState<V28NpcAnimState>('idle');
  const [similarDismissed, setSimilarDismissed] = useState<boolean>(false);
  const [directoryOpenNonce, setDirectoryOpenNonce] = useState<number>(0);
  const [onboardingGuideSignal, setOnboardingGuideSignal] = useState<V28OnboardingGuideSignal | null>(null);
  const [replayOnboardingNonce, setReplayOnboardingNonce] = useState<number>(0);

  // Phase 1.1–1.4: Headless Web Audio API NPC consultation state machine (no blocking UI panel)
  const npcSession = useNpcConsultationSession();
  const effectiveNpcAnimState: V28NpcAnimState = npcChatOpen ? chatAnimState : npcSession.animState;
  const isNpcConsultActive =
    npcSession.sessionState === 'SPEAKING' ||
    npcSession.sessionState === 'LOADING' ||
    npcChatOpen;

  const similarBooths = useMemo(
    () => findSimilarBooths(focusedBooth, world?.booths || [], 3),
    [focusedBooth, world?.booths]
  );

  const handleCameraYawChange = useCallback((nextYaw: number) => {
    if (Math.abs(nextYaw - lastYawUpdateRef.current) >= 0.04) {
      lastYawUpdateRef.current = nextYaw;
      setCameraYaw(nextYaw);
    }
  }, []);

  const showNavNotice = useCallback((msg: string) => {
    setNavNoticeToast(msg);
    if (navNoticeTimerRef.current) window.clearTimeout(navNoticeTimerRef.current);
    navNoticeTimerRef.current = window.setTimeout(() => {
      setNavNoticeToast(null);
      navNoticeTimerRef.current = null;
    }, 3200);
  }, []);

  const [favoriteBoothIds, setFavoriteBoothIds] = useState<string[]>(() => loadFavoriteBoothIds());
  const favoriteBoothIdSet = useMemo(() => new Set(favoriteBoothIds), [favoriteBoothIds]);

  const handleToggleFavoriteBooth = useCallback(
    (booth: V28BoothPlacementView) => {
      const boothNumber = Math.max(1, (Number.isFinite(booth.slotIndex) ? Math.floor(booth.slotIndex) : 0) + 1);
      const label = (booth.companyName || booth.boothName || `Gian #${boothNumber}`).trim();
      setFavoriteBoothIds((prev) => {
        const { nextIds, isFavorite } = toggleFavoriteBoothId(prev, booth.boothId);
        saveFavoriteBoothIds(nextIds);
        showNavNotice(
          isFavorite
            ? `♥ Đã ghim Gian #${boothNumber} (${label}) vào danh sách yêu thích`
            : `Đã bỏ ghim Gian #${boothNumber} (${label}) khỏi danh sách yêu thích`
        );
        return nextIds;
      });
    },
    [showNavNotice]
  );

  useEffect(() => {
    return () => {
      if (navNoticeTimerRef.current) window.clearTimeout(navNoticeTimerRef.current);
    };
  }, []);

  const sendTeleportRef = useRef<((x: number, z: number, rotationY: number) => void) | null>(null);

  // Phase 1: Instant Teleport for BOTH "Chỉ đường" buttons and 3D Booth/Zone navigation labels
  const teleportExploreToPoint = useCallback(
    (x: number, z: number, rotationY: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      npcSession.stopSession();
      setFocusedBooth(null);
      setSelectedProduct(null);
      setNpcChatOpen(false);
      setChatAnimState('idle');
      setPlayerTarget(null);
      setAutoWalkRequest(null);
      setGuidedTargetBooth(null);
      setGuidedTargetZone(null);
      setCameraMode('explore');
      previousExteriorModeRef.current = 'explore';
      setTeleportState((prev) => ({
        nonce: prev.nonce + 1,
        pos: { x, z, rotationY },
      }));
      setPlayerPos({ x, z, rotationY });
      sendTeleportRef.current?.(x, z, rotationY);
    },
    [npcSession]
  );

  const handleStartGuideToBooth = useCallback(
    (booth: V28BoothPlacementView) => {
      const tx = booth.approachPoint?.x ?? booth.positionX;
      const tz = booth.approachPoint?.z ?? booth.positionZ;
      const lookRot = Math.atan2(booth.positionX - tx, booth.positionZ - tz);
      teleportExploreToPoint(tx, tz, lookRot);
    },
    [teleportExploreToPoint]
  );

  // Reset similar-booths dismissal when switching booths or starting a new consultation
  useEffect(() => {
    setSimilarDismissed(false);
  }, [focusedBooth?.boothId, npcSession.sessionState]);

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
    if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) return saved;
    const palette = [
      '#0ea5e9',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#ef4444',
      '#14b8a6',
      '#6366f1',
      '#f97316',
      '#84cc16',
      '#06b6d4',
      '#d946ef',
      '#3b82f6',
      '#eab308',
      '#f43f5e',
      '#22c55e',
    ];
    const picked = palette[Math.floor(Math.random() * palette.length)] || '#0ea5e9';
    sessionStorage.setItem('expo_visitor_color', picked);
    return picked;
  });
  const [selectedProduct, setSelectedProduct] = useState<{
    booth: V28BoothPlacementView;
    product: V28Product;
    slotId: string;
  } | null>(null);
  const [playerTarget, setPlayerTarget] = useState<{ x: number; z: number } | null>(null);
  const [teleportState, setTeleportState] = useState<{
    nonce: number;
    pos: { x: number; z: number; rotationY: number; alignCamera?: boolean } | null;
  }>({ nonce: 0, pos: null });
  const [playerPos, setPlayerPos] = useState<V28PlayerState>({ x: 0, z: 20, rotationY: Math.PI });

  // Phase 1: Clickable 3D Booth Label -> Instant Teleport directly to booth approachPoint (explore mode, no auto-NPC)
  const handleAutoWalkToBooth = useCallback(
    (booth: V28BoothPlacementView) => {
      const tx = booth.approachPoint?.x ?? booth.positionX;
      const tz = booth.approachPoint?.z ?? booth.positionZ;
      if (!Number.isFinite(tx) || !Number.isFinite(tz)) {
        showNavNotice(`Không xác định được vị trí tới ${booth.boothName}.`);
        return;
      }
      const lookRot = Math.atan2(booth.positionX - tx, booth.positionZ - tz);
      teleportExploreToPoint(tx, tz, lookRot);
    },
    [teleportExploreToPoint, showNavNotice]
  );

  // Phase 1: Clickable 3D Zone Label -> Instant Teleport directly to valid zone entrance (explore mode)
  const handleAutoWalkToZone = useCallback(
    (zoneId: string) => {
      if (!world) return;
      const zone = world.zones.find((z) => z.id === zoneId);
      if (!zone) return;
      const route = computeGuidedZoneRoute(world, playerPos, zone);
      const dest = route.destinationPoint;
      if (!Number.isFinite(dest.x) || !Number.isFinite(dest.z)) {
        showNavNotice(`Không xác định được lối vào Khu ${zone.code}.`);
        return;
      }
      const zcx = zone.bounds ? (zone.bounds.minX + zone.bounds.maxX) / 2 : dest.x;
      const zcz = zone.bounds ? (zone.bounds.minZ + zone.bounds.maxZ) / 2 : dest.z;
      const lookRot = Math.hypot(zcx - dest.x, zcz - dest.z) > 0.2 ? Math.atan2(zcx - dest.x, zcz - dest.z) : Math.PI;
      teleportExploreToPoint(dest.x, dest.z, lookRot);
    },
    [world, playerPos, teleportExploreToPoint, showNavNotice]
  );

  const handleClearAutoWalkAndGuide = useCallback(() => {
    setAutoWalkRequest(null);
    setGuidedTargetBooth(null);
    setGuidedTargetZone(null);
  }, []);

  // Phase 2.3 & H3: Collision-free 3D guided route along world.walkwayGraph (Booth or Zone)
  const guidedRoute = useMemo(() => {
    if (!world || !guidedTargetBooth) return null;
    return computeGuidedRoute(world, playerPos, guidedTargetBooth);
  }, [world, guidedTargetBooth, playerPos]);

  const guidedZoneRoute = useMemo(() => {
    if (!world || !guidedTargetZone) return null;
    return computeGuidedZoneRoute(world, playerPos, guidedTargetZone);
  }, [world, guidedTargetZone, playerPos]);

  const activeNavWaypoints = useMemo<RoutePoint[] | null>(() => {
    if (guidedRoute && guidedRoute.waypoints.length >= 2) return guidedRoute.waypoints;
    if (guidedZoneRoute && guidedZoneRoute.waypoints.length >= 2) return guidedZoneRoute.waypoints;
    if (autoWalkRequest && autoWalkRequest.waypoints.length >= 2) return autoWalkRequest.waypoints;
    return null;
  }, [guidedRoute, guidedZoneRoute, autoWalkRequest]);

  // Auto-complete manual guided route when visitor walks manually within 4.0m of target booth approachPoint
  useEffect(() => {
    if (!guidedTargetBooth || autoWalkRequest) return;
    const tx = guidedTargetBooth.approachPoint?.x ?? guidedTargetBooth.positionX;
    const tz = guidedTargetBooth.approachPoint?.z ?? guidedTargetBooth.positionZ;
    if (Math.hypot(playerPos.x - tx, playerPos.z - tz) <= 4.0) {
      setGuidedTargetBooth(null);
    }
  }, [guidedTargetBooth, autoWalkRequest, playerPos.x, playerPos.z]);
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
      const { world: rawLoaded } = await v28Api.getActiveWorld(previewVersionId, bypassCache);
      const demoAgriRequested =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('demoAgri') === '1';
      const loaded = demoAgriRequested
        ? applyAgriDemoShowcaseOverlay(rawLoaded).world
        : rawLoaded;
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
            npcSession.stopSession();
            setNpcChatOpen(false);
            setChatAnimState('idle');
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
  // 1) After World 3D finishes loading, warm manifest (~5 KB) + 2 tiny shared opening clips (~167 KB, 0 MB ONNX)
  //    so even an immediate click without waiting for Focus preload starts speech right away.
  useEffect(() => {
    if (loading || !world) return;
    if (resolveNpcTtsMode() !== 'hybrid') return;
    if (!shouldAllowHybridPreload().allowed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void npcHybridTtsEngine.warmManifest().then((ok) => {
        if (!ok || controller.signal.aborted) return;
        void npcHybridTtsEngine.preloadChunks(
          [
            'Xin chào quý khách đến.',
            'Xin chào quý khách đến với gian hàng CELLPHONES.',
          ],
          { signal: controller.signal, maxConcurrency: 2, maxChunks: 2 }
        );
      });
    }, 1200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loading, world]);

  // Phase 1.7.3: Deferred background prewarm of Piper Worker + ONNX session after 3D exhibition is ready
  useEffect(() => {
    if (loading || !world) return;
    if (!shouldAllowHybridPreload().allowed) return;
    const timer = window.setTimeout(() => {
      void npcHybridTtsEngine.warmManifest().catch(() => false);
      void import('../services/hybridTtsAdapter')
        .then(({ piperBrowserTts, shouldAllowPiperBackgroundPrewarm }) => {
          if (shouldAllowPiperBackgroundPrewarm().allowed) {
            void piperBrowserTts.prewarmInBackground().catch(() => false);
          }
        })
        .catch(() => { });
    }, 3500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loading, world]);

  // 2) When visitor focuses a booth, selectively preload that booth's opening consultation audio (cancellable on booth switch, 0 auto-play):
  //    - Supertonic 3 active: pre-synthesizes the opening Greeting chunks so clicking "Nghe tư vấn" / NPC starts with 0ms wait!
  //    - Hybrid mode: preloads manifest-verified WAV chunks.
  useEffect(() => {
    if (!focusedBooth || cameraMode !== 'focus') return;
    if (!shouldAllowHybridPreload().allowed) return;

    const controller = new AbortController();
    const runPredictiveProductOpeningPreSynth = async (triggerSource: string, attempt = 0) => {
      if (!resolvePredictivePreSynthEnabled() || controller.signal.aborted) return;
      // Task 1 Safety Policy: Single-threaded WASM (non-crossOriginIsolated) cannot preempt an active
      // 4-7s ONNX inference, which can block foreground clicks up to ~4.6s. Skip speculative booth_focus
      // synthesis unless explicitly opted in via ?predictiveTts=on.
      const explicitlyOptedIn =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('predictiveTts')?.toLowerCase() === 'on';
      const isSingleThreadWasm = typeof window !== 'undefined' && !window.crossOriginIsolated;
      const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 768;
      if (!explicitlyOptedIn && (isSingleThreadWasm || isCompactViewport)) {
        return;
      }
      const modelReadyOrCached =
        piperBrowserTts.isModelReady() || (await hasCachedPiperModelInBrowser());
      if (!modelReadyOrCached || controller.signal.aborted) return;
      const gov = predictiveResourceGovernor.canRunBackgroundJob();
      if (!gov.allowed) {
        if (
          attempt < 3 &&
          (gov.reason === 'user_moving' ||
            gov.reason === 'frame_spike_cooldown' ||
            gov.reason === 'foreground_active')
        ) {
          window.setTimeout(() => {
            if (!controller.signal.aborted) {
              void runPredictiveProductOpeningPreSynth(triggerSource, attempt + 1);
            }
          }, 1500);
        }
        return;
      }
      const maxProducts = 1;

      const productFirstChunks: string[] = [];
      for (const sl of focusedBooth.slots) {
        if (!sl.product || productFirstChunks.length >= maxProducts) continue;
        const pSteps = buildProductConsultationSteps(focusedBooth, sl.product, sl.slotId);
        const firstText = pSteps[0]?.fallbackText;
        if (!firstText) continue;
        const plan = buildPiperStepPlanFromDisplayText(firstText);
        const openingChunk = plan.chunks[0];
        if (!openingChunk) continue;
        if (await npcHybridTtsEngine.hasPregenEntry(openingChunk)) continue;
        productFirstChunks.push(openingChunk);
      }

      if (productFirstChunks.length > 0 && !controller.signal.aborted) {
        void piperBrowserTts.preSynthesizeChunks({
          chunks: productFirstChunks,
          priority: 2,
          triggerSource,
          signal: controller.signal,
          maxChunks: maxProducts,
        });
      }
    };

    if (resolveNpcTtsProvider() === 'supertonic' && !supertonicTtsAdapter.isCircuitOpen()) {
      const steps = buildBoothConsultationSteps(focusedBooth);
      const openingSteps = steps.slice(0, 2); // Greeting + Product #1 opening
      const voicePreset = resolveSupertonicVoicePreset();
      const speed = resolveSupertonicSpeed();
      const openingChunks = openingSteps
        .flatMap((st) => buildSupertonicStepChunks(st.naturalSpeechText || st.fallbackText))
        .slice(0, 3);
      void (async () => {
        const stReady = await supertonicTtsAdapter.ensureServerReady(controller.signal);
        if (!stReady || controller.signal.aborted) {
          if (resolveNpcTtsMode() === 'hybrid' && !controller.signal.aborted) {
            const chunks = extractBoothConsultationChunks(focusedBooth);
            void npcHybridTtsEngine.preloadChunks(chunks, {
              signal: controller.signal,
              maxConcurrency: 2,
              maxChunks: 40,
            });
          }
          await runPredictiveProductOpeningPreSynth('booth_focus');
          return;
        }
        for (const ch of openingChunks) {
          if (controller.signal.aborted || supertonicTtsAdapter.isCircuitOpen()) break;
          await supertonicTtsAdapter
            .trySynthesizeChunk(ch, {
              voicePreset,
              speed,
              signal: controller.signal,
            })
            .catch(() => null);
        }
      })();
    } else if (resolveNpcTtsMode() === 'hybrid') {
      const chunks = extractBoothConsultationChunks(focusedBooth);
      void npcHybridTtsEngine.preloadChunks(chunks, {
        signal: controller.signal,
        maxConcurrency: 2,
        maxChunks: 40,
      });
      void runPredictiveProductOpeningPreSynth('booth_focus');
    } else {
      void runPredictiveProductOpeningPreSynth('booth_focus');
    }

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
      onAssignedColor: (assignedColor) => {
        setPlayerColor(assignedColor);
        sessionStorage.setItem('expo_visitor_color', assignedColor);
      },
    });
  sendTeleportRef.current = sendTeleport;

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
    if (isNpcConsultActive) {
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
    isNpcConsultActive,
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
      sessionStorage.setItem('expo_visitor_color_custom', '1');
      sendProfile(cleaned, nextColor);
    },
    [sendProfile]
  );

  const moveAvatarToBoothIfFar = useCallback(
    (booth: V28BoothPlacementView) => {
      const tx = booth.approachPoint?.x ?? booth.positionX;
      const tz = booth.approachPoint?.z ?? booth.positionZ;
      if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
      const dist = Math.hypot(playerPos.x - tx, playerPos.z - tz);
      if (dist <= 2.2) return;
      const lookRot = Math.atan2(booth.positionX - tx, booth.positionZ - tz);
      setAutoWalkRequest(null);
      setGuidedTargetBooth(null);
      setGuidedTargetZone(null);
      setPlayerTarget(null);
      setTeleportState((prev) => ({
        nonce: prev.nonce + 1,
        pos: { x: tx, z: tz, rotationY: lookRot, alignCamera: true },
      }));
      setPlayerPos({ x: tx, z: tz, rotationY: lookRot });
      sendTeleport(tx, tz, lookRot);
    },
    [playerPos.x, playerPos.z, sendTeleport]
  );

  const handleTeleportToBooth = useCallback((booth: V28BoothPlacementView) => {
    if (cameraMode === 'overview' || cameraMode === 'explore') {
      previousExteriorModeRef.current = cameraMode;
    }
    if (npcSession.activeBoothId && npcSession.activeBoothId !== booth.boothId) {
      npcSession.stopSession();
    }
    const lookRot = Math.atan2(
      booth.positionX - booth.approachPoint.x,
      booth.positionZ - booth.approachPoint.z
    );
    setAutoWalkRequest(null);
    setGuidedTargetBooth(null);
    setGuidedTargetZone(null);
    setPlayerTarget(null);
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: { x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot, alignCamera: true },
    }));
    setPlayerPos({ x: booth.approachPoint.x, z: booth.approachPoint.z, rotationY: lookRot });
    sendTeleport(booth.approachPoint.x, booth.approachPoint.z, lookRot);
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setCameraMode('focus');
  }, [cameraMode, sendTeleport, npcSession]);

  const handleFocusBooth = useCallback((booth: V28BoothPlacementView) => {
    if (cameraMode === 'overview' || cameraMode === 'explore') {
      previousExteriorModeRef.current = cameraMode;
    }
    if (npcSession.activeBoothId && npcSession.activeBoothId !== booth.boothId) {
      npcSession.stopSession();
    }
    moveAvatarToBoothIfFar(booth);
    setFocusedBooth(booth);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setCameraMode('focus');
  }, [cameraMode, npcSession, moveAvatarToBoothIfFar]);

  const handleSelectProduct = useCallback(
    (booth: V28BoothPlacementView, product: V28Product, slotId: string) => {
      if (cameraMode === 'overview' || cameraMode === 'explore') {
        previousExteriorModeRef.current = cameraMode;
      }
      moveAvatarToBoothIfFar(booth);
      setFocusedBooth(booth);
      setSelectedProduct({ booth, product, slotId });
      setNpcChatOpen(false);
      setChatAnimState('idle');
      setCameraMode('focus');
      npcSession.startProductConsultation(booth, product, slotId);
    },
    [cameraMode, npcSession, moveAvatarToBoothIfFar]
  );

  const handleCloseProduct = useCallback(() => {
    if (npcSession.consultationMode === 'product') {
      npcSession.stopPlaybackOnly();
    }
    setSelectedProduct(null);
  }, [npcSession]);

  const handleExitBoothFocus = useCallback((forceExplore = false) => {
    npcSession.stopSession();
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setChatAnimState('idle');
    setCameraMode(forceExplore ? 'explore' : previousExteriorModeRef.current);
  }, [npcSession]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as { __V28_DEV_QA__?: unknown }).__V28_DEV_QA__ = {
      getWorld: () => world,
      getFocusedBooth: () => focusedBooth,
      getNpcSession: () => npcSession,
      teleportToBooth: handleTeleportToBooth,
      selectProduct: handleSelectProduct,
      closeProduct: handleCloseProduct,
      exitBooth: handleExitBoothFocus,
    };
  });

  // Single unified Escape & WASD keyboard handler (Modal-first priority matching V27.5 BoothPanel)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
      if (e.key === 'Escape') {
        if (npcChatOpen) {
          e.preventDefault();
          setNpcChatOpen(false);
          setChatAnimState('idle');
          return;
        }
        if (selectedProduct) {
          e.preventDefault();
          handleCloseProduct();
          return;
        }
        if (cameraMode === 'focus' || focusedBooth) {
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
  }, [cameraMode, focusedBooth, selectedProduct, npcChatOpen, handleCloseProduct, handleExitBoothFocus]);

  const handleReturnToMainAvenue = useCallback(() => {
    if (!world) return;
    npcSession.stopSession();
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setChatAnimState('idle');
    setAutoWalkRequest(null);
    setGuidedTargetBooth(null);
    setGuidedTargetZone(null);
    setPlayerTarget(null);
    setCameraMode('explore');
    previousExteriorModeRef.current = 'explore';

    const ave = world.centralAvenueBounds;
    const centerX = ave ? (ave.minX + ave.maxX) / 2 : world.spawnPoint.x;
    const minSafeZ = ave ? ave.minZ + 1.5 : world.spawnPoint.z;
    const maxSafeZ = ave ? Math.min(ave.maxZ - 2.5, world.spawnPoint.z) : world.spawnPoint.z;
    const targetZ =
      minSafeZ <= maxSafeZ
        ? Math.max(minSafeZ, Math.min(maxSafeZ, playerPos.z))
        : world.spawnPoint.z;
    const targetRotY = world.spawnPoint.rotationY;

    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: {
        x: centerX,
        z: targetZ,
        rotationY: targetRotY,
        alignCamera: true,
      },
    }));
    sendTeleport(centerX, targetZ, targetRotY);
  }, [world, playerPos.z, sendTeleport, npcSession]);

  const handleReturnToCenter = useCallback(() => {
    if (!world) return;
    npcSession.stopSession();
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setChatAnimState('idle');
    setAutoWalkRequest(null);
    setGuidedTargetBooth(null);
    setGuidedTargetZone(null);
    setPlayerTarget(null);
    setCameraMode('explore');
    previousExteriorModeRef.current = 'explore';
    setTeleportState((prev) => ({
      nonce: prev.nonce + 1,
      pos: {
        x: world.spawnPoint.x,
        z: world.spawnPoint.z,
        rotationY: world.spawnPoint.rotationY,
        alignCamera: true,
      },
    }));
    sendTeleport(world.spawnPoint.x, world.spawnPoint.z, world.spawnPoint.rotationY);
  }, [world, sendTeleport, npcSession]);

  const handleFloorClick = useCallback((x: number, z: number) => {
    if (cameraMode === 'focus') {
      handleExitBoothFocus(true);
      return;
    }
    npcSession.stopSession();
    setAutoWalkRequest(null);
    setGuidedTargetBooth(null);
    setGuidedTargetZone(null);
    setPlayerTarget({ x, z });
    setFocusedBooth(null);
    setSelectedProduct(null);
    setNpcChatOpen(false);
    setChatAnimState('idle');
  }, [cameraMode, handleExitBoothFocus, npcSession]);

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
        autoWalkRequest={autoWalkRequest}
        activeTargetBoothId={guidedTargetBooth?.boothId ?? null}
        activeTargetZoneId={guidedTargetZone?.id ?? null}
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
        npcAnimState={effectiveNpcAnimState}
        isNpcSpeaking={npcSession.sessionState === 'SPEAKING' || npcSession.sessionState === 'LOADING'}
        npcSessionState={npcSession.sessionState}
        activeNpcBoothId={npcSession.activeBoothId}
        highlightedProduct={npcSession.highlightedProduct}
        guidedRoute={guidedRoute}
        activeNavWaypoints={activeNavWaypoints}
        onCameraYawChange={handleCameraYawChange}
        playerName={playerName}
        playerColor={playerColor}
        onPlayerMove={(pos) => {
          setPlayerPos(pos);
          sendMove(pos.x, pos.z, pos.rotationY);
        }}
        onFloorClick={handleFloorClick}
        onClickBoothIndicator={handleAutoWalkToBooth}
        onClickZoneIndicator={handleAutoWalkToZone}
        onAutoWalkComplete={handleClearAutoWalkAndGuide}
        onAutoWalkCancel={handleClearAutoWalkAndGuide}
        onFocusBooth={handleFocusBooth}
        onSelectProduct={handleSelectProduct}
        visitedBoothIds={visitedBoothIds}
        favoriteBoothIds={favoriteBoothIdSet}
        onToggleFavoriteBooth={handleToggleFavoriteBooth}
        onClickNpc={(booth) => {
          if (cameraMode === 'overview' || cameraMode === 'explore') {
            previousExteriorModeRef.current = cameraMode;
          }
          moveAvatarToBoothIfFar(booth);
          setFocusedBooth(booth);
          setSelectedProduct(null);
          setNpcChatOpen(false);
          setCameraMode('focus');
          npcSession.handleNpcClick(booth);
        }}
        onOpenDirectoryMap={() => setDirectoryOpenNonce((n) => n + 1)}
        onboardingGuideSignal={onboardingGuideSignal}
        onClickWelcomeGuide={() => setReplayOnboardingNonce((n) => n + 1)}
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
        onReturnToMainAvenue={handleReturnToMainAvenue}
        onReturnToCenter={handleReturnToCenter}
        playerPos={playerPos}
        visitedBoothIds={visitedBoothIds}
        favoriteBoothIds={favoriteBoothIdSet}
        onToggleFavoriteBooth={handleToggleFavoriteBooth}
        journeyStatus={journeyStatus}
        rewardStatus={rewardStatus}
        onRewardStatusUpdated={setRewardStatus}
        focusedBooth={focusedBooth}
        selectedProduct={selectedProduct}
        npcPanelOpen={false}
        npcChatOpen={npcChatOpen}
        npcIsMuted={npcSession.isMuted}
        npcSessionState={npcSession.sessionState}
        npcSubtitle={npcSession.currentSubtitle}
        similarBooths={similarBooths}
        showSimilarBooths={
          cameraMode === 'focus' &&
          Boolean(focusedBooth) &&
          npcSession.consultationMode === 'booth' &&
          npcSession.sessionState === 'COMPLETED' &&
          npcSession.activeBoothId === focusedBooth?.boothId &&
          !similarDismissed
        }
        guidedRoute={guidedRoute}
        activeNavWaypoints={activeNavWaypoints}
        navNoticeToast={navNoticeToast}
        cameraYaw={cameraYaw}
        onStartGuideToBooth={handleStartGuideToBooth}
        onCancelGuide={handleClearAutoWalkAndGuide}
        directoryOpenNonce={directoryOpenNonce}
        replayOnboardingNonce={replayOnboardingNonce}
        isNpcConsultActive={isNpcConsultActive}
        onOnboardingSignalChange={setOnboardingGuideSignal}
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
            npcSession.stopSession();
            setFocusedBooth(null);
            setSelectedProduct(null);
            setNpcChatOpen(false);
            setChatAnimState('idle');
          }
        }}
        onTeleportToBooth={handleTeleportToBooth}
        onSelectProduct={handleSelectProduct}
        onCloseProduct={handleCloseProduct}
        onCloseFocus={() => handleExitBoothFocus(false)}
        onOpenNpcPanel={() => {
          if (focusedBooth) {
            setSelectedProduct(null);
            npcSession.handleNpcClick(focusedBooth);
          }
        }}
        onCloseNpcPanel={() => {
          npcSession.stopSession();
        }}
        onOpenNpcChat={() => {
          npcSession.pauseSession();
          setNpcChatOpen(true);
        }}
        onCloseNpcChat={() => {
          setNpcChatOpen(false);
          setChatAnimState('idle');
        }}
        onToggleNpcMute={npcSession.toggleMute}
        onReplayProductConsultation={() => {
          if (selectedProduct) {
            npcSession.startProductConsultation(
              selectedProduct.booth,
              selectedProduct.product,
              selectedProduct.slotId,
              { forceReplay: true }
            );
          }
        }}
        onDismissSimilarBooths={() => setSimilarDismissed(true)}
        onNpcAnimStateChange={setChatAnimState}
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
