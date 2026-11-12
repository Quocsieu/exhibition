"""
Blender Headless Preview Renderer
Renders 3 distinct camera angles for each of the 6 booths:
- front
- isometric
- interior
Outputs to FE/booth-modeling/previews/booth_0X_<angle>.png (18 images total)
"""

import os
import sys
import math
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
MODELS_DIR = ROOT_DIR / "public" / "models" / "booths"
PREVIEWS_DIR = SCRIPT_DIR.parent / "previews"
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

import bpy

def setup_render_settings():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False

    # Set background color
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.92, 0.94, 0.96, 1.0) # Soft daylight sky
        bg.inputs[1].default_value = 1.0

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render_settings()

def add_lighting():
    # Sun light
    bpy.ops.object.light_add(type='SUN', location=(10, -10, 15))
    sun = bpy.context.active_object
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(-35))

    # Soft ambient fill
    bpy.ops.object.light_add(type='AREA', location=(-6, 6, 8))
    area = bpy.context.active_object
    area.data.energy = 150
    area.data.size = 10
    area.rotation_euler = (math.radians(45), math.radians(-30), math.radians(120))

def create_camera(name, loc, rot):
    bpy.ops.object.camera_add(location=loc, rotation=rot)
    cam = bpy.context.active_object
    cam.name = name
    cam.data.lens = 45 # 45mm standard perspective
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100.0
    return cam

def render_booth(booth_id, glb_path):
    clear_scene()
    add_lighting()

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    # Define camera angles (Remember in Blender: -Y is front, +Z is up, +X is right)
    cameras = {
        "front": {
            "loc": (0.0, -7.5, 2.6),
            "rot": (math.radians(82), 0, 0),
        },
        "isometric": {
            "loc": (-6.8, -6.8, 5.8),
            "rot": (math.radians(64), 0, math.radians(-45)),
        },
        "interior": {
            "loc": (0.0, -1.2, 1.5),
            "rot": (math.radians(85), 0, 0),
        }
    }

    for angle_name, cfg in cameras.items():
        cam = create_camera(f"Cam_{angle_name}", cfg["loc"], cfg["rot"])
        bpy.context.scene.camera = cam
        out_file = PREVIEWS_DIR / f"{booth_id}_{angle_name}.png"
        bpy.context.scene.render.filepath = str(out_file)
        bpy.ops.render.render(write_still=True)
        print(f"Rendered: {out_file.name}")
        bpy.data.objects.remove(cam, do_unlink=True)

def main():
    print("==================================================")
    print("STARTING BLENDER PREVIEW RENDERER")
    print("==================================================")
    setup_render_settings()
    for i in range(1, 7):
        booth_id = f"booth_{i:02d}"
        glb_path = MODELS_DIR / f"{booth_id}.glb"
        if not glb_path.exists():
            print(f"Skipping {booth_id}, file not found: {glb_path}")
            continue
        print(f"\n--- Rendering {booth_id} ---")
        render_booth(booth_id, glb_path)
    print("\nAll previews rendered successfully.")

if __name__ == "__main__":
    main()
