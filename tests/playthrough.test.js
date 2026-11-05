import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../js/game.js";
import { defaultSave } from "../js/storage.js";
import { keys } from "../js/input.js";
import { PHYS, STEP, aabb, playerBox, laserMode } from "../js/sim.js";

function supported(solids, x, foot) {
  return solids.some(
    (solid) =>
      !solid.moving &&
      !solid.oneWay &&
      x >= solid.x &&
      x <= solid.x + solid.w &&
      foot >= solid.y - 4 &&
      foot <= solid.y + 22,
  );
}

function gapWidth(solids, player, dir) {
  if (!dir) return 0;
  const foot = player.y + PHYS.H + 8;
  const start = dir > 0 ? player.x + PHYS.W + 4 : player.x - 4;
  let width = 0;
  for (let i = 0; i < 80; i++) {
    const x = start + dir * i * 8;
    if (supported(solids, x, foot)) return width;
    width += 8;
  }
  return width;
}

function echoBox(echo) {
  const sample = echo.samples[Math.min(echo.i, echo.samples.length - 1)];
  return { x: sample.x, y: sample.y, w: PHYS.W, h: PHYS.H };
}

function plateState(game, plate) {
  for (const echo of game.echoes) {
    if (echo.hold && aabb(echoBox(echo), plate)) return "held";
    if (!echo.hold && echo.samples.some((sample) => aabb({ x: sample.x, y: sample.y, w: PHYS.W, h: PHYS.H }, plate))) {
      return "route";
    }
  }
  return "need";
}

function laserBlocks(game, player) {
  const box = { x: player.x - 8, y: player.y + 4, w: PHYS.W + 28, h: PHYS.H - 8 };
  for (const laser of game.level.lasers || []) {
    const mode = laserMode(laser, game.simTime || 0, game.laserSuppressed(laser));
    if (mode === "hot" && aabb(box, laser)) return true;
  }
  return false;
}

function drive(game) {
  const input = {
    x: 0,
    jump: true,
    jumpPressed: false,
    dashPressed: false,
    attackPressed: false,
    echoPressed: false,
    anchorPressed: false,
    clearPressed: false,
  };
  if (game.mode !== "play" || !game.player) return input;
  const player = game.player;
  const level = game.level;
  const plates = level.plates || [];
  const needed = plates.filter((plate) => plateState(game, plate) === "need");
  let target = null;
  if (needed.length && game.echoes.length < game.abilities.echoMax) {
    needed.sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x));
    const plate = needed[0];
    target = { x: plate.x + plate.w / 2, surface: plate.y + plate.h, plate };
  } else if (level.boss) {
    const ledge = level.platforms.find((platform) => platform.kind === "strike");
    target = { x: ledge.x + ledge.w / 2, surface: ledge.y, plate: null };
    const onLedge = player.grounded && Math.abs(player.y + PHYS.H - ledge.y) < 10;
    if (game.vulnerable() && onLedge && Math.abs(player.x + PHYS.W / 2 - target.x) < 80) input.attackPressed = true;
  } else if (level.goal) {
    target = { x: level.goal.x + level.goal.w / 2, surface: player.y + PHYS.H, plate: null };
  } else return input;

  if (target.plate && player.grounded && aabb(playerBox(player), target.plate)) {
    input.x = 0;
    if (Math.abs(player.vx) < 70 && game.buffer.length > 18) input.echoPressed = true;
    return input;
  }

  const dx = target.x - (player.x + PHYS.W / 2);
  let dir = Math.abs(dx) < 16 ? 0 : dx > 0 ? 1 : -1;
  const foot = player.y + PHYS.H;
  const aligned = Math.abs(dx) < 30;
  const rise = foot - target.surface;
  if (rise > 36 && aligned) {
    dir = 0;
    if (player.grounded) input.jumpPressed = true;
    // Second jump near the top of the first, only when the ledge is still above us.
    if (
      game.abilities.doubleJump &&
      !player.grounded &&
      player.jumps === 1 &&
      player.vy > -80 &&
      player.vy < 160 &&
      rise > 28
    ) {
      input.jumpPressed = true;
    }
  }

  const gap = gapWidth(game.solids, player, dir || (dx >= 0 ? 1 : -1));
  const mover = level.platforms.find((platform) => platform.moving);
  if (mover && (dir || 0) >= 0 && rise < 80) {
    const pose = mover._pose || mover;
    const riding = player.riding === mover.id;
    const nearFerry = player.x + PHYS.W > mover.from - 90 && player.x < mover.to + mover.w;
    if (riding || (nearFerry && gap > 420)) {
      if (riding) {
        const arrived = pose.x >= mover.to - 36;
        input.x = arrived ? 1 : 0;
        input.jumpPressed = false;
        input.dashPressed = false;
        return input;
      }
      const home = Math.abs(pose.x - mover.from) < 80;
      const covers = pose.x < player.x + PHYS.W && pose.x + mover.w > player.x + 12;
      input.x = home && covers ? 1 : 0;
      input.jumpPressed = false;
      input.dashPressed = false;
      return input;
    }
  }

  if (dir && player.grounded && rise < 80) {
    if (gap > 36 && gap <= 220) input.jumpPressed = true;
    if (gap > 220 && gap < 460) {
      input.jumpPressed = true;
      input.dashPressed = true;
    }
  }

  if (laserBlocks(game, player)) {
    if (game.abilities.phaseDash) input.dashPressed = true;
    else {
      input.x = 0;
      input.jumpPressed = false;
      input.dashPressed = false;
      return input;
    }
  }

  input.x = dir;

  const onFloor = foot > (level.boss ? 540 : 0);
  if (game.boss?.shockT > 0.16 && game.boss.shockT < 0.48 && player.grounded && onFloor) input.jumpPressed = true;
  if (
    game.abilities.doubleJump &&
    game.boss?.shockT > 0.32 &&
    game.boss.shockT < 0.58 &&
    !player.grounded &&
    player.jumps === 1 &&
    onFloor
  ) {
    input.jumpPressed = true;
  }

  for (const enemy of level.enemies || []) {
    if (!enemy.alive) continue;
    const edx = enemy.x + enemy.w / 2 - (player.x + PHYS.W / 2);
    if (Math.abs(edx) < 140 && Math.abs(enemy.y - player.y) < 90 && player.grounded) input.jumpPressed = true;
    if (Math.abs(edx) < 64 && game.abilities.attack) input.attackPressed = true;
  }
  let threat = null;
  let threatDist = 1e9;
  for (const shot of game.shots) {
    const sx = player.x + PHYS.W / 2 - shot.x;
    const sy = player.y + PHYS.H / 2 - shot.y;
    const dist = Math.hypot(sx, sy);
    const closing = shot.vx * sx + shot.vy * sy;
    if (dist < threatDist && dist < 150 && closing > 0) {
      threat = shot;
      threatDist = dist;
    }
  }
  if (threat) {
    if (game.abilities.attack) input.attackPressed = true;
    const high = level.boss && foot < 520;
    if (!high) {
      input.jumpPressed = true;
      if (Math.abs(threat.x - (player.x + PHYS.W / 2)) > 10) {
        input.x = threat.x < player.x ? 1 : -1;
      }
    }
  }
  return input;
}

function snapshot(game) {
  const player = game.player;
  return {
    t: Number((game.runTime || 0).toFixed(1)),
    mode: game.mode,
    x: player ? Math.round(player.x) : null,
    y: player ? Math.round(player.y) : null,
    echoes: game.echoes.length,
    deaths: game.deaths,
    pips: game.pips,
    hp: game.boss?.hp ?? null,
    plates: (game.level?.plates || []).map((plate) => (plate.pressed ? plate.id.toUpperCase() : plate.id)).join(""),
  };
}

function clearLevel(index, seconds) {
  keys.override = null;
  const game = new Game({ save: defaultSave() });
  game.startLevel(index, { force: true, skipIntro: true });
  const trace = [];
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i++) {
    if (game.screen === "done") return { ok: true, game, trace };
    keys.override = drive(game);
    game.fixed(STEP, true);
    if (i % 90 === 0) trace.push(snapshot(game));
    if (game.deaths > 16) break;
  }
  trace.push(snapshot(game));
  return { ok: game.screen === "done", game, trace };
}

test("simulated runner clears the breach", () => {
  const result = clearLevel(0, 40);
  assert.equal(result.ok, true, JSON.stringify(result.trace.slice(-8)));
});

test("simulated runner clears ghost protocol", () => {
  const result = clearLevel(1, 70);
  assert.equal(result.ok, true, JSON.stringify(result.trace.slice(-8)));
});

test("simulated runner clears the broken timeline", () => {
  const result = clearLevel(2, 90);
  assert.equal(result.ok, true, JSON.stringify(result.trace.slice(-8)));
});

test("simulated runner clears paradox", () => {
  const result = clearLevel(3, 90);
  assert.equal(result.ok, true, JSON.stringify(result.trace.slice(-8)));
});

test("simulated runner shuts down the overseer", () => {
  const result = clearLevel(4, 160);
  assert.equal(result.ok, true, JSON.stringify(result.trace.slice(-12)));
});
