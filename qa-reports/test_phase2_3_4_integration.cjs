const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'phase2-3-4-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[MASTER-QA] Launching Chrome Headless 1440x900...');
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

  console.log('[MASTER-QA] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  console.log('[MASTER-QA] Waiting for scene to mount and load assets...');
  await page.waitForTimeout(10000);
  console.log(`[MASTER-QA] Scene loaded in ${((Date.now() - t0)/1000).toFixed(1)}s`);

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

  // 1. Explore View (Central plaza with new Street Lamps, trash bins, planters)
  console.log('[MASTER-QA] Capturing Explore View...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_explore_view_street_lamps_and_decor.png') });
  const explorePerf = await getPerf();
  console.log('[MASTER-QA] Explore Perf:', explorePerf);

  // 2. Walk towards Booth 2 (Nordic Living) and inspect entrance planters
  console.log('[MASTER-QA] Walking towards Booth 2 to check booth planters...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, '02_close_up_booth_planter_decor.png') });

  // 3. Switch to Overview Mode (Shows skyline buildings & pavilion ground slabs)
  console.log('[MASTER-QA] Switching to Overview mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '03_overview_skyline_and_ground_slabs.png') });
  const overviewPerf = await getPerf();
  console.log('[MASTER-QA] Overview Perf:', overviewPerf);

  // 4. Test Booth focus & product modal
  console.log('[MASTER-QA] Switching back to Explore mode...');
  const exploreBtn = page.getByRole('button', { name: /Khám phá/i });
  if (await exploreBtn.isVisible()) {
    await exploreBtn.click();
    await page.waitForTimeout(1500);
  }
  const boothChip = page.locator('.booth-chip').nth(1); // Booth 2
  let boothModalPassed = false;
  if (await boothChip.isVisible().catch(() => false)) {
    await boothChip.click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT_DIR, '04_booth_focus_and_modal.png') });
    boothModalPassed = true;
  }

  // 5. Test WASD movement
  console.log('[MASTER-QA] Testing WASD walking...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '05_wasd_movement_check.png') });

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    boothModalPassed,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[MASTER-QA] Verification finished! Results saved to:', path.join(OUT_DIR, 'results.json'));

  await browser.close();
})();
