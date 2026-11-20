# BÁO CÁO NGHIỆM THU — GRAND EXPO WORLD V28 — PHASE 8
## V27.5 VISUAL HERITAGE & DYNAMIC EXHIBITION EXPANSION

**Ngày lập báo cáo:** 2026-11-20  
**Workspace Windows:** `E:\Lập trình\MatBaoWS\exhibition`  
**Nhánh phát triển:** `grand-expo-v28-dev` (tách từ `grand-expo-v27-5` @ `432cd25`)

---

## A. Audit V27.5 (`docs/v28/V27_VISUAL_ASSET_AUDIT.md`)
- Tài liệu kiểm kê chi tiết: `docs/v28/V27_VISUAL_ASSET_AUDIT.md`.
- **Bố cục 6 gian hàng V27.5 thực tế (`FE/src/scene/worldLayout.ts`):**
  - Hall `51.2m × 46.0m`, Đại lộ `10.2m`, Spawn `(0, 15.2, rotY = PI)`.
  - 6 gian hàng chữ U quay mặt vào trung tâm: `north-left (-6.6, -16.8)`, `north-right (+6.6, -16.8)`, `west-far (-15.6, -6.4)`, `west-near (-15.6, +6.0)`, `east-far (+15.6, -6.4)`, `east-near (+15.6, +6.0)`.
- **Models & Environment Assets V27.4 / V27.5 thực tế:**
  - 6 Booth GLBs (`FE/public/models/booths/v27_4/booth_01..06_v27_4.glb`).
  - 10 Plaza Heritage GLBs (`welcome_desk_v27_4.glb`, `directory_monument_v27_4.glb`, `mini_cafe_corner_v27_4.glb`, `rest_lounge_v27_4.glb`, `checkin_stage_v27_4.glb`, `digital_totem_v27_4.glb`, `landscape_lounge_v27_5.glb`, `interactive_expo_corner_v27_5.glb`, `plaza_oasis_v27_5.glb`, `avenue_planter_island_v27_5.glb`).
  - Vật liệu & Texture: Sàn Terrazzo `#e4e8ee`, đường viền Champagne `#d6be96`, Grand Expo Medallion (`createGrandExpoMedallionTexture`), ánh sáng daylight `#eef2f7`.
  - Camera & Controls (`ExhibitionScene.tsx`): Drag-to-rotate (`DRAG_YAW_SENSITIVITY=0.0052`, `DRAG_PITCH_SENSITIVITY=0.0038`, `pitch [-0.38, +0.42]`), wheel zoom, click/tap-to-move, Escape thoát Focus.

---

## B. Chiến lược Tái sử dụng (`V27VisualKit`)
- **REUSE (Read-only, không sửa GLB/file gốc V27.5):** 6 Booth GLB V27.4, 10 Plaza Heritage GLBs V27.4/V27.5, `createGrandExpoMedallionTexture`, hằng số camera drag/pitch từ `ExhibitionScene.tsx`.
- **WRAPPER / ADAPT:** Tạo `FE/src/scene/v28/V27VisualKit.tsx` (shared prototype cache, clone scene graph, stream cảnh quan cụm trong bán kính `<= 85m`, không dispose tài nguyên dùng chung).
- **OPTIMIZE:** 3-Ring Spatial Streaming (`spatialStreaming.ts`) + Far LOD Pavilion 6 thành phần (`FarBoothInstancedProxy.tsx`) + Parametric Dome Roof với Overview Cutaway (`ParametricExpoRoof.tsx`).
- **INCOMPATIBLE / NOT FOUND IN V27.5 HALL:** Cây Broadleaf/Birch, đài phun nước Renaissance, skyline 12 nhà phố thuộc V26 Outdoor (`ExteriorAssets.tsx`), không tồn tại trong Grand Expo Hall V27.5.

---

## C. Six-Booth U-Shaped Courtyard Cluster Generator
- Triển khai tại `BE/src/services/v28/layoutGenerator.ts`.
- Mỗi cụm rộng `44m × 38m` gồm tối đa **6 gian hàng** bố trí theo hình chữ U hướng mặt vào khoảng sân trung tâm `> 25m` (lấy cảm hứng trực tiếp từ `V27_BOOTH_LAYOUT_SPECS`).
- **Số cụm tự động theo số gian (không tạo gian giả ở cụm cuối):**
  - `1..6 gian` → `1` cụm
  - `7 gian` → `2` cụm (`6 + 1`)
  - `20 gian` → `4` cụm (`6 + 6 + 6 + 2`)
  - `35 gian` → `6` cụm (`6×5 + 5`)
  - `50 gian` → `9` cụm (`6×8 + 2`)
  - `100 gian` → `17–18` cụm (khi chia theo 6 khu danh mục)
  - `150 gian` → `25` cụm
- **Biến thể cảnh quan theo deterministic seed (`variationSeed`):** Luân phiên 4 kiểu tâm cụm (`medallion_oasis`, `landscape_lounge`, `interactive_corner`, `cafe_rest`) đảm bảo không lặp máy móc và không che gian hàng/camera/NPC.
- **Kiểm chứng toán học:** `0` overlap, `0` out-of-bounds, `0` blocked walkways, `0` focus clip, `100%` BFS-connected cho cả 8 kích thước (`1, 6, 7, 20, 35, 50, 100, 150` gian).

---

## D. Category-Based Zones (`Khu + Tên danh mục`)
- Tự động phân khu theo 6 danh mục ổn định trong bảng `categories`:
  1. `cat-tech` → `Khu Công nghệ & Điện tử`
  2. `cat-living` → `Khu Nội thất & Trang trí`
  3. `cat-food` → `Khu Thực phẩm & Đồ uống`
  4. `cat-industrial` → `Khu Thiết bị công nghiệp`
  5. `cat-energy` → `Khu Năng lượng & Xanh`
  6. `cat-lifestyle` → `Khu Thời trang & Mỹ phẩm`
- Admin có thể đổi tên khu hoặc thêm danh mục mới tại `/admin/v28` mà không làm đổi `category_id` hoặc `zone.id`.

---

## E. Kết quả Hình ảnh (Visual Results)
- **V27.5 Heritage Reference (`/?world=v27`):** `p8_v27_5_heritage_ref.png` — giữ nguyên 100% 6 gian, NPC, đại lộ, medallion, check-in stage.
- **V28 Phase 8 Cluster Overview (100 gian, 18 cụm chữ U, 6 khu danh mục, V27VisualKit):** `p8_v28_cluster_overview.png` — hiển thị rõ sàn Terrazzo V27.5, 18 sân cụm có Grand Expo Medallion, đại lộ viền champagne, Welcome Desk + Directory + Café + Rest Lounge ở quảng trường Nam, Check-In Stage ở đầu Bắc, khung mái vòm cắt cutaway không che gian hàng.
- **V28 Phase 8 Focus + NPC AI Consultant Panel:** `p8_v28_cluster_focus_npc.png` — cận cảnh `Aether Tech Lab` (Signature Ring GLB V27.4) + bảng Trợ lý AI (Audio Giới thiệu / AI Chat / AI Voice).

---

## F. Hiệu năng Đo Thực tế (Performance — Chrome Headless WebGL D3D11)
| Kịch bản (100 gian, 18 cụm chữ U, 6 khu danh mục) | FPS | Draw Calls | Triangles | LOD (`Near / Mid / Far`) | Lỗi Console/HTTP |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Desktop Overview (`1440×900`)** | **60** | — | — | 0 / 12 / 88 | 0 |
| **Desktop Focus + NPC AI Panel (`1440×900`)** | **60** | 56 | 25,016 | 5 / 5 / 90 | 0 |
| **Mobile Portrait Emulation (`390×844`)** | **60** | 44 | 22,930 | 5 / 4 / 91 | 0 (`overflowX: false`) |

---

## G. Database & Bảo toàn Dữ liệu (`VERIFIED`)
- Không cần migration phá cấu trúc mới (`expo_v28_dev.db` giữ `user_version = 5`, `WAL`, `foreign_key_check = OK`, `integrity_check = ok`).
- `BE/data/expo.db` (V27.5 gốc): SHA-256 giữ nguyên `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` (`unchanged: true`).

---

## H. Hồi quy (Regression)
- V27.5 (`/?world=v27`, `/`, `/admin`): hoạt động nguyên vẹn (`1424×805`, 6 gian, 0 lỗi).
- V28 (`/admin/v28`, `/?world=dynamic`, Spatial AOI `/v28-dynamic`, NPC, Cached Audio, AI Chat/Voice): hoạt động đầy đủ và tương thích 100% với layout cụm 6 gian mới.

---

## I. Automated Tests (`VERIFIED`)
- `npm run typecheck -w BE && npm run typecheck -w FE && npm run build -w BE && npm run build -w FE` → **PASS (0 lỗi)**.
- `npm test` (Vitest) → **8/8 test files, 68/68 tests PASSED (0 failed)** (bao gồm suite mới `BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts`).

---

## J. Trạng thái Git & Rollback
- **Branch:** `grand-expo-v28-dev` (chưa push, chưa merge vào `grand-expo-v27-5` hay `main`).
- **Rollback:** V27.5 không bị sửa đổi; mọi checkpoint Phase 1 → Phase 8 tách commit rõ ràng trên `grand-expo-v28-dev`.

---

## K. Vấn đề Còn Tồn tại (Outstanding Issues)
- **Critical / High:** Không có lỗi mới phát sinh từ Phase 8. (Các giới hạn môi trường đã ghi nhận ở Phase 6/7 vẫn giữ nguyên: `LIVE GEMINI NOT VERIFIED` do chưa cấu hình `GEMINI_API_KEY`, `REAL DEVICE NOT TESTED` cho Android vật lý, `15-MIN SOAK NOT VERIFIED`.)

---

## L. Kết luận Nghiệm thu (Final Verdict)
**`READY FOR LOCAL USER ACCEPTANCE (NON-PAID AI MODE)`**
Phase 8 đã kết hợp thành công bản sắc đồ họa, bố cục cụm 6 gian chữ U hướng tâm, sàn Terrazzo, cảnh quan GLB và điều khiển camera của **V27.5** vào nền tảng triển lãm động **V28** (100 gian, 18 cụm, 6 khu danh mục, 60 FPS, 68/68 tests PASS).
