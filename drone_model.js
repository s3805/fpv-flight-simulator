// AeroVeloce 5-Inch FPV Freestyle Quadcopter — High-Detail Parametric 3D Solid Mesh Builder
// Mirrors blender/build_fpv_drone.py geometry for real-time 60 FPS WebGL GPU VBO rendering
(function (global) {
  "use strict";

  // True-X motor shaft positions in local drone space (X = right, Y = up, Z = backward / -Z = forward)
  const MOTOR_MOUNTS = [
    { id: "FR", x:  0.155, y: 0.028, z: -0.145, dir: -1, front: true  },
    { id: "FL", x: -0.155, y: 0.028, z: -0.145, dir:  1, front: true  },
    { id: "RR", x:  0.155, y: 0.028, z:  0.145, dir:  1, front: false },
    { id: "RL", x: -0.155, y: 0.028, z:  0.145, dir: -1, front: false }
  ];

  class SolidMesh {
    constructor() {
      this.data = [];
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

    // Extruded convex polygon plate in XZ plane (for waisted carbon-fiber deck plates)
    pushExtrudedPlate(polyXZ, yBot, yTop, col, em) {
      const n = polyXZ.length;
      let cx = 0, cz = 0;
      for (const p of polyXZ) { cx += p[0]; cz += p[1]; }
      cx /= n; cz /= n;
      const topC = [cx, yTop, cz], botC = [cx, yBot, cz];
      for (let i = 0; i < n; i++) {
        const a = polyXZ[i], b = polyXZ[(i + 1) % n];
        const tA = [a[0], yTop, a[1]], tB = [b[0], yTop, b[1]];
        const bA = [a[0], yBot, a[1]], bB = [b[0], yBot, b[1]];
        this.pushTri(topC, tB, tA, col, em);
        this.pushTri(botC, bA, bB, col, em);
        this.pushQuad(bA, tA, tB, bB, col, em);
      }
    }

    // Smooth-shaded cylinder/frustum with optional transform (axis default = Y)
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

      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        const b0 = xform(c0 * rBot, -hy, s0 * rBot);
        const b1 = xform(c1 * rBot, -hy, s1 * rBot);
        const t0 = xform(c0 * rTop,  hy, s0 * rTop);
        const t1 = xform(c1 * rTop,  hy, s1 * rTop);

        const n0 = xformN(c0, 0, s0);
        const n1 = xformN(c1, 0, s1);

        this.pushSmoothTri(b0, n0, col, t0, n0, col, t1, n1, col, em);
        this.pushSmoothTri(b0, n0, col, t1, n1, col, b1, n1, col, em);
        this.pushSmoothTri(topC, topN, col, t1, topN, col, t0, topN, col, em);
        this.pushSmoothTri(botC, botN, col, b0, botN, col, b1, botN, col, em);
      }
    }

    // Smooth UV sphere (for VTX lollipop radome / optical dome)
    pushSphere(cx, cy, cz, r, segs, rings, col, em) {
      for (let j = 0; j < rings; j++) {
        const p0 = (j / rings) * Math.PI, p1 = ((j + 1) / rings) * Math.PI;
        const sp0 = Math.sin(p0), cp0 = Math.cos(p0), sp1 = Math.sin(p1), cp1 = Math.cos(p1);
        for (let i = 0; i < segs; i++) {
          const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2;
          const n00 = [sp0 * Math.cos(t0), cp0, sp0 * Math.sin(t0)];
          const n10 = [sp0 * Math.cos(t1), cp0, sp0 * Math.sin(t1)];
          const n01 = [sp1 * Math.cos(t0), cp1, sp1 * Math.sin(t0)];
          const n11 = [sp1 * Math.cos(t1), cp1, sp1 * Math.sin(t1)];
          const v00 = [cx + n00[0] * r, cy + n00[1] * r, cz + n00[2] * r];
          const v10 = [cx + n10[0] * r, cy + n10[1] * r, cz + n10[2] * r];
          const v01 = [cx + n01[0] * r, cy + n01[1] * r, cz + n01[2] * r];
          const v11 = [cx + n11[0] * r, cy + n11[1] * r, cz + n11[2] * r];
          if (j > 0) this.pushSmoothTri(v00, n00, col, v10, n10, col, v11, n11, col, em);
          if (j < rings - 1) this.pushSmoothTri(v00, n00, col, v11, n11, col, v01, n01, col, em);
        }
      }
    }

    toFloat32() {
      return new Float32Array(this.data);
    }
  }

  function rotX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return (lx, ly, lz, ox, oy, oz) => [ox + lx, oy + ly * c - lz * s, oz + ly * s + lz * c];
  }

  function rotY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return (lx, ly, lz, ox, oy, oz) => [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
  }

  function rotZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return (lx, ly, lz, ox, oy, oz) => [ox + lx * c - ly * s, oy + lx * s + ly * c, oz + lz];
  }

  // Build the high-detail static 5-inch FPV drone chassis, motors, electronics, cameras, LiPo & antennas
  function buildDroneBodyMesh() {
    const mb = new SolidMesh();

    // Material palette (scaled to realistic 1.35x display readability while keeping authentic proportions)
    const cCarbon   = [0.11, 0.13, 0.16];
    const cCarbonLt = [0.17, 0.20, 0.24];
    const cTitanium = [0.56, 0.61, 0.68];
    const cDarkBell = [0.22, 0.26, 0.32];
    const cCopper   = [0.84, 0.42, 0.15];
    const cAluCyan  = [0.10, 0.74, 0.88];
    const cTpuOrg   = [0.96, 0.42, 0.08];
    const cPcb      = [0.08, 0.26, 0.19];
    const cGold     = [0.92, 0.72, 0.18];
    const cLiPo     = [0.10, 0.11, 0.14];
    const cStrap    = [0.84, 0.16, 0.16];
    const cGlass    = [0.08, 0.26, 0.36];
    const cRedCap   = [0.88, 0.16, 0.16];

    // 1. Waisted 3K Carbon-Fiber Bottom Deck Plate & Top Deck Plate
    const botPoly = [
      [-0.032, -0.132], [ 0.032, -0.132],
      [ 0.052, -0.075], [ 0.052,  0.075],
      [ 0.034,  0.136], [-0.034,  0.136],
      [-0.052,  0.075], [-0.052, -0.075]
    ];
    mb.pushExtrudedPlate(botPoly, -0.010, -0.004, cCarbon, 0);

    const topPoly = [
      [-0.028, -0.122], [ 0.028, -0.122],
      [ 0.042, -0.072], [ 0.042,  0.074],
      [ 0.030,  0.132], [-0.030,  0.132],
      [-0.042,  0.074], [-0.042, -0.072]
    ];
    mb.pushExtrudedPlate(topPoly, 0.030, 0.035, cCarbon, 0);

    // 2. Four Swept True-X Diagonal Carbon Arms + Circular Motor Mount Pads + TPU Landing Skids + 2306 Brushless Motors
    for (const m of MOTOR_MOUNTS) {
      const ang = Math.atan2(m.x, m.z);
      const len = Math.hypot(m.x, m.z);
      // Tapered diagonal arm strut
      mb.pushBox(m.x * 0.5, -0.008, m.z * 0.5, 0.022, 0.008, len, cCarbonLt, 0, rotY(ang));
      // Reinforcement diagonal root gusset
      mb.pushBox(m.x * 0.26, -0.008, m.z * 0.26, 0.032, 0.0085, len * 0.34, cCarbon, 0, rotY(ang));
      // Rounded circular carbon motor mount pad
      mb.pushCylinder(m.x, -0.008, m.z, 0.022, 0.022, 0.0085, 16, cCarbon, 0);
      // Protective orange TPU arm-end landing skid
      mb.pushCylinder(m.x, -0.017, m.z, 0.014, 0.019, 0.010, 12, cTpuOrg, 0.05);

      // 2306 Brushless Outrunner Motor (smooth 16-segment cylindrical assembly)
      mb.pushCylinder(m.x,  0.000, m.z, 0.0185, 0.0195, 0.007, 16, cDarkBell, 0);      // Anodized motor base
      mb.pushCylinder(m.x,  0.008, m.z, 0.0160, 0.0160, 0.009, 16, cCopper, 0.08);     // Exposed copper stator windings
      mb.pushCylinder(m.x,  0.017, m.z, 0.0205, 0.0195, 0.013, 16, cTitanium, 0.04);   // Brushed titanium slotted bell
      mb.pushCylinder(m.x,  0.025, m.z, 0.0185, 0.0110, 0.004, 16, cDarkBell, 0);      // Bell top chamfer
      mb.pushCylinder(m.x,  0.033, m.z, 0.0058, 0.0042, 0.011, 8,  m.front ? cAluCyan : cTitanium, 0.12); // M5 locknut
    }

    // 3. Eight Knurled Anodized Aluminum Standoffs (open-frame cage silhouette)
    for (const [sx, sz] of [
      [-0.025, -0.114], [ 0.025, -0.114],
      [-0.036, -0.048], [ 0.036, -0.048],
      [-0.036,  0.050], [ 0.036,  0.050],
      [-0.025,  0.118], [ 0.025,  0.118]
    ]) {
      mb.pushCylinder(sx, 0.013, sz, 0.0042, 0.0042, 0.035, 10, cAluCyan, 0.08);
    }

    // 4. Internal Electronics Stack (4-in-1 ESC + Flight Controller + Capacitor + XT60 Plug + Power Leads)
    mb.pushBox(0, 0.004, 0.002, 0.054, 0.004, 0.054, cPcb, 0);              // 4-in-1 ESC board
    mb.pushBox(0, 0.015, 0.002, 0.050, 0.0035, 0.050, cPcb, 0);             // Flight Controller PCB
    mb.pushBox(0, 0.018, 0.002, 0.018, 0.003, 0.018, cCarbon, 0);           // STM32 F7/H7 MCU chip
    mb.pushBox(-0.024, 0.006, 0.002, 0.006, 0.003, 0.038, cGold, 0.12);     // Left ESC solder pads
    mb.pushBox( 0.024, 0.006, 0.002, 0.006, 0.003, 0.038, cGold, 0.12);     // Right ESC solder pads
    // Low-ESR electrolytic filter capacitor at rear of stack
    mb.pushCylinder(0, 0.011, 0.068, 0.008, 0.008, 0.022, 12, cCarbonLt, 0, rotX(Math.PI * 0.5));
    // Yellow XT60 battery connector + silicone power leads
    mb.pushBox(0.024, 0.020, 0.095, 0.020, 0.013, 0.024, cGold, 0.15);
    mb.pushCylinder(0.020, 0.036, 0.088, 0.004, 0.004, 0.026, 8, cRedCap, 0, rotX(-0.35));
    mb.pushCylinder(0.028, 0.036, 0.088, 0.004, 0.004, 0.026, 8, cCarbon, 0, rotX(-0.35));

    // 5. Front CNC Aluminum Camera Cage + Tilted FPV Micro-Camera & Optical Glass Lens
    mb.pushBox(-0.027, 0.014, -0.104, 0.004, 0.034, 0.038, cTitanium, 0.05); // Left CNC cage plate
    mb.pushBox( 0.027, 0.014, -0.104, 0.004, 0.034, 0.038, cTitanium, 0.05); // Right CNC cage plate
    const camTilt = rotX(0.42);
    mb.pushBox(0, 0.014, -0.108, 0.030, 0.028, 0.028, cCarbonLt, 0, camTilt);
    // Cylindrical stepped FPV lens barrel pointing forward (-Z) tilted up
    const lensTf = rotX(Math.PI * 0.5 + 0.42);
    mb.pushCylinder(0, 0.020, -0.126, 0.0115, 0.0105, 0.016, 16, cDarkBell, 0.05, lensTf);
    mb.pushCylinder(0, 0.024, -0.134, 0.0095, 0.0095, 0.004, 16, cGlass, 0.45, lensTf); // Anti-reflective cyan glass glint

    // 6. Top-Mounted Hero Action Camera on Angled Orange TPU Mount
    const goproTilt = rotX(0.44);
    mb.pushBox(0, 0.048, -0.072, 0.070, 0.026, 0.042, cTpuOrg, 0.06, goproTilt);       // 3D-printed TPU wedge mount
    mb.pushBox(0, 0.066, -0.078, 0.078, 0.054, 0.034, cCarbon, 0.02, goproTilt);       // Hero camera body
    mb.pushBox(-0.018, 0.075, -0.098, 0.028, 0.028, 0.010, cTitanium, 0.06, goproTilt); // Recessed metallic lens bezel
    const goproLensTf = rotX(Math.PI * 0.5 + 0.44);
    mb.pushCylinder(-0.018, 0.077, -0.104, 0.011, 0.011, 0.004, 16, cGlass, 0.52, goproLensTf); // Action cam optical lens
    mb.pushBox(0.016, 0.070, -0.096, 0.022, 0.018, 0.003, [0.14, 0.24, 0.30], 0.25, goproTilt); // Front status OLED screen

    // 7. 6S 1300mAh LiPo Battery Pack + Branding Band + Dual Velcro Straps
    mb.pushBox(0, 0.064, 0.034, 0.056, 0.046, 0.112, cLiPo, 0);                        // Main 6S LiPo brick
    mb.pushBox(0, 0.088, 0.034, 0.048, 0.003, 0.104, cTpuOrg, 0.15);                   // Top orange battery label
    mb.pushBox(0, 0.064, 0.006, 0.061, 0.050, 0.018, cStrap, 0.04);                    // Front Velcro strap
    mb.pushBox(0, 0.064, 0.062, 0.061, 0.050, 0.018, cStrap, 0.04);                    // Rear Velcro strap
    mb.pushBox(-0.030, 0.052, 0.084, 0.010, 0.012, 0.014, [0.92, 0.94, 0.96], 0.1);    // White JST-XH balance plug

    // 8. Rear TPU Mount + Angled SMA Lollipop VTX Antenna + Immortal-T ELRS Receiver Antenna
    mb.pushBox(0, 0.016, 0.132, 0.044, 0.024, 0.018, cTpuOrg, 0.05);                   // Rear TPU bumper/mount
    mb.pushCylinder(0.018, 0.054, 0.148, 0.0032, 0.0032, 0.068, 10, cCarbonLt, 0, rotX(0.42)); // Angled VTX coax stem
    mb.pushSphere(0.018, 0.086, 0.163, 0.0145, 14, 10, cRedCap, 0.14);                 // Omni lollipop radome cap
    // Horizontal ELRS Immortal-T antenna on rear
    mb.pushCylinder(0, 0.002, 0.150, 0.0026, 0.0026, 0.155, 10, cCarbonLt, 0, rotZ(Math.PI * 0.5));
    mb.pushBox(0, 0.002, 0.144, 0.016, 0.008, 0.016, cCarbon, 0);

    return mb.toFloat32();
  }

  // Build dynamic rear LED status strip (tinted via uniform or rebuilt cheaply)
  function buildDroneLedMesh(ledColor) {
    const mb = new SolidMesh();
    mb.pushBox(0, 0.015, 0.142, 0.042, 0.010, 0.006, ledColor, 1.0);
    return mb.toFloat32();
  }

  // Build a sculpted 3-blade twisted airfoil propeller (centered at local origin)
  function buildPropellerMesh(bladeColor, cw) {
    const mb = new SolidMesh();
    const hubCol = [0.24, 0.28, 0.34];
    mb.pushCylinder(0, 0.001, 0, 0.0105, 0.0088, 0.011, 14, hubCol, 0.04);

    const pitchSign = cw ? 1 : -1;
    const stations = [
      { r: 0.009, chord: 0.011, twist: 0.44 * pitchSign, thick: 0.0032 },
      { r: 0.036, chord: 0.022, twist: 0.34 * pitchSign, thick: 0.0026 },
      { r: 0.072, chord: 0.021, twist: 0.25 * pitchSign, thick: 0.0020 },
      { r: 0.104, chord: 0.015, twist: 0.19 * pitchSign, thick: 0.0015 },
      { r: 0.120, chord: 0.006, twist: 0.14 * pitchSign, thick: 0.0010 }
    ];

    for (let b = 0; b < 3; b++) {
      const ang = (b * Math.PI * 2) / 3;
      const ca = Math.cos(ang), sa = Math.sin(ang);

      const rings = stations.map((st) => {
        const ct = Math.cos(st.twist), stw = Math.sin(st.twist);
        const prof = [
          [-st.chord * 0.5, 0],
          [0, st.thick * 0.7],
          [st.chord * 0.5, 0],
          [0, -st.thick * 0.35]
        ];
        return prof.map(([px, py]) => {
          const lz = px * ct - py * stw;
          const ly = px * stw + py * ct;
          const wx = st.r * ca - lz * sa;
          const wz = st.r * sa + lz * ca;
          return [wx, ly, wz];
        });
      });

      for (let i = 0; i < rings.length - 1; i++) {
        const r0 = rings[i], r1 = rings[i + 1];
        for (let j = 0; j < 4; j++) {
          const jn = (j + 1) % 4;
          mb.pushQuad(r0[j], r1[j], r1[jn], r0[jn], bladeColor, 0.18);
        }
      }
      const tip = rings[rings.length - 1];
      mb.pushQuad(tip[0], tip[1], tip[2], tip[3], bladeColor, 0.18);
    }

    return mb.toFloat32();
  }

  // Build swept spinning motion-blur rotor ring (shown when motors spin fast)
  function buildPropBlurDiscMesh(ringColor) {
    const mb = new SolidMesh();
    const segs = 28;
    const rIn = 0.042, rOut = 0.122;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // Alternating subtle radial streak brightness for realistic high-RPM rotor shimmer
      const band = i % 2 === 0 ? 0.88 : 1.05;
      const col = [Math.min(1, ringColor[0] * band), Math.min(1, ringColor[1] * band), Math.min(1, ringColor[2] * band)];
      const p0i = [c0 * rIn,  0.002, s0 * rIn];
      const p0o = [c0 * rOut, 0.002, s0 * rOut];
      const p1o = [c1 * rOut, 0.002, s1 * rOut];
      const p1i = [c1 * rIn,  0.002, s1 * rIn];
      const nUp = [0, 1, 0], nDn = [0, -1, 0];
      mb.pushSmoothTri(p0i, nUp, col, p0o, nUp, col, p1o, nUp, col, 0.45);
      mb.pushSmoothTri(p0i, nUp, col, p1o, nUp, col, p1i, nUp, col, 0.45);
      mb.pushSmoothTri(p0i, nDn, col, p1o, nDn, col, p0o, nDn, col, 0.45);
      mb.pushSmoothTri(p0i, nDn, col, p1i, nDn, col, p1o, nDn, col, 0.45);
    }
    return mb.toFloat32();
  }

  global.FPVDroneModel = {
    MOTOR_MOUNTS,
    buildDroneBodyMesh,
    buildDroneLedMesh,
    buildPropellerMesh,
    buildPropBlurDiscMesh
  };
})(window);
