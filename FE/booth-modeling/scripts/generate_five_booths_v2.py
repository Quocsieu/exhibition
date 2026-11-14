"""
Five Booths V2 Generator - High-Detail Bespoke Exhibition Architecture
Generates 5 distinct, roofless, architectural exhibition booths for:
1. aether_tech_v2.glb (Tech Lab, anodized aluminum, cyan glow, holographic kiosk, clean tech counter)
2. nordic_living_v2.glb (Scandinavian warm oak, cream architectural plinth, slatted timber partitions, warm accents)
3. ecovita_coffee_v2.glb (Specialty Coffee Craft, dark espresso wood, copper accents, artisanal counter & roastery shelves)
4. lumina_design_v2.glb (Contemporary Design, sculptural flowing panels, brushed champagne gold, museum pedestals)
5. solaris_energy_v2.glb (Clean Green Energy, gloss white frame, solar cell glass modules, integrated planter vines)

All booths strictly observe:
- Local coordinate origins [0, 0, 0] at floor center
- Quầy chính (Hero Counter): [0, y, 0.92], surface at y = 0.56m (Slots 01, 02)
- Kệ tầng trái (Left Shelves): x = -2.44, surfaces at y = 1.72m & y = 0.42m (Slots 03, 04)
- Kệ tầng phải (Right Shelves): x = +2.44, surfaces at y = 1.72m & y = 0.42m (Slots 05, 06)
- Khung Biển hiệu (Header Sign): y = 3.38m, z = 3.48..3.57m (CanvasTexture mounted at z = 3.60m)
- Khung Phông nền (Backdrop Wall): z = -1.95m (CanvasTexture mounted at z = -1.86m)
- Roofless design: Full overview camera visibility with zero overhead obstruction
"""

import bpy
import math
import os
from pathlib import Path

DEST_DIR = Path(r"E:/Lập trình/MatBaoWS/exhibition/FE/public/models/booths/v2")
DEST_DIR.mkdir(parents=True, exist_ok=True)

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

def add_box(name, pos, size, mat, bevel=0.01, segments=2):
    x, y, z = pos
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, -z, y))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod_norm = obj.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod_norm.name)
    return obj

def add_cylinder(name, pos, radius, height, mat, vertices=16, rot=(0,0,0)):
    x, y, z = pos
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=(x, -z, y), rotation=(rot[0], rot[2], rot[1]))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def export_booth(filename):
    bpy.ops.object.select_all(action='SELECT')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        return
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = filename.stem
    obj.data.validate()
    
    out_path = DEST_DIR / filename
    print(f"Exporting {out_path} ...")
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_copyright="Virtual Expo Plaza Booth v2"
    )
    print(f"Done {filename}: {os.path.getsize(out_path)} bytes, {len(obj.data.vertices)} verts, {len(obj.data.polygons)} tris")

# =============================================================================
# 1. AETHER TECH LAB — HIGH-TECH FUTURISTIC (aether_tech_v2.glb)
# =============================================================================
def build_aether_tech():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    mat_anodized_silver = create_pbr_material("TechSilverAlloy", "#cbd5e1", roughness=0.22, metalness=0.88)
    mat_dark_navy = create_pbr_material("TechDarkNavy", "#0f172a", roughness=0.35, metalness=0.45)
    mat_glass_cyan = create_pbr_material("TechFrostedCyan", "#38bdf8", roughness=0.15, metalness=0.2)
    mat_cyan_led = create_pbr_material("LED_CyanHighTech", "#0ea5e9", roughness=0.1, metalness=0.0, emissive_hex="#0ea5e9", emissive_strength=3.5)
    mat_carbon = create_pbr_material("TechCarbonComposite", "#1e293b", roughness=0.25, metalness=0.3)
    mat_plinth = create_pbr_material("TechFoundationStone", "#0b1120", roughness=0.5, metalness=0.3)

    # Floor & Terrace
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_plinth, bevel=0.03)
    add_box("Floor_Deck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_carbon, bevel=0.015)
    add_box("Floor_LED_Edge", (0, 0.28, 2.52), (6.76, 0.02, 0.025), mat_cyan_led, bevel=0)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_plinth, bevel=0.02)
    add_box("Step_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_anodized_silver, bevel=0.005)
    add_box("Step_LED", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_cyan_led, bevel=0)

    # High-Tech Angled Outer Pillars (x = +-3.28m, z = 2.45m)
    for sx in [-3.28, 3.28]:
        add_box(f"Col_Base_{sx}", (sx, 0.38, 2.45), (0.42, 0.16, 0.42), mat_dark_navy, bevel=0.02)
        add_box(f"Col_Shaft_{sx}", (sx, 1.95, 2.45), (0.24, 2.85, 0.24), mat_anodized_silver, bevel=0.02)
        add_cylinder(f"Core_Conduit_{sx}", (sx, 1.95, 2.60), 0.04, 2.6, mat_glass_cyan, vertices=16)
        add_box(f"LED_Spine_{sx}", (sx, 1.95, 2.58), (0.025, 2.4, 0.01), mat_cyan_led, bevel=0)
        # Cantilever arms to header
        add_box(f"Arm_{sx}", (sx, 3.52, 2.95), (0.12, 0.14, 1.25), mat_anodized_silver, bevel=0.008)

    # Rear Support Posts (x = +-2.22m, z = -1.65m)
    for sx in [-2.22, 2.22]:
        add_box(f"Rear_Post_{sx}", (sx, 1.85, -1.65), (0.16, 2.82, 0.16), mat_anodized_silver, bevel=0.01)
        add_box(f"Post_Accent_{sx}", (sx, 1.85, -1.56), (0.03, 2.4, 0.015), mat_cyan_led, bevel=0)
    add_box("Rear_TopRail", (0, 3.32, -1.65), (4.72, 0.14, 0.14), mat_anodized_silver, bevel=0.01)

    # Header Sign Structural Casing (at y = 3.38m, z = 3.48m)
    add_box("Header_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_dark_navy, bevel=0.02)
    add_box("Header_Visor", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_anodized_silver, bevel=0.01)
    add_box("Header_LED_Line", (0, 3.82, 3.69), (6.38, 0.02, 0.02), mat_cyan_led, bevel=0)
    add_box("Header_Bottom_Lip", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_anodized_silver, bevel=0.008)
    for fx in [-2.4, -0.8, 0.8, 2.4]:
        add_box(f"Header_Spot_{fx}", (fx, 3.88, 3.64), (0.06, 0.06, 0.12), mat_dark_navy, bevel=0.004)
        add_cylinder(f"Header_SpotLens_{fx}", (fx, 3.85, 3.72), 0.035, 0.04, mat_cyan_led, vertices=12, rot=(math.radians(35), 0, 0))

    # Rear Backdrop Wall Frame (z = -1.95m, y = 1.82m)
    add_box("Backdrop_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_dark_navy, bevel=0.02)
    add_box("Backdrop_LED_Border", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_cyan_led, bevel=0)
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_anodized_silver, bevel=0.008)

    # Hero Counter (KHU B) — surface at EXACTLY y = 0.56m
    add_box("Counter_Plinth", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_plinth, bevel=0.01)
    add_box("Counter_Body", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_dark_navy, bevel=0.01)
    add_box("Counter_Faceted_Panel", (0, 0.445, 1.36), (3.14, 0.13, 0.04), mat_glass_cyan, bevel=0.008)
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_cyan_led, bevel=0)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_anodized_silver, bevel=0.006)

    # Symmetric Shelves (KHU C) — Upper at y = 1.72m, Lower at y = 0.42m
    for side, sx in [('Left', -2.44), ('Right', 2.44)]:
        # Lower
        add_box(f"Shelf_L_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_plinth, bevel=0.01)
        add_box(f"Shelf_L_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_dark_navy, bevel=0.008)
        add_box(f"Shelf_L_LED_{side}", (sx, 0.41, 1.12), (1.30, 0.012, 0.74), mat_cyan_led, bevel=0)
        add_box(f"Shelf_L_Top_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_anodized_silver, bevel=0.005)
        # Upper
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Strut_{side}_{px}", (sx + px, 1.05, 0.68), 0.035, 1.34, mat_anodized_silver, vertices=16)
        add_box(f"Shelf_U_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_dark_navy, bevel=0.008)
        add_box(f"Shelf_U_LED_{side}", (sx, 1.705, 0.68), (1.28, 0.015, 0.72), mat_cyan_led, bevel=0)
        add_box(f"Shelf_U_Top_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_anodized_silver, bevel=0.005)
        add_box(f"Shelf_Back_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_dark_navy, bevel=0.01)

    # Holographic Totem Kiosk
    add_box("Kiosk_Base", (-3.15, 0.32, 3.05), (0.58, 0.08, 0.48), mat_plinth, bevel=0.01)
    add_box("Kiosk_Pedestal", (-3.15, 0.95, 3.05), (0.24, 1.2, 0.20), mat_anodized_silver, bevel=0.01)
    add_box("Kiosk_Screen", (-3.15, 1.65, 3.05), (0.44, 0.52, 0.04), mat_cyan_led, bevel=0.004)

    export_booth(Path("aether_tech_v2.glb"))

# =============================================================================
# 2. NORDIC LIVING STUDIO — SCANDINAVIAN LIVING (nordic_living_v2.glb)
# =============================================================================
def build_nordic_living():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_oak = create_pbr_material("NordicNaturalOak", "#b8946a", roughness=0.55, metalness=0.02)
    mat_white_timber = create_pbr_material("NordicWhiteAsh", "#e2ded9", roughness=0.45, metalness=0.05)
    mat_slate_plinth = create_pbr_material("NordicStonePlinth", "#475569", roughness=0.6, metalness=0.1)
    mat_cream_felt = create_pbr_material("NordicWoolCarpet", "#f1ece4", roughness=0.85, metalness=0.0)
    mat_warm_led = create_pbr_material("LED_WarmWhite", "#fef08a", roughness=0.2, metalness=0.0, emissive_hex="#fef08a", emissive_strength=2.2)
    mat_brass = create_pbr_material("NordicSatinBrass", "#d97706", roughness=0.3, metalness=0.85)

    # Floor & Steps
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_slate_plinth, bevel=0.03)
    add_box("Floor_Deck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_cream_felt, bevel=0.015)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_slate_plinth, bevel=0.02)
    add_box("Step_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_oak, bevel=0.005)
    add_box("Step_LED", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_warm_led, bevel=0)

    # Warm Oak Square Architectural Posts (x = +-3.28m, z = 2.45m)
    for sx in [-3.28, 3.28]:
        add_box(f"Col_Base_{sx}", (sx, 0.38, 2.45), (0.38, 0.16, 0.38), mat_slate_plinth, bevel=0.02)
        add_box(f"Col_Shaft_{sx}", (sx, 1.95, 2.45), (0.24, 2.85, 0.24), mat_oak, bevel=0.02)
        # Vertical decorative timber louvers on sides
        for j in range(4):
            add_box(f"Louver_{sx}_{j}", (sx + (0.16 if sx > 0 else -0.16), 1.95, 2.15 - j * 0.22), (0.04, 2.6, 0.12), mat_oak, bevel=0.005)
        add_box(f"Arm_{sx}", (sx, 3.52, 2.95), (0.14, 0.14, 1.25), mat_oak, bevel=0.01)

    # Rear Slatted Screen Posts (x = +-2.22m, z = -1.65m)
    for sx in [-2.22, 2.22]:
        add_box(f"Rear_Post_{sx}", (sx, 1.85, -1.65), (0.18, 2.82, 0.18), mat_oak, bevel=0.01)
    add_box("Rear_TopRail", (0, 3.32, -1.65), (4.72, 0.14, 0.14), mat_oak, bevel=0.01)
    # Scandinavian vertical slats on backdrop flanking
    for side in [-1, 1]:
        for i in range(5):
            add_box(f"Slat_{side}_{i}", (side * (1.75 + i * 0.1), 1.75, -1.75), (0.045, 2.5, 0.06), mat_oak, bevel=0.004)

    # Header Sign Casing (Nordic natural wood surround)
    add_box("Header_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_white_timber, bevel=0.02)
    add_box("Header_Visor", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_oak, bevel=0.01)
    add_box("Header_WarmLED", (0, 3.82, 3.69), (6.38, 0.02, 0.02), mat_warm_led, bevel=0)
    add_box("Header_Bottom_Lip", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_oak, bevel=0.008)

    # Rear Backdrop Wall Frame
    add_box("Backdrop_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_white_timber, bevel=0.02)
    add_box("Backdrop_WarmLED", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_warm_led, bevel=0)
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_brass, bevel=0.008)

    # Hero Counter (KHU B) — Scandinavian Minimalist Oak Bar
    add_box("Counter_Plinth", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_slate_plinth, bevel=0.01)
    add_box("Counter_Body", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_white_timber, bevel=0.01)
    # Tambour wood slat texture panel on front
    for vi in range(15):
        add_box(f"Counter_Slat_{vi}", (-1.4 + vi * 0.2, 0.445, 1.36), (0.08, 0.13, 0.03), mat_oak, bevel=0.003)
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_warm_led, bevel=0)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_oak, bevel=0.006)

    # Symmetric Shelves (KHU C) — Nordic open shelving
    for side, sx in [('Left', -2.44), ('Right', 2.44)]:
        add_box(f"Shelf_L_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_slate_plinth, bevel=0.01)
        add_box(f"Shelf_L_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_white_timber, bevel=0.008)
        add_box(f"Shelf_L_Top_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_oak, bevel=0.005)
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Strut_{side}_{px}", (sx + px, 1.05, 0.68), 0.035, 1.34, mat_brass, vertices=16)
        add_box(f"Shelf_U_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_white_timber, bevel=0.008)
        add_box(f"Shelf_U_Top_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_oak, bevel=0.005)
        add_box(f"Shelf_Back_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_oak, bevel=0.01)

    export_booth(Path("nordic_living_v2.glb"))

# =============================================================================
# 3. ECOVITA ROASTERY & CRAFT — RUSTIC INDUSTRIAL (ecovita_coffee_v2.glb)
# =============================================================================
def build_ecovita_coffee():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_espresso = create_pbr_material("EspressoWood", "#3b2314", roughness=0.58, metalness=0.04)
    mat_copper = create_pbr_material("ArtisanalCopper", "#d97706", roughness=0.25, metalness=0.88)
    mat_black_iron = create_pbr_material("WroughtBlackIron", "#1f2421", roughness=0.45, metalness=0.8)
    mat_concrete = create_pbr_material("PolishedConcretePlinth", "#333d29", roughness=0.65, metalness=0.15)
    mat_amber_led = create_pbr_material("LED_AmberRoastery", "#f59e0b", roughness=0.2, metalness=0.0, emissive_hex="#f59e0b", emissive_strength=2.8)

    # Floor & Terrace
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_concrete, bevel=0.03)
    add_box("Floor_Deck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_espresso, bevel=0.015)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_concrete, bevel=0.02)
    add_box("Step_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_copper, bevel=0.005)
    add_box("Step_LED", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_amber_led, bevel=0)

    # Dark Iron Industrial Columns & Copper Pipes
    for sx in [-3.28, 3.28]:
        add_box(f"Col_Base_{sx}", (sx, 0.38, 2.45), (0.40, 0.16, 0.40), mat_black_iron, bevel=0.02)
        add_box(f"Col_Shaft_{sx}", (sx, 1.95, 2.45), (0.22, 2.85, 0.22), mat_black_iron, bevel=0.015)
        # Copper brewing conduit pipes running up the column
        add_cylinder(f"Copper_Pipe1_{sx}", (sx + 0.12, 1.95, 2.58), 0.022, 2.6, mat_copper, vertices=12)
        add_cylinder(f"Copper_Pipe2_{sx}", (sx - 0.12, 1.95, 2.58), 0.022, 2.6, mat_copper, vertices=12)
        add_box(f"Arm_{sx}", (sx, 3.52, 2.95), (0.12, 0.14, 1.25), mat_black_iron, bevel=0.008)

    # Rear Posts & Roastery Flavour Shelving Rack
    for sx in [-2.22, 2.22]:
        add_box(f"Rear_Post_{sx}", (sx, 1.85, -1.65), (0.16, 2.82, 0.16), mat_black_iron, bevel=0.01)
    add_box("Rear_TopRail", (0, 3.32, -1.65), (4.72, 0.14, 0.14), mat_black_iron, bevel=0.01)
    # Timber panel wall insets
    for side in [-1, 1]:
        for j in range(4):
            add_box(f"Cask_Panel_{side}_{j}", (side * 2.14, 0.8 + j * 0.55, -1.72), (0.42, 0.45, 0.08), mat_espresso, bevel=0.01)

    # Header Sign Casing (Espresso wood & copper cornice)
    add_box("Header_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_espresso, bevel=0.02)
    add_box("Header_Visor", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_copper, bevel=0.01)
    add_box("Header_AmberLED", (0, 3.82, 3.69), (6.38, 0.02, 0.02), mat_amber_led, bevel=0)
    add_box("Header_Bottom_Lip", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_black_iron, bevel=0.008)

    # Rear Backdrop Wall Frame
    add_box("Backdrop_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_espresso, bevel=0.02)
    add_box("Backdrop_AmberLED", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_amber_led, bevel=0)
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_copper, bevel=0.008)

    # Hero Counter (KHU B) — Specialty Coffee Tasting Bar
    add_box("Counter_Plinth", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_concrete, bevel=0.01)
    add_box("Counter_Body", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_espresso, bevel=0.01)
    add_box("Counter_CopperTrim", (0, 0.445, 1.36), (3.14, 0.13, 0.04), mat_copper, bevel=0.006)
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_amber_led, bevel=0)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_espresso, bevel=0.006)

    # Symmetric Shelves (KHU C) — Copper strut shelves
    for side, sx in [('Left', -2.44), ('Right', 2.44)]:
        add_box(f"Shelf_L_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_concrete, bevel=0.01)
        add_box(f"Shelf_L_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_espresso, bevel=0.008)
        add_box(f"Shelf_L_Top_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_espresso, bevel=0.005)
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Strut_{side}_{px}", (sx + px, 1.05, 0.68), 0.032, 1.34, mat_copper, vertices=16)
        add_box(f"Shelf_U_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_black_iron, bevel=0.008)
        add_box(f"Shelf_U_Top_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_espresso, bevel=0.005)
        add_box(f"Shelf_Back_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_espresso, bevel=0.01)

    export_booth(Path("ecovita_coffee_v2.glb"))

# =============================================================================
# 4. LUMINA DESIGN COLLECTIVE — CONTEMPORARY ART & GALLERY (lumina_design_v2.glb)
# =============================================================================
def build_lumina_design():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_gallery_white = create_pbr_material("GalleryAlabaster", "#f8fafc", roughness=0.32, metalness=0.08)
    mat_champagne = create_pbr_material("ChampagneGold", "#fde68a", roughness=0.22, metalness=0.85)
    mat_magenta_accent = create_pbr_material("LuminaMagenta", "#ec4899", roughness=0.35, metalness=0.2)
    mat_magenta_led = create_pbr_material("LED_MagentaArt", "#f43f5e", roughness=0.1, metalness=0.0, emissive_hex="#f43f5e", emissive_strength=3.2)
    mat_terrazzo = create_pbr_material("TerrazzoStonePlinth", "#e2e8f0", roughness=0.45, metalness=0.12)

    # Floor & Terrace
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_terrazzo, bevel=0.03)
    add_box("Floor_Deck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_gallery_white, bevel=0.015)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_terrazzo, bevel=0.02)
    add_box("Step_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_champagne, bevel=0.005)
    add_box("Step_LED", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_magenta_led, bevel=0)

    # Sculptural Sculpted Columns (x = +-3.28m, z = 2.45m)
    for sx in [-3.28, 3.28]:
        add_box(f"Col_Base_{sx}", (sx, 0.38, 2.45), (0.42, 0.16, 0.42), mat_gallery_white, bevel=0.02)
        # Rounded architectural portal pillar
        add_box(f"Col_Shaft_{sx}", (sx, 1.95, 2.45), (0.22, 2.85, 0.22), mat_gallery_white, bevel=0.04)
        add_box(f"Col_Facet_{sx}", (sx, 1.95, 2.58), (0.05, 2.4, 0.02), mat_champagne, bevel=0.005)
        add_box(f"Arm_{sx}", (sx, 3.52, 2.95), (0.12, 0.14, 1.25), mat_champagne, bevel=0.008)

    # Rear Slender Architectural Spire Posts
    for sx in [-2.22, 2.22]:
        add_box(f"Rear_Post_{sx}", (sx, 1.85, -1.65), (0.14, 2.82, 0.14), mat_gallery_white, bevel=0.01)
    add_box("Rear_TopRail", (0, 3.32, -1.65), (4.72, 0.12, 0.12), mat_champagne, bevel=0.008)

    # Header Sign Casing (Minimalist floating gallery halo)
    add_box("Header_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_gallery_white, bevel=0.02)
    add_box("Header_Visor", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_champagne, bevel=0.01)
    add_box("Header_MagentaLED", (0, 3.82, 3.69), (6.38, 0.02, 0.02), mat_magenta_led, bevel=0)
    add_box("Header_Bottom_Lip", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_champagne, bevel=0.008)

    # Rear Backdrop Wall Frame
    add_box("Backdrop_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_gallery_white, bevel=0.02)
    add_box("Backdrop_MagentaLED", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_magenta_led, bevel=0)
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_champagne, bevel=0.008)

    # Hero Counter (KHU B) — Contemporary Sculpted Gallery Desk
    add_box("Counter_Plinth", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_terrazzo, bevel=0.01)
    add_box("Counter_Body", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_gallery_white, bevel=0.015)
    add_box("Counter_FrontArc", (0, 0.445, 1.36), (3.14, 0.13, 0.04), mat_magenta_accent, bevel=0.008)
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_magenta_led, bevel=0)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_champagne, bevel=0.006)

    # Symmetric Shelves (KHU C) — Gallery Display Pedestals
    for side, sx in [('Left', -2.44), ('Right', 2.44)]:
        add_box(f"Shelf_L_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_terrazzo, bevel=0.01)
        add_box(f"Shelf_L_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_gallery_white, bevel=0.008)
        add_box(f"Shelf_L_Top_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_champagne, bevel=0.005)
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Strut_{side}_{px}", (sx + px, 1.05, 0.68), 0.028, 1.34, mat_champagne, vertices=16)
        add_box(f"Shelf_U_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_gallery_white, bevel=0.008)
        add_box(f"Shelf_U_Top_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_champagne, bevel=0.005)
        add_box(f"Shelf_Back_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_gallery_white, bevel=0.01)

    export_booth(Path("lumina_design_v2.glb"))

# =============================================================================
# 5. SOLARIS CLEAN ENERGY — SUSTAINABLE TECH (solaris_energy_v2.glb)
# =============================================================================
def build_solaris_energy():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mat_pure_white = create_pbr_material("SolarisGlossWhite", "#f8fafc", roughness=0.25, metalness=0.1)
    mat_teal_solar = create_pbr_material("PhotovoltaicTeal", "#0f766e", roughness=0.18, metalness=0.65)
    mat_emerald_glow = create_pbr_material("LED_EmeraldClean", "#10b981", roughness=0.1, metalness=0.0, emissive_hex="#10b981", emissive_strength=3.5)
    mat_bamboo = create_pbr_material("SustainableBamboo", "#d97706", roughness=0.45, metalness=0.05)
    mat_sandstone = create_pbr_material("EcoSandstonePlinth", "#e6f4ea", roughness=0.55, metalness=0.1)

    # Floor & Terrace
    add_box("Plinth_Base", (0, 0.14, 0), (7.24, 0.28, 5.44), mat_sandstone, bevel=0.03)
    add_box("Floor_Deck", (0, 0.29, 0.05), (6.74, 0.06, 4.94), mat_pure_white, bevel=0.015)
    add_box("Floor_LED_Edge", (0, 0.28, 2.52), (6.76, 0.02, 0.025), mat_emerald_glow, bevel=0)
    add_box("Step_Tier1", (0, 0.09, 2.86), (5.6, 0.18, 0.58), mat_sandstone, bevel=0.02)
    add_box("Step_Nosing", (0, 0.185, 2.86), (5.64, 0.025, 0.62), mat_teal_solar, bevel=0.005)
    add_box("Step_LED", (0, 0.165, 3.16), (5.4, 0.015, 0.015), mat_emerald_glow, bevel=0)

    # White Columns with Vertical Photovoltaic Solar Ribs (x = +-3.28m, z = 2.45m)
    for sx in [-3.28, 3.28]:
        add_box(f"Col_Base_{sx}", (sx, 0.38, 2.45), (0.42, 0.16, 0.42), mat_pure_white, bevel=0.02)
        add_box(f"Col_Shaft_{sx}", (sx, 1.95, 2.45), (0.24, 2.85, 0.24), mat_pure_white, bevel=0.02)
        # Vertical solar panel strips embedded in column
        add_box(f"Solar_Strip_{sx}", (sx, 1.95, 2.58), (0.12, 2.5, 0.02), mat_teal_solar, bevel=0.004)
        add_box(f"Emerald_Trim_{sx}", (sx, 1.95, 2.60), (0.02, 2.4, 0.01), mat_emerald_glow, bevel=0)
        add_box(f"Arm_{sx}", (sx, 3.52, 2.95), (0.12, 0.14, 1.25), mat_pure_white, bevel=0.008)

    # Rear Structural Posts with Solar Infill Panels
    for sx in [-2.22, 2.22]:
        add_box(f"Rear_Post_{sx}", (sx, 1.85, -1.65), (0.16, 2.82, 0.16), mat_pure_white, bevel=0.01)
    add_box("Rear_TopRail", (0, 3.32, -1.65), (4.72, 0.14, 0.14), mat_pure_white, bevel=0.01)
    # 8 Vertical Solar Collector Panels (Roofless, behind backdrop)
    for side in [-1, 1]:
        for p in range(4):
            add_box(f"PV_Panel_{side}_{p}", (side * (1.75 + p * 0.12), 1.75, -1.75), (0.09, 2.4, 0.05), mat_teal_solar, bevel=0.004)

    # Header Sign Casing (Clean gloss white with emerald eco LED)
    add_box("Header_Casing", (0, 3.38, 3.48), (6.42, 0.82, 0.18), mat_pure_white, bevel=0.02)
    add_box("Header_Visor", (0, 3.82, 3.54), (6.52, 0.08, 0.34), mat_teal_solar, bevel=0.01)
    add_box("Header_EmeraldLED", (0, 3.82, 3.69), (6.38, 0.02, 0.02), mat_emerald_glow, bevel=0)
    add_box("Header_Bottom_Lip", (0, 2.94, 3.52), (6.46, 0.06, 0.22), mat_pure_white, bevel=0.008)

    # Rear Backdrop Wall Frame
    add_box("Backdrop_Frame", (0, 1.82, -1.95), (4.26, 2.58, 0.14), mat_pure_white, bevel=0.02)
    add_box("Backdrop_EmeraldLED", (0, 1.82, -1.89), (4.18, 2.48, 0.02), mat_emerald_glow, bevel=0)
    add_box("Backdrop_Light_Bar", (0, 3.12, -1.78), (3.96, 0.08, 0.24), mat_teal_solar, bevel=0.008)

    # Hero Counter (KHU B) — Sustainable Technology Podium
    add_box("Counter_Plinth", (0, 0.33, 0.92), (3.24, 0.08, 0.78), mat_sandstone, bevel=0.01)
    add_box("Counter_Body", (0, 0.445, 0.92), (3.34, 0.15, 0.86), mat_pure_white, bevel=0.01)
    add_box("Counter_SolarFace", (0, 0.445, 1.36), (3.14, 0.13, 0.04), mat_teal_solar, bevel=0.008)
    add_box("Counter_LED_Strip", (0, 0.525, 0.92), (3.42, 0.02, 0.90), mat_emerald_glow, bevel=0)
    add_box("Counter_Top_Surface", (0, 0.5425, 0.92), (3.46, 0.035, 0.94), mat_bamboo, bevel=0.006)

    # Symmetric Shelves (KHU C) — Eco Module Shelves
    for side, sx in [('Left', -2.44), ('Right', 2.44)]:
        add_box(f"Shelf_L_Base_{side}", (sx, 0.34, 1.12), (1.24, 0.10, 0.68), mat_sandstone, bevel=0.01)
        add_box(f"Shelf_L_Body_{side}", (sx, 0.40, 1.12), (1.26, 0.04, 0.70), mat_pure_white, bevel=0.008)
        add_box(f"Shelf_L_Top_{side}", (sx, 0.42, 1.12), (1.32, 0.02, 0.76), mat_bamboo, bevel=0.005)
        for px in [-0.52, 0.52]:
            add_cylinder(f"Shelf_Strut_{side}_{px}", (sx + px, 1.05, 0.68), 0.032, 1.34, mat_pure_white, vertices=16)
        add_box(f"Shelf_U_Bracket_{side}", (sx, 1.68, 0.68), (1.22, 0.05, 0.68), mat_teal_solar, bevel=0.008)
        add_box(f"Shelf_U_Top_{side}", (sx, 1.72, 0.68), (1.32, 0.025, 0.76), mat_bamboo, bevel=0.005)
        add_box(f"Shelf_Back_{side}", (sx, 2.30, 0.33), (1.28, 1.14, 0.05), mat_pure_white, bevel=0.01)

    export_booth(Path("solaris_energy_v2.glb"))

if __name__ == '__main__':
    print("--- 1/5 Aether Tech ---")
    build_aether_tech()
    print("--- 2/5 Nordic Living ---")
    build_nordic_living()
    print("--- 3/5 EcoVita Coffee ---")
    build_ecovita_coffee()
    print("--- 4/5 Lumina Design ---")
    build_lumina_design()
    print("--- 5/5 Solaris Energy ---")
    build_solaris_energy()
    print("--- ALL 5 BOOTHS GENERATED SUCCESSFULLY ---")
