import React, { useState } from 'react';
import type { Booth, Product } from '../types/expo';

export function formatCurrency(price: number, currency = 'VND'): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: currency.toUpperCase() === 'VND' ? 0 : 2,
    }).format(price);
  } catch {
    return `${price.toLocaleString('vi-VN')} ${currency}`;
  }
}

export interface ProductPanelProps {
  booth: Booth;
  product: Product;
  onBack: () => void;
}

export const ProductPanel: React.FC<ProductPanelProps> = ({ booth, product, onBack }) => {
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  return (
    <div className="product-detail">
      <button
        type="button"
        className="btn btn--ghost btn--sm product-detail__back"
        onClick={onBack}
      >
        ← Quay lại kệ trưng bày 3D ({booth.name})
      </button>

      <div className="product-detail__layout">
        <div className="product-detail__media-col">
          {product.images.length > 0 ? (
            <div className="product-detail__main-image-wrap">
              <img
                src={product.images[activeImageIdx] || product.images[0]}
                alt={product.name}
                className="product-detail__main-image"
              />
            </div>
          ) : (
            <div className="product-card__placeholder product-detail__placeholder">
              📦 Sản phẩm chưa có hình ảnh
            </div>
          )}

          {product.images.length > 1 && (
            <div className="product-detail__thumbs">
              {product.images.map((imgUrl, idx) => (
                <button
                  key={imgUrl + idx}
                  type="button"
                  className={`product-detail__thumb-btn ${
                    idx === activeImageIdx ? 'product-detail__thumb-btn--active' : ''
                  }`}
                  onClick={() => setActiveImageIdx(idx)}
                  aria-label={`Xem ảnh ${idx + 1}`}
                >
                  <img src={imgUrl} alt="" />
                </button>
              ))}
            </div>
          )}

          {product.videoUrl && (
            <div className="product-detail__video-box">
              <span className="product-detail__video-label">🎬 Video giới thiệu sản phẩm</span>
              <video
                src={product.videoUrl}
                controls
                preload="metadata"
                className="product-detail__video"
              >
                Trình duyệt của bạn không hỗ trợ phát video.
              </video>
            </div>
          )}
        </div>

        <div className="product-detail__info-col">
          <div className="product-detail__meta-row">
            {product.sku && <span className="badge badge--neutral">Mã: {product.sku}</span>}
            <span className={`badge ${product.inStock ? 'badge--success' : 'badge--warning'}`}>
              {product.inStock ? '✓ Còn hàng' : 'Liên hệ đặt trước'}
            </span>
          </div>

          <h3 className="product-detail__title">{product.name}</h3>

          <div className="product-detail__price-box">
            {formatCurrency(product.price, product.currency)}
          </div>

          <div className="product-detail__description">
            <h4>Mô tả chi tiết</h4>
            <p>{product.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}</p>
          </div>

          <div className="product-detail__cta-group">
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary btn--lg"
            >
              🛒 Mua tại website nguồn ↗
            </a>

            {(product.contactUrl || booth.contactUrl || booth.contactEmail) && (
              <a
                href={
                  product.contactUrl ||
                  booth.contactUrl ||
                  `mailto:${booth.contactEmail}?subject=${encodeURIComponent(
                    `Tư vấn sản phẩm: ${product.name}`
                  )}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary btn--lg"
              >
                💬 Liên hệ tư vấn / Báo giá
              </a>
            )}
          </div>

          <p className="product-detail__source-note">
            Nguồn sản phẩm:{' '}
            <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
              {product.sourceUrl}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
