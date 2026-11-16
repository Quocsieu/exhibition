# REPOSITORY NAMING & STRUCTURE STANDARDIZATION REVIEW — V11

**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Kiến trúc:** npm Workspaces Monorepo (`FE` + `BE`)  
**Baseline HEAD:** `6ba92956c444de7f84c0052a52a3f455d4b9d5e6` (`main`)  
**Trạng thái tổng thể:** **V11 PASS — ZERO FUNCTIONAL REGRESSION — ZERO SECRET EXPOSURE**  
**Quyết định cuối cùng (Mục XIV.H):** **`B — PARTIAL STANDARDIZATION — HIGH-RISK PATHS PROTECTED`** *(Toàn bộ source code `FE/src`, `BE/src`, scripts và tài liệu đã đạt chuẩn quy ước đặt tên 100%; đã lưu trữ & xóa báo cáo lịch sử `ENV_MIGRATION_REVIEW_V10.md`; 4 tên file GLB runtime có rủi ro cao được bảo vệ nguyên trạng theo Mục VI & VIII)*

---

## A. EXECUTIVE SUMMARY

| Chỉ số Kiểm toán V11 | Giá trị | Chi tiết |
|---|---:|---|
| **Tổng số file & thư mục đã kiểm toán** | **96 files + 24 folders** | `94` file Tracked tại `HEAD 6ba9295` + `2` file `.env` local (`FE/.env`, `BE/.env`) + `24` thư mục cấu trúc |
| **Số file đã chuẩn hóa tên từ các vòng trước (hiện đạt chuẩn `KEEP`)** | **3 scripts** | • `optimize_phase1_models.py` → [FE/booth-modeling/scripts/optimize_street_props.py](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/scripts/optimize_street_props.py)<br>• `refine_opt_models.py` → [FE/booth-modeling/scripts/decimate_foliage_models.py](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/scripts/decimate_foliage_models.py)<br>• `qa-reports/final_regression_test.cjs` → [FE/scripts/browserRegressionTest.cjs](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/scripts/browserRegressionTest.cjs) |
| **Số file báo cáo lịch sử đã Archive & Xóa trong V11** | **1 file** | `ENV_MIGRATION_REVIEW_V10.md` (`15,708 B`, `sha256: 4f4388a4d9a532f1...`) |
| **Số Rename Candidates được đánh giá trong V11** | **4 files (Runtime GLBs)** | `7b_tCaBRLCI.glb`, `tree-gian.glb`, `planter-near-ch.glb`, `Street_Lamp.glb` |
| **Số Rename thực hiện mới trong V11** | **`0` source/asset files** | Toàn bộ 52 file code/scripts/docs hiện hành đều đã đúng chuẩn (`PascalCase`, `camelCase`, `use*`, `snake_case.py`). |
| **Số Rename bị từ chối (Bảo vệ theo Mục VI & VIII)** | **4 files (`HIGH RISK`)** | Từ chối đổi tên 4 file GLB runtime đang hoạt động để bảo toàn 100% đường dẫn public URL, cache trình duyệt và attribution CC-BY 3.0. |
| **Tổng số file Tracked còn lại (trước báo cáo V11)** | **93 files** | `91.32 MB` (`94 files` khi tính cả báo cáo `REPOSITORY_NAMING_REVIEW_V11.md` này) |

---

## B. FULL REPOSITORY NAMING AUDIT & RENAME MAPPING (PHASES 1–5)

### 1. Bảng Đánh giá Chi tiết các Rename Candidates & Lịch sử Chuẩn hóa

| Old / Current Path | Proposed / New Path | Risk Level | Classification & Action | Reason & Dependency Mapping |
|---|---|---|---|---|
| `ENV_MIGRATION_REVIEW_V10.md` | *(Archived to `exhibition-archive-v11`)* | **LOW** | **`HISTORICAL` → ARCHIVED & REMOVED** | Báo cáo lịch sử của vòng V10; `0` tham chiếu trong code/scripts/tests. Đã sao lưu SHA-256 (`4f4388a4d9a532f1...`) và xóa để giữ repo sạch sẽ. |
| `FE/booth-modeling/scripts/optimize_phase1_models.py` *(Trước V6)* | [FE/booth-modeling/scripts/optimize_street_props.py](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/scripts/optimize_street_props.py) | **LOW** | **`SAFE RENAME` *(Đã hoàn tất & commit)*** | Đã loại bỏ hậu tố giai đoạn thử nghiệm `phase1`, đặt tên theo đúng chức năng tối ưu hóa đạo cụ đường phố (`trash_opt.glb`). |
| `FE/booth-modeling/scripts/refine_opt_models.py` *(Trước V8)* | [FE/booth-modeling/scripts/decimate_foliage_models.py](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/scripts/decimate_foliage_models.py) | **LOW** | **`SAFE RENAME` *(Đã hoàn tất & commit)*** | Đã loại bỏ từ viết tắt mơ hồ `refine_opt_models`, đặt tên theo đúng tác vụ giảm lưới (`decimate`) cho cây thông và bụi hoa. |
| `qa-reports/final_regression_test.cjs` *(Trước V8)* | [FE/scripts/browserRegressionTest.cjs](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/scripts/browserRegressionTest.cjs) | **LOW** | **`SAFE RENAME` *(Đã hoàn tất & commit)*** | Đã loại bỏ tiền tố `final_` và xóa thư mục `qa-reports/`, gom về `FE/scripts/` theo đúng quy ước `camelCase`. |
| [FE/public/models/exterior/7b_tCaBRLCI.glb](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/7b_tCaBRLCI.glb) | *(Đề xuất tham khảo: `plaza_fountain.glb`)* | **HIGH** | **`RENAME CANDIDATE` → REJECTED (`PROTECTED`)** | Tên gốc là mã định danh gốc từ Poly Pizza (`7b_tCaBRLCI`). Phụ thuộc trực tiếp tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L24) và hồ sơ bản quyền CC-BY 3.0 trong [CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CREDITS.md#L14). Khóa theo Mục VI & VIII (*"KHÔNG được đổi tên hoặc di chuyển bất kỳ GLB... HIGH RISK = DO NOT RENAME"*). |
| [FE/public/models/env/tree-gian.glb](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/env/tree-gian.glb) | *(Đề xuất tham khảo: `booth_front_tree.glb`)* | **HIGH** | **`RENAME CANDIDATE` → REJECTED (`PROTECTED`)** | Tên pha trộn Việt–Anh (`tree-gian`), nhưng là runtime GLB đang hoạt động, được nạp tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L31) và kiểm tra trong [FE/booth-modeling/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/README.md#L40). Giữ nguyên theo Mục VI & VIII. |
| [FE/public/models/env/planter-near-ch.glb](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/env/planter-near-ch.glb) | *(Đề xuất tham khảo: `bench_planter_cluster.glb`)* | **HIGH** | **`RENAME CANDIDATE` → REJECTED (`PROTECTED`)** | Tên viết tắt (`near-ch`), nhưng là runtime GLB đang hoạt động, được nạp tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L22). Giữ nguyên theo Mục VI & VIII. |
| [FE/public/models/env/Street_Lamp.glb](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/env/Street_Lamp.glb) | *(Đề xuất tham khảo: `street_lamp.glb`)* | **HIGH** | **`RENAME CANDIDATE` → REJECTED (`PROTECTED`)** | Viết hoa chữ cái đầu (`Street_Lamp.glb`), được tham chiếu tại [ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx#L23) và [movementAndPathfinding.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/__tests__/movementAndPathfinding.test.ts#L311). Giữ nguyên để tránh lỗi phân biệt hoa/thường trên Linux/Vercel CDN. |

---

### 2. Bảng Kiểm toán Toàn bộ Cấu trúc File & Thư mục Hiện hành (`93 Tracked Files` + `2 Local .env Files`)

| Current Path | Type | Purpose | Naming Quality | Dependency Risk | Recommendation |
|---|---|---|---|---|---|
| **1. Root & Workspace Configs (`6 files`)** | | | | | |
| [.gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore) | Git Config | Chặn commit `node_modules`, `dist`, `.env*`, `*.db*`, `*_4k.glb` | Chuẩn Git | **HIGH** | **`PROTECTED`** |
| [package.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/package.json) | Manifest | Khai báo npm workspaces (`FE`, `BE`) và scripts gốc | Chuẩn npm | **HIGH** | **`PROTECTED`** |
| [package-lock.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/package-lock.json) | Lockfile | Khóa phiên bản cây phụ thuộc cho `npm ci` | Chuẩn npm | **HIGH** | **`PROTECTED`** |
| [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) | Deploy Config | Cấu hình build và 3 quy tắc `rewrites` trên Vercel | Chuẩn Vercel | **HIGH** | **`PROTECTED`** |
| [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) | Documentation | Tài liệu tổng quan, cài đặt, `.env`, lệnh chạy và deploy | Chuẩn Quốc tế | **MEDIUM** | **`KEEP`** |
| `FE/.env` & `BE/.env` *(Git Ignored)* | Local Env | Biến môi trường local cho Frontend và Backend | Chuẩn V10 | **HIGH** | **`PROTECTED`** |
| **2. Frontend Configs & Entry (`7 files`)** | | | | | |
| [FE/package.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/package.json) | Manifest | Khai báo dependencies và scripts của workspace `FE` | Chuẩn npm | **HIGH** | **`PROTECTED`** |
| [FE/tsconfig.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/tsconfig.json) | TS Config | Cấu hình biên dịch TypeScript cho `FE` | Chuẩn TS | **HIGH** | **`PROTECTED`** |
| [FE/vite.config.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vite.config.ts) | Vite Config | Cấu hình Vite dev server (`5173`) & proxy `/api`, `/socket.io` | Chuẩn Vite | **HIGH** | **`PROTECTED`** |
| [FE/index.html](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/index.html) | HTML Entry | Trang HTML gốc nạp `/src/main.tsx` | Chuẩn Vite | **HIGH** | **`PROTECTED`** |
| [FE/src/main.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/main.tsx) | React Entry | Điểm vào khởi tạo React DOM root | Chuẩn Vite/React | **HIGH** | **`PROTECTED`** |
| [FE/src/App.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/App.tsx) | Component | Component gốc điều phối định tuyến `ExhibitionPage` & `AdminPage` | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/styles.css](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/styles.css) & [FE/src/vite-env.d.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/vite-env.d.ts) | Styles / Types | CSS toàn cục và khai báo kiểu `import.meta.env` của Vite | Chuẩn Vite | **MEDIUM / HIGH** | **`KEEP` / `PROTECTED`** |
| **3. Frontend Pages, UI Components, Controls & Hooks (`9 files`)** | | | | | |
| [FE/src/pages/ExhibitionPage.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/ExhibitionPage.tsx) | Page Component | Trang không gian triển lãm 3D chính | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/pages/AdminPage.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/AdminPage.tsx) | Page Component | Trang quản trị gian hàng, sản phẩm & 36 vị trí trưng bày | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/components/BoothPanel.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/BoothPanel.tsx) | UI Component | Ngăn kéo thông tin gian hàng và danh sách sản phẩm | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/components/ProductPanel.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/ProductPanel.tsx) | UI Component | Hộp thoại chi tiết sản phẩm (`Product Modal`) | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/components/LoadingScreen.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/LoadingScreen.tsx) | UI Component | Màn hình chờ tải tài nguyên 3D | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/controls/MobileJoystick.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/controls/MobileJoystick.tsx) | UI Component | Cần điều khiển cảm ứng cho thiết bị di động | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/controls/useKeyboard.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/controls/useKeyboard.ts) | React Hook | Hook lắng nghe phím di chuyển `WASD` / Mũi tên | Chuẩn `use*` | **MEDIUM** | **`KEEP`** |
| [FE/src/controls/useClickToMove.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/controls/useClickToMove.ts) | React Hook | Hook điều khiển di chuyển Click-to-Move theo đường đi A* | Chuẩn `use*` | **MEDIUM** | **`KEEP`** |
| [FE/src/hooks/useRealtime.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/hooks/useRealtime.ts) | React Hook | Hook kết nối Socket.IO đồng bộ vị trí khách & dữ liệu | Chuẩn `use*` | **MEDIUM** | **`KEEP`** |
| **4. Frontend 3D Scene, Services, Config, Types & Tests (`17 files`)** | | | | | |
| [FE/src/scene/ExhibitionScene.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExhibitionScene.tsx) | 3D Component | Canvas React Three Fiber, điều khiển Camera Overview/Visit/Focus | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/scene/Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx) | 3D Component | Mặt sàn quảng trường, bầu trời, ánh sáng và cảnh quan | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/scene/ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx) | 3D Component | Nạp và bố trí 13 model GLB ngoại cảnh & đài phun nước | Chuẩn `PascalCase` | **HIGH** | **`KEEP`** |
| [FE/src/scene/Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx) | 3D Component | Hiển thị gian hàng 3D, bảng tên và các kệ sản phẩm | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/scene/RooflessBoothShell.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/RooflessBoothShell.tsx) | 3D Component | Nạp 6 model GLB gian hàng V2 (`isV2`) và fallback V1 | Chuẩn `PascalCase` | **HIGH** | **`KEEP`** |
| [FE/src/scene/ShopShowcaseStage.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ShopShowcaseStage.tsx) | 3D Component | Bố cục 6 vị trí trưng bày sản phẩm (`Product Slots`) trong gian hàng | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/scene/LocalPlayer.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/LocalPlayer.tsx) & [RemotePlayers.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/RemotePlayers.tsx) | 3D Components | Nhân vật 3D của người chơi hiện tại và khách tham quan trực tuyến | Chuẩn `PascalCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/scene/architecturalModels.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/architecturalModels.ts), [assetLoader.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/assetLoader.ts), [exhibitionBoothShells.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/exhibitionBoothShells.ts), [exteriorStone.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/exteriorStone.ts), [sceneTextures.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/sceneTextures.ts) | 3D Utilities | Bộ nạp/cache GLB, sinh hình học procedural và vật liệu/texture | Chuẩn `camelCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/config/apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts) & [FE/src/services/api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts) | Config / Service | Phân giải endpoint API/Socket.IO và gọi REST API kèm fallback | Chuẩn `camelCase` | **HIGH** | **`KEEP`** |
| [FE/src/types/expo.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/types/expo.ts) | Types & Engine | Kiểu dữ liệu, lưới va chạm (`isPointWalkable`) và tìm đường A* | Chuẩn `camelCase` | **MEDIUM** | **`KEEP`** |
| [FE/src/__tests__/movementAndPathfinding.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/__tests__/movementAndPathfinding.test.ts) | Unit Test Suite | 22 bài test kiểm tra A*, va chạm, camera, 36 slots & cache GLB | Chuẩn `*.test.ts` | **MEDIUM** | **`KEEP`** |
| **5. Frontend Scripts & Blender Pipeline (`14 files`)** | | | | | |
| [FE/scripts/generateGlbAssets.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/scripts/generateGlbAssets.ts) | CLI Script | Xuất model GLB procedural (`npm run generate:assets`) | Chuẩn `camelCase` | **HIGH** | **`PROTECTED`** |
| [FE/scripts/browserRegressionTest.cjs](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/scripts/browserRegressionTest.cjs) | QA Script | Kịch bản kiểm thử hồi quy giao diện 3D trên trình duyệt | Chuẩn `camelCase` | **LOW** | **`KEEP`** |
| [FE/booth-modeling/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/README.md) | Documentation | Hướng dẫn chạy pipeline Blender 4.2 | Chuẩn Quốc tế | **LOW** | **`KEEP`** |
| `FE/booth-modeling/scripts/*.py` *(11 files: `generate_five_booths_v2.py`, `generate_kinetix_v2.py`, `generate_roofless_frames.py`, `optimize_env_4k_assets.py`, `optimize_jacaranda.py`, `optimize_building03.py`, `optimize_street_props.py`, `decimate_foliage_models.py`, `consolidate_and_export_glbs.py`, `fix_planter_leaves.py`, `verify_joined_glbs.py`)* | Blender Scripts | Sinh và tối ưu hóa toàn bộ model `.glb` cho gian hàng & cảnh quan | Chuẩn `snake_case.py` | **LOW** | **`KEEP`** |
| **6. Public 3D Assets & Attribution (`28 files`)** | | | | | |
| `FE/public/models/booths/v2/*.glb` *(5 files)* & `kinetix-v2/kinetix_booth_v2.glb` *(1 file)* | Runtime GLBs | 6 gian hàng 3D V2 chính thức | Chuẩn `snake_case.glb` | **HIGH** | **`PROTECTED`** |
| `FE/public/models/booths/roofless-v1/*.glb` *(6 files)* & `README.md` *(1 file)* | Fallback GLBs | 6 khung gian hàng fallback V1 & tài liệu kỹ thuật | Chuẩn `kebab/lower` | **HIGH** | **`PROTECTED`** |
| `FE/public/models/env/*.glb` *(12 files)* & `exterior/7b_tCaBRLCI.glb` *(1 file)* | Runtime GLBs | 13 model cây xanh, ghế, đèn đường, ô dù, tòa nhà & đài phun nước | 9 chuẩn / 4 giữ nguyên | **HIGH** | **`PROTECTED`** |
| [FE/public/models/exterior/CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CREDITS.md) & [CONTINUATION_CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CONTINUATION_CREDITS.md) | Attribution | Ghi công tác giả và giấy phép CC-BY 3.0 bắt buộc | Chuẩn License | **HIGH** | **`PROTECTED`** |
| **7. Backend Configs, Source & Tests (`12 files`)** | | | | | |
| [BE/package.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/package.json) & [BE/tsconfig.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/tsconfig.json) | Manifest / TS | Cấu hình workspace `BE` và biên dịch TypeScript (`BE/dist`) | Chuẩn npm/TS | **HIGH** | **`PROTECTED`** |
| [BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts) | Entrypoint | Điểm khởi động Express + Socket.IO + nạp `BE/.env` | Chuẩn Node/TS | **HIGH** | **`PROTECTED`** |
| [BE/src/controllers/expoController.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/controllers/expoController.ts), [database/db.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/database/db.ts), [integrations/productAdapter.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/integrations/productAdapter.ts), [middleware/adminAuth.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/middleware/adminAuth.ts), [realtime/socketServer.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/realtime/socketServer.ts), [routes/apiRoutes.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/routes/apiRoutes.ts), [schemas/expoSchemas.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/schemas/expoSchemas.ts), [services/expoService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/expoService.ts) | Backend Modules | Phân tầng kiến trúc rõ ràng: Controller, Service, DB, Route, Middleware, Realtime, Schema, Integration | Chuẩn `camelCase` | **MEDIUM / HIGH** | **`KEEP`** |
| [BE/src/__tests__/expoBackendAndRealtime.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/expoBackendAndRealtime.test.ts) | Integration Tests | 9 bài kiểm thử tích hợp cho REST API, SQLite, Auth, SSRF & Socket.IO | Chuẩn `*.test.ts` | **MEDIUM** | **`KEEP`** |

---

## C. PROTECTED PATHS (PHASE 7)

Các đường dẫn cốt lõi dưới đây được khóa bảo vệ tuyệt đối (`DO NOT RENAME / DO NOT MOVE`) để bảo toàn tính tương thích với npm Workspaces, Vite, TypeScript, Node.js, Vercel và Render:

1. **Cấu trúc Monorepo & Môi trường:** `FE/`, `BE/`, `FE/.env`, `BE/.env`, [package.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/package.json), [package-lock.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/package-lock.json), [.gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore), [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json), [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md).
2. **Điểm vào Build & Runtime:** `FE/src/main.tsx`, `FE/index.html`, `FE/vite.config.ts`, `FE/tsconfig.json`, `BE/src/server.ts`, `BE/package.json`, `BE/tsconfig.json`.
3. **Tài nguyên 3D Công khai & Bản quyền:** Toàn bộ thư mục `FE/public/models/**` (`25` file `.glb`, `CREDITS.md`, `CONTINUATION_CREDITS.md`, `roofless-v1/README.md`).

---

## D. DOCUMENTATION CLEANUP (PHASE 6)

- **Tài liệu được giữ lại (`5 files`):**
  1. [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) — Hướng dẫn cài đặt, cấu hình `FE/.env` & `BE/.env`, chạy local và triển khai Production.
  2. [FE/booth-modeling/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/README.md) — Hướng dẫn sử dụng 11 script Python Blender 4.2.
  3. [FE/public/models/booths/roofless-v1/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/roofless-v1/README.md) — Tài liệu kỹ thuật cho 6 khung gian hàng fallback V1.
  4. [FE/public/models/exterior/CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CREDITS.md) — Ghi công bản quyền CC-BY 3.0 & CC0.
  5. [FE/public/models/exterior/CONTINUATION_CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CONTINUATION_CREDITS.md) — Ghi nhận xử lý hậu kỳ trên model CC-BY 3.0.
- **Báo cáo lịch sử đã Archive & Xóa (`1 file`):**
  - `ENV_MIGRATION_REVIEW_V10.md` (`15,708 B`) — Đã sao lưu ra ngoài repository tại `C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\exhibition-archive-v11\files\ENV_MIGRATION_REVIEW_V10.md`, kiểm tra khớp SHA-256 (`4f4388a4d9a532f18b9c817c71c7f5bdeee4b2464a03eff23aa1d1291f47023a`) và xóa khỏi thư mục gốc để thay bằng báo cáo bàn giao cuối cùng `REPOSITORY_NAMING_REVIEW_V11.md`.

---

## E. REGRESSION & CLEAN-CLONE VERIFICATION RESULTS (PHASE 8)

Đã thực thi toàn bộ bộ kiểm thử tĩnh, kiểm thử trình duyệt (trên máy chủ tĩnh mô phỏng Vercel `FE/dist` + `BE/dist`) và Clean-Clone Verification (`npm ci` không có `.env`):

| Hạng mục Kiểm tra | Working Tree V11 | Clean-Clone V11 (`npm ci`, Zero `.env`) | Chi tiết Xác minh |
|---|---|---|---|
| **1. Typecheck (`npm run typecheck`)** | **PASS** | **PASS** | `BE` & `FE` (`tsc --noEmit`) đạt `0` lỗi. |
| **2. Production Build (`npm run build`)** | **PASS** | **PASS** | Biên dịch sạch `BE/dist` và `FE/dist` (`680 modules`). |
| **3. Automated Tests (`npm test`)** | **PASS (`31/31`)** | **PASS (`31/31`)** | `2/2` test suites passed (`9` BE tests + `22` FE tests). |
| **4. Git Diff Formatting (`git diff --check`)** | **PASS (`CLEAN`)** | N/A | `0` lỗi whitespace hay formatting. |
| **5. API Health (`GET /api/health`)** | **PASS (`200 OK`)** | **PASS (`200 OK`)** | `{"status":"ok","service":"virtual-expo-25d-be"}`. |
| **6. 6 V2 Booths & 36 Product Slots** | **PASS (`6` / `36`)** | **PASS (`6` / `36`)** | Hiển thị đầy đủ 6 gian hàng V2 và 36 vị trí trưng bày sản phẩm. |
| **7. 3D Scene & 19 Active GLBs** | **PASS (`19/19`)** | **PASS (`19/19`)** | Tải thành công 19/19 model `.glb` active (`200 OK`), `Failed Assets: []`, `Page Errors: []`. |
| **8. Camera (`Overview`, `Visit`, `Focus`), `WASD`, `Click-to-Move`** | **PASS** | **PASS** | Chuyển chế độ camera và điều khiển nhân vật mượt mà. |
| **9. Product Modal & Admin Dashboard** | **PASS** | **PASS** | Mở/đóng Product Modal và quản trị gian hàng hoạt động đầy đủ. |
| **10. SPA Deep Links & F5 Reload (`/admin`, `/admin/booths/...`)** | **PASS (`200 OK`)** | **PASS (`200 OK`)** | `/admin`, `/admin/booths`, `/admin/booths/booth-tech/slots`, `/admin?tab=slots&filter=active` trả về `200 OK` cả khi mở trực tiếp lẫn khi nhấn **F5 Reload**. |
| **11. Socket.IO Realtime Synchronization** | **PASS** | **PASS** | Kết nối WebSocket/Polling và đồng bộ dữ liệu thời gian thực thành công. |

---

## F. SECURITY REVIEW (PHASE 9)

- **Git Ignore Status:** `FE/.env`, `BE/.env`, `.env`, `.env.*` đều nằm trong [.gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore#L11-L16) (`git check-ignore FE/.env BE/.env .env` xác nhận **PASS**).
- **Secret Exposure Scan:** **`0` phát hiện (`CLEAN`)**. Không có bất kỳ giá trị bí mật nào trong `git diff`, [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md), báo cáo V11 hay bundle `FE/dist`.
- **Out-of-Scope Changes:** **`0` thay đổi ngoài phạm vi**. Không sửa bất kỳ dòng business logic, UI, CSS, Three.js scene, API, Socket.IO, SQLite, `FE/.env`, `BE/.env` hay `vercel.json` nào.

---

## G. GIT REVIEW (PHASE 9)

- **Branch (`git branch --show-current`):** `main`
- **HEAD (`git rev-parse HEAD`):** `6ba92956c444de7f84c0052a52a3f455d4b9d5e6`
- **Modified files (`M`):** `0` files
- **Renamed files (`R`):** `0` files *(3 script nội bộ đã được chuẩn hóa và commit tại `6ba9295`)*
- **Deleted files (`D`):** `1` file (`D ENV_MIGRATION_REVIEW_V10.md` — báo cáo lịch sử V10 đã archive)
- **Untracked files (`??`):** `1` file (`?? REPOSITORY_NAMING_REVIEW_V11.md` — báo cáo V11 này)
- **Cam kết Tuân thủ Khóa An toàn:** Không thực hiện `git commit`, `git push`, `git reset`, `git clean` hoặc deploy.

---

## H. FINAL DECISION

**`B — PARTIAL STANDARDIZATION — HIGH-RISK PATHS PROTECTED`**
