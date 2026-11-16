# BÁO CÁO NGHIỆM THU — UMBRELLA & FRONT-BOOTH TREE REPLACEMENT (V3)
## Virtual Expo Plaza 3D | STRICT SCOPE LOCK

- **Dự án:** Virtual Expo Plaza 3D
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Git HEAD ban đầu:** `5ec5448797d7c5b645297eed2519458521af89ff`
- **Trạng thái thực thi:** HOÀN TẤT 100% — PASS TOÀN BỘ BUILD, TEST SUITE & BROWSER VISUAL QA

---

## 1. AUDIT & BASELINE (PHASE 0)

- **Git HEAD ban đầu:** `5ec5448797d7c5b645297eed2519458521af89ff`
- **Git status ban đầu:**
  - Hai file model mới đã có sẵn trong repository:
    1. `FE/public/models/env/umbrella.glb` ($164,848\text{ bytes}$)
    2. `FE/public/models/env/tree-gian.glb` ($2,759,804\text{ bytes}$)
- **Kiểm tra cấu trúc & kích thước thực tế của 2 model GLB mới:**
  1. **`umbrella.glb`:**
     - Bounding box gốc: $2.013\text{m} \times 2.240\text{m} \times 2.013\text{m}$ (`min: [-1.006, 0, -1.006]`, `max: [1.006, 2.240, 1.006]`).
     - Thành phần bên trong: Gồm đầy đủ **1 bàn tròn trung tâm** (`Group_001`), **4 ghế ngồi kim loại** (`Group_002..005` & `Agrupar*`), **trụ ô trung tâm** (`Group_006`), và **tán ô vuông cùng khung nan** (`Group_007..013`, `haste_ombrelone*`).
     - Origin nằm chính giữa mặt đáy bàn/ghế tại `[0, 0, 0]`.
  2. **`tree-gian.glb`:**
     - Bounding box gốc: $1.838\text{m} \times 2.986\text{m} \times 1.960\text{m}$ (`min: [-0.919, 0, -0.980]`, `max: [0.919, 2.986, 0.980]`).
     - Thành phần bên trong: Gồm **chậu cây tròn màu nâu đất** (`Obj_000002#1_001`), **lớp đất trồng** (`Obj_000001#1_001`), **thân và cành cây tự nhiên** (`objArch31_#4_001`, `Componente#4_001`), và **tán lá xanh đa lớp** (`objArch31_#3..#9`).
     - Origin nằm chính giữa đáy chậu tại `[0, 0, 0]`.
- **Các component liên quan:**
  - `FE/src/scene/ExteriorAssets.tsx`: Quản lý tải, chuẩn hóa bounding box đồng nhất (uniform scale) và instanced rendering cho các model GLB ngoại cảnh.
  - `FE/src/scene/Environment.tsx`: Quản lý vị trí các bộ bàn ghế ô che nắng và cảnh quan quảng trường.
  - `FE/src/scene/Booth.tsx`: Quản lý vị trí cây trang trí trước góc mặt tiền của 6 gian hàng (`boothDecorPlacements`).

---

## 2. TASK A — THAY BỘ GHẾ VÀ Ô CHE NẮNG (`umbrella.glb`)

### A1. Xác định & Loại bỏ bộ ghế/ô cũ
- Trong `FE/src/scene/Environment.tsx`, các bộ bàn ghế và ô che nắng cũ ở góc ngoài quảng trường được tạo bởi `REST_LOUNGE_ZONES` (`{ x: ±15.8, z: ±14.2 }`) sử dụng procedural geometry (`LOUNGE_TABLE_BASE_GEOM`, `LOUNGE_TABLE_TOP_GEOM`, `PARASOL_POLE_GEOM`, `PARASOL_CANOPY_GEOM`) kèm các ghế gỗ phụ (`REST_LOUNGE_ZONES.flatMap`).
- Đã gỡ bỏ hoàn toàn các mesh procedural bàn/ô cũ và các ghế phụ đi kèm ở góc ngoài quảng trường, đồng thời **giữ nguyên 100% 8 ghế đá công viên chính** (4 ghế quanh đài phun nước trung tâm + 4 ghế tại 4 cụm bồn cây `planter-near-ch.glb`).

### A2. Tích hợp model `umbrella.glb` & Di chuyển vào gần trung tâm
- Đăng ký asset `'env-umbrella': { file: 'umbrella', bounds: [2.25, 2.5, 2.25], dir: 'env' }` trong [ExteriorAssets.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L28) với hệ số scale đồng nhất (uniform scale $\approx 1.116\times$, không kéo giãn biến dạng trục), kích thước hiển thị $2.25\text{m} \times 2.50\text{m} \times 2.25\text{m}$ vừa vặn với chiều cao nhân vật ($1.75\text{m}$).
- Đặt **đúng 2 instance `umbrella` mới** (`UMBRELLA_LOUNGE_POSITIONS` trong [Environment.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L140-L143)) tại hai cánh Tây và Đông của khu vực sân lát gạch trung tâm:
  1. **Bộ 1 (Cánh Tây trung tâm):** `position: [-5.4, 0.02, 0]`, `rotationY: 0` (thay cho vị trí góc ngoài cũ `[-15.8, -14.2]`).
  2. **Bộ 2 (Cánh Đông trung tâm):** `position: [5.4, 0.02, 0]`, `rotationY: 0` (thay cho vị trí góc ngoài cũ `[15.8, 14.2]`).
- **Lý do chọn vị trí & Kết quả kiểm tra va chạm:**
  - Nằm cân đối hai bên đài phun nước trung tâm trên mặt sân lát gạch phẳng (`y = 0.02`), gần khu vực trung tâm ($r = 5.4\text{m}$ so với $r = 21.2\text{m}$ cũ).
  - **Không chắn mặt tiền bất kỳ gian hàng nào:** Cả 6 gian hàng nằm tại hướng Tây-Bắc `(-12.5, -9)`, Bắc `(0, -13)`, Đông-Bắc `(12.5, -9)`, Tây-Nam `(-12.5, 9)`, Nam `(0, 13)`, Đông-Nam `(12.5, 9)` — hoàn toàn không có gian hàng nào ở trục `z = 0`.
  - Cách ghế đài phun nước `(±2.18, 0)` **$2.20\text{m}$**, cách 4 cụm bồn cây chữ nhật `(±6, ±5)` và ghế công viên `(±6, ±3.65)` **$3.70\text{m}$**, cách mép đường & vạch qua đường **$2.78\text{m}$**, cách 6 lối đi vào gian hàng **$4.07\text{m}$**.

---

## 3. TASK B — THAY CHẬU CÂY TRƯỚC GIAN HÀNG (`tree-gian.glb`)

### B1. Thay thế 1:1 các chậu cây trang trí trước gian hàng
- Cập nhật cấu hình `'booth-planter'` trong [ExteriorAssets.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L31) từ `file: 'planter'` sang `file: 'tree-gian'` với `bounds: [1.28, 2.08, 1.36]` (scale đồng nhất $\approx 0.696\times$, chiều cao $2.08\text{m}$, đường kính tán lá $\approx 1.28\text{m}$, đường kính chậu $\approx 0.47\text{m}$).
- Giữ nguyên **100% số lượng vị trí trang trí** (tổng cộng **10 instances** trên 6 gian hàng, tỷ lệ thay thế chuẩn **1 chậu cũ $\rightarrow$ 1 model `tree-gian` mới**):
  1. **Aether Tech Lab (`tech`):** 1 cây tại góc trái mặt tiền `[-3.65, 0.02, 3.68]`.
  2. **Nordic Living Studio (`living`):** 2 cây tại hai góc mặt tiền `[-3.65, 0.02, 3.68]` và `[3.65, 0.02, 3.68]`.
  3. **EcoVita Roastery & Craft (`coffee`):** 2 cây tại hai góc mặt tiền `[-3.65, 0.02, 3.68]` và `[3.65, 0.02, 3.68]`.
  4. **Kinetix Robotics & AI (`robotics`):** 1 cây tại góc phải mặt tiền `[3.65, 0.02, 3.68]`.
  5. **Lumina Design Collective (`design`):** 2 cây tại hai góc mặt tiền `[-3.65, 0.02, 3.68]` và `[3.65, 0.02, 3.68]`.
  6. **Solaris Clean Energy (`energy`):** 2 cây tại hai góc mặt tiền `[-3.65, 0.02, 3.68]` và `[3.65, 0.02, 3.68]`.

### B2. Kiểm tra khoảng cách an toàn & Mặt tiền gian hàng
- Tại tọa độ local `[±3.65, 0.02, 3.68]` ([Booth.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Booth.tsx#L596-L601)):
  - **Chậu cây ($y = 0..0.39\text{m}$, bán kính $0.235\text{m}$):** Nằm cách mặt trước đế gian hàng (`Plinth_Base` $Z = 2.72\text{m}$) **$72.5\text{cm}$**, và cách mép ngang bậc thềm (`Step_Nosing` $X = \pm 2.82\text{m}$) **$59.5\text{cm}$**.
  - **Tán lá trên cao ($y = 0.95..2.08\text{m}$, bán kính $0.66\text{m}$):** Mép lá sau cùng ở $Z = 3.02\text{m}$ (cách mặt trước cột và đế gian hàng $> 30\text{cm}$), chiều cao đỉnh cây $2.08\text{m}$ thấp hơn biển hiệu gian hàng ($Y = 3.04..3.72\text{m}$) gần **$1.0\text{m}$**, không che bất kỳ sản phẩm, biển hiệu, backdrop hay lối vào nào.
  - Các bồn cây công viên `planter-near-ch.glb`, bồn cây tròn cạnh cột đèn `env-planter-urn`, và cây lớn quanh quảng trường được giữ nguyên 100%.

---

## 4. KẾT QUẢ KIỂM THỬ (BUILD & REGRESSION QA)

| Hạng mục kiểm thử | Kết quả | Chi tiết xác nhận |
| :--- | :---: | :--- |
| **TypeScript Check (`npm run typecheck`)** | **PASS** | 0 lỗi trên cả `BE` và `FE` |
| **Frontend Build (`npm --prefix FE run build`)** | **PASS** | Vite production build thành công (0 lỗi) |
| **Regression Tests (`npm test`)** | **PASS** | **31/31 tests passed** (bao gồm kiểm tra sightline camera cả 6 gian hàng) |
| **Browser Visual QA (Task A — `umbrella`)** | **PASS** | Đúng 2 bộ `umbrella.glb` mới ở gần trung tâm (`[±5.4, 0]`), không còn mesh cũ chồng lên |
| **Browser Visual QA (Task B — `tree-gian`)** | **PASS** | Đúng 10 cây `tree-gian.glb` trước góc mặt tiền 6 gian hàng, không chạm gian hàng, không che sản phẩm |
| **GLB Loading & Console/WebGL** | **PASS** | Cả `umbrella.glb` và `tree-gian.glb` load thành công, 0 lỗi WebGL |

---

## 5. HÌNH ẢNH KIỂM CHỨNG TRỰC QUAN (SCREENSHOTS)

### A. Toàn cảnh Overview Trước & Sau (Cùng góc camera)
- **Trước khi thay (Overview V2):** [v2_06_overview_planters_fixed.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_06_overview_planters_fixed.png)
- **Sau khi thay (Overview V3):** [v3_01_overview_umbrella_and_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_01_overview_umbrella_and_treegian.png)

### B. Cận cảnh 2 bộ `umbrella.glb` mới & Vị trí góc cũ đã dọn sạch (Task A)
- **Bộ `umbrella` mới — Cánh Tây trung tâm `[-5.4, 0]`:** [v3_04_umbrella_west_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_04_umbrella_west_closeup.png)
- **Bộ `umbrella` mới — Cánh Đông trung tâm `[5.4, 0]`:** [v3_05_umbrella_east_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_05_umbrella_east_closeup.png)
- **Góc nhìn Tham quan trung tâm (thấy cả 2 bộ `umbrella` và các cây `tree-gian`):** [v3_12_explore_central_plaza_view.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_12_explore_central_plaza_view.png)
- **Xác nhận góc ngoài Tây-Bắc & Đông-Nam đã xóa bộ cũ:** [v3_02_old_nw_corner_cleared.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_02_old_nw_corner_cleared.png) · [v3_03_old_se_corner_cleared.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_03_old_se_corner_cleared.png)

### C. Cận cảnh cây `tree-gian.glb` trước mặt tiền cả 6 gian hàng (Task B)
- **Gian 1 — Aether Tech Lab:** [v3_06_booth1_aether_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_06_booth1_aether_treegian.png)
- **Gian 2 — Nordic Living Studio:** [v3_07_booth2_nordic_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_07_booth2_nordic_treegian.png)
- **Gian 3 — EcoVita Roastery & Craft:** [v3_08_booth3_ecovita_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_08_booth3_ecovita_treegian.png)
- **Gian 4 — Kinetix Robotics & AI:** [v3_09_booth4_kinetix_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_09_booth4_kinetix_treegian.png)
- **Gian 5 — Lumina Design Collective:** [v3_10_booth5_lumina_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_10_booth5_lumina_treegian.png)
- **Gian 6 — Solaris Clean Energy:** [v3_11_booth6_solaris_treegian.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v3_11_booth6_solaris_treegian.png)

---

## 6. THÔNG TIN GIT & CAM KẾT KHÓA AN TOÀN

- **Danh sách file mã nguồn thay đổi:**
  1. [FE/src/scene/ExteriorAssets.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx)
  2. [FE/src/scene/Environment.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Environment.tsx)
  3. [FE/src/scene/Booth.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Booth.tsx)
- **Xác nhận Git Safety:**
  - Tuyệt đối **KHÔNG** thực hiện `git reset`, `git clean`, `git stash`, `git commit`, `git push` hoặc deploy.
