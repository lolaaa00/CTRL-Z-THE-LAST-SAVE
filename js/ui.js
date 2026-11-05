/** DOM shell around the canvas. Menus, HUD, settings, touch buttons. */

import { LEVELS } from "./levels.js";
import { isUnlocked, writeSave, clearedCount } from "./storage.js";
import { formatTime } from "./sim.js";
import { virtualSet } from "./input.js";

let root = null;

export function mountUI(game) {
  root = document.body;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    game.audio.unlock();
    game.audio.sfx("ui");
    if (action === "play") game.playFromTitle();
    else if (action === "select") game.setScreen("select");
    else if (action === "controls") game.setScreen("controls");
    else if (action === "settings") game.openSettings();
    else if (action === "back") game.setScreen("title");
    else if (action === "settings-back") game.closeSettings();
    else if (action === "resume") game.setScreen("play");
    else if (action === "restart") game.restart();
    else if (action === "quit") {
      game.level = null;
      game.setScreen("title");
    } else if (action === "next" && game.result?.next) game.startLevel(game.levelIndex + 1, { force: true });
    else if (action === "retry") game.restart();
  });

  document.getElementById("cards").addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (!card || card.classList.contains("locked")) return;
    game.audio.sfx("ui");
    game.startLevel(Number(card.dataset.level));
  });
  document.getElementById("cards").addEventListener("pointermove", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    showBoard(game, Number(card.dataset.level));
  });

  const settings = game.save.settings;
  const music = document.getElementById("music");
  const sfx = document.getElementById("sfx");
  const mute = document.getElementById("mute");
  const shake = document.getElementById("shake");
  const name = document.getElementById("name");
  music.value = settings.music;
  sfx.value = settings.sfx;
  mute.checked = !!settings.mute;
  shake.checked = settings.shake !== false;
  name.value = settings.name || "SAVER";
  const persist = () => {
    game.save.settings.music = Number(music.value);
    game.save.settings.sfx = Number(sfx.value);
    game.save.settings.mute = mute.checked;
    game.save.settings.shake = shake.checked;
    game.save.settings.name = name.value;
    game.audio.applySettings(game.save.settings);
    writeSave(game.save);
  };
  for (const el of [music, sfx, mute, shake, name]) el.addEventListener("input", persist);

  for (const button of document.querySelectorAll("#touch [data-key]")) {
    const code = button.dataset.key;
    const down = (event) => {
      event.preventDefault();
      virtualSet(code, true);
    };
    const up = (event) => {
      event.preventDefault();
      virtualSet(code, false);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointerleave", up);
    button.addEventListener("pointercancel", up);
  }

  window.addEventListener("keydown", (event) => {
    if (game.screen === "play") return;
    if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA")) return;
    const panel = document.querySelector(`.panel-${game.screen === "select" ? "select" : game.screen}`);
    if (!panel) return;
    const buttons = [...panel.querySelectorAll("button:not([disabled])")];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    if (event.code === "ArrowDown" || event.code === "ArrowRight") {
      buttons[(index + 1 + buttons.length) % buttons.length].focus();
      event.preventDefault();
    } else if (event.code === "ArrowUp" || event.code === "ArrowLeft") {
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
      event.preventDefault();
    }
  });

  buildCards();
  sync(game);
}

function buildCards() {
  const host = document.getElementById("cards");
  host.replaceChildren();
  LEVELS.forEach((level, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.level = String(index);
    button.innerHTML = `<span class="key">${level.key}</span><strong>${level.name}</strong><span class="meta"></span><span class="rank-letter">–</span>`;
    host.appendChild(button);
  });
}

let boardShown = -1;
let screenShown = "";

export function sync(game) {
  if (root.dataset.screen !== game.screen) {
    root.dataset.screen = game.screen;
    screenShown = game.screen;
    const panel = document.querySelector(`.panel-${game.screen}`);
    const first = panel?.querySelector("button, input");
    if (first && game.screen !== "play") first.focus();
    if (game.screen === "select") showBoard(game, 0);
  }
  const progress = document.getElementById("title-progress");
  if (progress) progress.textContent = `${clearedCount(game.save)} / ${LEVELS.length} CLEARED`;

  for (const card of document.querySelectorAll(".card")) {
    const index = Number(card.dataset.level);
    const unlocked = isUnlocked(game.save, index);
    const data = game.save.levels?.[String(index)];
    card.classList.toggle("locked", !unlocked);
    card.disabled = !unlocked;
    const meta = card.querySelector(".meta");
    const letter = card.querySelector(".rank-letter");
    if (!unlocked) {
      meta.textContent = "LOCKED";
      letter.textContent = "–";
      card.dataset.rank = "";
    } else if (data?.bestTime != null) {
      meta.textContent = formatTime(data.bestTime);
      letter.textContent = data.bestRank || "C";
      card.dataset.rank = data.bestRank || "C";
    } else {
      meta.textContent = "NO RECORD";
      letter.textContent = "–";
      card.dataset.rank = "";
    }
  }

  if (game.screen === "play" || game.screen === "pause") paintHud(game);
  if (game.screen === "done" && game.result) paintDone(game);
  if (game.screen === "pause" && game.level) {
    document.getElementById("pause-name").textContent = game.level.name;
  }
}

function showBoard(game, index) {
  if (boardShown === index && screenShown === "select") return;
  boardShown = index;
  const list = document.getElementById("board");
  const runs = game.save.runs?.[String(index)] || [];
  const level = LEVELS[index];
  list.replaceChildren();
  if (!runs.length) {
    const li = document.createElement("li");
    li.textContent = `${level.name} — no runs yet`;
    list.appendChild(li);
    return;
  }
  runs.slice(0, 5).forEach((run, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${i + 1}</span><span>${run.name}</span><span>${formatTime(run.time)}</span><span>${run.rank}</span>`;
    list.appendChild(li);
  });
}

function paintHud(game) {
  const hud = game.hud;
  if (!hud) return;
  document.getElementById("hud-obj").textContent = hud.objective;
  document.getElementById("hud-time").textContent = formatTime(hud.time || 0);
  document.getElementById("hud-score").textContent = String(hud.score || 0);
  document.getElementById("hud-combo").textContent = hud.combo > 1 ? `x${hud.combo}` : "";
  document.getElementById("echoes").textContent = `ECHO ${hud.echoes}/${hud.echoMax}`;
  document.getElementById("shards").textContent = `SHARDS ${hud.shards}/${hud.shardMax}`;
  document.getElementById("pips").textContent = "▮".repeat(hud.pips) + "▯".repeat(Math.max(0, 3 - hud.pips));
  document.getElementById("hint").textContent = hud.hint || "";
  const fill = document.getElementById("rec-fill");
  fill.style.width = `${Math.round((hud.buffer || 0) * 100)}%`;
  fill.classList.toggle("full", !!hud.bufferFull);
  document.getElementById("rec-label").style.opacity = hud.recording ? "1" : "0.45";
  const toast = document.getElementById("toast");
  if (hud.toast) {
    toast.hidden = false;
    toast.textContent = hud.toast;
  } else toast.hidden = true;
  const card = document.getElementById("card");
  const intro = hud.mode === "intro";
  card.hidden = !intro;
  document.getElementById("card-key").textContent = hud.key || "";
  document.getElementById("card-name").textContent = hud.name || "";
  document.getElementById("card-blurb").textContent = hud.blurb || "";
  const boss = document.getElementById("bossbar");
  boss.hidden = !hud.boss;
  if (hud.boss) {
    document.getElementById("boss-fill").style.width = `${Math.max(0, hud.bossHp) * 100}%`;
    document.getElementById("boss-phase").textContent = `PHASE ${hud.bossPhase}`;
    boss.classList.toggle("hot", !!hud.vulnerable);
  }
}

function paintDone(game) {
  const result = game.result;
  document.getElementById("done-key").textContent = `${result.key} CLEARED`;
  document.getElementById("done-name").textContent = result.name;
  document.getElementById("done-rank").textContent = result.rank;
  document.getElementById("done-time").textContent = formatTime(result.time);
  document.getElementById("done-best").textContent = formatTime(result.bestTime ?? result.time);
  document.getElementById("done-score").textContent = String(result.score);
  document.getElementById("done-shards").textContent = `${result.shards}/${result.shardMax}`;
  document.getElementById("done-deaths").textContent = String(result.deaths);
  document.getElementById("done-combo").textContent = String(result.combo);
  const unlock = document.getElementById("done-unlock");
  if (result.unlock) {
    unlock.hidden = false;
    unlock.textContent = `UNLOCKED  ${result.unlock.name} — ${result.unlock.detail}`;
  } else unlock.hidden = true;
  document.getElementById("done-ending").hidden = !result.ending;
  const next = document.getElementById("done-next");
  next.hidden = !result.next;
  next.textContent = "Next";
}
