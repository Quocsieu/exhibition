# GRAND EXPO V28 — ROUND 2 — PHASE 6: BOOTH SIGNAGE & VISUAL IDENTITY

**Status:** `PASSED`  
**Date:** 2026-11-22  
**Baseline Commit:** `dfe4281` (working tree includes Phase 1–6)

---

## 1. Scope & Changes Implemented

- **`FE/src/scene/v28/DynamicBooth3D.tsx`**
  - Upgraded `createBoothSignTexture` to `1024×208` high-DPI architectural fascia signage with:
    - Rounded square brand monogram emblem (`computeBrandInitials`) for crisp visual identity even when a booth has no uploaded logo image.
    - High-contrast golden `#boothNumber` badge (`#1`–`#100`) and `KHU {zoneCode}` badge.
    - Auto-sized enterprise name with safe 2-line wrapping (`wrapSignText`) and graceful ellipsis for long business names.
    - Archetype-matched visual themes & per-archetype `signY` clearances (`ARCHETYPE_SIGN_THEME`) across all 6 archetypes (`signature_ring`, `organic_flow`, `grand_portal`, `wave_pavilion`, `gallery_arch`, `dynamic_frame`) so signage never clips into curved roofs.
- **`FE/src/components/v28/DynamicWorldHud.tsx`**
  - Removed redundant duplicate business/company name banners in both Desktop and Mobile Focus toolbars, replacing them with a sleek compact metadata pill (`#{boothNumber} · Khu {zoneCode} · {assignedSlotCount}/6 SP`) while preserving `← Quay lại`, `🔊/🔇 Mute`, `💬 Chat`, and `🌐 Website ↗`.

---

## 2. Verification Results

| Gate | Check | Result |
|---|---|---|
| Build | `npm run build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** (`dist/assets/index-CQXteS1d.js`) |
| Unit Tests | `npx vitest run FE/src/__tests__ --no-file-parallelism` | **PASS** (`15/15` files, `91/91` tests) |
| Visual QA (Booth #1 & Booth #4) | Crisp monogram + `#number` + `KHU A` + Vietnamese enterprise name, 0 roof clipping, 0 duplicate business name in Focus HUD | **PASS** (`phase6_01_signage_focus_booth1.png`, `phase6_02_signage_focus_booth4.png`) |
| Runtime Errors | Console & page exceptions | **0 errors** |
