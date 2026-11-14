import bpy
from pathlib import Path
import mathutils

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\jacaranda_tree_4k.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

for name in ['jacaranda_tree_LOD1', 'jacaranda_tree_trunk_LOD0']:
    obj = bpy.data.objects.get(name)
    if obj:
        min_z = min((obj.matrix_world @ mathutils.Vector(v))[2] for v in obj.bound_box)
        max_z = max((obj.matrix_world @ mathutils.Vector(v))[2] for v in obj.bound_box)
        min_x = min((obj.matrix_world @ mathutils.Vector(v))[0] for v in obj.bound_box)
        max_x = max((obj.matrix_world @ mathutils.Vector(v))[0] for v in obj.bound_box)
        min_y = min((obj.matrix_world @ mathutils.Vector(v))[1] for v in obj.bound_box)
        max_y = max((obj.matrix_world @ mathutils.Vector(v))[1] for v in obj.bound_box)
        print(f"{name}:")
        print(f"  X: [{min_x:.3f}, {max_x:.3f}] (width: {max_x - min_x:.3f})")
        print(f"  Y: [{min_y:.3f}, {max_y:.3f}] (depth: {max_y - min_y:.3f})")
        print(f"  Z: [{min_z:.3f}, {max_z:.3f}] (height: {max_z - min_z:.3f})")
