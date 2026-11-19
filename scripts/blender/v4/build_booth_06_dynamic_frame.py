"""
BOOTH 06 — DYNAMIC FRAME (V4 Universal Premium Exhibition Booth)
Palette: Matte Graphite, Royal Architectural Violet, Brushed Champagne, Crisp Light Gray, Subtle Violet LED.
Archetype: Asymmetric intersecting architectural metal frames, protruding floating header frame,
cantilevered floating modular shelves, multi-layered geometric reception counter, restrained violet LED.
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
    add_rounded_rect_prism,
    add_standard_deck,
    add_universal_showcase_backing,
    optimize_and_join_by_material,
    export_booth_glb,
    setup_studio_render,
)

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_06_dynamic_frame_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_dynamic_frame():
    reset_scene()
    col = ensure_collection("Booth06_DynamicFrame")

    # PBR Material Palette (Graphite, Royal Violet, Brushed Champagne)
    mat_graphite = make_pbr_mat("Dynamic_Matte_Graphite", (0.14, 0.15, 0.18, 1.0), metallic=0.28, roughness=0.40)
    mat_violet = make_pbr_mat("Dynamic_Royal_Violet", (0.36, 0.22, 0.64, 1.0), metallic=0.15, roughness=0.36, coat_weight=0.15)
    mat_champagne = make_pbr_mat("Dynamic_Champagne_Metal", (0.82, 0.72, 0.54, 1.0), metallic=0.88, roughness=0.22)
    mat_stone = make_pbr_mat("Dynamic_Light_Basalt", (0.28, 0.30, 0.34, 1.0), metallic=0.05, roughness=0.36, coat_weight=0.14)
    mat_light = make_pbr_mat("Dynamic_Soft_Gray", (0.86, 0.87, 0.90, 1.0), metallic=0.0, roughness=0.38)
    mat_led = make_pbr_mat(
        "Dynamic_Subtle_Violet_LED",
        (0.84, 0.76, 1.0, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(0.66, 0.48, 0.98, 1.0),
        emission_strength=2.1,  # Restrained, refined violet glow
    )

    # 1. Sleek Basalt-Graphite Raised Deck with Champagne Edge & Subtle Violet Underglow
    add_standard_deck(col, mat_stone, mat_graphite, mat_champagne, mat_led, width=7.16, depth=5.16, corner_radius=0.10)
    # Geometric champagne floor inlay stripes
    add_box(col, "Floor_Champagne_L", (0.04, 4.30, 0.006), (-2.28, -0.05, 0.142), mat_champagne, bevel_width=0.0)
    add_box(col, "Floor_Champagne_R", (0.04, 4.30, 0.006), (+2.28, -0.05, 0.142), mat_champagne, bevel_width=0.0)

    # 2. Universal Rear Showcase Backing
    add_universal_showcase_backing(col, mat_graphite, mat_graphite, mat_champagne, mat_led, recess_y=1.96)

    # Multi-layered Rear Architectural Backdrop (Graphite main wall + asymmetric royal violet architectural fin)
    add_box(col, "Rear_Graphite_Wall", (7.02, 0.28, 3.44), (0.0, 2.26, 1.86), mat_graphite, bevel_width=0.016)
    add_box(col, "Rear_Violet_AccentPanel", (1.68, 0.32, 3.68), (-2.70, 2.18, 1.98), mat_violet, bevel_width=0.016)
    add_box(col, "Rear_Light_AccentPanel", (1.56, 0.32, 3.36), (+2.74, 2.18, 1.82), mat_light, bevel_width=0.016)

    # 3. Floating Cantilevered Modular Shelves (Left & Right Rear) with Subtle Violet Under-LED
    for side, sx, shelf_mat in (("L", -2.84, mat_light), ("R", +2.84, mat_graphite)):
        for idx, sz in enumerate((0.96, 1.62, 2.28)):
            offset_x = 0.08 * (idx % 2) * (1 if side == "L" else -1)
            add_box(col, f"FloatShelf_{side}_{idx}", (1.02, 0.36, 0.052), (sx + offset_x, 1.82, sz), shelf_mat, bevel_width=0.006)
            add_box(col, f"FloatShelf_{side}_Trim_{idx}", (1.02, 0.028, 0.054), (sx + offset_x, 1.64, sz), mat_champagne, bevel_width=0.004)
            add_box(col, f"FloatShelf_{side}_LED_{idx}", (0.88, 0.02, 0.014), (sx + offset_x, 1.92, sz - 0.03), mat_led, bevel_width=0.0)
        # Sleek lower floating credenza
        add_box(col, f"Credenza_{side}", (1.14, 0.44, 0.48), (sx, 1.84, 0.42), mat_graphite, bevel_width=0.012)
        add_box(col, f"Credenza_{side}_Top", (1.18, 0.48, 0.035), (sx, 1.82, 0.68), mat_champagne, bevel_width=0.005)

    # 4. Asymmetric Intersecting Architectural Metal Frames (Signature Silhouette!)
    # Frame A: Primary bold Graphite Cantilevered Portal (tilted dynamic upper spar rising left-to-right!)
    add_box(col, "FrameA_Pillar_L", (0.34, 0.46, 3.92), (-3.22, -1.78, 2.10), mat_graphite, bevel_width=0.015)
    add_box(col, "FrameA_Pillar_R", (0.28, 0.38, 3.62), (+3.22, -1.96, 1.95), mat_graphite, bevel_width=0.015)
    # Angled architectural crown beam sweeping across the top
    add_box(
        col, "FrameA_AngledTopBeam", (6.92, 0.38, 0.24), (0.0, -1.86, 3.98), mat_graphite,
        bevel_width=0.014, rot_euler=(0.0, math.radians(-3.2), 0.0)
    )
    add_box(col, "FrameA_Return_L", (0.28, 4.12, 0.24), (-3.22, +0.26, 4.02), mat_graphite, bevel_width=0.012)
    add_box(col, "FrameA_Return_R", (0.24, 4.18, 0.22), (+3.22, +0.16, 3.74), mat_graphite, bevel_width=0.012)

    # Frame B: Intersecting Champagne & Violet Offset Geometric Frame (shifted slightly forward & higher on right!)
    add_box(col, "FrameB_Champagne_Pillar_L", (0.14, 0.14, 3.74), (-2.68, -2.06, 2.01), mat_champagne, bevel_width=0.008)
    add_box(col, "FrameB_Champagne_Pillar_R", (0.14, 0.14, 4.08), (+2.92, -1.62, 2.18), mat_champagne, bevel_width=0.008)
    add_box(
        col, "FrameB_Champagne_TopBar", (6.24, 0.14, 0.14), (+0.12, -1.84, 4.16), mat_champagne,
        bevel_width=0.008, rot_euler=(0.0, math.radians(+2.8), 0.0)
    )
    # Diagonal architectural violet strut accentuating the asymmetric frame intersection on the left wing
    add_box(
        col, "FrameB_Violet_DiagStrut", (0.18, 0.18, 3.68), (-3.02, -0.45, 2.02), mat_violet,
        bevel_width=0.01, rot_euler=(math.radians(24.0), 0.0, 0.0)
    )
    add_box(col, "FrameB_Violet_SideFrame", (0.16, 2.90, 0.16), (-3.02, -0.35, 3.76), mat_violet, bevel_width=0.008)
    add_box(col, "FrameB_Violet_LED", (0.03, 2.60, 0.025), (-2.94, -0.35, 3.68), mat_led, bevel_width=0.0)

    # Protruding Floating Brand Header Box (Graphite + Champagne frame + subtle violet LED soffit)
    add_box(col, "Header_Float_Body", (6.24, 0.28, 0.72), (0.0, -2.08, 3.42), mat_graphite, bevel_width=0.016)
    add_box(col, "Header_Float_VioletBar", (6.30, 0.30, 0.06), (0.0, -2.08, 3.81), mat_violet, bevel_width=0.008)
    add_box(col, "Header_Float_ChampagneBot", (6.30, 0.30, 0.04), (0.0, -2.08, 3.04), mat_champagne, bevel_width=0.005)
    add_box(col, "Header_Float_LED", (5.80, 0.03, 0.02), (0.0, -2.08, 3.01), mat_led, bevel_width=0.0)

    # 5. Multi-Layered Geometric Reception Counter (Graphite core + staggered violet & light-gray cantilevered planes)
    cx, cy = -1.14, -0.80
    add_box(col, "Counter_Plinth", (2.14, 0.62, 0.10), (cx, cy, 0.19), mat_graphite, bevel_width=0.008)
    add_box(col, "Counter_Core", (2.26, 0.72, 0.74), (cx, cy, 0.61), mat_graphite, bevel_width=0.014)
    # Offset overlapping architectural front fascia layers
    add_box(col, "Counter_VioletLayer", (1.42, 0.09, 0.56), (cx - 0.36, cy - 0.38, 0.58), mat_violet, bevel_width=0.012)
    add_box(col, "Counter_LightLayer", (1.28, 0.12, 0.42), (cx + 0.44, cy - 0.40, 0.68), mat_light, bevel_width=0.012)
    add_box(col, "Counter_ChampagneTop", (2.36, 0.80, 0.055), (cx, cy, 1.015), mat_champagne, bevel_width=0.01)
    add_box(col, "Counter_LED", (1.94, 0.025, 0.02), (cx, cy - 0.36, 0.96), mat_led, bevel_width=0.0)

    # 6. Stepped Geometric Product Pedestal (front-center-right, clear of NPC)
    px, py = +0.94, -0.58
    add_box(col, "Pedestal_Base", (0.66, 0.66, 0.10), (px, py, 0.19), mat_graphite, bevel_width=0.008)
    add_box(col, "Pedestal_Body", (0.62, 0.62, 0.74), (px, py, 0.61), mat_graphite, bevel_width=0.012)
    add_box(col, "Pedestal_VioletSleeve", (0.66, 0.42, 0.44), (px, py - 0.12, 0.64), mat_violet, bevel_width=0.01)
    add_box(col, "Pedestal_Top", (0.68, 0.68, 0.04), (px, py, 1.00), mat_champagne, bevel_width=0.008)

    optimize_and_join_by_material(col, "Booth06_DynamicFrame")
    stats = export_booth_glb(col, OUT_GLB)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_06_dynamic_frame")
    return stats


if __name__ == "__main__":
    build_dynamic_frame()
