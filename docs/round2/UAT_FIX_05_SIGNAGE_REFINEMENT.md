# GRAND EXPO V28 — UAT FIX 05
# PREMIUM ROUNDED BOOTH SIGNAGE — POSITION & PROPORTION

**Ngày hoàn thành:** 2026-11-22  
**Bundle FE cuối cùng:** `FE/dist/assets/index-BeWY97HE.js` (`VITE_NPC_TTS_MODE=hybrid`, `0` lỗi TypeScript)  
**Nghiệm thu kỹ thuật:** **`16 / 16` Quality Gate PASS** *(thẩm mỹ cung cấp screenshot thực tế chờ người dùng duyệt riêng)*

---

## 1. Nguyên nhân gốc (Audit trước khi sửa)

1. **Vị trí quá cao (gần sát / đụng Focus HUD):**
   - `ARCHETYPE_SIGN_THEME` trong `FE/src/scene/v28/DynamicBooth3D.tsx` đặt `signY` từ `3.48–3.85` (nhân `instanceScale = 1.25` thành `4.35–4.81 m`), khiến mép trên biển hiệu ở các archetype vòm (`organic_flow` gian `#46`, `gallery_arch` `#1`, `wave_pavilion` `#6`) nằm quá cao và sát mép Focus HUD phía trên.
   - **Không phải lỗi camera:** Camera Focus Mode giữ nguyên chuẩn; chỉ cần hạ `signY` hợp lý theo từng archetype là giải quyết triệt để.
2. **Hình khối vuông vức & khung đen nặng nề:**
   - `SIGN_BACK_GEOM` dùng `THREE.BoxGeometry(3.60, 0.63, 0.042)` với 4 góc nhọn `90°` và tỷ lệ ngang/cao hơi ngắn (`5.93:1`), nên chưa hòa hợp với các gian hàng mái vòm (`organic_flow`, `gallery_arch`).

---

## 2. File & dòng code đã chỉnh sửa

- [DynamicBooth3D.tsx](file:///e:/Lập%20trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx):
  - **L28–L68:** Tạo helper `createRoundedRectShape(w, h, r)` thuần Three.js (`0` thư viện mới). Thay `SIGN_BACK_GEOM` thành `THREE.ExtrudeGeometry` bo tròn thật cả 4 góc (`r = 0.155 m`, bevel mịn `0.008 m`) với vật liệu xám-xanh kim loại satin mảnh (`#1e3a52`, `emissive: #0e7490`, `emissiveIntensity: 0.14`, bỏ khung đen đặc). Tăng bề ngang `SIGN_BOARD_GEOM` từ `3.56 × 0.60 m` lên **`4.18 × 0.56 m`** (**+17.4% bề ngang**, tỷ lệ ngang thanh thoát **`7.46:1`**).
  - **L189–L200:** Hạ `signY` theo từng archetype (`-0.22` đến `-0.33` đơn vị world-space) để tạo khoảng thở rõ rệt dưới Focus HUD và ăn khớp với mái vòm/cổng.
  - **L240–L345:** Thiết kế lại `createBoothSignTexture` (`1280 × 172`, tỷ lệ chuẩn `7.44:1`, `0%` kéo giãn logo/chữ): nền bo góc xanh navy đậm chuyển sắc (`#0b192c → #102a43 → #0f2e3a`), viền teal mảnh (`rgba(45, 212, 191, 0.55)`), điểm nhấn ánh sáng đáy tinh tế, logo bo góc `110×110`, tên doanh nghiệp nổi bật (`50px`/`38px`, tự động xuống tối đa 2 dòng + `…`), 2 badge nhỏ cân đối `#số gian` & `KHU` bên phải.
  - **L576–L584:** Giữ nguyên render 2 mặt trước/sau (`±0.026`) với `transparent` + `alphaTest={0.05}` để bo tròn đồng bộ cả nền, viền và khung 3D ở cả hai mặt.

---

## 3. So sánh Vị trí & Tỷ lệ Trước / Sau

### 3.1 Vị trí `signY` theo từng Archetype (trước khi nhân `instanceScale`)

| Archetype | Trước (`signY`) | Sau (`signY`) | Mức hạ |
|---|---:|---:|---:|
| `signature_ring` | `3.52` | **`3.28`** | `-0.24` (`-0.30 m` thực) |
| `organic_flow` (Gian `#46`, `#4`) | `3.55` | **`3.28`** | `-0.27` (`-0.34 m` thực) |
| `grand_portal` | `3.50` | **`3.28`** | `-0.22` (`-0.28 m` thực) |
| `wave_pavilion` | `3.85` | **`3.52`** | `-0.33` (`-0.41 m` thực) |
| `gallery_arch` | `3.62` | **`3.36`** | `-0.26` (`-0.33 m` thực) |
| `dynamic_frame` | `3.48` | **`3.26`** | `-0.22` (`-0.28 m` thực) |

### 3.2 Kích thước & Hình khối biển hiệu

| Thông số | Trước (UAT Fix 04) | Sau (UAT Fix 05) |
|---|---|---|
| Mặt bảng (`SIGN_BOARD_GEOM`) | `3.56 × 0.60 m` (tỷ lệ `5.93:1`, góc vuông) | **`4.18 × 0.56 m`** (tỷ lệ **`7.46:1`**, `+17.4%` ngang, bo góc `r = 0.14 m`) |
| Khung 3D (`SIGN_BACK_GEOM`) | `BoxGeometry` vuông `3.60 × 0.63 × 0.042` | **`ExtrudeGeometry` bo tròn 4 góc + bevel mảnh** |
| Canvas Texture | `1024 × 176` | **`1280 × 172`** (nền navy đậm + viền teal mảnh) |

---

## 4. Kết quả 16/16 Quality Gate bắt buộc

| Gate | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| **T01** | Biển hiệu không còn dính HUD ở Focus Mode | **PASS** | Khoảng thở rõ rệt trên cả 6/6 archetypes (`uat_fix05_arch_*`) |
| **T02** | Biển hiệu hạ xuống hợp lý | **PASS** | Hạ `-0.22` đến `-0.33` đơn vị theo từng archetype |
| **T03** | Biển hiệu dài và thanh thoát hơn baseline | **PASS** | `3.56×0.60 → 4.18×0.56` (`7.46:1`) |
| **T04** | Cả nền, viền và khung 3D đều bo góc | **PASS** | `ExtrudeGeometry` + `ctx.roundRect` + `transparent` |
| **T05** | Không còn khung đen dày | **PASS** | Khung satin mảnh `#1e3a52` + viền teal `3.5px` |
| **T06** | Logo, tên DN, số gian, khu hiển thị đúng | **PASS** | Xác minh trên `#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#46` |
| **T07** | Tên doanh nghiệp dài không tràn | **PASS** | `Nông Trại Mật Ong Tây Nguyên (Demo)` hiển thị gọn 1 dòng không tràn (`uat_fix05_arch_organic_flow_b4.png`) |
| **T08** | Không che mái, lối vào, NPC hoặc sản phẩm | **PASS** | Xác minh thị giác trên cả 6 archetypes |
| **T09** | 6/6 archetypes hiển thị đúng | **PASS** | 6 ảnh `uat_fix05_arch_*` |
| **T10** | Biển hiệu mặt sau vẫn hoạt động | **PASS** | Mesh mặt sau `z = -0.026, rotY = Math.PI` giữ nguyên |
| **T11** | Desktop `1440×900` PASS | **PASS** | 6 ảnh `uat_fix05_arch_*` |
| **T12** | Tablet `768×1024` PASS | **PASS** | `tabletOverflowX: false` (`uat_fix05_tablet_768.png`) |
| **T13** | Mobile emulation `390×844` PASS | **PASS** | `mobileOverflowX: false` (`uat_fix05_mobile_390.png`) |
| **T14** | Không ảnh hưởng Focus Camera & transitions | **PASS** | Không sửa `v28CameraController.ts`, `v28CameraAndMovementParity.test.ts` (`6/6` PASS) |
| **T15** | Không regression UAT Fix 01–04 | **PASS** | Toàn bộ test suite `16/16` files PASS |
| **T16** | FE build & toàn bộ unit tests PASS | **PASS** | `dist/assets/index-BeWY97HE.js`, **`94/94` FE tests PASS**, `0` runtime errors, `0` asset 404s |

---

## 5. Danh mục Screenshot thực tế (6/6 Archetypes + Tablet & Mobile)

Thư mục: `C:/Users/QUOC SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/`

- `gallery_arch` (`#1`): `uat_fix05_arch_gallery_arch_b1.png`
- `dynamic_frame` (`#2`): `uat_fix05_arch_dynamic_frame_b2.png`
- `signature_ring` (`#3`): `uat_fix05_arch_signature_ring_b3.png`
- `organic_flow` (`#4`, cùng archetype mái vòm gian `#46`): `uat_fix05_arch_organic_flow_b4.png`
- `grand_portal` (`#5`): `uat_fix05_arch_grand_portal_b5.png`
- `wave_pavilion` (`#6`): `uat_fix05_arch_wave_pavilion_b6.png`
- Tablet `768×1024`: `uat_fix05_tablet_768.png`
- Mobile `390×844`: `uat_fix05_mobile_390.png`
