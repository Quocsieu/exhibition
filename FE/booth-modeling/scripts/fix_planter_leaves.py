import bpy

filepath = r"FE\public\models\env\planter.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=filepath)

for m in bpy.data.materials:
    if "leaves" in m.name.lower():
        print(f"Updating material {m.name} base color to natural green...")
        if m.node_tree and "Principled BSDF" in m.node_tree.nodes:
            bsdf = m.node_tree.nodes["Principled BSDF"]
            # Natural lush botanical green (sRGB ~ #2d6a4f -> linear ~ [0.03, 0.14, 0.07, 1.0])
            bsdf.inputs["Base Color"].default_value = (0.05, 0.22, 0.08, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.65
            bsdf.inputs["Metallic"].default_value = 0.0

bpy.ops.export_scene.gltf(
    filepath=filepath,
    export_format='GLB',
    use_selection=False,
    export_apply=False
)
print("Saved updated planter.glb successfully!")
