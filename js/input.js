/** Keyboard and touch input. Edges last for one animation frame. */

export const keys = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  override: null,
};

function blank() {
  return {
    x: 0,
    jump: false,
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

export function readInput() {
  if (keys.override) return { ...blank(), ...keys.override };
  const d = keys.down;
  const p = keys.pressed;
  const left = d.has("ArrowLeft") || d.has("KeyA");
  const right = d.has("ArrowRight") || d.has("KeyD");
  return {
    x: (right ? 1 : 0) - (left ? 1 : 0),
    jump: d.has("Space") || d.has("ArrowUp") || d.has("KeyW"),
    jumpPressed: p.has("Space") || p.has("ArrowUp") || p.has("KeyW"),
    dashPressed: p.has("ShiftLeft") || p.has("ShiftRight"),
    attackPressed: p.has("KeyJ") || p.has("KeyK"),
    anchorPressed: p.has("KeyQ"),
    echoPressed: p.has("KeyZ") || p.has("CtrlZ"),
    clearPressed: p.has("KeyX"),
    restartPressed: p.has("KeyR"),
    pausePressed: p.has("Escape"),
    mutePressed: p.has("KeyM"),
    anyPressed: p.size > 0,
  };
}

export function endFrame() {
  keys.pressed.clear();
  keys.released.clear();
}

export function virtualSet(code, down) {
  if (down) {
    if (!keys.down.has(code)) keys.pressed.add(code);
    keys.down.add(code);
  } else if (keys.down.has(code)) {
    keys.down.delete(code);
    keys.released.add(code);
  }
}

export function attachInput(target) {
  const onDown = (e) => {
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing) {
      if (e.code === "Escape") e.target.blur();
      return;
    }
    if (e.repeat) return;
    if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) {
      keys.pressed.add("CtrlZ");
      e.preventDefault();
      return;
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) e.preventDefault();
    if (!keys.down.has(e.code)) keys.pressed.add(e.code);
    keys.down.add(e.code);
  };
  const onUp = (e) => {
    if (keys.down.has(e.code)) keys.released.add(e.code);
    keys.down.delete(e.code);
  };
  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  window.addEventListener("blur", () => keys.down.clear());
}
