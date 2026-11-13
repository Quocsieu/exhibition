# Roofless modular exhibition frames

Original project artwork, authored in Blender 4.2 by `FE/booth-modeling/scripts/generate_roofless_frames.py`; no external assets. Units: metres, glTF Y up. Six themes follow the existing theme resolver, with no business names or product data embedded.

Each GLB contains only the vertical architectural kit and short header brackets. The application retains its existing floor, dynamic brand signs, counters, shelves and product slots. All parts are joined for 4–5 material primitives per theme. No roof, canopy, overhead solar panels, ceiling, lamps spanning the product area, animation or embedded texture payloads.

Runtime: `RooflessBoothShell.tsx`, `roofless-glb:<theme>` scene markers. Failed loading uses the roofless TypeScript fallback. Generator refuses to overwrite assets; use a new version directory for later revisions. Existing booth GLBs are not modified.
