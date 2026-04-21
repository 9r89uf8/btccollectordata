import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveCall,
  buildLiveMarketSignalReport,
} from "./liveSignals.js";

function createSnapshot(second, btcChainlink, overrides = {}) {
  return {
    _id: `snapshot-${second}`,
    secondBucket: second * 1000,
    secondsFromWindowStart: second,
    phase: "live",
    ts: second * 1000,
    btcChainlink,
    upDisplayed: 0.5,
    downDisplayed: 0.5,
    ...overrides,
  };
}

function createMarket(overrides = {}) {
  return {
    _id: "market-1",
    active: true,
    captureMode: "poll",
    dataQuality: "good",
    outcomeLabels: {
      upLabel: "Up",
      downLabel: "Down",
    },
    priceToBeatOfficial: 100,
    priceToBeatDerived: 100,
    question: "BTC up or down?",
    slug: "btc-updown-5m-test",
    windowEndTs: 300_000,
    windowStartTs: 0,
    ...overrides,
  };
}

test("buildLiveCall matches the latest completed checkpoint when a strong rule exists", () => {
  const market = createMarket();
  const snapshotsBySlug = new Map([
    [
      market.slug,
      [
        createSnapshot(0, 100),
        createSnapshot(30, 112),
        createSnapshot(60, 123, { upDisplayed: 0.7, downDisplayed: 0.3 }),
        createSnapshot(90, 128),
      ],
    ],
  ]);
  const [signal] = buildLiveMarketSignalReport({
    markets: [market],
    nowTs: 95_000,
    snapshotsBySlug,
  });

  const call = buildLiveCall(signal, [
    {
      checkpoint: "t60",
      checkpointSecond: 60,
      distanceBucketId: "20_30",
      distanceBucketLabel: "$20-$29.99",
      qualityBucketId: "quality_35_plus",
      qualityBucketLabel: "0.35+ (clean)",
      sampleCount: 64,
      side: "up",
      winRate: 0.766,
    },
  ]);

  assert.equal(call.label, "Call Up");
  assert.equal(call.side, "up");
  assert.equal(call.activeEvaluation.checkpointSecond, 60);
  assert.equal(call.matchedRule.distanceBucketId, "20_30");
});

test("buildLiveCall falls back to no clear call when the latest completed checkpoint has no strong rule", () => {
  const market = createMarket();
  const snapshotsBySlug = new Map([
    [
      market.slug,
      [
        createSnapshot(0, 100),
        createSnapshot(30, 112),
        createSnapshot(60, 123, { upDisplayed: 0.7, downDisplayed: 0.3 }),
        createSnapshot(90, 116),
        createSnapshot(120, 105, { upDisplayed: 0.53, downDisplayed: 0.47 }),
        createSnapshot(130, 104),
      ],
    ],
  ]);
  const [signal] = buildLiveMarketSignalReport({
    markets: [market],
    nowTs: 131_000,
    snapshotsBySlug,
  });

  const call = buildLiveCall(signal, [
    {
      checkpoint: "t60",
      checkpointSecond: 60,
      distanceBucketId: "20_30",
      distanceBucketLabel: "$20-$29.99",
      qualityBucketId: "quality_35_plus",
      qualityBucketLabel: "0.35+ (clean)",
      sampleCount: 64,
      side: "up",
      winRate: 0.766,
    },
  ]);

  assert.equal(call.label, "No clear call");
  assert.equal(call.side, null);
  assert.equal(call.activeEvaluation.checkpointSecond, 120);
  assert.equal(call.matchedRule, null);
});
