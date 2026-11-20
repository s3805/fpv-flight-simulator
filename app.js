// AeroVeloce FPV GCS — Game-Grade Main Controller: 480Hz Physics Loop, Tactile RC Audio, Ghost Drone, ULTRA Graphics & GCS Wiring
(function () {
  "use strict";

  const factory = window.FPVWorld.createFactoryComplex();
  const gates = window.FPVWorld.createCourseGates();
  const landmarks = window.FPVWorld.createWorldLandmarks(gates, factory);
  const actors = window.FPVWorld.createDynamicActors();
  const presetMissions = window.FPVWorld.getPresetMissions();

  const sim = new window.FPVPhysics.DroneSimulator(gates, factory.colliders, actors);
  sim.setWaypoints(presetMissions.bando_inspect.waypoints);

  const audio = new window.FPVAudio.FPVAudioEngine();
  const glCanvas = document.getElementById("gl-canvas");
  const hudCanvas = document.getElementById("hud-canvas");
  const renderer = new window.FPVRenderer.FPVSceneRenderer(glCanvas, hudCanvas, gates, landmarks, factory, actors);
  window.__FPV_SIM__ = { sim, renderer, audio };

  // Top Pill & Hardware RC Transmitter UI Elements
  const rcController = document.getElementById("rc-controller");
  const btnWeather = document.getElementById("btn-weather");
  const btnCinema = document.getElementById("btn-cinema");
  const btnQuality = document.getElementById("btn-quality");
  const btnGhost = document.getElementById("btn-ghost");
  const btnToggleTx = document.getElementById("btn-toggle-tx");
  const btnCloseGcs = document.getElementById("btn-close-gcs");
  const gcsPanel = document.getElementById("gcs-panel");

  const swArm = document.getElementById("sw-arm");
  const ledArm = document.getElementById("led-arm");
  const lblArm = document.getElementById("lbl-arm");

  const swMode = document.getElementById("sw-mode");
  const ledMode = document.getElementById("led-mode");
  const lblMode = document.getElementById("lbl-mode");

  const swAltHold = document.getElementById("sw-althold");
  const ledAltHold = document.getElementById("led-althold");
  const lblAltHold = document.getElementById("lbl-althold");

  const knobPreset = document.getElementById("knob-preset");
  const dialPreset = document.getElementById("dial-preset");
  const lblPreset = document.getElementById("lbl-preset");

  const knobSky = document.getElementById("knob-sky");
  const dialSky = document.getElementById("dial-sky");
  const lblSky = document.getElementById("lbl-sky");

  const swCam = document.getElementById("sw-cam");
  const ledCam = document.getElementById("led-cam");
  const lblCam = document.getElementById("lbl-cam");

  const swGcs = document.getElementById("sw-gcs");
  const ledGcs = document.getElementById("led-gcs");
  const lblGcs = document.getElementById("lbl-gcs");

  const swSound = document.getElementById("sw-sound");
  const ledSound = document.getElementById("led-sound");
  const lblSound = document.getElementById("lbl-sound");

  const btnReset = document.getElementById("btn-reset");
  const btnRecoverTx = document.getElementById("btn-recover-tx");
  const btnTuning = document.getElementById("btn-tuning");
  const btnCloseDrawer = document.getElementById("btn-close-drawer");
  const sideDrawer = document.getElementById("tuning-drawer");
  const bannerEl = document.getElementById("flight-banner");

  // Backlit LCD Screen Elements
  const lcdModel = document.getElementById("lcd-model");
  const lcdArm = document.getElementById("lcd-arm");
  const lcdMode = document.getElementById("lcd-mode");
  const lcdBatt = document.getElementById("lcd-batt");
  const lcdRssi = document.getElementById("lcd-rssi");
  const lcdSpd = document.getElementById("lcd-spd");
  const lcdAgl = document.getElementById("lcd-agl");
  const lcdVs = document.getElementById("lcd-vs");
  const lcdThr = document.getElementById("lcd-thr");
  const lcdHdg = document.getElementById("lcd-hdg");
  const lcdAir = document.getElementById("lcd-air");
  const lcdAtt = document.getElementById("lcd-att");
  const barT = document.getElementById("bar-t");
  const barY = document.getElementById("bar-y");
  const barP = document.getElementById("bar-p");
  const barR = document.getElementById("bar-r");

  const PRESET_LIST = [
    { key: "freestyle", short: '5"花飞', lcd: '5" FREESTYLE' },
    { key: "racing",    short: '5"竞速', lcd: '5" RACING' },
    { key: "cinewhoop", short: '3"涵道', lcd: '3" CINEWHOOP' },
    { key: "longrange", short: '7"远航', lcd: '7" LONGRANGE' }
  ];
  const SKY_LIST = [
    { key: "day",   short: "晴空" },
    { key: "dusk",  short: "黄昏" },
    { key: "night", short: "夜航" }
  ];
  let currentPresetIdx = 0;

  // GCS Controls
  const selectMission = document.getElementById("select-mission");
  const btnLoadMission = document.getElementById("btn-load-mission");
  const btnMissionStart = document.getElementById("btn-mission-start");
  const btnRth = document.getElementById("btn-rth");
  const btnWpDel = document.getElementById("btn-wp-del");
  const btnWpClear = document.getElementById("btn-wp-clear");
  const sliderWpAgl = document.getElementById("slider-wp-agl");
  const valWpAgl = document.getElementById("val-wp-agl");
  const sliderWpSpeed = document.getElementById("slider-wp-speed");
  const valWpSpeed = document.getElementById("val-wp-speed");
  const gcsWpStatus = document.getElementById("gcs-wp-status");

  // Tuning Sliders & Buttons
  const sliderTilt = document.getElementById("slider-tilt");
  const valTilt = document.getElementById("val-tilt");
  const sliderFov = document.getElementById("slider-fov");
  const valFov = document.getElementById("val-fov");
  const sliderRate = document.getElementById("slider-rate");
  const valRate = document.getElementById("val-rate");
  const sliderExpo = document.getElementById("slider-expo");
  const valExpo = document.getElementById("val-expo");
  const sliderWind = document.getElementById("slider-wind");
  const valWind = document.getElementById("val-wind");
  const btnAirMode = document.getElementById("btn-airmode");
  const btnToggleOsd = document.getElementById("btn-toggle-osd");
  const btnToggleSticks = document.getElementById("btn-toggle-sticks");
  const btnRecover = document.getElementById("btn-recover");

  let bannerTimeout = null;
  function showBanner(text, durationMs) {
    if (!bannerEl) return;
    bannerEl.textContent = text;
    bannerEl.classList.remove("is-hidden");
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => bannerEl.classList.add("is-hidden"), durationMs || 2400);
  }

  function updateGcsStatusUI(selIdx) {
    const count = sim.waypoints.length;
    if (selIdx >= 0 && selIdx < count) {
      const wp = sim.waypoints[selIdx];
      sliderWpAgl.value = wp.agl;
      valWpAgl.textContent = `${wp.agl} m`;
      sliderWpSpeed.value = wp.speed;
      valWpSpeed.textContent = `${wp.speed} m/s`;
      gcsWpStatus.textContent = `已选中 WP${selIdx + 1} (${wp.x}, ${wp.z}) · 高度 ${wp.agl}m · 共 ${count} 航点`;
    } else {
      gcsWpStatus.textContent = count > 0
        ? `点击地图添加航点 · 拖动航点微调 (当前 ${count} 航点)`
        : "航线为空 · 点击上方地图规划 3D 航点或载入预设";
    }
  }

  const gcs = new window.FPVGCS.GCSMissionPlanner(
    document.getElementById("gcs-map"),
    document.getElementById("gcs-profile"),
    sim,
    factory,
    gates,
    {
      onSelectionChange: (idx) => updateGcsStatusUI(idx),
      onWaypointsChange: (idx) => {
        updateGcsStatusUI(idx);
        syncTopDeckUI();
      }
    }
  );

  function syncSlidersFromPreset() {
    sliderTilt.value = sim.preset.camTiltDeg;
    valTilt.textContent = `${sim.preset.camTiltDeg}°`;
    sliderFov.value = sim.preset.fovDeg;
    valFov.textContent = `${sim.preset.fovDeg}°`;
    sliderRate.value = sim.preset.maxRateDeg;
    valRate.textContent = `${sim.preset.maxRateDeg} °/s`;
    sliderExpo.value = Math.round(sim.preset.expo * 100);
    valExpo.textContent = sim.preset.expo.toFixed(2);
    sliderWind.value = sim.windSpeed;
    valWind.textContent = `${sim.windSpeed.toFixed(1)} m/s`;
  }

  function syncTopDeckUI() {
    // SA: ARM toggle switch
    swArm.setAttribute("data-pos", sim.armed ? "2" : "0");
    lblArm.textContent = sim.armed ? "ARMED" : "DISARM";
    ledArm.className = "tx-led " + (sim.armed ? "is-green" : "is-red");

    // SB: 3-pos Flight Mode switch (0=ANGLE, 1=HORIZON, 2=ACRO)
    const modeIdx = ["ANGLE", "HORIZON", "ACRO"].indexOf(sim.mode);
    swMode.setAttribute("data-pos", String(Math.max(0, modeIdx)));
    lblMode.textContent = sim.mode;
    ledMode.className = "tx-led " + (modeIdx === 0 ? "is-green" : modeIdx === 1 ? "is-amber" : "is-red");

    // SC: Altitude Hold toggle switch
    const altActive = sim.altHold && sim.mode !== "ACRO";
    swAltHold.setAttribute("data-pos", altActive ? "2" : "0");
    lblAltHold.textContent = altActive ? "ALT ON" : "MANUAL";
    ledAltHold.className = "tx-led " + (altActive ? "is-cyan" : "");

    // S1: Rotary Knob Model Preset (-60, -20, +20, +60 deg)
    const pObj = PRESET_LIST[currentPresetIdx] || PRESET_LIST[0];
    dialPreset.style.transform = `rotate(${-60 + currentPresetIdx * 40}deg)`;
    lblPreset.textContent = pObj.short;
    lcdModel.textContent = pObj.lcd;

    // S2: Rotary Knob Sky Environment (-50, 0, +50 deg)
    const skyIdx = Math.max(0, SKY_LIST.findIndex((s) => s.key === renderer.skyMode));
    dialSky.style.transform = `rotate(${-50 + skyIdx * 50}deg)`;
    lblSky.textContent = SKY_LIST[skyIdx].short;

    // SD: 4-pos Camera View switch (FPV / CHASE / ORBIT / GROUND Telephoto)
    const camOrder = ["FPV", "CHASE", "ORBIT", "GROUND"];
    const camIdx = Math.max(0, camOrder.indexOf(renderer.cameraMode));
    swCam.setAttribute("data-pos", String(Math.min(2, camIdx)));
    lblCam.textContent = ["FPV", "跟拍", "俯瞰", "长焦"][camIdx];
    ledCam.className = "tx-led is-cyan";

    // SE: GCS Map switch
    const gcsVisible = !gcsPanel.classList.contains("is-hidden");
    swGcs.setAttribute("data-pos", gcsVisible ? "2" : "0");
    lblGcs.textContent = gcsVisible ? "GCS ON" : "GCS OFF";
    ledGcs.className = "tx-led " + (gcsVisible ? "is-green" : "");

    // SF: Sound switch
    swSound.setAttribute("data-pos", audio.enabled ? "2" : "0");
    lblSound.textContent = audio.enabled ? "音效开" : "静音";
    ledSound.className = "tx-led " + (audio.enabled ? "is-amber" : "");

    // Top Pill Weather, Cinema, Graphics Quality & Ghost Drone Badges
    if (btnWeather) {
      const wMap = { clear: "天气: 晴朗", rain: "天气: 暴雨", snow: "天气: 暴雪" };
      btnWeather.textContent = wMap[renderer.weatherMode] || "天气: 晴朗";
      btnWeather.classList.toggle("is-cyan", renderer.weatherMode !== "clear");
    }
    if (btnCinema) {
      const cOn = Boolean(renderer.cinemaMode);
      btnCinema.textContent = cOn ? "GoPro 电影: 开" : "GoPro 电影: 关";
      btnCinema.classList.toggle("is-accent", cOn);
    }
    if (btnQuality) {
      const isUltra = renderer.quality === "ultra";
      btnQuality.textContent = isUltra ? "画质: ULTRA" : "画质: HIGH";
      btnQuality.classList.toggle("is-accent", isUltra);
    }
    if (btnGhost && sim.ghostDrone) {
      const gOn = sim.ghostDrone.enabled !== false;
      btnGhost.textContent = gOn ? "幽灵机: 开" : "幽灵机: 关";
      btnGhost.classList.toggle("is-cyan", gOn);
    }
    if (btnAirMode) {
      btnAirMode.textContent = sim.airMode ? "AirMode: 开启" : "AirMode: 关闭";
      btnAirMode.classList.toggle("is-toggled", Boolean(sim.airMode));
    }

    // GCS mission buttons
    btnMissionStart.textContent = sim.autopilotMode === "MISSION" ? "暂停自动航线" : "开始自动航线";
    btnMissionStart.classList.toggle("is-toggled", sim.autopilotMode === "MISSION");
    btnRth.classList.toggle("is-toggled", sim.autopilotMode === "RTH");

    // Controller fold button
    const txHidden = rcController.classList.contains("is-hidden");
    btnToggleTx.textContent = txHidden ? "展开遥控器" : "收起遥控器";
    btnToggleSticks.textContent = txHidden ? "遥控器: 隐藏" : "遥控器: 显示";
  }

  function setFlightMode(mode) {
    sim.mode = mode;
    audio.playSwitchClick(mode !== "ANGLE");
    if (mode === "ANGLE") {
      sim.altHold = true;
      showBanner("自稳模式 ANGLE · 松杆自动水平 + 气压定高辅助", 2200);
    } else if (mode === "HORIZON") {
      sim.altHold = false;
      showBanner("半自稳模式 HORIZON · 中杆自稳 / 满杆解锁特技翻滚", 2200);
    } else {
      sim.altHold = false;
      showBanner("手动穿越模式 ACRO · 480Hz AirMode 纯角速度控制 · 解锁自由花飞连击!", 2500);
    }
    syncTopDeckUI();
  }

  function cycleCamera() {
    const order = ["FPV", "CHASE", "ORBIT", "GROUND"];
    renderer.cameraMode = order[(order.indexOf(renderer.cameraMode) + 1) % order.length];
    audio.playSwitchClick(true);
    const labels = { FPV: "第一人称 FPV 镜头", CHASE: "第三人称高速跟拍", ORBIT: "360° 环绕检视", GROUND: "地面长焦摇镜电影追拍 (GROUND)" };
    showBanner(`视角切换: ${labels[renderer.cameraMode] || renderer.cameraMode}`, 1800);
    syncTopDeckUI();
  }

  function cycleWeather() {
    const order = ["clear", "rain", "snow"];
    const next = order[(order.indexOf(renderer.weatherMode) + 1) % order.length];
    renderer.setWeather(next);
    audio.playSwitchClick(next !== "clear");
    const msgs = {
      clear: "☀ 天气切换: 晴朗阿尔卑斯 · 3D 光线步进立体云海 + 2-Cascade CSM 软阴影",
      rain:  "⛈ 天气切换: 暴雨湿滑 · 路面动态镜面水洼 + 雨滴涟漪 + 3D 迎面雨丝 + GoPro 镜头雨滴折射!",
      snow:  "❄ 天气切换: 阿尔卑斯暴雪 · 全地形动态积雪覆盖 + 漫天飞雪粒子 + 寒风呼啸!"
    };
    showBanner(msgs[next], 2800);
    syncTopDeckUI();
  }

  function toggleCinemaMode() {
    renderer.cinemaMode = !renderer.cinemaMode;
    audio.playSwitchClick(renderer.cinemaMode);
    if (renderer.cinemaMode) {
      rcController.classList.add("is-hidden");
      gcsPanel.classList.add("is-hidden");
      sideDrawer.classList.add("is-hidden");
      showBanner("🎬 GoPro 实拍纯净电影模式已开启 · 已隐藏 HUD/门框/航线 · 180°运动模糊 + 穿云体积光拉满 (按 C 退出)", 2800);
    } else {
      rcController.classList.remove("is-hidden");
      showBanner("已恢复 DJI O3 战术 HUD 与硬件遥控器界面", 1800);
    }
    syncTopDeckUI();
  }

  function toggleGhostDrone() {
    if (!sim.ghostDrone) return;
    sim.ghostDrone.enabled = !sim.ghostDrone.enabled;
    audio.playSwitchClick(sim.ghostDrone.enabled);
    showBanner(
      sim.ghostDrone.enabled
        ? "已开启全息幽灵机竞速对比 · 穿越赛道刷新最佳单圈将自动升级个人PB幽灵机!"
        : "已隐藏全息幽灵机",
      2300
    );
    syncTopDeckUI();
  }

  // Top Pill & GCS Panel Controls
  if (btnWeather) {
    btnWeather.addEventListener("click", cycleWeather);
  }
  if (btnCinema) {
    btnCinema.addEventListener("click", toggleCinemaMode);
  }
  if (btnQuality) {
    btnQuality.addEventListener("click", () => {
      const next = renderer.quality === "ultra" ? "high" : "ultra";
      renderer.setQuality(next);
      audio.playSwitchClick(next === "ultra");
      showBanner(
        next === "ultra"
          ? "已切换 ULTRA v3.0 电影级画质 · 双级联CSM软阴影 + 深度SSAO + 3D光线步进穿云 + 风吹植被"
          : "已切换 HIGH 高帧率画质 · 1024² 双级联阴影 + ACES 电影级色调映射",
        2400
      );
      syncTopDeckUI();
    });
  }
  if (btnGhost) {
    btnGhost.addEventListener("click", toggleGhostDrone);
  }

  swGcs.addEventListener("click", () => {
    gcsPanel.classList.toggle("is-hidden");
    audio.playSwitchClick(!gcsPanel.classList.contains("is-hidden"));
    syncTopDeckUI();
  });
  btnCloseGcs.addEventListener("click", () => { gcsPanel.classList.add("is-hidden"); syncTopDeckUI(); });
  btnToggleTx.addEventListener("click", () => { rcController.classList.toggle("is-hidden"); syncTopDeckUI(); });

  btnLoadMission.addEventListener("click", () => {
    const key = selectMission.value;
    const m = presetMissions[key];
    if (m) {
      sim.setWaypoints(m.waypoints);
      gcs.selectedIdx = -1;
      updateGcsStatusUI(-1);
      audio.playSwitchClick(true);
      showBanner(`已载入三维航线: ${m.name} (${m.waypoints.length} 航点)`, 2400);
      syncTopDeckUI();
    }
  });

  btnMissionStart.addEventListener("click", () => {
    if (sim.autopilotMode === "MISSION") {
      sim.cancelAutopilot();
      audio.playSwitchClick(false);
      showBanner("已暂停自动航线 · 切换为手动控制", 2000);
    } else if (sim.startMission()) {
      audio.playSwitchClick(true);
      showBanner(`已启动 3D 自动航线巡航 (WP1/${sim.waypoints.length}) · 动摇杆可随时接管`, 2800);
    } else {
      showBanner("请先在 GCS 地图上点击添加航点或载入预设航线", 2400);
    }
    syncTopDeckUI();
  });

  btnRth.addEventListener("click", () => {
    if (sim.autopilotMode === "RTH") {
      sim.cancelAutopilot();
      audio.playSwitchClick(false);
      showBanner("已取消自动返航", 1800);
    } else {
      sim.startRTH();
      audio.playSwitchClick(true);
      showBanner("已启动一键自动返航 RTH · 自动爬升并返回 H 起降坪", 2600);
    }
    syncTopDeckUI();
  });

  sliderWpAgl.addEventListener("input", () => {
    const val = Number(sliderWpAgl.value);
    valWpAgl.textContent = `${val} m`;
    gcs.defaultAgl = val;
    if (gcs.selectedIdx >= 0 && sim.waypoints[gcs.selectedIdx]) {
      sim.waypoints[gcs.selectedIdx].agl = val;
      updateGcsStatusUI(gcs.selectedIdx);
    }
  });

  sliderWpSpeed.addEventListener("input", () => {
    const val = Number(sliderWpSpeed.value);
    valWpSpeed.textContent = `${val} m/s`;
    gcs.defaultSpeed = val;
    if (gcs.selectedIdx >= 0 && sim.waypoints[gcs.selectedIdx]) {
      sim.waypoints[gcs.selectedIdx].speed = val;
      updateGcsStatusUI(gcs.selectedIdx);
    }
  });

  btnWpDel.addEventListener("click", () => {
    if (gcs.selectedIdx >= 0 && gcs.selectedIdx < sim.waypoints.length) {
      sim.waypoints.splice(gcs.selectedIdx, 1);
      if (sim.activeWpIdx >= sim.waypoints.length) sim.activeWpIdx = 0;
      gcs.selectedIdx = -1;
      updateGcsStatusUI(-1);
      if (sim.waypoints.length === 0) sim.cancelAutopilot();
      syncTopDeckUI();
    }
  });

  btnWpClear.addEventListener("click", () => {
    sim.setWaypoints([]);
    sim.cancelAutopilot();
    gcs.selectedIdx = -1;
    updateGcsStatusUI(-1);
    syncTopDeckUI();
  });

  // Hardware RC Transmitter Switch & Rotary Knob Controls
  swArm.addEventListener("click", () => {
    sim.armed = !sim.armed;
    audio.playSwitchClick(sim.armed);
    audio.playArmTone(sim.armed);
    syncTopDeckUI();
  });
  swMode.addEventListener("click", () => {
    const order = ["ANGLE", "HORIZON", "ACRO"];
    setFlightMode(order[(order.indexOf(sim.mode) + 1) % order.length]);
  });
  swAltHold.addEventListener("click", () => {
    if (sim.mode === "ACRO") {
      showBanner("ACRO 手动模式固定使用纯手动油门 + AirMode，切换自稳可开启定高", 2200);
      return;
    }
    sim.altHold = !sim.altHold;
    audio.playSwitchClick(sim.altHold);
    syncTopDeckUI();
  });
  swCam.addEventListener("click", cycleCamera);
  swSound.addEventListener("click", () => {
    const next = !audio.enabled;
    audio.setEnabled(next);
    if (next) audio.playSwitchClick(true);
    syncTopDeckUI();
  });

  function stepPreset(delta) {
    currentPresetIdx = (currentPresetIdx + delta + PRESET_LIST.length) % PRESET_LIST.length;
    const pObj = PRESET_LIST[currentPresetIdx];
    sim.applyPreset(pObj.key);
    audio.playKnobTick();
    syncSlidersFromPreset();
    showBanner(`旋钮 S1 已切换机型: ${sim.preset.name}`, 2000);
    syncTopDeckUI();
  }
  knobPreset.addEventListener("click", () => stepPreset(1));
  knobPreset.addEventListener("wheel", (e) => { e.preventDefault(); stepPreset(e.deltaY > 0 ? 1 : -1); }, { passive: false });

  function stepSky(delta) {
    const idx = Math.max(0, SKY_LIST.findIndex((s) => s.key === renderer.skyMode));
    const next = SKY_LIST[(idx + delta + SKY_LIST.length) % SKY_LIST.length];
    renderer.skyMode = next.key;
    audio.playKnobTick();
    showBanner(`旋钮 S2 已切换环境: ${next.short}`, 1800);
    syncTopDeckUI();
  }
  knobSky.addEventListener("click", () => stepSky(1));
  knobSky.addEventListener("wheel", (e) => { e.preventDefault(); stepSky(e.deltaY > 0 ? 1 : -1); }, { passive: false });

  btnReset.addEventListener("click", () => {
    sim.reset();
    audio.playSwitchClick(true);
    showBanner("已复位至 H 起降坪 · 全息幽灵机已在 01 号门就位!", 2200);
    syncTopDeckUI();
  });
  btnRecover.addEventListener("click", () => { sim.recoverAttitude(); audio.playSwitchClick(true); showBanner("姿态已一键水平回正", 1600); });
  btnRecoverTx.addEventListener("click", () => { sim.recoverAttitude(); audio.playSwitchClick(true); showBanner("姿态已一键水平回正", 1600); });
  btnTuning.addEventListener("click", () => { sideDrawer.classList.toggle("is-hidden"); audio.playSwitchClick(true); });
  btnCloseDrawer.addEventListener("click", () => sideDrawer.classList.add("is-hidden"));

  // Tuning Drawer Controls
  sliderTilt.addEventListener("input", () => { sim.preset.camTiltDeg = Number(sliderTilt.value); valTilt.textContent = `${sim.preset.camTiltDeg}°`; });
  sliderFov.addEventListener("input", () => { sim.preset.fovDeg = Number(sliderFov.value); valFov.textContent = `${sim.preset.fovDeg}°`; });
  sliderRate.addEventListener("input", () => { sim.preset.maxRateDeg = Number(sliderRate.value); valRate.textContent = `${sim.preset.maxRateDeg} °/s`; });
  sliderExpo.addEventListener("input", () => { sim.preset.expo = Number(sliderExpo.value) / 100; valExpo.textContent = sim.preset.expo.toFixed(2); });
  sliderWind.addEventListener("input", () => { sim.windSpeed = Number(sliderWind.value); valWind.textContent = `${sim.windSpeed.toFixed(1)} m/s`; });
  if (btnAirMode) {
    btnAirMode.addEventListener("click", () => {
      sim.airMode = !sim.airMode;
      audio.playSwitchClick(sim.airMode);
      syncTopDeckUI();
    });
  }
  btnToggleOsd.addEventListener("click", () => {
    renderer.showOsd = !renderer.showOsd;
    btnToggleOsd.textContent = renderer.showOsd ? "DJI OSD: 开启" : "DJI OSD: 隐藏";
  });
  btnToggleSticks.addEventListener("click", () => {
    rcController.classList.toggle("is-hidden");
    syncTopDeckUI();
  });

  // Keyboard Controls
  const keys = Object.create(null);
  const keySmooth = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
    const code = e.code;
    keys[code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) e.preventDefault();

    if (code === "Space" && !e.repeat) {
      sim.armed = !sim.armed;
      audio.playArmTone(sim.armed);
      syncTopDeckUI();
    }
    else if (code === "KeyM" && !e.repeat) { const m = ["ANGLE", "HORIZON", "ACRO"]; setFlightMode(m[(m.indexOf(sim.mode) + 1) % 3]); }
    else if (code === "KeyV" && !e.repeat) { cycleCamera(); }
    else if (code === "KeyC" && !e.repeat) { toggleCinemaMode(); }
    else if (code === "KeyE" && !e.repeat) { cycleWeather(); }
    else if (code === "KeyG" && !e.repeat) { gcsPanel.classList.toggle("is-hidden"); syncTopDeckUI(); }
    else if (code === "KeyH" && !e.repeat) { toggleGhostDrone(); }
    else if (code === "KeyR" && !e.repeat) { sim.reset(); showBanner("已复位至 H 起降坪", 1600); syncTopDeckUI(); }
    else if (code === "KeyT" && !e.repeat) { sim.recoverAttitude(); showBanner("空中姿态已回正", 1500); }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  // Dual Virtual Joysticks
  function setupVirtualStick(wellId, puckId, isLeftStick) {
    const well = document.getElementById(wellId), puck = document.getElementById(puckId);
    const state = { x: 0, y: 0, active: false, pointerId: null, rawY01: null };
    function renderPuck() {
      const maxPx = well.clientWidth * 0.34;
      puck.style.transform = `translate(calc(-50% + ${state.x * maxPx}px), calc(-50% + ${-state.y * maxPx}px))`;
    }
    function updateFromEvent(e) {
      const rect = well.getBoundingClientRect(), maxR = rect.width * 0.38;
      let dx = (e.clientX - (rect.left + rect.width * 0.5)) / maxR;
      let dy = -(e.clientY - (rect.top + rect.height * 0.5)) / maxR;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      state.x = dx; state.y = dy;
      state.rawY01 = isLeftStick && (!sim.altHold || sim.mode === "ACRO") ? (dy + 1) * 0.5 : null;
      renderPuck();
    }
    well.addEventListener("pointerdown", (e) => {
      e.preventDefault(); well.setPointerCapture(e.pointerId);
      state.active = true; state.pointerId = e.pointerId;
      if (!sim.armed) { sim.armed = true; audio.playArmTone(true); syncTopDeckUI(); }
      updateFromEvent(e);
    });
    well.addEventListener("pointermove", (e) => { if (state.active && e.pointerId === state.pointerId) updateFromEvent(e); });
    const release = (e) => {
      if (!state.active || e.pointerId !== state.pointerId) return;
      state.active = false; state.pointerId = null; state.x = 0;
      if (!isLeftStick || (sim.altHold && sim.mode !== "ACRO")) { state.y = 0; state.rawY01 = null; }
      renderPuck();
    };
    well.addEventListener("pointerup", release);
    well.addEventListener("pointercancel", release);
    return { state, renderPuck };
  }

  const leftStick = setupVirtualStick("stick-left", "puck-left", true);
  const rightStick = setupVirtualStick("stick-right", "puck-right", false);
  window.addEventListener("resize", () => renderer.resize());

  let lastTime = performance.now();
  let lastHandledGateTime = 0;
  let lastHandledMissionTime = 0;
  let lastHandledCrashTime = 0;
  let lastHandledTrickTime = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const smoothRate = 1 - Math.exp(-14 * dt);
    keySmooth.throttle += (((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)) - keySmooth.throttle) * smoothRate;
    keySmooth.yaw += (((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)) - keySmooth.yaw) * smoothRate;
    keySmooth.pitch += (((keys.ArrowUp || keys.KeyI ? 1 : 0) - (keys.ArrowDown || keys.KeyK ? 1 : 0)) - keySmooth.pitch) * smoothRate;
    keySmooth.roll += (((keys.ArrowRight || keys.KeyL ? 1 : 0) - (keys.ArrowLeft || keys.KeyJ ? 1 : 0)) - keySmooth.roll) * smoothRate;

    let gpThrottle = 0, gpYaw = 0, gpPitch = 0, gpRoll = 0, gpRawThrottle = null;
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const gp = pads && (pads[0] || pads[1]);
      if (gp && gp.axes && gp.axes.length >= 4) {
        const dz = (v) => (Math.abs(v) < 0.07 ? 0 : v);
        gpYaw = dz(gp.axes[0]); gpThrottle = dz(-gp.axes[1]);
        gpRoll = dz(gp.axes[2]); gpPitch = dz(-gp.axes[3]);
        if (!sim.altHold || sim.mode === "ACRO") gpRawThrottle = (-gp.axes[1] + 1) * 0.5;
      }
    }

    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    window.FPVWorld.updateDynamicActors(actors, dt);
    sim.step(dt, {
      throttle: clamp1(keySmooth.throttle + (leftStick.state.active || (sim.altHold && sim.mode !== "ACRO") ? leftStick.state.y : 0) + gpThrottle),
      yaw: clamp1(keySmooth.yaw + leftStick.state.x + gpYaw),
      pitch: clamp1(keySmooth.pitch + rightStick.state.y + gpPitch),
      roll: clamp1(keySmooth.roll + rightStick.state.x + gpRoll),
      rawThrottle01: leftStick.state.active && leftStick.state.rawY01 !== null ? leftStick.state.rawY01 : gpRawThrottle
    }, now);

    if (!leftStick.state.active) {
      leftStick.state.y = !sim.altHold || sim.mode === "ACRO" ? sim.manualThrottle * 2 - 1 : keySmooth.throttle;
      leftStick.state.x = keySmooth.yaw;
      leftStick.renderPuck();
    }
    if (!rightStick.state.active) {
      rightStick.state.x = keySmooth.roll;
      rightStick.state.y = keySmooth.pitch;
      rightStick.renderPuck();
    }

    if (sim.lastGateEvent && sim.lastGateEvent.time !== lastHandledGateTime) {
      lastHandledGateTime = sim.lastGateEvent.time;
      const ev = sim.lastGateEvent;
      const splitTxt = sim.lastSplitDeltaMs !== null
        ? ` · 幽灵机差值 ${sim.lastSplitDeltaMs <= 0 ? "" : "+"}${(sim.lastSplitDeltaMs / 1000).toFixed(2)}s`
        : "";
      showBanner(
        ev.completedLapMs !== null
          ? `🏁 完成整圈穿越! 单圈 ${(ev.completedLapMs / 1000).toFixed(2)}s${ev.isNewPB ? " · 刷新幽灵机 PB 纪录!" : ""}`
          : `通过 ${String(ev.gateNumber).padStart(2, "0")}/${ev.totalGates} 号穿越门${splitTxt}`,
        ev.completedLapMs !== null ? 3400 : 1700
      );
      audio.playGateChime(ev.completedLapMs !== null);
    }

    if (sim.lastCrashEvent && sim.lastCrashEvent.time !== lastHandledCrashTime) {
      lastHandledCrashTime = sim.lastCrashEvent.time;
      audio.playCrashSound(sim.lastCrashEvent.speed);
    }

    if (sim.lastTrickEvent && sim.lastTrickEvent.time !== lastHandledTrickTime) {
      lastHandledTrickTime = sim.lastTrickEvent.time;
      audio.playTrickChime(sim.lastTrickEvent.combo);
    }

    if (sim.lastMissionEvent && sim.lastMissionEvent.time !== lastHandledMissionTime) {
      lastHandledMissionTime = sim.lastMissionEvent.time;
      const ev = sim.lastMissionEvent;
      if (ev.type === "WP_REACHED") {
        showBanner(`到达航点 WP${ev.wpNum}/${ev.total} · 飞往下一航点`, 1600);
        audio.playGateChime(false);
      } else if (ev.type === "MISSION_LOOP") {
        showBanner(`完成全部 ${ev.total} 航点 · 自动循环巡航`, 2200);
        audio.playGateChime(true);
      } else if (ev.type === "RTH_ARRIVED") {
        showBanner("自动返航完成 · 已悬停于 H 起降坪上空", 2800);
        audio.playGateChime(true);
        syncTopDeckUI();
      } else if (ev.type === "MANUAL_TAKEOVER") {
        showBanner("检测到手动打杆 · 已自动切换为人工接管", 2000);
        syncTopDeckUI();
      }
    }

    const tel = sim.getTelemetry();
    audio.update(tel.motors, tel.speedKmh, tel.armed, tel.propWash, sim, renderer.weatherMode);
    renderer.render(sim, dt, now);
    if (!gcsPanel.classList.contains("is-hidden")) {
      gcs.render();
    }

    // Live Hardware RC Transmitter LCD Telemetry Update
    if (!rcController.classList.contains("is-hidden")) {
      lcdArm.textContent = tel.armed ? "ARM" : "LOCK";
      lcdArm.className = "lcd-badge " + (tel.armed ? "is-armed" : "is-disarmed");
      lcdMode.textContent = tel.autopilotMode !== "MANUAL" ? tel.autopilotMode : tel.mode;
      lcdBatt.textContent = `${tel.packVoltage.toFixed(1)}V`;
      if (lcdRssi) {
        lcdRssi.textContent = `${Math.round(tel.vtxMbps || 50)}M`;
      }
      lcdSpd.textContent = `${Math.round(tel.speedKmh)} km/h`;
      lcdAgl.textContent = `${tel.aglM.toFixed(1)} m`;
      lcdVs.textContent = `${tel.vSpeed >= 0 ? "+" : ""}${tel.vSpeed.toFixed(1)}`;
      lcdThr.textContent = `${Math.round(tel.throttlePct)}%`;
      lcdHdg.textContent = `${String(Math.round(tel.headingDeg)).padStart(3, "0")}°`;
      if (tel.proximityAlert) {
        lcdAir.textContent = `⚠ ${tel.proximityAlert.kind}${Math.round(tel.proximityAlert.dist)}m`;
        lcdAir.classList.add("is-warn");
      } else if (tel.comboTimer > 0) {
        lcdAir.textContent = `★${tel.freestyleScore} ×${tel.comboMult.toFixed(1)}`;
        lcdAir.classList.remove("is-warn");
      } else {
        const acCount = actors && actors.aircraft ? actors.aircraft.length : 0;
        lcdAir.textContent = `${acCount} 机巡航`;
        lcdAir.classList.remove("is-warn");
      }
      const pDeg = Math.round((tel.pitchRad * 180) / Math.PI);
      const rDeg = Math.round((tel.rollRad * 180) / Math.PI);
      lcdAtt.textContent = `P:${pDeg >= 0 ? "+" : ""}${pDeg}° R:${rDeg >= 0 ? "+" : ""}${rDeg}°`;
      barT.style.width = `${Math.max(4, Math.min(100, Math.round(tel.throttlePct)))}%`;
      barY.style.width = `${Math.max(4, Math.min(100, Math.round((leftStick.state.x * 0.5 + 0.5) * 100)))}%`;
      barP.style.width = `${Math.max(4, Math.min(100, Math.round((rightStick.state.y * 0.5 + 0.5) * 100)))}%`;
      barR.style.width = `${Math.max(4, Math.min(100, Math.round((rightStick.state.x * 0.5 + 0.5) * 100)))}%`;
    }

    requestAnimationFrame(frame);
  }

  syncSlidersFromPreset();
  updateGcsStatusUI(-1);
  syncTopDeckUI();
  showBanner("v3.0 电影级引擎就绪 · 3D 光线步进穿云 + 双级联CSM软阴影 + 深度SSAO + 动态暴雨/暴雪(按E) + GoPro电影(按C)!", 4800);
  requestAnimationFrame(frame);
})();
