# Exterior continuation — 13 November 2026

Existing third-party assets retain the authors and licenses listed in CREDITS.md.
No existing GLB has been overwritten.

## Detailed city derivatives

`city_detail_v2_01.glb` through `city_detail_v2_04.glb`, and their `-lod.glb`
companions, are locally authored derivatives of the project's existing
`city_building_01..04.glb`. Those source buildings were made by
`FE/booth-modeling/scripts/generate_city_buildings.py`, already committed before
this session. No external artwork is added to these buildings.

Reproducible refinement: `FE/booth-modeling/scripts/refine_exterior_city.py`,
Blender 4.2 in background mode. Adds actual window jambs/mullions, side windows,
open balcony balusters, sloped roof geometry, awning valances and beveled edges.
Joins geometry into material groups and exports a decimated distant LOD.
The script refuses to overwrite existing output files.

The earlier `city_detail_01..04`, `city_final_01..04`, and `city_runtime_01..04`
candidates are retained under `qa-reports/graphics-continuation/rejected-models/`,
**not loaded or served by the application**. SHA-256 was checked before and after
moving these newly created candidates. The v2 fixes the third building's
side-window position and hipped roof and validates topology before export.

The glTF Transform optimization trial did not reduce triangles across hard
normal seams. The aggressive Blender decimation trial lost narrow balcony bars.
Neither trial was selected. Runtime uses the v2 detailed near mesh and its
separate approximately 48% triangle-count distant LOD.

## New planter and recycling bin

`planter_fluted_01.glb` (198232 bytes) and `recycling_bin_01.glb` (100680 bytes)
are original project artwork created by `create_exterior_props.py` in Blender.
No downloaded art or textures are included, and no third-party license applies
to these newly authored meshes. The planter uses a fluted revolved profile with
inner wall, recessed soil and individually curved leaf surfaces. The bin has
twenty separate shaped wooden staves, an inner liner, retaining band and rolled
open rim. Geometry is joined into material groups for instancing.

Existing Quaternius flowers retain their CC0 attribution. Their GLB bytes are
unchanged; runtime bounds increase from .5/.12/.5 to .55/.3/.55 metres.

## Fountain

The original Santo Spirito Fountain GLB by Don Carson (CC BY 3.0) is unchanged.
`exteriorStone.ts` adds a seeded procedural limestone height texture and
surface UVs at runtime; ExteriorAssets adjusts stone colors/roughness.
The source sculpted shape, origin normalization, water and visual envelope remain.
