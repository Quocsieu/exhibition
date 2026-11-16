# Hệ Thống Mô Hình Hóa 3D Gian Hàng & Cảnh Quan (Blender 4.2 LTS Pipeline)

Thư mục `FE/booth-modeling/` chứa bộ script Python chạy trên **Blender 4.2 LTS** (chế độ headless `--background`) để sinh và tối ưu hóa các model `.glb` đang hoạt động trong `FE/public/models/`.

---

## 1. Cấu Trúc Thư Mục Hiện Hành

```text
FE/booth-modeling/
├── scripts/
│   ├── generate_five_booths_v2.py        # Sinh 5 gian hàng V2 (Aether, Nordic, EcoVita, Lumina, Solaris)
│   ├── generate_kinetix_v2.py            # Sinh gian hàng V2 Kinetix Robotics (kinetix_booth_v2.glb)
│   ├── generate_roofless_frames.py       # Sinh 6 khung gian hàng fallback V1 (booths/roofless-v1/*.glb)
│   ├── optimize_env_4k_assets.py         # Hạ độ phân giải texture & decimate cho các model 4K
│   ├── optimize_jacaranda.py             # Tối ưu hóa cây phượng tím (jacaranda_tree)
│   ├── optimize_building03.py            # Tối ưu hóa tòa nhà ngoại vi (building03)
│   ├── optimize_street_props.py          # Tối ưu hóa đạo cụ đường phố (trash_opt.glb, v.v.)
│   ├── decimate_foliage_models.py        # Tinh chỉnh tỷ lệ decimate cho cây thông và bụi hoa
│   ├── consolidate_and_export_glbs.py    # Gộp mesh thành single-draw-call (*_joined.glb, *_lod.glb)
│   ├── fix_planter_leaves.py             # Chuẩn hóa vật liệu PBR cho lá chậu cây (planter.glb)
│   └── verify_joined_glbs.py             # Kiểm tra số lượng mesh và triangle của các model đã gộp
└── README.md
```

---

## 2. Đầu Ra Model 3D Trong `FE/public/models/`

1. **6 Gian hàng V2 Chính thức (`ACTIVE`):**
   - `FE/public/models/booths/kinetix-v2/kinetix_booth_v2.glb`
   - `FE/public/models/booths/v2/aether_tech_v2.glb`
   - `FE/public/models/booths/v2/nordic_living_v2.glb`
   - `FE/public/models/booths/v2/ecovita_coffee_v2.glb`
   - `FE/public/models/booths/v2/lumina_design_v2.glb`
   - `FE/public/models/booths/v2/solaris_energy_v2.glb`
2. **6 Gian hàng V1 Không mái (`FALLBACK` khi `isV2 = false`):**
   - `FE/public/models/booths/roofless-v1/{coffee,design,energy,living,robotics,tech}.glb`
3. **12 Model Cảnh quan & Đô thị (`ACTIVE` trong `FE/public/models/env/`):**
   - `fir_tree_01_joined.glb`, `jacaranda_tree_lod.glb`, `shrub_01_joined.glb`, `building03_joined.glb`, `tree-gian.glb`, `planter-near-ch.glb`, `water_manhole_cover_opt.glb`, `trash_opt.glb`, `umbrella.glb`, `bench.glb`, `planter.glb`, `Street_Lamp.glb`.

---

## 3. Hướng Dẫn Chạy Lại Script Bằng Blender Headless

> **Lưu ý:** Toàn bộ các file `.glb` thành phẩm đã được commit sẵn trong `FE/public/models/`. Thành viên nhóm **không cần** cài đặt Blender để chạy, build hay kiểm thử ứng dụng web. Chỉ chạy các lệnh dưới đây khi muốn thiết kế lại hình học 3D.

```powershell
# 1. Sinh lại 5 gian hàng V2
blender --background --python "FE/booth-modeling/scripts/generate_five_booths_v2.py"

# 2. Sinh lại gian hàng V2 Kinetix Robotics
blender --background --python "FE/booth-modeling/scripts/generate_kinetix_v2.py"

# 3. Sinh lại 6 khung gian hàng fallback V1
blender --background --python "FE/booth-modeling/scripts/generate_roofless_frames.py"
```
