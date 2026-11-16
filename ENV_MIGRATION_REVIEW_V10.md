# ENVIRONMENT MIGRATION & CONSOLIDATION REVIEW — V10

**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Kiến trúc:** npm Workspaces Monorepo (`FE` + `BE`)  
**Baseline HEAD:** `873fa0fb3c9641dd5fff220b093b8632d1e74723` (`main`)  
**Trạng thái tổng thể:** **V10 MIGRATION PASS — ZERO FUNCTIONAL REGRESSION — ZERO SECRET EXPOSURE**  
**Quyết định cuối cùng (Mục XIII.8):** **`B — MIGRATION COMPLETE — LOCAL VERIFIED — PRODUCTION NOT VERIFIED`**

---

## 1. EXECUTIVE SUMMARY

Quá trình chuẩn hóa và di trú biến môi trường (V10) đã hoàn tất an toàn, đưa cấu trúc biến môi trường của dự án về đúng kiến trúc mục tiêu:

```text
exhibition/
├── FE/
│   ├── .env                  # Cấu hình Frontend local (được .gitignore bảo vệ)
│   └── ...
├── BE/
│   ├── .env                  # Cấu hình Backend local (được .gitignore bảo vệ)
│   └── ...
├── .gitignore
├── README.md
├── vercel.json
└── ...
```

| Chỉ số Migration V10 | Trước V10 | Sau V10 | Chi tiết |
|---|---:|---:|---|
| **Tổng số file `.env*` trong repository** | **3 files** | **2 files** | Trước V10: `.env`, `.env.example`, `FE/.env.production`.<br>Sau V10: Chỉ còn `FE/.env` và `BE/.env` (cả hai đều nằm trong `.gitignore`). |
| **Số file `.env*` bị Tracked trong Git** | **2 files** | **`0` files** | Đã xóa `.env.example` và `FE/.env.production` sau khi xác minh đầy đủ phụ thuộc và cập nhật `README.md`. |
| **Số file `.env*` đã Tạo mới & Di trú** | — | **2 files** | `FE/.env` (3 biến `VITE_*`) và `BE/.env` (6 biến `BE`, chuẩn hóa `PORT=4000`). |
| **Số file `.env*` đã Xóa (sau khi Backup)** | — | **3 files** | Root `.env`, Root `.env.example`, `FE/.env.production`. |
| **Số file bị `BLOCKED`** | — | **`0` files** | Không có file nào bị chặn sau khi điều chỉnh `FE/vite.config.ts` và `BE/src/server.ts`. |
| **Kiểm tra Lộ diện Secret (`Secret Exposure`)** | `0` | **`0` (`CLEAN`)** | Không in giá trị bí mật ra terminal, diff, bundle `FE/dist`, `README.md` hay báo cáo. |

---

## 2. FILE CHANGES (THAY ĐỔI TRÊN TỪNG FILE TRONG V10)

| File | Before V10 | After V10 | Reason |
|---|---|---|---|
| `FE/.env` | `MISSING` | **CREATED (`MIGRATED`, Git Ignored)** | Lưu trữ riêng các biến môi trường Frontend local (`VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_USE_REMOTE_API_IN_DEV`), tách biệt hoàn toàn với Backend secrets. |
| `BE/.env` | `MISSING` | **CREATED (`MIGRATED`, Git Ignored)** | Lưu trữ riêng 6 biến môi trường Backend local (`PORT=4000`, `CORS_ORIGIN`, `SQLITE_DB_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`). Thống nhất `PORT=4000` để đồng bộ với Vite dev proxy. |
| `.env` *(Root)* | `PRESENT` *(Untracked, `379 B`)* | **REMOVED *(Backed up safely)*** | Đã tách hoàn toàn sang `FE/.env` và `BE/.env`; không còn module hay test nào đọc `.env` tại root. |
| `.env.example` *(Root)* | `PRESENT` *(Tracked, `812 B`)* | **REMOVED *(Backed up safely)*** | Đã chuyển toàn bộ hướng dẫn khởi tạo `FE/.env` và `BE/.env` kèm bảng biến mẫu không nhạy cảm vào [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md#L93-L141). |
| `FE/.env.production` | `PRESENT` *(Tracked, `105 B`)* | **REMOVED *(Backed up safely)*** | Hai biến `VITE_API_URL` và `VITE_SOCKET_URL` trong file này trùng khớp 100% với hằng số fallback `DEFAULT_PRODUCTION_BACKEND_URL = 'https://exhibition-xl20.onrender.com'` trong [FE/src/config/apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L10). Xác minh thực nghiệm Clean-Clone build cho thấy kết quả bundle `FE/dist` giữ nguyên 100%. |
| [FE/vite.config.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vite.config.ts) | Có `envDir: '..'` (đọc `.env` ở root) | **UPDATED (`-1` dòng)** | Xóa `envDir: '..'` để Vite mặc định đọc trực tiếp `FE/.env` trong thư mục `FE/`. |
| [BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts) | Dùng `import 'dotenv/config'` (phụ thuộc `process.cwd()`) | **UPDATED** | Nạp `dotenv.config({ path: path.resolve(BE_ROOT_DIR, '.env') })` cố định vào `BE/.env` bất kể `process.cwd()`, bỏ qua khi chạy trong Vitest (`!process.env.VITEST`), và phân giải `SQLITE_DB_PATH` tương đối theo `BE_ROOT_DIR`. |
| [BE/src/middleware/adminAuth.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/middleware/adminAuth.ts) | Đọc `process.env.ADMIN_TOKEN_SECRET` tĩnh lúc import module | **UPDATED** | Đọc `process.env.ADMIN_TOKEN_SECRET || FALLBACK_SECRET` thông qua hàm `getSigningSecret()` (tương tự `getExpectedCredentials()`) để đảm bảo nhận đúng khóa ký sau khi `dotenv.config()` trong `server.ts` thực thi. |
| [.gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore) | Chỉ liệt kê `.env` và `.env.local` | **UPDATED** | Bổ sung `.env`, `.env.*`, `FE/.env`, `FE/.env.*`, `BE/.env`, `BE/.env.*` để chặn triệt để việc commit nhầm file môi trường. |
| [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md) | Hướng dẫn `cp .env.example .env` | **UPDATED** | Cập nhật sơ đồ thư mục và hướng dẫn chi tiết cách tạo `FE/.env`, `BE/.env`, bảng giải thích 9 biến môi trường, hướng dẫn Vercel/Render Dashboard và cảnh báo bảo mật (không chứa bất kỳ secret nào). |

---

## 3. ENVIRONMENT MAPPING (BẢNG ÁNH XẠ BIẾN MÔI TRƯỜNG — KHÔNG GHI GIÁ TRỊ BÍ MẬT)

| Variable Name | Target File (Local) | Local Status | Production Source | Verified |
|---|---|---|---|---|
| `PORT` | `BE/.env` | `MIGRATED` *(Unified to `4000` matching Vite proxy)* | Render Host Injection (`process.env.PORT`) / Fallback `4000` | **YES** |
| `CORS_ORIGIN` | `BE/.env` | `MIGRATED` (`PRESENT`) | Render Dashboard Env + Built-in `*.vercel.app` regex in [server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts#L41) | **YES** |
| `SQLITE_DB_PATH` | `BE/.env` | `MIGRATED` (`PRESENT` — `./data/expo.db` relative to `BE/`) | Render Dashboard Env / Fallback `./data/expo.db` | **YES** |
| `ADMIN_USERNAME` | `BE/.env` | `MIGRATED` (`PRESENT` — `[REDACTED]`) | Render Dashboard Env (`ADMIN_USERNAME`) | **YES** |
| `ADMIN_PASSWORD` | `BE/.env` | `MIGRATED` (`PRESENT` — `[REDACTED_SECRET]`) | Render Dashboard Env (`ADMIN_PASSWORD`) | **YES** |
| `ADMIN_TOKEN_SECRET` | `BE/.env` | `MIGRATED` (`PRESENT` — `[REDACTED_SECRET]`) | Render Dashboard Env (`ADMIN_TOKEN_SECRET`) | **YES** |
| `VITE_API_URL` | `FE/.env` | `MIGRATED` (`PRESENT`) | Vercel Dashboard Env / Fallback `DEFAULT_PRODUCTION_BACKEND_URL` in [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L10) | **YES** |
| `VITE_SOCKET_URL` | `FE/.env` | `MIGRATED` (`PRESENT` / Optional) | Vercel Dashboard Env / Fallback `VITE_API_URL` & `DEFAULT_PRODUCTION_BACKEND_URL` | **YES** |
| `VITE_USE_REMOTE_API_IN_DEV` | `FE/.env` | `MIGRATED` (`PRESENT` — `false`) | Chỉ dùng cho Local Dev (`import.meta.env.DEV`) | **YES** |

---

## 4. DEPENDENCY & CONFIGURATION CHANGES (PHASES 2, 3, 4, 6)

1. **Vite `envDir` ([FE/vite.config.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vite.config.ts#L5-L8)):**
   - Đã loại bỏ cấu hình `envDir: '..'`. Kiểm chứng bằng `vite.resolveConfig` xác nhận cả chế độ `development` (`serve`) và `production` (`build`) đều phân giải `envDir` về đúng `E:/Lập trình/MatBaoWS/exhibition/FE` và nạp đầy đủ `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_USE_REMOTE_API_IN_DEV` từ `FE/.env`.
2. **Backend `dotenv` Loading ([BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts#L15-L18) & [BE/src/middleware/adminAuth.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/middleware/adminAuth.ts#L4-L8)):**
   - Thay thế `import 'dotenv/config'` (vốn phụ thuộc vào `process.cwd()`) bằng:
     ```ts
     const BE_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
     if (!process.env.VITEST) {
       dotenv.config({ path: path.resolve(BE_ROOT_DIR, '.env') });
     }
     ```
   - Đường dẫn `BE_ROOT_DIR` luôn trỏ chính xác về thư mục `BE/` trong cả chế độ dev (`BE/src/server.ts` → `..` = `BE/`) lẫn bản build production (`BE/dist/server.js` → `..` = `BE/`).
   - Trên môi trường Production (Render), `dotenv.config()` mặc định không ghi đè (`override: false`) các biến môi trường `process.env.PORT`, `ADMIN_PASSWORD`, v.v. đã được hệ thống hosting tiêm vào process.
3. **Cô lập Môi trường Kiểm thử (`Test Isolation` — Phase 4):**
   - Nhờ điều kiện `if (!process.env.VITEST)` trong [BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts#L16), khi chạy `npm test` (`vitest run`), trình chạy test **hoàn toàn không nạp `BE/.env` hay bất kỳ secret thực tế nào**, sử dụng SQLite `:memory:` độc lập và thông tin xác thực mặc định an toàn trong test. Không cần tạo thêm `.env.test` và không thay đổi bất kỳ assertion nào của 31 bài test.
4. **Cập nhật `.gitignore` & `README.md` (Phase 6):**
   - [.gitignore](file:///e:/Lập%20trình/MatBaoWS/exhibition/.gitignore#L11-L16) chặn toàn bộ `.env`, `.env.*`, `FE/.env`, `FE/.env.*`, `BE/.env`, `BE/.env.*`. Kiểm tra bằng `git check-ignore FE/.env BE/.env .env` xác nhận cả 3 đường dẫn đều được Git ignore.
   - [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md#L93-L141) cung cấp đầy đủ hướng dẫn tạo `BE/.env` và `FE/.env` với giá trị mẫu không nhạy cảm.

---

## 5. REGRESSION & CLEAN-CLONE VERIFICATION RESULTS (PHASE 7)

Đã kiểm thử toàn diện trên **Working Tree V10** (với `FE/.env` và `BE/.env` mới) và trên bản **Clean-Clone V10 độc lập** (`94 files` Tracked/Working-Tree không chứa bất kỳ file `.env*` nào):

| Hạng mục Kiểm tra | Working Tree V10 (`FE/.env` + `BE/.env`) | Clean-Clone V10 (`npm ci`, Zero `.env`) | Chi tiết Xác minh |
|---|---|---|---|
| **1. Vite `envDir` Resolution** | **PASS (`FE/`)** | **PASS (`FE/`)** | `vite.resolveConfig` xác nhận `envDir = E:/Lập trình/MatBaoWS/exhibition/FE`. |
| **2. Typecheck (`npm run typecheck`)** | **PASS** | **PASS** | `BE` & `FE` (`tsc --noEmit`) đạt `0` lỗi. |
| **3. Production Build (`npm run build`)** | **PASS** | **PASS** | Biên dịch thành công `BE/dist` và `FE/dist` (`680 modules`). |
| **4. Automated Tests (`npm test`)** | **PASS (`31/31`)** | **PASS (`31/31`)** | `2/2` test suites passed (`9` BE tests + `22` FE tests), cô lập hoàn toàn khỏi `.env`. |
| **5. Git Formatting (`git diff --check`)** | **PASS (`CLEAN`)** | N/A | `0` lỗi whitespace hay conflict markers. |
| **6. API Health (`GET /api/health`)** | **PASS (`200 OK`)** | **PASS (`200 OK`)** | `{"status":"ok","service":"virtual-expo-25d-be"}`. |
| **7. 6 V2 Booths & 36 Product Slots** | **PASS (`6` / `36`)** | **PASS (`6` / `36`)** | Đầy đủ 6 gian hàng V2 và 36 vị trí trưng bày sản phẩm. |
| **8. 3D Scene & 19 Active GLBs** | **PASS (`19/19`)** | **PASS (`19/19`)** | Tải thành công 19/19 active GLBs (`200 OK`), `Failed Assets: []`, `Page Errors: []`. |
| **9. Camera, WASD, Click-to-Move, Product Modal** | **PASS** | **PASS** | Toàn cảnh (`Overview`), Tham quan (`Visit`), Focus gian hàng, `WASD`, `Click-to-Move`, mở/đóng `Product Modal` hoạt động mượt mà. |
| **10. Admin Dashboard & SPA Routing (F5 Reload)** | **PASS (`200 OK`)** | **PASS (`200 OK`)** | `/admin`, `/admin/booths`, `/admin/booths/booth-tech/slots`, `/admin?tab=slots&filter=active` đạt `200 OK` cả khi vào trực tiếp lẫn khi nhấn **F5 Reload**. |
| **11. Socket.IO Realtime** | **PASS** | **PASS** | Kết nối WebSocket/Polling và đồng bộ dữ liệu thời gian thực thành công. |

---

## 6. PRODUCTION SAFETY GATE (PHASE 8)

1. **Vercel (`FE` Deployment):**
   - Cấu hình trong [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) (`buildCommand: "npm run build -w FE"`, `outputDirectory: "FE/dist"`, cùng 3 rule `rewrites`) được giữ nguyên tuyệt đối.
   - Khi Vercel Cloud chạy `npm run build --workspace=FE` (không có `FE/.env` local), [FE/src/config/apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L10-L85) ưu tiên lấy `VITE_API_URL` / `VITE_SOCKET_URL` từ Vercel Dashboard Environment Variables và tự động fallback về `DEFAULT_PRODUCTION_BACKEND_URL = 'https://exhibition-xl20.onrender.com'`.
   - Trạng thái kiểm tra trực tiếp trên Cloud Dashboard: **`VERCEL DASHBOARD ENV NOT VERIFIED`** *(tuân thủ khóa không can thiệp Cloud Dashboard từ local)*.
2. **Render (`BE` Deployment):**
   - Trên Render, các biến môi trường (`PORT`, `CORS_ORIGIN`, `SQLITE_DB_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`) được cấp qua `process.env` của hệ thống hosting. Lệnh `dotenv.config({ path: path.resolve(BE_ROOT_DIR, '.env') })` trong [BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts#L17) tự động bỏ qua một cách êm thấm khi không có file `BE/.env` trên container Render và không bao giờ ghi đè `process.env` của Render.
   - Trạng thái kiểm tra trực tiếp trên Cloud Dashboard: **`RENDER DASHBOARD ENV NOT VERIFIED`**.

---

## 7. SECURITY & GIT VERIFICATION (PHASE 9)

- **Kiểm tra Lộ diện Secret (`Secret Exposure`):** **`0` phát hiện (`CLEAN`)** trên toàn bộ `git diff`, [README.md](file:///e:/Lập%20trình/MatBaoWS/exhibition/README.md), báo cáo V10, và bundle `FE/dist`.
- **Kiểm tra Git Ignore (`git check-ignore`):** Cả `FE/.env` và `BE/.env` đều nằm trong danh sách bị Git chặn, **không xuất hiện trong `git status --short`** và không thể bị stage nhầm.
- **Backup & Phương án Rollback (Mục 2.4):** Toàn bộ 10 file trước khi sửa/xóa đã được sao lưu kèm kiểm tra SHA-256 tại thư mục bảo mật giới hạn quyền ACL (`C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\exhibition-archive-v10-migration\files\`), cho phép khôi phục tức thì nếu cần.
- **Trạng thái Git (`git status --short`):**
  - **Modified (`M` — 6 files):** `.gitignore`, `BE/src/middleware/adminAuth.ts`, `BE/src/server.ts`, `FE/booth-modeling/README.md`, `FE/vite.config.ts`, `README.md`
  - **Deleted (`D` — 6 files):** `.env.example`, `FE/.env.production`, `CONFIG_DOCS_NAMING_REVIEW_V6.md`, `VERCEL_CONFIG_REMOVAL_AUDIT_V7.md`, `FE/booth-modeling/scripts/refine_opt_models.py`, `qa-reports/final_regression_test.cjs`
  - **Untracked (`??` — 2 script đã đổi tên từ V8 + 1 báo cáo V10):** `FE/booth-modeling/scripts/decimate_foliage_models.py`, `FE/scripts/browserRegressionTest.cjs`, `ENV_MIGRATION_REVIEW_V10.md`
  - **Local Ignored Env Files (`2 files`):** `FE/.env`, `BE/.env` (hoạt động ở local, được `.gitignore` ẩn hoàn toàn khỏi Git).
  - Không thực hiện `git commit`, `git push` hoặc deploy.

---

## 8. FINAL DECISION

**`B — MIGRATION COMPLETE — LOCAL VERIFIED — PRODUCTION NOT VERIFIED`**
