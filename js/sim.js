/** Fixed-step movement, collision, and timeline helpers. No DOM. */

export const PHYS = {
  GRAVITY: 2400,
  JUMP_V: -900,
  DJ_V: -780,
  MAX_RUN: 360,
  ACCEL: 5200,
  FRIC: 4200,
  DASH_V: 920,
  DASH_T: 0.18,
  DASH_CD: 0.52,
  MAX_FALL: 1300,
  COYOTE: 0.11,
  JUMP_BUFFER: 0.12,
  W: 34,
  H: 66,
};

export const STEP = 1 / 60;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function approach(v, target, amount) {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function playerBox(p) {
  return { x: p.x, y: p.y, w: PHYS.W, h: PHYS.H };
}

export function hurtbox(p) {
  return { x: p.x + 7, y: p.y + 6, w: PHYS.W - 14, h: PHYS.H - 8 };
}

export function attackBoxes(p) {
  const w = 50;
  const h = 44;
  const front = {
    x: p.facing >= 0 ? p.x + PHYS.W - 8 : p.x - w + 8,
    y: p.y + 14,
    w,
    h,
  };
  const up = { x: p.x - 20, y: p.y - 34, w: PHYS.W + 40, h: 50 };
  return [front, up];
}

export function createPlayer(x, y, facing = 1) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: facing >= 0 ? 1 : -1,
    grounded: false,
    coyote: 0,
    jumpBuf: 0,
    jumps: 0,
    dashT: 0,
    dashCd: 0,
    iframe: 0,
    atkT: 0,
    atkCd: 0,
    riding: null,
    cutOk: false,
    didJump: false,
    didDash: false,
    didAttack: false,
    landed: false,
  };
}

export function findGround(p, solids) {
  const foot = p.y + PHYS.H;
  let best = null;
  let bestDist = 1e9;
  const inset = 7;
  for (const s of solids) {
    if (s.sensor) continue;
    if (p.x + PHYS.W - inset <= s.x || p.x + inset >= s.x + s.w) continue;
    const dist = s.y - foot;
    if (dist < -4 || dist > 14) continue;
    const better =
      dist < bestDist - 0.5 ||
      (Math.abs(dist - bestDist) <= 0.5 && best && best.moving && !s.moving);
    if (!best || better) {
      best = s;
      bestDist = dist;
    }
  }
  return best;
}

function resolveX(p, solids) {
  for (let pass = 0; pass < 2; pass++) {
    for (const s of solids) {
      if (s.oneWay || s.sensor) continue;
      if (!aabb(playerBox(p), s)) continue;
      const penR = p.x + PHYS.W - s.x;
      const penL = s.x + s.w - p.x;
      if (p.vx > 0 || (p.vx === 0 && penR <= penL)) p.x = s.x - PHYS.W - 0.01;
      else p.x = s.x + s.w + 0.01;
      p.vx = 0;
      if (p.dashT > 0) p.dashT = 0;
    }
  }
}

function resolveY(p, solids, prevFoot) {
  p.landed = false;
  if (p.vy >= 0) {
    let hit = null;
    const foot = p.y + PHYS.H;
    const inset = 6;
    for (const s of solids) {
      if (s.sensor) continue;
      if (p.x + PHYS.W - inset <= s.x || p.x + inset >= s.x + s.w) continue;
      if (prevFoot <= s.y + 3 && foot >= s.y - 0.5) {
        if (!hit || s.y < hit.y || (s.y === hit.y && hit.moving && !s.moving)) hit = s;
      }
    }
    if (hit) {
      p.y = hit.y - PHYS.H;
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
      p.coyote = 0;
      p.landed = true;
      p.riding = hit.moving ? hit.id : null;
      return;
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (const s of solids) {
      if (s.oneWay || s.sensor) continue;
      if (!aabb(playerBox(p), s)) continue;
      const penTop = p.y + PHYS.H - s.y;
      const penBot = s.y + s.h - p.y;
      if (p.vy < 0 || penBot < penTop) {
        p.y = s.y + s.h + 0.01;
        if (p.vy < 0) p.vy = 0;
      } else {
        p.y = s.y - PHYS.H;
        p.vy = 0;
        p.grounded = true;
        p.jumps = 0;
        p.landed = true;
        p.riding = s.moving ? s.id : null;
      }
    }
  }
}

const EMPTY_ABILITIES = { doubleJump: false, attack: false, phaseDash: false };

/**
 * Advance the player one fixed step.
 * `input.x` is -1 | 0 | 1. Pressed flags are edges for this step only.
 */
export function stepPlayer(p, input, solids, dt, abilities = EMPTY_ABILITIES) {
  p.didJump = false;
  p.didDash = false;
  p.didAttack = false;
  p.landed = false;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.atkCd = Math.max(0, p.atkCd - dt);
  p.iframe = Math.max(0, p.iframe - dt);
  if (p.atkT > 0) p.atkT = Math.max(0, p.atkT - dt);

  if (input.attackPressed && p.atkCd <= 0 && abilities.attack) {
    p.atkCd = 0.4;
    p.atkT = 0.12;
    p.didAttack = true;
  }

  const startingDash = input.dashPressed && p.dashCd <= 0 && p.dashT <= 0;
  if (startingDash) {
    const dir = input.x || p.facing || 1;
    p.facing = dir >= 0 ? 1 : -1;
    p.vx = p.facing * PHYS.DASH_V;
    if (p.grounded) p.vy = 0;
    p.dashT = PHYS.DASH_T;
    p.dashCd = PHYS.DASH_CD;
    p.didDash = true;
    p.riding = null;
  }

  if (input.x) p.facing = input.x > 0 ? 1 : -1;

  if (p.dashT > 0) {
    p.vx = p.facing * PHYS.DASH_V;
    p.dashT -= dt;
    if (p.dashT < 0) p.dashT = 0;
  } else {
    const air = !p.grounded;
    const accel = PHYS.ACCEL * (air ? 0.7 : 1);
    const fric = PHYS.FRIC * (air ? 0.2 : 1);
    if (input.x) p.vx = approach(p.vx, input.x * PHYS.MAX_RUN, accel * dt);
    else p.vx = approach(p.vx, 0, fric * dt);
  }

  if (input.jumpPressed) p.jumpBuf = PHYS.JUMP_BUFFER;
  else p.jumpBuf = Math.max(0, p.jumpBuf - dt);

  const maxJ = abilities.doubleJump ? 2 : 1;
  if (p.jumpBuf > 0) {
    if (p.grounded || p.coyote > 0) {
      p.vy = PHYS.JUMP_V;
      p.jumps = 1;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.riding = null;
      p.cutOk = true;
      p.didJump = true;
    } else if (p.jumps > 0 && p.jumps < maxJ) {
      p.vy = PHYS.DJ_V;
      p.jumps += 1;
      p.jumpBuf = 0;
      p.cutOk = true;
      p.didJump = true;
    }
  }

  if (!input.jump && p.cutOk && p.vy < 0) {
    p.vy *= 0.5;
    p.cutOk = false;
  }

  if (p.riding) {
    const ride = solids.find((s) => s.id === p.riding);
    if (ride) {
      p.x += ride.dx || 0;
      p.y += ride.dy || 0;
    } else p.riding = null;
  }

  p.x += p.vx * dt;
  resolveX(p, solids);

  if (!p.didJump && p.grounded) {
    const g = findGround(p, solids);
    if (g) {
      p.y = g.y - PHYS.H;
      p.vy = 0;
      p.riding = g.moving ? g.id : null;
      p.coyote = 0;
      p.jumps = 0;
    } else {
      p.grounded = false;
      p.coyote = PHYS.COYOTE;
      p.riding = null;
    }
  }

  if (!p.grounded) {
    const scale = p.dashT > 0 ? 0.22 : 1;
    p.vy += PHYS.GRAVITY * scale * dt;
    if (p.vy > PHYS.MAX_FALL) p.vy = PHYS.MAX_FALL;
    const prevFoot = p.y + PHYS.H;
    p.y += p.vy * dt;
    const wasAir = true;
    resolveY(p, solids, prevFoot);
    if (wasAir && p.landed) p.coyote = 0;
  }

  if (p.coyote > 0 && !p.grounded) p.coyote -= dt;
}

export function platformPose(p, time) {
  if (!p.moving) return { x: p.x, y: p.y };
  const w = (Math.sin((time / p.period) * Math.PI * 2 + (p.phase || 0)) + 1) / 2;
  if (p.axis === "y") return { x: p.x, y: lerp(p.from, p.to, w) };
  return { x: lerp(p.from, p.to, w), y: p.y };
}

export function laserPhase(laser, time) {
  if (laser.gate) return "hot";
  const on = laser.on ?? 1.1;
  const off = laser.off ?? 1.6;
  const cycle = on + off;
  let t = (time + (laser.phase || 0)) % cycle;
  if (t < 0) t += cycle;
  if (t < on) return "hot";
  if (t > cycle - 0.34) return "warn";
  return "off";
}

export function laserMode(laser, time, suppressed) {
  if (suppressed) return "off";
  if (laser.gate) return "hot";
  return laserPhase(laser, time);
}

export function buildSolids(level) {
  const list = [];
  for (const p of level.platforms) {
    const pose = p.moving ? p._pose || { x: p.x, y: p.y } : p;
    list.push({
      x: pose.x,
      y: pose.y,
      w: p.w,
      h: p.h,
      id: p.id || null,
      moving: !!p.moving,
      oneWay: !!(p.oneWay || p.moving || p.kind === "float" || p.kind === "strike"),
      dx: p._dx || 0,
      dy: p._dy || 0,
      kind: p.kind || "ground",
    });
  }
  for (const d of level.doors || []) {
    if ((d.open || 0) < 0.72) list.push({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id });
  }
  for (const b of level.timed || []) {
    if (b.timer > 0) {
      list.push({
        x: b.bridge.x,
        y: b.bridge.y,
        w: b.bridge.w,
        h: b.bridge.h,
        id: b.id,
        oneWay: true,
      });
    }
  }
  return list;
}

export function updatePlatforms(level, time) {
  for (const p of level.platforms) {
    if (!p.moving) continue;
    const prev = p._pose || platformPose(p, time);
    const pose = platformPose(p, time);
    p._dx = pose.x - prev.x;
    p._dy = pose.y - prev.y;
    p._pose = pose;
  }
}

export function initPlatforms(level) {
  for (const p of level.platforms) {
    if (!p.moving) continue;
    p._pose = platformPose(p, 0);
    p._dx = 0;
    p._dy = 0;
  }
}

export function coversPlate(body, plate) {
  return aabb(body, plate);
}

export function formatTime(t) {
  const safe = Math.max(0, t);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
