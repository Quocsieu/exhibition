# Virtual Expo 2.5D / Grand Expo V28 (`exhibition_backup`)

Dự án triển lãm ảo 3D/2.5D chạy độc lập trên localhost và deploy tĩnh lên hosting (Plesk/Apache).

## Yêu cầu môi trường
- **Node.js** `>= 22.5.0` (sử dụng `node:sqlite` tích hợp sẵn)
- **npm** `>= 10`

## Cài đặt & Chạy Localhost
```powershell
npm install
npm run dev
```
Lệnh `npm run dev` khởi chạy đồng thời:
- **Frontend + Local Proxy:** `http://localhost:4173` (Admin: `http://localhost:4173/admin`)
- **Backend (SQLite `./data/expo.db`):** `http://localhost:4100` (Health: `http://localhost:4100/api/health`)

## Các lệnh khác
- `npm run dev:be` — Chỉ chạy riêng Backend (`tsx watch src/server.ts`)
- `npm run typecheck` — Kiểm tra kiểu TypeScript (`tsc --noEmit`)
- `npm run build` — Biên dịch Backend sang `dist/`
- `npm start` — Chạy Backend đã biên dịch (`node dist/server.js`)

## Biến môi trường (`.env`)
- `PORT=4100` — Cổng Backend local (tách biệt cổng `4000`)
- `FE_PORT=4173` — Cổng Frontend local (tách biệt cổng `5173`)
- `SQLITE_DB_PATH=./data/expo.db` — Đường dẫn database SQLite cục bộ
- `V28_API_PROXY_TARGET=https://exhibition-xl20.onrender.com` *(tùy chọn)* — Đích proxy cho `/api/v28/*` khi chạy local

## Deploy lên Hosting tĩnh (`httpdocs/`)
Chỉ upload các mục Frontend công khai:
- `index.html`
- `.htaccess`
- `assets/`
- `logos/`
- `models/`
- `tts/`

> Không upload `.env`, `node_modules/`, `data/`, `src/`, `dist/`, `scripts/`, `backend/` lên webroot công khai.
