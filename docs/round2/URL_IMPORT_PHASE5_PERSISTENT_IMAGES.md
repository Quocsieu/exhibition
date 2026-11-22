# GRAND EXPO V28 — PHASE 5: PERSISTENT PRODUCT IMAGES

- **Ngày thực hiện:** 2026-11-22
- **Mục tiêu:** Khắc phục triệt để lỗi **P1 (`PREFLIGHT-01`)** mất ảnh sản phẩm sau khi Render restart/redeploy bằng kiến trúc lưu trữ bền vững phù hợp hạ tầng hiện tại (0 dịch vụ mới, 0 chi phí phát sinh, 0 dependency mới).
- **Trạng thái Quality Gate 5:** **PASS**

---

## 1. Root Cause (Phase 5A Audit)

1. `BE/src/routes/v28Routes.ts:104-106` khởi tạo `V28ProductImageService` với đường dẫn cứng `path.resolve(process.cwd(), 'data', 'product-images')`, không tách storage adapter và không hỗ trợ biến môi trường `V28_PRODUCT_IMAGES_DIR`.
2. Backend Production chạy trên **Render** (`https://exhibition-xl20.onrender.com`) với ephemeral container filesystem. `CloudDbSyncManager` chỉ đồng bộ 2 file SQLite (`v27`, `v28`) lên PostgreSQL (`expo_sqlite_snapshots`), **không** đồng bộ thư mục `BE/data/product-images/`.
3. Khi Render restart hoặc redeploy container mới, toàn bộ file ảnh trong `BE/data/product-images/` bị xóa sạch trong khi metadata URL `/api/v28/product-images/<hash>.<ext>` vẫn nằm trong SQLite → gây lỗi 404 trên gian hàng 3D.

---

## 2. So sánh 3 phương án lưu trữ (Phase 5A)

| Tiêu chí | A. Render Persistent Disk | B. PostgreSQL-Backed + Disk Read-Through Cache *(ĐƯỢC CHỌN)* | C. Cloudflare R2 / S3 Object Storage |
| --- | --- | --- | --- |
| **Độ bền dữ liệu** | Cao (trên 1 disk gắn kèm) | **Cao** (bền vững trên PostgreSQL sẵn có qua `DATABASE_URL`) | Rất cao |
| **Chi phí vận hành** | **Phát sinh phí** (Render paid instance + Persistent Disk) | **$0 phát sinh** (tái sử dụng `DATABASE_URL` + `pg` đã có) | Cần tạo account/bucket mới (có thể phát sinh phí/quản lý key) |
| **Tích hợp & Complexity** | Phải cấu hình thủ công trên Render Dashboard | **Rất gọn**, tự động kích hoạt khi có `DATABASE_URL`, fallback về `V28_PRODUCT_IMAGES_DIR` / local disk khi chạy dev | Cao (thêm SDK, credentials, CORS bucket, custom domain) |
| **Hiệu năng đọc ảnh** | Rất nhanh | **Rất nhanh (`<1ms`)** nhờ lớp local disk read-through cache + `Cache-Control: immutable` | Nhanh (qua CDN) |
| **Backup & Restore** | Snapshot disk riêng biệt | **1 lệnh `pg_dump` duy nhất** sao lưu đồng thời cả `expo_sqlite_snapshots` lẫn `expo_v28_product_images` + helper `exportAll()`/`restoreAll()` | Cần tool sync bucket riêng |
| **Ảnh hưởng DB/Schema cũ** | Không | **Không** (bảng độc lập `expo_v28_product_images` trên PG, không đụng SQLite hay `expo_sqlite_snapshots`) | Không |
| **Mở rộng (Scale)** | Giới hạn 1 instance | Phù hợp hoàn hảo cho quy mô triển lãm (60–500 SP ≈ 10–75 MB, có cap mặc định `250 MB`) | Tốt nhất khi >10 GB media |

### Quyết định chọn Phương án B (`TieredProductImageStore`: PostgreSQL + Local Disk Read-Through Cache)
- Tận dụng 100% hạ tầng PostgreSQL sẵn có (`DATABASE_URL` / `CLOUD_DB_URL` + thư viện `pg`), không cần tạo tài nguyên cloud mới, không phát sinh chi phí, không cần thêm secret mới.
- Giữ nguyên URL `/api/v28/product-images/<sha256-16>.<ext>` — tương thích ngược 100% với FE, Admin, Product Detail và WebGL 3D.
- Hỗ trợ đồng thời `V28_PRODUCT_IMAGES_DIR` (nếu tương lai muốn gắn Render Persistent Disk) và giới hạn tổng dung lượng `V28_PRODUCT_IMAGES_MAX_TOTAL_BYTES` (mặc định `250 MB`).

---

## 3. Thay đổi đã triển khai (Phase 5B)

| File | Vai trò |
| --- | --- |
| `BE/src/services/v28ProductImageStorage.ts` *(Mới)* | Storage abstraction `ProductImageStore` gồm: `LocalDiskProductImageStore` (dùng `V28_PRODUCT_IMAGES_DIR`, atomic write, quota `250 MB`), `PostgresProductImageStore` (bảng độc lập `expo_v28_product_images`, `ON CONFLICT DO NOTHING`, quota `250 MB`), và `TieredProductImageStore` (write-through PG → local cache; read-through local cache → tự phục hồi từ PG khi container mới mất disk). |
| `BE/src/services/v28ProductImageService.ts` | Tách hẳn logic lưu trữ sang `ProductImageStore`, giữ 100% SSRF/redirect/timeout/5MB/magic-byte validation, thêm `getStoredImage()`, `fromEnv()`, xử lý `STORAGE_QUOTA_EXCEEDED`, tương thích ngược với constructor `string`. |
| `BE/src/routes/v28Routes.ts` | Bỏ hardcode `process.cwd()/data/product-images`; nhận `productImageService = V28ProductImageService.fromEnv()`; route `GET /api/v28/product-images/:filename` đọc async qua `productImageService.getStoredImage(filename)` (tự phục hồi từ PG sau redeploy) kèm đầy đủ CORS & immutable cache headers. |
| `BE/src/server.ts` | Khởi tạo `V28ProductImageService.fromEnv()` lúc boot (log rõ storage mode `tiered-postgres-disk` hoặc `local-disk`), truyền vào `createApp()`, và đóng PG pool an toàn trong `gracefulShutdown`. |
| `BE/src/__tests__/v28PersistentImagesPhase5.test.ts` *(Mới)* | Bộ test Quality Gate 5 xác minh đầy đủ JPG/PNG/WebP, dedup, reject spoofed MIME/oversize/SSRF/path traversal, total quota, restart, **mô phỏng Render redeploy xóa sạch disk local và tự phục hồi 100%**, và **backup/restore disaster recovery**. |

---

## 4. Bằng chứng Quality Gate 5

| Tiêu chí bắt buộc | Kết quả | Bằng chứng |
| --- | --- | --- |
| Import JPG, PNG, WebP + Deduplicate | **PASS** | `v28PersistentImagesPhase5.test.ts` |
| Reject spoofed MIME, >5 MB, SSRF, path traversal | **PASS** | `v28PersistentImagesPhase5.test.ts` + `v28ProductImagesPhase2.test.ts` |
| Total Storage Quota (`STORAGE_QUOTA_EXCEEDED`) | **PASS** | `v28PersistentImagesPhase5.test.ts` (test 2) |
| Restart Backend không mất ảnh | **PASS** | `v28PersistentImagesPhase5.test.ts` |
| Mô phỏng Render Redeploy (xóa sạch disk container #1, boot container #2 disk trống) | **PASS** | `GET /api/v28/product-images/:filename` trả `200`, byte-for-byte chính xác, tự phục hồi 3/3 file vào local disk cache |
| Backup & Restore (`exportAll()` → wipe cả PG lẫn disk → `restoreAll()`) | **PASS** | Phục hồi 3/3 ảnh byte-for-byte |
| Metadata & File nhất quán + ảnh cũ / upload thủ công không ảnh hưởng | **PASS** | `v28PersistentImagesPhase5.test.ts` + `v28BoothIntegrationPhase4.test.ts` |
| WebGL 3D & CORS | **PASS** | `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, verified trên Chrome 3D E2E |
| BE Build (`npm --prefix BE run build`) | **PASS** | 0 lỗi TypeScript |
| FE Build (`VITE_NPC_TTS_MODE=hybrid`, `npm --prefix FE run build`) | **PASS** | 734 modules, 85/85 WAV + `manifest.json` |
| Full Regression (`npx vitest run --no-file-parallelism`) | **PASS** | **41/41 test files, 178/178 tests PASSED** (0 failed, 0 skipped) |

> **Ghi chú minh bạch:** Quá trình test mô phỏng chính xác cơ chế xóa ephemeral disk của Render trên `TieredProductImageStore`. Để kích hoạt `tiered-postgres-disk` trên Production thực tế, chỉ cần xác nhận biến `DATABASE_URL` đã được cấu hình trên Render Dashboard (được kiểm tra ở Phase 6 Re-Audit).

**QUALITY GATE 5: PASS**
