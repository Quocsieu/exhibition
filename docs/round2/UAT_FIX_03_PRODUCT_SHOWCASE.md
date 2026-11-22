# GRAND EXPO V28 — UAT FIX 03
# BÁO CÁO KIỂM THỬ TRƯNG BÀY 10 GIAN HÀNG NÔNG SẢN (`?demoAgri=1`)

**Ngày kiểm thử:** 2026-11-22  
**Bundle FE cuối cùng:** `FE/dist/assets/index-C4aMVnFe.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)  
**Trạng thái an toàn:** Cô lập hoàn toàn qua `?demoAgri=1` — **0 thay đổi** DB Production, **0 thay đổi** 4 gian CELLPHONES baseline, **0 thay đổi** 85 WAV & `manifest.json`, chưa commit/push/deploy.

---

## 1. Danh sách 10 gian hàng nông sản demo (`?demoAgri=1`)

| # | Booth ID | Số gian | Khu | Archetype | Nhóm nông sản | Doanh nghiệp Demo | Draw Calls | JS Heap |
|---:|---|---:|:---:|---|---|---|---:|---:|
| 1 | `v28-63e052-b003` | `#3` | A | `signature_ring` | Sản phẩm từ dừa | HTX Dừa Xanh Bến Tre (Demo) | `142` | `41.4 MB` |
| 2 | `v28-63e052-b004` | `#4` | A | `organic_flow` | Mật ong | Nông Trại Mật Ong Tây Nguyên (Demo) | `138` | `41.2 MB` |
| 3 | `v28-63e052-b005` | `#5` | A | `grand_portal` | Trái cây sấy | Đà Lạt Farm Sấy Dẻo (Demo) | `138` | `43.5 MB` |
| 4 | `v28-63e052-b006` | `#6` | A | `wave_pavilion` | Trái cây tươi | Vườn Trái Cây Miền Tây (Demo) | `139` | `37.1 MB` |
| 5 | `v28-63e052-b007` | `#7` | A | `gallery_arch` | Cà phê | Cà Phê Rang Mộc Buôn Ma Thuột (Demo) | `141` | `38.6 MB` |
| 6 | `v28-63e052-b008` | `#8` | A | `dynamic_frame` | Trà và thảo mộc | Trà Shan Tuyết & Thảo Mộc (Demo) | `140` | `39.2 MB` |
| 7 | `v28-63e052-b009` | `#9` | A | `signature_ring` | Gạo và ngũ cốc | Lúa Gạo Đồng Bằng Sông Cửu Long (Demo) | `945`* | `33.4 MB` |
| 8 | `v28-63e052-b010` | `#10` | A | `organic_flow` | Hạt dinh dưỡng | Hạt Dinh Dưỡng Bình Phước (Demo) | `959`* | `35.0 MB` |
| 9 | `v28-63e052-b012` | `#12` | B | `wave_pavilion` | Gia vị nông sản | Gia Vị Đặc Sản Phú Quốc & Tây Bắc (Demo) | `149` | `37.8 MB` |
| 10 | `v28-63e052-b013` | `#13` | B | `gallery_arch` | Nước uống từ nông sản | Đồ Uống Nông Sản Tự Nhiên (Demo) | `140` | `36.5 MB` |

*(\*Gian `#9` và `#10` nhìn thẳng ra tiểu cảnh cây `tree-gian.glb` ở giữa sân chữ U nên frustum chứa nhiều nhánh lá hơn; bộ nhớ phẳng `33.4–43.5 MB`, không rò rỉ khi chuyển đủ 10 gian.)*

---

## 2. Bảng kiểm tra chi tiết 20/20 sản phẩm (Render & Click trực tiếp trong 3D)

| Booth ID | Archetype | Slot ID | Product ID | Loại 2D/3D | Hiển thị | Click | Vị trí | Kết quả |
|---|---|---|---|---|---|---|---|---|
| `v28-63e052-b003` | `signature_ring` | `slot_01` | `agri-p01` (`AGRI-DUA-01`) | 2D SVG + 3D `bottle` | Đúng tên/giá/ảnh | PASS (mở đúng Detail + ảnh + SKU) | Khít đảo trung tâm, 0 lơ lửng | **PASS** |
| `v28-63e052-b003` | `signature_ring` | `slot_02` | `agri-p02` (`AGRI-DUA-02`) | 2D SVG + 3D `box` | Đúng tên/giá/ảnh | PASS | Khít bục tròn trái | **PASS** |
| `v28-63e052-b004` | `organic_flow` | `slot_01` | `agri-p03` (`AGRI-ONG-01`) | 2D SVG + 3D `jar` | Đúng tên/giá/ảnh | PASS | Khít bục trung tâm trái | **PASS** |
| `v28-63e052-b004` | `organic_flow` | `slot_02` | `agri-p04` (`AGRI-ONG-02`) | 2D SVG + 3D `bottle` | Đúng sau khi sửa `inferProductShape3D` | PASS | Khít bục trung tâm phải | **PASS** |
| `v28-63e052-b005` | `grand_portal` | `slot_01` | `agri-p05` (`AGRI-SAY-01`) | 2D SVG + 3D `pouch` | Đúng tên/giá/ảnh | PASS | Khít đảo demo bậc thang | **PASS** |
| `v28-63e052-b005` | `grand_portal` | `slot_02` | `agri-p06` (`AGRI-SAY-02`) | 2D SVG + 3D `box` | Đúng tên/giá/ảnh | PASS | Khít quầy chữ L trái | **PASS** |
| `v28-63e052-b006` | `wave_pavilion` | `slot_01` | `agri-p07` (`AGRI-TUOI-01`) | 2D SVG + 3D `basket` | Đúng tên/giá/ảnh | PASS | Khít bục trái-giữa #1 | **PASS** |
| `v28-63e052-b006` | `wave_pavilion` | `slot_02` | `agri-p08` (`AGRI-TUOI-02`) | 2D SVG + 3D `box` | Đúng tên/giá/ảnh | PASS | Khít bục trung tâm #2 | **PASS** |
| `v28-63e052-b007` | `gallery_arch` | `slot_01` | `agri-p09` (`AGRI-CAPHE-01`) | 2D SVG + 3D `pouch` | Đúng tên/giá/ảnh | PASS | Khít đảo trưng bày trái | **PASS** |
| `v28-63e052-b007` | `gallery_arch` | `slot_02` | `agri-p10` (`AGRI-CAPHE-02`) | 2D SVG + 3D `can` | Đúng tên/giá/ảnh | PASS | Khít đảo trưng bày phải | **PASS** |
| `v28-63e052-b008` | `dynamic_frame` | `slot_01` | `agri-p11` (`AGRI-TRA-01`) | 2D SVG + 3D `box` | Đúng tên/giá/ảnh | PASS | Khít bục đa diện trái | **PASS** |
| `v28-63e052-b008` | `dynamic_frame` | `slot_02` | `agri-p12` (`AGRI-TRA-02`) | 2D SVG + 3D `jar` | Đúng tên/giá/ảnh | PASS | Khít quầy nghiêng phải | **PASS** |
| `v28-63e052-b009` | `signature_ring` | `slot_01` | `agri-p13` (`AGRI-GAO-01`) | 2D SVG + 3D `pouch` | Đúng tên/giá/ảnh | PASS | Khít đảo trung tâm | **PASS** |
| `v28-63e052-b009` | `signature_ring` | `slot_02` | `agri-p14` (`AGRI-GAO-02`) | 2D SVG + 3D `box` | Đúng tên/giá/ảnh | PASS | Khít bục tròn trái | **PASS** |
| `v28-63e052-b010` | `organic_flow` | `slot_01` | `agri-p15` (`AGRI-HAT-01`) | 2D SVG + 3D `can` | Đúng tên/giá/ảnh | PASS | Khít bục trung tâm trái | **PASS** |
| `v28-63e052-b010` | `organic_flow` | `slot_02` | `agri-p16` (`AGRI-HAT-02`) | 2D SVG + 3D `jar` | Đúng tên/giá/ảnh | PASS | Khít bục trung tâm phải | **PASS** |
| `v28-63e052-b012` | `wave_pavilion` | `slot_01` | `agri-p17` (`AGRI-GV-01`) | 2D SVG + 3D `jar` | Đúng tên/giá/ảnh | PASS | Khít bục trái-giữa #1 | **PASS** |
| `v28-63e052-b012` | `wave_pavilion` | `slot_02` | `agri-p18` (`AGRI-GV-02`) | 2D SVG + 3D `bottle` | Đúng tên/giá/ảnh | PASS | Khít bục trung tâm #2 | **PASS** |
| `v28-63e052-b013` | `gallery_arch` | `slot_01` | `agri-p19` (`AGRI-NUOC-01`) | 2D SVG + 3D `bottle` | Đúng sau khi sửa `inferProductShape3D` | PASS | Khít đảo trưng bày trái | **PASS** |
| `v28-63e052-b013` | `gallery_arch` | `slot_02` | `agri-p20` (`AGRI-NUOC-02`) | 2D SVG + 3D `bottle` | Đúng tên/giá/ảnh | PASS | Khít đảo trưng bày phải | **PASS** |

**Tổng hợp tương tác 3D thực tế (`uat_fix03_agri_qa.mjs`):**
- `totalBoothsChecked`: **`10 / 10`**
- `totalProductsClickedOk`: **`20 / 20`**
- `totalProductsImgLoaded`: **`20 / 20`** (`naturalWidth > 0`)
- `totalProductsSkuMatched`: **`20 / 20`**
- `runtimeErrors`: **`0`**
- Asset 404s: **`0`** (không có lỗi GLB/PNG/WAV/JS 404).

---

## 3. Lỗi phát hiện & Sửa lỗi tối thiểu

- **Lỗi phát hiện khi soi ảnh cận cảnh (`uat_fix03_02_b4_closeup.png` & `uat_fix03_10_b13_closeup.png`):**
  - Hai sản phẩm `agri-p04` (*Mật ong rừng hoa nhãn 350ml — đóng chai*) và `agri-p19` (*Nước ép chanh dây mật ong chai 330ml*) có spec `shape3D: 'bottle'` nhưng thực tế lại render thành hũ (`jar`).
- **Nguyên nhân gốc (`FE/src/services/v28AgriDemoShowcase.ts:157-158`):**
  - Hàm `inferProductShape3D` kiểm tra regex `/mật ong|hũ|.../` **trước** `/chai|nước ép|.../`, khiến mọi sản phẩm chứa đồng thời `"mật ong"` và `"chai"` đều bị phân loại nhầm thành `jar`.
- **File đã sửa (tối thiểu 1 dòng logic):**
  - `FE/src/services/v28AgriDemoShowcase.ts` (L155–L165): Đưa nhánh từ khóa bao bì tường minh `/chai|dầu dừa|nước ép|nước cốt|muối ớt|sốt/` lên trước `/mật ong|hũ|.../`.

---

## 4. Danh mục Screenshot Toàn cảnh & Cận cảnh (20 ảnh thực tế)

Thư mục: `C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/`

1. Gian `#3` (Dừa Bến Tre — `signature_ring`): `uat_fix03_01_b3_overview.png` · `uat_fix03_01_b3_closeup.png`
2. Gian `#4` (Mật Ong — `organic_flow`): `uat_fix03_02_b4_overview.png` · `uat_fix03_02_b4_closeup.png`
3. Gian `#5` (Trái Cây Sấy — `grand_portal`): `uat_fix03_03_b5_overview.png` · `uat_fix03_03_b5_closeup.png`
4. Gian `#6` (Trái Cây Tươi — `wave_pavilion`): `uat_fix03_04_b6_overview.png` · `uat_fix03_04_b6_closeup.png`
5. Gian `#7` (Cà Phê — `gallery_arch`): `uat_fix03_05_b7_overview.png` · `uat_fix03_05_b7_closeup.png`
6. Gian `#8` (Trà & Thảo Mộc — `dynamic_frame`): `uat_fix03_06_b8_overview.png` · `uat_fix03_06_b8_closeup.png`
7. Gian `#9` (Gạo & Ngũ Cốc — `signature_ring`): `uat_fix03_07_b9_overview.png` · `uat_fix03_07_b9_closeup.png`
8. Gian `#10` (Hạt Dinh Dưỡng — `organic_flow`): `uat_fix03_08_b10_overview.png` · `uat_fix03_08_b10_closeup.png`
9. Gian `#12` (Gia Vị — `wave_pavilion`): `uat_fix03_09_b12_overview.png` · `uat_fix03_09_b12_closeup.png`
10. Gian `#13` (Nước Uống — `gallery_arch`): `uat_fix03_10_b13_overview.png` · `uat_fix03_10_b13_closeup.png`

---

## 5. Build, Unit Tests & Regression Safety (Sau khi sửa)

- **FE Production Build (`VITE_NPC_TTS_MODE=hybrid`):** **PASS** (`dist/assets/index-C4aMVnFe.js`, `0` lỗi TypeScript).
- **FE Unit Tests (`npx vitest run FE/src/__tests__ --no-file-parallelism`):** **PASS — `16/16` files, `94/94` tests** (bao gồm `v28AgriShowcasePhase3.test.ts`, `v28ProductSlotAlignment.test.ts`, `v28NpcInteractionPhase1.test.ts`, `v28NavigationPhase2.test.ts`, `v28InteractiveMap2D.test.ts`, `v28HybridTts.test.ts`).
- **Regression Check:** Không ảnh hưởng UAT Fix 01 (chỉ dẫn 3D quanh chân nhân vật), UAT Fix 02 (bản đồ 2D xoay ngang), Phase 1–8, Web Audio API Hybrid TTS hay 85 WAV baseline.

---

## 6. Các hạn chế chưa thể xác minh

1. **FPS phần cứng thực tế trên cả 10 gian:** Script CDP chạy trên Chrome headless SwiftShader (software rasterizer `1–3 FPS`); hiệu năng phần cứng thực tế (`60 FPS` Intel Iris Xe) đã đo ở baseline và Phase 3 nhưng chưa đo trực tiếp trên điện thoại di động vật lý (iOS/Android).
2. **Audio 10 gian nông sản mới:** Không pre-gen thêm WAV để bảo toàn nguyên vẹn 85 WAV cũ & DB Production; lời giới thiệu 20 sản phẩm demo chạy qua dynamic fallback Piper WASM.
3. **Thẩm mỹ sản phẩm 3D:** Hiện sử dụng 6 hình khối 3D nhẹ dùng chung (`bottle`, `jar`, `pouch`, `box`, `basket`, `can`) kết hợp thẻ bao bì 2D SVG để bảo toàn hiệu năng `60 FPS` cho 100 gian hàng; chờ người dùng duyệt mức độ trực quan.
