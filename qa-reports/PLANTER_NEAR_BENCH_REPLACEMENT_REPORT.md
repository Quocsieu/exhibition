# BÁO CÁO NGHIỆM THU THAY THẾ PLANTER 3D GẦN GHẾ CÔNG VIÊN
## Virtual Expo Plaza 3D — Planter Near Bench Replacement

**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Ngày thực hiện:** 15/11/2026  
**Chế độ thực thi:** TARGETED CHANGE ONLY — STRICT SCOPE LOCK  
**Công nghệ:** React 18, TypeScript, React Three Fiber, Three.js 0.170, Blender 4.2 LTS, Playwright WebGL  
**Trạng thái kiểm thử:** 31/31 Vitest Passed · Vite Production Build Clean (0 errors) · WebGL Error 0  
**Quy tắc an toàn:** Không commit, không push, không deploy, khóa tuyệt đối 6 gian hàng V2 và hệ thống sản phẩm.

---

## I. TỔNG QUAN KẾT QUẢ THAY THẾ

Toàn bộ các bồn cây cũ nằm gần ghế công viên trong khuôn viên triển lãm đã được thay thế thành công bằng model mới `planter-near-ch.glb` theo đúng nguyên tắc bắt buộc: **1 bồn cây cũ = 2 bồn cây mới đặt sát cạnh nhau ($N \rightarrow 2N$)**.

| Chỉ số | Trước thay thế | Sau thay thế | Ghi chú |
|---|---|---|---|
| **Số lượng bồn cây gần ghế công viên** | **4 bồn cây cũ** (Hình học hộp xám `1.48 x 0.36 x 1.48m`) | **8 model mới** (`planter-near-ch.glb`) | Đúng tỷ lệ $N = 4 \rightarrow 2N = 8$. |
| **Bố cục từng cụm** | 1 bồn đơn lập phía sau ghế | **1 cặp 2 bồn mới ghép sát nhau** tạo thành cụm dài $2.4\text{m}$ | Đặt đối xứng quanh tâm bồn cũ, mép gỗ tiếp xúc liền mạch. |
| **Ghế công viên lân cận** | 4 ghế công viên tại 4 đảo trung tâm | **Giữ nguyên 100%** vị trí, rotation và kích thước | Khoảng cách an toàn giữa lưng ghế và bồn cây đạt $0.59\text{m}$. |
| **Các bồn cây khác ngoài phạm vi** | 6 chậu urn đá (`env-planter-urn`) & 12 bồn gian hàng (`booth-planter`) | **Giữ nguyên 100%**, không bị ảnh hưởng | Không đổi bất kỳ bồn cây nào ngoài phạm vi ghế công viên. |

---

## II. CHI TIẾT DANH SÁCH VỊ TRÍ & TỌA ĐỘ ĐÃ THAY

Có chính xác **4 vị trí bồn cây cũ gần ghế công viên** (thuộc 4 cụm đảo `CENTRAL_PLANTER_ISLANDS`), tương ứng sinh ra **8 instance model mới**:

| Cụm đảo | Tọa độ bồn cũ $[X, Y, Z]$ | Ghế công viên đi kèm $[X, Y, Z, R_y]$ | Tọa độ Bồn mới 1 (Trái) $[X, Y, Z, R_y]$ | Tọa độ Bồn mới 2 (Phải) $[X, Y, Z, R_y]$ |
|---|---|---|---|---|
| **Đảo 0 (Tây Bắc)** | `[-6.0, 0.0, -5.0]` | `[-6.0, 0.02, -3.65, 0]` (hướng Nam) | `[-6.6, 0.02, -5.0, 0]` | `[-5.4, 0.02, -5.0, 0]` |
| **Đảo 1 (Đông Bắc)** | `[+6.0, 0.0, -5.0]` | `[+6.0, 0.02, -3.65, 0]` (hướng Nam) | `[+5.4, 0.02, -5.0, 0]` | `[+6.6, 0.02, -5.0, 0]` |
| **Đảo 2 (Tây Nam)** | `[-6.0, 0.0, +5.0]` | `[-6.0, 0.02, +3.65, π]` (hướng Bắc) | `[-6.6, 0.02, +5.0, π]` | `[-5.4, 0.02, +5.0, π]` |
| **Đảo 3 (Đông Nam)** | `[+6.0, 0.0, +5.0]` | `[+6.0, 0.02, +3.65, π]` (hướng Bắc) | `[+5.4, 0.02, +5.0, π]` | `[+6.6, 0.02, +5.0, π]` |

---

## III. GIẢI PHÁP KỸ THUẬT & ARCHITECTURE

### 1. Phân tích Model `planter-near-ch.glb`
- **File:** `FE/public/models/env/planter-near-ch.glb` (Dung lượng ~713 KB).
- **Kích thước thực tế trong Three.js:**
  - Chiều dài trục X: $1.200\text{m}$ (từ $-0.60\text{m}$ đến $+0.60\text{m}$)
  - Chiều sâu trục Z: $0.631\text{m}$ (từ $-0.315\text{m}$ đến $+0.315\text{m}$)
  - Chiều cao trục Y: $0.831\text{m}$ (từ $0.0\text{m}$ đến $0.831\text{m}$)
  - Đáy bồn nằm chuẩn xác trên mặt đất ($Y = 0$).
- **Cấu trúc mesh:**
  - `Component#1_001` .. `004`: 4 cột chân gỗ.
  - `Component#2_001` .. `002`: Các thanh nan gỗ thành dài.
  - `Component#3_001` .. `002`: Các thanh nan gỗ thành ngắn.
  - `Mesh009`: Bề mặt đất trồng bên trong bồn.
  - `Group_002`: Thảm thực vật / cây bụi hoa dày dặn (14.938 đỉnh).

### 2. Tích hợp Asset Pipeline trong `ExteriorAssets.tsx`
Đã đăng ký spec chuẩn cho asset:
```ts
'env-planter-bench': { file: 'planter-near-ch', bounds: [1.2, 0.8314, 0.6312], dir: 'env' },
```
- **Không co giãn biến dạng:** Sử dụng bounds chuẩn xác của model ($1.20\text{m} \times 0.831\text{m} \times 0.631\text{m}$), tỷ lệ scale tự nhiên đạt đúng $1.0\times$.
- **Xử lý vật liệu PBR cao cấp:**
  Do file CAD gốc chưa bake màu diffuse map, hệ thống tự động gán vật liệu PBR chuyên biệt cho từng bộ phận mà không sửa file GLB gốc:
  - **Nan gỗ và chân bồn (`Component#*`):** Màu gỗ tếch/tuyết tùng ấm áp `#8c532b` (roughness: 0.58, metalness: 0.05), đồng điệu thẩm mỹ với ghế công viên `#b46a36`.
  - **Lớp đất trồng (`Mesh009*`):** Màu đất mùn hữu cơ tự nhiên `#271f18` (roughness: 0.95, metalness: 0.0).
  - **Tán lá & bụi hoa (`Group_002`):** Màu xanh thực vật công viên `#2d6a4f` (roughness: 0.68, emissive: `#050d05`, DoubleSide), đổ bóng 3D tự nhiên, loại bỏ hoàn toàn hiện tượng trắng phấn.

### 3. Ghép cặp & Căn chỉnh vị trí trong `Environment.tsx`
- Từng bồn cũ được thay thế bằng 2 instance mới lệch $\pm 0.60\text{m}$ theo trục X:
  $$\text{Instance}_1: [x - 0.60, 0.02, z], \quad \text{Instance}_2: [x + 0.60, 0.02, z]$$
- Hai bồn tiếp xúc khít tại $x = \text{island.x}$, tạo thành một bồn đôi có chiều dài tổng thể $2.40\text{m}$, ôm trọn chiều dài $1.85\text{m}$ của ghế công viên phía trước.
- Loại bỏ hoàn toàn hình học hộp xám cũ `PLANTER_BOX_GEOM` (`1.48 x 0.36 x 1.48m`) và lớp đất cũ `PLANTER_SOIL_GEOM`.
- Xóa các cụm hoa placeholder cũ (`FLOWER_CLUSTERS_PINK`, `FLOWER_CLUSTERS_GOLD`) để nhường chỗ hoàn toàn cho tán cây 3D của model mới.

---

## IV. BẰNG CHỨNG HÌNH ẢNH ĐỐI CHIẾU TRỰC QUAN (BEFORE & AFTER)

### 1. Đối chiếu trực tiếp Cụm Đảo 0 (Tây Bắc) cùng một góc máy camera

#### Trước khi thay thế (Bồn hộp xám cũ + hoa giả lập):
![Island 0 Trước khi thay thế](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/comparison_before_island0.png)
*(Bồn cây cũ là hình hộp bê tông xám thô sơ `1.48 x 1.48m` với vài điểm hoa chấm màu)*

#### Sau khi thay thế (Cặp 2 bồn `planter-near-ch.glb` bằng gỗ nan + cây bụi 3D):
![Island 0 Sau khi thay thế](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/comparison_after_island0.png)
*(Cặp 2 bồn mới ghép sát nhau thành cụm dài $2.4\text{m}$, nan gỗ tự nhiên đồng điệu với ghế công viên, cây bụi xanh tốt phủ đầy)*

---

### 2. Bộ ảnh chụp kiểm thử thực tế từ trình duyệt (Headless Chrome WebGL)

1. **Ảnh toàn cảnh quảng trường sau khi thay bồn cây (Overview Camera):**  
   [01_after_overview_planters_replaced.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/01_after_overview_planters_replaced.png)  
   *Cả 4 cụm đảo xung quanh quảng trường đều hiển thị cặp bồn cây nan gỗ xanh mướt, bố cục quảng trường hài hòa, không gian thông thoáng.*

2. **Cận cảnh Cụm Đảo 0 — Tây Bắc (`[-6.0, -5.0]`):**  
   [02_after_island0_pair_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/02_after_island0_pair_closeup.png)  
   *Cặp 2 bồn ghép khít phía sau ghế công viên, không đè lên ghế, tán lá vươn đẹp.*

3. **Cận cảnh Cụm Đảo 1 — Đông Bắc (`[+6.0, -5.0]`):**  
   [03_after_island1_pair_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/03_after_island1_pair_closeup.png)  
   *Cặp 2 bồn ghép khít, tầm nhìn vào gian EcoVita và Nordic hoàn toàn thoáng đãng.*

4. **Cận cảnh Cụm Đảo 2 — Tây Nam (`[-6.0, +5.0]`):**  
   [04_after_island2_pair_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/04_after_island2_pair_closeup.png)  
   *Cặp 2 bồn ghép khít quay mặt về hướng Bắc theo hướng ghế công viên trước gian Kinetix.*

5. **Cận cảnh Cụm Đảo 3 — Đông Nam (`[+6.0, +5.0]`):**  
   [05_after_island3_pair_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/05_after_island3_pair_closeup.png)  
   *Cặp 2 bồn ghép khít quay mặt về hướng Bắc theo hướng ghế công viên trước gian Solaris.*

6. **Góc nghiêng tiếp giáp giữa 2 bồn cây (Side Junction):**  
   [06_after_island0_side_junction.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/06_after_island0_side_junction.png)  
   *Chứng minh hai bồn ghép sát cạnh nhau phẳng phiu, chân cột gỗ tiếp xúc chuẩn xác, không bị kênh, không chồng lấn méo mó hình học.*

---

## V. KIỂM THỬ HỆ THỐNG & ĐỘ AN TOÀN (REGRESSION VERIFICATION)

1. **Kiểm tra TypeScript & Bundle Production:**
   - Lệnh: `npm --prefix FE run build`
   - Kết quả: `tsc --noEmit` hoàn thành không lỗi; Vite build thành công trong 35.5 giây; 0 warning type error.
2. **Kiểm tra Unit & Integration Test:**
   - Lệnh: `npm test`
   - Kết quả: **31/31 tests passed** (100%):
     - `FE/src/__tests__/movementAndPathfinding.test.ts`: 22/22 passed.
     - `BE/src/__tests__/expoBackendAndRealtime.test.ts`: 9/9 passed.
3. **Kiểm tra Runtime Scene Graph:**
   - `oldPlanterBoxes`: **0** (xóa triệt để).
   - `oldPlanterSoils`: **0** (xóa triệt để).
   - `consoleErrorsCount`: **0**.
4. **Bảo toàn chức năng & Quy tắc an toàn (Scope Lock):**
   - 6 gian hàng V2 giữ nguyên 100%.
   - 36 product slot và modal tương tác giữ nguyên 100%.
   - Ghế công viên, đèn đường, mặt đường, vỉa hè giữ nguyên 100%.
   - Điều khiển WASD / Click-to-move / Camera chuyển đổi mượt mà.
   - **Không commit, không push, không deploy** theo đúng chỉ thị.

---

## VI. BÁO CÁO THAY ĐỔI GIT

- **HEAD trước và sau khi thực hiện:** `de7382949efc26c7c2f73fe8750023c000e14877` (không commit mới).
- **`git diff --stat`:**
  ```text
   FE/src/scene/Environment.tsx    | 52 ++++++++++++-----------------------------
   FE/src/scene/ExteriorAssets.tsx | 24 +++++++++++++++++++
   2 files changed, 39 insertions(+), 37 deletions(-)
  ```
- **Trạng thái file:**
  - `M FE/src/scene/Environment.tsx`
  - `M FE/src/scene/ExteriorAssets.tsx`
  - `?? FE/public/models/env/planter-near-ch.glb`
  - `?? qa-reports/PLANTER_NEAR_BENCH_REPLACEMENT_REPORT.md`
  - `?? qa-reports/planter-replacement/`
  - `?? qa-reports/test_phase0_baseline.cjs`
  - `?? qa-reports/test_phase3_visual_qa.cjs`
