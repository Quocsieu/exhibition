# VERCEL CONFIG REMOVAL AUDIT — V7

**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Kiến trúc:** npm Workspaces Monorepo (`FE` + `BE`)  
**Chế độ thực thi:** READ-ONLY AUDIT → ISOLATED VERIFICATION → CONDITIONAL SAFE REMOVAL → REGRESSION QA  
**Mức độ an toàn:** CRITICAL — ZERO FUNCTIONAL REGRESSION

---

## I. TÓM TẮT KẾT LUẬN & TRẢ LỜI 15 CÂU HỎI TRỌNG TÂM

### 1.1. Bảng quyết định đối với từng file `vercel.json`

| File | Trạng thái trước V7 | Vai trò khi `Root Directory = ./` | Quyết định cuối cùng | Lý do kỹ thuật |
|---|---|---|---|---|
| [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) (`565 B`) | `ACTIVE` | Cấu hình duy nhất được Vercel đọc trên Production | **GIỮ LẠI (`KEEP`)** | Chứa 3 quy tắc `rewrites` bắt buộc (đặc biệt là SPA fallback `/((?!api/\|socket\.io/).*) -> /index.html` cho các route `/admin`, `/admin/booths/:id/slots` và proxy dự phòng `/api/:path*`). Vercel Dashboard UI **không** hỗ trợ cấu hình `rewrites` không cần code. |
| `FE/vercel.json` (`454 B`) | `REDUNDANT` | Bị Vercel bỏ qua hoàn toàn vì `Root Directory = ./` | **ĐÃ XÓA AN TOÀN (`REMOVED`)** | Không được Vercel đọc, không có script/test/workflow nào tham chiếu, và thiếu rule `/socket.io/:path*` so với file gốc. Đã sao lưu SHA-256 trước khi xóa. |

### 1.2. Trả lời trực tiếp 15 câu hỏi bắt buộc (Mục XII)

1. **Có thể xóa root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) không?**  
   → **Không** (trong phạm vi không sửa source code). Nếu xóa root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json), mọi truy cập trực tiếp hoặc nhấn F5 (reload) tại pathname deep links `/admin`, `/admin/booths`, `/admin/booths/:boothId/slots` trên Vercel sẽ trả về lỗi **HTTP `404: NOT_FOUND`** do `FE/dist` chỉ có duy nhất `index.html` ở gốc, đồng thời làm mất cơ chế fallback same-origin `/api/:path*` trong [api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts#L96-L98).
2. **Có thể xóa `FE/vercel.json` không?**  
   → **Có — Đã xóa an toàn.** Vì Vercel Dashboard đang đặt `Root Directory = ./`, Vercel chỉ đọc `./vercel.json` và hoàn toàn bỏ qua `FE/vercel.json`.
3. **Có thể xóa cả hai không?**  
   → **Không** nếu giữ nguyên ràng buộc không sửa source code/routing. Chỉ xóa được `FE/vercel.json` và giữ lại root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json).
4. **Nếu xóa cả hai, API có hoạt động không?**  
   → Luồng chính vẫn hoạt động vì [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L1-L26) gọi trực tiếp `https://exhibition-xl20.onrender.com/api/...` qua CORS với `Authorization: Bearer <token>`. Tuy nhiên, **luồng dự phòng (fallback)** tại [api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts#L96-L98) (`fetch('/api/...')` khi mạng/CORS gặp sự cố) sẽ **bị hỏng (HTTP 404)** vì mất rule rewrite `/api/:path*`.
5. **Nếu xóa cả hai, Socket.IO có hoạt động không?**  
   → **Có.** Trên môi trường Production (`import.meta.env.PROD`), `SOCKET_BASE_URL` trong [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L28-L35) trả về trực tiếp `https://exhibition-xl20.onrender.com`, nên [useRealtime.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/hooks/useRealtime.ts#L81-L86) kết nối thẳng tới Render Backend mà không đi qua Vercel rewrite.
6. **Nếu xóa cả hai, SPA deep links có hoạt động không?**  
   → Hash links (`/#admin`, `/#/admin/booths`) vẫn hoạt động, nhưng **pathname deep links (`/admin`, `/admin/booths`, `/admin/booths/:boothId/slots`) sẽ bị lỗi HTTP 404 trên Vercel** khi mở trực tiếp bằng URL hoặc nhấn F5 reload.
7. **Có cần sửa code không?**  
   → Với phương án **B (Giữ root `vercel.json`, xóa `FE/vercel.json`)**: **Hoàn toàn không cần sửa code.**
8. **Có cần chỉnh Vercel Dashboard không?**  
   → **Không.** Toàn bộ cấu hình hiện tại trên Vercel Dashboard (`Root Directory = ./`, `Build Command = npm run build --workspace=FE`, `Output Directory = FE/dist`, `Install Command = npm ci --include=dev`) đã khớp 100% với root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json).
9. **Có cần cài lại Vercel Project không?**  
   → **Không.**
10. **Có cần redeploy không?**  
    → **Không bắt buộc phải redeploy ngay lập tức.** Thay đổi xóa `FE/vercel.json` hoàn toàn không làm thay đổi hành vi runtime trên Vercel và sẽ tự động được áp dụng trong lần push/deploy tiếp theo.
11. **Có ảnh hưởng Render Backend không?**  
    → **Không.** Render Backend (`https://exhibition-xl20.onrender.com`) hoạt động độc lập.
12. **Những gì đã kiểm thử thực tế?**  
    → Đã kiểm thử cô lập 3 kịch bản định tuyến (Scenario A, B, C), chạy `npm run typecheck`, `npm run build --workspace=FE`, `npm run build`, `npm test` (31/31 tests pass), khởi chạy thật Backend + Frontend (`vite preview` / dev server) và kiểm tra bằng headless Chromium: `/api/health` (`200 OK`), 19/19 file GLB (`200 OK`), Product Modal, Admin Dashboard (`/#admin` và pathname `/admin` kèm reload F5).
13. **Những gì chưa thể xác minh?**  
    → Chưa thực hiện `git push` hoặc触发 bản deploy thật trên hạ tầng Vercel Cloud (`NOT VERIFIED` trên Vercel Cloud trực tiếp do tuân thủ khóa an toàn không commit/push/deploy).
14. **Những file nào đã bị xóa thật?**  
    → Duy nhất **01 file**: `FE/vercel.json` (`454 B`, đã sao lưu nguyên vẹn kèm mã băm SHA-256 trước khi xóa).
15. **Có phát sinh thay đổi ngoài phạm vi không?**  
    → **Không (`0` file ngoài phạm vi).** Không có bất kỳ file source code, asset 3D, biến môi trường hay cấu hình nào khác bị chỉnh sửa.

---

## II. PHASE 1 — KIỂM TRA VAI TRÒ THỰC TẾ CỦA HAI FILE `vercel.json`

### 2.1. So sánh chi tiết nội dung 2 file

| Tiêu chí | [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) (Root — `565 B`) | `FE/vercel.json` (Subfolder — `454 B`, đã xóa) |
|---|---|---|
| `buildCommand` | `npm run build --workspace=FE` | *(Không khai báo)* |
| `outputDirectory` | `FE/dist` | *(Không khai báo)* |
| `framework` | `vite` | *(Không khai báo)* |
| Rewrite 1 (REST API) | `/api/:path*` → `https://exhibition-xl20.onrender.com/api/:path*` | `/api/:path*` → `https://exhibition-xl20.onrender.com/api/:path*` |
| Rewrite 2 (Socket.IO) | `/socket.io/:path*` → `https://exhibition-xl20.onrender.com/socket.io/:path*` | *(Thiếu rule này)* |
| Rewrite 3 (SPA Fallback) | `/((?!api/\|socket\.io/).*)` → `/index.html` | `/((?!api/).*)` → `/index.html` |

### 2.2. Đối chiếu với Vercel Dashboard Settings đã xác nhận

Với thiết lập trên Vercel Dashboard:
- **Framework Preset:** `Vite`
- **Root Directory:** `./`
- **Build Command:** `npm run build --workspace=FE`
- **Output Directory:** `FE/dist`
- **Install Command:** `npm ci --include=dev`
- **Include files outside root:** `Enabled`

**Kết luận Phase 1:**
- Khi `Root Directory = ./`, trình biên dịch và CDN của Vercel **chỉ đọc duy nhất file `./vercel.json` tại thư mục gốc của repository** (`ACTIVE`).
- File `FE/vercel.json` nằm trong thư mục con `FE/` **bị Vercel bỏ qua 100%** (`REDUNDANT`) và cũng không được bất kỳ script hay công cụ build nào trong repo tham chiếu.

---

## III. PHASE 2 — KIỂM TRA PHỤ THUỘC CỦA API & SOCKET.IO

### 3.1. REST API ([FE/src/config/apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts) & [FE/src/services/api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts))

- **Cơ chế gọi API:** Sử dụng native `fetch()` trong [api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts#L53-L108).
- **URL đích trên Production:**
  - Trong [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L1-L26), hằng số `DEFAULT_PRODUCTION_BACKEND_URL = 'https://exhibition-xl20.onrender.com'` được sử dụng khi chạy bản build production (`import.meta.env.PROD`).
  - *(Lưu ý kỹ thuật: Dù [FE/.env.production](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/.env.production) có khai báo `VITE_API_BASE_URL=https://exhibition-xl20.onrender.com`, file [FE/vite.config.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vite.config.ts#L17) đặt `envDir: '..'` nên Vite đọc `.env` ở thư mục gốc. Nhờ `DEFAULT_PRODUCTION_BACKEND_URL` trong [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L20-L22), bundle thực tế trong `FE/dist/assets/index-*.js` vẫn luôn được gắn cứng URL `https://exhibition-xl20.onrender.com`).*
- **Luồng gọi chính (Primary Cross-Origin):**
  - `request()` tại [api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts#L92) gọi trực tiếp `https://exhibition-xl20.onrender.com/api/...`.
  - Xác thực bằng header `Authorization: Bearer <token>` lấy từ `localStorage` (`AUTH_TOKEN_STORAGE_KEY`), không dùng cookie cross-domain.
  - Backend CORS tại [BE/src/server.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/server.ts#L33-L45) đã mở sẵn regex `/^https:\/\/[a-z0-9-]+\.vercel\.app$/i` và cấu hình `CORS_ORIGIN`.
- **Luồng dự phòng (Fallback Same-Origin):**
  - Tại [api.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/services/api.ts#L94-L98), nếu lệnh gọi trực tiếp tới Render ném lỗi mạng tạm thời và `primaryUrl !== fallbackUrl`, Frontend tự động thử lại bằng đường dẫn tương đối `fetch('/api/...')`.
  - Đường dẫn dự phòng `/api/...` này **phụ thuộc trực tiếp vào Rewrite Rule 1 (`/api/:path* -> https://exhibition-xl20.onrender.com/api/:path*`) trong root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json#L6-L9)**. Nếu xóa root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json), cơ chế tự phục hồi này sẽ trả về 404.

### 3.2. Socket.IO Realtime ([FE/src/hooks/useRealtime.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/hooks/useRealtime.ts))

- Trên Production (`import.meta.env.PROD`), `SOCKET_BASE_URL` trong [apiConfig.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/config/apiConfig.ts#L28-L35) trả về `https://exhibition-xl20.onrender.com`.
- [useRealtime.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/hooks/useRealtime.ts#L81-L86) khởi tạo `io('https://exhibition-xl20.onrender.com', { transports: ['websocket', 'polling'], ... })` kết nối **trực tiếp** tới Render Backend, hoàn toàn không phụ thuộc vào `vercel.json` (vì Vercel static rewrite không hỗ trợ giữ kết nối WebSocket hai chiều lâu dài).
- Trên Local Development (`import.meta.env.DEV`), `SOCKET_BASE_URL` là `undefined`, nên Socket.IO đi qua Vite proxy `/socket.io` trong [FE/vite.config.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/vite.config.ts#L31-L35).

---

## IV. PHASE 3 — KIỂM TRA SPA ROUTING ([FE/src/App.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/App.tsx))

Mặc dù dự án không cài đặt thư viện `react-router-dom`, [FE/src/App.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/App.tsx#L11-L97) cài đặt bộ định tuyến kép (`parseCurrentLocation` kết hợp `window.history.pushState`, `popstate` và `hashchange`) hỗ trợ song song hai chế độ URL:

1. **Hash Routing:** `/#admin`, `/#dashboard`, `/#/admin/booths`, `/#/admin/booths/:boothId/slots`
2. **Pathname Routing (HTML5 History API):**
   - `/admin` (xem [App.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/App.tsx#L32-L42))
   - `/admin/booths`
   - `/admin/booths/:boothId`
   - `/admin/booths/:boothId/slots`
   - Khi người dùng đang ở pathname route (ví dụ `/admin`), hàm `navigateAdminPath` tại [App.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/App.tsx#L67-L78) tiếp tục điều hướng bằng `window.history.pushState(null, '', normalized)` (giữ nguyên dạng pathname `/admin/booths/...` trên thanh địa chỉ).

**Hệ quả trên Vercel Static Hosting:**
- Thư mục build `FE/dist` chỉ sinh ra duy nhất `FE/dist/index.html` (không có `FE/dist/admin/index.html`).
- Khi người dùng truy cập trực tiếp `https://<domain>.vercel.app/admin` hoặc đang ở `/admin/booths` và nhấn **F5 (Reload)**:
  - **Có root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json):** Rewrite Rule 3 (`/((?!api/|socket\.io/).*) -> /index.html`) trả về `FE/dist/index.html` với HTTP `200 OK`, sau đó `parseCurrentLocation()` mở đúng trang Admin.
  - **Nếu xóa root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json):** Vercel CDN tìm file tĩnh `/admin` trong `FE/dist`, không thấy và trả về ngay **HTTP `404: NOT_FOUND`**.

---

## V. PHASE 4 — ĐÁNH GIÁ KHẢ NĂNG THAY THẾ BẰNG VERCEL DASHBOARD

### 5.1. Bảng khả năng thay thế từng thành phần của `vercel.json` bằng Vercel Dashboard UI

| Thành phần trong [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) | Giá trị hiện tại | Thay thế được bằng Vercel Dashboard UI? | Giải thích kỹ thuật |
|---|---|---|---|
| **Root Directory** | `./` | **CÓ** | Đã cấu hình sẵn trong *Project Settings → General → Root Directory*. |
| **Framework Preset** | `vite` | **CÓ** | Đã cấu hình sẵn trong *Project Settings → Build & Development Settings*. |
| **Build Command** | `npm run build --workspace=FE` | **CÓ** | Đã cấu hình sẵn trong *Build & Development Settings*. |
| **Output Directory** | `FE/dist` | **CÓ** | Đã cấu hình sẵn trong *Build & Development Settings*. |
| **API Rewrite** | `/api/:path*` → Render | **KHÔNG** | Vercel Dashboard UI không có mục cấu hình `rewrites` / reverse proxy. Bắt buộc phải khai báo qua `vercel.json` (hoặc `middleware`). |
| **Socket.IO Rewrite** | `/socket.io/:path*` → Render | **KHÔNG** | Vercel Dashboard UI không hỗ trợ cấu hình `rewrites` (tất nhiên chỉ áp dụng cho HTTP polling fallback). |
| **SPA Fallback** | `/((?!api/\|socket\.io/).*)` → `/index.html` | **KHÔNG** | Vercel Dashboard UI không có nút bật/tắt SPA catch-all rewrite tùy chỉnh có loại trừ `/api/` và `/socket.io/`. Mặc định preset Vite trên Vercel không tự động rewrite mọi deep link nếu thiếu `vercel.json`. |

### 5.2. So sánh 3 phương án (Options A, B, C)

| Phương án | Mô tả | Ưu điểm | Rủi ro / Nhược điểm | Đánh giá |
|---|---|---|---|---|
| **Phương án A** | Xóa cả 2 file `vercel.json` và không sửa code | Không còn file `vercel.json` nào trong repo | **LỖI REGRESSION:** Truy cập trực tiếp hoặc F5 tại `/admin`, `/admin/booths/:id/slots` bị lỗi **HTTP 404** trên Vercel; mất cơ chế fallback `/api/:path*`. | **KHÔNG AN TOÀN (LOẠI)** |
| **Phương án B** | **Giữ root [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json), xóa `FE/vercel.json`** | Loại bỏ 100% cấu hình dư thừa (`FE/vercel.json`); bảo toàn tuyệt đối SPA deep links (`/admin`), API fallback (`/api/*`), 3D Scene; **không cần sửa code, không cần chỉnh Vercel Dashboard**. | Còn 1 file cấu hình chuẩn `vercel.json` (`565 B`) ở root — đúng chuẩn mực của dự án Vercel. | **TỐI ƯU & AN TOÀN TUYỆT ĐỐI (CHỌN)** |
| **Phương án C** | Xóa cả 2 file `vercel.json` và phải sửa code (`App.tsx`, `api.ts`) để bỏ pathname routing + bỏ API fallback | Xóa được cả 2 file `vercel.json` | Vi phạm quy tắc khóa an toàn (phải sửa logic routing trong `FE/src/App.tsx` và `FE/src/services/api.ts`), làm mất tính năng URL sạch `/admin`. | **VI PHẠM RÀNG BUỘC KHÔNG SỬA RUNTIME (LOẠI)** |

---

## VI. PHASE 5 — KẾT QUẢ KIỂM THỬ CÔ LẬP 3 KỊCH BẢN (SCENARIOS A, B, C)

Đã thực thi kiểm thử định tuyến cô lập với `Root Directory = ./` và đối chiếu kết quả trên 8 luồng kiểm tra bắt buộc:

| STT | Luồng kiểm tra | Scenario A (Giữ cả 2 file) | Scenario B (Giữ root `vercel.json`, xóa `FE/vercel.json`) | Scenario C (Xóa cả 2 file `vercel.json`) |
|---|---|---|---|---|
| 1 | Trang chủ `/` (`FE/dist/index.html`) | **PASS** (`200 OK`) | **PASS** (`200 OK`) | **PASS** (`200 OK`) |
| 2 | Scene 3D & 19 file GLB tĩnh (`/models/...`) | **PASS** (`200 OK`, 19/19 GLBs) | **PASS** (`200 OK`, 19/19 GLBs) | **PASS** (`200 OK`, 19/19 GLBs) |
| 3 | Click booth mở Product Modal | **PASS** | **PASS** | **PASS** |
| 4 | Mở Admin Dashboard qua hash `/#admin` | **PASS** (`200 OK`) | **PASS** (`200 OK`) | **PASS** (`200 OK`) |
| 5 | Mở trực tiếp hoặc **Refresh (F5)** tại pathname `/admin`, `/admin/booths/:id/slots` | **PASS** (`200 OK` nhờ SPA rewrite) | **PASS** (`200 OK` nhờ SPA rewrite) | **FAIL (`404 NOT_FOUND`)** — Không có file `FE/dist/admin/index.html` và mất SPA rewrite |
| 6 | Kết nối API tới Render (`https://exhibition-xl20.onrender.com/api/*`) | **PASS** (Direct + `/api/*` fallback) | **PASS** (Direct + `/api/*` fallback) | **PARTIAL / RISK** (Direct hoạt động, nhưng `/api/*` same-origin fallback tại `api.ts:97` bị **404**) |
| 7 | Kết nối Socket.IO realtime (`SOCKET_BASE_URL`) | **PASS** (Direct tới Render) | **PASS** (Direct tới Render) | **PASS** (Direct tới Render) |
| 8 | Đồng bộ cấu hình (không trùng lặp file dư thừa) | **WARN** (Tồn tại `FE/vercel.json` dư thừa) | **PASS** (Sạch, duy nhất 1 nguồn cấu hình) | **FAIL** (Mất cấu hình `rewrites`) |

---

## VII. PHASE 6 & MỤC XI — THỰC THI XÓA AN TOÀN & KIỂM THỬ HỒI QUY (REGRESSION QA)

### 7.1. Sao lưu & Xóa có điều kiện (Case 2 — Phương án B)

1. **Sao lưu nguyên trạng trước khi xóa:**
   - File đã sao lưu: `FE/vercel.json` (`454 B`)
   - SHA-256: `a48bf5fb46652490e106a14ab3a2417d8a326f3cd182db4ef85f0e066323fc91`
   - Đường dẫn bản sao lưu ngoài repo: `C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\exhibition-archive-v7\files\FE\vercel.json` (kèm manifest `v7-archive-manifest.json`).
2. **Thực thi trong repository:**
   - Đã xóa `FE/vercel.json`.
   - Giữ nguyên tuyệt đối [vercel.json](file:///e:/Lập%20trình/MatBaoWS/exhibition/vercel.json) (`565 B`) tại thư mục gốc.

### 7.2. Kết quả kiểm thử kỹ thuật & Browser QA sau khi xóa `FE/vercel.json`

| Hạng mục kiểm tra | Lệnh / Phương pháp | Kết quả | Chi tiết xác minh |
|---|---|---|---|
| **Typecheck toàn monorepo** | `npm run typecheck` | **PASS** | `FE` (`tsc --noEmit`) & `BE` (`tsc --noEmit`) đạt `0` lỗi. |
| **Build Frontend (chuẩn Vercel)** | `npm run build --workspace=FE` | **PASS** | `vite build` đóng gói thành công `FE/dist/index.html` (`0.77 kB`) và bundle JS/CSS. |
| **Build toàn bộ workspaces** | `npm run build` | **PASS** | Cả `FE` và `BE` build thành công (`exit code 0`). |
| **Automated Tests** | `npm test` | **PASS** | `2/2` test files passed, **`31/31` tests passed** (Vitest). |
| **Backend Health Check** | `GET /api/health` | **PASS** | HTTP `200 OK` — `{"status":"ok","service":"virtual-expo-25d-be"}`. |
| **Scene 3D & 19 Active GLBs** | Headless Chromium QA | **PASS** | Tải thành công **19/19** model GLB (`0` failed assets, `0` console/page errors). |
| **6 V2 Booths & Product Modal** | Click vào Booth / Slot trên Canvas | **PASS** | Mở đúng Product Modal với đầy đủ thông tin gian hàng và danh sách sản phẩm. |
| **Admin Dashboard & SPA Reload** | Mở `/#admin` và `/admin` + `page.reload()` | **PASS** | Đăng nhập Admin, hiển thị đúng 6 Booths / 36 Product Slots, reload F5 tại `/admin` trả về `200 OK`. |
| **Kiểm tra Git Working Tree** | `git diff --check` & `git status --short` | **PASS** | Không có lỗi whitespace; chỉ có đúng `D FE/vercel.json` và báo cáo `VERCEL_CONFIG_REMOVAL_AUDIT_V7.md`. |

---

## VIII. KẾT LUẬN CUỐI CÙNG

**`B — KEEP ROOT, REMOVE FE COPY`**
