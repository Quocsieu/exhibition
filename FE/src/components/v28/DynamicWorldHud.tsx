import React, { useMemo, useRef, useState } from 'react';
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
  onOpenAdmin: () => void;
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
  onOpenAdmin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>('ALL');
  const [directoryOpen, setDirectoryOpen] = useState<boolean>(false);
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
      {/* TOP BAR */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            background: 'rgba(15, 23, 42, 0.86)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: isMobilePortrait ? '8px 10px' : '10px 14px',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(15,23,42,0.22)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: isMobilePortrait ? '1 1 100%' : '0 0 auto' }}>
            <span
              style={{
                background: '#0ea5e9',
                padding: '3px 8px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              V28
            </span>
            <strong style={{ fontSize: isMobilePortrait ? 14 : 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {world.exhibitionName} ({world.booths.length} gian)
            </strong>
            {isPreviewMode && (
              <span style={{ background: '#6366f1', padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                DRAFT PREVIEW
              </span>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
              👥 {onlineCount}
              {overflowVisitorCount > 0 ? ` (+${overflowVisitorCount} khu vực)` : ''}
            </span>
          </div>

          {/* Search input */}
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) setDirectoryOpen(true);
            }}
            placeholder="Tìm gian hàng, doanh nghiệp, sản phẩm..."
            style={{
              flex: '1 1 180px',
              minHeight: 40,
              padding: '6px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
          />

          {/* Primary Camera & Directory Action Buttons (min 44px touch targets) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onChangeCameraMode(cameraMode === 'overview' ? 'explore' : 'overview')}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 10,
                border: 'none',
                background: cameraMode === 'overview' ? '#0ea5e9' : 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {cameraMode === 'overview' ? '🚶 Khám phá' : '🗺️ Toàn cảnh'}
            </button>
            <button
              type="button"
              onClick={() => setDirectoryOpen((v) => !v)}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 10,
                border: 'none',
                background: directoryOpen ? '#10b981' : 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              📍 Danh bạ / Bản đồ
            </button>
            {isMobilePortrait && (
              <button
                type="button"
                onClick={() => setJoystickEnabled((v) => !v)}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: joystickEnabled ? '#f59e0b' : 'rgba(255,255,255,0.14)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                🕹️ Joystick
              </button>
            )}
            {/* V27.5 Visitor Rename & Color Customization Pill */}
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
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={32}
                  autoFocus
                  style={{
                    width: 120,
                    minHeight: 36,
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid #38bdf8',
                    background: '#0f172a',
                    color: '#fff',
                    fontSize: 12,
                  }}
                />
                <input
                  type="color"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                  style={{ width: 28, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <button
                  type="submit"
                  style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Lưu
                </button>
              </form>
            ) : (
              <button
                type="button"
                title="Đổi tên & màu nhân vật"
                onClick={() => {
                  setDraftName(playerName);
                  setDraftColor(playerColor);
                  setEditingProfile(true);
                }}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: playerColor, display: 'inline-block' }} />
                <span>{playerName}</span>
                <span>✏️</span>
              </button>
            )}

            {!isMobilePortrait && (
              <button
                type="button"
                onClick={onOpenAdmin}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ⚙️ Admin
              </button>
            )}
          </div>
        </div>

        {/* Zone Filter Chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            type="button"
            onClick={() => setSelectedZoneCode('ALL')}
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: 'none',
              background: selectedZoneCode === 'ALL' ? '#0f172a' : 'rgba(255,255,255,0.88)',
              color: selectedZoneCode === 'ALL' ? '#fff' : '#0f172a',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Tất cả ({world.booths.length})
          </button>
          {world.zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => {
                setSelectedZoneCode(z.code);
                setDirectoryOpen(true);
              }}
              style={{
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 999,
                border: 'none',
                background: selectedZoneCode === z.code ? '#0ea5e9' : 'rgba(255,255,255,0.88)',
                color: selectedZoneCode === z.code ? '#fff' : '#0f172a',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {z.displayName} ({z.boothCount})
            </button>
          ))}
        </div>
      </div>

      {/* DIRECTORY & MINI-MAP DRAWER */}
      {directoryOpen && (
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
              Bản đồ & Danh bạ ({filteredBooths.length} gian)
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

          {/* Interactive 2D Mini-map */}
          <svg
            viewBox={`${world.hallBounds.minX - 2} ${world.hallBounds.minZ - 2} ${world.hallWidth + 4} ${world.hallDepth + 4}`}
            style={{ width: '100%', height: 130, background: '#f1f5f9', borderRadius: 10, border: '1px solid #cbd5e1', flexShrink: 0 }}
          >
            <rect
              x={world.centralAvenueBounds.minX}
              y={world.centralAvenueBounds.minZ}
              width={world.centralAvenueBounds.maxX - world.centralAvenueBounds.minX}
              height={world.centralAvenueBounds.maxZ - world.centralAvenueBounds.minZ}
              fill="#e0f2fe"
            />
            {world.booths.map((b) => (
              <rect
                key={b.boothId}
                x={b.positionX - b.footprintWidth / 2}
                y={b.positionZ - b.footprintDepth / 2}
                width={b.footprintWidth}
                height={b.footprintDepth}
                fill={selectedZoneCode === 'ALL' || b.zoneCode === selectedZoneCode ? b.color : '#cbd5e1'}
                onClick={() => {
                  onTeleportToBooth(b);
                  setDirectoryOpen(false);
                }}
                style={{ cursor: 'pointer' }}
              />
            ))}
            <circle cx={playerPos.x} cy={playerPos.z} r={2.2} fill="#ef4444" stroke="#fff" strokeWidth={0.8} />
          </svg>

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

      {/* BOTTOM AREA: Optional Mobile Joystick + Focused Booth / Product Bottom Sheet */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        {/* Virtual Joystick (Mobile Portrait Optional) */}
        {isMobilePortrait && joystickEnabled && !focusedBooth && !selectedProduct && (
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

        {/* Focused Booth / Product / NPC AI Consultant Bottom Sheet or Floating Card */}
        {npcPanelOpen && focusedBooth ? (
          <div style={{ marginLeft: 'auto', width: isMobilePortrait ? '100%' : 'auto' }}>
            <V28NpcConsultantPanel
              booth={focusedBooth}
              isMobilePortrait={isMobilePortrait}
              onAnimStateChange={onNpcAnimStateChange}
              onClose={onCloseNpcPanel}
            />
          </div>
        ) : (selectedProduct || focusedBooth) && (
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
            {selectedProduct ? (
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
                {selectedProduct.product.images[0] && (
                  <img
                    src={selectedProduct.product.images[0]}
                    alt={selectedProduct.product.name}
                    style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }}
                  />
                )}
                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>
                  {selectedProduct.product.price.toLocaleString('vi-VN')} {selectedProduct.product.currency}
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
            ) : focusedBooth ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
                      {focusedBooth.zoneName} · {focusedBooth.archetypeLabel}
                    </div>
                    <h4 style={{ margin: '2px 0 0', fontSize: 16, color: '#0f172a' }}>{focusedBooth.boothName}</h4>
                    <div style={{ fontSize: 12, color: '#475569' }}>{focusedBooth.companyName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseFocus}
                    style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Sản phẩm trưng bày ({focusedBooth.assignedSlotCount}/6 vị trí):
                  </div>
                  <button
                    type="button"
                    onClick={onOpenNpcPanel}
                    style={{
                      minHeight: 36,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#0284c7',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    🤖 Hỏi Trợ lý AI / Audio
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                  {focusedBooth.slots.map((s) => (
                    <button
                      key={s.slotId}
                      type="button"
                      disabled={!s.product}
                      onClick={() => s.product && onSelectProduct(focusedBooth, s.product, s.slotId)}
                      style={{
                        minWidth: 0,
                        minHeight: 44,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        background: s.product ? '#f8fafc' : '#f1f5f9',
                        textAlign: 'left',
                        cursor: s.product ? 'pointer' : 'default',
                        opacity: s.product ? 1 : 0.6,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{s.slotId}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.product ? s.product.name : 'Vị trí trống'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
