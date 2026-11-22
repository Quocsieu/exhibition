# GRAND EXPO V28 — UAT FIX 04
# COMPACT MAIN HUD + PREMIUM BOOTH SIGNAGE + IMPROVED FOCUS CAMERA

**Ngày hoàn thành:** 2026-11-22  
**Bundle FE cuối cùng:** `FE/dist/assets/index-KaWhCjzs.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)  
**Nghiệm thu kỹ thuật:** **`28 / 28` Quality Gate PASS** *(thẩm mỹ cung cấp screenshot thực tế chờ người dùng duyệt riêng)*

---

## 1. Nguyên nhân gốc của 3 vấn đề

1. **Thanh HUD chính (`FE/src/components/v28/DynamicWorldHud.tsx`):**
   - Còn tồn tại khối `<div className="hud-booth-picker"><select aria-label="Đi nhanh tới gian hàng">...</select></div>` (`~260 px` chiều rộng) cùng padding mặc định khiến thanh top bar cao `~70 px`.
2. **Biển hiệu gian hàng (`FE/src/scene/v28/DynamicBooth3D.tsx`):**
   - Tấm lưng `SIGN_BACK_GEOM` (`3.92 × 0.82 × 0.08`, vật liệu `#0f172a`) lớn hơn mặt bảng `SIGN_BOARD_GEOM` (`3.80 × 0.72`) tới `12 cm` ngang và `10 cm` dọc, tạo viền khung đen dày thô và chiếm nhiều chiều cao phía trên gian hàng.
3. **Camera Focus Mode (`FE/src/scene/v28/v28CameraController.ts`):**
   - Hệ số lề `widthMarginFactor = 0.58`, `verticalHalfSpan = signTopY * 0.58` và `Math.max(..., 9.2 * instanceScale)` đẩy camera ra xa (`~11.55 m` trên Desktop `1440×900`), làm gian hàng chỉ chiếm khoảng `~62%` khung nhìn.

---

## 2. Danh sách file & dòng code đã thay đổi

- [DynamicWorldHud.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx) (**L630–L712**):
  - Xóa hoàn toàn khối `.hud-booth-picker` (`<select>` "📍 Đi nhanh (100)…") không để lại khoảng trống.
  - Thu gọn header Desktop (`padding: 7px 14px`, `minHeight: 48px`, logo `32×32`, title `14.5px`, nút `minHeight: 34px`): chỉ còn `[3D + Grand Expo World V28 + Đã tham quan]  [🗺️ Bản đồ 2D] [⋯ Xem thêm]`.
- [DynamicBooth3D.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx) (**L28–L35, L198–L279, L500–L508**):
  - Thu mảnh khung bảng hiệu: `SIGN_BOARD_GEOM = 3.56 × 0.60`, `SIGN_BACK_GEOM = 3.60 × 0.63 × 0.042` với vật liệu kim loại xám satin `#334155` (viền mảnh ~1.5–2 cm thay cho khung đen dày).
  - Bố cục canvas `1024×176` hiện đại: đưa **Tên doanh nghiệp** lên làm nội dung chính lớn nhất (`48px` / `38px`, tự động xuống 2 dòng), logo/monogram cân đối bên trái (`112×112`), đặt gọn `#số gian` và `KHU` thành 2 pill nhỏ góc trên phải. Giữ nguyên hiển thị 2 mặt trước/sau (`±0.024`) và **0 tăng draw calls**.
- [v28CameraController.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/v28CameraController.ts) (**L103–L127**):
  - Tinh chỉnh `widthMarginFactor` (`0.58 → 0.51` Desktop, `0.62 → 0.57` Portrait), `verticalHalfSpan` (`0.58 → 0.50` Desktop, `0.62 → 0.56` Mobile Landscape), sàn khoảng cách (`9.2 → 8.0 * instanceScale`), giữ `minSafeDist = halfDepth + 4.15 * instanceScale` (chống xuyên tường/cột) và tinh chỉnh góc nhìn (`localCamY: 2.38`, `localLookY: 1.92`).

---

## 3. So sánh định lượng Trước / Sau

| Hạng mục | Trước (Baseline) | Sau (UAT Fix 04) | Cải thiện |
|---|---|---|---|
| Ô "📍 Đi nhanh (100)…" | Có (`~260 px`) | **Đã xóa hoàn toàn (`0 px`)** | Gọn thanh điều khiển |
| Chiều cao HUD Desktop (`1440×900`) | `~70 px` (`7.8%` chiều cao) | **`52 px` (`5.8%` chiều cao)** | Giảm **~26%** |
| Kích thước khung biển hiệu 3D | `3.92 × 0.82 × 0.08 m` (viền đen dày `10–12 cm`) | **`3.60 × 0.63 × 0.042 m`** (viền satin mảnh `1.5–2 cm`) | Mỏng gọn hơn **~23%** chiều cao, viền mỏng hơn **~5×** |
| Khoảng cách Camera Focus (Desktop) | `~11.55 m` | **`~9.95 m`** (~14–16% gần hơn) | Gian hàng lớn & rõ sản phẩm hơn ~15% |
| Draw Calls (Gian `#1` Focus) | `154` | **`100–149`** (không tăng draw calls) | Ổn định |

---

## 4. Kết quả 28/28 Quality Gate bắt buộc

| Nhóm | Gate | Kết quả | Bằng chứng |
|---|---|---|---|
| **HUD** | **T01** Ô Đi nhanh biến mất hoàn toàn | **PASS** | `quickJumpPresent: false` (`uat_fix04_01_hud_desktop.png`) |
| **HUD** | **T02** Không còn khoảng trống thừa | **PASS** | `uat_fix04_01_hud_desktop.png` |
| **HUD** | **T03** Logo, tên hệ thống & tiến độ đúng | **PASS** | `progress: "Đã tham quan: 0/100 gian"` |
| **HUD** | **T04** Bản đồ 2D mở bình thường | **PASS** | `mapBtn: true`, điều hướng thành công tới 7 gian qua Bản đồ 2D |
| **HUD** | **T05** Menu `⋯ Xem thêm` hoạt động | **PASS** | `moreBtn: true`, `moreMenuOpens: true` |
| **HUD** | **T06** HUD gọn hơn baseline, không che cảnh quan | **PASS** | `52 px` (cổng `CON ĐƯỜNG NÔNG SẢN` thoáng hoàn toàn) |
| **Biển hiệu** | **T07** Biển hiệu mới rõ, cân đối, dễ đọc | **PASS** | 7 ảnh thực tế (Gian `#50` + đủ 6 archetypes) |
| **Biển hiệu** | **T08** Khung viền mỏng gọn | **PASS** | `3.60×0.63` vs `3.56×0.60` (`uat_fix04_02_focus_booth50.png`) |
| **Biển hiệu** | **T09** Logo/monogram, tên DN, số gian, khu đúng dữ liệu | **PASS** | `#50 KHU E · CELLPHONES`, `#4 KHU A · Nông Trại Mật Ong Tây Nguyên (Demo)`, v.v. |
| **Biển hiệu** | **T10** Đủ 6/6 archetypes hiển thị đúng | **PASS** | 6 ảnh `uat_fix04_arch_*` (`gallery_arch`, `dynamic_frame`, `signature_ring`, `organic_flow`, `grand_portal`, `wave_pavilion`) |
| **Biển hiệu** | **T11** Nhận diện từ bên hông & phía sau | **PASS** | Giữ nguyên mặt sau `z = -0.024, rotY = PI` |
| **Biển hiệu** | **T12** Không che lối vào, NPC hay sản phẩm | **PASS** | Xác nhận trên cả 7 ảnh Focus |
| **Camera** | **T13** Focus Mode làm gian hàng lớn hơn baseline | **PASS** | Gần hơn ~14–16% (`uat_fix04_02_focus_booth50.png`) |
| **Camera** | **T14** Camera nhìn trực diện mặt trước gian | **PASS** | `v28CameraAndMovementParity.test.ts` (`dot > 0.999`, `6/6` PASS) |
| **Camera** | **T15** Không cắt biển hiệu hoặc quầy trưng bày | **PASS** | Toàn bộ biển hiệu + quầy + NPC nằm trọn khung hình |
| **Camera** | **T16** NPC & sản phẩm vẫn click được | **PASS** | NPC & toàn bộ slot sản phẩm không bị che/cắt |
| **Camera** | **T17** Không camera clipping / xuyên vật thể | **PASS** | `minSafeDist = halfDepth + 4.15×scale` + `isPoseClear` giữ nguyên |
| **Camera** | **T18** Explore → Focus → Explore bình thường | **PASS** | `cameraMode: "focus"` → `returnedToExplore: true` |
| **Regression** | **T19** Desktop `1440×900` PASS | **PASS** | `uat_fix04_01_hud_desktop.png`, `uat_fix04_02_focus_booth50.png` |
| **Regression** | **T20** Tablet `768×1024` PASS | **PASS** | `tabletOverflowX: false` (`uat_fix04_03_tablet_768.png`) |
| **Regression** | **T21** Mobile emulation `390×844` PASS | **PASS** | `mobileOverflowX: false` (`uat_fix04_04_mobile_390.png`) |
| **Regression** | **T22** Không regression UAT Fix 01 (chỉ dẫn 3D) | **PASS** | `charNav3DVisible: true` trên `uat_fix04_01_hud_desktop.png` |
| **Regression** | **T23** Không regression UAT Fix 02 (bản đồ 2D ngang) | **PASS** | Điều hướng cả 7 gian trong test qua bản đồ 2D ngang + `v28InteractiveMap2D.test.ts` (`3/3` PASS) |
| **Regression** | **T24** Không regression UAT Fix 03 (10 gian nông sản) | **PASS** | Gian `#3`–`#6` nông sản hiển thị đúng cả 2D+3D (kể cả chai `agri-p04` trên `#4`) |
| **Regression** | **T25** Không regression NPC & Hybrid TTS | **PASS** | `v28NpcInteractionPhase1.test.ts` & `v28HybridTts.test.ts` PASS; 0 diff trên 85 WAV & audio engine |
| **Regression** | **T26** FE production build PASS | **PASS** | `dist/assets/index-KaWhCjzs.js` (`0` lỗi TS) |
| **Regression** | **T27** Toàn bộ FE unit tests PASS | **PASS** | **`16/16` files — `94/94` tests PASS** |
| **Regression** | **T28** Không lỗi runtime JS hoặc asset 404 | **PASS** | `runtimeErrors: []`, `asset404s: []` |

---

## 5. Danh mục Screenshot Trước / Sau

Thư mục: `C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/`

- **HUD Trước / Sau:** `phase7_01_hud_desktop_clean.png` → **`uat_fix04_01_hud_desktop.png`**
- **Gian `#50` Focus (Biển hiệu + Camera mới):** **`uat_fix04_02_focus_booth50.png`**
- **6/6 Archetypes (Biển hiệu + Camera Focus sau sửa):**
  - `gallery_arch` (`#1`): `phase6_01_signage_focus_booth1.png` → **`uat_fix04_arch_gallery_arch_b1.png`**
  - `dynamic_frame` (`#2`): `audit_signage_dynamic_frame_booth2.png` → **`uat_fix04_arch_dynamic_frame_b2.png`**
  - `signature_ring` (`#3`): `uat_fix03_01_b3_overview.png` → **`uat_fix04_arch_signature_ring_b3.png`**
  - `organic_flow` (`#4`): `phase6_02_signage_focus_booth4.png` → **`uat_fix04_arch_organic_flow_b4.png`**
  - `grand_portal` (`#5`): `audit_signage_grand_portal_booth5.png` → **`uat_fix04_arch_grand_portal_b5.png`**
  - `wave_pavilion` (`#6`): `audit_signage_wave_pavilion_booth6.png` → **`uat_fix04_arch_wave_pavilion_b6.png`**
- **Tablet & Mobile Focus:** **`uat_fix04_03_tablet_768.png`**, **`uat_fix04_04_mobile_390.png`**

---

## 6. Giới hạn còn lại

- Thiết bị di động vật lý (iOS Safari / Android Chrome) chưa kiểm thử trực tiếp (mới kiểm thử trên Chrome Emulation `390×844`).
- Đánh giá thẩm mỹ cuối cùng của HUD gọn, kiểu dáng biển hiệu và độ gần camera Focus chờ người dùng trực tiếp xem screenshot và xác nhận.
