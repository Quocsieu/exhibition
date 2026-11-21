import React, { useEffect, useState } from 'react';
import {
  v28RewardApi,
  type V28RedemptionStatus,
  type V28VisitorRewardStatusResponse,
} from '../../services/v28Api';

export interface RewardRedemptionModalProps {
  versionId: string;
  rewardStatus: V28VisitorRewardStatusResponse | null;
  loading: boolean;
  isMobileUi: boolean;
  isMobileLandscape: boolean;
  onStatusUpdated: (next: V28VisitorRewardStatusResponse) => void;
  onClose: () => void;
}

const STATUS_META: Record<
  V28RedemptionStatus,
  { label: string; bg: string; color: string; desc: string }
> = {
  PENDING: {
    label: 'Đang chờ duyệt',
    bg: '#fef3c7',
    color: '#92400e',
    desc: 'Yêu cầu của bạn đã được ghi nhận. Ban tổ chức sẽ xác minh lịch sử tham quan và liên hệ trước khi trao quà.',
  },
  APPROVED: {
    label: 'Đã được duyệt',
    bg: '#dcfce7',
    color: '#166534',
    desc: 'Yêu cầu đã được phê duyệt. Ban tổ chức sẽ liên hệ để xác minh người nhận và tiến hành trao quà.',
  },
  REJECTED: {
    label: 'Bị từ chối',
    bg: '#fee2e2',
    color: '#991b1b',
    desc: 'Yêu cầu chưa đạt điều kiện xác minh của ban tổ chức.',
  },
  FULFILLED: {
    label: 'Đã trao quà',
    bg: '#dbeafe',
    color: '#1e40af',
    desc: 'Ban tổ chức đã xác nhận hoàn tất trao quà cho yêu cầu này.',
  },
};

export const RewardRedemptionModal: React.FC<RewardRedemptionModalProps> = ({
  versionId,
  rewardStatus,
  loading,
  isMobileUi,
  isMobileLandscape,
  onStatusUpdated,
  onClose,
}) => {
  const [recipientName, setRecipientName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  const recorded = rewardStatus?.recordedUniqueBooths ?? 0;
  const required = rewardStatus?.requiredUniqueBooths ?? null;
  const pct =
    required && required > 0
      ? Math.min(100, Math.round((recorded / required) * 100))
      : 0;
  const redemption = rewardStatus?.redemption ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const updated = await v28RewardApi.submitRedemption({
        versionId,
        recipientName: recipientName.trim(),
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        consentAccepted,
      });
      onStatusUpdated(updated);
    } catch (err) {
      setError((err as Error).message || 'Không thể gửi yêu cầu đăng ký nhận quà.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="v28-reward-modal-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobileLandscape ? 10 : 16,
        pointerEvents: 'auto',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Đăng ký nhận quà tham quan"
        data-testid="v28-reward-modal"
        style={{
          width: isMobileUi ? 'min(420px, 100%)' : 440,
          maxHeight: isMobileLandscape ? '92dvh' : '86dvh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: 16,
          padding: isMobileLandscape ? 14 : 18,
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.35)',
          border: '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <strong style={{ fontSize: 16, color: '#0f172a', display: 'block' }}>
              🎁 {rewardStatus?.rewardTitle || 'Quà tặng tham quan Grand Expo V28'}
            </strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Xác minh lịch sử tham quan trước khi trao quà
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ nhận quà"
            style={{
              minWidth: 40,
              minHeight: 40,
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            <span>
              {loading || required === null
                ? 'Đang kiểm tra tiến độ...'
                : `Đã tham quan ${Math.min(recorded, required)}/${required} gian để mở đăng ký nhận quà`}
            </span>
            <span style={{ color: '#0284c7' }}>{pct}%</span>
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 999,
                background: required !== null && recorded >= required ? '#10b981' : '#0284c7',
                transition: 'width 200ms ease',
              }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: '#64748b' }}>
            Tổng gian hàng duy nhất được máy chủ ghi nhận: <strong>{recorded}/{rewardStatus?.totalBooths ?? '...'}</strong> gian.
          </div>
        </div>

        {/* Case 1: Already submitted */}
        {redemption ? (
          <div
            data-testid="v28-reward-status-card"
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                Mã yêu cầu: <strong style={{ color: '#0f172a' }}>{redemption.redemptionCode}</strong>
              </span>
              <span
                data-testid="v28-reward-status-badge"
                style={{
                  background: STATUS_META[redemption.status].bg,
                  color: STATUS_META[redemption.status].color,
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 999,
                }}
              >
                {STATUS_META[redemption.status].label}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#334155', lineHeight: 1.45 }}>
              {STATUS_META[redemption.status].desc}
            </p>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Người nhận: <strong>{redemption.recipientName}</strong> · Liên hệ: <strong>{redemption.maskedContact}</strong>
            </div>
            {redemption.rejectionReason && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  color: '#991b1b',
                  fontSize: 12,
                }}
              >
                Lý do từ chối: {redemption.rejectionReason}
              </div>
            )}
          </div>
        ) : rewardStatus?.eligibleToSubmit ? (
          /* Case 2: Eligible (>= 30 booths) -> Redemption Request Form */
          <form onSubmit={handleSubmit} data-testid="v28-reward-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#334155', background: '#f0f9ff', padding: '8px 10px', borderRadius: 8, border: '1px solid #bae6fd' }}>
              Bạn đã đạt mốc đăng ký. Vui lòng điền thông tin tối thiểu để ban tổ chức xác minh và liên hệ trao quà (không phát quà tự động).
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
              Tên người nhận *
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nguyễn Văn A"
                data-testid="v28-reward-name-input"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
              Số điện thoại (hoặc nhập Email bên dưới)
              <input
                type="tel"
                maxLength={24}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="0901234567"
                data-testid="v28-reward-phone-input"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
              Email (không bắt buộc nếu đã nhập SĐT)
              <input
                type="email"
                maxLength={120}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="ban@example.com"
                data-testid="v28-reward-email-input"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                data-testid="v28-reward-consent-checkbox"
                style={{ marginTop: 2 }}
              />
              <span>
                Tôi đồng ý cung cấp thông tin liên hệ trên chỉ nhằm mục đích để ban tổ chức xác minh và trao quà cho sự kiện này.
              </span>
            </label>

            {error && (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12 }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="v28-reward-submit-btn"
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: submitting ? '#94a3b8' : 'var(--v28-youth-blue, #0057b8)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13.5,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu đăng ký nhận quà'}
            </button>
          </form>
        ) : (
          /* Case 3: Not yet eligible */
          <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
            {required === null ? (
              'Đang tải điều kiện tham quan từ máy chủ...'
            ) : (
              <>
                Hãy tiếp tục khám phá và tương tác trực tiếp tại ít nhất{' '}
                <strong>{Math.max(0, required - recorded)} gian hàng nữa</strong> để mở biểu mẫu đăng ký nhận quà.
                Mọi yêu cầu sau khi gửi sẽ được ban tổ chức xác minh trước khi trao quà.
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
