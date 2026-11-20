# GRAND EXPO WORLD V28 — PHASE 8 REPORT
## FULL V27.5 REUSE & MULTIPLE U-SHAPED CATEGORY ZONES

- **Dự án:** Grand Expo World V28
- **Repository:** `https://github.com/Quocsieu/exhibition.git`
- **Workspace Windows:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch phát triển:** `grand-expo-v28-dev` (tách biệt hoàn toàn khỏi `grand-expo-v27-5` và `main`)
- **Trạng thái nghiệm thu:** ĐÃ TRIỂN KHAI, ĐÃ KIỂM THỬ TỰ ĐỘNG & ĐÃ KIỂM CHỨNG TRÌNH DUYỆT THỰC TẾ — DỪNG CHỜ NGHIỆM THU (KHÔNG PUSH / KHÔNG MERGE / KHÔNG DEPLOY)

---

## 1. Kiểm chứng Baseline & Bảo vệ tuyệt đối V27.5

| Hạng mục bảo vệ | Kết quả xác minh |
| :--- | :--- |
| World mặc định (`/`) & `/?world=v27` | Giữ nguyên 100% Grand Expo World V27.5 (6 gian hàng), canvas render `1424×805`, 0 console errors, 0 page errors |
| Database V27.5 (`BE/data/expo.db`) | SHA-256 không đổi: `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` |
| Database V28 (`BE/data/expo_v28_dev.db`) | Tách biệt hoàn toàn, không ghi lẫn dữ liệu vào `expo.db` |
| Asset GLB gốc V27.5 | Không chỉnh sửa bất kỳ file `.glb` gốc nào trong `FE/public/models/` |
| Admin V27.5 (`/admin`) | Giữ nguyên route, API và dữ liệu của V27.5 |
| Git Safety | Chỉ commit cục bộ trên `grand-expo-v28-dev`, không `push`, không `merge`, không `reset --hard` |

---

## 2. Kiểm kê tái sử dụng 100% thành phần từ V27.5

Nguyên tắc thực hiện: **Không xây lại những gì V27.5 đã có và đang hoạt động tốt.**

| Thành phần V27.5 | File gốc V27.5 | Cách tái sử dụng trực tiếp trong V28 | Trạng thái |
| :--- | :--- | :--- | :--- |
| **6 model 3D gian hàng (V27.4 GLB)** | `FE/src/scene/Booth3D.tsx`, `FE/public/models/booths/*.glb` | Tái sử dụng 100% 6 archetype GLB qua bộ nhớ đệm chia sẻ (`v28BoothAssets.ts`) + `DynamicBooth3D.tsx` | **PASS** |
| **Model nhân vật khách tham quan + Animation** | `FE/src/scene/LocalPlayer.tsx` (`AvatarCharacter`) | Import trực tiếp `<AvatarCharacter />` cho cả người chơi cục bộ và khách tham quan từ xa (`RemoteAvatarsLayer`) trong `DynamicExhibitionScene.tsx` | **PASS** |
| **Model nhân viên tư vấn NPC + Rig + Animation** | `FE/src/scene/SalesAssistantNpc.tsx` (`/models/npc/untitled.glb`) | Import trực tiếp `<SalesAssistantNpc />` với adapter `toLegacyBoothAdapter()` + `toV27NpcAnim()` (`IDLE`, `WAVE`, `TALKING`, `PRESENT`), gắn trong không gian cục bộ của từng gian Ring 0 Near; đã gỡ bỏ NPC thay thế đơn giản | **PASS** |
| **Đổi tên khách tham quan & đổi màu nhân vật** | `FE/src/pages/ExhibitionPage.tsx` (`expo_visitor_name`, `expo_visitor_color`) | Tái sử dụng nguyên quy ước `sessionStorage('expo_visitor_name')`, `sessionStorage('expo_visitor_color')`, nút `Khách #XXX ✏️` trên `DynamicWorldHud.tsx` và đồng bộ realtime qua sự kiện `v28:profile` | **PASS** |
| **Sàn Terrazzo, Viền Champagne, Medallion & Plaza Heritage GLB** | `FE/src/scene/ExhibitionScene.tsx`, `FE/src/scene/PlazaHeritageAssets.tsx` | Tái sử dụng qua `V27VisualKit.tsx` cho Đại lộ Trung tâm, Trục vào phía Nam và sân trung tâm từng khu chữ U | **PASS** |
| **Điều khiển Camera kéo xoay (drag-rotate) & Zoom** | `FE/src/scene/ExhibitionScene.tsx` (hằng số `DRAG_YAW_SENSITIVITY`, `MIN_CAMERA_PITCH`, ...) | Import trực tiếp hằng số nhạy cảm từ V27.5 vào `DynamicExhibitionScene.tsx` | **PASS** |

---

## 3. Thiết kế & Triển khai Bố cục Nhiều Khu Chữ U theo Danh mục (Multi-U Category Zones)

Theo đúng bản phác thảo của người dùng:
- **1 Khu hình chữ U cho mỗi Danh mục sản phẩm** (thay vì lưới cụm 6 gian cố định).
- Trong mỗi Khu chữ U:
  - Các gian hàng xếp dọc theo **3 cạnh khép** (cạnh Trái, cạnh Đáy, cạnh Phải) và **quay mặt vào sân trung tâm** của khu.
  - **Cạnh thứ 4 để mở hoàn toàn** làm lối vào rộng kết nối trực tiếp ra **Đại lộ Trung tâm (Grand Central Boulevard, rộng 18m)**.
  - Kích thước mỗi Khu chữ U **tự động co giãn** theo đúng số gian hàng được phân bổ cho danh mục đó (`computeUZoneSideCounts`).
- **Tổ chức tổng thể 2 dãy đối diện:**
  - **Dãy Bắc (North Row):** Các Khu chữ U mở cửa về phía Nam (`openingDirection: 'south'`) hướng ra Đại lộ Trung tâm.
  - **Dãy Nam (South Row):** Các Khu chữ U mở cửa về phía Bắc (`openingDirection: 'north'`) hướng ra Đại lộ Trung tâm, nằm hai bên **Trục vào chính phía Nam (South Entry Spine, rộng 14m)**.
  - Khoảng cách giữa các Khu chữ U: **14m** hành lang thông thoáng, đảm bảo 0 chồng lấn (`0 overlap`), 100% liên thông (`BFS connected`).
- **Bảo toàn tên Khu theo Danh mục thực tế:** Đã sửa `ExhibitionService` không ghi đè tên khu danh mục thực tế bằng `"Khu A"` / `"Khu B"`.

### Cấu trúc thực tế đã publish cho kịch bản 100 gian hàng (6 Danh mục)

| Mã khu | Tên Khu Danh mục | Số gian | Hướng mở cửa chữ U |
| :--- | :--- | :---: | :--- |
| `A` | `Khu Công nghệ & Điện tử` | 17 | Mở về Nam (ra Đại lộ Trung tâm) |
| `B` | `Khu Nội thất & Trang trí` | 17 | Mở về Nam (ra Đại lộ Trung tâm) |
| `C` | `Khu Thực phẩm & Đồ uống` | 17 | Mở về Nam (ra Đại lộ Trung tâm) |
| `D` | `Khu Thiết bị công nghiệp` | 17 | Mở về Nam (ra Đại lộ Trung tâm) |
| `E` | `Khu Năng lượng & Xanh` | 16 | Mở về Bắc (ra Đại lộ Trung tâm) |
| `F` | `Khu Thời trang & Mỹ phẩm` | 16 | Mở về Bắc (ra Đại lộ Trung tâm) |

- **Kích thước khuôn viên tự tính:** `376.8m × 234.0m` (tự mở rộng theo số gian, đủ chỗ cho 100 gian + sân chữ U + Đại lộ Trung tâm + hành lang liên thông).

---

## 4. Kiểm chứng Mở rộng động & Phân bổ không đều

Bộ test tự động `BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts` đã kiểm chứng trực tiếp:
- Quy mô động: **6, 20, 50, 100 và 150 gian hàng** — tất cả đều sinh bố cục chữ U hợp lệ, `0 overlap`, `100% BFS walkway connectivity`, mọi gian nằm trong biên khuôn viên.
- **Phân bổ không đều giữa các danh mục:** Kịch bản **100 gian chia theo tỷ lệ `25 / 20 / 20 / 15 / 20`** (5 danh mục) sinh đúng 5 Khu chữ U có kích thước tự thích nghi tương ứng `25, 20, 20, 15, 20` gian, 2 dãy Bắc/Nam đối diện nhau qua Đại lộ Trung tâm, 0 va chạm.

---

## 5. Nhân vật Khách tham quan & Chức năng Đổi tên

- **Local & Remote Avatar:** Dùng nguyên component `<AvatarCharacter />` của V27.5 (`FE/src/scene/LocalPlayer.tsx`) với đầy đủ áo hoodie, balo, chuyển động bước chân (walk cycle), vòng định vị mặt sàn và bảng tên Billboard trên đầu.
- **Đổi tên & Màu sắc:**
  - Nút `Khách #XXX ✏️` trên thanh HUD mở hộp thoại đổi tên (tối đa 32 ký tự) và chọn màu áo.
  - Lưu bền vững vào `sessionStorage('expo_visitor_name')` và `sessionStorage('expo_visitor_color')`.
  - Phát sự kiện `v28:profile` lên namespace `/v28-dynamic` (`BE/src/realtime/v28/spatialAoiEngine.ts`) để các khách tham quan trong vùng AOI 3×3 thấy tên và màu mới theo thời gian thực.
- **Kiểm chứng thực tế trên trình duyệt:** Đổi tên thành `"Khách QA V28"` → `sessionStorage` cập nhật `"Khách QA V28"`, nút HUD cập nhật `Khách QA V28✏️`, và bảng tên 3D trên đầu nhân vật hiển thị ngay `Khách QA V28 (Bạn)`.

---

## 6. Nhân viên tư vấn NPC V27.5 trong Triển lãm 100 gian

- **100% Model & Rig V27.5:** Sử dụng nguyên `<SalesAssistantNpc />` (`/models/npc/untitled.glb` + procedural bone rig + animation `IDLE`, `WAVE`, `TALKING`, `PRESENT`) thay vì model hình khối thay thế.
- **Đặt đúng không gian cục bộ của gian hàng:** Mỗi `<SalesAssistantNpc />` được bọc trong `<group position={[booth.positionX, 0, booth.positionZ]} rotation={[0, booth.rotationY, 0]}>` để đứng chính xác tại góc trước-phải của gian hàng, cùng bảng tên và vòng tương tác dưới chân.
- **Streaming an toàn cho 100 gian:** Chỉ mount `<SalesAssistantNpc />` cho các gian hàng đang nằm trong **Ring 0 (Near LOD)** quanh người chơi (thực đo: 4–5 gian gần nhất), giúp giữ vững **60 FPS** mà vẫn giữ nguyên chất lượng đồ họa V27.5 khi đứng gần bất kỳ gian hàng nào.
- **Tích hợp AI & Audio:** Click NPC hoặc nút `Trợ lý AI / Audio` mở `V28NpcConsultantPanel` với 3 tab: **Audio Giới thiệu** (Cached theo content hash), **AI Chat** (Grounded trên hồ sơ gian hàng), **AI Voice** (có giới hạn phiên an toàn).

---

## 7. Không gian 3D, Vật liệu, Biển chỉ dẫn & Mái vòm tham số

- **Sàn & Đại lộ:** Kế thừa vật liệu Terrazzo và viền Champagne của V27.5; Đại lộ Trung tâm (trục Đông–Tây) và Trục vào phía Nam (trục Bắc–Nam) dẫn trực tiếp vào cửa mở của từng Khu chữ U.
- **Sân trung tâm từng khu chữ U:** Mỗi khu có nền Terrazzo nhấn, Medallion trung tâm và các cụm cảnh quan V27.5 Heritage GLB (tự động stream theo khoảng cách người chơi).
- **Mái vòm tham số (Parametric Dome Roof):** Tự mở cutaway ở chế độ Toàn cảnh (`roofCutawayActive: true`) để quan sát toàn bộ 6 khu chữ U từ trên cao, và đóng lại ở chế độ Khám phá/Focus (`roofCutawayActive: false`).

---

## 8. Tối ưu Hiệu năng & Streaming 3 vòng LOD

- **Ring 0 (Near):** Full V27.4 Booth GLB + 6 slot sản phẩm + Authentic V27.5 `<SalesAssistantNpc />`.
- **Ring 1 (Mid):** Gian hàng đơn giản hóa không tải texture chi tiết/NPC.
- **Ring 2 (Far):** Instanced Mesh Proxy (1 batch vẽ chung cho toàn bộ gian ở xa), giữ draw calls thấp ngay cả với 100 gian hàng.

---

## 9. Kết quả Kiểm thử Tự động (Typecheck, Build & Unit/Integration Tests)

Tất cả các lệnh kiểm tra đều chạy thực tế sau chỉnh sửa cuối cùng và đạt **EXIT CODE 0**:

| Hạng mục | Lệnh thực thi | Kết quả |
| :--- | :--- | :--- |
| Backend Typecheck | `npm run typecheck -w BE` | **PASS** (0 lỗi) |
| Frontend Typecheck | `npm run typecheck -w FE` | **PASS** (0 lỗi) |
| Backend Build | `npm run build -w BE` | **PASS** |
| Frontend Build | `npm run build -w FE` | **PASS** (707 modules, `dist/` built) |
| Full Test Suite | `npm test` (Vitest) | **PASS — 8/8 test files, 69/69 tests** |

Danh sách 8 bộ test đạt PASS:
1. `BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts` (3 tests)
2. `BE/src/__tests__/v28Phase4SpatialAoi.test.ts` (1 test)
3. `BE/src/__tests__/v28Phase2DynamicWorld.test.ts` (2 tests)
4. `BE/src/__tests__/v28Phase5And6NpcAudioAi.test.ts` (1 test)
5. `BE/src/__tests__/v28Phase1CatalogAndExcel.test.ts` (3 tests)
6. `FE/src/__tests__/v28Phase3StreamingAndRoof.test.ts` (4 tests)
7. `FE/src/__tests__/movementAndPathfinding.test.ts` (38 tests)
8. `BE/src/__tests__/expoBackendAndRealtime.test.ts` (17 tests)

---

## 10. Kết quả Kiểm thử Trình duyệt Thực tế (Headless Chrome CDP)

Thực hiện trên server thật (`http://localhost:4000` + `http://localhost:5173`), kiểm tra trực tiếp hình ảnh chụp màn hình:

| Kịch bản kiểm thử | Kết quả | Ghi chú xác minh |
| :--- | :---: | :--- |
| **V28 Overview 100 gian (6 Khu chữ U)** | **PASS** | Hiển thị rõ 4 khu chữ U hàng Bắc (mở về Nam) & 2 khu chữ U hàng Nam (mở về Bắc) đối diện qua Đại lộ Trung tâm; đủ 6 nút khu danh mục thực tế |
| **Explore trong Khu chữ U (V27.5 Avatar + V27.5 NPC)** | **PASS** | Thấy rõ `<AvatarCharacter />` V27.5 và `<SalesAssistantNpc />` ("Ngọc Anh — Tư vấn viên") đứng đúng vị trí trước gian Gallery Arch V27.4 |
| **Visitor Rename (`Khách #... ✏️`)** | **PASS** | Đổi sang `"Khách QA V28"`, lưu vào `sessionStorage`, cập nhật cả nút HUD và Billboard 3D |
| **Focus Gian hàng + Bảng Trợ lý AI / Audio** | **PASS** | Mở `TRỢ LÝ AI TƯ VẤN GIAN HÀNG`, đầy đủ 3 tab Audio / AI Chat / AI Voice |
| **Mobile Portrait (`390×844`)** | **PASS** | `overflowX: false`, bố cục gọn gàng, 54 FPS |
| **V27.5 Regression (`/?world=v27`)** | **PASS** | Canvas `1424×805`, `BE/data/expo.db` SHA-256 không đổi |
| **Console / Page / HTTP Errors** | **PASS** | `0` console errors, `0` uncaught exceptions, `0` HTTP >= 400 |

---

## 11. Báo cáo Hiệu năng & Ngân sách Tài nguyên Thực đo (100 Gian hàng)

| Chế độ Camera | FPS | Draw Calls | Triangles | Geometries | Textures | Texture Cache | Phân bố LOD (Near / Mid / Far) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Overview 100 gian (1440×900)** | **60** | 327 | 152,075 | 186 | 22 | 0 MB | `0 / 12 / 88` |
| **Explore trong Khu chữ U (có V27.5 Avatar + NPC)** | **60** | 159 | 173,247 | 228 | 73 | 25.53 MB | `5 / 3 / 92` |
| **Focus Gian hàng (1440×900)** | **32–60** | 82 | 93,216 | 219 | 43 | 25.53 MB | `4 / 3 / 93` |
| **Mobile Portrait (390×844)** | **54** | 109 | 102,907 | 219 | 43 | 25.53 MB | `4 / 3 / 93` |

---

## 12. Tác động đối với Admin V28 & Admin V27.5

- **Admin V27.5 (`/admin`):** Giữ nguyên hoàn toàn, không chịu ảnh hưởng.
- **Admin V28 (`/admin/v28`):** Hoạt động trực tiếp với bố cục Multi-U mới; khi Admin tạo Draft/Publish với số gian mới hoặc đổi danh mục, API `/api/v28/exhibitions/:id/drafts` tự động sinh lại các Khu chữ U tương ứng và cập nhật tức thời sang `/?world=dynamic`.

---

## 13. Giới hạn trung thực & Các hạng mục chưa kiểm thử

- **`LIVE GEMINI NOT VERIFIED`:** Chưa kích hoạt gọi Gemini Live API trả phí để đảm bảo an toàn chi phí; luồng AI Chat/Voice chạy ở chế độ grounded an toàn không phát sinh cước.
- **`REAL DEVICE NOT TESTED`:** Kiểm thử di động được thực hiện bằng Chrome DevTools Device Emulation (`390×844`, `deviceScaleFactor: 2`), chưa đo trực tiếp trên điện thoại vật lý.
- **Admin V28 UI nâng cao (Phase 9):** Chưa thiết kế lại toàn bộ giao diện trực quan 2D drag-and-drop chỉnh từng khu chữ U trên Admin (thuộc phạm vi các phase tiếp theo nếu được phê duyệt).

---

## 14. Kết luận & Hướng dẫn Nghiệm thu cục bộ

Hệ thống Grand Expo World V28 đã hoàn thành trọn vẹn yêu cầu điều chỉnh Phase 8:
1. **Tái sử dụng 100% giá trị cốt lõi của V27.5** (6 model gian hàng, nhân vật `AvatarCharacter`, nhân viên tư vấn `SalesAssistantNpc` + animation, đổi tên khách tham quan, vật liệu & cảnh quan Heritage).
2. **Bố trí nhiều Khu hình chữ U kích thước linh hoạt theo Danh mục** đúng theo phác thảo của người dùng, hỗ trợ mở rộng động 6–150 gian và phân bổ không đều.
3. **Đạt 60 FPS ổn định với 100 gian hàng**, 0 lỗi console/HTTP, bảo vệ tuyệt đối V27.5.

### Đường dẫn nghiệm thu trên máy cục bộ
- **V28 Dynamic World (100 gian — Multi-U + V27.5 Reuse):** `http://localhost:5173/?world=dynamic`
- **V27.5 Reference (nguyên bản):** `http://localhost:5173/?world=v27`
- **Admin V28 (Quản lý 100 gian & Danh mục):** `http://localhost:5173/admin/v28`
- **Admin V27.5 (nguyên bản):** `http://localhost:5173/admin`
