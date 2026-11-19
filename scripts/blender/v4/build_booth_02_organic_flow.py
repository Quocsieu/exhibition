"""
BOOTH 02 — ORGANIC FLOW (V4 Universal Premium Exhibition Booth)
Palette: Pastel Pink, Soft Sky Blue, Crisp White, Satin Silver, Soft Contour LED.
Archetype: Flowing organic curved walls, multi-layered soft arch portals, pill-rounded reception
counter, recessed arched wall niches, architectural contour LED ribbons. Zero toys/balloons/animals.
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
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_02_organic_flow_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_organic_flow():
    reset_scene()
    col = ensure_collection("Booth02_OrganicFlow")

    # PBR Material Palette (Pastel Pink, Light Blue, Crisp White)
    mat_white = make_pbr_mat("Organic_Crisp_White", (0.96, 0.96, 0.97, 1.0), metallic=0.0, roughness=0.38)
    mat_pink = make_pbr_mat("Organic_Pastel_Pink", (0.93, 0.72, 0.78, 1.0), metallic=0.0, roughness=0.40)
    mat_blue = make_pbr_mat("Organic_Sky_Blue", (0.68, 0.84, 0.93, 1.0), metallic=0.0, roughness=0.38)
    mat_deck = make_pbr_mat("Organic_Light_Terrazzo", (0.91, 0.92, 0.94, 1.0), metallic=0.0, roughness=0.34, coat_weight=0.15)
    mat_recess = make_pbr_mat("Organic_Slate_Recess", (0.20, 0.23, 0.28, 1.0), metallic=0.0, roughness=0.55)
    mat_silver = make_pbr_mat("Organic_Satin_Silver", (0.80, 0.83, 0.86, 1.0), metallic=0.85, roughness=0.25)
    mat_led = make_pbr_mat(
        "Organic_Soft_LED",
        (1.0, 0.95, 0.98, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(1.0, 0.90, 0.96, 1.0),
        emission_strength=2.5,
    )

    # 1. Softly Rounded Architectural Deck (top z = 0.14m)
    add_standard_deck(col, mat_deck, mat_recess, mat_silver, mat_led, width=7.16, depth=5.16, corner_radius=0.55)

    # 2. Universal Rear Showcase Backing (Three.js z = -1.86m -> Blender y = +1.96m)
    add_universal_showcase_backing(col, mat_white, mat_recess, mat_silver, mat_led, recess_y=1.96)

    # Flowing curved rear architectural backdrop wall (layered white + pastel pink + sky blue organic arcs)
    add_rounded_rect_prism(col, "Rear_Organic_Wall", 6.96, 0.30, 3.22, 0.14, (0.0, 2.26, 1.75), mat_white, corner_segments=6, bevel_top_bottom=0.02)
    # Soft curved pastel-pink and sky-blue acoustic wave ribs flanking rear wall
    add_rounded_rect_prism(col, "Rear_Wing_Pink_L", 1.38, 0.38, 3.36, 0.18, (-2.84, 2.08, 1.82), mat_pink, corner_segments=8, bevel_top_bottom=0.02)
    add_rounded_rect_prism(col, "Rear_Wing_Blue_R", 1.38, 0.38, 3.36, 0.18, (+2.84, 2.08, 1.82), mat_blue, corner_segments=8, bevel_top_bottom=0.02)

    # 3. Recessed Arched Display Niches on Left & Right Wings
    for side, sx, accent in (("L", -2.84, mat_blue), ("R", +2.84, mat_pink)):
        add_box(col, f"Niche_{side}_Back", (0.94, 0.10, 2.18), (sx, 1.92, 1.72), mat_recess, bevel_width=0.01)
        add_extruded_arch_frame(
            col, f"Niche_{side}_ArchFrame",
            outer_w=1.18, outer_h=2.55, inner_w=0.90, inner_h=2.24,
            thickness_y=0.22, center=(sx, 1.82, 0.56), mat=mat_white, arch_segments=16, bevel_width=0.012
        )
        # 2 rounded organic display shelves per niche + under-shelf LED
        for idx, sz in enumerate((1.22, 1.88)):
            add_rounded_rect_prism(col, f"Niche_{side}_Shelf_{idx}", 0.88, 0.28, 0.04, 0.08, (sx, 1.82, sz), accent, corner_segments=5, bevel_top_bottom=0.006)
            add_box(col, f"Niche_{side}_LED_{idx}", (0.76, 0.02, 0.015), (sx, 1.88, sz - 0.025), mat_led, bevel_width=0.0)

    # 4. Multi-Layered Soft Arch Portals (defining Organic Flow's unique silhouette!)
    # Outer grand pastel-pink front arch
    add_extruded_arch_frame(
        col, "Portal_Arch_Front_Pink",
        outer_w=6.88, outer_h=4.18, inner_w=6.08, inner_h=3.68,
        thickness_y=0.26, center=(0.0, -1.88, 0.14), mat=mat_pink, arch_segments=26, bevel_width=0.018
    )
    # Recessed contour LED ribbon lining the front arch inner soffit
    add_extruded_arch_frame(
        col, "Portal_Arch_Front_LED",
        outer_w=6.12, outer_h=3.70, inner_w=6.02, inner_h=3.64,
        thickness_y=0.04, center=(0.0, -1.96, 0.14), mat=mat_led, arch_segments=24, bevel_width=0.0
    )
    # Mid-depth stepped crisp-white arch
    add_extruded_arch_frame(
        col, "Portal_Arch_Mid_White",
        outer_w=6.72, outer_h=4.04, inner_w=5.96, inner_h=3.58,
        thickness_y=0.22, center=(0.0, -0.58, 0.14), mat=mat_white, arch_segments=26, bevel_width=0.016
    )
    # Rear sky-blue arch framing the showcase zone
    add_extruded_arch_frame(
        col, "Portal_Arch_Rear_Blue",
        outer_w=6.60, outer_h=3.92, inner_w=5.88, inner_h=3.48,
        thickness_y=0.22, center=(0.0, +0.72, 0.14), mat=mat_blue, arch_segments=26, bevel_width=0.016
    )

    # Smooth longitudinal tie-rails linking the 3 arch portals overhead (structural continuity)
    for lx in (-2.55, +2.55):
        add_cylinder(
            col, f"Arch_TieRail_{lx:.2f}", 0.045, 2.75,
            (lx, -0.58, 3.25), mat_silver, segments=16, bevel_width=0.004,
            rot_euler=(math.pi * 0.5, 0.0, 0.0)
        )

    # Integrated Front Architectural Brand Sign Fascia (flush at Blender y = -2.14m -> Three.js z = +2.14m)
    add_rounded_rect_prism(col, "Header_Fascia_Body", 5.88, 0.24, 0.72, 0.12, (0.0, -2.02, 3.42), mat_white, corner_segments=6, bevel_top_bottom=0.015)
    add_rounded_rect_prism(col, "Header_Fascia_Rim", 5.94, 0.16, 0.78, 0.14, (0.0, -1.98, 3.42), mat_blue, corner_segments=6, bevel_top_bottom=0.01)

    # 5. Rounded Pill Reception Counter (front-left, pastel blue body + crisp white top + silver reveal)
    cx, cy = -1.18, -0.78
    add_rounded_rect_prism(col, "Counter_ToeKick", 2.02, 0.60, 0.10, 0.30, (cx, cy, 0.19), mat_recess, corner_segments=10, bevel_top_bottom=0.005)
    add_rounded_rect_prism(col, "Counter_Body", 2.18, 0.72, 0.74, 0.36, (cx, cy, 0.61), mat_blue, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "Counter_Band", 2.21, 0.74, 0.06, 0.37, (cx, cy, 0.42), mat_pink, corner_segments=12, bevel_top_bottom=0.006)
    add_rounded_rect_prism(col, "Counter_Top", 2.26, 0.78, 0.055, 0.39, (cx, cy, 1.01), mat_white, corner_segments=12, bevel_top_bottom=0.012)
    add_box(col, "Counter_LED", (1.44, 0.025, 0.018), (cx, cy - 0.36, 0.96), mat_led, bevel_width=0.0)

    # 6. Two Soft Rounded Organic Product Plinths (Universal)
    for pname, px, py, r, h, pmat in [
        ("Plinth_Pink", +0.86, -0.58, 0.33, 0.84, mat_pink),
        ("Plinth_Blue", -2.55, +0.32, 0.28, 0.96, mat_blue),
    ]:
        add_cylinder(col, f"{pname}_Base", r + 0.02, 0.07, (px, py, 0.175), mat_recess, segments=24, bevel_width=0.008)
        add_cylinder(col, f"{pname}_Body", r, h - 0.11, (px, py, 0.21 + (h - 0.11) * 0.5), pmat, segments=24, bevel_width=0.012)
        add_cylinder(col, f"{pname}_Top", r + 0.01, 0.045, (px, py, 0.14 + h - 0.01), mat_white, segments=24, bevel_width=0.01)

    optimize_and_join_by_material(col, "Booth02_OrganicFlow")
    stats = export_booth_glb(col, OUT_GLB)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_02_organic_flow")
    return stats


if __name__ == "__main__":
    build_organic_flow()
