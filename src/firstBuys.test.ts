import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFirstBuys,
  impliedEntryFromSwap,
  takeMostRecentFirstBuys,
} from "./firstBuys.js";
import type { HeliusEnhancedTx } from "./types.js";

const WALLET = "ED3PwgrF19HrotRBdazLPnZwrCQ7TrWuSqMBc5njqpuA";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const MINT_A = "MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MINT_B = "MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("impliedEntryFromSwap", () => {
  it("derives USD entry from USDC spend / tokens received", () => {
    const tx: HeliusEnhancedTx = {
      signature: "sig1",
      timestamp: 1_700_000_000,
      type: "SWAP",
      events: {
        swap: {
          tokenInputs: [{ mint: USDC, tokenAmount: 10 }],
          tokenOutputs: [{ mint: MINT_A, tokenAmount: 1000 }],
        },
      },
    };
    const price = impliedEntryFromSwap(tx, WALLET, MINT_A);
    assert.equal(price, 0.01);
  });

  it("falls back to tokenTransfers pairing", () => {
    const tx: HeliusEnhancedTx = {
      signature: "sig2",
      timestamp: 1_700_000_100,
      type: "SWAP",
      tokenTransfers: [
        {
          fromUserAccount: WALLET,
          toUserAccount: "pool",
          mint: USDC,
          tokenAmount: 5,
        },
        {
          fromUserAccount: "pool",
          toUserAccount: WALLET,
          mint: MINT_B,
          tokenAmount: 250,
        },
      ],
    };
    assert.equal(impliedEntryFromSwap(tx, WALLET, MINT_B), 0.02);
  });
});

describe("extractFirstBuys", () => {
  it("excludes USDC/WSOL, keeps earliest buy, sorts newest-first", () => {
    const txs: HeliusEnhancedTx[] = [
      {
        signature: "old",
        timestamp: 100,
        type: "SWAP",
        tokenTransfers: [
          {
            toUserAccount: WALLET,
            mint: MINT_A,
            tokenAmount: 1,
          },
          {
            toUserAccount: WALLET,
            mint: USDC,
            tokenAmount: 100,
          },
        ],
      },
      {
        signature: "mid",
        timestamp: 200,
        type: "SWAP",
        tokenTransfers: [
          {
            toUserAccount: WALLET,
            mint: MINT_B,
            tokenAmount: 2,
          },
          {
            toUserAccount: WALLET,
            mint: WSOL,
            tokenAmount: 1,
          },
        ],
      },
      {
        signature: "rebuy",
        timestamp: 300,
        type: "SWAP",
        tokenTransfers: [
          {
            toUserAccount: WALLET,
            mint: MINT_A,
            tokenAmount: 9,
          },
        ],
      },
    ];

    const buys = extractFirstBuys(WALLET, txs, 50, 400);
    assert.equal(buys.length, 2);
    assert.equal(buys[0]!.mint, MINT_B);
    assert.equal(buys[0]!.firstBuyTs, 200);
    assert.equal(buys[1]!.mint, MINT_A);
    assert.equal(buys[1]!.signature, "old"); // first buy, not rebuy
  });

  it("ignores pure TRANSFER types and out-of-window txs", () => {
    const txs: HeliusEnhancedTx[] = [
      {
        signature: "xfer",
        timestamp: 100,
        type: "TRANSFER",
        tokenTransfers: [
          { toUserAccount: WALLET, mint: MINT_A, tokenAmount: 1 },
        ],
      },
      {
        signature: "old",
        timestamp: 10,
        type: "SWAP",
        tokenTransfers: [
          { toUserAccount: WALLET, mint: MINT_B, tokenAmount: 1 },
        ],
      },
    ];
    const buys = extractFirstBuys(WALLET, txs, 50, 400);
    assert.equal(buys.length, 0);
  });
});

describe("takeMostRecentFirstBuys", () => {
  it("caps to N newest", () => {
    const buys = extractFirstBuys(
      WALLET,
      [
        {
          signature: "1",
          timestamp: 100,
          type: "SWAP",
          tokenTransfers: [
            { toUserAccount: WALLET, mint: MINT_A, tokenAmount: 1 },
          ],
        },
        {
          signature: "2",
          timestamp: 200,
          type: "SWAP",
          tokenTransfers: [
            { toUserAccount: WALLET, mint: MINT_B, tokenAmount: 1 },
          ],
        },
      ],
      0,
      999,
    );
    assert.equal(takeMostRecentFirstBuys(buys, 1).length, 1);
    assert.equal(takeMostRecentFirstBuys(buys, 1)[0]!.mint, MINT_B);
  });
});
