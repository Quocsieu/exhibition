import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  v28Api,
  type V28BoothPlacementView,
  type V28ExhibitionVersionDetail,
} from '../../services/v28Api';

export interface EmptyBoothManagerProps {
  exhibitionId?: string;
  versionId?: string;
  onWorldUpdated?: () => void;
}

type ConfirmActionState =
  | {
      mode: 'single';
      booth: V28BoothPlacementView;
      willRemoveZones: string[];
      remainingZones: number;
      removeCount: number;
    }
  | {
      mode: 'zone';
      zoneId: string;
      zoneLabel: string;
      willRemoveZones: string[];
      remainingZones: number;
      removeCount: number;
    }
  | {
      mode: 'all';
      willRemoveZones: string[];
      remainingZones: number;
      removeCount: number;
    };

function notifyV28WorldSync(reason: string): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('v28-expo-sync');
      ch.postMessage({ type: 'v28:world_updated', reason, ts: Date.now() });
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel errors
  }
}

export const EmptyBoothManager: React.FC<EmptyBoothManagerProps> = ({
  exhibitionId,
  versionId,
  onWorldUpdated,
}) => {
  const [version, setVersion] = useState<V28ExhibitionVersionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const loadVersion = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let targetExhId = exhibitionId;
      let targetVerId = versionId;
      if (!targetExhId || !targetVerId) {
        const activeRes = await v28Api.getActiveWorld(undefined, true);
        targetExhId = activeRes.world.exhibitionId;
        targetVerId = activeRes.world.versionId;
      }
      const res = await v28Api.getVersionDetail(targetExhId, targetVerId);
      setVersion(res.version);
    } catch (err) {
      setError((err as Error).message || 'Không thể tải danh sách gian hàng.');
    } finally {
      setLoading(false);
    }
  }, [exhibitionId, versionId]);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  const ownerId = version?.ownerCompanyId || null;

  const isRemovableEmptyBooth = useCallback(
    (b: V28BoothPlacementView): boolean => {
      if (b.assignedSlotCount > 0) return false;
      const hasDistinctTenant = Boolean(b.companyId && (!ownerId || b.companyId !== ownerId));
      return !hasDistinctTenant;
    },
    [ownerId]
  );

  const summary = useMemo(() => {
    const booths = version?.booths || [];
    const zones = version?.zones || [];
    let withProductsCount = 0;
    let emptyRemovableCount = 0;

    for (const b of booths) {
      if (b.assignedSlotCount > 0) withProductsCount++;
      else if (isRemovableEmptyBooth(b)) emptyRemovableCount++;
    }

    const byZone = zones.map((z) => {
      const zBooths = booths
        .filter((b) => b.zoneId === z.id)
        .sort((a, b) => a.slotIndex - b.slotIndex);
      const zEmpty = zBooths.filter(isRemovableEmptyBooth);
      const zProducts = zBooths.filter((b) => b.assignedSlotCount > 0);
      return {
        zone: z,
        booths: zBooths,
        emptyBooths: zEmpty,
        productBoothCount: zProducts.length,
        willDisappearIfZoneCleared: zBooths.length > 0 && zEmpty.length === zBooths.length,
      };
    });

    return {
      activeBoothCount: booths.length,
      withProductsCount,
      emptyRemovableCount,
      activeZoneCount: zones.length,
      byZone,
    };
  }, [version, isRemovableEmptyBooth]);

  const canDeleteAllEmpty =
    summary.emptyRemovableCount > 0 &&
    summary.activeBoothCount - summary.emptyRemovableCount >= 1;

  const openConfirmSingle = (booth: V28BoothPlacementView) => {
    if (!version) return;
    const zoneEntry = summary.byZone.find((z) => z.zone.id === booth.zoneId);
    const willRemoveZones =
      zoneEntry && zoneEntry.booths.length === 1 ? [zoneEntry.zone.displayName] : [];
    setConfirmAction({
      mode: 'single',
      booth,
      removeCount: 1,
      willRemoveZones,
      remainingZones: summary.activeZoneCount - willRemoveZones.length,
    });
  };

  const openConfirmZone = (zoneId: string) => {
    const zoneEntry = summary.byZone.find((z) => z.zone.id === zoneId);
    if (!zoneEntry || zoneEntry.emptyBooths.length === 0) return;
    const willRemoveZones = zoneEntry.willDisappearIfZoneCleared
      ? [zoneEntry.zone.displayName]
      : [];
    setConfirmAction({
      mode: 'zone',
      zoneId,
      zoneLabel: zoneEntry.zone.displayName,
      removeCount: zoneEntry.emptyBooths.length,
      willRemoveZones,
      remainingZones: summary.activeZoneCount - willRemoveZones.length,
    });
  };

  const openConfirmAll = () => {
    if (!canDeleteAllEmpty) return;
    const willRemoveZones = summary.byZone
      .filter((z) => z.willDisappearIfZoneCleared)
      .map((z) => z.zone.displayName);
    setConfirmAction({
      mode: 'all',
      removeCount: summary.emptyRemovableCount,
      willRemoveZones,
      remainingZones: summary.activeZoneCount - willRemoveZones.length,
    });
  };

  const executeRemoval = async () => {
    if (!version || !confirmAction || submitting) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const payload =
        confirmAction.mode === 'single'
          ? { mode: 'single' as const, boothId: confirmAction.booth.boothId }
          : confirmAction.mode === 'zone'
            ? { mode: 'zone' as const, zoneId: confirmAction.zoneId }
            : { mode: 'all' as const };

      const res = await v28Api.removeEmptyBooths(
        version.exhibitionId,
        version.versionId,
        payload
      );
      setVersion(res.version);
      setConfirmAction(null);
      const compactMsg =
        res.compacted && res.removedZoneCodes.length > 0
          ? ` Đã tự động thu gọn bố cục chữ U (loại khu ${res.removedZoneCodes.join(', ')}, còn ${res.remainingZoneCount} khu).`
          : ` Giữ nguyên tọa độ các gian còn lại (${res.remainingZoneCount} khu).`;
      setMessage(
        `Đã xóa vĩnh viễn ${res.removedCount} gian trống khỏi phiên bản triển lãm (còn ${res.remainingBoothCount} gian hoạt động).${compactMsg}`
      );
      notifyV28WorldSync('empty_booths_removed');
      onWorldUpdated?.();
    } catch (err) {
      setError((err as Error).message || 'Không thể xóa gian hàng trống.');
      setConfirmAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="v28-card"
      data-testid="v28-admin-empty-booths-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Header + Bulk Action */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            Quản lý &amp; xóa gian hàng trống theo khu
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#526071' }}>
            Chỉ xóa gian chưa gắn sản phẩm và không thuộc doanh nghiệp thuê độc lập. Giữ nguyên số gian (#1–#100) và chỉ tự động thu gọn bố cục chữ U khi một khu bị xóa hoàn toàn.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="v28-btn v28-btn--secondary"
            onClick={() => void loadVersion()}
            disabled={loading || submitting}
          >
            ↻ Làm mới
          </button>
          <button
            type="button"
            className="v28-btn v28-btn--danger"
            data-testid="v28-delete-all-empty-btn"
            disabled={!canDeleteAllEmpty || loading || submitting}
            onClick={openConfirmAll}
            title={
              !canDeleteAllEmpty
                ? 'Cần giữ lại ít nhất 1 gian hàng hoạt động trong triển lãm'
                : 'Xóa toàn bộ gian trống trong phiên bản triển lãm này'
            }
          >
            🗑️ Xóa tất cả gian trống ({summary.emptyRemovableCount})
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
        }}
      >
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Gian đang hoạt động</div>
          <div data-testid="v28-empty-kpi-active" style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
            {summary.activeBoothCount}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>Gian có sản phẩm</div>
          <div data-testid="v28-empty-kpi-products" style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginTop: 2 }}>
            {summary.withProductsCount}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>Gian trống có thể xóa</div>
          <div data-testid="v28-empty-kpi-removable" style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c', marginTop: 2 }}>
            {summary.emptyRemovableCount}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>Số khu còn hoạt động</div>
          <div data-testid="v28-empty-kpi-zones" style={{ fontSize: 22, fontWeight: 800, color: '#0057b8', marginTop: 2 }}>
            {summary.activeZoneCount}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {message && (
        <div
          data-testid="v28-empty-booths-message"
          style={{ padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13 }}
        >
          ✓ {message}
        </div>
      )}

      {/* Zone-by-Zone List */}
      {loading && !version ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          Đang tải danh sách gian hàng theo khu...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {summary.byZone.map(({ zone, booths, emptyBooths, productBoothCount, willDisappearIfZoneCleared }) => {
            const isExpanded = expandedZoneId === zone.id;
            const canClearZone =
              emptyBooths.length > 0 &&
              summary.activeBoothCount - emptyBooths.length >= 1;

            return (
              <div
                key={zone.id}
                data-testid={`v28-zone-card-${zone.code}`}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '11px 14px',
                    background: '#f8fafc',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedZoneId(isExpanded ? null : zone.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#475569', width: 16 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: '#e0f2fe',
                        color: '#0057b8',
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      {zone.code}
                    </span>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>{zone.displayName}</strong>
                    <span style={{ fontSize: 12.5, color: '#64748b' }}>
                      {booths.length} gian · {productBoothCount} có SP · {emptyBooths.length} trống
                    </span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="v28-btn v28-btn--secondary"
                      style={{ minHeight: 34, padding: '0 10px', fontSize: 12.5 }}
                      onClick={() => setExpandedZoneId(isExpanded ? null : zone.id)}
                    >
                      {isExpanded ? 'Thu gọn' : 'Xem gian'}
                    </button>
                    <button
                      type="button"
                      className="v28-btn v28-btn--danger"
                      data-testid={`v28-delete-zone-empty-${zone.code}`}
                      style={{ minHeight: 34, padding: '0 10px', fontSize: 12.5 }}
                      disabled={!canClearZone || submitting}
                      onClick={() => openConfirmZone(zone.id)}
                      title={
                        willDisappearIfZoneCleared
                          ? `Xóa toàn bộ ${emptyBooths.length} gian trống sẽ loại bỏ hoàn toàn ${zone.displayName} và tự thu gọn bố cục`
                          : `Xóa ${emptyBooths.length} gian trống trong ${zone.displayName}`
                      }
                    >
                      Xóa gian trống khu {zone.code} ({emptyBooths.length})
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                          <th style={{ padding: '8px 14px' }}>Số gian</th>
                          <th style={{ padding: '8px 10px' }}>Tên gian</th>
                          <th style={{ padding: '8px 10px' }}>Sản phẩm</th>
                          <th style={{ padding: '8px 10px' }}>Trạng thái</th>
                          <th style={{ padding: '8px 14px', textAlign: 'right' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {booths.map((b) => {
                          const removable = isRemovableEmptyBooth(b);
                          const canDeleteThis = removable && summary.activeBoothCount > 1;
                          return (
                            <tr
                              key={b.boothId}
                              data-testid={`v28-overview-booth-row-${b.slotIndex + 1}`}
                              style={{ borderBottom: '1px solid #f1f5f9' }}
                            >
                              <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0f172a' }}>
                                #{b.slotIndex + 1}
                              </td>
                              <td style={{ padding: '9px 10px', color: '#0f172a' }}>{b.boothName}</td>
                              <td style={{ padding: '9px 10px', color: '#475569' }}>
                                {b.assignedSlotCount}/6 SP
                              </td>
                              <td style={{ padding: '9px 10px' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    background: b.assignedSlotCount > 0 ? '#dcfce7' : removable ? '#fef3c7' : '#e0f2fe',
                                    color: b.assignedSlotCount > 0 ? '#166534' : removable ? '#92400e' : '#0369a1',
                                  }}
                                >
                                  {b.assignedSlotCount > 0
                                    ? 'Có sản phẩm'
                                    : removable
                                      ? 'Gian trống'
                                      : 'Thuê độc lập'}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                {removable ? (
                                  <button
                                    type="button"
                                    className="v28-btn v28-btn--danger"
                                    data-testid={`v28-delete-single-booth-${b.slotIndex + 1}`}
                                    style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
                                    disabled={!canDeleteThis || submitting}
                                    onClick={() => openConfirmSingle(b)}
                                  >
                                    Xóa gian
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Được bảo vệ</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal (No window.confirm) */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="v28-empty-remove-confirm-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.56)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1200,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#ffffff',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#991b1b' }}>
              Xác nhận xóa vĩnh viễn gian hàng trống
            </h4>
            <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.55 }}>
              {confirmAction.mode === 'single' ? (
                <>
                  Bạn sắp xóa vĩnh viễn <strong>Gian #{confirmAction.booth.slotIndex + 1}</strong> ({confirmAction.booth.boothName}) khỏi phiên bản triển lãm này.
                </>
              ) : confirmAction.mode === 'zone' ? (
                <>
                  Bạn sắp xóa vĩnh viễn <strong>{confirmAction.removeCount} gian trống</strong> trong <strong>{confirmAction.zoneLabel}</strong>.
                </>
              ) : (
                <>
                  Bạn sắp xóa vĩnh viễn toàn bộ <strong>{confirmAction.removeCount} gian trống</strong> trong phiên bản triển lãm này.
                </>
              )}
            </p>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 13,
                color: '#0f172a',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div>• Số gian sẽ xóa: <strong>{confirmAction.removeCount} gian</strong></div>
              <div>
                • Khu bị loại hoàn toàn:{' '}
                <strong>
                  {confirmAction.willRemoveZones.length > 0
                    ? confirmAction.willRemoveZones.join(', ')
                    : 'Không có (giữ nguyên tọa độ các gian còn lại)'}
                </strong>
              </div>
              <div>• Số khu còn lại: <strong>{confirmAction.remainingZones} khu</strong></div>
            </div>

            {confirmAction.willRemoveZones.length > 0 && (
              <div style={{ padding: '9px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12.5 }}>
                ℹ️ Do có khu bị loại hoàn toàn, World 3D và Bản đồ 2D sẽ tự động thu gọn các khu còn lại theo bố cục chữ U.
              </div>
            )}

            <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12.5 }}>
              ⚠️ Thao tác xóa vĩnh viễn không thể khôi phục bằng nút Ẩn/Hiện. Dữ liệu doanh nghiệp, sản phẩm và lịch sử tham quan/quà tặng vẫn được bảo toàn.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="v28-btn v28-btn--secondary"
                disabled={submitting}
                onClick={() => setConfirmAction(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="v28-btn v28-btn--danger"
                data-testid="v28-confirm-permanent-remove-btn"
                disabled={submitting}
                onClick={() => void executeRemoval()}
              >
                {submitting ? 'Đang xóa...' : 'Xác nhận xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
