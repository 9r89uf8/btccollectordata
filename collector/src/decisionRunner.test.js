import assert from "node:assert/strict";
import test from "node:test";

import { DECISION_CONFIG } from "../../packages/shared/src/decisionConfig.js";
import { createDecisionPathBufferStore } from "./decisionPathBuffer.js";
import { buildDecisionContext, runDecision } from "./decisionRunner.js";

const WINDOW_START = 1_800_000_000_000;
const PRICE_TO_BEAT = 100;
const MARKET = {
  marketId: "market-1",
  priceToBeatOfficial: PRICE_TO_BEAT,
  slug: "btc-updown-5m-test",
  windowEndTs: WINDOW_START + 300_000,
  windowStartTs: WINDOW_START,
};
const RANK_THRESHOLDS = {
  highThreshold: 0.613,
  lowThreshold: 0.386,
  nearLineHighThreshold: 0.667,
  oscillationHighThreshold: 0.667,
  referenceValues: {
    nearLinePct: [0, 0.2, 0.4, 0.6, 0.8],
    preFlipRatePerMinute: [0, 0.4, 0.8, 1.2, 1.6],
  },
};

function btcFromMargin(marginBps) {
  return PRICE_TO_BEAT * (1 + marginBps / 10000);
}

function pathRows({
  marginBps = 6,
  maxSecond = 180,
  minSecond = 0,
  staleTs = false,
} = {}) {
  const rows = [];

  for (let second = minSecond; second <= maxSecond; second += 5) {
    rows.push({
      btcChainlink: btcFromMargin(marginBps),
      marketSlug: MARKET.slug,
      secondBucket: WINDOW_START + second * 1000,
      secondsFromWindowStart: second,
      sourceQuality: "good",
      ts: staleTs ? WINDOW_START - 60_000 : WINDOW_START + second * 1000,
    });
  }

  return rows;
}

function completeContext(overrides = {}) {
  const nowMs = WINDOW_START + 180_000;

  return {
    collectorStatus: "ok",
    latestChainlinkTick: {
      price: btcFromMargin(6),
      receivedAt: nowMs - 500,
      ts: nowMs - 500,
    },
    latestSnapshot: {
      downAsk: 0.88,
      downBid: 0.72,
      downDepthAskTop: 5,
      downSpread: 0.02,
      secondBucket: nowMs,
      secondsFromWindowStart: 180,
      sourceQuality: "good",
      upAsk: 0.78,
      upBid: 0.72,
      upDepthAskTop: 5,
      upSpread: 0.02,
      writtenAt: nowMs - 500,
    },
    market: MARKET,
    nowMs,
    priors: {
      baseByCheckpointDistance: [],
      rankThresholds: RANK_THRESHOLDS,
    },
    recentPath: pathRows(),
    ...overrides,
  };
}

test("buildDecisionContext uses local snapshot and path buffers", () => {
  const pathBuffer = createDecisionPathBufferStore();
  const latestSnapshotsByMarketSlug = new Map([
    [
      MARKET.slug,
      {
        secondBucket: WINDOW_START + 180_000,
        secondsFromWindowStart: 180,
        sourceQuality: "good",
      },
    ],
  ]);

  pathBuffer.syncActiveMarkets([MARKET]);
  pathBuffer.pushSnapshots(pathRows({ maxSecond: 10 }));

  const context = buildDecisionContext({
    collectorStatus: "ok",
    latestChainlinkTick: { price: 100, receivedAt: WINDOW_START },
    latestSnapshotsByMarketSlug,
    market: MARKET,
    nowMs: WINDOW_START + 180_000,
    pathBuffer,
  });

  assert.equal(context.collectorHealth.status, "ok");
  assert.equal(context.latestSnapshot.secondsFromWindowStart, 180);
  assert.equal(context.recentPath.length, 3);
});

test("runDecision turns missing context into WAIT instead of throwing", () => {
  const { error, result } = runDecision({
    collectorStatus: "ok",
    nowMs: WINDOW_START + 180_000,
    priors: { rankThresholds: RANK_THRESHOLDS },
  });

  assert.equal(error, null);
  assert.equal(result.action, "WAIT");
  assert.deepEqual(result.reasonCodes, ["missing_window_timing"]);
});

test("mid-window restart leaves weak path coverage and waits", () => {
  const { result } = runDecision(
    completeContext({
      recentPath: pathRows({ minSecond: 170, maxSecond: 180 }),
    }),
  );

  assert.equal(result.action, "WAIT");
  assert.deepEqual(result.reasonCodes, ["weak_coverage"]);
});

test("path buffer failures become empty-path WAIT decisions", () => {
  const context = buildDecisionContext({
    ...completeContext(),
    pathBuffer: {
      getRecentPath() {
        throw new Error("buffer corrupted");
      },
    },
    recentPath: null,
  });
  const { result } = runDecision({
    context,
    priors: context.priors,
  });

  assert.deepEqual(context.recentPath, []);
  assert.equal(result.action, "WAIT");
  assert.deepEqual(result.reasonCodes, ["weak_coverage"]);
});

test("BTC freshness comes from the live Chainlink tick, not path buffer rows", () => {
  const { result } = runDecision(
    completeContext({
      recentPath: pathRows({ staleTs: true }),
    }),
  );

  assert.equal(result.action, "WAIT");
  assert.notDeepEqual(result.reasonCodes, ["btc_too_old"]);
  assert.equal(result.features.prePathGood, true);
});

test("decision runner catches engine exceptions and keeps collector-safe output", () => {
  const brokenConfig = {
    ...DECISION_CONFIG,
    targetCheckpoints: null,
    version: "broken-test-config",
  };
  const { error, result } = runDecision({
    ...completeContext(),
    config: brokenConfig,
  });

  assert.equal(error, null);
  assert.equal(result.action, "WAIT");
  assert.equal(result.decisionVersion, "broken-test-config");
  assert.deepEqual(result.reasonCodes, ["decision_exception"]);
  assert.match(result.decisionError, /targetCheckpoints/);
});
