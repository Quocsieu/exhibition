import bpy
import os

env_dir = r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env"
files = [
    "Building01_joined.glb",
    "building03_joined.glb",
    "fir_tree_01_joined.glb",
    "modular_street_seating_joined.glb",
    "shrub_01_joined.glb",
    "jacaranda_tree_lod.glb"
]

for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, f))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
    print(f"VERIFIED: {f:32} | {len(meshes)} mesh(es) | {tris} tris")
