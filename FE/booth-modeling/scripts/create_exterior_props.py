"""Original exterior artwork: fluted stone planter and slatted recycling bin.
Blender background, metres / Z up. Refuses to overwrite existing GLBs.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector
DEST=Path(__file__).resolve().parents[2]/'public'/'models'/'exterior'

def mat(name,color,rough=.75,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Roughness'].default_value=rough
    s.inputs['Metallic'].default_value=metal
    return m

def mesh(name,vertices,faces,material):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(material)
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    return obj

def turned(name,profile,material,flute=0,segments=48):
    vertices=[];faces=[]
    for j,(radius,z) in enumerate(profile):
        for i in range(segments):
            a=i*2*math.pi/segments
            r=radius+flute*math.cos(a*16)*math.sin(math.pi*j/(len(profile)-1))**2
            vertices.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    return mesh(name,vertices,faces,material)

def leaf(origin,angle,length,width,material):
    verts=[]
    for i in range(9):
        t=i/8
        center=Vector(origin)+Vector((math.cos(angle)*length*t*.6,math.sin(angle)*length*t*.6,length*math.sin(t*math.pi*.72)))
        spread=width*math.sin(math.pi*t)
        for side in [-1,0,1]:
            v=center+Vector((-math.sin(angle)*spread*side,math.cos(angle)*spread*side,-abs(side)*.025*math.sin(math.pi*t)))
            verts.append(v)
    faces=[]
    for i in range(8):
        for j in range(2):
            a=i*3+j;faces.append((a,a+1,a+4,a+3))
    obj=mesh('Curved veined leaf',verts,faces,material)
    solid=obj.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.003
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=solid.name)

def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    bpy.ops.object.join();bpy.context.object.data.validate()
    bpy.ops.export_scene.gltf(filepath=str(DEST/(name+'.glb')),export_format='GLB',export_copyright='Original project artwork; create_exterior_props.py; authored in Blender, no external assets.')

def planter():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stone=mat('Carved limestone',(.60,.55,.45));soil=mat('Potting soil',(.055,.025,.012),.98)
    green=mat('Laurel foliage',(.035,.19,.075),.85);light=mat('Young foliage',(.12,.31,.08),.8)
    turned('Fluted vase with inner wall',[(.28,0),(.31,.035),(.31,.09),(.24,.13),(.22,.20),(.25,.28),(.33,.38),(.40,.50),(.43,.60),(.46,.63),(.46,.69),(.40,.72),(.37,.68),(.36,.61),(.31,.5),(.2,.35),(.0,.35)],stone,.018,64)
    turned('Recessed soil',[(0,.61),(.36,.61)],soil,segments=48)
    for i in range(15):
        angle=i*2.39996
        origin=(.10*math.cos(angle),.10*math.sin(angle),.61)
        leaf(origin,angle,.36+(i%4)*.065,.065+(i%3)*.012,green if i%3 else light)
    export('planter_fluted_01')

def bin_model():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    iron=mat('Powder coated iron',(.035,.05,.06),.52,.6)
    wood=mat('Oiled timber slats',(.29,.13,.045),.7)
    green=mat('Recycling green rim',(.018,.24,.12),.48,.25)
    turned('Open inner liner',[(0,.03),(.16,.03),(.18,.57),(.18,.60),(.16,.60),(.145,.08),(0,.08)],iron,segments=32)
    # Individual shaped staves leave real gaps around the liner.
    for i in range(20):
        angle=i*math.pi/10
        verts=[]
        for z,r in [(.09,.168),(.12,.18),(.53,.195),(.57,.19)]:
            for da in [-.052,.052]:
                for thickness in [0,.018]:
                    verts.append(((r+thickness)*math.cos(angle+da),(r+thickness)*math.sin(angle+da),z))
        faces=[]
        for j in range(3):
            a=j*4;faces.extend([(a,a+2,a+6,a+4),(a+1,a+5,a+7,a+3),(a,a+4,a+5,a+1),(a+2,a+3,a+7,a+6)])
        faces.extend([(0,1,3,2),(12,14,15,13)])
        mesh('Rounded timber stave',verts,faces,wood)
    turned('Stepped iron foot',[(.15,0),(.19,.015),(.19,.055),(.17,.08)],iron,segments=32)
    turned('Rolled opening lip',[(.18,.57),(.214,.59),(.22,.62),(.214,.65),(.15,.65),(.14,.625),(.15,.60),(.18,.57)],green,segments=48)
    turned('Lower retaining band',[(.184,.12),(.194,.12),(.195,.155),(.185,.155)],iron,segments=48)
    export('recycling_bin_01')

if __name__=='__main__':
    for name in ['planter_fluted_01','recycling_bin_01']:
        if (DEST/(name+'.glb')).exists():raise RuntimeError('Refusing overwrite')
    planter();bin_model()
