# GRAND EXPO V28 — URL IMPORT PHASE 2: PRODUCT IMAGE RELIABILITY

**Ngày hoàn thành:** 2026-11-22  
**Trạng thái Quality Gate 2:** ✅ **PASS (BE Build PASS · FE Build PASS · 13/13 tests PASS)**

## 1. Thay đổi đã triển khai
- **Trích xuất ảnh sản phẩm (`BE/src/integrations/productAdapter.ts`):** Giữ ưu tiên JSON-LD & Open Graph; bổ sung fallback đọc `<img>` hỗ trợ `data-src`, `data-original`, `data-lazy-src`, `srcset` (chọn ảnh độ phân giải cao nhất) và chuyển relative URL → absolute URL, đồng thời lọc bỏ logo, icon, avatar, banner, tracking pixel `1x1` và `data:` URI.
- **Lưu trữ ảnh an toàn theo content-hash (`BE/src/services/v28ProductImageService.ts`):**
  - Không mở public proxy cho URL tùy ý. Chỉ cho phép Admin (`requireAdminAuth`) tải ảnh qua `POST /api/v28/images/ingest`.
  - Xác thực SSRF + IP nội bộ trên mọi redirect hop (≤ 3 hop), timeout `10s`, giới hạn `5 MB`, và kiểm tra binary magic bytes thực (`JPG`, `PNG`, `WebP` — chặn HTML/script giả mạo ảnh).
  - Lưu file theo `<sha256-16>.<ext>` trong `data/product-images/` (không bao giờ ghi đè ảnh đang dùng) và phục vụ tĩnh qua `GET /api/v28/product-images/:filename` với header `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: immutable`.
- **WebGL 3D Texture (`FE/src/scene/sceneTextures.ts`):** Tự động gắn `API_BASE_URL` cho URL `/api/v28/product-images/...` để tải ổn định cả trên Plesk + Render, giữ fallback sạch khi ảnh lỗi.

## 2. Kết quả Quality Gate 2
- `BE/src/__tests__/v28ProductImagesPhase2.test.ts`: **3/3 PASS** (JPG/PNG/WebP magic bytes, relative/lazy-load/`srcset` excluding logos/banners, HTML disguised as `.jpg` rejected, SSRF `127.0.0.1`/`169.254.169.254` blocked, `>5MB` blocked, HTTP `403` handled gracefully).
- BE Build (`tsc -p tsconfig.json`) & FE Build (`VITE_NPC_TTS_MODE=hybrid`, `index-DBh7b6P_.js`): **PASS (0 lỗi TS)**.
