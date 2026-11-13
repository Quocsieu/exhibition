const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const BASE_URL = 'http://127.0.0.1:5180';
const OUT_DIR = path.resolve(__dirname, 'tree-audit');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function auditTrees() {
  console.log('[TREE-AUDIT] Inspecting current tree placements...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const guide = page.getByRole('button', { name: '✕', exact: true });
  if ((await guide.count()) > 0) await guide.first().click();

  // Overview
  const overviewBtn = page.getByRole('button', { name: '🌐 Toàn cảnh', exact: true });
  if ((await overviewBtn.count()) > 0) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'tree_audit_overview.png') });
  }

  // Explore mode: Walk to North Road
  const exploreBtn = page.getByRole('button', { name: '🚶 Tham quan', exact: true });
  if ((await exploreBtn.count()) > 0) {
    await exploreBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'tree_audit_explore_center.png') });
  }

  await browser.close();

  const artifactDir = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';
  for (const f of fs.readdirSync(OUT_DIR)) {
    try {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(artifactDir, f));
      console.log(`[TREE-AUDIT] Copied ${f} to artifacts directory`);
    } catch {}
  }
}

auditTrees().catch(console.error);
