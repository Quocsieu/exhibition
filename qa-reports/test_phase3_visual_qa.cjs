const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'planter-replacement');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ARTIFACT_DIR = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';

(async () => {
  console.log('[VISUAL-QA] Launching Chrome Headless 1600x1000...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  console.log('[VISUAL-QA] Navigating to http://localhost:5174 ...');
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  // Close guide modal if visible
  const guideBtn = page.getByRole('button', { name: /Ẩn hướng dẫn/i });
  if (await guideBtn.isVisible().catch(() => false)) {
    await guideBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // 1. Audit scene graph for planter counts and old geometry removal
  const sceneAudit = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();

    let oldPlanterBoxes = 0;
    let oldPlanterSoils = 0;
    let newPlanterInstances = 0;
    let benchInstances = 0;
    let urnInstances = 0;
    let boothPlanterInstances = 0;

    s.scene.traverse((obj) => {
      // Check for old planter box geometry
      if (obj.isMesh && obj.geometry) {
        const p = obj.geometry.parameters;
        if (p && p.width === 1.48 && p.depth === 1.48) oldPlanterBoxes++;
        if (p && p.width === 1.26 && p.depth === 1.26) oldPlanterSoils++;
      }
      // Check for new planter instances / assets
      if (obj.userData?.exteriorSource === 'planter-near-ch') {
        newPlanterInstances++;
      }
    });

    return {
      oldPlanterBoxes,
      oldPlanterSoils,
      consoleErrorsCount: window.__consoleErrors ? window.__consoleErrors.length : 0
    };
  });

  console.log('[VISUAL-QA] Scene Audit:', JSON.stringify(sceneAudit, null, 2));

  // 2. Switch to Overview Mode and capture full scene
  console.log('[VISUAL-QA] Capturing Overview Mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible().catch(() => false)) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
  }

  const fileOverview = path.join(OUT_DIR, '01_after_overview_planters_replaced.png');
  await page.screenshot({ path: fileOverview });
  fs.copyFileSync(fileOverview, path.join(ARTIFACT_DIR, '01_after_overview_planters_replaced.png'));
  console.log('[VISUAL-QA] Saved 01_after_overview_planters_replaced.png');

  // Switch to Explore Mode for close-up shots
  const exploreBtn = page.getByRole('button', { name: /Tham quan/i });
  if (await exploreBtn.isVisible().catch(() => false)) {
    await exploreBtn.click();
    await page.waitForTimeout(1000);
  }

  // Helper to frame camera at target
  async function captureCloseup(camPos, lookAtPos, filename) {
    await page.evaluate(async ({ cam, lookAt }) => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const s = _roots.get(document.querySelector('canvas')).store.getState();
      
      let perspCam = null;
      s.scene.traverse((obj) => {
        if (obj.isPerspectiveCamera && !perspCam) perspCam = obj;
      });
      const camera = perspCam || s.camera;
      camera.position.set(cam[0], cam[1], cam[2]);
      camera.lookAt(new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]));
      camera.updateProjectionMatrix();
      s.gl.render(s.scene, camera);
    }, { cam: camPos, lookAt: lookAtPos });

    await page.waitForTimeout(600);
    const filePath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: filePath });
    fs.copyFileSync(filePath, path.join(ARTIFACT_DIR, filename));
    console.log(`[VISUAL-QA] Saved ${filename}`);
  }

  // 3. Island 0 Close-up (NW): Bench at [-6, -3.65], Planter pair at [-6, -5]
  console.log('[VISUAL-QA] Capturing Island 0 closeup...');
  await captureCloseup(
    [-6.0, 3.2, -1.2],
    [-6.0, 0.6, -5.0],
    '02_after_island0_pair_closeup.png'
  );

  // 4. Island 1 Close-up (NE): Bench at [6, -3.65], Planter pair at [6, -5]
  console.log('[VISUAL-QA] Capturing Island 1 closeup...');
  await captureCloseup(
    [6.0, 3.2, -1.2],
    [6.0, 0.6, -5.0],
    '03_after_island1_pair_closeup.png'
  );

  // 5. Island 2 Close-up (SW): Bench at [-6, 3.65], Planter pair at [-6, 5]
  console.log('[VISUAL-QA] Capturing Island 2 closeup...');
  await captureCloseup(
    [-6.0, 3.2, 1.2],
    [-6.0, 0.6, 5.0],
    '04_after_island2_pair_closeup.png'
  );

  // 6. Island 3 Close-up (SE): Bench at [6, 3.65], Planter pair at [6, 5]
  console.log('[VISUAL-QA] Capturing Island 3 closeup...');
  await captureCloseup(
    [6.0, 3.2, 1.2],
    [6.0, 0.6, 5.0],
    '05_after_island3_pair_closeup.png'
  );

  // 7. Extra close-up side angle of Island 0 showing seamless side-by-side junction & park bench
  console.log('[VISUAL-QA] Capturing Island 0 perspective side angle...');
  await captureCloseup(
    [-8.6, 2.2, -3.2],
    [-6.0, 0.7, -4.8],
    '06_after_island0_side_junction.png'
  );

  console.log('[VISUAL-QA] Console errors encountered:', consoleErrors);

  await browser.close();
  console.log('[VISUAL-QA] Verification complete!');
})().catch(e => {
  console.error('[VISUAL-QA] Error:', e);
  process.exit(1);
});
