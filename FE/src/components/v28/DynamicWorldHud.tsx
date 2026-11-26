import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  type V28BoothPlacementView,
  type V28ExhibitionVersionDetail,
  type V28Product,
  type V28VisitorRewardStatusResponse,
} from '../../services/v28Api';
import type { V28CameraMode, V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';
import type { V28GraphicsQualityMode } from '../../scene/v28/v28MobileControls';
import { SimilarBoothsCard } from './SimilarBoothsCard';
import { NavigationGuidanceHud } from './NavigationGuidanceHud';
import type { SimilarBoothSuggestion } from '../../services/similarBooths';
import {
  computeDirectionIndicators,
  computeZoneGuidance,
  formatZoneNavigationSubtitle,
  shouldEmitZoneTransition,
  type GuidedRouteResult,
  type RoutePoint,
} from '../../services/v28NavigationEngine';
import { MobileProductBottomSheet } from './MobileProductBottomSheet';
import { DesktopProductDetailCard } from './DesktopProductDetailCard';
import { WorldMinimapTopRight } from './WorldMinimapTopRight';
import { NearbyDiscoveryWidget } from './NearbyDiscoveryWidget';
import { V28SvgIcon } from './V28SvgIcon';

const V28NpcChatModal = lazy(() =>
  import('./V28NpcChatModal').then((m) => ({ default: m.V28NpcChatModal }))
);
const InteractiveMap2D = lazy(() =>
  import('./InteractiveMap2D').then((m) => ({ default: m.InteractiveMap2D }))
);
const RewardRedemptionModal = lazy(() =>
  import('./RewardRedemptionModal').then((m) => ({ default: m.RewardRedemptionModal }))
);
import {
  resolveControlGuideMode,
  VisualControlGuideContent,
  VisualControlGuideModal,
} from './VisualControlGuide';
import type { V28OnboardingGuideSignal } from '../../services/v28OnboardingStateMachine';

export interface DynamicWorldHudProps {
  world: V28ExhibitionVersionDetail;
  isPreviewMode: boolean;
  cameraMode: V28CameraMode;
  isMobilePortrait: boolean;
  isMobileViewport?: boolean;
  isMobileLandscape?: boolean;
  graphicsQuality?: V28GraphicsQualityMode;
  onChangeGraphicsQuality?: (mode: V28GraphicsQualityMode) => void;
  onReturnToMainAvenue?: () => void;
  onReturnToCenter?: () => void;
  playerPos: V28PlayerState;
  visitedBoothIds?: ReadonlySet<string>;
  favoriteBoothIds?: ReadonlySet<string>;
  onToggleFavoriteBooth?: (booth: V28BoothPlacementView) => void;
  journeyStatus?: 'loading' | 'ready' | 'error';
  rewardStatus?: V28VisitorRewardStatusResponse | null;
  onRewardStatusUpdated?: (next: V28VisitorRewardStatusResponse) => void;
  focusedBooth: V28BoothPlacementView | null;
  selectedProduct: { booth: V28BoothPlacementView; product: V28Product; slotId: string } | null;
  npcPanelOpen: boolean;
  npcChatOpen?: boolean;
  npcIsMuted?: boolean;
  npcSessionState?: 'IDLE' | 'LOADING' | 'SPEAKING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  npcSubtitle?: string | null;
  similarBooths?: SimilarBoothSuggestion[];
  showSimilarBooths?: boolean;
  guidedRoute?: GuidedRouteResult | null;
  activeNavWaypoints?: RoutePoint[] | null;
  navNoticeToast?: string | null;
  cameraYaw?: number;
  onStartGuideToBooth?: (booth: V28BoothPlacementView) => void;
  onCancelGuide?: () => void;
  directoryOpenNonce?: number;
  replayOnboardingNonce?: number;
  isNpcConsultActive?: boolean;
  onOnboardingSignalChange?: (signal: V28OnboardingGuideSignal) => void;
  playerName?: string;
  playerColor?: string;
  onUpdateVisitorProfile?: (name: string, color: string) => void;
  onlineCount?: number;
  overflowVisitorCount?: number;
  onChangeCameraMode: (mode: V28CameraMode) => void;
  onTeleportToBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  onCloseProduct: () => void;
  onCloseFocus: () => void;
  onOpenNpcPanel: () => void;
  onCloseNpcPanel: () => void;
  onOpenNpcChat?: () => void;
  onCloseNpcChat?: () => void;
  onToggleNpcMute?: () => void;
  onReplayProductConsultation?: () => void;
  onDismissSimilarBooths?: () => void;
  onNpcAnimStateChange: (state: V28NpcAnimState) => void;
  onJoystickChange: (vec: { x: number; y: number }) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onOpenAdmin?: () => void;
}

function getSafeWebsiteUrl(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const DynamicWorldHud: React.FC<DynamicWorldHudProps> = ({
  world,
  isPreviewMode,
  cameraMode,
  isMobilePortrait,
  isMobileViewport = false,
  isMobileLandscape = false,
  graphicsQuality = 'auto',
  onChangeGraphicsQuality,
  onReturnToMainAvenue,
  onReturnToCenter,
  playerPos,
  visitedBoothIds,
  favoriteBoothIds,
  onToggleFavoriteBooth,
  journeyStatus = 'ready',
  rewardStatus = null,
  onRewardStatusUpdated,
  focusedBooth,
  selectedProduct,
  npcPanelOpen: _npcPanelOpen,
  npcChatOpen = false,
  npcIsMuted = false,
  npcSessionState = 'IDLE',
  npcSubtitle = null,
  similarBooths = [],
  showSimilarBooths = false,
  guidedRoute = null,
  activeNavWaypoints = null,
  navNoticeToast = null,
  cameraYaw = Math.PI,
  onStartGuideToBooth,
  onCancelGuide,
  directoryOpenNonce = 0,
  replayOnboardingNonce = 0,
  isNpcConsultActive = false,
  onOnboardingSignalChange,
  playerName = 'Khách V28',
  playerColor = '#0ea5e9',
  onUpdateVisitorProfile,
  onlineCount = 1,
  overflowVisitorCount = 0,
  onChangeCameraMode,
  onTeleportToBooth,
  onSelectProduct,
  onCloseProduct,
  onCloseFocus,
  onOpenNpcPanel,
  onCloseNpcPanel: _onCloseNpcPanel,
  onOpenNpcChat,
  onCloseNpcChat,
  onToggleNpcMute,
  onReplayProductConsultation,
  onDismissSimilarBooths,
  onNpcAnimStateChange,
  onZoomIn,
  onZoomOut,
}) => {
  const isMobileUi = isMobileViewport || isMobilePortrait || isMobileLandscape;
  const [directoryOpen, setDirectoryOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState<boolean>(false);
  const [rewardModalOpen, setRewardModalOpen] = useState<boolean>(false);
  const [controlsGuideOpen, setControlsGuideOpen] = useState<boolean>(false);
  const [desktopGuideModalOpen, setDesktopGuideModalOpen] = useState<boolean>(false);
  const defaultControlGuideMode = resolveControlGuideMode({ isMobileUi, isMobileLandscape });
  const isBoothFocusActive = cameraMode === 'focus' && Boolean(focusedBooth);
  const isFocusedVisited = Boolean(focusedBooth && visitedBoothIds?.has(focusedBooth.boothId));
  const isFocusedFavorite = Boolean(focusedBooth && favoriteBoothIds?.has(focusedBooth.boothId));
  const [showFirstVisitHint, setShowFirstVisitHint] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('v28_mobile_touch_hint_seen');
    } catch {
      return false;
    }
  });

  // Phase 2.3 & 2.4: Live camera-relative directional arrows & real-data zone guidance
  const activeRouteIndicator = useMemo(() => {
    if (!guidedRoute) return null;
    return computeDirectionIndicators(playerPos, cameraYaw, [guidedRoute.targetBooth], 1)[0] || null;
  }, [guidedRoute, playerPos, cameraYaw]);

  const suggestedNavIndicators = useMemo(() => {
    if (guidedRoute) return [];
    // Prioritize populated booths closest to visitor (up to 3)
    const populated = world.booths.filter((b) => b.assignedSlotCount > 0);
    const pool = populated.length > 0 ? populated : world.booths.slice(0, 6);
    const sorted = [...pool].sort((a, b) => {
      const da = Math.hypot((a.approachPoint?.x ?? a.positionX) - playerPos.x, (a.approachPoint?.z ?? a.positionZ) - playerPos.z);
      const db = Math.hypot((b.approachPoint?.x ?? b.positionX) - playerPos.x, (b.approachPoint?.z ?? b.positionZ) - playerPos.z);
      return da - db;
    });
    return computeDirectionIndicators(playerPos, cameraYaw, sorted, 3);
  }, [guidedRoute, world.booths, playerPos, cameraYaw]);

  const zoneGuidance = useMemo(
    () => computeZoneGuidance(world.zones, playerPos, cameraYaw),
    [world.zones, playerPos, cameraYaw]
  );

  const [zoneToastText, setZoneToastText] = useState<string | null>(null);
  const prevZoneIdRef = useRef<string | null>(null);
  const zoneCooldownMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const nextZone = zoneGuidance.currentZone;
    const nextId = nextZone?.id ?? null;
    if (shouldEmitZoneTransition(prevZoneIdRef.current, nextId, zoneCooldownMapRef.current, Date.now(), 8000) && nextZone) {
      setZoneToastText(`Khu ${nextZone.code} — ${formatZoneNavigationSubtitle(nextZone)}`);
      const t = window.setTimeout(() => setZoneToastText(null), 3200);
      prevZoneIdRef.current = nextId;
      return () => window.clearTimeout(t);
    }
    prevZoneIdRef.current = nextId;
  }, [zoneGuidance.currentZone]);

  useEffect(() => {
    if (!isMobileUi || !showFirstVisitHint) return;
    const dismiss = () => {
      setShowFirstVisitHint(false);
      try {
        localStorage.setItem('v28_mobile_touch_hint_seen', '1');
      } catch {
        // ignore storage error
      }
    };
    const timer = window.setTimeout(dismiss, 5500);
    window.addEventListener('pointerdown', dismiss, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, [isMobileUi, showFirstVisitHint]);

  useEffect(() => {
    if (directoryOpenNonce > 0) {
      setDirectoryOpen(true);
      setMobileMenuOpen(false);
    }
  }, [directoryOpenNonce]);
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>(playerName);
  const [draftColor, setDraftColor] = useState<string>(playerColor);

  const focusedWebsiteUrl = getSafeWebsiteUrl(focusedBooth?.contactUrl);
  const focusedTotalSlots = Math.max(1, focusedBooth?.slots?.length || 6);
  const focusedCategoryLabel =
    (focusedBooth?.zoneCategoryTag && focusedBooth.zoneCategoryTag !== 'Chưa phân bổ'
      ? focusedBooth.zoneCategoryTag
      : focusedBooth?.category) || 'Triển lãm V28';

  // Close collapsible menus when entering booth focus or selecting a product
  useEffect(() => {
    if (isBoothFocusActive || selectedProduct) {
      setMobileMenuOpen(false);
      setDesktopMoreOpen(false);
    }
  }, [isBoothFocusActive, selectedProduct]);

  return (
    <div
      className="v28-world-hud"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isMobileUi
          ? 'max(8px, env(safe-area-inset-top, 8px)) max(10px, env(safe-area-inset-right, 10px)) max(10px, env(safe-area-inset-bottom, 10px)) max(10px, env(safe-area-inset-left, 10px))'
          : '14px 18px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* =====================================================================
       * MODE A: BOOTH FOCUS TOOLBAR (Synchronized with V27.5 Hình 1)
       * [← Quay lại khu triển lãm Esc] [Danh mục] [Doanh nghiệp] [Website ↗] [Nghe tư vấn viên giới thiệu]
       * ===================================================================== */}
      {isBoothFocusActive && focusedBooth ? (
        isMobileUi ? (
          /* Mobile-First Compact Booth Focus Bar — single slim row, never covers booth signage or products! */
          <div
            role="toolbar"
            aria-label="Thanh điều khiển gian hàng đang xem"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              background: 'rgba(15, 23, 42, 0.84)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 12,
              padding: '4px 6px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              boxShadow: '0 6px 20px rgba(15, 23, 42, 0.24)',
            }}
          >
            <button
              type="button"
              onClick={onCloseFocus}
              aria-label="Quay lại khu triển lãm"
              style={{
                minWidth: 44,
                minHeight: 40,
                padding: '0 10px',
                borderRadius: 9,
                border: 'none',
                background: '#f59e0b',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              ← Quay lại
            </button>

            {/* Phase 6.2: Compact non-duplicate context pill (full business name is prominently shown on 3D booth signage) */}
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                data-testid="v28-focus-compact-meta-mobile"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#e2e8f0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                #{Math.max(1, (focusedBooth.slotIndex ?? 0) + 1)} · Khu {focusedBooth.zoneCode} · {focusedBooth.assignedSlotCount}/{focusedTotalSlots} SP
              </div>
              {isFocusedVisited && (
                <span
                  data-testid="v28-focus-visited-badge-mobile"
                  title="Bạn đã xem qua gian hàng này"
                  style={{
                    flexShrink: 0,
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: 'rgba(16, 185, 129, 0.22)',
                    border: '1px solid rgba(52, 211, 153, 0.65)',
                    color: '#a7f3d0',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✓ Đã xem qua
                </span>
              )}
            </div>

            {onToggleFavoriteBooth && (
              <button
                type="button"
                data-testid="v28-focus-favorite-btn-mobile"
                aria-pressed={isFocusedFavorite}
                onClick={() => onToggleFavoriteBooth(focusedBooth)}
                aria-label={isFocusedFavorite ? 'Bỏ ghim gian hàng khỏi yêu thích' : 'Ghim gian hàng vào yêu thích'}
                title={isFocusedFavorite ? 'Đã ghim yêu thích' : 'Ghim yêu thích'}
                style={{
                  minWidth: 40,
                  minHeight: 40,
                  padding: '0 8px',
                  borderRadius: 9,
                  border: isFocusedFavorite
                    ? '1px solid rgba(251, 113, 133, 0.75)'
                    : '1px solid rgba(148, 163, 184, 0.35)',
                  background: isFocusedFavorite ? 'rgba(225, 29, 72, 0.85)' : 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <V28SvgIcon name={isFocusedFavorite ? 'heart-filled' : 'heart'} size={16} />
              </button>
            )}

            {onToggleNpcMute && (
              <button
                type="button"
                data-testid="v28-focus-mute-btn"
                onClick={onToggleNpcMute}
                aria-label={npcIsMuted ? 'Bật âm thanh tư vấn' : 'Tắt âm thanh tư vấn'}
                title={npcIsMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                style={{
                  minWidth: 40,
                  minHeight: 40,
                  padding: '0 8px',
                  borderRadius: 9,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: npcIsMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: 15,
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <V28SvgIcon name={npcIsMuted ? 'audio-off' : 'audio-on'} size={17} />
              </button>
            )}

            {onOpenNpcChat && (
              <button
                type="button"
                data-testid="v28-focus-chat-btn"
                onClick={onOpenNpcChat}
                aria-label="Mở khung chat với nhân viên tư vấn"
                style={{
                  minWidth: 44,
                  minHeight: 40,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  background: 'rgba(14, 165, 233, 0.22)',
                  color: '#e0f2fe',
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <V28SvgIcon name="chat" size={14} />
                Chat
              </button>
            )}

            {focusedWebsiteUrl && (
              <a
                href={focusedWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Mở website doanh nghiệp"
                style={{
                  minWidth: 44,
                  minHeight: 40,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontSize: 12.5,
                  fontWeight: 700,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <V28SvgIcon name="globe" size={14} />
                Web ↗
              </a>
            )}
          </div>
        ) : (
          /* Desktop Compact Single-Row Booth Focus Bar (duplicate NPC button removed — entry point is on 3D NPC) */
          <div
            className="shop-showcase-corner-hud"
            role="toolbar"
            aria-label="Thanh điều khiển gian hàng đang xem"
            style={{
              position: 'static',
              pointerEvents: 'auto',
              alignSelf: 'flex-start',
              maxWidth: '100%',
              flexWrap: 'nowrap',
              gap: 6,
              padding: '4px 6px',
            }}
          >
            <button
              type="button"
              className="shop-showcase-back-btn"
              onClick={onCloseFocus}
              title="Thoát gian hàng và quay lại khu triển lãm (Phím Esc)"
              aria-label="Quay lại khu triển lãm"
              style={{ padding: '6px 12px', fontSize: 13, minHeight: 34 }}
            >
              ← Quay lại <kbd>Esc</kbd>
            </button>

            {/* Phase 6.2: Compact non-duplicate badge (business name lives cleanly on the 3D Booth Signage Board) */}
            <div
              className="shop-showcase-booth-banner"
              data-testid="v28-focus-compact-meta"
              title={`${focusedBooth.companyName || focusedBooth.boothName} · ${focusedCategoryLabel} · ${focusedBooth.assignedSlotCount}/${focusedTotalSlots} sản phẩm`}
              style={{ maxWidth: 460, padding: '4px 10px', minHeight: 34, flexWrap: 'nowrap' }}
            >
              <span
                className="expo-dialog__badge"
                style={{ backgroundColor: focusedBooth.color || '#0ea5e9', flexShrink: 0, fontSize: 11, padding: '2px 7px' }}
              >
                #{Math.max(1, (focusedBooth.slotIndex ?? 0) + 1)} · Khu {focusedBooth.zoneCode}
              </span>
              <span
                className="shop-showcase-booth-banner__sub"
                style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {focusedCategoryLabel} · {focusedBooth.assignedSlotCount}/{focusedTotalSlots} SP
              </span>
              {isFocusedVisited && (
                <span
                  data-testid="v28-focus-visited-badge"
                  title="Bạn đã xem qua gian hàng này"
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(16, 185, 129, 0.22)',
                    border: '1px solid rgba(52, 211, 153, 0.65)',
                    color: '#a7f3d0',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✓ Đã xem qua
                </span>
              )}
            </div>

            {onToggleFavoriteBooth && (
              <button
                type="button"
                data-testid="v28-focus-favorite-btn"
                aria-pressed={isFocusedFavorite}
                onClick={() => onToggleFavoriteBooth(focusedBooth)}
                className="btn btn--outline btn--sm"
                aria-label={isFocusedFavorite ? 'Bỏ ghim gian hàng khỏi yêu thích' : 'Ghim gian hàng vào yêu thích'}
                title={isFocusedFavorite ? 'Đã ghim gian hàng vào yêu thích' : 'Ghim gian hàng vào yêu thích'}
                style={{
                  minHeight: 34,
                  padding: '4px 10px',
                  fontSize: 12.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                  borderColor: isFocusedFavorite ? '#e11d48' : undefined,
                  background: isFocusedFavorite ? '#e11d48' : undefined,
                  color: isFocusedFavorite ? '#ffffff' : undefined,
                }}
              >
                <V28SvgIcon name={isFocusedFavorite ? 'heart-filled' : 'heart'} size={14} />
                {isFocusedFavorite ? 'Đã thích' : 'Yêu thích'}
              </button>
            )}

            {onToggleNpcMute && (
              <button
                type="button"
                data-testid="v28-focus-mute-btn"
                onClick={onToggleNpcMute}
                className="btn btn--outline btn--sm"
                aria-label={npcIsMuted ? 'Bật âm thanh tư vấn' : 'Tắt âm thanh tư vấn'}
                title={npcIsMuted ? 'Bật âm thanh tư vấn' : 'Tắt âm thanh tư vấn'}
                style={{ minHeight: 34, minWidth: 36, padding: '4px 8px', fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <V28SvgIcon name={npcIsMuted ? 'audio-off' : 'audio-on'} size={15} />
              </button>
            )}

            {onOpenNpcChat && (
              <button
                type="button"
                data-testid="v28-focus-chat-btn"
                onClick={onOpenNpcChat}
                className="btn btn--outline btn--sm"
                aria-label="Mở khung chat với nhân viên tư vấn"
                style={{ minHeight: 34, padding: '4px 10px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
              >
                <V28SvgIcon name="chat" size={14} />
                Chat
              </button>
            )}

            {focusedWebsiteUrl && (
              <a
                href={focusedWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline btn--sm"
                style={{ minHeight: 34, padding: '4px 10px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
              >
                <V28SvgIcon name="globe" size={14} />
                Website ↗
              </a>
            )}
          </div>
        )
      ) : (
        /* ===================================================================
         * H1: COMPACT TOP-RIGHT CORNER CLUSTER (Horizontal Top Header removed)
         * Keeps full access to Map/Minimap + ⋯ Menu (Progress, Rewards, Profile,
         * Return to Center, Controls Guide, Replay Onboarding, Graphics, Online)
         * =================================================================== */
        <div
          data-testid="v28-top-right-hud-cluster"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: isMobileUi ? 'max(10px, env(safe-area-inset-top, 10px))' : 14,
            right: isMobileUi ? 'max(10px, env(safe-area-inset-right, 10px))' : 14,
            zIndex: 28,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            gap: isMobileUi ? 6 : 8,
          }}
        >
          {isPreviewMode && (
            <span
              data-testid="v28-draft-preview-badge"
              style={{
                pointerEvents: 'auto',
                background: 'rgba(2, 132, 199, 0.94)',
                color: '#fff',
                padding: isMobileUi ? '4px 7px' : '5px 9px',
                borderRadius: 8,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.02em',
                boxShadow: '0 6px 16px rgba(15, 23, 42, 0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              DRAFT PREVIEW
            </span>
          )}

          {/* Compact ⋯ Secondary Controls Menu Button */}
          <div style={{ position: 'relative', pointerEvents: 'auto' }}>
            <button
              type="button"
              data-testid="v28-hud-more-btn"
              aria-expanded={isMobileUi ? mobileMenuOpen : desktopMoreOpen}
              aria-label="Mở menu tùy chọn triển lãm"
              title="Tùy chọn & thông tin triển lãm"
              onClick={() => {
                setDirectoryOpen(false);
                if (isMobileUi) {
                  setMobileMenuOpen((v) => !v);
                } else {
                  setDesktopMoreOpen((v) => !v);
                }
              }}
              style={{
                position: 'relative',
                minWidth: isMobileUi ? 40 : 38,
                minHeight: isMobileUi ? 40 : 38,
                padding: '0 10px',
                borderRadius: 11,
                border:
                  (isMobileUi ? mobileMenuOpen : desktopMoreOpen)
                    ? '1.5px solid #38bdf8'
                    : '1px solid rgba(148, 163, 184, 0.34)',
                background:
                  (isMobileUi ? mobileMenuOpen : desktopMoreOpen)
                    ? 'rgba(2, 132, 199, 0.92)'
                    : 'rgba(15, 23, 42, 0.84)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#f8fafc',
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.28)',
              }}
            >
              <V28SvgIcon name={(isMobileUi ? mobileMenuOpen : desktopMoreOpen) ? 'close' : 'menu'} size={17} />
              {rewardStatus?.eligibleToSubmit && (
                <span
                  aria-label="Đủ điều kiện nhận quà"
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#10b981',
                    border: '2px solid #0f172a',
                  }}
                />
              )}
            </button>

            {!isMobileUi && desktopMoreOpen && (
              <div
                data-testid="v28-hud-more-menu"
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 288,
                  background: 'rgba(15, 23, 42, 0.96)',
                  backdropFilter: 'blur(14px)',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  boxShadow: '0 16px 38px rgba(15, 23, 42, 0.42)',
                  padding: 12,
                  color: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  zIndex: 40,
                }}
              >
                {/* Exhibition Name, Visit Progress & Online Count */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    paddingBottom: 8,
                    borderBottom: '1px solid rgba(148,163,184,0.18)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', lineHeight: 1.25 }}>
                    {world.exhibitionName || 'Grand Expo World V28'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#cbd5e1' }}>
                    <strong
                      data-testid="v28-visit-progress"
                      style={{ color: journeyStatus === 'error' ? '#fca5a5' : '#38bdf8' }}
                    >
                      Đã tham quan:{' '}
                      {journeyStatus === 'loading'
                        ? '...'
                        : `${Math.min(world.booths.length, visitedBoothIds?.size ?? 0)}/${world.booths.length}`}{' '}
                      gian
                    </strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="status-dot status-dot--online" />
                      {onlineCount} online
                      {overflowVisitorCount > 0 && ` (+${overflowVisitorCount})`}
                    </span>
                  </div>
                </div>

                {/* Reward Progress & Redemption */}
                <button
                  type="button"
                  data-testid="v28-reward-trigger"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setDesktopMoreOpen(false);
                    setDirectoryOpen(false);
                    setRewardModalOpen(true);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    ...(rewardStatus?.eligibleToSubmit
                      ? { background: '#10b981', borderColor: '#34d399', color: '#ffffff' }
                      : {}),
                  }}
                >
                  <V28SvgIcon name="gift" size={14} />
                  {rewardStatus?.redemption
                    ? rewardStatus.redemption.status === 'PENDING'
                      ? 'Quà tặng: Chờ duyệt'
                      : rewardStatus.redemption.status === 'APPROVED'
                        ? 'Quà tặng: Đã duyệt'
                        : rewardStatus.redemption.status === 'FULFILLED'
                          ? 'Quà tặng: Đã trao'
                          : 'Quà tặng: Bị từ chối'
                    : rewardStatus?.eligibleToSubmit
                      ? 'Đăng ký nhận quà ngay!'
                      : rewardStatus
                        ? `Quà tham quan (${Math.min(rewardStatus.recordedUniqueBooths, rewardStatus.requiredUniqueBooths)}/${rewardStatus.requiredUniqueBooths})`
                        : 'Quà tham quan (...)'}
                </button>

                {/* Visitor Profile Inline Editor */}
                {editingProfile ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onUpdateVisitorProfile?.(draftName, draftColor);
                      setEditingProfile(false);
                    }}
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                  >
                    <input
                      name="visitorName"
                      aria-label="Tên hiển thị của bạn"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={32}
                      autoFocus
                      style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 34,
                        padding: '4px 8px',
                        borderRadius: 8,
                        border: '1px solid #38bdf8',
                        background: '#0f172a',
                        color: '#fff',
                        fontSize: 12.5,
                      }}
                    />
                    <input
                      type="color"
                      aria-label="Màu nhân vật"
                      value={draftColor}
                      onChange={(e) => setDraftColor(e.target.value)}
                      style={{ width: 28, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                    <button type="submit" className="btn btn--primary btn--sm">
                      Lưu
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => {
                      setDraftName(playerName);
                      setDraftColor(playerColor);
                      setEditingProfile(true);
                    }}
                  >
                    <span className="avatar-dot" style={{ backgroundColor: playerColor }} />
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Hồ sơ: {playerName}
                    </span>
                    <V28SvgIcon name="edit" size={13} style={{ opacity: 0.8 }} />
                  </button>
                )}

                {/* Return to Central Main Avenue */}
                {onReturnToMainAvenue && (
                  <button
                    type="button"
                    data-testid="v28-desktop-return-main-avenue-btn"
                    className="btn btn--secondary btn--sm"
                    style={{ width: '100%', justifyContent: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                    onClick={() => {
                      setDesktopMoreOpen(false);
                      onReturnToMainAvenue();
                    }}
                  >
                    <V28SvgIcon name="walk" size={14} />
                    Trở về đường chính
                  </button>
                )}

                {/* Return to Center */}
                {onReturnToCenter && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ width: '100%', justifyContent: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                    onClick={() => {
                      setDesktopMoreOpen(false);
                      onReturnToCenter();
                    }}
                  >
                    <V28SvgIcon name="compass" size={14} />
                    Về sảnh trung tâm
                  </button>
                )}

                {/* Visual Control Guide Trigger (Desktop) */}
                <button
                  type="button"
                  data-testid="v28-desktop-control-guide-btn"
                  className="btn btn--secondary btn--sm"
                  style={{ width: '100%', justifyContent: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                  onClick={() => {
                    setDesktopMoreOpen(false);
                    setDesktopGuideModalOpen(true);
                  }}
                >
                  <V28SvgIcon name="gamepad" size={14} />
                  Hướng dẫn điều khiển
                </button>

                {onChangeGraphicsQuality && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4, borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <V28SvgIcon name="bolt" size={12} style={{ color: '#fbbf24' }} />
                      Đồ họa 3D
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                      {([
                        ['auto', 'Tự động'],
                        ['performance', 'Mượt'],
                        ['quality', 'Đẹp'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onChangeGraphicsQuality(mode)}
                          style={{
                            padding: '5px 4px',
                            borderRadius: 7,
                            border: graphicsQuality === mode ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,0.25)',
                            background: graphicsQuality === mode ? 'rgba(14,165,233,0.28)' : 'rgba(255,255,255,0.06)',
                            color: '#f8fafc',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* H2: Interactive 2D SVG Minimap strictly at Top-Right (click/tap opens InteractiveMap2D) */}
          <WorldMinimapTopRight
            world={world}
            playerPos={playerPos}
            visitedBoothIds={visitedBoothIds}
            guidedRoute={
              activeNavWaypoints && activeNavWaypoints.length >= 2
                ? { waypoints: activeNavWaypoints }
                : guidedRoute
            }
            isMobileUi={isMobileUi}
            highlight={false}
            onOpenFullMap={() => {
              setDesktopMoreOpen(false);
              setMobileMenuOpen(false);
              setDirectoryOpen((v) => !v);
            }}
          />
        </div>
      )}

      {/* COLLAPSIBLE MOBILE MENU DRAWER (Anchored top-right under ⋯ button) */}
      {isMobileUi && mobileMenuOpen && !isBoothFocusActive && (
        <nav
          data-testid="v28-mobile-more-menu"
          aria-label="Menu di động triển lãm"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: 'max(58px, calc(env(safe-area-inset-top, 10px) + 48px))',
            right: 'max(10px, env(safe-area-inset-right, 10px))',
            zIndex: 34,
            pointerEvents: 'auto',
            width: isMobileLandscape ? 'min(340px, 64vw)' : 'min(320px, calc(100vw - 20px))',
            maxHeight: isMobileLandscape ? '76dvh' : '72dvh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.28)',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.45)',
            padding: 12,
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Exhibition Summary, Visit Progress & Online Visitors */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              paddingBottom: 8,
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>
              {world.exhibitionName || 'Grand Expo World V28'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#cbd5e1' }}>
              <span data-testid="v28-visit-progress-mobile" style={{ color: '#38bdf8', fontWeight: 700 }}>
                Đã tham quan:{' '}
                {journeyStatus === 'loading'
                  ? '...'
                  : `${Math.min(world.booths.length, visitedBoothIds?.size ?? 0)}/${world.booths.length}`}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className="status-dot status-dot--online" />
                {onlineCount} trực tuyến
                {overflowVisitorCount > 0 && ` (+${overflowVisitorCount})`}
              </span>
            </div>
          </div>

          {/* Reward Progress & Redemption (Mobile) */}
          <button
            type="button"
            data-testid="v28-reward-trigger-mobile"
            onClick={() => {
              setMobileMenuOpen(false);
              setDirectoryOpen(false);
              setRewardModalOpen(true);
            }}
            style={{
              minHeight: 42,
              padding: '8px 10px',
              borderRadius: 10,
              border: rewardStatus?.eligibleToSubmit
                ? '1px solid #34d399'
                : '1px solid rgba(148, 163, 184, 0.3)',
              background: rewardStatus?.eligibleToSubmit
                ? 'rgba(16, 185, 129, 0.28)'
                : 'rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 8,
            }}
          >
            <V28SvgIcon name="gift" size={16} />
            {rewardStatus?.eligibleToSubmit
              ? 'Đăng ký nhận quà ngay!'
              : rewardStatus
                ? `Quà tham quan (${Math.min(rewardStatus.recordedUniqueBooths, rewardStatus.requiredUniqueBooths)}/${rewardStatus.requiredUniqueBooths})`
                : 'Quà tham quan'}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setDirectoryOpen(true);
              }}
              style={{
                minHeight: 44,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid rgba(56, 189, 248, 0.35)',
                background: 'rgba(14, 165, 233, 0.16)',
                color: '#e0f2fe',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <V28SvgIcon name="map" size={15} />
              Danh sách gian ({world.booths.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onReturnToCenter?.();
              }}
              style={{
                minHeight: 44,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <V28SvgIcon name="compass" size={15} />
              Về trung tâm
            </button>

            {onReturnToMainAvenue && (
              <button
                type="button"
                data-testid="v28-mobile-return-main-avenue-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onReturnToMainAvenue();
                }}
                style={{
                  gridColumn: '1 / -1',
                  minHeight: 44,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  background: 'rgba(14, 165, 233, 0.2)',
                  color: '#e0f2fe',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <V28SvgIcon name="walk" size={15} />
                Trở về đường chính
              </button>
            )}
          </div>

          {/* Adaptive Graphics Quality Selector (AUTO / PERFORMANCE / QUALITY) */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 12,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <V28SvgIcon name="bolt" size={13} style={{ color: '#fbbf24' }} />
              Chất lượng đồ họa 3D
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {(
                [
                  { id: 'auto', label: 'Tự động' },
                  { id: 'performance', label: 'Mượt' },
                  { id: 'quality', label: 'Đẹp' },
                ] as const
              ).map((opt) => {
                const active = graphicsQuality === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeGraphicsQuality?.(opt.id)}
                    style={{
                      minHeight: 40,
                      borderRadius: 9,
                      border: active ? '1.5px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.25)',
                      background: active ? '#0284c7' : 'rgba(15, 23, 42, 0.5)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controls Guide Toggle */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 12,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <button
              type="button"
              onClick={() => setControlsGuideOpen((v) => !v)}
              style={{
                minHeight: 36,
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <V28SvgIcon name="gamepad" size={15} style={{ color: '#38bdf8' }} />
                Hướng dẫn điều khiển
              </span>
              <span>{controlsGuideOpen ? '▲' : '▼'}</span>
            </button>
            {controlsGuideOpen && (
              <VisualControlGuideContent defaultMode={defaultControlGuideMode} compact />
            )}
          </div>

          {/* Visitor Profile */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {editingProfile ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdateVisitorProfile?.(draftName, draftColor);
                  setEditingProfile(false);
                }}
                style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}
              >
                <input
                  name="visitorName"
                  aria-label="Tên hiển thị của bạn"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={32}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    padding: '6px 10px',
                    borderRadius: 9,
                    border: '1px solid #38bdf8',
                    background: '#1e293b',
                    color: '#fff',
                    fontSize: 13,
                  }}
                />
                <input
                  type="color"
                  aria-label="Màu nhân vật"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                  style={{ width: 36, height: 40, border: 'none', background: 'transparent' }}
                />
                <button
                  type="submit"
                  style={{
                    minHeight: 40,
                    padding: '0 12px',
                    borderRadius: 9,
                    border: 'none',
                    background: '#0284c7',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Lưu
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(playerName);
                    setDraftColor(playerColor);
                    setEditingProfile(true);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <span className="avatar-dot" style={{ backgroundColor: playerColor }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {playerName}
                  </span>
                  <V28SvgIcon name="edit" size={13} style={{ opacity: 0.85 }} />
                </button>
              </>
            )}
          </div>
        </nav>
      )}

      {/* PHASE 2.3 & 2.4: INTELLIGENT 3D NAVIGATION COMPASS, DIRECTIONAL ARROWS & ZONE SIGNPOST */}
      <NavigationGuidanceHud
        isMobileUi={isMobileUi}
        suppressed={
          isBoothFocusActive ||
          directoryOpen ||
          mobileMenuOpen ||
          rewardModalOpen ||
          desktopGuideModalOpen ||
          npcChatOpen ||
          Boolean(selectedProduct)
        }
        guidedRoute={guidedRoute}
        activeRouteIndicator={activeRouteIndicator}
        suggestedIndicators={suggestedNavIndicators}
        zoneGuidance={zoneGuidance}
        zoneToastText={navNoticeToast || zoneToastText}
        onSelectGuideBooth={(b) => onStartGuideToBooth?.(b)}
        onTeleportToBooth={onTeleportToBooth}
        onCancelGuide={() => onCancelGuide?.()}
      />

      {/* PHASE 3 & PHASE 8 + H1: COMPACT BOTTOM-LEFT NEARBY BOOTH DISCOVERY (Collapsed by default on Desktop & Mobile) */}
      <NearbyDiscoveryWidget
        world={world}
        playerPos={playerPos}
        visitedBoothIds={visitedBoothIds}
        isMobileUi={isMobileUi}
        isMobileLandscape={isMobileLandscape}
        suppressed={
          isBoothFocusActive ||
          directoryOpen ||
          mobileMenuOpen ||
          rewardModalOpen ||
          desktopGuideModalOpen ||
          npcChatOpen ||
          Boolean(selectedProduct)
        }
        onNavigateToBooth={onTeleportToBooth}
        onGuideToBooth={onStartGuideToBooth}
        onSelectProduct={onSelectProduct}
      />

      {/* PHASE 5: VISITOR REWARD REDEMPTION MODAL (Opened ONLY on explicit user click; never auto-pops) */}
      {rewardModalOpen && !isBoothFocusActive && (
        <Suspense fallback={null}>
          <RewardRedemptionModal
            versionId={world.versionId}
            rewardStatus={rewardStatus}
            loading={journeyStatus === 'loading'}
            isMobileUi={isMobileUi}
            isMobileLandscape={isMobileLandscape}
            onStatusUpdated={(next) => onRewardStatusUpdated?.(next)}
            onClose={() => setRewardModalOpen(false)}
          />
        </Suspense>
      )}

      {/* DIRECTORY & 2D INTERACTIVE MAP DRAWER (Hidden while focused on a booth) */}
      {directoryOpen && !isBoothFocusActive && (
        <Suspense fallback={null}>
          <InteractiveMap2D
            world={world}
            playerPos={playerPos}
            focusedBooth={focusedBooth}
            visitedBoothIds={visitedBoothIds}
            favoriteBoothIds={favoriteBoothIds}
            guidedRoute={guidedRoute}
            suggestedBoothIds={new Set(suggestedNavIndicators.map((i) => i.boothId))}
            isMobileUi={isMobileUi}
            isMobileLandscape={isMobileLandscape}
            onNavigateToBooth={onTeleportToBooth}
            onToggleFavoriteBooth={onToggleFavoriteBooth}
            onGuideToBooth={(b) => {
              setDirectoryOpen(false);
              onStartGuideToBooth?.(b);
            }}
            onClose={() => setDirectoryOpen(false)}
          />
        </Suspense>
      )}

      {/* Subtle First-Visit Touch Control Hint (auto-hides after 5.5s or first touch; clear of Top-Right Minimap) */}
      {isMobileUi && showFirstVisitHint && !isBoothFocusActive && !mobileMenuOpen && !directoryOpen && (
        <div
          role="status"
          aria-live="polite"
          style={{
            pointerEvents: 'none',
            position: 'fixed',
            top: isMobileLandscape ? 10 : 102,
            left: isMobileLandscape ? 12 : '50%',
            transform: isMobileLandscape ? 'none' : 'translateX(-50%)',
            zIndex: 20,
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: '#f8fafc',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.28)',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.25)',
            textAlign: 'center',
            maxWidth: isMobileLandscape ? 'calc(100vw - 210px)' : 'calc(100vw - 24px)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <V28SvgIcon name="joystick" size={14} style={{ color: '#34d399' }} />
          <span>{isMobileLandscape ? 'Kéo nửa trái di chuyển' : 'Kéo nửa dưới di chuyển'}</span>
          <span aria-hidden="true">·</span>
          <V28SvgIcon name="camera" size={14} style={{ color: '#38bdf8' }} />
          <span>{isMobileLandscape ? 'Vuốt nửa phải xoay góc nhìn' : 'Vuốt nửa trên xoay góc nhìn'}</span>
        </div>
      )}

      {/* BOTTOM AREA: Mode B Camera/Booth Dock + Focus Panels (marginTop: auto keeps dock anchored at bottom after Top Header removal) */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
        {/* Mode B: Compact Zoom + / - Controls (Phase 2: Overview button removed for cleaner World HUD) */}
        {!isBoothFocusActive && !mobileMenuOpen && !directoryOpen && (
          isMobileUi ? (
            <aside
              data-testid="v28-zoom-dock-mobile"
              aria-label="Điều khiển thu phóng góc nhìn"
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(15, 23, 42, 0.82)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 14,
                padding: 5,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.28)',
              }}
            >
              <button
                type="button"
                onClick={() => onZoomIn?.()}
                aria-label="Phóng to góc nhìn"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                ＋
              </button>
              <button
                type="button"
                onClick={() => onZoomOut?.()}
                aria-label="Thu nhỏ góc nhìn"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                －
              </button>
            </aside>
          ) : (
            <aside
              className="expo-hud-dock"
              data-testid="v28-zoom-dock-desktop"
              aria-label="Điều khiển thu phóng góc nhìn"
              style={{
                position: 'static',
                pointerEvents: 'auto',
                maxWidth: '100%',
              }}
            >
              <div className="camera-mode-bar" role="group" aria-label="Thu phóng góc nhìn Camera">
                <div className="zoom-controls">
                  <button
                    type="button"
                    className="zoom-btn"
                    onClick={() => onZoomIn?.()}
                    title="Phóng to góc nhìn"
                    aria-label="Phóng to góc nhìn"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    className="zoom-btn"
                    onClick={() => onZoomOut?.()}
                    title="Thu nhỏ góc nhìn"
                    aria-label="Thu nhỏ góc nhìn"
                  >
                    －
                  </button>
                </div>
              </div>
            </aside>
          )
        )}

        {/* User-initiated NPC Chat Modal (fitted cleanly into right-side box between favorite heart above and 3D NPC below) */}
        {npcChatOpen && focusedBooth ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: isMobileUi ? 'max(56px, calc(env(safe-area-inset-top, 8px) + 50px))' : '28vh',
              right: isMobileUi ? 'max(10px, env(safe-area-inset-right, 10px))' : 12,
              left: isMobileUi ? 'max(10px, env(safe-area-inset-left, 10px))' : 'auto',
              zIndex: 35,
              pointerEvents: 'auto',
              width: isMobileUi ? 'auto' : 'clamp(250px, 20vw, 340px)',
              height: isMobileUi ? 'auto' : '37vh',
              minHeight: isMobileUi ? undefined : 200,
            }}
          >
            <Suspense fallback={null}>
              <V28NpcChatModal
                booth={focusedBooth}
                product={
                  selectedProduct && selectedProduct.booth.boothId === focusedBooth.boothId
                    ? selectedProduct.product
                    : null
                }
                isMobileUi={isMobileUi}
                onAnimStateChange={onNpcAnimStateChange}
                onClose={() => onCloseNpcChat?.()}
              />
            </Suspense>
          </div>
        ) : selectedProduct ? (
          isMobileUi ? (
            <MobileProductBottomSheet
              booth={selectedProduct.booth}
              product={selectedProduct.product}
              slotId={selectedProduct.slotId}
              contactUrl={getSafeWebsiteUrl(selectedProduct.booth.contactUrl)}
              npcSessionState={npcSessionState}
              npcSubtitle={npcSubtitle}
              npcIsMuted={npcIsMuted}
              onToggleMute={onToggleNpcMute}
              onReplayConsultation={onReplayProductConsultation}
              onOpenChat={onOpenNpcChat}
              onClose={onCloseProduct}
              onOpenNpc={onOpenNpcPanel}
            />
          ) : null
        ) : showSimilarBooths && similarBooths.length > 0 ? (
          <SimilarBoothsCard
            suggestions={similarBooths}
            isMobileUi={isMobileUi}
            onNavigateToBooth={(b) => {
              onDismissSimilarBooths?.();
              onTeleportToBooth(b);
            }}
            onGuideToBooth={
              onStartGuideToBooth
                ? (b) => {
                  onDismissSimilarBooths?.();
                  onStartGuideToBooth(b);
                }
                : undefined
            }
            onDismiss={() => onDismissSimilarBooths?.()}
          />
        ) : null}
      </div>

      {/* Desktop Top-Right Product Detail Card (Image + Price + Description + Compact NPC Subtitle) */}
      {!isMobileUi && selectedProduct && !npcChatOpen && (
        <DesktopProductDetailCard
          key={selectedProduct.product.id}
          booth={selectedProduct.booth}
          product={selectedProduct.product}
          slotId={selectedProduct.slotId}
          npcSessionState={npcSessionState}
          npcSubtitle={npcSubtitle}
          npcIsMuted={npcIsMuted}
          onToggleMute={onToggleNpcMute}
          onReplayConsultation={onReplayProductConsultation}
          onOpenChat={onOpenNpcChat}
          onClose={onCloseProduct}
        />
      )}

      {/* Phase 1 Visual Control Guide Modal (Desktop & accessible from HUD menu) */}
      <VisualControlGuideModal
        open={desktopGuideModalOpen}
        defaultMode={defaultControlGuideMode}
        onClose={() => setDesktopGuideModalOpen(false)}
      />

      {/* Onboarding overlay removed per user request */}
    </div>
  );
};
