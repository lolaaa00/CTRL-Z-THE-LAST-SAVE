#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import { analyzeWallets } from "./analyze.js";
import {
  HIT_MULTIPLE_THRESHOLD,
  MAX_SCORED_FIRST_BUYS,
  MIN_DISTINCT_TOKENS,
  PASS_HIT_RATE,
  SCAN_WINDOW_MS,
} from "./config.js";
import {
  formatRankedTable,
  formatTokenDetails,
  writeCsv,
} from "./format.js";
import { filterPassing, rankWallets } from "./rank.js";
import type { SortDir, SortField } from "./types.js";
import { parseWalletInputs } from "./wallets.js";

loadEnv();

function requireKey(name: "HELIUS_API_KEY" | "BIRDEYE_API_KEY"): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(
      `Missing ${name}. Copy .env.example to .env and set your keys.`,
    );
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("wallet-analyzer")
    .description(
      "Score Solana wallets by SPL first-buy post-entry ATH hit rate (CLI)",
    )
    .argument("[wallets...]", "Wallet addresses (or use --file)")
    .option(
      "-f, --file <path>",
      "File with wallet addresses (one per line)",
    )
    .option(
      "-s, --sort <field>",
      "Sort field: hitRate | avgMultiple",
      "hitRate",
    )
    .option(
      "-d, --dir <dir>",
      "Sort direction: asc | desc",
      "desc",
    )
    .option(
      "--all",
      "Show wallets that failed activity floor or hit-rate filter",
      false,
    )
    .option("--csv <path>", "Write per-token CSV to path")
    .option("--json", "Also print full JSON results", false)
    .option("-q, --quiet", "Suppress progress logs", false)
    .addHelpText(
      "after",
      `
Locked defaults:
  scan window          last ${SCAN_WINDOW_MS / (24 * 3600 * 1000)} days
  score cap            ${MAX_SCORED_FIRST_BUYS} most recent unique SPL first-buys
  activity floor       ≥ ${MIN_DISTINCT_TOKENS} distinct SPL (excl. USDC/USDT/WSOL)
  hit                  ATH/entry ≥ ${HIT_MULTIPLE_THRESHOLD}
  wallet pass          hit rate ≥ ${PASS_HIT_RATE * 100}%

Examples:
  npm run analyze -- -f wallets.txt
  npm run analyze -- -f wallets.txt --sort avgMultiple --dir asc --csv out.csv
  npm run analyze -- Ed3P... FU2g...
`,
    )
    .parse();

  const opts = program.opts<{
    file?: string;
    sort: string;
    dir: string;
    all: boolean;
    csv?: string;
    json: boolean;
    quiet: boolean;
  }>();
  const args = program.args as string[];

  if (!opts.file && args.length === 0) {
    program.help();
  }

  const sortField = opts.sort as SortField;
  if (sortField !== "hitRate" && sortField !== "avgMultiple") {
    console.error("--sort must be hitRate or avgMultiple");
    process.exit(1);
  }
  const sortDir = opts.dir as SortDir;
  if (sortDir !== "asc" && sortDir !== "desc") {
    console.error("--dir must be asc or desc");
    process.exit(1);
  }

  const { wallets, invalid } = parseWalletInputs(args, opts.file);
  if (invalid.length) {
    console.warn(`Skipping ${invalid.length} invalid address(es):`);
    for (const a of invalid) console.warn(`  ${a}`);
  }
  if (wallets.length === 0) {
    console.error("No valid wallets to analyze.");
    process.exit(1);
  }

  const heliusKey = requireKey("HELIUS_API_KEY");
  const birdeyeKey = requireKey("BIRDEYE_API_KEY");

  const results = await analyzeWallets(wallets, {
    helius: { apiKey: heliusKey },
    birdeye: { apiKey: birdeyeKey },
    onProgress: opts.quiet
      ? undefined
      : (msg) => console.error(msg),
  });

  const ranked = rankWallets(results, sortField, sortDir);
  const shown = filterPassing(ranked, opts.all);

  console.log(
    `\nRanked by ${sortField} (${sortDir})` +
      (opts.all ? " — showing all" : " — passing wallets only") +
      `  [${shown.length}/${results.length} shown]\n`,
  );
  console.log(formatRankedTable(shown.length ? shown : ranked));
  console.log(formatTokenDetails(shown.length ? shown : ranked));

  if (opts.csv) {
    writeCsv(opts.csv, ranked);
    console.error(`\nWrote CSV: ${opts.csv}`);
  }
  if (opts.json) {
    console.log("\n" + JSON.stringify(ranked, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
