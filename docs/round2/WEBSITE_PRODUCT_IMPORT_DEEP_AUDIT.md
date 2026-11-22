# GRAND EXPO V28 — DEEP AUDIT: WEBSITE URL → PRODUCT CATALOG → 3D BOOTH

**Ngày kiểm toán:** 2026-11-22  
**Chế độ:** **AUDIT + REPRODUCE + EMPIRICAL TEST ONLY** — **0 dòng source code, test, Production DB hay 85 WAV bị chỉnh sửa.**  
**Bằng chứng thực nghiệm:** Chạy trực tiếp 3 bộ test BE (`v28WebsiteImport.test.ts`, `v28Phase2UrlImportSecurityAndAudio.test.ts`, `v28Phase9SmartImportAndSizing.test.ts` — `9/9` PASS) + script kiểm thử cô lập trên SQLite tạm (`website_import_e2e_audit.mjs`, không chạm Production DB).

---

## A. Executive Summary

- **Chức năng URL Import hiện có 2 luồng tách biệt:**
  1. **Single-URL Product Import (`POST /api/v28/imports/url`):** Chỉ đọc duy nhất **1 trang sản phẩm** được dán vào, trả về 1 draft (`name`, `sku`, `price`, `images`, `description`) để lưu vào Kho sản phẩm (`boothId: null` hoặc `boothId` chỉ định) — **không tự gán `slot_01..slot_06`**.
  2. **Website Product Discovery (`POST /api/v28/imports/website` — dùng trong `ExhibitionConfigurator.tsx`):** Crawler có giới hạn dùng native Node `fetch()` + Regex HTML (không chạy JavaScript). Hỗ trợ đọc JSON-LD, Open Graph, link sản phẩm cùng origin, tối đa 2 trang danh mục và `robots.txt`/`sitemap.xml`, nhưng bị **chặn cứng ở `maxPages = 15` (FE) / `maxPages = 25` (API)** và **không hỗ trợ phân trang (`?page=2`, `/page/2`, Load More, Infinite Scroll)**.
- **Đánh giá nhanh theo 3 loại URL:**
  - **Homepage:** **PARTIAL** — Chỉ lấy được tối đa **`14` sản phẩm** (FE `maxPages=15`) hoặc **`24` sản phẩm** (API `maxPages=25`) nếu mỗi sản phẩm nằm ở 1 trang chi tiết riêng; chỉ lấy được nhiều hơn nếu trang chủ nhúng sẵn mảng JSON-LD `@type: Product` trực tiếp trong HTML.
  - **Category Page:** **PARTIAL** — **Không hỗ trợ phân trang (`?page=2`, `/page/2`, Load More, Infinite Scroll)** và bị chặn bởi cùng trần `14` (FE) / `24` (API) trang chi tiết.
  - **Product Detail:** **PASS (nếu có JSON-LD/OG)** · **FAIL (nếu chỉ có HTML/JS thuần)** — Trích xuất tốt JSON-LD và Open Graph; thất bại trên trang render bằng JavaScript (SPA) hoặc trang chỉ dùng thẻ `<img>` + HTML thường.
- **Khả năng lấy đủ 60 sản phẩm để lấp đầy 10 gian (`#3..#10, #12, #13`):**
  - **FAIL với website thương mại điện tử thông thường (mỗi SP 1 trang chi tiết)** trong 1 lần dán URL duy nhất do giới hạn cứng `maxPages = 15` (FE) → tối đa **`14` sản phẩm / lần quét**.
  - **CHỈ ĐẠT** nếu website nhúng sẵn ≥60 JSON-LD `Product` trên cùng 1 trang HTML, **hoặc** Admin nhập nhiều URL danh mục/sản phẩm lẻ nhiều lần.

---

## B. Architecture & Data Flow (Bằng chứng File / Function / Line)

```
Admin (/admin -> ExhibitionConfigurator.tsx:420-560)
  1. Nhập URL -> POST /api/v28/imports/website (v28Routes.ts:488)
     - Rate limit: 15 req/phút/admin (v28Routes.ts:56, 490)
     - maxPages = clamp(1..25, default 15); FE gửi cố định maxPages: 15 (ExhibitionConfigurator.tsx:424)
     - CrawlBudget = 12 MB tổng; mỗi HTML <= 3.5 MB; Sitemap <= 2 MB (productAdapter.ts:10-12)
  2. Fetch HTML an toàn: fetchExternalProductHtml -> fetchExternalText (productAdapter.ts:247-420)
     - SSRF + DNS Rebinding guard: validateExternalUrlSafetyWithIp + undici pinned-IP agent (L138-245)
     - Manual redirect tối đa 3 hop, re-validate từng hop (L271-319); timeout 15s (L13)
  3. Discover & Parse (v28Routes.ts:833-987):
     - Bước 1: Parse JSON-LD Product / ItemList trên landing page (L834-902)
     - Bước 2: Quét <a href> cùng origin khớp isLikelyProductPath / isLikelyCategoryPath (L563-605, 905)
     - Bước 3: Nếu candidateLinks < 4 -> mở rộng tối đa 2 trang danh mục (L909-928) và sitemap.xml (tối đa 3 child sitemap, depth <= 2, L607-686, 930-936)
     - Bước 4: Fetch từng trang chi tiết đến khi pagesScanned >= maxPages -> extractProductFromHtml (productAdapter.ts:560-706)
     - Dedup trong phiên quét theo normUrl & normName; kiểm tra trùng DB qua findDuplicateProductBySourceUrl (L810-813)
  4. Lưu vào Catalog (ExhibitionConfigurator.tsx:448-467):
     - FE chạy vòng for gọi tuần tự POST /api/v28/products (KHÔNG có transaction -> lỗi giữa chừng không rollback!)
  5. Gán vào Gian & Slot 3D:
     - Luồng ExhibitionConfigurator: tạo Draft Version cho 1 doanh nghiệp duy nhất (ownerCompanyId) -> gọi POST /auto-allocate (v28Routes.ts:1193) tự gán tối đa 6 slot/gian.
     - Luồng ProductCatalog (Single URL): lưu boothId: null -> Admin PHẢI gán thủ công vào slot_01..slot_06 (PUT /api/v28/booths/:id/slots/:slotId).
  6. Render 3D:
     - DynamicBooth3D.tsx đọc product.images[0] -> sceneTextures.ts:2111-2117 (img.crossOrigin = 'anonymous').
```

---

## C. Crawl Capability Matrix

| Loại trang / Kịch bản | Trạng thái | Kết quả đo thực tế & Bằng chứng |
| :--- | :---: | :--- |
| **Homepage có link SP / danh mục / sitemap** | **PARTIAL** | Chấp nhận homepage, lọc bỏ link tin tức/giới thiệu/liên hệ (`NON_PRODUCT_PATH_RE`, `v28Routes.ts:526`), hỗ trợ `sitemap.xml` (depth ≤ 2, max 3 child), nhưng bị chặn ở **`14` SP (FE)** / **`24` SP (API)** và chỉ mở rộng danh mục/sitemap khi `< 4` link. |
| **Category Page có phân trang (`?page=2`, `/page/2`)** | **FAIL** | Chỉ quét trang đầu tiên; **không** theo link phân trang, **không** hỗ trợ Load More / Infinite Scroll. |
| **Product Detail có JSON-LD (`@type: Product`)** | **PASS** | `website_import_e2e_audit.mjs`: lấy đúng `name`, `sku`, `price: 185000`, `currency: VND`, `images` (chuyển relative `/images/st25.webp` → absolute URL), `inStock: true`, `0` warning. |
| **Product Detail chỉ có Open Graph (`og:*`)** | **PARTIAL** | Lấy được `name`, `price` (nếu có `product:price:amount`), `images`, nhưng **thiếu `sku`** (`""`) và biến thể. |
| **Trang render bằng JavaScript (SPA / CSR)** | **FAIL** | `jsOnlySpa` chỉ đọc `<title>`, `price: 0`, `images: []` → bị bộ lọc loại thành **0 sản phẩm** (không dùng Playwright/Puppeteer). |
| **Trang chỉ có `<img>` + HTML thường (không JSON-LD/OG)** | **FAIL** | `imgTagOnlyNoMeta` trả `images: []`, `price: 0` (không đọc `<img src>`, `data-src`, `srcset` hay class giá HTML). |
| **Trang lỗi HTTP 403 / 429 / 500 / Timeout / CAPTCHA** | **PASS** | Bắt lỗi chuẩn (`HTTP_403`, `HTTP_429`, `TIMEOUT` 15s, `CAPTCHA_BLOCKED`), trả thông báo tiếng Việt rõ ràng. *Lưu ý:* không có retry/backoff. |
| **Redirect & Canonical** | **PARTIAL** | Theo redirect thủ công tối đa 3 hop và kiểm tra SSRF từng hop (`productAdapter.ts:271-319`), nhưng **không** chuẩn hóa `<link rel="canonical">` hoặc query tracking (`?utm_*`) khi chống trùng URL. |
| **`robots.txt` compliance** | **PARTIAL** | Chỉ đọc dòng `Sitemap:` trong `robots.txt` (`v28Routes.ts:623-631`), **không** kiểm tra quy tắc `Disallow:`. |

---

## D. Product Count Matrix (`TC01–TC07`: 1 → 120 sản phẩm)

Đo thực tế bằng `website_import_e2e_audit.mjs` trên SQLite tạm (không chạm Production DB):

| Test | SP nguồn | Multi-page (FE `maxPages=15`) | Multi-page (API `maxPages=25`) | Inline JSON-LD (1 trang) | Lưu vào DB | Đọc `listProducts(limit:200)` | Gán vào 10 gian (max `60` slot) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **TC01** | `1` | `1` | `1` | `1` | `1` | `1` | `1` |
| **TC02** | `6` | `6` | `6` | `6` | `6` | `6` | `6` |
| **TC03** | `10` | `10` | `10` | `10` | `10` | `10` | `10` |
| **TC04** | `30` | **`14` (CẮT)** | **`24` (CẮT)** | `30` | `30` | `30` | `30` |
| **TC05** | `60` | **`14` (CẮT)** | **`24` (CẮT)** | `60` | `60` | `60` | `60` |
| **TC06** | `100` | **`14` (CẮT)** | **`24` (CẮT)** | `100` | `100` | `100` | `60` *(40 dư)* |
| **TC07** | `120` | **`14` (CẮT)** | **`24` (CẮT)** | `120` | `120` | **`100` (CẮT 20 SP!)** | `60` *(60 dư)* |

> **Phát hiện ẩn ở TC07:** `v28Database.ts:1210` chặn cứng `limit = Math.min(100, ...)`, trong khi FE `ExhibitionConfigurator.tsx:499` yêu cầu `limit: 200` → mọi doanh nghiệp có >100 SP bị cắt mất phần dư khi đọc trang 1.

---

## E. Image Reliability (Admin vs Product Detail vs WebGL 3D)

- **Nguồn trích xuất:** Chỉ lấy từ JSON-LD `productNode.image` và `<meta property="og:image">` (`productAdapter.ts:580-648`); chuyển relative URL → absolute URL (`resolveUrlMaybe`). **Không đọc `<img src>`, `data-src`, `srcset`**.
- **Lưu trữ & kiểm tra:** Dùng trực tiếp URL gốc của website nguồn; **không** kiểm tra HTTP 200 / MIME type, **không** tải ảnh về server. Nếu website nguồn đổi link hoặc chặn hotlink (403), ảnh sẽ hỏng.
- **So sánh 3 nơi hiển thị:**
  1. **Admin (`<img>`):** Hiển thị được nếu URL không chặn hotlink (không cần CORS).
  2. **Product Detail (`<img>`):** Hiển thị được nếu URL không chặn hotlink (không cần CORS).
  3. **Gian hàng 3D WebGL (`sceneTextures.ts:2113`):** Dùng `img.crossOrigin = 'anonymous'` để vẽ lên `CanvasTexture` → **BỊ MẤT ẢNH (rơi về nền chữ fallback)** trên phần lớn website thương mại điện tử ngoài không bật header `Access-Control-Allow-Origin: *`!

---

## F. Data Integrity & G. Booth Assignment

- **Trùng lặp:**
  - `POST /imports/website`: chống trùng trong phiên theo `normUrl` & `normName`; kiểm tra trùng DB theo `sourceUrl` (`findDuplicateProductBySourceUrl`), **nhưng chưa chuẩn hóa query params (`?utm_*`) hay canonical URL** và **không tự cập nhật giá/ảnh** nếu import lại URL đã có (`ExhibitionConfigurator.tsx:449` bỏ qua toàn bộ `alreadyInCatalog`).
- **Transaction & Rollback:** `ExhibitionConfigurator.tsx:448–467` lưu từng sản phẩm bằng vòng `for` gọi `POST /api/v28/products` lẻ → **KHÔNG có transaction/rollback** nếu lỗi ở sản phẩm thứ 31/60.
- **Lấp đầy 10 gian nông sản (`#3..#10, #12, #13`):**
  - `ExhibitionConfigurator` có nút tự động phân bổ (`autoAllocateDraftProducts`), **NHƯNG** kiến trúc của nó là **Single-Business Draft** (tạo 1 phiên bản triển lãm mới mà tất cả 100 gian thuộc **1 doanh nghiệp duy nhất**, đồng thời từ chối nếu website không có metadata tổ chức `confidence === 'verified'`).
  - Để nhập 10 gian nông sản vào triển lãm hiện có mà không ghi đè 4 gian `CELLPHONES`, Admin phải nhập từng URL vào Catalog rồi **gán thủ công vào 60 slot (`slot_01..slot_06`)**.
  - Dữ liệu lưu SQLite bền vững sau restart (`persistenceAfterReopen` PASS). Overlay `?demoAgri=1` chỉ phủ lên gian trống (`assignedSlotCount === 0`), **không ghi đè sản phẩm thật**.

---

## H. Security Audit (8/8 SSRF Vector Blocked)

- **SSRF & DNS Rebinding:** **PASS** — `website_import_e2e_audit.mjs` xác nhận chặn **8/8** payload độc hại (`localhost`, `127.0.0.1`, `169.254.169.254`, `::ffff:127.0.0.1`, `::ffff:7f00:1`, `file:///`, `javascript:`, `user:pass@`) + `undici` pinned-IP dispatcher chống DNS rebinding + kiểm tra lại SSRF trên mỗi hop redirect (≤ 3 hop).
- **Rate limit & Auth:** `requireAdminAuth` bắt buộc, `15 req/phút/admin`, giới hạn `3.5 MB/trang` và `12 MB/lần quét`, timeout `15s`, phát hiện Cloudflare/CAPTCHA.

---

## I. Danh sách Lỗi & Hạn chế phát hiện (`P0 / P1 / P2 / P3`)

| ID | Mức độ | Lỗi / Hạn chế | Vị trí Code | Expected vs Actual | Đề xuất sửa tối thiểu |
| :---: | :---: | :--- | :--- | :--- | :--- |
| **BUG-01** | **P1** | Giới hạn cứng `maxPages = 15` (FE) / `25` (API) & không hỗ trợ phân trang danh mục | `ExhibitionConfigurator.tsx:424`, `v28Routes.ts:521, 563-605` | Lấy được 60–100 SP từ danh mục → Thực tế cắt ở **14 SP (FE) / 24 SP (API)** | Hỗ trợ theo dõi link phân trang (`?page=`, `/page/`, `rel="next"`) và nâng trần crawl có kiểm soát (hoặc cho phép nhập batch nhiều URL danh mục) |
| **BUG-02** | **P1** | Ảnh từ website ngoài thường bị mất trong 3D WebGL do CORS (`crossOrigin = 'anonymous'`) | `FE/src/scene/sceneTextures.ts:2113` | Ảnh nhập từ URL phải hiện trên thẻ 3D → Thực tế rơi về nền trống nếu host ngoài không trả CORS | Bổ sung 1 endpoint image-proxy an toàn (cùng SSRF guard) trên BE hoặc tải ảnh hợp lệ về lưu cùng origin |
| **BUG-03** | **P1** | Lưu sản phẩm từ URL bằng vòng `for` FE không có transaction | `ExhibitionConfigurator.tsx:448-467` | Lỗi giữa chừng phải rollback → Thực tế lưu dở dang nửa chừng | Tạo endpoint batch `POST /api/v28/products/batch` chạy trong `v28Db.runInTransaction` |
| **BUG-04** | **P2** | Không trích xuất được ảnh/giá từ thẻ `<img>` (`src`/`data-src`/`srcset`) & HTML thường | `productAdapter.ts:580-666` | Lấy được ảnh sản phẩm từ HTML phổ thông → Thực tế trả `images: []` nếu thiếu JSON-LD/OG | Bổ sung fallback đọc `<img>` chính trong vùng sản phẩm (lọc bỏ logo/icon) |
| **BUG-05** | **P2** | `listProducts` cắt cứng `limit <= 100` trong khi FE gọi `limit: 200` | `BE/src/database/v28Database.ts:1210`, `ExhibitionConfigurator.tsx:499` | Đọc đủ 120 SP → Thực tế chỉ trả 100 SP | Đồng bộ phân trang nhiều page ở FE hoặc nâng trần `limit` hợp lý |
| **BUG-06** | **P2** | Không hỗ trợ trang render bằng JS (SPA/CSR) & không chuẩn hóa query/canonical khi dedup URL | `productAdapter.ts:289`, `v28Routes.ts:808` | Chống trùng `?utm_source=` & đọc được SPA → Thực tế tạo bản ghi trùng nếu khác query; SPA trả 0 SP | Strip tracking params (`utm_*`, `fbclid`) khi dedup; cảnh báo rõ khi phát hiện trang SPA |
| **BUG-07** | **P3** | Chưa kiểm tra `Disallow:` trong `robots.txt` và chưa có retry/backoff cho 429/5xx | `v28Routes.ts:615-631`, `productAdapter.ts:289` | Tôn trọng `robots.txt` & retry nhẹ 1 lần khi mạng chập chờn | Parse `Disallow:` cho User-Agent và thêm 1 lần retry backoff nhẹ |

---

## J. Thứ tự khắc phục đề xuất (Chưa triển khai — Chờ duyệt)

1. **Ưu tiên 1 (Bắt buộc nếu dùng URL Import cho 60 SP):** Xử lý **BUG-02** (Image Proxy / tải ảnh về origin chống lỗi CORS WebGL 3D) + **BUG-01** (nâng cơ chế phân trang/batch URL để lấy đủ 60 SP).
2. **Ưu tiên 2 (Toàn vẹn dữ liệu):** Xử lý **BUG-03** (Batch create trong 1 SQLite transaction) + **BUG-05** (fix cắt `limit: 100`) + **BUG-06** (strip query tracking khi dedup).
3. **Ưu tiên 3 (Mở rộng độ phủ):** Xử lý **BUG-04** (`<img>` fallback) + **BUG-07** (`robots.txt` `Disallow:` & retry).

---

## K. Final Verdict (Trả lời thẳng 7 câu hỏi chốt)

1. **Dán link trang chủ có lấy được toàn bộ sản phẩm không?**  
   **KHÔNG.** Chỉ lấy tối đa **14 SP** từ giao diện Admin (`maxPages=15`) hoặc **24 SP** qua API (`maxPages=25`) nếu mỗi SP là 1 trang riêng, và không theo phân trang.
2. **Dán link danh mục có lấy được toàn bộ sản phẩm không?**  
   **KHÔNG.** Chỉ quét trang 1, không theo `?page=2`/`/page/2`/Load More/Infinite Scroll và vẫn bị trần **14 SP (FE) / 24 SP (API)**.
3. **Dán link chi tiết lấy được những gì?**  
   Nếu trang có **JSON-LD**: lấy đầy đủ `name`, `sku`, `price`, `currency`, `description`, `images` (chuyển sang absolute URL), `inStock`, `sourceUrl`. Nếu chỉ có **Open Graph**: lấy được `name`, `description`, `images`, `price` (nếu có tag giá), **thiếu `sku`**. Nếu chỉ có HTML/JS thuần: **không lấy được** ảnh và giá.
4. **Một website có 100 sản phẩm thì hệ thống thực tế lấy được bao nhiêu?**  
   Với website TMĐT thông thường (mỗi SP 1 trang chi tiết): thực tế lấy tối đa **14 sản phẩm** từ UI Admin (`24` nếu gọi API trực tiếp). Chỉ lấy được 100 nếu cả 100 JSON-LD `Product` nằm sẵn trong 1 trang HTML duy nhất.
5. **Có đủ khả năng nhập 60 sản phẩm để lấp đầy 10 gian không?**  
   **KHÔNG đủ trong 1 lần dán URL** (bị chặn ở 14 SP/lần). Chỉ khả thi nếu nhập tách nhiều URL danh mục/sản phẩm lẻ nhiều lần **và** xử lý CORS ảnh để hiển thị trong WebGL 3D.
6. **Có cần Admin gán slot thủ công không?**  
   - Nếu nhập qua **Kho SP (`POST /imports/url`)**: **CÓ**, Admin phải gán thủ công vào `slot_01..slot_06`.  
   - Nếu nhập qua **Quy hoạch triển lãm (`ExhibitionConfigurator`)**: hệ thống có `auto-allocate` tự gán slot, nhưng chỉ áp dụng khi tạo **Draft mới cho 1 doanh nghiệp duy nhất** (không gán trộn 10 doanh nghiệp nông sản vào triển lãm đang chạy).
7. **Những lỗi nào bắt buộc sửa trước khi deploy nếu dùng luồng URL Import này?**  
   **BUG-02** (CORS ảnh trong 3D WebGL), **BUG-01** (trần `maxPages=15` & thiếu phân trang), và **BUG-03** (lưu batch không có transaction/rollback).
