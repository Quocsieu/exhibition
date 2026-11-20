import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { V28BoothPlacementView, V28Product } from '../../services/v28Api';
import {
  acquireSharedTexture,
  cloneArchetypeShared,
  getCachedArchetypePrototype,
  loadV28ArchetypePrototype,
  releaseSharedTexture,
} from './v28BoothAssets';
import type { V28NpcAnimState } from './DynamicBoothNpc3D';

// Shared lightweight geometries & materials for product display pedestals (reused across all booths)
const PEDESTAL_GEOM = new THREE.CylinderGeometry(0.28, 0.32, 0.85, 14);
const CARD_FRAME_GEOM = new THREE.BoxGeometry(0.68, 0.52, 0.05);
const CARD_FACE_GEOM = new THREE.PlaneGeometry(0.62, 0.44);
const PRODUCT_LABEL_GEOM = new THREE.PlaneGeometry(0.74, 0.24);
const SIGN_BOARD_GEOM = new THREE.PlaneGeometry(3.8, 0.72);
const SIGN_BACK_GEOM = new THREE.BoxGeometry(3.92, 0.82, 0.08);
const FOCUS_RING_GEOM = new THREE.RingGeometry(0.55, 0.72, 24);

const PEDESTAL_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45, metalness: 0.12 });
const EMPTY_SLOT_MAT = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.7, metalness: 0.05 });
const CARD_FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.35, metalness: 0.4 });
const SIGN_BACK_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4, metalness: 0.35 });

// 6 well-spaced interior display positions inside the booth footprint
const SLOT_LOCAL_POSITIONS: ReadonlyArray<[number, number, number]> = [
  [-1.55, 0.0, 0.65],
  [0.0, 0.0, 0.85],
  [1.55, 0.0, 0.65],
  [-1.55, 0.0, -0.85],
  [0.0, 0.0, -0.95],
  [1.55, 0.0, -0.85],
];

function createBoothSignTexture(
  boothName: string,
  companyName: string,
  zoneCode: string,
  brandColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Brand accent bar
  ctx.fillStyle = brandColor || '#0ea5e9';
  ctx.fillRect(0, 0, 18, canvas.height);
  ctx.fillRect(0, canvas.height - 8, canvas.width, 8);

  // Zone pill
  ctx.fillStyle = brandColor || '#0ea5e9';
  ctx.fillRect(34, 24, 96, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`KHU ${zoneCode}`, 82, 44);

  // Booth title
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
  const title = boothName.length > 30 ? `${boothName.slice(0, 29)}…` : boothName;
  ctx.fillText(title, 148, 52);

  // Company subtitle
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 23px system-ui, -apple-system, sans-serif';
  const sub = companyName.length > 42 ? `${companyName.slice(0, 41)}…` : companyName;
  ctx.fillText(sub, 34, 114);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createProductLabelTexture(name: string, price: number, currency: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  // Sleek dark card with subtle border
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  // Product name (clean truncation so it never clips or overlaps)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cleanName = name.length > 26 ? `${name.slice(0, 25)}…` : name;
  ctx.fillText(cleanName, canvas.width / 2, 54);

  // Real Catalog price (NEVER fabricate a price when price <= 0)
  const priceLabel =
    price > 0
      ? `${price.toLocaleString('vi-VN')} ${currency || 'VND'}`
      : 'Liên hệ báo giá';
  ctx.fillStyle = price > 0 ? '#34d399' : '#cbd5e1';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(priceLabel, canvas.width / 2, 114);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

interface ProductDisplaySlotProps {
  position: [number, number, number];
  product: V28Product | null;
  slotId: string;
  brandColor: string;
  onSelect: (product: V28Product, slotId: string) => void;
}

const ProductDisplaySlot: React.FC<ProductDisplaySlotProps> = React.memo(
  ({ position, product, slotId, brandColor, onSelect }) => {
    const imageUrl = product?.images?.[0] || '';
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useEffect(() => {
      if (!imageUrl) {
        setTexture(null);
        return;
      }
      const tex = acquireSharedTexture(imageUrl);
      setTexture(tex);
      return () => {
        releaseSharedTexture(imageUrl);
      };
    }, [imageUrl]);

    const accentMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: brandColor || '#0ea5e9', roughness: 0.4, metalness: 0.2 }),
      [brandColor]
    );
    useEffect(() => () => accentMat.dispose(), [accentMat]);

    const labelTex = useMemo(
      () => (product ? createProductLabelTexture(product.name, product.price, product.currency) : null),
      [product?.name, product?.price, product?.currency]
    );
    useEffect(() => () => labelTex?.dispose(), [labelTex]);

    return (
      <group
        position={position}
        onClick={(e) => {
          if (!product) return;
          e.stopPropagation();
          onSelect(product, slotId);
        }}
      >
        {/* Pedestal */}
        <mesh
          position={[0, 0.425, 0]}
          geometry={PEDESTAL_GEOM}
          material={product ? PEDESTAL_MAT : EMPTY_SLOT_MAT}
          castShadow
          receiveShadow
        />
        {/* Product Display Frame + Crisp 3D Name & Price Label (only when slot has a product) */}
        {product ? (
          <group position={[0, 1.18, 0]}>
            <mesh geometry={CARD_FRAME_GEOM} material={CARD_FRAME_MAT} castShadow />
            <mesh position={[0, 0, 0.028]} geometry={CARD_FACE_GEOM}>
              {texture ? (
                <meshBasicMaterial map={texture} toneMapped={false} />
              ) : (
                <meshStandardMaterial color={brandColor || '#0ea5e9'} roughness={0.4} metalness={0.15} />
              )}
            </mesh>
            {labelTex && (
              <mesh position={[0, 0.44, 0.04]} geometry={PRODUCT_LABEL_GEOM}>
                <meshBasicMaterial map={labelTex} toneMapped={false} />
              </mesh>
            )}
          </group>
        ) : (
          <mesh position={[0, 0.87, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.14, 0.2, 16]} />
            <meshBasicMaterial color="#94a3b8" transparent opacity={0.45} />
          </mesh>
        )}
      </group>
    );
  }
);

export interface DynamicBooth3DProps {
  booth: V28BoothPlacementView;
  lodTier: 0 | 1 | 2; // 0 = Near Full Detail, 1 = Mid Shell Only, 2 = Far (handled by InstancedProxy)
  isFocused: boolean;
  npcAnimState?: V28NpcAnimState;
  onFocusBooth: (booth: V28BoothPlacementView) => void;
  onSelectProduct: (booth: V28BoothPlacementView, product: V28Product, slotId: string) => void;
  onClickNpc?: (booth: V28BoothPlacementView) => void;
}

export const DynamicBooth3D: React.FC<DynamicBooth3DProps> = React.memo(
  ({ booth, lodTier, isFocused, npcAnimState = 'idle', onFocusBooth, onSelectProduct, onClickNpc }) => {
    const [modelGroup, setModelGroup] = useState<THREE.Group | null>(() => {
      const cached = getCachedArchetypePrototype(booth.archetypeId);
      return cached ? cloneArchetypeShared(cached) : null;
    });

    useEffect(() => {
      if (lodTier === 2) {
        setModelGroup(null);
        return;
      }
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
        .catch(() => {
          // Keep graceful fallback if a GLB fails to load
        });
      return () => {
        cancelled = true;
      };
    }, [booth.archetypeId, lodTier]);

    // Signage canvas texture (created only for Ring 0 & Ring 1; disposed cleanly on unmount)
    const signTexture = useMemo(() => {
      if (lodTier === 2) return null;
      return createBoothSignTexture(booth.boothName, booth.companyName, booth.zoneCode, booth.color);
    }, [booth.boothName, booth.companyName, booth.zoneCode, booth.color, lodTier]);

    useEffect(() => {
      return () => {
        signTexture?.dispose();
      };
    }, [signTexture]);

    if (lodTier === 2) return null;

    const signY = booth.archetypeId === 'wave_pavilion' ? 4.4 : 3.55;

    return (
      <group
        position={[booth.positionX, 0, booth.positionZ]}
        rotation={[0, booth.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onFocusBooth(booth);
        }}
      >
        {/* Authentic V27.4 GLB Archetype (shared geometries & materials) */}
        {modelGroup && <primitive object={modelGroup} />}

        {/* Brand Signage Board */}
        {signTexture && (
          <group position={[0, signY, booth.footprintDepth / 2 - 0.15]}>
            <mesh geometry={SIGN_BACK_GEOM} material={SIGN_BACK_MAT} castShadow />
            <mesh position={[0, 0, 0.045]} geometry={SIGN_BOARD_GEOM}>
              <meshBasicMaterial map={signTexture} toneMapped={false} />
            </mesh>
          </group>
        )}

        {/* Focus Approach Indicator */}
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

        {/* 6 Product Display Slots (Mounted ONLY in Ring 0 Near!) */}
        {lodTier === 0 &&
          booth.slots.slice(0, 6).map((slot, idx) => (
            <ProductDisplaySlot
              key={slot.slotId}
              position={SLOT_LOCAL_POSITIONS[idx] || [0, 0, 0]}
              product={slot.product}
              slotId={slot.slotId}
              brandColor={booth.color}
              onSelect={(prod, sId) => onSelectProduct(booth, prod, sId)}
            />
          ))}
      </group>
    );
  }
);
