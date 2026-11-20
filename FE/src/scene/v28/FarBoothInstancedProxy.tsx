import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { V28BoothPlacementView } from '../../services/v28Api';
import type { BoothLodTier } from './spatialStreaming';

interface FarBoothInstancedProxyProps {
  booths: readonly V28BoothPlacementView[];
  lodMap: Record<string, BoothLodTier>;
}

/**
 * Renders ALL Ring 2 (Far) booths as recognizable 6-part open-front architectural pavilions
 * using only 6 InstancedMesh draw calls total (plinth, back wall, brand fascia header,
 * left & right portal columns, and interior display counter) — ZERO solid colored cubes!
 */
export const FarBoothInstancedProxy: React.FC<FarBoothInstancedProxyProps> = React.memo(
  ({ booths, lodMap }) => {
    const farBooths = useMemo(
      () => booths.filter((b) => (lodMap[b.boothId] ?? 0) === 2),
      [booths, lodMap]
    );

    const plinthRef = useRef<THREE.InstancedMesh>(null);
    const backWallRef = useRef<THREE.InstancedMesh>(null);
    const fasciaRef = useRef<THREE.InstancedMesh>(null);
    const leftColRef = useRef<THREE.InstancedMesh>(null);
    const rightColRef = useRef<THREE.InstancedMesh>(null);
    const counterRef = useRef<THREE.InstancedMesh>(null);

    const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
    const plinthMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.65, metalness: 0.08 }),
      []
    );
    const wallMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.55, metalness: 0.05 }),
      []
    );
    const fasciaMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.2 }),
      []
    );
    const frameMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4, metalness: 0.55 }),
      []
    );
    const counterMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.45, metalness: 0.15 }),
      []
    );

    useEffect(() => {
      return () => {
        unitBox.dispose();
        plinthMat.dispose();
        wallMat.dispose();
        fasciaMat.dispose();
        frameMat.dispose();
        counterMat.dispose();
      };
    }, [unitBox, plinthMat, wallMat, fasciaMat, frameMat, counterMat]);

    useEffect(() => {
      if (
        !plinthRef.current ||
        !backWallRef.current ||
        !fasciaRef.current ||
        !leftColRef.current ||
        !rightColRef.current ||
        !counterRef.current
      ) {
        return;
      }

      const boothMat4 = new THREE.Matrix4();
      const localMat4 = new THREE.Matrix4();
      const finalMat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();

      const setLocalPart = (
        mesh: THREE.InstancedMesh,
        index: number,
        lx: number,
        ly: number,
        lz: number,
        sx: number,
        sy: number,
        sz: number
      ) => {
        pos.set(lx, ly, lz);
        quat.identity();
        scale.set(sx, sy, sz);
        localMat4.compose(pos, quat, scale);
        finalMat4.multiplyMatrices(boothMat4, localMat4);
        mesh.setMatrixAt(index, finalMat4);
      };

      for (let i = 0; i < farBooths.length; i++) {
        const b = farBooths[i];
        const w = b.footprintWidth;
        const d = b.footprintDepth;

        pos.set(b.positionX, 0, b.positionZ);
        quat.setFromAxisAngle(yAxis, b.rotationY);
        scale.set(1, 1, 1);
        boothMat4.compose(pos, quat, scale);

        // 1. Floor Plinth
        setLocalPart(plinthRef.current, i, 0, 0.14, 0, w, 0.28, d);

        // 2. Back Architectural Wall (at local -Z, facing open +Z front)
        setLocalPart(backWallRef.current, i, 0, 1.75, -d / 2 + 0.22, w * 0.96, 3.0, 0.28);

        // 3. Brand-Colored Roof Fascia / Portal Beam spanning front & top
        setLocalPart(fasciaRef.current, i, 0, 3.35, d / 2 - 0.55, w * 0.98, 0.58, 1.1);
        color.set(b.color || '#0ea5e9');
        fasciaRef.current.setColorAt(i, color);

        // 4. Left & Right Front Portal Columns
        setLocalPart(leftColRef.current, i, -w / 2 + 0.24, 1.72, d / 2 - 0.26, 0.34, 3.15, 0.34);
        setLocalPart(rightColRef.current, i, w / 2 - 0.24, 1.72, d / 2 - 0.26, 0.34, 3.15, 0.34);

        // 5. Open-Front Interior Showcase Counter
        setLocalPart(counterRef.current, i, 0, 0.72, 0.25, w * 0.44, 0.9, 0.95);
      }

      const meshes = [
        plinthRef.current,
        backWallRef.current,
        fasciaRef.current,
        leftColRef.current,
        rightColRef.current,
        counterRef.current,
      ];
      for (const m of meshes) {
        m.count = farBooths.length;
        m.instanceMatrix.needsUpdate = true;
      }
      if (fasciaRef.current.instanceColor) {
        fasciaRef.current.instanceColor.needsUpdate = true;
      }
    }, [farBooths]);

    if (farBooths.length === 0) return null;

    const capacity = Math.max(1, booths.length);

    return (
      <group name="V28FarBoothInstancedProxy">
        <instancedMesh ref={plinthRef} args={[unitBox, plinthMat, capacity]} frustumCulled={false} receiveShadow />
        <instancedMesh ref={backWallRef} args={[unitBox, wallMat, capacity]} frustumCulled={false} castShadow />
        <instancedMesh ref={fasciaRef} args={[unitBox, fasciaMat, capacity]} frustumCulled={false} castShadow />
        <instancedMesh ref={leftColRef} args={[unitBox, frameMat, capacity]} frustumCulled={false} />
        <instancedMesh ref={rightColRef} args={[unitBox, frameMat, capacity]} frustumCulled={false} />
        <instancedMesh ref={counterRef} args={[unitBox, counterMat, capacity]} frustumCulled={false} />
      </group>
    );
  }
);
