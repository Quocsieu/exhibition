import bpy
import os

env_dir = r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env"
files = [
    "bench.glb",
    "planter.glb",
    "Street_Lamp.glb",
    "jacaranda_tree_lod.glb",
    "fir_tree_01_joined.glb",
    "shrub_01_joined.glb"
]

print("=== DEEP ASSET AUDIT FOR VISUAL FIXES ===")
for f in files:
    filepath = os.path.join(env_dir, f)
    if not os.path.exists(filepath):
        print(f"NOT FOUND: {f}")
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    print(f"\n--- {f} --- ({os.path.getsize(filepath)/1024:.1f} KB)")
    for m in meshes:
        bbox = [m.dimensions.x, m.dimensions.y, m.dimensions.z]
        poly = sum(len(p.vertices) - 2 for p in m.data.polygons)
        print(f"  Mesh: '{m.name}' | Dim: {[round(x, 3) for x in bbox]} | Tris: {poly}")
        for s in m.material_slots:
            if s.material:
                mat = s.material
                bc = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
                base_col = list(bc.inputs['Base Color'].default_value)[:3] if bc and 'Base Color' in bc.inputs and not bc.inputs['Base Color'].is_linked else 'Texture-Linked'
                print(f"    Mat: '{mat.name}' | BaseColor: {base_col}")
