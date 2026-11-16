# BÁO CÁO NGHIỆM THU — PLANTER LAYOUT HOTFIX V2
## Virtual Expo Plaza 3D | STRICT SCOPE LOCK

- **Dự án:** Virtual Expo Plaza 3D
- **Ngày thực hiện:** 15/11/2026
- **Head commit:** `70e9269ebd0c12b9020f576c83db89f6ca480559`
- **Trạng thái thực thi:** HOÀN TẤT 100% — PASS TOÀN BỘ AUDIT & TEST SUITE

---

## I. MỤC TIÊU & PHẠM VI (SCOPE LOCK)

Đã hoàn thành chính xác 2 nhiệm vụ hotfix cảnh quan theo yêu cầu Master Prompt:

1. **TASK A — Mở rộng cụm bồn cây `planter-near-ch.glb` từ 2 thành 4 model hình chữ nhật:**
   - Mỗi cụm bồn cây cạnh ghế đá công viên được xếp dạng lưới $2 \times 2$ (2 hàng $\times$ 2 cột).
   - Ghép khít hoàn hảo tạo thành một bồn hoa/cây cảnh hình chữ nhật bề thế với kích thước $2.40\text{m} \times 1.262\text{m}$.
   - Duy trì khoảng cách thông thoáng với ghế đá công viên ($\approx 28\text{cm}$), không bị đè hay xuyên lấn.

2. **TASK B — Điều chỉnh chậu cây gian hàng ra phía trước góc mặt tiền:**
   - Đưa toàn bộ các chậu cây `booth-planter` vốn nằm sát hoặc dính/xuyên vào bậc thềm, cột trụ và quầy lễ tân của gian hàng ra phía trước hai góc mặt tiền ngoài của gian hàng.
   - Khoảng cách lề mặt tiền $Z = +0.48\text{m}$ (thoát hoàn toàn khỏi bậc thềm $\approx 0.30\text{m}$) và lề ngang $X = \pm(vw / 2 + 0.32\text{m})$ (nằm ngoài phạm vi cột biên).
   - Loại bỏ 100% hiện tượng mesh clipping xuyên geometry gian hàng.

---

## II. CHI TIẾT TRIỂN KHAI KỸ THUẬT

### 1. TASK A — Cụm bồn cây công viên (`Environment.tsx`)

- **Model sử dụng:** `/models/environment/planter-near-ch.glb`
- **Bounding Box model:**
  - Width ($X$): $1.20\text{m}$ (từ $-0.60\text{m}$ đến $+0.60\text{m}$)
  - Depth ($Z$): $0.631\text{m}$ (từ $-0.3155\text{m}$ đến $+0.3155\text{m}$)
  - Height ($Y$): $0.831\text{m}$ (chân đế tại mặt sàn $Y = 0.02$)
- **Quy cách bố trí lưới $2 \times 2$:**
  - Offset hàng (Z): $\pm 0.3155\text{m}$ (khoảng cách tâm giữa 2 hàng $= 0.631\text{m}$, tiếp giáp khít mép bồn cây).
  - Offset cột (X): $\pm 0.60\text{m}$ (khoảng cách tâm giữa 2 cột $= 1.20\text{m}$, tiếp giáp khít mép bên).
  - Tổng số cụm: 4 cụm (Island 0: NW, Island 1: NE, Island 2: SW, Island 3: SE).
  - Tổng số instance: $4 \times 4 = 16$ instances (tăng từ 8 instances của phiên trước).

### 2. TASK B — Chậu cây mặt tiền gian hàng (`Booth.tsx`)

- **Component:** `FE/src/scene/Booth.tsx` (hàm `boothDecorPlacements`)
- **Tọa độ căn chỉnh mới:**
  - `cornerX = vw / 2 + 0.32`
  - `frontZ = vd / 2 + 0.48`
- **Kết quả điều chỉnh từng gian hàng:**
  - **Aether Tech Lab (`tech`):** 1 chậu góc trái mặt tiền `[-cornerX, 0.02, frontZ]`, xoay nhẹ $0.2\,\text{rad}$. (Trước đây nằm tại $X = -vw/2 + 0.28$ dính cột trong).
  - **Nordic Living Studio (`living`):** 2 chậu hai góc mặt tiền `[-cornerX, 0.02, frontZ]` và `[cornerX, 0.02, frontZ]`. (Trước đây tại $Z = vd/2 + 0.15$ dính bậc thềm).
  - **EcoVita Roastery (`coffee`):** 2 chậu hai góc mặt tiền `[-cornerX, 0.02, frontZ]` và `[cornerX, 0.02, frontZ]`.
  - **Kinetix Robotics (`robotics`):** 1 chậu góc phải mặt tiền `[cornerX, 0.02, frontZ]`, xoay $-0.2\,\text{rad}$. (Trước đây tại $X = vw/2 - 0.28$ dính quầy phía trước).
  - **Lumina Design (`design`):** 2 chậu hai góc mặt tiền `[-cornerX, 0.02, frontZ]` và `[cornerX, 0.02, frontZ]`. (Trước đây tại $X = \pm(vw/2 - 0.32)$ nằm bên trong gian hàng).
  - **Solaris Clean Energy (`energy`):** 2 chậu hai góc mặt tiền `[-cornerX, 0.02, frontZ]` và `[cornerX, 0.02, frontZ]`.

---

## III. KẾT QUẢ KIỂM THỬ & CHỨNG CỨ HÌNH ẢNH (VISUAL QA)

### 1. Kết quả kiểm thử tự động
- **TypeScript build:** `npm --prefix FE run build` — **PASS** (45.37s, 0 lỗi).
- **Unit & Integration tests:** `npm test` — **PASS** (31/31 tests passed).
- **Console errors:** 0 errors trên Chrome Headless WebGL.

### 2. Hình ảnh kiểm chứng thực tế

#### A. Toàn cảnh (Overview)
- [01_after_overview_planter_v2.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/01_after_overview_planter_v2.png): Toàn cảnh quảng trường thể hiện rõ cả 4 cụm bồn cây $2 \times 2$ và các chậu cây đứng gọn gàng ngoài góc mặt tiền cả 6 gian hàng.

#### B. Cụm bồn cây công viên (4 cụm $2 \times 2$)
- [02_island0_2x2_cluster.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/02_island0_2x2_cluster.png): Cụm Tây Bắc (Island 0) — 4 bồn cây ghép hình chữ nhật sát cạnh nhau, cách ghế đá $\approx 28\text{cm}$.
- [03_island1_2x2_cluster.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/03_island1_2x2_cluster.png): Cụm Đông Bắc (Island 1) — 4 bồn cây xếp $2 \times 2$ thẳng hàng, mép khít hoàn chỉnh.
- [04_island2_2x2_cluster.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/04_island2_2x2_cluster.png): Cụm Tây Nam (Island 2) — 4 bồn cây xếp $2 \times 2$ cân đối trước mặt gian hàng.
- [05_island3_2x2_cluster.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/05_island3_2x2_cluster.png): Cụm Đông Nam (Island 3) — 4 bồn cây xếp $2 \times 2$ chuẩn xác.

#### C. Chậu cây góc mặt tiền 6 gian hàng
- [booth_1_aether_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_1_aether_planter_front_corner.png): Gian hàng Aether Tech Lab — chậu cây đặt tại góc trái mặt tiền, không chạm bậc thềm hay cột.
- [booth_2_nordic_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_2_nordic_planter_front_corner.png): Gian hàng Nordic Living Studio — 2 chậu cây đặt ngoài hai góc mặt tiền trang nhã.
- [booth_3_ecovita_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_3_ecovita_planter_front_corner.png): Gian hàng EcoVita Roastery — 2 chậu cây phía trước 2 góc thềm gỗ, lối đi vào hoàn toàn thoáng rộng.
- [booth_4_kinetix_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_4_kinetix_planter_front_corner.png): Gian hàng Kinetix Robotics — chậu cây góc phải mặt tiền tách biệt hẳn khỏi quầy và bậc bước.
- [booth_5_lumina_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_5_lumina_planter_front_corner.png): Gian hàng Lumina Design — 2 chậu cây chuyển ra ngoài góc mặt tiền, giải phóng sàn trưng bày bên trong.
- [booth_6_solaris_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_6_solaris_planter_front_corner.png): Gian hàng Solaris Clean Energy — 2 chậu cây góc ngoài tiền sảnh đón khách.

---

## IV. TỔNG KẾT FILE THAY ĐỔI & GIT STATUS

- **Files modified:**
  1. `FE/src/scene/Environment.tsx`: Cập nhật logic `planterBenchPlacements` sinh 4 model xếp $2 \times 2$ cho mỗi cụm đảo.
  2. `FE/src/scene/Booth.tsx`: Cập nhật `boothDecorPlacements` đưa chậu cây ra trước góc mặt tiền `[-cornerX, frontZ]` và `[cornerX, frontZ]`.
- **Git diff stat:**
  ```text
  FE/src/scene/Booth.tsx       | 23 +++++++++++++----------
  FE/src/scene/Environment.tsx | 10 ++++++++--
  2 files changed, 21 insertions(+), 12 deletions(-)
  ```
- **Cam kết phạm vi:**
  - Không sửa bất kỳ model `.glb` gian hàng nào.
  - Không sửa vị trí sản phẩm, dữ liệu Admin, camera hay hệ thống di chuyển.
  - **CHƯA commit và CHƯA push lên remote repository.**
