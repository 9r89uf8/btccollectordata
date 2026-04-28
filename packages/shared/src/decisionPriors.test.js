import test from "node:test";
import assert from "node:assert/strict";

import { decide } from "./decisionEngine.js";
import {
  buildDecisionPriorsFromRollup,
  DECISION_PRIOR_SUPPORT_TIERS,
  estimateDecisionProbability,
  findPriorCell,
  getPriorN,
  getPriorProbability,
  shrinkProbability,
  supportTierForN,
} from "./decisionPriors.js";

const FEATURES = {
  leadAgeBucket: "60_120",
  momentumAgreementBucket: "disagrees",
  preChopBucket: "low",
  prePathShape: "clean-lock",
};
const WINDOW_START = 1_800_000_000_000;
const PRICE_TO_BEAT = 100;

function btcFromMargin(marginBps) {
  return PRICE_TO_BEAT * (1 + marginBps / 10000);
}

function pathFromMargins(marginBps, maxSecond = 300) {
  const rows = [];

  for (let second = 0; second <= maxSecond; second += 5) {
    rows.push({
      btcChainlink: btcFromMargin(marginBps),
      secondBucket: WINDOW_START + second * 1000,
      secondsFromWindowStart: second,
    });
  }

  return rows;
}

function decisionContext() {
  const secondsFromWindowStart = 180;
  const nowMs = WINDOW_START + secondsFromWindowStart * 1000;

  return {
    collectorHealth: { status: "ok" },
    latestChainlinkTick: {
      price: btcFromMargin(6),
      receivedAt: nowMs - 1000,
      ts: nowMs - 1000,
    },
    latestSnapshot: {
      downAsk: 0.88,
      downBid: 0.72,
      downDepthAskTop: 5,
      downSpread: 0.02,
      secondBucket: WINDOW_START + secondsFromWindowStart * 1000,
      secondsFromWindowStart,
      sourceQuality: "good",
      upAsk: 0.78,
      upBid: 0.72,
      upDepthAskTop: 5,
      upSpread: 0.02,
      writtenAt: nowMs - 500,
    },
    market: {
      priceToBeatOfficial: PRICE_TO_BEAT,
      windowStartTs: WINDOW_START,
    },
    nowMs,
    recentPath: pathFromMargins(6),
  };
}

test("prior helpers read dashboard-shaped cell fields", () => {
  const priors = {
    baseByCheckpointDistance: [
      {
        N: 123,
        checkpointSecond: 180,
        distanceBucket: "5_7_5",
        leaderWinRate: 0.87,
      },
    ],
  };
  const cell = findPriorCell(priors, "base", {
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
  });

  assert.equal(getPriorProbability(cell), 0.87);
  assert.equal(getPriorN(cell), 123);
});

test("shrinkProbability uses the phase 3 formula", () => {
  assert.equal(shrinkProbability(0.75, 200, 0.85, 200), 0.8);
  assert.equal(shrinkProbability(null, 200, 0.85, 200), null);
});

test("supportTierForN applies the phase 1 live-prior floors", () => {
  assert.equal(supportTierForN(100), DECISION_PRIOR_SUPPORT_TIERS.USABLE);
  assert.equal(supportTierForN(99), DECISION_PRIOR_SUPPORT_TIERS.WARNING_ONLY);
  assert.equal(supportTierForN(50), DECISION_PRIOR_SUPPORT_TIERS.WARNING_ONLY);
  assert.equal(supportTierForN(49), DECISION_PRIOR_SUPPORT_TIERS.IGNORED);
});

test("buildDecisionPriorsFromRollup compacts dashboard sections for live decisions", () => {
  const priors = buildDecisionPriorsFromRollup({
    analyticsVersion: 3,
    computedAt: 123456,
    rollupVersion: 5,
    stabilityAnalyticsVersion: 2,
    v1: {
      leader: {
        byCheckpointAndDistance: [
          {
            N: 200,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leaderWinRate: 0.86,
          },
          {
            N: 80,
            checkpointSecond: 180,
            distanceBucket: "7_5_10",
            leaderWinRate: 0.82,
          },
          {
            N: 40,
            checkpointSecond: 180,
            distanceBucket: "gt_10",
            leaderWinRate: null,
          },
          {
            N: 500,
            checkpointSecond: 120,
            distanceBucket: "5_7_5",
            leaderWinRate: 0.70,
          },
        ],
        distanceBuckets: [{ id: "5_7_5", label: "5-7.5 bps" }],
      },
    },
    v2: {
      stability: {
        leaderAgeByDistance: [
          {
            N: 90,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leadAgeBucket: "60_120",
            leaderEligibleN: 80,
            leaderWinRate: 0.70,
          },
        ],
        momentumAgreement: [
          {
            N: 45,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leaderEligibleN: 45,
            leaderWinRate: 0.60,
            momentumAgreementBucket: "disagrees",
          },
          {
            N: 120,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leaderEligibleN: 120,
            leaderWinRate: 0.78,
            momentumAgreementBucket: "flat",
          },
        ],
        pathRiskByChop: [
          {
            N: 130,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leaderEligibleN: 120,
            leaderWinRate: 0.76,
            preChopBucket: "low",
          },
        ],
        preChopBucketDefinitions: {
          ranks: {
            highThreshold: 0.613,
            lowThreshold: 0.386,
            nearLineHighThreshold: 0.667,
            oscillationHighThreshold: 0.666,
            targetCheckpoints: [180, 200, 210, 220, 240],
            tieHandling: "mid-rank",
          },
          referenceValues: {
            nearLinePct: [0.4, 0.2, 0.6],
            preFlipRatePerMinute: [1.2, 0, 0.6],
          },
        },
        prePathShapes: {
          cells: [
            {
              N: 170,
              checkpointSecond: 180,
              leaderEligibleN: 150,
              leaderWinRate: 0.78,
              prePathShape: "clean-lock",
            },
          ],
        },
      },
    },
  });
  const estimate = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: {
      leadAgeBucket: "60_120",
      momentumAgreementBucket: "flat",
      preChopBucket: "low",
      prePathShape: "clean-lock",
    },
    priors,
  });
  const warningBase = findPriorCell(priors, "base", {
    checkpointSecond: 180,
    distanceBucket: "7_5_10",
  });
  const ignoredBase = findPriorCell(priors, "base", {
    checkpointSecond: 180,
    distanceBucket: "gt_10",
  });
  const skippedCheckpoint = findPriorCell(priors, "base", {
    checkpointSecond: 120,
    distanceBucket: "5_7_5",
  });
  const bySource = Object.fromEntries(
    estimate.pCandidates.map((candidate) => [candidate.source, candidate]),
  );

  assert.equal(priors.computedAt, 123456);
  assert.equal(priors.rollupVersion, 5);
  assert.equal(priors.analyticsVersion, 3);
  assert.equal(priors.stabilityAnalyticsVersion, 2);
  assert.deepEqual(priors.distanceBuckets, [
    { id: "5_7_5", label: "5-7.5 bps" },
  ]);
  assert.equal(priors.rankThresholds.lowThreshold, 0.386);
  assert.equal(priors.rankThresholds.highThreshold, 0.613);
  assert.equal(priors.rankThresholds.nearLineHighThreshold, 0.667);
  assert.equal(priors.rankThresholds.oscillationHighThreshold, 0.666);
  assert.deepEqual(priors.rankThresholds.referenceValues.nearLinePct, [
    0.2,
    0.4,
    0.6,
  ]);
  assert.deepEqual(
    priors.rankThresholds.referenceValues.preFlipRatePerMinute,
    [0, 0.6, 1.2],
  );
  assert.equal(warningBase.supportTier, "warning-only");
  assert.equal(ignoredBase, null);
  assert.equal(skippedCheckpoint, null);
  assert.equal(priors.momentumByCheckpointDistance.length, 1);
  assert.equal(bySource.base.accepted, true);
  assert.equal(bySource.chop.accepted, true);
  assert.equal(bySource.leaderAge.accepted, false);
  assert.equal(bySource.leaderAge.rejectionReason, "sparse");
  assert.equal(bySource.prePathShape.accepted, true);
  assert.ok(Math.abs(estimate.pEst - 0.8225) < 1e-12);
});

test("buildDecisionPriorsFromRollup tolerates missing rollup sections", () => {
  const priors = buildDecisionPriorsFromRollup(null);

  assert.equal(priors.computedAt, null);
  assert.deepEqual(priors.distanceBuckets, []);
  assert.deepEqual(priors.baseByCheckpointDistance, []);
  assert.deepEqual(priors.chopByCheckpointDistance, []);
  assert.deepEqual(priors.rankThresholds.referenceValues.nearLinePct, []);
});

test("ignored mapper cells are absent and produce base_prior_missing in decide", () => {
  const priors = buildDecisionPriorsFromRollup({
    computedAt: 123456,
    rollupVersion: 5,
    v1: {
      leader: {
        byCheckpointAndDistance: [
          {
            N: 40,
            checkpointSecond: 180,
            distanceBucket: "5_7_5",
            leaderWinRate: 0.86,
          },
        ],
      },
    },
    v2: {
      stability: {
        preChopBucketDefinitions: {
          ranks: {
            highThreshold: 0.613,
            lowThreshold: 0.386,
            nearLineHighThreshold: 0.667,
            oscillationHighThreshold: 0.666,
          },
          referenceValues: {
            nearLinePct: [0, 0.2, 0.4],
            preFlipRatePerMinute: [0, 0.2, 0.4],
          },
        },
      },
    },
  });
  const result = decide(decisionContext(), priors);

  assert.equal(findPriorCell(priors, "base", {
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
  }), null);
  assert.deepEqual(result.reasonCodes, ["base_prior_missing"]);
});

test("estimateDecisionProbability uses min of supported shrunk priors", () => {
  const estimate = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {
      baseByCheckpointDistance: [
        { checkpointSecond: 180, distanceBucket: "5_7_5", n: 200, p: 0.86 },
      ],
      chopByCheckpointDistance: [
        {
          checkpointSecond: 180,
          distanceBucket: "5_7_5",
          n: 200,
          p: 0.90,
          preChopBucket: "low",
        },
      ],
      leaderAgeByCheckpointDistance: [
        {
          checkpointSecond: 180,
          distanceBucket: "5_7_5",
          leadAgeBucket: "60_120",
          n: 50,
          p: 0.70,
        },
      ],
      momentumByCheckpointDistance: [
        {
          checkpointSecond: 180,
          distanceBucket: "5_7_5",
          momentumAgreementBucket: "disagrees",
          n: 200,
          p: 0.78,
        },
      ],
    },
  });
  const bySource = Object.fromEntries(
    estimate.pCandidates.map((candidate) => [candidate.source, candidate]),
  );

  assert.equal(estimate.pBase, 0.86);
  assert.equal(estimate.pEst, 0.82);
  assert.equal(bySource.base.accepted, true);
  assert.equal(bySource.chop.accepted, true);
  assert.equal(bySource.chop.shrunk, 0.88);
  assert.equal(bySource.momentum.accepted, true);
  assert.equal(bySource.momentum.shrunk, 0.82);
  assert.equal(bySource.leaderAge.accepted, false);
  assert.equal(bySource.leaderAge.rejectionReason, "sparse");
  assert.equal(bySource.prePathShape.accepted, false);
  assert.equal(bySource.prePathShape.rejectionReason, "missing");
});

test("estimateDecisionProbability keys prePathShape priors by checkpoint and shape", () => {
  const estimate = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {
      baseByCheckpointDistance: [
        { checkpointSecond: 180, distanceBucket: "5_7_5", n: 200, p: 0.86 },
      ],
      prePathShapeByCheckpoint: [
        {
          checkpointSecond: 180,
          n: 200,
          p: 0.70,
          prePathShape: "clean-lock",
        },
        {
          checkpointSecond: 180,
          n: 200,
          p: 0.40,
          prePathShape: "recent-lock",
        },
        {
          checkpointSecond: 200,
          n: 200,
          p: 0.99,
          prePathShape: "clean-lock",
        },
      ],
    },
  });
  const bySource = Object.fromEntries(
    estimate.pCandidates.map((candidate) => [candidate.source, candidate]),
  );

  assert.equal(bySource.prePathShape.accepted, true);
  assert.ok(Math.abs(bySource.prePathShape.shrunk - 0.78) < 1e-12);
  assert.ok(Math.abs(estimate.pEst - 0.78) < 1e-12);
});

test("estimateDecisionProbability never lets splits raise p_est above base", () => {
  const estimate = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {
      baseByCheckpointDistance: [
        { checkpointSecond: 180, distanceBucket: "5_7_5", n: 200, p: 0.84 },
      ],
      chopByCheckpointDistance: [
        {
          checkpointSecond: 180,
          distanceBucket: "5_7_5",
          n: 500,
          p: 0.99,
          preChopBucket: "low",
        },
      ],
    },
  });

  assert.equal(estimate.pEst, 0.84);
});

test("estimateDecisionProbability does not score missing or sparse base priors", () => {
  const missing = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {},
  });
  const sparse = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {
      baseByCheckpointDistance: [
        { checkpointSecond: 180, distanceBucket: "5_7_5", n: 99, p: 0.86 },
      ],
    },
  });

  assert.equal(missing.pEst, null);
  assert.equal(missing.pCandidates[0].rejectionReason, "missing");
  assert.equal(sparse.pEst, null);
  assert.equal(sparse.pCandidates[0].rejectionReason, "sparse");
});

test("estimateDecisionProbability reports missing before sparse for malformed cells", () => {
  const estimate = estimateDecisionProbability({
    checkpointSecond: 180,
    distanceBucket: "5_7_5",
    features: FEATURES,
    priors: {
      baseByCheckpointDistance: [
        { checkpointSecond: 180, distanceBucket: "5_7_5", n: 50, p: null },
      ],
    },
  });

  assert.equal(estimate.pEst, null);
  assert.equal(estimate.pCandidates[0].rejectionReason, "missing");
});
