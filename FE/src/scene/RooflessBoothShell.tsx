import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ArchitecturalBoothTheme } from './architecturalModels';

interface Props { theme: ArchitecturalBoothTheme; fallback: THREE.Group; boothId?: string; isV2?: boolean }

const V2_GLB_MAP: Record<ArchitecturalBoothTheme, string> = {
  robotics: 'models/booths/kinetix-v2/kinetix_booth_v2.glb',
  tech: 'models/booths/v2/aether_tech_v2.glb',
  living: 'models/booths/v2/nordic_living_v2.glb',
  coffee: 'models/booths/v2/ecovita_coffee_v2.glb',
  design: 'models/booths/v2/lumina_design_v2.glb',
  energy: 'models/booths/v2/solaris_energy_v2.glb',
};

class FrameBoundary extends React.Component<{ fallback: THREE.Group; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[roofless-booth] GLB unavailable; using roofless fallback', error.message); }
  render() {
    return this.state.failed ? <primitive object={this.props.fallback} dispose={null} /> : this.props.children;
  }
}

function LoadedFrame({ theme, fallback, isV2 }: Props) {
  const glbUrl = isV2 && V2_GLB_MAP[theme]
    ? `${import.meta.env.BASE_URL}${V2_GLB_MAP[theme]}`
    : `${import.meta.env.BASE_URL}models/booths/roofless-v1/${theme}.glb`;

  const { scene } = useGLTF(glbUrl);
  const frame = useMemo(() => {
    const clone = scene.clone(true);
    clone.name = isV2 ? `bespoke-booth-v2:${theme}` : `roofless-glb:${theme}`;
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
    return clone;
  }, [scene, theme, isV2]);

  const floor = useMemo(() => {
    // If V2, the GLB already includes the bespoke granite plinth & composite deck.
    // So we don't render the procedural fallback floor at all to prevent duplicate floors/z-fighting!
    if (isV2) {
      return null;
    }
    const clone = fallback.clone(true);
    const proceduralFrame = clone.getObjectByName(`ExhibitionShell:${theme}`);
    if (proceduralFrame) clone.remove(proceduralFrame);
    return clone;
  }, [fallback, theme, isV2]);

  return (
    <group dispose={null}>
      {floor && <primitive object={floor} />}
      <primitive object={frame} />
    </group>
  );
}

export function RooflessBoothShell(props: Props) {
  return <FrameBoundary key={`${props.theme}-${props.isV2 ? 'v2' : 'v1'}`} fallback={props.fallback}>
    <Suspense fallback={<primitive object={props.fallback} dispose={null} />}>
      <LoadedFrame {...props} />
    </Suspense>
  </FrameBoundary>;
}
