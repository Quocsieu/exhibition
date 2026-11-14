import sys
import os
from pathlib import Path
import bpy

ENV_DIR = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'env'

def decimate_glb(filename, target_ratio):
    path = ENV_DIR / filename
    print(f"Decimating {path.name} by {target_ratio}...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    
    total_before = 0
    total_after = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            tri_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            total_before += tri_count
            if tri_count > 200:
                mod = obj.modifiers.new('Decimate', 'DECIMATE')
                mod.ratio = target_ratio
                bpy.context.view_layer.objects.active = obj
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except Exception as e:
                    pass
            total_after += sum(len(p.vertices) - 2 for p in obj.data.polygons)
            
    print(f"  {path.name}: {total_before:,} -> {total_after:,} triangles")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"  Saved {path.name}: {os.path.getsize(path)/(1024*1024):.2f} MB")

def main():
    # fir_tree_01_opt: 300k -> ~35k
    decimate_glb('fir_tree_01_opt.glb', 0.12)
    # shrub_01_opt: 47k -> ~12k
    decimate_glb('shrub_01_opt.glb', 0.25)

if __name__ == '__main__':
    main()
