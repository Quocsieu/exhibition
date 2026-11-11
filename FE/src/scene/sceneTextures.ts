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

/**
 * Creates a seamless, tileable Stylized 3D City architectural stone paving texture
 * for the main exhibition courtyard (1 draw call for the entire ground plane).
 */
export function createPlazaTileTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Warm architectural travertine/limestone mortar base
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 512, 512);

    const tileSize = 128;
    const tones = ['#ebe6dc', '#e4dfd4', '#ede9e0', '#dfd9cd', '#e8e2d6', '#e2dcd0'];

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * tileSize;
        const y = row * tileSize;
        const baseTone = tones[(row * 5 + col * 3) % tones.length];

        // Subtle stone slab gradient for depth
        const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
        grad.addColorStop(0, '#f5f2eb');
        grad.addColorStop(0.5, baseTone);
        grad.addColorStop(1, '#d6cfc2');
        ctx.fillStyle = grad;
        ctx.fillRect(x + 4, y + 4, tileSize - 8, tileSize - 8);

        // Subtle inner ashlar border line
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 12, y + 12, tileSize - 24, tileSize - 24);

        // Sunlit top/left bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fillRect(x + 4, y + 4, tileSize - 8, 3);
        ctx.fillRect(x + 4, y + 4, 3, tileSize - 8);

        // Bottom/right recess AO shadow
        ctx.fillStyle = 'rgba(71, 85, 105, 0.36)';
        ctx.fillRect(x + 4, y + tileSize - 7, tileSize - 8, 3);
        ctx.fillRect(x + tileSize - 7, y + 4, 3, tileSize - 8);

        // Architectural brass/stone corner inlay diamond
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Deep recessed mortar grout lines
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      const p = i * tileSize;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a matching grayscale height/bump & roughness map for the plaza stone tiles
 * so directional sunlight produces realistic micro-relief along stone joints and bevels.
 */
export function createPlazaTileBumpTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Deep recessed mortar (dark = low elevation)
    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, 512, 512);

    const tileSize = 128;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * tileSize;
        const y = row * tileSize;

        // Outer chamfer slope
        ctx.fillStyle = '#9a9a9a';
        ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

        // Raised stone slab plateau (bright = high elevation)
        const shade = 225 + ((row * 7 + col * 5) % 24);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(x + 7, y + 7, tileSize - 14, tileSize - 14);

        // Subtle carved inner border groove
        ctx.strokeStyle = '#b0b0b0';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 14, y + 14, tileSize - 28, tileSize - 28);
      }
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a Stylized 3D City Asphalt Road texture with mineral aggregate grain,
 * subtle dual-lane wear bands, white shoulder edge lines, and a dashed white center line.
 */
export function createAsphaltRoadTexture(repeatY = 6): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Deep charcoal-slate stylized asphalt base
    ctx.fillStyle = '#333d4b';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle darker wheel-track wear bands on left and right lanes
    const leftLaneGrad = ctx.createLinearGradient(64, 0, 224, 0);
    leftLaneGrad.addColorStop(0, 'rgba(30, 41, 59, 0)');
    leftLaneGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.28)');
    leftLaneGrad.addColorStop(1, 'rgba(30, 41, 59, 0)');
    ctx.fillStyle = leftLaneGrad;
    ctx.fillRect(64, 0, 160, 512);

    const rightLaneGrad = ctx.createLinearGradient(288, 0, 448, 0);
    rightLaneGrad.addColorStop(0, 'rgba(30, 41, 59, 0)');
    rightLaneGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.28)');
    rightLaneGrad.addColorStop(1, 'rgba(30, 41, 59, 0)');
    ctx.fillStyle = rightLaneGrad;
    ctx.fillRect(288, 0, 160, 512);

    // Deterministic mineral aggregate speckle (stylized asphalt grain)
    const speckleColors = ['#28313e', '#3f4b5b', '#495668', '#242c38'];
    for (let i = 0; i < 900; i++) {
      const sx = (i * 137 + (i % 17) * 29) % 512;
      const sy = (i * 251 + (i % 23) * 19) % 512;
      const size = (i % 3) + 2;
      ctx.fillStyle = speckleColors[i % speckleColors.length];
      ctx.fillRect(sx, sy, size, size);
    }

    // Crisp continuous white road shoulder edge lines (left & right)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(22, 0, 10, 512);
    ctx.fillRect(480, 0, 10, 512);

    // Crisp dashed white center lane divider line
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(250, 36, 12, 180);
    ctx.fillRect(250, 292, 12, 180);
  }

  const texture = registerTrackedTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a matching grayscale bump/roughness map for the stylized asphalt road.
 */
export function createAsphaltBumpTexture(repeatY = 6): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#787878';
    ctx.fillRect(0, 0, 512, 512);

    const grainShades = ['#5c5c5c', '#929292', '#686868', '#888888'];
    for (let i = 0; i < 900; i++) {
      const sx = (i * 137 + (i % 17) * 29) % 512;
      const sy = (i * 251 + (i % 23) * 19) % 512;
      const size = (i % 3) + 2;
      ctx.fillStyle = grainShades[i % grainShades.length];
      ctx.fillRect(sx, sy, size, size);
    }

    // Slightly raised thermoplastic paint lines
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(22, 0, 10, 512);
    ctx.fillRect(480, 0, 10, 512);
    ctx.fillRect(250, 36, 12, 180);
    ctx.fillRect(250, 292, 12, 180);
  }

  const texture = registerTrackedTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a Stylized 3D City Zebra Crosswalk (vạch qua đường) texture at road intersections.
 */
export function createCrosswalkTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 256);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Matching dark asphalt base
    ctx.fillStyle = '#333d4b';
    ctx.fillRect(0, 0, 512, 256);

    // Subtle aggregate grain
    const speckleColors = ['#28313e', '#3f4b5b', '#495668'];
    for (let i = 0; i < 350; i++) {
      const sx = (i * 149) % 512;
      const sy = (i * 89) % 256;
      ctx.fillStyle = speckleColors[i % speckleColors.length];
      ctx.fillRect(sx, sy, 3, 3);
    }

    // Top & bottom stop lines
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(20, 14, 472, 10);
    ctx.fillRect(20, 232, 472, 10);

    // 6 Crisp White Zebra Crosswalk Stripes
    const stripeCount = 6;
    const totalSpan = 432;
    const startX = 40;
    const slotWidth = totalSpan / stripeCount;
    const barWidth = slotWidth * 0.58;

    for (let i = 0; i < stripeCount; i++) {
      const bx = startX + i * slotWidth + (slotWidth - barWidth) * 0.5;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(bx, 38, barWidth, 180);

      // Subtle bevel highlight on each white stripe
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(bx, 212, barWidth, 6);
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a Trade Fair / Exhibition Stand Enterprise Backdrop texture showing:
 * - Corporate Brand Monogram / Logo Badge (plus async logoUrl load if provided)
 * - Enterprise Company Name (`companyName`)
 * - Booth Title (`name`), Category, Tagline, and Visual Brand Key Art
 */
export function createEnterpriseBackdropTexture(options: {
  name: string;
  companyName?: string;
  category: string;
  tagline: string;
  color: string;
  logoUrl?: string;
  bannerUrl?: string;
  occupiedSlots: number;
  totalSlots: number;
  theme?: BoothVisualTheme;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(1024, 576);
  const ctx = canvas.getContext('2d');
  const texture = registerTrackedTexture(canvas);

  const renderBackdrop = (loadedBanner?: HTMLImageElement, loadedLogo?: HTMLImageElement) => {
    if (!ctx) return;
    const pal = getThemePalette(options.theme, options.color);
    const companyTitle = (options.companyName || options.name).toUpperCase();

    // Deep exhibition stand backdrop gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 576);
    bgGrad.addColorStop(0, pal.bg);
    bgGrad.addColorStop(0.55, pal.bgActive);
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 576);

    // Optional custom banner image background overlay
    if (loadedBanner) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(loadedBanner, 0, 0, 1024, 576);
      ctx.restore();
    } else {
      // Stylized exhibition key-visual geometric rays on right side
      ctx.save();
      ctx.strokeStyle = pal.border;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(820, 288, 70 + i * 38, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Illuminated perimeter frame
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 988, 540);

    // Top illuminated brand header bar
    ctx.fillStyle = pal.border;
    ctx.fillRect(18, 18, 988, 18);

    // Left Corporate Logo Medallion
    ctx.save();
    createRoundRectPath(ctx, 56, 66, 132, 132, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = pal.border;
    ctx.stroke();
    ctx.restore();

    if (loadedLogo) {
      ctx.save();
      createRoundRectPath(ctx, 64, 74, 116, 116, 22);
      ctx.clip();
      ctx.drawImage(loadedLogo, 64, 74, 116, 116);
      ctx.restore();
    } else {
      const initials = companyTitle
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('');
      ctx.font = '900 50px Inter, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.textSub;
      ctx.fillText(initials || pal.icon, 122, 148);
    }

    // Enterprise Company Name badge
    ctx.save();
    createRoundRectPath(ctx, 214, 68, 740, 44, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.border;
    ctx.stroke();
    ctx.restore();

    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(
      truncateText(`🏢 ${companyTitle}  ·  ${options.category.toUpperCase()}`, 52),
      234,
      98
    );

    // Main Exhibition Stand Name
    ctx.font = '900 54px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textMain;
    ctx.fillText(truncateText(options.name.toUpperCase(), 24), 214, 172);

    // Divider line
    ctx.fillStyle = pal.border;
    ctx.fillRect(56, 224, 912, 4);

    // Enterprise Value Proposition / Tagline Box
    ctx.save();
    createRoundRectPath(ctx, 56, 252, 620, 196, 22);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();
    ctx.restore();

    ctx.font = '700 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textSub;
    ctx.fillText('GIẢI PHÁP & SẢN PHẨM TRƯNG BÀY CHÍNH HÃNG', 84, 296);

    const tagline = options.tagline || 'Trải nghiệm trực tiếp sản phẩm trên kệ trưng bày 3D';
    const words = tagline.split(/\s+/);
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 42) {
        line1 = (line1 + ' ' + w).trim();
      } else {
        line2 = (line2 + ' ' + w).trim();
      }
    }
    ctx.font = '600 28px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(truncateText(line1, 44), 84, 348);
    if (line2) {
      ctx.fillText(truncateText(line2, 44), 84, 388);
    }

    ctx.font = '600 20px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('✦ Bấm trực tiếp vào sản phẩm trên quầy hoặc kệ 2 bên để xem chi tiết', 84, 426);

    // Right Visual Recognition Card
    ctx.save();
    createRoundRectPath(ctx, 704, 252, 264, 196, 22);
    ctx.fillStyle = pal.badgeBg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.border;
    ctx.stroke();
    ctx.restore();

    ctx.font = '800 58px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(pal.icon, 836, 332);

    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.textSub;
    ctx.fillText('KỆ TRƯNG BÀY 3D', 836, 382);

    ctx.font = '700 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${options.occupiedSlots} / ${options.totalSlots} VỊ TRÍ`, 836, 420);

    // Bottom Exhibition Footer Strip
    ctx.save();
    createRoundRectPath(ctx, 56, 474, 912, 56, 16);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.border;
    ctx.stroke();
    ctx.restore();

    ctx.font = '700 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(
      `★ GIAN HÀNG TRIỂN LÃM CHÍNH THỨC · ${companyTitle} ★`,
      512,
      510
    );

    texture.needsUpdate = true;
  };

  renderBackdrop();

  if (typeof Image !== 'undefined' && (options.bannerUrl || options.logoUrl)) {
    let bannerImg: HTMLImageElement | undefined;
    let logoImg: HTMLImageElement | undefined;

    if (options.bannerUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        bannerImg = img;
        renderBackdrop(bannerImg, logoImg);
      };
      img.src = options.bannerUrl;
    }

    if (options.logoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        logoImg = img;
        renderBackdrop(bannerImg, logoImg);
      };
      img.src = options.logoUrl;
    }
  }

  return texture;
}

/**
 * Creates a high-contrast 3D Product Display Stand Card texture for a product assigned to a slot.
 * Automatically draws the product's primary image when available.
 */
export function createProductDisplayCardTexture(options: {
  slotLabel: string;
  name: string;
  priceText: string;
  sku?: string;
  imageUrl?: string;
  accentColor: string;
  selected: boolean;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 384);
  const ctx = canvas.getContext('2d');
  const texture = registerTrackedTexture(canvas);

  const renderCard = (loadedImg?: HTMLImageElement) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 512, 384);

    // Card background
    ctx.save();
    createRoundRectPath(ctx, 10, 10, 492, 364, 24);
    ctx.fillStyle = options.selected ? '#0f172a' : '#111827';
    ctx.fill();
    ctx.lineWidth = options.selected ? 10 : 6;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    // Top slot header strip
    ctx.save();
    createRoundRectPath(ctx, 26, 24, 460, 44, 12);
    ctx.fillStyle = options.selected ? '#fbbf24' : options.accentColor || '#0ea5e9';
    ctx.fill();
    ctx.restore();

    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = options.selected ? '#0f172a' : '#ffffff';
    ctx.fillText(truncateText(options.slotLabel.toUpperCase(), 26), 44, 54);

    if (options.sku) {
      ctx.textAlign = 'right';
      ctx.font = '700 18px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(truncateText(options.sku, 14), 470, 53);
    }

    // Center visual preview frame
    ctx.save();
    createRoundRectPath(ctx, 26, 80, 460, 176, 16);
    const frameGrad = ctx.createLinearGradient(26, 80, 486, 256);
    frameGrad.addColorStop(0, '#1e293b');
    frameGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = frameGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.stroke();
    ctx.restore();

    if (loadedImg) {
      ctx.save();
      createRoundRectPath(ctx, 28, 82, 456, 172, 14);
      ctx.clip();
      ctx.drawImage(loadedImg, 28, 82, 456, 172);
      ctx.restore();
    } else {
      // Stylized product showcase graphic placeholder
      ctx.save();
      ctx.beginPath();
      ctx.arc(256, 168, 54, 0, Math.PI * 2);
      ctx.fillStyle = options.accentColor || '#0ea5e9';
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.restore();

      ctx.font = '800 44px Inter, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      const initials = options.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');
      ctx.fillText(initials || '3D', 256, 184);
    }

    // Product Name
    ctx.font = '800 26px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncateText(options.name, 26), 30, 294);

    // Price & CTA pill
    ctx.save();
    createRoundRectPath(ctx, 26, 312, 460, 46, 14);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    ctx.font = '800 23px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(truncateText(options.priceText, 18), 44, 343);

    ctx.font = '700 19px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('BẤM XEM →', 470, 342);

    texture.needsUpdate = true;
  };

  renderCard();

  if (typeof Image !== 'undefined' && options.imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      renderCard(img);
    };
    img.src = options.imageUrl;
  }

  return texture;
}

/**
 * Creates a Rectangular Running-Bond Brick/Stone Sidewalk Paver texture (vỉa hè lát gạch)
 * with warm gray and subtle terracotta-sandstone tones and clean mortar lines.
 */
export function createSidewalkPaverTexture(repeatX = 3, repeatY = 12): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Subtle warm mortar joint base (not overly dark)
    ctx.fillStyle = '#b8b2a8';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 4;
    const brickH = 512 / rows;
    const brickW = 512 / cols;
    const paverTones = [
      '#e6dfd5',
      '#ded6ca',
      '#eadfd3',
      '#d8d0c5',
      '#e2dad0',
      '#e5d8cb',
    ];

    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2) * (brickW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * brickW + offsetX;
        const by = r * brickH;
        const tone = paverTones[((r * 5 + (c + 4) * 3) & 0x7fffffff) % paverTones.length];

        ctx.fillStyle = tone;
        ctx.fillRect(bx + 2.5, by + 2.5, brickW - 5, brickH - 5);

        // Top/left sunlit paver edge highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
        ctx.fillRect(bx + 2.5, by + 2.5, brickW - 5, 2);
        ctx.fillRect(bx + 2.5, by + 2.5, 2, brickH - 5);

        // Bottom/right subtle shadow
        ctx.fillStyle = 'rgba(100, 92, 82, 0.25)';
        ctx.fillRect(bx + 2.5, by + brickH - 4.5, brickW - 5, 2);
        ctx.fillRect(bx + brickW - 4.5, by + 2.5, 2, brickH - 5);
      }
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a decorative compass-rose & radial cobble mosaic floor medallion texture
 * for the Central Pedestrian Plaza.
 */
export function createPlazaMedallionTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = 256;
    const cy = 256;
    ctx.clearRect(0, 0, 512, 512);

    // Outer granite curb border ring
    ctx.beginPath();
    ctx.arc(cx, cy, 250, 0, Math.PI * 2);
    ctx.fillStyle = '#d6d3d1';
    ctx.fill();

    // Main warm travertine & sandstone plaza disc
    ctx.beginPath();
    ctx.arc(cx, cy, 238, 0, Math.PI * 2);
    ctx.fillStyle = '#efeae1';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#a8a29e';
    ctx.stroke();

    // Concentric decorative stone paver rings
    const ringRadii = [214, 186, 152, 118, 84];
    const ringFills = ['#e5dec9', '#f3efe6', '#e2d9c5', '#ede8dc', '#dfd5be'];
    ringRadii.forEach((r, idx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = ringFills[idx];
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#b8b0a2';
      ctx.stroke();
    });

    // Radial 16-segment cobble joint lines
    ctx.strokeStyle = 'rgba(148, 138, 124, 0.55)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 58, cy + Math.sin(angle) * 58);
      ctx.lineTo(cx + Math.cos(angle) * 236, cy + Math.sin(angle) * 236);
      ctx.stroke();
    }

    // 8-Point Architectural Compass Rose Star in the Central Plaza
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const outerR = i % 2 === 0 ? 178 : 142;
      const halfSpread = 0.16;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(angle - halfSpread) * 72,
        cy + Math.sin(angle - halfSpread) * 72
      );
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.lineTo(
        cx + Math.cos(angle + halfSpread) * 72,
        cy + Math.sin(angle + halfSpread) * 72
      );
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? '#d97706' : '#0284c7';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();
    }

    // Inner stone medallion ring around monument plinth
    ctx.beginPath();
    ctx.arc(cx, cy, 68, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();
  }

  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}
