import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import {
  resolveV28ProductImageUrl,
  v28Api,
  type V28ExhibitionVersionDetail,
} from '../services/v28Api';
import { ExhibitionConfigurator } from '../components/adminV28/ExhibitionConfigurator';
import { CompanyManagement } from '../components/adminV28/CompanyManagement';
import { ProductCatalog } from '../components/adminV28/ProductCatalog';
import { RewardRedemptionAdmin } from '../components/adminV28/RewardRedemptionAdmin';
import { AudioManagementPanel } from '../components/adminV28/AudioManagementPanel';
import { EmptyBoothManager } from '../components/adminV28/EmptyBoothManager';
import { V28SvgIcon } from '../components/v28/V28SvgIcon';
import './adminV28.css';

function computeBrandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GE';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export interface AdminV28PageProps {
  onOpenDynamicWorld: () => void;
  onOpenLegacyAdmin?: () => void;
}

export const AdminV28Page: React.FC<AdminV28PageProps> = ({
  onOpenDynamicWorld,
}) => {
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('expo_admin_token') || '');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [demoConfig, setDemoConfig] = useState<{ demoEnabled: boolean; label?: string; username?: string; password?: string }>({
    demoEnabled: false,
  });

  const [activeSection, setActiveSection] = useState<'overview' | 'wizard' | 'products' | 'company' | 'rewards' | 'audio'>('overview');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [boundOwnerName, setBoundOwnerName] = useState<string>('');
  const [boundOwnerLogoUrl, setBoundOwnerLogoUrl] = useState<string>('');
  const [logoLoadFailed, setLogoLoadFailed] = useState<boolean>(false);
  const [activeWorld, setActiveWorld] = useState<V28ExhibitionVersionDetail | null>(null);
  const [worldLoadError, setWorldLoadError] = useState<boolean>(false);
  const [viewedVersionMeta, setViewedVersionMeta] = useState<{
    exhibitionId?: string;
    versionId?: string;
    status: string;
    zones: number;
    booths: number;
    ownerName?: string;
  } | null>(null);
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
      const [worldRes, ownerRes] = await Promise.all([
        v28Api.getActiveWorld().catch(() => null),
        v28Api.getOwnerCompany().catch(() => null),
      ]);
      if (worldRes?.world) {
        setActiveWorld(worldRes.world);
      } else {
        setWorldLoadError(true);
      }
      if (ownerRes?.company) {
        setSelectedCompanyId(ownerRes.company.id);
        setBoundOwnerName(ownerRes.company.name);
        setBoundOwnerLogoUrl(ownerRes.company.logoUrl || worldRes?.world?.ownerCompany?.logoUrl || '');
        setLogoLoadFailed(false);
      } else if (worldRes?.world?.ownerCompany) {
        setBoundOwnerName(worldRes.world.ownerCompany.name || '');
        setBoundOwnerLogoUrl(worldRes.world.ownerCompany.logoUrl || '');
        setLogoLoadFailed(false);
      } else {
        setBoundOwnerName('');
        setBoundOwnerLogoUrl('');
        setLogoLoadFailed(false);
      }
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
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <V28SvgIcon name="warning" size={15} />
              <span>{authError}</span>
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

  const brandDisplayName =
    boundOwnerName.trim() ||
    activeWorld?.ownerCompany?.name?.trim() ||
    'Grand Expo';
  const resolvedBrandLogoUrl = resolveV28ProductImageUrl(
    boundOwnerLogoUrl || activeWorld?.ownerCompany?.logoUrl || ''
  );
  const brandInitials = computeBrandInitials(brandDisplayName);

  return (
    <div className="v28-admin-shell">
      {/* Left Minimal SaaS Sidebar Navigation — 3 Core Entries */}
      <aside
        aria-label="Điều hướng quản trị"
        className={`v28-sidebar ${mobileNavOpen ? '' : 'v28-sidebar--collapsed'}`}
      >
        <div>
          <div className="v28-brand" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                className="v28-brand-mark"
                style={
                  resolvedBrandLogoUrl && !logoLoadFailed
                    ? {
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        padding: 3,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }
                    : { flexShrink: 0 }
                }
              >
                {resolvedBrandLogoUrl && !logoLoadFailed ? (
                  <img
                    src={resolvedBrandLogoUrl}
                    alt={brandDisplayName}
                    onError={() => setLogoLoadFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />
                ) : (
                  brandInitials
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  className="v28-brand-title"
                  title={brandDisplayName}
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 165,
                  }}
                >
                  {brandDisplayName}
                </div>
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
                <V28SvgIcon name="dashboard" size={16} />
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
                <V28SvgIcon name="sparkles" size={16} />
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
                <V28SvgIcon name="gift" size={16} />
                <span>Đổi quà</span>
              </button>
              <button
                type="button"
                className={`v28-nav-item ${activeSection === 'audio' ? 'v28-nav-item--active' : ''}`}
                data-testid="v28-admin-nav-audio"
                onClick={() => {
                  setActiveSection('audio');
                  setMobileNavOpen(false);
                }}
              >
                <V28SvgIcon name="sparkles" size={16} />
                <span>Âm thanh & Giọng đọc</span>
              </button>
              <button
                type="button"
                className="v28-nav-item"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenDynamicWorld();
                }}
              >
                <V28SvgIcon name="globe" size={16} />
                <span>Xem triển lãm</span>
              </button>
            </nav>
          </div>
        </div>

        <div className="v28-sidebar-footer v28-nav-collapse">
          <button
            type="button"
            className="v28-btn v28-btn--danger"
            onClick={handleLogout}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <V28SvgIcon name="logout" size={15} />
            <span>Đăng xuất</span>
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
                      : activeSection === 'audio'
                        ? 'Âm thanh & Giọng đọc'
                        : 'Tổng quan'}
            </h1>
            <div className="v28-topbar-meta">
              {viewedVersionMeta
                ? `${boundOwnerName || viewedVersionMeta.ownerName ? `${boundOwnerName || viewedVersionMeta.ownerName} · ` : ''}${viewedVersionMeta.zones} khu · ${viewedVersionMeta.booths} gian`
                : activeWorld
                  ? `${boundOwnerName || activeWorld.ownerCompany?.name ? `${boundOwnerName || activeWorld.ownerCompany?.name} · ` : ''}${activeWorld.zones.length} khu · ${activeWorld.booths.length} gian`
                  : worldLoadError
                    ? 'Chưa có phiên bản triển lãm xuất bản'
                    : 'Đang tải thông tin triển lãm...'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(viewedVersionMeta || activeWorld) && (
              <span className="v28-status-pill">
                ● Đang hoạt động
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

            {/* Phase 8 Revision: Permanent Empty Booth Management synchronized strictly with currently viewed version */}
            {activeSection === 'overview' && (
              <div style={{ marginTop: 16 }}>
                <EmptyBoothManager
                  exhibitionId={viewedVersionMeta?.exhibitionId || activeWorld?.exhibitionId}
                  versionId={viewedVersionMeta?.versionId || activeWorld?.versionId}
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

          {/* Admin Voice & Audio Management Workspace */}
          {activeSection === 'audio' && <AudioManagementPanel activeWorld={activeWorld} />}

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

          {/* Dedicated In-Page Single-Business Owner Workspace */}
          {activeSection === 'company' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#526071' }}>
                  Quản lý hồ sơ doanh nghiệp duy nhất sở hữu triển lãm hiện tại.
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

              <CompanyManagement
                exhibitionId={activeWorld?.exhibitionId}
                onSelectCompanyForCatalog={(cid) => {
                  setSelectedCompanyId(cid);
                  setActiveSection('products');
                }}
                onOwnerChanged={(comp) => {
                  if (comp) {
                    setSelectedCompanyId(comp.id);
                    setBoundOwnerName(comp.name);
                  }
                  setRefreshNonce((n) => n + 1);
                  void refreshActiveSummary();
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
