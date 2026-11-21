import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
} from '../../services/v28Api';
import type { V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';

export interface InteractiveMap2DProps {
  world: V28ExhibitionVersionDetail;
  playerPos: V28PlayerState;
  focusedBooth: V28BoothPlacementView | null;
  isMobileUi: boolean;
  isMobileLandscape: boolean;
  /**
   * Optional set of truly visited boothIds (populated by Phase 4 tracking when available).
   * Phase 2 NEVER fakes visited state or marks a booth visited on map click.
   */
  visitedBoothIds?: ReadonlySet<string>;
  onNavigateToBooth: (booth: V28BoothPlacementView) => void;
  onClose: () => void;
}

/**
 * Returns the stable canonical 1-based booth number (1..100) derived from backend `slotIndex` (0..99).
 * Remains stable even when company/product data assigned to the booth changes.
 */
export function getCanonicalBoothNumber(
  booth: Pick<V28BoothPlacementView, 'slotIndex'>,
  fallbackIndex = 0
): number {
  if (typeof booth.slotIndex === 'number' && Number.isFinite(booth.slotIndex) && booth.slotIndex >= 0) {
    return Math.floor(booth.slotIndex) + 1;
  }
  return fallbackIndex + 1;
}

/**
 * Computes exact rotated 2D footprint dimensions from 3D world booth data without modifying coordinates.
 */
export function getBoothMapFootprint(
  booth: Pick<V28BoothPlacementView, 'positionX' | 'positionZ' | 'rotationY' | 'footprintWidth' | 'footprintDepth'>
): { x: number; y: number; width: number; height: number; cx: number; cy: number } {
  const cos = Math.abs(Math.cos(booth.rotationY));
  const sin = Math.abs(Math.sin(booth.rotationY));
  const width = booth.footprintWidth * cos + booth.footprintDepth * sin;
  const height = booth.footprintWidth * sin + booth.footprintDepth * cos;
  return {
    x: booth.positionX - width / 2,
    y: booth.positionZ - height / 2,
    width,
    height,
    cx: booth.positionX,
    cy: booth.positionZ,
  };
}

/**
 * Pure data-consistency validator for 2D Map <-> 3D World alignment.
 */
export function validateMap2DDataConsistency(world: Pick<V28ExhibitionVersionDetail, 'booths' | 'zones' | 'hallBounds'>): {
  valid: boolean;
  boothCount: number;
  zoneCount: number;
  uniqueBoothIds: number;
  uniqueBoothNumbers: number;
  minNumber: number;
  maxNumber: number;
  outOfBoundsCount: number;
  duplicateCoordinateCount: number;
} {
  const idSet = new Set<string>();
  const numSet = new Set<number>();
  const coordSet = new Set<string>();
  let minNumber = Infinity;
  let maxNumber = -Infinity;
  let outOfBoundsCount = 0;
  let duplicateCoordinateCount = 0;

  world.booths.forEach((b, idx) => {
    idSet.add(b.boothId);
    const num = getCanonicalBoothNumber(b, idx);
    numSet.add(num);
    if (num < minNumber) minNumber = num;
    if (num > maxNumber) maxNumber = num;

    const coordKey = `${b.positionX.toFixed(2)},${b.positionZ.toFixed(2)}`;
    if (coordSet.has(coordKey)) duplicateCoordinateCount += 1;
    coordSet.add(coordKey);

    if (
      b.positionX < world.hallBounds.minX ||
      b.positionX > world.hallBounds.maxX ||
      b.positionZ < world.hallBounds.minZ ||
      b.positionZ > world.hallBounds.maxZ
    ) {
      outOfBoundsCount += 1;
    }
  });

  const boothCount = world.booths.length;
  const valid =
    boothCount > 0 &&
    idSet.size === boothCount &&
    numSet.size === boothCount &&
    minNumber === 1 &&
    maxNumber === boothCount &&
    outOfBoundsCount === 0 &&
    duplicateCoordinateCount === 0;

  return {
    valid,
    boothCount,
    zoneCount: world.zones.length,
    uniqueBoothIds: idSet.size,
    uniqueBoothNumbers: numSet.size,
    minNumber: Number.isFinite(minNumber) ? minNumber : 0,
    maxNumber: Number.isFinite(maxNumber) ? maxNumber : 0,
    outOfBoundsCount,
    duplicateCoordinateCount,
  };
}

export interface MapBoothVisualStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  textFill: string;
  textStroke: string;
  showVisitedCheck: boolean;
  tone: 'dark' | 'bright' | 'dimmed';
}

/**
 * Pure Phase 11 visual resolver for 2D Map booth tiles:
 * - Unvisited -> dark navy/charcoal (#1e293b) with readable light label (#e2e8f0).
 * - Visited (server-verified only) -> bright Youth Blue (#38bdf8) with high-contrast label (#082f49) + ✓ indicator.
 * - Selected -> distinct amber outline (#f59e0b) WITHOUT overriding dark/bright visited fill.
 */
export function resolveMapBoothVisualStyle(opts: {
  isVisited: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isFilteredIn: boolean;
}): MapBoothVisualStyle {
  const { isVisited, isSelected, isHovered, isFilteredIn } = opts;

  if (!isFilteredIn) {
    return {
      fill: '#0f172a',
      fillOpacity: 0.32,
      stroke: '#334155',
      strokeWidth: 0.4,
      textFill: '#475569',
      textStroke: 'none',
      showVisitedCheck: false,
      tone: 'dimmed',
    };
  }

  if (isVisited) {
    return {
      fill: isHovered ? '#7dd3fc' : '#38bdf8',
      fillOpacity: 1,
      stroke: isSelected ? '#f59e0b' : isHovered ? '#ffffff' : '#e0f2fe',
      strokeWidth: isSelected ? 1.45 : isHovered ? 1.1 : 0.9,
      textFill: '#082f49',
      textStroke: 'rgba(224, 242, 254, 0.75)',
      showVisitedCheck: true,
      tone: 'bright',
    };
  }

  return {
    fill: isHovered ? '#334155' : '#1e293b',
    fillOpacity: 0.96,
    stroke: isSelected ? '#f59e0b' : isHovered ? '#94a3b8' : '#475569',
    strokeWidth: isSelected ? 1.45 : isHovered ? 0.95 : 0.65,
    textFill: '#e2e8f0',
    textStroke: 'rgba(15, 23, 42, 0.85)',
    showVisitedCheck: false,
    tone: 'dark',
  };
}

const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 3.5;

export const InteractiveMap2D: React.FC<InteractiveMap2DProps> = ({
  world,
  playerPos,
  focusedBooth,
  isMobileUi,
  isMobileLandscape,
  visitedBoothIds,
  onNavigateToBooth,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>('ALL');
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(focusedBooth?.boothId ?? null);
  const [hoveredBoothId, setHoveredBoothId] = useState<string | null>(null);
  const [navFeedback, setNavFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  // Zoom & Pan state for reading all 1..100 booth numbers clearly on any screen size
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    dragged: boolean;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    dragged: false,
  });

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ active: boolean; initialDist: number; initialZoom: number }>({
    active: false,
    initialDist: 0,
    initialZoom: 1,
  });

  const visitedSet = useMemo(() => visitedBoothIds ?? new Set<string>(), [visitedBoothIds]);

  const orderedBooths = useMemo(
    () =>
      world.booths
        .map((booth, idx) => ({
          booth,
          boothNumber: getCanonicalBoothNumber(booth, idx),
          footprint: getBoothMapFootprint(booth),
        }))
        .sort((a, b) => a.boothNumber - b.boothNumber),
    [world.booths]
  );

  const boothById = useMemo(() => {
    const map = new Map<string, (typeof orderedBooths)[number]>();
    for (const item of orderedBooths) {
      map.set(item.booth.boothId, item);
    }
    return map;
  }, [orderedBooths]);

  // Phase 8 Revision safety: clear selection/hover if booth was deleted during realtime sync
  useEffect(() => {
    if (selectedBoothId && !boothById.has(selectedBoothId)) {
      setSelectedBoothId(null);
    }
    if (hoveredBoothId && !boothById.has(hoveredBoothId)) {
      setHoveredBoothId(null);
    }
  }, [boothById, selectedBoothId, hoveredBoothId]);

  const filteredBooths = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orderedBooths.filter(({ booth, boothNumber }) => {
      if (selectedZoneCode !== 'ALL' && booth.zoneCode !== selectedZoneCode) return false;
      if (!q) return true;
      const numStr = String(boothNumber);
      return (
        numStr === q ||
        `#${numStr}` === q ||
        `gian ${numStr}`.includes(q) ||
        booth.boothName.toLowerCase().includes(q) ||
        booth.companyName.toLowerCase().includes(q) ||
        booth.zoneName.toLowerCase().includes(q) ||
        booth.zoneCode.toLowerCase().includes(q) ||
        booth.slots.some((s) => s.product?.name.toLowerCase().includes(q))
      );
    });
  }, [orderedBooths, searchQuery, selectedZoneCode]);

  const filteredBoothIdSet = useMemo(
    () => new Set(filteredBooths.map((item) => item.booth.boothId)),
    [filteredBooths]
  );

  const activePreviewEntry = useMemo(() => {
    const targetId = (!isMobileUi && hoveredBoothId) || selectedBoothId;
    return targetId ? boothById.get(targetId) ?? null : null;
  }, [isMobileUi, hoveredBoothId, selectedBoothId, boothById]);

  // Base world viewBox (exact 1:1 3D X/Z projection — North = -Z top, South/Spawn = +Z bottom)
  const pad = 4;
  const baseW = world.hallWidth + pad * 2;
  const baseH = world.hallDepth + pad * 2;
  const baseMinX = world.hallBounds.minX - pad;
  const baseMinZ = world.hallBounds.minZ - pad;

  const viewW = baseW / mapZoom;
  const viewH = baseH / mapZoom;
  const maxPanX = Math.max(0, (baseW - viewW) / 2);
  const maxPanY = Math.max(0, (baseH - viewH) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panOffset.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panOffset.y));
  const vbX = baseMinX + (baseW - viewW) / 2 + clampedPanX;
  const vbY = baseMinZ + (baseH - viewH) / 2 + clampedPanY;

  const handleZoomStep = useCallback((delta: number) => {
    setMapZoom((prev) => {
      const next = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, Number((prev + delta).toFixed(2))));
      if (next <= 1.01) {
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleResetView = useCallback(() => {
    setMapZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setSelectedZoneCode('ALL');
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleNavigate = useCallback(
    (booth: V28BoothPlacementView, boothNumber: number) => {
      // Phase 8 Revision safety: never navigate to a booth that no longer exists in active world
      if (!boothById.has(booth.boothId)) {
        setNavFeedback(`Gian #${boothNumber} không còn tồn tại trong sơ đồ hiện tại.`);
        return;
      }

      const ap = booth.approachPoint;
      const validApproach =
        ap &&
        Number.isFinite(ap.x) &&
        Number.isFinite(ap.z) &&
        ap.x >= world.hallBounds.minX &&
        ap.x <= world.hallBounds.maxX &&
        ap.z >= world.hallBounds.minZ &&
        ap.z <= world.hallBounds.maxZ;

      if (!validApproach) {
        setNavFeedback(`Không tìm thấy điểm tiếp cận hợp lệ cho Gian #${boothNumber}.`);
        return;
      }

      setNavFeedback(null);
      setSelectedBoothId(booth.boothId);
      onNavigateToBooth(booth);
      onClose();
    },
    [boothById, world.hallBounds, onNavigateToBooth, onClose]
  );

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch pinch zoom detection (always suppresses accidental booth click)
    if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStateRef.current = { active: true, initialDist: Math.max(1, dist), initialZoom: mapZoom };
      panDragRef.current.active = false;
      panDragRef.current.dragged = true;
      return;
    }

    panDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: clampedPanX,
      origPanY: clampedPanY,
      dragged: false,
    };
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchStateRef.current.active && activePointersRef.current.size >= 2) {
      e.stopPropagation();
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / Math.max(1, pinchStateRef.current.initialDist);
      const nextZoom = Math.max(
        MIN_MAP_ZOOM,
        Math.min(MAX_MAP_ZOOM, Number((pinchStateRef.current.initialZoom * ratio).toFixed(2)))
      );
      setMapZoom(nextZoom);
      if (nextZoom <= 1.01) setPanOffset({ x: 0, y: 0 });
      panDragRef.current.dragged = true;
      return;
    }

    const st = panDragRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dxPx = e.clientX - st.startX;
    const dyPx = e.clientY - st.startY;
    if (!st.dragged && Math.hypot(dxPx, dyPx) < 6) return;
    st.dragged = true;
    if (mapZoom <= 1.01) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = viewW / Math.max(1, rect.width);
    const scaleY = viewH / Math.max(1, rect.height);
    setPanOffset({
      x: Math.max(-maxPanX, Math.min(maxPanX, st.origPanX - dxPx * scaleX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, st.origPanY - dyPx * scaleY)),
    });
  };

  const handleSvgPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStateRef.current.active = false;
    }
    const st = panDragRef.current;
    if (st.active && st.pointerId === e.pointerId) {
      st.active = false;
      st.pointerId = -1;
      if (st.dragged) {
        window.setTimeout(() => {
          panDragRef.current.dragged = false;
        }, 0);
      }
    }
  };

  const mapSvgHeight = isMobileLandscape ? 140 : isMobileUi ? 260 : 320;
  const visitedCount = Math.min(world.booths.length, visitedSet.size);

  return (
    <section
      role="dialog"
      aria-label="Bản đồ 2D và danh bạ gian hàng"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        pointerEvents: 'auto',
        alignSelf: isMobileUi && !isMobileLandscape ? 'stretch' : 'flex-end',
        width: isMobileUi && !isMobileLandscape ? '100%' : isMobileLandscape ? 'min(480px, 84vw)' : 'min(460px, 46vw)',
        maxHeight: isMobileLandscape ? '84dvh' : isMobileUi ? '78dvh' : '82vh',
        background: 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderRadius: 16,
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.3)',
        border: '1px solid #cbd5e1',
        padding: isMobileLandscape ? 8 : 12,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobileLandscape ? 6 : 8,
        overflowX: 'hidden',
        overflowY: isMobileLandscape ? 'auto' : 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14.5, color: '#0f172a', display: 'block' }}>
            🗺️ Bản đồ 2D ({filteredBooths.length}/{world.booths.length} gian · {world.zones.length} khu)
          </strong>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Bố cục chữ U thực tế · Đã tham quan: {visitedCount}/{world.booths.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bản đồ và danh bạ"
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Search + Mobile Map/List Tab Switcher */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <input
          type="search"
          aria-label="Tìm gian hàng, số gian, doanh nghiệp, sản phẩm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm số gian (1-100), doanh nghiệp, sản phẩm..."
          style={{
            flex: 1,
            minWidth: 0,
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 12.5,
            boxSizing: 'border-box',
          }}
        />
        {isMobileUi && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              aria-pressed={activeTab === 'map'}
              style={{
                minHeight: 36,
                padding: '0 9px',
                borderRadius: 8,
                border: activeTab === 'map' ? '1px solid #0284c7' : '1px solid #cbd5e1',
                background: activeTab === 'map' ? '#0284c7' : '#f8fafc',
                color: activeTab === 'map' ? '#fff' : '#334155',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Bản đồ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              aria-pressed={activeTab === 'list'}
              style={{
                minHeight: 36,
                padding: '0 9px',
                borderRadius: 8,
                border: activeTab === 'list' ? '1px solid #0284c7' : '1px solid #cbd5e1',
                background: activeTab === 'list' ? '#0284c7' : '#f8fafc',
                color: activeTab === 'list' ? '#fff' : '#334155',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Danh sách
            </button>
          </div>
        )}
      </div>

      {/* MAP VIEW */}
      {(!isMobileUi || activeTab === 'map') && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* Zoom Controls */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 3,
              display: 'flex',
              gap: 4,
              background: 'rgba(15, 23, 42, 0.78)',
              padding: 3,
              borderRadius: 9,
            }}
          >
            <button
              type="button"
              aria-label="Phóng to bản đồ 2D"
              onClick={() => handleZoomStep(0.5)}
              style={{
                minWidth: 32,
                minHeight: 32,
                borderRadius: 6,
                border: 'none',
                background: 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Thu nhỏ bản đồ 2D"
              onClick={() => handleZoomStep(-0.5)}
              style={{
                minWidth: 32,
                minHeight: 32,
                borderRadius: 6,
                border: 'none',
                background: 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              −
            </button>
            {(mapZoom > 1.01 || selectedZoneCode !== 'ALL') && (
              <button
                type="button"
                aria-label="Đặt lại góc nhìn bản đồ 2D"
                onClick={handleResetView}
                style={{
                  minHeight: 32,
                  padding: '0 7px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                1×
              </button>
            )}
          </div>

          <svg
            data-testid="v28-interactive-map-svg"
            viewBox={`${vbX.toFixed(2)} ${vbY.toFixed(2)} ${viewW.toFixed(2)} ${viewH.toFixed(2)}`}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleZoomStep(e.deltaY < 0 ? 0.35 : -0.35);
            }}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerEnd}
            onPointerCancel={handleSvgPointerEnd}
            style={{
              width: '100%',
              height: mapSvgHeight,
              background: '#0b1220',
              borderRadius: 10,
              border: '1px solid #334155',
              display: 'block',
              touchAction: 'none',
              cursor: mapZoom > 1.01 ? 'grab' : 'default',
              userSelect: 'none',
            }}
          >
            {/* Hall Outer Floor (Dark Navy Map Canvas) */}
            <rect
              x={world.hallBounds.minX}
              y={world.hallBounds.minZ}
              width={world.hallWidth}
              height={world.hallDepth}
              fill="#0f172a"
              stroke="#334155"
              strokeWidth={1.2}
              rx={3}
            />

            {/* Central Grand Boulevard (preserves exact empty central corridor) */}
            <rect
              x={world.centralAvenueBounds.minX}
              y={world.centralAvenueBounds.minZ}
              width={world.centralAvenueBounds.maxX - world.centralAvenueBounds.minX}
              height={world.centralAvenueBounds.maxZ - world.centralAvenueBounds.minZ}
              fill="#13233f"
            />

            {/* Welcome / Entrance Area */}
            {world.welcomeAreaBounds && (
              <rect
                x={world.welcomeAreaBounds.minX}
                y={world.welcomeAreaBounds.minZ}
                width={world.welcomeAreaBounds.maxX - world.welcomeAreaBounds.minX}
                height={world.welcomeAreaBounds.maxZ - world.welcomeAreaBounds.minZ}
                fill="#1e293b"
                fillOpacity={0.85}
                stroke="#f59e0b"
                strokeWidth={0.7}
                strokeDasharray="2 2"
                rx={1.5}
              />
            )}

            {/* Active U-Shaped Zones (exact World coordinates, auto-synced with Phase 8 compaction) */}
            {world.zones.map((z) => {
              const activeZone = selectedZoneCode === z.code;
              const cx = (z.bounds.minX + z.bounds.maxX) / 2;
              const cz = (z.bounds.minZ + z.bounds.maxZ) / 2;
              return (
                <g
                  key={z.id}
                  data-zone-code={z.code}
                  onClick={() => {
                    if (panDragRef.current.dragged) return;
                    setSelectedZoneCode(activeZone ? 'ALL' : z.code);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={z.bounds.minX}
                    y={z.bounds.minZ}
                    width={z.bounds.maxX - z.bounds.minX}
                    height={z.bounds.maxZ - z.bounds.minZ}
                    fill={activeZone ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.65)'}
                    stroke={activeZone ? '#38bdf8' : '#334155'}
                    strokeWidth={activeZone ? 1.5 : 0.8}
                    rx={2}
                  />
                  <text
                    x={cx}
                    y={cz}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(4.5, Math.min(7.5, world.hallWidth * 0.055))}
                    fontWeight="800"
                    fill={activeZone ? '#7dd3fc' : '#64748b'}
                    pointerEvents="none"
                  >
                    KHU {z.code}
                  </text>
                </g>
              );
            })}

            {/* Active Booths: Dark unvisited, Bright visited (+ ✓), Direct Click/Enter Navigation */}
            {orderedBooths.map(({ booth, boothNumber, footprint }) => {
              const isVisited = visitedSet.has(booth.boothId);
              const isSelected = selectedBoothId === booth.boothId;
              const isHovered = hoveredBoothId === booth.boothId;
              const isFilteredIn = filteredBoothIdSet.has(booth.boothId);
              const styleSpec = resolveMapBoothVisualStyle({
                isVisited,
                isSelected,
                isHovered,
                isFilteredIn,
              });
              const labelFontSize = Math.max(2.6, Math.min(footprint.width, footprint.height) * 0.46);

              return (
                <g
                  key={booth.boothId}
                  role="button"
                  tabIndex={0}
                  aria-label={`Gian #${boothNumber} - ${booth.companyName || booth.boothName} - ${isVisited ? 'Đã tham quan' : 'Chưa tham quan'} - Nhấn để đi tới`}
                  data-testid={`v28-map-booth-${boothNumber}`}
                  data-booth-id={booth.boothId}
                  data-booth-number={boothNumber}
                  data-visited={isVisited ? 'true' : 'false'}
                  data-selected={isSelected ? 'true' : 'false'}
                  data-map-tone={styleSpec.tone}
                  onMouseEnter={() => {
                    if (!isMobileUi) setHoveredBoothId(booth.boothId);
                  }}
                  onMouseLeave={() => {
                    if (!isMobileUi) {
                      setHoveredBoothId((prev) => (prev === booth.boothId ? null : prev));
                    }
                  }}
                  onFocus={() => {
                    setHoveredBoothId(booth.boothId);
                  }}
                  onBlur={() => {
                    setHoveredBoothId((prev) => (prev === booth.boothId ? null : prev));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNavigate(booth, boothNumber);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (panDragRef.current.dragged || pinchStateRef.current.active) return;
                    handleNavigate(booth, boothNumber);
                  }}
                  style={{ cursor: 'pointer', outline: 'none' }}
                >
                  <rect
                    x={footprint.x}
                    y={footprint.y}
                    width={footprint.width}
                    height={footprint.height}
                    rx={0.7}
                    fill={styleSpec.fill}
                    fillOpacity={styleSpec.fillOpacity}
                    stroke={styleSpec.stroke}
                    strokeWidth={styleSpec.strokeWidth}
                  />
                  <text
                    x={footprint.cx}
                    y={footprint.cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={labelFontSize}
                    fontWeight="800"
                    fill={styleSpec.textFill}
                    paintOrder={styleSpec.textStroke === 'none' ? undefined : 'stroke'}
                    stroke={styleSpec.textStroke === 'none' ? undefined : styleSpec.textStroke}
                    strokeWidth={styleSpec.textStroke === 'none' ? undefined : labelFontSize * 0.2}
                    pointerEvents="none"
                  >
                    {styleSpec.showVisitedCheck ? `✓${boothNumber}` : boothNumber}
                  </text>
                </g>
              );
            })}

            {/* Live Avatar Position Marker */}
            <g pointerEvents="none" data-testid="v28-map-player-marker">
              <circle
                cx={playerPos.x}
                cy={playerPos.z}
                r={Math.max(2.5, world.hallWidth * 0.022)}
                fill="rgba(239, 68, 68, 0.25)"
              />
              <circle
                cx={playerPos.x}
                cy={playerPos.z}
                r={Math.max(1.5, world.hallWidth * 0.013)}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={0.8}
              />
            </g>
          </svg>

          {/* Compact Legend */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 10px',
              marginTop: 5,
              fontSize: 10.5,
              color: '#475569',
              alignItems: 'center',
            }}
          >
            <span>🔴 Bạn</span>
            <span>
              <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#1e293b', border: '1px solid #475569', marginRight: 3 }} />
              Chưa tham quan
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#38bdf8', border: '1px solid #0284c7', marginRight: 3 }} />
              ✓ Đã tham quan
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#1e293b', border: '1.5px solid #f59e0b', marginRight: 3 }} />
              Đang chọn
            </span>
            <span style={{ color: '#0369a1', fontWeight: 600 }}>· Chạm ô gian để đi tới ngay</span>
          </div>
        </div>
      )}

      {/* Hover Tooltip (Desktop) / Selected Booth Action Card (Desktop & Mobile) */}
      {activePreviewEntry && (
        <div
          data-testid="v28-map-booth-preview"
          style={{
            background: '#f8fafc',
            border: '1.5px solid #0284c7',
            borderRadius: 12,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: '#0f172a',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 6,
                }}
              >
                Gian #{activePreviewEntry.boothNumber}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
                Khu {activePreviewEntry.booth.zoneCode}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: visitedSet.has(activePreviewEntry.booth.boothId) ? '#047857' : '#64748b',
                }}
              >
                {visitedSet.has(activePreviewEntry.booth.boothId) ? '✓ Đã tham quan' : 'Chưa tham quan'}
              </span>
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: '#0f172a',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activePreviewEntry.booth.companyName || activePreviewEntry.booth.boothName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activePreviewEntry.booth.assignedSlotCount > 0
                ? `${activePreviewEntry.booth.assignedSlotCount}/6 SP · ${activePreviewEntry.booth.slots
                    .filter((s) => s.product)
                    .slice(0, 2)
                    .map((s) => s.product!.name)
                    .join(', ')}`
                : `${activePreviewEntry.booth.zoneName} · Chưa gắn sản phẩm`}
            </div>
          </div>
        </div>
      )}

      {navFeedback && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '6px 10px',
            flexShrink: 0,
          }}
        >
          ⚠️ {navFeedback}
        </div>
      )}

      {/* Scrollable Booth List (always visible on Desktop; tab-switched on Mobile for clean ergonomics) */}
      {(!isMobileUi || activeTab === 'list') && (
        <div
          style={{
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            flex: 1,
            minHeight: 80,
          }}
        >
          {filteredBooths.map(({ booth, boothNumber }) => {
            const isSelected = selectedBoothId === booth.boothId;
            const isVisited = visitedSet.has(booth.boothId);
            return (
              <button
                key={booth.boothId}
                type="button"
                onClick={() => handleNavigate(booth, boothNumber)}
                style={{
                  minHeight: 44,
                  padding: '7px 10px',
                  borderRadius: 10,
                  border: isSelected ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                  background: isSelected ? '#fffbeb' : isVisited ? '#ecfdf5' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 12.5,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    #{boothNumber} · {booth.boothName}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {isVisited ? '✓ Đã tham quan · ' : ''}Khu {booth.zoneCode} · {booth.companyName} · {booth.assignedSlotCount}/6 SP
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
