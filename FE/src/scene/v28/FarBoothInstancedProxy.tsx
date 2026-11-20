import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { V28BoothPlacementView } from '../../services/v28Api';
import type { BoothLodTier } from './spatialStreaming';

interface FarBoothInstancedProxyProps {
  booths: readonly V28BoothPlacementView[];
  lodMap: Record<string, BoothLodTier>;
}

/**
 * Renders ALL Ring 2 (Far) booths using 2 InstancedMesh draw calls total
 * (base architectural plinth + brand-tinted silhouette canopy).
 */
export const FarBoothInstancedProxy: React.FC<FarBoothInstancedProxyProps> = React.memo(
  ({ booths, lodMap }) => {
    const farBooths = useMemo(
      () => booths.filter((b) => (lodMap[b.boothId] ?? 0) === 2),
      [booths, lodMap]
    );

    const baseRef = useRef<THREE.InstancedMesh>(null);
    const roofRef = useRef<THREE.InstancedMesh>(null);

    const baseGeom = useMemo(() => new THREE.BoxGeometry(1, 0.45, 1), []);
    const canopyGeom = useMemo(() => new THREE.BoxGeometry(1, 2.8, 1), []);
    const baseMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7, metalness: 0.1 }),
      []
    );
    const canopyMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.15 }),
      []
    );

    useEffect(() => {
      return () => {
        baseGeom.dispose();
        canopyGeom.dispose();
        baseMat.dispose();
        canopyMat.dispose();
      };
    }, [baseGeom, canopyGeom, baseMat, canopyMat]);

    useEffect(() => {
      if (!baseRef.current || !roofRef.current) return;
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();

      for (let i = 0; i < farBooths.length; i++) {
        const b = farBooths[i];
        dummy.position.set(b.positionX, 0.225, b.positionZ);
        dummy.rotation.set(0, b.rotationY, 0);
        dummy.scale.set(b.footprintWidth, 1, b.footprintDepth);
        dummy.updateMatrix();
        baseRef.current.setMatrixAt(i, dummy.matrix);

        dummy.position.set(b.positionX, 1.85, b.positionZ);
        dummy.scale.set(b.footprintWidth * 0.92, 1, b.footprintDepth * 0.88);
        dummy.updateMatrix();
        roofRef.current.setMatrixAt(i, dummy.matrix);

        color.set(b.color || '#0ea5e9');
        roofRef.current.setColorAt(i, color);
      }

      baseRef.current.count = farBooths.length;
      roofRef.current.count = farBooths.length;
      baseRef.current.instanceMatrix.needsUpdate = true;
      roofRef.current.instanceMatrix.needsUpdate = true;
      if (roofRef.current.instanceColor) {
        roofRef.current.instanceColor.needsUpdate = true;
      }
    }, [farBooths]);

    if (farBooths.length === 0) return null;

    return (
      <group name="V28FarBoothInstancedProxy">
        <instancedMesh
          ref={baseRef}
          args={[baseGeom, baseMat, Math.max(1, booths.length)]}
          frustumCulled={false}
          receiveShadow
        />
        <instancedMesh
          ref={roofRef}
          args={[canopyGeom, canopyMat, Math.max(1, booths.length)]}
          frustumCulled={false}
        />
      </group>
    );
  }
);
