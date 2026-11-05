/** Art direction: near-black space, electric cyan, purple, magenta. Geometric, not photographic. */

import { PHYS, clamp, laserMode } from "./sim.js";

const THEMES = {
  breach: { sky0: "#07060e", sky1: "#160a22", accent: "#3ee7ff", accent2: "#b06bff", building: "#140a1e" },
  ghost: { sky0: "#070612", sky1: "#180a28", accent: "#d7c4ff", accent2: "#3ee7ff", building: "#120818" },
  broken: { sky0: "#0c0610", sky1: "#240810", accent: "#ff4d8d", accent2: "#3ee7ff", building: "#1a0812" },
  paradox: { sky0: "#060814", sky1: "#101636", accent: "#8d86ff", accent2: "#3ee7ff", building: "#0c1022" },
  core: { sky0: "#0a0612", sky1: "#2a0a1c", accent: "#ff3d8a", accent2: "#7af6ff", building: "#160610" },
};

const glows = new Map();
const cities = new Map();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glow(color, size) {
  const key = `${color}:${size}`;
  if (glows.has(key)) return glows.get(key);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  glows.set(key, canvas);
  return canvas;
}

function city(level) {
  if (cities.has(level.index)) return cities.get(level.index);
  const rand = mulberry32(400 + level.index * 91);
  const blocks = [];
  for (let i = 0; i < 22; i++) {
    blocks.push({
      x: rand() * level.w,
      w: 36 + rand() * 110,
      h: 70 + rand() * 260,
      win: rand() > 0.45,
    });
  }
  cities.set(level.index, blocks);
  return blocks;
}

function themeOf(level) {
  return THEMES[level?.theme] || THEMES.breach;
}

function panel(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawFrame(ctx, game, w, h, dpr, now = 0) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const menu = !game.level || ["title", "select", "controls", "settings"].includes(game.screen);
  if (menu) {
    drawTitle(ctx, w, h, now);
    return;
  }
  drawWorld(ctx, game, w, h, now);
}

function drawTitle(ctx, w, h, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#07060e");
  sky.addColorStop(0.55, "#120818");
  sky.addColorStop(1, "#07060c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(62,231,255,0.18)";
  ctx.lineWidth = 1;
  const drift = (now * 18) % 48;
  for (let x = -48 + drift; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.42);
    ctx.lineTo(x + w * 0.08, h);
    ctx.stroke();
  }
  ctx.restore();

  const rand = mulberry32(7);
  for (let i = 0; i < 16; i++) {
    const x = rand() * w;
    const bh = 80 + rand() * (h * 0.28);
    ctx.fillStyle = i % 2 ? "#100818" : "#160c22";
    ctx.fillRect(x, h * 0.72 - bh, 40 + rand() * 70, bh);
    if (rand() > 0.5) {
      ctx.fillStyle = "rgba(62,231,255,0.35)";
      ctx.fillRect(x + 10, h * 0.72 - bh + 16, 4, 10);
    }
  }

  const ground = h * 0.74;
  ctx.fillStyle = "#0c0d14";
  ctx.fillRect(w * 0.16, ground, w * 0.68, 18);
  ctx.fillStyle = "#3ee7ff";
  ctx.fillRect(w * 0.16, ground, w * 0.68, 2);

  const cycle = (now % 7) / 7;
  const echoX = w * (0.28 + Math.min(0.22, cycle * 0.5));
  const held = cycle > 0.42;
  const plateX = w * 0.46;
  const playerX = held ? w * (0.58 + Math.min(0.16, (cycle - 0.42) * 0.45)) : w * 0.62;

  drawPlateMark(ctx, plateX, ground - 8, 54, held, now);
  drawHero(ctx, echoX, ground - PHYS.H, {
    facing: 1,
    t: now,
    walk: held ? 0.15 : 0.8,
    echo: true,
  });
  drawHero(ctx, playerX, ground - PHYS.H, {
    facing: 1,
    t: now,
    walk: held ? 0.7 : 0.2,
    echo: false,
  });

  ctx.strokeStyle = "rgba(176,107,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w * 0.84, ground - 46, 28 + Math.sin(now * 2) * 2, now, now + 4.2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(62,231,255,0.8)";
  ctx.beginPath();
  ctx.arc(w * 0.84, ground - 46, 16, -now * 1.4, -now * 1.4 + 3.4);
  ctx.stroke();

  vignette(ctx, w, h, 0.55);
}

function drawWorld(ctx, game, w, h, now) {
  const level = game.level;
  const theme = themeOf(level);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, theme.sky0);
  sky.addColorStop(1, theme.sky1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const cam = viewCamera(game, w, h);
  const parallax = cam.x * 0.25;
  ctx.save();
  ctx.translate(-parallax * 0.2, 0);
  for (const block of city(level)) {
    ctx.fillStyle = theme.building;
    ctx.fillRect(block.x - parallax, h * 0.78 - block.h * 0.45, block.w, block.h * 0.45);
    if (block.win) {
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(block.x - parallax + 8, h * 0.78 - block.h * 0.45 + 12, 3, 8);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(-cam.x * cam.z, -cam.y * cam.z);
  ctx.scale(cam.z, cam.z);

  for (const decor of level.decor || []) drawDecor(ctx, decor, theme, now, level);
  drawBuffer(ctx, game);
  drawAnchor(ctx, game, now);

  for (const platform of level.platforms) {
    if (platform.kind === "wall") continue;
    const pose = platform._pose || platform;
    drawPlatform(ctx, pose.x, pose.y, platform.w, platform.h, platform.kind, theme);
  }
  for (const timed of level.timed || []) {
    const live = timed.timer > 0;
    ctx.save();
    ctx.globalAlpha = live ? 1 : 0.28;
    drawPlatform(ctx, timed.bridge.x, timed.bridge.y, timed.bridge.w, timed.bridge.h, "float", theme);
    ctx.restore();
    drawSwitch(ctx, timed.switch, live, now, theme);
  }
  for (const hazard of level.hazards || []) drawSpikes(ctx, hazard);
  for (const plate of level.plates || []) drawPlate(ctx, plate, now, theme);
  for (const pad of level.pads || []) drawPad(ctx, pad, now);
  for (const laser of level.lasers || []) drawLaser(ctx, laser, game, theme);
  for (const door of level.doors || []) drawDoor(ctx, door, theme, now);
  if (level.goal) drawGoal(ctx, level.goal, game.goalReady(), now, theme);
  for (const shard of level.shards || []) if (!shard.got) drawShard(ctx, shard, now, theme);

  if (game.boss && level.boss) {
    if (game.boss.shockT > 0) {
      const hot = game.boss.shockT >= 0.72;
      ctx.fillStyle = hot ? "rgba(255,61,138,0.42)" : "rgba(255,61,138,0.16)";
      ctx.fillRect(8, 586, level.w - 16, hot ? 20 : 10);
    }
    drawBoss(ctx, game, now);
  }

  for (const enemy of level.enemies || []) if (enemy.alive) drawEnemy(ctx, enemy, now, theme);
  for (const shot of game.shots) drawShot(ctx, shot);

  for (const echo of game.echoes) drawEcho(ctx, echo, now);
  if (game.player) {
    const p = game.player;
    const speed = Math.min(1, Math.abs(p.vx) / PHYS.MAX_RUN);
    drawHero(ctx, p.x, p.y, {
      facing: p.facing,
      t: now,
      walk: p.grounded ? speed : 0.25,
      attack: p.atkT > 0 ? 1 : 0,
      dash: p.dashT > 0 ? 1 : 0,
      echo: false,
      squash: game.squash,
      vy: p.vy,
      hurt: p.iframe > 0 && Math.sin(now * 40) > 0,
    });
  }

  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.r, particle.r);
    ctx.globalAlpha = 1;
  }
  ctx.font = "600 12px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  for (const floater of game.floats) {
    ctx.globalAlpha = Math.max(0, floater.life / floater.max);
    ctx.fillStyle = "#f4f8ff";
    ctx.fillText(floater.text, floater.x, floater.y);
    ctx.globalAlpha = 1;
  }

  if (game.debug) drawDebug(ctx, game);
  ctx.restore();

  vignette(ctx, w, h, 0.62);
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(244,248,255,${game.flash * 0.18})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (game.glitch > 0.05) {
    ctx.fillStyle = `rgba(62,231,255,${game.glitch * 0.08})`;
    ctx.fillRect(-6, 0, w, h);
    ctx.fillStyle = `rgba(255,61,138,${game.glitch * 0.07})`;
    ctx.fillRect(6, 0, w, h);
    ctx.fillStyle = `rgba(255,255,255,${game.glitch * 0.15})`;
    for (let i = 0; i < 4; i++) {
      const y = ((now * 120 + i * 90) % h);
      ctx.fillRect(0, y, w, 2);
    }
  }
}

function viewCamera(game, w, h) {
  const level = game.level;
  const allow = game.save?.settings?.shake !== false;
  const mag = allow ? game.shake : 0;
  const sx = Math.sin((game.simTime || 0) * 47) * mag * 8;
  const sy = Math.cos((game.simTime || 0) * 39) * mag * 6;
  if (level.fit) {
    const z = Math.min(w / level.w, h / level.h) * 0.96;
    const visW = w / z;
    const visH = h / z;
    return { z, x: (level.w - visW) / 2 + sx, y: (level.h - visH) / 2 + sy };
  }
  const z = clamp(h / 820, 0.85, 1.45);
  const visW = w / z;
  const visH = h / z;
  const p = game.player;
  let tx = p.x + PHYS.W / 2 + (p.facing || 1) * 70 - visW * 0.4;
  let ty = p.y + 10 - visH * 0.58;
  tx = clamp(tx, 0, Math.max(0, level.w - visW));
  ty = clamp(ty, 0, Math.max(0, level.h - visH));
  if (!game.cam) game.cam = { x: tx, y: ty };
  const k = 1 - Math.exp(-7 * (game.frameDt || 0.016));
  game.cam.x += (tx - game.cam.x) * k;
  game.cam.y += (ty - game.cam.y) * k;
  return { z, x: game.cam.x + sx, y: game.cam.y + sy };
}

function drawPlatform(ctx, x, y, w, h, kind, theme) {
  const floaty = kind === "float" || kind === "strike";
  ctx.fillStyle = floaty ? "#14151e" : "#0c0d13";
  panel(ctx, x, y, w, Math.min(h, floaty ? h : 150), floaty ? 3 : 0);
  ctx.fill();
  ctx.fillStyle = kind === "strike" ? theme.accent2 : theme.accent;
  ctx.fillRect(x + 4, y, Math.max(8, w - 8), 2);
  if (kind === "strike") {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x + 4, y + h - 2, Math.max(8, w - 8), 2);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.stroke();
  if (!floaty && w > 80) {
    ctx.strokeStyle = "rgba(62,231,255,0.05)";
    ctx.beginPath();
    for (let gx = x + 24; gx < x + w; gx += 48) {
      ctx.moveTo(gx, y + 8);
      ctx.lineTo(gx, y + 28);
    }
    ctx.stroke();
  }
}

function drawPlate(ctx, plate, now, theme) {
  const cx = plate.x + plate.w / 2;
  const cy = plate.y + plate.h / 2;
  const sprite = glow(plate.pressed ? "rgba(62,231,255,0.55)" : "rgba(176,107,255,0.25)", 90);
  if (sprite) ctx.drawImage(sprite, cx - 45, cy - 40, 90, 80);
  ctx.fillStyle = plate.pressed ? "rgba(62,231,255,0.9)" : "rgba(80,40,120,0.85)";
  panel(ctx, plate.x, plate.y + 6, plate.w, 10, 5);
  ctx.fill();
  ctx.strokeStyle = plate.pressed ? "#f4fdff" : theme.accent2;
  ctx.stroke();
  if (plate.label) {
    ctx.fillStyle = plate.pressed ? "#041016" : "#f4f8ff";
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(plate.label, cx, plate.y);
  }
  ctx.strokeStyle = plate.pressed ? "rgba(62,231,255,0.8)" : "rgba(176,107,255,0.4)";
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 16 + Math.sin(now * 3 + plate.x) * 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlateMark(ctx, x, y, w, on, now) {
  drawPlate(ctx, { x: x - w / 2, y, w, h: 18, pressed: on, label: "" }, now, THEMES.breach);
}

function drawPad(ctx, pad, now) {
  ctx.strokeStyle = "rgba(62,231,255,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.x, pad.y + pad.h - 8, pad.w, 8);
  ctx.fillStyle = "rgba(62,231,255,0.7)";
  ctx.font = "500 10px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("ANCHOR", pad.x + pad.w / 2, pad.y - 14 + Math.sin(now * 2) * 1);
}

function drawLaser(ctx, laser, game, theme) {
  const mode = laserMode(laser, game.simTime || 0, game.laserSuppressed(laser));
  if (mode === "off") return;
  const hot = mode === "hot";
  const color = hot ? "rgba(255,245,250,0.95)" : "rgba(255,61,138,0.45)";
  const sprite = glow(hot ? "rgba(255,61,138,0.65)" : "rgba(255,61,138,0.2)", 64);
  if (sprite && hot) ctx.drawImage(sprite, laser.x + laser.w / 2 - 32, laser.y, 64, laser.h);
  ctx.fillStyle = color;
  ctx.fillRect(laser.x, laser.y, laser.w, laser.h);
  if (hot) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(laser.x + laser.w / 2 - 1, laser.y, 2, laser.h);
  }
}

function drawDoor(ctx, door, theme, now) {
  const remain = 1 - (door.open || 0);
  if (remain <= 0.02) return;
  const top = door.y + door.h * (1 - remain);
  const height = door.h * remain;
  ctx.save();
  ctx.beginPath();
  ctx.rect(door.x - 8, top, door.w + 16, height);
  ctx.clip();
  ctx.fillStyle = "rgba(62,231,255,0.14)";
  ctx.fillRect(door.x, top, door.w, height);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  const stripes = Math.ceil(height / 18);
  for (let i = 0; i < stripes; i++) {
    const y = top + ((i * 18 + now * 40) % Math.max(18, height));
    ctx.beginPath();
    ctx.moveTo(door.x + 4, y);
    ctx.lineTo(door.x + door.w - 4, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(244,248,255,0.85)";
  ctx.fillRect(door.x + door.w / 2 - 1, top, 2, height);
  ctx.restore();
}

function drawGoal(ctx, goal, ready, now, theme) {
  const cx = goal.x + goal.w / 2;
  const cy = goal.y + goal.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = ready ? 1 : 0.4;
  ctx.strokeStyle = ready ? theme.accent : theme.accent2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 26, now * 1.2, now * 1.2 + 4.4);
  ctx.stroke();
  ctx.strokeStyle = ready ? "#f4fdff" : theme.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 14, -now, -now + 3.6);
  ctx.stroke();
  ctx.restore();
}

function drawShard(ctx, shard, now, theme) {
  const sprite = glow("rgba(122,246,255,0.8)", 48);
  if (sprite) ctx.drawImage(sprite, shard.x - 24, shard.y - 24, 48, 48);
  ctx.save();
  ctx.translate(shard.x, shard.y);
  ctx.rotate(now * 1.6);
  ctx.fillStyle = theme.accent2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 0);
  ctx.lineTo(0, 9);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSwitch(ctx, sw, live, now, theme) {
  ctx.save();
  ctx.translate(sw.x + sw.w / 2, sw.y + 8);
  ctx.rotate(now);
  ctx.strokeStyle = live ? theme.accent : theme.accent2;
  ctx.lineWidth = 2;
  ctx.strokeRect(-8, -8, 16, 16);
  ctx.restore();
}

function drawSpikes(ctx, hazard) {
  ctx.fillStyle = "#2a1020";
  const n = Math.max(1, Math.floor(hazard.w / 16));
  for (let i = 0; i < n; i++) {
    const x = hazard.x + i * 16;
    ctx.beginPath();
    ctx.moveTo(x, hazard.y + hazard.h);
    ctx.lineTo(x + 8, hazard.y);
    ctx.lineTo(x + 16, hazard.y + hazard.h);
    ctx.fill();
  }
}

function drawDecor(ctx, decor, theme, now, level) {
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  if (decor.type === "pylon") {
    const base = 800;
    ctx.beginPath();
    ctx.moveTo(decor.x, base);
    ctx.lineTo(decor.x, base - decor.h);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(decor.x - 3, base - decor.h, 6, 6);
  } else if (decor.type === "ring") {
    ctx.beginPath();
    ctx.arc(decor.x, decor.y, decor.r, now * 0.2, now * 0.2 + 5);
    ctx.stroke();
  } else if (decor.type === "arch") {
    ctx.beginPath();
    ctx.moveTo(decor.x, decor.y + decor.h);
    ctx.lineTo(decor.x, decor.y + 30);
    ctx.quadraticCurveTo(decor.x + decor.w / 2, decor.y, decor.x + decor.w, decor.y + 30);
    ctx.lineTo(decor.x + decor.w, decor.y + decor.h);
    ctx.stroke();
  } else if (decor.type === "cable") {
    ctx.beginPath();
    ctx.moveTo(decor.x, decor.y);
    ctx.bezierCurveTo(decor.x + decor.w * 0.3, decor.y + 80, decor.x + decor.w * 0.6, decor.y - 20, decor.x + decor.w, decor.y + 40);
    ctx.stroke();
  }
  ctx.restore();
  void level;
}

function drawEnemy(ctx, enemy, now, theme) {
  ctx.save();
  if (enemy.flash > 0) ctx.globalAlpha = 0.45;
  if (enemy.type === "wisp") {
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    ctx.rotate(now * 2);
    ctx.fillStyle = "#1a1024";
    ctx.strokeStyle = theme.accent2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff3d8a";
    ctx.fillRect(-2, -2, 4, 4);
  } else {
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    ctx.fillStyle = "#10141e";
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    panel(ctx, -enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d9fbff";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShot(ctx, shot) {
  const sprite = glow("rgba(255,61,138,0.8)", 28);
  if (sprite) ctx.drawImage(sprite, shot.x - 8, shot.y - 8, 28, 28);
  ctx.fillStyle = "#fff5fb";
  ctx.fillRect(shot.x, shot.y, shot.w, shot.h);
}

function drawBoss(ctx, game, now) {
  const layout = game.level.boss;
  const state = game.boss;
  const vulnerable = game.vulnerable();
  ctx.save();
  ctx.translate(layout.x, layout.y);
  const spin = now * (vulnerable ? 0.5 : 1.5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = vulnerable ? "rgba(244,253,255,0.45)" : "rgba(255,61,138,0.85)";
  for (let i = 0; i < 6; i++) {
    const spread = vulnerable ? 0.3 : 0.62;
    ctx.beginPath();
    ctx.arc(0, 0, layout.r + (vulnerable ? 26 : 16), spin + i * 1.05, spin + i * 1.05 + spread);
    ctx.stroke();
  }
  const grd = ctx.createRadialGradient(-8, -10, 8, 0, 0, layout.r);
  grd.addColorStop(0, vulnerable ? "#f7fdff" : "#3a1458");
  grd.addColorStop(0.4, vulnerable ? "#7af6ff" : "#7c3aed");
  grd.addColorStop(1, "#120610");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, layout.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = vulnerable ? "#f4fdff" : "#c4b5fd";
  ctx.stroke();
  ctx.fillStyle = state.queued ? "#fff" : vulnerable ? "#f4fdff" : "#07060e";
  ctx.beginPath();
  if (vulnerable) ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
  else ctx.ellipse(0, 0, state.queued ? 12 : 6, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const core = layout.core;
  ctx.save();
  ctx.translate(core.x + core.w / 2, core.y + core.h / 2);
  ctx.rotate(now * (vulnerable ? 2.2 : 0.6));
  ctx.globalAlpha = vulnerable ? 1 : 0.4;
  ctx.fillStyle = vulnerable ? "rgba(122,246,255,0.45)" : "rgba(255,61,138,0.15)";
  ctx.strokeStyle = vulnerable ? "#f4fdff" : "#ff3d8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(14, 0);
  ctx.lineTo(0, 26);
  ctx.lineTo(-14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBuffer(ctx, game) {
  const buffer = game.buffer || [];
  if (buffer.length < 2 || game.mode === "intro") return;
  ctx.beginPath();
  ctx.strokeStyle = game.mode === "rewind" ? "rgba(255,255,255,0.8)" : "rgba(62,231,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 7]);
  for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer[i];
    const x = sample.x + PHYS.W / 2;
    const y = sample.y + PHYS.H - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawAnchor(ctx, game, now) {
  if (!game.anchor) return;
  const x = game.anchor.x + PHYS.W / 2;
  const y = game.anchor.y + PHYS.H;
  ctx.strokeStyle = "rgba(62,231,255,0.8)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(x, y - 2, 14 + Math.sin(now * 3) * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x, y - 64);
  ctx.stroke();
}

function drawEcho(ctx, echo, now) {
  const idx = Math.min(echo.i, echo.samples.length - 1);
  for (let k = 3; k >= 1; k--) {
    const sample = echo.samples[Math.max(0, idx - k * 3)];
    ctx.save();
    ctx.globalAlpha = 0.1;
    drawHero(ctx, sample.x, sample.y, { facing: sample.facing, t: now, echo: true, walk: 0.3 });
    ctx.restore();
  }
  const sample = echo.samples[idx];
  drawHero(ctx, sample.x, sample.y, {
    facing: sample.facing,
    t: now,
    echo: true,
    walk: echo.hold ? 0.12 : 0.75,
    attack: sample.attack ? 1 : 0,
    dash: sample.dash ? 1 : 0,
  });
  if (echo.hold) {
    ctx.strokeStyle = "rgba(216,180,254,0.95)";
    ctx.strokeRect(sample.x + 6, sample.y + PHYS.H - 4, PHYS.W - 12, 3);
  }
}

function drawHero(ctx, x, y, opt) {
  const facing = opt.facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + PHYS.W / 2, y + PHYS.H + 1);
  const stretch = opt.vy < -220 ? 1.07 : 1;
  const squat = 1 - (opt.squash || 0) * 0.14;
  ctx.scale(facing, stretch * squat);
  if (!opt.echo) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(0, 1, 11, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const walk = opt.walk || 0;
  const bob = Math.sin((opt.t || 0) * (walk > 0.2 ? 14 : 3)) * (walk > 0.2 ? 1.8 : 0.5);
  const leg = Math.sin((opt.t || 0) * 13) * walk * 6;
  ctx.translate(0, bob);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const edge = opt.echo ? "#e9d5ff" : "#46506a";
  const fill = opt.echo ? "rgba(20,12,32,0.45)" : "#14161f";
  ctx.strokeStyle = edge;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3, -10);
  ctx.lineTo(-6 - leg * 0.3, -2);
  ctx.moveTo(3, -10);
  ctx.lineTo(7 + leg * 0.3, -2);
  ctx.stroke();
  ctx.strokeStyle = opt.echo ? "#ff8ad4" : "#ff3d8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8 - leg * 0.2, -2);
  ctx.lineTo(-2 - leg * 0.2, -2);
  ctx.moveTo(5 + leg * 0.2, -2);
  ctx.lineTo(11 + leg * 0.2, -2);
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, -36);
  ctx.lineTo(-13, -12);
  ctx.lineTo(9, -14);
  ctx.lineTo(11, -38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  panel(ctx, -8, -50, 16, 18, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opt.echo ? "rgba(28,16,40,0.6)" : "#1a1d28";
  panel(ctx, -11, -48, 22, 7, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opt.echo ? "rgba(10,8,18,0.55)" : "#0e1016";
  ctx.beginPath();
  ctx.moveTo(-10, -46);
  ctx.quadraticCurveTo(-14, -64, 0, -67);
  ctx.quadraticCurveTo(13, -62, 10, -46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = opt.echo ? "#d8b4fe" : "#3ee7ff";
  ctx.shadowBlur = 10;
  ctx.fillStyle = opt.echo ? "#f3e8ff" : "#e7fdff";
  panel(ctx, -7, -56, 15, 5, 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = opt.echo ? "#c084fc" : "#3ee7ff";
  ctx.fillRect(-5, -55, 10, 2);
  ctx.strokeStyle = opt.echo ? "#ff8ad4" : "#ff3d8a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, -44);
  ctx.lineTo(13, -38);
  ctx.lineTo(10, -32);
  ctx.stroke();
  if (opt.attack) {
    ctx.strokeStyle = "rgba(122,246,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, -38, 15, -1, 0.9);
    ctx.stroke();
  }
  if (opt.dash && !opt.echo) {
    ctx.strokeStyle = "rgba(62,231,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(-18, -42);
    ctx.lineTo(-30, -38);
    ctx.moveTo(-16, -30);
    ctx.lineTo(-26, -28);
    ctx.stroke();
  }
  if (opt.hurt) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(-14, -67, 28, 66);
  }
  ctx.restore();
}

function drawDebug(ctx, game) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,0,0.4)";
  ctx.lineWidth = 1;
  for (const solid of game.solids || []) {
    ctx.strokeRect(solid.x, solid.y, solid.w, solid.h);
  }
  if (game.player) {
    ctx.strokeStyle = "#0f0";
    const p = game.player;
    ctx.strokeRect(p.x, p.y, PHYS.W, PHYS.H);
  }
  ctx.restore();
}

function vignette(ctx, w, h, alpha) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
