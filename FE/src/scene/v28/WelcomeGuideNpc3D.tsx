import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { V28ExhibitionVersionDetail } from '../../services/v28Api';
import type { V28OnboardingGuideSignal } from '../../services/v28OnboardingStateMachine';

export const WELCOME_GUIDE_GLB_URL = `${import.meta.env?.BASE_URL || '/'}models/npc/vietnamese_female_assistant.glb`;
export const WELCOME_GUIDE_MAX_VISIBLE_DIST_METERS = 38;
export const WELCOME_GUIDE_TARGET_HEIGHT = 1.72;

export type WelcomeGuideClipName = 'IDLE' | 'WAVE' | 'PRESENT' | 'TALKING';

export interface WelcomeGuidePlacement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

/**
 * Places the independent Welcome Guide Hostess on the right-hand side of the Welcome Plaza,
 * clearly visible in the initial spawn camera frustum while staying outside the central walking lane (x = 0).
 */
export function computeWelcomeGuidePlacement(
  world: Pick<V28ExhibitionVersionDetail, 'spawnPoint' | 'centralAvenueBounds'>
): WelcomeGuidePlacement {
  const spawnX = world.spawnPoint?.x ?? 0;
  const spawnZ = world.spawnPoint?.z ?? 137.93;
  const aveHalfWidth = world.centralAvenueBounds
    ? Math.max(4, (world.centralAvenueBounds.maxX - world.centralAvenueBounds.minX) / 2)
    : 7;
  const offsetX = Math.min(aveHalfWidth - 2.2, 3.6);
  return {
    x: Number((spawnX + offsetX).toFixed(2)),
    y: 0,
    z: Number((spawnZ - 4.8).toFixed(2)),
    rotationY: -0.58,
  };
}

/**
 * Maps Phase 2 onboarding state machine signal to the embedded animation clip
 * inside `vietnamese_female_assistant.glb` (`IDLE`, `WAVE`, `PRESENT`, `TALKING`).
 */
export function mapOnboardingSignalToClip(signal?: V28OnboardingGuideSignal | null): WelcomeGuideClipName {
  if (!signal || !signal.active) return 'IDLE';
  switch (signal.suggestedAnim) {
    case 'wave':
      return 'WAVE';
    case 'point_walk':
    case 'point_camera':
      return 'PRESENT';
    case 'point_map':
      return 'TALKING';
    case 'celebrate':
      return 'WAVE';
    default:
      return 'IDLE';
  }
}

export function shouldRenderWelcomeGuide(opts: {
  cameraMode: 'overview' | 'explore' | 'focus';
  playerX: number;
  playerZ: number;
  guideX: number;
  guideZ: number;
}): boolean {
  if (opts.cameraMode === 'focus') return false;
  const dist = Math.hypot(opts.playerX - opts.guideX, opts.playerZ - opts.guideZ);
  return dist <= WELCOME_GUIDE_MAX_VISIBLE_DIST_METERS;
}

let cachedGuideGltfPromise: Promise<GLTF> | null = null;

function loadWelcomeGuideGltf(): Promise<GLTF> {
  if (!cachedGuideGltfPromise) {
    const loader = new GLTFLoader();
    cachedGuideGltfPromise = loader.loadAsync(WELCOME_GUIDE_GLB_URL);
  }
  return cachedGuideGltfPromise;
}

function createGuideBadgeTexture(label: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 88;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 384, 88);

  // Pill backdrop
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.lineTo(384 - r, 8);
  ctx.quadraticCurveTo(376, 8, 376, 8 + r);
  ctx.lineTo(376, 80 - r);
  ctx.quadraticCurveTo(376, 80, 384 - r, 80);
  ctx.lineTo(r, 80);
  ctx.quadraticCurveTo(8, 80, 8, 80 - r);
  ctx.lineTo(8, 8 + r);
  ctx.quadraticCurveTo(8, 8, r, 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  // Status dot
  ctx.beginPath();
  ctx.arc(38, 44, 8, 0, Math.PI * 2);
  ctx.fillStyle = accentHex;
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 58, 45);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface WelcomeGuideNpc3DProps {
  world: V28ExhibitionVersionDetail;
  cameraMode: 'overview' | 'explore' | 'focus';
  playerX: number;
  playerZ: number;
  guideSignal?: V28OnboardingGuideSignal | null;
  shadowsEnabled?: boolean;
  onClickGuide?: () => void;
}

/**
 * Independent 3D Welcome Guide Character at Welcome Plaza (Phase 3).
 * Uses `vietnamese_female_assistant.glb` (distinct Vietnamese Áo Dài hostess model with embedded
 * IDLE/WAVE/PRESENT/TALKING animations) — completely decoupled from booth `SalesAssistantNpc` and
 * `useNpcConsultationSession`.
 */
export const WelcomeGuideNpc3D: React.FC<WelcomeGuideNpc3DProps> = React.memo(
  ({
    world,
    cameraMode,
    playerX,
    playerZ,
    guideSignal = null,
    shadowsEnabled = false,
    onClickGuide,
  }) => {
    const placement = useMemo(() => computeWelcomeGuidePlacement(world), [world]);
    const isVisible = shouldRenderWelcomeGuide({
      cameraMode,
      playerX,
      playerZ,
      guideX: placement.x,
      guideZ: placement.z,
    });

    const [modelGroup, setModelGroup] = useState<THREE.Group | null>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const actionsRef = useRef<Partial<Record<WelcomeGuideClipName, THREE.AnimationAction>>>({});
    const activeClipRef = useRef<WelcomeGuideClipName>('IDLE');
    const ringRef = useRef<THREE.Mesh>(null);
    const rootRef = useRef<THREE.Group>(null);

    const targetClip = mapOnboardingSignalToClip(guideSignal);
    const accentHex =
      guideSignal?.suggestedAnim === 'celebrate'
        ? '#10b981'
        : guideSignal?.active
          ? '#38bdf8'
          : '#34d399';
    const badgeLabel = 'Hướng dẫn viên';

    const badgeTex = useMemo(
      () => createGuideBadgeTexture(badgeLabel, accentHex),
      [badgeLabel, accentHex]
    );
    useEffect(() => () => badgeTex.dispose(), [badgeTex]);

    // Load & normalize GLB once
    useEffect(() => {
      let cancelled = false;
      loadWelcomeGuideGltf()
        .then((gltf) => {
          if (cancelled) return;
          const clone = gltf.scene.clone(true);
          clone.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = shadowsEnabled;
              mesh.receiveShadow = false;
            }
          });

          const box = new THREE.Box3().setFromObject(clone);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const scale = size.y > 0.01 ? WELCOME_GUIDE_TARGET_HEIGHT / size.y : 1;
          clone.scale.setScalar(scale);
          clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

          const wrapper = new THREE.Group();
          wrapper.add(clone);

          const mixer = new THREE.AnimationMixer(clone);
          const actions: Partial<Record<WelcomeGuideClipName, THREE.AnimationAction>> = {};
          for (const clip of gltf.animations || []) {
            const upper = clip.name.toUpperCase() as WelcomeGuideClipName;
            if (upper === 'IDLE' || upper === 'WAVE' || upper === 'PRESENT' || upper === 'TALKING') {
              actions[upper] = mixer.clipAction(clip);
            }
          }
          actions.IDLE?.play();
          mixerRef.current = mixer;
          actionsRef.current = actions;
          activeClipRef.current = 'IDLE';
          setModelGroup(wrapper);
        })
        .catch(() => {
          // Graceful fallback handled by procedural ring/avatar below
        });

      return () => {
        cancelled = true;
        mixerRef.current?.stopAllAction();
        mixerRef.current = null;
        actionsRef.current = {};
      };
    }, [shadowsEnabled]);

    // Cross-fade embedded animation clip when onboarding step changes
    useEffect(() => {
      const actions = actionsRef.current;
      const next = actions[targetClip] ?? actions.IDLE;
      const prev = actions[activeClipRef.current];
      if (!next || next === prev) return;
      next.reset().fadeIn(0.25).play();
      prev?.fadeOut(0.25);
      activeClipRef.current = targetClip;
    }, [targetClip, modelGroup]);

    // Single lightweight useFrame update (skipped when culled/invisible)
    useFrame(({ clock }, delta) => {
      if (!isVisible) return;
      mixerRef.current?.update(Math.min(delta, 0.05));
      const t = clock.getElapsedTime();
      if (ringRef.current) {
        const pulse = guideSignal?.active ? 1 + Math.sin(t * 3.2) * 0.08 : 1;
        ringRef.current.scale.set(pulse, pulse, 1);
      }
      if (rootRef.current) {
        const yawOffset =
          guideSignal?.suggestedAnim === 'point_camera'
            ? Math.sin(t * 1.8) * 0.22
            : guideSignal?.suggestedAnim === 'celebrate'
              ? Math.sin(t * 4.5) * 0.12
              : 0;
        rootRef.current.rotation.y = placement.rotationY + yawOffset;
      }
    });

    if (!isVisible) return null;

    return (
      <group
        ref={rootRef}
        name="v28-welcome-guide-npc"
        position={[placement.x, placement.y, placement.z]}
        rotation={[0, placement.rotationY, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClickGuide?.();
        }}
      >
        {/* Subtle Glowing Floor Ring */}
        <mesh ref={ringRef} position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.62, 28]} />
          <meshBasicMaterial color={accentHex} transparent opacity={0.78} />
        </mesh>

        {/* Loaded Áo Dài Hostess GLB (or lightweight fallback capsule if offline) */}
        {modelGroup ? (
          <primitive object={modelGroup} />
        ) : (
          <mesh position={[0, 0.9, 0]}>
            <capsuleGeometry args={[0.24, 1.1, 6, 12]} />
            <meshStandardMaterial color="#0284c7" roughness={0.45} />
          </mesh>
        )}

        {/* Compact Floating Guide Badge */}
        <Billboard position={[0, 2.02, 0]} follow lockX={false} lockY={false} lockZ={false}>
          <mesh>
            <planeGeometry args={[1.45, 0.34]} />
            <meshBasicMaterial map={badgeTex} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);
