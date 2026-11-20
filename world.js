// AeroVeloce FPV GCS — 2400m Realistic Terrain, River & Reservoir Lake, Bando Factory, Road, Vehicles & Pedestrians
(function (global) {
  "use strict";

  const WORLD_HALF_SIZE = 1150;
  const WATER_LEVEL = 0.95;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(ix, iz) {
    const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function valueNoise2D(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  function fbm(x, z) {
    let val = 0, amp = 0.5, freq = 1.0;
    for (let i = 0; i < 4; i++) {
      val += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
      freq *= 2.04;
      amp *= 0.48;
    }
    return val;
  }

  function ridgedFbm(x, z) {
    let val = 0, amp = 0.55, freq = 1.0;
    for (let i = 0; i < 3; i++) {
      const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq) * 2 - 1);
      val += amp * n * n;
      freq *= 2.1;
      amp *= 0.46;
    }
    return val;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Winding Alpine River centerline X(z)
  function getRiverCenterX(z) {
    return 155 + Math.sin(z * 0.0034) * 110 + Math.cos(z * 0.0017) * 60;
  }

  // Valley Asphalt Highway centerline X(z) passing west of the river & alongside the factory yard
  function getRoadCenterX(z) {
    return -95 + Math.sin(z * 0.0042) * 34;
  }

  // Realistic expanded 2400m terrain heightmap with alpine peaks, river channel, reservoir lake, road terrace & factory yard
  function getTerrainHeight(x, z) {
    // 1. Flat industrial yard around Launch Helipad (0,0) & Abandoned Factory (x:-90..95, z:-265..-10)
    const dxYard = Math.max(0, Math.abs(x) - 96);
    const dzYard = Math.max(0, Math.abs(z + 125) - 148);
    const yardBlend = smoothstep(8, 88, Math.hypot(dxYard, dzYard));

    // 2. River channel & South-East Alpine Reservoir Lake (centered near x=260, z=110)
    const riverDist = Math.abs(x - getRiverCenterX(z));
    const riverCarve = smoothstep(22, 76, riverDist);

    const lakeDist = Math.hypot((x - 255) * 0.78, (z - 125) * 0.92);
    const lakeCarve = smoothstep(95, 195, lakeDist);
    const waterCarve = Math.min(riverCarve, lakeCarve);

    // 3. Macro mountain basin + terraced ridges
    const radial = Math.hypot(x, z + 120);
    const outerRim = Math.pow(Math.max(0, (radial - 330) / 420), 1.55) * 155;
    const mountains = ridgedFbm(x * 0.0022 + 3.1, z * 0.0022 - 1.7) * 98;
    const hills = fbm(x * 0.0055 - 1.2, z * 0.0055 + 2.4) * 26;
    const micro = fbm(x * 0.018, z * 0.018) * 3.6;

    const natural = Math.max(0, 6.2 + outerRim + mountains * (0.45 + 0.55 * smoothstep(160, 520, radial)) + hills + micro);
    const withWater = natural * waterCarve + (WATER_LEVEL - 1.4) * (1 - waterCarve);

    // 4. Flatten highway roadbed smoothly
    const roadDist = Math.abs(x - getRoadCenterX(z));
    const roadBlend = smoothstep(7, 24, roadDist);
    const roadTargetH = Math.max(3.2, withWater * 0.35 + 2.4);
    const withRoad = roadTargetH * (1 - roadBlend) + withWater * roadBlend;

    // 5. Blend smoothly into the flat factory & launch pad terrace (2.6m)
    let h = 2.6 * (1 - yardBlend) + withRoad * yardBlend;

    // 6. Carve West Mountain Ridge FPV Training Tunnel trench (x=-240, z=-275..-135, floorY=32.0)
    const tx = Math.abs(x - (-240));
    if (tx < 24 && z > -312 && z < -98) {
      const xMask = 1 - smoothstep(10.0, 22.0, tx);
      const zMask = smoothstep(-310, -280, z) * (1 - smoothstep(-130, -100, z));
      const tBlend = xMask * zMask;
      h = h * (1 - tBlend) + 32.0 * tBlend;
    }

    // 7. Flatten scenic South Valley Roadside Town terrace (x: -145..35, z: 68..222, floorY=5.2)
    const dxTown = Math.max(0, Math.abs(x + 55) - 90);
    const dzTown = Math.max(0, Math.abs(z - 145) - 78);
    const townBlend = 1 - smoothstep(4, 42, Math.hypot(dxTown, dzTown));
    if (townBlend > 0.001) {
      h = h * (1 - townBlend) + 5.2 * townBlend;
    }

    return h;
  }

  const MOUNTAIN_TUNNEL = {
    x: -240,
    zSouth: -135,
    zNorth: -275,
    floorY: 32.0,
    halfW: 8.5,
    height: 11.5
  };

  const TOWN_DATA = {
    centerX: -55,
    centerZ: 145,
    floorY: 5.2,
    bounds: { minX: -145, maxX: 35, minZ: 68, maxZ: 222 }
  };

  function getTerrainNormal(x, z, eps) {
    const e = eps || 3.8;
    const nx = getTerrainHeight(x - e, z) - getTerrainHeight(x + e, z);
    const nz = getTerrainHeight(x, z - e) - getTerrainHeight(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz) || 1;
    return [nx / l, (2 * e) / l, nz / l];
  }

  // Abandoned Industrial Factory (Bando) with fly-through bays, chimneys, gantry crane, silos & AABB colliders
  function createFactoryComplex() {
    const baseY = 2.6;
    const colliders = [];
    const boxes = [];

    function addPart(cx, cy, cz, sx, sy, sz, color, emissive, solid, label) {
      boxes.push({ cx, cy, cz, sx, sy, sz, color, emissive: emissive || 0, solid: Boolean(solid), label });
      if (solid) {
        colliders.push({
          minX: cx - sx * 0.5, maxX: cx + sx * 0.5,
          minY: cy - sy * 0.5, maxY: cy + sy * 0.5,
          minZ: cz - sz * 0.5, maxZ: cz + sz * 0.5,
          label: label || "厂房结构"
        });
      }
    }

    const concreteDark = [0.30, 0.32, 0.34];
    const concreteWall = [0.46, 0.48, 0.49];
    const concreteWeathered = [0.39, 0.40, 0.38];
    const rustSteel = [0.54, 0.28, 0.18];
    const craneYellow = [0.84, 0.62, 0.14];
    const containerTeal = [0.16, 0.38, 0.42];
    const containerRed = [0.56, 0.20, 0.18];
    const warnRed = [0.95, 0.24, 0.22];

    // Factory concrete apron
    addPart(0, baseY + 0.04, -125, 165, 0.08, 225, [0.23, 0.25, 0.27], 0, false);

    // Main Turbine Hall (center fly-through corridor x: -14..14 open!)
    const hallZ = -125, hallH = 22;
    addPart(-42, baseY + hallH * 0.5, hallZ - 24, 2.2, hallH, 24, concreteWall, 0, true, "西侧厂房墙");
    addPart(-42, baseY + hallH * 0.5, hallZ + 24, 2.2, hallH, 24, concreteWall, 0, true, "西侧厂房墙");
    addPart(-42, baseY + hallH - 3, hallZ, 2.2, 6, 26, concreteWeathered, 0, true, "西侧过梁");

    addPart(42, baseY + hallH * 0.5, hallZ - 24, 2.2, hallH, 24, concreteWall, 0, true, "东侧厂房墙");
    addPart(42, baseY + hallH * 0.5, hallZ + 24, 2.2, hallH, 24, concreteWall, 0, true, "东侧厂房墙");
    addPart(42, baseY + hallH - 3, hallZ, 2.2, 6, 26, concreteWeathered, 0, true, "东侧过梁");

    for (const fz of [hallZ - 37, hallZ + 37]) {
      addPart(-28, baseY + hallH * 0.5, fz, 26, hallH, 2.4, concreteWeathered, 0, true, "厂房门柱");
      addPart(28, baseY + hallH * 0.5, fz, 26, hallH, 2.4, concreteWeathered, 0, true, "厂房门柱");
      addPart(0, baseY + hallH - 2.4, fz, 32, 4.8, 2.4, rustSteel, 0, true, "大门横梁");
    }
    for (let rz = hallZ - 30; rz <= hallZ + 30; rz += 15) {
      addPart(0, baseY + hallH + 0.8, rz, 86, 1.4, 1.6, rustSteel, 0, true, "屋架钢梁");
    }
    addPart(-28, baseY + hallH + 0.5, hallZ - 16, 28, 1.0, 34, concreteDark, 0, true, "厂房屋顶");
    addPart(28, baseY + hallH + 0.5, hallZ + 14, 28, 1.0, 36, concreteDark, 0, true, "厂房屋顶");
    for (const cz of [hallZ - 20, hallZ, hallZ + 20]) {
      addPart(-18, baseY + hallH * 0.5, cz, 1.8, hallH, 1.8, concreteDark, 0, true, "厂房立柱");
      addPart(18, baseY + hallH * 0.5, cz, 1.8, hallH, 1.8, concreteDark, 0, true, "厂房立柱");
    }

    // Overhead Gantry Crane
    addPart(-30, baseY + 15, -66, 2.4, 30, 2.4, craneYellow, 0, true, "龙门吊支腿");
    addPart(30, baseY + 15, -66, 2.4, 30, 2.4, craneYellow, 0, true, "龙门吊支腿");
    addPart(0, baseY + 29.5, -66, 66, 2.8, 3.2, craneYellow, 0.08, true, "龙门吊横梁");
    addPart(8, baseY + 26.2, -66, 5.5, 3.6, 4.2, rustSteel, 0, true, "天车控制室");

    // Twin Smokestacks
    for (const st of [{ x: -64, z: -158, h: 68, w: 6.4 }, { x: -64, z: -124, h: 56, w: 5.6 }]) {
      addPart(st.x, baseY + st.h * 0.5, st.z, st.w, st.h, st.w, [0.48, 0.34, 0.28], 0, true, "废弃烟囱");
      addPart(st.x, baseY + st.h - 4.5, st.z, st.w + 0.3, 2.4, st.w + 0.3, [0.88, 0.88, 0.88], 0.1, false);
      addPart(st.x, baseY + st.h + 0.8, st.z, st.w * 0.72, 1.2, st.w * 0.72, warnRed, 1.0, false);
    }

    // Fuel Silos & Pipe Bridge
    for (const sl of [{ x: 64, z: -148, w: 12, h: 24 }, { x: 64, z: -124, w: 12, h: 24 }, { x: 64, z: -100, w: 12, h: 20 }]) {
      addPart(sl.x, baseY + sl.h * 0.5, sl.z, sl.w, sl.h, sl.w, [0.58, 0.61, 0.64], 0, true, "储油罐");
      addPart(sl.x, baseY + sl.h + 1.0, sl.z, sl.w * 0.82, 1.6, sl.w * 0.82, rustSteel, 0, true, "罐顶");
    }
    addPart(52, baseY + 14.5, -136, 20, 2.0, 2.2, rustSteel, 0, true, "高架管道桥");

    // North Concrete Skeleton Frame
    for (const [cx, cz] of [[-22, -206], [22, -206], [-22, -182], [22, -182]]) {
      addPart(cx, baseY + 12, cz, 2.2, 24, 2.2, concreteWall, 0, true, "厂房框架柱");
    }
    addPart(0, baseY + 12, -194, 46, 1.6, 26, concreteWeathered, 0, true, "二层楼板");
    addPart(0, baseY + 24, -206, 46, 1.8, 2.4, concreteWall, 0, true, "框架顶梁");
    addPart(0, baseY + 24, -182, 46, 1.8, 2.4, concreteWall, 0, true, "框架顶梁");

    // Shipping Containers (16 stacked & spaced containers forming freestyle alleys)
    const containerSpecs = [
      [-56, 2.0, -56, 4.2, 4.0, 12.0, containerTeal],
      [-56, 6.0, -56, 4.2, 4.0, 12.0, containerRed],
      [ 52, 2.0, -58, 12.0, 4.0, 4.2, containerRed],
      [-38, 1.9, -26, 11.0, 3.8, 4.0, containerTeal],
      [ 36, 2.0, -28, 12.0, 4.0, 4.2, containerTeal],
      [ 36, 6.0, -28, 12.0, 4.0, 4.2, craneYellow],
      [-74, 2.0, -86, 4.2, 4.0, 12.0, containerRed],
      [-74, 2.0, -104, 4.2, 4.0, 12.0, containerTeal],
      [ 54, 2.0, -182, 12.0, 4.0, 4.2, containerTeal],
      [ 54, 6.0, -182, 12.0, 4.0, 4.2, containerRed],
      [-48, 2.0, -226, 12.0, 4.0, 4.2, craneYellow],
      [ 46, 2.0, -228, 12.0, 4.0, 4.2, containerTeal],
      [-92, 2.0, -58, 12.0, 4.0, 4.2, containerRed],
      [-92, 6.0, -58, 12.0, 4.0, 4.2, containerTeal],
      [ 92, 2.0, -52, 4.2, 4.0, 12.0, craneYellow],
      [ 92, 2.0, -196, 12.0, 4.0, 4.2, containerRed]
    ];
    for (const c of containerSpecs) {
      addPart(c[0], baseY + c[1], c[2], c[3], c[4], c[5], c[6], 0, true, "集装箱");
    }

    // Second Overhead Gantry Crane (North Yard at z = -176)
    addPart(-30, baseY + 15, -176, 2.4, 30, 2.4, craneYellow, 0, true, "北侧龙门吊支腿");
    addPart( 30, baseY + 15, -176, 2.4, 30, 2.4, craneYellow, 0, true, "北侧龙门吊支腿");
    addPart(  0, baseY + 29.5, -176, 66, 2.8, 3.2, craneYellow, 0.08, true, "北侧龙门吊横梁");

    // West Assembly Hall Annex (x = -112, z = -128, fly-through corridor z: -136..-120)
    const wx = -112, wz = -128, wh = 18;
    addPart(wx, baseY + wh * 0.5, wz - 22, 34, wh, 2.2, concreteWall, 0, true, "西副厂房墙");
    addPart(wx, baseY + wh * 0.5, wz + 22, 34, wh, 2.2, concreteWall, 0, true, "西副厂房墙");
    addPart(wx - 16, baseY + wh * 0.5, wz - 14, 2.2, wh, 14, concreteWeathered, 0, true, "西副厂房墙");
    addPart(wx - 16, baseY + wh * 0.5, wz + 14, 2.2, wh, 14, concreteWeathered, 0, true, "西副厂房墙");
    addPart(wx + 16, baseY + wh * 0.5, wz - 14, 2.2, wh, 14, concreteWeathered, 0, true, "西副厂房墙");
    addPart(wx + 16, baseY + wh * 0.5, wz + 14, 2.2, wh, 14, concreteWeathered, 0, true, "西副厂房墙");
    addPart(wx, baseY + wh + 0.8, wz, 36, 1.8, 46, concreteDark, 0, true, "西副厂房屋顶");

    // 3rd Tall Smokestack (West-North)
    addPart(-114, baseY + 38, -182, 7.2, 76, 7.2, [0.48, 0.34, 0.28], 0, true, "3号高烟囱");

    // Extra Fuel Silos (Total 6 Domed Silos)
    for (const sl of [{ x: 64, z: -172, w: 12, h: 24 }, { x: 86, z: -148, w: 11, h: 21 }, { x: 86, z: -124, w: 11, h: 21 }]) {
      addPart(sl.x, baseY + sl.h * 0.5, sl.z, sl.w, sl.h, sl.w, [0.58, 0.61, 0.64], 0, true, "储油罐");
    }

    // East Hyperbolic Cooling Tower (x = 114, z = -138, h = 38m, r = 13m)
    addPart(114, baseY + 19, -138, 22, 38, 22, concreteWeathered, 0, true, "冷却塔");

    // East Boiler House & Overhead Skybridge (x = 96, z = -84)
    addPart(96, baseY + 7.5, -84, 22, 15, 24, concreteWall, 0, true, "东侧锅炉房");
    addPart(68, baseY + 13.5, -90, 34, 2.8, 3.4, rustSteel, 0, true, "高架连廊");

    // Transformer Substations & Concrete Jersey Barriers
    for (const [tx, tz] of [[-46, -86], [48, -86], [-84, -158], [84, -178]]) {
      addPart(tx, baseY + 2.6, tz, 6.5, 5.2, 5.0, concreteDark, 0, true, "变电设备");
    }

    // Outpost 1: Lakeside Pump Station (x = 185, z = 45)
    const p1y = Math.max(WATER_LEVEL + 0.5, getTerrainHeight(185, 45));
    addPart(185, p1y + 6.5, 45, 24, 13, 18, concreteWall, 0, true, "湖畔泵站厂房");
    addPart(204, p1y + 7.0, 45, 9, 14, 9, [0.58, 0.61, 0.64], 0, true, "湖畔蓄水罐");

    // Outpost 2: West-South Valley Maintenance Hangar (x = -190, z = 155, clear of town)
    const p2y = Math.max(WATER_LEVEL + 0.5, getTerrainHeight(-190, 155));
    addPart(-190 - 11, p2y + 7.5, 155, 2.2, 15, 28, concreteWeathered, 0, true, "南谷机库墙");
    addPart(-190 + 11, p2y + 7.5, 155, 2.2, 15, 28, concreteWeathered, 0, true, "南谷机库墙");
    addPart(-190, p2y + 15.5, 155, 25, 2.0, 29, rustSteel, 0, true, "南谷机库顶");
    addPart(-168, p2y + 2.0, 150, 4.2, 4.0, 12.0, containerTeal, 0, true, "南谷集装箱");

    // West Mountain Ridge High-Difficulty FPV Training Tunnel Colliders (140m bore + 3 interior slalom obstacles)
    const mt = MOUNTAIN_TUNNEL;
    const tLen = mt.zSouth - mt.zNorth;
    const tMidZ = (mt.zSouth + mt.zNorth) * 0.5;
    addPart(mt.x - mt.halfW - 1.2, mt.floorY + mt.height * 0.5, tMidZ, 2.4, mt.height, tLen, concreteDark, 0, true, "山体隧道西壁");
    addPart(mt.x + mt.halfW + 1.2, mt.floorY + mt.height * 0.5, tMidZ, 2.4, mt.height, tLen, concreteDark, 0, true, "山体隧道东壁");
    addPart(mt.x, mt.floorY + mt.height + 3.2, tMidZ, mt.halfW * 2 + 6, 6.4, tLen, concreteDark, 0, true, "山体隧道拱顶");
    // 3 High-Difficulty Interior Slalom Baffles (Left -> Right -> Low Overhead Jet-Fan Beam)
    addPart(mt.x - 4.2, mt.floorY + 5.4, -170, 7.6, 10.8, 2.8, craneYellow, 0, true, "隧道通风挡板");
    addPart(mt.x + 4.2, mt.floorY + 5.4, -205, 7.6, 10.8, 2.8, craneYellow, 0, true, "隧道检修隔板");
    addPart(mt.x,       mt.floorY + 9.2, -240, mt.halfW * 2, 4.4, 3.2, rustSteel, 0, true, "隧道风机横梁");

    // Roadside Valley Town Colliders (Gas Station, Supermarket, 24H Convenience Store, Shops, Houses & 6 Highway Billboards)
    const ty = TOWN_DATA.floorY;
    // Gas Station (x=-104, z=102): Canopy roof at y=6.6m (under-canopy fly-through open!) + Office Mart
    addPart(-104, ty + 6.9, 102, 18, 1.4, 13, warnRed, 0, true, "加油站顶棚");
    addPart(-121, ty + 2.8, 102, 10, 5.6, 14, concreteWall, 0, true, "加油站便利屋");
    // Supermarket (x=-34, z=104)
    addPart(-34, ty + 4.8, 104, 30, 9.6, 22, concreteWall, 0, true, "小镇大型超市");
    // 24H Convenience Store (x=-48, z=168)
    addPart(-48, ty + 2.7, 168, 15, 5.4, 11, concreteWall, 0, true, "24H 便利店");
    // Town Commercial Shops & Residential Houses
    for (const [hx, hz, hw, hh, hd, lbl] of [
      [-108, 168, 16, 7.6, 12, "小镇商业楼"],
      [-108, 198, 18, 6.8, 12, "小镇汽修店"],
      [-48,  198, 16, 7.2, 12, "小镇民居"],
      [-16,  168, 15, 8.2, 12, "小镇咖啡馆"],
      [-16,  198, 16, 6.8, 12, "小镇民居"],
      [ 14,  104, 16, 7.4, 14, "小镇公寓楼"],
      [ 14,  168, 14, 7.0, 12, "小镇民居"],
      [  2,  140,  5, 16.5, 5, "小镇钟楼"]
    ]) {
      addPart(hx, ty + hh * 0.5, hz, hw, hh, hd, concreteWall, 0, true, lbl);
    }
    // 6 Large Roadside Highway Billboards (pillar + upper sign board)
    const billboardSpecs = [
      { x: getRoadCenterX(-48) - 14, z: -48, yaw:  0.15 },
      { x: getRoadCenterX(28)  + 14, z:  28, yaw: -0.18 },
      { x: getRoadCenterX(74)  + 15, z:  74, yaw: -0.10 },
      { x: getRoadCenterX(132) - 16, z: 132, yaw:  0.12 },
      { x: getRoadCenterX(194) + 15, z: 194, yaw: -0.12 },
      { x: getRoadCenterX(248) - 15, z: 248, yaw:  0.16 }
    ];
    for (const bb of billboardSpecs) {
      const bby = Math.max(WATER_LEVEL + 0.5, getTerrainHeight(bb.x, bb.z));
      addPart(bb.x, bby + 6.0, bb.z, 1.4, 12.0, 1.4, concreteDark, 0, true, "广告牌立柱");
      addPart(bb.x, bby + 13.5, bb.z, 14.5, 5.2, 1.2, craneYellow, 0, true, "路边大型广告牌");
    }

    return {
      center: { x: 0, z: -135 },
      bounds: { minX: -158, maxX: 152, minZ: -255, maxZ: -18 },
      tunnel: mt,
      town: TOWN_DATA,
      billboards: billboardSpecs,
      boxes,
      colliders
    };
  }

  // Create Moving Ground Vehicles & Walking Pedestrians (for dynamic avoidance)
  function createDynamicActors() {
    const vehicles = [
      // Highway vehicles driving north/south along getRoadCenterX(z)
      { id: "V1", type: "truck", laneOffset: -3.2, z: -420, dir: 1, speed: 15.5, color: [0.85, 0.52, 0.14], len: 7.4, wid: 2.6, h: 3.1, mode: "highway" },
      { id: "V2", type: "suv",   laneOffset:  3.2, z:  180, dir: -1, speed: 19.0, color: [0.18, 0.42, 0.68], len: 4.8, wid: 2.1, h: 1.9, mode: "highway" },
      { id: "V3", type: "van",   laneOffset: -3.2, z:  -40, dir: 1, speed: 14.0, color: [0.86, 0.88, 0.90], len: 5.4, wid: 2.2, h: 2.3, mode: "highway" },
      { id: "V4", type: "suv",   laneOffset:  3.2, z: -260, dir: -1, speed: 21.0, color: [0.76, 0.22, 0.22], len: 4.6, wid: 2.0, h: 1.8, mode: "highway" },
      { id: "V5", type: "truck", laneOffset: -3.2, z:  340, dir: 1, speed: 13.5, color: [0.24, 0.56, 0.42], len: 7.2, wid: 2.6, h: 3.0, mode: "highway" },
      // Factory perimeter patrol vehicles circling around the Bando yard
      { id: "V6", type: "van",   loopIdx: 0, t: 0.15, speed: 8.5, color: [0.92, 0.72, 0.14], len: 4.9, wid: 2.1, h: 2.1, mode: "loop",
        path: [[-75, -30], [75, -30], [75, -222], [-75, -222]] },
      { id: "V7", type: "suv",   loopIdx: 2, t: 0.55, speed: 9.2, color: [0.88, 0.90, 0.92], len: 4.5, wid: 2.0, h: 1.8, mode: "loop",
        path: [[-75, -30], [75, -30], [75, -222], [-75, -222]] }
    ];

    // Initialize vehicle world coords
    for (const v of vehicles) {
      v.x = 0; v.y = 3; v.yaw = 0;
    }

    // Walking Pedestrians (Factory safety inspectors & valley hikers in high-vis vests)
    const pedSpecs = [
      { x0: -20, z0: -18, x1: 24, z1: -18, speed: 1.8, vest: [0.98, 0.55, 0.08] },
      { x0: 28, z0: -44, x1: 28, z1: -88, speed: 1.6, vest: [0.96, 0.82, 0.12] },
      { x0: -26, z0: -50, x1: -26, z1: -102, speed: 1.7, vest: [0.98, 0.55, 0.08] },
      { x0: -10, z0: -105, x1: 10, z1: -145, speed: 1.5, vest: [0.96, 0.82, 0.12] },
      { x0: 46, z0: -92, x1: 46, z1: -156, speed: 1.6, vest: [0.98, 0.55, 0.08] },
      { x0: -48, z0: -175, x1: 32, z1: -175, speed: 1.7, vest: [0.22, 0.85, 0.92] },
      { x0: -14, z0: 14, x1: 18, z1: 14, speed: 1.5, vest: [0.98, 0.55, 0.08] },
      { x0: -52, z0: -28, x1: -52, z1: -72, speed: 1.4, vest: [0.96, 0.82, 0.12] },
      { x0: 82, z0: 18, x1: 120, z1: 52, speed: 1.6, vest: [0.94, 0.30, 0.24] },
      { x0: 105, z0: -40, x1: 118, z1: -98, speed: 1.5, vest: [0.96, 0.82, 0.12] },
      // Town sidewalk pedestrians (near Supermarket, Gas Station, Convenience Store & Main Street)
      { x0: -60, z0: 132, x1: 15, z1: 132, speed: 1.4, vest: [0.22, 0.78, 0.92] },
      { x0: -62, z0: 149, x1: 12, z1: 149, speed: 1.5, vest: [0.94, 0.36, 0.42] },
      { x0: -92, z0: 88,  x1: -92, z1: 125, speed: 1.3, vest: [0.98, 0.58, 0.10] },
      { x0: -58, z0: 156, x1: -28, z1: 156, speed: 1.4, vest: [0.24, 0.82, 0.52] }
    ];

    const pedestrians = pedSpecs.map((p, i) => ({
      id: `P${i + 1}`,
      x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1,
      t: (i * 0.23) % 1,
      dir: i % 2 === 0 ? 1 : -1,
      speed: p.speed,
      vest: p.vest,
      x: p.x0, y: 2.6, z: p.z0, yaw: 0, phase: i * 1.1
    }));

    // 5 Fixed-Wing Piston Biplane Aircraft patrolling the valley skies
    const aircraft = [
      { id: "A1", name: "红爵双翼机", cx:    0, cz: -110, rx: 280, rz: 210, altBase:  86, altAmp: 12, speed: 34, dir:  1, theta: 0.2,  color: [0.82, 0.16, 0.16], accent: [0.96, 0.78, 0.22] },
      { id: "A2", name: "蓝翼教练机", cx:  -65, cz:  135, rx: 240, rz: 185, altBase:  76, altAmp: 10, speed: 31, dir: -1, theta: 1.8,  color: [0.16, 0.42, 0.78], accent: [0.94, 0.95, 0.97] },
      { id: "A3", name: "金蜂农林机", cx:  245, cz:  -80, rx: 210, rz: 310, altBase:  98, altAmp: 16, speed: 36, dir:  1, theta: 3.1,  color: [0.94, 0.72, 0.12], accent: [0.14, 0.20, 0.34] },
      { id: "A4", name: "橄榄侦察机", cx: -230, cz: -175, rx: 195, rz: 245, altBase: 128, altAmp: 14, speed: 33, dir: -1, theta: 4.5,  color: [0.34, 0.44, 0.26], accent: [0.92, 0.88, 0.74] },
      { id: "A5", name: "银翼特技机", cx:   20, cz:  -40, rx: 430, rz: 360, altBase: 148, altAmp: 18, speed: 40, dir:  1, theta: 5.4,  color: [0.82, 0.85, 0.89], accent: [0.96, 0.44, 0.10] }
    ].map((a) => ({ ...a, x: a.cx, y: a.altBase, z: a.cz, yaw: 0, pitch: 0, roll: 0, propPhase: 0 }));

    const actors = { vehicles, pedestrians, aircraft };
    updateDynamicActors(actors, 0.016);
    return actors;
  }

  function updateDynamicActors(actors, dt) {
    if (!actors) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    for (const v of actors.vehicles) {
      if (v.mode === "highway") {
        v.z += v.dir * v.speed * clampedDt;
        if (v.z > 620) v.z = -620;
        if (v.z < -620) v.z = 620;
        const nextZ = v.z + v.dir * 2.0;
        const cx = getRoadCenterX(v.z) + v.laneOffset;
        const nx = getRoadCenterX(nextZ) + v.laneOffset;
        v.x = cx;
        v.y = Math.max(WATER_LEVEL + 0.5, getTerrainHeight(v.x, v.z));
        v.yaw = Math.atan2(nx - cx, nextZ - v.z);
      } else if (v.mode === "loop") {
        const pts = v.path;
        const a = pts[v.loopIdx];
        const b = pts[(v.loopIdx + 1) % pts.length];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        v.t += (v.speed * clampedDt) / segLen;
        if (v.t >= 1) {
          v.t -= 1;
          v.loopIdx = (v.loopIdx + 1) % pts.length;
        }
        const pa = pts[v.loopIdx];
        const pb = pts[(v.loopIdx + 1) % pts.length];
        v.x = pa[0] + (pb[0] - pa[0]) * v.t;
        v.z = pa[1] + (pb[1] - pa[1]) * v.t;
        v.y = Math.max(WATER_LEVEL + 0.5, getTerrainHeight(v.x, v.z));
        v.yaw = Math.atan2(pb[0] - pa[0], pb[1] - pa[1]);
      }
    }

    for (const p of actors.pedestrians) {
      const segLen = Math.hypot(p.x1 - p.x0, p.z1 - p.z0) || 1;
      p.t += (p.dir * p.speed * clampedDt) / segLen;
      if (p.t > 1) { p.t = 1; p.dir = -1; }
      if (p.t < 0) { p.t = 0; p.dir = 1; }
      p.x = p.x0 + (p.x1 - p.x0) * p.t;
      p.z = p.z0 + (p.z1 - p.z0) * p.t;
      p.y = Math.max(WATER_LEVEL + 0.4, getTerrainHeight(p.x, p.z));
      p.yaw = Math.atan2((p.x1 - p.x0) * p.dir, (p.z1 - p.z0) * p.dir);
      p.phase = (p.phase + clampedDt * 6.5) % (Math.PI * 2);
    }

    if (actors.aircraft) {
      for (const ac of actors.aircraft) {
        const avgR = (ac.rx + ac.rz) * 0.5;
        const omega = (ac.dir * ac.speed) / avgR;
        ac.theta = (ac.theta + omega * clampedDt) % (Math.PI * 2);
        const c = Math.cos(ac.theta), s = Math.sin(ac.theta);
        ac.x = ac.cx + ac.rx * c;
        ac.z = ac.cz + ac.rz * s;
        const waveY = Math.sin(ac.theta * 2.0) * ac.altAmp;
        const groundClear = Math.max(WATER_LEVEL, getTerrainHeight(ac.x, ac.z)) + 28;
        ac.y = Math.max(groundClear, ac.altBase + waveY);

        const vx = -ac.rx * s * omega;
        const vz =  ac.rz * c * omega;
        const vy =  Math.cos(ac.theta * 2.0) * 2.0 * ac.altAmp * omega;
        const hSpd = Math.hypot(vx, vz) || 1;
        ac.vx = vx; ac.vy = vy; ac.vz = vz;
        ac.yaw = Math.atan2(vx, vz);
        ac.pitch = Math.atan2(vy, hSpd);
        // Bank smoothly into the turn
        ac.roll = -ac.dir * 0.34;
        ac.propPhase = (ac.propPhase + clampedDt * 46.0) % (Math.PI * 2);

        // Record aerodynamic wingtip contrail points (upper wingtips ±5.95m)
        if (!ac.contrail) ac.contrail = [];
        ac._trailAcc = (ac._trailAcc || 0) + clampedDt;
        if (ac._trailAcc >= 0.075) {
          ac._trailAcc = 0;
          const cy = Math.cos(ac.yaw), sy = Math.sin(ac.yaw);
          const cr = Math.cos(ac.roll), sr = Math.sin(ac.roll);
          const wx = 5.95 * cy * cr, wy = 5.95 * sr, wz = -5.95 * sy * cr;
          const upY = 1.48 * cr;
          ac.contrail.push({
            lx: ac.x - wx, ly: ac.y + upY - wy, lz: ac.z - wz,
            rx: ac.x + wx, ry: ac.y + upY + wy, rz: ac.z + wz
          });
          if (ac.contrail.length > 28) ac.contrail.shift();
        }
      }
    }
  }

  function createCourseGates() {
    const waypoints = [
      { x: 0, z: -48, agl: 8.5, radius: 6.2 },
      { x: 0, z: -92, agl: 9.0, radius: 6.4 },
      { x: 0, z: -162, agl: 9.5, radius: 6.4 },
      { x: 0, z: -245, agl: 16.0, radius: 6.8 },
      { x: 95, z: -340, agl: 22.0, radius: 7.2 },
      { x: 210, z: -430, agl: 26.0, radius: 7.5 },
      { x: 315, z: -260, agl: 30.0, radius: 7.5 },
      { x: 260, z: -85, agl: 24.0, radius: 7.2 },
      { x: 220, z: 115, agl: 18.0, radius: 7.2 },
      { x: 45, z: 165, agl: 16.0, radius: 6.8 },
      { x: -72, z: 75, agl: 14.0, radius: 6.6 },
      { x: 0, z: 22, agl: 8.5, radius: 6.4 }
    ];
    return waypoints.map((wp, idx) => {
      const next = waypoints[(idx + 1) % waypoints.length];
      const groundY = Math.max(WATER_LEVEL, getTerrainHeight(wp.x, wp.z));
      return {
        index: idx, x: wp.x, y: groundY + wp.agl, groundY, z: wp.z,
        radius: wp.radius, yaw: Math.atan2(next.x - wp.x, next.z - wp.z)
      };
    });
  }

  function createWorldLandmarks(gates, factory) {
    const rng = mulberry32(20261119);
    const trees = [], pylons = [], turbines = [], arches = [], boulders = [];
    const cols = factory && factory.colliders ? factory.colliders : null;
    const pushBoxCol = (cx, cy, cz, sx, sy, sz, label) => {
      if (!cols) return;
      cols.push({
        minX: cx - sx * 0.5, maxX: cx + sx * 0.5,
        minY: cy - sy * 0.5, maxY: cy + sy * 0.5,
        minZ: cz - sz * 0.5, maxZ: cz + sz * 0.5,
        label
      });
    };

    // 6 Concrete Canyon & Valley Arch Bridges (under-bridge fly-through open!)
    for (const a of [
      { x: getRiverCenterX(-420), z: -420, span: 56, height: 36, yaw: 0.08 },
      { x: getRiverCenterX(-260), z: -260, span: 54, height: 34, yaw: 0.12 },
      { x: getRiverCenterX(-95),  z: -95,  span: 50, height: 28, yaw: -0.06 },
      { x: getRiverCenterX(45),   z: 45,   span: 52, height: 30, yaw: -0.15 },
      { x: getRiverCenterX(240),  z: 240,  span: 58, height: 32, yaw: 0.10 },
      { x: -195,                  z: -28,  span: 44, height: 24, yaw: 1.48 }
    ]) {
      const ay = Math.max(WATER_LEVEL, getTerrainHeight(a.x, a.z));
      arches.push({ ...a, y: ay });
      const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
      const halfSpan = a.span * 0.5;
      pushBoxCol(a.x - halfSpan * cy, ay + a.height * 0.5, a.z + halfSpan * sy, 4.4, a.height, 4.8, "峡谷拱桥桥墩");
      pushBoxCol(a.x + halfSpan * cy, ay + a.height * 0.5, a.z - halfSpan * sy, 4.4, a.height, 4.8, "峡谷拱桥桥墩");
      const extX = Math.abs(cy) * (a.span + 6) + Math.abs(sy) * 5.4;
      const extZ = Math.abs(sy) * (a.span + 6) + Math.abs(cy) * 5.4;
      pushBoxCol(a.x, ay + a.height + 0.2, a.z, extX, 2.8, extZ, "峡谷拱桥桥面");
    }

    // 11 Mountain Ridge Wind Turbines
    for (const tc of [
      { x: -320, z: -280 }, { x: -370, z: -420 }, { x: -240, z: -520 },
      { x: -450, z: -120 }, { x: -340, z: 190 },  { x: -220, z: 360 },
      { x:  430, z: -310 }, { x:  465, z: -120 }, { x:  420, z: 220 },
      { x:  290, z: -490 }, { x:  540, z: 40 }
    ]) {
      const ty = getTerrainHeight(tc.x, tc.z);
      turbines.push({ x: tc.x, y: ty, z: tc.z, hubHeight: 54, bladeLen: 24, phase: rng() * Math.PI * 2 });
      pushBoxCol(tc.x, ty + 27, tc.z, 3.2, 55, 3.2, "风力发电机塔筒");
    }

    // 10 High-Voltage Relay & Transmission Towers
    for (const p of [
      { x: -210, z: -115, w: 9, h: 64 }, { x: -210, z: -265, w: 9, h: 66 },
      { x: -210, z:  45,  w: 9, h: 58 }, { x: -160, z:  320, w: 9, h: 62 },
      { x:  350, z: -460, w: 10, h: 72 }, { x:  330, z: -220, w: 9, h: 64 },
      { x:  310, z: -35,  w: 9, h: 56 }, { x:  165, z: -340, w: 8, h: 58 },
      { x:  -55, z: -340, w: 8, h: 54 }, { x:  115, z:  285, w: 9, h: 60 }
    ]) {
      const py = getTerrainHeight(p.x, p.z);
      pylons.push({ ...p, y: py });
      pushBoxCol(p.x, py + p.h * 0.5, p.z, p.w * 0.85, p.h, p.w * 0.85, "高压输电铁塔");
    }

    // Dense Alpine Forest (~260+ smooth multi-tier trees)
    const tb = TOWN_DATA.bounds;
    for (let i = 0; i < 540; i++) {
      const tx = (rng() - 0.5) * 1700, tz = (rng() - 0.5) * 1700;
      if (tx > factory.bounds.minX - 24 && tx < factory.bounds.maxX + 24 && tz > factory.bounds.minZ - 24 && tz < factory.bounds.maxZ + 44) continue;
      if (tx > tb.minX - 18 && tx < tb.maxX + 18 && tz > tb.minZ - 18 && tz < tb.maxZ + 18) continue;
      if (tx > -278 && tx < -202 && tz > -315 && tz < -95) continue;
      if (Math.hypot(tx - 185, tz - 45) < 34 || Math.hypot(tx + 190, tz - 155) < 34) continue;
      if (Math.abs(tx - getRiverCenterX(tz)) < 38) continue;
      if (Math.abs(tx - getRoadCenterX(tz)) < 22) continue;
      if (gates.some((g) => Math.hypot(tx - g.x, tz - g.z) < 20)) continue;
      const ty = getTerrainHeight(tx, tz);
      if (ty < WATER_LEVEL + 1.8 || ty > 108) continue;
      const sc = 0.9 + rng() * 1.45;
      trees.push({ x: tx, y: ty, z: tz, scale: sc });
      pushBoxCol(tx, ty + 4.8 * sc, tz, 2.2 * sc, 9.2 * sc, 2.2 * sc, "松林树木");
    }

    // 48 Scattered Valley & Hillside Alpine Boulders / Rock Outcrops
    for (let i = 0; i < 90 && boulders.length < 48; i++) {
      const bx = (rng() - 0.5) * 1250, bz = (rng() - 0.5) * 1250;
      if (Math.hypot(bx, bz) < 28) continue;
      if (bx > factory.bounds.minX - 10 && bx < factory.bounds.maxX + 10 && bz > factory.bounds.minZ - 10 && bz < factory.bounds.maxZ + 12) continue;
      if (bx > tb.minX - 14 && bx < tb.maxX + 14 && bz > tb.minZ - 14 && bz < tb.maxZ + 14) continue;
      if (bx > -278 && bx < -202 && bz > -315 && bz < -95) continue;
      if (Math.hypot(bx + 190, bz - 155) < 28) continue;
      if (Math.abs(bx - getRoadCenterX(bz)) < 18) continue;
      if (gates.some((g) => Math.hypot(bx - g.x, bz - g.z) < 16)) continue;
      const by = getTerrainHeight(bx, bz);
      if (by < WATER_LEVEL + 0.6) continue;
      const rx = 2.2 + rng() * 4.2, ry = 1.6 + rng() * 3.4, rz = 2.2 + rng() * 4.2;
      boulders.push({ x: bx, y: by, z: bz, rx, ry, rz });
      pushBoxCol(bx, by + ry * 0.4, bz, rx * 1.45, ry * 1.4, rz * 1.45, "山谷巨石");
    }

    return { trees, pylons, turbines, arches, boulders };
  }

  function getPresetMissions() {
    return {
      bando_inspect: {
        name: "废弃厂房穿行巡检",
        waypoints: [
          { x: 0, z: -48, agl: 10, speed: 14 }, { x: 0, z: -125, agl: 11, speed: 13 },
          { x: 0, z: -194, agl: 20, speed: 15 }, { x: -64, z: -158, agl: 76, speed: 16 },
          { x: 64, z: -124, agl: 34, speed: 16 }, { x: 0, z: -15, agl: 12, speed: 12 }
        ]
      },
      town_cruise: {
        name: "🏘 山谷小镇低空巡游",
        waypoints: [
          { x: -65, z: 42, agl: 14, speed: 18 },
          { x: -104, z: 86, agl: 4.5, speed: 12 },
          { x: -104, z: 102, agl: 3.8, speed: 10 },
          { x: -104, z: 138, agl: 12, speed: 15 },
          { x: -48, z: 140, agl: 12, speed: 15 },
          { x: -24, z: 140, agl: 14, speed: 15 },
          { x: -34, z: 78, agl: 16, speed: 18 },
          { x: 0, z: 12, agl: 12, speed: 14 }
        ]
      },
      tunnel_challenge: {
        name: "⛰ 山脊隧道极限穿越",
        waypoints: [
          { x: -120, z: -45, agl: 24, speed: 18 },
          { x: -240, z: -102, agl: 6, speed: 14 },
          { x: -236, z: -170, agl: 5, speed: 13 },
          { x: -244, z: -205, agl: 5, speed: 13 },
          { x: -240, z: -240, agl: 4, speed: 14 },
          { x: -240, z: -310, agl: 12, speed: 18 },
          { x: -120, z: -220, agl: 36, speed: 22 },
          { x: 0, z: -10, agl: 14, speed: 16 }
        ]
      },
      canyon_patrol: {
        name: "河谷水库高速巡航",
        waypoints: [
          { x: 0, z: -80, agl: 22, speed: 24 }, { x: 145, z: -260, agl: 28, speed: 30 },
          { x: 245, z: -470, agl: 42, speed: 32 }, { x: 430, z: -260, agl: 65, speed: 30 },
          { x: 255, z: 125, agl: 16, speed: 28 }, { x: 0, z: 0, agl: 14, speed: 16 }
        ]
      },
      ridge_survey: {
        name: "全图高空薄雾测绘",
        waypoints: [
          { x: -320, z: -280, agl: 88, speed: 28 }, { x: 0, z: -560, agl: 105, speed: 32 },
          { x: 430, z: -310, agl: 95, speed: 30 }, { x: 360, z: 220, agl: 85, speed: 28 },
          { x: -300, z: 220, agl: 78, speed: 28 }, { x: 0, z: 0, agl: 18, speed: 18 }
        ]
      }
    };
  }

  global.FPVWorld = {
    WORLD_HALF_SIZE,
    WATER_LEVEL,
    MOUNTAIN_TUNNEL,
    TOWN_DATA,
    getRiverCenterX,
    getRoadCenterX,
    getTerrainHeight,
    getTerrainNormal,
    createFactoryComplex,
    createDynamicActors,
    updateDynamicActors,
    createCourseGates,
    createWorldLandmarks,
    getPresetMissions
  };
})(window);
