# GRAND EXPO V28 — FINAL SECURITY & POSTGRESQL READINESS VERIFICATION

- **Ngày kiểm tra:** 2026-11-22
- **Chế độ:** Audit-Only (không sửa code, không sửa tests/lockfile, không commit/push/deploy/ZIP, không ghi Production PostgreSQL)
- **Kết quả tổng hợp:**
  - **Gate A (Zod High Advisory `GHSA-mrhx-c7xc-m3w5`):** **PASS (`MITIGATED`)**
  - **Gate B (PostgreSQL Product Image Storage):** **BLOCKED** *(Code & 5/5 mô phỏng lỗi PASS; chỉ còn xác minh quyền `CREATE TABLE` trên PG Production lúc deploy)*
  - **Gate C (Final Regression):** **PASS** (`41/41` files, `178/178` tests PASS, BE/FE build PASS)
- **Final Verdict:** **CONDITIONALLY READY**

---

## 1. Executive Summary

Cuộc kiểm tra chuyên sâu 2 điều kiện cuối trước phát hành cho thấy:
1. **Zod High Advisory (`GHSA-mrhx-c7xc-m3w5` / `CVE-2023-54404`):** Đã xác minh cơ chế lỗi trên `zod@3.25.76` bằng bài test cục bộ an toàn và truy vết 100% lệnh gọi Zod trong toàn bộ `BE/src` và `FE/src`. **Không có bất kỳ endpoint public (chưa đăng nhập) nào sử dụng `z.array()`, `z.set()` hay `z.map()`**. Toàn bộ 5 schema có `z.array()` đều nằm sau `requireAdminAuth` và bị chặn kích thước JSON ở `512 KB` (V28) / `1 MB` (V27). Do đó lỗ hổng được phân loại **`MITIGATED`** (**Gate A: PASS**), lên kế hoạch nâng cấp Zod v4 ở đợt riêng sau phát hành.
2. **PostgreSQL Product Image Storage (`TieredProductImageStore`):** Đã kiểm chứng toàn bộ mã nguồn và chạy thành công 5 kịch bản mô phỏng lỗi (từ chối quyền `CREATE TABLE`, 20 ghi đồng thời, disk full, PG timeout, xóa sạch cache local & tự phục hồi). Hệ thống **không bao giờ báo import thành công nếu ghi bền vững thất bại**. Tuy nhiên, vì không có kết nối PG test cục bộ và tuyệt đối không chạy `CREATE TABLE` trên Production, quyền tạo bảng trên PostgreSQL Production được đánh **BLOCKED** (**Gate B: BLOCKED**) và sẽ được xác minh ngay trên Render boot log ngay khi deploy.

---

## 2. Zod Advisory và Phiên bản (Gate A1)

| Thuộc tính | Giá trị thực tế |
| --- | --- |
| Package | `zod` (`BE/package.json`: `"zod": "^3.24.2"`) |
| Phiên bản thực tế trong `package-lock.json` | `3.25.76` (`dev: false`, Production direct dependency của `BE`) |
| Advisory ID / CVE | `GHSA-mrhx-c7xc-m3w5` / `CVE-2023-54404` (CWE-770: Uncontrolled Resource Consumption) |
| Severity | **High** (Availability / OOM DoS) |
| Phiên bản bị ảnh hưởng | `< 4.6.6` |
| Phiên bản đã vá | `>= 4.6.6` (`npm audit` đề xuất `4.6.7`, SemVer major breaking) |
| Điều kiện khai thác | Gửi mảng/set/map chứa hàng trăm nghìn đến hàng triệu phần tử sai kiểu vào schema `z.array()` / `z.set()` / `z.map()` — Zod `< 4.6.6` duyệt hết mọi phần tử trước khi kiểm tra `.max()`, tạo ra hàng trăm nghìn object lỗi làm tràn heap V8. |

---

## 3. Runtime Exploitability Analysis (Gate A2 & A3)

### 3.1. Truy vết 100% đường gọi Zod trong `BE/src` & `FE/src`
- **Số lần dùng `z.set()`, `z.map()`, `z.record()`, `z.tuple()`:** **0** trên toàn bộ repository.
- **Tất cả endpoint Public (unauthenticated) dùng Zod:**
  - `POST /api/v28/visitor/engagement/start`, `POST /api/v28/visitor/visit`, `POST /api/v28/visitor/redemption`, `POST /api/npc/tts`, Socket.IO `visitor:move` & `visitor:profile`: **Chỉ validate object phẳng (primitive strings/numbers), KHÔNG có bất kỳ `z.array()` nào.**
- **Tất cả endpoint Phase 1–5 mới (`POST /api/v28/products/batch`, `POST /api/v28/imports/website`, `POST /api/v28/images/ingest`):**
  - Validate thủ công có chặn độ dài mảng (`items.length > 150` trả `400` ngay lập tức), **không đưa mảng qua Zod**.
- **5 vị trí duy nhất có `z.array()` trong `BE/src`:**
  1. `BE/src/schemas/v28Schemas.ts:132` (`CreateV28ProductInputSchema.images`) — `POST /api/v28/products` (`requireAdminAuth` + `512kb` JSON cap).
  2. `BE/src/schemas/v28Schemas.ts:150` (`UpdateV28ProductInputSchema.images`) — `PATCH /api/v28/products/:id` (`requireAdminAuth` + `512kb` JSON cap).
  3. `BE/src/schemas/expoSchemas.ts:179` (`CreateProductInputSchema.images`) — legacy V27 `POST/PATCH /api/products` (`requireAdminAuth` + `1mb` JSON cap).
  4. `BE/src/schemas/expoSchemas.ts:303,309` (`ExtractedProductDraftSchema.images`, `warnings`) — chỉ gọi nội bộ trong adapter (`requireAdminAuth`, `images` đã `.slice(0, 6)` trước khi parse).

### 3.2. Kết quả Reproduce an toàn cục bộ (Gate A3)
Chạy test cục bộ trên `zod@3.25.76` với schema `z.object({ images: z.array(z.string().max(1000)).max(10) })`:

| Số phần tử lỗi | Kích thước JSON | `ok` | `issues` tạo ra | Thời gian | Heap Delta |
| --- | --- | --- | --- | --- | --- |
| `1,000` | `4 KB` | `false` | `1,001` | `4.7 ms` | `+0.30 MB` |
| `10,000` | `40 KB` | `false` | `10,001` | `25.7 ms` | `+3.10 MB` |
| `50,000` | `200 KB` | `false` | `50,001` | `48.1 ms` | `+24.25 MB` |

- Xác nhận đúng hành vi advisory trên `3.25.76`, đồng thời chứng minh giới hạn body `512 KB` + `requireAdminAuth` khóa chặt bề mặt tấn công (không có bất kỳ vector unauthenticated DoS nào).

---

## 4. Zod Gate A Verdict

- **Phân loại:** **`MITIGATED`**
- **Gate A:** **PASS**
- **Khuyến nghị hậu phát hành:** Lên kế hoạch migration sang `zod@4.x` (`>= 4.6.7`) trong một PR riêng có regression đầy đủ thay vì ép nâng major ngay trước ngày release.

---

## 5. PostgreSQL Permissions Evidence (Gate B1 & B2)

- **Bằng chứng hiện có:**
  - Render Production log xác nhận `Cloud DB Persistence: ENABLED (PostgreSQL Snapshot Sync)` — nghĩa là `DATABASE_URL` đã tồn tại, kết nối thành công và trước đó `CloudDbSyncManager` đã tạo/ghi thành công bảng `expo_sqlite_snapshots` trên cùng database.
  - `PostgresProductImageStore` dùng cùng `DATABASE_URL` / `buildPgPoolConfig`, tạo bảng độc lập `expo_v28_product_images` với `CREATE TABLE IF NOT EXISTS` (không ảnh hưởng `expo_sqlite_snapshots`).
- **Điều chưa thể xác minh trực tiếp (lý do đánh BLOCKED):**
  - Môi trường local không có `DATABASE_URL` và không cài `psql`.
  - Theo quy tắc an toàn, tuyệt đối không chạy `CREATE TABLE` hay truy vấn ghi trên PostgreSQL Production.
  - Do đó quyền `CREATE TABLE` của role Production trên schema `public` cho bảng mới `expo_v28_product_images` được giữ trạng thái **BLOCKED** cho tới khi quan sát log khởi động Render sau deploy.

---

## 6. Storage Integration Test Results (Gate B3 & B4)

> **Ghi chú sự cố timeout trước đó (`task-4523`):** Tác vụ chạy thử ban đầu dùng `npx tsx -e` bị treo vì `tsx` nằm trong `BE/node_modules` nên `npx` ở root dừng chờ xác nhận cài gói từ stdin (không phải lỗi của `PostgresProductImageStore`). Đã dừng sạch `task-4523` và chạy trực tiếp trên bản biên dịch `BE/dist/services/v28ProductImageStorage.js` bằng `node` với hard timeout 15 giây — hoàn tất trong `< 1 giây`:

| # | Kịch bản mô phỏng (Gate B4) | Kết quả thực tế | Đánh giá |
| --- | --- | --- | --- |
| 1 | `permission denied for schema public` trên `CREATE TABLE` | `{"ok":false,"errorCode":"STORAGE_ERROR","msg":"Lỗi lưu ảnh sản phẩm: permission denied for schema public"}` | **PASS** — Không bao giờ báo import thành công giả |
| 2 | 20 request ghi ảnh giống nhau đồng thời (`Promise.all`) | `{"allOk":true,"uniqueFiles":1,"pgRows":1}` | **PASS** — Không race condition, dedup 100% |
| 3 | PostgreSQL đầy đĩa (`No space left on device`) | `{"ok":false,"errorCode":"STORAGE_ERROR"}` | **PASS** — Từ chối sạch, không hỏng dữ liệu cũ |
| 4 | PostgreSQL timeout khi đang đọc ảnh đã có trong cache | `{"servedFromCache":true,"bytes":70}` | **PASS** — Vẫn phục vụ ổn định từ local disk cache |
| 5 | Xóa sạch thư mục cache local (mô phỏng Render redeploy) | `{"healed":true,"cacheRestoredOnDisk":true}` | **PASS** — Tự phục hồi từ PG và ghi lại vào cache |
| 6 | Quota 5 MB/ảnh & 250 MB tổng + Backup/Restore (`v28PersistentImagesPhase5.test.ts`) | **2/2 tests PASS** | **PASS** |

---

## 7. PostgreSQL Gate B Verdict

- **Gate B:** **BLOCKED** *(Code & 6/6 kiểm thử mô phỏng PASS 100%; chỉ còn duy nhất xác minh quyền `CREATE TABLE expo_v28_product_images` trên PostgreSQL Production)*
- **Bước xác minh có kiểm soát ngay khi deploy Backend lên Render:**
  1. Kiểm tra Render Deploy Logs ngay sau khi container khởi động phải có dòng:
     `[Virtual Expo BE] Product Image Storage: tiered-postgres-disk`
     và **không có** dòng `Product Image Storage init warning`.
  2. Nếu phát sinh lỗi quyền (`permission denied for schema public`), lập tức rollback Render về commit `149f92f` và cấp quyền `CREATE` trên schema cho role PostgreSQL trước khi deploy lại.

---

## 8. Regression Gate C

| Hạng mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| Backend Build (`npm --prefix BE run build`) | **PASS** | 0 lỗi TypeScript |
| Frontend Hybrid TTS Build (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** | 734 modules, `dist/assets/index-D9sZKNma.js` |
| Full Test Suite (`npx vitest run --no-file-parallelism`) | **PASS** | **41/41 test files, 178/178 tests PASSED** |
| 85 WAV + `manifest.json` | **PASS** | Đủ 85/85 file `.wav` và `manifest.json` trong `FE/public/tts/pregen` & `FE/dist/tts/pregen` |
| Import Excel vẫn ẩn, 100 gian/10 khu nguyên vẹn, 0 secrets trong diff | **PASS** | Đã xác minh ở Final Release Audit (không có chỉnh sửa code nào kể từ lần chạy đó) |

- **Gate C:** **PASS**

---

## 9. Remaining Risks

1. **P2 — Quyền `CREATE TABLE` trên PostgreSQL Production:** Xác suất rất thấp bị từ chối (vì `expo_sqlite_snapshots` đã chạy thành công trên cùng `DATABASE_URL`), nhưng bắt buộc kiểm tra log khởi động Render ngay sau khi push.
2. **P2 — Nâng cấp `zod@4.x` (`>= 4.6.7`) & `vitest@5.x`:** Lên lịch ở sprint sau release để xóa sạch cảnh báo `npm audit`.
3. **P3 — Giới hạn số lượng ảnh (count cap):** Hiện có cap dung lượng (`5 MB`/ảnh, `250 MB` tổng); có thể bổ sung thêm count cap nếu cần.

---

## 10. Release Recommendation

### **CONDITIONALLY READY**

- **Gate A (Zod):** **PASS (`MITIGATED`)**
- **Gate B (PostgreSQL Storage):** **BLOCKED** *(chỉ còn xác minh log khởi động Render sau khi push)*
- **Gate C (Final Regression):** **PASS**

**Đề xuất bước tiếp theo (chờ bạn phê duyệt):**
1. Commit đích danh các file Phase 1–5 (loại trừ `.zip`, `BE/data/`, `.agents/`, `skills-lock.json`).
2. Push lên `main` → theo dõi Render boot log xác nhận `[Virtual Expo BE] Product Image Storage: tiered-postgres-disk` (mở khóa hoàn toàn Gate B).
3. Đóng gói POSIX ZIP `FE/dist` (Hybrid TTS + 85 WAV) để upload lên Plesk và chạy smoke test (ingest 1 ảnh → restart Render → xác nhận ảnh vẫn `200 OK`).
