import bpy
import mathutils
from pathlib import Path

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\Building01.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

print(f"Total objects: {len(bpy.context.scene.objects)}")
huge_objects = []
normal_objects = []

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        dims = obj.dimensions
        max_dim = max(dims)
        tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if max_dim > 100:
            huge_objects.append((obj.name, [round(c, 2) for c in dims], tri_count))
        else:
            normal_objects.append((obj.name, [round(c, 2) for c in dims], tri_count))

print(f"Huge objects (>100m): {len(huge_objects)}")
for name, d, tc in huge_objects[:10]:
    print(f"  {name}: dim={d}, tris={tc}")

print(f"Normal objects (<=100m): {len(normal_objects)}")
min_c = [float('inf')]*3
max_c = [float('-inf')]*3
for name, d, tc in normal_objects:
    obj = bpy.data.objects.get(name)
    for v in obj.bound_box:
        world_v = obj.matrix_world @ mathutils.Vector(v)
        for i in range(3):
            min_c[i] = min(min_c[i], world_v[i])
            max_c[i] = max(max_c[i], world_v[i])

print(f"Building Bounding Box (without huge planes):")
print(f"  Min: {[round(c, 2) for c in min_c]}")
print(f"  Max: {[round(c, 2) for c in max_c]}")
print(f"  Dims: {[round(max_c[i] - min_c[i], 2) for i in range(3)]}")
