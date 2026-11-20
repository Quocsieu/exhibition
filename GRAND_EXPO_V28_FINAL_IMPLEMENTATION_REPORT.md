# BÁO CÁO TRIỂN KHAI & NGHIỆM THU CUỐI CÙNG — GRAND EXPO WORLD V28
**Ngày lập báo cáo:** 2026-11-20  
**Workspace Windows:** `E:\Lập trình\MatBaoWS\exhibition`  
**Nhánh phát triển:** `grand-expo-v28-dev` (tách từ `grand-expo-v27-5` @ `432cd25`)

---

## A. Tóm tắt Điều hành (Executive Summary)
- **Mục tiêu:** Xây dựng và hoàn thiện nền tảng triển lãm ảo cấu hình động **Grand Expo World V28** (từ Phase 1 đến Phase 7) gồm: quản trị doanh nghiệp & danh mục sản phẩm độc lập, import Excel/URL, sinh layout động không giới hạn cứng số gian, phân khu theo danh mục, đồ họa 3D tối ưu 3-Ring Spatial Streaming + Mái vòm tham số hóa, Spatial AOI Realtime tách tiến trình, NPC tư vấn + Audio cache theo content hash, và AI Chat / AI Voice có kiểm soát chi phí — trong khi bảo vệ tuyệt đối **Grand Expo World V27.5** (`/?world=v27`, `/`, `/admin`, `BE/data/expo.db`).
- **Kết quả thực tế:**
  - **7/7 test suites (66/66 automated tests) PASS**, `BE`/`FE` TypeScript typecheck & production build PASS.
  - **Admin V28 độc lập** tại `/admin/v28` đọc 100% từ `BE/data/expo_v28_dev.db`, đồng bộ trực tiếp sang `/?world=dynamic`.
  - **100 gian hàng V28** đạt **60 FPS** trên Desktop (`1440×900`) và **60 FPS** trên Chrome Mobile Portrait emulation (`390×844`) với Far LOD pavilion 6 thành phần kiến trúc (`337` draw calls, `0` lỗi console/network).
  - **Separate-Process Load Test (500 khách đồng thời):** Uniform 500 **p95 = 47ms**, Hotspot 500 (1 cell) **p95 = 73ms**, Teleport Storm 200 **p95 = 30ms**, Reconnect Storm 250 đạt **100% (250/250)**, server RSS **133.9 MB**, event-loop lag p95 **24.2 ms**.
  - **V27.5 Regression:** `BE/data/expo.db` SHA-256 nguyên vẹn từng byte (`8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76`), `/admin` giữ nguyên 6 gian, `/?world=v27` và `/` không thay đổi.
- **Trạng thái từng Phase:**
  - Phase 1 (Company, Catalog, Excel Import): **`IMPLEMENTED & VERIFIED`**
  - Phase 2 (Dynamic World, 20 Booths, Mobile Portrait Foundation): **`IMPLEMENTED & VERIFIED`**
  - Phase 3 (3-Ring Spatial Streaming, Parametric Dome Roof, 50 Booths): **`IMPLEMENTED & VERIFIED`** (Android vật lý: `NOT TESTED`)
  - Phase 4 & 4.1 (100 Booths, Spatial AOI, `/admin/v28`, Visual Refinement): **`IMPLEMENTED & VERIFIED`**
  - Phase 4.2 (Categories, `Khu + Tên danh mục`, Duplicate URL Guard): **`IMPLEMENTED & VERIFIED`**
  - Phase 4.3 (Separate-Process Load Test 100/300/500 + Hotspot/Teleport/Reconnect): **`IMPLEMENTED & VERIFIED`** (15-min soak: `NOT TESTED`)
  - Phase 5 (Booth NPC 3D + Pre-generated Cached Audio Pipeline + Storage Adapter): **`IMPLEMENTED & VERIFIED`** (Gemini TTS thật: `LIVE GEMINI NOT VERIFIED`)
  - Phase 6 (AI Chat & AI Voice Grounded + Quotas + Prompt Injection Guard): **`IMPLEMENTED & VERIFIED`** (trên Grounded Mock Provider; Gemini Live thật: `LIVE GEMINI NOT VERIFIED`)
- **Các Blocker / Hạng mục chưa chạy được do môi trường:**
  1. **`LIVE GEMINI NOT VERIFIED`:** Chưa cấu hình `GEMINI_API_KEY` và chưa được người dùng phê duyệt chi phí API trả phí; hệ thống đang chạy an toàn ở chế độ **Grounded Mock Provider** (0 chi phí) với các model ID chính thức đã kiểm chứng từ tài liệu Google Gemini (`gemini-3.8-flash`, `gemini-3.8-flash-lite-tts`, `gemini-3.1-flash-live-preview`).
  2. **`REAL DEVICE NOT TESTED`:** Chưa có thiết bị Android vật lý kết nối vào máy Windows để đo FPS thực tế (đã kiểm thử bằng Chrome Mobile Portrait emulation `390×844` và `360×800`).
  3. **`15-MIN SOAK NOT VERIFIED`:** Đã chạy Separate-Process Load Test 500 khách cho các kịch bản A/B/C/D, chưa chạy soak liên tục 15 phút trong phiên tương tác này.

---

## B. Kiến trúc Hệ thống (Architecture)
- **Frontend (`FE/src/`):**
  - World Isolation trong `FE/src/App.tsx`: `/` (mặc định `v26`), `/?world=v27` (V27.5), `/?world=dynamic` (`DynamicExhibitionPage.tsx`), `/admin` (Legacy 6 gian), `/admin/v28` (`AdminV28Page.tsx` độc lập).
  - Scene 3D V28 (`FE/src/scene/v28/`): `v28BoothAssets.ts` (shared GLTF cache + ref-counted texture cache 48 MB), `DynamicBooth3D.tsx`, `DynamicBoothNpc3D.tsx`, `FarBoothInstancedProxy.tsx` (6-part architectural pavilion), `ParametricExpoRoof.tsx`, `spatialStreaming.ts`, `DynamicExhibitionScene.tsx`.
  - HUD & AI UI (`FE/src/components/v28/`): `DynamicWorldHud.tsx` (Desktop + Mobile Portrait `100dvh`), `V28NpcConsultantPanel.tsx` (Pre-generated Audio + AI Chat + AI Voice).
- **Backend (`BE/src/`):**
  - Dual-DB isolation trong `BE/src/server.ts`: `/api/*` → `BE/data/expo.db` (V27.5), `/api/v28/*` → `BE/data/expo_v28_dev.db` (V28, WAL mode).
  - Services (`BE/src/services/v28/`): `layoutGenerator.ts`, `exhibitionService.ts`, `categoryService.ts`, `audioCacheService.ts`, `aiConsultantService.ts`, `v28ExcelImportService.ts`.
  - Realtime (`BE/src/realtime/v28/spatialAoiEngine.ts`): Dedicated Socket.IO namespace `/v28-dynamic`, Spatial Hash Grid `20m×20m`, Home Cell, 10 Hz deduplicated delta batching, in-memory `CollisionIndex` (0 SQLite read khi di chuyển), Hotspot nearest-K cap (`15` mobile / `30` desktop).
- **Audio Storage Adapter:** `LocalAudioStorageAdapter` lưu `.wav` tại `BE/data/v28_audio/` (tuyệt đối không lưu binary vào SQLite), kiến trúc adapter sẵn sàng mở rộng sang S3/R2.
- **Security:** API key chỉ ở Backend (`BE/.env`), không lộ lên FE; SSRF guard trên URL import; prompt-injection sanitizer; strict Company Ownership Guard; Admin JWT auth trên mọi API ghi/publish.

---

## C. Bảng Kiểm Tra Tính Năng (Feature Checklist)
| Phân hệ | Tính năng | Trạng thái |
| :--- | :--- | :--- |
| **Phase 1** | Company CRUD, Search, Filter, Deactivate/Reactivate | `IMPLEMENTED & VERIFIED` |
| **Phase 1** | Independent Product Catalog + Company Ownership Guard | `IMPLEMENTED & VERIFIED` |
| **Phase 1** | Excel Import (`.xlsx` ≤5MB, ≤1000 dòng, Preview, Commit, Rollback, CSV) | `IMPLEMENTED & VERIFIED` |
| **Phase 2** | Dynamic Layout Generator (6..200 gian, 0 overlap, BFS walkway, Focus clearance) | `IMPLEMENTED & VERIFIED` |
| **Phase 2** | 6 V27.4 GLB Archetypes tái sử dụng bằng shared cache (không sửa GLB gốc) | `IMPLEMENTED & VERIFIED` |
| **Phase 2** | Draft / Preview / Publish / Published Immutability / Rollback / Resize bảo toàn ID & Slot | `IMPLEMENTED & VERIFIED` |
| **Phase 2** | Mobile Portrait Foundation (`390×844`, `360×800`, Bottom Sheet, Joystick) | `IMPLEMENTED & VERIFIED` (emulation) |
| **Phase 3** | 3-Ring Spatial Streaming + Hysteresis + Staggered Mount Queue | `IMPLEMENTED & VERIFIED` |
| **Phase 3** | Parametric Architectural Dome Roof + Overview Cutaway + WebGL Context Recovery | `IMPLEMENTED & VERIFIED` |
| **Phase 4 / 4.1** | 100 Booths + `/admin/v28` độc lập + Dashboard KPI + Phân trang + Đồng bộ tức thời | `IMPLEMENTED & VERIFIED` |
| **Phase 4.1** | Far LOD 6-part Architectural Pavilion + Khung vòm mái + Cảnh quan đại lộ | `IMPLEMENTED & VERIFIED` |
| **Phase 4.2** | Categories (`categories`), công thức `Khu + Tên danh mục`, cảnh báo lệch/vượt ngưỡng | `IMPLEMENTED & VERIFIED` |
| **Phase 4.2** | URL Import SSRF-safe + Chống trùng URL theo doanh nghiệp | `IMPLEMENTED & VERIFIED` |
| **Phase 4.3** | Spatial AOI `/v28-dynamic` + Separate-Process Load Test 500 khách | `IMPLEMENTED & VERIFIED` |
| **Phase 4.3** | Soak Test liên tục 15 phút (500 khách) | `NOT TESTED` |
| **Phase 5** | Booth NPC 3D (bảng tên ngực trái + 6 trạng thái animation fallback) | `IMPLEMENTED & VERIFIED` |
| **Phase 5** | Pre-generated Cached Audio Pipeline (SHA-256 content hash, `.wav` stream, 100% cache hit) | `IMPLEMENTED & VERIFIED` |
| **Phase 6** | Grounded AI Chat + Anti-Fabrication + Prompt Injection Guard + Usage Logs | `IMPLEMENTED & VERIFIED` (Mock Provider) |
| **Phase 6** | AI Voice Session + Quotas (90s, 3 phiên/giờ, 25 đồng thời) + `FALLBACK_STT_CHAT_TTS` | `IMPLEMENTED & VERIFIED` (Mock Provider) |
| **Phase 6** | Kết nối Gemini API trả phí thực tế (`GEMINI_API_KEY`) | `BLOCKED` (`LIVE GEMINI NOT VERIFIED` — chưa có key/phê duyệt chi phí) |

---

## D. Cơ sở Dữ liệu & Migration (`VERIFIED`)
- **Database V28:** `BE/data/expo_v28_dev.db` — WAL mode, `PRAGMA user_version = 5`, `PRAGMA foreign_key_check = OK`, `PRAGMA integrity_check = ok`.
- **Các bảng mới V28:** `companies`, `products` (decoupled `booth_id NULL ON DELETE SET NULL`), `booth_slot_assignments`, `import_jobs`, `exhibitions`, `exhibition_versions`, `zones`, `exhibition_version_booths`, `categories`, `audio_assets`, `booth_faqs`, `ai_usage_logs`.
- **Backup đã tạo trước migration:**
  - `BE/data/backups/expo_pre_v28_2026-11-20T08-52-35-610Z.db`
  - `BE/data/backups/expo_v28_pre_phase2_2026-11-20T09-25-53-644Z.db`
  - `BE/data/backups/expo_v28_pre_phase4_2_2026-11-20T10-32-59-365Z.db`
- **Bảo toàn V27.5 (`BE/data/expo.db`):** SHA-256 giữ nguyên `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` (`unchanged: true`).

---

## E. Danh sách API V28 (`/api/v28/*`)
| Endpoint | Method | Auth | Kết quả kiểm thử |
| :--- | :---: | :---: | :---: |
| `/api/v28/health`, `/api/v28/archetypes` | GET | Public | PASS |
| `/api/v28/companies`, `/api/v28/companies/:id` | GET / POST / PATCH | Admin (ghi) | PASS |
| `/api/v28/products`, `/api/v28/products/:id` | GET / POST / PATCH | Admin (ghi) | PASS |
| `/api/v28/booths`, `/booths/:id/archive`, `/booths/:id/slots/:slotId` | GET / PATCH / PUT / DELETE | Admin (ghi) | PASS |
| `/api/v28/imports/excel/preview`, `/commit`, `/imports/:jobId/report` | POST / GET | Admin | PASS |
| `/api/v28/imports/url` (SSRF-safe + Duplicate 409) | POST | Admin | PASS |
| `/api/v28/exhibitions`, `/exhibitions/active`, `/:id/drafts`, `/:id/versions/:vId`, `/publish`, `/rollback` | GET / POST / PATCH | Admin (ghi) | PASS |
| `/api/v28/categories`, `/api/v28/categories/plan` | GET / POST | Admin (ghi) | PASS |
| `/api/v28/booths/:id/audio`, `/api/v28/audio/:audioId/stream` | GET | Public | PASS |
| `/api/v28/ai/status`, `/ai/chat`, `/ai/voice/start`, `/ai/voice/:sid/turn`, `/end` | GET / POST | Public + Rate/Quota | PASS |

---

## F. UI/UX
- **Admin V28 (`/admin/v28`):** Tách hoàn toàn khỏi Admin V27.5 (`/admin`), hiển thị KPI 100 gian hàng, 10 phân khu, sơ đồ 2D tương tác, bảng phân trang/tìm kiếm/lọc, gán trực tiếp 6 slot sản phẩm từ Catalog.
- **World V28 (`/?world=dynamic`):** Desktop (`1440×900`) & Mobile Portrait (`390×844` / `360×800`, `overflowX: false`, touch targets ≥44px, Bottom Sheet, Joystick tùy chọn).
- **NPC + Audio + AI:** NPC đứng góc trước-phải gian Near LOD không chắn sản phẩm, có bảng tên ngực trái; Panel AI hiển thị rõ AI Disclosure, Audio chỉ phát khi bấm, tự ngắt khi rời gian hàng.

---

## G. Kết quả Kiểm thử (Tests & Browser QA)
- **Typecheck & Build:** `npm run typecheck -w BE && npm run typecheck -w FE && npm run build -w BE && npm run build -w FE` → **PASS (0 lỗi)**.
- **Automated Tests (`npm test`):** **7 test files / 66 tests PASSED (0 failed)**:
  - `FE/src/__tests__/movementAndPathfinding.test.ts` (38 tests)
  - `BE/src/__tests__/expoBackendAndRealtime.test.ts` (17 tests)
  - `BE/src/__tests__/v28Phase1CatalogAndExcel.test.ts` (3 suites)
  - `BE/src/__tests__/v28Phase2DynamicWorld.test.ts` (2 suites)
  - `FE/src/__tests__/v28Phase3StreamingAndRoof.test.ts` (4 tests)
  - `BE/src/__tests__/v28Phase4SpatialAoi.test.ts` (1 suite)
  - `BE/src/__tests__/v28Phase5And6NpcAudioAi.test.ts` (1 suite)
- **Browser QA (Headless Chrome WebGL D3D11):** Xác minh `/`, `/?world=v27`, `/?world=dynamic` (20, 50, 100 gian), `/admin`, `/admin/v28` — **0 console errors, 0 page errors, 0 HTTP ≥ 400**.

---

## H. Hiệu năng Đo Thực tế (Performance)
- **3D Rendering (100 gian hàng, Intel Core i7-1355U, Chrome WebGL D3D11):**
  - Desktop Overview (Refined Far LOD 6-part + Dome Frame + Planters): **60 FPS**, `337` draw calls, `165,672` triangles, LOD `0/28/72`.
  - Desktop Focus: **60 FPS**, `38` draw calls, `12,616` triangles, JS Heap `41.8 MB`.
  - Mobile Portrait Emulation (`390×844`): **60 FPS**, `34` draw calls, `12,624` triangles (`REAL DEVICE NOT TESTED`).
- **Separate-Process Socket.IO Load Test (`scripts/v28/loadtest_v28_separate_process.mjs`, 100 booths, Node v22.20.0):**
  - Server process: RSS **`133.9 MB`**, Event-loop lag p95 **`24.2 ms`**, `158` broadcast ticks, `15,476` socket deliveries.
  - Uniform 100: p50 `6ms` / **p95 `12ms`** / dup `0`.
  - Uniform 300: p50 `13ms` / **p95 `41ms`** / dup `0`.
  - Uniform 500: p50 `21ms` / **p95 `47ms`** / dup `1` (0.02%).
  - Hotspot 500 (1 cell): p50 `28ms` / **p95 `73ms`** / dup `0` / cap `30` avatars / overflow `484`.
  - Teleport Storm 200: p50 `11ms` / **p95 `30ms`** / dup `0`.
  - Reconnect Storm 250: **100% (250/250)** / **p95 `1ms`** / dup `0`.
- **Audio Cache Hit Rate:** Lần gọi 2 trên cùng booth đạt **100% cache hit (`0` lần tái sinh)**.

---

## I. Bảo mật (Security)
- API key (`GEMINI_API_KEY`) chỉ đọc từ Backend env, tuyệt đối không gửi lên FE.
- URL import tái sử dụng `productAdapter.ts` (chặn localhost/private IP/link-local/DNS rebinding, giới hạn kích thước & redirect) + chống trùng URL (`409`).
- AI Consultant: `sanitizeAgainstPromptInjection()`, từ chối lệnh Admin/sửa giá, cô lập ngữ cảnh theo `companyId`, giới hạn rate chat (15/phút) & quota voice (90s, 3 phiên/giờ, 25 đồng thời).

---

## J. Trạng thái Git & Rollback
- **Branch:** `grand-expo-v28-dev` (chưa push, chưa merge vào `grand-expo-v27-5` hay `main`).
- **Chuỗi Checkpoints:** `432cd25` (V27.5 baseline) → `07597ac` (Phase 1) → `3bccc0a` (Phase 2) → `0f43c39` (Phase 3) → `c91a48a` (Phase 4) → `e6b89b6` (Phase 4.1) → commit Phase 4.2–7 hiện tại.
- **Rollback nhanh:** V27.5 không bị sửa đổi; mọi route `/` và `/?world=v27` vẫn chạy bình thường. Có thể rollback layout V28 bằng nút `⏪ Rollback` trong `/admin/v28`, hoặc rollback code bằng `git reset --hard <checkpoint>`.

---

## K. Các Vấn đề Còn Tồn tại (Outstanding Issues)
- **Critical:** Không có.
- **High:**
  1. **Live Gemini API chưa kích hoạt (`LIVE GEMINI NOT VERIFIED`):** Cần cung cấp `GEMINI_API_KEY` trong `BE/.env` và bật `V28_ENABLE_LIVE_AI=true` sau khi phê duyệt ngân sách chi phí.
- **Medium:**
  1. **Thiết bị Android thật (`REAL DEVICE NOT TESTED`):** Cần kiểm thử FPS và microphone thực tế trên điện thoại Android vật lý.
  2. **Soak test 15 phút (`NOT VERIFIED`):** Cần chạy soak 500 khách liên tục 15 phút trên môi trường staging.
- **Low:**
  1. Trong `A_uniform_500` xuất hiện 1/4,430 delta trùng seq (0.02%) ở ranh giới giữa `v28:snapshot` sau teleport và tick loop 100ms.
  2. NPC 3D hiện dùng animation procedural fallback (do GLB V27.5 không có facial lip-sync morph targets).

---

## L. Kết luận Nghiệm thu (Final Verdict)
**`PARTIALLY READY — READY FOR LOCAL USER ACCEPTANCE (NON-PAID MODE)`**

Toàn bộ kiến trúc, code, database isolation, 100-booth 3D world, `/admin/v28`, Spatial AOI 500-client separate-process load test, Cached Audio và Grounded AI Chat/Voice đã hoạt động ổn định và được kiểm chứng thực tế. Hệ thống được đánh dấu `PARTIALLY READY` thay vì production-ready 100% do còn 3 hạng mục phụ thuộc môi trường/phê duyệt: (1) `GEMINI_API_KEY` thật, (2) thiết bị Android vật lý, và (3) soak test 15 phút trên staging.
