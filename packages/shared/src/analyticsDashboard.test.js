import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REFERENCE_VALUES,
  buildAnalyticsDashboard,
} from "./analyticsDashboard.js";
import { MARKET_OUTCOMES } from "./market.js";

function checkpoint({
  distanceBps = 4,
  leaderWonAtClose = true,
  momentum30sAgreesWithLeader = true,
  momentum30sSide = MARKET_OUTCOMES.UP,
  postMinSignedMarginBps = 1,
  preCurrentLeadAgeSeconds = 90,
  preFlipCount = 0,
  preLastFlipAgeSeconds = preFlipCount === 0 ? null : 30,
  preNearLineSeconds = 10,
} = {}) {
  return {
    anyFlipAfterT: false,
    checkpointInNoise: false,
    checkpointSecond: 180,
    checkpointTs: 180_000,
    distanceBps,
    flipLoss: !leaderWonAtClose,
    leader: MARKET_OUTCOMES.UP,
    leaderAlignedMomentum30sBps: 1,
    leaderAlignedMomentum60sBps: 2,
    leaderWonAtClose,
    momentum30sAgreesWithLeader,
    momentum30sBps: 1,
    momentum30sSide,
    momentum60sAgreesWithLeader: true,
    momentum60sBps: 2,
    momentum60sSide: MARKET_OUTCOMES.UP,
    noisyLeaderWin: false,
    postAnyHardFlip: false,
    postMaxAdverseBps: Math.max(0, -postMinSignedMarginBps),
    postMinSignedMarginBps,
    postPathGood: true,
    postTouchedNoise: false,
    preCurrentLeadAgeSeconds,
    preDirectionChangeCount: preFlipCount,
    preCrossCountLast60s: 0,
    preFlipCount,
    preLastFlipAgeSeconds,
    preLeaderDwellPct: 0.7,
    preLongestLeadStreakSeconds: preCurrentLeadAgeSeconds,
    preMaxSnapshotGapMs: 1000,
    preNearLineSeconds,
    prePathGood: true,
    preRange60sBps: 3,
    preRange120sBps: 5,
    recoveredLeaderWin: false,
    stableLeaderWin: leaderWonAtClose,
    unknownPath: false,
  };
}

function stabilityRow(index, checkpointOverrides = {}, rowOverrides = {}) {
  const { pathSummary: pathSummaryOverrides, ...rest } = rowOverrides;

  return {
    checkpoints: [checkpoint(checkpointOverrides)],
    marketId: `market-${index}`,
    marketSlug: `btc-updown-5m-${index}`,
    pathSummary: {
      closeMarginBps: 4,
      hardFlipCount: 0,
      maxDistanceBps: 4,
      noiseTouchCount: 0,
      pathType: "early-lock",
      ...pathSummaryOverrides,
    },
    priceToBeat: 100,
    resolvedOutcome: MARKET_OUTCOMES.UP,
    windowEndTs: 300_000 + index,
    windowStartTs: index,
    ...rest,
  };
}

function analyticsRow(index, overrides = {}) {
  return {
    checkpoints: [],
    completeFreshCheckpoints: true,
    excludedReasons: [],
    marketSlug: `btc-updown-5m-${index}`,
    outcomeSource: "official",
    priceToBeat: 100,
    priceToBeatSource: "official",
    resolvedOutcome: MARKET_OUTCOMES.UP,
    summaryDataQuality: "good",
    windowEndTs: 300_000 + index,
    windowStartTs: index,
    ...overrides,
  };
}

test("buildAnalyticsDashboard creates path-risk, shape, and durability rollups", () => {
  const stabilityRows = Array.from({ length: 90 }, (_value, index) => {
    if (index < 30) {
      return stabilityRow(index, {
        postMinSignedMarginBps: 1,
        preCurrentLeadAgeSeconds: 90,
        preFlipCount: 0,
        preNearLineSeconds: 10,
      });
    }

    if (index < 60) {
      return stabilityRow(index, {
        postMinSignedMarginBps: 1,
        preCurrentLeadAgeSeconds: 45,
        preFlipCount: 2,
        preNearLineSeconds: 90,
      });
    }

    return stabilityRow(index, {
      postMinSignedMarginBps: 1,
      preCurrentLeadAgeSeconds: 20,
      preFlipCount: 4,
      preNearLineSeconds: 160,
    });
  });
  const analyticsRows = stabilityRows.map((_row, index) => analyticsRow(index));
  const dashboard = buildAnalyticsDashboard({ analyticsRows, stabilityRows });
  const highChopCell = dashboard.stability.pathRiskByChop.find(
    (cell) =>
      cell.checkpointSecond === 180 &&
      cell.distanceBucket === "3_4" &&
      cell.preChopBucket === "high",
  );
  const mediumChopCell = dashboard.stability.pathRiskByChop.find(
    (cell) =>
      cell.checkpointSecond === 180 &&
      cell.distanceBucket === "3_4" &&
      cell.preChopBucket === "medium",
  );
  const lowChopCell = dashboard.stability.pathRiskByChop.find(
    (cell) =>
      cell.checkpointSecond === 180 &&
      cell.distanceBucket === "3_4" &&
      cell.preChopBucket === "low",
  );
  const shapeCell = dashboard.stability.prePathShapes.cells.find(
    (cell) =>
      cell.checkpointSecond === 180 &&
      cell.prePathShape === "multi-flip-chop",
  );
  const durabilityCell = dashboard.stability.durability.cells.find(
    (cell) =>
      cell.checkpointSecond === 180 &&
      cell.distanceBucket === "3_4" &&
      cell.durabilityBucket === "1_2",
  );

  assert.equal(highChopCell.N, 30);
  assert.equal(mediumChopCell.N, 30);
  assert.equal(lowChopCell.N, 30);
  assert.equal(highChopCell.p90MaxAdverseDrawdownBps, 3);
  assert.equal(highChopCell.medianLeaderAlignedMomentum30sBps, 1);
  assert.equal(highChopCell.medianLeaderAlignedMomentum60sBps, 2);
  assert.equal(highChopCell.medianMomentum30sBps, 1);
  assert.equal(highChopCell.medianMomentum60sBps, 2);
  assert.equal(highChopCell.medianPreCrossCountLast60s, 0);
  assert.equal(highChopCell.medianPreMaxSnapshotGapMs, 1000);
  assert.equal(highChopCell.medianPreRange60sBps, 3);
  assert.equal(highChopCell.medianPreRange120sBps, 5);
  assert.equal(shapeCell.N, 30);
  assert.equal(durabilityCell.N, 90);
  assert.equal(durabilityCell.priorSourceCounts.checkpoint, 90);
  assert.equal(dashboard.health.cohortFunnel.cleanAnalyticsCount, 90);
  assert.equal(dashboard.health.cohortFunnel.cleanStabilityCount, 90);
  assert.equal(dashboard.health.cohortFunnel.cleanStabilityDelta, 0);
  assert.ok(
    dashboard.stability.preChopBucketDefinitions.ranks.lowThreshold > 1 / 3,
  );
  assert.ok(
    dashboard.stability.preChopBucketDefinitions.ranks.highThreshold < 2 / 3,
  );
  assert.ok(
    Number.isFinite(
      dashboard.stability.preChopBucketDefinitions.ranks.nearLineHighThreshold,
    ),
  );
  assert.ok(
    Number.isFinite(
      dashboard.stability.preChopBucketDefinitions.ranks.oscillationHighThreshold,
    ),
  );
  assert.equal(
    dashboard.stability.preChopBucketDefinitions.ranks.tieHandling,
    "mid-rank",
  );
  assert.equal(
    dashboard.stability.preChopBucketDefinitions.referenceValues.nearLinePct
      .length,
    90,
  );
  assert.equal(
    dashboard.stability.preChopBucketDefinitions.referenceValues
      .preFlipRatePerMinute.length,
    90,
  );
});

test("buildAnalyticsDashboard uses component thresholds for pre-path shapes", () => {
  const stabilityRows = Array.from({ length: 90 }, (_value, index) => {
    if (index < 30) {
      return stabilityRow(index, {
        preCurrentLeadAgeSeconds: 90,
        preFlipCount: 0,
        preNearLineSeconds: 10,
      });
    }

    if (index < 60) {
      return stabilityRow(index, {
        preCurrentLeadAgeSeconds: 90,
        preFlipCount: 0,
        preNearLineSeconds: 160,
      });
    }

    return stabilityRow(index, {
      preCurrentLeadAgeSeconds: 20,
      preFlipCount: 4,
      preNearLineSeconds: 160,
    });
  });
  const analyticsRows = stabilityRows.map((_row, index) => analyticsRow(index));
  const dashboard = buildAnalyticsDashboard({ analyticsRows, stabilityRows });
  const shapeCount = (shape) =>
    dashboard.stability.prePathShapes.cells.find(
      (cell) =>
        cell.checkpointSecond === 180 &&
        cell.prePathShape === shape,
    )?.N ?? 0;

  assert.equal(shapeCount("clean-lock"), 30);
  assert.equal(shapeCount("near-line-heavy"), 30);
  assert.equal(shapeCount("multi-flip-chop"), 30);
});

test("buildAnalyticsDashboard caps reference values for Convex rollup storage", () => {
  const stabilityRows = Array.from(
    { length: MAX_REFERENCE_VALUES + 500 },
    (_value, index) =>
      stabilityRow(index, {
        preCurrentLeadAgeSeconds: 90,
        preFlipCount: index % 12,
        preNearLineSeconds: index % 180,
      }),
  );
  const analyticsRows = stabilityRows.map((_row, index) => analyticsRow(index));
  const dashboard = buildAnalyticsDashboard({ analyticsRows, stabilityRows });
  const { referenceValues } =
    dashboard.stability.preChopBucketDefinitions;

  assert.equal(referenceValues.nearLinePct.length, MAX_REFERENCE_VALUES);
  assert.equal(
    referenceValues.preFlipRatePerMinute.length,
    MAX_REFERENCE_VALUES,
  );
  assert.equal(
    referenceValues.nearLinePct[0] <= referenceValues.nearLinePct.at(-1),
    true,
  );
  assert.equal(
    referenceValues.preFlipRatePerMinute[0] <=
      referenceValues.preFlipRatePerMinute.at(-1),
    true,
  );
});

test("buildAnalyticsDashboard excludes stability rows outside the clean analytics cohort", () => {
  const analyticsRows = [
    analyticsRow(0),
    analyticsRow(1, {
      completeFreshCheckpoints: false,
      outcomeSource: "derived",
    }),
  ];
  const stabilityRows = [
    stabilityRow(0, {
      preCurrentLeadAgeSeconds: 90,
      preFlipCount: 0,
      preNearLineSeconds: 10,
    }),
    stabilityRow(1, {
      preCurrentLeadAgeSeconds: 90,
      preFlipCount: 0,
      preNearLineSeconds: 10,
    }),
  ];
  const dashboard = buildAnalyticsDashboard({ analyticsRows, stabilityRows });
  const totalRowsAtTargetDistance = dashboard.stability.pathRiskByChop
    .filter(
      (cell) =>
        cell.checkpointSecond === 180 &&
        cell.distanceBucket === "3_4",
    )
    .reduce((sum, cell) => sum + cell.N, 0);

  assert.equal(totalRowsAtTargetDistance, 1);
  assert.equal(dashboard.health.cohortFunnel.cleanAnalyticsCount, 1);
  assert.equal(dashboard.health.cohortFunnel.cleanStabilityCount, 1);
  assert.equal(dashboard.health.cohortFunnel.cleanStabilityDelta, 0);
});
