"""
Render 3 high-definition preview images of Kinetix Booth v2:
1. Front View (Direct eye-level at z = 3.5m)
2. Three-Quarter / Perspective View (Angled 45 deg, elevated)
3. Isometric / Overview View (High overhead showing roofless circulation)
Outputs saved to brain artifact directory.
"""

import bpy
import math
import os
from pathlib import Path

GLB_PATH = r"E:/Lập trình/MatBaoWS/exhibition/FE/public/models/booths/kinetix-v2/kinetix_booth_v2.glb"
ARTIFACT_DIR = Path(r"C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a")

def setup_render_engine():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        # Sleek exhibition hall studio backdrop
        bg.inputs[0].default_value = (0.07, 0.09, 0.12, 1.0)
        bg.inputs[1].default_value = 1.0

def add_lighting():
    # Key studio sun light
    bpy.ops.object.light_add(type='SUN', location=(8, -8, 12))
    sun = bpy.context.active_object
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.98, 0.95)
    sun.rotation_euler = (math.radians(52), math.radians(12), math.radians(-40))

    # Fill cool rim light
    bpy.ops.object.light_add(type='AREA', location=(-8, 8, 10))
    fill = bpy.context.active_object
    fill.data.energy = 280
    fill.data.size = 12
    fill.data.color = (0.75, 0.85, 1.0)
    fill.rotation_euler = (math.radians(45), math.radians(-25), math.radians(135))

    # Front soft eye-level bounce
    bpy.ops.object.light_add(type='AREA', location=(0, -9, 4))
    bounce = bpy.context.active_object
    bounce.data.energy = 160
    bounce.data.size = 8
    bounce.data.color = (0.9, 0.92, 1.0)
    bounce.rotation_euler = (math.radians(75), 0, 0)

def create_camera(name, loc, rot):
    bpy.ops.object.camera_add(location=loc, rotation=rot)
    cam = bpy.context.active_object
    cam.name = name
    cam.data.lens = 42
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100.0
    return cam

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render_engine()
    add_lighting()

    print(f"Importing {GLB_PATH} ...")
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

    # In Blender coordinate system:
    # Three.js (X, Y_up, Z_forward) -> Blender (X, -Z_forward, Y_up)
    # The front of booth is at Three.js +Z -> Blender -Y.
    # So camera looking at front needs to be at -Y looking towards +Y.

    shots = {
        "kinetix_v2_front.png": {
            # Eye level looking straight into the entrance
            "loc": (0.0, -9.2, 2.2),
            "rot": (math.radians(82), 0, 0)
        },
        "kinetix_v2_perspective.png": {
            # 3/4 angled view showing side shelves, counter and columns
            "loc": (7.8, -8.2, 4.5),
            "rot": (math.radians(68), 0, math.radians(45))
        },
        "kinetix_v2_isometric.png": {
            # High overview demonstrating roofless top-down visibility
            "loc": (8.5, -9.5, 9.2),
            "rot": (math.radians(48), 0, math.radians(42))
        }
    }

    for filename, cfg in shots.items():
        cam = create_camera("RenderCam", cfg["loc"], cfg["rot"])
        bpy.context.scene.camera = cam
        out_path = str(ARTIFACT_DIR / filename)
        bpy.context.scene.render.filepath = out_path
        print(f"Rendering {filename} -> {out_path} ...")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
        print(f"Done rendering {filename}")

if __name__ == '__main__':
    main()
