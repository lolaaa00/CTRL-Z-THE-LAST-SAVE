import { HELIUS_BASE_URL, REQUEST_PAUSE_MS } from "./config.js";
import type { HeliusEnhancedTx } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HeliusClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  pauseMs?: number;
}

/**
 * Paginate Helius enhanced transaction history for an address.
 * Stops when a page is empty, a tx is older than `windowStartTs`, or maxPages hit.
 */
export async function fetchWalletTransactions(
  address: string,
  windowStartTs: number,
  opts: HeliusClientOptions,
): Promise<HeliusEnhancedTx[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = opts.baseUrl ?? HELIUS_BASE_URL;
  const pauseMs = opts.pauseMs ?? REQUEST_PAUSE_MS;
  const collected: HeliusEnhancedTx[] = [];
  let before: string | undefined;
  const maxPages = 40; // ~4k txs; enough for 2-week meme trading

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${base}/v0/addresses/${address}/transactions`);
    url.searchParams.set("api-key", opts.apiKey);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetchFn(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Helius ${res.status} for ${address}: ${body.slice(0, 200)}`,
      );
    }

    const batch = (await res.json()) as HeliusEnhancedTx[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    let reachedPastWindow = false;
    for (const tx of batch) {
      if (typeof tx.timestamp !== "number") continue;
      if (tx.timestamp < windowStartTs) {
        reachedPastWindow = true;
        break;
      }
      collected.push(tx);
    }

    before = batch[batch.length - 1]?.signature;
    if (!before || reachedPastWindow) break;
    if (pauseMs > 0) await sleep(pauseMs);
  }

  return collected;
}
