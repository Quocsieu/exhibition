import bpy
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\building03.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        print(f"Obj: '{obj.name}' | Dim: {[round(c, 2) for c in obj.dimensions]} | Loc: {[round(c, 2) for c in obj.location]}")
