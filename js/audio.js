/** Procedural soundtrack and effects. No external audio files. */

export function createAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx = null;
  let master = null;
  let music = null;
  let sfxBus = null;
  let delay = null;
  let drone = null;
  let nextNote = 0;
  let stepIndex = 0;
  let track = "title";
  const settings = { music: 70, sfx: 85, mute: false };

  function ensure() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain();
    music = ctx.createGain();
    sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.21;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1800;
    music.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(comp);
    music.connect(comp);
    sfxBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 55;
    o2.frequency.value = 82.4;
    o1.connect(g);
    o2.connect(g);
    g.connect(music);
    o1.start();
    o2.start();
    drone = g;
    applyGains();
  }

  function applyGains() {
    if (!master) return;
    master.gain.value = settings.mute ? 0 : 1;
    music.gain.value = (settings.music / 100) * 0.22;
    sfxBus.gain.value = settings.sfx / 100;
    if (drone) drone.gain.value = track === "boss" ? 0.07 : track === "title" ? 0.035 : 0.05;
  }

  function envGain(t, peak, dur, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  function tone(freq, dur, type, peak, slide, when) {
    if (!ctx || settings.mute || settings.sfx <= 0) return;
    const t = when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    const g = envGain(t, peak, dur, sfxBus);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, peak, freq) {
    if (!ctx || settings.mute || settings.sfx <= 0) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq || 900;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    src.start();
  }

  function freq(semi, root = 48) {
    return 440 * 2 ** ((root + semi - 69) / 12);
  }

  function schedule(step, time) {
    const scale = [0, 3, 7, 10, 12, 15, 19, 22];
    const root = track === "boss" ? 45 : track === "title" ? 45 : 48;
    const sparse = track === "title" ? 4 : track === "boss" ? 1 : 2;
    if (step % sparse === 0) {
      const semi = scale[step % scale.length];
      const o = ctx.createOscillator();
      o.type = track === "boss" ? "triangle" : "sine";
      o.frequency.setValueAtTime(freq(semi, root + 12), time);
      const g = envGain(time, track === "title" ? 0.05 : 0.07, 0.18, music);
      o.connect(g);
      o.start(time);
      o.stop(time + 0.2);
    }
    if (step % 4 === 0) {
      const bassSemi = [0, 0, 10, 7][(step / 4) % 4];
      const o = ctx.createOscillator();
      o.type = track === "boss" ? "square" : "sine";
      o.frequency.setValueAtTime(freq(bassSemi, root - 12), time);
      const g = envGain(time, track === "boss" ? 0.09 : 0.06, 0.22, music);
      o.connect(g);
      o.start(time);
      o.stop(time + 0.24);
    }
    if (track !== "title" && step % 2 === 0) noise(0.03, 0.015, 2500);
  }

  return {
    bindUnlock() {
      if (typeof window === "undefined") return;
      const go = () => {
        ensure();
        if (ctx && ctx.state === "suspended") ctx.resume();
      };
      window.addEventListener("pointerdown", go, { passive: true });
      window.addEventListener("keydown", go);
    },
    unlock() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
    },
    applySettings(next) {
      settings.music = Number(next.music ?? settings.music);
      settings.sfx = Number(next.sfx ?? settings.sfx);
      settings.mute = !!next.mute;
      applyGains();
    },
    setTrack(next) {
      if (next === track) return;
      track = next;
      stepIndex = 0;
      nextNote = 0;
      applyGains();
    },
    tick() {
      if (!ctx || settings.mute || settings.music <= 0) return;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;
      const bpm = track === "boss" ? 126 : track === "title" ? 74 : 102;
      const spb = 60 / bpm / 2;
      if (nextNote < now) nextNote = now + 0.04;
      let guard = 0;
      while (nextNote < now + 0.25 && guard++ < 8) {
        schedule(stepIndex, nextNote);
        stepIndex += 1;
        nextNote += spb;
      }
    },
    sfx(name) {
      ensure();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      switch (name) {
        case "jump":
          tone(420, 0.09, "square", 0.05, 760);
          break;
        case "dash":
          noise(0.1, 0.08, 1400);
          tone(180, 0.12, "sawtooth", 0.04, 70);
          break;
        case "land":
          noise(0.06, 0.05, 400);
          break;
        case "anchor":
          tone(660, 0.08, "sine", 0.06, 990);
          break;
        case "rewind":
          tone(720, 0.38, "sawtooth", 0.04, 90);
          noise(0.3, 0.03, 600);
          break;
        case "echo":
          tone(880, 0.16, "sine", 0.07, 660);
          tone(1320, 0.22, "sine", 0.04, 880);
          break;
        case "clear":
          tone(300, 0.16, "triangle", 0.05, 90);
          break;
        case "plate":
          tone(520, 0.09, "square", 0.05, 780);
          break;
        case "door":
          tone(140, 0.22, "sine", 0.06, 70);
          noise(0.12, 0.04, 500);
          break;
        case "shard":
          tone(880, 0.08, "sine", 0.05, 1320);
          tone(1320, 0.12, "sine", 0.04, 1760);
          break;
        case "swing":
          noise(0.05, 0.05, 1800);
          tone(240, 0.06, "square", 0.03, 90);
          break;
        case "hit":
          noise(0.08, 0.08, 900);
          tone(160, 0.08, "square", 0.05, 70);
          break;
        case "hurt":
          tone(200, 0.16, "sawtooth", 0.06, 60);
          break;
        case "die":
          tone(240, 0.35, "sawtooth", 0.07, 40);
          noise(0.25, 0.06, 700);
          break;
        case "shoot":
          tone(260, 0.07, "square", 0.04, 90);
          break;
        case "boss":
          noise(0.18, 0.1, 500);
          tone(90, 0.28, "sine", 0.08, 40);
          break;
        case "win":
          [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "sine", 0.06, f, ctx.currentTime + i * 0.09));
          break;
        case "ui":
          tone(640, 0.05, "sine", 0.04, 880);
          break;
        default:
          break;
      }
    },
  };
}
