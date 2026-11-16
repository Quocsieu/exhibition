# BÁO CÁO NGHIỆM THU — MOUSE CONTROL + PLANTER FIX + CHARACTER VISUAL UPGRADE (V2)
## Virtual Expo Plaza 3D | STRICT SCOPE LOCK

- **Dự án:** Virtual Expo Plaza 3D
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Git HEAD:** `70e9269ebd0c12b9020f576c83db89f6ca480559`
- **Trạng thái thực thi:** HOÀN TẤT 100% — PASS TOÀN BỘ BUILD, TEST SUITE & BROWSER QA

---

## 1. AUDIT & BASELINE (PHASE 0)

- **Git HEAD:** `70e9269ebd0c12b9020f576c83db89f6ca480559`
- **Git status ban đầu:** Bảo toàn nguyên vẹn toàn bộ thay đổi chưa commit trong `FE/src/scene/Booth.tsx` và `FE/src/scene/Environment.tsx`.
- **Các component liên quan đã kiểm tra:**
  1. `FE/src/controls/useClickToMove.ts` & `FE/src/controls/useKeyboard.ts`: Hệ thống tìm đường A*, trượt tường (`resolveMovementWithSlide`), và nhận diện phím WASD / Arrow.
  2. `FE/src/scene/ExhibitionScene.tsx` & `FE/src/pages/ExhibitionPage.tsx`: Quản lý `HybridCameraRig`, sự kiện chuột trên canvas (`.expo-canvas-container`) và xử lý click mặt đất (`handleGroundClick`).
  3. `FE/src/scene/Booth.tsx` & `FE/src/scene/Environment.tsx`: Tọa độ đặt `booth-planter` quanh 6 gian hàng V2 và `PLANTER_URN_POSITIONS` (`env-planter-urn`) gần các cột đèn đường (`PERIMETER_LAMPS`).
  4. `FE/src/scene/LocalPlayer.tsx` & `FE/src/scene/RemotePlayers.tsx`: Cấu trúc nhân vật procedural `<AvatarCharacter />`, hệ thống xương/khớp (`groupRef`, `bodyRef`, `headRef`, `leftLegPivotRef`, `rightLegPivotRef`, `leftArmPivotRef`, `rightArmPivotRef`) và đồng bộ hóa multiplayer.
- **Hình ảnh Baseline trước khi nâng cấp:**
  - Toàn cảnh baseline: [00_baseline_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/00_baseline_overview.png)
  - Nhân vật & góc nhìn Tham quan baseline: [booth_1_aether_planter_front_corner.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/booth_1_aether_planter_front_corner.png)

---

## 2. TASK A — ĐIỀU KHIỂN NHÂN VẬT BẰNG CHUỘT + GIỮ NGUYÊN WASD

### A1. Cơ chế Click-to-Move trong chế độ Tham quan (`explore`)
- Gỡ bỏ rào cản chặn `if (cameraMode === 'explore') return;` trong `handleEnvironmentGroundClick` ([ExhibitionScene.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/ExhibitionScene.tsx#L571-L577)) và `handleGroundClick` ([ExhibitionPage.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/pages/ExhibitionPage.tsx#L507-L519)).
- Khi người dùng **Click chuột trái (`button === 0`)** vào mặt sân hợp lệ trong chế độ **Tham quan**:
  - Hệ thống tính toán đường đi bằng thuật toán A* (`findPathAStar`) tránh toàn bộ gian hàng và đài phun nước/bồn cây trung tâm.
  - Hiển thị điểm đích phát sáng (`clickMarker`) và đường dẫn nét đứt.
  - Nhân vật tự động quay mặt theo hướng di chuyển (`Math.atan2(normX, normZ)`) và bước đi mượt mà với tốc độ chuẩn `PLAYER_SPEED = 7.0`.
  - Khi click vào vị trí mặt đất mới khi đang đi, đường đi và đích đến được cập nhật tức thì. Khi tới đích, nhân vật tự động chuyển về trạng thái `idle`.

### A2. Bảo toàn 100% điều khiển bàn phím WASD & Ngắt Click-to-Move
- Giữ nguyên toàn bộ logic điều khiển W, A, S, D và các phím mũi tên.
- Khi nhân vật đang tự di chuyển bằng Click-to-Move mà người dùng nhấn bất kỳ phím di chuyển nào (`W`, `A`, `S`, `D`, `ArrowUp/Down/Left/Right`):
  - `useKeyboard` kích hoạt `cancelAutoPath()` và `stepMovement` trong [useClickToMove.ts](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/controls/useClickToMove.ts#L141-L146) xóa ngay lập tức `pathRef.current` và `activePath`.
  - Quyền điều khiển chuyển sang bàn phím theo hướng góc nhìn camera hiện tại.
  - Khi thả phím, nhân vật dừng lại (`idle`). Click chuột trái lại vào mặt đất sẽ tiếp tục Click-to-Move bình thường.

### A3. Camera Tham quan (Follow, Right-Click Rotate, Scroll Zoom)
- **Camera Follow:** Camera góc nhìn thứ 3 tự động đi theo phía sau nhân vật, hơi chếch xuống (`y = 1.72..3.05m`) và tự động xoay mượt theo hướng bước đi của nhân vật khi đi theo đường dẫn Click-to-Move (nếu người dùng không giữ chuột phải xoay thủ công trong 1.6 giây gần nhất).
- **Giữ chuột phải kéo để xoay (`button === 2`):** Cập nhật `handlePointerDown` trong [ExhibitionScene.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/ExhibitionScene.tsx#L593-L605) để xoay góc nhìn 360° ngang (`yaw`) và nghiêng dọc trong giới hạn an toàn (`pitch ∈ [-0.42, 0.48]`, không lật ngược hoặc xuyên đất), đồng thời chặn menu chuột phải mặc định (`onContextMenu`) trên vùng canvas 3D.
- **Con lăn chuột Zoom (`onWheel`):** Phóng to / thu nhỏ khoảng cách camera mượt mà trong giới hạn an toàn (`MIN_CAMERA_ZOOM = 14` đến `60`) kèm kiểm tra chống xuyên tường gian hàng.

### A4. Phân tách sự kiện tương tác không xung đột
- **Click chuột trái mặt đất:** Chỉ kích hoạt khi `e.button === 0` ([Environment.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L668-L672)).
- **Click gian hàng / sản phẩm:** Có `e.stopPropagation()` riêng biệt, mở chế độ Xem gian hàng / thông tin sản phẩm mà không làm nhân vật tự đi.
- **Kéo chuột phải:** Chỉ xoay camera, không kích hoạt Click-to-Move.

---

## 3. TASK B — SỬA CHẬU CÂY DÍNH VÀO GIAN HÀNG VÀ CỘT ĐÈN

### B1. Phát hiện từ Audit hình học thực tế
1. **Chậu cây mặt tiền 6 gian hàng (`booth-planter` trong `Booth.tsx`):**
   - Kiểm tra bounding box thực tế của cả 6 model GLB gian hàng V2 (`aether_tech_v2.glb`, `nordic_living_v2.glb`, `ecovita_coffee_v2.glb`, `kinetix_booth_v2.glb`, `lumina_design_v2.glb`, `solaris_energy_v2.glb`) cho thấy:
     - Đế đá `Plinth_Base` có kích thước $7.24\text{m} \times 5.44\text{m}$ ($X \in [-3.62, +3.62]$, $Z \in [-2.72, +2.72]$).
     - Bậc thềm trước `Step_Tier1` / `Step_Nosing` có kích thước ngang $5.64\text{m}$ và vươn ra tới $Z = +3.17\text{m}$ ($X \in [-2.82, +2.82]$, $Z \in [2.55, 3.17]$).
   - Ở cấu hình cũ (`cornerX = 3.32, frontZ = 2.68`), chậu cây (`radius = 0.325m`) bị lọt vào trong góc đế `Plinth_Base` ($Z \le 2.72$) và cấn cạnh bên của bậc thềm.
2. **Chậu cây tròn lớn (`PLANTER_URN_POSITIONS` / `env-planter-urn` trong `Environment.tsx`):**
   - 2 chậu tại đại lộ Tây & Đông `[-17.2, -3.4]` và `[17.2, -3.4]` nằm đè trực tiếp lên chân cột đèn `PERIMETER_LAMPS` tại `[-17.4, -3.6]` và `[17.4, -3.6]` (khoảng cách tâm chỉ $0.28\text{m}$ trong khi tổng bán kính là $0.84\text{m}$).
   - 2 chậu phía Bắc `[-5.8, -17.5]` và `[5.8, -17.5]` chồng lấn với cột đèn `[±5.6, -17.2]` (cách $0.36\text{m}$) và thùng rác `[±5.6, -17.6]` (cách $0.22\text{m}$).
   - 2 chậu phía Nam `[-5.8, 18.2]` và `[5.8, 18.2]` chồng lấn trực tiếp với trụ biển chỉ dẫn `signPos` tại `[±5.6, 18.2]` (cách $0.20\text{m}$).

### B2. Tọa độ mới & Khoảng cách an toàn
1. **Chậu cây góc mặt tiền gian hàng ([Booth.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Booth.tsx#L596-L601)):**
   - Cập nhật `cornerX = 3.48`, `frontZ = 3.55`.
   - Mép sau của chậu cây nằm tại $Z = 3.55 - 0.325 = 3.225\text{m}$:
     - Cách mặt trước đế gian hàng (`Plinth_Base` $Z = 2.72\text{m}$) một khoảng hở rõ ràng **$50.5\text{cm}$**.
     - Nằm phía trước cả bậc thềm (`Step_Nosing` $Z = 3.17\text{m}$) và cách mép ngang bậc thềm ($X = \pm 2.82\text{m}$) **$33.5\text{cm}$**.
2. **Chậu cây gần cột đèn đường ([Environment.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L130-L137)):**
   - Dịch chuyển 6 vị trí `PLANTER_URN_POSITIONS` dọc trên vỉa hè hợp lệ:
     - Tây & Đông: `[-17.2, -3.4]` $\rightarrow$ `[-17.2, -4.8]` và `[17.2, -3.4]` $\rightarrow$ `[17.2, -4.8]` (cách chân cột đèn `1.22m`, khoảng hở thực tế $> 38\text{cm}$).
     - Bắc (Tây Bắc & Đông Bắc): `[-5.8, -17.5]` $\rightarrow$ `[-6.8, -17.2]` và `[5.8, -17.5]` $\rightarrow$ `[6.8, -17.2]` (cách cột đèn `1.20m`, cách thùng rác `1.26m`, cách trụ biển báo `1.56m`).
     - Nam (Tây Nam & Đông Nam): `[-5.8, 18.2]` $\rightarrow$ `[-6.8, 17.4]` và `[5.8, 18.2]` $\rightarrow$ `[6.8, 17.4]` (cách cột đèn `1.22m`, cách thùng rác `1.22m`, cách trụ biển báo `1.44m`).

---

## 4. TASK C — NÂNG CẤP NGOẠI HÌNH NHÂN VẬT (`LocalPlayer.tsx`)

### C1. Thiết kế Modern Stylized 3D Character
Nâng cấp trực tiếp component `<AvatarCharacter />` trong [LocalPlayer.tsx](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/FE/src/scene/LocalPlayer.tsx) (dùng chung cho cả `LocalPlayer` và `RemotePlayers`):
- **Khuôn mặt thân thiện & Tỷ lệ đầu cân đối:**
  - Đầu bo tròn mềm mại với tông da tự nhiên ấm áp (`#f5cbb0`), hai tai cân đối.
  - Đôi mắt biểu cảm có điểm sáng (`catchlight`), lông mày thanh thoát, mũi nhỏ, má hồng nhẹ và nụ cười thân thiện.
- **Mái tóc Stylized tạo khối đa lớp (Volumetric Layered Hair):**
  - Tóc màu nâu espresso (`#2b1d16`) gồm phần vòm tóc chính nghiêng sau, lớp tóc gáy dày dặn (`HAIR_BACK_GEOM`), phần mái bồng bềnh (`HAIR_TOP_GEOM`, `HAIR_FRINGE_GEOM`) và tóc mai hai bên (`HAIR_SIDE_GEOM`), đẹp từ cả góc nhìn sau lưng (Tham quan) lẫn góc nhìn trực diện/toàn cảnh.
- **Trang phục Smart-Casual Triển lãm hiện đại:**
  - Áo khoác bomber/smart-jacket bo tròn vai (`SHOULDER_YOKE_GEOM`), cổ áo đứng (`COLLAR_GEOM`), vạt áo trước (`LAPEL_PANEL_GEOM`) và gấu áo bo gân (`HEM_GEOM`) mang màu sắc định danh của người chơi.
  - Áo thun trắng cổ tròn bên trong (`INNER_TEE_GEOM`) nổi bật dây đeo và thẻ VIP triển lãm (`BADGE_HOLDER_GEOM`, `BADGE_PASS_GEOM`).
  - Balo đeo lưng (`DAYPACK_BODY_GEOM`) được thu gọn bo tròn tinh tế với ngăn phụ da nâu và tag xanh cyan, không còn che khuất toàn bộ lưng áo như khối hộp đen cũ.
  - Quần chinos ống đứng màu xanh đen (`#1e293b`) có gấu quần xắn gọn (`ANKLE_CUFF_GEOM`), thắt lưng da khóa bạc, đi kèm giày sneaker trắng phối sọc màu theo áo.

### C2. Bảo toàn Rig, Animation & Hiệu năng
- **Giữ nguyên 100% hệ thống Pivot & Animation:** `Idle` (nhịp thở nhẹ, nhìn quanh tự nhiên), `Walking` (đánh tay chân ngược pha, nhún bước đi, xoay nhẹ vai/thân), và `Turning` mượt mà.
- **Hiệu năng tối ưu:** Toàn bộ `BufferGeometry` và `Material` tĩnh được khởi tạo 1 lần ở cấp module và dùng chung trên GPU cho cả người chơi chính lẫn toàn bộ khách tham quan trực tuyến (`RemotePlayers`).

---

## 5. KẾT QUẢ KIỂM THỬ & CHỨNG CỨ HÌNH ẢNH (BROWSER QA)

### Bảng tổng hợp trạng thái QA
| Hạng mục kiểm thử | Kết quả | Chi tiết xác nhận |
| :--- | :---: | :--- |
| **TypeScript Check (`npm run typecheck`)** | **PASS** | 0 lỗi trên cả `BE` và `FE` |
| **Frontend Build (`npm --prefix FE run build`)** | **PASS** | Vite production bundle thành công (0 lỗi) |
| **Test Suite (`npm test`)** | **PASS** | **31/31 tests passed** (100% pass) |
| **Task A — Click-to-Move (Tham quan)** | **PASS** | Click trái mặt đất tự tìm đường A*, đổi đích khi click mới, tự dừng khi tới đích |
| **Task A — Bảo toàn WASD & Ngắt đường đi** | **PASS** | Nhấn WASD hủy ngay đường đi chuột, nhả phím dừng ngay, click lại hoạt động tốt |
| **Task A — Camera Follow / Right-Drag / Zoom** | **PASS** | Camera bám mượt phía sau, giữ chuột phải xoay góc nhìn, cuộn chuột zoom mượt |
| **Task B — Chậu cây gian hàng & Cột đèn** | **PASS** | Toàn bộ chậu cây tách khỏi đế/bậc gian hàng ($\ge 33.5\text{cm}$) và chân cột đèn ($\ge 1.20\text{m}$) |
| **Task C — Ngoại hình & Animation Nhân vật** | **PASS** | Khuôn mặt, tóc, trang phục hiện đại, hoạt ảnh Idle/Walk/Turn mượt, tiếp đất chuẩn |
| **WebGL / GLB Loading** | **PASS** | 0 lỗi WebGL context hoặc lỗi tải file `.glb` |

### Bộ ảnh chụp kiểm chứng trực quan (14 góc chụp thực tế)
1. **Ngoại hình nhân vật mới (Task C):**
   - Góc nhìn chính diện cận cảnh (khuôn mặt, mắt, nụ cười, tóc mái, áo khoác, thẻ VIP): [v2_02_character_front_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_02_character_front_closeup.png)
   - Góc nhìn 3/4 sau lưng cận cảnh (tóc gáy, cổ áo, balo bo tròn, quần chinos, sneaker): [v2_03_character_back_3q_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_03_character_back_3q_closeup.png)
   - Góc nhìn chuẩn trong chế độ Tham quan: [v2_01_character_explore_back_view.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_01_character_explore_back_view.png)
2. **Điều khiển chuột Click-to-Move & Xoay Camera (Task A):**
   - Nhân vật đang bước đi theo đường dẫn Click-to-Move trong chế độ Tham quan: [v2_04_explore_click_to_move_walking.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_04_explore_click_to_move_walking.png)
   - Góc nhìn sau khi giữ chuột phải kéo xoay camera quanh nhân vật: [v2_05_explore_after_right_drag_orbit.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_05_explore_after_right_drag_orbit.png)
3. **Sửa lỗi chậu cây dính gian hàng & cột đèn (Task B):**
   - Toàn cảnh Overview sau khi sửa: [v2_06_overview_planters_fixed.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_06_overview_planters_fixed.png)
   - Gian 1 — Aether Tech Lab (chậu cây trước góc trái + chậu cây cạnh cột đèn phía sau): [v2_07_booth1_aether_planter_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_07_booth1_aether_planter_clear.png)
   - Gian 2 — Nordic Living Studio (2 chậu cây hai góc trước mặt tiền): [v2_08_booth2_nordic_planters_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_08_booth2_nordic_planters_clear.png)
   - Gian 3 — EcoVita Roastery & Craft (2 chậu cây hai góc trước + cột đèn Đông): [v2_09_booth3_ecovita_planters_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_09_booth3_ecovita_planters_clear.png)
   - Gian 4 — Kinetix Robotics & AI (chậu cây trước góc phải mặt tiền): [v2_10_booth4_kinetix_planter_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_10_booth4_kinetix_planter_clear.png)
   - Gian 5 — Lumina Design Collective (2 chậu cây hai góc mặt tiền): [v2_11_booth5_lumina_planters_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_11_booth5_lumina_planters_clear.png)
   - Gian 6 — Solaris Clean Energy (2 chậu cây hai góc mặt tiền): [v2_12_booth6_solaris_planters_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_12_booth6_solaris_planters_clear.png)
   - Cận cảnh cột đèn đại lộ Tây & chậu cây `[-17.2, -4.8]`: [v2_13_west_lamp_planter_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_13_west_lamp_planter_clear.png)
   - Cận cảnh cột đèn phía Bắc & chậu cây `[-6.8, -17.2]`: [v2_14_north_lamp_planter_clear.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v2_14_north_lamp_planter_clear.png)

---

## 6. THÔNG TIN GIT & CAM KẾT AN TOÀN

- **Danh sách file mã nguồn thay đổi:**
  1. `FE/src/controls/useClickToMove.ts`
  2. `FE/src/pages/ExhibitionPage.tsx`
  3. `FE/src/scene/Booth.tsx`
  4. `FE/src/scene/Environment.tsx`
  5. `FE/src/scene/ExhibitionScene.tsx`
  6. `FE/src/scene/LocalPlayer.tsx`
- **Xác nhận an toàn Git:**
  - Tuyệt đối **KHÔNG** chạy `git reset`, `git clean`, `git stash`, `git commit`, `git push` hoặc deploy.
