"""
BOOTH 05 — GALLERY ARCH (V4 Universal Premium Exhibition Booth)
Palette: Jade/Emerald Teal, Warm Cream, Crisp White, Satin Brass, Tempered Glass, Warm Gallery LED.
Archetype: Tall central museum gallery arch flanked by rhythmic repeating colonnade arches, deep
backlit glass-shelf display vitrines, minimalist sculptural center counter, refined brass trims.
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
    add_extruded_arch_frame,
    add_rounded_rect_prism,
    add_standard_deck,
    add_universal_showcase_backing,
    optimize_and_join_by_material,
    export_booth_glb,
    setup_studio_render,
)

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_05_gallery_arch_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_gallery_arch():
    reset_scene()
    col = ensure_collection("Booth05_GalleryArch")

    # PBR Material Palette (Jade/Emerald Teal, Warm Cream, Crisp White, Satin Brass)
    mat_teal = make_pbr_mat("Gallery_Jade_Teal", (0.11, 0.42, 0.39, 1.0), metallic=0.05, roughness=0.40)
    mat_cream = make_pbr_mat("Gallery_Warm_Cream", (0.95, 0.92, 0.86, 1.0), metallic=0.0, roughness=0.42)
    mat_white = make_pbr_mat("Gallery_Crisp_White", (0.97, 0.97, 0.96, 1.0), metallic=0.0, roughness=0.36)
    mat_brass = make_pbr_mat("Gallery_Satin_Brass", (0.80, 0.67, 0.44, 1.0), metallic=0.86, roughness=0.25)
    mat_plinth = make_pbr_mat("Gallery_Deep_Teal_Plinth", (0.07, 0.22, 0.21, 1.0), metallic=0.25, roughness=0.46)
    mat_glass = make_pbr_mat("Gallery_Tempered_Glass", (0.86, 0.95, 0.94, 1.0), metallic=0.05, roughness=0.08, alpha=0.40)
    mat_led = make_pbr_mat(
        "Gallery_Warm_LED",
        (1.0, 0.96, 0.88, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(1.0, 0.94, 0.82, 1.0),
        emission_strength=2.5,
    )

    # 1. Cream Travertine Gallery Deck with Brass Edge & Deep Teal Plinth
    add_standard_deck(col, mat_cream, mat_plinth, mat_brass, mat_led, width=7.16, depth=5.16, corner_radius=0.18)

    # 2. Universal Rear Showcase Backing
    add_universal_showcase_backing(col, mat_white, mat_plinth, mat_brass, mat_led, recess_y=1.96)

    # Tall Gallery Rear Wall (Jade Teal main body + Warm Cream architectural pilasters)
    add_box(col, "Rear_Gallery_Wall", (7.02, 0.28, 3.48), (0.0, 2.26, 1.88), mat_teal, bevel_width=0.018)
    add_box(col, "Rear_Gallery_Cornice", (7.14, 0.36, 0.12), (0.0, 2.24, 3.68), mat_cream, bevel_width=0.012)
    add_box(col, "Rear_Gallery_BrassLine", (7.16, 0.38, 0.03), (0.0, 2.24, 3.60), mat_brass, bevel_width=0.004)

    # 3. Deep Arched Museum Vitrine Niches (Left & Right Rear) with Tempered Glass Shelves & Under-Shelf LED
    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_box(col, f"Vitrine_{side}_Back", (1.00, 0.08, 2.48), (sx, 2.02, 1.76), mat_plinth, bevel_width=0.008)
        add_extruded_arch_frame(
            col, f"Vitrine_{side}_Arch",
            outer_w=1.24, outer_h=2.84, inner_w=0.96, inner_h=2.56,
            thickness_y=0.34, center=(sx, 1.88, 0.44), mat=mat_cream, arch_segments=18, bevel_width=0.014
        )
        add_box(col, f"Vitrine_{side}_Base", (1.24, 0.40, 0.36), (sx, 1.88, 0.32), mat_white, bevel_width=0.012)
        for idx, sz in enumerate((1.02, 1.62, 2.22)):
            add_box(col, f"Vitrine_{side}_Glass_{idx}", (0.94, 0.30, 0.024), (sx, 1.86, sz), mat_glass, bevel_width=0.003)
            add_box(col, f"Vitrine_{side}_BrassLip_{idx}", (0.94, 0.025, 0.028), (sx, 1.71, sz), mat_brass, bevel_width=0.003)
            add_box(col, f"Vitrine_{side}_LED_{idx}", (0.84, 0.02, 0.014), (sx, 1.94, sz - 0.018), mat_led, bevel_width=0.0)

    # 4. Signature Rhythmic Repeating Side Colonnade Arches (Left Wing) + Tall Grand Front Gallery Arch
    # Left Wing 3-Arch Rhythmic Gallery Colonnade (rotated 90° along X = -3.22m!)
    for idx, ay in enumerate((-1.25, +0.05, +1.35)):
        add_extruded_arch_frame(
            col, f"Colonnade_Arch_L_{idx}",
            outer_w=1.32, outer_h=3.48, inner_w=0.96, inner_h=3.02,
            thickness_y=0.22, center=(-3.28, ay, 0.14), mat=mat_cream, arch_segments=16, bevel_width=0.012,
            rot_euler=(0.0, 0.0, math.pi * 0.5)
        )
    # Right Wing Rear Matching Colonnade Arch (keeps Front-Right open for NPC!)
    add_extruded_arch_frame(
        col, "Colonnade_Arch_R_Rear",
        outer_w=1.42, outer_h=3.48, inner_w=1.02, inner_h=3.02,
        thickness_y=0.22, center=(+3.28, +1.25, 0.14), mat=mat_cream, arch_segments=16, bevel_width=0.012,
        rot_euler=(0.0, 0.0, math.pi * 0.5)
    )

    # Tall Grand Front Gallery Portal Arch (Jade Teal outer + Warm Cream inner reveal + Brass key-ring)
    add_extruded_arch_frame(
        col, "Grand_Front_Arch_Teal",
        outer_w=6.92, outer_h=4.22, inner_w=6.12, inner_h=3.70,
        thickness_y=0.28, center=(0.0, -1.96, 0.14), mat=mat_teal, arch_segments=28, bevel_width=0.018
    )
    add_extruded_arch_frame(
        col, "Grand_Front_Arch_BrassTrim",
        outer_w=6.16, outer_h=3.73, inner_w=6.08, inner_h=3.67,
        thickness_y=0.31, center=(0.0, -1.96, 0.14), mat=mat_brass, arch_segments=24, bevel_width=0.004
    )
    # Overhead top cornice beam linking right front pier back to right colonnade
    add_box(col, "Gallery_TopBeam_R", (0.22, 3.30, 0.18), (+3.28, -0.35, 3.56), mat_cream, bevel_width=0.012)
    add_box(col, "Gallery_TopBeam_L", (0.24, 3.85, 0.18), (-3.28, +0.05, 3.64), mat_teal, bevel_width=0.012)

    # Front Integrated Brand Sign Fascia
    add_box(col, "Gallery_Header_Body", (5.96, 0.24, 0.72), (0.0, -2.06, 3.42), mat_white, bevel_width=0.015)
    add_box(col, "Gallery_Header_BrassTop", (6.04, 0.28, 0.045), (0.0, -2.06, 3.80), mat_brass, bevel_width=0.006)
    add_box(col, "Gallery_Header_BrassBot", (6.04, 0.28, 0.045), (0.0, -2.06, 3.04), mat_brass, bevel_width=0.006)

    # 5. Minimalist Sculptural Gallery Reception Counter (Jade fluted body + cream stone top + brass reveal)
    cx, cy = -1.10, -0.82
    add_rounded_rect_prism(col, "Counter_Plinth", 2.04, 0.60, 0.10, 0.18, (cx, cy, 0.19), mat_plinth, corner_segments=6, bevel_top_bottom=0.006)
    add_rounded_rect_prism(col, "Counter_Body", 2.18, 0.70, 0.76, 0.20, (cx, cy, 0.62), mat_teal, corner_segments=8, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, "Counter_BrassBand", 2.20, 0.72, 0.032, 0.21, (cx, cy, 0.96), mat_brass, corner_segments=8, bevel_top_bottom=0.004)
    add_rounded_rect_prism(col, "Counter_StoneTop", 2.26, 0.78, 0.055, 0.22, (cx, cy, 1.025), mat_cream, corner_segments=8, bevel_top_bottom=0.01)
    for fx in (-0.80, -0.56, -0.32, -0.08, 0.16, 0.40, 0.64, 0.88):
        add_box(col, f"Counter_Flute_{fx:.2f}", (0.03, 0.03, 0.68), (cx + fx, cy - 0.355, 0.60), mat_cream, bevel_width=0.005)
    add_box(col, "Counter_LED", (1.68, 0.025, 0.018), (cx, cy - 0.35, 0.985), mat_led, bevel_width=0.0)

    # 6. Minimalist Museum Vitrine Pedestal (front-center-right, clear of NPC)
    px, py = +0.92, -0.58
    add_box(col, "Pedestal_Plinth", (0.58, 0.58, 0.09), (px, py, 0.185), mat_plinth, bevel_width=0.008)
    add_box(col, "Pedestal_Body", (0.64, 0.64, 0.76), (px, py, 0.61), mat_cream, bevel_width=0.012)
    add_box(col, "Pedestal_BrassRim", (0.66, 0.66, 0.03), (px, py, 0.98), mat_brass, bevel_width=0.004)
    add_box(col, "Pedestal_Top", (0.68, 0.68, 0.035), (px, py, 1.01), mat_white, bevel_width=0.008)

    optimize_and_join_by_material(col, "Booth05_GalleryArch")
    stats = export_booth_glb(col, OUT_GLB)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_05_gallery_arch")
    return stats


if __name__ == "__main__":
    build_gallery_arch()
