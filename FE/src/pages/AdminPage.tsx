import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  type Booth,
  type CreateBoothInput,
  type Product,
  type CreateProductInput,
  type BoothSlotAssignment,
  type BoothSlotView,
  BOOTH_SLOT_DEFINITIONS,
} from '../types/expo';
import { apiClient, buildBoothSlotViews } from '../services/api';
import { formatCurrency } from '../components/ProductPanel';

export interface AdminPageProps {
  initialBoothId?: string | null;
  onNavigateBoothSlots?: (boothId: string | null) => void;
  onBackToExpo: (previewBoothId?: string | null) => void;
}

function getZoneDisplayName(zone: 'counter' | 'left-shelf' | 'right-shelf'): string {
  switch (zone) {
    case 'counter':
      return 'Quầy chính phía trước';
    case 'left-shelf':
      return 'Kệ trưng bày bên trái';
    case 'right-shelf':
      return 'Kệ trưng bày bên phải';
  }
}

function formatSlotNumberLabel(slotId: string): string {
  const num = slotId.replace(/^slot[_\s-]*/i, '');
  return `Slot ${num.padStart(2, '0')}`;
}

function getFriendlySlotPositionName(slotId: string, fallbackLabel: string): string {
  switch (slotId) {
    case 'slot_01':
      return 'Quầy chính — Bên trái';
    case 'slot_02':
      return 'Quầy chính — Bên phải';
    case 'slot_03':
      return 'Kệ trái — Tầng trên';
    case 'slot_04':
      return 'Kệ trái — Tầng dưới';
    case 'slot_05':
      return 'Kệ phải — Tầng trên';
    case 'slot_06':
      return 'Kệ phải — Tầng dưới';
    default:
      return fallbackLabel;
  }
}

function getBoothMonogram(booth: Booth): string {
  const source = (booth.companyName || booth.name || 'GH').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const AdminPage: React.FC<AdminPageProps> = ({
  initialBoothId = null,
  onNavigateBoothSlots,
  onBackToExpo,
}) => {
  const formIdPrefix = useId();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'slots' | 'booths' | 'products'>('slots');
  const [booths, setBooths] = useState<Booth[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [slotAssignments, setSlotAssignments] = useState<BoothSlotAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Booth & Slot Manager State
  const [slotSubView, setSlotSubView] = useState<'list' | 'detail'>(
    initialBoothId ? 'detail' : 'list'
  );
  const [selectedSlotBoothId, setSelectedSlotBoothId] = useState<string>(initialBoothId || '');
  const [activeSlotId, setActiveSlotId] = useState<string>('slot_01');
  const [pickerModalSlotId, setPickerModalSlotId] = useState<string | null>(null);
  const [pendingProductIdForSlot, setPendingProductIdForSlot] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmClearSlotId, setConfirmClearSlotId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
  const [returnToSlotContext, setReturnToSlotContext] = useState<{
    boothId: string;
    slotId: string;
    newlyCreatedProductId?: string;
  } | null>(null);

  const [editingBoothId, setEditingBoothId] = useState<string | null>(null);
  const [boothForm, setBoothForm] = useState<CreateBoothInput>({
    name: '',
    companyName: '',
    tagline: '',
    description: '',
    category: 'Công nghệ & Điện tử',
    color: '#0ea5e9',
    logoUrl: '',
    bannerUrl: '',
    contactEmail: '',
    contactUrl: '',
    positionX: 0,
    positionZ: 0,
    rotationY: 0,
    width: 4.8,
    depth: 3.8,
  });

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<CreateProductInput>({
    boothId: '',
    name: '',
    price: 0,
    currency: 'VND',
    description: '',
    images: [],
    videoUrl: '',
    modelUrl: '',
    sourceUrl: 'https://example.com/product',
    contactUrl: '',
    sku: '',
    inStock: true,
  });
  const [imagesInput, setImagesInput] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedBooths, fetchedProducts, fetchedSlots] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
        apiClient.getSlots(),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      if (fetchedBooths.length > 0) {
        setSelectedSlotBoothId((prev) => {
          if (initialBoothId && fetchedBooths.some((b) => b.id === initialBoothId)) {
            return initialBoothId;
          }
          if (prev && fetchedBooths.some((b) => b.id === prev)) {
            return prev;
          }
          return fetchedBooths[0].id;
        });
        setProductForm((prev) => ({
          ...prev,
          boothId: prev.boothId || fetchedBooths[0].id,
        }));
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể tải dữ liệu từ server.',
      });
    } finally {
      setLoading(false);
    }
  }, [initialBoothId]);

  useEffect(() => {
    if (initialBoothId && booths.some((b) => b.id === initialBoothId)) {
      setSelectedSlotBoothId(initialBoothId);
      setSlotSubView('detail');
      setActiveTab('slots');
    } else if (!initialBoothId) {
      setSlotSubView('list');
    }
  }, [initialBoothId, booths]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('expo_admin_token');
      if (!token) {
        setAuthChecking(false);
        return;
      }
      try {
        const res = await apiClient.verifyAdmin();
        if (res.authenticated) {
          setIsAuthenticated(true);
          await loadData();
        }
      } catch {
        localStorage.removeItem('expo_admin_token');
      } finally {
        setAuthChecking(false);
      }
    };
    void checkAuth();
  }, [loadData]);

  const slotsByBooth = useMemo<Record<string, BoothSlotView[]>>(() => {
    const map: Record<string, BoothSlotView[]> = {};
    for (const b of booths) {
      map[b.id] = buildBoothSlotViews(b.id, products, slotAssignments);
    }
    return map;
  }, [booths, products, slotAssignments]);

  const selectedBoothForSlots = useMemo(
    () => booths.find((b) => b.id === selectedSlotBoothId) || booths[0] || null,
    [booths, selectedSlotBoothId]
  );

  const currentBoothSlotViews = useMemo(
    () => (selectedBoothForSlots ? slotsByBooth[selectedBoothForSlots.id] || [] : []),
    [selectedBoothForSlots, slotsByBooth]
  );

  const selectedBoothIndex = useMemo(
    () =>
      selectedBoothForSlots
        ? Math.max(0, booths.findIndex((b) => b.id === selectedBoothForSlots.id))
        : 0,
    [booths, selectedBoothForSlots]
  );

  const pickerSlotView = useMemo(
    () =>
      pickerModalSlotId
        ? currentBoothSlotViews.find((s) => s.slot.slotId === pickerModalSlotId) || null
        : null,
    [currentBoothSlotViews, pickerModalSlotId]
  );

  const confirmClearSlotView = useMemo(
    () =>
      confirmClearSlotId
        ? currentBoothSlotViews.find((s) => s.slot.slotId === confirmClearSlotId) || null
        : null,
    [currentBoothSlotViews, confirmClearSlotId]
  );

  const boothProductsForSelector = useMemo(() => {
    if (!selectedBoothForSlots) return [];
    const q = productSearchQuery.trim().toLowerCase();
    return products
      .filter((p) => p.boothId === selectedBoothForSlots.id)
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
        );
      });
  }, [products, selectedBoothForSlots, productSearchQuery]);

  const handleSelectBoothForSlotManager = (boothId: string) => {
    setSelectedSlotBoothId(boothId);
    setActiveSlotId('slot_01');
    setSlotSubView('detail');
    setActiveTab('slots');
    onNavigateBoothSlots?.(boothId);
  };

  const handleBackToBoothList = () => {
    setSlotSubView('list');
    setPickerModalSlotId(null);
    setConfirmClearSlotId(null);
    onNavigateBoothSlots?.(null);
  };

  const handleOpenProductPickerModal = (slotView: BoothSlotView) => {
    setActiveSlotId(slotView.slot.slotId);
    setPickerModalSlotId(slotView.slot.slotId);
    setPendingProductIdForSlot(slotView.product?.id || '');
    setProductSearchQuery('');
    setModalError(null);
  };

  const handleCloseProductPickerModal = () => {
    if (savingSlotId) return;
    setPickerModalSlotId(null);
    setPendingProductIdForSlot('');
    setModalError(null);
  };

  const handleConfirmAssignProduct = async () => {
    if (!selectedBoothForSlots || !pickerSlotView || !pendingProductIdForSlot || savingSlotId) {
      return;
    }
    const boothId = selectedBoothForSlots.id;
    const slotId = pickerSlotView.slot.slotId;
    const productId = pendingProductIdForSlot;
    const slotFriendly = `${formatSlotNumberLabel(slotId)} (${getFriendlySlotPositionName(
      slotId,
      pickerSlotView.slot.label
    )})`;

    setSavingSlotId(slotId);
    setModalError(null);
    setStatusMessage(null);
    try {
      await apiClient.assignProductToSlot(boothId, slotId, productId);
      const updatedSlots = await apiClient.getSlots();
      setSlotAssignments(updatedSlots.assignments);
      const product = products.find((p) => p.id === productId);
      setPickerModalSlotId(null);
      setPendingProductIdForSlot('');
      setStatusMessage({
        type: 'success',
        text: `Đã lưu sản phẩm "${product?.name || ''}" vào vị trí ${slotFriendly} của ${
          selectedBoothForSlots.companyName || selectedBoothForSlots.name
        }!`,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể lưu sản phẩm vào vị trí trưng bày. Vui lòng thử lại.';
      setModalError(msg);
      setStatusMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setSavingSlotId(null);
    }
  };

  const handleConfirmClearSlot = async () => {
    if (!selectedBoothForSlots || !confirmClearSlotView || savingSlotId) {
      return;
    }
    const boothId = selectedBoothForSlots.id;
    const slotId = confirmClearSlotView.slot.slotId;
    const removedProductName = confirmClearSlotView.product?.name || 'sản phẩm';
    const slotFriendly = `${formatSlotNumberLabel(slotId)} (${getFriendlySlotPositionName(
      slotId,
      confirmClearSlotView.slot.label
    )})`;

    setSavingSlotId(slotId);
    setStatusMessage(null);
    try {
      await apiClient.clearBoothSlot(boothId, slotId);
      const updatedSlots = await apiClient.getSlots();
      setSlotAssignments(updatedSlots.assignments);
      setConfirmClearSlotId(null);
      setStatusMessage({
        type: 'success',
        text: `Đã gỡ "${removedProductName}" khỏi vị trí ${slotFriendly}. Sản phẩm vẫn được giữ trong kho của gian hàng.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi gỡ sản phẩm khỏi vị trí trưng bày.',
      });
    } finally {
      setSavingSlotId(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await apiClient.loginAdmin(username, password);
      localStorage.setItem('expo_admin_token', res.token);
      setIsAuthenticated(true);
      await loadData();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('expo_admin_token');
    setIsAuthenticated(false);
    setPassword('');
  };

  const resetBoothForm = () => {
    setEditingBoothId(null);
    setBoothForm({
      name: '',
      companyName: '',
      tagline: '',
      description: '',
      category: 'Công nghệ & Điện tử',
      color: '#0ea5e9',
      logoUrl: '',
      bannerUrl: '',
      contactEmail: '',
      contactUrl: '',
      positionX: 0,
      positionZ: 0,
      rotationY: 0,
      width: 4.8,
      depth: 3.8,
    });
  };

  const handleEditBooth = (booth: Booth) => {
    setEditingBoothId(booth.id);
    setBoothForm({
      name: booth.name,
      companyName: booth.companyName || booth.name,
      tagline: booth.tagline,
      description: booth.description,
      category: booth.category,
      color: booth.color,
      logoUrl: booth.logoUrl || '',
      bannerUrl: booth.bannerUrl || '',
      contactEmail: booth.contactEmail || '',
      contactUrl: booth.contactUrl || '',
      positionX: booth.positionX,
      positionZ: booth.positionZ,
      rotationY: booth.rotationY || 0,
      width: booth.width || 4.8,
      depth: booth.depth || 3.8,
    });
    setActiveTab('booths');
  };

  const handleSaveBooth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      if (editingBoothId) {
        await apiClient.updateBooth(editingBoothId, boothForm);
        setStatusMessage({ type: 'success', text: 'Đã cập nhật gian hàng thành công!' });
      } else {
        await apiClient.createBooth(boothForm);
        setStatusMessage({ type: 'success', text: 'Đã thêm gian hàng mới thành công!' });
      }
      resetBoothForm();
      await loadData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi lưu gian hàng',
      });
    }
  };

  const handleDeleteBooth = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa gian hàng "${name}" và toàn bộ sản phẩm bên trong?`)) {
      return;
    }
    try {
      await apiClient.deleteBooth(id);
      setStatusMessage({ type: 'success', text: `Đã xóa gian hàng "${name}".` });
      await loadData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi xóa gian hàng',
      });
    }
  };

  const resetProductForm = (preferredBoothId?: string) => {
    setEditingProductId(null);
    setImagesInput('');
    setProductForm({
      boothId:
        preferredBoothId ||
        returnToSlotContext?.boothId ||
        selectedBoothForSlots?.id ||
        booths[0]?.id ||
        '',
      name: '',
      price: 0,
      currency: 'VND',
      description: '',
      images: [],
      videoUrl: '',
      modelUrl: '',
      sourceUrl: 'https://example.com/product',
      contactUrl: '',
      sku: '',
      inStock: true,
    });
  };

  const handleNavigateToCreateProductFromSlot = (boothId: string, slotId: string) => {
    setReturnToSlotContext({ boothId, slotId });
    setPickerModalSlotId(null);
    setModalError(null);
    resetProductForm(boothId);
    setActiveTab('products');
  };

  const handleReturnToSlotFromProductStock = (overrideProductId?: string) => {
    if (!returnToSlotContext) return;
    const { boothId, slotId, newlyCreatedProductId } = returnToSlotContext;
    const candidateProductId = overrideProductId || newlyCreatedProductId || '';
    setSelectedSlotBoothId(boothId);
    setSlotSubView('detail');
    setActiveSlotId(slotId);
    setProductSearchQuery('');
    setModalError(null);
    setPickerModalSlotId(slotId);
    if (candidateProductId) {
      setPendingProductIdForSlot(candidateProductId);
    } else {
      const existingSlotProd = (slotsByBooth[boothId] || []).find(
        (s) => s.slot.slotId === slotId
      )?.product;
      setPendingProductIdForSlot(existingSlotProd?.id || '');
    }
    setActiveTab('slots');
    setReturnToSlotContext(null);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setImagesInput(product.images.join('\n'));
    setProductForm({
      boothId: product.boothId,
      name: product.name,
      price: product.price,
      currency: product.currency,
      description: product.description,
      images: product.images,
      videoUrl: product.videoUrl || '',
      modelUrl: product.modelUrl || '',
      sourceUrl: product.sourceUrl,
      contactUrl: product.contactUrl || '',
      sku: product.sku || '',
      inStock: product.inStock,
    });
    setActiveTab('products');
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const parsedImages = imagesInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: CreateProductInput = {
      ...productForm,
      images: parsedImages,
    };

    try {
      if (editingProductId) {
        await apiClient.updateProduct(editingProductId, payload);
        setStatusMessage({ type: 'success', text: 'Đã cập nhật sản phẩm thành công!' });
        resetProductForm(payload.boothId);
        await loadData();
      } else {
        const created = await apiClient.createProduct(payload);
        resetProductForm(payload.boothId);
        await loadData();
        if (returnToSlotContext && returnToSlotContext.boothId === payload.boothId) {
          setReturnToSlotContext((prev) =>
            prev ? { ...prev, newlyCreatedProductId: created.id } : null
          );
          setStatusMessage({
            type: 'success',
            text: `Đã tạo sản phẩm "${created.name}" thành công! Bấm "Quay lại chọn sản phẩm cho ${formatSlotNumberLabel(returnToSlotContext.slotId)}" để gán vào kệ.`,
          });
        } else {
          setStatusMessage({ type: 'success', text: 'Đã tạo sản phẩm mới thành công!' });
        }
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi lưu sản phẩm',
      });
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Xóa sản phẩm "${name}"?`)) return;
    try {
      await apiClient.deleteProduct(id);
      setStatusMessage({ type: 'success', text: `Đã xóa sản phẩm "${name}".` });
      await loadData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi xóa sản phẩm',
      });
    }
  };

  if (authChecking) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-card">Đang kiểm tra phiên đăng nhập quản trị...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-login-box">
          <div className="dashboard-login-box__header">
            <h1>Quản trị Virtual Expo 2.5D</h1>
            <p>Đăng nhập để quản lý gian hàng, vị trí trưng bày (slot) và sản phẩm.</p>
          </div>

          {authError && (
            <div className="alert alert--error" role="alert">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="dashboard-form" method="post">
            <div className="form-field">
              <label htmlFor={`${formIdPrefix}-user`}>Tên đăng nhập quản trị</label>
              <input
                id={`${formIdPrefix}-user`}
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <div className="form-field">
              <label htmlFor={`${formIdPrefix}-pass`}>
                Mật khẩu <span className="field-hint">(Mặc định PoC: expo-admin-2026)</span>
              </label>
              <input
                id={`${formIdPrefix}-pass`}
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="dashboard-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => onBackToExpo(null)}>
                ← Quay lại Triển lãm 3D
              </button>
              <button type="submit" className="btn btn--primary">
                Đăng nhập Quản trị
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>⚙️ Trung Tâm Quản Lý Trưng Bày Gian Hàng 3D</h1>
          <p>
            Đang hoạt động: <strong>{booths.length}</strong> gian hàng doanh nghiệp ·{' '}
            <strong>{slotAssignments.length} / {booths.length * BOOTH_SLOT_DEFINITIONS.length}</strong> vị trí đang trưng bày sản phẩm ·{' '}
            <strong>{products.length}</strong> sản phẩm trong kho
          </p>
        </div>
        <div className="dashboard-header__actions">
          <button type="button" className="btn btn--secondary" onClick={() => onBackToExpo(null)}>
            🌐 Xem trực tiếp Khuôn viên 3D
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      {statusMessage && (
        <div
          className={`alert ${
            statusMessage.type === 'success' ? 'alert--success' : 'alert--error'
          }`}
          role="status"
          aria-live="polite"
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            className="alert__close"
            onClick={() => setStatusMessage(null)}
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      <nav className="dashboard-tabs" aria-label="Chức năng quản trị">
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'slots' ? 'dashboard-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('slots');
            setSlotSubView('list');
            onNavigateBoothSlots?.(null);
          }}
        >
          🗂️ Quản lý Trưng bày Gian hàng ({slotAssignments.length}/{booths.length * BOOTH_SLOT_DEFINITIONS.length} vị trí)
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'booths' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('booths')}
        >
          🏛️ Thông tin Doanh nghiệp & Gian hàng ({booths.length})
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'products' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          📦 Kho Sản phẩm ({products.length})
        </button>
      </nav>

      {loading && <p className="loading-text">⏳ Đang đồng bộ dữ liệu...</p>}

      {/* ====================================================================
          TAB 1: QUẢN LÝ GIAN HÀNG & VỊ TRÍ TRƯNG BÀY SẢN PHẨM (SLOTS)
         ==================================================================== */}
      {activeTab === 'slots' && (
        <div className="slot-manager-container">
          {/* MÀN HÌNH 1: DANH SÁCH 6 GIAN HÀNG DƯỚI DẠNG CARD TRỰC QUAN (/admin/booths) */}
          {slotSubView === 'list' && (
            <section className="dashboard-card">
              <div className="slot-section-header">
                <div>
                  <h2>Danh sách 6 Gian hàng Triển lãm</h2>
                  <p className="card-help">
                    Chọn <strong>&ldquo;Quản lý sản phẩm trưng bày&rdquo;</strong> trên gian hàng bạn muốn sắp xếp. Mỗi gian hàng có <strong>6 vị trí trưng bày cố định</strong> trên quầy chính và hai kệ 3D.
                  </p>
                </div>
              </div>

              <div className="admin-booth-card-grid">
                {booths.map((b, index) => {
                  const bSlots = slotsByBooth[b.id] || [];
                  const occupiedCount = bSlots.filter((s) => Boolean(s.product)).length;
                  const totalSlots = BOOTH_SLOT_DEFINITIONS.length;
                  const fillPercent = Math.round((occupiedCount / totalSlots) * 100);
                  const totalBoothProducts = products.filter((p) => p.boothId === b.id).length;

                  return (
                    <article
                      key={b.id}
                      className="admin-booth-card"
                      style={{ '--booth-accent': b.color } as React.CSSProperties}
                    >
                      <div
                        className="admin-booth-card__top-bar"
                        style={{ backgroundColor: b.color }}
                      />
                      <div className="admin-booth-card__body">
                        <div className="admin-booth-card__header">
                          {b.logoUrl ? (
                            <img
                              src={b.logoUrl}
                              alt={b.companyName || b.name}
                              className="admin-booth-card__avatar-img"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              className="admin-booth-card__avatar"
                              style={{ backgroundColor: b.color }}
                            >
                              {getBoothMonogram(b)}
                            </div>
                          )}
                          <div className="admin-booth-card__titles">
                            <div className="admin-booth-card__badges">
                              <span
                                className="admin-booth-card__number-badge"
                                style={{ backgroundColor: b.color }}
                              >
                                Gian hàng {index + 1}
                              </span>
                              <span className="admin-booth-card__category-badge">
                                {b.category}
                              </span>
                            </div>
                            <h3 className="admin-booth-card__company">
                              {b.companyName || b.name}
                            </h3>
                            <p className="admin-booth-card__booth-name">
                              Tên gian hàng: <strong>{b.name}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Trạng thái lấp đầy 6 vị trí trưng bày */}
                        <div className="admin-booth-card__progress-box">
                          <div className="admin-booth-card__progress-row">
                            <strong>
                              {occupiedCount} / {totalSlots} vị trí đang trưng bày
                            </strong>
                            <span>{totalBoothProducts} sản phẩm trong kho</span>
                          </div>
                          <div className="admin-booth-card__progress-track">
                            <div
                              className="admin-booth-card__progress-fill"
                              style={{
                                width: `${fillPercent}%`,
                                backgroundColor: occupiedCount > 0 ? b.color : '#94a3b8',
                              }}
                            />
                          </div>

                          {/* Dải xem trước 6 vị trí Slot 01..06 */}
                          <div className="admin-booth-card__slot-strip">
                            {bSlots.map((sv) => (
                              <div
                                key={sv.slot.slotId}
                                className={`admin-booth-card__slot-pill ${
                                  sv.product
                                    ? 'admin-booth-card__slot-pill--occupied'
                                    : 'admin-booth-card__slot-pill--empty'
                                }`}
                                title={`${formatSlotNumberLabel(sv.slot.slotId)} — ${getFriendlySlotPositionName(
                                  sv.slot.slotId,
                                  sv.slot.label
                                )}: ${sv.product ? sv.product.name : 'Chưa có sản phẩm'}`}
                              >
                                {sv.product?.images?.[0] ? (
                                  <img
                                    src={sv.product.images[0]}
                                    alt={sv.product.name}
                                    className="admin-booth-card__slot-pill-img"
                                  />
                                ) : (
                                  <span>{formatSlotNumberLabel(sv.slot.slotId).replace('Slot ', 'S')}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="admin-booth-card__actions">
                          <button
                            type="button"
                            className="btn btn--primary admin-booth-card__main-btn"
                            onClick={() => handleSelectBoothForSlotManager(b.id)}
                          >
                            🗂️ Quản lý sản phẩm trưng bày
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => handleEditBooth(b)}
                            title="Chỉnh sửa tên doanh nghiệp, logo, backdrop, mô tả của gian hàng này"
                          >
                            ✏️ Sửa TT
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => onBackToExpo(b.id)}
                            title="Mở không gian 3D và xem trực tiếp gian hàng này"
                          >
                            👁️ Xem 3D
                          </button>
                        </div>

                        <div className="admin-booth-card__sub-meta">
                          Mã hệ thống: {b.id}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* MÀN HÌNH 2: QUẢN LÝ 6 SLOT CỦA MỘT GIAN HÀNG (/admin/booths/:boothId/slots) */}
          {slotSubView === 'detail' && selectedBoothForSlots && (
            <div className="slot-detail-view">
              {/* Thanh điều hướng quay lại & chuyển nhanh giữa 6 gian hàng */}
              <div className="slot-detail-topbar">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleBackToBoothList}
                >
                  ← Quay lại danh sách gian hàng
                </button>

                <div className="slot-detail-Ordered-pills" role="navigation" aria-label="Chuyển nhanh gian hàng">
                  {booths.map((b, idx) => {
                    const active = b.id === selectedBoothForSlots.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`slot-booth-switch-pill ${
                          active ? 'slot-booth-switch-pill--active' : ''
                        }`}
                        style={
                          active
                            ? { backgroundColor: b.color, borderColor: b.color, color: '#ffffff' }
                            : undefined
                        }
                        onClick={() => handleSelectBoothForSlotManager(b.id)}
                      >
                        Gian hàng {idx + 1}: {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PHẦN A: THÔNG TIN GIAN HÀNG (HEADER) */}
              <section
                className="dashboard-card slot-detail-header-card"
                style={{ borderTop: `5px solid ${selectedBoothForSlots.color}` }}
              >
                <div className="slot-detail-header-card__main">
                  <div
                    className="admin-booth-card__avatar admin-booth-card__avatar--lg"
                    style={{ backgroundColor: selectedBoothForSlots.color }}
                  >
                    {getBoothMonogram(selectedBoothForSlots)}
                  </div>
                  <div className="slot-detail-header-card__info">
                    <div className="admin-booth-card__badges">
                      <span
                        className="admin-booth-card__number-badge"
                        style={{ backgroundColor: selectedBoothForSlots.color }}
                      >
                        Gian hàng {selectedBoothIndex + 1}
                      </span>
                      <span className="admin-booth-card__category-badge">
                        {selectedBoothForSlots.category}
                      </span>
                      <span className="badge badge--success">
                        Đang trưng bày{' '}
                        {currentBoothSlotViews.filter((s) => Boolean(s.product)).length} /{' '}
                        {BOOTH_SLOT_DEFINITIONS.length} vị trí
                      </span>
                    </div>
                    <h2>{selectedBoothForSlots.companyName || selectedBoothForSlots.name}</h2>
                    <p className="slot-detail-header-card__subtitle">
                      Gian hàng: <strong>{selectedBoothForSlots.name}</strong> · Khẩu hiệu:{' '}
                      <em>&ldquo;{selectedBoothForSlots.tagline}&rdquo;</em>
                    </p>
                  </div>
                </div>

                <div className="slot-detail-header-card__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handleEditBooth(selectedBoothForSlots)}
                  >
                    ✏️ Sửa thông tin &amp; Backdrop
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      resetProductForm();
                      setProductForm((prev) => ({
                        ...prev,
                        boothId: selectedBoothForSlots.id,
                      }));
                      setActiveTab('products');
                    }}
                  >
                    ＋ Tạo sản phẩm mới vào kho
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => onBackToExpo(selectedBoothForSlots.id)}
                  >
                    👁️ Xem trước gian hàng 3D
                  </button>
                </div>
              </section>

              {/* PHẦN B: SƠ ĐỒ GIAN HÀNG TRỰC QUAN 2D */}
              <section className="dashboard-card">
                <div className="slot-section-header">
                  <div>
                    <h2>Sơ đồ Bố trí Trưng bày trong Gian hàng 3D</h2>
                    <p className="card-help">
                      Sơ đồ bên dưới mô phỏng đúng vị trí các kệ và quầy trong không gian 3D. Bấm vào bất kỳ vị trí nào để <strong>thêm</strong> hoặc <strong>thay đổi</strong> sản phẩm.
                    </p>
                  </div>
                </div>

                <div
                  className="booth-schematic"
                  aria-label="Sơ đồ bố trí 6 vị trí trưng bày trong gian hàng"
                >
                  {/* Backdrop phía sau */}
                  <div
                    className="booth-schematic__backdrop"
                    style={{ borderColor: selectedBoothForSlots.color }}
                  >
                    <span className="booth-schematic__backdrop-badge">
                      TƯỜNG BACKDROP THƯƠNG HIỆU PHÍA SAU
                    </span>
                    <strong>
                      {selectedBoothForSlots.companyName || selectedBoothForSlots.name}
                    </strong>
                    <span>{selectedBoothForSlots.tagline}</span>
                  </div>

                  {/* Hàng giữa: Kệ trái 2 tầng — Không gian trung tâm — Kệ phải 2 tầng */}
                  <div className="booth-schematic__middle">
                    {/* Kệ Trái 2 Tầng (Slot 03, Slot 04) */}
                    <div className="booth-schematic__zone">
                      <span className="booth-schematic__zone-title">
                        KỆ TRƯNG BÀY BÊN TRÁI (2 TẦNG)
                      </span>
                      {['slot_03', 'slot_04'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        const friendlyPos = getFriendlySlotPositionName(sid, sv.slot.label);
                        return (
                          <div
                            key={sid}
                            role="button"
                            tabIndex={0}
                            className={`slot-schematic-box ${
                              sv.product
                                ? 'slot-schematic-box--occupied'
                                : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => handleOpenProductPickerModal(sv)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenProductPickerModal(sv);
                              }
                            }}
                          >
                            <div className="slot-schematic-box__header">
                              <span className="slot-schematic-box__slot-tag">
                                {formatSlotNumberLabel(sid)} · {friendlyPos}
                              </span>
                              <span
                                className={`slot-status-pill ${
                                  sv.product
                                    ? 'slot-status-pill--occupied'
                                    : 'slot-status-pill--empty'
                                }`}
                              >
                                {sv.product ? 'Đã có sản phẩm' : 'Chưa có sản phẩm'}
                              </span>
                            </div>

                            {sv.product ? (
                              <div className="slot-schematic-box__product">
                                {sv.product.images?.[0] ? (
                                  <img
                                    src={sv.product.images[0]}
                                    alt={sv.product.name}
                                    className="slot-schematic-box__thumb"
                                  />
                                ) : (
                                  <div className="slot-schematic-box__thumb slot-schematic-box__thumb--empty">
                                    Chưa có ảnh
                                  </div>
                                )}
                                <div className="slot-schematic-box__meta">
                                  <strong>{sv.product.name}</strong>
                                  <span>
                                    {formatCurrency(sv.product.price, sv.product.currency)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="slot-schematic-box__empty-cta">
                                <span>Chưa có sản phẩm trưng bày</span>
                                <span className="slot-schematic-box__add-btn">
                                  ＋ Thêm sản phẩm
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Không gian trung tâm */}
                    <div className="booth-schematic__center-floor">
                      <strong>LỐI VÀO GIAN HÀNG 3D</strong>
                      <span>Khách tham quan nhìn trực diện vào Quầy chính và 2 Kệ trưng bày</span>
                      <small>Bấm vào sản phẩm trên kệ 3D sẽ mở bảng chi tiết sản phẩm</small>
                    </div>

                    {/* Kệ Phải 2 Tầng (Slot 05, Slot 06) */}
                    <div className="booth-schematic__zone">
                      <span className="booth-schematic__zone-title">
                        KỆ TRƯNG BÀY BÊN PHẢI (2 TẦNG)
                      </span>
                      {['slot_05', 'slot_06'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        const friendlyPos = getFriendlySlotPositionName(sid, sv.slot.label);
                        return (
                          <div
                            key={sid}
                            role="button"
                            tabIndex={0}
                            className={`slot-schematic-box ${
                              sv.product
                                ? 'slot-schematic-box--occupied'
                                : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => handleOpenProductPickerModal(sv)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenProductPickerModal(sv);
                              }
                            }}
                          >
                            <div className="slot-schematic-box__header">
                              <span className="slot-schematic-box__slot-tag">
                                {formatSlotNumberLabel(sid)} · {friendlyPos}
                              </span>
                              <span
                                className={`slot-status-pill ${
                                  sv.product
                                    ? 'slot-status-pill--occupied'
                                    : 'slot-status-pill--empty'
                                }`}
                              >
                                {sv.product ? 'Đã có sản phẩm' : 'Chưa có sản phẩm'}
                              </span>
                            </div>

                            {sv.product ? (
                              <div className="slot-schematic-box__product">
                                {sv.product.images?.[0] ? (
                                  <img
                                    src={sv.product.images[0]}
                                    alt={sv.product.name}
                                    className="slot-schematic-box__thumb"
                                  />
                                ) : (
                                  <div className="slot-schematic-box__thumb slot-schematic-box__thumb--empty">
                                    Chưa có ảnh
                                  </div>
                                )}
                                <div className="slot-schematic-box__meta">
                                  <strong>{sv.product.name}</strong>
                                  <span>
                                    {formatCurrency(sv.product.price, sv.product.currency)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="slot-schematic-box__empty-cta">
                                <span>Chưa có sản phẩm trưng bày</span>
                                <span className="slot-schematic-box__add-btn">
                                  ＋ Thêm sản phẩm
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quầy Trưng Bày Phía Trước (Slot 01, Slot 02) */}
                  <div className="booth-schematic__counter">
                    <span className="booth-schematic__zone-title">
                      QUẦY TRƯNG BÀY CHÍNH PHÍA TRƯỚC (MẶT TIỀN GIAN HÀNG)
                    </span>
                    <div className="booth-schematic__counter-slots">
                      {['slot_01', 'slot_02'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        const friendlyPos = getFriendlySlotPositionName(sid, sv.slot.label);
                        return (
                          <div
                            key={sid}
                            role="button"
                            tabIndex={0}
                            className={`slot-schematic-box ${
                              sv.product
                                ? 'slot-schematic-box--occupied'
                                : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => handleOpenProductPickerModal(sv)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenProductPickerModal(sv);
                              }
                            }}
                          >
                            <div className="slot-schematic-box__header">
                              <span className="slot-schematic-box__slot-tag">
                                {formatSlotNumberLabel(sid)} · {friendlyPos}
                              </span>
                              <span
                                className={`slot-status-pill ${
                                  sv.product
                                    ? 'slot-status-pill--occupied'
                                    : 'slot-status-pill--empty'
                                }`}
                              >
                                {sv.product ? 'Đã có sản phẩm' : 'Chưa có sản phẩm'}
                              </span>
                            </div>

                            {sv.product ? (
                              <div className="slot-schematic-box__product">
                                {sv.product.images?.[0] ? (
                                  <img
                                    src={sv.product.images[0]}
                                    alt={sv.product.name}
                                    className="slot-schematic-box__thumb"
                                  />
                                ) : (
                                  <div className="slot-schematic-box__thumb slot-schematic-box__thumb--empty">
                                    Chưa có ảnh
                                  </div>
                                )}
                                <div className="slot-schematic-box__meta">
                                  <strong>{sv.product.name}</strong>
                                  <span>
                                    {formatCurrency(sv.product.price, sv.product.currency)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="slot-schematic-box__empty-cta">
                                <span>Chưa có sản phẩm trưng bày</span>
                                <span className="slot-schematic-box__add-btn">
                                  ＋ Thêm sản phẩm
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* PHẦN C: DANH SÁCH 6 VỊ TRÍ TRƯNG BÀY DẠNG CARD TRỰC QUAN */}
              <section className="dashboard-card">
                <div className="slot-section-header">
                  <div>
                    <h2>Danh sách 6 Vị trí Trưng bày ({selectedBoothForSlots.name})</h2>
                    <p className="card-help">
                      Quản lý chi tiết từng vị trí trên kệ 3D. Hình ảnh sản phẩm bạn chọn sẽ được hiển thị trực tiếp lên khung trưng bày tại đúng vị trí đó.
                    </p>
                  </div>
                </div>

                <div className="admin-slot-cards-grid">
                  {currentBoothSlotViews.map((sv) => {
                    const sid = sv.slot.slotId;
                    const slotNumLabel = formatSlotNumberLabel(sid);
                    const friendlyPos = getFriendlySlotPositionName(sid, sv.slot.label);
                    const zoneLabel = getZoneDisplayName(sv.slot.zone);
                    const isBusy = savingSlotId === sid;

                    return (
                      <article
                        key={sid}
                        className={`admin-slot-card ${
                          sv.product ? 'admin-slot-card--occupied' : 'admin-slot-card--empty'
                        } ${activeSlotId === sid ? 'admin-slot-card--selected' : ''}`}
                      >
                        <div className="admin-slot-card__header">
                          <div>
                            <span className="admin-slot-card__number">{slotNumLabel}</span>
                            <h3 className="admin-slot-card__position">{friendlyPos}</h3>
                            <span className="admin-slot-card__zone">{zoneLabel}</span>
                          </div>
                          <span
                            className={`badge ${
                              sv.product ? 'badge--success' : 'badge--neutral'
                            }`}
                          >
                            {sv.product ? 'Đã có sản phẩm' : 'Chưa có sản phẩm'}
                          </span>
                        </div>

                        {sv.product ? (
                          <div className="admin-slot-card__product-body">
                            <div className="admin-slot-card__image-frame">
                              {sv.product.images?.[0] ? (
                                <img
                                  src={sv.product.images[0]}
                                  alt={sv.product.name}
                                  className="admin-slot-card__image"
                                />
                              ) : (
                                <div className="admin-slot-card__no-image">
                                  <span>🖼️</span>
                                  <small>Chưa có ảnh sản phẩm</small>
                                </div>
                              )}
                            </div>
                            <div className="admin-slot-card__product-info">
                              <h4>{sv.product.name}</h4>
                              <div className="admin-slot-card__price">
                                {formatCurrency(sv.product.price, sv.product.currency)}
                              </div>
                              {sv.product.sku && (
                                <span className="admin-slot-card__sku">
                                  Mã SKU: {sv.product.sku}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="admin-slot-card__empty-body">
                            <div className="admin-slot-card__empty-icon">📦</div>
                            <strong>Vị trí này chưa có sản phẩm</strong>
                            <p>
                              Bấm nút bên dưới để chọn một sản phẩm của gian hàng và đặt lên kệ 3D tại vị trí <strong>{friendlyPos}</strong>.
                            </p>
                          </div>
                        )}

                        <div className="admin-slot-card__actions">
                          {sv.product ? (
                            <>
                              <button
                                type="button"
                                className="btn btn--secondary admin-slot-card__action-btn"
                                disabled={isBusy}
                                onClick={() => handleOpenProductPickerModal(sv)}
                              >
                                🔄 Thay đổi
                              </button>
                              <button
                                type="button"
                                className="btn btn--danger admin-slot-card__action-btn"
                                disabled={isBusy}
                                onClick={() => setConfirmClearSlotId(sid)}
                              >
                                🗑️ Gỡ sản phẩm
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--primary admin-slot-card__action-btn"
                              disabled={isBusy}
                              onClick={() => handleOpenProductPickerModal(sv)}
                            >
                              ＋ Thêm sản phẩm
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* MODAL CHỌN SẢN PHẨM CHO SLOT (GÁN MỚI HOẶC THAY ĐỔI) */}
          {pickerSlotView && selectedBoothForSlots && (
            <div
              className="admin-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${formIdPrefix}-picker-modal-title`}
              onClick={handleCloseProductPickerModal}
            >
              <div
                className="admin-modal-card"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="admin-modal-card__header">
                  <div>
                    <span
                      className="admin-booth-card__number-badge"
                      style={{ backgroundColor: selectedBoothForSlots.color }}
                    >
                      Gian hàng {selectedBoothIndex + 1} · {selectedBoothForSlots.name}
                    </span>
                    <h2 id={`${formIdPrefix}-picker-modal-title`}>
                      {pickerSlotView.product ? 'Thay đổi sản phẩm tại ' : 'Chọn sản phẩm trưng bày cho '}
                      {formatSlotNumberLabel(pickerSlotView.slot.slotId)} —{' '}
                      {getFriendlySlotPositionName(
                        pickerSlotView.slot.slotId,
                        pickerSlotView.slot.label
                      )}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="admin-modal-card__close"
                    onClick={handleCloseProductPickerModal}
                    aria-label="Đóng cửa sổ chọn sản phẩm"
                  >
                    ✕
                  </button>
                </header>

                <div className="admin-modal-card__body">
                  {pickerSlotView.product && (
                    <div className="admin-modal-current-banner">
                      <span>Sản phẩm đang trưng bày hiện tại:</span>
                      <strong>{pickerSlotView.product.name}</strong>
                      <span>
                        ({formatCurrency(pickerSlotView.product.price, pickerSlotView.product.currency)})
                      </span>
                    </div>
                  )}

                  {modalError && (
                    <div className="alert alert--error" role="alert">
                      <span>{modalError}</span>
                    </div>
                  )}

                  <div className="admin-modal-search-toolbar">
                    <div className="form-field admin-modal-search-toolbar__field">
                      <label htmlFor={`${formIdPrefix}-modal-search`}>
                        Tìm kiếm sản phẩm thuộc gian hàng {selectedBoothForSlots.companyName || selectedBoothForSlots.name}
                      </label>
                      <input
                        id={`${formIdPrefix}-modal-search`}
                        type="search"
                        placeholder="Nhập tên sản phẩm hoặc mã SKU để lọc nhanh..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="admin-modal-search-toolbar__actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() =>
                          handleNavigateToCreateProductFromSlot(
                            selectedBoothForSlots.id,
                            pickerSlotView.slot.slotId
                          )
                        }
                        title="Đi đến Kho Sản phẩm để tạo sản phẩm mới cho gian hàng và vị trí này"
                      >
                        ＋ Tạo sản phẩm mới
                      </button>
                    </div>
                  </div>

                  <div className="admin-modal-product-list">
                    {boothProductsForSelector.length === 0 ? (
                      <div className="empty-state">
                        <p>Không tìm thấy sản phẩm phù hợp trong kho.</p>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() =>
                            handleNavigateToCreateProductFromSlot(
                              selectedBoothForSlots.id,
                              pickerSlotView.slot.slotId
                            )
                          }
                        >
                          ＋ Tạo sản phẩm trong Kho
                        </button>
                      </div>
                    ) : (
                      boothProductsForSelector.map((prod) => {
                        const isSelectedChoice = pendingProductIdForSlot === prod.id;
                        const isCurrentlyInThisSlot = pickerSlotView.product?.id === prod.id;
                        const assignedInOtherSlot = currentBoothSlotViews.find(
                          (s) =>
                            s.product?.id === prod.id &&
                            s.slot.slotId !== pickerSlotView.slot.slotId
                        );

                        return (
                          <label
                            key={prod.id}
                            className={`admin-modal-product-option ${
                              isSelectedChoice ? 'admin-modal-product-option--selected' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="slotProductChoice"
                              value={prod.id}
                              checked={isSelectedChoice}
                              onChange={() => setPendingProductIdForSlot(prod.id)}
                            />

                            {prod.images?.[0] ? (
                              <img
                                src={prod.images[0]}
                                alt={prod.name}
                                className="slot-product-thumb"
                              />
                            ) : (
                              <div className="slot-product-thumb slot-product-thumb--placeholder">
                                🖼️
                              </div>
                            )}

                            <div className="admin-modal-product-option__info">
                              <strong>{prod.name}</strong>
                              <div className="admin-modal-product-option__meta">
                                <span className="admin-modal-product-option__price">
                                  {formatCurrency(prod.price, prod.currency)}
                                </span>
                                {prod.sku && <span>· Mã SKU: {prod.sku}</span>}
                              </div>
                              <div className="admin-modal-product-option__badges">
                                {isCurrentlyInThisSlot && (
                                  <span className="badge badge--success">
                                    Đang trưng bày ở vị trí này
                                  </span>
                                )}
                                {assignedInOtherSlot && (
                                  <span className="badge badge--neutral">
                                    Đang đặt tại {formatSlotNumberLabel(assignedInOtherSlot.slot.slotId)} (
                                    {getFriendlySlotPositionName(
                                      assignedInOtherSlot.slot.slotId,
                                      assignedInOtherSlot.slot.label
                                    )}
                                    )
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="admin-modal-product-option__check">
                              {isSelectedChoice ? '✓ Đã chọn' : 'Chọn'}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <footer className="admin-modal-card__footer">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={savingSlotId !== null}
                    onClick={handleCloseProductPickerModal}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!pendingProductIdForSlot || savingSlotId !== null}
                    onClick={handleConfirmAssignProduct}
                  >
                    {savingSlotId === pickerSlotView.slot.slotId
                      ? '⏳ Đang lưu lên kệ 3D...'
                      : '✓ Xác nhận lưu'}
                  </button>
                </footer>
              </div>
            </div>
          )}

          {/* MODAL XÁC NHẬN GỠ SẢN PHẨM KHỎI SLOT */}
          {confirmClearSlotView && selectedBoothForSlots && (
            <div
              className="admin-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${formIdPrefix}-confirm-clear-title`}
              onClick={() => {
                if (!savingSlotId) setConfirmClearSlotId(null);
              }}
            >
              <div
                className="admin-modal-card admin-modal-card--compact"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="admin-modal-card__header">
                  <div>
                    <h2 id={`${formIdPrefix}-confirm-clear-title`}>
                      Xác nhận gỡ sản phẩm khỏi kệ trưng bày
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="admin-modal-card__close"
                    onClick={() => setConfirmClearSlotId(null)}
                    aria-label="Đóng hộp thoại xác nhận"
                  >
                    ✕
                  </button>
                </header>

                <div className="admin-modal-card__body">
                  <p style={{ margin: '0 0 12px' }}>
                    Bạn có chắc muốn gỡ sản phẩm bên dưới khỏi vị trí{' '}
                    <strong>
                      {formatSlotNumberLabel(confirmClearSlotView.slot.slotId)} —{' '}
                      {getFriendlySlotPositionName(
                        confirmClearSlotView.slot.slotId,
                        confirmClearSlotView.slot.label
                      )}
                    </strong>{' '}
                    của <strong>{selectedBoothForSlots.name}</strong>?
                  </p>

                  {confirmClearSlotView.product && (
                    <div className="slot-current-card__content" style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      {confirmClearSlotView.product.images?.[0] ? (
                        <img
                          src={confirmClearSlotView.product.images[0]}
                          alt={confirmClearSlotView.product.name}
                          className="slot-product-thumb"
                        />
                      ) : (
                        <div className="slot-product-thumb slot-product-thumb--placeholder">
                          📦
                        </div>
                      )}
                      <div className="slot-current-card__info">
                        <strong>{confirmClearSlotView.product.name}</strong>
                        <span className="slot-current-card__price">
                          {formatCurrency(
                            confirmClearSlotView.product.price,
                            confirmClearSlotView.product.currency
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="card-help" style={{ marginTop: '12px', marginBottom: 0 }}>
                    💡 <em>Lưu ý:</em> Thao tác này chỉ lấy sản phẩm xuống khỏi kệ trưng bày 3D để vị trí trống trở lại. Sản phẩm <strong>không bị xóa</strong> khỏi Kho sản phẩm của gian hàng.
                  </p>
                </div>

                <footer className="admin-modal-card__footer">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={savingSlotId !== null}
                    onClick={() => setConfirmClearSlotId(null)}
                  >
                    Giữ lại trên kệ
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={savingSlotId !== null}
                    onClick={handleConfirmClearSlot}
                  >
                    {savingSlotId === confirmClearSlotView.slot.slotId
                      ? '⏳ Đang gỡ sản phẩm...'
                      : '🗑️ Xác nhận gỡ khỏi kệ'}
                  </button>
                </footer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: CẤU HÌNH GIAN HÀNG & BACKDROP DOANH NGHIỆP
         ==================================================================== */}
      {activeTab === 'booths' && (
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h2>{editingBoothId ? 'Chỉnh sửa Gian hàng & Backdrop' : 'Thêm Gian hàng Mới'}</h2>
            <form onSubmit={handleSaveBooth} className="dashboard-form">
              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bname`}>Tên gian hàng *</label>
                  <input
                    id={`${formIdPrefix}-bname`}
                    name="boothName"
                    type="text"
                    required
                    value={boothForm.name}
                    onChange={(e) => setBoothForm({ ...boothForm, name: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bcomp`}>Tên doanh nghiệp (Trên Backdrop)</label>
                  <input
                    id={`${formIdPrefix}-bcomp`}
                    name="companyName"
                    type="text"
                    placeholder="VD: Aether Tech Corporation"
                    value={boothForm.companyName || ''}
                    onChange={(e) => setBoothForm({ ...boothForm, companyName: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bcat`}>Ngành hàng / Danh mục</label>
                  <input
                    id={`${formIdPrefix}-bcat`}
                    name="category"
                    type="text"
                    value={boothForm.category}
                    onChange={(e) => setBoothForm({ ...boothForm, category: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bcolor`}>Màu nhận diện (#Hex)</label>
                  <input
                    id={`${formIdPrefix}-bcolor`}
                    name="color"
                    type="color"
                    value={boothForm.color}
                    onChange={(e) => setBoothForm({ ...boothForm, color: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor={`${formIdPrefix}-btag`}>Khẩu hiệu (Tagline trên Backdrop)</label>
                <input
                  id={`${formIdPrefix}-btag`}
                  name="tagline"
                  type="text"
                  value={boothForm.tagline}
                  onChange={(e) => setBoothForm({ ...boothForm, tagline: e.target.value })}
                />
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-blogo`}>URL Logo Doanh nghiệp (Tùy chọn)</label>
                  <input
                    id={`${formIdPrefix}-blogo`}
                    name="logoUrl"
                    type="url"
                    placeholder="https://.../logo.png"
                    value={boothForm.logoUrl || ''}
                    onChange={(e) => setBoothForm({ ...boothForm, logoUrl: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bbanner`}>URL Ảnh Backdrop Phía Sau (Tùy chọn)</label>
                  <input
                    id={`${formIdPrefix}-bbanner`}
                    name="bannerUrl"
                    type="url"
                    placeholder="https://.../backdrop.jpg"
                    value={boothForm.bannerUrl || ''}
                    onChange={(e) => setBoothForm({ ...boothForm, bannerUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor={`${formIdPrefix}-bdesc`}>Mô tả gian hàng</label>
                <textarea
                  id={`${formIdPrefix}-bdesc`}
                  name="description"
                  rows={3}
                  value={boothForm.description}
                  onChange={(e) => setBoothForm({ ...boothForm, description: e.target.value })}
                />
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-bemail`}>Email liên hệ</label>
                  <input
                    id={`${formIdPrefix}-bemail`}
                    name="contactEmail"
                    type="email"
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={boothForm.contactEmail || ''}
                    onChange={(e) => setBoothForm({ ...boothForm, contactEmail: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-burl`}>Website gian hàng (URL)</label>
                  <input
                    id={`${formIdPrefix}-burl`}
                    name="contactUrl"
                    type="url"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={boothForm.contactUrl || ''}
                    onChange={(e) => setBoothForm({ ...boothForm, contactUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="dashboard-form__actions">
                {editingBoothId && (
                  <button type="button" className="btn btn--ghost" onClick={resetBoothForm}>
                    Hủy chỉnh sửa
                  </button>
                )}
                <button type="submit" className="btn btn--primary">
                  {editingBoothId ? 'Lưu cập nhật gian hàng' : '＋ Tạo gian hàng'}
                </button>
              </div>
            </form>
          </section>

          <section className="dashboard-card">
            <h2>Danh sách Gian hàng hiện tại</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Màu</th>
                    <th>Gian hàng / Doanh nghiệp</th>
                    <th>Slot trưng bày</th>
                    <th>SP</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {booths.map((b) => {
                    const count = products.filter((p) => p.boothId === b.id).length;
                    const occupied = (slotsByBooth[b.id] || []).filter((s) => Boolean(s.product)).length;
                    return (
                      <tr key={b.id}>
                        <td>
                          <span className="color-pill" style={{ backgroundColor: b.color }} />
                        </td>
                        <td>
                          <strong>{b.name}</strong>
                          <div className="table-sub">
                            {b.companyName || b.name} · <code>{b.id}</code>
                          </div>
                        </td>
                        <td>
                          {occupied} / {BOOTH_SLOT_DEFINITIONS.length}
                        </td>
                        <td>{count}</td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() => handleSelectBoothForSlotManager(b.id)}
                          >
                            Slot
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => handleEditBooth(b)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDeleteBooth(b.id, b.name)}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          TAB 3: QUẢN LÝ KHO SẢN PHẨM
         ==================================================================== */}
      {activeTab === 'products' && (
        <div className="admin-products-view">
          {returnToSlotContext && (
            <div className="admin-slot-return-banner" role="region" aria-label="Ngữ cảnh quay lại chọn sản phẩm cho Slot">
              <div className="admin-slot-return-banner__info">
                <span className="badge badge--success">
                  🎯 Đang tạo sản phẩm cho {formatSlotNumberLabel(returnToSlotContext.slotId)} —{' '}
                  {getFriendlySlotPositionName(returnToSlotContext.slotId, '')}
                </span>
                <strong>
                  Gian hàng:{' '}
                  {booths.find((b) => b.id === returnToSlotContext.boothId)?.name ||
                    returnToSlotContext.boothId}
                </strong>
                <span>
                  Sau khi lưu sản phẩm vào Kho bên dưới, bấm nút bên phải để quay lại đúng popup chọn sản phẩm của{' '}
                  <strong>{formatSlotNumberLabel(returnToSlotContext.slotId)}</strong>.
                </span>
              </div>
              <div className="admin-slot-return-banner__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => handleReturnToSlotFromProductStock()}
                >
                  ← Quay lại chọn sản phẩm cho {formatSlotNumberLabel(returnToSlotContext.slotId)}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setReturnToSlotContext(null)}
                >
                  Đóng ngữ cảnh
                </button>
              </div>
            </div>
          )}

          <div className="dashboard-grid">
            <section className="dashboard-card">
              <h2>{editingProductId ? 'Chỉnh sửa Sản phẩm' : 'Thêm / Lưu Sản phẩm'}</h2>

              <form onSubmit={handleSaveProduct} className="dashboard-form">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-pbooth`}>Thuộc Gian hàng *</label>
                  <select
                    id={`${formIdPrefix}-pbooth`}
                    name="boothId"
                    required
                    value={productForm.boothId}
                    onChange={(e) => setProductForm({ ...productForm, boothId: e.target.value })}
                  >
                    {booths.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.companyName || b.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-pname`}>Tên sản phẩm *</label>
                  <input
                    id={`${formIdPrefix}-pname`}
                    name="productName"
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  />
                </div>

                <div className="form-row-3">
                  <div className="form-field">
                    <label htmlFor={`${formIdPrefix}-pprice`}>Giá bán *</label>
                    <input
                      id={`${formIdPrefix}-pprice`}
                      name="price"
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={productForm.price}
                      onChange={(e) =>
                        setProductForm({ ...productForm, price: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${formIdPrefix}-pcurr`}>Đơn vị tiền tệ</label>
                    <input
                      id={`${formIdPrefix}-pcurr`}
                      name="currency"
                      type="text"
                      value={productForm.currency}
                      onChange={(e) => setProductForm({ ...productForm, currency: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${formIdPrefix}-psku`}>Mã SKU</label>
                    <input
                      id={`${formIdPrefix}-psku`}
                      name="sku"
                      type="text"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={productForm.sku || ''}
                      onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-psource`}>URL Website nguồn (Mua hàng) *</label>
                  <input
                    id={`${formIdPrefix}-psource`}
                    name="sourceUrl"
                    type="url"
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={productForm.sourceUrl}
                    onChange={(e) => setProductForm({ ...productForm, sourceUrl: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-pimgs`}>
                    Danh sách URL hình ảnh (Mỗi dòng 1 URL)
                  </label>
                  <textarea
                    id={`${formIdPrefix}-pimgs`}
                    name="images"
                    rows={3}
                    value={imagesInput}
                    onChange={(e) => setImagesInput(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-pvideo`}>Video URL (MP4 tùy chọn)</label>
                  <input
                    id={`${formIdPrefix}-pvideo`}
                    name="videoUrl"
                    type="url"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={productForm.videoUrl || ''}
                    onChange={(e) => setProductForm({ ...productForm, videoUrl: e.target.value })}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-pdesc`}>Mô tả sản phẩm</label>
                  <textarea
                    id={`${formIdPrefix}-pdesc`}
                    name="productDescription"
                    rows={4}
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  />
                </div>

                <div className="dashboard-form__actions">
                  {editingProductId && (
                    <button type="button" className="btn btn--ghost" onClick={() => resetProductForm()}>
                      Hủy chỉnh sửa
                    </button>
                  )}
                  <button type="submit" className="btn btn--primary">
                    {editingProductId ? 'Lưu cập nhật sản phẩm' : '＋ Lưu sản phẩm vào gian hàng'}
                  </button>
                </div>
              </form>
            </section>

            <section className="dashboard-card">
              <h2>Danh sách Sản phẩm ({products.length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Gian hàng</th>
                      <th>Vị trí Slot</th>
                      <th>Giá</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const booth = booths.find((b) => b.id === p.boothId);
                      const assignedSlot = slotAssignments.find(
                        (a) => a.boothId === p.boothId && a.productId === p.id
                      );
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <div className="table-sub">
                              <code>{p.id}</code> ·{' '}
                              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                                Nguồn ↗
                              </a>
                            </div>
                          </td>
                          <td>{booth?.name || p.boothId}</td>
                          <td>
                            {assignedSlot ? (
                              <span className="badge badge--success">
                                {assignedSlot.slotId}
                              </span>
                            ) : (
                              <span className="badge badge--neutral">Chưa gán slot</span>
                            )}
                          </td>
                          <td>{formatCurrency(p.price, p.currency)}</td>
                          <td className="table-actions">
                            {returnToSlotContext && returnToSlotContext.boothId === p.boothId && (
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                onClick={() => handleReturnToSlotFromProductStock(p.id)}
                                title="Quay lại popup chọn sản phẩm của Slot với sản phẩm này được chọn sẵn"
                              >
                                Chọn cho {formatSlotNumberLabel(returnToSlotContext.slotId)}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => handleEditProduct(p)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => handleDeleteProduct(p.id, p.name)}
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
};
