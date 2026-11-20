import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  v28Api,
  type V28ArchetypeId,
  type V28ArchetypeSpec,
  type V28BoothPlacementView,
  type V28Company,
  type V28ExhibitionSummary,
  type V28ExhibitionVersionDetail,
  type V28Product,
} from '../../services/v28Api';

const V28_SYNC_CHANNEL = 'v28-expo-sync';

function notifyV28WorldSync(reason: string): void {
  try {
    const ch = new BroadcastChannel(V28_SYNC_CHANNEL);
    ch.postMessage({ type: 'v28:updated', reason, ts: Date.now() });
    ch.close();
  } catch {
    // BroadcastChannel unsupported
  }
}

export interface ExhibitionConfiguratorProps {
  onDataChanged?: () => void;
}

export const ExhibitionConfigurator: React.FC<ExhibitionConfiguratorProps> = ({ onDataChanged }) => {
  const [exhibitions, setExhibitions] = useState<V28ExhibitionSummary[]>([]);
  const [selectedExhId, setSelectedExhId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [versionDetail, setVersionDetail] = useState<V28ExhibitionVersionDetail | null>(null);
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [archetypes, setArchetypes] = useState<V28ArchetypeSpec[]>([]);
  const [companyCatalogProducts, setCompanyCatalogProducts] = useState<V28Product[]>([]);

  const [targetBoothCount, setTargetBoothCount] = useState<number>(100);
  const [zoneCapacity, setZoneCapacity] = useState<number>(10);
  const [selectedBooth, setSelectedBooth] = useState<V28BoothPlacementView | null>(null);
  const [editBoothName, setEditBoothName] = useState<string>('');
  const [editZoneName, setEditZoneName] = useState<Record<string, string>>({});

  // Search, Filter & Pagination for 100+ booths dashboard
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterZoneCode, setFilterZoneCode] = useState<string>('ALL');
  const [filterAssign, setFilterAssign] = useState<'all' | 'assigned' | 'unassigned' | 'has_products' | 'empty_slots'>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadExhibitions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [exhRes, compRes, archRes] = await Promise.all([
        v28Api.listExhibitions(),
        v28Api.listCompanies({ status: 'active' }),
        v28Api.listArchetypes(),
      ]);
      setExhibitions(exhRes.exhibitions);
      setCompanies(compRes.companies);
      setArchetypes(archRes.archetypes);
      const first = exhRes.exhibitions[0];
      if (first) {
        setSelectedExhId((prev) => prev || first.id);
        const defaultVer = first.activeVersionId || first.latestDraftVersionId || first.versions[0]?.id || '';
        setSelectedVersionId((prev) => prev || defaultVer);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExhibitions();
  }, [loadExhibitions]);

  const loadVersionDetail = useCallback(async (exhId: string, verId: string) => {
    if (!exhId || !verId) return;
    setLoading(true);
    setError('');
    try {
      const { version } = await v28Api.getVersionDetail(exhId, verId);
      setVersionDetail(version);
      setTargetBoothCount(version.targetBoothCount);
      const zn: Record<string, string> = {};
      for (const z of version.zones) zn[z.id] = z.displayName;
      setEditZoneName(zn);
      setSelectedBooth((prev) => {
        const next = prev ? version.booths.find((b) => b.boothId === prev.boothId) || null : null;
        if (next) setEditBoothName(next.boothName);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedExhId && selectedVersionId) {
      loadVersionDetail(selectedExhId, selectedVersionId);
    }
  }, [selectedExhId, selectedVersionId, loadVersionDetail]);

  // Load company's own catalog products whenever a booth is selected for 6-slot assignment
  useEffect(() => {
    if (!selectedBooth?.companyId) {
      setCompanyCatalogProducts([]);
      return;
    }
    let cancelled = false;
    v28Api
      .listProducts({ companyId: selectedBooth.companyId, status: 'active', page: 1, limit: 100 })
      .then((res) => {
        if (!cancelled) setCompanyCatalogProducts(res.items);
      })
      .catch(() => {
        if (!cancelled) setCompanyCatalogProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBooth?.companyId]);

  const selectedExh = exhibitions.find((e) => e.id === selectedExhId) || null;
  const isDraft = versionDetail?.status === 'draft';

  // Dashboard statistics derived 100% from V28 DB
  const stats = useMemo(() => {
    const booths = versionDetail?.booths || [];
    const totalBooths = booths.length;
    const assignedCompanyCount = booths.filter((b) => Boolean(b.companyId)).length;
    const unassignedCompanyCount = totalBooths - assignedCompanyCount;
    const totalAssignedSlots = booths.reduce((sum, b) => sum + b.assignedSlotCount, 0);
    const boothsWithProducts = booths.filter((b) => b.assignedSlotCount > 0).length;
    return {
      totalBooths,
      zoneCount: versionDetail?.zones.length || 0,
      assignedCompanyCount,
      unassignedCompanyCount,
      totalAssignedSlots,
      totalSlotCapacity: totalBooths * 6,
      boothsWithProducts,
    };
  }, [versionDetail]);

  // Filtered & Paginated Booths
  const filteredBooths = useMemo(() => {
    const list = versionDetail?.booths || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((b) => {
      if (filterZoneCode !== 'ALL' && b.zoneCode !== filterZoneCode) return false;
      if (filterAssign === 'assigned' && !b.companyId) return false;
      if (filterAssign === 'unassigned' && b.companyId) return false;
      if (filterAssign === 'has_products' && b.assignedSlotCount === 0) return false;
      if (filterAssign === 'empty_slots' && b.assignedSlotCount > 0) return false;
      if (!q) return true;
      return (
        b.boothName.toLowerCase().includes(q) ||
        b.boothId.toLowerCase().includes(q) ||
        b.companyName.toLowerCase().includes(q) ||
        b.zoneName.toLowerCase().includes(q) ||
        b.archetypeLabel.toLowerCase().includes(q)
      );
    });
  }, [versionDetail, searchQuery, filterZoneCode, filterAssign]);

  const totalPages = Math.max(1, Math.ceil(filteredBooths.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBooths = useMemo(
    () => filteredBooths.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredBooths, safePage, pageSize]
  );

  const handleSelectBooth = (b: V28BoothPlacementView) => {
    setSelectedBooth(b);
    setEditBoothName(b.boothName);
  };

  const handleCreateDraft = async () => {
    if (!selectedExhId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.createDraftVersion(selectedExhId, {
        targetBoothCount,
        preferredZoneCapacity: zoneCapacity,
        baseVersionId: selectedVersionId || undefined,
      });
      await loadExhibitions();
      setSelectedVersionId(version.versionId);
      setVersionDetail(version);
      setPage(1);
      setMessage(`Đã tạo bản Draft v${version.versionNumber} (${version.booths.length} gian, ${version.zones.length} khu).`);
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameZone = async (zoneId: string) => {
    if (!selectedExhId || !selectedVersionId) return;
    const displayName = (editZoneName[zoneId] || '').trim();
    if (!displayName) return;
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.updateDraftZone(selectedExhId, selectedVersionId, zoneId, {
        displayName,
      });
      setVersionDetail(version);
      setMessage(`Đã đổi tên phân khu thành "${displayName}".`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleUpdateBooth = async (
    boothId: string,
    patch: {
      archetypeId?: V28ArchetypeId;
      companyId?: string;
      positionX?: number;
      positionZ?: number;
      boothName?: string;
    }
  ) => {
    if (!selectedExhId || !selectedVersionId) return;
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.updateDraftBooth(selectedExhId, selectedVersionId, boothId, patch);
      setVersionDetail(version);
      const updated = version.booths.find((b) => b.boothId === boothId) || null;
      setSelectedBooth(updated);
      if (updated) setEditBoothName(updated.boothName);
      setMessage('Đã cập nhật gian hàng trong bản Draft.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAssignSlot = async (boothId: string, slotId: string, productId: string) => {
    setError('');
    setMessage('');
    try {
      if (!productId) {
        await v28Api.clearSlot(boothId, slotId);
        setMessage(`Đã gỡ sản phẩm khỏi vị trí ${slotId}.`);
      } else {
        await v28Api.assignSlot(boothId, slotId, productId);
        setMessage(`Đã gán sản phẩm vào vị trí ${slotId} và đồng bộ World V28.`);
      }
      if (selectedExhId && selectedVersionId) {
        await loadVersionDetail(selectedExhId, selectedVersionId);
      }
      notifyV28WorldSync('slot_updated');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handlePublish = async () => {
    if (!selectedExhId || !selectedVersionId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.publishVersion(selectedExhId, selectedVersionId);
      await loadExhibitions();
      setVersionDetail(version);
      setMessage(`Đã Publish phiên bản v${version.versionNumber} (${version.booths.length} gian) — World V28 đã tự đồng bộ!`);
      notifyV28WorldSync('version_published');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (targetVerId: string) => {
    if (!selectedExhId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.rollbackVersion(selectedExhId, targetVerId);
      await loadExhibitions();
      setSelectedVersionId(version.versionId);
      setVersionDetail(version);
      setMessage(`Đã Rollback về phiên bản v${version.versionNumber} — World V28 đã tự đồng bộ!`);
      notifyV28WorldSync('version_rollback');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI Stats Cards (100% V28 DB) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Tổng gian hàng (V28)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{stats.totalBooths}</div>
          <div style={{ fontSize: 12, color: '#0284c7' }}>
            {stats.zoneCount} phân khu ({versionDetail?.zones[0]?.code || 'A'}–{versionDetail?.zones[versionDetail.zones.length - 1]?.code || 'A'})
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Đã gán Doanh nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#047857' }}>{stats.assignedCompanyCount}</div>
          <div style={{ fontSize: 12, color: stats.unassignedCompanyCount > 0 ? '#b45309' : '#64748b' }}>
            Chưa gán: {stats.unassignedCompanyCount} gian
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Vị trí Sản phẩm (6/gian)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#4f46e5' }}>
            {stats.totalAssignedSlots} / {stats.totalSlotCapacity}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{stats.boothsWithProducts} gian đang có sản phẩm</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Phiên bản đang xem</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: versionDetail?.status === 'published' ? '#047857' : '#6366f1' }}>
            v{versionDetail?.versionNumber ?? '—'} · {(versionDetail?.status || '').toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {versionDetail ? `${versionDetail.hallWidth}m × ${versionDetail.hallDepth}m` : '—'}
          </div>
        </div>
      </div>

      {/* Top Overview & Resize Controls */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>
            Số gian:{' '}
            <input
              type="number"
              min={1}
              max={200}
              value={targetBoothCount}
              onChange={(e) => setTargetBoothCount(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
              style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Gian/Khu:{' '}
            <input
              type="number"
              min={4}
              max={50}
              value={zoneCapacity}
              onChange={(e) => setZoneCapacity(Math.max(4, Math.min(50, Number(e.target.value) || 10)))}
              style={{ width: 64, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </label>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + Tạo Draft mới ({targetBoothCount} gian)
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedExh && (
            <select
              value={selectedVersionId}
              onChange={(e) => {
                setSelectedVersionId(e.target.value);
                setPage(1);
              }}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
            >
              {selectedExh.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.targetBoothCount} gian [{v.status.toUpperCase()}]
                </option>
              ))}
            </select>
          )}
          {versionDetail?.status === 'draft' && (
            <>
              <a
                href={`/?world=dynamic&previewVersionId=${encodeURIComponent(versionDetail.versionId)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                👁️ Xem trước 3D Draft
              </a>
              <button
                type="button"
                onClick={handlePublish}
                disabled={loading || !versionDetail.validation.valid}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: versionDetail.validation.valid ? '#10b981' : '#94a3b8',
                  color: '#fff',
                  cursor: versionDetail.validation.valid ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                }}
              >
                🚀 Publish v{versionDetail.versionNumber}
              </button>
            </>
          )}
          {versionDetail?.status === 'archived' && (
            <button
              type="button"
              onClick={() => handleRollback(versionDetail.versionId)}
              disabled={loading}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#f59e0b',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              ⏪ Rollback về v{versionDetail.versionNumber}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}
      {message && (
        <div style={{ padding: 12, borderRadius: 8, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
          ✅ {message}
        </div>
      )}

      {/* Main Split: 2D Floorplan + Selected Booth Editor (with Inline 6-Slot Catalog Assignment) */}
      {versionDetail && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.3fr) minmax(320px, 1fr)', gap: 16 }}>
          {/* 2D Interactive SVG Floorplan + Zones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>
                  Sơ đồ 2D ({versionDetail.booths.length} gian · {versionDetail.zones.length} khu)
                </strong>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {isDraft ? 'Bản Draft (được sửa bố trí)' : 'Published (tạo Draft mới để sửa bố trí; vẫn gán được 6 slot SP)'}
                </span>
              </div>
              <svg
                viewBox={`${versionDetail.hallBounds.minX - 4} ${versionDetail.hallBounds.minZ - 4} ${versionDetail.hallWidth + 8} ${versionDetail.hallDepth + 8}`}
                style={{ width: '100%', maxHeight: 380, background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}
              >
                <rect
                  x={versionDetail.hallBounds.minX}
                  y={versionDetail.hallBounds.minZ}
                  width={versionDetail.hallWidth}
                  height={versionDetail.hallDepth}
                  fill="#f1f5f9"
                  stroke="#94a3b8"
                  strokeWidth={0.6}
                />
                <rect
                  x={versionDetail.centralAvenueBounds.minX}
                  y={versionDetail.centralAvenueBounds.minZ}
                  width={versionDetail.centralAvenueBounds.maxX - versionDetail.centralAvenueBounds.minX}
                  height={versionDetail.centralAvenueBounds.maxZ - versionDetail.centralAvenueBounds.minZ}
                  fill="#e0f2fe"
                />
                <circle cx={versionDetail.spawnPoint.x} cy={versionDetail.spawnPoint.z} r={1.8} fill="#0284c7" />
                {versionDetail.booths.map((b) => {
                  const isSel = selectedBooth?.boothId === b.boothId;
                  const dimmed = filterZoneCode !== 'ALL' && b.zoneCode !== filterZoneCode;
                  return (
                    <g key={b.boothId} onClick={() => handleSelectBooth(b)} style={{ cursor: 'pointer' }}>
                      <rect
                        x={b.positionX - b.footprintWidth / 2}
                        y={b.positionZ - b.footprintDepth / 2}
                        width={b.footprintWidth}
                        height={b.footprintDepth}
                        rx={0.6}
                        fill={dimmed ? '#cbd5e1' : b.color || '#0ea5e9'}
                        fillOpacity={isSel ? 1 : 0.78}
                        stroke={isSel ? '#0f172a' : '#ffffff'}
                        strokeWidth={isSel ? 1.1 : 0.35}
                      />
                      <text
                        x={b.positionX}
                        y={b.positionZ + 0.6}
                        textAnchor="middle"
                        fontSize={2.0}
                        fontWeight="bold"
                        fill="#ffffff"
                      >
                        {b.zoneCode}
                        {b.slotIndex + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Zones Manager */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                Danh sách Phân khu ({versionDetail.zones.length})
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {versionDetail.zones.map((z) => (
                  <div
                    key={z.id}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      padding: 6,
                      borderRadius: 8,
                      background: filterZoneCode === z.code ? '#e0f2fe' : '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFilterZoneCode(filterZoneCode === z.code ? 'ALL' : z.code);
                        setPage(1);
                      }}
                      style={{
                        minWidth: 28,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: 'none',
                        background: filterZoneCode === z.code ? '#0284c7' : '#e2e8f0',
                        color: filterZoneCode === z.code ? '#fff' : '#0f172a',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {z.code}
                    </button>
                    <input
                      value={editZoneName[z.id] ?? z.displayName}
                      disabled={!isDraft}
                      onChange={(e) => setEditZoneName((prev) => ({ ...prev, [z.id]: e.target.value }))}
                      style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{z.boothCount}</span>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => handleRenameZone(z.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                      >
                        Lưu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Selected Booth Configurator + Inline 6-Slot Product Catalog Assigner */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', alignSelf: 'start' }}>
            <strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>
              Chi tiết Gian hàng & 6 Vị trí Trưng bày
            </strong>
            {!selectedBooth ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Chọn một gian hàng từ sơ đồ 2D hoặc bảng danh sách 100 gian hàng bên dưới để chỉnh sửa tên, doanh nghiệp, mẫu kiến trúc và gán sản phẩm vào 6 vị trí.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedBooth.boothName} <span style={{ color: '#64748b', fontWeight: 500 }}>({selectedBooth.boothId})</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {selectedBooth.zoneName} · Tọa độ ({selectedBooth.positionX}m, {selectedBooth.positionZ}m) · {selectedBooth.assignedSlotCount}/6 SP
                  </div>
                </div>

                {/* Booth Rename (Draft) */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={editBoothName}
                    disabled={!isDraft}
                    onChange={(e) => setEditBoothName(e.target.value)}
                    placeholder="Tên gian hàng..."
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  {isDraft && (
                    <button
                      type="button"
                      onClick={() => handleUpdateBooth(selectedBooth.boothId, { boothName: editBoothName.trim() })}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Đổi tên
                    </button>
                  )}
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Doanh nghiệp sở hữu {isDraft ? '' : '(tạo Draft để đổi)'}:
                  <select
                    disabled={!isDraft}
                    value={selectedBooth.companyId || ''}
                    onChange={(e) => handleUpdateBooth(selectedBooth.boothId, { companyId: e.target.value })}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Mẫu Gian hàng (6 V27.4 Archetypes):
                  <select
                    disabled={!isDraft}
                    value={selectedBooth.archetypeId}
                    onChange={(e) =>
                      handleUpdateBooth(selectedBooth.boothId, { archetypeId: e.target.value as V28ArchetypeId })
                    }
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    {archetypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} ({a.width}m × {a.depth}m)
                      </option>
                    ))}
                  </select>
                </label>

                {/* Inline 6 Product Display Slots (Catalog filtered strictly to owning company!) */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Gán sản phẩm từ Catalog của {selectedBooth.companyName} ({companyCatalogProducts.length} SP):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedBooth.slots.map((s) => (
                      <div key={s.slotId} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ width: 58, fontSize: 12, fontWeight: 700, color: '#475569' }}>{s.slotId}</span>
                        <select
                          value={s.product?.id || ''}
                          onChange={(e) => handleAssignSlot(selectedBooth.boothId, s.slotId, e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                        >
                          <option value="">— Vị trí trống —</option>
                          {companyCatalogProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.price.toLocaleString('vi-VN')} {p.currency})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paginated, Searchable, Filterable 100-Booth Table */}
      {versionDetail && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>
              Danh sách Gian hàng V28 ({filteredBooths.length} / {versionDetail.booths.length} gian)
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm tên gian, mã gian, doanh nghiệp..."
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', minWidth: 220, fontSize: 13 }}
              />
              <select
                value={filterZoneCode}
                onChange={(e) => {
                  setFilterZoneCode(e.target.value);
                  setPage(1);
                }}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                <option value="ALL">Tất cả khu ({versionDetail.zones.length})</option>
                {versionDetail.zones.map((z) => (
                  <option key={z.id} value={z.code}>
                    {z.displayName} ({z.boothCount})
                  </option>
                ))}
              </select>
              <select
                value={filterAssign}
                onChange={(e) => {
                  setFilterAssign(e.target.value as typeof filterAssign);
                  setPage(1);
                }}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="assigned">Đã gán Doanh nghiệp</option>
                <option value="unassigned">Chưa gán Doanh nghiệp</option>
                <option value="has_products">Đã trưng bày SP</option>
                <option value="empty_slots">Chưa có SP</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              >
                <option value={12}>12 / trang</option>
                <option value={25}>25 / trang</option>
                <option value={50}>50 / trang</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>#</th>
                  <th style={{ padding: '8px 10px' }}>Gian hàng</th>
                  <th style={{ padding: '8px 10px' }}>Phân khu</th>
                  <th style={{ padding: '8px 10px' }}>Doanh nghiệp</th>
                  <th style={{ padding: '8px 10px' }}>Mẫu kiến trúc</th>
                  <th style={{ padding: '8px 10px' }}>Trưng bày</th>
                  <th style={{ padding: '8px 10px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pagedBooths.map((b) => (
                  <tr
                    key={b.boothId}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: selectedBooth?.boothId === b.boothId ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{b.slotIndex + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      {b.boothName}
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{b.boothId}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>{b.zoneName}</td>
                    <td style={{ padding: '8px 10px' }}>{b.companyName || '— Chưa gán —'}</td>
                    <td style={{ padding: '8px 10px' }}>{b.archetypeLabel}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: b.assignedSlotCount > 0 ? '#dcfce7' : '#f1f5f9',
                          color: b.assignedSlotCount > 0 ? '#166534' : '#64748b',
                        }}
                      >
                        {b.assignedSlotCount} / 6 SP
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectBooth(b)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Quản lý / 6 Slot
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13 }}>
            <span style={{ color: '#64748b' }}>
              Trang {safePage} / {totalPages} (Tổng {filteredBooths.length} gian hàng)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                ← Trước
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
