const fs=require('node:fs');
const {chromium}=require(process.env.TEMP+'/expo-graphics-tools/node_modules/playwright-core');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const result={warnings:[],errors:[],aborted:[],status:'NOT RUN'};
  try{
    const page=await browser.newPage();
    page.on('pageerror',e=>result.errors.push(String(e)));
    page.on('console',m=>{if(m.text().includes('[exterior]'))result.warnings.push(m.text());});
    await page.route('**/models/exterior/*.glb',r=>{result.aborted.push(r.request().url());return r.abort();});
    await page.goto('http://127.0.0.1:5180');
    // Wait for all loaders, rather than assuming a slow machine mounts in 5 seconds.
    const deadline=Date.now()+45000;
    while(result.warnings.length<13&&Date.now()<deadline)await page.waitForTimeout(500);
    await page.waitForTimeout(2000);
    result.render=await page.evaluate(async()=>{
      const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const s=_roots.get(document.querySelector('canvas'))?.store.getState();
      return s?{calls:s.gl.info.render.calls,triangles:s.gl.info.render.triangles,webglError:s.gl.getContext().getError()}:null;
    });
    result.status=result.warnings.length>=13&&result.aborted.length>=13&&result.errors.length===0&&result.render?.triangles>0&&result.render.webglError===0?'PASS':'FAIL';
    await page.screenshot({path:'qa-reports/graphics-continuation/fallback-recheck.png'});
  }finally{await browser.close();fs.writeFileSync('qa-reports/graphics-continuation/fallback-recheck.json',JSON.stringify(result,null,2),{flag:'wx'});}
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
