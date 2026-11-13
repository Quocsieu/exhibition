const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://127.0.0.1:5180';
const OUT_DIR = path.resolve(__dirname, 'p2-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function verifyP2() {
  console.log('[P2-QA] Starting P2 Environment & Lighting Verification...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  console.log('[P2-QA] Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Dismiss guide if open
  const guide = page.getByRole('button', { name: '✕', exact: true });
  if ((await guide.count()) > 0) await guide.first().click();

  // 1. Overview with refined daylight & soft shadows
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2_01_overview_lighting.png') });
    console.log('[P2-QA] Saved p2_01_overview_lighting.png');
  }

  // 2. Explore mode
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if ((await exploreBtn.count()) > 0) {
    await exploreBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2_02_explore_fountain_view.png') });
    console.log('[P2-QA] Saved p2_02_explore_fountain_view.png');
  }

  // 3. Measure FPS & WebGL rendering stats
  const perfData = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frameCount = 0;
      const start = performance.now();
      function count() {
        frameCount++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(count);
        } else {
          const elapsed = performance.now() - start;
          const fps = Math.round((frameCount * 1000) / elapsed);
          resolve({ fps, frameCount, elapsed });
        }
      }
      requestAnimationFrame(count);
    });
  });
  console.log('[P2-QA] Performance metrics:', perfData);

  // 4. Focus Nordic Living (Booth 2) to see road & speed bump in view
  const chips = page.locator('.booth-chip');
  if ((await chips.count()) >= 2) {
    await chips.nth(1).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2_03_booth2_nordic_road.png') });
    console.log('[P2-QA] Saved p2_03_booth2_nordic_road.png');

    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1000);
    }
  }

  // 5. Focus Solaris (Booth 6)
  if ((await chips.count()) >= 6) {
    await chips.nth(5).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p2_04_booth6_solaris_road.png') });
    console.log('[P2-QA] Saved p2_04_booth6_solaris_road.png');

    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1000);
    }
  }

  await browser.close();

  // Copy screenshots to artifact directory
  const artifactDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
  for (const f of fs.readdirSync(OUT_DIR)) {
    try {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(artifactDir, f));
      console.log(`[P2-QA] Copied ${f} to artifacts directory`);
    } catch {}
  }

  const report = {
    timestamp: new Date().toISOString(),
    status: errors.length === 0 && perfData.fps >= 30 ? 'PASS' : 'WARN',
    fps: perfData.fps,
    errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'p2_report.json'), JSON.stringify(report, null, 2));
  console.log('[P2-QA] Complete! Report:', report);
}

verifyP2().catch(err => {
  console.error('[P2-QA] ERROR:', err);
  process.exit(1);
});
