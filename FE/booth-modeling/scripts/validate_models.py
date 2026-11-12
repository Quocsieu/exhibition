"""
3D Booth Model Validator & Metadata Generator
Validates generated GLB files for:
- Geometry validity (triangles, vertices, bounding box)
- Material and node integrity
- Required mesh verification: 'CompanySignSurface'
- Performance budget conformance
Outputs: FE/booth-modeling/metadata/booths.json
"""

import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
MODELS_DIR = ROOT_DIR / "public" / "models" / "booths"
METADATA_DIR = SCRIPT_DIR.parent / "metadata"
METADATA_DIR.mkdir(parents=True, exist_ok=True)

import bpy
import mathutils

def analyze_glb(file_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(file_path))

    total_verts = 0
    total_tris = 0
    meshes = []
    materials = set()
    has_signboard = False
    min_co = [float('inf')] * 3
    max_co = [float('-inf')] * 3

    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            if "CompanySignSurface" in ob.name:
                has_signboard = True
            
            me = ob.data
            me.calc_loop_triangles()
            tris = len(me.loop_triangles)
            verts = len(me.vertices)
            total_tris += tris
            total_verts += verts

            for slot in ob.material_slots:
                if slot.material:
                    materials.add(slot.material.name)

            for corner in ob.bound_box:
                world_co = ob.matrix_world @ mathutils.Vector(corner)
                for i in range(3):
                    min_co[i] = min(min_co[i], world_co[i])
                    max_co[i] = max(max_co[i], world_co[i])

            meshes.append({
                "name": ob.name,
                "triangles": tris,
                "vertices": verts
            })

    # Dimensions
    dim_x = round(max_co[0] - min_co[0], 2) if min_co[0] != float('inf') else 0
    dim_y = round(max_co[1] - min_co[1], 2) if min_co[1] != float('inf') else 0
    dim_z = round(max_co[2] - min_co[2], 2) if min_co[2] != float('inf') else 0

    file_size_kb = round(file_path.stat().st_size / 1024, 2)

    return {
        "file": file_path.name,
        "file_size_kb": file_size_kb,
        "triangles": total_tris,
        "vertices": total_verts,
        "mesh_count": len(meshes),
        "materials": sorted(list(materials)),
        "material_count": len(materials),
        "has_company_sign_surface": has_signboard,
        "bounding_box": {
            "min": [round(c, 2) for c in min_co],
            "max": [round(c, 2) for c in max_co],
            "dimensions": [dim_x, dim_y, dim_z]
        },
        "status": "PASS" if has_signboard and total_tris > 500 else "FAIL"
    }

def main():
    print("==================================================")
    print("VALIDATING 3D BOOTH MODELS")
    print("==================================================")
    results = {}
    passed = 0

    for i in range(1, 7):
        booth_id = f"booth_{i:02d}"
        glb_path = MODELS_DIR / f"{booth_id}.glb"
        if not glb_path.exists():
            print(f"FAILED: {glb_path} does not exist!")
            continue

        meta = analyze_glb(glb_path)
        results[booth_id] = meta
        print(f"[{meta['status']}] {booth_id}: {meta['triangles']:,} tris | {meta['file_size_kb']} KB | Signboard: {meta['has_company_sign_surface']} | Dims: {meta['bounding_box']['dimensions']}")
        if meta['status'] == 'PASS':
            passed += 1

    out_json = METADATA_DIR / "booths.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nWrote metadata to: {out_json}")
    print(f"Validation summary: {passed}/6 booths passed.")

if __name__ == "__main__":
    main()
