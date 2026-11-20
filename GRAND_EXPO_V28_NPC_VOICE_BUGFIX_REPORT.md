# GRAND EXPO WORLD V28 — NPC UI CLEANUP & GEMINI VOICE BUG FIX REPORT
## STRICT SCOPE · ROOT CAUSE ANALYSIS · AUDIT FIRST

- **Dự án:** Grand Expo World V28
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch làm việc:** `grand-expo-v28-dev`
- **Phạm vi tuyệt đối:** Chỉ thực hiện **TASK A (Xóa bảng thông tin trắng trùng lặp trong V28)** và **TASK B (Điều tra root cause & sửa lỗi giọng nói/audio cache NPC)**. Tuyệt đối không sửa model 3D, layout chữ U, camera, navigation, Realtime/AOI, Admin UI, URL Import, Catalog hay V27.5.

---

## 1. Git Baseline

- **Branch trước khi sửa:** `grand-expo-v28-dev`
- **HEAD commit trước khi sửa:** `c760e37`
- **V27.5 Database (`BE/data/expo.db`):** SHA-256 gốc `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` (không thay đổi).

---

## 2. Audit trước khi sửa

| Hạng mục | Trạng thái Audit | Bằng chứng |
| :--- | :---: | :--- |
| **Task A:** Bảng trắng trùng lặp khi focus gian hàng trong V28 | **FAIL** | `FE/src/components/v28/DynamicWorldHud.tsx` (lines 539–660) render thêm thẻ trắng 6 slot + nút "Hỏi Trợ lý AI / Audio" đè lên NPC mỗi khi `focusedBooth != null` |
| **Task B1:** Audio Cache & WAV Validation / Serving | **PARTIAL** | `audioCacheService.ts` dùng `process.cwd()` thay vì đường dẫn module tuyệt đối, không kiểm tra header `RIFF/WAVE` khi cache hit, không bọc raw PCM sang WAV nếu Gemini trả PCM, và `v28Routes.ts` thiếu `Accept-Ranges: bytes` / `206 Partial Content` |
| **Task B2:** Giọng nói tiếng Việt ở chế độ dự phòng khi chưa bật Gemini Live | **FAIL** | `synthesizeFallbackWav()` chỉ tạo tiếng chuông 440Hz (không đọc chữ tiếng Việt) khi `GEMINI_API_KEY` chưa cấu hình |
| **Task B3:** Gemini Live TTS thật (`gemini-3.8-flash-tts`) | **BLOCKED** | `BE/.env` hiện có `hasGeminiKey: false, liveEnabled: false` — chưa có API key & chưa được phép tiêu hao quota thật |
| **V27.5, Model 3D, Layout chữ U, NPC Panel 2 tab, AI Chat** | **PASS** | Giữ nguyên 100% |

---

## 3. Root Cause chính xác của lỗi audio

Qua kiểm tra tuần tự 4 lớp (Frontend → Backend → Audio Cache → Gemini Integration):
1. **Đường dẫn lưu file phụ thuộc `process.cwd()` & thiếu kiểm tra tính toàn vẹn WAV (`audioCacheService.ts`):** `LocalAudioStorageAdapter` dùng `path.resolve(process.cwd(), 'data', 'v28_audio')`, và `ensureCachedAudio` chỉ gọi `storage.exists(key)` mà không kiểm tra file có rỗng/hỏng (`RIFF/WAVE`, `length > 44`) hay không → dễ trả `cacheHit: true` cho tệp hỏng hoặc trả `404` khiến `<audio>.onerror` báo `"Không thể tải tệp âm thanh đã lưu"`.
2. **Endpoint `/api/v28/audio/:audioId/stream` thiếu HTTP Range (`Accept-Ranges: bytes`, `206 Partial Content`, `Content-Length`, `Cross-Origin-Resource-Policy`):** Trình duyệt Chrome/Safari gửi header `Range: bytes=0-` cho `<audio>`.
3. **Chưa cấu hình `GEMINI_API_KEY` & `V28_ENABLE_LIVE_AI=true` trong `BE/.env`:** Khi chưa bật Gemini Live TTS, `synthesizeFallbackWav()` chỉ tạo sóng sin 440Hz, nên khách không nghe được tiếng Việt. Ngoài ra, adapter `synthesizeGeminiTtsWav()` chưa có lớp bọc `ensureValidWavBuffer()` phòng trường hợp Gemini trả raw PCM `L16`.

---

## 4. Bằng chứng Network / File / Cache

- Kiểm tra thư mục `BE/data/v28_audio`: tồn tại 124 tệp `.wav`, mẫu `115,244 bytes`, header `RIFF WAVE`.
- Kiểm tra live qua Vite proxy `http://localhost:5173/api/v28/audio/<id>/stream`:
  - Request đầy đủ: **HTTP `200`**, `Content-Type: audio/wav`, `Accept-Ranges: bytes`.
  - Request Range (`Range: bytes=0-1023`): **HTTP `206 Partial Content`**, `Content-Range: bytes 0-1023/115244`.
  - Giải mã bằng Web Audio API trong Chrome (`AudioContext.decodeAudioData`): **THÀNH CÔNG**, `durationSec: 2.4`, `channels: 1`.

---

## 5. Các file đã sửa (Strict Scope — chỉ 4 file)

1. [FE/src/components/v28/DynamicWorldHud.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx) — Xóa đúng nhánh render bảng trắng `focusedBooth`, giữ nguyên `V28NpcConsultantPanel` và `selectedProduct` (Product Detail Card).
2. [BE/src/services/v28/audioCacheService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/audioCacheService.ts) — Dùng đường dẫn module tuyệt đối `DEFAULT_AUDIO_DIR`, thêm `isValidWavBuffer()` & `ensureValidWavBuffer()` (bọc raw PCM → RIFF/WAVE), kiểm tra WAV toàn vẹn ở mọi cache hit & stream (tự đánh dấu `failed` và tạo lại nếu file hỏng).
3. [BE/src/routes/v28Routes.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/routes/v28Routes.ts) — Nâng cấp `GET /api/v28/audio/:audioId/stream` hỗ trợ `Accept-Ranges: bytes`, `206 Partial Content`, `Content-Length`, `Cross-Origin-Resource-Policy: cross-origin`.
4. [FE/src/components/v28/V28NpcConsultantPanel.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/V28NpcConsultantPanel.tsx) — Phát trực tiếp file `.wav` đã cache khi `liveGeminiTtsEnabled === true`; khi chưa bật Gemini Live TTS thì đọc tiếng Việt thực bằng Web Speech API (`vi-VN`) với khóa đơn âm thanh nghiêm ngặt (tắt sạch cả `<audio>` và `speechSynthesis` khi Pause/Stop/Mute/Đổi tab/Đóng bảng), báo mã lỗi media thật nếu có sự cố.
5. [BE/src/__tests__/v28NpcAudioAndChat.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28NpcAudioAndChat.test.ts) — Thêm test `isValidWavBuffer`, `ensureValidWavBuffer` (raw PCM → WAV), phát hiện cache hỏng 0 byte & tự tái tạo WAV hợp lệ.

---

## 6. Cách loại bỏ bảng trắng (Task A)

- Chỉ bỏ nhánh `focusedBooth` trong `DynamicWorldHud.tsx` (không xóa bất kỳ dữ liệu slot, API sản phẩm, Product Modal hay bảng NPC nào; không ảnh hưởng V27.5).
- Kết quả trên `task_a_clean_focus.png`: khi focus gian hàng, không còn bảng trắng che NPC (`duplicateWhiteCardPresent: false`), nhân viên tư vấn 3D "Ngọc Anh" hiển thị trọn vẹn bên phải gian hàng.

---

## 7. Bằng chứng NPC và Product Modal vẫn hoạt động

- Bấm vào nhân viên tư vấn 3D mở bảng `V28NpcConsultantPanel` với 2 tab `Giới thiệu | Chat`.
- Bấm nút `🔍 Chi tiết` trong tab Giới thiệu (hoặc bấm trực tiếp kệ sản phẩm 3D) vẫn mở thẻ chi tiết sản phẩm `selectedProduct` đầy đủ ảnh, giá, SKU, mô tả.

---

## 8. Model Gemini đã xác minh

- Nguồn: Tài liệu Google Gemini API chính thức (`gemini-api-guides/speech-generation.md` & `changelog.md`).
- Model TTS chính thức (tạo file audio trước, khác với Gemini Live hội thoại realtime): **`gemini-3.8-flash-tts`** (mặc định qua `V28_GEMINI_TTS_MODEL`), cùng `gemini-3.8-flash-lite-tts` và `gemini-3.1-flash-tts-preview`.
- Endpoint chính thức: `POST https://generativelanguage.googleapis.com/v1beta/interactions` (`response_format: { type: "audio" }`, `generation_config.speech_config: [{ voice: "Kore" }]`).

---

## 9. Trạng thái Gemini API Key & Feature Flag (không lộ bí mật)

- `GEMINI_API_KEY`: **Chưa cấu hình (`false`)** trong `BE/.env`.
- `V28_ENABLE_LIVE_AI`: **Chưa bật (`false`)**.
- `V28_GEMINI_TTS_MODEL`: Chưa ghi đè (mặc định `gemini-3.8-flash-tts`).
- **Kết luận trung thực:** **`BLOCKED — GEMINI LIVE TTS NOT VERIFIED`** (chưa gọi API Gemini có phí).

---

## 10 & 11. Cơ chế tạo audio & Cơ chế cache

- Tạo trước không đồng bộ khi Admin Publish / cập nhật sản phẩm / gán slot; không gọi Gemini khi khách bấm nghe.
- Cache key `SHA-256(normalizedText | style | language | voiceId | modelId | mimeType)`, chống tạo trùng đồng thời (`inFlight`), kiểm tra header `RIFF/WAVE` trước khi trả cache hit, tự vô hiệu hóa & tái tạo nếu tệp đĩa hỏng, bọc raw PCM sang WAV chuẩn (`ensureValidWavBuffer`).

---

## 12 & 13. Kết quả phát audio & Browser Tests

- `BE/src/__tests__/v28NpcAudioAndChat.test.ts`: **2/2 PASS** (`450ms`), gồm test corrupt WAV 0 byte tự phục hồi & raw PCM → WAV.
- `qa_task_ab_verify.mjs` (Headless Chrome CDP):
  - `duplicateWhiteCardPresent: false` (**PASS**).
  - HTTP `200` & HTTP `206 Partial Content` (`bytes 0-1023/115244`) (**PASS**).
  - Chrome `AudioContext.decodeAudioData`: `durationSec: 2.4`, `channels: 1` (**PASS**).
  - `consoleErrors: []`, `pageErrors: []` (**PASS**).
- **Gemini Live TTS thực tế:** **NOT VERIFIED / BLOCKED** (chưa có `GEMINI_API_KEY`).

---

## 14. Kết quả Regression

- `npm run typecheck -w BE` & `FE`: **PASS**
- `npm run build -w BE` & `FE`: **PASS** (`710 modules`)
- `BE/data/expo.db` SHA-256 không đổi. Không sửa bất kỳ model 3D, bố cục chữ U, Admin hay V27.5 nào.

---

## 15. Bảng tổng hợp trạng thái nghiệm thu

| Hạng mục | Trạng thái |
| :--- | :---: |
| Task A — Xóa bảng thông tin trắng trùng lặp trong V28 | **PASS** |
| Task B — Sửa WAV validation, corrupt-cache recovery, Range `206`, đường dẫn tuyệt đối & giọng đọc dự phòng `vi-VN` | **PASS** |
| Task B — Xác minh gọi **Gemini Live TTS thật** với API key & quota thực | **BLOCKED — GEMINI LIVE TTS NOT VERIFIED** |

---

## 16. Git Diff & Status

- Branch: `grand-expo-v28-dev`, chỉ sửa đúng 4 file code/test + 1 file báo cáo, **không push, không merge, không deploy**.

---

## 17. Những vấn đề còn lại

- Chưa thể xác minh chất lượng giọng tiếng Việt thật từ `gemini-3.8-flash-tts` cho đến khi người dùng cung cấp `GEMINI_API_KEY` và bật `V28_ENABLE_LIVE_AI=true` trong `BE/.env`.

---

## 18. Hướng dẫn cấu hình tối thiểu để bật Gemini Live TTS thật

Thêm 4 dòng sau vào file `BE/.env` (sau đó khởi động lại BE và bấm `Retry an toàn` trong Admin V28 → `🎙️ NPC & Audio Cache`):

```env
GEMINI_API_KEY=your_google_ai_studio_api_key_here
V28_ENABLE_LIVE_AI=true
V28_GEMINI_TTS_MODEL=gemini-3.8-flash-tts
V28_GEMINI_TTS_VOICE=Kore
```

**KẾT LUẬN: TASK A PASS · TASK B INFRASTRUCTURE & FALLBACK PASS · GEMINI LIVE TTS BLOCKED (CHỜ API KEY) — DỪNG CHỜ NGHIỆM THU.**
