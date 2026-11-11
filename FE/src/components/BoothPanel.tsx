import React, { useEffect, useId, useState } from 'react';
import type { Booth, Product, BoothSlotView } from '../types/expo';
import { ProductPanel } from './ProductPanel';

export interface BoothPanelProps {
  booth: Booth | null;
  products: Product[];
  slots?: BoothSlotView[];
  selectedProduct?: Product | null;
  onSelectProduct?: (product: Product | null) => void;
  onClose: () => void;
  onWalkToBooth?: (booth: Booth) => void;
}

export const BoothPanel: React.FC<BoothPanelProps> = ({
  booth,
  slots,
  selectedProduct: controlledSelectedProduct,
  onSelectProduct,
  onClose,
  onWalkToBooth,
}) => {
  const modalTitleId = useId();
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

  // Support closing Product Modal first, then Shop Showcase via Escape key
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

  const occupiedSlotCount = slots
    ? slots.filter((s) => Boolean(s.product)).length
    : undefined;

  const activeSlotInfo =
    activeProduct && slots
      ? slots.find((s) => s.product?.id === activeProduct.id)?.slot
      : undefined;

  return (
    <div
      className="shop-showcase-overlay"
      style={{ '--booth-accent': booth.color } as React.CSSProperties}
    >
      {/* Compact Top Stage HUD Bar — Zero Right-Side Product List Sidebar */}
      <div className="shop-showcase-stage-hud" aria-label="Điều khiển góc nhìn gian hàng 3D">
        <div className="shop-showcase-stage-hud__top">
          <button
            type="button"
            className="shop-showcase-back-btn"
            onClick={onClose}
            title="Đóng giao diện gian hàng và quay lại khu triển lãm (Phím Esc)"
          >
            ↩ Quay lại Khu triển lãm <kbd>Esc</kbd>
          </button>

          <div className="shop-showcase-booth-banner">
            <span className="expo-dialog__badge" style={{ backgroundColor: booth.color }}>
              {booth.category}
            </span>
            <strong className="shop-showcase-booth-banner__title">
              {booth.companyName || booth.name}
            </strong>
            <span className="shop-showcase-booth-banner__sub">
              · {booth.name}
              {occupiedSlotCount !== undefined ? ` (${occupiedSlotCount}/6 vị trí trưng bày)` : ''}
            </span>
          </div>

          <div className="shop-showcase-stage-hud__actions">
            {onWalkToBooth && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => onWalkToBooth(booth)}
                title="Điều khiển nhân vật đi bộ tới trước cửa gian hàng này"
              >
                🚶 Đi tới gian hàng
              </button>
            )}
            {booth.contactUrl && (
              <a
                href={booth.contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline btn--sm"
              >
                🌐 Website ↗
              </a>
            )}
          </div>
        </div>

        <div className="shop-showcase-hint-pill">
          <span className="shop-showcase-live-dot" />
          <span>
            🖱️ Click trực tiếp vào sản phẩm trên <strong>Quầy trước</strong> hoặc{' '}
            <strong>Kệ trưng bày 2 bên</strong> trong không gian 3D để xem thông tin chi tiết
          </span>
        </div>
      </div>

      {/* Centered Product Detail Modal — Only opens when a 3D slot product is clicked */}
      {activeProduct && (
        <div
          className="product-detail-modal-backdrop"
          onClick={() => setActiveProduct(null)}
        >
          <div
            className="product-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shop-showcase-awning-strip" />
            <header className="expo-dialog__header">
              <div className="expo-dialog__header-info">
                <div className="shop-showcase-badge-row">
                  <span className="expo-dialog__badge" style={{ backgroundColor: booth.color }}>
                    {booth.companyName || booth.name}
                  </span>
                  {activeSlotInfo && (
                    <span className="shop-showcase-staff-tag">
                      📍 {activeSlotInfo.slotId.toUpperCase()} · {activeSlotInfo.label}
                    </span>
                  )}
                </div>
                <h2 id={modalTitleId} className="expo-dialog__title">
                  {activeProduct.name}
                </h2>
              </div>

              <div className="expo-dialog__header-actions">
                <button
                  type="button"
                  className="expo-dialog__close-btn"
                  onClick={() => setActiveProduct(null)}
                  aria-label="Đóng chi tiết sản phẩm"
                  title="Đóng (Esc)"
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="expo-dialog__body">
              <ProductPanel
                booth={booth}
                product={activeProduct}
                onBack={() => setActiveProduct(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
