import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Bakes vertical + radial Ambient Occlusion (AO) into a BufferGeometry's `color` attribute
 * so crevices, lower bases, and interior recesses naturally self-shadow under PBR lighting.
 */
export function bakeVertexAO(
  geometry: THREE.BufferGeometry,
  options: {
    minY: number;
    maxY: number;
    bottomColor: string;
    topColor: string;
    radialDarken?: number;
  }
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos) return geometry;

  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const cBottom = new THREE.Color(options.bottomColor);
  const cTop = new THREE.Color(options.topColor);
  const cTemp = new THREE.Color();
  const spanY = Math.max(0.001, options.maxY - options.minY);
  const radialFactor = options.radialDarken ?? 0;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let t = THREE.MathUtils.clamp((y - options.minY) / spanY, 0, 1);
    if (radialFactor > 0) {
      const r = Math.hypot(x, z);
      t = THREE.MathUtils.clamp(t * (1 - radialFactor * 0.25) + r * radialFactor * 0.08, 0, 1);
    }
    cTemp.copy(cBottom).lerp(cTop, t);
    colors[i * 3] = cTemp.r;
    colors[i * 3 + 1] = cTemp.g;
    colors[i * 3 + 2] = cTemp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Displaces an IcosahedronGeometry organically along vertex normals to create
 * natural, soft, botanical foliage cloud clusters (zero crude low-poly blocks).
 */
function createOrganicFoliageClusterGeometry(
  radius: number,
  seed: number,
  verticalSquash = 0.82
): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const nz = vz / len;

    // Smooth multi-frequency organic canopy ripple
    const wave =
      Math.sin(nx * 4.2 + seed) * 0.09 +
      Math.cos(nz * 3.7 - seed * 0.7) * 0.08 +
      Math.sin((nx + ny + nz) * 5.5 + seed * 1.3) * 0.05;

    const r = radius * (1 + wave);
    pos.setXYZ(i, nx * r, ny * r * verticalSquash, nz * r);
  }

  geom.computeVertexNormals();
  bakeVertexAO(geom, {
    minY: -radius * verticalSquash,
    maxY: radius * verticalSquash,
    bottomColor: '#789c7e',
    topColor: '#ffffff',
    radialDarken: 0.2,
  });
  return geom;
}

// ============================================================================
// 1. LANDSCAPE & STREETSCAPE 3D ASSET BUILDERS
// ============================================================================

/**
 * Builds an organic Deciduous Oak Tree (`env-tree-oak.glb`) with a curved,
 * root-flared trunk and 4 branching boughs (`TubeGeometry` along 3D splines)
 * crowned by 7 overlapping high-subdivision vertex-AO foliage clusters.
 */
export function buildOakTreeModel(variant: 'emerald' | 'blossom' = 'emerald'): THREE.Group {
  const group = new THREE.Group();
  group.name = variant === 'blossom' ? 'EnvTreeBlossom' : 'EnvTreeOak';

  const barkMat = new THREE.MeshStandardMaterial({
    color: '#6b4423',
    roughness: 0.88,
    metalness: 0.04,
    vertexColors: true,
  });

  const foliagePrimaryMat = new THREE.MeshStandardMaterial({
    color: variant === 'blossom' ? '#f472b6' : '#16a34a',
    roughness: 0.72,
    metalness: 0.02,
    vertexColors: true,
  });

  const foliageSecondaryMat = new THREE.MeshStandardMaterial({
    color: variant === 'blossom' ? '#fbcfe8' : '#22c55e',
    roughness: 0.68,
    metalness: 0.02,
    vertexColors: true,
  });

  // Tapered Root-Flared Main Trunk (LatheGeometry with organic profile)
  const trunkProfile = [
    new THREE.Vector2(0.34, 0.0),
    new THREE.Vector2(0.24, 0.25),
    new THREE.Vector2(0.19, 0.75),
    new THREE.Vector2(0.16, 1.35),
    new THREE.Vector2(0.12, 1.95),
    new THREE.Vector2(0.06, 2.35),
  ];
  const trunkGeom = bakeVertexAO(new THREE.LatheGeometry(trunkProfile, 12), {
    minY: 0,
    maxY: 2.35,
    bottomColor: '#7c6f64',
    topColor: '#ffffff',
  });
  const trunkMesh = new THREE.Mesh(trunkGeom, barkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  // 4 Curved Branching Limbs (TubeGeometry along 3D CatmullRom splines)
  const branchSpecs: [number, number, number][][] = [
    [
      [0, 1.35, 0],
      [-0.36, 1.72, 0.24],
      [-0.78, 2.15, 0.45],
    ],
    [
      [0, 1.42, 0],
      [0.42, 1.82, 0.18],
      [0.82, 2.22, 0.36],
    ],
    [
      [0, 1.48, 0],
      [0.14, 1.88, -0.42],
      [0.28, 2.26, -0.78],
    ],
    [
      [0, 1.55, 0],
      [-0.32, 1.92, -0.34],
      [-0.62, 2.32, -0.62],
    ],
  ];

  branchSpecs.forEach((pts, idx) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const bGeom = bakeVertexAO(new THREE.TubeGeometry(curve, 8, 0.075 - idx * 0.006, 8, false), {
      minY: 1.3,
      maxY: 2.4,
      bottomColor: '#8c7a6b',
      topColor: '#ffffff',
    });
    const bMesh = new THREE.Mesh(bGeom, barkMat);
    bMesh.castShadow = true;
    group.add(bMesh);
  });

  // 7 Overlapping Sculpted Foliage Cloud Clusters
  const clusters: { pos: [number, number, number]; r: number; secondary?: boolean }[] = [
    { pos: [0, 2.85, 0], r: 0.92 },
    { pos: [-0.74, 2.35, 0.42], r: 0.68, secondary: true },
    { pos: [0.78, 2.42, 0.34], r: 0.66 },
    { pos: [0.26, 2.45, -0.72], r: 0.65, secondary: true },
    { pos: [-0.58, 2.48, -0.56], r: 0.64 },
    { pos: [-0.32, 3.18, -0.18], r: 0.62, secondary: true },
    { pos: [0.38, 3.12, 0.24], r: 0.58, secondary: true },
  ];

  clusters.forEach((c, idx) => {
    const cGeom = createOrganicFoliageClusterGeometry(c.r, idx * 1.7 + 0.5, 0.84);
    const cMesh = new THREE.Mesh(
      cGeom,
      c.secondary ? foliageSecondaryMat : foliagePrimaryMat
    );
    cMesh.position.set(c.pos[0], c.pos[1], c.pos[2]);
    cMesh.castShadow = true;
    cMesh.receiveShadow = true;
    group.add(cMesh);
  });

  return group;
}

/**
 * Builds a Stylized Layered Cypress / Alpine Pine Tree (`env-tree-pine.glb`)
 * with 5 scalloped conical foliage tiers (`LatheGeometry`) and baked vertex AO.
 */
export function buildPineTreeModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'EnvTreePine';

  const barkMat = new THREE.MeshStandardMaterial({
    color: '#5c3a21',
    roughness: 0.88,
    metalness: 0.04,
  });

  const pineMat = new THREE.MeshStandardMaterial({
    color: '#0d9488',
    roughness: 0.72,
    metalness: 0.04,
    vertexColors: true,
  });

  const trunkProfile = [
    new THREE.Vector2(0.26, 0.0),
    new THREE.Vector2(0.18, 0.35),
    new THREE.Vector2(0.13, 1.4),
    new THREE.Vector2(0.06, 2.8),
  ];
  const trunkMesh = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 10), barkMat);
  trunkMesh.castShadow = true;
  group.add(trunkMesh);

  // 5 Scalloped Conical Pine Tiers using LatheGeometry with curved bell flares
  const tiers = [
    { y: 1.05, rBottom: 1.12, rMid: 0.68, rTop: 0.18, h: 0.95 },
    { y: 1.65, rBottom: 0.96, rMid: 0.56, rTop: 0.15, h: 0.88 },
    { y: 2.22, rBottom: 0.78, rMid: 0.44, rTop: 0.12, h: 0.82 },
    { y: 2.75, rBottom: 0.58, rMid: 0.32, rTop: 0.08, h: 0.74 },
    { y: 3.22, rBottom: 0.38, rMid: 0.18, rTop: 0.0, h: 0.68 },
  ];

  tiers.forEach((t, idx) => {
    const profile = [
      new THREE.Vector2(0.05, 0),
      new THREE.Vector2(t.rBottom, 0.08),
      new THREE.Vector2(t.rMid, t.h * 0.48),
      new THREE.Vector2(t.rTop, t.h),
    ];
    const tierGeom = new THREE.LatheGeometry(profile, 11);
    bakeVertexAO(tierGeom, {
      minY: 0,
      maxY: t.h,
      bottomColor: '#065f46',
      topColor: idx >= 3 ? '#5eead4' : '#2dd4bf',
    });
    const tierMesh = new THREE.Mesh(tierGeom, pineMat);
    tierMesh.position.y = t.y;
    tierMesh.rotation.y = idx * 0.45;
    tierMesh.castShadow = true;
    tierMesh.receiveShadow = true;
    group.add(tierMesh);
  });

  return group;
}

/**
 * Builds an Architectural Swan-Neck Boulevard Street Lamp (`env-street-lamp.glb`)
 * with fluted cast-iron base, curved swan-neck arm (`TubeGeometry`), decorative scroll brace,
 * bronze bell reflector hood (`LatheGeometry`), and glowing warm glass diffuser globe.
 */
export function buildStreetLampModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'EnvStreetLamp';

  const castIronMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.38,
    metalness: 0.78,
  });

  const brassAccentMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.28,
    metalness: 0.85,
  });

  const bulbGlowMat = new THREE.MeshStandardMaterial({
    color: '#fef3c7',
    emissive: '#f59e0b',
    emissiveIntensity: 1.35,
    roughness: 0.15,
  });

  // Fluted Molded Cast-Iron Pedestal Base + Tapered Post (LatheGeometry)
  const postProfile = [
    new THREE.Vector2(0.28, 0.0),
    new THREE.Vector2(0.28, 0.12),
    new THREE.Vector2(0.21, 0.18),
    new THREE.Vector2(0.22, 0.48),
    new THREE.Vector2(0.15, 0.56),
    new THREE.Vector2(0.11, 0.95),
    new THREE.Vector2(0.085, 2.65),
    new THREE.Vector2(0.12, 2.72),
    new THREE.Vector2(0.075, 2.82),
  ];
  const postMesh = new THREE.Mesh(new THREE.LatheGeometry(postProfile, 14), castIronMat);
  postMesh.castShadow = true;
  postMesh.receiveShadow = true;
  group.add(postMesh);

  // Brass Ornamental Collar Ring
  const collarMesh = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 10, 18), brassAccentMat);
  collarMesh.position.y = 2.72;
  collarMesh.rotation.x = Math.PI / 2;
  group.add(collarMesh);

  // Graceful Swan-Neck Bracket Arm (TubeGeometry along 3D Curve)
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.78, 0),
    new THREE.Vector3(0, 3.22, 0.12),
    new THREE.Vector3(0, 3.48, 0.42),
    new THREE.Vector3(0, 3.36, 0.68),
    new THREE.Vector3(0, 3.18, 0.74),
  ]);
  const armMesh = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 16, 0.042, 10, false), castIronMat);
  armMesh.castShadow = true;
  group.add(armMesh);

  // Decorative Scroll Brace Under Arm
  const scrollCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.38, 0.04),
    new THREE.Vector3(0, 2.68, 0.28),
    new THREE.Vector3(0, 2.98, 0.22),
    new THREE.Vector3(0, 3.28, 0.42),
  ]);
  const scrollMesh = new THREE.Mesh(
    new THREE.TubeGeometry(scrollCurve, 12, 0.022, 8, false),
    brassAccentMat
  );
  group.add(scrollMesh);

  // Bell-Shaped Lantern Reflector Hood (LatheGeometry)
  const hoodProfile = [
    new THREE.Vector2(0.02, 0.22),
    new THREE.Vector2(0.08, 0.16),
    new THREE.Vector2(0.18, 0.08),
    new THREE.Vector2(0.28, 0.0),
    new THREE.Vector2(0.24, -0.02),
  ];
  const hoodMesh = new THREE.Mesh(new THREE.LatheGeometry(hoodProfile, 16), castIronMat);
  hoodMesh.position.set(0, 3.08, 0.74);
  group.add(hoodMesh);

  // Glowing Teardrop Lantern Diffuser Globe (LatheGeometry)
  const globeProfile = [
    new THREE.Vector2(0.01, -0.24),
    new THREE.Vector2(0.11, -0.18),
    new THREE.Vector2(0.16, -0.06),
    new THREE.Vector2(0.15, 0.04),
  ];
  const globeMesh = new THREE.Mesh(new THREE.LatheGeometry(globeProfile, 16), bulbGlowMat);
  globeMesh.position.set(0, 3.06, 0.74);
  group.add(globeMesh);

  return group;
}

/**
 * Builds an Ergonomic Contoured Slat Park Bench (`env-park-bench.glb`)
 * with 7 chamfered teak wood slats along a lumbar curve and scrolled cast-iron armrests.
 */
export function buildParkBenchModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'EnvParkBench';

  const teakWoodMat = new THREE.MeshStandardMaterial({
    color: '#b45309',
    roughness: 0.58,
    metalness: 0.06,
  });

  const castIronMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.42,
    metalness: 0.76,
  });

  const slatGeom = new RoundedBoxGeometry(1.52, 0.045, 0.095, 2, 0.012);

  // 4 Contoured Seat Slats + 3 Ergonomic Backrest Slats
  const slatTransforms: { y: number; z: number; rx: number }[] = [
    { y: 0.41, z: 0.18, rx: 0.08 },
    { y: 0.395, z: 0.07, rx: 0.02 },
    { y: 0.395, z: -0.04, rx: -0.04 },
    { y: 0.41, z: -0.15, rx: -0.12 },
    { y: 0.54, z: -0.22, rx: 1.28 },
    { y: 0.66, z: -0.26, rx: 1.32 },
    { y: 0.78, z: -0.31, rx: 1.36 },
  ];

  slatTransforms.forEach((st) => {
    const slat = new THREE.Mesh(slatGeom, teakWoodMat);
    slat.position.set(0, st.y, st.z);
    slat.rotation.x = st.rx;
    slat.castShadow = true;
    slat.receiveShadow = true;
    group.add(slat);
  });

  // 2 Ornate Curved Cast-Iron Frame Sides & Armrests (TubeGeometry)
  const frameCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0, 0.22),
    new THREE.Vector3(0, 0.39, 0.18),
    new THREE.Vector3(0, 0.39, -0.18),
    new THREE.Vector3(0, 0.82, -0.32),
    new THREE.Vector3(0, 0.0, -0.24),
  ]);
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.39, 0.21),
    new THREE.Vector3(0, 0.58, 0.18),
    new THREE.Vector3(0, 0.61, -0.04),
    new THREE.Vector3(0, 0.58, -0.24),
  ]);

  const frameGeom = new THREE.TubeGeometry(frameCurve, 20, 0.036, 8, false);
  const armGeom = new THREE.TubeGeometry(armCurve, 14, 0.032, 8, false);

  for (const sideX of [-0.66, 0.66]) {
    const frameMesh = new THREE.Mesh(frameGeom, castIronMat);
    frameMesh.position.x = sideX;
    frameMesh.castShadow = true;
    group.add(frameMesh);

    const armMesh = new THREE.Mesh(armGeom, castIronMat);
    armMesh.position.x = sideX;
    armMesh.castShadow = true;
    group.add(armMesh);
  }

  return group;
}

/**
 * Builds an Architectural Fluted Stone Planter Urn & Topiary Shrub (`env-planter-urn.glb`).
 */
export function buildPlanterUrnModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'EnvPlanterUrn';

  const stoneUrnMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.65,
    metalness: 0.08,
    vertexColors: true,
  });

  const soilMat = new THREE.MeshStandardMaterial({
    color: '#451a03',
    roughness: 0.92,
  });

  const shrubMat = new THREE.MeshStandardMaterial({
    color: '#15803d',
    roughness: 0.7,
    vertexColors: true,
  });

  const flowerGoldMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    emissive: '#d97706',
    emissiveIntensity: 0.2,
    roughness: 0.45,
  });

  const urnProfile = [
    new THREE.Vector2(0.32, 0.0),
    new THREE.Vector2(0.34, 0.08),
    new THREE.Vector2(0.22, 0.16),
    new THREE.Vector2(0.26, 0.34),
    new THREE.Vector2(0.44, 0.56),
    new THREE.Vector2(0.48, 0.68),
    new THREE.Vector2(0.41, 0.72),
  ];
  const urnGeom = bakeVertexAO(new THREE.LatheGeometry(urnProfile, 16), {
    minY: 0,
    maxY: 0.72,
    bottomColor: '#94a3b8',
    topColor: '#ffffff',
  });
  const urnMesh = new THREE.Mesh(urnGeom, stoneUrnMat);
  urnMesh.castShadow = true;
  urnMesh.receiveShadow = true;
  group.add(urnMesh);

  const soilMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.08, 14), soilMat);
  soilMesh.position.y = 0.66;
  group.add(soilMesh);

  const topiaryGeom = createOrganicFoliageClusterGeometry(0.44, 3.1, 0.92);
  const topiaryMesh = new THREE.Mesh(topiaryGeom, shrubMat);
  topiaryMesh.position.y = 0.98;
  topiaryMesh.castShadow = true;
  group.add(topiaryMesh);

  const blossomOffsets: [number, number, number][] = [
    [0.24, 1.12, 0.18],
    [-0.22, 1.08, 0.22],
    [0.12, 1.24, -0.22],
    [-0.18, 1.18, -0.16],
  ];
  const blossomGeom = new THREE.DodecahedronGeometry(0.09, 1);
  blossomOffsets.forEach(([bx, by, bz]) => {
    const b = new THREE.Mesh(blossomGeom, flowerGoldMat);
    b.position.set(bx, by, bz);
    group.add(b);
  });

  return group;
}

// ============================================================================
// 2. SIX BESPOKE ARCHITECTURAL BOOTH EXTERIOR SHELL BUILDERS (`booth-*.glb`)
// ============================================================================

export type ArchitecturalBoothTheme =
  | 'tech'
  | 'living'
  | 'coffee'
  | 'robotics'
  | 'design'
  | 'energy';

/**
 * Helper to create a stepped chamfered stone & architectural foundation plinth
 * with molded steps at the front (`+Z`) entrance.
 */
function addArchitecturalFoundationPlinth(
  group: THREE.Group,
  plinthColor: string,
  trimColor: string,
  floorColor: string
) {
  const plinthMat = new THREE.MeshStandardMaterial({
    color: plinthColor,
    roughness: 0.55,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.35,
    metalness: 0.45,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.42,
    metalness: 0.08,
  });

  const mainPlinth = new THREE.Mesh(
    new RoundedBoxGeometry(7.2, 0.28, 5.4, 3, 0.05),
    plinthMat
  );
  mainPlinth.position.set(0, 0.14, 0);
  mainPlinth.receiveShadow = true;
  group.add(mainPlinth);

  const innerFloor = new THREE.Mesh(
    new RoundedBoxGeometry(6.7, 0.06, 4.9, 2, 0.02),
    floorMat
  );
  innerFloor.position.set(0, 0.29, 0.05);
  innerFloor.receiveShadow = true;
  group.add(innerFloor);

  // Two-stepped architectural entrance terrace at +Z
  const step1 = new THREE.Mesh(new RoundedBoxGeometry(5.6, 0.18, 0.56, 2, 0.03), plinthMat);
  step1.position.set(0, 0.09, 2.86);
  step1.receiveShadow = true;
  group.add(step1);

  const stepTrim = new THREE.Mesh(new RoundedBoxGeometry(5.66, 0.04, 0.6, 2, 0.01), trimMat);
  stepTrim.position.set(0, 0.19, 2.86);
  group.add(stepTrim);
}

/**
 * 1. AETHER TECH LAB (`booth-tech.glb`)
 * Neo-Futuristic Curved Airfoil Wing Roof, Cantilevered Fin Buttresses,
 * Diagonal Exo-Truss Sapphire Glass Curtain Walls, and Geodesic Radome Spire.
 */
export function buildTechBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellTech';

  addArchitecturalFoundationPlinth(group, '#0f172a', '#0ea5e9', '#dbeafe');

  const darkTitaniumMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.28,
    metalness: 0.72,
  });
  const silverAlumMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.24,
    metalness: 0.78,
  });
  const cyanNeonMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 1.15,
    roughness: 0.18,
  });
  const sapphireGlassMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.34,
    roughness: 0.08,
    metalness: 0.35,
  });
  const interiorWallMat = new THREE.MeshStandardMaterial({
    color: '#f0f9ff',
    roughness: 0.45,
    metalness: 0.08,
  });

  // Sculpted Aerodynamic Side Fin Buttresses (ExtrudeGeometry)
  const finShape = new THREE.Shape();
  finShape.moveTo(-2.55, 0.28);
  finShape.lineTo(2.45, 0.28);
  finShape.bezierCurveTo(2.65, 1.8, 2.35, 3.4, 2.85, 4.35);
  finShape.lineTo(-2.65, 4.15);
  finShape.bezierCurveTo(-2.85, 2.6, -2.75, 1.2, -2.55, 0.28);

  const finGeom = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  finGeom.rotateY(Math.PI / 2);

  for (const sideX of [-3.48, 3.22]) {
    const finMesh = new THREE.Mesh(finGeom, darkTitaniumMat);
    finMesh.position.set(sideX, 0, 0);
    finMesh.castShadow = true;
    finMesh.receiveShadow = true;
    group.add(finMesh);
  }

  // Sweeping Curved Airfoil Wing Roof (ExtrudeGeometry spanning X = -3.9 to +3.9)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-3.95, 4.15);
  wingShape.quadraticCurveTo(0, 4.92, 3.95, 4.15);
  wingShape.lineTo(3.75, 3.88);
  wingShape.quadraticCurveTo(0, 4.48, -3.75, 3.88);
  wingShape.closePath();

  const wingGeom = new THREE.ExtrudeGeometry(wingShape, {
    depth: 5.7,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  const wingMesh = new THREE.Mesh(wingGeom, silverAlumMat);
  wingMesh.position.set(0, 0, -2.75);
  wingMesh.castShadow = true;
  wingMesh.receiveShadow = true;
  group.add(wingMesh);

  // Glowing Cyan Leading-Edge Roof Arch Tube (TubeGeometry)
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.88, 4.08, 2.98),
    new THREE.Vector3(-1.95, 4.52, 3.02),
    new THREE.Vector3(0, 4.72, 3.05),
    new THREE.Vector3(1.95, 4.52, 3.02),
    new THREE.Vector3(3.88, 4.08, 2.98),
  ]);
  const archTube = new THREE.Mesh(
    new THREE.TubeGeometry(archCurve, 28, 0.065, 10, false),
    cyanNeonMat
  );
  group.add(archTube);

  // Rear Architectural Wall & Left Inner Wall (for interior posters & shelving)
  const backWall = new THREE.Mesh(
    new RoundedBoxGeometry(6.7, 3.85, 0.24, 2, 0.03),
    interiorWallMat
  );
  backWall.position.set(0, 2.18, -2.42);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  // Rear Exterior Futuristic Louvered Facade & Cyan Matrix Core (360° camera view)
  for (let i = -2; i <= 2; i++) {
    const pilaster = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 3.7, 0.18, 2, 0.03),
      darkTitaniumMat
    );
    pilaster.position.set(i * 1.35, 2.15, -2.6);
    group.add(pilaster);
  }
  const rearCoreGlow = new THREE.Mesh(
    new RoundedBoxGeometry(5.2, 0.14, 0.12, 2, 0.02),
    cyanNeonMat
  );
  rearCoreGlow.position.set(0, 3.65, -2.62);
  group.add(rearCoreGlow);

  const leftInnerWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.2, 3.75, 4.6, 2, 0.02),
    interiorWallMat
  );
  leftInnerWall.position.set(-3.22, 2.12, -0.05);
  leftInnerWall.receiveShadow = true;
  group.add(leftInnerWall);

  // Right Wing Full-Height Sapphire Glass Curtain & Diagonal Exo-Truss
  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 4.3), sapphireGlassMat);
  rightGlass.position.set(3.25, 2.1, 0.0);
  group.add(rightGlass);

  const trussDiag1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.32, 0.4, -2.1),
    new THREE.Vector3(3.32, 3.8, 2.1),
  ]);
  const trussDiag2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.32, 3.8, -2.1),
    new THREE.Vector3(3.32, 0.4, 2.1),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(trussDiag1, 6, 0.045, 8, false), silverAlumMat));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(trussDiag2, 6, 0.045, 8, false), silverAlumMat));

  // Rooftop Geodesic Radome & Telemetry Spire (LatheGeometry + Icosahedron)
  const radomeBaseProfile = [
    new THREE.Vector2(0.85, 0.0),
    new THREE.Vector2(0.78, 0.22),
    new THREE.Vector2(0.62, 0.35),
  ];
  const radomeBase = new THREE.Mesh(
    new THREE.LatheGeometry(radomeBaseProfile, 16),
    darkTitaniumMat
  );
  radomeBase.position.set(-1.55, 4.55, -0.6);
  group.add(radomeBase);

  const radomeSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.68, 2),
    silverAlumMat
  );
  radomeSphere.position.set(-1.55, 5.15, -0.6);
  radomeSphere.castShadow = true;
  group.add(radomeSphere);

  const radomeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.74, 0.035, 10, 24),
    cyanNeonMat
  );
  radomeRing.position.set(-1.55, 5.05, -0.6);
  radomeRing.rotation.set(Math.PI / 2.4, 0.3, 0);
  group.add(radomeRing);

  return group;
}

/**
 * 2. NORDIC LIVING STUDIO (`booth-living.glb`)
 * Authentic Scandinavian Asymmetric Pitched-Gable Villa, Exposed Cedar Rafters,
 * Stone Chimney Breast, Arched Panorama Window Bay, and Front Timber Pergola.
 */
export function buildLivingBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellLiving';

  addArchitecturalFoundationPlinth(group, '#d6d3d1', '#10b981', '#fef3c7');

  const warmPlasterMat = new THREE.MeshStandardMaterial({
    color: '#fafaf9',
    roughness: 0.62,
    metalness: 0.04,
  });
  const cedarTimberMat = new THREE.MeshStandardMaterial({
    color: '#b45309',
    roughness: 0.52,
    metalness: 0.06,
  });
  const slateRoofMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.48,
    metalness: 0.28,
  });
  const nordicStoneMat = new THREE.MeshStandardMaterial({
    color: '#a8a29e',
    roughness: 0.78,
    metalness: 0.06,
  });
  const emeraldAccentMat = new THREE.MeshStandardMaterial({
    color: '#10b981',
    roughness: 0.36,
    metalness: 0.18,
  });
  const warmGlassMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    transparent: true,
    opacity: 0.32,
    roughness: 0.1,
    metalness: 0.2,
  });

  // Rear Gable Wall (ExtrudeGeometry matching the pitched roof peak!)
  const gableWallShape = new THREE.Shape();
  gableWallShape.moveTo(-3.4, 0.28);
  gableWallShape.lineTo(3.4, 0.28);
  gableWallShape.lineTo(3.4, 3.85);
  gableWallShape.lineTo(-0.45, 5.25);
  gableWallShape.lineTo(-3.4, 3.95);
  gableWallShape.closePath();

  const backWallGeom = new THREE.ExtrudeGeometry(gableWallShape, {
    depth: 0.26,
    bevelEnabled: false,
  });
  const backWallMesh = new THREE.Mesh(backWallGeom, warmPlasterMat);
  backWallMesh.position.set(0, 0, -2.55);
  backWallMesh.castShadow = true;
  backWallMesh.receiveShadow = true;
  group.add(backWallMesh);

  // Rear Nordic Timber Battens (360° exterior detail)
  for (let i = -3; i <= 3; i++) {
    const batten = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 3.65, 0.12, 2, 0.02),
      cedarTimberMat
    );
    batten.position.set(i * 0.95, 2.12, -2.62);
    group.add(batten);
  }

  // Asymmetric Scandinavian Pitched Gable Roof Slab (ExtrudeGeometry)
  const roofProfileShape = new THREE.Shape();
  roofProfileShape.moveTo(-3.95, 3.72);
  roofProfileShape.lineTo(-0.45, 5.48);
  roofProfileShape.lineTo(3.95, 3.65);
  roofProfileShape.lineTo(3.82, 3.42);
  roofProfileShape.lineTo(-0.45, 5.18);
  roofProfileShape.lineTo(-3.82, 3.48);
  roofProfileShape.closePath();

  const pitchedRoofGeom = new THREE.ExtrudeGeometry(roofProfileShape, {
    depth: 5.85,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  const pitchedRoofMesh = new THREE.Mesh(pitchedRoofGeom, slateRoofMat);
  pitchedRoofMesh.position.set(0, 0, -2.82);
  pitchedRoofMesh.castShadow = true;
  pitchedRoofMesh.receiveShadow = true;
  group.add(pitchedRoofMesh);

  // 7 Exposed Scandinavian Cedar Timber Rafters under the pitched roof eaves
  const rafterGeom = new RoundedBoxGeometry(7.6, 0.12, 0.14, 2, 0.02);
  for (let i = 0; i < 6; i++) {
    const rafter = new THREE.Mesh(rafterGeom, cedarTimberMat);
    rafter.position.set(0, 3.82, -2.2 + i * 0.96);
    group.add(rafter);
  }

  // Left Wing Wall + Exterior Stone Chimney Breast rising through the roof
  const leftWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.24, 3.65, 4.9, 2, 0.03),
    warmPlasterMat
  );
  leftWall.position.set(-3.32, 2.1, -0.05);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const chimney = new THREE.Mesh(
    new RoundedBoxGeometry(0.68, 5.65, 1.15, 3, 0.05),
    nordicStoneMat
  );
  chimney.position.set(-3.55, 2.95, -0.85);
  chimney.castShadow = true;
  group.add(chimney);

  const chimneyCap = new THREE.Mesh(
    new RoundedBoxGeometry(0.84, 0.14, 1.3, 2, 0.03),
    slateRoofMat
  );
  chimneyCap.position.set(-3.55, 5.82, -0.85);
  group.add(chimneyCap);

  // Right Wing Scandinavian Timber Louver Wall & Arched Studio Window
  const rightLowWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.26, 1.15, 4.8, 2, 0.03),
    warmPlasterMat
  );
  rightLowWall.position.set(3.32, 0.85, -0.05);
  group.add(rightLowWall);

  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 4.2), warmGlassMat);
  rightGlass.position.set(3.32, 2.58, -0.05);
  group.add(rightGlass);

  for (let i = 0; i < 8; i++) {
    const louver = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 2.45, 0.09, 2, 0.02),
      cedarTimberMat
    );
    louver.position.set(3.36, 2.58, -1.95 + i * 0.56);
    group.add(louver);
  }

  // Front Cedar Timber Pergola Overhang & Emerald Planter Trim
  const pergolaFrontBeam = new THREE.Mesh(
    new RoundedBoxGeometry(7.2, 0.18, 0.22, 2, 0.03),
    cedarTimberMat
  );
  pergolaFrontBeam.position.set(0, 3.62, 2.85);
  group.add(pergolaFrontBeam);

  const emeraldFascia = new THREE.Mesh(
    new RoundedBoxGeometry(6.8, 0.09, 0.08, 2, 0.02),
    emeraldAccentMat
  );
  emeraldFascia.position.set(0, 3.48, 2.94);
  group.add(emeraldFascia);

  return group;
}

/**
 * 3. ECOVIA ROASTERY & CRAFT (`booth-coffee.glb`)
 * European Brick Bistro, Curved French Mansard Roof, Arched Bistro Windows,
 * Curved Striped Parisian Awning, Wrought-Iron Balcony, and Copper Roaster Flue.
 */
export function buildCoffeeBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellCoffee';

  addArchitecturalFoundationPlinth(group, '#451a03', '#f59e0b', '#fef3c7');

  const terracottaBrickMat = new THREE.MeshStandardMaterial({
    color: '#9a3412',
    roughness: 0.76,
    metalness: 0.05,
  });
  const creamStoneMat = new THREE.MeshStandardMaterial({
    color: '#fef3c7',
    roughness: 0.58,
    metalness: 0.06,
  });
  const mansardZincMat = new THREE.MeshStandardMaterial({
    color: '#292524',
    roughness: 0.42,
    metalness: 0.52,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.24,
    metalness: 0.86,
  });
  const espressoAwningMat = new THREE.MeshStandardMaterial({
    color: '#78350f',
    roughness: 0.65,
    metalness: 0.05,
  });
  const wroughtIronMat = new THREE.MeshStandardMaterial({
    color: '#1c1917',
    roughness: 0.38,
    metalness: 0.78,
  });
  const warmGlassMat = new THREE.MeshStandardMaterial({
    color: '#fde68a',
    transparent: true,
    opacity: 0.34,
    roughness: 0.12,
    metalness: 0.2,
  });

  // Back & Left Brick Bistro Walls
  const backWall = new THREE.Mesh(
    new RoundedBoxGeometry(6.8, 3.85, 0.28, 2, 0.03),
    terracottaBrickMat
  );
  backWall.position.set(0, 2.18, -2.42);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  // Cream Stone Interior Wainscot & Corner Quoins
  const innerBackPanel = new THREE.Mesh(
    new RoundedBoxGeometry(6.5, 3.7, 0.08, 2, 0.02),
    creamStoneMat
  );
  innerBackPanel.position.set(0, 2.15, -2.26);
  group.add(innerBackPanel);

  const leftWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.28, 3.85, 5.0, 2, 0.03),
    terracottaBrickMat
  );
  leftWall.position.set(-3.32, 2.18, 0.0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const leftInnerPanel = new THREE.Mesh(
    new RoundedBoxGeometry(0.08, 3.7, 4.7, 2, 0.02),
    creamStoneMat
  );
  leftInnerPanel.position.set(-3.16, 2.15, 0.0);
  group.add(leftInnerPanel);

  // Stone Corner Quoins along Front & Rear Corners
  const quoinGeom = new RoundedBoxGeometry(0.38, 0.28, 0.38, 2, 0.03);
  for (let row = 0; row < 7; row++) {
    const qy = 0.55 + row * 0.52;
    for (const [qx, qz] of [
      [-3.34, 2.42],
      [3.34, 2.42],
      [-3.34, -2.42],
      [3.34, -2.42],
    ]) {
      const quoin = new THREE.Mesh(quoinGeom, creamStoneMat);
      quoin.position.set(qx, qy, qz);
      group.add(quoin);
    }
  }

  // Right Wing Arched Bistro Window Bay
  const rightWainscot = new THREE.Mesh(
    new RoundedBoxGeometry(0.28, 1.22, 4.8, 2, 0.03),
    terracottaBrickMat
  );
  rightWainscot.position.set(3.32, 0.88, 0.0);
  group.add(rightWainscot);

  const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 4.3), warmGlassMat);
  rightGlass.position.set(3.32, 2.65, 0.0);
  group.add(rightGlass);

  // 2 Arched Window Frames on Right Wing (Torus half-arches + Mullion pillars)
  for (const wz of [-1.1, 1.1]) {
    const archRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.08, 10, 20, Math.PI),
      creamStoneMat
    );
    archRing.position.set(3.35, 2.85, wz);
    archRing.rotation.y = Math.PI / 2;
    group.add(archRing);
  }

  // Classical Molded Stone Cornice + French Mansard Roof (ExtrudeGeometry)
  const cornice = new THREE.Mesh(
    new RoundedBoxGeometry(7.35, 0.24, 5.55, 3, 0.04),
    creamStoneMat
  );
  cornice.position.set(0, 4.02, 0);
  group.add(cornice);

  const mansardShape = new THREE.Shape();
  mansardShape.moveTo(-3.6, 4.12);
  mansardShape.quadraticCurveTo(-3.35, 4.65, -2.95, 4.92);
  mansardShape.lineTo(2.95, 4.92);
  mansardShape.quadraticCurveTo(3.35, 4.65, 3.6, 4.12);
  mansardShape.closePath();

  const mansardGeom = new THREE.ExtrudeGeometry(mansardShape, {
    depth: 5.2,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  const mansardMesh = new THREE.Mesh(mansardGeom, mansardZincMat);
  mansardMesh.position.set(0, 0, -2.6);
  mansardMesh.castShadow = true;
  mansardMesh.receiveShadow = true;
  group.add(mansardMesh);

  // Curved Parisian Bistro Awning projecting from the front facade (ExtrudeGeometry)
  const awningShape = new THREE.Shape();
  awningShape.moveTo(0, 3.88);
  awningShape.bezierCurveTo(0.45, 3.82, 0.85, 3.45, 1.15, 3.28);
  awningShape.lineTo(1.15, 3.12);
  awningShape.bezierCurveTo(0.8, 3.32, 0.4, 3.68, 0, 3.74);
  awningShape.closePath();

  const awningGeom = new THREE.ExtrudeGeometry(awningShape, {
    depth: 6.4,
    bevelEnabled: false,
  });
  awningGeom.rotateY(Math.PI / 2);
  const awningMesh = new THREE.Mesh(awningGeom, espressoAwningMat);
  awningMesh.position.set(-3.2, 0, 2.45);
  awningMesh.castShadow = true;
  group.add(awningMesh);

  // Alternating Cream Stripes on Awning
  const stripeGeom = new RoundedBoxGeometry(0.44, 0.06, 1.12, 2, 0.01);
  for (let i = -3; i <= 3; i++) {
    const stripe = new THREE.Mesh(stripeGeom, creamStoneMat);
    stripe.position.set(i * 0.88, 3.58, 2.98);
    stripe.rotation.x = 0.46;
    group.add(stripe);
  }

  // Wrought-Iron Upper Balcony Railing + Riveted Copper Roaster Chimney Flue (LatheGeometry)
  const railTop = new THREE.Mesh(
    new RoundedBoxGeometry(6.8, 0.05, 0.05, 2, 0.01),
    wroughtIronMat
  );
  railTop.position.set(0, 4.38, 2.68);
  group.add(railTop);

  const flueProfile = [
    new THREE.Vector2(0.42, 0.0),
    new THREE.Vector2(0.38, 0.35),
    new THREE.Vector2(0.24, 0.55),
    new THREE.Vector2(0.24, 1.18),
    new THREE.Vector2(0.36, 1.28),
    new THREE.Vector2(0.18, 1.42),
  ];
  const flueMesh = new THREE.Mesh(new THREE.LatheGeometry(flueProfile, 16), copperMat);
  flueMesh.position.set(-1.75, 4.88, -0.75);
  flueMesh.castShadow = true;
  group.add(flueMesh);

  return group;
}

/**
 * 4. KINETIX ROBOTICS & AI (`booth-robotics.glb`)
 * 3-Bay Industrial Sawtooth Clerestory Hangar, Chamfered Blast-Wall Buttresses,
 * Overhead Yellow Steel Gantry Crane Bridge, and Twin Rotary Turbine Ventilators.
 */
export function buildRoboticsBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellRobotics';

  addArchitecturalFoundationPlinth(group, '#1e1b4b', '#8b5cf6', '#ede9fe');

  const armorSteelMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.34,
    metalness: 0.72,
  });
  const concreteButtressMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.62,
    metalness: 0.32,
  });
  const gantryYellowMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    roughness: 0.32,
    metalness: 0.58,
  });
  const violetNeonMat = new THREE.MeshStandardMaterial({
    color: '#a78bfa',
    emissive: '#7c3aed',
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });
  const clerestoryGlassMat = new THREE.MeshStandardMaterial({
    color: '#c4b5fd',
    emissive: '#6d28d9',
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.45,
    roughness: 0.12,
  });
  const labInteriorMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.42,
    metalness: 0.12,
  });

  // Back & Left Hangar Walls
  const backWall = new THREE.Mesh(
    new RoundedBoxGeometry(6.8, 3.85, 0.26, 2, 0.03),
    labInteriorMat
  );
  backWall.position.set(0, 2.18, -2.42);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const leftWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.26, 3.85, 4.9, 2, 0.03),
    labInteriorMat
  );
  leftWall.position.set(-3.32, 2.18, 0.0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  // 6 Heavy Chamfered Industrial Buttresses around Perimeter (ExtrudeGeometry)
  const buttressShape = new THREE.Shape();
  buttressShape.moveTo(0, 0.28);
  buttressShape.lineTo(0.48, 0.28);
  buttressShape.lineTo(0.36, 2.65);
  buttressShape.lineTo(0.18, 4.05);
  buttressShape.lineTo(0, 4.05);
  buttressShape.closePath();

  const buttressGeom = new THREE.ExtrudeGeometry(buttressShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });

  for (const bz of [-2.0, 0.0, 2.0]) {
    const bLeft = new THREE.Mesh(buttressGeom, concreteButtressMat);
    bLeft.position.set(-3.38, 0, bz);
    bLeft.rotation.y = Math.PI;
    bLeft.castShadow = true;
    group.add(bLeft);

    const bRight = new THREE.Mesh(buttressGeom, concreteButtressMat);
    bRight.position.set(3.38, 0, bz);
    bRight.castShadow = true;
    group.add(bRight);
  }

  // 3-Bay Industrial Sawtooth Factory Roof Profile (ExtrudeGeometry)
  const sawtoothShape = new THREE.Shape();
  sawtoothShape.moveTo(-3.55, 3.95);
  sawtoothShape.lineTo(-1.25, 4.88);
  sawtoothShape.lineTo(-1.25, 4.12);
  sawtoothShape.lineTo(1.15, 4.88);
  sawtoothShape.lineTo(1.15, 4.12);
  sawtoothShape.lineTo(3.55, 4.88);
  sawtoothShape.lineTo(3.55, 3.95);
  sawtoothShape.closePath();

  const sawtoothGeom = new THREE.ExtrudeGeometry(sawtoothShape, {
    depth: 5.3,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  const sawtoothMesh = new THREE.Mesh(sawtoothGeom, armorSteelMat);
  sawtoothMesh.position.set(0, 0, -2.65);
  sawtoothMesh.castShadow = true;
  sawtoothMesh.receiveShadow = true;
  group.add(sawtoothMesh);

  // Glowing Clerestory Skylight Strips on the Vertical Sawtooth Faces
  for (const sx of [-1.22, 1.18]) {
    const skylight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.62, 5.1),
      clerestoryGlassMat
    );
    skylight.position.set(sx, 4.48, 0);
    group.add(skylight);
  }

  // Overhead Yellow Industrial Gantry Crane Bridge Straddling the Roofline
  const gantryPortalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.68, 0.35, 1.35),
    new THREE.Vector3(-3.68, 5.38, 1.35),
    new THREE.Vector3(3.68, 5.38, 1.35),
    new THREE.Vector3(3.68, 0.35, 1.35),
  ]);
  const gantryBridge = new THREE.Mesh(
    new THREE.TubeGeometry(gantryPortalCurve, 24, 0.11, 8, false),
    gantryYellowMat
  );
  gantryBridge.castShadow = true;
  group.add(gantryBridge);

  // Violet Energy Busbar along Front Header
  const frontBusbar = new THREE.Mesh(
    new RoundedBoxGeometry(6.9, 0.1, 0.12, 2, 0.02),
    violetNeonMat
  );
  frontBusbar.position.set(0, 3.88, 2.68);
  group.add(frontBusbar);

  // Twin Rotary Rooftop Ventilator Turbines (LatheGeometry)
  const turbineProfile = [
    new THREE.Vector2(0.24, 0.0),
    new THREE.Vector2(0.24, 0.18),
    new THREE.Vector2(0.38, 0.34),
    new THREE.Vector2(0.34, 0.52),
    new THREE.Vector2(0.08, 0.62),
  ];
  const turbineGeom = new THREE.LatheGeometry(turbineProfile, 14);
  for (const tz of [-1.1, 0.45]) {
    const t = new THREE.Mesh(turbineGeom, concreteButtressMat);
    t.position.set(-2.1, 4.52, tz);
    group.add(t);
  }

  return group;
}

/**
 * 5. LUMINA DESIGN COLLECTIVE (`booth-design.glb`)
 * Contemporary Parametric Wave-Fin Art Pavilion, Semicircular Gallery Portal Arch,
 * and Sculptural Brushed Rose-Gold Interlocking Ribbon Monument.
 */
export function buildDesignBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellDesign';

  addArchitecturalFoundationPlinth(group, '#fce7f3', '#ec4899', '#fff1f2');

  const alabasterMat = new THREE.MeshStandardMaterial({
    color: '#fffbfd',
    roughness: 0.38,
    metalness: 0.08,
  });
  const roseGoldMat = new THREE.MeshStandardMaterial({
    color: '#f472b6',
    roughness: 0.22,
    metalness: 0.78,
  });
  const coralFinMat = new THREE.MeshStandardMaterial({
    color: '#fbcfe8',
    roughness: 0.34,
    metalness: 0.16,
  });
  const magentaGlowMat = new THREE.MeshStandardMaterial({
    color: '#f472b6',
    emissive: '#db2777',
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });

  // Back & Left Gallery Walls
  const backWall = new THREE.Mesh(
    new RoundedBoxGeometry(6.7, 3.85, 0.24, 2, 0.03),
    alabasterMat
  );
  backWall.position.set(0, 2.18, -2.42);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const leftWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.24, 3.85, 4.9, 2, 0.03),
    alabasterMat
  );
  leftWall.position.set(-3.3, 2.18, 0.0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  // 9 Parametric Undulating Architectural Wave Fins wrapping the Pavilion Roof & Sides
  for (let i = 0; i < 9; i++) {
    const zPos = -2.25 + i * 0.58;
    const wavePeakX = Math.sin(i * 0.65) * 1.15;
    const wavePeakY = 4.65 + Math.cos(i * 0.55) * 0.38;

    const finShape = new THREE.Shape();
    finShape.moveTo(-3.65, 0.3);
    finShape.lineTo(-3.65, 4.18);
    finShape.quadraticCurveTo(wavePeakX, wavePeakY + 0.45, 3.65, 4.12);
    finShape.lineTo(3.65, 2.85);
    finShape.lineTo(3.38, 2.85);
    finShape.lineTo(3.38, 3.88);
    finShape.quadraticCurveTo(wavePeakX, wavePeakY, -3.38, 3.92);
    finShape.lineTo(-3.38, 0.3);
    finShape.closePath();

    const finGeom = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 2,
    });
    const finMesh = new THREE.Mesh(finGeom, i % 2 === 0 ? alabasterMat : coralFinMat);
    finMesh.position.set(0, 0, zPos);
    finMesh.castShadow = true;
    finMesh.receiveShadow = true;
    group.add(finMesh);
  }

  // Grand Rose-Gold Arched Entrance Portal Frame at +Z
  const portalArchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.35, 0.3, 2.68),
    new THREE.Vector3(-3.35, 3.65, 2.68),
    new THREE.Vector3(-1.85, 4.45, 2.74),
    new THREE.Vector3(0, 4.68, 2.78),
    new THREE.Vector3(1.85, 4.45, 2.74),
    new THREE.Vector3(3.35, 3.65, 2.68),
    new THREE.Vector3(3.35, 0.3, 2.68),
  ]);
  const portalArchMesh = new THREE.Mesh(
    new THREE.TubeGeometry(portalArchCurve, 32, 0.09, 10, false),
    roseGoldMat
  );
  portalArchMesh.castShadow = true;
  group.add(portalArchMesh);

  // Sculptural Parametric Rose-Gold Ribbon Loop on the Roof (TubeGeometry)
  const ribbonPts: THREE.Vector3[] = [];
  for (let s = 0; s <= 36; s++) {
    const t = (s / 36) * Math.PI * 2;
    ribbonPts.push(
      new THREE.Vector3(
        Math.sin(t) * 1.15,
        5.05 + Math.sin(t * 2) * 0.36,
        -0.4 + Math.cos(t) * 0.65
      )
    );
  }
  const ribbonCurve = new THREE.CatmullRomCurve3(ribbonPts, true);
  const ribbonMesh = new THREE.Mesh(
    new THREE.TubeGeometry(ribbonCurve, 48, 0.075, 10, true),
    magentaGlowMat
  );
  ribbonMesh.castShadow = true;
  group.add(ribbonMesh);

  return group;
}

/**
 * 6. SOLARIS CLEAN ENERGY (`booth-energy.glb`)
 * Biophilic Swept Solar-Wing Canopy, Tree-Branching Structural Columns,
 * Terraced Vertical Living Green Walls, and Helical VAWT Eco-Turbine.
 */
export function buildEnergyBoothExteriorShell(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BoothShellEnergy';

  addArchitecturalFoundationPlinth(group, '#ecfdf5', '#14b8a6', '#f0fdfa');

  const ecoWhiteMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.35,
    metalness: 0.18,
  });
  const tealBiophilicMat = new THREE.MeshStandardMaterial({
    color: '#0d9488',
    roughness: 0.34,
    metalness: 0.42,
  });
  const solarCellMat = new THREE.MeshStandardMaterial({
    color: '#1e3a8a',
    roughness: 0.16,
    metalness: 0.82,
  });
  const livingWallMat = new THREE.MeshStandardMaterial({
    color: '#16a34a',
    roughness: 0.78,
    metalness: 0.04,
  });
  const cyanEcoGlowMat = new THREE.MeshStandardMaterial({
    color: '#2dd4bf',
    emissive: '#0d9488',
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });

  // Back & Left Pavilion Walls
  const backWall = new THREE.Mesh(
    new RoundedBoxGeometry(6.7, 3.8, 0.24, 2, 0.03),
    ecoWhiteMat
  );
  backWall.position.set(0, 2.15, -2.42);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const leftWall = new THREE.Mesh(
    new RoundedBoxGeometry(0.24, 3.8, 4.8, 2, 0.03),
    ecoWhiteMat
  );
  leftWall.position.set(-3.3, 2.15, 0.0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  // Exterior Terraced Vertical Living Green Wall Modules on Left & Rear Flanks
  const greenModuleGeom = new RoundedBoxGeometry(0.16, 0.72, 1.25, 2, 0.04);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const gm = new THREE.Mesh(greenModuleGeom, livingWallMat);
      gm.position.set(-3.48, 0.95 + row * 0.92, -1.45 + col * 1.45);
      group.add(gm);
    }
  }

  // Biophilic Tree-Branching Structural Columns on the Right Wing (`TubeGeometry`)
  for (const cz of [-1.45, 1.45]) {
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.32, 0.28, cz),
      new THREE.Vector3(3.32, 2.65, cz),
    ]);
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 8, 0.11, 10, false), tealBiophilicMat)
    );

    const branchOffsets: [number, number][] = [
      [-0.45, -0.55],
      [0.15, 0.0],
      [-0.35, 0.55],
    ];
    branchOffsets.forEach(([bx, bz]) => {
      const bCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(3.32, 2.55, cz),
        new THREE.Vector3(3.32 + bx * 0.5, 3.35, cz + bz * 0.5),
        new THREE.Vector3(3.32 + bx, 4.15, cz + bz),
      ]);
      group.add(
        new THREE.Mesh(new THREE.TubeGeometry(bCurve, 8, 0.055, 8, false), tealBiophilicMat)
      );
    });
  }

  // Swept Biophilic Solar-Wing Roof Canopy (ExtrudeGeometry)
  const solarWingShape = new THREE.Shape();
  solarWingShape.moveTo(-3.9, 3.92);
  solarWingShape.bezierCurveTo(-1.5, 4.68, 1.5, 4.25, 3.95, 4.58);
  solarWingShape.lineTo(3.85, 4.32);
  solarWingShape.bezierCurveTo(1.5, 3.98, -1.5, 4.38, -3.8, 3.68);
  solarWingShape.closePath();

  const solarWingGeom = new THREE.ExtrudeGeometry(solarWingShape, {
    depth: 5.75,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  const solarWingMesh = new THREE.Mesh(solarWingGeom, ecoWhiteMat);
  solarWingMesh.position.set(0, 0, -2.78);
  solarWingMesh.castShadow = true;
  solarWingMesh.receiveShadow = true;
  group.add(solarWingMesh);

  // Dual Angled Monocrystalline Solar PV Arrays on the Roof
  const pvPanelGeom = new RoundedBoxGeometry(4.4, 0.07, 1.25, 2, 0.02);
  for (const pz of [-1.25, 0.45]) {
    const pv = new THREE.Mesh(pvPanelGeom, solarCellMat);
    pv.position.set(-0.65, 4.62, pz);
    pv.rotation.x = 0.24;
    pv.castShadow = true;
    group.add(pv);
  }

  // Helical 3-Blade Vertical-Axis Wind Turbine (VAWT) on the Roof Peak (TubeGeometry)
  const mastMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 1.65, 12),
    ecoWhiteMat
  );
  mastMesh.position.set(2.35, 5.15, -0.85);
  group.add(mastMesh);

  for (let b = 0; b < 3; b++) {
    const baseAngle = (b * Math.PI * 2) / 3;
    const helixPts: THREE.Vector3[] = [];
    for (let s = 0; s <= 12; s++) {
      const frac = s / 12;
      const angle = baseAngle + frac * Math.PI * 1.1;
      const radius = Math.sin(frac * Math.PI) * 0.44 + 0.08;
      helixPts.push(
        new THREE.Vector3(
          2.35 + Math.cos(angle) * radius,
          4.55 + frac * 1.25,
          -0.85 + Math.sin(angle) * radius
        )
      );
    }
    const bladeCurve = new THREE.CatmullRomCurve3(helixPts);
    const bladeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(bladeCurve, 16, 0.032, 8, false),
      cyanEcoGlowMat
    );
    group.add(bladeMesh);
  }

  return group;
}

/**
 * Builds the bespoke architectural exterior shell for any of the 6 booth themes.
 */
export function buildBoothExteriorShell(theme: ArchitecturalBoothTheme): THREE.Group {
  switch (theme) {
    case 'tech':
      return buildTechBoothExteriorShell();
    case 'living':
      return buildLivingBoothExteriorShell();
    case 'coffee':
      return buildCoffeeBoothExteriorShell();
    case 'robotics':
      return buildRoboticsBoothExteriorShell();
    case 'design':
      return buildDesignBoothExteriorShell();
    case 'energy':
      return buildEnergyBoothExteriorShell();
  }
}
