"""
BOOTH 01 — SIGNATURE RING (V4 Universal Premium Exhibition Booth)
Palette: Cream White, Warm Ivory Stone, Satin Champagne Gold, Warm Bronze, Warm White LED.
Archetype: Luxury circular suspended halo marquee on 4 real structural columns, curved reception
counter, flanking recessed illuminated display niches, standalone cylindrical product pedestals.
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
    add_hollow_ring,
    add_rounded_rect_prism,
    add_standard_deck,
    add_universal_showcase_backing,
    optimize_and_join_by_material,
    export_booth_glb,
    setup_studio_render,
)

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_01_signature_ring_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_signature_ring():
    reset_scene()
    col = ensure_collection("Booth01_SignatureRing")

    # PBR Material Palette (Cream White + Champagne Gold)
    mat_cream = make_pbr_mat("Cream_Matte_Panel", (0.95, 0.93, 0.88, 1.0), metallic=0.0, roughness=0.42)
    mat_stone = make_pbr_mat("Warm_Ivory_Stone", (0.89, 0.86, 0.80, 1.0), metallic=0.0, roughness=0.32, coat_weight=0.18)
    mat_recess = make_pbr_mat("Warm_Taupe_Recess", (0.24, 0.22, 0.20, 1.0), metallic=0.0, roughness=0.58)
    mat_champagne = make_pbr_mat("Champagne_Gold_Metal", (0.82, 0.70, 0.49, 1.0), metallic=0.88, roughness=0.24)
    mat_bronze = make_pbr_mat("Dark_Bronze_Plinth", (0.16, 0.14, 0.13, 1.0), metallic=0.45, roughness=0.42)
    mat_glass = make_pbr_mat("Clear_Tempered_Glass", (0.88, 0.93, 0.96, 1.0), metallic=0.05, roughness=0.08, alpha=0.42)
    mat_led = make_pbr_mat(
        "Warm_White_LED",
        (1.0, 0.96, 0.88, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(1.0, 0.94, 0.80, 1.0),
        emission_strength=2.6,
    )

    # 1. Architectural Raised Deck (top z = 0.14m)
    add_standard_deck(col, mat_stone, mat_bronze, mat_champagne, mat_led, width=7.16, depth=5.16, corner_radius=0.28)
    # Subtle brass floor inlay frame around main showcase zone
    add_box(col, "Floor_Inlay_F", (5.8, 0.03, 0.006), (0.0, -1.95, 0.142), mat_champagne, bevel_width=0.0)
    add_box(col, "Floor_Inlay_B", (5.8, 0.03, 0.006), (0.0, 1.65, 0.142), mat_champagne, bevel_width=0.0)

    # 2. Universal Rear Showcase Backing (flush behind Three.js z = -1.86m -> Blender y = +1.96m)
    add_universal_showcase_backing(col, mat_cream, mat_recess, mat_champagne, mat_led, recess_y=1.96)

    # Full-width architectural rear backdrop wall with layered wings & bronze plinth
    add_box(col, "Rear_Wall_Plinth", (7.00, 0.34, 0.14), (0.0, 2.24, 0.21), mat_bronze, bevel_width=0.01)
    add_box(col, "Rear_Wall_Main", (6.96, 0.28, 3.12), (0.0, 2.26, 1.84), mat_cream, bevel_width=0.02)
    add_box(col, "Rear_Wall_Crown", (7.08, 0.36, 0.10), (0.0, 2.24, 3.44), mat_champagne, bevel_width=0.012)

    # 3. Flanking Recessed Illuminated Display Niches (x = ±2.82m, facing -Y)
    for side, sx in (("L", -2.82), ("R", +2.82)):
        # Niche casing protruding gently from rear wall
        add_box(col, f"Niche_{side}_Back", (1.02, 0.08, 2.38), (sx, 2.02, 1.78), mat_recess, bevel_width=0.008)
        add_box(col, f"Niche_{side}_SideOut", (0.14, 0.38, 2.98), (sx + (0.56 if side == "R" else -0.56), 1.94, 1.77), mat_cream, bevel_width=0.014)
        add_box(col, f"Niche_{side}_Top", (1.22, 0.38, 0.16), (sx, 1.94, 3.04), mat_cream, bevel_width=0.014)
        add_box(col, f"Niche_{side}_Base", (1.16, 0.42, 0.48), (sx, 1.92, 0.38), mat_stone, bevel_width=0.016)
        add_box(col, f"Niche_{side}_Trim", (1.04, 0.03, 0.03), (sx, 1.76, 2.95), mat_champagne, bevel_width=0.004)
        # 3 illuminated tempered-glass + champagne display shelves
        for idx, sz in enumerate((1.05, 1.65, 2.25)):
            add_box(col, f"Niche_{side}_Shelf_{idx}", (0.96, 0.30, 0.025), (sx, 1.88, sz), mat_glass, bevel_width=0.003)
            add_box(col, f"Niche_{side}_ShelfTrim_{idx}", (0.96, 0.025, 0.028), (sx, 1.73, sz), mat_champagne, bevel_width=0.003)
            add_box(col, f"Niche_{side}_LED_{idx}", (0.86, 0.02, 0.015), (sx, 1.96, sz - 0.018), mat_led, bevel_width=0.0)

    # 4. Signature Overhead Halo Ring + 4 Real Structural Support Columns
    ring_center_y = 0.22
    ring_z = 4.04
    # Main cream ring drum (clears front fascia cleanly with zero clipping)
    add_hollow_ring(
        col, "Signature_Ring_Outer",
        outer_radius=1.96, inner_radius=1.68, height=0.44,
        center=(0.0, ring_center_y, ring_z), mat=mat_cream, segments=48, bevel_width=0.016
    )
    # Champagne gold upper & lower architectural trim rings
    add_hollow_ring(
        col, "Signature_Ring_GoldTop",
        outer_radius=1.99, inner_radius=1.66, height=0.045,
        center=(0.0, ring_center_y, ring_z + 0.225), mat=mat_champagne, segments=48, bevel_width=0.006
    )
    add_hollow_ring(
        col, "Signature_Ring_GoldBot",
        outer_radius=1.99, inner_radius=1.66, height=0.045,
        center=(0.0, ring_center_y, ring_z - 0.225), mat=mat_champagne, segments=48, bevel_width=0.006
    )
    # Concealed warm LED inner halo glow
    add_hollow_ring(
        col, "Signature_Ring_LED",
        outer_radius=1.685, inner_radius=1.655, height=0.055,
        center=(0.0, ring_center_y, ring_z - 0.14), mat=mat_led, segments=48, bevel_width=0.0
    )

    # 4 real structural champagne columns at outer corners (zero overlap with recessed side shelves!)
    col_coords = [
        (-3.05, -2.05),  # Front-Left
        (+3.05, -2.05),  # Front-Right (clear of NPC apron)
        (-3.42, +2.02),  # Rear-Left (outer corner beside niche)
        (+3.42, +2.02),  # Rear-Right (outer corner beside niche)
    ]
    for idx, (cx, cy) in enumerate(col_coords):
        add_cylinder(col, f"Col_Base_{idx}", 0.14, 0.18, (cx, cy, 0.23), mat_bronze, segments=20, bevel_width=0.01)
        add_cylinder(col, f"Col_Shaft_{idx}", 0.085, 3.32, (cx, cy, 1.98), mat_champagne, segments=20, bevel_width=0.008)
        add_cylinder(col, f"Col_Cap_{idx}", 0.13, 0.12, (cx, cy, 3.64), mat_bronze, segments=20, bevel_width=0.008)

    # Structural cross-beams connecting columns cleanly into the Signature Ring underside
    add_box(col, "Beam_Left", (0.14, 4.14, 0.14), (-3.05, -0.02, 3.74), mat_champagne, bevel_width=0.01)
    add_box(col, "Beam_Right", (0.14, 4.14, 0.14), (+3.05, -0.02, 3.74), mat_champagne, bevel_width=0.01)
    add_box(col, "Beam_Cross_Center", (6.20, 0.14, 0.12), (0.0, ring_center_y, 3.78), mat_bronze, bevel_width=0.01)
    add_box(col, "Beam_Cross_Rear", (6.92, 0.16, 0.14), (0.0, 2.02, 3.74), mat_champagne, bevel_width=0.01)

    # Front Architectural Fascia Beam for Dynamic Brand Header (front face at Blender y = -2.26m -> Three.js z = +2.26m)
    add_box(col, "Header_Fascia_Body", (6.24, 0.26, 0.72), (0.0, -2.08, 3.42), mat_cream, bevel_width=0.018)
    add_box(col, "Header_Fascia_TrimTop", (6.30, 0.30, 0.05), (0.0, -2.08, 3.80), mat_champagne, bevel_width=0.008)
    add_box(col, "Header_Fascia_TrimBot", (6.30, 0.30, 0.045), (0.0, -2.08, 3.04), mat_champagne, bevel_width=0.008)

    # 5. Curved Luxury Reception Counter (front-left, scaled for 1.70m avatar)
    # Curved arc counter body + warm ivory stone top + bronze toe kick
    counter_cx, counter_cy = -1.25, -0.75
    add_rounded_rect_prism(
        col, "Counter_ToeKick", 2.08, 0.62, 0.10, 0.28, (counter_cx, counter_cy, 0.19), mat_bronze, corner_segments=8, bevel_top_bottom=0.005
    )
    add_rounded_rect_prism(
        col, "Counter_Body", 2.22, 0.72, 0.76, 0.34, (counter_cx, counter_cy, 0.62), mat_cream, corner_segments=10, bevel_top_bottom=0.012
    )
    add_rounded_rect_prism(
        col, "Counter_TopSlab", 2.30, 0.78, 0.055, 0.36, (counter_cx, counter_cy, 1.025), mat_stone, corner_segments=10, bevel_top_bottom=0.01
    )
    add_rounded_rect_prism(
        col, "Counter_GoldBelt", 2.24, 0.74, 0.03, 0.35, (counter_cx, counter_cy, 0.96), mat_champagne, corner_segments=10, bevel_top_bottom=0.004
    )
    # Vertical champagne decorative flutes on front face of counter
    for fx in (-0.75, -0.45, -0.15, 0.15, 0.45, 0.75):
        add_box(col, f"Counter_Flute_{fx:.2f}", (0.025, 0.025, 0.68), (counter_cx + fx, counter_cy - 0.365, 0.60), mat_champagne, bevel_width=0.004)
    # Recessed LED under counter overhang
    add_box(col, "Counter_LED", (1.60, 0.025, 0.018), (counter_cx, counter_cy - 0.355, 0.985), mat_led, bevel_width=0.0)

    # 6. Two Standalone Cylindrical Product Pedestals (Universal for any product type)
    for pname, px, py, pr, ph in [
        ("Pedestal_CenterRight", +0.88, -0.58, 0.34, 0.88),
        ("Pedestal_LeftDisplay", -2.75, +0.25, 0.30, 1.02),
    ]:
        add_cylinder(col, f"{pname}_Base", pr + 0.02, 0.08, (px, py, 0.18), mat_bronze, segments=24, bevel_width=0.008)
        add_cylinder(col, f"{pname}_Body", pr, ph - 0.12, (px, py, 0.22 + (ph - 0.12) * 0.5), mat_cream, segments=24, bevel_width=0.01)
        add_cylinder(col, f"{pname}_Ring", pr + 0.015, 0.025, (px, py, 0.14 + ph - 0.05), mat_champagne, segments=24, bevel_width=0.004)
        add_cylinder(col, f"{pname}_Top", pr + 0.01, 0.04, (px, py, 0.14 + ph - 0.01), mat_stone, segments=24, bevel_width=0.008)

    # Optimize & join by material for ultra-low draw calls (~7 meshes)
    optimize_and_join_by_material(col, "Booth01_SignatureRing")
    stats = export_booth_glb(col, OUT_GLB)

    # Studio QA Renders (Front, 3/4, Isometric, Counter Close-up)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_01_signature_ring")
    return stats


if __name__ == "__main__":
    build_signature_ring()
