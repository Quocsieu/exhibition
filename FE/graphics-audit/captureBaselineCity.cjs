const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const artifactsDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
const auditDir = path.resolve(__dirname);
const phase = process.argv[2] || 'before';

(async () => {
  console.log(`[Capture] Starting ${phase} capture on http://localhost:5173...`);
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(6000);

  // Dismiss guide modal if present
  const hideBtn = page.getByRole('button', { name: '✕', exact: true });
  if (await hideBtn.count()) {
    await hideBtn.first().click();
    await page.waitForTimeout(500);
  }

  const metrics = [];

  async function capture(name, filename) {
    await page.waitForTimeout(2000);
    const metric = await page.evaluate(async (name) => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const state = _roots.get(document.querySelector('canvas')).store.getState();
      const times = [];
      let previous = performance.now();
      await new Promise((resolve) => {
        function tick(t) {
          times.push(t - previous);
          previous = t;
          if (times.length < 90) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      times.shift();
      times.sort((a, b) => a - b);
      return {
        name,
        fps: Math.round(1000 / (times.reduce((a, b) => a + b, 0) / times.length)),
        calls: state.gl.info.render.calls,
        triangles: state.gl.info.render.triangles,
        textures: state.gl.info.memory.textures,
        geometries: state.gl.info.memory.geometries,
      };
    }, name);

    metrics.push(metric);
    console.log(`[Metric - ${name}] FPS: ${metric.fps} | Calls: ${metric.calls} | Tris: ${metric.triangles.toLocaleString()}`);

    const shot = await page.screenshot();
    const dest1 = path.join(auditDir, `${phase}-${filename}.png`);
    const dest2 = path.join(artifactsDir, `${phase}-${filename}.png`);
    fs.writeFileSync(dest1, shot);
    fs.writeFileSync(dest2, shot);
    console.log(`Saved screenshot: ${phase}-${filename}.png`);
  }

  // 1. Explore View
  await capture('explore', 'explore');

  // 2. Overview View
  const overviewBtn = page.getByRole('button', { name: 'Toàn cảnh', exact: false });
  if (await overviewBtn.count()) {
    await overviewBtn.first().click();
    await capture('overview', 'overview');
  }

  // Camera Helper for Custom Close-Ups
  async function setCustomCamera(position, target) {
    await page.evaluate(async ({ position, target }) => {
      window.auditUnsubscribe?.();
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const store = _roots.get(document.querySelector('canvas')).store;
      const state = store.getState();
      const camera = new THREE.PerspectiveCamera(45, state.size.width / state.size.height, 0.1, 250);
      camera.position.fromArray(position);
      camera.lookAt(...target);
      window.auditOriginalCamera ||= state.camera;
      store.setState({ camera });
      window.auditUnsubscribe = state.internal.subscribe(
        { current: (s) => s.gl.render(s.scene, camera) },
        1,
        store
      );
    }, { position, target });
  }

  // 3. Street Close-Up (South Entrance Boulevard & Crosswalks)
  await setCustomCamera([0, 3.2, 18.5], [0, 0.1, 14.5]);
  await capture('street', 'street');

  // 4. Sidewalk Close-Up (Paver & Curb Detail)
  await setCustomCamera([-3.5, 1.8, 12.0], [-2.0, 0.05, 10.5]);
  await capture('sidewalk', 'sidewalk');

  // 5. Buildings Skyline Close-Up (North/West Architecture)
  await setCustomCamera([-14, 8.5, -16], [-28, 9, -28]);
  await capture('buildings', 'buildings');

  // 6. Central Plaza Close-Up (Paving Medallion & Fountain)
  await setCustomCamera([5.2, 3.8, 5.8], [0, 1.2, 0]);
  await capture('plaza', 'plaza');

  // 7. Mobile Viewport (390 x 844)
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await mobilePage.goto('http://localhost:5173');
  await mobilePage.waitForTimeout(4000);
  const mHide = mobilePage.getByRole('button', { name: '✕', exact: true });
  if (await mHide.count()) await mHide.first().click();
  await mobilePage.waitForTimeout(1000);
  const mShot = await mobilePage.screenshot();
  fs.writeFileSync(path.join(auditDir, `${phase}-mobile.png`), mShot);
  fs.writeFileSync(path.join(artifactsDir, `${phase}-mobile.png`), mShot);
  console.log(`Saved screenshot: ${phase}-mobile.png`);
  await mobilePage.close();

  // Save metrics JSON
  fs.writeFileSync(
    path.join(auditDir, `${phase}-metrics.json`),
    JSON.stringify({ phase, timestamp: new Date().toISOString(), metrics, errors }, null, 2)
  );

  await browser.close();
  console.log(`[Capture] ${phase} capture completed successfully!`);
})().catch((err) => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
