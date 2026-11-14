"""
Optimization script for 4K environment GLBs:
Imports the 4 user-supplied GLBs from FE/public/models/env/
1. fir_tree_01_4k.glb (980 MB, 7.72M tris, 4K textures) -> fir_tree_01_opt.glb (~200k tris, 1024/2048 textures)
2. shrub_01_4k.glb (75 MB, 282k tris, 4K textures) -> shrub_01_opt.glb (~30k tris, 1024 textures)
3. modular_street_seating_4k.glb (186 MB, 21k tris, 4K textures) -> modular_street_seating_opt.glb (21k tris, 1024/2048 textures)
4. water_manhole_cover_4k.glb (86 MB, 6.3k tris, 4K textures) -> water_manhole_cover_opt.glb (6.3k tris, 1024 textures)

Does NOT overwrite the original _4k.glb files.
"""

import sys
import os
from pathlib import Path
import bpy

ENV_DIR = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'env'

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def optimize_asset(input_name, output_name, decimate_ratio=1.0, max_tex_dim=1024):
    in_path = ENV_DIR / input_name
    out_path = ENV_DIR / output_name
    print(f"\n==========================================")
    print(f"Optimizing: {in_path.name} -> {out_path.name}")
    print(f"Original size: {os.path.getsize(in_path) / (1024*1024):.2f} MB")
    
    reset()
    bpy.ops.import_scene.gltf(filepath=str(in_path))
    
    # 1. Resize images
    for img in bpy.data.images:
        w, h = img.size
        if w > max_tex_dim or h > max_tex_dim:
            scale = max_tex_dim / max(w, h)
            new_w = max(16, int(w * scale))
            new_h = max(16, int(h * scale))
            print(f"  Resizing image '{img.name}' from {w}x{h} to {new_w}x{new_h}")
            img.scale(new_w, new_h)
            
    # 2. Decimate meshes if ratio < 1.0
    total_tris_before = 0
    total_tris_after = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            total_tris_before += tri_count
            if decimate_ratio < 0.99 and tri_count > 1000:
                mod = obj.modifiers.new('Decimate', 'DECIMATE')
                mod.ratio = decimate_ratio
                bpy.context.view_layer.objects.active = obj
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except Exception as e:
                    print(f"  Warning applying decimate on {obj.name}: {e}")
            tri_after = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            total_tris_after += tri_after
            
    print(f"  Triangles: {total_tris_before:,} -> {total_tris_after:,}")
    
    # 3. Export optimized GLB
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_image_format='JPEG' if 'manhole' in output_name else 'AUTO',
        export_jpeg_quality=85
    )
    print(f"  Exported {out_path.name}: {os.path.getsize(out_path) / (1024*1024):.2f} MB")

def main():
    # 1. Manhole cover: 6.3k tris, just scale down 4K textures to 1024
    optimize_asset('water_manhole_cover_4k.glb', 'water_manhole_cover_opt.glb', decimate_ratio=1.0, max_tex_dim=1024)
    
    # 2. Bench: 21k tris, scale down 4K textures to 1024
    optimize_asset('modular_street_seating_4k.glb', 'modular_street_seating_opt.glb', decimate_ratio=1.0, max_tex_dim=1024)
    
    # 3. Shrub: 282k tris -> 30k tris, textures to 1024
    optimize_asset('shrub_01_4k.glb', 'shrub_01_opt.glb', decimate_ratio=0.15, max_tex_dim=1024)
    
    # 4. Fir tree: 7.72M tris -> 250k tris, textures to 1024/2048
    optimize_asset('fir_tree_01_4k.glb', 'fir_tree_01_opt.glb', decimate_ratio=0.035, max_tex_dim=1024)

if __name__ == '__main__':
    main()
