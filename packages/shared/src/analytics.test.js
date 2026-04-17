import test from "node:test";
import assert from "node:assert/strict";

import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";
import { buildAnalyticsReport } from "./analytics.js";

function buildMarket({ quality = DATA_QUALITY.GOOD, slug }) {
  return {
    dataQuality: quality,
    slug,
  };
}

function buildSummary({
  btcChainlinkAtEnd = null,
  btcChainlinkAtStart = null,
  closeReferencePriceDerived = null,
  closeReferencePriceOfficial = null,
  firstBtcWinningSideSecond = null,
  d15 = null,
  d30 = null,
  d60 = null,
  d120 = null,
  d240 = null,
  d295 = null,
  firstTimeAbove60 = null,
  firstTimeAbove70 = null,
  firstTimeAbove80 = null,
  priceToBeatDerived = null,
  priceToBeatOfficial = null,
  qualityFlags = ["sample_cadence_ms:1000"],
  resolvedOutcome,
  slug,
  t15 = null,
  t30 = null,
  t60 = null,
  t120 = null,
  t240 = null,
  t295 = null,
  windowStartTs,
}) {
  return {
    btcChainlinkAtEnd,
    btcChainlinkAtStart,
    closeReferencePriceDerived,
    closeReferencePriceOfficial,
    dataQuality: null,
    downDisplayedAtT0: null,
    downDisplayedAtT15: d15,
    downDisplayedAtT30: d30,
    downDisplayedAtT60: d60,
    downDisplayedAtT120: d120,
    downDisplayedAtT240: d240,
    downDisplayedAtT295: d295,
    finalizedAt: windowStartTs + 301_000,
    firstBtcWinningSideSecond,
    firstTimeAbove60,
    firstTimeAbove70,
    firstTimeAbove80,
    marketId: `${slug}-id`,
    marketSlug: slug,
    priceToBeatDerived,
    priceToBeatOfficial,
    qualityFlags,
    resolvedOutcome,
    upDisplayedAtT0: null,
    upDisplayedAtT15: t15,
    upDisplayedAtT30: t30,
    upDisplayedAtT60: t60,
    upDisplayedAtT120: t120,
    upDisplayedAtT240: t240,
    upDisplayedAtT295: t295,
    upMax: null,
    upMaxDrawdown: null,
    upMin: null,
    upRange: null,
    upStdDev: null,
    windowEndTs: windowStartTs + 300_000,
    windowStartTs,
  };
}

test("buildAnalyticsReport filters by quality and date range and computes threshold rows", () => {
  const nowTs = 10 * 24 * 60 * 60 * 1000;
  const markets = [
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m1" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m2" }),
    buildMarket({ quality: DATA_QUALITY.GAP, slug: "m3" }),
  ];
  const summaries = [
    buildSummary({
      d15: 0.31,
      d30: 0.33,
      d60: 0.35,
      d120: 0.41,
      firstTimeAbove60: 20,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m1",
      t15: 0.72,
      t30: 0.7,
      t60: 0.68,
      t120: 0.6,
      windowStartTs: nowTs - 2 * 60 * 60 * 1000,
    }),
    buildSummary({
      d15: 0.74,
      d30: 0.72,
      d60: 0.69,
      d120: 0.6,
      firstTimeAbove60: null,
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m2",
      t15: 0.28,
      t30: 0.3,
      t60: 0.34,
      t120: 0.4,
      windowStartTs: nowTs - 3 * 60 * 60 * 1000,
    }),
    buildSummary({
      firstTimeAbove60: 10,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m3",
      t15: 0.9,
      t30: 0.88,
      t60: 0.86,
      t120: 0.84,
      windowStartTs: nowTs - 8 * 24 * 60 * 60 * 1000,
    }),
  ];

  const result = buildAnalyticsReport({
    filters: {
      dateRange: "72h",
      minSampleSize: 1,
      quality: DATA_QUALITY.GOOD,
    },
    markets,
    nowTs,
    summaries,
  });

  assert.equal(result.overview.sampleCount, 2);
  assert.equal(result.overview.goodCount, 2);
  assert.equal(result.overview.gapCount, 0);
  assert.equal(result.overview.upWins, 1);
  assert.equal(result.overview.downWins, 1);

  const upT15At70 = result.thresholdStats.find(
    (row) =>
      row.checkpoint === "t15" &&
      row.side === MARKET_OUTCOMES.UP &&
      row.threshold === 0.7,
  );
  assert.deepEqual(
    {
      sampleCount: upT15At70.sampleCount,
      winCount: upT15At70.winCount,
      winRate: upT15At70.winRate,
    },
    {
      sampleCount: 1,
      winCount: 1,
      winRate: 1,
    },
  );

  const downT15At70 = result.thresholdStats.find(
    (row) =>
      row.checkpoint === "t15" &&
      row.side === MARKET_OUTCOMES.DOWN &&
      row.threshold === 0.7,
  );
  assert.deepEqual(
    {
      sampleCount: downT15At70.sampleCount,
      winCount: downT15At70.winCount,
      winRate: downT15At70.winRate,
    },
    {
      sampleCount: 1,
      winCount: 1,
      winRate: 1,
    },
  );

  assert.deepEqual(result.headlineFinding, {
    averageDisplayed: null,
    checkpoint: "t60",
    checkpointLabel: "T+60",
    sampleCount: 0,
    side: MARKET_OUTCOMES.UP,
    threshold: 0.7,
    winCount: 0,
    winRate: null,
  });
});

test("buildAnalyticsReport computes BTC boundary move thresholds and buckets", () => {
  const nowTs = 2_000_000;
  const markets = [
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m1" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m2" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m3" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m4" }),
  ];
  const summaries = [
    buildSummary({
      closeReferencePriceOfficial: 74_025,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m1",
      windowStartTs: nowTs - 1_000,
    }),
    buildSummary({
      closeReferencePriceOfficial: 73_960,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m2",
      windowStartTs: nowTs - 2_000,
    }),
    buildSummary({
      closeReferencePriceDerived: 74_315,
      priceToBeatDerived: 74_300,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m3",
      windowStartTs: nowTs - 3_000,
    }),
    buildSummary({
      closeReferencePriceOfficial: 74_120,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m4",
      windowStartTs: nowTs - 4_000,
    }),
  ];

  const result = buildAnalyticsReport({
    filters: {
      dateRange: "all",
      minSampleSize: 1,
      quality: "all",
    },
    markets,
    nowTs,
    summaries,
  });

  assert.deepEqual(result.boundaryMoveHeadline, {
    hitCount: 2,
    sampleCount: 3,
    share: 2 / 3,
    thresholdUsd: 20,
  });
  assert.deepEqual(result.boundaryMoveOverview, {
    averageAbsMoveUsd: 80 / 3,
    averageSignedMoveUsd: 0,
    excludedCount: 1,
    maxAbsMoveUsd: 40,
    medianAbsMoveUsd: 25,
    p75AbsMoveUsd: 40,
    p90AbsMoveUsd: 40,
    usableCount: 3,
  });

  const moveAt20 = result.boundaryMoveThresholdStats.find(
    (row) => row.thresholdUsd === 20,
  );
  assert.deepEqual(moveAt20, {
    hitCount: 2,
    sampleCount: 3,
    share: 2 / 3,
    thresholdUsd: 20,
  });

  const moveAt40 = result.boundaryMoveThresholdStats.find(
    (row) => row.thresholdUsd === 40,
  );
  assert.deepEqual(moveAt40, {
    hitCount: 1,
    sampleCount: 3,
    share: 1 / 3,
    thresholdUsd: 40,
  });

  assert.equal(
    result.boundaryMoveBuckets.find((bucket) => bucket.label === "$10-$19.99").count,
    1,
  );
  assert.equal(
    result.boundaryMoveBuckets.find((bucket) => bucket.label === "$20-$29.99").count,
    1,
  );
  assert.equal(
    result.boundaryMoveBuckets.find((bucket) => bucket.label === "$40-$49.99").count,
    1,
  );
});

test("buildAnalyticsReport groups BTC boundary moves by ET hour and session", () => {
  const markets = [
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m1" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m2" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m3" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m4" }),
  ];
  const summaries = [
    buildSummary({
      closeReferencePriceOfficial: 74_030,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m1",
      windowStartTs: Date.UTC(2026, 3, 16, 5, 0, 0),
    }),
    buildSummary({
      closeReferencePriceOfficial: 74_060,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m2",
      windowStartTs: Date.UTC(2026, 3, 16, 5, 5, 0),
    }),
    buildSummary({
      closeReferencePriceOfficial: 74_025,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m3",
      windowStartTs: Date.UTC(2026, 3, 16, 13, 0, 0),
    }),
    buildSummary({
      closeReferencePriceOfficial: 74_090,
      priceToBeatOfficial: 74_000,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m4",
      windowStartTs: Date.UTC(2026, 3, 16, 23, 0, 0),
    }),
  ];

  const result = buildAnalyticsReport({
    filters: {
      dateRange: "all",
      minSampleSize: 1,
      quality: "all",
    },
    markets,
    nowTs: Date.UTC(2026, 3, 17, 0, 0, 0),
    summaries,
  });

  const hourOne = result.boundaryMoveByHour.find((row) => row.hour === 1);
  assert.deepEqual(
    {
      averageAbsMoveUsd: hourOne.averageAbsMoveUsd,
      label: hourOne.label,
      sampleCount: hourOne.sampleCount,
      shareAt20Usd: hourOne.shareAt20Usd,
      shareAt50Usd: hourOne.shareAt50Usd,
    },
    {
      averageAbsMoveUsd: 45,
      label: "1:00 AM",
      sampleCount: 2,
      shareAt20Usd: 1,
      shareAt50Usd: 0.5,
    },
  );

  const overnight = result.boundaryMoveBySession.find(
    (row) => row.id === "overnight",
  );
  assert.deepEqual(
    {
      averageAbsMoveUsd: overnight.averageAbsMoveUsd,
      label: overnight.label,
      rangeLabel: overnight.rangeLabel,
      sampleCount: overnight.sampleCount,
      shareAt20Usd: overnight.shareAt20Usd,
    },
    {
      averageAbsMoveUsd: 45,
      label: "Overnight ET",
      rangeLabel: "12:00 AM-6:00 AM",
      sampleCount: 2,
      shareAt20Usd: 1,
    },
  );

  const morning = result.boundaryMoveBySession.find(
    (row) => row.id === "morning",
  );
  assert.equal(morning.sampleCount, 1);
  assert.equal(morning.medianAbsMoveUsd, 25);

  const evening = result.boundaryMoveBySession.find(
    (row) => row.id === "evening",
  );
  assert.equal(evening.sampleCount, 1);
  assert.equal(evening.maxAbsMoveUsd, 90);
});

test("buildAnalyticsReport summarizes BTC first-winning-side timing and cadence mix", () => {
  const markets = [
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m1" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m2" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m3" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m4" }),
  ];
  const summaries = [
    buildSummary({
      firstBtcWinningSideSecond: 0,
      priceToBeatOfficial: 74_000,
      qualityFlags: ["sample_cadence_ms:1000"],
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m1",
      windowStartTs: 1_000,
    }),
    buildSummary({
      firstBtcWinningSideSecond: 60,
      priceToBeatOfficial: 74_000,
      qualityFlags: ["sample_cadence_ms:5000"],
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m2",
      windowStartTs: 2_000,
    }),
    buildSummary({
      firstBtcWinningSideSecond: null,
      priceToBeatOfficial: 74_000,
      qualityFlags: ["sample_cadence_ms:5000", "btc_path_conflicts_resolved"],
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m3",
      windowStartTs: 3_000,
    }),
    buildSummary({
      firstBtcWinningSideSecond: 240,
      priceToBeatOfficial: 74_000,
      qualityFlags: ["sample_cadence_ms:5000"],
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m4",
      windowStartTs: 4_000,
    }),
  ];

  const result = buildAnalyticsReport({
    filters: {
      dateRange: "all",
      minSampleSize: 1,
      quality: "all",
    },
    markets,
    nowTs: 10_000,
    summaries,
  });

  assert.deepEqual(result.btcWinningSideHeadline, {
    checkpointLabel: "T+120",
    checkpointSecond: 120,
    matchingCount: 2,
    sampleCount: 4,
    share: 0.5,
  });
  assert.deepEqual(result.btcWinningSideOverview, {
    conflictCount: 1,
    matchingCount: 3,
    medianWinningSideSecond: 60,
    missingAnchorCount: 0,
    noBtcDataCount: 0,
    p25WinningSideSecond: 0,
    p75WinningSideSecond: 240,
    sampleCount: 4,
    neverMatchedCount: 1,
  });

  assert.deepEqual(result.btcWinningSideCadenceMix, [
    {
      label: "1s",
      sampleCadenceMs: 1000,
      sampleCount: 1,
      share: 0.25,
    },
    {
      label: "5s",
      sampleCadenceMs: 5000,
      sampleCount: 3,
      share: 0.75,
    },
  ]);

  const by15 = result.btcWinningSideCheckpointStats.find(
    (row) => row.checkpointSecond === 15,
  );
  assert.deepEqual(by15, {
    checkpointLabel: "T+15",
    checkpointSecond: 15,
    matchingCount: 1,
    sampleCount: 4,
    share: 0.25,
  });

  const by240 = result.btcWinningSideCheckpointStats.find(
    (row) => row.checkpointSecond === 240,
  );
  assert.deepEqual(by240, {
    checkpointLabel: "T+240",
    checkpointSecond: 240,
    matchingCount: 3,
    sampleCount: 4,
    share: 0.75,
  });

  assert.deepEqual(result.btcWinningSideOutcomeSplit, [
    {
      matchingCount: 1,
      medianWinningSideSecond: 0,
      p75WinningSideSecond: 0,
      sampleCount: 2,
      share: 0.5,
      side: MARKET_OUTCOMES.UP,
    },
    {
      matchingCount: 2,
      medianWinningSideSecond: 60,
      p75WinningSideSecond: 240,
      sampleCount: 2,
      share: 1,
      side: MARKET_OUTCOMES.DOWN,
    },
  ]);
});

test("buildAnalyticsReport computes calibration rows and crossing distributions", () => {
  const nowTs = 5_000_000;
  const markets = [
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m1" }),
    buildMarket({ quality: DATA_QUALITY.PARTIAL, slug: "m2" }),
    buildMarket({ quality: DATA_QUALITY.GOOD, slug: "m3" }),
  ];
  const summaries = [
    buildSummary({
      d15: 0.39,
      d30: 0.35,
      d60: 0.31,
      d120: 0.28,
      d240: 0.25,
      d295: 0.24,
      firstTimeAbove60: 25,
      firstTimeAbove70: 90,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m1",
      t15: 0.62,
      t30: 0.64,
      t60: 0.66,
      t120: 0.68,
      t240: 0.7,
      t295: 0.71,
      windowStartTs: nowTs - 1_000,
    }),
    buildSummary({
      d15: 0.68,
      d30: 0.7,
      d60: 0.74,
      d120: 0.77,
      d240: 0.8,
      d295: 0.81,
      firstTimeAbove60: null,
      firstTimeAbove70: null,
      resolvedOutcome: MARKET_OUTCOMES.DOWN,
      slug: "m2",
      t15: 0.38,
      t30: 0.36,
      t60: 0.34,
      t120: 0.32,
      windowStartTs: nowTs - 2_000,
    }),
    buildSummary({
      d15: 0.43,
      d30: 0.37,
      d60: 0.29,
      d120: 0.25,
      d240: 0.2,
      d295: 0.19,
      firstTimeAbove60: 40,
      firstTimeAbove70: 130,
      resolvedOutcome: MARKET_OUTCOMES.UP,
      slug: "m3",
      t15: 0.61,
      t30: 0.67,
      t60: 0.72,
      t120: 0.74,
      t240: 0.78,
      t295: 0.79,
      windowStartTs: nowTs - 3_000,
    }),
  ];

  const result = buildAnalyticsReport({
    filters: {
      dateRange: "all",
      minSampleSize: 2,
      quality: "all",
    },
    markets,
    nowTs,
    summaries,
  });

  const calibrationRow = result.calibrationRows.find(
    (row) =>
      row.checkpoint === "t15" &&
      row.side === MARKET_OUTCOMES.UP &&
      row.bucketLabel === "60-70%",
  );
  assert.deepEqual(
    {
      averageDisplayed: calibrationRow.averageDisplayed,
      sampleCount: calibrationRow.sampleCount,
      winRate: calibrationRow.winRate,
    },
    {
      averageDisplayed: 0.615,
      sampleCount: 2,
      winRate: 1,
    },
  );

  const crossing60 = result.crossingDistributions.find(
    (row) => row.threshold === 0.6,
  );
  assert.equal(crossing60.sampleCount, 3);
  assert.equal(
    crossing60.buckets.find((bucket) => bucket.label === "T+0-29s").count,
    1,
  );
  assert.equal(
    crossing60.buckets.find((bucket) => bucket.label === "T+30-59s").count,
    1,
  );
  assert.equal(
    crossing60.buckets.find((bucket) => bucket.label === "Never").count,
    1,
  );

  const lateCheckpointRow = result.thresholdStats.find(
    (row) =>
      row.checkpoint === "t240" &&
      row.side === MARKET_OUTCOMES.UP &&
      row.threshold === 0.7,
  );
  assert.deepEqual(
    {
      sampleCount: lateCheckpointRow.sampleCount,
      winCount: lateCheckpointRow.winCount,
      winRate: lateCheckpointRow.winRate,
    },
    {
      sampleCount: 2,
      winCount: 2,
      winRate: 1,
    },
  );

  assert.deepEqual(
    result.headlineFinding,
    {
      averageDisplayed: 0.72,
      checkpoint: "t60",
      checkpointLabel: "T+60",
      sampleCount: 1,
      side: MARKET_OUTCOMES.UP,
      threshold: 0.7,
      winCount: 1,
      winRate: 1,
    },
  );
});
