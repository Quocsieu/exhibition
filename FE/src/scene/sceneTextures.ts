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
  texture.anisotropy = 4;
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

function measureCanvasTextWidth(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  fontPx: number,
  fontWeight = '900',
  fontFamily = 'Inter, Segoe UI, Arial, sans-serif'
): number {
  const estimatedWidth = text.length * fontPx * 0.56;
  if (ctx && typeof ctx.measureText === 'function') {
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    const measured = ctx.measureText(text).width;
    if (Number.isFinite(measured) && measured > 0) {
      return Math.max(measured, text.length * fontPx * 0.48);
    }
  }
  return estimatedWidth;
}

/**
 * Dynamically fits an enterprise or booth title into a signboard region without ever
 * truncating characters with `…` / `...`.
 * - First attempts to fit on 1 line by scaling font size between `maxFontPx` and `minFontPx`.
 * - If still wider than `maxWidthPx`, splits cleanly into 2 balanced word-wrapped lines.
 */
export function fitEnterpriseTitleLines(
  ctx: CanvasRenderingContext2D | null,
  rawText: string,
  maxWidthPx: number,
  maxFontPx: number,
  minFontPx: number,
  fontFamily = 'Inter, Segoe UI, Arial, sans-serif'
): { lines: string[]; fontPx: number } {
  const cleanText = rawText.trim().replace(/\s+/g, ' ');
  if (!cleanText) {
    return { lines: [''], fontPx: maxFontPx };
  }

  for (let px = maxFontPx; px >= minFontPx; px -= 2) {
    const w = measureCanvasTextWidth(ctx, cleanText, px, '900', fontFamily);
    if (w <= maxWidthPx) {
      return { lines: [cleanText], fontPx: px };
    }
  }

  // Split into 2 balanced lines at word boundary without losing any characters
  const words = cleanText.split(' ');
  if (words.length <= 1) {
    const fittedPx = Math.max(
      22,
      Math.floor((maxWidthPx / Math.max(1, cleanText.length)) / 0.58)
    );
    return { lines: [cleanText], fontPx: Math.min(maxFontPx, fittedPx) };
  }

  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ');
    const right = words.slice(i).join(' ');
    const diff = Math.abs(left.length - right.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }

  const line1 = words.slice(0, bestSplit).join(' ');
  const line2 = words.slice(bestSplit).join(' ');
  const twoLineMaxPx = Math.min(maxFontPx, Math.round(maxFontPx * 0.78));

  for (let px = twoLineMaxPx; px >= 24; px -= 2) {
    const w1 = measureCanvasTextWidth(ctx, line1, px, '900', fontFamily);
    const w2 = measureCanvasTextWidth(ctx, line2, px, '900', fontFamily);
    if (Math.max(w1, w2) <= maxWidthPx) {
      return { lines: [line1, line2], fontPx: px };
    }
  }

  return { lines: [line1, line2], fontPx: 24 };
}

/**
 * Wraps a product title into up to 3 high-contrast lines across the full width of the
 * 3D product display panel so product names are large and immediately readable.
 */
export function wrapProductTitleLines(
  ctx: CanvasRenderingContext2D | null,
  rawName: string,
  maxWidthPx = 936,
  fontPx = 44,
  fontFamily = 'Inter, Segoe UI, Arial, sans-serif',
  maxLines = 3
): string[] {
  const clean = rawName.trim().replace(/\s+/g, ' ');
  if (!clean) return ['Sản phẩm trưng bày'];

  if (measureCanvasTextWidth(ctx, clean, fontPx, '900', fontFamily) <= maxWidthPx) {
    return [clean];
  }

  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (
      measureCanvasTextWidth(ctx, candidate, fontPx, '900', fontFamily) <= maxWidthPx ||
      !currentLine
    ) {
      currentLine = candidate;
    } else {
      if (lines.length + 1 >= maxLines) {
        let lastLine = `${currentLine} ${words.slice(i).join(' ')}`;
        while (
          lastLine.length > 4 &&
          measureCanvasTextWidth(ctx, `${lastLine}…`, fontPx, '900', fontFamily) > maxWidthPx
        ) {
          lastLine = lastLine.slice(0, -1).trimEnd();
        }
        lines.push(`${lastLine}…`);
        return lines;
      }
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
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
  const canvas = createCanvasElement(1536, 240);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const pal = getThemePalette(options.theme, options.color);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Unified KHU A Brand Header Frame
    ctx.save();
    createRoundRectPath(ctx, 10, 10, 1516, 220, 28);
    ctx.fillStyle = options.active ? pal.bgActive : pal.bg;
    ctx.fill();
    ctx.lineWidth = options.active ? 10 : 6;
    ctx.strokeStyle = options.active ? '#fbbf24' : pal.border;
    ctx.stroke();
    ctx.restore();

    // Top illuminated brand line
    ctx.fillStyle = options.active ? '#fbbf24' : pal.border;
    ctx.fillRect(42, 16, 1452, 8);

    // Left Corporate Emblem Medallion
    ctx.save();
    createRoundRectPath(ctx, 34, 34, 172, 172, 26);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = options.active ? '#fbbf24' : pal.border;
    ctx.stroke();
    ctx.restore();

    ctx.font = '900 76px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(pal.icon, 120, 144);

    // Center Full Enterprise Name (100% complete — never truncated with `...`)
    const fullEnterpriseTitle = options.name.toUpperCase();
    const fittedTitle = fitEnterpriseTitleLines(ctx, fullEnterpriseTitle, 980, 58, 32);
    ctx.save();
    ctx.font = `900 ${fittedTitle.fontPx}px Inter, Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.textMain;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    if (fittedTitle.lines.length === 1) {
      ctx.fillText(fittedTitle.lines[0], 234, 114);
    } else {
      ctx.fillText(fittedTitle.lines[0], 234, 84);
      ctx.fillText(fittedTitle.lines[1], 234, 134);
    }
    ctx.restore();

    // Subtitle: Booth Name & Category
    const categoryHeader = `★ ${options.category.toUpperCase()} ★`;
    const fittedSub = fitEnterpriseTitleLines(ctx, categoryHeader, 980, 28, 20);
    ctx.font = `800 ${fittedSub.fontPx}px Inter, Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(fittedSub.lines[0] || categoryHeader, 234, 184);

    // Right Product Count Pill
    ctx.save();
    createRoundRectPath(ctx, 1244, 52, 258, 136, 24);
    ctx.fillStyle = options.active ? pal.border : pal.badgeBg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    ctx.font = '900 44px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.badgeText;
    ctx.fillText(`${options.productCount} SP`, 1373, 116);

    ctx.font = '800 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = pal.badgeText;
    ctx.fillText('TRƯNG BÀY', 1373, 156);
  }

  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

export function createBoothFasciaTexture(options: {
  name: string;
  category: string;
  color: string;
  theme?: BoothVisualTheme;
}): THREE.CanvasTexture {
  return createBoothSignTexture({
    name: options.name,
    category: options.category,
    productCount: 6,
    color: options.color,
    active: false,
    theme: options.theme,
  });
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
 * with natural travertine veining, warm sand-limestone tones, and crisp recessed mortar.
 */
export function createPlazaTileTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Warm natural mortar grout base
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 512, 512);

    const tileSize = 128;
    const tones = ['#f8f6f0', '#f1ede4', '#f5f0e8', '#ebe4d8', '#f3ede5', '#e8e1d2'];

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * tileSize;
        const y = row * tileSize;
        const baseTone = tones[(row * 5 + col * 3) % tones.length];

        // Smooth multi-stop travertine slab gradient
        const grad = ctx.createLinearGradient(x + 3, y + 3, x + tileSize - 3, y + tileSize - 3);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, baseTone);
        grad.addColorStop(1, '#ddd4c5');
        ctx.fillStyle = grad;
        ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

        // Tactile natural stone flecks
        for (let s = 0; s < 16; s++) {
          const fx = x + 8 + ((s * 29 + row * 17) % (tileSize - 16));
          const fy = y + 8 + ((s * 43 + col * 23) % (tileSize - 16));
          ctx.fillStyle = s % 2 === 0 ? 'rgba(120, 105, 90, 0.22)' : 'rgba(255, 255, 255, 0.65)';
          ctx.fillRect(fx, fy, 2, 2);
        }

        // Inner carved architectural border line
        ctx.strokeStyle = 'rgba(180, 165, 150, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 11, y + 11, tileSize - 22, tileSize - 22);

        // Sunlit top/left bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(x + 3, y + 3, tileSize - 6, 2.5);
        ctx.fillRect(x + 3, y + 3, 2.5, tileSize - 6);

        // Bottom/right recess AO shadow
        ctx.fillStyle = 'rgba(51, 65, 85, 0.38)';
        ctx.fillRect(x + 3, y + tileSize - 5.5, tileSize - 6, 2.5);
        ctx.fillRect(x + tileSize - 5.5, y + 3, 2.5, tileSize - 6);

        // Architectural brass/stone corner inlay diamond
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
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
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    const tileSize = 128;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * tileSize;
        const y = row * tileSize;

        // Outer chamfer slope
        ctx.fillStyle = '#808080';
        ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

        // Raised stone slab plateau (bright = high elevation)
        const shade = 230 + ((row * 7 + col * 5) % 20);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(x + 6, y + 6, tileSize - 12, tileSize - 12);

        // Subtle carved inner border groove
        ctx.strokeStyle = '#a3a3a3';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 12, y + 12, tileSize - 24, tileSize - 24);
      }
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
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
  description?: string;
  color: string;
  logoUrl?: string;
  bannerUrl?: string;
  contactUrl?: string;
  contactEmail?: string;
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

    // 1. Calm, non-competing architectural showroom wall gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 576);
    bgGrad.addColorStop(0, pal.bg);
    bgGrad.addColorStop(0.5, '#0b1120');
    bgGrad.addColorStop(1, '#070b14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 576);

    // Optional custom banner image background overlay (toned down so products stay primary)
    if (loadedBanner) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(loadedBanner, 0, 0, 1024, 576);
      ctx.restore();
    }

    // Subtle vertical architectural acoustic/wood fluting slats
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.032)';
    for (let x = 32; x < 1024; x += 28) {
      ctx.fillRect(x, 86, 8, 468);
    }
    ctx.restore();

    // Dual soft showroom spotlight halos behind Left Hero Bay (slot_01) & Right Hero Bay (slot_02)
    for (const bayCenterX of [284, 740]) {
      const radial = ctx.createRadialGradient(bayCenterX, 330, 24, bayCenterX, 330, 220);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      radial.addColorStop(0.55, 'rgba(56, 189, 248, 0.04)');
      radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(bayCenterX - 230, 96, 460, 450);

      // Subtle architectural recessed bay frame behind each main product
      ctx.save();
      createRoundRectPath(ctx, bayCenterX - 208, 108, 416, 434, 24);
      ctx.strokeStyle = pal.border;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Illuminated outer perimeter architectural trim
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 996, 548);

    // Subtle Top Brand Crest Strip (sits high at y = 18..86, above the main product panels)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(18, 18, 988, 66);
    ctx.fillStyle = pal.border;
    ctx.fillRect(18, 82, 988, 3);

    if (loadedLogo) {
      ctx.save();
      createRoundRectPath(ctx, 42, 26, 50, 50, 12);
      ctx.clip();
      ctx.drawImage(loadedLogo, 42, 26, 50, 50);
      ctx.restore();
    }

    const headerCrest = `${pal.icon}  ${companyTitle}  ·  SHOWROOM TRƯNG BÀY CHÍNH HÃNG`;
    const fittedCrest = fitEnterpriseTitleLines(ctx, headerCrest, 900, 24, 16);
    ctx.font = `800 ${fittedCrest.fontPx}px Inter, Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textSub;
    ctx.fillText(fittedCrest.lines[0] || headerCrest, 512, 60);

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
      img.onerror = () => {
        renderBackdrop(undefined, logoImg);
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
      img.onerror = () => {
        renderBackdrop(bannerImg, undefined);
      };
      img.src = options.logoUrl;
    }
  }

  return texture;
}

const productImageCache = new Map<string, HTMLImageElement>();

function rememberCachedProductImage(url: string, img: HTMLImageElement): void {
  if (productImageCache.size >= 64) {
    const oldestKey = productImageCache.keys().next().value;
    if (oldestKey) {
      productImageCache.delete(oldestKey);
    }
  }
  productImageCache.set(url, img);
}

/**
 * Draws an HTMLImageElement inside a target box while strictly preserving its natural
 * aspect ratio (object-contain), with a soft studio backdrop so photos are never stretched.
 */
export function computeAspectFitRect(
  srcWidth: number,
  srcHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
  padding = 0
): { x: number; y: number; width: number; height: number } {
  const safeSrcW = Math.max(1, srcWidth);
  const safeSrcH = Math.max(1, srcHeight);
  const availW = Math.max(1, boxWidth - padding * 2);
  const availH = Math.max(1, boxHeight - padding * 2);
  const scale = Math.min(availW / safeSrcW, availH / safeSrcH);
  const width = Math.max(1, Math.round(safeSrcW * scale));
  const height = Math.max(1, Math.round(safeSrcH * scale));
  const x = Math.round(boxX + (boxWidth - width) / 2);
  const y = Math.round(boxY + (boxHeight - height) / 2);
  return { x, y, width, height };
}

/**
 * Creates a high-contrast Portrait Showroom 3D Product Display Panel texture (`1024 x 1240`)
 * for a product assigned to a slot:
 * - Upper 64% (`980 x 780`): Huge unstretched, uncropped product photo on a bright studio mount
 * - Lower 36% (`980 x 402`): High-contrast dark info zone with up to 3 lines of large product name
 *   (`42px-54px`) + prominent `64px` gold VND price (`6.850.000 ₫`)
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
  const W = 1024;
  const H = 1240;
  const canvas = createCanvasElement(W, H);
  const ctx = canvas.getContext('2d');
  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 8;
  const trimmedUrl = (options.imageUrl || '').trim();

  let isDisposed = false;
  const baseDispose = texture.dispose.bind(texture);
  texture.dispose = () => {
    isDisposed = true;
    baseDispose();
  };

  const slotCodeMatch = options.slotLabel.match(/SLOT[_\s-]*(\d+)/i);
  const shortSlotBadge = slotCodeMatch ? `SLOT ${slotCodeMatch[1]}` : truncateText(options.slotLabel, 12);

  const renderCard = (
    loadedImg?: HTMLImageElement,
    imageStatus: 'loaded' | 'loading' | 'missing' | 'error' = 'missing'
  ) => {
    if (!ctx || isDisposed) return;
    ctx.clearRect(0, 0, W, H);

    // 1. Outer Showroom Display Panel Frame
    ctx.save();
    createRoundRectPath(ctx, 6, 6, W - 12, H - 12, 32);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.lineWidth = options.selected ? 16 : 9;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    // 2. Enlarged Hero Studio Photo Viewport (980 x 780)
    const frameX = 22;
    const frameY = 22;
    const frameW = W - 44; // 980
    const frameH = 780;

    ctx.save();
    createRoundRectPath(ctx, frameX, frameY, frameW, frameH, 24);
    const studioGrad = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameH);
    studioGrad.addColorStop(0, '#ffffff');
    studioGrad.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = studioGrad;
    ctx.fill();
    ctx.restore();

    if (loadedImg && imageStatus === 'loaded') {
      const natW = loadedImg.naturalWidth || loadedImg.width || 800;
      const natH = loadedImg.naturalHeight || loadedImg.height || 600;

      ctx.save();
      createRoundRectPath(ctx, frameX, frameY, frameW, frameH, 24);
      ctx.clip();

      // Subtle studio backdrop fill so portrait/landscape photos never leave harsh blank bars
      ctx.save();
      ctx.globalAlpha = 0.22;
      const coverScale = Math.max(frameW / Math.max(1, natW), frameH / Math.max(1, natH));
      const coverW = natW * coverScale;
      const coverH = natH * coverScale;
      ctx.drawImage(
        loadedImg,
        frameX + (frameW - coverW) / 2,
        frameY + (frameH - coverH) / 2,
        coverW,
        coverH
      );
      ctx.restore();

      // True-aspect-ratio product photo (100% unstretched, uncropped)
      const fit = computeAspectFitRect(natW, natH, frameX, frameY, frameW, frameH, 8);
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 6;
      createRoundRectPath(ctx, fit.x, fit.y, fit.width, fit.height, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      ctx.save();
      createRoundRectPath(ctx, fit.x, fit.y, fit.width, fit.height, 16);
      ctx.clip();
      ctx.drawImage(loadedImg, fit.x, fit.y, fit.width, fit.height);
      ctx.restore();

      ctx.restore();
    } else {
      // Clean fallback when image is loading, missing, or broken
      ctx.save();
      createRoundRectPath(ctx, frameX, frameY, frameW, frameH, 24);
      const fallbackGrad = ctx.createLinearGradient(frameX, frameY, frameX + frameW, frameY + frameH);
      fallbackGrad.addColorStop(0, '#1e293b');
      fallbackGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = fallbackGrad;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, frameY + frameH / 2 - 34, 82, 0, Math.PI * 2);
      ctx.fillStyle = options.accentColor || '#0ea5e9';
      ctx.globalAlpha = 0.24;
      ctx.fill();
      ctx.restore();

      ctx.font = '900 58px Inter, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      const initials = options.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');
      ctx.fillText(initials || 'SP', W / 2, frameY + frameH / 2 - 12);

      ctx.font = '700 32px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      const statusText =
        imageStatus === 'loading'
          ? 'Đang tải ảnh sản phẩm...'
          : imageStatus === 'error'
            ? 'Không tải được ảnh sản phẩm'
            : 'Chưa có ảnh sản phẩm';
      ctx.fillText(statusText, W / 2, frameY + frameH / 2 + 86);
    }

    // Studio photo border & compact top-left Slot Badge
    ctx.save();
    createRoundRectPath(ctx, frameX, frameY, frameW, frameH, 24);
    ctx.lineWidth = 4;
    ctx.strokeStyle = options.selected ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    createRoundRectPath(ctx, frameX + 14, frameY + 14, 148, 46, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    ctx.font = '800 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(shortSlotBadge.toUpperCase(), frameX + 88, frameY + 45);

    // 3. Dedicated High-Contrast Product Name & Price Zone (y = 816..1218, 980 x 402)
    const infoX = 22;
    const infoY = 816;
    const infoW = W - 44; // 980
    const infoH = 402;

    ctx.save();
    createRoundRectPath(ctx, infoX, infoY, infoW, infoH, 24);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    // Accent top bar inside info panel
    ctx.fillStyle = options.selected ? '#fbbf24' : options.accentColor || '#38bdf8';
    ctx.fillRect(infoX + 28, infoY, infoW - 56, 6);

    // Product Name: up to 3 full-width lines in huge high-contrast white typography
    const titleLines = wrapProductTitleLines(ctx, options.name, 932, 44, undefined, 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    if (titleLines.length === 1) {
      ctx.font = '900 52px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(titleLines[0], 46, 946);
    } else if (titleLines.length === 2) {
      ctx.font = '900 46px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(titleLines[0], 46, 912);
      ctx.fillText(titleLines[1], 46, 974);
    } else {
      ctx.font = '900 40px Inter, Segoe UI, Arial, sans-serif';
      ctx.fillText(titleLines[0], 46, 892);
      ctx.fillText(titleLines[1], 46, 944);
      ctx.fillText(titleLines[2], 46, 996);
    }

    // Prominent Price Banner right below Product Name (e.g., `6.850.000 ₫`)
    ctx.save();
    createRoundRectPath(ctx, 42, 1054, 728, 140, 20);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();
    ctx.restore();

    ctx.font = '900 62px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(truncateText(options.priceText, 20), 66, 1146);

    // Interactive Action Pill on bottom-right of Price Row
    ctx.save();
    createRoundRectPath(ctx, W - 236, 1062, 194, 124, 20);
    ctx.fillStyle = options.selected ? '#fbbf24' : options.accentColor || '#0ea5e9';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 28px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = options.selected ? '#0f172a' : '#ffffff';
    ctx.fillText('CHI TIẾT', W - 139, 1118);
    ctx.font = '800 24px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillText('NHẤN XEM ▸', W - 139, 1154);

    texture.needsUpdate = true;
  };

  if (!trimmedUrl) {
    renderCard(undefined, 'missing');
    return texture;
  }

  const cachedImg = productImageCache.get(trimmedUrl);
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    renderCard(cachedImg, 'loaded');
    return texture;
  }

  renderCard(undefined, 'loading');

  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isDisposed) return;
      rememberCachedProductImage(trimmedUrl, img);
      renderCard(img, 'loaded');
    };
    img.onerror = () => {
      if (isDisposed) return;
      renderCard(undefined, 'error');
    };
    img.src = trimmedUrl;
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

/** Linear data maps aligned with the running-bond sidewalk's 4 x 8 pavers. */
export function createSidewalkPaverDataTexture(channel: 'height' | 'roughness', repeatX = 14, repeatY = 14): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = channel === 'height' ? '#555555' : '#f5f5f5';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col <= 4; col++) {
        const x = col * 128 + (row % 2) * 64;
        const y = row * 64;
        const shade = channel === 'height' ? 180 : 190 + ((row * 7 + col * 11 + 55) % 28);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x + 2.5, y + 2.5, 123, 59);
        if (channel === 'height') {
          ctx.fillStyle = '#c6c6c6';
          ctx.fillRect(x + 4.5, y + 4.5, 119, 55);
        }
      }
    }
  }
  const texture = registerTrackedTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a decorative compass-rose & radial cobble mosaic floor medallion texture
 * for the Central Pedestrian Plaza.
 */
export function createPlazaMedallionTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(1024, 1024);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = 512;
    const cy = 512;
    ctx.clearRect(0, 0, 1024, 1024);

    // Outer warm granite curb border
    ctx.beginPath();
    ctx.arc(cx, cy, 500, 0, Math.PI * 2);
    ctx.fillStyle = '#d6d3d1';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#a8a29e';
    ctx.stroke();

    // Main warm travertine & aged sandstone plaza floor
    ctx.beginPath();
    ctx.arc(cx, cy, 484, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f0e8';
    ctx.fill();

    // Concentric elegant natural stone paving rings with subtle tonal shifts
    const ringRadii = [450, 400, 340, 275, 205, 140];
    const ringFills = ['#ede5d8', '#f8f4ec', '#e9dfd0', '#f4ede2', '#e4d9c7', '#ede5d8'];
    ringRadii.forEach((r, idx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = ringFills[idx];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(168, 162, 158, 0.45)';
      ctx.stroke();
    });

    // Radial cobblestone paving joint lines (32 subtle segments)
    ctx.strokeStyle = 'rgba(168, 162, 158, 0.35)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 16;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 110, cy + Math.sin(angle) * 110);
      ctx.lineTo(cx + Math.cos(angle) * 480, cy + Math.sin(angle) * 480);
      ctx.stroke();
    }

    // Classical warm geometric stone rosette inlay (Aged Terra-Cotta & Warm Slate)
    // Refined, subtle and natural — no neon or bright blue/orange radar lines
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      const isMajor = i % 2 === 0;
      const outerR = isMajor ? 320 : 250;
      const halfSpread = 0.09;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 125, cy + Math.sin(angle) * 125);
      ctx.lineTo(
        cx + Math.cos(angle - halfSpread) * (outerR * 0.65),
        cy + Math.sin(angle - halfSpread) * (outerR * 0.65)
      );
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.lineTo(
        cx + Math.cos(angle + halfSpread) * (outerR * 0.65),
        cy + Math.sin(angle + halfSpread) * (outerR * 0.65)
      );
      ctx.closePath();
      ctx.fillStyle = isMajor ? '#c29b7f' : '#b0a495';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#e7ded4';
      ctx.stroke();
    }

    // Inner carved stone ring bordering the fountain base
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fillStyle = '#e7ded4';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#8c7e70';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 95, 0, Math.PI * 2);
    ctx.fillStyle = '#dfd3c3';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#baa896';
    ctx.stroke();
  }

  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Creates a stylized architectural glass & warm masonry facade texture for the
 * surrounding skyline buildings, giving depth and realism in third-person perspective.
 */
export function createCityBuildingFacadeTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(512, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Elegant warm limestone & tinted glass architectural facade base
    const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
    baseGrad.addColorStop(0, '#f1f5f9');
    baseGrad.addColorStop(0.4, '#e2e8f0');
    baseGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Multi-tier architectural floors & structural mullions
    const floors = 8;
    const cols = 6;
    const floorH = 512 / floors;
    const colW = 512 / cols;

    for (let r = 0; r < floors; r++) {
      const fy = r * floorH;

      // Heavy architectural concrete spandrel cornice
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, fy, 512, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, fy + 7, 512, 2.5);

      for (let c = 0; c < cols; c++) {
        const cx = c * colW;

        // Vertical fluted stone pilaster
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx, fy + 9.5, 7, floorH - 9.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 1, fy + 9.5, 2, floorH - 9.5);

        // Recessed curtain-wall window frame
        const winX = cx + 9;
        const winY = fy + 12;
        const winW = colW - 14;
        const winH = floorH - 18;

        // Dark window frame casing
        ctx.fillStyle = '#334155';
        ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);

        // High-end architectural tinted glass with sky & daylight reflections
        const isWarmLit = ((r * 7 + c * 5) % 6) === 0;
        const winGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
        if (isWarmLit) {
          winGrad.addColorStop(0, '#e0f2fe');
          winGrad.addColorStop(0.6, '#fef08a');
          winGrad.addColorStop(1, '#f59e0b');
        } else {
          winGrad.addColorStop(0, '#7dd3fc');
          winGrad.addColorStop(0.35, '#0284c7');
          winGrad.addColorStop(0.75, '#0369a1');
          winGrad.addColorStop(1, '#0f172a');
        }
        ctx.fillStyle = winGrad;
        ctx.fillRect(winX, winY, winW, winH);

        // Crisp diagonal glass reflection streak (stylized realistic glass glint)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.moveTo(winX + 2, winY + 2);
        ctx.lineTo(winX + Math.max(5, winW * 0.35), winY + 2);
        ctx.lineTo(winX + Math.max(2, winW * 0.18), winY + winH - 2);
        ctx.lineTo(winX + 2, winY + winH - 2);
        ctx.closePath();
        ctx.fill();

        // Architectural horizontal louver / sunshade bar
        if (r > 1) {
          ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
          ctx.fillRect(winX, winY + winH * 0.42, winW, 2);
        }
      }
    }
  }

  const texture = registerTrackedTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Creates a stylized sunlit daytime sky dome texture with soft horizon warmth
 * and subtle layered clouds for low-angle third-person views.
 */
export function createSkyDomeTexture(): THREE.CanvasTexture {
  const canvas = createCanvasElement(1024, 512);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Rich daytime sky gradient from deep atmospheric azure zenith to warm golden-horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, '#0369a1');
    skyGrad.addColorStop(0.25, '#0284c7');
    skyGrad.addColorStop(0.55, '#38bdf8');
    skyGrad.addColorStop(0.78, '#bae6fd');
    skyGrad.addColorStop(0.92, '#f0fdf4');
    skyGrad.addColorStop(1, '#fef9c3');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // Subtle sun flare glow on upper-east quadrant
    const sunGrad = ctx.createRadialGradient(280, 140, 10, 280, 140, 260);
    sunGrad.addColorStop(0, 'rgba(255, 255, 240, 0.45)');
    sunGrad.addColorStop(0.35, 'rgba(254, 240, 138, 0.22)');
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // Multi-layered soft stylized cirrocumulus clouds
    const clouds = [
      { x: 120, y: 260, rx: 140, ry: 36, alpha: 0.55 },
      { x: 230, y: 245, rx: 110, ry: 44, alpha: 0.65 },
      { x: 420, y: 230, rx: 160, ry: 40, alpha: 0.60 },
      { x: 530, y: 218, rx: 120, ry: 48, alpha: 0.70 },
      { x: 740, y: 250, rx: 150, ry: 38, alpha: 0.58 },
      { x: 860, y: 238, rx: 110, ry: 42, alpha: 0.68 },
    ];
    ctx.save();
    for (const c of clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${c.alpha})`;
      ctx.fill();

      // Fluffy upper cloud lobes
      ctx.beginPath();
      ctx.ellipse(c.x - c.rx * 0.28, c.y - c.ry * 0.35, c.rx * 0.45, c.ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(c.x + c.rx * 0.25, c.y - c.ry * 0.4, c.rx * 0.5, c.ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const texture = registerTrackedTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}
