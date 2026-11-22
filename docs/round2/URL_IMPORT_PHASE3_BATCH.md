# GRAND EXPO V28 — PHASE 3: BATCH IMPORT & DATABASE INTEGRITY

- **Ngày thực hiện:** 2026-11-22
- **Phạm vi:** Atomic Batch Product Commit (`POST /api/v28/products/batch`), Idempotent Dedup, SQLite Transaction Rollback, Catalog Pagination `> 100` sản phẩm.
- **Trạng thái Quality Gate 3:** **PASS**

---

## 1. Audit & Root Cause

Trước Phase 3:
1. **Non-atomic FE loop (`ExhibitionConfigurator.tsx`):** Sau khi crawler trả về danh sách sản phẩm, FE gọi `POST /api/v28/products` tuần tự trong vòng `for`. Nếu lỗi mạng hoặc lỗi server xảy ra giữa chừng (ví dụ SP thứ 35/60), DB bị ghi dở dang (partial commit) và không có rollback.
2. **Giới hạn phân trang `listProducts` (`BE/src/database/v28Database.ts`):** `Math.min(100, ...)` giới hạn tối đa 100 sản phẩm/trang, khiến các luồng batch `> 100` sản phẩm (ví dụ 120 sản phẩm) bị cắt bớt nếu gọi `limit=200`.
3. **Thiếu endpoint batch atomic:** Chưa có endpoint ghi batch trong một SQLite transaction duy nhất với dedup theo `SKU` và `sourceUrl`.

---

## 2. Thay đổi đã triển khai

| File | Thay đổi |
| --- | --- |
| `BE/src/routes/v28Routes.ts` | Thêm `POST /api/v28/products/batch` (`requireAdminAuth`, `1–150` SP/batch), thực thi toàn bộ trong `v28Db.runInTransaction(...)`. Dedup ổn định theo `SKU` → `sourceUrl` (hỗ trợ `duplicateStrategy: 'skip' \| 'update'`). Rollback toàn bộ nếu có lỗi transaction. |
| `BE/src/database/v28Database.ts` | Nâng giới hạn `listProducts` max `limit` từ `100` lên `250` để Admin đọc mượt `> 100` SP. |
| `FE/src/services/v28Api.ts` | Thêm `v28Api.batchCreateProducts(...)` gọi `POST /api/v28/products/batch`. |
| `FE/src/components/adminV28/ExhibitionConfigurator.tsx` | Thay vòng `for` `createProduct` rời rạc bằng 1 lời gọi `v28Api.batchCreateProducts(...)` atomic. |
| `BE/src/__tests__/v28BatchImportPhase3.test.ts` | Bộ regression test chứng minh 401 auth, commit 6 / 60 / 120 SP, retry idempotent không tạo trùng, phân trang `limit=200` trả đủ 120 SP, rollback thật trên SQLite transaction khi lỗi giữa batch, và dữ liệu bền vững sau khi đóng/mở lại DB. |

---

## 3. Bằng chứng Quality Gate 3

| Tiêu chí | Lệnh kiểm tra | Kết quả |
| --- | --- | --- |
| BE Build | `npm --prefix BE run build` | **PASS** (0 lỗi TypeScript) |
| FE Build | `$env:VITE_NPC_TTS_MODE='hybrid'; npm --prefix FE run build` | **PASS** (734 modules, 0 lỗi) |
| Phase 1–3 Regression Tests | `npx vitest run BE/src/__tests__/v28WebsiteCrawlerPhase1.test.ts BE/src/__tests__/v28ProductImagesPhase2.test.ts BE/src/__tests__/v28BatchImportPhase3.test.ts --no-file-parallelism` | **PASS (3/3 files, 14/14 tests)** |

### Chi tiết test Phase 3 (`v28BatchImportPhase3.test.ts`)
- Từ chối request không có token Admin (`HTTP 401`): **PASS**
- Commit batch 6 SP và 60 SP trong 1 transaction: **PASS**
- Gửi lại đúng batch 60 SP (`duplicateStrategy: 'skip'`): `createdCount = 0`, `skippedCount = 60`, không tạo trùng: **PASS**
- Commit thêm lên tổng 120 SP và gọi `GET /api/v28/products?limit=200`: trả về đủ `120` SP (`total = 120`): **PASS**
- Đóng DB và mở lại từ file SQLite trên đĩa: vẫn còn nguyên `120` SP: **PASS**
- Rollback thật trong `runInTransaction` khi có lỗi giữa batch: 0 bản ghi rác lọt vào DB: **PASS**

---

## 4. Kết luận Quality Gate 3

**QUALITY GATE 3: PASS** — Đủ điều kiện chuyển sang **Phase 4 (Product Catalog → 3D Booth Integration & Browser E2E)**.
