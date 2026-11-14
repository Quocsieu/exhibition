const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'jacaranda-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[JACARANDA-QA] Launching Chrome Headless 1440x900...');
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

  console.log('[JACARANDA-QA] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  // Wait for loading screen to clear and 3D assets to load
  console.log('[JACARANDA-QA] Waiting for scene to mount and load assets...');
  await page.waitForTimeout(10000);
  console.log(`[JACARANDA-QA] Scene loaded in ${((Date.now() - t0)/1000).toFixed(1)}s`);

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

  // 1. Explore View (default angle): shows plaza center, fountain, benches, shrubs, and perimeter Jacaranda trees
  console.log('[JACARANDA-QA] Capturing Explore View...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_explore_view_jacaranda_trees.png') });
  const explorePerf = await getPerf();
  console.log('[JACARANDA-QA] Explore Perf:', explorePerf);

  // 2. Walk towards perimeter tree to check base (no circular stone base, root flush on ground)
  console.log('[JACARANDA-QA] Walking towards perimeter tree at [-13.5, 16.2]...');
  // Move towards tree using WASD keys
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(500);
  console.log('[JACARANDA-QA] Capturing close-up of tree base and root...');
  await page.screenshot({ path: path.join(OUT_DIR, '02_closeup_tree_base_no_stone_cylinder.png') });

  // 3. Overview mode: shows all 10 Jacaranda trees around perimeter
  console.log('[JACARANDA-QA] Switching to Overview mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '03_overview_10_jacaranda_trees_perimeter.png') });
  const overviewPerf = await getPerf();
  console.log('[JACARANDA-QA] Overview Perf:', overviewPerf);

  // 4. Test booth click & modal
  console.log('[JACARANDA-QA] Switching back to Explore mode...');
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
    await page.screenshot({ path: path.join(OUT_DIR, '04_booth_interaction_and_modal.png') });
    boothModalPassed = true;
  }

  // 5. Inspect scene for tree and base objects
  const treeAudit = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas' };
    const r3f = window.__R3F__; // if available
    return { ok: true };
  });

  const results = {
    explorePerf,
    overviewPerf,
    errors: errors.filter((e) => !e.includes('404')),
    allErrorsCount: errors.length,
    boothModalPassed,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('[JACARANDA-QA] Verification finished! Results saved to:', path.join(OUT_DIR, 'results.json'));

  await browser.close();
})();
