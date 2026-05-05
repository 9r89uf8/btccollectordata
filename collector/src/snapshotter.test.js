import test from "node:test";
import assert from "node:assert/strict";

import { DISPLAY_RULES, SNAPSHOT_QUALITY } from "../../packages/shared/src/snapshot.js";
import { buildMarketSnapshots, compareSnapshotParity } from "./snapshotter.js";

const nowTs = Date.UTC(2026, 3, 13, 12, 0, 5);
const baseMarket = {
  slug: "btc-updown-5m-test",
  marketId: "test-market",
  tokenIdsByOutcome: {
    up: "up-token",
    down: "down-token",
  },
  windowStartTs: nowTs + 60_000,
  windowEndTs: nowTs + 360_000,
};

test("buildMarketSnapshots treats midpoint-only poll data as current when timestamps are absent", () => {
  const [snapshot] = buildMarketSnapshots({
    markets: [baseMarket],
    marketData: {
      booksByTokenId: new Map(),
      endpointErrors: [],
      lastTradesByTokenId: new Map(),
      midpointsByTokenId: new Map([
        ["up-token", "0.52"],
        ["down-token", "0.48"],
      ]),
    },
    latestChainlinkTick: {
      price: 74500,
      receivedAt: nowTs - 1000,
    },
    latestBinanceTick: null,
    nowTs,
  });

  assert.equal(snapshot.upDisplayed, 0.52);
  assert.equal(snapshot.downDisplayed, 0.48);
  assert.equal(snapshot.displayRuleUsed, DISPLAY_RULES.MIDPOINT);
  assert.equal(snapshot.sourceQuality, SNAPSHOT_QUALITY.GOOD);
  assert.equal(Object.hasOwn(snapshot, "btcChainlinkTs"), false);
  assert.equal(Object.hasOwn(snapshot, "upLastTs"), false);
});

test("buildMarketSnapshots keeps last-trade-only snapshots usable when books are unavailable", () => {
  const [snapshot] = buildMarketSnapshots({
    markets: [baseMarket],
    marketData: {
      booksByTokenId: new Map(),
      endpointErrors: ["books: books request failed: 429"],
      lastTradesByTokenId: new Map([
        ["up-token", { price: 0.51 }],
        ["down-token", { price: 0.49 }],
      ]),
      midpointsByTokenId: new Map(),
    },
    latestChainlinkTick: {
      price: 74500,
      receivedAt: nowTs - 1000,
    },
    latestBinanceTick: null,
    nowTs,
  });

  assert.equal(snapshot.upDisplayed, 0.51);
  assert.equal(snapshot.downDisplayed, 0.49);
  assert.equal(snapshot.displayRuleUsed, DISPLAY_RULES.LAST_TRADE);
  assert.equal(snapshot.sourceQuality, SNAPSHOT_QUALITY.GOOD);
});

test("buildMarketSnapshots stores timing for final 10 second forensics only", () => {
  const finalNowTs = baseMarket.windowEndTs - 5000;
  const [snapshot] = buildMarketSnapshots({
    markets: [baseMarket],
    marketData: {
      booksByTokenId: new Map([
        [
          "up-token",
          {
            asks: [{ price: "0.56", size: "7" }],
            bids: [{ price: "0.54", size: "5" }],
            timestamp: finalNowTs - 500,
          },
        ],
        [
          "down-token",
          {
            asks: [{ price: "0.47", size: "3" }],
            bids: [{ price: "0.45", size: "4" }],
            timestamp: finalNowTs - 700,
          },
        ],
      ]),
      endpointErrors: [],
      lastTradesByTokenId: new Map([
        ["up-token", { price: 0.55, timestamp: finalNowTs - 3000 }],
        ["down-token", { price: 0.46, timestamp: finalNowTs - 4000 }],
      ]),
      midpointsByTokenId: new Map(),
    },
    latestChainlinkTick: {
      price: 74525,
      receivedAt: finalNowTs - 200,
      ts: finalNowTs - 900,
    },
    latestBinanceTick: {
      price: 74526,
      receivedAt: finalNowTs - 250,
      ts: finalNowTs - 800,
    },
    nowTs: finalNowTs,
  });

  assert.equal(snapshot.secondsFromWindowStart, 295);
  assert.equal(snapshot.upBookTs, finalNowTs - 500);
  assert.equal(snapshot.upBookAgeMs, 500);
  assert.equal(snapshot.downBookTs, finalNowTs - 700);
  assert.equal(snapshot.downBookAgeMs, 700);
  assert.equal(snapshot.upLastTs, finalNowTs - 3000);
  assert.equal(snapshot.upLastAgeMs, 3000);
  assert.equal(snapshot.downLastTs, finalNowTs - 4000);
  assert.equal(snapshot.downLastAgeMs, 4000);
  assert.equal(snapshot.btcChainlinkTs, finalNowTs - 900);
  assert.equal(snapshot.btcChainlinkReceivedAt, finalNowTs - 200);
  assert.equal(snapshot.btcChainlinkReceivedAgeMs, 200);
  assert.equal(snapshot.btcBinanceTs, finalNowTs - 800);
  assert.equal(snapshot.btcBinanceReceivedAt, finalNowTs - 250);
  assert.equal(snapshot.btcBinanceReceivedAgeMs, 250);
});

test("buildMarketSnapshots stores ETH prices and uses ETH freshness for ETH markets", () => {
  const [snapshot] = buildMarketSnapshots({
    markets: [
      {
        ...baseMarket,
        asset: "eth",
        slug: "eth-updown-5m-test",
      },
    ],
    marketData: {
      booksByTokenId: new Map(),
      endpointErrors: [],
      lastTradesByTokenId: new Map(),
      midpointsByTokenId: new Map([
        ["up-token", "0.52"],
        ["down-token", "0.48"],
      ]),
    },
    latestTicks: new Map([
      [
        "chainlink:btc/usd",
        {
          price: 74500,
          receivedAt: nowTs - 1000,
          source: "chainlink",
          symbol: "btc/usd",
        },
      ],
      [
        "chainlink:eth/usd",
        {
          price: 3450,
          receivedAt: nowTs - 1000,
          source: "chainlink",
          symbol: "eth/usd",
        },
      ],
      [
        "binance:ethusdt",
        {
          price: 3451,
          receivedAt: nowTs - 1000,
          source: "binance",
          symbol: "ethusdt",
        },
      ],
    ]),
    nowTs,
  });

  assert.equal(snapshot.asset, "eth");
  assert.equal(snapshot.btcChainlink, 74500);
  assert.equal(snapshot.ethChainlink, 3450);
  assert.equal(snapshot.ethBinance, 3451);
  assert.equal(snapshot.sourceQuality, SNAPSHOT_QUALITY.GOOD);
});

test("buildMarketSnapshots marks ETH market stale when ETH Chainlink is stale", () => {
  const [snapshot] = buildMarketSnapshots({
    markets: [
      {
        ...baseMarket,
        asset: "eth",
        slug: "eth-updown-5m-test",
      },
    ],
    marketData: {
      booksByTokenId: new Map(),
      endpointErrors: [],
      lastTradesByTokenId: new Map(),
      midpointsByTokenId: new Map([
        ["up-token", "0.52"],
        ["down-token", "0.48"],
      ]),
    },
    latestTicks: new Map([
      [
        "chainlink:btc/usd",
        {
          price: 74500,
          receivedAt: nowTs - 1000,
          source: "chainlink",
          symbol: "btc/usd",
        },
      ],
    ]),
    nowTs,
  });

  assert.equal(snapshot.sourceQuality, SNAPSHOT_QUALITY.STALE_BTC);
});

test("buildMarketSnapshots marks empty market data as gap instead of disappearing", () => {
  const [snapshot] = buildMarketSnapshots({
    markets: [baseMarket],
    marketData: {
      booksByTokenId: new Map(),
      lastTradesByTokenId: new Map(),
      midpointsByTokenId: new Map(),
    },
    latestChainlinkTick: {
      price: 74500,
      receivedAt: nowTs - 1000,
    },
    latestBinanceTick: null,
    nowTs,
  });

  assert.equal(snapshot.upDisplayed, null);
  assert.equal(snapshot.downDisplayed, null);
  assert.equal(snapshot.displayRuleUsed, DISPLAY_RULES.UNKNOWN);
  assert.equal(snapshot.sourceQuality, SNAPSHOT_QUALITY.GAP);
});

test("compareSnapshotParity reports display mismatches and missing candidates", () => {
  const result = compareSnapshotParity(
    [
      {
        marketSlug: "btc-updown-5m-test",
        secondBucket: 1,
        upDisplayed: 0.62,
        downDisplayed: 0.38,
        displayRuleUsed: DISPLAY_RULES.MIDPOINT,
      },
      {
        marketSlug: "btc-updown-5m-test",
        secondBucket: 2,
        upDisplayed: 0.59,
        downDisplayed: 0.41,
        displayRuleUsed: DISPLAY_RULES.MIDPOINT,
      },
    ],
    [
      {
        marketSlug: "btc-updown-5m-test",
        secondBucket: 1,
        upDisplayed: 0.56,
        downDisplayed: 0.44,
        displayRuleUsed: DISPLAY_RULES.LAST_TRADE,
      },
    ],
    0.03,
  );

  assert.equal(result.matchedCount, 1);
  assert.equal(result.missingCount, 1);
  assert.equal(result.mismatchCount, 2);
  assert.equal(result.mismatches[0].reason, "display_delta");
  assert.equal(result.mismatches[1].reason, "missing_candidate");
});
