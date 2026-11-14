const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://localhost:5174';
const OUT_DIR = path.resolve(__dirname, 'v2-verification');
const ARTIFACT_DIR = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';

async function testModal() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Close guide
  const closeBtn = page.getByRole('button', { name: '✕', exact: true });
  if ((await closeBtn.count()) > 0) {
    await closeBtn.first().click();
    await page.waitForTimeout(500);
  }

  // Focus Booth 1: Aether Tech Lab
  const chip = page.locator('.booth-chip').first();
  await chip.click();
  await page.waitForTimeout(3000);

  // Click on the product card at center-left hero counter: (575, 580)
  console.log('[MODAL-TEST] Clicking 3D canvas at (575, 580)...');
  await page.mouse.click(575, 580);
  await page.waitForTimeout(1500);

  const modal = page.locator('.product-detail-modal');
  const count = await modal.count();
  console.log('[MODAL-TEST] Modal count:', count);
  if (count > 0) {
    const modalPath = path.join(OUT_DIR, 'v2_07_product_modal.png');
    await page.screenshot({ path: modalPath });
    fs.copyFileSync(modalPath, path.join(ARTIFACT_DIR, 'v2_07_product_modal.png'));
    console.log('[MODAL-TEST] Captured and copied v2_07_product_modal.png');
  }

  await browser.close();
}

testModal().catch((e) => {
  console.error('[MODAL-TEST] Error:', e);
  process.exit(1);
});
