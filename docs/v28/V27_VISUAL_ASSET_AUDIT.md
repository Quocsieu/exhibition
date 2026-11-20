# V27.5 VISUAL ASSET AUDIT — GRAND EXPO WORLD V28 (PHASE 8.0)

**Ngày kiểm kê:** 2026-11-20  
**Nguồn khảo sát thực tế:** `FE/src/scene/worldLayout.ts`, `FE/src/scene/GrandExpoHall.tsx`, `FE/src/scene/GrandExpoPlazaAmenities.tsx`, `FE/src/scene/ExhibitionScene.tsx`, `FE/src/scene/Booth.tsx`, `FE/src/scene/assetLoader.ts`, `FE/public/models/`.

---

## 1. Bố cục 6 Gian hàng V27.5 Thực tế (`worldLayout.ts`)
- **Kích thước hội trường V27.5:** `51.2m × 46.0m`, Đại lộ trung tâm `10.2m`, Walkable bounds `X: [-22.8, 22.8]`, `Z: [-20.8, 20.8]`.
- **Điểm Spawn:** `(0, 15.2)`, `rotationY = Math.PI` (nhìn thẳng hướng Bắc `-Z` vào quảng trường chữ U).
- **Transform thực tế 6 gian hàng (quay mặt vào không gian trung tâm — khoảng trống đối diện 24.96m):**
  1. `booth-nordic-living` (`Signature Ring`): `(-6.6, -16.8)`, `rotY = 0` (`north-left`)
  2. `booth-lumina-design` (`Organic Flow`): `(+6.6, -16.8)`, `rotY = 0` (`north-right`)
  3. `booth-aether-tech` (`Grand Portal`): `(-15.6, -6.4)`, `rotY = +PI/2` (`west-far`)
  4. `booth-ecovita-craft` (`Gallery Arch`): `(-15.6, +6.0)`, `rotY = +PI/2` (`west-near`)
  5. `booth-solaris-energy` (`Wave Pavilion`): `(+15.6, -6.4)`, `rotY = -PI/2` (`east-far`)
  6. `booth-kinetix-robotics` (`Dynamic Frame`): `(+15.6, +6.0)`, `rotY = -PI/2` (`east-near`)

---

## 2. Bảng Kiểm Kê Asset & Component (V27.5 → V28)

| Asset / Component | V27.5 Source | V28 Existing | Action | Performance Impact |
| :--- | :--- | :--- | :--- | :--- |
| **6 Booth Archetypes GLB (`v27_4`)** | `FE/public/models/booths/v27_4/booth_01..06_v27_4.glb` | Đã tái sử dụng qua `v28BoothAssets.ts` | **ALREADY PRESENT / REUSE** | Thấp (shared geometries & materials, clone scene graph) |
| **6 Product Display Slots Layout** | `Booth.tsx` (`V27_4_PRODUCT_DISPLAY_LAYOUTS`) | `DynamicBooth3D.tsx` (6 pedestal slots) | **ADAPT** | Thấp (chỉ mount ở Ring 0 Near) |
| **Terrazzo Architectural Floor & Joints** | `GrandExpoHall.tsx` (`createGrandHallFloorTexture`) | Sàn phẳng màu trơn `#f1f5f9` | **REUSE / ADAPT** (`V27VisualKit.tsx`) | Rất thấp (1 shared CanvasTexture lặp tile) |
| **Grand Expo Medallion** | `sceneTextures.ts` (`createGrandExpoMedallionTexture`) | Chưa có | **REUSE** (Main Plaza & Cluster Centers) | Rất thấp (1 shared texture) |
| **Champagne Inlay (`#d6be96`) & Booth Pads** | `GrandExpoHall.tsx` (`MAT_CHAMPAGNE_INLAY`, `MAT_BOOTH_ZONE_PAD`) | Chưa có | **REUSE** (`V27VisualKit.tsx`) | Rất thấp (shared material) |
| **Landscape Lounge (`v27_5`)** | `FE/public/models/plaza/v27_5/landscape_lounge_v27_5.glb` | Chưa có | **OPTIMIZE / REUSE** (streamed per cluster) | Trung bình (shared GLB clone, chỉ mount gần) |
| **Interactive Expo Corner (`v27_5`)** | `FE/public/models/plaza/v27_5/interactive_expo_corner_v27_5.glb` | Chưa có | **OPTIMIZE / REUSE** (streamed per cluster) | Trung bình (shared GLB clone, chỉ mount gần) |
| **Mid-Booth Plaza Oasis (`v27_5`)** | `FE/public/models/plaza/v27_5/plaza_oasis_v27_5.glb` | Chưa có | **OPTIMIZE / REUSE** (streamed per cluster) | Thấp (shared GLB clone) |
| **Avenue Planter Island (`v27_5`)** | `FE/public/models/plaza/v27_5/avenue_planter_island_v27_5.glb` | Bồn cây box đơn giản | **REUSE** (Main Plaza & Avenue) | Thấp (shared GLB clone) |
| **Welcome Desk & Directory Monument (`v27_4`)** | `FE/public/models/plaza/v27_4/welcome_desk_v27_4.glb`, `directory_monument_v27_4.glb` | Kiosk hộp đơn giản | **REUSE** (Main Welcome Plaza) | Thấp (chỉ đặt tại Main Plaza) |
| **Mini Café & Rest Lounge (`v27_4`)** | `FE/public/models/plaza/v27_4/mini_cafe_corner_v27_4.glb`, `rest_lounge_v27_4.glb` | Chưa có | **REUSE** (Main Plaza flanks) | Thấp (chỉ đặt tại Main Plaza) |
| **Check-in Photo Stage (`v27_4`)** | `FE/public/models/plaza/v27_4/checkin_stage_v27_4.glb` | Chưa có | **REUSE** (North Focal Plaza) | Thấp (1 instance) |
| **Digital Signage Totems (`v27_4`)** | `FE/public/models/plaza/v27_4/digital_totem_v27_4.glb` | Chưa có | **REUSE** (Zone Plazas) | Thấp (shared GLB clone) |
| **Cây Broadleaf / Birch / Đài phun nước Renaissance / Skyline 12 nhà phố** | V26 Outdoor (`ExteriorAssets.tsx` / `Environment.tsx`) — KHÔNG dùng trong Grand Expo Hall V27.5 | Không dùng trong Hall trong nhà V28 | **INCOMPATIBLE / NOT FOUND IN V27.5 HALL** | — (V27.5 là không gian quảng trường/sảnh triển lãm kiến trúc đương đại; tái sử dụng đúng cây/cảnh quan GLB V27.5) |
| **Camera Drag-to-Rotate, Wheel Zoom & Pitch Clamp** | `ExhibitionScene.tsx` (`DRAG_YAW_SENSITIVITY=0.0052`, `pitch [-0.38, 0.42]`) | Chưa có drag-to-rotate/zoom | **ADAPT** vào `DynamicExhibitionScene.tsx` | Không đáng kể |
| **Lighting & Color Space** | `ExhibitionScene.tsx` (`#eef2f7`, ambient + hemisphere + directional key, sRGB) | Đã có cơ bản (`#dbeafe`) | **ADAPT** (đồng bộ tông sáng kiến trúc V27.5) | Không đáng kể |
