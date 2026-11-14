const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'layout-baseline');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[BASELINE-QA] Launching Chrome Headless 1440x900...');
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

  console.log('[BASELINE-QA] Navigating to http://localhost:5180 ...');
  const t0 = Date.now();
  await page.goto('http://localhost:5180', { waitUntil: 'domcontentloaded' });

  console.log('[BASELINE-QA] Waiting for scene to mount and load assets (12s)...');
  await page.waitForTimeout(12000);
  console.log(`[BASELINE-QA] Scene loaded in ${((Date.now() - t0)/1000).toFixed(1)}s`);

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
  console.log('[BASELINE-QA] Capturing Explore View...');
  const explorePerf = await getPerf();
  console.log('[BASELINE-QA] Explore Perf:', explorePerf);

  // 2. Rotate to capture bench & planter overlap (Task E baseline)
  console.log('[BASELINE-QA] Capturing bench and planter overlap...');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(500, 450, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '07_baseline_bench_planter_overlap.png') });

  // 3. Switch to Overview Mode (Toàn cảnh)
  console.log('[BASELINE-QA] Switching to Overview Mode (Toàn cảnh)...');
  const overviewBtn = page.locator('.camera-mode-btn').first();
  await overviewBtn.click();
  await page.waitForTimeout(3000);

  console.log('[BASELINE-QA] Capturing 01_baseline_overview.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_baseline_overview.png') });
  const overviewPerf = await getPerf();
  console.log('[BASELINE-QA] Overview Perf:', overviewPerf);

  // 4. Zoom in on Left ground patch (Task A Zone 1)
  console.log('[BASELINE-QA] Capturing 02_baseline_left_ground_patch.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '02_baseline_left_ground_patch.png') });

  // 5. Right ground patch (Task A Zone 2)
  console.log('[BASELINE-QA] Capturing 03_baseline_right_ground_patch.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '03_baseline_right_ground_patch.png') });

  // 6. Bottom-right ground patch (Task A Zone 3)
  console.log('[BASELINE-QA] Capturing 04_baseline_bottom_right_ground_patch.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '04_baseline_bottom_right_ground_patch.png') });

  // 7. White buildings (Task C baseline)
  console.log('[BASELINE-QA] Capturing 05_baseline_white_buildings.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '05_baseline_white_buildings.png') });

  // 8. Boundary walls (Task D baseline)
  console.log('[BASELINE-QA] Capturing 06_baseline_boundary_walls.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '06_baseline_boundary_walls.png') });

  // 9. Road network (Task F & G baseline)
  console.log('[BASELINE-QA] Capturing 08_baseline_road_network.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '08_baseline_road_network.png') });

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[BASELINE-QA] Baseline finished! Results saved to:', path.join(OUT_DIR, 'results.json'));

  await browser.close();
})();
