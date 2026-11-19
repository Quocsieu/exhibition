"""
Master batch builder for all 6 V27 Universal Premium Booths V4.
Exports all 6 GLBs to FE/public/models/booths/v4/ and renders 1 clean 3/4 + front studio QA
check for every booth (fast mode), saving exact geometry telemetry to v4_booths_manifest.json.
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from build_booth_01_signature_ring import build_signature_ring
from build_booth_02_organic_flow import build_organic_flow
from build_booth_03_grand_portal import build_grand_portal
from build_booth_04_wave_pavilion import build_wave_pavilion
from build_booth_05_gallery_arch import build_gallery_arch
from build_booth_06_dynamic_frame import build_dynamic_frame

MANIFEST_OUT = r"C:\Users\QUOC SIEU\.gemini\antigravity\brain\4a94e89e-9cea-4290-b8a0-b3713476862a\scratch\v27_grand_expo\v4_booths_manifest.json"


def main():
    builders = [
        ("booth_01_signature_ring", "booth-nordic-living", "living", build_signature_ring),
        ("booth_02_organic_flow", "booth-lumina-design", "design", build_organic_flow),
        ("booth_03_grand_portal", "booth-aether-tech", "tech", build_grand_portal),
        ("booth_04_wave_pavilion", "booth-solaris-energy", "energy", build_wave_pavilion),
        ("booth_05_gallery_arch", "booth-ecovita-craft", "coffee", build_gallery_arch),
        ("booth_06_dynamic_frame", "booth-kinetix-robotics", "robotics", build_dynamic_frame),
    ]
    results = []
    for slug, booth_id, theme, fn in builders:
        stats = fn()
        results.append({
            "slug": slug,
            "boothId": booth_id,
            "theme": theme,
            **stats,
        })

    os.makedirs(os.path.dirname(MANIFEST_OUT), exist_ok=True)
    with open(MANIFEST_OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("[V4 ALL BOOTHS COMPLETE]", MANIFEST_OUT)


if __name__ == "__main__":
    main()
