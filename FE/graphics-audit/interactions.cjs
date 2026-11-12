const fs = require('node:fs');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const results = [], errors = [], warnings = [];
  const httpErrors = [];
  page.on('response', r => { if (r.status() >= 400) httpErrors.push({ url: r.url(), status: r.status() }); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (['error','warning'].includes(m.type())) warnings.push(m.text()); });
  const check = (name, pass, evidence) => results.push({ name, status: pass ? 'PASS' : 'FAIL', evidence });
  async function camera() { return page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    return { position: s.camera.position.toArray(), quaternion: s.camera.quaternion.toArray() };
  }); }
  const difference = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
  await page.goto('http://127.0.0.1:5180'); await page.waitForTimeout(7000);
  await page.getByRole('button', { name: 'Ẩn hướng dẫn' }).click();
  const assets = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
    const out = [];
    scene.traverse(o => {
      if (!o.name.startsWith('exterior-glb:')) return;
      const box = new THREE.Box3().setFromObject(o);
      out.push({ name: o.name, min: box.min.toArray(), max: box.max.toArray(), parts: o.children.length });
    });
    return out;
  });
  check('9 imported asset batches rendered', assets.length === 9, assets);
  const fountain = assets.find(a=>a.name==='exterior-glb:fountain');
  check('Fountain remains inside existing +/-2.4 collision box', fountain && [0,2].every(i=>fountain.min[i]>=-2.4 && fountain.max[i]<=2.4), fountain);
  const before = await camera();
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d'); await page.waitForTimeout(400);
  const moved = await camera(); check('WASD movement', difference(before.position,moved.position)>.2, {before,moved});
  await page.mouse.move(700,500); await page.mouse.down(); await page.mouse.move(900,510,{steps:12}); await page.mouse.up(); await page.waitForTimeout(500);
  const rotated = await camera(); check('Mouse drag camera',difference(moved.quaternion,rotated.quaternion)>.1,{moved,rotated});
  await page.getByRole('button',{name:'Aether Tech Lab',exact:true}).click(); await page.waitForTimeout(2200);
  check('Booth focus by UI',difference((await camera()).position,rotated.position)>1,await camera());
  await page.screenshot({path:'FE/graphics-audit/after-booth-focus.png'});
  await page.reload(); await page.waitForTimeout(6000);
  await page.getByRole('button', { name: 'Ẩn hướng dẫn' }).click();
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  async function drag(x,y,dx,dy,hold=400) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});
    await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(500);
  }
  const touchBefore=await camera(); await drag(180,400,100,0);const touchAfter=await camera();
  check('Touch camera (CDP touch input)',difference(touchBefore.quaternion,touchAfter.quaternion)>.1,{touchBefore,touchAfter});
  const rect=await page.locator('.mobile-joystick').boundingBox();
  const joystickBefore=await camera(); await drag(rect.x+rect.width/2,rect.y+rect.height/2,35,0,700);const joystickAfter=await camera();
  check('Joystick (CDP touch input)',difference(joystickBefore.position,joystickAfter.position)>.15,{joystickBefore,joystickAfter});
  check('Mobile canvas fits viewport', await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),await page.viewportSize());
  check('Normal load: no WebGL/page errors',errors.length===0&&!warnings.some(m=>/WebGL|GL_INVALID|exterior.*unavailable/.test(m)),{errors,warnings});
  const failurePage=await browser.newPage();const failureWarnings=[];
  failurePage.on('console',m=>{if(m.text().includes('[exterior]'))failureWarnings.push(m.text())});
  await failurePage.route('**/models/exterior/*.glb',route=>route.abort());
  await failurePage.goto('http://127.0.0.1:5180');await failurePage.waitForTimeout(5000);
  check('Failed asset fallback',failureWarnings.length>=9&&await failurePage.locator('canvas').count()===1,{warnings:failureWarnings.length});
  fs.writeFileSync('FE/graphics-audit/interactions.json',JSON.stringify({results,errors,warnings,httpErrors},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
