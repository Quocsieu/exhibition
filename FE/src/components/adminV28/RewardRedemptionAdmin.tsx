import React, { useCallback, useEffect, useState } from 'react';
import {
  v28RewardApi,
  type V28AdminRedemptionDetail,
  type V28AdminRedemptionListItem,
  type V28AdminRewardPolicyResponse,
  type V28RedemptionStatus,
  type V28RewardRiskLevel,
} from '../../services/v28Api';

export interface RewardRedemptionAdminProps {
  activeVersionId?: string;
}

const STATUS_STYLE: Record<V28RedemptionStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', bg: '#fef3c7', color: '#92400e' },
  APPROVED: { label: 'Đã duyệt', bg: '#dcfce7', color: '#166534' },
  REJECTED: { label: 'Từ chối', bg: '#fee2e2', color: '#991b1b' },
  FULFILLED: { label: 'Đã trao quà', bg: '#dbeafe', color: '#1e40af' },
};

const RISK_STYLE: Record<V28RewardRiskLevel, { label: string; bg: string; color: string }> = {
  low: { label: 'Thấp', bg: '#f1f5f9', color: '#334155' },
  medium: { label: 'Trung bình', bg: '#fef3c7', color: '#92400e' },
  high: { label: 'Cao (Cần kiểm tra)', bg: '#fee2e2', color: '#991b1b' },
};

export const RewardRedemptionAdmin: React.FC<RewardRedemptionAdminProps> = ({ activeVersionId }) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [items, setItems] = useState<V28AdminRedemptionListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<V28AdminRedemptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [fulfillNote, setFulfillNote] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');

  // Phase 10: Admin-configurable reward threshold state
  const [policyData, setPolicyData] = useState<V28AdminRewardPolicyResponse | null>(null);
  const [thresholdInput, setThresholdInput] = useState<string>('');
  const [policyLoading, setPolicyLoading] = useState<boolean>(true);
  const [policySaving, setPolicySaving] = useState<boolean>(false);
  const [policyError, setPolicyError] = useState<string>('');
  const [policySuccess, setPolicySuccess] = useState<string>('');

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyError('');
    try {
      const res = await v28RewardApi.getAdminRewardPolicy(activeVersionId || undefined);
      setPolicyData(res);
      setThresholdInput(String(res.policy.requiredUniqueBooths));
    } catch (err) {
      setPolicyError((err as Error).message || 'Không thể tải cấu hình điều kiện nhận quà.');
    } finally {
      setPolicyLoading(false);
    }
  }, [activeVersionId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyData || policySaving) return;
    setPolicyError('');
    setPolicySuccess('');

    const raw = thresholdInput.trim();
    if (!/^\d+$/.test(raw)) {
      setPolicyError('Vui lòng nhập một số nguyên dương hợp lệ.');
      return;
    }
    const parsedNum = Number(raw);
    if (!Number.isInteger(parsedNum) || parsedNum < 1) {
      setPolicyError('Số gian cần tham quan phải tối thiểu là 1.');
      return;
    }
    if (policyData.totalActiveBooths < 1) {
      setPolicyError('Triển lãm hiện không còn gian hàng nào đang hoạt động.');
      return;
    }
    if (parsedNum > policyData.totalActiveBooths) {
      setPolicyError(
        `Số gian yêu cầu (${parsedNum}) không được lớn hơn tổng số gian hiện có thể tham quan (${policyData.totalActiveBooths}).`
      );
      return;
    }

    setPolicySaving(true);
    try {
      const updated = await v28RewardApi.updateAdminRewardPolicy({
        versionId: policyData.versionId,
        requiredUniqueBooths: parsedNum,
      });
      setPolicyData(updated);
      setThresholdInput(String(updated.policy.requiredUniqueBooths));
      setPolicySuccess(
        `Đã lưu mốc nhận quà mới: ${updated.policy.requiredUniqueBooths}/${updated.totalActiveBooths} gian. Các tab khách tham quan sẽ tự động đồng bộ.`
      );
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel('v28-expo-sync');
          ch.postMessage({ type: 'v28:world_updated', reason: 'reward_policy_updated', ts: Date.now() });
          ch.close();
        }
      } catch {
        // ignore BroadcastChannel error
      }
    } catch (err) {
      setPolicyError((err as Error).message || 'Không thể lưu cấu hình điều kiện nhận quà.');
    } finally {
      setPolicySaving(false);
    }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await v28RewardApi.listAdminRedemptions({
        versionId: activeVersionId || undefined,
        status: statusFilter,
      });
      setItems(res.redemptions);
    } catch (err) {
      setError((err as Error).message || 'Không thể tải danh sách yêu cầu nhận quà.');
    } finally {
      setLoading(false);
    }
  }, [activeVersionId, statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setActionError('');
    try {
      const res = await v28RewardApi.getAdminRedemptionDetail(id);
      setDetail(res.redemption);
    } catch (err) {
      setActionError((err as Error).message || 'Không thể tải chi tiết yêu cầu.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleReview = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await v28RewardApi.reviewRedemption(detail.id, {
        decision,
        rejectionReason: decision === 'REJECTED' ? rejectReason.trim() : undefined,
      });
      setDetail(res.redemption);
      setRejectReason('');
      void loadList();
    } catch (err) {
      setActionError((err as Error).message || 'Thao tác duyệt thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFulfill = async () => {
    if (!detail) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await v28RewardApi.fulfillRedemption(detail.id, fulfillNote.trim() || undefined);
      setDetail(res.redemption);
      setFulfillNote('');
      void loadList();
    } catch (err) {
      setActionError((err as Error).message || 'Không thể xác nhận trao quà.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div data-testid="v28-admin-redemptions" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Phase 10: Admin Reward Eligibility Configuration */}
      <form
        className="v28-card"
        data-testid="v28-admin-reward-policy-card"
        onSubmit={(e) => void handleSavePolicy(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong style={{ fontSize: 16, color: '#0f172a', display: 'block' }}>
              ⚙️ Cấu hình điều kiện đăng ký nhận quà
            </strong>
            <span style={{ fontSize: 12.5, color: '#64748b' }}>
              Thiết lập số gian hàng duy nhất khách cần tham quan để mở biểu mẫu đăng ký nhận quà. Các yêu cầu đã gửi trước đó không bị thay đổi trạng thái.
            </span>
          </div>
          <button
            type="button"
            className="v28-btn v28-btn--secondary"
            onClick={() => void loadPolicy()}
            disabled={policyLoading || policySaving}
          >
            ↻ Tải lại cấu hình
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13 }}>
          <div style={{ padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            Tổng số gian hiện có thể tham quan:{' '}
            <strong data-testid="v28-policy-active-booths">
              {policyLoading ? '...' : policyData?.totalActiveBooths ?? 0}
            </strong>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
            Mốc nhận quà hiện tại:{' '}
            <strong data-testid="v28-policy-current-threshold">
              {policyLoading ? '...' : policyData?.policy.requiredUniqueBooths ?? '—'}
            </strong>{' '}
            gian
          </div>
        </div>

        {policyData && policyData.totalActiveBooths < 1 && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
            ⚠️ Triển lãm hiện không còn gian hàng nào đang hoạt động. Chức năng mở đăng ký nhận quà tạm thời bị vô hiệu hóa.
          </div>
        )}

        {policyData?.policyExceedsActiveBooths && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13 }}>
            ⚠️ Mốc nhận quà đã lưu ({policyData.policy.requiredUniqueBooths} gian) hiện lớn hơn tổng số gian đang hoạt động ({policyData.totalActiveBooths} gian). Vui lòng cập nhật mốc phù hợp để khách có thể đạt điều kiện.
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <label
            htmlFor="v28-reward-threshold-input"
            style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}
          >
            Số gian cần tham quan để đăng ký nhận quà:
          </label>
          <input
            id="v28-reward-threshold-input"
            data-testid="v28-policy-threshold-input"
            type="number"
            min={1}
            max={Math.max(1, policyData?.totalActiveBooths ?? 1)}
            step={1}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            disabled={policyLoading || policySaving || (policyData?.totalActiveBooths ?? 0) < 1}
            style={{
              width: 96,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              fontWeight: 700,
              color: '#0f172a',
            }}
          />
          <button
            type="submit"
            className="v28-btn v28-btn--primary"
            data-testid="v28-policy-save-btn"
            disabled={policyLoading || policySaving || (policyData?.totalActiveBooths ?? 0) < 1}
          >
            {policySaving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        {policyError && (
          <div
            data-testid="v28-policy-error"
            style={{ padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}
          >
            ⚠️ {policyError}
          </div>
        )}
        {policySuccess && (
          <div
            data-testid="v28-policy-success"
            style={{ padding: '9px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13 }}
          >
            ✓ {policySuccess}
          </div>
        )}
      </form>

      <div className="v28-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <strong style={{ fontSize: 16, color: '#0f172a', display: 'block' }}>
            🎁 Xác minh & Duyệt yêu cầu nhận quà
          </strong>
          <span style={{ fontSize: 12.5, color: '#64748b' }}>
            Mọi yêu cầu cần Admin kiểm tra risk flags và xác minh người nhận trước khi trao quà thủ công.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Lọc trạng thái yêu cầu"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt (PENDING)</option>
            <option value="APPROVED">Đã duyệt (APPROVED)</option>
            <option value="REJECTED">Từ chối (REJECTED)</option>
            <option value="FULFILLED">Đã trao quà (FULFILLED)</option>
          </select>
          <button type="button" className="v28-btn v28-btn--secondary" onClick={() => void loadList()}>
            ↻ Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: detail ? 'minmax(300px, 1fr) minmax(320px, 1.15fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        {/* List */}
        <div className="v28-card" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 13, color: '#64748b' }}>Đang tải danh sách yêu cầu...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: '#64748b' }}>
              Chưa có yêu cầu đăng ký nhận quà nào trong bộ lọc này.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '8px 6px' }}>Mã YC</th>
                  <th style={{ padding: '8px 6px' }}>Người nhận / Liên hệ</th>
                  <th style={{ padding: '8px 6px' }}>Gian</th>
                  <th style={{ padding: '8px 6px' }}>Rủi ro</th>
                  <th style={{ padding: '8px 6px' }}>Trạng thái</th>
                  <th style={{ padding: '8px 6px' }} />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    data-testid={`v28-admin-redemption-row-${item.redemptionCode}`}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: selectedId === item.id ? '#f0f9ff' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '9px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {item.redemptionCode}
                      <div style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>{item.createdAt}</div>
                    </td>
                    <td style={{ padding: '9px 6px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.recipientName}</div>
                      <div style={{ fontSize: 11.5, color: '#475569' }}>
                        {[item.contactPhone, item.contactEmail].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td style={{ padding: '9px 6px', fontWeight: 700 }}>
                      {item.recordedUniqueBooths}/{item.requiredUniqueBooths}
                    </td>
                    <td style={{ padding: '9px 6px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          background: RISK_STYLE[item.riskLevel].bg,
                          color: RISK_STYLE[item.riskLevel].color,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }}
                      >
                        {RISK_STYLE[item.riskLevel].label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 6px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          background: STATUS_STYLE[item.status].bg,
                          color: STATUS_STYLE[item.status].color,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }}
                      >
                        {STATUS_STYLE[item.status].label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="v28-btn v28-btn--secondary"
                        onClick={() => void loadDetail(item.id)}
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail & Actions */}
        {detail && (
          <div className="v28-card" data-testid="v28-admin-redemption-detail" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>Chi tiết {detail.redemptionCode}</strong>
              <button type="button" className="v28-btn v28-btn--secondary" onClick={() => { setDetail(null); setSelectedId(null); }}>
                ✕ Đóng
              </button>
            </div>

            {detailLoading ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Đang tải chi tiết...</div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: '#334155', display: 'grid', gap: 4 }}>
                  <div>Phiên bản: <code>{detail.versionId}</code></div>
                  <div>Người nhận: <strong>{detail.recipientName}</strong></div>
                  <div>Liên hệ: <strong>{[detail.contactPhone, detail.contactEmail].filter(Boolean).join(' · ')}</strong></div>
                  <div>
                    Số gian duy nhất: <strong>{detail.recordedUniqueBooths}/{detail.requiredUniqueBooths}</strong> ·
                    Thời gian tích lũy: <strong>{detail.visitDurationSec}s</strong>
                  </div>
                  <div>
                    Risk flags:{' '}
                    {detail.riskFlags.map((flag) => (
                      <span
                        key={flag}
                        style={{
                          display: 'inline-block',
                          marginRight: 6,
                          marginTop: 3,
                          padding: '2px 7px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: flag === 'SINGLE_SESSION_GUEST' ? '#f1f5f9' : '#fee2e2',
                          color: flag === 'SINGLE_SESSION_GUEST' ? '#334155' : '#991b1b',
                        }}
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>

                {actionError && (
                  <div style={{ padding: 8, borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 12 }}>
                    ⚠️ {actionError}
                  </div>
                )}

                {detail.status === 'PENDING' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <button
                      type="button"
                      disabled={actionLoading}
                      data-testid="v28-admin-approve-btn"
                      className="v28-btn v28-btn--primary"
                      onClick={() => void handleReview('APPROVED')}
                    >
                      ✓ Phê duyệt yêu cầu (Approve)
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do từ chối..."
                        style={{ flex: 1, padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                      />
                      <button
                        type="button"
                        disabled={actionLoading || rejectReason.trim().length < 3}
                        data-testid="v28-admin-reject-btn"
                        className="v28-btn v28-btn--danger"
                        onClick={() => void handleReview('REJECTED')}
                      >
                        ✕ Từ chối
                      </button>
                    </div>
                  </div>
                )}

                {detail.status === 'APPROVED' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <input
                      type="text"
                      value={fulfillNote}
                      onChange={(e) => setFulfillNote(e.target.value)}
                      placeholder="Ghi chú xác minh & trao quà (tùy chọn)..."
                      style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      disabled={actionLoading}
                      data-testid="v28-admin-fulfill-btn"
                      className="v28-btn v28-btn--primary"
                      onClick={() => void handleFulfill()}
                    >
                      🎁 Xác nhận đã trao quà (Mark as Fulfilled)
                    </button>
                  </div>
                )}

                <details>
                  <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Lịch sử gian hàng đã ghé ({detail.visits.length})
                  </summary>
                  <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6, fontSize: 12, display: 'grid', gap: 3 }}>
                    {detail.visits.map((v) => (
                      <div key={v.boothId} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', padding: '3px 0' }}>
                        <span>#{v.boothNumber} (Khu {v.zoneCode || '?'}) · {v.interactionType}</span>
                        <span style={{ color: '#64748b' }}>{v.firstVisitedAt}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <details open>
                  <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Nhật ký duyệt ({detail.auditLogs.length})
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 12, display: 'grid', gap: 4 }}>
                    {detail.auditLogs.map((a) => (
                      <div key={a.id} style={{ padding: '4px 6px', background: '#f8fafc', borderRadius: 6 }}>
                        <strong>{a.action}</strong> ({a.fromStatus || 'NEW'} → {a.toStatus}) bởi <strong>{a.actor}</strong> · {a.createdAt}
                        {a.note ? <div style={{ color: '#475569' }}>{a.note}</div> : null}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
