import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeMultiple,
  defaultAnalyzeOptions,
  isHit,
  median,
  scoreToken,
  scoreWallet,
  selectBuysToScore,
  windowBounds,
} from "./score.js";
import type { FirstBuy, TokenScore } from "./types.js";
import { athFromCandles } from "./birdeye.js";
import { filterPassing, rankWallets } from "./rank.js";

describe("computeMultiple / isHit", () => {
  it("computes ATH/entry and hit threshold", () => {
    assert.equal(computeMultiple(2, 1), 2);
    assert.equal(isHit(2), true);
    assert.equal(isHit(1.99), false);
    assert.equal(computeMultiple(1, 0), null);
    assert.equal(isHit(null), null);
  });
});

describe("median", () => {
  it("handles odd/even/empty", () => {
    assert.equal(median([]), null);
    assert.equal(median([3]), 3);
    assert.equal(median([1, 3, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });
});

describe("scoreToken data gaps", () => {
  const buy: FirstBuy = {
    wallet: "W",
    mint: "M",
    firstBuyTs: 100,
    signature: "s",
    amount: 1,
  };

  it("marks missing entry as data gap (excluded from hit)", () => {
    const t = scoreToken(buy, {
      entryPriceUsd: null,
      athAfterEntryUsd: 2,
      entrySource: "none",
    });
    assert.equal(t.dataGap, "missing_entry_price");
    assert.equal(t.hit, null);
  });

  it("marks missing ATH as data gap", () => {
    const t = scoreToken(buy, {
      entryPriceUsd: 1,
      athAfterEntryUsd: null,
      entrySource: "birdeye",
    });
    assert.equal(t.dataGap, "missing_ath");
    assert.equal(t.hit, null);
  });

  it("scores a hit when ATH/entry >= 2", () => {
    const t = scoreToken(buy, {
      entryPriceUsd: 1,
      athAfterEntryUsd: 2.5,
      entrySource: "on_tx",
    });
    assert.equal(t.dataGap, undefined);
    assert.equal(t.hit, true);
    assert.equal(t.multiple, 2.5);
  });
});

describe("scoreWallet filters", () => {
  function tok(
    partial: Partial<TokenScore> & Pick<TokenScore, "mint" | "hit" | "multiple">,
  ): TokenScore {
    return {
      firstBuyTs: 1,
      signature: "s",
      entryPriceUsd: 1,
      athAfterEntryUsd: 2,
      entrySource: "birdeye",
      ...partial,
    };
  }

  it("fails activity floor when < 4 distinct", () => {
    const buys: FirstBuy[] = [1, 2, 3].map((i) => ({
      wallet: "W",
      mint: `M${i}`,
      firstBuyTs: i,
      signature: `s${i}`,
      amount: 1,
    }));
    const scored = buys.map((b) =>
      tok({ mint: b.mint, hit: true, multiple: 3 }),
    );
    const w = scoreWallet("W", buys, scored);
    assert.equal(w.passesActivityFloor, false);
    assert.equal(w.passesHitRate, false);
  });

  it("excludes data gaps from denominator; pass at >= 60%", () => {
    const buys: FirstBuy[] = [1, 2, 3, 4, 5].map((i) => ({
      wallet: "W",
      mint: `M${i}`,
      firstBuyTs: i,
      signature: `s${i}`,
      amount: 1,
    }));
    // 3 hits, 1 miss, 1 gap → hit rate 3/4 = 75%
    const scored: TokenScore[] = [
      tok({ mint: "M1", hit: true, multiple: 3 }),
      tok({ mint: "M2", hit: true, multiple: 4 }),
      tok({ mint: "M3", hit: true, multiple: 2 }),
      tok({ mint: "M4", hit: false, multiple: 1.2 }),
      tok({
        mint: "M5",
        hit: null,
        multiple: null,
        dataGap: "missing_ath",
        entryPriceUsd: 1,
        athAfterEntryUsd: null,
      }),
    ];
    const w = scoreWallet("W", buys, scored, defaultAnalyzeOptions());
    assert.equal(w.passesActivityFloor, true);
    assert.equal(w.scoredWithPrice, 4);
    assert.equal(w.dataGaps, 1);
    assert.equal(w.hits, 3);
    assert.equal(w.hitRate, 0.75);
    assert.equal(w.passesHitRate, true);
  });

  it("fails hit rate below 60%", () => {
    const buys: FirstBuy[] = [1, 2, 3, 4, 5].map((i) => ({
      wallet: "W",
      mint: `M${i}`,
      firstBuyTs: i,
      signature: `s${i}`,
      amount: 1,
    }));
    // 2/5 = 40%
    const scored = buys.map((b, i) =>
      tok({
        mint: b.mint,
        hit: i < 2,
        multiple: i < 2 ? 3 : 1.1,
      }),
    );
    const w = scoreWallet("W", buys, scored);
    assert.equal(w.hitRate, 0.4);
    assert.equal(w.passesHitRate, false);
  });
});

describe("selectBuysToScore / windowBounds", () => {
  it("takes 10 most recent", () => {
    const buys: FirstBuy[] = Array.from({ length: 12 }, (_, i) => ({
      wallet: "W",
      mint: `M${i}`,
      firstBuyTs: 100 - i,
      signature: `s${i}`,
      amount: 1,
    }));
    assert.equal(selectBuysToScore(buys).length, 10);
    assert.equal(selectBuysToScore(buys)[0]!.mint, "M0");
  });

  it("computes 2-week window", () => {
    const now = Date.UTC(2026, 10, 14);
    const { startTs, endTs } = windowBounds(now);
    assert.equal(endTs - startTs, 14 * 24 * 3600);
  });
});

describe("athFromCandles", () => {
  it("ignores pre-entry highs", () => {
    const ath = athFromCandles(
      [
        { t: 50, o: 1, h: 99, l: 1, c: 1 },
        { t: 100, o: 1, h: 2, l: 1, c: 1 },
        { t: 150, o: 1, h: 5, l: 1, c: 1 },
      ],
      100,
    );
    assert.equal(ath, 5);
  });
});

describe("rankWallets / filterPassing", () => {
  const base = {
    distinctTokensInWindow: 5,
    scoredTokens: [],
    hits: 0,
    scoredWithPrice: 5,
    dataGaps: 0,
    medianMultiple: null,
    passesActivityFloor: true,
    passesHitRate: true,
  };

  it("sorts by hitRate desc by default secondary avgMultiple", () => {
    const ranked = rankWallets(
      [
        { ...base, wallet: "a", hitRate: 0.6, avgMultiple: 3, passesHitRate: true },
        { ...base, wallet: "b", hitRate: 0.8, avgMultiple: 2, passesHitRate: true },
        { ...base, wallet: "c", hitRate: 0.6, avgMultiple: 5, passesHitRate: true },
      ],
      "hitRate",
      "desc",
    );
    assert.deepEqual(
      ranked.map((w) => w.wallet),
      ["b", "c", "a"],
    );
  });

  it("sorts avgMultiple ascending", () => {
    const ranked = rankWallets(
      [
        { ...base, wallet: "a", hitRate: 0.7, avgMultiple: 3 },
        { ...base, wallet: "b", hitRate: 0.7, avgMultiple: 2 },
      ],
      "avgMultiple",
      "asc",
    );
    assert.deepEqual(
      ranked.map((w) => w.wallet),
      ["b", "a"],
    );
  });

  it("filterPassing hides failures unless showAll", () => {
    const list = [
      {
        ...base,
        wallet: "pass",
        hitRate: 0.8,
        avgMultiple: 3,
        passesHitRate: true,
      },
      {
        ...base,
        wallet: "fail",
        hitRate: 0.2,
        avgMultiple: 1,
        passesHitRate: false,
      },
    ];
    assert.equal(filterPassing(list, false).length, 1);
    assert.equal(filterPassing(list, true).length, 2);
  });
});
