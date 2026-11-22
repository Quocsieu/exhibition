# GRAND EXPO V28 — ROUND 2 — PHASE 7: MAIN HUD SIMPLIFICATION

**Status:** `PASSED`  
**Date:** 2026-11-22  
**Baseline Commit:** `dfe4281` (working tree includes Phase 1–7)

---

## 1. HUD Control Classification Audit

| Control | Before (Location) | After (Location) | Classification |
|---|---|---|---|
| Exhibition Brand & Title | Top-left header | Top-left header | Primary (Keep) |
| Visited Booths Progress (`X/100 gian`) | Top-left status line | Top-left status line | Primary (Keep) |
| Quick-Jump Booth Selector (`📍 Đi nhanh`) | Top-right bar | Top-right bar | Primary (Keep) |
| 2D Interactive Map (`🗺️ Bản đồ 2D`) | Top-right bar | Top-right bar | Primary (Keep) |
| Online Visitor Count | Top-left status line | `⋯ Xem thêm` dropdown | Secondary (Moved) |
| Visitor Profile Editor (`Hồ sơ: Khách #... ✎`) | Top-right bar | `⋯ Xem thêm` dropdown | Secondary (Moved) |
| Reward Progress & Redemption (`🎁 Quà`) | Top-right bar | `⋯ Xem thêm` dropdown (+ green dot when eligible) | Secondary (Moved) |
| Return to Center (`🧭 Về sảnh trung tâm`) | Mobile menu only | `⋯ Xem thêm` dropdown + Mobile menu | Secondary (Unified) |
| 3D Graphics Quality (`Tự động / Mượt / Đẹp`) | Mobile menu only | `⋯ Xem thêm` dropdown + Mobile menu | Secondary (Unified) |

---

## 2. Verification Results

| Gate | Check | Result |
|---|---|---|
| Build | `npm run build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** (`dist/assets/index-Dur9rLue.js`) |
| Unit Tests | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS** (`15/15` files, `91/91` tests) |
| Desktop (`1440×900`) | Clean 3-control top bar; `⋯ Xem thêm` opens all 5 secondary tools cleanly | **PASS** (`phase7_01_hud_desktop_clean.png`, `phase7_02_hud_desktop_more_menu.png`) |
| Tablet (`1024×768`) | Single-row top bar, unobstructed arch | **PASS** (`phase7_03_hud_tablet.png`) |
| Runtime Errors | Console & page exceptions | **0 errors** |
