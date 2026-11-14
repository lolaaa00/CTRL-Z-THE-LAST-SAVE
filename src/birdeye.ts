import { BIRDEYE_BASE_URL, REQUEST_PAUSE_MS, WSOL_MINT } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface BirdeyeClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  pauseMs?: number;
}

export interface OhlcvCandle {
  /** Unix seconds */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

async function birdeyeGet<T>(
  path: string,
  query: Record<string, string | number>,
  opts: BirdeyeClientOptions,
): Promise<T> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = opts.baseUrl ?? BIRDEYE_BASE_URL;
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetchFn(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-API-KEY": opts.apiKey,
      "x-chain": "solana",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Birdeye ${res.status} ${path}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}

/**
 * Historical USD price nearest to `unixTs` (seconds).
 */
export async function fetchHistoricalPriceUsd(
  mint: string,
  unixTs: number,
  opts: BirdeyeClientOptions,
): Promise<number | null> {
  type Resp = {
    success?: boolean;
    data?: { value?: number; unixTime?: number };
  };

  try {
    const json = await birdeyeGet<Resp>(
      "/defi/historical_price_unix",
      { address: mint, unixtime: unixTs },
      opts,
    );
    const v = json.data?.value;
    if (typeof v === "number" && v > 0 && Number.isFinite(v)) return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch OHLCV candles for a mint from time_from → time_to (unix seconds).
 * Chooses interval by span length to stay under Birdeye record caps.
 */
export async function fetchOhlcv(
  mint: string,
  timeFrom: number,
  timeTo: number,
  opts: BirdeyeClientOptions,
): Promise<OhlcvCandle[]> {
  const span = Math.max(0, timeTo - timeFrom);
  // Prefer finer grain for short windows; coarser for long ones.
  let type: string;
  if (span <= 2 * 24 * 3600) type = "1m";
  else if (span <= 7 * 24 * 3600) type = "5m";
  else if (span <= 30 * 24 * 3600) type = "15m";
  else type = "1H";

  type Resp = {
    success?: boolean;
    data?: {
      items?: Array<{
        unixTime?: number;
        o?: number;
        h?: number;
        l?: number;
        c?: number;
      }>;
    };
  };

  const json = await birdeyeGet<Resp>(
    "/defi/v3/ohlcv",
    {
      address: mint,
      type,
      time_from: timeFrom,
      time_to: timeTo,
    },
    opts,
  );

  const items = json.data?.items ?? [];
  const candles: OhlcvCandle[] = [];
  for (const it of items) {
    if (typeof it.unixTime !== "number") continue;
    const h = typeof it.h === "number" ? it.h : NaN;
    const o = typeof it.o === "number" ? it.o : h;
    const l = typeof it.l === "number" ? it.l : h;
    const c = typeof it.c === "number" ? it.c : h;
    if (!Number.isFinite(h) || h <= 0) continue;
    candles.push({ t: it.unixTime, o, h, l, c });
  }
  return candles;
}

/**
 * Max high at or after firstBuyTs from OHLCV (token mint, not pair — includes
 * pre-migration bonding-curve prints when Birdeye has them).
 */
export function athFromCandles(
  candles: OhlcvCandle[],
  firstBuyTs: number,
): number | null {
  let ath: number | null = null;
  for (const c of candles) {
    if (c.t < firstBuyTs) continue;
    if (!(c.h > 0)) continue;
    if (ath == null || c.h > ath) ath = c.h;
  }
  return ath;
}

export async function resolveAthAfterEntry(
  mint: string,
  firstBuyTs: number,
  nowTs: number,
  opts: BirdeyeClientOptions,
): Promise<number | null> {
  try {
    const candles = await fetchOhlcv(mint, firstBuyTs, nowTs, opts);
    if (opts.pauseMs ?? REQUEST_PAUSE_MS) {
      await sleep(opts.pauseMs ?? REQUEST_PAUSE_MS);
    }
    return athFromCandles(candles, firstBuyTs);
  } catch {
    return null;
  }
}

/**
 * Resolve entry USD: prefer caller-supplied on-tx implied price; else Birdeye.
 * Optionally bootstrap SOL-quoted buys via WSOL historical price (caller handles).
 */
export async function resolveEntryPriceUsd(
  mint: string,
  firstBuyTs: number,
  impliedOnTx: number | undefined,
  opts: BirdeyeClientOptions,
): Promise<{ price: number | null; source: "on_tx" | "birdeye" | "none" }> {
  if (
    impliedOnTx != null &&
    impliedOnTx > 0 &&
    Number.isFinite(impliedOnTx)
  ) {
    return { price: impliedOnTx, source: "on_tx" };
  }

  const fromIndexer = await fetchHistoricalPriceUsd(mint, firstBuyTs, opts);
  if (opts.pauseMs ?? REQUEST_PAUSE_MS) {
    await sleep(opts.pauseMs ?? REQUEST_PAUSE_MS);
  }
  if (fromIndexer != null) return { price: fromIndexer, source: "birdeye" };
  return { price: null, source: "none" };
}

/** Convenience: SOL USD at a timestamp (for future SOL-quoted implied entry). */
export async function fetchSolPriceUsd(
  unixTs: number,
  opts: BirdeyeClientOptions,
): Promise<number | null> {
  return fetchHistoricalPriceUsd(WSOL_MINT, unixTs, opts);
}
