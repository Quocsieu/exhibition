"""
Shared Blender 4.2.16 LTS architectural modeling, PBR material, lighting,
join-by-material optimization, and GLB export utilities for V27 Grand Expo World — V4 Universal Booths.

Coordinate convention (Blender Z-up -> glTF Y-up on export):
  - Blender X  -> Three.js X  (booth width:  -3.60 .. +3.60, total 7.20m)
  - Blender Y  -> Three.js -Z (booth depth:  -2.60 front .. +2.60 rear; front faces -Y in Blender -> +Z in Three.js)
  - Blender Z  -> Three.js Y  (height above floor: 0.00 .. ~4.35m)

Universal Dynamic Content Layer alignment (in Three.js / glTF Y-up space):
  - Floor deck top surface: Three.js y = 0.14m  (Blender z = 0.14m)
  - Rear dynamic showcase wall recess backing: Three.js z = -1.94m (Blender y = +1.94m)
    -> leaves clean flush space for dynamic backdrop plane at Three.js z = -1.86m (x in [-2.00, +2.00], y in [0.66, 2.98])
  - Front-right NPC clear zone: Three.js x in [+1.80, +3.35], z in [+1.70, +3.25] (Blender y in [-3.25, -1.70])
  - Dynamic Brand Sign mounting fascia: Three.js y = 3.42m, z = +2.28m (Blender y = -2.28m, z = 3.42m)
"""

import math
import os
import bpy
import bmesh
from mathutils import Matrix, Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def ensure_collection(name: str):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def make_pbr_mat(
    name: str,
    base_color=(0.9, 0.9, 0.9, 1.0),
    metallic=0.0,
    roughness=0.5,
    coat_weight=0.0,
    coat_roughness=0.1,
    emission_color=None,
    emission_strength=0.0,
    alpha=1.0,
    transmission=0.0,
):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if emission_color is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = emission_color
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 0.999:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else 'OPAQUE'
    if transmission > 0.0 and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    return mat


def _link_obj(obj, col):
    col.objects.link(obj)
    return obj


def _apply_smooth_with_angle(mesh):
    for poly in mesh.polygons:
        poly.use_smooth = True


def add_box(
    col,
    name: str,
    size,
    center,
    mat,
    bevel_width=0.015,
    bevel_segments=2,
    rot_euler=(0.0, 0.0, 0.0),
):
    """Create a beveled architectural box in Blender Z-up coordinates."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel_width > 0.0:
        max_b = min(sx, sy, sz) * 0.35
        bw = min(bevel_width, max_b)
        if bw > 0.001:
            bmesh.ops.bevel(
                bm,
                geom=list(bm.edges),
                offset=bw,
                segments=bevel_segments,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if bevel_width > 0.0:
        _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_cylinder(
    col,
    name: str,
    radius: float,
    height: float,
    center,
    mat,
    segments=28,
    bevel_width=0.012,
    rot_euler=(0.0, 0.0, 0.0),
):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=height,
    )
    if bevel_width > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        bw = min(bevel_width, radius * 0.25, height * 0.25)
        if cap_edges and bw > 0.001:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bw,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_hollow_ring(
    col,
    name: str,
    outer_radius: float,
    inner_radius: float,
    height: float,
    center,
    mat,
    segments=48,
    arc_start=0.0,
    arc_end=math.tau,
    bevel_width=0.012,
    rot_euler=(0.0, 0.0, 0.0),
):
    """Create a solid architectural ring or curved arc wall (extruded annular sector)."""
    bm = bmesh.new()
    full_circle = abs((arc_end - arc_start) - math.tau) < 1e-4
    n_pts = segments if full_circle else segments + 1
    hz = height * 0.5

    outer_bot, outer_top, inner_bot, inner_top = [], [], [], []
    for i in range(n_pts):
        t = i / segments
        ang = arc_start + (arc_end - arc_start) * t
        ca, sa = math.cos(ang), math.sin(ang)
        outer_bot.append(bm.verts.new((outer_radius * ca, outer_radius * sa, -hz)))
        outer_top.append(bm.verts.new((outer_radius * ca, outer_radius * sa, +hz)))
        inner_bot.append(bm.verts.new((inner_radius * ca, inner_radius * sa, -hz)))
        inner_top.append(bm.verts.new((inner_radius * ca, inner_radius * sa, +hz)))

    for i in range(segments):
        j = (i + 1) % n_pts if full_circle else i + 1
        # Outer wall
        bm.faces.new((outer_bot[i], outer_bot[j], outer_top[j], outer_top[i]))
        # Inner wall
        bm.faces.new((inner_bot[j], inner_bot[i], inner_top[i], inner_top[j]))
        # Top cap
        bm.faces.new((outer_top[i], outer_top[j], inner_top[j], inner_top[i]))
        # Bottom cap
        bm.faces.new((inner_bot[i], inner_bot[j], outer_bot[j], outer_bot[i]))

    if not full_circle:
        bm.faces.new((inner_bot[0], outer_bot[0], outer_top[0], inner_top[0]))
        bm.faces.new((outer_bot[-1], inner_bot[-1], inner_top[-1], outer_top[-1]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel_width > 0.0:
        sharp_edges = [
            e for e in bm.edges
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(40)
        ]
        bw = min(bevel_width, (outer_radius - inner_radius) * 0.28, height * 0.25)
        if sharp_edges and bw > 0.001:
            bmesh.ops.bevel(
                bm,
                geom=sharp_edges,
                offset=bw,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_rounded_rect_prism(
    col,
    name: str,
    width: float,
    depth: float,
    height: float,
    corner_radius: float,
    center,
    mat,
    corner_segments=6,
    bevel_top_bottom=0.015,
    rot_euler=(0.0, 0.0, 0.0),
):
    """Create a smooth rounded-corner architectural slab or reception counter body."""
    bm = bmesh.new()
    hw = width * 0.5
    hd = depth * 0.5
    r = min(corner_radius, hw * 0.48, hd * 0.48)
    hz = height * 0.5

    pts_2d = []
    corners = [
        (hw - r, hd - r, 0.0, math.pi * 0.5),
        (-hw + r, hd - r, math.pi * 0.5, math.pi),
        (-hw + r, -hd + r, math.pi, math.pi * 1.5),
        (hw - r, -hd + r, math.pi * 1.5, math.tau),
    ]
    for cx, cy, a0, a1 in corners:
        for s in range(corner_segments + 1):
            ang = a0 + (a1 - a0) * (s / corner_segments)
            pts_2d.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))

    bot_verts = [bm.verts.new((x, y, -hz)) for x, y in pts_2d]
    top_verts = [bm.verts.new((x, y, +hz)) for x, y in pts_2d]
    n = len(pts_2d)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot_verts[i], bot_verts[j], top_verts[j], top_verts[i]))
    bm.faces.new(top_verts)
    bm.faces.new(list(reversed(bot_verts)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    if bevel_top_bottom > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        bw = min(bevel_top_bottom, height * 0.25)
        if cap_edges and bw > 0.001:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bw,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_extruded_arch_frame(
    col,
    name: str,
    outer_w: float,
    outer_h: float,
    inner_w: float,
    inner_h: float,
    thickness_y: float,
    center,
    mat,
    arch_segments=20,
    bevel_width=0.015,
    rot_euler=(0.0, 0.0, 0.0),
):
    """Create a solid architectural portal arch (flat base at z=0, semicircular top) extruded along Y."""
    bm = bmesh.new()
    hy = thickness_y * 0.5

    outer_r = outer_w * 0.5
    inner_r = inner_w * 0.5
    outer_spring = max(0.2, outer_h - outer_r)
    inner_spring = max(0.2, inner_h - inner_r)

    # Outer contour (from right-base -> right-spring -> top arch -> left-spring -> left-base)
    outer_pts = [(outer_r, 0.0)]
    for i in range(arch_segments + 1):
        ang = math.pi * (i / arch_segments)
        outer_pts.append((outer_r * math.cos(ang), outer_spring + outer_r * math.sin(ang)))
    outer_pts.append((-outer_r, 0.0))

    inner_pts = [(inner_r, 0.0)]
    for i in range(arch_segments + 1):
        ang = math.pi * (i / arch_segments)
        inner_pts.append((inner_r * math.cos(ang), inner_spring + inner_r * math.sin(ang)))
    inner_pts.append((-inner_r, 0.0))

    n = len(outer_pts)
    of_v = [bm.verts.new((x, -hy, z)) for x, z in outer_pts]
    ob_v = [bm.verts.new((x, +hy, z)) for x, z in outer_pts]
    if_v = [bm.verts.new((x, -hy, z)) for x, z in inner_pts]
    ib_v = [bm.verts.new((x, +hy, z)) for x, z in inner_pts]

    for i in range(n - 1):
        # Front face (-Y)
        bm.faces.new((of_v[i], of_v[i + 1], if_v[i + 1], if_v[i]))
        # Back face (+Y)
        bm.faces.new((ib_v[i], ib_v[i + 1], ob_v[i + 1], ob_v[i]))
        # Outer rim
        bm.faces.new((ob_v[i], ob_v[i + 1], of_v[i + 1], of_v[i]))
        # Inner soffit
        bm.faces.new((if_v[i], if_v[i + 1], ib_v[i + 1], ib_v[i]))

    # Bottom feet caps
    bm.faces.new((of_v[0], if_v[0], ib_v[0], ob_v[0]))
    bm.faces.new((if_v[-1], of_v[-1], ob_v[-1], ib_v[-1]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel_width > 0.0:
        sharp_edges = [
            e for e in bm.edges
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(40)
        ]
        bw = min(bevel_width, thickness_y * 0.25, (outer_r - inner_r) * 0.25)
        if sharp_edges and bw > 0.001:
            bmesh.ops.bevel(
                bm,
                geom=sharp_edges,
                offset=bw,
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_wave_wall(
    col,
    name: str,
    width: float,
    base_height: float,
    wave_amp: float,
    wave_cycles: float,
    wave_phase: float,
    thickness_y: float,
    depth_curve_amp: float,
    center,
    mat,
    segments=32,
):
    """Create a sculpted architectural wave wall with sinusoidal top crest and subtle S-plan curvature."""
    bm = bmesh.new()
    hy = thickness_y * 0.5
    front_bot, front_top, back_bot, back_top = [], [], [], []
    for i in range(segments + 1):
        t = i / segments
        x = (t - 0.5) * width
        h = base_height + wave_amp * math.sin(t * math.tau * wave_cycles + wave_phase)
        y_off = depth_curve_amp * math.sin(t * math.pi)
        front_bot.append(bm.verts.new((x, y_off - hy, 0.0)))
        front_top.append(bm.verts.new((x, y_off - hy, h)))
        back_bot.append(bm.verts.new((x, y_off + hy, 0.0)))
        back_top.append(bm.verts.new((x, y_off + hy, h)))

    for i in range(segments):
        bm.faces.new((front_bot[i], front_bot[i + 1], front_top[i + 1], front_top[i]))
        bm.faces.new((back_bot[i + 1], back_bot[i], back_top[i], back_top[i + 1]))
        bm.faces.new((front_top[i], front_top[i + 1], back_top[i + 1], back_top[i]))
        bm.faces.new((back_bot[i], back_bot[i + 1], front_bot[i + 1], front_bot[i]))

    bm.faces.new((back_bot[0], front_bot[0], front_top[0], back_top[0]))
    bm.faces.new((front_bot[-1], back_bot[-1], back_top[-1], front_top[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    _apply_smooth_with_angle(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.data.materials.append(mat)
    return _link_obj(obj, col)


def add_standard_deck(
    col,
    mat_deck,
    mat_plinth,
    mat_trim,
    mat_led=None,
    width=7.16,
    depth=5.16,
    corner_radius=0.22,
):
    """Build a crisp, flush architectural booth floor deck (top at z = 0.14m) with recessed plinth & metal trim."""
    # Recessed dark plinth reveal (z = 0.0 .. 0.05)
    add_rounded_rect_prism(
        col, "Deck_Plinth", width - 0.14, depth - 0.14, 0.05,
        corner_radius * 0.85, (0.0, 0.0, 0.025), mat_plinth, corner_segments=5, bevel_top_bottom=0.005
    )
    # Main architectural floor slab (z = 0.05 .. 0.14)
    add_rounded_rect_prism(
        col, "Deck_Main", width, depth, 0.09,
        corner_radius, (0.0, 0.0, 0.095), mat_deck, corner_segments=6, bevel_top_bottom=0.014
    )
    # Perimeter metallic trim band
    add_rounded_rect_prism(
        col, "Deck_Trim", width + 0.04, depth + 0.04, 0.026,
        corner_radius + 0.01, (0.0, 0.0, 0.128), mat_trim, corner_segments=6, bevel_top_bottom=0.004
    )
    # Subtle recessed cove LED under deck front edge
    if mat_led is not None:
        add_box(col, "Deck_Front_LED", (width - 0.7, 0.04, 0.018), (0.0, -depth * 0.5 + 0.06, 0.042), mat_led, bevel_width=0.0)
    # Low front threshold step (Blender y = -depth/2 - 0.18 -> Three.js z = +2.76m)
    add_rounded_rect_prism(
        col, "Deck_Front_Step", width - 1.2, 0.36, 0.065,
        0.08, (0.0, -depth * 0.5 - 0.16, 0.0325), mat_plinth, corner_segments=4, bevel_top_bottom=0.01
    )


def add_universal_showcase_backing(
    col,
    mat_wall,
    mat_recess,
    mat_trim,
    mat_led,
    recess_y=1.96,
):
    """
    Create the universal rear architectural showcase recess backing behind Three.js z = -1.86m
    (Blender y = +1.96m) so Booth.tsx dynamic backdrop & slot_01/slot_02 sit flush inside a real
    beveled architectural surround with top cove lighting.
    """
    # Solid rear backing panel behind dynamic backdrop
    add_box(col, "Showcase_Back_Plate", (4.26, 0.14, 2.52), (0.0, recess_y + 0.09, 1.82), mat_recess, bevel_width=0.015)
    # Perimeter beveled surround frame around the 3.96m x 2.28m dynamic showcase aperture
    add_box(col, "Showcase_Frame_Top", (4.36, 0.24, 0.14), (0.0, recess_y + 0.01, 3.04), mat_wall, bevel_width=0.015)
    add_box(col, "Showcase_Frame_Bot", (4.36, 0.28, 0.52), (0.0, recess_y - 0.02, 0.40), mat_wall, bevel_width=0.018)
    add_box(col, "Showcase_Frame_L", (0.16, 0.24, 2.52), (-2.10, recess_y + 0.01, 1.82), mat_wall, bevel_width=0.015)
    add_box(col, "Showcase_Frame_R", (0.16, 0.24, 2.52), (+2.10, recess_y + 0.01, 1.82), mat_wall, bevel_width=0.015)
    # Metallic inner reveal trim
    add_box(col, "Showcase_Trim_Top", (4.06, 0.04, 0.03), (0.0, recess_y - 0.09, 2.97), mat_trim, bevel_width=0.004)
    add_box(col, "Showcase_Trim_Bot", (4.06, 0.04, 0.03), (0.0, recess_y - 0.11, 0.66), mat_trim, bevel_width=0.004)
    # Soft concealed overhead cove light bar
    add_box(col, "Showcase_Cove_LED", (3.84, 0.035, 0.022), (0.0, recess_y - 0.07, 2.95), mat_led, bevel_width=0.0)


def optimize_and_join_by_material(col, prefix: str):
    """
    Merge all mesh objects in `col` by their primary material so each booth exports
    with minimal draw calls (typically 6-10 meshes) while keeping exact PBR material separation.
    """
    bpy.context.view_layer.update()
    by_mat = {}
    for obj in list(col.objects):
        if obj.type != 'MESH' or not obj.data.materials:
            continue
        mat_name = obj.data.materials[0].name
        by_mat.setdefault(mat_name, []).append(obj)

    joined_objs = []
    for mat_name, objs in by_mat.items():
        if len(objs) == 1:
            obj = objs[0]
            obj.name = f"{prefix}_{mat_name}"
            joined_objs.append(obj)
            continue

        bm_merged = bmesh.new()
        for obj in objs:
            mesh = obj.data
            bm_tmp = bmesh.new()
            bm_tmp.from_mesh(mesh)
            bm_tmp.transform(obj.matrix_basis)
            # Merge into bm_merged
            vert_map = {}
            for v in bm_tmp.verts:
                vert_map[v.index] = bm_merged.verts.new(v.co)
            for f in bm_tmp.faces:
                try:
                    nf = bm_merged.faces.new([vert_map[v.index] for v in f.verts])
                    nf.smooth = f.smooth
                except ValueError:
                    pass
            bm_tmp.free()
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)

        bmesh.ops.recalc_face_normals(bm_merged, faces=bm_merged.faces)
        new_mesh = bpy.data.meshes.new(f"{prefix}_{mat_name}_Mesh")
        bm_merged.to_mesh(new_mesh)
        bm_merged.free()
        new_obj = bpy.data.objects.new(f"{prefix}_{mat_name}", new_mesh)
        new_obj.data.materials.append(bpy.data.materials[mat_name])
        col.objects.link(new_obj)
        joined_objs.append(new_obj)

    return joined_objs


def export_booth_glb(col, output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    total_tris = 0
    mesh_count = 0
    mats = set()
    min_co = Vector((1e9, 1e9, 1e9))
    max_co = Vector((-1e9, -1e9, -1e9))

    for obj in col.objects:
        if obj.type == 'MESH':
            obj.select_set(True)
            mesh_count += 1
            obj.data.calc_loop_triangles()
            total_tris += len(obj.data.loop_triangles)
            for m in obj.data.materials:
                if m:
                    mats.add(m.name)
            for corner in obj.bound_box:
                wc = obj.matrix_world @ Vector(corner)
                min_co.x = min(min_co.x, wc.x)
                min_co.y = min(min_co.y, wc.y)
                min_co.z = min(min_co.z, wc.z)
                max_co.x = max(max_co.x, wc.x)
                max_co.y = max(max_co.y, wc.y)
                max_co.z = max(max_co.z, wc.z)

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_materials='EXPORT',
        export_yup=True,
    )
    file_kb = os.path.getsize(output_path) / 1024.0
    stats = {
        "output": output_path,
        "file_kb": round(file_kb, 1),
        "meshes": mesh_count,
        "materials": len(mats),
        "triangles": total_tris,
        "size_xyz_m": [
            round(max_co.x - min_co.x, 3),
            round(max_co.z - min_co.z, 3),  # glTF Y (height)
            round(max_co.y - min_co.y, 3),  # glTF Z (depth)
        ],
    }
    print("[V4 EXPORT STATS]", stats)
    return stats


def setup_studio_render(out_dir: str, booth_slug: str):
    """Render 4 architectural QA views (front, 3/4, isometric, counter closeup) with Eevee Next."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items else 'BLENDER_EEVEE'
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 16
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 750
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'

    world = bpy.data.worlds.new("QAStudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.76, 0.82, 0.89, 1.0)
        bg.inputs[1].default_value = 0.45

    # Studio floor plane (darker neutral mid-gray so cream/white booths pop with crisp contrast)
    bpy.ops.mesh.primitive_plane_add(size=28.0, location=(0.0, 0.0, -0.002))
    floor = bpy.context.active_object
    floor.data.materials.append(make_pbr_mat("QA_Floor", (0.58, 0.61, 0.65, 1.0), metallic=0.0, roughness=0.52))

    # Key, Fill, Rim lights
    for lname, ltype, energy, loc, rot in [
        ("KeySun", 'SUN', 1.65, (6.0, -8.0, 10.0), (math.radians(48), 0.0, math.radians(32))),
        ("FillArea", 'AREA', 85.0, (-7.0, -7.0, 6.0), (math.radians(55), 0.0, math.radians(-42))),
        ("RimArea", 'AREA', 65.0, (0.0, 7.0, 6.5), (math.radians(-45), 0.0, 0.0)),
    ]:
        ldata = bpy.data.lights.new(lname, type=ltype)
        ldata.energy = energy
        if ltype == 'AREA':
            ldata.size = 4.5
        lobj = bpy.data.objects.new(lname, ldata)
        lobj.location = loc
        lobj.rotation_euler = rot
        scene.collection.objects.link(lobj)

    cam_data = bpy.data.cameras.new("QACam")
    cam_data.lens = 35.0
    cam = bpy.data.objects.new("QACam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def aim_and_render(filename, loc, target, lens=35.0):
        cam.location = Vector(loc)
        cam_data.lens = lens
        direction = Vector(target) - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out_dir, filename)
        bpy.ops.render.render(write_still=True)

    aim_and_render(f"{booth_slug}_01_front.png", (0.0, -9.2, 2.35), (0.0, 0.0, 1.85), lens=36.0)
    aim_and_render(f"{booth_slug}_02_three_quarter.png", (6.8, -7.8, 3.3), (0.0, 0.1, 1.65), lens=34.0)
    aim_and_render(f"{booth_slug}_03_isometric.png", (-7.6, -7.6, 6.4), (0.0, 0.1, 1.35), lens=38.0)
    aim_and_render(f"{booth_slug}_04_counter_closeup.png", (2.6, -4.4, 1.75), (-0.7, -0.4, 0.95), lens=42.0)
