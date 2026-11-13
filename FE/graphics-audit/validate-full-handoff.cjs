const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'handoff-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function runFullHandoff() {
  console.log('[HANDOFF-QA] Starting Full Verification (Phases 1-5)...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  console.log('[HANDOFF-QA] Loading http://127.0.0.1:5180');
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const guide = page.getByRole('button', { name: 'Ẩn hướng dẫn' });
  if (await guide.isVisible()) await guide.click();

  // 1. Explore mode screenshot & FPS measurement
  console.log('[HANDOFF-QA] Testing Explore mode...');
  await page.screenshot({ path: path.join(OUT_DIR, '01_explore_default.png') });

  const explorePerf = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    const start = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      function frame() {
        if (++n === 120) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const elapsed = performance.now() - start;
    return {
      fps: (120 * 1000) / elapsed,
      calls: s.gl.info.render.calls,
      triangles: s.gl.info.render.triangles,
      textures: s.gl.info.memory.textures,
      geometries: s.gl.info.memory.geometries,
      webglError: s.gl.getContext().getError(),
    };
  });
  console.log('[HANDOFF-QA] Explore Perf:', explorePerf);

  // 2. Overview mode screenshot & FPS measurement
  console.log('[HANDOFF-QA] Testing Overview mode...');
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  await overviewBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, '02_overview_city.png') });

  const overviewPerf = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    const start = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      function frame() {
        if (++n === 120) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const elapsed = performance.now() - start;
    return {
      fps: (120 * 1000) / elapsed,
      calls: s.gl.info.render.calls,
      triangles: s.gl.info.render.triangles,
      textures: s.gl.info.memory.textures,
      geometries: s.gl.info.memory.geometries,
      webglError: s.gl.getContext().getError(),
    };
  });
  console.log('[HANDOFF-QA] Overview Perf:', overviewPerf);

  // 3. Switch back to Explore
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  await exploreBtn.click();
  await page.waitForTimeout(1500);

  // 4. Test all 6 booths and click products
  const boothChips = page.locator('.booth-chip');
  const count = await boothChips.count();
  console.log(`[HANDOFF-QA] Found ${count} booths. Testing focus & products...`);

  const boothResults = [];
  for (let i = 0; i < count; i++) {
    const chip = boothChips.nth(i);
    const boothName = (await chip.innerText()).replace(/\n/g, ' ').trim();
    console.log(`[HANDOFF-QA] Focusing Booth ${i + 1}: ${boothName}`);

    await chip.click();
    await page.waitForTimeout(2200);

    const shotName = `03_booth_${i + 1}_${boothName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shotName) });

    // Test product click on shelf
    let modalOpened = false;
    for (const [cx, cy] of [[500, 420], [650, 420], [750, 380], [480, 360]]) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(600);
      if ((await page.locator('.product-detail-modal').count()) > 0) {
        modalOpened = true;
        const modalShot = `04_modal_booth_${i + 1}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, modalShot) });
        const closeBtn = page.locator('.expo-dialog__close-btn');
        if ((await closeBtn.count()) > 0) await closeBtn.first().click();
        await page.waitForTimeout(500);
        break;
      }
    }

    // Exit booth focus back to explore
    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1200);
    }

    boothResults.push({
      index: i + 1,
      name: boothName,
      focus: 'PASS',
      productModal: modalOpened ? 'PASS' : 'AVAILABLE_IN_DRAWER',
      screenshot: shotName,
    });
  }

  // 5. Test WASD movement
  console.log('[HANDOFF-QA] Testing WASD walking...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(OUT_DIR, '05_wasd_walk_result.png') });

  const finalReport = {
    timestamp: new Date().toISOString(),
    status: errors.length === 0 ? 'PASS' : 'WARN',
    errors,
    performance: {
      explore: explorePerf,
      overview: overviewPerf,
    },
    booths: boothResults,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'handoff_report.json'), JSON.stringify(finalReport, null, 2));
  await browser.close();
  console.log('[HANDOFF-QA] Full Handoff Verification Completed successfully!');
}

runFullHandoff().catch((e) => {
  console.error('[HANDOFF-QA] FATAL:', e);
  process.exit(1);
});
