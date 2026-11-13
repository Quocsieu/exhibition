const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'phase2-environment');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function validatePhase2() {
  console.log('[PHASE2-ENV] Starting Phase 2 Environment Evaluation...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = { errors: [], assetResponses: [], metrics: {} };
  page.on('pageerror', (e) => results.errors.push(String(e)));
  page.on('response', (r) => {
    if (r.url().includes('/models/exterior/')) {
      results.assetResponses.push({ url: r.url(), status: r.status() });
    }
  });

  console.log('[PHASE2-ENV] Loading http://127.0.0.1:5180');
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const guide = page.getByRole('button', { name: 'Ẩn hướng dẫn' });
  if (await guide.isVisible()) await guide.click();

  // 1. Overview screenshot (skyline, roads, trees, fountain)
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'env_01_overview_skyline.png') });
    console.log('[PHASE2-ENV] Captured env_01_overview_skyline.png');
  }

  // 2. Explore mode view (pedestrian eye-level)
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if (await exploreBtn.isVisible()) {
    await exploreBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'env_02_explore_fountain_promenade.png') });
    console.log('[PHASE2-ENV] Captured env_02_explore_fountain_promenade.png');
  }

  // 3. Inspect Scene graph objects and verify Exterior Assets in runtime
  const sceneAudit = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    const assetsFound = {};

    s.scene.traverse((o) => {
      if (o.userData && o.userData.exteriorSource) {
        assetsFound[o.userData.exteriorSource] = (assetsFound[o.userData.exteriorSource] || 0) + 1;
      }
    });

    const glInfo = {
      calls: s.gl.info.render.calls,
      triangles: s.gl.info.render.triangles,
      textures: s.gl.info.memory.textures,
      geometries: s.gl.info.memory.geometries,
      webglError: s.gl.getContext().getError(),
    };

    return { assetsFound, glInfo };
  });

  results.sceneAudit = sceneAudit;
  console.log('[PHASE2-ENV] Scene assets loaded:', sceneAudit.assetsFound);
  console.log('[PHASE2-ENV] WebGL Stats:', sceneAudit.glInfo);

  // 4. Close-up on Fountain & Rest Lounge
  // Focus Booth 1 to see NW lounge and avenue
  const chips = page.locator('.booth-chip');
  if ((await chips.count()) >= 1) {
    await chips.nth(0).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'env_03_nw_lounge_avenue.png') });

    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if (await backBtn.isVisible()) await backBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // Focus Booth 6 (Solaris) to see South boulevard & speed bumps
  if ((await chips.count()) >= 6) {
    await chips.nth(5).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'env_04_south_boulevard_speedbumps.png') });

    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if (await backBtn.isVisible()) await backBtn.first().click();
    await page.waitForTimeout(1000);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'phase2_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('[PHASE2-ENV] Phase 2 Validation Complete! Output saved to', OUT_DIR);
}

validatePhase2().catch((e) => {
  console.error('[PHASE2-ENV] ERROR:', e);
  process.exit(1);
});
