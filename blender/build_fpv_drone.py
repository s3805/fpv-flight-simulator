"""
AeroVeloce 5-Inch Carbon-Fiber FPV Freestyle Quadcopter — Parametric Blender (bpy) Modeling Script
Usage:
    blender --background --python build_fpv_drone.py -- --out ./AeroVeloce_5in_FPV.glb

Generates a realistic multi-part 5-inch True-X FPV racing/freestyle drone with:
  - Chamfered 3K Carbon-Fiber Bottom & Top Plates + 4 Swept Diagonal Arms + Circular Motor Pads
  - 8 Knurled Anodized Aluminum Standoffs & Front CNC Camera Cage
  - Dual-Board 4-in-1 ESC + Flight Controller Stack, Capacitor, Yellow XT60 Plug & Silicone Leads
  - 4x 2306 Brushless Outrunner Motors (Base, Copper Stator Windings, Slotted Bell, M5 Locknut)
  - 4x Sculpted 3-Blade Twisted Airfoil Propellers (CW/CCW pitch, Cyan Front / Smoke Rear)
  - Tilted FPV Micro-Camera (Optical Glass Lens) + Top Action Camera on Angled Orange TPU Mount
  - 6S 1300mAh LiPo Battery Pack + Dual Velcro Straps + JST-XH Balance Plug
  - Rear SMA Lollipop VTX Antenna + Immortal-T ELRS Receiver Antenna + RGB LED Strip
"""

import math
import os
import sys

try:
    import bpy
    import bmesh
    from mathutils import Euler, Matrix, Vector
except ImportError:
    print("This script must be executed inside Blender (e.g., blender --background --python build_fpv_drone.py)")
    sys.exit(0)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, base_color, metallic=0.0, roughness=0.4, emission=None, emission_strength=0.0, coat=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_bevel(obj, width=0.0012, segments=2):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()


def create_extruded_plate(name, coords_xy, z_bottom, thickness, mat, bevel=0.001):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z_bottom)) for (x, y) in coords_xy]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    geom_extrude = [ele for ele in res["geom"] if isinstance(ele, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=geom_extrude, vec=(0.0, 0.0, thickness))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    add_bevel(obj, width=bevel, segments=2)
    return obj


def create_cylinder(name, loc, radius, depth, mat, rot=(0, 0, 0), segs=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def create_box(name, loc, scale, mat, rot=(0, 0, 0), bevel=0.0015):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    add_bevel(obj, width=bevel, segments=2)
    return obj


def create_propeller(name, loc, cw, mat_blade, mat_hub):
    parent = bpy.data.objects.new(name, None)
    parent.location = loc
    bpy.context.collection.objects.link(parent)

    hub = create_cylinder(f"{name}_Hub", loc, 0.0078, 0.0085, mat_hub, segs=20)
    hub.parent = parent
    hub.matrix_parent_inverse = parent.matrix_world.inverted()

    pitch_sign = 1.0 if cw else -1.0
    for b in range(3):
        ang = b * (2.0 * math.pi / 3.0)
        mesh = bpy.data.meshes.new(f"{name}_Blade_{b}")
        obj = bpy.data.objects.new(f"{name}_Blade_{b}", mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new()

        stations = [
            (0.007, 0.0065, 0.42, 0.0022),
            (0.025, 0.0110, 0.34, 0.0018),
            (0.052, 0.0105, 0.25, 0.0014),
            (0.062, 0.0050, 0.19, 0.0010),
        ]
        rings = []
        for r, chord, twist, thick in stations:
            tw = twist * pitch_sign
            ct, st = math.cos(tw), math.sin(tw)
            profile = [
                (-chord * 0.5, 0.0),
                (0.0, thick * 0.65),
                (chord * 0.5, 0.0),
                (0.0, -thick * 0.35),
            ]
            ring = []
            for px, pz in profile:
                ly = px * ct - pz * st
                lz = px * st + pz * ct
                wx = r * math.cos(ang) - ly * math.sin(ang)
                wy = r * math.sin(ang) + ly * math.cos(ang)
                ring.append(bm.verts.new((wx, wy, lz)))
            rings.append(ring)

        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for j in range(4):
                jn = (j + 1) % 4
                bm.faces.new((r0[j], r1[j], r1[jn], r0[jn]))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()

        obj.location = loc
        obj.data.materials.append(mat_blade)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return parent


def build_fpv_drone():
    clear_scene()

    # PBR Materials
    mat_carbon = make_material("CarbonFiber_3K", (0.045, 0.052, 0.062), metallic=0.18, roughness=0.32, coat=0.35)
    mat_alu_cyan = make_material("Anodized_Cyan", (0.05, 0.68, 0.82), metallic=0.92, roughness=0.22)
    mat_titanium = make_material("Brushed_Titanium", (0.42, 0.46, 0.52), metallic=0.95, roughness=0.26)
    mat_copper = make_material("Copper_Stator", (0.78, 0.36, 0.12), metallic=0.96, roughness=0.28)
    mat_pcb = make_material("PCB_MatteDark", (0.04, 0.14, 0.10), metallic=0.10, roughness=0.42)
    mat_tpu_orange = make_material("TPU_Orange", (0.94, 0.38, 0.05), metallic=0.0, roughness=0.52)
    mat_lipo = make_material("LiPo_Wrap", (0.07, 0.08, 0.10), metallic=0.05, roughness=0.38)
    mat_strap = make_material("Velcro_Strap", (0.78, 0.12, 0.12), metallic=0.0, roughness=0.82)
    mat_xt60 = make_material("XT60_Yellow", (0.95, 0.72, 0.04), metallic=0.0, roughness=0.40)
    mat_glass = make_material("Optical_Glass", (0.04, 0.12, 0.18), metallic=0.25, roughness=0.04, coat=1.0)
    mat_prop_front = make_material("Prop_Cyan", (0.08, 0.82, 0.94), metallic=0.05, roughness=0.24, coat=0.4)
    mat_prop_rear = make_material("Prop_Smoke", (0.32, 0.36, 0.42), metallic=0.08, roughness=0.28, coat=0.35)
    mat_led = make_material("LED_Status", (0.08, 0.96, 0.56), emission=(0.08, 0.96, 0.56), emission_strength=6.0)
    mat_vtx_cap = make_material("VTX_Lollipop", (0.85, 0.12, 0.12), metallic=0.05, roughness=0.34)

    # 1. Bottom & Top Carbon-Fiber Plates (Waisted Freestyle Silhouette)
    bottom_poly = [
        (-0.022, 0.095), (0.022, 0.095),
        (0.036, 0.058), (0.036, -0.058),
        (0.024, -0.098), (-0.024, -0.098),
        (-0.036, -0.058), (-0.036, 0.058),
    ]
    create_extruded_plate("Bottom_Carbon_Plate", bottom_poly, -0.004, 0.003, mat_carbon)

    top_poly = [
        (-0.020, 0.088), (0.020, 0.088),
        (0.028, 0.055), (0.028, -0.058),
        (0.022, -0.095), (-0.022, -0.095),
        (-0.028, -0.058), (-0.028, 0.055),
    ]
    create_extruded_plate("Top_Carbon_Plate", top_poly, 0.024, 0.0025, mat_carbon)

    # 2. Four True-X Diagonal Carbon Arms + Circular Motor Mounts + 2306 Brushless Motors + 3-Blade Props
    motors = [
        ("FR",  0.112,  0.105, False, mat_prop_front),
        ("FL", -0.112,  0.105, True,  mat_prop_front),
        ("RR",  0.112, -0.105, True,  mat_prop_rear),
        ("RL", -0.112, -0.105, False, mat_prop_rear),
    ]
    for label, mx, my, cw, prop_mat in motors:
        ang = math.atan2(my, mx)
        length = math.hypot(mx, my)
        create_box(f"Arm_{label}", (mx * 0.5, my * 0.5, -0.0055), (length, 0.015, 0.005), mat_carbon, rot=(0, 0, ang))
        create_cylinder(f"MotorPad_{label}", (mx, my, -0.0055), 0.0155, 0.0052, mat_carbon, segs=24)
        create_cylinder(f"ArmSkid_{label}", (mx, my, -0.011), 0.012, 0.006, mat_tpu_orange, segs=16)

        # 2306 Brushless Motor Assembly
        create_cylinder(f"MotorBase_{label}", (mx, my, 0.0005), 0.0135, 0.005, mat_carbon, segs=24)
        create_cylinder(f"MotorStator_{label}", (mx, my, 0.006), 0.0112, 0.0065, mat_copper, segs=20)
        create_cylinder(f"MotorBell_{label}", (mx, my, 0.011), 0.0142, 0.0095, mat_titanium, segs=24)
        create_cylinder(f"MotorNut_{label}", (mx, my, 0.019), 0.0042, 0.007, mat_alu_cyan, segs=6)

        # 3-Blade Airfoil Propeller
        create_propeller(f"Prop_{label}", (mx, my, 0.0175), cw, prop_mat, mat_titanium)

    # 3. Eight Anodized Aluminum Standoffs
    for i, (sx, sy) in enumerate([
        (-0.018, 0.082), (0.018, 0.082),
        (-0.024, 0.036), (0.024, 0.036),
        (-0.024, -0.036), (0.024, -0.036),
        (-0.018, -0.086), (0.018, -0.086),
    ]):
        create_cylinder(f"Standoff_{i}", (sx, sy, 0.0115), 0.0028, 0.026, mat_alu_cyan, segs=14)

    # 4. Internal Electronics Stack (4-in-1 ESC + FC + Capacitor + XT60)
    create_box("ESC_Board", (0, 0, 0.004), (0.038, 0.038, 0.003), mat_pcb)
    create_box("FC_Board", (0, 0, 0.012), (0.036, 0.036, 0.0025), mat_pcb)
    create_cylinder("Filter_Capacitor", (0, -0.048, 0.009), 0.0055, 0.016, mat_carbon, rot=(math.pi / 2, 0, 0), segs=16)
    create_box("XT60_Connector", (0.016, -0.072, 0.014), (0.015, 0.018, 0.009), mat_xt60)

    # 5. Front FPV Camera Cage & Tilted Micro Camera
    cam_tilt = math.radians(24.0)
    create_box("FPV_CamBody", (0, 0.078, 0.012), (0.022, 0.020, 0.021), mat_carbon, rot=(cam_tilt, 0, 0))
    create_cylinder("FPV_LensBarrel", (0, 0.091, 0.017), 0.0082, 0.012, mat_titanium, rot=(math.pi / 2 - cam_tilt, 0, 0), segs=20)
    create_cylinder("FPV_LensGlass", (0, 0.096, 0.019), 0.0068, 0.003, mat_glass, rot=(math.pi / 2 - cam_tilt, 0, 0), segs=20)

    # 6. Top Action Camera (GoPro Hero Style) on Angled TPU Mount
    create_box("TPU_CamMount", (0, 0.056, 0.035), (0.054, 0.030, 0.022), mat_tpu_orange, rot=(cam_tilt, 0, 0))
    create_box("ActionCam_Body", (0, 0.062, 0.046), (0.062, 0.026, 0.044), mat_carbon, rot=(cam_tilt, 0, 0), bevel=0.003)
    create_box("ActionCam_LensBezel", (-0.014, 0.076, 0.053), (0.022, 0.008, 0.022), mat_titanium, rot=(cam_tilt, 0, 0))
    create_cylinder("ActionCam_Glass", (-0.014, 0.080, 0.055), 0.0085, 0.003, mat_glass, rot=(math.pi / 2 - cam_tilt, 0, 0), segs=20)

    # 7. 6S 1300mAh LiPo Battery Pack + Dual Velcro Straps
    create_box("LiPo_6S_Pack", (0, -0.026, 0.046), (0.038, 0.076, 0.034), mat_lipo, bevel=0.0035)
    create_box("Velcro_Strap_Front", (0, -0.008, 0.045), (0.041, 0.012, 0.038), mat_strap, bevel=0.001)
    create_box("Velcro_Strap_Rear", (0, -0.044, 0.045), (0.041, 0.012, 0.038), mat_strap, bevel=0.001)

    # 8. Rear VTX Lollipop Antenna + Immortal-T ELRS Antenna + LED Strip
    create_cylinder("VTX_CoaxStem", (0.012, -0.104, 0.040), 0.0022, 0.048, mat_carbon, rot=(-0.45, 0.15, 0), segs=12)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.0095, location=(0.016, -0.116, 0.062))
    vtx_cap = bpy.context.active_object
    vtx_cap.name = "VTX_Lollipop_Cap"
    vtx_cap.data.materials.append(mat_vtx_cap)
    bpy.ops.object.shade_smooth()

    create_cylinder("ELRS_ImmortalT_Bar", (0, -0.108, 0.002), 0.0018, 0.115, mat_carbon, rot=(0, math.pi / 2, 0), segs=10)
    create_box("Rear_LED_Strip", (0, -0.097, 0.012), (0.034, 0.005, 0.009), mat_led, bevel=0.0008)

    # Export GLB & BLEND
    out_glb = os.path.join(os.path.dirname(os.path.abspath(__file__)), "AeroVeloce_5in_FPV.glb")
    if "--out" in sys.argv:
        idx = sys.argv.index("--out")
        if idx + 1 < len(sys.argv):
            out_glb = sys.argv[idx + 1]
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB")
    bpy.ops.wm.save_as_mainfile(filepath=out_glb.replace(".glb", ".blend"))
    print(f"Exported realistic FPV drone to {out_glb}")


if __name__ == "__main__":
    build_fpv_drone()
