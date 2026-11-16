# BÁO CÁO KỸ THUẬT & QA — VIRTUAL EXPO PLAZA VISUAL REFINEMENT V4.1

- **Dự án:** Virtual Expo Plaza 3D
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Chế độ thực thi:** `AUDIT → BASELINE → TARGETED FIX → BROWSER QA → REPORT` (STRICT SCOPE LOCK)
- **Baseline HEAD (V4):** `fcc2df048552357bbc040a2b1e511ec45b51cf0f`

---

## 1. BASELINE (PHASE 0 — AUDIT & BASELINE)

### 1.1. Trạng thái Git & Build Baseline
- **Git HEAD:** `fcc2df048552357bbc040a2b1e511ec45b51cf0f` (`feat(scene): nang cap do hoa va dong bo canh quan Virtual Expo Plaza Visual Polish V4`)
- **Git Status ban đầu:** Working tree sạch (`0` thay đổi chưa commit).
- **Thông số Camera & Viewport đối chiếu trước/sau:**
  - Viewport: `1600 × 1000`
  - Camera Overview (`OrthographicCamera`): `position = [16.0, 26.2, 22.8]`, `zoom = 18.51`
- **Thông số Render Baseline (V4):**
  - Chế độ `Overview`: `682` draw calls, `1,527,797` triangles.
  - Chế độ `Tham quan`: `392–407` draw calls, `731,896–1,420,445` triangles.
- **Ảnh Baseline Overview trước V4.1:** [v4_1_00_baseline_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_00_baseline_overview.png)

### 1.2. Kết quả Audit 3 nhiệm vụ mục tiêu
1. **Task A (Vegetation Proportion):** Trong V4, 10 cây `PERIMETER_TREES` (`jacaranda_tree_lod.glb`, `bounds = [7.2, 6.8, 7.2]`) đã giảm scale từ `1.12..1.18` xuống `0.58..0.64`, khiến chiều cao thực tế chỉ còn `3.94m..4.35m` — thấp hơn hoặc chỉ ngang bằng cột đèn đường `Street_Lamp.glb` (`4.22m`) và gian hàng (`3.77m`).
2. **Task B (Booth Visibility):**
   - Trong V4, bảng hiệu mặt sau đã được bổ sung tại `z = 3.36m` (`rotationY = Math.PI`), không bị lật chữ, không bị z-fighting (mặt lưng hộp `Header_Casing` nằm tại `z = 3.39m`).
   - Có thể tăng nhẹ cỡ chữ tiêu đề/phụ đề trong `createBoothSignTexture` (`maxFontPx: 58 → 62`, `minFontPx: 32 → 36`, phụ đề `28 → 30`) và độ nổi bật của viền sáng chân đế gian hàng (`opacity: 0.45 → 0.72`) để dễ phân biệt 6 gian hàng từ xa hơn mà không sửa kết cấu gian hàng hay đổi camera Overview.
3. **Task C (External Cityscape):** Trong V4, 15 tòa nhà `STYLIZED_CITY_BUILDINGS` có chiều cao `sy = 12.0m..17.2m` (cao gấp `3.5–4.5` lần gian hàng) và rộng `sx = 6.6m..8.2m`, tạo khối kiến trúc khá đồ sộ ở rìa khung hình Overview.

![Ảnh Baseline Overview trước V4.1](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_00_baseline_overview.png)

---

## 2. VEGETATION PROPORTION (TASK A)

### 2.1. Bảng đối chiếu Scale & Position của 10 cây `PERIMETER_TREES`
Tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L88-L99), tăng scale có chọn lọc từ `0.58..0.64` lên `0.74..0.80` (chiều cao đạt `5.03m..5.44m`, tán rộng `5.33m..5.76m`), cao hơn cột đèn đường (`4.22m`) khoảng `0.8m–1.2m` đúng tỷ lệ cây xanh đô thị:

| Cây # | Trước V4.1 `[x, z, scale]` | Sau V4.1 `[x, z, scale]` | Chiều cao Trước → Sau | Lý do & Kiểm tra che khuất |
|---|---|---|---|---|
| 1 | `[-16.6, -16.6, 0.64]` | `[-16.6, -16.6, 0.78]` | `4.35m → 5.30m` | Góc Tây-Bắc sau Aether; không cắt mặt tiền gian hàng |
| 2 | `[16.6, -16.6, 0.64]` | `[16.6, -16.6, 0.76]` | `4.35m → 5.17m` | Góc Đông-Bắc sau EcoVita; giữ thoáng bảng hiệu |
| 3 | `[-16.6, 16.6, 0.64]` | `[-16.6, 16.6, 0.80]` | `4.35m → 5.44m` | Góc Tây-Nam sau Kinetix; cân đối với cổng chào |
| 4 | `[16.8, 14.2, 0.60]` | `[16.8, 16.2, 0.74]` | `4.08m → 5.03m` | Dịch nhẹ `+2.0m` theo trục Z về góc Đông-Nam để tăng scale lên `0.74` mà không chạm mặt sau Lumina |
| 5 | `[-17.0, -11.8, 0.64]` | `[-17.2, -11.8, 0.76]` | `4.35m → 5.17m` | Rìa Tây-Bắc; cao hơn cột đèn `4.22m`, không che Aether/Kinetix |
| 6 | `[17.0, -12.2, 0.60]` | `[17.2, -12.2, 0.74]` | `4.08m → 5.03m` | Rìa Đông-Bắc; giữ khoảng trống hoàn toàn trước mặt tiền EcoVita |
| 7 | `[-7.8, -16.8, 0.62]` | `[-7.8, -17.0, 0.76]` | `4.22m → 5.17m` | Khoảng hở giữa Aether và Nordic Living |
| 8 | `[7.8, -16.8, 0.62]` | `[7.8, -17.0, 0.76]` | `4.22m → 5.17m` | Khoảng hở giữa Nordic Living và EcoVita |
| 9 | `[-17.0, 11.8, 0.62]` | `[-17.2, 11.8, 0.78]` | `4.22m → 5.30m` | Rìa Tây-Nam; cách tia nhìn camera Showcase Kinetix `> 5.3m` |
| 10 | `[8.2, 16.8, 0.58]` | `[8.4, 17.0, 0.74]` | `3.94m → 5.03m` | Rìa Nam ngoài cùng (cây nhỏ nhất trong V4 được nâng từ `3.94m` lên `5.03m`) |

### 2.2. Kết quả kiểm tra che khuất
- **0/6 gian hàng** bị tán cây che khuất trong cả chế độ `Overview` và `Tham quan`.
- Cả 10 cây đều giữ khoảng cách `> 3.8m` tới toàn bộ tia nhìn camera Shop Showcase (kiểm chứng tự động trong `movementAndPathfinding.test.ts`).
- Ảnh kiểm chứng:
  - Toàn cảnh sau Task A: [v4_1_01_phase1_trees_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_01_phase1_trees_overview.png)
  - Cận cảnh cây đã cân chỉnh: [v4_1_05_adjusted_trees_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_05_adjusted_trees_closeup.png)

---

## 3. BOOTH VISIBILITY (TASK B)

### 3.1. Kết quả kiểm tra 6 gian hàng & Biển hiệu
- Đã kiểm tra toàn bộ 6 gian hàng V2 (`Aether Tech Lab`, `Nordic Living Studio`, `EcoVita Roastery & Craft`, `Kinetix Robotics & AI`, `Lumina Design Collective`, `Solaris Clean Energy`).
- Kiểm tra bảng hiệu mặt trước (`z = 3.60m`) và mặt sau (`z = 3.36m`, `rotation = [0, Math.PI, 0]`):
  - **Không bị lật chữ** (nhìn từ phía trước hay phía sau đều đọc thuận chiều từ trái sang phải).
  - **Không bị z-fighting** (cách bề mặt hộp `Header_Casing` `3cm` sạch sẽ).
  - **Không bị trùng hình hoặc chồng lớp** (đã xác minh và không gắn thêm bảng hiệu phụ gây đè lên thanh đèn spotlight trên nóc hoặc khung backdrop phía sau).
  - **Đồng bộ dữ liệu 100%** (cả 2 mặt đều dùng chung `currentSignTexture`).

### 3.2. Các tinh chỉnh tối thiểu đã thực hiện
1. Tại [sceneTextures.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/sceneTextures.ts#L337-L356): Tăng kích thước font chữ tên doanh nghiệp trong `createBoothSignTexture` từ `(max: 58px, min: 32px)` lên `(max: 62px, min: 36px)`, tăng độ đậm bóng đổ chữ (`shadowColor: rgba(0,0,0,0.65)`, `shadowBlur: 10`) và cỡ chữ dòng ngành hàng từ `(28px, 20px)` lên `(30px, 22px)`.
2. Tại [Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx#L659-L666): Tăng nhẹ độ rõ của viền sáng nhận diện thương hiệu quanh chân đế mỗi gian hàng (`opacity: 0.45 → 0.72` ở trạng thái nghỉ, `0.98` khi hover/chọn) giúp 6 gian hàng tách biệt sắc nét khỏi mặt sân đá ở góc nhìn Overview.
- Ảnh kiểm chứng:
  - Gian hàng bên trái (`Aether` & `Kinetix`): [v4_1_06_left_booths_aether_kinetix.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_06_left_booths_aether_kinetix.png)
  - Gian hàng bên phải (`EcoVita` & `Lumina`): [v4_1_07_right_booths_ecovita_lumina.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_07_right_booths_ecovita_lumina.png)
  - Biển hiệu mặt trước: [v4_1_08_front_signboard_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_08_front_signboard_closeup.png)
  - Biển hiệu mặt sau: [v4_1_09_rear_signboard_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_09_rear_signboard_closeup.png)

---

## 4. EXTERNAL CITYSCAPE (TASK C)

### 4.1. Tinh chỉnh tỷ lệ và vị trí 15 tòa nhà ngoại vi (`STYLIZED_CITY_BUILDINGS`)
Tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L185-L223):
- Giảm chiều cao `sy` của 15 tòa nhà khoảng `28%–33%` (từ `12.0m..17.2m` xuống `9.0m..11.4m`) và thu gọn bề rộng/sâu từ `6.6..8.2 × 6.2..6.8` xuống `5.8..6.8 × 5.6..5.8`.
- Dịch nhẹ trục tọa độ từ `±31.5m` ra `±31.8m` trên thềm đô thị và lùi nhẹ các đồi nền `HORIZON_HILLS` ra `±48m..-50m` để chân các tòa nhà đứng hoàn toàn trên thềm vỉa hè đô thị, không bị đồi cỏ cắt vào góc chân tường.

| Cụm tòa nhà | Trước V4.1 (`x/z`, `sx × sy × sz`, `ry`) | Sau V4.1 (`x/z`, `sx × sy × sz`, `ry`) |
|---|---|---|
| Dãy Bắc (7 tòa) | `z = -31.5..-31.8`, `sx = 7.2..8.2`, `sy = 12.8..17.2`, `sz = 6.2..6.6`, `ry = 0` | `z = -31.8..-32.0`, `sx = 6.4..6.8`, `sy = 9.6..11.4`, `sz = 5.6..5.8`, `ry = 0` |
| Dãy Tây (4 tòa) | `x = -31.5`, `sx = 6.6..6.8`, `sy = 12.4..14.2`, `sz = 6.6..6.8`, `ry = π/2` | `x = -31.8`, `sx = 5.8`, `sy = 9.0..10.2`, `sz = 5.6..5.8`, `ry = π/2` |
| Dãy Đông (4 tòa) | `x = 31.5`, `sx = 6.6..6.8`, `sy = 12.0..14.0`, `sz = 6.6..6.8`, `ry = -π/2` | `x = 31.8`, `sx = 5.8`, `sy = 9.0..10.0`, `sz = 5.6..5.8`, `ry = -π/2` |

- Ảnh kiểm chứng bối cảnh đô thị sau khi chỉnh: [v4_1_10_external_cityscape_after.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_10_external_cityscape_after.png)

````carousel
![Overview trước V4.1 (Baseline V4)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_00_baseline_overview.png)
<!-- slide -->
![Overview sau V4.1 (Cùng camera, zoom 18.51, viewport 1600×1000)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_03_final_overview.png)
<!-- slide -->
![Cận cảnh các cây ngoại vi sau khi cân chỉnh tỷ lệ (Task A)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_05_adjusted_trees_closeup.png)
<!-- slide -->
![Cận cảnh gian hàng bên trái: Aether Tech Lab & Kinetix Robotics](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_06_left_booths_aether_kinetix.png)
<!-- slide -->
![Cận cảnh gian hàng bên phải: EcoVita Roastery & Lumina Design](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_07_right_booths_ecovita_lumina.png)
<!-- slide -->
![Biển hiệu mặt trước gian hàng (Task B)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_08_front_signboard_closeup.png)
<!-- slide -->
![Biển hiệu mặt sau các gian hàng hướng Nam/Đông-Nam (Task B)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_09_rear_signboard_closeup.png)
<!-- slide -->
![Tòa nhà ngoại vi sau khi tinh chỉnh chiều cao & bố cục (Task C)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_1_10_external_cityscape_after.png)
````

---

## 5. QA, BUILD & PERFORMANCE

### 5.1. Kiểm tra Build, TypeScript & Regression Tests
- **TypeScript (`npm run typecheck`):** `PASS` (`0` lỗi ở cả `BE` và `FE`).
- **Frontend Production Build (`npm --prefix FE run build`):** `PASS` (`✓ 680 modules transformed`).
- **Automated Regression Tests (`npm test`):** `PASS` (`31/31 tests passed` trên 2 test suites).
- **Console / WebGL / GLB:** `0` lỗi WebGL hay GLB asset.

### 5.2. So sánh hiệu năng (FPS & Draw Calls trong cùng điều kiện Headless ANGLE D3D11 `1600×1000`)
| Chỉ số | Trước V4.1 (Baseline V4) | Sau V4.1 (Final) | Đánh giá |
|---|---|---|---|
| **Overview Draw Calls** | `682` | `682` | Giữ nguyên tuyệt đối (`+0` draw calls) |
| **Overview Triangles** | `1,527,797` | `1,527,797` | Giữ nguyên tuyệt đối (`+0` triangles) |
| **Overview FPS (Headless)** | `9.5 FPS` | `13.8 FPS` | Ổn định / Tốt hơn |
| **Explore Draw Calls** | `407` | `392` | Giữ nguyên ngân sách GPU |
| **Explore FPS (Headless)** | `7.3 FPS` | `8.6 FPS` | Ổn định |

### 5.3. Danh mục ảnh chụp Browser QA (`qa-reports/visual-polish-v4-1/`)
1. Overview trước V4.1: [v4_1_00_baseline_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_00_baseline_overview.png)
2. Overview sau Task A (Cây xanh): [v4_1_01_phase1_trees_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_01_phase1_trees_overview.png)
3. Overview sau V4.1 (Cùng camera, zoom, viewport): [v4_1_03_final_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_03_final_overview.png)
4. Góc nhìn Tham quan trung tâm: [v4_1_04_explore_center.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_04_explore_center.png)
5. Cận cảnh các cây đã cân chỉnh: [v4_1_05_adjusted_trees_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_05_adjusted_trees_closeup.png)
6. Gian hàng bên trái (`Aether` & `Kinetix`): [v4_1_06_left_booths_aether_kinetix.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_06_left_booths_aether_kinetix.png)
7. Gian hàng bên phải (`EcoVita` & `Lumina`): [v4_1_07_right_booths_ecovita_lumina.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_07_right_booths_ecovita_lumina.png)
8. Biển hiệu mặt trước: [v4_1_08_front_signboard_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_08_front_signboard_closeup.png)
9. Biển hiệu mặt sau: [v4_1_09_rear_signboard_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_09_rear_signboard_closeup.png)
10. Tòa nhà ngoại vi sau khi chỉnh: [v4_1_10_external_cityscape_after.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4-1/v4_1_10_external_cityscape_after.png)

---

## 6. GIT

### 6.1. Danh sách file thay đổi (3 files source code)
1. [FE/src/scene/Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx)
2. [FE/src/scene/Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx)
3. [FE/src/scene/sceneTextures.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/sceneTextures.ts)

### 6.2. Xác nhận Git Safety
- `git diff --check`: `0` lỗi.
- **Xác nhận:** Không chạy `git reset`, `git clean`, `git stash`, **không commit, không push, không deploy**.
