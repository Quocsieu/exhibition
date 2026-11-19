"""
V27.4 — Upgraded Exhibition Plaza Amenities (Blender 4.2.16 LTS)
Exports 6 new versioned GLBs into FE/public/models/plaza/v27_4/ without touching V27.3.
Designed for unmistakable architectural presence in Overview, Initial Spawn, and Close-Up views!
"""
import bpy
import math
import os
import json

REPO_ROOT = r"E:\Lập trình\MatBaoWS\exhibition"
OUT_DIR = os.path.join(REPO_ROOT, "FE", "public", "models", "plaza", "v27_4")
MANIFEST_PATH = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v27_4_plaza_manifest.json"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgba, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_box(col, name, loc, dim, mat, rot=(0, 0, 0), bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = dim
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = min(bevel, min(dim) * 0.25)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
    obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def add_cyl(col, name, loc, radius, depth, mat, verts=22, rot=(0, 0, 0), bevel=0.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = min(bevel, radius * 0.2, depth * 0.2)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="Bevel")
    obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def add_ico(col, name, loc, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def merge_and_export(col, glb_path):
    by_mat = {}
    for obj in list(col.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        mname = obj.data.materials[0].name
        by_mat.setdefault(mname, []).append(obj)
    merged = []
    for mname, objs in by_mat.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        a = bpy.context.active_object
        a.name = f"PlazaMat_{mname}"
        merged.append(a)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    tris = 0
    for o in merged:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    return {
        "file": os.path.basename(glb_path),
        "sizeKb": round(os.path.getsize(glb_path) / 1024.0, 1),
        "meshes": len(merged),
        "triangles": tris,
    }


def build_welcome_desk():
    clear_scene()
    col = bpy.data.collections.new("WelcomeDeskV274")
    bpy.context.scene.collection.children.link(col)

    m_navy = make_mat("ArchNavy", (0.12, 0.16, 0.24, 1.0), metallic=0.35, roughness=0.34)
    m_brass = make_mat("ChampagneBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.80, roughness=0.25)
    m_stone = make_mat("TravertineDesk", (0.91, 0.89, 0.84, 1.0), metallic=0.0, roughness=0.52)
    m_oak = make_mat("FlutedOak", (0.58, 0.41, 0.25, 1.0), metallic=0.0, roughness=0.52)
    m_mat = make_mat("StandingRug", (0.28, 0.31, 0.36, 1.0), metallic=0.0, roughness=0.82)
    m_leaf = make_mat("PlanterLeaf", (0.18, 0.44, 0.30, 1.0), metallic=0.0, roughness=0.68)
    m_led = make_mat("WarmDownlight", (1.0, 0.91, 0.72, 1.0), emission=(1.0, 0.89, 0.68, 1.0), emission_strength=2.2)

    # Standing area rug
    add_box(col, "WelcomeMat", (0, -0.25, 0.015), (3.85, 2.35, 0.03), m_mat, bevel=0.01)
    # Fluted oak & stone desk
    add_box(col, "DeskBase", (0, 0.15, 0.09), (2.75, 0.92, 0.12), m_navy, bevel=0.02)
    add_box(col, "DeskBody", (0, 0.15, 0.54), (2.68, 0.86, 0.82), m_stone, bevel=0.04)
    add_box(col, "DeskTop", (0, 0.15, 0.99), (2.82, 0.98, 0.07), m_oak, bevel=0.02)
    add_box(col, "DeskGlow", (0, -0.30, 0.92), (2.56, 0.03, 0.03), m_led, bevel=0)
    for i in range(-11, 12):
        add_box(col, f"Rib_{i}", (i * 0.11, -0.29, 0.54), (0.04, 0.03, 0.72), m_oak, bevel=0.005)
    # Architectural canopy frame aligned with entrance gate
    for sx in (-1.58, 1.58):
        add_box(col, f"Post_{sx}", (sx, 0.38, 1.52), (0.16, 0.16, 2.98), m_navy, bevel=0.02)
        add_box(col, f"PostTrim_{sx}", (sx, 0.29, 1.52), (0.04, 0.02, 2.86), m_brass, bevel=0)
    add_box(col, "CanopyBeam", (0, 0.38, 2.92), (3.56, 0.36, 0.44), m_navy, bevel=0.025)
    add_box(col, "CanopyBrassCap", (0, 0.38, 3.16), (3.64, 0.40, 0.06), m_brass, bevel=0.01)
    add_box(col, "CanopyLED", (0, 0.24, 2.69), (3.12, 0.06, 0.03), m_led, bevel=0)
    # Twin side planters
    for sx in (-1.92, 1.92):
        add_box(col, f"Planter_{sx}", (sx, 0.25, 0.24), (0.48, 0.48, 0.44), m_navy, bevel=0.02)
        add_ico(col, f"Bush_{sx}", (sx, 0.25, 0.62), 0.26, m_leaf, scale=(1.0, 1.0, 0.85))

    return merge_and_export(col, os.path.join(OUT_DIR, "welcome_desk_v27_4.glb"))


def build_mini_cafe():
    clear_scene()
    col = bpy.data.collections.new("MiniCafeV274")
    bpy.context.scene.collection.children.link(col)

    m_deck = make_mat("CafeTimberDeck", (0.76, 0.67, 0.55, 1.0), metallic=0.0, roughness=0.58)
    m_wood = make_mat("WarmWalnut", (0.44, 0.30, 0.19, 1.0), metallic=0.0, roughness=0.48)
    m_cream = make_mat("CafeCream", (0.94, 0.91, 0.85, 1.0), metallic=0.0, roughness=0.52)
    m_dark = make_mat("EspressoSteel", (0.16, 0.17, 0.20, 1.0), metallic=0.62, roughness=0.30)
    m_brass = make_mat("CafeBrass", (0.78, 0.62, 0.36, 1.0), metallic=0.78, roughness=0.26)
    m_leaf = make_mat("CafeGreenery", (0.20, 0.48, 0.32, 1.0), metallic=0.0, roughness=0.68)
    m_lamp = make_mat("PendantGlow", (1.0, 0.88, 0.65, 1.0), emission=(1.0, 0.86, 0.62, 1.0), emission_strength=2.5)

    # Raised warm timber deck carpet (very recognizable in Overview!)
    add_box(col, "CafeDeck", (0, 0, 0.03), (5.75, 4.35, 0.06), m_deck, bevel=0.02)
    # Open Architectural Timber Pergola Frame over rear bar (unmistakable landmark!)
    for sx in (-2.45, 2.45):
        add_box(col, f"PergPostF_{sx}", (sx, 0.55, 1.54), (0.16, 0.16, 3.02), m_dark, bevel=0.015)
        add_box(col, f"PergPostB_{sx}", (sx, 1.85, 1.54), (0.16, 0.16, 3.02), m_dark, bevel=0.015)
    add_box(col, "PergFrontBeam", (0, 0.55, 2.98), (5.16, 0.24, 0.36), m_wood, bevel=0.02)
    add_box(col, "PergBackBeam", (0, 1.85, 2.98), (5.16, 0.20, 0.22), m_wood, bevel=0.02)
    for rx in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0):
        add_box(col, f"PergSlat_{rx}", (rx, 1.20, 3.12), (0.10, 1.52, 0.10), m_wood, bevel=0.01)
    # 3 Warm Pendant Lamps over bar
    for lx in (-1.05, 0.0, 1.05):
        add_cyl(col, f"Cord_{lx}", (lx, 1.12, 2.66), 0.012, 0.62, m_dark, verts=8, bevel=0)
        add_cyl(col, f"Shade_{lx}", (lx, 1.12, 2.30), 0.14, 0.16, m_brass, verts=16, bevel=0.01)
        add_cyl(col, f"Bulb_{lx}", (lx, 1.12, 2.21), 0.09, 0.04, m_lamp, verts=12, bevel=0)

    # Espresso Counter Bar
    add_box(col, "BarBase", (0, 1.18, 0.10), (3.15, 0.88, 0.12), m_dark, bevel=0.015)
    add_box(col, "BarBody", (0, 1.18, 0.55), (3.06, 0.82, 0.80), m_cream, bevel=0.03)
    add_box(col, "BarTop", (0, 1.18, 0.99), (3.22, 0.94, 0.07), m_wood, bevel=0.015)
    # Stylized Espresso Machine & Pastry Display
    add_box(col, "EspressoBody", (-0.65, 1.22, 1.26), (0.68, 0.44, 0.46), m_dark, bevel=0.02)
    add_box(col, "EspressoBrass", (-0.65, 1.00, 1.38), (0.58, 0.04, 0.06), m_brass, bevel=0.005)
    add_box(col, "PastryCase", (0.72, 1.18, 1.20), (0.72, 0.42, 0.34), m_cream, bevel=0.015)

    # 3 Spaced Café Bistro Tables + 6 Chairs (generous walking space!)
    for tx, ty in ((-1.65, -0.78), (0.0, -0.92), (1.65, -0.78)):
        add_cyl(col, f"TblBase_{tx}", (tx, ty, 0.08), 0.22, 0.05, m_dark, verts=16, bevel=0.008)
        add_cyl(col, f"TblStem_{tx}", (tx, ty, 0.41), 0.035, 0.64, m_dark, verts=12, bevel=0)
        add_cyl(col, f"TblTop_{tx}", (tx, ty, 0.75), 0.42, 0.045, m_cream, verts=22, bevel=0.01)
        for dx in (-0.62, 0.62):
            add_cyl(col, f"ChairSeat_{tx}_{dx}", (tx + dx, ty, 0.45), 0.20, 0.05, m_wood, verts=16, bevel=0.01)
            add_box(col, f"ChairBack_{tx}_{dx}", (tx + dx + (0.16 if dx > 0 else -0.16), ty, 0.67), (0.05, 0.36, 0.38), m_wood, bevel=0.015)
            add_cyl(col, f"ChairLeg_{tx}_{dx}", (tx + dx, ty, 0.24), 0.026, 0.40, m_dark, verts=10, bevel=0)

    # Twin lush corner planters + Architectural Trash Bin
    for sx in (-2.25, 2.25):
        add_box(col, f"Planter_{sx}", (sx, 1.18, 0.28), (0.72, 0.72, 0.50), m_dark, bevel=0.02)
        add_ico(col, f"BushA_{sx}", (sx - 0.12, 1.18, 0.72), 0.28, m_leaf, scale=(1.0, 1.0, 0.9))
        add_ico(col, f"BushB_{sx}", (sx + 0.14, 1.18, 0.68), 0.24, m_leaf, scale=(1.0, 1.0, 0.85))
    add_cyl(col, "CafeTrashBin", (2.32, -0.12, 0.42), 0.18, 0.76, m_dark, verts=16, bevel=0.015)
    add_cyl(col, "CafeTrashRim", (2.32, -0.12, 0.81), 0.19, 0.04, m_brass, verts=16, bevel=0.008)

    return merge_and_export(col, os.path.join(OUT_DIR, "mini_cafe_corner_v27_4.glb"))


def build_rest_lounge():
    clear_scene()
    col = bpy.data.collections.new("RestLoungeV274")
    bpy.context.scene.collection.children.link(col)

    m_stone = make_mat("LoungeStoneRug", (0.86, 0.84, 0.80, 1.0), metallic=0.0, roughness=0.64)
    m_wood = make_mat("LoungeOak", (0.60, 0.44, 0.28, 1.0), metallic=0.0, roughness=0.50)
    m_cushion = make_mat("WarmSandFabric", (0.85, 0.81, 0.74, 1.0), metallic=0.0, roughness=0.88)
    m_dark = make_mat("LoungeSteel", (0.20, 0.22, 0.26, 1.0), metallic=0.52, roughness=0.34)
    m_brass = make_mat("LoungeBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.78, roughness=0.25)
    m_leaf1 = make_mat("LoungeGreen1", (0.18, 0.46, 0.32, 1.0), metallic=0.0, roughness=0.68)
    m_leaf2 = make_mat("LoungeGreen2", (0.28, 0.56, 0.38, 1.0), metallic=0.0, roughness=0.68)
    m_glow = make_mat("BollardGlow", (1.0, 0.90, 0.70, 1.0), emission=(1.0, 0.88, 0.66, 1.0), emission_strength=2.2)

    # Stone lounge platform carpet
    add_box(col, "LoungeCarpet", (0, 0, 0.03), (5.55, 4.15, 0.06), m_stone, bevel=0.02)
    # Sculptural timber-slat accent portal at rear of lounge (gives clear Overview silhouette!)
    for sx in (-2.25, 2.25):
        add_box(col, f"LoungePost_{sx}", (sx, 1.52, 1.44), (0.16, 0.16, 2.82), m_dark, bevel=0.015)
    add_box(col, "LoungeHeader", (0, 1.52, 2.82), (4.76, 0.22, 0.18), m_wood, bevel=0.02)
    for rx in (-1.8, -1.08, -0.36, 0.36, 1.08, 1.8):
        add_box(col, f"LoungeRib_{rx}", (rx, 1.12, 2.88), (0.10, 1.05, 0.10), m_wood, bevel=0.01)

    # Central stepped planter island with layered greenery
    add_box(col, "PlanterIsland", (0, 0.92, 0.34), (3.45, 0.78, 0.62), m_dark, bevel=0.025)
    add_box(col, "PlanterTrim", (0, 0.92, 0.66), (3.52, 0.84, 0.04), m_wood, bevel=0.01)
    for i, bx in enumerate((-1.25, -0.62, 0.0, 0.62, 1.25)):
        add_ico(col, f"Shrub_{i}", (bx, 0.92, 0.88 + (0.08 if i % 2 == 0 else 0.0)), 0.32, m_leaf1 if i % 2 == 0 else m_leaf2, scale=(1.05, 0.95, 0.9))

    # 2 Wide Cushioned Timber Lounge Benches facing the avenue with side armrests
    for bx in (-1.35, 1.35):
        add_box(col, f"BenchFrame_{bx}", (bx, -0.45, 0.36), (2.12, 0.76, 0.10), m_wood, bevel=0.015)
        add_box(col, f"BenchSeat_{bx}", (bx, -0.45, 0.47), (1.96, 0.70, 0.14), m_cushion, bevel=0.03)
        add_box(col, f"BenchBack_{bx}", (bx, -0.14, 0.74), (1.96, 0.12, 0.42), m_cushion, rot=(math.radians(-10), 0, 0), bevel=0.03)
        for lx in (-0.88, 0.88):
            add_box(col, f"BenchLeg_{bx}_{lx}", (bx + lx, -0.45, 0.19), (0.09, 0.64, 0.32), m_dark, bevel=0.01)
            add_box(col, f"BenchArm_{bx}_{lx}", (bx + lx, -0.45, 0.56), (0.08, 0.68, 0.14), m_wood, bevel=0.015)

    # Low central oak side table between benches
    add_cyl(col, "SideTblBase", (0, -0.52, 0.24), 0.18, 0.40, m_dark, verts=16, bevel=0.01)
    add_cyl(col, "SideTblTop", (0, -0.52, 0.46), 0.36, 0.045, m_wood, verts=22, bevel=0.012)

    # 2 Warm Architectural Bollard Lamps + Trash Bin
    for lx in (-2.35, 2.35):
        add_cyl(col, f"BollardBody_{lx}", (lx, -1.25, 0.46), 0.09, 0.86, m_dark, verts=14, bevel=0.01)
        add_cyl(col, f"BollardGlow_{lx}", (lx, -1.25, 0.82), 0.085, 0.16, m_glow, verts=14, bevel=0)
        add_cyl(col, f"BollardCap_{lx}", (lx, -1.25, 0.92), 0.10, 0.04, m_brass, verts=14, bevel=0.008)
    add_cyl(col, "LoungeTrash", (2.28, 0.65, 0.42), 0.18, 0.76, m_dark, verts=16, bevel=0.015)
    add_cyl(col, "LoungeTrashRim", (2.28, 0.65, 0.81), 0.19, 0.04, m_brass, verts=16, bevel=0.008)

    return merge_and_export(col, os.path.join(OUT_DIR, "rest_lounge_v27_4.glb"))


def build_checkin_stage():
    clear_scene()
    col = bpy.data.collections.new("CheckInStageV274")
    bpy.context.scene.collection.children.link(col)

    m_navy = make_mat("StageNavy", (0.11, 0.15, 0.23, 1.0), metallic=0.32, roughness=0.34)
    m_brass = make_mat("StageBrass", (0.80, 0.65, 0.36, 1.0), metallic=0.82, roughness=0.22)
    m_white = make_mat("StageMarble", (0.94, 0.93, 0.90, 1.0), metallic=0.0, roughness=0.40)
    m_leaf = make_mat("StageGreenery", (0.18, 0.46, 0.30, 1.0), metallic=0.0, roughness=0.66)
    m_led = make_mat("StageSpotlight", (1.0, 0.92, 0.74, 1.0), emission=(1.0, 0.90, 0.70, 1.0), emission_strength=2.5)

    # Stepped Architectural Podium Platform
    add_box(col, "PodiumBase", (0, -0.08, 0.05), (6.10, 1.98, 0.10), m_navy, bevel=0.025)
    add_box(col, "PodiumStep", (0, -0.06, 0.13), (5.72, 1.72, 0.08), m_white, bevel=0.02)
    add_box(col, "PodiumEdgeGlow", (0, -0.93, 0.11), (5.55, 0.03, 0.03), m_led, bevel=0)

    # Grand Architectural Frame & Brass Side Ribs
    add_box(col, "BackdropCore", (0, 0.62, 1.92), (5.16, 0.24, 3.36), m_navy, bevel=0.025)
    for sx in (-2.68, 2.68):
        add_box(col, f"BrassColumn_{sx}", (sx, 0.58, 1.94), (0.18, 0.34, 3.52), m_brass, bevel=0.02)
    add_box(col, "TopCanopyBar", (0, 0.32, 3.68), (5.68, 0.72, 0.16), m_navy, bevel=0.02)
    add_box(col, "TopBrassTrim", (0, -0.04, 3.68), (5.68, 0.04, 0.08), m_brass, bevel=0)
    # 4 Overhead Warm Spotlights
    for lx in (-1.8, -0.6, 0.6, 1.8):
        add_cyl(col, f"SpotCan_{lx}", (lx, 0.10, 3.54), 0.07, 0.14, m_navy, verts=12, bevel=0.01)
        add_cyl(col, f"SpotLens_{lx}", (lx, 0.10, 3.46), 0.055, 0.02, m_led, verts=12, bevel=0)

    # Twin Sculptural Multi-Tier Planters
    for sx in (-3.28, 3.28):
        add_box(col, f"Planter_{sx}", (sx, 0.28, 0.32), (0.76, 0.76, 0.56), m_navy, bevel=0.02)
        add_box(col, f"PlanterTrim_{sx}", (sx, 0.28, 0.62), (0.80, 0.80, 0.04), m_brass, bevel=0.01)
        add_ico(col, f"BushA_{sx}", (sx, 0.28, 0.88), 0.34, m_leaf, scale=(1.0, 1.0, 1.15))
        add_ico(col, f"BushB_{sx}", (sx + (0.18 if sx < 0 else -0.18), 0.12, 0.76), 0.22, m_leaf, scale=(1.0, 1.0, 0.9))

    return merge_and_export(col, os.path.join(OUT_DIR, "checkin_stage_v27_4.glb"))


def build_directory_monument():
    """Dedicated wider, taller Exhibition Directory Monument (1.80m x 2.65m) for easy legibility."""
    clear_scene()
    col = bpy.data.collections.new("DirectoryMonumentV274")
    bpy.context.scene.collection.children.link(col)

    m_navy = make_mat("DirNavy", (0.12, 0.16, 0.24, 1.0), metallic=0.40, roughness=0.30)
    m_brass = make_mat("DirBrass", (0.80, 0.65, 0.36, 1.0), metallic=0.80, roughness=0.24)
    m_silver = make_mat("DirSilver", (0.84, 0.86, 0.90, 1.0), metallic=0.65, roughness=0.26)
    m_led = make_mat("DirTopLED", (1.0, 0.91, 0.72, 1.0), emission=(1.0, 0.89, 0.68, 1.0), emission_strength=2.2)

    add_box(col, "DirBase", (0, 0, 0.06), (2.06, 0.68, 0.12), m_navy, bevel=0.02)
    add_box(col, "DirBody", (0, 0, 1.38), (1.84, 0.22, 2.54), m_navy, bevel=0.025)
    add_box(col, "DirCap", (0, 0, 2.68), (1.92, 0.28, 0.09), m_silver, bevel=0.015)
    for sx in (-0.93, 0.93):
        add_box(col, f"DirBrassEdge_{sx}", (sx, 0, 1.38), (0.04, 0.24, 2.46), m_brass, bevel=0.008)
    add_box(col, "DirGlow", (0, -0.12, 2.58), (1.68, 0.03, 0.03), m_led, bevel=0)

    return merge_and_export(col, os.path.join(OUT_DIR, "directory_monument_v27_4.glb"))


def build_digital_totem():
    clear_scene()
    col = bpy.data.collections.new("DigitalTotemV274")
    bpy.context.scene.collection.children.link(col)

    m_navy = make_mat("TotemNavy", (0.12, 0.16, 0.24, 1.0), metallic=0.45, roughness=0.28)
    m_brass = make_mat("TotemBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.80, roughness=0.24)
    m_led = make_mat("TotemGlow", (0.35, 0.82, 1.0, 1.0), emission=(0.30, 0.78, 1.0, 1.0), emission_strength=2.0)

    add_box(col, "TotemBase", (0, 0, 0.05), (1.16, 0.56, 0.10), m_navy, bevel=0.02)
    add_box(col, "TotemBody", (0, 0, 1.24), (0.98, 0.20, 2.28), m_navy, bevel=0.025)
    for sx in (-0.50, 0.50):
        add_box(col, f"TotemTrim_{sx}", (sx, 0, 1.24), (0.035, 0.22, 2.18), m_brass, bevel=0.006)
    add_box(col, "TotemBaseGlow", (0, -0.22, 0.11), (0.92, 0.03, 0.025), m_led, bevel=0)

    return merge_and_export(col, os.path.join(OUT_DIR, "digital_totem_v27_4.glb"))


def main():
    manifest = {
        "version": "v27_4",
        "amenities": [
            build_welcome_desk(),
            build_mini_cafe(),
            build_rest_lounge(),
            build_checkin_stage(),
            build_directory_monument(),
            build_digital_totem(),
        ],
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("V27.4 PLAZA AMENITIES EXPORTED:", json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
