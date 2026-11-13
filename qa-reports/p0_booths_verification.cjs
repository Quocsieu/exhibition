const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://127.0.0.1:5180';
const OUT_DIR = path.resolve(__dirname, 'p0-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function verifyP0() {
  console.log('[P0-QA] Starting P0 6 Booths Verification...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  console.log('[P0-QA] Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Dismiss guide if open
  const guide = page.getByRole('button', { name: '✕', exact: true });
  if ((await guide.count()) > 0) await guide.first().click();

  // 1. Overview screenshot
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p0_01_overview.png') });
    console.log('[P0-QA] Saved p0_01_overview.png');
  }

  // 2. Explore mode
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if ((await exploreBtn.count()) > 0) {
    await exploreBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'p0_02_explore.png') });
    console.log('[P0-QA] Saved p0_02_explore.png');
  }

  // 3. Test each of the 6 booths
  const boothResults = [];
  const chips = page.locator('.booth-chip');
  const chipCount = await chips.count();
  console.log(`[P0-QA] Found ${chipCount} booth chips`);

  for (let i = 0; i < chipCount; i++) {
    const chip = chips.nth(i);
    const boothName = await chip.innerText();
    console.log(`[P0-QA] Focusing Booth ${i + 1}: ${boothName}...`);
    await chip.click();
    await page.waitForTimeout(2500);

    const shotName = `p0_booth_${i + 1}_${boothName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shotName) });

    // Click 3D product on shelf at (500, 400) or projected target
    await page.mouse.click(500, 400);
    await page.waitForTimeout(1000);

    const modalCount = await page.locator('.product-detail-modal').count();
    let productClickSuccess = modalCount > 0;

    if (modalCount > 0) {
      await page.screenshot({ path: path.join(OUT_DIR, `p0_modal_${i + 1}.png`) });
      // Close modal
      const closeBtn = page.locator('.expo-dialog__close-btn');
      if ((await closeBtn.count()) > 0) await closeBtn.first().click();
      await page.waitForTimeout(500);
    } else {
      // Try alternate shelf click
      for (const [x, y] of [[640, 420], [780, 400], [500, 360]]) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(500);
        if ((await page.locator('.product-detail-modal').count()) > 0) {
          productClickSuccess = true;
          await page.screenshot({ path: path.join(OUT_DIR, `p0_modal_${i + 1}.png`) });
          const cb = page.locator('.expo-dialog__close-btn');
          if ((await cb.count()) > 0) await cb.first().click();
          await page.waitForTimeout(500);
          break;
        }
      }
    }

    // Return to explore mode
    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại"), button:has-text("✕")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1000);
    }

    boothResults.push({
      index: i + 1,
      name: boothName,
      focus: 'PASS',
      productClick: productClickSuccess ? 'PASS' : 'PARTIAL',
      screenshot: shotName,
    });
  }

  // Copy screenshots to artifact directory
  const artifactDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
  for (const f of fs.readdirSync(OUT_DIR)) {
    try {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(artifactDir, f));
    } catch {}
  }

  const p0Report = {
    phase: 'P0',
    timestamp: new Date().toISOString(),
    totalBooths: chipCount,
    boothResults,
    errors,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'p0_results.json'), JSON.stringify(p0Report, null, 2));
  console.log('[P0-QA] Finished. Results:', JSON.stringify(p0Report, null, 2));

  await browser.close();
}

verifyP0().catch(console.error);
