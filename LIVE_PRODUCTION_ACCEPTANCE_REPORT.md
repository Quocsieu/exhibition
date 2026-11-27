# GRAND EXPO V28 — LIVE PRODUCTION ACCEPTANCE & PERFORMANCE AUDIT REPORT

- **Ngày kiểm thử:** 2026-11-27
- **Frontend Production:** `https://3dtrienlamso.mbws.vn/` (Plesk)
- **Admin Production:** `https://3dtrienlamso.mbws.vn/#/admin`
- **Backend Production:** `https://exhibition-xl20.onrender.com` (Render, commit `3f160ed`)
- **Database:** Neon PostgreSQL
- **Trình duyệt kiểm thử:** Chrome thật `Chrome/158.0.8127.37` qua Remote Debugging (`[::1]:9222`), GPU phần cứng `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1) Direct3D11 vs_5_0 ps_5_0, D3D11)`, WebGL2.

---

## A. Production Version

- **HTML Status:** `200`
- **Build Hashes trên Plesk (khớp 100% `FE/dist/assets` bản tối ưu mới):**
  - `assets/index-lN6oxSxe.js`
  - `assets/react-vendor-BHnz5bX7.js`
  - `assets/three-core-61DViCM7.js`
  - `assets/r3f-drei-Dzy5AIo1.js`
  - `assets/index-DkRNiRvz.css`
- **Draco Decoder tự host:** `/draco/draco_decoder.wasm` (`200`, `192,420 bytes`)
- **Model `tree-gian.glb`:** `200`, `313,924 bytes` (**-88.6%** so với `2,759,804 bytes` trước đây)
- **Pregen v2:** `/tts/pregen_v2/manifest.json` (`200`, `configVersion: "v2-soft-fast"`, `85` clip)
- **Bảo mật bundle:** `0` `__V28_DEV_QA__`, `0` secrets (`GEMINI_API_KEY`, `AIzaSy`, `CMS_ADMIN_PASS`).
- **Kết luận:** Production Plesk **đã nhận bản tối ưu mới đầy đủ**.

---

## B. Functional Acceptance

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Website tải thành công & qua Mắt Bão Shield | **PASS** | Xác minh thủ công trên Chrome thật, không bypass WAF |
| Scene 3D đầy đủ (cổng, cây Draco, đường, sảnh, 31 gian hàng) | **PASS** | `tree-gian.glb` hiển thị đầy đủ hai bên cổng |
| Avatar, WASD, Xoay camera, Focus gian hàng | **PASS** | Mượt 53.8–60.0 FPS trên Intel Iris Xe |
| Bản đồ 2D & Di chuyển giữa 4 khu (A, B, C, D) | **PASS** | Kiểm thử 5 gian hàng (`1`, `9`, `16`, `23`, `29`), cập nhật visited `✓` |
| Hình ảnh sản phẩm & Product Modal | **PASS** | Tải WebP từ Render `naturalWidth > 0` |
| Multiplayer Socket.IO | **PASS** | Hiển thị `2 online` trực tiếp trên HUD |
| Trang đăng nhập Admin (`/#/admin`) | **PASS** | Tải giao diện đăng nhập bình thường (chỉ đọc, không ghi dữ liệu) |
| Điện thoại vật lý thật (Physical Mobile Hardware) | **NOT TESTED** | Mới kiểm thử Mobile Emulation `390×844` và `360×800` |

---

## C. Performance Benchmark (So sánh trên Production)

| Metric | Production trước đây | Production hiện tại | Target | Status |
| --- | --- | --- | --- | --- |
| TTFB Frontend (Plesk) | `47.2 ms` | `57 ms` | `< 200 ms` | **PASS** |
| FCP | `308 ms` | `1144 ms` *(cold CDP load)* | `< 1800 ms` | **PASS** |
| `tree-gian.glb` Transfer Size | `2,759,804 bytes` | `313,924 bytes` (**-88.6%**) | `<= 500 KB` | **PASS** |
| Exhibition API P50 / P95 | `356 ms` / `595 ms` | `331.4 ms` / `374.6 ms` | `< 600 ms` | **PASS** |
| Product Image API P95 | `790 ms` | `808.3 ms` | `< 1000 ms` | **PASS** |
| Desktop GPU Idle FPS | `9.9–11.2 FPS` *(Basic Render Driver)* | **`60.0 FPS`** (`p50: 16.7 ms`, `Intel Iris Xe`) | `>= 50 FPS` | **PASS** |
| RAM Audio HIT | `23 ms` | **`11 ms`** | `<= 100 ms` | **PASS** |

---

## D. Audio Benchmark (5 gian hàng × 2 sản phẩm)

- **Booth 1:** Product 0 `2693 ms`, **RAM HIT `11 ms`**; Product 1 `679 ms`
- **Booth 9:** Product 1 `2030 ms`
- **Booth 16:** Product 1 `1285 ms`
- **Booth 23:** Product 1 `580 ms`
- **Booth 29:** Product 0 `1413 ms`
- **F5 Reload -> Booth 1 -> Product 0:** **`1199 ms`**
- **Voice consistency & Safety:** Giữ nguyên `female_soft_fast`, `ONE BOOTH — ONE VOICE`, tắt speculative `booth_focus` trên WASM 1 thread theo Task 1.
- **Lưu ý trung thực:** Các sản phẩm nằm ngoài `pregen_v2` khi MISS hoàn toàn trên WASM 1 thread mất `~3.9–7.3s` để tổng hợp câu đầu (không đạt 2s do giới hạn phần cứng 1 thread không có COOP/COEP).

---

## E. Graphics & Viewport Benchmark (`Intel(R) Iris(R) Xe Graphics`)

- **Phase 4 Scenarios (`1440×900`):**
  - Đứng yên (Idle): `avgFps: 60.0`, `1% low: 54.9`, `p50: 16.7 ms`, `p95: 17.1 ms`, `longTasks: 0`, `heap: 25.62 MB`
  - WASD: `avgFps: 57.7`, `1% low: 27.1`, `p50: 16.7 ms`, `p95: 17.5 ms`, `longTasks: 0`, `heap: 26.08 MB`
  - Xoay camera: `avgFps: 53.8`, `1% low: 15.0`, `p50: 16.7 ms`, `p95: 17.5 ms`, `longTasks: 1`, `heap: 27.29 MB`
  - Di chuyển khi đang phát audio: `avgFps: 60.3`, `1% low: 54.9`, `p50: 16.7 ms`, `p95: 17.0 ms`
- **Phase 6 Viewports:**
  - `1920×1080`: `overflowX: false`, `hasCanvas: true`, `avgFps: 60.0`, `heap: 36.85 MB`
  - `1366×768`: `overflowX: false`, `hasCanvas: true`, `avgFps: 60.2`, `heap: 35.05 MB`
  - `390×844` (Mobile Emulation): `overflowX: false`, `hasCanvas: true`, `avgFps: 60.2`, `heap: 59.17 MB` (**Mobile Physical Hardware: NOT TESTED**)
  - `360×800` (Mobile Emulation): `overflowX: false`, `hasCanvas: true`, `avgFps: 60.2`, `heap: 38.57 MB` (**Mobile Physical Hardware: NOT TESTED**)
- **Phase 7 — Production Stability Test (15.02 phút liên tục):**
  - `pageErrors: []`, `unhandledRejections: 0`, `webglOk: true` suốt 15 phút.
  - `domNodes: 101` ổn định từ phút 1 đến phút 15.
  - `avgFps`: `60.0 – 60.7 FPS` (không tụt FPS).
  - `heapMB`: `47.35 MB` → đỉnh `65.84 MB` → idle `35.31–42.19 MB` → kết thúc `41.58 MB` (không rò rỉ bộ nhớ).

---

## F. Network Benchmark (10 mẫu tuần tự mỗi endpoint)

| Endpoint | Status | Gzip / Cache | CORS | Min | Avg | P50 | P95 | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/health` | `200` | `gzip` | `https://3dtrienlamso.mbws.vn` | `296.1 ms` | `337.9 ms` | `309.8 ms` | `341.0 ms` | `544.4 ms` |
| `/api/v28/exhibitions/active` | `200` / `304` | `gzip`, `ETag` (`304` verified) | `https://3dtrienlamso.mbws.vn` | `298.9 ms` | `428.1 ms` | `331.4 ms` | `374.6 ms` | `1295.7 ms` |
| `/api/v28/product-images/8b4a7058de91abdf.webp` | `200` | `immutable` (1 năm) | `*` | `355.9 ms` | `577.5 ms` | `507.3 ms` | `808.3 ms` | `1278.0 ms` |

- `0` lỗi `422`, `0` lỗi `429`, `0` lỗi `500`, `0` CORS error, `0` Mixed Content.

---

## G. Issue Classification

- **P0 (Critical):** Không có (`0`).
- **P1 (Major Functional):** Không có (`0`).
- **P2 (Performance / UX):**
  1. **Warm MISS Piper WASM 1 thread (`~3.9–7.3s`):** Khi người dùng click sản phẩm chưa có trong `pregen_v2` hoặc `IndexedDB`/`RAM`, câu đầu tiên mất 3.9–7.3s để tổng hợp. *Nguyên nhân:* Hosting tĩnh Plesk không có COOP/COEP nên ONNX WASM chạy `numThreads = 1`. *Khuyến nghị:* Tăng độ phủ `pregen_v2` cho câu mở đầu của 144 sản phẩm Production ở phase sau.
  2. **Mobile Physical Hardware (`NOT TESTED`):** Chưa đo được trên điện thoại vật lý thật.
- **P3 (Minor):**
  1. **Console `503` khi probe Supertonic trên Render:** `consoleErrorsCount: 2` (`503`) do Render 512MB tự tắt Supertonic và fallback về `browser-piper` (hệ thống vẫn chạy đúng, chỉ tạo log 503 ở console).

---

## H. Final Decision: **GO** *(Desktop & Emulated Mobile Production Verified; Mobile Physical Hardware NOT TESTED)*

Website Production `https://3dtrienlamso.mbws.vn/` đã chạy đúng bản tối ưu mới, ổn định **60 FPS** trên GPU `Intel Iris Xe` suốt **15 phút liên tục**, không rò rỉ bộ nhớ, không có lỗi P0/P1, cây `tree-gian.glb` giảm **88.6%** và hiển thị đầy đủ qua Draco tự host, RAM HIT đạt **11 ms** và F5 hoạt động ổn định.

