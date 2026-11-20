import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
} from '../../services/v28Api';
import type { V28CameraMode, V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { V28NpcAnimState } from '../../scene/v28/DynamicBoothNpc3D';
import { V28NpcConsultantPanel } from './V28NpcConsultantPanel';

export interface DynamicWorldHudProps {
  world: V28ExhibitionVersionDetail;
  isPreviewMode: boolean;
  cameraMode: V28CameraMode;
  isMobilePortrait: boolean;
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
  onJoystickChange,
  onZoomIn,
  onZoomOut,
  onOpenAdmin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>('ALL');
  const [directoryOpen, setDirectoryOpen] = useState<boolean>(false);

  useEffect(() => {
    if (directoryOpenNonce > 0) {
      setDirectoryOpen(true);
    }
  }, [directoryOpenNonce]);
  const [joystickEnabled, setJoystickEnabled] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>(playerName);
  const [draftColor, setDraftColor] = useState<string>(playerColor);
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  const handleJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyOriginRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyOriginRef.current) return;
    const maxR = 34;
    const dx = e.clientX - joyOriginRef.current.x;
    const dy = e.clientY - joyOriginRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);
    const nx = dist > 0 ? (dx / dist) * clamped : 0;
    const ny = dist > 0 ? (dy / dist) * clamped : 0;
    setJoyKnob({ x: nx, y: ny });
    onJoystickChange({ x: nx / maxR, y: ny / maxR });
  };

  const handleJoyEnd = () => {
    joyOriginRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    onJoystickChange({ x: 0, y: 0 });
  };

  const isBoothFocusActive = cameraMode === 'focus' && Boolean(focusedBooth);
  const focusedWebsiteUrl = getSafeWebsiteUrl(focusedBooth?.contactUrl);
  const focusedCategoryLabel =
    (focusedBooth?.zoneCategoryTag && focusedBooth.zoneCategoryTag !== 'Chưa phân bổ'
      ? focusedBooth.zoneCategoryTag
      : focusedBooth?.category) || 'Triển lãm V28';

  // Dynamically select up to 8 booths (4 on mobile portrait) from Published V28 World,
  // prioritizing booths that currently have assigned products (NEVER hardcoding 6 V27.5 booths!)
  const quickBoothChips = useMemo(() => {
    const limit = isMobilePortrait ? 4 : 8;
    const sorted = [...world.booths].sort((a, b) => {
      if (b.assignedSlotCount !== a.assignedSlotCount) {
        return b.assignedSlotCount - a.assignedSlotCount;
      }
      return a.slotIndex - b.slotIndex;
    });
    return sorted.slice(0, limit);
  }, [world.booths, isMobilePortrait]);

  // V28-AUDIT-029: Release mobile virtual joystick ONLY when transitioning to hidden/disabled while held
  const showJoystick = isMobilePortrait && joystickEnabled && !isBoothFocusActive && !selectedProduct;
  useEffect(() => {
    if (!showJoystick) {
      setJoyKnob((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      onJoystickChange({ x: 0, y: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJoystick]);

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
        padding: isMobilePortrait ? '10px 10px env(safe-area-inset-bottom, 10px)' : '14px 18px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* =====================================================================
       * MODE A: BOOTH FOCUS TOOLBAR (Synchronized with V27.5 Hình 1)
       * [← Quay lại khu triển lãm Esc] [Danh mục] [Doanh nghiệp] [Website ↗] [Nghe tư vấn viên giới thiệu]
       * ===================================================================== */}
      {isBoothFocusActive && focusedBooth ? (
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
            ← Quay lại khu triển lãm {!isMobilePortrait && <kbd>Esc</kbd>}
          </button>

          <div
            className="shop-showcase-booth-banner"
            title={`${focusedBooth.companyName || focusedBooth.boothName}${
              focusedBooth.companyName && focusedBooth.companyName !== focusedBooth.boothName
                ? ` (${focusedBooth.boothName})`
                : ''
            } · ${focusedBooth.zoneName} · ${focusedBooth.assignedSlotCount}/6 sản phẩm`}
            style={{ maxWidth: isMobilePortrait ? '100%' : 460 }}
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
            {focusedBooth.companyName && focusedBooth.companyName !== focusedBooth.boothName && !isMobilePortrait && (
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

      {/* DIRECTORY & MINI-MAP DRAWER (Hidden while focused on a booth) */}
      {directoryOpen && !isBoothFocusActive && (
        <div
          style={{
            pointerEvents: 'auto',
            alignSelf: isMobilePortrait ? 'stretch' : 'flex-end',
            width: isMobilePortrait ? '100%' : 360,
            maxHeight: isMobilePortrait ? '52dvh' : '65vh',
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
              style={{
                minWidth: 36,
                minHeight: 36,
                borderRadius: 8,
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

      {/* BOTTOM AREA: Mode B Camera/Booth Dock (V27.5 Hình 2) + Mobile Joystick + Focus Panels */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        {/* Virtual Joystick (Mobile Portrait Optional — hidden in focus mode) */}
        {isMobilePortrait && joystickEnabled && !isBoothFocusActive && !selectedProduct && (
          <div
            onPointerDown={handleJoyStart}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyEnd}
            onPointerCancel={handleJoyEnd}
            style={{
              pointerEvents: 'auto',
              width: 104,
              height: 104,
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.45)',
              border: '2px solid rgba(255,255,255,0.4)',
              position: 'relative',
              touchAction: 'none',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#0ea5e9',
                position: 'absolute',
                left: 30 + joyKnob.x,
                top: 30 + joyKnob.y,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        )}

        {/* Mode B: Camera Mode Bar + Zoom + / - + Dynamic Booth Quick Chips (Synchronized with V27.5 Hình 2) */}
        {!isBoothFocusActive && (
          <aside
            className="expo-hud-dock"
            aria-label="Điều khiển góc nhìn camera và danh sách gian hàng"
            style={{
              position: 'static',
              pointerEvents: 'auto',
              maxWidth: isMobilePortrait ? 'calc(100% - 116px)' : '100%',
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

              {isMobilePortrait && (
                <button
                  type="button"
                  className={`camera-mode-btn ${joystickEnabled ? 'camera-mode-btn--active' : ''}`}
                  onClick={() => setJoystickEnabled((v) => !v)}
                  aria-pressed={joystickEnabled}
                >
                  🕹️
                </button>
              )}
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
        )}

        {/* Product Detail Card or NPC Consultant Panel (Duplicate white booth card removed per Task A) */}
        {npcPanelOpen && focusedBooth ? (
          <div style={{ marginLeft: 'auto', width: isMobilePortrait ? '100%' : 'auto' }}>
            <V28NpcConsultantPanel
              booth={focusedBooth}
              isMobilePortrait={isMobilePortrait}
              onAnimStateChange={onNpcAnimStateChange}
              onClose={onCloseNpcPanel}
              onInspectProduct={(product, slotId) => {
                onCloseNpcPanel();
                onSelectProduct(focusedBooth, product, slotId);
              }}
            />
          </div>
        ) : selectedProduct && (
          <div
            style={{
              pointerEvents: 'auto',
              marginLeft: 'auto',
              width: isMobilePortrait ? '100%' : 420,
              maxHeight: isMobilePortrait ? '48dvh' : '58vh',
              overflowY: 'auto',
              background: 'rgba(255, 255, 255, 0.97)',
              backdropFilter: 'blur(12px)',
              borderRadius: isMobilePortrait ? '18px 18px 12px 12px' : 16,
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
        )}
      </div>
    </div>
  );
};
