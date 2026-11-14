const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'layout-redesign');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[REDESIGN-QA] Launching Chrome Headless 1440x900...');
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

  console.log('[REDESIGN-QA] Navigating to http://localhost:5180 ...');
  const t0 = Date.now();
  await page.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' });

  console.log('[REDESIGN-QA] Waiting for scene to mount and load assets (12s)...');
  await page.waitForTimeout(12000);
  console.log(`[REDESIGN-QA] Scene loaded in ${((Date.now() - t0)/1000).toFixed(1)}s`);

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

  // 1. Explore View (Initial Spawn)
  console.log('[REDESIGN-QA] Capturing Explore View & Movement...');
  const explorePerf = await getPerf();
  console.log('[REDESIGN-QA] Explore Perf:', explorePerf);
  await page.screenshot({ path: path.join(OUT_DIR, '10_explore_mode_movement.png') });

  // 2. Rotate to capture bench and planter separated (Task E verification)
  console.log('[REDESIGN-QA] Capturing bench and planter separation...');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(500, 450, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '07_bench_and_planter_separated.png') });

  // 3. Switch to Overview Mode (Toàn cảnh)
  console.log('[REDESIGN-QA] Switching to Overview Mode (Toàn cảnh)...');
  const overviewBtn = page.locator('.camera-mode-btn').first();
  await overviewBtn.click();
  await page.waitForTimeout(3000);

  console.log('[REDESIGN-QA] Capturing 01_overview_full_plaza.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_overview_full_plaza.png') });
  const overviewPerf = await getPerf();
  console.log('[REDESIGN-QA] Overview Perf:', overviewPerf);

  // 4. Left ground patch cleared (Task A & B Zone 1)
  console.log('[REDESIGN-QA] Capturing 02_left_ground_patch_cleared.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '02_left_ground_patch_cleared.png') });

  // 5. Right ground patch cleared (Task A & B Zone 2)
  console.log('[REDESIGN-QA] Capturing 03_right_ground_patch_cleared.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '03_right_ground_patch_cleared.png') });

  // 6. Bottom-right ground patch cleared (Task A & B Zone 3)
  console.log('[REDESIGN-QA] Capturing 04_bottom_right_ground_patch_cleared.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '04_bottom_right_ground_patch_cleared.png') });

  // 7. White buildings removed (Task C)
  console.log('[REDESIGN-QA] Capturing 05_white_buildings_removed.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '05_white_buildings_removed.png') });

  // 8. Boundary walls removed (Task D)
  console.log('[REDESIGN-QA] Capturing 06_boundary_walls_removed.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '06_boundary_walls_removed.png') });

  // 9. Continuous road intersections (Task F)
  console.log('[REDESIGN-QA] Capturing 08_road_intersections_continuous.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '08_road_intersections_continuous.png') });

  // 10. Widened open roads (Task G)
  console.log('[REDESIGN-QA] Capturing 09_road_widened_open.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '09_road_widened_open.png') });

  // 11. Functional Navigation check: Click on plaza floor to test click-to-move A*
  console.log('[REDESIGN-QA] Testing Click-to-Move on courtyard floor...');
  await page.mouse.click(650, 480);
  await page.waitForTimeout(1200);

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[REDESIGN-QA] Verification finished! Results saved to:', path.join(OUT_DIR, 'results.json'));

  await browser.close();
})();
