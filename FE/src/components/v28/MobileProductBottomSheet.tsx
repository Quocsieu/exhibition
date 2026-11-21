import React, { useRef, useState } from 'react';
import type { V28BoothPlacementView, V28Product } from '../../services/v28Api';

export interface MobileProductBottomSheetProps {
  booth: V28BoothPlacementView;
  product: V28Product;
  slotId: string;
  contactUrl: string | null;
  onClose: () => void;
  onOpenNpc?: () => void;
}

/**
 * Mobile-native Product Details Bottom Sheet:
 * - Compact height for short content, independent scroll for long descriptions
 * - Swipe-down-to-close on drag handle or when inner scroll is at top (zero scroll conflict)
 * - 44x44px touch targets & safe-area-inset-bottom support
 * - Keeps camera focus intact behind the sheet
 */
export const MobileProductBottomSheet: React.FC<MobileProductBottomSheetProps> = ({
  booth,
  product,
  slotId,
  contactUrl,
  onClose,
  onOpenNpc,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);

  const handleSwipeStart = (e: React.PointerEvent<HTMLElement>, forceHandle = false) => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (!forceHandle && scrollTop > 2) {
      swipeStartYRef.current = null;
      return;
    }
    swipeStartYRef.current = e.clientY;
  };

  const handleSwipeMove = (e: React.PointerEvent<HTMLElement>) => {
    if (swipeStartYRef.current === null) return;
    const dy = e.clientY - swipeStartYRef.current;
    if (dy > 0) {
      setDragOffsetY(Math.min(dy, 220));
    } else {
      setDragOffsetY(0);
    }
  };

  const handleSwipeEnd = () => {
    if (swipeStartYRef.current === null) return;
    swipeStartYRef.current = null;
    if (dragOffsetY >= 72) {
      setDragOffsetY(0);
      onClose();
    } else {
      setDragOffsetY(0);
    }
  };

  const formattedPrice =
    product.price > 0
      ? `${product.price.toLocaleString('vi-VN')} ${product.currency || 'VND'}`
      : 'Liên hệ báo giá';

  const productLink = product.sourceUrl || contactUrl;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Chi tiết sản phẩm ${product.name}`}
      className="v28-mobile-product-sheet"
      onPointerDown={(e) => {
        e.stopPropagation();
        handleSwipeStart(e, false);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        handleSwipeMove(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        handleSwipeEnd();
      }}
      onPointerCancel={handleSwipeEnd}
      style={{
        pointerEvents: 'auto',
        width: '100%',
        maxHeight: '72dvh',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -12px 36px rgba(15, 23, 42, 0.28)',
        borderTop: '1px solid rgba(203, 213, 225, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : 'translateY(0)',
        transition: dragOffsetY > 0 ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
      }}
    >
      {/* Swipe Handle Bar */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          handleSwipeStart(e, true);
        }}
        style={{
          padding: '10px 16px 4px',
          display: 'flex',
          justifyContent: 'center',
          cursor: 'grab',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: '#cbd5e1',
          }}
        />
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          padding: '4px 16px 10px',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#0284c7',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {booth.companyName || booth.boothName} · {slotId.toUpperCase()}
          </div>
          <h4
            style={{
              margin: '2px 0 0',
              fontSize: 16.5,
              lineHeight: 1.25,
              color: '#0f172a',
              fontWeight: 800,
            }}
          >
            {product.name}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin sản phẩm"
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#0f172a',
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Independent Scrollable Body */}
      <div
        ref={scrollRef}
        style={{
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        {product.images?.[0] && (
          <div
            style={{
              width: '100%',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <img
              src={product.images[0]}
              alt={product.name}
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
              }}
              style={{
                width: '100%',
                maxHeight: 190,
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#047857' }}>{formattedPrice}</span>
          {product.sku && (
            <span
              style={{
                fontSize: 12,
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

        <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.55 }}>
          {product.description || 'Sản phẩm trưng bày chính thức tại gian hàng.'}
        </p>
      </div>

      {/* Thumb-friendly Action Footer */}
      <div
        style={{
          padding: '10px 16px 4px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {productLink ? (
          <a
            href={productLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              background: '#0284c7',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            🛒 Liên hệ / Mua hàng ↗
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenNpc?.();
            }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              border: 'none',
              background: '#0284c7',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            💬 Hỏi tư vấn viên
          </button>
        )}

        {onOpenNpc && productLink && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenNpc();
            }}
            aria-label="Hỏi tư vấn viên"
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            👩‍💼 Tư vấn
          </button>
        )}
      </div>
    </section>
  );
};
