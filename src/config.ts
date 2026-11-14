/** Locked product defaults for the wallet analyzer CLI. */

export const EXCLUDED_MINTS = new Set<string>([
  // USDC
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  // USDT
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  // WSOL
  "So11111111111111111111111111111111111111112",
]);

/** Quote mints usable for on-tx implied USD entry price. */
export const USD_QUOTE_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export const WSOL_MINT =
  "So11111111111111111111111111111111111111112";

/** Scan window: last 2 weeks. */
export const SCAN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Score only the N most recent unique SPL first-buys. */
export const MAX_SCORED_FIRST_BUYS = 10;

/** Filter 1: omit wallets below this distinct SPL count (after exclusions). */
export const MIN_DISTINCT_TOKENS = 4;

/** Hit if post-entry ATH / entry_price >= this. */
export const HIT_MULTIPLE_THRESHOLD = 2.0;

/** Wallet passes Filter 2 if hit rate >= this. */
export const PASS_HIT_RATE = 0.6;

export const HELIUS_BASE_URL = "https://api.helius.xyz";
export const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";

/** Soft rate-limit pause between provider calls (ms). */
export const REQUEST_PAUSE_MS = 120;
