// Offline only; requires the already installed temporary glTF Transform tooling.
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const tooling=path.join(process.env.TEMP,'expo-graphics-tools/node_modules');
const {NodeIO}=require(path.join(tooling,'@gltf-transform/core'));
const {weld,dedup,prune,simplify}=require(path.join(tooling,'@gltf-transform/functions'));
(async()=>{
  const {MeshoptSimplifier}=await import(pathToFileURL(path.join(tooling,'meshoptimizer/index.js')));
  await MeshoptSimplifier.ready;
  const io=new NodeIO(),dir='FE/public/models/exterior/';
  for(let i=1;i<=4;i++)for(const suffix of ['','-lod'])if(fs.existsSync(`${dir}city_final_0${i}${suffix}.glb`))throw Error('Refusing overwrite');
  for(let i=1;i<=4;i++){
    const doc=await io.read(`${dir}city_detail_v2_0${i}.glb`);
    await doc.transform(weld(),dedup(),simplify({simplifier:MeshoptSimplifier,ratio:.35,error:.002}),prune());
    await io.write(`${dir}city_final_0${i}.glb`,doc);
    await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.4,error:.008}),prune());
    await io.write(`${dir}city_final_0${i}-lod.glb`,doc);
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
