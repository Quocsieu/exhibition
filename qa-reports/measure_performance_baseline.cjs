const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'perf-baseline');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[PERF-AUDIT] Launching Chrome Headless 1440x900...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('[PERF-AUDIT] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  console.log('[PERF-AUDIT] Warming up and waiting 12s for full asset streaming...');
  await page.waitForTimeout(12000);
  const loadTimeSec = (Date.now() - t0) / 1000;
  console.log(`[PERF-AUDIT] Assets settled in ${loadTimeSec.toFixed(2)}s`);

  // Dismiss guide modal if visible
  const guideBtn = page.getByRole('button', { name: /Ẩn hướng dẫn/i });
  if (await guideBtn.isVisible().catch(() => false)) {
    await guideBtn.click();
    await page.waitForTimeout(500);
  }

  // Robust multi-frame performance sampler inside canvas context
  const samplePerformance = async (sampleFrames = 120) => page.evaluate(async (framesToCount) => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    const state = _roots.get(canvas).store.getState();
    const gl = state.gl;

    const frameDeltas = [];
    let lastTime = performance.now();

    await new Promise((resolve) => {
      let count = 0;
      function onFrame() {
        const now = performance.now();
        const delta = now - lastTime;
        lastTime = now;
        frameDeltas.push(delta);
        if (++count >= framesToCount) resolve();
        else requestAnimationFrame(onFrame);
      }
      requestAnimationFrame(onFrame);
    });

    // Strip first 2 frame warmups
    const samples = frameDeltas.slice(2);
    const totalTime = samples.reduce((a, b) => a + b, 0);
    const avgFrameTime = totalTime / samples.length;
    const avgFps = 1000 / avgFrameTime;

    // Sort to compute percentiles (1% low, 5% low)
    samples.sort((a, b) => b - a); // slowest frames first
    const p1Count = Math.max(1, Math.floor(samples.length * 0.01));
    const p5Count = Math.max(1, Math.floor(samples.length * 0.05));
    const p1LowFrameTime = samples.slice(0, p1Count).reduce((a, b) => a + b, 0) / p1Count;
    const p5LowFrameTime = samples.slice(0, p5Count).reduce((a, b) => a + b, 0) / p5Count;

    return {
      avgFps: Number(avgFps.toFixed(2)),
      p1LowFps: Number((1000 / p1LowFrameTime).toFixed(2)),
      p5LowFps: Number((1000 / p5LowFrameTime).toFixed(2)),
      avgFrameTimeMs: Number(avgFrameTime.toFixed(2)),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      lines: gl.info.render.lines,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      webglError: gl.getContext().getError(),
    };
  }, sampleFrames);

  // Detailed scene breakdown tool
  const inspectSceneGraph = async () => page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    const canvas = document.querySelector('canvas');
    const state = _roots.get(canvas).store.getState();
    const scene = state.scene;

    const breakdown = {};
    scene.traverse((obj) => {
      let groupName = 'other';
      let cur = obj;
      while (cur) {
        if (cur.name && cur.name.startsWith('exterior-glb:')) {
          groupName = cur.name;
          break;
        }
        if (cur.name && (cur.name.startsWith('ExhibitionShell:') || cur.name.startsWith('roofless-glb:'))) {
          groupName = 'booth-shell';
          break;
        }
        cur = cur.parent;
      }

      if (obj.isMesh || obj.isInstancedMesh) {
        if (!breakdown[groupName]) {
          breakdown[groupName] = {
            meshCount: 0,
            instancedMeshCount: 0,
            totalInstances: 0,
            triangles: 0,
            castShadowCount: 0,
            receiveShadowCount: 0,
          };
        }
        const g = breakdown[groupName];
        if (obj.isInstancedMesh) {
          g.instancedMeshCount++;
          g.totalInstances += obj.count || 0;
        } else {
          g.meshCount++;
          g.totalInstances++;
        }
        if (obj.castShadow) g.castShadowCount++;
        if (obj.receiveShadow) g.receiveShadowCount++;
        if (obj.geometry) {
          const index = obj.geometry.index;
          const pos = obj.geometry.attributes.position;
          const tris = index ? index.count / 3 : (pos ? pos.count / 3 : 0);
          g.triangles += tris * (obj.isInstancedMesh ? (obj.count || 1) : 1);
        }
      }
    });

    return breakdown;
  });

  // 1. Measure Explore View (Default camera)
  console.log('[PERF-AUDIT] Measuring Explore View (Run 1)...');
  const explore1 = await samplePerformance(120);
  console.log('[PERF-AUDIT] Explore Run 1:', explore1);

  console.log('[PERF-AUDIT] Measuring Explore View (Run 2)...');
  const explore2 = await samplePerformance(120);
  console.log('[PERF-AUDIT] Explore Run 2:', explore2);

  await page.screenshot({ path: path.join(OUT_DIR, '01_baseline_explore.png') });

  // 2. Measure Overview View
  console.log('[PERF-AUDIT] Switching to Overview Mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log('[PERF-AUDIT] Measuring Overview View (Run 1)...');
  const overview1 = await samplePerformance(120);
  console.log('[PERF-AUDIT] Overview Run 1:', overview1);

  console.log('[PERF-AUDIT] Measuring Overview View (Run 2)...');
  const overview2 = await samplePerformance(120);
  console.log('[PERF-AUDIT] Overview Run 2:', overview2);

  await page.screenshot({ path: path.join(OUT_DIR, '02_baseline_overview.png') });

  // 3. Inspect Scene Graph Breakdown
  console.log('[PERF-AUDIT] Inspecting Scene Graph breakdown...');
  const sceneBreakdown = await inspectSceneGraph();
  console.log('[PERF-AUDIT] Scene Graph Breakdown:', JSON.stringify(sceneBreakdown, null, 2));

  const result = {
    timestamp: new Date().toISOString(),
    loadTimeSec,
    explore: {
      run1: explore1,
      run2: explore2,
      avgFps: ((explore1.avgFps + explore2.avgFps) / 2).toFixed(2),
      calls: explore2.calls,
      triangles: explore2.triangles,
      textures: explore2.textures,
      geometries: explore2.geometries,
    },
    overview: {
      run1: overview1,
      run2: overview2,
      avgFps: ((overview1.avgFps + overview2.avgFps) / 2).toFixed(2),
      calls: overview2.calls,
      triangles: overview2.triangles,
      textures: overview2.textures,
      geometries: overview2.geometries,
    },
    sceneBreakdown,
    errors,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'baseline_results.json'), JSON.stringify(result, null, 2));
  console.log('[PERF-AUDIT] Baseline saved to', path.join(OUT_DIR, 'baseline_results.json'));

  await browser.close();
})();
