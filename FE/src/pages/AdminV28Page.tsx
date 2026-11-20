import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import {
  v28Api,
  type V28ExhibitionVersionDetail,
} from '../services/v28Api';
import { ExhibitionConfigurator } from '../components/adminV28/ExhibitionConfigurator';
import { CompanyManagement } from '../components/adminV28/CompanyManagement';
import { ProductCatalog } from '../components/adminV28/ProductCatalog';
import { ExcelImportWizard } from '../components/adminV28/ExcelImportWizard';
import { UrlProductImport } from '../components/adminV28/UrlProductImport';

export interface AdminV28PageProps {
  onOpenDynamicWorld: () => void;
  onOpenLegacyAdmin: () => void;
}

export const AdminV28Page: React.FC<AdminV28PageProps> = ({
  onOpenDynamicWorld,
  onOpenLegacyAdmin,
}) => {
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('expo_admin_token') || '');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'url_import' | 'catalog' | 'companies' | 'excel'>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeWorld, setActiveWorld] = useState<V28ExhibitionVersionDetail | null>(null);

  const refreshActiveSummary = useCallback(async () => {
    try {
      const worldRes = await v28Api.getActiveWorld();
      setActiveWorld(worldRes.world);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      refreshActiveSummary();
    }
  }, [authToken, refreshActiveSummary]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');
    try {
      const res = await apiClient.loginAdmin(username, password);
      localStorage.setItem('expo_admin_token', res.token);
      setAuthToken(res.token);
      setPassword('');
    } catch (err) {
      setAuthError((err as Error).message || 'Đăng nhập thất bại.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('expo_admin_token');
    setAuthToken('');
  };

  if (!authToken) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: 20,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            width: '100%',
            maxWidth: 400,
            background: '#fff',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <span style={{ background: '#0ea5e9', color: '#fff', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
              GRAND EXPO V28
            </span>
            <h2 style={{ margin: '10px 0 4px', fontSize: 20, color: '#0f172a' }}>Đăng nhập Quản trị V28</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Quản lý triển lãm động (100 gian), doanh nghiệp, kho sản phẩm & import Excel trên database V28 độc lập.
            </p>
          </div>
          {authError && (
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
              ⚠️ {authError}
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Tên đăng nhập
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
          </label>
          <button
            type="submit"
            disabled={loggingIn}
            style={{
              padding: '11px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#0f172a',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {loggingIn ? 'Đang xác thực...' : 'Đăng nhập Admin V28'}
          </button>
          <button
            type="button"
            onClick={onOpenDynamicWorld}
            style={{
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ← Quay lại World 3D V28
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '14px 16px 40px',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Modern V28 Admin Header */}
        <header
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#fff',
            borderRadius: 18,
            padding: '16px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 12px 32px rgba(15,23,42,0.16)',
            border: '1px solid rgba(148,163,184,0.18)',
          }}
        >
          <div style={{ minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ background: '#0ea5e9', padding: '3px 10px', borderRadius: 999, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em' }}>
                ADMIN V28
              </span>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Trung tâm Quản trị Triển lãm Động 3D</h1>
            </div>
            <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 6 }}>
              {activeWorld ? (
                <>
                  Đang Publish: <strong style={{ color: '#38bdf8' }}>v{activeWorld.versionNumber}</strong> ·{' '}
                  <strong style={{ color: '#fff' }}>{activeWorld.booths.length} gian hàng</strong> ·{' '}
                  <strong style={{ color: '#fff' }}>{activeWorld.zones.length} Khu chữ U</strong> · Kích thước{' '}
                  <strong style={{ color: '#fff' }}>{activeWorld.hallWidth}×{activeWorld.hallDepth}m</strong>
                </>
              ) : (
                'Đang tải dữ liệu triển lãm V28...'
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onOpenDynamicWorld}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🌐 Mở World 3D V28
            </button>
            <button
              type="button"
              onClick={onOpenLegacyAdmin}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.06)',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🏛️ Admin V27.5
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                border: '1px solid rgba(248,113,113,0.35)',
                background: 'rgba(239,68,68,0.12)',
                color: '#fecaca',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {/* Live KPI Strip */}
        <section
          aria-label="Trạng thái nhanh V28"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 10,
          }}
        >
          {[
            {
              label: 'Gian hàng hoạt động',
              value: activeWorld ? `${activeWorld.booths.length} gian` : '—',
              sub: activeWorld ? `${activeWorld.zones.length} Khu chữ U` : '',
              accent: '#0284c7',
            },
            {
              label: 'Slot đã gán sản phẩm',
              value: activeWorld
                ? `${activeWorld.booths.reduce((s, b) => s + b.assignedSlotCount, 0)} / ${activeWorld.booths.length * 6}`
                : '—',
              sub: '6 slot / gian hàng',
              accent: '#059669',
            },
            {
              label: 'Gian đã có sản phẩm',
              value: activeWorld
                ? `${activeWorld.booths.filter((b) => b.assignedSlotCount > 0).length} gian`
                : '—',
              sub: 'Đang trưng bày trên 3D',
              accent: '#059669',
            },
            {
              label: 'Gian trống (Chưa có SP)',
              value: activeWorld
                ? `${activeWorld.booths.filter((b) => b.assignedSlotCount === 0).length} gian`
                : '—',
              sub: 'Có thể gán SP hoặc xóa an toàn',
              accent: '#dc2626',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '12px 15px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(15,23,42,0.03)',
              }}
            >
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: kpi.accent, marginTop: 3 }}>{kpi.value}</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{kpi.sub}</div>
            </div>
          ))}
        </section>

        {/* Responsive Primary V28 Navigation Tabs */}
        <nav
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            background: '#fff',
            padding: 8,
            borderRadius: 14,
            border: '1px solid #e2e8f0',
          }}
        >
          {[
            { id: 'dashboard', label: `🏛️ Tạo & Quản lý Triển lãm (${activeWorld?.booths.length ?? '…'})` },
            { id: 'url_import', label: '🔗 Import URL Website' },
            { id: 'catalog', label: '📚 Kho Sản phẩm' },
            { id: 'companies', label: '🏢 Doanh nghiệp' },
            { id: 'excel', label: '📊 Import Excel' },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                style={{
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: active ? 'none' : '1px solid transparent',
                  background: active ? '#0f172a' : 'transparent',
                  color: active ? '#fff' : '#334155',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'background 0.15s ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab Body */}
        {activeTab === 'dashboard' && <ExhibitionConfigurator onDataChanged={refreshActiveSummary} />}
        {activeTab === 'url_import' && (
          <UrlProductImport
            onDataChanged={refreshActiveSummary}
            onOpenDynamicWorld={onOpenDynamicWorld}
          />
        )}
        {activeTab === 'companies' && (
          <CompanyManagement
            onSelectCompanyForCatalog={(cid) => {
              setSelectedCompanyId(cid);
              setActiveTab('catalog');
            }}
          />
        )}
        {activeTab === 'catalog' && <ProductCatalog initialCompanyId={selectedCompanyId} />}
        {activeTab === 'excel' && <ExcelImportWizard />}
      </div>
    </div>
  );
};
