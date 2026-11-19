"""
V27.4 — Six Genuinely Distinct Architectural Booth Interiors (Blender 4.2.16 LTS)
Exports 6 new versioned GLBs into FE/public/models/booths/v27_4/ without touching V27.3 or V4.

Key V27.4 Upgrades:
1. SIX RADICALLY DIFFERENT INTERIOR FLOOR PLANS (zero shared cookie-cutter layout):
   - Booth 01 (Signature Ring — Luxury Circular Showroom):
       Right-side curved oak reception desk, HERO circular tiered island dead-center,
       curved rear-left gallery shelving arc, rear-left VIP banquette + marble coffee table.
   - Booth 02 (Organic Flow — Immersive Creative Gallery):
       Sweeping S-curve diagonal sculptural partition, far-left small oval host desk,
       off-axis sculptural pill pedestals, organic curved right niche, front-right pastel lounge sofa.
   - Booth 03 (Grand Portal — Modular Digital Experience):
       Front-left L-shaped modular tech counter, center-right stepped demo island,
       rear-right freestanding digital kiosk, vertical illuminated tech-blade wall towers,
       rear-left compact glass consultation pod.
   - Booth 04 (Wave Pavilion — Open Interactive Showcase):
       Depthwise sweeping wave demo bar along the RIGHT side, completely open central walk-in zone,
       left-center 3-pedestal organic cluster, rear-left angled freestanding promo screen,
       tucked bar stools along the right wave bar.
   - Booth 05 (Gallery Arch — Boutique Architectural Gallery):
       Deep recessed architectural gallery arches with plinth bases along rear & left,
       low elongated walnut+stone central exhibition island, rear-right tucked boutique desk,
       front-left warm bistro consultation nook, overhead gallery spotlights.
   - Booth 06 (Dynamic Frame — Futuristic Modular Lab):
       Front-right angled geometric cantilevered demo counter, left-side twin faceted showcase pods,
       tall cantilevered digital monolith, floating frame shelves on right wall,
       rear-right separated minimalist consultation nook with subtle violet rim lighting.
2. ARCHITECTURAL SIGNAGE REFINEMENT:
   - Bulky rectangular front fascia boxes REMOVED from curved/arched booths (01, 02, 05)
     and slimmed on portal/wave/frame booths (03, 04, 06) so arches & rings shine unobstructed.
3. RICH PBR MATERIALS & WARM ARCHITECTURAL LIGHTING ACCENTS:
   - Walnut wood, fluted oak, travertine stone, champagne brass, brushed titanium,
     boucle/linen fabric, matte plaster, warm recessed cove & under-plinth LED strips.

Coordinate convention:
- Blender +X = Three.js +X (Right)
- Blender +Y = Three.js -Z (Back)
- Blender -Y = Three.js +Z (Front / Entrance)
- Blender +Z = Three.js +Y (Up)
"""
import bpy
import bmesh
import math
import os
import json

REPO_ROOT = r"E:\Lập trình\MatBaoWS\exhibition"
OUT_DIR = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v27_4")
MANIFEST_PATH = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v27_4_booths_manifest.json"
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


def add_box(col, name, loc, dim, mat, rot=(0, 0, 0), bevel=0.025):
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


def add_cyl(col, name, loc, radius, depth, mat, verts=28, rot=(0, 0, 0), bevel=0.015):
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


def add_arch_ribbon(col, name, center_y, width, height, depth, thickness, mat, segments=26):
    """Creates a clean architectural semi-arch ribbon spanning X in [-width/2, width/2]."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    rx_out = width * 0.5
    rz_out = height
    rx_in = max(0.2, rx_out - thickness)
    rz_in = max(0.2, rz_out - thickness)
    hy = depth * 0.5

    rings = []
    for i in range(segments + 1):
        ang = math.pi * (i / segments)
        ca, sa = math.cos(ang), math.sin(ang)
        v_fo = bm.verts.new((rx_out * ca, center_y - hy, rz_out * sa))
        v_bo = bm.verts.new((rx_out * ca, center_y + hy, rz_out * sa))
        v_bi = bm.verts.new((rx_in * ca, center_y + hy, rz_in * sa))
        v_fi = bm.verts.new((rx_in * ca, center_y - hy, rz_in * sa))
        rings.append((v_fo, v_bo, v_bi, v_fi))

    for i in range(segments):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            bm.faces.new((r0[k], r1[k], r1[kn], r0[kn]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def add_curved_wall(col, name, cx, cy, r_in, r_out, z0, z1, a0_deg, a1_deg, mat, segs=22):
    """Creates a curved architectural wall or desk arc."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for i in range(segs + 1):
        ang = math.radians(a0_deg + (a1_deg - a0_deg) * (i / segs))
        ca, sa = math.cos(ang), math.sin(ang)
        v0 = bm.verts.new((cx + r_out * ca, cy + r_out * sa, z0))
        v1 = bm.verts.new((cx + r_out * ca, cy + r_out * sa, z1))
        v2 = bm.verts.new((cx + r_in * ca, cy + r_in * sa, z1))
        v3 = bm.verts.new((cx + r_in * ca, cy + r_in * sa, z0))
        rings.append((v0, v1, v2, v3))
    for i in range(segs):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            bm.faces.new((r0[k], r1[k], r1[kn], r0[kn]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def add_modern_chair(col, prefix, loc, rot_z, seat_mat, frame_mat):
    cx, cy, cz = loc
    add_box(col, f"{prefix}_seat", (cx, cy, cz + 0.44), (0.44, 0.42, 0.06), seat_mat, rot=(0, 0, rot_z), bevel=0.02)
    bx = cx + math.sin(rot_z) * 0.19
    by = cy - math.cos(rot_z) * 0.19
    add_box(col, f"{prefix}_back", (bx, by, cz + 0.68), (0.44, 0.055, 0.42), seat_mat, rot=(0, 0, rot_z), bevel=0.02)
    for dx in (-0.17, 0.17):
        for dy in (-0.16, 0.16):
            lx = cx + dx * math.cos(rot_z) - dy * math.sin(rot_z)
            ly = cy + dx * math.sin(rot_z) + dy * math.cos(rot_z)
            add_cyl(col, f"{prefix}_leg", (lx, ly, cz + 0.22), 0.018, 0.44, frame_mat, verts=8, bevel=0)


def add_bar_stool(col, prefix, loc, seat_mat, frame_mat):
    cx, cy, cz = loc
    add_cyl(col, f"{prefix}_base", (cx, cy, cz + 0.02), 0.18, 0.04, frame_mat, verts=16, bevel=0.005)
    add_cyl(col, f"{prefix}_stem", (cx, cy, cz + 0.34), 0.028, 0.62, frame_mat, verts=12, bevel=0)
    add_cyl(col, f"{prefix}_ring", (cx, cy, cz + 0.22), 0.13, 0.018, frame_mat, verts=16, bevel=0)
    add_cyl(col, f"{prefix}_seat", (cx, cy, cz + 0.67), 0.19, 0.07, seat_mat, verts=18, bevel=0.02)


def add_spotlight_fixture(col, prefix, loc, mat_body, mat_glow, rot=(0, 0, 0)):
    add_cyl(col, f"{prefix}_can", loc, 0.06, 0.15, mat_body, verts=12, rot=rot, bevel=0.01)
    add_cyl(col, f"{prefix}_lens", (loc[0], loc[1], loc[2] - 0.075), 0.048, 0.018, mat_glow, verts=12, bevel=0)


def add_base_plinth(col, floor_mat, trim_mat, glow_mat=None):
    """Standard 6.6m x 4.8m chamfered exhibition deck + front entry step."""
    add_box(col, "Deck_Sub", (0, 0, 0.05), (6.72, 4.92, 0.10), trim_mat, bevel=0.04)
    add_box(col, "Deck_Floor", (0, 0, 0.13), (6.52, 4.72, 0.08), floor_mat, bevel=0.03)
    add_box(col, "Entry_Step", (0, -2.56, 0.04), (3.40, 0.34, 0.08), trim_mat, bevel=0.02)
    if glow_mat is not None:
        add_box(col, "Deck_EdgeGlow", (0, -2.37, 0.095), (6.30, 0.03, 0.025), glow_mat, bevel=0)


def merge_by_material_and_export(col, glb_path):
    """Groups meshes by material name for minimal draw calls and exports GLB."""
    by_mat = {}
    for obj in list(col.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        mname = obj.data.materials[0].name
        by_mat.setdefault(mname, []).append(obj)

    merged_objs = []
    for mname, objs in by_mat.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        active = bpy.context.active_object
        active.name = f"MatGroup_{mname}"
        merged_objs.append(active)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
    )

    total_tris = 0
    for o in merged_objs:
        me = o.data
        me.calc_loop_triangles()
        total_tris += len(me.loop_triangles)
    size_kb = round(os.path.getsize(glb_path) / 1024.0, 1)
    return {
        "file": os.path.basename(glb_path),
        "sizeKb": size_kb,
        "meshes": len(merged_objs),
        "triangles": total_tris,
    }


# ============================================================================
# BOOTH 01 — SIGNATURE RING (Luxury Circular Showroom)
# Floor plan: HERO circular tiered island DEAD-CENTER, curved oak reception
# desk tucked on the RIGHT side, curved rear-left shelving arc, rear-left VIP
# banquette + marble table. NO front horizontal counter!
# ============================================================================
def build_booth_01():
    clear_scene()
    col = bpy.data.collections.new("Booth01_SignatureRing")
    bpy.context.scene.collection.children.link(col)

    m_walnut = make_mat("WalnutFloor", (0.28, 0.21, 0.15, 1.0), metallic=0.0, roughness=0.52)
    m_plaster = make_mat("WarmPlaster", (0.93, 0.91, 0.87, 1.0), metallic=0.0, roughness=0.72)
    m_travertine = make_mat("TravertineStone", (0.86, 0.82, 0.75, 1.0), metallic=0.0, roughness=0.58)
    m_brass = make_mat("ChampagneBrass", (0.76, 0.62, 0.38, 1.0), metallic=0.82, roughness=0.26)
    m_oak = make_mat("FlutedOak", (0.62, 0.45, 0.29, 1.0), metallic=0.0, roughness=0.54)
    m_boucle = make_mat("CreamBoucle", (0.91, 0.88, 0.83, 1.0), metallic=0.0, roughness=0.88)
    m_dark_bronze = make_mat("DarkBronze", (0.18, 0.15, 0.13, 1.0), metallic=0.72, roughness=0.34)
    m_warm_led = make_mat("WarmCoveLED", (1.0, 0.90, 0.70, 1.0), emission=(1.0, 0.88, 0.66, 1.0), emission_strength=2.2)

    add_base_plinth(col, m_walnut, m_dark_bronze, m_warm_led)

    # Open architectural bronze corner columns + slim top lintel + signature overhead ring
    for sx in (-2.95, 2.95):
        for sy in (-2.05, 1.95):
            add_cyl(col, f"Col_{sx}_{sy}", (sx, sy, 1.92), 0.085, 3.52, m_dark_bronze, verts=16, bevel=0.01)
            add_cyl(col, f"ColBase_{sx}_{sy}", (sx, sy, 0.22), 0.13, 0.12, m_brass, verts=16, bevel=0.01)

    # Slim perimeter lintel (NO bulky white box blocking the ring!)
    add_box(col, "SlimFrontBeam", (0, -2.05, 3.64), (6.12, 0.18, 0.14), m_dark_bronze, bevel=0.02)
    add_box(col, "SlimFrontTrim", (0, -2.14, 3.64), (5.80, 0.03, 0.05), m_brass, bevel=0)
    add_box(col, "SlimBackBeam", (0, 1.95, 3.64), (6.12, 0.18, 0.14), m_dark_bronze, bevel=0.02)
    for sx in (-2.95, 2.95):
        add_box(col, f"SideBeam_{sx}", (sx, -0.05, 3.64), (0.16, 4.18, 0.14), m_dark_bronze, bevel=0.02)

    # Signature Floating Circular Crown Ring (visible & unobstructed!)
    add_curved_wall(col, "CrownRing_Outer", 0, -0.10, 1.55, 1.76, 3.54, 3.96, 0, 360, m_plaster, segs=40)
    add_curved_wall(col, "CrownRing_Trim", 0, -0.10, 1.53, 1.78, 3.50, 3.55, 0, 360, m_brass, segs=40)
    add_curved_wall(col, "CrownRing_LED", 0, -0.10, 1.57, 1.72, 3.51, 3.53, 0, 360, m_warm_led, segs=32)

    # Curved architectural feature wall wrapping the rear-left arc (replaces flat back wall)
    add_curved_wall(col, "RearCurvedWall", -0.35, -0.35, 2.25, 2.46, 0.17, 3.25, 30, 148, m_plaster, segs=28)
    add_curved_wall(col, "RearCurvedBase", -0.35, -0.35, 2.21, 2.48, 0.17, 0.28, 30, 148, m_brass, segs=28)
    # Curved floating oak shelves inside the rear-left arc
    for sz in (1.15, 1.85, 2.50):
        add_curved_wall(col, f"ArcShelf_{sz}", -0.35, -0.35, 1.92, 2.26, sz, sz + 0.055, 92, 142, m_oak, segs=16)
        add_curved_wall(col, f"ArcLED_{sz}", -0.35, -0.35, 2.18, 2.24, sz - 0.015, sz, 94, 140, m_warm_led, segs=14)

    # HERO CIRCULAR TIERED ISLAND DEAD-CENTER (x = 0.0, Three.js z = 0.15 => Blender y = -0.15)
    add_cyl(col, "CenterRug", (0.0, -0.15, 0.175), 1.55, 0.015, m_travertine, verts=36, bevel=0.005)
    add_cyl(col, "HeroIsland_Base", (0.0, -0.15, 0.24), 0.96, 0.14, m_dark_bronze, verts=32, bevel=0.015)
    add_cyl(col, "HeroIsland_Glow", (0.0, -0.15, 0.32), 0.92, 0.025, m_warm_led, verts=32, bevel=0)
    add_cyl(col, "HeroIsland_Core", (0.0, -0.15, 0.62), 0.84, 0.62, m_travertine, verts=32, bevel=0.02)
    add_cyl(col, "HeroIsland_Top", (0.0, -0.15, 0.95), 0.88, 0.05, m_brass, verts=32, bevel=0.01)
    # Secondary satellite circular pedestal (front-left of island: x = -1.25, Blender y = -0.85 => Three z = +0.85)
    add_cyl(col, "SatPed_L_Base", (-1.25, -0.85, 0.22), 0.44, 0.10, m_dark_bronze, verts=24, bevel=0.01)
    add_cyl(col, "SatPed_L_Body", (-1.25, -0.85, 0.56), 0.38, 0.62, m_plaster, verts=24, bevel=0.015)
    add_cyl(col, "SatPed_L_Top", (-1.25, -0.85, 0.89), 0.41, 0.04, m_brass, verts=24, bevel=0.01)
    # Tertiary taller pedestal (back-right of island: x = 1.15, Blender y = 0.95 => Three z = -0.95)
    add_cyl(col, "SatPed_R_Base", (1.15, 0.95, 0.22), 0.42, 0.10, m_dark_bronze, verts=24, bevel=0.01)
    add_cyl(col, "SatPed_R_Body", (1.15, 0.95, 0.66), 0.36, 0.82, m_travertine, verts=24, bevel=0.015)
    add_cyl(col, "SatPed_R_Top", (1.15, 0.95, 1.09), 0.39, 0.04, m_brass, verts=24, bevel=0.01)

    # CURVED OAK RECEPTION DESK TUCKED ON THE RIGHT SIDE (x ≈ +2.05, Blender y ≈ -0.65 => Three z = +0.65)
    add_curved_wall(col, "RightDesk_Base", 1.15, -0.65, 0.72, 1.24, 0.17, 0.26, -50, 48, m_dark_bronze, segs=18)
    add_curved_wall(col, "RightDesk_Body", 1.15, -0.65, 0.74, 1.22, 0.26, 0.96, -50, 48, m_plaster, segs=18)
    add_curved_wall(col, "RightDesk_Top", 1.15, -0.65, 0.70, 1.27, 0.96, 1.03, -52, 50, m_oak, segs=18)
    # Fluted oak ribs on desk front
    for ang_deg in range(-44, 46, 9):
        ang = math.radians(ang_deg)
        rx = 1.15 + 1.23 * math.cos(ang)
        ry = -0.65 + 1.23 * math.sin(ang)
        add_cyl(col, f"DeskRib_{ang_deg}", (rx, ry, 0.61), 0.022, 0.68, m_oak, verts=8, bevel=0)

    # VIP CONSULTATION NOOK BACK-LEFT (x = -1.95, Blender y = 0.75 => Three z = -0.75)
    add_cyl(col, "VipTable_Base", (-1.95, 0.65, 0.20), 0.24, 0.06, m_brass, verts=18, bevel=0.01)
    add_cyl(col, "VipTable_Stem", (-1.95, 0.65, 0.48), 0.04, 0.52, m_dark_bronze, verts=12, bevel=0)
    add_cyl(col, "VipTable_Top", (-1.95, 0.65, 0.75), 0.48, 0.045, m_travertine, verts=24, bevel=0.012)
    add_modern_chair(col, "VipChair1", (-2.42, 0.35, 0.17), math.radians(-52), m_boucle, m_brass)
    add_modern_chair(col, "VipChair2", (-1.65, 1.20, 0.17), math.radians(150), m_boucle, m_brass)

    # Overhead warm gallery spotlights suspended from crown ring
    for ang_deg in (30, 110, 210, 310):
        ang = math.radians(ang_deg)
        add_spotlight_fixture(col, f"Spot_{ang_deg}", (1.62 * math.cos(ang), -0.10 + 1.62 * math.sin(ang), 3.44), m_dark_bronze, m_warm_led)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_01_signature_ring_v27_4.glb"))


# ============================================================================
# BOOTH 02 — ORGANIC FLOW (Immersive Creative Gallery)
# Floor plan: Sweeping S-curve sculptural partition wall, far-left small oval
# host desk, off-axis sculptural pill pedestals, organic right-side recessed
# shelving niche, front-right soft pastel lounge sofa + sculptural coffee table.
# NO bulky front fascia box — pastel concentric arches fully open!
# ============================================================================
def build_booth_02():
    clear_scene()
    col = bpy.data.collections.new("Booth02_OrganicFlow")
    bpy.context.scene.collection.children.link(col)

    m_terrazzo = make_mat("TerrazzoFloor", (0.44, 0.42, 0.45, 1.0), metallic=0.0, roughness=0.46)
    m_blush = make_mat("BlushPlaster", (0.94, 0.84, 0.87, 1.0), metallic=0.0, roughness=0.68)
    m_ivory = make_mat("GalleryIvory", (0.96, 0.95, 0.94, 1.0), metallic=0.0, roughness=0.62)
    m_plum = make_mat("DeepPlumAccent", (0.34, 0.16, 0.34, 1.0), metallic=0.15, roughness=0.42)
    m_rosegold = make_mat("RoseGoldTrim", (0.82, 0.62, 0.56, 1.0), metallic=0.78, roughness=0.25)
    m_soft_velvet = make_mat("BlushVelvet", (0.86, 0.64, 0.72, 1.0), metallic=0.0, roughness=0.86)
    m_glow = make_mat("SoftGalleryGlow", (1.0, 0.92, 0.95, 1.0), emission=(1.0, 0.90, 0.94, 1.0), emission_strength=2.0)

    add_base_plinth(col, m_terrazzo, m_ivory, m_glow)

    # Three sweeping sculptural concentric arches (COMPLETELY UNOBSTRUCTED!)
    add_arch_ribbon(col, "Arch_Front", -1.95, 6.24, 3.62, 0.34, 0.34, m_blush, segments=32)
    add_arch_ribbon(col, "Arch_Mid", -0.55, 5.96, 3.82, 0.28, 0.26, m_ivory, segments=32)
    add_arch_ribbon(col, "Arch_Rear", 1.35, 5.74, 3.55, 0.30, 0.28, m_blush, segments=32)
    # Subtle rose-gold spine bar along top apex for floating signage mounting
    add_box(col, "ApexSignBar", (0, -1.95, 3.74), (3.95, 0.08, 0.06), m_rosegold, bevel=0.01)

    # Sweeping S-curve sculptural gallery partition wall (off-axis flow!)
    add_curved_wall(col, "SCurve_Left", -1.35, 0.35, 1.35, 1.54, 0.17, 2.95, 35, 145, m_ivory, segs=22)
    add_curved_wall(col, "SCurve_Right", 1.25, 0.55, 1.25, 1.44, 0.17, 2.75, 15, 125, m_blush, segs=22)
    add_curved_wall(col, "SCurve_Glow", -1.35, 0.35, 1.32, 1.36, 0.20, 0.26, 40, 140, m_glow, segs=18)

    # Organic recessed curved niche shelves on right wing
    for sz in (0.95, 1.62, 2.25):
        add_curved_wall(col, f"OrgShelf_{sz}", 1.25, 0.55, 0.98, 1.26, sz, sz + 0.045, 22, 82, m_rosegold, segs=14)

    # FAR-LEFT SMALL OVAL HOST DESK (x = -2.05, Blender y = -0.65 => Three z = +0.65)
    add_cyl(col, "OvalDesk_Body", (-2.05, -0.65, 0.56), 0.52, 0.78, m_blush, verts=24, bevel=0.03)
    add_cyl(col, "OvalDesk_Top", (-2.05, -0.65, 0.97), 0.56, 0.05, m_ivory, verts=24, bevel=0.015)
    add_cyl(col, "OvalDesk_Trim", (-2.05, -0.65, 0.21), 0.54, 0.06, m_rosegold, verts=24, bevel=0.01)

    # OFF-AXIS SCULPTURAL PILL PEDESTALS following the organic S-curve
    # Pill 1 (Center-left hero: x = -0.45, Blender y = -0.35 => Three z = +0.35, top y = 0.94)
    add_box(col, "Pill1_Base", (-0.45, -0.35, 0.21), (0.96, 0.56, 0.08), m_plum, rot=(0, 0, math.radians(16)), bevel=0.03)
    add_box(col, "Pill1_Body", (-0.45, -0.35, 0.58), (0.90, 0.50, 0.68), m_ivory, rot=(0, 0, math.radians(16)), bevel=0.14)
    add_box(col, "Pill1_Top", (-0.45, -0.35, 0.94), (0.92, 0.52, 0.04), m_rosegold, rot=(0, 0, math.radians(16)), bevel=0.015)
    # Pill 2 (Rear-right elevated: x = 0.92, Blender y = 0.65 => Three z = -0.65, top y = 1.08)
    add_cyl(col, "Pill2_Base", (0.92, 0.65, 0.21), 0.44, 0.08, m_plum, verts=24, bevel=0.01)
    add_cyl(col, "Pill2_Body", (0.92, 0.65, 0.64), 0.38, 0.80, m_blush, verts=24, bevel=0.02)
    add_cyl(col, "Pill2_Top", (0.92, 0.65, 1.06), 0.41, 0.04, m_ivory, verts=24, bevel=0.01)
    # Pill 3 (Low sculptural accent: x = -1.15, Blender y = 0.72 => Three z = -0.72, top y = 0.82)
    add_cyl(col, "Pill3_Body", (-1.15, 0.72, 0.48), 0.34, 0.62, m_ivory, verts=24, bevel=0.02)
    add_cyl(col, "Pill3_Top", (-1.15, 0.72, 0.80), 0.36, 0.04, m_rosegold, verts=24, bevel=0.01)

    # FRONT-RIGHT SOFT PASTEL LOUNGE SOFA + SCULPTURAL COFFEE TABLE (x = 1.75, Blender y = -0.85 => Three z = +0.85)
    add_curved_wall(col, "LoungeSofa_Seat", 1.15, -0.55, 0.58, 1.08, 0.19, 0.52, -75, 15, m_soft_velvet, segs=16)
    add_curved_wall(col, "LoungeSofa_Back", 1.15, -0.55, 0.96, 1.12, 0.52, 0.88, -75, 15, m_soft_velvet, segs=16)
    add_cyl(col, "CoffeeTable_Base", (1.35, -0.95, 0.30), 0.22, 0.26, m_plum, verts=18, bevel=0.02)
    add_cyl(col, "CoffeeTable_Top", (1.35, -0.95, 0.45), 0.36, 0.04, m_ivory, verts=22, bevel=0.015)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_02_organic_flow_v27_4.glb"))


# ============================================================================
# BOOTH 03 — GRAND PORTAL (Modular Digital Experience)
# Floor plan: Front-left L-shaped modular tech counter, center-right stepped
# demo island, rear-right freestanding digital kiosk, vertical illuminated
# tech-blade shelving towers, rear-left compact glass consultation pod.
# ============================================================================
def build_booth_03():
    clear_scene()
    col = bpy.data.collections.new("Booth03_GrandPortal")
    bpy.context.scene.collection.children.link(col)

    m_slate = make_mat("DarkSlateFloor", (0.20, 0.23, 0.28, 1.0), metallic=0.12, roughness=0.42)
    m_navy = make_mat("DeepPortalNavy", (0.11, 0.21, 0.36, 1.0), metallic=0.38, roughness=0.32)
    m_titanium = make_mat("BrushedTitanium", (0.78, 0.82, 0.86, 1.0), metallic=0.76, roughness=0.26)
    m_white = make_mat("TechMatteWhite", (0.93, 0.95, 0.97, 1.0), metallic=0.05, roughness=0.40)
    m_glass = make_mat("SmokedTechGlass", (0.14, 0.22, 0.30, 1.0), metallic=0.55, roughness=0.14)
    m_cyan = make_mat("LinearCyanLED", (0.35, 0.84, 1.0, 1.0), emission=(0.30, 0.80, 1.0, 1.0), emission_strength=2.2)

    add_base_plinth(col, m_slate, m_navy, m_cyan)

    # Architectural Portal Frame with SLIM top header (0.42m instead of 0.85m!)
    for sx in (-2.92, 2.92):
        add_box(col, f"PortalPillar_{sx}", (sx, -1.92, 1.88), (0.46, 0.50, 3.42), m_navy, bevel=0.03)
        add_box(col, f"PortalLight_{sx}", (sx * 0.91, -1.92, 1.88), (0.03, 0.04, 3.24), m_cyan, bevel=0)
    add_box(col, "PortalSlimHeader", (0, -1.92, 3.58), (6.36, 0.46, 0.44), m_navy, bevel=0.03)
    add_box(col, "PortalHeaderTrim", (0, -2.16, 3.38), (5.92, 0.03, 0.03), m_cyan, bevel=0)

    # Rear architectural media frame + vertical illuminated tech-blade shelving towers
    add_box(col, "RearWallPanel", (0, 2.02, 1.72), (5.92, 0.22, 3.12), m_white, bevel=0.02)
    add_box(col, "RearMediaBezel", (-0.35, 1.88, 1.85), (2.70, 0.10, 1.82), m_navy, bevel=0.02)
    add_box(col, "RearMediaScreen", (-0.35, 1.82, 1.85), (2.54, 0.04, 1.66), m_glass, bevel=0)

    # Vertical Tech-Blade Towers flanking rear wall
    for sx in (-2.38, 1.55):
        add_box(col, f"BladeBack_{sx}", (sx, 1.76, 1.68), (0.98, 0.14, 2.92), m_navy, bevel=0.02)
        add_box(col, f"BladeLED_{sx}", (sx - 0.46, 1.68, 1.68), (0.025, 0.03, 2.74), m_cyan, bevel=0)
        for sz in (0.95, 1.55, 2.15):
            add_box(col, f"BladeShelf_{sx}_{sz}", (sx, 1.52, sz), (0.88, 0.42, 0.04), m_titanium, bevel=0.01)

    # FRONT-LEFT L-SHAPED MODULAR DEMO COUNTER (x = -1.65, Blender y = -0.62 => Three z = +0.62)
    add_box(col, "LCounter_Front", (-1.52, -0.82, 0.56), (1.76, 0.58, 0.78), m_navy, bevel=0.025)
    add_box(col, "LCounter_FrontInlay", (-1.52, -1.12, 0.58), (1.50, 0.04, 0.52), m_white, bevel=0.01)
    add_box(col, "LCounter_Return", (-2.16, -0.05, 0.56), (0.56, 1.18, 0.78), m_navy, bevel=0.025)
    add_box(col, "LCounter_TopA", (-1.52, -0.82, 0.98), (1.82, 0.64, 0.06), m_white, bevel=0.015)
    add_box(col, "LCounter_TopB", (-2.16, -0.05, 0.98), (0.62, 1.24, 0.06), m_white, bevel=0.015)
    add_box(col, "LCounter_LED", (-1.52, -1.13, 0.94), (1.68, 0.025, 0.025), m_cyan, bevel=0)

    # CENTER-RIGHT STEPPED DEMO ISLAND (x = 0.55, Blender y = -0.58 => Three z = +0.58, top y = 0.98)
    add_box(col, "DemoIsland_Base", (0.55, -0.58, 0.22), (1.06, 0.82, 0.10), m_navy, bevel=0.02)
    add_box(col, "DemoIsland_Body", (0.55, -0.58, 0.60), (0.86, 0.66, 0.68), m_white, bevel=0.02)
    add_box(col, "DemoIsland_Top", (0.55, -0.58, 0.96), (0.94, 0.72, 0.05), m_titanium, bevel=0.012)
    add_box(col, "DemoIsland_LED", (0.55, -0.92, 0.28), (0.84, 0.025, 0.025), m_cyan, bevel=0)

    # REAR-RIGHT FREESTANDING INTERACTIVE KIOSK TOTEM (x = 2.05, Blender y = 0.45 => Three z = -0.45)
    add_box(col, "Kiosk_Foot", (2.05, 0.45, 0.21), (0.76, 0.52, 0.08), m_navy, rot=(0, 0, math.radians(-22)), bevel=0.015)
    add_box(col, "Kiosk_Body", (2.05, 0.45, 1.18), (0.62, 0.16, 1.88), m_navy, rot=(0, 0, math.radians(-22)), bevel=0.02)
    add_box(col, "Kiosk_Screen", (1.98, 0.38, 1.36), (0.50, 0.04, 0.96), m_glass, rot=(0, 0, math.radians(-22)), bevel=0)

    # REAR-LEFT COMPACT GLASS CONSULTATION POD (x = -1.75, Blender y = 1.05 => Three z = -1.05)
    add_box(col, "TechTable_Leg", (-1.75, 0.98, 0.46), (0.14, 0.14, 0.58), m_navy, bevel=0.01)
    add_box(col, "TechTable_Top", (-1.75, 0.98, 0.77), (0.96, 0.68, 0.045), m_white, bevel=0.012)
    add_modern_chair(col, "TechChair1", (-2.38, 0.98, 0.17), math.radians(-90), m_navy, m_titanium)
    add_modern_chair(col, "TechChair2", (-1.12, 0.98, 0.17), math.radians(90), m_navy, m_titanium)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_03_grand_portal_v27_4.glb"))


# ============================================================================
# BOOTH 04 — WAVE PAVILION (Open Interactive Showcase)
# Floor plan: Depthwise sweeping wave demo bar running along the RIGHT wall,
# completely open central walk-in zone, left-center 3-pedestal organic cluster,
# rear-left angled freestanding promo screen, tucked bar stools on right.
# ============================================================================
def build_booth_04():
    clear_scene()
    col = bpy.data.collections.new("Booth04_WavePavilion")
    bpy.context.scene.collection.children.link(col)

    m_maple = make_mat("WarmMapleFloor", (0.78, 0.62, 0.42, 1.0), metallic=0.0, roughness=0.48)
    m_terracotta = make_mat("TerracottaWave", (0.84, 0.52, 0.24, 1.0), metallic=0.08, roughness=0.44)
    m_cream = make_mat("PavilionCream", (0.96, 0.94, 0.90, 1.0), metallic=0.0, roughness=0.58)
    m_emerald = make_mat("DeepTealAccent", (0.09, 0.36, 0.34, 1.0), metallic=0.18, roughness=0.38)
    m_brushed = make_mat("WarmSteel", (0.68, 0.66, 0.62, 1.0), metallic=0.72, roughness=0.28)
    m_warm_led = make_mat("WaveWarmLED", (1.0, 0.93, 0.78, 1.0), emission=(1.0, 0.90, 0.72, 1.0), emission_strength=2.0)

    add_base_plinth(col, m_maple, m_emerald, m_warm_led)

    # Open Asymmetric Wave Canopy & Structural Columns (LEFT thick wave fin + RIGHT slender column)
    add_box(col, "LeftWaveFin", (-2.92, -0.25, 1.92), (0.36, 3.85, 3.50), m_terracotta, bevel=0.04)
    add_box(col, "LeftWaveInset", (-2.72, -0.25, 1.85), (0.06, 3.30, 3.10), m_cream, bevel=0.02)
    add_cyl(col, "RightColFront", (2.92, -1.95, 1.92), 0.10, 3.50, m_brushed, verts=16, bevel=0.01)
    add_cyl(col, "RightColRear", (2.92, 1.85, 1.92), 0.10, 3.50, m_brushed, verts=16, bevel=0.01)

    # Sculpted wave roof ribs (slim front beam leaves canopy wave clearly visible!)
    add_box(col, "SlimWaveFront", (-0.55, -1.95, 3.56), (4.65, 0.26, 0.34), m_cream, bevel=0.03)
    add_box(col, "WaveCapTop", (0, -1.95, 3.76), (6.15, 0.32, 0.12), m_terracotta, bevel=0.03)
    for i, ry in enumerate((-1.15, -0.20, 0.75, 1.65)):
        dz = math.sin(i * 0.9) * 0.18
        add_box(col, f"WaveRib_{i}", (0.0, ry, 3.62 + dz), (5.92, 0.14, 0.14), m_terracotta, rot=(0, math.radians(-3.5 + i * 2.2), 0), bevel=0.02)

    # Open airy rear feature wall with integrated display bay
    add_box(col, "RearWallCenter", (0.20, 2.02, 1.72), (5.20, 0.20, 3.12), m_cream, bevel=0.02)
    add_box(col, "RearAccentStrip", (0.20, 1.90, 2.95), (4.60, 0.06, 0.18), m_terracotta, bevel=0.01)

    # DEPTHWISE SWEEPING WAVE DEMO BAR ALONG THE RIGHT SIDE (x = +1.92, y from -1.05 to +1.15)
    add_box(col, "RightWaveBar_Base", (1.92, 0.05, 0.22), (0.72, 2.38, 0.10), m_emerald, bevel=0.02)
    add_box(col, "RightWaveBar_Body", (1.92, 0.05, 0.60), (0.66, 2.30, 0.68), m_terracotta, bevel=0.04)
    add_box(col, "RightWaveBar_Top", (1.92, 0.05, 0.98), (0.76, 2.42, 0.07), m_cream, bevel=0.02)
    add_box(col, "RightWaveBar_LED", (1.56, 0.05, 0.93), (0.025, 2.24, 0.025), m_warm_led, bevel=0)
    # 2 Tucked Bar Stools on the inner side of the right wave bar
    add_bar_stool(col, "WaveStool1", (1.28, -0.45, 0.17), m_emerald, m_brushed)
    add_bar_stool(col, "WaveStool2", (1.28, 0.55, 0.17), m_emerald, m_brushed)

    # LEFT-CENTER ORGANIC 3-PEDESTAL CLUSTER (open central walk-in experience!)
    # Pedestal A (Hero front-left: x = -0.92, Blender y = -0.58 => Three z = +0.58, top y = 0.98)
    add_cyl(col, "ClusterA_Base", (-0.92, -0.58, 0.21), 0.48, 0.08, m_emerald, verts=24, bevel=0.01)
    add_cyl(col, "ClusterA_Body", (-0.92, -0.58, 0.59), 0.42, 0.70, m_terracotta, verts=24, bevel=0.02)
    add_cyl(col, "ClusterA_Top", (-0.92, -0.58, 0.96), 0.45, 0.04, m_cream, verts=24, bevel=0.01)
    # Pedestal B (Mid-left taller: x = -0.18, Blender y = 0.35 => Three z = -0.35, top y = 1.08)
    add_cyl(col, "ClusterB_Base", (-0.18, 0.35, 0.21), 0.42, 0.08, m_emerald, verts=24, bevel=0.01)
    add_cyl(col, "ClusterB_Body", (-0.18, 0.35, 0.64), 0.37, 0.80, m_cream, verts=24, bevel=0.02)
    add_cyl(col, "ClusterB_Top", (-0.18, 0.35, 1.06), 0.40, 0.04, m_terracotta, verts=24, bevel=0.01)
    # Pedestal C (Low companion: x = -1.62, Blender y = -0.12 => Three z = +0.12, top y = 0.78)
    add_cyl(col, "ClusterC_Body", (-1.62, -0.12, 0.46), 0.32, 0.58, m_cream, verts=22, bevel=0.015)
    add_cyl(col, "ClusterC_Top", (-1.62, -0.12, 0.76), 0.35, 0.04, m_emerald, verts=22, bevel=0.01)

    # REAR-LEFT ANGLED FREESTANDING PROMO SCREEN (x = -1.92, Blender y = 1.15 => Three z = -1.15)
    add_box(col, "PromoScreen_Base", (-1.92, 1.15, 0.21), (0.82, 0.42, 0.08), m_emerald, rot=(0, 0, math.radians(28)), bevel=0.015)
    add_box(col, "PromoScreen_Frame", (-1.92, 1.15, 1.24), (0.72, 0.12, 1.98), m_cream, rot=(0, 0, math.radians(28)), bevel=0.02)
    add_box(col, "PromoScreen_Glass", (-1.88, 1.09, 1.38), (0.58, 0.03, 1.15), m_emerald, rot=(0, 0, math.radians(28)), bevel=0)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_04_wave_pavilion_v27_4.glb"))


# ============================================================================
# BOOTH 05 — GALLERY ARCH (Boutique Architectural Gallery)
# Floor plan: Deep recessed architectural gallery arches along rear & left,
# LOW elongated walnut+stone central exhibition island, rear-right tucked
# boutique desk, front-left warm bistro consultation nook, gallery spotlights.
# NO bulky front fascia box — teal gallery arch completely open!
# ============================================================================
def build_booth_05():
    clear_scene()
    col = bpy.data.collections.new("Booth05_GalleryArch")
    bpy.context.scene.collection.children.link(col)

    m_oakfloor = make_mat("SmokedOakFloor", (0.34, 0.27, 0.21, 1.0), metallic=0.0, roughness=0.50)
    m_teal = make_mat("ArchitecturalTeal", (0.14, 0.46, 0.45, 1.0), metallic=0.08, roughness=0.46)
    m_limestone = make_mat("LimestonePlaster", (0.93, 0.91, 0.87, 1.0), metallic=0.0, roughness=0.66)
    m_sandstone = make_mat("NaturalSandstone", (0.82, 0.76, 0.66, 1.0), metallic=0.0, roughness=0.58)
    m_bronze = make_mat("GalleryBronze", (0.48, 0.36, 0.22, 1.0), metallic=0.76, roughness=0.30)
    m_linen = make_mat("WarmLinen", (0.88, 0.84, 0.77, 1.0), metallic=0.0, roughness=0.86)
    m_spot = make_mat("GallerySpotGlow", (1.0, 0.92, 0.76, 1.0), emission=(1.0, 0.90, 0.72, 1.0), emission_strength=2.2)

    add_base_plinth(col, m_oakfloor, m_teal, m_spot)

    # Grand Open Teal Gallery Arch Portal (NO heavy box covering it!)
    add_arch_ribbon(col, "FrontGalleryArch", -1.96, 6.26, 3.68, 0.36, 0.34, m_teal, segments=32)
    add_arch_ribbon(col, "FrontArchTrim", -2.14, 6.08, 3.58, 0.04, 0.06, m_bronze, segments=32)
    # Slender bronze sign suspension bar high at top
    add_box(col, "GallerySignBar", (0, -1.98, 3.74), (4.10, 0.08, 0.07), m_bronze, bevel=0.01)

    # Deep Side Colonnade Arches on Left Wall (x = -2.85)
    for ay in (-1.05, 0.45):
        add_box(col, f"LeftPilaster_{ay}", (-2.88, ay - 0.65, 1.62), (0.28, 0.26, 2.90), m_limestone, bevel=0.02)
        add_box(col, f"LeftPilBase_{ay}", (-2.88, ay - 0.65, 0.28), (0.36, 0.34, 0.22), m_sandstone, bevel=0.015)
    add_box(col, "LeftArchHeader", (-2.88, -0.05, 3.12), (0.30, 3.95, 0.22), m_teal, bevel=0.02)

    # Deep Rear Wall with 3 Architectural Arched Niches & Heavy Plinth Bases
    add_box(col, "RearGalleryWall", (0, 2.02, 1.72), (6.02, 0.28, 3.12), m_limestone, bevel=0.02)
    for nx in (-1.92, 0.0, 1.92):
        add_box(col, f"NicheBack_{nx}", (nx, 1.86, 1.62), (1.32, 0.08, 2.48), m_teal, bevel=0.01)
        add_box(col, f"NichePlinth_{nx}", (nx, 1.68, 0.46), (1.30, 0.42, 0.58), m_sandstone, bevel=0.02)
        add_box(col, f"NicheShelf_{nx}", (nx, 1.72, 1.48), (1.22, 0.30, 0.04), m_bronze, bevel=0.008)
        add_spotlight_fixture(col, f"NicheSpot_{nx}", (nx, 1.64, 2.86), m_bronze, m_spot)

    # LOW ELONGATED STONE & WALNUT CENTRAL EXHIBITION ISLAND (x = -0.10, Blender y = 0.05 => Three z = -0.05)
    add_box(col, "Island_SubBase", (-0.10, 0.05, 0.21), (2.36, 0.88, 0.08), m_teal, bevel=0.02)
    add_box(col, "Island_MainBody", (-0.10, 0.05, 0.48), (2.26, 0.78, 0.48), m_limestone, bevel=0.025)
    add_box(col, "Island_StoneSlab", (-0.10, 0.05, 0.74), (2.32, 0.84, 0.05), m_sandstone, bevel=0.015)
    # Multi-height gallery risers on top of the central island
    add_box(col, "Island_RiserL", (-0.72, 0.05, 0.89), (0.64, 0.58, 0.26), m_sandstone, bevel=0.015)
    add_box(col, "Island_RiserR", (0.58, 0.05, 0.83), (0.64, 0.58, 0.14), m_limestone, bevel=0.015)

    # REAR-RIGHT COMPACT BOUTIQUE DESK (x = 1.98, Blender y = 0.68 => Three z = -0.68)
    add_box(col, "BoutiqueDesk_Body", (1.98, 0.68, 0.56), (1.18, 0.56, 0.78), m_teal, rot=(0, 0, math.radians(-24)), bevel=0.03)
    add_box(col, "BoutiqueDesk_Top", (1.98, 0.68, 0.98), (1.26, 0.62, 0.055), m_sandstone, rot=(0, 0, math.radians(-24)), bevel=0.015)

    # FRONT-LEFT WARM BISTRO CONSULTATION NOOK (x = -1.98, Blender y = -0.78 => Three z = +0.78)
    add_cyl(col, "Bistro_Base", (-1.98, -0.78, 0.20), 0.22, 0.05, m_bronze, verts=16, bevel=0.008)
    add_cyl(col, "Bistro_Stem", (-1.98, -0.78, 0.48), 0.035, 0.52, m_bronze, verts=12, bevel=0)
    add_cyl(col, "Bistro_Top", (-1.98, -0.78, 0.75), 0.42, 0.04, m_sandstone, verts=22, bevel=0.01)
    add_modern_chair(col, "BistroChair1", (-2.42, -0.42, 0.17), math.radians(-50), m_linen, m_bronze)
    add_modern_chair(col, "BistroChair2", (-1.78, -1.28, 0.17), math.radians(15), m_linen, m_bronze)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_05_gallery_arch_v27_4.glb"))


# ============================================================================
# BOOTH 06 — DYNAMIC FRAME (Futuristic Modular Lab)
# Floor plan: Asymmetric geometric layout — front-right ANGLED cantilevered
# demo counter, left-side TWIN faceted showcase pods, tall cantilevered
# Digital Monolith, floating frame shelves on right wall, rear-right separated
# minimalist consultation nook with restrained violet edge lighting.
# ============================================================================
def build_booth_06():
    clear_scene()
    col = bpy.data.collections.new("Booth06_DynamicFrame")
    bpy.context.scene.collection.children.link(col)

    m_graphite = make_mat("GraphiteFloor", (0.19, 0.19, 0.22, 1.0), metallic=0.14, roughness=0.40)
    m_charcoal = make_mat("AnodizedCharcoal", (0.24, 0.25, 0.29, 1.0), metallic=0.42, roughness=0.32)
    m_violet = make_mat("DeepVioletMatte", (0.42, 0.28, 0.68, 1.0), metallic=0.22, roughness=0.36)
    m_ice = make_mat("LabMatteIce", (0.91, 0.92, 0.95, 1.0), metallic=0.05, roughness=0.42)
    m_chrome = make_mat("SatinAluminum", (0.76, 0.78, 0.82, 1.0), metallic=0.78, roughness=0.24)
    m_violet_led = make_mat("SubtleVioletLED", (0.68, 0.52, 1.0, 1.0), emission=(0.62, 0.44, 1.0, 1.0), emission_strength=1.9)

    add_base_plinth(col, m_graphite, m_charcoal, m_violet_led)

    # Asymmetric Cantilevered Dynamic Frame with SLIM Header Beam
    add_box(col, "LeftPillar", (-2.92, -1.92, 1.92), (0.34, 0.34, 3.50), m_charcoal, bevel=0.025)
    add_box(col, "RightPillar", (2.92, -1.92, 1.92), (0.34, 0.34, 3.50), m_charcoal, bevel=0.025)
    add_box(col, "DiagStrut_L", (-2.38, -0.35, 1.88), (0.22, 0.26, 3.68), m_violet, rot=(0, math.radians(14), 0), bevel=0.02)
    add_box(col, "SlimDynamicBeam", (0, -1.92, 3.56), (6.28, 0.34, 0.36), m_charcoal, bevel=0.025)
    add_box(col, "CantileverCrown", (0.25, -1.78, 3.82), (6.52, 0.22, 0.14), m_charcoal, rot=(0, math.radians(-2.2), 0), bevel=0.02)
    add_box(col, "BeamVioletLED", (0, -2.10, 3.38), (5.88, 0.025, 0.025), m_violet_led, bevel=0)

    # Asymmetric Rear Wall + Floating Frame Shelves on RIGHT Wall
    add_box(col, "RearSlab_L", (-1.15, 2.02, 1.72), (3.55, 0.22, 3.12), m_charcoal, bevel=0.02)
    add_box(col, "RearSlab_R", (1.85, 2.02, 1.72), (2.25, 0.22, 3.12), m_ice, bevel=0.02)
    # Floating geometric frame shelves on right wall (x = 2.75)
    add_box(col, "RightSideWall", (2.88, 0.25, 1.72), (0.20, 3.45, 3.12), m_ice, bevel=0.02)
    for sz in (1.05, 1.68, 2.30):
        add_box(col, f"FloatShelf_{sz}", (2.56, 0.15, sz), (0.44, 1.62, 0.045), m_charcoal, bevel=0.01)
        add_box(col, f"FloatShelfRim_{sz}", (2.35, 0.15, sz), (0.025, 1.56, 0.02), m_violet_led, bevel=0)

    # FRONT-RIGHT ANGLED CANTILEVERED DEMO COUNTER (x = +1.35, Blender y = -0.78 => Three z = +0.78)
    add_box(col, "DynCounter_Base", (1.35, -0.78, 0.22), (1.72, 0.62, 0.10), m_charcoal, rot=(0, 0, math.radians(-18)), bevel=0.02)
    add_box(col, "DynCounter_Body", (1.35, -0.78, 0.58), (1.66, 0.56, 0.66), m_charcoal, rot=(0, 0, math.radians(-18)), bevel=0.02)
    add_box(col, "DynCounter_Panel", (1.28, -1.04, 0.58), (0.98, 0.06, 0.44), m_violet, rot=(0, 0, math.radians(-18)), bevel=0.015)
    add_box(col, "DynCounter_Top", (1.35, -0.78, 0.96), (1.84, 0.68, 0.07), m_ice, rot=(0, 0, math.radians(-18)), bevel=0.015)

    # TWIN FACETED MODULAR SHOWCASE PODS ON LEFT SIDE
    # Pod 1 (Front-left hero: x = -1.35, Blender y = -0.62 => Three z = +0.62, top y = 0.98)
    add_cyl(col, "FacetPod1_Base", (-1.35, -0.62, 0.22), 0.50, 0.10, m_violet, verts=6, bevel=0.015)
    add_cyl(col, "FacetPod1_Body", (-1.35, -0.62, 0.59), 0.44, 0.68, m_charcoal, verts=6, bevel=0.015)
    add_cyl(col, "FacetPod1_Top", (-1.35, -0.62, 0.96), 0.47, 0.05, m_ice, verts=6, bevel=0.012)
    # Pod 2 (Rear-left elevated: x = -0.62, Blender y = 0.65 => Three z = -0.65, top y = 1.10)
    add_cyl(col, "FacetPod2_Base", (-0.62, 0.65, 0.22), 0.44, 0.10, m_charcoal, verts=6, bevel=0.015)
    add_cyl(col, "FacetPod2_Body", (-0.62, 0.65, 0.66), 0.38, 0.80, m_violet, verts=6, bevel=0.015)
    add_cyl(col, "FacetPod2_Top", (-0.62, 0.65, 1.08), 0.42, 0.05, m_ice, verts=6, bevel=0.012)

    # TALL CANTILEVERED DIGITAL MONOLITH (x = -2.18, Blender y = 0.92 => Three z = -0.92)
    add_box(col, "Monolith_Base", (-2.18, 0.92, 0.22), (0.72, 0.48, 0.10), m_charcoal, rot=(0, 0, math.radians(24)), bevel=0.015)
    add_box(col, "Monolith_Body", (-2.18, 0.92, 1.38), (0.62, 0.16, 2.26), m_charcoal, rot=(0, 0, math.radians(24)), bevel=0.02)
    add_box(col, "Monolith_LED", (-2.12, 0.85, 1.48), (0.48, 0.03, 1.36), m_violet_led, rot=(0, 0, math.radians(24)), bevel=0)

    # SEPARATED MINIMALIST CONSULTATION NOOK AT REAR-RIGHT (x = 1.42, Blender y = 1.05 => Three z = -1.05)
    add_box(col, "LabTable_Leg", (1.42, 1.05, 0.46), (0.14, 0.14, 0.58), m_charcoal, bevel=0.01)
    add_box(col, "LabTable_Top", (1.42, 1.05, 0.77), (0.94, 0.64, 0.045), m_ice, bevel=0.012)
    add_modern_chair(col, "LabChair1", (0.82, 1.05, 0.17), math.radians(-90), m_violet, m_chrome)
    add_modern_chair(col, "LabChair2", (2.02, 1.05, 0.17), math.radians(90), m_violet, m_chrome)

    return merge_by_material_and_export(col, os.path.join(OUT_DIR, "booth_06_dynamic_frame_v27_4.glb"))


def main():
    manifest = {
        "version": "v27_4",
        "booths": [
            build_booth_01(),
            build_booth_02(),
            build_booth_03(),
            build_booth_04(),
            build_booth_05(),
            build_booth_06(),
        ],
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("V27.4 BOOTHS EXPORTED:", json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
