import React, { useMemo } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28RectBounds,
  V28ZoneRecord,
} from '../../services/v28Api';
import type { V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import type { GuidedRouteResult } from '../../services/v28NavigationEngine';
import {
  getBoothMapFootprint,
  worldBoundsToLandscapeRect,
  worldFootprintToLandscapeRect,
  worldHeadingToLandscapeDir,
  worldToLandscapeMapPoint,
} from './InteractiveMap2D';

export type MinimapBoothStatus = 'visited' | 'populated' | 'empty';

export interface MinimapViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
  viewBoxStr: string;
}

/**
 * Pure helper: computes padded landscape SVG viewBox directly from real `world.hallBounds`.
 */
export function computeMinimapViewBox(hallBounds: V28RectBounds, pad = 10): MinimapViewBox {
  const rect = worldBoundsToLandscapeRect(hallBounds);
  const minX = Math.round((rect.x - pad) * 10) / 10;
  const minY = Math.round((rect.y - pad) * 10) / 10;
  const width = Math.max(20, Math.round((rect.width + pad * 2) * 10) / 10);
  const height = Math.max(20, Math.round((rect.height + pad * 2) * 10) / 10);
  return {
    minX,
    minY,
    width,
    height,
    viewBoxStr: `${minX} ${minY} ${width} ${height}`,
  };
}

/**
 * Pure helper: classifies a booth's visual state on the Minimap strictly from real data.
 */
export function classifyMinimapBoothStatus(
  booth: Pick<V28BoothPlacementView, 'boothId' | 'assignedSlotCount'>,
  visitedBoothIds?: ReadonlySet<string>
): MinimapBoothStatus {
  if (visitedBoothIds?.has(booth.boothId)) return 'visited';
  if ((booth.assignedSlotCount ?? 0) > 0) return 'populated';
  return 'empty';
}

export function getMinimapBoothFill(status: MinimapBoothStatus): string {
  if (status === 'visited') return '#38bdf8';
  if (status === 'populated') return '#10b981';
  return '#475569';
}

interface StaticFloorplanProps {
  hallBounds: V28RectBounds;
  centralAvenueBounds?: V28RectBounds;
  zones: V28ZoneRecord[];
  booths: V28BoothPlacementView[];
  visitedBoothIds?: ReadonlySet<string>;
  visitedCount: number;
}

/**
 * Memoized static SVG floorplan layer: renders hall, central avenue, zones, and all booths
 * ONLY when world layout or visited booth count changes — ZERO re-renders on avatar movement!
 */
const MinimapStaticFloorplan: React.FC<StaticFloorplanProps> = React.memo(
  ({ hallBounds, centralAvenueBounds, zones, booths, visitedBoothIds }) => {
    const hallRect = useMemo(() => worldBoundsToLandscapeRect(hallBounds), [hallBounds]);
    const avenueRect = useMemo(
      () => (centralAvenueBounds ? worldBoundsToLandscapeRect(centralAvenueBounds) : null),
      [centralAvenueBounds]
    );

    const zoneRects = useMemo(
      () =>
        zones
          .filter((z) => Boolean(z.bounds))
          .map((z) => ({
            id: z.id,
            code: z.code,
            rect: worldBoundsToLandscapeRect(z.bounds),
          })),
      [zones]
    );

    const boothRects = useMemo(
      () =>
        booths.map((b) => {
          const fp = worldFootprintToLandscapeRect(getBoothMapFootprint(b));
          const status = classifyMinimapBoothStatus(b, visitedBoothIds);
          return {
            id: b.boothId,
            x: fp.x,
            y: fp.y,
            w: Math.max(2.6, fp.width),
            h: Math.max(2.6, fp.height),
            fill: getMinimapBoothFill(status),
            stroke: status === 'visited' ? '#e0f2fe' : 'rgba(15, 23, 42, 0.55)',
          };
        }),
      [booths, visitedBoothIds]
    );

    return (
      <g data-layer="minimap-static-floorplan">
        {/* Hall footprint */}
        <rect
          x={hallRect.x}
          y={hallRect.y}
          width={hallRect.width}
          height={hallRect.height}
          rx={6}
          fill="#0f172a"
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth={1.6}
        />

        {/* Central Avenue main walkway */}
        {avenueRect && (
          <rect
            x={avenueRect.x}
            y={avenueRect.y}
            width={avenueRect.width}
            height={avenueRect.height}
            fill="rgba(56, 189, 248, 0.14)"
          />
        )}

        {/* Zones */}
        {zoneRects.map((z) => (
          <g key={z.id}>
            <rect
              x={z.rect.x}
              y={z.rect.y}
              width={z.rect.width}
              height={z.rect.height}
              rx={3}
              fill="rgba(30, 41, 59, 0.62)"
              stroke="rgba(148, 163, 184, 0.22)"
              strokeWidth={0.9}
            />
            <text
              x={z.rect.cx}
              y={z.rect.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(203, 213, 225, 0.42)"
              fontSize={Math.max(8, Math.min(13, Math.min(z.rect.width, z.rect.height) * 0.36))}
              fontWeight={800}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {z.code}
            </text>
          </g>
        ))}

        {/* Booths */}
        {boothRects.map((b) => (
          <rect
            key={b.id}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={0.9}
            fill={b.fill}
            stroke={b.stroke}
            strokeWidth={0.55}
          />
        ))}
      </g>
    );
  },
  (prev, next) =>
    prev.hallBounds === next.hallBounds &&
    prev.centralAvenueBounds === next.centralAvenueBounds &&
    prev.zones === next.zones &&
    prev.booths === next.booths &&
    prev.visitedCount === next.visitedCount
);

MinimapStaticFloorplan.displayName = 'MinimapStaticFloorplan';

export interface WorldMinimapTopRightProps {
  world: V28ExhibitionVersionDetail;
  playerPos: V28PlayerState;
  visitedBoothIds?: ReadonlySet<string>;
  guidedRoute?: Pick<GuidedRouteResult, 'waypoints'> | null;
  isMobileUi: boolean;
  highlight?: boolean;
  onOpenFullMap: () => void;
}

/**
 * H2: Lightweight 2D SVG Interactive Minimap anchored strictly at Top-Right.
 * - Zero second WebGL Canvas (preserves 3D scene GPU budget).
 * - Static floorplan memoized separately from dynamic avatar marker & route.
 * - Clicking/tapping opens `InteractiveMap2D` without moving the avatar.
 */
export const WorldMinimapTopRight: React.FC<WorldMinimapTopRightProps> = React.memo(
  ({ world, playerPos, visitedBoothIds, guidedRoute, isMobileUi, highlight = false, onOpenFullMap }) => {
    const viewBox = useMemo(() => computeMinimapViewBox(world.hallBounds, 8), [world.hallBounds]);
    const visitedCount = visitedBoothIds?.size ?? 0;

    // Dynamic avatar coordinates & heading angle in landscape SVG space
    const avatarPt = worldToLandscapeMapPoint(playerPos.x, playerPos.z);
    const heading = worldHeadingToLandscapeDir(playerPos.rotationY);
    const headingDeg = (Math.atan2(heading.dy, heading.dx) * 180) / Math.PI;
    const markerScale = Math.max(4.5, Math.min(9.5, Math.min(viewBox.width, viewBox.height) * 0.045));

    // Active guided route polyline (if any)
    const routePointsStr = useMemo(() => {
      if (!guidedRoute || guidedRoute.waypoints.length < 2) return '';
      return guidedRoute.waypoints
        .map((pt) => {
          const p = worldToLandscapeMapPoint(pt.x, pt.z);
          return `${p.mx.toFixed(1)},${p.my.toFixed(1)}`;
        })
        .join(' ');
    }, [guidedRoute]);

    const routeDestPt = useMemo(() => {
      if (!guidedRoute || guidedRoute.waypoints.length < 1) return null;
      const last = guidedRoute.waypoints[guidedRoute.waypoints.length - 1];
      return worldToLandscapeMapPoint(last.x, last.z);
    }, [guidedRoute]);

    const widthPx = isMobileUi ? 120 : 176;
    const heightPx = isMobileUi ? 84 : 124;

    return (
      <button
        type="button"
        data-testid="v28-world-minimap"
        data-onboarding-highlight={highlight ? 'true' : undefined}
        aria-label="Mở bản đồ 2D triển lãm"
        title="Bấm để mở bản đồ 2D lớn và tìm gian hàng"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpenFullMap();
        }}
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          width: widthPx,
          height: heightPx,
          padding: 4,
          borderRadius: isMobileUi ? 12 : 14,
          border: highlight ? '2px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.38)',
          background: 'rgba(15, 23, 42, 0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: highlight
            ? '0 0 0 4px rgba(56, 189, 248, 0.36), 0 10px 26px rgba(15, 23, 42, 0.38)'
            : '0 10px 26px rgba(15, 23, 42, 0.34)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <svg
          viewBox={viewBox.viewBoxStr}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            borderRadius: isMobileUi ? 8 : 10,
            background: '#0b1220',
          }}
        >
          <MinimapStaticFloorplan
            hallBounds={world.hallBounds}
            centralAvenueBounds={world.centralAvenueBounds}
            zones={world.zones}
            booths={world.booths}
            visitedBoothIds={visitedBoothIds}
            visitedCount={visitedCount}
          />

          {/* Active guided route */}
          {routePointsStr && (
            <g data-layer="minimap-active-route">
              <polyline
                points={routePointsStr}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={Math.max(2.2, markerScale * 0.42)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 3"
              />
              {routeDestPt && (
                <circle
                  cx={routeDestPt.mx}
                  cy={routeDestPt.my}
                  r={markerScale * 0.72}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={1.2}
                />
              )}
            </g>
          )}

          {/* Dynamic Avatar Position + Heading Arrow */}
          <g
            data-layer="minimap-avatar"
            transform={`translate(${avatarPt.mx.toFixed(1)}, ${avatarPt.my.toFixed(1)}) rotate(${headingDeg.toFixed(1)})`}
          >
            <circle r={markerScale * 1.35} fill="rgba(56, 189, 248, 0.28)" />
            <polygon
              points={`${markerScale * 1.45},0 ${-markerScale * 0.85},${-markerScale * 0.85} ${-markerScale * 0.45},0 ${-markerScale * 0.85},${markerScale * 0.85}`}
              fill="#f43f5e"
              stroke="#ffffff"
              strokeWidth={Math.max(0.9, markerScale * 0.2)}
              strokeLinejoin="round"
            />
          </g>
        </svg>

        {/* Compact corner overlay badge */}
        <span
          style={{
            position: 'absolute',
            left: 7,
            bottom: 6,
            padding: '1px 5px',
            borderRadius: 5,
            background: 'rgba(15, 23, 42, 0.82)',
            color: '#e2e8f0',
            fontSize: isMobileUi ? 9 : 10,
            fontWeight: 700,
            letterSpacing: '0.01em',
            pointerEvents: 'none',
          }}
        >
          {isMobileUi ? '2D ↗' : `Bản đồ · ${Math.min(world.booths.length, visitedCount)}/${world.booths.length}`}
        </span>
      </button>
    );
  }
);

WorldMinimapTopRight.displayName = 'WorldMinimapTopRight';
