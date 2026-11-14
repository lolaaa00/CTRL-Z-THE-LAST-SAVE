import { EXCLUDED_MINTS, USD_QUOTE_MINTS, WSOL_MINT } from "./config.js";
import type { FirstBuy, HeliusEnhancedTx, HeliusSwapTokenAmount } from "./types.js";

function tokenUiAmount(t: HeliusSwapTokenAmount): number | undefined {
  if (typeof t.tokenAmount === "number" && Number.isFinite(t.tokenAmount)) {
    return t.tokenAmount;
  }
  const raw = t.rawTokenAmount;
  if (raw?.tokenAmount != null && raw.decimals != null) {
    const n = Number(raw.tokenAmount);
    if (!Number.isFinite(n)) return undefined;
    return n / 10 ** raw.decimals;
  }
  return undefined;
}

/**
 * Derive USD entry from a swap when the wallet paid USDC/USDT for the mint.
 * Returns undefined when not derivable (e.g. SOL-quoted without SOL/USD).
 */
export function impliedEntryFromSwap(
  tx: HeliusEnhancedTx,
  wallet: string,
  mint: string,
): number | undefined {
  const swap = tx.events?.swap;
  if (!swap) {
    // Fallback: pair inbound mint receipt with outbound USDC/USDT in tokenTransfers
    const transfers = tx.tokenTransfers ?? [];
    const inbound = transfers.find(
      (t) =>
        t.toUserAccount === wallet &&
        t.mint === mint &&
        typeof t.tokenAmount === "number" &&
        t.tokenAmount > 0,
    );
    const outboundUsd = transfers.find(
      (t) =>
        t.fromUserAccount === wallet &&
        t.mint != null &&
        USD_QUOTE_MINTS.has(t.mint) &&
        typeof t.tokenAmount === "number" &&
        t.tokenAmount > 0,
    );
    if (
      inbound?.tokenAmount &&
      outboundUsd?.tokenAmount &&
      inbound.tokenAmount > 0
    ) {
      const price = outboundUsd.tokenAmount / inbound.tokenAmount;
      return price > 0 && Number.isFinite(price) ? price : undefined;
    }
    return undefined;
  }

  const outputs = swap.tokenOutputs ?? [];
  const inputs = swap.tokenInputs ?? [];

  const bought = outputs.find((o) => o.mint === mint);
  const boughtAmt = bought ? tokenUiAmount(bought) : undefined;
  if (!boughtAmt || boughtAmt <= 0) return undefined;

  const usdIn = inputs.find((i) => i.mint != null && USD_QUOTE_MINTS.has(i.mint));
  const usdAmt = usdIn ? tokenUiAmount(usdIn) : undefined;
  if (usdAmt && usdAmt > 0) {
    const price = usdAmt / boughtAmt;
    return price > 0 && Number.isFinite(price) ? price : undefined;
  }

  return undefined;
}

function isLikelyBuyType(type?: string): boolean {
  if (!type) return true;
  const t = type.toUpperCase();
  // Exclude obvious non-buys; keep SWAP and unknown for MVP breadth.
  if (
    t === "TRANSFER" ||
    t === "NFT_SALE" ||
    t === "NFT_MINT" ||
    t === "BURN" ||
    t === "STAKE" ||
    t === "UNSTAKE"
  ) {
    return false;
  }
  return true;
}

/**
 * Extract SPL first-buys for a wallet from Helius enhanced transactions.
 * Only txs within [windowStartTs, windowEndTs] (unix seconds) are considered.
 * Excluded mints (USDC/USDT/WSOL) never appear.
 */
export function extractFirstBuys(
  wallet: string,
  txs: HeliusEnhancedTx[],
  windowStartTs: number,
  windowEndTs: number,
): FirstBuy[] {
  // mint -> earliest buy
  const byMint = new Map<string, FirstBuy>();

  // Process oldest-first so first occurrence is the earliest buy.
  const ordered = [...txs].sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of ordered) {
    if (tx.timestamp < windowStartTs || tx.timestamp > windowEndTs) continue;
    if (!isLikelyBuyType(tx.type)) continue;

    const transfers = tx.tokenTransfers ?? [];
    const inboundMints = new Map<string, number>();

    for (const t of transfers) {
      if (t.toUserAccount !== wallet) continue;
      if (!t.mint || EXCLUDED_MINTS.has(t.mint)) continue;
      if (t.mint === WSOL_MINT) continue;
      const amt = typeof t.tokenAmount === "number" ? t.tokenAmount : 0;
      if (!(amt > 0)) continue;
      inboundMints.set(t.mint, (inboundMints.get(t.mint) ?? 0) + amt);
    }

    // Also consider swap tokenOutputs when tokenTransfers missed Token-2022 edge cases
    const swapOuts = tx.events?.swap?.tokenOutputs ?? [];
    for (const o of swapOuts) {
      if (!o.mint || EXCLUDED_MINTS.has(o.mint)) continue;
      const amt = tokenUiAmount(o);
      if (!amt || amt <= 0) continue;
      if (!inboundMints.has(o.mint)) inboundMints.set(o.mint, amt);
    }

    for (const [mint, amount] of inboundMints) {
      if (byMint.has(mint)) continue; // already have earlier first-buy
      const implied = impliedEntryFromSwap(tx, wallet, mint);
      byMint.set(mint, {
        wallet,
        mint,
        firstBuyTs: tx.timestamp,
        signature: tx.signature,
        amount,
        impliedEntryPriceUsd: implied,
        source: tx.source,
        type: tx.type,
      });
    }
  }

  return [...byMint.values()].sort((a, b) => b.firstBuyTs - a.firstBuyTs);
}

/**
 * Keep the N most recent unique first-buys (already sorted newest-first).
 */
export function takeMostRecentFirstBuys(
  firstBuys: FirstBuy[],
  n: number,
): FirstBuy[] {
  return firstBuys.slice(0, n);
}
