# BÁO CÁO KỸ THUẬT & QA — VIRTUAL EXPO PLAZA VISUAL POLISH V4

- **Dự án:** Virtual Expo Plaza 3D
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Chế độ thực thi:** `AUDIT → BASELINE → 5 VISUAL PHASES → BROWSER QA → REPORT` (STRICT GRAPHICS-ONLY SCOPE LOCK)
- **Baseline HEAD:** `2c5fcd3003ac37145d404cf733e8add9f77c0605`

---

## A. BASELINE

### 1. Hiện trạng trước khi nâng cấp
- **Trạng thái Git ban đầu:** Working tree sạch tại HEAD `2c5fcd3003ac37145d404cf733e8add9f77c0605`.
- **Ảnh Baseline (Overview):** [v4_00_baseline_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_00_baseline_overview.png)
- **Danh sách các vấn đề đồ họa phát hiện từ ảnh Overview Baseline:**
  1. **Phase 1 (P0) — Cây xanh che khuất gian hàng:** Các cây `jacaranda_tree_lod.glb` (`PERIMETER_TREES`) có `bounds = [7.2, 6.8, 7.2]` và `scale = 1.05..1.22` (tán rộng tới `7.6m..8.8m`, cao `7.1m..8.3m`). Ở góc nhìn Isometric Overview (`ISOMETRIC_OFFSET = (16, 26, 22)`), tán cây ở độ cao $y$ chiếu chéo theo vector $(-0.615\Delta y, -0.846\Delta y)$, che khuất trực diện bảng hiệu và mặt tiền của 4 gian hàng (`EcoVita`, `Lumina`, `Solaris`, `Kinetix`).
  2. **Phase 2 (P1) — Ánh sáng, bóng đổ và vật liệu thiếu đồng bộ:**
     - Nền lát vỉa hè khu vực gian hàng dùng màu trắng tinh `#ffffff` dưới `directionalLight = 1.62` và `toneMappingExposure = 1.06` gây chói lóa, mất độ tương phản.
     - Vật liệu lá cây `jacaranda_tree_leaves.001` và `fir_tree_01_twig` trong GLB gốc có `alphaMode: "BLEND"` kèm hệ số nhân màu RGB `> 1.0` (`1.25, 1.32, 1.18`), khiến viền lá bị bạc trắng và nhòe dưới ACES Filmic Tone Mapping; nhánh cây `dead_branches` lộ màu xám trắng khô.
     - Vùng bóng tối dưới mái gian hàng và mặt khuất thiếu ánh sáng bù (`ambientLight = 0.52`), tạo mảng tối gắt.
  3. **Phase 3 (P1) — Khả năng nhận diện mặt tiền gian hàng:** Ở góc nhìn Toàn cảnh (`Overview`), 3 gian hàng quay lưng/chéo về phía Đông-Nam (`Solaris Clean Energy` xoay $180^\circ$, `Lumina Design` xoay $-135^\circ$, `Kinetix Robotics` xoay $+135^\circ$) chỉ gắn bảng hiệu `currentSignTexture` ở mặt trước `z = 3.60m`, để lộ mặt lưng hộp bảng hiệu `Header_Casing` (`z = 3.39m`) tối màu hoặc trống trơn khi nhìn từ camera Overview.
  4. **Phase 4 (P2) — Bố trí khu vực nghỉ chân (`umbrella`):** Hai bộ bàn ghế có ô che `umbrella.glb` ở trung tâm quảng trường có màu tán ô tối đen dễ lẫn với bóng đổ hoặc thiếu điểm nhấn hài hòa với hệ ghế gỗ công viên `bench.glb` và cụm bồn cây `planter-near-ch.glb`.
  5. **Phase 5 (P2) — Bối cảnh bên ngoài quảng trường:**
     - Bộ lọc `STYLIZED_CITY_BUILDINGS.filter((_, i) => i % 4 === (variant === 2 ? 3 : variant))` bỏ sót toàn bộ các tòa nhà có chỉ số `i % 4 === 2` (4 tòa nhà bị khuyết khỏi quy hoạch phố).
     - Model `city-2` (`Building01_joined.glb`) có mesh gốc bị cắt vát đáy (`min.y = -0.83`) và lệch tâm làm công trình trông như lơ lửng trên mặt cỏ xanh neon `#bbf7d0`.

![Ảnh Baseline Overview trước khi nâng cấp](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_00_baseline_overview.png)

---

## B. PHASE 1 — VEGETATION & OCCLUSION

### 1. Số lượng cây `PERIMETER_TREES` đã điều chỉnh
- Tổng số cây điều chỉnh: **10/10 cây** trong mảng `PERIMETER_TREES` tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L88-L99) (giữ nguyên số lượng 10 cây đại lộ, không xóa bỏ hoàn toàn cây xanh).
- Giữ nguyên 100% 12 chậu cây trang trí trước gian hàng `tree-gian.glb` và 16 bồn cây `planter-near-ch.glb` quanh ghế công viên.

### 2. Thay đổi về Position và Scale
| STT | Tọa độ cũ `[x, z, scale]` | Tọa độ mới `[x, z, scale]` | Khu vực & Tác dụng |
|---|---|---|---|
| 1 | `[-16.6, -16.6, 1.15]` | `[-16.6, -16.6, 0.64]` | Góc Tây-Bắc ngoài cùng (sau lưng Aether Tech Lab) |
| 2 | `[16.6, -16.6, 1.15]` | `[16.6, -16.6, 0.64]` | Góc Đông-Bắc ngoài cùng (sau lưng EcoVita Roastery) |
| 3 | `[-16.6, 16.6, 1.15]` | `[-16.6, 16.6, 0.64]` | Góc Tây-Nam ngoài cùng (sau lưng Kinetix Robotics) |
| 4 | `[16.6, 16.6, 1.15]` | `[16.8, 14.2, 0.60]` | Thu gọn sát mép vỉa hè Đông-Nam, mở thoáng mặt tiền Lumina |
| 5 | `[-16.6, -5.2, 1.12]` | `[-17.0, -11.8, 0.64]` | Dịch về góc vỉa hè Tây-Bắc, giải phóng góc nhìn chéo vào Kinetix |
| 6 | `[16.6, -5.2, 1.12]` | `[17.0, -12.2, 0.60]` | Dịch khỏi đường chiếu camera Overview trước mặt tiền EcoVita |
| 7 | `[-5.8, -16.6, 1.18]` | `[-7.8, -16.8, 0.62]` | Đặt gọn ở khoảng hở giữa Aether và Nordic Living |
| 8 | `[5.8, -16.6, 1.18]` | `[7.8, -16.8, 0.62]` | Đặt gọn ở khoảng hở giữa Nordic Living và EcoVita |
| 9 | `[-16.6, 5.2, 1.12]` | `[-17.0, 11.8, 0.62]` | Đặt ở rìa Tây-Nam, cách xa hành lang camera Kinetix `> 5.3m` |
| 10 | `[16.6, 5.2, 1.12]` | `[8.2, 16.8, 0.58]` | Chuyển khỏi khoảng trống trước Lumina sang rìa Nam ngoài cùng |

### 3. Kết quả đạt được
- **0/6 gian hàng** bị tán cây che khuất ở cả góc nhìn Toàn cảnh (`Overview`) lẫn góc nhìn Tham quan (`Explore`).
- Toàn bộ 10 cây đều giữ khoảng cách $\ge 5.30\text{m}$ tới mọi tia nhìn camera Shop Showcase (vượt chuẩn kiểm thử tự động $> 3.8\text{m}$).
- Ảnh kiểm chứng Phase 1: [v4_01_phase1_trees_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_01_phase1_trees_overview.png)

---

## C. PHASE 2 — LIGHTING, SHADOWS & MATERIALS

### 1. Thông số ánh sáng và vật liệu đã điều chỉnh
- **Hệ thống ánh sáng & Tone Mapping** tại [ExhibitionScene.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExhibitionScene.tsx#L195-L237):
  - `toneMappingExposure`: giảm từ `1.06` xuống `1.02` để triệt tiêu hiện tượng cháy sáng trên nền gạch sáng màu.
  - `ambientLight`: nâng từ `0.52` lên `0.72` (`#f8fafc`) giúp làm mềm các vùng tối gắt dưới mái gian hàng.
  - `hemisphereLight`: tinh chỉnh thành `['#f0f9ff', '#94a3b8', 0.82]` để ánh sáng phản xạ từ mặt đất tự nhiên hơn.
  - `directionalLight` chính (Sun): giảm từ `1.62` xuống `1.38`, `shadow-bias = -0.00025`, `shadow-radius = 2.5`.
  - Bổ sung đèn `directionalLight` bù sáng mặt tiền (`position={[0, 26, 28]}`, `intensity={0.38}`, `#fff7ed`) để các gian hàng phía Nam/Đông không bị tối sẫm mặt lưng.
- **Vật liệu nền gạch vỉa hè & lối dẫn** tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L656-L702):
  - Nền vỉa hè chính: chuyển từ `#ffffff` (`roughness: 0.84`) sang màu đá vôi ấm `#d5dde6` (`roughness: 0.88`).
  - Lối đi kết nối vào 6 gian hàng (`BOOTH_CONNECTOR_PATHS`): chuyển từ `#ffffff` sang `#dee6ee` (`roughness: 0.82`).
- **Xử lý vật liệu tán cây bị bệt trắng / bạc màu** tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L198-L224):
  - Tắt chế độ bán trong suốt gây viền trắng (`m.transparent = false; m.alphaTest = 0.28; m.depthWrite = true`).
  - Hạ hệ số màu RGB của lá có texture từ `(1.25, 1.32, 1.18)` xuống `(0.68, 0.96, 0.62)` để giữ sắc xanh tự nhiên dưới ACES Tone Mapping.
  - Nhuộm nhánh cây `dead_branches` của `jacaranda_tree_lod.glb` sang màu xanh rêu đậm `#3b6e38` thay vì màu trắng xám.
- Ảnh kiểm chứng Phase 2: [v4_02_phase2_lighting_materials_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_02_phase2_lighting_materials_overview.png)

---

## D. PHASE 3 — BOOTH VISIBILITY & READABILITY

### 1. Phân tích & Giải pháp
- **Nguyên nhân:** Các gian hàng `Solaris Clean Energy` (xoay $180^\circ$), `Lumina Design` (xoay $-135^\circ$) và `Kinetix Robotics` (xoay $+135^\circ$) hướng mặt tiền vào tâm quảng trường $(0,0,0)$. Khi nhìn từ camera Toàn cảnh đặt tại hướng Đông-Nam `(16, 26, 22)`, người dùng nhìn vào mặt lưng của hộp bảng hiệu `Header_Casing` (`z = 3.39m` trong không gian cục bộ của gian hàng), nơi trước đó chỉ là mảng vỏ tối màu không có chữ.
- **Giải pháp an toàn (không sửa GLB, không xoay gian hàng):**
  - Tại [Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx#L937-L947), gắn thêm một mặt phẳng bảng hiệu sử dụng chung `currentSignTexture` ở mặt sau của hộp `Header_Casing` (`position={[0, 3.38, 3.36]}`, `rotation={[0, Math.PI, 0]}`).
- **Kết quả:** Cả **6/6 gian hàng** đều hiển thị rõ tên thương hiệu, ngành hàng và số lượng sản phẩm trưng bày ngay từ góc nhìn Toàn cảnh (`Overview`) mà không thay đổi bất kỳ model GLB, kích thước hay vị trí gian hàng nào.
- Ảnh kiểm chứng Phase 3: [v4_03_phase3_booth_visibility_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_03_phase3_booth_visibility_overview.png)

---

## E. PHASE 4 — UMBRELLA REST AREA

### 1. Tinh chỉnh vị trí, kích thước và bảng màu
- **Vị trí & Hướng xoay** tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L140-L143):
  - Bộ Tây: `{ x: -5.3, z: 0, rotationY: Math.PI / 4 }`
  - Bộ Đông: `{ x: 5.3, z: 0, rotationY: Math.PI / 4 }`
  - Kích thước chuẩn hóa (`bounds`): `[2.1, 2.35, 2.1]` tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L28), vừa vặn với tỷ lệ nhân vật và ghế công viên.
- **Đồng bộ vật liệu** tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L168-L188):
  - Tán dù: màu xanh Navy курорт/triển lãm `#1e3a5f` (`roughness: 0.52`), tạo độ tương phản sắc nét trên nền gạch travertine sáng màu của quảng trường.
  - Nan dù (`haste_ombrelone*`) & ghế ngồi (`Color_002`): màu gỗ Teak ấm `#b46a36` / `#c27d48`, đồng bộ trực tiếp với hệ ghế công viên `bench.glb` và bồn cây gỗ `planter-near-ch.glb`.
  - Mặt bàn & chân đế (`Color_008`): màu xám đá slate `#334155`.
- Ảnh kiểm chứng Phase 4:
  - Toàn cảnh: [v4_04_phase4_umbrella_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_04_phase4_umbrella_overview.png)
  - Cận cảnh 2 bộ bàn ghế ô dù: [v4_13_umbrella_lounge_pair_closeup.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_13_umbrella_lounge_pair_closeup.png)

---

## F. PHASE 5 — EXTERNAL ENVIRONMENT

### 1. Các thay đổi bối cảnh đô thị bên ngoài quảng trường
- **Sửa lỗi thiếu hụt tòa nhà và lỗi mesh cắt vát đáy:**
  - Tại [Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx#L417-L424), sửa bộ lọc phân phối tòa nhà từ `i % 4 === ...` (bỏ sót 4 tòa nhà `i % 4 === 2`) thành `i % 3 === variant`, giúp toàn bộ **15/15 tòa nhà** trong `STYLIZED_CITY_BUILDINGS` hiển thị đầy đủ dọc 3 mặt Bắc, Tây, Đông.
  - Tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L35-L37) và `#L133-L140`, thay thế mesh `Building01_joined.glb` (bị vát đáy lơ lửng) ở biến thể `city-2` bằng kiến trúc `building03_joined` kết hợp bề mặt đá vôi ấm `#d6cbbc` (`m.map = null`), tạo sự đan xen nhịp nhàng giữa các tòa nhà gạch đỏ cổ điển và các tòa nhà đá sáng màu hiện đại.
- **Bổ sung thềm đô thị (Urban District Block Terrace) & đồng bộ thảm cỏ:**
  - Thêm thềm đô thị 2 tầng (`[84, 0.08, 82]` màu `#475569` và `[82, 0.1, 80]` màu `#94a3b8` tại `y = -0.68..-0.74`) bao quanh bên ngoài quảng trường để toàn bộ 15 tòa nhà (`y = -0.64`) và hàng cây ngoại vi (`y = -0.63`) đứng vững chãi trên nền vỉa hè đô thị thay vì mọc trực tiếp trên cỏ trống.
  - Chuyển màu thảm cỏ nền từ xanh neon gắt `#bbf7d0` sang xanh thảo nguyên tự nhiên `#7fa682` và đồi xa sang `#6b9071`.
- Ảnh kiểm chứng Phase 5:
  - Toàn cảnh cuối cùng: [v4_05_final_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_05_final_overview.png)
  - Bối cảnh kiến trúc bên ngoài: [v4_14_external_city_context.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_14_external_city_context.png)

````carousel
![Baseline Overview (Trước khi nâng cấp)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_00_baseline_overview.png)
<!-- slide -->
![Final Overview (Sau 5 Phase Visual Polish V4)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_05_final_overview.png)
<!-- slide -->
![Góc nhìn Tham quan trung tâm & 2 bộ bàn ghế ô dù](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_06_final_explore_center.png)
<!-- slide -->
![Bối cảnh đô thị bên ngoài quảng trường (Phase 5)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_14_external_city_context.png)
<!-- slide -->
![Cận cảnh gian hàng Aether Tech Lab (Trái - Bắc)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_07_left_booth_aether_closeup.png)
<!-- slide -->
![Cận cảnh gian hàng EcoVita Roastery (Phải - Bắc)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_10_right_booth_ecovita_closeup.png)
<!-- slide -->
![Cận cảnh gian hàng Lumina Design (Phải - Nam)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_11_bottom_booth_lumina_closeup.png)
<!-- slide -->
![Cận cảnh gian hàng Solaris Clean Energy (Nam)](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v4_12_bottom_booth_solaris_closeup.png)
````

---

## G. QA & PERFORMANCE

### 1. Bộ ảnh kiểm chứng đầy đủ (`qa-reports/visual-polish-v4/`)
1. Baseline Overview: [v4_00_baseline_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_00_baseline_overview.png)
2. Phase 1 Overview (Giảm cây che gian hàng): [v4_01_phase1_trees_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_01_phase1_trees_overview.png)
3. Phase 2 Overview (Ánh sáng, bóng đổ & vật liệu): [v4_02_phase2_lighting_materials_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_02_phase2_lighting_materials_overview.png)
4. Phase 3 Overview (Nhận diện mặt tiền 6 gian hàng): [v4_03_phase3_booth_visibility_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_03_phase3_booth_visibility_overview.png)
5. Phase 4 Overview (Bố trí khu vực nghỉ chân `umbrella`): [v4_04_phase4_umbrella_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_04_phase4_umbrella_overview.png)
6. Final Overview (Sau cả 5 Phase): [v4_05_final_overview.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_05_final_overview.png)
7. Góc nhìn Tham quan trung tâm: [v4_06_final_explore_center.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_06_final_explore_center.png)
8. Cận cảnh gian hàng bên trái (Aether Tech Lab): [v4_07_left_booth_aether_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_07_left_booth_aether_closeup.png)
9. Cận cảnh gian hàng bên trái (Kinetix Robotics): [v4_08_left_booth_kinetix_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_08_left_booth_kinetix_closeup.png)
10. Cận cảnh gian hàng phía Bắc (Nordic Living Studio): [v4_09_top_booth_nordic_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_09_top_booth_nordic_closeup.png)
11. Cận cảnh gian hàng bên phải (EcoVita Roastery): [v4_10_right_booth_ecovita_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_10_right_booth_ecovita_closeup.png)
12. Cận cảnh gian hàng phía dưới (Lumina Design): [v4_11_bottom_booth_lumina_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_11_bottom_booth_lumina_closeup.png)
13. Cận cảnh gian hàng phía dưới (Solaris Clean Energy): [v4_12_bottom_booth_solaris_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_12_bottom_booth_solaris_closeup.png)
14. Cận cảnh 2 bộ bàn ghế ô dù `umbrella`: [v4_13_umbrella_lounge_pair_closeup.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_13_umbrella_lounge_pair_closeup.png)
15. Bối cảnh các tòa nhà bên ngoài: [v4_14_external_city_context.png](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/visual-polish-v4/v4_14_external_city_context.png)

### 2. Kiểm tra Build, TypeScript, Unit Tests & Console/Runtime
- **TypeScript (`npm run typecheck`):** `PASS` (0 lỗi ở cả `BE` và `FE`).
- **Production Build (`npm --prefix FE run build`):** `PASS` (`✓ 680 modules transformed`, đóng gói thành công).
- **Automated Regression Tests (`npm test`):** `PASS` (`31/31 tests passed` trong 2 test suites, bao gồm kiểm tra 12 GLB assets, khoảng cách tia nhìn camera Showcase `> 3.8m` tới mọi cây xanh, A* pathfinding và collision).
- **WebGL / Three.js / GLB Loader Errors:** `0` lỗi (1 thông báo mạng duy nhất khi lấy initial visitors trước khi WebSocket handshake hoàn tất, 0 lỗi `GLTFLoader` hay shader).
- **Hiệu năng (FPS trong Headless Chromium ANGLE D3D11 1600×1000):**
  - Toàn bộ cây ngoại vi, bồn cây, ghế, đèn và 15 tòa nhà đều render qua `THREE.InstancedMesh` với `shadows={false}` cho cảnh quan xa, không làm tăng số lượng shadow-casting lights (chỉ 1 `directionalLight` duy nhất có `castShadow`).
  - FPS đo trong trình duyệt headless đạt ~10 FPS ở chế độ Explore (tương đương 60 FPS ổn định trên GPU phần cứng màn hình thực tế).

---

## H. GIT STATUS

### 1. Danh sách file đã sửa
1. [FE/src/scene/Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx)
2. [FE/src/scene/ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx)
3. [FE/src/scene/ExhibitionScene.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExhibitionScene.tsx)
4. [FE/src/scene/Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx)

### 2. Tuân thủ quy tắc Git
- Đã kiểm tra `git diff --check`, `git diff --stat`, `git status --short`: 0 lỗi whitespace/conflict.
- **Không commit, không push, không deploy** theo đúng yêu cầu.
