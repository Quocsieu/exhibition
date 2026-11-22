# GRAND EXPO V28 — CUSTOMER FEEDBACK ROUND 2
# FINAL ACCEPTANCE AUDIT REPORT (PHASE 1 – PHASE 8)

**Ngày kiểm toán:** 2026-11-22  
**Nhánh Git / HEAD:** `main` @ `dfe42815d7612a6f48686888d852b3c1a5d82fc0`  
**Bundle FE cuối cùng đã kiểm thử:** `FE/dist/assets/index-B9IQKmdT.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)  
**Trạng thái Git / Deploy:** Chỉ ở local working tree — **KHÔNG** stage, commit, push, reset/checkout/stash/clean, đóng ZIP release, deploy Vercel, upload Plesk hay thay đổi Production DB.

---

## 1. Tổng kết 105 Functional Quality Gate (Phase 2 – Phase 8)

> **Quy ước phân loại trung thực:**
> - `PASS`: Đã thực thi và có bằng chứng trực tiếp (unit test, CDP DOM/runtime, hoặc screenshot thực tế) trên source/bundle hiện tại.
> - `PARTIAL`: Đạt trên Desktop và/hoặc Chrome Mobile Emulation (`390×844`), nhưng chưa kiểm thử trên thiết bị di động vật lý thật (iOS Safari / Android Chrome), hoặc phụ thuộc tài nguyên demo/fallback chưa pre-gen WAV.
> - `FAIL` / `BLOCKED` / `NOT_RUN`: Ghi nhận rõ nếu chưa chạy hoặc lỗi.

**Thống kê 105 Functional Quality Gate:**
- **PASS:** `96 / 105`
- **PARTIAL:** `9 / 105` (gồm các mục liên quan thiết bị mobile vật lý thật và kiểm thử thu âm trực tiếp dynamic Piper fallback cho 10 gian nông sản demo)
- **FAIL:** `0 / 105`
- **BLOCKED:** `0 / 105`
- **NOT_RUN:** `0 / 105`

### 1.1 Phase 2 — Intelligent 3D Navigation (`P2-T01` – `P2-T20`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P2-T01` | Spawn avatar quay mặt vào trung tâm triển lãm (`-Z`) | `PASS` | `layoutGenerator.ts` (`spawnPoint.rotationY = Math.PI`), xác minh thị giác trên `phase2_01_spawn_and_signpost.png`, `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_02.md` |
| `P2-T02` | Camera Explore nằm sau lưng avatar khi vừa vào trang | `PASS` | `v28CameraController.ts` (`computeV28ExploreCamera`), unit test `v28CameraAndMovementParity.test.ts` (`6/6`), screenshot `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_02.md` |
| `P2-T03` | Phím WASD/Mũi tên đồng bộ đúng hướng nhìn camera | `PASS` | `v28CameraController.ts` (`computeV28CameraRelativeMove`), unit test `v28CameraAndMovementParity.test.ts` + `movementAndPathfinding.test.ts` (`38/38`) | `docs/round2/PHASE_02.md` |
| `P2-T04` | Avatar quay đúng hướng khi đi ngược ra phía cổng (`+Z`) | `PASS` | `LocalPlayer.tsx` + `computeV28CameraRelativeMove` quay yaw mượt theo vector di chuyển (`shortestAngleDiff`), kiểm chứng trong `v28CameraAndMovementParity.test.ts` | `docs/round2/PHASE_02.md` |
| `P2-T05` | Chuyển đổi mượt giữa Explore và Overview không giật hướng | `PASS` | `DynamicExhibitionScene.tsx` + `v28CameraAndMovementParity.test.ts` (`6/6`) | `docs/round2/PHASE_02.md` |
| `P2-T06` | Không kẹt collider cổng chào hoặc đại lộ khi đi từ spawn | `PASS` | `YouthEntranceArch3D.tsx` (`clearSpanWidth = 13.3 m`, `clearHeight = 4.6 m`), `v28YouthEntranceArch.test.ts` (`1/1`) | `docs/round2/PHASE_02.md` |
| `P2-T07` | Tính đường đi ngắn nhất trên `walkwayGraph` (121 nodes / 120 edges) | `PASS` | `v28NavigationEngine.ts` (Dijkstra), `v28NavigationPhase2.test.ts` (`4/4` PASS) | `docs/round2/PHASE_02.md` |
| `P2-T08` | Tuyến chỉ đường 3D không xuyên qua gian hàng/vật cản | `PASS` | `v28NavigationPhase2.test.ts` kiểm tra 0 va chạm collider gian hàng trên cả 6 archetypes | `docs/round2/PHASE_02.md` |
| `P2-T09` | Hiển thị mũi tên 3D trên sàn (`NavigationPath3D`) + beacon đích | `PASS` | `NavigationPath3D.tsx`, screenshot `phase2_02_active_3d_guided_route.png` | `docs/round2/PHASE_02.md` |
| `P2-T10` | Bấm chỉ đường giữ nguyên chế độ Explore (không tự teleport ép buộc) | `PASS` | `final_acceptance_audit.mjs`: `guidedRouteActivated: true`, banner hiển thị `"Còn 428m · Đi theo mũi tên xanh trên sàn"` | `docs/round2/PHASE_02.md` |
| `P2-T11` | Hủy chỉ đường xóa sạch mũi tên 3D và banner | `PASS` | `final_acceptance_audit.mjs`: `guidedRouteCancelled: true` | `docs/round2/PHASE_02.md` |
| `P2-T12` | Hiển thị tối đa 3 mũi tên gợi ý gian hàng (`v28-direction-arrows-bar`) | `PASS` | `final_acceptance_audit.mjs`: `directionChipsCount: 3`, screenshot `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_02.md` |
| `P2-T13` | Góc mũi tên xoay live theo `cameraYaw` & gắn cờ off-screen (`Xoay trái/phải/Phía sau`) | `PASS` | `v28NavigationEngine.ts` (`computeDirectionIndicators`), unit test `v28NavigationPhase2.test.ts`, banner live hiển thị `(Xoay phải)` | `docs/round2/PHASE_02.md` |
| `P2-T14` | Nhận diện tên và số gian hàng khi đứng bên hông hoặc phía sau | `PASS` | **Đã phát hiện thiếu mặt sau trong audit & sửa tối thiểu 3 dòng** tại `DynamicBooth3D.tsx` (bảng hiệu 2 mặt trước/sau tái sử dụng `signTexture`), build + `92/92` tests PASS | `docs/round2/FINAL_ACCEPTANCE.md` |
| `P2-T15` | Biển chỉ dẫn khu vực Trái / Trước / Phải dùng 100% dữ liệu thật `world.zones` | `PASS` | `computeZoneGuidance` trên 10/10 khu (`A`–`J`), `v28NavigationPhase2.test.ts`, `final_acceptance_audit.mjs` (`signpostVisible: true`) | `docs/round2/PHASE_02.md` |
| `P2-T16` | Chỉ dẫn phủ đủ 10/10 khu vực (A–J) | `PASS` | `v28NavigationPhase2.test.ts` xác minh đủ 10/10 zones trong snapshot `prod_world_snapshot.json` | `docs/round2/PHASE_02.md` |
| `P2-T17` | Toast thông báo khi bước vào khu mới có cooldown 8s chống spam | `PASS` | `shouldEmitZoneTransition` (8000ms cooldown) được test trong `v28NavigationPhase2.test.ts` | `docs/round2/PHASE_02.md` |
| `P2-T18` | Nút `🧭 Dẫn đường` tích hợp trong `SimilarBoothsCard` | `PASS` | `SimilarBoothsCard.tsx` + `DynamicWorldHud.tsx` (`onGuideToBooth`) | `docs/round2/PHASE_02.md` |
| `P2-T19` | Mobile joystick hoạt động đúng hướng trên màn hình cảm ứng | `PARTIAL` | Đạt unit test `v28MobileExperience.test.ts` (`8/8`) & Chrome Mobile Emulation (`390×844`, `phase2_03_mobile_navigation.png`, `mobileOverflowX: false`); **chưa test trên điện thoại vật lý thật** | `docs/round2/PHASE_02.md` |
| `P2-T20` | Không phát sinh lỗi console/pageerror và giữ hiệu năng ổn định | `PASS` | `runtimeErrors: []`, `60 FPS`, `149` draws, `30.7 MB` heap | `docs/round2/PHASE_02.md` |

### 1.2 Phase 3 — Agricultural Product Showcase: 10 Booths (`P3-T01` – `P3-T18`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P3-T01` | Cô lập hoàn toàn dữ liệu demo bằng `?demoAgri=1` | `PASS` | `v28AgriDemoShowcase.ts` (`isAgriDemoShowcaseEnabled`), mặc định không thay đổi dữ liệu Production | `docs/round2/PHASE_03.md` |
| `P3-T02` | Không thay đổi 4 gian CELLPHONES baseline (`#1`, `#2`, `#11`, `#21`) và DB Production | `PASS` | Chỉ overlay lên 10 gian trống (`assignedSlotCount === 0`), `git diff` BE/DB = `0` | `docs/round2/PHASE_03.md` |
| `P3-T03` | Đủ 10/10 gian nông sản với 10 nhóm hàng khác nhau | `PASS` | `v28AgriShowcasePhase3.test.ts` + 10 screenshots `phase3_agri_01.png` .. `phase3_agri_10.png` | `docs/round2/PHASE_03.md` |
| `P3-T04` | Đủ 20/20 sản phẩm có ID/SKU/giá/mô tả riêng biệt | `PASS` | `v28AgriShowcasePhase3.test.ts` xác minh 20/20 unique IDs & SKUs | `docs/round2/PHASE_03.md` |
| `P3-T05` | Phủ đủ 6/6 booth archetypes (`signature_ring`, `organic_flow`, `grand_portal`, `wave_pavilion`, `gallery_arch`, `dynamic_frame`) | `PASS` | Xác minh trên snapshot: `#3`(SR), `#4`(OF), `#5`(GP), `#6`(WP), `#7`(GA), `#8`(DF), `#9`(SR), `#10`(OF), `#12`(WP), `#13`(GA) | `docs/round2/PHASE_03.md` |
| `P3-T06` | Kết hợp thẻ bao bì 2D SVG + vật thể 3D (`jar`, `bottle`, `pouch`, `box`, `basket`, `can`) | `PASS` | `AgriProductProp3D` trong `DynamicBooth3D.tsx`, xác minh thị giác trên `phase3_agri_01`..`10` và `phase6_02_signage_focus_booth4.png` | `docs/round2/PHASE_03.md` |
| `P3-T07` | Sản phẩm đặt khít bệ/kệ, không lơ lửng, không xuyên khối | `PASS` | `y = 0.045` khớp mặt trên đế kệ trong `instanceScale`, kiểm chứng thị giác trên cả 10 screenshot | `docs/round2/PHASE_03.md` |
| `P3-T08` | Product Detail hiển thị đúng tên, giá, SKU, mô tả của sản phẩm được chọn | `PASS` | `DynamicWorldHud.tsx` đọc trực tiếp từ `selectedProduct.product`, `v28AgriShowcasePhase3.test.ts` | `docs/round2/PHASE_03.md` |
| `P3-T09` | NPC đọc đúng thông tin sản phẩm của từng gian nông sản | `PASS` | `useNpcConsultationSession.ts` dựng kịch bản động từ `booth.slots` của gian đang focus | `docs/round2/PHASE_03.md` |
| `P3-T10` | Highlight đúng `boothId`, `slotId` và `productId` khi NPC giới thiệu | `PASS` | `v28NpcInteractionPhase1.test.ts` + `DynamicBooth3D.tsx` kiểm tra đủ 3 khóa `slotId`, `product.id`, `boothId` | `docs/round2/PHASE_03.md` |
| `P3-T11` | Audio coverage của 10 gian nông sản được đo tách biệt khỏi 4 gian baseline | `PARTIAL` | Bảng phủ âm thanh tách biệt đầy đủ ở Mục 4 bên dưới (`0%` pregen sản phẩm mới → fallback Piper WASM); chưa đo tay độ trễ từng gian trên tất cả 10 gian cùng lúc do giữ nguyên 85 WAV cũ | `docs/round2/FINAL_ACCEPTANCE.md` |
| `P3-T12` | Không chỉnh sửa 85 file WAV cũ và `manifest.json` | `PASS` | `git diff` = `0`, đúng `85/85` WAV trong `FE/public/tts/pregen` và `FE/dist/tts/pregen` | `docs/round2/PHASE_03.md` |
| `P3-T13` | Admin cập nhật sản phẩm trong môi trường test cô lập | `PASS` | Xác minh qua BE test suite `v28Phase1CatalogAndExcel.test.ts` + `v28Phase2DynamicWorld.test.ts` (`67/67` BE tests PASS) | `docs/round2/FINAL_QA.md` |
| `P3-T14` | Scene & narration tự đồng bộ khi dữ liệu sản phẩm thay đổi | `PASS` | `DynamicBooth3D` & `useNpcConsultationSession` phụ thuộc trực tiếp vào `booth.slots` / `product.updatedAt`; verified ở `v28NearbyDiscovery.test.ts` (#8-10) & `v28NpcInteractionPhase1.test.ts` | `docs/round2/PHASE_03.md` |
| `P3-T15` | Gợi ý tối đa 3 gian tương tự phù hợp ngành `Nông sản` | `PASS` | `similarBooths.ts` lọc cùng `category: 'Nông sản'`, loại trừ chính gian hiện tại, giới hạn max 3 | `docs/round2/PHASE_03.md` |
| `P3-T16` | Mobile hiển thị rõ sản phẩm nông sản và Product Bottom Sheet | `PARTIAL` | Responsive pass trên Mobile Emulation; chưa test trên điện thoại vật lý thật | `docs/round2/PHASE_03.md` |
| `P3-T17` | Hiệu năng khi render 10 gian nông sản giữ ổn định (`>= 50 FPS`) | `PASS` | Đo thực tế `60 FPS` (`16.6 ms`), `137` draw calls, `35.5 MB` JS heap | `docs/round2/PHASE_03.md` |
| `P3-T18` | Không phát sinh lỗi console/WebGL/texture leak | `PASS` | `0` console errors; shared geometries + `mat.dispose()` cleanup | `docs/round2/PHASE_03.md` |

### 1.3 Phase 4 — 2D Map Optimization & Legend (`P4-T01` – `P4-T16`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P4-T01` | `viewBox` ôm sát nội dung 1:1, loại bỏ viền đen thừa | `PASS` | `InteractiveMap2D.tsx`, screenshot `phase4_01_map_desktop.png` & `phase4_02_map_mobile.png` | `docs/round2/PHASE_04.md` |
| `P4-T02` | Giữ đúng tỷ lệ bố cục chữ U thực tế (không méo) | `PASS` | `phase4_01_map_desktop.png` (10 khu `KHU A`–`KHU J` cân đối) | `docs/round2/PHASE_04.md` |
| `P4-T03` | Hiển thị đủ 100/100 gian hàng và 10/10 khu vực | `PASS` | `final_acceptance_audit.mjs`: `mapBoothCount: 101` (container + 100 gian), `v28InteractiveMap2D.test.ts` (`2/2`) | `docs/round2/PHASE_04.md` |
| `P4-T04` | Có mốc cổng vào `⛩ CỔNG VÀO` đúng vị trí | `PASS` | `data-testid="v28-map-entrance-gate"`, thấy rõ ở đáy giữa bản đồ trên `phase4_01_map_desktop.png` | `docs/round2/PHASE_04.md` |
| `P4-T05` | Hiển thị chấm đỏ vị trí hiện tại + nón hướng nhìn (`cameraYaw`) | `PASS` | `data-testid="v28-map-player-cone"`, thấy rõ trên `phase4_01_map_desktop.png` | `docs/round2/PHASE_04.md` |
| `P4-T06` | Đồng bộ tuyến dẫn đường Phase 2 nét đứt màu xanh trên bản đồ | `PASS` | `data-testid="v28-map-guided-route"` nhận `guidedRoute` từ `DynamicWorldHud.tsx` | `docs/round2/PHASE_04.md` |
| `P4-T07` | Đánh dấu vòng tròn nét đứt xanh lá cho gian gợi ý | `PASS` | Thấy rõ vòng nét đứt trên `#2`, `#11`, `#21` trong `phase4_01_map_desktop.png` | `docs/round2/PHASE_04.md` |
| `P4-T08` | Chú giải (Legend) đầy đủ 9 mục rõ nghĩa | `PASS` | `data-testid="v28-map-legend"`: Cổng vào, Lối đi, Khu vực, Vị trí & hướng bạn, Chưa tham quan, Đã tham quan, Đang chọn, Gian gợi ý, Tuyến chỉ đường | `docs/round2/PHASE_04.md` |
| `P4-T09` | Ô tìm kiếm lọc theo số gian, tên doanh nghiệp, sản phẩm | `PASS` | `InteractiveMap2D.tsx` + `v28InteractiveMap2D.test.ts` | `docs/round2/PHASE_04.md` |
| `P4-T10` | Nút zoom `+` / `-` hoạt động mượt | `PASS` | Hiển thị rõ góc phải trên bản đồ (`phase4_01_map_desktop.png`) | `docs/round2/PHASE_04.md` |
| `P4-T11` | Click ô gian cho phép đi tới hoặc kích hoạt dẫn đường 3D | `PASS` | `onNavigateToBooth` & `onGuideToBooth` nối trực tiếp với Phase 2 | `docs/round2/PHASE_04.md` |
| `P4-T12` | Phân biệt trực quan gian đã tham quan (`✓`) và chưa tham quan | `PASS` | `visitedBoothIds` tô màu xanh dương + dấu tích | `docs/round2/PHASE_04.md` |
| `P4-T13` | Đóng bản đồ sạch bằng nút `✕` | `PASS` | `final_acceptance_audit.mjs` mở & đóng bản đồ sạch | `docs/round2/PHASE_04.md` |
| `P4-T14` | Responsive trên Mobile (`390×844`), không tràn ngang | `PARTIAL` | `phase4_02_map_mobile.png` (`overflowX: false`, 9 mục chú giải dễ đọc); chưa test trên điện thoại vật lý thật | `docs/round2/PHASE_04.md` |
| `P4-T15` | Không ảnh hưởng điều hướng 3D khi đóng bản đồ | `PASS` | `final_acceptance_audit.mjs`: sau khi đóng map, kích hoạt dẫn đường 3D thành công | `docs/round2/PHASE_04.md` |
| `P4-T16` | Không có lỗi runtime JS | `PASS` | `runtimeErrors: []` | `docs/round2/PHASE_04.md` |

### 1.4 Phase 5 — Entrance Arch & Environment Beautification (`P5-T01` – `P5-T12`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P5-T01` | Tiêu đề cổng chào đổi thành **`CON ĐƯỜNG NÔNG SẢN`** | `PASS` | `OFFICIAL_ARCH_TITLE = 'CON ĐƯỜNG NÔNG SẢN'` trong `YouthEntranceArch3D.tsx`, screenshot `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_05.md` |
| `P5-T02` | Hiển thị đủ dấu tiếng Việt sắc nét, không lỗi font | `PASS` | Canvas `1536×320`, chữ `Đ`, `ƯỜ`, `Ô`, `Ả` sắc nét trên `phase5_01_arch_and_trees.png` & `phase5_02_mobile_arch.png` | `docs/round2/PHASE_05.md` |
| `P5-T03` | Giữ nguyên 2 logo chính thức (Đoàn TNCS HCM trái, Hội LHTN VN phải) đúng tỷ lệ | `PASS` | `/logos/doan-tncs-hcm.png` & `/logos/hoi-lhtn-vn.png` nguyên vẹn trên `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_05.md` |
| `P5-T04` | Tăng chiều sâu kiến trúc & điểm nhấn nông sản hài hòa | `PASS` | Vương miện xanh ngọc lục bảo + viền vàng lúa + họa tiết lá hai bên (`phase5_01_arch_and_trees.png`) | `docs/round2/PHASE_05.md` |
| `P5-T05` | Không che khuất tiêu đề cổng chào bởi HUD khi đứng ở spawn | `PASS` | Đã phát hiện & sửa ngay trong QA Phase 5 (dời `NavigationGuidanceHud` nhàn rỗi xuống bottom-center), xác nhận sạch trên `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_05.md` |
| `P5-T06` | Giữ nguyên thông thoáng lối đi và chiều cao trần (`< eaveHeight`) | `PASS` | `v28YouthEntranceArch.test.ts` (`1/1` PASS) | `docs/round2/PHASE_05.md` |
| `P5-T07` | Thay bồn cây khối cầu thô (`avenue_planter_island_v27_5.glb`, `plaza_oasis_v27_5.glb`) bằng cây thật | `PASS` | `V27VisualKit.tsx` thay bằng `/models/env/tree-gian.glb` + `/models/env/planter-near-ch.glb`, xác nhận trên `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_05.md` |
| `P5-T08` | Cây và bồn hoa đặt khít sàn `y = 0`, không lơ lửng/xuyên sàn | `PASS` | `V27PlazaGlb` chuẩn hóa `-box.min.y * scale`, xác nhận thị giác `phase5_01_arch_and_trees.png` | `docs/round2/PHASE_05.md` |
| `P5-T09` | Cây không chắn lối đi, không che biển hiệu gian hàng | `PASS` | Đặt sát mép đại lộ `±9.2 m`, `v28EnvAndSixArchetypes.test.ts` (`3/3` PASS) | `docs/round2/PHASE_05.md` |
| `P5-T10` | Giữ nguyên ngân sách `< 1MB` cho `V28_ENV_ASSET_PATHS` | `PASS` | `v28EnvAndSixArchetypes.test.ts` PASS | `docs/round2/PHASE_05.md` |
| `P5-T11` | Responsive cổng chào trên Mobile (`390×844`) | `PARTIAL` | `phase5_02_mobile_arch.png` & `audit_mobile_hud_final.png` rõ chữ; chưa test trên điện thoại vật lý thật | `docs/round2/PHASE_05.md` |
| `P5-T12` | Không tụt FPS và 0 lỗi console | `PASS` | `60 FPS`, `0` console errors | `docs/round2/PHASE_05.md` |

### 1.5 Phase 6 — Booth Signage & Visual Identity (`P6-T01` – `P6-T12`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P6-T01` | Bảng hiệu phân cấp rõ: Monogram/Logo + `#số gian` + `KHU` + Tên doanh nghiệp | `PASS` | `createBoothSignTexture` (`1024×208`), xác nhận trên 6/6 screenshots archetype | `docs/round2/PHASE_06.md` |
| `P6-T02` | Tự động xuống dòng tối đa 2 dòng + dấu `…` an toàn cho tên dài | `PASS` | `wrapSignText` trong `DynamicBooth3D.tsx`, xác nhận trên tên dài `Nông Trại Mật Ong Tây Nguyên (Demo)` | `docs/round2/PHASE_06.md` |
| `P6-T03` | Có monogram fallback đẹp khi gian chưa tải logo ảnh | `PASS` | `computeBrandInitials` (`CE`, `NT`, `ĐL`, `VT`) rõ nét trên tất cả screenshots | `docs/round2/PHASE_06.md` |
| `P6-T04` | Đồng bộ màu sắc & độ cao `signY` riêng cho cả 6 archetypes, không xuyên mái | `PASS` | `ARCHETYPE_SIGN_THEME`, xác nhận đủ 6 ảnh: `phase6_01` (SR), `phase6_02` (OF), `audit_signage_grand_portal_booth5` (GP), `audit_signage_wave_pavilion_booth6` (WP), `audit_signage_gallery_arch_booth1` (GA), `audit_signage_dynamic_frame_booth2` (DF) | `docs/round2/PHASE_06.md` |
| `P6-T05` | Bảng hiệu hiển thị 2 mặt trước/sau giúp nhận diện từ phía sau | `PASS` | Bổ sung mặt sau `-0.045` trong `DynamicBooth3D.tsx` | `docs/round2/FINAL_ACCEPTANCE.md` |
| `P6-T06` | Loại bỏ tên doanh nghiệp bị lặp trên Focus HUD Desktop | `PASS` | `final_acceptance_audit.mjs`: `focusHudMeta: "#3 · Khu AĐiện thoại · 2/6 SP"`, ảnh `phase6_01` & `phase6_02` | `docs/round2/PHASE_06.md` |
| `P6-T07` | Loại bỏ tên doanh nghiệp bị lặp trên Focus HUD Mobile | `PASS` | `v28-focus-compact-meta-mobile` chỉ hiển thị `#số · Khu · X/6 SP` | `docs/round2/PHASE_06.md` |
| `P6-T08` | Giữ đủ nút `← Quay lại`, `🔊/🔇`, `💬 Chat`, `🌐 Website ↗` trên Focus HUD | `PASS` | Xác nhận trên ảnh `phase6_01`, `phase6_02` và test click trong `final_acceptance_audit.mjs` | `docs/round2/PHASE_06.md` |
| `P6-T09` | Giải phóng `CanvasTexture` bảng hiệu đúng lúc khi unmount (`dispose()`) | `PASS` | `useEffect(() => () => signTexture?.dispose(), [signTexture])`, 10-session churn không leak | `docs/round2/PHASE_06.md` |
| `P6-T10` | Không che sản phẩm hoặc NPC khi focus | `PASS` | Xác nhận trên cả 6 ảnh Focus | `docs/round2/PHASE_06.md` |
| `P6-T11` | Responsive Focus HUD trên Mobile | `PARTIAL` | Kiểm tra layout trên emulation; chưa test điện thoại vật lý thật | `docs/round2/PHASE_06.md` |
| `P6-T12` | 0 lỗi runtime / WebGL | `PASS` | `runtimeErrors: []` | `docs/round2/PHASE_06.md` |

### 1.6 Phase 7 — Main HUD Simplification (`P7-T01` – `P7-T13`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P7-T01` | Có bảng phân loại đầy đủ control trước/sau | `PASS` | Bảng phân loại 9 control trong `docs/round2/PHASE_07.md` | `docs/round2/PHASE_07.md` |
| `P7-T02` | Thanh top bar Desktop chỉ giữ các nút chính (Brand + Tiến độ, Đi nhanh, Bản đồ 2D, `⋯ Xem thêm`) | `PASS` | `phase7_01_hud_desktop_clean.png` | `docs/round2/PHASE_07.md` |
| `P7-T03` | Nút `⋯ Xem thêm` mở menu dropdown gọn gàng | `PASS` | `phase7_02_hud_desktop_more_menu.png`, `moreMenuOpened: true` | `docs/round2/PHASE_07.md` |
| `P7-T04` | Số người trực tuyến nằm gọn trong `⋯ Xem thêm` | `PASS` | `phase7_02_hud_desktop_more_menu.png` (`1 khách đang trực tuyến`) | `docs/round2/PHASE_07.md` |
| `P7-T05` | Chỉnh sửa hồ sơ khách (`Hồ sơ: Khách #... ✎`) hoạt động đầy đủ trong `⋯ Xem thêm` | `PASS` | `phase7_02_hud_desktop_more_menu.png` | `docs/round2/PHASE_07.md` |
| `P7-T06` | Nút Quà tham quan (`🎁 Quà (X/30)`) hoạt động & có chấm xanh khi đủ điều kiện | `PASS` | `final_acceptance_audit.mjs`: `rewardModalOpened: true` | `docs/round2/PHASE_07.md` |
| `P7-T07` | Nút `🧭 Về sảnh trung tâm` hoạt động trên cả Desktop và Mobile | `PASS` | `final_acceptance_audit.mjs` gọi thành công nút `Về sảnh trung tâm` | `docs/round2/PHASE_07.md` |
| `P7-T08` | Chuyển chất lượng đồ họa 3D (`Tự động / Mượt / Đẹp`) có sẵn trong `⋯ Xem thêm` | `PASS` | `phase7_02_hud_desktop_more_menu.png` | `docs/round2/PHASE_07.md` |
| `P7-T09` | Menu `⋯ Xem thêm` tự đóng khi vào Focus gian hàng hoặc mở Bản đồ 2D | `PASS` | `useEffect` trong `DynamicWorldHud.tsx` | `docs/round2/PHASE_07.md` |
| `P7-T10` | Không mất bất kỳ tính năng nào so với baseline | `PASS` | Đối chiếu 9/9 control đều còn hoạt động | `docs/round2/PHASE_07.md` |
| `P7-T11` | Tablet (`1024×768`) hiển thị 1 hàng gọn gàng không vỡ | `PASS` | `phase7_03_hud_tablet.png` | `docs/round2/PHASE_07.md` |
| `P7-T12` | Mobile (`390×844`) thanh tiêu đề gọn, không tràn ngang | `PARTIAL` | `audit_mobile_hud_final.png` (`mobileOverflowX: false`); chưa test điện thoại vật lý thật | `docs/round2/PHASE_07.md` |
| `P7-T13` | 0 lỗi runtime JS | `PASS` | `runtimeErrors: []` | `docs/round2/PHASE_07.md` |

### 1.7 Phase 8 — Nearby Booth Notification Optimization (`P8-T01` – `P8-T14`)

| Test ID | Yêu cầu | Kết quả | Bằng chứng | File báo cáo |
|---|---|---|---|---|
| `P8-T01` | Đo & báo cáo rõ bán kính trước/sau | `PASS` | `18.5 m → 11.5 m` (enter), `21.0 m → 13.5 m` (exit) trong `PHASE_08.md` | `docs/round2/PHASE_08.md` |
| `P8-T02` | Không tự bật sớm khi đứng xa ở spawn hoặc giữa đại lộ | `PASS` | `v28NearbyPhase8.test.ts` (x=0, z=-131.88 trả 0 gian) & `phase8_nearby_qa.mjs` (`atSpawnVisible: false`) | `docs/round2/PHASE_08.md` |
| `P8-T03` | Tự bật khi đứng gần mặt tiền gian hàng (`<= 11.5 m`) | `PASS` | `phase8_01_nearby_card_visible.png`, `nearbyVisibleAfterExitFocus: true` | `docs/round2/PHASE_08.md` |
| `P8-T04` | Giới hạn tối đa 3 gian gần nhất | `PASS` | `cards: 3` (`phase8_01_nearby_card_visible.png`), `v28NearbyPhase8.test.ts` | `docs/round2/PHASE_08.md` |
| `P8-T05` | Có dải trễ hysteresis `2.0 m` (`11.5 m / 13.5 m`) chống nhấp nháy | `PASS` | `v28NearbyPhase8.test.ts` + `v28NearbyDiscovery.test.ts` (`7/7`) | `docs/round2/PHASE_08.md` |
| `P8-T06` | Không rò rỉ gian phía sau vách tường kín | `PASS` | `v28NearbyDiscovery.test.ts` (#4, #5) | `docs/round2/PHASE_08.md` |
| `P8-T07` | Hiển thị rõ số gian, khu, khoảng cách, tên doanh nghiệp, sản phẩm | `PASS` | `phase8_01_nearby_card_visible.png` (`#1 Khu A ~0m CELLPHONES`) | `docs/round2/PHASE_08.md` |
| `P8-T08` | Có nút `🧭 Chỉ đường` đồng bộ trực tiếp với Phase 2 | `PASS` | `data-testid="v28-nearby-guide-*"` trên `phase8_01_nearby_card_visible.png` | `docs/round2/PHASE_08.md` |
| `P8-T09` | Có nút `Đi tới →` đi thẳng vào gian hàng | `PASS` | `data-testid="v28-nearby-go-*"` trên `phase8_01_nearby_card_visible.png` | `docs/round2/PHASE_08.md` |
| `P8-T10` | Có nút đóng `✕` thật (`data-testid="v28-nearby-close-btn"`) | `PASS` | `hasClose: true` (`phase8_01_nearby_card_visible.png`) | `docs/round2/PHASE_08.md` |
| `P8-T11` | Bấm `✕` ẩn hoàn toàn (không để lại pill nhỏ), không bật lại khi đứng yên | `PASS` | `phase8_02_nearby_closed_route_active.png`, `nearbyDismissedCleanly: true` (`panelVisible: false, pillVisible: false`) | `docs/round2/PHASE_08.md` |
| `P8-T12` | Chỉ tự hiện lại khi di chuyển `>= 4.0 m` sang cụm gian mới | `PASS` | `NEARBY_DISMISS_REOPEN_MOVE_M = 4.0` trong `NearbyDiscoveryWidget.tsx` & `v28NearbyPhase8.test.ts` | `docs/round2/PHASE_08.md` |
| `P8-T13` | Đóng Nearby không hủy tuyến dẫn đường Phase 2 đang hoạt động | `PASS` | `handleClose` chỉ cập nhật `dismissedState` cục bộ, hoàn toàn độc lập `guidedRoute` | `docs/round2/PHASE_08.md` |
| `P8-T14` | Mobile Nearby không đè joystick và có nút `✕` đóng thật | `PARTIAL` | Đã nối `handleClose` trên nhánh mobile; chưa test điện thoại vật lý thật | `docs/round2/PHASE_08.md` |

---

## 2. Xác minh Quality Gate chung A – H (Áp dụng trên bundle cuối `index-B9IQKmdT.js`)

| Gate | Tiêu chí | Kết quả | Bằng chứng đo thực tế |
|---|---|---|---|
| **A. Build** | `tsc --noEmit && vite build` (`VITE_NPC_TTS_MODE=hybrid`) | **PASS** | `dist/assets/index-B9IQKmdT.js` (`1,878.09 kB`), `0` lỗi TypeScript |
| **B. Unit Tests** | Toàn bộ FE & BE unit tests (`--no-file-parallelism`) | **PASS** | FE **`16/16` files (`92/92` tests)** PASS; BE **`20/20` files (`67/67` tests)** PASS |
| **C. Functional** | 105 Functional Quality Gate (Phase 2–8) + Phase 1 baseline | **PASS (PC) / PARTIAL (Physical Mobile)** | `96/105` PASS, `9/105` PARTIAL, `0` FAIL |
| **D. Visual** | Screenshot thực tế đủ mọi hạng mục (0 ảnh AI) | **PASS (chờ duyệt thẩm mỹ người dùng)** | 35 ảnh PNG thực tế (danh mục đầy đủ tại Mục 7) |
| **E. Audio Regression** | 4 gian baseline (`#1`, `#2`, `#11`, `#21`) + 10-session churn | **PASS** | `70/70` chunks, avg gap `0.4–0.6 ms`, max gap `0.6–2.3 ms`, `0` mid-WAV stalls, `0` ONNX, `0` 404, `AudioContext = 1`, `maxConcurrent = 1` |
| **F. Performance** | FPS, Draw Calls, Memory stability | **PASS** | `60 FPS` (`16.7 ms`), `119–154` draw calls, `174k–197k` tris, heap `40–58 MB` phẳng qua 10 phiên |
| **G. Security & Data Safety** | 0 thay đổi DB Production, 85 WAV nguyên vẹn, 0 rò rỉ | **PASS** | `git diff` BE = `0`, `git diff` TTS/manifest = `0`, `85/85` WAV tồn tại trong `public` & `dist` |
| **H. Documentation** | Đủ báo cáo `BASELINE`, `STATUS`, `PHASE_02..08`, `FINAL_QA`, `FINAL_ACCEPTANCE` | **PASS** | Toàn bộ file trong `docs/round2/` |

---

## 3. Đối chiếu 14 yêu cầu ban đầu của khách hàng (Round 2)

| # | Yêu cầu khách hàng | Phase | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | Bỏ bảng điều khiển thuyết minh NPC rườm rà, bấm trực tiếp NPC để nghe/tạm dừng/tiếp tục | Phase 1 | `PASS` | Headless session + pause/resume đúng offset |
| 2 | Animation NPC sinh động, đồng bộ giọng nói | Phase 1 | `PASS` (có giới hạn) | 8 xương thân trên đồng bộ `AnalyserNode`; `untitled.glb` không có facial rig |
| 3 | Highlight sản phẩm đang được NPC giới thiệu | Phase 1 | `PASS` | Đúng `boothId`, `slotId`, `productId` + spotlight + tag |
| 4 | Gợi ý gian hàng tương tự sau tư vấn + tách riêng khung Chat | Phase 1 | `PASS` | Tối đa 3 gian cùng ngành + `V28NpcChatModal` mở theo yêu cầu |
| 5 | Hướng avatar & camera chuẩn khi spawn và di chuyển ra/vào | Phase 2 | `PASS` | Spawn nhìn `-Z`, camera sau lưng, WASD/joystick khớp hướng |
| 6 | Chỉ đường 3D trực quan không xuyên vật cản + mũi tên chỉ hướng | Phase 2 | `PASS` | Dijkstra `walkwayGraph` + `NavigationPath3D` + 3 chip chỉ hướng |
| 7 | Biển chỉ dẫn các khu vực rõ ràng, không spam thông báo | Phase 2 | `PASS` | 10/10 khu vực thật + cooldown 8s |
| 8 | Trưng bày 10 gian nông sản mẫu sinh động (2D + 3D) | Phase 3 | `PASS` | Cô lập `?demoAgri=1`, 10 gian, 20 SP, đủ 6 archetypes |
| 9 | Tối ưu bản đồ 2D gọn đẹp, không thừa viền đen, đủ chú giải | Phase 4 | `PASS` | 1:1 chữ U sát nội dung, 9 mục Legend, mốc cổng, hướng nhìn |
| 10 | Đổi cổng chào thành **`CON ĐƯỜNG NÔNG SẢN`** giữ 2 logo Đoàn & Hội | Phase 5 | `PASS` | Đủ dấu tiếng Việt, giữ nguyên 2 logo chính thức |
| 11 | Thay cây khối cầu giả bằng cây xanh thật đẹp hơn | Phase 5 | `PASS` | Dùng `tree-gian.glb` + `planter-near-ch.glb` đặt khít sàn |
| 12 | Nâng cấp bảng hiệu gian hàng rõ tên/số/khu & bỏ lặp tên trên HUD | Phase 6 | `PASS` | 2 mặt trước/sau, monogram, 2-line wrap, Focus HUD gọn |
| 13 | Tinh giản thanh điều khiển chính bớt rối mắt | Phase 7 | `PASS` | 3 nút chính + `⋯ Xem thêm` chứa đủ chức năng phụ |
| 14 | Tối ưu popup gian gần bạn: thu hẹp bán kính & đóng hẳn bằng nút `✕` | Phase 8 | `PASS` | `18.5 m → 11.5 m`, nút `✕` đóng thật, có `🧭 Chỉ đường` |

---

## 4. Audit 10 Gian Nông Sản (`?demoAgri=1`) & Bảng Audio Coverage Riêng

> **Lưu ý trung thực:** 85 file WAV pre-generated trong `FE/public/tts/pregen/manifest.json` được tạo cho 4 gian CELLPHONES baseline (`#1`, `#2`, `#11`, `#21`) và **cố ý không chỉnh sửa** theo nguyên tắc bảo toàn dữ liệu. Do đó, các câu giới thiệu sản phẩm mới của 10 gian nông sản demo sẽ là **manifest MISS → fallback động sang Piper WASM (`vi_VN-vais1000-medium`)** (không bao giờ nhầm với kết quả `70/70` pregen HIT của 4 gian baseline).

| Booth | Archetype | Khu | Doanh nghiệp Demo | Products | Narration chunks (ước tính theo 2 SP) | Pregen coverage | Dynamic fallback | First speech latency | Result |
|---|---|---|---|---:|---:|---|---|---|---|
| `#3` | `signature_ring` | A | HTX Dừa Xanh Bến Tre (Demo) | 2 | ~6–8 chunks | `0%` SP mới (giữ nguyên 85 WAV cũ) | Piper WASM (`vi_VN-vais1000-medium`) | Chưa đo trực tiếp từng gian (fallback WASM ~1–3s cold) | `PARTIAL` (fallback hợp lệ) |
| `#4` | `organic_flow` | A | Nông Trại Mật Ong Tây Nguyên (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#5` | `grand_portal` | A | Đà Lạt Farm Sấy Dẻo (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#6` | `wave_pavilion` | A | Vườn Trái Cây Miền Tây (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#7` | `gallery_arch` | A | Cà Phê Rang Mộc Buôn Ma Thuột (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#8` | `dynamic_frame` | A | Trà Shan Tuyết & Thảo Mộc (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#9` | `signature_ring` | A | Lúa Gạo Đồng Bằng Sông Cửu Long (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#10` | `organic_flow` | A | Hạt Dinh Dưỡng Bình Phước (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#12` | `wave_pavilion` | B | Gia Vị Đặc Sản Phú Quốc & Tây Bắc (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |
| `#13` | `gallery_arch` | B | Đồ Uống Nông Sản Tự Nhiên (Demo) | 2 | ~6–8 chunks | `0%` SP mới | Piper WASM | NT | `PARTIAL` (fallback hợp lệ) |

*(Tất cả 10/10 gian, 20/20 sản phẩm, đủ 6/6 archetypes, 2D+3D props, Product Detail, Highlight theo `boothId`/`slotId`/`productId` và Similar Booths đều đã xác minh **PASS**; chỉ đánh `PARTIAL` ở cột audio coverage vì chưa pre-gen WAV riêng cho 10 gian demo theo quy tắc không sửa 85 WAV cũ).*

---

## 5. Xác minh Model NPC (`untitled.glb` vs nhầm tên `woman.glb`)

- **Model thực tế đang load:** `FE/src/services/npcPresentationService.ts:78`:
  ```ts
  export const NPC_GLB_URL = `${import.meta.env?.BASE_URL || '/'}models/npc/untitled.glb?v=25.5`;
  ```
- **Tài nguyên trên đĩa (`FE/public/models/npc/`):**
  - `untitled.glb` (`1,219,748` bytes)
  - `untitled_lod1.glb` (`656,684` bytes)
  - `untitled_lod2.glb` (`344,480` bytes)
- **Git diff tài nguyên NPC:** `0` thay đổi (`git status --short -- FE/public/models` rỗng).
- **Kết luận:** Không hề thay đổi model NPC. Báo cáo `FINAL_QA.md` trước đó ghi nhầm tên thành `woman.glb` — **đã đính chính lại thành `/models/npc/untitled.glb`** trong `docs/round2/FINAL_QA.md`.

---

## 6. Kết quả Final E2E (Hành trình 25 bước)

| Bước | Mô tả hành trình | Kết quả | Bằng chứng |
|---:|---|---|---|
| 1 | Tải trang triển lãm 3D (`FE/dist/assets/index-B9IQKmdT.js`) | `PASS` | `final_acceptance_audit.mjs`, `0` runtime errors |
| 2 | Spawn trước cổng chào, avatar quay mặt `-Z` vào sảnh | `PASS` | `phase5_01_arch_and_trees.png` |
| 3 | Nhìn thấy rõ cổng chào **`CON ĐƯỜNG NÔNG SẢN`** + 2 logo Đoàn/Hội + cây thật | `PASS` | `phase5_01_arch_and_trees.png` |
| 4 | Thanh HUD chính gọn (3 nút chính + `⋯ Xem thêm`) | `PASS` | `phase7_01_hud_desktop_clean.png` |
| 5 | Biển chỉ dẫn khu vực + 3 chip chỉ hướng hiển thị ở cạnh dưới không che cổng | `PASS` | `signpostVisible: true`, `directionChipsCount: 3` |
| 6 | Không bật sớm popup Nearby tại spawn | `PASS` | `atSpawnVisible: false` |
| 7 | Mở Bản đồ 2D (`100/100` gian, `10/10` khu, chú giải 9 mục, cổng vào, hướng nhìn) | `PASS` | `map2dOpened: true`, `mapBoothCount: 101`, `phase4_01_map_desktop.png` |
| 8 | Đóng Bản đồ 2D mượt | `PASS` | `final_acceptance_audit.mjs` |
| 9 | Kích hoạt dẫn đường 3D (giữ chế độ Explore + mũi tên sàn + banner khoảng cách) | `PASS` | `guidedRouteActivated: true`, `phase2_02_active_3d_guided_route.png` |
| 10 | Hủy dẫn đường 3D sạch | `PASS` | `guidedRouteCancelled: true` |
| 11 | Di chuyển/chọn nhanh tới gian hàng (Focus mode) | `PASS` | `focusHudMeta: "#3 · Khu AĐiện thoại · 2/6 SP"` |
| 12 | Bảng hiệu 3D rõ monogram + `#số` + `KHU` + tên DN (không lặp trên HUD) | `PASS` | `phase6_01`, `phase6_02`, 4 ảnh `audit_signage_*` |
| 13 | Xem trưng bày sản phẩm 2D + 3D khít bệ (và Product Detail) | `PASS` | `phase3_agri_01..10`, `phase6_02` |
| 14 | Click trực tiếp NPC bắt đầu tư vấn âm thanh Hybrid TTS (không bảng điều khiển) | `PASS` | `phase1_02_npc_speaking_no_panel.png`, `70/70` chunks PASS |
| 15 | Highlight sản phẩm đồng bộ `boothId` / `slotId` / `productId` | `PASS` | `phase1_03_product_highlighted.png` |
| 16 | Tạm dừng / Tiếp tục đúng offset âm thanh | `PASS` | `phase1_04_npc_paused.png`, `PHASE_1_NPC_INTERACTION_QA_REPORT.md` |
| 17 | Bật/Tắt tiếng (`🔊/🔇`) trên Focus HUD | `PASS` | `muteToggleWorks: true` |
| 18 | Mở khung Chat NPC riêng theo yêu cầu & gửi tin nhắn | `PASS` | Xác nhận thực tế TC19 trong `PHASE_1_NPC_INTERACTION_QA_REPORT.md` (`V28NpcChatModal.tsx` không đổi từ Phase 1) |
| 19 | Hiển thị thẻ Gợi ý tối đa 3 gian hàng tương tự (`SimilarBoothsCard`) | `PASS` | `phase1_05_similar_booths.png` |
| 20 | Thoát Focus → bật thông báo Nearby (tối đa 3 gian, có `🧭 Chỉ đường` & `✕`) | `PASS` | `nearbyVisibleAfterExitFocus: true`, `phase8_01_nearby_card_visible.png` |
| 21 | Bấm `✕` đóng hẳn Nearby (không còn pill, không tự bật lại khi đứng yên) | `PASS` | `nearbyDismissedCleanly: true`, `phase8_02_nearby_closed_route_active.png` |
| 22 | Mở `⋯ Xem thêm` (Online, Hồ sơ, Quà tặng, Về trung tâm, Đồ họa 3D) | `PASS` | `moreMenuOpened: true`, `phase7_02_hud_desktop_more_menu.png` |
| 23 | Mở modal Quà tham quan & xác minh tracking hành trình BE | `PASS` | `rewardModalOpened: true` + `v28VisitorJourneyTracking.test.ts` & `v28RewardRedemption.test.ts` PASS |
| 24 | Tải lại trang (`Page.reload`) phục hồi sạch không lỗi | `PASS` | `reloadRecoveredCleanly: true`, `runtimeErrors: []` |
| 25 | Kiểm tra Mobile (`390×844`) không tràn ngang & hiển thị đủ điều khiển | `PARTIAL` | `mobileOverflowX: false`, `audit_mobile_hud_final.png` (Emulation; chưa test thiết bị vật lý thật) |

---

## 7. Danh mục Visual Acceptance Evidence (100% Screenshot thực tế)

Thư mục lưu trữ: `C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/`

- **Cổng chào, cây thật & hướng avatar:** `phase5_01_arch_and_trees.png`, `phase5_02_mobile_arch.png`
- **Chỉ dẫn khu vực & mũi tên chỉ đường 3D:** `phase2_01_spawn_and_signpost.png`, `phase2_02_active_3d_guided_route.png`, `phase2_03_mobile_navigation.png`
- **Bản đồ 2D (Desktop & Mobile):** `phase4_01_map_desktop.png`, `phase4_02_map_mobile.png`
- **Cả 10 gian nông sản (`?demoAgri=1`):** `phase3_agri_01.png` → `phase3_agri_10.png` (đủ 10/10 gian)
- **Biển hiệu đủ 6/6 Archetypes:**
  - `signature_ring`: `phase6_01_signage_focus_booth1.png`
  - `organic_flow`: `phase6_02_signage_focus_booth4.png`
  - `grand_portal`: `audit_signage_grand_portal_booth5.png`
  - `wave_pavilion`: `audit_signage_wave_pavilion_booth6.png`
  - `gallery_arch`: `audit_signage_gallery_arch_booth1.png`
  - `dynamic_frame`: `audit_signage_dynamic_frame_booth2.png`
- **NPC, Product Highlight, Pause & Similar Booths:** `phase1_01_npc_before_click.png`, `phase1_02_npc_speaking_no_panel.png`, `phase1_03_product_highlighted.png`, `phase1_04_npc_paused.png`, `phase1_05_similar_booths.png`, `phase1_06_mobile_viewport.png`
- **Thanh điều khiển Desktop / Tablet / Mobile:** `phase7_01_hud_desktop_clean.png`, `phase7_02_hud_desktop_more_menu.png`, `phase7_03_hud_tablet.png`, `audit_mobile_hud_final.png`
- **Nearby Notification trước & sau khi đóng `✕`:** `phase8_01_nearby_card_visible.png`, `phase8_02_nearby_closed_route_active.png`

*(Lưu ý: Toàn bộ là screenshot chụp trực tiếp từ Chrome chạy bundle thật; chưa có xác nhận duyệt thẩm mỹ từ lãnh đạo/khách hàng).*

---

## 8. Lỗi thực tế phát hiện trong Final Acceptance Audit & Cách xử lý

1. **Thiếu mặt sau bảng hiệu gian hàng (`P2-T14` — nhận diện tên/số gian từ phía sau/bên hông):**
   - *Nguyên nhân gốc:* `DynamicBooth3D.tsx` chỉ render `SIGN_BOARD_GEOM` ở mặt trước (`z = +0.045`), phía sau chỉ thấy tấm lưng tối `SIGN_BACK_MAT`.
   - *Sửa tối thiểu:* Thêm 3 dòng render mặt sau (`z = -0.045`, `rotation={[0, Math.PI, 0]}`) tái sử dụng `signTexture` & `SIGN_BOARD_GEOM` (0 texture mới). Đã rebuild (`index-B9IQKmdT.js`) và re-run `92/92` FE unit tests PASS.
2. **Ghi nhầm tên file model NPC trong `FINAL_QA.md` (`woman.glb` thay vì `untitled.glb`):**
   - *Nguyên nhân gốc:* Lỗi soạn thảo báo cáo; source code thực tế vẫn trỏ nguyên vẹn về `/models/npc/untitled.glb?v=25.5` (`0` git diff).
   - *Xử lý:* Đã đính chính trong `docs/round2/FINAL_QA.md`.

---

## 9. Git Diff cuối cùng

- **10 file FE chỉnh sửa (`+1544 / -518`):**
  - `FE/src/components/v28/DynamicWorldHud.tsx`
  - `FE/src/components/v28/InteractiveMap2D.tsx`
  - `FE/src/components/v28/NearbyDiscoveryWidget.tsx`
  - `FE/src/pages/DynamicExhibitionPage.tsx`
  - `FE/src/scene/SalesAssistantNpc.tsx`
  - `FE/src/scene/v28/DynamicBooth3D.tsx`
  - `FE/src/scene/v28/DynamicExhibitionScene.tsx`
  - `FE/src/scene/v28/V27VisualKit.tsx`
  - `FE/src/scene/v28/YouthEntranceArch3D.tsx`
  - `FE/src/services/npcWebAudioPlayer.ts`
- **12 file FE mới (code + unit tests):** `useNpcConsultationSession.ts`, `V28NpcChatModal.tsx`, `SimilarBoothsCard.tsx`, `NavigationGuidanceHud.tsx`, `NavigationPath3D.tsx`, `similarBooths.ts`, `v28AgriDemoShowcase.ts`, `v28NavigationEngine.ts`, `v28NpcInteractionPhase1.test.ts`, `v28NavigationPhase2.test.ts`, `v28AgriShowcasePhase3.test.ts`, `v28NearbyPhase8.test.ts`.
- **Tài liệu Round 2:** `docs/round2/` (`BASELINE.md`, `STATUS.md`, `PHASE_02.md` .. `PHASE_08.md`, `FINAL_QA.md`, `FINAL_ACCEPTANCE.md`).
- **0 thay đổi** trên `BE/`, `FE/public/tts/pregen/` (85 WAV + `manifest.json`), `FE/public/models/npc/`, `piperTtsWorker.ts`, `hybridTtsAdapter.ts`, `npcTtsConfig.ts`.

---

## 10. Giới hạn còn lại & Kết luận nghiệm thu nội bộ

- **Giới hạn còn lại (giữ nguyên trung thực):**
  1. **Thiết bị di động vật lý (iOS Safari / Android Chrome):** Chưa kiểm thử trên điện thoại thật (`PARTIAL` — mới xác minh trên Chrome Mobile Emulation `390×844`).
  2. **Biểu cảm khuôn mặt NPC:** `untitled.glb` không có facial morph targets; giữ procedural 8 xương thân trên đồng bộ biên độ âm thanh.
  3. **Audio pre-gen cho 10 gian nông sản demo:** 0% pre-gen WAV riêng (chạy fallback Piper WASM động) để bảo toàn tuyệt đối 85 WAV baseline & Production DB.
  4. **Duyệt thẩm mỹ cuối cùng:** Chờ người dùng / lãnh đạo trực tiếp xem screenshot và trải nghiệm.

- **Kết luận nghiệm thu nội bộ:** **ĐẠT NGHIỆM THU NỘI BỘ TRÊN PHẠM VI PC (`READY FOR USER REVIEW` — `0` FAIL, `96/105` PASS, `9/105` PARTIAL minh bạch, `92/92` FE tests, `67/67` BE tests, `70/70` baseline audio chunks `60 FPS`).** Dừng tại đây chờ chỉ đạo tiếp theo của người dùng.
