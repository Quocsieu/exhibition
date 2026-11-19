# Hệ Thống Mô Hình Hóa 3D Gian Hàng & Cảnh Quan (Blender 4.2 LTS Pipeline)

Thư mục `FE/booth-modeling/` chứa bộ script Python chạy trên **Blender 4.2 LTS** (chế độ headless `--background`) để sinh và tối ưu hóa các model `.glb` đang hoạt động trong `FE/public/models/`.

---

## 1. Cấu Trúc Thư Mục Hiện Hành

```text
FE/booth-modeling/
├── scripts/
│   ├── generate_five_booths_v3.py        # Sinh 5 gian hàng V3 (Aether, EcoVita, Lumina, Nordic, Solaris — ACTIVE)
│   ├── generate_five_booths_v2.py        # Sinh 5 gian hàng V2 (ROLLBACK)
│   ├── generate_kinetix_v3.py            # Sinh gian hàng V3 Kinetix Robotics (kinetix_booth_v3.glb — ACTIVE)
│   ├── generate_kinetix_v2.py            # Sinh gian hàng V2 Kinetix Robotics (kinetix_booth_v2.glb — ROLLBACK)
│   ├── generate_roofless_frames.py       # Sinh 6 khung gian hàng fallback V1 (booths/roofless-v1/*.glb)
│   ├── generate_vietnamese_female_npc.py # Sinh NPC tư vấn viên nữ 3D Việt Nam + 4 animation (npc/vietnamese_female_assistant.glb)
│   ├── optimize_env_4k_assets.py         # Hạ độ phân giải texture & decimate cho các model 4K
│   ├── optimize_jacaranda.py             # Tối ưu hóa cây phượng tím (jacaranda_tree)
│   ├── decimate_foliage_models.py        # Tinh chỉnh tỷ lệ decimate cho cây thông và bụi hoa
│   └── consolidate_and_export_glbs.py    # Gộp mesh thành single-draw-call (*_joined.glb, *_lod.glb)
└── README.md
```

---

## 2. Đầu Ra Model 3D Trong `FE/public/models/`

1. **6 Gian hàng V3 Chính thức (`ACTIVE`, toàn bộ bản V2 được bảo toàn để rollback):**
   - `FE/public/models/booths/kinetix-v3/kinetix_booth_v3.glb`
   - `FE/public/models/booths/aether-tech-v3/aether_tech_v3.glb`
   - `FE/public/models/booths/nordic-living-v3/nordic_living_v3.glb`
   - `FE/public/models/booths/ecovita-coffee-v3/ecovita_coffee_v3.glb`
   - `FE/public/models/booths/lumina-design-v3/lumina_design_v3.glb`
   - `FE/public/models/booths/solaris-energy-v3/solaris_energy_v3.glb`
2. **6 Gian hàng V1 Không mái (`FALLBACK` khi `isV2 = false`):**
   - `FE/public/models/booths/roofless-v1/{coffee,design,energy,living,robotics,tech}.glb`
3. **12 Model Cảnh quan & Đô thị (`ACTIVE` trong `FE/public/models/env/`):**
   - `fir_tree_01_joined.glb`, `jacaranda_tree_lod.glb`, `shrub_01_joined.glb`, `building03_joined.glb`, `tree-gian.glb`, `planter-near-ch.glb`, `water_manhole_cover_opt.glb`, `trash_opt.glb`, `umbrella.glb`, `bench.glb`, `planter.glb`, `Street_Lamp.glb`.
4. **1 Model NPC Tư vấn viên Nữ 3D Việt Nam (`ACTIVE` trong `FE/public/models/npc/`):**
   - `FE/public/models/npc/vietnamese_female_assistant.glb` (nhúng sẵn 4 clip animation: `IDLE`, `WAVE`, `TALKING`, `PRESENT`, dùng chung cho 6 gian hàng).

---

## 3. Hướng Dẫn Chạy Lại Script Bằng Blender Headless

> **Lưu ý:** Toàn bộ các file `.glb` thành phẩm đã được commit sẵn trong `FE/public/models/`. Thành viên nhóm **không cần** cài đặt Blender để chạy, build hay kiểm thử ứng dụng web. Chỉ chạy các lệnh dưới đây khi muốn thiết kế lại hình học 3D.

```powershell
# 1. Sinh lại 5 gian hàng V2
blender --background --python "FE/booth-modeling/scripts/generate_five_booths_v2.py"

# 2. Sinh lại gian hàng V3 Kinetix Robotics (hoặc generate_kinetix_v2.py nếu cần bản V2)
blender --background --python "FE/booth-modeling/scripts/generate_kinetix_v3.py"

# 3. Sinh lại 6 khung gian hàng fallback V1
blender --background --python "FE/booth-modeling/scripts/generate_roofless_frames.py"

# 4. Sinh lại NPC Tư vấn viên Nữ 3D Việt Nam + 4 animation
blender --background --python "FE/booth-modeling/scripts/generate_vietnamese_female_npc.py"
```
