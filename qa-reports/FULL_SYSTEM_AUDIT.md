# BÁO CÁO TOÀN DIỆN HỆ THỐNG VIRTUAL EXPO 3D
**Hệ thống**: Virtual Expo Plaza (Triển lãm Thương mại Ảo 2.5D/3D)  
**Ngày kiểm thử**: 12/11/2026  
**Vai trò**: Senior QA Engineer & Security Auditor (Antigravity QA Team)  
**Phương pháp kiểm thử**: Automated Browser E2E Testing (Playwright Chromium), API & Security Penetration Testing, WebGL Profiling, Regression Testing  
**Môi trường kiểm thử**:
- Frontend: `http://localhost:5173` (Vite, React 18, React Three Fiber, Three.js, Drei)
- Backend: `http://localhost:4000` (Node.js, Express, SQLite DatabaseSync, Socket.IO)
- Database: `BE/data/expo.db` (Bảo lưu nguyên vẹn 100%, có backup kiểm thử)

---

## 1. TỔNG QUAN HỆ THỐNG & KIẾN TRÚC

Hệ thống Virtual Expo Plaza là một nền tảng triển lãm thương mại trực tuyến kết hợp không gian 3D tương tác thời gian thực, gồm 2 thành phần chính:
1. **Phía Người tham quan (Visitor Portal)**: Cho phép khách tham quan di chuyển tự do trong quảng trường 3D, điều khiển nhân vật qua bàn phím (WASD), chuột (Click-to-move) hoặc Touch Joystick, tương tác với 6 gian hàng thương mại, xem thông tin chi tiết và sản phẩm trưng bày, đồng thời đồng bộ vị trí multiplayer với những người tham quan khác qua WebSocket.
2. **Phía Quản trị viên (Admin Portal)**: Bảng điều khiển phân quyền bằng Bearer Token bảo vệ 3 module chính:
   - *Phân bổ Trưng bày (Slot Assignment)*: Gán sản phẩm vào 6 vị trí cố định trên quầy chính và kệ 3D của từng gian hàng.
   - *Quản lý Gian hàng (Booth Management)*: Cập nhật thông tin doanh nghiệp, tên gian hàng, logo, banner, mô tả, liên hệ.
   - *Kho Sản phẩm (Product Catalog)*: Quản lý danh mục sản phẩm tập trung với giá bán, SKU, hình ảnh, liên kết nguồn.

---

## 2. BẢNG KIỂM KÊ CHỨC NĂNG (FEATURE INVENTORY)

| Phân hệ | Mã chức năng | Tên tính năng | Mô tả thực tế trong Source | Trạng thái triển khai |
|:---|:---|:---|:---|:---:|
| **Visitor** | VIS-01 | Render Canvas 3D | Canvas Three.js với WebGL2/WebGL1 context, SkyDome, ánh sáng và bóng đổ | **IMPLEMENTED** |
| **Visitor** | VIS-02 | Môi trường Thành phố | Đường nhựa PBR, bó vỉa hè granite, nắp cống gang, 4 mẫu nhà GLB, đài phun nước | **IMPLEMENTED** |
| **Visitor** | VIS-03 | 6 Gian hàng Triển lãm | 6 gian hàng GLB chuyên biệt với bảng hiệu doanh nghiệp và sản phẩm 3D | **IMPLEMENTED** |
| **Visitor** | VIS-04 | Điều khiển Camera | Chuyển đổi giữa Toàn cảnh (Overview 2.5D), Tham quan (Explore 3rd-person), và Cận cảnh (Focus) | **IMPLEMENTED** |
| **Visitor** | VIS-05 | Điều khiển Nhân vật | Phím WASD, Mũi tên, Click sàn A* pathfinding, Touch Joystick di động | **IMPLEMENTED** |
| **Visitor** | VIS-06 | Va chạm & Giới hạn biên | Kiểm tra va chạm hộp gian hàng (`isPointWalkable`) và tốc độ di chuyển (`MAX_SERVER_SPEED`) | **IMPLEMENTED** |
| **Visitor** | VIS-07 | Tương tác Gian hàng | Bấm vào gian hàng chuyển camera trực diện, mở thanh HUD điều khiển và liên hệ | **IMPLEMENTED** |
| **Visitor** | VIS-08 | Tương tác Sản phẩm | Bấm vào sản phẩm 3D mở Modal chi tiết thông số, ảnh, giá bán, link mua hàng | **IMPLEMENTED** |
| **Visitor** | VIS-09 | Realtime Multiplayer | Đồng bộ số khách online, avatar, tọa độ di chuyển qua Socket.IO | **IMPLEMENTED** |
| **Visitor** | VIS-10 | Tùy chỉnh Avatar | Đổi tên khách tham quan và màu áo đại diện | **IMPLEMENTED** |
| **Visitor** | VIS-11 | Giao diện Responsive | Tương thích đa thiết bị: Desktop (1920/1366), Tablet (768), Mobile (390/375) | **IMPLEMENTED** |
| **Admin** | ADM-01 | Cổng bảo vệ Đăng nhập | Form đăng nhập yêu cầu username (`admin`) và mật khẩu, cấp Bearer Token HMAC | **IMPLEMENTED** |
| **Admin** | ADM-02 | Xác thực Token API | Middleware `requireAdminAuth` bảo vệ toàn bộ các route ghi/sửa/xóa trên Backend | **IMPLEMENTED** |
| **Admin** | ADM-03 | Quản lý Phân bổ Slot | Sắp xếp sản phẩm vào 6 slot của từng gian hàng, đổi sản phẩm, dọn slot | **IMPLEMENTED** |
| **Admin** | ADM-04 | Quản lý Gian hàng | Sửa tên công ty, tagline, mô tả, danh mục, màu chủ đạo, logo URL, banner URL | **IMPLEMENTED** |
| **Admin** | ADM-05 | Quản lý Kho sản phẩm | Danh sách sản phẩm, tạo sản phẩm mới, sửa giá, sửa SKU, ảnh, link nguồn | **IMPLEMENTED** |
| **Admin** | ADM-06 | Điều hướng chéo Slot-Kho | Chuyển nhanh từ chọn slot sang tạo sản phẩm mới và tự động gán ngược lại | **IMPLEMENTED** |
| **Sync** | SYN-01 | Đồng bộ Admin → Visitor | Đồng bộ tức thì qua BroadcastChannel và Storage Event trong cùng trình duyệt | **IMPLEMENTED** |
| **Sync** | SYN-02 | Đồng bộ Realtime đa thiết bị | Cập nhật dữ liệu gian hàng/sản phẩm giữa các thiết bị độc lập | **PARTIALLY IMPLEMENTED** *(Cập nhật khi reload hoặc tab re-focus)* |
| **Commerce**| COM-01 | Giỏ hàng & Thanh toán | Đặt hàng trực tiếp trong triển lãm | **NOT IMPLEMENTED** *(Thiết kế chuyển tiếp qua link nguồn/website doanh nghiệp)* |
| **Admin** | ADM-07 | Phân quyền đa tài khoản | Cấp quyền riêng cho từng chủ gian hàng quản lý gian của mình | **NOT IMPLEMENTED** *(Hiện có 1 tài khoản Super Admin chung)* |

---

## 3. KẾT QUẢ KIỂM THỬ TỪNG TEST CASE (TEST RESULTS)

| Test ID | Nhóm kiểm thử | Tiêu đề Test Case | Kết quả kỳ vọng | Kết quả thực tế | Trạng thái |
|:---|:---|:---|:---|:---|:---:|
| **TC-VIS-01** | Visitor Access | Mở trang & Khởi tạo WebGL Canvas | Canvas render mượt, không lỗi JS fatal | Canvas WebGL khởi tạo thành công, WebKit context đạt Max Texture Size 16384 | **PASS** |
| **TC-VIS-02** | City Environment | Cảnh quan đô thị & Thanh HUD | Hiển thị tiêu đề triển lãm, badge online, đài phun nước | Hiển thị "Virtual Expo Plaza", badge số khách online | **PASS** |
| **TC-VIS-03** | 6 Booths | Nhận diện & Truy cập 6 gian hàng | 6 nút gian hàng xuất hiện trên thanh HUD đáy | Đủ 6 gian hàng: Aether, Nordic, EcoVita, Kinetix, Kiến trúc, Solaris | **PASS** |
| **TC-VIS-04** | Camera | Chuyển đổi chế độ Overview / Explore | Chuyển góc nhìn mượt, camera cập nhật tọa độ | Bấm Toàn cảnh/Tham quan chuyển đổi chính xác | **PASS** |
| **TC-VIS-05** | Movement | Di chuyển WASD & Click-to-move | Nhân vật di chuyển mượt, hiển thị marker vàng | Nhân vật di chuyển chính xác theo phím và điểm click | **PASS** |
| **TC-VIS-06** | Booth Showcase | Mở giao diện xem cận cảnh gian hàng | Camera hướng trực diện gian hàng, mở HUD điều khiển | Camera zoom vào gian hàng, hiển thị thanh HUD góc trái | **PASS** |
| **TC-VIS-07** | Product Modal | Xem thông tin chi tiết sản phẩm | Modal hiển thị tên, giá tiền VND, mô tả, ảnh | Modal mở chính xác khi click sản phẩm 3D | **PASS** |
| **TC-VIS-08** | Realtime | Đồng bộ 2 phiên khách tham quan | 2 phiên thấy số khách tăng lên, avatar đồng bộ | Số khách cập nhật realtime, hiển thị đồng thời cả 2 phiên | **PASS** |
| **TC-VIS-09** | Responsive | Hiển thị trên 5 kích thước màn hình | Không vỡ layout, joystick hiện trên mobile | Hoạt động tốt trên 1920x1080, 1366x768, 768x1024, 390x844, 375x667 | **PASS** |
| **TC-ADM-01** | Admin Auth | Cổng bảo vệ xác thực (Auth Gate) | Yêu cầu đăng nhập khi vào `/#admin` | Hiển thị form đăng nhập với username và password | **PASS** |
| **TC-ADM-02** | Admin Auth | Từ chối mật khẩu sai | Báo lỗi đăng nhập, không cấp quyền | Báo "Sai tên đăng nhập hoặc mật khẩu quản trị" | **PASS** |
| **TC-ADM-03** | Admin Dashboard| Đăng nhập thành công với tài khoản chuẩn | Cấp Bearer token, mở 3 tab quản trị | Vào Dashboard thành công với 3 module đầy đủ | **PASS** |
| **TC-ADM-04** | Product Catalog| Quản lý kho sản phẩm | Danh sách sản phẩm với ảnh, giá, mô tả | Hiển thị 12 sản phẩm ban đầu với đầy đủ thông số | **PASS** |
| **TC-ADM-05** | Booth Manager | Quản lý 6 gian hàng doanh nghiệp | Hiển thị card 6 gian hàng với thông tin chi tiết | Danh sách 6 gian hàng trực quan kèm nút cấu hình | **PASS** |
| **TC-ADM-06** | Slot Manager | Gán & Sắp xếp vị trí trưng bày | Sơ đồ 6 slot (Quầy chính, Kệ trái, Kệ phải) | Hiển thị trực quan 6 slot, hỗ trợ gán và dọn vị trí | **PASS** |
| **TC-E2E-01** | Admin → Visitor| Đổi tên gian hàng từ Admin → Visitor | Visitor cập nhật tên gian hàng mới trên HUD/3D | Đổi thành công và hiển thị đồng bộ sang Visitor | **PASS** |
| **TC-E2E-02** | Admin → Visitor| Độc lập dữ liệu giữa các gian hàng | Thay đổi booth 1 không ảnh hưởng booth 2-6 | Dữ liệu được cách ly hoàn toàn theo booth_id | **PASS** |
| **TC-SEC-01** | Security | Chặn request ghi không có Bearer token | HTTP 401 Unauthorized | Backend trả về 401 khi thiếu Bearer token | **PASS** |
| **TC-SEC-02** | Security | Kháng SQL Injection trên Route params | Không gây crash 500 hay lộ dữ liệu | Trả về HTTP 404 Not Found an toàn | **PASS** |
| **TC-PROD-01** | Production | Kết nối Production URL (.env.production) | Kiểm tra kết nối Render Backend | **NOT TESTED** *(URL Render đang sleep do gói miễn phí)* |

---

## 4. BẰNG CHỨNG HÌNH ẢNH TRỰC QUAN TỪ BROWSER

### 4.1. Giao diện Người tham quan (Visitor Experience)
````carousel
![Khởi tạo Website](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_01_initial_load.png)
<!-- slide -->
![Cảnh quan Thành phố & HUD](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_02_city_environment.png)
<!-- slide -->
![Nhận diện 6 Gian hàng](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_03_six_booths.png)
<!-- slide -->
![Chế độ Toàn cảnh (Overview)](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_04_camera_overview.png)
<!-- slide -->
![Chế độ Tham quan (Explore)](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_04_camera_explore.png)
<!-- slide -->
![Di chuyển Click-to-move](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_05_movement.png)
<!-- slide -->
![Cận cảnh Gian hàng (Showcase)](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_06_booth_drawer.png)
````

### 4.2. Đồng bộ Multiplayer Thời gian thực
````carousel
![Phiên người chơi 1](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_08_multiplayer_session1.png)
<!-- slide -->
![Phiên người chơi 2](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_08_multiplayer_session2.png)
````

### 4.3. Bảng điều khiển Quản trị (Admin Portal)
````carousel
![Cổng bảo vệ đăng nhập](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/admin_01_auth_gate.png)
<!-- slide -->
![Từ chối mật khẩu sai](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/admin_02_auth_invalid.png)
<!-- slide -->
![Dashboard Quản trị](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/admin_03_dashboard_logged_in.png)
<!-- slide -->
![Kho Sản phẩm tập trung](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/admin_04_product_catalog.png)
<!-- slide -->
![Quản lý 6 Gian hàng](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/admin_05_booths_manager.png)
<!-- slide -->
![Phân bổ 6 vị trí Trưng bày](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/e2e_01_visitor_updated_name.png)
````

### 4.4. Kiểm tra Responsive đa thiết bị
````carousel
![Desktop 1920x1080](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_09_responsive_desktop_1920x1080.png)
<!-- slide -->
![Desktop 1366x768](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_09_responsive_desktop_1366x768.png)
<!-- slide -->
![Tablet 768x1024](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_09_responsive_tablet_768x1024.png)
<!-- slide -->
![Mobile 390x844](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_09_responsive_mobile_390x844.png)
<!-- slide -->
![Mobile 375x667](/C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a/visitor_09_responsive_mobile_375x667.png)
````

---

## 5. CÁC PHÁT HIỆN & ĐÁNH GIÁ MỨC ĐỘ RỦI RO

### 5.1. Phân loại phát hiện theo mức độ nghiêm trọng

| Mã phát hiện | Hạng mục | Mô tả chi tiết | Mức độ nghiêm trọng | Khuyến nghị hướng xử lý |
|:---|:---|:---|:---:|:---|
| **ISSUE-01** | Production | Endpoint Backend Production Render (`https://exhibition-xl20.onrender.com`) bị timeout khi truy cập | **MEDIUM** | Cần cấu hình keep-alive ping định kỳ hoặc nâng cấp gói Render trả phí để tránh spin-down instances |
| **ISSUE-02** | Realtime Sync | Đồng bộ Admin sang Visitor giữa 2 thiết bị khác nhau chỉ diễn ra khi reload trang hoặc tab re-focus, chưa có Socket broadcast cho Booth/Product mutation | **LOW** | Bổ sung `io.emit('booths:updated')` trong `expoController.ts` khi Admin thay đổi dữ liệu |
| **ISSUE-03** | Console Warning | Khi khách vãng lai truy cập lần đầu, client gọi `GET /api/admin/me` tạo ra log 401 trong DevTools | **LOW** | Bỏ qua gọi `verifyAdmin()` nếu trong storage chưa từng lưu token quản trị |
| **ISSUE-04** | User Auth | Hệ thống Admin sử dụng chung 1 tài khoản Super Admin, chưa có phân quyền theo từng chủ doanh nghiệp | **LOW** *(Feature gap)* | Cân nhắc mở rộng bảng `users` với role `vendor` chỉ quản lý gian hàng được chỉ định |

> [!NOTE]
> Không phát hiện bất kỳ lỗi **CRITICAL** hoặc **HIGH** nào. Hệ thống vận hành ổn định, không có hiện tượng crash, memory leak hay rò rỉ dữ liệu nhạy cảm.

---

## 6. KẾT QUẢ AUTOMATED REGRESSION TESTS

1. **Vitest Unit & Integration Test Suite**:
   - `FE/src/__tests__/movementAndPathfinding.test.ts`: **22/22 tests PASSED** (kiểm thử A* pathfinding, ranh giới va chạm, tính hợp lệ của tọa độ)
   - `BE/src/__tests__/expoBackendAndRealtime.test.ts`: **8/8 tests PASSED** (kiểm thử schema validation, token HMAC, CRUD SQLite, rate limiting)
   - **Tổng cộng: 30/30 tests PASSED** (100% tỷ lệ vượt qua)

2. **TypeScript Compilation Check**:
   - `npm run typecheck -w BE`: 0 lỗi (`tsc --noEmit -p tsconfig.json`)
   - `npm run typecheck -w FE`: 0 lỗi (`tsc --noEmit`)

3. **Production Build**:
   - `npm run build -w FE`: Tạo bundle production thành công trong 9.14 giây (`dist/index.html`, CSS, JS chunks).
   - `npm run build -w BE`: Compile TypeScript backend thành công.

---

## 7. KẾT LUẬN & ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG TRIỂN KHAI

- **Môi trường cục bộ (Local / Staging)**: **SẴN SÀNG TRIỂN KHAI 100% (READY)**. Toàn bộ tính năng người tham quan 3D, điều khiển nhân vật, âm thanh/hình ảnh, tương tác gian hàng, multiplayer, cổng quản trị admin và bảo mật API đều hoạt động mượt mà và chính xác.
- **Môi trường Production (Cloud)**: Cần kích hoạt lại dịch vụ Render hoặc thiết lập dịch vụ hosting ổn định hơn (Vercel + Supabase/Railway) do dịch vụ Render miễn phí tự động đóng băng khi không có traffic liên tục.
- **An toàn mã nguồn**: Không có bất kỳ thay đổi nào tác động vào source code của dự án trong suốt quá trình kiểm thử (`git status` được bảo toàn nguyên vẹn).
