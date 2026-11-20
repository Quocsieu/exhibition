import React, { useCallback, useEffect, useState } from 'react';
import {
  v28Api,
  type V28BoothSummary,
  type V28Company,
  type V28Product,
} from '../../services/v28Api';
import { formatCurrency } from '../ProductPanel';

export interface ProductCatalogProps {
  initialCompanyId?: string;
}

const SLOT_IDS = ['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06'] as const;

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ initialCompanyId = '' }) => {
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [booths, setBooths] = useState<V28BoothSummary[]>([]);
  const [products, setProducts] = useState<V28Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    price: '0',
    currency: 'VND',
    description: '',
    imageUrl: '',
    sourceUrl: '',
  });
  const [urlImportInput, setUrlImportInput] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);

  // Quick slot assignment state
  const [assigningProduct, setAssigningProduct] = useState<V28Product | null>(null);
  const [assignBoothId, setAssignBoothId] = useState('');
  const [assignSlotId, setAssignSlotId] = useState<string>('slot_01');

  useEffect(() => {
    if (initialCompanyId) {
      setCompanyId(initialCompanyId);
      setPage(1);
    }
  }, [initialCompanyId]);

  useEffect(() => {
    v28Api
      .listCompanies({ status: 'all' })
      .then((res) => {
        setCompanies(res.companies);
        if (!companyId && res.companies[0]) {
          setCompanyId(res.companies[0].id);
        }
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [prodRes, boothRes] = await Promise.all([
        v28Api.listProducts({
          companyId,
          q: search.trim() || undefined,
          status: statusFilter,
          page,
          limit: 12,
        }),
        v28Api.listBooths(companyId),
      ]);
      setProducts(prodRes.items);
      setTotal(prodRes.total);
      setTotalPages(prodRes.totalPages);
      setBooths(boothRes.booths.filter((b) => b.status === 'active'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyId, search, statusFilter, page]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      sku: '',
      price: '0',
      currency: 'VND',
      description: '',
      imageUrl: '',
      sourceUrl: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setError(null);
    setNotice(null);
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Giá sản phẩm phải là số không âm.');
      return;
    }
    try {
      if (editingId) {
        // V28-AUDIT-018: Preserve secondary images[1..N] when updating primary imageUrl
        const existingProd = products.find((p) => p.id === editingId);
        const secondaryImgs = (existingProd?.images || []).slice(1);
        const nextImgs = form.imageUrl.trim() ? [form.imageUrl.trim(), ...secondaryImgs] : secondaryImgs;
        await v28Api.updateProduct(editingId, {
          name: form.name,
          sku: form.sku,
          price: priceNum,
          currency: form.currency,
          description: form.description,
          images: nextImgs,
          sourceUrl: form.sourceUrl,
        });
        setNotice('Đã cập nhật sản phẩm trong kho (không làm gián đoạn slot đang trưng bày).');
      } else {
        await v28Api.createProduct({
          companyId,
          boothId: null, // Independent from booth!
          name: form.name,
          sku: form.sku,
          price: priceNum,
          currency: form.currency,
          description: form.description,
          images: form.imageUrl ? [form.imageUrl] : [],
          sourceUrl: form.sourceUrl,
        });
        setNotice('Đã thêm sản phẩm độc lập vào kho doanh nghiệp.');
        resetForm();
      }
      await loadCatalog();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleImportUrl = async () => {
    if (!companyId || !urlImportInput.trim()) return;
    setUrlImporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await v28Api.importFromUrl({
        companyId,
        url: urlImportInput.trim(),
        saveToCatalog: true,
      });
      setNotice(`Đã nhập sản phẩm "${res.product?.name || ''}" từ URL vào kho doanh nghiệp.`);
      setUrlImportInput('');
      await loadCatalog();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUrlImporting(false);
    }
  };

  const handleAssignToSlot = async () => {
    if (!assigningProduct || !assignBoothId) return;
    setError(null);
    setNotice(null);
    try {
      await v28Api.assignSlot(assignBoothId, assignSlotId, assigningProduct.id);
      setNotice(`Đã gắn "${assigningProduct.name}" vào ${assignSlotId} của gian hàng ${assignBoothId}.`);
      setAssigningProduct(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="dashboard-card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Doanh nghiệp:</strong>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setPage(1);
                resetForm();
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.productCount ?? 0} SP)
                </option>
              ))}
            </select>
          </label>
          <input
            type="text"
            placeholder="Tìm theo tên, SKU, mô tả..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
              setPage(1);
            }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang bán</option>
            <option value="inactive">Ngừng hiển thị</option>
          </select>
        </div>

        {/* URL Import into independent Company Catalog */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            type="url"
            placeholder="Nhập URL sản phẩm website bán hàng để lưu thẳng vào kho doanh nghiệp..."
            value={urlImportInput}
            onChange={(e) => setUrlImportInput(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={urlImporting || !urlImportInput.trim()}
            onClick={() => void handleImportUrl()}
          >
            {urlImporting ? 'Đang trích xuất URL...' : '🌐 Nhập từ URL'}
          </button>
        </div>

        {error && <div style={{ color: '#b91c1c', fontWeight: 600, marginTop: 10 }}>{error}</div>}
        {notice && <div style={{ color: '#047857', fontWeight: 600, marginTop: 10 }}>{notice}</div>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
        <section className="dashboard-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>
              Kho sản phẩm ({total}) — Trang {page}/{totalPages}
            </h3>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              + Thêm SP mới
            </button>
          </div>

          {loading && <p>Đang tải kho sản phẩm...</p>}
          {!loading && products.length === 0 && (
            <p style={{ opacity: 0.75 }}>Chưa có sản phẩm nào trong kho của doanh nghiệp này.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {products.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: editingId === p.id ? '1.5px solid #0284c7' : '1px solid rgba(17,24,39,0.12)',
                  background: editingId === p.id ? '#f0f9ff' : '#f8fafc',
                  color: '#111827',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{p.name}</strong>
                  <span style={{ color: '#b45309', fontWeight: 700 }}>
                    {formatCurrency(p.price, p.currency)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                  SKU: <code>{p.sku || '(chưa có)'}</code> · Trạng thái: {p.status === 'active' ? 'Hoạt động' : 'Vô hiệu'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingId(p.id);
                      setForm({
                        name: p.name,
                        sku: p.sku,
                        price: String(p.price),
                        currency: p.currency,
                        description: p.description,
                        imageUrl: p.images?.[0] || '',
                        sourceUrl: p.sourceUrl,
                      });
                    }}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={booths.length === 0}
                    onClick={() => {
                      setAssigningProduct(p);
                      setAssignBoothId(booths[0]?.id || '');
                    }}
                  >
                    Gắn vào Slot 3D
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      try {
                        setError('');
                        await v28Api.updateProduct(p.id, {
                          status: p.status === 'active' ? 'inactive' : 'active',
                        });
                        await loadCatalog();
                      } catch (err) {
                        setError((err as Error).message || 'Không thể cập nhật trạng thái sản phẩm.');
                      }
                    }}
                  >
                    {p.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Trang trước
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Trang sau →
              </button>
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h3 style={{ marginTop: 0 }}>
            {editingId ? 'Sửa sản phẩm trong Catalog' : 'Tạo sản phẩm mới (không cần chọn gian hàng)'}
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
              Tên sản phẩm *
              <input
                type="text"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>
              <label>
                SKU
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </label>
              <label>
                Giá bán *
                <input
                  type="number"
                  min={0}
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label>
                Tiền tệ
                <input
                  type="text"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </label>
            </div>
            <label>
              URL Hình ảnh
              <input
                type="url"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </label>
            <label>
              URL Trang sản phẩm
              <input
                type="url"
                placeholder="https://..."
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              />
            </label>
            <label>
              Mô tả
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Lưu cập nhật' : 'Lưu vào Kho sản phẩm'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Hủy
                </button>
              )}
            </div>
          </form>

          {assigningProduct && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid #0ea5e9' }}>
              <h4 style={{ margin: '0 0 8px' }}>
                Gắn "{assigningProduct.name}" vào Slot 3D
              </h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={assignBoothId} onChange={(e) => setAssignBoothId(e.target.value)}>
                  {booths.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
                <select value={assignSlotId} onChange={(e) => setAssignSlotId(e.target.value)}>
                  {SLOT_IDS.map((sid) => (
                    <option key={sid} value={sid}>
                      {sid}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary" onClick={() => void handleAssignToSlot()}>
                  Xác nhận gắn
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAssigningProduct(null)}>
                  Đóng
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
