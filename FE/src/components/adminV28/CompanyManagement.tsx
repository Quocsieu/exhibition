import React, { useCallback, useEffect, useState } from 'react';
import {
  v28Api,
  type V28Company,
  type V28OwnerCompanyState,
} from '../../services/v28Api';

export interface CompanyManagementProps {
  exhibitionId?: string;
  onSelectCompanyForCatalog?: (companyId: string) => void;
  onOwnerChanged?: (company: V28Company | null) => void;
}

function getSafeHttpUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const CompanyManagement: React.FC<CompanyManagementProps> = ({
  exhibitionId,
  onSelectCompanyForCatalog,
  onOwnerChanged,
}) => {
  const [ownerState, setOwnerState] = useState<V28OwnerCompanyState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isReplacing, setIsReplacing] = useState<boolean>(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState<boolean>(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [logoBroken, setLogoBroken] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    category: 'Thương mại & Triển lãm',
    description: '',
    contactEmail: '',
    contactPhone: '',
    contactUrl: '',
    logoUrl: '',
    bannerUrl: '',
  });

  const resetBlankForm = useCallback(() => {
    setForm({
      name: '',
      slug: '',
      category: 'Thương mại & Triển lãm',
      description: '',
      contactEmail: '',
      contactPhone: '',
      contactUrl: '',
      logoUrl: '',
      bannerUrl: '',
    });
  }, []);

  const populateFormFromCompany = useCallback((company: V28Company) => {
    setForm({
      name: company.name || '',
      slug: company.slug || '',
      category: company.category || 'General',
      description: company.description || '',
      contactEmail: company.contactEmail || '',
      contactPhone: company.contactPhone || '',
      contactUrl: company.contactUrl || '',
      logoUrl: company.logoUrl || '',
      bannerUrl: company.bannerUrl || '',
    });
  }, []);

  const loadOwnerProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await v28Api.getOwnerCompany(exhibitionId);
      setOwnerState(res);
      setLogoBroken(false);
      if (res.state === 'bound' && res.company) {
        populateFormFromCompany(res.company);
      }
    } catch (err) {
      setError((err as Error).message || 'Không thể tải thông tin doanh nghiệp.');
    } finally {
      setLoading(false);
    }
  }, [exhibitionId, populateFormFromCompany]);

  useEffect(() => {
    void loadOwnerProfile();
  }, [loadOwnerProfile]);

  const handleCreateFirstCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await v28Api.createCompany({
        exhibitionId,
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        category: form.category.trim() || 'General',
        description: form.description.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        contactUrl: form.contactUrl.trim(),
        logoUrl: form.logoUrl.trim(),
        bannerUrl: form.bannerUrl.trim(),
      });
      setNotice('Đã tạo hồ sơ doanh nghiệp chủ sở hữu cho triển lãm.');
      setIsEditing(false);
      await loadOwnerProfile();
      onOwnerChanged?.(res.company);
    } catch (err) {
      setError((err as Error).message || 'Không thể tạo doanh nghiệp.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmExistingOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await v28Api.selectOwnerCompany({
        companyId: selectedCandidateId,
        exhibitionId,
      });
      setNotice(`Đã xác nhận và khóa cố định doanh nghiệp chủ sở hữu "${res.company?.name || ''}".`);
      setIsEditing(false);
      setOwnerState(res);
      if (res.company) {
        populateFormFromCompany(res.company);
      }
      onOwnerChanged?.(res.company);
    } catch (err) {
      setError((err as Error).message || 'Không thể xác nhận doanh nghiệp chủ sở hữu.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerState?.company) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const targetId = ownerState.company.id;
      const res = await v28Api.updateCompany(
        targetId,
        {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          category: form.category.trim() || 'General',
          description: form.description.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim(),
          contactUrl: form.contactUrl.trim(),
          logoUrl: form.logoUrl.trim(),
          bannerUrl: form.bannerUrl.trim(),
        },
        ownerState.exhibitionId || exhibitionId
      );
      setNotice('Đã lưu cập nhật thông tin doanh nghiệp thành công.');
      setIsEditing(false);
      await loadOwnerProfile();
      onOwnerChanged?.(res.company);
    } catch (err) {
      setError((err as Error).message || 'Lưu thông tin doanh nghiệp thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (ownerState?.company) {
      populateFormFromCompany(ownerState.company);
    }
    setError(null);
    setIsEditing(false);
    setIsReplacing(false);
    setReplaceConfirmed(false);
  };

  const handleOpenReplaceForm = () => {
    resetBlankForm();
    setError(null);
    setNotice(null);
    setIsEditing(false);
    setReplaceConfirmed(false);
    setIsReplacing(true);
  };

  const handleReplaceOwnerCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceConfirmed) {
      setError('Vui lòng tích xác nhận thay thế doanh nghiệp hiện tại trước khi lưu.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await v28Api.replaceOwnerCompany({
        exhibitionId: ownerState?.exhibitionId || exhibitionId,
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        category: form.category.trim() || 'General',
        description: form.description.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        contactUrl: form.contactUrl.trim(),
        logoUrl: form.logoUrl.trim(),
        bannerUrl: form.bannerUrl.trim(),
      });
      const prevLabel = res.previousCompanyName ? `"${res.previousCompanyName}"` : 'doanh nghiệp trước đó';
      setNotice(
        `Đã thay thế ${prevLabel} bằng doanh nghiệp mới "${res.company?.name || ''}". Dữ liệu lịch sử được lưu trữ an toàn và bản 3D đang xuất bản được giữ nguyên cho tới khi bạn xuất bản phiên bản mới.`
      );
      setIsReplacing(false);
      setReplaceConfirmed(false);
      await loadOwnerProfile();
      onOwnerChanged?.(res.company);
    } catch (err) {
      setError((err as Error).message || 'Thay thế doanh nghiệp thất bại.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !ownerState) {
    return (
      <section className="v28-card" style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: '#526071' }}>Đang tải hồ sơ doanh nghiệp...</p>
      </section>
    );
  }

  // ==========================================================================
  // STATE 1: EMPTY — One-Time Create Company Form
  // ==========================================================================
  if (!ownerState || ownerState.state === 'empty') {
    return (
      <section className="v28-card" data-testid="v28-single-company-create" style={{ padding: 22, maxWidth: 760 }}>
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 9px',
              borderRadius: 999,
              background: '#e0f2fe',
              color: '#0369a1',
              fontSize: 11.5,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Thiết lập 1 lần duy nhất
          </span>
          <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Tạo Doanh nghiệp sở hữu triển lãm</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#526071', lineHeight: 1.5 }}>
            Mỗi triển lãm độc lập gắn với một doanh nghiệp duy nhất. Sau khi khởi tạo, bạn có thể xem và chỉnh sửa thông tin doanh nghiệp tại trang này bất cứ lúc nào.
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}
        {notice && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            ✅ {notice}
          </div>
        )}

        <form onSubmit={handleCreateFirstCompany} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="v28-field">
            <span>Tên doanh nghiệp *</span>
            <input
              type="text"
              className="v28-input"
              required
              minLength={2}
              placeholder="VD: Công ty Cổ phần Nông Sản Việt"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Ngành hàng / Lĩnh vực</span>
              <input
                type="text"
                className="v28-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Slug định danh (tùy chọn)</span>
              <input
                type="text"
                className="v28-input"
                placeholder="tu-dong-tao-neu-de-trong"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Website chính thức</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://example.com"
                value={form.contactUrl}
                onChange={(e) => setForm({ ...form, contactUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Email liên hệ</span>
              <input
                type="email"
                className="v28-input"
                placeholder="contact@example.com"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Số điện thoại / Zalo doanh nghiệp</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="v28-input"
                placeholder="VD: 0901234567"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>URL Logo doanh nghiệp</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://example.com/logo.png"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>URL Ảnh bìa (Banner)</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://example.com/banner.jpg"
                value={form.bannerUrl}
                onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
              />
            </label>
          </div>

          <label className="v28-field">
            <span>Mô tả doanh nghiệp</span>
            <textarea
              className="v28-input"
              rows={3}
              placeholder="Giới thiệu ngắn gọn về doanh nghiệp và sản phẩm trưng bày..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" className="v28-btn v28-btn--primary" disabled={saving}>
              {saving ? 'Đang khởi tạo...' : '🏢 Tạo doanh nghiệp'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // ==========================================================================
  // STATE 2: ONE-TIME LEGACY OWNER SELECTION (Only when existing DB has multiple companies)
  // ==========================================================================
  if (ownerState.state === 'selection_required') {
    return (
      <section className="v28-card" data-testid="v28-single-company-confirm-legacy" style={{ padding: 22, maxWidth: 780 }}>
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 9px',
              borderRadius: 999,
              background: '#fef3c7',
              color: '#92400e',
              fontSize: 11.5,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Cần xác nhận 1 lần duy nhất
          </span>
          <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
            Chọn Doanh nghiệp chủ sở hữu duy nhất cho triển lãm
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#526071', lineHeight: 1.55 }}>
            Cơ sở dữ liệu hiện có nhiều bản ghi doanh nghiệp từ phiên bản trước. Vui lòng chọn xác nhận <strong>1 doanh nghiệp chủ sở hữu duy nhất</strong>. Sau khi xác nhận, hệ thống sẽ khóa sang chế độ một doanh nghiệp và bảo toàn nguyên vẹn toàn bộ dữ liệu cũ.
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleConfirmExistingOwner} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ownerState.candidateCompanies.map((c) => {
            const checked = selectedCandidateId === c.id;
            const isCurrentPublished = ownerState.currentPublishedOwnerId === c.id;
            return (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: checked ? '2px solid #0284c7' : '1px solid #e2e8f0',
                  background: checked ? '#f0f9ff' : '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="ownerCompanyCandidate"
                  value={c.id}
                  checked={checked}
                  onChange={() => setSelectedCandidateId(c.id)}
                  style={{ marginTop: 4 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14.5, color: '#0f172a' }}>{c.name}</strong>
                    <code style={{ fontSize: 11.5, color: '#475569' }}>{c.id}</code>
                    {isCurrentPublished && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#dcfce7',
                          color: '#166534',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Đang gắn trên bản xuất bản
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                    {c.category} · <strong>{c.boothCount}</strong> gian hàng đang hoạt động · <strong>{c.productCount}</strong> sản phẩm trong kho
                    {c.contactUrl ? ` · ${c.contactUrl}` : ''}
                  </div>
                </div>
              </label>
            );
          })}

          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="v28-btn v28-btn--primary"
              disabled={!selectedCandidateId || saving}
            >
              {saving ? 'Đang khóa chủ sở hữu...' : '🔒 Xác nhận doanh nghiệp hiện tại'}
            </button>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              disabled={saving}
              onClick={handleOpenReplaceForm}
            >
              🔄 Thay thế bằng doanh nghiệp mới
            </button>
          </div>
        </form>

        {isReplacing && (
          <form
            onSubmit={handleReplaceOwnerCompany}
            data-testid="v28-company-replace-form"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <h4 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
              Nhập thông tin Doanh nghiệp mới thay thế
            </h4>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>
              Toàn bộ các bản ghi doanh nghiệp và dữ liệu cũ sẽ được chuyển vào lưu trữ lịch sử an toàn (không bị xóa, không trộn sản phẩm sang doanh nghiệp mới). Bản triển lãm 3D đang xuất bản được giữ nguyên cho tới khi doanh nghiệp mới xuất bản phiên bản mới.
            </div>
            <label className="v28-field">
              <span>Tên doanh nghiệp mới *</span>
              <input
                type="text"
                className="v28-input"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="v28-field">
                <span>Ngành hàng / Lĩnh vực</span>
                <input
                  type="text"
                  className="v28-input"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </label>
              <label className="v28-field">
                <span>Website chính thức</span>
                <input
                  type="url"
                  className="v28-input"
                  placeholder="https://..."
                  value={form.contactUrl}
                  onChange={(e) => setForm({ ...form, contactUrl: e.target.value })}
                />
              </label>
              <label className="v28-field">
                <span>Số điện thoại / Zalo doanh nghiệp</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="v28-input"
                  placeholder="VD: 0901234567"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(e) => setReplaceConfirmed(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>Tôi xác nhận thiết lập doanh nghiệp mới làm chủ sở hữu hiện tại duy nhất và lưu trữ lịch sử các bản ghi cũ.</span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="v28-btn v28-btn--primary" disabled={saving || !replaceConfirmed}>
                {saving ? 'Đang thay thế...' : '🔄 Xác nhận thay thế'}
              </button>
              <button type="button" className="v28-btn v28-btn--secondary" disabled={saving} onClick={handleCancelEdit}>
                Hủy
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  // ==========================================================================
  // STATE 3: BOUND — Single Company Profile View & Inline Edit Form
  // ==========================================================================
  const company = ownerState.company!;
  const safeWebsite = getSafeHttpUrl(company.contactUrl);

  return (
    <section className="v28-card" data-testid="v28-single-company-profile" style={{ padding: 22, maxWidth: 820 }}>
      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          ✅ {notice}
        </div>
      )}

      {!isEditing && !isReplacing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {company.logoUrl && !logoBroken ? (
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  onError={() => setLogoBroken(true)}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 14,
                    objectFit: 'contain',
                    background: '#f8fafc',
                    border: '1px solid rgba(17,24,39,0.1)',
                    padding: 6,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 14,
                    background: '#e0f2fe',
                    color: '#0369a1',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 24,
                  }}
                >
                  {(company.name || 'E').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>
                  Doanh nghiệp sở hữu triển lãm
                </div>
                <h3 style={{ margin: '2px 0 4px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {company.name}
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: '#526071' }}>
                  <span>{company.category || 'General'}</span>
                  <span>·</span>
                  <span>Mã định danh: <code>{company.id}</code></span>
                  <span>·</span>
                  <span>Slug: <code>{company.slug}</code></span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="v28-btn v28-btn--primary"
                data-testid="v28-company-edit-btn"
                onClick={() => {
                  populateFormFromCompany(company);
                  setNotice(null);
                  setError(null);
                  setIsReplacing(false);
                  setIsEditing(true);
                }}
              >
                ✏️ Chỉnh sửa
              </button>
              <button
                type="button"
                className="v28-btn v28-btn--secondary"
                data-testid="v28-company-replace-btn"
                onClick={handleOpenReplaceForm}
              >
                🔄 Thay thế doanh nghiệp
              </button>
              {onSelectCompanyForCatalog && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => onSelectCompanyForCatalog(company.id)}
                >
                  📦 Kho sản phẩm ({company.productCount ?? 0})
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              padding: 14,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: 13,
            }}
          >
            <div>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Website chính thức</div>
              <div style={{ marginTop: 3, fontWeight: 600, color: '#0f172a', wordBreak: 'break-all' }}>
                {safeWebsite ? (
                  <a href={safeWebsite} target="_blank" rel="noreferrer" style={{ color: '#0284c7' }}>
                    {safeWebsite}
                  </a>
                ) : (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>Chưa cập nhật</span>
                )}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Email liên hệ</div>
              <div style={{ marginTop: 3, fontWeight: 600, color: '#0f172a' }}>
                {company.contactEmail || <span style={{ color: '#94a3b8', fontWeight: 400 }}>Chưa cập nhật</span>}
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Quy mô liên kết hiện tại</div>
              <div style={{ marginTop: 3, fontWeight: 700, color: '#0f172a' }}>
                {company.boothCount ?? 0} gian hàng · {company.productCount ?? 0} sản phẩm
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Mô tả doanh nghiệp
            </div>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 13.5,
                color: company.description ? '#1e293b' : '#94a3b8',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              {company.description || 'Chưa có mô tả chi tiết cho doanh nghiệp.'}
            </div>
          </div>
        </div>
      ) : isReplacing ? (
        <form onSubmit={handleReplaceOwnerCompany} data-testid="v28-company-replace-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
              Thay thế Doanh nghiệp hiện tại bằng Doanh nghiệp mới
            </h3>
            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
              Doanh nghiệp đang hoạt động: <strong>{company.name}</strong> (<code>{company.id}</code>)
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              fontSize: 13,
              color: '#92400e',
              lineHeight: 1.55,
            }}
          >
            <strong>Quy tắc bảo toàn dữ liệu khi thay thế:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>Hồ sơ <strong>{company.name}</strong> cùng toàn bộ {company.productCount ?? 0} sản phẩm và {company.boothCount ?? 0} gian hàng cũ được lưu trữ lịch sử an toàn (không bị xóa).</li>
              <li>Doanh nghiệp mới sẽ được cấp mã <code>companyId</code> mới độc lập, <strong>không trộn lẫn</strong> sản phẩm của doanh nghiệp cũ.</li>
              <li>Phiên bản triển lãm 3D đang công bố (nếu có) vẫn hoạt động bình thường cho đến khi doanh nghiệp mới xuất bản phiên bản mới.</li>
            </ul>
          </div>

          <label className="v28-field">
            <span>Tên doanh nghiệp mới *</span>
            <input
              type="text"
              className="v28-input"
              required
              minLength={2}
              placeholder="VD: Công ty Cổ phần Nông Sản Việt"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Ngành hàng / Lĩnh vực</span>
              <input
                type="text"
                className="v28-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Slug định danh (tùy chọn)</span>
              <input
                type="text"
                className="v28-input"
                placeholder="tu-dong-tao-neu-de-trong"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Website chính thức</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.contactUrl}
                onChange={(e) => setForm({ ...form, contactUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Email liên hệ</span>
              <input
                type="email"
                className="v28-input"
                placeholder="contact@..."
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Số điện thoại / Zalo doanh nghiệp</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="v28-input"
                placeholder="VD: 0901234567"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>URL Logo doanh nghiệp</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>URL Ảnh bìa (Banner)</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.bannerUrl}
                onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
              />
            </label>
          </div>

          <label className="v28-field">
            <span>Mô tả doanh nghiệp mới</span>
            <textarea
              className="v28-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={replaceConfirmed}
              onChange={(e) => setReplaceConfirmed(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              Tôi xác nhận thay thế <strong>{company.name}</strong> bằng doanh nghiệp mới này làm chủ sở hữu hiện tại duy nhất của triển lãm.
            </span>
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" className="v28-btn v28-btn--primary" disabled={saving || !replaceConfirmed}>
              {saving ? 'Đang thay thế...' : '🔄 Xác nhận thay thế doanh nghiệp'}
            </button>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              disabled={saving}
              onClick={handleCancelEdit}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSaveEdit} data-testid="v28-company-edit-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Chỉnh sửa thông tin Doanh nghiệp</h3>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Mã định danh cố định: <code>{company.id}</code> (giữ nguyên liên kết gian hàng &amp; sản phẩm)
              </div>
            </div>
          </div>

          <label className="v28-field">
            <span>Tên doanh nghiệp *</span>
            <input
              type="text"
              className="v28-input"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Ngành hàng / Lĩnh vực</span>
              <input
                type="text"
                className="v28-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Slug định danh</span>
              <input
                type="text"
                className="v28-input"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>Website chính thức</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.contactUrl}
                onChange={(e) => setForm({ ...form, contactUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Email liên hệ</span>
              <input
                type="email"
                className="v28-input"
                placeholder="contact@..."
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Số điện thoại / Zalo doanh nghiệp</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="v28-input"
                placeholder="VD: 0901234567"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label className="v28-field">
              <span>URL Logo doanh nghiệp</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>URL Ảnh bìa (Banner)</span>
              <input
                type="url"
                className="v28-input"
                placeholder="https://..."
                value={form.bannerUrl}
                onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
              />
            </label>
          </div>

          <label className="v28-field">
            <span>Mô tả doanh nghiệp</span>
            <textarea
              className="v28-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" className="v28-btn v28-btn--primary" disabled={saving}>
              {saving ? 'Đang lưu...' : '💾 Lưu'}
            </button>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              disabled={saving}
              onClick={handleCancelEdit}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
