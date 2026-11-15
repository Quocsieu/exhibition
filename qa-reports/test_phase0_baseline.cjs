const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'planter-replacement');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ARTIFACT_DIR = 'C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a';

(async () => {
  console.log('[BASELINE] Launching Chrome Headless 1600x1000...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  
  console.log('[BASELINE] Navigating to http://localhost:5174 ...');
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  // Close guide modal if visible
  const guideBtn = page.getByRole('button', { name: /Ẩn hướng dẫn/i });
  if (await guideBtn.isVisible().catch(() => false)) {
    await guideBtn.click();
    await page.waitForTimeout(500);
  }

  // 1. Switch to Overview Mode and take Baseline Overview
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible().catch(() => false)) {
    await overviewBtn.click();
    await page.waitForTimeout(1500);
  }

  const fileOverview = path.join(OUT_DIR, '00_baseline_overview.png');
  await page.screenshot({ path: fileOverview });
  fs.copyFileSync(fileOverview, path.join(ARTIFACT_DIR, '00_baseline_overview.png'));
  console.log('[BASELINE] Saved 00_baseline_overview.png');

  // 2. Switch to Explore Mode and take close-up of current Island 0 (bench at [-6, -3.65] and planter at [-6, -5])
  const exploreBtn = page.getByRole('button', { name: /Tham quan/i });
  if (await exploreBtn.isVisible().catch(() => false)) {
    await exploreBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const s = _roots.get(document.querySelector('canvas')).store.getState();
    
    // Look at Island 0: bench at [-6, -3.65], planter at [-6, -5]
    let perspCam = null;
    s.scene.traverse((obj) => {
      if (obj.isPerspectiveCamera && !perspCam) perspCam = obj;
    });
    const cam = perspCam || s.camera;
    cam.position.set(-6, 3.2, -1.2);
    cam.lookAt(new THREE.Vector3(-6, 0.6, -5.0));
    cam.updateProjectionMatrix();
    s.gl.render(s.scene, cam);
  });

  await page.waitForTimeout(600);
  const fileCloseup = path.join(OUT_DIR, '00_baseline_island0_bench_planter.png');
  await page.screenshot({ path: fileCloseup });
  fs.copyFileSync(fileCloseup, path.join(ARTIFACT_DIR, '00_baseline_island0_bench_planter.png'));
  console.log('[BASELINE] Saved 00_baseline_island0_bench_planter.png');

  // 3. Test loading the new model `planter-near-ch.glb` in Three.js in the browser!
  const loadTest = await page.evaluate(async () => {
    const { GLTFLoader } = await import('/node_modules/.vite/deps/three_examples_jsm_loaders_GLTFLoader__js.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load(
        '/models/env/planter-near-ch.glb',
        (gltf) => {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          
          const meshes = [];
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              meshes.push({
                name: child.name,
                materials: mats.map(m => ({
                  name: m.name,
                  type: m.type,
                  color: m.color ? m.color.getHexString() : null,
                  roughness: m.roughness,
                  metalness: m.metalness
                }))
              });
            }
          });

          resolve({
            success: true,
            box: { min: box.min.toArray(), max: box.max.toArray() },
            size: size.toArray(),
            center: center.toArray(),
            meshes
          });
        },
        undefined,
        (err) => {
          resolve({ success: false, error: String(err) });
        }
      );
    });
  });

  console.log('[BASELINE] New GLB load test in browser:', JSON.stringify(loadTest, null, 2));

  await browser.close();
})().catch(e => {
  console.error('[BASELINE] Error:', e);
  process.exit(1);
});
