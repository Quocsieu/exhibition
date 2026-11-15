const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'hotfix-landscape-verification');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ARTIFACT_DIR = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';

(async () => {
  console.log('[HOTFIX-QA] Launching Chrome Headless 1600x1000...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  
  console.log('[HOTFIX-QA] Navigating to http://localhost:5174 ...');
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });

  console.log('[HOTFIX-QA] Waiting for scene to mount and load assets (12s)...');
  await page.waitForTimeout(12000);

  // Close guide modal if visible
  const guideBtn = page.getByRole('button', { name: /Ẩn hướng dẫn/i });
  if (await guideBtn.isVisible().catch(() => false)) {
    await guideBtn.click();
    await page.waitForTimeout(500);
  }

  // 1. Audit Scene Objects via R3F
  const auditResult = await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    
    let gateFlowerbeds = [];
    let streetLampRotations = [];
    let foliageMaterials = [];

    s.scene.traverse((obj) => {
      // Check for removed flowerbeds
      if (obj.name && obj.name.includes('gate-flowerbed')) {
        gateFlowerbeds.push(obj.name);
      }
      // Check materials
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.name === 'Leaves' || (m.name && m.name.toLowerCase().includes('foliage'))) {
            foliageMaterials.push({
              name: m.name,
              color: m.color ? m.color.getHexString() : null,
              emissive: m.emissive ? m.emissive.getHexString() : null,
              hasMap: Boolean(m.map)
            });
          }
        }
      }
    });

    return {
      gateFlowerbedsFound: gateFlowerbeds.length,
      gateFlowerbeds,
      foliageMaterials: foliageMaterials.slice(0, 5),
    };
  });

  console.log('[HOTFIX-QA] Scene Audit Result:', JSON.stringify(auditResult, null, 2));

  // 2. Switch to Overview Mode
  console.log('[HOTFIX-QA] Switching to Overview (Toàn cảnh)...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible().catch(() => false)) {
    await overviewBtn.click();
    await page.waitForTimeout(2000);
  }

  const file01 = path.join(OUT_DIR, '01_plaza_overview_after_hotfix.png');
  await page.screenshot({ path: file01 });
  fs.copyFileSync(file01, path.join(ARTIFACT_DIR, '01_plaza_overview_after_hotfix.png'));
  console.log('[HOTFIX-QA] Saved 01_plaza_overview_after_hotfix.png');

  // Helper to take a screenshot from arbitrary camera viewpoint in perspective mode
  async function capturePerspectiveView(camPos, lookAtPos, filename) {
    await page.evaluate(async ({ cam, lookAt }) => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const s = _roots.get(document.querySelector('canvas')).store.getState();
      
      // Use perspective camera
      let perspCam = null;
      s.scene.traverse((obj) => {
        if (obj.isPerspectiveCamera && !perspCam) perspCam = obj;
      });
      const activeCam = perspCam || s.camera;
      
      activeCam.position.set(cam[0], cam[1], cam[2]);
      activeCam.lookAt(new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]));
      activeCam.updateProjectionMatrix();
      
      // Force render 1 frame
      s.gl.render(s.scene, activeCam);
    }, { cam: camPos, lookAt: lookAtPos });

    await page.waitForTimeout(500);
    const filePath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: filePath });
    fs.copyFileSync(filePath, path.join(ARTIFACT_DIR, filename));
    console.log(`[HOTFIX-QA] Saved ${filename}`);
  }

  // Switch to Explore mode for perspective shots
  const exploreBtn = page.getByRole('button', { name: /Tham quan/i });
  if (await exploreBtn.isVisible().catch(() => false)) {
    await exploreBtn.click();
    await page.waitForTimeout(1000);
  }

  // 3. Close up West Street Lamp: at [-17.4, 0.02, 3.6] or [-17.4, 0.02, -3.6]
  // Camera stands slightly inside plaza [-13, 3, 3.6] looking West [-22, 2, 3.6]
  console.log('[HOTFIX-QA] Capturing West Street Lamp close-up...');
  await capturePerspectiveView(
    [-12.5, 3.2, 3.6],
    [-19.5, 2.2, 3.6],
    '02_west_street_lamp_facing_road.png'
  );

  // 4. Close up East Street Lamp: at [17.4, 0.02, 3.6]
  // Camera stands inside plaza [12.5, 3.2, 3.6] looking East [19.5, 2.2, 3.6]
  console.log('[HOTFIX-QA] Capturing East Street Lamp close-up...');
  await capturePerspectiveView(
    [12.5, 3.2, 3.6],
    [19.5, 2.2, 3.6],
    '03_east_street_lamp_facing_road.png'
  );

  // 5. Close up Grand South Entrance Roadway (where the 2 planters were):
  // Camera at [0, 4.0, 27], looking North at [0, 0.5, 20.5]
  console.log('[HOTFIX-QA] Capturing South Entrance roadway...');
  await capturePerspectiveView(
    [0, 4.0, 27.0],
    [0, 0.5, 20.0],
    '04_south_entrance_road_no_planters.png'
  );

  // 6. Close up Planters / Urns with lush green foliage:
  // Central urn at [6.8, 0.02, 2.8] or booth planter
  console.log('[HOTFIX-QA] Capturing Planter Urn lush foliage...');
  await capturePerspectiveView(
    [5.0, 1.8, 3.5],
    [6.8, 0.8, 2.8],
    '05_planter_lush_green_foliage.png'
  );

  await browser.close();
  console.log('[HOTFIX-QA] All captures complete!');
})().catch(e => {
  console.error('[HOTFIX-QA] Error:', e);
  process.exit(1);
});
