# VIRTUAL EXPO 3D — BOOTH 3D ASSEMBLY BLUEPRINT (TASK C)
## BẢN THIẾT KẾ KỸ THUẬT LẮP RÁP GIAN HÀNG 3D MODULAR
**Dự án:** Virtual Expo Plaza 3D  
**Repository:** `E:\Lập trình\MatBaoWS\exhibition`  
**Phiên bản:** 1.0.0 (Production Architecture Specification)  
**Ngày lập:** 14/11/2026  
**Chế độ:** Phân tích & Tài liệu kỹ thuật chuyên sâu (Documentation & Blueprint Only — No Geometry Replacement)

---

## 1. MỤC TIÊU VÀ NGUYÊN TẮC THIẾT KẾ

Tài liệu này cung cấp **bản quy chuẩn kỹ thuật toàn diện** về cấu trúc 3D của 6 gian hàng triển lãm trong Virtual Expo Plaza. Tài liệu được thiết kế để 3D Artist, Technical Artist và lập trình viên có thể mô hình hóa độc lập từng chi tiết trong Blender, xuất file GLB tối ưu và lắp ráp trong React Three Fiber mà **tuyệt đối không làm thay đổi tọa độ, góc nhìn, logic tương tác hay che khuất 36 Product Slots hiện hành**.

### 5 Nguyên tắc Bất khả xâm phạm:
1. **Product Slot Decoupling:** 6 Product Slots (`slot_01` .. `slot_06`) trên mỗi gian hàng được điều khiển độc lập bằng code logic. Tất cả các bộ phận modular (cột, quầy, kệ, vách) phải tôn trọng khoảng cách an toàn tối thiểu **> 0.15m** so với bounding box của từng slot.
2. **Open-Air / Roofless Architecture:** Toàn bộ gian hàng có chiều cao trần mở (roofless) để camera isometric góc 45° quan sát xuyên suốt nội thất gian hàng và các sản phẩm mà không bị cản trở.
3. **Optimized VBO / Shared Geometry:** Các cấu trúc khung lặp lại phải sử dụng chung vật liệu hoặc instancing để giữ số lượng draw calls dưới 1,500 và duy trì tốc độ khung hình 30-60 FPS trên trình duyệt.
4. **PBR Standard Materials:** Tuân thủ quy chuẩn glTF 2.0 PBR (BaseColor, Metallic-Roughness, Normal, Emissive).
5. **Exact Anchor Origin:** Tâm gốc tọa độ Local `[0, 0, 0]` của mỗi gian hàng nằm tại tâm mặt bằng sàn ở cao độ $Y = 0$.

---

## 2. DANH MỤC 14 BỘ PHẬN 3D MODULAR CẦN THIẾT

Bảng dưới đây định nghĩa đầy đủ 14 mô-đun kiến trúc cần có để cấu thành gian hàng tiêu chuẩn:

| ID Mô-đun | Tên Bộ Phận (EN / VN) | Kích Thước Chuẩn (W x D x H, mét) | Vị Trí Tương Đối (Local X, Y, Z) | Góc Xoay (Euler X, Y, Z) | Áp Dụng | Trạng Thái Hiện Tại | Độ Ưu Tiên | Ràng Buộc Với Product Slots |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MOD_01` | **Base Plinth Slab**<br>Bệ sàn nền gian hàng | $6.40 \times 4.60 \times 0.08$ | `[0.00, 0.04, 0.00]` | `[0, 0, 0]` | Cả 6 Booths | Procedural R3F Box | Cao | Sàn chịu lực bên dưới toàn bộ slots; mặt trên phẳng tại $Y = 0.08$. |
| `MOD_02` | **Inner Showroom Rug**<br>Thảm trải khu vực trưng bày | $5.84 \times 3.88 \times 0.015$ | `[0.00, 0.088, 0.08]` | `[0, 0, 0]` | Cả 6 Booths | Procedural R3F Box | Trung bình | Nằm dưới chân các kệ và quầy; không được nổi gờ quá cao ($< 0.02m$). |
| `MOD_03` | **Structural Outward Column**<br>Cột chịu lực biên ngoài | $0.24 \times 0.24 \times 3.45$ (hoặc $\varnothing 0.24$) | `[±3.28, 1.725, 1.98]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box/Cylinder | Cao | Đặt dạt sang 2 biên $X = \pm 3.28m$, cách xa `slot_03/05` ($X = \pm 2.44m$) ít nhất $0.84m$. |
| `MOD_04` | **Fascia Truss Beam**<br>Dầm giằng ngang mặt tiền | $6.80 \times 0.24 \times 0.24$ | `[0.00, 3.45, 1.98]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box | Trung bình | Treo ở độ cao $Y = 3.45m$, cao hơn đỉnh sản phẩm cao nhất ($Y = 2.40m$) hơn $1.05m$. |
| `MOD_05` | **Brand Header Box**<br>Hộp biển hiệu thương hiệu chính | $6.56 \times 0.34 \times 0.74$ | `[0.00, 3.38, 2.72]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box + CanvasTexture | Cao | Đặt tại mặt trước trên cao; mặt phẳng hiển thị quay về hướng $+Z$. |
| `MOD_06` | **Sign Visor Cornice**<br>Mái che/chỉ phào nóc biển hiệu | $6.66 \times 0.44 \times 0.06$ | `[0.00, 3.78, 2.76]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box | Thấp | Phào chỉ kiến trúc viền nóc biển hiệu; không ảnh hưởng tầm nhìn camera. |
| `MOD_07` | **Rear Backdrop Wall**<br>Vách phông nền trưng bày phía sau | $4.12 \times 0.12 \times 2.46$ | `[0.00, 1.82, -1.92]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Frame + Canvas | Cao | Nằm sát vách sau ($Z = -1.92m$); cách `slot_01/02` ($Z = 0.92m$) tới $2.84m$. |
| `MOD_08` | **Backdrop Light Bar**<br>Thanh đèn rọi vách logo | $3.80 \times 0.22 \times 0.07$ | `[0.00, 3.10, -1.80]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box (Emissive) | Trung bình | Nhô ra rọi sáng mặt vách nền; không che khuất bất kỳ góc máy nào. |
| `MOD_09` | **Hero Center Counter**<br>Quầy trưng bày trung tâm (Khu B) | $3.44 \times 0.92 \times 0.56$ | `[0.00, 0.28, 0.92]` | `[0, 0, 0]` | Cả 6 Booths | Procedural Box Composite | Cao | **Mặt trên quầy tại $Y = 0.56m$ là nơi đặt trực tiếp `slot_01` và `slot_02`**. |
| `MOD_10` | **Left 2-Tier Shelf Rack**<br>Kệ 2 tầng trưng bày bên trái (Khu C1) | $1.32 \times 0.76 \times 2.40$ | `[-2.44, 0.00, 0.90]` | `[0, 0.20, 0]` | Cả 6 Booths | Procedural Composite | Cao | **Mặt kệ tầng dưới $Y = 0.42m$ (`slot_04`), mặt kệ tầng trên $Y = 1.72m$ (`slot_03`)**. |
| `MOD_11` | **Right 2-Tier Shelf Rack**<br>Kệ 2 tầng trưng bày bên phải (Khu C2) | $1.32 \times 0.76 \times 2.40$ | `[2.44, 0.00, 0.90]` | `[0, -0.20, 0]` | Cả 6 Booths | Procedural Composite | Cao | **Mặt kệ tầng dưới $Y = 0.42m$ (`slot_06`), mặt kệ tầng trên $Y = 1.72m$ (`slot_05`)**. |
| `MOD_12` | **Entrance Approach Beacon**<br>Vòng đèn tròn tương tác lối vào | $\varnothing 0.96 \times 0.02$ | `[-1.08, 0.08, 3.12]` | `[-90°, 0, 0]` | Cả 6 Booths | Procedural Ring Mesh | Trung bình | Nằm trên mặt sàn trước cửa gian hàng; cách xa lối đi bộ và các slots. |
| `MOD_13` | **Interactive Info Totem**<br>Trụ thông tin / Kiosk tra cứu | $0.68 \times 0.36 \times 1.92$ | `[-3.48, 0.96, 2.00]` | `[0, 0.30, 0]` | Tech, Robotics | Procedural Box Composite | Trung bình | Đặt ở góc trước bên ngoài gian hàng; không nằm trên đường đi của khách. |
| `MOD_14` | **Landscaping Planter**<br>Bồn hoa / Cây cảnh trang trí | $1.18 \times 1.18 \times 1.02$ (Scale $0.55$) | `[±3.35, 0.02, 2.35]` | Phụ thuộc góc | Cả 6 Booths | `planter.glb` (PBR 3.7k tris) | Sẵn có | Đặt tại góc tiền sảnh ngoài mép cột; cách sản phẩm gần nhất $> 1.10m$. |

---

## 3. PHÂN TÍCH CHI TIẾT TỪNG GIAN HÀNG TRONG 6 GIAN HÀNG

### 3.1. Booth 1: Aether Tech Lab
* **Mã định danh:** `booth-aether-tech`
* **Lĩnh vực / Chủ đề:** Công nghệ & Điện tử (Smart Hardware, Enterprise AR, Industrial IoT)
* **Tọa độ Thế giới (World Position):** `X = -12.50, Y = 0.00, Z = -9.00`
* **Kích thước mặt bằng:** Rộng $W = 4.80m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $\approx 0.9463\text{ rad} \approx +54.22^\circ$ (Mặt tiền quay chéo về hướng Đông Nam, hướng thẳng vào Đài phun nước trung tâm).
* **Màu sắc nhận diện:** `#0ea5e9` (Cyan / Electric Sky Blue).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Bề mặt composite trắng bóng viền dải LED Cyan, chân đế thụt viền kim loại xám tối.
  * **Kệ cánh (Shelves):** Titanium mạ anode xám đậm (`#1e293b`), ti trợ lực chrome bóng.
  * **Brand Signage:** Hộp biển hiệu màu Dark Navy viền dải LED Cyan phát sáng rực rỡ, tích hợp Totem tương tác thông minh ở góc trái trước.
  * **Bồn cây trang trí:** 1 bồn cây công nghệ đặt tại góc trái trước `[-2.72, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[-12.24, 0.56, -9.18]`, Max Size $[1.62 \times 2.08 \times 0.56]m$.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[-11.21, 0.56, -8.17]`, Max Size $[1.62 \times 2.08 \times 0.56]m$.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[-13.37, 1.72, -10.58]`, Max Size $[1.18 \times 1.24 \times 0.52]m$.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[-13.01, 0.42, -10.33]`, Max Size $[1.18 \times 1.24 \times 0.52]m$.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[-10.56, 1.72, -7.80]`, Max Size $[1.18 \times 1.24 \times 0.52]m$.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[-10.19, 0.42, -7.54]`, Max Size $[1.18 \times 1.24 \times 0.52]m$.

---

### 3.2. Booth 2: Nordic Living Studio
* **Mã định danh:** `booth-nordic-living`
* **Lĩnh vực / Chủ đề:** Nội thất & Kiến trúc (Ergonomic Furniture, Scandinavian Minimalist Interior)
* **Tọa độ Thế giới (World Position):** `X = 0.00, Y = 0.00, Z = -13.00`
* **Kích thước mặt bằng:** Rộng $W = 5.20m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $0.00\text{ rad} = 0.0^\circ$ (Mặt tiền quay thẳng về hướng Nam $+Z$, đối diện trực tiếp tâm quảng trường).
* **Màu sắc nhận diện:** `#10b981` (Emerald Green / Warm Wood Accents).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Thân ốp gỗ sồi ấm áp (`#b45309`), mặt bàn phủ đá nhân tạo vân kem (`#fffbeb`), viền chỉ đồng thau chải xước.
  * **Kệ cánh (Shelves):** Khung gỗ sồi 2 tầng, vách lưng thanh lam gỗ đan thoáng (oak slats).
  * **Brand Signage:** Hộp gỗ sồi tự nhiên, phào chỉ nóc tinh xảo phong cách mộc Bắc Âu.
  * **Bồn cây trang trí:** 2 bồn hoa đá cẩm thạch đối xứng ở 2 cánh cửa đón khách `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[-0.88, 0.56, -12.08]`.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[0.88, 0.56, -12.08]`.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[-2.44, 1.72, -12.32]`.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[-2.44, 0.42, -11.88]`.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[2.44, 1.72, -12.32]`.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[2.44, 0.42, -11.88]`.

---

### 3.3. Booth 3: EcoVita Roastery & Craft
* **Mã định danh:** `booth-ecovita-craft`
* **Lĩnh vực / Chủ đề:** Thực phẩm & Nông sản (Specialty Coffee, Sustainable Agriculture, Organic Craft)
* **Tọa độ Thế giới (World Position):** `X = 12.50, Y = 0.00, Z = -9.00`
* **Kích thước mặt bằng:** Rộng $W = 4.80m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $\approx -0.9463\text{ rad} \approx -54.22^\circ$ (Mặt tiền quay chéo về hướng Tây Nam, hướng vào Đài phun nước).
* **Màu sắc nhận diện:** `#f59e0b` (Amber Orange / Warm Coffee Copper).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Gỗ Espresso màu nâu trầm (`#451a03`), mặt đá thạch anh trắng kem, viền đồng đỏ ấm (`#d97706`).
  * **Kệ cánh (Shelves):** Kệ gỗ thủ công ấm áp, thanh kim loại màu đồng thủ công mỹ nghệ.
  * **Brand Signage:** Hộp gỗ sẫm màu với viền đồng dập nổi, chiếu sáng ấm cúng.
  * **Bồn cây trang trí:** 2 bồn cây trang trí nông nghiệp hữu cơ đặt 2 bên lối vào `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[11.21, 0.56, -8.17]`.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[12.24, 0.56, -9.18]`.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[10.56, 1.72, -7.80]`.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[10.19, 0.42, -7.54]`.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[13.37, 1.72, -10.58]`.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[13.01, 0.42, -10.33]`.

---

### 3.4. Booth 4: Kinetix Robotics & AI
* **Mã định danh:** `booth-kinetix-robotics`
* **Lĩnh vực / Chủ đề:** Tự động hóa & Sản xuất (Autonomous Mobile Robots, Industrial Cobots)
* **Tọa độ Thế giới (World Position):** `X = -12.50, Y = 0.00, Z = 9.00`
* **Kích thước mặt bằng:** Rộng $W = 4.80m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $\approx 2.1953\text{ rad} \approx +125.78^\circ$ (Mặt tiền quay chéo về hướng Đông Bắc).
* **Màu sắc nhận diện:** `#6366f1` (Indigo / Industrial Gold Accents).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Composite xám kỹ thuật Slate Dark (`#1e293b`), dải LED vàng công nghiệp (`#fbbf24`), mặt bàn phủ nhựa epoxy kỹ thuật.
  * **Kệ cánh (Shelves):** Giàn truss công nghiệp Chrome bóng phối các vòng định vị màu vàng gold và cyan.
  * **Brand Signage:** Hộp biển kim loại tấm chịu lực, chỉ phào xám mạ kẽm.
  * **Bồn cây trang trí:** 1 bồn cây góc phải trước `[2.72, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[-12.76, 0.56, 9.82]`.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[-13.79, 0.56, 8.81]`.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[-11.63, 1.72, 10.20]`.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[-11.99, 0.42, 10.46]`.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[-14.44, 1.72, 7.42]`.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[-14.81, 0.42, 7.68]`.

---

### 3.5. Booth 5: Lumina Design Collective
* **Mã định danh:** `booth-lumina-design`
* **Lĩnh vực / Chủ đề:** Thiết kế & Đời sống (Architectural Lighting, Sustainable Acoustic Panels)
* **Tọa độ Thế giới (World Position):** `X = 12.50, Y = 0.00, Z = 9.00`
* **Kích thước mặt bằng:** Rộng $W = 4.80m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $\approx -2.1953\text{ rad} \approx -125.78^\circ$ (Mặt tiền quay chéo về hướng Tây Bắc).
* **Màu sắc nhận diện:** `#ec4899` (Magenta Pink / Violet Velvet).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Sơn phủ nghệ thuật màu tím violet (`#7c3aed`), dải LED magenta dịu mắt, bề mặt trưng bày chống lóa.
  * **Kệ cánh (Shelves):** Kệ nghệ thuật màu tím hoa cà với đệm nỉ xám trưng bày hiện vật triển lãm.
  * **Brand Signage:** Hộp biển hiệu màu tím nghệ thuật, gờ viền neon hồng magenta nổi bật.
  * **Bồn cây trang trí:** 2 bồn hoa nghệ thuật đặt 2 bên lối vào `[-2.68, 0.02, 2.35]` và `[2.68, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[13.79, 0.56, 8.81]`.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[12.76, 0.56, 9.82]`.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[14.44, 1.72, 7.42]`.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[14.81, 0.42, 7.68]`.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[11.63, 1.72, 10.20]`.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[11.99, 0.42, 10.46]`.

---

### 3.6. Booth 6: Solaris Clean Energy
* **Mã định danh:** `booth-solaris-energy`
* **Lĩnh vực / Chủ đề:** Năng lượng xanh (Lithium-LFP Energy Storage, Smart Solar EV Chargers)
* **Tọa độ Thế giới (World Position):** `X = 0.00, Y = 0.00, Z = 13.00`
* **Kích thước mặt bằng:** Rộng $W = 5.20m$ (Visual $6.00m$), Sâu $D = 3.80m$ (Visual $4.40m$)
* **Góc xoay hướng mặt tiền (Rotation Y):** $\pi\text{ rad} = 180.0^\circ$ (Mặt tiền quay thẳng về hướng Bắc $-Z$, đối diện trực tiếp tâm quảng trường).
* **Màu sắc nhận diện:** `#14b8a6` (Teal / Eco Emerald Glow).
* **Bố cục nội thất:**
  * **Quầy trung tâm (Counter):** Composite trắng tinh khiết (`#ffffff`), dải LED xanh ngọc lục bảo (`#34d399`), viền chân đế xanh sẫm.
  * **Kệ cánh (Shelves):** Khung kim loại trắng bóng, vách lưng phủ vật liệu phản quang năng lượng mặt trời.
  * **Brand Signage:** Hộp biển hiệu Dark Navy sang trọng, nắp che phủ viền xanh ngọc sinh thái.
  * **Cột trang trí sinh thái:** 2 cột mặt tiền tích hợp dây leo và lá cây xanh sinh thái thẳng đứng.
  * **Bồn cây trang trí:** 2 bồn cây xanh sinh thái đặt tại 2 cánh ngoài `[-3.35, 0.02, 2.35]` và `[3.35, 0.02, 2.35]`.
* **Tọa độ chi tiết 6 Product Slots:**
  * `slot_01` (Hero Trái): Local `[-0.88, 0.56, 0.92]` $\rightarrow$ World `[0.88, 0.56, 12.08]`.
  * `slot_02` (Hero Phải): Local `[0.88, 0.56, 0.92]` $\rightarrow$ World `[-0.88, 0.56, 12.08]`.
  * `slot_03` (Kệ Trái Tầng Trên): Local `[-2.44, 1.72, 0.68]` $\rightarrow$ World `[2.44, 1.72, 12.32]`.
  * `slot_04` (Kệ Trái Tầng Dưới): Local `[-2.44, 0.42, 1.12]` $\rightarrow$ World `[2.44, 0.42, 11.88]`.
  * `slot_05` (Kệ Phải Tầng Trên): Local `[2.44, 1.72, 0.68]` $\rightarrow$ World `[-2.44, 1.72, 12.32]`.
  * `slot_06` (Kệ Phải Tầng Dưới): Local `[2.44, 0.42, 1.12]` $\rightarrow$ World `[-2.44, 0.42, 11.88]`.

---

## 4. QUY CHUẨN KỸ THUẬT MÔ HÌNH HÓA VÀ XUẤT FILE TỪ BLENDER SANG THREE.JS

Để các file GLB sau khi xuất có thể ghép nối chính xác vào hệ thống Three.js / R3F mà không cần điều chỉnh thủ công tọa độ bù lệch, artist cần tuân thủ nghiêm ngặt các quy tắc sau:

### 4.1. Quy ước đặt tên (Naming Conventions)
* **Tên file mô hình:** `booth_<theme>_<component>.glb` (Ví dụ: `booth_tech_counter.glb`, `booth_living_shelf.glb`, `booth_shared_truss.glb`).
* **Tên Mesh Object trong Blender:** Phải bắt đầu bằng tiền tố chức năng:
  * `SM_Booth_<Theme>_Counter`: Static Mesh quầy chính.
  * `SM_Booth_<Theme>_Shelf_L`: Static Mesh kệ trái.
  * `SM_Booth_<Theme>_Shelf_R`: Static Mesh kệ phải.
  * `SM_Booth_<Theme>_Backdrop`: Static Mesh khung vách sau.
  * `SM_Booth_<Theme>_Header`: Static Mesh hộp biển hiệu.
  * `COLL_Booth_Main`: Collision mesh đơn giản (nếu cần va chạm vật lý).

### 4.2. Hệ trục tọa độ và Pivot Point
* **Hệ trục:** Xuất theo chuẩn glTF: **$Y$-Up, $-Z$ Forward**.
* **Pivot Point (Tâm gốc đặt tại Blender):**
  * Đối với các vật thể đặt trên sàn (Sàn nền, Thảm, Quầy, Kệ, Bồn cây, Cột): Pivot Point phải đặt chính xác tại **Mặt Đáy tiếp đất ở tâm ($Z=0, X=0, Y=0$)**.
  * Đối với vật thể treo tường hoặc trên cao (Biển hiệu, Dầm trần, Đèn rọi): Pivot Point đặt tại **Tâm hình học (Bounding Box Center)** hoặc tâm mép gắn giằng.
  * Áp dụng lệnh trong Blender: `Ctrl + A` $\rightarrow$ `Apply All Transforms` (Location, Rotation, Scale) trước khi xuất file. Đảm bảo Scale luôn là `(1.0, 1.0, 1.0)`.

### 4.3. Ngân sách Polycount và Tối ưu hóa (Geometry Budgets)
* Toàn bộ một gian hàng hoàn chỉnh không được vượt quá **25,000 Triangles**.
* Ngân sách chi tiết từng bộ phận:
  * Quầy chính Hero Counter: $\le 2,500$ Triangles.
  * Mỗi bên Kệ 2 tầng: $\le 1,800$ Triangles.
  * Khung vách Backdrop: $\le 1,200$ Triangles.
  * Hệ thống dầm cột chịu lực: $\le 3,000$ Triangles.
  * Hộp biển hiệu và phụ kiện: $\le 1,000$ Triangles.
  * Cây cảnh / Chi tiết phụ: $\le 2,500$ Triangles.
* Khử bỏ triệt để các mặt ẩn bên trong không nhìn thấy (Interior Face Culling) để giảm VBO buffer.

### 4.4. Quy chuẩn Vật liệu và Texture (PBR Textures)
* **Workflow:** Metallic-Roughness PBR Standard.
* **Kích thước Map tối đa:**
  * Texture chính (Albedo/BaseColor): Tối đa **$1024 \times 1024$ pixels**.
  * ORM Map (Occlusion - Roughness - Metallic nén vào 3 kênh R-G-B): **$1024 \times 1024$ pixels**.
  * Normal Map (DirectX hoặc OpenGL): **$1024 \times 1024$ pixels**.
  * Texture lặp chi tiết nhỏ (gỗ, kim loại chải xước): **$512 \times 512$ pixels** (Tiled).
* **Định dạng nén:**
  * Xuất trực tiếp sang GLB nhúng nén KTX2 hoặc WebP để giảm kích thước file xuống dưới **2.5 MB** mỗi bộ gian hàng.

---

## 5. SƠ ĐỒ LẮP RÁP (ASSEMBLY GUIDE) TRONG REACT THREE FIBER

Khi tiến hành lắp ráp bằng code React Three Fiber, quy trình được thực hiện theo 4 lớp phân tầng độc lập (Layered Architecture):

```
+--------------------------------------------------------------------------+
|                        BOOTH ROOT GROUP [X, Y, Z]                        |
|                                                                          |
|  [LỚP 1: NỀN & KHUNG KIẾN TRÚC]                                         |
|  * Sàn bệ đỡ (MOD_01) + Thảm nội thất (MOD_02)                           |
|  * Cột chịu lực 2 bên (MOD_03) + Dầm giằng (MOD_04)                      |
|                                                                          |
|  [LỚP 2: NỘI THẤT TRƯNG BÀY (NƠI GẮN SLOTS)]                             |
|  * Quầy trưng bày Hero Podium (MOD_09)                                   |
|  * Kệ tầng bên trái Khu C1 (MOD_10)                                      |
|  * Kệ tầng bên phải Khu C2 (MOD_11)                                      |
|  * Vách phông nền Calm Backdrop (MOD_07) + Đèn rọi (MOD_08)              |
|                                                                          |
|  [LỚP 3: HỆ THỐNG PRODUCT SLOTS ĐỘC LẬP]                                 |
|  * slot_01 & slot_02 (Đặt trên mặt Quầy MOD_09 tại y=0.56, z=0.92)       |
|  * slot_03 & slot_04 (Đặt trên Kệ trái MOD_10 tại x=-2.44)               |
|  * slot_05 & slot_06 (Đặt trên Kệ phải MOD_11 tại x=+2.44)               |
|                                                                          |
|  [LỚP 4: THƯƠNG HIỆU & CẢNH QUAN]                                        |
|  * Biển hiệu Header Box (MOD_05) + Mái che (MOD_06)                      |
|  * Bồn cây cảnh quan PBR (MOD_14) tại mép hiên ngoài                     |
|  * Vòng đèn tương tác lối vào Beacon (MOD_12)                            |
+--------------------------------------------------------------------------+
```

### Mã mẫu lắp ráp (R3F Implementation Pattern):
```tsx
import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BOOTH_SLOT_DEFINITIONS, type BoothSlotView } from '../types/expo';
import { SlotProductDisplay } from './SlotProductDisplay';
import { ExteriorAssets } from './ExteriorAssets';

export const ModularBoothStand: React.FC<{
  theme: string;
  slots: BoothSlotView[];
  brandTexture: THREE.Texture;
}> = ({ theme, slots, brandTexture }) => {
  // Load modular components từ thư mục models đã tối ưu
  const { scene: counterGlb } = useGLTF(`/models/booths/modular/${theme}_counter.glb`);
  const { scene: shelvesGlb } = useGLTF(`/models/booths/modular/${theme}_shelves.glb`);
  const { scene: frameGlb } = useGLTF(`/models/booths/modular/${theme}_frame.glb`);

  return (
    <group>
      {/* 1. Khung kiến trúc và sàn */}
      <primitive object={frameGlb} />

      {/* 2. Quầy và kệ trưng bày nội thất */}
      <primitive object={counterGlb} />
      <primitive object={shelvesGlb} />

      {/* 3. Product Slots động (Hoàn toàn tách rời khỏi geometry của model quầy kệ) */}
      {slots.map((slotView) => (
        <SlotProductDisplay
          key={slotView.slot.slotId}
          slotView={slotView}
        />
      ))}

      {/* 4. Cảnh quan xanh trang trí (Planter PBR) */}
      <ExteriorAssets id="booth-planter" placements={[
        { position: [-3.35, 0.02, 2.35], rotation: 0.2 },
        { position: [3.35, 0.02, 2.35], rotation: -0.2 }
      ]} />
    </group>
  );
};
```

---

## 6. KẾT LUẬN VÀ KHUYẾN NGHỊ THỰC HIỆN

1. **Bảo tồn tuyệt đối code hiện tại:** Bản thiết kế này đã được đối chiếu 1:1 với kích thước hình học trong `Booth.tsx` và `BOOTH_SLOT_DEFINITIONS`. Không có sự sai lệch tọa độ.
2. **Khả năng mở rộng:** Khi các model GLB mới cho từng module được hoàn thiện trong Blender, hệ thống chỉ cần thay thế các thẻ `<mesh>` procedural bằng thẻ `<primitive object={...}>` tương ứng mà không làm gián đoạn bất kỳ luồng sản phẩm hay tương tác nào.
3. **Tuân thủ an toàn:** Việc trang trí thêm các bồn cây PBR `planter.glb` đã hoàn thành ở Phase 4 đã chứng minh tính an toàn khi đặt ở $X = \pm 3.35m$, hoàn toàn cách ly khỏi phạm vi raycast chọn sản phẩm của 36 slots.
