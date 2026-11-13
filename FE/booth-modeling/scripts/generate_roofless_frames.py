"""Original modular booth frames. Coordinates authored in Three.js metres (Y up).
Blender converts to Z up for export. No roof, overhead grid or ceiling meshes.
Refuses to overwrite outputs. Run Blender --background --python this_file.py.
"""
from pathlib import Path
import math
import bpy

DEST = Path(__file__).resolve().parents[2] / 'public/models/booths/roofless-v1'
THEMES = ['tech', 'living', 'coffee', 'robotics', 'design', 'energy']
COLORS = {'tech': ('#354454', '#5096ad'), 'living': ('#b8946a', '#ddd1b9'),
          'coffee': ('#70503b', '#ba8b56'), 'robotics': ('#424953', '#857eaa'),
          'design': ('#ded7d3', '#ad7d95'), 'energy': ('#d3ded8', '#669d8c')}

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def material(name, color, rough, metal=0):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*[linear(int(color[i:i+2], 16)/255) for i in (1,3,5)], 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return mat

def box(name, pos, size, mat, bevel=.008):
    x,y,z = pos; w,h,d = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-z,y))
    obj = bpy.context.object; obj.name = name; obj.dimensions = (w,d,h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL'); mod.width = bevel; mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def bolt(pos, mat):
    x,y,z = pos
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.025, depth=.018, location=(x,-z,y), rotation=(math.pi/2,0,0))
    obj=bpy.context.object; obj.name='Hex socket fastener'; obj.data.materials.append(mat)

def build(theme):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    warm=theme in ('living','coffee')
    structure=material('Timber' if warm else 'Powder coated frame', COLORS[theme][0], .64 if warm else .43, .02 if warm else .58)
    accent=material('Theme finish', COLORS[theme][1], .58, .15)
    metal=material('Brushed aluminium', '#a4adb2', .39, .8)
    dark=material('Recess and end caps', '#293139', .72, .08)
    for x in [-2.22,2.22]:
        box('Rear modular upright', (x,1.81,-1.65), (.12,2.98,.12), structure)
        box('Levelling foot', (x,.35,-1.65), (.3,.06,.3), metal)
        for y in [.52,1.82,3.14]:
            box('Connector plate', (x,y,-1.575), (.16,.12,.025), metal)
            for dx in [-.045,.045]: bolt((x+dx,y,-1.552), dark)
        box('Profile inset', (x,1.84,-1.58), (.028,2.45,.008), dark, .002)
    box('Backdrop top rail', (0,3.27,-1.65), (4.56,.12,.12), structure)
    # Short brackets support the unchanged front header from the existing front columns.
    # Only the sign perimeter has a horizontal connection; the product area is uncovered.
    for x in [-3.28,3.28]:
        box('Header mounting arm', (x,3.55,2.67), (.10,.10,1.32), metal)
        box('Header end bracket', (x,3.48,3.30), (.18,.24,.08), structure)
        bolt((x,3.48,3.35), dark)
        if theme=='design':
            box('Gallery sign upright', (x,1.89,2.02), (.12,3.22,.12), structure)
            box('Gallery sign foot', (x,.35,2.02), (.3,.06,.3), metal)
    # Low-profile task lights attached to the backdrop, never suspended across the ceiling.
    for x in [-1.65,1.65]:
        box('Display light bracket', (x,3.16,-1.52), (.045,.14,.22), metal)
        box('Display light housing', (x,3.15,-1.38), (.24,.075,.10), dark)
        box('Frosted lens', (x,3.11,-1.38), (.19,.008,.07), accent, .002)

    if theme=='tech':
        for side in [-1,1]:
            box('Service column', (side*2.15,1.65,-1.7), (.36,2.5,.12), structure)
            for j in range(7): box('Vent slot', (side*2.15,.7+j*.12,-1.629), (.23,.025,.012), dark, .002)
            box('Restrained cyan inlay', (side*2.15,2.5,-1.63), (.025,.55,.012), accent, .002)
    elif theme=='living':
        for side in [-1,1]:
            for j in range(5): box('Vertical oak slat', (side*(1.78+j*.11),1.65,-1.77), (.055,2.5,.08), structure)
            for y in [.43,2.87]: box('Slat mounting strip', (side*2, y,-1.81), (.55,.07,.08), dark)
    elif theme=='coffee':
        for side in [-1,1]:
            for j in range(6): box('Craft timber panel', (side*2.14,.68+j*.34,-1.72), (.4,.28,.08), structure)
            box('Brass edge', (side*1.9,1.55,-1.67), (.028,2.15,.025), accent, .003)
    elif theme=='robotics':
        for side in [-1,1]:
            box('Industrial service panel', (side*2.14,1.65,-1.72), (.4,2.5,.10), structure)
            for j in range(8):
                box('Equipment mount rail', (side*2.14,.65+j*.27,-1.65), (.32,.055,.05), metal)
                bolt((side*2.14,.65+j*.27,-1.61), dark)
    elif theme=='design':
        for side in [-1,1]:
            for j in range(3): box('Gallery relief panel', (side*(1.88+j*.12),1.6+j*.06,-1.72), (.075,2.35-j*.2,.10), accent if j==1 else structure, .025)
    else:
        cell=material('Vertical photovoltaic sample', '#284957', .34, .4)
        for side in [-1,1]:
            box('PV sample frame', (side*2.14,1.65,-1.72), (.42,2.35,.08), metal)
            for row in range(8):
                for col in range(2): box('PV sample cell', (side*2.14-.095+col*.19,.65+row*.28,-1.67), (.17,.25,.018), cell, .002)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.object.join(); obj=bpy.context.object; obj.name='Roofless modular frame '+theme
    obj.data.validate()
    bpy.ops.export_scene.gltf(filepath=str(DEST/(theme+'.glb')), export_format='GLB', export_copyright='Original project artwork; generate_roofless_frames.py; no external assets.')

DEST.mkdir(parents=True,exist_ok=True)
for theme in THEMES:
    if (DEST/(theme+'.glb')).exists(): raise RuntimeError('Refusing to overwrite existing asset: '+theme)
for theme in THEMES: build(theme)
