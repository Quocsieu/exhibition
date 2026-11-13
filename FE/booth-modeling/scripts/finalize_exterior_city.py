"""Create compact runtime meshes from v2 artwork. Never overwrite assets."""
from pathlib import Path
import bpy
DEST=Path(__file__).resolve().parents[2]/'public'/'models'/'exterior'
for i in range(1,5):
    for suffix in ['', '-lod']:
        if (DEST/f'city_runtime_0{i}{suffix}.glb').exists():
            raise RuntimeError('Refusing overwrite')
for i in range(1,5):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(DEST/f'city_detail_v2_0{i}.glb'))
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.object.join()
    obj=bpy.context.object
    for ratio,suffix in [(.35,''),(.4,'-lod')]:
        mod=obj.modifiers.new('Runtime simplification','DECIMATE')
        mod.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.validate()
        bpy.ops.export_scene.gltf(filepath=str(DEST/f'city_runtime_0{i}{suffix}.glb'),export_format='GLB',export_copyright='Project-authored architecture; refine_exterior_city.py + finalize_exterior_city.py; simplified runtime mesh.')
