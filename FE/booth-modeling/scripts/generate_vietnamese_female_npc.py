"""
Vietnamese Female 3D Sales Assistant Generator (Blender 4.2 LTS)
Authors a Semi-Realistic Stylized 3D Vietnamese Female Exhibition Specialist (~22-28yo, 1.68m tall)
in an elegant modern tailored Ao Dai Cach Tan / Exhibition Hostess uniform, complete with:
- Subdivision-sculpted oval face, almond dark-brown eyes, corneal catchlights, eyelashes, arched brows,
  sculpted nose bridge, warm friendly smile, pearl earrings, and flowing dark-espresso layered hair.
- Articulated hierarchical rig with 4 multi-track GLTF AnimationClips exported via NLA Tracks:
  1. IDLE     - Natural breathing, gentle posture shift, subtle head & arm micro-motion
  2. WAVE     - Warm right-hand greeting wave with friendly head nod
  3. TALKING  - Poised conversational hand gestures and natural head movement
  4. PRESENT  - Graceful open-palm presentation gesture toward the booth's product showcase
Output: FE/public/models/npc/vietnamese_female_assistant.glb
"""

import bpy
import bmesh
import math
from pathlib import Path

DEST_DIR = Path(__file__).resolve().parents[2] / "public" / "models" / "npc"
DEST_DIR.mkdir(parents=True, exist_ok=True)
OUT_GLB = DEST_DIR / "vietnamese_female_assistant.glb"


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)


def make_mat(name, hex_color, roughness=0.45, metallic=0.0, emissive_hex=None, emissive_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_to_rgba(hex_color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emissive_hex and emissive_strength > 0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = hex_to_rgba(emissive_hex)
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return mat


def create_subsurf_mesh(name, bm, mat, subsurf_levels=2, parent=None, location=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent

    obj.data.materials.append(mat)

    if subsurf_levels > 0:
        mod = obj.modifiers.new("Subsurf", "SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

    for poly in obj.data.polygons:
        poly.use_smooth = True

    return obj


def build_tapered_tube(profiles, segments=20, cap_ends=True):
    """
    profiles: list of (z, rx, ry, offset_y) defining elliptical cross-sections from bottom to top.
    """
    bm = bmesh.new()
    rings = []
    for z, rx, ry, oy in profiles:
        ring = []
        for i in range(segments):
            ang = (2.0 * math.pi * i) / segments
            x = math.cos(ang) * rx
            y = math.sin(ang) * ry + oy
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)

    for r_idx in range(len(rings) - 1):
        r1 = rings[r_idx]
        r2 = rings[r_idx + 1]
        for i in range(segments):
            ni = (i + 1) % segments
            bm.faces.new((r1[i], r1[ni], r2[ni], r2[i]))

    if cap_ends:
        bm.faces.new(reversed(rings[0]))
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_sculpted_head_bm():
    """Sculpts a feminine oval head with soft jawline, cheekbones, and chin."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=20, radius=0.105)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Vertical proportion
        z *= 1.16
        # Slight cranium depth
        y *= 1.04
        # Taper lower face into a delicate feminine chin & jawline (front is -Y in Blender so it exports as +Z in glTF!)
        if z < 0:
            t = min(1.0, abs(z) / 0.12)
            jaw_taper = 1.0 - 0.34 * (t ** 1.35)
            x *= jaw_taper
            if y < 0:
                y *= 1.0 - 0.14 * (t ** 1.5)
        # Subtle cheekbone fullness around z = -0.015, y < -0.04
        if -0.045 < z < 0.015 and y < -0.03:
            cheek = math.exp(-((z + 0.015) / 0.028) ** 2) * math.exp(-((abs(x) - 0.058) / 0.035) ** 2)
            y -= 0.008 * cheek
            x *= 1.0 + 0.04 * cheek
        v.co.x, v.co.y, v.co.z = x, y, z
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_hair_canopy_bm():
    """Sculpts voluminous Vietnamese long dark-espresso hair with parted bangs, side locks, and flowing back."""
    bm = bmesh.new()
    # 1. Main crown & flowing back hair
    profiles = [
        (-0.24, 0.088, 0.042, 0.068),
        (-0.16, 0.108, 0.056, 0.058),
        (-0.08, 0.116, 0.075, 0.042),
        (0.00, 0.114, 0.106, 0.012),
        (0.06, 0.110, 0.112, 0.004),
        (0.105, 0.088, 0.095, 0.002),
        (0.128, 0.035, 0.040, 0.000),
    ]
    bm_back = build_tapered_tube(profiles, segments=22, cap_ends=True)
    for v in bm_back.verts:
        # Carve out front face opening for z < 0.055 and y < -0.015
        if v.co.z < 0.048 and v.co.y < -0.01:
            v.co.y = max(v.co.y, 0.015)
            v.co.x *= 1.04
    bm.from_mesh( create_temp_mesh(bm_back) )
    return bm


def create_temp_mesh(bm):
    m = bpy.data.meshes.new("tmp")
    bm.to_mesh(m)
    bm.free()
    return m


def add_ellipsoid(name, radius_xyz, location, mat, parent, rotation=(0, 0, 0), subsurf=1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=1.0)
    rx, ry, rz = radius_xyz
    for v in bm.verts:
        v.co.x *= rx
        v.co.y *= ry
        v.co.z *= rz
    obj = create_subsurf_mesh(name, bm, mat, subsurf_levels=subsurf, parent=parent, location=location)
    obj.rotation_euler = rotation
    return obj


def make_empty_joint(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.05
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24

    # Materials
    skin_mat = make_mat("NpcSkin", "#F4C8B0", roughness=0.44, metallic=0.01)
    hair_mat = make_mat("NpcHair", "#181210", roughness=0.34, metallic=0.08)
    iris_mat = make_mat("NpcIris", "#2A160D", roughness=0.18, metallic=0.05)
    pupil_mat = make_mat("NpcPupil", "#09090B", roughness=0.1, metallic=0.0)
    sclera_mat = make_mat("NpcSclera", "#F8FAFC", roughness=0.22, metallic=0.0)
    Highlight_mat = make_mat("NpcEyeCatchlight", "#FFFFFF", roughness=0.05, emissive_hex="#FFFFFF", emissive_strength=1.2)
    lip_mat = make_mat("NpcLips", "#D6686C", roughness=0.35, metallic=0.02)
    blush_mat = make_mat("NpcBlush", "#F09CA2", roughness=0.55, metallic=0.0)
    tunic_ivory_mat = make_mat("NpcTunicIvory", "#FAF6F0", roughness=0.42, metallic=0.03)
    accent_mat = make_mat("NpcBrandAccent", "#0EA5E9", roughness=0.32, metallic=0.15)
    navy_fabric_mat = make_mat("NpcNavySuit", "#1E293B", roughness=0.48, metallic=0.06)
    gold_trim_mat = make_mat("NpcGoldTrim", "#D4AF37", roughness=0.22, metallic=0.82)
    pearl_mat = make_mat("NpcPearl", "#FFFFFF", roughness=0.14, metallic=0.25)

    # Hierarchical Rig Root (at floor level z = 0)
    root = make_empty_joint("NpcRoot", (0, 0, 0))
    hips = make_empty_joint("Hips", (0, 0, 0.92), parent=root)
    spine = make_empty_joint("Spine", (0, 0, 0.14), parent=hips)
    chest = make_empty_joint("Chest", (0, 0, 0.18), parent=spine)
    neck = make_empty_joint("Neck", (0, 0, 0.16), parent=chest)
    head = make_empty_joint("Head", (0, 0, 0.085), parent=neck)

    # 1. Lower Body: Pelvis, Tailored Silk Trousers & Ao Dai Flowing Panels (Tà Áo Dài Cách Tân)
    pelvis_bm = build_tapered_tube(
        [
            (-0.08, 0.132, 0.095, 0.005),
            (0.00, 0.138, 0.102, 0.004),
            (0.08, 0.112, 0.084, 0.000),
            (0.14, 0.102, 0.078, 0.000),
        ],
        segments=20,
    )
    create_subsurf_mesh("PelvisSkirtBase", pelvis_bm, tunic_ivory_mat, subsurf_levels=1, parent=hips)

    # Front & Back Flowing Ao Dai Panels (Tà trước & Tà sau)
    add_ellipsoid("AoDaiFrontPanel", (0.118, 0.016, 0.28), (0, -0.092, -0.22), tunic_ivory_mat, hips, rotation=(0.04, 0, 0), subsurf=1)
    add_ellipsoid("AoDaiFrontBorder", (0.122, 0.014, 0.285), (0, -0.090, -0.225), accent_mat, hips, rotation=(0.04, 0, 0), subsurf=1)
    add_ellipsoid("AoDaiBackPanel", (0.122, 0.016, 0.29), (0, 0.094, -0.22), tunic_ivory_mat, hips, rotation=(-0.04, 0, 0), subsurf=1)

    # Waist Sash Belt (Đai eo thanh lịch)
    sash_bm = build_tapered_tube(
        [
            (0.09, 0.108, 0.082, 0.0),
            (0.135, 0.105, 0.080, 0.0),
        ],
        segments=20,
    )
    create_subsurf_mesh("WaistSash", sash_bm, accent_mat, subsurf_levels=1, parent=hips)
    add_ellipsoid("WaistGoldBuckle", (0.028, 0.012, 0.016), (0, -0.084, 0.112), gold_trim_mat, hips, subsurf=1)

    # Legs & Court Heels
    for side, sx in [("L", 0.068), ("R", -0.068)]:
        thigh_j = make_empty_joint(f"Thigh_{side}", (sx, 0, -0.04), parent=hips)
        thigh_bm = build_tapered_tube(
            [
                (-0.38, 0.048, 0.048, 0.0),
                (-0.18, 0.058, 0.058, 0.0),
                (0.00, 0.066, 0.066, 0.0),
            ],
            segments=16,
        )
        create_subsurf_mesh(f"ThighMesh_{side}", thigh_bm, navy_fabric_mat, subsurf_levels=1, parent=thigh_j)

        calf_j = make_empty_joint(f"Calf_{side}", (0, 0, -0.38), parent=thigh_j)
        calf_bm = build_tapered_tube(
            [
                (-0.38, 0.034, 0.036, 0.0),
                (-0.18, 0.045, 0.046, 0.004),
                (0.00, 0.048, 0.048, 0.0),
            ],
            segments=16,
        )
        create_subsurf_mesh(f"CalfMesh_{side}", calf_bm, skin_mat, subsurf_levels=1, parent=calf_j)

        # Elegant Court Shoe (Giày cao gót công sở triển lãm)
        shoe_j = make_empty_joint(f"Foot_{side}", (0, 0, -0.39), parent=calf_j)
        add_ellipsoid(f"ShoeUpper_{side}", (0.040, 0.095, 0.036), (0, -0.032, -0.065), navy_fabric_mat, shoe_j, rotation=(0.12, 0, 0), subsurf=1)
        add_ellipsoid(f"ShoeSole_{side}", (0.041, 0.098, 0.012), (0, -0.032, -0.095), gold_trim_mat, shoe_j, subsurf=1)
        add_ellipsoid(f"ShoeHeel_{side}", (0.016, 0.018, 0.042), (0, 0.028, -0.072), gold_trim_mat, shoe_j, subsurf=1)

    # 2. Upper Body: Contoured Bust, Torso, Mandarin Collar & Hostess Lapel
    torso_bm = build_tapered_tube(
        [
            (-0.16, 0.104, 0.078, 0.000),
            (-0.06, 0.114, 0.088, -0.006),
            (0.04, 0.128, 0.098, -0.014),  # Feminine bust contour (-Y is front)
            (0.12, 0.124, 0.086, -0.004),
            (0.165, 0.092, 0.068, 0.000),
        ],
        segments=22,
    )
    create_subsurf_mesh("TorsoBodice", torso_bm, tunic_ivory_mat, subsurf_levels=1, parent=chest)

    # Accent Diagonal Ao Dai / Hostess Lapel Trim & Gold Brooch
    add_ellipsoid("AccentLapelPiping", (0.085, 0.014, 0.135), (0.015, -0.092, 0.03), accent_mat, chest, rotation=(0.08, 0.25, 0), subsurf=1)
    add_ellipsoid("GoldLotusBrooch", (0.022, 0.010, 0.022), (0.058, -0.096, 0.085), gold_trim_mat, chest, subsurf=1)
    add_ellipsoid("HostessBadge", (0.032, 0.008, 0.020), (-0.058, -0.094, 0.075), accent_mat, chest, subsurf=1)

    # Neck & High Mandarin Collar (Cổ Áo Dài)
    neck_bm = build_tapered_tube(
        [
            (-0.02, 0.044, 0.044, 0.0),
            (0.04, 0.039, 0.039, 0.0),
            (0.095, 0.037, 0.037, 0.0),
        ],
        segments=16,
    )
    create_subsurf_mesh("NeckMesh", neck_bm, skin_mat, subsurf_levels=1, parent=neck)

    collar_bm = build_tapered_tube(
        [
            (-0.015, 0.052, 0.050, 0.0),
            (0.028, 0.048, 0.046, 0.0),
        ],
        segments=18,
    )
    create_subsurf_mesh("MandarinCollar", collar_bm, accent_mat, subsurf_levels=1, parent=neck)

    # 3. Sculpted Head, Facial Features & Layered Long Hair
    head_bm = build_sculpted_head_bm()
    create_subsurf_mesh("SculptedHead", head_bm, skin_mat, subsurf_levels=2, parent=head, location=(0, 0, 0.095))

    # Nose bridge & soft nose tip (front is -Y)
    add_ellipsoid("NoseBridge", (0.011, 0.016, 0.028), (0, -0.104, 0.092), skin_mat, head, rotation=(-0.18, 0, 0), subsurf=1)
    add_ellipsoid("NoseTip", (0.013, 0.015, 0.012), (0, -0.111, 0.078), skin_mat, head, subsurf=1)

    # Warm Smile Lips (Upper & Lower sculpted lip arcs)
    add_ellipsoid("UpperLip", (0.026, 0.012, 0.007), (0, -0.103, 0.054), lip_mat, head, rotation=(0.08, 0, 0), subsurf=1)
    add_ellipsoid("LowerLip", (0.024, 0.013, 0.008), (0, -0.101, 0.046), lip_mat, head, rotation=(-0.1, 0, 0), subsurf=1)
    add_ellipsoid("SmileCorner_L", (0.008, 0.008, 0.005), (0.024, -0.096, 0.053), lip_mat, head, subsurf=1)
    add_ellipsoid("SmileCorner_R", (0.008, 0.008, 0.005), (-0.024, -0.096, 0.053), lip_mat, head, subsurf=1)

    # Eyes, Dark Brown Irises, Pupils, Eyelashes, Eyebrows, Cheek Blush, Ears & Pearl Earrings
    for side, sx in [("L", 0.036), ("R", -0.036)]:
        sign = 1.0 if sx > 0 else -1.0
        add_ellipsoid(f"Sclera_{side}", (0.016, 0.011, 0.012), (sx, -0.094, 0.106), sclera_mat, head, rotation=(0, 0, sign * 0.08), subsurf=1)
        add_ellipsoid(f"Iris_{side}", (0.0105, 0.006, 0.0105), (sx, -0.101, 0.106), iris_mat, head, subsurf=1)
        add_ellipsoid(f"Pupil_{side}", (0.0055, 0.004, 0.0055), (sx, -0.104, 0.106), pupil_mat, head, subsurf=1)
        add_ellipsoid(f"Catchlight_{side}", (0.0028, 0.002, 0.0028), (sx + 0.003, -0.106, 0.109), Highlight_mat, head, subsurf=0)
        add_ellipsoid(f"Eyelash_{side}", (0.018, 0.009, 0.0045), (sx, -0.099, 0.114), hair_mat, head, rotation=(0.1, sign * -0.08, sign * 0.12), subsurf=1)
        add_ellipsoid(f"Eyebrow_{side}", (0.021, 0.006, 0.0042), (sx, -0.098, 0.128), hair_mat, head, rotation=(0, sign * -0.06, sign * 0.09), subsurf=1)
        add_ellipsoid(f"CheekBlush_{side}", (0.019, 0.006, 0.013), (sx * 1.38, -0.088, 0.076), blush_mat, head, rotation=(0, 0, sign * 0.35), subsurf=1)
        add_ellipsoid(f"Ear_{side}", (0.012, 0.019, 0.026), (sign * 0.098, -0.006, 0.092), skin_mat, head, rotation=(0, sign * -0.18, 0), subsurf=1)
        add_ellipsoid(f"PearlEarring_{side}", (0.0065, 0.0065, 0.0065), (sign * 0.102, -0.008, 0.066), pearl_mat, head, subsurf=1)

    # Voluminous Long Vietnamese Hair (Crown, Side-Swept Fringe, Face-Framing Locks, Flowing Back Hair)
    add_ellipsoid("HairCrown", (0.112, 0.114, 0.108), (0, 0.012, 0.122), hair_mat, head, subsurf=2)
    add_ellipsoid("HairBackLong", (0.106, 0.058, 0.215), (0, 0.068, -0.015), hair_mat, head, rotation=(0.12, 0, 0), subsurf=2)
    add_ellipsoid("HairFringeRight", (0.068, 0.036, 0.048), (-0.032, -0.084, 0.156), hair_mat, head, rotation=(0.25, -0.22, -0.35), subsurf=1)
    add_ellipsoid("HairFringeLeft", (0.052, 0.032, 0.044), (0.046, -0.082, 0.154), hair_mat, head, rotation=(0.25, 0.24, 0.32), subsurf=1)
    for side, sx in [("L", 0.094), ("R", -0.094)]:
        sign = 1.0 if sx > 0 else -1.0
        add_ellipsoid(f"HairSideLock_{side}", (0.032, 0.036, 0.145), (sx, -0.028, 0.015), hair_mat, head, rotation=(0.08, sign * 0.08, 0), subsurf=1)

    # 4. Articulated Arms, Forearms, Hands & Sculpted Fingers
    arm_joints = {}
    for side, sx in [("L", 0.142), ("R", -0.142)]:
        sign = 1.0 if sx > 0 else -1.0
        sh_j = make_empty_joint(f"Shoulder_{side}", (sx, 0, 0.135), parent=chest)
        ua_j = make_empty_joint(f"UpperArm_{side}", (0, 0, 0), parent=sh_j)

        # Tailored Sleeve on Upper Arm
        ua_bm = build_tapered_tube(
            [
                (-0.24, 0.035, 0.035, 0.0),
                (-0.12, 0.040, 0.040, 0.0),
                (0.02, 0.046, 0.046, 0.0),
            ],
            segments=14,
        )
        create_subsurf_mesh(f"UpperArmSleeve_{side}", ua_bm, tunic_ivory_mat, subsurf_levels=1, parent=ua_j)
        add_ellipsoid(f"SleeveGoldCuff_{side}", (0.038, 0.038, 0.012), (0, 0, -0.235), gold_trim_mat, ua_j, subsurf=1)

        fa_j = make_empty_joint(f"Forearm_{side}", (0, 0, -0.24), parent=ua_j)
        fa_bm = build_tapered_tube(
            [
                (-0.22, 0.024, 0.026, 0.0),
                (-0.10, 0.031, 0.032, 0.0),
                (0.00, 0.034, 0.034, 0.0),
            ],
            segments=14,
        )
        create_subsurf_mesh(f"ForearmMesh_{side}", fa_bm, skin_mat, subsurf_levels=1, parent=fa_j)

        hand_j = make_empty_joint(f"Hand_{side}", (0, 0, -0.22), parent=fa_j)
        add_ellipsoid(f"Palm_{side}", (0.026, 0.014, 0.036), (0, 0, -0.032), skin_mat, hand_j, subsurf=1)
        # Sculpted Thumb & Fingers for graceful open-palm presentation & wave
        add_ellipsoid(f"Thumb_{side}", (0.007, 0.007, 0.022), (sign * -0.024, -0.008, -0.036), skin_mat, hand_j, rotation=(0, sign * 0.45, 0), subsurf=1)
        for f_idx, fx in enumerate([-0.015, -0.005, 0.005, 0.015]):
            flen = 0.028 if f_idx in (1, 2) else 0.024
            add_ellipsoid(f"Finger_{side}_{f_idx}", (0.0055, 0.0055, flen), (fx, 0, -0.072), skin_mat, hand_j, subsurf=1)

        arm_joints[side] = (ua_j, fa_j, hand_j)

    ua_L, fa_L, hand_L = arm_joints["L"]
    ua_R, fa_R, hand_R = arm_joints["R"]

    # =========================================================================
    # 5. AUTHOR 4 NAMED ANIMATION CLIPS VIA NLA TRACKS (IDLE, WAVE, TALKING, PRESENT)
    # =========================================================================
    animated_nodes = [hips, chest, head, ua_L, fa_L, hand_L, ua_R, fa_R, hand_R]
    for obj in animated_nodes:
        obj.animation_data_create()

    def build_clip(clip_name, frame_end, keyframe_fn):
        actions = {}
        for obj in animated_nodes:
            act = bpy.data.actions.new(name=f"{clip_name}_{obj.name}")
            obj.animation_data.action = act
            actions[obj.name] = act

        keyframe_fn()

        # Push each object's action into an NLA track named exactly `clip_name`
        # so Blender's glTF exporter merges them into one AnimationClip named `clip_name`!
        for obj in animated_nodes:
            act = actions[obj.name]
            track = obj.animation_data.nla_tracks.new()
            track.name = clip_name
            strip = track.strips.new(clip_name, 1, act)
            strip.name = clip_name
            obj.animation_data.action = None

    def key_rot(obj, frame, rx, ry, rz):
        obj.rotation_euler = (rx, ry, rz)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)

    def key_loc(obj, frame, x, y, z):
        obj.location = (x, y, z)
        obj.keyframe_insert(data_path="location", frame=frame)

    # --- CLIP 1: IDLE (Frames 1..60, natural breathing & poised hostess stance) ---
    def anim_idle():
        for f, phase in [(1, 0.0), (15, 0.5 * math.pi), (30, math.pi), (45, 1.5 * math.pi), (60, 2.0 * math.pi)]:
            s = math.sin(phase)
            c = math.cos(phase)
            key_loc(hips, f, 0.0, 0.0, 0.92 + 0.006 * s)
            key_rot(hips, f, 0.0, 0.015 * s, 0.02 * c)
            key_rot(chest, f, 0.025 * s, 0.0, -0.02 * s)
            key_rot(head, f, 0.03 * c, 0.02 * s, 0.05 * s)
            # Relaxed poised arms slightly in front
            key_rot(ua_L, f, 0.14 + 0.03 * s, -0.14, -0.08)
            key_rot(fa_L, f, 0.38 + 0.04 * c, 0.0, 0.18)
            key_rot(hand_L, f, 0.0, 0.0, 0.05 * s)
            key_rot(ua_R, f, 0.14 - 0.03 * s, 0.14, 0.08)
            key_rot(fa_R, f, 0.38 - 0.04 * c, 0.0, -0.18)
            key_rot(hand_R, f, 0.0, 0.0, -0.05 * s)

    # --- CLIP 2: WAVE (Frames 1..48, warm Vietnamese greeting & right-hand wave) ---
    def anim_wave():
        poses = [
            (1,  0.00,  0.00, 0.18,  0.14,  0.38, 0.00),
            (10, -0.08, 0.06, 0.85,  0.72,  1.45, 0.28),
            (18, -0.10, -0.06, 0.92, 0.96,  1.52, -0.32),
            (26, -0.08, 0.06, 0.92,  0.68,  1.45, 0.32),
            (34, -0.10, -0.05, 0.90, 0.94,  1.50, -0.28),
            (48, 0.00,  0.00, 0.18,  0.14,  0.38, 0.00),
        ]
        for f, head_rx, head_rz, uar_rx, uar_ry, far_rx, hr_ry in poses:
            key_loc(hips, f, 0.0, 0.0, 0.92)
            key_rot(hips, f, 0.0, 0.0, 0.0)
            key_rot(chest, f, -0.04 if 10 <= f <= 34 else 0.0, 0.0, 0.04 if 10 <= f <= 34 else 0.0)
            key_rot(head, f, head_rx, 0.04 if 10 <= f <= 34 else 0.0, head_rz)
            # Left hand poised politely near waist
            key_rot(ua_L, f, 0.22, -0.12, -0.15)
            key_rot(fa_L, f, 0.65, 0.0, 0.32)
            key_rot(hand_L, f, 0.0, 0.0, 0.0)
            # Right arm raised waving warmly
            key_rot(ua_R, f, uar_rx, uar_ry, 0.15)
            key_rot(fa_R, f, far_rx, 0.0, -0.15)
            key_rot(hand_R, f, 0.15, hr_ry, 0.0)

    # --- CLIP 3: TALKING (Frames 1..60, natural conversational speech gestures) ---
    def anim_talking():
        frames = [
            (1,  0.00,  0.00, 0.32, 0.78, 0.32, 0.78),
            (12, -0.05, 0.07, 0.48, 0.98, 0.36, 0.84),
            (24, 0.03, -0.06, 0.36, 0.82, 0.52, 1.04),
            (36, -0.06, 0.05, 0.50, 1.02, 0.42, 0.90),
            (48, 0.02, -0.08, 0.38, 0.85, 0.48, 0.98),
            (60, 0.00,  0.00, 0.32, 0.78, 0.32, 0.78),
        ]
        for f, h_rx, h_rz, ual_rx, fal_rx, uar_rx, far_rx in frames:
            key_loc(hips, f, 0.0, 0.0, 0.92 + (0.005 if f in (12, 36) else 0.0))
            key_rot(hips, f, 0.0, 0.0, 0.02 * math.sin(f * 0.1))
            key_rot(chest, f, -0.03, 0.0, h_rz * 0.4)
            key_rot(head, f, h_rx, 0.03 * math.sin(f * 0.2), h_rz)
            key_rot(ua_L, f, ual_rx, -0.16, -0.12)
            key_rot(fa_L, f, fal_rx, -0.18, 0.22)
            key_rot(hand_L, f, 0.08, -0.15, 0.10 * math.sin(f * 0.2))
            key_rot(ua_R, f, uar_rx, 0.16, 0.12)
            key_rot(fa_R, f, far_rx, 0.18, -0.22)
            key_rot(hand_R, f, 0.08, 0.15, -0.10 * math.cos(f * 0.2))

    # --- CLIP 4: PRESENT (Frames 1..60, graceful open-palm gesture toward booth products) ---
    def anim_present():
        frames = [
            (1,  0.00,  0.00, 0.32, -0.16, 0.78, 0.00),
            (14, -0.04, 0.22, 0.72, -0.52, 0.92, -0.35),
            (28, -0.06, 0.28, 0.82, -0.62, 1.05, -0.45),
            (44, -0.03, 0.18, 0.76, -0.55, 0.96, -0.38),
            (60, 0.00,  0.00, 0.32, -0.16, 0.78, 0.00),
        ]
        for f, h_rx, turn_rz, ual_rx, ual_ry, fal_rx, hl_ry in frames:
            key_loc(hips, f, 0.0, 0.0, 0.92)
            key_rot(hips, f, 0.0, 0.0, turn_rz * 0.25)
            key_rot(chest, f, -0.04, 0.0, turn_rz * 0.55)
            key_rot(head, f, h_rx, 0.04, turn_rz * 0.85)
            # Left arm extends gracefully toward the booth's product display (which is to her right/inner side, +X in local NPC space)
            key_rot(ua_L, f, ual_rx, ual_ry, -0.25)
            key_rot(fa_L, f, fal_rx, -0.32, 0.15)
            key_rot(hand_L, f, 0.18, hl_ry, 0.12)
            # Right arm poised gracefully at waist
            key_rot(ua_R, f, 0.28, 0.15, 0.14)
            key_rot(fa_R, f, 0.74, 0.12, -0.28)
            key_rot(hand_R, f, 0.05, 0.10, 0.0)

    build_clip("IDLE", 60, anim_idle)
    build_clip("WAVE", 48, anim_wave)
    build_clip("TALKING", 60, anim_talking)
    build_clip("PRESENT", 60, anim_present)

    # Export to GLB
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="IDLE",
    )
    size_kb = OUT_GLB.stat().st_size / 1024.0
    print(f"[NPC Generator] Successfully exported {OUT_GLB} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
