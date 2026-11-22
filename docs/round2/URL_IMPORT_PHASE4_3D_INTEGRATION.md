# GRAND EXPO V28 — PHASE 4: PRODUCT CATALOG → 3D BOOTH INTEGRATION

- **Ngày thực hiện:** 2026-11-22
- **Phạm vi:** Gắn 60 sản phẩm vào 10 gian hàng mục tiêu (`#3, #4, #5, #6, #7, #8, #9, #10, #12, #13` × 6 slots), cảnh báo ghi đè slot trong Admin, đồng bộ `GET /api/v28/exhibitions/active`, và kiểm thử WebGL 3D thực tế trên Headless Chrome.
- **Trạng thái Quality Gate 4:** **PASS**

---

## 1. Audit & Root Cause

1. **Cảnh báo ghi đè slot trong `ProductCatalog.tsx`:** Trước Phase 4, dropdown chọn `slot_01..slot_06` khi gắn nhanh sản phẩm từ kho không hiển thị trạng thái slot đã có sản phẩm hay trống, dễ khiến Admin vô tình ghi đè sản phẩm đang trưng bày.
2. **Bảo vệ gian hàng gốc & `?demoAgri=1`:** Đã kiểm chứng `v28AgriDemoShowcase.ts` chỉ overlay lên các gian hàng có `assignedSlotCount === 0`, do đó 10 gian hàng sau khi được Admin gắn sản phẩm thật sẽ không bao giờ bị `?demoAgri=1` ghi đè.
3. **Render 3D WebGL ảnh nội bộ:** `sceneTextures.ts` giải quyết URL `/api/...` qua `API_BASE_URL` với `img.crossOrigin = 'anonymous'`, kết hợp header `Access-Control-Allow-Origin: *` và `Cross-Origin-Resource-Policy: cross-origin` từ Phase 2, giúp WebGL `CanvasTexture` vẽ sắc nét mà không bị CORS taint.

---

## 2. Thay đổi đã triển khai

| File | Thay đổi |
| --- | --- |
| `FE/src/components/adminV28/ProductCatalog.tsx` | Lưu danh sách `slotAssignments` từ `v28Api.listBooths(companyId)`, gắn nhãn `(đã có SP)` / `(trống)` trên từng `slot_01..slot_06`, hiện cảnh báo màu hổ phách và đổi nút thành **"Ghi đè slot này"** khi slot đích đã có sản phẩm, đồng thời tự động `loadCatalog()` sau khi gắn để cập nhật trạng thái tức thì. |
| `BE/src/__tests__/v28BoothIntegrationPhase4.test.ts` | Integration test độc lập trên SQLite tạm (không đụng Production DB): ingest ảnh PNG thật → batch commit 60 SP qua `POST /api/v28/products/batch` → gắn 10 gian × 6 slot qua `PUT /api/v28/booths/:id/slots/:slotId` → kiểm tra `GET /api/v28/exhibitions/active` trả đủ 60/60 SP với URL `/api/v28/product-images/...` → xác nhận gian hàng gốc `#1, #2` không bị ảnh hưởng → đóng & mở lại DB vẫn còn nguyên 60 slot. |

---

## 3. Bằng chứng Quality Gate 4

### 3.1. Automated Builds & Integration Test
| Tiêu chí | Lệnh kiểm tra | Kết quả |
| --- | --- | --- |
| BE Build | `npm --prefix BE run build` | **PASS** (0 lỗi) |
| FE Build | `$env:VITE_NPC_TTS_MODE='hybrid'; npm --prefix FE run build` | **PASS** (734 modules, 0 lỗi) |
| Phase 4 Integration Test (60 SP) | `npx vitest run BE/src/__tests__/v28BoothIntegrationPhase4.test.ts --no-file-parallelism` | **PASS (1/1)** |

### 3.2. Real Headless Chrome 3D Browser E2E (`scratch/url_import_phase4_browser_qa.mjs`)
- **Môi trường:** `FE/dist` phục vụ local + in-memory QA snapshot có 10 gian hàng mục tiêu (`#3..#10, #12, #13`) × 6 SP = 60 SP sử dụng ảnh `/api/v28/product-images/0123456789abcdef.png` kèm CORS headers thật.
- **Kết quả đo thực tế:**
  - `runtimeErrors`: `[]` (0 lỗi JS/WebGL)
  - `asset404s`: `[]` (0 lỗi 404)
  - `ingestedImageHits`: `1` (Chrome tải thành công ảnh PNG nội bộ với CORS và cache tái sử dụng cho cả 60 slot)
  - HUD gian hàng `#3`: `#3 · Khu A · 6/6 SP`
  - **Bằng chứng ảnh chụp 3D (`phase4_booth3_3d.png`):** Cả 6/6 thẻ sản phẩm 3D trong gian hàng `#3` (`Cà Phê Arabica Cầu Đất Rang Mộc`, `Gạo ST25 Sóc Trăng`, `Mật Ong Hoa Cà Phê`, `Hạt Điều Rang Củi`, cùng 2 kệ sau) hiển thị ảnh rõ nét, giá VND chính xác, không bị trắng khung hay lỗi CORS.

---

## 4. Kết luận Quality Gate 4

**QUALITY GATE 4: PASS** — Toàn bộ luồng từ URL → Crawler → Local Image Store → Atomic Batch DB → 10 Gian hàng × 6 Slot (60 SP) → Render 3D WebGL đã đạt chuẩn.
