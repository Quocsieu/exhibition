import bpy
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\jacaranda_tree_4k.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

for name in ['jacaranda_tree_LOD0', 'jacaranda_tree_LOD1', 'jacaranda_tree_trunk_LOD0', 'jacaranda_tree_geometry_nodes']:
    obj = bpy.data.objects.get(name)
    if obj:
        mats = [slot.material.name if slot.material else 'None' for slot in obj.material_slots]
        print(f"Object: {name}")
        print(f"  Materials: {mats}")
        print(f"  Dimensions: {[round(c, 2) for c in obj.dimensions]}")
        print(f"  Location: {[round(c, 2) for c in obj.location]}")
