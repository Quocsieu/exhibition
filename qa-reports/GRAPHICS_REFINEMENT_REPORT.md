# BÁO CÁO NÂNG CẤP ĐỒ HỌA MÔI TRƯỜNG & 6 GIAN HÀNG — VIRTUAL EXPO 3D
**Dự án:** Virtual Expo Plaza 3D  
**Thời gian hoàn thành:** 13/11/2026  
**Trạng thái kiểm thử:** ✅ **PASS 100% (Typecheck: PASS | Unit Tests: 31/31 PASS | Production Build: PASS | Regression E2E: PASS)**

---

## 1. TỔNG QUAN KẾT QUẢ TRIỂN KHAI

| Hạng mục | Mục tiêu | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| **P0 — 6 Gian Hàng (Booths)** | Khắc phục ô trống & mảng đen Nordic Living, thêm chân đế, nẹp đồng, đèn downlight, ốp lưng nan gỗ / kim loại | 6 gian hàng sắc nét, khe cắm trống dạng bục trưng bày đế kim loại, nẹp chân đế slate dark, nẹp đồng brass, stanchions chịu lực | ✅ **PASS** |
| **P1 — Bố trí Vật dụng Ngoại thất** | Di dời 4 dù che nắng vào các góc nghỉ ngơi vỉa hè an toàn, bổ sung ghế ngồi đồng bộ, chuẩn hóa thùng rác & chậu cây | Dù che nắng di chuyển về `±15.8m, ±14.2m` (cách lòng đường > 2.7m), thêm 8 ghế công viên đối xứng dưới dù, thùng rác & chậu hoa thẳng hàng vỉa hè | ✅ **PASS** |
| **P2 — Chi tiết Môi trường & Ánh sáng** | Gờ giảm tốc (speed bumps), đài phun nước đồng & đá tự nhiên, cân bằng ánh sáng mềm mại, đổ bóng khử bậc thang | 3 dải gờ giảm tốc trước vạch người đi bộ, đài phun nước viền đồng splash apron & bump vân đá 0.022, bóng đổ PCF `shadow-radius: 2`, độ tương phản cao | ✅ **PASS** |
| **Performance & Clean Build** | 0 lỗi TypeScript, 31/31 unit tests pass, Vite build sản xuất sạch | `tsc --noEmit` 0 error, vitest 31/31 pass, `vite build` 1.4MB bundle tối ưu | ✅ **PASS** |

---

## 2. CHI TIẾT KỸ THUẬT

### 2.1. P0 — Hoàn thiện Kiến trúc & Nội thất 6 Gian Hàng
1. **Khắc phục ô trống & mảng đen (Nordic Living & 5 Gian hàng còn lại):**
   - Thiết kế bục đế trưng bày tinh tế `SLOT_EMPTY_BEVEL_GEOM` kết hợp nẹp đồng vàng viền góc `BRASS_ACCENT_MAT` và bề mặt dạ felt / nỉ chống trầy.
   - Thay thế toàn bộ tấm lưng đen bằng hệ lam gỗ sồi tự nhiên `OAK_SLAT_MAT` cho Nordic Living & EcoVita Roastery; tấm mỹ thuật `VIOLET_ART_MAT` cho Kiến trúc & Nghệ thuật; tấm kim loại anodized titanium cho Tech & Robotics.
   - Bổ sung thanh chống chịu lực inox `SHELF_STRUT_ROD_GEOM` và ke góc chữ L `SHELF_CORNER_BRACKET_GEOM` nối giữa các tầng kệ C1 và C2.
2. **Khu vực quầy tiếp tân (KHU B Counter Podium):**
   - Chân đế giật cấp chống va đập `COUNTER_PLINTH_BASE_GEOM` màu xám đá `SLATE_DARK_MAT`.
   - Nẹp kim loại brass viền mặt quầy `COUNTER_TOP_TRIM_GEOM`.
3. **Khu vực mặt tiền thương hiệu (KHU A Signboard & Canopy):**
   - Mái che kiến trúc nhô ra `SIGN_HOOD_VISOR_GEOM`.
   - Hai tay đỡ cantilever chịu lực `SIGN_BRACKET_GEOM`.
   - 3 cụm đèn chiếu điểm âm trần downlight puck `DOWNLIGHT_PUCK_GEOM` cùng quầng sáng `DOWNLIGHT_GLOW_GEOM`.

### 2.2. P1 — Bố trí Vật dụng Ngoại thất
1. **Dù che nắng (Parasol Lounge Pavilions):** Di chuyển từ `(±18.8m, ±15.5m)` vào các góc nghỉ ngơi an toàn `(±15.8m, ±14.2m)`, cách lòng đường trên 2.7m, cách đường trục trung tâm > 11m, cách đường ngắm Showcase của cả 6 gian hàng > 5.2m.
2. **Ghế ngồi đồng bộ:** Mỗi bàn dù che nắng được bổ sung 2 ghế công viên gỗ & sắt rèn mỹ thuật `env-park-bench.glb` đối xứng hai bên.
3. **Thùng rác & chậu hoa:** Bố trí logic cạnh các khu nghỉ ngơi và mép vỉa hè (`±14.2m, ±14.2m` và `z = ±18.2m, -17.5m`).
4. **Hàng cây xanh:** Di dời ra dải phân cách và góc đường, giải phóng tầm nhìn trực diện vào 6 gian hàng.

### 2.3. P2 — Chi tiết Môi trường & Ánh sáng
1. **Gờ giảm tốc (Speed Bumps):** Bổ sung 3 dải gờ giảm tốc cao 3.5cm bằng cao su & nhựa đường chuyên dụng xen kẽ sọc vàng `#facc15` và xám đen `#1e293b`.
2. **Đài phun nước:** Vành đai đồng viền lòng đài phun (bronze basin coping ring), tăng độ chi tiết vân đá tự nhiên `bumpScale: 0.022`, mặt nước xanh ngọc phản chiếu tự nhiên.
3. **Ánh sáng & Đổ bóng:** Giảm ambient/hemisphere dư thừa để tăng tương phản, nâng cấp bộ lọc đổ bóng `shadow-radius: 2`, `shadow-bias: -0.0002` giúp bóng đổ êm dịu, không bị răng cưa.
