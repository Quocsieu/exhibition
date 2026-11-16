# TEAM HANDOFF FINAL REPORT — V5

**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Kiến trúc:** npm Workspaces Monorepo (`FE` + `BE`)  
**Stack:** React 18, TypeScript 5.8, Vite 6, React Three Fiber, Three.js, Node.js (`>=22.5.0`), Express 4, Socket.IO 4, SQLite (`node:sqlite`), GLB  
**Baseline HEAD:** `5dd60aec6f3997d7b1c4578782150c21fffabb52` (`main`)  
**Trạng thái bàn giao:** **TEAM HANDOFF CLEANUP PASS**  

---

## A. FINAL SUMMARY (TỔNG KẾT TRẠNG THÁI REPOSITORY BÀN GIAO)

### 1. So sánh Toàn diện Trước & Sau Chuỗi Cleanup (Baseline → V3 → V4 → V5)

| Chỉ số | Git Baseline (Ban đầu) | Sau V3 + V4 | Sau V5 (Bản Bàn Giao Cuối) | Tổng Tiết Kiệm Lũy Kế |
|---|---:|---:|---:|---:|
| **Tổng số file Tracked (`git ls-files`)** | **738 files** | 105 files | **98 files** | **-640 tracked files (`-86.72%`)** |
| **File mới bổ sung cho bàn giao (`Untracked`)** | 0 files | 4 báo cáo rời | **2 files** (`.env.example`, `TEAM_HANDOFF_FINAL_V5.md`) | Chuẩn hóa 1 file `.env.example` + 1 báo cáo tổng |
| **Tổng dung lượng Source & Assets bàn giao** | **`676,656,466 B` (`676.66 MB`)** | `95,860,828 B` (`95.86 MB`) | **`95,768,857 B` (`95.77 MB` / `91.33 MiB`)** *(trước báo cáo này)* | **Giảm `580,887,609 B` (`-580.89 MB` / `-85.85%`)** |
| **Số thư mục rỗng tồn tại trên ổ đĩa** | 0 | **43 folders rỗng** *(38 ở `qa-reports/`, 5 ở `FE/`)* | **0 folders rỗng** | **Đã dọn sạch `43/43` thư mục rỗng (`-100%`)** |
| **Số file đã xóa/archive riêng trong V5** | — | — | **15 files trên đĩa** *(7 tracked `.md` + 3 ignored `.log` + 5 untracked `.md` trung gian)* | Giải phóng toàn bộ file lịch sử/log còn sót |

### 2. Phân bố 98 File Tracked + 2 File Bàn giao Hiện tại (Theo Nhóm Chức năng)

| Nhóm File trong Repository Bàn giao | Số lượng file | Dung lượng (Bytes) | Dung lượng (MB) | Vai trò |
|---|---:|---:|---:|---|
| **1. Frontend Runtime (`FE/src/` 29 files, `FE/index.html`, `FE/.env.production`)** | 31 | `548,625 B` | `0.55 MB` | Toàn bộ giao diện 3D, điều khiển nhân vật, Booth Focus, Product Modal và Admin UI. |
| **2. Backend Runtime (`BE/src/` 9 files)** | 9 | `92,504 B` | `0.09 MB` | Máy chủ Express REST API, xác thực Admin, cơ sở dữ liệu `node:sqlite` và Socket.IO. |
| **3. Active 3D Models (`FE/public/models/` — 19 `.glb` files)** | 19 | `92,988,102 B` | `92.99 MB` | 6 gian hàng V2, 12 model môi trường (`umbrella`, `tree-gian`, `planter-near-ch`, cây xanh, ghế, đèn, tòa nhà) và 1 đài phun nước `7b_tCaBRLCI.glb`. **100% được trình duyệt tải qua HTTP (`200 OK`).** |
| **4. Fallback 3D Models (`FE/public/models/booths/roofless-v1/*.glb`)** | 6 | `1,474,356 B` | `1.47 MB` | 6 model gian hàng không mái V1 (nhánh fallback trong `RooflessBoothShell.tsx` khi `isV2 = false`). |
| **5. Tài liệu Bản quyền (`CREDITS.md`, `CONTINUATION_CREDITS.md`)** | 2 | `4,414 B` | `0.004 MB` | Ghi công tác giả CC-BY 3.0 bắt buộc cho đài phun nước `7b_tCaBRLCI.glb`. |
| **6. Cấu hình Build, Deploy & Test Suites (`package*.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json`, `FE/vercel.json`, 2 file test Vitest)** | 11 | `263,224 B` | `0.26 MB` | Cấu hình npm Workspaces, biên dịch TypeScript/Vite, deploy Vercel và 31 bài test tự động. |
| **7. Blender 3D Pipeline (`FE/booth-modeling/` 14 files, `roofless-v1/README.md`, `generateGlbAssets.ts`)** | 16 | `172,728 B` | `0.17 MB` | 12 script Python Blender + metadata phục vụ tái tạo 6 gian hàng V2 và tối ưu hóa model `env/`. |
| **8. Tài liệu Nhóm & Regression Script (`.gitignore`, `README.md`, `.env.example`, `EXPO_PLAZA_VISUAL_POLISH_V4_1.md`, `final_regression_test.cjs`, `TEAM_HANDOFF_FINAL_V5.md`)** | 6 | `~55,000 B` | `0.05 MB` | Tài liệu hướng dẫn cài đặt nhóm, file mẫu môi trường, đặc tả cảnh quan V4.1 và báo cáo bàn giao cuối. |

---

## B. QA FOLDER & FILESYSTEM CLEANUP (NGUYÊN NHÂN & KẾT QUẢ XỬ LÝ TRIỆT ĐỂ)

### 1. Nguyên nhân Kỹ thuật Tại sao Các Folder Cũ Vẫn Hiển thị Trong VS Code Sau V3/V4
Khi kiểm tra trực tiếp filesystem (`fs.readdirSync`), nguyên nhân chính xác khiến người dùng vẫn thấy hàng loạt thư mục cũ trong VS Code sau V3/V4 là:
1. **Lỗi dấu phân cách đường dẫn Windows trong hàm xóa thư mục rỗng ở V3:** Ở vòng V3, script xóa file dùng `ROOT = 'E:/Lập trình/MatBaoWS/exhibition'` (dấu `/`), trong khi `path.dirname(targetPath)` trên Windows trả về `'E:\\Lập trình\\MatBaoWS\\exhibition\\...'` (dấu `\`). Phép kiểm tra `dir.startsWith(stopRoot)` trả về `false`, dẫn tới việc **toàn bộ file bên trong đã bị xóa nhưng 43 khung thư mục rỗng (`0 files, 0 bytes`) không được gọi `fs.rmdirSync`**, bao gồm:
   - **38 thư mục rỗng trong `qa-reports/`:** `booth-redesign`, `final-regression`, `glb-replacement-verification`, `graphics-continuation` (cùng 10 thư mục con `architecture-after`, `architecture-before`, `architecture-optimized`, `architecture-reference`, `architecture-runtime`, `final`, `paving-before`, `props-after`, `props-before`, `rejected-models`), `hotfix-landscape-verification`, `jacaranda-verification`, `layout-baseline`, `layout-redesign`, `mouse-planter-character-v2`, `p0-verification`, `p1-verification`, `p2-verification`, `perf-baseline`, `perf-optimized`, `phase2-3-4-verification`, `planter-layout-v2`, `planter-replacement`, `production-verification` (+ `screenshots`), `realtime-fix` (+ `screenshots`), `screenshots`, `tree-audit`, `umbrella-treegian-v3`, `v2-verification`, `visual-fix-verification`, `visual-polish-v4`, `visual-polish-v4-1`.
   - **4 thư mục rỗng trong `FE/graphics-audit/`:** `FE/graphics-audit/astra-phase1`, `FE/graphics-audit/handoff-verification`, `FE/graphics-audit/phase2-environment`, và thư mục cha `FE/graphics-audit`.
   - **1 thư mục rỗng trong `FE/booth-modeling/`:** `FE/booth-modeling/previews`.
2. **3 file log bị Git-ignore (`!!`) và 7 báo cáo lịch sử cũ trong `qa-reports/`:** V3/V4 chỉ quét `git ls-files` và giữ lại 7 báo cáo task trung gian cũ cùng 3 file `.log` (`city-finalize-build.log`, `city-refine-build.log`, `props-build.log`) đang bị `.gitignore` ẩn khỏi `git status` thông thường nhưng vẫn hiển thị trên cây thư mục VS Code.

### 2. Bảng Kiểm kê Toàn bộ Filesystem Hiện tại & Hành động Đã Thực thi ở V5

| Đường dẫn Thư mục / Nhóm File | Trạng thái Trước V5 | Trạng thái Git | Phụ thuộc Runtime / Build / Test / Dev | Hành động Thực thi ở V5 | Trạng thái Sau V5 |
|---|---|---|---|---|---|
| **38 thư mục con trong `qa-reports/`** | 38 folders rỗng (`0` files, `0 B`) | Đã xóa file ở V3 | Không (`0` tham chiếu) | Kiểm tra rỗng & xóa bằng `fs.rmdirSync` từ dưới lên | **Đã xóa hoàn toàn (`0` subfolders)** |
| **4 thư mục `FE/graphics-audit/**`** | 4 folders rỗng (`0` files, `0 B`) | Đã xóa file ở V3 | Không (`0` tham chiếu) | Kiểm tra rỗng & xóa bằng `fs.rmdirSync` | **Đã xóa hoàn toàn** |
| **1 thư mục `FE/booth-modeling/previews`** | 1 folder rỗng (`0` files, `0 B`) | Đã xóa file ở V3 | Không (`0` tham chiếu) | Kiểm tra rỗng & xóa bằng `fs.rmdirSync` | **Đã xóa hoàn toàn** |
| **3 file log Blender trong `qa-reports/*.log`** (`city-finalize-build.log`, `city-refine-build.log`, `props-build.log`) | 3 files (`31,682 B`) | Ignored (`!!`) | Không (`0` tham chiếu) | Sao lưu SHA-256 vào archive V5 → Xóa khỏi `qa-reports/` | **Đã xóa hoàn toàn** |
| **7 báo cáo task lịch sử trong `qa-reports/*.md`** (`PLANTER_LAYOUT_HOTFIX_V2_REPORT.md`, `MOUSE_PLANTER_CHARACTER_V2.md`, `UMBRELLA_TREE_GIAN_REPLACEMENT.md`, `FIVE_BOOTHS_V2_IMPLEMENTATION_REPORT.md`, `EXPO_PLAZA_VISUAL_POLISH_V4.md`, `PRODUCTION_REALTIME_VERIFICATION.md`, `FULL_SYSTEM_AUDIT.md`) | 7 files (`95,267 B`) | Tracked | Không (`0` tham chiếu) | Sao lưu SHA-256 vào archive V5 → Xóa khỏi `qa-reports/` | **Đã xóa khỏi working tree (`D`)** |
| **5 báo cáo kiểm toán trung gian V1–V5 trong `qa-reports/`** | 5 files (`370,981 B`) | Untracked (`??`) | Không | Sao lưu SHA-256 vào archive V5 → Thay bằng 1 báo cáo tổng duy nhất `TEAM_HANDOFF_FINAL_V5.md` ở gốc repo | **Đã thu gọn về 1 báo cáo duy nhất** |
| **Thư mục `qa-reports/` (Giữ lại)** | 16 files + 38 folders | Tracked | Có (`final_regression_test.cjs` & `EXPO_PLAZA_VISUAL_POLISH_V4_1.md`) | **KEEP** — Chỉ giữ đúng 2 file tracked cần thiết (`20,766 B`), `0` thư mục con | **Sạch gọn tuyệt đối (2 files, 0 subfolders)** |

---

## C. PROTECTED FILES (DANH MỤC FILE BẢO VỆ TRÊN REPOSITORY & MÁY LOCAL)

### 1. Các File Tracked Được Bảo vệ Tuyệt đối (`98 Tracked Files`)
- **Mã nguồn `FE/src/**` (29 runtime files + 1 test file) & `BE/src/**` (9 runtime files + 1 test file):** Bảo toàn 100% chức năng, giao diện, điều khiển và API.
- **19 Active Runtime GLBs (`FE/public/models/`):**
  - 6 Gian hàng V2: `booths/kinetix-v2/kinetix_booth_v2.glb`, `booths/v2/aether_tech_v2.glb`, `booths/v2/nordic_living_v2.glb`, `booths/v2/ecovita_coffee_v2.glb`, `booths/v2/lumina_design_v2.glb`, `booths/v2/solaris_energy_v2.glb`.
  - 12 Model Môi trường (`FE/public/models/env/`): `fir_tree_01_joined.glb`, `jacaranda_tree_lod.glb`, `shrub_01_joined.glb`, `building03_joined.glb`, `tree-gian.glb`, `planter-near-ch.glb`, `water_manhole_cover_opt.glb`, `trash_opt.glb`, `umbrella.glb`, `bench.glb`, `planter.glb`, `Street_Lamp.glb`.
  - 1 Model Ngoại cảnh (`FE/public/models/exterior/`): `7b_tCaBRLCI.glb` (Đài phun nước trung tâm).
- **6 Fallback GLBs (`FE/public/models/booths/roofless-v1/*.glb`):** `coffee.glb`, `design.glb`, `energy.glb`, `living.glb`, `robotics.glb`, `tech.glb`.
- **2 File Bản quyền (`FE/public/models/exterior/`):** `CREDITS.md`, `CONTINUATION_CREDITS.md`.
- **Cấu hình & Pipeline:** `package.json`, `package-lock.json`, `vercel.json`, `FE/package.json`, `FE/tsconfig.json`, `FE/vite.config.ts`, `FE/vercel.json`, `FE/.env.production`, `BE/package.json`, `BE/tsconfig.json`, `.gitignore`, `README.md`, `FE/scripts/generateGlbAssets.ts`, 14 file trong `FE/booth-modeling/`, `qa-reports/EXPO_PLAZA_VISUAL_POLISH_V4_1.md`, `qa-reports/final_regression_test.cjs`.

### 2. Các File Local Ignored Được Bảo vệ Trên Máy (`PROTECTED LOCAL DATA` — Không Xóa)
- `.env` (`379 B` — cấu hình môi trường cá nhân tại máy gốc).
- `BE/data/expo.db` (`36,864 B` — cơ sở dữ liệu SQLite hiện hành của máy gốc).
- `node_modules/`, `FE/dist/`, `BE/dist/`.
- 6 file model gốc 4K trong `FE/public/models/env/` (`fir_tree_01_4k.glb` `1,028 MB`, `jacaranda_tree_4k.glb` `726.6 MB`, `modular_street_seating_4k.glb` `195.5 MB`, `Building01.glb` `155.8 MB`, `water_manhole_cover_4k.glb` `90.2 MB`, `shrub_01_4k.glb` `79.2 MB`) cùng `FE/booth-modeling/tools/` và `FE/booth-modeling/sand3d-repo/`: Được giữ nguyên trên ổ đĩa local để phục vụ Blender nếu cần, đã được `.gitignore` loại trừ và **đã chứng minh qua Clean-Clone rằng thành viên nhóm hoàn toàn không cần các file này để chạy/build/test dự án**.

### 3. Hệ thống Bản Lưu trữ Ngoài Repository (External Archives)
- **Archive V3 + V4 (`633` files — `580.80 MB`):** [archive-manifest.json](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/scratch/exhibition-archive-v3/archive-manifest.json) & [v4-archive-manifest.json](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/scratch/exhibition-archive-v3/v4-archive-manifest.json)
- **Archive V5 (`15` files từ `qa-reports/`):** [v5-qa-archive-manifest.json](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/scratch/exhibition-qa-archive-v5/v5-qa-archive-manifest.json)

---

## D. TEAM SETUP GUIDE (HƯỚNG DẪN DÀNH CHO THÀNH VIÊN NHÓM)

Đã cập nhật đầy đủ trong [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) và tạo mới file mẫu [.env.example](file:///e:/Lập%20trình/MatBaoWS/exhibition/.env.example):

```bash
# 1. Clone dự án (Yêu cầu Node.js >= 22.5.0, npm >= 10.0.0)
git clone <repository-url>
cd exhibition

# 2. Cài đặt dependencies cho cả Root, FE và BE
npm ci   # hoặc: npm install

# 3. (Tùy chọn) Tạo file .env từ mẫu .env.example
cp .env.example .env

# 4. Chạy đồng thời Backend (http://localhost:4000) & Frontend (http://localhost:5173)
npm run dev

# 5. Kiểm tra kiểu dữ liệu, chạy 31 bài test tự động & build production
npm run typecheck
npm test
npm run build
```

---

## E. REGRESSION & CLEAN-CLONE VERIFICATION RESULTS (PHASE 6 & PHASE 7)

Thử nghiệm độc lập trên bản **Clean-Clone V5** (chỉ sao chép đúng **99 file bàn giao = 98 tracked files + `.env.example`, tổng dung lượng `95.77 MB`**; hoàn toàn không có `node_modules`, `.env`, `BE/data/expo.db` hay file `*_4k.glb` của máy gốc):

| Hạng mục Kiểm thử | Kết quả | Bằng chứng & Chi tiết Thực tế |
|---|---|---|
| **1. `npm ci` (Clean Install)** | **PASS** | Cài đặt sạch toàn bộ workspace dependencies từ `package-lock.json`. |
| **2. `npm run typecheck` (`BE` + `FE`)** | **PASS** | `tsc --noEmit` trên cả `BE` và `FE` đạt `0` lỗi (`--noUnusedLocals --noUnusedParameters` cũng đạt `0` lỗi). |
| **3. `npm run build` (`BE` + `FE`)** | **PASS** | `BE/dist` và `FE/dist` (`680 modules transformed`) biên dịch thành công. |
| **4. `npm test` (`vitest run`)** | **PASS** | `2/2` test suites, **`31/31` tests passed** (`expoBackendAndRealtime.test.ts`: 9 tests, `movementAndPathfinding.test.ts`: 22 tests). |
| **5. API Health (`/api/health` & `/api/booths`)** | **PASS** | `GET /api/health` trả về `200 {"status":"ok","service":"virtual-expo-25d-be"}`; SQLite tự khởi tạo DB mới và seed đủ 6 gian hàng + 12 sản phẩm mẫu. |
| **6. 19 Active GLBs & Network Check** | **PASS** | Trình duyệt tải thành công **19/19 file `.glb` active (`200 OK`)**, **`0` lỗi 404/500 (`Failed Assets: []`)**, **`0` lỗi console/WebGL (`Page Errors: []`)**. |
| **7. Overview, Cảnh quan V4.1, `umbrella`, `tree-gian`, `planter-near-ch.glb`, Đài phun nước** | **PASS** | Hiển thị chính xác 100% ([v5_final_01_overview.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v5_final_01_overview.png)). |
| **8. Chế độ Tham quan, WASD, Click-to-Move (A*), Mouse Drag/Zoom & Nhân vật** | **PASS** | Nhân vật di chuyển mượt, tránh vật cản chính xác, camera theo sau ổn định ([v5_final_02_explore.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v5_final_02_explore.png)). |
| **9. Booth Focus, 36 Product Slots & Product Modal** | **PASS** | Click gian hàng chuyển camera sang góc nhìn trưng bày 3D, click thẻ sản phẩm mở đúng hộp thoại chi tiết ([v5_final_03_booth_modal.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v5_final_03_booth_modal.png)). |
| **10. Admin Dashboard (`/#admin`) & Socket.IO Realtime** | **PASS** | Đăng nhập thành công, hiển thị đủ 6 gian hàng, `11/36` vị trí trưng bày, `12` sản phẩm trong kho và kết nối Socket.IO trực tuyến ([v5_final_04_admin.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/v5_final_04_admin.png)). |
| **11. Quản lý Tiến trình & Dọn thư mục Clean-Clone** | **PASS** | Tiến trình `BE` và `FE` được đóng gọn gàng, thư mục tạm `clean-clone-final-v5` đã được xóa sạch mà không bị treo. |

---

## F. SECURITY FINDINGS (KIỂM TOÁN BẢO MẬT TRƯỚC KHI CHIA SẺ NHÓM)

1. **File `.env` và Dữ liệu Local:**
   - File `.env` đã nằm trong `.gitignore` và **không bị theo dõi bởi Git**.
   - File mẫu [.env.example](file:///e:/Lập%20trình/MatBaoWS/exhibition/.env.example) mới tạo chỉ chứa giá trị mẫu (`ADMIN_PASSWORD=change-me-in-production`, `ADMIN_TOKEN_SECRET=replace-with-random-64-char-hex-secret`), hoàn toàn không chứa secret thật.
2. **Thông tin Đăng nhập Admin Mặc định (PoC Fallback Credentials):**
   - Trong [BE/src/middleware/adminAuth.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/middleware/adminAuth.ts#L7-L8) và giao diện gợi ý đăng nhập tại [FE/src/pages/AdminPage.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/AdminPage.tsx), hệ thống có giá trị fallback mặc định cho môi trường PoC khi chưa đặt biến môi trường (`ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=expo-admin-2026`).
   - **Khuyến nghị cho nhóm:** Giữ nguyên để thuận tiện chạy thử nghiệm ở local, nhưng **bắt buộc** thiết lập biến môi trường `ADMIN_USERNAME`, `ADMIN_PASSWORD` mạnh và `ADMIN_TOKEN_SECRET` cố định trên bảng điều khiển Render/VPS khi triển khai môi trường Production.
3. **Không phát hiện khóa bí mật bị lộ:** Không có private key, cloud API key hay thông tin nhạy cảm nào nằm trong 98 file tracked.

---

## G. GIT STATUS & FINAL REVIEW (PHASE 8)

- **Branch:** `main`
- **HEAD:** `5dd60aec6f3997d7b1c4578782150c21fffabb52`
- **`git diff --check`:** **PASS** (`0` lỗi whitespace/conflict).
- **File Modified (`M` — 5 files):**
  - [ .gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore) (bổ sung ignore `data/*.db*`)
  - [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) (chuẩn hóa hướng dẫn cài đặt & bàn giao nhóm)
  - [FE/src/scene/Booth.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Booth.tsx) (xóa 2 hằng số dead code nội bộ không dùng)
  - [FE/src/scene/Environment.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/Environment.tsx) (xóa 1 import không dùng)
  - [FE/src/scene/ExteriorAssets.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/ExteriorAssets.tsx) (xóa default import `React` & prop nội bộ `level` không dùng)
- **File Deleted (`D` — 640 files):** Toàn bộ 640 file lịch sử/trung gian/không sử dụng (613 ở V3 + 20 ở V4 + 7 ở V5) đã được lưu trữ ngoài repo kèm SHA-256 manifest và loại bỏ khỏi working tree.
- **File Untracked (`??` — 2 files):**
  - [.env.example](file:///e:/Lập%20trình/MatBaoWS/exhibition/.env.example)
  - [TEAM_HANDOFF_FINAL_V5.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/TEAM_HANDOFF_FINAL_V5.md)
- **Xác nhận Tuân thủ Khóa Git:** Không thực hiện `git commit`, `git push`, `git reset`, `git clean`, `git stash` hoặc deploy.

---

## H. OUTSTANDING RISKS & ITEMS NOT EXECUTED BY DESIGN

Để đảm bảo tính trung thực tuyệt đối của báo cáo kiểm toán:
1. **Triển khai trực tiếp lên Cloud (Live Production Deployment trên Vercel & Render):** **CHƯA THỰC THI** trong phiên này do tuân thủ quy tắc khóa an toàn (*"Tuyệt đối không được: Commit, Push, Deploy"*). Bản build Production (`FE/dist` và `BE/dist`) và cấu hình `vercel.json` / `.env.production` đã được kiểm chứng đầy đủ tại local.
2. **Chạy lại Blender Headless trên 6 file `*_4k.glb` gốc:** **KHÔNG CHẠY LẠI** trong phiên này vì toàn bộ 19 file `.glb` active và 6 file `.glb` fallback đã được biên dịch sẵn trong `FE/public/models/` và giữ nguyên 100% không thay đổi.
3. **Dung lượng 2 file cây xanh active (`fir_tree_01_joined.glb` `41.20 MB` và `jacaranda_tree_lod.glb` `34.26 MB`):** Hai file này chiếm `75.46 MB / 95.77 MB` của repository nhưng là **active runtime assets** đang hiển thị trực tiếp trên sân triển lãm, do đó được bảo toàn nguyên vẹn theo quy tắc không thay đổi chất lượng đồ họa.
