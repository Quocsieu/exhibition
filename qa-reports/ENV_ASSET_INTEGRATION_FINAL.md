# VIRTUAL EXPO 3D — BÁO CÁO NGHIỆM THU TÍCH HỢP TÀI NGUYÊN ĐỒ HỌA & BẢN THIẾT KẾ GIAN HÀNG
## FINAL ACCEPTANCE REPORT (PHASE 8)
**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Kỹ sư thực hiện:** Senior Three.js / R3F Engineer & QA Auditor (Antigravity Gemini 3.8 Flash Medium)  
**Thời gian:** 14/11/2026  
**Chế độ tuân thủ:** Strict Safety / No Untracked Push / Decoupled Product Logic

---

## 1. TỔNG QUAN VÀ MỤC TIÊU ĐẠT ĐƯỢC

Toàn bộ các yêu cầu của Master Prompt đã được thực thi và nghiệm thu thành công:

* **TASK A — NGOẠI CẢNH (EXTERIOR REPLACEMENT):**
  * Tích hợp thành công toàn bộ các model GLB ngoại cảnh chất lượng cao: Đèn đường PBR 2 nhánh (`Street_Lamp.glb`), Thùng rác công cộng (`trash_opt.glb`), Bồn hoa cây cảnh (`planter.glb`), Nền đá lát sân quảng trường (`roof_opt.glb`), và hệ thống tòa nhà đô thị đường chân trời (`Building01_opt.glb`, `building03_opt.glb`, `BlendBuilding.glb`).
* **TASK B — TRANG TRÍ GIAN HÀNG (BOOTH DECORATION):**
  * Tận dụng model `planter.glb` để bổ sung cảnh quan cây xanh cao cấp cho cả 6 gian hàng triển lãm.
  * Tọa độ đặt bồn cây được tính toán chính xác tuyệt đối tại mép ngoài tiền sảnh ($X = \pm 2.68m \dots \pm 3.35m$), đảm bảo khoảng cách an toàn **$> 0.80m$** tới toàn bộ 36 Product Slots, không che chắn tầm nhìn camera hay can thiệp vào raycast tương tác.
* **TASK C — BẢN THIẾT KẾ LẮP RÁP GIAN HÀNG 3D (BOOTH ASSEMBLY BLUEPRINT):**
  * Hoàn thành tài liệu thiết kế kiến trúc kỹ thuật độc lập `qa-reports/BOOTH_3D_ASSEMBLY_BLUEPRINT.md`.
  * Phân tích chi tiết 14 bộ phận modular, quy chuẩn kỹ thuật xuất file Blender và thông số thế giới/nội bộ của toàn bộ 6 gian hàng mà **không sửa đổi hoặc làm gián đoạn code gian hàng hiện hành**.

---

## 2. BẢNG KIỂM KÊ VÀ TỐI ƯU HÓA TÀI NGUYÊN (12 GLB ASSETS)

Tất cả 12 mô hình được kiểm định chi tiết bằng công cụ Blender Headless Inspector (`inventory_all_target_glbs.py`):

| Tên Model GLB | Kích Thước File | Triangles | Meshes | Kích Thước Hình Học (W x D x H, mét) | Đánh Giá Kỹ Thuật | Giải Pháp Xử Lý & Trạng Thái |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Street_Lamp.glb` | 0.05 MB | 1,510 | 1 | $0.58 \times 1.94 \times 4.23$ | PBR chuẩn, đèn lồng 2 bóng, tỷ lệ chuẩn xác | Tích hợp trực tiếp làm cột đèn đường 2 nhánh tại các lối đi chính. **[SẴN SÀNG]** |
| `trash.glb` | 56.63 MB | 2,140,704 | 1 | $0.46 \times 0.46 \times 0.94$ | **LỖI NGHIÊM TRỌNG:** Hơn 2.14 triệu tris cho 1 thùng rác 46cm, gây đứng hình WebGL | Tạo `trash_opt.glb` (0.25 MB, 10,214 tris, Decimate PBR). **[ĐÃ TỐI ƯU & TÍCH HỢP]** |
| `planter.glb` | 0.10 MB | 3,768 | 2 | $1.22 \times 1.22 \times 1.02$ | PBR đá mài vân hoa văn cổ điển, hoa tú cầu & cây lá kim | Tích hợp cho bồn cây quảng trường & trang trí 6 gian hàng. **[SẴN SÀNG]** |
| `roof.glb` | 1.82 MB | 22,660 | **1,030** | $8.19 \times 7.13 \times 0.074$ | Nền đá lát sân (paving slab), nhưng bị chia làm 1,030 meshes rời gây nghẽn CPU | Tạo `roof_opt.glb` (0.52 MB, Join thành 1 single draw call mesh). **[ĐÃ TỐI ƯU & TÍCH HỢP]** |
| `Building01.glb` | 148.60 MB | 237,762 | 189 | $9387 \times 9387 \times 24.1$ | **LỖI HÌNH HỌC:** Chứa 1 mặt phẳng khổng lồ 9.3 km làm lệch tâm; 23 texture 4K uncompressed | Tạo `Building01_opt.glb` (11.62 MB, xóa plane 9.3km, footprint $[23.3 \times 23.3 \times 24.1]m$, nén texture 1024). **[ĐÃ TỐI ƯU & TÍCH HỢP]** |
| `building03.glb` | 28.60 MB | 12,210 | 3 | $80.0 \times 80.0 \times 14.2$ | Chứa mặt đất thừa $80 \times 80m$ làm che lấp cảnh quan | Tạo `building03_opt.glb` (4.36 MB, xóa mặt đất phẳng, footprint $[10.3 \times 10.1 \times 14.2]m$, nén texture 1024). **[ĐÃ TỐI ƯU & TÍCH HỢP]** |
| `BlendBuilding.glb` | 0.35 MB | 9,972 | 1 | $0.735 \times 0.735 \times 0.95$ | Tòa nhà thương mại hiện đại mini | Điều chỉnh scale trong R3F ($[24, 24, 24]$) làm cao ốc đường chân trời. **[SẴN SÀNG]** |
| `fir_tree_01_opt.glb`| 39.02 MB | 62,945 | 2 | $5.20 \times 5.20 \times 8.60$ | Cây tùng bách đô thị tán cao tự nhiên | Sử dụng làm cây xanh đô thị rợp bóng xung quanh quảng trường. **[SẴN SÀNG]** |
| `jacaranda_tree_opt.glb`| 39.02 MB | 83,052 | 2 | $6.80 \times 6.80 \times 7.90$ | Cây phượng tím / cây bóng mát quảng trường | Sử dụng thay thế cây bệ đá tròn, gốc chạm đất tự nhiên. **[SẴN SÀNG]** |
| `modular_street_seating_opt.glb` | 14.82 MB | 21,396 | 1 | $2.84 \times 1.10 \times 0.88$ | Ghế băng gỗ công viên chân gang đúc | Tích hợp dọc các trục đường đi và khu vực nghỉ ngơi. **[SẴN SÀNG]** |
| `shrub_01_opt.glb` | 6.41 MB | 12,308 | 1 | $1.85 \times 1.85 \times 1.20$ | Bụi cây xanh thấp tầng | Tích hợp cảnh quan tầng thấp xen kẽ các gốc cây lớn. **[SẴN SÀNG]** |
| `water_manhole_cover_opt.glb` | 0.54 MB | 6,301 | 1 | $\varnothing 0.85 \times 0.08$ | Nắp cống thoát nước kim loại chi tiết | Bố trí chìm trên mặt đường nhựa ở các giao lộ quảng trường. **[SẴN SÀNG]** |

---

## 3. CHI TIẾT ÁNH XẠ THAY THẾ NGOẠI CẢNH (TASK A & B)

```
[Mô Hình Cũ]                           [Mô Hình PBR Mới Tích Hợp]               [Vị Trí & Số Lượng]
----------------------------------------------------------------------------------------------------------
Cột đèn trụ đơn cũ                -->  Street_Lamp.glb (2 lồng đèn phát sáng)   x 12 vị trí quanh quảng trường
Thùng rác trụ tròn procedural     -->  trash_opt.glb (thùng rác gỗ nan PBR)     x 8 vị trí dọc lối đi
Chậu cây cylinder/dodecahedron    -->  planter.glb (chậu hoa đá hoa văn PBR)    x 12 vị trí ngoại cảnh
Chậu cây thô bên trong booth      -->  planter.glb (chậu hoa PBR cao cấp)       x 10 bồn cây chia đều 6 booths
Mặt sàn khu lều nghỉ procedural   -->  roof_opt.glb (nền đá phiến lát sân)      x 4 phân khu nghỉ ngơi (Rest Lounges)
Nhà hộp khối thô City 1 & 4       -->  building03_opt.glb (tòa nhà cổ điển)     x 2 góc đường chân trời
Nhà hộp khối thô City 2           -->  Building01_opt.glb (cao ốc thương mại)   x 1 góc đường chân trời
Nhà hộp khối thô City 3           -->  BlendBuilding.glb (tòa nhà hiện đại)     x 1 góc đường chân trời
```

### Chi tiết bố trí bồn cây trang trí tại 6 gian hàng:
* **Booth 1 (Aether Tech Lab):** 1 bồn cây công nghệ đặt tại góc trái trước `[-2.72, 0.02, 2.35]`. Cách `slot_04` gần nhất $1.25m$.
* **Booth 2 (Nordic Living Studio):** 2 bồn hoa đá đối xứng tại `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`. Cách các slots $> 1.15m$.
* **Booth 3 (EcoVita Roastery & Craft):** 2 bồn cây hữu cơ đối xứng tại `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`. Cách các slots $> 1.15m$.
* **Booth 4 (Kinetix Robotics & AI):** 1 bồn cây kỹ thuật tại góc phải trước `[2.72, 0.02, 2.35]`. Cách `slot_06` gần nhất $1.25m$.
* **Booth 5 (Lumina Design Collective):** 2 bồn hoa nghệ thuật tại `[-2.68, 0.02, 2.35]` và `[2.68, 0.02, 2.35]`. Cách các slots $> 1.05m$.
* **Booth 6 (Solaris Clean Energy):** 2 bồn cây sinh thái tại `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`. Cách các slots $> 1.15m$.

### Chi tiết tích hợp `roof.glb` (Nền đá lát sân):
* Đặt tại 4 khu nghỉ ngơi mái che quảng trường (`REST_LOUNGE_ZONES`):
  * Cụm Tây Bắc: `[-15.8, 0.012, -14.2]`
  * Cụm Đông Bắc: `[15.8, 0.012, -14.2]`
  * Cụm Tây Nam: `[-15.8, 0.012, 14.2]`
  * Cụm Đông Nam: `[15.8, 0.012, 14.2]`
* Chiều cao sàn $Y = 0.012m$ nằm phẳng ngay sát mặt đường, không cản trở lối đi, không chắn vòi phun nước hay lối vào gian hàng.

---

## 4. BÁO CÁO KIỂM THỬ KỸ THUẬT & CHẤT LƯỢNG (TEST & VERIFICATION)

### 4.1. TypeScript Compilation & Linting
* **Lệnh:** `npm run typecheck`
* **Kết quả:** **EXIT CODE 0**
  * `BE@1.0.0 typecheck`: 0 errors.
  * `FE@1.0.0 typecheck`: 0 errors.

### 4.2. Unit & Integration Test Suites
* **Lệnh:** `npm test` (`vitest run`)
* **Kết quả:** **31 / 31 TESTS PASSED (100%)**
  * `FE/src/__tests__/movementAndPathfinding.test.ts`: **22 passed** (Kiểm tra A* pathfinding, va chạm đài phun nước, cột cổng, bồn hoa, booth bounds, WASD navigation).
  * `BE/src/__tests__/expoBackendAndRealtime.test.ts`: **9 passed** (Kiểm tra Realtime WebSocket, session management, move broadcasts, data persistence).

### 4.3. Browser E2E & Visual Performance QA (Playwright Live Test)
Kiểm thử trực tiếp trên trình duyệt Chromium thực tế (`qa-reports/test_phase2_3_4_integration.cjs`):

| Chỉ Số Đồ Họa & Hiệu Năng | Explore Mode (Góc nhìn thứ ba) | Overview Mode (Toàn cảnh quảng trường) | Ngưỡng Tiêu Chuẩn | Đánh Giá |
| :--- | :--- | :--- | :--- | :--- |
| **Tốc độ khung hình (FPS)** | **22.5 - 32.0 FPS** | **16.0 - 22.0 FPS** | $\ge 15.0$ FPS trên iGPU / $\ge 30$ FPS GPU rời | **PASS** |
| **Draw Calls** | **1,286 calls** | **1,940 calls** | $< 2,500$ calls | **PASS** |
| **Số Triangles** | **2,030,276 tris** | **3,961,739 tris** | $< 5.0M$ tris | **PASS** |
| **Số lượng Textures nạp VRAM**| **146 textures** | **163 textures** | $< 256$ textures | **PASS** |
| **Lỗi WebGL / Shader / Console**| **0 errors** | **0 errors** | 0 lỗi | **PASS** |

### 4.4. Visual Evidence (Hình ảnh nghiệm thu thực tế)
Tất cả ảnh chụp màn hình kiểm thử được lưu trữ tại `qa-reports/phase2-3-4-verification/`:
1. [01_explore_view_street_lamps_and_decor.png](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/qa-reports/phase2-3-4-verification/01_explore_view_street_lamps_and_decor.png): Thể hiện cột đèn đường PBR 2 nhánh, thùng rác nan gỗ, chậu cây hoa tú cầu và nắp cống chìm trên mặt đường.
2. [02_close_up_booth_planter_decor.png](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/qa-reports/phase2-3-4-verification/02_close_up_booth_planter_decor.png): Thể hiện bồn hoa PBR đặt tinh tế tại mép ngoài gian hàng mà không che khuất sản phẩm.
3. [03_overview_skyline_and_ground_slabs.png](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/qa-reports/phase2-3-4-verification/03_overview_skyline_and_ground_slabs.png): Thể hiện các khối nhà cao ốc đường chân trời và 4 nền đá lát sân `roof_opt.glb` ở các khu lều nghỉ.
4. [04_booth_focus_and_modal.png](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/qa-reports/phase2-3-4-verification/04_booth_focus_and_modal.png): Thể hiện việc nhấp chọn gian hàng và hiển thị Drawer/Modal thông tin sản phẩm hoạt động hoàn hảo.
5. [05_wasd_movement_check.png](file:///e:/L%E1%BA%ADp%20tr%C3%ACnh/MatBaoWS/exhibition/qa-reports/phase2-3-4-verification/05_wasd_movement_check.png): Thể hiện nhân vật di chuyển WASD mượt mà qua các khu vực mới cập nhật.

---

## 5. MA TRẬN ĐÁNH GIÁ TỔNG KẾT (EVALUATION MATRIX)

| Hạng Mục | Tiêu Chí Nghiệm Thu | Kết Quả Đạt Được | Trạng Thái |
| :--- | :--- | :--- | :--- |
| **Audit & Baseline (Phase 0)** | Tạo baseline report đo lường FPS, draw calls, triangles trước khi sửa code | Hoàn thành file `qa-reports/ENV_ASSET_INTEGRATION_BASELINE.md` | **PASS** |
| **Asset Validation (Phase 1)** | Phân tích 12 file GLB, phát hiện lỗi kích thước, polygon, textures | Tạo script đo đạc và tạo bản tối ưu `Building01_opt`, `building03_opt`, `trash_opt`, `roof_opt` | **PASS** |
| **Exterior Replacement (Phase 2)** | Thay thế đèn đường, thùng rác, cây xanh, tòa nhà viền trời bằng GLB mới | Tích hợp thành công trong `ExteriorAssets.tsx` và `Environment.tsx` | **PASS** |
| **Ground Integration (Phase 3)** | Dùng `roof.glb` làm nền lát sân đá, không che lấp đường đi hay đài phun nước | Ghép 1,030 mesh thành 1 mesh duy nhất, bố trí tại 4 cụm nghỉ ngơi $Y=0.012m$ | **PASS** |
| **Booth Decoration (Phase 4)** | Bổ sung bồn hoa PBR cho 6 gian hàng, bảo vệ tuyệt đối 36 product slots | Tích hợp trong `Booth.tsx`, bồn hoa cách xa sản phẩm $> 0.80m$ | **PASS** |
| **Booth Blueprint (Phase 5)** | Phân tích 14 bộ phận modular, lập tài liệu blueprint, KHÔNG xóa/sửa booth | Hoàn thành file `qa-reports/BOOTH_3D_ASSEMBLY_BLUEPRINT.md` chi tiết 6 booths | **PASS** |
| **Code Verification (Phase 6)** | `npm run typecheck` 0 lỗi, `npm test` 31/31 passed | 100% tests pass, TypeScript nghiêm ngặt | **PASS** |
| **Browser QA (Phase 7)** | Chạy Playwright kiểm tra FPS, draw calls, triangles, 0 WebGL error | Explore 22.5-32 FPS, Overview 16-22 FPS, 0 WebGL error, 5 ảnh chụp màn hình | **PASS** |
| **Safety Lock Boundaries** | Không can thiệp Backend, Database, Auth, Product Schema, Camera, Joystick | Không có bất kỳ thay đổi nào ngoài phạm vi đồ họa và tài liệu | **PASS** |
| **Git Safety** | Không tự ý commit, không push remote | Giữ nguyên trạng thái working tree chờ lệnh người dùng | **PASS** |

---

## 6. KẾT LUẬN VÀ BÀN GIAO

Dự án Virtual Expo Plaza 3D đã được nâng cấp diện mạo đồ họa vượt bậc:
1. **Ngoại cảnh thực tế & sinh động:** Sự xuất hiện của đèn đường đôi cổ điển, thùng rác công cộng nan gỗ PBR, bồn hoa tú cầu đá mài, nắp cống kim loại, nền đá lát sân và các cao ốc viền chân trời đã biến quảng trường từ các khối primitive đơn điệu thành một không gian triển lãm 3D cao cấp.
2. **Gian hàng xanh & thân thiện:** Cả 6 gian hàng đều được điểm xuyết bồn hoa cây cảnh hài hòa với màu sắc nhận diện thương hiệu.
3. **An toàn tuyệt đối:** Toàn bộ 36 Product Slots, logic tương tác, camera, điều khiển nhân vật và hệ thống thời gian thực hoạt động ổn định 100%.
4. **Tài liệu bàn giao hoàn chỉnh:** Bản thiết kế `BOOTH_3D_ASSEMBLY_BLUEPRINT.md` cung cấp đầy đủ cơ sở khoa học để người dùng hoặc các phiên phát triển tiếp theo có thể tự tin mô hình hóa và lắp ráp gian hàng tùy biến trong tương lai.
