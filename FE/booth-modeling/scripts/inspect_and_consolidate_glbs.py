import bpy
import os

env_dir = r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env"

files_to_check = [
    "Building01_opt.glb",
    "building03_opt.glb",
    "fir_tree_01_opt.glb",
    "shrub_01_opt.glb",
    "modular_street_seating_opt.glb",
    "jacaranda_tree_opt.glb",
    "Street_Lamp.glb",
    "planter.glb",
    "trash_opt.glb",
    "roof_opt.glb"
]

print("=== INSPECTING GLB MESH STRUCTURES ===")
for filename in files_to_check:
    filepath = os.path.join(env_dir, filename)
    if not os.path.exists(filepath):
        print(f"MISSING: {filename}")
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    mats = set()
    total_tris = 0
    for m in meshes:
        total_tris += sum(len(p.vertices) - 2 for p in m.data.polygons)
        for s in m.material_slots:
            if s.material:
                mats.add(s.material.name)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"{filename:30} | {size_mb:6.2f} MB | {len(meshes):4} meshes | {len(mats):3} mats | {total_tris:8} tris")
