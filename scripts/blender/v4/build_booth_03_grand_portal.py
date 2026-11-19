"""
BOOTH 03 — GRAND PORTAL (V4 Universal Premium Exhibition Booth)
Palette: Deep Executive Navy, Crisp Architectural White, Brushed Silver Aluminum, Cool White LED.
Archetype: Monumental wide horizontal architectural portal frame, bold protruding brand fascia,
multi-layer vertical slatted panel walls, modular cantilevered display shelves, executive counter.
100% Universal (zero industry-specific geometry).
"""

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
OUT_GLB = os.path.join(REPO_ROOT, "FE", "public", "models", "booths", "v4", "booth_03_grand_portal_v4.glb")
QA_DIR = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a"


def build_grand_portal():
    reset_scene()
    col = ensure_collection("Booth03_GrandPortal")

    # PBR Material Palette (Executive Navy, Crisp White, Brushed Silver)
    mat_navy = make_pbr_mat("Portal_Executive_Navy", (0.09, 0.15, 0.26, 1.0), metallic=0.12, roughness=0.38)
    mat_white = make_pbr_mat("Portal_Crisp_White", (0.95, 0.96, 0.98, 1.0), metallic=0.0, roughness=0.35)
    mat_silver = make_pbr_mat("Portal_Brushed_Silver", (0.76, 0.80, 0.85, 1.0), metallic=0.88, roughness=0.22)
    mat_deck = make_pbr_mat("Portal_Light_Granite", (0.87, 0.89, 0.92, 1.0), metallic=0.0, roughness=0.30, coat_weight=0.18)
    mat_plinth = make_pbr_mat("Portal_Dark_Slate", (0.12, 0.14, 0.18, 1.0), metallic=0.35, roughness=0.45)
    mat_led = make_pbr_mat(
        "Portal_Cool_LED",
        (0.92, 0.97, 1.0, 1.0),
        metallic=0.0,
        roughness=0.2,
        emission_color=(0.86, 0.95, 1.0, 1.0),
        emission_strength=2.6,
    )

    # 1. Crisp Architectural Deck (top z = 0.14m)
    add_standard_deck(col, mat_deck, mat_plinth, mat_silver, mat_led, width=7.16, depth=5.16, corner_radius=0.12)
    # Recessed dark navy center runway inlay
    add_box(col, "Deck_Navy_Border_L", (0.08, 4.10, 0.008), (-2.18, -0.10, 0.142), mat_navy, bevel_width=0.0)
    add_box(col, "Deck_Navy_Border_R", (0.08, 4.10, 0.008), (+2.18, -0.10, 0.142), mat_navy, bevel_width=0.0)

    # 2. Universal Rear Showcase Backing
    add_universal_showcase_backing(col, mat_white, mat_navy, mat_silver, mat_led, recess_y=1.96)

    # Multi-layer Architectural Rear Panel Wall (navy core + crisp white stepped side bays + brushed silver fins)
    add_box(col, "Rear_Core_Wall", (7.06, 0.30, 3.55), (0.0, 2.26, 1.915), mat_navy, bevel_width=0.018)
    add_box(col, "Rear_Crown_Silver", (7.14, 0.38, 0.10), (0.0, 2.24, 3.74), mat_silver, bevel_width=0.01)

    # 3. Flanking Modular Display Bays with Vertical Architectural Slats & Cantilevered Shelves
    for side, sx in (("L", -2.84), ("R", +2.84)):
        add_box(col, f"Bay_{side}_Panel", (1.26, 0.24, 3.22), (sx, 2.02, 1.75), mat_white, bevel_width=0.015)
        # Architectural vertical navy louver fins along outer edge
        outer_x = sx + (-0.54 if side == "L" else +0.54)
        for fi in range(3):
            fx = outer_x + (fi * 0.09 if side == "L" else -fi * 0.09)
            add_box(col, f"Bay_{side}_Fin_{fi}", (0.035, 0.14, 3.05), (fx, 1.88, 1.72), mat_navy, bevel_width=0.005)
        # 3 Modular Cantilevered Display Shelves (crisp white + brushed silver front lip + cool LED)
        for idx, sz in enumerate((1.02, 1.68, 2.34)):
            add_box(col, f"Bay_{side}_Shelf_{idx}", (0.94, 0.36, 0.048), (sx + (0.10 if side == "L" else -0.10), 1.74, sz), mat_white, bevel_width=0.006)
            add_box(col, f"Bay_{side}_ShelfTrim_{idx}", (0.94, 0.03, 0.05), (sx + (0.10 if side == "L" else -0.10), 1.56, sz), mat_silver, bevel_width=0.004)
            add_box(col, f"Bay_{side}_ShelfLED_{idx}", (0.84, 0.02, 0.014), (sx + (0.10 if side == "L" else -0.10), 1.84, sz - 0.028), mat_led, bevel_width=0.0)
        # Lower modular storage cabinet under shelves
        add_box(col, f"Bay_{side}_Cabinet", (1.10, 0.44, 0.56), (sx, 1.82, 0.42), mat_navy, bevel_width=0.012)
        add_box(col, f"Bay_{side}_CabTop", (1.14, 0.48, 0.04), (sx, 1.80, 0.72), mat_silver, bevel_width=0.006)

    # 4. Monumental Horizontal Grand Portal Frame (Signature Silhouette!)
    # Thick architectural flanking portal piers (left & right front)
    for side, px in (("L", -3.18), ("R", +3.18)):
        add_box(col, f"Portal_Pier_{side}_Base", (0.58, 0.72, 0.18), (px, -1.85, 0.23), mat_plinth, bevel_width=0.012)
        add_box(col, f"Portal_Pier_{side}_Body", (0.52, 0.64, 3.68), (px, -1.85, 2.08), mat_navy, bevel_width=0.018)
        # Vertical silver reveal inlay & cool LED strip on pier face
        add_box(col, f"Portal_Pier_{side}_SilverInlay", (0.10, 0.66, 3.44), (px, -1.85, 2.06), mat_silver, bevel_width=0.008)
        add_box(col, f"Portal_Pier_{side}_LED", (0.025, 0.025, 3.20), (px + (0.265 if side == "L" else -0.265), -1.85, 2.04), mat_led, bevel_width=0.0)
        # Overhead deep cantilevered return beam connecting front pier back to rear wall
        add_box(col, f"Portal_ReturnBeam_{side}", (0.46, 4.18, 0.34), (px, +0.20, 3.75), mat_navy, bevel_width=0.015)
        add_box(col, f"Portal_ReturnTrim_{side}", (0.50, 4.22, 0.05), (px, +0.20, 3.94), mat_silver, bevel_width=0.006)

    # Grand Horizontal Cantilevered Fascia Header (bold protruding corporate marquee)
    add_box(col, "Portal_Header_Main", (7.12, 0.56, 0.84), (0.0, -1.94, 3.50), mat_navy, bevel_width=0.02)
    add_box(col, "Portal_Header_WhiteLayer", (6.54, 0.16, 0.74), (0.0, -2.18, 3.44), mat_white, bevel_width=0.014)
    add_box(col, "Portal_Header_SilverCrown", (7.22, 0.64, 0.075), (0.0, -1.94, 3.94), mat_silver, bevel_width=0.01)
    add_box(col, "Portal_Header_SoffitLED", (6.02, 0.04, 0.022), (0.0, -1.94, 3.07), mat_led, bevel_width=0.0)

    # 5. Executive Multi-Layer Reception Counter (front-left)
    cx, cy = -1.16, -0.78
    add_box(col, "Counter_Plinth", (2.18, 0.64, 0.10), (cx, cy, 0.19), mat_plinth, bevel_width=0.008)
    add_box(col, "Counter_NavyCore", (2.30, 0.72, 0.76), (cx, cy, 0.62), mat_navy, bevel_width=0.016)
    # Protruding crisp-white floating front apron with recessed cool LED reveal
    add_box(col, "Counter_WhiteApron", (2.06, 0.08, 0.54), (cx, cy - 0.38, 0.64), mat_white, bevel_width=0.012)
    add_box(col, "Counter_SilverStrip", (2.06, 0.04, 0.04), (cx, cy - 0.41, 0.93), mat_silver, bevel_width=0.005)
    add_box(col, "Counter_LED", (1.96, 0.025, 0.02), (cx, cy - 0.36, 0.35), mat_led, bevel_width=0.0)
    add_box(col, "Counter_TopSlab", (2.38, 0.80, 0.055), (cx, cy, 1.025), mat_white, bevel_width=0.012)

    # 6. Modular Geometric Product Display Pedestal (front-center-right, clear of NPC)
    px, py = +0.92, -0.58
    add_box(col, "Pedestal_Plinth", (0.64, 0.64, 0.10), (px, py, 0.19), mat_plinth, bevel_width=0.008)
    add_box(col, "Pedestal_Body", (0.72, 0.72, 0.72), (px, py, 0.60), mat_white, bevel_width=0.014)
    add_box(col, "Pedestal_SilverCollar", (0.74, 0.74, 0.04), (px, py, 0.94), mat_silver, bevel_width=0.006)
    add_box(col, "Pedestal_Top", (0.76, 0.76, 0.04), (px, py, 0.98), mat_navy, bevel_width=0.008)

    optimize_and_join_by_material(col, "Booth03_GrandPortal")
    stats = export_booth_glb(col, OUT_GLB)
    if "--no-render" not in sys.argv:
        setup_studio_render(QA_DIR, "v27_v4_03_grand_portal")
    return stats


if __name__ == "__main__":
    build_grand_portal()
