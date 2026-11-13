# Thiết kế lại 6 gian triển lãm và camera mặc định

Ngày: 2026-11-13. Baseline: `d47a123`. Repository sạch khi bắt đầu yêu cầu này (`git status --short` và `git diff` đều rỗng). Các nâng cấp ngoại cảnh của phiên trước đã nằm trong baseline; không phục hồi hoặc ghi đè chúng.

## A. Kết quả

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Audit | PASS | Xác định đúng đường render procedural, slot, thương hiệu, transform, collision và camera |
| Thiết kế 6 gian | PASS | Khung mở khác nhau, bỏ vỏ nhà/mái kín; ảnh architecture-1…6 |
| Biển hiệu | PASS | Giữ nguyên component và texture động; ảnh final-booth-1…6 |
| Trưng bày sản phẩm | PASS | 6/6 gian mở được modal qua click canvas; dữ liệu RAM hiện có 2 sản phẩm/gian, không tạo sản phẩm giả |
| Camera mặc định | PASS | Mở mới/reload đều Tham quan; chuyển Toàn cảnh, quay lại và wheel zoom hoạt động |
| TypeScript | PASS | `tsc --noEmit` trong frontend build |
| Build | PASS | `npm run build -w FE`, 679 modules; cảnh báo bundle >500 kB còn tồn tại |
| Regression | PASS trong phạm vi đã chạy | 31 unit/integration tests; camera, movement, touch/joystick giả lập, multiplayer localhost |
| Safety | PASS | Chỉ 2 file runtime về hình học booth, 1 test liên quan và tài liệu/script/ảnh QA; không commit/push/deploy |

### Audit và quyết định

- `Booth.tsx` → `cloneCachedAsset(getBoothGlbAssetId(theme))` → `buildBoothExteriorShell(theme)`. Luồng visitor hiện dựng shell bằng Three.js; không phải tải sáu GLB booth từ URL. Không ghi đè GLB hiện có.
- `resolveBoothTheme(booth)` vẫn ánh xạ dữ liệu thực sang tech/living/coffee/robotics/design/energy. Tên công ty, tên gian, màu thương hiệu, tagline, logo/banner và liên hệ tiếp tục đi qua `createBoothSignTexture` / `createEnterpriseBackdropTexture`, không đổi nguồn dữ liệu.
- `Booth.tsx`, `types/expo.ts`, `services/api.ts` giữ nguyên. Sáu slot giữ ID/thứ tự/binding/rotation/position: hero tại `(±0.88, 0.56, 0.92)`; kệ trên tại `(±2.44, 1.72, 0.68)`; kệ dưới tại `(±2.44, 0.42, 1.12)`. Không thay event handler, raycast hoặc anchor.
- Tâm gian giữ nguyên: Aether `(-12.5,-9)`, Nordic `(0,-13)`, EcoVita `(12.5,-9)`, Kinetix `(-12.5,9)`, Lumina `(12.5,9)`, Solaris `(0,13)`. Hướng quay vào quảng trường không đổi.
- Sàn kiến trúc cũ rộng 7.2 × 5.4; hộp collision dữ liệu nhỏ hơn (4.8/5.2 × 3.8). Đây là đặc điểm sẵn có. Chân khung mới tại x=±2.22, z=-1.65 nằm trong vùng collision cũ; các thanh trên cao nối tới biển hiện có. Không mở rộng bố trí gian, không sửa collision hoặc đường đi.
- `ExhibitionPage.tsx:121` đã là `useState<CameraViewMode>('explore')`. Không sửa camera vì yêu cầu đã đúng. Luồng focus, khôi phục mode trước focus, zoom và preview từ Admin giữ nguyên. Không có cơ chế lưu camera preference trong luồng khởi tạo được audit; không thêm cơ chế mới.
- Sau booth QA mới thực hiện xác minh camera; không có thay đổi camera trước hoặc sau QA.

### Sáu thiết kế

| Gian theo dữ liệu | Hình thái mới |
|---|---|
| Aether Tech Lab | Khung kim loại kép, viền cyan, thanh trang trí dạng mạch |
| Nordic Living Studio | Pergola gỗ thưa, cánh nan gỗ phía sau, không có mái dốc hoặc tường kín |
| EcoVita Roastery & Craft | Gỗ ấm, thanh đồng, dải canopy nan hẹp và cấu kiện mở |
| Kinetix Robotics & AI | Giàn tam giác công nghiệp, thanh chéo, khớp và vòng liên kết |
| Lumina Design Collective | Ba vòm cong lệch, màu trung tính/hồng, không gian mở quanh display |
| Solaris Clean Energy | Khung nhẹ xanh, cánh pin có khe hở, giá đỡ cho cụm pin trang trí hiện hữu |

Không thêm realtime light. Fixture dùng vật liệu emissive; giữ nguồn sáng ngoại cảnh. Geometry/material tiếp tục được cache và dùng chung giữa clone. Mỗi shell vẫn vượt kiểm tra chi tiết 2.500 tam giác và có số tam giác khác nhau. Test tổng polygon cũ `>40000` được thay bằng mức chi tiết tối thiểu và ngân sách `<100000`, tránh buộc mô hình tối ưu phải tăng polygon vô ích.

## B. File thay đổi

| File | Thay đổi / lý do | Ảnh hưởng chức năng |
|---|---|---|
| `FE/src/scene/exhibitionBoothShells.ts` | Module mới dựng sáu bộ khung mở, vật liệu, khớp, thanh đỡ và fixture | Chỉ hình học render; không dữ liệu/sự kiện |
| `FE/src/scene/architecturalModels.ts` | Import helper, đổi duy nhất dispatch `buildBoothExteriorShell`, dùng lại nền với đúng màu cũ | Giữ interface và cache; các builder ngoại cảnh nguyên vẹn |
| `FE/src/__tests__/movementAndPathfinding.test.ts` | Điều chỉnh assertion ngân sách tam giác sau bỏ mái/vách kín | Chỉ test; không thay kiểm tra slot, movement, collision hoặc cache |
| `qa-reports/booths-redesign.cjs` | QA focus và click modal cho 6 gian | Script localhost, không ghi API |
| `qa-reports/camera-booth-redesign.cjs` | QA khởi tạo/reload/mode/zoom/thoát gian; chụp kiến trúc và góc visitor | Inspector camera chỉ nằm trong browser QA, không sửa controller ứng dụng |
| `qa-reports/smoke-booth-redesign.cjs` | Hồi quy từ harness cũ, output riêng và thời gian chờ fallback phù hợp | Database RAM; không sửa dữ liệu thật |
| `qa-reports/booth-redesign/` | Screenshot thật và JSON bằng chứng | Không runtime |
| `qa-reports/BOOTH_REDESIGN_REPORT.md` | Báo cáo này | Không runtime |

## C. Screenshot thực tế

[Mặc định Tham quan](booth-redesign/default-explore.png) · [Toàn cảnh sáu gian sau chuyển mode](booth-redesign/overview-six.png).

| Gian | Toàn bộ kiến trúc | Góc visitor | Cận cảnh / sản phẩm |
|---|---|---|---|
| Aether | [Ảnh](booth-redesign/architecture-1.png) | [Ảnh](booth-redesign/visitor-1.png) | [Cận](booth-redesign/final-booth-1.png) / [Modal](booth-redesign/final-product-1.png) |
| Nordic | [Ảnh](booth-redesign/architecture-2.png) | [Ảnh](booth-redesign/visitor-2.png) | [Cận](booth-redesign/final-booth-2.png) / [Modal](booth-redesign/final-product-2.png) |
| EcoVita | [Ảnh](booth-redesign/architecture-3.png) | [Ảnh](booth-redesign/visitor-3.png) | [Cận](booth-redesign/final-booth-3.png) / [Modal](booth-redesign/final-product-3.png) |
| Kinetix | [Ảnh](booth-redesign/architecture-4.png) | [Ảnh](booth-redesign/visitor-4.png) | [Cận](booth-redesign/final-booth-4.png) / [Modal](booth-redesign/final-product-4.png) |
| Lumina | [Ảnh](booth-redesign/architecture-5.png) | [Ảnh](booth-redesign/visitor-5.png) | [Cận](booth-redesign/final-booth-5.png) / [Modal](booth-redesign/final-product-5.png) |
| Solaris | [Ảnh](booth-redesign/architecture-6.png) | [Ảnh](booth-redesign/visitor-6.png) | [Cận](booth-redesign/final-booth-6.png) / [Modal](booth-redesign/final-product-6.png) |

Ảnh architecture/visitor dùng inspector camera để đánh giá hình học; ảnh default-explore và overview-six dùng camera ứng dụng. Không dùng ảnh AI.

JSON: [6 gian và click](booth-redesign/booths-final.json), [camera và HTTP GLB](booth-redesign/camera-results.json), [hồi quy](booth-redesign/smoke-results.json).

## D. Phạm vi kiểm thử và vấn đề còn lại

- Đã chạy frontend typecheck/build; 22 FE tests và 9 BE integration tests với database RAM. Các test BE kiểm tra API/realtime, không sửa mã BE.
- Browser QA kiểm tra mở mới/reload Tham quan, chuyển mode, wheel zoom, focus/thoát cả sáu gian, click canvas mở modal ở từng gian, WASD, click-to-move, xoay chuột, touch/joystick qua CDP, hai browser visitor nhận vị trí avatar remote, GLB và fallback khi abort asset.
- NOT RUN: thiết bị di động vật lý, soak test dài hạn, mọi góc camera có thể có, bộ dữ liệu người dùng tùy chỉnh với đủ 6 slot mỗi gian, preview từ Admin qua UI có đăng nhập và toàn bộ luồng CRUD Admin → Visitor bằng hai UI. Không báo PASS những mục này; API/realtime RAM không thay thế kiểm thử UI đó.
- Console smoke có một 404 không xác định URL qua response listener; không có page error/WebGL error hoặc lỗi HTTP GLB trong lượt normal camera QA. Chưa xác định nguồn 404 nên không kết luận đó là favicon.
- Vite vẫn cảnh báo bundle lớn hơn 500 kB; không tách bundle hoặc cài dependency vì ngoài phạm vi. SQLite có cảnh báo experimental từ môi trường Node.
- Có lượt QA ban đầu bị HMR/timeout trong lúc chỉnh hình học; chỉ kết quả chạy lại trên nguồn ổn định được dùng để kết luận.
- Các builder nhà cũ và GLB booth cũ giữ lại để giảm diff, nhưng visitor runtime dùng dispatch mới. Nếu một công cụ riêng gọi trực tiếp builder cũ hoặc chủ động tải GLB cũ, công cụ đó chưa được chuyển đổi.
- Không cần phê duyệt bổ sung cho thay đổi mã. Quyền chạy Chrome và backend ngoài sandbox đã được xin qua công cụ do giới hạn môi trường; không có publish/deploy.

Safety: không sửa `BE/`, database, seed, API, auth, Admin, socket/realtime, ID/binding sản phẩm, `Booth.tsx`, camera/controller, movement/pathfinding/collision, `Environment.tsx`, `ExteriorAssets.tsx`, cây/props/đường/nhà/đài phun nước, ánh sáng hoặc GLB. Không cài dependency, không commit, không push, không deploy.
