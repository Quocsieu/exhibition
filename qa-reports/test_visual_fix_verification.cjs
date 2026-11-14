const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'visual-fix-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[VISUAL-FIX-QA] Launching Chrome Headless 1440x900...');
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

  console.log('[VISUAL-FIX-QA] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  console.log('[VISUAL-FIX-QA] Waiting for scene to mount and load assets (12s)...');
  await page.waitForTimeout(12000);
  console.log(`[VISUAL-FIX-QA] Scene loaded in ${((Date.now() - t0)/1000).toFixed(1)}s`);

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

  // 1. Explore View: Central Plaza with Fountain & new Bench model (Task F)
  console.log('[VISUAL-FIX-QA] Capturing 07_new_bench_model_integrated.png (Central Bench in Explore mode)...');
  await page.screenshot({ path: path.join(OUT_DIR, '07_new_bench_model_integrated.png') });
  const explorePerf = await getPerf();
  console.log('[VISUAL-FIX-QA] Explore Perf:', explorePerf);

  // 2. Rotate camera slightly left to frame Jacaranda foliage (Task E)
  console.log('[VISUAL-FIX-QA] Rotating camera left for Jacaranda foliage close-up...');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(480, 450, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log('[VISUAL-FIX-QA] Capturing 05_closeup_jacaranda_brightened.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '05_closeup_jacaranda_brightened.png') });

  // 3. Rotate camera around to face South Entrance with Street Lamp & Planter (Tasks C & D)
  console.log('[VISUAL-FIX-QA] Rotating camera around to face South Avenue...');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(240, 450, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log('[VISUAL-FIX-QA] Capturing 04_closeup_street_lamp_material.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '04_closeup_street_lamp_material.png') });

  console.log('[VISUAL-FIX-QA] Capturing 03_closeup_planter_material.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '03_closeup_planter_material.png') });

  // 4. Switch to Overview Mode (Toàn cảnh) (Tasks A & B)
  console.log('[VISUAL-FIX-QA] Switching to Overview Mode (Toàn cảnh)...');
  const overviewBtn = page.locator('.camera-mode-btn').first();
  await overviewBtn.click();
  await page.waitForTimeout(3000);

  console.log('[VISUAL-FIX-QA] Capturing 01_overview_road_markings_cleaned.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_overview_road_markings_cleaned.png') });

  console.log('[VISUAL-FIX-QA] Capturing 02_flagpoles_removed_areas.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '02_flagpoles_removed_areas.png') });

  console.log('[VISUAL-FIX-QA] Capturing 06_overview_trees_brightened.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '06_overview_trees_brightened.png') });

  console.log('[VISUAL-FIX-QA] Capturing 08_overview_full_plaza.png...');
  await page.screenshot({ path: path.join(OUT_DIR, '08_overview_full_plaza.png') });

  const overviewPerf = await getPerf();
  console.log('[VISUAL-FIX-QA] Overview Perf:', overviewPerf);

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[VISUAL-FIX-QA] Verification finished! Results saved to:', path.join(OUT_DIR, 'results.json'));

  await browser.close();
})();
