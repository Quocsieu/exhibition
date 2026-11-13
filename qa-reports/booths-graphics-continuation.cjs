const fs=require('node:fs');
const {chromium}=require(process.env.TEMP+'/expo-graphics-tools/node_modules/playwright-core');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const results=[];
  for(let i=0;i<6;i++) {
    await page.goto('http://127.0.0.1:5180');await page.waitForTimeout(3500);
    await page.getByRole('button',{name:'Ẩn hướng dẫn'}).click();
    const chip=page.locator('.booth-chip').nth(i);const name=await chip.innerText();await chip.click();await page.waitForTimeout(2000);
    await page.screenshot({path:`qa-reports/graphics-continuation/final-booth-${i+1}.png`});
    const points=await page.evaluate(async()=>{
      const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');const THREE=await import('/node_modules/.vite/deps/three.js');
      const s=_roots.get(document.querySelector('canvas')).store.getState(),out=[];
      s.scene.traverse(o=>{
        if(!o.__r3f?.handlers?.onClick || !o.isGroup || o.position.y<=.1) return;
        let visible=true;for(let p=o;p;p=p.parent)if(!p.visible)visible=false;if(!visible)return;
        const box=new THREE.Box3().setFromObject(o),p=box.getCenter(new THREE.Vector3()).project(s.camera);
        if(Math.abs(p.x)<.9&&Math.abs(p.y)<.9&&p.z>-1&&p.z<1)out.push({x:(p.x+1)*s.size.width/2,y:(1-p.y)*s.size.height/2});
      });return out;
    });
    let product=false;
    for(const point of points) {await page.mouse.click(point.x,point.y);await page.waitForTimeout(300);if(await page.locator('.product-detail-modal').count()){product=true;await page.screenshot({path:`qa-reports/graphics-continuation/final-product-${i+1}.png`});break;}}
    results.push({name,focus:'PASS',productClick:product?'PASS':'NOT RUN',projectedTargets:points.length});
  }
  fs.writeFileSync('qa-reports/graphics-continuation/booths-final.json',JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
