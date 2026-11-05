/** Timeline simulation: movement, echoes, puzzles, combat, scoring. */

import { readInput } from "./input.js";
import { createAudio } from "./audio.js";
import { loadSave, writeSave, recordRun, isUnlocked } from "./storage.js";
import { LEVELS, prepareLevel, abilitiesFor, REWARDS } from "./levels.js";
import {
  PHYS,
  aabb,
  playerBox,
  hurtbox,
  attackBoxes,
  createPlayer,
  stepPlayer,
  buildSolids,
  updatePlatforms,
  findGround,
  laserMode,
  approach,
} from "./sim.js";

function quiet(input) {
  return {
    ...input,
    jumpPressed: false,
    dashPressed: false,
    attackPressed: false,
    anchorPressed: false,
    echoPressed: false,
    clearPressed: false,
    restartPressed: false,
    pausePressed: false,
    mutePressed: false,
    anyPressed: false,
  };
}

export class Game {
  constructor(opts = {}) {
    this.save = opts.save || loadSave();
    this.audio = opts.audio || createAudio();
    this.audio.applySettings(this.save.settings);
    this.screen = "title";
    this.level = null;
    this.levelIndex = 0;
    this.mode = "play";
    this.result = null;
    this.toastText = "";
    this.toastT = 0;
    this.objective = "";
    this.hint = "";
    this.hud = null;
    this.particles = [];
    this.floats = [];
    this.shots = [];
    this.echoes = [];
    this.buffer = [];
    this.trail = [];
    this.settingsFrom = "title";
    this.debug = false;
    this.cam = null;
    this.frameDt = 0.016;
    this.shake = 0;
    this.glitch = 0;
    this.flash = 0;
    this.squash = 0;
    this.solids = [];
    this.player = null;
    this.anchor = null;
    this.boss = null;
    this.abilities = null;
    this._eid = 1;
  }

  setScreen(screen) {
    this.screen = screen;
    if (screen === "pause") return;
    const track = screen === "play" ? (this.level?.boss ? "boss" : "level") : "title";
    this.audio.setTrack(track);
  }

  playFromTitle() {
    let index = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      if (!isUnlocked(this.save, i)) break;
      index = i;
      if (!(this.save.levels?.[String(i)]?.clears > 0)) break;
    }
    this.startLevel(index);
  }

  startLevel(index, opts = {}) {
    if (!opts.force && !isUnlocked(this.save, index)) return;
    const level = prepareLevel(index);
    this.levelIndex = index;
    this.level = level;
    this.abilities = abilitiesFor(level, this.save);
    this.player = createPlayer(level.spawn.x, level.spawn.y, 1);
    this.player.grounded = true;
    this.anchor = { x: level.spawn.x, y: level.spawn.y, facing: 1 };
    this.echoes = [];
    this.buffer = [];
    this.bufferFull = false;
    this.shots = [];
    this.particles = [];
    this.floats = [];
    this.trail = [];
    this.simTime = 0;
    this.runTime = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboAt = 0;
    this.deaths = 0;
    this.pips = 3;
    this.mode = opts.skipIntro ? "play" : "intro";
    this.introT = 0;
    this.deadT = 0;
    this.beatT = 0;
    this.rewindT = 0;
    this.rewindSamples = null;
    this.result = null;
    this.toastText = "";
    this.toastT = 0;
    this.shake = 0;
    this.glitch = 0;
    this.flash = 0;
    this.cam = null;
    this._phasePending = false;
    this.boss = level.boss
      ? {
          hp: 9,
          max: 9,
          phase: 1,
          next: 6,
          cool: 1.6,
          telegraph: 0,
          queued: false,
          hurtCd: 0,
          shieldLock: 0,
          shock: 6,
          shockT: 0,
          shockTold: false,
        }
      : null;
    updatePlatforms(level, 0);
    this.solids = buildSolids(level);
    this.setScreen("play");
    this.refreshHud();
  }

  restart() {
    if (this.levelIndex == null) return;
    this.startLevel(this.levelIndex, { force: true, skipIntro: true });
  }

  toggleMute() {
    this.save.settings.mute = !this.save.settings.mute;
    this.audio.applySettings(this.save.settings);
    writeSave(this.save);
    this.toast(this.save.settings.mute ? "MUTED" : "AUDIO ON");
  }

  openSettings() {
    this.settingsFrom = this.screen === "pause" ? "pause" : "title";
    this.setScreen("settings");
  }

  closeSettings() {
    this.setScreen(this.settingsFrom || "title");
  }

  fixed(dt, edge) {
    const input = edge ? readInput() : quiet(readInput());
    if (this.screen !== "play" || !this.level) return;
    if (input.mutePressed) this.toggleMute();
    if (input.pausePressed && this.mode !== "intro") {
      this.screen = "pause";
      this.audio.sfx("ui");
      this.refreshHud();
      return;
    }
    if (this.mode === "intro") {
      this.updateIntro(dt, input);
      this.refreshHud();
      return;
    }
    if (input.restartPressed) {
      this.restart();
      return;
    }
    if (this.mode === "rewind") {
      this.runTime += dt;
      this.updateRewind(dt);
      this.updateVisuals(dt);
      this.refreshHud();
      return;
    }
    if (this.mode === "dead") {
      this.updateDead(dt);
      this.updateVisuals(dt);
      this.refreshHud();
      return;
    }
    if (this.mode === "bossbeat") {
      this.updateBossBeat(dt);
      return;
    }
    this.updatePlay(dt, input);
    this.refreshHud();
  }

  updateIntro(dt, input) {
    this.introT += dt;
    this.updateVisuals(dt);
    if (this.introT > 1.45 || input.anyPressed) this.mode = "play";
  }

  updateRewind(dt) {
    const samples = this.rewindSamples || [];
    this.rewindT += dt;
    const u = Math.min(1, this.rewindT / 0.42);
    const eased = u * u * (3 - 2 * u);
    if (samples.length) {
      const idx = Math.round((1 - eased) * (samples.length - 1));
      const sample = samples[idx];
      this.player.x = sample.x;
      this.player.y = sample.y;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.facing = sample.facing;
    }
    if (u < 1) return;
    this.echoes.push({
      id: this._eid++,
      samples: samples.map((s) => ({ ...s })),
      i: 0,
      hold: samples.length <= 1,
    });
    this.player.x = this.anchor.x;
    this.player.y = this.anchor.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facing = this.anchor.facing;
    this.player.grounded = true;
    this.player.dashT = 0;
    this.buffer = [];
    this.bufferFull = false;
    this.mode = "play";
    this.glitch = Math.max(this.glitch, 0.45);
    this.flash = 0.7;
    this.audio.sfx("echo");
    this.burst(this.anchor.x + 16, this.anchor.y + 20, 18, "#c084fc", 140, 0.5);
    this.toast("ECHO LIVE");
  }

  updateDead(dt) {
    this.deadT += dt;
    if (this.deadT > 0.52) this.respawn();
  }

  updateBossBeat(dt) {
    this.beatT += dt;
    this.updateVisuals(dt);
    this.refreshHud();
    if (this.beatT > 1.75) this.finish();
  }

  updatePlay(dt, input) {
    this.simTime += dt;
    this.runTime += dt;
    if (this.boss) {
      this.boss.hurtCd = Math.max(0, this.boss.hurtCd - dt);
      this.boss.shieldLock = Math.max(0, this.boss.shieldLock - dt);
    }
    updatePlatforms(this.level, this.simTime);
    this.solids = buildSolids(this.level);
    const wasGrounded = this.player.grounded;
    stepPlayer(this.player, input, this.solids, dt, this.abilities);
    if (this.player.didJump) {
      this.audio.sfx("jump");
      this.burst(this.player.x + 16, this.player.y + PHYS.H, 5, "#f4f8ff", 50, 0.25);
    }
    if (this.player.didDash) {
      this.audio.sfx("dash");
      this.burst(this.player.x + 16, this.player.y + 30, 8, "#3ee7ff", 120, 0.3);
      this.shake = Math.min(1, this.shake + (this.save.settings.shake ? 0.18 : 0));
    }
    if (this.player.landed && !wasGrounded) {
      this.audio.sfx("land");
      this.squash = 1;
      this.burst(this.player.x + 16, this.player.y + PHYS.H, 6, "#9aa4b8", 40, 0.28);
    }

    const echoes = this.echoes.slice();
    for (const echo of echoes) this.advanceEcho(echo);
    if (this.player.didAttack) this.swing(this.player);

    this.updateEnemies(dt);
    this.updateShots(dt);
    if (this.mode !== "play") return;

    this.resolveContacts();
    if (this.mode !== "play") return;
    this.resolveHazards();
    if (this.mode !== "play") return;

    this.updatePads();
    if (input.clearPressed) this.clearEchoes();
    else if (input.anchorPressed) this.setAnchor(true);

    this.updatePlates();
    this.updateDoors(dt);
    this.updateTimed(dt);
    this.collectShards();
    this.checkGoal();
    if (this.screen !== "play" || this.mode !== "play") return;
    this.updateBoss(dt);
    if (this.mode !== "play") return;

    this.record();
    if (input.echoPressed && !input.anchorPressed) this.tryCommit();
    this.updateZones();
    if (this._phasePending && this.mode === "play") {
      this._phasePending = false;
      this.onPhase();
    }
    this.updateVisuals(dt);
  }

  advanceEcho(echo) {
    if (echo.hold) return;
    const sample = echo.samples[echo.i];
    if (sample?.attack) this.swing(sample);
    if (echo.i >= echo.samples.length - 1) echo.hold = true;
    else echo.i += 1;
  }

  swing(src) {
    const boxes = attackBoxes(src);
    for (const enemy of this.level.enemies || []) {
      if (!enemy.alive) continue;
      if (!boxes.some((box) => aabb(box, enemy))) continue;
      this.hurtEnemy(enemy, src.facing || 1);
    }
    if (this.boss && this.vulnerable()) {
      const core = this.level.boss.core;
      if (this.boss.hurtCd <= 0 && boxes.some((box) => aabb(box, core))) this.hurtBoss();
    }
    let deflected = false;
    this.shots = this.shots.filter((shot) => {
      if (!boxes.some((box) => aabb(box, shot))) return true;
      deflected = true;
      this.burst(shot.x, shot.y, 4, "#7af6ff", 80, 0.25);
      return false;
    });
    if (deflected) this.award(80, src.x, src.y);
    if (src === this.player) this.audio.sfx("swing");
  }

  updateEnemies(dt) {
    for (const enemy of this.level.enemies || []) {
      if (!enemy.alive) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.type === "wisp") {
        enemy.x += enemy.dir * enemy.speed * dt;
        if (enemy.x < enemy.min) {
          enemy.x = enemy.min;
          enemy.dir = 1;
        } else if (enemy.x > enemy.max) {
          enemy.x = enemy.max;
          enemy.dir = -1;
        }
      } else {
        const span = enemy.max - enemy.min;
        enemy.x = enemy.min + (Math.sin(this.simTime * (enemy.freq || 0.8) + (enemy.phase || 0)) * 0.5 + 0.5) * span;
        enemy.y = enemy.baseY + Math.sin(this.simTime * 2.4 + (enemy.phase || 0)) * 5;
        if (enemy.shoot) {
          enemy.cool -= dt;
          const dx = this.player.x + PHYS.W / 2 - (enemy.x + enemy.w / 2);
          const dy = this.player.y + PHYS.H / 2 - (enemy.y + enemy.h / 2);
          if (enemy.cool <= 0 && Math.abs(dx) < 700) {
            enemy.cool = enemy.rate || 2.3;
            const len = Math.hypot(dx, dy) || 1;
            this.shots.push({
              x: enemy.x + enemy.w / 2,
              y: enemy.y + enemy.h / 2,
              w: 12,
              h: 12,
              vx: (dx / len) * 210,
              vy: (dy / len) * 210,
              life: 4,
            });
            this.audio.sfx("shoot");
          }
        }
      }
    }
  }

  updateShots(dt) {
    for (const shot of this.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
    }
    const w = this.level.w;
    const h = this.level.h;
    this.shots = this.shots.filter((shot) => shot.life > 0 && shot.x > -80 && shot.x < w + 80 && shot.y > -80 && shot.y < h + 160);
  }

  resolveContacts() {
    if (this.player.iframe > 0) return;
    const box = hurtbox(this.player);
    for (const enemy of this.level.enemies || []) {
      if (!enemy.alive) continue;
      if (!aabb(box, enemy)) continue;
      const dir = this.player.x < enemy.x ? -1 : 1;
      this.player.vx = dir * 280;
      this.player.vy = -280;
      this.player.grounded = false;
      this.damagePlayer("hit");
      return;
    }
    for (const shot of this.shots) {
      if (!aabb(box, shot)) continue;
      shot.life = 0;
      this.player.vy = -220;
      this.damagePlayer("hit");
      return;
    }
  }

  resolveHazards() {
    const box = hurtbox(this.player);
    if (this.player.y > this.level.deathY) {
      this.damagePlayer("fatal");
      return;
    }
    for (const hazard of this.level.hazards || []) {
      if (aabb(box, hazard)) {
        this.damagePlayer("fatal");
        return;
      }
    }
    for (const laser of this.level.lasers || []) {
      const mode = laserMode(laser, this.simTime, this.laserSuppressed(laser));
      if (mode === "hot" && aabb(box, laser)) {
        this.damagePlayer("laser");
        return;
      }
    }
    if (this.boss && this.boss.shockT >= 0.72 && this.boss.shockT < 0.94 && this.player.grounded) {
      const ground = findGround(this.player, this.solids);
      if (ground && ground.kind === "ground") this.damagePlayer("fatal");
    }
  }

  laserSuppressed(laser) {
    if (laser.fromPhase && this.boss && this.boss.phase < laser.fromPhase) return true;
    if (laser.plates?.length) {
      return laser.plates.every((id) => this.level.plates.find((plate) => plate.id === id)?.pressed);
    }
    return false;
  }

  updatePads() {
    for (const pad of this.level.pads || []) {
      const on = aabb(playerBox(this.player), pad);
      if (on && !pad.hot) {
        const far = Math.hypot(this.anchor.x - this.player.x, this.anchor.y - this.player.y) > 140;
        if (far || this.buffer.length < 12) this.setAnchor(true);
      }
      pad.hot = on;
    }
  }

  updatePlates() {
    const bodies = this.actorBodies();
    for (const plate of this.level.plates || []) {
      const was = plate.pressed;
      plate.pressed = bodies.some((body) => aabb(body, plate));
      if (plate.pressed && !was) {
        this.audio.sfx("plate");
        this.burst(plate.x + plate.w / 2, plate.y, 10, "#3ee7ff", 90, 0.4);
        if (!plate.awarded) {
          plate.awarded = true;
          this.award(160, plate.x, plate.y);
        }
      }
    }
  }

  updateDoors(dt) {
    for (const door of this.level.doors || []) {
      const open = door.plates.every((id) => this.level.plates.find((plate) => plate.id === id)?.pressed);
      const prev = door.open;
      door.open = approach(door.open || 0, open ? 1 : 0, dt * 2.8);
      if (prev < 0.25 && door.open >= 0.25) this.audio.sfx("door");
    }
  }

  updateTimed(dt) {
    const bodies = this.actorBodies();
    for (const timed of this.level.timed || []) {
      const on = bodies.some((body) => aabb(body, timed.switch));
      if (on && !timed.was) {
        timed.timer = timed.duration;
        this.audio.sfx("plate");
        this.toast("BRIDGE LIVE");
      }
      timed.was = on;
      if (timed.timer > 0) timed.timer = Math.max(0, timed.timer - dt);
    }
  }

  collectShards() {
    const cx = this.player.x + PHYS.W / 2;
    const cy = this.player.y + PHYS.H / 2;
    for (const shard of this.level.shards || []) {
      if (shard.got) continue;
      if (Math.hypot(cx - shard.x, cy - shard.y) > 26) continue;
      shard.got = true;
      this.audio.sfx("shard");
      this.award(500, shard.x, shard.y);
      this.burst(shard.x, shard.y, 14, "#7af6ff", 110, 0.45);
    }
  }

  goalReady() {
    const goal = this.level.goal;
    if (!goal) return false;
    if (!goal.plates?.length) return true;
    return goal.plates.every((id) => this.level.plates.find((plate) => plate.id === id)?.pressed);
  }

  checkGoal() {
    if (!this.level.goal || !this.goalReady()) return;
    if (aabb(playerBox(this.player), this.level.goal)) this.finish();
  }

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.hp <= 0) return;
    const phase = boss.phase;
    const rate = phase === 1 ? 1.55 : phase === 2 ? 1.15 : 0.95;
    if (boss.shieldLock > 0.4) {
      boss.cool = Math.max(boss.cool, 0.4);
      return;
    }
    if (phase >= 3) {
      if (boss.shockT > 0) {
        boss.shockT += dt;
        if (boss.shockT > 0.42 && !boss.shockTold) {
          boss.shockTold = true;
          this.toast("JUMP");
        }
        if (boss.shockT > 1.15) {
          boss.shockT = 0;
          boss.shockTold = false;
        }
      } else {
        boss.shock -= dt;
        if (boss.shock <= 0) {
          boss.shockT = 0.001;
          boss.shock = 5.2;
        }
      }
    }
    if (!boss.queued) {
      boss.cool -= dt;
      if (boss.cool <= 0) {
        boss.queued = true;
        boss.telegraph = 0.38;
        boss.cool = rate;
      }
    } else {
      boss.telegraph -= dt;
      if (boss.telegraph <= 0) {
        boss.queued = false;
        this.fireBoss();
      }
    }
  }

  fireBoss() {
    const boss = this.boss;
    const origin = this.level.boss;
    const speed = boss.phase === 1 ? 150 : boss.phase === 2 ? 195 : 235;
    const spreads = boss.phase === 1 ? [0] : boss.phase === 2 ? [-0.22, 0, 0.22] : [-0.42, -0.2, 0, 0.2, 0.42];
    const ox = origin.x;
    const oy = origin.y + 36;
    const ang = Math.atan2(this.player.y + PHYS.H / 2 - oy, this.player.x + PHYS.W / 2 - ox);
    for (const spread of spreads) {
      const a = ang + spread;
      this.shots.push({
        x: ox,
        y: oy,
        w: 14,
        h: 14,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 5,
      });
    }
    this.audio.sfx("shoot");
  }

  hurtEnemy(enemy, dir) {
    enemy.hp -= 1;
    enemy.flash = 0.12;
    enemy.x += dir * 14;
    this.audio.sfx("hit");
    this.burst(enemy.x, enemy.y, 8, "#ff3d8a", 100, 0.35);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.award(420, enemy.x, enemy.y);
      this.burst(enemy.x + enemy.w / 2, enemy.y, 16, "#c084fc", 160, 0.45);
    }
  }

  hurtBoss() {
    const boss = this.boss;
    boss.hp -= 1;
    boss.hurtCd = 0.48;
    this.audio.sfx("boss");
    this.shake = Math.min(1, this.shake + 0.62);
    this.flash = 0.55;
    const core = this.level.boss.core;
    this.award(700, core.x + core.w / 2, core.y);
    this.burst(core.x + core.w / 2, core.y + core.h / 2, 18, "#f4f8ff", 180, 0.45);
    if (boss.hp <= 0) this.startBeat();
    else if (boss.hp <= boss.next) this._phasePending = true;
  }

  onPhase() {
    const boss = this.boss;
    boss.phase += 1;
    boss.next = boss.phase === 2 ? 3 : -1;
    boss.shieldLock = 2.35;
    boss.cool = 1.3;
    boss.queued = false;
    boss.telegraph = 0;
    this.echoes = [];
    this.buffer = [];
    this.bufferFull = false;
    this.shots = [];
    this.glitch = 0.55;
    this.shake = Math.min(1, this.shake + 0.5);
    this.toast("SHIELD REFORMING");
    this.audio.sfx("door");
  }

  startBeat() {
    this.mode = "bossbeat";
    this.beatT = 0;
    this._phasePending = false;
    this.shake = 1;
    this.glitch = 0.7;
    this.flash = 0.8;
    const core = this.level.boss.core;
    this.burst(core.x + core.w / 2, core.y, 40, "#3ee7ff", 220, 0.8);
    this.burst(this.level.boss.x, this.level.boss.y, 30, "#ff3d8a", 180, 0.7);
    this.toast("OVERSEER OFFLINE");
  }

  actorBodies() {
    const bodies = [playerBox(this.player)];
    for (const echo of this.echoes) bodies.push(this.echoBox(echo));
    return bodies;
  }

  echoBox(echo) {
    const sample = echo.samples[Math.min(echo.i, echo.samples.length - 1)];
    return { x: sample.x, y: sample.y, w: PHYS.W, h: PHYS.H, facing: sample.facing };
  }

  setAnchor(announce) {
    this.anchor = { x: this.player.x, y: this.player.y, facing: this.player.facing };
    this.buffer = [];
    this.bufferFull = false;
    this.audio.sfx("anchor");
    this.burst(this.player.x + PHYS.W / 2, this.player.y + PHYS.H, 8, "#3ee7ff", 70, 0.35);
    if (announce) this.toast("ANCHOR LOCKED");
  }

  tryCommit() {
    if (this.echoes.length >= this.abilities.echoMax) {
      this.toast("ECHO LIMIT — PRESS X");
      this.audio.sfx("ui");
      return;
    }
    if (this.buffer.length < 16) {
      this.toast("HOLD THE LINE LONGER");
      this.audio.sfx("ui");
      return;
    }
    this.mode = "rewind";
    this.rewindT = 0;
    this.rewindSamples = this.buffer.map((s) => ({ ...s }));
    this.audio.sfx("rewind");
    this.glitch = 0.4;
  }

  clearEchoes() {
    if (!this.echoes.length) return;
    for (const echo of this.echoes) {
      const box = this.echoBox(echo);
      this.burst(box.x + 16, box.y + 20, 8, "#c084fc", 90, 0.35);
    }
    this.echoes = [];
    this.audio.sfx("clear");
    this.glitch = 0.28;
    this.toast("ECHOES DISMISSED");
  }

  record() {
    const max = Math.round(this.abilities.buffer * 60);
    if (this.buffer.length >= max) {
      this.bufferFull = true;
      return;
    }
    this.bufferFull = false;
    this.buffer.push({
      x: this.player.x,
      y: this.player.y,
      facing: this.player.facing,
      attack: !!this.player.didAttack,
      dash: this.player.dashT > 0 || !!this.player.didDash,
    });
    this.trail.push({ x: this.player.x, y: this.player.y, facing: this.player.facing });
    if (this.trail.length > 14) this.trail.shift();
  }

  damagePlayer(type) {
    if (this.mode !== "play") return;
    if (type === "laser" && this.abilities.phaseDash && this.player.dashT > 0) return;
    if (type !== "fatal" && this.player.iframe > 0) return;
    if (type === "fatal" || type === "laser") {
      this.die();
      return;
    }
    this.pips -= 1;
    this.player.iframe = 1;
    this.combo = 0;
    this.shake = Math.min(1, this.shake + 0.45);
    this.audio.sfx("hurt");
    this.burst(this.player.x + 16, this.player.y + 20, 10, "#ff3d8a", 120, 0.35);
    if (this.pips <= 0) this.die();
  }

  die() {
    if (this.mode === "dead" || this.mode === "bossbeat") return;
    this.mode = "dead";
    this.deadT = 0;
    this.deaths += 1;
    this.combo = 0;
    this.shake = 1;
    this.glitch = 0.6;
    this.audio.sfx("die");
    this.burst(this.player.x + 16, this.player.y + 20, 22, "#ff3d8a", 160, 0.5);
  }

  respawn() {
    const spot = this.anchor;
    this.player = createPlayer(spot.x, spot.y, spot.facing || 1);
    this.player.grounded = true;
    this.player.iframe = 1.15;
    this.pips = 3;
    this.buffer = [];
    this.bufferFull = false;
    this.shots = [];
    this.mode = "play";
    this.solids = buildSolids(this.level);
    this.unstick(this.player);
  }

  unstick(p) {
    const solids = this.solids.filter((solid) => !solid.oneWay && !solid.sensor);
    for (let i = 0; i < 14; i++) {
      if (!solids.some((solid) => aabb(playerBox(p), solid))) return;
      p.y -= 6;
    }
  }

  award(base, x, y) {
    if (this.runTime - this.comboAt > 4) this.combo = 0;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo || 0, this.combo);
    this.comboAt = this.runTime;
    const gain = Math.round(base * (1 + (this.combo - 1) * 0.5));
    this.score += gain;
    if (x != null) this.floats.push({ x, y: y ?? 0, text: `+${gain}`, life: 0.75, max: 0.75 });
  }

  toast(text) {
    this.toastText = text;
    this.toastT = 3;
  }

  burst(x, y, n, color, speed = 90, life = 0.4) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 300) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life,
        max: life,
        color,
        r: 1.4 + Math.random() * 2.1,
      });
    }
  }

  updateZones() {
    for (const zone of this.level.zones || []) {
      if (zone.fired) continue;
      if (this.player.x >= zone.x && this.player.x <= zone.x + zone.w) {
        zone.fired = true;
        this.toast(zone.text);
      }
    }
  }

  updateVisuals(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.15);
    this.glitch = Math.max(0, this.glitch - dt * 1.35);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.squash = Math.max(0, this.squash - dt * 4.5);
    if (this.toastT > 0) this.toastT -= dt;
    for (const particle of this.particles) {
      particle.vy += 240 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const floater of this.floats) {
      floater.y -= 28 * dt;
      floater.life -= dt;
    }
    this.floats = this.floats.filter((floater) => floater.life > 0);
  }

  vulnerable() {
    if (!this.boss || this.boss.hp <= 0 || this.boss.shieldLock > 0) return false;
    const plates = this.level?.plates || [];
    return plates.length > 0 && plates.every((plate) => plate.pressed);
  }

  hintText() {
    if (!this.level || !this.player) return "";
    if (this.mode === "rewind") return "REWINDING — YOUR ECHO KEEPS THE PATH";
    if (this.mode === "dead") return "SIGNAL LOST";
    if (this.mode === "bossbeat") return "TIMELINE STABILIZING";
    if (this.bufferFull) return "BUFFER FULL — PRESS Q TO DROP A NEW ANCHOR";
    const standing = (this.level.plates || []).find(
      (plate) => this.player.grounded && aabb(playerBox(this.player), plate),
    );
    if (standing && this.echoes.length < this.abilities.echoMax) return "PRESS Z — LEAVE AN ECHO ON THIS PLATE";
    const door = this.level.doors?.[0];
    if (door && door.open < 0.45 && this.player.x > door.x - 280) {
      if (this.echoes.some((echo) => !echo.hold)) return "ECHO IN TRANSIT — HOLD";
      if (this.echoes.length) return "THAT ECHO MISSED THE PLATE — X AND TRY AGAIN";
      return "AN ECHO HAS TO HOLD THE PLATE";
    }
    if (this.level.goal?.plates && !this.goalReady() && aabb(playerBox(this.player), {
      x: this.level.goal.x - 40,
      y: this.level.goal.y - 40,
      w: this.level.goal.w + 80,
      h: this.level.goal.h + 80,
    })) {
      return "THE EXIT IS WAITING ON EVERY ECHO";
    }
    if (this.boss?.shieldLock > 0) return "SHIELD REFORMING — PLANT THE NODES AGAIN";
    if (this.boss && this.vulnerable()) return "CORE EXPOSED — ATTACK FROM THE HIGH LEDGES";
    return this.level.hint || "Q ANCHOR    Z ECHO    X CLEAR";
  }

  refreshHud() {
    if (!this.level) return;
    this.objective = this.level.objective;
    if (this.level.boss && this.boss) {
      if (this.boss.hp <= 0) this.objective = "Timeline stable";
      else if (this.boss.shieldLock > 0) this.objective = "Shield reforming";
      else if (!this.vulnerable()) this.objective = "Fill every node";
      else this.objective = "Strike the core";
    } else if (this.level.doors?.[0]?.open > 0.8) this.objective = "Reach the portal";
    else if (this.level.goal?.plates && this.goalReady()) this.objective = "Enter the portal";
    this.hint = this.hintText();
    const shards = this.level.shards || [];
    this.hud = {
      objective: this.objective,
      hint: this.hint,
      toast: this.toastT > 0 ? this.toastText : "",
      time: this.runTime,
      score: this.score,
      combo: this.combo,
      echoes: this.echoes.length,
      echoMax: this.abilities.echoMax,
      buffer: this.buffer.length / Math.max(1, Math.round(this.abilities.buffer * 60)),
      bufferFull: !!this.bufferFull,
      recording: this.mode === "play" && this.buffer.length > 8,
      shards: shards.filter((shard) => shard.got).length,
      shardMax: shards.length,
      pips: this.pips,
      dash: this.player.dashCd <= 0,
      attack: !!this.abilities.attack,
      boss: !!this.boss,
      bossHp: this.boss ? this.boss.hp / this.boss.max : 0,
      bossPhase: this.boss?.phase || 0,
      vulnerable: !!(this.boss && this.vulnerable()),
      key: this.level.key,
      name: this.level.name,
      blurb: this.level.blurb,
      mode: this.mode,
    };
  }

  finish() {
    if (this.result || !this.level) return;
    const shards = (this.level.shards || []).filter((shard) => shard.got).length;
    const shardMax = (this.level.shards || []).length;
    const time = this.runTime;
    const timeBonus = Math.max(0, Math.round((this.level.par - time) * 45));
    const deathPen = this.deaths * 300;
    const bossBonus = this.level.boss ? 2500 : 0;
    const score = Math.max(0, this.score + timeBonus + bossBonus - deathPen);
    const rank = rankOf({ time, par: this.level.par, shards, shardMax, deaths: this.deaths });
    const recorded = recordRun(this.save, this.levelIndex, {
      time,
      score,
      rank,
      shards,
      name: this.save.settings.name,
    });
    this.result = {
      key: this.level.key,
      name: this.level.name,
      time,
      score,
      rank,
      shards,
      shardMax,
      deaths: this.deaths,
      combo: this.maxCombo || 0,
      timeBonus,
      deathPen,
      bossBonus,
      isNewBest: recorded.isNewBest,
      bestTime: recorded.prev.bestTime,
      unlock: recorded.firstClear ? REWARDS[this.levelIndex] || null : null,
      ending: this.levelIndex === LEVELS.length - 1,
      next: this.levelIndex < LEVELS.length - 1,
    };
    this.audio.sfx("win");
    this.setScreen("done");
  }
}

function rankOf(stats) {
  const all = stats.shardMax <= 0 || stats.shards >= stats.shardMax;
  const half = stats.shards >= Math.ceil((stats.shardMax || 0) / 2);
  if (all && stats.deaths === 0 && stats.time <= stats.par) return "S";
  if (all && stats.deaths <= 2 && stats.time <= stats.par * 1.45) return "A";
  if ((all || half) && stats.time <= stats.par * 2.2) return "B";
  return "C";
}

export { isUnlocked, LEVELS };
