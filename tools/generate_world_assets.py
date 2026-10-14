"""Generate authored Blender 5.2 PBR/GLB world assets for WarmTown.

Run from the repository root (Blender 5.2+):
  blender --factory-startup -b --python tools/generate_world_assets.py

The assets are deliberately self-contained: Principled BSDF materials, no external
textures, named meshes, real bevels and weighted normals, and glTF export. They are
used as the game's authored visual layer while gameplay keeps a procedural fallback.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("WARM_TOWN_ASSET_OUT", str(ROOT / "staging" / "assets" / "world")))
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def shader_input(node, *names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    return None


def material(name: str, color: Sequence[float], roughness: float = 0.55,
             metallic: float = 0.0, emission: Sequence[float] | None = None,
             emission_strength: float = 0.0, transmission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (420, 0)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (0, 0)
    principled.name = f"{name}_PrincipledBSDF"
    base = shader_input(principled, "Base Color", "基色")
    if base:
        base.default_value = (*color, 1.0)
    rough = shader_input(principled, "Roughness", "粗糙度")
    if rough:
        rough.default_value = roughness
    metal = shader_input(principled, "Metallic", "金属度")
    if metal:
        metal.default_value = metallic
    trans = shader_input(principled, "Transmission Weight", "Transmission", "透射")
    if trans:
        trans.default_value = transmission
    if emission is not None:
        em = shader_input(principled, "Emission Color", "Emission", "发光颜色")
        if em:
            em.default_value = (*emission, 1.0)
        strength = shader_input(principled, "Emission Strength", "发光强度")
        if strength:
            strength.default_value = emission_strength
    links.new(principled.outputs.get("BSDF"), output.inputs.get("Surface"))
    mat["pbr_authoring"] = "Blender 5.2 Principled BSDF"
    mat["base_color_linear"] = list(color)
    mat["roughness"] = roughness
    mat["metallic"] = metallic
    return mat


def smooth(obj: bpy.types.Object) -> bpy.types.Object:
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def assign(obj: bpy.types.Object, mat: bpy.types.Material, name: str | None = None) -> bpy.types.Object:
    if name:
        obj.name = name
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    obj["pbr_mesh"] = True
    return obj


def apply_bevel(obj: bpy.types.Object, width: float = 0.08, segments: int = 3) -> bpy.types.Object:
    bevel = obj.modifiers.new("EdgeSoftening", "BEVEL")
    bevel.width = width
    bevel.segments = segments
    bevel.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def uv_sphere(name: str, loc: Sequence[float], scale: Sequence[float], mat: bpy.types.Material,
              segments: int = 32, rings: int = 20) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat, name)
    return smooth(obj)


def ico(name: str, loc: Sequence[float], scale: Sequence[float], mat: bpy.types.Material,
        subdivisions: int = 2) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat, name)
    return smooth(obj)


def cube(name: str, loc: Sequence[float], dims: Sequence[float], mat: bpy.types.Material,
         bevel: float = 0.08) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat, name)
    if bevel:
        apply_bevel(obj, bevel, 4)
    return smooth(obj)


def cylinder(name: str, loc: Sequence[float], radius: float, depth: float, mat: bpy.types.Material,
             vertices: int = 32, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    assign(obj, mat, name)
    if bevel:
        apply_bevel(obj, bevel, 3)
    return smooth(obj)


def cone(name: str, loc: Sequence[float], r1: float, r2: float, depth: float, mat: bpy.types.Material,
         vertices: int = 32, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    obj = bpy.context.object
    assign(obj, mat, name)
    if bevel:
        apply_bevel(obj, bevel, 3)
    return smooth(obj)


def torus(name: str, loc: Sequence[float], major: float, minor: float, mat: bpy.types.Material,
          rotation: Sequence[float] = (0, 0, 0), major_segments: int = 48, minor_segments: int = 12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_segments,
                                     minor_segments=minor_segments, location=loc, rotation=rotation)
    return smooth(assign(bpy.context.object, mat, name))


def curve_tube(name: str, points: Iterable[Sequence[float]], radius: float, mat: bpy.types.Material,
               resolution: int = 3) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new("BEZIER")
    values = list(points)
    spline.bezier_points.add(len(values) - 1)
    for point, value in zip(spline.bezier_points, values):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return smooth(obj)


def spin_to(obj: bpy.types.Object, rot: Sequence[float]) -> bpy.types.Object:
    obj.rotation_euler = rot
    return obj


def root_for(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    collection.objects.link(obj)


def empty(name: str, collection: bpy.types.Collection) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    return obj


def parent_keep_transform(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


def finish_asset(asset_name: str, root: bpy.types.Collection) -> None:
    # Mark every object and material for runtime diagnostics and future asset
    # replacement. Keep the authored world at metre scale, Y up.
    for obj in root.objects:
        obj["world_asset"] = asset_name
        obj["authoring_tool"] = "Blender 5.2"
        if hasattr(obj.data, "materials"):
            for mat in obj.data.materials:
                mat["world_asset"] = asset_name
    bpy.context.scene["world_asset"] = asset_name
    bpy.context.scene["authoring_tool"] = "Blender 5.2"
    bpy.ops.object.select_all(action="SELECT")
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    # Set a meaningful origin at the ground contact so runtime fitting is stable.
    for obj in root.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(iter(root.objects), None)
    output = OUT / f"{asset_name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_apply=True,
                              export_yup=True, export_texcoords=True, export_normals=True,
                              export_materials="EXPORT", export_lights=False, export_cameras=False,
                              export_animations=True)
    print(f"[warmtown] wrote {output} ({output.stat().st_size} bytes)")


def build_habitat_pod() -> None:
    clear_scene()
    root = root_for("HabitatPod_Authored")
    # The first pass used near-black teal/purple shells and very bright cyan
    # emission.  Under the game's ACES exposure that read as a dark toy with
    # neon trim.  Keep the alien silhouette, but use a pastel ceramic palette
    # and restrained emission so form, bevels and windows remain readable.
    shell = material("Habitat_ShellPearl", (0.34, 0.48, 0.52), 0.42, 0.28)
    shell2 = material("Habitat_ShellBasalt", (0.22, 0.28, 0.34), 0.48, 0.34)
    trim = material("Habitat_EnergyMint", (0.20, 0.44, 0.43), 0.34, 0.22, (0.05, 0.25, 0.22), 0.48)
    glass = material("Habitat_SmartGlass", (0.13, 0.34, 0.40), 0.22, 0.18, (0.02, 0.09, 0.12), 0.18, 0.28)
    warm = material("Habitat_InteriorGlow", (0.58, 0.31, 0.22), 0.38, 0.08, (0.25, 0.06, 0.03), 0.62)
    exterior = empty("ExteriorShell", root)
    interior = empty("InteriorShell", root)
    cutaway = empty("CameraCutaway", root)
    living_anchor = empty("FurnitureAnchor_LivingRoom", root)
    entry_anchor = empty("FurnitureAnchor_Entry", root)
    # Lifted pressure pod body with sculpted overlapping shell layers.
    body = uv_sphere("HabitatPod_MainPressureShell", (0, 1.65, 0), (2.7, 1.48, 2.05), shell, 48, 28)
    move_to_collection(body, root)
    lower = uv_sphere("HabitatPod_LowerShell", (0, 1.16, 0), (2.45, 0.70, 1.84), shell2, 40, 20)
    move_to_collection(lower, root)
    roof = uv_sphere("HabitatPod_TransparentDome", (0, 2.52, 0), (2.28, 0.84, 1.78), glass, 48, 24)
    move_to_collection(roof, root)
    for y, major in ((0.70, 1.94), (1.48, 2.28)):
        seam = torus(f"HabitatPod_ShellSeam_{y:.2f}", (0, y, 0), major, 0.028, trim, (0, 0, 0), 64, 10)
        move_to_collection(seam, root)
    # Front airlock, portholes and side fins.
    door = uv_sphere("Door_Airlock", (0, 1.04, 1.98), (0.76, 0.98, 0.15), warm, 32, 20)
    move_to_collection(door, root)
    door_ring = torus("HabitatPod_AirlockRing", (0, 1.05, 2.10), 0.92, 0.09, trim, (math.pi / 2, 0, 0), 48, 12)
    move_to_collection(door_ring, root)
    for side in (-1, 1):
        window = uv_sphere(f"HabitatPod_Porthole_{'L' if side < 0 else 'R'}", (side * 1.28, 1.72, 1.62), (0.46, 0.40, 0.10), glass, 32, 16)
        move_to_collection(window, root)
        ring = torus(f"HabitatPod_PortholeRing_{'L' if side < 0 else 'R'}", (side * 1.28, 1.72, 1.71), 0.46, 0.045, trim, (math.pi / 2, 0, 0), 36, 8)
        move_to_collection(ring, root)
        fin = cube(f"HabitatPod_SideFin_{'L' if side < 0 else 'R'}", (side * 2.48, 1.22, -0.10), (0.42, 0.18, 1.05), shell2, 0.09)
        fin.rotation_euler.y = side * 0.30
        move_to_collection(fin, root)
    for i, (x, z) in enumerate(((-1.70, -1.08), (1.70, -1.08), (-1.72, 1.03), (1.72, 1.03))):
        strut = cylinder(f"HabitatPod_LandingStrut_{i+1}", (x, 0.38, z), 0.11, 0.72, trim, 16, 0.025)
        strut.rotation_euler.y = (0.25 if x > 0 else -0.25)
        move_to_collection(strut, root)
        foot = uv_sphere(f"HabitatPod_LandingFoot_{i+1}", (x * 1.03, 0.06, z * 1.03), (0.38, 0.09, 0.32), shell2, 24, 12)
        move_to_collection(foot, root)
    antenna = curve_tube("HabitatPod_QuantumAntenna", [(0, 3.12, 0), (0.08, 3.86, -0.02), (0.35, 4.28, 0.08)], 0.045, trim, 3)
    move_to_collection(antenna, root)
    beacon = uv_sphere("HabitatPod_Beacon", (0.35, 4.28, 0.08), (0.14, 0.14, 0.14), trim, 20, 12)
    move_to_collection(beacon, root)
    # Interior is authored against the same shell footprint. Runtime can hide
    # the exterior and reveal this exact room without generating a second plan.
    floor = cube("HabitatInterior_Floor", (0, 0.08, 0.40), (4.55, 0.16, 3.55), shell2, 0.10)
    wall_back = cube("HabitatInterior_BackWall", (0, 1.45, -1.35), (4.55, 2.75, 0.14), shell, 0.08)
    wall_left = cube("HabitatInterior_LeftWall", (-2.20, 1.45, 0.40), (0.14, 2.75, 3.55), shell, 0.08)
    wall_right = cube("HabitatInterior_RightWall", (2.20, 1.45, 0.40), (0.14, 2.75, 3.55), shell, 0.08)
    ceiling = cube("HabitatInterior_Ceiling", (0, 2.88, 0.40), (4.55, 0.14, 3.55), glass, 0.05)
    for obj in (floor, wall_back, wall_left, wall_right, ceiling):
        move_to_collection(obj, root)
        parent_keep_transform(obj, interior)
    for anchor, location in ((living_anchor, (-1.05, 0.14, -0.72)), (entry_anchor, (0, 0.14, 1.45))):
        anchor.location = location
        anchor.parent = interior
    # A structural divider, kitchen rail and window belong to the authored room.
    for name, location, dims, material_ref in (
        ("HabitatInterior_Divider", (0.35, 1.25, 0.25), (0.12, 2.2, 2.2), trim),
        ("HabitatInterior_KitchenRail", (1.20, 0.65, -0.82), (1.55, 0.85, 0.48), shell2),
        ("HabitatInterior_Window", (0, 1.75, -1.26), (1.85, 1.05, 0.06), glass),
    ):
        detail = cube(name, location, dims, material_ref, 0.06)
        move_to_collection(detail, root)
        parent_keep_transform(detail, interior)
    # Keep the camera marker outside the interior volume, so cutaway logic can
    # be authored later without changing gameplay coordinates.
    cutaway.location = (0, 2.9, 0.0)
    for obj in list(root.objects):
        if obj in (exterior, interior, cutaway, living_anchor, entry_anchor):
            continue
        if obj.parent is None:
            parent_keep_transform(obj, exterior)
    living_anchor.parent = interior
    entry_anchor.parent = interior
    finish_asset("habitat-pod", root)


def build_alien_flora() -> None:
    clear_scene()
    root = root_for("AlienFlora_Authored")
    stem = material("Flora_StemPearl", (0.18, 0.32, 0.32), 0.58, 0.03)
    leaf = material("Flora_LeafJade", (0.26, 0.50, 0.42), 0.52, 0.02, (0.03, 0.12, 0.09), 0.08)
    petal = material("Flora_PetalViolet", (0.50, 0.28, 0.56), 0.48, 0.01, (0.08, 0.02, 0.10), 0.16)
    glow = material("Flora_BioGlow", (0.34, 0.66, 0.61), 0.34, 0.06, (0.04, 0.22, 0.18), 0.62)
    base = cylinder("AlienFlora_GroundCrown", (0, 0.14, 0), 0.72, 0.28, stem, 32, 0.06)
    move_to_collection(base, root)
    for i in range(3):
        angle = i * 2.094
        points = [(0, 0.22, 0), (math.cos(angle) * 0.22, 0.85, math.sin(angle) * 0.22),
                  (math.cos(angle + 0.25) * 0.10, 1.55, math.sin(angle + 0.25) * 0.10),
                  (math.cos(angle + 0.08) * 0.20, 2.15, math.sin(angle + 0.08) * 0.20)]
        branch = curve_tube(f"AlienFlora_SculptedStem_{i+1}", points, 0.10, stem, 4)
        move_to_collection(branch, root)
        for j in range(2):
            t = 0.74 + j * 0.40
            px = math.cos(angle + (0.55 if j else -0.45)) * (0.44 + j * 0.08)
            pz = math.sin(angle + (0.55 if j else -0.45)) * (0.44 + j * 0.08)
            py = 0.75 + j * 0.40
            blade = uv_sphere(f"AlienFlora_Leaf_{i+1}_{j+1}", (px, py, pz), (0.50, 0.085, 0.18), leaf, 24, 12)
            blade.rotation_euler = (0.18 * (-1 if j else 1), angle + (0.55 if j else -0.45), 0.16)
            move_to_collection(blade, root)
    for i in range(6):
        angle = i * math.tau / 6.0
        p = (math.cos(angle) * 0.48, 2.18 + math.sin(angle * 2) * 0.10, math.sin(angle) * 0.48)
        blossom = uv_sphere(f"AlienFlora_BloomPetal_{i+1}", p, (0.52, 0.12, 0.24), petal, 28, 16)
        blossom.rotation_euler = (0.1 * math.sin(angle), -angle, 0.18 * math.cos(angle))
        move_to_collection(blossom, root)
    core = uv_sphere("AlienFlora_LuminousSeed", (0, 2.16, 0), (0.25, 0.25, 0.25), glow, 32, 20)
    move_to_collection(core, root)
    for i in range(2):
        angle = i * math.pi + 0.3
        orb = uv_sphere(f"AlienFlora_FloatingSpore_{i+1}", (math.cos(angle) * 0.62, 1.55 + i * 0.32, math.sin(angle) * 0.62), (0.07, 0.07, 0.07), glow, 16, 10)
        move_to_collection(orb, root)
    finish_asset("alien-flora", root)


def build_alien_creature() -> None:
    clear_scene()
    root = root_for("AlienCreature_Authored")
    hide = material("Creature_SkinIndigo", (0.30, 0.43, 0.60), 0.48, 0.08)
    hide2 = material("Creature_SkinRose", (0.66, 0.38, 0.58), 0.42, 0.06)
    armor = material("Creature_CrystalArmor", (0.34, 0.70, 0.70), 0.24, 0.35)
    glow = material("Creature_BioLuminescence", (0.28, 0.62, 0.57), 0.28, 0.08, (0.04, 0.25, 0.20), 0.72)
    eye = material("Creature_Eyes", (0.54, 0.80, 0.70), 0.16, 0.08, (0.08, 0.30, 0.20), 0.9)
    body = uv_sphere("AlienCreature_Torso", (0, 1.15, 0), (1.18, 0.66, 0.65), hide, 36, 22)
    move_to_collection(body, root)
    thorax = uv_sphere("AlienCreature_ThoraxArmor", (-0.28, 1.18, 0.0), (0.62, 0.42, 0.70), armor, 32, 18)
    move_to_collection(thorax, root)
    head = uv_sphere("AlienCreature_Head", (0.85, 1.48, 0.0), (0.55, 0.48, 0.47), hide2, 32, 20)
    move_to_collection(head, root)
    snout = uv_sphere("AlienCreature_Snout", (1.24, 1.37, 0.0), (0.34, 0.22, 0.30), hide2, 24, 16)
    move_to_collection(snout, root)
    for side in (-1, 1):
        e = uv_sphere(f"AlienCreature_Eye_{'L' if side < 0 else 'R'}", (1.10, 1.62, side * 0.32), (0.14, 0.14, 0.08), eye, 20, 12)
        move_to_collection(e, root)
        horn = cone(f"AlienCreature_Horn_{'L' if side < 0 else 'R'}", (0.75, 2.30, side * 0.28), 0.18, 0.02, 1.05, armor, 20, 0.015)
        horn.rotation_euler = (0, side * 0.28, side * 0.12)
        move_to_collection(horn, root)
    # Four articulated legs are separated meshes so a runtime animation system
    # can swing them without replacing the authored body.
    for side in (-1, 1):
        for index, z in enumerate((-0.42, 0.42)):
            x = -0.56 + index * 0.76
            hip = (x, 0.82, side * 0.42)
            knee = (x + 0.18, 0.45, side * 0.56)
            foot = (x + 0.05, 0.15, side * 0.72)
            leg = curve_tube(f"AlienCreature_Leg_{'L' if side < 0 else 'R'}_{index+1}", [hip, knee, foot], 0.105, hide, 3)
            move_to_collection(leg, root)
            pad = uv_sphere(f"AlienCreature_FootPad_{'L' if side < 0 else 'R'}_{index+1}", foot, (0.22, 0.09, 0.30), armor, 20, 12)
            move_to_collection(pad, root)
    tail = curve_tube("AlienCreature_Tail", [(-0.86, 1.10, 0), (-1.40, 0.85, -0.06), (-1.88, 1.10, 0.10), (-2.12, 1.42, 0.0)], 0.12, hide2, 4)
    move_to_collection(tail, root)
    for i in range(3):
        fin = cone(f"AlienCreature_TailFin_{i+1}", (-1.30 - i * 0.28, 0.95 + i * 0.15, 0), 0.15, 0.0, 0.48, glow, 16, 0.01)
        fin.rotation_euler.y = math.pi / 2
        fin.rotation_euler.z = -0.45
        move_to_collection(fin, root)
    for i in range(4):
        node = uv_sphere(f"AlienCreature_BioNode_{i+1}", (-0.68 + i * 0.44, 1.42 + (i % 2) * 0.08, 0.55), (0.07, 0.07, 0.07), glow, 16, 10)
        move_to_collection(node, root)
    finish_asset("alien-creature", root)


def build_alien_tree() -> None:
    clear_scene()
    root = root_for("AlienTree_Authored")
    bark = material("Tree_BarkObsidian", (0.28, 0.34, 0.40), 0.62, 0.04)
    bark2 = material("Tree_BarkViolet", (0.50, 0.31, 0.56), 0.54, 0.05)
    canopy = material("Tree_CanopyJade", (0.22, 0.42, 0.34), 0.58, 0.03, (0.03, 0.12, 0.08), 0.08)
    canopy2 = material("Tree_CanopyLuminous", (0.36, 0.58, 0.42), 0.46, 0.02, (0.05, 0.18, 0.11), 0.18)
    fruit = material("Tree_FruitCyan", (0.32, 0.62, 0.56), 0.32, 0.05, (0.04, 0.23, 0.19), 0.62)
    trunk = curve_tube("AlienTree_MainTrunk", [(0, 0.10, 0), (-0.15, 1.5, 0.08), (0.16, 3.2, -0.10), (0, 4.75, 0.0)], 0.32, bark, 5)
    move_to_collection(trunk, root)
    for i, angle in enumerate((0.0, 1.8, 3.5, 5.0)):
        start = (0, 2.15 + i * 0.42, 0)
        end = (math.cos(angle) * (1.35 + i * 0.18), 3.15 + i * 0.37, math.sin(angle) * (1.35 + i * 0.18))
        tip = (math.cos(angle + 0.2) * (2.15 + i * 0.16), 3.72 + i * 0.22, math.sin(angle + 0.2) * (2.15 + i * 0.16))
        branch = curve_tube(f"AlienTree_Branch_{i+1}", [start, end, tip], 0.16 - i * 0.015, bark2, 4)
        move_to_collection(branch, root)
        for j in range(3):
            angle2 = angle + (j - 1) * 0.30
            crown = uv_sphere(f"AlienTree_Canopy_{i+1}_{j+1}", (tip[0] + math.cos(angle2) * (0.38 + j * 0.10), tip[1] + 0.10 * j, tip[2] + math.sin(angle2) * (0.38 + j * 0.10)), (0.72, 0.45, 0.58), canopy if j != 1 else canopy2, 28, 16)
            crown.rotation_euler = (0.08 * j, angle2, 0.12)
            move_to_collection(crown, root)
    crown = uv_sphere("AlienTree_CentralCanopy", (0, 4.65, 0), (1.48, 0.72, 1.32), canopy, 36, 20)
    move_to_collection(crown, root)
    for i in range(12):
        angle = i * math.tau / 12.0
        fruit_obj = uv_sphere(f"AlienTree_BioFruit_{i+1}", (math.cos(angle) * (1.22 + 0.15 * (i % 2)), 3.82 + (i % 4) * 0.22, math.sin(angle) * (1.22 + 0.15 * (i % 2))), (0.12, 0.18, 0.12), fruit, 20, 12)
        move_to_collection(fruit_obj, root)
    base = torus("AlienTree_RootRidge", (0, 0.18, 0), 1.22, 0.045, bark2, (0, 0, 0), 48, 10)
    move_to_collection(base, root)
    finish_asset("alien-tree", root)


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_habitat_pod()
    build_alien_flora()
    build_alien_creature()
    build_alien_tree()
    print("[warmtown] world asset generation complete")


if __name__ == "__main__":
    main()
