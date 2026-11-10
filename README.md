# Virtual Expo 2.5D — Website Triển Lãm Thương Mại Ảo (3-Day PoC)

Website triển lãm thương mại ảo 2.5D hoàn chỉnh với không gian 3D Isometric (React Three Fiber), di chuyển đa phương thức có tìm đường tránh vật cản (A*), đồng bộ nhiều khách tham quan thời gian thực (Socket.IO), cơ sở dữ liệu SQLite, tích hợp sản phẩm đa nguồn (URL JSON-LD / Open Graph, CSV, JSON) và bảng điều khiển quản trị (Admin Dashboard).

---

## 1. Cấu trúc Thư mục Dự án (`FE` & `BE`)

Dự án được tổ chức thành hai thư mục ứng dụng chính `FE` và `BE` thông qua `npm workspaces`:

```text
virtual-expo/
│
├── FE/
│   ├── public/
│   │   ├── models/
│   │   ├── textures/
│   │   └── images/
│   │
│   ├── src/
│   │   ├── scene/
│   │   │   ├── ExhibitionScene.tsx
│   │   │   ├── Environment.tsx
│   │   │   ├── Booth.tsx
│   │   │   ├── LocalPlayer.tsx
│   │   │   └── RemotePlayers.tsx
│   │   ├── controls/
│   │   │   ├── useKeyboard.ts
│   │   │   ├── useClickToMove.ts
│   │   │   └── MobileJoystick.tsx
│   │   ├── components/
│   │   │   ├── BoothPanel.tsx
│   │   │   ├── ProductPanel.tsx
│   │   │   └── LoadingScreen.tsx
│   │   ├── pages/
│   │   │   ├── ExhibitionPage.tsx
│   │   │   └── AdminPage.tsx
│   │   ├── hooks/
│   │   │   └── useRealtime.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── expo.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── BE/
│   ├── src/
│   │   ├── routes/
│   │   │   └── apiRoutes.ts
│   │   ├── controllers/
│   │   │   └── expoController.ts
│   │   ├── services/
│   │   │   └── expoService.ts
│   │   ├── realtime/
│   │   │   └── socketServer.ts
│   │   ├── integrations/
│   │   │   └── productAdapter.ts
│   │   ├── database/
│   │   │   └── db.ts
│   │   ├── middleware/
│   │   │   └── adminAuth.ts
│   │   ├── schemas/
│   │   │   └── expoSchemas.ts
│   │   └── server.ts
│   ├── data/
│   └── package.json
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 2. Yêu cầu Hệ thống & Cài đặt

- **Node.js**: `>= 22.5.0` (Sử dụng module `node:sqlite` tích hợp sẵn trong Node.js 22, không cần trình biên dịch C++).
- **npm**: `>= 10.0.0`.

```bash
# 1. Cài đặt toàn bộ dependencies cho cả FE và BE từ thư mục gốc
npm install

# 2. (Tùy chọn) Sao chép cấu hình môi trường
cp .env.example .env
```

Thông tin đăng nhập Quản trị (Admin Dashboard) mặc định:
- **Username (`ADMIN_USERNAME`)**: `admin`
- **Password (`ADMIN_PASSWORD`)**: `expo-admin-2026`

---

## 3. Lệnh Chạy & Kiểm thử từ Thư mục Gốc

- **Chạy đồng thời `FE` và `BE` (Development)**:
  ```bash
  npm run dev
  ```
  - **Khuôn viên Triển lãm 3D (`FE`)**: `http://localhost:5173`
  - **Dashboard Quản trị**: `http://localhost:5173/#admin` (hoặc bấm nút **⚙️ Quản trị (Dashboard)** trên thanh HUD)
  - **Backend (`BE`)**: `http://localhost:4000` (SQLite tự động tạo tại `BE/data/expo.db` với 6 gian hàng và 12 sản phẩm mẫu)

- **Kiểm tra kiểu dữ liệu TypeScript (`FE` + `BE`)**:
  ```bash
  npm run typecheck
  ```

- **Build Production (`FE` + `BE`)**:
  ```bash
  npm run build
  ```

- **Chạy kiểm thử tự động (Vitest)**:
  ```bash
  npm run test
  ```

---

## 4. Hướng dẫn Trình diễn Demo (5 Phút)

1. **Tham quan 2.5D & Điều khiển (DAY 1)**:
   - Mở `http://localhost:5173`.
   - Dùng phím `WASD` hoặc phím mũi tên để đi dạo quanh sân triển lãm, thử va chạm vào gian hàng hoặc đài phun nước trung tâm (nhân vật trượt dọc cạnh tường, không đi xuyên vật cản).
   - Click chuột xuống mặt đất phía sau đài phun nước để xem nhân vật tự động tìm đường **A*** (vẽ đường nét đứt màu vàng) đi vòng qua vật cản. Bấm `WASD` khi đang đi để thấy lộ trình tự động lập tức hủy.
   - Kéo **Joystick cảm ứng** ở góc dưới bên trái.
2. **Đồng bộ Realtime Nhiều Khách (DAY 2)**:
   - Mở thêm cửa sổ trình duyệt thứ hai tại `http://localhost:5173`.
   - Quan sát số khách trực tuyến tăng lên `2`, hai nhân vật nhìn thấy nhau di chuyển thời gian thực với chuyển động nội suy mượt mà, và đổi tên/màu sắc trực tiếp trên thanh HUD.
3. **Xem Gian hàng & Sản phẩm (DAY 2)**:
   - Click vào một gian hàng bất kỳ để mở `BoothPanel` (`<dialog>`), xem danh sách sản phẩm kèm ảnh và giá bán.
   - Bấm **"Xem chi tiết"** để mở `ProductPanel`, xem bộ sưu tập ảnh, phát video giới thiệu sản phẩm và bấm **"Mua tại website nguồn ↗"** hoặc **"Liên hệ tư vấn"**.
4. **Quản trị & Import Đa Nguồn (DAY 3)**:
   - Bấm **"⚙️ Quản trị (Dashboard)"**, đăng nhập (`admin` / `expo-admin-2026`).
   - Thêm/sửa/xóa gian hàng hoặc sản phẩm.
   - Sang tab **Import Sản phẩm (URL / JSON / CSV)** để thử trích xuất sản phẩm từ URL công khai (JSON-LD / Open Graph) hoặc import hàng loạt qua JSON/CSV.

---

## 5. Hướng dẫn Deploy Production

1. Thiết lập các biến môi trường trên máy chủ:
   - `PORT=4000`
   - `SQLITE_DB_PATH=./data/expo.db`
   - `ADMIN_USERNAME=<admin-user>`
   - `ADMIN_PASSWORD=<strong-password>`
   - `ADMIN_TOKEN_SECRET=<random-64-char-secret>`
   - `VITE_API_URL=https://api.your-domain.com`
   - `VITE_SOCKET_URL=https://api.your-domain.com`
2. Chạy `npm run build` để tạo bản build tại `BE/dist` và `FE/dist`.
3. Chạy `npm run start` để khởi động Backend (`BE/dist/server.js`) và phục vụ thư mục tĩnh `FE/dist` qua Nginx / Cloudflare Pages / Vercel.

---

## 6. Các Hạn chế Trong Phạm vi PoC

1. **URL Import**: Các trang thương mại điện tử bật CAPTCHA / Cloudflare chống bot hoặc chỉ render bằng client-side JS sẽ không thể trích xuất HTML tĩnh; hệ thống tự động thông báo và chuyển sang biểu mẫu nhập thủ công hoặc import CSV/JSON.
2. **Quy mô tải**: Danh sách khách online lưu trong RAM của một tiến trình Node.js, phù hợp quy mô PoC 10–30 khách đồng thời.
3. **Mô hình 3D**: Sử dụng Low-Poly Procedural Geometry để đảm bảo tốc độ tải nhanh và không phụ thuộc vào asset thương mại bên ngoài.
