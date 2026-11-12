const fs = require('node:fs');
const dir = 'FE/public/models/exterior/';
const sources = JSON.parse(fs.readFileSync(dir + 'sources.json'));
const used = sources.filter(s => s.used !== false);
for (const s of used) {
  for (const suffix of ['', ...(s.lodBytes ? ['-lod'] : [])]) {
    const file = dir + s.id + suffix + '.glb';
    const b = fs.readFileSync(file), length = b.readUInt32LE(12);
    const json = JSON.parse(b.toString('utf8', 20, 20 + length));
    json.asset.copyright = `${s.title} by ${s.author}; ${s.source}; ${s.license}; modified: isolated variant, optimized textures/mesh, PBR, LOD; runtime normalized scale/origin.`;
    let text = JSON.stringify(json); text += ' '.repeat((4 - Buffer.byteLength(text) % 4) % 4);
    const chunk = Buffer.from(text), tail = b.subarray(20 + length), header = Buffer.from(b.subarray(0, 20));
    header.writeUInt32LE(20 + chunk.length + tail.length, 8); header.writeUInt32LE(chunk.length, 12);
    fs.writeFileSync(file, Buffer.concat([header, chunk, tail]));
    if (suffix) s.lodBytes = fs.statSync(file).size; else s.optimizedBytes = fs.statSync(file).size;
  }
}
fs.writeFileSync(dir + 'sources.json', JSON.stringify(sources, null, 2));
const lines = ['# Exterior asset credits', '', 'Imported artwork, not exports of the application procedural builders.', '', 'CC0: https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY 3.0: https://creativecommons.org/licenses/by/3.0/', '', 'Files have been modified: selected variants, deduplicated/welded meshes, WebP textures up to 1024px (flowers 512px), non-metallic foliage with alpha testing, simplified LOD. Scene applies origin and size normalization.', '', '| File | Artwork / author | License | Source | Bytes |', '|---|---|---|---|---|'];
for(const s of used) lines.push(`| ${s.id}.glb${s.lodBytes ? ' (+ -lod.glb)' : ''} | ${s.title} — ${s.author} | ${s.license} | ${s.source} | ${s.optimizedBytes}${s.lodBytes ? ' + '+s.lodBytes : ''} |`);
lines.push('', 'The downloaded Pine Trees group (oYtDty0fR6) was rejected after visual inspection and is not used. Legacy env-tree-pine now selects a second individual leafy tree; env-tree-blossom selects birch. Legacy procedural urns remain procedural.');
fs.writeFileSync(dir+'CREDITS.md',lines.join('\n'));
