# GRAND EXPO V28 — BOSS REVIEW HOTFIX P2-01
# SỬA DỮ LIỆU FOCUS HUD CHO 10 GIAN NÔNG SẢN DEMO (`?demoAgri=1`)

**Ngày thực hiện:** 2026-11-22  
**Branch / Git HEAD:** `main` @ `dfe4281` (giữ nguyên toàn bộ Phase 1–8, UAT Fix 01–07 và Hotfix P1; chưa stage/commit/push/deploy/ZIP)  
**Phạm vi:** Chỉ sửa P2-01 (dữ liệu & hiển thị Focus HUD cho 10 gian nông sản demo). Không triển khai P2-02 / P2-03, không sửa model 3D, camera, cảnh quan, NPC/TTS, 85 WAV hay Production DB.  
**Kết luận:** ✅ **HOTFIX P2-01 PASS — 20/20 QUALITY GATES PASSED**

---

## 1. Git Baseline & Tài sản bảo toàn

- **Repository Root:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch / HEAD:** `main` (`dfe4281`)
- **FE Production Bundle sau P2-01:** `FE/dist/assets/index-DYcne8jB.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)
- **Unit Tests (FE + BE):** **`36/36` files — `161/161` tests PASS** (bổ sung assertion regression hợp lệ trong `v28AgriShowcasePhase3.test.ts`, không sửa test để ép PASS)
- **Bảo toàn:** 100 gian / 10 khu, 6 archetypes, 10 gian nông sản demo / 20 sản phẩm, toàn bộ Hotfix P1, Product Detail, NPC highlight, 85 WAV + `manifest.json`, Production DB.

---

## 2. Root Cause Analysis

1. **Vì sao gian nông sản demo #3 hiển thị `"Điện thoại"` (và #12/#13 hiển thị `"Âm thanh"`)?**
   - Trong `FE/src/services/v28AgriDemoShowcase.ts` (`applyAgriDemoShowcaseOverlay`, L249–L257), lớp overlay demo chỉ ghi đè `boothName`, `companyName`, `category: spec.category` (`'Nông sản'`), `color`, `slots`, `assignedSlotCount` nhưng **không cập nhật `zoneCategoryTag` và `zoneName`**. Do đó các gian `#3..#10` (nằm ở Khu A) giữ nguyên `zoneCategoryTag: "Điện thoại"` và `#12, #13` (Khu B) giữ nguyên `zoneCategoryTag: "Âm thanh"` của dữ liệu khu Production nền.
   - Trong `FE/src/components/v28/DynamicWorldHud.tsx` (L221–L224), `focusedCategoryLabel` ưu tiên `focusedBooth.zoneCategoryTag` trước `focusedBooth.category` → khiến toàn bộ **10/10 gian nông sản demo** đều hiển thị sai ngành của khu nền Production.
2. **Giải thích ý nghĩa số sản phẩm `2/6 SP`:**
   - Số `2` là `focusedBooth.assignedSlotCount` (`nextSlots.filter((s) => Boolean(s.product)).length`), tức số slot đang trưng bày sản phẩm thực tế trên gian hàng (mỗi gian demo có đúng 2 sản phẩm; tổng 10 gian = 20 sản phẩm).
   - Số `6` là tổng số slot trưng bày của mỗi gian V28 (`focusedBooth.slots.length === 6`: `slot_01..slot_06`).
   - Do đó `2/6 SP` mang ý nghĩa nghiệp vụ đồng nhất với gian Production (`#1: 6/6 SP`, `#2: 4/6 SP`, `#11: 1/6 SP`, `#21: 1/6 SP`).
3. **Phạm vi ảnh hưởng:** Grep toàn bộ `FE/src` xác nhận `zoneCategoryTag` chỉ được dùng duy nhất tại `DynamicWorldHud.tsx:222–223` (Focus HUD).

---

## 3. Luồng dữ liệu Trước / Sau & Danh sách file thay đổi

- **Trước sửa:** `AGRI_DEMO_BOOTH_SPECS` → `applyAgriDemoShowcaseOverlay` (giữ nguyên `zoneCategoryTag` cũ của Production) → `DynamicWorldHud` đọc `focusedBooth.zoneCategoryTag` → hiển thị `"Điện thoại · 2/6 SP"` (Khu A) / `"Âm thanh · 2/6 SP"` (Khu B).
- **Sau sửa:** `AGRI_DEMO_BOOTH_SPECS` → `applyAgriDemoShowcaseOverlay` gán `zoneCategoryTag: "${spec.category} — ${spec.groupName}"` và `zoneName: "Khu ${b.zoneCode} — ${spec.category}"` (chỉ trong clone demo `?demoAgri=1`) → `DynamicWorldHud` hiển thị đúng `"Nông sản — <nhóm hàng> · 2/6 SP"` bằng tổng slot động `focusedTotalSlots = focusedBooth.slots.length || 6`; khi tắt `?demoAgri=1`, Production giữ nguyên 100%.

| File | Phạm vi dòng | Nội dung thay đổi |
| :--- | :--- | :--- |
| [v28AgriDemoShowcase.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/services/v28AgriDemoShowcase.ts#L249-L260) | L249–L260 | Bổ sung `zoneCategoryTag: "${spec.category} — ${spec.groupName}"` và `zoneName: "Khu ${b.zoneCode} — ${spec.category}"` trong `applyAgriDemoShowcaseOverlay` (cô lập hoàn toàn trong chế độ demo). |
| [DynamicWorldHud.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx#L221-L226) | L221–L226, L318, L428–L446 | Dùng `focusedTotalSlots = Math.max(1, focusedBooth?.slots?.length || 6)` thay cho số `6` cứng, cập nhật `title` dùng `focusedCategoryLabel`, mở rộng `maxWidth: 360` + `textOverflow: 'ellipsis'` để pill hiển thị trọn 1 dòng gọn gàng. |
| [v28AgriShowcasePhase3.test.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/__tests__/v28AgriShowcasePhase3.test.ts#L30-L45) | L30–L45 | Bổ sung assertion xác minh 10/10 gian demo có `zoneCategoryTag` chứa `'Nông sản'` (không chứa `'Điện thoại' | 'Âm thanh' | 'Máy tính bảng'`) và 4 gian Production giữ nguyên `zoneCategoryTag` gốc. |

---

## 4. Bảng kiểm thử thực tế đủ 10 gian nông sản (`?demoAgri=1`) & 20/20 sản phẩm

| Gian | Khu | Doanh nghiệp Demo | Focus HUD thực tế (`hotfix_p2_01_qa.mjs`) | Số SP | Product Detail (20/20) | Kết quả |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| **#3** | A | HTX Dừa Xanh Bến Tre (Demo) | `#3 · Khu A Nông sản — Sản phẩm từ dừa · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p01`, `agri-p02`) | **PASS** |
| **#4** | A | Nông Trại Mật Ong Tây Nguyên (Demo) | `#4 · Khu A Nông sản — Mật ong · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p03`, `agri-p04`) | **PASS** |
| **#5** | A | Đà Lạt Farm Sấy Dẻo (Demo) | `#5 · Khu A Nông sản — Trái cây sấy · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p05`, `agri-p06`) | **PASS** |
| **#6** | A | Vườn Trái Cây Miền Tây (Demo) | `#6 · Khu A Nông sản — Trái cây tươi · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p07`, `agri-p08`) | **PASS** |
| **#7** | A | Cà Phê Rang Mộc Buôn Ma Thuột (Demo) | `#7 · Khu A Nông sản — Cà phê · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p09`, `agri-p10`) | **PASS** |
| **#8** | A | Trà Shan Tuyết & Thảo Mộc (Demo) | `#8 · Khu A Nông sản — Trà và thảo mộc · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p11`, `agri-p12`) | **PASS** |
| **#9** | A | Lúa Gạo Đồng Bằng Sông Cửu Long (Demo) | `#9 · Khu A Nông sản — Gạo và ngũ cốc · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p13`, `agri-p14`) | **PASS** |
| **#10** | A | Hạt Dinh Dưỡng Bình Phước (Demo) | `#10 · Khu A Nông sản — Hạt dinh dưỡng · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p15`, `agri-p16`) | **PASS** |
| **#12** | B | Gia Vị Đặc Sản Phú Quốc & Tây Bắc (Demo) | `#12 · Khu B Nông sản — Gia vị nông sản · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p17`, `agri-p18`) | **PASS** |
| **#13** | B | Đồ Uống Nông Sản Tự Nhiên (Demo) | `#13 · Khu B Nông sản — Nước uống từ nông sản · 2/6 SP` | `2/6` | 2/2 PASS (`agri-p19`, `agri-p20`) | **PASS** |

- **Đóng & mở lại Focus Mode gian #3 (`booth3ReopenHud`):** `#3 · Khu A Nông sản — Sản phẩm từ dừa · 2/6 SP` (không giữ dữ liệu cũ từ gian #13 trước đó).

---

## 5. Kiểm thử Regression 4 gian Production (Tắt `?demoAgri=1`)

| Gian Production | Focus HUD thực tế (`hotfix_p2_01_qa.mjs`) | Tooltip đầy đủ | Trạng thái |
| :---: | :--- | :--- | :---: |
| **#1** | `#1 · Khu A Điện thoại · 6/6 SP` | `CELLPHONES · Điện thoại · 6/6 sản phẩm` | **PASS** |
| **#2** | `#2 · Khu A Điện thoại · 4/6 SP` | `CELLPHONES · Điện thoại · 4/6 sản phẩm` | **PASS** |
| **#11** | `#11 · Khu B Âm thanh · 1/6 SP` | `CELLPHONES · Âm thanh · 1/6 sản phẩm` | **PASS** |
| **#21** | `#21 · Khu C Máy tính bảng · 1/6 SP` | `CELLPHONES · Máy tính bảng · 1/6 sản phẩm` | **PASS** |

---

## 6. Screenshot Bằng Chứng Thực Tế (Trước / Sau)

- **Gian #3 Trước sửa (lỗi `Điện thoại · 2/6 SP`):** [boss_05_agri_demo_booth3.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/boss_05_agri_demo_booth3.png)
- **Gian #3 Sau sửa (`Nông sản — Sản phẩm từ dừa · 2/6 SP`):** [hotfix_p2_01_booth3_after.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p2_01_booth3_after.png)
- **Gian #12 Sau sửa (`Nông sản — Gia vị nông sản · 2/6 SP`):** [hotfix_p2_01_booth12_after.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p2_01_booth12_after.png)
- **Production Gian #2 (`?demoAgri=1` OFF — `Điện thoại · 4/6 SP`):** [hotfix_p2_01_prod_booth2.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p2_01_prod_booth2.png)
- **Mobile Emulation (`390×844` — Gian #3):** [hotfix_p2_01_mobile_390.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/hotfix_p2_01_mobile_390.png)

---

## 7. Kết quả 20/20 Quality Gate (`P2-01-T01` – `P2-01-T20`)

| Gate | Yêu cầu | Kết quả | Bằng chứng |
| :---: | :--- | :---: | :--- |
| **P2-01-T01** | Tái hiện lỗi Focus HUD trước sửa | **PASS** | `boss_05_agri_demo_booth3.png` (`Điện thoại · 2/6 SP`) |
| **P2-01-T02** | Xác định đúng root cause | **PASS** | `v28AgriDemoShowcase.ts` thiếu `zoneCategoryTag`, `DynamicWorldHud.tsx:222` ưu tiên `zoneCategoryTag` |
| **P2-01-T03** | Xác định đúng nguồn metadata demo | **PASS** | `AGRI_DEMO_BOOTH_SPECS` (`spec.category` + `spec.groupName`) |
| **P2-01-T04** | Xác định đúng ý nghĩa số sản phẩm | **PASS** | `assignedSlotCount / slots.length` (`2/6 SP` = 2 slot có sản phẩm / 6 slot trưng bày) |
| **P2-01-T05** | Gian #3 hiển thị đúng ngành | **PASS** | `Nông sản — Sản phẩm từ dừa` (`hotfix_p2_01_booth3_after.png`) |
| **P2-01-T06** | Gian #3 hiển thị đúng số sản phẩm | **PASS** | `2/6 SP` |
| **P2-01-T07** | Gian #4–#6 hiển thị đúng | **PASS** | `hotfix_p2_01_qa.mjs` (`Mật ong`, `Trái cây sấy`, `Trái cây tươi` · `2/6 SP`) |
| **P2-01-T08** | Gian #7–#9 hiển thị đúng | **PASS** | `hotfix_p2_01_qa.mjs` (`Cà phê`, `Trà và thảo mộc`, `Gạo và ngũ cốc` · `2/6 SP`) |
| **P2-01-T09** | Gian #10, #12, #13 hiển thị đúng | **PASS** | `hotfix_p2_01_qa.mjs` & `hotfix_p2_01_booth12_after.png` (`Hạt dinh dưỡng`, `Gia vị nông sản`, `Nước uống từ nông sản`) |
| **P2-01-T10** | Đủ 10/10 gian có Focus HUD đúng | **PASS** | Bảng Mục 4 (`10/10`) |
| **P2-01-T11** | Đủ 20/20 sản phẩm mở đúng Product Detail | **PASS** | `v28AgriShowcasePhase3.test.ts` + `UAT_FIX_03_PRODUCT_SHOWCASE.md` (`20/20`, không đổi logic Product Detail) |
| **P2-01-T12** | Chuyển gian không giữ dữ liệu cũ | **PASS** | Quét tuần tự `#3 → #13` cập nhật đúng từng gian |
| **P2-01-T13** | Đóng/mở Focus không gây sai metadata | **PASS** | `booth3ReopenHud` đúng `Nông sản — Sản phẩm từ dừa · 2/6 SP` |
| **P2-01-T14** | 4 gian Production không regression | **PASS** | `#1 (Điện thoại · 6/6 SP)`, `#2 (Điện thoại · 4/6 SP)`, `#11 (Âm thanh · 1/6 SP)`, `#21 (Máy tính bảng · 1/6 SP)` |
| **P2-01-T15** | Demo và Production biệt lập | **PASS** | Xác minh trực tiếp khi bật và tắt `?demoAgri=1` + `v28AgriShowcasePhase3.test.ts` |
| **P2-01-T16** | P1 navigation và shelf highlight không regression | **PASS** | Không chạm `CharacterNavigationRing3D`, `v28NavigationEngine`, `DynamicBooth3D` |
| **P2-01-T17** | Desktop và mobile emulation không lỗi HUD | **PASS** | `mobileOverflowX: false`, `hotfix_p2_01_booth3_after.png` & `hotfix_p2_01_mobile_390.png` |
| **P2-01-T18** | FE Production Build PASS | **PASS** | `tsc --noEmit && vite build` (`index-DYcne8jB.js`, `11.63s`, `0` lỗi TS) |
| **P2-01-T19** | Toàn bộ unit tests PASS | **PASS** | **`36/36` files — `161/161` tests PASS** |
| **P2-01-T20** | Không có lỗi Console/Runtime/404 và không sửa Production DB | **PASS** | `runtimeErrors: []`, `asset404s: []`, `0` thay đổi BE/DB |

---

## 8. Giới hạn còn lại & Kết luận

- **Giới hạn chưa kiểm chứng:** Thiết bị Mobile vật lý thật (iOS Safari / Android Chrome) chưa kiểm thử ngoài Chrome Mobile Emulation.
- **Kết luận:** ✅ **HOTFIX P2-01 PASS (20/20)** — Đã hoàn tất và dừng lại chờ bạn duyệt trước khi triển khai P2-02.
