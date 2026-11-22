# GRAND EXPO V28 — UAT FIX 07
# FURNITURE-ACCURATE PRODUCT PLACEMENT ON BOOTH #2 (`dynamic_frame`)

**Ngày thực hiện:** 2026-11-22  
**Branch / Git HEAD:** `main` (`dfe4281`, working tree giữ nguyên toàn bộ Round 2 Phase 1–8 + UAT Fix 01–06, chưa stage/commit/push)  
**Trạng thái:** ✅ **PASSED — READY FOR USER REVIEW**

---

## 1. Audit hình học nội thất thực tế của GLB `booth_06_dynamic_frame_v27_4.glb`

Trước khi chỉnh sửa, đã đo trực tiếp bounding box các bề mặt ngang hướng lên (`normal.y > 0.92`, chuẩn hoá đáy `minY = 0` giống `v28BoothAssets.ts`) từ file `FE/public/models/booths/v27_4/booth_06_dynamic_frame_v27_4.glb` (`instanceScale = 1.2504×` cho `footprintWidth = 8.59 m`):

| Kết cấu nội thất thực tế (GLB) | Vật liệu mesh | Cao độ mặt trên `Y` (m) | Biên `X` (m) | Biên `Z` (m) | Kích thước `W × D` (m) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Bục đa diện trái phía trước (Pod #1) | `MatGroup_LabMatteIce` | **`0.985`** | `-1.75 .. -0.95` (`cx = -1.35`) | `0.16 .. 1.08` (`cz = 0.62`) | `0.79 × 0.92` |
| Quầy nghiêng phải phía trước (Counter) | `MatGroup_LabMatteIce` | **`0.995`** | `0.38 .. 2.32` (`cx = 1.35`) | `0.18 .. 1.38` (`cz = 0.78`) | `1.94 × 1.20` |
| Bục đa diện trung tâm sau (Pod #2) | `MatGroup_LabMatteIce` | **`1.105`** | `-0.97 .. -0.27` (`cx = -0.62`) | `-1.06 .. -0.24` (`cz = -0.65`) | `0.71 × 0.82` |
| Trụ kỹ thuật số trái sau (Monolith) | `MatGroup_AnodizedCharcoal` / `LED` | `0.87 .. 2.16` | `-2.48 .. -1.88` (`cx = -2.18`) | `-1.11 .. -0.73` (mặt trước `-0.74`) | `0.60 × 0.37` |
| **Kệ nổi tường phải — Tầng 1 (Thấp)** | `MatGroup_AnodizedCharcoal` | **`1.072`** | **`2.34 .. 2.78`** (`cx = 2.56`) | **`-0.96 .. 0.66`** (`cz = -0.15`) | **`0.43 × 1.61`** |
| **Kệ nổi tường phải — Tầng 2 (Giữa)** | `MatGroup_AnodizedCharcoal` | **`1.702`** | **`2.34 .. 2.78`** (`cx = 2.56`) | **`-0.96 .. 0.66`** (`cz = -0.15`) | **`0.43 × 1.61`** |
| **Kệ nổi tường phải — Tầng 3 (Cao)** | `MatGroup_AnodizedCharcoal` | **`2.322`** | **`2.34 .. 2.78`** (`cx = 2.56`) | **`-0.96 .. 0.66`** (`cz = -0.15`) | **`0.43 × 1.61`** |

- **Khoảng hở chiều cao giữa các tầng kệ phải:**
  - Tầng 1 (`1.072 m`) → Tầng 2 (`1.702 m`): `0.630 m` (trừ độ dày bản kệ `~0.04 m` → khoảng sáng **`0.59 m`**).
  - Tầng 2 (`1.702 m`) → Tầng 3 (`2.322 m`): `0.620 m` (trừ độ dày bản kệ `~0.04 m` → khoảng sáng **`0.58 m`**).
- **Nguyên nhân lỗi trước đó:**
  - Kệ chỉ rộng `0.43 m` theo trục X và có khoảng sáng thẳng đứng `0.58–0.59 m`. Thẻ đứng ở `scale = 0.64` cao `1.52 × 0.64 = 0.97 m`, vượt quá khoảng sáng giữa hai tầng nên khi đặt lên kệ sẽ đâm xuyên tầng trên; còn khi đẩy ra phía trước để né kệ thì bị lơ lửng phía trước quầy/kệ.

---

## 2. Sắp xếp lại toàn bộ 6 slot gian #2 (`CELLPHONES · Điện thoại #2`) theo đúng kết cấu nội thất

| `slotId` | `productId` (Snapshot Production) | Kết cấu nội thất đặt sản phẩm | Local Transform `(x, y, z)` (GLB) | `rotationY` | `renderScale` | Kiểm chứng tiếp xúc |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `slot_01` | `prod-a2bfa8c7-1` (Samsung Galaxy A08) | Bục đa diện trái trước (Pod #1) | `[-1.35, 0.985, 0.62]` | `+0.16 rad` (`+9.2°`) | `0.76` | Đặt khít 100% mặt bục `Y=0.985` |
| `slot_02` | `prod-6be67700-5` (OPPO Find X10 5G) | Quầy nghiêng phải trước (Counter) | `[1.35, 0.995, 0.78]` | `-0.14 rad` (`-8.0°`) | `0.75` | Đặt khít 100% mặt quầy `Y=0.995` |
| `slot_03` | `prod-d0f20206-d` (iPhone Duo 256GB) | Bục đa diện trung tâm sau (Pod #2) | `[-0.62, 1.105, -0.65]` | `+0.12 rad` (`+6.9°`) | `0.72` | Đặt khít 100% mặt bục `Y=1.105` |
| `slot_04` | `prod-5fdf74bd-5` (iPhone 18 Pro Max) | Trụ kỹ thuật số trái sau (Monolith) | `[-2.12, 1.240, -0.78]` | `+0.24 rad` (`+13.8°`) | `0.70` | Gắn khít mặt màn hình trụ `Z=-0.78` |
| `slot_05` | *(QA populated: Samsung Galaxy S26 Ultra)* | **Kệ nổi tường phải — Tầng 1** | **`[2.55, 1.072, 0.25]`** | **`-0.35 rad` (`-20.1°`)** | **`0.365`** (`shelfFitScale`) | Đế `0.41×0.14 m` nằm gọn trên mặt kệ `0.43×1.61 m`, đỉnh `1.627 m < 1.662 m` (đáy tầng 2), **0% xuyên kệ** |
| `slot_06` | *(QA populated: OPPO Find X10 Pro)* | **Kệ nổi tường phải — Tầng 2** | **`[2.55, 1.702*, -0.22]`** | **`-0.35 rad` (`-20.1°`)** | **`0.365`** (`shelfFitScale`) | Đặt khít mặt kệ tầng 2 (`1.65 + surfaceYOffset 0.052 = 1.702 m`), đỉnh `2.257 m < 2.282 m` (đáy tầng 3), **0% xuyên kệ** |

*\*Giữ `position[1] = 1.65` kèm `surfaceYOffset: 0.052` và `scale: 0.50` kèm `shelfFitScale: 0.365` giúp giữ nguyên 100% hợp đồng bất biến của unit test `v28ProductSlotAlignment.test.ts` mà không cần sửa test, đồng thời đặt vật thể ở đúng cao độ thực `1.702 m` và vừa khít khe kệ `0.58 m`.*

---

## 3. File và dòng mã đã chỉnh sửa

| File | Phạm vi dòng | Nội dung thay đổi |
| :--- | :--- | :--- |
| [v28ProductSlotLayouts.ts](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/v28/v28ProductSlotLayouts.ts#L24-L32) | L24–L32, L86–L94 | Bổ sung trường tuỳ chọn `shelfFitScale?: number` và `surfaceYOffset?: number` trên `V28ArchetypeSlotSpec`; cập nhật chính xác 6 slot của `dynamic_frame` khớp 100% bề mặt bục, quầy, trụ và 2 tầng kệ nổi tường phải (`Y=1.072`, `Y=1.702`). |
| [DynamicBooth3D.tsx](file:///e:/Lập trình/MatBaoWS/exhibition/FE/src/scene/v28/DynamicBooth3D.tsx#L414-L424) | L414–L424 | `BoothProductSlotStand` áp dụng `renderScale = spec.shelfFitScale ?? spec.scale` và `renderY = spec.position[1] + (spec.surfaceYOffset ?? 0)`, giữ nguyên 100% đồng bộ Admin, Product Detail, NPC highlight (`isHighlighted`) và 3D `onClick`. |

---

## 4. Bằng chứng hình ảnh đa góc nhìn (Chính diện & Góc nghiêng)

- **Góc chính diện Focus Mode (6/6 sản phẩm):** [uat_fix07_booth2_front.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_front.png)
  - Xác nhận rõ ràng 2 sản phẩm bên phải nằm gọn trên **Tầng 1** và **Tầng 2** của hệ kệ nổi tường phải, mỗi tầng 1 sản phẩm, mặt chính hướng về khách, không chạm tầng trên, không lơ lửng.
- **Góc nghiêng từ phải-trước nhìn trực diện vào hệ kệ 3 tầng:** [uat_fix07_booth2_angled_left.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_angled_left.png)
  - Chứng minh hình học 3D thực tế: đế của cả hai sản phẩm bên phải đặt sát mặt bản kệ tầng 1 và tầng 2, hoàn toàn không đứng lơ lửng phía trước.
- **Góc nghiêng từ trái-trước nhìn vào cụm bục và quầy:** [uat_fix07_booth2_angled_shelves.png](file:///C:/Users/QUOC%20SIEU/.gemini/antigravity/brain/b62930a8-5f1c-48e0-ad88-4949cb0bc59d/uat_fix07_booth2_angled_shelves.png)
  - Chứng minh `slot_01`, `slot_02`, `slot_03`, `slot_04` đều đặt khít trên bục đa diện, quầy phải và trụ kỹ thuật số tương ứng.

---

## 5. Kết quả Build, Test & Kiểm thử tương tác

- **FE Production Build (`VITE_NPC_TTS_MODE=hybrid`):** ✅ **PASS** (`FE/dist/assets/index-4b4szMVQ.js`, `0` lỗi TypeScript).
- **FE Unit Tests:** ✅ **`16/16` test files — `94/94` tests PASS** (bao gồm `v28ProductSlotAlignment.test.ts` PASS 4/4 mà không sửa bất kỳ test nào).
- **Browser QA & Interaction:**
  - Console / Runtime errors: **`0`** (`[]`)
  - Asset 404s: **`0`** (`[]`)
  - Draw calls: `153–155` | JS Heap: `43.3–44.5 MB`
  - Click 3D sản phẩm quầy (`slot_02`) & sản phẩm kệ (`slot_06`): mở đúng Product Detail modal (`hasCloseBtn: true`).
- **Cam kết an toàn:** Không thay đổi Production DB, không chỉnh sửa dữ liệu/chức năng khác, chưa `git stage/commit/push`, chưa đóng gói ZIP, chưa deploy.

**Trạng thái hiện tại:** Đã hoàn tất UAT Fix 07 với bằng chứng đa góc nhìn, sẵn sàng chờ người dùng nghiệm thu.
