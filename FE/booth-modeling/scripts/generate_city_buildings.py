"""
Procedural Stylized 3D City Buildings Generator
Generates 4 distinct high-detail architectural buildings using Blender 4.2:
- city_building_01: Classic European Townhouse (Hausmann style, mansard roof, dormers, wrought-iron balconies)
- city_building_02: Commercial Corner Building (Ground floor shopfronts, fabric awnings, brick facade)
- city_building_03: Mediterranean Palazzo (Stucco walls, arched loggias, terracotta roof tiles, quoins)
- city_building_04: Neo-Classical Civic Building (Stepped setbacks, fluted pilasters, ornamental cornices)

Output directory: FE/public/models/exterior/
"""

import os
import sys
import math
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
OUTPUT_DIR = ROOT_DIR / "public" / "models" / "exterior"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

import bpy

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_mat(name, color, roughness=0.6, metalness=0.0, transmission=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        # Base color RGBA
        r, g, b = [int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
        bsdf.inputs['Base Color'].default_value = (r, g, b, alpha)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metalness
        if transmission > 0:
            if 'Transmission Weight' in bsdf.inputs:
                bsdf.inputs['Transmission Weight'].default_value = transmission
            elif 'Transmission' in bsdf.inputs:
                bsdf.inputs['Transmission'].default_value = transmission
    return mat

def add_box(name, size, loc, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    ob.location = loc
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        ob.data.materials.append(mat)
    return ob

def add_cylinder(name, radius, depth, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=16, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    if mat:
        ob.data.materials.append(mat)
    return ob

# ============================================================================
# BUILDING 01: CLASSIC EUROPEAN TOWNHOUSE (HAUSMANN STYLE)
# ============================================================================
def build_city_building_01():
    print("Building City Model 01: Classic European Townhouse...")
    clear_scene()

    # Materials
    mat_stone_base = create_mat("StoneBase", "#D1D5DB", roughness=0.7)
    mat_facade = create_mat("StuccoFacade", "#F3F4F6", roughness=0.65)
    mat_cornice = create_mat("MoldedCornice", "#E5E7EB", roughness=0.5)
    mat_mansard = create_mat("MansardRoof", "#334155", roughness=0.5)
    mat_iron = create_mat("WroughtIron", "#1E293B", roughness=0.35, metalness=0.7)
    mat_glass = create_mat("WindowGlass", "#0284C7", roughness=0.1, metalness=0.2)
    mat_wood = create_mat("EntranceWood", "#78350F", roughness=0.45)

    W, D, H = 7.2, 6.2, 14.5
    # 1. Rusticated Stone Base (Ground Floor, H=3.5m)
    add_box("B01_GroundFloor", (W, D, 3.5), (0, 0, 1.75), mat_stone_base)

    # Ground floor shop entrance and arched display windows
    add_box("B01_ShopDoor", (1.6, 0.2, 2.6), (0, -D/2 - 0.05, 1.3), mat_wood)
    add_box("B01_ShopWin_L", (1.8, 0.15, 2.2), (-2.2, -D/2 - 0.05, 1.4), mat_glass)
    add_box("B01_ShopWin_R", (1.8, 0.15, 2.2), (2.2, -D/2 - 0.05, 1.4), mat_glass)

    # String course separating ground and upper floors
    add_box("B01_StringCourse1", (W + 0.3, D + 0.3, 0.28), (0, 0, 3.5), mat_cornice)

    # 2. Middle Floors (Floors 2 & 3, H=7.0m)
    add_box("B01_UpperFacade", (W, D, 7.0), (0, 0, 7.0), mat_facade)

    # Grand Continuous Wrought-Iron Balcony on 2nd Floor (Z=3.65 to 4.65)
    add_box("B01_BalconySlab", (W + 0.4, 0.8, 0.15), (0, -D/2 - 0.4, 3.65), mat_stone_base)
    add_box("B01_BalconyRailTop", (W + 0.38, 0.78, 0.06), (0, -D/2 - 0.4, 4.55), mat_iron)
    add_box("B01_BalconyFace", (W + 0.36, 0.04, 0.75), (0, -D/2 - 0.78, 4.15), mat_iron)
    add_box("B01_BalconySideL", (0.04, 0.75, 0.75), (-W/2 - 0.18, -D/2 - 0.4, 4.15), mat_iron)
    add_box("B01_BalconySideR", (0.04, 0.75, 0.75), (W/2 + 0.18, -D/2 - 0.4, 4.15), mat_iron)

    # Upper floor windows with framed stone architraves (Floors 2 and 3)
    for floor_idx, fz in enumerate([5.4, 8.6]):
        for wx in [-2.2, 0.0, 2.2]:
            # Stone lintel & frame
            add_box(f"B01_WinFrame_f{floor_idx}_{wx}", (1.3, 0.18, 2.1), (wx, -D/2 - 0.06, fz), mat_cornice)
            # Glass pane
            add_box(f"B01_Glass_f{floor_idx}_{wx}", (1.0, 0.12, 1.8), (wx, -D/2 - 0.08, fz), mat_glass)
            # 3rd floor individual window iron balcony
            if floor_idx == 1:
                add_box(f"B01_Juliette_{wx}", (1.2, 0.3, 0.6), (wx, -D/2 - 0.18, fz - 0.6), mat_iron)

    # 3. Main Dentil Cornice & Frieze at Roofline (Z=10.5m)
    add_box("B01_CorniceFrieze", (W + 0.45, D + 0.45, 0.45), (0, 0, 10.5), mat_cornice)
    add_box("B01_CorniceUpper", (W + 0.65, D + 0.65, 0.25), (0, 0, 10.8), mat_cornice)

    # 4. Classic Mansard Sloped Slate Roof (Z=10.9m to 14.2m)
    add_box("B01_MansardBody", (W - 0.4, D - 0.4, 3.2), (0, 0, 12.4), mat_mansard)

    # Roof Attic Dormer Windows (Cửa sổ mái Mansard)
    for dx in [-1.8, 1.8]:
        add_box(f"B01_DormerBody_{dx}", (1.1, 1.2, 1.5), (dx, -D/2 + 0.3, 12.0), mat_cornice)
        add_box(f"B01_DormerGlass_{dx}", (0.7, 0.2, 1.0), (dx, -D/2 - 0.25, 11.9), mat_glass)
        add_box(f"B01_DormerRoof_{dx}", (1.3, 1.3, 0.25), (dx, -D/2 + 0.3, 12.85), mat_mansard)

    out_path = OUTPUT_DIR / "city_building_01.glb"
    bpy.ops.export_scene.gltf(filepath=str(out_path), export_format='GLB')
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path

# ============================================================================
# BUILDING 02: COMMERCIAL CORNER BUILDING (FABRIC AWNINGS & BRICK FACADE)
# ============================================================================
def build_city_building_02():
    print("Building City Model 02: Commercial Building with Awnings...")
    clear_scene()

    mat_brick = create_mat("WarmBrick", "#9A3412", roughness=0.8)
    mat_stone = create_mat("LimestoneTrim", "#E5E7EB", roughness=0.6)
    mat_glass = create_mat("ShopGlass", "#38BDF8", roughness=0.1, metalness=0.3)
    mat_awning = create_mat("TerracottaAwning", "#C2410C", roughness=0.6)
    mat_roof = create_mat("TerracottaRoof", "#B45309", roughness=0.7)
    mat_iron = create_mat("DarkMetal", "#0F172A", roughness=0.4, metalness=0.8)

    W, D, H = 7.0, 6.4, 15.0
    # 1. Ground Floor Commercial Storefront with Wide Plate Glass
    add_box("B02_GroundStore", (W, D, 3.6), (0, 0, 1.8), mat_stone)
    add_box("B02_GlassFront", (W - 0.8, 0.2, 2.4), (0, -D/2 - 0.05, 1.5), mat_glass)

    # Striped Commercial Fabric Awnings over Storefront (Mái hiên che nắng vươn ra)
    for ax in [-2.0, 0.0, 2.0]:
        add_box(f"B02_Awning_{ax}", (1.8, 1.4, 0.4), (ax, -D/2 - 0.7, 3.1), mat_awning)

    # 2. Upper Brick Facade (Z=3.6 to 11.2)
    add_box("B02_BrickFacade", (W, D, 7.6), (0, 0, 7.4), mat_brick)

    # Corner Stone Quoins (Đá ốp góc tường sole)
    for cx in [-W/2, W/2]:
        for cy in [-D/2, D/2]:
            for qz in [4.2, 5.4, 6.6, 7.8, 9.0, 10.2]:
                add_box(f"B02_Quoin_{cx}_{cy}_{qz}", (0.35, 0.35, 0.5), (cx, cy, qz), mat_stone)

    # Upper Floor Windows with White Stone Sills & Lintels
    for f_idx, fz in enumerate([5.2, 7.6, 10.0]):
        for wx in [-2.1, 0.0, 2.1]:
            # Lintel
            add_box(f"B02_Lintel_{f_idx}_{wx}", (1.25, 0.2, 0.22), (wx, -D/2 - 0.05, fz + 0.9), mat_stone)
            # Glass
            add_box(f"B02_WinGlass_{f_idx}_{wx}", (0.95, 0.15, 1.5), (wx, -D/2 - 0.05, fz), mat_glass)
            # Sill
            add_box(f"B02_Sill_{f_idx}_{wx}", (1.3, 0.3, 0.16), (wx, -D/2 - 0.1, fz - 0.85), mat_stone)

    # 3. Heavy Classical Cornice & Stepped Roof Parapet
    add_box("B02_RoofCornice", (W + 0.5, D + 0.5, 0.4), (0, 0, 11.4), mat_stone)
    add_box("B02_RoofDeck", (W - 0.2, D - 0.2, 2.8), (0, 0, 13.0), mat_roof)

    # Rooftop Terrace Balustrade & Pergola Frame
    add_box("B02_RoofPergola", (W - 0.8, D - 0.8, 0.25), (0, 0, 14.5), mat_iron)

    out_path = OUTPUT_DIR / "city_building_02.glb"
    bpy.ops.export_scene.gltf(filepath=str(out_path), export_format='GLB')
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path

# ============================================================================
# BUILDING 03: MEDITERRANEAN PALAZZO (ARCHED LOGGIA & TERRACOTTA ROOF)
# ============================================================================
def build_city_building_03():
    print("Building City Model 03: Mediterranean Palazzo...")
    clear_scene()

    mat_stucco = create_mat("CreamStucco", "#FEF3C7", roughness=0.85)
    mat_stone = create_mat("WarmLimestone", "#E2DACD", roughness=0.65)
    mat_wood = create_mat("CedarWood", "#92400E", roughness=0.5)
    mat_roof = create_mat("ClayTile", "#DC2626", roughness=0.75)
    mat_glass = create_mat("VillaGlass", "#0284C7", roughness=0.15, metalness=0.2)
    mat_iron = create_mat("IronBalcony", "#1E293B", roughness=0.4, metalness=0.8)

    W, D, H = 7.4, 6.2, 13.8
    # 1. Warm Stucco Main Massing
    add_box("B03_MainBody", (W, D, 10.2), (0, 0, 5.1), mat_stucco)

    # Classical Entrance Portal with Stone Columns
    add_cylinder("B03_EntranceCol_L", 0.22, 3.2, (-1.2, -D/2 - 0.2, 1.6), mat=mat_stone)
    add_cylinder("B03_EntranceCol_R", 0.22, 3.2, (1.2, -D/2 - 0.2, 1.6), mat=mat_stone)
    add_box("B03_EntranceArch", (3.0, 0.45, 0.4), (0, -D/2 - 0.2, 3.3), mat_stone)
    add_box("B03_MainDoor", (1.6, 0.2, 2.7), (0, -D/2 + 0.05, 1.35), mat_wood)

    # 2. Arched Windows on 2nd and 3rd Floors with Wooden Louvered Shutters
    for f_idx, fz in enumerate([5.4, 8.4]):
        for wx in [-2.2, 0.0, 2.2]:
            # Arched window frame
            add_box(f"B03_ArchWin_{f_idx}_{wx}", (1.2, 0.2, 1.9), (wx, -D/2 - 0.05, fz), mat_stone)
            add_box(f"B03_Glass_{f_idx}_{wx}", (0.85, 0.15, 1.6), (wx, -D/2 - 0.06, fz), mat_glass)
            # Wooden shutters flanking window
            add_box(f"B03_ShutterL_{f_idx}_{wx}", (0.35, 0.1, 1.6), (wx - 0.65, -D/2 - 0.08, fz), mat_wood)
            add_box(f"B03_ShutterR_{f_idx}_{wx}", (0.35, 0.1, 1.6), (wx + 0.65, -D/2 - 0.08, fz), mat_wood)

    # 3. Heavy Timber Corbels under Roof Eaves
    add_box("B03_EavesBeam", (W + 0.5, D + 0.5, 0.25), (0, 0, 10.3), mat_wood)
    for bx in range(8):
        k = -W/2 + 0.5 + bx * (W - 1.0) / 7.0
        add_box(f"B03_Corbel_{bx}", (0.16, 0.4, 0.3), (k, -D/2 - 0.2, 10.1), mat_wood)

    # 4. Hipped Spanish Clay Barrel Tile Roof (Z=10.4 to 13.4)
    add_box("B03_RoofHipped", (W + 0.8, D + 0.8, 1.2), (0, 0, 11.0), mat_roof)
    add_box("B03_RoofRidge", (W - 1.2, D - 1.2, 1.6), (0, 0, 12.2), mat_roof)

    out_path = OUTPUT_DIR / "city_building_03.glb"
    bpy.ops.export_scene.gltf(filepath=str(out_path), export_format='GLB')
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path

# ============================================================================
# BUILDING 04: NEO-CLASSICAL CIVIC BUILDING (STEPPED SETBACKS & PILASTERS)
# ============================================================================
def build_city_building_04():
    print("Building City Model 04: Neo-Classical Civic Building...")
    clear_scene()

    mat_stone = create_mat("LimestoneCivic", "#E2E8F0", roughness=0.55)
    mat_dark_stone = create_mat("BasaltTrim", "#475569", roughness=0.6)
    mat_glass = create_mat("CivicGlass", "#0EA5E9", roughness=0.1, metalness=0.4)
    mat_bronze = create_mat("BronzeOrnament", "#D97706", roughness=0.3, metalness=0.85)

    W, D, H = 7.8, 6.4, 16.5
    # 1. Base Tier (Z=0 to 9.0)
    add_box("B04_BaseTier", (W, D, 9.0), (0, 0, 4.5), mat_stone)

    # Fluted vertical pilasters running up the facade
    for px in [-2.7, -0.9, 0.9, 2.7]:
        add_box(f"B04_Pilaster_{px}", (0.45, 0.25, 8.8), (px, -D/2 - 0.1, 4.5), mat_stone)
        add_box(f"B04_PilasterCap_{px}", (0.55, 0.35, 0.35), (px, -D/2 - 0.1, 8.8), mat_bronze)

    # Vertical window bays between pilasters
    for bx in [-1.8, 0.0, 1.8]:
        for fz in [2.2, 5.0, 7.6]:
            add_box(f"B04_Window_{bx}_{fz}", (1.1, 0.18, 1.8), (bx, -D/2 - 0.05, fz), mat_glass)
            add_box(f"B04_Spandrel_{bx}_{fz}", (1.1, 0.22, 0.4), (bx, -D/2 - 0.06, fz - 1.1), mat_dark_stone)

    # Intermediate Setback Cornice (Z=9.0)
    add_box("B04_SetbackCornice1", (W + 0.3, D + 0.3, 0.4), (0, 0, 9.2), mat_dark_stone)

    # 2. Upper Stepped Setback Tier (Z=9.4 to 14.5, Narrower Width)
    add_box("B04_SetbackTier", (W - 1.4, D - 1.2, 5.2), (0, 0, 12.0), mat_stone)

    for px in [-1.8, 0.0, 1.8]:
        for fz in [11.0, 13.4]:
            add_box(f"B04_UpperWin_{px}_{fz}", (0.9, 0.18, 1.6), (px, -D/2 + 0.55, fz), mat_glass)

    # Top Crown Cornice & Art-Deco Stepped Parapet
    add_box("B04_CrownCornice", (W - 1.1, D - 0.9, 0.4), (0, 0, 14.8), mat_dark_stone)
    add_box("B04_AtticStepped", (W - 2.8, D - 2.0, 1.2), (0, 0, 15.6), mat_stone)
    add_box("B04_ApexSpire", (0.35, 0.35, 1.4), (0, 0, 16.6), mat_bronze)

    out_path = OUTPUT_DIR / "city_building_04.glb"
    bpy.ops.export_scene.gltf(filepath=str(out_path), export_format='GLB')
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path

def main():
    print("==================================================")
    print("STARTING PROCEDURAL 3D CITY BUILDINGS GENERATOR")
    print("==================================================")
    build_city_building_01()
    build_city_building_02()
    build_city_building_03()
    build_city_building_04()
    print("All 4 city buildings generated successfully.")

if __name__ == "__main__":
    main()
