import bpy
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\jacaranda_tree_4k.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

for obj in bpy.context.scene.objects:
    print(f"Name: {obj.name:<32} | Visible: {not obj.hide_viewport} | Render: {not obj.hide_render} | Type: {obj.type}")
