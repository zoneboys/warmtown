"""Build an original sculpted-surface player hero for the Warmtown staging pipeline.

Run with Blender 5.2:
  blender -b --factory-startup --python tools/generate_player_hero.py

This is a locally-authored stylized asset, not a substitute for hand-sculpted
production art. Continuous loft meshes and swept forms replace the old pile of
primitive body pieces. Inspect the GLB from multiple views before promotion.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("WARM_TOWN_PLAYER_OUT", str(ROOT / "staging" / "assets" / "characters" / "player-hero.glb")))
OUT.parent.mkdir(parents=True, exist_ok=True)

# Factory startup includes a camera, light, and the default Cube. Remove every
# starter object before collecting meshes for the character export.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.armatures):
    for datablock in list(datablocks):
        if datablock.users == 0:
            datablocks.remove(datablock)


def mat(name, color, roughness=0.55, metallic=0.0, subsurface=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
    return m


skin = mat('Skin_WarmPeach_SSS', (0.68, 0.38, 0.27), .48, 0, .075)
skin_light = mat('Skin_LidAndEar', (0.82, 0.53, 0.41), .5, 0, .05)
lip = mat('Face_RosewoodLip', (.34, .075, .07), .45)
blush = mat('Face_PeachBlush', (.67, .18, .16), .64)
white = mat('Eye_Ivory', (.86, .81, .69), .22)
iris = mat('Eye_DeepTea', (.095, .035, .018), .18)
pupil = mat('Eye_Pupil', (.012, .008, .006), .12)
glint = mat('Eye_Catchlight', (1, .88, .67), .1)
hair = mat('Hair_DeepChestnut', (.055, .022, .015), .3)
hair_lit = mat('Hair_ChestnutRidge', (.16, .055, .025), .36)
shirt = mat('Cloth_IvoryKnit', (.78, .69, .53), .78)
jacket = mat('Cloth_SeaGlassTwill', (.035, .28, .26), .58)
jacket_light = mat('Cloth_SeamMint', (.18, .47, .39), .62)
scarf = mat('Cloth_CoralWoven', (.53, .105, .075), .67)
trouser = mat('Cloth_PlumTrousers', (.18, .10, .20), .82)
shoe = mat('Leather_Cream', (.73, .59, .43), .42)
sole = mat('Rubber_DarkSole', (.095, .07, .06), .72)
metal = mat('Accessory_BrushedBrass', (.52, .31, .105), .3, .68)


def loft(name, rings, material, segments=32, cap=True):
    """Rings are (z, center_x, center_y, radius_x, radius_y). Front is +Y."""
    verts, faces = [], []
    for z, cx, cy, rx, ry in rings:
        for i in range(segments):
            a = math.tau * i / segments
            verts.append((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
    for r in range(len(rings) - 1):
        for i in range(segments):
            a = r * segments + i
            b = r * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    if cap:
        faces.append(tuple(range(segments - 1, -1, -1)))
        start = (len(rings) - 1) * segments
        faces.append(tuple(start + i for i in range(segments)))
    mesh = bpy.data.meshes.new(name + '_Surface')
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons: p.use_smooth = True
    sub = obj.modifiers.new('SculptSmooth', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    return obj


def uv(name, loc, scale, material, seg=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o


def tube(name, points, radius, material, resolution=12):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 20
    curve.bevel_depth = radius
    curve.bevel_resolution = 5
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    for p in obj.data.polygons: p.use_smooth = True
    return obj


def ellipsoid_shell(name, rings, material, segments=40):
    return loft(name, rings, material, segments)

# Silhouette: adult 1:7.1 head-to-height ratio, feet at ground, front +Y.
parts = []
body = loft('Body_Skinned_Continuous', [
    (.92, 0, 0, .19, .14), (1.02, 0, 0, .28, .19), (1.18, 0, 0, .30, .20),
    (1.38, 0, 0, .275, .18), (1.58, 0, 0, .34, .21), (1.75, 0, 0, .43, .22),
    (1.91, 0, 0, .40, .20), (2.02, 0, 0, .23, .15),
], jacket, 40)
parts.append((body, 'Spine'))
# Layered shirt collar and jacket panels, shaped as thin sculpted shells.
shirt_shell = loft('Outfit_KnitBody', [(1.18,0,-.002,.277,.184),(1.38,0,-.002,.292,.191),(1.58,0,-.002,.35,.219),(1.74,0,-.002,.405,.216),(1.84,0,-.002,.35,.195)], shirt, 40)
parts.append((shirt_shell, 'Spine'))
# Jacket fronts with curved edges and visible seam piping.
for side in (-1,1):
    x=side
    panel = loft(f'Outfit_JacketFront_{"L" if x<0 else "R"}', [
      (1.24,x*.01,.17,.12,.035),(1.40,x*.025,.19,.15,.035),(1.62,x*.055,.19,.16,.04),(1.80,x*.055,.17,.14,.035)
    ], jacket, 20)
    parts.append((panel,'Spine'))
    tube(f'Outfit_Stitch_{"L" if x<0 else "R"}', [(x*.035,.228,1.31),(x*.065,.232,1.52),(x*.11,.215,1.73)], .008, jacket_light)
# Sculpted neck and shoulder-to-arm continuous tapered lofts.
neck = loft('Neck_Skinned', [(1.91,0,0,.12,.12),(2.04,0,0,.115,.11),(2.15,0,0,.13,.12)], skin, 32)
parts.append((neck,'Spine'))
for side, label in [(-1,'L'),(1,'R')]:
    # Arms taper from shoulder to wrist with elbow volume; bent slightly relaxed.
    arm = loft(f'Arm_{label}_Continuous', [
      (.98,side*.53,.015,.085,.09),(1.14,side*.51,.02,.09,.095),(1.30,side*.47,.02,.105,.11),
      (1.48,side*.43,.01,.12,.12),(1.66,side*.39,0,.15,.14),(1.79,side*.37,0,.16,.15)
    ], skin, 24)
    parts.append((arm, f'Arm.{label}'))
    sleeve = loft(f'Jacket_Sleeve_{label}', [(1.57,side*.405,0,.16,.145),(1.70,side*.385,0,.17,.15),(1.82,side*.37,0,.16,.145)], jacket, 24)
    parts.append((sleeve,'Spine'))
    cuff = loft(f'Jacket_Cuff_{label}', [(1.52,side*.415,.005,.15,.14),(1.58,side*.405,.005,.162,.148)], jacket_light, 24)
    parts.append((cuff,f'Arm.{label}'))
    hand = uv(f'Hand_{label}',(side*.53,.018,.94),(.092,.06,.12),skin_light,24,16)
    parts.append((hand,f'Arm.{label}'))
    # Thumb and four tapered fingers create a readable hand silhouette.
    for finger in range(4):
        fx=side*.53 + (finger-1.5)*.035
        f=uv(f'Finger_{label}_{finger}',(fx,.035,.86),(.018,.023,.075 if finger in (1,2) else .06),skin,16,10)
        parts.append((f,f'Arm.{label}'))

# High-waist tailored trousers with continuous upper garment and separate articulated legs.
pants = loft('Outfit_Trousers_Hip', [(.76,0,0,.28,.18),(.86,0,0,.29,.19),(.99,0,0,.30,.20),(1.09,0,0,.31,.20)], trouser, 40)
parts.append((pants,'Hips'))
for side,label in [(-1,'L'),(1,'R')]:
    leg=loft(f'Leg_{label}_Continuous', [
       (.18,side*.155,.005,.105,.12),(.28,side*.155,.005,.115,.125),(.50,side*.15,0,.12,.13),
       (.72,side*.15,0,.135,.14),(.91,side*.15,0,.145,.15),
    ], trouser, 28)
    parts.append((leg,f'Leg.{label}'))
    # Knee seam and cuff are narrow fabric bands, not box geometry.
    cuff=loft(f'Trousers_Cuff_{label}',[(.22,side*.155,.005,.11,.123),(.28,side*.155,.005,.12,.13)],jacket_light,28)
    parts.append((cuff,f'Leg.{label}'))
    sole_obj=loft(f'Shoe_Sole_{label}',[(.035,side*.155,.055,.145,.22),(.075,side*.155,.055,.15,.23)],sole,28)
    parts.append((sole_obj,f'Foot.{label}'))
    shoe_obj=loft(f'Shoe_Upper_{label}',[(.07,side*.155,.055,.14,.22),(.13,side*.155,.055,.145,.225),(.22,side*.155,.02,.11,.16),(.27,side*.155,0,.095,.12)],shoe,28)
    parts.append((shoe_obj,f'Foot.{label}'))

# Neck scarf loops in soft cloth and a short draped end.
tube('Scarf_Wrap', [(-.13,.11,1.98),(-.08,.17,2.05),(0,.18,2.07),(.09,.16,2.02),(.13,.10,1.96)], .035, scarf)
tube('Scarf_Tail', [(.10,.15,2.01),(.14,.19,1.88),(.19,.18,1.76)], .028, scarf)

# Head is a sculpted continuous loft, broad cranium, tapered jaw and chin.
head = loft('Head_Face_Sculpt', [
 (2.06,0,0,.12,.13),(2.12,0,.015,.20,.18),(2.22,0,.02,.255,.215),
 (2.36,0,.012,.285,.225),(2.51,0,0,.29,.23),(2.66,0,-.005,.27,.22),
 (2.77,0,-.01,.22,.18),(2.83,0,-.01,.12,.12)
], skin, 48)
parts.append((head,'Head'))
# Ears with inner concha details.
for side,label in [(-1,'L'),(1,'R')]:
    ear=uv(f'Ear_{label}',(side*.28,0,2.42),(.074,.063,.12),skin,28,18)
    inner=uv(f'Ear_Concha_{label}',(side*.315,.046,2.42),(.032,.02,.071),skin_light,24,16)
    parts.extend([(ear,'Head'),(inner,'Head')])
# Face volumes are integrated close to the surface, not floating far forward.
for side,label in [(-1,'L'),(1,'R')]:
    # Eye socket rim and upper eyelid arc.
    uv(f'EyeSocket_{label}',(side*.105,.204,2.48),(.096,.031,.073),skin_light,32,20)
    uv(f'Eye_Almond_{label}',(side*.105,.231,2.48),(.071,.024,.047),white,32,20)
    uv(f'Eye_Iris_{label}',(side*.105,.253,2.478),(.035,.016,.039),iris,28,18)
    uv(f'Eye_Pupil_{label}',(side*.105,.266,2.478),(.018,.009,.026),pupil,24,16)
    uv(f'Eye_Glint_{label}',(side*.092,.274,2.495),(.009,.006,.011),glint,16,10)
    tube(f'Eyelid_Upper_{label}',[(side*.19,.218,2.49),(side*.14,.241,2.53),(side*.085,.246,2.535),(side*.035,.218,2.50)],.012,hair)
    tube(f'Eyebrow_{label}',[(side*.19,.205,2.57),(side*.13,.22,2.59),(side*.07,.22,2.585)],.014,hair)
    uv(f'Cheek_Color_{label}',(side*.17,.198,2.35),(.045,.01,.018),blush,20,12)
# Nose bridge, nostril wings and shaped mouth.
uv('Nose_Bridge',(0,.217,2.405),(.034,.038,.088),skin_light,28,18)
uv('Nose_Tip',(0,.244,2.365),(.045,.035,.033),skin,24,16)
for side in (-1,1): uv(f'Nostril_{side}',(side*.026,.254,2.348),(.009,.008,.006),lip,16,10)
tube('Mouth_UpperLip',[(-.06,.215,2.292),(-.027,.235,2.30),(0,.238,2.29),(.027,.235,2.30),(.06,.215,2.292)],.011,lip)
tube('Mouth_LowerLip',[(-.047,.218,2.287),(0,.233,2.276),(.047,.218,2.287)],.009,skin_light)

# Hair cap, rear mass and 11 tapered sculpted locks. Each lock follows the scalp
# and terminates in a tapered tip; highlights are ridges rather than tube pile.
cap=loft('Hair_ScalpShell',[(2.49,-.01,-.10,.27,.20),(2.62,-.01,-.11,.29,.21),(2.74,-.01,-.11,.27,.20),(2.83,-.01,-.10,.20,.16),(2.87,-.01,-.10,.08,.08)],hair,48)
parts.append((cap,'Head'))
back=loft('Hair_BackMass',[(2.02,0,-.12,.17,.11),(2.12,0,-.13,.25,.12),(2.32,0,-.12,.29,.13),(2.52,0,-.10,.28,.14),(2.68,0,-.08,.22,.12)],hair,40)
parts.append((back,'Head'))
for i in range(11):
    x=-.245+i*.049
    z0=2.78 + .035*math.sin(i*.9)
    z1=2.54 + .10*math.sin(i*.7)
    z2=2.42 + .045*math.sin(i*1.1)
    lock=loft(f'Hair_FrontLock_{i:02}',[(z0,x*.82,.16,.055,.045),(z0-.08,x,.195,.065,.05),(z1,x*1.08,.205,.061,.045),(z2,x*1.12,.18,.035,.03)], hair_lit if i in (2,7) else hair, 16)
    parts.append((lock,'Head'))
for side,label in [(-1,'L'),(1,'R')]:
    for j in range(3):
        x=side*(.235+j*.015)
        strand=loft(f'Hair_SideLock_{label}_{j}',[(2.68-j*.05,x,-.01,.065,.07),(2.48-j*.08,x*1.08,.015,.07,.075),(2.28-j*.055,x*1.10,.025,.055,.06),(2.20-j*.035,x*1.06,.015,.025,.03)],hair_lit if j==1 else hair,16)
        parts.append((strand,'Head'))

# Armature: Root/Hips/Spine/Chest/Neck/Head plus shoulders, elbows, wrists, legs, feet.
bpy.ops.object.armature_add(enter_editmode=True)
rig=bpy.context.object
rig.name='PlayerHero_Armature'
rig.data.name='PlayerHero_Armature'
bones=rig.data.edit_bones
root=bones[0]; root.name='Root'; root.head=(0,0,0); root.tail=(0,0,.45)
def bone(name, head, tail, parent, connected=False):
    b=bones.new(name); b.head=head; b.tail=tail; b.parent=parent; b.use_connect=connected; return b
hips=bone('Hips',(0,0,.86),(0,0,1.08),root)
spine=bone('Spine',(0,0,1.08),(0,0,1.53),hips,True)
chest=bone('Chest',(0,0,1.53),(0,0,1.82),spine,True)
neckb=bone('Neck',(0,0,1.82),(0,0,2.08),chest,True)
headb=bone('Head',(0,0,2.08),(0,0,2.54),neckb,True)
for side,label in [(-1,'L'),(1,'R')]:
    shoulder=bone(f'Shoulder.{label}',(side*.34,0,1.75),(side*.43,0,1.68),chest)
    upper=bone(f'Arm.{label}',(side*.43,0,1.68),(side*.51,0,1.30),shoulder,True)
    fore=bone(f'Forearm.{label}',(side*.51,0,1.30),(side*.53,0,.99),upper,True)
    bone(f'Hand.{label}',(side*.53,0,.99),(side*.53,.02,.84),fore,True)
    thigh=bone(f'Leg.{label}',(side*.15,0,.88),(side*.155,0,.48),hips)
    shin=bone(f'Shin.{label}',(side*.155,0,.48),(side*.155,0,.16),thigh,True)
    bone(f'Foot.{label}',(side*.155,0,.16),(side*.155,.16,.09),shin,True)
bpy.ops.object.mode_set(mode='OBJECT')

# Every visible piece, including facial accents and scarf curves, must be bound;
# the runtime removes unweighted helpers from skinned GLBs by design.
assigned = {obj for obj, _ in parts}
for obj in list(bpy.data.objects):
    if obj.type != 'MESH' or obj in assigned:
        continue
    if obj.name.startswith(('Scarf_', 'Outfit_Stitch_')):
        bone_name = 'Chest'
    elif obj.name.startswith(('Eye', 'Eyebrow', 'Eyelid', 'Cheek', 'Nose', 'Nostril', 'Mouth', 'Ear')):
        bone_name = 'Head'
    else:
        bone_name = 'Head'
    parts.append((obj, bone_name))

# Smooth vertex weighting by nearest anatomical bone region; meshes remain continuous.
for obj, group_name in parts:
    if obj.type != 'MESH': continue
    group=obj.vertex_groups.new(name=group_name)
    group.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
    mod=obj.modifiers.new('PlayerHero_Skin','ARMATURE'); mod.object=rig
    obj.parent=rig; obj.matrix_parent_inverse=rig.matrix_world.inverted()
    obj['asset_role']='player-hero'

# Animation clips: readable idle breath and contralateral locomotion, plus interact reach.
rig.animation_data_create()
def action(name, keys):
    act=bpy.data.actions.new(name); rig.animation_data.action=act
    for frame, pose in keys:
        for bone_name, rot in pose.items():
            b=rig.pose.bones.get(bone_name)
            if b:
                b.rotation_mode='XYZ'; b.rotation_euler=rot
                b.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone_name)
    act.frame_start=1; act.frame_end=max(f for f,_ in keys)
    return act

idle={}
walk_a={'Arm.L':(-.26,0,0),'Arm.R':(.26,0,0),'Leg.L':(.28,0,0),'Leg.R':(-.28,0,0)}
walk_b={k:tuple(-v for v in val) for k,val in walk_a.items()}
interact={'Arm.R':(-.85,0,-.18),'Forearm.R':(-.45,0,0),'Head':(.06,0,0)}
action('Idle',[(1,idle),(20,{'Chest':(.015,0,0),'Head':(0,.012,0)}),(40,idle)])
action('Walk',[(1,walk_a),(13,walk_b),(25,walk_a)])
action('Run',[(1,{k:tuple(v*1.35 for v in val) for k,val in walk_a.items()}),(9,{k:tuple(v*1.35 for v in val) for k,val in walk_b.items()}),(17,{k:tuple(v*1.35 for v in val) for k,val in walk_a.items()})])
action('Interact',[(1,{}),(8,interact),(20,interact),(30,{})])

# One skinned mesh export with authored materials/nodes; preserve semantic objects.
for obj in bpy.data.objects:
    obj.select_set(False)
for obj,_ in parts:
    obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',export_apply=True,export_yup=True,
    export_texcoords=True,export_normals=True,export_materials='EXPORT',export_skins=True,
    export_animations=True,export_def_bones=True)
print(f'[warmtown] wrote {OUT} ({OUT.stat().st_size} bytes)')
