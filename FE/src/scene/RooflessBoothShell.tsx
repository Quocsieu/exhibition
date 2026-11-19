import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ArchitecturalBoothTheme } from './architecturalModels';
import {
  DEFAULT_BOOTH_MODEL_VERSIONS,
  DEFAULT_KINETIX_BOOTH_VERSION,
  KINETIX_GLB_BY_VERSION,
  resolveBespokeBoothGlbSubpath,
  resolveBoothModelVersion,
  resolveKinetixBoothVersion,
  type BoothModelVersion,
  type KinetixBoothVersion,
} from './assetLoader';

export {
  DEFAULT_BOOTH_MODEL_VERSIONS,
  DEFAULT_KINETIX_BOOTH_VERSION,
  KINETIX_GLB_BY_VERSION,
  resolveBespokeBoothGlbSubpath,
  resolveBoothModelVersion,
  resolveKinetixBoothVersion,
  type BoothModelVersion,
  type KinetixBoothVersion,
};

interface Props {
  theme: ArchitecturalBoothTheme;
  fallback: THREE.Group;
  boothId?: string;
  isV2?: boolean;
  worldVersion?: 'v26' | 'v27_0' | 'v27';
}

class FrameBoundary extends React.Component<{ fallback: THREE.Group; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[roofless-booth] GLB unavailable; using roofless fallback', error.message); }
  render() {
    return this.state.failed ? <primitive object={this.props.fallback} dispose={null} /> : this.props.children;
  }
}

function LoadedFrame({ theme, fallback, isV2, worldVersion }: Props) {
  const boothVersion = resolveBoothModelVersion(theme, { worldVersion });
  const bespokeSubpath = isV2 ? resolveBespokeBoothGlbSubpath(theme, boothVersion) : null;
  const baseUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/';
  const glbUrl = bespokeSubpath
    ? `${baseUrl}${bespokeSubpath}`
    : `${baseUrl}models/booths/roofless-v1/${theme}.glb`;

  const { scene } = useGLTF(glbUrl);
  const frame = useMemo(() => {
    const clone = scene.clone(true);
    clone.name = isV2 ? `bespoke-booth-${boothVersion}:${theme}` : `roofless-glb:${theme}`;
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
    return clone;
  }, [scene, theme, isV2, boothVersion]);

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
  return <FrameBoundary key={`${props.theme}-${props.worldVersion ?? 'v26'}-${props.isV2 ? 'v2' : 'v1'}`} fallback={props.fallback}>
    <Suspense fallback={<primitive object={props.fallback} dispose={null} />}>
      <LoadedFrame {...props} />
    </Suspense>
  </FrameBoundary>;
}
