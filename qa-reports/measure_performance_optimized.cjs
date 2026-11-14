const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.TEMP + '/expo-graphics-tools/node_modules/playwright-core');

const OUT_DIR = path.resolve(__dirname, 'perf-optimized');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('[PERF-OPT] Launching Chrome Headless 1440x900...');
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

  console.log('[PERF-OPT] Navigating to http://127.0.0.1:5180 ...');
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });

  console.log('[PERF-OPT] Warming up and waiting 12s for full asset streaming...');
  await page.waitForTimeout(12000);
  const loadTimeSec = (Date.now() - t0) / 1000;
  console.log(`[PERF-OPT] Assets settled in ${loadTimeSec.toFixed(2)}s`);

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

    const samples = frameDeltas.slice(2);
    const totalTime = samples.reduce((a, b) => a + b, 0);
    const avgFrameTime = totalTime / samples.length;
    const avgFps = 1000 / avgFrameTime;

    samples.sort((a, b) => b - a);
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

  // 1. Measure Explore View
  console.log('[PERF-OPT] Measuring Explore View (Run 1)...');
  const explore1 = await samplePerformance(120);
  console.log('[PERF-OPT] Explore Run 1:', explore1);

  console.log('[PERF-OPT] Measuring Explore View (Run 2)...');
  const explore2 = await samplePerformance(120);
  console.log('[PERF-OPT] Explore Run 2:', explore2);

  await page.screenshot({ path: path.join(OUT_DIR, '01_optimized_explore.png') });

  // 2. Measure Overview View
  console.log('[PERF-OPT] Switching to Overview Mode...');
  const overviewBtn = page.getByRole('button', { name: /Toàn cảnh/i });
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log('[PERF-OPT] Measuring Overview View (Run 1)...');
  const overview1 = await samplePerformance(120);
  console.log('[PERF-OPT] Overview Run 1:', overview1);

  console.log('[PERF-OPT] Measuring Overview View (Run 2)...');
  const overview2 = await samplePerformance(120);
  console.log('[PERF-OPT] Overview Run 2:', overview2);

  await page.screenshot({ path: path.join(OUT_DIR, '02_optimized_overview.png') });

  // 3. Test functional behavior: WASD move, booth click, modal
  console.log('[PERF-OPT] Testing WASD movement & functional QA...');
  const exploreBtn = page.getByRole('button', { name: /Khám phá/i });
  if (await exploreBtn.isVisible()) {
    await exploreBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: path.join(OUT_DIR, '03_wasd_movement.png') });

  // Click booth 1 chip
  const boothChip = page.locator('.booth-chip').first();
  let boothModalPassed = false;
  if (await boothChip.isVisible().catch(() => false)) {
    await boothChip.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '04_booth_product_modal.png') });
    boothModalPassed = true;
  }

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
    boothModalPassed,
    errors,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'optimized_results.json'), JSON.stringify(result, null, 2));
  console.log('[PERF-OPT] Optimized results saved to', path.join(OUT_DIR, 'optimized_results.json'));

  await browser.close();
})();
