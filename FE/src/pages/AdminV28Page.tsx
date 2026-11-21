import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import {
  v28Api,
  type V28ExhibitionVersionDetail,
} from '../services/v28Api';
import { ExhibitionConfigurator } from '../components/adminV28/ExhibitionConfigurator';
import { CompanyManagement } from '../components/adminV28/CompanyManagement';
import { ProductCatalog } from '../components/adminV28/ProductCatalog';
import { RewardRedemptionAdmin } from '../components/adminV28/RewardRedemptionAdmin';
import { EmptyBoothManager } from '../components/adminV28/EmptyBoothManager';
import './adminV28.css';

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
  const [demoConfig, setDemoConfig] = useState<{ demoEnabled: boolean; label?: string; username?: string; password?: string }>({
    demoEnabled: false,
  });
  const [logoFailed, setLogoFailed] = useState<boolean>(false);

  const [activeSection, setActiveSection] = useState<'overview' | 'wizard' | 'products' | 'company' | 'rewards'>('overview');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeWorld, setActiveWorld] = useState<V28ExhibitionVersionDetail | null>(null);
  const [worldLoadError, setWorldLoadError] = useState<boolean>(false);
  const [viewedVersionMeta, setViewedVersionMeta] = useState<{ status: string; zones: number; booths: number; ownerName?: string } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [navRequest, setNavRequest] = useState<{ mode: 'dashboard' | 'wizard'; step?: 1 | 2 | 3 | 4; nonce: number }>({
    mode: 'dashboard',
    nonce: 0,
  });
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  useEffect(() => {
    if (authToken) return;
    let cancelled = false;
    const loader =
      typeof v28Api.getDemoConfig === 'function'
        ? v28Api.getDemoConfig()
        : fetch('/api/v28/auth/demo-config').then((r) => r.json());
    loader
      .then((cfg) => {
        if (!cancelled) setDemoConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setDemoConfig({ demoEnabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const refreshActiveSummary = useCallback(async () => {
    try {
      setWorldLoadError(false);
      const worldRes = await v28Api.getActiveWorld();
      setActiveWorld(worldRes.world);
      setLogoFailed(false);
    } catch {
      setWorldLoadError(true);
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
    setActiveWorld(null);
    setViewedVersionMeta(null);
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
            <span style={{ background: '#0284c7', color: '#fff', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
              GRAND EXPO
            </span>
            <h2 style={{ margin: '10px 0 4px', fontSize: 20, color: '#0f172a' }}>Đăng nhập Quản trị</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Quản lý không gian triển lãm 3D, danh mục gian hàng và kho sản phẩm.
            </p>
          </div>
          {authError && (
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
              ⚠️ {authError}
            </div>
          )}
          {demoConfig.demoEnabled && demoConfig.username && demoConfig.password && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>
                  {demoConfig.label || 'Tài khoản dùng thử'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#0f172a',
                    marginTop: 4,
                    lineHeight: 1.5,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  <div>
                    TK: <strong>{demoConfig.username}</strong>
                  </div>
                  <div>
                    MK: <strong>{demoConfig.password}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUsername(demoConfig.username || '');
                  setPassword(demoConfig.password || '');
                  setAuthError('');
                }}
                style={{
                  padding: '7px 11px',
                  borderRadius: 8,
                  border: '1px solid #0284c7',
                  background: '#fff',
                  color: '#0369a1',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Điền nhanh
              </button>
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
            {loggingIn ? 'Đang xác thực...' : 'Đăng nhập'}
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
            ← Quay lại triển lãm 3D
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="v28-admin-shell">
      {/* Left Minimal SaaS Sidebar Navigation — 3 Core Entries */}
      <aside
        aria-label="Điều hướng quản trị"
        className={`v28-sidebar ${mobileNavOpen ? '' : 'v28-sidebar--collapsed'}`}
      >
        <div>
          <div className="v28-brand" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="v28-brand-mark">GE</div>
              <div>
                <div className="v28-brand-title">Grand Expo</div>
                <div className="v28-brand-sub">Quản trị triển lãm</div>
              </div>
            </div>
            <button
              type="button"
              className="v28-btn v28-btn--secondary v28-mobile-menu-btn"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-expanded={mobileNavOpen}
              style={{ minHeight: 34, padding: '0 10px' }}
            >
              {mobileNavOpen ? 'Đóng' : 'Menu'}
            </button>
          </div>

          <div className="v28-nav-collapse">
            <div className="v28-nav-section-label">Điều hướng</div>
            <nav className="v28-nav-list" aria-label="Menu chính quản trị">
              <button
                type="button"
                className={`v28-nav-item ${activeSection === 'overview' || activeSection === 'products' || activeSection === 'company' ? 'v28-nav-item--active' : ''}`}
                onClick={() => {
                  setActiveSection('overview');
                  setNavRequest((r) => ({ mode: 'dashboard', nonce: r.nonce + 1 }));
                  setMobileNavOpen(false);
                }}
              >
                <span>📊</span>
                <span>Tổng quan</span>
              </button>
              <button
                type="button"
                className={`v28-nav-item ${activeSection === 'wizard' ? 'v28-nav-item--active' : ''}`}
                onClick={() => {
                  setActiveSection('wizard');
                  setNavRequest((r) => ({ mode: 'wizard', nonce: r.nonce + 1 }));
                  setMobileNavOpen(false);
                }}
              >
                <span>✨</span>
                <span>Tạo triển lãm</span>
              </button>
              <button
                type="button"
                className={`v28-nav-item ${activeSection === 'rewards' ? 'v28-nav-item--active' : ''}`}
                data-testid="v28-admin-nav-rewards"
                onClick={() => {
                  setActiveSection('rewards');
                  setMobileNavOpen(false);
                }}
              >
                <span>🎁</span>
                <span>Đổi quà</span>
              </button>
              <button
                type="button"
                className="v28-nav-item"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenDynamicWorld();
                }}
              >
                <span>🌐</span>
                <span>Xem triển lãm</span>
              </button>
            </nav>
          </div>
        </div>

        <div className="v28-sidebar-footer v28-nav-collapse">
          <button type="button" className="v28-btn v28-btn--secondary" onClick={onOpenLegacyAdmin}>
            🏛️ Quản trị bản cũ
          </button>
          <button type="button" className="v28-btn v28-btn--danger" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="v28-main">
        <header className="v28-topbar">
          <div>
            <h1 className="v28-topbar-title">
              {activeSection === 'wizard'
                ? 'Tạo triển lãm'
                : activeSection === 'products'
                  ? 'Kho sản phẩm'
                  : activeSection === 'company'
                    ? 'Thông tin doanh nghiệp'
                    : activeSection === 'rewards'
                      ? 'Xác minh & Đổi quà'
                      : 'Tổng quan'}
            </h1>
            <div className="v28-topbar-meta">
              {viewedVersionMeta
                ? `${viewedVersionMeta.ownerName ? `${viewedVersionMeta.ownerName} · ` : ''}${viewedVersionMeta.zones} khu · ${viewedVersionMeta.booths} gian`
                : activeWorld
                  ? `${activeWorld.ownerCompany ? `${activeWorld.ownerCompany.name} · ` : ''}${activeWorld.zones.length} khu · ${activeWorld.booths.length} gian`
                  : worldLoadError
                    ? 'Không thể tải thông tin triển lãm'
                    : 'Đang tải thông tin triển lãm...'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(viewedVersionMeta || activeWorld) && (
              <span
                className="v28-status-pill"
                style={
                  viewedVersionMeta?.status === 'draft'
                    ? { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }
                    : undefined
                }
              >
                {viewedVersionMeta?.status === 'draft' ? '● Bản nháp (Draft)' : '● Đã xuất bản'}
              </span>
            )}
            <button
              type="button"
              className="v28-btn v28-btn--primary"
              onClick={() => {
                setActiveSection('wizard');
                setNavRequest((r) => ({ mode: 'wizard', step: 1, nonce: r.nonce + 1 }));
              }}
            >
              + Tạo triển lãm
            </button>
          </div>
        </header>

        <div className="v28-content">
          {/* Keep ExhibitionConfigurator mounted so switching to Products/Company NEVER loses Wizard/Zone/Booth state */}
          <div style={{ display: activeSection === 'overview' || activeSection === 'wizard' ? 'block' : 'none' }}>
            <ExhibitionConfigurator
              onDataChanged={refreshActiveSummary}
              onOpenDynamicWorld={onOpenDynamicWorld}
              externalNavRequest={navRequest}
              refreshNonce={refreshNonce}
              onActiveVersionChange={(meta) => setViewedVersionMeta(meta)}
              onViewStateChange={(mode) => {
                if (activeSection === 'overview' || activeSection === 'wizard') {
                  setActiveSection(mode === 'dashboard' ? 'overview' : 'wizard');
                }
              }}
              onManageCatalog={(cid) => {
                setSelectedCompanyId(cid || activeWorld?.ownerCompanyId || '');
                setActiveSection('products');
              }}
              onManageCompanies={() => setActiveSection('company')}
            />

            {/* Phase 8 Revision: Permanent Empty Booth Management integrated directly into Admin Tổng quan */}
            {activeSection === 'overview' && (
              <div style={{ marginTop: 20 }}>
                <EmptyBoothManager
                  exhibitionId={activeWorld?.exhibitionId}
                  versionId={activeWorld?.versionId}
                  onWorldUpdated={() => {
                    setRefreshNonce((n) => n + 1);
                    void refreshActiveSummary();
                  }}
                />
              </div>
            )}
          </div>

          {/* Phase 5: Admin Reward Redemption Verification Workspace */}
          {activeSection === 'rewards' && (
            <RewardRedemptionAdmin activeVersionId={activeWorld?.versionId} />
          )}

          {/* Dedicated In-Page Product Catalog Workspace (Replaces Giant Popup) */}
          {activeSection === 'products' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#526071' }}>
                  Mẹo: Bạn cũng có thể sửa, thay hoặc gắn sản phẩm trực tiếp trong từng gian tại mục <strong>Tổng quan</strong>.
                </div>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => {
                    setActiveSection('overview');
                    setNavRequest((r) => ({ mode: 'dashboard', nonce: r.nonce + 1 }));
                    setRefreshNonce((n) => n + 1);
                    void refreshActiveSummary();
                  }}
                >
                  ← Về Tổng quan
                </button>
              </div>
              <ProductCatalog initialCompanyId={selectedCompanyId || activeWorld?.ownerCompanyId || ''} />
            </div>
          )}

          {/* Dedicated In-Page Single-Business Owner Workspace + Collapsible Historical Records (Replaces Giant Popup) */}
          {activeSection === 'company' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="v28-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {activeWorld?.ownerCompany?.logoUrl && !logoFailed ? (
                    <img
                      src={activeWorld.ownerCompany.logoUrl}
                      alt={activeWorld.ownerCompany.name}
                      onError={() => setLogoFailed(true)}
                      style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'contain', background: '#f8fafc', border: '1px solid rgba(17,24,39,0.1)', padding: 4 }}
                    />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>
                      {(activeWorld?.ownerCompany?.name || 'E').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#526071' }}>Doanh nghiệp sở hữu triển lãm (1 doanh nghiệp duy nhất)</div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#111827' }}>
                      {activeWorld?.ownerCompany?.name || 'Chưa xác định doanh nghiệp sở hữu'}
                    </div>
                    <div style={{ fontSize: 13, color: '#0284c7', marginTop: 2 }}>
                      {activeWorld?.ownerCompany?.contactUrl || 'Chưa có URL website'}
                      {activeWorld?.ownerCompany?.contactEmail ? ` · ${activeWorld.ownerCompany.contactEmail}` : ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => {
                    setActiveSection('overview');
                    setNavRequest((r) => ({ mode: 'dashboard', nonce: r.nonce + 1 }));
                    setRefreshNonce((n) => n + 1);
                    void refreshActiveSummary();
                  }}
                >
                  ← Về Tổng quan
                </button>
              </div>

              <details className="v28-advanced-details" open={!activeWorld?.ownerCompany}>
                <summary>Quản trị hồ sơ doanh nghiệp (Chỉnh sửa thông tin / Hồ sơ lịch sử)</summary>
                <div style={{ marginTop: 14 }}>
                  <CompanyManagement
                    onSelectCompanyForCatalog={(cid) => {
                      setSelectedCompanyId(cid);
                      setActiveSection('products');
                    }}
                  />
                </div>
              </details>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
