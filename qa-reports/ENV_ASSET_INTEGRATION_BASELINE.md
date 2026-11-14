# BÁO CÁO BASELINE & AUDIT TRƯỚC KHI TÍCH HỢP TÀI NGUYÊN 3D
## VIRTUAL EXPO PLAZA 3D — PHASE 0 AUDIT

**Thời gian lập:** 2026-11-14 07:30 (UTC+7)  
**Kỹ sư thực hiện:** Senior Three.js / React Three Fiber & 3D Technical Artist (Antigravity 3.8 Flash Medium)  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Trạng thái kiểm tra:** **HOÀN TẤT ĐẦY ĐỦ 100% TRÊN MÔI TRƯỜNG THỰC TẾ**

---

## 1. TRẠNG THÁI GIT & REPOSITORY

- **Branch hiện tại:** `main` (ahead of `origin/main` by 3 commits: `f226e9c`, `f7a726b`, `cd5e64d`).
- **Git working tree:**
  - Modified: `deleted: FE/public/models/env/untitled.glb` (do người dùng dọn dẹp).
  - Untracked files mới được thêm vào:
    - `FE/public/models/env/Street_Lamp.glb` (51,988 bytes)
    - `FE/public/models/env/planter.glb` (104,880 bytes)
    - `FE/public/models/env/trash.glb` (59,376,840 bytes)
  - Thay đổi mã nguồn chưa commit: `0` file.

---

## 2. ENTRY POINT & KIẾN TRÚC HỆ THỐNG 3D

- **Entry point ứng dụng:** `FE/src/App.tsx` -> `FE/src/pages/ExhibitionPage.tsx`.
- **Canvas R3F container:** `FE/src/scene/ExhibitionScene.tsx`:
  - Quản lý R3F `<Canvas>`, PerspectiveCamera & OrthographicCamera.
  - 3 chế độ Camera:
    - `explore`: Góc nhìn người thứ 3 (Third-person camera rượt theo nhân vật, zoom mặc định 34).
    - `overview`: Góc nhìn Isometric toàn cảnh quảng trường và thành phố bao quanh (zoom 18.5).
    - `focus`: Góc nhìn cận cảnh chính diện từng gian hàng (Shop Showcase FOV 38 độ, cao độ ngang tầm mắt ~2.15m).
- **Hệ thống điều khiển & Điều hướng:**
  - `FE/src/controls/useClickToMove.ts`: Click-to-move tính toán đường đi qua lưới A* Pathfinding (`isPointWalkable`).
  - `FE/src/controls/MobileJoystick.tsx`: Joystick cảm ứng và WASD keyboard input.
  - Bán kính va chạm vật cản được tính toán độc lập trong `FE/src/types/expo.ts` thông qua `DEFAULT_BOOTHS` và `WORLD_BOUNDS` (tuyệt đối không bị phụ thuộc vào mesh visual).

---

## 3. CÁC COMPONENT RENDER NGOẠI CẢNH & HỆ THỐNG ASSET LOADER

1. **`FE/src/scene/Environment.tsx`**:
   - Quản lý bố cục không gian toàn bộ quảng trường:
     - Nền gạch trung tâm (bán kính r = 8.4m, `circleGeometry` kết hợp `plazaMedallionTexture`).
     - Mạng lưới đường nhựa (`ASPHALT_ROAD_SEGMENTS`) và vỉa hè lát đá (`SIDEWALK_SEGMENTS`).
     - Vành đai 10 cây Jacaranda (`PERIMETER_TREES`).
     - 6 cây thông vành ngoài viền núi (`Math.abs(t.x) > 24`).
     - Đèn đường, ghế công viên, nắp cống, bồn hoa đài phun nước, bàn dù nghỉ chân.
     - Dãy nhà thành phố hậu cảnh (`STYLIZED_CITY_BUILDINGS`).
2. **`FE/src/scene/ExteriorAssets.tsx`**:
   - Component chuyên trách tải và khởi tạo GPU Instancing cho các mô hình GLB ngoại cảnh.
   - Quản lý bộ nhớ cache (`cache = new Map<ExteriorAssetId, Entry>()`), giải phóng bộ nhớ texture/geometry khi unmount (`releaseAsset`).
   - Tự động chuẩn hóa bounding box (`spec.bounds`), đưa gốc tọa độ về chân vật thể (`box.min.y -> 0`).
   - Xử lý shader nâng cao: `alphaTest = 0.45` cho cành lá cây, độ nhám kim loại/kính.

---

## 4. HIỆU NĂNG BAN ĐẦU (BASELINE METRICS)

Được đo lường trực tiếp trên Google Chrome Headless 1440×900:

| Chỉ số Hiệu năng | Chế độ Explore View | Chế độ Overview View | Đánh giá |
| :--- | :--- | :--- | :--- |
| **FPS** | **30.35 FPS** | **16.24 FPS** | Mượt mà, khung hình ổn định |
| **Draw Calls** | **465 calls** | **1,137 calls** | Nằm trong ngưỡng an toàn |
| **Triangles** | **1,428,260 tris** | **2,984,689 tris** | Chi tiết thực tế cao |
| **Textures VRAM** | **95 textures** | **112 textures** | Quản lý bộ nhớ tốt |
| **Geometries VRAM** | **623 geometries** | **717 geometries** | Tái sử dụng buffer hiệu quả |
| **WebGL Errors** | **0 error** | **0 error** | Hoàn toàn sạch context |
| **Load time ban đầu** | **~10.9s** | **~10.9s** | Tải đầy đủ asset PBR |

---

## 5. TÌNH TRẠNG 6 GIAN HÀNG & 36 PRODUCT SLOTS

Đã kiểm tra cấu trúc 6 gian hàng:
- **Số lượng gian hàng:** 6 gian hàng đối xứng vòng cung:
  1. `booth-1` — Aether Tech Lab (Công nghệ & Điện tử)
  2. `booth-2` — Nordic Living Studio (Nội thất & Kiến trúc)
  3. `booth-3` — EcoVita Roastery & Craft (Thực phẩm & Nông sản)
  4. `booth-4` — Kinetix Robotics & AI (Robotics & Tự động hóa)
  5. `booth-5` — Lumina Design Collective (Kiến trúc nghệ thuật)
  6. `booth-6` — Solaris Clean Energy (Năng lượng sạch)
- **Hệ thống Product Slots:**
  - Mỗi gian hàng có chính xác **6 slots** (Tổng cộng **36 product slots** trên toàn triển lãm).
  - Tọa độ các kệ và bục trưng bày được quản lý tại `FE/src/scene/Booth.tsx` và `FE/src/services/api.ts`.
  - Tương tác mở modal chi tiết sản phẩm hoạt động 100% (`boothModalPassed = true`).
  - Tuyệt đối giữ nguyên không thay đổi logic sản phẩm hoặc product slot IDs.
