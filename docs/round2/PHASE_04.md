# GRAND EXPO V28 — ROUND 2 — PHASE 4: 2D MAP OPTIMIZATION & LEGEND

**Status:** `PASSED`  
**Date:** 2026-11-22  
**Baseline Commit:** `dfe4281` (working tree includes Phase 1–4)

---

## 1. Scope & Changes Implemented

- **`FE/src/components/v28/InteractiveMap2D.tsx`**
  - Computed tight content-fitted 1:1 `viewBox` from real `world.booths`, `world.zones`, and `world.welcomeAreaBounds` so excess outer margins are eliminated while preserving exact U-shaped proportions.
  - Added Entrance Gate marker (`⛩ CỔNG VÀO`, `data-testid="v28-map-entrance-gate"`) aligned with the real welcome threshold.
  - Added live Player Heading Cone (`data-testid="v28-map-player-cone"`) synchronized with `cameraYaw` + `playerPos`.
  - Synced active Phase 2 Guided Route (`data-testid="v28-map-guided-route"`) as a dashed cyan polyline from player to destination booth.
  - Added dashed emerald rings on suggested booths.
  - Added complete 9-item Legend (`data-testid="v28-map-legend"`): Cổng vào, Lối đi, Khu vực, Vị trí & hướng bạn, Chưa tham quan, Đã tham quan, Đang chọn, Gian gợi ý, Tuyến chỉ đường.
- **`FE/src/components/v28/DynamicWorldHud.tsx`**
  - Passed `guidedRoute`, `cameraYaw`, and `suggestedBoothIds` into `InteractiveMap2D`.

---

## 2. Verification Results

| Gate | Check | Result |
|---|---|---|
| Build | `npm run build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** (`dist/assets/index-DAXQspbm.js`) |
| Unit Tests | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS** (`15/15` files, `91/91` tests) |
| Desktop QA (`1440×900`) | 100/100 booths, 10/10 zones (A–J), tight 1:1 U-layout, entrance gate, heading cone, 9-item legend | **PASS** (`phase4_01_map_desktop.png`) |
| Mobile Emulation (`390×844`) | Responsive map panel, readable legend, `0` horizontal overflow | **PASS** (`phase4_02_map_mobile.png`) |
| Regression | Phase 1–3 untouched; `0` runtime JS/page errors | **PASS** |
