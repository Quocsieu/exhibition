// Run from repository root; tooling lives outside application dependencies.
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');
const fs = require('node:fs');
const phase = process.argv[2] || 'before';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.url().includes('.glb')) requests.push({ url: r.url(), status: r.status() }); });
  await page.goto('http://127.0.0.1:5180');
  await page.waitForTimeout(7000);
  const close = page.getByRole('button', { name: '✕', exact: true });
  if (await close.count()) await close.first().click();
  const metrics = [];
  async function capture(name) {
    await page.waitForTimeout(2500);
    metrics.push(await page.evaluate(async name => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const state = _roots.get(document.querySelector('canvas')).store.getState();
      const times = []; let previous = performance.now();
      await new Promise(resolve => { function tick(t) { times.push(t - previous); previous = t; if (times.length < 120) requestAnimationFrame(tick); else resolve(); } requestAnimationFrame(tick); });
      times.shift(); times.sort((a,b) => a-b);
      return { name, fps: 1000 / (times.reduce((a,b)=>a+b,0)/times.length), p95FrameMs: times[Math.floor(times.length*.95)], calls: state.gl.info.render.calls, triangles: state.gl.info.render.triangles, memory: state.gl.info.memory, camera: state.camera.position.toArray(), renderer: state.gl.getContext().getParameter(state.gl.getContext().RENDERER) };
    }, name));
    await page.screenshot({ path: `FE/graphics-audit/${phase}-${name}.png` });
  }
  await capture('explore');
  await page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true }).click();
  await capture('overview');
  for (const [name, position, target] of [
    ['tree', [24, 5, 15], [20.5, 3, 18.5]],
    ['fountain', [5, 4, 6], [0, 1, 0]],
    ['building', [-16, 9, -18], [-23, 6, -33]],
  ]) {
    await page.evaluate(async ({ position, target }) => {
      window.auditUnsubscribe?.();
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const store = _roots.get(document.querySelector('canvas')).store;
      const state = store.getState();
      const camera = new THREE.PerspectiveCamera(45, state.size.width / state.size.height, .1, 220);
      camera.position.fromArray(position); camera.lookAt(...target);
      window.auditOriginalCamera ||= state.camera;
      store.setState({ camera });
      window.auditUnsubscribe = state.internal.subscribe({ current: s => s.gl.render(s.scene, camera) }, 1, store);
    }, { position, target });
    await capture(name);
  }
  await page.evaluate(async () => {
    window.auditUnsubscribe?.();
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    _roots.get(document.querySelector('canvas')).store.setState({ camera: window.auditOriginalCamera });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '🚶 Tham quan', exact: true }).click();
  await capture('mobile');
  fs.writeFileSync(`FE/graphics-audit/${phase}.json`, JSON.stringify({ metrics, errors, requests }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
