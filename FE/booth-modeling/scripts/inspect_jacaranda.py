import bpy, os, sys
from pathlib import Path
import mathutils

path = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env\jacaranda_tree_4k.glb")
print(f"File exists: {path.exists()}")
print(f"Size: {path.stat().st_size / (1024*1024):.2f} MB")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))

total_tris = 0
total_verts = 0
min_c = [float('inf')]*3
max_c = [float('-inf')]*3

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        d = obj.data
        total_tris += sum(len(p.vertices) - 2 for p in d.polygons)
        total_verts += len(d.vertices)
        for v in obj.bound_box:
            world_v = obj.matrix_world @ mathutils.Vector(v)
            for i in range(3):
                min_c[i] = min(min_c[i], world_v[i])
                max_c[i] = max(max_c[i], world_v[i])

print(f"Total Meshes: {len([o for o in bpy.context.scene.objects if o.type == 'MESH'])}")
print(f"Total Triangles: {total_tris:,}")
print(f"Total Vertices: {total_verts:,}")
dims = [max_c[i] - min_c[i] for i in range(3)]
print(f"Bounding Box: Min={[round(c, 3) for c in min_c]}, Max={[round(c, 3) for c in max_c]}")
print(f"Dimensions: X={dims[0]:.2f}m, Y={dims[1]:.2f}m, Z={dims[2]:.2f}m")

print(f"Images count: {len(bpy.data.images)}")
for img in bpy.data.images:
    print(f"  Image: {img.name} ({img.size[0]}x{img.size[1]})")

print(f"Materials count: {len(bpy.data.materials)}")
for mat in bpy.data.materials:
    print(f"  Material: {mat.name}")
