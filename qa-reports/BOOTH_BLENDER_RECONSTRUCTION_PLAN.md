# BẢN KẾ HOẠCH TÁI THIẾT KẾ VÀ DỰNG MODEL 3D BLENDER CHO 6 GIAN HÀNG
## Hướng Dẫn Kỹ Thuật Cho 3D Artist & Technical Artist

**Mã tài liệu:** `QA-PLAN-BLENDER-RECONSTRUCTION`  
**Ngày lập:** 14/11/2026  
**Chế độ:** READ-ONLY BLUEPRINT (Kế hoạch hành động chuẩn bị cho tương lai, không can thiệp code hiện tại)  
**Phần mềm mục tiêu:** Blender 4.x / Maya / 3ds Max -> Xuất GLB (glTF 2.0 Binary)

---

## 1. NGUYÊN TẮC BẤT DI BẤT DỊCH (CORE PRINCIPLES)

Để đảm bảo bạn có thể tự thiết kế gian hàng 3D cực kỳ đẹp mắt, chân thực, đẳng cấp trong Blender mà **KHÔNG BAO GIỜ LÀM LỖI CODE HAY PHÁ VỠ CHỨC NĂNG DYNAMIC CỦA HỆ THỐNG**:

1. **GIỮ NGUYÊN HỆ TRỤC TỌA ĐỘ VÀ TÂM GỐC $[0, 0, 0]$:**
   - Điểm $[0, 0, 0]$ trong Blender phải nằm chính xác tại tâm mặt sàn tiếp xúc đất của gian hàng.
   - Hướng mặt tiền gian hàng nhìn ra luôn là trục **$+Z$ (Forward)**. Trục $+Y$ là thẳng đứng (Up), trục $+X$ là sang phải (Right).
2. **KHÔNG GỘP CÁC BỀ MẶT TEXTURE ĐỘNG VÀO GLB TĨNH:**
   - Biển hiệu (Header Sign), Vách phông nền (Backdrop Screen) và Thẻ sản phẩm (Product Cards) nhận dữ liệu động từ Admin API thông qua `CanvasTexture`. Do đó, bạn không gộp phần ruột hiển thị thông tin này vào texture cố định trong Blender.
   - Thay vào đó, bạn dựng sẵn **khung viền 3D mỹ thuật (Bezel/Frame), chóa đèn, thanh ray rọi LED** và để trống vị trí phẳng cho Three.js áp texture động.
3. **BẢO TỒN KHOẢNG KHÔNG GIAN CỦA 6 PRODUCT SLOTS:**
   - Quầy lễ tân hoặc bục kệ bạn dựng trong Blender phải có mặt phẳng đỡ nằm đúng các cao độ đã audit:
     - Mặt quầy chính giữa: cao độ $y = 0.56\text{m}$ (phạm vi $x \in [-1.7, 1.7]$, $z \in [0.4, 1.4]$).
     - Mặt kệ bên tầng trên: cao độ $y = 1.72\text{m}$.
     - Mặt kệ bên tầng dưới: cao độ $y = 0.42\text{m}$.

---

## 2. PHÂN LOẠI CHI TIẾT CÁC THÀNH PHẦN

### Nhóm A: Các thành phần HOÀN TOÀN CÓ THỂ thay thế bằng model Blender
Những bộ phận này hiện đang ghép bằng các khối hình học cơ bản Three.js (`BoxGeometry`, `CylinderGeometry`), thay thế bằng model Blender điêu khắc chi tiết sẽ tăng tính thẩm mỹ lên gấp nhiều lần:

1. **Bục nền đá & Bậc tam cấp (Plinth & Steps):**
   - *Hiện tại:* Ghép từ 4 hộp `RoundedBoxGeometry`.
   - *Nâng cấp Blender:* Mặt đá marble vát mép cao cấp (beveled edges), bậc thang có gờ chống trượt bằng đồng, rãnh hắt LED chân đế (kickplate glow).
2. **Quầy trưng bày chính giữa (Expo Hero Counter):**
   - *Hiện tại:* Hộp chữ nhật phẳng ghép chồng lên nhau.
   - *Nâng cấp Blender:* Quầy bar uốn cong mềm mại (filleted counter), mặt đá nhân tạo Terrazzo hoặc Corian, lam sóng trang trí mặt trước, khe cắm catalogue tinh xảo.
3. **Kệ trưng bày 2 tầng bên vách (Stepped Side Shelves):**
   - *Hiện tại:* Khối chữ nhật thô và xi lanh làm ti kim loại.
   - *Nâng cấp Blender:* Khung sắt sơn tĩnh điện mỹ thuật phong cách Industrial / Minimalist, đợt gỗ bo cạnh tròn trịa, có sẵn rãnh đèn LED âm dưới đáy từng tầng kệ.
4. **Hệ khung kết cấu kiến trúc (Structural Canopy / Truss / Louvers):**
   - *Hiện tại:* Các nan sọc chữ nhật đơn điệu.
   - *Nâng cấp Blender:* Khung giàn không gian (space truss) chuyên nghiệp của các triển lãm quốc tế, khớp nối hình cầu CNC, thanh giằng hợp kim nhôm đục lỗ tản nhiệt.
5. **Cột trang trí mặt tiền & Thiết bị triển lãm (Props & Kiosks):**
   - Cột kiosk thông tin tra cứu cảm ứng có độ vát công thái học.
   - Đèn spotlight rọi ray dạng đôi/ba gắn trên khung dầm.

### Nhóm B: Các thành phần KHÔNG ĐƯỢC làm cứng vào GLB (Phải giữ logic Dynamic của Three.js)
1. **Mặt phẳng hiển thị Biển hiệu:** Phải giữ vị trí $[0, 3.38, 3.52]$ để hứng `createBoothSignTexture()`.
2. **Mặt phẳng hiển thị Phông nền:** Phải giữ vị trí $[0, 1.82, -1.92]$ để hứng `createEnterpriseBackdropTexture()`.
3. **6 Tọa độ Product Slots:** Không đặt bất kỳ vật cản cứng nào che lấp tọa độ của `slot_01` .. `slot_06`.

---

## 3. CHECKLIST KỸ THUẬT KHI DỰNG VÀ EXPORT MODEL TỪ BLENDER

Để tối ưu hiệu năng web 3D và chuẩn hóa pipeline:

1. **Ngân sách Poly / Triangles (Budget):**
   - Mỗi gian hàng hoàn chỉnh nên khống chế trong khoảng **15,000 – 30,000 Triangles** (độ chi tiết cao hơn 4-5 lần hiện tại nhưng vẫn cực kỳ mượt mà ở 60 FPS).
2. **Mesh Naming Convention (Đặt tên Object rõ ràng):**
   - `Plinth_Floor_Base`: Bục nền đá và bậc thang.
   - `Counter_Main_Hero`: Quầy trưng bày chính giữa.
   - `Shelf_Stepped_Left`: Cụm kệ bên trái.
   - `Shelf_Stepped_Right`: Cụm kệ bên phải.
   - `Structure_Frame`: Khung cột dầm kiến trúc.
   - `Fixture_Spotlights`: Cụm đèn rọi ray.
   - `Empty_Slot_01` .. `Empty_Slot_06`: Các Empty Object (Axes) đặt tại đúng tâm bề mặt các vị trí trưng bày để làm điểm neo (Snap anchor / Socket).
3. **Vật liệu & Texture PBR (PBR Texture Packing):**
   - Gom tối đa vật liệu thành **1 hoặc 2 bộ Texture Atlas** kích thước 2048x2048:
     - `BaseColor` (sRGB)
     - `Roughness / Metallic / AO` (Gộp vào các kênh R-G-B của 1 map duy nhất để tối ưu bộ nhớ VRAM).
     - `Normal` (OpenGL format $+Y$).
     - `Emissive` (Cho các chi tiết đèn viền LED).
4. **Cài đặt Export glTF/GLB:**
   - Định dạng: **glTF Binary (`.glb`)**.
   - Include: `Selected Objects` hoặc gom vào Collection riêng.
   - Transform: `+Y Up`, `Apply Modifiers` bật `ON`.
   - Geometry: Bật `Apply Modifiers`, `Tangents` (nếu dùng Normal map), bỏ chọn Vertex Colors nếu không cần.
   - Compression: Khuyến nghị dùng nén **Draco Compression** hoặc tối ưu bằng `gltf-transform` sau khi xuất để file có dung lượng siêu nhẹ (< 1.5MB / gian).
