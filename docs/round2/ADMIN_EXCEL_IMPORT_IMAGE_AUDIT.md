# GRAND EXPO V28 — AUDIT ADMIN EXCEL IMPORT & PRODUCT IMAGES
## Thẩm định chức năng Import Excel & hình ảnh cho 60 sản phẩm / 10 gian nông sản

**Ngày kiểm toán:** 2026-11-22  
**Chế độ:** **AUDIT-ONLY** — **0 dòng code, test, Production DB hay WAV bị thay đổi; không import dữ liệu.**

---

## 1. Tóm tắt trả lời nhanh (Trọng tâm)

> **File Excel (`.xlsx`) cần những cột gì để nhập 60 sản phẩm có hình ảnh và hiển thị đúng trong 10 gian hàng 3D?**

1. **Định dạng bắt buộc:** Chỉ nhận **`.xlsx`** (kiểm tra magic bytes ZIP `50 4B 03 04`; **không** hỗ trợ `.xls` hay `.csv`). Giới hạn **≤ 5 MB** và **≤ 1.000 dòng / lần**.
2. **Header chuẩn dòng 1 (không phân biệt hoa/thường hay dấu tiếng Việt):**
   - **3 cột bắt buộc:** `name` · `sku` · `price`
   - **6 cột tùy chọn:** `image_url` · `currency` · `description` · `source_url` · `contact_url` · `in_stock`
3. **2 điều kiện BẮT BUỘC để ảnh hiện trong 3D và sản phẩm lên đúng 10 gian:**
   - **Ảnh (`image_url`):** Hệ thống **KHÔNG đọc ảnh nhúng trong Excel**, **KHÔNG tự tải ảnh về server**, và thẻ 3D dùng `img.crossOrigin = 'anonymous'` (`sceneTextures.ts:2113`). Do đó **PHẢI điền URL `https://...` công khai có CORS** (tốt nhất là upload 60 file ảnh lên chính hosting Plesk `https://3dtrienlamso.mbws.vn/product-images/...` để cùng origin, 0% lỗi CORS!).
   - **Gán gian hàng & slot (`slot_01..slot_06`):** Import Excel **KHÔNG hỗ trợ cột `booth_id` hay `slot_id`** — tất cả 60 sản phẩm được nhập vào **Kho sản phẩm của Doanh nghiệp (`boothId: null`)**. Sau khi import xong, Admin **BẮT BUỘC phải vào màn hình cấu hình gian hàng trong `/admin` để gán 6 sản phẩm/gian vào `slot_01..slot_06`** (`PUT /api/v28/booths/:id/slots/:slotId`) cho đủ 10 gian `#3, #4, #5, #6, #7, #8, #9, #10, #12, #13`.

---

## 2. Kiểm tra chức năng Import Excel (Phase 1)

| Hạng mục | Thực tế trong Source Code |
| :--- | :--- |
| **Có chức năng Import Excel?** | **CÓ** — đã triển khai hoàn chỉnh theo luồng 2 bước **Preview → Commit**. |
| **Đường dẫn trang Admin** | `/admin` (`FE/src/pages/AdminPage.tsx` → `FE/src/components/adminV28/V28Phase1Workspace.tsx`) |
| **Component Frontend** | [ExcelImportWizard.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExcelImportWizard.tsx) |
| **Backend Service & Schema** | [v28ExcelImportService.ts](file:///e:/Lập trình/MatBaoWS/exhibition/BE/src/services/v28ExcelImportService.ts), [v28Schemas.ts](file:///e:/Lập trình/MatBaoWS/exhibition/BE/src/schemas/v28Schemas.ts) |
| **Backend API Endpoints** | `POST /api/v28/imports/excel/preview` · `POST /api/v28/imports/excel/commit` · `GET /api/v28/imports/:jobId/report?format=csv` (đều bảo vệ bằng `requireAdminAuth`) |
| **Định dạng hỗ trợ** | **Chỉ `.xlsx`** (kiểm tra magic bytes `PK\x03\x04`). Không hỗ trợ `.xls` hay `.csv`. |
| **Nút tải file Excel mẫu trên Admin?** | **KHÔNG CÓ** nút tải file `.xlsx` mẫu trong `ExcelImportWizard.tsx` (chỉ có dòng hướng dẫn text các cột chuẩn và nút tải CSV báo lỗi sau commit). |
| **Giới hạn dung lượng & số dòng** | Tối đa **5 MB** (`MAX_EXCEL_FILE_BYTES`) và **1.000 dòng dữ liệu** (`MAX_EXCEL_DATA_ROWS`). |
| **Preview & Validate trước ghi DB?** | **CÓ** — bước Preview không bao giờ ghi DB, trả về bảng phân loại `valid` / `duplicate_in_file` / `duplicate_in_db` / `error` kèm `previewToken` ký HMAC-SHA256 (hết hạn sau 15 phút). |

---

## 3. Schema Excel chính xác & Bảng Header mẫu (Phase 4)

Hàm `normalizeHeaderKey` (`v28ExcelImportService.ts:124–132`) tự bỏ dấu tiếng Việt, chuyển chữ thường và đổi khoảng trắng/ký tự đặc biệt thành `_`, nên **không phân biệt hoa/thường**.

| Tên cột chuẩn | Các tên alias được chấp nhận | Bắt buộc? | Kiểu dữ liệu & Quy tắc Validate (`ExcelProductRowSchema`) | Ví dụ hợp lệ |
| :--- | :--- | :---: | :--- | :--- |
| **`name`** | `ten`, `ten_san_pham`, `product_name` | **Bắt buộc** | Chuỗi `2–200` ký tự | `Dầu dừa ép lạnh nguyên chất 250ml` |
| **`sku`** | `ma_sku`, `ma_sp`, `ma_san_pham` | **Bắt buộc** | Chuỗi `1–100` ký tự, **duy nhất theo `companyId`** | `AGRI-DUA-01` |
| **`price`** | `gia`, `gia_ban` | **Bắt buộc** | Số hữu hạn `>= 0` (tự bỏ `,`, `_`, khoảng trắng) | `145000` |
| **`image_url`** | `image`, `hinh_anh`, `anh_san_pham` | Tùy chọn *(nên có)* | URL **`http://` hoặc `https://`** hợp lệ (1 ảnh/SP) | `https://3dtrienlamso.mbws.vn/product-images/dua-01.jpg` |
| **`currency`** | `tien_te`, `don_vi_tien` | Tùy chọn | Chuỗi `1–10` ký tự, mặc định `'VND'` | `VND` |
| **`description`** | `mo_ta` | Tùy chọn | Chuỗi tối đa `5.000` ký tự, mặc định `''` | `Dầu dừa ép lạnh đóng chai thủy tinh 250ml.` |
| **`source_url`** | `url`, `link_san_pham` | Tùy chọn | URL `http://` hoặc `https://` hợp lệ | `https://example.com/dau-dua` |
| **`contact_url`** | `lien_he` | Tùy chọn | URL `http://` hoặc `https://` hợp lệ | `https://example.com/lien-he` |
| **`in_stock`** | `con_hang` | Tùy chọn | Boolean, mặc định `true` (`0/false/no/het/hết` → `false`) | `true` |

> **Các cột KHÔNG tồn tại trong parser (nếu đưa vào Excel sẽ bị bỏ qua âm thầm):** `boothId`, `booth_id`, `slotId`, `slot_id`, `category`, `model_url`, `video_url`, `images` (nhiều ảnh).

---

## 4. Kiểm tra luồng hình ảnh sản phẩm (Phase 2)

Truy vết đầy đủ: `Excel (image_url)` → `v28ExcelImportService.ts` (`images: imageUrl ? [imageUrl] : []`) → `SQLite v28_products.images` → `GET /api/v28/exhibitions/active` → `DynamicBooth3D.tsx` (`product.images[0]`) → `sceneTextures.ts:2111–2117` (`createArchitecturalProductDisplayTexture`) & `ProductDetail` (`<img>`).

| Câu hỏi kiểm toán | Kết quả thực tế |
| :--- | :--- |
| **Cột ảnh chính xác?** | `image_url` (hoặc `image`, `hinh_anh`, `anh_san_pham`). |
| **Hỗ trợ URL công khai hay đường dẫn nội bộ?** | **Chỉ URL `http://` hoặc `https://`** (`new URL(v)` từ chối đường dẫn tương đối kiểu `/images/a.jpg`). |
| **Hỗ trợ nhiều ảnh / 1 sản phẩm qua Excel?** | **KHÔNG** — chỉ lưu mảng 1 phần tử `[row.data.imageUrl]`. |
| **Hỗ trợ ảnh nhúng trực tiếp trong ô Excel?** | **KHÔNG** — `ExcelJS` chỉ đọc text `cell.value`, không đọc `sheet.getImages()`. |
| **Có cơ chế tải ảnh từ URL về server / upload ảnh riêng?** | **KHÔNG** — Backend không có route upload file ảnh và không tải ảnh về lưu cục bộ. |
| **Ảnh 403/404 hoặc lỗi CORS xử lý thế nào trong 3D?** | `sceneTextures.ts:2113` đặt **`img.crossOrigin = 'anonymous'`** để vẽ lên `CanvasTexture` WebGL. Nếu server ảnh ngoài chặn CORS hoặc hotlink (403/404), `img.onerror` gọi `drawLayout(null)` → **thẻ 3D mất ảnh, chỉ hiện nền chữ** (trong khi Product Detail dùng thẻ `<img>` HTML thường vẫn có thể hiện). |
| **Product Detail có dùng cùng URL ảnh không?** | **CÓ** — dùng chung `product.images[0]`. |

---

## 5. Kiểm tra Mapping 60 sản phẩm & 10 gian hàng (`#3..#10, #12, #13`) (Phase 3)

1. **Khả năng trưng bày 6 sản phẩm/gian:** **CÓ** — cả 10 gian (`#3, #4, #5, #6, #7, #8, #9, #10, #12, #13`) thuộc đủ 6 archetypes và mỗi gian đều có sẵn **6 slot trưng bày 3D (`slot_01` – `slot_06`)** đã đo khít nội thất trong `v28ProductSlotLayouts.ts`.
2. **Import Excel có tự gán gian hàng / slot không?** **KHÔNG.** `v28ExcelImportService.ts:532` luôn gán `boothId: null`. Import Excel chỉ đưa sản phẩm vào **Kho sản phẩm theo Doanh nghiệp (`companyId`)**.
3. **Phải gán slot thủ công trong Admin sau import?** **CÓ** — Admin chọn từng gian trong `/admin` và gán 6 sản phẩm vào `slot_01..slot_06` (`PUT /api/v28/booths/:id/slots/:slotId`).
4. **Xử lý trùng SKU:** Kiểm tra trùng theo `(companyId, sku)` (không phân biệt hoa/thường):
   - Trùng **trong cùng file Excel**: tự động bỏ qua dòng sau (`duplicate_in_file`).
   - Trùng **với sản phẩm đã có trong DB**: xử lý theo chiến lược Admin chọn lúc Commit:
     - `skip` *(mặc định, an toàn nhất)*: bỏ qua, không ghi đè.
     - `update`: cập nhật tên, giá, mô tả, ảnh, link của sản phẩm trùng SKU.
     - `create`: báo lỗi dòng trùng (không tạo SKU giả).
5. **Ảnh hưởng 4 gian Production (`#1, #2, #11, #21`):** **KHÔNG ảnh hưởng** nếu import với chiến lược `skip` (hoặc tạo doanh nghiệp nông sản riêng + dùng bộ mã SKU riêng như `AGRI-01..AGRI-60`) và chỉ gán slot cho 10 gian trống `#3..#10, #12, #13`.

---

## 6. Kiểm tra an toàn Import (Phase 5)

| Tiêu chí bảo mật & an toàn | Kết quả |
| :--- | :---: |
| Yêu cầu đăng nhập Admin (`requireAdminAuth`) | **PASS** (cả Preview, Commit, Report CSV) |
| Validate Zod schema (tên, SKU, giá >= 0, URL `http(s)`) | **PASS** |
| Chống double-submit & giới hạn TTL 15 phút | **PASS** (HMAC-SHA256 `previewToken` + cờ `job.committed`) |
| Kiểm tra trạng thái doanh nghiệp (`active`) | **PASS** |
| Rollback toàn bộ khi lỗi giữa chừng | **PASS** (`this.db.runInTransaction(...)`) |
| Giới hạn kích thước (5 MB) & số dòng (1.000 dòng) | **PASS** |
| Nguy cơ ghi đè dữ liệu đang có | An toàn nếu chọn **`skip`**; **chú ý** chọn `update` sẽ ghi đè sản phẩm trùng SKU trong cùng doanh nghiệp |
| **Excel Formula Injection** (`=`, `+`, `-`, `@`) | **CHƯA XỬ LÝ** ở `formatErrorsCsv` (chỉ escape `"`, chưa prefix `'` khi xuất CSV) và `cellToString` đọc `obj.result` |

---

## 7. Quy trình Import an toàn 60 sản phẩm đề xuất (Không cần sửa code)

1. **Bước 1 — Chuẩn bị & Host 60 ảnh cùng origin (chống 100% lỗi CORS 3D):**
   - Nén/resize 60 ảnh sản phẩm (`.jpg`/`.webp`, `< 300 KB/ảnh`, tỷ lệ vuông hoặc đứng `4:5`).
   - Upload vào thư mục `httpdocs/product-images/agri/` trên Plesk → lấy URL dạng `https://3dtrienlamso.mbws.vn/product-images/agri/<ten-file>.jpg`.
2. **Bước 2 — Soạn file `.xlsx` theo đúng 9 cột chuẩn:**
   - Hàng 1: `name`, `sku`, `price`, `currency`, `description`, `image_url`, `source_url`, `contact_url`, `in_stock`.
   - 60 dòng dữ liệu với mã SKU duy nhất (`AGRI-B03-01` .. `AGRI-B13-06`).
3. **Bước 3 — Import qua `/admin` → `ExcelImportWizard`:**
   - Chọn doanh nghiệp tương ứng (nên tạo 10 doanh nghiệp nông sản riêng hoặc 1 doanh nghiệp nông sản chung để tách biệt với `CELLPHONES`).
   - Upload file `.xlsx` → bấm **Xem trước (Preview)** → kiểm tra `60/60 Hợp lệ`, `0 lỗi`.
   - Chọn chiến lược trùng **`skip` (Bỏ qua)** → bấm **Xác nhận Commit**.
4. **Bước 4 — Gán sản phẩm vào 60 slot của 10 gian (`#3..#10, #12, #13`):**
   - Trong `/admin`, mở cấu hình từng gian và gán 6 sản phẩm vào `slot_01..slot_06`, sau đó mở gian 3D kiểm tra ảnh hiển thị sắc nét trên kệ/quầy/bục.

---

## 8. Những điểm nên cân nhắc cải tiến (Nếu muốn làm sau — Chưa sửa)

1. Thêm nút **Tải file Excel mẫu (`.xlsx`)** ngay trên `ExcelImportWizard.tsx`.
2. (Tùy chọn) Bổ sung hỗ trợ cột `booth_number` / `slot_id` tùy chọn trong Excel nếu sau này cần import hàng loạt kèm tự động gán slot cho nhiều gian.
3. Chống CSV Formula Injection (thêm tiền tố `'` nếu ô bắt đầu bằng `=`, `+`, `-`, `@`) trong `formatErrorsCsv`.
