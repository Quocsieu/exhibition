import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type V28NpcAnimState = 'idle' | 'greet' | 'point' | 'talk' | 'listen' | 'farewell';

export interface DynamicBoothNpc3DProps {
  position: [number, number, number];
  companyName: string;
  brandColor: string;
  animState: V28NpcAnimState;
  onClickNpc: () => void;
}

function createChestBadgeTexture(companyName: string, brandColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = brandColor || '#0ea5e9';
  ctx.fillRect(0, 0, 256, 22);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const short = companyName.length > 16 ? `${companyName.slice(0, 15)}…` : companyName;
  ctx.fillText(short, 128, 60);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * V28 Booth AI Consultant NPC (Mounted ONLY in Ring 0 Near booths).
 * Features left-chest Company Name Badge and procedural fallback animations
 * (idle, greet, point, talk, listen, farewell) without modifying V27.5 GLBs.
 */
export const DynamicBoothNpc3D: React.FC<DynamicBoothNpc3DProps> = React.memo(
  ({ position, companyName, brandColor, animState, onClickNpc }) => {
    const rootRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Mesh>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);

    const badgeTex = useMemo(
      () => createChestBadgeTexture(companyName, brandColor),
      [companyName, brandColor]
    );
    useEffect(() => () => badgeTex.dispose(), [badgeTex]);

    useFrame(({ clock }) => {
      const t = clock.getElapsedTime();
      if (rootRef.current) {
        // Gentle breathing sway
        rootRef.current.position.y = position[1] + Math.sin(t * 2.2) * 0.015;
      }
      if (headRef.current) {
        if (animState === 'talk') {
          headRef.current.rotation.x = Math.sin(t * 7.0) * 0.08;
          headRef.current.rotation.y = Math.sin(t * 2.4) * 0.12;
        } else if (animState === 'listen') {
          headRef.current.rotation.x = 0.09 + Math.sin(t * 3.0) * 0.04;
          headRef.current.rotation.y = 0;
        } else {
          headRef.current.rotation.x = 0;
          headRef.current.rotation.y = Math.sin(t * 0.9) * 0.14;
        }
      }
      if (rightArmRef.current) {
        if (animState === 'greet' || animState === 'farewell') {
          rightArmRef.current.rotation.z = -2.2 + Math.sin(t * 8.0) * 0.25;
        } else if (animState === 'point') {
          rightArmRef.current.rotation.x = -1.1;
          rightArmRef.current.rotation.z = -0.35;
        } else if (animState === 'talk') {
          rightArmRef.current.rotation.x = -0.45 + Math.sin(t * 5.0) * 0.18;
          rightArmRef.current.rotation.z = -0.15;
        } else {
          rightArmRef.current.rotation.x = 0;
          rightArmRef.current.rotation.z = -0.1;
        }
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = animState === 'talk' ? -0.25 + Math.cos(t * 4.5) * 0.1 : 0;
      }
    });

    return (
      <group
        ref={rootRef}
        position={position}
        onClick={(e) => {
          e.stopPropagation();
          onClickNpc();
        }}
      >
        {/* Standing Floor Ring */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.42, 20]} />
          <meshBasicMaterial color={brandColor || '#0ea5e9'} transparent opacity={0.75} />
        </mesh>

        {/* Legs */}
        <mesh position={[-0.1, 0.42, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.56, 4, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        <mesh position={[0.1, 0.42, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.56, 4, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>

        {/* Torso / Business Blazer */}
        <mesh position={[0, 1.08, 0]} castShadow>
          <capsuleGeometry args={[0.21, 0.48, 6, 12]} />
          <meshStandardMaterial color={brandColor || '#0284c7'} roughness={0.45} />
        </mesh>

        {/* Left-Chest Company Name Badge */}
        <mesh position={[0.09, 1.19, 0.215]}>
          <planeGeometry args={[0.16, 0.06]} />
          <meshBasicMaterial map={badgeTex} toneMapped={false} />
        </mesh>

        {/* Head */}
        <mesh ref={headRef} position={[0, 1.56, 0]} castShadow>
          <sphereGeometry args={[0.16, 14, 14]} />
          <meshStandardMaterial color="#fde68a" roughness={0.5} />
        </mesh>

        {/* Right & Left Arms (animated for greet / point / talk / farewell) */}
        <group ref={rightArmRef} position={[-0.25, 1.28, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.36, 4, 8]} />
            <meshStandardMaterial color={brandColor || '#0284c7'} roughness={0.45} />
          </mesh>
        </group>
        <group ref={leftArmRef} position={[0.25, 1.28, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.36, 4, 8]} />
            <meshStandardMaterial color={brandColor || '#0284c7'} roughness={0.45} />
          </mesh>
        </group>
      </group>
    );
  }
);
