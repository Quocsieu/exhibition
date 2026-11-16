import bpy
import os
from pathlib import Path

ENV_DIR = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env")

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Optimize trash.glb -> trash_opt.glb
def opt_trash():
    in_path = ENV_DIR / "trash.glb"
    out_path = ENV_DIR / "trash_opt.glb"
    print("\n--- Optimizing trash.glb ---")
    reset()
    bpy.ops.import_scene.gltf(filepath=str(in_path))
    
    # Decimate each mesh
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            if tri_count > 1000:
                mod = obj.modifiers.new("Decimate", "DECIMATE")
                mod.ratio = 0.005 # from 2.14M down to ~10k
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=mod.name)
    
    # Join into single object
    bpy.ops.object.select_all(action='SELECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = "trash_bin"
        
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"trash_opt.glb created: {os.path.getsize(out_path)/(1024*1024):.2f} MB")

# 2. Optimize roof.glb -> roof_opt.glb
def opt_roof():
    in_path = ENV_DIR / "roof.glb"
    out_path = ENV_DIR / "roof_opt.glb"
    print("\n--- Optimizing roof.glb ---")
    reset()
    bpy.ops.import_scene.gltf(filepath=str(in_path))
    
    # Join 1030 meshes into 1 single mesh
    bpy.ops.object.select_all(action='SELECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = "roof_ground_slab"
        
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"roof_opt.glb created: {os.path.getsize(out_path)/(1024*1024):.2f} MB")

# 3. Optimize Building01.glb -> Building01_opt.glb
def opt_building01():
    in_path = ENV_DIR / "Building01.glb"
    out_path = ENV_DIR / "Building01_opt.glb"
    print("\n--- Optimizing Building01.glb ---")
    reset()
    bpy.ops.import_scene.gltf(filepath=str(in_path))
    
    # Remove the 9387m huge plane
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            if max(obj.dimensions) > 500:
                print(f"  Removing giant plane: {obj.name} with dim {obj.dimensions}")
                bpy.data.objects.remove(obj, do_unlink=True)
                
    # Resize textures to max 1024
    for img in bpy.data.images:
        w, h = img.size
        if w > 1024 or h > 1024:
            scale = 1024 / max(w, h)
            new_w = max(16, int(w * scale))
            new_h = max(16, int(h * scale))
            print(f"  Resizing image {img.name} ({w}x{h}) -> ({new_w}x{new_h})")
            img.scale(new_w, new_h)
            
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_image_format='JPEG',
        export_jpeg_quality=80
    )
    print(f"Building01_opt.glb created: {os.path.getsize(out_path)/(1024*1024):.2f} MB")

opt_trash()
opt_roof()
opt_building01()
