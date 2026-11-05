/** Local save and leaderboard. Shape is stable so an online board can replace recordRun later. */

import { rankValue } from "./score.js";

const KEY = "ctrlz.save.v1";

export function defaultSave() {
  return {
    settings: { music: 70, sfx: 85, mute: false, shake: true, name: "SAVER" },
    levels: {},
    runs: {},
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      settings: { ...base.settings, ...(data.settings || {}) },
      levels: data.levels && typeof data.levels === "object" ? data.levels : {},
      runs: data.runs && typeof data.runs === "object" ? data.runs : {},
    };
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode or a full disk */
  }
}

export function isUnlocked(save, index) {
  if (index <= 0) return true;
  return (save.levels?.[String(index - 1)]?.clears || 0) > 0;
}

export function sanitizeName(name) {
  const clean = String(name || "SAVER")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .slice(0, 12);
  return clean || "SAVER";
}

/**
 * Persist one finished run.
 * `runs[id]` is the local leaderboard (fastest first, max 8) and can be swapped for a server later.
 */
export function recordRun(save, index, run) {
  const id = String(index);
  const prev = save.levels[id] || { clears: 0, bestTime: null, bestScore: 0, bestRank: null, shards: 0 };
  const firstClear = prev.clears < 1;
  const isNewBest = prev.bestTime == null || run.time < prev.bestTime;
  prev.clears += 1;
  if (isNewBest) prev.bestTime = run.time;
  if ((run.score || 0) >= (prev.bestScore || 0)) prev.bestScore = run.score;
  if (rankValue(run.rank) >= rankValue(prev.bestRank)) prev.bestRank = run.rank;
  prev.shards = Math.max(prev.shards || 0, run.shards || 0);
  save.levels[id] = prev;
  const list = Array.isArray(save.runs[id]) ? save.runs[id] : [];
  list.push({
    name: sanitizeName(run.name),
    time: run.time,
    score: run.score,
    rank: run.rank,
  });
  list.sort((a, b) => a.time - b.time || b.score - a.score);
  save.runs[id] = list.slice(0, 8);
  writeSave(save);
  return { prev, firstClear, isNewBest };
}

export function clearedCount(save) {
  return Object.values(save.levels || {}).filter((level) => (level.clears || 0) > 0).length;
}
