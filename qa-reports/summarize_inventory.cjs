const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'asset_inventory_raw.json'), 'utf8'));

console.log('Filename                         | Size (MB) | Meshes | Triangles | Materials | Textures | Dimensions (X, Y, Z meters)');
console.log('-'.repeat(120));

for (const item of data) {
  const fn = item.filename.padEnd(32);
  const sz = (item.size_mb + ' MB').padStart(9);
  const mc = String(item.mesh_count).padStart(6);
  const tc = item.triangles.toLocaleString().padStart(9);
  const mat = String(item.materials.length).padStart(9);
  const tex = String(item.images.length).padStart(8);
  const dim = JSON.stringify(item.dimensions);
  console.log(`${fn} | ${sz} | ${mc} | ${tc} | ${mat} | ${tex} | ${dim}`);
}
