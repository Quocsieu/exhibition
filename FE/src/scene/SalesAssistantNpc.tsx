import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Booth } from '../types/expo';
import {
  type NpcAnimationClipName,
  NPC_GLB_URL,
  computeNpcPlacement,
  getNpcAssistantProfile,
} from '../services/npcPresentationService';

export interface SalesAssistantNpcProps {
  booth: Booth;
  isActiveSession: boolean;
  activeAnimation: NpcAnimationClipName;
  onActivate: (booth: Booth) => void;
  visible?: boolean;
}

interface CachedNpcMaster {
  scene: THREE.Group;
  animations: Record<NpcAnimationClipName, THREE.AnimationClip | null>;
}

let cachedMaster: CachedNpcMaster | null = null;
let loadingPromise: Promise<CachedNpcMaster> | null = null;
const gltfLoader = new GLTFLoader();

function loadSharedNpcMaster(): Promise<CachedNpcMaster> {
  if (cachedMaster) {
    return Promise.resolve(cachedMaster);
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<CachedNpcMaster>((resolve, reject) => {
    gltfLoader.load(
      NPC_GLB_URL,
      (gltf: GLTF) => {
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        const animations: Record<NpcAnimationClipName, THREE.AnimationClip | null> = {
          IDLE: null,
          WAVE: null,
          TALKING: null,
          PRESENT: null,
        };

        for (const clip of gltf.animations) {
          const upper = clip.name.toUpperCase();
          if (upper.includes('IDLE')) animations.IDLE = clip;
          else if (upper.includes('WAVE')) animations.WAVE = clip;
          else if (upper.includes('TALK')) animations.TALKING = clip;
          else if (upper.includes('PRESENT')) animations.PRESENT = clip;
        }

        cachedMaster = {
          scene: gltf.scene,
          animations,
        };
        resolve(cachedMaster);
      },
      undefined,
      (err) => {
        loadingPromise = null;
        reject(err);
      }
    );
  });

  return loadingPromise;
}

const NPC_SHADOW_GEOM = new THREE.CircleGeometry(0.36, 24);
const NPC_RING_GEOM = new THREE.RingGeometry(0.38, 0.48, 28);
const NPC_HITBOX_GEOM = new THREE.CylinderGeometry(0.38, 0.38, 1.78, 12);
const NPC_BADGE_PLANE_GEOM = new THREE.PlaneGeometry(1.72, 0.46);

const NPC_SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: '#0f172a',
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});

const NPC_HITBOX_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

function createNpcBadgeTexture(opts: {
  assistantName: string;
  accentColor: string;
  isActive: boolean;
  isHovered: boolean;
}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 136;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Rounded pill card background
    const x = 8;
    const y = 8;
    const w = canvas.width - 16;
    const h = canvas.height - 16;
    const r = 26;

    ctx.save();
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

    ctx.fillStyle = opts.isActive ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.88)';
    ctx.fill();

    ctx.lineWidth = opts.isActive || opts.isHovered ? 5 : 3.5;
    ctx.strokeStyle = opts.isActive ? '#fbbf24' : opts.accentColor;
    ctx.stroke();

    // Left accent dot / status indicator
    ctx.beginPath();
    ctx.arc(46, canvas.height / 2, 14, 0, Math.PI * 2);
    ctx.fillStyle = opts.isActive ? '#fbbf24' : opts.accentColor;
    ctx.fill();

    // Title line: Assistant name
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px Inter, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Chuyên viên ${opts.assistantName}`, 76, 48);

    // Subtitle line: Call to action or active status
    ctx.fillStyle = opts.isActive ? '#fde68a' : '#bae6fd';
    ctx.font = '600 21px Inter, Segoe UI, sans-serif';
    const subText = opts.isActive
      ? '🔊 Đang giới thiệu sản phẩm...'
      : '💬 Bấm để nghe giới thiệu SP';
    ctx.fillText(subText, 76, 90);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const SalesAssistantNpc: React.FC<SalesAssistantNpcProps> = React.memo(
  ({ booth, isActiveSession, activeAnimation, onActivate, visible = true }) => {
    const [master, setMaster] = useState<CachedNpcMaster | null>(() => cachedMaster);
    const [hovered, setHovered] = useState(false);

    const ringRef = useRef<THREE.Mesh>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const actionsRef = useRef<Record<NpcAnimationClipName, THREE.AnimationAction | null>>({
      IDLE: null,
      WAVE: null,
      TALKING: null,
      PRESENT: null,
    });
    const currentClipRef = useRef<NpcAnimationClipName>('IDLE');

    const placement = useMemo(() => computeNpcPlacement(booth), [booth]);
    const profile = useMemo(() => getNpcAssistantProfile(booth), [booth]);

    useEffect(() => {
      let mounted = true;
      loadSharedNpcMaster()
        .then((loaded) => {
          if (mounted) {
            setMaster(loaded);
          }
        })
        .catch(() => {
          // Graceful no-op if asset fails in headless unit test environment
        });
      return () => {
        mounted = false;
      };
    }, []);

    const boothAccentMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: booth.color,
          roughness: 0.32,
          metalness: 0.16,
        }),
      [booth.color]
    );

    const ringMat = useMemo(
      () =>
        new THREE.MeshBasicMaterial({
          color: isActiveSession ? '#fbbf24' : booth.color,
          transparent: true,
          opacity: isActiveSession || hovered ? 0.92 : 0.55,
          side: THREE.DoubleSide,
        }),
      [booth.color, isActiveSession, hovered]
    );

    useEffect(() => {
      return () => {
        boothAccentMat.dispose();
      };
    }, [boothAccentMat]);

    useEffect(() => {
      return () => {
        ringMat.dispose();
      };
    }, [ringMat]);

    const clonedCharacter = useMemo(() => {
      if (!master) return null;
      const clone = master.scene.clone(true);
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.Material | undefined;
          if (mat && mat.name === 'NpcBrandAccent') {
            mesh.material = boothAccentMat;
          }
        }
      });
      return clone;
    }, [master, boothAccentMat]);

    // Initialize AnimationMixer & clip actions on clonedCharacter
    useEffect(() => {
      if (!clonedCharacter || !master) return;

      const mixer = new THREE.AnimationMixer(clonedCharacter);
      mixerRef.current = mixer;

      const nextActions: Record<NpcAnimationClipName, THREE.AnimationAction | null> = {
        IDLE: master.animations.IDLE ? mixer.clipAction(master.animations.IDLE) : null,
        WAVE: master.animations.WAVE ? mixer.clipAction(master.animations.WAVE) : null,
        TALKING: master.animations.TALKING ? mixer.clipAction(master.animations.TALKING) : null,
        PRESENT: master.animations.PRESENT ? mixer.clipAction(master.animations.PRESENT) : null,
      };
      actionsRef.current = nextActions;

      if (nextActions.IDLE) {
        nextActions.IDLE.reset().play();
        currentClipRef.current = 'IDLE';
      }

      return () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(clonedCharacter);
        mixerRef.current = null;
      };
    }, [clonedCharacter, master]);

    // Crossfade between IDLE, WAVE, TALKING, and PRESENT when activeAnimation changes
    useEffect(() => {
      const targetClip: NpcAnimationClipName = isActiveSession ? activeAnimation : 'IDLE';
      const prevClip = currentClipRef.current;
      if (targetClip === prevClip) return;

      const prevAction = actionsRef.current[prevClip];
      const nextAction = actionsRef.current[targetClip] || actionsRef.current.IDLE;

      if (nextAction) {
        nextAction.reset();
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        if (prevAction && prevAction !== nextAction) {
          prevAction.crossFadeTo(nextAction, 0.26, true);
        }
        nextAction.play();
        currentClipRef.current = targetClip;
      }
    }, [isActiveSession, activeAnimation]);

    const badgeTexture = useMemo(
      () =>
        createNpcBadgeTexture({
          assistantName: profile.assistantName,
          accentColor: booth.color,
          isActive: isActiveSession,
          isHovered: hovered,
        }),
      [profile.assistantName, booth.color, isActiveSession, hovered]
    );

    useEffect(() => {
      return () => {
        badgeTexture.dispose();
      };
    }, [badgeTexture]);

    useFrame(({ clock }, rawDelta) => {
      if (!visible) return;
      const delta = Math.min(rawDelta, 0.1);
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      if (ringRef.current) {
        const t = clock.getElapsedTime();
        const scale = isActiveSession
          ? 1.08 + Math.sin(t * 5.2) * 0.08
          : hovered
            ? 1.05 + Math.sin(t * 3.5) * 0.05
            : 1.0;
        ringRef.current.scale.set(scale, scale, 1);
      }
    });

    const handleTrigger = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onActivate(booth);
    };

    return (
      <group
        visible={visible}
        position={[placement.localX, placement.localY, placement.localZ]}
        rotation={[0, placement.localRotationY, 0]}
        onClick={handleTrigger}
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
        {/* Ground Contact Shadow & Interactive Status Ring */}
        <mesh
          position={[0, 0.008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={NPC_SHADOW_GEOM}
          material={NPC_SHADOW_MAT}
        />
        <mesh
          ref={ringRef}
          position={[0, 0.014, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={NPC_RING_GEOM}
          material={ringMat}
        />

        {/* Invisible Ergonomic Raycast Hit Cylinder for Effortless Desktop Click & Mobile Tap */}
        <mesh position={[0, 0.89, 0]} geometry={NPC_HITBOX_GEOM} material={NPC_HITBOX_MAT} />

        {/* Cloned 3D Vietnamese Female Sales Assistant Character Rig */}
        {clonedCharacter && <primitive object={clonedCharacter} dispose={null} />}

        {/* Floating Interactive Callout Badge above NPC */}
        <Billboard position={[0, 1.98, 0]} follow>
          <mesh geometry={NPC_BADGE_PLANE_GEOM}>
            <meshBasicMaterial map={badgeTexture} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    );
  }
);
