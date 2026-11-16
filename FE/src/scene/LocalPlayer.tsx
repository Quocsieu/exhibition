import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { PlayerTransform } from '../controls/useClickToMove';
import { createAvatarNametagTexture } from './sceneTextures';

export interface AvatarProps {
  name: string;
  color: string;
  position?: [number, number, number];
  rotationY?: number;
  state?: 'idle' | 'walk';
  liveTransform?: () => {
    x: number;
    z: number;
    rotationY: number;
    state: 'idle' | 'walk';
  } | undefined;
  isSelf?: boolean;
  activeBoothName?: string | null;
}

// ============================================================================
// Shared Module-Level Geometries across all local & remote players (PERF-04)
// Modern Stylized 3D Character Proportions & Sculpted Silhouettes
// ============================================================================
const CONTACT_SHADOW_GEOM = new THREE.CircleGeometry(0.42, 24);
const SELF_RING_GEOM = new THREE.RingGeometry(0.5, 0.64, 32);
const SELF_ARROW_GEOM = new THREE.CircleGeometry(0.14, 3);

// Legs & Stylized Sneakers
const THIGH_GEOM = new THREE.CapsuleGeometry(0.088, 0.16, 8, 14);
const CALF_GEOM = new THREE.CapsuleGeometry(0.074, 0.16, 8, 14);
const ANKLE_CUFF_GEOM = new THREE.TorusGeometry(0.074, 0.016, 8, 16);
const SHOE_COLLAR_GEOM = new THREE.CylinderGeometry(0.068, 0.076, 0.05, 14);
const SHOE_UPPER_GEOM = new THREE.CapsuleGeometry(0.078, 0.12, 8, 14);
const SHOE_STRIPE_GEOM = new THREE.BoxGeometry(0.164, 0.032, 0.11);
const SHOE_SOLE_GEOM = new THREE.BoxGeometry(0.168, 0.044, 0.265);

// Pelvis, Belt & Tailored Smart-Casual Jacket Torso
const PELVIS_GEOM = new THREE.CylinderGeometry(0.205, 0.19, 0.14, 20);
const BELT_GEOM = new THREE.CylinderGeometry(0.21, 0.21, 0.042, 20);
const BUCKLE_GEOM = new THREE.BoxGeometry(0.065, 0.048, 0.024);
const INNER_TEE_GEOM = new THREE.CylinderGeometry(0.195, 0.185, 0.48, 20);
const TORSO_BODY_GEOM = new THREE.CylinderGeometry(0.232, 0.205, 0.48, 24);
const SHOULDER_YOKE_GEOM = new THREE.CapsuleGeometry(0.122, 0.3, 10, 18);
const LAPEL_PANEL_GEOM = new THREE.CapsuleGeometry(0.036, 0.42, 6, 12);
const COLLAR_GEOM = new THREE.TorusGeometry(0.125, 0.036, 10, 22, Math.PI * 1.4);
const HEM_GEOM = new THREE.TorusGeometry(0.202, 0.024, 8, 22);

// Expo VIP Lanyard, ID Badge & Compact Designer Daypack
const LANYARD_STRAP_GEOM = new THREE.BoxGeometry(0.018, 0.23, 0.012);
const BADGE_HOLDER_GEOM = new THREE.BoxGeometry(0.11, 0.145, 0.018);
const BADGE_PASS_GEOM = new THREE.BoxGeometry(0.092, 0.115, 0.012);
const DAYPACK_BODY_GEOM = new THREE.CapsuleGeometry(0.122, 0.135, 10, 16);
const DAYPACK_POCKET_GEOM = new THREE.BoxGeometry(0.19, 0.115, 0.048);
const DAYPACK_TAB_GEOM = new THREE.BoxGeometry(0.075, 0.024, 0.028);

// Arms, Sleeves & Hands
const UPPER_ARM_GEOM = new THREE.CapsuleGeometry(0.072, 0.16, 8, 14);
const SLEEVE_CUFF_GEOM = new THREE.TorusGeometry(0.068, 0.015, 8, 14);
const FOREARM_GEOM = new THREE.CapsuleGeometry(0.058, 0.13, 8, 12);
const HAND_GEOM = new THREE.SphereGeometry(0.062, 12, 12);

// Neck, Sculpted Head, Facial Features & Volumetric Layered Hair
const NECK_GEOM = new THREE.CylinderGeometry(0.076, 0.088, 0.13, 14);
const HEAD_GEOM = new THREE.SphereGeometry(0.235, 24, 20);
const EAR_GEOM = new THREE.SphereGeometry(0.046, 10, 10);
const EYE_GEOM = new THREE.SphereGeometry(0.027, 12, 12);
const EYE_SHINE_GEOM = new THREE.SphereGeometry(0.009, 8, 8);
const BROW_GEOM = new THREE.CapsuleGeometry(0.011, 0.044, 4, 8);
const NOSE_GEOM = new THREE.SphereGeometry(0.022, 10, 10);
const SMILE_GEOM = new THREE.TorusGeometry(0.038, 0.008, 8, 16, Math.PI);
const BLUSH_GEOM = new THREE.CircleGeometry(0.028, 12);

const HAIR_CROWN_GEOM = new THREE.SphereGeometry(
  0.246,
  22,
  18,
  0,
  Math.PI * 2,
  0,
  Math.PI * 0.54
);
const HAIR_BACK_GEOM = new THREE.CapsuleGeometry(0.152, 0.14, 10, 16);
const HAIR_TOP_GEOM = new THREE.CapsuleGeometry(0.092, 0.16, 8, 14);
const HAIR_FRINGE_GEOM = new THREE.CapsuleGeometry(0.066, 0.2, 8, 14);
const HAIR_SIDE_GEOM = new THREE.CapsuleGeometry(0.05, 0.11, 6, 10);

const NAMETAG_PLANE_GEOM = new THREE.PlaneGeometry(2.5, 0.62);

// ============================================================================
// Shared Module-Level Materials across all players
// ============================================================================
const CONTACT_SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: '#0f172a',
  transparent: true,
  opacity: 0.36,
});
const SELF_RING_MAT = new THREE.MeshBasicMaterial({
  color: '#38bdf8',
  transparent: true,
  opacity: 0.9,
});
const CYAN_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const WHITE_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff' });

const SKIN_MAT = new THREE.MeshStandardMaterial({
  color: '#f5cbb0',
  roughness: 0.52,
  metalness: 0.02,
});
const HAIR_MAT = new THREE.MeshStandardMaterial({
  color: '#2b1d16',
  roughness: 0.56,
  metalness: 0.06,
});
const EYE_DARK_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  roughness: 0.2,
  metalness: 0.1,
});
const SMILE_MAT = new THREE.MeshStandardMaterial({
  color: '#b45309',
  roughness: 0.5,
});
const BLUSH_MAT = new THREE.MeshBasicMaterial({
  color: '#f472b6',
  transparent: true,
  opacity: 0.28,
});

const TROUSER_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.64,
  metalness: 0.05,
});
const BELT_LEATHER_MAT = new THREE.MeshStandardMaterial({
  color: '#5c3a21',
  roughness: 0.48,
  metalness: 0.12,
});
const BUCKLE_METAL_MAT = new THREE.MeshStandardMaterial({
  color: '#e2e8f0',
  roughness: 0.25,
  metalness: 0.82,
});
const WHITE_SHIRT_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.46,
  metalness: 0.02,
});
const DAYPACK_MAT = new THREE.MeshStandardMaterial({
  color: '#334155',
  roughness: 0.54,
  metalness: 0.12,
});
const SHOE_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.38,
  metalness: 0.05,
});
const SOLE_MAT = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  roughness: 0.55,
  metalness: 0.04,
});

export const AvatarCharacter: React.FC<AvatarProps> = React.memo(
  ({
    name,
    color,
    position = [0, 0, 17.5],
    rotationY = Math.PI,
    state = 'idle',
    liveTransform,
    isSelf = false,
    activeBoothName,
  }) => {
    const groupRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const leftLegPivotRef = useRef<THREE.Group>(null);
    const rightLegPivotRef = useRef<THREE.Group>(null);
    const leftArmPivotRef = useRef<THREE.Group>(null);
    const rightArmPivotRef = useRef<THREE.Group>(null);
    const contactShadowRef = useRef<THREE.Mesh>(null);

    const initialLive = liveTransform?.();
    const startX = initialLive ? initialLive.x : position[0];
    const startZ = initialLive ? initialLive.z : position[2];
    const targetPos = useRef(new THREE.Vector3(startX, 0, startZ));

    const outfitMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.44,
          metalness: 0.08,
        }),
      [color]
    );

    useEffect(() => {
      return () => {
        outfitMat.dispose();
      };
    }, [outfitMat]);

    const nametagTexture = useMemo(
      () =>
        createAvatarNametagTexture({
          name,
          color,
          isSelf,
          activeBoothName,
        }),
      [name, color, isSelf, activeBoothName]
    );

    useEffect(() => {
      return () => {
        nametagTexture.dispose();
      };
    }, [nametagTexture]);

    useFrame(({ clock }, delta) => {
      if (!groupRef.current) return;

      const live = liveTransform?.();
      const nextX = live ? live.x : position[0];
      const nextZ = live ? live.z : position[2];
      const nextRotY = live ? live.rotationY : rotationY;
      const nextState = live ? live.state : state;

      targetPos.current.set(nextX, 0, nextZ);

      if (isSelf) {
        groupRef.current.position.copy(targetPos.current);
      } else {
        const distSq = groupRef.current.position.distanceToSquared(targetPos.current);
        if (distSq > 36) {
          groupRef.current.position.copy(targetPos.current);
        } else {
          groupRef.current.position.lerp(targetPos.current, Math.min(1, delta * 14));
        }
      }

      const currentRot = groupRef.current.rotation.y;
      let diff = nextRotY - currentRot;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * Math.min(1, delta * 16);

      const t = clock.getElapsedTime();
      if (nextState === 'walk') {
        const cycle = t * 11.2;
        const swing = Math.sin(cycle) * 0.58;
        const bounce = Math.abs(Math.sin(cycle)) * 0.068;

        if (bodyRef.current) {
          bodyRef.current.position.y = bounce;
          bodyRef.current.rotation.x = THREE.MathUtils.lerp(
            bodyRef.current.rotation.x,
            0.065,
            0.2
          );
          bodyRef.current.rotation.y = Math.sin(cycle) * 0.045;
        }
        if (leftLegPivotRef.current) leftLegPivotRef.current.rotation.x = swing;
        if (rightLegPivotRef.current) rightLegPivotRef.current.rotation.x = -swing;
        if (leftArmPivotRef.current) leftArmPivotRef.current.rotation.x = -swing * 0.76;
        if (rightArmPivotRef.current) rightArmPivotRef.current.rotation.x = swing * 0.76;
        if (headRef.current) {
          headRef.current.rotation.y = -Math.sin(cycle) * 0.04;
        }
        if (contactShadowRef.current) {
          const shadowScale = 1 - bounce * 1.3;
          contactShadowRef.current.scale.set(shadowScale, shadowScale, 1);
        }
      } else {
        const breath = Math.sin(t * 2.4) * 0.02;
        if (bodyRef.current) {
          bodyRef.current.position.y = breath;
          bodyRef.current.rotation.x = THREE.MathUtils.lerp(
            bodyRef.current.rotation.x,
            0,
            0.18
          );
          bodyRef.current.rotation.y = THREE.MathUtils.lerp(
            bodyRef.current.rotation.y,
            0,
            0.18
          );
        }
        if (leftLegPivotRef.current) {
          leftLegPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            leftLegPivotRef.current.rotation.x,
            0,
            0.2
          );
        }
        if (rightLegPivotRef.current) {
          rightLegPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            rightLegPivotRef.current.rotation.x,
            0,
            0.2
          );
        }
        if (leftArmPivotRef.current) {
          leftArmPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            leftArmPivotRef.current.rotation.x,
            Math.sin(t * 1.8) * 0.035,
            0.18
          );
        }
        if (rightArmPivotRef.current) {
          rightArmPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmPivotRef.current.rotation.x,
            -Math.sin(t * 1.8) * 0.035,
            0.18
          );
        }
        if (headRef.current) {
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            Math.sin(t * 1.1) * 0.1,
            0.12
          );
        }
        if (contactShadowRef.current) {
          contactShadowRef.current.scale.set(1, 1, 1);
        }
      }
    });

    return (
      <group
        ref={groupRef}
        name={isSelf ? 'local-player-avatar' : 'remote-player-avatar'}
        position={[startX, 0, startZ]}
      >
        {/* Ground Contact Shadow Disc */}
        <mesh
          ref={contactShadowRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.022, 0]}
          geometry={CONTACT_SHADOW_GEOM}
          material={CONTACT_SHADOW_MAT}
        />

        {/* Self Player Selection Ring & Facing Direction Indicator */}
        {isSelf && (
          <group position={[0, 0.028, 0]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={SELF_RING_GEOM}
              material={SELF_RING_MAT}
            />
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.004, 0.72]}
              geometry={SELF_ARROW_GEOM}
              material={CYAN_BASIC_MAT}
            />
          </group>
        )}

        {/* Articulated Modern Stylized 3D Character Hierarchy */}
        <group ref={bodyRef}>
          {/* Left Leg Pivot */}
          <group ref={leftLegPivotRef} position={[-0.125, 0.62, 0]}>
            <mesh position={[0, -0.14, 0]} geometry={THIGH_GEOM} material={TROUSER_MAT} />
            <mesh position={[0, -0.34, 0]} geometry={CALF_GEOM} material={TROUSER_MAT} />
            <mesh
              position={[0, -0.44, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={ANKLE_CUFF_GEOM}
              material={TROUSER_MAT}
            />
            <mesh position={[0, -0.475, 0.005]} geometry={SHOE_COLLAR_GEOM} material={outfitMat} />
            <mesh
              position={[0, -0.515, 0.035]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={SHOE_UPPER_GEOM}
              material={SHOE_MAT}
            />
            <mesh position={[0, -0.52, 0.03]} geometry={SHOE_STRIPE_GEOM} material={outfitMat} />
            <mesh position={[0, -0.575, 0.035]} geometry={SHOE_SOLE_GEOM} material={SOLE_MAT} />
          </group>

          {/* Right Leg Pivot */}
          <group ref={rightLegPivotRef} position={[0.125, 0.62, 0]}>
            <mesh position={[0, -0.14, 0]} geometry={THIGH_GEOM} material={TROUSER_MAT} />
            <mesh position={[0, -0.34, 0]} geometry={CALF_GEOM} material={TROUSER_MAT} />
            <mesh
              position={[0, -0.44, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={ANKLE_CUFF_GEOM}
              material={TROUSER_MAT}
            />
            <mesh position={[0, -0.475, 0.005]} geometry={SHOE_COLLAR_GEOM} material={outfitMat} />
            <mesh
              position={[0, -0.515, 0.035]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={SHOE_UPPER_GEOM}
              material={SHOE_MAT}
            />
            <mesh position={[0, -0.52, 0.03]} geometry={SHOE_STRIPE_GEOM} material={outfitMat} />
            <mesh position={[0, -0.575, 0.035]} geometry={SHOE_SOLE_GEOM} material={SOLE_MAT} />
          </group>

          {/* Pelvis & Tailored Leather Belt */}
          <mesh
            position={[0, 0.62, 0]}
            scale={[1.05, 1, 0.76]}
            geometry={PELVIS_GEOM}
            material={TROUSER_MAT}
          />
          <mesh
            position={[0, 0.685, 0]}
            scale={[1.05, 1, 0.76]}
            geometry={BELT_GEOM}
            material={BELT_LEATHER_MAT}
          />
          <mesh position={[0, 0.685, 0.162]} geometry={BUCKLE_GEOM} material={BUCKLE_METAL_MAT} />

          {/* Smart-Casual Exhibition Jacket & Inner Knit Tee (Primary Shadow Caster 1/2) */}
          <mesh
            position={[0, 0.935, 0.026]}
            scale={[0.62, 1.005, 0.82]}
            geometry={INNER_TEE_GEOM}
            material={WHITE_SHIRT_MAT}
          />
          <mesh
            position={[0, 0.93, -0.008]}
            scale={[1.08, 1, 0.78]}
            castShadow
            geometry={TORSO_BODY_GEOM}
            material={outfitMat}
          />
          <mesh
            position={[0, 1.11, -0.005]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[1, 1, 0.88]}
            castShadow
            geometry={SHOULDER_YOKE_GEOM}
            material={outfitMat}
          />
          <mesh
            position={[-0.105, 0.93, 0.148]}
            geometry={LAPEL_PANEL_GEOM}
            material={outfitMat}
          />
          <mesh
            position={[0.105, 0.93, 0.148]}
            geometry={LAPEL_PANEL_GEOM}
            material={outfitMat}
          />
          <mesh
            position={[0, 1.185, -0.005]}
            rotation={[Math.PI / 2 + 0.18, 0, Math.PI * 0.8]}
            geometry={COLLAR_GEOM}
            material={outfitMat}
          />
          <mesh
            position={[0, 0.7, -0.008]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[1.08, 0.78, 1]}
            geometry={HEM_GEOM}
            material={outfitMat}
          />

          {/* Expo VIP Lanyard & Badge on Front Chest */}
          <mesh
            position={[-0.034, 1.06, 0.156]}
            rotation={[0, 0, -0.24]}
            geometry={LANYARD_STRAP_GEOM}
            material={TROUSER_MAT}
          />
          <mesh
            position={[0.034, 1.06, 0.156]}
            rotation={[0, 0, 0.24]}
            geometry={LANYARD_STRAP_GEOM}
            material={TROUSER_MAT}
          />
          <mesh
            position={[0, 0.91, 0.165]}
            geometry={BADGE_HOLDER_GEOM}
            material={BUCKLE_METAL_MAT}
          />
          <mesh position={[0, 0.905, 0.174]} geometry={BADGE_PASS_GEOM} material={CYAN_BASIC_MAT} />

          {/* Compact Rounded Designer Daypack */}
          <mesh
            position={[0, 0.93, -0.195]}
            scale={[1.05, 1, 0.62]}
            geometry={DAYPACK_BODY_GEOM}
            material={DAYPACK_MAT}
          />
          <mesh
            position={[0, 0.85, -0.245]}
            geometry={DAYPACK_POCKET_GEOM}
            material={BELT_LEATHER_MAT}
          />
          <mesh position={[0, 0.98, -0.258]} geometry={DAYPACK_TAB_GEOM} material={CYAN_BASIC_MAT} />

          {/* Left Arm Pivot */}
          <group ref={leftArmPivotRef} position={[-0.295, 1.11, 0]} rotation={[0, 0, 0.06]}>
            <mesh position={[0, -0.11, 0]} geometry={UPPER_ARM_GEOM} material={outfitMat} />
            <mesh
              position={[0, -0.21, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={SLEEVE_CUFF_GEOM}
              material={WHITE_SHIRT_MAT}
            />
            <mesh position={[0, -0.29, 0.01]} geometry={FOREARM_GEOM} material={SKIN_MAT} />
            <mesh
              position={[0, -0.39, 0.015]}
              scale={[0.85, 1.08, 0.95]}
              geometry={HAND_GEOM}
              material={SKIN_MAT}
            />
          </group>

          {/* Right Arm Pivot */}
          <group ref={rightArmPivotRef} position={[0.295, 1.11, 0]} rotation={[0, 0, -0.06]}>
            <mesh position={[0, -0.11, 0]} geometry={UPPER_ARM_GEOM} material={outfitMat} />
            <mesh
              position={[0, -0.21, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={SLEEVE_CUFF_GEOM}
              material={WHITE_SHIRT_MAT}
            />
            <mesh position={[0, -0.29, 0.01]} geometry={FOREARM_GEOM} material={SKIN_MAT} />
            <mesh
              position={[0, -0.39, 0.015]}
              scale={[0.85, 1.08, 0.95]}
              geometry={HAND_GEOM}
              material={SKIN_MAT}
            />
          </group>

          {/* Neck */}
          <mesh position={[0, 1.24, 0]} geometry={NECK_GEOM} material={SKIN_MAT} />

          {/* Sculpted Head, Friendly Face & Layered Stylized Hair (Primary Shadow Caster 2/2) */}
          <group ref={headRef} position={[0, 1.48, 0]}>
            <mesh
              castShadow
              scale={[0.96, 1.04, 0.96]}
              geometry={HEAD_GEOM}
              material={SKIN_MAT}
            />
            {/* Ears */}
            <mesh
              position={[-0.222, -0.01, -0.01]}
              scale={[0.55, 1.15, 0.8]}
              geometry={EAR_GEOM}
              material={SKIN_MAT}
            />
            <mesh
              position={[0.222, -0.01, -0.01]}
              scale={[0.55, 1.15, 0.8]}
              geometry={EAR_GEOM}
              material={SKIN_MAT}
            />

            {/* Expressive Friendly Eyes & Catchlights */}
            <mesh
              position={[-0.078, 0.018, 0.218]}
              scale={[0.9, 1.15, 0.6]}
              geometry={EYE_GEOM}
              material={EYE_DARK_MAT}
            />
            <mesh
              position={[0.078, 0.018, 0.218]}
              scale={[0.9, 1.15, 0.6]}
              geometry={EYE_GEOM}
              material={EYE_DARK_MAT}
            />
            <mesh
              position={[-0.071, 0.028, 0.232]}
              geometry={EYE_SHINE_GEOM}
              material={WHITE_BASIC_MAT}
            />
            <mesh
              position={[0.085, 0.028, 0.232]}
              geometry={EYE_SHINE_GEOM}
              material={WHITE_BASIC_MAT}
            />

            {/* Soft Eyebrows */}
            <mesh
              position={[-0.078, 0.068, 0.216]}
              rotation={[0, -0.15, Math.PI / 2 - 0.08]}
              geometry={BROW_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[0.078, 0.068, 0.216]}
              rotation={[0, 0.15, Math.PI / 2 + 0.08]}
              geometry={BROW_GEOM}
              material={HAIR_MAT}
            />

            {/* Subtle Nose, Warm Smile & Cheek Blush */}
            <mesh
              position={[0, -0.014, 0.232]}
              scale={[0.85, 1, 1.15]}
              geometry={NOSE_GEOM}
              material={SKIN_MAT}
            />
            <mesh
              position={[0, -0.052, 0.224]}
              rotation={[Math.PI + 0.08, 0, 0]}
              geometry={SMILE_GEOM}
              material={SMILE_MAT}
            />
            <mesh
              position={[-0.128, -0.024, 0.204]}
              rotation={[0, -0.42, 0]}
              geometry={BLUSH_GEOM}
              material={BLUSH_MAT}
            />
            <mesh
              position={[0.128, -0.024, 0.204]}
              rotation={[0, 0.42, 0]}
              geometry={BLUSH_GEOM}
              material={BLUSH_MAT}
            />

            {/* Volumetric Layered Stylized Hair */}
            <mesh
              position={[0, 0.046, -0.024]}
              rotation={[-0.42, 0, 0]}
              castShadow
              geometry={HAIR_CROWN_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[0, -0.02, -0.105]}
              rotation={[0.22, 0, Math.PI / 2]}
              geometry={HAIR_BACK_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[0.01, 0.195, 0.03]}
              rotation={[0.18, 0.2, 1.42]}
              geometry={HAIR_TOP_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[0.02, 0.172, 0.165]}
              rotation={[0.32, 0.18, 1.38]}
              geometry={HAIR_FRINGE_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[-0.198, 0.025, 0.025]}
              rotation={[0.12, 0, 0.12]}
              geometry={HAIR_SIDE_GEOM}
              material={HAIR_MAT}
            />
            <mesh
              position={[0.198, 0.025, 0.025]}
              rotation={[0.12, 0, -0.12]}
              geometry={HAIR_SIDE_GEOM}
              material={HAIR_MAT}
            />
          </group>
        </group>

        {/* 3D Floating Billboard Nametag */}
        <Billboard position={[0, 2.24, 0]}>
          <mesh geometry={NAMETAG_PLANE_GEOM}>
            <meshBasicMaterial map={nametagTexture} transparent depthWrite={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);

export interface LocalPlayerProps {
  name: string;
  color: string;
  x?: number;
  z?: number;
  rotationY?: number;
  state?: 'idle' | 'walk';
  transformRef?: React.MutableRefObject<PlayerTransform>;
  activeBoothName?: string | null;
}

export const LocalPlayer: React.FC<LocalPlayerProps> = React.memo(
  ({ name, color, x = 0, z = 17.5, rotationY = Math.PI, state = 'idle', transformRef, activeBoothName }) => {
    const readTransform = React.useCallback(
      () => transformRef?.current,
      [transformRef]
    );

    return (
      <AvatarCharacter
        name={name}
        color={color}
        position={[x, 0, z]}
        rotationY={rotationY}
        state={state}
        liveTransform={transformRef ? readTransform : undefined}
        isSelf
        activeBoothName={activeBoothName}
      />
    );
  }
);
