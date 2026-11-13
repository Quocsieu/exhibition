import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ArchitecturalBoothTheme } from './architecturalModels';

/** Roofless fallback for the Blender frame: vertical parts and sign brackets only. */
export function buildOpenExhibitionShell(theme: ArchitecturalBoothTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = `ExhibitionShell:${theme}`;
  const colors = { tech: '#354454', living: '#b8946a', coffee: '#70503b', robotics: '#424953', design: '#ded7d3', energy: '#d3ded8' };
  const body = new THREE.MeshStandardMaterial({ color: colors[theme], roughness: .6, metalness: theme === 'living' || theme === 'coffee' ? .02 : .45 });
  const metal = new THREE.MeshStandardMaterial({ color: '#a4adb2', roughness: .4, metalness: .75 });
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material = body) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, .008), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  for (const x of [-2.22, 2.22]) {
    box(x, 1.81, -1.65, .12, 2.98, .12);
    box(x, .35, -1.65, .3, .06, .3, metal);
    for (const y of [.52, 1.82, 3.14]) box(x, y, -1.57, .16, .12, .025, metal);
  }
  box(0, 3.27, -1.65, 4.56, .12, .12);
  for (const x of [-3.28, 3.28]) {
    box(x, 3.55, 2.67, .1, .1, 1.32, metal);
    box(x, 3.48, 3.3, .18, .24, .08);
    if (theme === 'design') {
      box(x, 1.89, 2.02, .12, 3.22, .12);
      box(x, .35, 2.02, .3, .06, .3, metal);
    }
  }
  // Distinct, restrained vertical infill. No geometry spans the product area overhead.
  const count = { tech: 2, living: 5, coffee: 6, robotics: 4, design: 1, energy: 8 }[theme];
  for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
    box(side * (1.85 + i * .04), 1.65, -1.75, theme === 'design' ? .24 : .035, 2.4 - i * .08, .06);
  }
  return group;
}
