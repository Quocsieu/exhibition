# Báo cáo nâng cấp đồ họa môi trường Virtual Expo — 12/11/2026

Đã triển khai trực tiếp vào workspace. Có 9 biến thể mô hình GLB ngoại nhập thực sự được render và 5 file LOD, tổng cộng 3.008.072 byte. Cả 6 gian hàng đã mở và click sản phẩm trên canvas để kiểm tra modal. Chưa kết luận đã nghiệm thu toàn bộ: kiểm tra Admin–Visitor qua hai giao diện trình duyệt và thiết bị mobile thật vẫn NOT RUN.

**A. Phân tích source ban đầu**

| Đối tượng | Công nghệ trước sửa | Vấn đề quan sát | Thay đổi |
|---|---|---|---|
| Cây | Lathe/TubeGeometry, procedural foliage; clone template đồng bộ | Lá thành khối, cây lặp hình | Hai cây lá rộng và một birch ngoại nhập, texture vỏ/lá, alpha-test |
| Đài phun | `buildCentralPlazaFountainModel`, LatheGeometry | Khối tròn xoay, hiệu ứng cầu/vòng sáng rời mô hình | Santo Spirito Fountain có bồn đa giác, chi tiết bậc/trụ và dòng nước |
| Đèn | Template procedural Lathe/Tube | Hình dựng trong code, không tải asset | GLB đèn có texture/mặt phát sáng |
| Ghế | Các thanh/khung procedural | Nhiều mesh lặp | GLB ghế gỗ/kim loại, chia sẻ và instancing |
| Nhà nền | Box/Cone instancing + facade canvas | Cửa sổ chỉ là texture | Hai GLB Kenney có khung cửa, cửa ra vào, ban công/chi tiết mái |
| Hoa | Dodecahedron/Icosahedron | Hoa giống quả cầu | Cụm hoa GLB thấp trên đất bồn |
| Sân | MeshStandardMaterial, canvas albedo và bump | Bump gạch vuông không khớp albedo gạch so le, dùng height làm roughness | Height/roughness tuyến tính riêng, cùng pattern/repeat với albedo |

Trước sửa đã có 12 GLB trong `public/models`, nhưng `cloneCachedAsset()` gọi builder đồng bộ. `loadGlbAssetFromUrl()` trả cache procedural nếu có sẵn; Environment không gọi loader bất đồng bộ. Lượt đo trước ghi **0 request GLB**. Vì vậy không coi những file cũ là mô hình ngoại nhập đang được render. Bản snapshot đầu phiên nằm trong `Environment.before.txt` và `assetLoader.before.txt`.

Cache cũ chia sẻ geometry/material giữa clone; props nhỏ dùng Drei Instances. Render sẵn có ACESFilmic, sRGB, DPR 1–1,5, directional shadow 1024², ambient/hemisphere và fill lights. Giữ cấu hình này; không thêm postprocessing hay dependency ứng dụng. Không có ngân sách draw calls chính thức trong source. Baseline thực đo được ghi ở mục F.

**B. Procedural được thay thế**

- 16 cây tại các vị trí X/Z cũ; cây ngoài quảng trường đặt chân ở mặt nền -0,75, cây trong bồn đặt chân tại 0,44.
- 1 đài phun ở tâm; bao hình thực đo khoảng X ±1,584, Z ±1,65, nằm trong collision cố định X/Z ±2,4. Không sửa collision.
- 8 ghế, 8 đèn, 12 nhà nền, 16 cụm hoa.
- Thân bồn, đất, 6 urn trang trí, đường, đồi, ô che và các đồ phụ vẫn procedural/hybrid; không gọi chúng là GLB mới.
- `env-tree-pine` là ID vị trí cũ, nay dùng cây lá rộng biến thể thứ hai; `env-tree-blossom` dùng birch. Không tuyên bố đây là cây thông/cây hoa mới. File cụm Pine Trees đã bị loại sau khi phát hiện nhiều gốc lơ lửng quanh bồn.

**C. GLB thực tế, nguồn và giấy phép**

Tất cả file dưới `FE/public/models/exterior/`. Danh sách đầy đủ từng file, dung lượng, tác giả và nguồn ở [CREDITS.md](../public/models/exterior/CREDITS.md), dữ liệu máy đọc ở [sources.json](../public/models/exterior/sources.json). Mỗi GLB cũng có attribution trong `asset.copyright`.

| File | Bytes | Source / author | License | Object |
|---|---:|---|---|---|
| [etFGNvsiFv.glb](../public/models/exterior/etFGNvsiFv.glb) | 388708 | [Quaternius](https://poly.pizza/m/etFGNvsiFv) | CC0 1.0 | Tree A |
| [etFGNvsiFv-lod.glb](../public/models/exterior/etFGNvsiFv-lod.glb) | 324144 | [Quaternius](https://poly.pizza/m/etFGNvsiFv) | CC0 1.0 | Tree A LOD |
| [R7qMWzb7nk.glb](../public/models/exterior/R7qMWzb7nk.glb) | 439468 | [Quaternius](https://poly.pizza/m/R7qMWzb7nk) | CC0 1.0 | Birch |
| [R7qMWzb7nk-lod.glb](../public/models/exterior/R7qMWzb7nk-lod.glb) | 404288 | [Quaternius](https://poly.pizza/m/R7qMWzb7nk) | CC0 1.0 | Birch LOD |
| [7b_tCaBRLCI.glb](../public/models/exterior/7b_tCaBRLCI.glb) | 152436 | [Don Carson](https://poly.pizza/m/7b_tCaBRLCI) | CC-BY 3.0 | Fountain |
| [kn0sMwbspb.glb](../public/models/exterior/kn0sMwbspb.glb) | 23864 | [J-Toastie](https://poly.pizza/m/kn0sMwbspb) | CC-BY 3.0 | Bench |
| [RO32ltX6zJ.glb](../public/models/exterior/RO32ltX6zJ.glb) | 37592 | [MiniPoly](https://poly.pizza/m/RO32ltX6zJ) | CC0 1.0 | Street lamp |
| [ppwtREejXg.glb](../public/models/exterior/ppwtREejXg.glb) | 98008 | [Kenney](https://poly.pizza/m/ppwtREejXg) | CC0 1.0 | City A |
| [ppwtREejXg-lod.glb](../public/models/exterior/ppwtREejXg-lod.glb) | 92820 | [Kenney](https://poly.pizza/m/ppwtREejXg) | CC0 1.0 | City A LOD |
| [yKo7F36Qk2.glb](../public/models/exterior/yKo7F36Qk2.glb) | 42188 | [Kenney](https://poly.pizza/m/yKo7F36Qk2) | CC0 1.0 | City B |
| [yKo7F36Qk2-lod.glb](../public/models/exterior/yKo7F36Qk2-lod.glb) | 40060 | [Kenney](https://poly.pizza/m/yKo7F36Qk2) | CC0 1.0 | City B LOD |
| [etFGNvsiFv-variant.glb](../public/models/exterior/etFGNvsiFv-variant.glb) | 494684 | [Quaternius](https://poly.pizza/m/etFGNvsiFv) | CC0 1.0 | Tree B |
| [etFGNvsiFv-variant-lod.glb](../public/models/exterior/etFGNvsiFv-variant-lod.glb) | 432052 | [Quaternius](https://poly.pizza/m/etFGNvsiFv) | CC0 1.0 | Tree B LOD |
| [NBUxHir6FJ.glb](../public/models/exterior/NBUxHir6FJ.glb) | 37760 | [Quaternius](https://poly.pizza/m/NBUxHir6FJ) | CC0 1.0 | Flowers |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . CC BY 3.0: https://creativecommons.org/licenses/by/3.0/ . Không dùng asset trả phí. Những bản phân phối được chọn trên Poly Pizza ghi rõ giấy phép; không suy rộng giấy phép đó sang các bộ mới của cùng tác giả.

Tối ưu bằng glTF Transform: tách biến thể khỏi layout trưng bày, prune, weld, dedup, texture WebP tối đa 1024px (hoa 512px), vật liệu cây phi kim/alpha mask, LOD simplify ratio mục tiêu 0,45 với error 0,002. Không bật Draco/Meshopt decoder ở runtime vì dung lượng này không cần thêm decoder. Meshoptimizer chỉ dùng offline để simplify. `rebuild-assets.cjs` mô tả pipeline tái tạo, cần công cụ tạm và quyền mạng.

**D. File thay đổi**

- `FE/src/scene/Environment.tsx`: tích hợp nhóm GLB, giữ vị trí, bỏ hiệu ứng vòng/cầu cũ, sửa PBR sân.
- `FE/src/scene/ExteriorAssets.tsx`: module mới — GLTFLoader, cache promise chống request trùng, normalize, instancing, LOD theo khoảng cách 42 m, culling từng instance, giới hạn shadow caster, fallback có log, ref-count và giải phóng geometry/material/texture khi consumer cuối unmount. Không tạo GPU resource mỗi frame.
- `FE/src/scene/sceneTextures.ts`: thêm height/roughness sidewalk khớp mạch gạch.
- `FE/public/models/exterior/`: 14 GLB và thông tin nguồn/giấy phép.
- `FE/graphics-audit/`: ảnh, số đo, script kiểm chứng, snapshot source và báo cáo này.

`architecturalModels.ts` đã có thay đổi chưa commit khi bắt đầu; phiên này không chỉnh file đó. `Environment.tsx` cũng đã có thay đổi sẵn, được giữ làm nền nâng cấp. Không sửa `ExhibitionScene.tsx`, `assetLoader.ts`, package/lockfile hoặc mã nghiệp vụ. Pipeline mới tách khỏi cache booth hiện tại để tránh thay đổi gian hàng.

**E. Ảnh trước/sau**

| Góc | Trước | Sau |
|---|---|---|
| Overview | [Ảnh](before-overview.png) | [Ảnh](after-overview.png) |
| Explore | [Ảnh](before-explore.png) | [Ảnh](after-explore.png) |
| Cây | [Ảnh](before-tree.png) | [Ảnh](after-tree.png) |
| Đài phun | [Ảnh](before-fountain.png) | [Ảnh](after-fountain.png) |
| Nhà nền | [Ảnh](before-building.png) | [Ảnh](after-building.png) |
| Mobile viewport | [Ảnh](before-mobile.png) | [Ảnh](after-mobile.png) |

Camera/viewport cố định trong `capture.cjs`: desktop 1440×900, mobile viewport 390×844, deviceScaleFactor 1. Close-up cây [24,5,15] nhìn [20,5;3;18,5]; đài phun [5,4,6] nhìn [0,1,0]; nhà [-16,9,-18] nhìn [-23,6,-33], FOV45. Không đổi vị trí camera để làm ảnh sau đẹp hơn. Script chụp dùng camera tạm, không chỉnh camera controls ứng dụng. Dữ liệu `camera` trong ba dòng close-up của baseline JSON là camera ứng dụng nền; camera chụp thật là các preset trên. Lượt sau đã ghi đúng camera chụp.

Ảnh bổ sung của cả sáu gian hàng: [1](after-booth-1.png), [2](after-booth-2.png), [3](after-booth-3.png), [4](after-booth-4.png), [5](after-booth-5.png), [6](after-booth-6.png). Modal tương ứng: [1](after-product-1.png), [2](after-product-2.png), [3](after-product-3.png), [4](after-product-4.png), [5](after-product-5.png), [6](after-product-6.png). Đã mở kiểm tra sáu ảnh showroom. Không có ảnh tham chiếu game đính kèm ngoài nội dung master prompt, nên không xác nhận khớp một hình tham chiếu cụ thể.

**F. FPS, draw calls và hiệu năng**

| View | FPS before / after | Draw calls before / after | Triangles before / after |
|---|---:|---:|---:|
| explore | 115.2 / 116.2 | 472 / 367 | 79189 / 94894 |
| overview | 73.6 / 71.1 | 1007 / 724 | 153401 / 189048 |
| tree | 112.4 / 87.6 | 83 / 70 | 12304 / 28184 |
| fountain | 74.4 / 79.8 | 355 / 287 | 56899 / 93260 |
| building | 119.0 / 120.0 | 29 / 36 | 6252 / 12422 |
| mobile | 120.0 / 120.0 | 261 / 210 | 48141 / 53204 |

Nguồn: [before.json](before.json), [after.json](after.json). Chrome headless trên máy hiện tại; mỗi góc warm-up 2,5 giây, lấy 120 nhịp requestAnimationFrame. Draw calls/triangles đọc từ `renderer.info.render`, gồm cảnh ứng dụng được render tại góc đó. Đây là mẫu ngắn, không phải benchmark dài hạn hay kết quả GPU của điện thoại. Mobile chỉ đổi viewport trên desktop. FPS dao động theo tải máy/vsync; không khẳng định đạt cùng kết quả trên laptop/mobile khác. Chi tiết cây tăng triangles và texture; giảm draw calls không đồng nghĩa mọi góc tăng FPS.

**G. Kiểm thử PASS / FAIL / NOT RUN**

| Mục bắt buộc | Trạng thái | Bằng chứng/phạm vi |
|---|---|---|
| Central Plaza overview | PASS | Đã mở ảnh trước/sau để kiểm tra |
| Góc tham quan | PASS | Render/capture trên Chrome |
| Cận cảnh gian hàng | PASS cả sáu | `after-booth-1.png` đến `after-booth-6.png` |
| Cây không xuyên đất | PASS trong các ảnh đã kiểm tra | Root normalization, chân cây đúng cao độ; ảnh cây/overview |
| Đài phun không vượt collision | PASS | Bounding box đo runtime, `interactions.json`; đường đi giữ nguyên |
| Texture các GLB mới | PASS trong các góc đã kiểm tra | Lá/vỏ/đèn render; GLB đóng gói texture |
| GLB tải không lỗi | PASS | 14 response HTTP 200; 9 batch thực render |
| Z-fighting | PASS trong góc chụp; NOT RUN khảo sát mọi góc | Không thấy lỗi trong ảnh đã mở |
| Không che bảng hiệu | PASS overview/explore và sáu góc focus đã chụp | Cây giữ vị trí bên ngoài; ảnh tương ứng |
| Không che sản phẩm | PASS sáu góc showroom đã chụp | Sản phẩm đang trưng bày nhìn thấy được; không kiểm tra mọi góc camera có thể có |
| WASD | PASS smoke test phím D; PASS unit movement | Camera theo nhân vật có thay đổi vị trí |
| Joystick | PASS input touch mô phỏng | CDP touch kéo joystick làm vị trí thay đổi |
| Kéo chuột xoay camera | PASS | Quaternion thay đổi sau drag |
| Cảm ứng xoay camera | PASS input touch mô phỏng | CDP touch; NOT RUN trên thiết bị thật |
| Collision/pathfinding | PASS unit | 22 tests trong `movementAndPathfinding.test.ts` |
| Click gian hàng | PASS nút UI; NOT RUN raycast click trực tiếp mesh | Focus Aether |
| Click sản phẩm/modal | PASS | Click chuột trên tọa độ chiếu của mesh sản phẩm; modal mở ở cả sáu gian hàng, `booths.json` |
| Admin cập nhật, Visitor nhận realtime | PASS bài test API/Socket hiện có; NOT RUN hai UI browser | 8 test backend chạy SQLite `:memory:`, không đổi DB dự án |
| Desktop responsive | PASS viewport đã chụp | 1440×900; không khẳng định mọi độ rộng |
| Mobile responsive | PASS viewport mô phỏng | 390×844, không tràn ngang; NOT RUN thiết bị thật |
| TypeScript | PASS | `npm run typecheck -w FE`; build cũng chạy `tsc --noEmit` |
| Production build | PASS | `npm run build -w FE` |
| WebGL console errors | PASS trong lượt kiểm tra | Không page error/WebGL error; xem ngoại lệ HTTP trong JSON |
| Đo FPS/draw calls | PASS | Hai JSON và bảng F |
| Fallback khi tải GLB lỗi | PASS | Chặn toàn bộ URL GLB; 9 cảnh báo fallback, canvas còn hoạt động |

[interactions.json](interactions.json) và [booths.json](booths.json) chứa kết quả và dữ liệu quan sát. Tổng 30 test sẵn có PASS: 22 FE và 8 BE (`npm exec -- vitest run BE/src/__tests__/expoBackendAndRealtime.test.ts` chạy riêng DB in-memory). Lượt kiểm tra đầu bị timeout do script tìm nút Tham quan trong chế độ focus; đã sửa script và chạy lại thành công. Không sửa ứng dụng để làm test PASS.

**H. Chức năng giữ nguyên**

Không sửa backend/database/API/Socket.IO/Admin/auth/routing; không sửa cấu trúc booth, 6 boothId, slotId, tên doanh nghiệp, giá/hình sản phẩm, product modal, camera controls, WASD/joystick, movement/collision/pathfinding. Đây là kết luận về phạm vi diff; chỉ các kiểm thử liệt kê PASS ở G mới được xác nhận runtime.

**I. Hạn chế còn lại**

- Chưa đủ các điều kiện nghiệm thu toàn bộ vì các mục NOT RUN ở G.
- Lá alpha-mask có thể còn shimmer ở xa; chưa benchmark dài hạn/memory soak hoặc đo thiết bị mobile thật.
- LOD bật theo khoảng cách, không crossfade; cây/nhà giữ palette tác giả. Chưa có HDR environment map hay PBR đá quét cho đài phun; sân là PBR canvas có map dữ liệu khớp nhau, không phải texture scan ngoại nhập.
- 6 urn cùng một số props phụ vẫn procedural. Cây hoa chuyên biệt chưa tích hợp; birch thay vị trí blossom cũ được ghi rõ.
- Build cảnh báo JS bundle lớn ~1,406 MB (gzip ~392 KB). Không refactor bundle hoặc tính năng ngoài phạm vi.
- Có HTTP 404 trong lượt tương tác, ghi tại `interactions.json`; không có GLB mới trả lỗi.
- Không có thay đổi được commit/deploy trong phiên này.
