// AeroVeloce FPV GCS — Interactive 2D/3D Tactical Contour Map & Waypoint Mission Planner
(function (global) {
  "use strict";

  class GCSMissionPlanner {
    constructor(mapCanvas, profileCanvas, sim, factory, gates, callbacks) {
      this.mapCanvas = mapCanvas;
      this.profileCanvas = profileCanvas;
      this.mapCtx = mapCanvas.getContext("2d");
      this.profCtx = profileCanvas ? profileCanvas.getContext("2d") : null;
      this.sim = sim;
      this.factory = factory;
      this.gates = gates;
      this.callbacks = callbacks || {};

      this.worldSpan = 1750; // Covers -875m .. +875m in GCS tactical view
      this.centerX = 40;
      this.centerZ = -130;

      this.defaultAgl = 26;
      this.defaultSpeed = 20;
      this.selectedIdx = -1;
      this.draggingIdx = -1;
      this.didDrag = false;

      this.baseMapCanvas = document.createElement("canvas");
      this.buildTerrainBaseMap();
      this.bindPointerEvents();
    }

    worldToMap(wx, wz) {
      const w = this.mapCanvas.width;
      const h = this.mapCanvas.height;
      const u = (wx - (this.centerX - this.worldSpan * 0.5)) / this.worldSpan;
      const v = (wz - (this.centerZ - this.worldSpan * 0.5)) / this.worldSpan;
      return [u * w, v * h];
    }

    mapToWorld(mx, my) {
      const w = this.mapCanvas.width || 1;
      const h = this.mapCanvas.height || 1;
      const wx = this.centerX - this.worldSpan * 0.5 + (mx / w) * this.worldSpan;
      const wz = this.centerZ - this.worldSpan * 0.5 + (my / h) * this.worldSpan;
      return [Math.round(wx), Math.round(wz)];
    }

    // Pre-render topographic elevation shading & contour lines once to offscreen canvas
    buildTerrainBaseMap() {
      const size = 280;
      this.baseMapCanvas.width = size;
      this.baseMapCanvas.height = size;
      const ctx = this.baseMapCanvas.getContext("2d");
      const img = ctx.createImageData(size, size);
      const data = img.data;
      const getH = global.FPVWorld.getTerrainHeight;
      const waterY = global.FPVWorld.WATER_LEVEL;

      for (let py = 0; py < size; py++) {
        const wz = this.centerZ - this.worldSpan * 0.5 + (py / size) * this.worldSpan;
        for (let px = 0; px < size; px++) {
          const wx = this.centerX - this.worldSpan * 0.5 + (px / size) * this.worldSpan;
          const h = getH(wx, wz);
          const idx = (py * size + px) * 4;

          let r, g, b;
          if (h <= waterY + 0.05) {
            r = 20; g = 68; b = 104;
          } else if (h > 115) {
            r = 186; g = 198; b = 212;
          } else if (h > 70) {
            r = 92; g = 102; b = 114;
          } else if (h > 26) {
            r = 46; g = 82; b = 56;
          } else {
            r = 34; g = 66; b = 46;
          }

          // Topographic contour line every 16m
          const contour = h > waterY + 0.3 && Math.abs((h % 16) - 8) < 0.72;
          if (contour) {
            r = Math.min(255, r + 24);
            g = Math.min(255, g + 26);
            b = Math.min(255, b + 24);
          }

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    bindPointerEvents() {
      const canvas = this.mapCanvas;

      const getCanvasPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return [
          ((e.clientX - rect.left) / rect.width) * canvas.width,
          ((e.clientY - rect.top) / rect.height) * canvas.height
        ];
      };

      canvas.addEventListener("pointerdown", (e) => {
        const [mx, my] = getCanvasPos(e);
        this.didDrag = false;
        // Check if clicking an existing waypoint
        let hit = -1;
        for (let i = 0; i < this.sim.waypoints.length; i++) {
          const [wx, wy] = this.worldToMap(this.sim.waypoints[i].x, this.sim.waypoints[i].z);
          if (Math.hypot(mx - wx, my - wy) < 13) {
            hit = i;
            break;
          }
        }
        if (hit >= 0) {
          this.selectedIdx = hit;
          this.draggingIdx = hit;
          canvas.setPointerCapture(e.pointerId);
          if (this.callbacks.onSelectionChange) this.callbacks.onSelectionChange(hit);
        } else {
          // Append new 3D waypoint at clicked coordinates
          const [wx, wz] = this.mapToWorld(mx, my);
          this.sim.waypoints.push({ x: wx, z: wz, agl: this.defaultAgl, speed: this.defaultSpeed });
          this.selectedIdx = this.sim.waypoints.length - 1;
          if (this.callbacks.onWaypointsChange) this.callbacks.onWaypointsChange(this.selectedIdx);
        }
      });

      canvas.addEventListener("pointermove", (e) => {
        if (this.draggingIdx < 0) return;
        const [mx, my] = getCanvasPos(e);
        const [wx, wz] = this.mapToWorld(mx, my);
        const wp = this.sim.waypoints[this.draggingIdx];
        if (wp) {
          wp.x = wx;
          wp.z = wz;
          this.didDrag = true;
          if (this.callbacks.onWaypointsChange) this.callbacks.onWaypointsChange(this.draggingIdx);
        }
      });

      const endDrag = () => {
        this.draggingIdx = -1;
      };
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
    }

    render() {
      const ctx = this.mapCtx;
      const w = this.mapCanvas.width;
      const h = this.mapCanvas.height;

      // 1. Base topographic terrain
      ctx.drawImage(this.baseMapCanvas, 0, 0, w, h);

      // 2. Tactical 200m coordinate grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let g = -800; g <= 800; g += 200) {
        const [gx] = this.worldToMap(g, 0);
        const [, gz] = this.worldToMap(0, g);
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(w, gz); ctx.stroke();
      }

      // 3. Abandoned Factory (Bando) Footprint Overlay
      if (this.factory && this.factory.bounds) {
        const b = this.factory.bounds;
        const [x0, y0] = this.worldToMap(b.minX, b.minZ);
        const [x1, y1] = this.worldToMap(b.maxX, b.maxZ);
        ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("废弃厂房 BANDO", (x0 + x1) * 0.5, y0 - 4);
      }

      // 3b. West Mountain Ridge FPV Training Tunnel Marker
      const mt = global.FPVWorld && global.FPVWorld.MOUNTAIN_TUNNEL;
      if (mt) {
        const [tx0, ty0] = this.worldToMap(mt.x, mt.zNorth);
        const [tx1, ty1] = this.worldToMap(mt.x, mt.zSouth);
        ctx.save();
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(tx0, ty0);
        ctx.lineTo(tx1, ty1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#22d3ee";
        ctx.font = "600 9px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText("⛰ 隧道", tx0 - 5, (ty0 + ty1) * 0.5 + 3);
        ctx.restore();
      }

      // 3c. Roadside Valley Town Footprint & Main Street Overlay
      const td = global.FPVWorld && global.FPVWorld.TOWN_DATA;
      if (td && td.bounds) {
        const tb = td.bounds;
        const [tx0, ty0] = this.worldToMap(tb.minX, tb.minZ);
        const [tx1, ty1] = this.worldToMap(tb.maxX, tb.maxZ);
        ctx.fillStyle = "rgba(52, 211, 153, 0.14)";
        ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        ctx.strokeStyle = "rgba(52, 211, 153, 0.65)";
        ctx.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        // East-West Main Street line
        const [msx0, msy] = this.worldToMap(-148, 140);
        const [msx1] = this.worldToMap(42, 140);
        ctx.strokeStyle = "rgba(226, 232, 240, 0.65)";
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(msx0, msy); ctx.lineTo(msx1, msy); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = "#34d399";
        ctx.font = "600 9.5px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("🏘 山谷小镇", (tx0 + tx1) * 0.5, ty1 + 10);
      }

      // 4. Race Gates (subtle cyan dots)
      ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
      for (const g of this.gates) {
        const [gx, gy] = this.worldToMap(g.x, g.z);
        ctx.beginPath();
        ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Home Helipad Marker ("H")
      const [hx, hy] = this.worldToMap(0, 0);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#11151c";
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("H", hx, hy + 2.8);

      // 6. Drone Live Flight History Trail
      if (this.sim.flightPathHistory.length > 1) {
        ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        this.sim.flightPathHistory.forEach((pt, idx) => {
          const [px, py] = this.worldToMap(pt[0], pt[1]);
          if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // 6b. Live Moving Ground Vehicles, Pedestrians & Airborne Biplanes on GCS Map
      if (this.sim.actors) {
        ctx.fillStyle = "#f97316";
        for (const v of this.sim.actors.vehicles) {
          const [vx, vy] = this.worldToMap(v.x, v.z);
          ctx.fillRect(vx - 2.5, vy - 2.5, 5, 5);
        }
        ctx.fillStyle = "#ef4444";
        for (const p of this.sim.actors.pedestrians) {
          const [px, py] = this.worldToMap(p.x, p.z);
          ctx.beginPath();
          ctx.arc(px, py, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (this.sim.actors.aircraft) {
          for (const ac of this.sim.actors.aircraft) {
            const [ax, ay] = this.worldToMap(ac.x, ac.z);
            ctx.save();
            ctx.translate(ax, ay);
            // world +Z is down on map, +X is right, so heading angle on map is atan2(vx, vz) -> rotate(-yaw + PI)
            ctx.rotate(-ac.yaw + Math.PI);
            ctx.fillStyle = "#38bdf8";
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -5.5);
            ctx.lineTo(5.5, 1.5);
            ctx.lineTo(1.2, 1.5);
            ctx.lineTo(1.8, 5.0);
            ctx.lineTo(-1.8, 5.0);
            ctx.lineTo(-1.2, 1.5);
            ctx.lineTo(-5.5, 1.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 7. Planned 3D Waypoint Corridor & Nodes
      const wps = this.sim.waypoints;
      if (wps.length > 0) {
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        wps.forEach((wp, idx) => {
          const [px, py] = this.worldToMap(wp.x, wp.z);
          if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        if (this.sim.missionLoop && wps.length > 2) {
          const [p0x, p0y] = this.worldToMap(wps[0].x, wps[0].z);
          ctx.lineTo(p0x, p0y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        wps.forEach((wp, idx) => {
          const [px, py] = this.worldToMap(wp.x, wp.z);
          const isSel = idx === this.selectedIdx;
          const isActive = this.sim.autopilotMode === "MISSION" && idx === this.sim.activeWpIdx;
          ctx.fillStyle = isActive ? "#34d399" : isSel ? "#22d3ee" : "#f59e0b";
          ctx.beginPath();
          ctx.arc(px, py, isSel || isActive ? 8.5 : 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#0d1117";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#0d1117";
          ctx.font = "700 9px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(String(idx + 1), px, py + 3);

          ctx.fillStyle = "#edf2f7";
          ctx.font = "600 9px ui-monospace, monospace";
          ctx.fillText(`${wp.agl}m`, px, py - 10);
        });
      }

      // 8. Live Drone Icon & Heading Cone
      const tel = this.sim.getTelemetry();
      const [dx, dy] = this.worldToMap(tel.pos[0], tel.pos[2]);
      const hRad = (tel.headingDeg * Math.PI) / 180;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(hRad);
      ctx.fillStyle = "rgba(34, 211, 238, 0.25)";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-10, -24); ctx.lineTo(10, -24); ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0b1017";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Scale & North Legend
      ctx.fillStyle = "rgba(13, 17, 23, 0.72)";
      ctx.fillRect(6, 6, 98, 18);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("N↑  1750m 覆盖", 11, 18);

      this.renderAltitudeProfile();
    }

    renderAltitudeProfile() {
      if (!this.profCtx) return;
      const ctx = this.profCtx;
      const w = this.profileCanvas.width;
      const h = this.profileCanvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
      ctx.fillRect(0, 0, w, h);

      const wps = this.sim.waypoints;
      if (wps.length < 2) {
        ctx.fillStyle = "#687686";
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("点击上方地图添加航点，实时预览三维高程剖面", w * 0.5, h * 0.55);
        return;
      }

      const getH = global.FPVWorld.getTerrainHeight;
      const waterY = global.FPVWorld.WATER_LEVEL;
      const samples = 48;
      const segLengths = [];
      let totalDist = 0;
      for (let i = 0; i < wps.length - 1; i++) {
        const d = Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].z - wps[i].z);
        segLengths.push(d);
        totalDist += d;
      }
      totalDist = Math.max(1, totalDist);

      let maxAlt = 80;
      const terrainPts = [];
      const flightPts = [];

      for (let s = 0; s <= samples; s++) {
        const targetD = (s / samples) * totalDist;
        let accum = 0, segIdx = 0;
        while (segIdx < segLengths.length - 1 && accum + segLengths[segIdx] < targetD) {
          accum += segLengths[segIdx];
          segIdx++;
        }
        const frac = segLengths[segIdx] > 0 ? Math.min(1, (targetD - accum) / segLengths[segIdx]) : 0;
        const a = wps[segIdx], b = wps[segIdx + 1];
        const x = a.x + (b.x - a.x) * frac;
        const z = a.z + (b.z - a.z) * frac;
        const tH = Math.max(waterY, getH(x, z));
        const aAgl = Math.max(waterY, getH(a.x, a.z)) + a.agl;
        const bAgl = Math.max(waterY, getH(b.x, b.z)) + b.agl;
        const fH = aAgl + (bAgl - aAgl) * frac;
        if (fH > maxAlt) maxAlt = fH;
        if (tH > maxAlt) maxAlt = tH;
        terrainPts.push(tH);
        flightPts.push(fH);
      }

      maxAlt *= 1.15;
      const toY = (alt) => h - 6 - (alt / maxAlt) * (h - 14);

      // Terrain fill
      ctx.fillStyle = "rgba(52, 92, 66, 0.65)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      terrainPts.forEach((th, i) => ctx.lineTo((i / samples) * w, toY(th)));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // 3D Flight Altitude Line
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      flightPts.forEach((fh, i) => {
        const px = (i / samples) * w;
        if (i === 0) ctx.moveTo(px, toY(fh)); else ctx.lineTo(px, toY(fh));
      });
      ctx.stroke();

      ctx.fillStyle = "#9aa7b6";
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`三维高程剖面 · 总航程 ${Math.round(totalDist)}m · 最高 ${Math.round(maxAlt)}m`, 6, 12);
    }
  }

  global.FPVGCS = { GCSMissionPlanner };
})(window);
