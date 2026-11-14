import bpy
import os

env_dir = r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env"

def join_all_meshes(export_name, decimate_ratio=None):
    # Ensure all transforms are applied before joining
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        print(f"No meshes found for {export_name}")
        return
    
    # Make active
    bpy.context.view_layer.objects.active = meshes[0]
    for m in meshes:
        m.select_set(True)
    
    bpy.ops.object.join()
    active_obj = bpy.context.view_layer.objects.active
    active_obj.name = "ConsolidatedMesh"
    
    if decimate_ratio and decimate_ratio < 1.0:
        mod = active_obj.modifiers.new(name="Decimate", type='DECIMATE')
        mod.ratio = decimate_ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print(f"Applied decimate ratio {decimate_ratio} to {export_name}")
        
    out_path = os.path.join(env_dir, export_name)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True
    )
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    poly_count = sum(len(p.vertices) - 2 for p in active_obj.data.polygons)
    print(f"EXPORTED: {export_name:30} | {size_mb:6.2f} MB | 1 mesh | {poly_count:8} tris")

# 1. Building01_opt -> Building01_joined
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "Building01_opt.glb"))
join_all_meshes("Building01_joined.glb")

# 2. building03_opt -> building03_joined
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "building03_opt.glb"))
join_all_meshes("building03_joined.glb")

# 3. fir_tree_01_opt -> fir_tree_01_joined
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "fir_tree_01_opt.glb"))
join_all_meshes("fir_tree_01_joined.glb")

# 4. shrub_01_opt -> shrub_01_joined
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "shrub_01_opt.glb"))
join_all_meshes("shrub_01_joined.glb")

# 5. modular_street_seating_opt -> modular_street_seating_joined
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "modular_street_seating_opt.glb"))
# Seating has 21k tris, join meshes and decimate gently to 12k tris
join_all_meshes("modular_street_seating_joined.glb", decimate_ratio=0.55)

# 6. jacaranda_tree_opt -> jacaranda_tree_lod
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(env_dir, "jacaranda_tree_opt.glb"))
# Jacaranda has 83k tris per tree, decimate gently to 0.4 (33k tris)
join_all_meshes("jacaranda_tree_lod.glb", decimate_ratio=0.40)
