# Hệ Thống Thiết Kế Gian Hàng 3D Triển Lãm (Sand3D + Blender)

Hệ thống mô hình hóa thủ tục (Procedural 3D Modeling Pipeline) sử dụng **Sand3D** kết hợp **Blender 4.2 LTS** tự động tạo ra 6 gian hàng triển lãm theo phong cách kiến trúc **High-quality Classic Stylized Realistic Exhibition Pavilion**.

---

## 1. Cấu Trúc Thư Mục

```text
FE/booth-modeling/
├── metadata/
│   └── booths.json             # Dữ liệu phân tích kỹ thuật chi tiết của 6 gian hàng
├── previews/                   # 18 ảnh render chất lượng cao (3 góc/gian hàng)
│   ├── booth_01_front.png, booth_01_isometric.png, booth_01_interior.png
│   ├── booth_02_front.png, booth_02_isometric.png, booth_02_interior.png
│   ├── booth_03_front.png, booth_03_isometric.png, booth_03_interior.png
│   ├── booth_04_front.png, booth_04_isometric.png, booth_04_interior.png
│   ├── booth_05_front.png, booth_05_isometric.png, booth_05_interior.png
│   └── booth_06_front.png, booth_06_isometric.png, booth_06_interior.png
├── sand3d-repo/                # Mã nguồn thư viện Sand3D DSL
├── scripts/
│   ├── generate_booths.py      # Script chính tạo hình 6 gian hàng bằng Sand3D
│   ├── render_previews.py      # Script tự động render 18 ảnh preview bằng Blender EEVEE
│   └── validate_models.py      # Script kiểm định mesh, vật liệu, polycount và CompanySignSurface
└── tools/
    └── blender-4.2.16-windows-x64/ # Blender 4.2 LTS Portable

FE/public/models/booths/        # Thư mục đích chứa các file GLB sẵn sàng cho R3F
├── booth_01.glb                # Classic Timber Pavilion
├── booth_02.glb                # European Stone Arcade
├── booth_03.glb                # Mediterranean Pavilion
├── booth_04.glb                # Victorian Glass Pavilion
├── booth_05.glb                # Traditional Courtyard Pavilion
└── booth_06.glb                # Octagonal Heritage Pavilion
```

---

## 2. Đặc Tả Kiến Trúc 6 Gian Hàng

| Gian Hàng | Chủ Đề Kiến Trúc | Đặc Điểm Kết Cấu | Vật Liệu Chủ Đạo |
| :--- | :--- | :--- | :--- |
| **Booth 01** | Classic Timber Pavilion | Hệ khung gỗ sồi/óc chó tự nhiên, 6 cột gỗ chạm khắc chân đá hoa cương, vì kèo lộ thiên, mái dốc ván gỗ, lan can tiện song gỗ. | Gỗ sồi (`oak`), gỗ óc chó (`walnut`), đá (`marble`), đồng thau (`brass`). |
| **Booth 02** | European Stone Arcade | Kiến trúc vòm đá cổ điển Châu Âu (Romanesque / Classical Tuscan), 6 cột trụ tròn với đầu và chân cột chỉ nổi, vòm tam cung, trán tường cổ điển và mái ngói đất nung. | Đá cẩm thạch trắng (`marble`), sa thạch / bê tông hoàn thiện mịn (`concrete`), ngói gốm sứ (`ceramic`). |
| **Booth 03** | Mediterranean Pavilion | Biệt thự ven biển Địa Trung Hải, tường vữa stucco trắng kem, các ô vòm thoáng đãng, vì kèo gỗ tuyết tùng nhô ra mép mái, mái ngói máng âm dương terracotta đỏ ấm và bồn cây cảnh viền lan can. | Vữa stucco (`concrete`), ngói đất nung (`ceramic`), gỗ sồi (`oak`), cây lá (`fabric`). |
| **Booth 04** | Victorian Glass Pavilion | Nhà kính bảo tồn phong cách Victoria (Victorian Conservatory / Orangery), hệ khung sắt đúc uốn lượn tinh tế màu đen kim loại, mái vòm kính lấy sáng, tháp thông gió trên đỉnh mái và chân tường gạch/đá sẫm màu. | Kim loại sơn đen (`painted_metal`), kính trong suốt (`glass`), đồng thau (`brass`), đá cẩm thạch nền (`marble`). |
| **Booth 05** | Traditional Courtyard Pavilion | Lầu các đình viện truyền thống Á Đông, cột sơn son thếp vàng, cụm đấu củng (dougong) đỡ mái hiên vươn xa, các đầu đao cong vút duyên dáng, vách bình phong khắc hoa văn chữ Vạn. | Sơn mài bóng (`glossy_plastic`), ngói tráng men đen/than (`ceramic`), gỗ sồi (`oak`), đồng vàng kim (`brass`). |
| **Booth 06** | Octagonal Heritage Pavilion | Đình vọng cảnh bát giác (Octagonal Gazebo/Rotunda), 8 cột trụ hoa cương bố trí đối xứng hướng tâm, mái chóp 8 cạnh vuốt nhọn bọc đồng xanh cổ (verdigris patina) đỉnh chóp có búp sen / hồ lô đồng. | Đồng oxy hóa (`copper`), đá hoa cương (`marble`), đồng thau vàng (`brass`), gỗ tiện lan can (`oak`). |

---

## 3. Quy Chuẩn Kỹ Thuật (Specification Conformance)

- **Bounding Box Envelope:**
  - Chiều rộng: 5.2m – 5.6m (chuẩn không gian 4.8m – 5.4m).
  - Chiều sâu: 4.2m – 4.9m (chuẩn không gian 3.8m – 4.4m).
  - Chiều cao: 4.2m – 5.3m (chuẩn không gian 3.5m – 4.6m).
- **Mặt Bảng Hiệu Doanh Nghiệp (`CompanySignSurface`):**
  - Tất cả 6 mô hình đều có một mesh phẳng chuyên dụng mang tên chính xác: `CompanySignSurface`.
  - Vị trí: Mặt trước gian hàng (trục Z trong GLTF, tương ứng -Y trong Blender), cao độ Y ~ 3.2m - 3.4m, kích thước chuẩn ~3.6m x 0.65m.
  - Hoàn toàn không bị mái, cột hay xà che khuất tầm nhìn của khách tham quan, sẵn sàng nhận texture động từ React Three Fiber (`createBoothSignTexture`).
- **Tối Ưu Hóa WebGL:**
  - Dung lượng mỗi file: **57 KB – 135 KB** (vô cùng nhẹ, tải ngay lập tức trên cả mạng di động 4G).
  - Triangle count: **576 – 4,068 tris** (đảm bảo giữ vững 60 FPS khi render đồng thời 6 gian hàng trên mọi thiết bị).

---

## 4. Hướng Dẫn Tái Tạo & Mở Rộng

### 4.1. Chạy sinh mô hình:
```bash
& "FE/booth-modeling/tools/blender-4.2.16-windows-x64/blender.exe" --background --python "FE/booth-modeling/scripts/generate_booths.py"
```

### 4.2. Kiểm tra chất lượng & xuất Metadata:
```bash
& "FE/booth-modeling/tools/blender-4.2.16-windows-x64/blender.exe" --background --python "FE/booth-modeling/scripts/validate_models.py"
```

### 4.3. Render lại 18 ảnh preview:
```bash
& "FE/booth-modeling/tools/blender-4.2.16-windows-x64/blender.exe" --background --python "FE/booth-modeling/scripts/render_previews.py"
```
