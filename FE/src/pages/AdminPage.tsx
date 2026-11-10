import React, { useCallback, useEffect, useId, useState } from 'react';
import type {
  Booth,
  CreateBoothInput,
  Product,
  CreateProductInput,
} from '../types/expo';
import { apiClient } from '../services/api';
import { formatCurrency } from '../components/ProductPanel';

export interface AdminPageProps {
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

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToExpo }) => {
  const formIdPrefix = useId();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'booths' | 'products' | 'import'>('booths');
  const [booths, setBooths] = useState<Booth[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editingBoothId, setEditingBoothId] = useState<string | null>(null);
  const [boothForm, setBoothForm] = useState<CreateBoothInput>({
    name: '',
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
      const [fetchedBooths, fetchedProducts] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      if (fetchedBooths.length > 0) {
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
  }, []);

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
      boothId: booths[0]?.id || '',
      name: '',
      price: 0,
      currency: 'VND',
      description: '',
      images: [],
      videoUrl: '',
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
            <p>Đăng nhập để quản lý gian hàng, sản phẩm và công cụ Import đa nguồn.</p>
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
          <h1>⚙️ Bảng Điều Khiển Quản Trị — Virtual Expo 2.5D</h1>
          <p>
            Tổng cộng: <strong>{booths.length}</strong> gian hàng ·{' '}
            <strong>{products.length}</strong> sản phẩm trong cơ sở dữ liệu SQLite
          </p>
        </div>
        <div className="dashboard-header__actions">
          <button type="button" className="btn btn--secondary" onClick={onBackToExpo}>
            🌐 Quay lại Khuôn viên 3D
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
          className={`dashboard-tab ${activeTab === 'booths' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('booths')}
        >
          🏛️ Quản lý Gian hàng ({booths.length})
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'products' ? 'dashboard-tab--active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          📦 Quản lý Sản phẩm ({products.length})
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

      {activeTab === 'booths' && (
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h2>{editingBoothId ? 'Chỉnh sửa Gian hàng' : 'Thêm Gian hàng Mới'}</h2>
            <form onSubmit={handleSaveBooth} className="dashboard-form">
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
                <label htmlFor={`${formIdPrefix}-btag`}>Khẩu hiệu (Tagline)</label>
                <input
                  id={`${formIdPrefix}-btag`}
                  name="tagline"
                  type="text"
                  value={boothForm.tagline}
                  onChange={(e) => setBoothForm({ ...boothForm, tagline: e.target.value })}
                />
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
                    <th>Tên gian hàng</th>
                    <th>Vị trí (X, Z)</th>
                    <th>SP</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {booths.map((b) => {
                    const count = products.filter((p) => p.boothId === b.id).length;
                    return (
                      <tr key={b.id}>
                        <td>
                          <span className="color-pill" style={{ backgroundColor: b.color }} />
                        </td>
                        <td>
                          <strong>{b.name}</strong>
                          <div className="table-sub">{b.category}</div>
                        </td>
                        <td>
                          ({b.positionX}, {b.positionZ})
                        </td>
                        <td>{count}</td>
                        <td className="table-actions">
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
                      {b.name} ({b.category})
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
                    <th>Giá</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const booth = booths.find((b) => b.id === p.boothId);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <div className="table-sub">
                            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                              Nguồn ↗
                            </a>
                          </div>
                        </td>
                        <td>{booth?.name || p.boothId}</td>
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
