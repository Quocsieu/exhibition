# GRAND EXPO V28 — P2-02 AUDIO OPTIMIZATION
# CHẶNG 1 — FEASIBILITY AUDIT & IMPLEMENTATION DESIGN

**Ngày hoàn thành:** 2026-11-22  
**Chế độ thực hiện:** **AUDIT + THIẾT KẾ ONLY** — **0 dòng source code, test, `FE/.env`, 85 WAV hay `manifest.json` bị chỉnh sửa; chưa tạo WAV mới.**

---

## 1. Executive Summary

- **Khuyến nghị phương án tối ưu:** **Option A — Demo WAV Additive với Manifest riêng (`/tts/pregen-demo/manifest.json`)**, kết hợp:
  1. Giữ nguyên tuyệt đối **85 WAV + `/tts/pregen/manifest.json`** của 4 gian Production (`#1, #2, #11, #21`).
  2. Chỉ nạp manifest demo khi `?demoAgri=1` đang bật → **0 bytes phát sinh ở chế độ Production** và **0 bytes tăng thêm vào FE JS bundle**.
  3. Loại bỏ hoàn toàn cú tải **`~81,91 MB` ONNX/WASM từ HuggingFace/jsDelivr** và độ trễ Cold Start **`39,548 ms`** khi sếp mở 10 gian nông sản demo.
  4. Bổ sung 2 dòng guard dừng nguồn cũ trong `playHtmlAudio` (phòng ngừa triệt để mọi khả năng overlap trên luồng fallback) và chuẩn hóa cấu hình build `VITE_NPC_TTS_MODE=hybrid`.
- **Tình trạng `maxConcurrentPlaying = 2`:** Đã xác minh là **nhiễu thứ tự listener của script đo (`addEventListener('ended')` chạy sau `source.onended`)**, không phải 2 file WAV phát đè nhau trên Web Audio API (`npcWebAudioPlayer.ts:241` đã gọi `this.stop()` đồng bộ trước `source.start()`). Tuy nhiên vẫn đề xuất bổ sung guard phòng thủ 2 dòng ở `playHtmlAudio` cho luồng fallback.

---

## 2. Baseline & Tài sản bảo toàn

| Hạng mục | Giá trị thực tế |
| :--- | :--- |
| **Repository Root** | `E:\Lập trình\MatBaoWS\exhibition` |
| **Git Branch / HEAD** | `main` @ `dfe4281` (giữ nguyên toàn bộ thay đổi P1 & P2-01 chưa commit) |
| **FE Production Bundle** | `FE/dist/assets/index-DYcne8jB.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TS) |
| **Unit Tests Baseline** | `36/36` files — **`161/161` tests PASS** |
| **Pregen WAV hiện có** | `85` WAV (`15.05 MB`, TB `181 KB / WAV`, `4.21 s / WAV`), `manifest.json` (`27 KB`, `version: "v1"`, `voiceId: "vi_VN-vais1000-medium"`) |
| **Baseline Audio P2-02** | Pregen warm: `304–306 ms` (`0 ms` gap) · Piper Cold Start: `39,548 ms` (`~81.91 MB` CDN) · Piper Warm (new load): `5,214–5,629 ms` · Piper Warm (RAM): `702–1,829 ms` |

---

## 3. Kiểm kê 10 gian nông sản demo & Phân loại lời thoại (`?demoAgri=1`)

Nguồn sự thật duy nhất: `FE/src/services/v28AgriDemoShowcase.ts` (`AGRI_DEMO_BOOTH_SPECS`) + `FE/src/services/npcConsultationScript.ts` (`buildBoothConsultationSteps`).  
- **Ngôn ngữ:** Tiếng Việt (`vi-VN`) · **Giọng đọc mục tiêu:** `vi_VN-vais1000-medium` (Piper).  
- **Thứ tự phát cố định cho mỗi gian (4 bước):** `1. GREETING (welcome)` → `2. PRODUCT #1 (slot_01)` → `3. PRODUCT #2 (slot_02)` → `4. CLOSING (closing)`.  
- **Phụ thuộc Admin/API runtime:** **KHÔNG** (100% sinh deterministically từ `AGRI_DEMO_BOOTH_SPECS` khi `?demoAgri=1` bật; không đọc dữ liệu động từ Admin/DB).

| Gian | Khu | Doanh nghiệp Demo | Nhóm ngành | Sản phẩm (2 SP/gian) | Số bước thoại | Ước lượng chunks | Static | Template (Snapshot Demo) | Dynamic | Có thể pregen? |
| :---: | :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **#3** | A | HTX Dừa Xanh Bến Tre (Demo) | Sản phẩm từ dừa | `agri-p01` (Dầu dừa 250ml), `agri-p02` (Mứt dừa 300g) | `4` | `~11` | `1` *(câu cuối chung)* | `10` | `0` | **Có** |
| **#4** | A | Nông Trại Mật Ong Tây Nguyên (Demo) | Mật ong | `agri-p03` (Mật ong hoa cà phê), `agri-p04` (Mật ong hoa nhãn) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#5** | A | Đà Lạt Farm Sấy Dẻo (Demo) | Trái cây sấy | `agri-p05` (Xoài sấy 250g), `agri-p06` (Mít sấy 300g) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#6** | A | Vườn Trái Cây Miền Tây (Demo) | Trái cây tươi | `agri-p07` (Bưởi da xanh 2kg), `agri-p08` (Thanh long 1.5kg) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#7** | A | Cà Phê Rang Mộc Buôn Ma Thuột (Demo) | Cà phê | `agri-p09` (Robusta 500g), `agri-p10` (Arabica 250g) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#8** | A | Trà Shan Tuyết & Thảo Mộc (Demo) | Trà và thảo mộc | `agri-p11` (Trà Thái Nguyên 200g), `agri-p12` (Trà hoa cúc 100g) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#9** | A | Lúa Gạo Đồng Bằng Sông Cửu Long (Demo) | Gạo và ngũ cốc | `agri-p13` (Gạo thơm 2kg), `agri-p14` (Ngũ cốc gạo lứt 400g) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#10** | A | Hạt Dinh Dưỡng Bình Phước (Demo) | Hạt dinh dưỡng | `agri-p15` (Hạt điều 500g), `agri-p16` (Hạt mắc ca 350g) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#12** | B | Gia Vị Đặc Sản Phú Quốc & Tây Bắc (Demo) | Gia vị nông sản | `agri-p17` (Tiêu đen 150g), `agri-p18` (Muối ớt chanh 200ml) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **#13** | B | Đồ Uống Nông Sản Tự Nhiên (Demo) | Nước uống nông sản | `agri-p19` (Nước ép chanh dây), `agri-p20` (Nước cốt dâu tằm) | `4` | `~11` | `1` | `10` | `0` | **Có** |
| **Tổng** | **2 khu** | **10 gian demo** | **10 nhóm hàng** | **20 sản phẩm** | **40 bước** | **~101–105 chunks duy nhất** | **~1–2 chung** | **~100 riêng** | **`0`** | **100% Pregen được** |

---

## 4. Audit cơ chế Pregen WAV hiện tại & Thiết kế Manifest riêng cho Demo

- **Pipeline hiện tại:** `handleNpcClick` (`useNpcConsultationSession.ts`) → `buildBoothConsultationSteps` → `buildPiperStepPlanFromDisplayText` → `npcHybridTtsEngine.tryFetchPregenAudio(chunkText)` (tính **SHA-256 12 ký tự đầu** của `normalizedText` + **so khớp chính xác nội dung `entry.text === normalizedText`**!) → Fetch `/tts/pregen/<hash>.wav` → `npcWebAudioPlayer.playBlob` (`decodeAudioData` off-main-thread + LRU RAM cache `28` buffers) → `AudioBufferSourceNode.start(0, offsetSec)`.
- **Bảo vệ chống audio stale có sẵn:** Do tra cứu theo **SHA-256 của chính chuỗi lời thoại đã chuẩn hóa** kèm kiểm tra `entry.text === normalizedText`, bất kỳ thay đổi nào về tên, giá hoặc mô tả sản phẩm sẽ **tự động miss manifest** và fallback an toàn sang Piper WASM — không bao giờ phát nhầm WAV cũ!
- **Thiết kế Manifest Demo biệt lập (Zero-touch Production):**
  - Giữ nguyên tuyệt đối `FE/public/tts/pregen/manifest.json` và 85 file WAV cũ (`0` byte thay đổi, giữ nguyên hash SHA-256).
  - Lưu bộ WAV nông sản demo ở thư mục riêng **`FE/public/tts/pregen-demo/`** kèm **`FE/public/tts/pregen-demo/manifest.json`** (cùng schema `PregenAudioManifest`).
  - Trong `npcHybridTtsEngine.ts`: chỉ fetch thêm `/tts/pregen-demo/manifest.json` và merge read-only vào bộ nhớ tra cứu **khi `isAgriDemoShowcaseEnabled()` là `true` (`?demoAgri=1`)**. Nếu tắt `?demoAgri=1`, Production không gửi bất kỳ request nào tới `pregen-demo`.

---

## 5. So sánh Option A vs Option B

| Tiêu chí | Option A — Demo WAV Additive (`/tts/pregen-demo/`) *(Khuyến nghị)* | Option B — Giữ Piper WASM + Tối ưu tải/cache |
| :--- | :--- | :--- |
| **Khối lượng công việc** | Trung bình: viết 1 script sinh WAV offline bằng chính voice `vi_VN-vais1000-medium` + ~15 dòng load manifest demo trong `npcHybridTtsEngine.ts` | Cao: host lại 81.9 MB model lên Plesk/CDN riêng, sửa `piperTtsWorker.ts`, tinh chỉnh preload/memory/mobile Safari |
| **Số file phát sinh & Dung lượng** | `~101–105` WAV + `1` `manifest.json` (~`18–19 MB` tĩnh trên Plesk) | `4–5` file model/WASM (~`82 MB` tĩnh trên Plesk — nặng hơn gấp **4,3 lần**!) |
| **Tác động FE JS bundle** | **`0 KB`** (tài nguyên static on-demand) | `0 KB` JS nhưng tải `~82 MB` vào RAM/CacheStorage máy khách |
| **Thời gian bắt đầu dự kiến** | Kỳ vọng tiệm cận baseline Pregen (`< 1s` warm, `~1–3s` cold chunk đầu — sẽ đo thực tế ở Chặng 2) | Cold start vẫn phải tải `~82 MB` (mất 10–40s tùy mạng); Warm new-load vẫn mất `~5,2–5,6s` nạp ONNX |
| **Phụ thuộc CDN ngoài** | **`0%`** khi phát 10 gian demo | Phụ thuộc CDN hoặc tốn 82 MB băng thông server cho mỗi khách mới |
| **Rủi ro dữ liệu stale** | Rất thấp (content-hash SHA-256 tự miss và fallback nếu sửa text) | Không có |
| **Khả năng rollback** | Cực dễ: xóa thư mục `pregen-demo/` hoặc bỏ cờ `?demoAgri=1` | Trung bình (chạm vào `piperTtsWorker.ts`) |
| **Ảnh hưởng Production** | **`0%`** (chỉ kích hoạt khi `?demoAgri=1`) | Có rủi ro đụng vào `piperTtsWorker.ts` đang ổn định |

---

## 6. Root Cause `maxConcurrentPlaying = 2` (Audio Overlap Audit)

- **Kết quả truy vết `npcWebAudioPlayer.ts` & `useNpcConsultationSession.ts`:**
  1. `npcWebAudioPlayer.playBlob()` (`L241`) luôn gọi `this.stop()` **đồng bộ trước khi gọi `source.start()`**, nên trên Web Audio API không thể có 2 `AudioBufferSourceNode` cùng phát.
  2. Nguyên nhân script audit P2-02 ghi nhận `maxConcurrentPlaying = 2` là do **thứ tự gắn event listener của script đo**: `npcWebAudioPlayer.ts` gắn `source.onended = finish` (resolve Promise và chạy microtask gọi `source2.start()` ngay), trong khi script đo gắn `addEventListener('ended')` **sau** nên `audit.active.delete(source1)` chạy sau khi `source2` đã được thêm vào `Set`.
  3. **Điểm cần củng cố nhỏ (Defensive Hardening):** `playHtmlAudio` (`useNpcConsultationSession.ts:190`) hiện chưa gọi `npcWebAudioPlayer.stop()` và `audioElRef.current?.pause()` ngay trước khi gán `audioElRef.current = audio`. Nên thêm 2 dòng guard này ở Chặng 2 để loại trừ 100% rủi ro overlap ngay cả khi chuyển nhanh giữa Web Audio và HTMLAudio.

---

## 7. Audit cấu hình `VITE_NPC_TTS_MODE=hybrid`

| Câu hỏi kiểm toán | Kết quả thực tế trên repo |
| :--- | :--- |
| **1. Chạy `npm --prefix FE run build` bình thường (không set env shell)?** | Ra **`'legacy'`**! Vì `FE/.env` hiện không có `VITE_NPC_TTS_MODE`, `FE/.env.production` không tồn tại, và `npcTtsConfig.ts:3` đặt `DEFAULT_NPC_TTS_MODE = 'legacy'`. |
| **2. Chạy build với `VITE_NPC_TTS_MODE=hybrid`?** | Ra **`'hybrid'`** (nhúng tĩnh vào `FE/dist/assets/index-*.js` lúc build Vite). |
| **3. Production Plesk hiện đang chạy mode nào?** | **PARTIAL / CHƯA XÁC MINH TRỰC TIẾP TRÊN SERVER PLESK** (repo chỉ có `vercel.json`, không có file cấu hình CI/CD Plesk trong repo; không tự suy đoán). |
| **4. Có cần thêm `VITE_NPC_TTS_MODE=hybrid` vào file cấu hình không?** | **CÓ.** Nên tạo `FE/.env.production` (hoặc thêm vào `FE/.env`) với `VITE_NPC_TTS_MODE=hybrid` để mọi lệnh `npm --prefix FE run build` đều mặc định build chế độ Hybrid (vẫn hỗ trợ rollback runtime không cần rebuild qua `?npcTtsMode=legacy` hoặc `localStorage`). |

---

## 8. Kế hoạch Implementation Chặng 2 (Chờ duyệt — Chưa triển khai)

1. **Step 1 — Guard chống overlap trong `useNpcConsultationSession.ts`:** Thêm `npcWebAudioPlayer.stop()` + dừng `audioElRef.current` cũ trong `playHtmlAudio` (2 dòng, rủi ro rất thấp).
2. **Step 2 — Sinh bộ WAV Demo Additive (`/tts/pregen-demo/`):**
   - Viết script `scripts/v28/generate_agri_demo_wavs.mjs` dùng đúng voice `vi_VN-vais1000-medium` sinh `~105` WAV vào `FE/public/tts/pregen-demo/` + `FE/public/tts/pregen-demo/manifest.json` (tuyệt đối không chạm `FE/public/tts/pregen/`).
   - Cập nhật `npcHybridTtsEngine.ts` (~15 dòng) để nạp thêm `/tts/pregen-demo/manifest.json` **chỉ khi `isAgriDemoShowcaseEnabled()` = `true`**.
3. **Step 3 — Chuẩn hóa cấu hình Hybrid:** Thêm `VITE_NPC_TTS_MODE=hybrid` vào `FE/.env.production` (và/hoặc `FE/.env` theo quyết định của bạn).
4. **Step 4 — Kiểm thử lại 14 gian (4 Pregen + 10 Demo) trên Chrome Profile mới (Cold & Warm):** Đo đầy đủ Playback API Start, inter-sentence gap, pause/resume offset, `0` ONNX download trên 10 gian demo, và `maxConcurrentPlaying === 1` với instrumentation đúng thứ tự.
5. **Step 5 — Regression 100 gian Production (`?demoAgri=1` OFF):** Xác minh 85 WAV gốc giữ nguyên SHA-256, `0` request tới `pregen-demo`, P1 & P2-01 không regression.
6. **Step 6 — FE Build, Full 161+ Unit Tests & Báo cáo Chặng 2.**

---

## 9. Tiêu chí nghiệm thu đề xuất cho Chặng 2 (Acceptance Criteria)

- `maxConcurrentPlaying === 1` (0 audio overlap).
- 4/4 gian pregen (`#1, #2, #11, #21`) & 10/10 gian demo (`#3..#10, #12, #13`) đều phát được audio thật (`0` ONNX tải khi WAV hợp lệ có sẵn).
- 10 gian demo Cold Start (API playback start): kỳ vọng **`< 3,500 ms`** (giảm >90% so với `39,548 ms` hiện tại); Warm Start: **`< 1,000 ms`**; Inter-sentence gap: **`< 150 ms`**.
- Pause/resume đúng `offsetSec > 0`, chuyển gian dừng ngay (`activeAfterExit === 0`), fallback Piper vẫn chạy khi cố tình truyền chunk không có trong manifest.
- 85 WAV cũ + `FE/public/tts/pregen/manifest.json` giữ nguyên 100% hash.
- FE build (`npm --prefix FE run build` không cần env shell) PASS ở chế độ `hybrid`; 100% unit tests FE/BE PASS; `0` Console/Runtime/404; không chạm Production DB.

---

## 10. Quyết định cần bạn phê duyệt trước khi sang Chặng 2

1. **Phương án Audio:** Duyệt **Option A** (sinh thêm bộ WAV nông sản demo vào thư mục riêng `FE/public/tts/pregen-demo/`, ~18–19 MB static, chỉ tải khi `?demoAgri=1`) hay **Option B**?
2. **Cấu hình `VITE_NPC_TTS_MODE=hybrid`:** Duyệt thêm vào `FE/.env.production` (hoặc cả `FE/.env`) để `npm --prefix FE run build` mặc định luôn build chế độ Hybrid?
3. **Tiến hành Chặng 2 ngay** sau khi duyệt 2 mục trên, hay giữ nguyên và chuyển sang **P2-03**?
