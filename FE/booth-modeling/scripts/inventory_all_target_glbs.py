import bpy
import os
import json
from pathlib import Path
import mathutils

ENV_DIR = Path(r"E:\Lập trình\MatBaoWS\exhibition\FE\public\models\env")

TARGET_FILES = [
    "BlendBuilding.glb",
    "Building01.glb",
    "building03.glb",
    "fir_tree_01_opt.glb",
    "jacaranda_tree_opt.glb",
    "modular_street_seating_opt.glb",
    "shrub_01_opt.glb",
    "trash.glb",
    "water_manhole_cover_opt.glb",
    "roof.glb",
    "planter.glb",
    "Street_Lamp.glb"
]

inventory = []

for filename in TARGET_FILES:
    filepath = ENV_DIR / filename
    print(f"\n==========================================")
    print(f"Inspecting: {filename}")
    if not filepath.exists():
        print(f"  ERROR: File does not exist!")
        inventory.append({
            "filename": filename,
            "exists": False,
            "status": "INVALID"
        })
        continue

    file_size_bytes = filepath.stat().st_size
    file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
    print(f"  Size: {file_size_mb} MB ({file_size_bytes:,} bytes)")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=str(filepath))
    except Exception as e:
        print(f"  ERROR: Failed to parse GLB: {e}")
        inventory.append({
            "filename": filename,
            "exists": True,
            "size_mb": file_size_mb,
            "status": "INVALID",
            "error": str(e)
        })
        continue

    # Inspect objects
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    mesh_count = len(meshes)
    total_tris = 0
    total_verts = 0

    min_c = [float('inf')] * 3
    max_c = [float('-inf')] * 3

    for o in meshes:
        d = o.data
        total_tris += sum(len(p.vertices) - 2 for p in d.polygons)
        total_verts += len(d.vertices)
        for v in o.bound_box:
            world_v = o.matrix_world @ mathutils.Vector(v)
            for i in range(3):
                min_c[i] = min(min_c[i], world_v[i])
                max_c[i] = max(max_c[i], world_v[i])

    has_geometry = mesh_count > 0 and total_tris > 0
    if has_geometry:
        dims = [round(max_c[i] - min_c[i], 3) for i in range(3)]
        min_box = [round(c, 3) for c in min_c]
        max_box = [round(c, 3) for c in max_c]
    else:
        dims = [0, 0, 0]
        min_box = [0, 0, 0]
        max_box = [0, 0, 0]

    # Materials
    materials = [m.name for m in bpy.data.materials]
    images = [(img.name, img.size[0], img.size[1]) for img in bpy.data.images]
    animations = [a.name for a in bpy.data.actions]

    # Objects hierarchy
    root_objects = [o.name for o in bpy.context.scene.objects if o.parent is None]

    print(f"  Meshes: {mesh_count}, Tris: {total_tris:,}, Verts: {total_verts:,}")
    print(f"  Dimensions (X, Y, Z): {dims} meters (Blender Z is UP)")
    print(f"  BBox Min: {min_box}, Max: {max_box}")
    print(f"  Materials ({len(materials)}): {materials}")
    print(f"  Images ({len(images)}): {[(name, f'{w}x{h}') for name, w, h in images[:5]]} ...")
    print(f"  Animations: {animations}")

    inventory.append({
        "filename": filename,
        "exists": True,
        "size_mb": file_size_mb,
        "mesh_count": mesh_count,
        "triangles": total_tris,
        "vertices": total_verts,
        "materials": materials,
        "images": images,
        "dimensions": dims,
        "bbox_min": min_box,
        "bbox_max": max_box,
        "animations": animations,
        "roots": root_objects
    })

out_json = Path(r"E:\Lập trình\MatBaoWS\exhibition\qa-reports\asset_inventory_raw.json")
with open(out_json, "w", encoding="utf-8") as f:
    json.dump(inventory, f, indent=2, ensure_ascii=False)

print(f"\nInventory saved to {out_json}")
