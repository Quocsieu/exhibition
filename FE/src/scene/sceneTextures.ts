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

export function createBoothSignTexture(options: {
  name: string;
  category: string;
  productCount: number;
  color: string;
  active: boolean;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(640, 220);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    createRoundRectPath(ctx, 16, 16, 608, 188, 28);
    ctx.fillStyle = options.active ? 'rgba(15, 23, 42, 0.97)' : 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = options.active ? 8 : 5;
    ctx.strokeStyle = options.color || '#0ea5e9';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    createRoundRectPath(ctx, 36, 30, 568, 10, 5);
    ctx.fillStyle = options.color || '#0ea5e9';
    ctx.fill();
    ctx.restore();

    ctx.font = '700 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(truncateText(options.category.toUpperCase(), 34), 320, 74);

    ctx.font = '800 36px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncateText(options.name, 26), 320, 122);

    ctx.save();
    createRoundRectPath(ctx, 130, 142, 380, 44, 22);
    ctx.fillStyle = options.active ? options.color : 'rgba(30, 41, 59, 0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = options.color || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    ctx.font = '700 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = options.active ? '#ffffff' : '#38bdf8';
    ctx.fillText(`📦 ${options.productCount} sản phẩm · Bấm để xem`, 320, 171);
  }

  return registerTrackedTexture(canvas);
}

export function createBoothFasciaTexture(options: {
  name: string;
  category: string;
  color: string;
}): THREE.CanvasTexture {
  const canvas = createCanvasElement(768, 128);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = options.color || '#0ea5e9';
    ctx.fillRect(0, 0, 28, canvas.height);
    ctx.fillRect(canvas.width - 28, 0, 28, canvas.height);
    ctx.fillRect(0, canvas.height - 10, canvas.width, 10);

    ctx.font = '800 40px Inter, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(truncateText(options.name.toUpperCase(), 26), canvas.width / 2, 64);

    ctx.font = '600 22px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(truncateText(options.category, 38), canvas.width / 2, 100);
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
