"""
V27.3 Phase 1 — Six Truly Unique Premium Booth Interiors & Exteriors (Blender 4.2.16 LTS)
Outputs to FE/public/models/booths/v27_3/ WITHOUT touching or overwriting V4 GLBs!

Each booth features a genuinely distinct interior floor plan, custom furniture, consultation seating,
shelving, staggered pedestals, architectural lighting, and universal multi-industry neutrality.
All meshes are joined by material before export (7-9 draw calls per booth) to preserve 55-60 FPS.
"""

import json
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
V4_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "v4"))
if V4_DIR not in sys.path:
    sys.path.insert(0, V4_DIR)

from v4_common import (
    reset_scene,
    ensure_collection,
    make_pbr_mat,
    add_box,
    add_cylinder,
    add_hollow_ring,
    add_rounded_rect_prism,
    add_extruded_arch_frame,
    add_wave_wall,
    add_standard_deck,
    add_universal_showcase_backing,
    optimize_and_join_by_material,
    export_booth_glb,
)

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v27_3")
MANIFEST_OUT = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v27_3_booths_manifest.json"


# ============================================================================
# Reusable Architectural Interior Furniture Helpers (High-End Stylized Realism)
# ============================================================================

def add_modern_chair(col, prefix, cx, cy, z0, rot_z, mat_seat, mat_frame):
    """Beveled modern exhibition consultation chair scaled for 1.70m avatar (seat H=0.45m)."""
    ca, sa = math.cos(rot_z), math.sin(rot_z)
    def loc(lx, ly, lz):
        return (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, z0 + lz)

    # 4 tapered metal legs
    for i, (lx, ly) in enumerate(((-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18))):
        add_cylinder(col, f"{prefix}_Leg{i}", 0.018, 0.43, loc(lx, ly, 0.215), mat_frame, segments=10, bevel_width=0.002)
    # Rounded upholstered seat cushion
    add_rounded_rect_prism(col, f"{prefix}_Seat", 0.46, 0.44, 0.065, 0.10, loc(0, 0, 0.45), mat_seat, corner_segments=5, bevel_top_bottom=0.012, rot_euler=(0, 0, rot_z))
    # Curved wrap backrest
    add_rounded_rect_prism(col, f"{prefix}_Back", 0.44, 0.06, 0.34, 0.025, loc(0, 0.20, 0.65), mat_seat, corner_segments=4, bevel_top_bottom=0.012, rot_euler=(0.08, 0, rot_z))
    # Backrest support struts
    for s, lx in (("L", -0.15), ("R", 0.15)):
        add_cylinder(col, f"{prefix}_Strut{s}", 0.014, 0.24, loc(lx, 0.19, 0.54), mat_frame, segments=8, bevel_width=0.002)


def add_bar_stool(col, prefix, cx, cy, z0, mat_seat, mat_frame):
    """Sleek counter/demo bar stool (seat H=0.66m) with footrest ring."""
    add_cylinder(col, f"{prefix}_Base", 0.19, 0.025, (cx, cy, z0 + 0.0125), mat_frame, segments=18, bevel_width=0.004)
    add_cylinder(col, f"{prefix}_Stem", 0.028, 0.62, (cx, cy, z0 + 0.33), mat_frame, segments=14, bevel_width=0.002)
    add_hollow_ring(col, f"{prefix}_FootRing", 0.16, 0.135, 0.018, (cx, cy, z0 + 0.24), mat_frame, segments=20, bevel_width=0.002)
    add_cylinder(col, f"{prefix}_Seat", 0.19, 0.055, (cx, cy, z0 + 0.655), mat_seat, segments=20, bevel_width=0.014)


def add_round_table(col, prefix, cx, cy, z0, radius, height, mat_top, mat_base):
    add_cylinder(col, f"{prefix}_Base", radius * 0.56, 0.035, (cx, cy, z0 + 0.0175), mat_base, segments=20, bevel_width=0.006)
    add_cylinder(col, f"{prefix}_Stem", 0.045, height - 0.07, (cx, cy, z0 + 0.035 + (height - 0.07) * 0.5), mat_base, segments=16, bevel_width=0.004)
    add_cylinder(col, f"{prefix}_Top", radius, 0.04, (cx, cy, z0 + height - 0.02), mat_top, segments=24, bevel_width=0.01)


def add_freestanding_kiosk(col, prefix, cx, cy, z0, rot_z, mat_body, mat_trim, mat_screen, mat_led):
    """Modern vertical digital signage / interactive showcase totem (H=2.10m)."""
    ca, sa = math.cos(rot_z), math.sin(rot_z)
    def loc(lx, ly, lz):
        return (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, z0 + lz)

    add_rounded_rect_prism(col, f"{prefix}_Base", 0.68, 0.42, 0.08, 0.06, loc(0, 0, 0.04), mat_trim, corner_segments=4, bevel_top_bottom=0.008, rot_euler=(0, 0, rot_z))
    add_rounded_rect_prism(col, f"{prefix}_Body", 0.56, 0.14, 1.96, 0.04, loc(0, 0, 1.06), mat_body, corner_segments=4, bevel_top_bottom=0.01, rot_euler=(0, 0, rot_z))
    add_box(col, f"{prefix}_Screen", (0.46, 0.02, 1.18), loc(0, -0.072, 1.32), mat_screen, bevel_width=0.004, rot_euler=(0, 0, rot_z))
    add_box(col, f"{prefix}_LED", (0.48, 0.025, 0.018), loc(0, -0.072, 1.94), mat_led, bevel_width=0.0, rot_euler=(0, 0, rot_z))


def add_track_spotlight(col, prefix, cx, cy, z, mat_housing, mat_led):
    add_cylinder(col, f"{prefix}_Can", 0.048, 0.14, (cx, cy, z), mat_housing, segments=14, bevel_width=0.006, rot_euler=(math.radians(28), 0, 0))
    add_cylinder(col, f"{prefix}_Lens", 0.036, 0.015, (cx, cy + 0.03, z - 0.065), mat_led, segments=12, bevel_width=0.0, rot_euler=(math.radians(28), 0, 0))


# ============================================================================
# BOOTH 01 — SIGNATURE RING (Luxury Showroom)
# ============================================================================
def build_v27_3_booth_01():
    reset_scene()
    col = ensure_collection("V273_Booth01_SignatureRing")

    mat_cream = make_pbr_mat("Cream_Matte_Panel", (0.95, 0.93, 0.88, 1.0), metallic=0.0, roughness=0.40)
    mat_stone = make_pbr_mat("Warm_Ivory_Stone", (0.90, 0.87, 0.81, 1.0), metallic=0.0, roughness=0.28, coat_weight=0.22)
    mat_oak = make_pbr_mat("Light_Luxury_Oak", (0.76, 0.63, 0.47, 1.0), metallic=0.0, roughness=0.46)
    mat_recess = make_pbr_mat("Warm_Taupe_Recess", (0.22, 0.20, 0.18, 1.0), metallic=0.0, roughness=0.56)
    mat_champagne = make_pbr_mat("Champagne_Gold_Metal", (0.83, 0.71, 0.50, 1.0), metallic=0.88, roughness=0.22)
    mat_bronze = make_pbr_mat("Dark_Bronze_Plinth", (0.16, 0.14, 0.13, 1.0), metallic=0.45, roughness=0.40)
    mat_glass = make_pbr_mat("Clear_Tempered_Glass", (0.88, 0.93, 0.96, 1.0), metallic=0.05, roughness=0.08, alpha=0.42)
    mat_led = make_pbr_mat("Warm_White_LED", (1.0, 0.96, 0.88, 1.0), emission_color=(1.0, 0.94, 0.80, 1.0), emission_strength=2.6)

    # 1. Luxury Travertine Deck + Oak Lounge Rug Inlay
    add_standard_deck(col, mat_stone, mat_bronze, mat_champagne, mat_led, width=7.16, depth=5.16, corner_radius=0.28)
    add_rounded_rect_prism(col, "Lounge_Wood_Inlay", 2.40, 2.10, 0.012, 0.22, (+2.05, +0.45, 0.146), mat_oak, corner_segments=6, bevel_top_bottom=0.002)

    # 2. Universal Rear Showcase Backing + Circular Luxury Halo Accent on Rear Wall
    add_universal_showcase_backing(col, mat_cream, mat_recess, mat_champagne, mat_led, recess_y=1.96)
    add_box(col, "Rear_Wall_Plinth", (7.00, 0.34, 0.14), (0.0, 2.24, 0.21), mat_bronze, bevel_width=0.01)
    add_box(col, "Rear_Wall_Main", (6.96, 0.28, 3.12), (0.0, 2.26, 1.84), mat_cream, bevel_width=0.02)
    add_box(col, "Rear_Wall_Crown", (7.08, 0.36, 0.10), (0.0, 2.24, 3.44), mat_champagne, bevel_width=0.012)

    # 3. Curved Arched Wall Shelving Alcove (Left) + Illuminated Display Niche (Right)
    for side, sx in (("L", -2.82), ("R", +2.82)):
        add_box(col, f"Niche_{side}_Back", (1.02, 0.08, 2.38), (sx, 2.02, 1.78), mat_recess, bevel_width=0.008)
        add_extruded_arch_frame(col, f"Niche_{side}_Arch", 1.24, 2.78, 0.98, 2.50, 0.36, (sx, 1.92, 0.42), mat_cream, arch_segments=16, bevel_width=0.012)
        add_box(col, f"Niche_{side}_Base", (1.22, 0.42, 0.36), (sx, 1.92, 0.32), mat_oak, bevel_width=0.014)
        for idx, sz in enumerate((1.05, 1.65, 2.25)):
            add_box(col, f"Niche_{side}_Shelf_{idx}", (0.94, 0.30, 0.025), (sx, 1.88, sz), mat_glass, bevel_width=0.003)
            add_box(col, f"Niche_{side}_Trim_{idx}", (0.94, 0.025, 0.028), (sx, 1.73, sz), mat_champagne, bevel_width=0.003)
            add_box(col, f"Niche_{side}_LED_{idx}", (0.84, 0.02, 0.015), (sx, 1.96, sz - 0.018), mat_led, bevel_width=0.0)

    # 4. Signature Overhead Halo Ring + 4 Outer Corner Champagne Columns
    ring_y, ring_z = 0.22, 4.04
    add_hollow_ring(col, "Ring_Outer", 1.96, 1.68, 0.44, (0.0, ring_y, ring_z), mat_cream, segments=48, bevel_width=0.016)
    add_hollow_ring(col, "Ring_GoldTop", 1.99, 1.66, 0.045, (0.0, ring_y, ring_z + 0.225), mat_champagne, segments=48, bevel_width=0.006)
    add_hollow_ring(col, "Ring_GoldBot", 1.99, 1.66, 0.045, (0.0, ring_y, ring_z - 0.225), mat_champagne, segments=48, bevel_width=0.006)
    add_hollow_ring(col, "Ring_LED", 1.685, 1.655, 0.055, (0.0, ring_y, ring_z - 0.14), mat_led, segments=48, bevel_width=0.0)

    for idx, (cx, cy) in enumerate(((-3.05, -2.05), (+3.05, -2.05), (-3.42, +2.02), (+3.42, +2.02))):
        add_cylinder(col, f"Col_Base_{idx}", 0.14, 0.18, (cx, cy, 0.23), mat_bronze, segments=20, bevel_width=0.01)
        add_cylinder(col, f"Col_Shaft_{idx}", 0.085, 3.32, (cx, cy, 1.98), mat_champagne, segments=20, bevel_width=0.008)
        add_cylinder(col, f"Col_Cap_{idx}", 0.13, 0.12, (cx, cy, 3.64), mat_bronze, segments=20, bevel_width=0.008)

    add_box(col, "Beam_L", (0.14, 4.14, 0.14), (-3.05, -0.02, 3.74), mat_champagne, bevel_width=0.01)
    add_box(col, "Beam_R", (0.14, 4.14, 0.14), (+3.05, -0.02, 3.74), mat_champagne, bevel_width=0.01)
    add_box(col, "Beam_Center", (6.20, 0.14, 0.12), (0.0, ring_y, 3.78), mat_bronze, bevel_width=0.01)
    add_box(col, "Beam_Rear", (6.92, 0.16, 0.14), (0.0, 2.02, 3.74), mat_champagne, bevel_width=0.01)

    add_box(col, "Header_Body", (6.24, 0.26, 0.72), (0.0, -2.08, 3.42), mat_cream, bevel_width=0.018)
    add_box(col, "Header_Top", (6.30, 0.30, 0.05), (0.0, -2.08, 3.80), mat_champagne, bevel_width=0.008)
    add_box(col, "Header_Bot", (6.30, 0.30, 0.045), (0.0, -2.08, 3.04), mat_champagne, bevel_width=0.008)

    # 5. Curved Luxury Reception Counter (Front-Left, oak flutes + ivory marble top + bronze kickplate)
    cx, cy = -1.52, -0.92
    add_rounded_rect_prism(col, "Counter_Kick", 1.88, 0.58, 0.10, 0.28, (cx, cy, 0.19), mat_bronze, corner_segments=8, bevel_top_bottom=0.005)
    add_rounded_rect_prism(col, "Counter_Body", 2.02, 0.68, 0.74, 0.33, (cx, cy, 0.61), mat_cream, corner_segments=10, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, "Counter_Top", 2.10, 0.76, 0.055, 0.36, (cx, cy, 1.005), mat_stone, corner_segments=10, bevel_top_bottom=0.01)
    add_rounded_rect_prism(col, "Counter_GoldBelt", 2.04, 0.70, 0.03, 0.34, (cx, cy, 0.94), mat_champagne, corner_segments=10, bevel_top_bottom=0.004)
    for fx in (-0.66, -0.44, -0.22, 0.0, 0.22, 0.44, 0.66):
        add_box(col, f"Counter_Flute_{fx:.2f}", (0.03, 0.03, 0.66), (cx + fx, cy - 0.345, 0.59), mat_oak, bevel_width=0.005)
    add_box(col, "Counter_LED", (1.42, 0.025, 0.018), (cx, cy - 0.335, 0.965), mat_led, bevel_width=0.0)

    # 6. Trio of Staggered Cylindrical Luxury Pedestals (3 heights: 0.68m, 0.90m, 1.08m)
    for pname, px, py, pr, ph in [
        ("Ped_HeroMid", +0.58, -0.68, 0.34, 0.90),
        ("Ped_LowFront", +1.36, -0.92, 0.26, 0.68),
        ("Ped_TallLeft", -2.72, +0.28, 0.28, 1.08),
    ]:
        add_cylinder(col, f"{pname}_Base", pr + 0.02, 0.07, (px, py, 0.175), mat_bronze, segments=22, bevel_width=0.008)
        add_cylinder(col, f"{pname}_Body", pr, ph - 0.11, (px, py, 0.21 + (ph - 0.11) * 0.5), mat_cream, segments=22, bevel_width=0.01)
        add_cylinder(col, f"{pname}_Ring", pr + 0.015, 0.025, (px, py, 0.14 + ph - 0.05), mat_champagne, segments=22, bevel_width=0.004)
        add_cylinder(col, f"{pname}_Top", pr + 0.012, 0.04, (px, py, 0.14 + ph - 0.01), mat_stone, segments=22, bevel_width=0.008)

    # 7. VIP Consultation Table + 2 Luxury Upholstered Chairs (Rear-Right Lounge, clear of NPC!)
    add_round_table(col, "VIP_Table", +2.15, +0.62, 0.14, 0.42, 0.72, mat_stone, mat_champagne)
    add_modern_chair(col, "VIP_Chair_A", +1.52, +0.62, 0.14, -math.pi * 0.5, mat_cream, mat_champagne)
    add_modern_chair(col, "VIP_Chair_B", +2.78, +0.62, 0.14, +math.pi * 0.5, mat_cream, mat_champagne)

    # Overhead warm gallery spotlights on ring cross-beam
    for sx in (-1.4, 0.0, 1.4):
        add_track_spotlight(col, f"Spot_{sx:.1f}", sx, -0.65, 3.68, mat_bronze, mat_led)

    optimize_and_join_by_material(col, "V273_Booth01_SignatureRing")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_01_signature_ring_v27_3.glb"))


# ============================================================================
# BOOTH 02 — ORGANIC FLOW (Creative Gallery)
# ============================================================================
def build_v27_3_booth_02():
    reset_scene()
    col = ensure_collection("V273_Booth02_OrganicFlow")

    mat_white = make_pbr_mat("Organic_Pearl_White", (0.96, 0.96, 0.97, 1.0), metallic=0.0, roughness=0.36)
    mat_pink = make_pbr_mat("Organic_Pastel_Pink", (0.93, 0.72, 0.78, 1.0), metallic=0.0, roughness=0.40)
    mat_blue = make_pbr_mat("Organic_Soft_Blue", (0.70, 0.84, 0.93, 1.0), metallic=0.0, roughness=0.38)
    mat_warm = make_pbr_mat("Organic_Warm_Neutral", (0.91, 0.89, 0.86, 1.0), metallic=0.0, roughness=0.42)
    mat_recess = make_pbr_mat("Organic_Slate_Recess", (0.20, 0.23, 0.28, 1.0), metallic=0.0, roughness=0.55)
    mat_silver = make_pbr_mat("Organic_Satin_Silver", (0.80, 0.83, 0.86, 1.0), metallic=0.85, roughness=0.25)
    mat_led = make_pbr_mat("Organic_Soft_LED", (1.0, 0.95, 0.98, 1.0), emission_color=(1.0, 0.90, 0.96, 1.0), emission_strength=2.5)

    # 1. Softly Rounded Pearl Deck
    add_standard_deck(col, mat_warm, mat_recess, mat_silver, mat_led, width=7.16, depth=5.16, corner_radius=0.55)

    # 2. Universal Rear Showcase Backing + Sweeping Asymmetrical Curved Partition Wall
    add_universal_showcase_backing(col, mat_white, mat_recess, mat_silver, mat_led, recess_y=1.96)
    add_rounded_rect_prism(col, "Rear_Organic_Wall", 6.96, 0.30, 3.22, 0.14, (0.0, 2.26, 1.75), mat_white, corner_segments=6, bevel_top_bottom=0.02)
    add_rounded_rect_prism(col, "Rear_Wing_Pink_L", 1.38, 0.38, 3.36, 0.18, (-2.84, 2.08, 1.82), mat_pink, corner_segments=8, bevel_top_bottom=0.02)
    add_rounded_rect_prism(col, "Rear_Wing_Blue_R", 1.38, 0.38, 3.36, 0.18, (+2.84, 2.08, 1.82), mat_blue, corner_segments=8, bevel_top_bottom=0.02)

    # Curved Organic Gallery Partition Arc on Left-Mid (gives genuine depth & gallery flow!)
    add_hollow_ring(col, "Gallery_Curve_Partition", 1.55, 1.38, 2.15, (-2.55, +0.25, 1.21), mat_white, segments=22, arc_start=math.radians(110), arc_end=math.radians(220), bevel_width=0.015)
    add_hollow_ring(col, "Gallery_Curve_LED", 1.39, 1.37, 0.04, (-2.55, +0.25, 2.22), mat_led, segments=20, arc_start=math.radians(115), arc_end=math.radians(215), bevel_width=0.0)

    # 3. Recessed Arched Organic Wall Niches
    for side, sx, accent in (("L", -2.84, mat_blue), ("R", +2.84, mat_pink)):
        add_box(col, f"Niche_{side}_Back", (0.94, 0.10, 2.18), (sx, 1.92, 1.72), mat_recess, bevel_width=0.01)
        add_extruded_arch_frame(col, f"Niche_{side}_Arch", 1.18, 2.55, 0.90, 2.24, 0.22, (sx, 1.82, 0.56), mat_white, arch_segments=16, bevel_width=0.012)
        for idx, sz in enumerate((1.22, 1.88)):
            add_rounded_rect_prism(col, f"Niche_{side}_Shelf_{idx}", 0.88, 0.28, 0.04, 0.08, (sx, 1.82, sz), accent, corner_segments=5, bevel_top_bottom=0.006)
            add_box(col, f"Niche_{side}_LED_{idx}", (0.76, 0.02, 0.015), (sx, 1.88, sz - 0.025), mat_led, bevel_width=0.0)

    # 4. Multi-Layered Soft Arch Portals (Signature Organic Flow Silhouette)
    add_extruded_arch_frame(col, "Arch_Front_Pink", 6.88, 4.18, 6.08, 3.68, 0.26, (0.0, -1.88, 0.14), mat_pink, arch_segments=26, bevel_width=0.018)
    add_extruded_arch_frame(col, "Arch_Front_LED", 6.12, 3.70, 6.02, 3.64, 0.04, (0.0, -1.96, 0.14), mat_led, arch_segments=24, bevel_width=0.0)
    add_extruded_arch_frame(col, "Arch_Mid_White", 6.72, 4.04, 5.96, 3.58, 0.22, (0.0, -0.58, 0.14), mat_white, arch_segments=26, bevel_width=0.016)
    add_extruded_arch_frame(col, "Arch_Rear_Blue", 6.60, 3.92, 5.88, 3.48, 0.22, (0.0, +0.72, 0.14), mat_blue, arch_segments=26, bevel_width=0.016)
    for lx in (-2.55, +2.55):
        add_cylinder(col, f"TieRail_{lx:.2f}", 0.045, 2.75, (lx, -0.58, 3.25), mat_silver, segments=16, bevel_width=0.004, rot_euler=(math.pi * 0.5, 0.0, 0.0))

    add_rounded_rect_prism(col, "Header_Body", 5.88, 0.24, 0.72, 0.12, (0.0, -2.02, 3.42), mat_white, corner_segments=6, bevel_top_bottom=0.015)
    add_rounded_rect_prism(col, "Header_Rim", 5.94, 0.16, 0.78, 0.14, (0.0, -1.98, 3.42), mat_blue, corner_segments=6, bevel_top_bottom=0.01)

    # 5. Compact Angled Oval Reception Counter (Front-Center-Left, distinct from Booth 01!)
    cx, cy = -1.18, -1.02
    add_rounded_rect_prism(col, "Oval_Kick", 1.54, 0.58, 0.10, 0.29, (cx, cy, 0.19), mat_recess, corner_segments=10, bevel_top_bottom=0.005, rot_euler=(0, 0, 0.14))
    add_rounded_rect_prism(col, "Oval_Body", 1.68, 0.68, 0.72, 0.34, (cx, cy, 0.60), mat_pink, corner_segments=12, bevel_top_bottom=0.014, rot_euler=(0, 0, 0.14))
    add_rounded_rect_prism(col, "Oval_Top", 1.76, 0.74, 0.055, 0.37, (cx, cy, 0.99), mat_white, corner_segments=12, bevel_top_bottom=0.012, rot_euler=(0, 0, 0.14))

    # 6. Asymmetrical Organic Gallery Plinths
    for pname, px, py, w, d, h, pmat in [
        ("Plinth_Pill_R", +0.86, -0.56, 0.74, 0.54, 0.85, mat_pink),
        ("Plinth_Step_R2", +1.58, +0.25, 0.54, 0.54, 0.64, mat_blue),
        ("Plinth_Tall_L", -2.35, -0.35, 0.52, 0.52, 0.98, mat_white),
    ]:
        add_rounded_rect_prism(col, f"{pname}_Base", w - 0.06, d - 0.06, 0.07, 0.20, (px, py, 0.175), mat_recess, corner_segments=8, bevel_top_bottom=0.005)
        add_rounded_rect_prism(col, f"{pname}_Body", w, d, h - 0.10, 0.24, (px, py, 0.21 + (h - 0.10) * 0.5), pmat, corner_segments=10, bevel_top_bottom=0.012)
        add_rounded_rect_prism(col, f"{pname}_Top", w + 0.02, d + 0.02, 0.04, 0.25, (px, py, 0.14 + h - 0.01), mat_white, corner_segments=10, bevel_top_bottom=0.008)

    # 7. Curved Sculptural Lounge Sofa Bench + Low Round Side Table (Left-Rear Gallery Alcove)
    add_rounded_rect_prism(col, "Lounge_Sofa_Seat", 1.38, 0.62, 0.36, 0.28, (-1.92, +0.92, 0.32), mat_blue, corner_segments=10, bevel_top_bottom=0.02, rot_euler=(0, 0, -0.22))
    add_rounded_rect_prism(col, "Lounge_Sofa_Back", 1.34, 0.18, 0.34, 0.09, (-2.00, +1.18, 0.62), mat_pink, corner_segments=8, bevel_top_bottom=0.02, rot_euler=(0, 0, -0.22))
    add_round_table(col, "Lounge_CoffeeTable", -1.45, +0.18, 0.14, 0.30, 0.44, mat_white, mat_silver)

    optimize_and_join_by_material(col, "V273_Booth02_OrganicFlow")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_02_organic_flow_v27_3.glb"))


# ============================================================================
# BOOTH 03 — GRAND PORTAL (Digital Experience)
# ============================================================================
def build_v27_3_booth_03():
    reset_scene()
    col = ensure_collection("V273_Booth03_GrandPortal")

    mat_navy = make_pbr_mat("Portal_Executive_Navy", (0.09, 0.15, 0.26, 1.0), metallic=0.12, roughness=0.38)
    mat_white = make_pbr_mat("Portal_Crisp_White", (0.95, 0.96, 0.98, 1.0), metallic=0.0, roughness=0.34)
    mat_silver = make_pbr_mat("Portal_Brushed_Silver", (0.76, 0.80, 0.85, 1.0), metallic=0.88, roughness=0.22)
    mat_deck = make_pbr_mat("Portal_Light_Granite", (0.87, 0.89, 0.92, 1.0), metallic=0.0, roughness=0.30, coat_weight=0.18)
    mat_plinth = make_pbr_mat("Portal_Dark_Slate", (0.12, 0.14, 0.18, 1.0), metallic=0.35, roughness=0.44)
    mat_screen = make_pbr_mat("Portal_Digital_Glass", (0.06, 0.11, 0.20, 1.0), metallic=0.15, roughness=0.12, coat_weight=0.4)
    mat_led = make_pbr_mat("Portal_Cool_LED", (0.92, 0.97, 1.0, 1.0), emission_color=(0.86, 0.95, 1.0, 1.0), emission_strength=2.6)

    # 1. Crisp Architectural Granite Deck
    add_standard_deck(col, mat_deck, mat_plinth, mat_silver, mat_led, width=7.16, depth=5.16, corner_radius=0.12)
    add_box(col, "Deck_Runway_L", (0.08, 4.10, 0.008), (-2.18, -0.10, 0.142), mat_navy, bevel_width=0.0)
    add_box(col, "Deck_Runway_R", (0.08, 4.10, 0.008), (+2.18, -0.10, 0.142), mat_navy, bevel_width=0.0)

    # 2. Universal Rear Showcase Backing + Monumental Rear Wall
    add_universal_showcase_backing(col, mat_white, mat_navy, mat_silver, mat_led, recess_y=1.96)
    add_box(col, "Rear_Core_Wall", (7.06, 0.30, 3.55), (0.0, 2.26, 1.915), mat_navy, bevel_width=0.018)
    add_box(col, "Rear_Crown_Silver", (7.14, 0.38, 0.10), (0.0, 2.24, 3.74), mat_silver, bevel_width=0.01)

    # 3. Modular Illuminated Display Bays (Left & Right Rear)
    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_box(col, f"Bay_{side}_Panel", (1.26, 0.24, 3.22), (sx, 2.02, 1.75), mat_white, bevel_width=0.015)
        outer_x = sx + (-0.54 if side == "L" else +0.54)
        for fi in range(3):
            fx = outer_x + (fi * 0.09 if side == "L" else -fi * 0.09)
            add_box(col, f"Bay_{side}_Fin_{fi}", (0.035, 0.14, 3.05), (fx, 1.88, 1.72), mat_navy, bevel_width=0.005)
        for idx, sz in enumerate((1.02, 1.68, 2.34)):
            add_box(col, f"Bay_{side}_Shelf_{idx}", (0.94, 0.36, 0.048), (sx + (0.10 if side == "L" else -0.10), 1.74, sz), mat_white, bevel_width=0.006)
            add_box(col, f"Bay_{side}_Trim_{idx}", (0.94, 0.03, 0.05), (sx + (0.10 if side == "L" else -0.10), 1.56, sz), mat_silver, bevel_width=0.004)
            add_box(col, f"Bay_{side}_LED_{idx}", (0.84, 0.02, 0.014), (sx + (0.10 if side == "L" else -0.10), 1.84, sz - 0.028), mat_led, bevel_width=0.0)
        add_box(col, f"Bay_{side}_Cab", (1.10, 0.44, 0.56), (sx, 1.82, 0.42), mat_navy, bevel_width=0.012)
        add_box(col, f"Bay_{side}_CabTop", (1.14, 0.48, 0.04), (sx, 1.80, 0.72), mat_silver, bevel_width=0.006)

    # 4. Grand Portal Frame
    for side, px in (("L", -3.18), ("R", +3.18)):
        add_box(col, f"Pier_{side}_Base", (0.58, 0.72, 0.18), (px, -1.85, 0.23), mat_plinth, bevel_width=0.012)
        add_box(col, f"Pier_{side}_Body", (0.52, 0.64, 3.68), (px, -1.85, 2.08), mat_navy, bevel_width=0.018)
        add_box(col, f"Pier_{side}_Silver", (0.10, 0.66, 3.44), (px, -1.85, 2.06), mat_silver, bevel_width=0.008)
        add_box(col, f"Pier_{side}_LED", (0.025, 0.025, 3.20), (px + (0.265 if side == "L" else -0.265), -1.85, 2.04), mat_led, bevel_width=0.0)
        add_box(col, f"Return_{side}", (0.46, 4.18, 0.34), (px, +0.20, 3.75), mat_navy, bevel_width=0.015)
        add_box(col, f"ReturnTrim_{side}", (0.50, 4.22, 0.05), (px, +0.20, 3.94), mat_silver, bevel_width=0.006)

    add_box(col, "Header_Main", (7.12, 0.56, 0.84), (0.0, -1.94, 3.50), mat_navy, bevel_width=0.02)
    add_box(col, "Header_White", (6.54, 0.16, 0.74), (0.0, -2.18, 3.44), mat_white, bevel_width=0.014)
    add_box(col, "Header_Crown", (7.22, 0.64, 0.075), (0.0, -1.94, 3.94), mat_silver, bevel_width=0.01)
    add_box(col, "Header_LED", (6.02, 0.04, 0.022), (0.0, -1.94, 3.07), mat_led, bevel_width=0.0)

    # 5. Modular L-Shaped Executive Demo Counter (Front-Left)
    add_box(col, "LDesk_MainKick", (1.92, 0.60, 0.10), (-1.42, -0.82, 0.19), mat_plinth, bevel_width=0.008)
    add_box(col, "LDesk_MainBody", (2.02, 0.68, 0.76), (-1.42, -0.82, 0.62), mat_navy, bevel_width=0.014)
    add_box(col, "LDesk_WhiteApron", (1.84, 0.08, 0.54), (-1.42, -1.18, 0.64), mat_white, bevel_width=0.01)
    add_box(col, "LDesk_MainTop", (2.10, 0.76, 0.055), (-1.42, -0.82, 1.025), mat_white, bevel_width=0.01)
    # L-Return wing extending back along left
    add_box(col, "LDesk_WingBody", (0.62, 1.24, 0.76), (-2.12, -0.14, 0.62), mat_navy, bevel_width=0.014)
    add_box(col, "LDesk_WingTop", (0.68, 1.32, 0.055), (-2.12, -0.14, 1.025), mat_white, bevel_width=0.01)
    add_box(col, "LDesk_LED", (1.76, 0.025, 0.02), (-1.42, -1.16, 0.35), mat_led, bevel_width=0.0)

    # 6. Central Stepped Presentation Podium + Freestanding Interactive Kiosk Totem
    add_box(col, "Podium_Step", (0.94, 0.94, 0.12), (+0.92, -0.58, 0.20), mat_plinth, bevel_width=0.01)
    add_box(col, "Podium_Body", (0.74, 0.74, 0.68), (+0.92, -0.58, 0.60), mat_white, bevel_width=0.014)
    add_box(col, "Podium_Collar", (0.76, 0.76, 0.04), (+0.92, -0.58, 0.94), mat_silver, bevel_width=0.006)
    add_box(col, "Podium_Top", (0.78, 0.78, 0.04), (+0.92, -0.58, 0.98), mat_navy, bevel_width=0.008)

    add_freestanding_kiosk(col, "Portal_Kiosk", -2.55, +0.92, 0.14, 0.38, mat_navy, mat_silver, mat_screen, mat_led)

    # 7. Modern Consultation Table + 2 Cantilevered Chairs (Rear-Right)
    add_box(col, "Consult_Table_Base", (0.66, 0.42, 0.04), (+2.22, +0.62, 0.16), mat_silver, bevel_width=0.006)
    add_box(col, "Consult_Table_Leg", (0.14, 0.14, 0.68), (+2.22, +0.62, 0.50), mat_navy, bevel_width=0.008)
    add_box(col, "Consult_Table_Top", (1.02, 0.66, 0.045), (+2.22, +0.62, 0.86), mat_white, bevel_width=0.01)
    add_modern_chair(col, "Portal_ChairA", +1.56, +0.62, 0.14, -math.pi * 0.5, mat_navy, mat_silver)
    add_modern_chair(col, "Portal_ChairB", +2.88, +0.62, 0.14, +math.pi * 0.5, mat_navy, mat_silver)

    optimize_and_join_by_material(col, "V273_Booth03_GrandPortal")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_03_grand_portal_v27_3.glb"))


# ============================================================================
# BOOTH 04 — WAVE PAVILION (Interactive Showcase)
# ============================================================================
def build_v27_3_booth_04():
    reset_scene()
    col = ensure_collection("V273_Booth04_WavePavilion")

    mat_orange = make_pbr_mat("Wave_Architectural_Orange", (0.90, 0.36, 0.12, 1.0), metallic=0.04, roughness=0.34, coat_weight=0.18)
    mat_white = make_pbr_mat("Wave_Crisp_White", (0.97, 0.97, 0.96, 1.0), metallic=0.0, roughness=0.36)
    mat_gray = make_pbr_mat("Wave_Light_Gray", (0.88, 0.89, 0.90, 1.0), metallic=0.0, roughness=0.40)
    mat_charcoal = make_pbr_mat("Wave_Dark_Charcoal", (0.16, 0.16, 0.18, 1.0), metallic=0.30, roughness=0.46)
    mat_champagne = make_pbr_mat("Wave_Brushed_Champagne", (0.83, 0.72, 0.54, 1.0), metallic=0.84, roughness=0.26)
    mat_screen = make_pbr_mat("Wave_Screen_Glass", (0.08, 0.09, 0.12, 1.0), metallic=0.12, roughness=0.14, coat_weight=0.35)
    mat_led = make_pbr_mat("Wave_Warm_LED", (1.0, 0.94, 0.84, 1.0), emission_color=(1.0, 0.88, 0.72, 1.0), emission_strength=2.6)

    # 1. Warm Light-Gray Deck with Orange Edge
    add_standard_deck(col, mat_gray, mat_charcoal, mat_orange, mat_led, width=7.16, depth=5.16, corner_radius=0.42)

    # 2. Universal Rear Showcase Backing + Sculpted Double Wave Back Wall
    add_universal_showcase_backing(col, mat_white, mat_charcoal, mat_orange, mat_led, recess_y=1.96)
    add_wave_wall(col, "Rear_Wave_Outer", 7.08, 3.68, 0.42, 0.75, 0.35, 0.26, 0.14, (0.0, 2.34, 0.14), mat_orange, segments=36)
    add_wave_wall(col, "Rear_Wave_Inner", 6.84, 3.32, 0.28, 0.75, 1.15, 0.18, 0.08, (0.0, 2.16, 0.14), mat_white, segments=32)

    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_rounded_rect_prism(col, f"Wing_{side}_Frame", 1.24, 0.34, 2.94, 0.14, (sx, 1.96, 1.62), mat_gray, corner_segments=6, bevel_top_bottom=0.015)
        add_box(col, f"Wing_{side}_Recess", (0.94, 0.12, 2.16), (sx, 1.88, 1.66), mat_charcoal, bevel_width=0.008)
        for idx, sz in enumerate((1.06, 1.68, 2.30)):
            add_rounded_rect_prism(col, f"Wing_{side}_Shelf_{idx}", 0.90, 0.28, 0.04, 0.06, (sx, 1.78, sz), mat_white, corner_segments=4, bevel_top_bottom=0.006)
            add_box(col, f"Wing_{side}_LED_{idx}", (0.80, 0.02, 0.015), (sx, 1.86, sz - 0.025), mat_led, bevel_width=0.0)

    # 3. Asymmetric Wave Facade + Overhead Canopy Ribs
    add_rounded_rect_prism(col, "Asym_Pylon_L", 0.42, 0.96, 3.84, 0.18, (-3.16, -1.62, 2.06), mat_orange, corner_segments=8, bevel_top_bottom=0.018)
    add_rounded_rect_prism(col, "Asym_Pylon_White", 0.16, 1.02, 3.45, 0.07, (-2.94, -1.62, 1.94), mat_white, corner_segments=6, bevel_top_bottom=0.01)
    add_cylinder(col, "Col_R_Base", 0.15, 0.16, (+3.12, -1.96, 0.22), mat_charcoal, segments=20, bevel_width=0.01)
    add_cylinder(col, "Col_R_Shaft", 0.095, 3.32, (+3.12, -1.96, 1.96), mat_champagne, segments=20, bevel_width=0.008)
    add_box(col, "Wave_Return_L", (0.28, 4.18, 0.28), (-3.16, +0.34, 3.84), mat_orange, bevel_width=0.015)
    add_box(col, "Wave_Return_R", (0.18, 4.18, 0.20), (+3.12, +0.16, 3.68), mat_white, bevel_width=0.012)
    add_rounded_rect_prism(col, "Wave_Header_Body", 6.46, 0.30, 0.74, 0.14, (0.0, -2.04, 3.42), mat_white, corner_segments=6, bevel_top_bottom=0.016)
    add_rounded_rect_prism(col, "Wave_Header_Crest", 6.58, 0.34, 0.14, 0.14, (-0.06, -2.04, 3.84), mat_orange, corner_segments=6, bevel_top_bottom=0.012)
    add_box(col, "Wave_Header_LED", (5.80, 0.035, 0.02), (0.0, -2.04, 3.04), mat_led, bevel_width=0.0)

    # 4. Long Sweeping Wave Counter (Front-Left to Center)
    cx, cy = -1.05, -0.84
    add_rounded_rect_prism(col, "WaveCounter_Kick", 2.40, 0.66, 0.10, 0.32, (cx, cy, 0.19), mat_charcoal, corner_segments=10, bevel_top_bottom=0.006)
    add_rounded_rect_prism(col, "WaveCounter_Hull", 2.56, 0.78, 0.44, 0.38, (cx, cy, 0.46), mat_orange, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "WaveCounter_Upper", 2.62, 0.82, 0.34, 0.40, (cx, cy, 0.84), mat_white, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "WaveCounter_Top", 2.66, 0.84, 0.045, 0.41, (cx, cy, 1.03), mat_gray, corner_segments=12, bevel_top_bottom=0.01)
    add_box(col, "WaveCounter_LED", (1.84, 0.025, 0.02), (cx, cy - 0.395, 0.675), mat_led, bevel_width=0.0)

    # 5. Clustered Trio of Stepped Interactive Product Pedestals (Center-Right)
    for pname, px, py, r, h, pmat in [
        ("Cluster_Main", +0.96, -0.56, 0.35, 0.86, mat_orange),
        ("Cluster_Low", +1.58, -0.82, 0.25, 0.60, mat_white),
        ("Cluster_High", +1.46, +0.16, 0.27, 1.02, mat_gray),
    ]:
        add_cylinder(col, f"{pname}_Base", r + 0.02, 0.07, (px, py, 0.175), mat_charcoal, segments=22, bevel_width=0.008)
        add_cylinder(col, f"{pname}_Body", r, h - 0.11, (px, py, 0.21 + (h - 0.11) * 0.5), pmat, segments=22, bevel_width=0.012)
        add_cylinder(col, f"{pname}_Top", r + 0.012, 0.045, (px, py, 0.14 + h - 0.01), mat_white, segments=22, bevel_width=0.01)

    # 6. Visitor Experience Demo Bar Table + 2 Stools (Left Wing) + Freestanding Promo Screen (Rear-Right)
    add_round_table(col, "Demo_BarTable", -2.35, +0.58, 0.14, 0.42, 0.96, mat_white, mat_orange)
    add_bar_stool(col, "Demo_StoolA", -1.75, +0.58, 0.14, mat_orange, mat_charcoal)
    add_bar_stool(col, "Demo_StoolB", -2.35, -0.02, 0.14, mat_gray, mat_charcoal)
    add_freestanding_kiosk(col, "Wave_PromoScreen", +2.52, +0.85, 0.14, -0.45, mat_white, mat_orange, mat_screen, mat_led)

    for sx in (-1.2, 0.4, 1.8):
        add_track_spotlight(col, f"WaveSpot_{sx:.1f}", sx, -0.95, 3.65, mat_charcoal, mat_led)

    optimize_and_join_by_material(col, "V273_Booth04_WavePavilion")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_04_wave_pavilion_v27_3.glb"))


# ============================================================================
# BOOTH 05 — GALLERY ARCH (Boutique Exhibition)
# ============================================================================
def build_v27_3_booth_05():
    reset_scene()
    col = ensure_collection("V273_Booth05_GalleryArch")

    mat_teal = make_pbr_mat("Gallery_Jade_Teal", (0.11, 0.42, 0.39, 1.0), metallic=0.05, roughness=0.40)
    mat_cream = make_pbr_mat("Gallery_Warm_Cream", (0.95, 0.92, 0.86, 1.0), metallic=0.0, roughness=0.42)
    mat_white = make_pbr_mat("Gallery_Natural_Stone", (0.96, 0.95, 0.93, 1.0), metallic=0.0, roughness=0.34, coat_weight=0.14)
    mat_wood = make_pbr_mat("Gallery_Warm_Wood", (0.64, 0.48, 0.34, 1.0), metallic=0.0, roughness=0.48)
    mat_brass = make_pbr_mat("Gallery_Satin_Brass", (0.80, 0.67, 0.44, 1.0), metallic=0.86, roughness=0.25)
    mat_plinth = make_pbr_mat("Gallery_Deep_Teal_Plinth", (0.07, 0.22, 0.21, 1.0), metallic=0.25, roughness=0.46)
    mat_glass = make_pbr_mat("Gallery_Tempered_Glass", (0.86, 0.95, 0.94, 1.0), metallic=0.05, roughness=0.08, alpha=0.40)
    mat_led = make_pbr_mat("Gallery_Warm_LED", (1.0, 0.96, 0.88, 1.0), emission_color=(1.0, 0.94, 0.82, 1.0), emission_strength=2.5)

    # 1. Cream Travertine Gallery Deck
    add_standard_deck(col, mat_cream, mat_plinth, mat_brass, mat_led, width=7.16, depth=5.16, corner_radius=0.18)

    # 2. Universal Rear Showcase Backing + Jade Gallery Wall
    add_universal_showcase_backing(col, mat_white, mat_plinth, mat_brass, mat_led, recess_y=1.96)
    add_box(col, "Rear_Gallery_Wall", (7.02, 0.28, 3.48), (0.0, 2.26, 1.88), mat_teal, bevel_width=0.018)
    add_box(col, "Rear_Gallery_Cornice", (7.14, 0.36, 0.12), (0.0, 2.24, 3.68), mat_cream, bevel_width=0.012)
    add_box(col, "Rear_Gallery_Brass", (7.16, 0.38, 0.03), (0.0, 2.24, 3.60), mat_brass, bevel_width=0.004)

    # 3. Arched Recessed Museum Vitrine Niches
    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_box(col, f"Vitrine_{side}_Back", (1.00, 0.08, 2.48), (sx, 2.02, 1.76), mat_plinth, bevel_width=0.008)
        add_extruded_arch_frame(col, f"Vitrine_{side}_Arch", 1.24, 2.84, 0.96, 2.56, 0.34, (sx, 1.88, 0.44), mat_cream, arch_segments=18, bevel_width=0.014)
        add_box(col, f"Vitrine_{side}_Base", (1.24, 0.40, 0.36), (sx, 1.88, 0.32), mat_white, bevel_width=0.012)
        for idx, sz in enumerate((1.02, 1.62, 2.22)):
            add_box(col, f"Vitrine_{side}_Glass_{idx}", (0.94, 0.30, 0.024), (sx, 1.86, sz), mat_glass, bevel_width=0.003)
            add_box(col, f"Vitrine_{side}_Lip_{idx}", (0.94, 0.025, 0.028), (sx, 1.71, sz), mat_brass, bevel_width=0.003)
            add_box(col, f"Vitrine_{side}_LED_{idx}", (0.84, 0.02, 0.014), (sx, 1.94, sz - 0.018), mat_led, bevel_width=0.0)

    # 4. Rhythmic Colonnade Arches + Grand Front Gallery Arch
    for idx, ay in enumerate((-1.25, +0.05, +1.35)):
        add_extruded_arch_frame(col, f"Colonnade_L_{idx}", 1.32, 3.48, 0.96, 3.02, 0.22, (-3.28, ay, 0.14), mat_cream, arch_segments=16, bevel_width=0.012, rot_euler=(0, 0, math.pi * 0.5))
    add_extruded_arch_frame(col, "Colonnade_R_Rear", 1.42, 3.48, 1.02, 3.02, 0.22, (+3.28, +1.25, 0.14), mat_cream, arch_segments=16, bevel_width=0.012, rot_euler=(0, 0, math.pi * 0.5))
    add_extruded_arch_frame(col, "Front_Arch_Teal", 6.92, 4.22, 6.12, 3.70, 0.28, (0.0, -1.96, 0.14), mat_teal, arch_segments=28, bevel_width=0.018)
    add_extruded_arch_frame(col, "Front_Arch_Brass", 6.16, 3.73, 6.08, 3.67, 0.31, (0.0, -1.96, 0.14), mat_brass, arch_segments=24, bevel_width=0.004)
    add_box(col, "TopBeam_R", (0.22, 3.30, 0.18), (+3.28, -0.35, 3.56), mat_cream, bevel_width=0.012)
    add_box(col, "TopBeam_L", (0.24, 3.85, 0.18), (-3.28, +0.05, 3.64), mat_teal, bevel_width=0.012)

    add_box(col, "Header_Body", (5.96, 0.24, 0.72), (0.0, -2.06, 3.42), mat_white, bevel_width=0.015)
    add_box(col, "Header_Top", (6.04, 0.28, 0.045), (0.0, -2.06, 3.80), mat_brass, bevel_width=0.006)
    add_box(col, "Header_Bot", (6.04, 0.28, 0.045), (0.0, -2.06, 3.04), mat_brass, bevel_width=0.006)

    # 5. Compact Boutique Reception Pedestal Desk (Shifted Left — completely different plan from Booths 01-04!)
    cx, cy = -1.95, -0.88
    add_rounded_rect_prism(col, "BoutiqueDesk_Kick", 1.38, 0.54, 0.10, 0.14, (cx, cy, 0.19), mat_plinth, corner_segments=6, bevel_top_bottom=0.005)
    add_rounded_rect_prism(col, "BoutiqueDesk_Body", 1.50, 0.64, 0.76, 0.16, (cx, cy, 0.62), mat_teal, corner_segments=6, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, "BoutiqueDesk_WoodTop", 1.58, 0.72, 0.055, 0.18, (cx, cy, 1.025), mat_wood, corner_segments=6, bevel_top_bottom=0.01)
    add_rounded_rect_prism(col, "BoutiqueDesk_Brass", 1.52, 0.66, 0.028, 0.17, (cx, cy, 0.96), mat_brass, corner_segments=6, bevel_top_bottom=0.004)

    # 6. Stepped Natural Stone Exhibition Plinths (3 Gallery Heights: 0.64m, 0.88m, 1.04m)
    for pname, px, py, w, h in [
        ("StonePlinth_Hero", +0.92, -0.58, 0.64, 0.88),
        ("StonePlinth_Mid", -0.18, -0.52, 0.54, 0.64),
        ("StonePlinth_Tall", +1.92, +0.42, 0.50, 1.04),
    ]:
        add_box(col, f"{pname}_Base", (w - 0.06, w - 0.06, 0.08), (px, py, 0.18), mat_plinth, bevel_width=0.006)
        add_box(col, f"{pname}_Body", (w, w, h - 0.11), (px, py, 0.22 + (h - 0.11) * 0.5), mat_white, bevel_width=0.012)
        add_box(col, f"{pname}_Brass", (w + 0.02, w + 0.02, 0.028), (px, py, 0.14 + h - 0.04), mat_brass, bevel_width=0.004)
        add_box(col, f"{pname}_Top", (w + 0.04, w + 0.04, 0.035), (px, py, 0.14 + h - 0.01), mat_cream, bevel_width=0.008)

    # 7. Boutique Consultation Table + 2 Brass-Frame Chairs (Left-Rear Gallery)
    add_round_table(col, "Gallery_Table", -1.48, +0.68, 0.14, 0.38, 0.72, mat_white, mat_brass)
    add_modern_chair(col, "Gallery_ChairA", -2.10, +0.68, 0.14, -math.pi * 0.5, mat_wood, mat_brass)
    add_modern_chair(col, "Gallery_ChairB", -0.86, +0.68, 0.14, +math.pi * 0.5, mat_wood, mat_brass)

    for sx in (-1.5, 0.0, 1.5):
        add_track_spotlight(col, f"GalSpot_{sx:.1f}", sx, -0.85, 3.55, mat_plinth, mat_led)

    optimize_and_join_by_material(col, "V273_Booth05_GalleryArch")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_05_gallery_arch_v27_3.glb"))


# ============================================================================
# BOOTH 06 — DYNAMIC FRAME (Modern Innovation)
# ============================================================================
def build_v27_3_booth_06():
    reset_scene()
    col = ensure_collection("V273_Booth06_DynamicFrame")

    mat_graphite = make_pbr_mat("Dynamic_Matte_Graphite", (0.14, 0.15, 0.18, 1.0), metallic=0.28, roughness=0.40)
    mat_violet = make_pbr_mat("Dynamic_Royal_Violet", (0.36, 0.22, 0.64, 1.0), metallic=0.15, roughness=0.36, coat_weight=0.15)
    mat_champagne = make_pbr_mat("Dynamic_Champagne_Metal", (0.82, 0.72, 0.54, 1.0), metallic=0.88, roughness=0.22)
    mat_stone = make_pbr_mat("Dynamic_Light_Basalt", (0.28, 0.30, 0.34, 1.0), metallic=0.05, roughness=0.36, coat_weight=0.14)
    mat_light = make_pbr_mat("Dynamic_Soft_Gray", (0.86, 0.87, 0.90, 1.0), metallic=0.0, roughness=0.38)
    mat_screen = make_pbr_mat("Dynamic_Screen_Glass", (0.06, 0.06, 0.12, 1.0), metallic=0.18, roughness=0.12, coat_weight=0.4)
    mat_led = make_pbr_mat("Dynamic_Subtle_Violet_LED", (0.84, 0.76, 1.0, 1.0), emission_color=(0.66, 0.48, 0.98, 1.0), emission_strength=2.1)

    # 1. Basalt-Graphite Raised Deck
    add_standard_deck(col, mat_stone, mat_graphite, mat_champagne, mat_led, width=7.16, depth=5.16, corner_radius=0.10)
    add_box(col, "Floor_Stripe_L", (0.04, 4.30, 0.006), (-2.28, -0.05, 0.142), mat_champagne, bevel_width=0.0)
    add_box(col, "Floor_Stripe_R", (0.04, 4.30, 0.006), (+2.28, -0.05, 0.142), mat_champagne, bevel_width=0.0)

    # 2. Universal Rear Showcase Backing + Multi-Layer Architectural Backdrop
    add_universal_showcase_backing(col, mat_graphite, mat_graphite, mat_champagne, mat_led, recess_y=1.96)
    add_box(col, "Rear_Graphite_Wall", (7.02, 0.28, 3.44), (0.0, 2.26, 1.86), mat_graphite, bevel_width=0.016)
    add_box(col, "Rear_Violet_Accent", (1.68, 0.32, 3.68), (-2.70, 2.18, 1.98), mat_violet, bevel_width=0.016)
    add_box(col, "Rear_Light_Accent", (1.56, 0.32, 3.36), (+2.74, 2.18, 1.82), mat_light, bevel_width=0.016)

    # 3. Cantilevered Geometric Wall Shelves
    for side, sx, shelf_mat in (("L", -2.84, mat_light), ("R", +2.84, mat_graphite)):
        for idx, sz in enumerate((0.96, 1.62, 2.28)):
            offset_x = 0.08 * (idx % 2) * (1 if side == "L" else -1)
            add_box(col, f"FloatShelf_{side}_{idx}", (1.02, 0.36, 0.052), (sx + offset_x, 1.82, sz), shelf_mat, bevel_width=0.006)
            add_box(col, f"FloatShelf_{side}_Trim_{idx}", (1.02, 0.028, 0.054), (sx + offset_x, 1.64, sz), mat_champagne, bevel_width=0.004)
            add_box(col, f"FloatShelf_{side}_LED_{idx}", (0.88, 0.02, 0.014), (sx + offset_x, 1.92, sz - 0.03), mat_led, bevel_width=0.0)
        add_box(col, f"Credenza_{side}", (1.14, 0.44, 0.48), (sx, 1.84, 0.42), mat_graphite, bevel_width=0.012)
        add_box(col, f"Credenza_{side}_Top", (1.18, 0.48, 0.035), (sx, 1.82, 0.68), mat_champagne, bevel_width=0.005)

    # 4. Intersecting Dynamic Metal Frames
    add_box(col, "FrameA_L", (0.34, 0.46, 3.92), (-3.22, -1.78, 2.10), mat_graphite, bevel_width=0.015)
    add_box(col, "FrameA_R", (0.28, 0.38, 3.62), (+3.22, -1.96, 1.95), mat_graphite, bevel_width=0.015)
    add_box(col, "FrameA_Top", (6.92, 0.38, 0.24), (0.0, -1.86, 3.98), mat_graphite, bevel_width=0.014, rot_euler=(0.0, math.radians(-3.2), 0.0))
    add_box(col, "FrameA_RetL", (0.28, 4.12, 0.24), (-3.22, +0.26, 4.02), mat_graphite, bevel_width=0.012)
    add_box(col, "FrameA_RetR", (0.24, 4.18, 0.22), (+3.22, +0.16, 3.74), mat_graphite, bevel_width=0.012)
    add_box(col, "FrameB_L", (0.14, 0.14, 3.74), (-2.68, -2.06, 2.01), mat_champagne, bevel_width=0.008)
    add_box(col, "FrameB_R", (0.14, 0.14, 4.08), (+2.92, -1.62, 2.18), mat_champagne, bevel_width=0.008)
    add_box(col, "FrameB_Top", (6.24, 0.14, 0.14), (+0.12, -1.84, 4.16), mat_champagne, bevel_width=0.008, rot_euler=(0.0, math.radians(+2.8), 0.0))
    add_box(col, "FrameB_Diag", (0.18, 0.18, 3.68), (-3.02, -0.45, 2.02), mat_violet, bevel_width=0.01, rot_euler=(math.radians(24.0), 0.0, 0.0))
    add_box(col, "FrameB_Side", (0.16, 2.90, 0.16), (-3.02, -0.35, 3.76), mat_violet, bevel_width=0.008)
    add_box(col, "FrameB_LED", (0.03, 2.60, 0.025), (-2.94, -0.35, 3.68), mat_led, bevel_width=0.0)

    add_box(col, "Header_Body", (6.24, 0.28, 0.72), (0.0, -2.08, 3.42), mat_graphite, bevel_width=0.016)
    add_box(col, "Header_Violet", (6.30, 0.30, 0.06), (0.0, -2.08, 3.81), mat_violet, bevel_width=0.008)
    add_box(col, "Header_Champ", (6.30, 0.30, 0.04), (0.0, -2.08, 3.04), mat_champagne, bevel_width=0.005)
    add_box(col, "Header_LED", (5.80, 0.03, 0.02), (0.0, -2.08, 3.01), mat_led, bevel_width=0.0)

    # 5. Multi-Tier Cantilevered Angular Demo Counter (Front-Left)
    cx, cy = -1.14, -0.80
    add_box(col, "TierCounter_Kick", (2.14, 0.62, 0.10), (cx, cy, 0.19), mat_graphite, bevel_width=0.008)
    add_box(col, "TierCounter_Core", (2.26, 0.72, 0.74), (cx, cy, 0.61), mat_graphite, bevel_width=0.014)
    add_box(col, "TierCounter_Violet", (1.42, 0.09, 0.56), (cx - 0.36, cy - 0.38, 0.58), mat_violet, bevel_width=0.012)
    add_box(col, "TierCounter_Light", (1.28, 0.12, 0.42), (cx + 0.44, cy - 0.40, 0.68), mat_light, bevel_width=0.012)
    add_box(col, "TierCounter_Top", (2.36, 0.80, 0.055), (cx, cy, 1.015), mat_champagne, bevel_width=0.01)
    # Upper cantilevered demo shelf tier on left end of counter
    add_box(col, "TierCounter_UpperWing", (0.76, 0.46, 0.05), (cx - 0.82, cy - 0.06, 1.18), mat_light, bevel_width=0.008)
    add_box(col, "TierCounter_LED", (1.94, 0.025, 0.02), (cx, cy - 0.36, 0.96), mat_led, bevel_width=0.0)

    # 6. Angular Faceted Product Pedestals + Integrated Vertical Digital Monolith
    px, py = +0.94, -0.58
    add_box(col, "Ped_Base", (0.68, 0.68, 0.10), (px, py, 0.19), mat_graphite, bevel_width=0.008, rot_euler=(0, 0, math.radians(15)))
    add_box(col, "Ped_Body", (0.62, 0.62, 0.74), (px, py, 0.61), mat_graphite, bevel_width=0.012, rot_euler=(0, 0, math.radians(15)))
    add_box(col, "Ped_VioletSleeve", (0.66, 0.42, 0.44), (px, py - 0.08, 0.64), mat_violet, bevel_width=0.01, rot_euler=(0, 0, math.radians(15)))
    add_box(col, "Ped_Top", (0.68, 0.68, 0.04), (px, py, 1.00), mat_champagne, bevel_width=0.008, rot_euler=(0, 0, math.radians(15)))

    add_freestanding_kiosk(col, "Dynamic_Monolith", -2.55, +0.65, 0.14, 0.32, mat_graphite, mat_champagne, mat_screen, mat_led)

    # 7. Modular Geometric Consultation Table + 2 Chairs (Rear-Right)
    add_box(col, "DynTable_Base", (0.72, 0.44, 0.04), (+2.24, +0.62, 0.16), mat_champagne, bevel_width=0.006)
    add_box(col, "DynTable_Leg", (0.18, 0.18, 0.68), (+2.24, +0.62, 0.50), mat_graphite, bevel_width=0.01)
    add_box(col, "DynTable_Top", (1.04, 0.64, 0.045), (+2.24, +0.62, 0.86), mat_light, bevel_width=0.01)
    add_modern_chair(col, "DynChairA", +1.58, +0.62, 0.14, -math.pi * 0.5, mat_violet, mat_champagne)
    add_modern_chair(col, "DynChairB", +2.90, +0.62, 0.14, +math.pi * 0.5, mat_violet, mat_champagne)

    optimize_and_join_by_material(col, "V273_Booth06_DynamicFrame")
    return export_booth_glb(col, os.path.join(OUT_DIR, "booth_06_dynamic_frame_v27_3.glb"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    results = [
        {"slug": "booth_01_signature_ring_v27_3", "boothId": "booth-nordic-living", "theme": "living", **build_v27_3_booth_01()},
        {"slug": "booth_02_organic_flow_v27_3", "boothId": "booth-lumina-design", "theme": "design", **build_v27_3_booth_02()},
        {"slug": "booth_03_grand_portal_v27_3", "boothId": "booth-aether-tech", "theme": "tech", **build_v27_3_booth_03()},
        {"slug": "booth_04_wave_pavilion_v27_3", "boothId": "booth-solaris-energy", "theme": "energy", **build_v27_3_booth_04()},
        {"slug": "booth_05_gallery_arch_v27_3", "boothId": "booth-ecovita-craft", "theme": "coffee", **build_v27_3_booth_05()},
        {"slug": "booth_06_dynamic_frame_v27_3", "boothId": "booth-kinetix-robotics", "theme": "robotics", **build_v27_3_booth_06()},
    ]
    os.makedirs(os.path.dirname(MANIFEST_OUT), exist_ok=True)
    with open(MANIFEST_OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("[V27.3 ALL 6 BOOTHS COMPLETE]", MANIFEST_OUT)


if __name__ == "__main__":
    main()
