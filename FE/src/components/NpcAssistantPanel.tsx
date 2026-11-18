import React from 'react';
import type { Product } from '../types/expo';
import type {
  NpcAudioRuntimeState,
  NpcPresentationPlan,
  NpcPresentationStep,
  NpcSessionStatus,
} from '../services/npcPresentationService';
import { formatCurrency } from './ProductPanel';

export interface NpcAssistantPanelProps {
  plan: NpcPresentationPlan | null;
  status: NpcSessionStatus;
  audioState: NpcAudioRuntimeState;
  voiceNotice?: string | null;
  currentStepIndex: number;
  isMuted: boolean;
  hasVietnameseVoice: boolean;
  onPause: () => void;
  onResume: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onRestart: () => void;
  onRetryAudio?: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  onInspectProduct?: (product: Product) => void;
}

function isAudioActivelyPlaying(audioState: NpcAudioRuntimeState): boolean {
  return audioState === 'PLAYING' || audioState === 'SPEAKING';
}

function isAudioPreparing(audioState: NpcAudioRuntimeState): boolean {
  return (
    audioState === 'MODEL_LOADING' ||
    audioState === 'GENERATING_AUDIO' ||
    audioState === 'AUDIO_READY' ||
    audioState === 'CHECKING_VOICE'
  );
}

function getStatusLabel(
  status: NpcSessionStatus,
  audioState: NpcAudioRuntimeState,
  step: NpcPresentationStep | undefined
): string {
  switch (status) {
    case 'GREETING':
      if (audioState === 'MODEL_LOADING') return '⏳ Đang khởi tạo mô hình giọng nói...';
      if (isAudioPreparing(audioState)) return '⏳ Đang tạo âm thanh lời chào...';
      return isAudioActivelyPlaying(audioState)
        ? '🔊 Đang phát lời chào mừng'
        : '👋 Chào mừng khách tham quan (Phụ đề)';
    case 'PRESENTING':
      if (step?.type === 'PRODUCT' && step.productIndex && step.totalProducts) {
        if (audioState === 'MODEL_LOADING') {
          return '⏳ Đang khởi tạo mô hình giọng nói...';
        }
        if (isAudioPreparing(audioState)) {
          return `⏳ Đang tạo âm thanh SP ${step.productIndex}/${step.totalProducts}...`;
        }
        return isAudioActivelyPlaying(audioState)
          ? `🔊 Đang thuyết minh SP ${step.productIndex}/${step.totalProducts}`
          : `📝 Giới thiệu sản phẩm ${step.productIndex}/${step.totalProducts} (Phụ đề)`;
      }
      if (step?.type === 'CLOSING') {
        if (audioState === 'MODEL_LOADING') return '⏳ Đang khởi tạo mô hình giọng nói...';
        if (isAudioPreparing(audioState)) return '⏳ Đang tạo âm thanh lời cảm ơn...';
        return isAudioActivelyPlaying(audioState)
          ? '🔊 Lời cảm ơn & kết thúc'
          : '✨ Lời cảm ơn & kết thúc (Phụ đề)';
      }
      return isAudioActivelyPlaying(audioState) ? '🔊 Đang thuyết minh' : '📝 Đang hiển thị phụ đề';
    case 'PAUSED':
      return '⏸️ Đang tạm dừng thuyết minh';
    case 'COMPLETED':
      return '✅ Đã hoàn tất giới thiệu gian hàng';
    case 'CANCELLED':
      return '⏹️ Đã dừng thuyết minh';
    case 'ERROR':
      return '⚠️ Chế độ phụ đề văn bản';
    default:
      return '💬 Sẵn sàng tư vấn';
  }
}

export const NpcAssistantPanel: React.FC<NpcAssistantPanelProps> = React.memo(
  ({
    plan,
    status,
    audioState,
    voiceNotice,
    currentStepIndex,
    isMuted,
    hasVietnameseVoice,
    onPause,
    onResume,
    onPrevious,
    onNext,
    onStop,
    onRestart,
    onRetryAudio,
    onToggleMute,
    onClose,
    onInspectProduct,
  }) => {
    if (!plan || status === 'IDLE') {
      return null;
    }

    const { booth, profile, steps, totalProducts } = plan;
    const currentStep = steps[Math.min(Math.max(0, currentStepIndex), steps.length - 1)];
    const activeProduct = currentStep?.product ?? null;
    const isSessionRunning = status === 'GREETING' || status === 'PRESENTING';
    const isActuallySpeakingAudio = isSessionRunning && isAudioActivelyPlaying(audioState);
    const isPaused = status === 'PAUSED';
    const isFinishedOrStopped = status === 'COMPLETED' || status === 'CANCELLED';

    const canGoPrevious = currentStepIndex > 0;
    const canGoNext = currentStepIndex < steps.length - 1;

    const productCounterBadge =
      currentStep?.type === 'PRODUCT' && currentStep.productIndex
        ? `Sản phẩm ${currentStep.productIndex}/${totalProducts}`
        : totalProducts > 0
          ? `${totalProducts} sản phẩm trưng bày`
          : 'Chưa có sản phẩm';

    const isWarningState =
      audioState === 'NO_VI_VOICE' || audioState === 'AUDIO_ERROR' || audioState === 'ERROR';

    let voiceStatusText: string;
    if (isMuted || audioState === 'MUTED') {
      voiceStatusText = '🔇 Đang tắt tiếng (Chỉ hiển thị phụ đề)';
    } else if (isAudioActivelyPlaying(audioState)) {
      voiceStatusText = `🔊 Đang phát giọng đọc: ${voiceNotice || 'Tiếng Việt (vi-VN)'}`;
    } else if (audioState === 'MODEL_LOADING') {
      voiceStatusText =
        voiceNotice || '⏳ Đang khởi tạo mô hình giọng nói tiếng Việt lần đầu trên máy chủ...';
    } else if (audioState === 'GENERATING_AUDIO' || audioState === 'CHECKING_VOICE') {
      voiceStatusText =
        voiceNotice || '⏳ Đang tạo đoạn âm thanh giọng nữ Phương Linh...';
    } else if (audioState === 'AUDIO_READY') {
      voiceStatusText = '🔊 Âm thanh đã sẵn sàng, bắt đầu phát...';
    } else if (audioState === 'ENDED') {
      voiceStatusText = '✅ Đã phát xong phần giới thiệu gian hàng';
    } else if (audioState === 'NO_VI_VOICE') {
      voiceStatusText = '⚠️ Chưa thể kết nối nguồn phát âm thanh — Đang chạy phụ đề tự động';
    } else if (audioState === 'AUDIO_ERROR' || audioState === 'ERROR') {
      voiceStatusText = '⚠️ Không thể phát giọng đọc — Đang chạy phụ đề tự động';
    } else if (hasVietnameseVoice) {
      voiceStatusText = '🔊 Hỗ trợ giọng đọc Tiếng Việt (vi-VN)';
    } else {
      voiceStatusText = '📝 Chế độ phụ đề Tiếng Việt tự động';
    }

    return (
      <aside
        className="npc-assistant-panel"
        style={{ '--npc-accent': booth.color } as React.CSSProperties}
        aria-label={`Trợ lý ảo giới thiệu gian hàng ${booth.name}`}
      >
        {/* Top Accent Strip */}
        <div className="npc-assistant-panel__strip" />

        {/* Header: Assistant Avatar Badge, Name, Booth Title & Close Button */}
        <header className="npc-assistant-panel__header">
          <div className="npc-assistant-panel__persona">
            <div
              className={`npc-assistant-panel__avatar ${
                isActuallySpeakingAudio ? 'npc-assistant-panel__avatar--speaking' : ''
              }`}
              aria-hidden="true"
            >
              👩‍💼
            </div>
            <div className="npc-assistant-panel__persona-info">
              <div className="npc-assistant-panel__name-row">
                <strong className="npc-assistant-panel__name">
                  {profile.assistantName}
                </strong>
                <span className="npc-assistant-panel__role-badge">
                  {profile.roleTitle}
                </span>
              </div>
              <div className="npc-assistant-panel__booth-name">
                📍 {booth.companyName || booth.name}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="npc-assistant-panel__close-btn"
            onClick={onClose}
            aria-label="Đóng bảng giới thiệu của trợ lý ảo"
            title="Đóng (Dừng thuyết minh)"
          >
            ✕
          </button>
        </header>

        {/* Status & Product Order Counter Bar */}
        <div className="npc-assistant-panel__status-bar">
          <span
            className={`npc-status-pill ${
              isSessionRunning
                ? 'npc-status-pill--active'
                : isPaused
                  ? 'npc-status-pill--paused'
                  : 'npc-status-pill--idle'
            }`}
          >
            {getStatusLabel(status, audioState, currentStep)}
          </span>

          <span className="npc-counter-pill">{productCounterBadge}</span>
        </div>

        {/* Clear Audio Notice Banner when Vietnamese TTS voice is unavailable or failed */}
        {!isMuted && isWarningState && (
          <div className="npc-assistant-panel__audio-warning" role="alert">
            <strong>
              {audioState === 'NO_VI_VOICE'
                ? '🔇 Đang chạy chế độ Phụ đề Tiếng Việt'
                : '⚠️ Không thể phát âm thanh giọng đọc'}
            </strong>
            <span>
              {voiceNotice ||
                'Dịch vụ giọng đọc đám mây chưa được cấu hình hoặc tạm thời gián đoạn. Hệ thống đang hiển thị phụ đề tiếng Việt tuần tự.'}
            </span>
            {onRetryAudio && (
              <div>
                <button
                  type="button"
                  className="npc-ctrl-btn"
                  style={{ marginTop: 4, flex: 'none', padding: '4px 10px', fontSize: '0.74rem' }}
                  onClick={onRetryAudio}
                  title="Thử tải và phát lại âm thanh cho lời thoại hiện tại"
                >
                  🔄 Thử lại âm thanh
                </button>
              </div>
            )}
          </div>
        )}

        {/* Subtitle Box (Vietnamese Transcript) */}
        <div
          className="npc-assistant-panel__subtitle-box"
          role="status"
          aria-live="polite"
        >
          <p className="npc-assistant-panel__subtitle-text">
            “{currentStep?.text || ''}”
          </p>
          <div className="npc-assistant-panel__voice-meta">
            <span>{voiceStatusText}</span>
            {currentStep?.slotLabel && (
              <span>· Kệ: {currentStep.slotLabel}</span>
            )}
          </div>
        </div>

        {/* Highlighted Product Preview Card (when presenting a specific product) */}
        {activeProduct && (
          <div className="npc-assistant-panel__product-card">
            {activeProduct.images?.[0] ? (
              <img
                src={activeProduct.images[0]}
                alt={activeProduct.name}
                className="npc-assistant-panel__product-img"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="npc-assistant-panel__product-placeholder">📦</div>
            )}

            <div className="npc-assistant-panel__product-info">
              <div className="npc-assistant-panel__product-slot">
                {currentStep?.slotId?.toUpperCase()} · {currentStep?.slotLabel}
              </div>
              <strong className="npc-assistant-panel__product-title">
                {activeProduct.name}
              </strong>
              {activeProduct.price > 0 && (
                <div className="npc-assistant-panel__product-price">
                  {formatCurrency(activeProduct.price, activeProduct.currency)}
                </div>
              )}
            </div>

            {onInspectProduct && (
              <button
                type="button"
                className="btn btn--secondary btn--sm npc-assistant-panel__inspect-btn"
                onClick={() => onInspectProduct(activeProduct)}
                title="Mở hộp thoại thông tin chi tiết của sản phẩm này"
              >
                🔍 Chi tiết
              </button>
            )}
          </div>
        )}

        {/* Step Progress Indicator Dots */}
        {steps.length > 1 && (
          <div className="npc-assistant-panel__progress" aria-label="Tiến độ thuyết minh">
            {steps.map((s) => {
              const isCurrent = s.stepIndex === currentStepIndex;
              const isDone = s.stepIndex < currentStepIndex;
              return (
                <span
                  key={s.stepIndex}
                  className={`npc-progress-dot ${
                    isCurrent
                      ? 'npc-progress-dot--current'
                      : isDone
                        ? 'npc-progress-dot--done'
                        : ''
                  }`}
                  title={
                    s.type === 'GREETING'
                      ? 'Chào mừng'
                      : s.type === 'CLOSING'
                        ? 'Kết thúc'
                        : `Sản phẩm ${s.productIndex}: ${s.product?.name || ''}`
                  }
                />
              );
            })}
          </div>
        )}

        {/* Playback Controls: Previous, Pause/Resume, Next, Stop/Restart, Mute */}
        <div
          className="npc-assistant-panel__controls"
          role="group"
          aria-label="Điều khiển thuyết minh sản phẩm"
        >
          <button
            type="button"
            className="npc-ctrl-btn"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            title="Quay lại bước / sản phẩm trước"
            aria-label="Trước"
          >
            ⏮ Trước
          </button>

          {isPaused ? (
            <button
              type="button"
              className="npc-ctrl-btn npc-ctrl-btn--primary"
              onClick={onResume}
              title="Tiếp tục thuyết minh"
              aria-label="Tiếp tục"
            >
              ▶ Tiếp tục
            </button>
          ) : isFinishedOrStopped ? (
            <button
              type="button"
              className="npc-ctrl-btn npc-ctrl-btn--primary"
              onClick={onRestart}
              title="Nghe giới thiệu lại từ đầu"
              aria-label="Nghe lại"
            >
              🔄 Nghe lại
            </button>
          ) : (
            <button
              type="button"
              className="npc-ctrl-btn npc-ctrl-btn--primary"
              onClick={onPause}
              title="Tạm dừng thuyết minh"
              aria-label="Tạm dừng"
            >
              ⏸ Tạm dừng
            </button>
          )}

          <button
            type="button"
            className="npc-ctrl-btn"
            onClick={onNext}
            disabled={!canGoNext}
            title="Chuyển sang sản phẩm tiếp theo"
            aria-label="Tiếp"
          >
            Tiếp ⏭
          </button>

          <button
            type="button"
            className="npc-ctrl-btn npc-ctrl-btn--danger"
            onClick={onStop}
            disabled={isFinishedOrStopped}
            title="Dừng hẳn phiên thuyết minh hiện tại"
            aria-label="Dừng"
          >
            ⏹ Dừng
          </button>

          <button
            type="button"
            className={`npc-ctrl-btn ${isMuted ? 'npc-ctrl-btn--muted' : ''}`}
            onClick={onToggleMute}
            aria-pressed={isMuted}
            title={isMuted ? 'Bật giọng đọc tiếng Việt' : 'Tắt tiếng (Chỉ hiện phụ đề)'}
            aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
          >
            {isMuted ? '🔇 Bật tiếng' : '🔊 Tắt tiếng'}
          </button>
        </div>
      </aside>
    );
  }
);
