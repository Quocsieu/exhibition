import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
  V28VisitorRewardStatusResponse,
} from '../../services/v28Api';
import type { V28CameraMode, V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';
import type { V28GraphicsQualityMode } from '../../scene/v28/v28MobileControls';
import { V28NpcChatModal } from './V28NpcChatModal';
import { SimilarBoothsCard } from './SimilarBoothsCard';
import { NavigationGuidanceHud } from './NavigationGuidanceHud';
import type { SimilarBoothSuggestion } from '../../services/similarBooths';
import {
  computeDirectionIndicators,
  computeZoneGuidance,
  formatZoneNavigationSubtitle,
  shouldEmitZoneTransition,
  type GuidedRouteResult,
} from '../../services/v28NavigationEngine';
import { MobileProductBottomSheet } from './MobileProductBottomSheet';
import { InteractiveMap2D } from './InteractiveMap2D';
import { NearbyDiscoveryWidget } from './NearbyDiscoveryWidget';
import { RewardRedemptionModal } from './RewardRedemptionModal';

export interface DynamicWorldHudProps {
  world: V28ExhibitionVersionDetail;
  isPreviewMode: boolean;
  cameraMode: V28CameraMode;
  isMobilePortrait: boolean;
  isMobileViewport?: boolean;
  isMobileLandscape?: boolean;
  graphicsQuality?: V28GraphicsQualityMode;
  onChangeGraphicsQuality?: (mode: V28GraphicsQualityMode) => void;
  onReturnToCenter?: () => void;
  playerPos: V28PlayerState;
  visitedBoothIds?: ReadonlySet<string>;
  journeyStatus?: 'loading' | 'ready' | 'error';
  rewardStatus?: V28VisitorRewardStatusResponse | null;
  onRewardStatusUpdated?: (next: V28VisitorRewardStatusResponse) => void;
  focusedBooth: V28BoothPlacementView | null;
  selectedProduct: { booth: V28BoothPlacementView; product: V28Product; slotId: string } | null;
  npcPanelOpen: boolean;
  npcChatOpen?: boolean;
  npcIsMuted?: boolean;
  similarBooths?: SimilarBoothSuggestion[];
  showSimilarBooths?: boolean;
  guidedRoute?: GuidedRouteResult | null;
  cameraYaw?: number;
  onStartGuideToBooth?: (booth: V28BoothPlacementView) => void;
  onCancelGuide?: () => void;
  directoryOpenNonce?: number;
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
  onReturnToCenter,
  playerPos,
  visitedBoothIds,
  journeyStatus = 'ready',
  rewardStatus = null,
  onRewardStatusUpdated,
  focusedBooth,
  selectedProduct,
  npcPanelOpen: _npcPanelOpen,
  npcChatOpen = false,
  npcIsMuted = false,
  similarBooths = [],
  showSimilarBooths = false,
  guidedRoute = null,
  cameraYaw = Math.PI,
  onStartGuideToBooth,
  onCancelGuide,
  directoryOpenNonce = 0,
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

  const isBoothFocusActive = cameraMode === 'focus' && Boolean(focusedBooth);
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
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden', padding: '0 4px' }}>
              <div
                data-testid="v28-focus-compact-meta-mobile"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#e2e8f0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                #{Math.max(1, (focusedBooth.slotIndex ?? 0) + 1)} · Khu {focusedBooth.zoneCode} · {focusedBooth.assignedSlotCount}/{focusedTotalSlots} SP
              </div>
            </div>

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
                }}
              >
                {npcIsMuted ? '🔇' : '🔊'}
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
                }}
              >
                💬 Chat
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
                  gap: 4,
                  fontSize: 12.5,
                  fontWeight: 700,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                🌐 Web ↗
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
              style={{ maxWidth: 360, padding: '4px 10px', minHeight: 34 }}
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
            </div>

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
                {npcIsMuted ? '🔇' : '🔊'}
              </button>
            )}

            {onOpenNpcChat && (
              <button
                type="button"
                data-testid="v28-focus-chat-btn"
                onClick={onOpenNpcChat}
                className="btn btn--outline btn--sm"
                aria-label="Mở khung chat với nhân viên tư vấn"
                style={{ minHeight: 34, padding: '4px 10px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >
                💬 Chat
              </button>
            )}

            {focusedWebsiteUrl && (
              <a
                href={focusedWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline btn--sm"
                style={{ minHeight: 34, padding: '4px 10px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >
                🌐 Website ↗
              </a>
            )}
          </div>
        )
      ) : isMobileUi ? (
        /* Mobile-First Minimal Top Bar — maximizes 3D scene viewport */
        <header
          aria-label="Thanh tiêu đề triển lãm"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: 14,
            padding: '5px 8px',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.22)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'linear-gradient(135deg, var(--v28-youth-blue-deep, #003d82), var(--v28-youth-blue, #0057b8))',
                color: '#fff',
                fontWeight: 800,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              3D
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                }}
              >
                {world.exhibitionName || 'Virtual Expo Plaza'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#cbd5e1' }}>
                <span className="status-dot status-dot--online" />
                <span data-testid="v28-visit-progress-mobile">
                  {onlineCount} trực tuyến · Đã tham quan:{' '}
                  {journeyStatus === 'loading'
                    ? '...'
                    : `${Math.min(world.booths.length, visitedBoothIds?.size ?? 0)}/${world.booths.length}`}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              data-testid="v28-reward-trigger-mobile"
              onClick={() => {
                setMobileMenuOpen(false);
                setDirectoryOpen(false);
                setRewardModalOpen(true);
              }}
              aria-label="Mở tiến độ và đăng ký nhận quà"
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 10,
                border: rewardStatus?.eligibleToSubmit
                  ? '1px solid #34d399'
                  : '1px solid rgba(148, 163, 184, 0.3)',
                background: rewardStatus?.eligibleToSubmit
                  ? 'rgba(16, 185, 129, 0.28)'
                  : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: 17,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🎁
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setDirectoryOpen((v) => !v);
              }}
              aria-label="Mở bản đồ và danh sách gian hàng"
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: directoryOpen ? '#0284c7' : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: 17,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🗺️
            </button>
            <button
              type="button"
              onClick={() => {
                setDirectoryOpen(false);
                setMobileMenuOpen((v) => !v);
              }}
              aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu điều khiển'}
              aria-expanded={mobileMenuOpen}
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: mobileMenuOpen ? '#0284c7' : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </header>
      ) : (
        /* ===================================================================
         * MODE B: COMPACT DESKTOP HEADER (UAT Fix 04 — Quick-Jump removed, slim height)
         * [3D + Grand Expo World V28 + Đã tham quan]    [🗺️ Bản đồ 2D] [⋯ Xem thêm]
         * =================================================================== */
        <header
          className="expo-hud-top"
          data-testid="v28-desktop-top-bar"
          style={{
            position: 'static',
            pointerEvents: 'auto',
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 14px',
            minHeight: 48,
            borderRadius: 12,
          }}
        >
          <div className="expo-hud-top__brand" style={{ gap: 10 }}>
            <div
              className="expo-hud-top__logo"
              style={{ width: 32, height: 32, fontSize: 13, borderRadius: 9 }}
            >
              3D
            </div>
            <div>
              <h1
                className="expo-hud-top__title"
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, lineHeight: 1.2 }}
              >
                <span>{world.exhibitionName || 'Con Đường Nông Sản 3D'}</span>
                {isPreviewMode && (
                  <span style={{ background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: 5, fontSize: 10.5, fontWeight: 700 }}>
                    DRAFT PREVIEW
                  </span>
                )}
              </h1>
              <div className="expo-hud-top__status" style={{ fontSize: 11.5, marginTop: 1 }}>
                <span className="status-dot status-dot--online" />
                <strong
                  data-testid="v28-visit-progress"
                  title={
                    journeyStatus === 'error'
                      ? 'Không thể đồng bộ tiến độ từ máy chủ'
                      : 'Tiến độ tham quan được xác minh từ máy chủ'
                  }
                  style={{ color: journeyStatus === 'error' ? '#fca5a5' : '#38bdf8' }}
                >
                  Đã tham quan:{' '}
                  {journeyStatus === 'loading'
                    ? '...'
                    : `${Math.min(world.booths.length, visitedBoothIds?.size ?? 0)}/${world.booths.length}`}{' '}
                  gian
                </strong>
              </div>
            </div>
          </div>

          <div className="expo-hud-top__nav" style={{ flexWrap: 'nowrap', gap: 8, position: 'relative' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setDesktopMoreOpen(false);
                setDirectoryOpen((v) => !v);
              }}
              title="Mở bản đồ 2D và tìm kiếm toàn bộ gian hàng"
              style={{ minHeight: 34, padding: '5px 12px', fontSize: 12.5 }}
            >
              🗺️ Bản đồ 2D
            </button>

            <button
              type="button"
              data-testid="v28-hud-more-btn"
              className="btn btn--secondary btn--sm"
              aria-expanded={desktopMoreOpen}
              aria-label="Mở menu tùy chọn bổ sung"
              onClick={() => {
                setDirectoryOpen(false);
                setDesktopMoreOpen((v) => !v);
              }}
              style={{ position: 'relative', minHeight: 34, padding: '5px 12px', fontSize: 12.5 }}
            >
              ⋯ Xem thêm
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

            {desktopMoreOpen && (
              <div
                data-testid="v28-hud-more-menu"
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 286,
                  background: 'rgba(15, 23, 42, 0.96)',
                  backdropFilter: 'blur(14px)',
                  borderRadius: 14,
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  boxShadow: '0 16px 38px rgba(15, 23, 42, 0.42)',
                  padding: 12,
                  color: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  zIndex: 40,
                }}
              >
                {/* Online Visitors Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', paddingBottom: 6, borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="status-dot status-dot--online" />
                    {onlineCount} khách đang trực tuyến
                  </span>
                  {overflowVisitorCount > 0 && <span>+{overflowVisitorCount}</span>}
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
                    ...(rewardStatus?.eligibleToSubmit
                      ? { background: '#10b981', borderColor: '#34d399', color: '#ffffff' }
                      : {}),
                  }}
                >
                  {rewardStatus?.redemption
                    ? rewardStatus.redemption.status === 'PENDING'
                      ? '🎁 Quà tặng: Chờ duyệt'
                      : rewardStatus.redemption.status === 'APPROVED'
                        ? '🎁 Quà tặng: Đã duyệt'
                        : rewardStatus.redemption.status === 'FULFILLED'
                          ? '🎁 Quà tặng: Đã trao'
                          : '🎁 Quà tặng: Bị từ chối'
                    : rewardStatus?.eligibleToSubmit
                      ? '🎁 Đăng ký nhận quà ngay!'
                      : rewardStatus
                        ? `🎁 Quà tham quan (${Math.min(rewardStatus.recordedUniqueBooths, rewardStatus.requiredUniqueBooths)}/${rewardStatus.requiredUniqueBooths})`
                        : '🎁 Quà tham quan (...)'}
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
                    Hồ sơ: {playerName} ✎
                  </button>
                )}

                {/* Return to Center & Graphics Quality */}
                {onReturnToCenter && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => {
                      setDesktopMoreOpen(false);
                      onReturnToCenter();
                    }}
                  >
                    🧭 Về sảnh trung tâm
                  </button>
                )}

                {onChangeGraphicsQuality && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4, borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>⚡ Đồ họa 3D</span>
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
        </header>
      )}

      {/* COLLAPSIBLE MOBILE MENU DRAWER (Mobile Portrait & Landscape only — zero impact on Desktop) */}
      {isMobileUi && mobileMenuOpen && !isBoothFocusActive && (
        <nav
          aria-label="Menu di động triển lãm"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-end',
            width: isMobileLandscape ? 'min(360px, 68vw)' : 'min(340px, 100%)',
            maxHeight: isMobileLandscape ? '72dvh' : '68dvh',
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
              }}
            >
              🗺️ Danh sách gian ({world.booths.length})
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
              }}
            >
              🧭 Về trung tâm
            </button>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
              ⚡ Chất lượng đồ họa 3D
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
              <span>🎮 Hướng dẫn điều khiển</span>
              <span>{controlsGuideOpen ? '▲' : '▼'}</span>
            </button>
            {controlsGuideOpen && (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12.5,
                  color: '#cbd5e1',
                  lineHeight: 1.55,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <li><strong>Màn hình dọc (Portrait):</strong> Chạm &amp; kéo <em>nửa dưới</em> để hiện joystick 360° di chuyển; vuốt <em>nửa trên</em> để xoay camera.</li>
                <li><strong>Màn hình ngang (Landscape):</strong> Chạm &amp; kéo <em>nửa trái</em> để di chuyển; vuốt <em>nửa phải</em> để xoay camera.</li>
                <li><strong>Hai ngón đồng thời:</strong> Vừa di chuyển vừa xoay góc nhìn mượt mà.</li>
                <li><strong>Chạm nhanh:</strong> Chọn gian hàng, sản phẩm hoặc tư vấn viên NPC.</li>
              </ul>
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
                    {playerName} ✎
                  </span>
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
          npcChatOpen ||
          Boolean(selectedProduct)
        }
        guidedRoute={guidedRoute}
        activeRouteIndicator={activeRouteIndicator}
        suggestedIndicators={suggestedNavIndicators}
        zoneGuidance={zoneGuidance}
        zoneToastText={zoneToastText}
        onSelectGuideBooth={(b) => onStartGuideToBooth?.(b)}
        onTeleportToBooth={onTeleportToBooth}
        onCancelGuide={() => onCancelGuide?.()}
      />

      {/* PHASE 3 & PHASE 8: CONTEXTUAL NEARBY BOOTH & PRODUCT DISCOVERY (Tightened radius, true X close, Phase 2 guide sync) */}
      <NearbyDiscoveryWidget
        world={world}
        playerPos={playerPos}
        isMobileUi={isMobileUi}
        isMobileLandscape={isMobileLandscape}
        suppressed={
          isBoothFocusActive ||
          directoryOpen ||
          mobileMenuOpen ||
          rewardModalOpen ||
          npcChatOpen ||
          Boolean(selectedProduct)
        }
        onNavigateToBooth={onTeleportToBooth}
        onGuideToBooth={onStartGuideToBooth}
        onSelectProduct={onSelectProduct}
      />

      {/* PHASE 5: VISITOR REWARD REDEMPTION MODAL (Opened ONLY on explicit user click; never auto-pops) */}
      {rewardModalOpen && !isBoothFocusActive && (
        <RewardRedemptionModal
          versionId={world.versionId}
          rewardStatus={rewardStatus}
          loading={journeyStatus === 'loading'}
          isMobileUi={isMobileUi}
          isMobileLandscape={isMobileLandscape}
          onStatusUpdated={(next) => onRewardStatusUpdated?.(next)}
          onClose={() => setRewardModalOpen(false)}
        />
      )}

      {/* DIRECTORY & 2D INTERACTIVE MAP DRAWER (Hidden while focused on a booth) */}
      {directoryOpen && !isBoothFocusActive && (
        <InteractiveMap2D
          world={world}
          playerPos={playerPos}
          focusedBooth={focusedBooth}
          visitedBoothIds={visitedBoothIds}
          guidedRoute={guidedRoute}
          suggestedBoothIds={new Set(suggestedNavIndicators.map((i) => i.boothId))}
          isMobileUi={isMobileUi}
          isMobileLandscape={isMobileLandscape}
          onNavigateToBooth={onTeleportToBooth}
          onGuideToBooth={(b) => {
            setDirectoryOpen(false);
            onStartGuideToBooth?.(b);
          }}
          onClose={() => setDirectoryOpen(false)}
        />
      )}

      {/* Subtle First-Visit Touch Control Hint (auto-hides after 5.5s or first touch; NO split divider line) */}
      {isMobileUi && showFirstVisitHint && !isBoothFocusActive && !mobileMenuOpen && !directoryOpen && (
        <div
          role="status"
          aria-live="polite"
          style={{
            pointerEvents: 'none',
            alignSelf: 'center',
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: '#f8fafc',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.28)',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.25)',
            textAlign: 'center',
            maxWidth: '92%',
          }}
        >
          {isMobileLandscape
            ? '🕹️ Kéo nửa trái để di chuyển · 🎥 Vuốt nửa phải xoay góc nhìn'
            : '🕹️ Kéo nửa dưới để di chuyển · 🎥 Vuốt nửa trên xoay góc nhìn'}
        </div>
      )}

      {/* BOTTOM AREA: Mode B Camera/Booth Dock + Focus Panels */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
        {/* Mode B: Camera Mode Bar + Zoom + / - + Dynamic Booth Quick Chips (Desktop full / Mobile compact thumb-zone) */}
        {!isBoothFocusActive && !mobileMenuOpen && !directoryOpen && (
          isMobileUi ? (
            <aside
              aria-label="Điều khiển góc nhìn camera"
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
                onClick={() => onChangeCameraMode(cameraMode === 'overview' ? 'explore' : 'overview')}
                aria-label={cameraMode === 'overview' ? 'Chuyển sang chế độ Tham quan' : 'Chuyển sang chế độ Toàn cảnh'}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cameraMode === 'overview' ? '🚶 Tham quan' : '🌐 Toàn cảnh'}
              </button>
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
              aria-label="Điều khiển góc nhìn camera và danh sách gian hàng"
              style={{
                position: 'static',
                pointerEvents: 'auto',
                maxWidth: '100%',
              }}
            >
              <div className="camera-mode-bar" role="group" aria-label="Chế độ góc nhìn Camera">
                <button
                  type="button"
                  className={`camera-mode-btn ${cameraMode === 'overview' ? 'camera-mode-btn--active' : ''}`}
                  onClick={() => onChangeCameraMode('overview')}
                  aria-pressed={cameraMode === 'overview'}
                  title="Nhìn tổng thể toàn bộ khu triển lãm V28"
                >
                  🌐 Toàn cảnh
                </button>

                <button
                  type="button"
                  className={`camera-mode-btn ${cameraMode === 'explore' ? 'camera-mode-btn--active' : ''}`}
                  onClick={() => onChangeCameraMode('explore')}
                  aria-pressed={cameraMode === 'explore'}
                  title="Camera góc nhìn thứ 3 đi theo sau nhân vật"
                >
                  🚶 Tham quan
                </button>

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

        {/* User-initiated NPC Chat Modal (Phase 1.1: narration panel removed), Product Detail, or Similar Booths Recommendation */}
        {npcChatOpen && focusedBooth ? (
          <div style={{ marginLeft: 'auto', width: isMobileUi ? '100%' : 'auto' }}>
            <V28NpcChatModal
              booth={focusedBooth}
              isMobileUi={isMobileUi}
              onAnimStateChange={onNpcAnimStateChange}
              onClose={() => onCloseNpcChat?.()}
            />
          </div>
        ) : selectedProduct ? (
          isMobileUi ? (
            <MobileProductBottomSheet
              booth={selectedProduct.booth}
              product={selectedProduct.product}
              slotId={selectedProduct.slotId}
              contactUrl={getSafeWebsiteUrl(selectedProduct.booth.contactUrl)}
              onClose={onCloseProduct}
              onOpenNpc={onOpenNpcPanel}
            />
          ) : (
            <div
              style={{
                pointerEvents: 'auto',
                marginLeft: 'auto',
                width: 420,
                maxHeight: '58vh',
                overflowY: 'auto',
                background: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(12px)',
                borderRadius: 16,
                padding: 14,
                boxShadow: '0 14px 36px rgba(15,23,42,0.28)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
                      {selectedProduct.booth.companyName} · {selectedProduct.slotId}
                    </div>
                    <h4 style={{ margin: '2px 0 0', fontSize: 16, color: '#0f172a' }}>
                      {selectedProduct.product.name}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseProduct}
                    style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
                {selectedProduct.product.images?.[0] && (
                  <img
                    src={selectedProduct.product.images[0]}
                    alt={selectedProduct.product.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }}
                  />
                )}
                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>
                  {selectedProduct.product.price > 0
                    ? `${selectedProduct.product.price.toLocaleString('vi-VN')} ${selectedProduct.product.currency || 'VND'}`
                    : 'Liên hệ báo giá'}
                  {selectedProduct.product.sku && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                      SKU: {selectedProduct.product.sku}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
                  {selectedProduct.product.description || 'Sản phẩm trưng bày chính thức tại gian hàng.'}
                </p>
              </div>
            </div>
          )
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
    </div>
  );
};
