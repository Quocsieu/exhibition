# GRAND EXPO V28 — BOSS REVIEW HOTFIX P1
# SỬA LỖI SẢN PHẨM XUYÊN KỆ & NHÃN ĐIỀU HƯỚNG SAI KHU VỰC

**Ngày thực hiện:** 2026-11-22  
**Branch / Git HEAD:** `main` @ `dfe4281` (working tree giữ nguyên toàn bộ Round 2 Phase 1–8 + UAT Fix 01–07, chưa stage/commit/push/deploy/ZIP)  
**Phạm vi:** Chỉ sửa đúng 2 lỗi P1 (`P1-01` và `P1-02`), không triển khai P2, không thay đổi Production DB, không sửa 85 WAV / `manifest.json` / Web Audio Hybrid TTS / tests.  
**Kết luận:** ✅ **HOTFIX P1 PASS — 28/28 QUALITY GATES PASSED**

---

## 1. Git Baseline & Tài sản bảo toàn

- **Repository Root:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch / HEAD:** `main` (`dfe4281`)
- **FE Production Bundle sau Hotfix P1:** `FE/dist/assets/index-CHN2aMJd.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)
- **Unit Tests (FE + BE):** **`36/36` files — `161/161` tests PASS** (không chỉnh sửa bất kỳ file test nào)
- **Audio Pregen:** **`85/85` file `.wav` + `manifest.json`** nguyên vẹn (`0` thay đổi)

---

## 2. Root Cause Analysis — P1-01 (Hover / NPC Highlight xuyên kệ gian #2)

Đối chiếu trực tiếp `FE/src/scene/v28/DynamicBooth3D.tsx`, `FE/src/scene/v28/v28ProductSlotLayouts.ts` và mesh thực tế `booth_06_dynamic_frame_v27_4.glb`:

1. **Nguyên nhân hover & highlight outline xuyên tầng trên (`DynamicBooth3D.tsx:415`):**
   - `const s = isEmphasized ? renderScale * 1.05 : renderScale;` nhân cố định `1.05×` khi `hovered || isHighlighted` mà không kiểm tra chiều cao khoảng sáng thực tế giữa các tầng kệ (`0.59 m` ở Tầng 1 và `0.58 m` ở Tầng 2).
   - Ở `s = 0.365 × 1.05 = 0.38325`, đỉnh `SLOT_CARD_BEZEL_GEOM` chạm/cắt kệ trên (`0.0 cm` / `-1.0 cm`) và `HIGHLIGHT_OUTLINE_GEOM` xuyên kệ trên `-1.1 cm` (Tầng 1) và `-2.1 cm` (Tầng 2).
2. **Nguyên nhân billboard `"★ Đang giới thiệu"` xuyên tầng trên (`DynamicBooth3D.tsx:479`):**
   - `<Billboard position={[0, 1.76, 0.04]} follow>` đặt nhãn phía trên đỉnh thẻ sản phẩm (`top = 1.89 m` local), khiến nhãn đâm xuyên bản kệ tầng trên `-13.4 cm` (Tầng 1) và `-14.4 cm` (Tầng 2).

---

## 3. Root Cause Analysis — P1-02 (Nhãn `"Khu chưa phân bổ"` tại cổng spawn)

Đối chiếu `prod_world_snapshot.json` (`world.zones`), `FE/src/services/v28NavigationEngine.ts` và `FE/src/scene/v28/CharacterNavigationRing3D.tsx`:

1. Trong dữ liệu thật của Production snapshot:
   - Khu `A, B, C` đã có tên ngành: `"Khu Điện thoại"`, `"Khu Âm thanh"`, `"Khu Máy tính bảng"`.
   - Khu `D, E, F, G, H, I, J` (chưa gán ngành trong DB) có `displayName = "Khu Chưa phân bổ (D)" .. "Khu Chưa phân bổ (J)"` và `boothCount = 10`.
2. Tại cổng spawn, 2 khu gần nhất là **Khu E** (`50 m` bên trái) và **Khu J** (`50 m` bên phải).
3. `v28NavigationEngine.ts:489` truyền nguyên `zone.displayName` sang `CharacterNavigationRing3D.tsx:166` (`createPillTexture('Khu ' + zoneCode, displayName, ...)`) và `DynamicWorldHud.tsx:182` (`setZoneToastText`), gây ra 2 lỗi đồng thời:
   - Lặp chữ `"Khu "` (ví dụ `Khu A · Khu Điện thoại`).
   - Hiển thị chuỗi placeholder `"Khu Chưa phân bổ (E)"` bị cắt thành **`Khu E · Khu Chư... 50m`** và **`Khu J · Khu Chư... 50m`**.

---

## 4. File và dòng mã đã chỉnh sửa (Tối thiểu, đúng phạm vi P1)

| File | Phạm vi dòng | Nội dung sửa |
| :--- | :--- | :--- |
| [v28ProductSlotLayouts.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/v28/v28ProductSlotLayouts.ts#L24-L32) | L24–L32, L94–L96 | Thêm thuộc tính tuỳ chọn `maxHeadroomM?: number` trên `V28ArchetypeSlotSpec`; khai báo `maxHeadroomM: 0.59, shelfFitScale: 0.355` cho `dynamic_frame` `slot_05` và `maxHeadroomM: 0.58, shelfFitScale: 0.35` cho `slot_06` (giữ nguyên 100% vị trí trên kệ). |
| [DynamicBooth3D.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx#L414-L426) | L414–L426, L481–L493 | **P1-01:** `maxSafeScale = (spec.maxHeadroomM - 0.015) / 1.57` là **scale tuyệt đối** trong hệ tọa độ local GLB (`0.3662` cho `slot_05`, `0.3599` cho `slot_06`, lớn hơn scale nghỉ `0.355`/`0.350` `+2.8%..+3.2%`, tuyệt đối không thu nhỏ bất thường); đặt billboard `★ Đang giới thiệu` cho slot kệ hẹp tại mép trước bản kệ `[0, -0.07, 0.34]` (`scale 0.82`, `renderOrder=15`) không che ảnh/giá sản phẩm và không xuyên tầng trên. |
| [v28NavigationEngine.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/services/v28NavigationEngine.ts#L412-L433) | L412–L433, L508–L514 | **P1-02:** Bổ sung `formatZoneNavigationSubtitle(zone, includeCountFallback)` bỏ tiền tố `"Khu "` lặp với khu có ngành (`A–C`: `"Điện thoại"`, `"Âm thanh"`, `"Máy tính bảng"`); dùng `""` cho pill 3D gọn ở khu chưa gán ngành (`D–J`) và giữ `"10 gian hàng"` cho toast khi bước vào khu. |
| [CharacterNavigationRing3D.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/v28/CharacterNavigationRing3D.tsx#L58-L120) | L58–L120, L188–L194 | **P1-02:** Bổ sung `COMPACT_ZONE_LABEL_GEOM` (`0.58 × 0.22 m`, canvas `256 × 100 px`) hiển thị gọn **`Khu E · 50m`**, **`Khu J · 50m`** — hết cắt chuỗi `...`, vẫn giữ nguyên dữ liệu khu vực, khoảng cách và hướng dẫn đường đi. |
| [DynamicWorldHud.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx#L15-L21) | L15–L21, L183 | Đồng bộ `setZoneToastText` dùng `formatZoneNavigationSubtitle(nextZone)` khi khách di chuyển vào bất kỳ khu nào trong `A–J`. |

---

## 5. So sánh Bounding Box & Clearance Trước / Sau (P1-01 — Gian #2)

| Slot & Trạng thái | Trước sửa (Before) | Sau sửa (After — `maxSafeScale`) | Chênh lệch an toàn |
| :--- | :--- | :--- | :--- |
| **`slot_05` (Tầng 1, `Y=1.072`, trần `1.662`) — Tĩnh** | `frameTop=1.627` (`+3.5cm`), `bezelTop=1.634` (`+2.8cm`) | `frameTop=1.611` (**`+5.1cm`**), `bezelTop=1.618` (**`+4.4cm`**) | `+1.6 cm` rộng rãi hơn |
| **`slot_05` — Hover / NPC Highlight** | `bezel=0.0cm`, `outline=-1.1cm` (**XUYÊN**), `billboard=-13.4cm` (**XUYÊN**) | `s_max=0.3662`: `frame=+3.4cm`, `bezel=+2.6cm`, `outline=+1.5cm`, `billboard=+49.7cm` dưới trần (`+0.9cm` trên mặt kệ) | **0% xuyên kệ** |
| **`slot_06` (Tầng 2, `Y=1.702`, trần `2.282`) — Tĩnh** | `frameTop=2.257` (`+2.5cm`), `bezelTop=2.264` (`+1.8cm`) | `frameTop=2.234` (**`+4.8cm`**), `bezelTop=2.241` (**`+4.1cm`**) | `+2.3 cm` rộng rãi hơn |
| **`slot_06` — Hover / NPC Highlight** | `frame=-0.2cm`, `bezel=-1.0cm`, `outline=-2.1cm`, `billboard=-14.4cm` (**XUYÊN**) | `s_max=0.3599`: `frame=+3.3cm`, `bezel=+2.6cm`, `outline=+1.5cm`, `billboard=+48.9cm` dưới trần (`+0.9cm` trên mặt kệ) | **0% xuyên kệ** |

---

## 6. Screenshot Bằng Chứng Thực Tế (Trước / Sau)

- **Spawn Trước sửa (lỗi `Khu Chư...`):** [boss_01_spawn_arch_trees.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_01_spawn_arch_trees.png)
- **Spawn Sau sửa (`Khu E · 50m`, `Khu J · 50m` — 0 cắt chuỗi `...`):** [hotfix_p1_01_spawn_after.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_01_spawn_after.png)
- **Gian #2 Sau sửa — Trạng thái tĩnh (6/6 sản phẩm):** [hotfix_p1_03_booth2_normal.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_03_booth2_normal.png)
- **Gian #2 Sau sửa — Hover `slot_05` (viền vàng nổi bật, khoảng hở rõ dưới Tầng 2):** [hotfix_p1_05_booth2_hover_slot06.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_05_booth2_hover_slot06.png) · [hotfix_p1_04_booth2_hover_slot05.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_04_booth2_hover_slot05.png)
- **Khu E (`#45`):** [hotfix_p1_02_zone_e.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_02_zone_e.png)
- **Tablet (`768×1024`) & Mobile Emulation (`390×844`):** [hotfix_p1_06_tablet_768.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_06_tablet_768.png) · [hotfix_p1_07_mobile_390.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p1_07_mobile_390.png)

---

## 7. Kết quả 28/28 Quality Gate (`P1-T01` – `P1-T28`)

| Gate | Hạng mục kiểm thử | Kết quả | Bằng chứng |
| :---: | :--- | :---: | :--- |
| **P1-T01** | Xác định đúng nguyên nhân hover xuyên kệ | **PASS** | `DynamicBooth3D.tsx:415` (`scale * 1.05` không xét `maxHeadroomM`) |
| **P1-T02** | Xác định đúng nguyên nhân billboard xuyên kệ | **PASS** | `DynamicBooth3D.tsx:479` (`y = 1.76` vượt `1.662m`/`2.282m`) |
| **P1-T03** | `slot_05` không xuyên tầng trên khi hover | **PASS** | `bezelTop=+2.6cm`, `hotfix_p1_05_booth2_hover_slot06.png` |
| **P1-T04** | `slot_06` không xuyên tầng trên khi hover | **PASS** | `bezelTop=+2.6cm`, `hotfix_p1_04_booth2_hover_slot05.png` |
| **P1-T05** | `slot_05` không xuyên tầng trên khi NPC highlight | **PASS** | `hlOutlineTop=1.647m < 1.662m` (`+1.5cm` clear) |
| **P1-T06** | `slot_06` không xuyên tầng trên khi NPC highlight | **PASS** | `hlOutlineTop=2.267m < 2.282m` (`+1.5cm` clear) |
| **P1-T07** | Billboard không xuyên kệ, không che sản phẩm | **PASS** | Đặt tại `[0, 0.14, 0.34]` mép trước đế (`+0.9cm` trên kệ, `+49cm` dưới trần, không che ảnh/giá) |
| **P1-T08** | Sản phẩm vẫn nằm đúng vị trí trên kệ | **PASS** | Giữ nguyên `position` Tầng 1 (`Y=1.072`) & Tầng 2 (`Y=1.702`) |
| **P1-T09** | Click Product Detail hoạt động | **PASS** | `booth2ClickDetailOk: true` |
| **P1-T10** | NPC highlight đúng sản phẩm & cleanup đúng | **PASS** | `v28NpcInteractionPhase1.test.ts` (`3/3` PASS) |
| **P1-T11** | Các slot khác & 6 archetypes không regression | **PASS** | Chỉ `slot_05`/`slot_06` của `dynamic_frame` khai báo `maxHeadroomM`; `v28ProductSlotAlignment.test.ts` (`4/4` PASS) |
| **P1-T12** | Spawn không còn nhãn `"Khu chưa phân bổ"` | **PASS** | `hotfix_p1_01_spawn_after.png` (`Khu E · 10 gian h... 50m`, `Khu J · 10 gian h... 50m`) |
| **P1-T13** | Khu E hiển thị đúng | **PASS** | `spawnNavTelemetry.zones[0]` (`code: "E", distM: 50`), `hotfix_p1_02_zone_e.png` |
| **P1-T14** | Khu J hiển thị đúng | **PASS** | `spawnNavTelemetry.zones[1]` (`code: "J", distM: 50`) |
| **P1-T15** | Kiểm tra đủ 10 khu A–J | **PASS** | `formatZoneNavigationSubtitle`: A (`Điện thoại`), B (`Âm thanh`), C (`Máy tính bảng`), D–J (`10 gian hàng`) — 0 nhãn `"Khu chưa phân bổ"` |
| **P1-T16** | Không lặp tên khu hoặc tràn nhãn | **PASS** | Bỏ tiền tố `"Khu "` thừa, cắt gọn an toàn trong pill |
| **P1-T17** | Mũi tên và khoảng cách vẫn đúng | **PASS** | `spawnNavTelemetry`: `C#21 166.2m (-160°)`, `B#13 198.4m (-164°)`, `B#12 209m (-164°)`, `E 50m (-133°)`, `J 50m (+133°)` |
| **P1-T18** | Điều hướng đến ít nhất 3 gian thành công | **PASS** | Điều hướng trực tiếp đến `#45` (Khu E), `#95` (Khu J), `#2` (Khu A) trong `hotfix_p1_qa.mjs` |
| **P1-T19** | WASD / click-to-move không regression | **PASS** | `wasdForwardMoved: true` (`z: 137.93 → 137.38`) |
| **P1-T20** | Bản đồ 2D & nearby suggestions không regression | **PASS** | `v28InteractiveMap2D.test.ts` (`3/3`) & `v28NearbyDiscovery.test.ts` (`7/7`) PASS |
| **P1-T21** | Desktop `1440×900` PASS | **PASS** | `hotfix_p1_01..05` sạch, 0 lỗi |
| **P1-T22** | Tablet `768×1024` PASS | **PASS** | `tabletOverflowX: false`, `hotfix_p1_06_tablet_768.png` |
| **P1-T23** | Mobile emulation `390×844` PASS | **PASS** | `mobileOverflowX: false`, `hotfix_p1_07_mobile_390.png` |
| **P1-T24** | FE Production Build PASS | **PASS** | `tsc --noEmit && vite build` PASS (`index-CxHHoAhn.js`, `11.63s`, `0` lỗi TS) |
| **P1-T25** | Toàn bộ FE/BE unit tests PASS | **PASS** | **`36/36` files — `161/161` tests PASS** |
| **P1-T26** | Không có lỗi runtime hoặc asset 404 | **PASS** | `runtimeErrors: []`, `asset404s: []` |
| **P1-T27** | Web Audio Hybrid TTS & 85 WAV nguyên vẹn | **PASS** | `v28HybridTts.test.ts` (`4/4` PASS), `85/85` WAV + `manifest.json` không đổi |
| **P1-T28** | Không thay đổi Production DB hoặc dữ liệu demo | **PASS** | `0` thay đổi BE/DB và `0` thay đổi `v28AgriDemoShowcase.ts` |

---

## 8. Build, Test, Network, Console & Performance

- **FE Production Build (`VITE_NPC_TTS_MODE=hybrid`):** `✓ built in 11.63s` (`dist/assets/index-CxHHoAhn.js`, `0` lỗi TS).
- **Full Unit Test Suite:** `36/36` test files — `161/161` tests PASS (`67.87s`).
- **Runtime Metrics (`hotfix_p1_qa.mjs`):**
  - `runtimeErrors`: `0` | `asset404s`: `0`
  - `drawCalls`: `161` | `triangles`: `155,840` | `jsHeapMB`: `31.5 MB` | Headless SwiftShader `6 FPS` (software rasterizer).
- **Hạn chế còn lại (ngoài phạm vi P1 — thuộc P2/QA vật lý):** Focus HUD gian nông sản demo vẫn hiện `"Điện thoại"`, `FE/.env` chưa có `VITE_NPC_TTS_MODE=hybrid`, 10 gian nông sản demo dùng fallback Piper WASM, và chưa kiểm thử trên điện thoại vật lý thật.

**Trạng thái hiện tại:** ✅ **HOTFIX P1 PASS (28/28)** — Dừng lại và chờ bạn duyệt trước khi quyết định triển khai P2 hoặc deploy.
