# BÁO CÁO BASELINE: NGOẠI CẢNH 3D, QUẢNG TRƯỜNG & HỆ THỐNG ĐƯỜNG
**Project:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Date:** 2026-11-14  
**Commit:** `e460f73`  
**Phase:** Phase 0 — Audit & Baseline

---

## 1. HIỆN TRẠNG & ĐỐI CHIẾU 7 HẠNG MỤC CẦN SỬA

| Hạng mục | Vấn đề phát hiện | Object / Component liên quan |
|---|---|---|
| **TASK A & B** | 3 vùng mảng nền đất/bê tông chữ nhật xám trắng dưới cây và ghế tại 4 góc quảng trường (`REST_LOUNGE_ZONES`). | `FE/src/scene/Environment.tsx`: `<ExteriorAssets id="plaza-ground-slab" placements={groundSlabPlacements} />` (sử dụng `roof_opt.glb` kích thước 8.19m x 7.13m). Dưới các mảng này là nền gạch `sidewalkPaverTexture` gốc của quảng trường. |
| **TASK C** | Tòa nhà màu trắng dạng khối hộp đơn giản ở ngoại vi. | `FE/src/scene/Environment.tsx` & `ExteriorAssets.tsx`: `city-3` trỏ tới model `BlendBuilding.glb` (khối hộp màu trắng phẳng thô sơ, vật liệu Base Color 1.0, không có chi tiết kiến trúc). Cần loại bỏ và chỉ giữ các tòa nhà gạch 3D chi tiết (`building03_joined`, `Building01_joined`). |
| **TASK D** | Tường bao chạy dọc rìa ngoài đường khiến quảng trường bị đóng kín. | `FE/src/scene/Environment.tsx`: 5 khối mesh `Perimeter Balustrades` màu xám `#475569` nằm tại `WORLD_BOUNDS` rìa ngoài (Bắc, Tây, Đông, Nam). Navigation dùng thuật toán biên toán học `WORLD_BOUNDS`, không phụ thuộc vào mesh hiển thị này. |
| **TASK E** | Ghế công viên dính/xuyên vào bồn cây. | `CENTRAL_PLANTER_ISLANDS` tại `(±6, ±5)`: bồn cây có kích thước $1.48\text{m} \times 1.48\text{m}$ (bán kính $0.74\text{m}$), nhưng ghế `benchOffsetZ` chỉ là $\pm 0.62\text{m}$ trong khi nửa chiều sâu ghế là $0.44\text{m}$. Ghế bị xuyên vào bồn cây $> 0.56\text{m}$. Cần tăng $|benchOffsetZ| \ge 1.25\text{m}$ để tách hoàn toàn. |
| **TASK F & G** | Đường giao thông bị đứt đoạn, vách ngăn bó vỉa hè cắt ngang giao lộ, đường vành đai hẹp. | `ASPHALT_ROAD_SEGMENTS` hiện có chiều rộng vành đai chỉ $3.2\text{m} - 3.4\text{m}$, gờ bó vỉa hè (`boxGeometry [0.28, 0.056, road.length]`) chạy suốt chiều dài cắt ngang mặt đường giao lộ. Cần loại bỏ gờ chắn ngang ngã tư, nối liền mạch 4 góc giao lộ và mở rộng mặt đường vành đai ra phía ngoài ($4.8\text{m} - 5.2\text{m}$) giữ nguyên vỉa hè đi bộ. |

---

## 2. CHỈ SỐ WEBGL BASELINE (TRƯỚC KHI SỬA)

Được đo đạc thực tế từ trình duyệt Chrome Headless 1440x900 tại cổng `http://localhost:5180`:

| Chỉ số | Chế độ Explore (Tham quan) | Chế độ Overview (Toàn cảnh) |
|---|---:|---:|
| **FPS** | 27.87 | 22.83 |
| **Draw Calls** | 460 | 849 |
| **Triangles** | 2,983,005 | 3,014,819 |
| **Textures** | 136 | 154 |
| **Geometries** | 413 | 503 |
| **WebGL Errors** | 0 | 0 |
| **Console Errors** | 0 | 0 |

---

## 3. DANH SÁCH ẢNH CHỤP BASELINE
- [01_baseline_overview.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/01_baseline_overview.png)
- [02_baseline_left_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/02_baseline_left_ground_patch.png)
- [03_baseline_right_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/03_baseline_right_ground_patch.png)
- [04_baseline_bottom_right_ground_patch.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/04_baseline_bottom_right_ground_patch.png)
- [05_baseline_white_buildings.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/05_baseline_white_buildings.png)
- [06_baseline_boundary_walls.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/06_baseline_boundary_walls.png)
- [07_baseline_bench_planter_overlap.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/07_baseline_bench_planter_overlap.png)
- [08_baseline_road_network.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/layout-baseline/08_baseline_road_network.png)
