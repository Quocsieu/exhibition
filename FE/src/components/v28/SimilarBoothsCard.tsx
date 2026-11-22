import React from 'react';
import type { V28BoothPlacementView } from '../../services/v28Api';
import type { SimilarBoothSuggestion } from '../../services/similarBooths';

export interface SimilarBoothsCardProps {
  suggestions: SimilarBoothSuggestion[];
  isMobileUi: boolean;
  onNavigateToBooth: (booth: V28BoothPlacementView) => void;
  onGuideToBooth?: (booth: V28BoothPlacementView) => void;
  onDismiss: () => void;
}

/**
 * Compact, non-obstructive similar-booth recommendation card (Phase 1.5).
 * Only shown after NPC consultation completes when genuine matching booths exist.
 */
export const SimilarBoothsCard: React.FC<SimilarBoothsCardProps> = ({
  suggestions,
  isMobileUi,
  onNavigateToBooth,
  onGuideToBooth,
  onDismiss,
}) => {
  if (!suggestions.length) return null;

  return (
    <aside
      data-testid="v28-similar-booths-card"
      aria-label="Gợi ý gian hàng tương tự"
      style={{
        pointerEvents: 'auto',
        marginRight: isMobileUi ? 0 : 'auto',
        width: isMobileUi ? '100%' : 320,
        maxWidth: '100%',
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: '#f8fafc',
        borderRadius: 14,
        padding: '10px 12px',
        border: '1px solid rgba(148, 163, 184, 0.28)',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.32)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fde68a' }}>
          ✨ Gian hàng tương tự gợi ý
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng gợi ý gian hàng tương tự"
          style={{
            minWidth: 28,
            minHeight: 28,
            borderRadius: 8,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map(({ booth, matchReason, productGroupLabel }) => (
          <div
            key={booth.boothId}
            data-testid={`v28-similar-booth-${booth.slotIndex + 1}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '7px 9px',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {booth.zoneCode}#{booth.slotIndex + 1} · {booth.boothName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#cbd5e1',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {productGroupLabel} · {matchReason}
                {booth.assignedSlotCount > 0 ? ` · ${booth.assignedSlotCount} SP` : ''}
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {onGuideToBooth && (
                <button
                  type="button"
                  onClick={() => onGuideToBooth(booth)}
                  title="Chỉ đường bằng mũi tên 3D"
                  style={{
                    minHeight: 30,
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    background: 'rgba(14, 165, 233, 0.2)',
                    color: '#bae6fd',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🧭 Dẫn đường
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateToBooth(booth)}
                style={{
                  minHeight: 30,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#0ea5e9',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Đi tới →
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
