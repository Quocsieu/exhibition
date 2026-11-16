# Virtual Expo Plaza 3D — Website Triển Lãm Thương Mại Ảo

Website triển lãm thương mại ảo 3D (**Virtual Expo Plaza 3D**) xây dựng trên kiến trúc **npm Workspaces Monorepo (`FE` + `BE`)** với không gian quảng trường 3D (React Three Fiber + Three.js + GLB), 6 gian hàng V2 gồm 36 vị trí trưng bày sản phẩm (`Product Slots`), điều khiển nhân vật đa phương thức (`WASD` + `Click-to-Move` tìm đường A* + Joystick cảm ứng), đồng bộ nhiều khách tham quan thời gian thực (`Socket.IO`), cơ sở dữ liệu `SQLite` (`node:sqlite`), và trang quản trị (`Admin Dashboard`).

---

## 1. Cấu trúc Thư mục Dự án (`FE` & `BE`)

```text
exhibition/
├── FE/                               # Ứng dụng Web 3D Frontend (React 18 + TypeScript + Vite + R3F)
│   ├── public/
│   │   └── models/                   # Các model 3D (.glb) phục vụ runtime & fallback
│   │       ├── booths/               # 6 gian hàng V2 (v2/, kinetix-v2/) & fallback V1 (roofless-v1/)
│   │       ├── env/                  # Cây xanh, ghế gỗ, ô dù (umbrella), bồn cây, đèn đường, tòa nhà
│   │       └── exterior/             # Đài phun nước trung tâm (7b_tCaBRLCI.glb) & tài liệu bản quyền CC-BY
│   ├── src/
│   │   ├── components/               # BoothPanel, ProductPanel, LoadingScreen
│   │   ├── config/                   # Cấu hình endpoint REST API & Socket.IO (apiConfig.ts)
│   │   ├── controls/                 # Điều khiển WASD (useKeyboard), Click-to-Move (A*), MobileJoystick
│   │   ├── hooks/                    # Đồng bộ thời gian thực Socket.IO (useRealtime.ts)
│   │   ├── pages/                    # ExhibitionPage (khuôn viên 3D) & AdminPage (quản trị /#admin)
│   │   ├── scene/                    # ExhibitionScene, Environment, ExteriorAssets, Booth, RooflessBoothShell,
│   │   │                             # ShopShowcaseStage, LocalPlayer, RemotePlayers, sceneTextures
│   │   ├── services/                 # REST API client (api.ts)
│   │   ├── types/                    # Định nghĩa kiểu dữ liệu, va chạm & tìm đường A* (expo.ts)
│   │   └── __tests__/                # Unit tests cho va chạm, tìm đường A*, camera, 36 slots & textures
│   ├── booth-modeling/               # Pipeline script Python Blender tái tạo gian hàng V2 & tối ưu model
│   ├── scripts/                      # Script hỗ trợ xuất GLB thủ tục (generateGlbAssets.ts)
│   ├── package.json
│   └── vite.config.ts
│
├── BE/                               # Máy chủ Backend (Node.js + Express + Socket.IO + node:sqlite)
│   ├── src/
│   │   ├── controllers/              # Xử lý nghiệp vụ HTTP (expoController.ts)
│   │   ├── database/                 # Khởi tạo & seed SQLite tự động (db.ts)
│   │   ├── integrations/             # Trích xuất sản phẩm từ URL / JSON / CSV (productAdapter.ts)
│   │   ├── middleware/               # Xác thực token quản trị (adminAuth.ts)
│   │   ├── realtime/                 # Đồng bộ vị trí khách & cập nhật dữ liệu (socketServer.ts)
│   │   ├── routes/                   # Định tuyến REST API /api/* (apiRoutes.ts)
│   │   ├── schemas/                  # Validation Zod & dữ liệu mẫu mặc định (expoSchemas.ts)
│   │   ├── services/                 # Tầng dịch vụ nghiệp vụ (expoService.ts)
│   │   ├── server.ts                 # Điểm vào chính của Backend (cổng mặc định 4000)
│   │   └── __tests__/                # Integration tests cho REST API, Auth, SSRF & Socket.IO
│   └── package.json
│
├── qa-reports/                       # Kịch bản kiểm thử hồi quy trình duyệt (final_regression_test.cjs)
├── .env.example                      # File mẫu cấu hình biến môi trường (không chứa khóa bí mật)
├── .gitignore
├── package.json                      # Cấu hình npm Workspaces gốc (FE, BE)
├── vercel.json                       # Cấu hình triển khai Frontend trên Vercel
└── README.md
```

---

## 2. Yêu cầu Hệ thống & Cài đặt Nhanh (Clone & Setup)

- **Node.js**: Bắt buộc **`>= 22.5.0`** (khuyến nghị Node `22.20.0` LTS) vì Backend sử dụng module tích hợp sẵn `node:sqlite` (`DatabaseSync`), không cần cài trình biên dịch C++.
- **npm**: `>= 10.0.0` (hỗ trợ `npm workspaces`).

```bash
# 1. Clone repository về máy
git clone <repository-url>
cd exhibition

# 2. Cài đặt toàn bộ dependencies cho cả Root, FE và BE
npm install

# 3. (Tùy chọn) Tạo file .env từ file mẫu .env.example
cp .env.example .env
```

> **Lưu ý:** Dự án có thể chạy ngay lập tức sau khi `npm install` mà không bắt buộc phải tạo file `.env` (Backend tự động dùng cổng `4000` và tự động khởi tạo cơ sở dữ liệu SQLite mẫu tại `BE/data/expo.db`).

---

## 3. Các Lệnh Chạy, Kiểm thử & Build

| Lệnh | Mô tả chi tiết |
|---|---|
| `npm run dev` | Chạy song song cả Backend (`http://localhost:4000`) và Frontend (`http://localhost:5173`). |
| `npm run dev:be` | Chỉ chạy Backend ở chế độ theo dõi thay đổi (`tsx watch src/server.ts` tại `http://localhost:4000`). |
| `npm run dev:fe` | Chỉ chạy Frontend Vite dev server (`http://localhost:5173`, tự động proxy `/api` và `/socket.io` sang cổng `4000`). |
| `npm run typecheck` | Kiểm tra kiểu dữ liệu TypeScript (`tsc --noEmit`) trên cả `BE` và `FE`. |
| `npm run build` | Biên dịch bản Production cho cả `BE` (`BE/dist`) và `FE` (`FE/dist`). |
| `npm test` | Chạy toàn bộ 31 bài kiểm thử tự động (`vitest run`) cho cả `FE` (22 tests) và `BE` (9 tests). |
| `npm start` | Chạy bản build Production của Backend (`node BE/dist/server.js`). |

### Địa chỉ Truy cập Khi Chạy Local
- **Không gian Triển lãm 3D (`FE`)**: `http://localhost:5173`
- **Bảng điều khiển Quản trị (`Admin Dashboard`)**: `http://localhost:5173/#admin`
  - Tài khoản PoC mặc định khi chưa đặt biến môi trường: Username `admin` / Password `expo-admin-2026`
- **Kiểm tra trạng thái Backend (`API Healthcheck`)**: `http://localhost:4000/api/health`

---

## 4. Cấu hình Biến Môi trường (`.env`)

Sao chép `.env.example` thành `.env` nếu muốn tùy chỉnh cấu hình:

| Biến môi trường | Phân hệ | Giá trị mặc định (Dev) | Công dụng |
|---|---|---|---|
| `PORT` | `BE` | `4000` | Cổng lắng nghe HTTP & Socket.IO của Backend. |
| `CORS_ORIGIN` | `BE` | `*` | Danh sách origin được phép gọi API (phân tách bằng dấu phẩy). |
| `SQLITE_DB_PATH` | `BE` | `./data/expo.db` | Đường dẫn lưu file cơ sở dữ liệu SQLite. |
| `ADMIN_USERNAME` | `BE` | `admin` | Tên đăng nhập trang Quản trị (`/#admin`). |
| `ADMIN_PASSWORD` | `BE` | `expo-admin-2026` | Mật khẩu trang Quản trị (**Bắt buộc đổi trên môi trường Production**). |
| `ADMIN_TOKEN_SECRET` | `BE` | *(Sinh ngẫu nhiên 32 bytes)* | Khóa ký HMAC-SHA256 cho Bearer Token của Admin. |
| `VITE_API_URL` | `FE` | `""` *(Dùng proxy Vite)* | URL gốc của Backend API khi triển khai Production. |
| `VITE_SOCKET_URL` | `FE` | `""` *(Dùng proxy Vite)* | URL gốc của máy chủ Socket.IO khi triển khai Production. |
| `VITE_USE_REMOTE_API_IN_DEV` | `FE` | `false` | Đặt `true` nếu muốn Frontend local gọi thẳng lên Backend từ xa. |

---

## 5. Hướng dẫn Triển khai (Deployment)

1. **Backend (`BE` — Render / VPS / Docker)**:
   - Build command: `npm install && npm run build -w BE`
   - Start command: `npm run start -w BE`
   - Thiết lập các biến môi trường `PORT`, `CORS_ORIGIN`, `SQLITE_DB_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`.
2. **Frontend (`FE` — Vercel / Cloudflare Pages / Nginx)**:
   - Cấu hình đã có sẵn trong `vercel.json` ở thư mục gốc (`buildCommand: "npm run build -w FE"`, `outputDirectory: "FE/dist"`).
   - Thiết lập `VITE_API_URL` và `VITE_SOCKET_URL` trỏ tới địa chỉ HTTPS của Backend.

---

## 6. Các File Local Không Lưu Trong Git (`.gitignore`)

Để giữ cho repository gọn nhẹ (`~96 MB`) và an toàn khi chia sẻ nhóm, các file sau được `.gitignore` loại trừ và **thành viên nhóm không cần có các file này để chạy dự án**:

- `node_modules/`, `FE/dist/`, `BE/dist/`: Được tạo tự động khi chạy `npm install` và `npm run build`.
- `.env`, `.env.local`: File cấu hình môi trường cá nhân tại máy local.
- `BE/data/*.db*`, `data/*.db*`: Cơ sở dữ liệu SQLite tự động khởi tạo và nạp sẵn 6 gian hàng + 12 sản phẩm mẫu ngay lần chạy đầu tiên.
- `FE/public/models/env/*_4k.glb`, `FE/public/models/env/Building01.glb`, `FE/booth-modeling/tools/`, `FE/booth-modeling/sand3d-repo/`: Các file model gốc 4K dung lượng lớn (`>100 MB`) và bộ cài Blender chỉ dùng khi muốn biên tập lại mesh 3D gốc; toàn bộ 25 model `.glb` đã tối ưu phục vụ website đều đã được commit sẵn trong `FE/public/models/`.
