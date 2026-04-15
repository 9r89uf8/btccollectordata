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
