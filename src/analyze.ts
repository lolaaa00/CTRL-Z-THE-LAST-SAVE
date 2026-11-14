import type { BirdeyeClientOptions } from "./birdeye.js";
import {
  resolveAthAfterEntry,
  resolveEntryPriceUsd,
} from "./birdeye.js";
import { REQUEST_PAUSE_MS } from "./config.js";
import { extractFirstBuys } from "./firstBuys.js";
import type { HeliusClientOptions } from "./helius.js";
import { fetchWalletTransactions } from "./helius.js";
import {
  defaultAnalyzeOptions,
  scoreToken,
  scoreWallet,
  selectBuysToScore,
  windowBounds,
} from "./score.js";
import type { AnalyzeOptions, FirstBuy, WalletScore } from "./types.js";

export interface AnalyzeDeps {
  helius: HeliusClientOptions;
  birdeye: BirdeyeClientOptions;
  options?: Partial<AnalyzeOptions>;
  onProgress?: (msg: string) => void;
}

async function resolvePricesForBuy(
  buy: FirstBuy,
  nowTs: number,
  birdeye: BirdeyeClientOptions,
  hitThreshold: number,
) {
  const entry = await resolveEntryPriceUsd(
    buy.mint,
    buy.firstBuyTs,
    buy.impliedEntryPriceUsd,
    birdeye,
  );

  let ath: number | null = null;
  let dataGap: string | undefined;

  if (entry.price == null) {
    dataGap = "missing_entry_price";
  } else {
    ath = await resolveAthAfterEntry(
      buy.mint,
      buy.firstBuyTs,
      nowTs,
      birdeye,
    );
    if (ath == null) dataGap = "missing_ath";
  }

  return scoreToken(
    buy,
    {
      entryPriceUsd: entry.price,
      athAfterEntryUsd: ath,
      entrySource: entry.source,
      dataGap,
    },
    hitThreshold,
  );
}

/**
 * Analyze a single wallet: Helius history → first-buys → Birdeye prices → score.
 */
export async function analyzeWallet(
  wallet: string,
  deps: AnalyzeDeps,
): Promise<WalletScore> {
  const options = defaultAnalyzeOptions(deps.options ?? {});
  const nowMs = options.nowMs ?? Date.now();
  const { startTs, endTs } = windowBounds(nowMs, options.scanWindowMs);
  const log = deps.onProgress ?? (() => {});

  try {
    log(`Fetching Helius history for ${wallet.slice(0, 8)}…`);
    const txs = await fetchWalletTransactions(wallet, startTs, deps.helius);
    const firstBuys = extractFirstBuys(wallet, txs, startTs, endTs);

    if (firstBuys.length < options.minDistinctTokens) {
      return scoreWallet(wallet, firstBuys, [], options);
    }

    const toScore = selectBuysToScore(
      firstBuys,
      options.maxScoredFirstBuys,
    );

    log(
      `Scoring ${toScore.length}/${firstBuys.length} first-buys for ${wallet.slice(0, 8)}…`,
    );

    const tokenScores = [];
    for (const buy of toScore) {
      tokenScores.push(
        await resolvePricesForBuy(
          buy,
          endTs,
          deps.birdeye,
          options.hitMultipleThreshold,
        ),
      );
      if (REQUEST_PAUSE_MS > 0) {
        await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
      }
    }

    return scoreWallet(wallet, firstBuys, tokenScores, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      wallet,
      distinctTokensInWindow: 0,
      scoredTokens: [],
      hits: 0,
      scoredWithPrice: 0,
      dataGaps: 0,
      hitRate: null,
      avgMultiple: null,
      medianMultiple: null,
      passesActivityFloor: false,
      passesHitRate: false,
      error: message,
    };
  }
}

/**
 * Analyze many wallets sequentially (MVP rate-limit friendly).
 */
export async function analyzeWallets(
  wallets: string[],
  deps: AnalyzeDeps,
): Promise<WalletScore[]> {
  const results: WalletScore[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i]!;
    deps.onProgress?.(
      `[${i + 1}/${wallets.length}] Analyzing ${w}…`,
    );
    results.push(await analyzeWallet(w, deps));
  }
  return results;
}
