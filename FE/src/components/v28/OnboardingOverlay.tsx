import React, { useEffect, useRef, useState } from 'react';
import {
  ONBOARDING_MOVE_THRESHOLD_METERS,
  ONBOARDING_ROTATE_THRESHOLD_RAD,
  type V28OnboardingState,
  type V28OnboardingStep,
} from '../../services/v28OnboardingStateMachine';
import { piperBrowserTts } from '../../services/hybridTtsAdapter';
import { V28SvgIcon, type V28IconName } from './V28SvgIcon';

export interface OnboardingOverlayProps {
  state: V28OnboardingState;
  visible: boolean;
  isMobileUi: boolean;
  isMobileLandscape: boolean;
  isNpcConsultActive?: boolean;
  onStart: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onReplay: () => void;
}

const STEP_ORDER: readonly V28OnboardingStep[] = [
  'welcome',
  'move',
  'rotate',
  'explore_booth',
  'complete',
];

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  state,
  visible,
  isMobileUi,
  isMobileLandscape,
  isNpcConsultActive = false,
  onStart,
  onSkip,
  onComplete,
  onReplay,
}) => {
  // Opt-in voice guide (default OFF — NEVER autoplays before explicit user interaction!)
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopGuideVoice = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    } catch {
      // ignore cleanup errors
    }
  };

  // Stop & yield immediately if booth NPC consultation becomes active or overlay hides
  useEffect(() => {
    if (isNpcConsultActive || !visible || state.status !== 'in_progress' || !voiceEnabled) {
      stopGuideVoice();
    }
    return () => stopGuideVoice();
  }, [isNpcConsultActive, visible, state.status, voiceEnabled]);

  const stepIndex = Math.max(0, STEP_ORDER.indexOf(state.step));
  const stepNumber = stepIndex + 1;

  let iconName: V28IconName = 'gamepad';
  let title = '';
  let body = '';
  let progressRatio: number | null = null;

  if (state.step === 'welcome') {
    iconName = 'compass';
    title = 'Chào mừng đến GRAND EXPO!';
    body = 'Chào mừng đến GRAND EXPO! Cùng khám phá nhé.';
  } else if (state.step === 'move') {
    iconName = isMobileUi ? 'joystick' : 'walk';
    title = 'Bước 2 · Di chuyển';
    body = isMobileUi
      ? isMobileLandscape
        ? 'Kéo nửa trái màn hình để di chuyển nhân vật.'
        : 'Kéo nửa dưới màn hình để di chuyển nhân vật.'
      : 'Nhấn phím WASD, mũi tên hoặc nhấp vào sàn để bước đi.';
    progressRatio = Math.min(1, state.moveDistanceMeters / ONBOARDING_MOVE_THRESHOLD_METERS);
  } else if (state.step === 'rotate') {
    iconName = 'camera';
    title = 'Bước 3 · Xoay góc nhìn';
    body = isMobileUi
      ? isMobileLandscape
        ? 'Vuốt nửa phải màn hình để xoay góc nhìn 3D.'
        : 'Vuốt nửa trên màn hình để xoay góc nhìn 3D.'
      : 'Giữ và kéo chuột trên màn hình để xoay góc nhìn 3D.';
    progressRatio = Math.min(1, state.rotateDeltaRad / ONBOARDING_ROTATE_THRESHOLD_RAD);
  } else if (state.step === 'explore_booth') {
    iconName = 'map';
    title = 'Bước 4 · Khám phá gian hàng';
    body = isMobileUi
      ? 'Chạm vào bản đồ thu nhỏ ở góc trên phải hoặc chạm trực tiếp vào một gian hàng.'
      : 'Bấm vào bản đồ thu nhỏ ở góc trên phải hoặc nhấp vào một gian hàng để tham quan.';
  } else {
    iconName = 'gift';
    title = 'Hoàn thành hướng dẫn';
    body = 'Bạn đã sẵn sàng khám phá triển lãm!';
  }

  // Speak current step text ONLY when user explicitly opted in and no booth NPC is speaking
  useEffect(() => {
    if (!voiceEnabled || !visible || state.status !== 'in_progress' || isNpcConsultActive || !body) {
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    stopGuideVoice();
    void (async () => {
      try {
        const res = await piperBrowserTts.synthesizeNormalizedChunk({
          normalizedText: body,
          priority: 'low',
          signal: ac.signal,
        });
        if (cancelled || !res?.blob) return;
        const url = URL.createObjectURL(res.blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        await audio.play().catch(() => {});
      } catch {
        // TTS failure must NEVER stall onboarding
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
      stopGuideVoice();
    };
  }, [voiceEnabled, visible, state.status, state.step, isNpcConsultActive, body]);

  if (!visible || state.status !== 'in_progress') return null;

  // Placement:
  // - Desktop: compact bottom-left card (clear of top header, center 3D scene, and bottom-right camera dock)
  // - Mobile Portrait: compact strip near top-center below header (clear of bottom joystick & bottom-right dock)
  // - Mobile Landscape: compact card at top-left below header (clear of left joystick & right camera swipe)
  const containerStyle: React.CSSProperties = isMobileUi
    ? {
        position: 'fixed',
        top: isMobileLandscape ? 10 : 104,
        left: isMobileLandscape ? 10 : '50%',
        transform: isMobileLandscape ? 'none' : 'translateX(-50%)',
        width: isMobileLandscape ? 'min(276px, 46vw)' : 'min(340px, calc(100vw - 24px))',
        zIndex: 35,
        pointerEvents: 'auto',
      }
    : {
        position: 'fixed',
        bottom: 18,
        left: 18,
        width: 320,
        zIndex: 35,
        pointerEvents: 'auto',
      };

  return (
    <aside
      role="region"
      aria-label="Hướng dẫn tương tác GRAND EXPO"
      data-testid="v28-onboarding-overlay"
      data-onboarding-step={state.step}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...containerStyle,
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(56, 189, 248, 0.42)',
        borderRadius: 14,
        boxShadow: '0 14px 36px rgba(2, 6, 23, 0.42)',
        padding: isMobileLandscape ? '10px 12px' : '12px 14px',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'rgba(14, 165, 233, 0.22)',
              color: '#38bdf8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <V28SvgIcon name={iconName} size={15} />
          </span>
          <strong style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </strong>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            data-testid="v28-onboarding-voice-toggle"
            onClick={() => setVoiceEnabled((v) => !v)}
            aria-pressed={voiceEnabled}
            aria-label={voiceEnabled ? 'Tắt giọng hướng dẫn' : 'Bật giọng hướng dẫn'}
            title={voiceEnabled ? 'Tắt giọng hướng dẫn' : 'Bật giọng hướng dẫn'}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: voiceEnabled
                ? '1px solid rgba(56, 189, 248, 0.55)'
                : '1px solid rgba(148, 163, 184, 0.28)',
              background: voiceEnabled ? 'rgba(14, 165, 233, 0.25)' : 'transparent',
              color: voiceEnabled ? '#38bdf8' : '#cbd5e1',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <V28SvgIcon name={voiceEnabled ? 'audio-on' : 'audio-off'} size={13} />
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
            {stepNumber}/{STEP_ORDER.length}
          </span>
          {state.step !== 'complete' && state.step !== 'welcome' && (
            <button
              type="button"
              data-testid="v28-onboarding-skip-btn"
              onClick={onSkip}
              aria-label="Bỏ qua hướng dẫn"
              style={{
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                borderRadius: 7,
                color: '#cbd5e1',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              Bỏ qua
            </button>
          )}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.45 }}>
        {body}
      </p>

      {progressRatio !== null && (
        <div
          aria-label="Tiến độ thao tác"
          style={{
            height: 5,
            borderRadius: 999,
            background: 'rgba(148, 163, 184, 0.22)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(progressRatio * 100)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #38bdf8, #34d399)',
              transition: 'width 120ms ease-out',
            }}
          />
        </div>
      )}

      {state.step === 'welcome' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button
            type="button"
            data-testid="v28-onboarding-start-btn"
            onClick={onStart}
            style={{
              flex: 1,
              minHeight: 34,
              borderRadius: 9,
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Bắt đầu
          </button>
          <button
            type="button"
            data-testid="v28-onboarding-skip-btn"
            onClick={onSkip}
            style={{
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 9,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#e2e8f0',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Bỏ qua
          </button>
        </div>
      )}

      {state.step === 'complete' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button
            type="button"
            data-testid="v28-onboarding-finish-btn"
            onClick={onComplete}
            style={{
              flex: 1,
              minHeight: 34,
              borderRadius: 9,
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Khám phá ngay
          </button>
          <button
            type="button"
            data-testid="v28-onboarding-replay-inline-btn"
            onClick={onReplay}
            style={{
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 9,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#e2e8f0',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Xem lại
          </button>
        </div>
      )}
    </aside>
  );
};
