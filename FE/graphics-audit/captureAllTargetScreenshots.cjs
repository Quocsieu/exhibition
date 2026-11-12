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

  const boothSpecs = [
    { index: 0, file: 'after-booth-aether.png', name: 'Aether Tech Lab' },
    { index: 1, file: 'after-booth-nordic.png', name: 'Nordic Living Studio' },
    { index: 2, file: 'after-booth-ecovita.png', name: 'EcoVita Roastery' },
    { index: 3, file: 'after-booth-kinetix.png', name: 'Kinetix Robotics' },
    { index: 4, file: 'after-booth-lumina.png', name: 'Lumina Design' },
    { index: 5, file: 'after-booth-solaris.png', name: 'Solaris Energy' },
  ];

  for (const spec of boothSpecs) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    console.log(`[Capture] Navigating for booth ${spec.index + 1}: ${spec.name}...`);
    await page.goto('http://127.0.0.1:5180');
    await page.waitForTimeout(3000);

    const hideBtn = page.getByRole('button', { name: 'Ẩn hướng dẫn' });
    if (await hideBtn.count()) {
      await hideBtn.click();
      await page.waitForTimeout(300);
    }

    const chip = page.locator('.booth-chip').nth(spec.index);
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(2500);
      const boothBuffer = await page.screenshot();
      fs.writeFileSync(path.join(auditDir, spec.file), boothBuffer);
      fs.writeFileSync(path.join(artifactsDir, spec.file), boothBuffer);
      console.log(`[Capture] Successfully saved ${spec.file}`);
    }
    await page.close();
  }

  await browser.close();
  console.log('[Capture] All 6 booth showcases successfully captured!');
})().catch((err) => {
  console.error('[Capture Error]', err);
  process.exit(1);
});
