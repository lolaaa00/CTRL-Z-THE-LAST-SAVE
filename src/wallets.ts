import { readFileSync } from "node:fs";

/** Base58 alphabet used by Solana pubkeys (no 0, O, I, l). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!BASE58_RE.test(trimmed)) return false;
  // Typical ed25519 pubkey encodes to 32–44 chars; reject obvious junk.
  return trimmed.length >= 32 && trimmed.length <= 44;
}

/**
 * Parse wallet addresses from CLI args and/or a file (one per line, `#` comments,
 * optional CSV first-column). Dedupes while preserving first-seen order.
 */
export function parseWalletInputs(
  args: string[],
  filePath?: string,
): { wallets: string[]; invalid: string[] } {
  const raw: string[] = [...args];

  if (filePath) {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const cleaned = line.replace(/#.*$/, "").trim();
      if (!cleaned) continue;
      // CSV: take first column
      const first = cleaned.split(/[,\s]+/)[0]?.trim();
      if (first) raw.push(first);
    }
  }

  const seen = new Set<string>();
  const wallets: string[] = [];
  const invalid: string[] = [];

  for (const item of raw) {
    const addr = item.trim();
    if (!addr) continue;
    if (!isValidSolanaAddress(addr)) {
      invalid.push(addr);
      continue;
    }
    if (seen.has(addr)) continue;
    seen.add(addr);
    wallets.push(addr);
  }

  return { wallets, invalid };
}
