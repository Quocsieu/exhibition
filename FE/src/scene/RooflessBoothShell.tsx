import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ArchitecturalBoothTheme } from './architecturalModels';

interface Props { theme: ArchitecturalBoothTheme; fallback: THREE.Group }

class FrameBoundary extends React.Component<{ fallback: THREE.Group; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[roofless-booth] GLB unavailable; using roofless fallback', error.message); }
  render() {
    return this.state.failed ? <primitive object={this.props.fallback} dispose={null} /> : this.props.children;
  }
}

function LoadedFrame({ theme, fallback }: Props) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/booths/roofless-v1/${theme}.glb`);
  const frame = useMemo(() => {
    const clone = scene.clone(true);
    clone.name = `roofless-glb:${theme}`;
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
    return clone;
  }, [scene, theme]);
  const floor = useMemo(() => {
    const clone = fallback.clone(true);
    const proceduralFrame = clone.getObjectByName(`ExhibitionShell:${theme}`);
    if (proceduralFrame) clone.remove(proceduralFrame);
    return clone;
  }, [fallback, theme]);
  // Retain the exact original floor; the loaded GLB replaces the procedural frame.
  // Drei's cache owns the shared GLB resources, as with the existing product assets.
  return <group dispose={null}><primitive object={floor} /><primitive object={frame} /></group>;
}

export function RooflessBoothShell(props: Props) {
  return <FrameBoundary key={props.theme} fallback={props.fallback}>
    <Suspense fallback={<primitive object={props.fallback} dispose={null} />}>
      <LoadedFrame {...props} />
    </Suspense>
  </FrameBoundary>;
}
