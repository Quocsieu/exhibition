import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  V28BoothPlacementView,
  V28ExhibitionVersionDetail,
  V28Product,
} from '../../services/v28Api';
import type { V28PlayerState } from '../../scene/v28/DynamicExhibitionScene';
import {
  buildNearbyDiscoveryIndex,
  findNearbyBooths,
  NEARBY_MOVE_RECOMPUTE_DELTA_M,
  type NearbyBoothMatch,
} from '../../scene/v28/v28NearbyDiscovery';

/**
 * Phase 8: Tightened live UI notification trigger radius (down from 18.5m -> 11.5m enter,
 * 21.0m -> 13.5m exit) so distant booths never pop up prematurely while browsing the avenue.
 */
export const NEARBY_WIDGET_ENTER_RADIUS_M = 11.5;
export const NEARBY_WIDGET_EXIT_RADIUS_M = 13.5;
export const NEARBY_DISMISS_REOPEN_MOVE_M = 4.0;

export interface NearbyDiscoveryWidgetProps {
  world: V28ExhibitionVersionDetail;
  playerPos: V28PlayerState;
  visitedBoothIds?: ReadonlySet<string>;
  isMobileUi: boolean;
  isMobileLandscape: boolean;
  /** True when user is focused on a booth, viewing 2D map, menu, NPC, or product detail. */
  suppressed: boolean;
  onNavigateToBooth: (booth: V28BoothPlacementView) => void;
  onGuideToBooth?: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
}

function formatPriceBadge(product: V28Product): string | null {
  if (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price <= 0) {
    return null;
  }
  return `${product.price.toLocaleString('vi-VN')} ${product.currency || 'VND'}`;
}

export const NearbyDiscoveryWidget: React.FC<NearbyDiscoveryWidgetProps> = ({
  world,
  playerPos,
  visitedBoothIds,
  isMobileUi,
  isMobileLandscape,
  suppressed,
  onNavigateToBooth,
  onGuideToBooth,
  onSelectProduct,
}) => {
  const index = useMemo(() => buildNearbyDiscoveryIndex(world), [world]);
  const [matches, setMatches] = useState<NearbyBoothMatch[]>([]);
  // H1: Default collapsed on BOTH Desktop and Mobile to maximize 3D viewport
  const [expanded, setExpanded] = useState<boolean>(false);
  const [dismissedState, setDismissedState] = useState<{ key: string; x: number; z: number } | null>(null);

  const lastEvalPosRef = useRef<{ x: number; z: number } | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Re-evaluate nearby booths ONLY when world changes or avatar moves >= 0.45m
  useEffect(() => {
    const prevPos = lastEvalPosRef.current;
    if (
      prevPos &&
      Math.hypot(playerPos.x - prevPos.x, playerPos.z - prevPos.z) < NEARBY_MOVE_RECOMPUTE_DELTA_M
    ) {
      return;
    }

    lastEvalPosRef.current = { x: playerPos.x, z: playerPos.z };
    const next = findNearbyBooths(index, playerPos, {
      enterRadiusM: NEARBY_WIDGET_ENTER_RADIUS_M,
      exitRadiusM: NEARBY_WIDGET_EXIT_RADIUS_M,
      maxResults: 3,
      prevNearbyIds: prevIdsRef.current,
    });
    const nextIdSet = new Set(next.map((m) => m.booth.boothId));
    prevIdsRef.current = nextIdSet;

    setMatches((curr) => {
      if (
        curr.length === next.length &&
        curr.every(
          (item, idx) =>
            item.booth.boothId === next[idx].booth.boothId &&
            Math.abs(item.approachDistanceM - next[idx].approachDistanceM) < 0.4 &&
            item.products.length === next[idx].products.length
        )
      ) {
        return curr;
      }
      return next;
    });
  }, [index, playerPos.x, playerPos.z]);

  // Reset position cache when world version or booth data changes so product/layout updates reflect immediately
  useEffect(() => {
    lastEvalPosRef.current = null;
    const next = findNearbyBooths(index, playerPos, {
      enterRadiusM: NEARBY_WIDGET_ENTER_RADIUS_M,
      exitRadiusM: NEARBY_WIDGET_EXIT_RADIUS_M,
      maxResults: 3,
      prevNearbyIds: prevIdsRef.current,
    });
    prevIdsRef.current = new Set(next.map((m) => m.booth.boothId));
    setMatches(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const currentTopKey = matches.map((m) => m.booth.boothId).join(',');

  // Phase 8: Only clear dismissal when visitor enters a NEW booth cluster AND moved >= 4m away
  useEffect(() => {
    if (!dismissedState) return;
    const movedM = Math.hypot(playerPos.x - dismissedState.x, playerPos.z - dismissedState.z);
    if (currentTopKey && dismissedState.key !== currentTopKey && movedM >= NEARBY_DISMISS_REOPEN_MOVE_M) {
      setDismissedState(null);
    }
  }, [dismissedState, currentTopKey, playerPos.x, playerPos.z]);

  const isDismissed =
    dismissedState !== null &&
    (dismissedState.key === currentTopKey ||
      Math.hypot(playerPos.x - dismissedState.x, playerPos.z - dismissedState.z) < NEARBY_DISMISS_REOPEN_MOVE_M);

  // True dismissal: completely hides the notification until visitor walks to a new booth cluster
  if (suppressed || matches.length === 0 || isDismissed) {
    return null;
  }

  const handleClose = () => {
    setDismissedState({ key: currentTopKey, x: playerPos.x, z: playerPos.z });
    setExpanded(false);
  };

  const closest = matches[0];
  const isClosestVisited = Boolean(visitedBoothIds?.has(closest.booth.boothId));
  const shortTitle = closest.booth.companyName || closest.booth.boothName;
  const bottomOffset = isMobileUi ? 'max(10px, env(safe-area-inset-bottom, 10px))' : 14;
  const leftOffset = isMobileUi ? 'max(10px, env(safe-area-inset-left, 10px))' : 16;

  // =========================================================================
  // H1: UNIFIED COMPACT BOTTOM-LEFT CARD (Collapsed by default on Desktop & Mobile)
  // Shows closest booth + short name + distance + Chỉ đường / Đi tới + Expand.
  // Never renders long product list while collapsed; clears joystick & camera dock.
  // =========================================================================
  if (!expanded) {
    return (
      <aside
        data-testid="v28-nearby-discovery-pill"
        aria-label="Gian hàng gần bạn"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'auto',
          position: 'fixed',
          left: leftOffset,
          bottom: bottomOffset,
          zIndex: 21,
          width: isMobileUi
            ? isMobileLandscape
              ? 'min(260px, 44vw)'
              : 'min(218px, calc(100vw - 182px))'
            : 'min(276px, 30vw)',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 13,
          border: isClosestVisited ? '1px solid rgba(52, 211, 153, 0.55)' : '1px solid rgba(56, 189, 248, 0.36)',
          boxShadow: '0 10px 26px rgba(15, 23, 42, 0.32)',
          padding: isMobileUi ? '7px 8px' : '8px 10px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxSizing: 'border-box',
        }}
      >
        {/* Row 1: Closest booth badge + short name + distance + dismiss */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
            <span
              style={{
                background: isClosestVisited ? '#059669' : '#0284c7',
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 5,
                flexShrink: 0,
              }}
            >
              #{closest.boothNumber}
            </span>
            <span
              title={shortTitle}
              style={{
                fontSize: isMobileUi ? 11.5 : 12.5,
                fontWeight: 700,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: 1,
              }}
            >
              {shortTitle}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', flexShrink: 0 }}>
              ~{Math.round(closest.approachDistanceM)}m
            </span>
          </div>
          <button
            type="button"
            data-testid="v28-nearby-close-btn"
            onClick={handleClose}
            aria-label="Đóng thông báo gian hàng gần bạn"
            title="Ẩn thẻ gian gần bạn"
            style={{
              minWidth: 24,
              minHeight: 24,
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.28)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        {isClosestVisited && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              data-testid="v28-nearby-visited-badge"
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                padding: '1px 7px',
                borderRadius: 999,
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(52, 211, 153, 0.55)',
                color: '#a7f3d0',
              }}
            >
              ✓ Đã xem qua
            </span>
          </div>
        )}

        {/* Row 2: Single Đi tới action (teleports in front of booth without entering focus) + Expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            type="button"
            data-testid={`v28-nearby-compact-go-${closest.boothNumber}`}
            onClick={() => (onGuideToBooth ?? onNavigateToBooth)(closest.booth)}
            title="Nhảy tới trước gian hàng này"
            style={{
              flex: 1,
              minHeight: isMobileUi ? 30 : 28,
              padding: '0 7px',
              borderRadius: 8,
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Đi tới
          </button>
          <button
            type="button"
            data-testid="v28-nearby-expand-btn"
            onClick={() => {
              setDismissedState(null);
              setExpanded(true);
            }}
            aria-label={`Mở rộng xem ${matches.length} gian hàng gần bạn`}
            title={`Xem thêm (${matches.length} gian gần)`}
            style={{
              minHeight: isMobileUi ? 30 : 28,
              padding: '0 7px',
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.34)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {matches.length > 1 ? `+${matches.length - 1} ▴` : '▴'}
          </button>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // EXPANDED PANEL (Bottom-Left on BOTH Desktop & Mobile; max 3 nearby booths)
  // =========================================================================
  return (
    <aside
      data-testid="v28-nearby-discovery-panel"
      aria-label="Khám phá gian hàng và sản phẩm gần bạn"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        pointerEvents: 'auto',
        position: 'fixed',
        left: leftOffset,
        bottom: bottomOffset,
        zIndex: 22,
        width: isMobileUi
          ? isMobileLandscape
            ? 'min(330px, 56vw)'
            : 'min(320px, calc(100vw - 20px))'
          : 'min(324px, 32vw)',
        maxHeight: isMobileUi ? (isMobileLandscape ? '56dvh' : '42dvh') : '44vh',
        overflowY: 'auto',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        border: '1px solid #cbd5e1',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.26)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 13, color: '#0f172a', display: 'block' }}>
            📍 Gian hàng gần bạn ({matches.length})
          </strong>
          <span style={{ fontSize: 10.5, color: '#64748b' }}>
            Tối đa 3 gian hàng gần vị trí của bạn
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            data-testid="v28-nearby-collapse-btn"
            onClick={() => setExpanded(false)}
            aria-label="Thu gọn bảng gian hàng gần bạn"
            title="Thu gọn"
            style={{
              minHeight: 28,
              padding: '0 8px',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#f1f5f9',
              color: '#334155',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Thu gọn ▾
          </button>
          <button
            type="button"
            data-testid="v28-nearby-close-btn"
            onClick={handleClose}
            aria-label="Đóng thông báo gian hàng gần bạn"
            title="Đóng thông báo"
            style={{
              minWidth: 28,
              minHeight: 28,
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {matches.map((match) => (
        <NearbyBoothCard
          key={match.booth.boothId}
          match={match}
          isVisited={Boolean(visitedBoothIds?.has(match.booth.boothId))}
          compact={isMobileUi}
          onNavigate={() => {
            setExpanded(false);
            onNavigateToBooth(match.booth);
          }}
          onGuide={
            onGuideToBooth
              ? () => {
                  setExpanded(false);
                  onGuideToBooth(match.booth);
                }
              : undefined
          }
          onSelectProduct={(prod, slotId) => {
            setExpanded(false);
            onSelectProduct(match.booth, prod, slotId);
          }}
        />
      ))}
    </aside>
  );
};

interface NearbyBoothCardProps {
  match: NearbyBoothMatch;
  isVisited: boolean;
  compact: boolean;
  onNavigate: () => void;
  onGuide?: () => void;
  onSelectProduct: (product: V28Product, slotId: string) => void;
}

const NearbyBoothCard: React.FC<NearbyBoothCardProps> = ({
  match,
  isVisited,
  compact,
  onNavigate,
  onGuide,
  onSelectProduct,
}) => {
  const { booth, boothNumber, approachDistanceM, products } = match;
  const visibleProducts = products.slice(0, 2);

  return (
    <div
      data-testid={`v28-nearby-booth-${boothNumber}`}
      data-booth-id={booth.boothId}
      style={{
        borderRadius: 10,
        border: isVisited ? '1px solid #86efac' : '1px solid #e2e8f0',
        background: isVisited ? '#f0fdf4' : '#f8fafc',
        padding: compact ? 8 : 9,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span
              style={{
                background: isVisited ? '#059669' : '#0f172a',
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: 5,
              }}
            >
              #{boothNumber}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
              Khu {booth.zoneCode}
            </span>
            <span style={{ fontSize: 10.5, color: '#64748b' }}>
              ~{Math.round(approachDistanceM)}m
            </span>
            {isVisited && (
              <span
                data-testid={`v28-nearby-booth-visited-${boothNumber}`}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  color: '#047857',
                }}
              >
                ✓ Đã xem qua
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: '#0f172a',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {booth.companyName || booth.boothName}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            data-testid={`v28-nearby-go-${boothNumber}`}
            onClick={() => (onGuide ?? onNavigate)()}
            title="Nhảy tới trước gian hàng này"
            style={{
              minHeight: compact ? 36 : 32,
              padding: '0 10px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--v28-youth-blue, #0057b8)',
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Đi tới →
          </button>
        </div>
      </div>

      {visibleProducts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleProducts.map((item) => {
            const priceLabel = formatPriceBadge(item.product);
            return (
              <button
                key={`${item.boothId}:${item.slotId}`}
                type="button"
                data-testid={`v28-nearby-product-${boothNumber}-${item.slotId}`}
                onClick={() => onSelectProduct(item.product, item.slotId)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 7px',
                  borderRadius: 7,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: '#1e293b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  📦 {item.product.name}
                </span>
                {priceLabel && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#047857',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {priceLabel}
                  </span>
                )}
              </button>
            );
          })}
          {products.length > visibleProducts.length && (
            <span style={{ fontSize: 10.5, color: '#64748b', paddingLeft: 2 }}>
              +{products.length - visibleProducts.length} sản phẩm khác tại gian này
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
          Chưa gắn sản phẩm trưng bày
        </div>
      )}
    </div>
  );
};
