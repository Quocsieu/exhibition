import React, { useEffect, useMemo, useState } from 'react';
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
import type { V28NpcAnimState } from './DynamicBoothNpc3D';

// Shared lightweight geometries & materials for V27.5-parity architectural product stands (reused across all booths)
const SLOT_STAND_BASE_GEOM = new THREE.BoxGeometry(1.08, 0.036, 0.36);
const SLOT_STAND_LED_TRIM_GEOM = new THREE.BoxGeometry(1.11, 0.012, 0.38);
const SLOT_STAND_STRUT_GEOM = new THREE.BoxGeometry(0.26, 0.48, 0.05);
const SLOT_CARD_FRAME_GEOM = new THREE.BoxGeometry(1.14, 1.38, 0.046);
const SLOT_CARD_BEZEL_GEOM = new THREE.BoxGeometry(1.18, 1.42, 0.03);
const SLOT_CARD_PLANE_GEOM = new THREE.PlaneGeometry(1.1, 1.33);
const SIGN_BOARD_GEOM = new THREE.PlaneGeometry(3.8, 0.72);
const SIGN_BACK_GEOM = new THREE.BoxGeometry(3.92, 0.82, 0.08);
const FOCUS_RING_GEOM = new THREE.RingGeometry(0.55, 0.72, 24);

const STAND_BASE_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.38, metalness: 0.28 });
const STAND_STRUT_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.35 });
const SIGN_BACK_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4, metalness: 0.35 });
const HOVER_GOLD_MAT = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.25, metalness: 0.65 });
const HOVER_TRIM_MAT = new THREE.MeshBasicMaterial({ color: '#fbbf24' });

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

interface ProductDisplaySlotProps {
  spec: V28ArchetypeSlotSpec;
  product: V28Product | null;
  slotId: string;
  brandColor: string;
  onSelect: (product: V28Product, slotId: string) => void;
}

const ProductDisplaySlot: React.FC<ProductDisplaySlotProps> = React.memo(
  ({ spec, product, slotId, brandColor, onSelect }) => {
    const [hovered, setHovered] = useState(false);

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

    // Empty slots render nothing so physical GLB counters/podiums/shelves stay clean (V27.5 parity)
    if (!product) return null;

    const s = hovered ? spec.scale * 1.04 : spec.scale;

    return (
      <group
        position={[spec.position[0], spec.position[1], spec.position[2]]}
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
          {/* Weighted Architectural Display Base resting flush on counter / podium / shelf */}
          <mesh position={[0, 0.018, 0]} geometry={SLOT_STAND_BASE_GEOM} material={STAND_BASE_MAT} castShadow />
          <mesh
            position={[0, 0.04, 0]}
            geometry={SLOT_STAND_LED_TRIM_GEOM}
            material={hovered ? HOVER_TRIM_MAT : accentMat}
          />
          {/* Rear Angled Structural Easel Strut */}
          <mesh
            position={[0, 0.24, -0.10]}
            rotation={[0.26, 0, 0]}
            geometry={SLOT_STAND_STRUT_GEOM}
            material={STAND_STRUT_MAT}
          />
          {/* Beveled 3D Architectural Display Frame facing visitor (+Z) */}
          <group position={[0, 0.73, 0.02]} rotation={[-0.08, 0, 0]}>
            <mesh
              position={[0, 0, -0.006]}
              geometry={SLOT_CARD_BEZEL_GEOM}
              material={hovered ? HOVER_TRIM_MAT : accentMat}
            />
            <mesh
              geometry={SLOT_CARD_FRAME_GEOM}
              material={hovered ? HOVER_GOLD_MAT : STAND_BASE_MAT}
              castShadow
            />
            {cardTexture && (
              <mesh position={[0, 0, 0.026]} geometry={SLOT_CARD_PLANE_GEOM}>
                <meshBasicMaterial map={cardTexture} toneMapped={false} />
              </mesh>
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
    const signTexture = useMemo(() => {
      if (lodTier === 2) return null;
      return createBoothSignTexture(booth.boothName, booth.companyName, booth.zoneCode, booth.color);
    }, [booth.boothName, booth.companyName, booth.zoneCode, booth.color, lodTier]);

    useEffect(() => {
      return () => {
        signTexture?.dispose();
      };
    }, [signTexture]);

    const instanceScale = getV28BoothInstanceScale(booth);
    const signY = (booth.archetypeId === 'wave_pavilion' ? 3.85 : 3.45) * instanceScale;

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

        {/* Brand Signage Board (Ring 0 & Ring 1) */}
        {signTexture && (
          <group
            position={[0, signY, booth.footprintDepth / 2 + 0.08]}
            scale={[instanceScale, instanceScale, instanceScale]}
          >
            <mesh geometry={SIGN_BACK_GEOM} material={SIGN_BACK_MAT} castShadow />
            <mesh position={[0, 0, 0.045]} geometry={SIGN_BOARD_GEOM}>
              <meshBasicMaterial map={signTexture} toneMapped={false} />
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
              return (
                <ProductDisplaySlot
                  key={slot.slotId}
                  spec={spec}
                  product={slot.product}
                  slotId={slot.slotId}
                  brandColor={booth.color}
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
