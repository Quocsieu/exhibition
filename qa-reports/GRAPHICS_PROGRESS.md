# Tiếp tục đồ họa — 13/11/2026

## Trạng thái khôi phục

HEAD `f7a726b`, branch main, working tree sạch lúc bắt đầu. Đã kiểm tra status, diff/stat (rỗng), untracked (không có), lịch sử và module Environment/ExteriorAssets/assetLoader/sceneTextures, script import và Blender, báo cáo cũ. Có thay đổi đã commit bởi các phiên khác: 63d7e25, 66c043e, 13de910 (đồ họa), f226e9c (realtime). Không khôi phục trạng thái từ bản ghi hội thoại cũ.

| Hạng mục | Trạng thái đầu phiên | Bằng chứng / còn lại |
|---|---|---|
| Cây | DONE | GLB 3 biến thể, ảnh continuation-baseline-tree.png; giữ nguyên |
| Đài phun | PARTIAL | GLB Don Carson render thành công; đá phẳng, nền xanh tương phản |
| Đèn | DONE | GLB MiniPoly đã tích hợp, ảnh phiên trước |
| Ghế | DONE | GLB J-Toastie, thấy rõ trong ảnh đài phun mới |
| Bồn hoa | PARTIAL | Hoa GLB quá nhỏ; urn và bin procedural |
| Nhà nền | PARTIAL | 4 GLB Blender có thật; mái hộp, lan can kín, kính bị che bởi frame |
| Đường/vỉa hè | DONE theo ảnh trước | Đã có manhole/drain/curb; cần kiểm chứng lại |
| Vật liệu | PARTIAL | Đá fountain, data-map color space cần rà soát |
| Hiệu năng | PARTIAL | LOD nhà có cùng dung lượng; nhiều mesh riêng; cần đo mới |

## Quy tắc tiếp tục

Không overwrite GLB cũ, không chạy generator cũ (có ghi đè), không reset/clean/commit/push/deploy. Chỉ code ngoại cảnh và QA. Giữ nguyên cây và layout/collision. Các báo cáo cũ không phải bằng chứng của phiên hiện tại.

## Đã triển khai và kiểm chứng

- DONE đài phun: giữ GLB Don Carson, thêm exteriorStone.ts height/UV limestone + màu/roughness. Build/typecheck thành công; ảnh continuation-fountain-fountain.png đã mở.
- DONE nhà nền về hình học: `city_detail_v2_01..04.glb` và LOD đang được specs tải. Mái dốc, lan can hở, kính/khung và cửa sổ bên. Build và screenshot architecture-after đã kiểm tra. Bản gộp 6–10 primitives giảm draw calls; LOD v2 còn 48% triangles. Hiệu năng tổng thể vẫn PARTIAL, không cam kết 60 FPS.
- Hai thử nghiệm city_final và city_runtime bị loại: glTF Transform không giảm triangles do cạnh cứng; decimate mạnh mất lan can. Không dùng chúng. 24 GLB thử được chuyển nguyên vẹn (SHA256 khớp) vào qa-reports/graphics-continuation/rejected-models/, không bị xóa hoặc ghi đè.
- DONE props: `planter_fluted_01.glb`, `recycling_bin_01.glb` do create_exterior_props.py tạo; bounds cũ, vị trí cũ. Hoa Quaternius có envelope .55/.3/.55 thay .5/.12/.5. Build PASS và ba ảnh props-after đã mở.
- Vật liệu đường/vỉa hè: bỏ dùng height làm roughness, asphalt .92 và metalness 0; paving .78/0. Đang build/capture cuối.
- Cây/đèn/ghế, camera/collision và tất cả nghiệp vụ giữ nguyên.

## File code sửa / mới

Environment.tsx, ExteriorAssets.tsx; mới exteriorStone.ts. Asset mới 8 city_detail_v2 (near+LOD), 2 props. Script Blender refine_exterior_city.py/create_exterior_props.py; finalize_exterior_city.py và optimize-city-continuation.cjs chỉ phục vụ thử nghiệm bị loại. Credits mới CONTINUATION_CREDITS.md. QA capture/smoke/booths và ảnh dưới qa-reports; ảnh trước đài phun mới dưới FE/graphics-audit/continuation-*.

## Kiểm thử và tiến trình đang chạy

FE 127.0.0.1:5180 session65775. BE port4000 session41776 chạy SQLITE_DB_PATH=:memory: (ngoài sandbox vì tsx userInfo lỗi). Không dùng DB dự án. Các build fountain/architecture/props PASS; warning bundle >500KB tồn tại. Typecheck riêng PASS trước nhóm nhà; mỗi build đều tsc --noEmit.

Final build session16062; final capture session19138 (12 views, dài vài phút); unit FE+BE session53722 chưa nhận kết quả. Chưa chạy smoke-graphics-continuation.cjs và booths-graphics-continuation.cjs mới. Smoke thêm click-to-move và multiplayer hai trình duyệt. **Không ghi PASS trước khi đọc kết quả.**

Capture đầu continuation-baseline dừng ở mobile vì offline toast che nút camera; có 5 ảnh, không có JSON. Đã xử lý môi trường bằng BE RAM, không sửa UI. Sandbox chặn ảnh sản phẩm; capture chính thức ngoài sandbox chỉ còn 404 cần xác định. Không có WebGL/page error trong các nhóm đã chụp. NOT RUN thiết bị mobile vật lý, soak dài, Admin→Visitor qua hai UI trong phiên này.

## Bước tiếp theo

1. Đọc kết quả final build/capture và unit sessions, xem ảnh final đường/mobile/overview.
2. Chạy smoke + booths (cần browser ngoài sandbox), đọc JSON, xem đủ 6 showroom. Điều tra nếu FAIL, chỉ sửa ngoại cảnh nếu nguyên nhân ngoại cảnh.
3. Hoàn thiện CONTINUATION_CREDITS và GRAPHICS_UPGRADE_CONTINUATION.md A–J; số đo từ JSON thật, đánh dấu NOT RUN rõ.
4. Kiểm tra git diff/scope và hash GLB tracked không đổi. Không commit/push/deploy. Báo cáo hiệu năng còn hạn chế, không tuyên bố hoàn tất toàn bộ nghiệm thu nếu chưa chạy.
