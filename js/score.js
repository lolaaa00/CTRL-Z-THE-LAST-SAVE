/** Pure scoring, ranks, and local-run comparisons. */

const RANK_VALUE = { S: 4, A: 3, B: 2, C: 1 };

export function rankValue(rank) {
  return RANK_VALUE[rank] || 0;
}

export function computeScore({ time, par, shards, deaths, combo, boss }) {
  const timeBonus = Math.max(0, Math.round((par - time) * 45));
  const shardScore = shards * 500;
  const comboScore = combo * 150;
  const deathPen = deaths * 300;
  const bossBonus = boss ? 2500 : 0;
  return Math.max(0, timeBonus + shardScore + comboScore + bossBonus - deathPen);
}

export function computeRank({ time, par, shards, shardMax, deaths }) {
  const all = shardMax <= 0 || shards >= shardMax;
  const half = shards >= Math.ceil((shardMax || 0) / 2);
  if (all && deaths === 0 && time <= par) return "S";
  if (all && deaths <= 2 && time <= par * 1.45) return "A";
  if ((all || half) && time <= par * 2.2) return "B";
  return "C";
}

export function betterRank(a, b) {
  return rankValue(a) >= rankValue(b) ? a : b;
}
