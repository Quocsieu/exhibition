# GRAND EXPO V28 — ROUND 2: BASELINE REPORT (PHASE 0)

**Generated:** 2026-11-22  
**Git Branch:** `main` (`origin/main`)  
**Git HEAD:** `dfe42815d7612a6f48686888d852b3c1a5d82fc0`  
**Local Phase 1 Working Tree:** 6 modified files + 5 untracked Phase 1 files (100% preserved, uncommitted).

## 1. Local vs GitHub vs Production Plesk
- **GitHub `origin/main`:** `dfe4281` (Web Audio API Hybrid TTS + 85 WAVs).
- **Local Working Tree:** `dfe4281` + Phase 1 (NPC Interaction, Product Showcase, Audio-Reactive 8-bone Rig, Similar Booths, Drag Guard, Legacy `clips` Guard).
- **Production Plesk (`https://3dtrienlamso.mbws.vn/`):** Running `index-BX_xlWOi.js` (commit `6e4239c`), NOT modified.

## 2. Verified Baseline Metrics (Phase 1 Final QA)
- **FE Production Build (`VITE_NPC_TTS_MODE=hybrid`):** PASS (`dist/assets/index-CY3LqgXG.js`, 0 errors).
- **FE Unit Tests (`npx vitest run FE/src/__tests__ --no-file-parallelism`):** 13/13 files, 86/86 tests PASS.
- **Audio Regression (4 Booths — 70/70 chunks, Chrome Intel Iris Xe GPU):**
  - Booth #11 (10/10, cold-start): firstSpeech `742.3 ms`, avg gap `0.9 ms`, max gap `2.4 ms`, 0 stalls, 0 ONNX, 0 404.
  - Booth #21 (9/9, warm-start): firstSpeech `181.0 ms`, avg gap `0.7 ms`, max gap `1.5 ms`, 0 stalls.
  - Booth #2 (22/22, warm-start): firstSpeech `168.9 ms`, avg gap `0.8 ms`, max gap `2.2 ms`, 0 stalls.
  - Booth #1 (29/29, warm-start): firstSpeech `173.6 ms`, avg gap `0.9 ms`, max gap `2.5 ms`, 0 stalls.
  - `AudioContext` count: `1` (singleton), `maxConcurrent`: `1`, 85 WAVs + `manifest.json` untouched.
- **Performance Baseline (Chrome Intel Iris Xe GPU):**
  - FPS during active NPC + Highlight: `60 FPS` (`16.7 ms` avg frame time).
  - Draw calls: `119–154`, Triangles: `174,637–197,076`.
  - JS Heap across 10 consecutive sessions: `37–50 MB` (flat, 0 memory leak).
- **Accepted Limitations from Phase 1:**
  - `untitled.glb` has `0` morph targets / no facial rig (8-bone procedural upper-body rig retained).
  - Physical mobile devices (iOS Safari / Android Chrome) not available; mobile tested via Chrome DevTools Emulation (`390x844`).
