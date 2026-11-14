import bpy
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\roof.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

print(f"Total meshes: {len([o for o in bpy.context.scene.objects if o.type == 'MESH'])}")
for mat in bpy.data.materials:
    print(f"Material: {mat.name}")
for img in bpy.data.images:
    print(f"Image: {img.name} ({img.size[0]}x{img.size[1]})")

# Print first 10 objects
for o in bpy.context.scene.objects[:10]:
    if o.type == 'MESH':
        print(f"Obj: {o.name} | Dim: {[round(c, 3) for c in o.dimensions]} | Loc: {[round(c, 3) for c in o.location]}")
