import test from "node:test";
import assert from "node:assert/strict";

import { MARKET_OUTCOMES } from "./market.js";
import { ANALYTICS_VERSION, CHECKPOINT_SECONDS } from "./marketAnalytics.js";
import {
  PATH_TYPES,
  STABILITY_ANALYTICS_VERSION,
  STABILITY_DEADBAND_BPS,
  STABILITY_EXCLUDED_REASONS,
  buildMarketStabilityAnalytics,
} from "./marketStabilityAnalytics.js";

const WINDOW_START_TS = 1_000_000;
const WINDOW_END_TS = WINDOW_START_TS + 300_000;

function priceForBps(bps) {
  return 100 * (1 + bps / 10000);
}

function snapshot(second, marginBps) {
  return {
    btcChainlink: priceForBps(marginBps),
    marketSlug: "btc-updown-5m-test",
    secondBucket: WINDOW_START_TS + second * 1000,
    secondsFromWindowStart: second,
  };
}

function snapshotsFromSegments(segments, step = 5) {
  const rows = [];

  for (const [start, end, marginBps] of segments) {
    for (let second = start; second <= end; second += step) {
      rows.push(snapshot(second, marginBps));
    }
  }

  return rows.filter(
    (row, index, all) =>
      all.findIndex((candidate) => candidate.secondBucket === row.secondBucket) ===
      index,
  );
}

function checkpoint(second, distanceBps, outcome = MARKET_OUTCOMES.UP) {
  const currentLeader =
    distanceBps > 0
      ? MARKET_OUTCOMES.UP
      : distanceBps < 0
        ? MARKET_OUTCOMES.DOWN
        : null;

  return {
    checkpointSecond: second,
    checkpointTs: WINDOW_START_TS + second * 1000,
    currentLeader,
    didCurrentLeaderWin:
      currentLeader === null ? null : currentLeader === outcome,
    distanceToBeatBps: distanceBps,
  };
}

function analytics({
  checkpoints = [checkpoint(270, 10)],
  outcome = MARKET_OUTCOMES.UP,
} = {}) {
  const checkpointMap = new Map(
    checkpoints.map((row) => [row.checkpointSecond, row]),
  );

  return {
    analyticsVersion: ANALYTICS_VERSION,
    checkpoints: CHECKPOINT_SECONDS.map((second) =>
      checkpointMap.get(second) ?? checkpoint(second, 10, outcome),
    ),
    marketId: "test-market-id",
    marketSlug: "btc-updown-5m-test",
    priceToBeat: 100,
    resolvedOutcome: outcome,
    windowEndTs: WINDOW_END_TS,
    windowStartTs: WINDOW_START_TS,
  };
}

function checkpointStability(doc, second) {
  return doc.checkpoints.find((row) => row.checkpointSecond === second);
}

function removeSnapshotSeconds(rows, seconds) {
  const blocked = new Set(seconds);

  return rows.filter((row) => !blocked.has(row.secondsFromWindowStart));
}

test("buildMarketStabilityAnalytics classifies stable leader wins", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, 10]]),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(doc.stabilityAnalyticsVersion, STABILITY_ANALYTICS_VERSION);
  assert.equal(doc.pathSummary.snapshotCadenceMs, 5000);
  assert.equal(doc.pathSummary.pathGood, true);
  assert.equal(t270.stableLeaderWin, true);
  assert.equal(t270.postPathGood, true);
  assert.equal(t270.postLastSnapshotAgeMsAtClose, 0);
  assert.equal(t270.noisyLeaderWin, false);
  assert.equal(t270.recoveredLeaderWin, false);
  assert.equal(t270.flipLoss, false);
  assert.equal(t270.postAnyHardFlip, false);
  assert.equal(doc.pathSummary.winnerLockSecond, 0);
  assert.equal(doc.pathSummary.pathType, PATH_TYPES.EARLY_LOCK);
});

test("buildMarketStabilityAnalytics separates noisy wins from stable wins", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([
      [0, 265, 10],
      [270, 280, 0.25],
      [285, 300, 10],
    ]),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.stableLeaderWin, false);
  assert.equal(t270.noisyLeaderWin, true);
  assert.equal(t270.recoveredLeaderWin, false);
  assert.equal(t270.postTouchedNoise, true);
  assert.equal(t270.postAnyHardFlip, false);
});

test("buildMarketStabilityAnalytics classifies recovered wins after hard flips", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([
      [0, 265, 10],
      [270, 280, -2],
      [285, 300, 10],
    ]),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.recoveredLeaderWin, true);
  assert.equal(t270.postAnyHardFlip, true);
  assert.equal(t270.postHardFlipCount, 2);
  assert.ok(Math.abs(t270.postMaxAdverseBps - 2) < 1e-6);
});

test("buildMarketStabilityAnalytics marks flip loss even when post path is sparse", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(270, 10, MARKET_OUTCOMES.DOWN)],
      outcome: MARKET_OUTCOMES.DOWN,
    }),
    nowTs: WINDOW_END_TS,
    snapshots: [snapshot(270, 10)],
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.postPathGood, false);
  assert.equal(t270.flipLoss, true);
  assert.equal(t270.unknownPath, false);
  assert.ok(
    doc.excludedReasons.includes(
      STABILITY_EXCLUDED_REASONS.SPARSE_POST_CHECKPOINT_SNAPSHOTS,
    ),
  );
});

test("buildMarketStabilityAnalytics tags checkpoint noise separately", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(270, 0.25)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, 0.25]]),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.checkpointInNoise, true);
  assert.equal(t270.stableLeaderWin, false);
  assert.equal(t270.unknownPath, false);
});

test("buildMarketStabilityAnalytics uses inclusive deadband boundaries", () => {
  const up = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(270, STABILITY_DEADBAND_BPS)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, STABILITY_DEADBAND_BPS]]),
  });
  const down = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(270, -STABILITY_DEADBAND_BPS, MARKET_OUTCOMES.DOWN)],
      outcome: MARKET_OUTCOMES.DOWN,
    }),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, -STABILITY_DEADBAND_BPS]]),
  });

  assert.equal(checkpointStability(up, 270).checkpointInNoise, false);
  assert.equal(checkpointStability(up, 270).stableLeaderWin, false);
  assert.equal(checkpointStability(up, 270).noisyLeaderWin, true);
  assert.equal(checkpointStability(down, 270).checkpointInNoise, false);
  assert.equal(down.pathSummary.pathType, PATH_TYPES.EARLY_LOCK);
});

test("buildMarketStabilityAnalytics classifies noise-only paths as near-line unresolved", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(270, 0)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, 0]]),
  });

  assert.equal(doc.pathSummary.hardFlipCount, 0);
  assert.equal(doc.pathSummary.winnerLockSecond, null);
  assert.equal(doc.pathSummary.pathType, PATH_TYPES.NEAR_LINE_UNRESOLVED);
});

test("buildMarketStabilityAnalytics locks winner after initial noise", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([
      [0, 20, 0],
      [25, 300, 10],
    ]),
  });

  assert.equal(doc.pathSummary.winnerLockSecond, 25);
  assert.equal(doc.pathSummary.pathType, PATH_TYPES.EARLY_LOCK);
});

test("buildMarketStabilityAnalytics marks leader win unknown when post path is sparse", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: [snapshot(270, 10)],
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.leaderWonAtClose, true);
  assert.equal(t270.postPathGood, false);
  assert.equal(t270.stableLeaderWin, false);
  assert.equal(t270.noisyLeaderWin, false);
  assert.equal(t270.recoveredLeaderWin, false);
  assert.equal(t270.flipLoss, false);
  assert.equal(t270.unknownPath, true);
});

test("buildMarketStabilityAnalytics accepts five-second cadence with full coverage", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, 10]], 5),
  });
  const t285 = checkpointStability(doc, 285);

  assert.equal(doc.pathSummary.snapshotCadenceMs, 5000);
  assert.equal(doc.pathSummary.pathGood, true);
  assert.equal(t285.postPathGood, true);
  assert.equal(t285.stableLeaderWin, true);
});

test("buildMarketStabilityAnalytics accepts short one-second gaps under spec threshold", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: removeSnapshotSeconds(
      snapshotsFromSegments([[0, 300, 10]], 1),
      [272, 273],
    ),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(doc.pathSummary.snapshotCadenceMs, 1000);
  assert.equal(t270.postPathGood, true);
  assert.equal(t270.postMaxSnapshotGapMs, 3000);
  assert.equal(t270.stableLeaderWin, true);
});

test("buildMarketStabilityAnalytics rejects stale close tail even with high coverage", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: [
      ...snapshotsFromSegments([[0, 285, 10]], 5),
      snapshot(289, 10),
      snapshot(290, 10),
    ],
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.postSnapshotCoveragePct, 1);
  assert.equal(t270.postLastSnapshotAgeMsAtClose, 10_000);
  assert.equal(t270.postPathGood, false);
  assert.equal(t270.unknownPath, true);
});

test("buildMarketStabilityAnalytics rejects out-of-range inferred cadence", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([[0, 300, 10]], 30),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(doc.pathSummary.snapshotCadenceMs, null);
  assert.equal(doc.pathSummary.pathGood, false);
  assert.equal(t270.postPathGood, false);
  assert.equal(t270.unknownPath, true);
});

test("buildMarketStabilityAnalytics pauses lead age during noise", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics(),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([
      [0, 95, 10],
      [100, 145, 0],
      [150, 300, 10],
    ]),
  });
  const t270 = checkpointStability(doc, 270);

  assert.equal(t270.preCurrentLeadAgeSeconds, 220);
  assert.equal(t270.preFlipCount, 0);
});

test("buildMarketStabilityAnalytics materializes pre-checkpoint path risk features", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 3)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: snapshotsFromSegments([
      [0, 50, 1],
      [55, 90, -1],
      [95, 130, 1.5],
      [135, 170, -1.25],
      [175, 200, 2.5],
      [205, 220, 3.25],
      [225, 300, 4],
    ]),
  });
  const t220 = checkpointStability(doc, 220);

  assert.equal(t220.prePathGood, true);
  assert.ok(t220.preNearLineSeconds > 100);
  assert.equal(t220.preFlipCount, 4);
  assert.ok(t220.preDirectionChangeCount >= 3);
  assert.equal(t220.preCrossCountLast60s, 1);
  assert.ok(t220.preRange60sBps >= 1.5);
  assert.equal(t220.momentum30sSide, MARKET_OUTCOMES.UP);
  assert.equal(t220.momentum30sAgreesWithLeader, true);
  assert.ok(t220.leaderAlignedMomentum30sBps > 0);
});

test("buildMarketStabilityAnalytics keeps pre features unchanged after post-T mutation", () => {
  const baseSnapshots = snapshotsFromSegments([
    [0, 180, 4],
    [185, 220, 5],
    [225, 300, 6],
  ]);
  const mutatedSnapshots = [
    ...baseSnapshots.filter((row) => row.secondsFromWindowStart <= 220),
    snapshot(221, -20),
    ...baseSnapshots.filter((row) => row.secondsFromWindowStart > 225),
  ];
  const base = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: baseSnapshots,
  });
  const mutated = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: mutatedSnapshots,
  });
  const baseT220 = checkpointStability(base, 220);
  const mutatedT220 = checkpointStability(mutated, 220);
  const fields = [
    "momentum30sBps",
    "momentum30sSide",
    "preDirectionChangeCount",
    "preFlipCount",
    "preNearLineSeconds",
    "preRange60sBps",
  ];

  for (const field of fields) {
    assert.equal(mutatedT220[field], baseT220[field], field);
  }
});

test("buildMarketStabilityAnalytics keeps pre features unchanged after post-T cadence changes", () => {
  const baseSnapshots = snapshotsFromSegments([
    [0, 100, 4],
    [115, 220, 5],
    [225, 300, 6],
  ]);
  const mutatedSnapshots = [
    ...baseSnapshots.filter((row) => row.secondsFromWindowStart <= 220),
    ...snapshotsFromSegments([[230, 300, 6]], 10),
  ];
  const base = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: baseSnapshots,
  });
  const mutated = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: mutatedSnapshots,
  });
  const baseT220 = checkpointStability(base, 220);
  const mutatedT220 = checkpointStability(mutated, 220);
  const fields = [
    "leaderAlignedMomentum30sBps",
    "momentum30sBps",
    "momentum30sSide",
    "preFlipCount",
    "preMaxSnapshotGapMs",
    "preNearLineSeconds",
    "prePathGood",
    "preSnapshotCoveragePct",
  ];

  assert.equal(base.pathSummary.snapshotCadenceMs, 5000);
  assert.equal(mutated.pathSummary.snapshotCadenceMs, 10000);

  for (const field of fields) {
    assert.equal(mutatedT220[field], baseT220[field], field);
  }
});

test("buildMarketStabilityAnalytics ignores pre-T rows outside momentum lookback", () => {
  const baseSnapshots = snapshotsFromSegments([
    [0, 150, 1],
    [155, 170, 3],
    [175, 200, 5],
    [205, 300, 7],
  ]);
  const mutatedSnapshots = baseSnapshots.map((row) =>
    row.secondsFromWindowStart === 10 ? snapshot(10, -50) : row,
  );
  const base = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(200, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: baseSnapshots,
  });
  const mutated = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(200, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: mutatedSnapshots,
  });

  assert.equal(
    checkpointStability(mutated, 200).momentum30sBps,
    checkpointStability(base, 200).momentum30sBps,
  );
});

test("buildMarketStabilityAnalytics nulls pre features when pre path is sparse", () => {
  const doc = buildMarketStabilityAnalytics({
    marketAnalytics: analytics({
      checkpoints: [checkpoint(220, 5)],
    }),
    nowTs: WINDOW_END_TS,
    snapshots: [snapshot(220, 5), snapshot(300, 5)],
  });
  const t220 = checkpointStability(doc, 220);

  assert.equal(t220.prePathGood, false);
  assert.equal(t220.preNearLineSeconds, null);
  assert.equal(t220.momentum30sBps, null);
});
