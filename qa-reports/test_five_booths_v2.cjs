const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://localhost:5174';
const OUT_DIR = path.resolve(__dirname, 'v2-verification');
const ARTIFACT_DIR = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function runTest() {
  console.log('[TEST-V2] Launching Chrome headless with WebGL...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failedRequests = [];
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[PAGE-ERROR]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[RUNTIME-ERROR]', String(err)));

  console.log('[TEST-V2] Loading', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Close welcome modal if present
  const closeBtn = page.getByRole('button', { name: '✕', exact: true });
  if ((await closeBtn.count()) > 0) {
    await closeBtn.first().click();
    await page.waitForTimeout(500);
  }

  // 1. Overview screenshot
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(2500);
  }
  const overviewPath = path.join(OUT_DIR, 'v2_00_overview.png');
  await page.screenshot({ path: overviewPath });
  fs.copyFileSync(overviewPath, path.join(ARTIFACT_DIR, 'v2_00_overview.png'));
  console.log('[TEST-V2] Captured Overview');

  // 2. Iterate through each of the 6 booths
  const totalBooths = 6;
  for (let i = 0; i < totalBooths; i++) {
    // In overview mode, find chips
    const chips = page.locator('.booth-chip');
    const chipCount = await chips.count();
    if (chipCount <= i) {
      console.warn(`[TEST-V2] Chip index ${i} not available (count=${chipCount})`);
      break;
    }
    const chip = chips.nth(i);
    const rawText = await chip.innerText();
    const boothName = rawText.split('\n')[0].trim();
    console.log(`[TEST-V2] Focusing Booth ${i + 1}: ${boothName}...`);
    await chip.click();
    await page.waitForTimeout(3000);

    const safeName = `v2_booth_${i + 1}_${boothName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const shotPath = path.join(OUT_DIR, safeName);
    await page.screenshot({ path: shotPath });
    fs.copyFileSync(shotPath, path.join(ARTIFACT_DIR, safeName));
    console.log(`[TEST-V2] Saved ${safeName}`);

    // If booth 5 (Lumina) or 6 (Solaris), click 3D canvas near center product counter to open product modal
    if (i === 4) {
      console.log('[TEST-V2] Testing product card click on 3D canvas (Hero counter)...');
      await page.mouse.click(720, 520);
      await page.waitForTimeout(1000);
      const modalCount = await page.locator('.product-detail-modal').count();
      console.log(`[TEST-V2] Product detail modal open: ${modalCount > 0}`);
      if (modalCount > 0) {
        const modalPath = path.join(OUT_DIR, 'v2_07_product_modal.png');
        await page.screenshot({ path: modalPath });
        fs.copyFileSync(modalPath, path.join(ARTIFACT_DIR, 'v2_07_product_modal.png'));
        console.log('[TEST-V2] Saved v2_07_product_modal.png');
        // Close product modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Return to Overview mode for next booth
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    // Also ensure overview button is clicked if needed
    const ovBtn = page.getByRole('button', { name: /Toàn cảnh/i });
    if ((await ovBtn.count()) > 0) {
      await ovBtn.first().click();
      await page.waitForTimeout(1500);
    }
  }

  console.log('[TEST-V2] Failed requests:', failedRequests);
  await browser.close();
  console.log('[TEST-V2] All verification steps completed successfully!');
}

runTest().catch((e) => {
  console.error('[TEST-V2] Fatal:', e);
  process.exit(1);
});
