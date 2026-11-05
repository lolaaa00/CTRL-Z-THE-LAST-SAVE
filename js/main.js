import { Game } from "./game.js";
import { drawFrame } from "./draw.js";
import { attachInput, endFrame } from "./input.js";
import { mountUI, sync } from "./ui.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const game = new Game();
attachInput(window);
mountUI(game);
game.audio.bindUnlock();

const params = new URLSearchParams(location.search);
if (params.has("debug")) game.debug = true;
const levelParam = Number(params.get("level"));
if (levelParam >= 1 && levelParam <= 5) {
  game.startLevel(levelParam - 1, { force: true, skipIntro: params.has("skip") });
}

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  const step = 1 / 60;
  let edge = true;
  let guard = 0;
  while (acc >= step && guard < 5) {
    game.fixed(step, edge);
    edge = false;
    acc -= step;
    guard += 1;
  }
  endFrame();
  game.frameDt = dt;
  game.audio.tick();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const bw = Math.max(1, Math.floor(w * dpr));
  const bh = Math.max(1, Math.floor(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  drawFrame(ctx, game, w, h, dpr, now / 1000);
  sync(game);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
