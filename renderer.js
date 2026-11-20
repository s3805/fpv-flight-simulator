// AeroVeloce FPV GCS — Game-Grade Multi-Pass WebGL Renderer:
// 1) Real-Time 2048² PCF Directional Sun Shadow Map (24-bit RGBA packed depth, texel-snapped)
// 2) Volumetric FBM 3D Cumulus/Cirrus Sky Dome + Night Starfield & Milky Way
// 3) Shoreline Foam Water, Cloud Ground Shadows, Dusk/Night Local Lighting, Contrails & Holographic Ghost Drone
// 4) Offscreen HDR FBO -> Quarter-Res Separable Gaussian Bloom -> ACES Filmic Tone Mapping + FPV Lens Distortion + DJI O3 VTX Glitch
// 5) High-Definition DJI O3 Tactical OSD (Pitch Ladder, Speed/Alt Tapes, Ghost Split Delta, Freestyle Combo & Air-Traffic Radar)
(function (global) {
  "use strict";

  const THEMES = {
    day: {
      skyZenith: [0.08, 0.30, 0.68],
      skyHorizon: [0.68, 0.82, 0.96],
      fogColor: [0.70, 0.82, 0.93],
      mistColor: [0.83, 0.90, 0.97],
      sunDir: [0.46, 0.46, -0.76],
      sunColor: [1.0, 0.96, 0.86],
      ambient: [0.38, 0.45, 0.56],
      cloudBright: [1.0, 0.99, 0.97],
      cloudShade: [0.58, 0.66, 0.78],
      nightFactor: 0.0,
      localLight: 0.05,
      flareAlpha: 0.82
    },
    dusk: {
      skyZenith: [0.08, 0.12, 0.30],
      skyHorizon: [0.96, 0.48, 0.24],
      fogColor: [0.80, 0.46, 0.33],
      mistColor: [0.93, 0.60, 0.42],
      sunDir: [0.58, 0.24, -0.78],
      sunColor: [1.0, 0.64, 0.34],
      ambient: [0.30, 0.26, 0.37],
      cloudBright: [1.0, 0.72, 0.48],
      cloudShade: [0.36, 0.28, 0.42],
      nightFactor: 0.25,
      localLight: 0.65,
      flareAlpha: 0.95
    },
    night: {
      skyZenith: [0.015, 0.03, 0.085],
      skyHorizon: [0.06, 0.12, 0.22],
      fogColor: [0.05, 0.10, 0.18],
      mistColor: [0.10, 0.16, 0.26],
      sunDir: [-0.35, 0.58, -0.73],
      sunColor: [0.40, 0.55, 0.85],
      ambient: [0.14, 0.19, 0.29],
      cloudBright: [0.22, 0.30, 0.44],
      cloudShade: [0.07, 0.10, 0.18],
      nightFactor: 1.0,
      localLight: 1.0,
      flareAlpha: 0.22
    }
  };

  function mat4Perspective(fovRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovRad * 0.5);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  }

  function mat4Ortho(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  }

  function mat4LookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-5) { xx = 1; xy = 0; xz = 0; } else { xx /= len; xy /= len; xz /= len; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const out = new Float32Array(16);
    out[0] = xx; out[1] = yx; out[2] = zx; out[4] = xy; out[5] = yy; out[6] = zy; out[8] = xz; out[9] = yz; out[10] = zz;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
      out[col * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  const MAT4_IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

  function mat4FromQuatTransScale(q, pos, s) {
    const w = q[0], x = q[1], y = q[2], z = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const out = new Float32Array(16);
    out[0] = (1 - (yy + zz)) * s; out[1] = (xy + wz) * s;       out[2] = (xz - wy) * s;       out[3] = 0;
    out[4] = (xy - wz) * s;       out[5] = (1 - (xx + zz)) * s; out[6] = (yz + wx) * s;       out[7] = 0;
    out[8] = (xz + wy) * s;       out[9] = (yz - wx) * s;       out[10] = (1 - (xx + yy)) * s; out[11] = 0;
    out[12] = pos[0];             out[13] = pos[1];             out[14] = pos[2];             out[15] = 1;
    return out;
  }

  function mat4TranslateRotateY(tx, ty, tz, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return new Float32Array([
      c, 0, -s, 0,
      0, 1,  0, 0,
      s, 0,  c, 0,
      tx, ty, tz, 1
    ]);
  }

  function projectPoint(mvp, x, y, z, width, height) {
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0.05) {
      return { behind: true, sx: (cx / (Math.abs(cw) || 1)) * width, sy: (-cy / (Math.abs(cw) || 1)) * height };
    }
    return { behind: false, sx: ((cx / cw) * 0.5 + 0.5) * width, sy: (-(cy / cw) * 0.5 + 0.5) * height };
  }

  function formatRaceTime(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return "--:--.--";
    const totalSec = Math.max(0, ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(2).padStart(5, "0");
    return `${String(mins).padStart(2, "0")}:${secs}`;
  }

  class MeshBuilder {
    constructor() { this.data = []; }

    pushSmoothTri(p1, n1, c1, p2, n2, c2, p3, n3, c3, emissive) {
      const em = emissive || 0;
      this.data.push(
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], c1[0], c1[1], c1[2], em,
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], c2[0], c2[1], c2[2], em,
        p3[0], p3[1], p3[2], n3[0], n3[1], n3[2], c3[0], c3[1], c3[2], em
      );
    }

    pushTri(p1, p2, p3, color, emissive) {
      const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
      const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const em = emissive || 0;
      for (const p of [p1, p2, p3]) this.data.push(p[0], p[1], p[2], nx, ny, nz, color[0], color[1], color[2], em);
    }

    pushQuad(p1, p2, p3, p4, color, emissive) {
      this.pushTri(p1, p2, p3, color, emissive);
      this.pushTri(p1, p3, p4, color, emissive);
    }

    pushBox(cx, cy, cz, sx, sy, sz, color, emissive, transformFn) {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const corners = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy,  hz], [hx, -hy,  hz], [hx, hy,  hz], [-hx, hy,  hz]
      ].map((c) => (transformFn ? transformFn(c[0], c[1], c[2], cx, cy, cz) : [cx + c[0], cy + c[1], cz + c[2]]));
      this.pushQuad(corners[4], corners[5], corners[6], corners[7], color, emissive);
      this.pushQuad(corners[1], corners[0], corners[3], corners[2], color, emissive);
      this.pushQuad(corners[5], corners[1], corners[2], corners[6], color, emissive);
      this.pushQuad(corners[0], corners[4], corners[7], corners[3], color, emissive);
      this.pushQuad(corners[7], corners[6], corners[2], corners[3], color, emissive);
      this.pushQuad(corners[0], corners[1], corners[5], corners[4], color, emissive);
    }

    pushBeam(p0, p1, radius, color, emissive) {
      const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
      const hl = Math.hypot(dx, dz) || 1;
      const rx = -dz / hl, rz = dx / hl, r = radius || 0.35;
      this.pushQuad([p0[0]-rx*r,p0[1],p0[2]-rz*r],[p0[0]+rx*r,p0[1],p0[2]+rz*r],[p1[0]+rx*r,p1[1],p1[2]+rz*r],[p1[0]-rx*r,p1[1],p1[2]-rz*r],color,emissive);
      this.pushQuad([p0[0],p0[1]-r,p0[2]],[p0[0],p0[1]+r,p0[2]],[p1[0],p1[1]+r,p1[2]],[p1[0],p1[1]-r,p1[2]],color,emissive);
    }

    toFloat32() { return new Float32Array(this.data); }
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vsSrc], [gl.FRAGMENT_SHADER, fsSrc]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error("Shader error:", gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error("Link error:", gl.getProgramInfoLog(prog));
    return prog;
  }

  function createRenderTarget(gl, w, h, filter, withDepth, depthExts) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    let depthRb = null;
    let depthTex = null;
    let ok = false;

    if (withDepth) {
      // 1) Prefer 24/32-bit hardware depth texture (WEBGL_depth_texture) for zero z-fighting at long range
      if (depthExts && depthExts.depthTex) {
        depthTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, depthTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (!ok) {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
          gl.deleteTexture(depthTex);
          depthTex = null;
        }
      }

      // 2) Fallback to 24-bit DEPTH24_STENCIL8_OES renderbuffer (OES_packed_depth_stencil)
      if (!ok && depthExts && depthExts.packedDepth) {
        depthRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
        gl.renderbufferStorage(gl.RENDERBUFFER, depthExts.packedDepth.DEPTH24_STENCIL8_OES, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthRb);
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (!ok) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
          gl.deleteRenderbuffer(depthRb);
          depthRb = null;
        }
      }

      // 3) Universal WebGL1 16-bit depth fallback
      if (!ok) {
        depthRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      }
    } else {
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    return { fbo, tex, depthRb, depthTex, w, h, ok };
  }

  function destroyRenderTarget(gl, rt) {
    if (!rt) return;
    if (rt.tex) gl.deleteTexture(rt.tex);
    if (rt.depthTex) gl.deleteTexture(rt.depthTex);
    if (rt.depthRb) gl.deleteRenderbuffer(rt.depthRb);
    if (rt.fbo) gl.deleteFramebuffer(rt.fbo);
  }

  class FPVSceneRenderer {
    constructor(glCanvas, hudCanvas, gates, landmarks, factory, actors) {
      this.glCanvas = glCanvas;
      this.hudCanvas = hudCanvas;
      this.ctx2d = hudCanvas.getContext("2d");
      this.gates = gates;
      this.landmarks = landmarks;
      this.factory = factory;
      this.actors = actors || { vehicles: [], pedestrians: [], aircraft: [] };

      this.cameraMode = "FPV";
      this.skyMode = "day";
      this.weatherMode = "clear"; // "clear" | "rain" | "snow"
      this.rainAmount = 0.0;
      this.snowAmount = 0.0;
      this.lensWetness = 0.0;
      this.inCloudFactor = 0.0;
      this.quality = "ultra"; // "ultra" (2-Cascade CSM + Depth SSAO + Raymarched 3D Clouds + Bloom + Foliage) | "high"
      this.showOsd = true;
      this.cinemaMode = false; // GoPro Pure Cinema Mode (hides HUD, gates, waypoints; boosts motion blur & filmic color)
      this.autoExposure = 1.0;
      this.prevCamFwd = [0, 0, -1];
      this.groundCamPos = [18, 6, -24];
      this.chaseOffset = [0, 0.72, 2.15];
      this.orbitAngle = 0.65;
      this.dustParticles = [];
      this.trickPopup = null;
      this.lastSeenTrickTime = 0;

      this.speedStreaks = Array.from({ length: 28 }, (_, i) => ({
        angle: (i / 28) * Math.PI * 2 + (i % 3) * 0.17,
        phase: (i * 0.37) % 1
      }));

      this.gl = glCanvas.getContext("webgl", { antialias: true, alpha: false, depth: true });
      if (this.gl) {
        this.depthExts = {
          depthTex: this.gl.getExtension ? this.gl.getExtension("WEBGL_depth_texture") : null,
          packedDepth: this.gl.getExtension ? this.gl.getExtension("OES_packed_depth_stencil") : null
        };
        this.initGL();
        this.buildStaticWorld();
        this.buildFoliageBuffer();
        this.buildWeatherBuffer();
      }
      this.resize();
    }

    setQuality(q) {
      const next = q === "high" ? "high" : "ultra";
      if (this.quality === next) return;
      this.quality = next;
      if (this.gl) {
        this.initShadowTarget();
        this.initPostTargets(this.glCanvas.width, this.glCanvas.height);
      }
    }

    setWeather(mode) {
      if (mode === "rain" || mode === "snow" || mode === "clear") {
        this.weatherMode = mode;
      }
    }

    initShadowTarget() {
      const gl = this.gl;
      destroyRenderTarget(gl, this.shadowRT0);
      destroyRenderTarget(gl, this.shadowRT1);
      const sz0 = this.quality === "ultra" ? 2048 : 1024;
      const sz1 = 1024;
      this.shadowRT0 = createRenderTarget(gl, sz0, sz0, gl.NEAREST, true, this.depthExts);
      this.shadowRT1 = createRenderTarget(gl, sz1, sz1, gl.NEAREST, true, this.depthExts);
      this.shadowRT = this.shadowRT0;
    }

    initPostTargets(pixelW, pixelH) {
      const gl = this.gl;
      if (!gl || pixelW < 4 || pixelH < 4) return;
      if (this.sceneRT && this.sceneRT.w === pixelW && this.sceneRT.h === pixelH) return;

      destroyRenderTarget(gl, this.sceneRT);
      destroyRenderTarget(gl, this.bloomRTA);
      destroyRenderTarget(gl, this.bloomRTB);
      destroyRenderTarget(gl, this.ssaoRT);
      destroyRenderTarget(gl, this.ssaoBlurRT);

      this.sceneRT = createRenderTarget(gl, pixelW, pixelH, gl.LINEAR, true, this.depthExts);
      const bw = Math.max(4, Math.floor(pixelW * 0.25));
      const bh = Math.max(4, Math.floor(pixelH * 0.25));
      this.bloomRTA = createRenderTarget(gl, bw, bh, gl.LINEAR, false, null);
      this.bloomRTB = createRenderTarget(gl, bw, bh, gl.LINEAR, false, null);

      const sw = Math.max(4, Math.floor(pixelW * 0.5));
      const sh = Math.max(4, Math.floor(pixelH * 0.5));
      this.ssaoRT = createRenderTarget(gl, sw, sh, gl.LINEAR, false, null);
      this.ssaoBlurRT = createRenderTarget(gl, sw, sh, gl.LINEAR, false, null);
    }

    initGL() {
      const gl = this.gl;
      const hpFmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_P);
      const PREC = hpFmt && hpFmt.precision > 0 ? "precision highp float;" : "precision mediump float;";

      this.screenQuadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.screenQuadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

      // 1. Directional Sun Shadow Depth Pass (24-bit RGBA packed depth)
      this.shadowProg = createProgram(gl, `
        attribute vec3 aPos;
        attribute float aEmissive;
        uniform mat4 uLightMVP, uModel;
        varying float vWaterFlag;
        void main() {
          vWaterFlag = aEmissive;
          gl_Position = uLightMVP * (uModel * vec4(aPos, 1.0));
        }
      `, `
        ${PREC}
        varying float vWaterFlag;
        vec4 packDepth(float d) {
          d = clamp(d, 0.0, 0.999999);
          vec3 enc = fract(vec3(1.0, 256.0, 65536.0) * d);
          enc.xy -= enc.yz / 256.0;
          return vec4(enc, 1.0);
        }
        void main() {
          if (vWaterFlag < -0.5) discard;
          gl_FragColor = packDepth(gl_FragCoord.z);
        }
      `);

      // 2. True Raymarched 3D Volumetric Clouds + Rayleigh/Mie Atmospheric Sky + Night Starfield
      this.skyProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen; gl_Position = vec4(aScreen, 0.999, 1.0); }
      `, `
        ${PREC}
        varying vec2 vUv;
        uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp, uSkyZenith, uSkyHorizon, uMistColor, uSunDir, uSunColor;
        uniform vec3 uCloudBright, uCloudShade;
        uniform float uTanHalfFov, uAspect, uTime, uNightFactor, uUltraClouds, uCloudCoverage;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float vnoise3(vec3 p) {
          float zi = floor(p.z);
          float zf = fract(p.z);
          zf = zf * zf * (3.0 - 2.0 * zf);
          vec2 off = vec2(37.0, 17.0);
          float n0 = vnoise(p.xy + zi * off);
          float n1 = vnoise(p.xy + (zi + 1.0) * off);
          return mix(n0, n1, zf);
        }
        float fbm4(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) {
            s += a * vnoise(p);
            p = p * 2.03 + vec2(17.1, -9.4);
            a *= 0.5;
          }
          return s;
        }
        float cloudDensity3D(vec3 wp) {
          const float C_BASE = 165.0;
          const float C_TOP = 295.0;
          float hFrac = (wp.y - C_BASE) / (C_TOP - C_BASE);
          if (hFrac <= 0.0 || hFrac >= 1.0) return 0.0;
          // Flat cumulus base + billowy anvil/dome top
          float heightProfile = smoothstep(0.0, 0.16, hFrac) * smoothstep(1.0, 0.42, hFrac);
          vec3 q = vec3(wp.xz * 0.0024 + vec2(uTime * 0.0055, uTime * 0.0022), wp.y * 0.011);
          float baseShape = vnoise3(q) * 0.62 + vnoise3(q * 2.15 + vec3(7.3, -4.1, 2.7)) * 0.28 + vnoise3(q * 4.4 - vec3(uTime * 0.012, 0.0, 1.9)) * 0.10;
          float thresh = mix(0.64, 0.34, clamp(uCloudCoverage, 0.0, 1.0));
          float d = smoothstep(thresh, thresh + 0.28, baseShape * (0.72 + 0.42 * heightProfile));
          return d * heightProfile;
        }
        float hgPhase(float cosTheta, float g) {
          float g2 = g * g;
          return (1.0 - g2) / (4.0 * 3.1415926 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.05), 1.5));
        }

        void main() {
          vec3 dir = normalize(uCamFwd + vUv.x * uAspect * uTanHalfFov * uCamRight + vUv.y * uTanHalfFov * uCamUp);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uSkyHorizon, uSkyZenith, pow(h, 0.55));
          if (dir.y < 0.0) {
            col = mix(uSkyHorizon, uMistColor * 0.72, clamp(-dir.y * 2.5, 0.0, 1.0));
          }

          vec3 sDir = normalize(uSunDir);
          float sunDot = max(dot(dir, sDir), 0.0);

          // Night Starfield & Milky Way Band
          if (uNightFactor > 0.05 && dir.y > 0.01) {
            vec2 starUv = dir.xz / (dir.y + 0.35) * 95.0;
            vec2 cell = floor(starUv);
            vec2 f = fract(starUv) - 0.5;
            float rnd = hash21(cell);
            if (rnd > 0.968) {
              float d2 = dot(f, f);
              float twinkle = 0.72 + 0.28 * sin(uTime * 3.8 + rnd * 90.0);
              float star = exp(-d2 * 42.0) * smoothstep(0.02, 0.25, dir.y) * twinkle;
              col += vec3(0.82, 0.90, 1.0) * star * uNightFactor * 1.15;
            }
            float milky = fbm4(dir.xz * 2.4 + vec2(dir.y * 1.8, 0.4));
            col += vec3(0.07, 0.11, 0.20) * smoothstep(0.45, 0.85, milky) * smoothstep(0.08, 0.55, dir.y) * uNightFactor;
          }

          // Solar / Lunar Mie Halo & Bright Disc (balanced to preserve crisp cloud contrast)
          float weatherSunFade = clamp(1.0 - max(0.0, uCloudCoverage - 0.55) * 1.6, 0.25, 1.0);
          col += uSunColor * pow(sunDot, 6.0) * 0.14 * weatherSunFade;
          col += uSunColor * pow(sunDot, 36.0) * 0.34 * weatherSunFade;
          col += uSunColor * smoothstep(0.9972, 0.9994, sunDot) * 1.45 * weatherSunFade;

          // === TRUE 3D RAYMARCHED VOLUMETRIC CLOUDS (165m .. 295m) ===
          const float C_BASE = 165.0;
          const float C_TOP = 295.0;
          float tStart = -1.0;
          float tEnd = -1.0;
          if (abs(dir.y) < 0.004) {
            if (uCamPos.y >= C_BASE && uCamPos.y <= C_TOP) {
              tStart = 6.0;
              tEnd = 1350.0;
            }
          } else {
            float t0 = (C_BASE - uCamPos.y) / dir.y;
            float t1 = (C_TOP - uCamPos.y) / dir.y;
            tStart = max(0.0, min(t0, t1));
            tEnd = max(t0, t1);
          }

          if (tEnd > tStart + 2.0 && tStart < 2100.0) {
            tEnd = min(tEnd, min(tStart + 1280.0, 2250.0));
            float marchSteps = uUltraClouds > 0.5 ? 16.0 : 10.0;
            float stepLen = (tEnd - tStart) / marchSteps;
            // Interleaved Gradient Noise dither to completely eliminate raymarch banding
            float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            float t = tStart + stepLen * dither;

            float trans = 1.0;
            vec3 cloudLight = vec3(0.0);
            float phase = mix(hgPhase(sunDot, 0.58) * 0.72, 0.14, 0.48);
            float silverBoost = pow(sunDot, 9.0) * 0.42;

            for (int i = 0; i < 16; i++) {
              if (uUltraClouds < 0.5 && i >= 10) break;
              if (trans < 0.03) break;
              vec3 pos = uCamPos + dir * t;
              float dens = cloudDensity3D(pos);
              if (dens > 0.005) {
                // 2-tap sunward light march for authentic 3D self-shadowing & backlit silver lining
                float dL1 = cloudDensity3D(pos + sDir * 24.0);
                float dL2 = cloudDensity3D(pos + sDir * 62.0);
                float lightDepth = (dL1 * 24.0 + dL2 * 44.0) * 0.026;
                float beer = exp(-lightDepth * 1.55);
                float powder = 1.0 - exp(-dens * 2.2);
                float hNorm = clamp((pos.y - C_BASE) / (C_TOP - C_BASE), 0.0, 1.0);

                // Multi-scattering warm top + deep cool skylight base
                vec3 scatterCol = mix(uCloudShade, uCloudBright, clamp(beer * (0.50 + 0.50 * hNorm) + 0.10 * powder, 0.0, 1.0));
                scatterCol += uSunColor * (phase * beer + silverBoost * beer * (1.0 - dens * 0.55));

                float distFade = exp(-t * 0.00050);
                scatterCol = mix(uMistColor, scatterCol, distFade);

                float stepExt = exp(-dens * stepLen * 0.028);
                cloudLight += trans * (1.0 - stepExt) * scatterCol;
                trans *= stepExt;
              }
              t += stepLen;
            }
            col = col * trans + cloudLight;
          }

          // High-altitude wispy cirrus streaks above the volumetric cumulus deck
          if (uUltraClouds > 0.5 && dir.y > 0.03 && uCamPos.y < 520.0) {
            float tc = (540.0 - uCamPos.y) / dir.y;
            vec2 cirUv = (uCamPos.xz + dir.xz * tc) * 0.00075 + vec2(-uTime * 0.0022, 0.0);
            float cirrus = smoothstep(0.58, 0.84, vnoise(vec2(cirUv.x * 2.8, cirUv.y * 0.7)));
            float cirFade = smoothstep(0.03, 0.22, dir.y) * exp(-tc * 0.00014);
            col = mix(col, uCloudBright, cirrus * cirFade * 0.22);
          }

          // Horizon Atmospheric Mist Band
          float mistBand = exp(-abs(dir.y - 0.02) * 11.0);
          col = mix(col, uMistColor, mistBand * (0.34 + max(0.0, uCloudCoverage - 0.5) * 0.45));

          gl_FragColor = vec4(col, 1.0);
        }
      `);

      // 3. PBR-Lit World + 2-Cascade CSM Soft Shadows + Wet PBR Puddles & Rain Ripples + Dynamic Snow + Shoreline Foam Water
      this.worldProg = createProgram(gl, `
        attribute vec3 aPos, aNormal, aColor;
        attribute float aEmissive;
        uniform mat4 uMVP, uModel, uLightMVP0, uLightMVP1;
        varying vec3 vWorldPos, vLocalPos, vNormal, vColor;
        varying vec4 vShadowCoord0, vShadowCoord1;
        varying float vEmissive;
        void main() {
          vec4 wp = uModel * vec4(aPos, 1.0);
          vWorldPos = wp.xyz;
          vLocalPos = aPos;
          vNormal = normalize(mat3(uModel) * aNormal);
          vColor = aColor;
          vEmissive = aEmissive;
          vShadowCoord0 = uLightMVP0 * wp;
          vShadowCoord1 = uLightMVP1 * wp;
          gl_Position = uMVP * wp;
        }
      `, `
        ${PREC}
        varying vec3 vWorldPos, vLocalPos, vNormal, vColor;
        varying vec4 vShadowCoord0, vShadowCoord1;
        varying float vEmissive;
        uniform sampler2D uShadowMap0, uShadowMap1;
        uniform vec3 uCamPos, uSunDir, uSunColor, uAmbient, uFogColor, uMistColor, uSkyZenith, uSkyHorizon, uGhostTint;
        uniform vec3 uDronePos;
        uniform float uTime, uDroneShade, uAlpha, uShadowTexel0, uShadowTexel1, uShadowEnabled, uLocalLight, uGhostMode, uThrottle;
        uniform float uRainAmount, uSnowAmount;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        // Multi-octave Ridged-FBM for Chamonix-grade alpine rock, snow sastrugi & concrete micro-relief
        float ridgedFbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.52;
          for (int i = 0; i < 3; i++) {
            float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
            sum += n * n * amp;
            p = p * 2.12 + vec2(13.7, -7.9);
            amp *= 0.48;
          }
          return sum;
        }
        // Procedural raindrop concentric ripple normal perturbation on puddles & water
        vec2 rainRippleGrad(vec2 wp, float t) {
          vec2 cell = floor(wp * 0.85);
          vec2 f = fract(wp * 0.85) - 0.5;
          float rnd = hash21(cell);
          float phase = fract(t * (0.75 + rnd * 0.55) + rnd * 7.13);
          vec2 center = vec2(hash21(cell + 17.3) - 0.5, hash21(cell + 41.7) - 0.5) * 0.55;
          vec2 d = f - center;
          float dist = length(d);
          float ring = sin((dist - phase * 0.48) * 34.0) * exp(-abs(dist - phase * 0.48) * 14.0);
          float fade = (1.0 - phase) * smoothstep(0.0, 0.08, phase);
          return (d / max(dist, 0.01)) * (ring * fade * 0.24);
        }
        float unpackDepth(vec4 rgba) {
          return dot(rgba.rgb, vec3(1.0, 1.0 / 256.0, 1.0 / 65536.0));
        }
        float sampleCascadePCF(sampler2D smap, vec3 proj, float texel, float bias) {
          float sum = 0.0;
          for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
              vec2 uv = proj.xy + vec2(float(dx), float(dy)) * texel;
              float closest = unpackDepth(texture2D(smap, uv));
              sum += (proj.z - bias <= closest) ? 1.0 : 0.0;
            }
          }
          return sum / 9.0;
        }

        // Seamless 2-Cascade CSM (Cascade 0: razor-sharp near 96m, Cascade 1: macro 520m canyon/ridge)
        float computeShadow(float ndl) {
          if (uShadowEnabled < 0.5) return 1.0;
          vec3 proj0 = vShadowCoord0.xyz / max(vShadowCoord0.w, 0.0001) * 0.5 + 0.5;
          float edge0 = max(abs(proj0.x - 0.5), abs(proj0.y - 0.5));
          float bias0 = clamp(0.0012 + 0.0028 * (1.0 - ndl), 0.0010, 0.0046);

          vec3 proj1 = vShadowCoord1.xyz / max(vShadowCoord1.w, 0.0001) * 0.5 + 0.5;
          float edge1 = max(abs(proj1.x - 0.5), abs(proj1.y - 0.5));
          float bias1 = clamp(0.0020 + 0.0042 * (1.0 - ndl), 0.0016, 0.0068);

          float in0 = (edge0 < 0.485 && proj0.z > 0.002 && proj0.z < 0.998) ? 1.0 : 0.0;
          float in1 = (edge1 < 0.485 && proj1.z > 0.002 && proj1.z < 0.998) ? 1.0 : 0.0;

          if (in0 > 0.5) {
            float s0 = sampleCascadePCF(uShadowMap0, proj0, uShadowTexel0, bias0);
            float blend = smoothstep(0.38, 0.485, edge0);
            if (blend > 0.001) {
              float s1 = in1 > 0.5 ? sampleCascadePCF(uShadowMap1, proj1, uShadowTexel1, bias1) : 1.0;
              return mix(s0, s1, blend);
            }
            return s0;
          }
          if (in1 > 0.5) {
            float s1 = sampleCascadePCF(uShadowMap1, proj1, uShadowTexel1, bias1);
            float borderFade = smoothstep(0.42, 0.485, edge1);
            return mix(s1, 1.0, borderFade);
          }
          return 1.0;
        }

        vec3 computeLocalNightGlow(vec3 wp, vec3 n) {
          if (uLocalLight < 0.02) return vec3(0.0);
          vec3 glow = vec3(0.0);
          // 1) Valley Town Main Street & Commercial Plaza (-142..32, 72..220)
          vec2 dTown = max(abs(wp.xz - vec2(-55.0, 146.0)) - vec2(82.0, 70.0), 0.0);
          float townAtt = exp(-dot(dTown, dTown) * 0.0012) * exp(-max(0.0, wp.y - 6.0) * 0.065);
          glow += vec3(1.0, 0.76, 0.42) * townAtt * 0.62;

          // 2) Abandoned Factory Yard Floodlights (-125..105, -215..-50)
          vec2 dFac = max(abs(wp.xz - vec2(-10.0, -132.0)) - vec2(95.0, 68.0), 0.0);
          float facAtt = exp(-dot(dFac, dFac) * 0.0010) * exp(-max(0.0, wp.y - 8.0) * 0.05);
          glow += vec3(0.95, 0.68, 0.36) * facAtt * 0.42;

          // 3) West Mountain FPV Tunnel Interior LED Strips (-438..-292, 66..86, -190..-150)
          vec3 dTun = max(abs(wp - vec3(-365.0, 74.0, -170.0)) - vec3(72.0, 9.0, 14.0), 0.0);
          float tunAtt = exp(-dot(dTun, dTun) * 0.015);
          glow += vec3(0.45, 0.85, 1.0) * tunAtt * 0.78;

          return glow * uLocalLight * (0.45 + 0.55 * max(n.y, 0.2));
        }

        void main() {
          vec3 sDir = normalize(uSunDir);
          vec3 viewVec = uCamPos - vWorldPos;
          float dist = length(viewVec);
          vec3 viewDir = viewVec / max(dist, 0.001);

          // Holographic Ghost Drone Mode
          if (uGhostMode > 0.5) {
            vec3 n = normalize(vNormal);
            float rim = pow(1.0 - abs(dot(n, viewDir)), 2.2);
            float scan = 0.78 + 0.22 * sin(vWorldPos.y * 42.0 - uTime * 12.0);
            vec3 holo = uGhostTint * (0.65 + rim * 1.45) * scan;
            gl_FragColor = vec4(holo, uAlpha * (0.52 + rim * 0.48));
            return;
          }

          // Drifting Overhead Cloud Ground Shadow (syncs with volumetric clouds)
          vec2 cUv = vWorldPos.xz * 0.0024 + vec2(uTime * 0.0055, uTime * 0.0022);
          float cloudCover = smoothstep(0.46, 0.76, vnoise(cUv) * 0.7 + vnoise(cUv * 2.2) * 0.3);
          float cloudLit = 1.0 - cloudCover * (0.30 + uRainAmount * 0.22);

          // Physically-grounded cool blue skylight color for shadow fill (Chamonix color science)
          vec3 coolSkyFill = mix(uAmbient, uSkyZenith * 1.45 + vec3(0.10, 0.16, 0.26), 0.42);

          vec3 baseCol;
          if (vEmissive < -0.5) {
            // === ANIMATED REFLECTIVE WATER + PROP-WASH RIPPLES + RAIN RIPPLES + ALPINE REFLECTION ===
            float shallow = clamp(-vEmissive - 1.0, 0.0, 1.0);
            vec2 wp = vWorldPos.xz;
            float w1 = sin(wp.x * 0.28 + uTime * 2.3 + cos(wp.y * 0.22 - uTime * 1.6));
            float w2 = cos(wp.y * 0.41 - uTime * 2.9 + sin(wp.x * 0.35 + uTime * 1.4));
            float w3 = sin((wp.x + wp.y) * 0.82 + uTime * 3.8);
            vec2 waveGrad = vec2((w1 + w3 * 0.45) * 0.072, (w2 - w3 * 0.45) * 0.072);

            if (uRainAmount > 0.02 && dist < 160.0) {
              float rf = uRainAmount * (1.0 - smoothstep(40.0, 160.0, dist));
              waveGrad += (rainRippleGrad(wp, uTime) + rainRippleGrad(wp * 1.45 + vec2(9.1, 4.7), uTime * 1.18)) * rf;
            }

            // Real-time Drone Prop-Wash Concentric Water Ripples when flying low over water
            float dAlt = max(0.0, uDronePos.y - vWorldPos.y);
            float propFoam = 0.0;
            if (dAlt < 14.0) {
              vec2 dVec = wp - uDronePos.xz;
              float dRad = length(dVec);
              if (dRad < 22.0) {
                float altFade = 1.0 - smoothstep(0.5, 14.0, dAlt);
                float radFade = exp(-dRad * 0.14) * smoothstep(0.15, 1.2, dRad);
                float ringWave = cos(dRad * 3.4 - uTime * 14.0);
                float power = (0.35 + uThrottle * 0.85) * altFade;
                vec2 rDir = dVec / max(dRad, 0.01);
                waveGrad += rDir * (ringWave * 0.28 * radFade * power);
                propFoam = exp(-dRad * 0.38) * power * (0.45 + 0.55 * sin(dRad * 5.2 - uTime * 16.0));
              }
            }

            vec3 wn = normalize(vec3(waveGrad.x, 1.0, waveGrad.y));

            float fresnel = pow(1.0 - max(dot(wn, viewDir), 0.0), 3.4);
            fresnel = clamp(0.16 + fresnel * 0.82, 0.0, 0.96);
            vec3 reflDir = reflect(-viewDir, wn);
            vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, pow(clamp(reflDir.y, 0.0, 1.0), 0.58));

            // Distant alpine ridge silhouette reflection on water
            float ridgeProfile = 0.06 + 0.09 * vnoise(vec2(atan(reflDir.x, reflDir.z) * 3.2, 1.5));
            float inRidgeRefl = 1.0 - smoothstep(ridgeProfile - 0.025, ridgeProfile + 0.025, reflDir.y);
            vec3 mtnReflCol = mix(vec3(0.20, 0.27, 0.36), uFogColor, 0.48);
            skyRefl = mix(skyRefl, mtnReflCol, inRidgeRefl * 0.52);

            vec3 deepCol = mix(vColor, vec3(0.08, 0.44, 0.52), shallow * 0.68);
            vec3 waterBody = deepCol * (0.58 + 0.42 * max(dot(wn, sDir), 0.0) * cloudLit);

            float shadow = computeShadow(0.85) * cloudLit;
            vec3 halfVec = normalize(sDir + viewDir);
            float sunGlitter = pow(max(dot(wn, halfVec), 0.0), 140.0) * 2.55 * shadow * (1.0 - uRainAmount * 0.55);
            float broadSheen = pow(max(dot(wn, halfVec), 0.0), 22.0) * 0.38 * shadow;

            baseCol = mix(waterBody, skyRefl, fresnel) + uSunColor * (sunGlitter + broadSheen);

            // Animated White Shoreline Foam Band + Prop-Wash Spray Ring
            if (shallow > 0.20) {
              float waveBand = sin(shallow * 16.0 - uTime * 3.4 + vnoise(wp * 0.35) * 4.5);
              float foam = smoothstep(0.30, 0.92, shallow) * smoothstep(0.15, 0.85, waveBand * 0.5 + 0.5);
              baseCol = mix(baseCol, vec3(0.92, 0.96, 1.0), foam * 0.74);
            }
            if (propFoam > 0.02) {
              baseCol = mix(baseCol, vec3(0.92, 0.97, 1.0), clamp(propFoam * 0.72, 0.0, 0.85));
            }
          } else if (uDroneShade > 0.5) {
            // === PBR METALLIC / 3K CARBON-FIBER / AUTOMOTIVE GLOSS SHADING ===
            vec3 n = normalize(vNormal);
            float ndl = max(dot(n, sDir), 0.0);
            float shadow = computeShadow(ndl) * cloudLit;
            float hemi = n.y * 0.5 + 0.5;
            vec3 halfVec = normalize(sDir + viewDir);
            float specTight = pow(max(dot(n, halfVec), 0.0), 72.0 + uRainAmount * 48.0) * (1.05 + uRainAmount * 0.45) * shadow;
            float specBroad = pow(max(dot(n, halfVec), 0.0), 18.0) * 0.28 * shadow;
            float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * (0.42 + uRainAmount * 0.24);

            float isDark = 1.0 - smoothstep(0.15, 0.32, max(vColor.r, max(vColor.g, vColor.b)));
            float weave = sin((vLocalPos.x + vLocalPos.z) * 420.0) * sin((vLocalPos.x - vLocalPos.z) * 420.0);
            vec3 matCol = vColor * (1.0 + weave * 0.15 * isDark);

            vec3 lit = matCol * (coolSkyFill * (0.58 + 0.56 * hemi) + uSunColor * ndl * 1.04 * shadow + computeLocalNightGlow(vWorldPos, n));
            lit += uSunColor * (specTight + specBroad) + uSkyHorizon * rim;
            baseCol = mix(lit, vColor * (1.35 + vEmissive * 0.55), clamp(vEmissive, 0.0, 1.0));
          } else {
            // === CHAMONIX-GRADE TRIPLANAR RIDGED-FBM MICRO-NORMALS + WET PBR + DYNAMIC SNOW ===
            vec3 geomN = normalize(vNormal);
            float detailFade = 1.0 - smoothstep(32.0, 260.0, dist);
            float emMask = 1.0 - clamp(vEmissive, 0.0, 1.0);

            // Detect surface material class from albedo & slope
            float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
            float baseSnow = smoothstep(0.76, 0.88, lum) * smoothstep(95.0, 125.0, vWorldPos.y);
            float isSteep = 1.0 - smoothstep(0.42, 0.86, geomN.y);
            float isRoadOrConcrete = (1.0 - baseSnow) * smoothstep(0.88, 0.99, geomN.y) * (1.0 - smoothstep(0.06, 0.18, abs(vColor.g - vColor.r)));

            // Dynamic Weather Snow Accumulation across valley, roofs, factory yard & ridges
            float snowDrift = vnoise(vWorldPos.xz * 0.085) * 0.55 + vnoise(vWorldPos.xz * 0.31) * 0.45;
            float dynSnow = uSnowAmount * smoothstep(0.32, 0.78, geomN.y) * smoothstep(0.18, 0.65, snowDrift + geomN.y * 0.35) * emMask;
            float isSnow = clamp(max(baseSnow, dynSnow), 0.0, 1.0);

            // Dynamic Wet PBR Puddles during Rainstorm (crisp high-contrast pools on damp dark asphalt/concrete)
            float puddle = 0.0;
            float wetness = 0.0;
            if (uRainAmount > 0.01 && emMask > 0.2) {
              float flatMask = smoothstep(0.82, 0.97, geomN.y);
              float pNoise = vnoise(vWorldPos.xz * 0.075) * 0.62 + vnoise(vWorldPos.xz * 0.21) * 0.38;
              float puddleEdge = isRoadOrConcrete > 0.3 ? 0.54 : 0.63;
              puddle = smoothstep(puddleEdge, puddleEdge + 0.075, pNoise) * flatMask * uRainAmount;
              wetness = uRainAmount * (0.45 + 0.55 * flatMask) * (1.0 - baseSnow);
            }

            // Fragment-level Triplanar Ridged-FBM height gradient -> Perturbed Micro-Normal
            vec3 n = geomN;
            float microAO = 1.0;
            float texMod = 0.0;
            if (detailFade > 0.01 && emMask > 0.1) {
              vec2 uvTop = vWorldPos.xz * (isSnow > 0.5 ? 0.18 : 0.26);
              vec2 uvSide = vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y * 1.65) * 0.24;
              vec2 sampleUv = mix(uvTop, uvSide, isSteep);
              float eps = 0.16;
              float hC = ridgedFbm(sampleUv);
              float hX = ridgedFbm(sampleUv + vec2(eps, 0.0));
              float hZ = ridgedFbm(sampleUv + vec2(0.0, eps));

              float bumpStrength = mix(0.28, 0.62, isSteep);
              bumpStrength = mix(bumpStrength, 0.20, isSnow);
              bumpStrength = mix(bumpStrength, 0.14, isRoadOrConcrete);
              bumpStrength *= (1.0 - puddle * 0.94) * detailFade * emMask;

              vec3 grad = vec3((hC - hX) / eps, 0.0, (hC - hZ) / eps) * bumpStrength;
              n = normalize(geomN + grad);

              // Micro-crevice Ambient Occlusion & geological strata
              microAO = mix(1.0, 0.78 + 0.30 * hC, detailFade * emMask * (0.45 + 0.55 * isSteep));
              float fineGrain = (vnoise(vWorldPos.xz * 1.35) - 0.5) * 0.095;
              float strata = sin(vWorldPos.y * 1.45 + hC * 3.8) * 0.065 * isSteep;
              texMod = (fineGrain + strata + (hC - 0.45) * 0.12) * detailFade * emMask;
            }

            // Raindrop concentric ripples on mirrored street/factory puddles!
            float rippleHighlight = 0.0;
            if (puddle > 0.08 && dist < 130.0) {
              float rf = puddle * (1.0 - smoothstep(35.0, 130.0, dist));
              vec2 rGrad = rainRippleGrad(vWorldPos.xz, uTime) + rainRippleGrad(vWorldPos.xz * 1.55 + vec2(5.3, -8.1), uTime * 1.23);
              rippleHighlight = clamp(length(rGrad) * 3.2, 0.0, 1.0) * rf;
              n = normalize(mix(n, normalize(vec3(rGrad.x * 1.4, 1.0, rGrad.y * 1.4)), rf));
            }

            float ndl = max(dot(n, sDir), 0.0);
            float shadow = computeShadow(ndl) * cloudLit;
            float hemi = n.y * 0.5 + 0.5;

            // Mix base albedo with dynamic weather snow & wet surface darkening
            vec3 surfCol = mix(vColor, vec3(0.90, 0.94, 0.98), dynSnow * 0.88);
            vec3 texCol = surfCol * (1.0 + texMod * (1.0 - dynSnow * 0.45));
            texCol *= mix(1.0, 0.46, wetness * (0.82 - puddle * 0.25)); // Damp concrete/asphalt turns rich dark charcoal

            // Physical Warm-Sun vs Cool-Blue Skylight Shadow Fill
            vec3 skyShadowTerm = coolSkyFill * (0.50 + 0.65 * hemi) * microAO;
            vec3 sunDirectTerm = uSunColor * ndl * (1.06 + isSnow * 0.18) * shadow;

            // Specular: wet sheen / puddle mirror / alpine snow crystal sparkle
            vec3 halfVec = normalize(sDir + viewDir);
            float ndh = max(dot(n, halfVec), 0.0);
            float specPow = mix(24.0, 120.0, max(isSnow, wetness));
            float specAmt = mix(0.11, 0.34, isSnow) + isRoadOrConcrete * 0.09 + wetness * 0.36 + puddle * 0.95;
            float surfSpec = pow(ndh, specPow) * specAmt * (0.30 + 0.70 * shadow);

            // Snow micro-crystal glint in direct sunlight
            float snowGlint = 0.0;
            if (isSnow > 0.3 && detailFade > 0.05 && shadow > 0.35) {
              float spk = hash21(floor(vWorldPos.xz * 7.5 + viewDir.xz * 1.8));
              snowGlint = smoothstep(0.985, 0.999, spk) * isSnow * detailFade * shadow * 1.35;
            }

            vec3 lit = texCol * (
              skyShadowTerm +
              sunDirectTerm +
              computeLocalNightGlow(vWorldPos, n)
            ) + uSunColor * (surfSpec + snowGlint) + vec3(0.76, 0.86, 0.96) * rippleHighlight * 0.35;

            // High-contrast mirror Fresnel reflection: subtle sheen on damp ground, crisp sky mirror inside puddles!
            if (wetness > 0.02) {
              float wetFresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.2);
              vec3 rDir = reflect(-viewDir, n);
              vec3 envRefl = mix(uSkyHorizon * 1.08, uSkyZenith * 1.25, pow(clamp(rDir.y, 0.0, 1.0), 0.55));
              envRefl += computeLocalNightGlow(vWorldPos, vec3(0.0, 1.0, 0.0)) * 2.1;
              float reflWeight = clamp(wetness * (0.04 + 0.22 * wetFresnel) + puddle * (0.38 + 0.52 * wetFresnel), 0.0, 0.88);
              lit = mix(lit, envRefl, reflWeight * emMask);
            }

            baseCol = mix(lit, vColor * (1.22 + vEmissive * 0.68), clamp(vEmissive, 0.0, 1.0));
          }

          // === VOLUMETRIC VALLEY HAZE + WEATHER FOG + ALTITUDE MIST + SUN IN-SCATTERING ===
          float weatherFogBoost = uRainAmount * 0.00085 + uSnowAmount * 0.00125;
          float distFog = 1.0 - exp(-dist * (0.00080 + weatherFogBoost));
          float valleyMist = exp(-max(0.0, vWorldPos.y - 2.0) * 0.075) * (1.0 - exp(-dist * 0.0020)) * (0.38 + uRainAmount * 0.20 + uSnowAmount * 0.26);
          float altBand = exp(-pow((vWorldPos.y - 145.0) / 76.0, 2.0));
          float highMist = altBand * (1.0 - exp(-dist * 0.0017)) * 0.44;

          float totalMist = clamp(distFog + valleyMist + highMist, 0.0, 0.94);
          float sunScatter = pow(max(dot(-viewDir, sDir), 0.0), 5.0) * (1.0 - uRainAmount * 0.65);
          vec3 hazeCol = mix(uFogColor, uMistColor, clamp(highMist * 1.6 + valleyMist, 0.0, 1.0));
          hazeCol = mix(hazeCol, uSunColor, sunScatter * 0.38);

          float emResist = vEmissive > 0.0 ? (1.0 - clamp(vEmissive, 0.0, 1.0) * 0.52) : 1.0;
          gl_FragColor = vec4(mix(baseCol, hazeCol, totalMist * emResist), uAlpha);
        }
      `);

      this.dynamicBuf = gl.createBuffer();
      this.ghostTrailBuf = gl.createBuffer();
      this.particleBuf = gl.createBuffer();
      this.prevCrashActive = false;
      this.chimneyTimer = 0;

      // 4. Soft Volumetric Smoke / Dust / Impact Spark Billboard Shader
      this.particleProg = createProgram(gl, `
        attribute vec3 aPos, aColor;
        attribute float aSize, aAlpha, aKind, aRot;
        uniform mat4 uMVP;
        uniform float uProjScale;
        varying vec3 vColor;
        varying float vAlpha, vKind, vRot;
        void main() {
          vec4 clip = uMVP * vec4(aPos, 1.0);
          gl_Position = clip;
          vColor = aColor;
          vAlpha = aAlpha;
          vKind = aKind;
          vRot = aRot;
          float w = max(0.35, clip.w);
          gl_PointSize = clamp((aSize * uProjScale) / w, 2.0, 150.0);
        }
      `, `
        precision mediump float;
        varying vec3 vColor;
        varying float vAlpha, vKind, vRot;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          if (vKind > 1.5) {
            float core = exp(-r2 * 6.5);
            gl_FragColor = vec4(vColor * (1.35 + core * 1.1), vAlpha * core);
          } else {
            float c = cos(vRot), s = sin(vRot);
            vec2 ruv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
            float wisp = 0.78
              + 0.14 * sin(ruv.x * 4.2 + 1.1) * cos(ruv.y * 4.5 - 0.6)
              + 0.08 * sin((ruv.x + ruv.y) * 6.8);
            float radial = pow(max(0.0, 1.0 - r2), 1.85);
            float alpha = clamp(radial * wisp, 0.0, 1.0) * vAlpha;
            if (alpha < 0.01) discard;
            vec3 litCol = vColor * (0.86 + 0.18 * (1.0 - gl_PointCoord.y));
            gl_FragColor = vec4(litCol, alpha);
          }
        }
      `);

      // 5. HDR Bright-Pass Bloom Extraction Shader
      this.bloomExtractProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen * 0.5 + 0.5; gl_Position = vec4(aScreen, 0.0, 1.0); }
      `, `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        void main() {
          vec3 c = texture2D(uTex, vUv).rgb;
          float luma = max(c.r, max(c.g, c.b));
          float knee = smoothstep(0.70, 1.05, luma);
          gl_FragColor = vec4(c * knee, 1.0);
        }
      `);

      // 6. Separable 9-Tap Gaussian Blur Shader
      this.bloomBlurProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen * 0.5 + 0.5; gl_Position = vec4(aScreen, 0.0, 1.0); }
      `, `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec2 uDir;
        void main() {
          vec3 s = texture2D(uTex, vUv).rgb * 0.227027;
          s += texture2D(uTex, vUv + uDir * 1.384615).rgb * 0.316216;
          s += texture2D(uTex, vUv - uDir * 1.384615).rgb * 0.316216;
          s += texture2D(uTex, vUv + uDir * 3.230769).rgb * 0.070270;
          s += texture2D(uTex, vUv - uDir * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(s, 1.0);
        }
      `);

      // 7. GPU Wind, Drone Prop-Wash & Weather-Reactive Alpine Foliage Shader
      this.foliageProg = createProgram(gl, `
        attribute vec3 aPos;
        attribute float aTip;
        attribute vec3 aColor;
        attribute float aPhase;
        uniform mat4 uMVP;
        uniform vec3 uDronePos;
        uniform float uTime, uThrottle, uWeatherWind;
        varying vec3 vWorldPos, vColor;
        varying float vTip;
        void main() {
          vec3 p = aPos;
          if (aTip > 0.05) {
            float windMul = 1.0 + uWeatherWind * 1.45;
            // Global alpine wind gusts (amplified in rainstorm & blizzard)
            float gust = (sin(uTime * 2.3 * windMul + p.x * 0.14 + p.z * 0.11 + aPhase) * 0.16
                       + sin(uTime * 4.7 * windMul + p.x * 0.32 - p.z * 0.25 + aPhase * 1.7) * 0.07) * windMul;
            p.x += gust * aTip;
            p.z += cos(uTime * 1.9 * windMul + p.z * 0.13 + aPhase) * 0.12 * windMul * aTip;

            // Drone low-altitude prop-wash radial blowdown!
            float dAlt = uDronePos.y - p.y;
            if (dAlt > -1.0 && dAlt < 13.0) {
              vec2 diff = p.xz - uDronePos.xz;
              float d = length(diff);
              if (d < 11.0) {
                float altF = 1.0 - smoothstep(0.0, 13.0, max(0.0, dAlt));
                float radF = exp(-d * 0.22);
                float push = (0.45 + uThrottle * 1.1) * altF * radF * aTip;
                vec2 dir = diff / max(d, 0.05);
                float flutter = 1.0 + 0.35 * sin(uTime * 28.0 + aPhase * 6.0);
                p.xz += dir * push * 0.85 * flutter;
                p.y -= min(push * 0.38, 0.45);
              }
            }
          }
          vWorldPos = p;
          vColor = aColor;
          vTip = aTip;
          gl_Position = uMVP * vec4(p, 1.0);
        }
      `, `
        ${PREC}
        varying vec3 vWorldPos, vColor;
        varying float vTip;
        uniform vec3 uCamPos, uSunDir, uSunColor, uAmbient, uFogColor, uMistColor, uSkyZenith;
        uniform float uSnowAmount, uRainAmount;
        void main() {
          vec3 sDir = normalize(uSunDir);
          vec3 viewVec = uCamPos - vWorldPos;
          float dist = length(viewVec);
          if (dist > 260.0) discard;
          vec3 viewDir = viewVec / max(dist, 0.001);

          // Cool-blue skylight shadow base -> sunlit warm translucent tip (with frost/wetness weather response)
          vec3 coolSky = mix(uAmbient, uSkyZenith * 1.4 + vec3(0.10, 0.16, 0.26), 0.40);
          float backLit = pow(max(dot(-viewDir, sDir), 0.0), 3.0) * 0.48 * vTip;
          float ao = 0.46 + 0.54 * vTip;
          vec3 baseAlbedo = mix(vColor, vec3(0.86, 0.91, 0.96), uSnowAmount * (0.35 + 0.55 * vTip));
          baseAlbedo *= mix(1.0, 0.72, uRainAmount);
          vec3 col = baseAlbedo * ao * (coolSky * 0.78 + uSunColor * (0.68 + backLit));

          float distFog = 1.0 - exp(-dist * (0.00080 + uRainAmount * 0.00085 + uSnowAmount * 0.00125));
          float fadeOut = smoothstep(180.0, 255.0, dist);
          vec3 finalCol = mix(col, uFogColor, clamp(distFog + fadeOut * 0.65, 0.0, 0.94));
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `);

      // 8. GPU Infinite-Wrap 3D Volumetric Rain Streaks & Alpine Blizzard Snowflakes Shader
      this.weatherProg = createProgram(gl, `
        attribute vec3 aSeed;
        attribute vec2 aCorner;
        attribute float aRand;
        uniform mat4 uMVP;
        uniform vec3 uCamPos, uCamRight, uCamUp, uDroneVel;
        uniform float uTime, uRainAmount, uSnowAmount;
        varying vec2 vCorner;
        varying float vAlpha, vIsSnow;
        void main() {
          float isSnow = (uSnowAmount > uRainAmount) ? 1.0 : 0.0;
          vIsSnow = isSnow;
          vCorner = aCorner;
          float intensity = max(uRainAmount, uSnowAmount);

          vec3 box = vec3(44.0, 26.0, 44.0);
          vec3 driftVel = isSnow > 0.5
            ? vec3(2.4 + sin(uTime * 0.9 + aRand * 19.0) * 1.5, -(2.4 + aRand * 1.8), 1.6 + cos(uTime * 0.8 + aRand * 13.0) * 1.3)
            : vec3(2.6, -(23.0 + aRand * 9.0), 1.4);

          vec3 wrapped = fract(aSeed + (driftVel * uTime - uCamPos) / box) - 0.5;
          vec3 center = uCamPos + wrapped * box;
          if (isSnow > 0.5) {
            center.x += sin(uTime * 2.2 + aRand * 25.0) * 0.55;
            center.z += cos(uTime * 1.8 + aRand * 17.0) * 0.55;
          }

          vec3 toCam = uCamPos - center;
          float dist = length(toCam);
          vec3 viewDir = toCam / max(dist, 0.001);

          vec3 worldPos;
          if (isSnow > 0.5) {
            float sz = (0.065 + aRand * 0.085) * (0.65 + 0.35 * intensity);
            worldPos = center + (uCamRight * aCorner.x + uCamUp * aCorner.y) * sz;
          } else {
            // High-speed aerodynamic rain streak aligned with relative velocity (rain - droneVel)
            vec3 relVel = driftVel - uDroneVel * 0.48;
            float relSpd = length(relVel);
            vec3 streakAxis = relVel / max(relSpd, 0.1);
            vec3 sideAxis = cross(streakAxis, viewDir);
            float sideLen = length(sideAxis);
            sideAxis = sideLen > 0.01 ? (sideAxis / sideLen) : uCamRight;
            float halfLen = clamp(relSpd * 0.022, 0.38, 1.35) * (0.75 + 0.45 * aRand);
            float halfW = 0.014 + aRand * 0.008;
            worldPos = center + sideAxis * (aCorner.x * halfW) + streakAxis * (aCorner.y * halfLen);
          }

          float nearFade = smoothstep(1.3, 4.2, dist);
          float farFade = 1.0 - smoothstep(15.0, 23.0, dist);
          vAlpha = nearFade * farFade * intensity * (isSnow > 0.5 ? (0.62 + 0.32 * aRand) : (0.36 + 0.28 * aRand));
          gl_Position = uMVP * vec4(worldPos, 1.0);
        }
      `, `
        precision mediump float;
        varying vec2 vCorner;
        varying float vAlpha, vIsSnow;
        uniform vec3 uSunColor, uMistColor;
        void main() {
          if (vAlpha < 0.01) discard;
          if (vIsSnow > 0.5) {
            float r2 = dot(vCorner, vCorner);
            if (r2 > 1.0) discard;
            float soft = pow(1.0 - r2, 1.7);
            vec3 col = mix(uMistColor, vec3(0.96, 0.98, 1.0), 0.72);
            gl_FragColor = vec4(col, soft * vAlpha);
          } else {
            float coreX = max(0.0, 1.0 - abs(vCorner.x));
            float taperY = max(0.0, 1.0 - vCorner.y * vCorner.y);
            float a = coreX * taperY * vAlpha;
            if (a < 0.01) discard;
            vec3 col = mix(uMistColor, vec3(0.84, 0.91, 0.98), 0.58) + uSunColor * 0.12;
            gl_FragColor = vec4(col, a);
          }
        }
      `);

      // 9. Depth-Texture Slope-Invariant Symmetric Curvature SSAO Pass (Half-Res)
      this.ssaoProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen * 0.5 + 0.5; gl_Position = vec4(aScreen, 0.0, 1.0); }
      `, `
        ${PREC}
        varying vec2 vUv;
        uniform sampler2D uDepthTex;
        uniform vec2 uTexel;
        uniform float uNear, uFar;

        float linDepth(vec2 uv) {
          float d = texture2D(uDepthTex, clamp(uv, 0.002, 0.998)).r;
          float ndc = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / max(uFar + uNear - ndc * (uFar - uNear), 0.0001);
        }

        void main() {
          float rawD = texture2D(uDepthTex, vUv).r;
          if (rawD >= 0.9992) {
            gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
            return;
          }
          float z0 = linDepth(vUv);
          if (z0 > 260.0) {
            gl_FragColor = vec4(1.0, clamp(z0 / 300.0, 0.0, 1.0), 0.0, 1.0);
            return;
          }

          // Pixel-space Interleaved Gradient Noise rotation eliminates repeating banding
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float baseAng = ign * 6.2831853;
          float pxRad = clamp(24.0 / max(z0 * 0.14, 1.0), 3.0, 18.0);
          float worldRad = clamp(z0 * 0.11, 0.85, 8.5);
          float occ = 0.0;

          // 6 symmetric pairs (12 taps): flat/tilted slopes cancel first-order depth gradient -> zero slope artifacts!
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            float ang = baseAng + fi * 0.5235988; // PI / 6
            float ring = (0.42 + 0.58 * fract((fi + 0.5) * 0.6180339)) * pxRad;
            vec2 off = vec2(cos(ang), sin(ang)) * ring * uTexel;

            float zA = linDepth(vUv + off);
            float zB = linDepth(vUv - off);
            float dA = z0 - zA;
            float dB = z0 - zB;

            float wA = smoothstep(worldRad * 2.2, worldRad * 0.35, abs(dA));
            float wB = smoothstep(worldRad * 2.2, worldRad * 0.35, abs(dB));

            // Symmetric concavity: strictly > 0 inside corners, wall bases, container creases & cliff cracks
            float symConcave = (dA + dB) * 0.5;
            float bothValid = wA * wB;
            float oneSide = max(0.0, dA) * wA * (1.0 - wB) * 0.42 + max(0.0, dB) * wB * (1.0 - wA) * 0.42;
            float contrib = max(0.0, symConcave - 0.035 * z0 * 0.04) * bothValid + oneSide;
            occ += clamp(contrib / max(worldRad * 0.48, 0.25), 0.0, 1.0);
          }

          float distFade = 1.0 - smoothstep(140.0, 255.0, z0);
          float ao = clamp(1.0 - (occ / 6.0) * 0.82 * distFade, 0.32, 1.0);
          gl_FragColor = vec4(ao, clamp(z0 / 300.0, 0.0, 1.0), 0.0, 1.0);
        }
      `);

      // 10. Depth-Aware Cross-Bilateral SSAO Blur Pass
      this.ssaoBlurProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen * 0.5 + 0.5; gl_Position = vec4(aScreen, 0.0, 1.0); }
      `, `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uSsaoTex;
        uniform vec2 uTexel;
        void main() {
          vec2 center = texture2D(uSsaoTex, vUv).rg;
          float sum = center.r * 2.0;
          float wSum = 2.0;
          float zTol = 0.012 + center.g * 0.08;
          for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
              if (dx == 0 && dy == 0) continue;
              vec2 s = texture2D(uSsaoTex, clamp(vUv + vec2(float(dx), float(dy)) * uTexel * 1.45, 0.002, 0.998)).rg;
              float w = exp(-abs(s.g - center.g) / max(zTol, 0.001));
              sum += s.r * w;
              wSum += w;
            }
          }
          gl_FragColor = vec4(vec3(sum / wSum), 1.0);
        }
      `);

      // 11. Final Cinema Post-FX Shader: Depth SSAO + Depth-Occluded Fly-Through 3D Volumetric Clouds + GoPro Lens Raindrop Refraction + 180° Shutter Motion Blur + Volumetric God Rays + Auto-Exposure + ACES Tone Mapping
      this.postProg = createProgram(gl, `
        attribute vec2 aScreen;
        varying vec2 vUv;
        void main() { vUv = aScreen * 0.5 + 0.5; gl_Position = vec4(aScreen, 0.0, 1.0); }
      `, `
        ${PREC}
        varying vec2 vUv;
        uniform sampler2D uSceneTex, uBloomTex, uSsaoTex, uDepthTex;
        uniform vec2 uSunScreenPos, uMotionVec;
        uniform vec3 uSunColor, uSunDir, uCloudBright, uCloudShade, uMistColor;
        uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
        uniform float uTanHalfFov, uAspect, uNear, uFar;
        uniform float uFpvLens, uSpeedNorm, uGForce, uVtxGlitch, uBloomStrength, uTime;
        uniform float uGodRayStrength, uExposure, uCinemaMode;
        uniform float uSsaoEnabled, uDepthEnabled, uCloudCoverage, uLensWetness, uInCloudFactor;

        float hash11(float p) {
          return fract(sin(p * 127.1) * 43758.5453);
        }
        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float vnoise3(vec3 p) {
          float zi = floor(p.z);
          float zf = fract(p.z);
          zf = zf * zf * (3.0 - 2.0 * zf);
          vec2 off = vec2(37.0, 17.0);
          return mix(vnoise(p.xy + zi * off), vnoise(p.xy + (zi + 1.0) * off), zf);
        }
        float fgCloudDensity3D(vec3 wp) {
          const float C_BASE = 165.0;
          const float C_TOP = 295.0;
          float hFrac = (wp.y - C_BASE) / (C_TOP - C_BASE);
          if (hFrac <= 0.0 || hFrac >= 1.0) return 0.0;
          float heightProfile = smoothstep(0.0, 0.16, hFrac) * smoothstep(1.0, 0.42, hFrac);
          vec3 q = vec3(wp.xz * 0.0024 + vec2(uTime * 0.0055, uTime * 0.0022), wp.y * 0.011);
          float baseShape = vnoise3(q) * 0.65 + vnoise3(q * 2.15 + vec3(7.3, -4.1, 2.7)) * 0.35;
          float thresh = mix(0.64, 0.34, clamp(uCloudCoverage, 0.0, 1.0));
          return smoothstep(thresh, thresh + 0.28, baseShape * (0.72 + 0.42 * heightProfile)) * heightProfile;
        }

        // Crystal-Clear GoPro Glass Lens Raindrops: Pure Optical Refraction + Rim Darkening + Pinpoint Specular
        vec4 lensDropLayer(vec2 uv, float t, vec2 grid, float speed, float trailOn) {
          vec2 st = uv * grid;
          float colId = floor(st.x);
          float colShift = hash11(colId * 31.7 + 5.1);
          st.y += t * speed * (0.55 + 0.65 * colShift) + colShift * 6.0;
          vec2 id = floor(st);
          vec2 f = fract(st) - 0.5;
          float rnd = hash21(id + vec2(colId * 1.3, 9.7));
          if (rnd < 0.70) return vec4(0.0);

          // Intermittent gravity stick-slip slide
          float slideY = trailOn > 0.5 ? sin(t * 1.8 + rnd * 18.0) * 0.14 : 0.0;
          float dropX = (hash21(id + 17.3) - 0.5) * 0.52 + sin(st.y * 1.4 + rnd * 12.0) * 0.04 * trailOn;
          vec2 dPos = vec2(f.x - dropX, f.y - slideY);
          dPos.y *= (trailOn > 0.5 ? 0.76 : 1.0);
          float r = length(dPos);
          float rad = 0.10 + 0.11 * fract(rnd * 13.7);
          float mask = smoothstep(rad, rad * 0.72, r);
          if (mask < 0.001) return vec4(0.0);

          // True convex water lens refraction vector (bends rays cleanly without milky white fill!)
          vec2 nrm = (dPos / max(rad, 0.01)) * mask;
          float rimDark = smoothstep(rad * 0.62, rad * 0.94, r) * mask;
          // Crisp tiny upper-left glass highlight arc
          float hlDist = length(dPos - vec2(-rad * 0.34, rad * 0.34));
          float pinpointSpec = pow(smoothstep(rad * 0.42, rad * 0.05, hlDist), 2.5) * mask;
          return vec4(nrm.x, nrm.y, pinpointSpec, rimDark);
        }

        vec3 acesFilm(vec3 x) {
          const float a = 2.51;
          const float b = 0.03;
          const float c = 2.43;
          const float d = 0.59;
          const float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);

          // Authentic FPV Action-Cam Wide-Angle Barrel Distortion (pre-scaled so corners stay full-frame)
          if (uFpvLens > 0.5) {
            float k = 0.046 + uSpeedNorm * 0.016;
            p *= (1.0 + k * r2) / (1.0 + k * 1.85);
          }
          vec2 uv = p * 0.5 + 0.5;

          // DJI O3 Digital HD VTX Macroblock Slice Interference inside Deep Concrete Tunnel / Crash
          if (uVtxGlitch > 0.01 && uCinemaMode < 0.5) {
            float band = floor(uv.y * 38.0);
            float n = hash11(band + floor(uTime * 28.0) * 13.7);
            if (n > 1.0 - uVtxGlitch * 0.42) {
              uv.x = clamp(uv.x + (hash11(band * 3.1 + uTime) - 0.5) * 0.065 * uVtxGlitch, 0.002, 0.998);
            }
          }

          // Crystal-Clear GoPro Glass Raindrop Refraction (keeps center clear, realistic beads on outer lens)
          float dropSpec = 0.0;
          float dropRim = 0.0;
          vec2 sampleUv = uv;
          if (uLensWetness > 0.02) {
            vec2 aspectUv = vec2(uv.x * uAspect, uv.y);
            vec4 d1 = lensDropLayer(aspectUv, uTime, vec2(7.0, 4.2), 0.28, 1.0);
            vec4 d2 = lensDropLayer(aspectUv + vec2(3.7, 1.9), uTime, vec2(15.0, 10.5), 0.05, 0.0);
            float outerMask = smoothstep(0.06, 0.72, r2);
            vec2 refractOff = (d1.xy * 0.042 + d2.xy * 0.022) * uLensWetness * (0.28 + 0.72 * outerMask);
            sampleUv = clamp(uv - refractOff, 0.002, 0.998);
            dropSpec = (d1.z * 0.65 + d2.z * 0.45) * uLensWetness * (0.25 + 0.75 * outerMask);
            dropRim = clamp(d1.w * 0.28 + d2.w * 0.18, 0.0, 0.35) * uLensWetness * (0.25 + 0.75 * outerMask);
          }

          // Edge Radial Chromatic Aberration
          float caStrength = (uFpvLens > 0.5 ? 0.0020 : 0.0007) * r2 + uSpeedNorm * 0.0016 * r2 + uVtxGlitch * 0.0040;
          vec2 caOffset = p * caStrength;
          float colR = texture2D(uSceneTex, clamp(sampleUv + caOffset, 0.001, 0.999)).r;
          float colG = texture2D(uSceneTex, clamp(sampleUv, 0.001, 0.999)).g;
          float colB = texture2D(uSceneTex, clamp(sampleUv - caOffset, 0.001, 0.999)).b;
          vec3 hdr = vec3(colR, colG, colB);

          // 180-Degree Shutter Camera Velocity + Radial Speed Motion Blur (stronger at edges, crisp at center)
          float blurAmp = length(uMotionVec) + uSpeedNorm * 0.014 * (0.35 + 0.65 * r2);
          if (blurAmp > 0.0018) {
            vec2 radDir = p * (uSpeedNorm * 0.013 * r2);
            vec2 totalBlur = uMotionVec * (0.45 + 0.55 * r2) + radDir;
            float maxLen = uCinemaMode > 0.5 ? 0.028 : 0.020;
            float bLen = length(totalBlur);
            if (bLen > maxLen) totalBlur *= (maxLen / bLen);
            vec3 accum = hdr * 0.34;
            accum += texture2D(uSceneTex, clamp(sampleUv - totalBlur * 0.33, 0.001, 0.999)).rgb * 0.22;
            accum += texture2D(uSceneTex, clamp(sampleUv + totalBlur * 0.33, 0.001, 0.999)).rgb * 0.16;
            accum += texture2D(uSceneTex, clamp(sampleUv - totalBlur * 0.66, 0.001, 0.999)).rgb * 0.14;
            accum += texture2D(uSceneTex, clamp(sampleUv + totalBlur * 0.66, 0.001, 0.999)).rgb * 0.08;
            accum += texture2D(uSceneTex, clamp(sampleUv - totalBlur * 1.00, 0.001, 0.999)).rgb * 0.06;
            hdr = accum;
          }

          // Real Depth-Texture Bilateral SSAO (darkens corners, wall bases, cliffs & container contacts without washing out highlights)
          if (uSsaoEnabled > 0.5) {
            float ao = texture2D(uSsaoTex, clamp(sampleUv, 0.002, 0.998)).r;
            float lumPre = dot(hdr, vec3(0.299, 0.587, 0.114));
            float hiProtect = 1.0 - smoothstep(0.85, 1.35, lumPre);
            hdr *= mix(1.0, ao, 0.72 * hiProtect);
          }

          // === DEPTH-OCCLUDED FLY-THROUGH 3D VOLUMETRIC CLOUDS (Alpine Peaks Pierce Cloud Sea!) ===
          if (uDepthEnabled > 0.5) {
            float rawD = texture2D(uDepthTex, clamp(sampleUv, 0.002, 0.998)).r;
            if (rawD < 0.9992) {
              float ndcZ = rawD * 2.0 - 1.0;
              float viewZ = (2.0 * uNear * uFar) / max(uFar + uNear - ndcZ * (uFar - uNear), 0.0001);
              vec2 rayP = sampleUv * 2.0 - 1.0;
              vec3 rawRay = uCamFwd + rayP.x * uAspect * uTanHalfFov * uCamRight + rayP.y * uTanHalfFov * uCamUp;
              float rayFactor = length(rawRay);
              vec3 rayDir = rawRay / rayFactor;
              float sceneDist = viewZ * rayFactor;

              const float C_BASE = 165.0;
              const float C_TOP = 295.0;
              float tStart = -1.0;
              float tEnd = -1.0;
              if (abs(rayDir.y) < 0.004) {
                if (uCamPos.y >= C_BASE && uCamPos.y <= C_TOP) { tStart = 2.0; tEnd = sceneDist; }
              } else {
                float t0 = (C_BASE - uCamPos.y) / rayDir.y;
                float t1 = (C_TOP - uCamPos.y) / rayDir.y;
                tStart = max(0.0, min(t0, t1));
                tEnd = min(sceneDist, max(t0, t1));
              }

              if (tEnd > tStart + 2.0 && tStart < sceneDist) {
                tEnd = min(tEnd, tStart + 560.0);
                float stepLen = (tEnd - tStart) / 8.0;
                float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                float t = tStart + stepLen * dither;
                vec3 sDir = normalize(uSunDir);
                float sunDot = max(dot(rayDir, sDir), 0.0);
                float silver = pow(sunDot, 6.0) * 0.55;

                float trans = 1.0;
                vec3 cloudAcc = vec3(0.0);
                for (int i = 0; i < 8; i++) {
                  if (trans < 0.04) break;
                  vec3 wp = uCamPos + rayDir * t;
                  float dens = fgCloudDensity3D(wp);
                  if (dens > 0.006) {
                    float dSun = fgCloudDensity3D(wp + sDir * 28.0);
                    float lit = exp(-dSun * 1.65);
                    float hNorm = clamp((wp.y - C_BASE) / (C_TOP - C_BASE), 0.0, 1.0);
                    vec3 cCol = mix(uCloudShade, uCloudBright, clamp(lit * (0.55 + 0.45 * hNorm) + 0.12, 0.0, 1.0)) + uSunColor * (silver * lit);
                    float softDepth = smoothstep(0.0, 18.0, sceneDist - t);
                    float stepExt = exp(-dens * stepLen * 0.032 * softDepth);
                    cloudAcc += trans * (1.0 - stepExt) * cCol;
                    trans *= stepExt;
                  }
                  t += stepLen;
                }
                hdr = hdr * trans + cloudAcc;
              }
            }
          }

          // Subtle inside-cloud luminous white vapor wrap when flying directly through dense cloud core
          if (uInCloudFactor > 0.02) {
            vec3 vaporCol = mix(uCloudShade, uCloudBright, 0.72) * 0.92;
            hdr = mix(hdr, vaporCol, clamp(uInCloudFactor * 0.42, 0.0, 0.48));
          }

          if (uBloomStrength > 0.01) {
            hdr += texture2D(uBloomTex, clamp(sampleUv, 0.001, 0.999)).rgb * uBloomStrength;
          }

          // Screen-Space Volumetric Crepuscular God Rays (Radial Light Shafts from Sun)
          if (uGodRayStrength > 0.01) {
            vec2 delta = (sampleUv - uSunScreenPos) * (0.72 / 10.0);
            vec2 rayUv = sampleUv;
            float decay = 1.0;
            vec3 rays = vec3(0.0);
            for (int i = 0; i < 10; i++) {
              rayUv -= delta;
              vec3 sCol = texture2D(uBloomTex, clamp(rayUv, 0.001, 0.999)).rgb;
              float lum = dot(sCol, vec3(0.299, 0.587, 0.114));
              rays += sCol * smoothstep(0.24, 0.72, lum) * decay;
              decay *= 0.80;
            }
            hdr += rays * uSunColor * (uGodRayStrength * 0.088);
          }

          // Subtle optical rim + pinpoint glass specular on transparent GoPro raindrops
          if (dropRim > 0.002) {
            hdr *= (1.0 - dropRim);
          }
          if (dropSpec > 0.005) {
            hdr += vec3(0.94, 0.97, 1.0) * dropSpec * 0.62;
          }

          // Subtle Digital Block Luma Tint on Heavy Signal Occlusion
          if (uVtxGlitch > 0.08 && uCinemaMode < 0.5) {
            float scan = sin(uv.y * 420.0 + uTime * 35.0) * 0.04 * uVtxGlitch;
            hdr += vec3(scan * 0.5, scan, scan * 1.2);
          }

          // Real-Time Tunnel-Exit & Cloud-Breakout Auto-Exposure Adaptation
          hdr *= uExposure;

          // Aerodynamic High-G & Optical Lens Vignette
          float gVig = clamp((uGForce - 2.4) * 0.055, 0.0, 0.22);
          float vig = 1.0 - r2 * ((uCinemaMode > 0.5 ? 0.14 : 0.11) + gVig + uSpeedNorm * 0.05);
          hdr *= clamp(vig, 0.42, 1.0);

          // ACES Filmic Contrast Polish (richer cinematic contrast in GoPro Cinema Mode)
          float filmMix = uCinemaMode > 0.5 ? 0.58 : 0.44;
          vec3 mapped = mix(hdr, acesFilm(hdr * 1.20), filmMix);

          // Subtle GoPro natural micro-saturation lift
          float luma = dot(mapped, vec3(0.299, 0.587, 0.114));
          mapped = mix(vec3(luma), mapped, uCinemaMode > 0.5 ? 1.12 : 1.06);

          gl_FragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
        }
      `);

      this.initShadowTarget();
      this.initDroneBuffers();
      this.initVehicleBuffers();
    }

    initVehicleBuffers() {
      const gl = this.gl;
      const AM = global.FPVAssetsModel;
      if (!AM || !this.actors) return;
      if (this.actors.vehicles) {
        this.vehicleMeshes = new Map();
        for (const v of this.actors.vehicles) {
          const arr = AM.buildVehicleMesh(v);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
          this.vehicleMeshes.set(v.id, { buf, count: arr.length / 10 });
        }
      }
      if (this.actors.aircraft && AM.buildBiplaneBodyMesh && AM.buildBiplanePropMesh) {
        this.biplaneMeshes = new Map();
        for (const ac of this.actors.aircraft) {
          const arr = AM.buildBiplaneBodyMesh(ac);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
          this.biplaneMeshes.set(ac.id, { buf, count: arr.length / 10 });
        }
        const propArr = AM.buildBiplanePropMesh();
        const propBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, propBuf);
        gl.bufferData(gl.ARRAY_BUFFER, propArr, gl.STATIC_DRAW);
        this.biplanePropMesh = { buf: propBuf, count: propArr.length / 10 };
      }
    }

    initDroneBuffers() {
      const gl = this.gl;
      const DM = global.FPVDroneModel;
      if (!DM) return;
      const makeVbo = (arr) => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        return { buf, count: arr.length / 10 };
      };
      this.droneMesh = {
        body: makeVbo(DM.buildDroneBodyMesh()),
        propFrontCW:  makeVbo(DM.buildPropellerMesh([0.10, 0.84, 0.96], true)),
        propFrontCCW: makeVbo(DM.buildPropellerMesh([0.10, 0.84, 0.96], false)),
        propRearCW:   makeVbo(DM.buildPropellerMesh([0.46, 0.52, 0.60], true)),
        propRearCCW:  makeVbo(DM.buildPropellerMesh([0.46, 0.52, 0.60], false)),
        discFront:    makeVbo(DM.buildPropBlurDiscMesh([0.16, 0.88, 0.98])),
        discRear:     makeVbo(DM.buildPropBlurDiscMesh([0.62, 0.68, 0.76])),
        ledBuf:       gl.createBuffer()
      };
    }

    buildStaticWorld() {
      const gl = this.gl;
      const mb = new MeshBuilder();
      const getH = global.FPVWorld.getTerrainHeight;
      const getN = global.FPVWorld.getTerrainNormal;
      const waterY = global.FPVWorld.WATER_LEVEL;
      const getRoadX = global.FPVWorld.getRoadCenterX;

      // 1. High-Detail Smooth-Normal Terrain Mesh (156 x 156 over 2240m)
      const gridN = 156;
      const minCoord = -1120;
      const span = 2240;
      const step = span / gridN;
      const stride = gridN + 1;

      const vertsY = new Float32Array(stride * stride);
      const vertsN = new Array(stride * stride);
      const vertsC = new Array(stride * stride);

      for (let gz = 0; gz <= gridN; gz++) {
        const z = minCoord + gz * step;
        for (let gx = 0; gx <= gridN; gx++) {
          const x = minCoord + gx * step;
          const idx = gz * stride + gx;
          const y = getH(x, z);
          const n = getN(x, z, 4.0);
          vertsY[idx] = y;
          vertsN[idx] = n;

          const slope = 1 - n[1];
          let col;
          if (y < waterY + 0.9) {
            col = [0.39, 0.37, 0.31];
          } else if (y < waterY + 2.6) {
            col = [0.50, 0.46, 0.37];
          } else if (y > 122 && slope < 0.36) {
            col = [0.88, 0.92, 0.96];
          } else if (slope > 0.20 || y > 78) {
            col = [0.40, 0.41, 0.44];
          } else if (y > 30) {
            col = [0.21, 0.36, 0.22];
          } else {
            col = [0.23, 0.41, 0.25];
          }
          const strata = 0.95 + 0.05 * Math.sin(y * 0.42);
          vertsC[idx] = [col[0] * strata, col[1] * strata, col[2] * strata];
        }
      }

      for (let gz = 0; gz < gridN; gz++) {
        const z0 = minCoord + gz * step, z1 = z0 + step;
        for (let gx = 0; gx < gridN; gx++) {
          const x0 = minCoord + gx * step, x1 = x0 + step;
          const i00 = gz * stride + gx, i10 = i00 + 1, i01 = (gz + 1) * stride + gx, i11 = i01 + 1;
          mb.pushSmoothTri([x0, vertsY[i00], z0], vertsN[i00], vertsC[i00], [x0, vertsY[i01], z1], vertsN[i01], vertsC[i01], [x1, vertsY[i11], z1], vertsN[i11], vertsC[i11], 0);
          mb.pushSmoothTri([x0, vertsY[i00], z0], vertsN[i00], vertsC[i00], [x1, vertsY[i11], z1], vertsN[i11], vertsC[i11], [x1, vertsY[i10], z0], vertsN[i10], vertsC[i10], 0);
        }
      }

      // 2. Subdivided Water Mesh with Tight Dry-Land Culling & Shoreline Foam Encoding (zero buried water under dry land!)
      const waterCol = [0.05, 0.24, 0.35];
      const waterSurfY = waterY - 0.04;
      const upN = [0, 1, 0];
      const waterEm = (x, z) => {
        const d = waterY - getH(x, z);
        const shallow = Math.max(0, Math.min(1, 1 - d / 2.2));
        return -1.0 - shallow;
      };
      const pushWaterGrid = (minX, maxX, minZ, maxZ, nx, nz) => {
        const dx = (maxX - minX) / nx, dz = (maxZ - minZ) / nz;
        for (let iz = 0; iz < nz; iz++) {
          const z0 = minZ + iz * dz, z1 = z0 + dz;
          for (let ix = 0; ix < nx; ix++) {
            const x0 = minX + ix * dx, x1 = x0 + dx;
            // Only emit water quads where at least one corner is actually at or below shoreline!
            if (
              getH(x0, z0) > waterY + 0.32 && getH(x1, z0) > waterY + 0.32 &&
              getH(x0, z1) > waterY + 0.32 && getH(x1, z1) > waterY + 0.32
            ) continue;
            const e00 = waterEm(x0, z0), e10 = waterEm(x1, z0), e01 = waterEm(x0, z1), e11 = waterEm(x1, z1);
            const eAvg1 = (e00 + e01 + e11) / 3;
            const eAvg2 = (e00 + e11 + e10) / 3;
            mb.pushSmoothTri([x0, waterSurfY, z0], upN, waterCol, [x0, waterSurfY, z1], upN, waterCol, [x1, waterSurfY, z1], upN, waterCol, eAvg1);
            mb.pushSmoothTri([x0, waterSurfY, z0], upN, waterCol, [x1, waterSurfY, z1], upN, waterCol, [x1, waterSurfY, z0], upN, waterCol, eAvg2);
          }
        }
      };
      for (let wz = -1040; wz < 1040; wz += 130) {
        const rcx = global.FPVWorld.getRiverCenterX(wz + 65);
        pushWaterGrid(rcx - 150, rcx + 165, wz, wz + 130, 24, 10);
      }
      pushWaterGrid(40, 500, -110, 360, 32, 32);

      // 3. Valley Asphalt Highway Strip + Reflective Shoulder + Dashed Yellow Centerline (cleanly elevated above terrain)
      const roadHalfW = 6.2;
      const rStep = 14;
      for (let rz = -640; rz < 640; rz += rStep) {
        const rx0 = getRoadX(rz), rx1 = getRoadX(rz + rStep);
        const y0 = getH(rx0, rz) + 0.24, y1 = getH(rx1, rz + rStep) + 0.24;
        mb.pushQuad(
          [rx0 - roadHalfW, y0, rz],
          [rx1 - roadHalfW, y1, rz + rStep],
          [rx1 + roadHalfW, y1, rz + rStep],
          [rx0 + roadHalfW, y0, rz],
          [0.15, 0.16, 0.18], 0
        );
        // White reflective road edge lines
        for (const side of [-5.7, 5.7]) {
          mb.pushQuad(
            [rx0 + side - 0.12, y0 + 0.05, rz],
            [rx1 + side - 0.12, y1 + 0.05, rz + rStep],
            [rx1 + side + 0.12, y1 + 0.05, rz + rStep],
            [rx0 + side + 0.12, y0 + 0.05, rz],
            [0.86, 0.89, 0.92], 0.18
          );
        }
        if (Math.floor((rz + 700) / rStep) % 2 === 0) {
          mb.pushQuad(
            [rx0 - 0.18, y0 + 0.06, rz + 2],
            [rx1 - 0.18, y1 + 0.06, rz + rStep - 2],
            [rx1 + 0.18, y1 + 0.06, rz + rStep - 2],
            [rx0 + 0.18, y0 + 0.06, rz + 2],
            [0.95, 0.76, 0.16], 0.35
          );
        }
      }

      // 4. Launch Helipad ("H") with Illuminated Perimeter Beacons
      const padY = getH(0, 0) + 0.20;
      mb.pushQuad([-7, padY, -7], [-7, padY, 7], [7, padY, 7], [7, padY, -7], [0.14, 0.17, 0.21], 0);
      mb.pushQuad([-7, padY + 0.05, -7], [-7, padY + 0.05, -6.3], [7, padY + 0.05, -6.3], [7, padY + 0.05, -7], [0.96, 0.62, 0.05], 0.92);
      mb.pushQuad([-7, padY + 0.05, 6.3], [-7, padY + 0.05, 7], [7, padY + 0.05, 7], [7, padY + 0.05, 6.3], [0.96, 0.62, 0.05], 0.92);
      const whiteEm = [0.92, 0.95, 0.98];
      mb.pushQuad([-2.2, padY + 0.08, -2.6], [-2.2, padY + 0.08, 2.6], [-1.4, padY + 0.08, 2.6], [-1.4, padY + 0.08, -2.6], whiteEm, 0.72);
      mb.pushQuad([1.4, padY + 0.08, -2.6], [1.4, padY + 0.08, 2.6], [2.2, padY + 0.08, 2.6], [2.2, padY + 0.08, -2.6], whiteEm, 0.72);
      mb.pushQuad([-1.4, padY + 0.08, -0.4], [-1.4, padY + 0.08, 0.4], [1.4, padY + 0.08, 0.4], [1.4, padY + 0.08, -0.4], whiteEm, 0.72);

      // 5. Realistic Industrial Abandoned Factory
      if (global.FPVAssetsModel && this.factory) {
        global.FPVAssetsModel.pushRealisticFactory(mb.data, this.factory, getH);
      }

      // 6. Realistic Canyon Bridges, Relay Towers, Wind Turbines, Mountain Tunnel, Valley Town & Trees
      if (global.FPVAssetsModel && this.landmarks) {
        global.FPVAssetsModel.pushRealisticLandmarks(mb.data, this.landmarks);
      }

      const arr = mb.toFloat32();
      this.staticVertCount = arr.length / 10;
      this.staticBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    }

    buildFoliageBuffer() {
      const gl = this.gl;
      if (!gl || !this.foliageProg) return;
      const getH = global.FPVWorld.getTerrainHeight;
      const getN = global.FPVWorld.getTerrainNormal;
      const getRoadX = global.FPVWorld.getRoadCenterX;
      const waterY = global.FPVWorld.WATER_LEVEL;

      // Deterministic pseudo-random generator for dense alpine valley grass & wildflower tufts
      let seed = 133742;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const data = [];
      const pushBlade = (cx, cy, cz, yaw, halfW, h, colBase, colTip, phase) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const lx = -c * halfW, lz = -s * halfW;
        const rx = c * halfW, rz = s * halfW;
        const leanX = -s * halfW * 0.65, leanZ = c * halfW * 0.65;
        // Single tapered blade triangle (aPos:3, aTip:1, aColor:3, aPhase:1 -> 8 floats)
        data.push(
          cx + lx, cy - 0.04, cz + lz, 0.0, colBase[0], colBase[1], colBase[2], phase,
          cx + rx, cy - 0.04, cz + rz, 0.0, colBase[0], colBase[1], colBase[2], phase,
          cx + leanX, cy + h, cz + leanZ, 1.0, colTip[0], colTip[1], colTip[2], phase
        );
      };

      const targetTufts = 5400;
      let attempts = 0;
      let placed = 0;
      while (placed < targetTufts && attempts < 26000) {
        attempts++;
        // Concentrate tufts around launch valley, factory outskirts, town meadows & river banks
        const spread = placed < 2600 ? 220 : 520;
        const x = (rnd() - 0.5) * 2 * spread;
        const z = (rnd() - 0.5) * 2 * spread;
        // Skip launch helipad & factory slab
        if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
        if (x > -128 && x < 108 && z > -218 && z < -48) continue;
        // Skip asphalt road
        if (Math.abs(x - getRoadX(z)) < 8.5) continue;

        const y = getH(x, z);
        if (y < waterY + 1.8 || y > 72) continue;
        const n = getN(x, z, 3.0);
        if (n[1] < 0.78) continue; // Only on grass/meadow slopes, not sheer cliffs

        const h = 0.42 + rnd() * 0.68;
        const w = 0.16 + rnd() * 0.14;
        const tint = 0.84 + rnd() * 0.32;
        const warm = rnd() > 0.78 ? 0.08 : 0.0;
        const colBase = [0.11 * tint, 0.23 * tint, 0.09 * tint];
        const colTip = [Math.min(1, (0.24 + warm) * tint), Math.min(1, (0.44 + warm * 0.6) * tint), 0.15 * tint];
        const yaw0 = rnd() * Math.PI;
        const phase = rnd() * 6.2831;

        // 2 crossed blades per tuft -> 2 triangles per tuft (~10,800 triangles total, ultra-fast)
        pushBlade(x, y, z, yaw0, w, h, colBase, colTip, phase);
        pushBlade(x, y, z, yaw0 + 1.57, w, h * 0.92, colBase, colTip, phase + 0.4);
        placed++;
      }

      const arr = new Float32Array(data);
      this.foliageVertCount = arr.length / 8;
      this.foliageBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.foliageBuf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    }

    renderFoliage(gl, mvp, eye, sim, theme, nowMs) {
      if (!this.foliageProg || !this.foliageBuf || this.foliageVertCount <= 0) return;
      gl.useProgram(this.foliageProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.foliageProg, "uMVP"), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uDronePos"), sim.pos);
      gl.uniform1f(gl.getUniformLocation(this.foliageProg, "uTime"), nowMs * 0.001);
      gl.uniform1f(gl.getUniformLocation(this.foliageProg, "uThrottle"), sim.armed ? (sim.throttleOut || 0.2) : 0.0);
      gl.uniform1f(gl.getUniformLocation(this.foliageProg, "uWeatherWind"), Math.max(this.rainAmount, this.snowAmount));
      gl.uniform1f(gl.getUniformLocation(this.foliageProg, "uSnowAmount"), this.snowAmount);
      gl.uniform1f(gl.getUniformLocation(this.foliageProg, "uRainAmount"), this.rainAmount);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uSunDir"), theme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uSunColor"), theme.sunColor);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uAmbient"), theme.ambient);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uFogColor"), theme.fogColor);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uMistColor"), theme.mistColor);
      gl.uniform3fv(gl.getUniformLocation(this.foliageProg, "uSkyZenith"), theme.skyZenith);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.foliageBuf);
      const locs = [
        [gl.getAttribLocation(this.foliageProg, "aPos"), 3, 0],
        [gl.getAttribLocation(this.foliageProg, "aTip"), 1, 12],
        [gl.getAttribLocation(this.foliageProg, "aColor"), 3, 16],
        [gl.getAttribLocation(this.foliageProg, "aPhase"), 1, 28]
      ];
      for (const [loc, sz, off] of locs) {
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 32, off);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.foliageVertCount);
      for (const [loc] of locs) {
        if (loc >= 0) gl.disableVertexAttribArray(loc);
      }
    }

    buildWeatherBuffer() {
      const gl = this.gl;
      if (!gl || !this.weatherProg) return;
      let seed = 884217;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const count = 1800; // 1,800 GPU infinite-wrap 3D rain streaks / snowflakes (6 verts each = 10,800 verts)
      const data = new Float32Array(count * 6 * 6);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      let o = 0;
      for (let i = 0; i < count; i++) {
        const sx = rnd(), sy = rnd(), sz = rnd(), r = rnd();
        for (let c = 0; c < 6; c++) {
          data[o++] = sx; data[o++] = sy; data[o++] = sz;
          data[o++] = corners[c][0]; data[o++] = corners[c][1];
          data[o++] = r;
        }
      }
      this.weatherVertCount = count * 6;
      this.weatherBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.weatherBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    renderWeather(gl, mvp, eye, camRight, camUp, sim, theme, nowMs) {
      if (!this.weatherProg || !this.weatherBuf || this.weatherVertCount <= 0) return;
      if (this.rainAmount < 0.01 && this.snowAmount < 0.01) return;

      gl.useProgram(this.weatherProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.uniformMatrix4fv(gl.getUniformLocation(this.weatherProg, "uMVP"), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uCamRight"), camRight);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uCamUp"), camUp);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uDroneVel"), sim.vel || [0, 0, 0]);
      gl.uniform1f(gl.getUniformLocation(this.weatherProg, "uTime"), nowMs * 0.001);
      gl.uniform1f(gl.getUniformLocation(this.weatherProg, "uRainAmount"), this.rainAmount);
      gl.uniform1f(gl.getUniformLocation(this.weatherProg, "uSnowAmount"), this.snowAmount);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uSunColor"), theme.sunColor);
      gl.uniform3fv(gl.getUniformLocation(this.weatherProg, "uMistColor"), theme.mistColor);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.weatherBuf);
      const locs = [
        [gl.getAttribLocation(this.weatherProg, "aSeed"), 3, 0],
        [gl.getAttribLocation(this.weatherProg, "aCorner"), 2, 12],
        [gl.getAttribLocation(this.weatherProg, "aRand"), 1, 20]
      ];
      for (const [loc, sz, off] of locs) {
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 24, off);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.weatherVertCount);
      for (const [loc] of locs) {
        if (loc >= 0) gl.disableVertexAttribArray(loc);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    updateGroundDust(sim, dt) {
      const terrH = global.FPVWorld.getTerrainHeight(sim.pos[0], sim.pos[2]);
      const overWater = terrH < global.FPVWorld.WATER_LEVEL + 0.12;
      const groundH = Math.max(global.FPVWorld.WATER_LEVEL, terrH);
      const agl = sim.pos[1] - groundH;

      // 1. Crash Impact Burst: Billowing dark/grey smoke puffs + hot orange-gold sparks
      if (sim.crashActive && !this.prevCrashActive) {
        for (let i = 0; i < 20; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.4 + Math.random() * 5.2;
          const shade = 0.34 + Math.random() * 0.24;
          this.dustParticles.push({
            x: sim.pos[0] + (Math.random() - 0.5) * 0.5,
            y: Math.max(groundH + 0.25, sim.pos[1]) + Math.random() * 0.3,
            z: sim.pos[2] + (Math.random() - 0.5) * 0.5,
            vx: Math.cos(ang) * spd, vy: 1.5 + Math.random() * 3.0, vz: Math.sin(ang) * spd,
            size0: 0.75 + Math.random() * 0.65, grow: 2.3,
            life: 1.45 + Math.random() * 0.65, maxLife: 2.1,
            color: [shade * 1.04, shade * 1.0, shade * 0.94],
            alphaMax: 0.54, kind: 1, gravity: -0.6, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 1.6
          });
        }
        for (let i = 0; i < 26; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 3.5 + Math.random() * 8.2;
          this.dustParticles.push({
            x: sim.pos[0], y: Math.max(groundH + 0.2, sim.pos[1]), z: sim.pos[2],
            vx: Math.cos(ang) * spd, vy: 2.6 + Math.random() * 5.6, vz: Math.sin(ang) * spd,
            size0: 0.22 + Math.random() * 0.15, grow: -0.1,
            life: 0.45 + Math.random() * 0.45, maxLife: 0.9,
            color: [1.0, 0.65 + Math.random() * 0.32, 0.18],
            alphaMax: 0.98, kind: 2, gravity: 11.5, rot: 0, spin: 0
          });
        }
      }
      this.prevCrashActive = Boolean(sim.crashActive);

      // 2. Low-Altitude Ground-Effect Swirling Dust or Water Mist Spray
      if (sim.armed && agl < 5.0 && this.dustParticles.length < 150) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.2 + sim.throttleOut * 6.5;
        this.dustParticles.push({
          x: sim.pos[0] + Math.cos(ang) * 0.35, y: groundH + 0.22, z: sim.pos[2] + Math.sin(ang) * 0.35,
          vx: Math.cos(ang) * spd, vy: 0.55 + Math.random() * 1.25, vz: Math.sin(ang) * spd,
          size0: 0.55 + Math.random() * 0.45, grow: 2.0,
          life: 0.72 + Math.random() * 0.32, maxLife: 1.04,
          color: overWater ? [0.84, 0.93, 0.99] : [0.64, 0.58, 0.48],
          alphaMax: overWater ? 0.42 : 0.32, kind: 0, gravity: -0.25,
          rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2.2
        });
      }

      // 3. Rising Smoke Plumes from All 3 Factory Smokestacks
      this.chimneyTimer += dt;
      if (this.chimneyTimer > 0.24 && this.dustParticles.length < 170) {
        this.chimneyTimer = 0;
        const fy = global.FPVWorld.getTerrainHeight(0, -125);
        const stacks = [
          { x: -64, y: fy + 68.5, z: -158 },
          { x: -64, y: fy + 56.5, z: -124 },
          { x: -114, y: fy + 76.5, z: -182 }
        ];
        const st = stacks[Math.floor(Math.random() * stacks.length)];
        this.dustParticles.push({
          x: st.x + (Math.random() - 0.5) * 1.6, y: st.y, z: st.z + (Math.random() - 0.5) * 1.6,
          vx: 1.4 + Math.random() * 0.8, vy: 2.2 + Math.random() * 1.0, vz: 0.6 + (Math.random() - 0.5) * 0.6,
          size0: 4.5, grow: 3.4,
          life: 5.5, maxLife: 5.5,
          color: [0.68, 0.70, 0.72],
          alphaMax: 0.24, kind: 1, gravity: -0.15,
          rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.4
        });
      }

      for (let i = this.dustParticles.length - 1; i >= 0; i--) {
        const p = this.dustParticles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= (p.gravity || 0) * dt;
        const drag = p.kind === 2 ? 1.2 : 2.1;
        p.vx *= Math.exp(-drag * dt); p.vz *= Math.exp(-drag * dt);
        p.rot += (p.spin || 0) * dt;
        p.life -= dt;
        if (p.life <= 0) this.dustParticles.splice(i, 1);
      }
    }

    buildDynamicMesh(sim, nowMs) {
      const mb = new MeshBuilder();
      const timeSec = nowMs * 0.001;
      const getH = global.FPVWorld.getTerrainHeight;
      const waterY = global.FPVWorld.WATER_LEVEL;

      // 1. 12 Illuminated FPV Race Gates (hidden in GoPro Pure Cinema Mode)
      if (!this.cinemaMode) {
      for (let gi = 0; gi < this.gates.length; gi++) {
        const g = this.gates[gi];
        const isActive = gi === sim.activeGateIdx, isNext = gi === (sim.activeGateIdx + 1) % this.gates.length;
        const gateCol = isActive ? [0.10, 0.96, 0.82] : isNext ? [1.0, 0.66, 0.10] : [0.46, 0.53, 0.62];
        const emissive = isActive ? 1.0 : isNext ? 0.80 : 0.16;
        const cy = Math.cos(g.yaw), sy = Math.sin(g.yaw), rx = cy, rz = -sy;
        const thickness = isActive ? 0.62 : 0.44;
        for (let s = 0; s < 8; s++) {
          const a0 = (s / 8) * Math.PI * 2, a1 = ((s + 1) / 8) * Math.PI * 2;
          const c0 = Math.cos(a0) * g.radius, s0 = Math.sin(a0) * g.radius;
          const c1 = Math.cos(a1) * g.radius, s1 = Math.sin(a1) * g.radius;
          const mx = (c0 + c1) * 0.5, my = (s0 + s1) * 0.5;
          const chordLen = Math.hypot(c1 - c0, s1 - s0) + 0.24;
          const segAngle = Math.atan2(s1 - s0, c1 - c0), ca = Math.cos(segAngle), sa = Math.sin(segAngle);
          mb.pushBox(0, 0, 0, chordLen, thickness, thickness * 1.35, gateCol, emissive, (lx, ly, lz) => {
            const px = mx + lx * ca - ly * sa, py = my + lx * sa + ly * ca;
            return [g.x + px * rx + lz * sy, g.y + py, g.z + px * rz + lz * cy];
          });
        }
        const legSpan = g.radius * 0.78, legH = Math.max(1, g.y - g.radius * 0.62 - g.groundY);
        mb.pushBox(g.x - rx * legSpan, g.groundY + legH * 0.5, g.z - rz * legSpan, 0.45, legH, 0.45, [0.22, 0.27, 0.33], 0);
        mb.pushBox(g.x + rx * legSpan, g.groundY + legH * 0.5, g.z + rz * legSpan, 0.45, legH, 0.45, [0.22, 0.27, 0.33], 0);
        if (isActive) mb.pushBox(g.x, g.y + g.radius + 3.4 + Math.sin(timeSec * 4.2) * 0.9, g.z, 1.4, 1.4, 1.4, [0.16, 0.98, 0.88], 1.0);
      }

      // 2. 3D GCS Waypoints & Flight Path Beams
      if (sim.waypoints && sim.waypoints.length > 0) {
        const wp3D = sim.waypoints.map((w) => {
          const gy = Math.max(waterY, getH(w.x, w.z));
          return [w.x, gy + w.agl, w.z, gy];
        });
        for (let i = 0; i < wp3D.length; i++) {
          const p = wp3D[i];
          const isTarget = sim.autopilotMode === "MISSION" && i === sim.activeWpIdx;
          const wpCol = isTarget ? [0.16, 0.95, 0.62] : [0.98, 0.68, 0.14];
          const pillarH = Math.max(1, p[1] - p[3]);
          mb.pushBox(p[0], p[3] + pillarH * 0.5, p[2], 0.32, pillarH, 0.32, wpCol, 0.75);
          const pulse = isTarget ? 2.6 + Math.sin(timeSec * 6) * 0.45 : 2.1;
          mb.pushBox(p[0], p[1], p[2], pulse, pulse, pulse, wpCol, 1.0);
          if (i + 1 < wp3D.length) mb.pushBeam(p, wp3D[i + 1], 0.42, [0.16, 0.84, 0.96], 0.95);
          else if (sim.missionLoop && wp3D.length > 2) mb.pushBeam(p, wp3D[0], 0.28, [0.16, 0.84, 0.96], 0.65);
        }
      }
      }

      // 3. Articulated Smooth-Shaded Ground Pedestrians
      if (this.actors && this.actors.pedestrians && global.FPVAssetsModel) {
        for (const p of this.actors.pedestrians) {
          global.FPVAssetsModel.pushRealisticPedestrian(mb.data, p);
        }
      }

      // 4. Rotating Tapered Wind Turbine Blades
      for (const tb of this.landmarks.turbines) {
        const baseAngle = tb.phase + timeSec * 1.15, hubY = tb.y + tb.hubHeight, hubZ = tb.z + 3.0;
        for (let b = 0; b < 3; b++) {
          const ang = baseAngle + (b * Math.PI * 2) / 3, ca = Math.cos(ang), sa = Math.sin(ang);
          mb.pushBox(0, 0, 0, 1.05, tb.bladeLen, 0.32, [0.92, 0.95, 0.98], 0.1, (lx, ly, lz) => {
            const oy = ly + tb.bladeLen * 0.5;
            return [tb.x + lx * ca - oy * sa, hubY + lx * sa + oy * ca, hubZ + lz];
          });
        }
      }

      // 5. Airborne Piston Biplane Dual Wingtip Contrail Ribbons
      if (this.actors && this.actors.aircraft) {
        for (const ac of this.actors.aircraft) {
          if (!ac.contrail || ac.contrail.length < 2) continue;
          const n = ac.contrail.length;
          for (let ci = 1; ci < n; ci++) {
            const c0 = ac.contrail[ci - 1], c1 = ac.contrail[ci];
            const fade = ci / n;
            const w = 0.22 * (1.15 - fade * 0.55);
            const col = [0.88 * fade + 0.10, 0.92 * fade + 0.08, 0.97 * fade + 0.03];
            mb.pushQuad([c0.lx - w, c0.ly, c0.lz], [c0.lx + w, c0.ly, c0.lz], [c1.lx + w, c1.ly, c1.lz], [c1.lx - w, c1.ly, c1.lz], col, 0.45 * fade);
            mb.pushQuad([c0.rx - w, c0.ry, c0.rz], [c0.rx + w, c0.ry, c0.rz], [c1.rx + w, c1.ry, c1.rz], [c1.rx - w, c1.ry, c1.rz], col, 0.45 * fade);
          }
        }
      }

      // 6. Drone Wingtip Aero Trails (CHASE / ORBIT)
      if (this.cameraMode !== "FPV") {
        const scale = this.cameraMode === "ORBIT" ? 1.35 : 1.25;
        for (let ti = 1; ti < sim.trail.length; ti++) {
          const p0 = sim.trail[ti - 1], p1 = sim.trail[ti], fade = ti / sim.trail.length, w = 0.034 * fade * scale;
          const tc = [0.14 * fade, 0.86 * fade, 0.98 * fade];
          mb.pushQuad([p0.lx - w, p0.ly, p0.lz], [p0.lx + w, p0.ly, p0.lz], [p1.lx + w, p1.ly, p1.lz], [p1.lx - w, p1.ly, p1.lz], tc, 0.95);
          mb.pushQuad([p0.rx - w, p0.ry, p0.rz], [p0.rx + w, p0.ry, p0.rz], [p1.rx + w, p1.ry, p1.rz], [p1.rx - w, p1.ry, p1.rz], tc, 0.95);
        }
      }

      return mb.toFloat32();
    }

    renderVehicles(gl, prog, bindAttribs, isShadowPass) {
      if (!this.vehicleMeshes || !this.actors || !this.actors.vehicles) return;
      const uModelLoc = gl.getUniformLocation(prog, "uModel");
      const uDroneShadeLoc = isShadowPass ? null : gl.getUniformLocation(prog, "uDroneShade");
      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 1.0);
      for (const v of this.actors.vehicles) {
        const vbo = this.vehicleMeshes.get(v.id);
        if (!vbo) continue;
        gl.uniformMatrix4fv(uModelLoc, false, mat4TranslateRotateY(v.x, v.y, v.z, v.yaw));
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo.buf);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, vbo.count);
      }
      gl.uniformMatrix4fv(uModelLoc, false, MAT4_IDENTITY);
      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 0.0);
    }

    renderAircraft(gl, prog, bindAttribs, isShadowPass) {
      if (!this.biplaneMeshes || !this.actors || !this.actors.aircraft) return;
      const uModelLoc = gl.getUniformLocation(prog, "uModel");
      const uDroneShadeLoc = isShadowPass ? null : gl.getUniformLocation(prog, "uDroneShade");
      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 1.0);

      for (const ac of this.actors.aircraft) {
        const bodyVbo = this.biplaneMeshes.get(ac.id);
        if (!bodyVbo) continue;

        const cy = Math.cos(ac.yaw), sy = Math.sin(ac.yaw);
        const cp = Math.cos(-ac.pitch), sp = Math.sin(-ac.pitch);
        const cr = Math.cos(ac.roll), sr = Math.sin(ac.roll);

        const r00 = cy * cr + sy * sp * sr, r01 = -cy * sr + sy * sp * cr, r02 = sy * cp;
        const r10 = cp * sr,                r11 = cp * cr,                 r12 = -sp;
        const r20 = -sy * cr + cy * sp * sr, r21 = sy * sr + cy * sp * cr, r22 = cy * cp;

        const bodyMat = new Float32Array([
          r00, r10, r20, 0,
          r01, r11, r21, 0,
          r02, r12, r22, 0,
          ac.x, ac.y, ac.z, 1
        ]);

        gl.uniformMatrix4fv(uModelLoc, false, bodyMat);
        gl.bindBuffer(gl.ARRAY_BUFFER, bodyVbo.buf);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, bodyVbo.count);

        if (this.biplanePropMesh && !isShadowPass) {
          const cs = Math.cos(ac.propPhase), ss = Math.sin(ac.propPhase);
          const propLocal = new Float32Array([
            cs, ss, 0, 0,
            -ss, cs, 0, 0,
            0, 0, 1, 0,
            0, 0.05, 4.28, 1
          ]);
          gl.uniformMatrix4fv(uModelLoc, false, mat4Multiply(bodyMat, propLocal));
          gl.bindBuffer(gl.ARRAY_BUFFER, this.biplanePropMesh.buf);
          bindAttribs();
          gl.drawArrays(gl.TRIANGLES, 0, this.biplanePropMesh.count);
        }
      }

      gl.uniformMatrix4fv(uModelLoc, false, MAT4_IDENTITY);
      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 0.0);
    }

    renderDroneModel(gl, prog, sim, bindAttribs, isShadowPass, fpvPropsOnly) {
      if (!this.droneMesh || !global.FPVDroneModel) return;
      const DM = global.FPVDroneModel;
      const scale = fpvPropsOnly ? 1.0 : (this.cameraMode === "ORBIT" ? 1.35 : 1.25);
      const droneMat = mat4FromQuatTransScale(sim.quat, sim.pos, scale);
      const uModelLoc = gl.getUniformLocation(prog, "uModel");
      const uDroneShadeLoc = isShadowPass ? null : gl.getUniformLocation(prog, "uDroneShade");
      const uAlphaLoc = isShadowPass ? null : gl.getUniformLocation(prog, "uAlpha");

      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 1.0);
      if (uAlphaLoc) gl.uniform1f(uAlphaLoc, 1.0);

      if (!fpvPropsOnly) {
        gl.uniformMatrix4fv(uModelLoc, false, droneMat);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.droneMesh.body.buf);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, this.droneMesh.body.count);

        if (!isShadowPass) {
          const ledCol = sim.autopilotMode !== "MANUAL" ? [0.14, 0.88, 0.98] : sim.armed ? [0.10, 0.96, 0.56] : [0.96, 0.24, 0.24];
          const ledArr = DM.buildDroneLedMesh(ledCol);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.droneMesh.ledBuf);
          gl.bufferData(gl.ARRAY_BUFFER, ledArr, gl.DYNAMIC_DRAW);
          bindAttribs();
          gl.drawArrays(gl.TRIANGLES, 0, ledArr.length / 10);
        }
      }

      const isFastSpin = sim.armed && sim.throttleOut > 0.04;
      for (let i = 0; i < DM.MOTOR_MOUNTS.length; i++) {
        const m = DM.MOTOR_MOUNTS[i];
        if (fpvPropsOnly && !m.front) continue;
        const spinAng = sim.propPhase * m.dir + i * 0.95;
        const propLocal = mat4TranslateRotateY(m.x, m.y, m.z, spinAng);
        gl.uniformMatrix4fv(uModelLoc, false, mat4Multiply(droneMat, propLocal));

        const propVbo = m.front
          ? (m.dir > 0 ? this.droneMesh.propFrontCW : this.droneMesh.propFrontCCW)
          : (m.dir > 0 ? this.droneMesh.propRearCW : this.droneMesh.propRearCCW);
        gl.bindBuffer(gl.ARRAY_BUFFER, propVbo.buf);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, propVbo.count);
      }

      if (isFastSpin && !isShadowPass) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        const blurAlpha = fpvPropsOnly
          ? Math.min(0.26, 0.08 + sim.throttleOut * 0.20)
          : Math.min(0.46, 0.16 + sim.throttleOut * 0.34);
        if (uAlphaLoc) gl.uniform1f(uAlphaLoc, blurAlpha);
        for (let i = 0; i < DM.MOTOR_MOUNTS.length; i++) {
          const m = DM.MOTOR_MOUNTS[i];
          if (fpvPropsOnly && !m.front) continue;
          const discLocal = mat4TranslateRotateY(m.x, m.y + 0.002, m.z, sim.propPhase * m.dir * 0.35);
          gl.uniformMatrix4fv(uModelLoc, false, mat4Multiply(droneMat, discLocal));
          const discVbo = m.front ? this.droneMesh.discFront : this.droneMesh.discRear;
          gl.bindBuffer(gl.ARRAY_BUFFER, discVbo.buf);
          bindAttribs();
          gl.drawArrays(gl.TRIANGLES, 0, discVbo.count);
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        if (uAlphaLoc) gl.uniform1f(uAlphaLoc, 1.0);
      }

      gl.uniformMatrix4fv(uModelLoc, false, MAT4_IDENTITY);
      if (uDroneShadeLoc) gl.uniform1f(uDroneShadeLoc, 0.0);
    }

    renderGhostDrone(gl, sim, eye, bindAttribs) {
      const gd = sim.ghostDrone;
      if (!gd || !gd.enabled || !gd.active || !this.droneMesh || !global.FPVDroneModel) return;
      const distCam = Math.hypot(gd.pos[0] - eye[0], gd.pos[1] - eye[1], gd.pos[2] - eye[2]);
      if (distCam < 1.1) return;

      const DM = global.FPVDroneModel;
      const uModelLoc = gl.getUniformLocation(this.worldProg, "uModel");
      const uGhostModeLoc = gl.getUniformLocation(this.worldProg, "uGhostMode");
      const uGhostTintLoc = gl.getUniformLocation(this.worldProg, "uGhostTint");
      const uAlphaLoc = gl.getUniformLocation(this.worldProg, "uAlpha");

      const isPB = Boolean(gd.isPersonalBest);
      const tint = isPB ? [1.0, 0.72, 0.18] : [0.14, 0.94, 0.98];

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.uniform1f(uGhostModeLoc, 1.0);
      gl.uniform3fv(uGhostTintLoc, tint);
      gl.uniform1f(uAlphaLoc, 0.56);

      const ghostMat = mat4FromQuatTransScale(gd.quat, gd.pos, 1.45);
      gl.uniformMatrix4fv(uModelLoc, false, ghostMat);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.droneMesh.body.buf);
      bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.droneMesh.body.count);

      for (let i = 0; i < DM.MOTOR_MOUNTS.length; i++) {
        const m = DM.MOTOR_MOUNTS[i];
        const discLocal = mat4TranslateRotateY(m.x, m.y + 0.004, m.z, (gd.propPhase || 0) * m.dir * 0.4);
        gl.uniformMatrix4fv(uModelLoc, false, mat4Multiply(ghostMat, discLocal));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.droneMesh.discFront.buf);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, this.droneMesh.discFront.count);
      }

      // Holographic Ghost Flight Ribbon Trail
      if (gd.trail && gd.trail.length > 2) {
        const mb = new MeshBuilder();
        const n = gd.trail.length;
        for (let i = 1; i < n; i++) {
          const p0 = gd.trail[i - 1], p1 = gd.trail[i];
          const fade = i / n;
          const w = 0.20 * fade;
          mb.pushQuad([p0[0] - w, p0[1], p0[2]], [p0[0] + w, p0[1], p0[2]], [p1[0] + w, p1[1], p1[2]], [p1[0] - w, p1[1], p1[2]], tint, 1.0);
        }
        const tArr = mb.toFloat32();
        gl.uniformMatrix4fv(uModelLoc, false, MAT4_IDENTITY);
        gl.uniform1f(uAlphaLoc, 0.34);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ghostTrailBuf);
        gl.bufferData(gl.ARRAY_BUFFER, tArr, gl.DYNAMIC_DRAW);
        bindAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, tArr.length / 10);
      }

      gl.uniform1f(uGhostModeLoc, 0.0);
      gl.uniform1f(uAlphaLoc, 1.0);
      gl.uniformMatrix4fv(uModelLoc, false, MAT4_IDENTITY);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    renderParticles(gl, mvp, fovRad, viewportH) {
      const n = this.dustParticles.length;
      if (n === 0 || !this.particleProg) return;
      const data = new Float32Array(n * 10);
      for (let i = 0; i < n; i++) {
        const p = this.dustParticles[i];
        const age = 1.0 - Math.max(0, Math.min(1, p.life / (p.maxLife || 1.0)));
        const fadeIn = Math.min(1.0, age * 5.0);
        const fadeOut = Math.pow(Math.max(0, 1.0 - age), 1.35);
        const sz = Math.max(0.15, (p.size0 || 0.6) + age * (p.grow || 1.5));
        const off = i * 10;
        data[off]     = p.x; data[off + 1] = p.y; data[off + 2] = p.z;
        data[off + 3] = p.color[0]; data[off + 4] = p.color[1]; data[off + 5] = p.color[2];
        data[off + 6] = sz;
        data[off + 7] = (p.alphaMax || 0.35) * fadeIn * fadeOut;
        data[off + 8] = p.kind || 0;
        data[off + 9] = p.rot || 0;
      }

      gl.useProgram(this.particleProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.uniformMatrix4fv(gl.getUniformLocation(this.particleProg, "uMVP"), false, mvp);
      const projScale = (viewportH * 0.5) / Math.tan(fovRad * 0.5);
      gl.uniform1f(gl.getUniformLocation(this.particleProg, "uProjScale"), projScale);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const attribs = [["aPos", 3, 0], ["aColor", 3, 12], ["aSize", 1, 24], ["aAlpha", 1, 28], ["aKind", 1, 32], ["aRot", 1, 36]];
      for (const [name, sz, off] of attribs) {
        const loc = gl.getAttribLocation(this.particleProg, name);
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 40, off);
        }
      }
      gl.drawArrays(gl.POINTS, 0, n);
      for (const [name] of attribs) {
        const loc = gl.getAttribLocation(this.particleProg, name);
        if (loc >= 0) gl.disableVertexAttribArray(loc);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    drawFullScreenQuad(gl, prog) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.screenQuadBuf);
      const loc = gl.getAttribLocation(prog, "aScreen");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(loc);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.glCanvas.clientWidth || window.innerWidth;
      const h = this.glCanvas.clientHeight || window.innerHeight;
      this.width = w; this.height = h; this.dpr = dpr;
      const pw = Math.max(4, Math.round(w * dpr));
      const ph = Math.max(4, Math.round(h * dpr));
      this.glCanvas.width = pw; this.glCanvas.height = ph;
      this.hudCanvas.width = pw; this.hudCanvas.height = ph;
      if (this.gl) {
        this.initPostTargets(pw, ph);
        this.gl.viewport(0, 0, pw, ph);
      }
    }

    computeCascadeLightMVP(theme, eye, camFwd, orthoHalf, forwardBias, shadowSz) {
      const sd = theme.sunDir;
      const sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      const sx = sd[0] / sl, sy = sd[1] / sl, sz = sd[2] / sl;

      const lightEye0 = [sx * 860, sy * 860, sz * 860];
      const lightView = mat4LookAt(lightEye0, [0, 0, 0], [0, 1, 0]);

      const focus = [eye[0] + camFwd[0] * forwardBias, eye[1], eye[2] + camFwd[2] * forwardBias];
      const fx = lightView[0] * focus[0] + lightView[4] * focus[1] + lightView[8] * focus[2] + lightView[12];
      const fy = lightView[1] * focus[0] + lightView[5] * focus[1] + lightView[9] * focus[2] + lightView[13];

      const texelWorld = (orthoHalf * 2.0) / (shadowSz || 1024);
      const snapX = Math.floor(fx / texelWorld) * texelWorld;
      const snapY = Math.floor(fy / texelWorld) * texelWorld;

      // Fixed near/far depth span prevents depth-quantization stepping during forward flight
      const lightProj = mat4Ortho(snapX - orthoHalf, snapX + orthoHalf, snapY - orthoHalf, snapY + orthoHalf, 60.0, 1720.0);
      return mat4Multiply(lightProj, lightView);
    }

    renderShadowCascade(gl, rt, lightMVP, dyn, sim, includeDrone) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.8, 3.2);

      gl.useProgram(this.shadowProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, "uLightMVP"), false, lightMVP);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, "uModel"), false, MAT4_IDENTITY);

      const sPosLoc = gl.getAttribLocation(this.shadowProg, "aPos");
      const sEmLoc = gl.getAttribLocation(this.shadowProg, "aEmissive");
      const bindShadowAttribs = () => {
        if (sPosLoc >= 0) { gl.enableVertexAttribArray(sPosLoc); gl.vertexAttribPointer(sPosLoc, 3, gl.FLOAT, false, 40, 0); }
        if (sEmLoc >= 0)  { gl.enableVertexAttribArray(sEmLoc);  gl.vertexAttribPointer(sEmLoc, 1, gl.FLOAT, false, 40, 36); }
      };

      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
      bindShadowAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.staticVertCount);

      if (dyn.length > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
        bindShadowAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, dyn.length / 10);
      }

      this.renderVehicles(gl, this.shadowProg, bindShadowAttribs, true);
      this.renderAircraft(gl, this.shadowProg, bindShadowAttribs, true);
      if (includeDrone) {
        this.renderDroneModel(gl, this.shadowProg, sim, bindShadowAttribs, true, false);
      }

      if (sPosLoc >= 0) gl.disableVertexAttribArray(sPosLoc);
      if (sEmLoc >= 0) gl.disableVertexAttribArray(sEmLoc);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    getEffectiveTheme(base) {
      const r = this.rainAmount, s = this.snowAmount;
      if (r < 0.005 && s < 0.005) return base;
      const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const isNight = base.nightFactor > 0.6;
      const rainZenith = isNight ? [0.02, 0.03, 0.06] : [0.16, 0.22, 0.30];
      const rainHoriz  = isNight ? [0.06, 0.09, 0.14] : [0.40, 0.46, 0.54];
      const rainSun    = isNight ? [0.24, 0.34, 0.52] : [0.64, 0.68, 0.74];
      const snowZenith = isNight ? [0.03, 0.05, 0.11] : [0.34, 0.44, 0.58];
      const snowHoriz  = isNight ? [0.09, 0.14, 0.22] : [0.74, 0.81, 0.88];
      const snowSun    = isNight ? [0.38, 0.50, 0.72] : [0.88, 0.92, 0.98];

      let skyZenith  = mix3(mix3(base.skyZenith, rainZenith, r * 0.82), snowZenith, s * 0.68);
      let skyHorizon = mix3(mix3(base.skyHorizon, rainHoriz, r * 0.78), snowHoriz, s * 0.72);
      let fogColor   = mix3(mix3(base.fogColor, rainHoriz, r * 0.80), snowHoriz, s * 0.78);
      let mistColor  = mix3(mix3(base.mistColor, rainHoriz, r * 0.76), snowHoriz, s * 0.82);
      let sunColor   = mix3(mix3(base.sunColor, rainSun, r * 0.72), snowSun, s * 0.48);
      let ambient    = mix3(mix3(base.ambient, isNight ? [0.10, 0.13, 0.20] : [0.30, 0.35, 0.43], r * 0.72), isNight ? [0.16, 0.20, 0.28] : [0.50, 0.56, 0.65], s * 0.65);
      let cloudBright = mix3(mix3(base.cloudBright, isNight ? [0.16, 0.20, 0.28] : [0.58, 0.63, 0.70], r * 0.82), isNight ? [0.24, 0.30, 0.42] : [0.88, 0.92, 0.96], s * 0.68);
      let cloudShade  = mix3(mix3(base.cloudShade, isNight ? [0.04, 0.06, 0.10] : [0.24, 0.29, 0.37], r * 0.84), isNight ? [0.09, 0.13, 0.20] : [0.48, 0.55, 0.66], s * 0.65);
      return {
        skyZenith, skyHorizon, fogColor, mistColor,
        sunDir: base.sunDir, sunColor, ambient, cloudBright, cloudShade,
        nightFactor: base.nightFactor,
        localLight: Math.min(1.0, base.localLight + r * 0.38 + s * 0.18),
        flareAlpha: base.flareAlpha * (1.0 - r * 0.75 - s * 0.55)
      };
    }

    render(sim, dt, nowMs) {
      if (!this.gl) return;
      const gl = this.gl;
      const baseTheme = THEMES[this.skyMode] || THEMES.day;
      const rot = global.FPVPhysics.quatRotateVec;
      const tel = sim.getTelemetry();
      const clampedDt = Math.min(0.05, dt);

      // Smooth dynamic weather interpolation (puddles fill / snow accumulates seamlessly)
      const targetRain = this.weatherMode === "rain" ? 1.0 : 0.0;
      const targetSnow = this.weatherMode === "snow" ? 1.0 : 0.0;
      const wRate = 1.0 - Math.exp(-2.2 * clampedDt);
      this.rainAmount += (targetRain - this.rainAmount) * wRate;
      this.snowAmount += (targetSnow - this.snowAmount) * wRate;
      const theme = this.getEffectiveTheme(baseTheme);

      if (sim.lastTrickEvent && sim.lastTrickEvent.time !== this.lastSeenTrickTime) {
        this.lastSeenTrickTime = sim.lastTrickEvent.time;
        this.trickPopup = {
          name: sim.lastTrickEvent.name,
          pts: sim.lastTrickEvent.pts,
          combo: sim.lastTrickEvent.combo,
          age: 0
        };
      }
      if (this.trickPopup) {
        this.trickPopup.age += clampedDt;
        if (this.trickPopup.age > 2.2) this.trickPopup = null;
      }

      this.updateGroundDust(sim, clampedDt);
      let eye, target, upVec, fovDeg, camFwd, camRight, camUp;

      if (this.cameraMode === "FPV") {
        fovDeg = Math.min(134, sim.preset.fovDeg + Math.min(12, (tel.speedKmh / 145) * 12));
        const tiltRad = (sim.preset.camTiltDeg * Math.PI) / 180;
        camFwd = rot(sim.quat, [0, Math.sin(tiltRad), -Math.cos(tiltRad)]);
        camUp = rot(sim.quat, [0, Math.cos(tiltRad), Math.sin(tiltRad)]);
        camRight = rot(sim.quat, [1, 0, 0]);
        const noseOffset = rot(sim.quat, [0, 0.075, -0.18]);
        const crashShake = tel.crashActive ? 0.11 : 0.0;
        eye = [
          sim.pos[0] + noseOffset[0] + (crashShake ? Math.sin(nowMs * 0.065) * crashShake : 0),
          sim.pos[1] + noseOffset[1] + (crashShake ? Math.cos(nowMs * 0.081) * crashShake : 0),
          sim.pos[2] + noseOffset[2]
        ];
        target = [eye[0] + camFwd[0] * 10, eye[1] + camFwd[1] * 10, eye[2] + camFwd[2] * 10];
        upVec = camUp;
      } else if (this.cameraMode === "CHASE") {
        fovDeg = 76 + Math.min(11, (tel.speedKmh / 140) * 11);
        const droneFwd = rot(sim.quat, [0, 0, -1]);
        const flatLen = Math.hypot(droneFwd[0], droneFwd[2]) || 1;
        const dirX = droneFwd[0] / flatLen, dirZ = droneFwd[2] / flatLen;
        const desiredOff = [-dirX * 2.15, 0.72, -dirZ * 2.15];
        const smooth = 1 - Math.exp(-14 * clampedDt);
        for (let k = 0; k < 3; k++) this.chaseOffset[k] += (desiredOff[k] - this.chaseOffset[k]) * smooth;
        eye = [sim.pos[0] + this.chaseOffset[0], sim.pos[1] + this.chaseOffset[1], sim.pos[2] + this.chaseOffset[2]];
        const minG = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(eye[0], eye[2])) + 0.35;
        if (eye[1] < minG) eye[1] = minG;
        const lookDirX = -this.chaseOffset[0], lookDirZ = -this.chaseOffset[2];
        const lookLen = Math.hypot(lookDirX, lookDirZ) || 1;
        target = [sim.pos[0] + (lookDirX / lookLen) * 2.6, sim.pos[1] + 0.12, sim.pos[2] + (lookDirZ / lookLen) * 2.6];
        upVec = [0, 1, 0];
      } else if (this.cameraMode === "GROUND") {
        // Cinematic Ground Telephoto Pan-Tracking Camera (auto-repositions ahead of flight path)
        const dCam = Math.hypot(sim.pos[0] - this.groundCamPos[0], sim.pos[2] - this.groundCamPos[2]);
        if (dCam > 95 || dCam < 2.2) {
          const vLen = Math.hypot(sim.vel[0], sim.vel[2]);
          const vx = vLen > 2 ? sim.vel[0] / vLen : 0;
          const vz = vLen > 2 ? sim.vel[2] / vLen : -1;
          const sideX = -vz, sideZ = vx;
          const nx = sim.pos[0] + vx * 42 + sideX * 16;
          const nz = sim.pos[2] + vz * 42 + sideZ * 16;
          const ng = Math.max(global.FPVWorld.WATER_LEVEL + 1.5, global.FPVWorld.getTerrainHeight(nx, nz) + 2.4);
          this.groundCamPos = [nx, ng, nz];
        }
        eye = this.groundCamPos.slice();
        target = [sim.pos[0], sim.pos[1] + 0.08, sim.pos[2]];
        upVec = [0, 1, 0];
        const distToDrone = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
        fovDeg = Math.max(22, Math.min(54, 48 - distToDrone * 0.28));
      } else {
        fovDeg = 52;
        this.orbitAngle += clampedDt * 0.42;
        eye = [sim.pos[0] + Math.sin(this.orbitAngle) * 1.18, sim.pos[1] + 0.42, sim.pos[2] + Math.cos(this.orbitAngle) * 1.18];
        const minG = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(eye[0], eye[2])) + 0.22;
        if (eye[1] < minG) eye[1] = minG;
        target = [sim.pos[0], sim.pos[1] + 0.05, sim.pos[2]];
        upVec = [0, 1, 0];
      }

      if (this.cameraMode !== "FPV") {
        const fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
        const fl = Math.hypot(fx, fy, fz) || 1;
        camFwd = [fx / fl, fy / fl, fz / fl];
        const rx = -camFwd[2], rz = camFwd[0], rl = Math.hypot(rx, rz) || 1;
        camRight = [rx / rl, 0, rz / rl];
        camUp = [-camRight[2] * camFwd[1], camRight[2] * camFwd[0] - camRight[0] * camFwd[2], camRight[0] * camFwd[1]];
      }

      // Compute volumetric cloud coverage & fly-through inside-cloud vapor density
      const cloudCoverage = Math.min(0.95, 0.48 + this.rainAmount * 0.36 + this.snowAmount * 0.26);
      let targetInCloud = 0.0;
      if (eye[1] > 165.0 && eye[1] < 295.0) {
        const hf = (eye[1] - 165.0) / 130.0;
        const hProf = Math.min(1, hf / 0.16) * Math.min(1, (1 - hf) / 0.42);
        const wave = 0.5 + 0.5 * Math.sin(eye[0] * 0.008 + nowMs * 0.00025) * Math.cos(eye[2] * 0.008 + nowMs * 0.00015);
        targetInCloud = Math.max(0, Math.min(1, hProf * (0.28 + 0.72 * wave) * (0.55 + cloudCoverage * 0.6)));
      }
      this.inCloudFactor += (targetInCloud - this.inCloudFactor) * (1 - Math.exp(-4.0 * clampedDt));

      // GoPro Lens Wetness: rainstorm, low-altitude water skimming spray, or gentle cloud condensation
      const terrH = global.FPVWorld.getTerrainHeight(sim.pos[0], sim.pos[2]);
      const overWaterLow = terrH < global.FPVWorld.WATER_LEVEL + 0.25 && (sim.pos[1] - global.FPVWorld.WATER_LEVEL) < 4.5 && sim.armed;
      const desiredWet = Math.max(this.rainAmount * 0.95, overWaterLow ? 0.68 : 0.0, this.inCloudFactor * 0.16);
      const dryRate = desiredWet > this.lensWetness ? 3.5 : (0.38 + Math.min(1.2, tel.speedKmh / 100.0));
      this.lensWetness += (desiredWet - this.lensWetness) * (1 - Math.exp(-dryRate * clampedDt));

      const pw = this.glCanvas.width, ph = this.glCanvas.height;
      const aspect = this.width / Math.max(1, this.height);
      const fovRad = (fovDeg * Math.PI) / 180;
      const tanHalfFov = Math.tan(fovRad * 0.5);
      const nearPlane = this.cameraMode === "ORBIT" ? 0.35 : 0.95;
      const farPlane = 1880.0;
      const mvp = mat4Multiply(mat4Perspective(fovRad, aspect, nearPlane, farPlane), mat4LookAt(eye, target, upVec));
      const dyn = this.buildDynamicMesh(sim, nowMs);
      if (dyn.length > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
        gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
      }

      // ================================================================
      // PASS 1A & 1B: Real-Time 2-Cascade CSM Directional Sun Shadows
      // ================================================================
      const csmReady = Boolean(this.shadowRT0 && this.shadowRT0.ok && this.shadowRT1 && this.shadowRT1.ok);
      const lightMVP0 = this.computeCascadeLightMVP(theme, eye, camFwd, 96.0, 44.0, this.shadowRT0 ? this.shadowRT0.w : 2048);
      const lightMVP1 = this.computeCascadeLightMVP(theme, eye, camFwd, 520.0, 165.0, this.shadowRT1 ? this.shadowRT1.w : 1024);

      if (csmReady) {
        this.renderShadowCascade(gl, this.shadowRT0, lightMVP0, dyn, sim, true);
        this.renderShadowCascade(gl, this.shadowRT1, lightMVP1, dyn, sim, false);
      }

      // ================================================================
      // PASS 2: Main 3D Scene (into Offscreen HDR sceneRT with 24/32-bit DepthTex)
      // ================================================================
      const usePost = Boolean(this.sceneRT && this.sceneRT.ok);
      gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? this.sceneRT.fbo : null);
      gl.viewport(0, 0, pw, ph);

      // 2a. True Raymarched 3D Volumetric Cloud Sky Dome + Starfield
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.skyProg);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCamFwd"), camFwd);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCamRight"), camRight);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCamUp"), camUp);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uTanHalfFov"), tanHalfFov);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uAspect"), aspect);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uTime"), nowMs * 0.001);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uNightFactor"), theme.nightFactor);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uUltraClouds"), this.quality === "ultra" ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(this.skyProg, "uCloudCoverage"), cloudCoverage);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uSkyZenith"), theme.skyZenith);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uSkyHorizon"), theme.skyHorizon);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uMistColor"), theme.mistColor);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uSunDir"), theme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uSunColor"), theme.sunColor);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCloudBright"), theme.cloudBright);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, "uCloudShade"), theme.cloudShade);
      this.drawFullScreenQuad(gl, this.skyProg);

      // 2b. PBR World + 2-Cascade CSM Soft Shadows + Wet PBR Puddles + Dynamic Snow + Dynamic Actors
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.worldProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.worldProg, "uMVP"), false, mvp);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.worldProg, "uModel"), false, MAT4_IDENTITY);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.worldProg, "uLightMVP0"), false, lightMVP0);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.worldProg, "uLightMVP1"), false, lightMVP1);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uDroneShade"), 0.0);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uGhostMode"), 0.0);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uAlpha"), 1.0);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uLocalLight"), theme.localLight);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uCamPos"), eye);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uSunDir"), theme.sunDir);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uSunColor"), theme.sunColor);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uAmbient"), theme.ambient);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uFogColor"), theme.fogColor);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uMistColor"), theme.mistColor);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uSkyZenith"), theme.skyZenith);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uSkyHorizon"), theme.skyHorizon);
      gl.uniform3fv(gl.getUniformLocation(this.worldProg, "uDronePos"), sim.pos);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uThrottle"), sim.armed ? (sim.throttleOut || 0.2) : 0.0);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uRainAmount"), this.rainAmount);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uSnowAmount"), this.snowAmount);
      gl.uniform1f(gl.getUniformLocation(this.worldProg, "uTime"), nowMs * 0.001);

      if (csmReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowRT0.tex);
        gl.uniform1i(gl.getUniformLocation(this.worldProg, "uShadowMap0"), 0);
        gl.uniform1f(gl.getUniformLocation(this.worldProg, "uShadowTexel0"), 1.0 / this.shadowRT0.w);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowRT1.tex);
        gl.uniform1i(gl.getUniformLocation(this.worldProg, "uShadowMap1"), 1);
        gl.uniform1f(gl.getUniformLocation(this.worldProg, "uShadowTexel1"), 1.0 / this.shadowRT1.w);

        gl.uniform1f(gl.getUniformLocation(this.worldProg, "uShadowEnabled"), 1.0);
        gl.activeTexture(gl.TEXTURE0);
      } else {
        gl.uniform1f(gl.getUniformLocation(this.worldProg, "uShadowEnabled"), 0.0);
      }

      const worldAttribLocs = [
        [gl.getAttribLocation(this.worldProg, "aPos"), 3, 0],
        [gl.getAttribLocation(this.worldProg, "aNormal"), 3, 12],
        [gl.getAttribLocation(this.worldProg, "aColor"), 3, 24],
        [gl.getAttribLocation(this.worldProg, "aEmissive"), 1, 36]
      ];
      const bindWorldAttribs = () => {
        for (const [loc, sz, off] of worldAttribLocs) {
          if (loc >= 0) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 40, off);
          }
        }
      };

      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
      bindWorldAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.staticVertCount);

      if (dyn.length > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
        bindWorldAttribs();
        gl.drawArrays(gl.TRIANGLES, 0, dyn.length / 10);
      }

      this.renderVehicles(gl, this.worldProg, bindWorldAttribs, false);
      this.renderAircraft(gl, this.worldProg, bindWorldAttribs, false);

      if (this.cameraMode !== "FPV") {
        this.renderDroneModel(gl, this.worldProg, sim, bindWorldAttribs, false, false);
      }

      if (!this.cinemaMode) {
        this.renderGhostDrone(gl, sim, eye, bindWorldAttribs);
      }

      for (const [loc] of worldAttribLocs) {
        if (loc >= 0) gl.disableVertexAttribArray(loc);
      }

      // 2b+. GPU Wind, Drone Prop-Wash & Weather-Reactive Alpine Foliage
      if (this.quality === "ultra") {
        this.renderFoliage(gl, mvp, eye, sim, theme, nowMs);
      }

      // 2c. Volumetric Smoke, Ground-Effect Dust, Water Spray & Crash Sparks
      this.renderParticles(gl, mvp, fovRad, ph);

      // 2d. GPU Infinite-Wrap 3D Volumetric Rain Streaks / Blizzard Snowflakes
      this.renderWeather(gl, mvp, eye, camRight, camUp, sim, theme, nowMs);

      // ================================================================
      // PASS 3A, 3B & 4: Depth SSAO + Bloom + Fly-Through 3D Clouds + Lens Raindrops + Post-FX
      // ================================================================
      // Compute real-time tunnel-exit & cloud-breakout Auto-Exposure adaptation
      const inTunnel = (sim.pos[0] > -440 && sim.pos[0] < -290 && sim.pos[2] > -192 && sim.pos[2] < -148 && sim.pos[1] > 62 && sim.pos[1] < 88);
      const inFactoryRoof = (sim.pos[0] > -105 && sim.pos[0] < 75 && sim.pos[2] > -190 && sim.pos[2] < -85 && sim.pos[1] < 24);
      const targetExp = inTunnel ? 1.38 : (inFactoryRoof ? 1.12 : (1.0 + this.inCloudFactor * 0.14));
      const expRate = targetExp > this.autoExposure ? 2.4 : 1.45;
      this.autoExposure += (targetExp - this.autoExposure) * (1 - Math.exp(-expRate * clampedDt));

      // Compute camera angular velocity screen-space motion blur vector
      const dfx = camFwd[0] - this.prevCamFwd[0];
      const dfy = camFwd[1] - this.prevCamFwd[1];
      const dfz = camFwd[2] - this.prevCamFwd[2];
      const panRate = (dfx * camRight[0] + dfy * camRight[1] + dfz * camRight[2]) / Math.max(0.008, clampedDt);
      const tiltRate = (dfx * camUp[0] + dfy * camUp[1] + dfz * camUp[2]) / Math.max(0.008, clampedDt);
      this.prevCamFwd = [camFwd[0], camFwd[1], camFwd[2]];
      const blurScale = this.cinemaMode ? 0.0085 : 0.0055;
      const mVecX = Math.max(-0.024, Math.min(0.024, panRate * blurScale));
      const mVecY = Math.max(-0.024, Math.min(0.024, tiltRate * blurScale));

      // Compute sun screen UV & volumetric God Ray strength
      const sd = theme.sunDir;
      const sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      const sx = sd[0] / sl, sy = sd[1] / sl, sz = sd[2] / sl;
      const sunFacing = camFwd[0] * sx + camFwd[1] * sy + camFwd[2] * sz;
      let sunUvX = 0.5, sunUvY = 0.5, godRayStrength = 0.0;
      if (sunFacing > 0.15) {
        const sp = projectPoint(mvp, eye[0] + sx * 900, eye[1] + sy * 900, eye[2] + sz * 900, 1.0, 1.0);
        if (!sp.behind) {
          sunUvX = sp.sx;
          sunUvY = 1.0 - sp.sy; // WebGL texture Y is bottom-up
          const edgeDist = Math.hypot(sunUvX - 0.5, sunUvY - 0.5);
          godRayStrength = Math.pow(sunFacing, 2.0) * Math.max(0, 1.0 - edgeDist * 0.95) * (theme.flareAlpha || 0.8);
        }
      }

      if (usePost) {
        gl.disable(gl.DEPTH_TEST);
        const hasDepthTex = Boolean(this.sceneRT.depthTex);
        const doSsao = this.quality === "ultra" && hasDepthTex && this.ssaoRT && this.ssaoRT.ok && this.ssaoBlurRT && this.ssaoBlurRT.ok;
        const doBloom = this.quality === "ultra" && this.bloomRTA && this.bloomRTA.ok && this.bloomRTB && this.bloomRTB.ok;

        // PASS 3A: Half-Res Depth-Texture Slope-Invariant SSAO + Cross-Bilateral Blur
        if (doSsao) {
          const sw = this.ssaoRT.w, sh = this.ssaoRT.h;
          gl.viewport(0, 0, sw, sh);

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaoRT.fbo);
          gl.useProgram(this.ssaoProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.depthTex);
          gl.uniform1i(gl.getUniformLocation(this.ssaoProg, "uDepthTex"), 0);
          gl.uniform2f(gl.getUniformLocation(this.ssaoProg, "uTexel"), 1.0 / sw, 1.0 / sh);
          gl.uniform1f(gl.getUniformLocation(this.ssaoProg, "uNear"), nearPlane);
          gl.uniform1f(gl.getUniformLocation(this.ssaoProg, "uFar"), farPlane);
          this.drawFullScreenQuad(gl, this.ssaoProg);

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaoBlurRT.fbo);
          gl.useProgram(this.ssaoBlurProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.ssaoRT.tex);
          gl.uniform1i(gl.getUniformLocation(this.ssaoBlurProg, "uSsaoTex"), 0);
          gl.uniform2f(gl.getUniformLocation(this.ssaoBlurProg, "uTexel"), 1.0 / sw, 1.0 / sh);
          this.drawFullScreenQuad(gl, this.ssaoBlurProg);
        }

        // PASS 3B: Quarter-Res HDR Bloom Extract & Separable Gaussian Blur
        if (doBloom) {
          const bw = this.bloomRTA.w, bh = this.bloomRTA.h;
          gl.viewport(0, 0, bw, bh);

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRTA.fbo);
          gl.useProgram(this.bloomExtractProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
          gl.uniform1i(gl.getUniformLocation(this.bloomExtractProg, "uTex"), 0);
          this.drawFullScreenQuad(gl, this.bloomExtractProg);

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRTB.fbo);
          gl.useProgram(this.bloomBlurProg);
          gl.bindTexture(gl.TEXTURE_2D, this.bloomRTA.tex);
          gl.uniform1i(gl.getUniformLocation(this.bloomBlurProg, "uTex"), 0);
          gl.uniform2f(gl.getUniformLocation(this.bloomBlurProg, "uDir"), 1.0 / bw, 0.0);
          this.drawFullScreenQuad(gl, this.bloomBlurProg);

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRTA.fbo);
          gl.bindTexture(gl.TEXTURE_2D, this.bloomRTB.tex);
          gl.uniform2f(gl.getUniformLocation(this.bloomBlurProg, "uDir"), 0.0, 1.0 / bh);
          this.drawFullScreenQuad(gl, this.bloomBlurProg);
        }

        // PASS 4: Composite to Screen Backbuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, pw, ph);
        gl.useProgram(this.postProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
        gl.uniform1i(gl.getUniformLocation(this.postProg, "uSceneTex"), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, doBloom ? this.bloomRTA.tex : this.sceneRT.tex);
        gl.uniform1i(gl.getUniformLocation(this.postProg, "uBloomTex"), 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, doSsao ? this.ssaoBlurRT.tex : this.sceneRT.tex);
        gl.uniform1i(gl.getUniformLocation(this.postProg, "uSsaoTex"), 2);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, hasDepthTex ? this.sceneRT.depthTex : this.sceneRT.tex);
        gl.uniform1i(gl.getUniformLocation(this.postProg, "uDepthTex"), 3);

        gl.uniform2f(gl.getUniformLocation(this.postProg, "uSunScreenPos"), sunUvX, sunUvY);
        gl.uniform2f(gl.getUniformLocation(this.postProg, "uMotionVec"), mVecX, mVecY);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uSunColor"), theme.sunColor);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uSunDir"), theme.sunDir);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCloudBright"), theme.cloudBright);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCloudShade"), theme.cloudShade);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uMistColor"), theme.mistColor);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCamPos"), eye);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCamFwd"), camFwd);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCamRight"), camRight);
        gl.uniform3fv(gl.getUniformLocation(this.postProg, "uCamUp"), camUp);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uTanHalfFov"), tanHalfFov);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uAspect"), aspect);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uNear"), nearPlane);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uFar"), farPlane);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uFpvLens"), this.cameraMode === "FPV" ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uSpeedNorm"), Math.min(1.0, tel.speedKmh / 160.0));
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uGForce"), tel.gForce);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uVtxGlitch"), tel.vtxGlitch || 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uBloomStrength"), doBloom ? 0.34 : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uGodRayStrength"), doBloom ? godRayStrength : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uExposure"), this.autoExposure);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uCinemaMode"), this.cinemaMode ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uSsaoEnabled"), doSsao ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uDepthEnabled"), hasDepthTex ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uCloudCoverage"), cloudCoverage);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uLensWetness"), this.lensWetness);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uInCloudFactor"), this.inCloudFactor);
        gl.uniform1f(gl.getUniformLocation(this.postProg, "uTime"), nowMs * 0.001);
        this.drawFullScreenQuad(gl, this.postProg);
        gl.activeTexture(gl.TEXTURE0);
      }

      // ================================================================
      // PASS 5: Optical Sun Lens Flare + DJI O3 HD Tactical OSD
      // ================================================================
      this.renderHUD(sim, tel, mvp, eye, camFwd, theme, clampedDt);
    }

    renderSunLensFlare(ctx, mvp, eye, camFwd, theme, w, h) {
      const sd = theme.sunDir;
      const sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      const sx = sd[0] / sl, sy = sd[1] / sl, sz = sd[2] / sl;
      const facing = camFwd[0] * sx + camFwd[1] * sy + camFwd[2] * sz;
      if (facing <= 0.18) return;

      const sp = projectPoint(mvp, eye[0] + sx * 900, eye[1] + sy * 900, eye[2] + sz * 900, w, h);
      if (sp.behind) return;

      const cx = w * 0.5, cy = h * 0.5;
      const edgeFade = Math.max(0, 1 - Math.hypot((sp.sx - cx) / (w * 0.72), (sp.sy - cy) / (h * 0.72)));
      const strength = Math.pow(facing, 2.2) * Math.min(1, edgeFade * 1.4) * (theme.flareAlpha || 0.8);
      if (strength < 0.03) return;

      ctx.save();
      ctx.globalCompositeOperation = "screen";

      const rGlow = Math.min(w, h) * 0.34;
      const grad = ctx.createRadialGradient(sp.sx, sp.sy, 2, sp.sx, sp.sy, rGlow);
      const rC = Math.round(theme.sunColor[0] * 255);
      const gC = Math.round(theme.sunColor[1] * 255);
      const bC = Math.round(theme.sunColor[2] * 255);
      grad.addColorStop(0, `rgba(255, 255, 245, ${(0.52 * strength).toFixed(3)})`);
      grad.addColorStop(0.22, `rgba(${rC}, ${gC}, ${bC}, ${(0.26 * strength).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${rC}, ${gC}, ${bC}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, rGlow, 0, Math.PI * 2);
      ctx.fill();

      const streakW = w * 0.38;
      const sGrad = ctx.createLinearGradient(sp.sx - streakW, sp.sy, sp.sx + streakW, sp.sy);
      sGrad.addColorStop(0, "rgba(255,240,210,0)");
      sGrad.addColorStop(0.5, `rgba(${rC}, ${gC}, ${bC}, ${(0.22 * strength).toFixed(3)})`);
      sGrad.addColorStop(1, "rgba(255,240,210,0)");
      ctx.fillStyle = sGrad;
      ctx.fillRect(sp.sx - streakW, sp.sy - 3, streakW * 2, 6);

      const dx = cx - sp.sx, dy = cy - sp.sy;
      for (const [t, rad, col] of [
        [0.45, 22, `rgba(255, 220, 150, ${(0.13 * strength).toFixed(3)})`],
        [0.88, 36, `rgba(140, 220, 255, ${(0.10 * strength).toFixed(3)})`],
        [1.35, 16, `rgba(255, 180, 120, ${(0.12 * strength).toFixed(3)})`]
      ]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sp.sx + dx * t, sp.sy + dy * t, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawVerticalTape(ctx, x, cy, halfH, val, step, pxPerUnit, alignRight, unitLabel) {
      ctx.save();
      const boxW = 54;
      const left = alignRight ? x - boxW : x;
      ctx.fillStyle = "rgba(8, 13, 20, 0.44)";
      ctx.fillRect(left, cy - halfH, boxW, halfH * 2);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const spineX = alignRight ? x - boxW : x + boxW;
      ctx.moveTo(spineX, cy - halfH);
      ctx.lineTo(spineX, cy + halfH);
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(left, cy - halfH, boxW, halfH * 2);
      ctx.clip();

      const first = Math.floor((val - halfH / pxPerUnit) / step) * step;
      const last = Math.ceil((val + halfH / pxPerUnit) / step) * step;
      ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
      ctx.strokeStyle = "rgba(226, 232, 240, 0.48)";

      for (let v = first; v <= last; v += step) {
        if (v < 0 && !alignRight) continue;
        const py = cy - (v - val) * pxPerUnit;
        const isMajor = Math.round(v / step) % 2 === 0;
        const tickLen = isMajor ? 8 : 4;
        ctx.beginPath();
        if (alignRight) {
          ctx.moveTo(spineX, py); ctx.lineTo(spineX + tickLen, py);
        } else {
          ctx.moveTo(spineX, py); ctx.lineTo(spineX - tickLen, py);
        }
        ctx.stroke();
        if (isMajor) {
          ctx.textAlign = alignRight ? "right" : "left";
          ctx.fillText(String(Math.round(v)), alignRight ? x - 5 : x + 5, py + 3);
        }
      }
      ctx.restore();

      // Center digital readout box
      ctx.save();
      ctx.fillStyle = "rgba(9, 16, 26, 0.88)";
      ctx.strokeStyle = "rgba(34, 211, 238, 0.75)";
      ctx.lineWidth = 1.3;
      ctx.fillRect(left - 2, cy - 11, boxW + 4, 22);
      ctx.strokeRect(left - 2, cy - 11, boxW + 4, 22);
      ctx.fillStyle = "#ecfeff";
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(alignRight ? val.toFixed(1) : String(Math.round(val)), left + boxW * 0.5, cy + 4);
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "#67e8f9";
      ctx.fillText(unitLabel, left + boxW * 0.5, cy - halfH - 5);
      ctx.restore();
    }

    drawProximityRadar(ctx, cx, cy, r, sim, tel) {
      ctx.save();
      ctx.fillStyle = "rgba(8, 15, 24, 0.62)";
      ctx.strokeStyle = "rgba(34, 211, 238, 0.38)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Forward cone
      ctx.strokeStyle = "rgba(34, 211, 238, 0.25)";
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - r * 0.55, cy - r * 0.82);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.55, cy - r * 0.82);
      ctx.stroke();

      const hdgRad = (tel.headingDeg * Math.PI) / 180;
      const cosH = Math.cos(hdgRad), sinH = Math.sin(hdgRad);
      const maxRange = 280.0;

      const toRadar = (wx, wz) => {
        const dx = wx - tel.pos[0], dz = wz - tel.pos[2];
        // Drone forward is [sin(hdg), -cos(hdg)], right is [cos(hdg), sin(hdg)]
        const fwd = dx * sinH - dz * cosH;
        const right = dx * cosH + dz * sinH;
        const dist = Math.hypot(fwd, right);
        const clampR = Math.min(r - 4, (dist / maxRange) * (r - 4));
        const ang = Math.atan2(right, fwd);
        return { rx: cx + Math.sin(ang) * clampR, ry: cy - Math.cos(ang) * clampR, dist };
      };

      // Ghost Drone blip
      if (sim.ghostDrone && sim.ghostDrone.enabled && sim.ghostDrone.active) {
        const gp = toRadar(sim.ghostDrone.pos[0], sim.ghostDrone.pos[2]);
        if (gp.dist < maxRange * 1.4) {
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath(); ctx.arc(gp.rx, gp.ry, 3.0, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Ground vehicles within range
      if (this.actors && this.actors.vehicles) {
        ctx.fillStyle = "#f59e0b";
        for (const v of this.actors.vehicles) {
          const vp = toRadar(v.x, v.z);
          if (vp.dist < maxRange) {
            ctx.fillRect(vp.rx - 1.6, vp.ry - 1.6, 3.2, 3.2);
          }
        }
      }

      // 5 Piston Biplanes with directional chevrons
      if (this.actors && this.actors.aircraft) {
        for (const ac of this.actors.aircraft) {
          const ap = toRadar(ac.x, ac.z);
          if (ap.dist < maxRange * 1.35) {
            const relYaw = Math.atan2(Math.sin(ac.yaw), Math.cos(ac.yaw)) - hdgRad;
            ctx.save();
            ctx.translate(ap.rx, ap.ry);
            ctx.rotate(Math.PI - relYaw);
            ctx.fillStyle = ap.dist < 65 ? "#f43f5e" : "#38bdf8";
            ctx.beginPath();
            ctx.moveTo(0, -4.5); ctx.lineTo(3.4, 3.5); ctx.lineTo(0, 1.8); ctx.lineTo(-3.4, 3.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Ownship center dot
      ctx.fillStyle = "#10b981";
      ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "rgba(167, 243, 208, 0.85)";
      ctx.textAlign = "center";
      ctx.fillText("RADAR 280m", cx, cy + r + 11);
      ctx.restore();
    }

    renderHUD(sim, tel, mvp, eye, camFwd, theme, dt) {
      const ctx = this.ctx2d;
      const w = this.width, h = this.height, cx = w * 0.5, cy = h * 0.5;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 0a. Optical Sun Lens Flare
      this.renderSunLensFlare(ctx, mvp, eye, camFwd, theme, w, h);

      // GoPro Pure Cinema Mode: 100% clean photorealistic footage without HUD or artificial wind lines
      if (this.cinemaMode) { ctx.restore(); return; }

      // 0b. High-Speed Optical Flow Wind Streaks
      if (this.cameraMode !== "ORBIT" && this.cameraMode !== "GROUND" && tel.speedKmh > 48) {
        const intensity = Math.min(1, (tel.speedKmh - 48) / 110);
        const maxR = Math.hypot(cx, cy);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.20 * intensity).toFixed(3)})`;
        ctx.lineWidth = 1.25;
        for (const st of this.speedStreaks) {
          st.phase = (st.phase + dt * (1.4 + intensity * 2.8)) % 1;
          const r0 = maxR * (0.30 + st.phase * 0.63);
          const r1 = r0 + (24 + intensity * 68);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(st.angle) * r0, cy + Math.sin(st.angle) * r0);
          ctx.lineTo(cx + Math.cos(st.angle) * r1, cy + Math.sin(st.angle) * r1);
          ctx.stroke();
        }
      }

      if (!this.showOsd) { ctx.restore(); return; }

      ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.shadowColor = "rgba(0, 0, 0, 0.82)";
      ctx.shadowBlur = 4;

      // 1. Dynamic Proximity Avoidance Marker on Ground Vehicles / Pedestrians / Aircraft
      if (tel.proximityAlert) {
        const pa = tel.proximityAlert;
        const p = projectPoint(mvp, pa.x, pa.y + 1.2, pa.z, w, h);
        const alertColor = pa.level === "DANGER" ? "#ef4444" : "#f59e0b";
        if (!p.behind && p.sx > 24 && p.sx < w - 24 && p.sy > 56 && p.sy < h - 24) {
          ctx.strokeStyle = alertColor;
          ctx.lineWidth = 2.0;
          ctx.strokeRect(p.sx - 16, p.sy - 16, 32, 32);
          ctx.fillStyle = alertColor;
          ctx.textAlign = "center";
          ctx.fillText(`⚠ 避让${pa.kind} ${Math.round(pa.dist)}m`, p.sx, p.sy - 22);
        }
        ctx.textAlign = "center";
        ctx.fillStyle = alertColor;
        ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillText(
          pa.level === "DANGER"
            ? `⚠ 危险接近${pa.kind} (${pa.dist.toFixed(1)}m) · 已触发安全避让!`
            : `⚠ 注意避让附近${pa.kind} (${pa.dist.toFixed(1)}m)`,
          cx,
          Math.min(cy + 88, h - 242)
        );
        ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      }

      // 2. Holographic Ghost Drone 3D On-Screen Tag
      if (sim.ghostDrone && sim.ghostDrone.enabled && sim.ghostDrone.active) {
        const gp = sim.ghostDrone.pos;
        const distG = Math.hypot(gp[0] - tel.pos[0], gp[1] - tel.pos[1], gp[2] - tel.pos[2]);
        if (distG > 2.2 && distG < 420) {
          const projG = projectPoint(mvp, gp[0], gp[1] + 1.1, gp[2], w, h);
          if (!projG.behind && projG.sx > 30 && projG.sx < w - 30 && projG.sy > 55 && projG.sy < h - 30) {
            const gCol = sim.ghostDrone.isPersonalBest ? "#fbbf24" : "#22d3ee";
            ctx.fillStyle = gCol;
            ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`GHOST ${Math.round(distG)}m`, projG.sx, projG.sy - 6);
          }
        }
      }

      // 3. Flight-Path Velocity Vector (-o-)
      if (this.cameraMode === "FPV" && tel.speedKmh > 12) {
        const vp = projectPoint(mvp, sim.pos[0] + sim.vel[0] * 1.5, sim.pos[1] + sim.vel[1] * 1.5, sim.pos[2] + sim.vel[2] * 1.5, w, h);
        if (!vp.behind && vp.sx > 24 && vp.sx < w - 24 && vp.sy > 56 && vp.sy < h - 24) {
          ctx.strokeStyle = "rgba(34, 211, 238, 0.88)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(vp.sx, vp.sy, 5, 0, Math.PI * 2);
          ctx.moveTo(vp.sx - 12, vp.sy); ctx.lineTo(vp.sx - 5, vp.sy);
          ctx.moveTo(vp.sx + 5, vp.sy); ctx.lineTo(vp.sx + 12, vp.sy);
          ctx.moveTo(vp.sx, vp.sy - 5); ctx.lineTo(vp.sx, vp.sy - 10);
          ctx.stroke();
        }
      }

      // 4. Active Target Indicator (WP or Gate)
      const drawTargetMarker = (tx, ty, tz, label, color) => {
        const distM = Math.round(Math.hypot(tx - tel.pos[0], ty - tel.pos[1], tz - tel.pos[2]));
        const p = projectPoint(mvp, tx, ty, tz, w, h);
        if (!p.behind && p.sx > 36 && p.sx < w - 36 && p.sy > 68 && p.sy < h - 36) {
          ctx.strokeStyle = color; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(p.sx, p.sy - 15); ctx.lineTo(p.sx + 15, p.sy); ctx.lineTo(p.sx, p.sy + 15); ctx.lineTo(p.sx - 15, p.sy); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(`${label} · ${distM}m`, p.sx, p.sy - 21);
        } else {
          const dx = p.behind ? -(p.sx - cx) : p.sx - cx, dy = p.behind ? -(p.sy - cy) : p.sy - cy, ang = Math.atan2(dy, dx);
          const ex = cx + Math.cos(ang) * Math.min(w * 0.40, 225), ey = cy + Math.sin(ang) * Math.min(h * 0.32, 155);
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang); ctx.fillStyle = color;
          ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -6); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill(); ctx.restore();
          ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(`${label} ${distM}m`, ex, ey - 12);
        }
      };

      if (sim.autopilotMode === "MISSION" && sim.waypoints.length > 0) {
        const wp = sim.waypoints[sim.activeWpIdx];
        drawTargetMarker(wp.x, Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(wp.x, wp.z)) + wp.agl, wp.z, `WP${sim.activeWpIdx + 1}`, "#34d399");
      } else if (this.gates.length > 0) {
        const g = this.gates[tel.activeGateIdx];
        drawTargetMarker(g.x, g.y, g.z, `G${String(tel.activeGateIdx + 1).padStart(2, "0")}`, "#22d3ee");
      }

      // 5. DJI O3 Artificial Horizon & Pitch Ladder (-30..+30 deg)
      const hudCenterY = Math.min(cy, h * 0.43);
      if (this.cameraMode !== "ORBIT") {
        ctx.save();
        ctx.translate(cx, hudCenterY);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(-5, 0);
        ctx.moveTo(5, 0); ctx.lineTo(15, 0);
        ctx.moveTo(0, -9); ctx.lineTo(0, -4);
        ctx.stroke();

        const tiltOff = this.cameraMode === "FPV" ? (sim.preset.camTiltDeg * Math.PI) / 180 : 0;
        const pitchDeg = ((tel.pitchRad + tiltOff) * 180) / Math.PI;
        ctx.rotate(-tel.rollRad);
        ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillStyle = "rgba(167, 243, 208, 0.82)";

        for (const rung of [-30, -20, -10, 0, 10, 20, 30]) {
          const py = (pitchDeg - rung) * 3.1;
          if (Math.abs(py) > 92) continue;
          if (rung === 0) {
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-68, py); ctx.lineTo(-22, py);
            ctx.moveTo(22, py); ctx.lineTo(68, py);
            ctx.stroke();
          } else {
            ctx.setLineDash(rung < 0 ? [4, 4] : []);
            ctx.strokeStyle = "rgba(167, 243, 208, 0.55)";
            ctx.lineWidth = 1.2;
            const tip = rung > 0 ? 5 : -5;
            ctx.beginPath();
            ctx.moveTo(-42, py); ctx.lineTo(-18, py); ctx.lineTo(-18, py + tip);
            ctx.moveTo(42, py); ctx.lineTo(18, py); ctx.lineTo(18, py + tip);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.textAlign = "right";
            ctx.fillText(String(rung), -45, py + 3);
          }
        }
        ctx.restore();
      }

      // 6. Left Airspeed Tape & Right Altitude + Variometer Tape (compact around HUD center, clear of GCS & RC Controller)
      if (w > 640 && this.cameraMode !== "ORBIT") {
        const tapeOffset = Math.min(205, w * 0.22);
        this.drawVerticalTape(ctx, cx - tapeOffset - 54, hudCenterY, 68, tel.speedKmh, 20, 1.35, false, "SPD km/h");
        this.drawVerticalTape(ctx, cx + tapeOffset + 54, hudCenterY, 68, tel.aglM, 10, 2.2, true, "AGL m");

        // Variometer V/S vertical bar next to Altitude tape
        const vsX = cx + tapeOffset + 60;
        const vsClamp = Math.max(-20, Math.min(20, tel.vSpeed));
        const barH = (vsClamp / 20) * 62;
        ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
        ctx.fillRect(vsX, hudCenterY - 64, 5, 128);
        ctx.fillStyle = tel.vSpeed >= 0 ? "#34d399" : "#f59e0b";
        ctx.fillRect(vsX, barH >= 0 ? hudCenterY - barH : hudCenterY, 5, Math.abs(barH));

        // 4-Motor Output & Temperature Mini-Badge under Left Tape
        const mTop = hudCenterY + 82;
        ctx.fillStyle = "rgba(8, 14, 22, 0.62)";
        ctx.fillRect(cx - tapeOffset - 56, mTop, 108, 30);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
        ctx.strokeRect(cx - tapeOffset - 56, mTop, 108, 30);
        const maxTemp = tel.motorTempsC ? Math.round(Math.max(...tel.motorTempsC)) : 34;
        for (let m = 0; m < 4; m++) {
          const out = tel.motors ? tel.motors[m] : 0;
          const bx = cx - tapeOffset - 50 + m * 13;
          ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
          ctx.fillRect(bx, mTop + 5, 8, 20);
          const mh = Math.round(out * 20);
          ctx.fillStyle = out > 0.85 ? "#f59e0b" : "#22d3ee";
          ctx.fillRect(bx, mTop + 25 - mh, 8, mh);
        }
        ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.fillStyle = maxTemp > 72 ? "#fca5a5" : "#cbd5e1";
        ctx.textAlign = "left";
        ctx.fillText(`${maxTemp}°C`, cx - tapeOffset + 6, mTop + 14);
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`${tel.gForce.toFixed(1)}G`, cx - tapeOffset + 6, mTop + 26);

        // DJI O3 HD Link & LiPo Pack Badge under Right Tape
        const vTop = hudCenterY + 82;
        ctx.fillStyle = "rgba(8, 14, 22, 0.62)";
        ctx.fillRect(cx + tapeOffset - 42, vTop, 108, 30);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
        ctx.strokeRect(cx + tapeOffset - 42, vTop, 108, 30);
        const mbps = tel.vtxMbps !== undefined ? tel.vtxMbps : 50.0;
        ctx.fillStyle = mbps < 20 ? "#f59e0b" : "#34d399";
        ctx.textAlign = "right";
        ctx.fillText(`O3 ${mbps.toFixed(1)}Mbps`, cx + tapeOffset + 61, vTop + 13);
        ctx.fillStyle = tel.cellVoltage < 3.55 ? "#fca5a5" : "#edf2f7";
        ctx.fillText(`${tel.packVoltage.toFixed(1)}V ${(tel.amps || 0).toFixed(0)}A`, cx + tapeOffset + 61, vTop + 26);
      }

      // 7. Top Scrolling Compass Tape + Home Caret
      const tapeY = 54;
      const tapeW = 268;
      ctx.save();
      ctx.fillStyle = "rgba(9, 15, 24, 0.66)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.fillRect(cx - tapeW * 0.5, tapeY - 14, tapeW, 24);
      ctx.strokeRect(cx - tapeW * 0.5, tapeY - 14, tapeW, 24);
      ctx.beginPath();
      ctx.rect(cx - tapeW * 0.5 + 2, tapeY - 14, tapeW - 4, 24);
      ctx.clip();

      const cardinals = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
      const pxPerDeg = 2.4;
      const baseDeg = Math.floor(tel.headingDeg / 15) * 15;
      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      for (let d = baseDeg - 60; d <= baseDeg + 60; d += 15) {
        let diff = d - tel.headingDeg;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        const tx = cx + diff * pxPerDeg;
        const normD = ((d % 360) + 360) % 360;
        const lbl = cardinals[normD];
        ctx.fillStyle = normD === 0 ? "#f87171" : lbl ? "#e2e8f0" : "rgba(148, 163, 184, 0.65)";
        if (lbl) ctx.fillText(lbl, tx, tapeY + 2);
        else ctx.fillRect(tx - 0.5, tapeY - 4, 1, 6);
      }

      // Home H caret on compass tape
      let homeDiffDeg = ((tel.homeRelBearing * 180) / Math.PI);
      while (homeDiffDeg > 180) homeDiffDeg -= 360;
      while (homeDiffDeg < -180) homeDiffDeg += 360;
      const hx = Math.max(cx - tapeW * 0.46, Math.min(cx + tapeW * 0.46, cx + homeDiffDeg * pxPerDeg));
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`⌂${Math.round(tel.homeDistM)}m`, hx, tapeY - 4);
      ctx.restore();

      // Center heading caret
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.moveTo(cx, tapeY + 10); ctx.lineTo(cx - 4, tapeY + 15); ctx.lineTo(cx + 4, tapeY + 15);
      ctx.closePath();
      ctx.fill();

      // 8. Animated Freestyle Trick Callout & Combo Banner
      if (this.trickPopup || (tel.comboTimer > 0 && tel.comboMult > 1.0)) {
        const popY = Math.max(88, hudCenterY - 88);
        ctx.save();
        ctx.textAlign = "center";
        if (this.trickPopup) {
          const fade = 1.0 - Math.max(0, (this.trickPopup.age - 1.5) / 0.7);
          ctx.globalAlpha = Math.max(0, Math.min(1, fade));
          ctx.font = "800 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          ctx.fillStyle = "#fbbf24";
          ctx.fillText(`★ ${this.trickPopup.name}  +${this.trickPopup.pts}`, cx, popY);
        }
        if (tel.comboTimer > 0) {
          ctx.globalAlpha = 0.92;
          ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          ctx.fillStyle = "#67e8f9";
          ctx.fillText(`FREESTYLE ${tel.freestyleScore} PTS · COMBO ×${tel.comboMult.toFixed(1)}`, cx, popY + 16);
          const barW = 128;
          ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
          ctx.fillRect(cx - barW * 0.5, popY + 21, barW, 3);
          ctx.fillStyle = "#22d3ee";
          ctx.fillRect(cx - barW * 0.5, popY + 21, barW * Math.min(1, tel.comboTimer / 5.5), 3);
        }
        ctx.restore();
      }

      // 9. Top-Right Race Timing, Ghost Split Delta, Freestyle Score & Airspace Radar
      const rightX = w - 18, topY = 50;
      ctx.textAlign = "right";
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      if (tel.autopilotMode === "MISSION") {
        ctx.fillStyle = "#34d399";
        ctx.fillText(`AUTO MISSION · WP ${tel.activeWpIdx + 1}/${tel.totalWps}`, rightX, topY);
      } else if (tel.autopilotMode === "RTH") {
        ctx.fillStyle = "#f59e0b";
        ctx.fillText("AUTO RTH · 正在自动返航", rightX, topY);
      } else {
        ctx.fillStyle = "#22d3ee";
        ctx.fillText(`GATE ${String(tel.activeGateIdx + 1).padStart(2, "0")}/${tel.totalGates} · LAP ${tel.lapCount + 1}`, rightX, topY);
      }

      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`LAP ${formatRaceTime(tel.currentLapMs)} · BEST ${formatRaceTime(tel.bestLapMs)}`, rightX, topY + 17);

      if (tel.lastSplitDeltaMs !== null && tel.lastSplitDeltaMs !== undefined) {
        const ahead = tel.lastSplitDeltaMs <= 0;
        const sign = ahead ? "" : "+";
        ctx.fillStyle = ahead ? "#34d399" : "#fb7185";
        ctx.fillText(`GHOST Δ ${sign}${(tel.lastSplitDeltaMs / 1000).toFixed(2)}s`, rightX, topY + 34);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`FREESTYLE ${tel.freestyleScore || 0} PTS`, rightX, topY + 34);
      }

      if (w > 780 && h > 520) {
        this.drawProximityRadar(ctx, w - 58, topY + 86, 36, sim, tel);
      }

      // 10. Status Prompts (Disarmed / Collision)
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const promptY = Math.min(hudCenterY + 56, h - 245);
      if (!tel.armed) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#fca5a5";
        ctx.fillText("DISARMED · 已上锁 (拨动 SA 或按 SPACE 解锁起飞)", cx, promptY);
      } else if (tel.crashActive) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`COLLISION · 碰撞 [${tel.lastImpactLabel || "障碍物"}] (按 T 回正 / R 复位)`, cx, promptY);
      }
      ctx.restore();
    }
  }

  global.FPVRenderer = { FPVSceneRenderer };
})(window);
