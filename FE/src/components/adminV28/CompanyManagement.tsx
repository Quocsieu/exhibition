import React, { useCallback, useEffect, useState } from 'react';
import { v28Api, type V28BoothSummary, type V28Company } from '../../services/v28Api';

export interface CompanyManagementProps {
  onSelectCompanyForCatalog?: (companyId: string) => void;
}

export const CompanyManagement: React.FC<CompanyManagementProps> = ({
  onSelectCompanyForCatalog,
}) => {
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailBooths, setDetailBooths] = useState<V28BoothSummary[] | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    category: 'Công nghệ',
    description: '',
    contactEmail: '',
    contactUrl: '',
    logoUrl: '',
    bannerUrl: '',
  });

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await v28Api.listCompanies({ q: search.trim() || undefined, status: statusFilter });
      setCompanies(res.companies);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const resetForm = () => {
    setEditingId(null);
    setDetailBooths(null);
    setForm({
      name: '',
      slug: '',
      category: 'Công nghệ',
      description: '',
      contactEmail: '',
      contactUrl: '',
      logoUrl: '',
      bannerUrl: '',
    });
  };

  const handleSelectEdit = async (company: V28Company) => {
    setEditingId(company.id);
    setForm({
      name: company.name,
      slug: company.slug,
      category: company.category,
      description: company.description,
      contactEmail: company.contactEmail,
      contactUrl: company.contactUrl,
      logoUrl: company.logoUrl,
      bannerUrl: company.bannerUrl,
    });
    try {
      const detail = await v28Api.getCompany(company.id);
      setDetailBooths(detail.company.booths);
    } catch {
      setDetailBooths([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await v28Api.updateCompany(editingId, {
          name: form.name,
          slug: form.slug || undefined,
          category: form.category,
          description: form.description,
          contactEmail: form.contactEmail,
          contactUrl: form.contactUrl,
          logoUrl: form.logoUrl,
          bannerUrl: form.bannerUrl,
        });
        setNotice('Đã cập nhật thông tin doanh nghiệp.');
      } else {
        await v28Api.createCompany({
          name: form.name,
          slug: form.slug || undefined,
          category: form.category,
          description: form.description,
          contactEmail: form.contactEmail,
          contactUrl: form.contactUrl,
          logoUrl: form.logoUrl,
          bannerUrl: form.bannerUrl,
        });
        setNotice('Đã thêm doanh nghiệp mới vào cơ sở dữ liệu V28.');
        resetForm();
      }
      await loadCompanies();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleStatus = async (company: V28Company) => {
    setError(null);
    setNotice(null);
    const nextStatus = company.status === 'active' ? 'inactive' : 'active';
    try {
      await v28Api.updateCompany(company.id, { status: nextStatus });
      setNotice(
        nextStatus === 'inactive'
          ? `Đã vô hiệu hóa doanh nghiệp "${company.name}" (dữ liệu gian hàng & sản phẩm vẫn được bảo toàn).`
          : `Đã kích hoạt lại doanh nghiệp "${company.name}".`
      );
      await loadCompanies();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <section className="dashboard-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Danh sách Doanh nghiệp ({companies.length})</h3>
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            + Doanh nghiệp mới
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Tìm theo tên, slug, ngành hàng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã vô hiệu hóa</option>
          </select>
        </div>

        {loading && <p>Đang tải danh sách doanh nghiệp...</p>}
        {!loading && companies.length === 0 && <p>Chưa có doanh nghiệp phù hợp bộ lọc.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
          {companies.map((c) => (
            <div
              key={c.id}
              style={{
                padding: 12,
                borderRadius: 10,
                border: editingId === c.id ? '1.5px solid #0ea5e9' : '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(15, 23, 42, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{c.name}</strong>
                <span
                  style={{
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: c.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                    color: c.status === 'active' ? '#34d399' : '#f87171',
                  }}
                >
                  {c.status === 'active' ? 'Hoạt động' : 'Vô hiệu hóa'}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {c.category} · slug: <code>{c.slug}</code> · {c.boothCount ?? 0} gian hàng · {c.productCount ?? 0} sản phẩm
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => void handleSelectEdit(c)}>
                  Sửa / Xem gian
                </button>
                {onSelectCompanyForCatalog && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onSelectCompanyForCatalog(c.id)}
                  >
                    Kho SP ({c.productCount ?? 0})
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => void handleToggleStatus(c)}>
                  {c.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-card">
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Chỉnh sửa Doanh nghiệp' : 'Thêm Doanh nghiệp mới'}</h3>
        {error && <div style={{ color: '#f87171', marginBottom: 10 }}>{error}</div>}
        {notice && <div style={{ color: '#34d399', marginBottom: 10 }}>{notice}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Tên doanh nghiệp *
            <input
              type="text"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Slug (tùy chọn)
              <input
                type="text"
                placeholder="tu-dong-tao-neu-trong"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
            <label>
              Ngành hàng
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
          </div>
          <label>
            Mô tả doanh nghiệp
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Email liên hệ
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </label>
            <label>
              Website liên hệ
              <input
                type="url"
                placeholder="https://..."
                value={form.contactUrl}
                onChange={(e) => setForm({ ...form, contactUrl: e.target.value })}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Lưu cập nhật' : 'Tạo doanh nghiệp'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Hủy chọn
              </button>
            )}
          </div>
        </form>

        {editingId && detailBooths && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
            <h4 style={{ margin: '0 0 8px' }}>Gian hàng thuộc doanh nghiệp ({detailBooths.length})</h4>
            {detailBooths.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.75 }}>Doanh nghiệp chưa sở hữu gian hàng nào.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {detailBooths.map((b) => (
                  <li key={b.id}>
                    <strong>{b.name}</strong> (<code>{b.id}</code>) — {b.status === 'active' ? 'Đang trưng bày' : 'Lưu trữ'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
