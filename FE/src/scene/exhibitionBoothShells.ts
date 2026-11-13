import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ArchitecturalBoothTheme } from './architecturalModels';

/** Visual-only exhibition kit. Slots, signs, floor and interaction anchors live in Booth. */
export function buildOpenExhibitionShell(theme: ArchitecturalBoothTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = `ExhibitionShell:${theme}`;
  const warm = theme === 'living' || theme === 'coffee';
  const palette = {
    tech: ['#253548', '#38bdf8'], living: ['#bd966c', '#ede3d2'],
    coffee: ['#69442f', '#c99459'], robotics: ['#303545', '#a78bfa'],
    design: ['#f1e6e9', '#cf6caa'], energy: ['#e1eee9', '#52c9a4'],
  }[theme];
  const structure = new THREE.MeshStandardMaterial({ color: palette[0], roughness: warm ? .65 : .32, metalness: warm ? .04 : .65 });
  const accent = new THREE.MeshStandardMaterial({ color: palette[1], roughness: .35, metalness: warm ? .25 : .5 });
  const silver = new THREE.MeshStandardMaterial({ color: '#c4cdd4', roughness: .3, metalness: .8 });
  const lens = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#fff4dc', emissiveIntensity: .7 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const jointGeometry = new THREE.SphereGeometry(.07, 10, 6);
  const lampGeometry = new THREE.CylinderGeometry(.09, .09, .2, 16);
  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat = structure) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  function beam(a: number[], b: number[], radius = .04, mat = silver) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8), mat);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    mesh.castShadow = true; group.add(mesh);
  }
  // Rear supports stay inside the existing smallest collision rectangle (4.8 x 3.8).
  // Overhead ties reach the existing front sign, without moving its display plane.
  for (const x of [-2.22, 2.22]) {
    box(x, 1.95, -1.65, .16, 3.26, .16);
    box(x, .35, -1.65, .32, .06, .32, silver);
    for (const y of [.55, 3.35]) {
      box(x, y, -1.65, .21, .08, .21, silver);
      const joint = new THREE.Mesh(jointGeometry, accent); joint.position.set(x, y, -1.54); group.add(joint);
    }
    box(x, 3.61, .85, .13, .15, 5.15);
    beam([x, 2.9, -1.65], [x, 3.61, -.8], .035);
  }
  box(0, 3.61, -1.65, 6.4, .16, .16);
  // Product-focused fixtures: emissive lenses, no additional realtime lights.
  for (const x of [-2.22, -.85, .85, 2.22]) {
    box(x, 3.58, .1, .08, .25, .08, silver);
    const lamp = new THREE.Mesh(lampGeometry, structure); lamp.position.set(x, 3.4, .1); lamp.rotation.x = -.3; group.add(lamp);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.075, 16), lens);
    face.rotation.x = -Math.PI / 2 - .3; face.position.set(x, 3.29, .13); group.add(face);
  }
  box(0, 3.7, .1, 5.1, .06, .08, silver);

  if (theme === 'tech') {
    // Open twin halo rails and offset cyan circuit ribs, without a solid roof.
    for (const x of [-2.22, 2.22]) for (const z of [-1.4, 1.4]) box(x, 3.75, z, .1, .2, .1, silver);
    for (const z of [-1.4, 1.4]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(6.5, .18, .2, 2, .045), structure);
      rail.position.set(0, 3.88, z); group.add(rail);
      box(0, 3.86, z + .11, 5.9, .035, .025, accent);
    }
    for (const x of [-3.12, 3.12]) box(x, 3.88, 0, .18, .18, 2.8);
    for (let i = 0; i < 5; i++) box(-1.4 + i * .7, 3.91, -1, .08, .08, .8, accent);
  } else if (theme === 'living') {
    // Scandinavian pergola: widely spaced oak blades and short rear slatted wings.
    for (let i = 0; i < 9; i++) box(-2.8 + i * .7, 3.78, -.2, .09, .23, 3.1);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++)
      box(side * (1.8 + i * .12), 1.62, -1.78, .045, 2.5, .07);
    box(0, 3.78, 1.28, 6.25, .12, .12, accent);
  } else if (theme === 'coffee') {
    // Copper rails, a narrow woven canopy strip and warm timber end screens.
    for (const x of [-2.22, 2.22]) for (const z of [-1.5, 1.15]) box(x, 3.72, z, .08, .18, .08, accent);
    for (const z of [-1.5, 1.15]) beam([-3.1, 3.8, z], [3.1, 3.8, z], .065, accent);
    for (let i = 0; i < 15; i++) box(-2.8 + i * .4, 3.82, -.9, .18, .045, 1.05);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) box(side * 2.2, .65 + i * .34, -1.66, .4, .075, .12, accent);
      beam([side * 2.22, 3.6, -1.6], [side * 2.22, 3.8, 1.15], .035, accent);
    }
  } else if (theme === 'robotics') {
    // Bolted open triangular truss with alternating diagonal webs.
    for (const y of [3.6, 3.98]) beam([-3.15, y, 1.25], [3.15, y, 1.25], .055);
    for (let i = 0; i < 12; i++) beam([-3.15 + i * .525, i % 2 ? 3.98 : 3.6, 1.25], [-3.15 + (i + 1) * .525, i % 2 ? 3.6 : 3.98, 1.25], .027, accent);
    for (const x of [-2.22, 2.22]) {
      beam([x, 3.6, -1.65], [x, 3.98, 1.25], .055);
      for (let i = 0; i < 6; i++) box(x, .6 + i * .45, -1.55, .21, .045, .045, accent);
    }
  } else if (theme === 'design') {
    // Three sculptural ribbon arches, open between the ribs.
    for (let i = 0; i < 3; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.22, 3.58, -1.5 + i * .9), new THREE.Vector3(-1.3, 4.45, -1.5 + i * .9),
        new THREE.Vector3(1.1, 4.15, -1.5 + i * .9), new THREE.Vector3(2.22, 3.58, -1.5 + i * .9),
      ]);
      const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .09, 8, false), i === 1 ? accent : structure);
      ribbon.castShadow = true; group.add(ribbon);
    }
  } else {
    // Light photovoltaic exhibition fins; gaps leave the display open to daylight.
    // Mount the retained tilted solar display in Booth.tsx onto this new frame.
    for (const x of [-2.1, -.7, .7, 2.1]) {
      box(x, 4.05, .07, .055, .64, .055, silver);
      beam([x, 3.78, -.7], [x, 4.34, .07], .025, silver);
    }
    for (const x of [-2.22, 2.22]) box(x, 3.73, -.7, .1, .24, .1, silver);
    box(0, 3.78, -.7, 6.5, .1, .1, silver);
    const solar = new THREE.MeshStandardMaterial({ color: '#193a50', roughness: .28, metalness: .55 });
    for (let i = 0; i < 4; i++) {
      const x = -2.4 + i * 1.6;
      box(x, 3.85, -.7, 1.18, .08, 1.55, silver);
      box(x, 3.9, -.7, 1.08, .025, 1.45, solar);
      for (let j = 0; j < 4; j++) box(x, 3.92, -1.22 + j * .35, 1.05, .012, .012, silver);
      box(x, 3.84, .6, .07, .07, 1.2, accent);
    }
    box(0, 3.8, 1.3, 6.5, .1, .1, accent);
  }
  return group;
}
