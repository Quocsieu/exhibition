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
  isMobileUi,
  isMobileLandscape,
  suppressed,
  onNavigateToBooth,
  onGuideToBooth,
  onSelectProduct,
}) => {
  const index = useMemo(() => buildNearbyDiscoveryIndex(world), [world]);
  const [matches, setMatches] = useState<NearbyBoothMatch[]>([]);
  // Desktop starts open (compact corner card); Mobile starts collapsed as a single slim pill
  const [expanded, setExpanded] = useState<boolean>(() => !isMobileUi);
  const [dismissedState, setDismissedState] = useState<{ key: string; x: number; z: number } | null>(null);

  const lastEvalPosRef = useRef<{ x: number; z: number } | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Reset mobile expansion state if switching between desktop and mobile breakpoints
  useEffect(() => {
    setExpanded(!isMobileUi);
  }, [isMobileUi]);

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

  // =========================================================================
  // MOBILE PORTRAIT & LANDSCAPE: Slim non-intrusive pill below top bar
  // Never overlaps bottom joystick, right camera swipe zone, or bottom-right dock.
  // =========================================================================
  if (isMobileUi) {
    const mobileTop = 'max(64px, calc(env(safe-area-inset-top, 8px) + 56px))';
    if (!expanded) {
      return (
        <div
          data-testid="v28-nearby-discovery-pill"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            position: 'fixed',
            top: mobileTop,
            left: 10,
            zIndex: 21,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: isMobileLandscape ? '62vw' : 'calc(100vw - 20px)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setDismissedState(null);
              setExpanded(true);
            }}
            aria-label={`Xem ${matches.length} gian hàng gần bạn`}
            style={{
              minHeight: 40,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(15, 23, 42, 0.86)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.25)',
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          >
            <span style={{ flexShrink: 0 }}>📍</span>
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Gần bạn: #{closest.boothNumber} {closest.booth.companyName || closest.booth.boothName}
            </span>
            <span style={{ color: '#38bdf8', flexShrink: 0 }}>
              ~{Math.round(closest.approachDistanceM)}m
            </span>
            {matches.length > 1 && (
              <span
                style={{
                  background: 'var(--v28-youth-blue, #0057b8)',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '1px 6px',
                  fontSize: 10.5,
                  flexShrink: 0,
                }}
              >
                +{matches.length - 1}
              </span>
            )}
          </button>
        </div>
      );
    }

    return (
      <section
        data-testid="v28-nearby-discovery-panel"
        aria-label="Gian hàng và sản phẩm gần bạn"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'auto',
          position: 'fixed',
          top: mobileTop,
          left: 10,
          zIndex: 21,
          width: isMobileLandscape ? 'min(360px, 66vw)' : 'min(350px, calc(100vw - 20px))',
          maxHeight: isMobileLandscape ? '56dvh' : '44dvh',
          overflowY: 'auto',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: '1px solid #cbd5e1',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.26)',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 13, color: '#0f172a' }}>
            📍 Gian hàng gần bạn ({matches.length})
          </strong>
          <button
            type="button"
            data-testid="v28-nearby-close-btn"
            onClick={handleClose}
            aria-label="Đóng thông báo gian hàng gần bạn"
            style={{
              minWidth: 36,
              minHeight: 36,
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        {matches.map((match) => (
          <NearbyBoothCard
            key={match.booth.boothId}
            match={match}
            compact
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
      </section>
    );
  }

  // =========================================================================
  // DESKTOP: Compact bottom-left floating card (never blocks center 3D or bottom-right dock)
  // =========================================================================
  if (!expanded) {
    return (
      <div
        data-testid="v28-nearby-discovery-pill"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'auto',
          position: 'fixed',
          left: 18,
          bottom: 14,
          zIndex: 21,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setDismissedState(null);
            setExpanded(true);
          }}
          aria-label={`Mở danh sách ${matches.length} gian hàng gần bạn`}
          style={{
            height: 40,
            padding: '0 14px',
            borderRadius: 999,
            border: '1px solid rgba(56, 189, 248, 0.45)',
            background: 'rgba(15, 23, 42, 0.86)',
            backdropFilter: 'blur(10px)',
            color: '#f8fafc',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 22px rgba(15, 23, 42, 0.28)',
          }}
        >
          📍 Gần bạn ({matches.length}) · #{closest.boothNumber} ~{Math.round(closest.approachDistanceM)}m
        </button>
      </div>
    );
  }

  return (
    <aside
      data-testid="v28-nearby-discovery-panel"
      aria-label="Khám phá gian hàng và sản phẩm gần bạn"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        pointerEvents: 'auto',
        position: 'fixed',
        left: 18,
        bottom: 14,
        zIndex: 21,
        width: 'min(330px, 34vw)',
        maxHeight: '42vh',
        overflowY: 'auto',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        border: '1px solid #cbd5e1',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.24)',
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
            Khoảng cách ước tính tới mặt tiền gian hàng
          </span>
        </div>
        <button
          type="button"
          data-testid="v28-nearby-close-btn"
          onClick={handleClose}
          aria-label="Đóng thông báo gian hàng gần bạn"
          title="Đóng thông báo"
          style={{
            minWidth: 30,
            minHeight: 30,
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            fontWeight: 800,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {matches.map((match) => (
        <NearbyBoothCard
          key={match.booth.boothId}
          match={match}
          compact={false}
          onNavigate={() => onNavigateToBooth(match.booth)}
          onGuide={onGuideToBooth ? () => onGuideToBooth(match.booth) : undefined}
          onSelectProduct={(prod, slotId) => onSelectProduct(match.booth, prod, slotId)}
        />
      ))}
    </aside>
  );
};

interface NearbyBoothCardProps {
  match: NearbyBoothMatch;
  compact: boolean;
  onNavigate: () => void;
  onGuide?: () => void;
  onSelectProduct: (product: V28Product, slotId: string) => void;
}

const NearbyBoothCard: React.FC<NearbyBoothCardProps> = ({
  match,
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
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
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
                background: '#0f172a',
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
          {onGuide && (
            <button
              type="button"
              data-testid={`v28-nearby-guide-${boothNumber}`}
              onClick={onGuide}
              title="Dẫn đường 3D tới gian hàng này"
              style={{
                minHeight: compact ? 36 : 32,
                padding: '0 8px',
                borderRadius: 8,
                border: '1px solid #0284c7',
                background: '#e0f2fe',
                color: '#0369a1',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🧭 Chỉ đường
            </button>
          )}
          <button
            type="button"
            data-testid={`v28-nearby-go-${boothNumber}`}
            onClick={onNavigate}
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
