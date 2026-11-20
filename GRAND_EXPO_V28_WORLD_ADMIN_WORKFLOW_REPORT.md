# GRAND EXPO WORLD V28 — FINAL WORLD & ADMIN WORKFLOW UPGRADE REPORT

> **Ngày báo cáo:** 20/11/2026  
> **Repository:** `https://github.com/Quocsieu/exhibition.git`  
> **Workspace Windows:** `E:\Lập trình\MatBaoWS\exhibition`  
> **Branch:** `grand-expo-v28-dev` (không push, không merge, không deploy)  
> **Chế độ triển khai:** Audit-First · Minimal Changes · Preserve V27.5 · Strict Scope

---

## 1. Bối cảnh & Mục tiêu nâng cấp

Đợt nâng cấp cuối cùng này tập trung kiểm tra (Audit-First) và hoàn thiện 5 nhóm yêu cầu trọng tâm của **Grand Expo World V28** mà không xây lại hệ thống hay làm ảnh hưởng tới phiên bản tham chiếu **V27.5**:

1. Bảo toàn trọn vẹn phong cách đồ họa, 6 archetype gian hàng GLB, nhân vật avatar, nhân viên tư vấn NPC, animation, đổi tên, bố cục hai dãy hình chữ U đối diện (`10 khu × 10 gian = 100 gian`, 5 khu Trái + 5 khu Phải) và biên di chuyển thích ứng đã đạt ở các phase trước.
2. Hiển thị rõ **Tên doanh nghiệp** trên bảng hiệu gian hàng và **Tên + Giá sản phẩm** ngay trên gian hàng 3D đối với các vị trí có sản phẩm thật (không tự bịa giá, không hiển thị sản phẩm giả trên slot trống).
3. Cho phép bấm trực tiếp vào **Bảng sơ đồ 3D kế thừa V27.5 (`directory_monument_v27_4.glb`)** (hoặc nút `Danh bạ / Bản đồ` trên HUD) để mở **Sơ đồ triển lãm 2D tương tác**, hiển thị đầy đủ các khu chữ U, gian hàng, lối đi, vị trí người chơi thời gian thực và hỗ trợ bấm chọn khu/gian để di chuyển nhanh (teleport an toàn).
4. Tinh gọn giao diện **Admin V28 (`/admin/v28`)**: ẩn hoàn toàn các khối kỹ thuật NPC/AI (`NPC AUDIO CACHE`, `TRẠNG THÁI AI CONSULTANT`, tab `🎙️ NPC & Audio Cache`), đồng thời **giữ nguyên 100% logic backend** Gemini TTS, audio cache, AI Chat và luồng tự động tái tạo audio khi xuất bản.
5. Thống nhất luồng **Tạo không gian triển lãm** trong Admin V28: nhập số khu + số gian/khu → chọn nguồn sản phẩm (`Catalog` / `URL Website doanh nghiệp` / `File Excel .xlsx`) → bấm `Tạo không gian triển lãm` → **Popup tiến trình thời gian thực gắn kết API backend thật** → tự động phân loại & phân bổ sản phẩm hợp lệ (tối đa 6 slot/gian, đúng doanh nghiệp, không trộn chéo, không bịa sản phẩm) → xem trước 2D → quản lý gian trống đỏ / xóa gian an toàn → `Xác nhận xuất bản`.

---

## 2. Kết quả Audit ban đầu (Trước khi chỉnh sửa)

| Hạng mục | Trạng thái trước khi sửa | Hành động |
| --- | --- | --- |
| PHẦN A — Kế thừa V27.5 (6 GLB, Avatar, NPC, Đổi tên, Không trùng bảng trắng) | **PASS** | Giữ nguyên, không sửa |
| PHẦN B — Bố cục 2 dãy chữ U đối diện (`10 khu × 10 gian = 100 gian`) & giới hạn di chuyển | **PASS** | Giữ nguyên, không sửa |
| PHẦN C — Hiển thị Tên & Giá sản phẩm trực tiếp trên gian hàng 3D | **PARTIAL** (chỉ có bảng tên công ty & ảnh sản phẩm, chưa có nhãn tên + giá trên bục 3D) | Bổ sung nhãn CanvasTexture 3D phía trên khung ảnh sản phẩm |
| PHẦN D — Bấm bảng sơ đồ 3D V27.5 mở Sơ đồ 2D tương tác + vị trí người chơi + teleport | **PARTIAL** (`directory_monument_v27_4.glb` chưa có click handler; bản đồ 2D chưa vẽ hộp khu chữ U và vị trí người chơi) | Bổ sung click handler + nâng cấp SVG Map 2D |
| PHẦN E — Tinh gọn Admin V28 (ẩn khối NPC Audio Cache / AI Consultant trên UI) | **FAIL** (vẫn hiển thị 2 KPI kỹ thuật + tab `🎙️ NPC & Audio Cache`) | Ẩn UI kỹ thuật, thay bằng KPI Gian có SP / Gian trống, giữ nguyên backend |
| PHẦN F & G — Luồng Tạo không gian hợp nhất + Chọn nguồn + Popup tiến trình thật + Tự phân bổ | **PARTIAL** (chưa có chọn nguồn sản phẩm hợp nhất, chưa có Popup tiến trình từng bước gắn API thật, chưa có tự phân bổ vào slot) | Bổ sung selector 3 nguồn + Popup 5 bước gắn API thật + auto-allocate |

---

## 3. Bảo vệ V27.5 & Phạm vi thay đổi (Strict Scope)

- **Branch làm việc:** `grand-expo-v28-dev`.
- **Database V27.5 (`BE/data/expo.db`):** Không bị chỉnh sửa. Kết quả đối chiếu SHA-256 trước và sau QA đều giữ nguyên `8a5a901e2f189035ee3abe698dc19e024b3374fbb5c7ce0c41d8c1060fcceb76` (`v275DbUnchanged: true`).
- **Route mặc định & V27.5 (`/` · `/?world=v27` · `/admin`):** Không thay đổi bất kỳ tệp nào thuộc V27.5.
- **Asset 3D (`.glb`, geometry, rig, animation):** Không chỉnh sửa bất kỳ tệp model 3D nào.
- **Backend NPC / TTS / AI Chat (`BE/`):** Không sửa bất kỳ tệp nào trong `BE/` (0 thay đổi backend).
- **Tổng phạm vi thay đổi:** Chỉ **7 tệp Frontend** (`+532 / -57` dòng).

---

## 4. Danh sách tệp đã chỉnh sửa

| STT | Đường dẫn tệp | Thay đổi chính |
| --- | --- | --- |
| 1 | [DynamicBooth3D.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx) | Bổ sung `PRODUCT_LABEL_GEOM` & `createProductLabelTexture(name, price, currency)` hiển thị Tên + Giá sản phẩm phía trên khung ảnh 3D (`position={[0, 0.44, 0.04]}`) cho các slot có sản phẩm thật; tự động `dispose()` khi unmount. |
| 2 | [V27VisualKit.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/V27VisualKit.tsx) | Gắn sự kiện click (`onOpenDirectoryMap`) và con trỏ chuột tương tác cho mô hình bảng chỉ dẫn `directory_monument_v27_4.glb`. |
| 3 | [DynamicExhibitionScene.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicExhibitionScene.tsx) | Truyền callback `onOpenDirectoryMap` từ scene xuống `V27VisualKit`. |
| 4 | [DynamicExhibitionPage.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/DynamicExhibitionPage.tsx) | Nối state `directoryOpenNonce` giữa sự kiện click bảng sơ đồ 3D và HUD 2D. |
| 5 | [DynamicWorldHud.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/v28/DynamicWorldHud.tsx) | Nâng cấp Sơ đồ triển lãm 2D SVG: hiển thị khung khu chữ U, mã/tên khu bấm chọn được, hình chiếu gian hàng xoay đúng góc, chấm đỏ vị trí người chơi thời gian thực và chú thích trực quan. |
| 6 | [AdminV28Page.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/pages/AdminV28Page.tsx) | Gỡ bỏ hoàn toàn khối `NPC AUDIO CACHE`, `TRẠNG THÁI AI CONSULTANT` và tab `🎙️ NPC & Audio Cache` khỏi giao diện quản trị; thay thế bằng KPI `Gian đã có sản phẩm` và `Gian trống (Chưa có SP)`. |
| 7 | [ExhibitionConfigurator.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExhibitionConfigurator.tsx) | Bổ sung bộ chọn nguồn sản phẩm (`Catalog` / `URL Website` / `Excel .xlsx`), Popup tiến trình 5 bước gắn kết API backend thật, khóa chống bấm đúp, và cơ chế tự động phân bổ sản phẩm vào tối đa 6 slot/gian theo doanh nghiệp. |

---

## 5. Chi tiết triển khai PHẦN A — Kế thừa V27.5 (PASS — Giữ nguyên)

- 6 archetype gian hàng GLB chuẩn V27.4/V27.5 (`signature_ring`, `organic_flow`, `grand_portal`, `wave_pavilion`, `gallery_arch`, `dynamic_frame`) được tải và nhân bản bằng shared geometry/material.
- Nhân vật khách tham quan (`<AvatarCharacter />`), nhân viên tư vấn (`<SalesAssistantNpc />`), cơ chế đổi tên khách tham quan và bảng tư vấn 2 tab `Giới thiệu | Chat` hoạt động nguyên vẹn.
- Bảng thông tin màu trắng trùng lặp bên phải màn hình tiếp tục không hiển thị trong V28.

---

## 6. Chi tiết triển khai PHẦN B — Bố cục chữ U hai dãy & Giới hạn di chuyển (PASS — Giữ nguyên)

- Hỗ trợ linh hoạt từ 1 khu đến `10 khu × 10 gian = 100 gian` chia đều 2 dãy đối diện (5 khu bên Trái mở về hướng Đông, 5 khu bên Phải mở về hướng Tây) với đại lộ trung tâm rộng ở giữa.
- Vùng đi lại (`walkableRegions[]`), hộp va chạm gian hàng xoay theo góc thực tế và giới hạn camera/teleport tự động co giãn theo kích thước thực tế của bản triển lãm.

---

## 7. Chi tiết triển khai PHẦN C — Hiển thị Tên Doanh nghiệp, Tên & Giá Sản phẩm 3D

- **Tên doanh nghiệp & Mã gian:** Hiển thị sắc nét trên bảng hiệu phía trên mỗi gian hàng (`createBoothSignTexture`).
- **Tên & Giá sản phẩm 3D:**
  - Chỉ dựng nhãn khi `slot.product` tồn tại (tuyệt đối không dựng sản phẩm giả ở slot trống).
  - Nếu `product.price > 0`, hiển thị định dạng tiền tệ chuẩn tiếng Việt (ví dụ: `6.850.000 VND`, `18.900.000 VND`). Nếu không có giá (`price <= 0`), hiển thị rõ `"Liên hệ báo giá"`, không tự bịa số liệu.
  - **Tinh chỉnh vị trí thực tế sau kiểm tra ảnh chụp:** Ban đầu nhãn đặt dưới khung ảnh (`y = -0.4`) bị trụ bục trắng che một phần; đã điều chỉnh lên phía trên khung ảnh (`position={[0, 0.44, 0.04]}`) giúp 100% tên và giá sản phẩm nổi bật, không bị che khuất.

---

## 8. Chi tiết triển khai PHẦN D — Bảng sơ đồ 3D V27.5 & Sơ đồ 2D tương tác

- Bảng chỉ dẫn 3D `directory_monument_v27_4.glb` tại quảng trường trung tâm được gắn sự kiện `onClick` gọi `onOpenDirectoryMap`.
- Khi mở (qua click bảng 3D hoặc nút `Danh bạ / Bản đồ` trên thanh HUD), giao diện hiển thị **Sơ đồ 2D SVG trực quan** dựng trực tiếp từ dữ liệu tọa độ thật (`zones`, `booths`, `worldWidth`, `worldDepth`):
  - Khung vùng chữ U và nhãn từng khu có thể bấm trực tiếp để lọc danh sách khu.
  - Từng gian hàng vẽ đúng tọa độ và góc xoay (`rotationY`), đổi màu nổi bật khi đang chọn.
  - Chấm đỏ hiển thị **vị trí thời gian thực của người chơi** kèm chú thích `🔴 Vị trí của bạn · Bấm khu hoặc gian để chọn/đi tới`.
  - Bấm vào gian hàng trên sơ đồ 2D hoặc danh sách sẽ di chuyển nhanh (teleport) người chơi tới điểm đứng an toàn phía trước gian hàng.

---

## 9. Chi tiết triển khai PHẦN E — Tinh gọn giao diện Admin V28

- **Đã loại bỏ khỏi UI `/admin/v28`:**
  - Thẻ KPI `NPC AUDIO CACHE`.
  - Thẻ KPI `TRẠNG THÁI AI CONSULTANT`.
  - Tab quản trị kỹ thuật `🎙️ NPC & Audio Cache`.
- **Thay thế bằng thông tin vận hành thực tế cho quản trị viên:**
  - Thẻ KPI `Gian đã có sản phẩm` và `Gian trống (Chưa có SP)`.
- **Bảo toàn 100% Backend:** Toàn bộ endpoint `/api/v28/npc/*`, dịch vụ Gemini TTS (`gemini-3.8-flash-tts`), audio cache, AI Chat và cơ chế tự sinh/dọn cache audio khi xuất bản vẫn giữ nguyên và vượt qua bộ test `v28NpcAudioAndChat.test.ts`.

---

## 10. Chi tiết triển khai PHẦN F — Luồng Tạo không gian hợp nhất & Popup tiến trình thật

Trong [ExhibitionConfigurator.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/components/adminV28/ExhibitionConfigurator.tsx):

1. **Nhập quy mô:** Người dùng nhập tự nhiên `Số khu (1–20)` và `Số gian / khu (1–30)` (controlled string inputs, không ép về `1` khi xóa rỗng).
2. **Chọn nguồn dữ liệu sản phẩm ngay trong 1 màn hình:**
   - `📚 Dùng Catalog hiện có` (tự lấy toàn bộ sản phẩm đã có trong DB V28).
   - `🔗 Nhập URL Website doanh nghiệp` (nhập URL + chọn doanh nghiệp → gọi `POST /api/v28/imports/website` → tự nhập sản phẩm thật trước khi tạo không gian).
   - `📊 Tải file Excel (.xlsx)` (chọn file `.xlsx` → gọi `v28Api.uploadExcel` + `v28Api.commitImport` → đưa sản phẩm vào Catalog trước khi tạo không gian).
3. **Popup tiến trình 5 bước gắn kết API thật (không dùng timer giả):**
   - Bước 1: Kiểm tra thông số cấu hình & khóa chống bấm đúp (`creating`).
   - Bước 2: Chuẩn bị nguồn dữ liệu sản phẩm (Catalog / Quét URL Website / Nhập Excel).
   - Bước 3: Phân nhóm danh mục & chuẩn bị doanh nghiệp.
   - Bước 4: Gọi backend sinh bố cục khu chữ U hai dãy đối diện (`v28Api.generateVersion`).
   - Bước 5: Tự động phân bổ sản phẩm hợp lệ vào các gian hàng (`v28Api.updateBoothPlacement`, tối đa 6 slot/gian).
4. Sau khi hoàn tất, Popup cho phép đóng và xem ngay **Sơ đồ 2D xem trước** kèm thống kê số gian có sản phẩm / gian trống.

---

## 11. Chi tiết triển khai PHẦN G — Quy tắc phân bổ sản phẩm & Quản lý gian trống

- **Không bịa sản phẩm:** Chỉ phân bổ sản phẩm thật từ nguồn đã chọn.
- **Tối đa 6 sản phẩm / gian hàng:** Tự động chia theo nhóm tối đa 6 slot (`slot-1` đến `slot-6`).
- **Không trộn chéo doanh nghiệp:** Mỗi gian hàng chỉ nhận sản phẩm thuộc cùng một `companyId`.
- **Đánh dấu gian trống rõ ràng:** Các gian hàng không có sản phẩm được tô viền/nền đỏ (`🔴 Chưa có sản phẩm`) trên cả sơ đồ 2D xem trước và danh sách, đồng thời hỗ trợ nút **Xóa gian hàng** an toàn kèm hộp thoại xác nhận trước khi xuất bản (`Xác nhận xuất bản`).

---

## 12. Quy trình Draft vs. Published (Không ghi đè sớm)

- Khi bấm `Tạo không gian triển lãm`, hệ thống luôn tạo một phiên bản **Bản nháp (`draft`)** mới (ví dụ `v26`, `v27`) để Admin kiểm tra sơ đồ 2D, chỉnh sửa hoặc xóa gian trống.
- Không gian 3D công khai (`/?world=dynamic`) chỉ cập nhật sau khi Admin chủ động bấm **`Xác nhận xuất bản`**.

---

## 13. Kết quả kiểm thử Build & Typecheck

| Lệnh kiểm tra | Kết quả | Chi tiết |
| --- | --- | --- |
| `npm run typecheck -w BE` | **PASS** | 0 lỗi TypeScript |
| `npm run typecheck -w FE` | **PASS** | 0 lỗi TypeScript |
| `npm run build -w BE` | **PASS** | Biên dịch sạch |
| `npm run build -w FE` | **PASS** | `709 modules transformed`, build production thành công |

---

## 14. Kết quả kiểm thử tự động (Vitest)

Lệnh chạy: `npx vitest run BE/src/__tests__/v28AdminCreatorAndULayout.test.ts BE/src/__tests__/v28NpcAudioAndChat.test.ts FE/src/__tests__/v28NavigationBounds.test.ts`

- **Tổng kết:** **3/3 test files PASS, 8/8 test cases PASS**.
  - `BE/src/__tests__/v28AdminCreatorAndULayout.test.ts`: PASS (sinh bố cục 10 khu × 10 gian = 100 gian chữ U hai dãy đối diện, kiểm tra xóa gian trống, kiểm tra website import).
  - `BE/src/__tests__/v28NpcAudioAndChat.test.ts`: PASS (xác nhận toàn bộ backend NPC Audio Cache, WAV validation, Range streaming, AI Chat vẫn nguyên vẹn 100%).
  - `FE/src/__tests__/v28NavigationBounds.test.ts`: PASS (kiểm tra biên di chuyển và va chạm thích ứng).

---

## 15. Kết quả kiểm thử trình duyệt trực tiếp (Live Headless Chrome CDP)

Script kiểm thử đầu-cuối (`qa_final_workflow.mjs`) chạy trên server thực tế (`http://localhost:5173` + `http://localhost:4000`):

```json
{
  "adminAudit": {
    "npcAudioCacheHidden": true,
    "aiStatusHidden": true,
    "hasSourceSelector": true
  },
  "popupCheck": {
    "popupCompleted": true,
    "doneStepCount": 7
  },
  "mapCheck": {
    "has2dSvgMap": true,
    "hasPlayerLegend": true,
    "zoneLabelsInSvg": 1
  },
  "consoleErrors": [],
  "pageErrors": [],
  "v275DbUnchanged": true
}
```

- **0 lỗi Console (`consoleErrors: []`)**.
- **0 lỗi Page Exception (`pageErrors: []`)**.
- **Đã kiểm tra trực quan 4 ảnh chụp màn hình thực tế:**
  1. `final_01_progress_popup.png`: Popup tiến trình 5 bước hoàn tất màu xanh rõ ràng.
  2. `final_02_admin_2d_preview.png`: Admin V28 tinh gọn (không còn NPC Audio Cache / AI Consultant), hiển thị đầy đủ 10 khu × 10 gian = 100 gian chữ U 2 dãy đối diện + đánh dấu đỏ gian trống.
  3. `final_03_2d_map_teleport.png`: Sơ đồ 2D SVG hiển thị khu chữ U, gian hàng, chấm đỏ vị trí người chơi và chú thích.
  4. `final_04_3d_product_name_price.png`: Nhãn 3D `Trạm Cảm Biến Môi Trường ... · 6.850.000 VND` và `Kính Hỗ Trợ Kỹ Thuật Từ X... · 18.900.000 VND` hiển thị sắc nét phía trên khung ảnh sản phẩm, không bị bục trắng che khuất; tên công ty `Aether Technologies Corp.` rõ ràng; các bục trống không hiển thị sản phẩm giả.

---

## 16. Kiểm tra hồi quy (Regression Check)

- **V27.5 (`/` & `/?world=v27`):** Không bị tác động, `BE/data/expo.db` giữ nguyên mã băm SHA-256.
- **Admin V27.5 (`/admin`):** Không thay đổi mã nguồn.
- **NPC Audio & AI Chat V28:** Toàn bộ API, audio cache, WAV validator và UI bảng tư vấn `Giới thiệu | Chat` trong 3D không bị ảnh hưởng.

---

## 17. Hiệu năng & Tài nguyên 3D

- Nhãn tên & giá sản phẩm 3D (`createProductLabelTexture`) chỉ được khởi tạo cho các gian hàng đang ở **Ring 0 (gần người chơi)** và chỉ cho các slot có sản phẩm thật; tất cả `THREE.CanvasTexture` đều gọi `.dispose()` trong cleanup `useEffect`, không gây rò rỉ bộ nhớ GPU.
- Dùng chung `PRODUCT_LABEL_GEOM` tĩnh trên toàn bộ các gian hàng để giảm draw-call và cấp phát geometry.

---

## 18. An toàn & Bảo mật

- Không bổ sung hay nới lỏng bất kỳ quy tắc xác thực/SSRF/rate-limit nào trên backend.
- Khóa nút tạo không gian (`disabled={creating}`) ngăn lỗi double-submit tạo trùng phiên bản draft.

---

## 19. Những hạng mục chưa thể kiểm chứng trực tiếp (Trung thực QA)

- **LIVE GEMINI TTS/CHAT NOT VERIFIED:** Không thực hiện gọi trực tiếp tới live external Gemini API trong đợt QA này (kiểm chứng qua unit/integration test backend `v28NpcAudioAndChat.test.ts` và không thay đổi bất kỳ tệp backend nào).
- **REAL DEVICE NOT TESTED:** Chỉ kiểm thử trên trình duyệt Chrome desktop / Headless Chrome CDP trên Windows; chưa kiểm thử trực tiếp trên thiết bị điện thoại/máy tính bảng vật lý.

---

## 20. Hướng dẫn nghiệm thu nhanh trên Localhost

1. **Không gian 3D V28:** `http://localhost:5173/?world=dynamic`
   - Bấm vào bảng chỉ dẫn 3D gần quảng trường (hoặc nút `Danh bạ / Bản đồ`) để mở Sơ đồ 2D tương tác, kiểm tra chấm đỏ vị trí người chơi và bấm chọn gian hàng để di chuyển nhanh.
   - Tiến lại gần gian hàng có sản phẩm để quan sát Tên doanh nghiệp trên bảng hiệu và Tên + Giá sản phẩm ngay trên bục 3D.
2. **Quản trị Admin V28:** `http://localhost:5173/admin/v28`
   - Kiểm tra giao diện đã ẩn hoàn toàn `NPC AUDIO CACHE`, `TRẠNG THÁI AI CONSULTANT` và tab `🎙️ NPC & Audio Cache`.
   - Thử nhập `Số khu` / `Số gian mỗi khu`, chọn nguồn (`Catalog` / `URL Website` / `Excel`), bấm `Tạo không gian triển lãm` để xem Popup tiến trình 5 bước, kiểm tra sơ đồ 2D xem trước, thử xóa gian trống màu đỏ và bấm `Xác nhận xuất bản`.
3. **Đối chiếu V27.5 nguyên bản:** `http://localhost:5173/?world=v27` và `http://localhost:5173/admin`.

---

## 21. Trạng thái Git & Commit cục bộ

- Chỉ commit cục bộ trên nhánh `grand-expo-v28-dev` gồm đúng **7 tệp Frontend** đã chỉnh sửa và tệp báo cáo này (`GRAND_EXPO_V28_WORLD_ADMIN_WORKFLOW_REPORT.md`).
- Không đưa `BE/data/` vào git commit.
- **Không push, không merge, không deploy.**

---

## 22. Rủi ro còn lại & Lưu ý vận hành

- Khi xuất bản phiên bản mới có số lượng gian hàng lớn (ví dụ 100 gian), các gian chưa được gán sản phẩm sẽ hiển thị ở trạng thái trống (màu đỏ trong Admin) cho tới khi Admin xóa bớt hoặc nhập thêm sản phẩm qua URL Website / Excel.
- Cần đảm bảo biến môi trường `GEMINI_API_KEY` được cấu hình trên máy chủ khi muốn sinh mới giọng đọc Gemini TTS trực tuyến cho các gian hàng vừa cập nhật nội dung.

---

## 23. Kết luận tổng thể

Toàn bộ yêu cầu của đợt **GRAND EXPO WORLD V28 — FINAL WORLD & ADMIN WORKFLOW UPGRADE** (PHẦN A → PHẦN G) đã được kiểm tra theo quy trình Audit-First, triển khai gọn nhẹ đúng phạm vi (7 tệp FE, 0 thay đổi V27.5, 0 thay đổi model 3D, 0 thay đổi backend NPC/AI), vượt qua toàn bộ kiểm thử Typecheck, Build, Vitest và Live Browser CDP với 0 lỗi console/runtime. Hệ thống sẵn sàng để người dùng nghiệm thu trực tiếp trên localhost.
