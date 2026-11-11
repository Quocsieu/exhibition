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
  onBackToExpo: () => void;
}

const SAMPLE_IMPORT_JSON = JSON.stringify(
  [
    {
      name: 'Cảm biến nhiệt ẩm không dây SmartNode S2',
      price: 1450000,
      currency: 'VND',
      description: 'Cảm biến Zigbee 3.0 pin 3 năm, cảnh báo qua ứng dụng di động.',
      images: ['https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80'],
      sourceUrl: 'https://example.com/products/smartnode-s2',
      sku: 'SN-S2',
    },
  ],
  null,
  2
);

const SAMPLE_IMPORT_CSV = `name,price,currency,description,imageUrl,sourceUrl,sku
"Đèn bàn thông minh Lumina Desk Pro",1890000,VND,"Đèn LED chống cận CRI 98 cảm ứng không chạm","https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80","https://example.com/products/lumina-desk-pro","LUM-DP-01"`;

function getZoneDisplayName(zone: 'counter' | 'left-shelf' | 'right-shelf'): string {
  switch (zone) {
    case 'counter':
      return 'Quầy trưng bày phía trước';
    case 'left-shelf':
      return 'Kệ trưng bày bên trái';
    case 'right-shelf':
      return 'Kệ trưng bày bên phải';
  }
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

  const [activeTab, setActiveTab] = useState<'slots' | 'booths' | 'products' | 'import'>('slots');
  const [booths, setBooths] = useState<Booth[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [slotAssignments, setSlotAssignments] = useState<BoothSlotAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Booth & Slot Manager State
  const [selectedSlotBoothId, setSelectedSlotBoothId] = useState<string>(initialBoothId || '');
  const [activeSlotId, setActiveSlotId] = useState<string>('slot_01');
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);

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

  const [extractUrlInput, setExtractUrlInput] = useState('');
  const [extractingUrl, setExtractingUrl] = useState(false);
  const [extractionNotes, setExtractionNotes] = useState<string[]>([]);

  const [batchBoothId, setBatchBoothId] = useState('');
  const [batchFormat, setBatchFormat] = useState<'json' | 'csv'>('json');
  const [batchContent, setBatchContent] = useState(SAMPLE_IMPORT_JSON);
  const [importingBatch, setImportingBatch] = useState(false);

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
        setBatchBoothId((prev) => prev || fetchedBooths[0].id);
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
      setActiveTab('slots');
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

  const activeSlotView = useMemo(
    () =>
      currentBoothSlotViews.find((s) => s.slot.slotId === activeSlotId) ||
      currentBoothSlotViews[0] ||
      null,
    [currentBoothSlotViews, activeSlotId]
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
          p.id.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
        );
      });
  }, [products, selectedBoothForSlots, productSearchQuery]);

  const handleSelectBoothForSlotManager = (boothId: string) => {
    setSelectedSlotBoothId(boothId);
    setActiveSlotId('slot_01');
    setActiveTab('slots');
    onNavigateBoothSlots?.(boothId);
  };

  const handleAssignProductToSlot = async (boothId: string, slotId: string, productId: string) => {
    setSavingSlotId(slotId);
    setStatusMessage(null);
    try {
      await apiClient.assignProductToSlot(boothId, slotId, productId);
      const updatedSlots = await apiClient.getSlots();
      setSlotAssignments(updatedSlots.assignments);
      const product = products.find((p) => p.id === productId);
      setStatusMessage({
        type: 'success',
        text: `Đã gán sản phẩm "${product?.name || productId}" vào vị trí ${slotId.toUpperCase()} của gian hàng!`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi gán sản phẩm vào vị trí trưng bày.',
      });
    } finally {
      setSavingSlotId(null);
    }
  };

  const handleClearSlot = async (boothId: string, slotId: string) => {
    setSavingSlotId(slotId);
    setStatusMessage(null);
    try {
      await apiClient.clearBoothSlot(boothId, slotId);
      const updatedSlots = await apiClient.getSlots();
      setSlotAssignments(updatedSlots.assignments);
      setStatusMessage({
        type: 'success',
        text: `Đã gỡ sản phẩm khỏi vị trí ${slotId.toUpperCase()}.`,
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

  const resetProductForm = () => {
    setEditingProductId(null);
    setImagesInput('');
    setExtractionNotes([]);
    setProductForm({
      boothId: selectedBoothForSlots?.id || booths[0]?.id || '',
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
      } else {
        await apiClient.createProduct(payload);
        setStatusMessage({ type: 'success', text: 'Đã tạo sản phẩm mới thành công!' });
      }
      resetProductForm();
      await loadData();
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

  const handleExtractFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractUrlInput.trim()) return;
    setExtractingUrl(true);
    setStatusMessage(null);
    setExtractionNotes([]);

    try {
      const draft = await apiClient.extractProductFromUrl(extractUrlInput.trim());
      setEditingProductId(null);
      setProductForm({
        boothId: productForm.boothId || booths[0]?.id || '',
        name: draft.name || '',
        price: draft.price || 0,
        currency: draft.currency || 'VND',
        description: draft.description || '',
        images: draft.images || [],
        videoUrl: draft.videoUrl || '',
        modelUrl: '',
        sourceUrl: draft.sourceUrl || extractUrlInput.trim(),
        contactUrl: '',
        sku: draft.sku || '',
        inStock: draft.inStock ?? true,
      });
      setImagesInput((draft.images || []).join('\n'));
      setExtractionNotes([
        `Phương thức trích xuất: ${draft.extractionMethod.toUpperCase()}`,
        ...(draft.warnings || []),
      ]);
      setActiveTab('products');
      setStatusMessage({
        type: 'success',
        text: 'Đã trích xuất thông tin từ URL! Vui lòng kiểm tra/chỉnh sửa dữ liệu bên dưới trước khi lưu.',
      });
    } catch (err) {
      setEditingProductId(null);
      setProductForm((prev) => ({
        ...prev,
        boothId: prev.boothId || booths[0]?.id || '',
        sourceUrl: extractUrlInput.trim(),
      }));
      setActiveTab('products');
      setStatusMessage({
        type: 'error',
        text: `${
          err instanceof Error ? err.message : 'Không thể tự động trích xuất URL này.'
        } — Đã chuyển sang biểu mẫu nhập thủ công với URL nguồn được điền sẵn.`,
      });
    } finally {
      setExtractingUrl(false);
    }
  };

  const handleBatchImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchBoothId) {
      setStatusMessage({ type: 'error', text: 'Vui lòng chọn gian hàng đích.' });
      return;
    }
    setImportingBatch(true);
    setStatusMessage(null);
    try {
      const result = await apiClient.importProductsBatch(batchBoothId, batchFormat, batchContent);
      setStatusMessage({
        type: 'success',
        text: `Đã import thành công ${result.importedCount} sản phẩm vào gian hàng!`,
      });
      await loadData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi import dữ liệu hàng loạt.',
      });
    } finally {
      setImportingBatch(false);
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
              <button type="button" className="btn btn--ghost" onClick={onBackToExpo}>
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
          <h1>⚙️ Bảng Điều Khiển Quản Trị — Gian Hàng & Vị Trí Trưng Bày (Slots)</h1>
          <p>
            Tổng cộng: <strong>{booths.length}</strong> gian hàng ·{' '}
            <strong>{booths.length * BOOTH_SLOT_DEFINITIONS.length}</strong> vị trí slot (
            <strong>{slotAssignments.length}</strong> vị trí đang trưng bày) ·{' '}
            <strong>{products.length}</strong> sản phẩm trong cơ sở dữ liệu SQLite
          </p>
        </div>
        <div className="dashboard-header__actions">
          <button type="button" className="btn btn--secondary" onClick={onBackToExpo}>
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
            onNavigateBoothSlots?.(selectedSlotBoothId || null);
          }}
        >
          🗂️ Quản lý Gian hàng & Slot ({slotAssignments.length}/{booths.length * BOOTH_SLOT_DEFINITIONS.length})
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'booths' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('booths')}
        >
          🏛️ Cấu hình Gian hàng ({booths.length})
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'products' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          📦 Kho Sản phẩm ({products.length})
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'import' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          🔗 Import Sản phẩm (URL / JSON / CSV)
        </button>
      </nav>

      {loading && <p className="loading-text">⏳ Đang đồng bộ dữ liệu...</p>}

      {/* ====================================================================
          TAB 1: QUẢN LÝ GIAN HÀNG & VỊ TRÍ TRƯNG BÀY SẢN PHẨM (SLOTS)
         ==================================================================== */}
      {activeTab === 'slots' && (
        <div className="slot-manager-container">
          {/* 1. Danh sách 6 gian hàng kèm trạng thái lấp đầy Slot */}
          <section className="dashboard-card">
            <div className="slot-section-header">
              <div>
                <h2>1. Danh sách Gian hàng Triển lãm (/admin/booths)</h2>
                <p className="card-help">
                  Chọn một gian hàng bên dưới để quản lý 6 vị trí trưng bày sản phẩm cố định (2 vị trí Quầy trước, 2 vị trí Kệ trái, 2 vị trí Kệ phải).
                </p>
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Màu</th>
                    <th>Tên doanh nghiệp</th>
                    <th>Tên gian hàng</th>
                    <th>Booth ID</th>
                    <th>Tổng số Slot</th>
                    <th>Slot đã trưng bày</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {booths.map((b) => {
                    const bSlots = slotsByBooth[b.id] || [];
                    const occupiedCount = bSlots.filter((s) => Boolean(s.product)).length;
                    const isSelected = selectedBoothForSlots?.id === b.id;
                    return (
                      <tr
                        key={b.id}
                        className={isSelected ? 'admin-table__row--selected' : ''}
                      >
                        <td>
                          <span className="color-pill" style={{ backgroundColor: b.color }} />
                        </td>
                        <td>
                          <strong>{b.companyName || b.name}</strong>
                          <div className="table-sub">{b.category}</div>
                        </td>
                        <td>{b.name}</td>
                        <td>
                          <code>{b.id}</code>
                        </td>
                        <td>{BOOTH_SLOT_DEFINITIONS.length} vị trí</td>
                        <td>
                          <span
                            className={`badge ${
                              occupiedCount > 0 ? 'badge--success' : 'badge--neutral'
                            }`}
                          >
                            {occupiedCount} / {BOOTH_SLOT_DEFINITIONS.length} có sản phẩm
                          </span>
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className={`btn btn--sm ${
                              isSelected ? 'btn--primary' : 'btn--secondary'
                            }`}
                            onClick={() => handleSelectBoothForSlotManager(b.id)}
                          >
                            {isSelected ? '✓ Đang quản lý Slot' : '🗂️ Quản lý Slot'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Sơ đồ trực quan & Quản lý từng Slot của gian hàng đang chọn */}
          {selectedBoothForSlots && (
            <div className="dashboard-grid slot-manager-detail-grid">
              {/* Cột Trái: Sơ đồ 2D Gian hàng + Danh sách 6 Slot */}
              <section className="dashboard-card">
                <div className="slot-booth-banner" style={{ borderLeftColor: selectedBoothForSlots.color }}>
                  <div>
                    <span className="badge badge--neutral">{selectedBoothForSlots.id}</span>
                    <h2>
                      {selectedBoothForSlots.companyName || selectedBoothForSlots.name} —{' '}
                      {selectedBoothForSlots.name}
                    </h2>
                    <p className="card-help">
                      Sơ đồ vị trí trưng bày 3D chuẩn hội chợ triển lãm. Bấm vào một ô vị trí (Slot) để gán, thay thế hoặc gỡ sản phẩm.
                    </p>
                  </div>
                </div>

                {/* Sơ đồ trực quan 2D mô phỏng Gian hàng hội chợ (Backdrop + Kệ trái/phải + Quầy trước) */}
                <div className="booth-schematic" aria-label="Sơ đồ bố trí 6 vị trí trưng bày trong gian hàng">
                  <div
                    className="booth-schematic__backdrop"
                    style={{ borderColor: selectedBoothForSlots.color }}
                  >
                    <span className="booth-schematic__backdrop-badge">BACKDROP PHÍA SAU</span>
                    <strong>{selectedBoothForSlots.companyName || selectedBoothForSlots.name}</strong>
                    <span>{selectedBoothForSlots.tagline}</span>
                  </div>

                  <div className="booth-schematic__middle">
                    {/* Kệ Trái (slot_03, slot_04) */}
                    <div className="booth-schematic__zone">
                      <span className="booth-schematic__zone-title">KỆ TRÁI 2 TẦNG</span>
                      {['slot_03', 'slot_04'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        return (
                          <button
                            key={sid}
                            type="button"
                            className={`slot-schematic-box ${
                              sv.product ? 'slot-schematic-box--occupied' : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => setActiveSlotId(sid)}
                          >
                            <div className="slot-schematic-box__header">
                              <code>{sid}</code>
                              <span>{sv.slot.label}</span>
                            </div>
                            <div className="slot-schematic-box__body">
                              {sv.product ? (
                                <>
                                  <strong>{sv.product.name}</strong>
                                  <span>{formatCurrency(sv.product.price, sv.product.currency)}</span>
                                </>
                              ) : (
                                <span className="slot-schematic-box__empty-label">○ Vị trí trống</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Lối vào & Không gian trung tâm */}
                    <div className="booth-schematic__center-floor">
                      <span>KHÔNG GIAN TRƯNG BÀY 3D</span>
                      <small>Không dùng sidebar phải · Click trực tiếp vào 3D</small>
                    </div>

                    {/* Kệ Phải (slot_05, slot_06) */}
                    <div className="booth-schematic__zone">
                      <span className="booth-schematic__zone-title">KỆ PHẢI 2 TẦNG</span>
                      {['slot_05', 'slot_06'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        return (
                          <button
                            key={sid}
                            type="button"
                            className={`slot-schematic-box ${
                              sv.product ? 'slot-schematic-box--occupied' : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => setActiveSlotId(sid)}
                          >
                            <div className="slot-schematic-box__header">
                              <code>{sid}</code>
                              <span>{sv.slot.label}</span>
                            </div>
                            <div className="slot-schematic-box__body">
                              {sv.product ? (
                                <>
                                  <strong>{sv.product.name}</strong>
                                  <span>{formatCurrency(sv.product.price, sv.product.currency)}</span>
                                </>
                              ) : (
                                <span className="slot-schematic-box__empty-label">○ Vị trí trống</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quầy Trưng Bày Phía Trước (slot_01, slot_02) */}
                  <div className="booth-schematic__counter">
                    <span className="booth-schematic__zone-title">
                      QUẦY TRƯNG BÀY PHÍA TRƯỚC (FRONT COUNTER)
                    </span>
                    <div className="booth-schematic__counter-slots">
                      {['slot_01', 'slot_02'].map((sid) => {
                        const sv = currentBoothSlotViews.find((s) => s.slot.slotId === sid);
                        if (!sv) return null;
                        const active = activeSlotId === sid;
                        return (
                          <button
                            key={sid}
                            type="button"
                            className={`slot-schematic-box ${
                              sv.product ? 'slot-schematic-box--occupied' : 'slot-schematic-box--empty'
                            } ${active ? 'slot-schematic-box--active' : ''}`}
                            onClick={() => setActiveSlotId(sid)}
                          >
                            <div className="slot-schematic-box__header">
                              <code>{sid}</code>
                              <span>{sv.slot.label}</span>
                            </div>
                            <div className="slot-schematic-box__body">
                              {sv.product ? (
                                <>
                                  <strong>{sv.product.name}</strong>
                                  <span>{formatCurrency(sv.product.price, sv.product.currency)}</span>
                                </>
                              ) : (
                                <span className="slot-schematic-box__empty-label">○ Vị trí trống</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Bảng danh sách 6 Slot của gian hàng */}
                <h3>Danh sách 6 Vị trí Trưng bày ({selectedBoothForSlots.id})</h3>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Slot ID</th>
                        <th>Vị trí trên quầy/kệ</th>
                        <th>Trạng thái</th>
                        <th>Sản phẩm đang gán</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentBoothSlotViews.map((sv) => {
                        const isCurrentSlot = activeSlotId === sv.slot.slotId;
                        const isBusy = savingSlotId === sv.slot.slotId;
                        return (
                          <tr
                            key={sv.slot.slotId}
                            className={isCurrentSlot ? 'admin-table__row--selected' : ''}
                          >
                            <td>
                              <code>{sv.slot.slotId}</code>
                            </td>
                            <td>
                              <strong>{sv.slot.label}</strong>
                              <div className="table-sub">
                                Tọa độ 3D: ({sv.slot.position.join(', ')})
                              </div>
                            </td>
                            <td>
                              {sv.product ? (
                                <span className="badge badge--success">Đang trưng bày</span>
                              ) : (
                                <span className="badge badge--neutral">Trống</span>
                              )}
                            </td>
                            <td>
                              {sv.product ? (
                                <div>
                                  <strong>{sv.product.name}</strong>
                                  <div className="table-sub">
                                    ID: <code>{sv.product.id}</code> ·{' '}
                                    {formatCurrency(sv.product.price, sv.product.currency)}
                                  </div>
                                </div>
                              ) : (
                                <span className="table-sub">Chưa gán sản phẩm</span>
                              )}
                            </td>
                            <td className="table-actions">
                              <button
                                type="button"
                                className={`btn btn--sm ${
                                  isCurrentSlot ? 'btn--primary' : 'btn--secondary'
                                }`}
                                onClick={() => setActiveSlotId(sv.slot.slotId)}
                              >
                                {sv.product ? 'Đổi SP' : '＋ Gán SP'}
                              </button>
                              {sv.product && (
                                <button
                                  type="button"
                                  className="btn btn--danger btn--sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleClearSlot(selectedBoothForSlots.id, sv.slot.slotId)
                                  }
                                >
                                  Gỡ
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Cột Phải: Bộ chọn Sản phẩm để gán vào Slot đang chọn */}
              <section className="dashboard-card">
                {activeSlotView && (
                  <>
                    <div className="slot-selector-header">
                      <span className="badge badge--success">
                        ĐANG CHỌN: {activeSlotView.slot.slotId.toUpperCase()}
                      </span>
                      <h2>Gán Sản phẩm vào {activeSlotView.slot.label}</h2>
                      <p className="card-help">
                        Khu vực: <strong>{getZoneDisplayName(activeSlotView.slot.zone)}</strong> ·
                        Kích thước tối đa (Rộng × Cao × Sâu):{' '}
                        <code>{activeSlotView.slot.maxSize.join('m × ')}m</code>
                      </p>
                    </div>

                    {/* Trạng thái hiện tại của Slot đang chọn */}
                    <div className="slot-current-card">
                      <div className="slot-current-card__label">Sản phẩm đang đặt tại vị trí này:</div>
                      {activeSlotView.product ? (
                        <div className="slot-current-card__content">
                          {activeSlotView.product.images[0] ? (
                            <img
                              src={activeSlotView.product.images[0]}
                              alt={activeSlotView.product.name}
                              className="slot-product-thumb"
                            />
                          ) : (
                            <div className="slot-product-thumb slot-product-thumb--placeholder">
                              📦
                            </div>
                          )}
                          <div className="slot-current-card__info">
                            <strong>{activeSlotView.product.name}</strong>
                            <span>
                              Mã ID: <code>{activeSlotView.product.id}</code>
                              {activeSlotView.product.sku
                                ? ` · SKU: ${activeSlotView.product.sku}`
                                : ''}
                            </span>
                            <span className="slot-current-card__price">
                              {formatCurrency(
                                activeSlotView.product.price,
                                activeSlotView.product.currency
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={savingSlotId === activeSlotView.slot.slotId}
                            onClick={() =>
                              handleClearSlot(
                                selectedBoothForSlots.id,
                                activeSlotView.slot.slotId
                              )
                            }
                          >
                            🗑️ Gỡ khỏi slot
                          </button>
                        </div>
                      ) : (
                        <div className="slot-current-card__empty">
                          Vị trí <code>{activeSlotView.slot.slotId}</code> hiện đang trống. Hãy chọn một sản phẩm bên dưới để đặt lên kệ 3D.
                        </div>
                      )}
                    </div>

                    {/* Tìm kiếm & Danh sách sản phẩm thuộc Gian hàng */}
                    <div className="form-field" style={{ marginTop: '1rem' }}>
                      <label htmlFor={`${formIdPrefix}-slot-search`}>
                        Tìm kiếm sản phẩm thuộc gian hàng {selectedBoothForSlots.name}
                      </label>
                      <input
                        id={`${formIdPrefix}-slot-search`}
                        type="search"
                        placeholder="Nhập tên sản phẩm, mã SKU hoặc ID..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                      />
                    </div>

                    <div className="slot-product-picker-list">
                      {boothProductsForSelector.length === 0 ? (
                        <div className="empty-state">
                          <p>Không tìm thấy sản phẩm phù hợp trong gian hàng này.</p>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => {
                              resetProductForm();
                              setProductForm((prev) => ({
                                ...prev,
                                boothId: selectedBoothForSlots.id,
                              }));
                              setActiveTab('products');
                            }}
                          >
                            ＋ Tạo sản phẩm mới cho gian hàng này
                          </button>
                        </div>
                      ) : (
                        boothProductsForSelector.map((prod) => {
                          const isAssignedHere = activeSlotView.product?.id === prod.id;
                          const assignedInOtherSlot = currentBoothSlotViews.find(
                            (s) =>
                              s.product?.id === prod.id &&
                              s.slot.slotId !== activeSlotView.slot.slotId
                          );
                          const isSaving = savingSlotId === activeSlotView.slot.slotId;

                          return (
                            <div
                              key={prod.id}
                              className={`slot-product-picker-item ${
                                isAssignedHere ? 'slot-product-picker-item--active' : ''
                              }`}
                            >
                              {prod.images[0] ? (
                                <img
                                  src={prod.images[0]}
                                  alt={prod.name}
                                  className="slot-product-thumb"
                                />
                              ) : (
                                <div className="slot-product-thumb slot-product-thumb--placeholder">
                                  📦
                                </div>
                              )}

                              <div className="slot-product-picker-item__info">
                                <strong>{prod.name}</strong>
                                <div className="table-sub">
                                  ID: <code>{prod.id}</code>
                                  {prod.sku ? ` · SKU: ${prod.sku}` : ''} ·{' '}
                                  <strong>{formatCurrency(prod.price, prod.currency)}</strong>
                                </div>
                                {assignedInOtherSlot && (
                                  <span className="badge badge--neutral">
                                    Đang đặt tại {assignedInOtherSlot.slot.slotId} (
                                    {assignedInOtherSlot.slot.label})
                                  </span>
                                )}
                              </div>

                              <div className="slot-product-picker-item__actions">
                                {isAssignedHere ? (
                                  <span className="badge badge--success">✓ Đang ở slot này</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn--primary btn--sm"
                                    disabled={isSaving}
                                    onClick={() =>
                                      handleAssignProductToSlot(
                                        selectedBoothForSlots.id,
                                        activeSlotView.slot.slotId,
                                        prod.id
                                      )
                                    }
                                  >
                                    {activeSlotView.product
                                      ? `Thay vào ${activeSlotView.slot.slotId}`
                                      : `Gán vào ${activeSlotView.slot.slotId}`}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="dashboard-form__actions" style={{ marginTop: '1.25rem' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => {
                          resetProductForm();
                          setProductForm((prev) => ({
                            ...prev,
                            boothId: selectedBoothForSlots.id,
                          }));
                          setActiveTab('products');
                        }}
                      >
                        ＋ Thêm sản phẩm mới cho {selectedBoothForSlots.name}
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={onBackToExpo}
                      >
                        👁️ Xem kết quả trong Không gian 3D
                      </button>
                    </div>
                  </>
                )}
              </section>
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

              <fieldset className="form-fieldset">
                <legend>Tọa độ trong khuôn viên 3D (-20 đến 20)</legend>
                <div className="form-row-2">
                  <div className="form-field">
                    <label htmlFor={`${formIdPrefix}-bx`}>Tọa độ X</label>
                    <input
                      id={`${formIdPrefix}-bx`}
                      name="positionX"
                      type="number"
                      step="0.5"
                      min={-20}
                      max={20}
                      required
                      value={boothForm.positionX}
                      onChange={(e) =>
                        setBoothForm({ ...boothForm, positionX: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`${formIdPrefix}-bz`}>Tọa độ Z</label>
                    <input
                      id={`${formIdPrefix}-bz`}
                      name="positionZ"
                      type="number"
                      step="0.5"
                      min={-20}
                      max={20}
                      required
                      value={boothForm.positionZ}
                      onChange={(e) =>
                        setBoothForm({ ...boothForm, positionZ: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </fieldset>

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
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h2>{editingProductId ? 'Chỉnh sửa Sản phẩm' : 'Thêm / Lưu Sản phẩm'}</h2>

            {extractionNotes.length > 0 && (
              <div className="extraction-notes">
                <strong>Kết quả trích xuất tự động:</strong>
                <ul>
                  {extractionNotes.map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

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
                  <button type="button" className="btn btn--ghost" onClick={resetProductForm}>
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
      )}

      {/* ====================================================================
          TAB 4: IMPORT SẢN PHẨM ĐA NGUỒN
         ==================================================================== */}
      {activeTab === 'import' && (
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h2>1. Trích xuất sản phẩm từ URL Website bên ngoài</h2>
            <p className="card-help">
              Hệ thống đọc dữ liệu có cấu trúc <code>schema.org/Product</code> (JSON-LD) và thẻ{' '}
              <code>Open Graph</code> từ URL công khai. Có kiểm soát bảo mật chống SSRF (chặn
              localhost/private IP, giới hạn dung lượng và thời gian chờ).
            </p>

            <form onSubmit={handleExtractFromUrl} className="dashboard-form">
              <div className="form-field">
                <label htmlFor={`${formIdPrefix}-extract-url`}>
                  Dán URL trang sản phẩm (HTTP/HTTPS công khai) *
                </label>
                <input
                  id={`${formIdPrefix}-extract-url`}
                  name="extractUrl"
                  type="url"
                  required
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={extractUrlInput}
                  onChange={(e) => setExtractUrlInput(e.target.value)}
                />
              </div>

              <div className="dashboard-form__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={extractingUrl}
                >
                  {extractingUrl ? '⏳ Đang phân tích URL...' : '🔍 Trích xuất & Chỉnh sửa trước khi lưu'}
                </button>
              </div>
            </form>
          </section>

          <section className="dashboard-card">
            <h2>2. Import hàng loạt qua JSON hoặc CSV</h2>
            <p className="card-help">
              Dành cho danh mục sản phẩm xuất từ Shopify, WooCommerce, Sapo, Haravan hoặc file dữ
              liệu chuẩn.
            </p>

            <form onSubmit={handleBatchImport} className="dashboard-form">
              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor={`${formIdPrefix}-batch-booth`}>Gán vào Gian hàng *</label>
                  <select
                    id={`${formIdPrefix}-batch-booth`}
                    name="batchBoothId"
                    required
                    value={batchBoothId}
                    onChange={(e) => setBatchBoothId(e.target.value)}
                  >
                    {booths.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset className="form-fieldset">
                  <legend>Định dạng dữ liệu</legend>
                  <div className="radio-inline-group">
                    <input
                      id={`${formIdPrefix}-fmt-json`}
                      type="radio"
                      name="batchFormat"
                      value="json"
                      checked={batchFormat === 'json'}
                      onChange={() => {
                        setBatchFormat('json');
                        setBatchContent(SAMPLE_IMPORT_JSON);
                      }}
                    />
                    <label htmlFor={`${formIdPrefix}-fmt-json`}>JSON Array</label>

                    <input
                      id={`${formIdPrefix}-fmt-csv`}
                      type="radio"
                      name="batchFormat"
                      value="csv"
                      checked={batchFormat === 'csv'}
                      onChange={() => {
                        setBatchFormat('csv');
                        setBatchContent(SAMPLE_IMPORT_CSV);
                      }}
                    />
                    <label htmlFor={`${formIdPrefix}-fmt-csv`}>CSV</label>
                  </div>
                </fieldset>
              </div>

              <div className="form-field">
                <label htmlFor={`${formIdPrefix}-batch-content`}>
                  Nội dung {batchFormat.toUpperCase()} *
                </label>
                <textarea
                  id={`${formIdPrefix}-batch-content`}
                  name="batchContent"
                  rows={8}
                  required
                  value={batchContent}
                  onChange={(e) => setBatchContent(e.target.value)}
                />
              </div>

              <div className="dashboard-form__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={importingBatch}
                >
                  {importingBatch ? '⏳ Đang import...' : '📥 Thực hiện Import vào Gian hàng'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};
