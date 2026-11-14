export type SortField = "hitRate" | "avgMultiple";
export type SortDir = "asc" | "desc";

export interface FirstBuy {
  wallet: string;
  mint: string;
  /** Unix seconds */
  firstBuyTs: number;
  signature: string;
  /** Raw token amount received (UI amount if decimals known, else raw). */
  amount: number;
  /**
   * On-tx implied USD entry price when derivable from the buy swap
   * (e.g. USDC/USDT spent / tokens received). Prefer this over indexer.
   */
  impliedEntryPriceUsd?: number;
  source?: string;
  type?: string;
}

export interface TokenScore {
  mint: string;
  firstBuyTs: number;
  signature: string;
  entryPriceUsd: number | null;
  athAfterEntryUsd: number | null;
  multiple: number | null;
  hit: boolean | null;
  /** Why this token was excluded from the hit-rate denominator. */
  dataGap?: string;
  entrySource?: "on_tx" | "birdeye" | "none";
}

export interface WalletScore {
  wallet: string;
  /** Distinct SPL first-buys in the 2-week window after exclusions (before top-10 cap). */
  distinctTokensInWindow: number;
  /** Tokens considered for scoring (≤10 most recent). */
  scoredTokens: TokenScore[];
  hits: number;
  /** Denominator after excluding data-gap tokens. */
  scoredWithPrice: number;
  dataGaps: number;
  hitRate: number | null;
  avgMultiple: number | null;
  medianMultiple: number | null;
  /** Filter 1: ≥ MIN_DISTINCT_TOKENS in window. */
  passesActivityFloor: boolean;
  /** Filter 2: hitRate ≥ PASS_HIT_RATE (only if activity floor + has scoredWithPrice). */
  passesHitRate: boolean;
  error?: string;
}

export interface AnalyzeOptions {
  scanWindowMs: number;
  maxScoredFirstBuys: number;
  minDistinctTokens: number;
  hitMultipleThreshold: number;
  passHitRate: number;
  nowMs?: number;
}

export interface HeliusTokenTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  mint?: string;
  tokenAmount?: number;
  decimals?: number;
}

export interface HeliusNativeTransfer {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  amount?: number;
}

export interface HeliusSwapTokenAmount {
  mint?: string;
  tokenAmount?: number;
  rawTokenAmount?: {
    tokenAmount?: string;
    decimals?: number;
  };
}

export interface HeliusEnhancedTx {
  signature: string;
  timestamp: number;
  type?: string;
  source?: string;
  feePayer?: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  events?: {
    swap?: {
      nativeInput?: { account?: string; amount?: string | number };
      nativeOutput?: { account?: string; amount?: string | number };
      tokenInputs?: HeliusSwapTokenAmount[];
      tokenOutputs?: HeliusSwapTokenAmount[];
    };
  };
}
