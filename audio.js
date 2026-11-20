// AeroVeloce FPV — Game-Grade Multi-Harmonic Brushless Quadcopter, Prop-Wash Flutter, Radial Biplane Doppler & Tactile SFX Engine
(function (global) {
  "use strict";

  class FPVAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.oscillators = [];
      this.subOscs = [];
      this.gains = [];
      this.masterGain = null;
      this.motorFilter = null;
      this.windGain = null;
      this.windFilter = null;
      this.washGain = null;
      this.washLfo = null;
      this.biplaneOsc = null;
      this.biplaneGain = null;
    }

    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0;

      // Subtle soft-clipping dynamics compressor so 6S punch-outs sound punchy without clipping
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      // Resonant lowpass + gentle waveshaper warmth for 3-blade 5" carbon props
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1450;
      filter.Q.value = 1.65;

      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 127.5) - 1;
        curve[i] = Math.tanh(x * 1.85);
      }
      shaper.curve = curve;
      filter.connect(shaper);
      shaper.connect(this.masterGain);
      this.motorFilter = filter;

      // 4 brushless motors: sawtooth stator fundamental + 3x blade-passing triangle harmonic
      const detunes = [-11, 7, -5, 13];
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const bladeOsc = this.ctx.createOscillator();
        const bladeGain = this.ctx.createGain();
        const g = this.ctx.createGain();

        osc.type = "sawtooth";
        osc.detune.value = detunes[i];
        osc.frequency.value = 165;

        bladeOsc.type = "triangle";
        bladeOsc.detune.value = detunes[i] * 1.3;
        bladeOsc.frequency.value = 495;
        bladeGain.gain.value = 0.38;

        g.gain.value = 0.0;
        osc.connect(g);
        bladeOsc.connect(bladeGain);
        bladeGain.connect(g);
        g.connect(filter);

        osc.start();
        bladeOsc.start();
        this.oscillators.push(osc);
        this.subOscs.push(bladeOsc);
        this.gains.push(g);
      }

      // Shared broadband aerodynamic noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

      // 1) High-speed airframe wind rush
      const windNoise = this.ctx.createBufferSource();
      windNoise.buffer = noiseBuffer;
      windNoise.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = "bandpass";
      this.windFilter.frequency.value = 540;
      this.windFilter.Q.value = 0.85;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      windNoise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      windNoise.start();

      // 2) Prop-Wash Vortex Turbulence Flutter ("洗桨颤振声")
      const washNoise = this.ctx.createBufferSource();
      washNoise.buffer = noiseBuffer;
      washNoise.loop = true;
      const washFilter = this.ctx.createBiquadFilter();
      washFilter.type = "bandpass";
      washFilter.frequency.value = 210;
      washFilter.Q.value = 2.4;
      const washModGain = this.ctx.createGain();
      washModGain.gain.value = 0.5;
      this.washLfo = this.ctx.createOscillator();
      this.washLfo.type = "sine";
      this.washLfo.frequency.value = 15.5;
      const lfoAmp = this.ctx.createGain();
      lfoAmp.gain.value = 0.48;
      this.washLfo.connect(lfoAmp);
      lfoAmp.connect(washModGain.gain);
      this.washGain = this.ctx.createGain();
      this.washGain.gain.value = 0.0;

      washNoise.connect(washFilter);
      washFilter.connect(washModGain);
      washModGain.connect(this.washGain);
      this.washGain.connect(this.masterGain);
      washNoise.start();
      this.washLfo.start();

      // 3) Nearby Piston Biplane Radial Engine Rumble (with real-time 3D Doppler shift!)
      this.biplaneOsc = this.ctx.createOscillator();
      this.biplaneOsc.type = "sawtooth";
      this.biplaneOsc.frequency.value = 92;
      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = "lowpass";
      bpFilter.frequency.value = 340;
      bpFilter.Q.value = 2.2;
      this.biplaneGain = this.ctx.createGain();
      this.biplaneGain.gain.value = 0.0;
      this.biplaneOsc.connect(bpFilter);
      bpFilter.connect(this.biplaneGain);
      this.biplaneGain.connect(this.masterGain);
      this.biplaneOsc.start();

      // 4) Dynamic Weather Ambience (Rainstorm patter vs. Alpine Blizzard wind howl)
      const wxNoise = this.ctx.createBufferSource();
      wxNoise.buffer = noiseBuffer;
      wxNoise.loop = true;
      this.weatherFilter = this.ctx.createBiquadFilter();
      this.weatherFilter.type = "bandpass";
      this.weatherFilter.frequency.value = 1600;
      this.weatherFilter.Q.value = 0.7;
      this.weatherGain = this.ctx.createGain();
      this.weatherGain.gain.value = 0.0;
      wxNoise.connect(this.weatherFilter);
      this.weatherFilter.connect(this.weatherGain);
      this.weatherGain.connect(this.masterGain);
      wxNoise.start();
    }

    setEnabled(flag) {
      this.enabled = Boolean(flag);
      if (this.enabled) {
        this.init();
        if (this.ctx && this.ctx.state === "suspended") {
          this.ctx.resume();
        }
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.enabled ? 0.24 : 0.0, this.ctx.currentTime, 0.06);
      }
    }

    update(motors, speedKmh, armed, propWash, sim, weatherMode) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;

      // Dynamic Rainstorm / Alpine Blizzard Ambience
      if (this.weatherGain && this.weatherFilter) {
        if (weatherMode === "rain") {
          this.weatherFilter.frequency.setTargetAtTime(2150, now, 0.15);
          this.weatherFilter.Q.setTargetAtTime(0.55, now, 0.15);
          this.weatherGain.gain.setTargetAtTime(0.11, now, 0.18);
        } else if (weatherMode === "snow") {
          this.weatherFilter.frequency.setTargetAtTime(420 + Math.sin(now * 0.8) * 110, now, 0.15);
          this.weatherFilter.Q.setTargetAtTime(2.6, now, 0.15);
          this.weatherGain.gain.setTargetAtTime(0.095, now, 0.18);
        } else {
          this.weatherGain.gain.setTargetAtTime(0.0, now, 0.18);
        }
      }

      // Nearby Piston Biplane 3D Doppler Engine Sound (audible even if disarmed!)
      if (sim && sim.nearestBiplane && sim.nearestBiplane.dist < 185) {
        const nb = sim.nearestBiplane;
        const ac = nb.ac;
        const prox = Math.pow(Math.max(0, 1 - nb.dist / 185), 1.85);
        const dx = ac.x - sim.pos[0], dy = ac.y - sim.pos[1], dz = ac.z - sim.pos[2];
        const d = Math.max(2, nb.dist);
        const rvx = (ac.vx || 0) - sim.vel[0];
        const rvy = (ac.vy || 0) - sim.vel[1];
        const rvz = (ac.vz || 0) - sim.vel[2];
        // Radial closing speed (>0 receding, <0 approaching)
        const radialVel = (dx * rvx + dy * rvy + dz * rvz) / d;
        const doppler = Math.max(0.68, Math.min(1.45, 343 / (343 + radialVel)));
        this.biplaneOsc.frequency.setTargetAtTime(94 * doppler, now, 0.05);
        this.biplaneGain.gain.setTargetAtTime(prox * 0.16, now, 0.06);
      } else if (this.biplaneGain) {
        this.biplaneGain.gain.setTargetAtTime(0.0, now, 0.08);
      }

      if (!armed) {
        for (let i = 0; i < 4; i++) this.gains[i].gain.setTargetAtTime(0.0, now, 0.05);
        this.windGain.gain.setTargetAtTime(0.0, now, 0.08);
        if (this.washGain) this.washGain.gain.setTargetAtTime(0.0, now, 0.06);
        return;
      }

      let avg = 0;
      for (let i = 0; i < 4; i++) {
        const m = motors[i] || 0;
        avg += m;
        const freq = 148 + Math.pow(m, 1.12) * 760;
        this.oscillators[i].frequency.setTargetAtTime(freq, now, 0.024);
        this.subOscs[i].frequency.setTargetAtTime(freq * 3.0, now, 0.024);
        this.gains[i].gain.setTargetAtTime(0.032 + m * 0.072, now, 0.03);
      }
      avg *= 0.25;
      this.motorFilter.frequency.setTargetAtTime(780 + avg * 2900, now, 0.035);

      const speedNorm = Math.min(1, speedKmh / 155);
      this.windFilter.frequency.setTargetAtTime(340 + speedNorm * 1350, now, 0.05);
      this.windGain.gain.setTargetAtTime(speedNorm * 0.15, now, 0.05);

      const pw = Math.max(0, Math.min(1, propWash || 0));
      if (this.washGain && this.washLfo) {
        this.washLfo.frequency.setTargetAtTime(13 + pw * 11, now, 0.05);
        this.washGain.gain.setTargetAtTime(pw * 0.22, now, 0.04);
      }
    }

    playSwitchClick(up) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(up ? 1950 : 1480, now);
      osc.frequency.exponentialRampToValueAtTime(up ? 720 : 540, now + 0.022);
      g.gain.setValueAtTime(0.11, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    }

    playKnobTick() {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.014);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    }

    playArmTone(armed) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const notes = armed ? [1046.5, 1318.5, 1568.0] : [1318.5, 987.77];
      notes.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = f;
        const t0 = now + idx * 0.055;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.09);
      });
    }

    playCrashSound(impactSpeed) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const intensity = Math.min(1, Math.max(0.25, (impactSpeed || 12) / 32));
      // Low carbon-frame thud
      const thud = this.ctx.createOscillator();
      const tg = this.ctx.createGain();
      thud.type = "sawtooth";
      thud.frequency.setValueAtTime(135, now);
      thud.frequency.exponentialRampToValueAtTime(34, now + 0.19);
      tg.gain.setValueAtTime(0.26 * intensity, now);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      thud.connect(tg);
      tg.connect(this.ctx.destination);
      thud.start(now);
      thud.stop(now + 0.24);
    }

    playTrickChime(combo) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const base = 523.25 * Math.min(1.6, 1 + (combo - 1) * 0.08);
      [base, base * 1.25].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + idx * 0.045;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      });
    }

    playGateChime(isLap) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const notes = isLap ? [659.25, 880, 1318.5, 1760] : [587.33, 880];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, now + idx * 0.06);
        g.gain.exponentialRampToValueAtTime(0.15, now + idx * 0.06 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.24);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.26);
      });
    }
  }

  global.FPVAudio = { FPVAudioEngine };
})(window);
