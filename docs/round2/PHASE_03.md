# PHASE 3 — AGRICULTURAL PRODUCT SHOWCASE: 10 BOOTHS (REPORT)

## Audit & Safety
- **Data Safety:** Production DB and all CELLPHONES booths (`#1`, `#2`, `#11`, `#21`) remain 100% untouched. The 10 agricultural demo booths are isolated behind `?demoAgri=1` via [v28AgriDemoShowcase.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/v28AgriDemoShowcase.ts) and overlay only onto empty booths covering all 6 archetypes.
- **Hybrid TTS Protection:** All 85 WAVs and `FE/public/tts/pregen/manifest.json` remain untouched (`git diff = 0`). New agricultural demo scripts fall back seamlessly to Piper WASM (`vi_VN-vais1000-medium`) on manifest miss (honestly reported: 0/20 new demo product chunks pre-generated; shared greeting/closing clips remain HIT).

## Implementation
- Added [v28AgriDemoShowcase.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/v28AgriDemoShowcase.ts): 10 agricultural groups (dừa, mật ong, trái cây sấy, trái cây tươi, cà phê, trà & thảo mộc, gạo & ngũ cốc, hạt dinh dưỡng, gia vị nông sản, nước uống từ nông sản), 20 demo products with unique IDs/SKUs, 2D SVG packaging textures, and 3D shape inference (`inferProductShape3D`).
- Enhanced [DynamicBooth3D.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx): Added `AgriProductProp3D` (`jar`, `bottle`, `pouch`, `box`, `basket`, `can`) rendered flush on display stand bases alongside 2D packaging cards (shared geometries, zero floating/clipping).
- Added [v28AgriShowcasePhase3.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/__tests__/v28AgriShowcasePhase3.test.ts).

## Quality Gate Results (18/18 PASS)
- **Build & Unit Tests:** FE build PASS (`index-CFjbT82j.js`), **15/15 files — 91/91 tests PASS**.
- **10/10 Booth Screenshots Captured (`phase3_agri_01.png` .. `phase3_agri_10.png`):** All 6 archetypes covered (`signature_ring`, `organic_flow`, `grand_portal`, `wave_pavilion`, `gallery_arch`, `dynamic_frame`), `60 FPS` (`16.6 ms`), `137` draw calls, `35.5 MB` JS Heap, `0` console errors.
- **Quality Gate Verdict:** **PASSED** → Advancing to Phase 4.
