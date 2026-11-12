// Optional reproducible import pipeline. Requires network access and temporary tooling.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const tooling = process.env.EXPO_GRAPHICS_TOOLS || path.join(process.env.TEMP, 'expo-graphics-tools/node_modules');
const { NodeIO } = require(path.join(tooling, '@gltf-transform/core'));
const { ALL_EXTENSIONS } = require(path.join(tooling, '@gltf-transform/extensions'));
const { prune, dedup, weld, textureCompress, simplify } = require(path.join(tooling, '@gltf-transform/functions'));
const sharp = require(path.join(tooling, 'sharp'));
(async () => {
  const { MeshoptSimplifier } = await import(pathToFileURL(path.join(tooling, 'meshoptimizer/index.js')));
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const dir = 'FE/public/models/exterior/';
  const sources = JSON.parse(fs.readFileSync(dir + 'sources.json'));
  const downloads = new Map();
  for (const source of sources.filter(s => s.used !== false)) {
    if (!downloads.has(source.url)) {
      const response = await fetch(source.url);
      if (!response.ok) throw Error(`${source.id}: HTTP ${response.status}`);
      downloads.set(source.url, new Uint8Array(await response.arrayBuffer()));
    }
    const doc = await io.readBinary(downloads.get(source.url));
    const selected = { etFGNvsiFv: 'NormalTree_3', 'etFGNvsiFv-variant': 'NormalTree_1', R7qMWzb7nk: 'BirchTree_1', RO32ltX6zJ: 'Lamp', NBUxHir6FJ: 'Flower_5_Clump' }[source.id];
    if (selected) doc.getRoot().listNodes().filter(n => n.getMesh() && n.getName() !== selected).forEach(n => n.dispose());
    doc.getRoot().listMaterials().forEach(m => {
      if (/Tree|Wood|Green/.test(m.getName()) || source.id === 'NBUxHir6FJ') m.setMetallicFactor(0).setRoughnessFactor(.85);
      if (/Leaves/.test(m.getName())) m.setAlphaMode('MASK').setAlphaCutoff(.45).setDoubleSided(true);
    });
    const size = source.id === 'NBUxHir6FJ' ? 512 : 1024;
    await doc.transform(prune(), dedup(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size,size] }));
    await io.write(dir + source.id + '.glb', doc);
    if (source.lodBytes) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: .45, error: .002 }), prune());
      await io.write(dir + source.id + '-lod.glb', doc);
    }
  }
  require('./credits.cjs');
})().catch(e => { console.error(e); process.exit(1); });
