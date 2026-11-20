# GRAND EXPO WORLD V28 — ADMIN EXHIBITION CREATOR & U-SHAPED LAYOUT REPORT
## AUDIT FIRST · MINIMAL CHANGES · STRICT SCOPE · FULL QA

- **Dự án:** Grand Expo World V28
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch làm việc:** `grand-expo-v28-dev`
- **Trạng thái:** ĐÃ TRIỂN KHAI, KIỂM THỬ TỰ ĐỘNG & TRÌNH DUYỆT THỰC TẾ — DỪNG CHỜ NGHIỆM THU (KHÔNG PUSH / KHÔNG MERGE / KHÔNG DEPLOY)

---

## 1. Git Baseline

- **Branch trước khi sửa:** `grand-expo-v28-dev`
- **HEAD commit trước khi sửa:** `aa0fbdc` (`feat(v28-npc): V27.5 Gioi thieu + Chat tabs & Gemini TTS pre-gen cache`)
- **Working tree trước khi sửa:** Sạch (chỉ có thư mục runtime `BE/data/` không theo dõi).
- **V27.5 Database (`BE/data/expo.db`):** SHA-256 gốc `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` (không thay đổi).

---

## 2. Audit trước khi sửa (PASS / PARTIAL / FAIL / NOT VERIFIED)

| STT | Chức năng | File / Function hiện tại | Kết quả Audit | Có sửa? | Lý do |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | Admin nhập `Số khu` × `Số gian/khu` (xóa hết không nhảy số, chặn wheel, hiện tổng & xác nhận trước khi tạo) | `FE/src/components/adminV28/ExhibitionConfigurator.tsx` (lines 38–39, 365–385) | **FAIL** | Có | Đang nhập `Số gian` tổng bằng `type="number"` tự nhảy về `20` khi xóa trắng, không nhập theo `Số khu × Số gian/khu` |
| 2 | Bố cục 2 dãy chữ U đối diện (Trái mở sang phải `+X`, Phải mở sang trái `-X`, trục đi bộ chính ở giữa — 10 khu = 5 Trái + 5 Phải) | `BE/src/services/v28/layoutGenerator.ts`, `exhibitionService.ts` | **FAIL** | Có | Đang chia dãy Bắc/Nam (4 Bắc + 2 Nam) và tự ép theo 6 danh mục DB thay vì tôn trọng `zoneCount × boothsPerZone` |
| 3 | Nhập 1 URL website doanh nghiệp → Tự tìm danh sách sản phẩm công khai + Preview + Lưu hàng loạt & phân bổ | `BE/src/routes/v28Routes.ts` (`/imports/url`), `UrlProductImport.tsx` | **PARTIAL** | Có | Mới hỗ trợ 1 trang sản phẩm đơn lẻ, chưa tự phát hiện nhiều sản phẩm từ trang chủ/danh mục website doanh nghiệp |
| 4 | Danh sách Khu/Gian + Gian trống đánh dấu đỏ (`Chưa có sản phẩm`) + Xóa gian an toàn không mất Catalog | `ExhibitionConfigurator.tsx`, `exhibitionService.ts` | **PARTIAL** | Có | Thiếu thẻ tổng quan từng khu có số gian trống, thiếu đánh dấu đỏ rõ ràng cho gian `0/6`, thiếu API & hộp xác nhận xóa gian Draft |
| 5 | Draft / Preview / Publish / Rollback, 6 Slots, Model 3D, NPC / Audio / Chat, V27.5, Camera, Realtime | Các module hiện có | **PASS** | Không | Đã đạt đầy đủ, giữ nguyên 100% |

---

## 3. Những chức năng đã đạt (`PASS`) và KHÔNG sửa

- Toàn bộ V27.5 (`/?world=v27`, `/`, `/admin`, `BE/data/expo.db`, 6 GLB gốc).
- 6 model 3D gian hàng, nhân vật khách tham quan (`AvatarCharacter`), nhân viên tư vấn (`SalesAssistantNpc`), animation, vật liệu, texture, cảnh quan.
- Bảng tư vấn NPC 2 tab `Giới thiệu | Chat`, Gemini TTS & Audio Cache, Grounded AI Chat.
- Camera, Navigation, Realtime/AOI, Product Catalog, Product Modal, 6 Display Slots và cơ chế Draft/Preview/Publish/Rollback.

---

## 4. Những chức năng đã bổ sung

1. **Form tạo triển lãm `Số khu × Số gian/khu` dễ nhập (`ExhibitionConfigurator.tsx`):**
   - Dùng string-controlled `type="text" inputMode="numeric"`, `onWheel={(e) => e.currentTarget.blur()}`: cho phép xóa trắng hoàn toàn, dán số, gõ lại mà không nhảy về số mặc định và không mất focus.
   - Tự tính `totalBooths = zoneCount * boothsPerZone` (giới hạn an toàn `1–30` khu, `1–50` gian/khu, tối đa `300` gian), hiển thị bảng tóm tắt xác nhận trước khi tạo Draft (World công khai chỉ thay đổi sau khi bấm `🚀 Publish`).
2. **Bố cục 2 dãy chữ U đối diện Trái/Phải (`layoutGenerator.ts`, `exhibitionService.ts`, `v28Schemas.ts`):**
   - 1 khu: 1 chữ U mở Nam; ≥ 2 khu: 2 dãy đối diện **Trái (`east`, mở `+X`)** và **Phải (`west`, mở `-X`)** chạy dọc theo **Đại lộ Trung tâm rộng 14m** ở giữa (`x = 0`).
   - 10 khu = **5 Trái + 5 Phải**; 20 khu = **10 Trái + 10 Phải**; số khu lẻ chia cân đối (`Math.ceil(n/2)` Trái + phần còn lại Phải). Dùng đúng bounding box thực đo 6 GLB (`6.72–6.87m × 5.19m`), khu nhỏ `1–3` gian tự thu gọn hợp lý.
3. **Website Business URL Product Discovery (`POST /api/v28/imports/website`, `UrlProductImport.tsx`):**
   - Nhập 1 URL website doanh nghiệp → backend quét an toàn tối đa 6 trang cùng origin (tái sử dụng 100% kiểm tra SSRF/Private IP/Redirect/DNS/Timeout 6s/Size 1MB/XSS/Rate Limit), ưu tiên JSON-LD `Product`/`ItemList`, loại trùng, trả danh sách Preview cho Admin chọn/bỏ chọn, sửa, lưu hàng loạt vào Catalog và gán trực tiếp vào Slot (1–6).
4. **Danh sách Khu/Gian, Đánh dấu đỏ Gian trống & Xóa gian an toàn (`exhibitionService.ts`, `v28Routes.ts`, `ExhibitionConfigurator.tsx`):**
   - Hiển thị lưới thẻ Khu (`10 khu · 100 gian`), mỗi thẻ ghi rõ số gian, số gian có SP, số gian trống (đỏ), bấm vào để lọc ngay gian của khu đó.
   - Gian trống (`0/6` slot) được đánh dấu **nền đỏ nhạt + viền đỏ trái + nhãn chữ `🔴 Chưa có sản phẩm (0/6)`** trong Admin (vẫn giữ nguyên model 3D trong World V28, không tô đỏ 3D).
   - Xóa gian an toàn (`DELETE /api/v28/exhibitions/:id/versions/:versionId/booths/:boothId`): có hộp xác nhận nêu rõ Booth ID & Khu, chặn xóa dây chuyền nếu có SP mà chưa xác nhận gỡ slot, **không xóa sản phẩm khỏi Catalog**, **không xóa doanh nghiệp**, cập nhật `target_booth_count` để không tự tạo lại gian đã xóa.

---

## 5. Danh sách file đã thay đổi (Strict Scope)

1. [BE/src/services/v28/layoutGenerator.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/layoutGenerator.ts) — Bố cục 2 dãy chữ U đối diện Trái/Phải + `zoneCount × boothsPerZone` + `walkableRegions` thích nghi.
2. [BE/src/schemas/v28Schemas.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/schemas/v28Schemas.ts) — Cho phép `zoneCount` (1–30), `boothsPerZone` (1–50), `targetBoothCount` (1–300).
3. [BE/src/services/v28/exhibitionService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/exhibitionService.ts) — Tôn trọng đúng `zoneCount × boothsPerZone` khi tạo Draft + thêm `deleteDraftBoothPlacement()`.
4. [BE/src/routes/v28Routes.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/routes/v28Routes.ts) — Thêm `POST /imports/website`, `DELETE /exhibitions/:id/versions/:versionId/booths/:boothId`, cập nhật `POST /exhibitions/:id/drafts`.
5. [FE/src/services/v28Api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/v28Api.ts) — Thêm `zoneCount`/`boothsPerZone`, `deleteDraftBooth`, `discoverWebsiteProducts`.
6. [FE/src/components/adminV28/ExhibitionConfigurator.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExhibitionConfigurator.tsx) — Form `Số khu × Số gian/khu`, hộp xác nhận tạo, lưới thẻ Khu, đánh dấu đỏ gian trống, hộp xác nhận xóa gian.
7. [FE/src/components/adminV28/UrlProductImport.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/UrlProductImport.tsx) — Nút `🌐 Quét Website Tìm Sản phẩm` + danh sách Preview chọn/sửa/lưu hàng loạt & gán Slot.
8. [BE/src/__tests__/v28AdminCreatorAndULayout.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28AdminCreatorAndULayout.test.ts) *(mới)* & [BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts) — Bộ test đầy đủ cho 7 cấu hình động, xóa gian an toàn & bảo mật website discovery.

---

## 6. Quy trình tạo triển lãm (5 bước trong Admin V28)

1. Nhập **Số khu** (VD: `10`) và **Số gian/khu** (VD: `10`) → xem ngay `Tổng dự kiến: 100 gian hàng`.
2. (Tuỳ chọn) Vào tab **🔗 Import URL Sản phẩm** dán 1 URL website doanh nghiệp → bấm **🌐 Quét Website Tìm Sản phẩm** → xem trước, chọn/sửa và lưu vào Catalog + gán Slot (1–6).
3. Bấm **🏛️ Tạo không gian triển lãm** → kiểm tra bảng tóm tắt (`10 khu`, `10 gian/khu`, `100 gian`, `5 Trái + 5 Phải đối diện`, số gian có SP / gian trống) → xác nhận tạo bản **Draft**.
4. Kiểm tra lưới **10 khu · 100 gian**, lọc gian trống màu đỏ (`Chưa có sản phẩm`), thêm sản phẩm hoặc xóa gian trống an toàn, bấm **👁️ Xem trước 3D Draft**.
5. Bấm **🚀 Publish** để đồng bộ chính thức ra World 3D V28 (`/?world=dynamic`).

---

## 7–10. Screenshots kiểm chứng thực tế (Headless Chrome CDP)

- **7. Admin Form & Xác nhận tạo (`creator_01_admin_form_confirm.png`):** Hiển thị rõ 2 ô `Số khu triển lãm [10]` × `Số gian hàng mỗi khu [10]`, `Tổng dự kiến: 100 gian hàng`, hộp xác nhận `5 Trái + 5 Phải đối diện · Gian đang có SP: 6 gian · Gian trống dự kiến: 94 gian`.
- **8 & 9. Danh sách 10 Khu & Gian trống màu đỏ (`creator_02_zones_and_empty_red.png`):** Đủ 10 thẻ Khu (`10 khu · 100 gian`) với bộ đếm `🔴 4 trống` / `🔴 10 trống`, bảng 100 gian kèm nút `🗑️ Xóa` và nhãn `🔴 Chưa có sản phẩm (0/6)` cho các gian trống.
- **10. Tổng quan World 3D 10 Khu chữ U (`creator_03_world_10u_overview.png`):** 2 dãy đối diện **5 Trái + 5 Phải** mở thẳng vào Đại lộ Trung tâm chạy dọc ở giữa, 100 gian gọn gàng, **60 FPS**, `124 draw calls`, `67,296 triangles`.

---

## 11. Kết quả kiểm thử cấu hình động (`1×1` đến `20×10`)

Tất cả 7 cấu hình đều **PASS** trong `v28AdminCreatorAndULayout.test.ts` (`0 overlap`, `0 outOfBounds`, `0 blockedWalkway`, `0 unreachableBooth`, `0 focusClip`):

| Cấu hình | Tổng gian | Số khu | Dãy Trái (`east`) / Phải (`west`) | Kết quả |
| :---: | :---: | :---: | :---: | :---: |
| `1 × 1` | 1 | 1 | `1 khu (south)` | **PASS** |
| `1 × 5` | 5 | 1 | `1 khu (south)` | **PASS** |
| `2 × 10` | 20 | 2 | `1 Trái + 1 Phải` | **PASS** |
| `5 × 10` | 50 | 5 | `3 Trái + 2 Phải` | **PASS** |
| `10 × 10` | 100 | 10 | **`5 Trái + 5 Phải`** | **PASS** |
| `10 × 20` | 200 | 10 | `5 Trái + 5 Phải` | **PASS** |
| `20 × 10` | 200 | 20 | `10 Trái + 10 Phải` | **PASS** |

---

## 12. Kết quả URL Import & Website Discovery

- **Bảo mật (`v28AdminCreatorAndULayout.test.ts` — PASS):** Chặn `401` chưa đăng nhập, chặn `400` cho `127.0.0.1`, `localhost`, `169.254.169.254`, `file:///etc/passwd`; tái sử dụng rate limit `15 lượt/phút`, timeout 6s, max 1MB/trang, max 6 trang, lọc XSS.
- **Lưu ý trung thực:** Các website bán hàng thương mại có Cloudflare/CAPTCHA chống scraping sẽ trả thông báo rõ ràng và mở chế độ nhập thủ công — không vượt qua CAPTCHA và không dùng dữ liệu giả.

---

## 13. Kết quả Draft / Preview / Publish

- Tạo Draft `10×10 = 100 gian` trong khi bản Published đang là `6 gian` → `getActiveExhibitionWorld()` vẫn giữ nguyên `6 gian` cho đến khi Admin bấm **🚀 Publish**.
- Sau khi Publish → `/?world=dynamic` đồng bộ ngay `100 gian · 10 khu chữ U · 20 walkableRegions · 60 FPS`.

---

## 14. Kết quả Xóa gian an toàn

- Xóa 1 gian trống (`0/6`) trong Draft `100 gian` → còn `99 gian`, `target_booth_count = 99`, Catalog giữ nguyên 100% số sản phẩm.
- Thử xóa gian đang có sản phẩm khi `forceUnassign = false` → bị chặn an toàn (`409`).
- Sau khi Publish bản `99 gian` & reload → vẫn là `99 gian`, gian vừa xóa **không bị tự động tạo lại**.

---

## 15. Kết quả Build & Tests

- `npm run typecheck -w BE`: **PASS**
- `npm run typecheck -w FE`: **PASS**
- `npm run build -w BE`: **PASS**
- `npm run build -w FE`: **PASS** (`710 modules`)
- `BE/src/__tests__/v28AdminCreatorAndULayout.test.ts`: **3/3 PASS** (`150ms`)
- `BE/src/__tests__/v28Phase8ClusterAndCategory.test.ts`: **3/3 PASS** (`212ms`)
- Headless Chrome CDP (`qa_admin_creator_10x10.mjs`): **PASS** (`0` console errors, `0` page errors).

---

## 16. Kết quả Regression V27.5 & V28

- `BE/data/expo.db` SHA-256 không đổi: `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76`.
- Không sửa bất kỳ model 3D, NPC/Avatar, Audio/Chat, Camera hay route V27.5 nào.

---

## 17. Các vấn đề còn lại (Ghi nhận trung thực)

- **Website bán hàng ngoài thực tế có anti-bot/SPA render bằng JS:** `POST /api/v28/imports/website` trích xuất HTML tĩnh + JSON-LD trên tối đa 6 trang; với website SPA chỉ render qua JS hoặc chặn bot, Admin dùng ngay form nhập thủ công tích hợp sẵn.
- **`REAL DEVICE NOT TESTED`:** Kiểm thử thực hiện trên Headless Chrome CDP desktop (`1440×900`).

---

## 18. Git Status & Rollback Instructions

- **Branch:** `grand-expo-v28-dev` (commit cục bộ ngay sau báo cáo này, **không push, không merge, không deploy**).
- **Rollback an toàn về trước tác vụ này (nếu cần):** `git revert <commit_hash>` hoặc tạo branch từ `aa0fbdc` (`git checkout -b rollback-check aa0fbdc`), không dùng `git reset --hard` khi có thay đổi chưa lưu.

**KẾT LUẬN: PASS — DỪNG VÀ CHỜ NGƯỜI DÙNG NGHIỆM THU.**
