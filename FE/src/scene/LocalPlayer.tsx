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

// Shared module-level Geometries across all local & remote players (PERF-04)
const CONTACT_SHADOW_GEOM = new THREE.CircleGeometry(0.42, 20);
const SELF_RING_GEOM = new THREE.RingGeometry(0.5, 0.64, 28);
const SELF_ARROW_GEOM = new THREE.CircleGeometry(0.14, 3);

const LEG_GEOM = new THREE.CapsuleGeometry(0.095, 0.3, 5, 8);
const SHOE_GEOM = new THREE.BoxGeometry(0.19, 0.14, 0.28);
const PELVIS_GEOM = new THREE.CylinderGeometry(0.23, 0.22, 0.12, 12);
const TORSO_GEOM = new THREE.BoxGeometry(0.5, 0.56, 0.32);
const SHIRT_GEOM = new THREE.BoxGeometry(0.18, 0.22, 0.02);
const BADGE_GEOM = new THREE.BoxGeometry(0.12, 0.15, 0.02);
const BACKPACK_GEOM = new THREE.BoxGeometry(0.34, 0.38, 0.18);
const ARM_GEOM = new THREE.CapsuleGeometry(0.078, 0.26, 5, 8);
const HAND_GEOM = new THREE.SphereGeometry(0.082, 8, 8);
const NECK_GEOM = new THREE.CylinderGeometry(0.09, 0.1, 0.12, 8);
const HEAD_GEOM = new THREE.SphereGeometry(0.25, 14, 14);
const HAIR_GEOM = new THREE.SphereGeometry(0.256, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
const VISOR_BRIM_GEOM = new THREE.BoxGeometry(0.32, 0.06, 0.18);
const GLASSES_GEOM = new THREE.BoxGeometry(0.32, 0.1, 0.1);
const GLASSES_LENS_GEOM = new THREE.PlaneGeometry(0.26, 0.045);
const NAMETAG_PLANE_GEOM = new THREE.PlaneGeometry(2.5, 0.62);

// Shared module-level Materials across all players
const CONTACT_SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: '#0f172a',
  transparent: true,
  opacity: 0.38,
});
const SELF_RING_MAT = new THREE.MeshBasicMaterial({
  color: '#38bdf8',
  transparent: true,
  opacity: 0.9,
});
const CYAN_BASIC_MAT = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
const TROUSER_MAT = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65 });
const SHOE_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
const DARK_BELT_MAT = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 });
const WHITE_SHIRT_MAT = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
const SKIN_MAT = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.45 });
const GLASSES_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  metalness: 0.8,
  roughness: 0.15,
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
          roughness: 0.38,
          metalness: 0.1,
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
        const cycle = t * 11.5;
        const swing = Math.sin(cycle) * 0.62;
        const bounce = Math.abs(Math.sin(cycle)) * 0.085;

        if (bodyRef.current) {
          bodyRef.current.position.y = bounce;
          bodyRef.current.rotation.x = THREE.MathUtils.lerp(
            bodyRef.current.rotation.x,
            0.08,
            0.2
          );
        }
        if (leftLegPivotRef.current) leftLegPivotRef.current.rotation.x = swing;
        if (rightLegPivotRef.current) rightLegPivotRef.current.rotation.x = -swing;
        if (leftArmPivotRef.current) leftArmPivotRef.current.rotation.x = -swing * 0.78;
        if (rightArmPivotRef.current) rightArmPivotRef.current.rotation.x = swing * 0.78;
        if (headRef.current) {
          headRef.current.rotation.y = Math.sin(cycle * 0.5) * 0.06;
        }
        if (contactShadowRef.current) {
          const shadowScale = 1 - bounce * 1.4;
          contactShadowRef.current.scale.set(shadowScale, shadowScale, 1);
        }
      } else {
        const breath = Math.sin(t * 2.6) * 0.025;
        if (bodyRef.current) {
          bodyRef.current.position.y = breath;
          bodyRef.current.rotation.x = THREE.MathUtils.lerp(
            bodyRef.current.rotation.x,
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
            Math.sin(t * 1.8) * 0.04,
            0.18
          );
        }
        if (rightArmPivotRef.current) {
          rightArmPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            rightArmPivotRef.current.rotation.x,
            -Math.sin(t * 1.8) * 0.04,
            0.18
          );
        }
        if (headRef.current) {
          headRef.current.rotation.y = THREE.MathUtils.lerp(
            headRef.current.rotation.y,
            Math.sin(t * 1.1) * 0.12,
            0.12
          );
        }
        if (contactShadowRef.current) {
          contactShadowRef.current.scale.set(1, 1, 1);
        }
      }
    });

    return (
      <group ref={groupRef} position={[startX, 0, startZ]}>
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

        {/* Articulated Humanoid Body Hierarchy */}
        <group ref={bodyRef}>
          {/* Left Leg Pivot */}
          <group ref={leftLegPivotRef} position={[-0.14, 0.6, 0]}>
            <mesh position={[0, -0.24, 0]} geometry={LEG_GEOM} material={TROUSER_MAT} />
            <mesh position={[0, -0.52, 0.04]} geometry={SHOE_GEOM} material={SHOE_MAT} />
          </group>

          {/* Right Leg Pivot */}
          <group ref={rightLegPivotRef} position={[0.14, 0.6, 0]}>
            <mesh position={[0, -0.24, 0]} geometry={LEG_GEOM} material={TROUSER_MAT} />
            <mesh position={[0, -0.52, 0.04]} geometry={SHOE_GEOM} material={SHOE_MAT} />
          </group>

          {/* Pelvis / Belt */}
          <mesh position={[0, 0.62, 0]} geometry={PELVIS_GEOM} material={DARK_BELT_MAT} />

          {/* Main Torso Jacket (Primary Shadow Caster 1/2) */}
          <mesh
            position={[0, 0.92, 0]}
            castShadow
            geometry={TORSO_GEOM}
            material={outfitMat}
          />

          {/* Inner White Shirt & Expo ID Badge */}
          <mesh position={[0, 1.06, 0.155]} geometry={SHIRT_GEOM} material={WHITE_SHIRT_MAT} />
          <mesh position={[0, 0.88, 0.165]} geometry={BADGE_GEOM} material={CYAN_BASIC_MAT} />

          {/* Stylized Backpack */}
          <mesh position={[0, 0.94, -0.21]} geometry={BACKPACK_GEOM} material={TROUSER_MAT} />

          {/* Left Arm Pivot */}
          <group ref={leftArmPivotRef} position={[-0.33, 1.12, 0]}>
            <mesh position={[0, -0.19, 0]} geometry={ARM_GEOM} material={outfitMat} />
            <mesh position={[0, -0.38, 0]} geometry={HAND_GEOM} material={SKIN_MAT} />
          </group>

          {/* Right Arm Pivot */}
          <group ref={rightArmPivotRef} position={[0.33, 1.12, 0]}>
            <mesh position={[0, -0.19, 0]} geometry={ARM_GEOM} material={outfitMat} />
            <mesh position={[0, -0.38, 0]} geometry={HAND_GEOM} material={SKIN_MAT} />
          </group>

          {/* Neck */}
          <mesh position={[0, 1.24, 0]} geometry={NECK_GEOM} material={SKIN_MAT} />

          {/* Head, Hair & AR Visor (Primary Shadow Caster 2/2) */}
          <group ref={headRef} position={[0, 1.48, 0]}>
            <mesh castShadow geometry={HEAD_GEOM} material={SKIN_MAT} />
            <mesh position={[0, 0.08, -0.02]} geometry={HAIR_GEOM} material={DARK_BELT_MAT} />
            <mesh
              position={[0, 0.14, 0.18]}
              rotation={[0.2, 0, 0]}
              geometry={VISOR_BRIM_GEOM}
              material={outfitMat}
            />
            <mesh position={[0, 0.02, 0.21]} geometry={GLASSES_GEOM} material={GLASSES_MAT} />
            <mesh
              position={[0, 0.02, 0.262]}
              geometry={GLASSES_LENS_GEOM}
              material={CYAN_BASIC_MAT}
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
