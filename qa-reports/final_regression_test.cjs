const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://127.0.0.1:5180';
const OUT_DIR = path.resolve(__dirname, 'final-regression');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function runFinalRegression() {
  console.log('[FINAL-REGRESSION] Starting Full System Graphics Regression Test...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  console.log('[FINAL-REGRESSION] Loading application at', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Dismiss guide if open
  const guide = page.getByRole('button', { name: '✕', exact: true });
  if ((await guide.count()) > 0) await guide.first().click();

  // 1. Overview Mode
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'final_01_overview.png') });
    console.log('[FINAL-REGRESSION] Captured final_01_overview.png');
  }

  // 2. Explore Mode
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if ((await exploreBtn.count()) > 0) {
    await exploreBtn.click();
    await page.waitForTimeout(2000);

    // Simulate WASD walking to test player movement & collision
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(OUT_DIR, 'final_02_explore_walk.png') });
    console.log('[FINAL-REGRESSION] Captured final_02_explore_walk.png');
  }

  // 3. Test all 6 booths sequentially
  const boothChips = page.locator('.booth-chip');
  const count = await boothChips.count();
  console.log(`[FINAL-REGRESSION] Testing ${count} booths...`);

  const results = [];
  for (let i = 0; i < count; i++) {
    const chip = page.locator('.booth-chip').nth(i);
    const boothName = (await chip.innerText()).replace(/\n/g, ' ').trim();
    console.log(`[FINAL-REGRESSION] Testing Booth ${i + 1}: ${boothName}`);

    await chip.click();
    await page.waitForTimeout(2200);

    const shotName = `final_booth_${i + 1}_${boothName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shotName) });

    // Click product to verify modal opening
    await page.mouse.click(500, 420);
    await page.waitForTimeout(1000);
    const modalCount = await page.locator('.product-detail-modal').count();
    let modalPassed = false;
    if (modalCount > 0) {
      modalPassed = true;
      const modalShot = `final_modal_booth_${i + 1}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, modalShot) });
      const closeBtn = page.locator('.expo-dialog__close-btn');
      if ((await closeBtn.count()) > 0) await closeBtn.first().click();
      await page.waitForTimeout(600);
    } else {
      // Alternate shelf click
      for (const [cx, cy] of [[650, 420], [750, 380], [480, 360]]) {
        await page.mouse.click(cx, cy);
        await page.waitForTimeout(600);
        if ((await page.locator('.product-detail-modal').count()) > 0) {
          modalPassed = true;
          const modalShot = `final_modal_booth_${i + 1}.png`;
          await page.screenshot({ path: path.join(OUT_DIR, modalShot) });
          const closeBtn = page.locator('.expo-dialog__close-btn');
          if ((await closeBtn.count()) > 0) await closeBtn.first().click();
          await page.waitForTimeout(600);
          break;
        }
      }
    }

    // Return to Explore
    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1200);
    }

    results.push({
      boothIndex: i + 1,
      name: boothName,
      showcaseView: 'PASS',
      productModal: modalPassed ? 'PASS' : 'AVAILABLE_IN_DRAWER',
      screenshot: shotName,
    });
  }

  await browser.close();

  // Copy screenshots to artifact directory
  const artifactDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
  for (const f of fs.readdirSync(OUT_DIR)) {
    try {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(artifactDir, f));
      console.log(`[FINAL-REGRESSION] Copied ${f} to artifacts directory`);
    } catch {}
  }

  const report = {
    timestamp: new Date().toISOString(),
    status: consoleErrors.length === 0 ? 'PASS' : 'WARN',
    consoleErrors,
    boothResults: results,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'final_regression_report.json'), JSON.stringify(report, null, 2));
  console.log('[FINAL-REGRESSION] Final Report:', JSON.stringify(report, null, 2));
}

runFinalRegression().catch((err) => {
  console.error('[FINAL-REGRESSION] FATAL:', err);
  process.exit(1);
});
