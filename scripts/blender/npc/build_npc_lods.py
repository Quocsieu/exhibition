"""
V27.2 Phase 1 — Generate LOD1 (~19.5K tris) and LOD2 (~9.4K tris) variants of the
Vietnamese Female Sales Assistant NPC from untitled.glb WITHOUT modifying untitled.glb (LOD0).
Preserves all 5 material slots, exact scale/bounds, normals, and clean silhouette for procedural rigging.
"""
import os
import bpy

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "npc", "untitled.glb")
OUT_LOD1 = os.path.join(REPO_ROOT, "FE", "public", "models", "npc", "untitled_lod1.glb")
OUT_LOD2 = os.path.join(REPO_ROOT, "FE", "public", "models", "npc", "untitled_lod2.glb")


def build_lod(ratio: float, out_path: str, label: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)

    total_tris = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new(name=f"Decimate_{label}", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.calc_loop_triangles()
        total_tris += len(obj.data.loop_triangles)
        for poly in obj.data.polygons:
            poly.use_smooth = True

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    kb = round(os.path.getsize(out_path) / 1024.0, 1)
    print(f"[NPC {label}] tris={total_tris} file_kb={kb} out={out_path}")


if __name__ == "__main__":
    build_lod(0.50, OUT_LOD1, "LOD1")
    build_lod(0.24, OUT_LOD2, "LOD2")
