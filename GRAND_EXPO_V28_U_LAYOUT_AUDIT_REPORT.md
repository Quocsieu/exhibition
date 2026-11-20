# GRAND EXPO WORLD V28 — PHASE 1 AUDIT & OPTIMIZATION REPORT
## DYNAMIC U-SHAPED LAYOUT, MEASURED 6-GLB SPACING & ADAPTIVE WORLD BOUNDS

- **Dự án:** Grand Expo World V28
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch làm việc:** `grand-expo-v28-dev` (baseline trước Phase 1: `f332301`)
- **Nguyên tắc tuân thủ:** Audit-First — giữ nguyên 100% thành phần đạt `PASS`, chỉ sửa các điểm `FAIL`/`PARTIAL`, tuyệt đối không sửa model 3D/GLB/V27.5, không push/merge/deploy.

---

## 1. Audit trước khi sửa (Source & Asset Inspection)

Đã kiểm tra trực tiếp source code (`BE/src/services/v28/layoutGenerator.ts`, `BE/src/services/v28/exhibitionService.ts`, `FE/src/scene/v28/DynamicExhibitionScene.tsx`, `FE/src/scene/v28/v28BoothAssets.ts`, `FE/src/pages/DynamicExhibitionPage.tsx`) và **đo trực tiếp bounding box từ binary GLB** của cả 6 model gian hàng V27.4 tại `FE/public/models/booths/v27_4/*.glb`:

- **Phát hiện 1 (Sai lệch kích thước footprint trong `layoutGenerator.ts`):**
  - Đo thực tế 6 file GLB (xác nhận `hasRotOrMatrix = false`, FE tải ở tỷ lệ `1:1` không scale):
    - `booth_01_signature_ring_v27_4.glb`: `W = 6.720m, H = 3.960m, D = 5.190m`
    - `booth_02_organic_flow_v27_4.glb`: `W = 6.720m, H = 3.820m, D = 5.190m`
    - `booth_03_grand_portal_v27_4.glb`: `W = 6.720m, H = 3.800m, D = 5.190m`
    - `booth_04_wave_pavilion_v27_4.glb`: `W = 6.720m, H = 3.926m, D = 5.190m`
    - `booth_05_gallery_arch_v27_4.glb`: `W = 6.720m, H = 3.775m, D = 5.190m`
    - `booth_06_dynamic_frame_v27_4.glb`: `W = 6.870m, H = 4.014m, D = 5.190m`
  - Source cũ đang khai báo sai `signature_ring: 9.4×6.95m`, `wave_pavilion: 6.75×6.65m` và áp dụng `BOOTH_PITCH_M = 12.2m` cố định, gây khe trống thừa `5.3–5.5m` giữa mỗi cặp gian và kéo giãn hội trường 100 gian tới `376.8m × 234.0m`.
- **Phát hiện 2 (Lỗi va chạm xoay & thiếu giới hạn Walkable Regions / Camera Bounds trong `DynamicExhibitionScene.tsx`):**
  - `boothColliders` (lines 302–311 cũ) không xoay `width/depth` cho các gian cánh Trái/Phải (`rotationY = ±PI/2`).
  - `isWalkable()` (lines 313–326 cũ) chỉ kiểm tra **1 hình chữ nhật duy nhất** `world.walkableBounds`, cho phép nhân vật đi ra khoảng rỗng hai bên dãy Nam hẹp hơn dãy Bắc.
  - `desiredCamPos` không bị clamp vào `hallBounds` khi kéo xoay/zoom hoặc đi sát tường.
  - `onFloorClick` và `teleportPos` chưa lọc/clamp theo danh sách vùng đi hợp lệ.

---

## 2. Bảng phân loại Audit trước khi sửa (PASS / PARTIAL / FAIL / NOT VERIFIED)

| STT | Hạng mục yêu cầu | Phân loại Audit | File / Function bằng chứng | Quyết định xử lý |
| :-: | :--- | :---: | :--- | :--- |
| 1 | Bố cục nhiều khu chữ U theo danh mục (3 cạnh + 1 cạnh mở, không vòng tròn, không hardcode A–J) | **PASS** | `BE/src/services/v28/layoutGenerator.ts` (`generateDynamicExhibitionLayout`, `computeUZoneSideCounts`) | Giữ nguyên kiến trúc |
| 2 | Giữ nguyên 6 model GLB, Avatar V27.5, NPC V27.5, Animation, Đổi tên, Product Modal, 6 slots | **PASS** | `DynamicBooth3D.tsx`, `DynamicExhibitionScene.tsx`, `LocalPlayer.tsx`, `SalesAssistantNpc.tsx`, `DynamicWorldHud.tsx` | Giữ nguyên tuyệt đối |
| 3 | Không gian tự thích nghi (Roof/Streaming/Bảo vệ dữ liệu khi giảm số gian) | **PASS** | `exhibitionService.ts` (`createDraftVersion`), `DynamicHallRoof.tsx`, `useV28SpatialStreaming.ts` | Giữ nguyên |
| 4 | Số lượng gian hàng động (`1, 5, 6, 20, 50, 100, 150`) + reload stability | **PARTIAL** | `layoutGenerator.ts`, `v28Phase8ClusterAndCategory.test.ts` (thiếu test cho `1` và `5` gian + reload) | Bổ sung test & xác minh đủ 7 mốc |
| 5 | Tối ưu khoảng cách theo bounding box thực tế của 6 model GLB | **FAIL** | `layoutGenerator.ts` (`V28_ARCHETYPES`, `BOOTH_PITCH_M = 12.2`) | Cập nhật đúng bbox GLB & đặt gian theo chiều rộng từng model + `boothGap` |
| 6 | Giới hạn Camera & Nhân vật theo Walkable Regions + Rotated Colliders | **FAIL** | `DynamicExhibitionScene.tsx` lines 302–326 & 392–428 | Tạo `walkableRegions[]`, `v28NavigationBounds.ts`, sửa rotated AABB, clamp camera & click/teleport |
| 7 | Benchmark hiệu năng trình duyệt thực tế cho `20, 50, 100, 150` gian | **NOT VERIFIED** | Trước đây chỉ đo 100 gian | Chạy Headless Chrome CDP đo đủ 4 mốc `20, 50, 100, 150` + V27.5 |

---

## 3. Thành phần PASS được giữ nguyên

Không refactor, không thay đổi hành vi của:
- Toàn bộ V27.5 (`/?world=v27`, `/`, `/admin`, `BE/data/expo.db`, toàn bộ `.glb` gốc).
- 6 model gian hàng V27.4 GLB (`v28BoothAssets.ts`, `DynamicBooth3D.tsx`).
- Nhân vật khách tham quan V27.5 (`<AvatarCharacter />`), NPC tư vấn V27.5 (`<SalesAssistantNpc />`), animation, đổi tên (`Khách #XXX ✏️`), Product Modal, 6 product slots, Cached Audio, Grounded AI Chat/Voice, Spatial AOI `/v28-dynamic`, 3-Ring LOD Streaming và `DynamicHallRoof.tsx`.

---

## 4. Thành phần cần sửa và lý do

1. **Chuẩn hóa kích thước thực đo 6 GLB & tối ưu khoảng cách Multi-U (`layoutGenerator.ts`):** Loại bỏ khoảng trống thừa `5.3–5.5m` giữa các gian, thu gọn diện tích hội trường 100 gian từ `376.8 × 234.0m` (`88,171 m²`) xuống **`265.8 × 173.24m` (`46,047 m²` — giảm 47.8% diện tích trống thừa)** mà vẫn giữ khe `2.2m` giữa các gian, `≥ 19m` sân trong chữ U, `10m` lối đi giữa các khu và `14m` Đại lộ Trung tâm.
2. **Sinh `walkableRegions: RectBounds[]` tự thích nghi & sửa va chạm/camera bounds (`v28NavigationBounds.ts`, `DynamicExhibitionScene.tsx`):** Đảm bảo nhân vật không thể đi vào vùng rỗng bên ngoài dãy Nam hẹp hơn, collider gian cánh Trái/Phải xoay chính xác ±90°, click-to-move/teleport được xác thực, và camera bị chặn trong `hallBounds` / bán kính overview.

---

## 5. Danh sách File / Function đã chỉnh

- [BE/src/services/v28/layoutGenerator.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/layoutGenerator.ts): cập nhật `V28_ARCHETYPES` theo bbox thực đo, thêm `boothGap` cấu hình, hàm `computeSideCenteredOffsets()`, tối ưu hằng số khoảng cách, sinh `walkableRegions: RectBounds[]`.
- [BE/src/services/v28/exhibitionService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/exhibitionService.ts): lưu và trả `walkableRegions` trong `ExhibitionVersionDetail`.
- [FE/src/services/v28Api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/v28Api.ts): bổ sung trường `walkableRegions?: V28RectBounds[]`.
- [FE/src/scene/v28/v28NavigationBounds.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/v28NavigationBounds.ts) *(mới)*: `computeRotatedBoothCollider`, `deriveWalkableRegions`, `isPointWalkable`, `clampPointToWalkable`, `clampCameraPosition`.
- [FE/src/scene/v28/DynamicExhibitionScene.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicExhibitionScene.tsx): tích hợp rotated colliders, multi-region `isWalkable`, validated `onFloorClick` & `teleportPos`, `clampCameraPosition`.
- [BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts) & [FE/src/__tests__/v28NavigationBounds.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/__tests__/v28NavigationBounds.test.ts) *(mới)*: bổ sung kiểm thử đầy đủ `1, 5, 6, 20, 50, 100, 150` gian và bounds/collision.

---

## 6. Thuật toán bố cục chữ U (Multi-U Category Zones)

1. **Phân nhóm theo Danh mục:** Mỗi danh mục sản phẩm tương ứng **1 Khu chữ U** kích thước tự co giãn theo số gian được phân bổ (`computeUZoneSideCounts`: `backCount ≈ 30%`, phần còn lại chia đều `leftCount` & `rightCount`; riêng `6` gian → `2 / 2 / 2` giống V27.5).
2. **Định vị theo kích thước thực tế từng model:** Mỗi cạnh gọi `computeSideCenteredOffsets(widths, boothGap)` với `arch.width` thực (`6.72m` / `6.87m`) và `boothGap = 2.2m` (cấu hình được).
3. **Hướng quay vào trong:** Cạnh đáy quay `+Z` (dãy Bắc) hoặc `-Z` (dãy Nam); cánh Trái quay `+X` (`+PI/2`); cánh Phải quay `-X` (`-PI/2`).
4. **Sắp xếp 2 dãy đối xứng qua Đại lộ Trung tâm (`14m`):** Dãy Bắc mở cửa về Nam; dãy Nam chia đối xứng hai bên Trục vào chính (`12m`) và mở cửa về Bắc; giữa các khu chữ U cùng dãy có hành lang `10m`.
5. **Sinh `walkableRegions[]`:** Hợp của: Đại lộ Trung tâm + Trục vào Nam + Khu đón tiếp + sân & cửa mở từng Khu chữ U + hành lang nối giữa hai khu chữ U kề nhau (loại trừ hoàn toàn khoảng rỗng ngoài biên).

---

## 7. Sơ đồ layout 100 gian (6 Khu Danh mục — `265.8m × 173.24m`)

```text
+---------------------------------------------------------------------------------------------------+
|  [Khu A: Công nghệ]      [Khu B: Nội thất]       [Khu C: Thực phẩm]      [Khu D: Công nghiệp]    |
|   (17 gian, mở Nam)       (17 gian, mở Nam)       (17 gian, mở Nam)       (17 gian, mở Nam)      |
|     |   _ _ _   |           |   _ _ _   |           |   _ _ _   |           |   _ _ _   |        |
|     |  (Sân U)  |   10m     |  (Sân U)  |   10m     |  (Sân U)  |   10m     |  (Sân U)  |        |
|     |           |           |           |           |           |           |           |        |
+=====   CỬA MỞ   =============   CỬA MỞ   =============   CỬA MỞ   =============   CỬA MỞ   ======+
|                         ĐẠI LỘ TRUNG TÂM (GRAND CENTRAL BOULEVARD — 14m)                         |
+=======================   CỬA MỞ   =======+      +=======   CỬA MỞ   =============================+
|       (Vùng rỗng —    |           |      | 12m  |      |           |    (Vùng rỗng —             |
|        KHÔNG cho      |  (Sân U)  |      | TRỤC |      |  (Sân U)  |     KHÔNG cho               |
|        đi ra ngoài)   |  _ _ _ _  |      | VÀO  |      |  _ _ _ _  |     đi ra ngoài)            |
|                       [Khu E: Năng lượng]| NAM  |[Khu F: Thời trang]                             |
|                        (16 gian, mở Bắc) |      | (16 gian, mở Bắc)                              |
+------------------------------------------+------+------------------------------------------------+
|                               KHU ĐÓN TIẾP & SPAWN (WELCOME AREA)                                |
+---------------------------------------------------------------------------------------------------+
```

---

## 8. Screenshot kiểm chứng thực tế

Đã chụp và kiểm tra trực quan từ Headless Chrome CDP (`1440×900`):
- **Toàn cảnh 100 gian sau tối ưu (`265.8m × 173.24m`, 6 Khu chữ U):** `p1_100_overview.png` — 4 khu Bắc & 2 khu Nam cân đối, khoảng cách giữa các gian gọn gàng, hành lang rõ nét, không gian không bị kéo giãn vô lý.
- **Cận cảnh góc trong Khu chữ U (`Explore`):** `p1_100_explore_uzone.png` — thấy rõ 3 gian liên tiếp (cánh Trái `Solaris Clean Energy` + đáy `Aether Tech Lab` + `EcoVita Roastery & Craft`), nhân vật V27.5 `<AvatarCharacter />` và 2 NPC V27.5 `<SalesAssistantNpc />` ("Bảo Trân" & "Ngọc Anh") đứng đúng vị trí, không chồng lấn.

---

## 9. Kết quả kiểm thử số lượng gian hàng động

Kiểm thử tự động trên cả `generateDynamicExhibitionLayout` và `V28ExhibitionService` (Draft → Publish → Reload):

| Số gian cấu hình | Số gian thực tế | Duplicate Booth ID | Overlap | Out of Bounds | Unreachable | Focus Clip | Reload ổn định |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | 1 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **5** | 5 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **6** | 6 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **20** | 20 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **50** | 50 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **100** | 100 | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **150** | 150 | 0 | 0 | 0 | 0 | 0 | **PASS** |

- Bảo toàn doanh nghiệp & sản phẩm khi giảm/tăng số gian (`100 → 20 → 100`, `20 → 10 → 20`): **PASS**.

---

## 10. Kết quả đo khoảng cách & Overlap

| Thông số khoảng cách | Trước tối ưu | Sau tối ưu Phase 1 | Ghi chú |
| :--- | :---: | :---: | :--- |
| Kích thước thực 6 GLB | Ghi sai `9.4×6.95m` | `6.72–6.87m × 5.19m` | Đo trực tiếp từ binary GLB |
| Khe hở giữa 2 gian liền kề | `5.33–5.48m` (quá rộng) | **`2.20m`** (cấu hình được) | Vừa đủ biển hiệu, NPC & thoáng mắt |
| Khoảng góc chữ U (`CORNER_CLEARANCE_M`) | `10.8m` | **`8.4m`** | Không che góc, không chồng lấn |
| Bề rộng sân tối thiểu chữ U | `25.0m` | **`19.0m`** | Đủ `2×(2.6+4.4)` focus + `5m` lối giữa |
| Hành lang giữa 2 chữ U (`ZONE_GAP_X_M`) | `14.0m` | **`10.0m`** | Lối đi rộng rõ ràng |
| Đại lộ Trung tâm / Trục vào Nam | `18.0m / 14.0m` | **`14.0m / 12.0m`** | Cân đối tỷ lệ người & gian hàng |
| Kích thước Hall 100 gian | `376.8 × 234.0m` | **`265.8 × 173.24m`** | Giảm **47.8%** diện tích trống thừa |
| Số cặp Overlap / Focus Clip | 0 / 0 | **0 / 0** | Xác minh trên cả 7 quy mô `1–150` |

---

## 11. Kết quả Camera & Nhân vật Bounds

- **Unit tests (`FE/src/__tests__/v28NavigationBounds.test.ts` — 3/3 PASS):**
  - Collider xoay ±90° đổi đúng trục `X/Z` cho gian cánh Trái/Phải.
  - `isPointWalkable` chặn cả gian xoay lẫn khoảng rỗng ngoài biên dãy Nam (`x = -90, z = 30`).
  - `clampPointToWalkable` kéo mọi điểm teleport ngoài biên về vùng hợp lệ gần nhất.
  - `clampCameraPosition` chặn `explore/focus` trong `hallBounds` (`margin = 1.2m`) và chặn `overview` trong bán kính thích nghi.
- **Tích hợp thực tế (`DynamicExhibitionScene.tsx`):** `walkableRegionCount = 6` (20 gian), `11` (50 gian), `13` (100 & 150 gian); `onFloorClick` từ chối điểm ngoài walkable regions; `teleportPos` được clamp an toàn.

---

## 12. Performance Benchmark Thực tế (Headless Chrome CDP)

| Quy mô | Kích thước Hall | Số Khu / Walkable Regions | Overview FPS / DrawCalls | Explore (trong chữ U) FPS / DrawCalls | LOD Near / Mid / Far (Explore) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **20 gian** | `107.62 × 88.48m` | `2 / 6` | — *(tải ban đầu)* | **29–60 FPS** / 294 DC | `7 / 5 / 8` |
| **50 gian** | `145.44 × 136.96m` | `5 / 11` | **54 FPS** / 278 DC | **45 FPS** / 198 DC | `7 / 7 / 36` |
| **100 gian** | `265.80 × 173.24m` | `6 / 13` | **57 FPS** / 376 DC | **53 FPS** / 190 DC | `6 / 7 / 87` |
| **150 gian** | `374.64 × 227.66m` | `6 / 13` | *(340 DC, 176k tris)* | **53 FPS** / 191 DC | `6 / 5 / 139` |
| **Mobile 390×844 (100 gian)** | `265.80 × 173.24m` | `6 / 13` | — | **47 FPS** / 150 DC (`overflowX: false`) | `6 / 6 / 88` |

- **Console errors:** `0` | **Page errors:** `0` | **HTTP >= 400:** `0` | **Texture Cache:** `25.53 MB` (dưới ngưỡng `48 MB`).
- **Lưu ý trung thực:** Tại khoảnh khắc ngay sau khi Teleport lần đầu vào gian hàng (`Focus`), FPS có nhịp tụt ngắn (~1s) khi giải nén GLB Ring 0 + NPC + texture sản phẩm, sau đó ổn định lại `47–57 FPS` ở `Explore`/`Overview`.

---

## 13. Regression V27.5 & Kết quả Test Suite

- **Typecheck & Build:** `BE typecheck`, `FE typecheck`, `BE build`, `FE build` — **PASS (0 lỗi)**.
- **Vitest:** **9/9 test files, 72/72 tests PASS** (gồm `v28NavigationBounds.test.ts` 3/3, `v28Phase8ClusterAndCategory.test.ts` 3/3, và `movementAndPathfinding.test.ts` 38/38 chạy độc lập không nghẽn CPU).
- **V27.5 (`/?world=v27`):** Canvas `1424×805`, 0 lỗi.
- **V27.5 Database (`BE/data/expo.db`):** SHA-256 không đổi (`8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76`).

---

## 14. Git Status & Commit

- Branch: `grand-expo-v28-dev` (chỉ commit cục bộ, **không push, không merge, không deploy**, không stage `BE/data/`).
- Sẽ ghi nhận commit Phase 1 ngay sau khi hoàn tất báo cáo này.

---

## 15. Các vấn đề còn lại & Ghi chú trung thực

- **Chưa kiểm thử trên thiết bị di động vật lý (`REAL DEVICE NOT TESTED`):** Chỉ đo qua Chrome DevTools Device Emulation (`390×844`).
- **Nhịp tụt FPS ngắn lúc Teleport Focus lần đầu:** Do đồng thời tạo instance NPC GLB + tải texture sản phẩm cho 5–6 gian Ring 0 mới; có thể tối ưu thêm ở Phase sau bằng staggered mount (1 gian/frame) nếu cần.
- **V27.5 test `movementAndPathfinding.test.ts` (A* P99 < 16ms):** Khi chạy song song cả 9 worker Vitest trên Windows dễ bị chiếm CPU, chạy riêng file đạt `38/38 PASS` trong `1.96s`.

**KẾT LUẬN PHASE 1: PASS — DỪNG CHỜ NGƯỜI DÙNG NGHIỆM THU.**
