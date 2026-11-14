# BẢN ĐỒ TỌA ĐỘ VÀ ÁNH XẠ 36 PRODUCT SLOTS
## Virtual Expo Plaza — 6 Booths x 6 Product Slots Architecture

**Mã tài liệu:** `QA-AUDIT-PRODUCT-SLOTS-MAP`  
**Ngày thực hiện:** 14/11/2026  
**Chế độ:** READ-ONLY AUDIT  

---

## 1. NGUYÊN LÝ HOẠT ĐỘNG CỦA HỆ THỐNG PRODUCT SLOTS

Mỗi gian hàng trong triển lãm sở hữu chính xác **6 vị trí trưng bày sản phẩm (Product Slots)** cố định được chuẩn hóa công thái học 3D.
- **Quy tắc zone:**
  - **Zone 1: Quầy chính giữa (Hero Counter):** Gồm `slot_01` (Trái) và `slot_02` (Phải). Dành cho các sản phẩm tiêu biểu (Hero Products) với kích thước bảng hiển thị lớn ($1.60\text{m} \times 2.04\text{m}$).
  - **Zone 2: Kệ tầng vách Trái (Left Stepped Shelf):** Gồm `slot_03` (Tầng trên) và `slot_04` (Tầng dưới). Bảng hiển thị phụ ($1.16\text{m} \times 1.21\text{m}$).
  - **Zone 3: Kệ tầng vách Phải (Right Stepped Shelf):** Gồm `slot_05` (Tầng trên) và `slot_06` (Tầng dưới). Bảng hiển thị phụ ($1.16\text{m} \times 1.21\text{m}$).
- **Quy tắc hiển thị linh hoạt:**
  - Khi slot **TRỐNG (Empty)**: Hiển thị đệm nhung nhung nỉ triển lãm sang trọng với 4 góc viền kim loại đồng (`SLOT_EMPTY_BEVEL_GEOM` + `SLOT_EMPTY_INLAY_GEOM`).
  - Khi slot **CÓ SẢN PHẨM (Assigned)**: Hiển thị bảng đứng có chân đế nghiêng, chạy viền LED màu thương hiệu, mặt trước gắn `CanvasTexture` sắc nét (ảnh sản phẩm, tên, giá tiền VND, mã SKU, nhãn slot).
  - Khi sản phẩm có thuộc tính `modelUrl` (file `.glb` hoặc `.gltf` hợp lệ): Hệ thống sẽ nạp model 3D trực tiếp lên trên bục thay cho ảnh phẳng!

---

## 2. BẢNG TỌA ĐỘ LOCAL CỦA 6 SLOTS TRONG KHÔNG GIAN GIAN HÀNG

Toạ độ Local $[x, y, z]$ tính theo tâm gốc $[0, 0, 0]$ của từng gian hàng:

| Slot ID | Khu vực (Zone) | Tọa độ Local $[X, Y, Z]$ | Góc xoay Local (Yaw $\theta_y$) | Giới hạn kích thước $[W, H, D]$ |
|---|---|---|---|---|
| **`slot_01`** | Quầy chính (Trái) | $[-0.88, 0.56, 0.92]$ | $+0.04\text{ rad } (+2.3^\circ)$ | $1.62\text{m} \times 2.08\text{m} \times 0.56\text{m}$ |
| **`slot_02`** | Quầy chính (Phải) | $[+0.88, 0.56, 0.92]$ | $-0.04\text{ rad } (-2.3^\circ)$ | $1.62\text{m} \times 2.08\text{m} \times 0.56\text{m}$ |
| **`slot_03`** | Kệ trái (Tầng trên) | $[-2.44, 1.72, 0.68]$ | $+0.20\text{ rad } (+11.5^\circ)$ | $1.18\text{m} \times 1.24\text{m} \times 0.52\text{m}$ |
| **`slot_04`** | Kệ trái (Tầng dưới) | $[-2.44, 0.42, 1.12]$ | $+0.20\text{ rad } (+11.5^\circ)$ | $1.18\text{m} \times 1.24\text{m} \times 0.52\text{m}$ |
| **`slot_05`** | Kệ phải (Tầng trên) | $[+2.44, 1.72, 0.68]$ | $-0.20\text{ rad } (-11.5^\circ)$ | $1.18\text{m} \times 1.24\text{m} \times 0.52\text{m}$ |
| **`slot_06`** | Kệ phải (Tầng dưới) | $[+2.44, 0.42, 1.12]$ | $-0.20\text{ rad } (-11.5^\circ)$ | $1.18\text{m} \times 1.24\text{m} \times 0.52\text{m}$ |

*Ghi chú:* Khi render trên kệ bên (`left-shelf` / `right-shelf`), component `SlotProductDisplay` cộng thêm một góc bù vi tế $\pm 0.06$ rad để thẻ sản phẩm hướng nhẹ về phía khách tham quan đứng ở tâm lối vào.

---

## 3. BẢNG TỌA ĐỘ TOÀN CẦU (WORLD COORDINATES) 36 PRODUCT SLOTS

Tọa độ World $[X_w, Y_w, Z_w]$ được tính bằng phép biến đổi Affine theo vị trí $[X_b, Z_b]$ và góc quay $R_y$ của từng gian hàng:
$$\begin{pmatrix} X_w \\ Z_w \end{pmatrix} = \begin{pmatrix} \cos R_y & \sin R_y \\ -\sin R_y & \cos R_y \end{pmatrix} \begin{pmatrix} X_l \\ Z_l \end{pmatrix} + \begin{pmatrix} X_b \\ Z_b \end{pmatrix}$$

### Gian hàng 1: Aether Tech Lab (`booth-aether-tech`)
- **Tọa độ gian hàng:** $[-12.5, 0, -9.0]$, Quay: $+0.9468$ rad ($+54.2^\circ$)
- **Sản phẩm gán mặc định:** `slot_01` (AetherSense X1), `slot_03` (AetherGlass Lite).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[-12.268, 0.56, -7.748]$ | $+0.9868$ rad | Trạm Cảm Biến AetherSense X1 |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[-11.248, 0.56, -9.176]$ | $+0.9068$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[-13.376, 1.72, -6.611]$ | $+1.1468$ rad | Kính AR AetherGlass Lite |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[-13.018, 0.42, -6.353]$ | $+1.1468$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[-10.518, 1.72, -10.569]$ | $+0.7468$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[-10.160, 0.42, -10.311]$ | $+0.7468$ rad | *(Trống - Hiển thị đế đệm)* |

### Gian hàng 2: Nordic Living Studio (`booth-nordic-living`)
- **Tọa độ gian hàng:** $[0.0, 0, -13.0]$, Quay: $0.0000$ rad ($0.0^\circ$ - Mặt nhìn thẳng hướng Nam $+Z$)
- **Sản phẩm gán mặc định:** `slot_01` (Bàn Fjäll Standing Desk), `slot_03` (Ghế Nordic AirMesh).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[-0.880, 0.56, -12.080]$ | $+0.0400$ rad | Bàn Nâng Hạ Fjäll Desk |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[+0.880, 0.56, -12.080]$ | $-0.0400$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[-2.440, 1.72, -12.320]$ | $+0.2000$ rad | Ghế Công Thái Học AirMesh |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[-2.440, 0.42, -11.880]$ | $+0.2000$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[+2.440, 1.72, -12.320]$ | $-0.2000$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[+2.440, 0.42, -11.880]$ | $-0.2000$ rad | *(Trống - Hiển thị đế đệm)* |

### Gian hàng 3: EcoVita Roastery & Craft (`booth-ecovita-craft`)
- **Tọa độ gian hàng:** $[+12.5, 0, -9.0]$, Quay: $-0.9468$ rad ($-54.2^\circ$)
- **Sản phẩm gán mặc định:** `slot_01` (Cà phê Arabica Honey), `slot_02` (Hộp quà EcoVita Drip Box).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[+11.248, 0.56, -9.176]$ | $-0.9068$ rad | Cà Phê Cầu Đất Arabica |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[+12.268, 0.56, -7.748]$ | $-0.9868$ rad | Bộ Quà Tặng Drip Box |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[+10.518, 1.72, -10.569]$ | $-0.7468$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[+10.160, 0.42, -10.311]$ | $-0.7468$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[+13.376, 1.72, -6.611]$ | $-1.1468$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[+13.018, 0.42, -6.353]$ | $-1.1468$ rad | *(Trống - Hiển thị đế đệm)* |

### Gian hàng 4: Kinetix Robotics & AI (`booth-kinetix-robotics`)
- **Tọa độ gian hàng:** $[-12.5, 0, +9.0]$, Quay: $+2.1948$ rad ($+125.8^\circ$)
- **Sản phẩm gán mặc định:** `slot_01` (Robot AMR-200), `slot_05` (Camera AI EyePro).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[-11.239, 0.56, +9.177]$ | $+2.2348$ rad | Robot Vận Chuyển AMR-200 |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[-12.261, 0.56, +7.747]$ | $+2.1548$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[-10.510, 1.72, +10.568]$ | $+2.3948$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[-10.154, 0.42, +10.309]$ | $+2.3948$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[-13.382, 1.72, +6.612]$ | $+1.9948$ rad | Camera AI Kinetix EyePro |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[-13.026, 0.42, +6.353]$ | $+1.9948$ rad | *(Trống - Hiển thị đế đệm)* |

### Gian hàng 5: Lumina Design Collective (`booth-lumina-design`)
- **Tọa độ gian hàng:** $[+12.5, 0, +9.0]$, Quay: $-2.1948$ rad ($-125.8^\circ$)
- **Sản phẩm gán mặc định:** `slot_01` (Đèn Halo Linear 120), `slot_03` (Tấm tiêu âm Acoustic Hex).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[+12.261, 0.56, +7.747]$ | $-2.1548$ rad | Đèn Thả Kiến Trúc Halo 120 |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[+11.239, 0.56, +9.177]$ | $-2.2348$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[+13.382, 1.72, +6.612]$ | $-1.9948$ rad | Bộ Tiêu Âm Acoustic Hex |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[+13.026, 0.42, +6.353]$ | $-1.9948$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[+10.510, 1.72, +10.568]$ | $-2.3948$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[+10.154, 0.42, +10.309]$ | $-2.3948$ rad | *(Trống - Hiển thị đế đệm)* |

### Gian hàng 6: Solaris Clean Energy (`booth-solaris-energy`)
- **Tọa độ gian hàng:** $[0.0, 0, +13.0]$, Quay: $+3.1416$ rad ($+180.0^\circ$ - Mặt nhìn thẳng hướng Bắc $-Z$)
- **Sản phẩm gán mặc định:** `slot_01` (Pin PowerWall 10kWh), `slot_05` (Trạm sạc ChargeBox 22kW).

| Slot | Zone | Local $[X, Y, Z]$ | World $[X_w, Y_w, Z_w]$ | World Yaw | Sản phẩm đang gán |
|---|---|---|---|---|---|
| `slot_01` | counter | $[-0.88, 0.56, 0.92]$ | $[+0.880, 0.56, +12.080]$ | $+3.1816$ rad | Pin Lưu Trữ PowerWall 10kWh |
| `slot_02` | counter | $[+0.88, 0.56, 0.92]$ | $[-0.880, 0.56, +12.080]$ | $+3.1016$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_03` | left-shelf | $[-2.44, 1.72, 0.68]$ | $[+2.440, 1.72, +12.320]$ | $+3.3416$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_04` | left-shelf | $[-2.44, 0.42, 1.12]$ | $[+2.440, 0.42, +11.880]$ | $+3.3416$ rad | *(Trống - Hiển thị đế đệm)* |
| `slot_05` | right-shelf | $[+2.44, 1.72, 0.68]$ | $[-2.440, 1.72, +12.320]$ | $+2.9416$ rad | Trạm Sạc Xe Điện ChargeBox |
| `slot_06` | right-shelf | $[+2.44, 0.42, 1.12]$ | $[-2.440, 0.42, +11.880]$ | $+2.9416$ rad | *(Trống - Hiển thị đế đệm)* |

---

## 4. QUY TRÌNH KẾT NỐI VÀ GÁN DỮ LIỆU TỪ ADMIN DASHBOARD ĐẾN 3D SCENE

1. **Giao diện Quản trị (Admin UI - `AdminPage.tsx`):**
   - Admin truy cập tab *Gian hàng & Slot*.
   - Dropdown chọn sản phẩm cho từng `slot_01` .. `slot_06`.
   - Gửi request `POST /api/booths/:boothId/slots/:slotId/assign` kèm payload `{ productId: "..." }`.
2. **Xử lý Backend & Lưu trữ Database (`BE/src/database/db.ts`):**
   - Bảng `booth_slot_assignments` lưu trữ `(booth_id, slot_id, product_id, updated_at)`.
   - Backend phát sự kiện Socket.io: `expo:data-updated` với `entityType: 'slot'`.
3. **Đồng bộ Thời gian thực lên Web 3D (`useExpoData.ts` & `Booth.tsx`):**
   - Frontend nhận event Socket.io hoặc fetch `GET /api/booths/:id/slots`.
   - Hook cập nhật state `slots` cho `Booth.tsx`.
   - `Booth.tsx` kích hoạt hàm vẽ `createProductDisplayCardTexture()` trong canvas 2D ngầm.
   - Thẻ hiển thị được cập nhật ngay lập tức mà không cần reload trang!
