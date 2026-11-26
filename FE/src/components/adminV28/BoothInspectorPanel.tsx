import React, { useCallback, useEffect, useState } from 'react';
import {
  formatV28ProductPrice,
  resolveV28ProductImageUrl,
  v28Api,
  type V28ArchetypeId,
  type V28ArchetypeSpec,
  type V28BoothPlacementView,
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

export interface BoothInspectorPanelProps {
  booth: V28BoothPlacementView;
  isDraft: boolean;
  archetypes?: V28ArchetypeSpec[];
  onClose: () => void;
  onAssignSlot: (boothId: string, slotId: string, productId: string) => Promise<void>;
  onProductMutated: () => Promise<void>;
  onUpdateBooth?: (
    boothId: string,
    patch: { archetypeId?: V28ArchetypeId; boothName?: string }
  ) => Promise<void>;
  onSwitchToWorkingDraft?: () => Promise<void>;
  onRequestDeleteBooth?: (booth: V28BoothPlacementView) => void;
}

type InspectorSubMode = 'slots' | 'picker' | 'edit' | 'create' | 'import_url';

export const BoothInspectorPanel: React.FC<BoothInspectorPanelProps> = ({
  booth,
  isDraft,
  archetypes = [],
  onClose,
  onAssignSlot,
  onProductMutated,
  onUpdateBooth,
  onSwitchToWorkingDraft,
  onRequestDeleteBooth,
}) => {
  const [subMode, setSubMode] = useState<InspectorSubMode>('slots');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [panelError, setPanelError] = useState<string>('');
  const [panelNotice, setPanelNotice] = useState<string>('');
  const [draftBoothName, setDraftBoothName] = useState<string>(booth.boothName);

  // Paginated Product Picker state (strictly scoped to booth.companyId)
  const [pickerQuery, setPickerQuery] = useState<string>('');
  const [pickerPage, setPickerPage] = useState<number>(1);
  const [pickerTotalPages, setPickerTotalPages] = useState<number>(1);
  const [pickerTotal, setPickerTotal] = useState<number>(0);
  const [pickerItems, setPickerItems] = useState<V28Product[]>([]);
  const [pickerLoading, setPickerLoading] = useState<boolean>(false);

  // Edit / Create product form state
  const [editingProduct, setEditingProduct] = useState<V28Product | null>(null);
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

  // Unified URL Discovery Preview inside Booth Inspector
  const [urlInput, setUrlInput] = useState<string>('');
  const [resumingCheckpoint, setResumingCheckpoint] = useState<boolean>(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
  const [inspectorPreview, setInspectorPreview] = useState<{
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

  useEffect(() => {
    setSubMode('slots');
    setActiveSlotId(null);
    setEditingProduct(null);
    setPanelError('');
    setPanelNotice('');
    setPickerQuery('');
    setPickerPage(1);
    setUrlInput('');
    setInspectorPreview(null);
    setDraftBoothName(booth.boothName);
  }, [booth.boothId]);

  useEffect(() => {
    setDraftBoothName(booth.boothName);
  }, [booth.boothName]);

  useEffect(() => {
    if (!isDraft && subMode !== 'slots') {
      setSubMode('slots');
      setActiveSlotId(null);
    }
  }, [isDraft, subMode]);

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
      if (reqId !== pickerReqIdRef.current) return;
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
    const isContact = product.priceStatus === 'contact' || product.priceStatus === 'unknown' || product.price <= 0;
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku || '',
      priceStatus: isContact ? 'contact' : 'listed',
      price: isContact ? '0' : String(product.price ?? 0),
      currency: product.currency || 'VND',
      category: product.category || '',
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
      priceStatus: 'listed',
      price: '0',
      currency: 'VND',
      category: '',
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
    const isContact = form.priceStatus === 'contact';
    const priceNum = isContact ? null : Number(form.price);
    if (!isContact && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0)) {
      setPanelError('Giá sản phẩm phải là số không âm (hoặc chọn Giá Liên hệ).');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      const resolvedStatus: V28ProductPriceStatus = isContact ? 'contact' : 'listed';
      const secondaryImages = (editingProduct.images || []).slice(1);
      const nextImages = form.imageUrl.trim()
        ? [form.imageUrl.trim(), ...secondaryImages]
        : secondaryImages;
      await v28Api.updateProduct(editingProduct.id, {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: priceNum,
        priceStatus: resolvedStatus,
        currency: isContact ? '' : form.currency.trim() || 'VND',
        category: form.category.trim(),
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
    const isContact = form.priceStatus === 'contact';
    const priceNum = isContact ? null : Number(form.price);
    if (!isContact && (priceNum === null || !Number.isFinite(priceNum) || priceNum < 0)) {
      setPanelError('Giá sản phẩm phải là số không âm (hoặc chọn Giá Liên hệ).');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      const resolvedStatus: V28ProductPriceStatus = isContact ? 'contact' : 'listed';
      const created = await v28Api.createProduct({
        companyId: booth.companyId,
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
      await onProductMutated();
      setPanelNotice(`Đã thêm "${created.product.name}" vào kho sản phẩm. Chọn sản phẩm bên dưới để gắn vào vị trí.`);
      setPickerPage(1);
      setSubMode('picker');
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể tạo sản phẩm mới.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscoverFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booth.companyId || !urlInput.trim()) return;
    setBusy(true);
    setPanelError('');
    setPanelNotice('');
    try {
      const targetUrl = urlInput.trim();
      const disc = await v28Api.discoverWebsiteProducts({
        companyId: booth.companyId,
        url: targetUrl,
        discoveryMode: 'full',
        autoDetectCompany: false,
      });
      if (!disc.discoveredProducts || disc.discoveredProducts.length === 0) {
        setInspectorPreview(null);
        setPanelError(
          disc.discoveryStats?.limitOrErrorReason ||
            disc.note ||
            'Không tìm thấy sản phẩm công khai hợp lệ từ URL này.'
        );
        return;
      }
      setInspectorPreview({
        forUrl: targetUrl,
        siteUrl: disc.siteUrl,
        entryPageType: disc.entryPageType,
        discoveryStatus: disc.discoveryStatus,
        discoveryStats: disc.discoveryStats,
        checkpoint: disc.checkpoint,
        companyMismatchWarning: disc.companyMismatchWarning,
        note: disc.note,
        items: mapRawDiscoveredItemsToEditable(disc.discoveredProducts, 'insp-prev'),
      });
    } catch (err) {
      setInspectorPreview(null);
      setPanelError((err as Error).message || 'Không thể trích xuất sản phẩm từ URL.');
    } finally {
      setBusy(false);
    }
  };

  const handleResumeInspectorCheckpoint = async () => {
    if (!booth.companyId || !inspectorPreview?.checkpoint?.checkpointToken) return;
    setResumingCheckpoint(true);
    setPanelError('');
    try {
      const disc = await v28Api.discoverWebsiteProducts({
        companyId: booth.companyId,
        url: inspectorPreview.forUrl,
        discoveryMode: 'full',
        checkpointToken: inspectorPreview.checkpoint.checkpointToken,
        autoDetectCompany: false,
      });
      const moreEditable = mapRawDiscoveredItemsToEditable(
        disc.discoveredProducts || [],
        `insp-b${disc.checkpoint?.batchIndex || 2}`
      );
      setInspectorPreview((prev) => {
        if (!prev) return prev;
        const existingUrls = new Set(prev.items.map((i) => i.sourceUrl.toLowerCase()));
        const deduped = moreEditable.filter((m) => !m.sourceUrl || !existingUrls.has(m.sourceUrl.toLowerCase()));
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
          items: [...prev.items, ...deduped],
        };
      });
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể tiếp tục quét batch kế tiếp.');
    } finally {
      setResumingCheckpoint(false);
    }
  };

  const handleConfirmInspectorPreview = async () => {
    if (!booth.companyId || !inspectorPreview) return;
    const chosen = inspectorPreview.items.filter(
      (it) =>
        it.selected &&
        validatePreviewProductItem(it) === null &&
        (duplicateStrategy === 'update' || !it.alreadyInCatalog)
    );
    if (chosen.length === 0) {
      setPanelError('Vui lòng chọn ít nhất 1 sản phẩm hợp lệ để lưu vào Kho.');
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      const res = await v28Api.batchCreateProducts({
        companyId: booth.companyId,
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
      await onProductMutated();
      setInspectorPreview(null);
      setUrlInput('');

      if (activeSlotId && res.productIds.length === 1) {
        await onAssignSlot(booth.boothId, activeSlotId, res.productIds[0]);
        setPanelNotice(
          `Đã lưu (tạo mới ${res.createdCount}, cập nhật ${res.updatedCount}, bỏ qua ${res.skippedCount}) và gắn sản phẩm vào ${activeSlotId}.`
        );
        setActiveSlotId(null);
        setSubMode('slots');
      } else {
        setPanelNotice(
          `Đã lưu vào Kho: tạo mới ${res.createdCount} · cập nhật ${res.updatedCount} · bỏ qua ${res.skippedCount} · lỗi ${res.failedCount}. Hãy chọn SP bên dưới để gắn vào slot.`
        );
        setPickerPage(1);
        setSubMode('picker');
      }
    } catch (err) {
      setPanelError((err as Error).message || 'Không thể lưu sản phẩm vào Kho.');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchDraftClick = async () => {
    if (!onSwitchToWorkingDraft) return;
    setBusy(true);
    setPanelError('');
    try {
      await onSwitchToWorkingDraft();
    } catch (e) {
      setPanelError((e as Error).message || 'Không thể chuyển sang bản Nháp làm việc.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBoothMeta = async (patch: { archetypeId?: V28ArchetypeId; boothName?: string }) => {
    if (!onUpdateBooth || !isDraft) return;
    setBusy(true);
    setPanelError('');
    setPanelNotice('');
    try {
      await onUpdateBooth(booth.boothId, patch);
      setPanelNotice('Đã lưu cấu hình nâng cao của gian hàng.');
    } catch (e) {
      setPanelError((e as Error).message || 'Không thể cập nhật thông tin gian hàng.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="v28-inspector"
      data-testid="v28-booth-inspector-panel"
      aria-label={`Quản lý gian hàng ${booth.boothName}`}
    >
      {/* Inspector Header */}
      <div className="v28-inspector-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0284c7' }}>
            {booth.zoneName} · {booth.assignedSlotCount}/6 vị trí
          </div>
          <h3
            title={booth.boothName}
            style={{
              margin: '2px 0 0',
              fontSize: 15,
              fontWeight: 800,
              color: '#111827',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {booth.boothName}
          </h3>
          <div style={{ fontSize: 11.5, color: '#526071', marginTop: 2 }}>
            Gian #{booth.slotIndex + 1} · {booth.archetypeLabel}
          </div>
        </div>
        <button
          type="button"
          className="v28-btn v28-btn--secondary"
          onClick={onClose}
          aria-label="Đóng bảng chi tiết gian hàng"
          style={{ minHeight: 30, padding: '0 9px', flexShrink: 0 }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13, color: '#111827' }}>6 vị trí trưng bày</strong>
            <span style={{ fontSize: 11.5, color: '#526071', fontVariantNumeric: 'tabular-nums' }}>
              {booth.assignedSlotCount}/6 đã gắn
            </span>
          </div>

          {booth.slots.map((slot, idx) => {
            const prod = slot.product;
            const slotPriceText = prod ? formatV28ProductPrice(prod) : '';
            const isContact = slotPriceText === 'Liên hệ';
            return (
              <div
                key={slot.slotId}
                data-testid={`v28-inspector-slot-${slot.slotId}`}
                className={`v28-slot-row ${prod ? 'v28-slot-row--filled' : 'v28-slot-row--empty'}`}
              >
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                  {prod?.images?.[0] && !brokenImgUrls[prod.images[0]] ? (
                    <img
                      src={resolveV28ProductImageUrl(prod.images[0])}
                      alt={prod.name}
                      onError={() =>
                        setBrokenImgUrls((prev) => ({ ...prev, [prod.images[0]]: true }))
                      }
                      style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', border: '1px solid rgba(17,24,39,0.1)', flexShrink: 0, background: '#f8fafc' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 7,
                        background: prod ? '#e0f2fe' : '#f1f5f9',
                        color: prod ? '#0369a1' : '#94a3b8',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11.5,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      #{idx + 1}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>
                        Vị trí {String(idx + 1).padStart(2, '0')}
                      </span>
                      {prod && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: isContact ? '#0369a1' : '#059669', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {slotPriceText}
                        </span>
                      )}
                    </div>
                    {prod ? (
                      <div
                        title={prod.name}
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: '#111827',
                          marginTop: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          overflowWrap: 'anywhere',
                          lineHeight: 1.35,
                        }}
                      >
                        {prod.name}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>Trống</div>
                    )}
                  </div>
                </div>

                {isDraft && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {prod ? (
                      <>
                        <button
                          type="button"
                          className="v28-btn v28-btn--secondary"
                          disabled={busy}
                          onClick={() => openEditProduct(prod)}
                          style={{ minHeight: 28, padding: '0 9px', fontSize: 11.5 }}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="v28-btn v28-btn--secondary"
                          disabled={busy}
                          onClick={() => openPickerForSlot(slot.slotId)}
                          style={{ minHeight: 28, padding: '0 9px', fontSize: 11.5 }}
                        >
                          Thay
                        </button>
                        <button
                          type="button"
                          className="v28-btn v28-btn--danger"
                          disabled={busy}
                          onClick={() => void handleClearSlot(slot.slotId)}
                          style={{ minHeight: 28, padding: '0 9px', fontSize: 11.5 }}
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
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 12, width: '100%' }}
                      >
                        + Thêm sản phẩm
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Collapsible Advanced Booth Configuration & Technical Info (UI-B Section 2.1.6 & 4) */}
          <details className="v28-advanced-details" data-testid="v28-inspector-advanced-details" style={{ marginTop: 4 }}>
            <summary>Chi tiết nâng cao (Tên gian, Mẫu 3D, Tọa độ)</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {onUpdateBooth && (
                <div className="v28-field">
                  <span>Tên gian hàng</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="v28-input"
                      disabled={!isDraft || busy}
                      value={draftBoothName}
                      onChange={(e) => setDraftBoothName(e.target.value)}
                      placeholder="Nhập tên gian hàng..."
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {isDraft && (
                      <button
                        type="button"
                        className="v28-btn v28-btn--secondary"
                        disabled={busy || !draftBoothName.trim() || draftBoothName.trim() === booth.boothName}
                        onClick={() => void handleSaveBoothMeta({ boothName: draftBoothName.trim() })}
                        style={{ minHeight: 34, padding: '0 10px', fontSize: 12, flexShrink: 0 }}
                      >
                        Lưu
                      </button>
                    )}
                  </div>
                </div>
              )}

              {onUpdateBooth && archetypes.length > 0 && (
                <label className="v28-field">
                  <span>Mẫu kiến trúc 3D</span>
                  <select
                    className="v28-input"
                    disabled={!isDraft || busy}
                    value={booth.archetypeId}
                    onChange={(e) =>
                      void handleSaveBoothMeta({ archetypeId: e.target.value as V28ArchetypeId })
                    }
                    style={{ maxWidth: '100%' }}
                  >
                    {archetypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} ({a.width}m × {a.depth}m)
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div>Mã định danh: <code>{booth.boothId}</code></div>
                <div>Tọa độ mặt bằng: <code>({booth.positionX}m, {booth.positionZ}m)</code></div>
                <div>Doanh nghiệp sở hữu: <strong>{booth.companyName}</strong></div>
              </div>

              {onRequestDeleteBooth && isDraft && (
                <button
                  type="button"
                  className="v28-btn v28-btn--danger"
                  disabled={busy}
                  onClick={() => onRequestDeleteBooth(booth)}
                  style={{ width: '100%', minHeight: 34, fontSize: 12 }}
                >
                  🗑️ Xóa gian hàng
                </button>
              )}
            </div>
          </details>
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
                setInspectorPreview(null);
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
              {pickerItems.map((p) => {
                const pPriceText = formatV28ProductPrice(p);
                const isContact = pPriceText === 'Liên hệ';
                return (
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
                    {p.images?.[0] && !brokenImgUrls[p.images[0]] ? (
                      <img
                        src={resolveV28ProductImageUrl(p.images[0])}
                        alt={p.name}
                        onError={() =>
                          setBrokenImgUrls((prev) => ({ ...prev, [p.images[0]]: true }))
                        }
                        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#f8fafc', border: '1px solid #e2e8f0' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          background: '#f1f5f9',
                          color: '#64748b',
                          fontSize: 9.5,
                          fontWeight: 700,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {p.images?.[0] ? 'Lỗi ảnh' : 'No Img'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: isContact ? '#0369a1' : '#059669', fontWeight: 600 }}>
                        {pPriceText}
                        {p.category ? ` · ${p.category}` : ''}
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
                );
              })}
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
          <label className="v28-field">
            <span>Trạng thái giá</span>
            <select
              className="v28-input"
              value={form.priceStatus}
              onChange={(e) => setForm({ ...form, priceStatus: e.target.value as 'listed' | 'contact' })}
            >
              <option value="listed">Giá niêm yết</option>
              <option value="contact">Giá Liên hệ</option>
            </select>
          </label>
          {form.priceStatus === 'listed' && (
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
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="v28-field">
              <span>Danh mục</span>
              <input
                type="text"
                className="v28-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label className="v28-field">
              <span>Mã SKU</span>
              <input
                type="text"
                className="v28-input"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </label>
          </div>
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

      {/* VIEW 4: UNIFIED URL IMPORT & PREVIEW */}
      {subMode === 'import_url' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <form onSubmit={handleDiscoverFromUrl} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13.5, color: '#111827' }}>Nhập sản phẩm từ URL</strong>
              <button
                type="button"
                className="v28-btn v28-btn--secondary"
                onClick={() => {
                  setInspectorPreview(null);
                  setSubMode('picker');
                }}
                style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
              >
                ← Quay lại
              </button>
            </div>
            <label className="v28-field">
              <span>URL trang chủ, danh mục hoặc chi tiết *</span>
              <input
                type="url"
                className="v28-input"
                required
                placeholder="VD: http://nongsanviet.pro/ hoặc .../ProductDetail?ID=102"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="v28-btn v28-btn--primary"
              disabled={busy || !urlInput.trim()}
            >
              {busy && !inspectorPreview ? '⏳ Đang quét xem trước...' : '🌐 Quét & Xem trước (Preview)'}
            </button>
          </form>

          {inspectorPreview && (
            <WebsiteProductPreviewPanel
              compact
              ownerCompanyName={booth.companyName}
              siteUrl={inspectorPreview.siteUrl}
              entryPageType={inspectorPreview.entryPageType}
              discoveryStatus={inspectorPreview.discoveryStatus}
              discoveryStats={inspectorPreview.discoveryStats}
              checkpoint={inspectorPreview.checkpoint}
              companyMismatchWarning={inspectorPreview.companyMismatchWarning}
              note={inspectorPreview.note}
              items={inspectorPreview.items}
              duplicateStrategy={duplicateStrategy}
              onChangeDuplicateStrategy={setDuplicateStrategy}
              onChangeItems={(next) =>
                setInspectorPreview((prev) => (prev ? { ...prev, items: next } : prev))
              }
              onResumeCheckpoint={() => void handleResumeInspectorCheckpoint()}
              resumingCheckpoint={resumingCheckpoint}
              onConfirmSave={() => void handleConfirmInspectorPreview()}
              onCancel={() => setInspectorPreview(null)}
              busy={busy}
            />
          )}
        </div>
      )}
    </aside>
  );
};
