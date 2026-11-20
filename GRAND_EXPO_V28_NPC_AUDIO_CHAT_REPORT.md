# GRAND EXPO WORLD V28 — NPC AUDIO & AI CHAT REPORT
## AUDIT-FIRST · MINIMAL CHANGES · STRICT SCOPE

- **Dự án:** Grand Expo World V28
- **Repository:** `E:\Lập trình\MatBaoWS\exhibition`
- **Branch làm việc:** `grand-expo-v28-dev` (baseline trước tác vụ: `89cf0c6`)
- **Phạm vi thực hiện:** Chỉ giữ nguyên bảng tư vấn NPC V27.5 → thêm tab **Chat** bên cạnh **Giới thiệu** → hoàn thiện tạo trước audio tiếng Việt bằng Gemini TTS + cache + phát lại. Tuyệt đối không sửa model 3D, bố cục chữ U, camera, navigation, AOI, URL Import, Catalog, Admin UI hay V27.5.

---

## 1. Audit trước triển khai

Đã kiểm tra trực tiếp source code và biến môi trường thực tế (`FE/src/components/NpcAssistantPanel.tsx`, `FE/src/components/v28/V28NpcConsultantPanel.tsx`, `BE/src/services/v28/audioCacheService.ts`, `BE/src/services/v28/aiConsultantService.ts`, `BE/.env`):

- **Bảng tư vấn NPC V28 (`V28NpcConsultantPanel.tsx`):** Trước khi sửa đang dùng giao diện 3 tab khác biệt (`Audio Giới thiệu | AI Chat | AI Voice`), **chưa kế thừa** nguyên vẹn giao diện bảng tư vấn V27.5 (`NpcAssistantPanel.tsx`: avatar, tên/chức danh từ `getNpcAssistantProfile`, thẻ sản phẩm kèm ảnh & nút `🔍 Chi tiết`, chấm tiến trình, và cụm 5 nút `Trước / Tạm dừng / Tiếp / Dừng / Tắt tiếng`).
- **Audio Cache & Gemini TTS (`audioCacheService.ts`):** Đã có SHA-256 content hash, lưu file WAV tại `BE/data/v28_audio/` và hook warm trên Publish/Product/Slot — **nhưng còn thiếu**: (a) adapter gọi REST Gemini TTS chính thức (cấu hình model/voice qua biến môi trường), (b) trạng thái 4 bước `PENDING → GENERATING → READY / FAILED`, (c) chống tạo trùng khi nhiều request đồng thời (`inFlight` deduplication), (d) clip `closing` cho bước kết thúc, và (e) chính sách dọn cache cũ `pruneStaleAudioCache`.
- **AI Chat (`aiConsultantService.ts`):** Đã đạt toàn bộ yêu cầu grounded theo `boothId`/`companyId`, không bịa giá/tồn kho/bảo hành, có rate limit (`15/phút`), chống prompt injection, không lộ API key, hiển thị rõ `LIVE GEMINI NOT VERIFIED`.
- **Trạng thái `BE/.env` hiện tại:** `hasGeminiKey: false`, `liveEnabled: false` → tuyệt đối không tự bật API có phí và ghi rõ `LIVE GEMINI TTS NOT VERIFIED` / `LIVE GEMINI NOT VERIFIED`.

---

## 2. Danh sách phân loại Audit (PASS / PARTIAL / FAIL)

| STT | Hạng mục | Phân loại | File bằng chứng | Hành động |
| :-: | :--- | :---: | :--- | :--- |
| 1 | AI Chat Backend (Grounded + Security + Quota) | **PASS** | `BE/src/services/v28/aiConsultantService.ts` | Giữ nguyên 100% |
| 2 | Model NPC 3D, Animation & Đổi tên | **PASS** | `SalesAssistantNpc.tsx`, `DynamicExhibitionScene.tsx` | Giữ nguyên 100% |
| 3 | Gemini TTS Pre-gen & Cache Pipeline | **PARTIAL** | `BE/src/services/v28/audioCacheService.ts` | Bổ sung env model/voice, REST adapter chính thức, 4 trạng thái, in-flight dedupe, `closing` clip, `pruneStaleAudioCache` |
| 4 | Bảng tư vấn NPC V28 (`Giới thiệu \| Chat` kế thừa nguyên V27.5) | **FAIL** | `FE/src/components/v28/V28NpcConsultantPanel.tsx` | Kế thừa nguyên CSS & controls V27.5 `npc-assistant-panel`, bổ sung thanh 2 tab `Giới thiệu \| Chat` |

---

## 3. Những chức năng đã đạt (`PASS`) và được giữ nguyên

- `BE/src/services/v28/aiConsultantService.ts` (không chỉnh sửa).
- `FE/src/components/NpcAssistantPanel.tsx` (V27.5 nguyên bản, không chỉnh sửa).
- Toàn bộ model 3D, `SalesAssistantNpc`, `AvatarCharacter`, animation, bố cục chữ U, camera, navigation, bounds, Realtime/AOI, Admin UI, URL Import, Catalog, database V27.5 (`BE/data/expo.db`).

---

## 4. Những chức năng đã bổ sung

1. **Kế thừa nguyên bảng tư vấn V27.5 + Tab `Giới thiệu | Chat` (`V28NpcConsultantPanel.tsx`, `DynamicWorldHud.tsx`):**
   - Giữ nguyên header NPC (`👩‍💼`, tên & chức danh từ `getNpcAssistantProfile`, tên doanh nghiệp, nút `✕`), status pill, bộ đếm sản phẩm, hộp phụ đề, thẻ sản phẩm kèm ảnh & nút `🔍 Chi tiết` (mở Product Modal), chấm tiến trình và 5 nút điều khiển (`⏮ Trước`, `⏸ Tạm dừng / ▶ Tiếp tục / 🔄 Nghe lại`, `Tiếp ⏭`, `⏹ Dừng`, `🔊 Tắt tiếng`).
   - Tab mặc định là **Giới thiệu**; chuyển sang **Chat** sẽ tạm dừng audio giới thiệu và giữ nguyên vị trí bước/lịch sử hội thoại; quay lại **Giới thiệu** giữ nguyên trạng thái tạm dừng tại đúng sản phẩm đang xem.
2. **Hoàn thiện Gemini TTS Pre-Generation & Cache (`audioCacheService.ts`):**
   - Model/Voice/Style cấu hình qua biến môi trường `V28_GEMINI_TTS_MODEL`, `V28_GEMINI_TTS_VOICE`, `V28_GEMINI_TTS_STYLE`.
   - Adapter gọi REST Gemini TTS chính thức (`POST https://generativelanguage.googleapis.com/v1beta/interactions`) chỉ chạy khi cả `GEMINI_API_KEY` và `V28_ENABLE_LIVE_AI=true` đều được bật; mặc định chạy `local-fallback WAV` an toàn không phát sinh chi phí.
   - Đủ 4 trạng thái `PENDING → GENERATING → READY / FAILED`, chống tạo trùng đồng thời (`inFlight`), hỗ trợ bước `closing`, và chính sách dọn cache cũ `pruneStaleAudioCache(maxAssets)` không xóa file đang sử dụng.

---

## 5. Gemini Model ID và nguồn xác minh

Đã xác minh trực tiếp qua **Google Gemini API Docs MCP** (`gemini-api-guides/speech-generation.md` & `gemini-api-guides/changelog.md`):
- **Gemini TTS (tổng hợp giọng nói tạo file WAV — KHÔNG phải Gemini Live):**
  - `gemini-3.8-flash-tts` (mặc định cấu hình được qua `V28_GEMINI_TTS_MODEL`, chất lượng studio, endpoint `POST /v1beta/interactions` với `response_format: { type: "audio" }` & `generation_config.speech_config: [{ voice: "Kore" }]`).
  - `gemini-3.8-flash-lite-tts` (tối ưu chi phí).
  - `gemini-3.1-flash-tts-preview` (phát hành 15/04/2026).
- **Trạng thái thực tế API key:** Chưa cấu hình `GEMINI_API_KEY` / `V28_ENABLE_LIVE_AI=true` trong `BE/.env` → **LIVE GEMINI TTS NOT VERIFIED**.

---

## 6. TTS Generation Flow

1. Admin **Publish** / **Cập nhật sản phẩm** / **Gán slot** → backend gọi non-blocking `syncVersionAudioIncremental` / `getOrPrepareBoothAudioPack`.
2. Tính `contentHash = SHA-256(normalizedText | style | language | voiceId | modelId | mimeType)`.
3. Kiểm tra bảng `audio_assets` + `storage.exists(storageKey)`: nếu khớp → **Cache Hit** (trả ngay, không gọi TTS).
4. Kiểm tra `inFlight` Map: nếu đang có tác vụ cùng `dedupeKey` chạy song song → dùng chung Promise (không tạo trùng).
5. Ghi `PENDING` → chuyển `GENERATING` → tổng hợp (Gemini TTS khi bật Live, hoặc Fallback WAV khi tắt) → lưu atomic ra đĩa `BE/data/v28_audio/` → cập nhật `READY` (hoặc `FAILED` nếu lỗi).
6. Khi khách mở bảng tư vấn, chỉ phát tệp đã lưu qua `GET /api/v28/audio/:audioId/stream`.

---

## 7. Audio Cache Flow

- Metadata lưu trong SQLite `audio_assets` (khóa duy nhất `(entity_type, entity_id, slot_key, content_hash)`).
- Dữ liệu nhị phân `.wav` lưu trên ổ đĩa `BE/data/v28_audio/` (tồn tại bền vững sau khi restart backend).
- Khi nội dung thay đổi → sinh `contentHash` mới, tạo phiên bản mới mà không phá tệp cũ đang phát.
- `pruneStaleAudioCache(maxAssets)` dọn các phiên bản cũ vượt ngưỡng nhưng luôn bảo vệ phiên bản `ready` mới nhất của mỗi `(entity_type, entity_id, slot_key)`.

---

## 8. Chat Architecture

- Nhúng trực tiếp trong tab **Chat** của `V28NpcConsultantPanel` (giữ nguyên header NPC, không tạo chatbot nổi bên ngoài).
- Gọi `POST /api/v28/ai/chat` chỉ truyền `{ boothId, userId, message }`; backend tự suy ra `companyId` từ phiên bản đang công bố, chỉ nạp dữ liệu thực của gian hàng và doanh nghiệp đó.
- Lịch sử hội thoại được lưu trong state của phiên tư vấn, không mất khi chuyển qua lại giữa **Giới thiệu** và **Chat**.

---

## 9. Screenshot hai tab (Headless Chrome CDP thực tế)

- **Tab Giới thiệu (Desktop 1440×900):** `npc_tab_gioi_thieu.png` — Hiển thị nguyên bảng V27.5 (`Ngọc Anh · Chuyên viên Tư vấn Công nghệ · Aether Technologies Corp.`), thanh tab `Giới thiệu | Chat`, `Sản phẩm 1/2`, phụ đề, thẻ sản phẩm `Trạm Cảm Biến Môi Trường AetherSense X1` (`6.850.000 ₫`) kèm nút `🔍 Chi tiết`, 4 chấm tiến trình và đủ 5 nút điều khiển.
- **Tab Chat (Desktop 1440×900):** `npc_tab_chat.png` — Giữ nguyên khung & header NPC, hiển thị nhãn `Chế độ Grounded Mock (LIVE GEMINI NOT VERIFIED)`, câu trả lời đúng giá thực (`6.850.000 VND`, `18.900.000 VND`), ô nhập + nút `Gửi`.
- **Mobile Portrait (390×844):** `npc_mobile_390.png` — `overflowX: false`, giữ đúng trạng thái `Đang tạm dừng thuyết minh` tại `Sản phẩm 1/2` khi quay lại từ tab Chat.

---

## 10. Kết quả Test Audio Player & Cache

- `BE/src/__tests__/v28NpcAudioAndChat.test.ts` (**PASS**):
  - Tạo audio lần đầu (gồm `welcome`, `company_intro`, product slots, `closing`): **PASS**.
  - Cache hit lần hai (`generatedCount = 0`): **PASS**.
  - Chống tạo trùng 5 request đồng thời (`inFlightDeduplicated >= 4`, chỉ 1 `audioId`): **PASS**.
  - Đổi nội dung tạo `contentHash` mới + `pruneStaleAudioCache` xóa bản cũ & giữ bản mới: **PASS**.
  - Restart backend (đóng/mở lại SQLite + `V28AudioCacheService`) đạt **100% cache hit**: **PASS**.
- Trình duyệt thực tế (`qa_npc_tabs.mjs` — **PASS**): tab Giới thiệu mặc định, nút `Tiếp ⏭` chuyển sang SP #1, chuyển tab Chat tự tạm dừng audio, quay lại tab Giới thiệu giữ đúng SP #1 ở trạng thái tạm dừng, 0 lỗi console/page.

---

## 11. Kết quả Test Chat

- Gửi câu hỏi trên UI (`"Gian hàng này có sản phẩm gì và giá bao nhiêu?"`) → nhận câu trả lời đúng sản phẩm & giá thật của `Aether Tech Lab`, hiển thị rõ `LIVE GEMINI NOT VERIFIED`.
- Hỏi về bảo hành 5 năm / giảm giá 50% không có trong dữ liệu → không tự bịa thông tin.
- Chặn quá tần suất `15 tin/phút` → **PASS**.

---

## 12. Security Tests

- API key chỉ nằm ở backend (`BE/.env`), response không chứa key (`!reply.includes('AIza')`).
- Không tin `companyId` do client khai báo (backend suy từ `boothId` của phiên bản đang publish).
- Chống prompt injection qua `sanitizeAgainstPromptInjection`.
- Rate limiting & độ dài tin nhắn (`maxLength={400}`) được kiểm soát.

---

## 13. Regression V27.5 & V28

- `npm run typecheck -w BE`: **PASS**
- `npm run typecheck -w FE`: **PASS**
- `npm run build -w BE`: **PASS**
- `npm run build -w FE`: **PASS** (`710 modules`)
- `BE/src/__tests__/v28NpcAudioAndChat.test.ts`: **2/2 PASS**
- `BE/data/expo.db` SHA-256 không đổi: `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76`.
- Không sửa bất kỳ model 3D, animation, layout, camera, navigation, AOI hay Admin UI nào.

---

## 14. Danh sách file thay đổi (Change Scope Audit)

Chỉ đúng **4 file** thuộc trực tiếp phạm vi NPC Audio & Chat:
1. [BE/src/services/v28/audioCacheService.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/services/v28/audioCacheService.ts) — Gemini TTS env-configurable model/voice + REST adapter + 4-state lifecycle + in-flight deduplication + `closing` clip + `pruneStaleAudioCache`.
2. [FE/src/components/v28/V28NpcConsultantPanel.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/V28NpcConsultantPanel.tsx) — Kế thừa nguyên bảng tư vấn V27.5 cho tab `Giới thiệu` + thêm tab `Chat` + tạm dừng audio khi chuyển tab + bảo toàn lịch sử chat.
3. [FE/src/components/v28/DynamicWorldHud.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx) — Thêm đúng 4 dòng truyền prop `onInspectProduct` để nút `🔍 Chi tiết` mở Product Modal hiện có.
4. [BE/src/__tests__/v28NpcAudioAndChat.test.ts](file:///e:/Lập%20trình/MatBaoWS/exhibition/BE/src/__tests__/v28NpcAudioAndChat.test.ts) *(mới)* — Bộ test cho Gemini TTS cache lifecycle, restart persistence và AI Chat.

---

## 15. Git Status

- Branch: `grand-expo-v28-dev` (chỉ commit cục bộ, **không push, không merge, không deploy**, không stage `BE/data/`).

---

## 16. Những phần chưa xác minh (Ghi nhận trung thực)

- **`LIVE GEMINI TTS NOT VERIFIED` & `LIVE GEMINI CHAT NOT VERIFIED`:** Do `BE/.env` hiện chưa bật `GEMINI_API_KEY` và `V28_ENABLE_LIVE_AI=true` để tránh phát sinh chi phí khi chưa có phê duyệt. Khi người dùng cấu hình 2 biến này trong `BE/.env`, backend sẽ gọi trực tiếp `POST https://generativelanguage.googleapis.com/v1beta/interactions` với model `V28_GEMINI_TTS_MODEL` (`gemini-3.8-flash-tts`).
- **`REAL DEVICE NOT TESTED`:** Mobile Portrait `390×844` kiểm thử bằng Chrome DevTools Emulation.

---

## 17. Kết luận nghiệm thu

**TRẠNG THÁI: READY (Với ghi chú trung thực `LIVE GEMINI TTS / CHAT NOT VERIFIED` do chưa bật khóa có phí).**
- Tab **Giới thiệu** giữ nguyên 100% trải nghiệm & nút điều khiển của V27.5.
- Tab **Chat** gắn gọn trong cùng bảng tư vấn, giữ nguyên header NPC và lịch sử phiên.
- Pipeline tạo trước audio + cache + chống tạo trùng + lưu bền vững sau restart đã hoàn thiện và vượt qua toàn bộ kiểm thử tự động & trình duyệt thực tế.
- **Dừng và chờ người dùng nghiệm thu.**
