import React, { useCallback, useEffect, useState } from 'react';
import {
  v28Api,
  type V28ArchetypeId,
  type V28ArchetypeSpec,
  type V28BoothPlacementView,
  type V28Company,
  type V28ExhibitionSummary,
  type V28ExhibitionVersionDetail,
} from '../../services/v28Api';

export const ExhibitionConfigurator: React.FC = () => {
  const [exhibitions, setExhibitions] = useState<V28ExhibitionSummary[]>([]);
  const [selectedExhId, setSelectedExhId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [versionDetail, setVersionDetail] = useState<V28ExhibitionVersionDetail | null>(null);
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [archetypes, setArchetypes] = useState<V28ArchetypeSpec[]>([]);
  const [targetBoothCount, setTargetBoothCount] = useState<number>(20);
  const [zoneCapacity, setZoneCapacity] = useState<number>(10);
  const [selectedBooth, setSelectedBooth] = useState<V28BoothPlacementView | null>(null);
  const [editZoneName, setEditZoneName] = useState<Record<string, string>>({});
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
        const defaultVer = first.latestDraftVersionId || first.activeVersionId || first.versions[0]?.id || '';
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
      setSelectedBooth((prev) =>
        prev ? version.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
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

  const selectedExh = exhibitions.find((e) => e.id === selectedExhId) || null;
  const isDraft = versionDetail?.status === 'draft';

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
      setMessage(`Đã tạo bản Draft v${version.versionNumber} (${version.booths.length} gian, ${version.zones.length} khu).`);
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
    patch: { archetypeId?: V28ArchetypeId; companyId?: string; positionX?: number; positionZ?: number }
  ) => {
    if (!selectedExhId || !selectedVersionId) return;
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.updateDraftBooth(selectedExhId, selectedVersionId, boothId, patch);
      setVersionDetail(version);
      setSelectedBooth(version.booths.find((b) => b.boothId === boothId) || null);
      setMessage('Đã cập nhật cấu hình gian hàng trong bản Draft.');
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
      setMessage(`Đã Publish phiên bản v${version.versionNumber} (${version.booths.length} gian) thành công!`);
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
      setMessage(`Đã Rollback về phiên bản v${version.versionNumber}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Overview & Resize Controls */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>🏗️ Quy hoạch Triển lãm Động (V28)</h3>
          {selectedExh && (
            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
              <strong>{selectedExh.name}</strong> · Đang Publish: <strong>v{selectedExh.activeVersionNumber ?? '—'}</strong> (
              {selectedExh.activeBoothCount} gian · {selectedExh.activeZoneCount} khu)
            </div>
          )}
        </div>

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
            + Tạo Draft ({targetBoothCount} gian)
          </button>
          <a
            href="/?world=dynamic"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: '#0ea5e9',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            🌐 Mở 3D V28 (Published)
          </a>
          {versionDetail && versionDetail.status === 'draft' && (
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

      {/* Version Selector & Publish / Rollback Bar */}
      {selectedExh && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 14,
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Phiên bản layout:</span>
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            >
              {selectedExh.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.targetBoothCount} gian [{v.status.toUpperCase()}]
                </option>
              ))}
            </select>

            {versionDetail && (
              <span
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: versionDetail.validation.valid ? '#dcfce7' : '#fee2e2',
                  color: versionDetail.validation.valid ? '#166534' : '#991b1b',
                  fontWeight: 600,
                }}
              >
                {versionDetail.validation.valid
                  ? `✓ Layout hợp lệ (${versionDetail.hallWidth}m × ${versionDetail.hallDepth}m · 0 overlap)`
                  : `✗ ${versionDetail.validation.errors.length} lỗi layout`}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {versionDetail?.status === 'draft' && (
              <button
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
                🚀 Publish Phiên bản v{versionDetail.versionNumber}
              </button>
            )}
            {versionDetail?.status === 'archived' && (
              <button
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
      )}

      {/* Main Split: 2D Floorplan Preview + Zone/Booth Inspector */}
      {versionDetail && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.4fr) minmax(300px, 1fr)', gap: 16 }}>
          {/* 2D Interactive SVG Floorplan */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>
                Sơ đồ Mặt bằng 2D ({versionDetail.booths.length} gian · {versionDetail.zones.length} khu)
              </strong>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Click gian hàng để chỉnh sửa {isDraft ? '(Draft)' : '(Chỉ xem — Published bất biến)'}
              </span>
            </div>
            <svg
              viewBox={`${versionDetail.hallBounds.minX - 4} ${versionDetail.hallBounds.minZ - 4} ${versionDetail.hallWidth + 8} ${versionDetail.hallDepth + 8}`}
              style={{ width: '100%', maxHeight: 460, background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}
            >
              {/* Hall Floor */}
              <rect
                x={versionDetail.hallBounds.minX}
                y={versionDetail.hallBounds.minZ}
                width={versionDetail.hallWidth}
                height={versionDetail.hallDepth}
                fill="#f1f5f9"
                stroke="#94a3b8"
                strokeWidth={0.6}
              />
              {/* Central Avenue */}
              <rect
                x={versionDetail.centralAvenueBounds.minX}
                y={versionDetail.centralAvenueBounds.minZ}
                width={versionDetail.centralAvenueBounds.maxX - versionDetail.centralAvenueBounds.minX}
                height={versionDetail.centralAvenueBounds.maxZ - versionDetail.centralAvenueBounds.minZ}
                fill="#e0f2fe"
              />
              {/* Welcome Area */}
              <rect
                x={versionDetail.welcomeAreaBounds.minX}
                y={versionDetail.welcomeAreaBounds.minZ}
                width={versionDetail.welcomeAreaBounds.maxX - versionDetail.welcomeAreaBounds.minX}
                height={versionDetail.welcomeAreaBounds.maxZ - versionDetail.welcomeAreaBounds.minZ}
                fill="#fef3c7"
                fillOpacity={0.5}
              />
              {/* Spawn Marker */}
              <circle cx={versionDetail.spawnPoint.x} cy={versionDetail.spawnPoint.z} r={1.6} fill="#0284c7" />
              {/* Booths */}
              {versionDetail.booths.map((b) => {
                const isSel = selectedBooth?.boothId === b.boothId;
                return (
                  <g
                    key={b.boothId}
                    onClick={() => setSelectedBooth(b)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={b.positionX - b.footprintWidth / 2}
                      y={b.positionZ - b.footprintDepth / 2}
                      width={b.footprintWidth}
                      height={b.footprintDepth}
                      rx={0.6}
                      fill={b.color || '#0ea5e9'}
                      fillOpacity={isSel ? 0.95 : 0.72}
                      stroke={isSel ? '#0f172a' : '#ffffff'}
                      strokeWidth={isSel ? 0.9 : 0.35}
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

          {/* Right Panel: Zones + Selected Booth Editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Zones List */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                Phân khu ({versionDetail.zones.length})
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {versionDetail.zones.map((z) => (
                  <div key={z.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span
                      style={{
                        minWidth: 28,
                        textAlign: 'center',
                        padding: '3px 6px',
                        borderRadius: 6,
                        background: '#e2e8f0',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {z.code}
                    </span>
                    <input
                      value={editZoneName[z.id] ?? z.displayName}
                      disabled={!isDraft}
                      onChange={(e) => setEditZoneName((prev) => ({ ...prev, [z.id]: e.target.value }))}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>{z.boothCount} gian</span>
                    {isDraft && (
                      <button
                        onClick={() => handleRenameZone(z.id)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Lưu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Booth Editor */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                Chi tiết Gian hàng
              </strong>
              {!selectedBooth ? (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Chọn một gian hàng trên sơ đồ 2D để xem hoặc chỉnh sửa (Company, Archetype, Tọa độ).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <div>
                    <strong>{selectedBooth.boothName}</strong> ({selectedBooth.boothId}) · Khu{' '}
                    <strong>{selectedBooth.zoneName}</strong>
                  </div>
                  <div>
                    Trưng bày: <strong>{selectedBooth.assignedSlotCount} / 6</strong> vị trí sản phẩm
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Doanh nghiệp sở hữu:
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
                    Kiến trúc Gian hàng (6 V27.4 Archetypes):
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ flex: 1 }}>
                      X (m):
                      <input
                        type="number"
                        step={0.5}
                        disabled={!isDraft}
                        defaultValue={selectedBooth.positionX}
                        key={`${selectedBooth.boothId}-x-${selectedBooth.positionX}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (!Number.isNaN(val) && val !== selectedBooth.positionX) {
                            handleUpdateBooth(selectedBooth.boothId, { positionX: val });
                          }
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      Z (m):
                      <input
                        type="number"
                        step={0.5}
                        disabled={!isDraft}
                        defaultValue={selectedBooth.positionZ}
                        key={`${selectedBooth.boothId}-z-${selectedBooth.positionZ}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (!Number.isNaN(val) && val !== selectedBooth.positionZ) {
                            handleUpdateBooth(selectedBooth.boothId, { positionZ: val });
                          }
                        }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
