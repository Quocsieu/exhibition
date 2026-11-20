import React, { useCallback, useEffect, useState } from 'react';
import {
  v28Api,
  type V28BoothPlacementView,
  type V28Product,
} from '../../services/v28Api';
import { formatCurrency } from '../ProductPanel';

export interface BoothInspectorPanelProps {
  booth: V28BoothPlacementView;
  isDraft: boolean;
  onClose: () => void;
  onAssignSlot: (boothId: string, slotId: string, productId: string) => Promise<void>;
  onProductMutated: () => Promise<void>;
  onRequestDeleteBooth?: (booth: V28BoothPlacementView) => void;
}

type InspectorSubMode = 'slots' | 'picker' | 'edit' | 'create' | 'import_url';

export const BoothInspectorPanel: React.FC<BoothInspectorPanelProps> = ({
  booth,
  isDraft,
  onClose,
  onAssignSlot,
  onProductMutated,
  onRequestDeleteBooth,
}) => {
  const [subMode, setSubMode] = useState<InspectorSubMode>('slots');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [panelError, setPanelError] = useState<string>('');
  const [panelNotice, setPanelNotice] = useState<string>('');

  // Paginated Product Picker state (strictly scoped to booth.companyId)
  const [pickerQuery, setPickerQuery] = useState<string>('');
  const [pickerPage, setPickerPage] = useState<number>(1);
  const [pickerTotalPages, setPickerTotalPages] = useState<number>(1);
  const [pickerTotal, setPickerTotal] = useState<number>(0);
  const [pickerItems, setPickerItems] = useState<V28Product[]>([]);
  const [pickerLoading, setPickerLoading] = useState<boolean>(false);

  // Edit / Create product form state
  const [editingProduct, setEditingProduct] = useState<V28Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    price: '0',
    currency: 'VND',
    description: '',
    imageUrl: '',
    sourceUrl: '',
  });
  const [urlInput, setUrlInput] = useState<string>('');

  // Reset contextual sub-state cleanly whenever the selected booth changes (prevents stale cross-booth leakage)
  useEffect(() => {
    setSubMode('slots');
    setActiveSlotId(null);
    setEditingProduct(null);
    setPanelError('');
    setPanelNotice('');
    setPickerQuery('');
    setPickerPage(1);
    setUrlInput('');
  }, [booth.boothId]);

  const pickerReqIdRef = React.useRef(0);
  const [brokenImgUrls, setBrokenImgUrls] = useState<Record<string, boolean>>({});

  const loadPickerProducts = useCallback(async () => {
    const reqId = ++pickerReqIdRef.current;
    if (!booth.companyId) {
      setPickerItems([]);
      setPickerTotal(0);
      setPickerTotalPages(1);
      return;
    }
    setPickerLoading(true);
    setPanelError('');
    try {
      const res = await v28Api.listProducts({
        companyId: booth.companyId,
        q: pickerQuery.trim() || undefined,
        status: 'active',
        page: pickerPage,
        limit: 8,
      });
      if (reqId !== pickerReqIdRef.current) return; // V28-AUDIT-016: drop stale out-of-order responses
      setPickerItems(res.items);
      setPickerTotal(res.total);
      setPickerTotalPages(Math.max(1, res.totalPages));
    } catch (e) {
      if (reqId !== pickerReqIdRef.current) return;
      setPanelError((e as Error).message || 'Không thể tải danh sách sản phẩm.');
    } finally {
      if (reqId === pickerReqIdRef.current) setPickerLoading(false);
    }
  }, [booth.companyId, pickerQuery, pickerPage]);

  useEffect(() => {
    if (subMode === 'picker') {
      void loadPickerProducts();
    }
  }, [subMode, loadPickerProducts]);

  const openPickerForSlot = (slotId: string) => {
    setActiveSlotId(slotId);
    setPanelError('');
    setPanelNotice('');
    setPickerPage(1);
    setSubMode('picker');
  };

  const openEditProduct = (product: V28Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku || '',
      price: String(product.price ?? 0),
      currency: product.currency || 'VND',
      description: product.description || '',
      imageUrl: product.images?.[0] || '',
      sourceUrl: product.sourceUrl || '',
    });
    setPanelError('');
    setPanelNotice('');
    setSubMode('edit');
  };

  const openCreateProduct = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      sku: '',
      price: '0',
      currency: 'VND',
      description: '',
      imageUrl: '',
      sourceUrl: '',
    });
    setPanelError('');
    setPanelNotice('');
    setSubMode('create');
  };

  const handlePickProduct = async (product: V28Product) => {
    if (!activeSlotId) return;
    setBusy(true);
    setPanelError('');
    try {
      await onAssignSlot(booth.boothId, activeSlotId, product.id);
      setPanelNotice(`Đã gắn "${product.name}" vào ${activeSlotId}.`);
      setSubMode('slots');
      setActiveSlotId(null);
    } catch (e) {
      setPanelError((e as Error).message || 'Không thể gắn sản phẩm vào vị trí.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearSlot = async (slotId: string) => {
    setBusy(true);
    setPanelError('');
    setPanelNotice('');
    try {
      await onAssignSlot(booth.boothId, slotId, '');
      setPanelNotice(`Đã gỡ sản phẩm khỏi ${slotId}.`);
    } catch (e) {
      setPanelError((e as Error).message || 'Không thể gỡ sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setPanelError('Giá sản phẩm phải là số không âm.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      // V28-AUDIT-018: Preserve secondary images[1..N] when editing primary imageUrl
      const secondaryImages = (editingProduct.images || []).slice(1);
      const nextImages = form.imageUrl.trim()
        ? [form.imageUrl.trim(), ...secondaryImages]
        : secondaryImages;
      await v28Api.updateProduct(editingProduct.id, {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: priceNum,
        currency: form.currency.trim() || 'VND',
        description: form.description.trim(),
        images: nextImages,
        sourceUrl: form.sourceUrl.trim(),
      });
      await onProductMutated();
      setPanelNotice(`Đã lưu thay đổi cho "${form.name.trim()}".`);
      setEditingProduct(null);
      setSubMode('slots');
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể cập nhật sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booth.companyId) {
      setPanelError('Gian hàng chưa có doanh nghiệp sở hữu.');
      return;
    }
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setPanelError('Giá sản phẩm phải là số không âm.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      const created = await v28Api.createProduct({
        companyId: booth.companyId,
        boothId: null,
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: priceNum,
        currency: form.currency.trim() || 'VND',
        description: form.description.trim(),
        images: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
        sourceUrl: form.sourceUrl.trim(),
      });
      setPanelNotice(`Đã thêm "${created.product.name}" vào kho sản phẩm. Chọn sản phẩm bên dưới để gắn vào vị trí.`);
      setPickerPage(1);
      setSubMode('picker');
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể tạo sản phẩm mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booth.companyId || !urlInput.trim()) return;
    setBusy(true);
    setPanelError('');
    try {
      const res = await v28Api.importFromUrl({
        companyId: booth.companyId,
        url: urlInput.trim(),
        saveToCatalog: true,
      });
      setUrlInput('');
      setPanelNotice(`Đã nhập "${res.product?.name || 'sản phẩm'}" từ URL vào kho. Chọn bên dưới để gắn vào slot.`);
      setPickerPage(1);
      setSubMode('picker');
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể nhập sản phẩm từ URL.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="v28-inspector" aria-label={`Quản lý gian hàng ${booth.boothName}`}>
      {/* Inspector Header */}
      <div className="v28-inspector-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0284c7' }}>
            {booth.zoneName} · {booth.assignedSlotCount}/6 sản phẩm
          </div>
          <h3 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {booth.boothName}
          </h3>
          <div style={{ fontSize: 12, color: '#526071', marginTop: 2 }}>
            {booth.companyName} · {booth.archetypeLabel}
          </div>
        </div>
        <button
          type="button"
          className="v28-btn v28-btn--secondary"
          onClick={onClose}
          aria-label="Đóng bảng chi tiết gian hàng"
          style={{ minHeight: 32, padding: '0 10px', flexShrink: 0 }}
        >
          ✕
        </button>
      </div>

      {panelError && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>
          ⚠️ {panelError}
        </div>
      )}
      {panelNotice && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 12.5 }}>
          ✓ {panelNotice}
        </div>
      )}

      {/* VIEW 1: 6 DISPLAY SLOTS */}
      {subMode === 'slots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13.5, color: '#111827' }}>6 vị trí trưng bày sản phẩm</strong>
            <span style={{ fontSize: 12, color: '#526071', fontVariantNumeric: 'tabular-nums' }}>
              {booth.assignedSlotCount}/6 đã gắn
            </span>
          </div>

          {booth.slots.map((slot, idx) => {
            const prod = slot.product;
            return (
              <div
                key={slot.slotId}
                className={`v28-slot-row ${prod ? 'v28-slot-row--filled' : 'v28-slot-row--empty'}`}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  {prod?.images?.[0] && !brokenImgUrls[prod.images[0]] ? (
                    <img
                      src={prod.images[0]}
                      alt={prod.name}
                      onError={() =>
                        setBrokenImgUrls((prev) => ({ ...prev, [prod.images[0]]: true }))
                      }
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(17,24,39,0.1)', flexShrink: 0, background: '#f8fafc' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: prod ? '#e0f2fe' : '#f1f5f9',
                        color: prod ? '#0369a1' : '#94a3b8',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      #{idx + 1}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#526071', textTransform: 'uppercase' }}>
                      {slot.slotId}
                    </div>
                    {prod ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {prod.name}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                          {prod.price > 0 ? formatCurrency(prod.price, prod.currency) : 'Liên hệ báo giá'}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chưa có sản phẩm</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {prod ? (
                    <>
                      <button
                        type="button"
                        className="v28-btn v28-btn--secondary"
                        disabled={busy}
                        onClick={() => openEditProduct(prod)}
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="v28-btn v28-btn--secondary"
                        disabled={busy}
                        onClick={() => openPickerForSlot(slot.slotId)}
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                      >
                        Thay
                      </button>
                      <button
                        type="button"
                        className="v28-btn v28-btn--danger"
                        disabled={busy}
                        onClick={() => void handleClearSlot(slot.slotId)}
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                      >
                        Gỡ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="v28-btn v28-btn--primary"
                      disabled={busy}
                      onClick={() => openPickerForSlot(slot.slotId)}
                      style={{ minHeight: 32, padding: '0 12px', fontSize: 12.5, width: '100%' }}
                    >
                      + Gắn sản phẩm
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {onRequestDeleteBooth && (
            <div style={{ borderTop: '1px solid rgba(17,24,39,0.08)', paddingTop: 12, marginTop: 4 }}>
              <button
                type="button"
                className="v28-btn v28-btn--danger"
                disabled={!isDraft}
                title={isDraft ? 'Xóa gian hàng khỏi bản Draft' : 'Chỉ xóa được gian khi đang ở bản Draft'}
                onClick={() => onRequestDeleteBooth(booth)}
                style={{ width: '100%', minHeight: 36, fontSize: 12.5, opacity: isDraft ? 1 : 0.5 }}
              >
                🗑️ Xóa gian hàng khỏi bản nháp
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: INLINE PRODUCT PICKER */}
      {subMode === 'picker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13.5, color: '#111827' }}>
              Chọn sản phẩm cho {activeSlotId}
            </strong>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={() => setSubMode('slots')}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
            >
              ← 6 vị trí
            </button>
          </div>

          <input
            type="text"
            className="v28-input"
            placeholder="Tìm theo tên, SKU..."
            value={pickerQuery}
            onChange={(e) => {
              setPickerQuery(e.target.value);
              setPickerPage(1);
            }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={openCreateProduct}
              style={{ flex: 1, minHeight: 32, padding: '0 8px', fontSize: 12 }}
            >
              + Tạo SP mới
            </button>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={() => {
                setPanelError('');
                setSubMode('import_url');
              }}
              style={{ flex: 1, minHeight: 32, padding: '0 8px', fontSize: 12 }}
            >
              🌐 Nhập từ URL
            </button>
          </div>

          {pickerLoading ? (
            <div style={{ fontSize: 13, color: '#526071', padding: '12px 0' }}>Đang tải kho sản phẩm...</div>
          ) : pickerItems.length === 0 ? (
            <div style={{ fontSize: 13, color: '#526071', padding: '12px 0' }}>
              Chưa có sản phẩm phù hợp trong kho của {booth.companyName}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pickerItems.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 8,
                    borderRadius: 10,
                    border: '1px solid rgba(17,24,39,0.1)',
                    background: '#fff',
                  }}
                >
                  {p.images?.[0] ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 600 }}>
                      {p.price > 0 ? formatCurrency(p.price, p.currency) : 'Liên hệ báo giá'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="v28-btn v28-btn--primary"
                    disabled={busy}
                    onClick={() => void handlePickProduct(p)}
                    style={{ minHeight: 30, padding: '0 10px', fontSize: 12, flexShrink: 0 }}
                  >
                    Chọn
                  </button>
                </div>
              ))}
            </div>
          )}

          {pickerTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#526071' }}>
              <span>Trang {pickerPage}/{pickerTotalPages} ({pickerTotal} SP)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={pickerPage <= 1}
                  onClick={() => setPickerPage((p) => Math.max(1, p - 1))}
                  style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={pickerPage >= pickerTotalPages}
                  onClick={() => setPickerPage((p) => Math.min(pickerTotalPages, p + 1))}
                  style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: INLINE EDIT / CREATE PRODUCT FORM */}
      {(subMode === 'edit' || subMode === 'create') && (
        <form
          onSubmit={subMode === 'edit' ? handleSaveEdit : handleCreateProduct}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13.5, color: '#111827' }}>
              {subMode === 'edit' ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm mới'}
            </strong>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={() => setSubMode(subMode === 'create' ? 'picker' : 'slots')}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
            >
              Hủy
            </button>
          </div>

          <label className="v28-field">
            <span>Tên sản phẩm *</span>
            <input
              type="text"
              className="v28-input"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
            <label className="v28-field">
              <span>Giá *</span>
              <input
                type="number"
                className="v28-input"
                min={0}
                step="any"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Tiền tệ</span>
              <input
                type="text"
                className="v28-input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </label>
          </div>
          <label className="v28-field">
            <span>Mã SKU</span>
            <input
              type="text"
              className="v28-input"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </label>
          <label className="v28-field">
            <span>URL Hình ảnh</span>
            <input
              type="url"
              className="v28-input"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </label>
          <label className="v28-field">
            <span>URL Sản phẩm gốc</span>
            <input
              type="url"
              className="v28-input"
              placeholder="https://..."
              value={form.sourceUrl}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            />
          </label>
          <label className="v28-field">
            <span>Mô tả</span>
            <textarea
              className="v28-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="submit"
              className="v28-btn v28-btn--primary"
              disabled={busy}
              style={{ flex: 1 }}
            >
              {busy ? 'Đang lưu...' : subMode === 'edit' ? 'Lưu thay đổi' : 'Lưu vào kho'}
            </button>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={() => setSubMode(subMode === 'create' ? 'picker' : 'slots')}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* VIEW 4: INLINE URL IMPORT */}
      {subMode === 'import_url' && (
        <form onSubmit={handleImportUrl} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13.5, color: '#111827' }}>Nhập sản phẩm từ URL</strong>
            <button
              type="button"
              className="v28-btn v28-btn--secondary"
              onClick={() => setSubMode('picker')}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
            >
              ← Quay lại
            </button>
          </div>
          <label className="v28-field">
            <span>URL trang sản phẩm *</span>
            <input
              type="url"
              className="v28-input"
              required
              placeholder="https://example.com/san-pham..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="v28-btn v28-btn--primary"
            disabled={busy || !urlInput.trim()}
          >
            {busy ? 'Đang trích xuất...' : '🌐 Trích xuất & lưu vào kho'}
          </button>
        </form>
      )}
    </aside>
  );
};
