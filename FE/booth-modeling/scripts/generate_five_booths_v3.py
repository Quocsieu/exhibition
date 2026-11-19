"""
Five Booths V3 Generator - High-End Stylized Realism Exhibition Architecture (Blender 4.2 LTS)
Builds 5 architecturally distinct, production-safe V3 exhibition booth GLBs:
  1. Aether Tech V3    -> FE/public/models/booths/aether-tech-v3/aether_tech_v3.glb
  2. EcoVita Coffee V3 -> FE/public/models/booths/ecovita-coffee-v3/ecovita_coffee_v3.glb
  3. Lumina Design V3  -> FE/public/models/booths/lumina-design-v3/lumina_design_v3.glb
  4. Nordic Living V3  -> FE/public/models/booths/nordic-living-v3/nordic_living_v3.glb
  5. Solaris Energy V3 -> FE/public/models/booths/solaris-energy-v3/solaris_energy_v3.glb

Strict Compatibility Guarantees (Preserves all V2 slots, NPC, collision, signage & camera focus):
- Origin [0, 0, 0] at ground level, front facing +Z in Three.js (-Y in Blender)
- Footprint <= 7.20m x 5.40m, entrance threshold ends at z <= +3.12m (clear of NPC at [+2.32, 0.02, +3.24])
- Hero Counter (KHU B): centered [0, y, +0.92], top surface at EXACTLY y = 0.560m
- Secondary Shelves (KHU C1/C2): x = +-2.44m (rotY = +-0.14 rad), Upper top y = 1.720m (z = +0.68m), Lower top y = 0.420m (z = +1.12m)
- Rear Backdrop Canvas [0, 1.82, -1.86] (3.96m x 2.28m) framed cleanly with zero Z-fighting
- Header Sign Planes Front [0, 3.38, +3.60] & Rear [0, 3.38, +3.36] (6.36m x 0.68m) framed with <= 2.6cm lip
- Budget target: < 5,500 triangles, < 240 KB GLB, 1 unified mesh, 0 external textures, 0 real-time lights
"""

import bpy
import bmesh
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector

REPO_ROOT = Path(r"E:/Lập trình/MatBaoWS/exhibition")
BOOTHS_PUBLIC_ROOT = REPO_ROOT / "FE/public/models/booths"
ARTIFACT_DIR = Path(
    r"C:/Users/QUOC SIEU/.gemini/antigravity/brain/4a94e89e-9cea-4290-b8a0-b3713476862a"
)
SCRATCH_DIR = ARTIFACT_DIR / "scratch/v26_1_five_booths"
SCRATCH_DIR.mkdir(parents=True, exist_ok=True)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_color: str, alpha: float = 1.0):
    h = hex_color.lstrip("#")
    return (
        srgb_to_linear(int(h[0:2], 16) / 255.0),
        srgb_to_linear(int(h[2:4], 16) / 255.0),
        srgb_to_linear(int(h[4:6], 16) / 255.0),
        alpha,
    )


def create_pbr_material(
    name: str,
    hex_color: str,
    roughness: float,
    metalness: float = 0.0,
    emissive_hex: str = None,
    emissive_strength: float = 0.0,
):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_to_linear_rgba(hex_color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    if emissive_hex and emissive_strength > 0.0:
        em_rgba = hex_to_linear_rgba(emissive_hex)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = em_rgba
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = em_rgba
    return mat


def three_to_bl(pos):
    return (pos[0], -pos[2], pos[1])


def apply_shading(obj, bevel_width: float = 0.0, segments: int = 1):
    if bevel_width > 0.0:
        mod = obj.modifiers.new("Chamfer", "BEVEL")
        mod.width = bevel_width
        mod.segments = segments
        mod.use_clamp_overlap = True
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

    for poly in obj.data.polygons:
        poly.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(45.0)
    mod_wn = obj.modifiers.new("WeightedNormals", "WEIGHTED_NORMAL")
    mod_wn.weight = 50
    mod_wn.keep_sharp = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod_wn.name)


def add_box(
    name: str,
    pos,
    size,
    mat,
    bevel: float = 0.007,
    rot_y: float = 0.0,
    rot_x: float = 0.0,
    cull_bottom: bool = False,
):
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=three_to_bl(pos))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if cull_bottom:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bottom_faces = [f for f in bm.faces if f.normal.z < -0.9]
        bmesh.ops.delete(bm, geom=bottom_faces, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
    obj.data.materials.append(mat)
    apply_shading(obj, bevel_width=bevel, segments=1)
    if abs(rot_x) > 1e-6 or abs(rot_y) > 1e-6:
        obj.rotation_euler = (rot_x, 0.0, rot_y)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def add_local_box(
    name: str,
    anchor_pos,
    anchor_rot_y: float,
    local_offset,
    size,
    mat,
    bevel: float = 0.006,
    cull_bottom: bool = False,
):
    ax, ay, az = anchor_pos
    lx, ly, lz = local_offset
    cos_r, sin_r = math.cos(anchor_rot_y), math.sin(anchor_rot_y)
    wx = ax + lx * cos_r + lz * sin_r
    wy = ay + ly
    wz = az - lx * sin_r + lz * cos_r
    return add_box(
        name, (wx, wy, wz), size, mat, bevel=bevel, rot_y=anchor_rot_y, cull_bottom=cull_bottom
    )


def add_cylinder(
    name: str,
    pos,
    radius: float,
    height: float,
    mat,
    vertices: int = 16,
    bevel: float = 0.003,
    rot_x: float = 0.0,
    rot_y: float = 0.0,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=height, location=three_to_bl(pos)
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    apply_shading(obj, bevel_width=bevel, segments=1)
    if abs(rot_x) > 1e-6 or abs(rot_y) > 1e-6:
        obj.rotation_euler = (rot_x, 0.0, rot_y)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def add_pill_extrusion(name: str, pos, width: float, height: float, depth: float, mat, end_segs: int = 8):
    """Creates a smooth stadium/pill-shaped counter or pedestal (rounded left & right ends!)"""
    r = depth * 0.5
    straight_half = max(0.05, (width - depth) * 0.5)
    bm = bmesh.new()
    pts_2d = []
    # Right semicircle (-pi/2 .. +pi/2)
    for i in range(end_segs + 1):
        a = -math.pi * 0.5 + (math.pi * i) / end_segs
        pts_2d.append((straight_half + r * math.cos(a), r * math.sin(a)))
    # Left semicircle (+pi/2 .. 3*pi/2)
    for i in range(end_segs + 1):
        a = math.pi * 0.5 + (math.pi * i) / end_segs
        pts_2d.append((-straight_half + r * math.cos(a), r * math.sin(a)))

    bottom_verts = [bm.verts.new((px, py, -height * 0.5)) for px, py in pts_2d]
    top_verts = [bm.verts.new((px, py, height * 0.5)) for px, py in pts_2d]
    n = len(pts_2d)
    bm.faces.new(top_verts)
    bm.faces.new(list(reversed(bottom_verts)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bottom_verts[i], bottom_verts[j], top_verts[j], top_verts[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = three_to_bl(pos)
    obj.data.materials.append(mat)
    apply_shading(obj, bevel_width=0.005, segments=1)
    return obj


def add_curved_wing_wall(
    prefix: str,
    side_sign: float,
    base_y: float,
    height: float,
    thickness: float,
    mat_core,
    mat_accent,
    segments: int = 4,
    span_x: float = 1.24,
    curve_forward_z: float = 0.42,
):
    """Creates a graceful curved architectural wing wall sweeping forward from x = +-2.10 to +-3.34."""
    start_x = side_sign * 2.10
    start_z = -1.96
    for i in range(segments):
        t0 = i / segments
        t1 = (i + 1) / segments
        tm = (t0 + t1) * 0.5
        # Smooth quadratic forward sweep
        x0 = start_x + side_sign * span_x * t0
        z0 = start_z + curve_forward_z * (t0 ** 1.7)
        x1 = start_x + side_sign * span_x * t1
        z1 = start_z + curve_forward_z * (t1 ** 1.7)
        seg_len = math.hypot(x1 - x0, z1 - z0) + 0.016
        yaw = -math.atan2(z1 - z0, x1 - x0) if side_sign > 0 else -math.atan2(z0 - z1, x0 - x1)
        mx, mz = (x0 + x1) * 0.5, (z0 + z1) * 0.5
        add_box(
            f"{prefix}_Seg_{i}",
            (mx, base_y + height * 0.5, mz),
            (seg_len, height, thickness),
            mat_core,
            bevel=0.006,
            rot_y=yaw,
            cull_bottom=True,
        )
        # Top cap accent
        add_box(
            f"{prefix}_Cap_{i}",
            (mx, base_y + height + 0.012, mz),
            (seg_len + 0.006, 0.024, thickness + 0.014),
            mat_accent,
            bevel=0.003,
            rot_y=yaw,
        )


def add_standard_header_frame(
    prefix: str, mat_core, mat_trim, mat_led, trim_thickness: float = 0.022
):
    """
    Frames front [0, 3.38, +3.60] & rear [0, 3.38, +3.36] dynamic 6.36m x 0.68m sign planes
    with <= 2.4cm bezel lip so 100% of typography reads clearly from Overview & Focus.
    """
    add_box(f"{prefix}_Core", (0.0, 3.38, 3.48), (6.40, 0.71, 0.222), mat_core, bevel=0.008)
    add_box(
        f"{prefix}_TopRail",
        (0.0, 3.748, 3.48),
        (6.54, 0.044, 0.284),
        mat_trim,
        bevel=0.006,
    )
    add_box(
        f"{prefix}_BottomRail",
        (0.0, 3.014, 3.48),
        (6.54, 0.040, 0.282),
        mat_trim,
        bevel=0.006,
    )
    if mat_led is not None:
        add_box(f"{prefix}_CrownLED", (0.0, 3.772, 3.618), (6.36, 0.012, 0.012), mat_led, bevel=0.0)
    for side, hx in (("L", -3.23), ("R", 3.23)):
        add_box(
            f"{prefix}_EndCap_{side}",
            (hx, 3.38, 3.48),
            (0.10, 0.78, 0.290),
            mat_trim,
            bevel=0.008,
        )


def finalize_validate_and_render(
    slug: str,
    mesh_name: str,
    out_dir: Path,
    glb_filename: str,
    render_hero: bool = True,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    out_glb = out_dir / glb_filename

    bpy.ops.object.select_all(action="SELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pre_parts = len(meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()

    unified = bpy.context.object
    unified.name = mesh_name
    bm = bmesh.new()
    bm.from_mesh(unified.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bm.to_mesh(unified.data)
    bm.free()

    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    unified.data.validate()

    bpy.ops.export_scene.gltf(
        filepath=str(out_glb),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_copyright=f"Virtual Expo {mesh_name}",
    )

    # Re-import GLB cleanly to validate everything!
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(out_glb))
    imp_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    verts = 0
    tris = 0
    below_floor = 0
    bad_normals = 0
    degen_tris = 0
    nan_flag = False

    for m in imp_meshes:
        md = m.data
        md.calc_loop_triangles()
        verts += len(md.vertices)
        tris += len(md.loop_triangles)
        for v in md.vertices:
            wv = m.matrix_world @ v.co
            if any(math.isnan(c) or math.isinf(c) for c in wv):
                nan_flag = True
            if wv.z < -0.002:
                below_floor += 1
            min_v.x, min_v.y, min_v.z = min(min_v.x, wv.x), min(min_v.y, wv.y), min(min_v.z, wv.z)
            max_v.x, max_v.y, max_v.z = max(max_v.x, wv.x), max(max_v.y, wv.y), max(max_v.z, wv.z)
            if v.normal.length < 0.5 or any(math.isnan(c) for c in v.normal):
                bad_normals += 1
        for t in md.loop_triangles:
            if t.area < 1e-10:
                degen_tris += 1

    fsize = os.path.getsize(out_glb)
    hero_png = None

    if render_hero:
        scene = bpy.context.scene
        scene.render.engine = (
            "BLENDER_EEVEE_NEXT"
            if "BLENDER_EEVEE_NEXT"
            in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
            else "BLENDER_EEVEE"
        )
        if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 32
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 800
        scene.render.image_settings.file_format = "PNG"
        world = bpy.data.worlds.new("StudioW")
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.16, 0.19, 0.24, 1.0)
            bg.inputs[1].default_value = 1.2

        bpy.ops.mesh.primitive_plane_add(size=24.0, location=(0, 0, -0.002))
        g = bpy.context.object
        gm = create_pbr_material("StudioG", "#4b5563", roughness=0.72)
        g.data.materials.append(gm)

        def _sun(rot_deg, energy):
            ld = bpy.data.lights.new("Sun", type="SUN")
            ld.energy = energy
            lo = bpy.data.objects.new("Sun", ld)
            scene.collection.objects.link(lo)
            lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

        def _area(loc, target, energy, sz=5.0):
            ld = bpy.data.lights.new("Area", type="AREA")
            ld.energy = energy
            ld.size = sz
            lo = bpy.data.objects.new("Area", ld)
            scene.collection.objects.link(lo)
            lo.location = Vector(loc)
            lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

        _sun((46, -20, 30), 2.7)
        _area((0.0, -7.8, 4.4), (0.0, 0.0, 1.5), 340.0, 6.0)
        _area((-5.5, 3.8, 4.2), (0.0, 0.0, 1.6), 170.0, 4.5)

        cd = bpy.data.cameras.new("Cam")
        co = bpy.data.objects.new("Cam", cd)
        scene.collection.objects.link(co)
        scene.camera = co
        cpos = Vector((-5.6, -7.8, 3.15))
        tpos = Vector((0.0, 0.0, 1.72))
        co.location = cpos
        co.rotation_euler = (tpos - cpos).to_track_quat("-Z", "Y").to_euler()
        cd.lens = 36.0
        hero_png = str(ARTIFACT_DIR / f"v26_1_blender_{slug}_v3.png")
        scene.render.filepath = hero_png
        bpy.ops.render.render(write_still=True)

    stats = {
        "slug": slug,
        "glb_path": str(out_glb),
        "pre_join_parts": pre_parts,
        "file_size_bytes": fsize,
        "file_size_kb": round(fsize / 1024, 2),
        "mesh_count": len(imp_meshes),
        "vertices": verts,
        "triangles": tris,
        "material_count": len(bpy.data.materials),
        "texture_count": len(bpy.data.images),
        "threejs_bounds": {
            "x": [round(min_v.x, 3), round(max_v.x, 3)],
            "y_up": [round(min_v.z, 3), round(max_v.z, 3)],
            "z_forward": [round(-max_v.y, 3), round(-min_v.y, 3)],
            "whd": [
                round(max_v.x - min_v.x, 3),
                round(max_v.z - min_v.z, 3),
                round(max_v.y - min_v.y, 3),
            ],
        },
        "checks": {
            "no_nan": not nan_flag,
            "below_floor_verts": below_floor,
            "invalid_normals": bad_normals,
            "degenerate_tris": degen_tris,
            "within_budget_5500_tris": tris <= 5500,
            "within_budget_240_kb": (fsize / 1024) <= 240.0,
        },
        "blender_hero_png": hero_png,
    }
    print(f"[V3 OK] {slug}: {stats['file_size_kb']} KB | {tris} tris | {stats['material_count']} mats | degen={degen_tris}")
    return stats


# =============================================================================
# 1. AETHER TECH V3 — MODERN DIGITAL TECHNOLOGY SHOWROOM
#    Asymmetric crisp white-and-navy tech pavilion, curved wings, curved reception counter,
#    deep recessed modular tech alcoves, vertical frosted-glass tech totem.
# =============================================================================
def build_aether_tech_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_white = create_pbr_material("Aether_WhiteComposite", "#f1f5f9", roughness=0.28, metalness=0.06)
    mat_navy = create_pbr_material("Aether_DarkNavy", "#0f1e36", roughness=0.40, metalness=0.22)
    mat_alu = create_pbr_material("Aether_BrushedAluminum", "#cbd5e1", roughness=0.22, metalness=0.88)
    mat_floor = create_pbr_material("Aether_LightTechFloor", "#dbe4ef", roughness=0.38, metalness=0.10)
    mat_frosted = create_pbr_material("Aether_FrostedGlass", "#bae6fd", roughness=0.14, metalness=0.12)
    mat_cyan_led = create_pbr_material(
        "Aether_SoftCyanLED", "#38bdf8", roughness=0.14, emissive_hex="#0ea5e9", emissive_strength=2.1
    )
    mat_wash = create_pbr_material(
        "Aether_CleanWashLight", "#f8fafc", roughness=0.12, emissive_hex="#e0f2fe", emissive_strength=2.4
    )

    # A. Clean Bright Tech Plinth & Seamless Entrance Threshold
    add_box("Floor_SubPlinth", (0, 0.125, 0), (7.20, 0.25, 5.40), mat_navy, bevel=0.018, cull_bottom=True)
    add_box("Floor_LED_Front", (0, 0.258, 2.668), (7.06, 0.012, 0.016), mat_cyan_led, bevel=0.0)
    add_box("Floor_AluCoping", (0, 0.270, 0), (7.16, 0.016, 5.36), mat_alu, bevel=0.004, cull_bottom=True)
    add_box("Floor_MainDeck", (0, 0.279, 0.05), (6.92, 0.014, 5.14), mat_floor, bevel=0.004, cull_bottom=True)
    # Recessed dark-navy center tech runner inlay
    add_box("Floor_CenterInlay", (0, 0.284, 0.40), (3.60, 0.006, 3.60), mat_white, bevel=0.002, cull_bottom=True)
    # Entrance step (ends z = +3.11m, clear of NPC)
    add_box("Step_Base", (0, 0.068, 2.90), (5.40, 0.136, 0.42), mat_navy, bevel=0.014, cull_bottom=True)
    add_box("Step_Top", (0, 0.142, 2.89), (5.36, 0.014, 0.40), mat_white, bevel=0.003, cull_bottom=True)
    add_box("Step_Nosing", (0, 0.143, 3.10), (5.38, 0.016, 0.028), mat_alu, bevel=0.003)

    # B. Curved-Wing White & Navy Rear Tech Wall (Backdrop Canvas [0, 1.82, -1.86])
    add_box("RearWall_Core", (0, 1.72, -2.02), (4.30, 2.88, 0.22), mat_white, bevel=0.014, cull_bottom=True)
    add_box("RearWall_Wainscot", (0, 0.47, -1.87), (4.26, 0.37, 0.11), mat_navy, bevel=0.008, cull_bottom=True)
    add_box("RearWall_DatumTrim", (0, 0.662, -1.855), (4.26, 0.018, 0.13), mat_alu, bevel=0.003)
    # Crisp aluminum backdrop surround + top linear light canopy
    add_box("BD_Top", (0, 3.005, -1.868), (4.12, 0.070, 0.072), mat_alu, bevel=0.004)
    add_box("BD_Bot", (0, 0.652, -1.868), (4.12, 0.036, 0.072), mat_alu, bevel=0.004)
    for sx in (-2.025, 2.025):
        add_box(f"BD_Stile_{sx}", (sx, 1.825, -1.868), (0.076, 2.39, 0.072), mat_alu, bevel=0.004)
    add_box("BD_Canopy", (0, 3.12, -1.80), (4.24, 0.07, 0.28), mat_navy, bevel=0.007)
    add_box("BD_Diffuser", (0, 3.082, -1.74), (3.96, 0.010, 0.06), mat_wash, bevel=0.0)

    # Gentle curved composite wings (asymmetric height: left 3.12m, right 2.86m!)
    add_curved_wing_wall("AetherWingL", -1.0, 0.286, 2.84, 0.15, mat_white, mat_alu, segments=4, span_x=1.22, curve_forward_z=0.38)
    add_curved_wing_wall("AetherWingR",  1.0, 0.286, 2.58, 0.15, mat_white, mat_alu, segments=4, span_x=1.22, curve_forward_z=0.38)
    # Horizontal navy accent bands on curved wings
    for sx, wy in ((-2.72, 1.15), (-2.72, 2.25), (2.72, 1.15), (2.72, 2.25)):
        add_box(f"WingBand_{sx}_{wy}", (sx, wy, -1.82), (1.05, 0.036, 0.18), mat_navy, bevel=0.003, rot_y=(0.24 if sx < 0 else -0.24))

    # C. Curved-End Reception Counter (top at EXACT y = 0.560m!)
    add_pill_extrusion("Counter_Plinth", (0, 0.318, 0.92), 3.18, 0.064, 0.72, mat_navy, end_segs=8)
    add_pill_extrusion("Counter_Body", (0, 0.438, 0.92), 3.38, 0.180, 0.88, mat_white, end_segs=8)
    add_box("Counter_FrontGlassAccent", (0, 0.438, 1.356), (2.30, 0.092, 0.022), mat_frosted, bevel=0.004)
    add_box("Counter_FrontLED", (0, 0.352, 1.358), (2.40, 0.012, 0.014), mat_cyan_led, bevel=0.0)
    add_pill_extrusion("Counter_AluRim", (0, 0.532, 0.92), 3.46, 0.016, 0.95, mat_alu, end_segs=8)
    # Top surface: 0.549 + 0.011 = EXACTLY 0.560m!
    add_pill_extrusion("Counter_TopDeck", (0, 0.549, 0.92), 3.42, 0.022, 0.91, mat_white, end_segs=8)

    # D. Deep Recessed Modular Tech Alcove Shelves (Left & Right, x = +-2.44m, rotY = +-0.14 rad)
    for side, sx, yaw in (("L", -2.44, 0.14), ("R", 2.44, -0.14)):
        ua = (sx, 0.0, 0.68)
        la = (sx, 0.0, 1.12)
        # Deep white architectural housing with recessed navy interior alcove
        add_local_box(f"Alcove_Back_{side}", ua, yaw, (0, 1.66, -0.40), (1.36, 2.74, 0.09), mat_white, bevel=0.010, cull_bottom=True)
        add_local_box(f"Alcove_Inset_{side}", ua, yaw, (0, 1.66, -0.345), (1.16, 2.54, 0.024), mat_navy, bevel=0.004)
        for px in (-0.64, 0.64):
            add_local_box(f"Alcove_SideWall_{side}_{px}", ua, yaw, (px, 1.66, -0.22), (0.075, 2.74, 0.44), mat_white, bevel=0.008, cull_bottom=True)
            add_local_box(f"Alcove_AluEdge_{side}_{px}", ua, yaw, (px, 1.66, 0.004), (0.045, 2.70, 0.018), mat_alu, bevel=0.003)
        # Top hood + soft cyan cove strip (y = 3.02m, clears max product height 2.96m)
        add_local_box(f"Alcove_Top_{side}", ua, yaw, (0, 3.03, -0.22), (1.36, 0.06, 0.44), mat_white, bevel=0.006)
        add_local_box(f"Alcove_TopLED_{side}", ua, yaw, (0, 2.996, -0.10), (1.14, 0.010, 0.03), mat_cyan_led, bevel=0.0)
        # Upper shelf (top = EXACT 1.720m -> center 1.709, h 0.022)
        add_local_box(f"ShelfU_Trim_{side}", ua, yaw, (0, 1.690, 0.0), (1.34, 0.020, 0.74), mat_alu, bevel=0.004)
        add_local_box(f"ShelfU_Deck_{side}", ua, yaw, (0, 1.709, 0.0), (1.30, 0.022, 0.70), mat_white, bevel=0.003)
        add_local_box(f"ShelfU_LED_{side}", ua, yaw, (0, 1.676, 0.35), (1.20, 0.010, 0.014), mat_cyan_led, bevel=0.0)
        # Lower plinth shelf (top = EXACT 0.420m -> center 0.410, h 0.020)
        add_local_box(f"ShelfL_Base_{side}", la, yaw, (0, 0.338, 0.0), (1.26, 0.10, 0.68), mat_navy, bevel=0.008, cull_bottom=True)
        add_local_box(f"ShelfL_Trim_{side}", la, yaw, (0, 0.396, 0.0), (1.36, 0.018, 0.76), mat_alu, bevel=0.004)
        add_local_box(f"ShelfL_Deck_{side}", la, yaw, (0, 0.410, 0.0), (1.32, 0.020, 0.72), mat_white, bevel=0.003)

    # E. Asymmetric Portal Columns + Header Sign Frame
    # Left: architectural white fin column with frosted glass vertical accent
    add_box("PortalL_Fin", (-3.28, 1.92, 2.42), (0.28, 3.24, 0.34), mat_white, bevel=0.014, cull_bottom=True)
    add_box("PortalL_Glass", (-3.28, 1.92, 2.59), (0.10, 2.55, 0.024), mat_frosted, bevel=0.004)
    add_box("PortalL_Arm", (-3.28, 3.44, 2.94), (0.16, 0.14, 1.08), mat_alu, bevel=0.008)
    # Right: sleek minimalist brushed-aluminum twin-bar stanchion
    add_box("PortalR_Post", (3.28, 1.92, 2.42), (0.16, 3.24, 0.20), mat_alu, bevel=0.010, cull_bottom=True)
    add_box("PortalR_NavyBar", (3.28, 1.92, 2.525), (0.04, 2.60, 0.020), mat_navy, bevel=0.003)
    add_box("PortalR_Arm", (3.28, 3.44, 2.94), (0.14, 0.13, 1.08), mat_alu, bevel=0.008)
    add_standard_header_frame("AetherHeader", mat_navy, mat_white, mat_cyan_led)

    # F. Signature Accent: Vertical Digital Tech Panel Totem (front-left deck, [-2.92, 0.286, 2.06])
    ta = (-2.92, 0.286, 2.06)
    ty = 0.24
    add_local_box("Totem_Base", ta, ty, (0, 0.025, 0), (0.50, 0.05, 0.32), mat_navy, bevel=0.006, cull_bottom=True)
    add_local_box("Totem_Body", ta, ty, (0, 0.88, 0), (0.44, 1.66, 0.10), mat_white, bevel=0.008, cull_bottom=True)
    add_local_box("Totem_Screen", ta, ty, (0, 0.96, 0.052), (0.36, 1.18, 0.016), mat_navy, bevel=0.003)
    add_local_box("Totem_LED", ta, ty, (0, 1.58, 0.055), (0.32, 0.014, 0.012), mat_cyan_led, bevel=0.0)

    return finalize_validate_and_render(
        "aether_tech",
        "Aether_Tech_Booth_v3",
        BOOTHS_PUBLIC_ROOT / "aether-tech-v3",
        "aether_tech_v3.glb",
    )


# =============================================================================
# 2. ECOVITA COFFEE V3 — PREMIUM NATURAL COFFEE EXHIBITION BOOTH
#    Natural oak slat walls, warm cream plaster, matte-black minimalist steel frame,
#    honed stone coffee bar counter, open black-iron & oak retail shelves, menu board + bean tray.
# =============================================================================
def build_ecovita_coffee_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_oak = create_pbr_material("Eco_NaturalOak", "#b87a42", roughness=0.58, metalness=0.02)
    mat_cream = create_pbr_material("Eco_WarmCream", "#f5efe6", roughness=0.68, metalness=0.0)
    mat_espresso = create_pbr_material("Eco_DarkEspresso", "#3d2314", roughness=0.54, metalness=0.04)
    mat_black_iron = create_pbr_material("Eco_MatteBlackMetal", "#1c1e22", roughness=0.42, metalness=0.72)
    mat_stone_top = create_pbr_material("Eco_HonedLimestone", "#e7dfd3", roughness=0.34, metalness=0.05)
    mat_floor_stone = create_pbr_material("Eco_WarmConcrete", "#c9bfb2", roughness=0.64, metalness=0.04)
    mat_warm_led = create_pbr_material(
        "Eco_WarmRoasteryGlow", "#fde68a", roughness=0.18, emissive_hex="#f59e0b", emissive_strength=1.55
    )
    mat_ceramic = create_pbr_material("Eco_RoastCeramic", "#7c4727", roughness=0.32, metalness=0.05)

    # A. Warm Artisanal Stone & Oak Deck
    add_box("Floor_Plinth", (0, 0.125, 0), (7.20, 0.25, 5.40), mat_espresso, bevel=0.016, cull_bottom=True)
    add_box("Floor_OakCurb", (0, 0.268, 0), (7.14, 0.020, 5.34), mat_oak, bevel=0.005, cull_bottom=True)
    add_box("Floor_StoneDeck", (0, 0.279, 0.05), (6.88, 0.014, 5.10), mat_floor_stone, bevel=0.004, cull_bottom=True)
    # Entrance step (ends z = +3.11m)
    add_box("Step_Base", (0, 0.068, 2.90), (5.30, 0.136, 0.42), mat_espresso, bevel=0.012, cull_bottom=True)
    add_box("Step_Tread", (0, 0.142, 2.89), (5.26, 0.014, 0.40), mat_oak, bevel=0.004, cull_bottom=True)
    add_box("Step_Glow", (0, 0.122, 3.10), (5.00, 0.010, 0.012), mat_warm_led, bevel=0.0)

    # B. Warm Cream Plaster + Natural Oak Vertical Slat Rear Wall
    add_box("RearWall_CreamCore", (0, 1.72, -2.02), (4.30, 2.88, 0.22), mat_cream, bevel=0.012, cull_bottom=True)
    add_box("RearWall_OakWainscot", (0, 0.47, -1.87), (4.26, 0.37, 0.11), mat_oak, bevel=0.008, cull_bottom=True)
    add_box("RearWall_BlackTrim", (0, 0.662, -1.855), (4.26, 0.018, 0.13), mat_black_iron, bevel=0.003)
    # Minimalist matte-black frame around Backdrop Canvas [0, 1.82, -1.86]
    add_box("BD_Top", (0, 3.005, -1.868), (4.12, 0.068, 0.070), mat_black_iron, bevel=0.004)
    add_box("BD_Bot", (0, 0.652, -1.868), (4.12, 0.036, 0.070), mat_black_iron, bevel=0.004)
    for sx in (-2.025, 2.025):
        add_box(f"BD_Stile_{sx}", (sx, 1.825, -1.868), (0.072, 2.39, 0.070), mat_black_iron, bevel=0.004)
    add_box("BD_LightBar", (0, 3.11, -1.80), (4.18, 0.065, 0.26), mat_espresso, bevel=0.006)
    add_box("BD_WarmStrip", (0, 3.074, -1.74), (3.92, 0.010, 0.055), mat_warm_led, bevel=0.0)

    # Flanking Natural Oak Slat Feature Walls (Left & Right, angled 8 deg inward)
    for side, sign in (("L", -1.0), ("R", 1.0)):
        wa = (sign * 2.75, 0.286, -1.82)
        wyaw = -sign * math.radians(8.0)
        add_local_box(f"EcoWing_Back_{side}", wa, wyaw, (0, 1.38, -0.02), (1.24, 2.76, 0.12), mat_cream, bevel=0.008, cull_bottom=True)
        add_local_box(f"EcoWing_FrameTop_{side}", wa, wyaw, (0, 2.77, 0.0), (1.28, 0.035, 0.16), mat_black_iron, bevel=0.004)
        # 6 warm vertical natural oak timber slats
        for i in range(6):
            rx = -0.45 + i * 0.18
            add_local_box(f"EcoSlat_{side}_{i}", wa, wyaw, (rx, 1.38, 0.065), (0.065, 2.66, 0.050), mat_oak, bevel=0.004, cull_bottom=True)

    # C. Artisanal Coffee Bar Counter (Oak slatted front + Honed Limestone Top at EXACT y = 0.560m!)
    add_box("Bar_KickBase", (0, 0.312, 0.92), (3.18, 0.056, 0.76), mat_black_iron, bevel=0.006, cull_bottom=True)
    add_box("Bar_OakBody", (0, 0.432, 0.92), (3.36, 0.184, 0.88), mat_espresso, bevel=0.010, cull_bottom=True)
    # Natural oak vertical fluted front panels
    for i in range(11):
        fx = -1.45 + i * 0.29
        add_box(f"Bar_OakFlute_{i}", (fx, 0.432, 1.364), (0.20, 0.166, 0.024), mat_oak, bevel=0.004)
    add_box("Bar_BlackTrim", (0, 0.526, 0.92), (3.44, 0.014, 0.94), mat_black_iron, bevel=0.003)
    # Stone countertop: 0.546 + 0.014 = EXACTLY 0.560m!
    add_box("Bar_StoneTop", (0, 0.546, 0.92), (3.48, 0.028, 0.96), mat_stone_top, bevel=0.007)

    # Subtle Coffee Bean Tasting Tray on far-right counter edge (x = +1.42m, clear of slot_01/02!)
    add_box("CoffeeTray_Board", (1.42, 0.566, 0.92), (0.34, 0.012, 0.24), mat_oak, bevel=0.003)
    for idx, bx in enumerate((1.31, 1.42, 1.53)):
        add_cylinder(f"BeanBowl_{idx}", (bx, 0.586, 0.92), 0.042, 0.028, mat_ceramic, vertices=12, bevel=0.003)

    # D. Open Matte-Black Iron & Thick Oak Timber Retail Shelves (x = +-2.44m, rotY = +-0.14 rad)
    for side, sx, yaw in (("L", -2.44, 0.14), ("R", 2.44, -0.14)):
        ua = (sx, 0.0, 0.68)
        la = (sx, 0.0, 1.12)
        # Warm cream backing panel framed in open matte-black iron ladders
        add_local_box(f"Rack_Back_{side}", ua, yaw, (0, 1.66, -0.38), (1.28, 2.74, 0.055), mat_cream, bevel=0.006, cull_bottom=True)
        for px in (-0.63, 0.63):
            # Rear & mid black iron vertical ladder uprights (open café rack feel!)
            add_local_box(f"Rack_RearPost_{side}_{px}", ua, yaw, (px, 1.66, -0.34), (0.042, 2.76, 0.042), mat_black_iron, bevel=0.004, cull_bottom=True)
            add_local_box(f"Rack_SideRailU_{side}_{px}", ua, yaw, (px, 1.685, -0.02), (0.036, 0.036, 0.68), mat_black_iron, bevel=0.003)
        # Top wooden canopy + warm light bar
        add_local_box(f"Rack_TopWood_{side}", ua, yaw, (0, 3.03, -0.22), (1.36, 0.044, 0.34), mat_oak, bevel=0.005)
        add_local_box(f"Rack_TopGlow_{side}", ua, yaw, (0, 3.004, -0.16), (1.16, 0.010, 0.04), mat_warm_led, bevel=0.0)
        # Upper thick oak shelf (top = EXACT 1.720m -> center 1.702, h 0.036)
        add_local_box(f"ShelfU_Oak_{side}", ua, yaw, (0, 1.702, 0.0), (1.34, 0.036, 0.72), mat_oak, bevel=0.005)
        add_local_box(f"ShelfU_WarmLED_{side}", ua, yaw, (0, 1.680, 0.34), (1.18, 0.008, 0.014), mat_warm_led, bevel=0.0)
        # Lower retail oak plinth (top = EXACT 0.420m -> center 0.402, h 0.036)
        add_local_box(f"ShelfL_Base_{side}", la, yaw, (0, 0.336, 0.0), (1.24, 0.096, 0.66), mat_black_iron, bevel=0.006, cull_bottom=True)
        add_local_box(f"ShelfL_Oak_{side}", la, yaw, (0, 0.402, 0.0), (1.34, 0.036, 0.74), mat_oak, bevel=0.005)

    # E. Minimalist Matte-Black Steel Frame Columns + Warm Oak-Edged Header Sign
    for side, sx in (("L", -3.28), ("R", 3.28)):
        add_box(f"EcoCol_Base_{side}", (sx, 0.315, 2.42), (0.30, 0.06, 0.30), mat_black_iron, bevel=0.006, cull_bottom=True)
        add_box(f"EcoCol_Steel_{side}", (sx, 1.92, 2.42), (0.14, 3.20, 0.14), mat_black_iron, bevel=0.006, cull_bottom=True)
        add_box(f"EcoCol_OakInlay_{side}", (sx, 1.92, 2.495), (0.065, 2.86, 0.020), mat_oak, bevel=0.003)
        add_box(f"EcoCol_Arm_{side}", (sx, 3.44, 2.94), (0.12, 0.12, 1.08), mat_black_iron, bevel=0.006)
    add_standard_header_frame("EcoHeader", mat_espresso, mat_oak, mat_warm_led)

    # F. Signature Accent: Compact Roastery Menu Board Stand (front-left deck, [-2.90, 0.286, 2.04])
    ma = (-2.90, 0.286, 2.04)
    my = 0.26
    for lx in (-0.18, 0.18):
        add_local_box(f"MenuLeg_{lx}", ma, my, (lx, 0.56, 0.0), (0.04, 1.12, 0.04), mat_oak, bevel=0.004, cull_bottom=True)
    add_local_box("MenuFrame", ma, my, (0, 0.94, 0.02), (0.48, 0.64, 0.036), mat_oak, bevel=0.005)
    add_local_box("MenuSlate", ma, my, (0, 0.94, 0.040), (0.40, 0.56, 0.012), mat_black_iron, bevel=0.002)

    return finalize_validate_and_render(
        "ecovita_coffee",
        "EcoVita_Coffee_Booth_v3",
        BOOTHS_PUBLIC_ROOT / "ecovita-coffee-v3",
        "ecovita_coffee_v3.glb",
    )


# =============================================================================
# 3. LUMINA DESIGN V3 — CONTEMPORARY DESIGN & LIGHTING SHOWROOM
#    Sculptural sweeping off-white curved gallery walls, champagne-gold slender frames,
#    rounded pill gallery counter, frosted-glass accent shelves, 2 architectural luminaires.
# =============================================================================
def build_lumina_design_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_offwhite = create_pbr_material("Lumina_OffWhitePlaster", "#f4f1ec", roughness=0.52, metalness=0.02)
    mat_warmgray = create_pbr_material("Lumina_WarmGray", "#9ca3af", roughness=0.46, metalness=0.08)
    mat_champagne = create_pbr_material("Lumina_ChampagneMetal", "#d4b483", roughness=0.22, metalness=0.88)
    mat_stone = create_pbr_material("Lumina_LightTravertine", "#e5dfd6", roughness=0.44, metalness=0.04)
    mat_frosted = create_pbr_material("Lumina_FrostedGlass", "#e2e8f0", roughness=0.14, metalness=0.08)
    mat_charcoal = create_pbr_material("Lumina_ShadowCharcoal", "#27272a", roughness=0.50, metalness=0.20)
    mat_glow = create_pbr_material(
        "Lumina_GalleryGlow", "#fffbeb", roughness=0.12, emissive_hex="#fef3c7", emissive_strength=2.3
    )

    # A. Light Travertine Gallery Plinth with Champagne Shadow-Gap Trim
    add_box("Floor_ShadowPlinth", (0, 0.120, 0), (7.16, 0.24, 5.36), mat_charcoal, bevel=0.016, cull_bottom=True)
    add_box("Floor_ChampagneLine", (0, 0.248, 0), (7.18, 0.016, 5.38), mat_champagne, bevel=0.004, cull_bottom=True)
    add_box("Floor_TravertineDeck", (0, 0.270, 0.02), (7.10, 0.028, 5.30), mat_stone, bevel=0.008, cull_bottom=True)
    # Soft curved entrance threshold step (ends z = +3.11m)
    add_pill_extrusion("Step_Gallery", (0, 0.072, 2.90), 5.20, 0.144, 0.42, mat_stone, end_segs=8)
    add_box("Step_ChampagneLip", (0, 0.142, 3.095), (4.60, 0.012, 0.020), mat_champagne, bevel=0.002)

    # B. Sculptural Curved Off-White Gallery Wall & Recessed Champagne Frame
    add_box("GalleryWall_Core", (0, 1.72, -2.02), (4.30, 2.88, 0.22), mat_offwhite, bevel=0.016, cull_bottom=True)
    add_box("GalleryWall_Base", (0, 0.47, -1.87), (4.26, 0.37, 0.10), mat_warmgray, bevel=0.008, cull_bottom=True)
    add_box("GalleryWall_Trim", (0, 0.660, -1.855), (4.26, 0.016, 0.12), mat_champagne, bevel=0.003)
    # Slender champagne gallery frame around Backdrop Canvas [0, 1.82, -1.86]
    add_box("BD_Top", (0, 3.002, -1.868), (4.10, 0.062, 0.068), mat_champagne, bevel=0.004)
    add_box("BD_Bot", (0, 0.654, -1.868), (4.10, 0.032, 0.068), mat_champagne, bevel=0.003)
    for sx in (-2.022, 2.022):
        add_box(f"BD_Stile_{sx}", (sx, 1.825, -1.868), (0.066, 2.38, 0.068), mat_champagne, bevel=0.004)
    add_box("BD_LightHood", (0, 3.11, -1.80), (4.18, 0.058, 0.26), mat_offwhite, bevel=0.006)
    add_box("BD_LightGlow", (0, 3.076, -1.74), (3.92, 0.010, 0.05), mat_glow, bevel=0.0)

    # Graceful sweeping curved off-white plaster wings (asymmetric: left sweeps further forward)
    add_curved_wing_wall("LuminaArcL", -1.0, 0.284, 2.78, 0.16, mat_offwhite, mat_champagne, segments=5, span_x=1.24, curve_forward_z=0.52)
    add_curved_wing_wall("LuminaArcR",  1.0, 0.284, 2.62, 0.16, mat_offwhite, mat_champagne, segments=5, span_x=1.24, curve_forward_z=0.44)

    # C. Rounded Pill-Shaped Gallery Counter (Light stone + Champagne band, top at EXACT y = 0.560m!)
    add_pill_extrusion("Counter_Base", (0, 0.318, 0.92), 3.06, 0.068, 0.72, mat_warmgray, end_segs=10)
    add_pill_extrusion("Counter_Body", (0, 0.438, 0.92), 3.36, 0.176, 0.88, mat_offwhite, end_segs=10)
    add_pill_extrusion("Counter_ChampagneBand", (0, 0.529, 0.92), 3.42, 0.016, 0.92, mat_champagne, end_segs=10)
    # Top surface: 0.548 + 0.012 = EXACTLY 0.560m!
    add_pill_extrusion("Counter_TopStone", (0, 0.548, 0.92), 3.44, 0.024, 0.94, mat_stone, end_segs=10)

    # D. Slender Recessed Gallery Display Niches with Frosted Glass & Champagne Trim (x = +-2.44m)
    for side, sx, yaw in (("L", -2.44, 0.14), ("R", 2.44, -0.14)):
        ua = (sx, 0.0, 0.68)
        la = (sx, 0.0, 1.12)
        add_local_box(f"Niche_Back_{side}", ua, yaw, (0, 1.66, -0.39), (1.32, 2.74, 0.08), mat_offwhite, bevel=0.010, cull_bottom=True)
        add_local_box(f"Niche_Recess_{side}", ua, yaw, (0, 1.66, -0.342), (1.16, 2.58, 0.020), mat_warmgray, bevel=0.004)
        for px in (-0.62, 0.62):
            add_local_box(f"Niche_Pillar_{side}_{px}", ua, yaw, (px, 1.66, -0.30), (0.048, 2.74, 0.24), mat_champagne, bevel=0.005, cull_bottom=True)
        add_local_box(f"Niche_TopCap_{side}", ua, yaw, (0, 3.03, -0.24), (1.32, 0.044, 0.34), mat_offwhite, bevel=0.005)
        add_local_box(f"Niche_TopGlow_{side}", ua, yaw, (0, 3.004, -0.18), (1.14, 0.010, 0.04), mat_glow, bevel=0.0)
        # Upper shelf: frosted glass inlay + champagne frame (top = EXACT 1.720m -> center 1.709, h 0.022)
        add_local_box(f"ShelfU_Frame_{side}", ua, yaw, (0, 1.691, 0.0), (1.34, 0.018, 0.72), mat_champagne, bevel=0.004)
        add_local_box(f"ShelfU_Glass_{side}", ua, yaw, (0, 1.709, 0.0), (1.30, 0.022, 0.68), mat_frosted, bevel=0.003)
        # Lower gallery pedestal (top = EXACT 0.420m -> center 0.409, h 0.022)
        add_local_box(f"ShelfL_Plinth_{side}", la, yaw, (0, 0.338, 0.0), (1.24, 0.10, 0.66), mat_warmgray, bevel=0.008, cull_bottom=True)
        add_local_box(f"ShelfL_Top_{side}", la, yaw, (0, 0.409, 0.0), (1.34, 0.022, 0.74), mat_offwhite, bevel=0.005)

    # E. Slender Champagne Architectural Portal (Asymmetric double-rod left, single round column right)
    add_cylinder("PortalL_Rod1", (-3.33, 1.92, 2.42), 0.042, 3.24, mat_champagne, vertices=14, bevel=0.002)
    add_cylinder("PortalL_Rod2", (-3.21, 1.92, 2.42), 0.042, 3.24, mat_champagne, vertices=14, bevel=0.002)
    add_box("PortalL_Arm", (-3.27, 3.44, 2.94), (0.14, 0.10, 1.08), mat_champagne, bevel=0.006)

    add_cylinder("PortalR_Col", (3.28, 1.92, 2.42), 0.072, 3.24, mat_champagne, vertices=16, bevel=0.003)
    add_box("PortalR_Arm", (3.28, 3.44, 2.94), (0.12, 0.10, 1.08), mat_champagne, bevel=0.006)
    add_standard_header_frame("LuminaHeader", mat_charcoal, mat_champagne, mat_glow)

    # F. Signature Accent: 2 Sculptural Architectural Luminaires (pure low-poly emissive mesh!)
    # 1. Vertical Frosted-Glass & Champagne Floor Light Column on front-left deck ([-2.90, 0.284, 2.04])
    add_cylinder("Lamp1_Base", (-2.90, 0.315, 2.04), 0.18, 0.06, mat_champagne, vertices=16, bevel=0.003)
    add_cylinder("Lamp1_Stem", (-2.90, 1.04, 2.04), 0.022, 1.40, mat_champagne, vertices=12, bevel=0.001)
    add_cylinder("Lamp1_Diffuser", (-2.90, 1.42, 2.04), 0.095, 0.62, mat_glow, vertices=16, bevel=0.004)
    add_cylinder("Lamp1_TopCap", (-2.90, 1.74, 2.04), 0.105, 0.024, mat_champagne, vertices=16, bevel=0.002)
    # 2. Architectural Wall Sconce Bar on Left Curved Wing
    add_box("Lamp2_SconceMount", (-2.74, 1.92, -1.74), (0.06, 1.10, 0.05), mat_champagne, bevel=0.004, rot_y=0.30)
    add_box("Lamp2_SconceGlow", (-2.72, 1.92, -1.71), (0.032, 1.02, 0.028), mat_glow, bevel=0.002, rot_y=0.30)

    return finalize_validate_and_render(
        "lumina_design",
        "Lumina_Design_Booth_v3",
        BOOTHS_PUBLIC_ROOT / "lumina-design-v3",
        "lumina_design_v3.glb",
    )


# =============================================================================
# 4. NORDIC LIVING V3 — SCANDINAVIAN LIFESTYLE EXHIBITION BOOTH
#    Airy light-oak timber frames, warm-white & beige plaster, soft-corner oak counter,
#    open Scandinavian oak bookcase shelves, compact lounge side-table + accent stool.
# =============================================================================
def build_nordic_living_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_light_oak = create_pbr_material("Nordic_LightOak", "#d4b083", roughness=0.56, metalness=0.02)
    mat_warm_white = create_pbr_material("Nordic_WarmWhite", "#faf8f4", roughness=0.64, metalness=0.0)
    mat_beige = create_pbr_material("Nordic_SandBeige", "#e6dccf", roughness=0.72, metalness=0.0)
    mat_soft_gray = create_pbr_material("Nordic_SoftGrayFabric", "#cbd5e1", roughness=0.84, metalness=0.0)
    mat_matte_black = create_pbr_material("Nordic_MatteBlack", "#1f242b", roughness=0.45, metalness=0.65)
    mat_birch = create_pbr_material("Nordic_PaleBirch", "#e8d2b2", roughness=0.50, metalness=0.02)
    mat_warm_led = create_pbr_material(
        "Nordic_SoftWarmLight", "#fef9c3", roughness=0.16, emissive_hex="#fef08a", emissive_strength=1.5
    )

    # A. Airy Light-Oak & Sand-Beige Lifestyle Deck
    add_box("Floor_Plinth", (0, 0.125, 0), (7.20, 0.25, 5.40), mat_light_oak, bevel=0.018, cull_bottom=True)
    add_box("Floor_WarmDeck", (0, 0.268, 0.04), (6.94, 0.030, 5.14), mat_beige, bevel=0.008, cull_bottom=True)
    # Soft woven rug zone in center
    add_box("Floor_NordicRug", (0, 0.285, 0.15), (4.10, 0.008, 3.60), mat_warm_white, bevel=0.002, cull_bottom=True)
    # Entrance step (ends z = +3.11m)
    add_box("Step_Base", (0, 0.068, 2.90), (5.34, 0.136, 0.42), mat_light_oak, bevel=0.014, cull_bottom=True)
    add_box("Step_Top", (0, 0.142, 2.89), (5.30, 0.014, 0.40), mat_birch, bevel=0.004, cull_bottom=True)

    # B. Warm-White Plaster & Light-Oak Batten Rear Wall (Open Scandinavian feel)
    add_box("RearWall_Core", (0, 1.72, -2.02), (4.30, 2.88, 0.20), mat_warm_white, bevel=0.014, cull_bottom=True)
    add_box("RearWall_OakBase", (0, 0.47, -1.87), (4.26, 0.37, 0.10), mat_light_oak, bevel=0.008, cull_bottom=True)
    add_box("RearWall_Trim", (0, 0.660, -1.855), (4.26, 0.016, 0.12), mat_birch, bevel=0.003)
    # Natural light-oak frame around Backdrop Canvas [0, 1.82, -1.86]
    add_box("BD_Top", (0, 3.004, -1.868), (4.12, 0.066, 0.070), mat_light_oak, bevel=0.005)
    add_box("BD_Bot", (0, 0.652, -1.868), (4.12, 0.036, 0.070), mat_light_oak, bevel=0.004)
    for sx in (-2.025, 2.025):
        add_box(f"BD_Stile_{sx}", (sx, 1.825, -1.868), (0.072, 2.39, 0.070), mat_light_oak, bevel=0.005)
    add_box("BD_Canopy", (0, 3.11, -1.80), (4.20, 0.060, 0.26), mat_light_oak, bevel=0.006)
    add_box("BD_WarmDiff", (0, 3.076, -1.74), (3.92, 0.010, 0.05), mat_warm_led, bevel=0.0)

    # Flanking Warm-White & Spaced Light-Oak Timber Screens (flat architectural plane with recessed shadow lines)
    for side, sign in (("L", -1.0), ("R", 1.0)):
        wa = (sign * 2.76, 0.284, -1.90)
        add_local_box(f"NordicWing_Wall_{side}", wa, 0.0, (0, 1.38, -0.04), (1.26, 2.76, 0.12), mat_warm_white, bevel=0.010, cull_bottom=True)
        add_local_box(f"NordicWing_Top_{side}", wa, 0.0, (0, 2.77, 0.0), (1.28, 0.036, 0.16), mat_light_oak, bevel=0.004)
        # Clean horizontal Scandinavian wainscot datum + 4 slender oak battens
        add_local_box(f"NordicWing_Datum_{side}", wa, 0.0, (0, 0.92, 0.032), (1.18, 0.022, 0.022), mat_light_oak, bevel=0.003)
        for i in range(4):
            rx = -0.39 + i * 0.26
            add_local_box(f"NordicBatten_{side}_{i}", wa, 0.0, (rx, 1.84, 0.035), (0.046, 1.72, 0.032), mat_light_oak, bevel=0.003)

    # C. Soft-Cornered Scandinavian Light-Oak Counter (tapered black feet, warm-white top at EXACT y = 0.560m!)
    for fx in (-1.45, -0.50, 0.50, 1.45):
        for fz in (0.62, 1.22):
            add_cylinder(f"Counter_Leg_{fx}_{fz}", (fx, 0.320, fz), 0.024, 0.072, mat_matte_black, vertices=10, bevel=0.002)
    add_box("Counter_OakBody", (0, 0.444, 0.92), (3.38, 0.178, 0.88), mat_light_oak, bevel=0.014)
    # Soft recessed warm-white front panel with matte-black minimalist pull bar
    add_box("Counter_FrontPanel", (0, 0.444, 1.356), (2.90, 0.126, 0.024), mat_warm_white, bevel=0.005)
    add_box("Counter_BlackAccent", (0, 0.444, 1.372), (0.90, 0.014, 0.012), mat_matte_black, bevel=0.002)
    # Top surface: 0.547 + 0.013 = EXACTLY 0.560m!
    add_box("Counter_TopDeck", (0, 0.547, 0.92), (3.46, 0.026, 0.94), mat_warm_white, bevel=0.008)

    # D. Open Scandinavian Light-Oak Bookcase Display Shelves (x = +-2.44m, rotY = +-0.14 rad)
    for side, sx, yaw in (("L", -2.44, 0.14), ("R", 2.44, -0.14)):
        ua = (sx, 0.0, 0.68)
        la = (sx, 0.0, 1.12)
        # Open-back oak ladder frame with airy warm-white half-panel behind upper tier
        add_local_box(f"NordicShelf_Back_{side}", ua, yaw, (0, 1.66, -0.38), (1.22, 2.68, 0.040), mat_warm_white, bevel=0.006, cull_bottom=True)
        for px in (-0.61, 0.61):
            add_local_box(f"NordicShelf_Post_{side}_{px}", ua, yaw, (px, 1.66, -0.34), (0.056, 2.74, 0.068), mat_light_oak, bevel=0.005, cull_bottom=True)
            add_local_box(f"NordicShelf_Bracket_{side}_{px}", ua, yaw, (px, 1.66, -0.02), (0.036, 0.048, 0.66), mat_light_oak, bevel=0.004)
        add_local_box(f"NordicShelf_TopBar_{side}", ua, yaw, (0, 3.03, -0.24), (1.32, 0.042, 0.30), mat_light_oak, bevel=0.005)
        add_local_box(f"NordicShelf_Glow_{side}", ua, yaw, (0, 3.004, -0.18), (1.12, 0.008, 0.04), mat_warm_led, bevel=0.0)
        # Upper open oak shelf (top = EXACT 1.720m -> center 1.701, h 0.038)
        add_local_box(f"ShelfU_Oak_{side}", ua, yaw, (0, 1.701, 0.0), (1.34, 0.038, 0.72), mat_light_oak, bevel=0.006)
        # Lower open oak bench shelf (top = EXACT 0.420m -> center 0.402, h 0.036)
        add_local_box(f"ShelfL_Base_{side}", la, yaw, (0, 0.336, 0.0), (1.20, 0.096, 0.64), mat_beige, bevel=0.006, cull_bottom=True)
        add_local_box(f"ShelfL_Oak_{side}", la, yaw, (0, 0.402, 0.0), (1.34, 0.036, 0.74), mat_light_oak, bevel=0.006)

    # E. Slender Light-Oak Timber Portal Frame + Clean Nordic Header
    for side, sx in (("L", -3.28), ("R", 3.28)):
        add_box(f"NordicCol_Shoe_{side}", (sx, 0.312, 2.42), (0.24, 0.056, 0.24), mat_matte_black, bevel=0.005, cull_bottom=True)
        add_box(f"NordicCol_Oak_{side}", (sx, 1.92, 2.42), (0.16, 3.20, 0.16), mat_light_oak, bevel=0.008, cull_bottom=True)
        add_box(f"NordicCol_Arm_{side}", (sx, 3.44, 2.94), (0.14, 0.12, 1.08), mat_light_oak, bevel=0.006)
    add_standard_header_frame("NordicHeader", mat_warm_white, mat_light_oak, mat_warm_led)

    # F. Signature Accent: Minimalist Scandinavian Round Side Table + Low Accent Stool (front-left deck, [-2.84, 0.284, 2.04])
    # Round oak side table (r = 0.26m, top y = 0.74m)
    add_cylinder("NordicTable_Top", (-2.84, 0.725, 2.04), 0.26, 0.028, mat_birch, vertices=18, bevel=0.003)
    for i in range(3):
        a = i * (2 * math.pi / 3)
        add_cylinder(
            f"NordicTable_Leg_{i}",
            (-2.84 + math.cos(a) * 0.15, 0.50, 2.04 + math.sin(a) * 0.15),
            0.018,
            0.43,
            mat_light_oak,
            vertices=10,
            bevel=0.001,
        )
    # Compact Scandinavian upholstered stool beside table ([-2.38, 0.284, 2.18])
    add_cylinder("NordicStool_Cushion", (-2.38, 0.65, 2.18), 0.19, 0.075, mat_soft_gray, vertices=16, bevel=0.012)
    for i in range(4):
        a = i * (math.pi / 2) + math.pi / 4
        add_cylinder(
            f"NordicStool_Leg_{i}",
            (-2.38 + math.cos(a) * 0.12, 0.45, 2.18 + math.sin(a) * 0.12),
            0.016,
            0.34,
            mat_light_oak,
            vertices=8,
            bevel=0.001,
        )

    return finalize_validate_and_render(
        "nordic_living",
        "Nordic_Living_Booth_v3",
        BOOTHS_PUBLIC_ROOT / "nordic-living-v3",
        "nordic_living_v3.glb",
    )


# =============================================================================
# 5. SOLARIS ENERGY V3 — CLEAN ENERGY TECHNOLOGY EXHIBITION BOOTH
#    Precision brushed-aluminum horizontal engineering frame, white composite + graphite panels,
#    white-body / dark-top technical counter, tilted photovoltaic solar showcase module.
# =============================================================================
def build_solaris_energy_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_white = create_pbr_material("Solaris_WhiteComposite", "#f4f7fa", roughness=0.28, metalness=0.08)
    mat_graphite = create_pbr_material("Solaris_Graphite", "#1f2937", roughness=0.38, metalness=0.42)
    mat_alu = create_pbr_material("Solaris_BrushedAluminum", "#cbd5e1", roughness=0.22, metalness=0.88)
    mat_solar_blue = create_pbr_material("Solaris_SolarBlue", "#0c4a6e", roughness=0.14, metalness=0.45)
    mat_solar_yellow = create_pbr_material(
        "Solaris_WarmYellowAccent", "#facc15", roughness=0.20, emissive_hex="#eab308", emissive_strength=1.6
    )
    mat_floor = create_pbr_material("Solaris_CleanFloor", "#e2e8f0", roughness=0.42, metalness=0.08)
    mat_clean_led = create_pbr_material(
        "Solaris_CleanWhiteLight", "#f8fafc", roughness=0.12, emissive_hex="#ffffff", emissive_strength=2.3
    )

    # A. Clean Architectural White & Graphite Engineering Platform
    add_box("Floor_Plinth", (0, 0.125, 0), (7.20, 0.25, 5.40), mat_graphite, bevel=0.016, cull_bottom=True)
    add_box("Floor_AluRim", (0, 0.268, 0), (7.16, 0.018, 5.36), mat_alu, bevel=0.004, cull_bottom=True)
    add_box("Floor_Deck", (0, 0.279, 0.05), (6.92, 0.014, 5.14), mat_floor, bevel=0.004, cull_bottom=True)
    # Horizontal solar-blue + aluminum architectural floor inlays
    for fz in (-0.90, 1.90):
        add_box(f"Floor_TechLine_{fz}", (0, 0.284, fz), (6.50, 0.006, 0.036), mat_alu, bevel=0.001, cull_bottom=True)
    # Entrance step (ends z = +3.11m)
    add_box("Step_Base", (0, 0.068, 2.90), (5.40, 0.136, 0.42), mat_graphite, bevel=0.012, cull_bottom=True)
    add_box("Step_Tread", (0, 0.142, 2.89), (5.36, 0.014, 0.40), mat_white, bevel=0.003, cull_bottom=True)
    add_box("Step_YellowAccent", (0, 0.124, 3.105), (5.10, 0.010, 0.012), mat_solar_yellow, bevel=0.0)

    # B. Horizontal-Louver Clean-Tech Rear Panel Wall + Tilted Solar Module Feature
    add_box("RearWall_Core", (0, 1.72, -2.02), (4.30, 2.88, 0.22), mat_white, bevel=0.014, cull_bottom=True)
    add_box("RearWall_Base", (0, 0.47, -1.87), (4.26, 0.37, 0.11), mat_graphite, bevel=0.008, cull_bottom=True)
    add_box("RearWall_AluTrim", (0, 0.662, -1.855), (4.26, 0.018, 0.13), mat_alu, bevel=0.003)
    # Aluminum backdrop frame [0, 1.82, -1.86]
    add_box("BD_Top", (0, 3.005, -1.868), (4.12, 0.068, 0.070), mat_alu, bevel=0.004)
    add_box("BD_Bot", (0, 0.652, -1.868), (4.12, 0.036, 0.070), mat_alu, bevel=0.004)
    for sx in (-2.025, 2.025):
        add_box(f"BD_Stile_{sx}", (sx, 1.825, -1.868), (0.072, 2.39, 0.070), mat_alu, bevel=0.004)
    add_box("BD_Canopy", (0, 3.12, -1.80), (4.24, 0.068, 0.28), mat_graphite, bevel=0.006)
    add_box("BD_Diffuser", (0, 3.082, -1.74), (3.96, 0.010, 0.055), mat_clean_led, bevel=0.0)

    # Left & Right Horizontal-Groove Technical Wing Walls (flat technical engineering look)
    for side, sign in (("L", -1.0), ("R", 1.0)):
        wa = (sign * 2.76, 0.286, -1.86)
        add_local_box(f"SolWing_Core_{side}", wa, 0.0, (0, 1.38, -0.02), (1.24, 2.76, 0.14), mat_white, bevel=0.010, cull_bottom=True)
        add_local_box(f"SolWing_Cap_{side}", wa, 0.0, (0, 2.77, 0.0), (1.28, 0.030, 0.16), mat_alu, bevel=0.004)
        # 5 Crisp horizontal technical brushed-aluminum bars across right wing (and lower left wing)
        for hy in (0.55, 1.05, 1.55, 2.05, 2.50):
            if side == "R" or hy < 1.1:
                add_local_box(f"SolWing_HBar_{side}_{hy}", wa, 0.0, (0, hy, 0.058), (1.16, 0.026, 0.020), mat_alu, bevel=0.003)

    # Signature Accent: Moderate-Sized Tilted Photovoltaic Solar Showcase Panel on Left Wing ([-2.76, 1.98, -1.68])
    add_box("SolarPV_Frame", (-2.76, 1.98, -1.68), (1.02, 1.18, 0.044), mat_alu, bevel=0.005, rot_x=math.radians(-14.0))
    add_box("SolarPV_CellBed", (-2.76, 1.98, -1.658), (0.94, 1.10, 0.016), mat_solar_blue, bevel=0.002, rot_x=math.radians(-14.0))
    # Crisp silver busbar grid lines (2 vertical + 3 horizontal)
    for vx in (-2.92, -2.60):
        add_box(f"SolarPV_VBus_{vx}", (vx, 1.98, -1.648), (0.012, 1.08, 0.008), mat_alu, bevel=0.0, rot_x=math.radians(-14.0))
    for hy in (1.68, 1.98, 2.28):
        add_box(f"SolarPV_HBus_{hy}", (-2.76, hy, -1.648 + (hy - 1.98) * -0.24), (0.92, 0.012, 0.008), mat_alu, bevel=0.0, rot_x=math.radians(-14.0))
    add_box("SolarPV_YellowIndicator", (-2.76, 1.32, -1.78), (0.86, 0.016, 0.016), mat_solar_yellow, bevel=0.0)

    # C. Clean-Tech Counter (Bright White Body + Dark Graphite Top at EXACT y = 0.560m!)
    add_box("Counter_Base", (0, 0.314, 0.92), (3.20, 0.056, 0.76), mat_graphite, bevel=0.006, cull_bottom=True)
    add_box("Counter_WhiteBody", (0, 0.434, 0.92), (3.38, 0.184, 0.88), mat_white, bevel=0.010, cull_bottom=True)
    # Horizontal brushed-aluminum + solar-blue + warm-yellow tech stripe on front
    add_box("Counter_AluBar", (0, 0.458, 1.366), (3.16, 0.022, 0.016), mat_alu, bevel=0.003)
    add_box("Counter_BlueStripe", (0, 0.412, 1.366), (2.40, 0.028, 0.014), mat_solar_blue, bevel=0.002)
    add_box("Counter_YellowDot", (0, 0.412, 1.374), (0.42, 0.012, 0.010), mat_solar_yellow, bevel=0.0)
    add_box("Counter_AluRim", (0, 0.530, 0.92), (3.48, 0.018, 0.96), mat_alu, bevel=0.004)
    # Dark graphite countertop: 0.549 + 0.011 = EXACTLY 0.560m!
    add_box("Counter_GraphiteTop", (0, 0.549, 0.92), (3.44, 0.022, 0.92), mat_graphite, bevel=0.004)

    # D. Clean-Tech Equipment Racks (Aluminum Frame + Graphite Depth Panel + White Shelves, x = +-2.44m)
    for side, sx, yaw in (("L", -2.44, 0.14), ("R", 2.44, -0.14)):
        ua = (sx, 0.0, 0.68)
        la = (sx, 0.0, 1.12)
        add_local_box(f"SolRack_Back_{side}", ua, yaw, (0, 1.66, -0.39), (1.32, 2.74, 0.08), mat_white, bevel=0.008, cull_bottom=True)
        add_local_box(f"SolRack_GraphiteIn_{side}", ua, yaw, (0, 1.66, -0.344), (1.16, 2.58, 0.020), mat_graphite, bevel=0.004)
        for px in (-0.62, 0.62):
            add_local_box(f"SolRack_AluPost_{side}_{px}", ua, yaw, (px, 1.66, -0.36), (0.062, 2.74, 0.095), mat_alu, bevel=0.005, cull_bottom=True)
            add_local_box(f"SolRack_Arm_{side}_{px}", ua, yaw, (px * 0.92, 1.655, -0.04), (0.040, 0.056, 0.66), mat_alu, bevel=0.004)
        add_local_box(f"SolRack_TopHood_{side}", ua, yaw, (0, 3.03, -0.24), (1.34, 0.050, 0.30), mat_graphite, bevel=0.005)
        add_local_box(f"SolRack_TopLight_{side}", ua, yaw, (0, 3.002, -0.18), (1.14, 0.010, 0.045), mat_clean_led, bevel=0.0)
        # Upper shelf (top = EXACT 1.720m -> center 1.709, h 0.022)
        add_local_box(f"ShelfU_Rim_{side}", ua, yaw, (0, 1.690, 0.0), (1.34, 0.020, 0.74), mat_alu, bevel=0.004)
        add_local_box(f"ShelfU_Deck_{side}", ua, yaw, (0, 1.709, 0.0), (1.30, 0.022, 0.70), mat_white, bevel=0.003)
        add_local_box(f"ShelfU_BlueLine_{side}", ua, yaw, (0, 1.676, 0.35), (1.18, 0.010, 0.014), mat_solar_blue, bevel=0.0)
        # Lower shelf (top = EXACT 0.420m -> center 0.410, h 0.020)
        add_local_box(f"ShelfL_Base_{side}", la, yaw, (0, 0.338, 0.0), (1.26, 0.10, 0.68), mat_graphite, bevel=0.008, cull_bottom=True)
        add_local_box(f"ShelfL_Rim_{side}", la, yaw, (0, 0.396, 0.0), (1.36, 0.018, 0.76), mat_alu, bevel=0.004)
        add_local_box(f"ShelfL_Deck_{side}", la, yaw, (0, 0.410, 0.0), (1.32, 0.020, 0.72), mat_white, bevel=0.003)

    # E. Brushed-Aluminum Technical Portal Columns + Clean Header
    for side, sx in (("L", -3.28), ("R", 3.28)):
        add_box(f"SolCol_Base_{side}", (sx, 0.320, 2.42), (0.34, 0.072, 0.34), mat_graphite, bevel=0.008, cull_bottom=True)
        add_box(f"SolCol_AluShaft_{side}", (sx, 1.92, 2.42), (0.20, 3.20, 0.22), mat_alu, bevel=0.010, cull_bottom=True)
        add_box(f"SolCol_BlueInlay_{side}", (sx, 1.92, 2.532), (0.045, 2.50, 0.014), mat_solar_blue, bevel=0.002)
        add_box(f"SolCol_Arm_{side}", (sx, 3.44, 2.94), (0.14, 0.13, 1.08), mat_alu, bevel=0.008)
    add_standard_header_frame("SolarisHeader", mat_graphite, mat_white, mat_solar_yellow)

    return finalize_validate_and_render(
        "solaris_energy",
        "Solaris_Energy_Booth_v3",
        BOOTHS_PUBLIC_ROOT / "solaris-energy-v3",
        "solaris_energy_v3.glb",
    )


def main():
    builders = [
        ("aether_tech", build_aether_tech_v3),
        ("ecovita_coffee", build_ecovita_coffee_v3),
        ("lumina_design", build_lumina_design_v3),
        ("nordic_living", build_nordic_living_v3),
        ("solaris_energy", build_solaris_energy_v3),
    ]
    report = {"blender_version": bpy.app.version_string, "booths": {}}
    for key, fn in builders:
        report["booths"][key] = fn()

    out_json = SCRATCH_DIR / "five_booths_v3_validation.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print("ALL 5 BOOTHS V3 BUILT, VALIDATED & RENDERED:", out_json)


if __name__ == "__main__":
    main()
