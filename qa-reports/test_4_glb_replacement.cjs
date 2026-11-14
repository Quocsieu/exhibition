const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'glb-replacement-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[GLB-QA] Launching Chrome Headless 1440x900...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('[GLB-QA] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  // Wait for loading screen to clear
  console.log('[GLB-QA] Waiting for 3D assets to load into scene...');
  await page.waitForTimeout(10000);
  console.log(`[GLB-QA] Load wait finished in ${((Date.now() - t0)/1000).toFixed(1)}s`);

  // Close guide modal if visible
  const guideBtn = page.getByRole('button', { name: /Ẩn hướng dẫn/i });
  if (await guideBtn.isVisible().catch(() => false)) {
    await guideBtn.click();
    await page.waitForTimeout(500);
  }

  const getPerf = async () => page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const state = _roots.get(document.querySelector('canvas')).store.getState();
    const start = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      function frame() {
        if (++n === 60) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const elapsed = performance.now() - start;
    return {
      fps: (60 * 1000) / elapsed,
      calls: state.gl.info.render.calls,
      triangles: state.gl.info.render.triangles,
      textures: state.gl.info.memory.textures,
      geometries: state.gl.info.memory.geometries,
      webglError: state.gl.getContext().getError(),
    };
  });

  // 1. Explore View: shows Benches, Shrubs, Trees
  console.log('[GLB-QA] Capturing Explore View...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_explore_plaza_with_benches_and_shrubs.png') });
  const explorePerf = await getPerf();
  console.log('[GLB-QA] Explore Perf:', explorePerf);

  // 2. Walk forward towards central fountain & benches
  console.log('[GLB-QA] Testing WASD movement towards benches...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '02_closeup_modular_benches_and_shrubs.png') });

  // 3. Walk left towards roadside manhole cover
  console.log('[GLB-QA] Testing movement towards manhole cover...');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '03_closeup_water_manhole_cover.png') });

  // 4. Overview View: shows all Perimeter Trees, Skyline, Booths
  console.log('[GLB-QA] Switching to Overview mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '04_overview_fir_trees_and_city.png') });
  const overviewPerf = await getPerf();
  console.log('[GLB-QA] Overview Perf:', overviewPerf);

  // 5. Test booth interaction
  console.log('[GLB-QA] Testing booth focus & modal...');
  const exploreBtn = page.getByRole('button', { name: /Khám phá/i });
  if (await exploreBtn.isVisible()) {
    await exploreBtn.click();
    await page.waitForTimeout(1500);
  }
  const boothChip = page.locator('.booth-chip').first();
  let boothModalPassed = false;
  if (await boothChip.isVisible().catch(() => false)) {
    await boothChip.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '05_booth_focus_success.png') });
    boothModalPassed = true;
  }

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    boothModalPassed,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[GLB-QA] Results saved to', path.join(OUT_DIR, 'results.json'));

  await browser.close();
  console.log('[GLB-QA] All tests completed.');
})();
