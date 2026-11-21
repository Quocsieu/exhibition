import React, { useEffect, useMemo, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
} from '../../services/v28Api';
import type { V28CameraMode, V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';
import type { V28GraphicsQualityMode } from '../../scene/v28/v28MobileControls';
import { V28NpcConsultantPanel } from './V28NpcConsultantPanel';
import { MobileProductBottomSheet } from './MobileProductBottomSheet';

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
  focusedBooth: V28BoothPlacementView | null;
  selectedProduct: { booth: V28BoothPlacementView; product: V28Product; slotId: string } | null;
  npcPanelOpen: boolean;
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
  onNpcAnimStateChange: (state: V28NpcAnimState) => void;
  onJoystickChange: (vec: { x: number; y: number }) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onOpenAdmin: () => void;
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
  focusedBooth,
  selectedProduct,
  npcPanelOpen,
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
  onCloseNpcPanel,
  onNpcAnimStateChange,
  onZoomIn,
  onZoomOut,
  onOpenAdmin,
}) => {
  const isMobileUi = isMobileViewport || isMobilePortrait || isMobileLandscape;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>('ALL');
  const [directoryOpen, setDirectoryOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [controlsGuideOpen, setControlsGuideOpen] = useState<boolean>(false);
  const [showFirstVisitHint, setShowFirstVisitHint] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('v28_mobile_touch_hint_seen');
    } catch {
      return false;
    }
  });

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

  const filteredBooths = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return world.booths.filter((b) => {
      if (selectedZoneCode !== 'ALL' && b.zoneCode !== selectedZoneCode) return false;
      if (!q) return true;
      return (
        b.boothName.toLowerCase().includes(q) ||
        b.companyName.toLowerCase().includes(q) ||
        b.zoneName.toLowerCase().includes(q) ||
        b.slots.some((s) => s.product?.name.toLowerCase().includes(q))
      );
    });
  }, [world.booths, searchQuery, selectedZoneCode]);

  const isBoothFocusActive = cameraMode === 'focus' && Boolean(focusedBooth);
  const focusedWebsiteUrl = getSafeWebsiteUrl(focusedBooth?.contactUrl);
  const focusedCategoryLabel =
    (focusedBooth?.zoneCategoryTag && focusedBooth.zoneCategoryTag !== 'Chưa phân bổ'
      ? focusedBooth.zoneCategoryTag
      : focusedBooth?.category) || 'Triển lãm V28';

  // Close collapsible mobile menu when entering booth focus or selecting a product
  useEffect(() => {
    if (isBoothFocusActive || selectedProduct) {
      setMobileMenuOpen(false);
    }
  }, [isBoothFocusActive, selectedProduct]);

  // Dynamically select up to 8 booths on Desktop from Published V28 World
  const quickBoothChips = useMemo(() => {
    if (isMobileUi) return [];
    const sorted = [...world.booths].sort((a, b) => {
      if (b.assignedSlotCount !== a.assignedSlotCount) {
        return b.assignedSlotCount - a.assignedSlotCount;
      }
      return a.slotIndex - b.slotIndex;
    });
    return sorted.slice(0, 8);
  }, [world.booths, isMobileUi]);

  return (
    <div
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
          /* Mobile-First Compact Booth Focus Bar — never covers the 3D booth! */
          <div
            role="toolbar"
            aria-label="Thanh điều khiển gian hàng đang xem"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              background: 'rgba(15, 23, 42, 0.86)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 14,
              padding: '6px 8px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.28)',
            }}
          >
            <button
              type="button"
              onClick={onCloseFocus}
              aria-label="Quay lại khu triển lãm"
              style={{
                minWidth: 44,
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 10,
                border: 'none',
                background: '#f59e0b',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              ← Thoát
            </button>

            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {focusedBooth.companyName || focusedBooth.boothName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {focusedBooth.assignedSlotCount}/6 SP · Chạm sản phẩm để xem
              </div>
            </div>

            {focusedWebsiteUrl && (
              <a
                href={focusedWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Mở website doanh nghiệp"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                🌐
              </a>
            )}

            <button
              type="button"
              onClick={onOpenNpcPanel}
              aria-label="Nghe tư vấn viên giới thiệu"
              style={{
                minWidth: 44,
                minHeight: 44,
                padding: '0 11px',
                borderRadius: 10,
                border: 'none',
                background: '#0284c7',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              👩‍💼 Tư vấn
            </button>
          </div>
        ) : (
        <div
          className="shop-showcase-corner-hud"
          role="toolbar"
          aria-label="Thanh điều khiển gian hàng đang xem"
          style={{
            position: 'static',
            pointerEvents: 'auto',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="shop-showcase-back-btn"
            onClick={onCloseFocus}
            title="Thoát gian hàng và quay lại khu triển lãm (Phím Esc)"
            aria-label="Quay lại khu triển lãm"
          >
            ← Quay lại khu triển lãm <kbd>Esc</kbd>
          </button>

          <div
            className="shop-showcase-booth-banner"
            title={`${focusedBooth.companyName || focusedBooth.boothName}${
              focusedBooth.companyName && focusedBooth.companyName !== focusedBooth.boothName
                ? ` (${focusedBooth.boothName})`
                : ''
            } · ${focusedBooth.zoneName} · ${focusedBooth.assignedSlotCount}/6 sản phẩm`}
            style={{ maxWidth: 460 }}
          >
            {focusedBooth.logoUrl && (
              <img
                src={focusedBooth.logoUrl}
                alt={focusedBooth.companyName || focusedBooth.boothName}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: 'cover',
                  border: `1.5px solid ${focusedBooth.color || '#0ea5e9'}`,
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span
              className="expo-dialog__badge"
              style={{ backgroundColor: focusedBooth.color || '#0ea5e9', flexShrink: 0 }}
            >
              {focusedCategoryLabel}
            </span>
            <strong
              className="shop-showcase-booth-banner__title"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {focusedBooth.companyName || focusedBooth.boothName}
            </strong>
            {focusedBooth.companyName && focusedBooth.companyName !== focusedBooth.boothName && (
              <span
                className="shop-showcase-booth-banner__sub"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}
              >
                ({focusedBooth.boothName})
              </span>
            )}
            <span className="shop-showcase-booth-banner__sub" style={{ flexShrink: 0 }}>
              · {focusedBooth.assignedSlotCount}/6 sản phẩm
            </span>
          </div>

          {focusedWebsiteUrl && (
            <a
              href={focusedWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--outline btn--sm"
              style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              🌐 Website ↗
            </a>
          )}

          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onOpenNpcPanel}
            title="Nghe tư vấn viên 3D giới thiệu gian hàng và sản phẩm bằng giọng nữ tiếng Việt"
            style={{ minHeight: 38 }}
          >
            👩‍💼 Nghe tư vấn viên giới thiệu
          </button>
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
                background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
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
                <span>{onlineCount} trực tuyến · {world.booths.length} gian</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
         * MODE B: OVERVIEW / EXPLORE HEADER (Synchronized with V27.5 Hình 2)
         * [3D] Virtual Expo Plaza + Online count | [Đi nhanh tới gian hàng...] [Khách #...]
         * =================================================================== */
        <header
          className="expo-hud-top"
          style={{
            position: 'static',
            pointerEvents: 'auto',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div className="expo-hud-top__brand">
            <div className="expo-hud-top__logo">3D</div>
            <div>
              <h1 className="expo-hud-top__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{world.exhibitionName || 'Virtual Expo Plaza'}</span>
                {isPreviewMode && (
                  <span style={{ background: '#0284c7', color: '#fff', padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    DRAFT PREVIEW
                  </span>
                )}
              </h1>
              <div className="expo-hud-top__status">
                <span className="status-dot status-dot--online" />
                <span>
                  {onlineCount} khách đang trực tuyến
                  {overflowVisitorCount > 0 ? ` (+${overflowVisitorCount} khu vực)` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="expo-hud-top__nav" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="hud-booth-picker">
              <select
                aria-label="Đi nhanh tới gian hàng"
                className="hud-select"
                defaultValue=""
                onChange={(e) => {
                  const target = world.booths.find((b) => b.boothId === e.target.value);
                  if (target) {
                    onTeleportToBooth(target);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>
                  📍 Đi nhanh tới gian hàng ({world.booths.length})...
                </option>
                {world.booths.map((b) => (
                  <option key={b.boothId} value={b.boothId}>
                    {b.companyName !== b.boothName ? `${b.companyName} — ${b.boothName}` : b.boothName} ({b.zoneName})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setDirectoryOpen((v) => !v)}
              title="Mở bản đồ 2D và tìm kiếm toàn bộ gian hàng"
            >
              🗺️ Bản đồ 2D
            </button>

            {editingProfile ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdateVisitorProfile?.(draftName, draftColor);
                  setEditingProfile(false);
                }}
                style={{ display: 'flex', gap: 4, alignItems: 'center' }}
              >
                <input
                  name="visitorName"
                  aria-label="Tên hiển thị của bạn"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={32}
                  autoFocus
                  style={{
                    width: 120,
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
                title="Đổi tên & màu nhân vật"
                onClick={() => {
                  setDraftName(playerName);
                  setDraftColor(playerColor);
                  setEditingProfile(true);
                }}
              >
                <span className="avatar-dot" style={{ backgroundColor: playerColor }} />
                {playerName} ✎
              </button>
            )}

            {!isMobilePortrait && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onOpenAdmin}
                title="Mở trang quản trị triển lãm V28"
              >
                ⚙️ Admin
              </button>
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
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAdmin();
                  }}
                  style={{
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  ⚙️ Admin
                </button>
              </>
            )}
          </div>
        </nav>
      )}

      {/* DIRECTORY & MINI-MAP DRAWER (Hidden while focused on a booth) */}
      {directoryOpen && !isBoothFocusActive && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            alignSelf: isMobilePortrait ? 'stretch' : 'flex-end',
            width: isMobilePortrait ? '100%' : isMobileLandscape ? 'min(380px, 72vw)' : 360,
            maxHeight: isMobileLandscape ? '72dvh' : isMobilePortrait ? '64dvh' : '65vh',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(12px)',
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(15,23,42,0.24)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              Bản đồ &amp; Danh bạ ({filteredBooths.length}/{world.booths.length} gian)
            </strong>
            <button
              type="button"
              onClick={() => setDirectoryOpen(false)}
              aria-label="Đóng bản đồ và danh bạ"
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <input
            type="search"
            aria-label="Tìm gian hàng, doanh nghiệp, sản phẩm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm gian hàng, doanh nghiệp, sản phẩm..."
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 12.5,
              boxSizing: 'border-box',
            }}
          />

          {/* Interactive 2D Exhibition Map (live layout: U-zones, walkways, booths, player position) */}
          <svg
            viewBox={`${world.hallBounds.minX - 2} ${world.hallBounds.minZ - 2} ${world.hallWidth + 4} ${world.hallDepth + 4}`}
            style={{ width: '100%', height: 175, background: '#f1f5f9', borderRadius: 10, border: '1px solid #cbd5e1', flexShrink: 0 }}
          >
            {/* Central Main Avenue */}
            <rect
              x={world.centralAvenueBounds.minX}
              y={world.centralAvenueBounds.minZ}
              width={world.centralAvenueBounds.maxX - world.centralAvenueBounds.minX}
              height={world.centralAvenueBounds.maxZ - world.centralAvenueBounds.minZ}
              fill="#e0f2fe"
            />
            {/* Clickable U-Shaped Zones */}
            {world.zones.map((z) => {
              const activeZone = selectedZoneCode === z.code;
              const cx = (z.bounds.minX + z.bounds.maxX) / 2;
              const cz = (z.bounds.minZ + z.bounds.maxZ) / 2;
              return (
                <g
                  key={z.id}
                  onClick={() => setSelectedZoneCode(activeZone ? 'ALL' : z.code)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={z.bounds.minX}
                    y={z.bounds.minZ}
                    width={z.bounds.maxX - z.bounds.minX}
                    height={z.bounds.maxZ - z.bounds.minZ}
                    fill={activeZone ? 'rgba(14,165,233,0.16)' : 'rgba(255,255,255,0.65)'}
                    stroke={activeZone ? '#0284c7' : '#cbd5e1'}
                    strokeWidth={activeZone ? 1.8 : 0.8}
                    rx={2}
                  />
                  <text
                    x={cx}
                    y={cz}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(4.5, Math.min(8, world.hallWidth * 0.032))}
                    fontWeight="bold"
                    fill={activeZone ? '#0369a1' : '#64748b'}
                  >
                    {z.code}
                  </text>
                </g>
              );
            })}
            {/* Rotated Booth Footprints */}
            {world.booths.map((b) => {
              const cos = Math.abs(Math.cos(b.rotationY));
              const sin = Math.abs(Math.sin(b.rotationY));
              const rw = b.footprintWidth * cos + b.footprintDepth * sin;
              const rd = b.footprintWidth * sin + b.footprintDepth * cos;
              return (
                <rect
                  key={b.boothId}
                  x={b.positionX - rw / 2}
                  y={b.positionZ - rd / 2}
                  width={rw}
                  height={rd}
                  fill={selectedZoneCode === 'ALL' || b.zoneCode === selectedZoneCode ? b.color : '#cbd5e1'}
                  onClick={() => {
                    onTeleportToBooth(b);
                    setDirectoryOpen(false);
                  }}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}
            {/* Live Player Position Marker */}
            <circle cx={playerPos.x} cy={playerPos.z} r={Math.max(2.6, world.hallWidth * 0.015)} fill="#ef4444" stroke="#fff" strokeWidth={1.1} />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
            <span>🔴 Vị trí của bạn · Bấm khu hoặc gian để chọn/đi tới</span>
            <span>{world.zones.length} khu chữ U</span>
          </div>

          {/* Booth List with Teleport */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredBooths.map((b) => (
              <button
                key={b.boothId}
                type="button"
                onClick={() => {
                  onTeleportToBooth(b);
                  setDirectoryOpen(false);
                }}
                style={{
                  minHeight: 44,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: focusedBooth?.boothId === b.boothId ? '#e0f2fe' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.boothName}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {b.zoneName} · {b.companyName} · {b.assignedSlotCount}/6 SP
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', flexShrink: 0 }}>Đi tới →</span>
              </button>
            ))}
          </div>
        </div>
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

            {quickBoothChips.length > 0 && (
              <div className="booth-mini-list">
                <span className="booth-mini-list__title">
                  {world.booths.length <= 6
                    ? 'Gian hàng nổi bật (Bấm để xem cận cảnh)'
                    : `Gian hàng tiêu biểu (${world.booths.length} gian · Bấm để xem cận cảnh)`}
                </span>
                <div className="booth-mini-list__chips">
                  {quickBoothChips.map((b) => (
                    <button
                      key={b.boothId}
                      type="button"
                      className="booth-chip"
                      onClick={() => onTeleportToBooth(b)}
                      title={`${b.companyName} — ${b.boothName} (${b.zoneName} · ${b.assignedSlotCount}/6 SP)`}
                    >
                      <span className="booth-chip__dot" style={{ backgroundColor: b.color || '#0ea5e9' }} />
                      <span className="booth-chip__name">{b.boothName}</span>
                    </button>
                  ))}
                  {world.booths.length > quickBoothChips.length && (
                    <button
                      type="button"
                      className="booth-chip"
                      onClick={() => setDirectoryOpen(true)}
                      title="Mở danh bạ và bản đồ 2D để xem tất cả gian hàng"
                    >
                      <span className="booth-chip__name">+ Xem tất cả ({world.booths.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
          )
        )}

        {/* Product Detail Card (Desktop) / Bottom Sheet (Mobile) or NPC Consultant Panel */}
        {npcPanelOpen && focusedBooth ? (
          <div style={{ marginLeft: 'auto', width: isMobileUi ? '100%' : 'auto' }}>
            <V28NpcConsultantPanel
              booth={focusedBooth}
              isMobilePortrait={isMobileUi}
              onAnimStateChange={onNpcAnimStateChange}
              onClose={onCloseNpcPanel}
              onInspectProduct={(product, slotId) => {
                onCloseNpcPanel();
                onSelectProduct(focusedBooth, product, slotId);
              }}
            />
          </div>
        ) : selectedProduct && (
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
        )}
      </div>
    </div>
  );
};
