import { writeFileSync } from "node:fs";
import type { WalletScore } from "./types.js";

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toFixed(1);
  if (n >= 1) return n.toFixed(digits);
  return n.toPrecision(3);
}

function shortAddr(a: string): string {
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function pad(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + " ".repeat(w - s.length);
}

function padL(s: string, w: number): string {
  if (s.length >= w) return s;
  return " ".repeat(w - s.length) + s;
}

/**
 * Ranked summary table for stdout.
 */
export function formatRankedTable(results: WalletScore[]): string {
  const headers = [
    "Wallet",
    "HitRate",
    "AvgMult",
    "Hits",
    "Scored",
    "Gaps",
    "Distinct",
    "Pass",
    "Err",
  ];
  const rows = results.map((r) => [
    shortAddr(r.wallet),
    pct(r.hitRate),
    num(r.avgMultiple),
    String(r.hits),
    String(r.scoredWithPrice),
    String(r.dataGaps),
    String(r.distinctTokensInWindow),
    r.error
      ? "ERR"
      : r.passesActivityFloor && r.passesHitRate
        ? "Y"
        : r.passesActivityFloor
          ? "hit✗"
          : "floor✗",
    r.error ? r.error.slice(0, 24) : "",
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]!.length)),
  );

  const line = (cols: string[]) =>
    cols.map((c, i) => (i === 0 || i === 8 ? pad(c, widths[i]!) : padL(c, widths[i]!))).join("  ");

  const out = [line(headers), line(widths.map((w) => "-".repeat(w)))];
  for (const row of rows) out.push(line(row));
  return out.join("\n");
}

/**
 * Per-token detail for each wallet.
 */
export function formatTokenDetails(results: WalletScore[]): string {
  const blocks: string[] = [];
  for (const r of results) {
    blocks.push(`\n=== ${r.wallet} ===`);
    if (r.error) {
      blocks.push(`  ERROR: ${r.error}`);
      continue;
    }
    blocks.push(
      `  distinct_in_window=${r.distinctTokensInWindow}  scored=${r.scoredTokens.length}  ` +
        `hits=${r.hits}/${r.scoredWithPrice}  gaps=${r.dataGaps}  ` +
        `hit_rate=${pct(r.hitRate)}  avg_mult=${num(r.avgMultiple)}  ` +
        `pass_floor=${r.passesActivityFloor}  pass_hit=${r.passesHitRate}`,
    );
    if (r.scoredTokens.length === 0) {
      blocks.push("  (no tokens scored)");
      continue;
    }
    blocks.push(
      "  " +
        [
          pad("Mint", 12),
          padL("Entry$", 10),
          padL("ATH$", 10),
          padL("Mult", 8),
          pad("Hit", 4),
          pad("Src", 7),
          "Gap/Sig",
        ].join("  "),
    );
    for (const t of r.scoredTokens) {
      const hitStr =
        t.hit === true ? "Y" : t.hit === false ? "N" : "—";
      blocks.push(
        "  " +
          [
            pad(shortAddr(t.mint), 12),
            padL(num(t.entryPriceUsd, 4), 10),
            padL(num(t.athAfterEntryUsd, 4), 10),
            padL(num(t.multiple), 8),
            pad(hitStr, 4),
            pad(t.entrySource ?? "—", 7),
            t.dataGap ?? t.signature.slice(0, 16),
          ].join("  "),
      );
    }
  }
  return blocks.join("\n");
}

function csvEscape(
  v: string | number | boolean | null | undefined,
): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Flat CSV: one row per scored token (plus wallet-level columns).
 */
export function formatCsv(results: WalletScore[]): string {
  const header = [
    "wallet",
    "passes_activity_floor",
    "passes_hit_rate",
    "wallet_hit_rate",
    "wallet_avg_multiple",
    "wallet_hits",
    "wallet_scored_with_price",
    "wallet_data_gaps",
    "wallet_distinct_in_window",
    "wallet_error",
    "mint",
    "first_buy_ts",
    "signature",
    "entry_price_usd",
    "ath_after_entry_usd",
    "multiple",
    "hit",
    "entry_source",
    "data_gap",
  ].join(",");

  const lines = [header];
  for (const r of results) {
    if (r.scoredTokens.length === 0) {
      lines.push(
        [
          r.wallet,
          r.passesActivityFloor,
          r.passesHitRate,
          r.hitRate,
          r.avgMultiple,
          r.hits,
          r.scoredWithPrice,
          r.dataGaps,
          r.distinctTokensInWindow,
          r.error ?? "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]
          .map(csvEscape)
          .join(","),
      );
      continue;
    }
    for (const t of r.scoredTokens) {
      lines.push(
        [
          r.wallet,
          r.passesActivityFloor,
          r.passesHitRate,
          r.hitRate,
          r.avgMultiple,
          r.hits,
          r.scoredWithPrice,
          r.dataGaps,
          r.distinctTokensInWindow,
          r.error ?? "",
          t.mint,
          t.firstBuyTs,
          t.signature,
          t.entryPriceUsd,
          t.athAfterEntryUsd,
          t.multiple,
          t.hit,
          t.entrySource ?? "",
          t.dataGap ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

export function writeCsv(path: string, results: WalletScore[]): void {
  writeFileSync(path, formatCsv(results), "utf8");
}
