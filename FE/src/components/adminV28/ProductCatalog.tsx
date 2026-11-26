import React, { useCallback, useEffect, useState } from 'react';
import {
  formatV28ProductPrice,
  resolveV28ProductImageUrl,
  v28Api,
  type V28BoothSummary,
  type V28Company,
  type V28CompanyMismatchWarning,
  type V28Product,
  type V28ProductPriceStatus,
  type V28WebsiteCheckpointInfo,
  type V28WebsiteDiscoveryStats,
  type V28WebsiteDiscoveryStatus,
} from '../../services/v28Api';
import {
  mapRawDiscoveredItemsToEditable,
  validatePreviewProductItem,
  WebsiteProductPreviewPanel,
  type EditableDiscoveredProductItem,
} from './WebsiteProductPreviewPanel';

export interface ProductCatalogProps {
  initialCompanyId?: string;
}

const SLOT_IDS = ['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06'] as const;

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ initialCompanyId = '' }) => {
  const [ownerCompany, setOwnerCompany] = useState<V28Company | null>(null);
  const [exhibitionId, setExhibitionId] = useState<string>('');
  const [ownerStatus, setOwnerStatus] = useState<'loading' | 'empty' | 'selection_required' | 'bound'>('loading');
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [booths, setBooths] = useState<V28BoothSummary[]>([]);
  const [slotAssignments, setSlotAssignments] = useState<Array<{ boothId: string; slotId: string; productId: string }>>([]);
  const [products, setProducts] = useState<V28Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [brokenImgUrls, setBrokenImgUrls] = useState<Record<string, boolean>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    sku: string;
    priceStatus: 'listed' | 'contact';
    price: string;
    currency: string;
    category: string;
    description: string;
    imageUrl: string;
    sourceUrl: string;
  }>({
    name: '',
    sku: '',
    priceStatus: 'listed',
    price: '0',
    currency: 'VND',
    category: '',
    description: '',
    imageUrl: '',
    sourceUrl: '',
  });

  // Unified Website Discovery Preview state (Homepage / Category / Product Detail)
  const [urlImportInput, setUrlImportInput] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);
  const [resumingCheckpoint, setResumingCheckpoint] = useState(false);
  const [committingPreview, setCommittingPreview] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
  const [catalogWebsitePreview, setCatalogWebsitePreview] = useState<{
    forUrl: string;
    siteUrl: string;
    entryPageType?: string;
    discoveryStatus: V28WebsiteDiscoveryStatus;
    discoveryStats?: V28WebsiteDiscoveryStats;
    checkpoint?: V28WebsiteCheckpointInfo;
    companyMismatchWarning?: V28CompanyMismatchWarning | null;
    note: string;
    items: EditableDiscoveredProductItem[];
  } | null>(null);

  // Quick slot assignment state
  const [assigningProduct, setAssigningProduct] = useState<V28Product | null>(null);
  const [assignBoothId, setAssignBoothId] = useState('');
  const [assignSlotId, setAssignSlotId] = useState<string>('slot_01');

  useEffect(() => {
    v28Api
      .getOwnerCompany()
      .then((res) => {
        setOwnerStatus(res.state);
        setExhibitionId(res.exhibitionId || '');
        if (res.state === 'bound' && res.company) {
          setOwnerCompany(res.company);
          setCompanyId(res.company.id);
        } else {
          setOwnerCompany(null);
          setCompanyId('');
        }
      })
      .catch((err) => {
        setOwnerStatus('empty');
        setError((err as Error).message);
      });
  }, [initialCompanyId]);

  const loadCatalog = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [prodRes, exhRes] = await Promise.all([
        v28Api.listProducts({
          companyId,
          q: search.trim() || undefined,
          status: statusFilter,
          page,
          limit: 12,
        }),
        v28Api.listExhibitions().catch(() => ({ exhibitions: [] })),
      ]);
      setProducts(prodRes.items);
      setTotal(prodRes.total);
      setTotalPages(prodRes.totalPages);

      const firstExh = exhRes.exhibitions[0];
      const targetVerId = firstExh?.latestDraftVersionId || firstExh?.activeVersionId || '';
      if (firstExh && targetVerId) {
        setExhibitionId((prev) => prev || firstExh.id);
        const verRes = await v28Api.getVersionDetail(firstExh.id, targetVerId);
        const ownerBooths = verRes.version.booths.filter((b) => b.companyId === companyId);
        setBooths(
          ownerBooths.map((b) => ({
            id: b.boothId,
            name: b.boothName,
            companyName: b.companyName,
            companyId: b.companyId,
            category: b.category,
            status: 'active',
          }))
        );
        const slotsList: Array<{ boothId: string; slotId: string; productId: string }> = [];
        for (const b of ownerBooths) {
          for (const s of b.slots) {
            if (s.product?.id) {
              slotsList.push({ boothId: b.boothId, slotId: s.slotId, productId: s.product.id });
            }
          }
        }
        setSlotAssignments(slotsList);
      } else {
        setBooths([]);
        setSlotAssignments([]);
      }
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
      priceStatus: 'listed',
      price: '0',
      currency: 'VND',
      category: '',
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

    const isContact = form.priceStatus === 'contact';
    const priceNum = isContact ? null : Number(form.price);
    if (!isContact && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0)) {
      setError('Giá sản phẩm phải là số không âm (hoặc chọn trạng thái Giá Liên hệ).');
      return;
    }

    try {
      const resolvedStatus: V28ProductPriceStatus = isContact ? 'contact' : 'listed';
      if (editingId) {
        const existingProd = products.find((p) => p.id === editingId);
        const secondaryImgs = (existingProd?.images || []).slice(1);
        const nextImgs = form.imageUrl.trim() ? [form.imageUrl.trim(), ...secondaryImgs] : secondaryImgs;
        await v28Api.updateProduct(
          editingId,
          {
            name: form.name.trim(),
            sku: form.sku.trim(),
            price: priceNum,
            priceStatus: resolvedStatus,
            currency: isContact ? '' : form.currency.trim() || 'VND',
            category: form.category.trim(),
            description: form.description.trim(),
            images: nextImgs,
            sourceUrl: form.sourceUrl.trim(),
          },
          exhibitionId || undefined
        );
        setNotice('Đã cập nhật sản phẩm trong kho (không làm gián đoạn slot đang trưng bày).');
      } else {
        await v28Api.createProduct({
          companyId,
          exhibitionId: exhibitionId || undefined,
          boothId: null,
          name: form.name.trim(),
          sku: form.sku.trim(),
          price: priceNum,
          priceStatus: resolvedStatus,
          currency: isContact ? '' : form.currency.trim() || 'VND',
          category: form.category.trim(),
          description: form.description.trim(),
          images: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
          sourceUrl: form.sourceUrl.trim(),
        });
        setNotice('Đã thêm sản phẩm độc lập vào kho doanh nghiệp.');
        resetForm();
      }
      await loadCatalog();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDiscoverFromUrl = async () => {
    if (!companyId || !urlImportInput.trim()) return;
    const targetUrl = urlImportInput.trim();
    setUrlImporting(true);
    setError(null);
    setNotice(null);
    try {
      const disc = await v28Api.discoverWebsiteProducts({
        companyId,
        exhibitionId: exhibitionId || undefined,
        url: targetUrl,
        discoveryMode: 'full',
        autoDetectCompany: false,
      });
      if (!disc.discoveredProducts || disc.discoveredProducts.length === 0) {
        setCatalogWebsitePreview(null);
        setError(
          disc.discoveryStats?.limitOrErrorReason ||
            disc.note ||
            'Không tìm thấy sản phẩm công khai hợp lệ từ URL này.'
        );
        return;
      }
      setCatalogWebsitePreview({
        forUrl: targetUrl,
        siteUrl: disc.siteUrl,
        entryPageType: disc.entryPageType,
        discoveryStatus: disc.discoveryStatus,
        discoveryStats: disc.discoveryStats,
        checkpoint: disc.checkpoint,
        companyMismatchWarning: disc.companyMismatchWarning,
        note: disc.note,
        items: mapRawDiscoveredItemsToEditable(disc.discoveredProducts, 'cat-prev'),
      });
    } catch (err) {
      setCatalogWebsitePreview(null);
      setError((err as Error).message || 'Không thể trích xuất sản phẩm từ URL.');
    } finally {
      setUrlImporting(false);
    }
  };

  const handleResumeCheckpoint = async () => {
    if (!companyId || !catalogWebsitePreview?.checkpoint?.checkpointToken) return;
    setResumingCheckpoint(true);
    setError(null);
    try {
      const disc = await v28Api.discoverWebsiteProducts({
        companyId,
        exhibitionId: exhibitionId || undefined,
        url: catalogWebsitePreview.forUrl,
        discoveryMode: 'full',
        checkpointToken: catalogWebsitePreview.checkpoint.checkpointToken,
        autoDetectCompany: false,
      });
      const moreEditable = mapRawDiscoveredItemsToEditable(
        disc.discoveredProducts || [],
        `cat-b${disc.checkpoint?.batchIndex || 2}`
      );
      setCatalogWebsitePreview((prev) => {
        if (!prev) return prev;
        const existingUrls = new Set(prev.items.map((i) => i.sourceUrl.toLowerCase()));
        const dedupedNew = moreEditable.filter((m) => !m.sourceUrl || !existingUrls.has(m.sourceUrl.toLowerCase()));
        return {
          ...prev,
          discoveryStatus: disc.discoveryStatus,
          discoveryStats: disc.discoveryStats
            ? {
                ...disc.discoveryStats,
                pagesScanned: (prev.discoveryStats?.pagesScanned || 0) + disc.discoveryStats.pagesScanned,
              }
            : prev.discoveryStats,
          checkpoint: disc.checkpoint,
          note: disc.note,
          items: [...prev.items, ...dedupedNew],
        };
      });
    } catch (err) {
      setError((err as Error).message || 'Không thể tiếp tục quét batch kế tiếp.');
    } finally {
      setResumingCheckpoint(false);
    }
  };

  const handleConfirmCommitPreview = async () => {
    if (!companyId || !catalogWebsitePreview) return;
    const chosen = catalogWebsitePreview.items.filter(
      (it) =>
        it.selected &&
        validatePreviewProductItem(it) === null &&
        (duplicateStrategy === 'update' || !it.alreadyInCatalog)
    );
    if (chosen.length === 0) {
      setError('Vui lòng chọn ít nhất 1 sản phẩm hợp lệ để lưu vào Kho sản phẩm.');
      return;
    }
    setCommittingPreview(true);
    setError(null);
    setNotice(null);
    try {
      const res = await v28Api.batchCreateProducts({
        companyId,
        exhibitionId: exhibitionId || undefined,
        duplicateStrategy,
        products: chosen.map((it) => ({
          name: it.name.trim(),
          sku: it.sku.trim(),
          price: it.priceStatus === 'listed' ? it.price : null,
          priceStatus: it.priceStatus,
          currency: it.priceStatus === 'listed' ? it.currency || 'VND' : '',
          category: it.category.trim(),
          description: it.description.trim(),
          images: it.images,
          videoUrl: it.videoUrl,
          modelUrl: it.modelUrl,
          sourceUrl: it.sourceUrl.trim(),
          inStock: it.inStock,
        })),
      });
      setNotice(
        `Đã lưu kho thành công cho "${ownerCompany?.name || companyId}": Tạo mới ${res.createdCount} · Cập nhật ${res.updatedCount} · Bỏ qua (trùng) ${res.skippedCount} · Thất bại ${res.failedCount}.`
      );
      setCatalogWebsitePreview(null);
      setUrlImportInput('');
      setPage(1);
      await loadCatalog();
    } catch (err) {
      setError((err as Error).message || 'Không thể lưu danh sách sản phẩm vào Kho.');
    } finally {
      setCommittingPreview(false);
    }
  };

  const handleAssignToSlot = async () => {
    if (!assigningProduct || !assignBoothId || !exhibitionId) return;
    setError(null);
    setNotice(null);
    try {
      const wd = await v28Api.ensureWorkingDraft(exhibitionId);
      await v28Api.assignDraftSlot(
        exhibitionId,
        wd.version.versionId,
        assignBoothId,
        assignSlotId,
        assigningProduct.id
      );
      setNotice(
        `Đã gắn "${assigningProduct.name}" vào ${assignSlotId} của gian ${assignBoothId} trong Bản nháp v${wd.version.versionNumber} (bản Xuất bản công khai không bị ghi đè).`
      );
      setAssigningProduct(null);
      await loadCatalog();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="dashboard-card">
        {ownerStatus !== 'bound' && ownerStatus !== 'loading' && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            ⚠️ {ownerStatus === 'selection_required'
              ? 'Cơ sở dữ liệu hiện có nhiều doanh nghiệp. Vui lòng vào mục "Thông tin doanh nghiệp" để xác nhận 1 doanh nghiệp chủ sở hữu trước khi quản lý Kho sản phẩm.'
              : 'Chưa có doanh nghiệp chủ sở hữu triển lãm. Vui lòng tạo doanh nghiệp tại mục "Thông tin doanh nghiệp" trước.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              borderRadius: 9,
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              color: '#0369a1',
              fontSize: 13,
            }}
          >
            <strong>🏢 Doanh nghiệp:</strong>
            <span>{ownerCompany?.name || 'Chưa xác định'}</span>
          </div>
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

        {/* Unified URL Import (Homepage, Category, or Product Detail) */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            type="url"
            aria-label="Nhập URL trang chủ, danh mục hoặc chi tiết sản phẩm"
            placeholder="Nhập URL trang chủ (VD: http://nongsanviet.pro/), danh mục hoặc chi tiết sản phẩm..."
            value={urlImportInput}
            onChange={(e) => setUrlImportInput(e.target.value)}
            disabled={!companyId || urlImporting}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={urlImporting || !companyId || !urlImportInput.trim()}
            onClick={() => void handleDiscoverFromUrl()}
          >
            {urlImporting ? '⏳ Đang quét & trích xuất SP...' : '🌐 Tìm & Xem trước sản phẩm'}
          </button>
        </div>

        {urlImporting && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12.5 }}>
            ⏳ Đang khám phá danh mục và trích xuất thông tin sản phẩm (chế độ chỉ đọc — chưa ghi vào Database)...
          </div>
        )}

        {error && <div style={{ color: '#b91c1c', fontWeight: 600, marginTop: 10 }}>⚠️ {error}</div>}
        {notice && <div style={{ color: '#047857', fontWeight: 600, marginTop: 10 }}>✓ {notice}</div>}

        {catalogWebsitePreview && (
          <div style={{ marginTop: 14 }}>
            <WebsiteProductPreviewPanel
              ownerCompanyName={ownerCompany?.name || companyId}
              siteUrl={catalogWebsitePreview.siteUrl}
              entryPageType={catalogWebsitePreview.entryPageType}
              discoveryStatus={catalogWebsitePreview.discoveryStatus}
              discoveryStats={catalogWebsitePreview.discoveryStats}
              checkpoint={catalogWebsitePreview.checkpoint}
              companyMismatchWarning={catalogWebsitePreview.companyMismatchWarning}
              note={catalogWebsitePreview.note}
              items={catalogWebsitePreview.items}
              duplicateStrategy={duplicateStrategy}
              onChangeDuplicateStrategy={setDuplicateStrategy}
              onChangeItems={(next) =>
                setCatalogWebsitePreview((prev) => (prev ? { ...prev, items: next } : prev))
              }
              onResumeCheckpoint={() => void handleResumeCheckpoint()}
              resumingCheckpoint={resumingCheckpoint}
              onConfirmSave={() => void handleConfirmCommitPreview()}
              onCancel={() => setCatalogWebsitePreview(null)}
              busy={committingPreview}
            />
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
        <section className="dashboard-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
            {products.map((p) => {
              const priceLabel = formatV28ProductPrice(p);
              const isContact = priceLabel === 'Liên hệ';
              return (
                <div
                  key={p.id}
                  data-testid="v28-catalog-product-card"
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: editingId === p.id ? '1.5px solid #0284c7' : '1px solid rgba(17,24,39,0.12)',
                    background: editingId === p.id ? '#f0f9ff' : '#f8fafc',
                    color: '#111827',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {p.images?.[0] && !brokenImgUrls[p.images[0]] ? (
                        <img
                          src={resolveV28ProductImageUrl(p.images[0])}
                          alt={p.name}
                          onError={() =>
                            setBrokenImgUrls((prev) => ({ ...prev, [p.images[0]]: true }))
                          }
                          style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0', background: '#f1f5f9' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 6,
                            background: p.images?.[0] ? '#fef2f2' : '#e2e8f0',
                            color: p.images?.[0] ? '#b91c1c' : '#64748b',
                            fontSize: 9.5,
                            fontWeight: 700,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                            border: p.images?.[0] ? '1px solid #fecaca' : 'none',
                            textAlign: 'center',
                            lineHeight: 1.1,
                          }}
                        >
                          {p.images?.[0] ? 'Lỗi ảnh' : 'No Img'}
                        </div>
                      )}
                      <strong style={{ wordBreak: 'break-word' }}>{p.name}</strong>
                    </div>
                    <span
                      style={{
                        color: isContact ? '#0369a1' : '#b45309',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {priceLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                    {p.category ? <>Danh mục: <strong>{p.category}</strong> · </> : null}
                    SKU: <code>{p.sku || '(chưa có)'}</code> · Trạng thái: {p.status === 'active' ? 'Hoạt động' : 'Vô hiệu'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const contactMode = p.priceStatus === 'contact' || p.priceStatus === 'unknown' || p.price <= 0;
                        setEditingId(p.id);
                        setForm({
                          name: p.name,
                          sku: p.sku,
                          priceStatus: contactMode ? 'contact' : 'listed',
                          price: contactMode ? '0' : String(p.price),
                          currency: p.currency || 'VND',
                          category: p.category || '',
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
                          setError(null);
                          await v28Api.updateProduct(
                            p.id,
                            { status: p.status === 'active' ? 'inactive' : 'active' },
                            exhibitionId || undefined
                          );
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
              );
            })}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <label>
                Trạng thái giá
                <select
                  value={form.priceStatus}
                  onChange={(e) => setForm({ ...form, priceStatus: e.target.value as 'listed' | 'contact' })}
                >
                  <option value="listed">Giá niêm yết</option>
                  <option value="contact">Giá Liên hệ</option>
                </select>
              </label>
              {form.priceStatus === 'listed' && (
                <>
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
                </>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                Danh mục
                <input
                  type="text"
                  placeholder="VD: KHÔ TÔM, Giỏ quà..."
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </label>
              <label>
                SKU
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
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
              <button type="submit" className="btn btn-primary" disabled={!companyId}>
                {editingId ? 'Lưu cập nhật' : 'Lưu vào Kho sản phẩm'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Hủy
                </button>
              )}
            </div>
          </form>

          {assigningProduct && (() => {
            const occupiedSlot = slotAssignments.find(
              (s) => s.boothId === assignBoothId && s.slotId === assignSlotId
            );
            return (
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
                    {SLOT_IDS.map((sid) => {
                      const isTaken = slotAssignments.some(
                        (s) => s.boothId === assignBoothId && s.slotId === sid
                      );
                      return (
                        <option key={sid} value={sid}>
                          {sid}{isTaken ? ' (đã có SP)' : ' (trống)'}
                        </option>
                      );
                    })}
                  </select>
                  <button type="button" className="btn btn-primary" onClick={() => void handleAssignToSlot()}>
                    {occupiedSlot ? 'Ghi đè slot này' : 'Xác nhận gắn'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setAssigningProduct(null)}>
                    Đóng
                  </button>
                </div>
                {occupiedSlot && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309' }}>
                    Cảnh báo: {assignSlotId} của gian hàng {assignBoothId} đang chứa sản phẩm ({occupiedSlot.productId}). Xác nhận sẽ thay thế sản phẩm hiện tại trên kệ 3D.
                  </p>
                )}
              </div>
            );
          })()}
        </section>
      </div>
    </div>
  );
};
