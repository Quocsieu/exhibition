const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');
const phase = process.argv[2];
if (!phase || !/^[a-z0-9-]+$/.test(phase)) throw Error('Unique output phase required');
const dir = path.join(__dirname, 'graphics-continuation', phase);
if (fs.existsSync(dir)) throw Error('Refusing to overwrite evidence');
fs.mkdirSync(dir, {recursive:true});
const requested = process.argv.slice(3);
const views = [
  ['tree', [24,5,15], [20.5,3,18.5]],
  ['fountain', [5,4,6], [0,1,0]],
  ['building', [-16,9,-18], [-23,6,-33]],
  ['skyline', [-15,17,-15], [-27,7,-31]],
  ['flowers', [-3,2.7,3.3], [-6,.5,5]],
  ['urn', [8,2.5,22], [5.8,.6,19.6]],
  ['bin', [7.2,1.5,19], [5.6,.4,17.6]],
  ['lamp', [17,5,18], [20.8,2,19.6]],
  ['street', [0,3.2,18.5], [0,.1,14.5]],
  ['sidewalk', [-3.5,1.8,12], [-2,.05,10.5]],
  ['boulevard', [24,5,14], [19.8,.02,8]],
  ['street-lamp', [8,3,20], [5.6,2,17.2]],
  ['bench', [4,3,4], [0,.6,2.18]],
];
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const results = {phase, timestamp:new Date().toISOString(), metrics:[],errors:[],console:[],glbs:[],failedRequests:[]};
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    page.on('pageerror',e=>results.errors.push(String(e)));
    page.on('console',m=>{if(['warning','error'].includes(m.type()))results.console.push(m.text());});
    page.on('requestfailed',r=>results.failedRequests.push({url:r.url(),error:r.failure()}));
    page.on('response',r=>{if(r.url().includes('.glb'))results.glbs.push({url:r.url(),status:r.status()});});
    await page.goto('http://127.0.0.1:5180');
    await page.waitForTimeout(7000);
    const guide = page.getByRole('button',{name:'Ẩn hướng dẫn'});
    if(await guide.isVisible()) await guide.click();
    async function capture(name){
      await page.waitForTimeout(1600);
      results.metrics.push(await page.evaluate(async name=>{
        const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');
        const THREE=await import('/node_modules/.vite/deps/three.js');
        const s=_roots.get(document.querySelector('canvas')).store.getState();
        const times=[];let prev;
        await new Promise(resolve=>{function tick(t){if(prev!==undefined)times.push(t-prev);prev=t;if(times.length<120)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
        const batches=[];
        s.scene.traverse(o=>{
          if(!o.name.startsWith('exterior-glb:'))return;
          const bounds=new THREE.Box3().setFromObject(o);
          batches.push({name:o.name,min:bounds.min.toArray(),max:bounds.max.toArray(),parts:o.children.length,visibleInstances:o.children.reduce((n,c)=>n+(c.count||0),0)});
        });
        return {name,fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),calls:s.gl.info.render.calls,triangles:s.gl.info.render.triangles,memory:s.gl.info.memory,camera:s.camera.position.toArray(),webglError:s.gl.getContext().getError(),batches};
      },name));
      await page.screenshot({path:path.join(dir,name+'.png')});
      fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));
    }
    const include=name=>!requested.length||requested.includes(name);
    if(include('explore'))await capture('explore');
    if(include('overview')){
      await page.getByRole('button',{name:'🌐 Toàn cảnh',exact:true}).click();
      await capture('overview');
    }
    for(const [name,position,target] of views){
      if(!include(name))continue;
      await page.evaluate(async({position,target})=>{
        window.auditUnsubscribe?.();
        const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');
        const THREE=await import('/node_modules/.vite/deps/three.js');
        const store=_roots.get(document.querySelector('canvas')).store;
        const s=store.getState();
        const camera=new THREE.PerspectiveCamera(45,s.size.width/s.size.height,.1,250);
        camera.position.fromArray(position);camera.lookAt(...target);
        store.setState({camera});
        window.auditUnsubscribe=s.internal.subscribe({current:s=>s.gl.render(s.scene,camera)},1,store);
      },{position,target});
      await capture(name);
    }
    if(include('mobile')){
      await page.setViewportSize({width:390,height:844});
      await page.reload();await page.waitForTimeout(6000);
      if(await guide.isVisible())await guide.click();
      await capture('mobile');
    }
  } finally {await browser.close();fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify({phase,metrics:results.metrics.map(({name,fps,calls,triangles,webglError})=>({name,fps,calls,triangles,webglError})),errors:results.errors,console:results.console,glbs:results.glbs.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
