# BÁO CÁO NÂNG CẤP TOÀN DIỆN 5 GIAN HÀNG 3D V2 — VIRTUAL EXPO PLAZA

**Ngày thực hiện:** 14/11/2026  
**Công nghệ:** React 18, TypeScript, React Three Fiber, Three.js, Blender 4.2 LTS, Python, GLB  
**Trạng thái:** HOÀN THÀNH TOÀN DIỆN (100% PASS)  
**Safety Lock:** Không commit, không push, không deploy.

---

## I. TỔNG QUAN DỰ ÁN VÀ KẾT QUẢ ĐẠT ĐƯỢC

Sau thành công của gian hàng mẫu **Kinetix Robotics & AI V2**, toàn bộ **5 gian hàng 3D còn lại** trên quảng trường Virtual Expo Plaza đã được nâng cấp lên phiên bản kiến trúc **V2** thông qua quy trình tự động hóa bằng Blender 4.2 LTS headless script:

1. **Aether Tech Lab** — *Theme: `tech`* (Công nghệ cao, vi mạch, IoT, robotics nhẹ)
2. **Nordic Living Studio** — *Theme: `living`* (Nội thất Bắc Âu, tối giản, ấm áp, gỗ sồi)
3. **EcoVita Roastery & Craft** — *Theme: `coffee`* (Cà phê đặc sản, thủ công, gỗ espresso, ống đồng)
4. **Lumina Design Collective** — *Theme: `design`* (Kiến trúc, nghệ thuật đương đại, đá cẩm thạch trắng, champagne gold)
5. **Solaris Clean Energy** — *Theme: `energy`* (Năng lượng tái tạo, pin mặt trời, kiến trúc sinh thái xanh)

**Kinetix Robotics & AI V2** (*Theme: `robotics`*) được giữ nguyên toàn vẹn, hoàn toàn không hồi quy hay xung đột hình học.

---

## II. BẢNG SO SÁNH THÔNG SỐ VÀ FILE GLB V2

| STT | Tên Gian hàng | Theme | File GLB V2 | Dung lượng | Đỉnh / Mặt tam giác | Phong cách thiết kế đặc trưng |
|:---:|:---|:---:|:---|:---:|:---:|:---|
| 1 | **Aether Tech Lab** | `tech` | [`aether_tech_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/v2/aether_tech_v2.glb) | 257 KB | 2,688 v / 2,456 f | Khung hợp kim nhôm Anodized, ống dẫn LED Cyan, kiosk điều khiển vát cạnh |
| 2 | **Nordic Living Studio** | `living` | [`nordic_living_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/v2/nordic_living_v2.glb) | 358 KB | 3,856 v / 3,660 f | Gỗ sồi ấm (Warm Oak), nan gỗ tambour, nẹp đồng satin brass, nỉ len kem |
| 3 | **EcoVita Roastery & Craft** | `coffee` | [`ecovita_coffee_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/v2/ecovita_coffee_v2.glb) | 237 KB | 2,608 v / 2,420 f | Gỗ espresso sẫm, ống đồng công nghiệp (copper pipes), sắt rèn thủ công |
| 4 | **Kinetix Robotics & AI** | `robotics` | [`kinetix_booth_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/kinetix-v2/kinetix_booth_v2.glb) | 262 KB | 2,752 v / 2,520 f | Thép công nghiệp sơn tĩnh điện, cột truss chrome, nẹp vàng hazard, carbon fiber |
| 5 | **Lumina Design Collective** | `design` | [`lumina_design_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/v2/lumina_design_v2.glb) | 201 KB | 2,176 v / 2,040 f | Cẩm thạch trắng Alabaster, nẹp vàng Champagne, rãnh hắt LED Magenta |
| 6 | **Solaris Clean Energy** | `energy` | [`solaris_energy_v2.glb`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/v2/solaris_energy_v2.glb) | 244 KB | 2,648 v / 2,490 f | Trắng bóng Gloss White, nan sườn quang điện Photovoltaic, LED ngọc bích |

---

## III. NGUYÊN TẮC HÌNH HỌC VÀ TỌA ĐỘ BẤT BIẾN (36 PRODUCT SLOTS)

Tất cả 5 model mới tuân thủ nghiêm ngặt hệ thống tọa độ đã được kiểm toán trong [`BOOTH_PRODUCT_SLOT_MAPPING.md`](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/BOOTH_PRODUCT_SLOT_MAPPING.md):

1. **Quầy trưng bày chính (KHU B — Hero Counter):**
   - Vị trí trung tâm: $x = 0$, $z = 0.92\text{m}$.
   - Mặt quầy đặt chính xác tại $y = 0.56\text{m}$.
   - Tọa độ Slot 01 (Trái): $[-0.92, 0.56, 0.92]\text{m}$.
   - Tọa độ Slot 02 (Phải): $[+0.92, 0.56, 0.92]\text{m}$.

2. **Hệ kệ bậc 2 tầng hai bên (KHU C — Side Stepped Shelves):**
   - Kệ trái (Trục $x = -2.44\text{m}$):
     - Slot 03 (Tầng trên): $[-2.44, 1.72, 0.68]\text{m}$ (mặt kệ $y = 1.72\text{m}$).
     - Slot 04 (Tầng dưới): $[-2.44, 0.42, 1.12]\text{m}$ (mặt kệ $y = 0.42\text{m}$).
   - Kệ phải (Trục $x = +2.44\text{m}$):
     - Slot 05 (Tầng trên): $[+2.44, 1.72, 0.68]\text{m}$ (mặt kệ $y = 1.72\text{m}$).
     - Slot 06 (Tầng dưới): $[+2.44, 0.42, 1.12]\text{m}$ (mặt kệ $y = 0.42\text{m}$).

3. **Khung biển hiệu doanh nghiệp (KHU A — Sign Header):**
   - Khung GLB: Cao độ $y = 3.38\text{m}$, mặt trước tại $z = 3.57\text{m}$.
   - Mặt phẳng CanvasTexture động: $[0, 3.38, 3.60]\text{m}$, kích thước $5.16\text{m} \times 0.68\text{m}$.
   - Nằm ngay sát phía trước mặt khung 3cm, đảm bảo 100% không bị che khuất và hiển thị sắc nét thông tin doanh nghiệp, logo, slogan từ Admin.

4. **Khung phông nền triển lãm (KHU A — Enterprise Backdrop):**
   - Khung GLB: $z = -1.95\text{m}$.
   - Mặt phẳng CanvasTexture động: $[0, 1.82, -1.86]\text{m}$.
   - Hiển thị đầy đủ phông nền showroom chính hãng, logo và thông điệp thương hiệu.

5. **Thiết kế Roofless (Không mái che kín):**
   - 100% gian hàng không có trần đặc, góc nhìn Isometric Overview từ trên cao nhìn thấy toàn bộ không gian nội thất, sản phẩm và khách tham quan.

---

## IV. TÍCH HỢP CODE TRÊN WEBSITE

1. **[`FE/src/scene/RooflessBoothShell.tsx`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/RooflessBoothShell.tsx):**
   - Định nghĩa `V2_GLB_MAP` tự động ánh xạ cả 6 theme sang các model V2 tối ưu.
   - Khi `isV2 === true`, triệt tiêu toàn bộ `floor` thủ tục cũ (`floor = null`), loại bỏ hoàn toàn hiện tượng z-fighting hay sàn bị trùng lặp.

2. **[`FE/src/scene/Booth.tsx`](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx):**
   - Kích hoạt chuẩn kiến trúc V2: `const isBoothV2 = true`.
   - Vô hiệu hóa quầy thủ tục cũ (`EXPO_COUNTER_*`), kệ 2 tầng thủ tục cũ (`STEPPED_RACK_*`), thảm thủ tục cũ (`CARPET_MAT`) khi chạy V2.
   - Thay thế toàn bộ 6 khối cột/xà thủ tục đơn điệu ở KHU A bằng một Canvas Plane duy nhất tại $[0, 3.38, 3.60]\text{m}$, giao quyền hiển thị chi tiết kiến trúc, dầm xà, đèn rọi và khớp nối cho GLB V2.

---

## V. KẾT QUẢ KIỂM THỬ VÀ REGRESSION QA

1. **Kiểm tra biên dịch TypeScript & Vite:**
   - `npm --prefix FE run build` thành công trong 33.8s, **0 lỗi TypeScript**.
2. **Kiểm tra Unit & Integration Tests:**
   - `npm test` (vitest): **31/31 tests PASS** (2 test suites: BE + FE 2.5D Movement & Pathfinding).
3. **Kiểm tra mạng và tải tài nguyên thực tế:**
   - Playwright WebGL headless test kết nối thành công tới dev server.
   - **0 lỗi 404** đối với tất cả GLB và Texture.
4. **Kiểm tra tương tác sản phẩm (Product Slots):**
   - Click trực tiếp lên thẻ sản phẩm 3D tại quầy trung tâm (Slot 01) mở thành công `product-detail-modal`.
   - Hiển thị đầy đủ hình ảnh, mã SKU, giá bán, video demo và nút điều hướng "Mua tại website nguồn ↗".

---

## VI. BỘ ẢNH CHỤP THỰC TẾ TRÊN WEBSITE (EVIDENCE GALLERY)

Toàn bộ ảnh chụp kiểm chứng trực tiếp từ trình duyệt WebGL:

- **Quảng trường tổng thể (Overview):**  
  ![Toàn cảnh quảng trường 6 gian hàng V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_00_overview.png)

- **Gian 1 — Aether Tech Lab (Tech):**  
  ![Aether Tech Lab V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_1_Aether_Tech_Lab.png)

- **Gian 2 — Nordic Living Studio (Living):**  
  ![Nordic Living Studio V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_2_Nordic_Living_Studio.png)

- **Gian 3 — EcoVita Roastery & Craft (Coffee):**  
  ![EcoVita Roastery V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_3_EcoVita_Roastery___Craft.png)

- **Gian 4 — Kinetix Robotics & AI (Robotics):**  
  ![Kinetix Robotics V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_4_Kinetix_Robotics___AI.png)

- **Gian 5 — Lumina Design Collective (Design):**  
  ![Lumina Design Collective V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_5_Ki_n_tr_c_ngh__thu_t.png)

- **Gian 6 — Solaris Clean Energy (Energy):**  
  ![Solaris Clean Energy V2](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_booth_6_Solaris_Clean_Energy.png)

- **Kiểm thử Modal tương tác sản phẩm 3D:**  
  ![Product Detail Modal](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_07_product_modal.png)
