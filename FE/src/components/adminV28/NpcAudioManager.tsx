import React, { useCallback, useEffect, useState } from 'react';
import {
  v28Api,
  type V28AdminAudioOverview,
  type V28AiStatusResponse,
  type V28BoothAudioPack,
  type V28ExhibitionVersionDetail,
} from '../../services/v28Api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface NpcAudioManagerProps {
  activeWorld: V28ExhibitionVersionDetail | null;
}

export const NpcAudioManager: React.FC<NpcAudioManagerProps> = ({ activeWorld }) => {
  const [overview, setOverview] = useState<V28AdminAudioOverview | null>(null);
  const [aiStatus, setAiStatus] = useState<V28AiStatusResponse | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<string>('');
  const [boothPack, setBoothPack] = useState<V28BoothAudioPack | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [audioRes, aiRes] = await Promise.all([
        v28Api.getAudioOverview(40),
        v28Api.getAiStatus(),
      ]);
      setOverview(audioRes.overview);
      setAiStatus(aiRes);
    } catch (err) {
      setError((err as Error).message || 'Không thể tải trạng thái NPC & Audio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeWorld && activeWorld.booths.length > 0 && !selectedBoothId) {
      setSelectedBoothId(activeWorld.booths[0].boothId);
    }
  }, [activeWorld, selectedBoothId]);

  const handleLoadOrRetryBooth = async (retry: boolean) => {
    if (!selectedBoothId) return;
    setRetrying(true);
    setError('');
    try {
      const pack = retry
        ? await v28Api.retryBoothAudio(selectedBoothId)
        : await v28Api.getBoothAudio(selectedBoothId);
      setBoothPack(pack);
      await refresh();
    } catch (err) {
      setError((err as Error).message || 'Tạo/Kiểm tra audio thất bại.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Provider Transparency Banner */}
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 16,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>🎙️ Quản trị NPC Audio Cache &amp; AI Consultant</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {loading ? '⏳ Đang tải...' : '🔄 Làm mới trạng thái'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1' }}>
          <strong>Audio TTS:</strong> {overview?.providerLabel || 'Đang tải...'}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>AI Chat / Voice:</strong> {aiStatus?.liveStatusNote || 'Đang kiểm tra...'}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'Tổng tệp Audio Cache', value: overview.totalAssets, color: '#0f172a' },
            { label: 'Sẵn sàng (Ready)', value: overview.readyCount, color: '#059669' },
            { label: 'Đang xử lý (Pending)', value: overview.pendingCount, color: '#d97706' },
            { label: 'Lỗi (Failed)', value: overview.failedCount, color: '#dc2626' },
            { label: 'Cache Hits / Misses', value: `${overview.metrics.cacheHits} / ${overview.metrics.cacheMisses}`, color: '#0284c7' },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-Booth Audio Inspection & Safe Retry */}
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 20,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
          Kiểm tra &amp; Retry Cache Audio theo từng Gian hàng
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedBoothId}
            onChange={(e) => setSelectedBoothId(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
          >
            {(activeWorld?.booths || []).map((b) => (
              <option key={b.boothId} value={b.boothId}>
                [{b.zoneCode}] {b.boothName} — {b.companyName} ({b.assignedSlotCount}/6 SP)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={retrying || !selectedBoothId}
            onClick={() => handleLoadOrRetryBooth(false)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🔍 Kiểm tra Audio Cache
          </button>
          <button
            type="button"
            disabled={retrying || !selectedBoothId}
            onClick={() => handleLoadOrRetryBooth(true)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#0ea5e9',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {retrying ? '⏳ Đang xử lý...' : '🔁 Retry an toàn'}
          </button>
        </div>

        {boothPack && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Kho lưu trữ: <code>{boothPack.storageDriver}</code> · Cache Hits: <strong>{boothPack.cacheHits}</strong> · Tạo mới: <strong>{boothPack.generatedCount}</strong> · Chế độ:{' '}
              <strong>{boothPack.liveGeminiTtsEnabled ? 'Gemini Live TTS' : 'Local Fallback WAV (Zero-cost)'}</strong>
            </div>
            {boothPack.clips.map((c) => (
              <div
                key={c.audioId}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.slotKey}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: c.status === 'ready' ? '#dcfce7' : c.status === 'pending' ? '#fef3c7' : '#fee2e2',
                        color: c.status === 'ready' ? '#166534' : c.status === 'pending' ? '#92400e' : '#991b1b',
                      }}
                    >
                      {c.status.toUpperCase()}
                    </span>
                    <code style={{ fontSize: 11, color: '#64748b' }}>hash:{c.contentHash.slice(0, 10)}</code>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{c.transcript}</div>
                </div>
                <audio controls preload="none" src={`${API_BASE}${c.audioUrl}`} style={{ height: 34, maxWidth: '100%' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
