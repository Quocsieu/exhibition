import bpy
from pathlib import Path

ENV_DIR = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env")
in_path = ENV_DIR / "building03.glb"
out_path = ENV_DIR / "building03_opt.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(in_path))

# Remove 80m ground
ground = bpy.data.objects.get("Ground")
if ground:
    bpy.data.objects.remove(ground, do_unlink=True)

# Resize textures
for img in bpy.data.images:
    w, h = img.size
    if w > 1024 or h > 1024:
        scale = 1024 / max(w, h)
        new_w = max(16, int(w * scale))
        new_h = max(16, int(h * scale))
        img.scale(new_w, new_h)

bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_image_format='JPEG',
    export_jpeg_quality=85
)
print("building03_opt.glb created successfully!")
