import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { v28Api, type V28ExhibitionVersionDetail } from '../services/v28Api';
import { ExhibitionConfigurator } from '../components/adminV28/ExhibitionConfigurator';
import { CompanyManagement } from '../components/adminV28/CompanyManagement';
import { ProductCatalog } from '../components/adminV28/ProductCatalog';
import { ExcelImportWizard } from '../components/adminV28/ExcelImportWizard';

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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'companies' | 'catalog' | 'excel'>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeWorld, setActiveWorld] = useState<V28ExhibitionVersionDetail | null>(null);

  const refreshActiveSummary = useCallback(async () => {
    try {
      const { world } = await v28Api.getActiveWorld();
      setActiveWorld(world);
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
        background: '#f1f5f9',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '18px 22px 40px',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Dedicated V28 Admin Header (100% V28 DB data — NEVER shows legacy 6-booth count!) */}
        <header
          style={{
            background: '#0f172a',
            color: '#fff',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#0ea5e9', padding: '3px 9px', borderRadius: 8, fontWeight: 800, fontSize: 12 }}>
                ADMIN V28
              </span>
              <h1 style={{ margin: 0, fontSize: 20 }}>Trung tâm Quản trị Triển lãm Động V28</h1>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>
              {activeWorld ? (
                <>
                  Đang Publish: <strong style={{ color: '#38bdf8' }}>v{activeWorld.versionNumber}</strong> ·{' '}
                  <strong style={{ color: '#fff' }}>{activeWorld.booths.length} gian hàng</strong> ·{' '}
                  <strong style={{ color: '#fff' }}>{activeWorld.zones.length} phân khu</strong> · Database độc lập{' '}
                  <code>expo_v28_dev.db</code>
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
              🌐 Mở World 3D V28 (?world=dynamic)
            </button>
            <button
              type="button"
              onClick={onOpenLegacyAdmin}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'transparent',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🏛️ Admin V27.5 (6 gian)
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '9px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: '#f8fafc',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {/* Primary V28 Navigation Tabs */}
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'dashboard', label: `🏛️ Dashboard & Quy hoạch (${activeWorld?.booths.length ?? '…'} gian)` },
            { id: 'companies', label: '🏢 Quản lý Doanh nghiệp' },
            { id: 'catalog', label: '📚 Kho Sản phẩm Độc lập' },
            { id: 'excel', label: '📊 Import Excel (.xlsx)' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: activeTab === t.id ? 'none' : '1px solid #cbd5e1',
                background: activeTab === t.id ? '#0f172a' : '#fff',
                color: activeTab === t.id ? '#fff' : '#0f172a',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab Body */}
        {activeTab === 'dashboard' && <ExhibitionConfigurator onDataChanged={refreshActiveSummary} />}
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
