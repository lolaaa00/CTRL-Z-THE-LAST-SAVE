import type { SortDir, SortField, WalletScore } from "./types.js";

function cmpNullable(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  // nulls always sort last regardless of direction
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const d = a - b;
  return dir === "asc" ? d : -d;
}

/**
 * Rank wallets by hit rate or avg multiple (asc/desc).
 * Default: descending hit rate, then descending avg multiple.
 */
export function rankWallets(
  wallets: WalletScore[],
  field: SortField = "hitRate",
  dir: SortDir = "desc",
): WalletScore[] {
  const copy = [...wallets];
  copy.sort((a, b) => {
    const primary =
      field === "hitRate"
        ? cmpNullable(a.hitRate, b.hitRate, dir)
        : cmpNullable(a.avgMultiple, b.avgMultiple, dir);
    if (primary !== 0) return primary;

    const secondary =
      field === "hitRate"
        ? cmpNullable(a.avgMultiple, b.avgMultiple, "desc")
        : cmpNullable(a.hitRate, b.hitRate, "desc");
    if (secondary !== 0) return secondary;

    return a.wallet.localeCompare(b.wallet);
  });
  return copy;
}

export function filterPassing(
  wallets: WalletScore[],
  showAll: boolean,
): WalletScore[] {
  if (showAll) return wallets;
  return wallets.filter((w) => w.passesActivityFloor && w.passesHitRate);
}
