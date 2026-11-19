"""
BOOTH 04 — WAVE PAVILION (V4 Universal Premium Exhibition Booth)
Palette: Vibrant Architectural Orange, Crisp White, Warm Cream, Brushed Champagne, Warm LED.
Archetype: Sculpted architectural wave walls, asymmetric curved facade, large rounded display counter,
recessed wall product niches, raised floating brand header band, dramatic cove & edge lighting.
100% Universal (zero industry-specific geometry).
"""

import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from v4_common import (
    reset_scene,
    ensure_collection,
    make_pbr_mat,
    add_box,
    add_cylinder,
    add_rounded_rect_prism,
    add_wave_wall,
    add_standard_deck,
    add_universal_showcase_backing,
    optimize_and_join_by_material,
    export_booth_glb,
    setup_studio_render,
)

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_04_wave_pavilion_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_wave_pavilion():
    reset_scene()
    col = ensure_collection("Booth04_WavePavilion")

    # PBR Material Palette (Architectural Orange, Crisp White, Warm Cream)
    mat_orange = make_pbr_mat("Wave_Architectural_Orange", (0.90, 0.36, 0.12, 1.0), metallic=0.04, roughness=0.34, coat_weight=0.18)
    mat_white = make_pbr_mat("Wave_Crisp_White", (0.97, 0.97, 0.96, 1.0), metallic=0.0, roughness=0.36)
    mat_cream = make_pbr_mat("Wave_Warm_Cream", (0.94, 0.90, 0.83, 1.0), metallic=0.0, roughness=0.40)
    mat_charcoal = make_pbr_mat("Wave_Dark_Charcoal", (0.16, 0.16, 0.18, 1.0), metallic=0.30, roughness=0.46)
    mat_champagne = make_pbr_mat("Wave_Brushed_Champagne", (0.83, 0.72, 0.54, 1.0), metallic=0.84, roughness=0.26)
    mat_led = make_pbr_mat(
        "Wave_Warm_LED",
        (1.0, 0.94, 0.84, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(1.0, 0.88, 0.72, 1.0),
        emission_strength=2.6,
    )

    # 1. Warm Cream Architectural Deck with Orange-Trimmed Accent
    add_standard_deck(col, mat_cream, mat_charcoal, mat_orange, mat_led, width=7.16, depth=5.16, corner_radius=0.42)

    # 2. Universal Rear Showcase Backing
    add_universal_showcase_backing(col, mat_white, mat_charcoal, mat_orange, mat_led, recess_y=1.96)

    # 3. Sculpted Double-Layered Architectural Wave Back Wall (Signature Silhouette!)
    # Outer vibrant orange sculpted wave crest rising higher on left, sweeping smoothly to right
    add_wave_wall(
        col, "Rear_Wave_Outer_Orange",
        width=7.08, base_height=3.68, wave_amp=0.42, wave_cycles=0.75, wave_phase=0.35,
        thickness_y=0.26, depth_curve_amp=0.14, center=(0.0, 2.34, 0.14), mat=mat_orange, segments=36
    )
    # Inner offset crisp-white wave wall for layered architectural depth
    add_wave_wall(
        col, "Rear_Wave_Inner_White",
        width=6.84, base_height=3.32, wave_amp=0.28, wave_cycles=0.75, wave_phase=1.15,
        thickness_y=0.18, depth_curve_amp=0.08, center=(0.0, 2.16, 0.14), mat=mat_white, segments=32
    )

    # Flanking Recessed Illuminated Product Niches carved into left & right cream wings
    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_rounded_rect_prism(col, f"Wing_{side}_Frame", 1.24, 0.34, 2.94, 0.14, (sx, 1.96, 1.62), mat_cream, corner_segments=6, bevel_top_bottom=0.015)
        add_box(col, f"Wing_{side}_Recess", (0.94, 0.12, 2.16), (sx, 1.88, 1.66), mat_charcoal, bevel_width=0.008)
        for idx, sz in enumerate((1.06, 1.68, 2.30)):
            add_rounded_rect_prism(col, f"Wing_{side}_Shelf_{idx}", 0.90, 0.28, 0.04, 0.06, (sx, 1.78, sz), mat_white, corner_segments=4, bevel_top_bottom=0.006)
            add_box(col, f"Wing_{side}_LED_{idx}", (0.80, 0.02, 0.015), (sx, 1.86, sz - 0.025), mat_led, bevel_width=0.0)

    # 4. Asymmetric Curved Side Wave Wing (Left side) & Sweeping Overhead Canopy Fascia
    # Sculpted curved orange architectural pylon on Front-Left
    add_rounded_rect_prism(col, "Asym_Pylon_L", 0.42, 0.96, 3.84, 0.18, (-3.16, -1.62, 2.06), mat_orange, corner_segments=8, bevel_top_bottom=0.018)
    add_rounded_rect_prism(col, "Asym_Pylon_L_WhiteRib", 0.16, 1.02, 3.45, 0.07, (-2.94, -1.62, 1.94), mat_white, corner_segments=6, bevel_top_bottom=0.01)
    # Sleek champagne structural column on Front-Right (keeps right side open & airy for NPC)
    add_cylinder(col, "Column_R_Base", 0.15, 0.16, (+3.12, -1.96, 0.22), mat_charcoal, segments=20, bevel_width=0.01)
    add_cylinder(col, "Column_R_Shaft", 0.095, 3.32, (+3.12, -1.96, 1.96), mat_champagne, segments=20, bevel_width=0.008)

    # Overhead curved return ribbons linking front facade back to wave rear wall
    add_box(col, "Wave_Return_L", (0.28, 4.18, 0.28), (-3.16, +0.34, 3.84), mat_orange, bevel_width=0.015)
    add_box(col, "Wave_Return_R", (0.18, 4.18, 0.20), (+3.12, +0.16, 3.68), mat_white, bevel_width=0.012)

    # Sweeping Front Brand Header Fascia (crisp white face + sculpted orange top wave accent)
    add_rounded_rect_prism(col, "Wave_Header_Body", 6.46, 0.30, 0.74, 0.14, (0.0, -2.04, 3.42), mat_white, corner_segments=6, bevel_top_bottom=0.016)
    add_rounded_rect_prism(col, "Wave_Header_OrangeCrest", 6.58, 0.34, 0.14, 0.14, (-0.06, -2.04, 3.84), mat_orange, corner_segments=6, bevel_top_bottom=0.012)
    add_box(col, "Wave_Header_SoffitLED", (5.80, 0.035, 0.02), (0.0, -2.04, 3.04), mat_led, bevel_width=0.0)

    # 5. Large Rounded Commercial Display Counter (Orange lower hull + white floating upper counter)
    cx, cy = -1.05, -0.82
    add_rounded_rect_prism(col, "Counter_Plinth", 2.26, 0.66, 0.10, 0.32, (cx, cy, 0.19), mat_charcoal, corner_segments=10, bevel_top_bottom=0.006)
    add_rounded_rect_prism(col, "Counter_OrangeHull", 2.42, 0.78, 0.44, 0.38, (cx, cy, 0.46), mat_orange, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "Counter_WhiteUpper", 2.48, 0.82, 0.34, 0.40, (cx, cy, 0.84), mat_white, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "Counter_TopTrim", 2.52, 0.84, 0.045, 0.41, (cx, cy, 1.03), mat_cream, corner_segments=12, bevel_top_bottom=0.01)
    add_box(col, "Counter_LED", (1.72, 0.025, 0.02), (cx, cy - 0.395, 0.675), mat_led, bevel_width=0.0)

    # 6. Two Sculptural Display Pedestals (Universal)
    for pname, px, py, r, h, pmat in [
        ("Pedestal_Orange", +0.96, -0.56, 0.34, 0.86, mat_orange),
        ("Pedestal_Cream", -2.56, +0.26, 0.28, 0.98, mat_cream),
    ]:
        add_cylinder(col, f"{pname}_Base", r + 0.02, 0.07, (px, py, 0.175), mat_charcoal, segments=24, bevel_width=0.008)
        add_cylinder(col, f"{pname}_Body", r, h - 0.11, (px, py, 0.21 + (h - 0.11) * 0.5), pmat, segments=24, bevel_width=0.012)
        add_cylinder(col, f"{pname}_Top", r + 0.012, 0.045, (px, py, 0.14 + h - 0.01), mat_white, segments=24, bevel_width=0.01)

    optimize_and_join_by_material(col, "Booth04_WavePavilion")
    stats = export_booth_glb(col, OUT_GLB)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_04_wave_pavilion")
    return stats


if __name__ == "__main__":
    build_wave_pavilion()
