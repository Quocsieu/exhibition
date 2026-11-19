"""
Kinetix Robotics & AI - Bespoke 3D Exhibition Booth Generator (Version 3)
Style: HIGH-END STYLIZED REALISM (Hannover Messe / Automatica Trade-Fair Architecture)

Strict Spatial & Functional Compatibility Guarantees:
- Origin [0, 0, 0] at ground level, front facing +Z in Three.js (-Y in Blender)
- Plinth footprint: 7.20m x 5.40m (x in [-3.60, +3.60], z in [-2.70, +2.70]), front threshold ends at z = +3.12m
  (100% clear of NPC Khanh Linh at [+2.32, 0.02, +3.24] and front-right planter at [+3.65, 0.02, +3.68])
- Hero Counter (KHU B): centered at [0, y, +0.92], top deck at EXACTLY y = 0.560m (slots 01 & 02 compatible,
  100% clear of dual Backdrop Product Bays at y = 0.854m..2.494m)
- Symmetric 2-Tier Display Modules (KHU C1 & C2):
  * Left:  x = -2.44m (rotY = +0.14 rad inward), Upper surface y = 1.720m (z = +0.68m), Lower surface y = 0.420m (z = +1.12m)
  * Right: x = +2.44m (rotY = -0.14 rad inward), Upper surface y = 1.720m (z = +0.68m), Lower surface y = 0.420m (z = +1.12m)
- Rear Backdrop Architecture: frames dynamic 3.96m x 2.28m canvas at [0, 1.82, -1.86] with zero coplanar overlap,
  plus grounded wainscot base and angled composite wing walls (roofless, max height 3.20m)
- Header Fascia Architecture: frames front [0, 3.38, +3.60] & rear [0, 3.38, +3.36] dynamic 6.36m x 0.68m sign planes
  with <= 2.8cm bezel overhang so 100% of typography is readable from both 44-deg Isometric Overview and Focus views.
- Output: FE/public/models/booths/kinetix-v3/kinetix_booth_v3.glb (V2 preserved intact for instant rollback)
"""

import bpy
import bmesh
import math
import os
from pathlib import Path
from mathutils import Matrix, Vector

REPO_ROOT = Path(r"E:/Lập trình/MatBaoWS/exhibition")
DEST_DIR = REPO_ROOT / "FE/public/models/booths/kinetix-v3"
DEST_DIR.mkdir(parents=True, exist_ok=True)
OUT_GLB = DEST_DIR / "kinetix_booth_v3.glb"


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_color: str, alpha: float = 1.0):
    h = hex_color.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)


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


def apply_clean_shading(obj, bevel_width: float = 0.0, bevel_segments: int = 1):
    if bevel_width > 0.0:
        mod = obj.modifiers.new("ArchChamfer", "BEVEL")
        mod.width = bevel_width
        mod.segments = bevel_segments
        mod.use_clamp_overlap = True
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        mod.harden_normals = False
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Smooth shade + Weighted Normals for crisp architectural reflections without high poly counts
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


def three_to_blender_pos(pos):
    # Three.js (X_right, Y_up, Z_front) -> Blender (X_right, -Z_front, Y_up)
    return (pos[0], -pos[2], pos[1])


def add_box(
    name: str,
    pos,
    size,
    mat,
    bevel: float = 0.008,
    segments: int = 1,
    rot_y: float = 0.0,
    rot_x: float = 0.0,
    cull_bottom: bool = False,
):
    """
    Creates an architectural box in Three.js coordinates:
    pos = (x, y_center, z), size = (width_x, height_y, depth_z)
    rot_y = yaw in radians around Three.js +Y (which is +Z rotation in Blender!)
    rot_x = pitch in radians around Three.js +X (which is +X rotation in Blender)
    """
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=three_to_blender_pos(pos))
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
    apply_clean_shading(obj, bevel_width=bevel, bevel_segments=segments)

    if abs(rot_x) > 1e-6 or abs(rot_y) > 1e-6:
        # Three.js Rx around +X -> Blender Rx; Three.js Ry around +Y -> Blender Rz
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
    """
    Places a box in a local frame centered at `anchor_pos` (Three.js x, 0, z) rotated by `anchor_rot_y`
    around Three.js +Y. Guarantees exact alignment for angled architectural modules (wing walls & shelves).
    """
    ax, ay, az = anchor_pos
    lx, ly, lz = local_offset
    cos_r = math.cos(anchor_rot_y)
    sin_r = math.sin(anchor_rot_y)
    wx = ax + lx * cos_r + lz * sin_r
    wy = ay + ly
    wz = az - lx * sin_r + lz * cos_r
    return add_box(
        name=name,
        pos=(wx, wy, wz),
        size=size,
        mat=mat,
        bevel=bevel,
        segments=1,
        rot_y=anchor_rot_y,
        cull_bottom=cull_bottom,
    )


def add_disc_inlay(name: str, pos, radius: float, height: float, mat, vertices: int = 24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=height,
        location=three_to_blender_pos(pos),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    apply_clean_shading(obj, bevel_width=0.002, bevel_segments=1)
    return obj


def generate_kinetix_v3():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # =========================================================================
    # 1. COHESIVE PBR MATERIAL PALETTE (9 Materials, Zero 4K Texture Bloat)
    #    Palette: Graphite, Dark Navy, Machined Gunmetal, Brushed Silver,
    #    Matte Polymer, Tempered Glass, Precision Cyan LED, Soft Architectural Light
    # =========================================================================
    mat_plinth_graphite = create_pbr_material(
        "Kinetix_PlinthGraphite", "#141923", roughness=0.56, metalness=0.18
    )
    mat_deck_composite = create_pbr_material(
        "Kinetix_DeckComposite", "#1d2635", roughness=0.44, metalness=0.14
    )
    mat_dark_navy = create_pbr_material(
        "Kinetix_DarkNavyWall", "#101b2e", roughness=0.46, metalness=0.22
    )
    mat_gunmetal = create_pbr_material(
        "Kinetix_PaintedGunmetal", "#2a3444", roughness=0.32, metalness=0.76
    )
    mat_brushed_silver = create_pbr_material(
        "Kinetix_BrushedSilver", "#cbd5e1", roughness=0.24, metalness=0.88
    )
    mat_matte_polymer = create_pbr_material(
        "Kinetix_MattePolymer", "#222c3c", roughness=0.35, metalness=0.12
    )
    mat_tempered_glass = create_pbr_material(
        "Kinetix_TemperedGlass", "#0b1526", roughness=0.09, metalness=0.18
    )
    mat_led_cyan = create_pbr_material(
        "Kinetix_AccentCyanLED",
        "#22d3ee",
        roughness=0.16,
        metalness=0.0,
        emissive_hex="#06b6d4",
        emissive_strength=2.2,
    )
    mat_soft_light = create_pbr_material(
        "Kinetix_SoftTaskLight",
        "#f8fafc",
        roughness=0.14,
        metalness=0.0,
        emissive_hex="#e2e8f0",
        emissive_strength=2.5,
    )

    # =========================================================================
    # A. ARCHITECTURAL RAISED PLATFORM & LOW-PROFILE ENTRANCE THRESHOLD
    #    Footprint: 7.20m x 5.40m (x in [-3.60, +3.60], z in [-2.70, +2.70])
    #    Deck top at y = 0.280m; Front welcome step ends at z = +3.12m (behind NPC)
    # =========================================================================
    # Main structural sub-plinth (y = 0.000..0.255m)
    add_box(
        "Floor_SubPlinth",
        (0.0, 0.1275, 0.0),
        (7.20, 0.255, 5.40),
        mat_plinth_graphite,
        bevel=0.018,
        cull_bottom=True,
    )

    # Recessed perimeter cyan light channel under outer deck coping (y = 0.255..0.268m)
    add_box(
        "Floor_Perimeter_LED_Front",
        (0.0, 0.260, 2.665),
        (7.08, 0.014, 0.018),
        mat_led_cyan,
        bevel=0.0,
    )
    for sx in (-1.0, 1.0):
        add_box(
            f"Floor_Perimeter_LED_Side_{sx}",
            (sx * 3.565, 0.260, 0.0),
            (0.018, 0.014, 5.30),
            mat_led_cyan,
            bevel=0.0,
        )

    # Brushed-aluminum outer architectural coping frame (y = 0.265..0.280m)
    add_box(
        "Floor_Aluminum_PerimeterCoping",
        (0.0, 0.2725, 0.0),
        (7.16, 0.015, 5.36),
        mat_brushed_silver,
        bevel=0.004,
        cull_bottom=True,
    )

    # Three-zone Satin Technical Composite Deck (top at y = 0.284m) with flush metal joint inlays
    add_box(
        "Floor_CenterShowcaseDeck",
        (0.0, 0.278, 0.06),
        (3.84, 0.012, 5.12),
        mat_deck_composite,
        bevel=0.003,
        cull_bottom=True,
    )
    for side_label, sx in (("Left", -2.72), ("Right", 2.72)):
        add_box(
            f"Floor_WingDeck_{side_label}",
            (sx, 0.278, 0.06),
            (1.52, 0.012, 5.12),
            mat_matte_polymer,
            bevel=0.003,
            cull_bottom=True,
        )
    for jx in (-1.94, 1.94):
        add_box(
            f"Floor_ExpansionJoint_{jx}",
            (jx, 0.281, 0.06),
            (0.032, 0.008, 5.12),
            mat_brushed_silver,
            bevel=0.001,
            cull_bottom=True,
        )

    # Front Low-Profile Architectural Entrance Threshold (z = +2.70m..+3.12m, height = 0.145m)
    add_box(
        "Entrance_Step_Base",
        (0.0, 0.070, 2.90),
        (5.36, 0.140, 0.42),
        mat_plinth_graphite,
        bevel=0.014,
        cull_bottom=True,
    )
    add_box(
        "Entrance_Step_Tread",
        (0.0, 0.144, 2.89),
        (5.32, 0.012, 0.40),
        mat_deck_composite,
        bevel=0.003,
        cull_bottom=True,
    )
    add_box(
        "Entrance_Step_AluminumNosing",
        (0.0, 0.145, 3.10),
        (5.36, 0.016, 0.032),
        mat_brushed_silver,
        bevel=0.003,
    )
    add_box(
        "Entrance_Step_ToeGlow",
        (0.0, 0.126, 3.105),
        (5.16, 0.010, 0.012),
        mat_led_cyan,
        bevel=0.0,
    )

    # =========================================================================
    # B. FULL-WIDTH ARCHITECTURAL REAR WALL COMPOSITION (ROOFLESS, H <= 3.22m)
    #    - Dynamic Backdrop Canvas is mounted by React at [0, 1.82, -1.86] (3.96m x 2.28m -> x in [-1.98, +1.98], y in [0.68, 2.96])
    #    - Dual Product Bays sit at [+-0.882, 1.674, -1.842]
    #    - Zero geometry inside z > -1.880m over canvas area -> ZERO Z-fighting!
    # =========================================================================
    # 1. Center Solid Architectural Wall Volume (z = -2.14m..-1.90m -> 0.24m real wall thickness)
    add_box(
        "RearWall_CenterCore",
        (0.0, 1.72, -2.02),
        (4.32, 2.88, 0.24),
        mat_gunmetal,
        bevel=0.016,
        cull_bottom=True,
    )

    # 2. Grounded Wainscot Base Plinth under Backdrop Canvas (y = 0.284..0.665m, z = -1.90..-1.80m)
    add_box(
        "RearWall_WainscotBase",
        (0.0, 0.472, -1.87),
        (4.28, 0.376, 0.12),
        mat_dark_navy,
        bevel=0.010,
        cull_bottom=True,
    )
    add_box(
        "RearWall_WainscotDatumTrim",
        (0.0, 0.666, -1.855),
        (4.28, 0.018, 0.14),
        mat_brushed_silver,
        bevel=0.003,
    )
    # Subtle recessed service bay seam lines on wainscot
    for wx in (-1.32, 0.0, 1.32):
        add_box(
            f"RearWall_WainscotSeam_{wx}",
            (wx, 0.47, -1.808),
            (0.016, 0.30, 0.012),
            mat_gunmetal,
            bevel=0.002,
        )

    # 3. Precision Brushed-Aluminum Bezel & Cyan Cove Reveal framing the [0, 1.82, -1.86] Canvas
    # Top & Bottom horizontal frame rails (outside y = 0.68..2.96)
    add_box(
        "Backdrop_Frame_TopRail",
        (0.0, 3.005, -1.868),
        (4.14, 0.075, 0.075),
        mat_brushed_silver,
        bevel=0.005,
    )
    add_box(
        "Backdrop_Frame_BottomRail",
        (0.0, 0.650, -1.868),
        (4.14, 0.040, 0.075),
        mat_brushed_silver,
        bevel=0.004,
    )
    # Left & Right vertical frame stiles (outside x = +-1.98)
    for sx in (-2.03, 2.03):
        add_box(
            f"Backdrop_Frame_Stile_{sx}",
            (sx, 1.825, -1.868),
            (0.080, 2.40, 0.075),
            mat_brushed_silver,
            bevel=0.005,
        )
        # Precision cyan vertical edge reveal outside the aluminum stile
        add_box(
            f"Backdrop_SideCoveLED_{sx}",
            (sx + (0.048 if sx > 0 else -0.048), 1.825, -1.885),
            (0.014, 2.34, 0.018),
            mat_led_cyan,
            bevel=0.0,
        )

    # 4. Integrated Cantilevered Linear Wash-Light Canopy above Backdrop (y = 3.12m)
    add_box(
        "Backdrop_LightCanopy_Housing",
        (0.0, 3.13, -1.81),
        (4.24, 0.075, 0.28),
        mat_gunmetal,
        bevel=0.008,
    )
    add_box(
        "Backdrop_LightCanopy_Trim",
        (0.0, 3.13, -1.668),
        (4.24, 0.045, 0.018),
        mat_brushed_silver,
        bevel=0.003,
    )
    add_box(
        "Backdrop_LinearWashDiffuser",
        (0.0, 3.090, -1.75),
        (3.96, 0.012, 0.06),
        mat_soft_light,
        bevel=0.0,
    )

    # 5. Symmetric Angled Architectural Wing Walls (x = +-2.74m, angled +-12 deg inward)
    #    Adds genuine trade-fair booth depth and encloses the rear corners cleanly without a roof!
    for side_label, sign in (("Left", -1.0), ("Right", 1.0)):
        wing_anchor = (sign * 2.76, 0.284, -1.78)
        wing_yaw = -sign * math.radians(12.0)

        # Wing structural wall core (width = 1.26m, height = 2.76m -> top at y = 3.044m, thickness = 0.16m)
        add_local_box(
            f"WingWall_Core_{side_label}",
            wing_anchor,
            wing_yaw,
            (0.0, 1.38, 0.0),
            (1.26, 2.76, 0.16),
            mat_gunmetal,
            bevel=0.012,
            cull_bottom=True,
        )
        # Recessed Dark-Navy architectural cladding panel on front face
        add_local_box(
            f"WingWall_Cladding_{side_label}",
            wing_anchor,
            wing_yaw,
            (0.0, 1.38, 0.072),
            (1.14, 2.60, 0.035),
            mat_dark_navy,
            bevel=0.006,
        )
        # 4 Vertical Brushed-Aluminum Architectural Acoustic Ribs
        for r_idx, rx in enumerate((-0.39, -0.13, 0.13, 0.39)):
            add_local_box(
                f"WingWall_AluRib_{side_label}_{r_idx}",
                wing_anchor,
                wing_yaw,
                (rx, 1.38, 0.094),
                (0.026, 2.44, 0.022),
                mat_brushed_silver,
                bevel=0.003,
            )
        # Top brushed-aluminum architectural cap
        add_local_box(
            f"WingWall_TopCap_{side_label}",
            wing_anchor,
            wing_yaw,
            (0.0, 2.768, 0.0),
            (1.28, 0.022, 0.175),
            mat_brushed_silver,
            bevel=0.004,
        )

    # =========================================================================
    # C. HERO EXHIBITION COUNTER (KHU B)
    #    Centered at [0, y, +0.92], Top Deck at EXACTLY y = 0.560m
    #    Multi-material gunmetal + dark navy + brushed aluminum + matte polymer
    # =========================================================================
    # Recessed plinth kickplate (y = 0.284..0.340m)
    add_box(
        "Counter_ToeKick_Base",
        (0.0, 0.312, 0.92),
        (3.20, 0.056, 0.76),
        mat_plinth_graphite,
        bevel=0.006,
        cull_bottom=True,
    )
    add_box(
        "Counter_ToeKick_LED",
        (0.0, 0.336, 1.305),
        (3.10, 0.010, 0.014),
        mat_led_cyan,
        bevel=0.0,
    )

    # Main sculpted chassis (y = 0.340..0.522m)
    add_box(
        "Counter_MainChassis",
        (0.0, 0.431, 0.92),
        (3.38, 0.182, 0.88),
        mat_gunmetal,
        bevel=0.012,
        cull_bottom=True,
    )

    # Left & Right Brushed-Aluminum Corner Bolster Cheeks
    for side_label, cx in (("Left", -1.61), ("Right", 1.61)):
        add_box(
            f"Counter_SideBolster_{side_label}",
            (cx, 0.432, 0.92),
            (0.18, 0.184, 0.90),
            mat_brushed_silver,
            bevel=0.010,
            cull_bottom=True,
        )

    # Front Dark-Navy Recessed Fascia Panel with 2 Clean Brushed-Aluminum Louver Bars & Cyan Indicator
    add_box(
        "Counter_FrontFascia",
        (0.0, 0.431, 1.356),
        (2.96, 0.144, 0.028),
        mat_dark_navy,
        bevel=0.005,
    )
    for fy in (0.398, 0.464):
        add_box(
            f"Counter_FrontAluTrim_{fy}",
            (0.0, fy, 1.372),
            (2.82, 0.014, 0.014),
            mat_brushed_silver,
            bevel=0.002,
        )
    add_box(
        "Counter_CenterStatusBar",
        (0.0, 0.431, 1.374),
        (0.86, 0.012, 0.012),
        mat_led_cyan,
        bevel=0.0,
    )

    # Brushed-Aluminum Countertop Collar & Matte Polymer Top Surface (EXACT top y = 0.560m!)
    add_box(
        "Counter_Top_AluRim",
        (0.0, 0.531, 0.92),
        (3.48, 0.020, 0.96),
        mat_brushed_silver,
        bevel=0.004,
    )
    # Center y = 0.549, height = 0.022 -> Top surface = 0.549 + 0.011 = EXACTLY 0.560m!
    add_box(
        "Counter_Top_Deck",
        (0.0, 0.549, 0.92),
        (3.44, 0.022, 0.92),
        mat_matte_polymer,
        bevel=0.004,
    )
    # Subtle flush brushed-silver turntables/placement rings at slot_01 (-0.88) & slot_02 (+0.88)
    for sx in (-0.88, 0.88):
        add_disc_inlay(
            f"Counter_SlotPad_{sx}",
            (sx, 0.5595, 0.92),
            radius=0.28,
            height=0.003,
            mat=mat_brushed_silver,
            vertices=24,
        )
        add_disc_inlay(
            f"Counter_SlotInner_{sx}",
            (sx, 0.560, 0.92),
            radius=0.255,
            height=0.003,
            mat=mat_tempered_glass,
            vertices=24,
        )

    # =========================================================================
    # D. SYMMETRIC 2-TIER CANTILEVERED PRODUCT DISPLAY MODULES (KHU C1 & C2)
    #    - Left:  x = -2.44m, angled +0.14 rad inward (matches SlotProductDisplay!)
    #    - Right: x = +2.44m, angled -0.14 rad inward (matches SlotProductDisplay!)
    #    - Upper Tier top surface at EXACTLY y = 1.720m (centered at z = +0.68m)
    #    - Lower Tier top surface at EXACTLY y = 0.420m (centered at z = +1.12m)
    #    - Cantilevered from rear architectural spine -> ZERO front poles blocking view!
    # =========================================================================
    for side_label, sx, shelf_yaw in (
        ("Left", -2.44, 0.14),
        ("Right", 2.44, -0.14),
    ):
        # Anchor at the Upper Shelf center (sx, 0.0, 0.68) so Upper Shelf is at local (0, y, 0)
        # and Lower Shelf (sx, y, 1.12) is at local offset along +Z!
        # Wait: keep exact world centers (-2.44, 1.72, 0.68) and (-2.44, 0.42, 1.12) by rotating each sub-assembly around its exact slot X/Z or shared spine!
        upper_anchor = (sx, 0.0, 0.68)
        lower_anchor = (sx, 0.0, 1.12)

        # 1. Rear Architectural Spine Wall behind Upper & Lower Shelves (local z = -0.40m -> world z ~ 0.28m)
        add_local_box(
            f"Shelf_SpineCore_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 1.66, -0.40),
            (1.32, 2.76, 0.085),
            mat_gunmetal,
            bevel=0.010,
            cull_bottom=True,
        )
        add_local_box(
            f"Shelf_SpinePanel_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 1.66, -0.352),
            (1.18, 2.62, 0.022),
            mat_dark_navy,
            bevel=0.004,
        )
        # Subtle architectural horizontal datum seams across shelf backing panel
        for sy in (0.98, 2.18, 2.62):
            add_local_box(
                f"Shelf_SpineDatum_{side_label}_{sy}",
                upper_anchor,
                shelf_yaw,
                (0.0, sy, -0.338),
                (1.14, 0.010, 0.010),
                mat_gunmetal,
                bevel=0.001,
            )
        # Flanking brushed-aluminum vertical pilasters on spine
        for px in (-0.62, 0.62):
            add_local_box(
                f"Shelf_Pilaster_{side_label}_{px}",
                upper_anchor,
                shelf_yaw,
                (px, 1.66, -0.38),
                (0.065, 2.76, 0.105),
                mat_brushed_silver,
                bevel=0.005,
                cull_bottom=True,
            )
            # Clean cantilevered side support arms under Upper Shelf (y = 1.63m, local z = -0.34..+0.24m)
            add_local_box(
                f"Shelf_CantileverArm_{side_label}_{px}",
                upper_anchor,
                shelf_yaw,
                (px * 0.92, 1.655, -0.04),
                (0.042, 0.065, 0.68),
                mat_gunmetal,
                bevel=0.005,
            )

        # Top Integrated Downlight Visor on Shelf Spine (y = 3.03m — clears max product height 2.96m!)
        add_local_box(
            f"Shelf_TopLightHood_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 3.03, -0.26),
            (1.34, 0.052, 0.28),
            mat_gunmetal,
            bevel=0.006,
        )
        add_local_box(
            f"Shelf_TopLightDiffuser_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 3.002, -0.20),
            (1.16, 0.010, 0.055),
            mat_soft_light,
            bevel=0.0,
        )

        # 2. Upper Shelf Deck (EXACT top surface y = 1.720m -> center y = 1.709, height = 0.022)
        add_local_box(
            f"Shelf_Upper_Frame_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 1.690, 0.0),
            (1.34, 0.024, 0.74),
            mat_brushed_silver,
            bevel=0.004,
        )
        add_local_box(
            f"Shelf_Upper_Deck_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 1.709, 0.0),
            (1.30, 0.022, 0.70),
            mat_matte_polymer,
            bevel=0.003,
        )
        add_local_box(
            f"Shelf_Upper_EdgeLED_{side_label}",
            upper_anchor,
            shelf_yaw,
            (0.0, 1.676, 0.355),
            (1.24, 0.010, 0.014),
            mat_led_cyan,
            bevel=0.0,
        )

        # 3. Lower Shelf Plinth (EXACT top surface y = 0.420m at [sx, 0.42, 1.12])
        add_local_box(
            f"Shelf_Lower_Plinth_{side_label}",
            lower_anchor,
            shelf_yaw,
            (0.0, 0.336, 0.0),
            (1.26, 0.104, 0.68),
            mat_gunmetal,
            bevel=0.008,
            cull_bottom=True,
        )
        add_local_box(
            f"Shelf_Lower_AluRim_{side_label}",
            lower_anchor,
            shelf_yaw,
            (0.0, 0.396, 0.0),
            (1.36, 0.020, 0.76),
            mat_brushed_silver,
            bevel=0.004,
        )
        # Center y = 0.410, height = 0.020 -> Top surface = EXACTLY 0.420m!
        add_local_box(
            f"Shelf_Lower_Deck_{side_label}",
            lower_anchor,
            shelf_yaw,
            (0.0, 0.410, 0.0),
            (1.32, 0.020, 0.72),
            mat_matte_polymer,
            bevel=0.003,
        )
        add_local_box(
            f"Shelf_Lower_EdgeLED_{side_label}",
            lower_anchor,
            shelf_yaw,
            (0.0, 0.382, 0.365),
            (1.24, 0.010, 0.014),
            mat_led_cyan,
            bevel=0.0,
        )

    # =========================================================================
    # E. SCULPTED FRONT PORTAL COLUMNS & 3D FASCIA SIGNBOARD HOUSING
    #    - Columns at x = +-3.28m, z = +2.42m (0.96m outside & 0.82m behind NPC)
    #    - Sign planes in React: Front [0, 3.38, +3.60], Rear [0, 3.38, +3.36] (6.36m x 0.68m -> y in [3.04, 3.72])
    #    - Slim <= 2.8cm bezel overhang so 100% of sign text is visible from Overview & Focus!
    # =========================================================================
    for side_label, sx in (("Left", -3.28), ("Right", 3.28)):
        # Column Base Shoe (y = 0.284..0.380m)
        add_box(
            f"PortalCol_Base_{side_label}",
            (sx, 0.332, 2.42),
            (0.38, 0.096, 0.40),
            mat_plinth_graphite,
            bevel=0.010,
            cull_bottom=True,
        )
        add_box(
            f"PortalCol_BaseCollar_{side_label}",
            (sx, 0.388, 2.42),
            (0.32, 0.020, 0.34),
            mat_brushed_silver,
            bevel=0.004,
        )

        # Main Architectural Portal Column Shaft (y = 0.398..3.52m)
        add_box(
            f"PortalCol_Shaft_{side_label}",
            (sx, 1.96, 2.42),
            (0.22, 3.12, 0.26),
            mat_gunmetal,
            bevel=0.014,
            cull_bottom=True,
        )
        # Brushed-Aluminum Outer Cheek Flanges (H-beam architectural read)
        for fx in (-0.108, 0.108):
            add_box(
                f"PortalCol_AluFlange_{side_label}_{fx}",
                (sx + fx, 1.96, 2.42),
                (0.024, 3.08, 0.28),
                mat_brushed_silver,
                bevel=0.004,
            )
        # Precision Recessed Cyan Vertical Light Slit on Front Column Face
        add_box(
            f"PortalCol_FrontLED_{side_label}",
            (sx, 1.92, 2.552),
            (0.022, 2.36, 0.012),
            mat_led_cyan,
            bevel=0.0,
        )

        # Cantilevered Header Support Arm (z = 2.42m..3.48m at y = 3.44m)
        add_box(
            f"PortalCol_CantileverArm_{side_label}",
            (sx, 3.44, 2.94),
            (0.16, 0.14, 1.08),
            mat_gunmetal,
            bevel=0.010,
        )
        add_box(
            f"PortalCol_ArmTrim_{side_label}",
            (sx, 3.515, 2.94),
            (0.17, 0.022, 1.08),
            mat_brushed_silver,
            bevel=0.004,
        )
        # Angled Knee Gusset Brace under Cantilever Arm (+Rx tips top toward +Z_three forward, bottom into column!)
        add_box(
            f"PortalCol_KneeBrace_{side_label}",
            (sx, 3.24, 2.58),
            (0.09, 0.42, 0.08),
            mat_gunmetal,
            bevel=0.006,
            rot_x=math.radians(40.0),
        )

    # Fascia Signboard Structural Core (z = +3.368m..+3.592m -> sits cleanly between rear z=3.36 & front z=3.60 planes!)
    add_box(
        "Header_CoreBox",
        (0.0, 3.38, 3.48),
        (6.42, 0.72, 0.224),
        mat_dark_navy,
        bevel=0.010,
    )
    # Top & Bottom Machined Aluminum Perimeter Bezels (outside y = 3.04..3.72m, z = 3.34..3.624m -> only 2.4cm lip!)
    add_box(
        "Header_TopCrown",
        (0.0, 3.755, 3.48),
        (6.58, 0.052, 0.288),
        mat_gunmetal,
        bevel=0.008,
    )
    add_box(
        "Header_TopAluLip",
        (0.0, 3.732, 3.48),
        (6.54, 0.020, 0.292),
        mat_brushed_silver,
        bevel=0.004,
    )
    add_box(
        "Header_CrownCyanLine",
        (0.0, 3.772, 3.622),
        (6.42, 0.014, 0.014),
        mat_led_cyan,
        bevel=0.0,
    )
    add_box(
        "Header_BottomSill",
        (0.0, 3.012, 3.48),
        (6.56, 0.044, 0.284),
        mat_gunmetal,
        bevel=0.008,
    )
    add_box(
        "Header_BottomAluLip",
        (0.0, 3.030, 3.48),
        (6.54, 0.018, 0.290),
        mat_brushed_silver,
        bevel=0.004,
    )
    # Left & Right End-Cap Castings (outside x = +-3.18m)
    for side_label, hx in (("Left", -3.24), ("Right", 3.24)):
        add_box(
            f"Header_EndCap_{side_label}",
            (hx, 3.38, 3.48),
            (0.11, 0.79, 0.296),
            mat_brushed_silver,
            bevel=0.010,
        )

    # =========================================================================
    # F. COMPACT DIGITAL SPEC TERMINAL (Grounded on Front-Left Deck: x = -2.88, z = +2.02)
    #    Human-scale trade-fair detail, 100% clear of sightlines, slots, bollards & NPC
    # =========================================================================
    term_anchor = (-2.88, 0.284, 2.02)
    term_yaw = 0.26
    add_local_box(
        "SpecTerminal_Base",
        term_anchor,
        term_yaw,
        (0.0, 0.024, 0.0),
        (0.46, 0.048, 0.36),
        mat_plinth_graphite,
        bevel=0.008,
        cull_bottom=True,
    )
    add_local_box(
        "SpecTerminal_Pillar",
        term_anchor,
        term_yaw,
        (0.0, 0.49, -0.02),
        (0.18, 0.88, 0.13),
        mat_gunmetal,
        bevel=0.008,
        cull_bottom=True,
    )
    add_local_box(
        "SpecTerminal_AluTrim",
        term_anchor,
        term_yaw,
        (0.0, 0.49, -0.02),
        (0.198, 0.86, 0.036),
        mat_brushed_silver,
        bevel=0.004,
    )
    # Ergonomically reclined touchscreen lectern head (-Rx tilts front face normal (-Y_bl) upward (+Z_bl) toward viewer!)
    cos_t, sin_t = math.cos(term_yaw), math.sin(term_yaw)
    head_pos = (-2.88 + 0.03 * sin_t, 1.22, 2.02 + 0.03 * cos_t)
    add_box(
        "SpecTerminal_ScreenBezel",
        head_pos,
        (0.48, 0.32, 0.034),
        mat_brushed_silver,
        bevel=0.006,
        rot_x=math.radians(-32.0),
        rot_y=term_yaw,
    )
    glass_pos = (-2.88 + 0.042 * sin_t, 1.228, 2.02 + 0.042 * cos_t)
    add_box(
        "SpecTerminal_GlassDisplay",
        glass_pos,
        (0.44, 0.28, 0.014),
        mat_tempered_glass,
        bevel=0.002,
        rot_x=math.radians(-32.0),
        rot_y=term_yaw,
    )
    led_pos = (-2.88 - 0.035 * sin_t, 1.345, 2.02 - 0.035 * cos_t)
    add_box(
        "SpecTerminal_ScreenAccent",
        led_pos,
        (0.36, 0.012, 0.014),
        mat_led_cyan,
        bevel=0.0,
        rot_x=math.radians(-32.0),
        rot_y=term_yaw,
    )

    # =========================================================================
    # JOIN INTO SINGLE UNIFIED PERFORMANCE-OPTIMIZED MESH & VALIDATE
    # =========================================================================
    bpy.ops.object.select_all(action="SELECT")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    pre_join_count = len(meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()

    unified = bpy.context.object
    unified.name = "Kinetix_Robotics_Booth_v3"
    # Clean degenerate zero-area faces while preserving custom split normals
    bm = bmesh.new()
    bm.from_mesh(unified.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bm.to_mesh(unified.data)
    bm.free()
    # Place origin cleanly at world [0, 0, 0] with identity rotation & scale!
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    unified.data.validate()
    unified.data.calc_loop_triangles()

    vert_count = len(unified.data.vertices)
    tri_count = len(unified.data.loop_triangles)
    mat_count = len(unified.data.materials)
    print(
        f"[Kinetix V3] Pre-join parts: {pre_join_count} -> Unified mesh: 1 | "
        f"Vertices: {vert_count} | Triangles: {tri_count} | Materials: {mat_count}"
    )

    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_copyright="Kinetix Robotics & AI Bespoke Booth v3",
    )

    file_size = os.path.getsize(OUT_GLB)
    print(f"[Kinetix V3] Exported {OUT_GLB} ({file_size} bytes / {file_size / 1024:.2f} KB)")


if __name__ == "__main__":
    generate_kinetix_v3()
