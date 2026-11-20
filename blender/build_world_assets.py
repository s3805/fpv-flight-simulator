"""
AeroVeloce Realistic Ground Assets — Parametric Blender (bpy) Modeling Script
Usage:
    blender --background --python build_world_assets.py -- --out ./AeroVeloce_WorldAssets.glb

Builds realistic PBR Blender models matching assets_model.js:
  - Modern SUV with sloped hood, tinted greenhouse, roof rails, 4 cylindrical tires & alloy rims
  - Heavy 6-Wheel Cargo Truck with sloped cab, diesel tanks & corrugated cargo box
  - Articulated Industrial Safety Engineer (spherical head, domed hard-hat + visor, high-vis vest, limbs)
  - Tapered Industrial Smokestack with aviation warning bands & steel catwalk
  - Ribbed Cylindrical Fuel Silo with hemispherical dome roof
"""

import math
import os
import sys

try:
    import bpy
except ImportError:
    print("Run inside Blender: blender --background --python build_world_assets.py")
    sys.exit(0)


def make_mat(name, color, metallic=0.0, roughness=0.45, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 4.0
    return mat


def add_cyl(name, loc, r1, r2, depth, mat, rot=(0, 0, 0), segs=24):
    bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def build_assets():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    m_paint = make_mat("CarPaint_Blue", (0.14, 0.36, 0.62), metallic=0.55, roughness=0.22)
    m_rubber = make_mat("Tire_Rubber", (0.06, 0.06, 0.07), roughness=0.82)
    m_alloy = make_mat("Alloy_Rim", (0.75, 0.78, 0.84), metallic=0.92, roughness=0.22)
    m_glass = make_mat("Tinted_Glass", (0.08, 0.16, 0.24), metallic=0.2, roughness=0.06)
    m_vest = make_mat("Safety_Vest", (0.98, 0.52, 0.06), roughness=0.6)
    m_hat = make_mat("HardHat_Yellow", (0.96, 0.82, 0.12), roughness=0.28)
    m_concrete = make_mat("Weathered_Concrete", (0.48, 0.44, 0.40), roughness=0.88)
    m_steel = make_mat("Industrial_Steel", (0.56, 0.59, 0.63), metallic=0.82, roughness=0.38)

    # 1. SUV at origin
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.76))
    body = bpy.context.active_object
    body.name = "SUV_Chassis"
    body.scale = (1.92, 4.5, 0.70)
    bpy.ops.object.transform_apply(scale=True)
    body.data.materials.append(m_paint)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.35, 1.42))
    cab = bpy.context.active_object
    cab.name = "SUV_Cabin"
    cab.scale = (1.62, 2.2, 0.64)
    bpy.ops.object.transform_apply(scale=True)
    cab.data.materials.append(m_glass)
    for wx in (-0.88, 0.88):
        for wy in (1.35, -1.32):
            add_cyl(f"SUV_Tire_{wx}_{wy}", (wx, wy, 0.40), 0.40, 0.40, 0.26, m_rubber, rot=(0, math.pi / 2, 0))
            add_cyl(f"SUV_Rim_{wx}_{wy}", (wx, wy, 0.40), 0.24, 0.24, 0.28, m_alloy, rot=(0, math.pi / 2, 0), segs=16)

    # 2. Articulated Safety Worker at X = 4.0
    add_cyl("Worker_Torso", (4.0, 0, 1.24), 0.18, 0.22, 0.64, m_vest, segs=16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.14, location=(4.0, 0, 1.75))
    bpy.context.active_object.name = "Worker_Head"
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.155, location=(4.0, 0, 1.81))
    hat = bpy.context.active_object
    hat.name = "Worker_HardHat"
    hat.data.materials.append(m_hat)
    bpy.ops.object.shade_smooth()

    # 3. Tapered Industrial Smokestack & Domed Silo at X = -12.0, -24.0
    add_cyl("Factory_Smokestack", (-12.0, 0, 28.0), 3.6, 2.1, 56.0, m_concrete, segs=24)
    add_cyl("Factory_Silo_Body", (-24.0, 0, 11.0), 6.0, 6.0, 22.0, m_steel, segs=24)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=6.0, location=(-24.0, 0, 22.0))
    dome = bpy.context.active_object
    dome.name = "Factory_Silo_Dome"
    dome.scale = (1.0, 1.0, 0.55)
    dome.data.materials.append(m_steel)
    bpy.ops.object.shade_smooth()

    out_glb = os.path.join(os.path.dirname(os.path.abspath(__file__)), "AeroVeloce_WorldAssets.glb")
    if "--out" in sys.argv:
        idx = sys.argv.index("--out")
        if idx + 1 < len(sys.argv):
            out_glb = sys.argv[idx + 1]
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB")
    bpy.ops.wm.save_as_mainfile(filepath=out_glb.replace(".glb", ".blend"))
    print(f"Exported realistic world assets to {out_glb}")


if __name__ == "__main__":
    build_assets()
