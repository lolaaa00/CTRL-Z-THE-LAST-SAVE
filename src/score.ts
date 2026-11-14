import {
  HIT_MULTIPLE_THRESHOLD,
  MAX_SCORED_FIRST_BUYS,
  MIN_DISTINCT_TOKENS,
  PASS_HIT_RATE,
  SCAN_WINDOW_MS,
} from "./config.js";
import { takeMostRecentFirstBuys } from "./firstBuys.js";
import type {
  AnalyzeOptions,
  FirstBuy,
  TokenScore,
  WalletScore,
} from "./types.js";

export function defaultAnalyzeOptions(
  overrides: Partial<AnalyzeOptions> = {},
): AnalyzeOptions {
  return {
    scanWindowMs: SCAN_WINDOW_MS,
    maxScoredFirstBuys: MAX_SCORED_FIRST_BUYS,
    minDistinctTokens: MIN_DISTINCT_TOKENS,
    hitMultipleThreshold: HIT_MULTIPLE_THRESHOLD,
    passHitRate: PASS_HIT_RATE,
    ...overrides,
  };
}

export function computeMultiple(
  ath: number,
  entry: number,
): number | null {
  if (!(entry > 0) || !(ath > 0) || !Number.isFinite(entry) || !Number.isFinite(ath)) {
    return null;
  }
  return ath / entry;
}

export function isHit(
  multiple: number | null,
  threshold = HIT_MULTIPLE_THRESHOLD,
): boolean | null {
  if (multiple == null) return null;
  return multiple >= threshold;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export interface PriceResolution {
  entryPriceUsd: number | null;
  athAfterEntryUsd: number | null;
  entrySource: "on_tx" | "birdeye" | "none";
  dataGap?: string;
}

/**
 * Build a TokenScore from a first-buy + resolved prices.
 * Tokens with no usable ATH (or no entry) are marked as data gaps and
 * excluded from the hit-rate denominator.
 */
export function scoreToken(
  buy: FirstBuy,
  prices: PriceResolution,
  hitThreshold = HIT_MULTIPLE_THRESHOLD,
): TokenScore {
  const entry = prices.entryPriceUsd;
  const ath = prices.athAfterEntryUsd;
  let dataGap = prices.dataGap;

  if (entry == null || !(entry > 0)) {
    dataGap = dataGap ?? "missing_entry_price";
  } else if (ath == null || !(ath > 0)) {
    dataGap = dataGap ?? "missing_ath";
  }

  const multiple =
    entry != null && ath != null ? computeMultiple(ath, entry) : null;
  const hit = dataGap ? null : isHit(multiple, hitThreshold);

  return {
    mint: buy.mint,
    firstBuyTs: buy.firstBuyTs,
    signature: buy.signature,
    entryPriceUsd: entry,
    athAfterEntryUsd: ath,
    multiple,
    hit,
    dataGap,
    entrySource: prices.entrySource,
  };
}

/**
 * Aggregate per-token scores into a wallet result (filters + hit rate).
 */
export function scoreWallet(
  wallet: string,
  firstBuysInWindow: FirstBuy[],
  tokenScores: TokenScore[],
  options: AnalyzeOptions = defaultAnalyzeOptions(),
): WalletScore {
  const distinctTokensInWindow = firstBuysInWindow.length;
  const passesActivityFloor =
    distinctTokensInWindow >= options.minDistinctTokens;

  const usable = tokenScores.filter((t) => !t.dataGap && t.multiple != null);
  const hits = usable.filter((t) => t.hit === true).length;
  const scoredWithPrice = usable.length;
  const dataGaps = tokenScores.filter((t) => t.dataGap).length;
  const multiples = usable.map((t) => t.multiple!).filter((m) => Number.isFinite(m));

  const hitRate =
    scoredWithPrice > 0 ? hits / scoredWithPrice : null;
  const avgMultiple =
    multiples.length > 0
      ? multiples.reduce((a, b) => a + b, 0) / multiples.length
      : null;

  const passesHitRate =
    passesActivityFloor &&
    hitRate != null &&
    hitRate >= options.passHitRate;

  return {
    wallet,
    distinctTokensInWindow,
    scoredTokens: tokenScores,
    hits,
    scoredWithPrice,
    dataGaps,
    hitRate,
    avgMultiple,
    medianMultiple: median(multiples),
    passesActivityFloor,
    passesHitRate,
  };
}

/**
 * Select which first-buys to score (top N most recent) after activity filter check.
 */
export function selectBuysToScore(
  firstBuysNewestFirst: FirstBuy[],
  maxN = MAX_SCORED_FIRST_BUYS,
): FirstBuy[] {
  return takeMostRecentFirstBuys(firstBuysNewestFirst, maxN);
}

export function windowBounds(
  nowMs: number,
  scanWindowMs = SCAN_WINDOW_MS,
): { startTs: number; endTs: number } {
  const endTs = Math.floor(nowMs / 1000);
  const startTs = Math.floor((nowMs - scanWindowMs) / 1000);
  return { startTs, endTs };
}
