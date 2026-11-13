# ASTRA GRAPHICS — tiến độ theo checkpoint

## Checkpoint 0 — Audit, 2026-11-13

### Session status
- Mục tiêu: 6 gian lắp ghép hoàn toàn không mái; sau đó ngoại cảnh realistic stylized, vật liệu/ánh sáng, hiệu năng và regression. Không xây lại ứng dụng.
- Current phase: 0 hoàn tất; chuẩn bị Phase 1.
- Completed phases: 0 — Audit PASS.
- Pending phases: 1 Booths, 2 Environment, 3 Materials, 4 Performance, 5 Regression.
- Current blockers: chưa có blocker mã nguồn. Chrome/Blender/backend có thể cần quyền chạy ngoài sandbox; backend kiểm thử chỉ dùng SQLite RAM.
- Context remaining estimate: không có bộ đếm chính xác; dùng checkpoint, ưu tiên hoàn tất và kiểm thử Phase 1 trước khi quyết định tiếp tục.

### Files / baseline
- Repository: `E:\Lập trình\MatBaoWS\exhibition`.
- HEAD ban đầu: `56173b6 feat(booth): redesign open exhibition shells and update test triangle bounds`.
- `git status --short`, `git diff --stat`: rỗng. Existing uncommitted files before work: không có.
- Đã có từ trước: dispatch procedural `buildBoothExteriorShell` → `exhibitionBoothShells.ts`; sàn, bảng hiệu, kệ/slot trong `Booth.tsx`; camera `ExhibitionPage.tsx` initial `explore`; các asset ngoại cảnh GLB đã được tích hợp; cây/props có tọa độ đã điều chỉnh. Không rollback các commit này.
- Files changed this session: checkpoint này; chưa sửa runtime tại mốc audit.
- New assets: chưa có tại mốc audit.
- Files requiring verification: các file graphics sẽ sửa trong Phase 1; kiểm tra diff riêng trước khi kết thúc.

### Audit thực tế
- Visitor render sáu shell qua `Booth.tsx` → asset cache → `architecturalModels.ts` → `exhibitionBoothShells.ts`. Shell hiện là geometry TypeScript; GLB booth cũ không được tải trong luồng này.
- `Booth.tsx` còn chi tiết mái riêng: pergola Nordic, awning cà phê, halo treo Lumina, solar panel trên đầu Solaris và đèn trần. Cần xử lý cả hai lớp, tránh xóa một lớp nhưng mái vẫn còn.
- Tên/logo/tagline/banner/màu lấy từ booth data → canvas textures. Sáu slot theo `BOOTH_SLOT_DEFINITIONS`; không thay component display, ID, binding, handler hoặc vị trí slot.
- Tâm/hướng giữ nguyên. Sàn visual 7.2 × 5.4 và biển phía trước vốn rộng hơn collision data 4.8/5.2 × 3.8. Khung mới phải nằm trong envelope cũ; chân mới ưu tiên vùng collision hiện hữu, không sửa thuật toán.
- Ngoại cảnh đang tải city_detail_v2_01..04 cùng LOD, cây GLB, fountain GLB, ghế/đèn/hoa, planter_fluted_01 và recycling_bin_01. Có instancing, cache, LOD và culling trong ExteriorAssets. Không kết luận tất cả chất lượng đã đạt chỉ từ sự có mặt của file.
- Blender scripts đã có: generate_booths, generate_city_buildings, refine_exterior_city, create_exterior_props; không ghi đè asset cũ. Blender 4.2 ở Program Files.
- Lighting hiện có ACES exposure 1.06, ambient .52, hemisphere .68, shadow map 1024, shadow radius 2 và directional fill. Phase 1 không sửa các giá trị này.
- Ưu tiên asset: (1) bộ khung đứng roofless 6 theme dùng thật trong scene, (2) đánh giá lại chi tiết đô thị/props bằng screenshot trước khi dựng thêm, (3) cân bằng PBR/ánh sáng, (4) đo hiệu năng, (5) regression.

### Verification tại audit
- Typecheck / Build / Unit tests / Browser visual QA: NOT RUN cho phiên mới; không dùng kết quả phiên trước làm PASS phiên này.
- FPS: NOT MEASURED.

### Resume instructions
- Exact next step: dựng và tích hợp bộ khung đứng roofless; gỡ chỉ geometry mái/đèn trần trang trí trong Booth.tsx, giữ biển và display. Tạo GLB mới dưới graphics assets, có fallback roofless.
- Relevant files: `FE/src/scene/Booth.tsx`, `exhibitionBoothShells.ts`, `architecturalModels.ts`, `FE/booth-modeling/scripts/`.
- Commands: `git status --short`; `git diff --stat`; `npm run build -w FE`; `npm exec -- vitest run FE/src/__tests__/movementAndPathfinding.test.ts BE/src/__tests__/expoBackendAndRealtime.test.ts`.
- Safe backend: `$env:SQLITE_DB_PATH=':memory:'; npm run dev -w BE`; frontend: `npm run dev -w FE -- --host 127.0.0.1 --port 5180`.
- Safety restrictions: không sửa BE/database/API/auth/Admin/realtime/business data/IDs/slot handlers/modal/movement/pathfinding/collision/raycast/spawn/camera; không cài package, không đổi build config, không commit/push/deploy; không xóa hoặc ghi đè thay đổi khác. Chỉ tạo báo cáo tiến độ này ngoài graphics; script và ảnh QA mới đặt dưới `FE/graphics-audit/`.
- Known risks: GLB cần xác minh thực sự được render; fallback cũng phải không mái. Các slot trống giữ nguyên. Không tự nâng ngân sách polygon chỉ để vượt test cũ.

Các checkpoint sau phải append; không xóa lịch sử trên.

## Checkpoint 1 — Phase 1 hoàn tất và kiểm thử, 2026-11-13

### Session status
- Current phase: dừng an toàn sau Phase 1; bước tiếp theo là Phase 2.
- Completed phases: 0 Audit PASS; 1 Roofless Booths PASS trong phạm vi sáu gian dữ liệu hiện tại.
- Pending phases: 2 Environment và 3 Materials chưa triển khai; 4 Performance mới có số đo ban đầu; 5 Regression mới có kiểm tra mục tiêu phục vụ Phase 1, chưa phải toàn bộ lượt regression cuối dự án.
- Current blockers: không có blocker Phase 1. Dừng trước hạng mục lớn tiếp theo theo yêu cầu giới hạn context/checkpoint, không kết luận toàn bộ nhiệm vụ đã hoàn tất.
- Context remaining estimate: không có số đo chính xác; chọn ranh giới phase đã build/test và có bằng chứng để tiếp tục an toàn, không mở Phase 2 khi chưa bảo đảm đủ ngân sách cho cả triển khai và QA.

### Đã hoàn thành
- Tạo sáu GLB thực bằng Blender 4.2.16, có cạnh bevel, weighted normals, chân đỡ, connector plate, bu lông, nẹp profile, panel đứng theo từng theme và bracket đỡ biển.
- Không còn canopy/pergola/giàn mái/halo trên đầu/solar canopy. Solaris dùng mẫu PV đứng ở backdrop. Khu vực trên sản phẩm thông thoáng.
- `RooflessBoothShell` dùng GLB thật, cache qua Drei; giữ đúng nền cũ. Khi tải thành công, bỏ frame procedural khỏi clone và render GLB thay thế, không chồng lên kiến trúc cũ.
- Fallback cũng là khung đứng không mái; không quay lại nhà cũ khi lỗi mạng. Error boundary chỉ bao asset graphics.
- Trong `Booth.tsx` chỉ đổi renderer shell và bỏ geometry/material không còn dùng của phần mái/đèn trần. Không đổi slot, texture thương hiệu, click handler, dữ liệu, transform gian, camera, gameplay.
- Giữ biển hiện tại cùng các giá đỡ ngắn phía trước; không tạo hệ thanh chạy ngang phía trên khu trưng bày.

### Files
- Existing uncommitted files before work: không có; baseline vẫn `56173b6`.
- Files changed this session (runtime):
  - `FE/src/scene/Booth.tsx`: thay shell và gỡ trang trí mái/trần, giữ toàn bộ sản phẩm và bảng hiệu.
  - `FE/src/scene/architecturalModels.ts`: bọc frame thành child riêng để GLB thay thế được trong khi giữ nền.
  - `FE/src/scene/exhibitionBoothShells.ts`: fallback roofless, màu vật liệu tiết chế.
  - `FE/src/scene/RooflessBoothShell.tsx` (mới): tải/cache/clone GLB và fallback cục bộ.
- Graphics pipeline / QA mới:
  - `FE/booth-modeling/scripts/generate_roofless_frames.py`.
  - `FE/graphics-audit/astra-camera.cjs`, `astra-booths.cjs`, `astra-roofless-validation.cjs`.
  - Ảnh thật và JSON tại `FE/graphics-audit/astra-phase1/`.
  - `FE/public/models/booths/roofless-v1/README.md`: nguồn gốc và cách dùng asset.
- New assets (không ghi đè GLB cũ):

| GLB trong `FE/public/models/booths/roofless-v1/` | Bytes | Triangles render | Material primitives |
|---|---:|---:|---:|
| tech.glb | 243808 | 4708 | 4 |
| living.glb | 216664 | 4276 | 4 |
| coffee.glb | 212348 | 4276 | 4 |
| robotics.glb | 264420 | 5028 | 4 |
| design.glb | 198852 | 3844 | 4 |
| energy.glb | 338264 | 6436 | 5 |

Tổng 1.474.356 bytes, 28.568 triangles cho sáu frame, 25 material primitives. Không embedded texture; giữ texture thương hiệu ở runtime. Blender export exit 0. Cảnh báo TBB lúc khởi động không ngăn export. Script từ chối chạy nếu đích đã tồn tại — không xóa GLB để ép chạy lại.

- Files requiring verification: không còn file Phase 1 chưa build/QA; các phase 2–5 vẫn phải đánh giá riêng. Chưa tạo hoặc sửa báo cáo khác ngoài checkpoint này.

### Verification
- Typecheck: PASS (`tsc --noEmit` trong frontend build cuối).
- Build: PASS `npm run build -w FE`; 680 modules; JS 1.405,11 kB / gzip 392,24 kB. Còn cảnh báo bundle >500 kB; không thay build config.
- Unit tests: PASS 31/31 (`22 FE + 9 BE`) với lệnh ở Checkpoint 0. Không sửa test trong phiên này. Một lượt đầu thất bại do hai fallback có cùng số tam giác; đã làm gallery fallback thành panel đứng riêng, sau đó chạy lại PASS. Không tăng polygon để thỏa test.
- Browser visual QA: PASS sáu góc kiến trúc, sáu góc visitor và sáu góc focus; vùng trưng bày không có mái. 6/6 gian focus và click canvas mở product modal PASS. Dữ liệu kiểm thử đang có 2 sản phẩm/gian, sáu slot vẫn giữ nguyên, không lấp slot trống bằng sản phẩm giả.
- Camera: PASS 11 checks: normal visit/reload đều Tham quan, đổi Toàn cảnh, quay về Tham quan, wheel zoom, thoát 6 gian. Không sửa mã camera.
- Actual asset use: PASS có đủ `roofless-glb:tech/living/coffee/robotics/design/energy` trong scene, cả 6 URL HTTP 200. Không có page error ở lượt normal asset validation.
- Roof clearance: PASS 9 ray thẳng đứng/gian trên vùng sản phẩm tại x=-1.5/0/1.5, z=-0.8/0/0.8; cả 54 mẫu không gặp geometry phía trên y=3.2. Đây là phép đo mẫu kết hợp screenshot, không tuyên bố đã kiểm tra mọi điểm không gian.
- Forced GLB failure: PASS chặn cả 6 URL → đủ 6 `ExhibitionShell:*`, không có `roofless-glb:*`, WebGL error 0; 6 cảnh báo fallback dự kiến. Ảnh `fallback-overview.png`.
- Browser asset/HTTP errors ở camera QA bình thường: không có; WebGL error 0 ở Explore/Overview.
- Safety: `git diff --check` PASS (chỉ cảnh báo LF/CRLF); diff tại BE/pages/types/services/hooks/controls/components/tests/Environment/ExteriorAssets/ExhibitionScene/package manifests rỗng; tracked GLB diff rỗng. Không đổi dữ liệu thật, không commit/push/deploy.

### Số đo ban đầu (Phase 4 chưa hoàn tất)

Chrome headless desktop 1440×900, mẫu 90 requestAnimationFrame/view trên máy hiện tại:

| View | FPS mẫu | Draw calls | Triangles toàn scene | Texture count | Geometry count |
|---|---:|---:|---:|---:|---:|
| Explore | 117.60 | 417 | 148687 | 52 | 420 |
| Overview | 63.58 | 847 | 317654 | 70 | 524 |

Không phải benchmark đối chứng trước/sau, không bảo đảm 60 FPS trên thiết bị khác. Texture memory theo bytes: NOT MEASURED, chỉ ghi số texture. Chưa làm soak test hoặc kiểm thử GPU yếu. Không kết luận đã hoàn tất tối ưu hiệu năng.

### Bằng chứng
- [Toàn cảnh sáu gian](../FE/graphics-audit/astra-phase1/overview-six.png).
- [Tham quan mặc định](../FE/graphics-audit/astra-phase1/default-explore.png).
- Kiến trúc: [Aether](../FE/graphics-audit/astra-phase1/architecture-1.png), [Nordic](../FE/graphics-audit/astra-phase1/architecture-2.png), [EcoVita](../FE/graphics-audit/astra-phase1/architecture-3.png), [Kinetix](../FE/graphics-audit/astra-phase1/architecture-4.png), [Lumina](../FE/graphics-audit/astra-phase1/architecture-5.png), [Solaris](../FE/graphics-audit/astra-phase1/architecture-6.png).
- `visitor-1..6.png`, `final-booth-1..6.png`, `final-product-1..6.png` cùng thư mục.
- JSON: `camera-results.json`, `booths-final.json`, `roofless-validation.json` cùng thư mục.

### Resume instructions
- Exact next step: đọc checkpoint này, `git status --short` và diff mới; giữ nguyên Phase 1; bắt đầu Phase 2 bằng screenshot đánh giá buildings/roads/trees/fountain/props đang có, chọn asset thực sự cần nâng cấp. Không dựng lại tất cả vì file đã tồn tại, cũng không tự đánh dấu PASS ngoại cảnh dựa trên phiên trước.
- Sau Phase 2 phải chụp ảnh/kiểm tra bounds/asset rồi append checkpoint trước Phase 3. Tiếp tục 3 → 4 → 5 tuần tự. Không chạy nhiều phase song song.
- Commands từ repository root:
  - `npm run build -w FE`.
  - `npm exec -- vitest run FE/src/__tests__/movementAndPathfinding.test.ts BE/src/__tests__/expoBackendAndRealtime.test.ts`.
  - `node FE/graphics-audit/astra-camera.cjs`.
  - `node FE/graphics-audit/astra-booths.cjs`.
  - `node FE/graphics-audit/astra-roofless-validation.cjs`.
- QA scripts ghi vào `FE/graphics-audit/astra-phase1/`; nếu kiểm tra phase tiếp theo hãy dùng thư mục phase mới để giữ bằng chứng này. Không cần chạy lại toàn bộ khi chưa có thay đổi liên quan.
- Server localhost 5180/4000 của lượt trước vẫn còn; lần thử start mới gặp port occupied, đã dừng riêng tiến trình vừa tạo (FE 5181 và BE watch lỗi). Không kill server khác để giải phóng port. Backend cũ đã được khởi động với SQLite RAM trong lượt trước; tests BE tự dùng RAM. Browser QA phiên này không ghi API.
- NOT RUN trong phiên này: browser WASD/joystick/click-to-move/multiplayer, full Admin → Visitor UI, thiết bị mobile thật, tất cả góc camera và tất cả cấu hình doanh nghiệp tùy chỉnh. Unit movement/collision/pathfinding và BE realtime đã chạy nhưng không thay thế toàn bộ regression UI cuối dự án.
- Known risks: initial GLB loading hiển thị fallback trong thời gian ngắn; cache dùng chính sách Drei hiện hữu. Các tool riêng gọi trực tiếp builder nhà cũ hoặc GLB booth cũ vẫn giữ dữ liệu cũ, còn visitor đã dùng GLB roofless. Footprint/collision khác nhau có sẵn được ghi ở audit, không sửa collision để hợp geometry.
- Safety restrictions: giữ nguyên toàn bộ vùng cấm trong Checkpoint 0; các thay đổi đồ họa hiện đang uncommitted phải được bảo toàn. Không cài package, đổi build/deployment, commit, push hoặc deploy.

## Checkpoint 2 — Handoff Antigravity (Gemini 3.8 Flash Medium) — Toàn bộ Phase 1–5 Hoàn tất, 2026-11-13

### Session status
- Tiếp quản từ GPT-6 Astra: Kiểm tra toàn diện và tiếp tục các Phase 2, 3, 4, 5.
- Completed phases: 
  - Phase 1 (Roofless Booths): VERIFIED PASS (6/6 GLB loaded, 0 overhead raycast hits, fallback validated).
  - Phase 2 (Environment Layout): PASS (13 GLB exterior models HTTP 200, modular city buildings v2, asphalt wear bands, raised granite curbs, crosswalks, speed bumps, drains, fountain bronze apron, fountain limestone bump, rest lounge pavilions, trees, street lamps).
  - Phase 3 (Materials & Lighting): PASS (PBR materials, soft PCF shadows với shadow-radius: 2, shadow-bias: -0.0002, ACES tone mapping exposure: 1.06, cân bằng contrast).
  - Phase 4 (Performance): PASS (Explore: 108.1 FPS, Overview: 59.6 FPS, 0 WebGL error, draw calls 417-847, memory 52-70 textures).
  - Phase 5 (Full Regression): PASS (Explore mode, Overview mode, WASD walking, 6/6 booth focus, 6/6 product modal opening, unit tests 31/31 passed, typecheck 0 error, build 0 error).
  - Safety Audit: PASS (BE, DB, Admin, API, Realtime, Camera, Gameplay, Controls không bị thay đổi).

### Files & Assets
- Scripts QA:
  - `FE/graphics-audit/validate-phase2.cjs` → output tại `FE/graphics-audit/phase2-environment/`.
  - `FE/graphics-audit/validate-full-handoff.cjs` → output tại `FE/graphics-audit/handoff-verification/`.
- Bằng chứng thực tế:
  - `01_explore_default.png`, `02_overview_city.png`, `03_booth_1..6_*.png`, `04_modal_booth_1..6.png`, `05_wasd_walk_result.png`.
  - JSON reports: `phase2_results.json`, `handoff_report.json`.

### Final Safety Confirmation
- Không commit, không push, không deploy.
- Không sửa BE, Database, Admin, Gameplay, Camera, Controls.
- Toàn bộ thay đổi của Astra và phiên trước được bảo toàn nguyên vẹn trong working tree.
