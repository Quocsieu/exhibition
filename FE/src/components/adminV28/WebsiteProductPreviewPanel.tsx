import React, { useMemo, useState } from 'react';
import {
  formatV28ProductPrice,
  resolveV28ProductImageUrl,
  type V28CompanyMismatchWarning,
  type V28DiscoveredWebsiteProduct,
  type V28ProductPriceStatus,
  type V28WebsiteCheckpointInfo,
  type V28WebsiteDiscoveryStats,
  type V28WebsiteDiscoveryStatus,
} from '../../services/v28Api';

export interface EditableDiscoveredProductItem {
  localId: string;
  name: string;
  brand: string;
  sku: string;
  price: number | null;
  priceStatus: V28ProductPriceStatus;
  priceDisplay: string;
  currency: string;
  category: string;
  description: string;
  images: string[];
  videoUrl: string;
  modelUrl: string;
  sourceUrl: string;
  inStock: boolean;
  alreadyInCatalog: boolean;
  selected: boolean;
}

export function isValidHttpUrlCandidate(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidImageUrlCandidate(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/^\/api\/v28\/product-images\/[a-zA-Z0-9._-]+$/.test(trimmed)) return true;
  return isValidHttpUrlCandidate(trimmed);
}

export function validatePreviewProductItem(item: EditableDiscoveredProductItem): string | null {
  if (!item.name || item.name.trim().length < 2) {
    return 'Tên sản phẩm phải có ít nhất 2 ký tự.';
  }
  if (item.priceStatus === 'listed') {
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
      return 'Giá bán niêm yết không hợp lệ (nhập số >= 0 hoặc chuyển sang Liên hệ).';
    }
  }
  if (item.sourceUrl && !isValidHttpUrlCandidate(item.sourceUrl)) {
    return 'URL nguồn sản phẩm phải bắt đầu bằng http:// hoặc https://.';
  }
  if (item.images?.[0] && !isValidImageUrlCandidate(item.images[0])) {
    return 'URL hình ảnh phải bắt đầu bằng http://, https:// hoặc /api/v28/product-images/.';
  }
  return null;
}

export function mapRawDiscoveredItemsToEditable(
  items: V28DiscoveredWebsiteProduct[],
  idPrefix = 'prev'
): EditableDiscoveredProductItem[] {
  return items.map((raw, idx) => {
    const priceStatus: V28ProductPriceStatus =
      raw.priceStatus === 'contact' || raw.price === null
        ? 'contact'
        : raw.priceStatus === 'unknown'
          ? 'unknown'
          : typeof raw.price === 'number' && raw.price > 0
            ? 'listed'
            : 'contact';
    const numericPrice =
      priceStatus === 'listed' && typeof raw.price === 'number' && Number.isFinite(raw.price)
        ? raw.price
        : null;
    const candidate: EditableDiscoveredProductItem = {
      localId: `${idPrefix}-${idx}-${raw.sourceUrl || raw.name}`,
      name: (raw.name || '').trim(),
      brand: (raw.brand || '').trim(),
      sku: (raw.sku || '').trim(),
      price: numericPrice,
      priceStatus,
      priceDisplay: priceStatus === 'listed' ? raw.priceDisplay || '' : 'Liên hệ',
      currency: priceStatus === 'listed' ? (raw.currency || 'VND').trim() || 'VND' : '',
      category: (raw.category || '').trim(),
      description: (raw.description || '').trim(),
      images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : [],
      videoUrl: raw.videoUrl || '',
      modelUrl: raw.modelUrl || '',
      sourceUrl: (raw.sourceUrl || '').trim(),
      inStock: raw.inStock ?? true,
      alreadyInCatalog: Boolean(raw.alreadyInCatalog),
      selected: false,
    };
    const err = validatePreviewProductItem(candidate);
    candidate.selected = !candidate.alreadyInCatalog && err === null;
    return candidate;
  });
}

export interface WebsiteProductPreviewPanelProps {
  ownerCompanyName: string;
  siteUrl: string;
  entryPageType?: string;
  discoveryStatus: V28WebsiteDiscoveryStatus;
  discoveryStats?: V28WebsiteDiscoveryStats;
  checkpoint?: V28WebsiteCheckpointInfo;
  companyMismatchWarning?: V28CompanyMismatchWarning | null;
  note?: string;
  items: EditableDiscoveredProductItem[];
  duplicateStrategy: 'skip' | 'update';
  onChangeDuplicateStrategy: (strategy: 'skip' | 'update') => void;
  onChangeItems: (next: EditableDiscoveredProductItem[]) => void;
  onResumeCheckpoint?: () => void;
  resumingCheckpoint?: boolean;
  onConfirmSave: () => void;
  confirmLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  allowConfirmWithZeroNewWhenCatalogHasExisting?: boolean;
  onCancel: () => void;
  busy?: boolean;
  compact?: boolean;
}

const STATUS_META: Record<
  V28WebsiteDiscoveryStatus,
  { label: string; bg: string; border: string; color: string }
> = {
  DISCOVERY_COMPLETE: {
    label: 'Hoàn tất khám phá toàn bộ phạm vi hợp lệ',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    color: '#065f46',
  },
  PARTIAL: {
    label: 'Khám phá một phần — có thể quét nối tiếp bằng Checkpoint',
    bg: '#fffbeb',
    border: '#fde68a',
    color: '#92400e',
  },
  BLOCKED: {
    label: 'Bị chặn truy cập tự động từ website nguồn',
    bg: '#fef2f2',
    border: '#fecaca',
    color: '#b91c1c',
  },
  FAILED: {
    label: 'Lỗi kết nối khi xử lý website',
    bg: '#fef2f2',
    border: '#fecaca',
    color: '#b91c1c',
  },
  EMPTY: {
    label: 'Không tìm thấy sản phẩm hợp lệ',
    bg: '#f8fafc',
    border: '#cbd5e1',
    color: '#475569',
  },
};

export const WebsiteProductPreviewPanel: React.FC<WebsiteProductPreviewPanelProps> = ({
  ownerCompanyName,
  siteUrl,
  entryPageType,
  discoveryStatus,
  discoveryStats,
  checkpoint,
  companyMismatchWarning,
  note,
  items,
  duplicateStrategy,
  onChangeDuplicateStrategy,
  onChangeItems,
  onResumeCheckpoint,
  resumingCheckpoint = false,
  onConfirmSave,
  confirmLabel,
  secondaryActionLabel,
  onSecondaryAction,
  allowConfirmWithZeroNewWhenCatalogHasExisting = false,
  onCancel,
  busy = false,
  compact = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    let selectedValid = 0;
    let selectedInvalid = 0;
    let existingInCatalog = 0;
    let contactCount = 0;
    let listedCount = 0;

    for (const it of items) {
      const err = validatePreviewProductItem(it);
      if (it.alreadyInCatalog) existingInCatalog++;
      if (it.priceStatus === 'contact' || it.priceStatus === 'unknown' || it.price === null) {
        contactCount++;
      } else {
        listedCount++;
      }
      if (it.selected) {
        if (err === null) selectedValid++;
        else selectedInvalid++;
      }
    }
    return { selectedValid, selectedInvalid, existingInCatalog, contactCount, listedCount };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.sourceUrl.toLowerCase().includes(q)
    );
  }, [items, filterText]);

  const isItemSelectable = (item: EditableDiscoveredProductItem): boolean => {
    if (validatePreviewProductItem(item) !== null) return false;
    if (duplicateStrategy === 'skip' && item.alreadyInCatalog) return false;
    return true;
  };

  const handleSelectAllValid = () => {
    onChangeItems(
      items.map((it) => ({
        ...it,
        selected: isItemSelectable(it),
      }))
    );
  };

  const handleDeselectAll = () => {
    onChangeItems(items.map((it) => ({ ...it, selected: false })));
  };

  const handleToggleItem = (localId: string, checked: boolean) => {
    onChangeItems(
      items.map((it) => {
        if (it.localId !== localId) return it;
        if (!isItemSelectable(it)) return { ...it, selected: false };
        return { ...it, selected: checked };
      })
    );
  };

  const handlePatchItem = (localId: string, patch: Partial<EditableDiscoveredProductItem>) => {
    onChangeItems(
      items.map((it) => {
        if (it.localId !== localId) return it;
        const next: EditableDiscoveredProductItem = { ...it, ...patch };
        const hasErr = validatePreviewProductItem(next) !== null;
        if (hasErr) {
          next.selected = false;
        }
        return next;
      })
    );
  };

  const statusInfo = STATUS_META[discoveryStatus] || STATUS_META.DISCOVERY_COMPLETE;
  const canConfirmPrimary =
    !busy &&
    counts.selectedInvalid === 0 &&
    (counts.selectedValid > 0 ||
      (allowConfirmWithZeroNewWhenCatalogHasExisting && counts.existingInCatalog > 0));

  const pageTypeLabel =
    entryPageType === 'homepage'
      ? 'Trang chủ'
      : entryPageType === 'category'
        ? 'Trang danh mục'
        : entryPageType === 'product_detail'
          ? 'Trang chi tiết sản phẩm'
          : 'Website';

  return (
    <div
      data-testid="v28-website-import-preview"
      style={{
        padding: compact ? 12 : 16,
        borderRadius: 12,
        background: '#f8fafc',
        border: '1.5px solid #0284c7',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header & Discovery Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: compact ? 13.5 : 14.5, color: '#0f172a' }}>
              Xem trước {items.length} sản phẩm ({pageTypeLabel})
            </strong>
            <span
              data-testid="v28-preview-discovery-status"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: statusInfo.bg,
                border: `1px solid ${statusInfo.border}`,
                color: statusInfo.color,
              }}
            >
              {discoveryStatus} · {statusInfo.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            Doanh nghiệp nhận dữ liệu: <strong>{ownerCompanyName}</strong> ·{' '}
            <span style={{ color: '#0369a1', fontWeight: 600 }}>Chưa ghi vào Database cho đến khi bấm xác nhận</span>
          </div>
        </div>
      </div>

      {/* Crawl Statistics Strip */}
      <div
        data-testid="v28-preview-stats"
        style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(2, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
          Trang đã quét: <strong>{discoveryStats?.pagesScanned ?? 1}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
          URL SP phát hiện: <strong>{discoveryStats?.productUrlsDiscovered ?? items.length}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
          Giá niêm yết: <strong style={{ color: '#047857' }}>{counts.listedCount}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
          Giá Liên hệ: <strong style={{ color: '#0369a1' }}>{counts.contactCount}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}>
          Đã có trong Kho: <strong style={{ color: '#b45309' }}>{counts.existingInCatalog}</strong>
        </div>
      </div>

      {discoveryStats?.limitOrErrorReason && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: 12,
          }}
        >
          ℹ️ {discoveryStats.limitOrErrorReason}
        </div>
      )}

      {/* Company Mismatch Warning */}
      {companyMismatchWarning && (
        <div
          data-testid="v28-preview-company-mismatch"
          style={{
            padding: '9px 12px',
            borderRadius: 9,
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            color: '#92400e',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          ⚠️ {companyMismatchWarning.message}
        </div>
      )}

      {/* Checkpoint Resume Banner when PARTIAL */}
      {checkpoint?.hasMore && checkpoint.checkpointToken && onResumeCheckpoint && (
        <div
          data-testid="v28-preview-checkpoint-banner"
          style={{
            padding: '10px 12px',
            borderRadius: 9,
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12.5, color: '#1e3a8a' }}>
            Website còn <strong>{checkpoint.pendingPagesCount}</strong> trang đang chờ quét tiếp (Batch #{checkpoint.batchIndex}).
          </div>
          <button
            type="button"
            data-testid="v28-preview-resume-checkpoint-btn"
            disabled={resumingCheckpoint || busy}
            onClick={onResumeCheckpoint}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #0284c7',
              background: '#0284c7',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: resumingCheckpoint || busy ? 'not-allowed' : 'pointer',
            }}
          >
            {resumingCheckpoint
              ? '⏳ Đang quét tiếp...'
              : `🔄 Quét tiếp (${checkpoint.pendingPagesCount} trang chờ)`}
          </button>
        </div>
      )}

      {/* Selection, Search & Duplicate Handling Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            data-testid="v28-preview-select-all"
            disabled={busy}
            onClick={handleSelectAllValid}
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Chọn tất cả hợp lệ
          </button>
          <button
            type="button"
            data-testid="v28-preview-deselect-all"
            disabled={busy}
            onClick={handleDeselectAll}
            style={{
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Bỏ chọn tất cả
          </button>
          <span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
            Đã chọn: <strong data-testid="v28-preview-selected-count">{counts.selectedValid}</strong>/{items.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flex: compact ? '1 1 100%' : undefined }}>
          <input
            type="search"
            aria-label="Lọc danh sách xem trước"
            placeholder="Lọc theo tên, danh mục..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              padding: '6px 9px',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: 12,
              minWidth: compact ? 120 : 170,
              flex: compact ? 1 : undefined,
            }}
          />
          <select
            aria-label="Chiến lược xử lý sản phẩm trùng"
            value={duplicateStrategy}
            onChange={(e) => {
              const nextStrat = e.target.value as 'skip' | 'update';
              onChangeDuplicateStrategy(nextStrat);
              if (nextStrat === 'skip') {
                onChangeItems(
                  items.map((it) => (it.alreadyInCatalog ? { ...it, selected: false } : it))
                );
              }
            }}
            style={{
              padding: '6px 8px',
              borderRadius: 7,
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: 12,
            }}
          >
            <option value="skip">SP đã có trong Kho: Bỏ qua tránh trùng</option>
            <option value="update">SP đã có trong Kho: Cho phép cập nhật</option>
          </select>
        </div>
      </div>

      {/* Product Rows + Inline Detail & Edit */}
      <div
        style={{
          maxHeight: compact ? 320 : 380,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingRight: 2,
        }}
      >
        {filteredItems.map((item) => {
          const validationErr = validatePreviewProductItem(item);
          const selectable = isItemSelectable(item);
          const isEditing = editingLocalId === item.localId;
          const imgUrl = resolveV28ProductImageUrl(item.images?.[0]);
          const showImg = Boolean(imgUrl && !brokenImages[imgUrl]);
          const formattedPrice = formatV28ProductPrice(item);
          const isContact = formattedPrice === 'Liên hệ';

          return (
            <div
              key={item.localId}
              data-testid="v28-preview-item-row"
              style={{
                borderRadius: 10,
                background: item.alreadyInCatalog && duplicateStrategy === 'skip' ? '#f1f5f9' : '#ffffff',
                border: validationErr
                  ? '1.5px solid #ef4444'
                  : isEditing
                    ? '1.5px solid #0284c7'
                    : '1px solid #e2e8f0',
                padding: '9px 11px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  data-testid="v28-preview-item-checkbox"
                  aria-label={`Chọn sản phẩm ${item.name || 'chưa có tên'}`}
                  checked={item.selected}
                  disabled={!selectable || busy}
                  onChange={(e) => handleToggleItem(item.localId, e.target.checked)}
                  style={{ width: 16, height: 16, cursor: selectable ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                />

                {showImg ? (
                  <img
                    src={imgUrl}
                    alt={item.name}
                    onError={() => setBrokenImages((prev) => ({ ...prev, [imgUrl]: true }))}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      objectFit: 'cover',
                      border: '1px solid #e2e8f0',
                      flexShrink: 0,
                      background: '#f8fafc',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: '#e2e8f0',
                      color: '#64748b',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    No Img
                  </div>
                )}

                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13, color: '#0f172a', wordBreak: 'break-word' }}>
                      {item.name || '(Thiếu tên sản phẩm)'}
                    </strong>
                    <span
                      data-testid="v28-preview-item-price"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: isContact ? '#e0f2fe' : '#ecfdf5',
                        color: isContact ? '#0369a1' : '#047857',
                        border: `1px solid ${isContact ? '#bae6fd' : '#a7f3d0'}`,
                      }}
                    >
                      {formattedPrice}
                    </span>
                    {item.category && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: '#f1f5f9',
                          color: '#334155',
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                    {item.alreadyInCatalog && (
                      <span
                        data-testid="v28-preview-item-existing-badge"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                        }}
                      >
                        Đã tồn tại trong Kho
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#0284c7', textDecoration: 'none', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        ↗ {item.sourceUrl}
                      </a>
                    )}
                    {item.sku && <span>SKU: {item.sku}</span>}
                  </div>

                  {validationErr && (
                    <div style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 700, marginTop: 3 }}>
                      ⚠️ Không thể lưu: {validationErr}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="v28-preview-item-edit-btn"
                  onClick={() => setEditingLocalId(isEditing ? null : item.localId)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: '1px solid #cbd5e1',
                    background: isEditing ? '#e0f2fe' : '#fff',
                    color: isEditing ? '#0369a1' : '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {isEditing ? 'Đóng' : 'Chi tiết / Sửa'}
                </button>
              </div>

              {/* Inline Detail & Edit Drawer */}
              {isEditing && (
                <div
                  data-testid="v28-preview-item-editor"
                  style={{
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: 10,
                    display: 'grid',
                    gridTemplateColumns: compact
                      ? '1fr'
                      : 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Tên sản phẩm *</span>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handlePatchItem(item.localId, { name: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Trạng thái giá</span>
                    <select
                      value={item.priceStatus === 'listed' ? 'listed' : 'contact'}
                      onChange={(e) => {
                        const nextMode = e.target.value as 'listed' | 'contact';
                        if (nextMode === 'contact') {
                          handlePatchItem(item.localId, {
                            priceStatus: 'contact',
                            price: null,
                            priceDisplay: 'Liên hệ',
                            currency: '',
                          });
                        } else {
                          handlePatchItem(item.localId, {
                            priceStatus: 'listed',
                            price: item.price && item.price > 0 ? item.price : 10000,
                            currency: item.currency || 'VND',
                          });
                        }
                      }}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                      <option value="listed">Giá niêm yết (số)</option>
                      <option value="contact">Giá Liên hệ (không để 0đ)</option>
                    </select>
                  </label>

                  {item.priceStatus === 'listed' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>Giá bán ({item.currency || 'VND'}) *</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.price ?? 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = raw === '' ? NaN : Number(raw);
                          handlePatchItem(item.localId, { price: Number.isFinite(num) ? num : -1 });
                        }}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </label>
                  )}

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Danh mục</span>
                    <input
                      type="text"
                      value={item.category}
                      onChange={(e) => handlePatchItem(item.localId, { category: e.target.value })}
                      placeholder="VD: KHÔ TÔM, BÁNH PHỒNG..."
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Mã SKU</span>
                    <input
                      type="text"
                      value={item.sku}
                      onChange={(e) => handlePatchItem(item.localId, { sku: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>URL Hình ảnh chính</span>
                    <input
                      type="url"
                      value={item.images?.[0] || ''}
                      onChange={(e) => {
                        const rest = (item.images || []).slice(1);
                        const first = e.target.value.trim();
                        handlePatchItem(item.localId, { images: first ? [first, ...rest] : rest });
                      }}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Mô tả chi tiết ({siteUrl})</span>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) => handlePatchItem(item.localId, { description: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', width: '100%' }}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {note && (
        <div style={{ fontSize: 11.5, color: '#64748b' }}>
          {note}
        </div>
      )}

      {/* Action Footer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          data-testid="v28-preview-confirm-btn"
          disabled={!canConfirmPrimary}
          onClick={onConfirmSave}
          style={{
            padding: '9px 16px',
            borderRadius: 9,
            border: 'none',
            background: canConfirmPrimary ? '#0284c7' : '#94a3b8',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: canConfirmPrimary ? 'pointer' : 'not-allowed',
          }}
        >
          {confirmLabel ||
            `✅ Xác nhận lưu ${counts.selectedValid} sản phẩm vào Kho`}
        </button>

        {secondaryActionLabel && onSecondaryAction && counts.selectedValid > 0 && (
          <button
            type="button"
            data-testid="v28-preview-secondary-btn"
            disabled={busy || counts.selectedInvalid > 0}
            onClick={onSecondaryAction}
            style={{
              padding: '9px 14px',
              borderRadius: 9,
              border: '1px solid #0284c7',
              background: '#fff',
              color: '#0369a1',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {secondaryActionLabel}
          </button>
        )}

        <button
          type="button"
          data-testid="v28-preview-cancel-btn"
          disabled={busy}
          onClick={onCancel}
          style={{
            padding: '9px 14px',
            borderRadius: 9,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#334155',
            fontWeight: 600,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Hủy xem trước
        </button>
      </div>
    </div>
  );
};
