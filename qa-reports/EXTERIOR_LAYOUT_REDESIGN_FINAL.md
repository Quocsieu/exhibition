# BÁO CÁO NGHIỆM THU CUỐI CÙNG: EXTERIOR CLEANUP, CITY WALL REMOVAL & ROAD REDESIGN
**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Ngày thực hiện:** 2026-11-14  
**Trạng thái Git:** Sạch sẽ, không tự ý commit, không push.

---

## 1. BẢNG TỔNG HỢP TIÊU CHÍ (TASK EVALUATION)

| Task ID | Hạng mục công việc | Trạng thái | Ghi chú & Đánh giá |
|:---:|---|:---:|---|
| **TASK A** | Xóa mảng nền thừa dưới cây/ghế | **PASS** | Gỡ bỏ 4 mảng sàn bê tông chữ nhật (`plaza-ground-slab`, `roof_opt.glb`) tại cả 3 vùng khoanh đỏ và toàn bộ 4 góc quảng trường. |
| **TASK B** | Khôi phục nền lát gạch ban đầu | **PASS** | Để lộ nền gạch gốc `sidewalkPaverTexture` chạy liền mạch, đồng nhất màu sắc, không có khoảng trống, không z-fighting. |
| **TASK C** | Xóa tòa nhà màu trắng đơn giản | **PASS** | Gỡ bỏ model `BlendBuilding.glb` (`city-3`, khối hộp trắng thô), giữ nguyên các tòa nhà gạch 3D chi tiết (`building03_joined`, `Building01_joined`). |
| **TASK D** | Xóa tường bao thành phố ngoại vi | **PASS** | Gỡ bỏ 5 khối mesh tường balustrade (`#475569`) chạy dọc rìa ngoài đường. Quảng trường thông thoáng, mở rộng tầm nhìn toàn cảnh. |
| **TASK E** | Sửa ghế công viên dính/xuyên bồn cây | **PASS** | Điều chỉnh `benchOffsetZ` từ $\pm 0.62\text{m}$ lên $\pm 1.35\text{m}$ tại 4 đảo bồn cây `CENTRAL_PLANTER_ISLANDS`. Ghế tách rời hoàn toàn với khoảng cách an toàn $0.17\text{m}$, không che lối đi. |
| **TASK F** | Chỉnh đường giao thông liền mạch | **PASS** | Tách rời gờ bó vỉa hè khỏi lòng đường để không còn tình trạng gờ đá cắt ngang giao lộ; các đoạn đường nối khớp hoàn toàn không bị đứt đoạn hay hở mép. |
| **TASK G** | Xóa vách ngăn & mở rộng mặt đường | **PASS** | Mở rộng đường vành đai ra phía ngoài từ $3.2\text{m}-3.4\text{m}$ lên $4.8\text{m}-5.4\text{m}$, vỉa hè và lối đi bộ tiếp giáp liên tục, kết cấu 6 gian hàng nguyên vẹn 100%. |

---

## 2. BẢNG SO SÁNH CHỈ SỐ WEBGL TRƯỚC VÀ SAU (PERFORMANCE COMPARISON)

Toàn bộ dữ liệu được đo kiểm thực tế trên cùng môi trường Chrome Headless 1440x900 tại cổng `http://localhost:5180`:

| Chỉ số | Baseline Trước Sửa (Explore) | Thực tế Sau Sửa (Explore) | Baseline Trước Sửa (Overview) | Thực tế Sau Sửa (Overview) | Thay đổi & Đánh giá |
|---|---:|---:|---:|---:|:---:|
| **Draw Calls** | 460 | **434** | 849 | **828** | **Giảm 21–26 calls** (tối ưu hóa vượt trội) |
| **Triangles** | 2,983,005 | **2,825,465** | 3,014,819 | **2,857,289** | **Giảm 157,530 đa giác** (loại bỏ mesh thừa) |
| **Textures** | 136 | **134** | 154 | **152** | Giảm tải bộ nhớ VRAM |
| **Geometries** | 413 | **408** | 503 | **503** | Bộ nhớ đệm sạch |
| **WebGL Errors** | 0 | **0** | 0 | **0** | Hoàn toàn ổn định, không lỗi |
| **Console Errors** | 0 | **0** | 0 | **0** | Sạch tuyệt đối |
| **Automated Tests** | 31/31 Pass | **31/31 Pass** | 31/31 Pass | **31/31 Pass** | 100% logic di chuyển & API nguyên vẹn |

---

## 3. DANH SÁCH OBJECT ĐÃ XỬ LÝ & CHI TIẾT KỸ THUẬT

### A. Danh sách Object đã xóa
1. **Mảng nền bê tông thừa (`plaza-ground-slab`):**
   - Loại bỏ khỏi `FE/src/scene/Environment.tsx` tại component `<ExteriorAssets id="plaza-ground-slab" />` cùng mảng vị trí `groundSlabPlacements`.
2. **Tòa nhà trắng đơn giản (`city-3`):**
   - Loại bỏ khỏi `cityPlacements` trong `Environment.tsx`. Model `BlendBuilding.glb` không còn được render.
3. **Tường bao thành phố (`Perimeter Balustrades`):**
   - Xóa bỏ 5 khối mesh tường balustrade bao quanh rìa ngoài tại các cạnh Bắc, Tây, Đông và 2 đoạn Nam dọc `WORLD_BOUNDS`.
4. **Gờ bó vỉa hè chắn ngang giao lộ:**
   - Xóa bỏ cấu trúc curb ăn theo từng đoạn đường cũ (trước đây gắn cố định vào `ASPHALT_ROAD_SEGMENTS` khiến gờ đá cắt thẳng qua mặt đường ngã tư).

### B. Danh sách Object đã điều chỉnh vị trí & hình học
1. **Ghế công viên tại 4 đảo hoa trung tâm (`CENTRAL_PLANTER_ISLANDS`):**
   - Cặp đảo phía Bắc ($z = -5$): Tăng `benchOffsetZ` từ `0.62` lên `1.35` (tọa độ Z thực tế chuyển từ $-4.38\text{m}$ thành $-3.65\text{m}$).
   - Cặp đảo phía Nam ($z = 5$): Tăng `benchOffsetZ` từ `-0.62` lên `-1.35` (tọa độ Z thực tế chuyển từ $4.38\text{m}$ thành $3.65\text{m}$).
   - Ghế giữ nguyên số lượng (4 ghế tại đảo hoa, 4 ghế quanh đài phun nước, 8 ghế tại khu nghỉ ngơi), kiểu dáng PBR nan gỗ ấm tự nhiên, tách biệt $0.17\text{m}$ ngoài mép bồn cây.
2. **Hệ thống mặt đường nhựa (`ASPHALT_ROAD_SEGMENTS`):**
   - Mở rộng đường vành đai ngoài từ $3.2\text{m}-3.4\text{m}$ lên $4.8\text{m}$, vươn rộng ra ngoài đến biên $x = \pm 22.8\text{m}$ và $z = \pm 22.8\text{m}$.
   - Ghép nối phẳng hoàn chỉnh các ngã tư T-junction tại lối vào trục Tây, trục Đông và cổng chính phía Nam, triệt tiêu hoàn toàn z-fighting và khe hở hình học.
3. **Gờ đá vỉa hè (`SIDEWALK_CURBS`):**
   - Tái cấu trúc thành 18 đoạn gờ đá độc lập bao bọc chính xác mép vỉa hè đi bộ, để hở hoàn toàn 100% các lối giao lộ xe chạy.

### C. File code đã chỉnh sửa
- duy nhất: [FE/src/scene/Environment.tsx](file:///E:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx) (Tầng render ngoại cảnh 3D).

---

## 4. BẰNG CHỨNG HÌNH ẢNH TRƯỚC VÀ SAU (BEFORE / AFTER EVIDENCE)

Tất cả ảnh chụp được thực hiện ở các góc camera đồng nhất:

| Góc nhìn & Hạng mục | Ảnh Hiện trạng Trước sửa (Baseline) | Ảnh Thực tế Sau sửa (Redesign) |
|---|:---:|:---:|
| **Toàn cảnh quảng trường (Overview)** | [01_baseline_overview.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/01_baseline_overview.png) | [01_overview_full_plaza.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/01_overview_full_plaza.png) |
| **Vùng nền bên trái (Task A & B - Zone 1)** | [02_baseline_left_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/02_baseline_left_ground_patch.png) | [02_left_ground_patch_cleared.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/02_left_ground_patch_cleared.png) |
| **Vùng nền bên phải (Task A & B - Zone 2)** | [03_baseline_right_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/03_baseline_right_ground_patch.png) | [03_right_ground_patch_cleared.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/03_right_ground_patch_cleared.png) |
| **Vùng nền phía dưới phải (Task A & B - Zone 3)** | [04_baseline_bottom_right_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/04_baseline_bottom_right_ground_patch.png) | [04_bottom_right_ground_patch_cleared.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/04_bottom_right_ground_patch_cleared.png) |
| **Khu vực tòa nhà trắng đã xóa (Task C)** | [05_baseline_white_buildings.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/05_baseline_white_buildings.png) | [05_white_buildings_removed.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/05_white_buildings_removed.png) |
| **Khu vực tường bao đã gỡ (Task D)** | [06_baseline_boundary_walls.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/06_baseline_boundary_walls.png) | [06_boundary_walls_removed.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/06_boundary_walls_removed.png) |
| **Ghế công viên & bồn cây tách biệt (Task E)** | [07_baseline_bench_planter_overlap.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/07_baseline_bench_planter_overlap.png) | [07_bench_and_planter_separated.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/07_bench_and_planter_separated.png) |
| **Giao lộ nối đường liền mạch (Task F)** | [08_baseline_road_network.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/08_baseline_road_network.png) | [08_road_intersections_continuous.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/08_road_intersections_continuous.png) |
| **Mặt đường mở rộng thông thoáng (Task G)** | [08_baseline_road_network.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/08_baseline_road_network.png) | [09_road_widened_open.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/09_road_widened_open.png) |
| **Explore Mode kiểm tra di chuyển** | [01_baseline_overview.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/01_baseline_overview.png) | [10_explore_mode_movement.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-redesign/10_explore_mode_movement.png) |

---

## 5. KIỂM ĐỊNH AN TOÀN CHỨC NĂNG & NAVIGATION
- **Giới hạn di chuyển:** Vẫn được bảo đảm an toàn thông qua biến toán học `WORLD_BOUNDS` trong `FE/src/types/expo.ts`. Nhân vật không thể bước hụt hay rơi khỏi scene.
- **Click-to-Move:** Đã kiểm thử tự động với click raycast mặt sàn; thuật toán tìm đường A* (`findPathAStar`) hoạt động bình thường, nhân vật di chuyển mượt mà tới điểm chỉ định.
- **Gian hàng & Sản phẩm:** 6 gian hàng và 36 product slot ID, modal chi tiết sản phẩm, raycast hover/click được bảo lưu toàn vẹn 100%.
- **Cam kết nguyên tắc:** Không commit, không push, không thay đổi file GLB gốc trên ổ đĩa.
