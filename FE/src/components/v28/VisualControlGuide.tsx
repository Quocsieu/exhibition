import React, { useEffect, useState } from 'react';
import controlDesktopSvg from '../../assets/guides/v28/control-desktop.svg';
import controlMobilePortraitSvg from '../../assets/guides/v28/control-mobile-portrait.svg';
import controlMobileLandscapeSvg from '../../assets/guides/v28/control-mobile-landscape.svg';
import { V28SvgIcon } from './V28SvgIcon';

export type ControlGuideLayoutMode = 'desktop' | 'mobile-portrait' | 'mobile-landscape';

export function resolveControlGuideMode(opts: {
  isMobileUi: boolean;
  isMobileLandscape: boolean;
}): ControlGuideLayoutMode {
  if (!opts.isMobileUi) return 'desktop';
  return opts.isMobileLandscape ? 'mobile-landscape' : 'mobile-portrait';
}

export const CONTROL_GUIDE_SPECS: Record<
  ControlGuideLayoutMode,
  {
    tabLabel: string;
    svgUrl: string;
    alt: string;
    summary: string;
  }
> = {
  desktop: {
    tabLabel: 'Máy tính',
    svgUrl: controlDesktopSvg,
    alt: 'Hướng dẫn điều khiển máy tính: phím WASD hoặc mũi tên di chuyển, nhấp sàn đi tới, kéo chuột xoay góc nhìn, cuộn giữa phóng to thu nhỏ',
    summary: 'WASD / Nhấp sàn để di chuyển · Kéo chuột xoay góc nhìn · Cuộn để thu phóng',
  },
  'mobile-portrait': {
    tabLabel: 'Dọc',
    svgUrl: controlMobilePortraitSvg,
    alt: 'Hướng dẫn điều khiển điện thoại dọc: kéo nửa dưới di chuyển bằng joystick 360 độ, vuốt nửa trên xoay camera',
    summary: 'Kéo nửa dưới di chuyển · Vuốt nửa trên xoay camera · Chạm nhanh chọn gian',
  },
  'mobile-landscape': {
    tabLabel: 'Ngang',
    svgUrl: controlMobileLandscapeSvg,
    alt: 'Hướng dẫn điều khiển điện thoại ngang: kéo nửa trái di chuyển, vuốt nửa phải xoay góc nhìn',
    summary: 'Kéo nửa trái di chuyển · Vuốt nửa phải xoay camera · Hỗ trợ 2 ngón đồng thời',
  },
};

export interface VisualControlGuideProps {
  defaultMode: ControlGuideLayoutMode;
  compact?: boolean;
}

export const VisualControlGuideContent: React.FC<VisualControlGuideProps> = ({
  defaultMode,
  compact = false,
}) => {
  const [activeMode, setActiveMode] = useState<ControlGuideLayoutMode>(defaultMode);

  useEffect(() => {
    setActiveMode(defaultMode);
  }, [defaultMode]);

  const spec = CONTROL_GUIDE_SPECS[activeMode];

  return (
    <div
      data-testid="v28-visual-control-guide"
      data-guide-mode={activeMode}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 12,
      }}
    >
      <div
        role="tablist"
        aria-label="Chọn chế độ thiết bị hướng dẫn điều khiển"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
        }}
      >
        {(['desktop', 'mobile-portrait', 'mobile-landscape'] as const).map((mode) => {
          const isSelected = activeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveMode(mode)}
              style={{
                minHeight: compact ? 32 : 36,
                padding: '4px 8px',
                borderRadius: 8,
                border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.25)',
                background: isSelected ? 'rgba(14, 165, 233, 0.26)' : 'rgba(255, 255, 255, 0.05)',
                color: isSelected ? '#e0f2fe' : '#cbd5e1',
                fontSize: compact ? 11.5 : 12.5,
                fontWeight: isSelected ? 700 : 600,
                cursor: 'pointer',
              }}
            >
              {CONTROL_GUIDE_SPECS[mode].tabLabel}
            </button>
          );
        })}
      </div>

      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0f172a',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={spec.svgUrl}
          alt={spec.alt}
          draggable={false}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: compact ? 195 : 260,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>

      <p
        style={{
          margin: 0,
          fontSize: compact ? 11.5 : 12.5,
          color: '#cbd5e1',
          textAlign: 'center',
          lineHeight: 1.45,
        }}
      >
        {spec.summary}
      </p>
    </div>
  );
};

export interface VisualControlGuideModalProps {
  open: boolean;
  defaultMode: ControlGuideLayoutMode;
  onClose: () => void;
}

export const VisualControlGuideModal: React.FC<VisualControlGuideModalProps> = ({
  open,
  defaultMode,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="v28-control-guide-title"
      data-testid="v28-control-guide-modal"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        pointerEvents: 'auto',
        background: 'rgba(2, 6, 23, 0.62)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(580px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.96)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 24px 56px rgba(2, 6, 23, 0.55)',
          padding: 16,
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2
            id="v28-control-guide-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <V28SvgIcon name="gamepad" size={18} style={{ color: '#38bdf8' }} />
            Hướng dẫn điều khiển 3D
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hướng dẫn điều khiển"
            style={{
              minWidth: 34,
              minHeight: 34,
              borderRadius: 9,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <V28SvgIcon name="close" size={15} />
          </button>
        </div>

        <VisualControlGuideContent defaultMode={defaultMode} />
      </div>
    </div>
  );
};
