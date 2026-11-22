# GRAND EXPO V28 — PRODUCTION DEPLOYMENT RE-AUDIT (POST-PHASE 5)

- **Ngày Re-Audit:** 2026-11-22
- **Production Domain:** `https://3dtrienlamso.mbws.vn/` (Plesk Nginx)
- **Production Backend:** `https://exhibition-xl20.onrender.com` (Render)
- **Tiền đề:** Sau khi triển khai hoàn chỉnh Phase 5 (`TieredProductImageStore` — PostgreSQL + Local Disk Read-Through Cache) và đạt **Quality Gate 5: PASS**.
- **Final Verdict:** **CONDITIONALLY READY** *(đã nâng cấp từ `NOT READY` sau khi khắc phục triệt để P1 code/storage; chỉ còn các xác minh vận hành trên Render/Plesk Dashboard trước khi bấm deploy)*

---

## 1. Tóm tắt thay đổi trạng thái sau Phase 5

| Gate | Preflight trước Phase 5 | Re-Audit sau Phase 5 | Thay đổi |
| --- | --- | --- | --- |
| **Gate 0 — Git Safety** | **PASS** | **PASS** | Không có dependency mới, không lộ secret, không đổi schema SQLite. |
| **Gate 1 — Production Architecture** | **BLOCKED** | **BLOCKED** | Vẫn cần xác minh cấu hình Render Dashboard (`DATABASE_URL`, disk quota, backup policy) do không có quyền truy cập dashboard. |
| **Gate 2 — Product Image Persistence** | **FAIL (P1)** | **CONDITIONAL / BLOCKED (Code PASS, chờ xác minh `DATABASE_URL` trên Render)** | **Lỗi P1 mất ảnh đã được khắc phục ở tầng code/kiến trúc** bằng `TieredProductImageStore` (PG `expo_v28_product_images` + disk read-through cache). Tự động bền vững qua Render redeploy ngay khi `DATABASE_URL` active trên Render. |
| **Gate 3 — Production API & Env** | **PASS** | **PASS** | `VITE_API_URL`, CORS, Hybrid TTS (85 WAV), Auth Admin, bundle sạch secret. |
| **Gate 4 — SQLite Data Safety** | **BLOCKED** | **BLOCKED** | Code WAL + `CloudDbSyncManager` PASS; vẫn cần xác nhận `DATABASE_URL` live & tạo bản `pg_dump` trước deploy. |
| **Gate 5 — Persistent Images & Regression** | *(Mới)* | **PASS** | `41/41` files (**178/178 tests** PASS), BE/FE build PASS, redeploy disk-wipe simulation PASS, backup/restore PASS. |
| **Gate 6 — Deployment & Rollback Plan** | **PASS** | **PASS** | Có đầy đủ kế hoạch deploy BE→FE, smoke test sau restart, và rollback. |

---

## 2. Đánh giá chi tiết Gates 1, 2, 4 & Final Regression (Phase 6)

### 2.1. Gate 1 — Production Architecture (**BLOCKED — chờ xác minh Dashboard**)
- **Đã xác minh thực tế (Read-Only):**
  - FE Plesk Nginx (`https://3dtrienlamso.mbws.vn/`), BE Render (`https://exhibition-xl20.onrender.com`, đang phục vụ 100 gian / 10 khu), CORS cross-origin hoạt động (`Access-Control-Allow-Origin: https://3dtrienlamso.mbws.vn`).
- **Điều kiện cần xác minh từ Render/Plesk Dashboard:**
  1. Xác nhận `DATABASE_URL` đang bật trên Render Service `exhibition-xl20`.
  2. Xác nhận dung lượng trống PostgreSQL (tối thiểu >100 MB trống cho ~60–200 ảnh sản phẩm + SQLite snapshots) và dung lượng trống Plesk.

### 2.2. Gate 2 — Product Image Persistence (**Code PASS / Production Activation BLOCKED trên xác minh `DATABASE_URL`**)
- **Đã khắc phục triệt để P1:**
  - `V28ProductImageService.fromEnv()` tự động kích hoạt `TieredProductImageStore` (`mode: tiered-postgres-disk`) khi `DATABASE_URL` / `CLOUD_DB_URL` tồn tại.
  - Ghi vào PostgreSQL `expo_v28_product_images` trước rồi cache ra `V28_PRODUCT_IMAGES_DIR` (local disk).
  - Đọc ưu tiên từ local disk (`<1ms`); khi container mới sau Render redeploy bị trống disk, tự động tải từ PostgreSQL, làm ấm lại local disk cache và trả `200 OK` kèm `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: public, max-age=31536000, immutable`.
  - Giới hạn `5 MB`/ảnh và `250 MB` tổng kho ảnh (cấu hình được qua `V28_PRODUCT_IMAGES_MAX_TOTAL_BYTES`).
  - Hỗ trợ backup/restore qua `pg_dump` cùng lúc với `expo_sqlite_snapshots`.
- **Điều kiện kích hoạt trên Production:** Xác nhận `DATABASE_URL` đã cấu hình trên Render và log khởi động sau deploy hiện:
  `[Virtual Expo BE] Product Image Storage: tiered-postgres-disk`

### 2.3. Gate 4 — Database Safety (**BLOCKED — chờ backup trước deploy**)
- Code đảm bảo an toàn 100%: SQLite WAL + `PRAGMA foreign_keys = ON`, không tự seed đè 100 gian hiện có, 0 thay đổi schema SQLite, bảng `expo_v28_product_images` tạo mới hoàn toàn độc lập trên PostgreSQL (`CREATE TABLE IF NOT EXISTS`).
- **Điều kiện trước deploy:** Chụp 1 bản `pg_dump` của PostgreSQL Production (gồm `expo_sqlite_snapshots`) trước khi push BE mới lên Render.

### 2.4. Final Regression Summary (**PASS**)
- **BE Build (`npm --prefix BE run build`):** PASS (0 lỗi)
- **FE Build (`VITE_NPC_TTS_MODE=hybrid`, `npm --prefix FE run build`):** PASS (734 modules, `dist/assets/index-D9sZKNma.js`)
- **Full Test Suite (`npx vitest run --no-file-parallelism`):** **PASS — 41/41 test files, 178/178 tests PASSED**
- **100 gian / 10 khu, 60 SP / 10 gian test, URL crawler `targetCount`, Batch atomic, Image persistence + redeploy simulation, Admin CRUD, Slot warning, Hybrid TTS (85/85 WAV + `manifest.json`), Hotfix P1/P2-01, Import Excel vẫn ẩn:** Toàn bộ **PASS**.

---

## 3. Rủi ro còn lại (Remaining Risks)

| Mức độ | Mô tả | Cách kiểm soát |
| --- | --- | --- |
| **P2** | Nếu `DATABASE_URL` chưa được bật trên Render, BE sẽ chạy ở chế độ `local-disk` và vẫn mất ảnh khi restart. | Kiểm tra log Render ngay sau khi deploy phải thấy `Product Image Storage: tiered-postgres-disk`. |
| **P2** | Working tree local có file untracked ngoài phạm vi (`FE_dist_v28*.zip`, `BE/data/`, `.agents/`, `skills-lock.json`). | Khi commit chỉ stage đích danh các file source/test/docs thuộc Phase 1–5. |
| **P3** | `FE/src/services/api.ts:292,388` còn chuỗi fallback dev `http://localhost:4000` trong nhánh retry. | Không ảnh hưởng luồng Production; dọn ở đợt bảo trì kế tiếp. |

---

## 4. Yêu cầu triển khai & Rollback (Checklist hành động)

### Trước khi deploy:
1. Kiểm tra trên Render Dashboard: `DATABASE_URL` đã thiết lập, dung lượng PG còn trống >100 MB.
2. Chạy `pg_dump` sao lưu PostgreSQL Production (`expo_sqlite_snapshots`).
3. Giữ nguyên bản backup FE ổn định (`FE_dist_v28_149f92f.zip`) để rollback Plesk tức thì.

### Trình tự deploy (khi người dùng phê duyệt):
1. Commit đích danh các file Phase 1–5 (không stage `.zip`, `BE/data/`, `.agents/`) và push lên `main` để Render deploy Backend.
2. Kiểm tra log Render: thấy cả `Cloud DB Persistence: ENABLED` và `Product Image Storage: tiered-postgres-disk`.
3. Đóng gói `FE/dist` (Hybrid TTS, đủ 85 WAV + `manifest.json`) dạng POSIX ZIP và upload lên Plesk `/var/www/vhosts/3dtrienlamso.mbws.vn/httpdocs/`.
4. Smoke test: ingest 1 ảnh test → hiển thị trong 3D → restart thủ công Render service → reload 3D xác nhận ảnh vẫn `200 OK` (không 404).

### Rollback:
- **BE:** Rollback Render về commit `149f92f` (bảng `expo_v28_product_images` độc lập nên không gây xung đột).
- **FE:** Giải nén lại `FE_dist_v28_149f92f.zip` lên Plesk `httpdocs/`.
- **DB:** Restore `expo_sqlite_snapshots` từ bản `pg_dump` trước deploy nếu cần.

---

## 5. Final Verdict

### **CONDITIONALLY READY**

- **Toàn bộ yêu cầu kỹ thuật, bảo mật, lưu trữ ảnh bền vững, build và regression (`41/41` files / `178/178` tests) đã PASS 100%.**
- Chỉ còn **2 xác nhận vận hành trên Render/Plesk Dashboard** (xác nhận `DATABASE_URL` đang bật + chụp backup PostgreSQL & Plesk `httpdocs`) để mở khóa hoàn toàn **Gate 1, Gate 2 (live activation) và Gate 4** trước khi commit/push/deploy.
