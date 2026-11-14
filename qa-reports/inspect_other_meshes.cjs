const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const breakdown = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const canvas = document.querySelector('canvas');
    const state = _roots.get(canvas).store.getState();
    const scene = state.scene;

    const names = {};
    scene.traverse((obj) => {
      if (obj.isMesh && !obj.isInstancedMesh) {
        let parentName = obj.parent ? (obj.parent.name || obj.parent.type) : 'root';
        const key = `${parentName} > ${obj.name || obj.type} (${obj.geometry?.type})`;
        names[key] = (names[key] || 0) + 1;
      }
    });
    return names;
  });

  console.log('Top mesh types:', Object.entries(breakdown).sort((a,b)=>b[1]-a[1]).slice(0, 35));
  await browser.close();
})();
