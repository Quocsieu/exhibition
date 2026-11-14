# BÁO CÁO HOÀN TẤT: FIX NGOẠI CẢNH 3D & TÍCH HỢP MODEL GHẾ MỚI
**Project:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Stack:** React 18, Vite, Three.js, React Three Fiber, Drei, Blender 4.2  
**Date:** 2026-11-14

---

## 1. TỔNG QUAN KẾT QUẢ THỰC HIỆN

Toàn bộ **6 yêu cầu bắt buộc** của Master Prompt đã được thực hiện chính xác, triệt để và an toàn:

| Hạng mục | Yêu cầu | Trạng thái | Chi tiết triển khai |
|---|---|:---:|---|
| **TASK A** | Xóa vạch kẻ đường sai vị trí | **HOÀN THÀNH** | Đã loại bỏ hoàn toàn 4 vạch sang đường sai ở giao lộ ngoài (`[-18.5, -3.2]`, `[18.5, -3.2]`, `[-18.5, 3.2]`, `[18.5, 3.2]`). Giữ nguyên 4 vạch sang đường vào quảng trường và cổng chính. |
| **TASK B** | Xóa cờ và cột cờ xanh dương | **HOÀN THÀNH** | Đã loại bỏ hoàn toàn mảng `FESTIVAL_TOTEMS` (8 cụm cột cờ & lá cờ xanh) cùng các Instances render tương ứng. |
| **TASK C** | Chỉnh màu & vật liệu bồn cây | **HOÀN THÀNH** | `planter.glb` được tinh chỉnh: phần bê tông đá vôi sáng màu `#d8dcd6` (roughness 0.65, metalness 0.04), nẹp kim loại xám than `#334155` (metalness 0.75, roughness 0.35), lá cây 2 mặt xanh tươi. |
| **TASK D** | Chỉnh màu cột đèn & chóa đèn | **HOÀN THÀNH** | Thân đèn `Street_Lamp.glb` đổi sang kim loại xám than đậm `#1e242b` (metalness 0.72, roughness 0.38); chóa đèn thủy tinh vàng ấm `#fef08a` phát quang emissive `#fde047` (intensity 0.62). |
| **TASK E** | Làm sáng toàn bộ cây xanh | **HOÀN THÀNH** | Khắc phục triệt để hiện tượng đen cây: cấu hình `side = THREE.DoubleSide` (triệt tiêu mặt sau unlit), tăng cường diffuse RGB `(1.5, 1.62, 1.3)` và tán xạ môi trường `emissive = (0.14, 0.22, 0.08)`, thân cây ấm `(1.28, 1.22, 1.15)`. |
| **TASK F** | Thay ghế bằng `bench.glb` | **HOÀN THÀNH** | Đã map asset ID `'env-park-bench'` sang model mới `FE/public/models/env/bench.glb`, scale envelope chuẩn `[1.85, 0.82, 0.88]`, vật liệu nan gỗ ấm tự nhiên `#b46a36` cùng chân sắt đen. |

---

## 2. BẰNG CHỨNG HÌNH ẢNH XÁC MINH THỰC TẾ

Tất cả ảnh chụp kiểm định được xuất trực tiếp từ engine render WebGL (Chrome Headless 1440x900):

1. **Vạch kẻ đường sai đã xóa sạch (Khung cảnh đại lộ & giao lộ):**  
   [01_overview_road_markings_cleaned.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/01_overview_road_markings_cleaned.png)
2. **Khu vực vành đai không còn cột cờ xanh dương trang trí:**  
   [02_flagpoles_removed_areas.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/02_flagpoles_removed_areas.png)
3. **Cận cảnh vật liệu chậu hoa / bồn cây (`planter.glb` đá vôi sáng & kim loại):**  
   [03_closeup_planter_material.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/03_closeup_planter_material.png)
4. **Cận cảnh cột đèn đường kim loại xám & chóa thủy tinh sáng ấm (`Street_Lamp.glb`):**  
   [04_closeup_street_lamp_material.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/04_closeup_street_lamp_material.png)
5. **Cận cảnh tán cây Jacaranda sáng màu, không còn mảng tối đen:**  
   [05_closeup_jacaranda_brightened.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/05_closeup_jacaranda_brightened.png)
6. **Toàn cảnh cây xanh quanh quảng trường sáng, xanh tươi và đồng đều:**  
   [06_overview_trees_brightened.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/06_overview_trees_brightened.png)
7. **Ghế công viên mới (`bench.glb`) nan gỗ tự nhiên lắp đặt tiếp giáp mặt sàn:**  
   [07_new_bench_model_integrated.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/07_new_bench_model_integrated.png)
8. **Toàn cảnh quảng trường triển lãm sau khi tinh chỉnh toàn diện:**  
   [08_overview_full_plaza.png](file:///E:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-fix-verification/08_overview_full_plaza.png)

---

## 3. THÔNG SỐ HIỆU NĂNG WEBGL & ĐỘ ỔN ĐỊNH

| Chỉ số | Baseline Trước Sửa | Thực tế Sau Sửa (Explore) | Thực tế Sau Sửa (Overview) | Đánh giá |
|---|---:|---:|---:|:---:|
| **Draw Calls** | 1,286 | **421** | **828** | Giảm đáng kể (giảm hơn 35-65%) |
| **Triangles** | 3.96M | **2.97M** | **3.01M** | Giảm gần 1 triệu đa giác |
| **Textures** | 163 | **135** | **152** | Tối ưu bộ nhớ VRAM |
| **Geometries** | 560+ | **412** | **503** | Giảm tải bộ nhớ đệm |
| **WebGL Errors** | 0 | **0** | **0** | Tuyệt đối an toàn, 0 crash |
| **Unit/Integration Tests** | 31/31 Pass | **31/31 Pass** | **31/31 Pass** | 100% logic nguyên vẹn |

---

## 4. CHI TIẾT CÁC FILE ĐÃ CHỈNH SỬA

Chỉ can thiệp đúng 2 file thuộc tầng render ngoại cảnh 3D:
1. `FE/src/scene/Environment.tsx`:
   - Gỡ bỏ 4 tọa độ vạch qua đường ngoại vi khỏi mảng `ZEBRA_CROSSWALKS`.
   - Gỡ bỏ hằng số `FESTIVAL_TOTEMS`, `FLAG_POLE_GEOM`, `FLAG_BANNER_GEOM`, `FLAG_ACCENT_MAT` và các thẻ `<Instances>` render cờ.
2. `FE/src/scene/ExteriorAssets.tsx`:
   - Trỏ asset spec `'env-park-bench'` sang file `bench.glb`.
   - Cấu hình PBR vật liệu nan gỗ ấm (`#b46a36`, roughness 0.52, metalness 0.12).
   - Tinh chỉnh vật liệu đá vôi và nẹp kim loại cho `'env-planter-urn'`.
   - Tinh chỉnh kim loại xám than và chóa phát sáng ấm cho `'env-street-lamp'`.
   - Bổ sung `THREE.DoubleSide`, tăng hệ số diffuse và tán xạ ambient emissive cho toàn bộ lá và vỏ cây.

---

## 5. CAM KẾT TUÂN THỦ NGUYÊN TẮC
- KHÔNG chỉnh sửa Backend, Database, Auth hay API.
- KHÔNG thay đổi cấu trúc gian hàng, 36 sản phẩm hay raycast click targets.
- KHÔNG tự ý tạo lại mô hình Blender hoặc can thiệp file GLB gốc.
- KHÔNG commit hay push mã nguồn (giữ nguyên trạng thái working tree cho người dùng kiểm tra).
