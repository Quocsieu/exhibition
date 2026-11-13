const fs = require('node:fs');
const {chromium} = require(process.env.TEMP+'/expo-graphics-tools/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const results={checks:[],errors:[],httpErrors:[],glbs:[]};
 page.on('pageerror',e=>results.errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400)results.httpErrors.push({url:r.url(),status:r.status()});if(r.url().includes('.glb'))results.glbs.push({url:r.url(),status:r.status()});});
 const check=(name,pass,evidence)=>results.checks.push({name,status:pass?'PASS':'FAIL',evidence});
 const snap=name=>page.screenshot({path:`FE/graphics-audit/astra-phase1/${name}.png`});
 const camera=()=>page.evaluate(async()=>{const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');return _roots.get(document.querySelector('canvas')).store.getState().camera.position.toArray();});
 await page.goto('http://127.0.0.1:5180');await page.waitForTimeout(7000);
 await page.getByRole('button',{name:'Ẩn hướng dẫn'}).click();
 const explore=page.getByRole('button',{name:'🚶 Tham quan',exact:true});
 check('First normal visit defaults to Explore',await explore.getAttribute('aria-pressed')==='true',await camera());await snap('default-explore');
 await page.reload();await page.waitForTimeout(6000);await page.getByRole('button',{name:'Ẩn hướng dẫn'}).click();
 check('Reload defaults to Explore',await explore.getAttribute('aria-pressed')==='true',await camera());
 await page.getByRole('button',{name:'🌐 Toàn cảnh',exact:true}).click();await page.waitForTimeout(2200);
 check('Overview toggle',await page.getByRole('button',{name:'🌐 Toàn cảnh',exact:true}).getAttribute('aria-pressed')==='true',await camera());await snap('overview-six');
 await explore.click();await page.waitForTimeout(1800);check('Return to Explore',await explore.getAttribute('aria-pressed')==='true',await camera());
 const before=await camera();await page.mouse.move(700,500);await page.mouse.wheel(0,-400);await page.waitForTimeout(1200);const after=await camera();check('Explore wheel zoom',Math.hypot(...after.map((v,i)=>v-before[i]))>.1,{before,after});
 for(let i=0;i<6;i++){
   await page.locator('.booth-chip').nth(i).click();await page.waitForTimeout(1200);
   await page.keyboard.press('Escape');await page.waitForTimeout(1000);
   check(`Booth ${i+1} exit`,await page.locator('.booth-chip').count()===6);
 }
 // Inspector camera only: render the complete architecture at two useful angles.
 for(let i=0;i<6;i++)for(const angle of ['architecture','visitor']){
   await page.evaluate(async({i,angle})=>{
    const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const {DEFAULT_BOOTHS}=await import('/src/types/expo.ts');const THREE=await import('/node_modules/.vite/deps/three.js');
    const store=_roots.get(document.querySelector('canvas')).store,s=store.getState(),b=DEFAULT_BOOTHS[i];
    window.__qaCameraStop?.();
    const transform=(x,y,z)=>new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),b.rotationY).add(new THREE.Vector3(b.positionX,0,b.positionZ));
    const p=angle==='architecture'?transform(8,6.5,11):transform(0,2.8,11),target=transform(0,2,0);
    window.__qaCameraStop=s.internal.subscribe({current:()=>{s.camera.position.copy(p);s.camera.lookAt(target);s.camera.updateMatrixWorld();s.gl.render(s.scene,s.camera);}},1,store);
   },{i,angle});await page.waitForTimeout(1600);await snap(`${angle}-${i+1}`);
 }
 fs.writeFileSync('FE/graphics-audit/astra-phase1/camera-results.json',JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

