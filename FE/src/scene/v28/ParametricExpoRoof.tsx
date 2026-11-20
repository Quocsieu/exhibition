import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { V28ExhibitionVersionDetail } from '../../services/v28Api';
import type { V28CameraMode } from './DynamicExhibitionScene';

export interface ParametricRoofSpec {
  hallWidth: number;
  hallDepth: number;
  eaveHeight: number;
  roofRise: number;
  ribSpacing: number;
  skylightRatio: number;
  ribZPositions: number[];
  columnPositions: Array<{ x: number; z: number }>;
  purlinOffsets: Array<{ x: number; y: number }>;
}

/**
 * Pure parametric roof geometry planner — scales cleanly for 6..200+ booths
 * without distorting any static GLB model.
 */
export function computeParametricRoofSpec(
  roofBounds: V28ExhibitionVersionDetail['roofBounds']
): ParametricRoofSpec {
  const { hallWidth, hallDepth, eaveHeight, roofRise, ribSpacing, skylightRatio } = roofBounds;
  const halfW = hallWidth / 2;
  const halfD = hallDepth / 2;

  const ribCount = Math.max(3, Math.floor(hallDepth / Math.max(8, ribSpacing)) + 1);
  const actualSpacing = hallDepth / Math.max(1, ribCount - 1);
  const ribZPositions: number[] = [];
  const columnPositions: Array<{ x: number; z: number }> = [];

  for (let i = 0; i < ribCount; i++) {
    const z = -halfD + i * actualSpacing;
    ribZPositions.push(Math.round(z * 100) / 100);
    columnPositions.push({ x: -halfW + 0.5, z });
    columnPositions.push({ x: halfW - 0.5, z });
  }

  // 7 longitudinal purlins tracing the parabolic dome arch across X
  const purlinOffsets: Array<{ x: number; y: number }> = [];
  const purlinCount = 7;
  for (let i = 0; i < purlinCount; i++) {
    const t = -1 + (2 * i) / (purlinCount - 1); // -1..+1
    const x = t * (halfW - 0.8);
    const y = eaveHeight + roofRise * (1 - t * t);
    purlinOffsets.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }

  return {
    hallWidth,
    hallDepth,
    eaveHeight,
    roofRise,
    ribSpacing: actualSpacing,
    skylightRatio,
    ribZPositions,
    columnPositions,
    purlinOffsets,
  };
}

function buildArchRibGeometry(hallWidth: number, eaveHeight: number, roofRise: number): THREE.BufferGeometry {
  const halfW = hallWidth / 2 - 0.5;
  const pts: THREE.Vector3[] = [];
  const segments = 20;
  for (let i = 0; i <= segments; i++) {
    const t = -1 + (2 * i) / segments;
    const x = t * halfW;
    const y = eaveHeight + roofRise * (1 - t * t);
    pts.push(new THREE.Vector3(x, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 24, 0.28, 6, false);
}

function buildCurvedRoofShellGeometry(
  hallWidth: number,
  hallDepth: number,
  eaveHeight: number,
  roofRise: number,
  xFracStart: number,
  xFracEnd: number
): THREE.BufferGeometry {
  const halfW = hallWidth / 2 - 0.4;
  const halfD = hallDepth / 2;
  const segX = 8;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ix = 0; ix <= segX; ix++) {
    const u = xFracStart + (xFracEnd - xFracStart) * (ix / segX); // -1..+1
    const x = u * halfW;
    const y = eaveHeight + roofRise * (1 - u * u) + 0.18;
    positions.push(x, y, -halfD);
    positions.push(x, y, halfD);
  }
  for (let ix = 0; ix < segX; ix++) {
    const a = ix * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export interface ParametricExpoRoofProps {
  roofBounds: V28ExhibitionVersionDetail['roofBounds'];
  cameraMode: V28CameraMode;
  isMobilePortrait: boolean;
}

/**
 * Modular Parametric Architectural Dome Roof with smooth Roof Cutaway:
 * - Overview: cuts away roof canopy & overhead ribs so camera has 100% clear view of all booths.
 * - Explore / Focus: renders full bright architectural dome with steel arch ribs, purlins, skylights & entrance facade.
 * - Mobile Portrait: hides translucent canopy panels for maximum GPU headroom while retaining steel structure.
 */
export const ParametricExpoRoof: React.FC<ParametricExpoRoofProps> = React.memo(
  ({ roofBounds, cameraMode, isMobilePortrait }) => {
    const spec = useMemo(() => computeParametricRoofSpec(roofBounds), [roofBounds]);

    const colRef = useRef<THREE.InstancedMesh>(null);
    const ribRef = useRef<THREE.InstancedMesh>(null);
    const purlinRef = useRef<THREE.InstancedMesh>(null);

    const colGeom = useMemo(() => new THREE.BoxGeometry(0.65, spec.eaveHeight, 0.65), [spec.eaveHeight]);
    const ribGeom = useMemo(
      () => buildArchRibGeometry(spec.hallWidth, spec.eaveHeight, spec.roofRise),
      [spec.hallWidth, spec.eaveHeight, spec.roofRise]
    );
    const purlinGeom = useMemo(() => new THREE.BoxGeometry(0.24, 0.24, spec.hallDepth), [spec.hallDepth]);

    // 3 roof canopy strips: West solid bright panel, Center skylight, East solid bright panel
    const westCanopyGeom = useMemo(
      () => buildCurvedRoofShellGeometry(spec.hallWidth, spec.hallDepth, spec.eaveHeight, spec.roofRise, -1, -0.28),
      [spec]
    );
    const eastCanopyGeom = useMemo(
      () => buildCurvedRoofShellGeometry(spec.hallWidth, spec.hallDepth, spec.eaveHeight, spec.roofRise, 0.28, 1),
      [spec]
    );
    const skylightGeom = useMemo(
      () => buildCurvedRoofShellGeometry(spec.hallWidth, spec.hallDepth, spec.eaveHeight, spec.roofRise, -0.28, 0.28),
      [spec]
    );

    const steelMat = useMemo(
      () => new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.35, metalness: 0.65 }),
      []
    );
    const canopyMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: '#f8fafc',
          roughness: 0.55,
          metalness: 0.08,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
        }),
      []
    );
    const skylightMat = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: '#bae6fd',
          roughness: 0.2,
          metalness: 0.1,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.26,
        }),
      []
    );

    useEffect(() => {
      return () => {
        colGeom.dispose();
        ribGeom.dispose();
        purlinGeom.dispose();
        westCanopyGeom.dispose();
        eastCanopyGeom.dispose();
        skylightGeom.dispose();
        steelMat.dispose();
        canopyMat.dispose();
        skylightMat.dispose();
      };
    }, [colGeom, ribGeom, purlinGeom, westCanopyGeom, eastCanopyGeom, skylightGeom, steelMat, canopyMat, skylightMat]);

    // Populate InstancedMeshes
    useEffect(() => {
      const dummy = new THREE.Object3D();

      if (colRef.current) {
        spec.columnPositions.forEach((c, idx) => {
          dummy.position.set(c.x, spec.eaveHeight / 2, c.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          colRef.current!.setMatrixAt(idx, dummy.matrix);
        });
        colRef.current.instanceMatrix.needsUpdate = true;
      }

      if (ribRef.current) {
        spec.ribZPositions.forEach((z, idx) => {
          dummy.position.set(0, 0, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          ribRef.current!.setMatrixAt(idx, dummy.matrix);
        });
        ribRef.current.instanceMatrix.needsUpdate = true;
      }

      if (purlinRef.current) {
        spec.purlinOffsets.forEach((p, idx) => {
          dummy.position.set(p.x, p.y, 0);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          purlinRef.current!.setMatrixAt(idx, dummy.matrix);
        });
        purlinRef.current.instanceMatrix.needsUpdate = true;
      }
    }, [spec]);

    // Roof Cutaway state: hide overhead structure in Overview so camera never gets occluded
    const showOverheadStructure = cameraMode !== 'overview';
    const showCanopyPanels = showOverheadStructure && !isMobilePortrait;

    return (
      <group name="V28ParametricExpoRoof">
        {/* Perimeter Columns (always visible — anchors hall silhouette even in Overview cutaway) */}
        <instancedMesh
          ref={colRef}
          args={[colGeom, steelMat, spec.columnPositions.length]}
          frustumCulled={false}
        />

        {/* Perimeter Side Eave Beams + End Portal Arch Ribs (visible in Overview to frame the dome cleanly without occluding booths!) */}
        <mesh position={[-spec.hallWidth / 2 + 0.5, spec.eaveHeight, 0]} material={steelMat}>
          <boxGeometry args={[0.45, 0.55, spec.hallDepth]} />
        </mesh>
        <mesh position={[spec.hallWidth / 2 - 0.5, spec.eaveHeight, 0]} material={steelMat}>
          <boxGeometry args={[0.45, 0.55, spec.hallDepth]} />
        </mesh>
        <mesh position={[0, 0, -spec.hallDepth / 2]} geometry={ribGeom} material={steelMat} />
        <mesh position={[0, 0, spec.hallDepth / 2]} geometry={ribGeom} material={steelMat} />

        {/* Interior Overhead Structural Arch Ribs + Longitudinal Purlins (cut away cleanly in Overview) */}
        <group visible={showOverheadStructure}>
          <instancedMesh
            ref={ribRef}
            args={[ribGeom, steelMat, spec.ribZPositions.length]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={purlinRef}
            args={[purlinGeom, steelMat, spec.purlinOffsets.length]}
            frustumCulled={false}
          />
        </group>

        {/* Bright Translucent Skylight + Architectural Roof Canopy Panels */}
        <group visible={showCanopyPanels}>
          <mesh geometry={westCanopyGeom} material={canopyMat} />
          <mesh geometry={eastCanopyGeom} material={canopyMat} />
          <mesh geometry={skylightGeom} material={skylightMat} />
        </group>

        {/* South Entrance Facade Portal */}
        <group position={[0, 0, spec.hallDepth / 2]}>
          <mesh position={[-6.2, spec.eaveHeight * 0.42, 0]} material={steelMat}>
            <boxGeometry args={[0.9, spec.eaveHeight * 0.84, 0.9]} />
          </mesh>
          <mesh position={[6.2, spec.eaveHeight * 0.42, 0]} material={steelMat}>
            <boxGeometry args={[0.9, spec.eaveHeight * 0.84, 0.9]} />
          </mesh>
          <mesh position={[0, spec.eaveHeight * 0.84, 0]}>
            <boxGeometry args={[13.6, 1.1, 1.1]} />
            <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.5} />
          </mesh>
        </group>
      </group>
    );
  }
);
