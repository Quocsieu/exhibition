import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  buildBoothExteriorShell,
  buildOakTreeModel,
  buildPineTreeModel,
  buildStreetLampModel,
  buildParkBenchModel,
  buildPlanterUrnModel,
} from '../src/scene/architecturalModels.js';

// Polyfill FileReader in Node.js for Three.js GLTFExporter binary ArrayBuffer output
if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  }
  (globalThis as unknown as { FileReader: typeof NodeFileReader }).FileReader = NodeFileReader;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/models');

function computeStats(root: THREE.Object3D) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes++;
      const geom = (obj as THREE.Mesh).geometry;
      const pos = geom.attributes.position;
      if (pos) {
        vertices += pos.count;
        if (geom.index) {
          triangles += Math.floor(geom.index.count / 3);
        } else {
          triangles += Math.floor(pos.count / 3);
        }
      }
    }
  });
  return { meshes, vertices, triangles };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const exporter = new GLTFExporter();

  const assetSpecs: { fileName: string; build: () => THREE.Group }[] = [
    { fileName: 'booth-tech.glb', build: () => buildBoothExteriorShell('tech') },
    { fileName: 'booth-living.glb', build: () => buildBoothExteriorShell('living') },
    { fileName: 'booth-coffee.glb', build: () => buildBoothExteriorShell('coffee') },
    { fileName: 'booth-robotics.glb', build: () => buildBoothExteriorShell('robotics') },
    { fileName: 'booth-design.glb', build: () => buildBoothExteriorShell('design') },
    { fileName: 'booth-energy.glb', build: () => buildBoothExteriorShell('energy') },
    { fileName: 'env-tree-oak.glb', build: () => buildOakTreeModel('emerald') },
    { fileName: 'env-tree-blossom.glb', build: () => buildOakTreeModel('blossom') },
    { fileName: 'env-tree-pine.glb', build: () => buildPineTreeModel() },
    { fileName: 'env-street-lamp.glb', build: () => buildStreetLampModel() },
    { fileName: 'env-park-bench.glb', build: () => buildParkBenchModel() },
    { fileName: 'env-planter-urn.glb', build: () => buildPlanterUrnModel() },
  ];

  const manifest: Record<
    string,
    { bytes: number; meshes: number; vertices: number; triangles: number }
  > = {};

  for (const spec of assetSpecs) {
    const scene = new THREE.Scene();
    const model = spec.build();
    scene.add(model);
    scene.updateMatrixWorld(true);

    const stats = computeStats(model);
    const glbBuffer = (await exporter.parseAsync(scene, {
      binary: true,
    })) as ArrayBuffer;

    const fullPath = path.join(outDir, spec.fileName);
    fs.writeFileSync(fullPath, Buffer.from(glbBuffer));
    manifest[spec.fileName] = {
      bytes: glbBuffer.byteLength,
      ...stats,
    };
    console.log(
      `[GLB Compiler] Generated ${spec.fileName} (${(glbBuffer.byteLength / 1024).toFixed(1)} KB | ${stats.meshes} meshes | ${stats.triangles} tris)`
    );
  }

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  console.log(`[GLB Compiler] Wrote 12 binary GLB 2.0 assets + manifest.json to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
