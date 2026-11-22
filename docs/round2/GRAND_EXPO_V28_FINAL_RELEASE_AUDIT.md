# GRAND EXPO V28 — FINAL RELEASE PREPARATION & SECURITY AUDIT

- **Ngày kiểm tra:** 2026-11-22
- **Production Frontend:** Plesk Nginx — `https://3dtrienlamso.mbws.vn/`
- **Production Backend:** Render — `https://exhibition-xl20.onrender.com/`
- **Production Commit hiện tại:** `149f92f` (`main`)
- **Chế độ:** Read-Only Final Release Audit (không sửa code, không sửa tests/lockfile, không commit/push/deploy/ZIP)
- **Final Verdict:** **CONDITIONALLY READY** *(Gate 1, 3, 4, 5, 6: **PASS**; Gate 2: **BLOCKED** riêng mục xác minh quyền `CREATE TABLE` trên PostgreSQL Production theo nguyên tắc không tự chạy DDL trên Production)*

---

## 1. Tổng hợp kết quả 6 Gates

| Gate | Hạng mục | Kết quả | Tóm tắt bằng chứng |
| --- | --- | --- | --- |
| **Gate 1** | Dependency Security (`npm audit`) | **PASS** | Đã phân tích đủ 6/6 lỗ hổng (`2 critical, 1 high, 3 moderate`): cả 2 Critical + 1 Moderate nằm ở `vitest` (dev-only, 0% exposure Production); `zod` High đã được chặn ở tầng Express body limit (`512kb`) + `requireAdminAuth`; `exceljs/uuid` Moderate không khai thác được trong runtime hiện tại. |
| **Gate 2** | PostgreSQL Image Storage Readiness | **BLOCKED** | Code `TieredProductImageStore` đạt toàn bộ 8 tiêu chí an toàn; nhưng **quyền `CREATE TABLE expo_v28_product_images` trên PostgreSQL Production** chưa thể kiểm chứng trực tiếp (cấm chạy DDL trên Production) → đánh **BLOCKED** cho đến khi xác nhận log boot trên Render. |
| **Gate 3** | Git & Release Diff | **PASS** | Diff sạch đúng phạm vi Phase 1–5 (8 file sửa + 7 file source/test mới + báo cáo), 0 dependency mới, 0 secrets/DB/ZIP tracked. |
| **Gate 4** | Build & Final Regression | **PASS** | Chạy mới hoàn toàn: BE build PASS, FE Hybrid TTS build PASS (`734` modules, `85/85` WAV + `manifest.json`), **41/41 test files (178/178 tests) PASS**. |
| **Gate 5** | Production Release Compatibility | **PASS** | `node >= 22.5.0`, `VITE_API_URL`, live CORS, Hybrid TTS, 85 WAV, 0 secrets/Windows path trong bundle, tương thích rollback về `149f92f`. |
| **Gate 6** | Release Package & Rollback Plan | **PASS** | Đã lập đầy đủ danh sách file commit/loại trừ, cảnh báo Render auto-deploy khi `git push`, kế hoạch Plesk giữ 85 WAV, smoke test & rollback. |

---

## 2. GATE 1 — Dependency Security (Chi tiết 6 Vulnerabilities)

Chạy read-only `npm audit --json` ở workspace root (`package-lock.json` nằm tại root, dùng npm workspaces `FE` + `BE`):
- **Tổng số:** `6` (`2 critical`, `1 high`, `3 moderate`, `0 low`)

| # | Package | Severity | Loại | Direct / Transitive | Advisory & Mô tả | Runtime Exposure trên Production | Fix & Khuyến nghị |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `vitest` | **Critical** | Dev (`package.json`) | Direct | Kéo theo `tinypool` & `@vitest/mocker` (`GHSA-82fw-gwwq-j7x9`) | **KHÔNG (0%)** — Chỉ chạy test local/CI, không bundle vào FE và không chạy trong `node dist/server.js`. | Nâng lên `vitest@5.1.1` (SemVer major) ở đợt nâng cấp riêng, **không** `audit fix --force` trước release. |
| 2 | `tinypool` | **Critical** | Dev | Transitive (via `vitest`) | `GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr` (Prototype Pollution → RCE trong worker options) | **KHÔNG (0%)** — Chỉ thuộc `vitest` test runner. | Giải quyết cùng đợt nâng `vitest@5.1.1`. |
| 3 | `@vitest/mocker` | **Moderate** | Dev | Transitive (via `vitest`) | `GHSA-82fw-gwwq-j7x9`, `GHSA-qxg6-89mg-rqv8` | **KHÔNG (0%)** — Chỉ thuộc `vitest`. | Giải quyết cùng đợt nâng `vitest@5.1.1`. |
| 4 | `zod` (`^3.24.2`) | **High** | **Prod** (`BE`) | Direct | `GHSA-mrhx-c7xc-m3w5` — Zod có thể gây memory exhaustion khi validate collection bị giới hạn kích thước quá lớn (`<4.6.6`). | **ĐƯỢC GIẢM THIỂU MẠNH:** Express chặn cứng body `512kb` trên `/api/v28/*` (`v28Routes.ts:115`) và `1mb` global (`server.ts:98`); mọi endpoint V28 nhận mảng/batch đều bắt buộc `requireAdminAuth`; các route public chỉ nhận object phẳng kích thước nhỏ. Không có đường khai thác unauthenticated OOM thực tế. | Fix yêu cầu SemVer major `zod@4.6.7` (breaking API). Lên kế hoạch migration Zod v4 sau release. |
| 5 | `exceljs` (`^4.4.0`) | **Moderate** | **Prod** (`BE`) | Direct | Kéo theo `uuid` (`GHSA-w5hq-g745-h8pq`). | **THẤP / KHÔNG KHAI THÁC ĐƯỢC:** Import Excel đã ẩn trên UI Admin, API yêu cầu `requireAdminAuth`, không truyền buffer offset từ user vào `uuid.v3/v5/v6`. | **Không** làm theo gợi ý downgrade `exceljs@3.4.0` của npm audit; chờ bản vá upstream hoặc test npm `overrides` cho `uuid` sau release. |
| 6 | `uuid` | **Moderate** | **Prod** (`BE`) | Transitive (via `exceljs`) | `GHSA-w5hq-g745-h8pq` — Thiếu bounds check khi truyền tham số `buf` vào `v3/v5/v6`. | **KHÔNG KHAI THÁC ĐƯỢC** trong runtime hiện tại. | Xử lý cùng `exceljs` sau release. |

**Kết luận Gate 1: PASS** — Không có lỗ hổng Critical/High nào có đường khai thác thực tế trên Production.

---

## 3. GATE 2 — PostgreSQL Image Storage Readiness

Kiểm tra [v28ProductImageStorage.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28ProductImageStorage.ts), [v28ProductImageService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28ProductImageService.ts) và [server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts):

| Tiêu chí | Đánh giá | Chi tiết kiểm chứng |
| --- | --- | --- |
| 1. Không báo import thành công nếu ảnh chưa lưu bền vững | **PASS** | `TieredProductImageStore.put()` ghi `durableStore.put()` (PostgreSQL) **trước**. Nếu PG lỗi, throw exception → `ingestImageUrl()` trả `{ ok: false, errorCode: 'STORAGE_ERROR' }`. |
| 2. Không mất ảnh khi local cache bị xóa | **PASS** | `TieredProductImageStore.get()` đọc PG khi local disk miss và tự làm ấm lại cache (`v28PersistentImagesPhase5.test.ts` PASS). |
| 3. Không làm hỏng dữ liệu khi PG lỗi giữa chừng | **PASS** | Mỗi ảnh là 1 row độc lập (`INSERT ... ON CONFLICT DO NOTHING`), không làm ảnh hưởng các ảnh đã lưu hay SQLite. |
| 4. Không tạo bảng lặp / lỗi khi restart | **PASS** | `CREATE TABLE IF NOT EXISTS expo_v28_product_images (...)` idempotent. |
| 5. Không ảnh hưởng `expo_sqlite_snapshots` & `CloudDbSyncManager` | **PASS** | Dùng bảng riêng `expo_v28_product_images` và pool `pg` độc lập (`max: 3`, SSL tương thích Render/Neon/Supabase). |
| 6. Không có race condition rõ ràng khi import đồng thời | **PASS** | PG dùng `PRIMARY KEY (filename)` + `ON CONFLICT (filename) DO NOTHING`; local disk dùng tên file tạm ngẫu nhiên (`pid + timestamp + random`) rồi `fs.renameSync` atomic. |
| 7. Giới hạn dung lượng & số lượng | **PASS (P3 Note)** | Có cap `5 MB`/ảnh và tổng dung lượng `250 MB` (`V28_PRODUCT_IMAGES_MAX_TOTAL_BYTES`). Chưa có cap cứng số lượng file (ví dụ `maxCount`) — ghi nhận P3. |
| 8. Không che giấu lỗi quyền PG | **PASS** | Lỗi `init()` lúc boot được log `console.error`, cờ `initialized` giữ `false` để mỗi lần `put/get` tiếp theo báo lỗi thật thay vì im lặng. |
| **9. Xác minh quyền `CREATE TABLE` trên PostgreSQL Production** | **BLOCKED** | Dù `CloudDbSyncManager` đã tạo thành công `expo_sqlite_snapshots` trên cùng `DATABASE_URL` (khả năng rất cao role có đủ quyền), theo quy tắc an toàn không chạy DDL trên Production nên **đánh BLOCKED cho đến khi xác nhận log boot trên Render sau deploy**. |

**Kết luận Gate 2: BLOCKED** *(Code PASS; chờ xác minh log `Product Image Storage: tiered-postgres-disk` trên Production lúc deploy).*

---

## 4. GATE 3 — Git & Release Diff

- **Branch / HEAD:** `main` @ `149f92f`
- **Thay đổi dependency (`package.json`, `FE/package.json`, `BE/package.json`):** `0` dòng thay đổi.
- **File nên commit (15 file code/test + 8 báo cáo `docs/round2/`):**
  - *Modified (8):*
    - `BE/src/database/v28Database.ts`
    - `BE/src/integrations/productAdapter.ts`
    - `BE/src/routes/v28Routes.ts`
    - `BE/src/server.ts`
    - `FE/src/components/adminV28/ExhibitionConfigurator.tsx`
    - `FE/src/components/adminV28/ProductCatalog.tsx`
    - `FE/src/scene/sceneTextures.ts`
    - `FE/src/services/v28Api.ts`
  - *Added code & tests (7):*
    - `BE/src/services/v28WebsiteCrawlerService.ts`
    - `BE/src/services/v28ProductImageService.ts`
    - `BE/src/services/v28ProductImageStorage.ts`
    - `BE/src/__tests__/v28WebsiteCrawlerPhase1.test.ts`
    - `BE/src/__tests__/v28ProductImagesPhase2.test.ts`
    - `BE/src/__tests__/v28BatchImportPhase3.test.ts`
    - `BE/src/__tests__/v28BoothIntegrationPhase4.test.ts`
    - `BE/src/__tests__/v28PersistentImagesPhase5.test.ts`
  - *Added docs (tùy chọn commit cùng release):* `docs/round2/WEBSITE_PRODUCT_IMPORT_DEEP_AUDIT.md`, `URL_IMPORT_PHASE1..5*.md`, `URL_IMPORT_FINAL_QA_REPORT.md`, `GRAND_EXPO_V28_DEPLOYMENT_PREFLIGHT.md`, `GRAND_EXPO_V28_DEPLOYMENT_REAUDIT.md`, `GRAND_EXPO_V28_FINAL_RELEASE_AUDIT.md`.
- **File TUYỆT ĐỐI KHÔNG commit (loại trừ):**
  - `FE_dist_v28*.zip` (5 file ZIP local)
  - `BE/data/` (SQLite & image cache local)
  - `.agents/`, `skills-lock.json`
  - `GRAND_EXPO_V28_PRODUCTION_HARDENING_REPORT.md` (untracked report cũ ngoài phạm vi)

**Kết luận Gate 3: PASS**

---

## 5. GATE 4 — Build & Final Regression (Chạy mới hoàn toàn)

| Hạng mục | Lệnh chạy thực tế | Kết quả |
| --- | --- | --- |
| Backend Production Build | `npm --prefix BE run build` | **PASS** (`tsc -p tsconfig.json`, 0 lỗi) |
| Frontend Production Build (Hybrid TTS) | `$env:VITE_NPC_TTS_MODE='hybrid'; npm --prefix FE run build` | **PASS** (734 modules, `dist/assets/index-D9sZKNma.js`, `85/85` WAV + `manifest.json`) |
| Full Unit & Integration Suite | `npx vitest run --no-file-parallelism` | **PASS — 41/41 test files, 178/178 tests PASSED** (0 failed, 0 skipped, 75.80s) |
| Bao phủ đầy đủ | Crawler (10), Images (3), Persistent Images/Redeploy/Backup (2), Atomic Batch (1), 10×6=60 SP Booth Integration (1), Admin CRUD, 100 gian/10 khu, Hybrid TTS, Security, Excel Import vẫn ẩn | **PASS 100%** |

**Kết luận Gate 4: PASS**

---

## 6. GATE 5 — Production Release Compatibility

| Hạng mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| Node.js version | **PASS** | `package.json` & `BE/package.json`: `"node": ">=22.5.0"` (khớp `node:sqlite`). |
| Build & Start scripts | **PASS** | Root: `npm run build -w BE`, `npm run start -w BE` (`node dist/server.js`). |
| FE API URL & CORS | **PASS** | `FE/.env` → `https://exhibition-xl20.onrender.com`; live CORS `Access-Control-Allow-Origin: https://3dtrienlamso.mbws.vn`. |
| Hybrid TTS & 85 WAV | **PASS** | `85/85` WAV + `manifest.json` nguyên vẹn trong `FE/public/tts/pregen` và `FE/dist/tts/pregen`. |
| Không lộ secret / Windows path | **PASS** | 0 secret, 0 Windows path trong `FE/dist/assets/index-D9sZKNma.js`. |
| Không xóa 100 gian demo khi restart | **PASS** | `ensureBaseTablesIfEmpty()` chỉ seed nếu bảng `booths` chưa tồn tại; `CloudDbSyncManager` restore từ PostgreSQL trước khi mở SQLite. |
| Rollback compatibility | **PASS** | Không thay đổi schema SQLite; bảng `expo_v28_product_images` độc lập nên rollback BE về `149f92f` an toàn 100%. |

**Kết luận Gate 5: PASS**

---

## 7. GATE 6 — Release Package & Rollback Plan (Chỉ lập kế hoạch)

> **CẢNH BÁO QUAN TRỌNG VỀ RENDER AUTO-DEPLOY:**
> Nếu Render service `exhibition-xl20` đang bật **Auto-Deploy on commit to `main`**, ngay khi chạy `git push origin main`, Render sẽ **tự động build và deploy Backend mới ngay lập tức**. Hãy đảm bảo bạn đã sẵn sàng theo dõi Render Deploy Logs ngay sau lệnh `git push`.

### Thứ tự triển khai an toàn (khi được phê duyệt):
1. **Commit đích danh** các file ở mục Gate 3 (tuyệt đối không `git add .`).
2. **Push lên `main`** → Theo dõi Render build & startup log phải xuất hiện đủ 2 dòng:
   - `[Virtual Expo BE] Cloud DB Persistence: ENABLED (PostgreSQL Snapshot Sync)`
   - `[Virtual Expo BE] Product Image Storage: tiered-postgres-disk`
3. **Đóng gói FE POSIX ZIP** (từ `FE/dist/*` đã build với `VITE_NPC_TTS_MODE=hybrid`, chứa đủ 85 WAV + `manifest.json` + `models/`) và upload/giải nén lên Plesk `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/` (giữ nguyên toàn bộ `tts/pregen/` và `models/`, xóa file `assets/index-*.js` cũ nếu cần).
4. **Smoke Test sau deploy:**
   - Mở `https://3dtrienlamso.mbws.vn/` → kiểm tra 100 gian / 10 khu, NPC Hybrid TTS, 0 lỗi 404/console.
   - Mở `/admin` → xác nhận nút Import Excel vẫn ẩn, ô `Số SP cần lấy (1–120)` hiển thị, cảnh báo slot `(đã có SP)` hoạt động.
   - Thử ingest 1 ảnh test → kiểm tra hiển thị trong 3D → restart thủ công Render service → reload 3D xác nhận ảnh vẫn trả `200 OK`.

### Kế hoạch Rollback:
- **Backend (Render):** Bấm **Rollback to `149f92f`** trên Render Dashboard (~30–60s).
- **Frontend (Plesk):** Giải nén lại gói ổn định `FE_dist_v28_149f92f.zip` lên `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/`.
- **Database:** Không cần rollback schema vì 0 thay đổi schema SQLite.

**Kết luận Gate 6: PASS**

---

## 8. Final Release Verdict

### **CONDITIONALLY READY**

- **Không còn bất kỳ lỗi P0/P1 kỹ thuật hay lỗ hổng bảo mật khai thác được nào** (`41/41` files, `178/178` tests PASS, BE/FE build PASS).
- Lý do giữ trạng thái **CONDITIONALLY READY** (chưa đánh `READY` tuyệt đối): **Gate 2** còn duy nhất điều kiện xác minh quyền `CREATE TABLE expo_v28_product_images` trực tiếp trên PostgreSQL Production (được xác nhận ngay khi xem Render boot log sau khi push).
- Sẵn sàng tiến hành **Commit sạch → Push (Backend Render) → Đóng gói POSIX ZIP (Frontend Plesk)** ngay khi bạn phê duyệt.
