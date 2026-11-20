# GRAND EXPO WORLD V28 — PHASE 2 AUDIT & IMPLEMENTATION REPORT
## ADMIN V28, PRODUCT URL IMPORT, CATALOG & NPC FUNCTIONS

- **Dự án:** Grand Expo World V28
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch làm việc:** `grand-expo-v28-dev` (baseline trước Phase 2: `d41b845`)
- **Nguyên tắc tuân thủ:** Audit-First — chỉ sửa các điểm `FAIL`/`PARTIAL`, giữ nguyên 100% thành phần đạt `PASS`, tuyệt đối không sửa model 3D, không sửa V27.5, không kích hoạt AI Live trả phí, không push/merge/deploy.

---

## 1. Audit chức năng trước khi sửa

Đã kiểm tra trực tiếp mã nguồn thực tế (`BE/src/routes/v28Routes.ts`, `BE/src/integrations/productAdapter.ts`, `BE/src/services/v28/audioCacheService.ts`, `BE/src/services/v28/aiConsultantService.ts`, `FE/src/pages/AdminV28Page.tsx`, `FE/src/components/adminV28/*`, `FE/src/components/v28/V28NpcConsultantPanel.tsx`):

- **Product URL Import (Backend):** `productAdapter.ts` + `POST /api/v28/imports/url` đã có scheme check, SSRF/Private IP/IPv6 block, manual redirect (tối đa 3 hop, kiểm tra DNS mỗi hop), timeout 6s, giới hạn 1MB, parse HTML an toàn, kiểm tra trùng URL theo doanh nghiệp — **nhưng thiếu** Rate Limiting, thiếu kiểm tra quyền sở hữu `boothId` thuộc `companyId`, và thiếu bước strip XSS rõ ràng trên `name`/`description` sau decode HTML entities.
- **Product URL Import (Frontend Admin V28):** `AdminV28Page.tsx` chưa có tab/giao diện Import URL (dán URL → Preview → Chỉnh sửa/Nhập thủ công → Lưu Catalog → Gán slot 1–6).
- **Product Catalog & 6 Slots:** Đã hoạt động đầy đủ (`ProductCatalog.tsx`, `ExhibitionConfigurator.tsx`, `PUT/DELETE /api/v28/booths/:id/slots/:slotId`, cross-company guard, xóa gán slot không xóa sản phẩm khỏi Catalog).
- **NPC Audio Generation & Cache:** `audioCacheService.ts` đã có content hash (`SHA-256`), lưu ổ đĩa `BE/data/v28_audio/` (không lưu BLOB trong SQLite), playback stream — **nhưng thiếu** tự động warm cache khi Admin Publish / cập nhật sản phẩm / gán slot, thiếu ghi nhận rõ trạng thái `pending` → `ready` / `failed`, thiếu API/UI Retry an toàn trong Admin V28.
- **NPC AI Chat:** Đã hoàn chỉnh (`aiConsultantService.ts` + `V28NpcConsultantPanel.tsx`), gắn đúng Booth & Company, grounded 100% dữ liệu thực tế, không bịa giá/tồn kho, có thông báo `LIVE GEMINI NOT VERIFIED`, có quota 15 chat/phút & prompt-injection guard, không lộ API key.
- **Admin V28 UI:** Còn đơn giản (chỉ 4 tab), thiếu thanh KPI tổng quan, thiếu tab URL Import & NPC/Audio Cache, cần nâng cấp presentation layer hiện đại & responsive mobile.

---

## 2. Phân loại Audit (PASS / PARTIAL / FAIL / NOT VERIFIED)

| STT | Chức năng | Trạng thái Audit | Bằng chứng source | Quyết định Phase 2 |
| :-: | :--- | :---: | :--- | :--- |
| 1 | Product Catalog & 6 Slots | **PASS** | `ProductCatalog.tsx`, `ExhibitionConfigurator.tsx`, `v28Routes.ts` (`PUT/DELETE /booths/:id/slots/:slotId`) | Giữ nguyên |
| 2 | NPC AI Chat (Grounded + Quota + Security) | **PASS** | `aiConsultantService.ts`, `V28NpcConsultantPanel.tsx`, `POST /api/v28/ai/chat` | Giữ nguyên |
| 3 | URL Import — Backend Security | **PARTIAL** | `productAdapter.ts` + `POST /api/v28/imports/url` (thiếu rate limit, booth ownership check, XSS strip) | Bổ sung đủ 3 lớp bảo mật thiếu |
| 4 | URL Import — Admin V28 UI Workflow | **FAIL** | `AdminV28Page.tsx` chưa có giao diện URL Import | Tạo `UrlProductImport.tsx` + tab riêng |
| 5 | NPC Audio Cache Lifecycle & Admin Control | **PARTIAL** | `audioCacheService.ts` (thiếu hook Publish/Product/Slot, trạng thái Pending/Ready/Failed, Retry API & Admin UI) | Bổ sung hooks, `GET /audio/overview`, `POST /booths/:id/audio/retry`, `NpcAudioManager.tsx` |
| 6 | Admin V28 UI Presentation Layer | **PARTIAL** | `AdminV28Page.tsx` (chỉ 4 tab, thiếu KPI strip & responsive polish) | Nâng cấp presentation layer, giữ nguyên toàn bộ business logic |

---

## 3. Chức năng đã đạt (`PASS`) và được giữ nguyên

- Toàn bộ V27.5 (`/?world=v27`, `/`, `/admin`, `BE/data/expo.db`, 6 model GLB gốc, `productAdapter.ts`).
- Toàn bộ World 3D V28 Phase 1 (Multi-U layout, measured 6-GLB spacing, `walkableRegions`, camera/avatar bounds, `<AvatarCharacter />`, `<SalesAssistantNpc />`, đổi tên khách).
- Toàn bộ Product Catalog, 6 Display Slots, Company Management, Excel Import Wizard, Draft/Preview/Publish/Rollback, và Grounded AI Chat/Voice.

---

## 4. Chức năng đã sửa / bổ sung

1. **URL Import Security & UI (`v28Routes.ts`, `UrlProductImport.tsx`):**
   - Bổ sung per-admin Rate Limiting (`15 lượt / 60 giây` → HTTP `429`), kiểm tra quyền sở hữu `boothId` thuộc `companyId` (`403`), và `sanitizePlainText()` loại bỏ `<script>`/`<style>`/`javascript:`/HTML tags.
   - Xây dựng giao diện 4 bước: Chọn Doanh nghiệp → Chọn Gian & Slot (1–6, tuỳ chọn) → Dán URL & Trích xuất Preview → Chỉnh sửa/Nhập thủ công khi web chặn scraping → Lưu Catalog (và gán ngay vào Slot) → Mở World 3D V28 kiểm tra.
2. **NPC Audio Cache Lifecycle & Admin Manager (`audioCacheService.ts`, `v28Routes.ts`, `NpcAudioManager.tsx`):**
   - Ghi nhận trạng thái thực `pending` → `ready` hoặc `failed` khi có lỗi lưu trữ; thêm `getAdminAudioOverview()` & `retryBoothAudio()`.
   - Tự động kiểm tra/làm ấm cache audio (non-blocking, tái sử dụng theo `content_hash`) khi Admin **Publish**, **Cập nhật sản phẩm** (`PATCH /products/:id`), hoặc **Gán slot** (`PUT /booths/:id/slots/:slotId`).
   - Hiển thị rõ chế độ **`Local Fallback WAV (Chế độ an toàn không phát sinh chi phí — LIVE GEMINI TTS NOT VERIFIED)`**; tuyệt đối không báo "AI Live đã tạo thành công" khi chạy fallback.
3. **Admin V28 UI Presentation Layer (`AdminV28Page.tsx`):**
   - Nâng cấp header hiện đại, thanh 4 KPI thời gian thực (Gian hàng hoạt động, Slot đã gán, NPC Audio Cache Ready/Pending/Failed, Trạng thái AI Consultant), thanh 6 tab gọn gàng và responsive mobile (`390×844` không tràn ngang).

---

## 5. Các file thay đổi

- [BE/src/services/v28/audioCacheService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/audioCacheService.ts): trạng thái `pending/ready/failed`, `getAdminAudioOverview()`, `retryBoothAudio()`.
- [BE/src/routes/v28Routes.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/routes/v28Routes.ts): rate limit, booth ownership guard, `sanitizePlainText`, hooks warm audio trên Publish/Product/Slot, routes `GET /audio/overview` & `POST /booths/:id/audio/retry`.
- [FE/src/services/v28Api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/v28Api.ts): `importProductFromUrl`, `getAudioOverview`, `retryBoothAudio`, `V28AdminAudioOverview`.
- [FE/src/components/adminV28/UrlProductImport.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/UrlProductImport.tsx) *(mới)*: quy trình Import URL + Manual Fallback + Preview + Gán Slot.
- [FE/src/components/adminV28/NpcAudioManager.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/NpcAudioManager.tsx) *(mới)*: quản trị Audio Cache, trạng thái Ready/Pending/Failed, Retry an toàn & phát thử `<audio>`.
- [FE/src/pages/AdminV28Page.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/AdminV28Page.tsx): nâng cấp presentation layer, thanh KPI, 6 tab responsive.
- [BE/src/__tests__/v28Phase2UrlImportSecurityAndAudio.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28Phase2UrlImportSecurityAndAudio.test.ts) *(mới)*: kiểm thử bảo mật URL Import & vòng đời Audio Cache.

---

## 6. Bằng chứng kiểm thử URL Import

- **Chặn SSRF trực tiếp trên Admin UI:** Dán `http://127.0.0.1:4000/api/admin/login` → Backend trả HTTP `400`, UI hiện cảnh báo bảo mật SSRF và **tự mở form nhập thủ công** (`blockedMessageVisible: true`, `manualEditorUnlocked: true`).
- **Trích xuất thực tế website công khai:** Dán `https://example.com` → trích xuất `Example Domain` (`extractedName: "Example Domain"`), **không tự bịa giá, ảnh hay mô tả** khi website không cung cấp.

---

## 7. Product Catalog & 6 Slots

- Đã xác minh trên cả API và Admin UI: mỗi gian hàng có đúng `6` slot (`slot_01`–`slot_06`), chọn từ Catalog độc lập, gán/thay sản phẩm, xóa gán slot không xóa sản phẩm khỏi Catalog, chặn gán sản phẩm của doanh nghiệp khác (`403`), đồng bộ ngay sang World 3D V28.

---

## 8. NPC Audio Cache

- **Kiểm chứng trên Admin UI (`🎙️ NPC & Audio Cache`):**
  - Hiển thị rõ `LIVE GEMINI TTS NOT VERIFIED` (Local Fallback WAV 0 chi phí).
  - Booth #1 (`Aether Tech Lab`) hiển thị `4` badge `READY`, `4` trình phát `<audio>` hoạt động, `Cache Hits: 4`, `Tạo mới: 0` ở lần tải lại (không gọi sinh audio lặp lại).
- **Kiểm chứng Retry khi lỗi lưu trữ (`v28Phase2UrlImportSecurityAndAudio.test.ts`):** Giả lập lỗi ổ đĩa → ghi `failedCount = 1` → gọi `retryBoothAudio()` → xóa bản ghi lỗi & phục hồi thành `ready` (`failedCount = 0`).

---

## 9. NPC AI Chat (Phân biệt rõ Mock vs Live)

- **Chế độ hiện tại:** `provider: "grounded_mock"`, `liveGeminiVerified: false` (**LIVE GEMINI NOT VERIFIED** — an toàn không phát sinh chi phí).
- **Kiểm chứng thực tế (`POST /api/v28/ai/chat` cho `booth-aether-tech`):** Câu hỏi `"Gian hàng này có những sản phẩm nào và giá bao nhiêu?"` → trả lời chính xác từ dữ liệu thật của gian hàng (`Trạm Cảm Biến Môi Trường AetherSense X1: 6.850.000 VND (Còn hàng...)`), gắn đúng `groundedBoothId`, không bịa thông tin.

---

## 10. Admin UI Screenshots (đã chụp & kiểm tra trực quan)

- `p2_admin_dashboard.png` — Dashboard V28 mới với thanh 4 KPI, 6 tab và sơ đồ 2D chữ U.
- `p2_admin_url_import.png` — Màn hình Import URL Sản phẩm với Preview `Example Domain`.
- `p2_admin_npc_audio.png` — Màn hình Quản trị NPC & Audio Cache với thẻ KPI, `READY` badges & trình phát `<audio>`.
- `p2_admin_mobile_390.png` — Giao diện Admin V28 trên Mobile Portrait `390×844` (đã sửa responsive `overflowX: false`).

---

## 11. Security Tests (`v28Phase2UrlImportSecurityAndAudio.test.ts` — PASS)

| Kiểm thử bảo mật | Kết quả |
| :--- | :---: |
| Chặn truy cập chưa đăng nhập (`401`) | **PASS** |
| Chặn gán `boothId` thuộc doanh nghiệp khác (`403`) | **PASS** |
| Chặn scheme không hợp lệ (`file://`, `javascript:`) (`400`) | **PASS** |
| Chặn SSRF & Private IPv4/IPv6 (`127.0.0.1`, `localhost`, `169.254.169.254`, `10.0.0.1`, `192.168.1.1`, `[::1]`) (`400`) | **PASS** |
| Kiểm tra DNS từng hop Redirect (`redirect: 'manual'`, tối đa 3 hop, timeout 6s, giới hạn 1MB) | **PASS** |
| Lọc XSS `<script>` trong HTML trích xuất (`sanitizePlainText`) | **PASS** |
| Rate limiting `15 lượt/phút` trên `/api/v28/imports/url` (`429`) | **PASS** |

---

## 12. Automated Tests & Build

- `npm run typecheck -w BE`: **PASS**
- `npm run typecheck -w FE`: **PASS**
- `npm run build -w BE`: **PASS**
- `npm run build -w FE`: **PASS** (710 modules)
- `BE/src/__tests__/v28Phase2UrlImportSecurityAndAudio.test.ts`: **2/2 PASS**
- Tổng cộng toàn repo: **10/10 test suites** đã kiểm chứng (không có lỗi hồi quy).

---

## 13. Regression V27.5 & V28

- **V27.5 Database (`BE/data/expo.db`):** SHA-256 không đổi (`8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76`).
- **V27.5 UI & GLBs:** Không chỉnh sửa bất kỳ file model 3D, route V27.5 hay Admin V27.5 nào.
- **V28 Multi-U Layout & Console:** `0` console errors, `0` page errors.

---

## 14. Git Status & Commit

- Branch: `grand-expo-v28-dev` (chỉ commit cục bộ, **không push, không merge, không deploy**, không stage `BE/data/`).

---

## 15. Outstanding Issues & Ghi chú trung thực

- **`LIVE GEMINI NOT VERIFIED`:** Cả AI Chat và Audio TTS đều đang chạy chế độ an toàn không phát sinh chi phí (`grounded_mock` / `local-fallback WAV`) theo đúng yêu cầu chưa kích hoạt dịch vụ có phí.
- **`REAL DEVICE NOT TESTED`:** Mobile Admin (`390×844`) kiểm thử qua Chrome DevTools Device Emulation.
- **Website chống scraping bằng CAPTCHA/Cloudflare:** Khi website nguồn chặn fetch HTTP trực tiếp, hệ thống báo lỗi rõ ràng và tự mở chế độ nhập thủ công thay vì cố vượt qua lớp chống bot.

**KẾT LUẬN PHASE 2: PASS — DỪNG VÀ CHỜ NGƯỜI DÙNG NGHIỆM THU CUỐI CÙNG.**
