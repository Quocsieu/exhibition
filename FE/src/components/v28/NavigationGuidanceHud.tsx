import React from 'react';
import type { V28BoothPlacementView } from '../../services/v28Api';
import type {
  DirectionIndicator,
  GuidedRouteResult,
  ZoneGuidanceState,
} from '../../services/v28NavigationEngine';
import { V28SvgIcon } from './V28SvgIcon';

export interface NavigationGuidanceHudProps {
  isMobileUi: boolean;
  suppressed: boolean;
  guidedRoute: GuidedRouteResult | null;
  activeRouteIndicator: DirectionIndicator | null;
  suggestedIndicators: DirectionIndicator[];
  zoneGuidance: ZoneGuidanceState;
  zoneToastText: string | null;
  onSelectGuideBooth: (booth: V28BoothPlacementView) => void;
  onTeleportToBooth: (booth: V28BoothPlacementView) => void;
  onCancelGuide: () => void;
}

/**
 * Compact 3D Navigation Compass, Multi-Booth Directional Arrows (max 3),
 * Real-Data Zone Junction Signpost, and Non-Spamming Zone Entry Toast (Phase 2.3 & 2.4).
 */
export const NavigationGuidanceHud: React.FC<NavigationGuidanceHudProps> = ({
  isMobileUi,
  suppressed,
  guidedRoute,
  activeRouteIndicator,
  suggestedIndicators: _suggestedIndicators,
  zoneGuidance: _zoneGuidance,
  zoneToastText,
  onSelectGuideBooth: _onSelectGuideBooth,
  onTeleportToBooth,
  onCancelGuide,
}) => {
  // UAT Fix 01: Idle booth directional chips & zone signpost moved into 3D world space around avatar feet
  // (`CharacterNavigationRing3D.tsx`). This HUD renders ONLY the active guided route banner & transient zone entry toast.
  if (suppressed || (!guidedRoute && !zoneToastText)) return null;

  return (
    <div
      data-testid="v28-navigation-guidance-hud"
      style={{
        pointerEvents: 'none',
        position: 'fixed',
        top: isMobileUi ? 10 : 14,
        left: isMobileUi ? 10 : '50%',
        transform: isMobileUi ? 'none' : 'translateX(-50%)',
        zIndex: 23,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMobileUi ? 'flex-start' : 'center',
        gap: 6,
        width: isMobileUi ? 'calc(100vw - 180px)' : 'auto',
        maxWidth: isMobileUi ? 320 : 540,
      }}
    >
      {/* Active Guided Route Banner */}
      {guidedRoute && activeRouteIndicator && (
        <div
          data-testid="v28-active-route-banner"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 12,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(56, 189, 248, 0.55)',
            color: '#f8fafc',
            boxShadow: '0 8px 22px rgba(15, 23, 42, 0.28)',
            fontSize: 12.5,
            maxWidth: '100%',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#0ea5e9',
              color: '#fff',
              fontWeight: 900,
              fontSize: 14,
              transform: `rotate(${Math.round((activeRouteIndicator.relativeAngleRad * 180) / Math.PI)}deg)`,
              transition: 'transform 120ms linear',
              flexShrink: 0,
            }}
          >
            ↑
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <V28SvgIcon name="compass" size={14} style={{ color: '#38bdf8' }} />
              <span>Dẫn đường: {activeRouteIndicator.boothLabel} · {activeRouteIndicator.boothName}</span>
            </div>
            <div style={{ fontSize: 11, color: '#bae6fd' }}>
              Còn {Math.round(guidedRoute.totalDistanceM)}m · Đi theo mũi tên xanh trên sàn
              {activeRouteIndicator.isOffScreen
                ? activeRouteIndicator.sector === 'left'
                  ? ' (Xoay trái)'
                  : activeRouteIndicator.sector === 'right'
                    ? ' (Xoay phải)'
                    : ' (Phía sau)'
                : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTeleportToBooth(guidedRoute.targetBooth)}
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              border: '1px solid rgba(251, 191, 36, 0.55)',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fde68a',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Vào ngay
          </button>
          <button
            type="button"
            data-testid="v28-cancel-route-btn"
            onClick={onCancelGuide}
            aria-label="Hủy dẫn đường"
            style={{
              minWidth: 26,
              minHeight: 26,
              borderRadius: 7,
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Non-spamming Zone Entry Toast */}
      {zoneToastText && (
        <div
          role="status"
          aria-live="polite"
          data-testid="v28-zone-entry-toast"
          style={{
            padding: '5px 12px',
            borderRadius: 999,
            background: 'rgba(2, 132, 199, 0.92)',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 6px 18px rgba(2, 132, 199, 0.35)',
          }}
        >
          📍 {zoneToastText}
        </div>
      )}
    </div>
  );
};
