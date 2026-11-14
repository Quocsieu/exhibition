# VIRTUAL EXPO 3D — BÁO CÁO ĐƯỜNG CƠ SỞ HIỆU NĂNG 3D (PHASE 0)
## 3D PERFORMANCE BASELINE AUDIT
**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS/exhibition`  
**Kỹ sư thực hiện:** Senior Three.js Performance Engineer & QA Auditor  
**Thời gian đo:** 14/11/2026 (Đo thực tế trên môi trường hiện tại, KHÔNG dùng số liệu giả định)  
**Thiết bị kiểm thử:** Chrome Headless 1440x900, ACESFilmicToneMapping, dpr=[1, 1.5], WebGL 2.0  

---

## 1. PHƯƠNG PHÁP ĐO ĐẠC & ĐIỀU KIỆN TIÊU CHUẨN

* **Công cụ đo:** Script Playwright chuyên dụng `qa-reports/measure_performance_baseline.cjs`.
* **Quy trình:**
  1. Khởi động Chrome viewport cố định $1440 \times 900$.
  2. Nạp trang `http://127.0.0.1:5180`.
  3. Chờ warm-up và streaming tài nguyên trong 12 giây cho đến khi toàn bộ scene ổn định.
  4. Lấy mẫu thống kê đa khung hình (120 frames liên tiếp qua `requestAnimationFrame`).
  5. Loại bỏ 2 frame đầu để tránh spike, tính toán:
     * **FPS Trung bình (Avg FPS)**: $1000 / \text{Avg Frame Time (ms)}$.
     * **1% Low FPS**: Tốc độ khung hình ở 1% các frame chậm nhất.
     * **5% Low FPS**: Tốc độ khung hình ở 5% các frame chậm nhất.
     * **Frame Time (ms)**.
     * **Draw Calls, Triangles, Textures, Geometries** trực tiếp từ `gl.info`.
     * **Lỗi WebGL** qua `gl.getContext().getError()`.
  6. Đo 2 lượt độc lập (Run 1 và Run 2) cho mỗi góc nhìn: **Explore View** (Góc nhìn thứ ba) và **Overview View** (Góc nhìn toàn cảnh).

---

## 2. KẾT QUẢ ĐO ĐẠC ĐƯỜNG CƠ SỞ THỰC TẾ (BASELINE RESULTS)

| Chỉ số Đo Đạc | Explore Mode (Run 1) | Explore Mode (Run 2) | Explore Trung bình | Overview Mode (Run 1) | Overview Mode (Run 2) | Overview Trung bình | Mục Tiêu Tối Ưu |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tốc độ khung hình (FPS)** | **28.17 FPS** | **28.57 FPS** | **28.37 FPS** | **16.57 FPS** | **16.45 FPS** | **16.51 FPS** | **Explore: 50–60 FPS**<br>**Overview: 45–55+ FPS** |
| **1% Low FPS** | 13.79 FPS | 18.80 FPS | **16.30 FPS** | 9.17 FPS | 10.42 FPS | **9.80 FPS** | $\ge 30.0$ FPS |
| **5% Low FPS** | 16.21 FPS | 19.60 FPS | **17.91 FPS** | 10.39 FPS | 10.79 FPS | **10.59 FPS** | $\ge 35.0$ FPS |
| **Frame Time trung bình** | 35.49 ms | 35.00 ms | **35.25 ms** | 60.34 ms | 60.79 ms | **60.57 ms** | $< 20.0$ ms |
| **Draw Calls** | 1,325 | 1,325 | **1,325 calls** | 1,961 | 1,961 | **1,961 calls** | **Explore: $< 600$ calls**<br>**Overview: $< 800$ calls** |
| **Số Triangles** | 2,049,073 | 2,049,073 | **2.05M tris** | 3,964,099 | 3,964,099 | **3.96M tris** | $< 2.0M$ tris |
| **Textures trong VRAM** | 148 | 148 | **148** | 164 | 164 | **164** | Giảm thiểu bộ nhớ |
| **Geometries trong VRAM** | 1,408 | 1,408 | **1,408** | 1,505 | 1,505 | **1,505** | Giảm 50%+ |
| **Lỗi WebGL** | 0 | 0 | **0 (PASS)** | 0 | 0 | **0 (PASS)** | 0 |
| **Thời gian nạp Asset** | 12.46s | - | **12.46s** | - | - | **Ổn định** | $\le 10s$ |

---

## 3. PHÂN TÍCH SCENE GRAPH & NGUYÊN NHÂN NGHẼN CỔ CHAI THỰC TẾ

Qua công cụ bóc tách Scene Graph tự động, danh sách các nhóm đối tượng chiếm tải lớn nhất trong scene:

| Nhóm Tài Nguyên | Mesh Thường | InstancedMesh | Tổng Nodes | Số Triangles | Cast Shadow | Receive Shadow | Đánh Giá Tác Động |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `exterior-glb:city-2` (`Building01_opt`) | 0 | **800** | 2,171 | 724,770 | 0 | **800** | **NGUY HIỂM CỰC CAO:** 1 file GLB bị chia thành 200 meshes con $\times$ 4 vị trí = 800 draw calls (chiếm 41% tổng draw call của scene!). |
| `exterior-glb:city-1` & `city-4` (`building03_opt`) | 0 | **48** | 182 | 97,212 | 0 | **48** | **TRUNG BÌNH:** Bị phân mảnh thành nhiều submesh. |
| `exterior-glb:env-tree-*` (3 loại cây thông/tùng) | 0 | **162** (54 $\times$ 3) | 324 | 377,670 | **162** | **162** | **RẤT CAO:** Mỗi cây fir có 54 mesh rời, tạo 162 draw call chính + 162 shadow draw calls. |
| `exterior-glb:jacaranda-tree` | 0 | 3 | 30 | **830,520** | 3 | 3 | **CAO VỀ POLYGON:** 10 cây chiếm hơn 830,000 triangles và gây overdraw lá cây nặng nề. |
| `exterior-glb:env-park-bench` | 0 | **16** | 256 | 342,336 | 16 | 16 | **TRUNG BÌNH:** 1 chiếc ghế chia làm 16 mesh con. |
| `exterior-glb:flowers` | 0 | **36** | 576 | 196,928 | 0 | 36 | **TRUNG BÌNH:** Bụi hoa có 36 submesh. |
| `exterior-glb:booth-planter` | 0 | **18** | 30 | 37,680 | 18 | 18 | **TRUNG BÌNH:** Khởi tạo lặp lại trong từng Booth component. |
| `other` (Khung booth, quầy kệ, bệ đỡ, đường) | **705** | 10 | 771 | 29,339 | 118 | 215 | **RẤT CAO VỀ DRAW CALL:** 541 BoxGeometries độc lập chưa được gộp. |
| **Vòng lặp `ExteriorAssets.tsx`** | - | - | - | - | - | - | **CPU OVERHEAD NẶNG:** Chạy `needsUpdate = true` và tính toán lại `computeBoundingSphere()` trên CPU mỗi frame khi camera di chuyển. |

---

## 4. KẾT LUẬN VỀ BOTTLENECK THỰC TẾ

1. **Draw Call Bottleneck (Nghẽn CPU / Driver overhead):**
   * Overview Mode có tới **1,961 draw calls**. Trong đó riêng các model GLB ngoại cảnh bị phân mảnh chiếm hơn **1,080 calls** (`city-2` = 800, `trees` = 162, `city-1/4` = 48, `flowers` = 36, `bench` = 16, `planters` = 18).
2. **Shadow Pass Multiplier:**
   * Các đối tượng có `castShadow = true` (cây, ghế, bồn hoa, vật thể nhỏ) bị render lặp lại trong Shadow Pass của Directional Light, làm nhân đôi số draw call cho mỗi submesh.
3. **Vertex / Triangle Load:**
   * Cây `jacaranda-tree` (830k tris) và ghế `modular_street_seating` (342k tris) cùng `city-2` (725k tris) đẩy tổng số polygon lên gần **4 triệu triangles** ở Overview Mode.
4. **VRAM Buffer Re-upload trên CPU:**
   * Code custom culling trong `ExteriorAssets.tsx` liên tục đánh dấu `instanceMatrix.needsUpdate = true` gây nghẽn bus PCIe truyền dữ liệu từ RAM lên VRAM mỗi frame.

**Bản báo cáo này được lưu tại:** `qa-reports/3D_PERFORMANCE_BASELINE.md` và `qa-reports/perf-baseline/baseline_results.json`.
Sẵn sàng bước vào Phase 1 đến Phase 7 để xử lý triệt để các bottleneck đã có bằng chứng rõ ràng.
