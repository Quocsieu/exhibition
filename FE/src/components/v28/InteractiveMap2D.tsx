import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
} from '../../services/v28Api';
import type { V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { GuidedRouteResult } from '../../services/v28NavigationEngine';

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
  favoriteBoothIds?: ReadonlySet<string>;
  guidedRoute?: GuidedRouteResult | null;
  suggestedBoothIds?: ReadonlySet<string>;
  onNavigateToBooth: (booth: V28BoothPlacementView) => void;
  onToggleFavoriteBooth?: (booth: V28BoothPlacementView) => void;
  onGuideToBooth?: (booth: V28BoothPlacementView) => void;
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
 * UAT Fix 02: Unified 90° clockwise landscape coordinate transformation (world 3D X/Z -> 2D SVG X/Y).
 * - Determinant = +1 (pure rotation, zero mirroring, preserves exact Left/Right zone chirality):
 *   mapX = -z (Entrance Gate +Z sits cleanly on the LEFT; walking into the hall -Z flows LEFT -> RIGHT)
 *   mapY =  x (Zones E..A sit along the TOP row; Zones J..F sit along the BOTTOM row)
 * - Does NOT mutate any 3D world coordinates, layoutGenerator, or walkwayGraph.
 */
export function worldToLandscapeMapPoint(x: number, z: number): { mx: number; my: number } {
  return { mx: -z, my: x };
}

export function worldBoundsToLandscapeRect(bounds: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): { x: number; y: number; width: number; height: number; cx: number; cy: number } {
  const x = -bounds.maxZ;
  const y = bounds.minX;
  const width = bounds.maxZ - bounds.minZ;
  const height = bounds.maxX - bounds.minX;
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
}

export function worldFootprintToLandscapeRect(fp: {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}): { x: number; y: number; width: number; height: number; cx: number; cy: number } {
  return worldBoundsToLandscapeRect({
    minX: fp.x,
    maxX: fp.x + fp.width,
    minZ: fp.y,
    maxZ: fp.y + fp.height,
  });
}

export function worldHeadingToLandscapeDir(rotationY: number): { dx: number; dy: number } {
  // World forward = (sin(rotY), cos(rotY)) -> under (mx = -z, my = x): (-cos(rotY), sin(rotY))
  return { dx: -Math.cos(rotationY), dy: Math.sin(rotationY) };
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
  favoriteBoothIds,
  guidedRoute = null,
  suggestedBoothIds,
  onNavigateToBooth,
  onToggleFavoriteBooth,
  onGuideToBooth,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>('ALL');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(focusedBooth?.boothId ?? null);
  const [hoveredBoothId, setHoveredBoothId] = useState<string | null>(null);
  const [navFeedback, setNavFeedback] = useState<string | null>(null);

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
  const favoriteSet = useMemo(() => favoriteBoothIds ?? new Set<string>(), [favoriteBoothIds]);

  const orderedBooths = useMemo(
    () =>
      world.booths
        .map((booth, idx) => {
          const worldFp = getBoothMapFootprint(booth);
          return {
            booth,
            boothNumber: getCanonicalBoothNumber(booth, idx),
            footprint: worldFootprintToLandscapeRect(worldFp),
          };
        })
        .sort((a, b) => a.boothNumber - b.boothNumber),
    [world.booths]
  );

  const favoriteEntries = useMemo(
    () => orderedBooths.filter((item) => favoriteSet.has(item.booth.boothId)),
    [orderedBooths, favoriteSet]
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
      if (favoritesOnly && !favoriteSet.has(booth.boothId)) return false;
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
  }, [orderedBooths, searchQuery, selectedZoneCode, favoritesOnly, favoriteSet]);

  const filteredBoothIdSet = useMemo(
    () => new Set(filteredBooths.map((item) => item.booth.boothId)),
    [filteredBooths]
  );

  const activePreviewEntry = useMemo(() => {
    const targetId = (!isMobileUi && hoveredBoothId) || selectedBoothId;
    return targetId ? boothById.get(targetId) ?? null : null;
  }, [isMobileUi, hoveredBoothId, selectedBoothId, boothById]);

  // UAT Fix 02: Tight content-fitted 90°-rotated landscape viewBox (aspect ~2.15:1)
  // Eliminates dark side margins while keeping exact 1:1 undistorted proportions!
  const { baseMinX, baseMinY, baseW, baseH } = useMemo(() => {
    const sp = worldToLandscapeMapPoint(world.spawnPoint.x, world.spawnPoint.z);
    let minX = sp.mx - 12; // room for Entrance Gate badge on left
    let maxX = sp.mx + 4;
    let minY = sp.my;
    let maxY = sp.my;
    for (const item of orderedBooths) {
      const fp = item.footprint;
      if (fp.x < minX) minX = fp.x;
      if (fp.x + fp.width > maxX) maxX = fp.x + fp.width;
      if (fp.y < minY) minY = fp.y;
      if (fp.y + fp.height > maxY) maxY = fp.y + fp.height;
    }
    for (const z of world.zones) {
      if (!z.bounds) continue;
      const r = worldBoundsToLandscapeRect(z.bounds);
      if (r.x < minX) minX = r.x;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y < minY) minY = r.y;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    }
    const padX = 5;
    const padY = 5;
    return {
      baseMinX: minX - padX,
      baseMinY: minY - padY,
      baseW: Math.max(60, maxX - minX + padX * 2),
      baseH: Math.max(40, maxY - minY + padY * 2),
    };
  }, [orderedBooths, world.zones, world.spawnPoint.x, world.spawnPoint.z]);

  const viewW = baseW / mapZoom;
  const viewH = baseH / mapZoom;
  const maxPanX = Math.max(0, (baseW - viewW) / 2);
  const maxPanY = Math.max(0, (baseH - viewH) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, panOffset.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, panOffset.y));
  const vbX = baseMinX + (baseW - viewW) / 2 + clampedPanX;
  const vbY = baseMinY + (baseH - viewH) / 2 + clampedPanY;

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
    setFavoritesOnly(false);
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

  const hallRect = useMemo(() => worldBoundsToLandscapeRect(world.hallBounds), [world.hallBounds]);
  const avenueRect = useMemo(() => worldBoundsToLandscapeRect(world.centralAvenueBounds), [world.centralAvenueBounds]);
  const welcomeRect = useMemo(
    () => (world.welcomeAreaBounds ? worldBoundsToLandscapeRect(world.welcomeAreaBounds) : null),
    [world.welcomeAreaBounds]
  );
  const spawnMapPt = useMemo(
    () => worldToLandscapeMapPoint(world.spawnPoint.x, world.spawnPoint.z),
    [world.spawnPoint.x, world.spawnPoint.z]
  );
  const playerMapPt = worldToLandscapeMapPoint(playerPos.x, playerPos.z);
  const playerDir = worldHeadingToLandscapeDir(playerPos.rotationY);
  const leftDir = { dx: -playerDir.dy, dy: playerDir.dx };
  const playerConePoints = [
    `${(playerMapPt.mx + playerDir.dx * 7.2).toFixed(2)},${(playerMapPt.my + playerDir.dy * 7.2).toFixed(2)}`,
    `${(playerMapPt.mx - playerDir.dx * 2.4 + leftDir.dx * 3.0).toFixed(2)},${(playerMapPt.my - playerDir.dy * 2.4 + leftDir.dy * 3.0).toFixed(2)}`,
    `${(playerMapPt.mx - playerDir.dx * 2.4 - leftDir.dx * 3.0).toFixed(2)},${(playerMapPt.my - playerDir.dy * 2.4 - leftDir.dy * 3.0).toFixed(2)}`,
  ].join(' ');

  const mapAspect = baseW / Math.max(1, baseH);
  const visitedCount = Math.min(world.booths.length, visitedSet.size);

  return (
    <div
      data-testid="v28-map-modal-backdrop"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        pointerEvents: 'auto',
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        background: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobileUi ? 6 : 16,
        boxSizing: 'border-box',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Bản đồ 2D và danh bạ gian hàng"
        data-testid="v28-map-modal"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'auto',
          width: isMobileUi ? 'calc(100vw - 12px)' : 'min(1160px, 88vw)',
          maxWidth: isMobileUi ? '100%' : 1180,
          maxHeight: isMobileUi ? '94dvh' : '90vh',
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderRadius: isMobileUi ? 14 : 18,
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.42)',
          border: '1px solid #cbd5e1',
          padding: isMobileLandscape ? 10 : isMobileUi ? 12 : 16,
          display: 'flex',
          flexDirection: 'column',
          gap: isMobileLandscape ? 8 : 10,
          overflowX: 'hidden',
          overflowY: 'auto',
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

      {/* Search + Favorites Filter + Inline Zoom Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: isMobileUi ? 'wrap' : 'nowrap' }}>
        <input
          type="search"
          aria-label="Tìm gian hàng, số gian, doanh nghiệp, sản phẩm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm số gian (1-100), doanh nghiệp, sản phẩm..."
          style={{
            flex: 1,
            minWidth: isMobileUi ? 150 : 0,
            padding: '8px 12px',
            borderRadius: 9,
            border: '1px solid #cbd5e1',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          data-testid="v28-map-favorites-filter-btn"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((prev) => !prev)}
          style={{
            minHeight: 38,
            padding: '0 11px',
            borderRadius: 9,
            border: favoritesOnly
              ? '1.5px solid #e11d48'
              : favoriteEntries.length > 0
                ? '1px solid #fda4af'
                : '1px solid #cbd5e1',
            background: favoritesOnly
              ? '#e11d48'
              : favoriteEntries.length > 0
                ? '#fff1f2'
                : '#f8fafc',
            color: favoritesOnly
              ? '#ffffff'
              : favoriteEntries.length > 0
                ? '#be123c'
                : '#475569',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden="true">{favoritesOnly || favoriteEntries.length > 0 ? '♥' : '♡'}</span>
          Yêu thích ({favoriteEntries.length})
        </button>
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: '#0f172a',
            padding: 3,
            borderRadius: 9,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Phóng to bản đồ 2D"
            onClick={() => handleZoomStep(0.5)}
            style={{
              minWidth: 34,
              minHeight: 34,
              borderRadius: 6,
              border: 'none',
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
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
              minWidth: 34,
              minHeight: 34,
              borderRadius: 6,
              border: 'none',
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            −
          </button>
          {(mapZoom > 1.01 || selectedZoneCode !== 'ALL' || favoritesOnly) && (
            <button
              type="button"
              aria-label="Đặt lại góc nhìn bản đồ 2D"
              onClick={handleResetView}
              style={{
                minHeight: 34,
                padding: '0 8px',
                borderRadius: 6,
                border: 'none',
                background: '#0284c7',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              1×
            </button>
          )}
        </div>
      </div>

      {/* Favorite / Pinned Booths Quick-Jump Strip */}
      <div
        data-testid="v28-map-favorites-list"
        style={{
          padding: favoriteEntries.length > 0 ? '8px 10px' : '6px 10px',
          borderRadius: 10,
          border: favoriteEntries.length > 0 ? '1px solid #fecdd3' : '1px dashed #cbd5e1',
          background: favoriteEntries.length > 0 ? '#fff1f2' : '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}
      >
        {favoriteEntries.length > 0 ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
                fontWeight: 800,
                color: '#9f1239',
              }}
            >
              <span>♥ Gian hàng yêu thích ({favoriteEntries.length})</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#be123c' }}>
                Nhấn để đi nhanh tới gian hàng
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 2,
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {favoriteEntries.map(({ booth, boothNumber }) => (
                <div
                  key={booth.boothId}
                  data-testid={`v28-map-favorite-item-${boothNumber}`}
                  onMouseEnter={() => {
                    if (!isMobileUi) setHoveredBoothId(booth.boothId);
                  }}
                  onMouseLeave={() => {
                    if (!isMobileUi) {
                      setHoveredBoothId((prev) => (prev === booth.boothId ? null : prev));
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: '#ffffff',
                    border: '1px solid #fda4af',
                    borderRadius: 9,
                    padding: '3px 4px 3px 6px',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(190, 18, 60, 0.08)',
                  }}
                >
                  <button
                    type="button"
                    data-testid={`v28-map-favorite-go-${boothNumber}`}
                    onClick={() => handleNavigate(booth, boothNumber)}
                    aria-label={`Đi nhanh tới Gian #${boothNumber} - ${booth.companyName || booth.boothName}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: 'none',
                      background: 'transparent',
                      padding: '3px 4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#0f172a',
                    }}
                  >
                    <span
                      style={{
                        background: '#e11d48',
                        color: '#ffffff',
                        borderRadius: 6,
                        padding: '1px 6px',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      #{boothNumber}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        maxWidth: isMobileUi ? 130 : 180,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {booth.companyName || booth.boothName}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: '#0284c7',
                        background: '#e0f2fe',
                        borderRadius: 5,
                        padding: '1px 5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Đi nhanh →
                    </span>
                  </button>
                  {onToggleFavoriteBooth && (
                    <button
                      type="button"
                      data-testid={`v28-map-favorite-remove-${boothNumber}`}
                      aria-label={`Bỏ ghim Gian #${boothNumber}`}
                      title="Bỏ ghim khỏi yêu thích"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteBooth(booth);
                      }}
                      style={{
                        minWidth: 24,
                        minHeight: 24,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: '#64748b' }}>
            ♡ Chưa có gian hàng yêu thích — nhấn biểu tượng ♥ trên biển hiệu gian hàng để ghim và đi nhanh từ bản đồ.
          </div>
        )}
      </div>

      {/* MAP VIEW */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
        <svg
          data-testid="v28-interactive-map-svg"
          viewBox={`${vbX.toFixed(2)} ${vbY.toFixed(2)} ${viewW.toFixed(2)} ${viewH.toFixed(2)}`}
          preserveAspectRatio="xMidYMid meet"
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
            height: 'auto',
            aspectRatio: `${mapAspect.toFixed(3)}`,
            maxHeight: isMobileLandscape ? '56dvh' : isMobileUi ? '46dvh' : '60vh',
            minHeight: isMobileUi ? 190 : 320,
            background: '#0b1220',
            borderRadius: 12,
            border: '1px solid #334155',
            display: 'block',
            touchAction: 'none',
            cursor: mapZoom > 1.01 ? 'grab' : 'default',
            userSelect: 'none',
          }}
        >
          {/* Hall Outer Floor (90° Landscape Rotated Dark Navy Map Canvas) */}
          <rect
            x={hallRect.x}
            y={hallRect.y}
            width={hallRect.width}
            height={hallRect.height}
            fill="#0f172a"
            stroke="#334155"
            strokeWidth={1.2}
            rx={3}
          />

          {/* Central Grand Boulevard (Horizontal Spine from Left Entrance to Right North End) */}
          <rect
            x={avenueRect.x}
            y={avenueRect.y}
            width={avenueRect.width}
            height={avenueRect.height}
            fill="#162b4d"
          />

          {/* Welcome / Entrance Area (Left Threshold) */}
          {welcomeRect && (
            <rect
              x={welcomeRect.x}
              y={welcomeRect.y}
              width={welcomeRect.width}
              height={welcomeRect.height}
              fill="#1e293b"
              fillOpacity={0.88}
              stroke="#f59e0b"
              strokeWidth={0.9}
              strokeDasharray="2.5 2"
              rx={2}
            />
          )}

          {/* Active U-Shaped Zones (90° Landscape Coordinates; Text stays 100% Horizontal & High-Contrast!) */}
          {world.zones.map((z) => {
            const activeZone = selectedZoneCode === z.code;
            const zr = worldBoundsToLandscapeRect(z.bounds);
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
                  x={zr.x}
                  y={zr.y}
                  width={zr.width}
                  height={zr.height}
                  fill={activeZone ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.72)'}
                  stroke={activeZone ? '#38bdf8' : '#475569'}
                  strokeWidth={activeZone ? 1.8 : 0.9}
                  rx={2.2}
                />
                <text
                  x={zr.cx}
                  y={zr.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={7.6}
                  fontWeight="900"
                  letterSpacing="0.3"
                  fill={activeZone ? '#7dd3fc' : '#94a3b8'}
                  pointerEvents="none"
                >
                  KHU {z.code}
                </text>
              </g>
            );
          })}

          {/* Active Booths: Horizontal Numbers, Larger Typography, High-Contrast Visited/Unvisited/Selected */}
          {orderedBooths.map(({ booth, boothNumber, footprint }) => {
            const isVisited = visitedSet.has(booth.boothId);
            const isFavorite = favoriteSet.has(booth.boothId);
            const isSelected = selectedBoothId === booth.boothId;
            const isHovered = hoveredBoothId === booth.boothId;
            const isFilteredIn = filteredBoothIdSet.has(booth.boothId);
            const styleSpec = resolveMapBoothVisualStyle({
              isVisited,
              isSelected,
              isHovered,
              isFilteredIn,
            });
            const minDim = Math.min(footprint.width, footprint.height);
            const labelFontSize = Math.max(3.6, minDim * (boothNumber >= 100 ? 0.44 : 0.54));

            return (
              <g
                key={booth.boothId}
                role="button"
                tabIndex={0}
                aria-label={`Gian #${boothNumber} - ${booth.companyName || booth.boothName} - ${isVisited ? 'Đã tham quan' : 'Chưa tham quan'}${isFavorite ? ' - Yêu thích' : ''} - Nhấn để đi tới`}
                data-testid={`v28-map-booth-${boothNumber}`}
                data-booth-id={booth.boothId}
                data-booth-number={boothNumber}
                data-visited={isVisited ? 'true' : 'false'}
                data-favorite={isFavorite ? 'true' : 'false'}
                data-selected={isSelected ? 'true' : 'false'}
                data-map-tone={styleSpec.tone}
                onMouseEnter={() => {
                  if (!isMobileUi && !panDragRef.current.active) setHoveredBoothId(booth.boothId);
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
                  rx={0.95}
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
                  fontWeight="900"
                  fill={styleSpec.textFill}
                  paintOrder={styleSpec.textStroke === 'none' ? undefined : 'stroke'}
                  stroke={styleSpec.textStroke === 'none' ? undefined : styleSpec.textStroke}
                  strokeWidth={styleSpec.textStroke === 'none' ? undefined : labelFontSize * 0.16}
                  pointerEvents="none"
                >
                  {styleSpec.showVisitedCheck ? `✓${boothNumber}` : boothNumber}
                </text>
                {isFavorite && isFilteredIn && (
                  <g pointerEvents="none" data-testid={`v28-map-booth-fav-badge-${boothNumber}`}>
                    <circle
                      cx={footprint.x + footprint.width - 1.1}
                      cy={footprint.y + 1.1}
                      r={2.1}
                      fill="#e11d48"
                      stroke="#ffffff"
                      strokeWidth={0.55}
                    />
                    <text
                      x={footprint.x + footprint.width - 1.1}
                      y={footprint.y + 1.25}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={2.4}
                      fontWeight="900"
                      fill="#ffffff"
                    >
                      ♥
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* UAT Fix 02: Prominent Horizontal Entrance Gate Marker on Left Threshold */}
          <g pointerEvents="none" data-testid="v28-map-entrance-marker">
            <rect
              x={spawnMapPt.mx - 12}
              y={spawnMapPt.my - 11}
              width={26}
              height={7.2}
              rx={1.8}
              fill="#0057b8"
              stroke="#ffffff"
              strokeWidth={0.85}
            />
            <text
              x={spawnMapPt.mx + 1}
              y={spawnMapPt.my - 7.2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={3.9}
              fontWeight={900}
              fill="#ffffff"
            >
              ⛩ CỔNG VÀO
            </text>
          </g>

          {/* Phase 2 Synced Guided Route Polyline (Rotated 90° into Landscape Map Space) */}
          {guidedRoute && guidedRoute.waypoints.length >= 2 && (
            <polyline
              data-testid="v28-map-guided-route"
              points={guidedRoute.waypoints
                .map((pt) => {
                  const mp = worldToLandscapeMapPoint(pt.x, pt.z);
                  return `${mp.mx.toFixed(2)},${mp.my.toFixed(2)}`;
                })
                .join(' ')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2.2}
              strokeDasharray="3.8 2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}

          {/* Suggested Booths Dashed Emerald Rings */}
          {suggestedBoothIds &&
            orderedBooths
              .filter((item) => suggestedBoothIds.has(item.booth.boothId))
              .map(({ booth, footprint }) => (
                <circle
                  key={`sug-${booth.boothId}`}
                  cx={footprint.cx}
                  cy={footprint.cy}
                  r={Math.max(footprint.width, footprint.height) * 0.64}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={1.35}
                  strokeDasharray="2.2 1.6"
                  pointerEvents="none"
                />
              ))}

          {/* Live Avatar Position & Heading Cone Marker (Synchronized with 90° Landscape Rotation) */}
          <g pointerEvents="none" data-testid="v28-map-player-marker">
            <circle
              cx={playerMapPt.mx}
              cy={playerMapPt.my}
              r={5.8}
              fill="rgba(239, 68, 68, 0.24)"
            />
            <polygon
              points={playerConePoints}
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth={0.7}
            />
            <circle
              cx={playerMapPt.mx}
              cy={playerMapPt.my}
              r={2.5}
              fill="#dc2626"
              stroke="#ffffff"
              strokeWidth={0.9}
            />
          </g>
        </svg>

        {/* Fixed-Height Dedicated Booth Preview Area (zero layout shift on hover) */}
        <div
          data-testid="v28-map-booth-preview"
          aria-live="polite"
          style={{
            height: 48,
            minHeight: 48,
            maxHeight: 48,
            marginTop: 6,
            padding: '6px 10px',
            borderRadius: 10,
            border: activePreviewEntry ? '1px solid #0284c7' : '1px solid #e2e8f0',
            background: activePreviewEntry ? '#f0f9ff' : '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 1,
            overflow: 'hidden',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          {activePreviewEntry ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <strong
                  style={{
                    fontSize: 12.5,
                    lineHeight: '16px',
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  #{activePreviewEntry.boothNumber} · {activePreviewEntry.booth.companyName || activePreviewEntry.booth.boothName}
                </strong>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 10.5,
                    lineHeight: '14px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {favoriteSet.has(activePreviewEntry.booth.boothId) && (
                    <span style={{ color: '#e11d48' }}>♥ Đã ghim</span>
                  )}
                  <span
                    style={{
                      color: visitedSet.has(activePreviewEntry.booth.boothId) ? '#0369a1' : '#64748b',
                    }}
                  >
                    {visitedSet.has(activePreviewEntry.booth.boothId) ? '✓ Đã tham quan' : 'Chưa tham quan'}
                  </span>
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  lineHeight: '15px',
                  color: '#475569',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Khu {activePreviewEntry.booth.zoneCode} · Gian #{activePreviewEntry.boothNumber}
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: 11.5,
                lineHeight: '16px',
                color: '#64748b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isMobileUi ? 'Chạm trực tiếp vào ô gian để đi tới ngay' : 'Rê chuột vào gian để xem thông tin'}
            </div>
          )}
        </div>

          {/* UAT Fix 02: Redesigned Dedicated "Chú thích bản đồ" (3-col Desktop / 2-col Mobile, 13-14px, 16px icons) */}
          <div
            data-testid="v28-map-legend"
            style={{
              marginTop: 8,
              padding: isMobileUi ? '10px 10px' : '11px 14px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: isMobileUi ? 12.5 : 13.5,
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: 8,
              }}
            >
              Chú thích bản đồ
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobileUi ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                gap: isMobileUi ? '8px 10px' : '8px 18px',
                fontSize: isMobileUi ? 12.5 : 13.5,
                fontWeight: 600,
                color: '#1e293b',
                alignItems: 'center',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, background: '#0057b8', color: '#fff', fontSize: 11, flexShrink: 0 }}>⛩</span>
                Cổng vào
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 3, background: '#162b4d', border: '1px solid #334155', flexShrink: 0 }} />
                Lối đi
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 16, height: 14, borderRadius: 3, background: 'rgba(15, 23, 42, 0.14)', border: '1.5px solid #475569', flexShrink: 0 }} />
                Khu vực
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, fontSize: 13, color: '#dc2626', flexShrink: 0 }}>🔴▲</span>
                Vị trí &amp; hướng của bạn
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: '#1e293b', border: '1.5px solid #475569', flexShrink: 0 }} />
                Chưa tham quan
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, background: '#38bdf8', border: '1.5px solid #0284c7', color: '#082f49', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>✓</span>
                Đã tham quan
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: '#e11d48', color: '#ffffff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>♥</span>
                Gian yêu thích
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: '#1e293b', border: '2.5px solid #f59e0b', boxSizing: 'border-box', flexShrink: 0 }} />
                Đang chọn
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px dashed #10b981', boxSizing: 'border-box', flexShrink: 0 }} />
                Gian gợi ý
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 18, height: 0, borderTop: '3px dashed #38bdf8', flexShrink: 0 }} />
                Tuyến chỉ đường
              </span>
            </div>
          </div>
        </div>

      {navFeedback && (
        <div
          role="alert"
          style={{
            fontSize: 12.5,
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
      </section>
    </div>
  );
};
