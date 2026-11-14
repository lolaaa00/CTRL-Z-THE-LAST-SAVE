import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isValidSolanaAddress, parseWalletInputs } from "./wallets.js";

describe("isValidSolanaAddress", () => {
  it("accepts typical base58 pubkeys", () => {
    assert.equal(
      isValidSolanaAddress(
        "ED3PwgrF19HrotRBdazLPnZwrCQ7TrWuSqMBc5njqpuA",
      ),
      true,
    );
  });

  it("rejects empty / short / non-base58", () => {
    assert.equal(isValidSolanaAddress(""), false);
    assert.equal(isValidSolanaAddress("abc"), false);
    assert.equal(isValidSolanaAddress("0OIl0000000000000000000000000000"), false);
  });
});

describe("parseWalletInputs", () => {
  it("dedupes args and skips invalid", () => {
    const a = "ED3PwgrF19HrotRBdazLPnZwrCQ7TrWuSqMBc5njqpuA";
    const { wallets, invalid } = parseWalletInputs([a, a, "not-a-wallet"]);
    assert.deepEqual(wallets, [a]);
    assert.deepEqual(invalid, ["not-a-wallet"]);
  });

  it("reads file with comments and CSV first column", () => {
    const dir = mkdtempSync(join(tmpdir(), "wa-"));
    const path = join(dir, "wallets.txt");
    const a = "ED3PwgrF19HrotRBdazLPnZwrCQ7TrWuSqMBc5njqpuA";
    const b = "FU2gBtN8zJqPoCKUMVQ1UfiZC64icPXeZtJmUafYbgeS";
    writeFileSync(
      path,
      `# sample\n${a}\n${b},label\n\n`,
      "utf8",
    );
    const { wallets } = parseWalletInputs([], path);
    assert.deepEqual(wallets, [a, b]);
  });
});
