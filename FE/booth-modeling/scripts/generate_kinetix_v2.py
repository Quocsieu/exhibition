"""
Kinetix Robotics & AI - Bespoke 3D Exhibition Booth Generator (Version 2)
Authors a high-detail, roofless industrial exhibition booth GLB.
Strict adherence to coordinates:
- Ground floor plinth footprint: 7.2m x 5.4m, height 0.28m, steps at +Z
- Quầy chính (Hero Counter): [0, 0, 0.92], surface at y=0.56m (Slots 01, 02)
- Kệ vách Trái (Left Shelves): x=-2.44, surfaces at y=1.72m & y=0.42m (Slots 03, 04)
- Kệ vách Phải (Right Shelves): x=+2.44, surfaces at y=1.72m & y=0.42m (Slots 05, 06)
- Biển hiệu khung (Sign Header Frame): y=3.38m, z=3.52m
- Vách phông nền khung (Backdrop Frame): z=-1.92m, y=1.82m
- Output: FE/public/models/booths/kinetix-v2/kinetix_booth_v2.glb
"""

import bpy
import math
import os
from pathlib import Path

DEST_DIR = Path(r"E:/Lập trình/MatBaoWS/exhibition/FE/public/models/booths/kinetix-v2")
DEST_DIR.mkdir(parents=True, exist_ok=True)
OUT_GLB = DEST_DIR / "kinetix_booth_v2.glb"

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def create_pbr_material(name, hex_color, roughness, metalness=0.0, emissive_hex=None, emissive_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    r = linear(int(hex_color[1:3], 16) / 255.0)
    g = linear(int(hex_color[3:5], 16) / 255.0)
    b = linear(int(hex_color[5:7], 16) / 255.0)
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    
    if emissive_hex and emissive_strength > 0:
        er = linear(int(emissive_hex[1:3], 16) / 255.0)
        eg = linear(int(emissive_hex[3:5], 16) / 255.0)
        eb = linear(int(emissive_hex[5:7], 16) / 255.0)
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (er, eg, eb, 1.0)
            bsdf.inputs['Emission Strength'].default_value = emissive_strength
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (er, eg, eb, 1.0)
    return mat

def add_box(name, pos, size, mat, bevel=0.012, segments=2):
    # In Three.js: pos is (X, Y_up, Z_forward)
    # In Blender: pos is (X, -Z_forward, Y_up)
    x, y, z = pos
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, -z, y))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new('EdgeBevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod_norm = obj.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod_norm.name)
    return obj

def add_cylinder(name, pos, radius, height, mat, vertices=16, rot=(0,0,0)):
    x, y, z = pos
    # Default cylinder in Blender is along Z. We need it along Y in Three.js (which is Z in Blender).
    # rot is given in Three.js Euler (Rx, Ry, Rz).
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=(x, -z, y), rotation=(rot[0], rot[2], rot[1]))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def add_bolt_flange(pos, axis='y', bolt_count=6, radius=0.14, mat_flange=None, mat_bolt=None):
    x, y, z = pos
    # Circular flange disc with hex bolts
    add_cylinder("FlangeRing", (x, y, z), radius, 0.024, mat_flange, vertices=20)
    for i in range(bolt_count):
        angle = i * (2 * math.pi / bolt_count)
        bx = x + math.cos(angle) * (radius * 0.75)
        bz = z + math.sin(angle) * (radius * 0.75)
        add_cylinder("FlangeBolt", (bx, y + 0.018, bz), 0.014, 0.018, mat_bolt, vertices=6)

def generate_kinetix_v2():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # 1. PBR Materials Palette
    mat_dark_steel = create_pbr_material("IndustrialDarkSteel", "#1e242d", roughness=0.32, metalness=0.82)
    mat_gunmetal = create_pbr_material("MachinedGunmetal", "#374151", roughness=0.28, metalness=0.75)
    mat_chrome = create_pbr_material("MirrorChrome", "#e2e8f0", roughness=0.15, metalness=0.92)
    mat_brass_accent = create_pbr_material("RoboticsBrass", "#d97706", roughness=0.25, metalness=0.88)
    mat_floor_composite = create_pbr_material("TechnicalFloorComposite", "#111827", roughness=0.45, metalness=0.15)
    mat_stone_plinth = create_pbr_material("FoundationGranite", "#0f172a", roughness=0.58, metalness=0.22)
    mat_counter_surface = create_pbr_material("CarbonCounterTop", "#1f2937", roughness=0.22, metalness=0.4)
    mat_counter_accent = create_pbr_material("KinetixVioletBody", "#4f46e5", roughness=0.35, metalness=0.3)
    mat_led_violet = create_pbr_material("LED_VioletNeon", "#a855f7", roughness=0.1, metalness=0.0, emissive_hex="#8b5cf6", emissive_strength=3.5)
    mat_led_cyan = create_pbr_material("LED_CyanGlow", "#06b6d4", roughness=0.1, metalness=0.0, emissive_hex="#06b6d4", emissive_strength=3.0)
    mat_spotlight_black = create_pbr_material("SpotlightHousing", "#090d16", roughness=0.35, metalness=0.8)
    mat_spotlight_lens = create_pbr_material("SpotlightLens", "#ffffff", roughness=0.05, metalness=0.0, emissive_hex="#ffffff", emissive_strength=4.0)

    # =========================================================================
    # A. FLOOR PLATFORM & ARCHITECTURAL STEPS
    # Footprint: 7.2m x 5.4m, height 0.28m
    # =========================================================================
    # Heavy stone base plinth
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_stone_plinth, bevel=0.03)
    # Upper technical recessed floor with chamfered edge
    add_box("Floor_TechnicalDeck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_floor_composite, bevel=0.015)
    # Edge lighting channel around the deck
    for side in [-1, 1]:
        add_box(f"Floor_LED_Strip_Side_{side}", (side * 3.38, 0.28, 0.05), (0.025, 0.02, 4.92), mat_led_cyan, bevel=0)
    add_box("Floor_LED_Strip_Front", (0, 0.28, 2.52), (6.76, 0.02, 0.025), mat_led_cyan, bevel=0)
    
    # 2-Tier Front Entrance Terrace Steps at +Z (z = 2.86m)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_stone_plinth, bevel=0.02)
    add_box("Step_Tier1_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_gunmetal, bevel=0.006)
    add_box("Step_LED_Underglow", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_led_violet, bevel=0)

    # =========================================================================
    # B. STRUCTURAL COLUMNS & OVERHEAD GANTRY BEAMS (ROOFLESS)
    # Pillars at x = +-3.28m (front) and x = +-2.22m (rear)
    # =========================================================================
    # 1. Front Heavy Duty Mechanical Columns at x = +-3.28m, z = 2.45m
    for sx in [-3.28, 3.28]:
        # Anchor base plinth & bolts
        add_box(f"FrontCol_Base_{sx}", (sx, 0.38, 2.45), (0.42, 0.16, 0.42), mat_dark_steel, bevel=0.02)
        add_bolt_flange((sx, 0.47, 2.45), bolt_count=8, radius=0.18, mat_flange=mat_gunmetal, mat_bolt=mat_brass_accent)
        # Main upright column (Box with corner cutouts / chamfer)
        add_box(f"FrontCol_Shaft_{sx}", (sx, 1.95, 2.45), (0.22, 2.85, 0.22), mat_dark_steel, bevel=0.015)
        # Chrome hydraulic damper rod in front of column
        add_cylinder(f"Hydraulic_Ram_{sx}", (sx, 1.85, 2.62), 0.035, 2.4, mat_chrome, vertices=16)
        add_cylinder(f"Hydraulic_Piston_{sx}", (sx, 2.6, 2.62), 0.048, 1.0, mat_gunmetal, vertices=16)
        # Neon vertical status strip on column face
        add_box(f"Col_NeonStrip_{sx}", (sx, 2.0, 2.565), (0.04, 2.1, 0.012), mat_led_violet, bevel=0.002)
        # Mechanical bracket at top holding header arm
        add_box(f"FrontCol_CapBracket_{sx}", (sx, 3.42, 2.45), (0.28, 0.18, 0.36), mat_gunmetal, bevel=0.01)

    # 2. Rear Structural Posts at x = +-2.22m, z = -1.65m
    for sx in [-2.22, 2.22]:
        add_box(f"RearCol_Base_{sx}", (sx, 0.38, -1.65), (0.34, 0.14, 0.34), mat_dark_steel, bevel=0.015)
        add_bolt_flange((sx, 0.46, -1.65), bolt_count=6, radius=0.15, mat_flange=mat_gunmetal, mat_bolt=mat_brass_accent)
        add_box(f"RearCol_Shaft_{sx}", (sx, 1.85, -1.65), (0.16, 2.82, 0.16), mat_dark_steel, bevel=0.012)
        # Equipment mount rail plates
        for ry in [0.75, 1.45, 2.15, 2.85]:
            add_box(f"RearCol_Bracket_{sx}_{ry}", (sx, ry, -1.55), (0.22, 0.12, 0.04), mat_gunmetal, bevel=0.005)
            add_cylinder(f"Bolt_{sx}_{ry}", (sx + 0.06, ry, -1.52), 0.012, 0.02, mat_brass_accent, vertices=6)
            add_cylinder(f"Bolt2_{sx}_{ry}", (sx - 0.06, ry, -1.52), 0.012, 0.02, mat_brass_accent, vertices=6)

    # 3. Overhead Horizontal Gantry Tie-Beam (Rear backdrop top rail at y = 3.27m, z = -1.65m)
    add_box("Backdrop_TopGantry", (0, 3.32, -1.65), (4.72, 0.16, 0.16), mat_dark_steel, bevel=0.01)
    # Industrial yellow/brass hazard warning pattern plate along gantry
    add_box("Gantry_AccentBar", (0, 3.32, -1.56), (4.4, 0.06, 0.02), mat_brass_accent, bevel=0.004)

    # 4. Forward Cantilever Arms Supporting Main Header (from x = +-3.28m, reaching to z = 3.52m)
    for sx in [-3.28, 3.28]:
        add_box(f"Cantilever_Arm_{sx}", (sx, 3.52, 2.95), (0.12, 0.14, 1.25), mat_dark_steel, bevel=0.008)
        # Diagonal gusset truss brace
        add_box(f"Gusset_Brace_{sx}", (sx, 3.25, 2.65), (0.06, 0.45, 0.06), mat_gunmetal, bevel=0.005)

    # =========================================================================
    # C. SIGNAGE FRAME & REAR BACKDROP HOUSING (NO HARDCODED TEXT)
    # Header Sign at y = 3.38m, z = 3.52m (Width: ~6.2m, Height: 0.74m)
    # =========================================================================
    # Sign perimeter structural enclosure (Outer bezel with industrial chamfers)
    add_box("Header_Backplate_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_dark_steel, bevel=0.02)
    # Top architectural visor hood with downlight slot
    add_box("Header_Visor_Hood", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_gunmetal, bevel=0.01)
    add_box("Header_LED_AccentLine", (0, 3.82, 3.69), (6.38, 0.025, 0.02), mat_led_violet, bevel=0)
    # Bottom cable runner tray
    add_box("Header_Bottom_Trim", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_gunmetal, bevel=0.008)
    # Left & Right end cap castings
    for sx in [-3.24, 3.24]:
        add_box(f"Header_EndCap_{sx}", (sx, 3.38, 3.50), (0.12, 0.86, 0.24), mat_gunmetal, bevel=0.015)
        add_cylinder(f"EndCap_Bolt1_{sx}", (sx, 3.65, 3.62), 0.015, 0.02, mat_brass_accent, vertices=6)
        add_cylinder(f"EndCap_Bolt2_{sx}", (sx, 3.10, 3.62), 0.015, 0.02, mat_brass_accent, vertices=6)

    # 4 Miniature Directional LED Floodlights on Header Visor
    for fx in [-2.4, -0.8, 0.8, 2.4]:
        add_box(f"Header_LightBracket_{fx}", (fx, 3.88, 3.62), (0.05, 0.06, 0.12), mat_gunmetal, bevel=0.004)
        add_cylinder(f"Header_LightHead_{fx}", (fx, 3.86, 3.72), 0.045, 0.08, mat_spotlight_black, vertices=12, rot=(math.radians(35), 0, 0))
        add_cylinder(f"Header_LightLens_{fx}", (fx, 3.83, 3.75), 0.038, 0.01, mat_spotlight_lens, vertices=12, rot=(math.radians(35), 0, 0))

    # Rear Backdrop Wall Frame (z = -1.92m, y = 1.82m, Size: 4.2m x 2.5m)
    add_box("Backdrop_Heavy_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_dark_steel, bevel=0.02)
    # LED halo rim behind the canvas
    add_box("Backdrop_LED_Rim", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_led_violet, bevel=0)
    # Overhead Backdrop Lighting Bar
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_gunmetal, bevel=0.008)
    for bx in [-1.5, -0.5, 0.5, 1.5]:
        add_cylinder(f"Backdrop_Spot_{bx}", (bx, 3.09, -1.72), 0.032, 0.05, mat_spotlight_black, vertices=12, rot=(math.radians(-25), 0, 0))
        add_cylinder(f"Backdrop_Lens_{bx}", (bx, 3.07, -1.70), 0.026, 0.01, mat_spotlight_lens, vertices=12, rot=(math.radians(-25), 0, 0))

    # =========================================================================
    # D. EXHIBITION HERO COUNTER (KHU B)
    # Center: [0, y, 0.92], Top surface at EXACTLY y = 0.56m
    # Width: 3.44m, Depth: 0.92m
    # Leaves top surface flush for slot_01 (x=-0.88) & slot_02 (x=+0.88)
    # =========================================================================
    # Recessed plinth kickplate (y: 0.00..0.08)
    add_box("Counter_Plinth_Base", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_stone_plinth, bevel=0.01)
    # Counter lower chassis / body (y: 0.37..0.525)
    add_box("Counter_Lower_Chassis", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_dark_steel, bevel=0.01)
    # Front aesthetic louver / vented technical panel
    add_box("Counter_Front_ArmorPanel", (0, 0.445, 1.36), (3.14, 0.13, 0.04), mat_counter_accent, bevel=0.008)
    for vi in range(9):
        add_box(f"Counter_Vent_{vi}", (-1.2 + vi * 0.3, 0.445, 1.385), (0.18, 0.025, 0.015), mat_gunmetal, bevel=0.002)
    # LED horizontal under-glow blade under counter top
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_led_violet, bevel=0)
    # Counter Top Surface (Top at EXACTLY y = 0.56m; height = 0.035m -> center at 0.5425m)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_counter_surface, bevel=0.006)
    # Chamfered corner guard plates on counter top
    for cx in [-1.71, 1.71]:
        for cz in [0.46, 1.38]:
            add_cylinder(f"Counter_CornerPin_{cx}_{cz}", (cx, 0.565, cz), 0.016, 0.02, mat_brass_accent, vertices=6)

    # =========================================================================
    # E. SYMMETRIC 2-TIER SECONDARY DISPLAY SHELVES (KHU C1 & KHU C2)
    # Left: x = -2.44m, Right: x = +2.44m
    # Upper Tier: centered at z = 0.68m, surface at EXACTLY y = 1.72m
    # Lower Tier: centered at z = 1.12m, surface at EXACTLY y = 0.42m
    # Rotated 0.2 rad inwards (Left: +0.2 rad, Right: -0.2 rad)
    # =========================================================================
    for side, sx, rot_y in [('Left', -2.44, 0.2), ('Right', 2.44, -0.2)]:
        # --- Lower Tier (y = 0.42m) ---
        # Base plinth
        add_box(f"Shelf_Lower_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_stone_plinth, bevel=0.01)
        # Body support
        add_box(f"Shelf_Lower_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_dark_steel, bevel=0.008)
        # LED accent under shelf
        add_box(f"Shelf_Lower_LED_{side}", (sx, 0.41, 1.12), (1.30, 0.012, 0.74), mat_led_cyan, bevel=0)
        # Shelf Board (top at y = 0.42m)
        add_box(f"Shelf_Lower_Board_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_counter_surface, bevel=0.005)
        
        # --- Upper Tier (y = 1.72m) ---
        # Twin vertical heavy duty extruded aluminum stanchions
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Upright_{side}_{px}", (sx + px, 1.05, 0.68), 0.038, 1.34, mat_gunmetal, vertices=16)
            add_cylinder(f"Shelf_Collar_{side}_{px}", (sx + px, 1.66, 0.68), 0.052, 0.06, mat_brass_accent, vertices=12)
        # Upper shelf cantilever support frame
        add_box(f"Shelf_Upper_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_dark_steel, bevel=0.008)
        # LED underglow blade
        add_box(f"Shelf_Upper_LED_{side}", (sx, 1.705, 0.68), (1.28, 0.015, 0.72), mat_led_violet, bevel=0)
        # Upper Shelf Board (top at EXACTLY y = 1.72m)
        add_box(f"Shelf_Upper_Board_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_counter_surface, bevel=0.005)
        # Solid perforated backboard panel behind upper shelf
        add_box(f"Shelf_Backboard_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_dark_steel, bevel=0.01)
        # Top miniature task downlight
        add_cylinder(f"Shelf_Spotlight_{side}", (sx, 2.82, 0.42), 0.035, 0.06, mat_spotlight_black, vertices=12, rot=(math.radians(30), 0, 0))
        add_cylinder(f"Shelf_Spotlens_{side}", (sx, 2.80, 0.44), 0.028, 0.01, mat_spotlight_lens, vertices=12, rot=(math.radians(30), 0, 0))

    # =========================================================================
    # F. ROBOTIC / AI INDUSTRIAL PROPS (KIOSK & EQUIPMENT RACKS)
    # =========================================================================
    # Interactive Wayfinding Cyber Kiosk at entrance left (x = -3.2m, z = 3.1m)
    add_box("Kiosk_Base", (-3.15, 0.32, 3.05), (0.58, 0.08, 0.48), mat_stone_plinth, bevel=0.01)
    add_box("Kiosk_Pedestal", (-3.15, 0.85, 3.05), (0.28, 1.0, 0.22), mat_dark_steel, bevel=0.015)
    add_cylinder("Kiosk_Joint", (-3.15, 1.38, 3.05), 0.08, 0.26, mat_gunmetal, vertices=16, rot=(0, 0, math.radians(90)))
    add_box("Kiosk_HeadUnit", (-3.15, 1.55, 3.05), (0.48, 0.36, 0.12), mat_gunmetal, bevel=0.008)
    add_box("Kiosk_DisplayScreen", (-3.15, 1.55, 3.12), (0.42, 0.30, 0.015), mat_led_cyan, bevel=0.002)

    # Clean up, join objects logically or keep modular?
    # We select all mesh objects, apply transforms, and join into a single unified performance-optimized mesh
    # while preserving material slots.
    bpy.ops.object.select_all(action='SELECT')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.context.view_layer.objects.active = meshes[0]
    
    # Calculate pre-join stats
    total_verts = sum(len(m.data.vertices) for m in meshes)
    total_polys = sum(len(m.data.polygons) for m in meshes)
    print(f"Pre-join meshes: {len(meshes)}, total vertices: {total_verts}, total polys: {total_polys}")
    
    # Join into single mesh node for optimal draw call count in Three.js
    bpy.ops.object.join()
    unified_booth = bpy.context.object
    unified_booth.name = "Kinetix_Robotics_Booth_v2"
    unified_booth.data.validate()
    
    # Export GLB with Y-up standard
    print(f"Exporting to {OUT_GLB} ...")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_copyright="Kinetix Robotics & AI Bespoke Booth v2"
    )
    file_size = os.path.getsize(OUT_GLB)
    print(f"Successfully exported {OUT_GLB} ({file_size} bytes, {len(unified_booth.data.vertices)} vertices, {len(unified_booth.data.polygons)} triangles)")

if __name__ == '__main__':
    generate_kinetix_v2()
