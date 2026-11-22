# GRAND EXPO V28 — PRODUCTION DEPLOYMENT PREFLIGHT AUDIT

- **Ngày kiểm tra:** 2026-11-22
- **Production Domain:** `https://3dtrienlamso.mbws.vn/`
- **Production Backend (xác minh thực tế):** `https://exhibition-xl20.onrender.com`
- **Chế độ:** Read-Only Preflight Audit (không sửa code, không sửa DB, không commit/push/deploy/ZIP)
- **Final Verdict:** **NOT READY** *(Gate 2 FAIL — P1 nguy cơ mất ảnh sản phẩm trên Render ephemeral disk; Gate 1 & Gate 4 BLOCKED chờ xác minh cấu hình Render/Plesk)*

---

## 1. Executive Summary

Toàn bộ source code của 4 Phase triển khai **Website Product Import → 3D Booth** đã **PASS 100% build và regression** (`40/40` test files, `176/176` tests PASS, BE/FE build PASS, Chrome WebGL 3D E2E PASS trên gian `#3`).

Tuy nhiên, Preflight Audit thực tế phát hiện **3 điểm chặn quan trọng** trước khi đưa lên Production:
1. **P1 (Gate 2 — FAIL): Nguy cơ mất toàn bộ ảnh sản phẩm sau restart/redeploy Backend.** Backend Production thực tế đang chạy trên **Render** (`https://exhibition-xl20.onrender.com`), không phải Node.js trên Plesk. Ảnh ingest hiện lưu cứng tại `path.resolve(process.cwd(), 'data', 'product-images')` (`BE/src/routes/v28Routes.ts:104-106`) và **không được `CloudDbSyncManager` đồng bộ lên PostgreSQL**. Nếu Render không gắn Persistent Disk cho thư mục này (hoặc không lưu sang Object Storage / DB), mọi lần restart/redeploy Render sẽ xóa sạch ảnh `/api/v28/product-images/...`, gây lỗi ảnh 404 trên gian hàng 3D.
2. **Gate 1 — BLOCKED:** Không có quyền truy cập Plesk panel / Render dashboard để xác minh Persistent Disk, dung lượng đĩa trống, chính sách backup tự động và biến môi trường thực tế trên server.
3. **Gate 4 — BLOCKED:** Không có quyền truy cập Render dashboard để xác minh `DATABASE_URL` (PostgreSQL Snapshot Sync) đang hoạt động ổn định và đã có bản backup nhất quán mới nhất trước khi deploy.

---

## 2. Git Baseline (Phase 0 — Gate 0: PASS)

| Hạng mục | Bằng chứng thực tế | Đánh giá |
| --- | --- | --- |
| Branch / HEAD | `main` @ `149f92f` | OK |
| File chỉnh sửa (7 files) | `BE/src/database/v28Database.ts`, `BE/src/integrations/productAdapter.ts`, `BE/src/routes/v28Routes.ts`, `FE/src/components/adminV28/ExhibitionConfigurator.tsx`, `FE/src/components/adminV28/ProductCatalog.tsx`, `FE/src/scene/sceneTextures.ts`, `FE/src/services/v28Api.ts` | Đúng phạm vi 4 Phase |
| File mới trong phạm vi | `v28WebsiteCrawlerService.ts`, `v28ProductImageService.ts`, 4 file test Phase 1–4, 5 báo cáo `docs/round2/URL_IMPORT_*.md` | Đúng phạm vi |
| File untracked ngoài phạm vi deploy | `.agents/`, `BE/data/`, `FE_dist_v28*.zip`, `GRAND_EXPO_V28_PRODUCTION_HARDENING_REPORT.md`, `skills-lock.json` | **Lưu ý:** Không được `git add .` khi commit |
| Dependency mới (`package.json`) | `git diff package.json FE/package.json BE/package.json` → rỗng | 0 dependency mới |
| Secrets / `.env` / `.db` / `.zip` tracked | `git ls-files \| Select-String "\.env\|\.db$\|\.sqlite\|\.zip$\|product-images"` → rỗng | An toàn |
| Breaking API / Schema DB | 0 thay đổi schema SQLite; chỉ thêm endpoint mới và nâng `listProducts` max `limit` `100 → 250` | Tương thích ngược 100% |

**Gate 0: PASS**

---

## 3. Production Architecture (Phase 1 — Gate 1: BLOCKED)

### 3.1. Xác minh từ Repository & Request công khai an toàn (`GET/HEAD`)
| Thành phần | Kết quả xác minh thực tế | Nguồn bằng chứng |
| --- | --- | --- |
| **Frontend Static** | Chạy trên **Plesk Nginx** tại `https://3dtrienlamso.mbws.vn/` (`HEAD` → `200`, `server: nginx`, `content-type: text/html`). Thư mục webroot: `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/`. | Live `HEAD` + lịch sử Plesk |
| **Proxy `/api` trên Plesk** | **KHÔNG proxy `/api` về Backend.** `HEAD https://3dtrienlamso.mbws.vn/api/v28/exhibitions/active` trả về `200 text/html` (SPA fallback về `index.html`). | Live `HEAD` |
| **Backend Node.js** | Chạy độc lập trên **Render** tại `https://exhibition-xl20.onrender.com` (`GET /api/v28/exhibitions/active` → `200`, `server: cloudflare`, `etag: "v28-ver-e6c731fbc2-ee1efdd3c7e2"`, **100 booths, 10 zones**). | Live `GET` + `FE/.env` |
| **CORS Cross-Origin** | `GET /api/v28/exhibitions/active` với `Origin: https://3dtrienlamso.mbws.vn` trả về `Access-Control-Allow-Origin: https://3dtrienlamso.mbws.vn`. | Live `GET` + `BE/src/server.ts:55` |
| **SQLite + Cloud Sync** | `BE/src/server.ts:186-226` đọc `SQLITE_DB_PATH` / `V28_SQLITE_DB_PATH` (mặc định `./data/expo.db` & `./data/expo_v28_dev.db`) và đồng bộ snapshot lên PostgreSQL qua `CloudDbSyncManager` nếu có `DATABASE_URL`. | `BE/src/server.ts` |
| **HTTPS** | Cả `https://3dtrienlamso.mbws.vn/` và `https://exhibition-xl20.onrender.com` đều phục vụ qua HTTPS. | Live `HEAD/GET` |

### 3.2. Điều CHƯA thể xác minh (thiếu quyền truy cập server/dashboard)
1. Render service `exhibition-xl20` có gắn **Render Persistent Disk** hay đang chạy **ephemeral filesystem**?
2. Render service có bật `DATABASE_URL` (Neon/Supabase/Render PostgreSQL) và sync thành công không?
3. Giới hạn dung lượng ổ đĩa (disk quota) trên Plesk và Render.
4. Lịch backup tự động và quy trình restore trên Plesk & PostgreSQL/Render.

**Gate 1: BLOCKED** — Cần quản trị viên xác nhận cấu hình Render (Persistent Disk, `DATABASE_URL`, disk quota) và Plesk backup trước khi mở khóa.

---

## 4. Persistent Image Storage (Phase 2 — Gate 2: FAIL — P1)

Kiểm tra `BE/src/services/v28ProductImageService.ts` và `BE/src/routes/v28Routes.ts`:

| Tiêu chí | Trạng thái | Chi tiết bằng chứng |
| --- | --- | --- |
| Tự tạo thư mục | **PASS** | `fs.mkdirSync(this.storageDir, { recursive: true })` (`v28ProductImageService.ts:79`). |
| MIME & Cache headers | **PASS** | `Content-Type: image/jpeg\|png\|webp`, `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`. |
| Chống Path Traversal | **PASS** | Regex nghiêm ngặt `/^[a-f0-9]{16}\.(jpg\|png\|webp)$/` (`v28ProductImageService.ts:69,87`). |
| Chống SSRF & Redirect | **PASS** | Gọi `validateExternalUrlSafetyWithIp` trên mọi redirect hop (`MAX_IMAGE_REDIRECTS = 3`), timeout `10s`, kiểm tra magic bytes JPG/PNG/WebP. |
| Giới hạn kích thước file | **PASS** | Tối đa `5 MB` / ảnh (`MAX_PRODUCT_IMAGE_BYTES`). |
| Hoạt động với WebGL | **PASS** | `sceneTextures.ts` resolve `/api/...` qua `API_BASE_URL` + `crossOrigin = 'anonymous'`, đã xác minh hiển thị 6/6 thẻ 3D trên Chrome. |
| **Đường dẫn ổn định & Persistent khi deploy/restart** | **FAIL (P1)** | `v28Routes.ts:105` hardcode `path.resolve(process.cwd(), 'data', 'product-images')`, không có biến môi trường `V28_PRODUCT_IMAGES_DIR`. Trên Render ephemeral disk, **mọi lần restart/redeploy sẽ xóa sạch ảnh** và `CloudDbSyncManager` **không backup/sync** thư mục ảnh này. |
| **Giới hạn tổng dung lượng đĩa (disk quota)** | **WARN (P2)** | Chỉ giới hạn `5 MB`/file, chưa có giới hạn tổng dung lượng thư mục hoặc dọn ảnh mồ côi. |

**Gate 2: FAIL (P1)** — Phải tách sang persistent storage (Render Persistent Disk gắn qua env `V28_PRODUCT_IMAGES_DIR`, hoặc đồng bộ lên Object Storage S3/R2/Cloudinary, hoặc lưu snapshot/blob an toàn) trước khi dùng tính năng ingest ảnh trên Production.

---

## 5. API & Environment (Phase 3 — Gate 3: PASS)

| Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- |
| `VITE_API_URL` trong FE build | **PASS** | `FE/.env` đặt `VITE_API_URL=https://exhibition-xl20.onrender.com`; bundle `FE/dist/assets/index-D9sZKNma.js` chứa đúng `https://exhibition-xl20.onrender.com`. |
| `VITE_NPC_TTS_MODE=hybrid` | **PASS** | Build với `VITE_NPC_TTS_MODE=hybrid`; bundle chứa `manifest.json`; xác nhận đủ **85/85** file `.wav` và `manifest.json` trong cả `FE/public/tts/pregen` và `FE/dist/tts/pregen`. |
| Secrets trong FE bundle | **PASS** | Quét regex (`AIza...`, `sk-...`, `ADMIN_PASSWORD`, `expo-admin-2026`) → **0 kết quả**. |
| Đường dẫn Windows trong FE bundle | **PASS** | Quét regex `[A-Za-z]:\\...` → **0 kết quả**. |
| `localhost` trong FE bundle | **P3 Note** | Tồn tại 2 dòng fallback dev `http://localhost:4000` trong `FE/src/services/api.ts:292,388` (chỉ chạy trong nhánh retry khi primary URL lỗi; không ảnh hưởng luồng Production bình thường, nên bọc sau `import.meta.env.DEV` ở đợt dọn sau). |
| CORS & Auth Admin | **PASS** | Live CORS cho phép `https://3dtrienlamso.mbws.vn`; toàn bộ route ghi (`POST /imports/website`, `POST /images/ingest`, `POST /products/batch`, `PUT /booths/:id/slots/:slotId`) đều bảo vệ bằng `requireAdminAuth`. `GET /api/v28/product-images/:filename` trả `404` trên Production hiện tại (chưa deploy BE mới — đúng dự kiến). |
| Endpoint debug/test public | **PASS** | Không phát hiện endpoint debug/test công khai mới. |

**Gate 3: PASS** *(lưu ý: không thể đọc trực tiếp biến môi trường bí mật trên Render dashboard, cần admin xác nhận `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`, `DATABASE_URL` đã được cấu hình trên Render).*

---

## 6. SQLite Data Safety (Phase 4 — Gate 4: BLOCKED)

| Tiêu chí | Trạng thái | Bằng chứng |
| --- | --- | --- |
| WAL mode & Foreign Keys | **PASS** | `v28Database.ts:70-72`: `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`. |
| Migration tương thích ngược | **PASS** | 0 thay đổi schema trong 4 Phase; `runV28Migration()` là idempotent trong `BEGIN IMMEDIATE`. |
| Không tự seed/ghi đè 100 gian khi restart | **PASS** | `ensureBaseTablesIfEmpty()` (`v28Database.ts:77-84`) kiểm tra `SELECT name FROM sqlite_master WHERE name='booths'` và thoát ngay nếu bảng đã tồn tại. |
| Cảnh báo ghi đè slot | **PASS** | `ProductCatalog.tsx` hiển thị `(đã có SP)` / `(trống)` và cảnh báo trước khi ghi đè slot. |
| Cloud Snapshot Sync | **PASS (Code)** | `server.ts:199-226` restore `v27`/`v28` lúc boot và `PRAGMA wal_checkpoint(TRUNCATE)` + sync lên bảng PostgreSQL `expo_sqlite_snapshots` sau mỗi mutating request. |
| **Xác minh Production `DATABASE_URL` & Backup trước deploy** | **BLOCKED** | Không có quyền truy cập Render/PostgreSQL để kiểm tra snapshot mới nhất và chụp backup trước deploy. |

**Gate 4: BLOCKED** — Cần xác nhận `DATABASE_URL` đang active trên Render và export 1 bản backup PostgreSQL (`expo_sqlite_snapshots`) trước khi deploy Backend.

---

## 7. Build & Regression (Phase 5 — Gate 5: PASS)

| Kiểm tra | Lệnh thực tế | Kết quả |
| --- | --- | --- |
| Backend Build | `npm --prefix BE run build` | **PASS** (0 lỗi TypeScript) |
| Frontend Build (Hybrid TTS) | `$env:VITE_NPC_TTS_MODE='hybrid'; npm --prefix FE run build` | **PASS** (734 modules, 85 WAVs + `manifest.json`) |
| Full Regression Suite (FE + BE) | `npx vitest run --no-file-parallelism` | **PASS — 40/40 files, 176/176 tests PASSED** |
| Phase 1–4 Dedicated Tests | `v28WebsiteCrawlerPhase1` (10), `v28ProductImagesPhase2` (3), `v28BatchImportPhase3` (1), `v28BoothIntegrationPhase4` (1) | **PASS (15/15)** |
| 60 SP / 10 Gian trên DB Test | `v28BoothIntegrationPhase4.test.ts` | **PASS** (60/60 SP, giữ nguyên gian `#1, #2`, bền vững sau đóng/mở DB) |
| 3D Headless Chrome E2E | `scratch/url_import_phase4_browser_qa.mjs` | **PASS** (`0` runtime errors, `0` 404s, ảnh `/api/v28/product-images/...` tải qua CORS) |
| Bảo toàn Hotfix P1/P2-01 & Ẩn Excel | Verified qua `git diff` + full test suite | **PASS** (Excel vẫn ẩn, P1/P2-01 nguyên vẹn) |

> **Giới hạn bằng chứng trực quan (minh bạch):** Trên Headless Chrome 3D E2E, ảnh chụp trực quan xác nhận **gian `#3` (6/6 sản phẩm)** hiển thị đầy đủ ảnh 3D; toàn bộ **10 gian × 6 slot = 60 sản phẩm** đã được xác minh tự động ở tầng API + Active World JSON + SQLite reopen (`v28BoothIntegrationPhase4.test.ts`), chưa chụp screenshot từng gian cho đủ 10/10 gian.

**Gate 5: PASS**

---

## 8. Deployment Plan (Phase 6 — Chỉ lập kế hoạch, chưa thực thi)

1. **Điều kiện tiên quyết (bắt buộc trước bước 2):**
   - Giải quyết **P1 Gate 2** (gắn Render Persistent Disk + env `V28_PRODUCT_IMAGES_DIR`, hoặc chuyển sang Object Storage/DB storage).
   - Xác nhận Render `DATABASE_URL` đang chạy và tạo backup PostgreSQL (`pg_dump` bảng `expo_sqlite_snapshots`).
   - Sao lưu thư mục `httpdocs` hiện tại trên Plesk (đặc biệt giữ nguyên bản backup `FE_dist_v28_149f92f.zip`).
2. **Thứ tự deploy (BE trước, FE sau — giảm thiểu downtime):**
   - **Bước A — Backend (Render):** Commit đúng các file source/test (loại trừ `.zip`, `BE/data/`, `.agents/`, `skills-lock.json`) → push lên `main` để Render build & deploy BE mới. *(Downtime ngắn ~15–30s lúc Render swap container nếu không dùng zero-downtime plan.)*
   - **Bước B — Kiểm tra BE live:** Gọi `GET https://exhibition-xl20.onrender.com/api/v28/exhibitions/active` (xác nhận vẫn đủ 100 gian / 10 khu) và `HEAD https://exhibition-xl20.onrender.com/api/v28/product-images/0000000000000000.png` (trả `404` chuẩn từ Express route mới).
   - **Bước C — Frontend (Plesk):** Build FE với `VITE_NPC_TTS_MODE=hybrid`, nén POSIX ZIP (chỉ gồm nội dung `FE/dist/*`), upload lên `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/` và giải nén đè (hoặc xóa `assets/index-*.js` cũ trước khi giải nén; **tuyệt đối giữ nguyên** `/tts/pregen/` gồm 85 file WAV + `manifest.json` và `/models/`).
3. **Smoke Test sau deploy:**
   - Mở `https://3dtrienlamso.mbws.vn/` → kiểm tra 100 gian / 10 khu, NPC Hybrid TTS, 0 lỗi console/404.
   - Mở `/admin` → xác nhận nút Import Excel vẫn ẩn, ô `Số SP cần lấy (1–120)` hiển thị, cảnh báo slot `(đã có SP)` hoạt động.
   - Thử ingest 1 ảnh test + gắn vào 1 slot test → reload trang 3D xác nhận ảnh hiển thị trên kệ 3D, sau đó restart Render service và xác nhận ảnh **không bị 404** sau restart.

---

## 9. Rollback Plan

| Thành phần | Quy trình Rollback |
| --- | --- |
| **Frontend (Plesk)** | Giải nén lại gói ổn định trước đó (`FE_dist_v28_149f92f.zip`) vào `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/`, xóa file `assets/index-D9sZKNma.js` mới. |
| **Backend (Render)** | Dùng tính năng **Rollback to previous deploy (`149f92f`)** ngay trên Render Dashboard (mất ~30–60s). Không cần rollback schema vì DB không đổi schema. |
| **Database (SQLite / PostgreSQL)** | Nếu có sự cố dữ liệu: dừng Render service → restore bảng `expo_sqlite_snapshots` từ bản `pg_dump` trước deploy → khởi động lại Render để `CloudDbSyncManager` tự khôi phục file SQLite sạch. |
| **Product Images** | Restore thư mục persistent disk / bucket từ snapshot trước deploy. |

**Gate 6: PASS**

---

## 10. Risk Register (P0 / P1 / P2 / P3)

| Mức độ | Mã | Mô tả rủi ro | Biện pháp xử lý |
| --- | --- | --- | --- |
| **P1** | `PREFLIGHT-01` | `BE/data/product-images/` lưu trên Render ephemeral disk, không có env `V28_PRODUCT_IMAGES_DIR` và không được `CloudDbSyncManager` sync → **mất toàn bộ ảnh sản phẩm khi Render restart/redeploy**. | Thêm env `V28_PRODUCT_IMAGES_DIR` + gắn Render Persistent Disk, hoặc lưu ảnh vào Object Storage (R2/S3) / bảng SQLite/PostgreSQL blob. |
| **P1** | `PREFLIGHT-02` | Chưa xác minh trạng thái `DATABASE_URL` và bản backup PostgreSQL trên Render trước deploy. | Kiểm tra log Render (`Cloud DB Persistence: ENABLED`) và `pg_dump` trước khi deploy BE. |
| **P2** | `PREFLIGHT-03` | Chưa có giới hạn tổng dung lượng (disk quota) và cơ chế dọn ảnh mồ côi trong `product-images/`. | Bổ sung cap tổng dung lượng (vd. `500 MB`) hoặc dọn ảnh không còn tham chiếu bởi sản phẩm nào. |
| **P2** | `PREFLIGHT-04` | Working tree hiện có nhiều file untracked ngoài phạm vi (`FE_dist_v28*.zip`, `BE/data/`, `.agents/`). | Khi commit chỉ stage đúng 13 file source/test + báo cáo `docs/round2/`, không dùng `git add .`. |
| **P3** | `PREFLIGHT-05` | `FE/src/services/api.ts:292,388` còn fallback string `http://localhost:4000` trong nhánh retry. | Bọc điều kiện `import.meta.env.DEV` ở đợt bảo trì tiếp theo. |

---

## 11. Quality Gate Matrix

| Gate | Hạng mục | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| **Gate 0** | Baseline & Git Safety | **PASS** | Không có dependency mới, không lộ secret, không đổi schema. |
| **Gate 1** | Plesk & Production Architecture | **BLOCKED** | Đã xác minh FE Plesk + BE Render; thiếu quyền truy cập dashboard để kiểm tra disk/env/backup. |
| **Gate 2** | Product Image Persistence | **FAIL** | **P1:** Ảnh lưu local `BE/data/product-images/` sẽ mất trên Render ephemeral disk khi restart/redeploy. |
| **Gate 3** | Production API & Environment | **PASS** | `VITE_API_URL`, CORS, Hybrid TTS (85 WAVs), Auth Admin, bundle sạch secret/Windows path. |
| **Gate 4** | SQLite Data Safety | **BLOCKED** | Code WAL + CloudDbSync đạt; chưa xác minh `DATABASE_URL` live & backup trước deploy trên Render. |
| **Gate 5** | Build & Regression | **PASS** | BE/FE build PASS, `40/40` files (`176/176` tests) PASS, Chrome 3D E2E PASS (gian `#3`). |
| **Gate 6** | Deployment & Rollback Plan | **PASS** | Có kế hoạch deploy BE→FE, bảo toàn 85 WAV, smoke test và rollback đầy đủ. |

---

## 12. Final Verdict

### **NOT READY**

**Lý do chính xác:**
1. **Gate 2 (FAIL — P1):** Cần xử lý lưu trữ bền vững cho ảnh sản phẩm (`BE/data/product-images/`) trước khi deploy lên Render — chọn một trong các hướng: (a) thêm biến `V28_PRODUCT_IMAGES_DIR` và gắn **Render Persistent Disk**, hoặc (b) đồng bộ/lưu ảnh vào **Object Storage (Cloudflare R2 / S3)** hoặc **PostgreSQL/SQLite blob** để không bị mất ảnh sau restart/redeploy.
2. **Gate 1 & Gate 4 (BLOCKED):** Người quản trị cần cung cấp xác nhận từ Render Dashboard rằng:
   - `DATABASE_URL` đang bật và log khởi động hiện `[Virtual Expo BE] Cloud DB Persistence: ENABLED`.
   - Đã chụp backup bảng `expo_sqlite_snapshots` và backup `httpdocs` trên Plesk.
   - Đã xác định dung lượng đĩa trống trên Plesk và Render.
