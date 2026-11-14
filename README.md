# CTRL-Z — Solana Wallet Analyzer (CLI)

Batch-score Solana wallets by SPL trading breadth and **post-entry ATH hit rate**.

For each wallet, the CLI:

1. Pulls the last **2 weeks** of activity via **Helius** enhanced transactions
2. Extracts unique SPL **first-buys** (excludes **USDC**, **USDT**, **WSOL**)
3. Drops wallets with **&lt; 4** distinct SPL tokens in that window
4. Scores the **10 most recent** unique first-buys
5. Resolves entry price (prefer **on-tx implied** from USDC/USDT swaps; else Birdeye) and **post-entry ATH** via **Birdeye** token OHLCV
6. Marks a **hit** when `ATH / entry ≥ 2.0`; wallet **passes** if hit rate **≥ 60%**
7. Tokens with no usable entry/ATH are **excluded from the denominator** and counted as **data gaps**

## Setup

```bash
cp .env.example .env
# edit .env — set HELIUS_API_KEY and BIRDEYE_API_KEY
npm install
```

Never commit `.env`. Keys are read only from the environment / `.env` file.

## Run

```bash
# From a wallet list file
npm run analyze -- -f samples/wallets.txt

# Rank by avg multiple ascending; include failing wallets; write CSV
npm run analyze -- -f samples/wallets.txt --sort avgMultiple --dir asc --all --csv results.csv

# Positional wallets
npm run analyze -- Ed3P…wallets…
```

### CLI flags

| Flag | Meaning |
| --- | --- |
| `-f, --file <path>` | Wallet list (one address per line; `#` comments; CSV first column OK) |
| `-s, --sort hitRate\|avgMultiple` | Rank field (default `hitRate`) |
| `-d, --dir asc\|desc` | Rank direction (default `desc`) |
| `--all` | Show wallets that failed activity floor or hit-rate filter |
| `--csv <path>` | Write per-token CSV |
| `--json` | Also print full JSON |
| `-q, --quiet` | Suppress progress logs |

## Tests (no API keys required)

Unit tests cover address parsing, first-buy extraction (exclusions + window), implied entry price, scoring / data gaps, filters, and ranking:

```bash
npm test
npm run typecheck
```

## Smoke test (requires keys)

With `.env` populated:

```bash
npm run analyze -- -f samples/wallets.txt --all --csv /tmp/wallet-scores.csv
```

Spot-check a few first-buy signatures and multiples against Solscan / Birdeye charts (especially any pre-migration pump.fun buys).

## Layout

```
src/
  index.ts       CLI entry (commander)
  analyze.ts     Orchestration
  helius.ts      Wallet transaction history
  firstBuys.ts   SPL first-buy extraction + on-tx implied entry
  birdeye.ts     Historical price + OHLCV ATH
  score.ts       Multiples, hit rate, filters
  rank.ts        Sort / filter passing
  format.ts      Table + CSV
  config.ts      Locked defaults + excluded mints
samples/
  wallets.txt    Example batch
```
