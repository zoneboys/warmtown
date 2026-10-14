import bpy
import math
import os

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'characters', 'player.glb'))


def make_material(name, color, roughness=0.82):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = next((node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if shader is None:
        shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    base = shader.inputs.get('Base Color') or shader.inputs.get('基色') or shader.inputs[0]
    base.default_value = (*color, 1)
    rough = shader.inputs.get('Roughness') or shader.inputs.get('粗糙度')
    if rough:
        rough.default_value = roughness
    return material


def set_shader_value(material, names, value):
    shader = next((node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
    if shader is None:
        return
    for name in names:
        socket = shader.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


# The style target is a contemporary East-Asian-inspired original: natural
# proportions, deep hair, restrained facial features and bright daily clothes.
# These are original materials only; no commercial character mesh or texture is
# copied from another game.
skin = make_material('Skin_PeachWarm', (0.88, 0.64, 0.53), 0.75)
skin_light = make_material('Skin_HandHighlight', (0.95, 0.77, 0.66), 0.78)
set_shader_value(skin, ('Subsurface Weight', 'Subsurface'), 0.08)
set_shader_value(skin_light, ('Subsurface Weight', 'Subsurface'), 0.05)
# Keep the hair visibly dark brown instead of a flat black cap.  The warm
# tea-brown value reads better under the town's pastel lighting and gives the
# face a softer, contemporary Chinese-animation silhouette.
hair = make_material('Hair_DeepTeaBrown', (0.14, 0.072, 0.048), 0.46)
hair_highlight = make_material('Hair_WarmChestnut', (0.34, 0.16, 0.085), 0.42)
top = make_material('Outfit_SaltBlueKnit', (0.57, 0.65, 0.79), 0.90)
top_light = make_material('Outfit_CreamTrim', (0.97, 0.92, 0.84), 0.90)
bottom = make_material('Outfit_CloudBlueTrousers', (0.34, 0.43, 0.61), 0.88)
shoe = make_material('Shoes_CloudCream', (0.91, 0.82, 0.75), 0.82)
shoe_sole = make_material('Shoes_SoftRoseSole', (0.56, 0.43, 0.40), 0.86)
eye = make_material('Eyes_DeepBrown', (0.030, 0.020, 0.018), 0.52)
eye_white = make_material('Eyes_SoftWhite', (1.0, 0.975, 0.93), 0.56)
blush = make_material('Face_Blush', (0.87, 0.36, 0.34), 0.86)
lip = make_material('Lips_Rose', (0.58, 0.16, 0.21), 0.64)
accent = make_material('Accessory_Lavender', (0.42, 0.43, 0.65), 0.76)
gold = make_material('Accessory_WarmGold', (0.94, 0.69, 0.24), 0.76)


def smooth(mesh):
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    return mesh


def sphere(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=loc)
    mesh = bpy.context.object
    mesh.name = name
    mesh.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mesh.data.materials.append(material)
    return smooth(mesh)


def rounded_box(name, loc, dimensions, bevel, material):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    mesh = bpy.context.object
    mesh.name = name
    mesh.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = mesh.modifiers.new('SoftClothEdges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 4
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh.data.materials.append(material)
    return smooth(mesh)


def tapered(name, loc, radius1, radius2, depth, material):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    mesh = bpy.context.object
    mesh.name = name
    # Blender primitives are Z-axis aligned; clothing height in the game is Y.
    mesh.rotation_euler[0] = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    mesh.data.materials.append(material)
    return smooth(mesh)


def curve_tube(name, points, radius, material):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return smooth(obj)


def flat_bang(name, points, z, depth, material):
    """Create a small solid hair panel in the front-facing X/Y plane.

    The panels keep the fringe readable at the game's camera distance.  They
    are intentionally separate meshes so each strand can have its own soft
    silhouette and still receive the same rigid skin weight as the head.
    """
    vertices = [(x, y, z - depth * 0.5) for x, y in points]
    vertices += [(x, y, z + depth * 0.5) for x, y in points]
    count = len(points)
    faces = [tuple(range(count)), tuple(range(count * 2 - 1, count - 1, -1))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh_data = bpy.data.meshes.new(name)
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.update()
    obj = bpy.data.objects.new(name, mesh_data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return smooth(obj)


def bind(mesh, armature, bone_name):
    group = mesh.vertex_groups.new(name=bone_name)
    group.add(list(range(len(mesh.data.vertices))), 1.0, 'REPLACE')
    modifier = mesh.modifiers.new('WarmAvatar_Skin', 'ARMATURE')
    modifier.object = armature
    mesh.parent = armature
    mesh.matrix_parent_inverse = armature.matrix_world.inverted()


def remove_stale_object(name):
    stale = bpy.data.objects.get(name)
    if stale is not None:
        bpy.data.objects.remove(stale, do_unlink=True)


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
# Blender can retain objects in hidden/non-view-layer collections after a
# factory reset. Explicitly remove the known unlinked helper from earlier
# exports before authoring the new asset.
remove_stale_object('Icosphere')
parts = []


def add(mesh, bone_name='Spine'):
    parts.append((mesh, bone_name))
    return mesh


# A longer silhouette and separate clothing layers read clearly in a third-
# person camera while retaining a soft, healing-game feel. Keep the shoulders
# slightly tapered and the waist clean so the body does not read as a stack of
# rounded boxes at the game's distant camera.
add(sphere('Torso_SaltKnit', (0, 1.62, 0), (0.47, 0.63, 0.31), top))
add(rounded_box('Knit_Collar', (0, 2.00, 0.25), (0.30, 0.09, 0.05), 0.03, top_light))
add(rounded_box('Knit_Seam', (0, 1.56, 0.27), (0.045, 0.56, 0.03), 0.018, accent))
add(rounded_box('Waistband', (0, 1.08, 0), (0.62, 0.16, 0.40), 0.06, top_light))
add(sphere('Neck', (0, 2.10, 0), (0.14, 0.16, 0.13), skin), 'Spine')
for side, label in ((-1, 'L'), (1, 'R')):
    add(sphere('WideLeg_%s' % label, (side * 0.17, 0.58, 0), (0.15, 0.55, 0.17), bottom), 'LeftLeg' if side < 0 else 'RightLeg')

add(sphere('Head_Face', (0, 2.62, 0), (0.40, 0.48, 0.37), skin), 'Spine')
add(sphere('Jaw_Soft', (0, 2.47, 0.025), (0.34, 0.25, 0.33), skin), 'Spine')
add(sphere('Ear_L', (-0.36, 2.62, 0.01), (0.08, 0.12, 0.08), skin_light), 'Spine')
add(sphere('Ear_R', (0.36, 2.62, 0.01), (0.08, 0.12, 0.08), skin_light), 'Spine')

# Default hairstyle: an airy shoulder-length cut with a visible part, tapered
# fringe and two soft face-framing locks.  Flat fringe panels avoid the old
# black-cap look while the curves add a few hand-authored strand highlights.
add(sphere('Hair_Cap', (0, 2.87, -0.04), (0.43, 0.31, 0.40), hair), 'Spine')
add(sphere('Hair_Back', (0.02, 2.58, -0.23), (0.42, 0.60, 0.25), hair), 'Spine')
add(rounded_box('Hair_Back_Curtain', (0.02, 2.40, -0.30), (0.84, 1.25, 0.34), 0.20, hair), 'Spine')
add(rounded_box('Hair_Back_Lower', (-0.27, 2.25, -0.28), (0.28, 0.58, 0.30), 0.12, hair), 'Spine')
add(rounded_box('Hair_Back_Lower_R', (0.31, 2.25, -0.28), (0.28, 0.58, 0.30), 0.12, hair), 'Spine')
add(sphere('Hair_Layer_L', (-0.34, 2.38, -0.05), (0.11, 0.43, 0.14), hair), 'Spine')
add(sphere('Hair_Layer_R', (0.34, 2.38, -0.05), (0.11, 0.43, 0.14), hair), 'Spine')
add(flat_bang('Hair_Bang_L', [(-0.36, 2.93), (-0.18, 2.98), (-0.03, 2.88), (-0.15, 2.76), (-0.29, 2.76), (-0.26, 2.86)], 0.34, 0.065, hair), 'Spine')
add(flat_bang('Hair_Bang_C', [(-0.14, 2.98), (0.02, 3.00), (0.10, 2.88), (0.03, 2.78), (-0.08, 2.78)], 0.345, 0.068, hair_highlight), 'Spine')
add(flat_bang('Hair_Bang_R', [(0.06, 2.98), (0.22, 2.94), (0.36, 2.84), (0.25, 2.75), (0.12, 2.78), (0.16, 2.88)], 0.34, 0.065, hair), 'Spine')
add(curve_tube('Hair_FaceLock_L', [(-0.31, 2.87, 0.32), (-0.40, 2.64, 0.29), (-0.35, 2.40, 0.16), (-0.27, 2.29, 0.08)], 0.040, hair), 'Spine')
add(curve_tube('Hair_FaceLock_R', [(0.31, 2.87, 0.32), (0.40, 2.64, 0.29), (0.35, 2.40, 0.16), (0.27, 2.29, 0.08)], 0.040, hair), 'Spine')
add(curve_tube('Hair_Shine_L', [(-0.19, 2.95, 0.385), (-0.25, 2.82, 0.39), (-0.27, 2.69, 0.37)], 0.010, hair_highlight), 'Spine')
add(curve_tube('Hair_Shine_R', [(0.15, 2.94, 0.385), (0.23, 2.81, 0.39), (0.27, 2.70, 0.37)], 0.010, hair_highlight), 'Spine')
add(sphere('Hair_Clip', (-0.30, 2.84, 0.35), (0.05, 0.05, 0.018), accent), 'Spine')

# Face pieces face +Z, matching the Three.js camera's default front view.
for side in (-1, 1):
    label = 'L' if side < 0 else 'R'
    add(sphere('EyeWhite_%s' % label, (side * 0.14, 2.66, 0.335), (0.092, 0.064, 0.024), eye_white), 'Spine')
    add(sphere('EyeIris_%s' % label, (side * 0.142, 2.66, 0.360), (0.043, 0.050, 0.020), eye), 'Spine')
    add(sphere('EyeGlint_%s' % label, (side * 0.128, 2.685, 0.378), (0.010, 0.014, 0.006), eye_white), 'Spine')
    add(rounded_box('Brow_%s' % label, (side * 0.14, 2.76, 0.354), (0.115, 0.024, 0.016), 0.012, hair), 'Spine')
    add(sphere('Blush_%s' % label, (side * 0.245, 2.52, 0.342), (0.065, 0.030, 0.012), blush), 'Spine')
add(sphere('Nose_Soft', (0, 2.55, 0.365), (0.038, 0.030, 0.020), skin_light), 'Spine')
add(curve_tube('Mouth_Smile', [(-0.062, 2.45, 0.362), (0, 2.42, 0.376), (0.062, 2.45, 0.362)], 0.012, lip), 'Spine')

# The old asset read as a large-headed toy at the game's third-person camera.
# Scale the entire facial/hair assembly around the neck so the body and legs
# carry a more natural adult silhouette while preserving all authored details.
head_parts = {
    'Head_Face', 'Jaw_Soft', 'Ear_L', 'Ear_R', 'Hair_Cap', 'Hair_Back',
    'Hair_Back_Curtain', 'Hair_Back_Lower', 'Hair_Back_Lower_R',
    'Hair_Bang_L', 'Hair_Bang_C', 'Hair_Bang_R', 'Hair_FaceLock_L',
    'Hair_FaceLock_R', 'Hair_Layer_L', 'Hair_Layer_R', 'Hair_Shine_L',
    'Hair_Shine_R', 'Hair_Clip', 'EyeWhite_L', 'EyeWhite_R', 'EyeIris_L',
    'EyeIris_R', 'EyeGlint_L', 'EyeGlint_R', 'Brow_L', 'Brow_R', 'Blush_L',
    'Blush_R', 'Nose_Soft', 'Mouth_Smile',
}
head_pivot = bpy.mathutils.Vector((0.0, 2.20, 0.0)) if hasattr(bpy, 'mathutils') else None
if head_pivot is None:
    from mathutils import Vector
    head_pivot = Vector((0.0, 2.20, 0.0))
for mesh, _ in parts:
    if mesh.name not in head_parts:
        continue
    mesh.location = head_pivot + (mesh.location - head_pivot) * 0.80
    mesh.scale *= 0.80

# Sleeves, forearms and hands keep the hand/cloth separation visible.
for side, label in ((-1, 'L'), (1, 'R')):
    arm_bone = 'LeftArm' if side < 0 else 'RightArm'
    add(sphere('Sleeve_%s' % label, (side * 0.48, 1.80, 0), (0.17, 0.22, 0.17), top), arm_bone)
    add(sphere('Forearm_%s' % label, (side * 0.53, 1.40, 0.02), (0.10, 0.30, 0.10), skin), arm_bone)
    add(sphere('Hand_%s' % label, (side * 0.53, 1.11, 0.06), (0.11, 0.10, 0.10), skin_light), arm_bone)

# Socks and rounded shoes form a stable grounded stance.
for side, label in ((-1, 'L'), (1, 'R')):
    leg_bone = 'LeftLeg' if side < 0 else 'RightLeg'
    add(rounded_box('Sock_%s' % label, (side * 0.18, 0.13, 0), (0.25, 0.12, 0.27), 0.045, top_light), leg_bone)
    add(rounded_box('Sole_%s' % label, (side * 0.18, 0.055, 0.11), (0.32, 0.09, 0.48), 0.045, shoe_sole), leg_bone)
    add(rounded_box('Shoe_%s' % label, (side * 0.18, 0.14, 0.11), (0.28, 0.18, 0.40), 0.065, shoe), leg_bone)
    add(rounded_box('Toe_%s' % label, (side * 0.18, 0.16, 0.25), (0.25, 0.09, 0.16), 0.035, top_light), leg_bone)


# Conventional humanoid armature; meshes are rigidly assigned to the nearest
# bone for deterministic procedural animation and zero unweighted gaps.
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
armature = bpy.context.object
armature.name = 'WarmAvatar_Rig'
armature.data.name = 'WarmAvatar_Rig'
edit = armature.data.edit_bones
root_bone = edit[0]
root_bone.name = 'Root'
root_bone.head = (0, 0, 0)
root_bone.tail = (0, 0.7, 0)


def bone(name, head, tail, parent):
    result = edit.new(name)
    result.head = head
    result.tail = tail
    result.parent = parent
    return result


spine = bone('Spine', (0, 0.7, 0), (0, 2.15, 0), root_bone)
bone('LeftArm', (-0.40, 1.82, 0), (-0.56, 1.08, 0), spine)
bone('RightArm', (0.40, 1.82, 0), (0.56, 1.08, 0), spine)
bone('LeftLeg', (-0.18, 1.10, 0), (-0.18, 0.10, 0), root_bone)
bone('RightLeg', (0.18, 1.10, 0), (0.18, 0.10, 0), root_bone)
bpy.ops.object.mode_set(mode='OBJECT')

for mesh, bone_name in parts:
    bind(mesh, armature, bone_name)


def make_action(name, amount):
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='POSE')
    armature.animation_data_create()
    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    # A believable walk uses a contralateral gait: the left arm travels with
    # the right leg and the right arm travels with the left leg.  The previous
    # generator keyed every left-side bone with the same phase, which made the
    # avatar swing the same-side hand and foot together.
    phase = {
        'LeftArm': 1,
        'RightArm': -1,
        'LeftLeg': -1,
        'RightLeg': 1,
    }
    for bone_name in ('LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'):
        pose_bone = armature.pose.bones.get(bone_name)
        if not pose_bone:
            continue
        pose_bone.rotation_mode = 'XYZ'
        direction = phase[bone_name]
        pose_bone.rotation_euler = (direction * amount, 0, 0)
        pose_bone.keyframe_insert('rotation_euler', frame=1, group=bone_name)
        pose_bone.rotation_euler = (-direction * amount, 0, 0)
        pose_bone.keyframe_insert('rotation_euler', frame=12, group=bone_name)
        pose_bone.rotation_euler = (direction * amount, 0, 0)
        pose_bone.keyframe_insert('rotation_euler', frame=24, group=bone_name)
    bpy.ops.object.mode_set(mode='OBJECT')
    action.frame_start = 1
    action.frame_end = 24
    return action


make_action('Idle', 0.025)
make_action('Walk', 0.28)

# Remove every startup helper object so no unweighted proxy, camera, or stale
# object from a previous Blender session can leak into the web asset.  The
# runtime deliberately rejects non-skinned meshes when a skinned avatar is
# present, so keeping one here would also distort the source bounds.
authored = {mesh for mesh, _ in parts}
for obj in list(bpy.data.objects):
    if obj.type != 'ARMATURE' and obj not in authored:
        bpy.data.objects.remove(obj, do_unlink=True)

print('Export objects:', ', '.join(obj.name for obj in bpy.data.objects))

bpy.context.view_layer.objects.active = armature
armature.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,
    export_animations=True,
    export_skins=True,
    export_materials='EXPORT',
    export_yup=True,
    export_def_bones=True,
)
print('Wrote', OUT)
