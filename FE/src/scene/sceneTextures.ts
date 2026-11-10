import * as THREE from 'three';

let activeCanvasTextureCount = 0;

export function getActiveCanvasTextureCount(): number {
  return activeCanvasTextureCount;
}

function createCanvasElement(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return {
    width,
    height,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;
}

function registerTrackedTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  activeCanvasTextureCount++;

  let disposed = false;
  const origDispose = texture.dispose.bind(texture);
  texture.dispose = () => {
    if (!disposed) {
      disposed = true;
      activeCanvasTextureCount = Math.max(0, activeCanvasTextureCount - 1);
    }
    origDispose();
  };

  return texture;
}

function createRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export type BoothVisualTheme = 'tech' | 'living' | 'coffee' | 'robotics' | 'design' | 'energy';

interface ThemePalette {
  bg: string;
  bgActive: string;
  border: string;
  textMain: string;
  textSub: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
}

function getThemePalette(theme: BoothVisualTheme | undefined, fallbackColor: string): ThemePalette {
  switch (theme) {
    case 'living':
      return {
        bg: '#451a03',
        bgActive: '#78350f',
        border: '#f59e0b',
        textMain: '#fffbeb',
        textSub: '#fde68a',
        badgeBg: '#065f46',
        badgeText: '#ecfdf5',
        icon: '🛋️',
      };
    case 'coffee':
      return {
        bg: '#3b1806',
        bgActive: '#5c280b',
        border: '#fbbf24',
        textMain: '#fffbeb',
        textSub: '#fcd34d',
        badgeBg: '#b45309',
        badgeText: '#ffffff',
        icon: '☕',
      };
    case 'robotics':
      return {
        bg: '#0f172a',
        bgActive: '#1e1b4b',
        border: '#6366f1',
        textMain: '#f8fafc',
        textSub: '#38bdf8',
        badgeBg: '#312e81',
        badgeText: '#e0e7ff',
        icon: '🤖',
      };
    case 'design':
      return {
        bg: '#2e1065',
        bgActive: '#4c1d95',
        border: '#ec4899',
        textMain: '#fdf4ff',
        textSub: '#f9a8d4',
        badgeBg: '#be185d',
        badgeText: '#ffffff',
        icon: '🎨',
      };
    case 'energy':
      return {
        bg: '#042f2e',
        bgActive: '#064e3b',
        border: '#14b8a6',
        textMain: '#f0fdf4',
        textSub: '#5eead4',
        badgeBg: '#0f766e',
        badgeText: '#ffffff',
        icon: '☀️',
      };
    case 'tech':
    default:
      return {
        bg: '#0f172a',
        bgActive: '#0c4a6e',
        border: fallbackColor || '#0ea5e9',
        textMain: '#ffffff',
        textSub: '#38bdf8',
        badgeBg: '#0284c7',
        badgeText: '#ffffff',
        icon: '⚡',
      };
  }
}

export function createBoothSignTexture(options: {
  name: string;
  category: string;
  productCount: number;
  color: string;
  active: boolean;
  theme?: BoothVisualTheme;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(768, 256);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const pal = getThemePalette(options.theme, options.color);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    createRoundRectPath(ctx, 14, 14, 740, 228, 32);
    ctx.fillStyle = options.active ? pal.bgActive : pal.bg;
    ctx.fill();
    ctx.lineWidth = options.active ? 10 : 6;
    ctx.strokeStyle = options.active ? '#fbbf24' : pal.border;
    ctx.stroke();
    ctx.restore();

    // Decorative top accent bar
    ctx.save();
    createRoundRectPath(ctx, 38, 28, 692, 12, 6);
    ctx.fillStyle = pal.border;
    ctx.fill();
    ctx.restore();

    ctx.font = '700 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(
      truncateText(`${pal.icon} ${options.category.toUpperCase()}`, 38),
      canvas.width / 2,
      80
    );

    ctx.font = '800 42px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textMain;
    ctx.fillText(truncateText(options.name, 26), canvas.width / 2, 136);

    ctx.save();
    createRoundRectPath(ctx, 134, 160, 500, 52, 26);
    ctx.fillStyle = options.active ? pal.border : pal.badgeBg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    ctx.font = '700 23px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.badgeText;
    ctx.fillText(
      `📦 ${options.productCount} sản phẩm · Bấm để vào Cửa hàng`,
      canvas.width / 2,
      194
    );
  }

  return registerTrackedTexture(canvas);
}

export function createBoothFasciaTexture(options: {
  name: string;
  category: string;
  color: string;
  theme?: BoothVisualTheme;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(960, 160);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const pal = getThemePalette(options.theme, options.color);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = pal.border;
    ctx.fillRect(0, 0, 42, canvas.height);
    ctx.fillRect(canvas.width - 42, 0, 42, canvas.height);
    ctx.fillRect(0, 0, canvas.width, 10);
    ctx.fillRect(0, canvas.height - 12, canvas.width, 12);

    ctx.font = '800 46px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textMain;
    ctx.fillText(
      truncateText(`${pal.icon} ${options.name.toUpperCase()}`, 28),
      canvas.width / 2,
      78
    );

    ctx.font = '700 25px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(truncateText(`★ ${options.category.toUpperCase()} ★`, 42), canvas.width / 2, 122);
  }

  return registerTrackedTexture(canvas);
}

export function createBoothPosterTexture(options: {
  name: string;
  category: string;
  tagline: string;
  color: string;
  productCount: number;
  theme?: BoothVisualTheme;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 320);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const pal = getThemePalette(options.theme, options.color);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = pal.border;
    ctx.fillRect(0, 0, canvas.width, 18);

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 28, canvas.width - 28, canvas.height - 42);

    ctx.save();
    createRoundRectPath(ctx, 36, 48, 440, 38, 19);
    ctx.fillStyle = pal.badgeBg;
    ctx.fill();
    ctx.restore();

    ctx.font = '700 19px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(
      truncateText(`${pal.icon} ${options.category.toUpperCase()}`, 34),
      canvas.width / 2,
      73
    );

    ctx.font = '800 32px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textMain;
    ctx.fillText(truncateText(options.name, 24), canvas.width / 2, 132);

    const tagline = options.tagline || 'Giải pháp trưng bày & thương mại chính hãng';
    const words = tagline.split(/\s+/);
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 34) {
        line1 = (line1 + ' ' + w).trim();
      } else {
        line2 = (line2 + ' ' + w).trim();
      }
    }

    ctx.font = '600 20px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textMain;
    ctx.fillText(truncateText(line1, 36), canvas.width / 2, 178);
    if (line2) {
      ctx.fillText(truncateText(line2, 36), canvas.width / 2, 208);
    }

    ctx.save();
    createRoundRectPath(ctx, 76, 234, 360, 42, 12);
    ctx.fillStyle = pal.border;
    ctx.fill();
    ctx.restore();

    ctx.font = '700 20px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`✨ SHOWCASE · ${options.productCount} SẢN PHẨM`, canvas.width / 2, 262);
  }

  return registerTrackedTexture(canvas);
}

export function createAvatarNametagTexture(options: {
  name: string;
  color: string;
  isSelf: boolean;
  activeBoothName?: string | null;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 128);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasSub = Boolean(options.activeBoothName);
    const boxY = hasSub ? 10 : 24;
    const boxH = hasSub ? 108 : 80;

    createRoundRectPath(ctx, 20, boxY, 472, boxH, 40);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = options.isSelf ? 6 : 4;
    ctx.strokeStyle = options.isSelf ? '#38bdf8' : 'rgba(226, 232, 240, 0.45)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(66, hasSub ? 50 : 64, 14, 0, Math.PI * 2);
    ctx.fillStyle = options.color || '#0ea5e9';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    const displayLabel = options.isSelf
      ? `${truncateText(options.name, 16)} (Bạn)`
      : truncateText(options.name, 22);
    ctx.font = '700 30px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayLabel, 96, hasSub ? 60 : 74);

    if (options.activeBoothName) {
      ctx.font = '600 20px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`🛍️ ${truncateText(options.activeBoothName, 24)}`, 96, 96);
    }
  }

  return registerTrackedTexture(canvas);
}

export function createProductTagTexture(options: {
  index: number;
  name: string;
  priceText: string;
  color: string;
  selected: boolean;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 144);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    createRoundRectPath(ctx, 12, 12, 488, 120, 26);
    ctx.fillStyle = options.selected ? 'rgba(15, 23, 42, 0.98)' : 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = options.selected ? 7 : 4;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.color || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(58, 72, 26, 0, Math.PI * 2);
    ctx.fillStyle = options.selected ? '#fbbf24' : options.color || '#0ea5e9';
    ctx.fill();

    ctx.font = '800 26px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = options.selected ? '#0f172a' : '#ffffff';
    ctx.fillText(`#${options.index}`, 58, 81);

    ctx.font = '700 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncateText(options.name, 22), 100, 64);

    ctx.font = '700 21px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = options.selected ? '#fde68a' : '#38bdf8';
    ctx.fillText(`${truncateText(options.priceText, 18)} · Bấm xem`, 100, 100);
  }

  return registerTrackedTexture(canvas);
}

export function createBannerSignTexture(options: {
  title: string;
  subtitle: string;
  accentColor?: string;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(768, 160);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    createRoundRectPath(ctx, 12, 12, 744, 136, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = options.accentColor || '#38bdf8';
    ctx.stroke();

    ctx.font = '800 34px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(options.title, canvas.width / 2, 72);

    ctx.font = '600 23px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = options.accentColor || '#38bdf8';
    ctx.fillText(options.subtitle, canvas.width / 2, 115);
  }

  return registerTrackedTexture(canvas);
}
