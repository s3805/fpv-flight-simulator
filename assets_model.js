// AeroVeloce Realistic World Assets — High-Detail Buildings, Vehicles, Articulated Pedestrians & Landmarks
// Smooth-shaded cylindrical, domed, sloped & articulated solid geometry for real-time 60 FPS WebGL
(function (global) {
  "use strict";

  class AssetMesh {
    constructor(targetData) {
      this.data = targetData || [];
    }

    pushSmoothTri(p1, n1, c1, p2, n2, c2, p3, n3, c3, em) {
      const e = em || 0;
      this.data.push(
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], c1[0], c1[1], c1[2], e,
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], c2[0], c2[1], c2[2], e,
        p3[0], p3[1], p3[2], n3[0], n3[1], n3[2], c3[0], c3[1], c3[2], e
      );
    }

    pushTri(p1, p2, p3, col, em) {
      const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
      const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const n = [nx, ny, nz];
      this.pushSmoothTri(p1, n, col, p2, n, col, p3, n, col, em);
    }

    pushQuad(p1, p2, p3, p4, col, em) {
      this.pushTri(p1, p2, p3, col, em);
      this.pushTri(p1, p3, p4, col, em);
    }

    pushBox(cx, cy, cz, sx, sy, sz, col, em, tf) {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const c = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy,  hz], [hx, -hy,  hz], [hx, hy,  hz], [-hx, hy,  hz]
      ].map((p) => (tf ? tf(p[0], p[1], p[2], cx, cy, cz) : [cx + p[0], cy + p[1], cz + p[2]]));
      this.pushQuad(c[4], c[5], c[6], c[7], col, em);
      this.pushQuad(c[1], c[0], c[3], c[2], col, em);
      this.pushQuad(c[5], c[1], c[2], c[6], col, em);
      this.pushQuad(c[0], c[4], c[7], c[3], col, em);
      this.pushQuad(c[7], c[6], c[2], c[3], col, em);
      this.pushQuad(c[0], c[1], c[5], c[4], col, em);
    }

    // Sloped trapezoidal prism (e.g., car hood, windshield cabin, pitched roof)
    // Extrudes a 2D polygon in YZ plane along X from -halfW to +halfW
    pushProfileX(cx, cy, cz, halfW, polyYZ, col, em, tf) {
      const n = polyYZ.length;
      const xform = (x, y, z) => (tf ? tf(x, y, z, cx, cy, cz) : [cx + x, cy + y, cz + z]);
      let my = 0, mz = 0;
      for (const p of polyYZ) { my += p[0]; mz += p[1]; }
      my /= n; mz /= n;
      const lc = xform(-halfW, my, mz), rc = xform(halfW, my, mz);
      for (let i = 0; i < n; i++) {
        const a = polyYZ[i], b = polyYZ[(i + 1) % n];
        const lA = xform(-halfW, a[0], a[1]), lB = xform(-halfW, b[0], b[1]);
        const rA = xform( halfW, a[0], a[1]), rB = xform( halfW, b[0], b[1]);
        this.pushTri(rc, rA, rB, col, em);
        this.pushTri(lc, lB, lA, col, em);
        this.pushQuad(lA, rA, rB, lB, col, em);
      }
    }

    // Smooth-shaded cylinder or tapered cone frustum along local Y
    pushCylinder(cx, cy, cz, rBot, rTop, height, segs, col, em, tf) {
      const hy = height * 0.5;
      const xform = (x, y, z) => (tf ? tf(x, y, z, cx, cy, cz) : [cx + x, cy + y, cz + z]);
      const xformN = (nx, ny, nz) => {
        if (!tf) return [nx, ny, nz];
        const o = tf(0, 0, 0, cx, cy, cz);
        const p = tf(nx, ny, nz, cx, cy, cz);
        let dx = p[0] - o[0], dy = p[1] - o[1], dz = p[2] - o[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        return [dx / l, dy / l, dz / l];
      };
      const topC = xform(0, hy, 0), botC = xform(0, -hy, 0);
      const topN = xformN(0, 1, 0), botN = xformN(0, -1, 0);
      const slopeY = (rBot - rTop) / Math.max(0.001, height);

      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const b0 = xform(c0 * rBot, -hy, s0 * rBot);
        const b1 = xform(c1 * rBot, -hy, s1 * rBot);
        const t0 = xform(c0 * rTop,  hy, s0 * rTop);
        const t1 = xform(c1 * rTop,  hy, s1 * rTop);
        const nl = Math.hypot(1, slopeY) || 1;
        const n0 = xformN(c0 / nl, slopeY / nl, s0 / nl);
        const n1 = xformN(c1 / nl, slopeY / nl, s1 / nl);

        this.pushSmoothTri(b0, n0, col, t0, n0, col, t1, n1, col, em);
        this.pushSmoothTri(b0, n0, col, t1, n1, col, b1, n1, col, em);
        if (rTop > 0.002) this.pushSmoothTri(topC, topN, col, t1, topN, col, t0, topN, col, em);
        if (rBot > 0.002) this.pushSmoothTri(botC, botN, col, b0, botN, col, b1, botN, col, em);
      }
    }

    // Smooth UV sphere or hemisphere (hemiOnly = true draws upper dome)
    pushSphere(cx, cy, cz, rx, ry, rz, segs, rings, col, em, hemiOnly, tf) {
      const maxRing = hemiOnly ? Math.floor(rings * 0.5) : rings;
      const xform = (x, y, z) => (tf ? tf(x, y, z, cx, cy, cz) : [cx + x, cy + y, cz + z]);
      for (let j = 0; j < maxRing; j++) {
        const p0 = (j / rings) * Math.PI, p1 = ((j + 1) / rings) * Math.PI;
        const sp0 = Math.sin(p0), cp0 = Math.cos(p0), sp1 = Math.sin(p1), cp1 = Math.cos(p1);
        for (let i = 0; i < segs; i++) {
          const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2;
          const n00 = [sp0 * Math.cos(t0), cp0, sp0 * Math.sin(t0)];
          const n10 = [sp0 * Math.cos(t1), cp0, sp0 * Math.sin(t1)];
          const n01 = [sp1 * Math.cos(t0), cp1, sp1 * Math.sin(t0)];
          const n11 = [sp1 * Math.cos(t1), cp1, sp1 * Math.sin(t1)];
          const v00 = xform(n00[0] * rx, n00[1] * ry, n00[2] * rz);
          const v10 = xform(n10[0] * rx, n10[1] * ry, n10[2] * rz);
          const v01 = xform(n01[0] * rx, n01[1] * ry, n01[2] * rz);
          const v11 = xform(n11[0] * rx, n11[1] * ry, n11[2] * rz);
          if (j > 0) this.pushSmoothTri(v00, n00, col, v10, n10, col, v11, n11, col, em);
          if (j < rings - 1) this.pushSmoothTri(v00, n00, col, v11, n11, col, v01, n01, col, em);
        }
      }
    }

    toFloat32() {
      return new Float32Array(this.data);
    }
  }

  const rotZ90 = (lx, ly, lz, ox, oy, oz) => [ox - ly, oy + lx, oz + lz];
  const rotX90 = (lx, ly, lz, ox, oy, oz) => [ox + lx, oy - lz, oz + ly];

  // =========================================================================
  // 1. REALISTIC VEHICLES (Pre-baked GPU VBOs per vehicle, rendered with PBR)
  // Local space: +Z = forward, +Y = up, +X = left
  // =========================================================================
  function buildVehicleMesh(v) {
    const mb = new AssetMesh();
    const bodyCol = v.color;
    const darkTrim = [0.13, 0.15, 0.18];
    const tireCol  = [0.09, 0.10, 0.11];
    const rimCol   = [0.74, 0.78, 0.84];
    const glassCol = [0.14, 0.25, 0.34];
    const chrome   = [0.80, 0.83, 0.87];
    const headCol  = [1.0, 0.96, 0.82];
    const tailCol  = [0.98, 0.16, 0.16];
    const hw = v.wid * 0.5;
    const hl = v.len * 0.5;

    const addWheel = (wx, wy, wz, rad, thick) => {
      mb.pushCylinder(wx, wy, wz, rad, rad, thick, 14, tireCol, 0, rotZ90);
      mb.pushCylinder(wx + (wx > 0 ? 0.02 : -0.02), wy, wz, rad * 0.58, rad * 0.58, thick + 0.02, 10, rimCol, 0.06, rotZ90);
      mb.pushCylinder(wx + (wx > 0 ? 0.03 : -0.03), wy, wz, rad * 0.22, rad * 0.22, thick + 0.04, 8, darkTrim, 0, rotZ90);
    };

    if (v.type === "truck") {
      // Heavy 6-wheel Cargo Truck
      const wr = 0.52;
      addWheel(-hw + 0.14, wr,  hl * 0.62, wr, 0.34);
      addWheel( hw - 0.14, wr,  hl * 0.62, wr, 0.34);
      addWheel(-hw + 0.16, wr, -hl * 0.28, wr, 0.42);
      addWheel( hw - 0.16, wr, -hl * 0.28, wr, 0.42);
      addWheel(-hw + 0.16, wr, -hl * 0.68, wr, 0.42);
      addWheel( hw - 0.16, wr, -hl * 0.68, wr, 0.42);

      // Steel chassis rails & cylindrical diesel fuel tanks
      mb.pushBox(0, 0.76, 0, v.wid * 0.76, 0.32, v.len * 0.92, darkTrim, 0);
      mb.pushCylinder(-hw + 0.28, 0.72, hl * 0.16, 0.26, 0.26, 1.35, 12, chrome, 0.04, rotX90);
      mb.pushCylinder( hw - 0.28, 0.72, hl * 0.16, 0.26, 0.26, 1.35, 12, chrome, 0.04, rotX90);

      // Sloped Aerodynamic Cab (front +Z)
      mb.pushProfileX(0, 0, 0, hw * 0.92, [
        [0.82, hl * 0.98], [1.62, hl * 0.96], [2.42, hl * 0.76],
        [2.78, hl * 0.66], [2.78, hl * 0.26], [0.82, hl * 0.26]
      ], bodyCol, 0);
      // Tinted sloped windshield & side windows
      mb.pushProfileX(0, 0, 0, hw * 0.84, [
        [1.68, hl * 0.95], [2.48, hl * 0.76], [2.48, hl * 0.72], [1.68, hl * 0.91]
      ], glassCol, 0.14);
      mb.pushBox(0, 2.08, hl * 0.54, v.wid * 0.94, 0.68, hl * 0.42, glassCol, 0.12);
      // Front bumper & radiator grille
      mb.pushBox(0, 0.68, hl * 1.01, v.wid * 0.96, 0.32, 0.22, darkTrim, 0);
      mb.pushBox(0, 1.24, hl * 0.99, v.wid * 0.62, 0.54, 0.08, darkTrim, 0);
      // Side mirrors
      mb.pushBox(-hw - 0.10, 2.05, hl * 0.76, 0.12, 0.44, 0.16, darkTrim, 0);
      mb.pushBox( hw + 0.10, 2.05, hl * 0.76, 0.12, 0.44, 0.16, darkTrim, 0);

      // Ribbed Cargo Container Box (rear)
      const cargoLen = v.len * 0.64;
      const cargoZ = -hl * 0.34;
      mb.pushBox(0, 2.02, cargoZ, v.wid * 0.98, 2.12, cargoLen, [0.84, 0.86, 0.88], 0);
      mb.pushBox(0, 3.09, cargoZ, v.wid * 0.94, 0.10, cargoLen * 0.98, [0.72, 0.75, 0.79], 0);
      for (let rz = -cargoLen * 0.44; rz <= cargoLen * 0.44; rz += 0.72) {
        mb.pushBox(0, 2.02, cargoZ + rz, v.wid * 1.01, 1.92, 0.10, [0.74, 0.77, 0.80], 0);
      }
      // Twin Headlights & Taillights
      mb.pushBox(-hw * 0.68, 1.08, hl * 1.01, 0.42, 0.24, 0.10, headCol, 1.0);
      mb.pushBox( hw * 0.68, 1.08, hl * 1.01, 0.42, 0.24, 0.10, headCol, 1.0);
      mb.pushBox(-hw * 0.72, 0.94, -hl * 0.98, 0.44, 0.22, 0.10, tailCol, 1.0);
      mb.pushBox( hw * 0.72, 0.94, -hl * 0.98, 0.44, 0.22, 0.10, tailCol, 1.0);
    } else if (v.type === "van") {
      // Aerodynamic Service Van
      const wr = 0.40;
      addWheel(-hw + 0.10, wr,  hl * 0.58, wr, 0.26);
      addWheel( hw - 0.10, wr,  hl * 0.58, wr, 0.26);
      addWheel(-hw + 0.10, wr, -hl * 0.56, wr, 0.26);
      addWheel( hw - 0.10, wr, -hl * 0.56, wr, 0.26);

      // Sloped van silhouette
      mb.pushProfileX(0, 0, 0, hw * 0.94, [
        [0.44,  hl * 0.98], [1.14,  hl * 0.96], [1.38,  hl * 0.82],
        [2.08,  hl * 0.50], [2.16, -hl * 0.88], [1.96, -hl * 0.98],
        [0.44, -hl * 0.98]
      ], bodyCol, 0);
      // Windshield & side windows
      mb.pushProfileX(0, 0, 0, hw * 0.86, [
        [1.38, hl * 0.84], [2.04, hl * 0.52], [2.04, hl * 0.48], [1.38, hl * 0.79]
      ], glassCol, 0.16);
      mb.pushBox(0, 1.62, hl * 0.32, v.wid * 0.96, 0.52, hl * 0.54, glassCol, 0.14);
      // Front/rear bumpers & roof rack
      mb.pushBox(0, 0.48,  hl * 0.99, v.wid * 0.96, 0.24, 0.18, darkTrim, 0);
      mb.pushBox(0, 0.48, -hl * 0.99, v.wid * 0.96, 0.24, 0.18, darkTrim, 0);
      mb.pushBox(-hw * 0.72, 2.24, -hl * 0.18, 0.08, 0.10, v.len * 0.62, darkTrim, 0);
      mb.pushBox( hw * 0.72, 2.24, -hl * 0.18, 0.08, 0.10, v.len * 0.62, darkTrim, 0);
      // Patrol beacon if factory loop vehicle
      if (v.mode === "loop") {
        mb.pushCylinder(0, 2.34, hl * 0.24, 0.16, 0.13, 0.22, 12, [1.0, 0.58, 0.06], 0.95);
      }
      mb.pushBox(-hw * 0.68, 0.94,  hl * 0.99, 0.36, 0.20, 0.08, headCol, 1.0);
      mb.pushBox( hw * 0.68, 0.94,  hl * 0.99, 0.36, 0.20, 0.08, headCol, 1.0);
      mb.pushBox(-hw * 0.72, 0.92, -hl * 0.99, 0.34, 0.24, 0.08, tailCol, 1.0);
      mb.pushBox( hw * 0.72, 0.92, -hl * 0.99, 0.34, 0.24, 0.08, tailCol, 1.0);
    } else {
      // Sculpted Modern SUV
      const wr = 0.40;
      addWheel(-hw + 0.10, wr,  hl * 0.58, wr, 0.26);
      addWheel( hw - 0.10, wr,  hl * 0.58, wr, 0.26);
      addWheel(-hw + 0.10, wr, -hl * 0.56, wr, 0.26);
      addWheel( hw - 0.10, wr, -hl * 0.56, wr, 0.26);

      // Lower body with sloped hood
      mb.pushProfileX(0, 0, 0, hw * 0.95, [
        [0.42,  hl * 0.98], [0.98,  hl * 0.96], [1.14,  hl * 0.56],
        [1.16, -hl * 0.94], [0.42, -hl * 0.98]
      ], bodyCol, 0);
      // Tapered upper greenhouse cabin
      mb.pushProfileX(0, 0, 0, hw * 0.80, [
        [1.10,  hl * 0.54], [1.74,  hl * 0.18], [1.76, -hl * 0.64],
        [1.14, -hl * 0.90]
      ], bodyCol, 0);
      // Tinted wrap-around windshield + side glass + rear window
      mb.pushProfileX(0, 0, 0, hw * 0.74, [
        [1.14, hl * 0.53], [1.70, hl * 0.20], [1.70, hl * 0.16], [1.14, hl * 0.48]
      ], glassCol, 0.18);
      mb.pushBox(0, 1.44, -hl * 0.24, v.wid * 0.83, 0.46, v.len * 0.44, glassCol, 0.16);
      // Front grille, bumpers, roof rails
      mb.pushBox(0, 0.48,  hl * 0.99, v.wid * 0.96, 0.24, 0.16, darkTrim, 0);
      mb.pushBox(0, 0.48, -hl * 0.99, v.wid * 0.96, 0.24, 0.16, darkTrim, 0);
      mb.pushBox(0, 0.82,  hl * 0.98, v.wid * 0.52, 0.26, 0.08, darkTrim, 0);
      mb.pushBox(-hw * 0.64, 1.82, -hl * 0.22, 0.07, 0.08, v.len * 0.42, chrome, 0.05);
      mb.pushBox( hw * 0.64, 1.82, -hl * 0.22, 0.07, 0.08, v.len * 0.42, chrome, 0.05);
      if (v.mode === "loop") {
        mb.pushCylinder(0, 1.92, 0, 0.14, 0.11, 0.20, 12, [1.0, 0.58, 0.06], 0.95);
      }
      // Twin Headlights & Taillights
      mb.pushBox(-hw * 0.68, 0.84,  hl * 0.98, 0.36, 0.18, 0.08, headCol, 1.0);
      mb.pushBox( hw * 0.68, 0.84,  hl * 0.98, 0.36, 0.18, 0.08, headCol, 1.0);
      mb.pushBox(-hw * 0.68, 0.90, -hl * 0.97, 0.38, 0.18, 0.08, tailCol, 1.0);
      mb.pushBox( hw * 0.68, 0.90, -hl * 0.97, 0.38, 0.18, 0.08, tailCol, 1.0);
    }

    return mb.toFloat32();
  }

  // =========================================================================
  // 2. ARTICULATED SMOOTH-SHADED HUMAN PEDESTRIANS (Safety Engineers / Hikers)
  // =========================================================================
  function pushRealisticPedestrian(targetData, p) {
    const mb = new AssetMesh(targetData);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const pTf = (lx, ly, lz, ox, oy, oz) => {
      const px = lx + ox, py = ly + oy, pz = lz + oz;
      return [p.x + px * cy + pz * sy, p.y + py, p.z - px * sy + pz * cy];
    };

    const bob = Math.abs(Math.sin(p.phase)) * 0.035;
    const skinCol   = [0.88, 0.72, 0.58];
    const pantsCol  = [0.16, 0.21, 0.28];
    const bootCol   = [0.12, 0.10, 0.09];
    const sleeveCol = [0.22, 0.28, 0.36];
    const stripeCol = [0.92, 0.96, 0.98];
    const hatCol    = [0.96, 0.84, 0.14];

    // Rotate local offset (lx, ly, lz) around a joint pivot (jx, jy, jz) in the sagittal YZ plane:
    // Positive angle swings a downward limb (-Y) FORWARD (+Z).
    const jointPivotTf = (jx, jy, jz, ang, localOffY, localOffZ) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      return (lx, ly, lz) => {
        const py = ly + (localOffY || 0);
        const pz = lz + (localOffZ || 0);
        const ry = py * c + pz * s;
        const rz = -py * s + pz * c;
        return pTf(lx, ry, rz, jx, jy, jz);
      };
    };

    // 1. Hierarchical Articulated Legs (Hip -> Thigh -> Knee Bend -> Shin -> Attached Boot)
    const hipY = 0.88 + bob;
    const L1 = 0.42, L2 = 0.40;
    for (const [side, ph] of [[-0.125, p.phase], [0.125, p.phase + Math.PI]]) {
      const thighAng = Math.sin(ph) * 0.42;
      // Natural knee bend (always bends backward, greatest during forward swing recovery)
      const kneeBend = Math.max(0, Math.cos(ph)) * 0.48 + 0.06;
      const shinAng = thighAng - kneeBend;

      // Hip cap + Thigh cylinder pivoting from hip downward (-L1/2)
      mb.pushSphere(side, hipY, 0, 0.088, 0.088, 0.088, 8, 6, pantsCol, 0, false, pTf);
      mb.pushCylinder(0, 0, 0, 0.078, 0.092, L1, 8, pantsCol, 0, jointPivotTf(side, hipY, 0, thighAng, -L1 * 0.5, 0));

      // Exact knee joint world-local position
      const kneeY = hipY - L1 * Math.cos(thighAng);
      const kneeZ = L1 * Math.sin(thighAng);
      mb.pushSphere(side, kneeY, kneeZ, 0.076, 0.076, 0.076, 8, 6, pantsCol, 0, false, pTf);

      // Shin cylinder pivoting from knee downward (-L2/2)
      mb.pushCylinder(0, 0, 0, 0.064, 0.076, L2, 8, pantsCol, 0, jointPivotTf(side, kneeY, kneeZ, shinAng, -L2 * 0.5, 0));

      // Exact ankle position + attached Work Boot
      const ankleY = kneeY - L2 * Math.cos(shinAng);
      const ankleZ = kneeZ + L2 * Math.sin(shinAng);
      mb.pushBox(0, 0, 0, 0.13, 0.11, 0.25, bootCol, 0, jointPivotTf(side, ankleY, ankleZ, shinAng * 0.4, -0.04, 0.055));
    }

    // 2. Tapered Torso in High-Visibility Safety Vest + Reflective Stripes
    const torsoY = 1.22 + bob;
    mb.pushCylinder(0, torsoY, 0, 0.175, 0.215, 0.64, 10, p.vest, 0.35, pTf);
    mb.pushCylinder(0, torsoY - 0.12, 0, 0.190, 0.200, 0.055, 10, stripeCol, 0.75, pTf);
    mb.pushCylinder(0, torsoY + 0.08, 0, 0.208, 0.216, 0.055, 10, stripeCol, 0.75, pTf);

    // 3. Hierarchical Articulated Arms (Shoulder -> Arm -> Attached Hand, swinging opposite to legs)
    const shY = 1.46 + bob;
    const armLen = 0.50;
    for (const [side, ph] of [[-0.26, p.phase + Math.PI], [0.26, p.phase]]) {
      const armAng = Math.sin(ph) * 0.38;
      mb.pushSphere(side, shY, 0, 0.074, 0.074, 0.074, 8, 6, sleeveCol, 0, false, pTf);
      mb.pushCylinder(0, 0, 0, 0.052, 0.066, armLen, 8, sleeveCol, 0, jointPivotTf(side, shY, 0, armAng, -armLen * 0.5, 0));
      const wristY = shY - armLen * Math.cos(armAng);
      const wristZ = armLen * Math.sin(armAng);
      mb.pushSphere(side, wristY, wristZ, 0.054, 0.058, 0.054, 8, 6, skinCol, 0, false, pTf);
    }

    // 4. Neck, Smooth Spherical Head & Domed Safety Hard-Hat with Front Visor Brim
    mb.pushCylinder(0, 1.58 + bob, 0, 0.064, 0.058, 0.12, 8, skinCol, 0, pTf);
    mb.pushSphere(0, 1.73 + bob, 0, 0.132, 0.148, 0.138, 10, 8, skinCol, 0, false, pTf);
    mb.pushSphere(0, 1.77 + bob, 0, 0.152, 0.128, 0.158, 10, 8, hatCol, 0.25, true, pTf);
    mb.pushBox(0, 1.77 + bob, 0.13, 0.21, 0.024, 0.13, hatCol, 0.25, pTf);
  }

  // =========================================================================
  // 3. REALISTIC INDUSTRIAL FACTORY & WORLD LANDMARKS
  // =========================================================================
  function pushRealisticFactory(targetData, factory, getH) {
    const mb = new AssetMesh(targetData);
    const baseY = getH(0, -125);
    const hallZ = -125, hallH = 22;
    const concreteWall = [0.54, 0.55, 0.53];
    const concreteDark = [0.36, 0.38, 0.40];
    const concreteWeathered = [0.46, 0.47, 0.44];
    const rustSteel = [0.44, 0.27, 0.20];
    const craneYellow = [0.82, 0.62, 0.14];
    const warnRed = [0.88, 0.20, 0.18];
    const windowGlow = [0.96, 0.78, 0.42];
    const glassDark = [0.16, 0.24, 0.30];

    // 1. Concrete Factory Yard Apron + Perimeter Safety Curbs (0.36m thick slab cleanly above valley floor)
    mb.pushBox(0, baseY + 0.18, hallZ, 165, 0.36, 225, [0.24, 0.26, 0.28], 0);

    // 2. Main Turbine Hall (Keep center x: -14..14 fly-through open!)
    // Side walls with external concrete buttress pilasters & industrial clerestory windows
    for (const side of [-1, 1]) {
      const wx = side * 42;
      mb.pushBox(wx, baseY + hallH * 0.5, hallZ - 24, 2.2, hallH, 24, concreteWall, 0);
      mb.pushBox(wx, baseY + hallH * 0.5, hallZ + 24, 2.2, hallH, 24, concreteWall, 0);
      mb.pushBox(wx, baseY + hallH - 3, hallZ, 2.2, 6, 26, concreteWeathered, 0);
      // Architectural buttress ribs along exterior wall
      for (const bz of [hallZ - 35, hallZ - 24, hallZ - 13, hallZ + 13, hallZ + 24, hallZ + 35]) {
        mb.pushBox(wx + side * 1.4, baseY + hallH * 0.5, bz, 1.2, hallH, 1.4, concreteDark, 0);
      }
      // Industrial multi-pane clerestory windows
      for (const wz of [hallZ - 28, hallZ - 20, hallZ + 20, hallZ + 28]) {
        mb.pushBox(wx + side * 1.18, baseY + 14.5, wz, 0.25, 4.2, 5.2, glassDark, 0.12);
        mb.pushBox(wx + side * 1.24, baseY + 14.5, wz, 0.15, 0.25, 5.4, concreteDark, 0);
      }
    }
    // Front & rear portal walls with chamfered steel headers & warm industrial floodlights
    for (const fz of [hallZ - 37, hallZ + 37]) {
      mb.pushBox(-28, baseY + hallH * 0.5, fz, 26, hallH, 2.4, concreteWeathered, 0);
      mb.pushBox( 28, baseY + hallH * 0.5, fz, 26, hallH, 2.4, concreteWeathered, 0);
      mb.pushBox(0, baseY + hallH - 2.4, fz, 32, 4.8, 2.4, rustSteel, 0);
      // Warm sodium vapor industrial lights above fly-through bay
      for (const lx of [-10, 0, 10]) {
        mb.pushBox(lx, baseY + hallH - 4.4, fz + (fz > hallZ ? 1.4 : -1.4), 1.4, 0.6, 0.8, windowGlow, 0.95);
      }
    }
    // Pitched Steel Roof Trusses + Corrugated Metal Roof Deck (open sky skylight strip)
    for (let rz = hallZ - 30; rz <= hallZ + 30; rz += 15) {
      mb.pushBox(0, baseY + hallH + 0.8, rz, 86, 1.2, 1.4, rustSteel, 0);
      // Sloped gable truss rafters
      mb.pushProfileX(0, baseY + hallH + 1.4, rz, 43, [
        [0, -0.7], [3.6, 0], [0, 0.7]
      ], rustSteel, 0);
    }
    mb.pushBox(-28, baseY + hallH + 0.8, hallZ - 16, 28, 0.9, 34, concreteDark, 0);
    mb.pushBox( 28, baseY + hallH + 0.8, hallZ + 14, 28, 0.9, 36, concreteDark, 0);
    // Cylindrical interior support columns
    for (const cz of [hallZ - 20, hallZ, hallZ + 20]) {
      mb.pushCylinder(-18, baseY + hallH * 0.5, cz, 0.95, 0.95, hallH, 10, concreteDark, 0);
      mb.pushCylinder( 18, baseY + hallH * 0.5, cz, 0.95, 0.95, hallH, 10, concreteDark, 0);
    }

    // 3. Twin Overhead Industrial Gantry Cranes (South z=-66 & North z=-176)
    for (const cz of [-66, -176]) {
      for (const gx of [-30, 30]) {
        mb.pushBox(gx, baseY + 15, cz, 2.2, 30, 2.2, craneYellow, 0);
        mb.pushBox(gx, baseY + 1.2, cz, 3.8, 2.4, 6.2, concreteDark, 0);
      }
      mb.pushBox(0, baseY + 29.5, cz, 66, 2.6, 3.0, craneYellow, 0.08);
      mb.pushBox(0, baseY + 31.2, cz, 64, 0.6, 0.8, rustSteel, 0);
      mb.pushBox(cz === -66 ? 8 : -10, baseY + 26.2, cz, 5.5, 3.6, 4.2, rustSteel, 0);
      mb.pushBox(cz === -66 ? 8 : -10, baseY + 26.2, cz + 2.2, 3.6, 1.6, 0.3, glassDark, 0.18);
    }

    // 4. Three Smooth Tapered Cylindrical Smokestacks (16-segment concrete + aviation bands + catwalks)
    for (const st of [
      { x: -64, z: -158, h: 68, rBot: 3.8, rTop: 2.3 },
      { x: -64, z: -124, h: 56, rBot: 3.3, rTop: 2.0 },
      { x: -114, z: -182, h: 76, rBot: 4.1, rTop: 2.4 }
    ]) {
      mb.pushCylinder(st.x, baseY + 1.8, st.z, st.rBot * 1.25, st.rBot * 1.1, 3.6, 16, concreteDark, 0);
      mb.pushCylinder(st.x, baseY + st.h * 0.5, st.z, st.rBot, st.rTop, st.h, 16, [0.54, 0.42, 0.36], 0);
      const rBand1 = st.rTop + (st.rBot - st.rTop) * 0.16;
      const rBand2 = st.rTop + (st.rBot - st.rTop) * 0.08;
      mb.pushCylinder(st.x, baseY + st.h - 10, st.z, rBand1 + 0.14, rBand1 + 0.08, 3.2, 16, [0.90, 0.90, 0.90], 0.08);
      mb.pushCylinder(st.x, baseY + st.h - 5.2, st.z, rBand2 + 0.14, rBand2 + 0.08, 3.2, 16, warnRed, 0.18);
      mb.pushCylinder(st.x, baseY + st.h - 13.5, st.z, rBand1 + 1.15, rBand1 + 1.15, 0.55, 16, rustSteel, 0);
      mb.pushCylinder(st.x, baseY + st.h + 0.3, st.z, st.rTop * 0.95, st.rTop * 0.85, 0.8, 16, [0.16, 0.16, 0.18], 0);
      mb.pushSphere(st.x + st.rTop, baseY + st.h + 1.0, st.z, 0.55, 0.55, 0.55, 8, 6, warnRed, 1.0, false);
    }

    // 5. Six Cylindrical Ribbed Fuel Silos with Hemispherical Domes & Overhead Pipe Network
    for (const sl of [
      { x: 64, z: -148, r: 6.2, h: 24 }, { x: 64, z: -124, r: 6.2, h: 24 },
      { x: 64, z: -100, r: 6.0, h: 20 }, { x: 64, z: -172, r: 6.0, h: 24 },
      { x: 86, z: -148, r: 5.5, h: 21 }, { x: 86, z: -124, r: 5.5, h: 21 }
    ]) {
      mb.pushCylinder(sl.x, baseY + sl.h * 0.5, sl.z, sl.r, sl.r, sl.h, 16, [0.64, 0.67, 0.70], 0);
      for (const ry of [sl.h * 0.32, sl.h * 0.66, sl.h - 0.6]) {
        mb.pushCylinder(sl.x, baseY + ry, sl.z, sl.r + 0.22, sl.r + 0.22, 0.45, 16, rustSteel, 0);
      }
      mb.pushSphere(sl.x, baseY + sl.h, sl.z, sl.r, 3.2, sl.r, 16, 8, [0.56, 0.59, 0.63], 0, true);
      mb.pushCylinder(sl.x, baseY + sl.h + 3.4, sl.z, 1.1, 0.9, 1.3, 10, rustSteel, 0);
    }
    mb.pushCylinder(52, baseY + 14.8, -135, 0.72, 0.72, 22, 10, rustSteel, 0, rotZ90);
    mb.pushCylinder(52, baseY + 14.8, -137, 0.58, 0.58, 22, 10, [0.66, 0.68, 0.70], 0, rotZ90);

    // 5b. East Hyperbolic Industrial Cooling Tower (3-stage smooth flared concrete shell)
    const ctx = 114, ctz = -138;
    mb.pushCylinder(ctx, baseY + 7.5,  ctz, 13.5, 10.2, 15.0, 18, concreteWeathered, 0);
    mb.pushCylinder(ctx, baseY + 21.0, ctz, 10.2,  8.6, 12.0, 18, concreteWall, 0);
    mb.pushCylinder(ctx, baseY + 32.5, ctz,  8.6,  9.8, 11.0, 18, concreteWeathered, 0);
    mb.pushCylinder(ctx, baseY + 38.2, ctz,  9.9,  9.9,  0.9, 18, concreteDark, 0);
    mb.pushSphere(ctx + 9.6, baseY + 39.2, ctz, 0.6, 0.6, 0.6, 8, 6, warnRed, 1.0, false);

    // 5c. West Assembly Hall Annex (x = -112, z = -128, fly-through corridor z: -136..-120)
    const wx = -112, wz = -128, wh = 18;
    mb.pushBox(wx, baseY + 0.05, wz, 56, 0.10, 86, [0.23, 0.25, 0.27], 0);
    mb.pushBox(wx, baseY + wh * 0.5, wz - 22, 34, wh, 2.2, concreteWall, 0);
    mb.pushBox(wx, baseY + wh * 0.5, wz + 22, 34, wh, 2.2, concreteWall, 0);
    for (const sx of [wx - 16, wx + 16]) {
      mb.pushBox(sx, baseY + wh * 0.5, wz - 14, 2.2, wh, 14, concreteWeathered, 0);
      mb.pushBox(sx, baseY + wh * 0.5, wz + 14, 2.2, wh, 14, concreteWeathered, 0);
      mb.pushBox(sx, baseY + wh - 2.2, wz, 2.4, 4.4, 16, rustSteel, 0);
      mb.pushBox(sx, baseY + wh - 4.0, wz, 2.8, 0.6, 1.8, windowGlow, 0.9);
    }
    mb.pushBox(wx, baseY + wh + 0.8, wz, 36, 1.4, 46, concreteDark, 0);
    mb.pushProfileX(wx, baseY + wh + 1.5, wz, 18, [[0, -22], [3.5, 0], [0, 22]], rustSteel, 0);

    // 5d. East Boiler House & Overhead Catwalk Skybridge
    mb.pushBox(96, baseY + 7.5, -84, 22, 15, 24, concreteWall, 0);
    mb.pushBox(96, baseY + 15.6, -84, 23, 1.2, 25, concreteDark, 0);
    mb.pushBox(96, baseY + 10.5, -71.8, 12, 3.2, 0.3, glassDark, 0.14);
    mb.pushBox(68, baseY + 13.5, -90, 34, 2.6, 3.2, rustSteel, 0);
    mb.pushBox(68, baseY + 13.6, -88.2, 30, 1.2, 0.25, glassDark, 0.16);

    // 5e. Industrial Transformer Substations & 4 Perimeter Floodlight Masts
    for (const [tx, tz] of [[-46, -86], [48, -86], [-84, -158], [84, -178]]) {
      mb.pushBox(tx, baseY + 2.4, tz, 6.2, 4.8, 4.6, concreteDark, 0);
      mb.pushCylinder(tx - 1.4, baseY + 5.6, tz, 0.45, 0.35, 1.8, 8, [0.76, 0.78, 0.82], 0);
      mb.pushCylinder(tx + 1.4, baseY + 5.6, tz, 0.45, 0.35, 1.8, 8, [0.76, 0.78, 0.82], 0);
    }
    for (const [lx, lz] of [[-78, -32], [78, -32], [-78, -218], [78, -218]]) {
      mb.pushCylinder(lx, baseY + 11, lz, 0.45, 0.25, 22, 8, concreteDark, 0);
      mb.pushBox(lx, baseY + 22.2, lz, 2.8, 0.9, 1.1, windowGlow, 0.95);
    }

    // 6. North Concrete Skeleton Structure
    for (const [cx, cz] of [[-22, -206], [22, -206], [-22, -182], [22, -182]]) {
      mb.pushCylinder(cx, baseY + 12, cz, 1.2, 1.2, 24, 10, concreteWall, 0);
    }
    mb.pushBox(0, baseY + 12, -194, 46, 1.6, 26, concreteWeathered, 0);
    mb.pushBox(0, baseY + 24, -206, 46, 1.8, 2.4, concreteWall, 0);
    mb.pushBox(0, baseY + 24, -182, 46, 1.8, 2.4, concreteWall, 0);

    // 7. Sixteen Corrugated Shipping Containers (stacked freestyle alleys)
    const addContainer = (cx, cy, cz, sx, sy, sz, col) => {
      mb.pushBox(cx, cy, cz, sx, sy, sz, col, 0);
      const ribCol = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
      if (sz > sx) {
        for (let z = -sz * 0.42; z <= sz * 0.42; z += 1.45) {
          mb.pushBox(cx, cy, cz + z, sx + 0.14, sy * 0.88, 0.24, ribCol, 0);
        }
      } else {
        for (let x = -sx * 0.42; x <= sx * 0.42; x += 1.45) {
          mb.pushBox(cx + x, cy, cz, 0.24, sy * 0.88, sz + 0.14, ribCol, 0);
        }
      }
    };
    const cTeal = [0.14, 0.42, 0.48], cRed = [0.58, 0.20, 0.18];
    for (const c of [
      [-56, 2.0, -56, 4.2, 4.0, 12.0, cTeal], [-56, 6.0, -56, 4.2, 4.0, 12.0, cRed],
      [ 52, 2.0, -58, 12.0, 4.0, 4.2, cRed],  [-38, 1.9, -26, 11.0, 3.8, 4.0, cTeal],
      [ 36, 2.0, -28, 12.0, 4.0, 4.2, cTeal], [ 36, 6.0, -28, 12.0, 4.0, 4.2, craneYellow],
      [-74, 2.0, -86, 4.2, 4.0, 12.0, cRed],  [-74, 2.0, -104, 4.2, 4.0, 12.0, cTeal],
      [ 54, 2.0, -182, 12.0, 4.0, 4.2, cTeal],[ 54, 6.0, -182, 12.0, 4.0, 4.2, cRed],
      [-48, 2.0, -226, 12.0, 4.0, 4.2, craneYellow], [ 46, 2.0, -228, 12.0, 4.0, 4.2, cTeal],
      [-92, 2.0, -58, 12.0, 4.0, 4.2, cRed],  [-92, 6.0, -58, 12.0, 4.0, 4.2, cTeal],
      [ 92, 2.0, -52, 4.2, 4.0, 12.0, craneYellow],  [ 92, 2.0, -196, 12.0, 4.0, 4.2, cRed]
    ]) {
      addContainer(c[0], baseY + c[1], c[2], c[3], c[4], c[5], c[6]);
    }

    // 8. Outpost 1: Lakeside Pump Station (x = 185, z = 45)
    const p1y = Math.max(global.FPVWorld.WATER_LEVEL + 0.5, getH(185, 45));
    mb.pushBox(185, p1y + 6.5, 45, 24, 13, 18, concreteWall, 0);
    mb.pushProfileX(185, p1y + 13.0, 45, 12.4, [[0, -9.2], [3.2, 0], [0, 9.2]], rustSteel, 0);
    mb.pushBox(185, p1y + 8.0, 35.8, 10, 3.2, 0.3, glassDark, 0.16);
    mb.pushCylinder(204, p1y + 7.0, 45, 4.6, 4.6, 14, 14, [0.64, 0.67, 0.70], 0);
    mb.pushSphere(204, p1y + 14.0, 45, 4.6, 2.2, 4.6, 14, 7, [0.56, 0.59, 0.63], 0, true);

    // 9. Outpost 2: West-South Valley Maintenance Hangar (x = -190, z = 155, fly-through open ends!)
    const p2y = Math.max(global.FPVWorld.WATER_LEVEL + 0.5, getH(-190, 155));
    mb.pushBox(-190 - 11, p2y + 7.5, 155, 2.2, 15, 28, concreteWeathered, 0);
    mb.pushBox(-190 + 11, p2y + 7.5, 155, 2.2, 15, 28, concreteWeathered, 0);
    mb.pushBox(-190, p2y + 15.2, 155, 25, 1.4, 29, concreteDark, 0);
    mb.pushProfileX(-190, p2y + 15.8, 155, 12.6, [[0, -14.5], [3.4, 0], [0, 14.5]], rustSteel, 0);
    addContainer(-168, p2y + 2.0, 150, 4.2, 4.0, 12.0, cTeal);

    // 10. West Mountain Ridge High-Difficulty FPV Training Tunnel (140m Arched Bore + Rock Cap + Portals + 3 Slalom Baffles)
    const mt = factory && factory.tunnel ? factory.tunnel : global.FPVWorld.MOUNTAIN_TUNNEL;
    if (mt) {
      const tLen = mt.zSouth - mt.zNorth;
      const tMidZ = (mt.zSouth + mt.zNorth) * 0.5;
      const fy = mt.floorY;
      const hw = mt.halfW;
      const archBaseY = fy + 5.2;
      const archRad = hw + 0.3;

      // Paved tunnel asphalt roadbed + safety curbs + glowing centerline
      mb.pushBox(mt.x, fy + 0.08, tMidZ, hw * 2 + 2, 0.16, tLen + 26, [0.16, 0.17, 0.19], 0);
      mb.pushBox(mt.x - hw + 0.45, fy + 0.45, tMidZ, 0.9, 0.75, tLen + 14, concreteWeathered, 0);
      mb.pushBox(mt.x + hw - 0.45, fy + 0.45, tMidZ, 0.9, 0.75, tLen + 14, concreteWeathered, 0);
      for (let z = mt.zNorth - 8; z <= mt.zSouth + 8; z += 12) {
        mb.pushBox(mt.x, fy + 0.19, z, 0.36, 0.04, 6.2, [0.12, 0.88, 0.96], 0.85);
      }

      // Left & Right Reinforced Concrete Tunnel Sidewalls
      mb.pushBox(mt.x - hw - 1.1, fy + 2.8, tMidZ, 2.2, 5.6, tLen, [0.34, 0.36, 0.38], 0);
      mb.pushBox(mt.x + hw + 1.1, fy + 2.8, tMidZ, 2.2, 5.6, tLen, [0.34, 0.36, 0.38], 0);

      // Smooth 10-Segment Arched Concrete Vault Lining (both interior ceiling & exterior shell)
      const segs = 10;
      const wallT = 1.4;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI;
        const a1 = ((s + 1) / segs) * Math.PI;
        const x0i = mt.x + Math.cos(a0) * archRad, y0i = archBaseY + Math.sin(a0) * (mt.height - 5.2);
        const x1i = mt.x + Math.cos(a1) * archRad, y1i = archBaseY + Math.sin(a1) * (mt.height - 5.2);
        const x0o = mt.x + Math.cos(a0) * (archRad + wallT), y0o = archBaseY + Math.sin(a0) * (mt.height - 5.2 + wallT);
        const x1o = mt.x + Math.cos(a1) * (archRad + wallT), y1o = archBaseY + Math.sin(a1) * (mt.height - 5.2 + wallT);
        // Interior arched ceiling
        mb.pushQuad([x0i, y0i, mt.zSouth], [x1i, y1i, mt.zSouth], [x1i, y1i, mt.zNorth], [x0i, y0i, mt.zNorth], [0.28, 0.30, 0.33], 0);
        // Exterior arched roof
        mb.pushQuad([x0o, y0o, mt.zNorth], [x1o, y1o, mt.zNorth], [x1o, y1o, mt.zSouth], [x0o, y0o, mt.zSouth], [0.40, 0.41, 0.44], 0);
      }

      // Sculpted Mountain Rock Overburden Ridge covering the tunnel bore seamlessly
      const rockCol = [0.39, 0.40, 0.43];
      const mossCol = [0.21, 0.35, 0.22];
      for (let z = mt.zNorth + 10; z <= mt.zSouth - 10; z += 18) {
        const rH = 8.5 + Math.sin(z * 0.09) * 2.8;
        mb.pushSphere(mt.x, fy + mt.height + 5.2, z, hw + 9.5, rH, 13.5, 9, 6, rockCol, 0, true);
        mb.pushSphere(mt.x - hw - 6.5, fy + 9.5, z, 8.5, 11.5, 13.0, 8, 5, rockCol, 0, false);
        mb.pushSphere(mt.x + hw + 6.5, fy + 9.5, z, 8.5, 11.5, 13.0, 8, 5, rockCol, 0, false);
        mb.pushSphere(mt.x, fy + mt.height + rH + 1.5, z, hw + 4.5, 3.6, 11.0, 8, 5, mossCol, 0, true);
      }

      // North & South Reinforced Concrete Portals with Glowing Runway Guidance Chevrons & Beacons
      for (const pz of [mt.zSouth, mt.zNorth]) {
        const sign = pz === mt.zSouth ? 1 : -1;
        mb.pushBox(mt.x - hw - 2.6, fy + 6.5, pz, 5.2, 13.0, 3.2, concreteWall, 0);
        mb.pushBox(mt.x + hw + 2.6, fy + 6.5, pz, 5.2, 13.0, 3.2, concreteWall, 0);
        mb.pushBox(mt.x, fy + mt.height + 2.4, pz, hw * 2 + 10.4, 4.8, 3.4, concreteWeathered, 0);
        // Glowing cyan/amber portal guidance frame strips
        mb.pushBox(mt.x, fy + mt.height + 0.1, pz + sign * 1.75, hw * 2 + 1.2, 0.65, 0.25, [0.12, 0.90, 0.98], 1.0);
        mb.pushBox(mt.x - hw - 0.1, fy + 5.8, pz + sign * 1.75, 0.55, 11.2, 0.25, [0.98, 0.66, 0.10], 0.95);
        mb.pushBox(mt.x + hw + 0.1, fy + 5.8, pz + sign * 1.75, 0.55, 11.2, 0.25, [0.98, 0.66, 0.10], 0.95);
        // Aviation warning beacons above portal
        mb.pushSphere(mt.x - hw - 2.0, fy + mt.height + 5.4, pz, 0.65, 0.65, 0.65, 8, 6, warnRed, 1.0, false);
        mb.pushSphere(mt.x + hw + 2.0, fy + mt.height + 5.4, pz, 0.65, 0.65, 0.65, 8, 6, warnRed, 1.0, false);
      }

      // Interior Sodium-Vapor Ceiling Lights + Structural Rib Arches + Side LED Guide Strips
      for (let z = mt.zNorth + 12; z <= mt.zSouth - 12; z += 16) {
        mb.pushBox(mt.x, fy + mt.height - 0.35, z, 2.8, 0.35, 3.8, windowGlow, 1.0);
        mb.pushBox(mt.x - hw + 0.2, fy + 2.8, z, 0.25, 0.35, 4.2, [0.98, 0.68, 0.14], 0.9);
        mb.pushBox(mt.x + hw - 0.2, fy + 2.8, z, 0.25, 0.35, 4.2, [0.14, 0.88, 0.96], 0.9);
      }

      // 3 High-Difficulty Interior Slalom Baffles & Overhead Jet-Fan Clearance Beam (matches exact colliders)
      // Baffle 1 (Left wall vent barrier at z=-170 -> fly RIGHT)
      mb.pushBox(mt.x - 4.2, fy + 5.4, -170, 7.6, 10.8, 2.6, concreteDark, 0);
      mb.pushBox(mt.x - 0.35, fy + 5.4, -170, 0.35, 10.4, 2.8, craneYellow, 0.85);
      mb.pushCylinder(mt.x - 4.2, fy + 7.2, -170, 1.8, 1.8, 3.0, 12, rustSteel, 0, rotX90);

      // Baffle 2 (Right wall maintenance barrier at z=-205 -> fly LEFT)
      mb.pushBox(mt.x + 4.2, fy + 5.4, -205, 7.6, 10.8, 2.6, concreteDark, 0);
      mb.pushBox(mt.x + 0.35, fy + 5.4, -205, 0.35, 10.4, 2.8, craneYellow, 0.85);
      mb.pushCylinder(mt.x + 4.2, fy + 7.2, -205, 1.8, 1.8, 3.0, 12, rustSteel, 0, rotX90);

      // Baffle 3 (Overhead hanging jet-fan clearance beam at z=-240 -> fly LOW)
      mb.pushBox(mt.x, fy + 9.2, -240, hw * 2, 4.2, 3.0, rustSteel, 0);
      mb.pushBox(mt.x, fy + 7.05, -240, hw * 2 - 0.4, 0.35, 3.2, warnRed, 0.95);
      mb.pushCylinder(mt.x - 3.6, fy + 8.6, -240, 1.25, 1.25, 3.8, 12, concreteDark, 0, rotX90);
      mb.pushCylinder(mt.x + 3.6, fy + 8.6, -240, 1.25, 1.25, 3.8, 12, concreteDark, 0, rotX90);
    }

    // 11. Roadside Valley Town ("山谷小镇"): Main Street, Gas Station, Supermarket, 24H Convenience Store, Shops, Houses, Clock Tower & 6 Giant Highway Billboards
    const town = factory && factory.town ? factory.town : global.FPVWorld.TOWN_DATA;
    if (town) {
      const ty = town.floorY;
      const asphalt = [0.18, 0.19, 0.21];
      const sidewalk = [0.66, 0.67, 0.69];
      const whitePaint = [0.92, 0.93, 0.94];
      const yellowLine = [0.95, 0.76, 0.14];
      const glassBlue = [0.18, 0.42, 0.56];
      const warmLight = [1.0, 0.88, 0.58];
      const poleSteel = [0.26, 0.29, 0.33];

      // 11a. East-West Main Street (z = 140, x: -148..42), Sidewalks, Crosswalks & Parking Lots
      mb.pushBox(-53, ty + 0.16, 140, 190, 0.32, 13.0, asphalt, 0);
      mb.pushBox(-53, ty + 0.28, 132.2, 186, 0.36, 2.6, sidewalk, 0);
      mb.pushBox(-53, ty + 0.28, 147.8, 186, 0.36, 2.6, sidewalk, 0);
      // Dashed yellow centerline along Main Street
      for (let x = -142; x <= 34; x += 10) {
        mb.pushBox(x, ty + 0.35, 140, 4.8, 0.05, 0.26, yellowLine, 0.2);
      }
      // White zebra crosswalks at the Highway x Main Street intersection
      const hxInt = global.FPVWorld.getRoadCenterX(140);
      for (let s = -4.5; s <= 4.5; s += 1.5) {
        mb.pushBox(hxInt - 8.5, ty + 0.36, 140 + s, 2.8, 0.05, 0.65, whitePaint, 0.1);
        mb.pushBox(hxInt + 8.5, ty + 0.36, 140 + s, 2.8, 0.05, 0.65, whitePaint, 0.1);
        mb.pushBox(hxInt + s, ty + 0.36, 131.5, 0.65, 0.05, 2.8, whitePaint, 0.1);
        mb.pushBox(hxInt + s, ty + 0.36, 148.5, 0.65, 0.05, 2.8, whitePaint, 0.1);
      }
      // Supermarket paved parking lot (x = -34, z = 123) with white stall lines
      mb.pushBox(-34, ty + 0.14, 123, 34, 0.28, 17, [0.21, 0.22, 0.24], 0);
      for (let px = -48; px <= -20; px += 3.5) {
        mb.pushBox(px, ty + 0.31, 121.5, 0.16, 0.05, 5.2, whitePaint, 0.1);
      }
      // 12 Town Streetlamps with glowing warm LED heads
      for (const [lx, lz, dirZ] of [
        [-132, 132.2, 1], [-96, 132.2, 1], [-58, 132.2, 1], [-22, 132.2, 1], [16, 132.2, 1],
        [-132, 147.8, -1], [-96, 147.8, -1], [-58, 147.8, -1], [-22, 147.8, -1], [16, 147.8, -1],
        [-50, 124, 0], [-18, 124, 0]
      ]) {
        mb.pushCylinder(lx, ty + 3.4, lz, 0.14, 0.10, 6.8, 8, poleSteel, 0);
        mb.pushBox(lx, ty + 6.75, lz + dirZ * 0.9, 0.14, 0.14, 1.9, poleSteel, 0);
        mb.pushBox(lx, ty + 6.58, lz + dirZ * 1.6, 0.42, 0.16, 0.72, warmLight, 1.0);
      }

      // 11b. Roadside Gas Station (x = -104, z = 102) — Open under-canopy fly-through!
      const gx = -104, gz = 102;
      const gasRed = [0.88, 0.18, 0.16];
      const gasAmber = [0.98, 0.74, 0.12];
      // Paved forecourt slab
      mb.pushBox(gx - 4, ty + 0.15, gz, 38, 0.30, 26, [0.24, 0.25, 0.27], 0);
      // 4 cylindrical steel canopy columns
      for (const [cx, cz] of [[gx - 6.5, gz - 4.2], [gx + 6.5, gz - 4.2], [gx - 6.5, gz + 4.2], [gx + 6.5, gz + 4.2]]) {
        mb.pushCylinder(cx, ty + 3.15, cz, 0.42, 0.38, 6.3, 10, [0.88, 0.89, 0.91], 0);
        mb.pushCylinder(cx, ty + 0.45, cz, 0.56, 0.52, 0.9, 10, gasRed, 0);
      }
      // Illuminated Gas Station Canopy Roof & Fascia (y = ty + 6.9, matches collider)
      mb.pushBox(gx, ty + 6.85, gz, 18.2, 1.15, 13.2, [0.92, 0.93, 0.95], 0);
      mb.pushBox(gx, ty + 7.15, gz - 6.68, 18.4, 0.65, 0.18, gasRed, 0.55);
      mb.pushBox(gx, ty + 7.15, gz + 6.68, 18.4, 0.65, 0.18, gasRed, 0.55);
      mb.pushBox(gx - 9.18, ty + 7.15, gz, 0.18, 0.65, 13.4, gasRed, 0.55);
      mb.pushBox(gx + 9.18, ty + 7.15, gz, 0.18, 0.65, 13.4, gasRed, 0.55);
      mb.pushBox(gx, ty + 6.62, gz - 6.68, 18.4, 0.24, 0.20, gasAmber, 0.95);
      mb.pushBox(gx, ty + 6.62, gz + 6.68, 18.4, 0.24, 0.20, gasAmber, 0.95);
      // Canopy soffit ceiling LED panels
      for (const sx of [-4.5, 0, 4.5]) {
        for (const sz of [-2.8, 2.8]) {
          mb.pushBox(gx + sx, ty + 6.24, gz + sz, 1.6, 0.08, 1.6, warmLight, 1.0);
        }
      }
      // 4 Fuel Pump Islands with dispensers & safety bollards
      for (const [px, pz] of [[gx - 4.2, gz - 2.6], [gx + 4.2, gz - 2.6], [gx - 4.2, gz + 2.6], [gx + 4.2, gz + 2.6]]) {
        mb.pushBox(px, ty + 0.22, pz, 3.2, 0.28, 1.2, sidewalk, 0);
        mb.pushBox(px, ty + 1.15, pz, 1.1, 1.65, 0.65, [0.92, 0.93, 0.94], 0);
        mb.pushBox(px, ty + 1.85, pz, 1.16, 0.38, 0.68, gasRed, 0.3);
        mb.pushBox(px, ty + 1.32, pz + 0.34, 0.72, 0.36, 0.06, [0.12, 0.92, 0.85], 0.95);
        mb.pushBox(px, ty + 1.32, pz - 0.34, 0.72, 0.36, 0.06, [0.12, 0.92, 0.85], 0.95);
        mb.pushCylinder(px - 1.3, ty + 0.65, pz, 0.14, 0.14, 1.0, 8, gasAmber, 0);
        mb.pushCylinder(px + 1.3, ty + 0.65, pz, 0.14, 0.14, 1.0, 8, gasAmber, 0);
      }
      // Gas Station Mart / Office Building (x = -121, z = 102)
      mb.pushBox(-121, ty + 2.75, gz, 9.8, 5.5, 13.8, [0.84, 0.83, 0.80], 0);
      mb.pushBox(-121, ty + 5.65, gz, 10.4, 0.55, 14.4, gasRed, 0.35);
      mb.pushBox(-116.0, ty + 2.2, gz, 0.2, 3.0, 9.6, glassBlue, 0.45);
      mb.pushBox(-115.6, ty + 4.2, gz, 1.2, 0.28, 11.2, gasAmber, 0.6);
      // 12.5m Tall Illuminated Fuel Price Pylon Sign near highway
      mb.pushCylinder(-89, ty + 6.0, 88, 0.42, 0.36, 12.0, 10, poleSteel, 0);
      mb.pushBox(-89, ty + 10.2, 88, 3.4, 4.4, 0.75, [0.12, 0.15, 0.20], 0);
      mb.pushBox(-89, ty + 11.8, 88, 3.5, 1.0, 0.82, gasRed, 0.85);
      mb.pushBox(-89, ty + 10.2, 88, 2.8, 0.65, 0.84, [0.22, 0.98, 0.44], 1.0);
      mb.pushBox(-89, ty + 9.2, 88, 2.8, 0.65, 0.84, gasAmber, 1.0);

      // 11c. Town Large Supermarket (x = -34, z = 104, 30x9.6x22)
      const sx = -34, sz = 104;
      const martGreen = [0.10, 0.62, 0.38];
      const martCream = [0.86, 0.85, 0.81];
      mb.pushBox(sx, ty + 4.4, sz, 29.6, 8.8, 21.6, martCream, 0);
      // Stepped architectural front parapet & glowing emerald fascia
      mb.pushBox(sx, ty + 9.3, sz + 9.8, 29.8, 1.8, 2.2, martCream, 0);
      mb.pushBox(sx, ty + 8.6, sz + 11.0, 30.2, 1.4, 0.32, martGreen, 0.55);
      mb.pushBox(sx, ty + 9.5, sz + 11.15, 16.5, 1.1, 0.32, [0.96, 0.98, 0.96], 0.9);
      mb.pushBox(sx, ty + 7.7, sz + 11.0, 30.2, 0.28, 0.25, [0.98, 0.72, 0.14], 0.95);
      // Wide glass entrance vestibule & glowing storefront windows
      mb.pushBox(sx, ty + 2.4, sz + 11.0, 12.0, 4.4, 0.8, glassBlue, 0.55);
      mb.pushBox(sx - 10.5, ty + 2.6, sz + 10.9, 6.2, 3.2, 0.2, warmLight, 0.65);
      mb.pushBox(sx + 10.5, ty + 2.6, sz + 10.9, 6.2, 3.2, 0.2, warmLight, 0.65);
      mb.pushBox(sx, ty + 4.8, sz + 12.2, 14.5, 0.4, 2.8, martGreen, 0.2);
      // Rooftop HVAC units
      mb.pushBox(sx - 7, ty + 9.4, sz - 2, 3.8, 1.4, 3.2, [0.58, 0.61, 0.64], 0);
      mb.pushBox(sx + 6, ty + 9.4, sz - 3, 4.2, 1.5, 3.6, [0.58, 0.61, 0.64], 0);

      // 11d. 24H Convenience Store (x = -48, z = 168, 15x5.4x11)
      const cx = -48, cz = 168;
      mb.pushBox(cx, ty + 2.65, cz, 14.8, 5.3, 10.8, [0.90, 0.90, 0.88], 0);
      // Iconic glowing tri-color stripe canopy (orange / emerald green / red) facing Main Street (north)
      mb.pushBox(cx, ty + 4.95, cz - 5.55, 15.2, 0.42, 0.35, [0.98, 0.50, 0.08], 0.9);
      mb.pushBox(cx, ty + 4.50, cz - 5.55, 15.2, 0.42, 0.35, [0.10, 0.76, 0.40], 0.9);
      mb.pushBox(cx, ty + 4.05, cz - 5.55, 15.2, 0.36, 0.35, [0.90, 0.18, 0.18], 0.9);
      // Bright illuminated wrap-around convenience store windows + 24H roof sign
      mb.pushBox(cx, ty + 2.0, cz - 5.46, 12.2, 3.0, 0.16, warmLight, 0.78);
      mb.pushBox(cx - 7.46, ty + 2.0, cz - 1.5, 0.16, 3.0, 6.2, warmLight, 0.65);
      mb.pushBox(cx + 5.2, ty + 6.1, cz - 5.1, 3.6, 1.4, 0.45, [0.10, 0.82, 0.45], 0.95);
      // 2 Outdoor Vending Machines
      mb.pushBox(cx - 6.2, ty + 1.05, cz - 6.0, 1.1, 2.0, 0.8, [0.88, 0.20, 0.18], 0.35);
      mb.pushBox(cx - 4.8, ty + 1.05, cz - 6.0, 1.1, 2.0, 0.8, [0.16, 0.52, 0.88], 0.35);

      // 11e. 7 Town Commercial Shops & Pitched-Roof Townhouses
      const townBuildings = [
        { x: -108, z: 168, w: 15.6, h: 7.4, d: 11.6, wall: [0.78, 0.68, 0.56], roof: [0.58, 0.25, 0.19], awning: [0.18, 0.46, 0.68], faceZ: -1 },
        { x: -108, z: 198, w: 17.6, h: 6.6, d: 11.6, wall: [0.68, 0.72, 0.75], roof: [0.30, 0.34, 0.38], awning: [0.88, 0.44, 0.12], faceZ: -1 },
        { x: -48,  z: 198, w: 15.6, h: 7.0, d: 11.6, wall: [0.86, 0.82, 0.74], roof: [0.62, 0.28, 0.20], awning: null, faceZ: -1 },
        { x: -16,  z: 168, w: 14.6, h: 8.0, d: 11.6, wall: [0.76, 0.58, 0.46], roof: [0.28, 0.32, 0.38], awning: [0.16, 0.52, 0.36], faceZ: -1 },
        { x: -16,  z: 198, w: 15.6, h: 6.6, d: 11.6, wall: [0.78, 0.82, 0.76], roof: [0.54, 0.26, 0.20], awning: null, faceZ: -1 },
        { x:  14,  z: 104, w: 15.6, h: 7.2, d: 13.6, wall: [0.82, 0.77, 0.69], roof: [0.32, 0.36, 0.42], awning: [0.72, 0.24, 0.22], faceZ:  1 },
        { x:  14,  z: 168, w: 13.6, h: 6.8, d: 11.6, wall: [0.85, 0.79, 0.70], roof: [0.60, 0.28, 0.18], awning: null, faceZ: -1 }
      ];
      for (const b of townBuildings) {
        mb.pushBox(b.x, ty + b.h * 0.5, b.z, b.w, b.h, b.d, b.wall, 0);
        // Pitched gable roof
        mb.pushProfileX(b.x, ty + b.h, b.z, b.w * 0.54, [[0, -b.d * 0.55], [2.4, 0], [0, b.d * 0.55]], b.roof, 0);
        // Shopfront awning (if commercial)
        const fz = b.z + b.faceZ * (b.d * 0.5 + 0.08);
        if (b.awning) {
          mb.pushBox(b.x, ty + 3.4, b.z + b.faceZ * (b.d * 0.5 + 0.9), b.w * 0.82, 0.35, 1.8, b.awning, 0.15);
        }
        // Two floors of warm glowing windows
        for (const wxOff of [-b.w * 0.28, 0, b.w * 0.28]) {
          mb.pushBox(b.x + wxOff, ty + 2.0, fz, 2.2, 2.0, 0.12, warmLight, 0.55);
          mb.pushBox(b.x + wxOff, ty + b.h - 1.8, fz, 2.0, 1.7, 0.12, warmLight, 0.48);
        }
      }

      // 11f. Town Clock Tower Landmark (x = 2, z = 140 — East Main Street Plaza)
      const kx = 2, kz = 140;
      mb.pushBox(kx, ty + 0.4, kz, 8.6, 0.8, 8.6, sidewalk, 0);
      mb.pushBox(kx, ty + 6.6, kz, 4.6, 12.4, 4.6, [0.76, 0.68, 0.58], 0);
      mb.pushBox(kx, ty + 13.0, kz, 5.2, 0.7, 5.2, [0.58, 0.52, 0.46], 0);
      // 4 glowing clock dials facing N/S/E/W
      mb.pushBox(kx, ty + 10.6, kz - 2.36, 2.2, 2.2, 0.14, warmLight, 0.95);
      mb.pushBox(kx, ty + 10.6, kz + 2.36, 2.2, 2.2, 0.14, warmLight, 0.95);
      mb.pushBox(kx - 2.36, ty + 10.6, kz, 0.14, 2.2, 2.2, warmLight, 0.95);
      mb.pushBox(kx + 2.36, ty + 10.6, kz, 0.14, 2.2, 2.2, warmLight, 0.95);
      // Steep pyramidal copper-slate spire roof
      mb.pushCylinder(kx, ty + 15.6, kz, 3.2, 0.12, 4.6, 4, [0.22, 0.44, 0.42], 0);
      mb.pushSphere(kx, ty + 18.2, kz, 0.35, 0.35, 0.35, 8, 6, gasAmber, 1.0, false);

      // 11g. 6 Giant Roadside Highway Billboards (Monopole T-Pillar + Catwalk + Glowing Graphic Ad Panels)
      const bboards = factory && factory.billboards ? factory.billboards : [];
      const adThemes = [
        { bg: [0.08, 0.22, 0.42], accent: [0.12, 0.92, 0.96], bar: [0.98, 0.74, 0.14] },
        { bg: [0.76, 0.18, 0.14], accent: [0.98, 0.84, 0.18], bar: [0.96, 0.96, 0.96] },
        { bg: [0.10, 0.48, 0.30], accent: [0.96, 0.96, 0.92], bar: [0.98, 0.62, 0.12] },
        { bg: [0.16, 0.14, 0.28], accent: [0.96, 0.40, 0.16], bar: [0.18, 0.90, 0.95] },
        { bg: [0.88, 0.48, 0.10], accent: [0.98, 0.96, 0.90], bar: [0.14, 0.26, 0.44] },
        { bg: [0.12, 0.34, 0.56], accent: [0.34, 0.96, 0.58], bar: [0.98, 0.98, 0.98] }
      ];
      bboards.forEach((bb, idx) => {
        const bby = Math.max(global.FPVWorld.WATER_LEVEL + 0.5, getH(bb.x, bb.z));
        const th = adThemes[idx % adThemes.length];
        const cy = Math.cos(bb.yaw), sy = Math.sin(bb.yaw);
        const tf = (lx, ly, lz) => [bb.x + lx * cy + lz * sy, bby + ly, bb.z - lx * sy + lz * cy];

        // Concrete footing & tall cylindrical steel monopole
        mb.pushCylinder(bb.x, bby + 0.6, bb.z, 1.15, 0.95, 1.2, 10, concreteDark, 0);
        mb.pushCylinder(bb.x, bby + 6.4, bb.z, 0.62, 0.48, 11.6, 12, poleSteel, 0);
        // Steel crossbeam & maintenance catwalk
        mb.pushBox(0, 0, 0, 14.8, 0.65, 1.1, poleSteel, 0, (lx, ly, lz) => tf(lx, ly + 10.7, lz));
        mb.pushBox(0, 0, 0, 14.4, 0.18, 1.9, [0.36, 0.39, 0.43], 0, (lx, ly, lz) => tf(lx, ly + 10.2, lz + 0.95));
        // Main billboard steel cabinet frame (14.4m x 5.0m)
        mb.pushBox(0, 0, 0, 14.6, 5.2, 0.72, [0.18, 0.20, 0.24], 0, (lx, ly, lz) => tf(lx, ly + 13.5, lz));
        // Front & Rear vibrant glowing graphic ad faces + bold geometric headline/brand stripes
        for (const side of [-1, 1]) {
          mb.pushBox(0, 0, 0, 13.8, 4.5, 0.08, th.bg, 0.45, (lx, ly, lz) => tf(lx, ly + 13.5, lz + side * 0.40));
          mb.pushBox(0, 0, 0, 8.6, 1.15, 0.09, th.accent, 0.92, (lx, ly, lz) => tf(lx - 1.6, ly + 14.2, lz + side * 0.46));
          mb.pushBox(0, 0, 0, 6.4, 0.55, 0.09, th.bar, 0.88, (lx, ly, lz) => tf(lx - 2.6, ly + 12.6, lz + side * 0.46));
          mb.pushBox(0, 0, 0, 3.2, 3.2, 0.09, th.bar, 0.80, (lx, ly, lz) => tf(lx + 4.4, ly + 13.5, lz + side * 0.46));
          // 3 Overhead billboard floodlights per side
          for (const fx of [-4.5, 0, 4.5]) {
            mb.pushBox(0, 0, 0, 0.55, 0.22, 0.38, warmLight, 1.0, (lx, ly, lz) => tf(lx + fx, ly + 16.35, lz + side * 1.15));
          }
        }
      });
    }
  }

  function pushRealisticLandmarks(targetData, landmarks) {
    const mb = new AssetMesh(targetData);

    // 1. Concrete Canyon Arch Bridges (with piers, deck, guardrails)
    for (const a of landmarks.arches) {
      const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
      const tf = (lx, ly, lz, ox, oy, oz) => [ox + lx * cy + lz * sy, oy + ly, oz - lx * sy + lz * cy];
      mb.pushBox(a.x, a.y, a.z, 3.8, a.height, 4.4, [0.54, 0.58, 0.64], 0, (lx, ly, lz) => tf(lx - a.span * 0.5, ly + a.height * 0.5, lz, a.x, a.y, a.z));
      mb.pushBox(a.x, a.y, a.z, 3.8, a.height, 4.4, [0.54, 0.58, 0.64], 0, (lx, ly, lz) => tf(lx + a.span * 0.5, ly + a.height * 0.5, lz, a.x, a.y, a.z));
      mb.pushBox(a.x, a.y, a.z, a.span + 6.5, 2.6, 5.2, [0.68, 0.71, 0.76], 0, (lx, ly, lz) => tf(lx, ly + a.height, lz, a.x, a.y, a.z));
      for (const gz of [-2.4, 2.4]) {
        mb.pushBox(a.x, a.y, a.z, a.span + 6.0, 1.1, 0.32, [0.78, 0.80, 0.84], 0, (lx, ly, lz) => tf(lx, ly + a.height + 1.7, lz + gz, a.x, a.y, a.z));
      }
    }

    // 2. Tapered Cylindrical Relay Towers with Dish Platforms & Aviation Beacons
    for (const p of landmarks.pylons) {
      mb.pushCylinder(p.x, p.y + p.h * 0.5, p.z, p.w * 0.72, p.w * 0.32, p.h, 10, [0.34, 0.38, 0.44], 0);
      mb.pushCylinder(p.x, p.y + p.h - 4.0, p.z, p.w * 1.05, p.w * 1.05, 0.6, 10, [0.52, 0.56, 0.60], 0);
      mb.pushSphere(p.x, p.y + p.h + 0.9, p.z, 0.75, 0.75, 0.75, 8, 6, [0.96, 0.24, 0.24], 1.0, false);
    }

    // 3. Smooth Tapered Tubular Wind Turbines with Rounded Aerodynamic Nacelle & Nose Cone
    for (const tb of landmarks.turbines) {
      mb.pushCylinder(tb.x, tb.y + tb.hubHeight * 0.5, tb.z, 1.85, 0.95, tb.hubHeight, 14, [0.88, 0.90, 0.93], 0);
      mb.pushCylinder(tb.x, tb.y + tb.hubHeight, tb.z - 0.6, 1.65, 1.50, 5.6, 12, [0.90, 0.92, 0.95], 0, rotX90);
      mb.pushSphere(tb.x, tb.y + tb.hubHeight, tb.z + 2.6, 1.45, 1.45, 2.2, 12, 8, [0.92, 0.94, 0.97], 0, false);
    }

    // 4. Smooth Multi-Tier Conifer Pines & Rounded Broadleaf Trees
    landmarks.trees.forEach((tr, idx) => {
      const s = tr.scale;
      mb.pushCylinder(tr.x, tr.y + 1.8 * s, tr.z, 0.38 * s, 0.22 * s, 3.6 * s, 7, [0.34, 0.23, 0.15], 0);
      if (idx % 4 === 0) {
        mb.pushSphere(tr.x, tr.y + 5.2 * s, tr.z, 2.5 * s, 2.2 * s, 2.5 * s, 8, 6, [0.16, 0.36, 0.19], 0, false);
        mb.pushSphere(tr.x + 1.2 * s, tr.y + 4.4 * s, tr.z + 0.8 * s, 1.7 * s, 1.5 * s, 1.7 * s, 7, 5, [0.20, 0.42, 0.22], 0, false);
        mb.pushSphere(tr.x - 1.1 * s, tr.y + 4.6 * s, tr.z - 0.9 * s, 1.6 * s, 1.5 * s, 1.6 * s, 7, 5, [0.14, 0.32, 0.17], 0, false);
      } else {
        mb.pushCylinder(tr.x, tr.y + 4.3 * s, tr.z, 2.8 * s, 0.4 * s, 4.4 * s, 8, [0.11, 0.27, 0.17], 0);
        mb.pushCylinder(tr.x, tr.y + 6.7 * s, tr.z, 2.2 * s, 0.25 * s, 3.9 * s, 8, [0.14, 0.33, 0.20], 0);
        mb.pushCylinder(tr.x, tr.y + 8.9 * s, tr.z, 1.45 * s, 0.04 * s, 3.2 * s, 8, [0.17, 0.39, 0.24], 0);
      }
    });

    // 5. Scattered Alpine Boulders & Ground Rock Outcrops
    if (landmarks.boulders) {
      for (const b of landmarks.boulders) {
        mb.pushSphere(b.x, b.y + b.ry * 0.35, b.z, b.rx, b.ry, b.rz, 7, 5, [0.42, 0.43, 0.45], 0, false);
      }
    }
  }

  // =========================================================================
  // 5. HIGH-DETAIL FIXED-WING PISTON BIPLANE AIRCRAFT (Nose = +Z, Up = +Y)
  // =========================================================================
  function buildBiplaneBodyMesh(ac) {
    const mb = new AssetMesh([]);
    const paint = ac && ac.color ? ac.color : [0.82, 0.16, 0.16];
    const accent = ac && ac.accent ? ac.accent : [0.96, 0.78, 0.22];
    const metal = [0.68, 0.72, 0.76];
    const darkSteel = [0.18, 0.20, 0.23];
    const woodStrut = [0.44, 0.30, 0.18];
    const rubber = [0.11, 0.12, 0.13];
    const glass = [0.22, 0.46, 0.62];

    // 1. Streamlined Tapered Fuselage (Front engine bay -> Cockpit -> Tapered tail cone)
    mb.pushCylinder(0, 0.05,  2.35, 0.72, 0.68, 2.30, 14, paint, 0, rotX90);
    mb.pushCylinder(0, 0.05,  0.10, 0.72, 0.62, 2.25, 14, paint, 0, rotX90);
    mb.pushCylinder(0, 0.10, -2.55, 0.62, 0.22, 3.15, 14, paint, 0, rotX90);
    // Accent fuselage racing stripe band
    mb.pushCylinder(0, 0.06,  1.20, 0.74, 0.73, 0.62, 14, accent, 0, rotX90);

    // 2. Radial Piston Engine Cowling & 7 Exposed Finned Cylinders + Exhaust Pipes
    mb.pushCylinder(0, 0.05, 3.78, 0.76, 0.66, 0.72, 16, metal, 0, rotX90);
    mb.pushCylinder(0, 0.05, 4.15, 0.56, 0.38, 0.18, 14, darkSteel, 0, rotX90);
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const cx = Math.cos(ang) * 0.58;
      const cy = 0.05 + Math.sin(ang) * 0.58;
      mb.pushSphere(cx, cy, 3.85, 0.22, 0.22, 0.26, 7, 5, darkSteel, 0, false);
    }
    // Twin side exhaust manifolds
    mb.pushCylinder(-0.74, -0.18, 2.4, 0.09, 0.08, 2.4, 8, [0.34, 0.30, 0.28], 0, rotX90);
    mb.pushCylinder( 0.74, -0.18, 2.4, 0.09, 0.08, 2.4, 8, [0.34, 0.30, 0.28], 0, rotX90);

    // 3. Open Cockpit Coaming, Tinted Windshield & Pilot Helmet
    mb.pushBox(0, 0.74, -0.25, 0.72, 0.26, 1.15, [0.22, 0.16, 0.12], 0);
    mb.pushBox(0, 0.96,  0.34, 0.68, 0.42, 0.10, glass, 0.25);
    mb.pushSphere(0, 1.04, -0.28, 0.26, 0.28, 0.28, 10, 8, [0.26, 0.18, 0.12], 0, false);
    mb.pushBox(0, 0.92, -0.45, 0.18, 0.10, 0.55, [0.95, 0.94, 0.90], 0); // Trailing aviator scarf

    // 4. Upper Biplane Wing (Span 11.8m, Chord 1.85m) with rounded tips & accent bands
    mb.pushBox(0, 1.48, 1.05, 11.2, 0.20, 1.82, paint, 0);
    mb.pushSphere(-5.65, 1.48, 1.05, 0.65, 0.11, 0.91, 8, 5, paint, 0, false);
    mb.pushSphere( 5.65, 1.48, 1.05, 0.65, 0.11, 0.91, 8, 5, paint, 0, false);
    mb.pushBox(-4.2, 1.50, 1.05, 1.15, 0.22, 1.84, accent, 0);
    mb.pushBox( 4.2, 1.50, 1.05, 1.15, 0.22, 1.84, accent, 0);
    // Wingtip Navigation Lights (Red Port / Green Starboard)
    mb.pushSphere( 6.18, 1.50, 1.15, 0.16, 0.16, 0.16, 7, 5, [0.98, 0.18, 0.16], 1.0, false);
    mb.pushSphere(-6.18, 1.50, 1.15, 0.16, 0.16, 0.16, 7, 5, [0.16, 0.98, 0.42], 1.0, false);

    // 5. Lower Biplane Wing (Span 10.2m, Chord 1.64m, slightly staggered aft)
    mb.pushBox(0, -0.34, 0.55, 9.6, 0.19, 1.62, paint, 0);
    mb.pushSphere(-4.85, -0.34, 0.55, 0.58, 0.10, 0.81, 8, 5, paint, 0, false);
    mb.pushSphere( 4.85, -0.34, 0.55, 0.58, 0.10, 0.81, 8, 5, paint, 0, false);
    mb.pushBox(-3.6, -0.32, 0.55, 0.95, 0.21, 1.64, accent, 0);
    mb.pushBox( 3.6, -0.32, 0.55, 0.95, 0.21, 1.64, accent, 0);

    // 6. Interplane Wing Struts & Center Cabane Struts (Signature Biplane Silhouette!)
    for (const sx of [-3.9, -2.1, 2.1, 3.9]) {
      mb.pushCylinder(sx, 0.57, 1.12, 0.06, 0.06, 1.85, 6, woodStrut, 0);
      mb.pushCylinder(sx, 0.57, 0.46, 0.06, 0.06, 1.85, 6, woodStrut, 0);
    }
    for (const cx of [-0.52, 0.52]) {
      mb.pushCylinder(cx, 1.02, 1.25, 0.055, 0.055, 0.95, 6, darkSteel, 0);
      mb.pushCylinder(cx, 1.02, 0.65, 0.055, 0.055, 0.95, 6, darkSteel, 0);
    }

    // 7. Empennage: Horizontal Tailplane + Vertical Fin & Rudder + White Tail Strobe
    mb.pushBox(0, 0.28, -3.72, 3.85, 0.14, 1.05, paint, 0);
    mb.pushBox(0, 0.30, -3.95, 3.65, 0.16, 0.32, accent, 0);
    mb.pushBox(0, 1.08, -3.68, 0.14, 1.55, 1.18, paint, 0);
    mb.pushBox(0, 1.12, -4.18, 0.16, 1.48, 0.36, accent, 0);
    mb.pushSphere(0, 1.86, -4.15, 0.15, 0.15, 0.15, 7, 5, [0.98, 0.98, 1.0], 1.0, false);

    // 8. Fixed Taildragger Main Landing Gear & Rubber Wheels
    for (const gx of [-1.05, 1.05]) {
      mb.pushCylinder(gx * 0.72, -0.82, 1.55, 0.06, 0.06, 1.28, 6, darkSteel, 0);
      mb.pushCylinder(gx, -1.36, 1.55, 0.44, 0.44, 0.24, 12, rubber, 0, rotZ90);
      mb.pushCylinder(gx, -1.36, 1.55, 0.22, 0.22, 0.26, 10, accent, 0, rotZ90);
    }
    mb.pushCylinder(0, -1.36, 1.55, 0.055, 0.055, 2.15, 6, darkSteel, 0, rotZ90);
    mb.pushCylinder(0, -0.28, -3.85, 0.14, 0.14, 0.10, 8, rubber, 0, rotZ90);

    return new Float32Array(mb.data);
  }

  function buildBiplanePropMesh() {
    const mb = new AssetMesh([]);
    const spinner = [0.86, 0.88, 0.92];
    const bladeWood = [0.36, 0.22, 0.12];
    const tipYellow = [0.98, 0.82, 0.14];
    // Metallic nose spinner cone along +Z
    mb.pushCylinder(0, 0, 0.24, 0.30, 0.04, 0.56, 12, spinner, 0, rotX90);
    // Two long sculpted wooden piston-aircraft propeller blades (diameter ~2.7m)
    mb.pushBox(0,  0.68, 0.05, 0.24, 1.28, 0.06, bladeWood, 0);
    mb.pushBox(0, -0.68, 0.05, 0.24, 1.28, 0.06, bladeWood, 0);
    mb.pushBox(0,  1.26, 0.05, 0.22, 0.22, 0.065, tipYellow, 0.35);
    mb.pushBox(0, -1.26, 0.05, 0.22, 0.22, 0.065, tipYellow, 0.35);
    return new Float32Array(mb.data);
  }

  global.FPVAssetsModel = {
    buildVehicleMesh,
    buildBiplaneBodyMesh,
    buildBiplanePropMesh,
    pushRealisticPedestrian,
    pushRealisticFactory,
    pushRealisticLandmarks
  };
})(window);
