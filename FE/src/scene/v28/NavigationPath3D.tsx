import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GuidedRouteResult } from '../../services/v28NavigationEngine';

const CHEVRON_GEOM = new THREE.ConeGeometry(0.32, 0.72, 3);
CHEVRON_GEOM.rotateX(Math.PI / 2);

const CHEVRON_MAT = new THREE.MeshBasicMaterial({
  color: '#0ea5e9',
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});

const BEACON_RING_GEOM = new THREE.RingGeometry(0.65, 0.95, 28);
const BEACON_RING_MAT = new THREE.MeshBasicMaterial({
  color: '#f59e0b',
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export interface NavigationPath3DProps {
  route: Pick<GuidedRouteResult, 'waypoints'> | null;
}

/**
 * Lightweight 3D floor guided navigation chevrons & arrival beacon (Phase 2.3).
 * Follows `world.walkwayGraph` waypoints so arrows never cut through booths or obstacles.
 */
export const NavigationPath3D: React.FC<NavigationPath3DProps> = React.memo(({ route }) => {
  const beaconRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const chevrons = useMemo(() => {
    if (!route || route.waypoints.length < 2) return [];
    const pts: Array<{ x: number; z: number; rotY: number }> = [];
    const spacing = 3.6;
    let carry = 1.2;

    for (let i = 1; i < route.waypoints.length; i += 1) {
      const a = route.waypoints[i - 1];
      const b = route.waypoints[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const rotY = Math.atan2(dx, dz);
      let d = carry;
      while (d < len - 0.8) {
        const t = d / len;
        pts.push({ x: a.x + dx * t, z: a.z + dz * t, rotY });
        d += spacing;
      }
      carry = Math.max(0.6, d - len);
    }
    return pts.slice(0, 60); // bounded for performance
  }, [route]);

  const dest = route?.waypoints[route.waypoints.length - 1] || null;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (beaconRef.current) {
      const s = 1 + Math.sin(t * 4.2) * 0.14;
      beaconRef.current.scale.set(s, s, 1);
    }
    if (groupRef.current) {
      groupRef.current.position.y = 0.08 + Math.sin(t * 3.5) * 0.02;
    }
  });

  if (!route || chevrons.length === 0 || !dest) return null;

  return (
    <group name="V28GuidedNavigationPath">
      <group ref={groupRef} position={[0, 0.08, 0]}>
        {chevrons.map((c, idx) => (
          <mesh
            key={idx}
            position={[c.x, 0, c.z]}
            rotation={[0, c.rotY, 0]}
            geometry={CHEVRON_GEOM}
            material={CHEVRON_MAT}
          />
        ))}
      </group>
      <mesh
        ref={beaconRef}
        position={[dest.x, 0.05, dest.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={BEACON_RING_GEOM}
        material={BEACON_RING_MAT}
      />
    </group>
  );
});
