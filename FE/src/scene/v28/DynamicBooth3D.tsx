import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { V28BoothPlacementView, V28Product } from '../../services/v28Api';
import {
  cloneArchetypeShared,
  getCachedArchetypePrototype,
  loadV28ArchetypePrototype,
} from './v28BoothAssets';
import {
  getV28BoothInstanceScale,
  getV28BoothSlotSpec,
  type V28ArchetypeSlotSpec,
} from './v28ProductSlotLayouts';
import { createArchitecturalProductDisplayTexture } from '../sceneTextures';
import { formatCurrency } from '../../components/ProductPanel';
import { inferProductShape3D, type AgriProductShape3D } from '../../services/v28AgriDemoShowcase';
import type { V28NpcAnimState } from './DynamicBoothNpc3D';

// Shared lightweight geometries & materials for V27.5-parity architectural product stands (UAT Fix 06: +8% card clarity)
const SLOT_STAND_BASE_GEOM = new THREE.BoxGeometry(1.14, 0.036, 0.38);
const SLOT_STAND_LED_TRIM_GEOM = new THREE.BoxGeometry(1.17, 0.012, 0.40);
const SLOT_STAND_STRUT_GEOM = new THREE.BoxGeometry(0.26, 0.50, 0.05);
const SLOT_CARD_FRAME_GEOM = new THREE.BoxGeometry(1.22, 1.48, 0.046);
const SLOT_CARD_BEZEL_GEOM = new THREE.BoxGeometry(1.26, 1.52, 0.03);
const SLOT_CARD_PLANE_GEOM = new THREE.PlaneGeometry(1.18, 1.43);

// UAT Fix 06: Wider Elongated Rounded Exhibition Signage (+14.4% wider: 4.78 × 0.56m, 8.54:1 aspect)
const SIGN_WIDTH = 4.78;
const SIGN_HEIGHT = 0.56;
const SIGN_CORNER_R = 0.15;

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw, hh);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return shape;
}

const SIGN_BOARD_GEOM = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
const SIGN_BACK_GEOM = (() => {
  const shape = createRoundedRectShape(SIGN_WIDTH + 0.04, SIGN_HEIGHT + 0.04, SIGN_CORNER_R + 0.015);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geom.translate(0, 0, -0.016);
  return geom;
})();
const FOCUS_RING_GEOM = new THREE.RingGeometry(0.55, 0.72, 24);

const STAND_BASE_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.38, metalness: 0.28 });
const STAND_STRUT_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.35 });
const SIGN_BACK_MAT = new THREE.MeshStandardMaterial({
  color: '#1e3a52',
  emissive: '#0e7490',
  emissiveIntensity: 0.14,
  roughness: 0.28,
  metalness: 0.56,
});
const HOVER_GOLD_MAT = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.25, metalness: 0.65 });
const HOVER_TRIM_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
// Shared lightweight 3D agricultural product geometries (Phase 3.2: 2D card + 3D prop, flush on base)
const PROP_JAR_BODY_GEOM = new THREE.CylinderGeometry(0.11, 0.12, 0.24, 16);
const PROP_JAR_LID_GEOM = new THREE.CylinderGeometry(0.095, 0.095, 0.045, 16);
const PROP_BOTTLE_BODY_GEOM = new THREE.CylinderGeometry(0.075, 0.085, 0.30, 16);
const PROP_BOTTLE_NECK_GEOM = new THREE.CylinderGeometry(0.032, 0.055, 0.11, 14);
const PROP_POUCH_GEOM = new THREE.BoxGeometry(0.22, 0.28, 0.085);
const PROP_BOX_GEOM = new THREE.BoxGeometry(0.26, 0.20, 0.16);
const PROP_CAN_GEOM = new THREE.CylinderGeometry(0.095, 0.095, 0.24, 16);
const PROP_BASKET_GEOM = new THREE.CylinderGeometry(0.16, 0.12, 0.14, 14);
const PROP_FRUIT_SPHERE_GEOM = new THREE.SphereGeometry(0.068, 12, 12);
const PROP_LID_GOLD_MAT = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.3, metalness: 0.55 });
const PROP_BASKET_MAT = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.75, metalness: 0.05 });

const AgriProductProp3D: React.FC<{ shape: AgriProductShape3D; accentColor: string }> = React.memo(({ shape, accentColor }) => {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: accentColor || '#15803d', roughness: 0.32, metalness: 0.14 }),
    [accentColor]
  );
  useEffect(() => () => mat.dispose(), [mat]);

  // Positioned cleanly in front-right of the 2D display card, resting flush on y = 0.045 base top
  if (shape === 'jar') {
    return (
      <group position={[0.36, 0.045, 0.10]}>
        <mesh position={[0, 0.12, 0]} geometry={PROP_JAR_BODY_GEOM} material={mat} castShadow />
        <mesh position={[0, 0.26, 0]} geometry={PROP_JAR_LID_GEOM} material={PROP_LID_GOLD_MAT} />
      </group>
    );
  }
  if (shape === 'bottle') {
    return (
      <group position={[0.38, 0.045, 0.10]}>
        <mesh position={[0, 0.15, 0]} geometry={PROP_BOTTLE_BODY_GEOM} material={mat} castShadow />
        <mesh position={[0, 0.34, 0]} geometry={PROP_BOTTLE_NECK_GEOM} material={PROP_LID_GOLD_MAT} />
      </group>
    );
  }
  if (shape === 'pouch') {
    return (
      <group position={[0.36, 0.045, 0.10]} rotation={[0, -0.25, 0]}>
        <mesh position={[0, 0.14, 0]} geometry={PROP_POUCH_GEOM} material={mat} castShadow />
      </group>
    );
  }
  if (shape === 'can') {
    return (
      <group position={[0.36, 0.045, 0.10]}>
        <mesh position={[0, 0.12, 0]} geometry={PROP_CAN_GEOM} material={mat} castShadow />
        <mesh position={[0, 0.245, 0]} geometry={PROP_JAR_LID_GEOM} material={PROP_LID_GOLD_MAT} />
      </group>
    );
  }
  if (shape === 'basket') {
    return (
      <group position={[0.35, 0.045, 0.10]}>
        <mesh position={[0, 0.07, 0]} geometry={PROP_BASKET_GEOM} material={PROP_BASKET_MAT} castShadow />
        <mesh position={[-0.05, 0.15, 0.02]} geometry={PROP_FRUIT_SPHERE_GEOM} material={mat} />
        <mesh position={[0.05, 0.15, -0.02]} geometry={PROP_FRUIT_SPHERE_GEOM} material={mat} />
        <mesh position={[0, 0.18, 0]} geometry={PROP_FRUIT_SPHERE_GEOM} material={PROP_LID_GOLD_MAT} />
      </group>
    );
  }
  return (
    <group position={[0.36, 0.045, 0.10]} rotation={[0, -0.22, 0]}>
      <mesh position={[0, 0.10, 0]} geometry={PROP_BOX_GEOM} material={mat} castShadow />
    </group>
  );
});

const HIGHLIGHT_OUTLINE_GEOM = new THREE.BoxGeometry(1.32, 1.58, 0.022);
const HIGHLIGHT_OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.95 });
const HIGHLIGHT_TAG_GEOM = new THREE.PlaneGeometry(1.06, 0.26);

let cachedHighlightTagTex: THREE.CanvasTexture | null = null;
function getHighlightTagTexture(): THREE.CanvasTexture {
  if (cachedHighlightTagTex) return cachedHighlightTagTex;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 76;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x = 6, y = 8, w = canvas.width - 12, h = canvas.height - 16, r = 28;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#facc15';
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.font = '700 24px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ Đang giới thiệu', canvas.width / 2, y + h / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedHighlightTagTex = tex;
  return tex;
}

// UAT Fix 05: Per-archetype lowered signY (-0.22..-0.33 world units) so rounded signage clears Focus HUD cleanly
// and harmonizes with arched/portal roofs without blocking entrances, products, or NPCs.
const ARCHETYPE_SIGN_THEME: Record<string, { bgTop: string; bgBottom: string; trim: string; signY: number }> = {
  signature_ring: { bgTop: '#0b192c', bgBottom: '#0f2942', trim: '#2dd4bf', signY: 3.28 },
  organic_flow: { bgTop: '#0b1e2d', bgBottom: '#0f2e3a', trim: '#2dd4bf', signY: 3.28 },
  grand_portal: { bgTop: '#0c1a33', bgBottom: '#102844', trim: '#38bdf8', signY: 3.28 },
  wave_pavilion: { bgTop: '#0a1f30', bgBottom: '#0d3145', trim: '#22d3ee', signY: 3.52 },
  gallery_arch: { bgTop: '#0e1b34', bgBottom: '#122945', trim: '#2dd4bf', signY: 3.36 },
  dynamic_frame: { bgTop: '#0d1b2e', bgBottom: '#12263d', trim: '#38bdf8', signY: 3.26 },
};

function computeBrandInitials(name: string): string {
  const words = (name || 'GE').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return (words[0] || 'GE').slice(0, 2).toUpperCase();
}

function wrapSignText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['GIAN HÀNG TRIỂN LÃM'];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(' ');
        let trimmed = rest;
        while (trimmed.length > 3 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
          trimmed = trimmed.slice(0, -1).trimEnd();
        }
        lines.push(trimmed === rest ? trimmed : `${trimmed}…`);
        return lines;
      }
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}

function createBoothSignTexture(
  boothNumber: number,
  boothName: string,
  companyName: string,
  zoneCode: string,
  brandColor: string,
  archetypeId: string
): THREE.CanvasTexture {
  // Exact 8.51:1 aspect ratio matching 4.78 × 0.56m wider rounded 3D plaque (0% distortion on logo or text!)
  const canvas = document.createElement('canvas');
  canvas.width = 1464;
  canvas.height = 172;
  const ctx = canvas.getContext('2d')!;
  const theme = ARCHETYPE_SIGN_THEME[archetypeId] || ARCHETYPE_SIGN_THEME.signature_ring;
  const accent = brandColor || theme.trim;
  const w = canvas.width;
  const h = canvas.height;
  const radius = 45; // matches SIGN_CORNER_R = 0.15m on 0.56m height

  ctx.clearRect(0, 0, w, h);

  // Clip & paint true rounded deep-navy + subtle teal architectural backdrop
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, radius);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, theme.bgTop);
  bg.addColorStop(0.55, '#102a43');
  bg.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle top ambient sheen & refined teal radial highlight
  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h * 0.55);

  // Subtle bottom teal accent line
  const bottomBar = ctx.createLinearGradient(0, 0, w, 0);
  bottomBar.addColorStop(0, accent);
  bottomBar.addColorStop(0.5, '#2dd4bf');
  bottomBar.addColorStop(1, 'rgba(45, 212, 191, 0.25)');
  ctx.fillStyle = bottomBar;
  ctx.fillRect(0, h - 6, w, 6);
  ctx.restore();

  // Thin crisp teal-tinted rounded perimeter border (no chunky black frame)
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, h - 6, radius - 1);
  ctx.strokeStyle = 'rgba(45, 212, 191, 0.55)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Left Rounded Brand Emblem / Monogram Square (zero stretching)
  const displayBrand = (companyName || boothName || `Gian #${boothNumber}`).trim();
  const initials = computeBrandInitials(displayBrand);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(36, 30, 110, 110, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, 91, 86);

  // Right Compact Metadata Pills (#boothNumber + KHU zoneCode), vertically centered & balanced
  const pillY = 66;
  ctx.fillStyle = 'rgba(45, 212, 191, 0.16)';
  ctx.beginPath();
  ctx.roundRect(w - 154, pillY, 114, 40, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(45, 212, 191, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ccfbf1';
  ctx.font = '700 22px "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.fillText(`KHU ${zoneCode}`, w - 97, pillY + 21);

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.roundRect(w - 256, pillY, 90, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 23px "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.fillText(`#${boothNumber}`, w - 211, pillY + 21);

  // Primary Enterprise Name — Hero Typography (high contrast near & far, safe 2-line wrap)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(2, 6, 23, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  const maxTextW = w - 455;
  const fontSize = displayBrand.length > 28 ? 38 : 50;
  ctx.font = `800 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  const lines = wrapSignText(ctx, displayBrand, maxTextW, 2);
  if (lines.length === 1) {
    ctx.fillText(lines[0], 174, 88);
  } else {
    ctx.fillText(lines[0], 174, 62);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(lines[1], 174, 114);
  }
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface ProductDisplaySlotProps {
  spec: V28ArchetypeSlotSpec;
  product: V28Product | null;
  slotId: string;
  brandColor: string;
  isHighlighted?: boolean;
  onSelect: (product: V28Product, slotId: string) => void;
}

const ProductDisplaySlot: React.FC<ProductDisplaySlotProps> = React.memo(
  ({ spec, product, slotId, brandColor, isHighlighted = false, onSelect }) => {
    const [hovered, setHovered] = useState(false);
    const pulseGroupRef = useRef<THREE.Group>(null);

    const accentMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: brandColor || '#0ea5e9', roughness: 0.36, metalness: 0.22 }),
      [brandColor]
    );
    useEffect(() => () => accentMat.dispose(), [accentMat]);

    const cardTexture = useMemo(() => {
      if (!product) return null;
      const priceText =
        product.price > 0
          ? formatCurrency(product.price, product.currency || 'VND')
          : 'Liên hệ báo giá';
      return createArchitecturalProductDisplayTexture({
        name: product.name,
        priceText,
        imageUrl: product.images?.[0] || '',
        accentColor: brandColor || '#0ea5e9',
        selected: false,
        style: spec.displayStyle,
      });
    }, [product, product?.id, product?.name, product?.price, product?.currency, product?.images?.[0], brandColor, spec.displayStyle]);

    useEffect(() => () => cardTexture?.dispose(), [cardTexture]);

    useFrame(({ clock }) => {
      if (!pulseGroupRef.current) return;
      if (isHighlighted) {
        const pulse = 1 + Math.sin(clock.getElapsedTime() * 4.5) * 0.025;
        pulseGroupRef.current.scale.set(pulse, pulse, pulse);
      } else if (pulseGroupRef.current.scale.x !== 1) {
        pulseGroupRef.current.scale.set(1, 1, 1);
      }
    });

    const propShape3D = useMemo(() => (product ? inferProductShape3D(product) : null), [product]);

    // Empty slots render nothing so physical GLB counters/podiums/shelves stay clean (V27.5 parity)
    if (!product) return null;

    const isEmphasized = hovered || isHighlighted;
    const renderScale = spec.shelfFitScale ?? spec.scale;
    // P1-01: Clamp hover/NPC highlight scale to real vertical shelf headroom (hlOutlineTopLocal = 1.569m + 1.5cm safety buffer)
    const maxSafeScale =
      spec.maxHeadroomM !== undefined ? Math.max(0.25, (spec.maxHeadroomM - 0.015) / 1.57) : Infinity;
    const s = isEmphasized ? Math.min(renderScale * 1.05, maxSafeScale) : renderScale;
    const renderY = spec.position[1] + (spec.surfaceYOffset ?? 0);
    const isTightShelf = spec.maxHeadroomM !== undefined;

    return (
      <group
        position={[spec.position[0], renderY, spec.position[2]]}
        rotation={[0, spec.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(product, slotId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <group scale={[s, s, s]}>
          <group ref={pulseGroupRef}>
            {/* Weighted Architectural Display Base resting flush on counter / podium / shelf */}
            <mesh position={[0, 0.018, 0]} geometry={SLOT_STAND_BASE_GEOM} material={STAND_BASE_MAT} castShadow />
            <mesh
              position={[0, 0.04, 0]}
              geometry={SLOT_STAND_LED_TRIM_GEOM}
              material={isEmphasized ? HOVER_TRIM_MAT : accentMat}
            />
            {/* Rear Angled Structural Easel Strut */}
            <mesh
              position={[0, 0.24, -0.10]}
              rotation={[0.26, 0, 0]}
              geometry={SLOT_STAND_STRUT_GEOM}
              material={STAND_STRUT_MAT}
            />
            {/* Beveled 3D Architectural Display Frame facing visitor (+Z) */}
            <group position={[0, 0.78, 0.02]} rotation={[-0.08, 0, 0]}>
              {isHighlighted && (
                <mesh position={[0, 0, -0.014]} geometry={HIGHLIGHT_OUTLINE_GEOM} material={HIGHLIGHT_OUTLINE_MAT} />
              )}
              <mesh
                position={[0, 0, -0.006]}
                geometry={SLOT_CARD_BEZEL_GEOM}
                material={isEmphasized ? HOVER_TRIM_MAT : accentMat}
              />
              <mesh
                geometry={SLOT_CARD_FRAME_GEOM}
                material={isEmphasized ? HOVER_GOLD_MAT : STAND_BASE_MAT}
                castShadow
              />
              {cardTexture && (
                <mesh position={[0, 0, 0.026]} geometry={SLOT_CARD_PLANE_GEOM}>
                  <meshBasicMaterial map={cardTexture} toneMapped={false} />
                </mesh>
              )}
            </group>
            {/* Combined 3D Agricultural Product Prop resting flush on stand base alongside 2D packaging card (Phase 3.2) */}
            {propShape3D && <AgriProductProp3D shape={propShape3D} accentColor={brandColor} />}
            {/* Synchronized NPC narration spotlight & compact label (Phase 1.4 + P1-01 shelf-safe badge placement) */}
            {isHighlighted && (
              <>
                <pointLight position={[0, isTightShelf ? 0.85 : 1.12, 0.55]} intensity={1.1} distance={2.6} color="#fde68a" />
                <Billboard
                  position={isTightShelf ? [0, -0.07, 0.34] : [0, 1.76, 0.04]}
                  scale={isTightShelf ? [0.82, 0.82, 1] : [1, 1, 1]}
                  follow
                >
                  <mesh geometry={HIGHLIGHT_TAG_GEOM} renderOrder={15}>
                    <meshBasicMaterial map={getHighlightTagTexture()} transparent toneMapped={false} />
                  </mesh>
                </Billboard>
              </>
            )}
          </group>
        </group>
      </group>
    );
  }
);

export interface DynamicBooth3DProps {
  booth: V28BoothPlacementView;
  lodTier: 0 | 1 | 2; // 0 = Near Full Detail, 1 = Mid Shell Only, 2 = Far (handled by InstancedProxy)
  isFocused: boolean;
  highlightedSlotId?: string | null;
  highlightedProductId?: string | null;
  npcAnimState?: V28NpcAnimState;
  onFocusBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  onClickNpc?: (booth: V28BoothPlacementView) => void;
}

export const DynamicBooth3D: React.FC<DynamicBooth3DProps> = React.memo(
  ({ booth, lodTier, isFocused, highlightedSlotId = null, highlightedProductId = null, npcAnimState = 'idle', onFocusBooth, onSelectProduct, onClickNpc }) => {
    const [modelGroup, setModelGroup] = useState<THREE.Group | null>(() => {
      const cached = getCachedArchetypePrototype(booth.archetypeId);
      return cached ? cloneArchetypeShared(cached) : null;
    });

    useEffect(() => {
      let cancelled = false;
      const cached = getCachedArchetypePrototype(booth.archetypeId);
      if (cached) {
        setModelGroup(cloneArchetypeShared(cached));
        return;
      }
      loadV28ArchetypePrototype(booth.archetypeId)
        .then((proto) => {
          if (!cancelled) {
            setModelGroup(cloneArchetypeShared(proto));
          }
        })
        .catch((err) => {
          console.error(`[V28 Booth] Failed to load GLB archetype '${booth.archetypeId}' for booth ${booth.boothId}:`, err);
        });
      return () => {
        cancelled = true;
      };
    }, [booth.archetypeId, booth.boothId]);

    // Signage canvas texture (created only for Ring 0 & Ring 1; disposed cleanly on unmount)
    const boothNumber = Math.max(1, (Number.isFinite(booth.slotIndex) ? booth.slotIndex : 0) + 1);
    const signTexture = useMemo(() => {
      if (lodTier === 2) return null;
      return createBoothSignTexture(
        boothNumber,
        booth.boothName,
        booth.companyName,
        booth.zoneCode,
        booth.color,
        booth.archetypeId
      );
    }, [boothNumber, booth.boothName, booth.companyName, booth.zoneCode, booth.color, booth.archetypeId, lodTier]);

    useEffect(() => {
      return () => {
        signTexture?.dispose();
      };
    }, [signTexture]);

    const instanceScale = getV28BoothInstanceScale(booth);
    const signTheme = ARCHETYPE_SIGN_THEME[booth.archetypeId] || ARCHETYPE_SIGN_THEME.signature_ring;
    const signY = signTheme.signY * instanceScale;

    return (
      <group
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onFocusBooth(booth);
        }}
      >
        {/* 100% Real V27.4 GLB Archetype across ALL LOD rings (V28-AUDIT-006: dispose={null} preserves shared GPU geometries & materials!) */}
        {modelGroup && (
          <primitive object={modelGroup} scale={[instanceScale, instanceScale, instanceScale]} dispose={null} />
        )}

        {/* Brand Signage Board (Ring 0 & Ring 1 — double-sided front & rear for side/rear booth recognition) */}
        {signTexture && (
          <group
            position={[0, signY, booth.footprintDepth / 2 + 0.08]}
            scale={[instanceScale, instanceScale, instanceScale]}
          >
            <mesh geometry={SIGN_BACK_GEOM} material={SIGN_BACK_MAT} castShadow />
            <mesh position={[0, 0, 0.026]} geometry={SIGN_BOARD_GEOM}>
              <meshBasicMaterial map={signTexture} transparent alphaTest={0.05} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.026]} rotation={[0, Math.PI, 0]} geometry={SIGN_BOARD_GEOM}>
              <meshBasicMaterial map={signTexture} transparent alphaTest={0.05} toneMapped={false} />
            </mesh>
          </group>
        )}

        {/* Focus Approach Indicator (Ring 0 & Ring 1) */}
        {lodTier !== 2 && (
          <mesh
            position={[0, 0.03, booth.footprintDepth / 2 + 1.15]}
            rotation={[-Math.PI / 2, 0, 0]}
            geometry={FOCUS_RING_GEOM}
          >
            <meshBasicMaterial
              color={isFocused ? '#f59e0b' : booth.color || '#0ea5e9'}
              transparent
              opacity={isFocused ? 0.95 : 0.55}
            />
          </mesh>
        )}

        {/* 6 Archetype-Aligned Product Display Slots (Mounted in the SAME instanceScale group as GLB so every stand rests flush on its real counter/podium/shelf/niche!) */}
        {lodTier === 0 && (
          <group scale={[instanceScale, instanceScale, instanceScale]}>
            {booth.slots.slice(0, 6).map((slot) => {
              const spec = getV28BoothSlotSpec(booth.archetypeId, slot.slotId);
              const isSlotHighlighted = Boolean(
                slot.product &&
                highlightedSlotId &&
                highlightedProductId &&
                slot.slotId === highlightedSlotId &&
                slot.product.id === highlightedProductId
              );
              return (
                <ProductDisplaySlot
                  key={slot.slotId}
                  spec={spec}
                  product={slot.product}
                  slotId={slot.slotId}
                  brandColor={booth.color}
                  isHighlighted={isSlotHighlighted}
                  onSelect={(prod, sId) => onSelectProduct(booth, prod, sId)}
                />
              );
            })}
          </group>
        )}
      </group>
    );
  }
);
