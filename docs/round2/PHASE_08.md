# GRAND EXPO V28 — ROUND 2 — PHASE 8: NEARBY BOOTH NOTIFICATION OPTIMIZATION

**Status:** `PASSED`  
**Date:** 2026-11-22  
**Baseline Commit:** `dfe4281` (working tree includes Phase 1–8)

---

## 1. Radius & Behavior Comparison

| Metric | Before (Baseline) | After (Phase 8) |
|---|---|---|
| Live UI Enter Radius | `18.5 m` | **`11.5 m`** (`-38%`, eliminates premature popups on central boulevard) |
| Live UI Exit Hysteresis Radius | `21.0 m` | **`13.5 m`** (`2.0 m` anti-flicker band) |
| Max Simultaneous Cards | `3` | **`3`** (strictly capped, sorted by distance) |
| Close Button Behavior | `−` collapsed to lingering pill | **True `✕` Close** (`data-testid="v28-nearby-close-btn"`): hides completely (`panelVisible: false, pillVisible: false`) until visitor walks `>= 4.0 m` into a new booth cluster |
| Phase 2 Navigation Integration | `Đi tới →` only | **`🧭 Chỉ đường`** (Phase 2 3D route) + **`Đi tới →`** |

---

## 2. Verification Results

| Gate | Check | Result |
|---|---|---|
| Build | `npm run build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** (`dist/assets/index-8jtNBqW6.js`) |
| Unit Tests | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS** (`16/16` files, `92/92` tests — includes `v28NearbyPhase8.test.ts`) |
| Browser QA (Spawn & Near Booth #1) | Hidden at spawn (`atSpawnVisible: false`), shows 3 nearest cards near Booth #1 with `🧭 Chỉ đường` & `✕`, clicking `✕` completely dismisses with 0 reopen flicker | **PASS** (`phase8_01_nearby_card_visible.png`, `phase8_02_nearby_closed_route_active.png`) |
| Runtime Errors | Console & page exceptions | **0 errors** |
