"""
Procedural 3D Booth Generator using Sand3D and Blender
Generates 6 distinct, high-quality exhibition pavilions:
- BOOTH 01: Classic Timber Pavilion
- BOOTH 02: European Stone Arcade
- BOOTH 03: Mediterranean Pavilion
- BOOTH 04: Victorian Glass Pavilion
- BOOTH 05: Traditional Courtyard Pavilion
- BOOTH 06: Octagonal Heritage Pavilion

Each booth conforms to:
- Bounding envelope: Width 4.8m - 5.4m, Depth 3.8m - 4.4m, Height 3.5m - 4.6m
- Dedicated dynamic signboard mesh: `CompanySignSurface` (flat, unblocked, facing front)
- Clean hierarchy exported to GLB format
"""

import os
import sys
import math
from pathlib import Path

# Add sand3d-repo to Python path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
SAND3D_SRC = SCRIPT_DIR.parent / "sand3d-repo" / "src"
OUTPUT_DIR = ROOT_DIR / "public" / "models" / "booths"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

if str(SAND3D_SRC) not in sys.path:
    sys.path.insert(0, str(SAND3D_SRC))

import bpy
import sand3d as s3d

def clean_scene():
    """Wipe current blender scene clean."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s3d.empty_scene()
    s3d.units("m")

def make_signboard(name="CompanySignSurface", width=3.6, height=0.65, depth=0.06, pos=(0, -1.9, 3.4), color="#1E293B"):
    """
    Creates the dedicated front signboard mesh with standard name CompanySignSurface.
    Facing front (-Y in Blender, which becomes +Z in GLTF/Three.js).
    """
    sign = s3d.box(name, width, depth, height)
    sign = s3d.at(sign, x=pos[0], y=pos[1], z=pos[2])
    s3d.material(sign, "glossy_plastic", color=color, roughness=0.2)
    return sign

# ============================================================================
# BOOTH 01 — CLASSIC TIMBER PAVILION
# ============================================================================
def build_booth_01():
    print("Building Booth 01: Classic Timber Pavilion...")
    clean_scene()
    parts = []

    # 1. Base plinth & Timber deck
    stone_base = s3d.at(s3d.box("stone_base", 5.2, 4.2, 0.20), z=0)
    s3d.material(stone_base, "concrete", color="#94A3B8", roughness=0.8)
    parts.append(stone_base)

    deck = s3d.at(s3d.box("timber_deck", 5.0, 4.0, 0.06), z=0.20)
    s3d.material(deck, "oak", color="#8B5A2B", roughness=0.5)
    parts.append(deck)

    # Front steps
    steps = s3d.at(s3d.box("front_step", 3.4, 0.8, 0.10), y=-2.2, z=0)
    s3d.material(steps, "concrete", color="#64748B", roughness=0.85)
    parts.append(steps)

    # 2. Six Timber Columns with Stone Plinths
    col_coords = [
        (-2.2, -1.7), (0.0, -1.7), (2.2, -1.7), # Front row
        (-2.2,  1.7), (0.0,  1.7), (2.2,  1.7), # Back row
    ]
    for i, (cx, cy) in enumerate(col_coords):
        # Stone plinth
        plinth = s3d.at(s3d.box(f"plinth_{i}", 0.36, 0.36, 0.35), x=cx, y=cy, z=0.26)
        s3d.material(plinth, "marble", color="#CBD5E1", roughness=0.6)
        parts.append(plinth)

        # Wooden pillar
        pillar = s3d.at(s3d.box(f"pillar_{i}", 0.24, 0.24, 2.65), x=cx, y=cy, z=0.61)
        s3d.material(pillar, "walnut", color="#5C3A21", roughness=0.45)
        parts.append(pillar)

        # Capital collar
        capital = s3d.at(s3d.box(f"capital_{i}", 0.34, 0.34, 0.12), x=cx, y=cy, z=3.26)
        s3d.material(capital, "brass", color="#D97706", roughness=0.3, metallic=0.8)
        parts.append(capital)

    # 3. Heavy Timber Beams / Architraves
    beam_front = s3d.at(s3d.box("beam_front", 4.9, 0.22, 0.26), y=-1.7, z=3.38)
    beam_back = s3d.at(s3d.box("beam_back", 4.9, 0.22, 0.26), y=1.7, z=3.38)
    beam_left = s3d.at(s3d.box("beam_left", 0.22, 3.6, 0.26), x=-2.2, z=3.38)
    beam_right = s3d.at(s3d.box("beam_right", 0.22, 3.6, 0.26), x=2.2, z=3.38)
    for b in [beam_front, beam_back, beam_left, beam_right]:
        s3d.material(b, "walnut", color="#451A03", roughness=0.5)
        parts.append(b)

    # 4. Pitched Wooden Roof with Exposed Rafters
    roof_ridge = s3d.at(s3d.box("roof_ridge", 5.2, 0.20, 0.30), z=4.30)
    s3d.material(roof_ridge, "walnut", color="#3E2723", roughness=0.6)
    parts.append(roof_ridge)

    # Roof slope panels (pitched gable style)
    # Left pitch
    roof_left = s3d.at(s3d.box("roof_slope_left", 5.4, 2.35, 0.08), rx=24, y=0.95, z=3.85)
    s3d.material(roof_left, "pine", color="#374151", roughness=0.7)
    parts.append(roof_left)

    # Right pitch
    roof_right = s3d.at(s3d.box("roof_slope_right", 5.4, 2.35, 0.08), rx=-24, y=-0.95, z=3.85)
    s3d.material(roof_right, "pine", color="#374151", roughness=0.7)
    parts.append(roof_right)

    # 5. Side Balustrades / Railings
    for side, sx in [("left", -2.2), ("right", 2.2)]:
        rail = s3d.at(s3d.box(f"rail_top_{side}", 0.08, 3.2, 0.08), x=sx, z=1.10)
        s3d.material(rail, "oak", color="#78350F", roughness=0.5)
        parts.append(rail)
        rail_bot = s3d.at(s3d.box(f"rail_bot_{side}", 0.08, 3.2, 0.06), x=sx, z=0.35)
        s3d.material(rail_bot, "oak", color="#78350F", roughness=0.5)
        parts.append(rail_bot)
        # Vertical slats
        for j in range(7):
            sy = -1.2 + j * 0.4
            slat = s3d.at(s3d.box(f"slat_{side}_{j}", 0.05, 0.05, 0.69), x=sx, y=sy, z=0.41)
            s3d.material(slat, "oak", color="#92400E", roughness=0.55)
            parts.append(slat)

    # Back wooden screen wall
    back_wall = s3d.at(s3d.box("back_screen", 4.4, 0.06, 2.6), y=1.7, z=0.5)
    s3d.material(back_wall, "pine", color="#B45309", roughness=0.6)
    parts.append(back_wall)

    # 6. Dedicated Signboard: CompanySignSurface
    sign = make_signboard(width=3.8, height=0.65, depth=0.06, pos=(0, -1.82, 3.42), color="#0F172A")
    parts.append(sign)

    root = s3d.assembly("booth_01_classic_timber", *parts)
    out_path = OUTPUT_DIR / "booth_01.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


# ============================================================================
# BOOTH 02 — EUROPEAN STONE ARCADE
# ============================================================================
def build_booth_02():
    print("Building Booth 02: European Stone Arcade...")
    clean_scene()
    parts = []

    # 1. Classical Limestone Plinth & Flight of Steps
    base = s3d.at(s3d.box("stone_plinth", 5.2, 4.2, 0.24), z=0)
    s3d.material(base, "concrete", color="#D1D5DB", roughness=0.85)
    parts.append(base)

    step = s3d.at(s3d.box("front_step", 4.2, 0.8, 0.12), y=-2.2, z=0)
    s3d.material(step, "concrete", color="#9CA3AF", roughness=0.85)
    parts.append(step)

    # Polished floor
    floor = s3d.at(s3d.box("marble_floor", 4.9, 3.9, 0.04), z=0.24)
    s3d.material(floor, "marble", color="#F3F4F6", roughness=0.3)
    parts.append(floor)

    # 2. Tuscan Classical Columns (Round Cylinders with Molded Bases)
    col_positions = [
        (-2.1, -1.6), (-0.7, -1.6), (0.7, -1.6), (2.1, -1.6), # 4 Front Arcade Columns
        (-2.1,  1.6), (2.1,  1.6),                          # Rear Corners
    ]
    for i, (cx, cy) in enumerate(col_positions):
        base_box = s3d.at(s3d.box(f"col_base_{i}", 0.38, 0.38, 0.25), x=cx, y=cy, z=0.28)
        s3d.material(base_box, "concrete", color="#E5E7EB", roughness=0.7)
        parts.append(base_box)

        shaft = s3d.at(s3d.cylinder(f"col_shaft_{i}", 0.28, 2.55), x=cx, y=cy, z=0.53)
        s3d.material(shaft, "marble", color="#E5E7EB", roughness=0.5)
        parts.append(shaft)

        cap = s3d.at(s3d.box(f"col_cap_{i}", 0.38, 0.38, 0.18), x=cx, y=cy, z=3.08)
        s3d.material(cap, "concrete", color="#E5E7EB", roughness=0.7)
        parts.append(cap)

    # 3. Triple Classical Arches across Front Arcade
    arch_spans = [(-1.4, 1.2), (0.0, 1.2), (1.4, 1.2)]
    for idx, (ax, aw) in enumerate(arch_spans):
        # Arch keystone lintel
        arch_lintel = s3d.at(s3d.box(f"arch_lintel_{idx}", aw + 0.1, 0.32, 0.28), x=ax, y=-1.6, z=3.26)
        s3d.material(arch_lintel, "concrete", color="#E5E7EB", roughness=0.7)
        parts.append(arch_lintel)

    # 4. Entablature, Frieze, Cornice, and Attic Parapet
    frieze = s3d.at(s3d.box("frieze", 5.0, 3.8, 0.35), z=3.54)
    s3d.material(frieze, "concrete", color="#D1D5DB", roughness=0.75)
    parts.append(frieze)

    cornice = s3d.at(s3d.box("cornice", 5.2, 4.0, 0.16), z=3.89)
    s3d.material(cornice, "marble", color="#F9FAFB", roughness=0.4)
    parts.append(cornice)

    # Pediment / Attic front feature
    pediment = s3d.at(s3d.box("front_attic", 4.4, 0.30, 0.45), y=-1.85, z=4.05)
    s3d.material(pediment, "concrete", color="#E5E7EB", roughness=0.7)
    parts.append(pediment)

    # Terracotta tile roof cap
    roof_cap = s3d.at(s3d.box("roof_terracotta", 4.8, 3.6, 0.20), z=4.05)
    s3d.material(roof_cap, "ceramic", color="#C2410C", roughness=0.75)
    parts.append(roof_cap)

    # 5. Side Arched Walls & Rear Classical Wall with Niches
    back_wall = s3d.at(s3d.box("rear_masonry", 4.6, 0.25, 2.8), y=1.6, z=0.4)
    s3d.material(back_wall, "concrete", color="#F3F4F6", roughness=0.8)
    parts.append(back_wall)

    for side, sx in [("left", -2.1), ("right", 2.1)]:
        sw = s3d.at(s3d.box(f"side_wall_{side}", 0.22, 3.2, 1.2), x=sx, z=0.3)
        s3d.material(sw, "concrete", color="#E5E7EB", roughness=0.8)
        parts.append(sw)

    # 6. Dedicated Signboard: CompanySignSurface
    sign = make_signboard(width=3.9, height=0.68, depth=0.06, pos=(0, -1.78, 3.42), color="#1E3A8A")
    parts.append(sign)

    root = s3d.assembly("booth_02_european_arcade", *parts)
    out_path = OUTPUT_DIR / "booth_02.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


# ============================================================================
# BOOTH 03 — MEDITERRANEAN PAVILION
# ============================================================================
def build_booth_03():
    print("Building Booth 03: Mediterranean Pavilion...")
    clean_scene()
    parts = []

    # 1. Terracotta Tile Patio Base
    terracotta_base = s3d.at(s3d.box("terracotta_base", 5.2, 4.2, 0.22), z=0)
    s3d.material(terracotta_base, "ceramic", color="#EA580C", roughness=0.75)
    parts.append(terracotta_base)

    step = s3d.at(s3d.box("terracotta_step", 3.6, 0.8, 0.11), y=-2.2, z=0)
    s3d.material(step, "ceramic", color="#C2410C", roughness=0.8)
    parts.append(step)

    # 2. Warm Stucco Walls with Arched Openings
    # Rear solid stucco wall
    back_stucco = s3d.at(s3d.box("back_stucco", 4.8, 0.28, 2.9), y=1.65, z=0.22)
    s3d.material(back_stucco, "concrete", color="#FEF3C7", roughness=0.9)
    parts.append(back_stucco)

    # Side stucco walls with arched portal cuts (represented by split piers)
    for side, sx in [("left", -2.15), ("right", 2.15)]:
        pier_front = s3d.at(s3d.box(f"pier_front_{side}", 0.35, 0.7, 2.9), x=sx, y=-1.4, z=0.22)
        pier_back = s3d.at(s3d.box(f"pier_back_{side}", 0.35, 0.7, 2.9), x=sx, y=1.2, z=0.22)
        low_parapet = s3d.at(s3d.box(f"parapet_{side}", 0.25, 1.9, 0.95), x=sx, y=-0.1, z=0.22)
        top_arch_beam = s3d.at(s3d.box(f"arch_beam_{side}", 0.35, 3.3, 0.35), x=sx, z=2.8)
        for p in [pier_front, pier_back, low_parapet, top_arch_beam]:
            s3d.material(p, "concrete", color="#FEF3C7", roughness=0.9)
            parts.append(p)

    # Front Colonnade Pillars
    col_l = s3d.at(s3d.box("front_pillar_left", 0.40, 0.40, 2.9), x=-1.8, y=-1.65, z=0.22)
    col_r = s3d.at(s3d.box("front_pillar_right", 0.40, 0.40, 2.9), x=1.8, y=-1.65, z=0.22)
    for c in [col_l, col_r]:
        s3d.material(c, "concrete", color="#FEF3C7", roughness=0.9)
        parts.append(c)

    # 3. Heavy Timber Beams & Cantilever Corbels
    beam_front = s3d.at(s3d.box("timber_lintel", 4.9, 0.30, 0.28), y=-1.65, z=3.12)
    s3d.material(beam_front, "walnut", color="#78350F", roughness=0.6)
    parts.append(beam_front)

    # Front entrance arch frame
    entrance_arch = s3d.at(s3d.box("entrance_arch", 3.2, 0.32, 0.22), y=-1.65, z=2.90)
    s3d.material(entrance_arch, "concrete", color="#FEF3C7", roughness=0.85)
    parts.append(entrance_arch)

    # Exposed protruding cedar rafter tails & corbels
    for k in range(9):
        rx = -2.1 + k * 0.525
        rafter = s3d.at(s3d.box(f"rafter_{k}", 0.14, 4.3, 0.16), x=rx, z=3.42)
        s3d.material(rafter, "oak", color="#92400E", roughness=0.55)
        parts.append(rafter)
        # Timber corbel under rafter at front
        corbel = s3d.at(s3d.box(f"corbel_{k}", 0.12, 0.25, 0.20), x=rx, y=-1.75, z=3.22)
        s3d.material(corbel, "oak", color="#78350F", roughness=0.55)
        parts.append(corbel)

    # 4. Spanish Barrel Tile Roof (Curved Terracotta Overhangs)
    roof_main = s3d.at(s3d.box("barrel_tile_roof", 5.3, 4.4, 0.22), z=3.60)
    s3d.material(roof_main, "ceramic", color="#B91C1C", roughness=0.8)
    parts.append(roof_main)

    roof_ridge = s3d.at(s3d.box("med_ridge", 5.4, 0.35, 0.18), z=3.80)
    s3d.material(roof_ridge, "ceramic", color="#991B1B", roughness=0.85)
    parts.append(roof_ridge)

    # Terracotta barrel tiles running along the roof
    for ti in range(8):
        ty = -1.8 + ti * 0.50
        barrel_tile = s3d.at(s3d.cylinder(f"barrel_tile_{ti}", 0.28, 5.2), rx=0, ry=90, y=ty, z=3.75)
        s3d.material(barrel_tile, "ceramic", color="#C2410C", roughness=0.75)
        parts.append(barrel_tile)

    # Interior terracotta counter display
    counter = s3d.at(s3d.box("med_counter", 2.8, 0.7, 0.9), y=0.5, z=0.22)
    s3d.material(counter, "concrete", color="#FEF3C7", roughness=0.8)
    parts.append(counter)
    counter_top = s3d.at(s3d.box("med_counter_top", 3.0, 0.8, 0.08), y=0.5, z=1.12)
    s3d.material(counter_top, "oak", color="#92400E", roughness=0.45)
    parts.append(counter_top)

    # 5. Wrought Iron Planter Rails & Lanterns
    for side, sx in [("left", -2.15), ("right", 2.15)]:
        planter = s3d.at(s3d.box(f"planter_{side}", 0.30, 1.8, 0.35), x=sx, y=-0.1, z=1.2)
        s3d.material(planter, "ceramic", color="#C2410C", roughness=0.7)
        parts.append(planter)
        plants = s3d.at(s3d.box(f"plants_{side}", 0.26, 1.7, 0.15), x=sx, y=-0.1, z=1.55)
        s3d.material(plants, "fabric", color="#15803D", roughness=0.9)
        parts.append(plants)

    # 6. Dedicated Signboard: CompanySignSurface
    sign = make_signboard(width=3.7, height=0.65, depth=0.06, pos=(0, -1.82, 3.32), color="#431407")
    parts.append(sign)

    root = s3d.assembly("booth_03_mediterranean", *parts)
    out_path = OUTPUT_DIR / "booth_03.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


# ============================================================================
# BOOTH 04 — VICTORIAN GLASS PAVILION
# ============================================================================
def build_booth_04():
    print("Building Booth 04: Victorian Glass Pavilion...")
    clean_scene()
    parts = []

    # 1. Dark Foundation Plinth & Polished Chequered Floor
    base = s3d.at(s3d.box("brick_plinth", 5.2, 4.2, 0.22), z=0)
    s3d.material(base, "concrete", color="#334155", roughness=0.8)
    parts.append(base)

    step = s3d.at(s3d.box("cast_iron_step", 3.6, 0.8, 0.11), y=-2.2, z=0)
    s3d.material(step, "painted_metal", color="#1E293B", roughness=0.6)
    parts.append(step)

    floor = s3d.at(s3d.box("chequered_floor", 4.9, 3.9, 0.04), z=0.22)
    s3d.material(floor, "marble", color="#F8FAFC", roughness=0.2)
    parts.append(floor)

    # 2. Ornate Cast-Iron Slender Columns & Wainscot Wall
    # Low perimeter wainscot wall (height 0.65m)
    wainscot_back = s3d.at(s3d.box("wainscot_back", 4.8, 0.12, 0.65), y=1.75, z=0.26)
    wainscot_l = s3d.at(s3d.box("wainscot_l", 0.12, 3.5, 0.65), x=-2.2, z=0.26)
    wainscot_r = s3d.at(s3d.box("wainscot_r", 0.12, 3.5, 0.65), x=2.2, z=0.26)
    for w in [wainscot_back, wainscot_l, wainscot_r]:
        s3d.material(w, "painted_metal", color="#1E293B", roughness=0.5)
        parts.append(w)

    # Cast Iron Columns
    col_pos = [
        (-2.2, -1.7), (-0.8, -1.7), (0.8, -1.7), (2.2, -1.7), # Front
        (-2.2,  1.7), (-0.8,  1.7), (0.8,  1.7), (2.2,  1.7), # Rear
    ]
    for i, (cx, cy) in enumerate(col_pos):
        col = s3d.at(s3d.cylinder(f"iron_col_{i}", 0.14, 2.85), x=cx, y=cy, z=0.26)
        s3d.material(col, "painted_metal", color="#0F172A", roughness=0.3, metallic=0.7)
        parts.append(col)

        collar = s3d.at(s3d.box(f"brass_collar_{i}", 0.22, 0.22, 0.12), x=cx, y=cy, z=2.95)
        s3d.material(collar, "brass", color="#F59E0B", roughness=0.2, metallic=0.9)
        parts.append(collar)

    # 3. Wrought Iron Ribs & Fascia
    fascia_front = s3d.at(s3d.box("iron_fascia_f", 4.9, 0.12, 0.25), y=-1.7, z=3.10)
    fascia_back = s3d.at(s3d.box("iron_fascia_b", 4.9, 0.12, 0.25), y=1.7, z=3.10)
    fascia_l = s3d.at(s3d.box("iron_fascia_l", 0.12, 3.6, 0.25), x=-2.2, z=3.10)
    fascia_r = s3d.at(s3d.box("iron_fascia_r", 0.12, 3.6, 0.25), x=2.2, z=3.10)
    for f in [fascia_front, fascia_back, fascia_l, fascia_r]:
        s3d.material(f, "painted_metal", color="#0F172A", roughness=0.4, metallic=0.6)
        parts.append(f)

    # 4. Translucent Glass Barrel / Greenhouse Roof with Iron Mullions
    # Glass roof panels
    glass_roof_l = s3d.at(s3d.box("glass_roof_left", 5.0, 2.1, 0.04), rx=18, y=0.85, z=3.55)
    glass_roof_r = s3d.at(s3d.box("glass_roof_right", 5.0, 2.1, 0.04), rx=-18, y=-0.85, z=3.55)
    for gr in [glass_roof_l, glass_roof_r]:
        s3d.material(gr, "glass", color="#BAE6FD", roughness=0.08, opacity=0.45)
        parts.append(gr)

    # Glass clerestory lantern at apex
    clerestory = s3d.at(s3d.box("clerestory_lantern", 4.6, 0.9, 0.45), z=4.0)
    s3d.material(clerestory, "glass", color="#E0F2FE", roughness=0.05, opacity=0.5)
    parts.append(clerestory)

    lantern_cap = s3d.at(s3d.box("lantern_cap", 4.8, 1.0, 0.08), z=4.45)
    s3d.material(lantern_cap, "painted_metal", color="#0F172A", roughness=0.4, metallic=0.7)
    parts.append(lantern_cap)

    # Translucent glass side panels
    glass_side_l = s3d.at(s3d.box("glass_side_l", 0.04, 3.2, 2.0), x=-2.2, z=0.95)
    glass_side_r = s3d.at(s3d.box("glass_side_r", 0.04, 3.2, 2.0), x=2.2, z=0.95)
    for gs in [glass_side_l, glass_side_r]:
        s3d.material(gs, "glass", color="#E0F2FE", roughness=0.1, opacity=0.4)
        parts.append(gs)

    # 5. Dedicated Signboard: CompanySignSurface
    sign = make_signboard(width=3.7, height=0.65, depth=0.06, pos=(0, -1.78, 3.22), color="#0284C7")
    parts.append(sign)

    root = s3d.assembly("booth_04_victorian_glass", *parts)
    out_path = OUTPUT_DIR / "booth_04.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


# ============================================================================
# BOOTH 05 — TRADITIONAL COURTYARD PAVILION (ASIAN HERITAGE)
# ============================================================================
def build_booth_05():
    print("Building Booth 05: Traditional Courtyard Pavilion...")
    clean_scene()
    parts = []

    # 1. Raised Stone Platform & Granite Steps
    granite_base = s3d.at(s3d.box("granite_platform", 5.2, 4.2, 0.25), z=0)
    s3d.material(granite_base, "concrete", color="#4B5563", roughness=0.85)
    parts.append(granite_base)

    step = s3d.at(s3d.box("granite_step", 3.6, 0.8, 0.12), y=-2.2, z=0)
    s3d.material(step, "concrete", color="#374151", roughness=0.9)
    parts.append(step)

    floor_tiles = s3d.at(s3d.box("courtyard_tiles", 4.9, 3.9, 0.04), z=0.25)
    s3d.material(floor_tiles, "ceramic", color="#1F2937", roughness=0.6)
    parts.append(floor_tiles)

    # 2. Lacquered Vermilion Pillars & Carved Balustrades
    col_pos = [
        (-2.1, -1.6), (0.0, -1.6), (2.1, -1.6), # Front
        (-2.1,  1.6), (0.0,  1.6), (2.1,  1.6), # Back
    ]
    for i, (cx, cy) in enumerate(col_pos):
        # Bronze column base
        base_ring = s3d.at(s3d.box(f"col_base_{i}", 0.36, 0.36, 0.15), x=cx, y=cy, z=0.29)
        s3d.material(base_ring, "brass", color="#B45309", roughness=0.3, metallic=0.8)
        parts.append(base_ring)

        # Vermilion lacquered pillar
        pillar = s3d.at(s3d.cylinder(f"vermilion_pillar_{i}", 0.26, 2.65), x=cx, y=cy, z=0.44)
        s3d.material(pillar, "glossy_plastic", color="#991B1B", roughness=0.3)
        parts.append(pillar)

    # Dougong Bracket Clusters (stepped wooden brackets under eaves)
    for i, (cx, cy) in enumerate(col_pos):
        bracket_layer1 = s3d.at(s3d.box(f"dougong1_{i}", 0.45, 0.45, 0.12), x=cx, y=cy, z=3.09)
        bracket_layer2 = s3d.at(s3d.box(f"dougong2_{i}", 0.60, 0.60, 0.12), x=cx, y=cy, z=3.21)
        for b in [bracket_layer1, bracket_layer2]:
            s3d.material(b, "oak", color="#B45309", roughness=0.45)
            parts.append(b)

    # 3. Interlocking Beams & Geometric Wood Lattice (Ice-ray Lattice Screens)
    beam_f = s3d.at(s3d.box("tie_beam_f", 4.8, 0.22, 0.22), y=-1.6, z=3.33)
    beam_b = s3d.at(s3d.box("tie_beam_b", 4.8, 0.22, 0.22), y=1.6, z=3.33)
    beam_l = s3d.at(s3d.box("tie_beam_l", 0.22, 3.4, 0.22), x=-2.1, z=3.33)
    beam_r = s3d.at(s3d.box("tie_beam_r", 0.22, 3.4, 0.22), x=2.1, z=3.33)
    for bm in [beam_f, beam_b, beam_l, beam_r]:
        s3d.material(bm, "walnut", color="#78350F", roughness=0.4)
        parts.append(bm)

    # Carved lattice screens on sides and back
    back_screen = s3d.at(s3d.box("asian_back_screen", 4.4, 0.08, 2.4), y=1.6, z=0.4)
    s3d.material(back_screen, "walnut", color="#78350F", roughness=0.5)
    parts.append(back_screen)

    for side, sx in [("left", -2.1), ("right", 2.1)]:
        side_screen = s3d.at(s3d.box(f"asian_side_screen_{side}", 0.08, 3.0, 1.2), x=sx, z=0.35)
        s3d.material(side_screen, "oak", color="#9A3412", roughness=0.5)
        parts.append(side_screen)

    # 4. Flared Tiered Pagoda Eaves (Gentle Upturned Roof Silhouette)
    # Tier 1 lower eaves (wide overhang)
    eaves_tier1 = s3d.at(s3d.box("eaves_tier1", 5.6, 4.6, 0.18), z=3.55)
    s3d.material(eaves_tier1, "ceramic", color="#111827", roughness=0.6)
    parts.append(eaves_tier1)

    # Upturned corner flares
    corner_flare_fl = s3d.at(s3d.box("corner_flare_fl", 0.45, 0.45, 0.15), rx=15, ry=-15, x=-2.7, y=-2.2, z=3.68)
    corner_flare_fr = s3d.at(s3d.box("corner_flare_fr", 0.45, 0.45, 0.15), rx=15, ry=15, x=2.7, y=-2.2, z=3.68)
    for cf in [corner_flare_fl, corner_flare_fr]:
        s3d.material(cf, "brass", color="#F59E0B", roughness=0.3, metallic=0.7)
        parts.append(cf)

    # Tier 2 upper roof ridge
    eaves_tier2 = s3d.at(s3d.box("eaves_tier2", 4.8, 3.8, 0.25), z=3.85)
    s3d.material(eaves_tier2, "ceramic", color="#111827", roughness=0.6)
    parts.append(eaves_tier2)

    ridge_top = s3d.at(s3d.box("roof_ridge_ornament", 4.4, 0.28, 0.35), z=4.20)
    s3d.material(ridge_top, "ceramic", color="#DC2626", roughness=0.5)
    parts.append(ridge_top)

    # 5. Dedicated Signboard: CompanySignSurface (Traditional Bian'e Plaque)
    sign = make_signboard(width=3.7, height=0.68, depth=0.06, pos=(0, -1.75, 3.32), color="#7F1D1D")
    parts.append(sign)

    root = s3d.assembly("booth_05_traditional_courtyard", *parts)
    out_path = OUTPUT_DIR / "booth_05.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


# ============================================================================
# BOOTH 06 — OCTAGONAL HERITAGE PAVILION (GAZEBO / ROTUNDA)
# ============================================================================
def build_booth_06():
    print("Building Booth 06: Octagonal Heritage Pavilion...")
    clean_scene()
    parts = []

    # 1. Stepped Octagonal Stone Base Plinth
    # Lower concentric base
    base_lower = s3d.at(s3d.cylinder("oct_base_lower", 5.4, 0.15), z=0)
    s3d.material(base_lower, "concrete", color="#94A3B8", roughness=0.85)
    parts.append(base_lower)

    # Upper stepped base
    base_upper = s3d.at(s3d.cylinder("oct_base_upper", 5.0, 0.15), z=0.15)
    s3d.material(base_upper, "concrete", color="#CBD5E1", roughness=0.8)
    parts.append(base_upper)

    # Front entrance steps
    step = s3d.at(s3d.box("oct_front_step", 3.4, 0.8, 0.10), y=-2.3, z=0)
    s3d.material(step, "concrete", color="#64748B", roughness=0.85)
    parts.append(step)

    # 2. Eight Perimeter Columns in Octagon Arrangement
    radius = 2.2
    oct_coords = []
    for k in range(8):
        angle = k * (2 * math.pi / 8) + (math.pi / 8) # Offset so front opening is clean
        ox = radius * math.cos(angle)
        oy = radius * math.sin(angle)
        oct_coords.append((ox, oy))

    for i, (ox, oy) in enumerate(oct_coords):
        # Column base plinth
        plinth = s3d.at(s3d.box(f"oct_plinth_{i}", 0.32, 0.32, 0.20), x=ox, y=oy, z=0.30)
        s3d.material(plinth, "concrete", color="#E2E8F0", roughness=0.7)
        parts.append(plinth)

        # Fluted composite column
        col = s3d.at(s3d.cylinder(f"oct_col_{i}", 0.22, 2.65), x=ox, y=oy, z=0.50)
        s3d.material(col, "marble", color="#F1F5F9", roughness=0.4)
        parts.append(col)

        # Bronze capital collar
        cap = s3d.at(s3d.box(f"oct_cap_{i}", 0.32, 0.32, 0.14), x=ox, y=oy, z=3.15)
        s3d.material(cap, "brass", color="#D97706", roughness=0.25, metallic=0.85)
        parts.append(cap)

    # 3. Perimeter Entablature Ring & Low Ornamental Balustrades
    entablature_ring = s3d.at(s3d.cylinder("oct_entablature", 4.9, 0.28), z=3.29)
    s3d.material(entablature_ring, "concrete", color="#E2E8F0", roughness=0.6)
    parts.append(entablature_ring)

    # Low perimeter balustrade (except wide front opening)
    for i in range(1, 7):
        # Span between column i and column (i+1)
        p1 = oct_coords[i]
        p2 = oct_coords[(i + 1) % 8]
        mx = (p1[0] + p2[0]) / 2
        my = (p1[1] + p2[1]) / 2
        bal = s3d.at(s3d.box(f"oct_bal_{i}", 0.12, 1.4, 0.75), x=mx, y=my, z=0.35)
        s3d.material(bal, "oak", color="#78350F", roughness=0.6)
        parts.append(bal)

    # 4. Faceted Conical Roof with Weathered Verdigris Copper Patina
    roof_cone = s3d.at(s3d.cylinder("oct_roof_eaves", 5.6, 0.20), z=3.57)
    s3d.material(roof_cone, "copper", color="#0D9488", roughness=0.45, metallic=0.6)
    parts.append(roof_cone)

    roof_cone_upper = s3d.at(s3d.cylinder("oct_roof_cone", 4.6, 0.45), z=3.77)
    s3d.material(roof_cone_upper, "copper", color="#0F766E", roughness=0.45, metallic=0.6)
    parts.append(roof_cone_upper)

    roof_apex = s3d.at(s3d.cylinder("oct_roof_apex", 2.6, 0.45), z=4.22)
    s3d.material(roof_apex, "copper", color="#115E59", roughness=0.45, metallic=0.6)
    parts.append(roof_apex)

    # Ornate Turned Pinnacle Finial
    finial = s3d.at(s3d.cylinder("oct_finial_spire", 0.16, 0.65), z=4.67)
    s3d.material(finial, "brass", color="#F59E0B", roughness=0.2, metallic=0.9)
    parts.append(finial)

    # 5. Dedicated Signboard: CompanySignSurface (Front Arch Header)
    sign = make_signboard(width=3.6, height=0.65, depth=0.06, pos=(0, -1.88, 3.32), color="#065F46")
    parts.append(sign)

    root = s3d.assembly("booth_06_octagonal_heritage", *parts)
    out_path = OUTPUT_DIR / "booth_06.glb"
    s3d.export(root, out_path)
    print(f"Exported: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return out_path


def main():
    print("==================================================")
    print("STARTING PROCEDURAL 3D BOOTH GENERATOR (SAND3D)")
    print("==================================================")
    build_booth_01()
    build_booth_02()
    build_booth_03()
    build_booth_04()
    build_booth_05()
    build_booth_06()
    print("All 6 booths generated successfully.")

if __name__ == "__main__":
    main()
