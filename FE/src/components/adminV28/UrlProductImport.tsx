import React, { useEffect, useMemo, useState } from 'react';
import {
  v28Api,
  type V28BoothSummary,
  type V28Company,
  type V28Product,
} from '../../services/v28Api';

const SLOT_IDS = ['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06'] as const;

export interface UrlProductImportProps {
  onDataChanged?: () => void;
  onOpenDynamicWorld?: () => void;
}

export const UrlProductImport: React.FC<UrlProductImportProps> = ({
  onDataChanged,
  onOpenDynamicWorld,
}) => {
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [booths, setBooths] = useState<V28BoothSummary[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [boothId, setBoothId] = useState<string>('');
  const [slotId, setSlotId] = useState<string>('');

  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [extracting, setExtracting] = useState<boolean>(false);
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [discoverNote, setDiscoverNote] = useState<string>('');
  const [discoveredItems, setDiscoveredItems] = useState<
    Array<{
      selected: boolean;
      name: string;
      sku: string;
      price: number;
      currency: string;
      description: string;
      images: string[];
      sourceUrl: string;
      inStock: boolean;
      alreadyInCatalog: boolean;
      assignSlot: string;
    }>
  >([]);
  const [batchSavedCount, setBatchSavedCount] = useState<number>(0);
  const [extractError, setExtractError] = useState<string>('');
  const [duplicateWarn, setDuplicateWarn] = useState<string>('');
  const [showEditor, setShowEditor] = useState<boolean>(false);

  // Editable draft fields (empty by default — NEVER fabricated when source site omits data)
  const [name, setName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [currency, setCurrency] = useState<string>('VND');
  const [description, setDescription] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [inStock, setInStock] = useState<boolean>(true);

  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>('');
  const [savedResult, setSavedResult] = useState<{
    product: V28Product;
    assignedBoothName?: string;
    assignedSlotId?: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([v28Api.listCompanies({ status: 'active' }), v28Api.listBooths()])
      .then(([compRes, boothRes]) => {
        setCompanies(compRes.companies);
        setBooths(boothRes.booths);
        if (compRes.companies.length > 0) {
          setCompanyId((prev) => prev || compRes.companies[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const ownedBooths = useMemo(
    () => booths.filter((b) => !b.companyId || b.companyId === companyId),
    [booths, companyId]
  );

  useEffect(() => {
    if (boothId && !ownedBooths.some((b) => b.id === boothId)) {
      setBoothId('');
      setSlotId('');
    }
  }, [boothId, ownedBooths]);

  const handleDiscoverWebsite = async () => {
    if (!companyId || !sourceUrl.trim()) return;
    setDiscovering(true);
    setExtractError('');
    setDiscoverNote('');
    setDiscoveredItems([]);
    setBatchSavedCount(0);
    setSavedResult(null);
    try {
      const res = await v28Api.discoverWebsiteProducts({
        companyId,
        url: sourceUrl.trim(),
        maxPages: 6,
      });
      setDiscoverNote(res.note);
      if (res.discoveredProducts.length === 0) {
        setShowEditor(true);
      } else {
        setDiscoveredItems(
          res.discoveredProducts.map((item, idx) => ({
            ...item,
            selected: !item.alreadyInCatalog,
            assignSlot: idx < SLOT_IDS.length ? SLOT_IDS[idx] : '',
          }))
        );
      }
    } catch (err) {
      setExtractError(
        `${(err as Error).message || 'Không thể quét website nguồn.'} Bạn vẫn có thể nhập thông tin sản phẩm thủ công bên dưới.`
      );
      setShowEditor(true);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSaveDiscoveredBatch = async () => {
    if (!companyId) return;
    const chosen = discoveredItems.filter((it) => it.selected && it.name.trim().length >= 2);
    if (chosen.length === 0) {
      setSaveError('Vui lòng chọn ít nhất 1 sản phẩm để lưu vào Catalog.');
      return;
    }
    setSaving(true);
    setSaveError('');
    let okCount = 0;
    try {
      for (const item of chosen) {
        const { product } = await v28Api.createProduct({
          companyId,
          boothId: boothId || null,
          name: item.name.trim(),
          sku: item.sku.trim(),
          price: Math.max(0, Number(item.price) || 0),
          currency: item.currency || 'VND',
          description: item.description.trim(),
          images: item.images,
          sourceUrl: item.sourceUrl,
          inStock: item.inStock,
        });
        if (boothId && item.assignSlot) {
          await v28Api.assignSlot(boothId, item.assignSlot, product.id);
        }
        okCount++;
      }
      setBatchSavedCount(okCount);
      setDiscoveredItems([]);
      onDataChanged?.();
    } catch (err) {
      setSaveError((err as Error).message || 'Lưu danh sách sản phẩm thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleExtractPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !sourceUrl.trim()) return;
    setExtracting(true);
    setExtractError('');
    setDuplicateWarn('');
    setSavedResult(null);
    setSaveError('');
    try {
      const res = await v28Api.importProductFromUrl({
        companyId,
        boothId: boothId || undefined,
        url: sourceUrl.trim(),
        saveToCatalog: false,
      });
      setName(res.draft.name || '');
      setSku(res.draft.sku || '');
      setPrice(res.draft.price && res.draft.price > 0 ? String(res.draft.price) : '');
      setCurrency(res.draft.currency || 'VND');
      setDescription(res.draft.description || '');
      setImageUrl(res.draft.images?.[0] || '');
      setInStock(res.draft.inStock ?? true);
      if (res.duplicateWarning) {
        setDuplicateWarn(
          `Lưu ý: URL này đã từng được nhập cho doanh nghiệp (sản phẩm "${res.duplicateWarning.existingProductName}").`
        );
      }
      setShowEditor(true);
    } catch (err) {
      setExtractError(
        `${(err as Error).message || 'Không thể trích xuất từ website nguồn.'} Bạn vẫn có thể nhập thông tin sản phẩm thủ công bên dưới.`
      );
      setShowEditor(true);
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveToCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !name.trim()) {
      setSaveError('Vui lòng chọn doanh nghiệp và nhập tên sản phẩm.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSavedResult(null);
    try {
      const parsedPrice = price.trim() === '' ? 0 : Math.max(0, Number(price) || 0);
      const { product } = await v28Api.createProduct({
        companyId,
        boothId: boothId || null,
        name: name.trim(),
        sku: sku.trim(),
        price: parsedPrice,
        currency: currency || 'VND',
        description: description.trim(),
        images: imageUrl.trim() ? [imageUrl.trim()] : [],
        sourceUrl: sourceUrl.trim(),
        inStock,
      });

      let assignedBoothName: string | undefined;
      let assignedSlotId: string | undefined;
      if (boothId && slotId) {
        await v28Api.assignSlot(boothId, slotId, product.id);
        assignedBoothName = ownedBooths.find((b) => b.id === boothId)?.name || boothId;
        assignedSlotId = slotId;
      }

      setSavedResult({ product, assignedBoothName, assignedSlotId });
      onDataChanged?.();
    } catch (err) {
      setSaveError((err as Error).message || 'Lưu sản phẩm thất bại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 20,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>🔗 Nhập Sản phẩm từ URL Website bán hàng</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Bảo vệ SSRF, Private IP, DNS Rebinding, Redirect, Timeout 6s, giới hạn 1MB &amp; Rate Limit 15 lượt/phút. Không tự bịa thông tin nếu website không cung cấp.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowEditor(true);
              setExtractError('');
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ✏️ Nhập thủ công không qua URL
          </button>
        </div>

        <form onSubmit={handleExtractPreview} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#334155' }}>
            1. Doanh nghiệp sở hữu *
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#334155' }}>
            2. Gian hàng muốn gán (tuỳ chọn)
            <select
              value={boothId}
              onChange={(e) => {
                setBoothId(e.target.value);
                if (!e.target.value) setSlotId('');
              }}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="">-- Chỉ lưu vào Kho Sản phẩm (Catalog) --</option>
              {ownedBooths.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#334155' }}>
            3. Vị trí Slot trưng bày (1–6)
            <select
              value={slotId}
              disabled={!boothId}
              onChange={(e) => setSlotId(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: boothId ? '#fff' : '#f1f5f9',
              }}
            >
              <option value="">-- Chưa gán slot --</option>
              {SLOT_IDS.map((s, idx) => (
                <option key={s} value={s}>
                  Slot #{idx + 1} ({s})
                </option>
              ))}
            </select>
          </label>

          <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#334155' }}>
              4. Dán URL sản phẩm (HTTP/HTTPS công khai)
              <input
                type="url"
                placeholder="https://example.com/san-pham/may-loc-khong-khi"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                required
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
              />
            </label>
            <button
              type="button"
              onClick={handleDiscoverWebsite}
              disabled={discovering || extracting || !companyId || !sourceUrl.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13.5,
                minHeight: 42,
              }}
            >
              {discovering ? '⏳ Đang quét website...' : '🌐 Quét Website Tìm Sản phẩm'}
            </button>
            <button
              type="submit"
              disabled={extracting || discovering || !companyId}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#0ea5e9',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13.5,
                minHeight: 42,
              }}
            >
              {extracting ? '⏳ Đang trích xuất...' : '🔍 Trích xuất 1 trang SP'}
            </button>
          </div>
        </form>

        {discoverNote && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13 }}>
            ℹ️ {discoverNote}
          </div>
        )}
        {batchSavedCount > 0 && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: 13, fontWeight: 700 }}>
            ✅ Đã lưu thành công {batchSavedCount} sản phẩm vào Catalog{boothId ? ' & phân bổ vào các slot đã chọn' : ''}!
          </div>
        )}

        {extractError && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: 13 }}>
            ⚠️ {extractError}
          </div>
        )}
        {duplicateWarn && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#fefce8', border: '1px solid #fde047', color: '#854d0e', fontSize: 13 }}>
            ℹ️ {duplicateWarn}
          </div>
        )}
      </div>

      {/* Discovered Website Products Preview & Batch Allocation */}
      {discoveredItems.length > 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 18,
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>
              📦 Sản phẩm tìm thấy từ Website ({discoveredItems.filter((i) => i.selected).length} / {discoveredItems.length} được chọn)
            </strong>
            <button
              type="button"
              onClick={handleSaveDiscoveredBatch}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {saving ? '⏳ Đang lưu...' : `💾 Lưu ${discoveredItems.filter((i) => i.selected).length} SP đã chọn vào Catalog`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {discoveredItems.map((it, idx) => (
              <div
                key={`${it.sourceUrl}-${idx}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: it.selected ? '#f8fafc' : '#f1f5f9',
                  opacity: it.selected ? 1 : 0.65,
                }}
              >
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDiscoveredItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, selected: checked } : row))
                    );
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    value={it.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiscoveredItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, name: val } : row))
                      );
                    }}
                    style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                    <span>Giá: {it.price > 0 ? `${it.price.toLocaleString('vi-VN')} ${it.currency}` : 'Liên hệ'}</span>
                    <span>· URL: {it.sourceUrl}</span>
                    {it.alreadyInCatalog && <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ Đã có trong Catalog</span>}
                  </div>
                </div>
                {boothId && (
                  <select
                    value={it.assignSlot}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiscoveredItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, assignSlot: val } : row))
                      );
                    }}
                    style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                  >
                    <option value="">Chỉ lưu Catalog</option>
                    {SLOT_IDS.map((s, si) => (
                      <option key={s} value={s}>Gán Slot #{si + 1}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview & Confirm / Manual Edit Form */}
      {showEditor && (
        <form
          onSubmit={handleSaveToCatalog}
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
            👁️ Xem trước &amp; Chỉnh sửa trước khi lưu vào Catalog
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Tên sản phẩm *
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nhập tên sản phẩm thực tế..."
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Mã SKU (nếu có)
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="VD: SP-001"
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Giá niêm yết (để trống nếu liên hệ)
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Đơn vị tiền tệ
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              URL Hình ảnh sản phẩm
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
              />
            </label>

            {imageUrl.trim() && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={imageUrl.trim()}
                  alt={name || 'Preview'}
                  style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid #cbd5e1' }}
                  onError={(ev) => {
                    (ev.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span style={{ fontSize: 12, color: '#64748b' }}>Ảnh xem trước trích xuất từ URL nguồn</span>
              </div>
            )}

            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Mô tả sản phẩm
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết từ website nguồn..."
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', resize: 'vertical' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
              Đang còn hàng (In Stock)
            </label>
          </div>

          {saveError && (
            <div style={{ padding: 10, borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
              ⚠️ {saveError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {saving
                ? '⏳ Đang lưu...'
                : boothId && slotId
                  ? `💾 Lưu vào Catalog & Gán vào ${slotId}`
                  : '💾 Lưu sản phẩm vào Catalog'}
            </button>
          </div>
        </form>
      )}

      {savedResult && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 14,
            padding: 16,
            color: '#065f46',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <strong>✅ Đã lưu sản phẩm &ldquo;{savedResult.product.name}&rdquo; vào Catalog!</strong>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Mã sản phẩm: <code>{savedResult.product.id}</code>
              {savedResult.assignedBoothName && savedResult.assignedSlotId
                ? ` · Đã gán trực tiếp vào ${savedResult.assignedBoothName} (${savedResult.assignedSlotId}) & tự động đồng bộ World 3D V28.`
                : ' · Bạn có thể gán sản phẩm này vào bất kỳ slot (1–6) nào tại tab Dashboard & Quy hoạch.'}
            </div>
          </div>
          {onOpenDynamicWorld && (
            <button
              type="button"
              onClick={onOpenDynamicWorld}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🌐 Kiểm tra ngay tại World 3D V28
            </button>
          )}
        </div>
      )}
    </div>
  );
};
