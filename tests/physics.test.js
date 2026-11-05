import test from "node:test";
import assert from "node:assert/strict";
import {
  PHYS,
  STEP,
  createPlayer,
  stepPlayer,
  findGround,
  laserPhase,
  platformPose,
} from "../js/sim.js";
import { computeRank, computeScore } from "../js/score.js";

const AB = { doubleJump: false, attack: false, phaseDash: false };
const DJ = { ...AB, doubleJump: true };

function hold(p, solids, frames, input, ab = AB) {
  for (let i = 0; i < frames; i++) stepPlayer(p, input, solids, STEP, ab);
}

test("resting player stays on the floor", () => {
  const floor = [{ x: 0, y: 800, w: 2000, h: 200, id: "f" }];
  const p = createPlayer(40, 800 - PHYS.H, 1);
  p.grounded = true;
  hold(p, floor, 180, { x: 0, jump: false });
  assert.equal(p.y, 800 - PHYS.H);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.vx) < 1);
});

test("full jump clears 160px and lands back on the floor", () => {
  const floor = [{ x: 0, y: 800, w: 2000, h: 200, id: "f" }];
  const p = createPlayer(40, 800 - PHYS.H, 1);
  p.grounded = true;
  let minY = p.y;
  stepPlayer(p, { x: 0, jump: true, jumpPressed: true }, floor, STEP, AB);
  for (let i = 0; i < 180; i++) {
    stepPlayer(p, { x: 0, jump: true }, floor, STEP, AB);
    if (p.y < minY) minY = p.y;
    if (p.grounded && i > 5) break;
  }
  const height = 800 - PHYS.H - minY;
  assert.ok(height > 160 && height < 190, `jump height ${height}`);
  assert.equal(p.grounded, true);
  assert.equal(p.y, 800 - PHYS.H);
});

test("running jump crosses a 200px gap", () => {
  const solids = [
    { x: 0, y: 800, w: 500, h: 200, id: "a" },
    { x: 700, y: 800, w: 800, h: 200, id: "b" },
  ];
  const p = createPlayer(80, 800 - PHYS.H, 1);
  p.grounded = true;
  let jumped = false;
  for (let i = 0; i < 400; i++) {
    const nearEdge = p.x > 430 && p.grounded && !jumped;
    stepPlayer(p, { x: 1, jump: true, jumpPressed: nearEdge }, solids, STEP, AB);
    if (nearEdge) jumped = true;
    if (jumped && p.grounded && p.x > 720) break;
    if (p.y > 1100) break;
  }
  assert.ok(p.x > 700, `x=${p.x} y=${p.y}`);
  assert.equal(p.grounded, true);
});

test("dash jump crosses a 300px gap", () => {
  const solids = [
    { x: 0, y: 800, w: 600, h: 200, id: "a" },
    { x: 900, y: 800, w: 800, h: 200, id: "b" },
  ];
  const p = createPlayer(80, 800 - PHYS.H, 1);
  p.grounded = true;
  let fired = false;
  for (let i = 0; i < 500; i++) {
    const go = p.x > 520 && p.grounded && !fired;
    stepPlayer(
      p,
      { x: 1, jump: true, jumpPressed: go, dashPressed: go },
      solids,
      STEP,
      AB,
    );
    if (go) fired = true;
    if (fired && p.grounded && p.x > 600) break;
    if (p.y > 1100) break;
  }
  assert.ok(fired);
  assert.ok(p.x > 900 && p.grounded, `x=${p.x} y=${p.y} grounded=${p.grounded}`);
});

test("double jump reaches a platform 220px up", () => {
  const solids = [
    { x: 0, y: 800, w: 800, h: 200, id: "g" },
    { x: 0, y: 580, w: 800, h: 24, id: "high", oneWay: true },
  ];
  const p = createPlayer(80, 800 - PHYS.H, 1);
  p.grounded = true;
  let dj = false;
  let jumped = false;
  for (let i = 0; i < 400; i++) {
    const start = p.grounded && !jumped;
    const second = jumped && !dj && !p.grounded && p.vy > -80 && p.jumps === 1;
    stepPlayer(p, { x: 0, jump: true, jumpPressed: start || second }, solids, STEP, DJ);
    if (start) jumped = true;
    if (second) dj = true;
    if (dj && p.grounded && p.y < 700) break;
  }
  assert.ok(dj, "double jump should fire");
  assert.ok(p.y <= 580 - PHYS.H + 1, `y=${p.y}`);
  assert.equal(findGround(p, solids)?.id, "high");
});

test("wall stops horizontal motion", () => {
  const solids = [
    { x: 0, y: 800, w: 800, h: 200, id: "g" },
    { x: 300, y: 0, w: 40, h: 800, id: "wall" },
  ];
  const p = createPlayer(40, 800 - PHYS.H, 1);
  p.grounded = true;
  hold(p, solids, 120, { x: 1, jump: false }, AB);
  assert.ok(p.x + PHYS.W <= 300.1, `x=${p.x}`);
  assert.ok(p.grounded);
});

test("coyote jump still works just after walking off", () => {
  const solids = [{ x: 0, y: 800, w: 220, h: 200, id: "g" }];
  const p = createPlayer(170, 800 - PHYS.H, 1);
  p.grounded = true;
  let jumped = false;
  for (let i = 0; i < 40; i++) {
    const take = !jumped && !p.grounded && p.coyote > 0;
    stepPlayer(p, { x: 1, jump: true, jumpPressed: take }, solids, STEP, AB);
    if (take) jumped = true;
  }
  assert.equal(jumped, true);
  assert.ok(p.y < 800 - PHYS.H - 30, `y=${p.y}`);
});

test("laser phase cycles hot, off, warn", () => {
  const laser = { on: 1, off: 1, phase: 0 };
  assert.equal(laserPhase(laser, 0), "hot");
  assert.equal(laserPhase(laser, 0.5), "hot");
  assert.equal(laserPhase(laser, 1.1), "off");
  assert.equal(laserPhase(laser, 1.8), "warn");
  assert.equal(laserPhase(laser, 2), "hot");
});

test("moving platform eases between endpoints", () => {
  const p = { moving: true, axis: "x", from: 0, to: 100, period: 2, phase: 0, y: 10 };
  assert.equal(platformPose(p, 0).x, 50);
  const mid = platformPose(p, 0.5);
  assert.ok(mid.x > 50 && mid.x <= 100);
});

test("ranks reward a clean, fast clear", () => {
  const base = { par: 60, shardMax: 2 };
  assert.equal(computeRank({ ...base, time: 50, shards: 2, deaths: 0 }), "S");
  assert.equal(computeRank({ ...base, time: 70, shards: 2, deaths: 1 }), "A");
  assert.equal(computeRank({ ...base, time: 100, shards: 1, deaths: 3 }), "B");
  assert.equal(computeRank({ ...base, time: 200, shards: 0, deaths: 4 }), "C");
  assert.ok(computeScore({ time: 40, par: 60, shards: 2, deaths: 0, combo: 3, boss: false }) > 1000);
});
