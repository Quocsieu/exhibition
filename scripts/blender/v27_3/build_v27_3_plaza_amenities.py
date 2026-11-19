"""
V27.3 Phases 3, 4, 5 — Grand Expo Outdoor Plaza Architectural Amenities (Blender 4.2.16 LTS)
Exports modular, beveled PBR GLB sets to FE/public/models/plaza/v27_3/ (all joined by material
for minimal draw calls and 55-60 FPS compatibility):
  1. welcome_desk_v27_3.glb        — Curved Welcome / Information Desk + Overhead Light Arch
  2. mini_cafe_corner_v27_3.glb    — Decorative Minimalist Café Bar + Bistro Tables & Chairs + Planters
  3. rest_lounge_v27_3.glb         — Sculptural Oak/Graphite Benches + Coffee Tables + Armchairs + Bollards + Planters
  4. checkin_stage_v27_3.glb       — Grand Expo World Check-In Photo Backdrop Stage + Stepped Podium + Planters
  5. digital_totem_v27_3.glb       — Slim Brushed-Aluminum Digital Signage Monolith
"""

import json
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
V4_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "v4"))
if V4_DIR not in sys.path:
    sys.path.insert(0, V4_DIR)
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
    add_extruded_arch_frame,
    optimize_and_join_by_material,
    export_booth_glb,
)
from build_v27_3_booths import add_modern_chair, add_round_table

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "FE", "public", "models", "plaza", "v27_3")
MANIFEST_OUT = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v27_3_plaza_manifest.json"


def add_architectural_planter(col, prefix, cx, cy, z0, w, d, h, mat_pot, mat_soil, mat_foliage, mat_trim):
    """Refined architectural rectangular stone planter with smooth layered organic foliage spheres (non-blocky)."""
    add_rounded_rect_prism(col, f"{prefix}_Pot", w, d, h, 0.08, (cx, cy, z0 + h * 0.5), mat_pot, corner_segments=5, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, f"{prefix}_Trim", w + 0.03, d + 0.03, 0.03, 0.09, (cx, cy, z0 + h - 0.015), mat_trim, corner_segments=5, bevel_top_bottom=0.004)
    add_rounded_rect_prism(col, f"{prefix}_Soil", w - 0.12, d - 0.12, 0.04, 0.05, (cx, cy, z0 + h - 0.03), mat_soil, corner_segments=4, bevel_top_bottom=0.004)
    # Sculpted rounded topiary clusters (smooth high-segment cylinders/domes — clean stylized realism!)
    n_clusters = max(2, int(w / 0.55))
    for i in range(n_clusters):
        fx = cx - (w * 0.34) + (w * 0.68) * (i / max(1, n_clusters - 1))
        r = 0.22 + (i % 2) * 0.04
        add_cylinder(col, f"{prefix}_Bush_{i}", r, r * 1.15, (fx, cy, z0 + h + r * 0.52), mat_foliage, segments=16, bevel_width=r * 0.35)


def build_welcome_desk():
    reset_scene()
    col = ensure_collection("V273_WelcomeDesk")
    mat_graphite = make_pbr_mat("Plaza_Graphite", (0.14, 0.17, 0.22, 1.0), metallic=0.35, roughness=0.40)
    mat_cream = make_pbr_mat("Plaza_Marble_Cream", (0.95, 0.93, 0.89, 1.0), metallic=0.0, roughness=0.28, coat_weight=0.22)
    mat_champagne = make_pbr_mat("Plaza_Champagne", (0.83, 0.72, 0.52, 1.0), metallic=0.86, roughness=0.24)
    mat_oak = make_pbr_mat("Plaza_Warm_Oak", (0.74, 0.58, 0.40, 1.0), metallic=0.0, roughness=0.48)
    mat_led = make_pbr_mat("Plaza_Warm_LED", (1.0, 0.97, 0.90, 1.0), emission_color=(1.0, 0.95, 0.84, 1.0), emission_strength=2.5)

    # Low stone carpet pad
    add_rounded_rect_prism(col, "Pad", 3.60, 2.20, 0.04, 0.28, (0.0, 0.0, 0.02), mat_graphite, corner_segments=6, bevel_top_bottom=0.006)
    # Sculpted curved reception desk
    add_rounded_rect_prism(col, "Desk_Kick", 2.48, 0.72, 0.10, 0.34, (0.0, -0.25, 0.09), mat_graphite, corner_segments=10, bevel_top_bottom=0.005)
    add_rounded_rect_prism(col, "Desk_Body", 2.66, 0.84, 0.82, 0.40, (0.0, -0.25, 0.55), mat_cream, corner_segments=12, bevel_top_bottom=0.014)
    add_rounded_rect_prism(col, "Desk_Top", 2.76, 0.92, 0.06, 0.42, (0.0, -0.25, 0.99), mat_champagne, corner_segments=12, bevel_top_bottom=0.01)
    for fx in (-0.90, -0.60, -0.30, 0.0, 0.30, 0.60, 0.90):
        add_box(col, f"Desk_Rib_{fx:.2f}", (0.04, 0.03, 0.72), (fx, -0.68, 0.54), mat_oak, bevel_width=0.006)
    add_box(col, "Desk_LED", (2.00, 0.025, 0.02), (0.0, -0.66, 0.94), mat_led, bevel_width=0.0)

    # Overhead architectural Welcome Arch Frame behind desk (z up to 3.15m)
    add_box(col, "Arch_Col_L", (0.18, 0.24, 2.86), (-1.45, +0.45, 1.47), mat_graphite, bevel_width=0.012)
    add_box(col, "Arch_Col_R", (0.18, 0.24, 2.86), (+1.45, +0.45, 1.47), mat_graphite, bevel_width=0.012)
    add_box(col, "Arch_Beam", (3.18, 0.28, 0.54), (0.0, +0.45, 2.88), mat_graphite, bevel_width=0.016)
    add_box(col, "Arch_Beam_Trim", (3.24, 0.32, 0.045), (0.0, +0.45, 3.17), mat_champagne, bevel_width=0.006)
    add_box(col, "Arch_LED", (2.76, 0.03, 0.025), (0.0, +0.45, 2.60), mat_led, bevel_width=0.0)

    optimize_and_join_by_material(col, "V273_WelcomeDesk")
    return export_booth_glb(col, os.path.join(OUT_DIR, "welcome_desk_v27_3.glb"))


def build_mini_cafe_corner():
    reset_scene()
    col = ensure_collection("V273_MiniCafeCorner")
    mat_graphite = make_pbr_mat("Cafe_Graphite", (0.15, 0.16, 0.19, 1.0), metallic=0.32, roughness=0.42)
    mat_wood = make_pbr_mat("Cafe_Warm_Oak", (0.72, 0.54, 0.36, 1.0), metallic=0.0, roughness=0.46)
    mat_cream = make_pbr_mat("Cafe_Cream_Stone", (0.95, 0.92, 0.87, 1.0), metallic=0.0, roughness=0.32, coat_weight=0.16)
    mat_brass = make_pbr_mat("Cafe_Brass", (0.82, 0.68, 0.45, 1.0), metallic=0.85, roughness=0.25)
    mat_soil = make_pbr_mat("Cafe_Soil", (0.18, 0.14, 0.11, 1.0), metallic=0.0, roughness=0.88)
    mat_foliage = make_pbr_mat("Cafe_Foliage", (0.16, 0.44, 0.28, 1.0), metallic=0.0, roughness=0.52)
    mat_led = make_pbr_mat("Cafe_Warm_LED", (1.0, 0.94, 0.80, 1.0), emission_color=(1.0, 0.90, 0.72, 1.0), emission_strength=2.4)

    # Café terrace wood-stone deck (5.6m x 4.4m)
    add_rounded_rect_prism(col, "Cafe_Deck", 5.60, 4.40, 0.06, 0.26, (0.0, 0.0, 0.03), mat_cream, corner_segments=6, bevel_top_bottom=0.01)
    # Mini Espresso Bar Counter (rear side of terrace)
    add_rounded_rect_prism(col, "Bar_Kick", 2.74, 0.68, 0.10, 0.12, (0.0, +1.35, 0.11), mat_graphite, corner_segments=6, bevel_top_bottom=0.005)
    add_rounded_rect_prism(col, "Bar_Body", 2.86, 0.78, 0.86, 0.14, (0.0, +1.35, 0.59), mat_wood, corner_segments=6, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, "Bar_Top", 2.98, 0.88, 0.06, 0.16, (0.0, +1.35, 1.05), mat_cream, corner_segments=6, bevel_top_bottom=0.01)
    add_box(col, "Bar_LED", (2.40, 0.03, 0.02), (0.0, +0.94, 1.00), mat_led, bevel_width=0.0)
    # Decorative minimalist espresso machine silhouette + cup stack on counter
    add_rounded_rect_prism(col, "Espresso_Machine", 0.56, 0.40, 0.42, 0.05, (-0.55, +1.35, 1.29), mat_graphite, corner_segments=4, bevel_top_bottom=0.008)
    add_box(col, "Espresso_Trim", (0.52, 0.04, 0.08), (-0.55, +1.14, 1.42), mat_brass, bevel_width=0.004)
    # Slim pergola canopy frame over mini café bar (open-top slats!)
    for sx in (-1.52, +1.52):
        add_box(col, f"Canopy_Col_{sx:.2f}", (0.14, 0.14, 2.75), (sx, +1.72, 1.44), mat_graphite, bevel_width=0.008)
    add_box(col, "Canopy_Header", (3.26, 0.24, 0.44), (0.0, +1.72, 2.72), mat_graphite, bevel_width=0.012)
    add_box(col, "Canopy_BrassLine", (3.30, 0.26, 0.04), (0.0, +1.72, 2.96), mat_brass, bevel_width=0.005)
    # 2 Round Bistro Tables + 4 Modern Café Chairs
    for idx, (tx, ty) in enumerate(((-1.35, -0.75), (+1.35, -0.75))):
        add_round_table(col, f"Bistro_{idx}", tx, ty, 0.06, 0.44, 0.74, mat_cream, mat_graphite)
        add_modern_chair(col, f"Bistro_{idx}_C1", tx - 0.66, ty, 0.06, -math.pi * 0.5, mat_wood, mat_graphite)
        add_modern_chair(col, f"Bistro_{idx}_C2", tx + 0.66, ty, 0.06, +math.pi * 0.5, mat_wood, mat_graphite)
    # Flanking Low Architectural Planters
    add_architectural_planter(col, "Cafe_Planter_L", -2.35, +1.35, 0.06, 0.85, 0.48, 0.52, mat_graphite, mat_soil, mat_foliage, mat_brass)
    add_architectural_planter(col, "Cafe_Planter_R", +2.35, +1.35, 0.06, 0.85, 0.48, 0.52, mat_graphite, mat_soil, mat_foliage, mat_brass)

    optimize_and_join_by_material(col, "V273_MiniCafeCorner")
    return export_booth_glb(col, os.path.join(OUT_DIR, "mini_cafe_corner_v27_3.glb"))


def build_rest_lounge():
    reset_scene()
    col = ensure_collection("V273_RestLounge")
    mat_graphite = make_pbr_mat("Rest_Graphite", (0.15, 0.17, 0.21, 1.0), metallic=0.32, roughness=0.42)
    mat_oak = make_pbr_mat("Rest_Warm_Oak", (0.75, 0.59, 0.42, 1.0), metallic=0.0, roughness=0.48)
    mat_stone = make_pbr_mat("Rest_Light_Stone", (0.91, 0.90, 0.87, 1.0), metallic=0.0, roughness=0.36)
    mat_champagne = make_pbr_mat("Rest_Champagne", (0.82, 0.70, 0.50, 1.0), metallic=0.84, roughness=0.25)
    mat_soil = make_pbr_mat("Rest_Soil", (0.18, 0.14, 0.11, 1.0), metallic=0.0, roughness=0.88)
    mat_foliage = make_pbr_mat("Rest_Foliage", (0.17, 0.45, 0.29, 1.0), metallic=0.0, roughness=0.52)
    mat_led = make_pbr_mat("Rest_Warm_LED", (1.0, 0.94, 0.82, 1.0), emission_color=(1.0, 0.90, 0.74, 1.0), emission_strength=2.5)

    # Low stone lounge island (5.4m x 4.2m)
    add_rounded_rect_prism(col, "Rest_Pad", 5.40, 4.20, 0.05, 0.28, (0.0, 0.0, 0.025), mat_stone, corner_segments=6, bevel_top_bottom=0.008)
    # 2 Sculptural Oak & Graphite Gallery Benches
    for idx, (bx, by) in enumerate(((-1.25, +1.05), (+1.25, +1.05))):
        add_box(col, f"Bench_{idx}_LegL", (0.12, 0.54, 0.40), (bx - 0.72, by, 0.25), mat_graphite, bevel_width=0.008)
        add_box(col, f"Bench_{idx}_LegR", (0.12, 0.54, 0.40), (bx + 0.72, by, 0.25), mat_graphite, bevel_width=0.008)
        add_rounded_rect_prism(col, f"Bench_{idx}_Seat", 1.84, 0.60, 0.08, 0.06, (bx, by, 0.48), mat_oak, corner_segments=4, bevel_top_bottom=0.01)
    # 2 Low Lounge Coffee Tables + 2 Modern Armchairs facing benches
    add_round_table(col, "Rest_CoffeeA", -1.25, -0.35, 0.05, 0.40, 0.46, mat_stone, mat_champagne)
    add_round_table(col, "Rest_CoffeeB", +1.25, -0.35, 0.05, 0.40, 0.46, mat_stone, mat_champagne)
    add_modern_chair(col, "Rest_ChairA", -1.25, -1.25, 0.05, 0.0, mat_oak, mat_graphite)
    add_modern_chair(col, "Rest_ChairB", +1.25, -1.25, 0.05, 0.0, mat_oak, mat_graphite)
    # Architectural Waste Bin + 2 Warm Bollard Lights
    add_cylinder(col, "Bin_Body", 0.19, 0.68, (+2.32, +1.35, 0.39), mat_graphite, segments=18, bevel_width=0.01)
    add_cylinder(col, "Bin_Rim", 0.20, 0.035, (+2.32, +1.35, 0.73), mat_champagne, segments=18, bevel_width=0.005)
    for idx, (lx, ly) in enumerate(((-2.35, -1.65), (+2.35, -1.65))):
        add_cylinder(col, f"Bollard_{idx}_Post", 0.065, 0.78, (lx, ly, 0.44), mat_graphite, segments=14, bevel_width=0.006)
        add_cylinder(col, f"Bollard_{idx}_Glow", 0.062, 0.12, (lx, ly, 0.74), mat_led, segments=14, bevel_width=0.004)
    # Rear Architectural Planter Backdrop
    add_architectural_planter(col, "Rest_Planter_Mid", 0.0, +1.72, 0.05, 2.80, 0.48, 0.56, mat_graphite, mat_soil, mat_foliage, mat_champagne)

    optimize_and_join_by_material(col, "V273_RestLounge")
    return export_booth_glb(col, os.path.join(OUT_DIR, "rest_lounge_v27_3.glb"))


def build_checkin_stage():
    reset_scene()
    col = ensure_collection("V273_CheckInStage")
    mat_graphite = make_pbr_mat("CheckIn_Graphite", (0.12, 0.15, 0.21, 1.0), metallic=0.35, roughness=0.38)
    mat_cream = make_pbr_mat("CheckIn_Cream", (0.95, 0.93, 0.89, 1.0), metallic=0.0, roughness=0.34, coat_weight=0.16)
    mat_champagne = make_pbr_mat("CheckIn_Champagne", (0.84, 0.72, 0.50, 1.0), metallic=0.88, roughness=0.22)
    mat_soil = make_pbr_mat("CheckIn_Soil", (0.18, 0.14, 0.11, 1.0), metallic=0.0, roughness=0.88)
    mat_foliage = make_pbr_mat("CheckIn_Foliage", (0.16, 0.44, 0.28, 1.0), metallic=0.0, roughness=0.52)
    mat_led = make_pbr_mat("CheckIn_Cyan_LED", (0.82, 0.95, 1.0, 1.0), emission_color=(0.35, 0.82, 1.0, 1.0), emission_strength=2.6)

    # Stepped Photo Stage Podium (5.8m x 2.2m)
    add_rounded_rect_prism(col, "Stage_Step1", 5.80, 2.20, 0.08, 0.18, (0.0, 0.0, 0.04), mat_graphite, corner_segments=6, bevel_top_bottom=0.008)
    add_rounded_rect_prism(col, "Stage_Step2", 5.20, 1.70, 0.08, 0.14, (0.0, +0.12, 0.12), mat_cream, corner_segments=6, bevel_top_bottom=0.008)
    # Monumental Check-In Backdrop Wall + Champagne Arch Trim
    add_box(col, "Backdrop_Core", (4.80, 0.24, 3.10), (0.0, +0.72, 1.71), mat_graphite, bevel_width=0.016)
    add_box(col, "Backdrop_Crown", (5.04, 0.34, 0.12), (0.0, +0.72, 3.30), mat_champagne, bevel_width=0.012)
    add_box(col, "Backdrop_SideL", (0.18, 0.34, 3.16), (-2.46, +0.72, 1.72), mat_champagne, bevel_width=0.01)
    add_box(col, "Backdrop_SideR", (0.18, 0.34, 3.16), (+2.46, +0.72, 1.72), mat_champagne, bevel_width=0.01)
    add_box(col, "Backdrop_LED_Top", (4.50, 0.04, 0.03), (0.0, +0.58, 3.22), mat_led, bevel_width=0.0)
    add_box(col, "Backdrop_LED_Bot", (4.50, 0.04, 0.03), (0.0, +0.58, 0.20), mat_led, bevel_width=0.0)
    # Flanking Architectural Planters
    add_architectural_planter(col, "CheckIn_Planter_L", -2.95, +0.45, 0.0, 0.72, 0.56, 0.58, mat_graphite, mat_soil, mat_foliage, mat_champagne)
    add_architectural_planter(col, "CheckIn_Planter_R", +2.95, +0.45, 0.0, 0.72, 0.56, 0.58, mat_graphite, mat_soil, mat_foliage, mat_champagne)

    optimize_and_join_by_material(col, "V273_CheckInStage")
    return export_booth_glb(col, os.path.join(OUT_DIR, "checkin_stage_v27_3.glb"))


def build_digital_totem():
    reset_scene()
    col = ensure_collection("V273_DigitalTotem")
    mat_graphite = make_pbr_mat("Totem_Graphite", (0.13, 0.16, 0.21, 1.0), metallic=0.40, roughness=0.36)
    mat_alu = make_pbr_mat("Totem_Brushed_Alu", (0.78, 0.82, 0.86, 1.0), metallic=0.88, roughness=0.22)
    mat_led = make_pbr_mat("Totem_Cyan_LED", (0.75, 0.94, 1.0, 1.0), emission_color=(0.30, 0.80, 1.0, 1.0), emission_strength=2.5)

    add_rounded_rect_prism(col, "Totem_Plinth", 1.12, 0.52, 0.14, 0.08, (0.0, 0.0, 0.07), mat_graphite, corner_segments=5, bevel_top_bottom=0.01)
    add_rounded_rect_prism(col, "Totem_Body", 0.96, 0.22, 2.52, 0.06, (0.0, 0.0, 1.40), mat_graphite, corner_segments=5, bevel_top_bottom=0.012)
    add_rounded_rect_prism(col, "Totem_Frame", 1.02, 0.16, 2.58, 0.07, (0.0, 0.0, 1.40), mat_alu, corner_segments=5, bevel_top_bottom=0.008)
    add_box(col, "Totem_TopLED", (0.86, 0.24, 0.03), (0.0, 0.0, 2.68), mat_led, bevel_width=0.0)

    optimize_and_join_by_material(col, "V273_DigitalTotem")
    return export_booth_glb(col, os.path.join(OUT_DIR, "digital_totem_v27_3.glb"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    results = [
        {"slug": "welcome_desk_v27_3", **build_welcome_desk()},
        {"slug": "mini_cafe_corner_v27_3", **build_mini_cafe_corner()},
        {"slug": "rest_lounge_v27_3", **build_rest_lounge()},
        {"slug": "checkin_stage_v27_3", **build_checkin_stage()},
        {"slug": "digital_totem_v27_3", **build_digital_totem()},
    ]
    os.makedirs(os.path.dirname(MANIFEST_OUT), exist_ok=True)
    with open(MANIFEST_OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("[V27.3 ALL 5 PLAZA AMENITIES COMPLETE]", MANIFEST_OUT)


if __name__ == "__main__":
    main()
