# GRAND EXPO V28 — FINAL BOSS REVIEW READINESS AUDIT
## Báo cáo thẩm định tổng thể trước nghiệm thu và deploy

**Ngày kiểm toán:** 2026-11-22  
**Vai trò kiểm toán:** Senior QA Engineer · 3D Graphics Engineer · Technical Auditor  
**Phạm vi & Nguyên tắc:** Chỉ audit, đo đạc, kiểm thử trực tiếp trên source/bundle/browser hiện tại và lập báo cáo. **0 dòng source code / test bị chỉnh sửa**, **0 thay đổi Production DB**, **0 thay đổi 85 WAV & `manifest.json`**, chưa `git stage / commit / push / deploy / ZIP`.

---

## 1. Executive Summary

- **Kết luận tổng thể:** **`READY WITH KNOWN LIMITATIONS`**
- **Tổng quan thực trạng:**
  - Hệ thống nền tảng vững: FE Production Build (`VITE_NPC_TTS_MODE=hybrid`) PASS (`0` lỗi TypeScript), toàn bộ **`36/36` test files (`161/161` unit tests FE + BE)** PASS, **`0` lỗi Console/Runtime**, **`0` lỗi 404 tài nguyên**, và **`85/85` file WAV pregen + `manifest.json`** nguyên vẹn.
  - Phần lớn 14 feedback gốc của khách hàng và các UAT Fix 01–07 đã được triển khai thực tế và hoạt động ổn định trên Desktop/Tablet/Mobile Emulation.
  - Tuy nhiên, quá trình audit độc lập trên source + browser hiện tại phát hiện **0 lỗi P0 (crash/blocker)**, nhưng có **2 lỗi P1**, **5 lỗi P2**, **2 điểm P3**, cùng **2 giới hạn chưa kiểm chứng hoàn toàn** (thiết bị mobile vật lý thật và độ trễ tải model ONNX/Piper WASM online của 10 gian nông sản demo).
- **Tổng kết 12 Quality Gate:**
  - **`PASS`:** `6 / 12` (`G01`, `G03`, `G04`, `G05`, `G06`, `G12`)
  - **`PARTIAL`:** `6 / 12` (`G02`, `G07`, `G08`, `G09`, `G10`, `G11`)
  - **`FAIL`:** `0 / 12` | **`BLOCKED`:** `0 / 12` | **`NOT_RUN`:** `0 / 12`

---

## 2. Git / Build / Test / Asset Baseline

| Hạng mục | Giá trị đo thực tế | Ghi chú kiểm toán |
| :--- | :--- | :--- |
| **Repository Root** | `E:\Lập trình\MatBaoWS\exhibition` | Xác minh trực tiếp |
| **Git Branch / HEAD** | `main` @ `dfe4281` | `34` file thay đổi/chưa commit trong working tree (bảo toàn 100%) |
| **FE Production Bundle** | `FE/dist/assets/index-4b4szMVQ.js` (`1,886.18 kB`, gzip `527.90 kB`) | Build với `VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript |
| **Cấu hình `FE/.env`** | `VITE_API_URL=https://exhibition-xl20.onrender.com`, `VITE_USE_REMOTE_API_IN_DEV=false` | **Lưu ý (P2):** Chưa khai báo `VITE_NPC_TTS_MODE=hybrid` trong `FE/.env`; mặc định trong `npcTtsConfig.ts:3` là `'legacy'` nếu build quên truyền biến môi trường |
| **Audio Pregen Assets** | `85 / 85` file `.wav` + `manifest.json` (`85` entries) | Nguyên vẹn trong `FE/public/tts/pregen/` và `FE/dist/tts/pregen/` |
| **Demo Nông Sản (`?demoAgri=1`)** | Hoạt động cô lập phía FE | Không ghi đè Production DB, không ảnh hưởng 4 gian baseline `#1, #2, #11, #21` |
| **Unit Tests (Full Suite)** | **`36/36` files — `161/161` tests PASS** (FE `16/16` · `94/94`; BE `20/20` · `67/67`) | Không sửa bất kỳ test nào |
| **Console / Runtime / 404** | `runtimeErrors: []`, `consoleErrors: []`, `asset404s: []` | Đo trên `boss_readiness_audit.mjs` & `boss_audio_and_nav_audit.mjs` |
| **Hiệu năng (Headless SwiftShader)** | Draw calls: `153–166` (Spawn/Focus), JS Heap: `14.4–53.6 MB`, Triangles: `33K–180K` | Headless SwiftShader CPU rasterizer cho `2–4 FPS` (không phản ánh GPU thật; đo GPU trước đó đạt `60 FPS`) |
| **Báo cáo `docs/round2/` hiện có** | Có `FINAL_ACCEPTANCE.md`, `PHASE_02..08.md`, `UAT_FIX_03..07.md` | **Thiếu** file báo cáo riêng cho `UAT_FIX_01` và `UAT_FIX_02` (đã audit trực tiếp lại trên source + browser) |

**Các file nguồn chính đã đối chiếu:**
- Avatar & Camera: `FE/src/scene/v28/v28CameraController.ts`, `FE/src/scene/v28/DynamicExhibitionScene.tsx`
- Navigation Guidance & 3D Ring: `FE/src/scene/v28/CharacterNavigationRing3D.tsx`, `FE/src/services/v28NavigationEngine.ts`, `FE/src/scene/v28/NavigationPath3D.tsx`
- Interactive Map 2D: `FE/src/components/v28/InteractiveMap2D.tsx`
- Nearby Booth & HUD: `FE/src/components/v28/DynamicWorldHud.tsx`
- Dynamic Booth 3D & Slots: `FE/src/scene/v28/DynamicBooth3D.tsx`, `FE/src/scene/v28/v28ProductSlotLayouts.ts`, `FE/src/scene/v28/v28BoothAssets.ts`
- NPC Audio & Presentation: `FE/src/services/npcTtsConfig.ts`, `FE/src/services/npcWebAudioPlayer.ts`, `FE/src/hooks/useNpcConsultationSession.ts`
- Agri Demo & Entrance/Env: `FE/src/services/v28AgriDemoShowcase.ts`, `FE/src/scene/v28/YouthEntranceArch3D.tsx`, `FE/src/scene/V27VisualKit.tsx`

---

## 3. Ma trận xác minh 14 Feedback gốc (`F01–F14`)

| ID | Nội dung Feedback gốc | Trạng thái | Bằng chứng thực tế trên source & browser hiện tại |
| :---: | :--- | :---: | :--- |
| **F01** | Hướng nhân vật tại cổng | **PASS** | Spawn tại `(0, 137.9)`, camera sau lưng `(0, 2.4, 143.3)`, mặt avatar hướng vào triển lãm (`-Z`). Giữ phím `W` 1.2s di chuyển vào trong `z: 137.9 → 137.4`. Ảnh `boss_01_spawn_arch_trees.png`. |
| **F02** | Thông báo gian hàng gần | **PASS** | Thẻ `Gian hàng gần bạn (3)` xuất hiện gọn góc trái dưới khi lại gần gian `#2` (`~0m`, `#1 ~11m`), không che nhân vật hay sản phẩm. Ảnh `boss_03_nav_ring_and_nearby.png`. |
| **F03** | Nhận diện gian hàng từ bên hông/sau | **PASS** | Biển hiệu 2 mặt trước/sau (`±0.026 m`) trên đủ 6/6 archetypes, hiển thị tên doanh nghiệp, `#số gian`, `KHU A–J` bằng dữ liệu thật. |
| **F04** | Thanh HUD chính gọn, xóa ô Đi nhanh | **PASS** | `hasDiNhanh: false` trên cả Desktop & Mobile; giữ `Bản đồ 2D`, `Xem thêm`, và tiến độ `Đã tham quan: 0/100 gian`. Ảnh `boss_01_spawn_arch_trees.png` & `boss_06_mobile_emulation.png`. |
| **F05** | Bản đồ 2D ngang 90° | **PASS** | SVG thực tế `1111 × 449 px` (`isLandscape: true`), hết 2 dải trống tối, đủ `100` gian duy nhất `1–100`, `10` khu `KHU A–J`, có `⛩ CỔNG VÀO`, nón hướng nhìn đỏ, search/zoom/click hoạt động. Ảnh `boss_02_map2d_landscape.png`. |
| **F06** | Chú thích bản đồ đủ 9 mục | **PASS** | Đủ 9 mục (`Cổng vào`, `Lối đi`, `Khu vực`, `Vị trí & hướng của bạn`, `Chưa tham quan`, `Đã tham quan`, `Đang chọn`, `Gian gợi ý`, `Tuyến chỉ đường`). *Lưu ý nhỏ (P3):* trên màn hình `1440×900`, phần chú thích nằm sát mép dưới modal nên cần cuộn nhẹ để xem trọn. |
| **F07** | Chỉ dẫn 3D dưới chân avatar (UAT Fix 01) | **PARTIAL** | `CharacterNavigationRing3D` hoạt động thật dưới chân nhân vật, đã xóa HUD cũ (`hasOldNavHudBar: false`), mũi tên xanh xoay theo góc nhìn & cập nhật khoảng cách. Tuy nhiên: (1) tại spawn, nhãn `B#13 Đồ Uống Nông...` hơi chạm vai trái avatar (`boss_01_spawn_arch_trees.png`); (2) nhãn khu xanh lá đang hiện `"Khu Chư..."` (`Khu chưa phân bổ`); (3) chưa đo thủ công hành trình đi bộ trọn vẹn đến đích 3 gian liên tiếp trên màn hình cảm ứng thật. |
| **F08** | Nút `X` đóng thông báo gian gần | **PASS** | Có nút `X` (`hasCloseBtn: true`); bấm đóng xong chờ 1.5s không tự mở lại (`f08_reopenedAfterClose: false`), không ảnh hưởng dẫn đường. |
| **F09** | Biển hiệu bo góc, dài, cân đối | **PASS** | Kích thước `4.78 × 0.56 m`, bo 4 góc `R = 0.15 m`, viền teal mỏng, `CanvasTexture` `1464×172` (`0%` méo), không dính HUD, kiểm chứng đủ 6/6 archetypes và tên dài (`HTX Dừa Xanh Bến Tre (Demo)`). |
| **F10** | NPC giới thiệu sản phẩm | **PARTIAL** | Không còn bảng điều khiển lớn (`hasLargeControlPanel: false`), nút `Chat` riêng hoạt động, không autoplay, 4 gian pregen tải WAV sạch (`0` lỗi 404, `0` ONNX). Tuy nhiên: 10 gian nông sản demo chưa có pregen WAV nên kích hoạt `piperTtsWorker` (tải model ONNX động → có độ trễ lớn khi mạng chậm hoặc offline). |
| **F11** | Cổng `CON ĐƯỜNG NÔNG SẢN` | **PASS** | Đúng chữ tiếng Việt có dấu sắc nét, giữ nguyên 2 logo Đoàn TNCS HCM & Hội LHTN VN, hài hòa, không cản đường, không bị HUD che khi spawn. Ảnh `boss_01_spawn_arch_trees.png`. |
| **F12** | Cây xanh và cảnh quan | **PARTIAL** | Hai cây lớn sát cổng (`tree-gian.glb` + bồn chữ nhật) tự nhiên, không che biển hiệu hay đường đi, `0` lỗi asset. Tuy nhiên, ở rìa xa bên trái/phải góc nhìn spawn (`boss_01_spawn_arch_trees.png`) vẫn còn tồn tại 1 khối cầu xanh đa giác nhỏ trên bệ vuông và 1 bụi tròn trắng đơn điệu. |
| **F13** | Hướng dẫn khu vực A–J | **PARTIAL** | Có chỉ báo khu vực Trái/Phải theo tọa độ thực tế. Tuy nhiên, tại vị trí cổng spawn (`boss_01_spawn_arch_trees.png`), 2 nhãn khu xanh lá hiển thị **`Khu E · Khu Chư... 50m`** và **`Khu J · Khu Chư... 50m`** (cắt từ `"Khu chưa phân bổ"` trong snapshot Production) — vi phạm kỳ vọng không hiện `"Khu chưa phân bổ"`. |
| **F14** | Trưng bày 10 gian nông sản (`?demoAgri=1`) | **PARTIAL** | Đủ 10 gian (`#3..#10, #12, #13`), 20 sản phẩm, phủ 6/6 archetypes, click mở đúng Product Detail, đặt khít nội thất, không chạm Production DB. Tuy nhiên: (1) Focus HUD trên gian nông sản demo vẫn hiện ngành **`Điện thoại · 2/6 SP`** thay vì `Nông sản` (`boss_05_agri_demo_booth3.png`); (2) hình ảnh là thẻ SVG tạo sẵn kèm vật thể 3D hình học cơ bản (`cylinder`/`box`) khá nhỏ nên độ chân thực thị giác còn hạn chế. |

---

## 4. Kết quả 12 Quality Gate tổng hợp (`G01–G12`)

| Gate | Trạng thái | Bằng chứng | Lỗi phát hiện | Mức độ | Đề xuất |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **G01** | **PASS** | `boss_01_spawn_arch_trees.png`, `player (0, 137.9) → (0, 137.4)` khi giữ `W`, `v28CameraAndMovementParity.test.ts` (`6/6`) | Không | — | Giữ nguyên |
| **G02** | **PARTIAL** | `CharacterNavigationRing3D.tsx`, `boss_01_spawn_arch_trees.png`, `boss_03_nav_ring_and_nearby.png` | Nhãn `B#13` hơi chạm vai avatar lúc spawn; nhãn khu hiện `Khu Chư...` | **P1/P2** | Tăng bán kính nhãn booth thêm `+0.25m` hoặc ẩn nhãn nằm sau góc khuất lưng avatar; lọc nhãn `Khu chưa phân bổ` |
| **G03** | **PASS** | `boss_03_nav_ring_and_nearby.png`, `hasNearby: true`, `hasCloseBtn: true`, `f08_reopenedAfterClose: false` | Không | — | Giữ nguyên |
| **G04** | **PASS** | `boss_01_spawn_arch_trees.png`, `boss_02_map2d_landscape.png` (`1111×449`, 100 gian, 10 khu, 9 chú thích) | Chú thích bản đồ cần cuộn nhẹ trên `1440×900` | **P3** | Thu gọn chiều cao SVG map ~24px để cả 9 mục chú thích hiển thị trọn không cần cuộn |
| **G05** | **PASS** | `uat_fix06_arch_*` (6/6 archetypes), `boss_05_agri_demo_booth3.png` (`4.78×0.56 m`, `1464×172 px`) | Không | — | Giữ nguyên |
| **G06** | **PASS** | `uat_fix07_booth2_front.png`, `boss_05_agri_demo_booth3.png`, `uat_fix06_arch_*` | Không | — | Giữ nguyên |
| **G07** | **PARTIAL** | `uat_fix07_booth2_front.png`, `uat_fix07_booth2_angled_left.png`, `uat_fix07_booth2_angled_shelves.png`, đo bounding box GLB | Trạng thái nghỉ đạt (`+3.5cm` / `+2.5cm`), nhưng khi **hover/NPC highlight (`1.05×` + outline + billboard `y=1.76`)**, viền highlight cắt tầng trên `-1.1cm` (Tầng 1) / `-2.1cm` (Tầng 2) và nhãn `★ Đang giới thiệu` xuyên kệ trên `-13.4cm` / `-14.4cm` | **P1** | Giảm `shelfFitScale` xuống `0.33`, tắt scale-up `1.05×` cho slot kệ hẹp, và đặt nhãn `★ Đang giới thiệu` ra phía trước (`z = +0.16`, `y = 1.48`) |
| **G08** | **PARTIAL** | `UAT_FIX_03_PRODUCT_SHOWCASE.md` (20/20 clicks), `boss_05_agri_demo_booth3.png` | Focus HUD hiện sai ngành **`Điện thoại`** cho gian nông sản demo; prop 3D hình học nhỏ & thẻ SVG chưa thật bằng ảnh chụp | **P2** | Dùng `booth.category` thay vì `zone.category` trên Focus HUD; nâng cấp ảnh sản phẩm chụp thật/GLB nông sản |
| **G09** | **PARTIAL** | `boss_readiness_audit.mjs` (`10` WAV pregen tải sạch, `0` 404, `0` ONNX), `boss_audio_and_nav_audit.mjs` (`piperTtsWorker` kích hoạt ở gian #3) | 4 gian pregen sạch, nhưng 10 gian nông sản demo phụ thuộc Piper WASM + tải model ONNX động (chưa có pregen WAV); `FE/.env` thiếu `VITE_NPC_TTS_MODE=hybrid` | **P2** | Thêm `VITE_NPC_TTS_MODE=hybrid` vào `FE/.env`; cân nhắc pregen WAV cho 10 gian nông sản demo trước buổi trình diễn sếp |
| **G10** | **PARTIAL** | `boss_01_spawn_arch_trees.png`, `v28YouthEntranceArch.test.ts` | Cổng `CON ĐƯỜNG NÔNG SẢN` PASS; nhưng chỉ dẫn khu hiện `Khu Chư...` (`Khu chưa phân bổ`) ở Khu E/J và còn 1 bồn cầu xanh đa giác rìa trái | **P1/P2** | Thay nhãn mặc định `"Khu chưa phân bổ"` bằng `"Khu trưng bày E/J"` khi dữ liệu ngành trống; thay bồn cầu đa giác rìa ngoài |
| **G11** | **PARTIAL** | `uat_fix06_tablet_768.png`, `uat_fix06_mobile_390.png`, `boss_06_mobile_emulation.png` (`overflowX: false`) | **PARTIAL — PHYSICAL DEVICE NOT VERIFIED** (chỉ kiểm thử qua Chrome DevTools Emulation, chưa có iPhone/Android thật) | **P2** | Kiểm thử cảm ứng, joystick, âm thanh Web Audio iOS Safari và FPS/nhiệt trên điện thoại thật trước khi chốt deploy |
| **G12** | **PASS** | FE build PASS (`0` TS errors), `36/36` test files (`161/161` tests) PASS, `0` console/runtime errors, `0` asset 404s | Không (chỉ lưu ý headless SwiftShader `2–4 FPS` là giới hạn CPU rasterizer) | — | Đo lại FPS trên máy có GPU thật khi review |

---

## 5. Xác minh chuyên sâu UAT Fix 01 & UAT Fix 07

### 5.1. UAT Fix 01 — Character-Anchored 3D Navigation Ring
- **Đã triển khai thực tế:** `FE/src/scene/v28/CharacterNavigationRing3D.tsx` render vòng la bàn + mũi tên 3D + nhãn khoảng cách gắn dưới chân nhân vật; đã loại bỏ hoàn toàn thanh `v28-direction-arrows-bar` cố định phía dưới (`hasOldNavHudBar: false`).
- **Điểm cần lưu ý:**
  1. Ở vị trí spawn (`boss_01_spawn_arch_trees.png`), nhãn `B#13 Đồ Uống Nông...` bị che một phần bởi vai trái nhân vật do nằm gần trục lưng avatar.
  2. Hai nhãn khu vực bên trái/phải hiển thị `Khu E · Khu Chư... 50m` và `Khu J · Khu Chư... 50m` (do dữ liệu `zone.name` là `"Khu chưa phân bổ"`).

### 5.2. UAT Fix 07 — Gian #2 (`dynamic_frame`, `booth_06_dynamic_frame_v27_4.glb`)
- **Kiểm tra vị trí thực tế (Chính diện + 2 Góc nghiêng):**
  - `slot_01..slot_04` nằm chính xác trên bục trái (`Y=0.985`), quầy phải (`Y=0.995`), bục giữa (`Y=1.105`) và trụ trái (`Z=-0.78`), không lơ lửng.
  - `slot_05` (`[2.55, 1.072, 0.25]`) nằm thực sự trên mặt kệ phải Tầng 1 (`X = 2.34..2.78`, `Z = -0.96..0.66`).
  - `slot_06` (`[2.55, 1.702, -0.22]`) nằm thực sự trên mặt kệ phải Tầng 2 (`Y = 1.702`).
- **Đo lại khoảng hở bounding box (PHÁT HIỆN QUAN TRỌNG — P1):**

| Trạng thái render | Tầng kệ | `frameTop` (m) | `bezelTop` (m) | `hlOutlineTop` (m) | `hlBillboardTop` (m) | Đánh giá an toàn |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Bình thường (`0.365`)** | Tầng 1 (`Y=1.072`, trần `1.662`) | `1.627` (`+3.5 cm`) | `1.634` (`+2.8 cm`) | `1.644` (`+1.8 cm`) | `1.762` (**`-10.0 cm`**) | Đạt khi không highlight |
| **Bình thường (`0.365`)** | Tầng 2 (`Y=1.702`, trần `2.282`) | `2.257` (`+2.5 cm`) | `2.264` (`+1.8 cm`) | `2.274` (`+0.8 cm`) | `2.392` (**`-11.0 cm`**) | Đạt khi không highlight |
| **Hover / NPC Highlight (`0.38325`)** | Tầng 1 (`Y=1.072`, trần `1.662`) | `1.654` (`+0.8 cm`) | `1.662` (**`0.0 cm`**) | `1.673` (**`-1.1 cm`**) | `1.796` (**`-13.4 cm`**) | **CHẠM / XUYÊN KỆ TRÊN** |
| **Hover / NPC Highlight (`0.38325`)** | Tầng 2 (`Y=1.702`, trần `2.282`) | `2.284` (**`-0.2 cm`**) | `2.292` (**`-1.0 cm`**) | `2.303` (**`-2.1 cm`**) | `2.426` (**`-14.4 cm`**) | **CHẠM / XUYÊN KỆ TRÊN** |

> **Kết luận UAT Fix 07:** Đạt mục tiêu đặt đúng lên 2 tầng kệ ở trạng thái tĩnh (đã chứng minh qua góc chính diện + góc nghiêng), nhưng **khoảng hở `2.5–3.5 cm` chưa đủ an toàn cho trạng thái hover (`1.05×`) và NPC highlight billboard (`y=1.76`)**. Xếp loại **`PARTIAL`** cho `G07`.

---

## 6. Kết quả 10 gian nông sản (`?demoAgri=1`)

- **Kiểm tra dữ liệu & chức năng:** 10/10 gian (`#3, #4, #5, #6, #7, #8, #9, #10, #12, #13`), 20/20 sản phẩm, phủ 6/6 archetypes, click 3D mở đúng Product Detail, không chạm Production DB.
- **Lỗi phát hiện mới:** Trên Focus HUD của gian `#3 — HTX Dừa Xanh Bến Tre (Demo)` (`boss_05_agri_demo_booth3.png`), dòng phụ bên cạnh `#3 · Khu A` vẫn hiển thị **`Điện thoại · 2/6 SP`** thay vì ngành nông sản (`P2`).
- **Đánh giá độ chân thực đồ họa:** Thẻ 2D hiện sử dụng minh họa SVG tự sinh (biểu tượng vòng tròn nhỏ ở giữa nền xanh) kèm vật thể 3D hình học cơ bản (`CylinderGeometry`/`BoxGeometry`) kích thước nhỏ ở góc dưới phải thẻ. Về kỹ thuật là đúng vị trí và không lỗi, nhưng về mặt thẩm mỹ trình diễn cho sếp thì trông vẫn giống "thẻ đồ họa minh họa" hơn là sản phẩm nông sản thật.

---

## 7. Audio Pregen vs Dynamic Fallback (Đo tách biệt)

| Nhóm gian hàng | Cơ chế TTS trong chế độ `hybrid` | Kết quả đo thực tế | Đánh giá |
| :--- | :--- | :--- | :---: |
| **4 gian baseline (`#1, #2, #11, #21`)** | Pregen WAV (`FE/public/tts/pregen/`, `85` WAV + `manifest.json`) | Tải `manifest.json` + WAV trực tiếp, **`0` lỗi 404**, **`0` tải ONNX**, không phụ thuộc mạng ngoài | **PASS** |
| **10 gian nông sản demo (`#3..#10, #12, #13`)** | Không có trong `manifest.json` → Fallback sang `piperTtsWorker-DGOu5Cib.js` (Piper WASM + tải model ONNX động) | Khi kích hoạt ở gian `#3`, trình duyệt khởi tạo `/assets/piperTtsWorker-DGOu5Cib.js`; trong môi trường offline/mock không có CDN ONNX, `startsCount = 0` (không phát được tiếng); trên mạng thật sẽ có độ trễ tải model ONNX + tổng hợp câu đầu | **PARTIAL** |

---

## 8. Đánh giá Desktop / Tablet / Mobile

- **Desktop (`1440×900`):** Hoạt động đầy đủ, HUD gọn, không tràn, các nút rõ ràng (`boss_01..05`).
- **Tablet (`768×1024`):** `overflowX: false`, Focus HUD và biển hiệu cân đối (`uat_fix06_tablet_768.png`).
- **Mobile (`390×844` — Emulation):** `overflowX: false`, không còn `Đi nhanh`, có hướng dẫn thao tác cảm ứng 2 vùng (`Kéo nửa dưới để di chuyển · Vuốt nửa trên xoay góc nhìn`, `boss_06_mobile_emulation.png`).
- **Trạng thái bắt buộc:** **`PARTIAL — PHYSICAL DEVICE NOT VERIFIED`** (chưa kiểm thử trên iOS Safari / Android Chrome vật lý để xác minh độ mượt joystick, mở khóa Web Audio sau chạm tay, FPS thực và nhiệt độ thiết bị).

---

## 9. Thư mục Screenshot bằng chứng thực tế

- **Spawn, Cổng `CON ĐƯỜNG NÔNG SẢN`, Cây xanh, 3D Nav Ring:** [boss_01_spawn_arch_trees.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_01_spawn_arch_trees.png)
- **Bản đồ 2D ngang 90° (100 gian, 10 khu):** [boss_02_map2d_landscape.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_02_map2d_landscape.png)
- **Chỉ dẫn 3D dưới chân & Thông báo gian hàng gần (`X`):** [boss_03_nav_ring_and_nearby.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_03_nav_ring_and_nearby.png)
- **Gian #2 UAT Fix 07 — Chính diện + 2 Góc nghiêng:** [uat_fix07_booth2_front.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_front.png) · [uat_fix07_booth2_angled_left.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_angled_left.png) · [uat_fix07_booth2_angled_shelves.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_angled_shelves.png)
- **Gian nông sản demo #3 (`?demoAgri=1`):** [boss_05_agri_demo_booth3.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_05_agri_demo_booth3.png)
- **Mobile Emulation (`390×844`):** [boss_06_mobile_emulation.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_06_mobile_emulation.png)

---

## 10. Danh sách lỗi & giới hạn còn tồn tại (`P0 / P1 / P2 / P3`)

- **P0 (Blocker / Crash):** Không có (`0`).
- **P1 (Cần xử lý sớm trước khi gửi sếp):**
  1. **Gian #2 — Xuyên kệ khi hover / NPC highlight (`slot_05`, `slot_06`):** `isEmphasized` phóng `1.05×` khiến viền highlight cắt mặt dưới kệ trên `-1.1 cm` / `-2.1 cm`, và nhãn billboard `★ Đang giới thiệu` (`y=1.76`) xuyên kệ trên `-13.4 cm` / `-14.4 cm`.
  2. **Nhãn khu vực hiện `"Khu Chư..."` (`"Khu chưa phân bổ"`):** Xuất hiện trực tiếp trên 2 nhãn xanh lá của 3D Navigation Ring tại cổng spawn (`Khu E`, `Khu J` trên `boss_01_spawn_arch_trees.png`).
- **P2 (Trung bình — Nên xử lý để tránh mất điểm khi demo):**
  3. **Focus HUD gian nông sản demo hiện sai ngành `"Điện thoại · 2/6 SP"`** (`boss_05_agri_demo_booth3.png`).
  4. **`FE/.env` chưa khai báo `VITE_NPC_TTS_MODE=hybrid`** (nguy cơ build nhầm về `'legacy'` khi deploy Plesk/Vercel).
  5. **10 gian nông sản demo chưa có WAV pregen** → phụ thuộc tải ONNX/Piper WASM động (có độ trễ cao nếu mạng chậm).
  6. **Còn 1 bồn cầu xanh đa giác ở rìa trái cổng spawn** (`boss_01_spawn_arch_trees.png`) và nhãn `B#13` của 3D Nav Ring hơi chạm vai avatar.
  7. **Chưa kiểm thử trên thiết bị Mobile vật lý thật** (`PARTIAL — PHYSICAL DEVICE NOT VERIFIED`).
- **P3 (Nhỏ / Polish):**
  8. Trên màn hình `1440×900`, phần `Chú thích bản đồ` ở đáy modal Bản đồ 2D cần cuộn nhẹ mới xem đủ 9 mục (`boss_02_map2d_landscape.png`).
  9. Thiếu 2 file báo cáo markdown riêng cho `UAT_FIX_01` và `UAT_FIX_02` trong `docs/round2/`.

---

## 11. Dự báo Feedback tiếp theo của sếp

| Vấn đề dự báo | Bằng chứng thực tế | Xác suất | Mức ảnh hưởng | Phương án khắc phục đề xuất | Phạm vi code | Rủi ro regression | Xử lý trước khi gửi sếp? |
| :--- | :--- | :---: | :---: | :--- | :--- | :---: | :---: |
| **Sản phẩm nông sản còn giống thẻ đồ họa, thiếu ảnh chụp / model 3D chân thực** | `boss_05_agri_demo_booth3.png`: thẻ SVG nền xanh + prop 3D hình trụ/hộp nhỏ | **Cao** | Cao (ấn tượng thị giác) | Thay ảnh SVG bằng ảnh chụp sản phẩm nông sản thật (PNG/JPG) hoặc model GLB nông sản | `v28AgriDemoShowcase.ts`, `DynamicBooth3D.tsx` | Thấp | **Nên làm** nếu sếp chấm kỹ mỹ thuật |
| **Gian hàng trống nhiều (86–96/100 gian trống)** | `boss_01_spawn_arch_trees.png`, `boss_02_map2d_landscape.png` | **Cao** | Trung bình–Cao | Bật sẵn `?demoAgri=1` khi trình diễn hoặc bổ sung dữ liệu trưng bày mẫu cho các gian đầu đại lộ | Dữ liệu demo / Admin | Thấp | Trao đổi thống nhất với sếp |
| **Nhãn `"Khu Chư..."` và `"Điện thoại"` trên gian nông sản** | `boss_01_spawn_arch_trees.png`, `boss_05_agri_demo_booth3.png` | **Cao** | Trung bình | Hiển thị fallback tên khu đẹp (`Khu trưng bày E`) và ưu tiên `booth.category` trên Focus HUD | `v28NavigationEngine.ts`, `DynamicWorldHud.tsx` | Rất thấp | **CÓ — Nên sửa ngay** |
| **Audio 10 gian nông sản chậm hơn 4 gian pregen** | `boss_audio_and_nav_audit.mjs` kích hoạt `piperTtsWorker` | **Trung bình** | Trung bình | Pregen thêm WAV cho 10 gian nông sản demo vào `manifest.json` hoặc hiển thị trạng thái đang tổng hợp rõ ràng | Pipeline pregen WAV (không sửa 85 WAV cũ) | Thấp | **Nên làm** trước demo live |
| **Hover/Highlight sản phẩm trên kệ gian #2 bị xuyên tầng trên** | Đo bounding box Mục 5.2 (`-1.1cm` .. `-14.4cm`) | **Trung bình** | Trung bình | Giảm `shelfFitScale` xuống `0.33` và dời billboard highlight thấp/ra trước | `v28ProductSlotLayouts.ts`, `DynamicBooth3D.tsx` | Rất thấp | **CÓ — Nên sửa ngay** |
| **Trải nghiệm cảm ứng & âm thanh trên điện thoại thật** | Chưa kiểm thử trên iOS/Android thật (`G11: PARTIAL`) | **Trung bình** | Cao | Test thực tế 10 phút trên 1 iPhone + 1 Android sau khi deploy staging | Không (QA thực tế) | Không | **CÓ — Bắt buộc trước go-live** |

---

## 12. Đánh giá trải nghiệm & thẩm mỹ (10 tiêu chí)

1. **Người mới có biết di chuyển không?** Khá rõ trên Mobile (có toast hướng dẫn kéo/vuốt), trên Desktop người mới vẫn có thể cần gợi ý ngắn (`WASD` / click sàn) ở 3 giây đầu.
2. **Dễ tìm gian hàng không?** Dễ nhờ Bản đồ 2D ngang có tìm kiếm 100 gian và chỉ dẫn 3D dưới chân.
3. **Dễ nhận diện khu vực không?** Tốt trên Bản đồ 2D (`KHU A–J`), nhưng ở 3D spawn bị giảm điểm do nhãn `"Khu Chư..."`.
4. **Biển hiệu có rõ không?** Tỷ lệ dài `4.78×0.56 m`, bo góc, tương phản cao, dễ đọc ở cả 6 archetypes.
5. **Camera Focus có giúp quan sát sản phẩm không?** Khung hình gọn, không cắt biển hiệu hay NPC, quan sát được toàn bộ sản phẩm.
6. **Sản phẩm có đặt trên nội thất thật không?** Đạt ở trạng thái tĩnh (đã kiểm chứng góc nghiêng trên gian #2); cần xử lý thêm khe hở khi hover/highlight ở 2 tầng kệ phải.
7. **NPC có tự nhiên và không che sản phẩm không?** Đứng gọn bên phải lối vào, không che sản phẩm và không còn bảng điều khiển lớn.
8. **Bản đồ 2D có dễ đọc không?** Bố cục ngang rõ ràng, sắc nét; chỉ cần thu nhẹ chiều cao SVG để thấy luôn 9 mục chú thích không phải cuộn.
9. **Cổng và cây xanh có đủ sinh động không?** Cổng `CON ĐƯỜNG NÔNG SẢN` và 2 cây lớn nổi bật; vẫn còn vài bồn cầu đa giác cũ ở rìa xa.
10. **Giao diện có quá nhiều nhãn/popup không?** Gọn hơn nhiều so với trước (đã xóa ô `Đi nhanh`, thu gọn Focus HUD, có nút `X` đóng gian gần); riêng vòng 3D dưới chân tại spawn có 5 nhãn cùng lúc nên hơi sát vai avatar.

---

## 13. Kết luận cuối cùng

### Trạng thái: **`READY WITH KNOWN LIMITATIONS`**

**Lý do dựa trên bằng chứng:**
- **Đủ điều kiện trình diễn kiểm duyệt nội bộ / staging:** Không có lỗi P0/crash, `0` lỗi Console/404, `161/161` unit tests PASS, toàn bộ kiến trúc chính (cổng `CON ĐƯỜNG NÔNG SẢN`, bản đồ 2D ngang, HUD gọn, biển hiệu bo góc dài, đặt sản phẩm lên 2 tầng kệ gian #2, 10 gian nông sản demo, 85 WAV pregen) đều chạy ổn định.
- **Chưa đạt mức "không còn giới hạn" để deploy thẳng Production trước khi chốt:** Còn 2 lỗi P1 dễ sửa (`slot_05/06` xuyên kệ khi hover/highlight và nhãn `"Khu Chư..."` tại spawn), 1 lỗi hiển thị ngành `"Điện thoại"` trên Focus HUD của gian nông sản demo, thiếu `VITE_NPC_TTS_MODE=hybrid` trong `FE/.env`, và **chưa kiểm thử trên điện thoại vật lý thật**.

**Đề xuất bước tiếp theo (chờ xác nhận của bạn):**
1. Duyệt sửa nhanh nhóm 4 lỗi nhỏ (P1 + P2) gồm: (a) khoảng hở hover/highlight 2 tầng kệ gian #2, (b) bỏ nhãn `"Khu chưa phân bổ"` trên 3D Nav Ring, (c) sửa nhãn ngành `"Điện thoại"` trên Focus HUD gian nông sản, (d) bổ sung `VITE_NPC_TTS_MODE=hybrid` vào `FE/.env`.
2. Sau đó kiểm thử nhanh trên 1 thiết bị di động thật trước khi quyết định commit và deploy Plesk.
