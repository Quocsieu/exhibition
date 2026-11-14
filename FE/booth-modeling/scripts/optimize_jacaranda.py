import bpy
import os
from pathlib import Path

ENV_DIR = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env")
in_path = ENV_DIR / "jacaranda_tree_4k.glb"
out_path = ENV_DIR / "jacaranda_tree_opt.glb"

print(f"Reading: {in_path}")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(in_path))

# 1. Resize images to 1024x1024
max_tex_dim = 1024
for img in bpy.data.images:
    w, h = img.size
    if w > max_tex_dim or h > max_tex_dim:
        scale = max_tex_dim / max(w, h)
        new_w = max(16, int(w * scale))
        new_h = max(16, int(h * scale))
        print(f"Resizing image {img.name} from {w}x{h} to {new_w}x{new_h}")
        img.scale(new_w, new_h)

# 2. We keep ONLY jacaranda_tree_LOD1 as the main tree object, delete all other objects
keep_name = "jacaranda_tree_LOD1"
for obj in list(bpy.context.scene.objects):
    if obj.name != keep_name:
        bpy.data.objects.remove(obj, do_unlink=True)

tree_obj = bpy.data.objects.get(keep_name)
if not tree_obj:
    raise RuntimeError(f"Could not find {keep_name}")

tree_obj.name = "jacaranda_tree"
bpy.context.view_layer.objects.active = tree_obj
tree_obj.select_set(True)

# 3. Decimate to ~75k triangles
tris_before = sum(len(p.vertices) - 2 for p in tree_obj.data.polygons)
print(f"Triangles before decimate: {tris_before:,}")
mod = tree_obj.modifiers.new("Decimate", "DECIMATE")
mod.ratio = 0.045 # ~80k triangles
bpy.ops.object.modifier_apply(modifier=mod.name)
tris_after = sum(len(p.vertices) - 2 for p in tree_obj.data.polygons)
print(f"Triangles after decimate: {tris_after:,}")

# 4. Export clean optimized GLB
print(f"Exporting to: {out_path}")
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_image_format='AUTO'
)

print(f"Export finished! Output size: {os.path.getsize(out_path)/(1024*1024):.2f} MB")
