const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const artifactsDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
const auditDir = path.resolve(__dirname);

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await page.goto('http://127.0.0.1:5180');
  await page.waitForTimeout(4000);

  const hideBtn = page.getByRole('button', { name: 'Ẩn hướng dẫn' });
  if (await hideBtn.count()) {
    await hideBtn.click();
    await page.waitForTimeout(500);
  }

  // 1. Explore view
  console.log('[Capture] Capturing restored after-explore.png...');
  await page.waitForTimeout(2000);
  const exploreBuffer = await page.screenshot();
  fs.writeFileSync(path.join(auditDir, 'after-explore.png'), exploreBuffer);
  fs.writeFileSync(path.join(artifactsDir, 'after-explore.png'), exploreBuffer);

  // 2. Overview view
  console.log('[Capture] Capturing restored after-overview.png...');
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if (await overviewBtn.count()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }
  const overviewBuffer = await page.screenshot();
  fs.writeFileSync(path.join(auditDir, 'after-overview.png'), overviewBuffer);
  fs.writeFileSync(path.join(artifactsDir, 'after-overview.png'), overviewBuffer);

  await browser.close();
  console.log('[Capture] Overview and Explore views captured successfully!');
})().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
