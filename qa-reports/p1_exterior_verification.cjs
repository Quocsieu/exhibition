const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://127.0.0.1:5180';
const OUT_DIR = path.resolve(__dirname, 'p1-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function verifyP1() {
  console.log('[P1-QA] Starting P1 Exterior Props Verification...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  console.log('[P1-QA] Navigating to', BASE_URL);
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
    const shotPath = path.join(OUT_DIR, 'p1_01_overview.png');
    await page.screenshot({ path: shotPath });
    console.log('[P1-QA] Saved p1_01_overview.png');
  }

  // 2. Explore mode
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if ((await exploreBtn.count()) > 0) {
    await exploreBtn.click();
    await page.waitForTimeout(2500);
    const shotPath = path.join(OUT_DIR, 'p1_02_explore.png');
    await page.screenshot({ path: shotPath });
    console.log('[P1-QA] Saved p1_02_explore.png');
  }

  // 3. Move player near Rest Lounge Pavilions
  // Keyboard WASD or click-to-move to capture close-ups of the lounge zones
  // We can click near each lounge zone on the canvas
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();

  // Loop over booth chips using exact p0 pattern
  const chips = page.locator('.booth-chip');
  const chipCount = await chips.count();
  console.log(`[P1-QA] Found ${chipCount} booth chips`);

  for (let i = 0; i < Math.min(chipCount, 4); i++) {
    const chip = page.locator('.booth-chip').nth(i);
    const boothName = await chip.innerText();
    console.log(`[P1-QA] Focusing Booth ${i + 1}: ${boothName}...`);
    await chip.click();
    await page.waitForTimeout(2000);

    const shotName = `p1_0${i + 3}_booth_${i + 1}_${boothName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shotName) });
    console.log(`[P1-QA] Saved ${shotName}`);

    // Return to explore mode
    const backBtn = page.locator('.shop-showcase-back-btn, button:has-text("Quay lại")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();
      await page.waitForTimeout(1200);
    }
  }

  // Copy screenshots to artifact directory
  const artifactDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
  for (const f of fs.readdirSync(OUT_DIR)) {
    try {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(artifactDir, f));
      console.log(`[P1-QA] Copied ${f} to artifacts directory`);
    } catch (e) {
      console.warn(`[P1-QA] Could not copy ${f}:`, e.message);
    }
  }

  // Return to Overview
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(1500);
  }

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    status: errors.length === 0 ? 'PASS' : 'WARN',
    errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'p1_report.json'), JSON.stringify(report, null, 2));
  console.log('[P1-QA] Complete! Report:', report);
}

verifyP1().catch(err => {
  console.error('[P1-QA] ERROR:', err);
  process.exit(1);
});
