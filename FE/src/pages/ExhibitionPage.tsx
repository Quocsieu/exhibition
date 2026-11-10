import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  type Booth,
  type Product,
  DEFAULT_BOOTHS,
  DEFAULT_PRODUCTS,
} from '../types/expo';
import { ExhibitionScene } from '../scene/ExhibitionScene';
import { useClickToMove, type PlayerTransform } from '../controls/useClickToMove';
import { MobileJoystick } from '../controls/MobileJoystick';
import { BoothPanel } from '../components/BoothPanel';
import { LoadingScreen } from '../components/LoadingScreen';
import { useRealtime } from '../hooks/useRealtime';
import { apiClient } from '../services/api';

const AVATAR_COLORS = [
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
];

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

export interface ExhibitionPageProps {
  onOpenAdmin: () => void;
}

export const ExhibitionPage: React.FC<ExhibitionPageProps> = ({ onOpenAdmin }) => {
  const initialIdentity = useMemo(() => getStoredIdentity(), []);
  const [playerName, setPlayerName] = useState(initialIdentity.name);
  const [playerColor, setPlayerColor] = useState(initialIdentity.color);

  const [booths, setBooths] = useState<Booth[]>(DEFAULT_BOOTHS);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [loadingData, setLoadingData] = useState(true);
  const [dataWarning, setDataWarning] = useState<string | null>(null);

  const [selectedBooth, setSelectedBooth] = useState<Booth | null>(null);
  const [zoom, setZoom] = useState(22);
  const [showHelp, setShowHelp] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(playerName);
  const [draftColor, setDraftColor] = useState(playerColor);

  const nameInputId = useId();
  const boothSelectId = useId();

  const loadExpoData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [fetchedBooths, fetchedProducts] = await Promise.all([
        apiClient.getBooths(),
        apiClient.getProducts(),
      ]);
      setBooths(fetchedBooths);
      setProducts(fetchedProducts);
      setDataWarning(null);
    } catch {
      setBooths(DEFAULT_BOOTHS);
      setProducts(DEFAULT_PRODUCTS);
      setDataWarning('Đang hiển thị dữ liệu mẫu cục bộ (Chưa kết nối được API Backend).');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void loadExpoData();
  }, [loadExpoData]);

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
    onMoveRejected: (x, z) => {
      forcePosition(x, z);
    },
  });

  const handleTransformChange = useCallback(
    (nextTransform: PlayerTransform) => {
      emitMovement({
        x: nextTransform.x,
        z: nextTransform.z,
        rotationY: nextTransform.rotationY,
        state: nextTransform.state,
        activeBoothId: selectedBooth?.id ?? null,
      });
    },
    [emitMovement, selectedBooth?.id]
  );

  const handleReachBooth = useCallback((booth: Booth) => {
    setSelectedBooth(booth);
  }, []);

  const {
    transformRef,
    activePath,
    moveToPoint,
    setJoystickInput,
    forcePosition,
    stepMovement,
  } = useClickToMove({
    booths,
    initialPosition: { x: 0, z: 17.5 },
    disabled: Boolean(selectedBooth),
    onTransformChange: handleTransformChange,
    onReachBooth: handleReachBooth,
  });

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
      const frontZ = booth.positionZ + (booth.depth || 3.8) / 2 + 1.4;
      moveToPoint(booth.positionX, frontZ, booth);
    },
    [moveToPoint]
  );

  const handleSelectBooth = useCallback((booth: Booth) => {
    setSelectedBooth(booth);
  }, []);

  const handleGroundClick = useCallback(
    (x: number, z: number) => {
      moveToPoint(x, z);
    },
    [moveToPoint]
  );

  const productCountByBooth = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      counts[p.boothId] = (counts[p.boothId] || 0) + 1;
    }
    return counts;
  }, [products]);

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

  return (
    <main className="expo-viewport">
      {/* Top Bar HUD */}
      <header className="expo-hud-top">
        <div className="expo-hud-top__brand">
          <div className="expo-hud-top__logo">2.5D</div>
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

      {/* Profile Editor Popover */}
      {editingProfile && (
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

      {/* Camera Zoom & Booth Directory Mini Dock */}
      <aside className="expo-hud-dock" aria-label="Công cụ góc nhìn và danh sách gian hàng">
        <div className="zoom-controls">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => setZoom(Math.min(44, zoom + 4))}
            title="Phóng to góc nhìn"
            aria-label="Phóng to góc nhìn"
          >
            ＋
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={() => setZoom(Math.max(14, zoom - 4))}
            title="Thu nhỏ góc nhìn"
            aria-label="Thu nhỏ góc nhìn"
          >
            －
          </button>
        </div>

        <div className="booth-mini-list">
          <span className="booth-mini-list__title">Gian hàng nổi bật</span>
          <div className="booth-mini-list__chips">
            {booths.map((booth) => (
              <button
                key={booth.id}
                type="button"
                className="booth-chip"
                onClick={() => setSelectedBooth(booth)}
                title={`Xem sản phẩm tại ${booth.name}`}
              >
                <span className="booth-chip__dot" style={{ backgroundColor: booth.color }} />
                <span className="booth-chip__name">{booth.name}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Onboarding Controls Guide */}
      {showHelp && (
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
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> hoặc <strong>Phím mũi tên</strong>: Di chuyển tự do trên máy tính.
            </li>
            <li>
              <strong>Click chuột xuống sàn</strong>: Tự động tìm đường (A*) tránh vật cản tới điểm chọn.
            </li>
            <li>
              <strong>Joystick cảm ứng</strong> (Góc dưới trái): Điều khiển mượt mà trên điện thoại/máy tính bảng.
            </li>
            <li>
              <strong>Click vào Gian hàng</strong>: Xem danh sách sản phẩm, video và liên kết mua hàng chính hãng.
            </li>
          </ul>
        </aside>
      )}

      <LoadingScreen loading={loadingData} warningMessage={dataWarning} />

      <ExhibitionScene
        booths={booths}
        productCountByBooth={productCountByBooth}
        player={playerDescriptor}
        playerTransformRef={transformRef}
        onStepMovement={stepMovement}
        remoteVisitors={remoteVisitors}
        remoteVisitorsLiveRef={remoteVisitorsLiveRef}
        activePath={activePath}
        selectedBoothId={selectedBooth?.id ?? null}
        onSelectBooth={handleSelectBooth}
        onGroundClick={handleGroundClick}
        zoom={zoom}
      />

      <MobileJoystick onMove={setJoystickInput} />

      <BoothPanel
        booth={selectedBooth}
        products={products}
        onClose={() => setSelectedBooth(null)}
        onWalkToBooth={handleWalkToBooth}
      />
    </main>
  );
};
