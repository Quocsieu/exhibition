"""Add architectural geometry to the existing city artwork, never overwrite inputs.
Blender 4.2: blender --background --python <this file>
Outputs city_detail_v2_01..04 (+ LOD). No booth assets are read or written.
The first candidate city_detail_01..04 is retained, unused, for audit.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

DEST = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'exterior'

def box(name, size, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj

def material(name, rgb, rough=.7, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return mat

def roof(name, width, depth, bottom, top, inset, mat):
    verts = [(x*width/2,y*depth/2,bottom) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    verts += [(x*(width/2-inset), y*(depth/2-inset),top) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def bounds(obj):
    points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])

def refine(index):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(DEST / f'city_building_{index:02}.glb'))
    # Bake imported transforms before adding geometry in Blender Z-up coordinates.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()
    iron = material('Detail wrought iron', (.035,.045,.052), .38, .65)
    trim = material('Detail warm limestone', (.64,.59,.49), .8)
    glass = material('Detail recessed glass', (.055,.14,.18), .22, .12)
    wood = material('Detail oak joinery', (.18,.085,.028), .65)
    original = list(bpy.context.scene.objects)
    # Actual open rails replace solid balcony panels, preserving their dimensions.
    for obj in original:
        if 'BalconyFace' in obj.name or 'BalconySide' in obj.name or 'Juliette' in obj.name:
            low, high = bounds(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            along_x = high.x-low.x > high.y-low.y
            length = high.x-low.x if along_x else high.y-low.y
            count = max(3, int(length/.18))
            for n in range(count+1):
                p = (low+high)/2
                p.x = low.x+(high.x-low.x)*n/count if along_x else p.x
                p.y = low.y+(high.y-low.y)*n/count if not along_x else p.y
                box('Open balcony baluster',(.035,.035,high.z-low.z),p,iron)
            for z in [low.z,high.z]:
                size = (length,.045,.045) if along_x else (.045,length,.045)
                box('Balcony handrail',size,((low.x+high.x)/2,(low.y+high.y)/2,z),iron)
        elif any('Glass' in m.name for m in obj.data.materials) if obj.type == 'MESH' else False:
            low, high = bounds(obj)
            # Recessed pane sits ahead of the old solid frame slab, behind new jambs.
            obj.location.y -= .17
            obj.data.materials.clear()
            obj.data.materials.append(glass)
            w, h = high.x-low.x, high.z-low.z
            x, z = (low.x+high.x)/2, (low.z+high.z)/2
            y = low.y-.20
            for xx in [x-w/2,x+w/2]:
                box('Stone window jamb',(.075,.10,h+.12),(xx,y,z),trim)
            box('Window mullion',(.04,.08,h),(x,y-.025,z),wood)
            box('Window transom',(w,.08,.045),(x,y-.025,z+.15),wood)
        elif 'Awning_' in obj.name:
            obj.rotation_euler.x = math.radians(12)
            low,high = bounds(obj)
            box('Awning valance',(high.x-low.x,.055,.22),((low.x+high.x)/2,low.y,low.z),wood)

    # Replace flat roof bodies with sloped mesh roofs; keep dormers and cornices.
    for obj in list(bpy.context.scene.objects):
        if any(part in obj.name for part in ['MansardBody', 'RoofHipped', 'RoofRidge']):
            low,high = bounds(obj)
            mat = obj.data.materials[0]
            name = obj.name
            bpy.data.objects.remove(obj,do_unlink=True)
            roof(name+' sloped',high.x-low.x,high.y-low.y,low.z,high.z,.8,mat)

    # Detailed side elevations: six windows with projecting reveals per side.
    widths = {1:7.2,2:7.,3:7.4,4:7.8}
    w = widths[index]
    for side in [-1,1]:
        x = side*(w/2+.06)
        for y in [-1.65,1.65]:
            for z in [4.8,7.3]:
                box('Side recessed pane',(.08,1.05,1.55),(x,y,z),glass)
                for yy in [y-.56,y+.56]:
                    box('Side stone jamb',(.16,.09,1.7),(x,yy,z),trim)
                for zz in [z-.83,z+.83]:
                    box('Side stone sill',(.22,1.23,.10),(x,y,zz),trim)
                box('Side mullion',(.16,.04,1.55),(x,y,z),wood)

    # Highlight-catching edges replace perfectly sharp cubes. Join by material
    # at export: a few render primitives per building instead of one per object.
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH': continue
        bpy.context.view_layer.objects.active = obj
        bevel = obj.modifiers.new('Small masonry edge', 'BEVEL')
        bevel.width = .025
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = f'Exterior architecture detail {index}'
    obj.data.validate()
    bpy.ops.export_scene.gltf(filepath=str(DEST/f'city_detail_v2_{index:02}.glb'),export_format='GLB',export_copyright='Project-authored derivative of generate_city_buildings.py; refine_exterior_city.py; no external artwork.')
    decimate = obj.modifiers.new('Distant architecture', 'DECIMATE')
    decimate.ratio = .48
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.data.validate()
    bpy.ops.export_scene.gltf(filepath=str(DEST/f'city_detail_v2_{index:02}-lod.glb'),export_format='GLB',export_copyright='Project-authored architecture; simplified distant LOD.')

if __name__ == '__main__':
    for i in range(1,5):
        for suffix in ['', '-lod']:
            if (DEST/f'city_detail_v2_{i:02}{suffix}.glb').exists():
                raise RuntimeError('Refusing to overwrite an existing asset; choose a new version.')
    for i in range(1,5): refine(i)
