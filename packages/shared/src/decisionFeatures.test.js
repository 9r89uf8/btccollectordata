import test from "node:test";
import assert from "node:assert/strict";

import {
  LEAD_AGE_BUCKETS,
  MOMENTUM_AGREEMENT_BUCKETS,
  PRE_PATH_SHAPES,
} from "./analyticsDashboard.js";
import {
  bucketDistance,
  buildPreTFeatures,
  computeLeader,
  computeRiskFlags,
  DECISION_LEAD_AGE_BUCKETS,
  DECISION_MOMENTUM_AGREEMENT_BUCKETS,
  DECISION_PRE_PATH_SHAPES,
  executionGate,
  getDecisionLeadAgeBucketId,
  getDecisionMomentumAgreementBucketId,
  nearestDecisionCheckpoint,
  rankAgainstReference,
  requiredDistanceBps,
  requiredEdge,
  signedDistanceBps,
} from "./decisionFeatures.js";

const WINDOW_START = 1_800_000_000_000;
const PRICE_TO_BEAT = 100;
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

function pathFromMargins(marginForSecond, maxSecond = 300) {
  const rows = [];

  for (let second = 0; second <= maxSecond; second += 5) {
    const marginBps = marginForSecond(second);

    rows.push({
      btcChainlink: btcFromMargin(marginBps),
      secondBucket: WINDOW_START + second * 1000,
      secondsFromWindowStart: second,
    });
  }

  return rows;
}

function normalizeBucketDefinitions(buckets) {
  return buckets.map((bucket) => ({ ...bucket }));
}

test("leader, distance, and checkpoint helpers use the phase 2 contract", () => {
  assert.ok(Math.abs(signedDistanceBps(100.06, 100) - 6) < 1e-9);
  assert.equal(computeLeader({ btcPrice: 100.006, priceToBeat: 100 }), "up");
  assert.equal(computeLeader({ btcPrice: 100.005, priceToBeat: 100 }), "none");
  assert.equal(computeLeader({ btcPrice: 99.994, priceToBeat: 100 }), "down");
  assert.equal(bucketDistance(-7.5), "5_7_5");
  assert.deepEqual(nearestDecisionCheckpoint(182), {
    absDeltaSeconds: 2,
    checkpointSecond: 180,
    deltaSeconds: 2,
    secondsFromWindowStart: 182,
  });
  assert.equal(nearestDecisionCheckpoint(186), null);
});

test("decision bucket definitions match analytics dashboard priors", () => {
  assert.deepEqual(
    normalizeBucketDefinitions(DECISION_LEAD_AGE_BUCKETS),
    normalizeBucketDefinitions(LEAD_AGE_BUCKETS),
  );
  assert.deepEqual(
    normalizeBucketDefinitions(DECISION_MOMENTUM_AGREEMENT_BUCKETS),
    normalizeBucketDefinitions(MOMENTUM_AGREEMENT_BUCKETS),
  );
  assert.deepEqual(
    normalizeBucketDefinitions(DECISION_PRE_PATH_SHAPES),
    normalizeBucketDefinitions(PRE_PATH_SHAPES),
  );
  assert.equal(getDecisionLeadAgeBucketId(120), "gte_120");
  assert.equal(
    getDecisionMomentumAgreementBucketId({ momentum30sAgreesWithLeader: true }),
    "agrees",
  );
  assert.equal(
    getDecisionMomentumAgreementBucketId({
      momentum30sAgreesWithLeader: false,
    }),
    "disagrees",
  );
  assert.equal(
    getDecisionMomentumAgreementBucketId({ momentum30sSide: "flat" }),
    "flat",
  );
});

test("rankAgainstReference projects live values onto empirical mid-ranks", () => {
  assert.equal(rankAgainstReference([0, 10, 20], 10), 0.5);
  assert.equal(rankAgainstReference([0, 10, 20], 30), 1);
  assert.equal(rankAgainstReference([0, 10, 20], -1), 0);
  assert.equal(rankAgainstReference([], 10), null);
});

test("buildPreTFeatures computes only from rows at or before checkpoint", () => {
  const cleanPath = pathFromMargins(() => 6);
  const withMutatedPostRows = cleanPath.map((row) =>
    row.secondsFromWindowStart > 180
      ? { ...row, btcChainlink: btcFromMargin(-30) }
      : row,
  );
  const baseFeatures = buildPreTFeatures({
    checkpointSecond: 180,
    leader: "up",
    priceToBeat: PRICE_TO_BEAT,
    rankThresholds: RANK_THRESHOLDS,
    recentPath: cleanPath,
    windowStartTs: WINDOW_START,
  });
  const mutatedFeatures = buildPreTFeatures({
    checkpointSecond: 180,
    leader: "up",
    priceToBeat: PRICE_TO_BEAT,
    rankThresholds: RANK_THRESHOLDS,
    recentPath: withMutatedPostRows,
    windowStartTs: WINDOW_START,
  });

  assert.equal(baseFeatures.prePathGood, true);
  assert.equal(baseFeatures.preCurrentLeadAgeSeconds, 180);
  assert.equal(baseFeatures.preFlipCount, 0);
  assert.equal(baseFeatures.preNearLinePct, baseFeatures.nearLinePct);
  assert.equal(baseFeatures.momentum30sAgreesWithLeader, null);
  assert.equal(baseFeatures.prePathShape, "clean-lock");
  assert.deepEqual(mutatedFeatures, baseFeatures);
});

test("buildPreTFeatures classifies recent locks from live path rows", () => {
  const recentLockPath = pathFromMargins((second) => (second < 165 ? -6 : 6));
  const features = buildPreTFeatures({
    checkpointSecond: 180,
    leader: "up",
    priceToBeat: PRICE_TO_BEAT,
    rankThresholds: RANK_THRESHOLDS,
    recentPath: recentLockPath,
    windowStartTs: WINDOW_START,
  });

  assert.equal(features.prePathGood, true);
  assert.equal(features.preCurrentLeadAgeSeconds, 15);
  assert.equal(features.prePathShape, "recent-lock");
});

test("computeRiskFlags separates hard vetoes from soft risks", () => {
  const flags = computeRiskFlags({
    features: {
      momentum30sAgreesWithLeader: false,
      nearLineRank: 0.8,
      oscillationRank: 0.4,
      pooledChopRank: 0.8,
      preChopBucket: "high",
      prePathGood: true,
      prePathShape: "unresolved",
    },
    rankThresholds: RANK_THRESHOLDS,
  });

  assert.equal(flags.recentLock, false);
  assert.equal(flags.weakCoverage, false);
  assert.equal(flags.unknownPath, false);
  assert.equal(flags.highChop, true);
  assert.equal(flags.nearLineHeavy, true);
  assert.equal(flags.momentumAgainstLeader, true);
  assert.equal(flags.softRiskCount, 3);
  assert.equal(flags.tooManySoftRisks, true);
});

test("distance requirements rise while test edge is disabled", () => {
  assert.equal(requiredDistanceBps(180, 0), 5);
  assert.equal(requiredDistanceBps(180, 1), 7.5);
  assert.equal(requiredDistanceBps(180, 2), 10);
  assert.equal(requiredDistanceBps(180, 3), 10);
  assert.equal(requiredEdge(200, 0), 0);
  assert.equal(requiredEdge(200, 1), 0);
  assert.equal(requiredEdge(200, 2), 0);
});

test("executionGate checks EV before spread and depth quality", () => {
  assert.deepEqual(
    executionGate({
      checkpointSecond: 200,
      leaderAsk: 0.84,
      leaderSpread: 0.02,
      leaderTopAskDepth: 2,
      pEst: 0.90,
    }),
    {
      accepted: true,
      edge: 0.06000000000000005,
      reasonCodes: [],
      requiredEdge: 0,
    },
  );
  assert.equal(
    executionGate({
      checkpointSecond: 200,
      leaderAsk: 0.91,
      leaderSpread: 0.04,
      leaderTopAskDepth: 2,
      pEst: 0.90,
    }).reasonCodes[0],
    "no_ev_against_top_ask",
  );
  assert.equal(
    executionGate({
      checkpointSecond: 200,
      leaderAsk: 0.80,
      leaderSpread: 0.04,
      leaderTopAskDepth: 2,
      pEst: 0.90,
    }).reasonCodes[0],
    "wide_spread",
  );
  assert.equal(
    executionGate({
      checkpointSecond: 200,
      leaderAsk: 0.80,
      leaderSpread: 0.02,
      leaderTopAskDepth: 0.5,
      pEst: 0.90,
    }).reasonCodes[0],
    "insufficient_top_ask_depth",
  );
});
