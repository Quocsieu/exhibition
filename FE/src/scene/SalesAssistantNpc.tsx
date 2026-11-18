import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Booth } from '../types/expo';
import {
  type NpcAnimationClipName,
  NPC_GLB_URL,
  TARGET_NPC_HEIGHT_METERS,
  computeNormalizedNpcTransform,
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
  hasEmbeddedClips: boolean;
  hasProceduralRig: boolean;
}

interface ProceduralRigBones {
  spine: THREE.Bone | null;
  neckHead: THREE.Bone | null;
  upperArmL: THREE.Bone | null;
  forearmL: THREE.Bone | null;
  handL: THREE.Bone | null;
  upperArmR: THREE.Bone | null;
  forearmR: THREE.Bone | null;
  handR: THREE.Bone | null;
}

type BodyRegionCategory =
  | 'lashes'
  | 'earrings'
  | 'hair'
  | 'head'
  | 'neck'
  | 'hand'
  | 'nails'
  | 'shoes'
  | 'soles'
  | 'legs'
  | 'skirt'
  | 'cuff'
  | 'sleeve'
  | 'blouse'
  | 'blazerTorso';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Classifies each connected topological component of `untitled.glb`'s body/garment mesh
 * in normalized 1.70m Y-up meter coordinates without modifying the source GLB file on disk.
 */
function classifyBodyComponent(stats: {
  vertCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
}): BodyRegionCategory {
  const { vertCount, minX, maxX, minY, maxY, minZ } = stats;
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
  const minAbsX = Math.min(Math.abs(minX), Math.abs(maxX));

  // 1. Individual 3D eyelashes & upper lash rim around eyes (y ≈ 1.52..1.56m)
  if (
    (vertCount < 30 && minY > 1.49) ||
    (vertCount >= 85 && vertCount <= 135 && minY > 1.50 && maxY < 1.565 && minZ > 0.09)
  ) {
    return 'lashes';
  }

  // 2. Earlobe stud earrings (y ≈ 1.48..1.50m, |x| ≈ 0.08m)
  if (vertCount >= 18 && vertCount <= 40 && minY >= 1.45 && maxY <= 1.52 && minAbsX > 0.065) {
    return 'earrings';
  }

  // 3. Hair crown, back hair & front bangs (y up to 1.70m)
  if (
    (maxY > 1.675 && vertCount > 400) ||
    (minY > 1.535 && maxY > 1.60 && vertCount >= 75 && vertCount <= 180)
  ) {
    return 'hair';
  }

  // 4. Main head & face mesh (y ≈ 1.416..1.669m)
  if (vertCount > 1800 && minY > 1.38) {
    return 'head';
  }

  // 5. Neck & clavicle skin seamlessly connecting head to neckline (y ≈ 1.28..1.44m)
  if (maxY > 1.42 && minY > 1.26 && maxAbsX < 0.155) {
    return 'neck';
  }

  // 6. Hands, palms, fingers & nail plates (|x| >= 0.455m in A-pose)
  if (minAbsX > 0.455) {
    if (vertCount <= 226 && minZ > 0.008) {
      return 'nails';
    }
    return 'hand';
  }

  // 7. Classic dress shoes & heels (y < 0.16m)
  if (maxY < 0.16) {
    return maxY < 0.075 ? 'soles' : 'shoes';
  }

  // 8. Lower legs / calves (y ≈ 0.12..0.73m)
  if (minY >= 0.09 && maxY < 0.78) {
    return 'legs';
  }

  // 9. Tailored pencil skirt (y ≈ 0.56..0.98m)
  if (minY >= 0.52 && maxY < 1.02) {
    return 'skirt';
  }

  // 10. Blazer sleeves & turned-back ivory cuffs
  if (maxAbsX > 0.24) {
    return minAbsX > 0.32 ? 'cuff' : 'sleeve';
  }

  // 11. Inner pearl-ivory silk blouse vs outer tailored navy blazer panels
  if (maxAbsX <= 0.145) {
    return 'blouse';
  }

  return 'blazerTorso';
}

/**
 * Builds a rigged, naturally colored `THREE.Group` from an unrigged A-pose GLB (`untitled.glb`),
 * binding all primitives to a 9-bone `THREE.Skeleton` so both arms rest naturally by her sides
 * and support smooth Idle, Greeting Wave, Talking, and Product Presentation animations.
 */
export function buildRiggedAndColoredNpcScene(rawScene: THREE.Group): THREE.Group {
  rawScene.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(rawScene);

  const norm = rawBox.isEmpty()
    ? { scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 }
    : computeNormalizedNpcTransform(
        [rawBox.min.x, rawBox.min.y, rawBox.min.z],
        [rawBox.max.x, rawBox.max.y, rawBox.max.z],
        TARGET_NPC_HEIGHT_METERS
      );

  const normScaleMatrix = new THREE.Matrix4().makeScale(norm.scale, norm.scale, norm.scale);
  const normTranslateMatrix = new THREE.Matrix4().makeTranslation(
    norm.offsetX,
    norm.offsetY,
    norm.offsetZ
  );
  const worldToNormalized = new THREE.Matrix4().multiplyMatrices(
    normTranslateMatrix,
    normScaleMatrix
  );

  // Create 9-bone anatomical hierarchy in 1.70m Y-up meter coordinates:
  // 0: Root, 1: Spine, 2: NeckHead, 3: UpperArm_L, 4: Forearm_L, 5: Hand_L, 6: UpperArm_R, 7: Forearm_R, 8: Hand_R
  const rootBone = new THREE.Bone();
  rootBone.name = 'NpcRoot';
  rootBone.position.set(0, 0, 0);

  const spineBone = new THREE.Bone();
  spineBone.name = 'NpcSpine';
  spineBone.position.set(0, 0.92, 0);
  rootBone.add(spineBone);

  const neckHeadBone = new THREE.Bone();
  neckHeadBone.name = 'NpcNeckHead';
  neckHeadBone.position.set(0, 0.465, 0.01); // world (0, 1.385, 0.01)
  spineBone.add(neckHeadBone);

  const upperArmLBone = new THREE.Bone();
  upperArmLBone.name = 'NpcUpperArmL';
  upperArmLBone.position.set(0.146, 0.356, -0.024); // world (+0.146, 1.276, -0.024)
  spineBone.add(upperArmLBone);

  const forearmLBone = new THREE.Bone();
  forearmLBone.name = 'NpcForearmL';
  forearmLBone.position.set(0.169, -0.16, -0.037); // world (+0.315, 1.116, -0.061)
  upperArmLBone.add(forearmLBone);

  const handLBone = new THREE.Bone();
  handLBone.name = 'NpcHandL';
  handLBone.position.set(0.151, -0.193, 0.042); // world (+0.466, 0.923, -0.019)
  forearmLBone.add(handLBone);

  const upperArmRBone = new THREE.Bone();
  upperArmRBone.name = 'NpcUpperArmR';
  upperArmRBone.position.set(-0.146, 0.356, -0.024); // world (-0.146, 1.276, -0.024)
  spineBone.add(upperArmRBone);

  const forearmRBone = new THREE.Bone();
  forearmRBone.name = 'NpcForearmR';
  forearmRBone.position.set(-0.169, -0.16, -0.037); // world (-0.315, 1.116, -0.061)
  upperArmRBone.add(forearmRBone);

  const handRBone = new THREE.Bone();
  handRBone.name = 'NpcHandR';
  handRBone.position.set(-0.151, -0.193, 0.042); // world (-0.466, 0.923, -0.019)
  forearmRBone.add(handRBone);

  const bones: THREE.Bone[] = [
    rootBone,
    spineBone,
    neckHeadBone,
    upperArmLBone,
    forearmLBone,
    handLBone,
    upperArmRBone,
    forearmRBone,
    handRBone,
  ];

  rootBone.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // Palette in Three.js linear-converted Color instances (Vietnamese Semi-Realistic Exhibition Hostess)
  const PALETTE = {
    skinFace: new THREE.Color('#eac0a2'),
    skinNeckShadow: new THREE.Color('#e2b596'),
    skinHand: new THREE.Color('#e7bb9d'),
    skinLeg: new THREE.Color('#e5b89a'),
    lipRose: new THREE.Color('#c7686c'),
    cheekBlush: new THREE.Color('#e29d8f'),
    nailNatural: new THREE.Color('#f2d6cb'),
    hairBase: new THREE.Color('#1d1614'),
    hairCrown: new THREE.Color('#2b211e'),
    lashes: new THREE.Color('#161110'),
    earringPearl: new THREE.Color('#f3e3b2'),
    blouseIvory: new THREE.Color('#f6f2eb'),
    cuffIvory: new THREE.Color('#f1ece3'),
    blazerNavy: new THREE.Color('#1e3658'),
    skirtNavy: new THREE.Color('#162642'),
    shoeDark: new THREE.Color('#1a2130'),
    soleDark: new THREE.Color('#10141d'),
  };

  const eyeScleraMat = new THREE.MeshStandardMaterial({
    name: 'NpcEyeSclera',
    color: '#f8f5f0',
    roughness: 0.22,
    metalness: 0.0,
  });
  const eyeIrisMat = new THREE.MeshStandardMaterial({
    name: 'NpcEyeIris',
    color: '#3a2214',
    roughness: 0.24,
    metalness: 0.02,
  });
  const eyeCorneaMat = new THREE.MeshStandardMaterial({
    name: 'NpcEyeCornea',
    color: '#ffffff',
    transparent: true,
    opacity: 0.14,
    roughness: 0.06,
    metalness: 0.05,
    depthWrite: false,
  });
  const eyebrowMat = new THREE.MeshStandardMaterial({
    name: 'NpcEyebrow',
    color: '#241814',
    roughness: 0.72,
    metalness: 0.0,
  });
  const bodyVertexColoredMat = new THREE.MeshStandardMaterial({
    name: 'NpcBodyAndAttire',
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.64,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const faceSkinVertexColoredMat = new THREE.MeshStandardMaterial({
    name: 'NpcFaceSkin',
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.01,
    side: THREE.DoubleSide,
  });

  const sourceMeshes: THREE.Mesh[] = [];
  rawScene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      sourceMeshes.push(obj as THREE.Mesh);
    }
  });

  const riggedRoot = new THREE.Group();
  riggedRoot.name = 'NormalizedNpcRoot';
  riggedRoot.add(rootBone);

  const tmpColor = new THREE.Color();

  for (const srcMesh of sourceMeshes) {
    const geom = srcMesh.geometry.clone();
    const meshMatrix = new THREE.Matrix4().multiplyMatrices(worldToNormalized, srcMesh.matrixWorld);
    geom.applyMatrix4(meshMatrix);
    if (!geom.hasAttribute('normal')) {
      geom.computeVertexNormals();
    } else {
      geom.normalizeNormals();
    }

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const bakedColorAttr = geom.getAttribute('color') as THREE.BufferAttribute | undefined;
    const vertCount = posAttr.count;
    const rawMatName = ((srcMesh.material as THREE.Material | undefined)?.name || '').toLowerCase();

    const skinIndices = new Uint16Array(vertCount * 4);
    const skinWeights = new Float32Array(vertCount * 4);

    let assignedMaterial: THREE.Material | THREE.Material[] = bodyVertexColoredMat;

    if (
      rawMatName.includes('eye') &&
      !rawMatName.includes('eyebrow')
    ) {
      assignedMaterial = eyeScleraMat;
    } else if (rawMatName.includes('iris')) {
      assignedMaterial = eyeIrisMat;
    } else if (rawMatName.includes('cornea')) {
      assignedMaterial = eyeCorneaMat;
    } else if (rawMatName.includes('eyebrow')) {
      assignedMaterial = eyebrowMat;
    }

    if (assignedMaterial !== bodyVertexColoredMat) {
      // Eye sclera, iris, cornea, and eyebrows follow NeckHead bone (index 2) 100% rigidly
      for (let i = 0; i < vertCount; i++) {
        skinIndices[i * 4] = 2;
        skinWeights[i * 4] = 1.0;
      }
      if (geom.hasAttribute('color')) {
        geom.deleteAttribute('color');
      }
    } else {
      // Connected-component topological segmentation for `mat_skin`
      const parent = new Int32Array(vertCount);
      for (let i = 0; i < vertCount; i++) parent[i] = i;
      const find = (x: number): number => {
        let cur = x;
        while (parent[cur] !== cur) {
          parent[cur] = parent[parent[cur]];
          cur = parent[cur];
        }
        return cur;
      };

      const indexAttr = geom.getIndex();
      if (indexAttr) {
        const idxCount = indexAttr.count;
        for (let i = 0; i < idxCount; i += 3) {
          const a = find(indexAttr.getX(i));
          const b = find(indexAttr.getX(i + 1));
          if (a !== b) parent[a] = b;
          const b2 = find(indexAttr.getX(i + 1));
          const c = find(indexAttr.getX(i + 2));
          if (b2 !== c) parent[b2] = c;
        }
      }

      const compStats = new Map<
        number,
        {
          vertCount: number;
          minX: number;
          maxX: number;
          minY: number;
          maxY: number;
          minZ: number;
          category?: BodyRegionCategory;
        }
      >();

      for (let i = 0; i < vertCount; i++) {
        const r = find(i);
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);
        let st = compStats.get(r);
        if (!st) {
          st = {
            vertCount: 0,
            minX: vx,
            maxX: vx,
            minY: vy,
            maxY: vy,
            minZ: vz,
          };
          compStats.set(r, st);
        }
        st.vertCount += 1;
        if (vx < st.minX) st.minX = vx;
        if (vx > st.maxX) st.maxX = vx;
        if (vy < st.minY) st.minY = vy;
        if (vy > st.maxY) st.maxY = vy;
        if (vz < st.minZ) st.minZ = vz;
      }

      for (const st of compStats.values()) {
        st.category = classifyBodyComponent(st);
      }

      const colors = new Float32Array(vertCount * 3);

      for (let i = 0; i < vertCount; i++) {
        const r = find(i);
        const cat = compStats.get(r)?.category || 'blazerTorso';
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);
        const ax = Math.abs(vx);

        // 1. Assign vertex color by exact anatomical/garment region
        switch (cat) {
          case 'lashes':
            tmpColor.copy(PALETTE.lashes);
            break;
          case 'earrings':
            tmpColor.copy(PALETTE.earringPearl);
            break;
          case 'hair': {
            const crownFactor = smoothstep(1.58, 1.69, vy);
            tmpColor.copy(PALETTE.hairBase).lerp(PALETTE.hairCrown, crownFactor * 0.65);
            break;
          }
          case 'head': {
            if (bakedColorAttr && bakedColorAttr.count === vertCount) {
              // Preserve baked COLOR_0 facial colors from refined GLB (rose lips, peach blush, soft skin shading)
              tmpColor.setRGB(
                bakedColorAttr.getX(i),
                bakedColorAttr.getY(i),
                bakedColorAttr.getZ(i)
              );
              break;
            }
            tmpColor.copy(PALETTE.skinFace);
            // Fallback procedural lips & blush aligned to normalized Z coordinates (mouth z ≈ 0.075..0.104m)
            if (vz > 0.073 && vy > 1.450 && vy < 1.476 && ax < 0.022) {
              const ellip = Math.hypot(ax / 0.021, (vy - 1.463) / 0.011);
              const zFactor = smoothstep(0.073, 0.085, vz);
              const lipAlpha = (1 - smoothstep(0.55, 1.0, ellip)) * zFactor * 0.78;
              if (lipAlpha > 0.001) {
                tmpColor.lerp(PALETTE.lipRose, lipAlpha);
              }
            }
            if (vz > 0.056 && vy > 1.472 && vy < 1.522 && ax > 0.018 && ax < 0.065) {
              const distCheek = Math.hypot((ax - 0.041) / 0.023, (vy - 1.494) / 0.019);
              const blushAlpha = (1 - smoothstep(0.15, 1.0, distCheek)) * 0.24;
              if (blushAlpha > 0.001) {
                tmpColor.lerp(PALETTE.cheekBlush, blushAlpha);
              }
            }
            break;
          }
          case 'neck': {
            const chinShade = smoothstep(1.38, 1.435, vy) * 0.25;
            tmpColor.copy(PALETTE.skinFace).lerp(PALETTE.skinNeckShadow, chinShade);
            break;
          }
          case 'hand':
            tmpColor.copy(PALETTE.skinHand);
            break;
          case 'nails':
            tmpColor.copy(PALETTE.nailNatural);
            break;
          case 'legs':
            tmpColor.copy(PALETTE.skinLeg);
            break;
          case 'shoes':
            tmpColor.copy(PALETTE.shoeDark);
            break;
          case 'soles':
            tmpColor.copy(PALETTE.soleDark);
            break;
          case 'skirt':
            tmpColor.copy(PALETTE.skirtNavy);
            break;
          case 'cuff':
            tmpColor.copy(PALETTE.cuffIvory);
            break;
          case 'sleeve':
            tmpColor.copy(PALETTE.blazerNavy);
            break;
          case 'blouse':
            tmpColor.copy(PALETTE.blouseIvory);
            break;
          case 'blazerTorso':
          default:
            tmpColor.copy(PALETTE.blazerNavy);
            break;
        }

        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;

        // 2. Assign smooth, artifact-free bone weights
        const isLeft = vx >= 0;
        const upperArmIdx = isLeft ? 3 : 6;
        const forearmIdx = isLeft ? 4 : 7;
        const handIdx = isLeft ? 5 : 8;

        if (cat === 'head' || cat === 'hair' || cat === 'lashes' || cat === 'earrings') {
          skinIndices[i * 4] = 2; // NeckHead
          skinWeights[i * 4] = 1.0;
        } else if (cat === 'neck') {
          const wHead = smoothstep(1.35, 1.415, vy);
          skinIndices[i * 4] = 2;
          skinWeights[i * 4] = wHead;
          skinIndices[i * 4 + 1] = 1;
          skinWeights[i * 4 + 1] = 1 - wHead;
        } else if (cat === 'shoes' || cat === 'soles' || cat === 'legs') {
          skinIndices[i * 4] = 0; // Root (planted on floor)
          skinWeights[i * 4] = 1.0;
        } else if (cat === 'skirt') {
          const wSpine = smoothstep(0.84, 0.98, vy);
          skinIndices[i * 4] = 0;
          skinWeights[i * 4] = 1 - wSpine;
          skinIndices[i * 4 + 1] = 1;
          skinWeights[i * 4 + 1] = wSpine;
        } else if (cat === 'blouse') {
          skinIndices[i * 4] = 1; // Spine
          skinWeights[i * 4] = 1.0;
        } else if (cat === 'blazerTorso') {
          // Outer shoulder seam of blazer drapes smoothly with UpperArm when lowered
          if (vy > 1.18 && ax > 0.125) {
            const wArm =
              smoothstep(0.125, 0.175, ax) * smoothstep(1.18, 1.29, vy) * 0.62;
            skinIndices[i * 4] = 1;
            skinWeights[i * 4] = 1 - wArm;
            skinIndices[i * 4 + 1] = upperArmIdx;
            skinWeights[i * 4 + 1] = wArm;
          } else {
            const wSpine = smoothstep(0.84, 0.96, vy);
            skinIndices[i * 4] = 1;
            skinWeights[i * 4] = wSpine;
            skinIndices[i * 4 + 1] = 0;
            skinWeights[i * 4 + 1] = 1 - wSpine;
          }
        } else if (cat === 'sleeve' || cat === 'cuff') {
          if (ax < 0.188) {
            const wUpper = smoothstep(0.122, 0.188, ax);
            skinIndices[i * 4] = 1;
            skinWeights[i * 4] = 1 - wUpper;
            skinIndices[i * 4 + 1] = upperArmIdx;
            skinWeights[i * 4 + 1] = wUpper;
          } else if (ax < 0.275) {
            skinIndices[i * 4] = upperArmIdx;
            skinWeights[i * 4] = 1.0;
          } else if (ax < 0.355) {
            const wFore = smoothstep(0.275, 0.355, ax);
            skinIndices[i * 4] = upperArmIdx;
            skinWeights[i * 4] = 1 - wFore;
            skinIndices[i * 4 + 1] = forearmIdx;
            skinWeights[i * 4 + 1] = wFore;
          } else if (ax < 0.452) {
            skinIndices[i * 4] = forearmIdx;
            skinWeights[i * 4] = 1.0;
          } else {
            const wHand = smoothstep(0.452, 0.48, ax);
            skinIndices[i * 4] = forearmIdx;
            skinWeights[i * 4] = 1 - wHand;
            skinIndices[i * 4 + 1] = handIdx;
            skinWeights[i * 4 + 1] = wHand;
          }
        } else {
          // 'hand' & 'nails' — rigid palm & fingers with smooth wrist blend
          if (ax < 0.478) {
            const wHand = smoothstep(0.452, 0.478, ax);
            skinIndices[i * 4] = forearmIdx;
            skinWeights[i * 4] = 1 - wHand;
            skinIndices[i * 4 + 1] = handIdx;
            skinWeights[i * 4 + 1] = wHand;
          } else {
            skinIndices[i * 4] = handIdx;
            skinWeights[i * 4] = 1.0;
          }
        }
      }

      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Partition face ('head') triangles into their own material group so ONLY face skin uses
      // silky roughness (0.52) while hair, blazer, skirt, blouse & shoes keep exact 0.64 roughness.
      if (indexAttr) {
        const bodyTris: number[] = [];
        const headTris: number[] = [];
        const totalIdx = indexAttr.count;
        for (let i = 0; i < totalIdx; i += 3) {
          const ia = indexAttr.getX(i);
          const ib = indexAttr.getX(i + 1);
          const ic = indexAttr.getX(i + 2);
          if (compStats.get(find(ia))?.category === 'head') {
            headTris.push(ia, ib, ic);
          } else {
            bodyTris.push(ia, ib, ic);
          }
        }
        if (headTris.length > 0 && bodyTris.length > 0) {
          const orderedIndices =
            vertCount > 65535
              ? new Uint32Array(bodyTris.length + headTris.length)
              : new Uint16Array(bodyTris.length + headTris.length);
          orderedIndices.set(bodyTris, 0);
          orderedIndices.set(headTris, bodyTris.length);
          geom.setIndex(new THREE.BufferAttribute(orderedIndices, 1));
          geom.clearGroups();
          geom.addGroup(0, bodyTris.length, 0);
          geom.addGroup(bodyTris.length, headTris.length, 1);
          assignedMaterial = [bodyVertexColoredMat, faceSkinVertexColoredMat];
        }
      }
    }

    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const skinnedMesh = new THREE.SkinnedMesh(geom, assignedMaterial);
    skinnedMesh.name = srcMesh.name || 'NpcSkinnedPart';
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.bind(skeleton);
    riggedRoot.add(skinnedMesh);
  }

  // Set initial natural resting arm pose immediately on master so first rendered frame is already relaxed
  upperArmLBone.rotation.set(-0.04, 0, -0.58);
  forearmLBone.rotation.set(-0.22, 0.06, -0.07);
  handLBone.rotation.set(-0.04, 0, 0.08);

  upperArmRBone.rotation.set(-0.04, 0, 0.58);
  forearmRBone.rotation.set(-0.22, -0.06, 0.07);
  handRBone.rotation.set(-0.04, 0, -0.08);
  riggedRoot.updateMatrixWorld(true);

  return riggedRoot;
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

        if (!animations.IDLE && gltf.animations.length > 0) {
          animations.IDLE = gltf.animations[0];
        }

        const hasEmbeddedClips = Boolean(
          animations.IDLE || animations.WAVE || animations.TALKING || animations.PRESENT
        );

        let preparedScene: THREE.Group;
        let hasProceduralRig = false;

        if (!hasEmbeddedClips) {
          preparedScene = buildRiggedAndColoredNpcScene(gltf.scene);
          hasProceduralRig = true;
        } else {
          gltf.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const wrapper = new THREE.Group();
          if (!box.isEmpty()) {
            const norm = computeNormalizedNpcTransform(
              [box.min.x, box.min.y, box.min.z],
              [box.max.x, box.max.y, box.max.z],
              TARGET_NPC_HEIGHT_METERS
            );
            gltf.scene.scale.multiplyScalar(norm.scale);
            gltf.scene.position.set(
              gltf.scene.position.x * norm.scale + norm.offsetX,
              gltf.scene.position.y * norm.scale + norm.offsetY,
              gltf.scene.position.z * norm.scale + norm.offsetZ
            );
          }
          gltf.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          wrapper.add(gltf.scene);
          preparedScene = wrapper;
        }

        cachedMaster = {
          scene: preparedScene,
          animations,
          hasEmbeddedClips,
          hasProceduralRig,
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

export const NPC_NAMEPLATE_SIZE: readonly [number, number] = [0.68, 0.23];
export const NPC_NAMEPLATE_OFFSET: readonly [number, number, number] = [0.16, 1.83, 0.06];

const NPC_SHADOW_GEOM = new THREE.CircleGeometry(0.36, 24);
const NPC_RING_GEOM = new THREE.RingGeometry(0.38, 0.48, 28);
const NPC_HITBOX_GEOM = new THREE.CylinderGeometry(0.4, 0.4, 1.76, 12);
const NPC_BADGE_PLANE_GEOM = new THREE.PlaneGeometry(NPC_NAMEPLATE_SIZE[0], NPC_NAMEPLATE_SIZE[1]);

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
  canvas.width = 272;
  canvas.height = 92;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const x = 5;
    const y = 5;
    const w = canvas.width - 10;
    const h = canvas.height - 10;
    const r = 20;

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

    ctx.fillStyle = opts.isActive ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.88)';
    ctx.fill();

    ctx.lineWidth = opts.isActive || opts.isHovered ? 4 : 2.8;
    ctx.strokeStyle = opts.isActive ? '#fbbf24' : opts.accentColor;
    ctx.stroke();

    // Compact status indicator dot on left
    ctx.beginPath();
    ctx.arc(28, 32, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = opts.isActive ? '#fbbf24' : '#10b981';
    ctx.fill();

    // Line 1: Clear NPC Name (dynamic per booth)
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 23px Inter, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.assistantName, 44, 32, w - 52);

    // Line 2: Concise instruction ("🔊 Bấm để nghe")
    ctx.fillStyle = opts.isActive ? '#fde68a' : '#bae6fd';
    ctx.font = '600 17px Inter, Segoe UI, sans-serif';
    const subText = opts.isActive ? '🔊 Đang tư vấn' : '🔊 Bấm để nghe';
    ctx.fillText(subText, 22, 64, w - 30);
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
    const rigBonesRef = useRef<ProceduralRigBones>({
      spine: null,
      neckHead: null,
      upperArmL: null,
      forearmL: null,
      handL: null,
      upperArmR: null,
      forearmR: null,
      handR: null,
    });
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const actionsRef = useRef<Record<NpcAnimationClipName, THREE.AnimationAction | null>>({
      IDLE: null,
      WAVE: null,
      TALKING: null,
      PRESENT: null,
    });
    const currentClipRef = useRef<NpcAnimationClipName>('IDLE');
    // Stagger idle breathing phase per booth so all 6 NPCs don't move in robotic unison
    const phaseOffset = useMemo(() => {
      let sum = 0;
      for (let i = 0; i < booth.id.length; i++) sum += booth.id.charCodeAt(i);
      return (sum % 17) * 0.37;
    }, [booth.id]);

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
      const clone = SkeletonUtils.clone(master.scene) as THREE.Group;
      const foundBones: ProceduralRigBones = {
        spine: null,
        neckHead: null,
        upperArmL: null,
        forearmL: null,
        handL: null,
        upperArmR: null,
        forearmR: null,
        handR: null,
      };

      clone.traverse((obj) => {
        if ((obj as THREE.Bone).isBone) {
          const b = obj as THREE.Bone;
          if (b.name === 'NpcSpine') foundBones.spine = b;
          else if (b.name === 'NpcNeckHead') foundBones.neckHead = b;
          else if (b.name === 'NpcUpperArmL') foundBones.upperArmL = b;
          else if (b.name === 'NpcForearmL') foundBones.forearmL = b;
          else if (b.name === 'NpcHandL') foundBones.handL = b;
          else if (b.name === 'NpcUpperArmR') foundBones.upperArmR = b;
          else if (b.name === 'NpcForearmR') foundBones.forearmR = b;
          else if (b.name === 'NpcHandR') foundBones.handR = b;
        }
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (mat && !Array.isArray(mat) && mat.name === 'NpcBrandAccent') {
            mesh.material = boothAccentMat;
          }
        }
      });

      rigBonesRef.current = foundBones;
      return clone;
    }, [master, boothAccentMat]);

    // Initialize AnimationMixer & clip actions when GLB contains embedded animation clips
    useEffect(() => {
      if (!clonedCharacter || !master || !master.hasEmbeddedClips) return;

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
      const t = clock.getElapsedTime() + phaseOffset;

      if (mixerRef.current) {
        mixerRef.current.update(delta);
      } else if (master?.hasProceduralRig) {
        const bones = rigBonesRef.current;
        const mode: NpcAnimationClipName = isActiveSession ? activeAnimation : 'IDLE';
        const alpha = 1 - Math.exp(-7.5 * delta);

        // Default relaxed standing targets (both arms lowered comfortably beside hips, elbows softly bent)
        let spineX = Math.sin(t * 1.7) * 0.01;
        let spineY = Math.sin(t * 0.85) * 0.018;
        let headX = Math.sin(t * 1.7 + 0.4) * 0.014;
        let headY = Math.sin(t * 1.05) * 0.032;

        let uArmLX = -0.04;
        let uArmLY = 0;
        let uArmLZ = -0.58 + Math.sin(t * 1.7) * 0.01;
        let fArmLX = -0.22 + Math.sin(t * 1.7 + 0.5) * 0.015;
        let fArmLY = 0.06;
        let fArmLZ = -0.07;
        let handLX = -0.04;
        let handLY = 0;
        let handLZ = 0.08;

        let uArmRX = -0.04;
        let uArmRY = 0;
        let uArmRZ = 0.58 - Math.sin(t * 1.7) * 0.01;
        let fArmRX = -0.22 + Math.sin(t * 1.7 + 0.5) * 0.015;
        let fArmRY = -0.06;
        let fArmRZ = 0.07;
        let handRX = -0.04;
        let handRY = 0;
        let handRZ = -0.08;

        if (mode === 'WAVE') {
          // Graceful Vietnamese greeting: left arm stays relaxed; right forearm raises politely for a soft wave
          spineY = 0.04 + Math.sin(t * 2.4) * 0.025;
          headX = 0.045 + Math.sin(t * 3.2) * 0.025;
          headY = 0.05;

          uArmRX = -0.28;
          uArmRY = -0.08;
          uArmRZ = 0.44;
          fArmRX = -1.02;
          fArmRY = -0.18;
          fArmRZ = 0.16 + Math.sin(t * 5.4) * 0.13;
          handRZ = -0.04 + Math.sin(t * 5.4 + 0.4) * 0.12;
        } else if (mode === 'PRESENT') {
          // Open-hand presentation toward the booth's display shelves on her inward (-X) side
          spineY = -0.09 + Math.sin(t * 2.0) * 0.025;
          headY = -0.11 + Math.sin(t * 1.8) * 0.035;
          headX = 0.02;

          uArmRX = -0.34;
          uArmRY = -0.22;
          uArmRZ = 0.42;
          fArmRX = -0.74 + Math.sin(t * 2.6) * 0.07;
          fArmRY = -0.24;
          fArmRZ = 0.08;
          handRX = 0.06;
          handRY = -0.2;
          handRZ = -0.05;
        } else if (mode === 'TALKING') {
          // Calm conversational hostess gestures while keeping both upper arms relaxed down
          spineX = Math.sin(t * 2.2) * 0.012;
          spineY = Math.sin(t * 1.5) * 0.03;
          headX = Math.sin(t * 3.0) * 0.025;
          headY = Math.sin(t * 1.8) * 0.042;

          uArmLX = -0.08;
          uArmLZ = -0.56;
          fArmLX = -0.32 + Math.sin(t * 2.5) * 0.055;

          uArmRX = -0.12;
          uArmRZ = 0.54;
          fArmRX = -0.4 + Math.sin(t * 2.5 + 1.1) * 0.075;
          handRZ = -0.06 + Math.sin(t * 2.5 + 1.1) * 0.04;
        }

        if (bones.spine) {
          bones.spine.rotation.x = THREE.MathUtils.lerp(bones.spine.rotation.x, spineX, alpha);
          bones.spine.rotation.y = THREE.MathUtils.lerp(bones.spine.rotation.y, spineY, alpha);
        }
        if (bones.neckHead) {
          bones.neckHead.rotation.x = THREE.MathUtils.lerp(bones.neckHead.rotation.x, headX, alpha);
          bones.neckHead.rotation.y = THREE.MathUtils.lerp(bones.neckHead.rotation.y, headY, alpha);
        }
        if (bones.upperArmL) {
          bones.upperArmL.rotation.x = THREE.MathUtils.lerp(bones.upperArmL.rotation.x, uArmLX, alpha);
          bones.upperArmL.rotation.y = THREE.MathUtils.lerp(bones.upperArmL.rotation.y, uArmLY, alpha);
          bones.upperArmL.rotation.z = THREE.MathUtils.lerp(bones.upperArmL.rotation.z, uArmLZ, alpha);
        }
        if (bones.forearmL) {
          bones.forearmL.rotation.x = THREE.MathUtils.lerp(bones.forearmL.rotation.x, fArmLX, alpha);
          bones.forearmL.rotation.y = THREE.MathUtils.lerp(bones.forearmL.rotation.y, fArmLY, alpha);
          bones.forearmL.rotation.z = THREE.MathUtils.lerp(bones.forearmL.rotation.z, fArmLZ, alpha);
        }
        if (bones.handL) {
          bones.handL.rotation.x = THREE.MathUtils.lerp(bones.handL.rotation.x, handLX, alpha);
          bones.handL.rotation.y = THREE.MathUtils.lerp(bones.handL.rotation.y, handLY, alpha);
          bones.handL.rotation.z = THREE.MathUtils.lerp(bones.handL.rotation.z, handLZ, alpha);
        }
        if (bones.upperArmR) {
          bones.upperArmR.rotation.x = THREE.MathUtils.lerp(bones.upperArmR.rotation.x, uArmRX, alpha);
          bones.upperArmR.rotation.y = THREE.MathUtils.lerp(bones.upperArmR.rotation.y, uArmRY, alpha);
          bones.upperArmR.rotation.z = THREE.MathUtils.lerp(bones.upperArmR.rotation.z, uArmRZ, alpha);
        }
        if (bones.forearmR) {
          bones.forearmR.rotation.x = THREE.MathUtils.lerp(bones.forearmR.rotation.x, fArmRX, alpha);
          bones.forearmR.rotation.y = THREE.MathUtils.lerp(bones.forearmR.rotation.y, fArmRY, alpha);
          bones.forearmR.rotation.z = THREE.MathUtils.lerp(bones.forearmR.rotation.z, fArmRZ, alpha);
        }
        if (bones.handR) {
          bones.handR.rotation.x = THREE.MathUtils.lerp(bones.handR.rotation.x, handRX, alpha);
          bones.handR.rotation.y = THREE.MathUtils.lerp(bones.handR.rotation.y, handRY, alpha);
          bones.handR.rotation.z = THREE.MathUtils.lerp(bones.handR.rotation.z, handRZ, alpha);
        }
      }

      if (ringRef.current) {
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
        <mesh position={[0, 0.88, 0]} geometry={NPC_HITBOX_GEOM} material={NPC_HITBOX_MAT} />

        {/* Cloned 3D Vietnamese Female Sales Assistant Character Rig */}
        {clonedCharacter && <primitive object={clonedCharacter} dispose={null} />}

        {/* Compact Floating Interactive Nameplate above NPC (Non-obstructive) */}
        <Billboard
          position={[NPC_NAMEPLATE_OFFSET[0], NPC_NAMEPLATE_OFFSET[1], NPC_NAMEPLATE_OFFSET[2]]}
          follow
        >
          <mesh
            geometry={NPC_BADGE_PLANE_GEOM}
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
            <meshBasicMaterial
              map={badgeTexture}
              transparent
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      </group>
    );
  }
);
