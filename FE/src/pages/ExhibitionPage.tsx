import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type Booth,
  type Product,
  type BoothSlotAssignment,
  type BoothSlotView,
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
  FALLBACK_SLOT_ASSIGNMENTS,
  CENTRAL_SPAWN_POINT,
  getBoothApproachPoint,
  isPointWalkable,
} from '../types/expo';
import { ExhibitionScene, type CameraViewMode } from '../scene/ExhibitionScene';
import { useClickToMove, type PlayerTransform } from '../controls/useClickToMove';
import { MobileJoystick } from '../controls/MobileJoystick';
import { BoothPanel } from '../components/BoothPanel';
import { LoadingScreen } from '../components/LoadingScreen';
import { useRealtime } from '../hooks/useRealtime';
import {
  apiClient,
  buildBoothSlotViews,
  EXPO_DATA_MUTATED_EVENT,
  EXPO_DATA_SYNC_CHANNEL,
  EXPO_DATA_UPDATED_STORAGE_KEY,
} from '../services/api';

const AVATAR_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
];

const OVERVIEW_DEFAULT_ZOOM = 18.5;
const EXPLORE_DEFAULT_ZOOM = 34;
const FOCUS_DEFAULT_ZOOM = 48;

function getStoredIdentity(): { name: string; color: string } {
  const savedName = sessionStorage.getItem('expo_visitor_name');
  const savedColor = sessionStorage.getItem('expo_visitor_color');
  if (savedName && savedColor) {
    return { name: savedName, color: savedColor };
  }
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const name = savedName || `Khách #${randomSuffix}`;
  const color = savedColor || AVATAR_COLORS[randomSuffix % AVATAR_COLORS.length];
  sessionStorage.setItem('expo_visitor_name', name);
  sessionStorage.setItem('expo_visitor_color', color);
  return { name, color };
}

function getInitialVisitorSpawn(): {
  x: number;
  z: number;
  rotationY: number;
  restored: boolean;
} {
  try {
    const raw = sessionStorage.getItem('expo_visitor_pos');
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: unknown; z?: unknown; rotationY?: unknown };
      if (
        typeof parsed.x === 'number' &&
        Number.isFinite(parsed.x) &&
        typeof parsed.z === 'number' &&
        Number.isFinite(parsed.z) &&
        isPointWalkable(parsed.x, parsed.z, DEFAULT_BOOTHS)
      ) {
        return {
          x: parsed.x,
          z: parsed.z,
          rotationY:
            typeof parsed.rotationY === 'number' && Number.isFinite(parsed.rotationY)
              ? parsed.rotationY
              : CENTRAL_SPAWN_POINT.rotationY,
          restored: true,
        };
      }
    }
  } catch {
    // Ignore storage read errors and fall back to Central Plaza spawn
  }
  return {
    x: CENTRAL_SPAWN_POINT.x,
    z: CENTRAL_SPAWN_POINT.z,
    rotationY: CENTRAL_SPAWN_POINT.rotationY,
    restored: false,
  };
}

export interface ExhibitionPageProps {
  initialFocusBoothId?: string | null;
  onOpenAdmin: () => void;
}

export const ExhibitionPage: React.FC<ExhibitionPageProps> = ({
  initialFocusBoothId = null,
  onOpenAdmin,
}) => {
  const initialIdentity = useMemo(() => getStoredIdentity(), []);
  const initialSpawn = useMemo(() => getInitialVisitorSpawn(), []);
  const hasLockedPositionRef = useRef<boolean>(initialSpawn.restored);
  const [playerName, setPlayerName] = useState(initialIdentity.name);
  const [playerColor, setPlayerColor] = useState(initialIdentity.color);

  const [booths, setBooths] = useState<Booth[]>(DEFAULT_BOOTHS);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [slotAssignments, setSlotAssignments] = useState<BoothSlotAssignment[]>(
    FALLBACK_SLOT_ASSIGNMENTS
  );
  const [loadingData, setLoadingData] = useState(true);
  const [dataWarning, setDataWarning] = useState<string | null>(null);

  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [focusedBooth, setFocusedBooth] = useState<Booth | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('explore');
  const previousExteriorModeRef = useRef<'overview' | 'explore'>('explore');
  const cameraYawRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(EXPLORE_DEFAULT_ZOOM);
  const [showHelp, setShowHelp] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(playerName);
  const [draftColor, setDraftColor] = useState(playerColor);

  const nameInputId = useId();
  const boothSelectId = useId();

  const loadExpoData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [fetchedBooths, fetchedProducts, fetchedSlots] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
        apiClient.getSlots().catch(() => ({
          slotDefinitions: [],
          assignments: FALLBACK_SLOT_ASSIGNMENTS,
        })),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      setDataWarning(null);
    } catch {
      setBooths(DEFAULT_BOOTHS);
      setProducts(DEFAULT_PRODUCTS);
      setSlotAssignments(FALLBACK_SLOT_ASSIGNMENTS);
      setDataWarning('Đang hiển thị dữ liệu mẫu cục bộ (Chưa kết nối được API Backend).');
    } finally {
      setLoadingData(false);
    }
  }, []);

  /**
   * Silent background refresh for Scenarios B, C, and D:
   * Fetches latest booths, products, and slot assignments from SQLite without
   * triggering the full-screen loading overlay, and synchronizes active booth/product state.
   */
  const refreshExpoDataSilently = useCallback(async () => {
    try {
      const [fetchedBooths, fetchedProducts, fetchedSlots] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
        apiClient.getSlots(),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setSlotAssignments(fetchedSlots.assignments);
      setDataWarning(null);
    } catch {
      // Keep current in-memory state if background refresh encounters transient network error
    }
  }, []);

  useEffect(() => {
    void loadExpoData();
  }, [loadExpoData]);

  // Keep selectedBooth, focusedBooth, and selectedProduct synchronized whenever
  // booths or products state refreshes so the 3D scene & panels never hold stale snapshots.
  useEffect(() => {
    setSelectedBooth((prev) => (prev ? booths.find((b) => b.id === prev.id) ?? null : null));
    setFocusedBooth((prev) => (prev ? booths.find((b) => b.id === prev.id) ?? null : null));
  }, [booths]);

  useEffect(() => {
    setSelectedProduct((prev) => (prev ? products.find((p) => p.id === prev.id) ?? null : null));
  }, [products]);

  // Listen for window focus, visibility change, and cross-tab BroadcastChannel/storage events
  // so edits made in Admin (in another tab or window) immediately sync to the 3D visitor view.
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshExpoDataSilently();
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === EXPO_DATA_UPDATED_STORAGE_KEY) {
        void refreshExpoDataSilently();
      }
    };
    const handleCustomMutated = () => {
      void refreshExpoDataSilently();
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(EXPO_DATA_MUTATED_EVENT, handleCustomMutated);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(EXPO_DATA_SYNC_CHANNEL);
        bc.onmessage = () => {
          void refreshExpoDataSilently();
        };
      }
    } catch {
      bc = null;
    }

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EXPO_DATA_MUTATED_EVENT, handleCustomMutated);
      bc?.close();
    };
  }, [refreshExpoDataSilently]);

  const handleSelectBooth = useCallback(
    (booth: Booth) => {
      setCameraMode((prev) => {
        if (prev === 'overview' || prev === 'explore') {
          previousExteriorModeRef.current = prev;
        }
        return 'focus';
      });
      const latestBooth = booths.find((b) => b.id === booth.id) || booth;
      setSelectedBooth(latestBooth);
      setSelectedProduct(null);
      setFocusedBooth(latestBooth);
      setZoom(FOCUS_DEFAULT_ZOOM);
      void refreshExpoDataSilently();
    },
    [booths, refreshExpoDataSilently]
  );

  useEffect(() => {
    if (!initialFocusBoothId || loadingData) return;
    const targetBooth = booths.find((b) => b.id === initialFocusBoothId);
    if (targetBooth) {
      handleSelectBooth(targetBooth);
    }
  }, [initialFocusBoothId, loadingData, booths, handleSelectBooth]);

  const handleReachBooth = useCallback(
    (booth: Booth) => {
      setCameraMode((prev) => {
        if (prev === 'overview' || prev === 'explore') {
          previousExteriorModeRef.current = prev;
        }
        return 'focus';
      });
      const latestBooth = booths.find((b) => b.id === booth.id) || booth;
      setSelectedBooth(latestBooth);
      setSelectedProduct(null);
      setFocusedBooth(latestBooth);
      setZoom(FOCUS_DEFAULT_ZOOM);
      void refreshExpoDataSilently();
    },
    [booths, refreshExpoDataSilently]
  );

  const emitMovementRef = useRef<
    ((payload: {
      x: number;
      z: number;
      rotationY: number;
      state: 'idle' | 'walk';
      activeBoothId?: string | null;
    }) => void) | null
  >(null);

  const handleTransformChange = useCallback(
    (nextTransform: PlayerTransform) => {
      hasLockedPositionRef.current = true;
      if (nextTransform.state === 'idle') {
        try {
          sessionStorage.setItem(
            'expo_visitor_pos',
            JSON.stringify({
              x: nextTransform.x,
              z: nextTransform.z,
              rotationY: nextTransform.rotationY,
            })
          );
        } catch {
          // Ignore storage quota errors
        }
      }
      emitMovementRef.current?.({
        x: nextTransform.x,
        z: nextTransform.z,
        rotationY: nextTransform.rotationY,
        state: nextTransform.state,
        activeBoothId: selectedBooth?.id ?? null,
      });
    },
    [selectedBooth?.id]
  );

  const {
    transformRef,
    activePath,
    moveToPoint,
    setJoystickInput,
    forcePosition,
    stepMovement,
  } = useClickToMove({
    booths,
    initialPosition: initialSpawn,
    disabled: false,
    cameraYawRef,
    onTransformChange: handleTransformChange,
    onReachBooth: handleReachBooth,
  });

  const {
    isConnected,
    onlineCount,
    remoteVisitors,
    remoteVisitorsLiveRef,
    emitMovement,
    emitProfileUpdate,
  } = useRealtime({
    initialName: initialIdentity.name,
    initialColor: initialIdentity.color,
    getLiveTransform: () =>
      hasLockedPositionRef.current
        ? {
            x: transformRef.current.x,
            z: transformRef.current.z,
            rotationY: transformRef.current.rotationY,
          }
        : null,
    onWorldInitSelf: (self) => {
      if (!hasLockedPositionRef.current) {
        hasLockedPositionRef.current = true;
        transformRef.current.x = self.x;
        transformRef.current.z = self.z;
        transformRef.current.rotationY = self.rotationY;
      }
    },
    onMoveRejected: (x, z) => {
      forcePosition(x, z);
    },
  });

  emitMovementRef.current = emitMovement;

  const handleReturnToExplore = useCallback(() => {
    const restoredMode = previousExteriorModeRef.current;
    setCameraMode(restoredMode);
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(restoredMode === 'overview' ? OVERVIEW_DEFAULT_ZOOM : EXPLORE_DEFAULT_ZOOM);
  }, []);

  const handleSwitchToOverview = useCallback(() => {
    previousExteriorModeRef.current = 'overview';
    setCameraMode('overview');
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(OVERVIEW_DEFAULT_ZOOM);
  }, []);

  const handleSwitchToExplore = useCallback(() => {
    previousExteriorModeRef.current = 'explore';
    setCameraMode('explore');
    setSelectedBooth(null);
    setSelectedProduct(null);
    setFocusedBooth(null);
    setZoom(EXPLORE_DEFAULT_ZOOM);
  }, []);

  // Consistent WASD / Arrow behavior during Booth Focus Mode:
  // Pressing movement keys automatically exits Booth Focus back to Explore Mode
  // so camera follow and character movement resume seamlessly.
  useEffect(() => {
    if (cameraMode !== 'focus') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cameraMode]);

  const handleJoystickMove = useCallback(
    (dx: number, dz: number) => {
      if ((dx !== 0 || dz !== 0) && cameraMode === 'focus') {
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
      }
      setJoystickInput(dx, dz);
    },
    [cameraMode, setJoystickInput]
  );

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftName.trim().slice(0, 32);
    if (cleaned) {
      setPlayerName(cleaned);
      sessionStorage.setItem('expo_visitor_name', cleaned);
      setPlayerColor(draftColor);
      sessionStorage.setItem('expo_visitor_color', draftColor);
      emitProfileUpdate(cleaned, draftColor);
    }
    setEditingProfile(false);
  };

  const handleWalkToBooth = useCallback(
    (booth: Booth) => {
      setSelectedBooth(null);
      setFocusedBooth(booth);
      setCameraMode('explore');
      setZoom(EXPLORE_DEFAULT_ZOOM);
      const approach = getBoothApproachPoint(booth);
      moveToPoint(approach.x, approach.z, booth);
    },
    [moveToPoint]
  );

  const handleGroundClick = useCallback(
    (x: number, z: number) => {
      if (cameraMode === 'focus') {
        setCameraMode('explore');
        setSelectedBooth(null);
        setFocusedBooth(null);
        setZoom(EXPLORE_DEFAULT_ZOOM);
      }
      moveToPoint(x, z);
    },
    [cameraMode, moveToPoint]
  );

  const slotsByBooth = useMemo<Record<string, BoothSlotView[]>>(() => {
    const map: Record<string, BoothSlotView[]> = {};
    for (const b of booths) {
      map[b.id] = buildBoothSlotViews(b.id, products, slotAssignments);
    }
    return map;
  }, [booths, products, slotAssignments]);

  const productCountByBooth = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of booths) {
      const occupied = (slotsByBooth[b.id] || []).filter((s) => Boolean(s.product)).length;
      const totalBoothProds = products.filter((p) => p.boothId === b.id).length;
      counts[b.id] = occupied > 0 ? occupied : totalBoothProds;
    }
    return counts;
  }, [booths, products, slotsByBooth]);

  const handleSelectSlotProduct = useCallback(
    (product: Product | null) => {
      if (!product) {
        setSelectedProduct(null);
        return;
      }
      const ownerBooth = booths.find((b) => b.id === product.boothId) || selectedBooth;
      if (ownerBooth && selectedBooth?.id !== ownerBooth.id) {
        setSelectedBooth(ownerBooth);
        setFocusedBooth(ownerBooth);
        setCameraMode('focus');
        setZoom(FOCUS_DEFAULT_ZOOM);
      }
      setSelectedProduct(product);
    },
    [booths, selectedBooth]
  );

  const activeBoothProducts = useMemo(() => {
    const targetId = selectedBooth?.id || focusedBooth?.id;
    if (!targetId) return [];
    return products.filter((p) => p.boothId === targetId);
  }, [products, selectedBooth?.id, focusedBooth?.id]);

  const playerDescriptor = useMemo(
    () => ({
      name: playerName,
      color: playerColor,
      x: transformRef.current.x,
      z: transformRef.current.z,
      rotationY: transformRef.current.rotationY,
      state: transformRef.current.state,
    }),
    [playerName, playerColor, transformRef]
  );

  const isBoothShowcaseActive = cameraMode === 'focus' && Boolean(selectedBooth || focusedBooth);

  return (
    <main className="expo-viewport">
      {/* Top Bar HUD — Hidden during close-up Booth Showcase mode */}
      {!isBoothShowcaseActive && (
        <header className="expo-hud-top">
          <div className="expo-hud-top__brand">
            <div className="expo-hud-top__logo">3D</div>
            <div>
              <h1 className="expo-hud-top__title">Virtual Expo Plaza</h1>
              <div className="expo-hud-top__status">
                <span
                  className={`status-dot ${
                    isConnected ? 'status-dot--online' : 'status-dot--offline'
                  }`}
                />
                <span>
                  {isConnected
                    ? `${onlineCount} khách đang trực tuyến`
                    : 'Chế độ ngoại tuyến / Đang kết nối...'}
                </span>
              </div>
            </div>
          </div>

          <div className="expo-hud-top__nav">
            <div className="hud-booth-picker">
              <label htmlFor={boothSelectId} className="visually-hidden">
                Chọn gian hàng để di chuyển tới
              </label>
              <select
                id={boothSelectId}
                name="boothQuickNav"
                className="hud-select"
                defaultValue=""
                onChange={(e) => {
                  const booth = booths.find((b) => b.id === e.target.value);
                  if (booth) {
                    handleWalkToBooth(booth);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>
                  📍 Đi nhanh tới gian hàng ({booths.length})...
                </option>
                {booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.category}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setDraftName(playerName);
                setDraftColor(playerColor);
                setEditingProfile((v) => !v);
              }}
            >
              <span className="avatar-dot" style={{ backgroundColor: playerColor }} />
              {playerName} ✎
            </button>

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
            >
              ❓ Hướng dẫn
            </button>

            <button type="button" className="btn btn--primary btn--sm" onClick={onOpenAdmin}>
              ⚙️ Quản trị (Dashboard)
            </button>
          </div>
        </header>
      )}

      {/* Profile Editor Popover */}
      {!isBoothShowcaseActive && editingProfile && (
        <div className="hud-profile-card" role="region" aria-label="Đổi tên và màu nhân vật">
          <form onSubmit={handleProfileSubmit} className="hud-profile-form">
            <div className="form-field">
              <label htmlFor={nameInputId}>Tên hiển thị của bạn (1–32 ký tự)</label>
              <input
                id={nameInputId}
                name="visitorName"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                minLength={1}
                maxLength={32}
                required
                autoComplete="nickname"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>

            <fieldset className="color-picker-fieldset">
              <legend>Màu nhận diện nhân vật</legend>
              <div className="color-swatches">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${draftColor === c ? 'color-swatch--selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setDraftColor(c)}
                    aria-label={`Chọn màu ${c}`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="hud-profile-form__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setEditingProfile(false)}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn--primary btn--sm">
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Hybrid Camera Controls & Booth Directory Mini Dock — Hidden during Booth Showcase mode */}
      {!isBoothShowcaseActive && (
        <aside
          className={`expo-hud-dock ${selectedBooth ? 'expo-hud-dock--panel-open' : ''}`}
          aria-label="Điều khiển góc nhìn camera và danh sách gian hàng"
        >
          <div className="camera-mode-bar" role="group" aria-label="Chế độ góc nhìn Camera">
            <button
              type="button"
              className={`camera-mode-btn ${
                cameraMode === 'overview' ? 'camera-mode-btn--active' : ''
              }`}
              onClick={handleSwitchToOverview}
              aria-pressed={cameraMode === 'overview'}
              title="Nhìn tổng thể toàn bộ khu triển lãm 6 gian hàng"
            >
              🌐 Toàn cảnh
            </button>

            <button
              type="button"
              className={`camera-mode-btn ${
                cameraMode === 'explore' ? 'camera-mode-btn--active' : ''
              }`}
              onClick={handleSwitchToExplore}
              aria-pressed={cameraMode === 'explore'}
              title="Camera góc nhìn thứ 3 (Third-person) đi theo sau nhân vật"
            >
              🚶 Tham quan
            </button>

            <div className="zoom-controls">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.min(60, z + 4))}
                title="Phóng to góc nhìn"
                aria-label="Phóng to góc nhìn"
              >
                ＋
              </button>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.max(14, z - 4))}
                title="Thu nhỏ góc nhìn"
                aria-label="Thu nhỏ góc nhìn"
              >
                －
              </button>
            </div>
          </div>

          <div className="booth-mini-list">
            <span className="booth-mini-list__title">
              Gian hàng nổi bật (Bấm để xem cận cảnh)
            </span>
            <div className="booth-mini-list__chips">
              {booths.map((booth) => {
                const isFocused =
                  selectedBooth?.id === booth.id ||
                  (cameraMode === 'focus' && focusedBooth?.id === booth.id);
                return (
                  <button
                    key={booth.id}
                    type="button"
                    className={`booth-chip ${isFocused ? 'booth-chip--active' : ''}`}
                    onClick={() => handleSelectBooth(booth)}
                    title={`Tập trung camera và xem sản phẩm tại ${booth.name}`}
                  >
                    <span className="booth-chip__dot" style={{ backgroundColor: booth.color }} />
                    <span className="booth-chip__name">{booth.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* Onboarding Controls Guide — Hidden during Booth Showcase mode */}
      {!isBoothShowcaseActive && showHelp && (
        <aside className="expo-help-card" aria-label="Hướng dẫn điều khiển">
          <div className="expo-help-card__header">
            <strong>🎮 Hướng dẫn tham quan triển lãm</strong>
            <button
              type="button"
              className="expo-help-card__close"
              onClick={() => setShowHelp(false)}
              aria-label="Ẩn hướng dẫn"
            >
              ✕
            </button>
          </div>
          <ul className="expo-help-card__list">
            <li>
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> hoặc <strong>Phím mũi tên</strong>: Di chuyển tự do theo góc nhìn nhân vật.
            </li>
            <li>
              <strong>Click chuột xuống sàn</strong>: Tự động tìm đường (A*) tránh vật cản tới điểm chọn.
            </li>
            <li>
              <strong>3 chế độ Camera</strong>: Chọn <em>Toàn cảnh</em> (Isometric 2.5D), <em>Tham quan</em> (Third-person theo nhân vật), hoặc <em>Click vào Gian hàng</em> để xem cận cảnh quầy kệ & sản phẩm.
            </li>
            <li>
              <strong>Joystick cảm ứng</strong> (Góc dưới trái): Điều khiển mượt mà trên điện thoại/máy tính bảng.
            </li>
          </ul>
        </aside>
      )}

      <LoadingScreen loading={loadingData} warningMessage={dataWarning} />

      <ExhibitionScene
        booths={booths}
        productCountByBooth={productCountByBooth}
        slotsByBooth={slotsByBooth}
        activeBoothProducts={activeBoothProducts}
        selectedProductId={selectedProduct?.id ?? null}
        onSelectProduct={handleSelectSlotProduct}
        player={playerDescriptor}
        playerTransformRef={transformRef}
        cameraYawRef={cameraYawRef}
        onStepMovement={stepMovement}
        remoteVisitors={remoteVisitors}
        remoteVisitorsLiveRef={remoteVisitorsLiveRef}
        activePath={activePath}
        selectedBoothId={selectedBooth?.id ?? null}
        focusedBooth={focusedBooth}
        cameraMode={cameraMode}
        onSelectBooth={handleSelectBooth}
        onGroundClick={handleGroundClick}
        zoom={zoom}
      />

      {!isBoothShowcaseActive && <MobileJoystick onMove={handleJoystickMove} />}

      <BoothPanel
        booth={selectedBooth}
        products={products}
        slots={selectedBooth ? slotsByBooth[selectedBooth.id] : undefined}
        selectedProduct={selectedProduct}
        onSelectProduct={handleSelectSlotProduct}
        onClose={handleReturnToExplore}
        onWalkToBooth={handleWalkToBooth}
      />
    </main>
  );
};
