# CONFIG, DOCUMENTATION & FILE NAMING REVIEW REPORT — V6

**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Chế độ thực thi:** `AUDIT → VERIFY → SAFE CLEANUP → REGRESSION TEST → HANDOFF REPORT`  
**Baseline HEAD:** `3ea3d5af18d647d86890c0ab9b0e974ace623b9c` (`main`)  
**Trạng thái tổng thể:** **V6 CLEANUP PASS — LOCAL VERIFIED — PRODUCTION CONFIG PENDING VERIFICATION**  

---

## A. EXECUTIVE SUMMARY

| Chỉ số Kiểm toán V6 | Giá trị | Chi tiết |
|---|---:|---|
| **Tổng số file Tracked kiểm tra đầu vào V6** | **100 files** | `95,786,362 bytes` (`95.79 MB`) tại commit `3ea3d5a` |
| **Số file giữ lại sau V6 (Working Tree)** | **96 files** *(+1 báo cáo V6 = 97 files)* | `95,740,556 bytes` (`95.74 MB`) trước khi thêm báo cáo V6 |
| **Số file lịch sử đã Archive & Xóa ở V6** | **4 files** | `45,806 bytes` (`45.81 KB`) + xóa 1 thư mục rỗng `FE/booth-modeling/metadata/` |
| **Số file đã Đổi tên Chuẩn hóa ở V6** | **1 file** | `FE/booth-modeling/scripts/optimize_phase1_models.py` → `optimize_street_props.py` |
| **Số file Tài liệu đã Cập nhật Tham chiếu** | **2 files** | `README.md`, `FE/booth-modeling/README.md` |
| **Hai file cấu hình `vercel.json` & `FE/vercel.json`** | **Giữ nguyên cả 2 (`KEEP`)** | Tổng `1,019 bytes` — Bảo toàn 100% tương thích cho cả 2 cấu hình `Root Directory` trên Vercel Dashboard |
| **Trạng thái Git** | **Sạch (`0` lỗi diff)** | Không commit, không push, không deploy |

---

## B. VERCEL CONFIGURATION AUDIT (KIỂM TOÁN 2 FILE `vercel.json`)

### 1. Bảng Quyết định & Đánh giá 2 File `vercel.json`

| File | Vai trò thực tế | Có được dùng không? | Có thể xóa? | Cần cấu hình lại Vercel? | Phân loại (Mục 4.3) | Bằng chứng Cụ thể |
|---|---|---|---|---|---|---|
| [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) (`565 B`, Tracked) | Cấu hình Vercel cấp **Monorepo Root** (`buildCommand: "npm run build -w FE"`, `outputDirectory: "FE/dist"`, `installCommand: "npm install"`, `framework: "vite"`, kèm 3 rule `rewrites`). | **Được dùng nếu** Vercel Dashboard đặt `Root Directory = .` (mặc định khi import repo). | **Không xóa ngay** khi chưa kiểm tra mục `Root Directory` trên Vercel Dashboard. | Nếu giữ cả 2 file: **Không cần chỉnh Dashboard**. Nếu xóa file này trong khi `Root Directory = .`, build trên Vercel sẽ lỗi vì không tìm thấy `FE/dist`. | **`UNCERTAIN` *(Conditional REQUIRED)*** | Commit `0a7e916` và `91ab692` tạo file này cho cấu hình gốc Monorepo; cung cấp `buildCommand` & `outputDirectory` bắt buộc khi build từ root. |
| [FE/vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vercel.json) (`454 B`, Tracked) | Cấu hình Vercel cấp **Thư mục con `FE/`** (`framework: "vite"`, kèm 3 rule `rewrites` giống hệt file gốc). | **Được dùng nếu** Vercel Dashboard đặt `Root Directory = FE`. | **Không xóa ngay** khi chưa kiểm tra mục `Root Directory` trên Vercel Dashboard. | Nếu giữ cả 2 file: **Không cần chỉnh Dashboard**. Nếu xóa file này trong khi `Root Directory = FE`, Vercel sẽ mất toàn bộ 3 rule `rewrites` (`/api/*` proxy & SPA fallback). | **`UNCERTAIN` *(Conditional REQUIRED)*** | Commit `91ab692` bổ sung đồng thời cả `vercel.json` và `FE/vercel.json` để đảm bảo `/api/*` rewrites và SPA routing hoạt động dù `Root Directory` trên Dashboard trỏ vào `.` hay `FE`. |

### 2. Đối chiếu Chi tiết 15 Thuộc tính Kỹ thuật (Mục 4.1 & 4.2)

| STT | Thuộc tính kiểm tra | Root `vercel.json` (`565 B`) | `FE/vercel.json` (`454 B`) | Trạng thái trên Vercel Dashboard (`exhibitions-3d.vercel.app`) |
|---:|---|---|---|---|
| 1 | Tồn tại thực tế trên đĩa | **Có** | **Có** | — |
| 2 | Được Git theo dõi (`git ls-files`) | **Có** | **Có** | — |
| 3 | Đang bị modified (`git status`) | **Không (Clean)** | **Không (Clean)** | — |
| 4 | `$schema` | `https://openapi.vercel.sh/vercel.json` | `https://openapi.vercel.sh/vercel.json` | Hợp lệ |
| 5 | `buildCommand` | `"npm run build -w FE"` | *(Không khai báo — dùng mặc định Vite `npm run build`)* | **NOT VERIFIED** *(nằm trên Cloud Dashboard)* |
| 6 | `outputDirectory` | `"FE/dist"` | *(Không khai báo — dùng mặc định Vite `dist`)* | **NOT VERIFIED** *(nằm trên Cloud Dashboard)* |
| 7 | `installCommand` | `"npm install"` | *(Không khai báo — dùng mặc định `npm install`)* | **NOT VERIFIED** *(nằm trên Cloud Dashboard)* |
| 8 | `framework` | `"vite"` | `"vite"` | `"vite"` |
| 9 | `rewrites` / `redirects` | **3 rules `rewrites`:**<br>1. `/api/:path*` → `https://exhibition-xl20.onrender.com/api/:path*`<br>2. `/socket.io/:path*` → `https://exhibition-xl20.onrender.com/socket.io/:path*`<br>3. `/((?!api/\|socket\.io/).*)` → `/index.html` | **3 rules `rewrites` giống hệt 100%** với root `vercel.json` | Đang hoạt động trên Production (`https://exhibitions-3d.vercel.app`) |
| 10 | `headers` | Không có | Không có | Không có |
| 11 | `functions` | Không có | Không có | Không có |
| 12 | `env` / Environment Variables | Không khai báo trong `vercel.json` (đặt trong [FE/.env.production](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/.env.production): `VITE_API_URL` & `VITE_SOCKET_URL`) | Không khai báo trong `FE/vercel.json` (đặt trong `FE/.env.production`) | **NOT VERIFIED** *(Dashboard Env Vars)* |
| 13 | Ảnh hưởng SPA Routing | **Có** (Rule thứ 3 điều hướng mọi đường dẫn không phải `/api/` hoặc `/socket.io/` về `/index.html`) | **Có** (Rule thứ 3 giống hệt) | **CRITICAL** |
| 14 | Ảnh hưởng FE → BE API | **Có** (Rule 1 & 2 proxy `/api/:path*` và `/socket.io/:path*` sang Render `exhibition-xl20.onrender.com`) | **Có** (Rule 1 & 2 giống hệt) | **CRITICAL** |
| 15 | Root Directory thực tế trên Vercel | Dùng khi `Root Directory = .` | Dùng khi `Root Directory = FE` | **NOT VERIFIED** *(cần xem trong `Vercel Dashboard → Settings → General → Root Directory`)* |

> **Kết luận Mục IV:** Theo quy tắc khóa an toàn Mục 4.3 (*"Chỉ được xóa file `REDUNDANT VERIFIED`. Nếu là `REQUIRED` hoặc `UNCERTAIN`, giữ nguyên. Production build PASS không đủ làm bằng chứng xóa `vercel.json`"*), **cả 2 file `vercel.json` (`565 B`) và `FE/vercel.json` (`454 B`) đều được giữ nguyên**. Nếu bạn muốn xóa bớt 1 file sau này, chỉ cần mở `Vercel Dashboard → Project Settings → General → Root Directory`:
> - Nếu `Root Directory` đang để trống (`.`): Vercel đang dùng **root `vercel.json`** → có thể xóa `FE/vercel.json`.
> - Nếu `Root Directory` đang là `FE`: Vercel đang dùng **`FE/vercel.json`** → có thể xóa root `vercel.json`.

---

## C. DOCUMENTATION & REPORT CLEANUP (KIỂM TOÁN TÀI LIỆU & BÁO CÁO)

### 1. Danh sách Tài liệu Lịch sử Đã Archive & Xóa ở V6 (`4 Files` — `45,806 B` + `1 Empty Folder`)
Toàn bộ 4 file dưới đây đã được sao lưu vào thư mục archive độc lập bên ngoài repository kèm kiểm tra mã băm SHA-256 100% trước khi xóa:
- **Đường dẫn Archive V6:** `C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\exhibition-archive-v6\files\`
- **Manifest V6 & Checksum SHA-256:** [v6-archive-manifest.json](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/scratch/exhibition-archive-v6/v6-archive-manifest.json)

| STT | Đường dẫn File Đã Xóa | Kích thước | Phân loại (Mục 5.1) | SHA-256 (16 ký tự) | Lý do Archive & Xóa |
|---:|---|---:|---|---|---|
| 1 | `TEAM_HANDOFF_FINAL_V5.md` | `18,669 B` | `ARCHIVE — HISTORICAL` | `b4999fb38df2c39a` | Báo cáo cleanup phiên bản V5 trước đó; đã được tổng hợp và thay thế bởi báo cáo cuối `CONFIG_DOCS_NAMING_REVIEW_V6.md`. |
| 2 | `qa-reports/EXPO_PLAZA_VISUAL_POLISH_V4_1.md` | `15,146 B` | `ARCHIVE — HISTORICAL` | `5128a1d3bd880684` | Báo cáo nhật ký visual polish V4.1 chứa tên AI agent (`Antigravity — Argon 4`) và đường dẫn ảnh cục bộ `C:/Users/...`; thuộc nhóm `ARCHIVE — HISTORICAL` ("Báo cáo visual polish") theo Mục V.5.1. |
| 3 | `FE/booth-modeling/metadata/booths.json` | `6,362 B` | `ARCHIVE — HISTORICAL` | `6d60649bb7d9300e` | Metadata JSON của 6 gian hàng hộp kín thế hệ V0 (`booth_01..06.glb` đã xóa ở V3); `0` tham chiếu trong runtime/build/test/V2 scripts. Đã xóa luôn thư mục rỗng `FE/booth-modeling/metadata/`. |
| 4 | `FE/booth-modeling/scripts/validate_models.py` | `3,812 B` | `ARCHIVE — HISTORICAL` | `c9434d29c931b353` | Script kiểm định chỉ tìm đọc `booth_01..06.glb` (V0 đã xóa ở V3) và ghi ra `metadata/booths.json`; không dùng cho gian hàng V2. |

### 2. Danh sách Tài liệu & Script Kiểm thử Được Giữ Lại (`KEEP / PROTECTED`)

| Đường dẫn File | Kích thước | Phân loại (Mục 5.1) | Lý do Bảo vệ & Cập nhật |
|---|---:|---|---|
| [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) | `8,042 B` | `KEEP — CURRENT DOCUMENTATION` | Hướng dẫn toàn diện cho nhóm: kiến trúc FE/BE, yêu cầu Node `>=22.5.0`, lệnh cài đặt/chạy/test/build, biến môi trường, deploy và danh sách file `.gitignore`. |
| [.env.example](file:///e:/Lập%20trình/MatBaoWS/exhibition/.env.example) | `747 B` | `KEEP — CURRENT DOCUMENTATION` | File mẫu cấu hình môi trường an toàn (không chứa secret thật). |
| [FE/booth-modeling/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/README.md) | `3,273 B` | `KEEP — CURRENT DOCUMENTATION` | Đã cập nhật lại nội dung để mô tả chính xác 11 script Blender hiện hành (sinh 6 gian hàng V2, 6 gian hàng fallback V1 và tối ưu hóa model `env/`), xóa bỏ hoàn toàn các tham chiếu lỗi thời tới `booth_01..06.glb` và `previews/`. |
| [FE/public/models/booths/roofless-v1/README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/booths/roofless-v1/README.md) | `912 B` | `KEEP — CURRENT DOCUMENTATION` | Tài liệu kỹ thuật mô tả cấu trúc 6 model fallback `roofless-v1/*.glb`. |
| [FE/public/models/exterior/CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CREDITS.md) | `1,761 B` | `PROTECTED (LICENSE)` | Ghi công tác giả và giấy phép **CC-BY 3.0** bắt buộc cho đài phun nước `7b_tCaBRLCI.glb` (Don Carson). |
| [FE/public/models/exterior/CONTINUATION_CREDITS.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/public/models/exterior/CONTINUATION_CREDITS.md) | `2,653 B` | `PROTECTED (LICENSE)` | Ghi nhận việc áp dụng procedural stone heightmap/UV tại runtime lên model `7b_tCaBRLCI.glb` theo điều khoản CC-BY 3.0. |
| [qa-reports/final_regression_test.cjs](file:///e:/Lập%20trình/MatBaoWS/exhibition/qa-reports/final_regression_test.cjs) | `5,620 B` | `PROTECTED (TEST SCRIPT)` | Kịch bản kiểm thử hồi quy trình duyệt tự động (bảo vệ theo Mục V.5.2: *"Không xóa test script chỉ vì nằm trong `qa-reports/`"*). |
| [CONFIG_DOCS_NAMING_REVIEW_V6.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/CONFIG_DOCS_NAMING_REVIEW_V6.md) | Báo cáo này | `KEEP — CURRENT DOCUMENTATION` | Báo cáo bàn giao cuối cùng vòng V6. |

---

## D. FILE & FOLDER NAMING AUDIT (KIỂM TOÁN & CHUẨN HÓA TÊN FILE/THƯ MỤC)

Tuân thủ nghiêm ngặt giới hạn tại Mục VI.6.4 (*"Chỉ được đổi tên file thuộc nhóm: Documentation, Report, Script nội bộ không ảnh hưởng runtime... Không được đổi tên trong V6: React components, Backend routes/controllers/services, Runtime assets, GLB, Texture, Database files, API-related files, Package manifests, TypeScript/Vite configs, Vercel configs đang dùng. Với các file này, chỉ báo cáo đề xuất, không thực hiện"*):

| Old Path | Proposed / New Path | Action Taken in V6 | References Updated | Risk | Giải thích & Bằng chứng |
|---|---|---|---|---|---|
| `FE/booth-modeling/scripts/optimize_phase1_models.py` | [FE/booth-modeling/scripts/optimize_street_props.py](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/booth-modeling/scripts/optimize_street_props.py) | **RENAMED** | `FE/booth-modeling/README.md` (`0` code/build/test refs) | **LOW** | Tên cũ chứa số giai đoạn thử nghiệm lịch sử (`phase1`). Đổi tên theo đúng chức năng tối ưu hóa đạo cụ đường phố (`trash_opt.glb`, v.v.). |
| `qa-reports/EXPO_PLAZA_VISUAL_POLISH_V4_1.md` | *(Archived to `exhibition-archive-v6`)* | **ARCHIVED & DELETED** | `README.md` | **LOW** | Tên chứa phiên bản lịch sử `_V4_1` và nội dung nhật ký prompt AI. |
| `TEAM_HANDOFF_FINAL_V5.md` | [CONFIG_DOCS_NAMING_REVIEW_V6.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/CONFIG_DOCS_NAMING_REVIEW_V6.md) | **ARCHIVED & REPLACED** | Không có tham chiếu code | **LOW** | Thay thế báo cáo V5 bằng báo cáo tổng kết V6 duy nhất theo yêu cầu Mục XI. |
| `FE/public/models/exterior/7b_tCaBRLCI.glb` | *(Đề xuất tương lai: `plaza_fountain.glb`)* | **KEEP (Report Only — Locked by 6.4)** | Nằm trong `ExteriorAssets.tsx:24` & `CREDITS.md` | **HIGH if renamed** | Tên gốc là mã ID từ Poly Pizza (`7b_tCaBRLCI`). Được khóa theo Mục 6.4 (không đổi tên GLB runtime để tránh lỗi đường dẫn & cache). |
| `FE/public/models/env/tree-gian.glb` | *(Đề xuất tương lai: `booth_front_tree.glb`)* | **KEEP (Report Only — Locked by 6.4)** | Nằm trong `ExteriorAssets.tsx:31` | **HIGH if renamed** | Tên pha trộn Việt–Anh (`tree-gian`), nhưng là runtime GLB đang active nên giữ nguyên 100% theo Mục 6.4. |
| `FE/public/models/env/planter-near-ch.glb` | *(Đề xuất tương lai: `bench_planter_cluster.glb`)* | **KEEP (Report Only — Locked by 6.4)** | Nằm trong `ExteriorAssets.tsx:22` | **HIGH if renamed** | Tên viết tắt (`near-ch`), nhưng là runtime GLB đang active nên giữ nguyên 100% theo Mục 6.4. |
| `FE/public/models/env/Street_Lamp.glb` | *(Đề xuất tương lai: `street_lamp.glb`)* | **KEEP (Report Only — Locked by 6.4)** | Nằm trong `ExteriorAssets.tsx:23` | **HIGH if renamed** | Viết hoa chữ cái đầu (`Street_Lamp.glb` — phân biệt hoa/thường trên Linux/Vercel); khớp chính xác với `ExteriorAssets.tsx:23`, giữ nguyên theo Mục 6.4. |
| `FE/src/**` (30 files) & `BE/src/**` (10 files) | Giữ nguyên (`Booth.tsx`, `Environment.tsx`, `useRealtime.ts`, `expoController.ts`, v.v.) | **KEEP (Already Standardized)** | — | **NONE** | 100% tuân thủ chuẩn PascalCase cho React components và camelCase cho hooks/services/controllers/tests. |

---

## E. REGRESSION & CLEAN-CLONE VERIFICATION RESULTS (PHASE 5 & PHASE 6)

Kiểm thử độc lập trên bản **Clean-Clone V6** (sao chép đúng **96 file working tree = `95,740,556 bytes` / `95.74 MB`** sang thư mục cô lập, không sử dụng `node_modules`, `.env`, `BE/data/expo.db`, `dist/` hay 6 file `*_4k.glb` local):

| Hạng mục Kiểm tra | Kết quả | Chi tiết Thực nghiệm |
|---|---|---|
| **1. `npm ci` (Clean Install)** | **PASS** | Cài đặt thành công toàn bộ dependencies từ `package-lock.json`. |
| **2. FE & BE TypeScript (`npm run typecheck`)** | **PASS** | `tsc --noEmit` trên cả `BE` và `FE` đạt `0` lỗi. |
| **3. FE & BE Production Build (`npm run build`)** | **PASS** | `BE` (`tsc`) và `FE` (`vite build`, `680 modules transformed`) thành công. |
| **4. Unit & Integration Tests (`npm test`)** | **PASS** | **`2/2` test files, `31/31` tests passed** (`movementAndPathfinding.test.ts`: 22 tests, `expoBackendAndRealtime.test.ts`: 9 tests). |
| **5. Backend API Health (`GET /api/health`)** | **PASS** | HTTP `200 OK` — `{"status":"ok","service":"virtual-expo-25d-be"}`. |
| **6. Browser GLB Loading (`19/19 Active GLBs`)** | **PASS** | Trình duyệt tải thành công đủ **19/19 model `.glb` active (`200 OK`)**, **`0` lỗi 404/500 (`Failed Assets: []`)**, **`0` lỗi trang (`Page Errors: []`)**. |
| **7. Gameplay (Overview, Tham quan, WASD, Click-to-Move, Camera Focus)** | **PASS** | Chuyển chế độ camera mượt mà, nhân vật di chuyển bằng WASD và Click-to-Move (A*) chính xác. |
| **8. Application (6 V2 Booths, 36 Slots, Product Modal, Admin `/#admin`, WebSocket)** | **PASS** | `Product Modal Opened: true`, `Admin Loaded: true`, đồng bộ thời gian thực qua Socket.IO hoạt động đầy đủ. |
| **9. Quản lý Tiến trình Clean-Clone** | **PASS** | Đóng sạch các tiến trình `BE`/`FE` và xóa thư mục clone tạm ngay sau khi test xong. |

---

## F. DEPLOYMENT IMPACT (TRẢ LỜI TRỰC TIẾP 8 CÂU HỎI MỤC XI.F & 4.4)

Do cả **root `vercel.json`** và **`FE/vercel.json`** đều được giữ nguyên và không có bất kỳ thay đổi nào đối với runtime code hay cấu hình build:

1. **Có cần cài lại (tạo lại) Vercel Project không?** → **KHÔNG.**
2. **Có cần sửa `Root Directory` trên Vercel Dashboard không?** → **KHÔNG** (Dù `Root Directory` hiện tại trên Dashboard đang là `.` hay `FE`, file `vercel.json` tương ứng ở thư mục đó vẫn còn nguyên vẹn).
3. **Có cần sửa `Build Command` không?** → **KHÔNG.**
4. **Có cần sửa `Output Directory` không?** → **KHÔNG.**
5. **Có cần sửa `Environment Variables` không?** → **KHÔNG** (`FE/.env.production` và cấu hình biến môi trường hiện tại không thay đổi).
6. **Có cần redeploy ngay lập tức không?** → **KHÔNG bắt buộc** (Bản cleanup này chỉ loại bỏ các file dư thừa trong Git repository để bàn giao nhóm; khi nhóm push commit mới lên nhánh `main`, Vercel sẽ tự động build như bình thường).
7. **Có ảnh hưởng domain (`https://exhibitions-3d.vercel.app`) hay SPA routing không?** → **KHÔNG.**
8. **Có ảnh hưởng Render Backend (`https://exhibition-xl20.onrender.com`) hay kết nối FE → BE API không?** → **KHÔNG.**

---

## G. GIT DIFF & STATUS REVIEW

- **HEAD (`git rev-parse HEAD`):** `3ea3d5af18d647d86890c0ab9b0e974ace623b9c`
- **Branch (`git branch --show-current`):** `main`
- **`git diff --check`:** **PASS (`0` lỗi khoảng trắng/formatting)**.
- **Trạng thái Working Tree (`git status --short`):**
  - **Deleted (`D` — 4 files):**
    - `D FE/booth-modeling/metadata/booths.json`
    - `D FE/booth-modeling/scripts/validate_models.py`
    - `D TEAM_HANDOFF_FINAL_V5.md`
    - `D qa-reports/EXPO_PLAZA_VISUAL_POLISH_V4_1.md`
  - **Renamed / Untracked + Deleted (`1 script`):**
    - `D FE/booth-modeling/scripts/optimize_phase1_models.py` → `?? FE/booth-modeling/scripts/optimize_street_props.py`
  - **Modified (`M` — 2 documentation files):**
    - `M FE/booth-modeling/README.md`
    - `M README.md`
  - **Untracked (`??` — 1 final report):**
    - `?? CONFIG_DOCS_NAMING_REVIEW_V6.md`
- **Tổng số file trong Repository sau V6:** **97 files** (`95` file từ HEAD + `1` script đổi tên `optimize_street_props.py` + `1` báo cáo `CONFIG_DOCS_NAMING_REVIEW_V6.md`).
- **Xác nhận Khóa An toàn:** Không thực hiện `git commit`, `git push`, `git reset`, `git clean`, `git stash` hoặc deploy.

---

## H. OUTSTANDING RISKS & ITEMS PENDING VERIFICATION

1. **Cấu hình `Root Directory` trên Vercel Cloud Dashboard (`NOT VERIFIED` từ môi trường local):**
   - Vì bảng điều khiển đám mây của Vercel không nằm trong repository local, trạng thái `Root Directory` trên Vercel Dashboard chưa được kiểm tra trực tiếp. Nhờ giữ nguyên cả `vercel.json` (root) và `FE/vercel.json`, rủi ro gây lỗi deploy được giảm về mức tối thiểu (**LOW**).
2. **Kiểm thử Live Deployment sau V6:**
   - Chưa thực hiện push/deploy lên Vercel và Render trong phiên này theo đúng quy tắc khóa an toàn (*"Không commit, Không push, Không deploy"*). Toàn bộ kiểm thử build production (`FE/dist`, `BE/dist`) và Clean-Clone E2E tại local đã đạt **PASS**.
