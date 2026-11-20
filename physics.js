// AeroVeloce FPV — 480Hz Sub-Stepped 6-DOF Aero + Betaflight AirMode + Ghost Drone + Freestyle Combo Engine
(function (global) {
  "use strict";

  const DRONE_PRESETS = {
    freestyle: {
      id: "freestyle",
      name: '5" 花飞穿越机',
      mass: 0.65,
      maxThrust: 40.5,
      dragLinear: 0.046,
      discDragMult: 2.85,
      rateResp: 28,
      camTiltDeg: 24,
      fovDeg: 108,
      maxRateDeg: 640,
      expo: 0.42,
      cells: 6
    },
    racing: {
      id: "racing",
      name: '5" 竞速穿越机',
      mass: 0.52,
      maxThrust: 46.5,
      dragLinear: 0.033,
      discDragMult: 3.15,
      rateResp: 36,
      camTiltDeg: 34,
      fovDeg: 116,
      maxRateDeg: 800,
      expo: 0.35,
      cells: 6
    },
    cinewhoop: {
      id: "cinewhoop",
      name: '3" 涵道航拍机',
      mass: 0.44,
      maxThrust: 19.8,
      dragLinear: 0.095,
      discDragMult: 2.35,
      rateResp: 22,
      camTiltDeg: 12,
      fovDeg: 96,
      maxRateDeg: 360,
      expo: 0.55,
      cells: 4
    },
    longrange: {
      id: "longrange",
      name: '7" 远航测绘机',
      mass: 1.05,
      maxThrust: 49.0,
      dragLinear: 0.040,
      discDragMult: 2.65,
      rateResp: 19,
      camTiltDeg: 18,
      fovDeg: 102,
      maxRateDeg: 460,
      expo: 0.48,
      cells: 6
    }
  };

  function quatNormalize(q) {
    const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= len; q[1] /= len; q[2] /= len; q[3] /= len;
    return q;
  }

  function quatMultiply(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
  }

  function quatSlerp(a, b, t) {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let cosom = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (cosom < 0) {
      cosom = -cosom;
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    let s0, s1;
    if (1.0 - cosom > 1e-4) {
      const omega = Math.acos(Math.min(1, cosom));
      const sinom = Math.sin(omega);
      s0 = Math.sin((1.0 - t) * omega) / sinom;
      s1 = Math.sin(t * omega) / sinom;
    } else {
      s0 = 1.0 - t;
      s1 = t;
    }
    return quatNormalize([
      s0 * a[0] + s1 * bx,
      s0 * a[1] + s1 * by,
      s0 * a[2] + s1 * bz,
      s0 * a[3] + s1 * bw
    ]);
  }

  function quatFromBasis(right, up, back) {
    // Columns of rotation matrix: right=[m00,m10,m20], up=[m01,m11,m21], back=[m02,m12,m22]
    const m00 = right[0], m10 = right[1], m20 = right[2];
    const m01 = up[0],    m11 = up[1],    m21 = up[2];
    const m02 = back[0],  m12 = back[1],  m22 = back[2];
    const tr = m00 + m11 + m22;
    let qw, qx, qy, qz;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1.0) * 2;
      qw = 0.25 * s;
      qx = (m21 - m12) / s;
      qy = (m02 - m20) / s;
      qz = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      qw = (m21 - m12) / s;
      qx = 0.25 * s;
      qy = (m01 + m10) / s;
      qz = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      qw = (m02 - m20) / s;
      qx = (m01 + m10) / s;
      qy = 0.25 * s;
      qz = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      qw = (m10 - m01) / s;
      qx = (m02 + m20) / s;
      qy = (m12 + m21) / s;
      qz = 0.25 * s;
    }
    return quatNormalize([qw, qx, qy, qz]);
  }

  function quatRotateVec(q, v) {
    const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
    const vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    return [
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx)
    ];
  }

  function quatInvRotateVec(q, v) {
    return quatRotateVec([q[0], -q[1], -q[2], -q[3]], v);
  }

  function applyRates(stick, maxRateDeg, expo) {
    const s = Math.max(-1, Math.min(1, stick));
    const absS = Math.abs(s);
    return Math.sign(s) * (absS * (1 - expo) + Math.pow(absS, 3) * expo) * maxRateDeg;
  }

  function wrapAngleRad(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Synthesize a smooth Catmull-Rom benchmark Ghost Drone lap through all course gates
  function buildProBenchmarkGhost(gates) {
    if (!gates || gates.length < 3) return { durationMs: 56000, frames: [], gateSplitsMs: [] };
    const n = gates.length;
    const pts = gates.map((g) => [g.x, g.y, g.z]);
    // Compute chord lengths
    const segDists = [];
    let totalDist = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      segDists.push(d);
      totalDist += d;
    }
    const avgProSpeedMs = 31.5; // ~113 km/h pro pace
    const durationSec = totalDist / avgProSpeedMs;
    const durationMs = Math.round(durationSec * 1000);
    const sampleHz = 20;
    const totalSamples = Math.max(40, Math.round(durationSec * sampleHz));

    // Cumulative gate split times
    const gateSplitsMs = [];
    let accDist = 0;
    for (let i = 0; i < n; i++) {
      accDist += segDists[i];
      gateSplitsMs.push(Math.round((accDist / totalDist) * durationMs));
    }

    const catmull = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return [0, 1, 2].map((k) =>
        0.5 * (
          (2 * p1[k]) +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
        )
      );
    };

    const evalPos = (uNorm) => {
      const targetD = (((uNorm % 1) + 1) % 1) * totalDist;
      let dSum = 0, segIdx = 0;
      for (let i = 0; i < n; i++) {
        if (targetD <= dSum + segDists[i] || i === n - 1) { segIdx = i; break; }
        dSum += segDists[i];
      }
      const localT = Math.max(0, Math.min(1, (targetD - dSum) / (segDists[segIdx] || 1)));
      const p0 = pts[(segIdx - 1 + n) % n];
      const p1 = pts[segIdx];
      const p2 = pts[(segIdx + 1) % n];
      const p3 = pts[(segIdx + 2) % n];
      const pos = catmull(p0, p1, p2, p3, localT);
      const gy = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(pos[0], pos[2]));
      if (pos[1] < gy + 2.4) pos[1] = gy + 2.4;
      return pos;
    };

    const frames = [];
    for (let s = 0; s < totalSamples; s++) {
      const u = s / totalSamples;
      const pPrev = evalPos(u - 0.008);
      const pCurr = evalPos(u);
      const pNext = evalPos(u + 0.008);

      const vx = (pNext[0] - pPrev[0]) / (0.016 * durationSec);
      const vy = (pNext[1] - pPrev[1]) / (0.016 * durationSec);
      const vz = (pNext[2] - pPrev[2]) / (0.016 * durationSec);
      const ax = (pNext[0] - 2 * pCurr[0] + pPrev[0]) / Math.pow(0.008 * durationSec, 2);
      const az = (pNext[2] - 2 * pCurr[2] + pPrev[2]) / Math.pow(0.008 * durationSec, 2);

      const vLen = Math.hypot(vx, vy, vz) || 1;
      // Forward is -Z in drone frame, so back (+Z) is -velDir
      const fwd = [vx / vLen, vy / vLen, vz / vLen];
      const back = [-fwd[0], -fwd[1], -fwd[2]];
      // Banked up vector aligned with centripetal + gravity thrust vector + 24deg pitch-down nose
      const thrustUp = [ax * 0.055, 9.81, az * 0.055];
      let rx = thrustUp[1] * back[2] - thrustUp[2] * back[1];
      let ry = thrustUp[2] * back[0] - thrustUp[0] * back[2];
      let rz = thrustUp[0] * back[1] - thrustUp[1] * back[0];
      const rLen = Math.hypot(rx, ry, rz) || 1;
      const right = [rx / rLen, ry / rLen, rz / rLen];
      const up = [
        back[1] * right[2] - back[2] * right[1],
        back[2] * right[0] - back[0] * right[2],
        back[0] * right[1] - back[1] * right[0]
      ];
      // Pitch nose down 22 deg for realistic forward FPV quad attitude
      const baseQ = quatFromBasis(right, up, back);
      const tiltQ = [Math.cos(-0.19), Math.sin(-0.19), 0, 0];
      frames.push({
        tMs: Math.round(u * durationMs),
        pos: pCurr,
        quat: quatMultiply(baseQ, tiltQ)
      });
    }
    return { durationMs, frames, gateSplitsMs, isPersonalBest: false };
  }

  class DroneSimulator {
    constructor(gates, colliders, actors) {
      this.gates = gates || [];
      this.colliders = colliders || [];
      this.actors = actors || { vehicles: [], pedestrians: [], aircraft: [] };
      this.preset = { ...DRONE_PRESETS.freestyle };
      this.mode = "ANGLE";       // "ANGLE" | "HORIZON" | "ACRO"
      this.altHold = true;
      this.airMode = true;
      this.windSpeed = 2.2;
      this.propPhase = 0;

      // GCS 3D Waypoint Mission & Autopilot State
      this.autopilotMode = "MANUAL"; // "MANUAL" | "MISSION" | "RTH"
      this.waypoints = [];           // [{ x, z, agl, speed }]
      this.activeWpIdx = 0;
      this.missionLoop = true;
      this.lastMissionEvent = null;

      // Dynamic Traffic & Aircraft Avoidance State
      this.proximityAlert = null;
      this.lastAvoidEvent = null;
      this.lastCrashEvent = null;
      this.lastFlybyEvent = null;

      // Race Circuit + Holographic Ghost Drone State
      this.activeGateIdx = 0;
      this.lapCount = 0;
      this.lapStartTime = 0;
      this.currentLapMs = 0;
      this.bestLapMs = null;
      this.lastSplitDeltaMs = null;
      this.lastGateEvent = null;
      this.lastImpactLabel = "";

      this.ghostRecord = buildProBenchmarkGhost(this.gates);
      this.currentLapFrames = [];
      this.currentGateSplitsMs = [];
      this._ghostSampleAccum = 0;
      this.ghostDrone = { enabled: true, active: true, pos: [0, 4, -48], quat: [1, 0, 0, 0], propPhase: 0, trail: [], isPersonalBest: false };

      // Freestyle Trick & Proximity Combo Scoring System
      this.freestyleScore = 0;
      this.comboMult = 1.0;
      this.comboTimer = 0;
      this.lastTrickEvent = null;
      this._trickRollAcc = 0;
      this._trickPitchAcc = 0;
      this._invertedTimer = 0;
      this._proxCooldown = 0;
      this._flybyCooldown = 0;

      // Digital HD VTX Signal & Motor Thermal State
      this.vtxMbps = 50.0;
      this.vtxGlitch = 0.0;
      this.motorTempsC = [34, 34, 34, 34];

      this.trail = [];
      this.flightPathHistory = [];
      this.reset();
    }

    applyPreset(presetId) {
      const base = DRONE_PRESETS[presetId] || DRONE_PRESETS.freestyle;
      this.preset = { ...base };
      this.cells = base.cells;
    }

    setWaypoints(wps) {
      this.waypoints = (wps || []).map((w) => ({
        x: Number(w.x) || 0,
        z: Number(w.z) || 0,
        agl: Math.max(4, Math.min(180, Number(w.agl) || 20)),
        speed: Math.max(5, Math.min(42, Number(w.speed) || 18))
      }));
      this.activeWpIdx = 0;
    }

    startMission() {
      if (this.waypoints.length === 0) return false;
      this.armed = true;
      this.autopilotMode = "MISSION";
      if (this.activeWpIdx >= this.waypoints.length) this.activeWpIdx = 0;
      return true;
    }

    startRTH() {
      this.armed = true;
      this.autopilotMode = "RTH";
    }

    cancelAutopilot() {
      this.autopilotMode = "MANUAL";
    }

    awardTrick(name, basePts, nowMs) {
      const pts = Math.round(basePts * this.comboMult);
      this.freestyleScore += pts;
      this.comboMult = Math.min(8.0, +(this.comboMult + 0.5).toFixed(1));
      this.comboTimer = 6.5;
      this.lastTrickEvent = { name, pts, combo: this.comboMult, total: this.freestyleScore, time: nowMs || performance.now() };
    }

    reset() {
      const ground0 = global.FPVWorld.getTerrainHeight(0, 0);
      this.pos = [0, ground0 + 3.4, 0];
      this.vel = [0, 0, 0];
      this.quat = [1, 0, 0, 0];
      this.omega = [0, 0, 0];
      this.armed = true;
      this.crashTimer = 0;
      this.lastImpactLabel = "";
      this.autopilotMode = "MANUAL";

      this.throttleOut = 0.34;
      this.manualThrottle = 0.36;
      this.motors = [0.34, 0.34, 0.34, 0.34];
      this.motorTargets = [0.34, 0.34, 0.34, 0.34];
      this.motorTempsC = [34, 34, 34, 34];
      this.gForce = 1.0;
      this.propWash = 0.0;
      this.vtxMbps = 50.0;
      this.vtxGlitch = 0.0;

      this.cells = this.preset.cells || 6;
      this.mahUsed = 0;
      this.amps = 4.2;
      this.cellVoltage = 4.20;
      this.flightTimeSec = 0;

      this.activeGateIdx = 0;
      this.lapStartTime = performance.now();
      this.currentLapMs = 0;
      this.lastSplitDeltaMs = null;
      this.currentLapFrames = [];
      this.currentGateSplitsMs = [];
      this._ghostSampleAccum = 0;

      this._trickRollAcc = 0;
      this._trickPitchAcc = 0;
      this._invertedTimer = 0;
      this.comboMult = 1.0;
      this.comboTimer = 0;

      this.trail = [];
      this.flightPathHistory = [[0, 0]];
      this._historyAccum = 0;
    }

    recoverAttitude() {
      const fwd = quatRotateVec(this.quat, [0, 0, -1]);
      const yaw = Math.atan2(-fwd[0], -fwd[2]);
      this.quat = [Math.cos(yaw * 0.5), 0, Math.sin(yaw * 0.5), 0];
      this.omega = [0, 0, 0];
      const gy = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(this.pos[0], this.pos[2]));
      if (this.pos[1] < gy + 2.5) this.pos[1] = gy + 3.2;
      this.vel = [0, 0, 0];
      this.crashTimer = 0;
      this._trickRollAcc = 0;
      this._trickPitchAcc = 0;
    }

    computeAutopilotControls(nowMs) {
      let targetX = 0, targetY = 12, targetZ = 0, targetSpeed = 16;

      if (this.autopilotMode === "MISSION" && this.waypoints.length > 0) {
        const wp = this.waypoints[this.activeWpIdx];
        const gy = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(wp.x, wp.z));
        targetX = wp.x;
        targetY = gy + wp.agl;
        targetZ = wp.z;
        targetSpeed = wp.speed || 18;

        const dist3D = Math.hypot(targetX - this.pos[0], targetY - this.pos[1], targetZ - this.pos[2]);
        if (dist3D < 7.5) {
          const reached = this.activeWpIdx + 1;
          if (this.activeWpIdx + 1 < this.waypoints.length) {
            this.activeWpIdx += 1;
            this.lastMissionEvent = { type: "WP_REACHED", wpNum: reached, total: this.waypoints.length, time: nowMs };
          } else if (this.missionLoop) {
            this.activeWpIdx = 0;
            this.lastMissionEvent = { type: "MISSION_LOOP", wpNum: reached, total: this.waypoints.length, time: nowMs };
          } else {
            this.autopilotMode = "MANUAL";
            this.lastMissionEvent = { type: "MISSION_DONE", wpNum: reached, total: this.waypoints.length, time: nowMs };
          }
        }
      } else if (this.autopilotMode === "RTH") {
        const homeDist = Math.hypot(this.pos[0], this.pos[2]);
        const homeGround = global.FPVWorld.getTerrainHeight(0, 0);
        const localGround = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(this.pos[0], this.pos[2]));
        targetX = 0;
        targetZ = 0;
        if (homeDist > 18) {
          targetY = Math.max(localGround + 32, homeGround + 44);
          targetSpeed = 26;
        } else {
          targetY = homeGround + 4.0;
          targetSpeed = 8;
          if (homeDist < 3.5 && Math.abs(this.pos[1] - targetY) < 2.5) {
            this.autopilotMode = "MANUAL";
            this.lastMissionEvent = { type: "RTH_ARRIVED", time: nowMs };
          }
        }
      }

      const dx = targetX - this.pos[0];
      let dy = targetY - this.pos[1];
      const dz = targetZ - this.pos[2];
      const horizDist = Math.hypot(dx, dz);

      if (this.proximityAlert && this.proximityAlert.dist < 22) {
        const minSafeY = this.proximityAlert.y + 11.5;
        if (targetY < minSafeY) dy = minSafeY - this.pos[1];
      }

      const desiredSpeed = Math.min(targetSpeed, Math.max(2.0, horizDist * 0.72));
      const desVx = horizDist > 0.5 ? (dx / horizDist) * desiredSpeed : 0;
      const desVz = horizDist > 0.5 ? (dz / horizDist) * desiredSpeed : 0;

      const fwd = quatRotateVec(this.quat, [0, 0, -1]);
      const currHeading = Math.atan2(fwd[0], -fwd[2]);
      let yawCmd = 0;
      if (horizDist > 6.0) {
        const targetHeading = Math.atan2(dx, -dz);
        const errYaw = wrapAngleRad(targetHeading - currHeading);
        yawCmd = Math.max(-0.85, Math.min(0.85, errYaw * 1.15));
      }

      const errVx = desVx - this.vel[0];
      const errVz = desVz - this.vel[2];
      const sinH = Math.sin(currHeading), cosH = Math.cos(currHeading);
      const errFwd = errVx * sinH - errVz * cosH;
      const errRight = errVx * cosH + errVz * sinH;

      const pitchCmd = Math.max(-0.92, Math.min(0.92, errFwd * 0.11));
      const rollCmd = Math.max(-0.85, Math.min(0.85, errRight * 0.11));
      const throttleCmd = Math.max(-0.85, Math.min(0.95, dy * 0.16));

      return { throttle: throttleCmd, yaw: yawCmd, pitch: pitchCmd, roll: rollCmd, rawThrottle01: null };
    }

    updateGhostDrone(dt, nowMs) {
      if (this.ghostDrone.enabled === false) {
        this.ghostDrone.active = false;
        return;
      }
      const rec = this.ghostRecord;
      if (!rec || !rec.frames || rec.frames.length < 2) {
        this.ghostDrone.active = false;
        return;
      }
      this.ghostDrone.active = true;
      this.ghostDrone.isPersonalBest = Boolean(rec.isPersonalBest);
      this.ghostDrone.propPhase = ((this.ghostDrone.propPhase || 0) + dt * 95) % (Math.PI * 2);

      // Record player's current lap trajectory at 20 Hz
      this._ghostSampleAccum += dt;
      if (this.armed && this._ghostSampleAccum >= 0.05) {
        this._ghostSampleAccum = 0;
        if (this.currentLapFrames.length < 3600) {
          this.currentLapFrames.push({
            tMs: Math.max(0, Math.round((nowMs || performance.now()) - this.lapStartTime)),
            pos: [this.pos[0], this.pos[1], this.pos[2]],
            quat: [this.quat[0], this.quat[1], this.quat[2], this.quat[3]]
          });
        }
      }

      // Interpolate Ghost Drone pose at current lap elapsed time (looping seamlessly)
      const lapElapsed = Math.max(0, (nowMs || performance.now()) - this.lapStartTime);
      const gTime = lapElapsed % rec.durationMs;
      const frames = rec.frames;
      const approxIdx = Math.min(frames.length - 1, Math.floor((gTime / rec.durationMs) * frames.length));
      let i0 = approxIdx;
      while (i0 > 0 && frames[i0].tMs > gTime) i0--;
      while (i0 + 1 < frames.length && frames[i0 + 1].tMs <= gTime) i0++;
      const i1 = (i0 + 1) % frames.length;
      const f0 = frames[i0], f1 = frames[i1];
      const span = i1 === 0 ? (rec.durationMs - f0.tMs + f1.tMs) : (f1.tMs - f0.tMs);
      const frac = span > 0 ? Math.max(0, Math.min(1, (gTime - f0.tMs) / span)) : 0;

      const gp = [
        f0.pos[0] + (f1.pos[0] - f0.pos[0]) * frac,
        f0.pos[1] + (f1.pos[1] - f0.pos[1]) * frac,
        f0.pos[2] + (f1.pos[2] - f0.pos[2]) * frac
      ];
      const gq = quatSlerp(f0.quat, f1.quat, frac);
      this.ghostDrone.pos = gp;
      this.ghostDrone.quat = gq;

      const lastT = this.ghostDrone.trail[this.ghostDrone.trail.length - 1];
      if (!lastT || Math.hypot(gp[0] - lastT[0], gp[1] - lastT[1], gp[2] - lastT[2]) > 0.85) {
        this.ghostDrone.trail.push([gp[0], gp[1], gp[2]]);
        if (this.ghostDrone.trail.length > 36) this.ghostDrone.trail.shift();
      }
    }

    step(dt, manualControls, nowMs) {
      const clampedDt = Math.min(0.04, Math.max(0.001, dt));
      const now = nowMs || performance.now();

      if (this.crashTimer > 0) this.crashTimer = Math.max(0, this.crashTimer - clampedDt);
      if (this._proxCooldown > 0) this._proxCooldown = Math.max(0, this._proxCooldown - clampedDt);
      if (this._flybyCooldown > 0) this._flybyCooldown = Math.max(0, this._flybyCooldown - clampedDt);
      if (this.comboTimer > 0) {
        this.comboTimer = Math.max(0, this.comboTimer - clampedDt);
        if (this.comboTimer === 0) this.comboMult = 1.0;
      }

      // Instant manual takeover if pilot deflects pitch/roll sticks strongly
      let controls = manualControls;
      let effectiveMode = this.mode;
      let effectiveAltHold = this.altHold;

      if (this.autopilotMode !== "MANUAL") {
        const manualOverride = Math.abs(manualControls.pitch) > 0.35 || Math.abs(manualControls.roll) > 0.35;
        if (manualOverride) {
          this.autopilotMode = "MANUAL";
          this.lastMissionEvent = { type: "MANUAL_TAKEOVER", time: now };
        } else {
          controls = this.computeAutopilotControls(now);
          effectiveMode = "ANGLE";
          effectiveAltHold = true;
        }
      }

      // === 480 Hz FIXED-PRECISION RIGID-BODY & AERODYNAMIC SUB-STEPPING ===
      const subSteps = Math.max(2, Math.min(8, Math.ceil(clampedDt * 480)));
      const subDt = clampedDt / subSteps;
      const deg2rad = Math.PI / 180;
      const gravity = 9.81;
      const windTime = now * 0.001;
      const sagFactor = Math.max(0.76, Math.min(1.02, this.cellVoltage / 4.14));

      let minObstacleDist = 999;

      for (let s = 0; s < subSteps; s++) {
        const prevPos = [this.pos[0], this.pos[1], this.pos[2]];
        const bodyUpWorld = quatRotateVec(this.quat, [0, 1, 0]);
        const worldUpInBody = quatInvRotateVec(this.quat, [0, 1, 0]);
        const groundH = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(this.pos[0], this.pos[2]));
        const agl = Math.max(0, this.pos[1] - groundH);

        // 1. Betaflight SuperExpo Rates + AirMode Attitude PID
        if (this.armed) {
          const yawRateRad = -applyRates(controls.yaw, this.preset.maxRateDeg * 0.72, this.preset.expo) * deg2rad;
          const acroPitchRad = -applyRates(controls.pitch, this.preset.maxRateDeg, this.preset.expo) * deg2rad;
          const acroRollRad = -applyRates(controls.roll, this.preset.maxRateDeg, this.preset.expo) * deg2rad;

          let targetOmega;
          if (effectiveMode === "ACRO") {
            targetOmega = [acroPitchRad, yawRateRad, acroRollRad];
          } else {
            const maxTiltRad = (effectiveMode === "ANGLE" ? 48 : 56) * deg2rad;
            const cmdRoll = controls.roll * maxTiltRad;
            const cmdPitch = controls.pitch * maxTiltRad;

            const tx = -Math.sin(cmdRoll);
            const ty = Math.cos(cmdRoll) * Math.cos(cmdPitch);
            const tz = Math.sin(cmdPitch);
            const tLen = Math.hypot(tx, ty, tz) || 1;
            const ux = tx / tLen, uy = ty / tLen, uz = tz / tLen;

            const kpLevel = 7.8;
            let lx = kpLevel * (uy * worldUpInBody[2] - uz * worldUpInBody[1]);
            let lz = kpLevel * (ux * worldUpInBody[1] - uy * worldUpInBody[0]);
            if (worldUpInBody[1] < -0.25 && Math.hypot(lx, lz) < 1.2) lz += 5.8;

            if (effectiveMode === "ANGLE") {
              targetOmega = [lx, yawRateRad, lz];
            } else {
              const deflection = Math.min(1, Math.max(Math.abs(controls.pitch), Math.abs(controls.roll)));
              const acroMix = Math.pow(deflection, 1.75);
              targetOmega = [
                lx * (1 - acroMix) + acroPitchRad * acroMix,
                yawRateRad,
                lz * (1 - acroMix) + acroRollRad * acroMix
              ];
            }
          }

          // Gentle prop-wash vortex ring buffeting only when dropping steeply into own rotor wake
          const pwJitterX = this.propWash > 0.12 ? Math.sin(windTime * 34.0) * this.propWash * 0.26 : 0;
          const pwJitterZ = this.propWash > 0.12 ? Math.cos(windTime * 41.0) * this.propWash * 0.30 : 0;

          // AirMode keeps full PID authority even at 0% throttle
          const rateResp = (this.preset.rateResp || 28) * (this.airMode ? 1.0 : (0.35 + 0.65 * this.throttleOut));
          const alpha = 1 - Math.exp(-rateResp * subDt);
          this.omega[0] += (targetOmega[0] + pwJitterX - this.omega[0]) * alpha;
          this.omega[1] += (targetOmega[1] - this.omega[1]) * alpha;
          this.omega[2] += (targetOmega[2] + pwJitterZ - this.omega[2]) * alpha;
        } else {
          const damp = Math.exp(-5.5 * subDt);
          this.omega[0] *= damp; this.omega[1] *= damp; this.omega[2] *= damp;
        }

        const dq = quatMultiply(this.quat, [0, this.omega[0], this.omega[1], this.omega[2]]);
        for (let k = 0; k < 4; k++) this.quat[k] += 0.5 * dq[k] * subDt;
        quatNormalize(this.quat);

        // 2. Throttle Command & Brushless ESC Spool-Up / Active Braking Inertia
        const groundEffectBoost = agl < 2.5 ? 1 + Math.pow(1 - agl / 2.5, 1.5) * 0.14 : 1.0;
        if (!this.armed) {
          this.throttleOut = 0;
        } else if (effectiveAltHold && effectiveMode !== "ACRO") {
          const db = Math.abs(controls.throttle) < 0.06 ? 0 : controls.throttle;
          const targetClimb = db * (db > 0 ? 17.0 : 13.0);
          const tiltComp = 1 / Math.max(0.40, bodyUpWorld[1]);
          const neededAccY = gravity + (targetClimb - this.vel[1]) * 4.6;
          const neededThrust = Math.max(0, (this.preset.mass * neededAccY * tiltComp) / (groundEffectBoost * sagFactor));
          this.throttleOut = Math.min(1, Math.max(0.05, Math.pow(neededThrust / this.preset.maxThrust, 1 / 1.24)));
          this.manualThrottle = this.throttleOut;
        } else {
          if (typeof controls.rawThrottle01 === "number") {
            this.manualThrottle = Math.max(0, Math.min(1, controls.rawThrottle01));
          } else {
            this.manualThrottle = Math.max(0, Math.min(1, this.manualThrottle + controls.throttle * 0.88 * subDt));
          }
          this.throttleOut = Math.max(0.045, this.manualThrottle);
        }

        // 4-Motor Betaflight AirMode Mixer + Spool Inertia (tau_up=22ms, tau_down=34ms)
        if (this.armed) {
          const pMix = -this.omega[0] * 0.042;
          const rMix = -this.omega[2] * 0.042;
          const yMix = -this.omega[1] * 0.032;
          let base = this.throttleOut;
          if (this.airMode) {
            const maxMix = Math.max(Math.abs(pMix) + Math.abs(rMix) + Math.abs(yMix), 0);
            if (base - maxMix < 0.05) base = Math.min(0.45, 0.05 + maxMix * 0.65);
          }
          this.motorTargets[0] = Math.max(0.05, Math.min(1, base - pMix - rMix - yMix));
          this.motorTargets[1] = Math.max(0.05, Math.min(1, base + pMix - rMix + yMix));
          this.motorTargets[2] = Math.max(0.05, Math.min(1, base - pMix + rMix + yMix));
          this.motorTargets[3] = Math.max(0.05, Math.min(1, base + pMix + rMix - yMix));
          for (let m = 0; m < 4; m++) {
            const tau = this.motorTargets[m] > this.motors[m] ? 0.022 : 0.034;
            this.motors[m] += (this.motorTargets[m] - this.motors[m]) * (1 - Math.exp(-subDt / tau));
          }
        } else {
          for (let m = 0; m < 4; m++) this.motors[m] *= Math.exp(-subDt / 0.06);
        }

        const spoolAvg = (this.motors[0] + this.motors[1] + this.motors[2] + this.motors[3]) * 0.25;

        // 3. Anisotropic Body-Frame Aerodynamics, Translational Lift & Canyon Wind Gusts
        const altWindScale = 1 + Math.min(0.9, agl / 110);
        const gust = 1 + 0.28 * Math.sin(windTime * 1.3 + this.pos[0] * 0.015);
        const windX = Math.sin(windTime * 0.37) * this.windSpeed * altWindScale * gust;
        const windY = Math.sin(windTime * 0.91 + this.pos[2] * 0.02) * this.windSpeed * 0.14;
        const windZ = Math.cos(windTime * 0.29) * this.windSpeed * 0.65 * altWindScale * gust;

        const relWorld = [this.vel[0] - windX, this.vel[1] - windY, this.vel[2] - windZ];
        const vBody = quatInvRotateVec(this.quat, relWorld); // [right, up(disc-normal), back]
        const horizAirspeed = Math.hypot(vBody[0], vBody[2]);

        // Translational lift peaks smoothly at 14..24 m/s forward airspeed; axial climb inflow slightly decays max thrust
        const transLift = 1.0 + 0.085 * Math.min(1.0, horizAirspeed / 16.0) * Math.exp(-Math.max(0, horizAirspeed - 24) * 0.03);
        const inflowDecay = vBody[1] > 4.0 ? Math.max(0.78, 1.0 - (vBody[1] - 4.0) * 0.008) : 1.0;

        const thrustMag = this.armed
          ? Math.pow(spoolAvg, 1.25) * this.preset.maxThrust * sagFactor * groundEffectBoost * transLift * inflowDecay
          : 0;
        const thrustVec = quatRotateVec(this.quat, [0, thrustMag, 0]);

        // Anisotropic body-frame drag: rotor disc normal (Y) has ~2.85x higher drag than edge-on X/Z -> crisp cornering bite!
        const relSpd = Math.hypot(vBody[0], vBody[1], vBody[2]);
        const baseCd = this.preset.dragLinear * (1 + relSpd * 0.024);
        const discMult = this.preset.discDragMult || 2.85;
        const dragBody = [
          -baseCd * vBody[0],
          -baseCd * discMult * vBody[1],
          -baseCd * vBody[2]
        ];
        const dragWorld = quatRotateVec(this.quat, dragBody);

        this.vel[0] += ((thrustVec[0] + dragWorld[0]) / this.preset.mass) * subDt;
        this.vel[1] += ((thrustVec[1] + dragWorld[1]) / this.preset.mass - gravity) * subDt;
        this.vel[2] += ((thrustVec[2] + dragWorld[2]) / this.preset.mass) * subDt;

        this.pos[0] += this.vel[0] * subDt;
        this.pos[1] += this.vel[1] * subDt;
        this.pos[2] += this.vel[2] * subDt;

        // Prop-wash & G-Force metrics
        const instantG = Math.hypot(thrustVec[0] + dragWorld[0], thrustVec[1] + dragWorld[1], thrustVec[2] + dragWorld[2]) / (this.preset.mass * gravity);
        this.gForce += (instantG - this.gForce) * (1 - Math.exp(-14 * subDt));
        const vortexDescent = (vBody[1] < -5.2 && horizAirspeed < 8.5 && bodyUpWorld[1] > 0.55) ? Math.min(1, (-vBody[1] - 5.2) / 12.0) : 0;
        this.propWash += (vortexDescent - this.propWash) * (1 - Math.exp(-11 * subDt));

        // 4. World Boundary Keep-In (±1150m)
        const maxRange = global.FPVWorld.WORLD_HALF_SIZE;
        if (Math.abs(this.pos[0]) > maxRange) { this.pos[0] = Math.sign(this.pos[0]) * maxRange; this.vel[0] *= -0.4; }
        if (Math.abs(this.pos[2]) > maxRange) { this.pos[2] = Math.sign(this.pos[2]) * maxRange; this.vel[2] *= -0.4; }

        // 5. Full-Scene 3D AABB Obstacle Collision + Angular Tumble Impulse
        const droneR = 0.42;
        for (let ci = 0; ci < this.colliders.length; ci++) {
          const b = this.colliders[ci];
          // Quick proximity distance check for freestyle razor scoring
          const cx = Math.max(b.minX, Math.min(this.pos[0], b.maxX));
          const cy = Math.max(b.minY, Math.min(this.pos[1], b.maxY));
          const cz = Math.max(b.minZ, Math.min(this.pos[2], b.maxZ));
          const dObs = Math.hypot(this.pos[0] - cx, this.pos[1] - cy, this.pos[2] - cz);
          if (dObs < minObstacleDist) minObstacleDist = dObs;

          if (
            this.pos[0] + droneR > b.minX && this.pos[0] - droneR < b.maxX &&
            this.pos[1] + droneR > b.minY && this.pos[1] - droneR < b.maxY &&
            this.pos[2] + droneR > b.minZ && this.pos[2] - droneR < b.maxZ
          ) {
            const impactSpd = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
            const px1 = (this.pos[0] + droneR) - b.minX;
            const px2 = b.maxX - (this.pos[0] - droneR);
            const py1 = (this.pos[1] + droneR) - b.minY;
            const py2 = b.maxY - (this.pos[1] - droneR);
            const pz1 = (this.pos[2] + droneR) - b.minZ;
            const pz2 = b.maxZ - (this.pos[2] - droneR);

            const minPen = Math.min(px1, px2, py1, py2, pz1, pz2);
            if (minPen === px1) { this.pos[0] = b.minX - droneR; this.vel[0] = -Math.abs(this.vel[0]) * 0.46; }
            else if (minPen === px2) { this.pos[0] = b.maxX + droneR; this.vel[0] = Math.abs(this.vel[0]) * 0.46; }
            else if (minPen === py1) { this.pos[1] = b.minY - droneR; this.vel[1] = -Math.abs(this.vel[1]) * 0.46; }
            else if (minPen === py2) { this.pos[1] = b.maxY + droneR; this.vel[1] = Math.abs(this.vel[1]) * 0.36; }
            else if (minPen === pz1) { this.pos[2] = b.minZ - droneR; this.vel[2] = -Math.abs(this.vel[2]) * 0.46; }
            else { this.pos[2] = b.maxZ + droneR; this.vel[2] = Math.abs(this.vel[2]) * 0.46; }

            this.vel[0] *= 0.72; this.vel[2] *= 0.72;
            // Realistic angular tumble impulse on ACRO/HORIZON obstacle clip
            if (impactSpd > 4.5 && this.crashTimer < 0.9) {
              const spinMag = Math.min(14, impactSpd * 0.42);
              this.omega[0] += (Math.sin(now * 0.13) || 0.6) * spinMag;
              this.omega[2] += (Math.cos(now * 0.19) || -0.6) * spinMag;
              this.lastCrashEvent = { speed: impactSpd, label: b.label || "障碍物", time: now };
              this.comboMult = 1.0;
              this.comboTimer = 0;
              this.vtxGlitch = Math.min(1.0, 0.35 + impactSpd * 0.025);
            }
            this.crashTimer = 1.25;
            this.lastImpactLabel = b.label || "厂房结构";
          }
        }

        // 6. Terrain & Water Surface Collision
        const minClearance = 0.28;
        if (this.pos[1] < groundH + minClearance) {
          const impactSpeed = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
          this.pos[1] = groundH + minClearance;
          if (impactSpeed > 14.5 || bodyUpWorld[1] < 0.18) {
            this.vel[1] = Math.abs(this.vel[1]) * 0.34;
            this.vel[0] *= 0.48;
            this.vel[2] *= 0.48;
            if (this.crashTimer < 0.9) {
              this.omega[0] += 5.5;
              this.lastCrashEvent = { speed: impactSpeed, label: groundH <= global.FPVWorld.WATER_LEVEL + 0.05 ? "河谷水面" : "地面冲击", time: now };
              this.comboMult = 1.0;
              this.comboTimer = 0;
              this.vtxGlitch = Math.min(1.0, 0.42 + impactSpeed * 0.02);
            }
            this.crashTimer = 1.3;
            this.lastImpactLabel = groundH <= global.FPVWorld.WATER_LEVEL + 0.05 ? "河谷水面" : "地面冲击";
          } else {
            if (this.vel[1] < 0) this.vel[1] = 0;
            this.vel[0] *= Math.exp(-8 * subDt);
            this.vel[2] *= Math.exp(-8 * subDt);
          }
        }

        // 7. Sub-Stepped Race Gate Crossing Detection (Zero High-Speed Tunneling!)
        if (this.gates.length > 0) {
          this.currentLapMs = Math.max(0, now - this.lapStartTime);
          const gate = this.gates[this.activeGateIdx];
          const nx = Math.sin(gate.yaw), nz = Math.cos(gate.yaw);
          const dPrev = (prevPos[0] - gate.x) * nx + (prevPos[2] - gate.z) * nz;
          const dCurr = (this.pos[0] - gate.x) * nx + (this.pos[2] - gate.z) * nz;
          if ((dPrev <= 0 && dCurr > 0) || (dPrev >= 0 && dCurr < 0)) {
            const t = Math.abs(dPrev) / (Math.abs(dPrev - dCurr) || 1);
            const ix = prevPos[0] + (this.pos[0] - prevPos[0]) * t;
            const iy = prevPos[1] + (this.pos[1] - prevPos[1]) * t;
            const iz = prevPos[2] + (this.pos[2] - prevPos[2]) * t;
            if (Math.hypot(ix - gate.x, iy - gate.y, iz - gate.z) <= gate.radius + 1.25) {
              const passedIdx = this.activeGateIdx;
              const splitMs = this.currentLapMs;
              this.currentGateSplitsMs[passedIdx] = splitMs;

              // Compute live split delta vs Ghost record
              let splitDeltaMs = null;
              if (this.ghostRecord && this.ghostRecord.gateSplitsMs && this.ghostRecord.gateSplitsMs[passedIdx]) {
                splitDeltaMs = splitMs - this.ghostRecord.gateSplitsMs[passedIdx];
                this.lastSplitDeltaMs = splitDeltaMs;
              }

              this.activeGateIdx = (this.activeGateIdx + 1) % this.gates.length;
              let completedLapMs = null;
              let isNewRecord = false;
              if (this.activeGateIdx === 0) {
                this.lapCount += 1;
                completedLapMs = splitMs;
                if (this.bestLapMs === null || completedLapMs < this.bestLapMs) {
                  this.bestLapMs = completedLapMs;
                  isNewRecord = true;
                }
                // Upgrade Ghost Drone to player's Personal Best if faster than current ghost!
                if (this.currentLapFrames.length > 25 && (!this.ghostRecord || completedLapMs < this.ghostRecord.durationMs)) {
                  this.ghostRecord = {
                    durationMs: completedLapMs,
                    frames: this.currentLapFrames.slice(),
                    gateSplitsMs: this.currentGateSplitsMs.slice(),
                    isPersonalBest: true
                  };
                  isNewRecord = true;
                }
                this.currentLapFrames = [];
                this.currentGateSplitsMs = [];
                this.lapStartTime = now;
                this.awardTrick(isNewRecord ? "🏆 刷新最快圈速 PB" : "🏁 完赛冲线 LAP", isNewRecord ? 600 : 350, now);
              } else {
                this.awardTrick(`⚡ 穿越 ${String(passedIdx + 1).padStart(2, "0")} 号门`, 100, now);
              }

              this.lastGateEvent = {
                gateNumber: passedIdx + 1,
                totalGates: this.gates.length,
                completedLapMs,
                bestLapMs: this.bestLapMs,
                splitDeltaMs,
                isNewRecord,
                time: now
              };
            }
          }
        }
      }

      // === POST-SUBSTEP FRAME TELEMETRY, TRAFFIC AVOIDANCE, FREESTYLE TRICKS & VTX LINK ===
      // 1. Dynamic Moving Vehicles, Pedestrians & 5 Airborne Piston Biplanes Check
      let nearestAlert = null;
      let nearestBiplane = null;
      const checkActor = (x, y, z, kind, id, cautionR, dangerR) => {
        const dx = this.pos[0] - x, dy = this.pos[1] - y, dz = this.pos[2] - z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < cautionR) {
          const level = dist < dangerR ? "DANGER" : "CAUTION";
          if (!nearestAlert || dist < nearestAlert.dist) {
            nearestAlert = { level, kind, id, dist, x, y, z };
          }
          if (dist < dangerR) {
            const nx = dist > 0.1 ? dx / dist : 0;
            const nz = dist > 0.1 ? dz / dist : 0;
            this.pos[0] = x + nx * dangerR;
            this.pos[2] = z + nz * dangerR;
            this.pos[1] = Math.max(this.pos[1], y + 1.8);
            this.vel[0] = nx * Math.max(4, Math.abs(this.vel[0]) * 0.5);
            this.vel[1] = Math.max(this.vel[1], 4.8);
            this.vel[2] = nz * Math.max(4, Math.abs(this.vel[2]) * 0.5);
            this.crashTimer = 1.3;
            this.lastImpactLabel = `移动${kind} (${id})`;
            this.lastAvoidEvent = { kind, id, time: now };
          }
        }
        return dist;
      };

      if (this.actors) {
        for (const v of this.actors.vehicles) {
          checkActor(v.x, v.y + v.h * 0.5, v.z, "车辆", v.id, 22, Math.max(4.4, v.len * 0.55));
        }
        for (const p of this.actors.pedestrians) {
          checkActor(p.x, p.y + 1.0, p.z, "行人", p.id, 16, 3.1);
        }
        if (this.actors.aircraft) {
          for (const ac of this.actors.aircraft) {
            const dAc = checkActor(ac.x, ac.y, ac.z, "双翼飞机", ac.id, 48, 6.4);
            if (!nearestBiplane || dAc < nearestBiplane.dist) {
              nearestBiplane = { dist: dAc, ac };
            }
          }
        }
      }
      this.proximityAlert = nearestAlert;
      this.nearestBiplane = nearestBiplane;

      // 2. Freestyle Trick & Proximity Detection
      const groundNow = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(this.pos[0], this.pos[2]));
      const aglNow = Math.max(0, this.pos[1] - groundNow);
      const speedKmh = Math.hypot(this.vel[0], this.vel[1], this.vel[2]) * 3.6;
      const upNow = quatRotateVec(this.quat, [0, 1, 0]);

      if (this.armed && aglNow > 2.2 && this.crashTimer <= 0.05) {
        if (Math.abs(this.omega[2]) > 2.4) this._trickRollAcc += this.omega[2] * clampedDt;
        else this._trickRollAcc *= Math.exp(-4 * clampedDt);

        if (Math.abs(this.omega[0]) > 2.2) this._trickPitchAcc += this.omega[0] * clampedDt;
        else this._trickPitchAcc *= Math.exp(-4 * clampedDt);

        if (Math.abs(this._trickRollAcc) >= Math.PI * 1.88) {
          const dirName = this._trickRollAcc > 0 ? "左横滚翻腾" : "右横滚翻腾";
          this._trickRollAcc = 0;
          this.awardTrick(`🔥 ${dirName} ROLL 360°`, 160, now);
        }
        if (Math.abs(this._trickPitchAcc) >= Math.PI * 1.88) {
          const isLoop = speedKmh > 48;
          this._trickPitchAcc = 0;
          this.awardTrick(isLoop ? "🚀 大回环 POWERLOOP" : "⚡ 筋斗空翻 FLIP 360°", isLoop ? 260 : 180, now);
        }

        if (upNow[1] < -0.45 && this.throttleOut < 0.22) {
          this._invertedTimer += clampedDt;
          if (this._invertedTimer >= 0.65) {
            this._invertedTimer = -1.2; // cooldown
            this.awardTrick("💎 零油门倒飞滞空 INVERTED", 240, now);
          }
        } else if (this._invertedTimer > 0) {
          this._invertedTimer = Math.max(0, this._invertedTimer - clampedDt * 2);
        } else if (this._invertedTimer < 0) {
          this._invertedTimer = Math.min(0, this._invertedTimer + clampedDt);
        }
      } else {
        this._trickRollAcc = 0;
        this._trickPitchAcc = 0;
      }

      // High-speed Proximity Razor Bonus (Ground/Water skimming, Tunnel threading, Gas-station canopy)
      if (this.armed && this.crashTimer <= 0 && this._proxCooldown <= 0 && speedKmh > 56) {
        const mt = global.FPVWorld.MOUNTAIN_TUNNEL;
        const inTunnel = mt && Math.abs(this.pos[0] - mt.x) < mt.halfW && this.pos[2] > mt.zNorth && this.pos[2] < mt.zSouth && this.pos[1] < mt.floorY + mt.height;
        if (inTunnel) {
          this._proxCooldown = 2.2;
          this.awardTrick("⛰ 隧道极限穿行 TUNNEL THREAD", 320, now);
        } else if (minObstacleDist < 2.6 || aglNow < 1.85) {
          this._proxCooldown = 2.4;
          const overWater = groundNow <= global.FPVWorld.WATER_LEVEL + 0.08 && aglNow < 1.85;
          this.awardTrick(overWater ? "🌊 掠水贴飞 WATER SKIM" : "⚡ 极限贴障 RAZOR PROXIMITY", overWater ? 180 : 140, now);
        }
      }

      // Close Biplane Formation / Flyby Bonus + Doppler Trigger
      if (nearestBiplane && nearestBiplane.dist < 22 && this._flybyCooldown <= 0 && this.crashTimer <= 0) {
        this._flybyCooldown = 3.8;
        this.lastFlybyEvent = { id: nearestBiplane.ac.id, dist: nearestBiplane.dist, time: now };
        this.awardTrick(`✈ 掠过${nearestBiplane.ac.name}`, 280, now);
      }

      // 3. Battery Sag, Amps, Propeller Phase & Motor Thermal Simulation
      const motorAvg = (this.motors[0] + this.motors[1] + this.motors[2] + this.motors[3]) * 0.25;
      if (this.armed) {
        this.propPhase = (this.propPhase + clampedDt * (30 + motorAvg * 98)) % (Math.PI * 2);
        this.flightTimeSec += clampedDt;
      }
      const targetAmps = this.armed ? 2.4 + Math.pow(motorAvg, 1.92) * 104 : 0.4;
      this.amps += (targetAmps - this.amps) * (1 - Math.exp(-10 * clampedDt));
      this.mahUsed += (this.amps * 1000 * clampedDt) / 3600;
      const restingCell = Math.max(3.32, 4.20 - (this.mahUsed / 2200) * 0.68);
      const sagVolts = (this.amps / 108) * 0.44;
      this.cellVoltage += (restingCell - sagVolts - this.cellVoltage) * (1 - Math.exp(-9 * clampedDt));

      const airflowCooling = 1 + speedKmh * 0.018;
      for (let m = 0; m < 4; m++) {
        const eqTemp = 28 + Math.pow(this.motors[m], 1.7) * (66 / Math.min(2.2, airflowCooling));
        this.motorTempsC[m] += (eqTemp - this.motorTempsC[m]) * (1 - Math.exp(-0.45 * clampedDt));
      }

      // 4. Digital HD VTX Signal Link Quality & Tunnel/Structure Occlusion
      const homeDist = Math.hypot(this.pos[0], this.pos[2]);
      let linkLoss = (homeDist / 1350) * 0.42;
      const mt = global.FPVWorld.MOUNTAIN_TUNNEL;
      if (mt && Math.abs(this.pos[0] - mt.x) < mt.halfW + 3 && this.pos[2] > mt.zNorth && this.pos[2] < mt.zSouth) {
        const tunnelDepth = Math.min(this.pos[2] - mt.zNorth, mt.zSouth - this.pos[2]);
        linkLoss += Math.min(0.62, (tunnelDepth / 55) * 0.62);
      }
      if (this.pos[0] > -70 && this.pos[0] < 70 && this.pos[2] > -210 && this.pos[2] < -45 && aglNow < 16) {
        linkLoss += 0.16; // Concrete factory multipath attenuation
      }
      const targetMbps = Math.max(4.5, Math.min(50.0, 50.0 * (1 - linkLoss * 0.88)));
      this.vtxMbps += (targetMbps - this.vtxMbps) * (1 - Math.exp(-6 * clampedDt));
      this.vtxGlitch = this.vtxGlitch * Math.exp(-5.5 * clampedDt);

      // 5. Holographic Ghost Drone Update & Player Ribbon Trail
      this.updateGhostDrone(clampedDt, now);

      if (this.armed && speedKmh > 7.2) {
        const leftArm = quatRotateVec(this.quat, [-0.26, 0, 0.18]);
        const rightArm = quatRotateVec(this.quat, [0.26, 0, 0.18]);
        this.trail.push({
          lx: this.pos[0] + leftArm[0], ly: this.pos[1] + leftArm[1], lz: this.pos[2] + leftArm[2],
          rx: this.pos[0] + rightArm[0], ry: this.pos[1] + rightArm[1], rz: this.pos[2] + rightArm[2]
        });
        if (this.trail.length > 56) this.trail.shift();
      } else if (this.trail.length > 0) {
        this.trail.shift();
      }

      this._historyAccum += clampedDt;
      if (this._historyAccum > 0.25) {
        this._historyAccum = 0;
        const lastH = this.flightPathHistory[this.flightPathHistory.length - 1];
        if (!lastH || Math.hypot(this.pos[0] - lastH[0], this.pos[2] - lastH[1]) > 4.5) {
          this.flightPathHistory.push([this.pos[0], this.pos[2]]);
          if (this.flightPathHistory.length > 260) this.flightPathHistory.shift();
        }
      }
    }

    getTelemetry() {
      const fwd = quatRotateVec(this.quat, [0, 0, -1]);
      const right = quatRotateVec(this.quat, [1, 0, 0]);
      const up = quatRotateVec(this.quat, [0, 1, 0]);

      const speedMs = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
      const groundY = Math.max(global.FPVWorld.WATER_LEVEL, global.FPVWorld.getTerrainHeight(this.pos[0], this.pos[2]));
      const agl = Math.max(0, this.pos[1] - groundY);

      const headingRad = Math.atan2(fwd[0], -fwd[2]);
      const headingDeg = ((headingRad * 180) / Math.PI + 360) % 360;
      const pitchRad = Math.asin(Math.max(-1, Math.min(1, fwd[1])));
      const rollRad = Math.atan2(-right[1], up[1]);

      const homeDist = Math.hypot(this.pos[0], this.pos[2]);
      const homeRelBearing = Math.atan2(-this.pos[0], this.pos[2]) - headingRad;
      const rssiPct = Math.max(10, Math.min(99, Math.round(22 + (this.vtxMbps / 50.0) * 77)));

      return {
        pos: this.pos,
        vel: this.vel,
        speedKmh: speedMs * 3.6,
        vSpeed: this.vel[1],
        altitudeM: this.pos[1],
        aglM: agl,
        headingDeg,
        pitchRad,
        rollRad,
        homeDistM: homeDist,
        homeRelBearing,
        rssiPct,
        vtxMbps: this.vtxMbps,
        vtxGlitch: this.vtxGlitch,
        gForce: this.gForce,
        propWash: this.propWash,
        armed: this.armed,
        mode: this.mode,
        altHold: this.altHold,
        airMode: this.airMode,
        autopilotMode: this.autopilotMode,
        activeWpIdx: this.activeWpIdx,
        totalWps: this.waypoints.length,
        throttlePct: Math.round(this.throttleOut * 100),
        motors: this.motors,
        motorTempsC: this.motorTempsC,
        cells: this.cells,
        packVoltage: this.cellVoltage * this.cells,
        cellVoltage: this.cellVoltage,
        amps: this.amps,
        mahUsed: Math.round(this.mahUsed),
        flightTimeSec: this.flightTimeSec,
        activeGateIdx: this.activeGateIdx,
        totalGates: this.gates.length,
        currentLapMs: this.currentLapMs,
        bestLapMs: this.bestLapMs,
        lastSplitDeltaMs: this.lastSplitDeltaMs,
        lapCount: this.lapCount,
        freestyleScore: this.freestyleScore,
        comboMult: this.comboMult,
        comboTimer: this.comboTimer,
        crashActive: this.crashTimer > 0,
        lastImpactLabel: this.lastImpactLabel,
        proximityAlert: this.proximityAlert
      };
    }
  }

  global.FPVPhysics = {
    DRONE_PRESETS,
    DroneSimulator,
    quatRotateVec,
    quatInvRotateVec,
    quatMultiply
  };
})(window);
