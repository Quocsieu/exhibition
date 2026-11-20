"""
V27.5 — Plaza Landscape & Spatial Enrichment Assets (Blender 4.2.16 LTS)
Exports 4 new versioned, material-merged GLBs into FE/public/models/plaza/v27_5/
without touching V27.3, V27.4, V4, or Booth GLBs:
  1. landscape_lounge_v27_5.glb        — Left Landscape Lounge (5.6m x 4.4m)
  2. interactive_expo_corner_v27_5.glb — Right Interactive Expo Corner (5.6m x 4.4m)
  3. plaza_oasis_v27_5.glb             — Mid-Booth Garden Bench & Planter Oasis (3.4m x 2.6m)
  4. avenue_planter_island_v27_5.glb   — South Concourse Planter & Bollard Island (2.8m x 1.5m)

All models feature beveled geometry, multi-material PBR variation, organic multi-tier
clustered trees/foliage (with trunks & layered canopies), warm architectural lighting accents,
and material-merged draw-call efficiency.
"""
import bpy
import math
import os
import json

REPO_ROOT = r"E:\Lập trình\MatBaoWS\exhibition"
OUT_DIR = os.path.join(REPO_ROOT, "FE", "public", "models", "plaza", "v27_5")
MANIFEST_PATH = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v27_5_plaza_manifest.json"
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


def add_cyl(col, name, loc, radius, depth, mat, verts=20, rot=(0, 0, 0), bevel=0.01):
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


def add_torus(col, name, loc, major_r, minor_r, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=28,
        minor_segments=12,
        major_radius=major_r,
        minor_radius=minor_r,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.active_object
    obj.name = name
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


def add_ornamental_tree(col, prefix, loc, height, mat_trunk, mat_leaf1, mat_leaf2):
    """Natural multi-branch ornamental indoor/plaza tree (not a basic sphere)."""
    x, y, z0 = loc
    trunk_h = height * 0.52
    add_cyl(col, f"{prefix}_Trunk", (x, y, z0 + trunk_h * 0.5), 0.045, trunk_h, mat_trunk, verts=10, bevel=0)
    # 2 angled secondary branches
    add_cyl(col, f"{prefix}_Br1", (x - 0.12, y + 0.06, z0 + trunk_h * 0.85), 0.025, trunk_h * 0.45, mat_trunk, verts=8, rot=(0.25, -0.45, 0), bevel=0)
    add_cyl(col, f"{prefix}_Br2", (x + 0.12, y - 0.05, z0 + trunk_h * 0.88), 0.025, trunk_h * 0.42, mat_trunk, verts=8, rot=(-0.22, 0.42, 0), bevel=0)
    # Layered organic foliage clusters
    top_z = z0 + trunk_h + height * 0.20
    r = height * 0.22
    add_ico(col, f"{prefix}_CanopyC", (x, y, top_z + r * 0.35), r, mat_leaf1, scale=(1.15, 1.05, 0.78))
    add_ico(col, f"{prefix}_CanopyL", (x - r * 0.85, y + r * 0.25, top_z - r * 0.08), r * 0.78, mat_leaf2, scale=(1.1, 1.0, 0.82))
    add_ico(col, f"{prefix}_CanopyR", (x + r * 0.82, y - r * 0.22, top_z + r * 0.05), r * 0.72, mat_leaf1, scale=(1.05, 1.1, 0.80))
    add_ico(col, f"{prefix}_CanopyF", (x + r * 0.10, y - r * 0.75, top_z - r * 0.15), r * 0.65, mat_leaf2, scale=(1.1, 0.95, 0.75))


def add_bollard_lamp(col, prefix, loc, mat_body, mat_brass, mat_glow):
    x, y, z0 = loc
    add_cyl(col, f"{prefix}_Base", (x, y, z0 + 0.03), 0.11, 0.06, mat_body, verts=14, bevel=0.008)
    add_cyl(col, f"{prefix}_Post", (x, y, z0 + 0.44), 0.075, 0.78, mat_body, verts=14, bevel=0.008)
    add_cyl(col, f"{prefix}_Light", (x, y, z0 + 0.78), 0.072, 0.16, mat_glow, verts=14, bevel=0)
    add_cyl(col, f"{prefix}_Cap", (x, y, z0 + 0.88), 0.088, 0.04, mat_brass, verts=14, bevel=0.006)


def add_lounge_armchair(col, prefix, loc, rot_z, mat_cushion, mat_wood, mat_metal):
    cx, cy, cz = loc
    c, s = math.cos(rot_z), math.sin(rot_z)
    def tf(lx, ly):
        return (cx + lx * c - ly * s, cy + lx * s + ly * c)
    # Wooden seat base & plush cushion
    add_box(col, f"{prefix}_Base", (cx, cy, cz + 0.34), (0.76, 0.72, 0.08), mat_wood, rot=(0, 0, rot_z), bevel=0.02)
    add_box(col, f"{prefix}_Seat", (cx, cy, cz + 0.44), (0.68, 0.66, 0.14), mat_cushion, rot=(0, 0, rot_z), bevel=0.04)
    # Angled backrest
    bx, by = tf(0, 0.27)
    add_box(col, f"{prefix}_Back", (bx, by, cz + 0.72), (0.68, 0.14, 0.46), mat_cushion, rot=(math.radians(-12), 0, rot_z), bevel=0.04)
    # Sculpted side armrests
    for ax in (-0.34, 0.34):
        px, py = tf(ax, 0.02)
        add_box(col, f"{prefix}_Arm_{ax}", (px, py, cz + 0.56), (0.09, 0.66, 0.16), mat_wood, rot=(0, 0, rot_z), bevel=0.02)
    # 4 tapered metal legs
    for lx in (-0.30, 0.30):
        for ly in (-0.28, 0.28):
            px, py = tf(lx, ly)
            add_cyl(col, f"{prefix}_Leg", (px, py, cz + 0.16), 0.024, 0.32, mat_metal, verts=10, bevel=0)


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
        a.name = f"V275Mat_{mname}"
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


# ============================================================================
# 1. LEFT LANDSCAPE LOUNGE (Premium Contemporary Exhibition Lounge, 5.6m x 4.4m)
# ============================================================================
def build_landscape_lounge():
    clear_scene()
    col = bpy.data.collections.new("LandscapeLoungeV275")
    bpy.context.scene.collection.children.link(col)

    m_stone = make_mat("TravertineDeck", (0.88, 0.85, 0.79, 1.0), metallic=0.0, roughness=0.56)
    m_slate = make_mat("PlanterSlate", (0.18, 0.20, 0.24, 1.0), metallic=0.22, roughness=0.40)
    m_oak = make_mat("WarmOakWood", (0.58, 0.42, 0.26, 1.0), metallic=0.0, roughness=0.48)
    m_brass = make_mat("ChampagneBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.82, roughness=0.24)
    m_linen = make_mat("SandLinenFabric", (0.89, 0.85, 0.78, 1.0), metallic=0.0, roughness=0.88)
    m_trunk = make_mat("BarkWood", (0.34, 0.25, 0.18, 1.0), metallic=0.0, roughness=0.78)
    m_leaf1 = make_mat("BotanicalDeep", (0.17, 0.44, 0.29, 1.0), metallic=0.0, roughness=0.68)
    m_leaf2 = make_mat("BotanicalFresh", (0.27, 0.56, 0.36, 1.0), metallic=0.0, roughness=0.66)
    m_glow = make_mat("WarmLoungeLED", (1.0, 0.90, 0.70, 1.0), emission=(1.0, 0.88, 0.66, 1.0), emission_strength=2.2)

    # Raised travertine architectural platform with chamfered champagne-brass perimeter inlay
    add_box(col, "DeckBrassTrim", (0, 0, 0.03), (5.68, 4.48, 0.05), m_brass, bevel=0.015)
    add_box(col, "DeckStone", (0, 0, 0.055), (5.52, 4.32, 0.06), m_stone, bevel=0.02)
    # Inner recessed warm wood accent inlay strip
    add_box(col, "DeckWoodInlay", (-0.15, -0.10, 0.088), (3.40, 2.35, 0.012), m_oak, bevel=0.005)

    # A. MAIN SEATING — Premium Long Bench (back-center) + 2 Sculpted Lounge Armchairs + Low Coffee Table
    # Long Lounge Bench (2.75m wide)
    add_box(col, "LongBench_Frame", (-0.35, 0.95, 0.36), (2.76, 0.80, 0.10), m_oak, bevel=0.02)
    add_box(col, "LongBench_Seat", (-0.35, 0.95, 0.48), (2.58, 0.72, 0.16), m_linen, bevel=0.04)
    add_box(col, "LongBench_Back", (-0.35, 1.28, 0.78), (2.58, 0.14, 0.46), m_linen, rot=(math.radians(-10), 0, 0), bevel=0.04)
    for lx in (-1.52, -0.35, 0.82):
        add_box(col, f"LongBench_Leg_{lx}", (lx, 0.95, 0.18), (0.09, 0.66, 0.26), m_slate, bevel=0.01)
    for ax in (-1.68, 0.98):
        add_box(col, f"LongBench_Arm_{ax}", (ax, 0.95, 0.58), (0.10, 0.72, 0.16), m_oak, bevel=0.02)

    # 2 Lounge Armchairs angled comfortably around the coffee table
    add_lounge_armchair(col, "ChairL", (-1.35, -0.95, 0.085), math.radians(-155), m_linen, m_oak, m_brass)
    add_lounge_armchair(col, "ChairR", (0.55, -0.95, 0.085), math.radians(150), m_linen, m_oak, m_brass)

    # Low Travertine & Brass Coffee Table
    add_cyl(col, "CoffeeBase", (-0.38, -0.12, 0.24), 0.32, 0.28, m_slate, verts=24, bevel=0.02)
    add_cyl(col, "CoffeeTrim", (-0.38, -0.12, 0.39), 0.35, 0.03, m_brass, verts=24, bevel=0.008)
    add_cyl(col, "CoffeeTop", (-0.38, -0.12, 0.44), 0.62, 0.06, m_stone, verts=28, bevel=0.018)

    # B. 3 ARCHITECTURAL PLANTERS WITH LAYERED TREES & UNDER-GLOW
    planters = [
        ("PlanterNW", (-2.18, 1.48), (1.12, 1.12, 0.58), 2.15),
        ("PlanterNE", (1.92, 1.42), (1.28, 1.04, 0.52), 1.65),
        ("PlanterSW", (-2.22, -1.42), (1.04, 1.04, 0.46), 1.25),
    ]
    for pname, (px, py), (pw, pd, ph), tree_h in planters:
        add_box(col, f"{pname}_Foot", (px, py, 0.12), (pw - 0.10, pd - 0.10, 0.08), m_slate, bevel=0.01)
        add_box(col, f"{pname}_Glow", (px, py, 0.16), (pw - 0.06, pd - 0.06, 0.025), m_glow, bevel=0)
        add_box(col, f"{pname}_Body", (px, py, 0.16 + ph * 0.5), (pw, pd, ph), m_slate, bevel=0.025)
        add_box(col, f"{pname}_Rim", (px, py, 0.16 + ph + 0.025), (pw + 0.06, pd + 0.06, 0.05), m_brass, bevel=0.01)
        add_ornamental_tree(col, f"{pname}_Tree", (px, py, 0.16 + ph), tree_h, m_trunk, m_leaf1, m_leaf2)

    # E. MODERN EXHIBITION SCULPTURE FEATURE (East edge of lounge)
    sx, sy = 2.02, -0.45
    add_box(col, "SculptPlinth", (sx, sy, 0.48), (0.76, 0.76, 0.80), m_stone, bevel=0.025)
    add_box(col, "SculptCap", (sx, sy, 0.90), (0.80, 0.80, 0.04), m_brass, bevel=0.01)
    add_torus(col, "SculptRing1", (sx, sy, 1.42), 0.36, 0.045, m_brass, rot=(math.radians(78), math.radians(18), 0))
    add_torus(col, "SculptRing2", (sx, sy, 1.42), 0.25, 0.035, m_slate, rot=(math.radians(65), math.radians(-38), math.radians(24)))

    # C. 2 WARM ARCHITECTURAL BOLLARD LAMPS
    add_bollard_lamp(col, "LoungeLamp1", (-2.38, -0.05, 0.085), m_slate, m_brass, m_glow)
    add_bollard_lamp(col, "LoungeLamp2", (2.32, -1.62, 0.085), m_slate, m_brass, m_glow)

    return merge_and_export(col, os.path.join(OUT_DIR, "landscape_lounge_v27_5.glb"))


# ============================================================================
# 2. RIGHT INTERACTIVE EXPO CORNER (Modern Information & Experience Zone, 5.6m x 4.4m)
# ============================================================================
def build_interactive_expo_corner():
    clear_scene()
    col = bpy.data.collections.new("InteractiveExpoCornerV275")
    bpy.context.scene.collection.children.link(col)

    m_floor = make_mat("TechSlatePad", (0.24, 0.27, 0.33, 1.0), metallic=0.14, roughness=0.42)
    m_navy = make_mat("ExpoSteelNavy", (0.12, 0.17, 0.26, 1.0), metallic=0.44, roughness=0.30)
    m_alu = make_mat("BrushedTitanium", (0.78, 0.82, 0.86, 1.0), metallic=0.78, roughness=0.24)
    m_cushion = make_mat("SlateBlueFabric", (0.28, 0.38, 0.52, 1.0), metallic=0.0, roughness=0.84)
    m_glass = make_mat("DarkDisplayGlass", (0.08, 0.12, 0.18, 1.0), metallic=0.55, roughness=0.12)
    m_leaf1 = make_mat("TechLeaf1", (0.18, 0.48, 0.34, 1.0), metallic=0.0, roughness=0.66)
    m_leaf2 = make_mat("TechLeaf2", (0.26, 0.58, 0.40, 1.0), metallic=0.0, roughness=0.64)
    m_cyan = make_mat("LinearInfoLED", (0.32, 0.80, 1.0, 1.0), emission=(0.28, 0.76, 1.0, 1.0), emission_strength=2.0)
    m_warm = make_mat("WarmAccentLED", (1.0, 0.90, 0.72, 1.0), emission=(1.0, 0.88, 0.68, 1.0), emission_strength=2.0)

    # F. Tech zone floor pad with brushed-aluminum & linear accent border
    add_box(col, "PadBorder", (0, 0, 0.03), (5.68, 4.48, 0.05), m_alu, bevel=0.015)
    add_box(col, "PadFloor", (0, 0, 0.055), (5.52, 4.32, 0.06), m_floor, bevel=0.02)
    add_box(col, "PadLinearLED", (0, -2.18, 0.075), (4.80, 0.035, 0.02), m_cyan, bevel=0)

    # A. HERO DIGITAL INFORMATION TOTEM (Front-left of corner, angled toward avenue: x = -1.65, Blender y = -0.35 => Three z = +0.35)
    tx, ty, trot = -1.65, -0.35, math.radians(24)
    add_box(col, "TotemFoot", (tx, ty, 0.14), (1.18, 0.64, 0.12), m_navy, rot=(0, 0, trot), bevel=0.02)
    add_box(col, "TotemBody", (tx, ty, 1.32), (1.04, 0.22, 2.26), m_navy, rot=(0, 0, trot), bevel=0.025)
    add_box(col, "TotemSideAlu", (tx, ty, 1.32), (1.08, 0.18, 2.20), m_alu, rot=(0, 0, trot), bevel=0.015)
    add_box(col, "TotemGlow", (tx, ty, 0.21), (0.98, 0.56, 0.025), m_cyan, rot=(0, 0, trot), bevel=0)

    # B. WIDE ARCHITECTURAL EXHIBITION INFORMATION PANEL (Rear-right: x = +0.55, Blender y = +1.05 => Three z = -1.05)
    px, py = 0.55, 1.05
    add_box(col, "InfoBase", (px, py, 0.16), (2.88, 0.56, 0.16), m_navy, bevel=0.02)
    add_box(col, "InfoUnderGlow", (px, py - 0.22, 0.26), (2.68, 0.04, 0.03), m_cyan, bevel=0)
    for sx in (-1.34, 1.34):
        add_box(col, f"InfoPost_{sx}", (px + sx, py, 1.18), (0.14, 0.24, 1.96), m_alu, bevel=0.015)
    add_box(col, "InfoFrame", (px, py, 1.36), (2.66, 0.18, 1.66), m_navy, bevel=0.02)
    add_box(col, "InfoCanopy", (px, py - 0.12, 2.22), (2.86, 0.44, 0.09), m_navy, bevel=0.015)
    add_box(col, "InfoTopLED", (px, py - 0.24, 2.16), (2.56, 0.04, 0.025), m_warm, bevel=0)

    # C. VIEWING BENCH + STANDING LEANING / INFO BAR RAIL
    # Compact viewing bench facing the info wall (x = 0.45, Blender y = -0.75 => Three z = +0.75)
    add_box(col, "ViewBench_Frame", (0.45, -0.75, 0.36), (1.76, 0.62, 0.08), m_navy, bevel=0.015)
    add_box(col, "ViewBench_Seat", (0.45, -0.75, 0.45), (1.66, 0.56, 0.12), m_cushion, bevel=0.03)
    for lx in (-0.72, 0.72):
        add_box(col, f"ViewBench_Leg_{lx}", (0.45 + lx, -0.75, 0.20), (0.08, 0.50, 0.28), m_alu, bevel=0.01)

    # Standing Info Console / Leaning Table on right flank (x = 2.05, Blender y = -0.65 => Three z = +0.65)
    add_box(col, "LeanTable_Base", (2.05, -0.65, 0.12), (0.58, 1.05, 0.07), m_navy, bevel=0.015)
    add_box(col, "LeanTable_Col", (2.05, -0.65, 0.58), (0.18, 0.78, 0.86), m_navy, bevel=0.015)
    add_box(col, "LeanTable_Top", (2.05, -0.65, 1.03), (0.64, 1.18, 0.055), m_alu, bevel=0.012)
    add_box(col, "LeanTable_Glass", (2.05, -0.65, 1.06), (0.46, 0.92, 0.015), m_glass, bevel=0)

    # D. 2 LOW ARCHITECTURAL PLANTERS (Rear-left & Far-right — NEVER blocking screens!)
    for pname, (gx, gy), (gw, gd) in (
        ("TechPlanterL", (-1.92, 1.38), (1.28, 0.96)),
        ("TechPlanterR", (2.22, 1.32), (0.96, 1.18)),
    ):
        add_box(col, f"{pname}_Body", (gx, gy, 0.34), (gw, gd, 0.52), m_navy, bevel=0.02)
        add_box(col, f"{pname}_Rim", (gx, gy, 0.62), (gw + 0.05, gd + 0.05, 0.04), m_alu, bevel=0.01)
        add_ico(col, f"{pname}_Bush1", (gx - 0.20, gy, 0.84), 0.30, m_leaf1, scale=(1.1, 1.0, 0.82))
        add_ico(col, f"{pname}_Bush2", (gx + 0.22, gy + 0.05, 0.88), 0.28, m_leaf2, scale=(1.0, 1.05, 0.90))

    # E. 2 SLEEK BOLLARD LAMPS
    add_bollard_lamp(col, "TechLamp1", (-2.38, -1.62, 0.085), m_navy, m_alu, m_cyan)
    add_bollard_lamp(col, "TechLamp2", (2.38, -1.62, 0.085), m_navy, m_alu, m_warm)

    return merge_and_export(col, os.path.join(OUT_DIR, "interactive_expo_corner_v27_5.glb"))


# ============================================================================
# 3. MID-BOOTH GARDEN BENCH & PLANTER OASIS (3.4m x 2.6m)
# ============================================================================
def build_plaza_oasis():
    clear_scene()
    col = bpy.data.collections.new("PlazaOasisV275")
    bpy.context.scene.collection.children.link(col)

    m_stone = make_mat("OasisStone", (0.86, 0.84, 0.79, 1.0), metallic=0.0, roughness=0.58)
    m_slate = make_mat("OasisSlate", (0.18, 0.20, 0.24, 1.0), metallic=0.25, roughness=0.38)
    m_oak = make_mat("OasisOak", (0.58, 0.42, 0.26, 1.0), metallic=0.0, roughness=0.48)
    m_brass = make_mat("OasisBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.80, roughness=0.25)
    m_leaf1 = make_mat("OasisGreen1", (0.18, 0.46, 0.31, 1.0), metallic=0.0, roughness=0.66)
    m_leaf2 = make_mat("OasisGreen2", (0.28, 0.56, 0.38, 1.0), metallic=0.0, roughness=0.64)
    m_trunk = make_mat("OasisBark", (0.34, 0.25, 0.18, 1.0), metallic=0.0, roughness=0.78)
    m_glow = make_mat("OasisWarmLED", (1.0, 0.90, 0.70, 1.0), emission=(1.0, 0.88, 0.66, 1.0), emission_strength=2.2)

    # Chamfered stone pad
    add_box(col, "OasisBorder", (0, 0, 0.025), (3.44, 2.56, 0.04), m_brass, bevel=0.012)
    add_box(col, "OasisDeck", (0, 0, 0.045), (3.32, 2.44, 0.05), m_stone, bevel=0.015)

    # Central sculptural planter + ornamental tree
    add_box(col, "OasisPlanter", (-0.55, 0, 0.34), (1.16, 1.48, 0.54), m_slate, bevel=0.025)
    add_box(col, "OasisPlanterRim", (-0.55, 0, 0.63), (1.22, 1.54, 0.04), m_brass, bevel=0.01)
    add_ornamental_tree(col, "OasisTree", (-0.55, 0.15, 0.62), 1.55, m_trunk, m_leaf1, m_leaf2)
    add_ico(col, "OasisShrub", (-0.55, -0.45, 0.84), 0.28, m_leaf2, scale=(1.1, 0.95, 0.85))

    # Integrated warm oak bench facing the avenue (+X)
    add_box(col, "OasisBenchSeat", (0.68, 0, 0.44), (0.76, 1.92, 0.09), m_oak, bevel=0.02)
    for ly in (-0.76, 0.76):
        add_box(col, f"OasisBenchLeg_{ly}", (0.68, ly, 0.24), (0.64, 0.10, 0.34), m_slate, bevel=0.01)

    # Warm bollard lamp + architectural trash bin
    add_bollard_lamp(col, "OasisLamp", (1.28, -0.92, 0.07), m_slate, m_brass, m_glow)
    add_cyl(col, "OasisTrash", (1.26, 0.88, 0.42), 0.17, 0.72, m_slate, verts=16, bevel=0.015)
    add_cyl(col, "OasisTrashRim", (1.26, 0.88, 0.79), 0.18, 0.035, m_brass, verts=16, bevel=0.008)

    return merge_and_export(col, os.path.join(OUT_DIR, "plaza_oasis_v27_5.glb"))


# ============================================================================
# 4. SOUTH CONCOURSE PLANTER & BOLLARD ISLAND (2.8m x 1.5m)
# ============================================================================
def build_avenue_planter_island():
    clear_scene()
    col = bpy.data.collections.new("AvenuePlanterIslandV275")
    bpy.context.scene.collection.children.link(col)

    m_stone = make_mat("IslandStone", (0.88, 0.85, 0.80, 1.0), metallic=0.0, roughness=0.56)
    m_slate = make_mat("IslandSlate", (0.18, 0.20, 0.24, 1.0), metallic=0.25, roughness=0.38)
    m_oak = make_mat("IslandOak", (0.58, 0.42, 0.26, 1.0), metallic=0.0, roughness=0.48)
    m_brass = make_mat("IslandBrass", (0.78, 0.63, 0.36, 1.0), metallic=0.80, roughness=0.25)
    m_leaf1 = make_mat("IslandGreen1", (0.18, 0.46, 0.31, 1.0), metallic=0.0, roughness=0.66)
    m_leaf2 = make_mat("IslandGreen2", (0.28, 0.56, 0.38, 1.0), metallic=0.0, roughness=0.64)
    m_glow = make_mat("IslandWarmLED", (1.0, 0.90, 0.70, 1.0), emission=(1.0, 0.88, 0.66, 1.0), emission_strength=2.2)

    # Low stepped stone planter with integrated oak seating ledge
    add_box(col, "IslandPad", (0, 0, 0.03), (2.78, 1.46, 0.05), m_stone, bevel=0.015)
    add_box(col, "IslandGlow", (0, 0, 0.07), (2.56, 1.24, 0.025), m_glow, bevel=0)
    add_box(col, "IslandBasin", (-0.28, 0, 0.32), (1.96, 1.12, 0.48), m_slate, bevel=0.025)
    add_box(col, "IslandCoping", (-0.28, 0, 0.58), (2.02, 1.18, 0.045), m_brass, bevel=0.01)
    # Integrated short oak bench ledge on the right end
    add_box(col, "IslandSeat", (0.98, 0, 0.42), (0.62, 1.04, 0.08), m_oak, bevel=0.02)
    add_box(col, "IslandSeatLeg", (1.16, 0, 0.22), (0.10, 0.88, 0.34), m_slate, bevel=0.01)

    # Layered sculptural greenery (low-to-medium height, zero sightline blocking!)
    for idx, bx in enumerate((-0.92, -0.28, 0.36)):
        add_ico(col, f"IslandBush_{idx}", (bx, 0, 0.82 + (0.10 if idx == 1 else 0.0)), 0.34 if idx == 1 else 0.28, m_leaf1 if idx != 1 else m_leaf2, scale=(1.15, 0.98, 0.88))

    # Warm architectural bollard lamp
    add_bollard_lamp(col, "IslandLamp", (-1.22, -0.52, 0.055), m_slate, m_brass, m_glow)

    return merge_and_export(col, os.path.join(OUT_DIR, "avenue_planter_island_v27_5.glb"))


def main():
    manifest = {
        "version": "v27_5",
        "enrichmentAssets": [
            build_landscape_lounge(),
            build_interactive_expo_corner(),
            build_plaza_oasis(),
            build_avenue_planter_island(),
        ],
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("V27.5 PLAZA ENRICHMENT EXPORTED:", json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
