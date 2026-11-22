# GRAND EXPO V28 — CUSTOMER FEEDBACK ROUND 2
# FINAL INTEGRATION QA & SIGN-OFF REPORT

**Verdict:** **`READY FOR USER REVIEW`**  
**Date:** 2026-11-22  
**Git Branch / HEAD:** `main` @ `dfe4281` (working tree contains uncommitted Round 2 Phase 1–8 changes; NO commit/push/deploy/ZIP performed)  
**Final FE Production Bundle:** `FE/dist/assets/index-8jtNBqW6.js` (`VITE_NPC_TTS_MODE=hybrid`)

---

## A. Phase-by-Phase Sign-Off Matrix (Phase 0 – Phase 8)

| Phase | Scope | Status | Evidence Doc |
|---|---|---|---|
| **Phase 0** | Initial Baseline & Checkpoint | `PASSED` | `docs/round2/BASELINE.md` |
| **Phase 1** | NPC Interaction & Product Showcase | `PASSED` (PC; physical mobile `PARTIAL`) | `PHASE_1_NPC_INTERACTION_QA_REPORT.md` |
| **Phase 2** | Intelligent 3D Navigation (Dijkstra, Floor Chevrons, 3-Booth Arrows, Zone Signpost) | `PASSED` | `docs/round2/PHASE_02.md` |
| **Phase 3** | Agricultural Product Showcase (10 Booths, 20 Products, 2D+3D, isolated `?demoAgri=1`) | `PASSED` | `docs/round2/PHASE_03.md` |
| **Phase 4** | 2D Map Optimization & Complete 9-Item Legend | `PASSED` | `docs/round2/PHASE_04.md` |
| **Phase 5** | Entrance Arch (`CON ĐƯỜNG NÔNG SẢN`) & Realistic Trees (`tree-gian.glb`) | `PASSED` | `docs/round2/PHASE_05.md` |
| **Phase 6** | Booth Signage (Monogram, `#number`, `KHU`, 2-line wrap) & Focus HUD Dedup | `PASSED` | `docs/round2/PHASE_06.md` |
| **Phase 7** | Main HUD Simplification (`⋯ Xem thêm` dropdown, zero lost features) | `PASSED` | `docs/round2/PHASE_07.md` |
| **Phase 8** | Nearby Booth Notification Optimization (`11.5 m` radius, true `✕` close, Phase 2 guide) | `PASSED` | `docs/round2/PHASE_08.md` |

---

## B. Automated Build & Unit Test Suite

| Suite | Command | Result |
|---|---|---|
| **FE TypeScript + Vite Build** | `$env:VITE_NPC_TTS_MODE='hybrid'; npm --prefix FE run build` | **PASS** (`0` TS errors, `index-8jtNBqW6.js`) |
| **FE Unit Tests** | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS — `16/16` files, `92/92` tests** |
| **BE Unit Tests** | `npx vitest run BE/src/__tests__ --no-file-parallelism` | **PASS — `20/20` files, `67/67` tests** |
| **Protected TTS/Audio Diff Check** | `git diff -- piperTtsWorker.ts hybridTtsAdapter.ts npcTtsConfig.ts manifest.json` | **PASS — `0` diff (85/85 WAVs untouched)** |

---

## C. Full 4-Booth Web Audio API Hybrid TTS Regression (Post-Phase 8)

Executed via `phase1_audio_and_perf_regression.mjs` against the final `FE/dist/assets/index-8jtNBqW6.js` bundle with the full Production snapshot (`100` booths, `10` zones):

| Booth | Chunks Played | First Speech | Avg Gap | Max Gap | Mid-WAV Stalls | ONNX Reqs | 404s | AudioContext | Speaking FPS | Draw Calls | Heap |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **#1** | `29 / 29` | `140.7 ms` | `0.6 ms` | `1.8 ms` | `0` | `0` | `0` | `1` | **`60 FPS`** (`16.7 ms`) | `154` | `42 MB` |
| **#2** | `22 / 22` | `80.1 ms` | `0.6 ms` | `2.3 ms` | `0` | `0` | `0` | `1` | **`60 FPS`** (`16.7 ms`) | `147` | `40 MB` |
| **#11** | `10 / 10` | `968.8 ms` (cold) | `0.6 ms` | `2.1 ms` | `0` | `0` | `0` | `1` | **`60 FPS`** (`16.7 ms`) | `119` | `41 MB` |
| **#21** | `9 / 9` | `101.5 ms` | `0.4 ms` | `0.6 ms` | `0` | `0` | `0` | `1` | **`60 FPS`** (`16.7 ms`) | `121` | `44 MB` |
| **Total** | **`70 / 70`** | — | **`0.4–0.6 ms`** | **`0.6–2.3 ms`** | **`0`** | **`0`** | **`0`** | **`1`** | **`60 FPS`** | `119–154` | `40–44 MB` |

---

## D. 10-Session Memory & Audio Churn Stability

- **Heap trajectory across 10 consecutive booth consultations (`#1 → #2 → #11 → #21 → ...`):**  
  `58 MB → 39 → 53 → 52 → 52 → 56 → 54 → 52 → 51 → 43 MB` (completely flat, zero memory leak).
- **Max concurrent audio across all 10 sessions:** `1` (zero overlapping voices).
- **Active audio nodes after exit:** `0`.
- **Console / Runtime errors:** `0` (`consoleErrors: []`).

---

## E. Visual & Responsive Verification Summary

- **Desktop (`1440×900`)**: Entrance arch `CON ĐƯỜNG NÔNG SẢN` + realistic `tree-gian.glb` trees unobstructed (`phase5_01_arch_and_trees.png`), simplified 3-control top bar + `⋯ Xem thêm` menu (`phase7_01`, `phase7_02`), tight 1:1 2D Map + 9-item legend (`phase4_01`), upgraded booth signage + clean Focus HUD (`phase6_01`, `phase6_02`), Nearby card + true `✕` dismissal (`phase8_01`, `phase8_02`), 10/10 agricultural demo booths (`phase3_agri_01`..`10`).
- **Tablet (`1024×768`)**: Single-row simplified header and clean framing (`phase7_03_hud_tablet.png`).
- **Mobile Emulation (`390×844`)**: Verified across Phase 1–5 (`phase1_06`, `phase2_03`, `phase4_02`, `phase5_02`) with `0` horizontal overflow and readable diacritics.

---

## F. Honest Limitations & Notes

1. **Physical Mobile Devices (iOS Safari / Android Chrome):** Tested in Chrome Mobile Emulation (`390×844`, touch enabled); physical iOS/Android hardware verification remains `PARTIAL` until tested on real phones.
2. **NPC Facial Rig:** The existing `/models/npc/untitled.glb` asset (`1,219,748` bytes, unchanged from baseline) has no facial blendshapes/morph targets; upper-body procedural animation (8 bones synchronized to Web Audio API `AnalyserNode` amplitude) is active and verified.
3. **Production & Git Safety:** Zero Git commits/pushes, zero Plesk/Vercel deploys, zero release ZIP builds, and zero Production DB mutations were performed. All changes remain cleanly in the local working tree awaiting user review and approval.
