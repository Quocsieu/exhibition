import React, { useEffect, useMemo, useState } from 'react';
import {
  resolveV28ProductImageUrl,
  type V28BoothPlacementView,
  type V28Product,
} from '../../services/v28Api';
import { V28SvgIcon } from './V28SvgIcon';

import type { NpcSessionState } from '../../hooks/useNpcConsultationSession';

export interface DesktopProductDetailCardProps {
  booth: V28BoothPlacementView;
  product: V28Product;
  slotId: string;
  npcSessionState?: NpcSessionState;
  npcSubtitle?: string | null;
  npcIsMuted?: boolean;
  onToggleMute?: () => void;
  onReplayConsultation?: () => void;
  onOpenChat?: () => void;
  onClose: () => void;
}

export const DesktopProductDetailCard: React.FC<DesktopProductDetailCardProps> = ({
  booth,
  product,
  slotId,
  npcSessionState = 'IDLE',
  npcSubtitle = null,
  npcIsMuted = false,
  onToggleMute,
  onReplayConsultation,
  onOpenChat,
  onClose,
}) => {
  const candidateImages = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of product.images || []) {
      const resolved = resolveV28ProductImageUrl(raw);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        list.push(resolved);
      }
    }
    return list;
  }, [product.images]);

  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  useEffect(() => {
    setFailedUrls([]);
    setSelectedUrl(null);
  }, [product.id, candidateImages]);

  const validImages = useMemo(
    () => candidateImages.filter((url) => !failedUrls.includes(url)),
    [candidateImages, failedUrls]
  );

  const activeImageUrl = useMemo(() => {
    if (selectedUrl && validImages.includes(selectedUrl)) {
      return selectedUrl;
    }
    return validImages[0] ?? null;
  }, [selectedUrl, validImages]);

  const handleImageError = (failedUrl: string) => {
    setFailedUrls((prev) => (prev.includes(failedUrl) ? prev : [...prev, failedUrl]));
  };

  const formattedPrice =
    product.price > 0
      ? `${product.price.toLocaleString('vi-VN')} ${product.currency || 'VND'}`
      : 'Liên hệ báo giá';

  const descriptionText =
    (product.description || '').trim() || 'Sản phẩm trưng bày chính thức tại gian hàng.';

  return (
    <aside
      data-testid="v28-desktop-product-card"
      role="dialog"
      aria-label={`Chi tiết sản phẩm: ${product.name}`}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 35,
        pointerEvents: 'auto',
        width: 'clamp(310px, 26vw, 380px)',
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'calc(100vh - 28px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255, 255, 255, 0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 16,
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.28)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 14px 10px',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#0284c7',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {booth.companyName} · {slotId}
          </div>
          <h4
            style={{
              margin: '3px 0 0',
              fontSize: 15.5,
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.35,
            }}
          >
            {product.name}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng chi tiết sản phẩm"
          style={{
            minWidth: 36,
            minHeight: 36,
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#0f172a',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <V28SvgIcon name="close" size={16} />
        </button>
      </div>

      {/* Scrollable Body: Image + Price + Description */}
      <div
        style={{
          padding: 14,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Product Image */}
        <div
          data-testid="v28-desktop-product-image-wrap"
          style={{
            width: '100%',
            height: 200,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {activeImageUrl ? (
            <img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={product.name}
              crossOrigin="anonymous"
              onError={() => handleImageError(activeImageUrl)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <V28SvgIcon name="box" size={24} />
              <span>Chưa có hình ảnh sản phẩm</span>
            </div>
          )}
        </div>

        {/* Optional Thumbnail Strip when product has multiple valid images */}
        {validImages.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
              flexShrink: 0,
            }}
          >
            {validImages.slice(0, 6).map((imgUrl, idx) => {
              const isSelected = imgUrl === activeImageUrl;
              return (
                <button
                  key={imgUrl}
                  type="button"
                  onClick={() => setSelectedUrl(imgUrl)}
                  aria-label={`Xem hình ${idx + 1} của ${product.name}`}
                  style={{
                    width: 48,
                    height: 48,
                    padding: 0,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={imgUrl}
                    alt={`${product.name} - ${idx + 1}`}
                    crossOrigin="anonymous"
                    onError={() => handleImageError(imgUrl)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Price & SKU */}
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#047857' }}>{formattedPrice}</span>
          {product.sku && (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              SKU: {product.sku}
            </span>
          )}
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Mô tả sản phẩm
          </div>
          <p
            data-testid="v28-desktop-product-description"
            style={{
              margin: 0,
              fontSize: 13.5,
              color: '#334155',
              lineHeight: 1.55,
              whiteSpace: 'pre-line',
            }}
          >
            {descriptionText}
          </p>
        </div>

        {/* Compact NPC Product Consultation Status & Synced Subtitle */}
        {(npcSubtitle || npcSessionState !== 'IDLE') && (
          <div
            data-testid="v28-product-npc-bar"
            style={{
              borderRadius: 12,
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              padding: '9px 11px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0369a1' }}>
                {npcSessionState === 'LOADING'
                  ? '⏳ Đang chuẩn bị giọng tư vấn...'
                  : npcSessionState === 'SPEAKING'
                    ? '🔊 NPC đang tư vấn sản phẩm'
                    : npcSessionState === 'PAUSED'
                      ? '⏸ Tạm dừng tư vấn'
                      : npcSessionState === 'ERROR'
                        ? '⚠️ Tạm chưa phát được giọng đọc'
                        : '✓ Đã giới thiệu sản phẩm'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {onToggleMute && (
                  <button
                    type="button"
                    onClick={onToggleMute}
                    aria-label={npcIsMuted ? 'Bật âm thanh tư vấn' : 'Tắt âm thanh tư vấn'}
                    style={{
                      padding: '3px 7px',
                      borderRadius: 7,
                      border: '1px solid #bae6fd',
                      background: '#ffffff',
                      color: '#0369a1',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {npcIsMuted ? '🔇' : '🔊'}
                  </button>
                )}
                {onReplayConsultation && (
                  <button
                    type="button"
                    onClick={onReplayConsultation}
                    aria-label="Nghe lại tư vấn sản phẩm"
                    style={{
                      padding: '3px 8px',
                      borderRadius: 7,
                      border: '1px solid #bae6fd',
                      background: '#ffffff',
                      color: '#0369a1',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ↻ Nghe lại
                  </button>
                )}
              </div>
            </div>
            {npcSubtitle && (
              <p
                data-testid="v28-product-npc-subtitle"
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: '#0f172a',
                  lineHeight: 1.45,
                  maxHeight: 68,
                  overflowY: 'auto',
                }}
              >
                “{npcSubtitle}”
              </p>
            )}
          </div>
        )}
      </div>

      {/* Compact Action Footer (User-initiated AI Chat & optional source link) */}
      {(onOpenChat || product.sourceUrl) && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
            background: '#ffffff',
          }}
        >
          {onOpenChat && (
            <button
              type="button"
              data-testid="v28-product-open-chat"
              onClick={onOpenChat}
              style={{
                flex: 1,
                minHeight: 38,
                borderRadius: 10,
                border: 'none',
                background: '#0284c7',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              💬 Hỏi AI về sản phẩm này
            </button>
          )}
          {product.sourceUrl && (
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                minHeight: 38,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: 12.5,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              Xem nguồn ↗
            </a>
          )}
        </div>
      )}
    </aside>
  );
};
