# GRAND EXPO V28 — ROUND 2 — PHASE 5: ENTRANCE ARCH & ENVIRONMENT BEAUTIFICATION

**Status:** `PASSED`  
**Date:** 2026-11-22  
**Baseline Commit:** `dfe4281` (working tree includes Phase 1–5)

---

## 1. Scope & Changes Implemented

- **`FE/src/scene/v28/YouthEntranceArch3D.tsx`**
  - Upgraded entrance arch title to **`CON ĐƯỜNG NÔNG SẢN`** (`OFFICIAL_ARCH_TITLE`) with subtitle **`TRIỂN LÃM 3D THANH NIÊN KHỞI NGHIỆP`** on a high-resolution `1536×320` canvas texture with full Vietnamese diacritics and stylized agricultural leaf accents.
  - Added layered emerald (`#059669`) and harvest-gold (`#eab308`) architectural crown trim while preserving both official organization logo medallions (`/logos/doan-tncs-hcm.png` and `/logos/hoi-lhtn-vn.png`) with exact aspect ratios.
  - Preserved exact `computeYouthArchPlacement` spawn and walkway clearances (`pillarOffsetX`, `clearSpanWidth`, `clearHeight`, `totalHeight < roofBounds.eaveHeight`).
- **`FE/src/scene/v28/V27VisualKit.tsx`**
  - Replaced geometric low-poly sphere placeholder planters (`avenue_planter_island_v27_5.glb` and `plaza_oasis_v27_5.glb`) with realistic `/models/env/tree-gian.glb` (`targetHeight={3.65}` / `3.25`) paired with `/models/env/planter-near-ch.glb` (`targetHeight={1.25}`), normalized cleanly onto `y = 0`.
- **`FE/src/components/v28/NavigationGuidanceHud.tsx`**
  - Visual QA fix: moved idle directional chips + zone signpost to bottom-center (`bottom: 16px` desktop, `76px` mobile) when no route is active so the **`CON ĐƯỜNG NÔNG SẢN`** entrance arch is 100% unobstructed from spawn on both Desktop and Mobile.

---

## 2. Verification Results

| Gate | Check | Result |
|---|---|---|
| Build | `npm run build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** (`dist/assets/index-BAdAesHw.js`) |
| Unit Tests | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS** (`15/15` files, `91/91` tests) |
| Desktop QA (`1440×900`) | Crisp `CON ĐƯỜNG NÔNG SẢN` title, both official logos intact, realistic trees flush on floor, 0 HUD overlap | **PASS** (`phase5_01_arch_and_trees.png`) |
| Mobile Emulation (`390×844`) | Unobstructed arch title & Vietnamese diacritics, clean bottom navigation dock | **PASS** (`phase5_02_mobile_arch.png`) |
| Runtime Errors | Console & page exceptions | **0 errors** |
