import bpy
import os

env_dir = r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env"
filepath = os.path.join(env_dir, "bench.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=filepath)
bench = bpy.context.scene.objects.get('Bench')

print(f"Bench Name: {bench.name}")
print(f"Location: {bench.location}")
print(f"Rotation: {bench.rotation_euler}")
print(f"Scale: {bench.scale}")
print(f"Dimensions: {bench.dimensions}")
min_z = min((bench.matrix_world @ v.co).z for v in bench.data.vertices)
max_z = max((bench.matrix_world @ v.co).z for v in bench.data.vertices)
min_y = min((bench.matrix_world @ v.co).y for v in bench.data.vertices)
max_y = max((bench.matrix_world @ v.co).y for v in bench.data.vertices)
min_x = min((bench.matrix_world @ v.co).x for v in bench.data.vertices)
max_x = max((bench.matrix_world @ v.co).x for v in bench.data.vertices)
print(f"World Z Range (Height): [{min_z:.4f}, {max_z:.4f}]")
print(f"World Y Range (Depth): [{min_y:.4f}, {max_y:.4f}]")
print(f"World X Range (Width): [{min_x:.4f}, {max_x:.4f}]")

for s in bench.material_slots:
    if s.material:
        mat = s.material
        print(f"Material: {mat.name}")
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE':
                print(f"  Texture: {node.image.name if node.image else 'None'}")
