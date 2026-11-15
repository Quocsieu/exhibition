# BÁO CÁO HOTFIX CẢNH QUAN VIRTUAL EXPO PLAZA 3D
## Landscape Architecture & Environmental Lighting Targeted Hotfix

**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Ngày thực hiện:** 15/11/2026  
**Công nghệ:** React 18, TypeScript, React Three Fiber, Three.js 0.170, Blender 4.2 LTS  
**Trạng thái kiểm thử:** 31/31 Vitest Passed · Vite Production Build Clean (0 errors) · WebGL Error 0  
**Quy tắc an toàn:** Không commit, không push, không thay đổi 6 gian hàng V2 và hệ thống sản phẩm.

---

## I. TỔNG QUAN KẾT QUẢ THỰC HIỆN

Dựa trên ảnh toàn cảnh do người dùng cung cấp có khoanh đỏ 3 vị trí cảnh quan, toàn bộ 3 vấn đề đã được điều tra gốc rễ, sửa đổi chuẩn xác và nghiệm thu trực quan bằng trình duyệt thực tế (Playwright headless Chromium with WebGL D3D11):

| # | Hạng mục yêu cầu | Tình trạng trước hotfix | Giải pháp thực hiện | Kết quả sau hotfix |
|---|---|---|---|---|
| **1** | **Xóa 2 bồn cây ngoài đường** (Khu vực Cổng chào phía Nam) | 2 bồn cây hình chữ nhật (`1.6 x 0.32 x 1.1m`) và 4 cụm hoa đặt tại tọa độ $x = \pm 6.4, z = 20.9$, nằm đè trực tiếp lên làn đường nhựa asphalt của Cổng chào. | Xác định chính xác component `Flanking Entrance Flower Beds` trong [Environment.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L890-L905) và 4 tọa độ hoa trong `FLOWER_CLUSTERS_PINK`, `FLOWER_CLUSTERS_GOLD`. Loại bỏ hoàn toàn khối hình học này khỏi scene 3D. | Mặt đường nhựa asphalt phía trước Cổng chào hoàn toàn thông thoáng, sạch sẽ; vỉa hè, kết cấu cổng và toàn bộ bồn hoa khác trong quảng trường giữ nguyên vẹn 100%. |
| **2** | **Xoay hướng 2 cột đèn ra phía mặt đường** (Hai đại lộ Tây và Đông) | Các cột đèn chu vi dùng chung công thức `Math.atan2(-x, -z)`, khiến tay đèn và chóa đèn hai bên rìa quảng trường quay ngược vào tâm sân gạch thay vì chiếu sáng đường phố. | Điều chỉnh rotation của các cột đèn đại lộ phía Tây ($x < -10$) thành $-\pi / 2$ (hướng Tây ra đường) và đại lộ phía Đông ($x > 10$) thành $+\pi / 2$ (hướng Đông ra đường). Dịch chuyển tâm quầng sáng dưới đất (`LAMP_POOL_MAT`) thêm $\mp 1.35\text{m}$ khớp với độ vươn của chóa đèn. | Tay đèn, bóng đèn vươn chuẩn xác ra lòng đường; chân đế cột đèn giữ nguyên vị trí $[x, 0.02, z]$; quầng sáng vàng ấm trải đều trên mặt đường nhựa. |
| **3** | **Sửa màu thảm thực vật bị trắng bợt** (Các chậu cây và bồn cây chân cột đèn/gian hàng) | Model `FE/public/models/env/planter.glb` có material `Leaves` không chứa diffuse map (`m.map = null`), trong khi runtime gán `m.color.setRGB(1.5, 1.62, 1.3)` và `emissive` cao, dẫn tới hiện tượng cháy sáng trắng bợt (chalk-white). | 1. Dùng Blender 4.2 LTS nạp lại `planter.glb`, gán base color chuẩn công viên PBR `(0.05, 0.22, 0.08)`.<br>2. Cập nhật shader loader trong [ExteriorAssets.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L138-L150) kiểm tra fallback `if (m.map) ... else ...`, áp mã màu xanh thực vật phong phú (`#2d6a4f` cho chậu urn, `#386641` cho booth planter) và giảm emissive tự nhiên. | Toàn bộ cây cảnh trong chậu urn và bồn cây gian hàng hiển thị màu xanh tán lá tươi tắn, hài hòa, có độ đổ bóng tự nhiên, loại bỏ triệt để hiện tượng trắng bợt. |

---

## II. CHI TIẾT KỸ THUẬT & TRÍCH XUẤT SOURCE CODE

### 1. Yêu cầu 1 — Loại bỏ 2 bồn hoa trên lòng đường Cổng chào phía Nam

- **Vị trí trong hierarchy scene:**
  Nằm trong group Cổng chào Cực Nam `position={[0, 0, 21]}` trong component `Environment.tsx`.
- **Tọa độ thực:**
  - Bồn hoa Tây: $[-6.4, 0.16, 20.9]$
  - Bồn hoa Đông: $[+6.4, 0.16, 20.9]$
  - Cụm hoa hồng: $[-6.2, 0.46, 20.8]$ và $[6.2, 0.46, 20.8]$
  - Cụm hoa vàng: $[-6.6, 0.46, 21.1]$ và $[6.6, 0.46, 21.1]$
- **Mặt cắt lòng đường:**
  Lòng đường Cổng chào trải từ $z = 19.8\text{m}$ đến $z = 22.8\text{m}$. Do đó hai bồn hoa này chắn ngang làn xe chạy.
- **Thực thi:**
  Đã loại bỏ khối JSX `{[-6.4, 6.4].map(...)}` và 4 tọa độ hoa trong mảng `FLOWER_CLUSTERS_PINK` và `FLOWER_CLUSTERS_GOLD`.
- **Kiểm tra rò rỉ:**
  Chạy kiểm tra scene graph qua R3F: `gateFlowerbedsFound: 0`.

### 2. Yêu cầu 2 — Xoay hướng tay cột đèn đại lộ ra mặt đường

- **Phân tích hình học `Street_Lamp.glb`:**
  - Gốc tọa độ chân cột nằm tại $[0, 0, 0]$.
  - Tay vươn đèn và chóa đèn nằm ở hướng trục $+Z$ khi góc xoay bằng $0$.
  - Cột đèn bên trái (Tây): tọa độ chân cột $x = -17.4\text{m}$. Mặt đường đại lộ nằm ở $x \approx -20.4\text{m}$ (hướng $-X$).
    $\rightarrow$ Góc xoay cần thiết: `rotation.y = -Math.PI / 2` ($-90^\circ$).
  - Cột đèn bên phải (Đông): tọa độ chân cột $x = +17.4\text{m}$. Mặt đường đại lộ nằm ở $x \approx +20.4\text{m}$ (hướng $+X$).
    $\rightarrow$ Góc xoay cần thiết: `rotation.y = Math.PI / 2` ($+90^\circ$).
- **Độ vươn chóa đèn & Quầng sáng mặt đất:**
  - Chóa đèn vươn xa $1.35\text{m}$ từ tim cột.
  - Vị trí quầng sáng được đồng bộ:
    - Cột Tây: `poolX = lx - 1.35` (từ $-17.4$ thành $-18.75$, chiếu thẳng xuống lòng đường nhựa).
    - Cột Đông: `poolX = lx + 1.35` (từ $+17.4$ thành $+18.75$, chiếu thẳng xuống lòng đường nhựa).
    - Các cột đèn khác: giữ nguyên vị trí cũ.
- **Code cập nhật:**
  ```tsx
  // FE/src/scene/Environment.tsx
  const lampPlacements = useMemo<ExteriorPlacement[]>(
    () =>
      PERIMETER_LAMPS.map(([x, z]) => {
        let rot = Math.atan2(-x, -z);
        if (x < -10) rot = -Math.PI / 2;     // Hướng Tây ra Đại lộ
        else if (x > 10) rot = Math.PI / 2;  // Hướng Đông ra Đại lộ
        return { position: [x, 0.02, z], rotation: rot };
      }),
    []
  );
  ```

### 3. Yêu cầu 3 — Khôi phục sắc xanh tự nhiên cho thảm thực vật

- **Nguyên nhân gốc rễ:**
  Mesh `Leaves 011` trong `planter.glb` sử dụng material tên `Leaves`. Material này xuất từ Blender trước đó không có diffuse map (`map: null`).
  Tại [ExteriorAssets.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L138):
  ```ts
  // Code cũ:
  m.color.setRGB(1.5, 1.62, 1.3); // > 1.0 làm RGB bị over-saturated, biến thành màu trắng
  m.emissive = new THREE.Color(0.14, 0.22, 0.08);
  ```
  Vì không có texture map, Three.js nhân trực tiếp `diffuse = m.color`. Với giá trị $> 1.0$ cộng hưởng với ánh sáng DirectionalLight và AmbientLight của scene, toàn bộ khối tán cây bị lóa thành màu trắng phấn.
- **Giải pháp 2 lớp (Two-Layer Fix):**
  1. **Lớp 1 (Blender PBR GLB):** Chạy script `FE/booth-modeling/scripts/fix_planter_leaves.py` qua Blender 4.2 LTS headless để bake base color PBR sRGB `(0.05, 0.22, 0.08, 1.0)` trực tiếp vào mesh data của file [planter.glb](file:///e:/Lập trình/MatBaoWS/exhibition/FE/public/models/env/planter.glb).
  2. **Lớp 2 (Three.js Material Fallback Guard):** Cập nhật `ExteriorAssets.tsx`:
     ```ts
     if (m.map) {
       m.color.setRGB(1.1, 1.15, 1.05);
     } else {
       // Thảm thực vật không có diffuse map: gán mã màu xanh công viên tươi tốt
       const leafHex = id === 'booth-planter' ? 0x386641 : 0x2d6a4f;
       m.color.setHex(leafHex);
       m.roughness = 0.72;
       m.metalness = 0.02;
       m.emissive.setHex(0x132a13);
       m.emissiveIntensity = 0.12;
     }
     ```
- **Kết quả đo đạc từ WebGL:**
  Scene audit ghi nhận: material `Leaves` có hex `#2d6a4f` (chậu hoa) và `#386641` (bồn gian hàng), `emissive: #273f27`, tán lá xanh mướt, nổi khối hình học rõ ràng.

---

## III. BẰNG CHỨNG HÌNH ẢNH ĐỐI CHIẾU (BEFORE & AFTER)

### 1. Đối chiếu chi tiết 3 vùng khoanh đỏ

#### Vùng 1: Hai bồn cây Cổng chào phía Nam
- **Trước hotfix (Vật thể chặn ngang làn đường xe chạy):**  
  ![Cổng chào trước hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/crop_bottom.png)
- **Sau hotfix (Mặt đường nhựa asphalt thông thoáng 100%):**  
  ![Cổng chào sau hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/after_crop_bottom.png)

#### Vùng 2: Cột đèn đại lộ phía Tây
- **Trước hotfix (Tay đèn quay ngược vào trong sân gạch):**  
  ![Cột đèn Tây trước hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/crop_west.png)
- **Sau hotfix (Tay đèn vươn ra lòng đường, quầng sáng chiếu trên mặt đường):**  
  ![Cột đèn Tây sau hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/after_crop_west.png)

#### Vùng 3: Cột đèn đại lộ phía Đông
- **Trước hotfix (Tay đèn quay ngược vào trong sân gạch):**  
  ![Cột đèn Đông trước hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/crop_east.png)
- **Sau hotfix (Tay đèn vươn ra lòng đường, quầng sáng chiếu trên mặt đường):**  
  ![Cột đèn Đông sau hotfix](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/after_crop_east.png)

---

### 2. Bộ ảnh chụp thực tế chất lượng cao từ trình duyệt (Headless Chrome WebGL)

1. **Toàn cảnh quảng trường sau hotfix (Overview Mode):**  
   [01_plaza_overview_after_hotfix.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/01_plaza_overview_after_hotfix.png)  
   *Mặt đường cổng chào thông thoáng; đèn đường hai bên đại lộ xoay ra phía lòng đường; toàn bộ chậu cây và bồn cây xanh tươi tự nhiên.*

2. **Cận cảnh Cột đèn đại lộ phía Tây:**  
   [02_west_street_lamp_facing_road.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/02_west_street_lamp_facing_road.png)  
   *Chân cột giữ nguyên vị trí, thân đèn nghiêng tay đèn về hướng Tây ra mặt đường, quầng sáng phản chiếu chuẩn xác trên nền đường.*

3. **Cận cảnh Cột đèn đại lộ phía Đông:**  
   [03_east_street_lamp_facing_road.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/03_east_street_lamp_facing_road.png)  
   *Chân cột giữ nguyên vị trí, thân đèn nghiêng tay đèn về hướng Đông ra mặt đường, quầng sáng phản chiếu chuẩn xác trên nền đường.*

4. **Cận cảnh Cổng chào phía Nam (Lòng đường không còn bồn cây):**  
   [04_south_entrance_road_no_planters.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/04_south_entrance_road_no_planters.png)  
   *Hai bồn hoa hình chữ nhật đã được dỡ bỏ hoàn toàn, vạch kẻ đường và nền nhựa thông suốt, hệ thống vỉa hè và thềm cổng nguyên vẹn.*

5. **Cận cảnh Chậu cây cảnh Urn & Bồn cây gian hàng (Màu xanh tán lá tự nhiên):**  
   [05_planter_lush_green_foliage.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/05_planter_lush_green_foliage.png)  
   *Tán lá có sắc thái xanh lục đậm đà tự nhiên `#2d6a4f` / `#386641`, không còn bất kỳ hiện tượng trắng bợt, cháy sáng hay chói lóa nào.*

---

## IV. KIỂM THỬ HỆ THỐNG & KHÔNG GÂY TÁC DỤNG PHỤ (REGRESSION SAFETY)

1. **Kiểm tra TypeScript & Bundle Production:**
   - Lệnh: `npm --prefix FE run build`
   - Kết quả: `tsc --noEmit` hoàn thành không lỗi; Vite build thành công trong 63 giây; 0 warning type error.
2. **Kiểm tra Unit & Integration Test:**
   - Lệnh: `npm test`
   - Kết quả: **31/31 tests passed** (100%):
     - `FE/src/__tests__/movementAndPathfinding.test.ts`: 22/22 passed.
     - `BE/src/__tests__/expoBackendAndRealtime.test.ts`: 9/9 passed.
3. **Bảo toàn chức năng & Mô hình:**
   - Toàn bộ 6 gian hàng V2 (Aether, Nordic, EcoVita, Kinetix, Lumina, Solaris) giữ nguyên 100%.
   - Toàn bộ 36 product slot và modal tương tác giữ nguyên 100%.
   - Điều khiển di chuyển nhân vật WASD / Joystick / Click-to-move hoạt động hoàn hảo.
   - Không commit, không push theo đúng chỉ thị.
