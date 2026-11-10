import React, { useEffect, useId, useState } from 'react';
import type { Booth, Product } from '../types/expo';
import { ProductPanel, formatCurrency } from './ProductPanel';

export interface BoothPanelProps {
  booth: Booth | null;
  products: Product[];
  selectedProduct?: Product | null;
  onSelectProduct?: (product: Product | null) => void;
  onClose: () => void;
  onWalkToBooth?: (booth: Booth) => void;
}

export const BoothPanel: React.FC<BoothPanelProps> = ({
  booth,
  products,
  selectedProduct: controlledSelectedProduct,
  onSelectProduct,
  onClose,
  onWalkToBooth,
}) => {
  const titleId = useId();
  const [internalSelectedProduct, setInternalSelectedProduct] = useState<Product | null>(null);

  const activeProduct =
    controlledSelectedProduct !== undefined ? controlledSelectedProduct : internalSelectedProduct;

  const setActiveProduct = (next: Product | null) => {
    setInternalSelectedProduct(next);
    onSelectProduct?.(next);
  };

  useEffect(() => {
    setInternalSelectedProduct(null);
    onSelectProduct?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth?.id]);

  // Support closing Shop Showcase via Escape key on desktop
  useEffect(() => {
    if (!booth) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeProduct) {
          setActiveProduct(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [booth, activeProduct, onClose]);

  if (!booth) {
    return null;
  }

  const boothProducts = products.filter((p) => p.boothId === booth.id);

  return (
    <div
      className="shop-showcase-overlay"
      style={{ '--booth-accent': booth.color } as React.CSSProperties}
    >
      {/* Left Stage Floating Shop Showcase Bar (Leaves 3D Shopfront Unblurred & Interactive) */}
      <div className="shop-showcase-stage-hud" aria-label="Điều khiển góc nhìn cửa hàng 3D">
        <div className="shop-showcase-stage-hud__top">
          <button
            type="button"
            className="shop-showcase-back-btn"
            onClick={onClose}
            title="Đóng giao diện cửa hàng và quay lại khu triển lãm (Phím Esc)"
          >
            ↩ Quay lại Khu triển lãm <kbd>Esc</kbd>
          </button>

          <div className="shop-showcase-live-pill">
            <span className="shop-showcase-live-dot" />
            <span>🏪 Góc nhìn Cửa hàng 3D · Đang mở cửa</span>
          </div>
        </div>

        {boothProducts.length > 0 && (
          <div className="shop-showcase-shelf-bar">
            <span className="shop-showcase-shelf-bar__label">
              🏷️ Bấm vào kệ 3D hoặc chọn nhanh sản phẩm trưng bày:
            </span>
            <div className="shop-showcase-shelf-bar__list">
              {boothProducts.map((prod, idx) => {
                const isSelected = activeProduct?.id === prod.id;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    className={`shop-shelf-chip ${isSelected ? 'shop-shelf-chip--active' : ''}`}
                    onClick={() => setActiveProduct(prod)}
                  >
                    <span className="shop-shelf-chip__index">#{idx + 1}</span>
                    <span className="shop-shelf-chip__name">{prod.name}</span>
                    <span className="shop-shelf-chip__price">
                      {formatCurrency(prod.price, prod.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right-Side Docked Cozy Commercial Showcase Drawer */}
      <aside
        className="shop-showcase-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
      >
        <div className="shop-showcase-awning-strip" />

        <header className="expo-dialog__header">
          <div className="expo-dialog__header-info">
            <div className="shop-showcase-badge-row">
              <span className="expo-dialog__badge" style={{ backgroundColor: booth.color }}>
                {booth.category}
              </span>
              <span className="shop-showcase-staff-tag">💁 Tư vấn trực tuyến</span>
            </div>
            <h2 id={titleId} className="expo-dialog__title">
              {booth.name}
            </h2>
            {booth.tagline && <p className="expo-dialog__tagline">{booth.tagline}</p>}
          </div>

          <div className="expo-dialog__header-actions">
            {onWalkToBooth && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  onWalkToBooth(booth);
                }}
                title="Điều khiển nhân vật đi bộ tới trước cửa gian hàng này"
              >
                🚶 Đi tới gian hàng
              </button>
            )}
            <button
              type="button"
              className="expo-dialog__close-btn"
              onClick={onClose}
              aria-label="Đóng bảng thông tin gian hàng"
              title="Đóng (Esc)"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="expo-dialog__body">
          {!activeProduct ? (
            <>
              <div className="booth-overview">
                <p className="booth-overview__desc">
                  {booth.description || 'Gian hàng trưng bày tại triển lãm thương mại ảo 2.5D.'}
                </p>
                <div className="booth-overview__links">
                  {booth.contactUrl && (
                    <a
                      href={booth.contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--outline btn--sm"
                    >
                      🌐 Website gian hàng ↗
                    </a>
                  )}
                  {booth.contactEmail && (
                    <a
                      href={`mailto:${booth.contactEmail}?subject=${encodeURIComponent(
                        `Liên hệ từ Virtual Expo: ${booth.name}`
                      )}`}
                      className="btn btn--outline btn--sm"
                    >
                      ✉️ {booth.contactEmail}
                    </a>
                  )}
                </div>
              </div>

              <div className="booth-products-section">
                <div className="booth-products-section__header">
                  <h3 className="booth-products-section__heading">
                    Kệ sản phẩm trưng bày ({boothProducts.length})
                  </h3>
                </div>

                {boothProducts.length === 0 ? (
                  <div className="empty-state">
                    <p>✨ Gian hàng này hiện chưa có sản phẩm trưng bày.</p>
                  </div>
                ) : (
                  <div className="product-grid">
                    {boothProducts.map((product, idx) => {
                      const thumb = product.images[0] || '';
                      return (
                        <article key={product.id} className="product-card">
                          <div className="product-card__media">
                            <span
                              className="product-card__spot-badge"
                              style={{ backgroundColor: booth.color }}
                            >
                              Kệ #{idx + 1}
                            </span>
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={product.name}
                                className="product-card__img"
                                loading="lazy"
                              />
                            ) : (
                              <div className="product-card__placeholder">📦 Không có ảnh</div>
                            )}
                            {product.videoUrl && (
                              <span className="product-card__video-badge">▶ Có Video</span>
                            )}
                          </div>

                          <div className="product-card__content">
                            <h4 className="product-card__title">{product.name}</h4>
                            <p className="product-card__price">
                              {formatCurrency(product.price, product.currency)}
                            </p>
                            <p className="product-card__excerpt">{product.description}</p>
                            <div className="product-card__actions">
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                onClick={() => setActiveProduct(product)}
                              >
                                Xem chi tiết
                              </button>
                              <a
                                href={product.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--outline btn--sm"
                              >
                                Mua ngay ↗
                              </a>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <ProductPanel
              booth={booth}
              product={activeProduct}
              onBack={() => setActiveProduct(null)}
            />
          )}
        </div>
      </aside>
    </div>
  );
};
