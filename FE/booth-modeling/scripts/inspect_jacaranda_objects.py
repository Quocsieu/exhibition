import bpy, os, sys
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\jacaranda_tree_4k.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        poly_count = len(obj.data.polygons)
        tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        bb = [round(c, 2) for c in obj.dimensions]
        loc = [round(c, 2) for c in obj.location]
        print(f"Obj: '{obj.name}' | Parent: {obj.parent.name if obj.parent else None} | Location: {loc} | Dim: {bb} | Tris: {tri_count:,}")
