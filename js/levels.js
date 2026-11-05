/** Five hand-built timelines. Numbers match the measured jump: ~160px up, ~220px run, dash well past that. */

import { PHYS, initPlatforms } from "./sim.js";

const H = PHYS.H;

function wall(x) {
  return { x, y: -600, w: 80, h: 2400, kind: "wall" };
}
function ground(x, w, y = 800) {
  return { x, y, w, h: 280, kind: "ground" };
}
function float(x, y, w, h = 26) {
  return { x, y, w, h, kind: "float" };
}

const stand = (floor) => floor - H;

export const REWARDS = [
  { name: "DOUBLE JUMP", detail: "Jump again in the air." },
  { name: "PULSE BLADE", detail: "A short slash. Your echoes can swing too." },
  { name: "EXTENDED BUFFER", detail: "Two extra seconds of memory." },
  { name: "PHASE DASH", detail: "Dash straight through lasers." },
];

export const LEVELS = [
  {
    index: 0,
    key: "01",
    name: "THE BREACH",
    objective: "Open the gate",
    blurb: "Leave an echo on the plate.",
    hint: "Q ANCHOR    Z ECHO    X CLEAR",
    theme: "breach",
    par: 55,
    w: 4000,
    h: 1200,
    deathY: 1080,
    echoMax: 1,
    buffer: 10,
    doubleJump: false,
    attack: false,
    phaseDash: false,
    fit: false,
    spawn: { x: 90, y: stand(800) },
    platforms: [
      wall(-80),
      ground(0, 1000),
      ground(1170, 860),
      ground(2320, 1560),
      wall(3920),
      float(1380, 670, 200, 24),
    ],
    plates: [{ id: "a", x: 1680, y: 776, w: 130, h: 24, label: "A" }],
    pads: [{ x: 1260, y: 748, w: 110, h: 52 }],
    doors: [{ id: "gate", x: 2860, y: 0, w: 36, h: 800, plates: ["a"] }],
    lasers: [],
    hazards: [
      { type: "spikes", x: 1040, y: 800, w: 100, h: 48 },
      { type: "spikes", x: 2080, y: 800, w: 200, h: 48 },
    ],
    enemies: [],
    timed: [],
    shards: [
      { x: 1460, y: 620 },
      { x: 2520, y: 700 },
    ],
    goal: { x: 3460, y: 680, w: 110, h: 120 },
    zones: [
      { x: 40, w: 420, text: "A / D MOVE     SPACE JUMP" },
      { x: 1880, w: 220, text: "SHIFT DASHES THE LONG GAP" },
    ],
    decor: [
      { type: "pylon", x: 260, h: 200 },
      { type: "pylon", x: 760, h: 150 },
      { type: "ring", x: 900, y: 430, r: 64 },
      { type: "pylon", x: 2500, h: 220 },
    ],
  },
  {
    index: 1,
    key: "02",
    name: "GHOST PROTOCOL",
    objective: "Hold both plates",
    blurb: "Two echoes. One gate.",
    hint: "PLACE AN ECHO ON EACH PLATE",
    theme: "ghost",
    par: 90,
    w: 4400,
    h: 1200,
    deathY: 1120,
    echoMax: 2,
    buffer: 10,
    doubleJump: false,
    attack: true,
    phaseDash: false,
    fit: false,
    spawn: { x: 110, y: stand(800) },
    platforms: [
      wall(-80),
      ground(0, 2520),
      float(460, 670, 190, 26),
      float(1520, 670, 190, 26),
      {
        id: "m1",
        x: 2420,
        y: 800,
        w: 230,
        h: 30,
        kind: "float",
        moving: true,
        axis: "x",
        from: 2420,
        to: 3040,
        period: 4.6,
        phase: 0,
      },
      ground(3160, 1100),
      wall(4300),
    ],
    plates: [
      { id: "a", x: 495, y: 646, w: 120, h: 24, label: "A" },
      { id: "b", x: 1555, y: 646, w: 120, h: 24, label: "B" },
    ],
    pads: [],
    doors: [{ id: "gate", x: 2140, y: 0, w: 40, h: 800, plates: ["a", "b"] }],
    lasers: [],
    hazards: [{ type: "spikes", x: 2580, y: 900, w: 520, h: 50 }],
    enemies: [
      {
        type: "drone",
        x: 980,
        y: 742,
        baseY: 742,
        w: 48,
        h: 30,
        min: 860,
        max: 1400,
        hp: 3,
        shoot: false,
        freq: 0.55,
        phase: 0.4,
      },
    ],
    timed: [],
    shards: [
      { x: 540, y: 610 },
      { x: 2780, y: 720 },
      { x: 3660, y: 730 },
    ],
    goal: { x: 3860, y: 680, w: 110, h: 120 },
    zones: [{ x: 80, w: 280, text: "ONE ECHO PER PLATE. X ERASES THEM." }],
    decor: [
      { type: "arch", x: 800, y: 520, w: 180, h: 280 },
      { type: "arch", x: 1800, y: 540, w: 150, h: 260 },
    ],
  },
  {
    index: 2,
    key: "03",
    name: "BROKEN TIMELINE",
    objective: "Cross the broken grid",
    blurb: "Lasers, a locked barrier, a moving bridge.",
    hint: "AN ECHO CAN HOLD THE BARRIER OPEN",
    theme: "broken",
    par: 110,
    w: 4700,
    h: 1200,
    deathY: 1120,
    echoMax: 2,
    buffer: 10,
    doubleJump: false,
    attack: true,
    phaseDash: false,
    fit: false,
    spawn: { x: 90, y: stand(800) },
    platforms: [
      wall(-80),
      ground(0, 1820),
      float(1360, 680, 180, 26),
      {
        id: "m1",
        x: 1740,
        y: 800,
        w: 220,
        h: 30,
        kind: "float",
        moving: true,
        axis: "x",
        from: 1740,
        to: 2380,
        period: 4.2,
        phase: 1.2,
      },
      ground(2500, 2000),
      wall(4540),
    ],
    plates: [{ id: "a", x: 1390, y: 656, w: 120, h: 24, label: "A" }],
    pads: [{ x: 1200, y: 748, w: 110, h: 52 }],
    doors: [],
    lasers: [
      { x: 640, y: 500, w: 16, h: 300, on: 1.15, off: 1.95, phase: 0 },
      { x: 860, y: 500, w: 16, h: 300, on: 1.15, off: 1.95, phase: 0 },
      { x: 1040, y: 500, w: 16, h: 300, on: 1.15, off: 1.95, phase: 0 },
      { x: 1630, y: 470, w: 20, h: 330, gate: true, plates: ["a"] },
    ],
    hazards: [{ type: "spikes", x: 1900, y: 900, w: 520, h: 46 }],
    enemies: [
      { type: "wisp", x: 3200, y: 760, w: 40, h: 40, min: 3080, max: 3480, hp: 2, speed: 70, dir: 1 },
      {
        type: "drone",
        x: 3700,
        y: 720,
        baseY: 720,
        w: 46,
        h: 30,
        min: 3560,
        max: 4000,
        hp: 3,
        shoot: true,
        rate: 2.4,
        freq: 0.6,
        phase: 1,
      },
    ],
    timed: [
      {
        id: "t1",
        duration: 3.6,
        switch: { x: 2860, y: 752, w: 80, h: 48 },
        bridge: { x: 2980, y: 660, w: 210, h: 22 },
      },
    ],
    shards: [
      { x: 760, y: 720 },
      { x: 3070, y: 610 },
      { x: 4200, y: 720 },
    ],
    goal: { x: 4320, y: 680, w: 110, h: 120 },
    zones: [
      { x: 480, w: 160, text: "WAIT. THE CORRIDOR GOES DARK TOGETHER." },
      { x: 1180, w: 80, text: "ANCHOR HERE, THEN ECHO THE PLATE." },
    ],
    decor: [
      { type: "cable", x: 400, y: 280, w: 700 },
      { type: "cable", x: 2600, y: 240, w: 900 },
      { type: "pylon", x: 2700, h: 180 },
    ],
  },
  {
    index: 3,
    key: "04",
    name: "PARADOX",
    objective: "Open the paradox gate",
    blurb: "Three islands. Three echoes.",
    hint: "DOUBLE JUMP REACHES THE HIGH PLATE",
    theme: "paradox",
    par: 130,
    w: 2200,
    h: 1400,
    deathY: 1220,
    echoMax: 3,
    buffer: 12,
    doubleJump: true,
    attack: true,
    phaseDash: false,
    fit: false,
    spawn: { x: 900, y: stand(860) },
    platforms: [
      wall(-80),
      ground(30, 320, 860),
      ground(530, 900, 860),
      ground(1750, 340, 860),
      wall(2140),
      float(820, 640, 300, 26),
    ],
    plates: [
      { id: "a", x: 140, y: 836, w: 120, h: 24, label: "A" },
      { id: "b", x: 1860, y: 836, w: 120, h: 24, label: "B" },
      { id: "c", x: 910, y: 616, w: 120, h: 24, label: "C" },
    ],
    pads: [{ x: 860, y: 808, w: 120, h: 52 }],
    doors: [],
    lasers: [],
    hazards: [
      { type: "spikes", x: 360, y: 980, w: 150, h: 40 },
      { type: "spikes", x: 1460, y: 980, w: 260, h: 40 },
    ],
    enemies: [
      { type: "wisp", x: 40, y: 820, w: 34, h: 40, min: 36, max: 90, hp: 2, speed: 50, dir: 1 },
      { type: "wisp", x: 1980, y: 820, w: 34, h: 40, min: 1980, max: 2050, hp: 2, speed: 50, dir: -1 },
    ],
    timed: [],
    shards: [
      { x: 200, y: 760 },
      { x: 1960, y: 760 },
      { x: 960, y: 580 },
    ],
    goal: { x: 1240, y: 720, w: 120, h: 140, plates: ["a", "b", "c"] },
    zones: [{ x: 860, w: 160, text: "Q RESETS THE ANCHOR. THREE ECHOES OPEN THE EXIT." }],
    decor: [
      { type: "ring", x: 980, y: 280, r: 90 },
      { type: "ring", x: 980, y: 280, r: 130 },
    ],
  },
  {
    index: 4,
    key: "05",
    name: "THE LAST SAVE",
    objective: "Shut down the Overseer",
    blurb: "Fill the nodes. Strike the core.",
    hint: "THREE NODES DROP THE SHIELD",
    theme: "core",
    par: 180,
    w: 1280,
    h: 720,
    deathY: 900,
    echoMax: 3,
    buffer: 10,
    doubleJump: true,
    attack: true,
    phaseDash: true,
    fit: true,
    spawn: { x: 620, y: stand(600) },
    platforms: [
      { x: 0, y: -30, w: 1280, h: 30, kind: "wall" },
      wall(-40),
      { x: 1280, y: -30, w: 40, h: 800, kind: "wall" },
      ground(0, 1280, 600),
      float(80, 480, 180, 24),
      float(1020, 480, 180, 24),
      float(860, 400, 150, 22),
      { x: 530, y: 380, w: 200, h: 24, kind: "strike" },
    ],
    plates: [
      { id: "a", x: 110, y: 456, w: 120, h: 24, label: "A" },
      { id: "b", x: 1050, y: 456, w: 120, h: 24, label: "B" },
      { id: "c", x: 570, y: 356, w: 120, h: 24, label: "C" },
    ],
    pads: [{ x: 590, y: 548, w: 120, h: 52 }],
    doors: [],
    lasers: [
      { x: 400, y: 468, w: 14, h: 132, on: 0.8, off: 1.55, phase: 0, fromPhase: 2 },
      { x: 790, y: 468, w: 14, h: 132, on: 0.8, off: 1.55, phase: 0.75, fromPhase: 2 },
    ],
    hazards: [],
    enemies: [],
    timed: [],
    shards: [
      { x: 160, y: 430 },
      { x: 1100, y: 430 },
    ],
    goal: null,
    boss: { x: 640, y: 214, r: 68, core: { x: 600, y: 248, w: 140, h: 122 } },
    zones: [{ x: 560, w: 200, text: "ECHOES HOLD THE NODES. YOU STRIKE THE CORE." }],
    decor: [{ type: "ring", x: 640, y: 470, r: 220 }],
  },
];

export function prepareLevel(index) {
  const level = structuredClone(LEVELS[index]);
  level.index = index;
  for (const door of level.doors || []) door.open = 0;
  for (const shard of level.shards || []) shard.got = false;
  for (const plate of level.plates || []) {
    plate.pressed = false;
    plate.awarded = false;
  }
  for (const pad of level.pads || []) pad.hot = false;
  for (const zone of level.zones || []) zone.fired = false;
  for (const timed of level.timed || []) {
    timed.timer = 0;
    timed.was = false;
  }
  for (const enemy of level.enemies || []) {
    enemy.alive = true;
    enemy.hp = enemy.hp ?? 2;
    enemy.maxHp = enemy.hp;
    enemy.flash = 0;
    enemy.cool = 0.6;
    enemy.dir = enemy.dir || 1;
    enemy.baseY = enemy.baseY ?? enemy.y;
  }
  initPlatforms(level);
  return level;
}

export function abilitiesFor(level, save) {
  const cleared = (i) => (save?.levels?.[String(i)]?.clears || 0) > 0;
  return {
    doubleJump: !!(level.doubleJump || cleared(0)),
    attack: !!(level.attack || cleared(1)),
    phaseDash: !!(level.phaseDash || cleared(3)),
    echoMax: level.echoMax,
    buffer: level.buffer + (cleared(2) ? 2 : 0),
  };
}
