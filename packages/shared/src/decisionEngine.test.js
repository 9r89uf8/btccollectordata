import test from "node:test";
import assert from "node:assert/strict";

import { decide } from "./decisionEngine.js";
import { isRegisteredReasonCode } from "./decisionConfig.js";

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
    rows.push({
      btcChainlink: btcFromMargin(marginForSecond(second)),
      secondBucket: WINDOW_START + second * 1000,
      secondsFromWindowStart: second,
    });
  }

  return rows;
}

function priors(overrides = {}) {
  const distanceBucket = overrides.distanceBucket ?? "5_7_5";
  const checkpointSecond = overrides.checkpointSecond ?? 180;
  const baseP = overrides.baseP ?? 0.88;
  const baseN = overrides.baseN ?? 200;

  return {
    rankThresholds: overrides.rankThresholds ?? RANK_THRESHOLDS,
    baseByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        n: baseN,
        p: baseP,
      },
    ],
    chopByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        n: 200,
        p: 0.88,
        preChopBucket: "low",
      },
    ],
    leaderAgeByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        leadAgeBucket: "gte_120",
        n: 200,
        p: 0.87,
      },
    ],
    momentumByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        momentumAgreementBucket: "flat",
        n: 200,
        p: 0.88,
      },
      {
        checkpointSecond,
        distanceBucket,
        momentumAgreementBucket: "disagrees",
        n: 200,
        p: 0.82,
      },
    ],
    prePathShapeByCheckpoint: [
      {
        checkpointSecond,
        n: 200,
        p: 0.89,
        prePathShape: "clean-lock",
      },
    ],
  };
}

function context(overrides = {}) {
  const secondsFromWindowStart = overrides.secondsFromWindowStart ?? 180;
  const nowMs = WINDOW_START + secondsFromWindowStart * 1000;
  const marginBps = overrides.marginBps ?? 6;
  const sourceQuality = overrides.sourceQuality ?? "good";
  const leaderUp = marginBps > 0;
  const hasOverride = (key) =>
    Object.prototype.hasOwnProperty.call(overrides, key);
  const leaderAsk = hasOverride("leaderAsk") ? overrides.leaderAsk : 0.78;
  const leaderSpread = hasOverride("leaderSpread")
    ? overrides.leaderSpread
    : 0.02;
  const leaderTopAskDepth = hasOverride("leaderTopAskDepth")
    ? overrides.leaderTopAskDepth
    : 5;
  const latestChainlinkTick =
    hasOverride("latestChainlinkTick")
      ? overrides.latestChainlinkTick
      : {
          price: btcFromMargin(marginBps),
          receivedAt: nowMs - (overrides.btcAgeMs ?? 1000),
          ts: nowMs - (overrides.btcAgeMs ?? 1000),
        };
  const latestSnapshot =
    hasOverride("latestSnapshot")
      ? overrides.latestSnapshot
      : {
          downAsk: leaderUp ? 0.88 : leaderAsk,
          downBid: 0.72,
          downDepthAskTop: leaderTopAskDepth,
          downSpread: leaderUp ? 0.02 : leaderSpread,
          secondBucket: WINDOW_START + secondsFromWindowStart * 1000,
          secondsFromWindowStart,
          sourceQuality,
          upAsk: leaderUp ? leaderAsk : 0.88,
          upBid: 0.72,
          upDepthAskTop: leaderTopAskDepth,
          upSpread: leaderUp ? leaderSpread : 0.02,
          writtenAt: nowMs - (overrides.snapshotAgeMs ?? 500),
          ...(overrides.snapshot ?? {}),
        };

  return {
    collectorHealth: hasOverride("collectorHealth")
      ? overrides.collectorHealth
      : { status: "ok" },
    intendedSize: overrides.intendedSize ?? 1,
    latestChainlinkTick,
    latestSnapshot,
    market: overrides.market ?? {
      priceToBeatOfficial: PRICE_TO_BEAT,
      windowStartTs: WINDOW_START,
    },
    nowMs,
    recentPath: overrides.recentPath ?? pathFromMargins(() => marginBps),
    runtimeControls: overrides.runtimeControls,
  };
}

function assertReasonCodesRegistered(result) {
  for (const code of result.reasonCodes) {
    assert.equal(isRegisteredReasonCode(code), true, `${code} is registered`);
  }
}

test("decide emits deterministic ENTER_UP and does not call Date.now", () => {
  const originalNow = Date.now;
  Date.now = () => {
    throw new Error("decide must use ctx.nowMs");
  };

  try {
    const input = context();
    const result = decide(input, priors());
    const repeat = decide(input, priors());

    assert.deepEqual(repeat, result);
    assert.equal(result.action, "ENTER_UP");
    assert.equal(result.leader, "up");
    assert.equal(result.decisionVersion, "decision-v0.1");
    assert.equal(result.reasonCodes.includes("enter_up_signal"), true);
    assert.equal(result.distanceBucket, "5_7_5");
    assert.ok(result.pEst >= 0.80);
    assertReasonCodesRegistered(result);
  } finally {
    Date.now = originalNow;
  }
});

test("decide is deterministic across representative gate outcomes", () => {
  const cases = [
    [context(), priors()],
    [context({ marginBps: 0.5 }), priors()],
    [context({ recentPath: [] }), priors()],
    [context({ leaderAsk: 0.84 }), priors()],
    [
      context({ runtimeControls: { decision_emit_actions: "wait_only" } }),
      priors(),
    ],
  ];

  for (const [input, priorSet] of cases) {
    assert.deepEqual(decide(input, priorSet), decide(input, priorSet));
  }
});

test("decide emits ENTER_DOWN symmetrically", () => {
  const result = decide(
    context({
      marginBps: -6,
      recentPath: pathFromMargins(() => -6),
    }),
    priors(),
  );

  assert.equal(result.action, "ENTER_DOWN");
  assert.equal(result.leader, "down");
  assertReasonCodesRegistered(result);
});

test("decide supports wait-only runtime muting without losing pre-mute action", () => {
  const result = decide(
    context({
      runtimeControls: { decision_emit_actions: "wait_only" },
    }),
    priors(),
  );

  assert.equal(result.action, "WAIT");
  assert.equal(result.actionPreMute, "ENTER_UP");
  assert.deepEqual(result.reasonCodes, [
    "enter_up_signal",
    "runtime_actions_muted",
  ]);
  assertReasonCodesRegistered(result);
});

test("decide rejects data-quality failures before strategy gates", () => {
  const invalidContext = decide({}, priors());
  const collectorUnhealthy = decide(
    context({ collectorHealth: { status: "down" } }),
    priors(),
  );
  const missingCollectorHealth = decide(
    context({ collectorHealth: null }),
    priors(),
  );
  const missingTiming = decide(
    context({
      market: { priceToBeatOfficial: PRICE_TO_BEAT },
    }),
    priors(),
  );
  const missingPriceToBeat = decide(
    context({
      market: { windowStartTs: WINDOW_START },
    }),
    priors(),
  );
  const missingBtcTick = decide(
    context({ latestChainlinkTick: null }),
    priors(),
  );
  const staleBtc = decide(context({ btcAgeMs: 5000 }), priors());
  const missingSnapshot = decide(context({ latestSnapshot: null }), priors());
  const staleSnapshot = decide(context({ snapshotAgeMs: 8000 }), priors());
  const derivedOnly = decide(
    context({
      market: {
        priceToBeatDerived: PRICE_TO_BEAT,
        windowStartTs: WINDOW_START,
      },
    }),
    priors(),
  );
  const gapSnapshot = decide(context({ sourceQuality: "gap" }), priors());
  const staleBookSnapshot = decide(
    context({ sourceQuality: "stale_book" }),
    priors(),
  );
  const staleBtcSnapshot = decide(
    context({ sourceQuality: "stale_btc" }),
    priors(),
  );
  const unknownSnapshot = decide(
    context({ sourceQuality: "partial" }),
    priors(),
  );

  assert.deepEqual(invalidContext.reasonCodes, ["invalid_context"]);
  assert.deepEqual(collectorUnhealthy.reasonCodes, ["collector_unhealthy"]);
  assert.deepEqual(missingCollectorHealth.reasonCodes, [
    "data_quality_unavailable",
  ]);
  assert.deepEqual(missingTiming.reasonCodes, ["missing_window_timing"]);
  assert.deepEqual(missingPriceToBeat.reasonCodes, ["missing_price_to_beat"]);
  assert.deepEqual(missingBtcTick.reasonCodes, ["missing_btc_tick"]);
  assert.deepEqual(staleBtc.reasonCodes, ["btc_too_old"]);
  assert.deepEqual(missingSnapshot.reasonCodes, ["missing_market_snapshot"]);
  assert.deepEqual(staleSnapshot.reasonCodes, ["snapshot_too_old"]);
  assert.deepEqual(derivedOnly.reasonCodes, ["no_official_price_to_beat"]);
  assert.deepEqual(gapSnapshot.reasonCodes, ["bad_snapshot_quality_gap"]);
  assert.deepEqual(staleBookSnapshot.reasonCodes, [
    "bad_snapshot_quality_stale_book",
  ]);
  assert.deepEqual(staleBtcSnapshot.reasonCodes, [
    "bad_snapshot_quality_stale_btc",
  ]);
  assert.deepEqual(unknownSnapshot.reasonCodes, [
    "bad_snapshot_quality_unknown",
  ]);

  for (const result of [
    invalidContext,
    collectorUnhealthy,
    missingCollectorHealth,
    missingTiming,
    missingPriceToBeat,
    missingBtcTick,
    staleBtc,
    missingSnapshot,
    staleSnapshot,
    derivedOnly,
    gapSnapshot,
    staleBookSnapshot,
    staleBtcSnapshot,
    unknownSnapshot,
  ]) {
    assertReasonCodesRegistered(result);
  }
});

test("decide rejects off-checkpoint and in-noise contexts", () => {
  const offCheckpoint = decide(
    context({ secondsFromWindowStart: 170 }),
    priors(),
  );
  const inNoise = decide(context({ marginBps: 0.5 }), priors());

  assert.deepEqual(offCheckpoint.reasonCodes, ["outside_decision_checkpoint"]);
  assert.deepEqual(inNoise.reasonCodes, ["inside_noise_band"]);
  assertReasonCodesRegistered(offCheckpoint);
  assertReasonCodesRegistered(inNoise);
});

test("decide enforces recent-lock, weak-coverage, and unknown-path hard vetoes", () => {
  const recentLock = decide(
    context({
      recentPath: pathFromMargins((second) => (second < 165 ? -6 : 6)),
    }),
    priors(),
  );
  const weakCoverage = decide(context({ recentPath: [] }), priors());
  const unknownPath = decide(
    context(),
    priors({
      rankThresholds: {
        highThreshold: 0.613,
        lowThreshold: 0.386,
        nearLineHighThreshold: 0.667,
        oscillationHighThreshold: 0.667,
      },
    }),
  );

  assert.deepEqual(recentLock.reasonCodes, ["recent_lock"]);
  assert.deepEqual(weakCoverage.reasonCodes, ["weak_coverage"]);
  assert.deepEqual(unknownPath.reasonCodes, ["unknown_path"]);
  assertReasonCodesRegistered(recentLock);
  assertReasonCodesRegistered(weakCoverage);
  assertReasonCodesRegistered(unknownPath);
});

test("decide keeps features, flags, and p_est independent of post-checkpoint path rows", () => {
  const cleanPath = pathFromMargins(() => 6);
  const withMutatedPostRows = cleanPath.map((row) =>
    row.secondsFromWindowStart > 180
      ? { ...row, btcChainlink: btcFromMargin(-30) }
      : row,
  );
  const base = decide(context({ recentPath: cleanPath }), priors());
  const mutated = decide(
    context({ recentPath: withMutatedPostRows }),
    priors(),
  );

  assert.deepEqual(mutated.features, base.features);
  assert.deepEqual(mutated.flags, base.flags);
  assert.equal(mutated.pEst, base.pEst);
  assert.deepEqual(mutated.reasonCodes, base.reasonCodes);
  assertReasonCodesRegistered(mutated);
});

test("decide applies momentum-against as a soft risk distance threshold", () => {
  const result = decide(
    context({
      recentPath: pathFromMargins((second) => (second < 155 ? 10 : 6)),
    }),
    priors(),
  );

  assert.equal(result.flags.momentumAgainstLeader, true);
  assert.equal(result.flags.softRiskCount, 1);
  assert.equal(result.requiredDistanceBps, 7.5);
  assert.deepEqual(result.reasonCodes, ["distance_too_small"]);
  assertReasonCodesRegistered(result);
});

test("decide applies soft-risk penalty through distance and edge gates, not p_est subtraction", () => {
  const result = decide(
    context({
      marginBps: 8,
      recentPath: pathFromMargins((second) => (second < 155 ? 10 : 8)),
    }),
    priors({ baseP: 0.90, distanceBucket: "7_5_10" }),
  );

  assert.equal(result.action, "ENTER_UP");
  assert.equal(result.flags.momentumAgainstLeader, true);
  assert.equal(result.flags.softRiskCount, 1);
  assert.equal(result.requiredDistanceBps, 7.5);
  assert.ok(Math.abs(result.requiredEdge - 0.07) < 1e-12);
  assert.ok(Math.abs(result.pEst - 0.86) < 1e-12);
  assertReasonCodesRegistered(result);
});

test("decide rejects more than the configured max soft risks", () => {
  const riskyRankThresholds = {
    highThreshold: 0.4,
    lowThreshold: 0.2,
    nearLineHighThreshold: 0.5,
    oscillationHighThreshold: 0.8,
    referenceValues: {
      nearLinePct: [0, 0.2, 0.4, 0.6, 0.8],
      preFlipRatePerMinute: [0, 0.4, 0.8, 1.2, 1.6],
    },
  };
  const result = decide(
    context({
      recentPath: pathFromMargins((second) => {
        if (second < 145) {
          return 1;
        }

        if (second < 180) {
          return 10;
        }

        return 6;
      }),
    }),
    priors({ rankThresholds: riskyRankThresholds }),
  );

  assert.equal(result.flags.softRiskCount, 3);
  assert.deepEqual(result.reasonCodes, ["too_many_soft_risks"]);
  assertReasonCodesRegistered(result);
});

test("decide rejects sparse base priors and probabilities below floor", () => {
  const sparse = decide(context(), priors({ baseN: 99 }));
  const missing = decide(context(), { rankThresholds: RANK_THRESHOLDS });
  const belowFloor = decide(context(), priors({ baseP: 0.79 }));

  assert.deepEqual(sparse.reasonCodes, ["base_prior_sparse"]);
  assert.deepEqual(missing.reasonCodes, ["base_prior_missing"]);
  assert.deepEqual(belowFloor.reasonCodes, ["p_est_below_minimum"]);
  assertReasonCodesRegistered(sparse);
  assertReasonCodesRegistered(missing);
  assertReasonCodesRegistered(belowFloor);
});

test("decide uses top ask EV, spread, and top ask depth execution gates", () => {
  const missingAsk = decide(context({ leaderAsk: null }), priors());
  const missingSpread = decide(context({ leaderSpread: null }), priors());
  const noEv = decide(context({ leaderAsk: 0.84 }), priors());
  const wideSpread = decide(context({ leaderSpread: 0.04 }), priors());
  const thinDepth = decide(context({ leaderTopAskDepth: 0.5 }), priors());

  assert.deepEqual(missingAsk.reasonCodes, ["leader_ask_missing"]);
  assert.deepEqual(missingSpread.reasonCodes, ["leader_spread_missing"]);
  assert.deepEqual(noEv.reasonCodes, ["no_ev_against_top_ask"]);
  assert.deepEqual(wideSpread.reasonCodes, ["wide_spread"]);
  assert.deepEqual(thinDepth.reasonCodes, ["insufficient_top_ask_depth"]);
  assertReasonCodesRegistered(missingAsk);
  assertReasonCodesRegistered(missingSpread);
  assertReasonCodesRegistered(noEv);
  assertReasonCodesRegistered(wideSpread);
  assertReasonCodesRegistered(thinDepth);
});
