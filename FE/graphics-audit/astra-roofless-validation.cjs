const fs=require('node:fs');
const {chromium}=require(process.env.TEMP+'/expo-graphics-tools/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const results={errors:[],assetResponses:[],views:[]};
 page.on('pageerror',e=>results.errors.push(String(e)));
 page.on('response',r=>{if(r.url().includes('/roofless-v1/'))results.assetResponses.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:5180');await page.waitForTimeout(8000);
 const guide=page.getByRole('button',{name:'Ẩn hướng dẫn'});if(await guide.isVisible())await guide.click();
 for(const view of ['explore','overview']){
   if(view==='overview'){await page.getByRole('button',{name:'🌐 Toàn cảnh',exact:true}).click();await page.waitForTimeout(1500);}
   results.views.push(await page.evaluate(async view=>{
    const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');const THREE=await import('/node_modules/.vite/deps/three.js');
    const s=_roots.get(document.querySelector('canvas')).store.getState();const frames=[];
    s.scene.updateMatrixWorld(true);
    s.scene.traverse(o=>{if(!o.name.startsWith('roofless-glb:'))return;
      let meshes=0,triangles=0;const materials=new Set();
      o.traverse(c=>{if(c.isMesh){meshes++;triangles+=(c.geometry.index?.count||c.geometry.attributes.position.count)/3;(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>materials.add(m.uuid));}});
      let booth=o;while(booth.parent&&!booth.__r3f?.handlers?.onClick)booth=booth.parent;
      const overhead=[];for(const x of [-1.5,0,1.5])for(const z of [-.8,0,.8]){
        const origin=o.localToWorld(new THREE.Vector3(x,8,z));const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,4.8);
        overhead.push({x,z,hits:ray.intersectObject(booth,true).length});
      }
      frames.push({name:o.name,meshes,triangles,materials:materials.size,overhead});
    });
    const start=performance.now();await new Promise(resolve=>{let n=0;function frame(){if(++n===90)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
    return {view,frames,fps:90000/(performance.now()-start),calls:s.gl.info.render.calls,triangles:s.gl.info.render.triangles,textureCount:s.gl.info.memory.textures,geometryCount:s.gl.info.memory.geometries,webglError:s.gl.getContext().getError()};
   },view));
 }
 const fallback=await browser.newPage({viewport:{width:1440,height:900}});const warnings=[];
 fallback.on('console',m=>{if(m.text().includes('[roofless-booth]'))warnings.push(m.text());});
 await fallback.route('**/models/booths/roofless-v1/*.glb',route=>route.abort());
 await fallback.goto('http://127.0.0.1:5180');await fallback.waitForTimeout(10000);
 const guide2=fallback.getByRole('button',{name:'Ẩn hướng dẫn'});if(await guide2.isVisible())await guide2.click();
 await fallback.getByRole('button',{name:'🌐 Toàn cảnh',exact:true}).click();await fallback.waitForTimeout(1800);
 results.fallback=await fallback.evaluate(async()=>{
   const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');const s=_roots.get(document.querySelector('canvas')).store.getState();const names=[];
   s.scene.traverse(o=>{if(o.name.startsWith('ExhibitionShell:')||o.name.startsWith('roofless-glb:'))names.push(o.name);});return {names,webglError:s.gl.getContext().getError()};
 });results.fallback.warnings=warnings;
 await fallback.screenshot({path:'FE/graphics-audit/astra-phase1/fallback-overview.png'});
 fs.writeFileSync('FE/graphics-audit/astra-phase1/roofless-validation.json',JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
