import React, { useEffect, useId, useRef, useState } from 'react';
import type { Booth, Product } from '../types/expo';
import { ProductPanel, formatCurrency } from './ProductPanel';

export interface BoothPanelProps {
  booth: Booth | null;
  products: Product[];
  onClose: () => void;
  onWalkToBooth?: (booth: Booth) => void;
}

export const BoothPanel: React.FC<BoothPanelProps> = ({
  booth,
  products,
  onClose,
  onWalkToBooth,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    setSelectedProduct(null);
  }, [booth?.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (booth) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [booth]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', handleBackdropClick);
      cleanupFallback = () => dialog.removeEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  const boothProducts = booth ? products.filter((p) => p.boothId === booth.id) : [];

  return (
    <dialog
      ref={dialogRef}
      className="expo-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {booth && (
        <div className="expo-dialog__container">
          <header
            className="expo-dialog__header"
            style={{ '--booth-accent': booth.color } as React.CSSProperties}
          >
            <div className="expo-dialog__header-info">
              <span className="expo-dialog__badge" style={{ backgroundColor: booth.color }}>
                {booth.category}
              </span>
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
                    dialogRef.current?.close();
                  }}
                >
                  🚶 Đi tới gian hàng
                </button>
              )}
              <form method="dialog">
                <button
                  type="submit"
                  value="close"
                  className="expo-dialog__close-btn"
                  aria-label="Đóng bảng thông tin gian hàng"
                >
                  ✕
                </button>
              </form>
            </div>
          </header>

          <div className="expo-dialog__body">
            {!selectedProduct ? (
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
                  <h3 className="booth-products-section__heading">
                    Danh mục sản phẩm trưng bày ({boothProducts.length})
                  </h3>

                  {boothProducts.length === 0 ? (
                    <div className="empty-state">
                      <p>Gian hàng này hiện chưa có sản phẩm trưng bày.</p>
                    </div>
                  ) : (
                    <div className="product-grid">
                      {boothProducts.map((product) => {
                        const thumb = product.images[0] || '';
                        return (
                          <article key={product.id} className="product-card">
                            <div className="product-card__media">
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
                                  onClick={() => setSelectedProduct(product)}
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
                product={selectedProduct}
                onBack={() => setSelectedProduct(null)}
              />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
};
