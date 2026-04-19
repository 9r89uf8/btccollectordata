import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";

export const ANALYTICS_CHECKPOINTS = [
  {
    btcDeltaField: "btcDeltaFromAnchorAtT15",
    downField: "downDisplayedAtT15",
    id: "t15",
    label: "T+15",
    upField: "upDisplayedAtT15",
  },
  {
    btcDeltaField: "btcDeltaFromAnchorAtT30",
    downField: "downDisplayedAtT30",
    id: "t30",
    label: "T+30",
    upField: "upDisplayedAtT30",
  },
  {
    btcDeltaField: "btcDeltaFromAnchorAtT60",
    downField: "downDisplayedAtT60",
    id: "t60",
    label: "T+60",
    upField: "upDisplayedAtT60",
  },
  {
    btcDeltaField: "btcDeltaFromAnchorAtT120",
    downField: "downDisplayedAtT120",
    id: "t120",
    label: "T+120",
    upField: "upDisplayedAtT120",
  },
  {
    btcDeltaField: "btcDeltaFromAnchorAtT240",
    downField: "downDisplayedAtT240",
    id: "t240",
    label: "T+240",
    upField: "upDisplayedAtT240",
  },
  {
    btcDeltaField: "btcDeltaFromAnchorAtT295",
    downField: "downDisplayedAtT295",
    id: "t295",
    label: "T+295",
    upField: "upDisplayedAtT295",
  },
];

export const ANALYTICS_THRESHOLD_VALUES = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

export const ANALYTICS_DATE_RANGE_OPTIONS = [
  {
    id: "24h",
    label: "Last 24h",
    lookbackMs: 24 * 60 * 60 * 1000,
  },
  {
    id: "72h",
    label: "Last 72h",
    lookbackMs: 72 * 60 * 60 * 1000,
  },
  {
    id: "7d",
    label: "Last 7d",
    lookbackMs: 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: "30d",
    label: "Last 30d",
    lookbackMs: 30 * 24 * 60 * 60 * 1000,
  },
  {
    id: "all",
    label: "All data",
    lookbackMs: null,
  },
];

export const ANALYTICS_QUALITY_OPTIONS = [
  {
    id: "all",
    label: "All quality",
  },
  {
    id: DATA_QUALITY.GOOD,
    label: "Good only",
  },
  {
    id: DATA_QUALITY.PARTIAL,
    label: "Partial only",
  },
  {
    id: DATA_QUALITY.GAP,
    label: "Gap only",
  },
];

export const ANALYTICS_MIN_SAMPLE_OPTIONS = [1, 3, 5, 10];

const SIDE_ORDER = [MARKET_OUTCOMES.UP, MARKET_OUTCOMES.DOWN];
const CALIBRATION_BUCKET_SIZE = 0.1;
const CROSSING_BUCKETS = [
  {
    label: "T+0-29s",
    max: 29,
    min: 0,
  },
  {
    label: "T+30-59s",
    max: 59,
    min: 30,
  },
  {
    label: "T+60-119s",
    max: 119,
    min: 60,
  },
  {
    label: "T+120-179s",
    max: 179,
    min: 120,
  },
  {
    label: "T+180-239s",
    max: 239,
    min: 180,
  },
  {
    label: "T+240-299s",
    max: 299,
    min: 240,
  },
  {
    label: "Never",
    max: null,
    min: null,
  },
];
const CROSSING_FIELDS = [
  {
    field: "firstTimeAbove60",
    label: "60%",
    threshold: 0.6,
  },
  {
    field: "firstTimeAbove70",
    label: "70%",
    threshold: 0.7,
  },
  {
    field: "firstTimeAbove80",
    label: "80%",
    threshold: 0.8,
  },
];
const HEADLINE_TARGET = {
  checkpoint: "t60",
  side: MARKET_OUTCOMES.UP,
  threshold: 0.7,
};
const BOUNDARY_MOVE_HEADLINE_THRESHOLD_USD = 20;
const BOUNDARY_MOVE_THRESHOLD_VALUES = [10, 20, 30, 40, 50, 75, 100];
const BOUNDARY_MOVE_BUCKETS = [
  { minUsd: 0, maxUsd: 10, label: "$0-$9.99" },
  { minUsd: 10, maxUsd: 20, label: "$10-$19.99" },
  { minUsd: 20, maxUsd: 30, label: "$20-$29.99" },
  { minUsd: 30, maxUsd: 40, label: "$30-$39.99" },
  { minUsd: 40, maxUsd: 50, label: "$40-$49.99" },
  { minUsd: 50, maxUsd: 75, label: "$50-$74.99" },
  { minUsd: 75, maxUsd: 100, label: "$75-$99.99" },
  { minUsd: 100, maxUsd: null, label: "$100+" },
];
const BTC_WINNING_SIDE_CHECKPOINTS = [
  { label: "T+15", second: 15 },
  { label: "T+30", second: 30 },
  { label: "T+60", second: 60 },
  { label: "T+120", second: 120 },
  { label: "T+240", second: 240 },
  { label: "T+295", second: 295 },
];
const BTC_WINNING_SIDE_HEADLINE_SECOND = 120;
const BTC_BEST_SIGNAL_MIN_SAMPLES = 40;
const BTC_CANDIDATE_RULE_MIN_EDGE = 0.03;
const BTC_CANDIDATE_RULE_MIN_WIN_RATE = 0.7;
const BTC_BEST_SIGNAL_TARGETS = [
  {
    checkpointSecond: 60,
    side: MARKET_OUTCOMES.UP,
  },
  {
    checkpointSecond: 60,
    side: MARKET_OUTCOMES.DOWN,
  },
  {
    checkpointSecond: 120,
    side: MARKET_OUTCOMES.UP,
  },
  {
    checkpointSecond: 120,
    side: MARKET_OUTCOMES.DOWN,
  },
];
const BTC_EDGE_ACTIONABLE_CHECKPOINTS = new Set(
  BTC_BEST_SIGNAL_TARGETS.map((target) => target.checkpointSecond),
);
const BTC_SIGNAL_QUALITY_BUCKETS = [
  {
    id: "quality_0_20",
    label: "0.00-0.19 (noisy)",
    max: 0.2,
    min: 0,
  },
  {
    id: "quality_20_35",
    label: "0.20-0.34 (mixed)",
    max: 0.35,
    min: 0.2,
  },
  {
    id: "quality_35_plus",
    label: "0.35+ (clean)",
    max: null,
    min: 0.35,
  },
];
const BTC_WINNING_SIDE_DISTANCE_THRESHOLDS = [
  {
    field: "btcWinningSideAt10UsdSecond",
    thresholdUsd: 10,
  },
  {
    field: "btcWinningSideAt20UsdSecond",
    thresholdUsd: 20,
  },
  {
    field: "btcWinningSideAt30UsdSecond",
    thresholdUsd: 30,
  },
];
const BTC_CONDITIONAL_RELIABILITY_BUCKETS = [
  {
    id: "10_20",
    label: "$10-$19.99",
    maxUsd: 20,
    minUsd: 10,
  },
  {
    id: "20_30",
    label: "$20-$29.99",
    maxUsd: 30,
    minUsd: 20,
  },
  {
    id: "30_50",
    label: "$30-$49.99",
    maxUsd: 50,
    minUsd: 30,
  },
  {
    id: "50_plus",
    label: "$50+",
    maxUsd: null,
    minUsd: 50,
  },
];
const COHORT_DRILLDOWN_CHECKPOINTS = [
  {
    anchorCrossCountAfterField: "anchorCrossCountAfter60",
    anchorCrossCountField: "anchorCrossCountTo60",
    btcPathLengthField: "btcPathLengthTo60Usd",
    btcRangeField: "btcRangeTo60Usd",
    checkpoint: ANALYTICS_CHECKPOINTS.find((item) => item.id === "t60"),
    id: "t60",
    maxAdverseExcursionField: "maxAdverseExcursionFrom60Usd",
    momentumField: "momentumInto60Usd30s",
    residualPathLengthField: "residualPathLengthFrom60Usd",
    second: 60,
    sessionHypothesisHour: "morning",
    timeOnWinningSideShareAfterField: "timeOnWinningSideShareAfter60",
  },
  {
    anchorCrossCountAfterField: "anchorCrossCountAfter120",
    anchorCrossCountField: "anchorCrossCountTo120",
    btcPathLengthField: "btcPathLengthTo120Usd",
    btcRangeField: "btcRangeTo120Usd",
    checkpoint: ANALYTICS_CHECKPOINTS.find((item) => item.id === "t120"),
    id: "t120",
    maxAdverseExcursionField: "maxAdverseExcursionFrom120Usd",
    momentumField: "momentumInto120Usd30s",
    residualPathLengthField: "residualPathLengthFrom120Usd",
    second: 120,
    sessionHypothesisHour: "morning",
    timeOnWinningSideShareAfterField: "timeOnWinningSideShareAfter120",
  },
];
const COHORT_HYPOTHESIS_MIN_GROUP_SIZE = 12;
const COHORT_HYPOTHESIS_Z_SCORE = 1.96;
const ET_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "America/New_York",
});
const ET_SESSION_BUCKETS = [
  {
    endHour: 5,
    id: "overnight",
    label: "Overnight ET",
    startHour: 0,
  },
  {
    endHour: 11,
    id: "morning",
    label: "Morning ET",
    startHour: 6,
  },
  {
    endHour: 17,
    id: "afternoon",
    label: "Afternoon ET",
    startHour: 12,
  },
  {
    endHour: 23,
    id: "evening",
    label: "Evening ET",
    startHour: 18,
  },
];

export const COHORT_DRILLDOWN_CHECKPOINT_OPTIONS = COHORT_DRILLDOWN_CHECKPOINTS.map(
  ({ checkpoint, id, second }) => ({
    id,
    label: checkpoint.label,
    second,
  }),
);

export const COHORT_DRILLDOWN_SIDE_OPTIONS = [
  { id: MARKET_OUTCOMES.UP, label: "Up" },
  { id: MARKET_OUTCOMES.DOWN, label: "Down" },
];

export const COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS =
  BTC_CONDITIONAL_RELIABILITY_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    maxUsd: bucket.maxUsd,
    minUsd: bucket.minUsd,
  }));

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDateRangeStart(dateRange, nowTs) {
  const option = ANALYTICS_DATE_RANGE_OPTIONS.find((item) => item.id === dateRange);

  if (!option || option.lookbackMs == null) {
    return null;
  }

  return nowTs - option.lookbackMs;
}

function getSummaryQuality(summary, marketsBySlug) {
  return summary.dataQuality ?? marketsBySlug.get(summary.marketSlug)?.dataQuality ?? "unknown";
}

function getSummaryQualityFlags(summary) {
  return Array.isArray(summary.qualityFlags) ? summary.qualityFlags : [];
}

function hasQualityFlag(summary, target) {
  return getSummaryQualityFlags(summary).includes(target);
}

function getNumericQualityFlagValue(summary, prefix) {
  const flag = getSummaryQualityFlags(summary).find((item) =>
    item.startsWith(`${prefix}:`),
  );

  if (!flag) {
    return null;
  }

  return toFiniteNumber(flag.slice(prefix.length + 1));
}

function getBoundaryReferencePrice(summary, fields) {
  for (const field of fields) {
    const value = toFiniteNumber(summary[field]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getBoundaryMove(summary) {
  const startReference = getBoundaryReferencePrice(summary, [
    "priceToBeatOfficial",
    "priceToBeatDerived",
    "btcChainlinkAtStart",
  ]);
  const endReference = getBoundaryReferencePrice(summary, [
    "closeReferencePriceOfficial",
    "closeReferencePriceDerived",
    "btcChainlinkAtEnd",
  ]);

  if (startReference === null || endReference === null) {
    return null;
  }

  const signedMoveUsd = endReference - startReference;

  return {
    absMoveUsd: Math.abs(signedMoveUsd),
    endReference,
    signedMoveUsd,
    startReference,
  };
}

function formatHourLabel(hour) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;

  return `${displayHour}:00 ${suffix}`;
}

function formatHourRangeLabel(startHour, endHour) {
  return `${formatHourLabel(startHour)}-${formatHourLabel((endHour + 1) % 24)}`;
}

function getEtHour(ts) {
  const hourText = ET_HOUR_FORMATTER.format(new Date(ts));
  const parsedHour = Number(hourText);

  return Number.isFinite(parsedHour) ? parsedHour : null;
}

function getEtSession(hour) {
  return ET_SESSION_BUCKETS.find(
    (bucket) => hour >= bucket.startHour && hour <= bucket.endHour,
  ) ?? null;
}

function getCheckpointValue(summary, checkpoint) {
  return {
    down: toFiniteNumber(summary[checkpoint.downField]),
    up: toFiniteNumber(summary[checkpoint.upField]),
  };
}

function getSideProbability(summary, checkpoint, side) {
  const values = getCheckpointValue(summary, checkpoint);

  return side === MARKET_OUTCOMES.UP ? values.up : values.down;
}

function getBtcDeltaValue(summary, checkpoint) {
  return toFiniteNumber(summary[checkpoint.btcDeltaField]);
}

function getBtcPathLengthForCheckpoint(summary, checkpointSecond) {
  if (checkpointSecond === 60) {
    return toFiniteNumber(summary.btcPathLengthTo60Usd);
  }

  if (checkpointSecond === 120) {
    return toFiniteNumber(summary.btcPathLengthTo120Usd);
  }

  return null;
}

function getBtcSignalQualityScore(summary, checkpoint) {
  const checkpointSecond = Number(checkpoint.id.replace("t", ""));
  const btcDeltaUsd = getBtcDeltaValue(summary, checkpoint);
  const pathLengthUsd = getBtcPathLengthForCheckpoint(summary, checkpointSecond);

  if (btcDeltaUsd === null || pathLengthUsd === null || pathLengthUsd <= 0) {
    return null;
  }

  return Math.abs(btcDeltaUsd) / pathLengthUsd;
}

function getCohortCheckpointConfig(checkpointId) {
  return COHORT_DRILLDOWN_CHECKPOINTS.find((checkpoint) => checkpoint.id === checkpointId)
    ?? COHORT_DRILLDOWN_CHECKPOINTS[1];
}

function getCohortDistanceBucket(bucketId) {
  return COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS.find((bucket) => bucket.id === bucketId)
    ?? COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS[2];
}

function getSummaryNumericField(summary, fieldName) {
  return toFiniteNumber(summary[fieldName]);
}

function getCalibrationBucket(probability) {
  if (probability == null) {
    return null;
  }

  const safeProbability = Math.max(0, Math.min(probability, 1));
  const bucketStart = Math.min(
    1 - CALIBRATION_BUCKET_SIZE,
    Math.floor(safeProbability / CALIBRATION_BUCKET_SIZE) * CALIBRATION_BUCKET_SIZE,
  );
  const bucketEnd = Math.min(1, bucketStart + CALIBRATION_BUCKET_SIZE);
  const startPercent = Math.round(bucketStart * 100);
  const endPercent = Math.round(bucketEnd * 100);

  return {
    endPercent,
    label: `${startPercent}-${endPercent}%`,
    start: bucketStart,
  };
}

function getCrossingBucketLabel(second) {
  if (second == null) {
    return "Never";
  }

  const bucket = CROSSING_BUCKETS.find(
    (candidate) =>
      candidate.min != null &&
      second >= candidate.min &&
      second <= candidate.max,
  );

  return bucket?.label ?? "Never";
}

function sortRowsByWindow(rows) {
  return [...rows].sort((a, b) => a.summary.windowStartTs - b.summary.windowStartTs);
}

function buildFilteredRows({ summaries, markets, filters, nowTs }) {
  const marketsBySlug = new Map(markets.map((market) => [market.slug, market]));
  const windowStartFrom = getDateRangeStart(filters.dateRange, nowTs);

  return sortRowsByWindow(
    summaries
      .map((summary) => ({
        boundaryMove: getBoundaryMove(summary),
        btcWinningSideAt10UsdSecond: toFiniteNumber(
          summary.firstBtcWinningSideAt10UsdSecond,
        ),
        btcWinningSideAt20UsdSecond: toFiniteNumber(
          summary.firstBtcWinningSideAt20UsdSecond,
        ),
        btcWinningSideAt30UsdSecond: toFiniteNumber(
          summary.firstBtcWinningSideAt30UsdSecond,
        ),
        btcWinningSideSecond: toFiniteNumber(summary.firstBtcWinningSideSecond),
        quality: getSummaryQuality(summary, marketsBySlug),
        qualityFlags: getSummaryQualityFlags(summary),
        sampleCadenceMs: getNumericQualityFlagValue(summary, "sample_cadence_ms"),
        summary,
      }))
      .filter((row) => {
        if (
          windowStartFrom != null &&
          row.summary.windowStartTs < windowStartFrom
        ) {
          return false;
        }

        if (
          filters.quality !== "all" &&
          row.quality !== filters.quality
        ) {
          return false;
        }

        return true;
      }),
  );
}

function buildOverview(rows) {
  const qualityCounts = {
    [DATA_QUALITY.GAP]: 0,
    [DATA_QUALITY.GOOD]: 0,
    [DATA_QUALITY.PARTIAL]: 0,
    unknown: 0,
  };
  const outcomeCounts = {
    [MARKET_OUTCOMES.DOWN]: 0,
    [MARKET_OUTCOMES.UP]: 0,
  };

  for (const row of rows) {
    qualityCounts[row.quality] =
      (qualityCounts[row.quality] ?? 0) + 1;
    outcomeCounts[row.summary.resolvedOutcome] += 1;
  }

  return {
    downWins: outcomeCounts[MARKET_OUTCOMES.DOWN],
    gapCount: qualityCounts[DATA_QUALITY.GAP],
    goodCount: qualityCounts[DATA_QUALITY.GOOD],
    partialCount: qualityCounts[DATA_QUALITY.PARTIAL],
    sampleCount: rows.length,
    unknownCount: qualityCounts.unknown,
    upWins: outcomeCounts[MARKET_OUTCOMES.UP],
    windowStartMax: rows.length > 0 ? rows[rows.length - 1].summary.windowStartTs : null,
    windowStartMin: rows.length > 0 ? rows[0].summary.windowStartTs : null,
  };
}

function getPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }

  const safePercentile = Math.max(0, Math.min(percentile, 1));
  const index = Math.max(
    0,
    Math.ceil(safePercentile * sortedValues.length) - 1,
  );

  return sortedValues[index] ?? null;
}

function getBoundaryMoveRows(rows) {
  return rows.filter((row) => row.boundaryMove !== null);
}

function buildBoundaryMoveOverview(rows) {
  const moveRows = getBoundaryMoveRows(rows);
  const absMoves = moveRows
    .map((row) => row.boundaryMove.absMoveUsd)
    .sort((a, b) => a - b);
  const signedMoves = moveRows.map((row) => row.boundaryMove.signedMoveUsd);
  const averageAbsMoveUsd =
    absMoves.length > 0
      ? absMoves.reduce((sum, value) => sum + value, 0) / absMoves.length
      : null;
  const averageSignedMoveUsd =
    signedMoves.length > 0
      ? signedMoves.reduce((sum, value) => sum + value, 0) / signedMoves.length
      : null;

  return {
    averageAbsMoveUsd,
    averageSignedMoveUsd,
    excludedCount: rows.length - moveRows.length,
    maxAbsMoveUsd: absMoves.length > 0 ? absMoves[absMoves.length - 1] : null,
    medianAbsMoveUsd: getPercentile(absMoves, 0.5),
    p75AbsMoveUsd: getPercentile(absMoves, 0.75),
    p90AbsMoveUsd: getPercentile(absMoves, 0.9),
    usableCount: moveRows.length,
  };
}

function buildBoundaryMoveHeadline(rows) {
  const moveRows = getBoundaryMoveRows(rows);
  const hitCount = moveRows.filter(
    (row) => row.boundaryMove.absMoveUsd >= BOUNDARY_MOVE_HEADLINE_THRESHOLD_USD,
  ).length;

  return {
    hitCount,
    sampleCount: moveRows.length,
    share: moveRows.length > 0 ? hitCount / moveRows.length : null,
    thresholdUsd: BOUNDARY_MOVE_HEADLINE_THRESHOLD_USD,
  };
}

function buildBoundaryMoveThresholdStats(rows, minSampleSize) {
  const moveRows = getBoundaryMoveRows(rows);

  if (moveRows.length < minSampleSize) {
    return [];
  }

  return BOUNDARY_MOVE_THRESHOLD_VALUES.map((thresholdUsd) => {
    const hitCount = moveRows.filter(
      (row) => row.boundaryMove.absMoveUsd >= thresholdUsd,
    ).length;

    return {
      hitCount,
      sampleCount: moveRows.length,
      share: moveRows.length > 0 ? hitCount / moveRows.length : null,
      thresholdUsd,
    };
  });
}

function buildBoundaryMoveBuckets(rows) {
  const moveRows = getBoundaryMoveRows(rows);

  return BOUNDARY_MOVE_BUCKETS.map((bucket) => {
    const count = moveRows.filter((row) => {
      const moveUsd = row.boundaryMove.absMoveUsd;

      if (moveUsd < bucket.minUsd) {
        return false;
      }

      if (bucket.maxUsd == null) {
        return true;
      }

      return moveUsd < bucket.maxUsd;
    }).length;

    return {
      count,
      label: bucket.label,
      maxUsd: bucket.maxUsd,
      minUsd: bucket.minUsd,
      share: moveRows.length > 0 ? count / moveRows.length : null,
    };
  });
}

function buildBoundaryMoveAggregate(rows) {
  const absMoves = rows
    .map((row) => row.boundaryMove.absMoveUsd)
    .sort((a, b) => a - b);

  return {
    averageAbsMoveUsd:
      absMoves.length > 0
        ? absMoves.reduce((sum, value) => sum + value, 0) / absMoves.length
        : null,
    maxAbsMoveUsd: absMoves.length > 0 ? absMoves[absMoves.length - 1] : null,
    medianAbsMoveUsd: getPercentile(absMoves, 0.5),
    p75AbsMoveUsd: getPercentile(absMoves, 0.75),
    sampleCount: rows.length,
    shareAt20Usd:
      rows.length > 0
        ? rows.filter((row) => row.boundaryMove.absMoveUsd >= 20).length / rows.length
        : null,
    shareAt50Usd:
      rows.length > 0
        ? rows.filter((row) => row.boundaryMove.absMoveUsd >= 50).length / rows.length
        : null,
  };
}

function buildBoundaryMoveByHour(rows, minSampleSize) {
  const moveRows = getBoundaryMoveRows(rows)
    .map((row) => ({
      ...row,
      etHour: getEtHour(row.summary.windowStartTs),
    }))
    .filter((row) => row.etHour != null);

  return Array.from({ length: 24 }, (_, hour) => {
    const hourRows = moveRows.filter((row) => row.etHour === hour);

    return {
      hour,
      label: formatHourLabel(hour),
      ...buildBoundaryMoveAggregate(hourRows),
    };
  }).filter((row) => row.sampleCount >= minSampleSize);
}

function buildBoundaryMoveBySession(rows, minSampleSize) {
  const moveRows = getBoundaryMoveRows(rows)
    .map((row) => ({
      ...row,
      etHour: getEtHour(row.summary.windowStartTs),
    }))
    .filter((row) => row.etHour != null);

  return ET_SESSION_BUCKETS.map((bucket) => {
    const bucketRows = moveRows.filter(
      (row) => row.etHour >= bucket.startHour && row.etHour <= bucket.endHour,
    );

    return {
      id: bucket.id,
      label: bucket.label,
      rangeLabel: formatHourRangeLabel(bucket.startHour, bucket.endHour),
      ...buildBoundaryMoveAggregate(bucketRows),
    };
  }).filter((row) => row.sampleCount >= minSampleSize);
}

function getWinningSideRows(rows) {
  return rows.filter((row) => row.btcWinningSideSecond !== null);
}

function getWinningSideRowsForField(rows, fieldName) {
  return rows.filter((row) => row[fieldName] !== null);
}

function countRowsWithFlag(rows, target) {
  return rows.filter((row) => row.qualityFlags.includes(target)).length;
}

function buildBtcWinningSideOverview(rows) {
  const winningSideRows = getWinningSideRows(rows);
  const winningSideSeconds = winningSideRows
    .map((row) => row.btcWinningSideSecond)
    .sort((a, b) => a - b);

  return {
    conflictCount: countRowsWithFlag(rows, "btc_path_conflicts_resolved"),
    matchingCount: winningSideRows.length,
    medianWinningSideSecond: getPercentile(winningSideSeconds, 0.5),
    missingAnchorCount: countRowsWithFlag(rows, "btc_winning_side_missing_anchor"),
    noBtcDataCount: countRowsWithFlag(rows, "btc_winning_side_no_btc_data"),
    p25WinningSideSecond: getPercentile(winningSideSeconds, 0.25),
    p75WinningSideSecond: getPercentile(winningSideSeconds, 0.75),
    sampleCount: rows.length,
    neverMatchedCount: rows.length - winningSideRows.length,
  };
}

function buildBtcWinningSideCheckpointStats(rows, minSampleSize) {
  if (rows.length < minSampleSize) {
    return [];
  }

  return BTC_WINNING_SIDE_CHECKPOINTS.map((checkpoint) => {
    const matchingCount = rows.filter(
      (row) =>
        row.btcWinningSideSecond !== null &&
        row.btcWinningSideSecond <= checkpoint.second,
    ).length;

    return {
      checkpointLabel: checkpoint.label,
      checkpointSecond: checkpoint.second,
      matchingCount,
      sampleCount: rows.length,
      share: rows.length > 0 ? matchingCount / rows.length : null,
    };
  });
}

function buildBtcWinningSideOutcomeSplit(rows, minSampleSize) {
  return SIDE_ORDER.map((side) => {
    const sideRows = rows.filter((row) => row.summary.resolvedOutcome === side);
    const winningSideRows = getWinningSideRows(sideRows);
    const winningSideSeconds = winningSideRows
      .map((row) => row.btcWinningSideSecond)
      .sort((a, b) => a - b);

    return {
      matchingCount: winningSideRows.length,
      medianWinningSideSecond: getPercentile(winningSideSeconds, 0.5),
      p75WinningSideSecond: getPercentile(winningSideSeconds, 0.75),
      sampleCount: sideRows.length,
      share:
        sideRows.length > 0 ? winningSideRows.length / sideRows.length : null,
      side,
    };
  }).filter((row) => row.sampleCount >= minSampleSize);
}

function buildBtcWinningSideCadenceMix(rows) {
  const cadenceCounts = new Map();

  for (const row of rows) {
    const key = row.sampleCadenceMs ?? "unknown";
    cadenceCounts.set(key, (cadenceCounts.get(key) ?? 0) + 1);
  }

  return [...cadenceCounts.entries()]
    .map(([sampleCadenceMs, sampleCount]) => ({
      label:
        sampleCadenceMs === "unknown" ? "unknown" : `${sampleCadenceMs / 1000}s`,
      sampleCadenceMs,
      sampleCount,
      share: rows.length > 0 ? sampleCount / rows.length : null,
    }))
    .sort((a, b) => {
      if (a.sampleCadenceMs === "unknown") {
        return 1;
      }

      if (b.sampleCadenceMs === "unknown") {
        return -1;
      }

      return a.sampleCadenceMs - b.sampleCadenceMs;
    });
}

function buildBtcWinningSideDistanceStats(rows, minSampleSize) {
  if (rows.length < minSampleSize) {
    return [];
  }

  return BTC_WINNING_SIDE_DISTANCE_THRESHOLDS.map((threshold) => {
    const matchingRows = getWinningSideRowsForField(rows, threshold.field);
    const matchingSeconds = matchingRows
      .map((row) => row[threshold.field])
      .sort((a, b) => a - b);

    return {
      checkpointStats: BTC_WINNING_SIDE_CHECKPOINTS.map((checkpoint) => {
        const matchingCount = rows.filter(
          (row) =>
            row[threshold.field] !== null &&
            row[threshold.field] <= checkpoint.second,
        ).length;

        return {
          checkpointLabel: checkpoint.label,
          checkpointSecond: checkpoint.second,
          matchingCount,
          sampleCount: rows.length,
          share: rows.length > 0 ? matchingCount / rows.length : null,
        };
      }),
      matchingCount: matchingRows.length,
      medianWinningSideSecond: getPercentile(matchingSeconds, 0.5),
      sampleCount: rows.length,
      thresholdUsd: threshold.thresholdUsd,
      share: rows.length > 0 ? matchingRows.length / rows.length : null,
    };
  });
}

function buildBtcConditionalReliabilityRows(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      const btcDeltaUsd = getBtcDeltaValue(row.summary, checkpoint);

      if (btcDeltaUsd === null) {
        continue;
      }

      for (const threshold of BTC_WINNING_SIDE_DISTANCE_THRESHOLDS) {
        for (const side of SIDE_ORDER) {
          const matchesThreshold =
            side === MARKET_OUTCOMES.UP
              ? btcDeltaUsd >= threshold.thresholdUsd
              : btcDeltaUsd <= -threshold.thresholdUsd;

          if (!matchesThreshold) {
            continue;
          }

          const key = `${checkpoint.id}:${side}:${threshold.thresholdUsd}`;
          const aggregate = aggregates.get(key) ?? {
            averageAbsDeltaTotal: 0,
            averageDeltaTotal: 0,
            checkpoint: checkpoint.id,
            checkpointLabel: checkpoint.label,
            checkpointSecond: Number(checkpoint.id.replace("t", "")),
            sampleCount: 0,
            side,
            thresholdUsd: threshold.thresholdUsd,
            winCount: 0,
          };

          aggregate.averageAbsDeltaTotal += Math.abs(btcDeltaUsd);
          aggregate.averageDeltaTotal += btcDeltaUsd;
          aggregate.sampleCount += 1;
          aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
          aggregates.set(key, aggregate);
        }
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => ({
      averageAbsDeltaUsd:
        aggregate.sampleCount > 0
          ? aggregate.averageAbsDeltaTotal / aggregate.sampleCount
          : null,
      averageDeltaUsd:
        aggregate.sampleCount > 0
          ? aggregate.averageDeltaTotal / aggregate.sampleCount
          : null,
      checkpoint: aggregate.checkpoint,
      checkpointLabel: aggregate.checkpointLabel,
      checkpointSecond: aggregate.checkpointSecond,
      sampleCount: aggregate.sampleCount,
      side: aggregate.side,
      thresholdUsd: aggregate.thresholdUsd,
      winCount: aggregate.winCount,
      winRate:
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null,
    }))
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const thresholdDelta = a.thresholdUsd - b.thresholdUsd;

      if (thresholdDelta !== 0) {
        return thresholdDelta;
      }

      return SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);
    });
}

function buildBtcConditionalReliabilityBucketRows(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      const btcDeltaUsd = getBtcDeltaValue(row.summary, checkpoint);

      if (btcDeltaUsd === null) {
        continue;
      }

      for (const bucket of BTC_CONDITIONAL_RELIABILITY_BUCKETS) {
        const absDeltaUsd = Math.abs(btcDeltaUsd);

        if (absDeltaUsd < bucket.minUsd) {
          continue;
        }

        if (bucket.maxUsd !== null && absDeltaUsd >= bucket.maxUsd) {
          continue;
        }

        const side =
          btcDeltaUsd >= 0 ? MARKET_OUTCOMES.UP : MARKET_OUTCOMES.DOWN;
        const key = `${checkpoint.id}:${side}:${bucket.minUsd}`;
        const aggregate = aggregates.get(key) ?? {
          averageAbsDeltaTotal: 0,
          averageDeltaTotal: 0,
          bucketLabel: bucket.label,
          checkpoint: checkpoint.id,
          checkpointLabel: checkpoint.label,
          checkpointSecond: Number(checkpoint.id.replace("t", "")),
          maxUsd: bucket.maxUsd,
          minUsd: bucket.minUsd,
          sampleCount: 0,
          side,
          winCount: 0,
        };

        aggregate.averageAbsDeltaTotal += absDeltaUsd;
        aggregate.averageDeltaTotal += btcDeltaUsd;
        aggregate.sampleCount += 1;
        aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
        aggregates.set(key, aggregate);
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => ({
      averageAbsDeltaUsd:
        aggregate.sampleCount > 0
          ? aggregate.averageAbsDeltaTotal / aggregate.sampleCount
          : null,
      averageDeltaUsd:
        aggregate.sampleCount > 0
          ? aggregate.averageDeltaTotal / aggregate.sampleCount
          : null,
      bucketLabel: aggregate.bucketLabel,
      checkpoint: aggregate.checkpoint,
      checkpointLabel: aggregate.checkpointLabel,
      checkpointSecond: aggregate.checkpointSecond,
      maxUsd: aggregate.maxUsd,
      minUsd: aggregate.minUsd,
      sampleCount: aggregate.sampleCount,
      side: aggregate.side,
      winCount: aggregate.winCount,
      winRate:
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null,
    }))
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const sideDelta = SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);

      if (sideDelta !== 0) {
        return sideDelta;
      }

      return a.minUsd - b.minUsd;
    });
}

function buildBtcBestSignalCards(rows, minSampleSize) {
  const effectiveMinSampleSize = Math.max(minSampleSize, BTC_BEST_SIGNAL_MIN_SAMPLES);
  const bucketRows = buildBtcConditionalReliabilityBucketRows(
    rows,
    effectiveMinSampleSize,
  );

  return {
    cards: BTC_BEST_SIGNAL_TARGETS.map((target) => {
      const matchingRows = bucketRows.filter(
        (row) =>
          row.checkpointSecond === target.checkpointSecond &&
          row.side === target.side,
      );

      if (matchingRows.length === 0) {
        return {
          averageDeltaUsd: null,
          bucketLabel: null,
          checkpointSecond: target.checkpointSecond,
          sampleCount: 0,
          side: target.side,
          winRate: null,
        };
      }

      const bestRow = [...matchingRows].sort((a, b) => {
        const winRateDelta = (b.winRate ?? -1) - (a.winRate ?? -1);

        if (winRateDelta !== 0) {
          return winRateDelta;
        }

        const sampleDelta = b.sampleCount - a.sampleCount;

        if (sampleDelta !== 0) {
          return sampleDelta;
        }

        return a.minUsd - b.minUsd;
      })[0];

      return {
        averageDeltaUsd: bestRow.averageDeltaUsd,
        bucketLabel: bestRow.bucketLabel,
        checkpointSecond: bestRow.checkpointSecond,
        sampleCount: bestRow.sampleCount,
        side: bestRow.side,
        winRate: bestRow.winRate,
      };
    }),
    minSampleSize: effectiveMinSampleSize,
  };
}

function buildBtcMarketEdgeBucketRows(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      const checkpointSecond = Number(checkpoint.id.replace("t", ""));

      if (!BTC_EDGE_ACTIONABLE_CHECKPOINTS.has(checkpointSecond)) {
        continue;
      }

      const btcDeltaUsd = getBtcDeltaValue(row.summary, checkpoint);

      if (btcDeltaUsd === null) {
        continue;
      }

      const side = btcDeltaUsd >= 0 ? MARKET_OUTCOMES.UP : MARKET_OUTCOMES.DOWN;
      const displayedProbability = getSideProbability(row.summary, checkpoint, side);

      if (displayedProbability === null) {
        continue;
      }

      for (const bucket of BTC_CONDITIONAL_RELIABILITY_BUCKETS) {
        const absDeltaUsd = Math.abs(btcDeltaUsd);

        if (absDeltaUsd < bucket.minUsd) {
          continue;
        }

        if (bucket.maxUsd !== null && absDeltaUsd >= bucket.maxUsd) {
          continue;
        }

        const key = `${checkpoint.id}:${side}:${bucket.minUsd}`;
        const aggregate = aggregates.get(key) ?? {
          averageAbsDeltaTotal: 0,
          averageDeltaTotal: 0,
          averageDisplayedTotal: 0,
          bucketLabel: bucket.label,
          checkpoint: checkpoint.id,
          checkpointLabel: checkpoint.label,
          checkpointSecond,
          maxUsd: bucket.maxUsd,
          minUsd: bucket.minUsd,
          sampleCount: 0,
          side,
          winCount: 0,
        };

        aggregate.averageAbsDeltaTotal += absDeltaUsd;
        aggregate.averageDeltaTotal += btcDeltaUsd;
        aggregate.averageDisplayedTotal += displayedProbability;
        aggregate.sampleCount += 1;
        aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
        aggregates.set(key, aggregate);
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => {
      const winRate =
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null;
      const averageDisplayedProbability =
        aggregate.sampleCount > 0
          ? aggregate.averageDisplayedTotal / aggregate.sampleCount
          : null;

      return {
        averageAbsDeltaUsd:
          aggregate.sampleCount > 0
            ? aggregate.averageAbsDeltaTotal / aggregate.sampleCount
            : null,
        averageDeltaUsd:
          aggregate.sampleCount > 0
            ? aggregate.averageDeltaTotal / aggregate.sampleCount
            : null,
        averageDisplayedProbability,
        averageEdge:
          winRate !== null && averageDisplayedProbability !== null
            ? winRate - averageDisplayedProbability
            : null,
        bucketLabel: aggregate.bucketLabel,
        checkpoint: aggregate.checkpoint,
        checkpointLabel: aggregate.checkpointLabel,
        checkpointSecond: aggregate.checkpointSecond,
        maxUsd: aggregate.maxUsd,
        minUsd: aggregate.minUsd,
        sampleCount: aggregate.sampleCount,
        side: aggregate.side,
        winCount: aggregate.winCount,
        winRate,
      };
    })
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const sideDelta = SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);

      if (sideDelta !== 0) {
        return sideDelta;
      }

      return a.minUsd - b.minUsd;
    });
}

function buildBtcMarketEdgeCards(rows, minSampleSize) {
  const effectiveMinSampleSize = Math.max(minSampleSize, BTC_BEST_SIGNAL_MIN_SAMPLES);
  const edgeRows = buildBtcMarketEdgeBucketRows(rows, effectiveMinSampleSize);

  return {
    cards: BTC_BEST_SIGNAL_TARGETS.map((target) => {
      const matchingRows = edgeRows.filter(
        (row) =>
          row.checkpointSecond === target.checkpointSecond &&
          row.side === target.side,
      );

      if (matchingRows.length === 0) {
        return {
          averageDeltaUsd: null,
          averageDisplayedProbability: null,
          averageEdge: null,
          bucketLabel: null,
          checkpointSecond: target.checkpointSecond,
          sampleCount: 0,
          side: target.side,
          winRate: null,
        };
      }

      const bestRow = [...matchingRows].sort((a, b) => {
        const edgeDelta = (b.averageEdge ?? -Infinity) - (a.averageEdge ?? -Infinity);

        if (edgeDelta !== 0) {
          return edgeDelta;
        }

        const sampleDelta = b.sampleCount - a.sampleCount;

        if (sampleDelta !== 0) {
          return sampleDelta;
        }

        return (b.winRate ?? -Infinity) - (a.winRate ?? -Infinity);
      })[0];

      return {
        averageDeltaUsd: bestRow.averageDeltaUsd,
        averageDisplayedProbability: bestRow.averageDisplayedProbability,
        averageEdge: bestRow.averageEdge,
        bucketLabel: bestRow.bucketLabel,
        checkpointSecond: bestRow.checkpointSecond,
        sampleCount: bestRow.sampleCount,
        side: bestRow.side,
        winRate: bestRow.winRate,
      };
    }),
    minSampleSize: effectiveMinSampleSize,
  };
}

function buildBtcSignalQualityEdgeRows(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      const checkpointSecond = Number(checkpoint.id.replace("t", ""));

      if (!BTC_EDGE_ACTIONABLE_CHECKPOINTS.has(checkpointSecond)) {
        continue;
      }

      const btcDeltaUsd = getBtcDeltaValue(row.summary, checkpoint);
      const signalQualityScore = getBtcSignalQualityScore(row.summary, checkpoint);

      if (btcDeltaUsd === null || signalQualityScore === null) {
        continue;
      }

      const side =
        btcDeltaUsd >= 0 ? MARKET_OUTCOMES.UP : MARKET_OUTCOMES.DOWN;
      const displayedProbability = getSideProbability(row.summary, checkpoint, side);

      if (displayedProbability === null) {
        continue;
      }

      for (const distanceBucket of BTC_CONDITIONAL_RELIABILITY_BUCKETS) {
        const absDeltaUsd = Math.abs(btcDeltaUsd);

        if (absDeltaUsd < distanceBucket.minUsd) {
          continue;
        }

        if (
          distanceBucket.maxUsd !== null &&
          absDeltaUsd >= distanceBucket.maxUsd
        ) {
          continue;
        }

        for (const qualityBucket of BTC_SIGNAL_QUALITY_BUCKETS) {
          if (signalQualityScore < qualityBucket.min) {
            continue;
          }

          if (qualityBucket.max !== null && signalQualityScore >= qualityBucket.max) {
            continue;
          }

          const key = `${checkpoint.id}:${side}:${distanceBucket.id}:${qualityBucket.id}`;
          const aggregate = aggregates.get(key) ?? {
            averageDeltaTotal: 0,
            averageDisplayedTotal: 0,
            averageSignalQualityTotal: 0,
            checkpoint: checkpoint.id,
            checkpointLabel: checkpoint.label,
            checkpointSecond,
            distanceBucketId: distanceBucket.id,
            distanceBucketLabel: distanceBucket.label,
            distanceMaxUsd: distanceBucket.maxUsd,
            distanceMinUsd: distanceBucket.minUsd,
            qualityBucketId: qualityBucket.id,
            qualityBucketLabel: qualityBucket.label,
            qualityMax: qualityBucket.max,
            qualityMin: qualityBucket.min,
            sampleCount: 0,
            side,
            winCount: 0,
          };

          aggregate.averageDeltaTotal += btcDeltaUsd;
          aggregate.averageDisplayedTotal += displayedProbability;
          aggregate.averageSignalQualityTotal += signalQualityScore;
          aggregate.sampleCount += 1;
          aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
          aggregates.set(key, aggregate);
        }
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => {
      const winRate =
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null;
      const averageDisplayedProbability =
        aggregate.sampleCount > 0
          ? aggregate.averageDisplayedTotal / aggregate.sampleCount
          : null;

      return {
        averageDeltaUsd:
          aggregate.sampleCount > 0
            ? aggregate.averageDeltaTotal / aggregate.sampleCount
            : null,
        averageDisplayedProbability,
        averageEdge:
          winRate !== null && averageDisplayedProbability !== null
            ? winRate - averageDisplayedProbability
            : null,
        averageSignalQualityScore:
          aggregate.sampleCount > 0
            ? aggregate.averageSignalQualityTotal / aggregate.sampleCount
            : null,
        checkpoint: aggregate.checkpoint,
        checkpointLabel: aggregate.checkpointLabel,
        checkpointSecond: aggregate.checkpointSecond,
        distanceBucketId: aggregate.distanceBucketId,
        distanceBucketLabel: aggregate.distanceBucketLabel,
        distanceMaxUsd: aggregate.distanceMaxUsd,
        distanceMinUsd: aggregate.distanceMinUsd,
        qualityBucketId: aggregate.qualityBucketId,
        qualityBucketLabel: aggregate.qualityBucketLabel,
        qualityMax: aggregate.qualityMax,
        qualityMin: aggregate.qualityMin,
        sampleCount: aggregate.sampleCount,
        side: aggregate.side,
        winCount: aggregate.winCount,
        winRate,
      };
    })
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const sideDelta = SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);

      if (sideDelta !== 0) {
        return sideDelta;
      }

      const distanceDelta = a.distanceMinUsd - b.distanceMinUsd;

      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      return a.qualityMin - b.qualityMin;
    });
}

function buildBtcSignalQualityEdgeCards(rows, minSampleSize) {
  const effectiveMinSampleSize = Math.max(
    minSampleSize,
    BTC_BEST_SIGNAL_MIN_SAMPLES,
  );
  const qualityRows = buildBtcSignalQualityEdgeRows(rows, effectiveMinSampleSize);

  return {
    cards: BTC_BEST_SIGNAL_TARGETS.map((target) => {
      const matchingRows = qualityRows.filter(
        (row) =>
          row.checkpointSecond === target.checkpointSecond &&
          row.side === target.side,
      );

      if (matchingRows.length === 0) {
        return {
          averageDeltaUsd: null,
          averageDisplayedProbability: null,
          averageEdge: null,
          averageSignalQualityScore: null,
          checkpointSecond: target.checkpointSecond,
          distanceBucketLabel: null,
          qualityBucketLabel: null,
          sampleCount: 0,
          side: target.side,
          winRate: null,
        };
      }

      const bestRow = [...matchingRows].sort((a, b) => {
        const edgeDelta = (b.averageEdge ?? -Infinity) - (a.averageEdge ?? -Infinity);

        if (edgeDelta !== 0) {
          return edgeDelta;
        }

        const sampleDelta = b.sampleCount - a.sampleCount;

        if (sampleDelta !== 0) {
          return sampleDelta;
        }

        return (b.averageSignalQualityScore ?? -Infinity) - (a.averageSignalQualityScore ?? -Infinity);
      })[0];

      return {
        averageDeltaUsd: bestRow.averageDeltaUsd,
        averageDisplayedProbability: bestRow.averageDisplayedProbability,
        averageEdge: bestRow.averageEdge,
        averageSignalQualityScore: bestRow.averageSignalQualityScore,
        checkpointSecond: bestRow.checkpointSecond,
        distanceBucketLabel: bestRow.distanceBucketLabel,
        qualityBucketLabel: bestRow.qualityBucketLabel,
        sampleCount: bestRow.sampleCount,
        side: bestRow.side,
        winRate: bestRow.winRate,
      };
    }),
    minSampleSize: effectiveMinSampleSize,
  };
}

function buildBtcCandidateRules(rows, minSampleSize) {
  const effectiveMinSampleSize = Math.max(
    minSampleSize,
    BTC_BEST_SIGNAL_MIN_SAMPLES,
  );
  const candidateRows = buildBtcSignalQualityEdgeRows(rows, effectiveMinSampleSize)
    .filter(
      (row) =>
        (row.averageEdge ?? -Infinity) >= BTC_CANDIDATE_RULE_MIN_EDGE &&
        (row.winRate ?? -Infinity) >= BTC_CANDIDATE_RULE_MIN_WIN_RATE,
    )
    .sort((a, b) => {
      const edgeDelta = (b.averageEdge ?? -Infinity) - (a.averageEdge ?? -Infinity);

      if (edgeDelta !== 0) {
        return edgeDelta;
      }

      const winRateDelta = (b.winRate ?? -Infinity) - (a.winRate ?? -Infinity);

      if (winRateDelta !== 0) {
        return winRateDelta;
      }

      return b.sampleCount - a.sampleCount;
    });

  return {
    minEdge: BTC_CANDIDATE_RULE_MIN_EDGE,
    minSampleSize: effectiveMinSampleSize,
    minWinRate: BTC_CANDIDATE_RULE_MIN_WIN_RATE,
    rows: candidateRows,
  };
}

function buildBtcWinningSideHeadline(rows) {
  const checkpoint = BTC_WINNING_SIDE_CHECKPOINTS.find(
    (item) => item.second === BTC_WINNING_SIDE_HEADLINE_SECOND,
  );
  const matchingCount = rows.filter(
    (row) =>
      row.btcWinningSideSecond !== null &&
      row.btcWinningSideSecond <= BTC_WINNING_SIDE_HEADLINE_SECOND,
  ).length;

  return {
    checkpointLabel: checkpoint.label,
    checkpointSecond: checkpoint.second,
    matchingCount,
    sampleCount: rows.length,
    share: rows.length > 0 ? matchingCount / rows.length : null,
  };
}

function buildThresholdStats(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      for (const side of SIDE_ORDER) {
        const probability = getSideProbability(row.summary, checkpoint, side);

        if (probability == null) {
          continue;
        }

        for (const threshold of ANALYTICS_THRESHOLD_VALUES) {
          if (probability < threshold) {
            continue;
          }

          const key = `${checkpoint.id}:${side}:${threshold}`;
          const aggregate = aggregates.get(key) ?? {
            averageDisplayedTotal: 0,
            checkpoint: checkpoint.id,
            checkpointLabel: checkpoint.label,
            sampleCount: 0,
            side,
            threshold,
            winCount: 0,
          };

          aggregate.averageDisplayedTotal += probability;
          aggregate.sampleCount += 1;
          aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
          aggregates.set(key, aggregate);
        }
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => ({
      averageDisplayed:
        aggregate.sampleCount > 0
          ? aggregate.averageDisplayedTotal / aggregate.sampleCount
          : null,
      checkpoint: aggregate.checkpoint,
      checkpointLabel: aggregate.checkpointLabel,
      sampleCount: aggregate.sampleCount,
      side: aggregate.side,
      threshold: aggregate.threshold,
      winCount: aggregate.winCount,
      winRate:
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null,
    }))
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const sideDelta = SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);

      if (sideDelta !== 0) {
        return sideDelta;
      }

      return b.threshold - a.threshold;
    });
}

function buildCalibrationRows(rows, minSampleSize) {
  const aggregates = new Map();

  for (const row of rows) {
    for (const checkpoint of ANALYTICS_CHECKPOINTS) {
      for (const side of SIDE_ORDER) {
        const probability = getSideProbability(row.summary, checkpoint, side);

        if (probability == null) {
          continue;
        }

        const bucket = getCalibrationBucket(probability);
        const key = `${checkpoint.id}:${side}:${bucket.start}`;
        const aggregate = aggregates.get(key) ?? {
          averageDisplayedTotal: 0,
          bucketEndPercent: bucket.endPercent,
          bucketLabel: bucket.label,
          bucketStart: bucket.start,
          checkpoint: checkpoint.id,
          checkpointLabel: checkpoint.label,
          sampleCount: 0,
          side,
          winCount: 0,
        };

        aggregate.averageDisplayedTotal += probability;
        aggregate.sampleCount += 1;
        aggregate.winCount += row.summary.resolvedOutcome === side ? 1 : 0;
        aggregates.set(key, aggregate);
      }
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) => aggregate.sampleCount >= minSampleSize)
    .map((aggregate) => ({
      averageDisplayed:
        aggregate.sampleCount > 0
          ? aggregate.averageDisplayedTotal / aggregate.sampleCount
          : null,
      bucketEndPercent: aggregate.bucketEndPercent,
      bucketLabel: aggregate.bucketLabel,
      bucketStart: aggregate.bucketStart,
      checkpoint: aggregate.checkpoint,
      checkpointLabel: aggregate.checkpointLabel,
      calibrationGap:
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount -
            aggregate.averageDisplayedTotal / aggregate.sampleCount
          : null,
      sampleCount: aggregate.sampleCount,
      side: aggregate.side,
      winCount: aggregate.winCount,
      winRate:
        aggregate.sampleCount > 0
          ? aggregate.winCount / aggregate.sampleCount
          : null,
    }))
    .sort((a, b) => {
      const checkpointDelta =
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === a.checkpoint) -
        ANALYTICS_CHECKPOINTS.findIndex((item) => item.id === b.checkpoint);

      if (checkpointDelta !== 0) {
        return checkpointDelta;
      }

      const sideDelta = SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side);

      if (sideDelta !== 0) {
        return sideDelta;
      }

      return a.bucketStart - b.bucketStart;
    });
}

function buildCrossingDistributions(rows) {
  return CROSSING_FIELDS.map((crossingField) => {
    const bucketCounts = Object.fromEntries(
      CROSSING_BUCKETS.map((bucket) => [bucket.label, 0]),
    );

    for (const row of rows) {
      const second = toFiniteNumber(row.summary[crossingField.field]);
      const bucketLabel = getCrossingBucketLabel(second);
      bucketCounts[bucketLabel] += 1;
    }

    return {
      buckets: CROSSING_BUCKETS.map((bucket) => ({
        count: bucketCounts[bucket.label],
        label: bucket.label,
        share: rows.length > 0 ? bucketCounts[bucket.label] / rows.length : null,
      })),
      crossedCount: rows.filter(
        (row) => toFiniteNumber(row.summary[crossingField.field]) != null,
      ).length,
      sampleCount: rows.length,
      threshold: crossingField.threshold,
      thresholdLabel: crossingField.label,
    };
  });
}

function buildHeadlineFinding(rows) {
  let sampleCount = 0;
  let winCount = 0;
  let averageDisplayedTotal = 0;
  const checkpoint = ANALYTICS_CHECKPOINTS.find(
    (item) => item.id === HEADLINE_TARGET.checkpoint,
  );

  for (const row of rows) {
    const probability = getSideProbability(row.summary, checkpoint, HEADLINE_TARGET.side);

    if (probability == null || probability < HEADLINE_TARGET.threshold) {
      continue;
    }

    sampleCount += 1;
    averageDisplayedTotal += probability;
    winCount += row.summary.resolvedOutcome === HEADLINE_TARGET.side ? 1 : 0;
  }

  return {
    averageDisplayed:
      sampleCount > 0 ? averageDisplayedTotal / sampleCount : null,
    checkpoint: HEADLINE_TARGET.checkpoint,
    checkpointLabel: checkpoint.label,
    sampleCount,
    side: HEADLINE_TARGET.side,
    threshold: HEADLINE_TARGET.threshold,
    winCount,
    winRate: sampleCount > 0 ? winCount / sampleCount : null,
  };
}

function computeMean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeSampleVariance(values, mean) {
  if (!Array.isArray(values) || values.length <= 1 || mean === null) {
    return 0;
  }

  return (
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1)
  );
}

function buildMeanSummary(values) {
  const finiteValues = values.filter((value) => value !== null);
  const mean = computeMean(finiteValues);

  if (mean === null) {
    return {
      ciHigh: null,
      ciLow: null,
      mean: null,
      sampleCount: 0,
      variance: null,
    };
  }

  const variance = computeSampleVariance(finiteValues, mean);
  const standardError =
    finiteValues.length > 0 ? Math.sqrt(variance / finiteValues.length) : null;

  return {
    ciHigh:
      standardError === null
        ? null
        : mean + COHORT_HYPOTHESIS_Z_SCORE * standardError,
    ciLow:
      standardError === null
        ? null
        : mean - COHORT_HYPOTHESIS_Z_SCORE * standardError,
    mean,
    sampleCount: finiteValues.length,
    variance,
  };
}

function buildMeanDifferenceSummary(groupA, groupB) {
  if (groupA.mean === null || groupB.mean === null) {
    return {
      ciHigh: null,
      ciLow: null,
      mean: null,
    };
  }

  const standardError = Math.sqrt(
    (groupA.variance ?? 0) / Math.max(groupA.sampleCount, 1) +
      (groupB.variance ?? 0) / Math.max(groupB.sampleCount, 1),
  );
  const mean = groupA.mean - groupB.mean;

  return {
    ciHigh: mean + COHORT_HYPOTHESIS_Z_SCORE * standardError,
    ciLow: mean - COHORT_HYPOTHESIS_Z_SCORE * standardError,
    mean,
  };
}

function buildWilsonInterval(successCount, sampleCount) {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) {
    return {
      ciHigh: null,
      ciLow: null,
      rate: null,
      sampleCount: 0,
      successCount: 0,
    };
  }

  const safeSuccessCount = Math.max(
    0,
    Math.min(sampleCount, Number(successCount) || 0),
  );
  const zSquared = COHORT_HYPOTHESIS_Z_SCORE ** 2;
  const denominator = 1 + zSquared / sampleCount;
  const center =
    (safeSuccessCount / sampleCount + zSquared / (2 * sampleCount)) /
    denominator;
  const margin =
    (COHORT_HYPOTHESIS_Z_SCORE / denominator) *
    Math.sqrt(
      (safeSuccessCount / sampleCount) *
        (1 - safeSuccessCount / sampleCount) /
        sampleCount +
        zSquared / (4 * sampleCount ** 2),
    );

  return {
    ciHigh: Math.min(1, center + margin),
    ciLow: Math.max(0, center - margin),
    rate: safeSuccessCount / sampleCount,
    sampleCount,
    successCount: safeSuccessCount,
  };
}

function buildRateDifferenceSummary(groupA, groupB) {
  if (
    !Number.isFinite(groupA?.sampleCount) ||
    groupA.sampleCount <= 0 ||
    !Number.isFinite(groupB?.sampleCount) ||
    groupB.sampleCount <= 0 ||
    groupA.rate == null ||
    groupB.rate == null
  ) {
    return {
      ciHigh: null,
      ciLow: null,
      difference: null,
    };
  }

  const standardError = Math.sqrt(
    (groupA.rate * (1 - groupA.rate)) / groupA.sampleCount +
      (groupB.rate * (1 - groupB.rate)) / groupB.sampleCount,
  );
  const difference = groupA.rate - groupB.rate;

  return {
    ciHigh: difference + COHORT_HYPOTHESIS_Z_SCORE * standardError,
    ciLow: difference - COHORT_HYPOTHESIS_Z_SCORE * standardError,
    difference,
  };
}

function buildCohortRows(rows, selection) {
  const checkpointConfig = getCohortCheckpointConfig(selection.checkpoint);
  const distanceBucket = getCohortDistanceBucket(selection.distanceBucket);
  const side = selection.side ?? MARKET_OUTCOMES.DOWN;
  const checkpoint = checkpointConfig.checkpoint;

  return {
    checkpointConfig,
    distanceBucket,
    rows: rows.filter((row) => {
      const btcDeltaUsd = getBtcDeltaValue(row.summary, checkpoint);

      if (btcDeltaUsd === null) {
        return false;
      }

      const absDeltaUsd = Math.abs(btcDeltaUsd);
      const sideMatches =
        side === MARKET_OUTCOMES.UP ? btcDeltaUsd >= 0 : btcDeltaUsd < 0;

      if (!sideMatches || absDeltaUsd < distanceBucket.minUsd) {
        return false;
      }

      if (distanceBucket.maxUsd == null) {
        return true;
      }

      return absDeltaUsd < distanceBucket.maxUsd;
    }),
  };
}

function buildNumericMetricComparison(cohortRows, winningSide, fieldName) {
  const winnerValues = cohortRows
    .filter((row) => row.summary.resolvedOutcome === winningSide)
    .map((row) => getSummaryNumericField(row.summary, fieldName))
    .filter((value) => value !== null);
  const loserValues = cohortRows
    .filter((row) => row.summary.resolvedOutcome !== winningSide)
    .map((row) => getSummaryNumericField(row.summary, fieldName))
    .filter((value) => value !== null);
  const winners = buildMeanSummary(winnerValues);
  const losers = buildMeanSummary(loserValues);

  return {
    difference: buildMeanDifferenceSummary(winners, losers),
    losers,
    winners,
  };
}

function buildCohortSessionRows(cohortRows, winningSide) {
  return ET_SESSION_BUCKETS.map((session) => {
    const bucketRows = cohortRows.filter((row) => {
      const hour = getEtHour(row.summary.windowStartTs);

      return hour != null && hour >= session.startHour && hour <= session.endHour;
    });
    const lossCount = bucketRows.filter(
      (row) => row.summary.resolvedOutcome !== winningSide,
    ).length;

    return {
      id: session.id,
      label: session.label,
      lossRate: buildWilsonInterval(lossCount, bucketRows.length),
      loserCount: lossCount,
      totalCount: bucketRows.length,
      winnerCount: bucketRows.length - lossCount,
    };
  }).filter((row) => row.totalCount > 0);
}

function buildCohortHourRows(cohortRows, winningSide) {
  return Array.from({ length: 24 }, (_, hour) => {
    const hourRows = cohortRows.filter(
      (row) => getEtHour(row.summary.windowStartTs) === hour,
    );
    const lossCount = hourRows.filter(
      (row) => row.summary.resolvedOutcome !== winningSide,
    ).length;

    return {
      hour,
      label: formatHourLabel(hour),
      lossRate: buildWilsonInterval(lossCount, hourRows.length),
      loserCount: lossCount,
      totalCount: hourRows.length,
      winnerCount: hourRows.length - lossCount,
    };
  }).filter((row) => row.totalCount > 0);
}

function getHypothesisStatus({
  ciHigh,
  ciLow,
  direction,
  groupACount,
  groupBCount,
}) {
  if (
    !Number.isFinite(groupACount) ||
    groupACount < COHORT_HYPOTHESIS_MIN_GROUP_SIZE ||
    !Number.isFinite(groupBCount) ||
    groupBCount < COHORT_HYPOTHESIS_MIN_GROUP_SIZE ||
    ciLow == null ||
    ciHigh == null
  ) {
    return "underpowered";
  }

  if (direction === "positive") {
    return ciLow > 0 ? "supported" : "not_supported";
  }

  return ciHigh < 0 ? "supported" : "not_supported";
}

function buildMedianSplitHypothesis({
  cohortRows,
  fieldName,
  id,
  label,
  winningSide,
}) {
  const values = cohortRows
    .map((row) => getSummaryNumericField(row.summary, fieldName))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const splitValue = getPercentile(values, 0.5);

  if (splitValue === null) {
    return {
      difference: { ciHigh: null, ciLow: null, difference: null },
      groupA: { ciHigh: null, ciLow: null, rate: null, sampleCount: 0, successCount: 0 },
      groupALabel: "High",
      groupB: { ciHigh: null, ciLow: null, rate: null, sampleCount: 0, successCount: 0 },
      groupBLabel: "Low",
      id,
      label,
      splitValue: null,
      status: "underpowered",
    };
  }

  const highRows = cohortRows.filter(
    (row) => {
      const value = getSummaryNumericField(row.summary, fieldName);

      return value !== null && value >= splitValue;
    },
  );
  const lowRows = cohortRows.filter((row) => {
    const value = getSummaryNumericField(row.summary, fieldName);

    return value !== null && value < splitValue;
  });
  const highWinRate = buildWilsonInterval(
    highRows.filter((row) => row.summary.resolvedOutcome === winningSide).length,
    highRows.length,
  );
  const lowWinRate = buildWilsonInterval(
    lowRows.filter((row) => row.summary.resolvedOutcome === winningSide).length,
    lowRows.length,
  );
  const difference = buildRateDifferenceSummary(highWinRate, lowWinRate);

  return {
    difference,
    groupA: highWinRate,
    groupALabel: "High",
    groupB: lowWinRate,
    groupBLabel: "Low",
    id,
    label,
    splitValue,
    status: getHypothesisStatus({
      ciHigh: difference.ciHigh,
      ciLow: difference.ciLow,
      direction: "negative",
      groupACount: highRows.length,
      groupBCount: lowRows.length,
    }),
  };
}

function buildMomentumHypothesis({
  cohortRows,
  fieldName,
  id,
  side,
}) {
  const positiveRows = cohortRows.filter((row) => {
    const value = getSummaryNumericField(row.summary, fieldName);

    return value !== null && value > 0;
  });
  const flatOrNegativeRows = cohortRows.filter((row) => {
    const value = getSummaryNumericField(row.summary, fieldName);

    return value !== null && value <= 0;
  });
  const positiveWinRate = buildWilsonInterval(
    positiveRows.filter((row) => row.summary.resolvedOutcome === side).length,
    positiveRows.length,
  );
  const flatOrNegativeWinRate = buildWilsonInterval(
    flatOrNegativeRows.filter((row) => row.summary.resolvedOutcome === side).length,
    flatOrNegativeRows.length,
  );
  const difference = buildRateDifferenceSummary(
    positiveWinRate,
    flatOrNegativeWinRate,
  );
  const direction = side === MARKET_OUTCOMES.DOWN ? "negative" : "positive";

  return {
    difference,
    groupA: positiveWinRate,
    groupALabel: "Positive momentum",
    groupB: flatOrNegativeWinRate,
    groupBLabel: "Flat or negative momentum",
    id,
    label:
      side === MARKET_OUTCOMES.DOWN
        ? "Positive momentum into the checkpoint lowers Down reliability."
        : "Positive momentum into the checkpoint raises Up reliability.",
    splitValue: 0,
    status: getHypothesisStatus({
      ciHigh: difference.ciHigh,
      ciLow: difference.ciLow,
      direction,
      groupACount: positiveRows.length,
      groupBCount: flatOrNegativeRows.length,
    }),
  };
}

function buildMorningSessionHypothesis({ cohortRows, id, winningSide }) {
  const morningRows = cohortRows.filter((row) => {
    const hour = getEtHour(row.summary.windowStartTs);

    return hour != null && hour >= 6 && hour <= 11;
  });
  const nonMorningRows = cohortRows.filter((row) => {
    const hour = getEtHour(row.summary.windowStartTs);

    return hour != null && (hour < 6 || hour > 11);
  });
  const morningLossRate = buildWilsonInterval(
    morningRows.filter((row) => row.summary.resolvedOutcome !== winningSide).length,
    morningRows.length,
  );
  const nonMorningLossRate = buildWilsonInterval(
    nonMorningRows.filter((row) => row.summary.resolvedOutcome !== winningSide).length,
    nonMorningRows.length,
  );
  const difference = buildRateDifferenceSummary(
    morningLossRate,
    nonMorningLossRate,
  );

  return {
    difference,
    groupA: morningLossRate,
    groupALabel: "Morning ET",
    groupB: nonMorningLossRate,
    groupBLabel: "All other sessions",
    id,
    label: "Failures cluster in Morning ET more than the rest of the day.",
    splitValue: null,
    status: getHypothesisStatus({
      ciHigh: difference.ciHigh,
      ciLow: difference.ciLow,
      direction: "positive",
      groupACount: morningRows.length,
      groupBCount: nonMorningRows.length,
    }),
  };
}

function buildCohortHypotheses(cohortRows, checkpointConfig, winningSide) {
  return [
    buildMedianSplitHypothesis({
      cohortRows,
      fieldName: checkpointConfig.btcPathLengthField,
      id: "h1",
      label: "Higher BTC path length before the checkpoint lowers reliability.",
      winningSide,
    }),
    buildMedianSplitHypothesis({
      cohortRows,
      fieldName: checkpointConfig.anchorCrossCountField,
      id: "h2",
      label: "Higher anchor cross count before the checkpoint lowers reliability.",
      winningSide,
    }),
    buildMomentumHypothesis({
      cohortRows,
      fieldName: checkpointConfig.momentumField,
      id: "h3",
      side: winningSide,
    }),
    buildMorningSessionHypothesis({
      cohortRows,
      id: "h4",
      winningSide,
    }),
  ];
}

function buildCohortDrilldown(rows, selection) {
  const side = selection.side ?? MARKET_OUTCOMES.DOWN;
  const { checkpointConfig, distanceBucket, rows: cohortRows } = buildCohortRows(
    rows,
    selection,
  );
  const winnerRows = cohortRows.filter(
    (row) => row.summary.resolvedOutcome === side,
  );
  const loserRows = cohortRows.filter(
    (row) => row.summary.resolvedOutcome !== side,
  );
  const cohortWinRate = buildWilsonInterval(winnerRows.length, cohortRows.length);
  const cohortLossRate = buildWilsonInterval(loserRows.length, cohortRows.length);
  const numericMetrics = [
    {
      fieldName: checkpointConfig.btcPathLengthField,
      format: "btcUsd",
      id: "btcPathLength",
      label: "BTC path length to checkpoint",
    },
    {
      fieldName: checkpointConfig.anchorCrossCountField,
      format: "count",
      id: "anchorCrossCount",
      label: "Anchor crossings to checkpoint",
    },
    {
      fieldName: checkpointConfig.momentumField,
      format: "signedBtcUsd",
      id: "momentumIntoCheckpoint",
      label: "Momentum into checkpoint (30s)",
    },
    {
      fieldName: checkpointConfig.btcRangeField,
      format: "btcUsd",
      id: "btcRange",
      label: "BTC range to checkpoint",
    },
    {
      fieldName: checkpointConfig.maxAdverseExcursionField,
      format: "btcUsd",
      id: "maxAdverseExcursion",
      label: "Max adverse excursion after checkpoint",
    },
    {
      fieldName: checkpointConfig.residualPathLengthField,
      format: "btcUsd",
      id: "residualPathLength",
      label: "Residual BTC path length after checkpoint",
    },
    {
      fieldName: checkpointConfig.anchorCrossCountAfterField,
      format: "count",
      id: "anchorCrossCountAfter",
      label: "Anchor crossings after checkpoint",
    },
    {
      fieldName: checkpointConfig.timeOnWinningSideShareAfterField,
      format: "share",
      id: "timeOnWinningSideShareAfter",
      label: "Time on eventual winning side after checkpoint",
    },
  ].map((metric) => ({
    ...metric,
    ...buildNumericMetricComparison(cohortRows, side, metric.fieldName),
  }));

  return {
    checkpoint: checkpointConfig.id,
    checkpointLabel: checkpointConfig.checkpoint.label,
    checkpointSecond: checkpointConfig.second,
    distanceBucketId: distanceBucket.id,
    distanceBucketLabel: distanceBucket.label,
    hourRows: buildCohortHourRows(cohortRows, side),
    hypotheses: buildCohortHypotheses(cohortRows, checkpointConfig, side),
    lossRate: cohortLossRate,
    loserCount: loserRows.length,
    numericMetrics,
    sampleCount: cohortRows.length,
    selectionSide: side,
    sessionRows: buildCohortSessionRows(cohortRows, side),
    winRate: cohortWinRate,
    winnerCount: winnerRows.length,
  };
}

export function buildCohortDrilldownReport({
  summaries,
  markets,
  filters,
  selection,
  nowTs = Date.now(),
}) {
  const rows = buildFilteredRows({
    filters,
    markets: Array.isArray(markets) ? markets : [],
    nowTs,
    summaries: Array.isArray(summaries) ? summaries : [],
  });

  return buildCohortDrilldown(rows, selection);
}

export function buildAnalyticsReport({
  summaries,
  markets,
  filters,
  nowTs = Date.now(),
}) {
  const minSampleSize = Math.max(1, Number(filters.minSampleSize) || 1);
  const rows = buildFilteredRows({
    filters,
    markets: Array.isArray(markets) ? markets : [],
    nowTs,
    summaries: Array.isArray(summaries) ? summaries : [],
  });
  const btcBestSignal = buildBtcBestSignalCards(rows, minSampleSize);
  const btcMarketEdge = buildBtcMarketEdgeCards(rows, minSampleSize);
  const btcSignalQualityEdge = buildBtcSignalQualityEdgeCards(
    rows,
    minSampleSize,
  );
  const btcCandidateRules = buildBtcCandidateRules(rows, minSampleSize);

  return {
    appliedFilters: {
      dateRange: filters.dateRange,
      minSampleSize,
      quality: filters.quality,
    },
    boundaryMoveBuckets: buildBoundaryMoveBuckets(rows),
    boundaryMoveByHour: buildBoundaryMoveByHour(rows, minSampleSize),
    boundaryMoveBySession: buildBoundaryMoveBySession(rows, minSampleSize),
    boundaryMoveHeadline: buildBoundaryMoveHeadline(rows),
    boundaryMoveOverview: buildBoundaryMoveOverview(rows),
    boundaryMoveThresholdStats: buildBoundaryMoveThresholdStats(rows, minSampleSize),
    btcBestSignalCards: btcBestSignal.cards,
    btcBestSignalMinSamples: btcBestSignal.minSampleSize,
    btcMarketEdgeBucketRows: buildBtcMarketEdgeBucketRows(rows, minSampleSize),
    btcMarketEdgeCards: btcMarketEdge.cards,
    btcMarketEdgeMinSamples: btcMarketEdge.minSampleSize,
    btcSignalQualityEdgeBucketRows: buildBtcSignalQualityEdgeRows(
      rows,
      minSampleSize,
    ),
    btcSignalQualityEdgeCards: btcSignalQualityEdge.cards,
    btcSignalQualityEdgeMinSamples: btcSignalQualityEdge.minSampleSize,
    btcCandidateRules: btcCandidateRules.rows,
    btcCandidateRulesMinEdge: btcCandidateRules.minEdge,
    btcCandidateRulesMinSamples: btcCandidateRules.minSampleSize,
    btcCandidateRulesMinWinRate: btcCandidateRules.minWinRate,
    btcWinningSideCadenceMix: buildBtcWinningSideCadenceMix(rows),
    btcConditionalReliabilityBucketRows: buildBtcConditionalReliabilityBucketRows(
      rows,
      minSampleSize,
    ),
    btcConditionalReliabilityRows: buildBtcConditionalReliabilityRows(rows, minSampleSize),
    btcWinningSideCheckpointStats: buildBtcWinningSideCheckpointStats(rows, minSampleSize),
    btcWinningSideDistanceStats: buildBtcWinningSideDistanceStats(rows, minSampleSize),
    btcWinningSideHeadline: buildBtcWinningSideHeadline(rows),
    btcWinningSideOutcomeSplit: buildBtcWinningSideOutcomeSplit(rows, minSampleSize),
    btcWinningSideOverview: buildBtcWinningSideOverview(rows),
    calibrationRows: buildCalibrationRows(rows, minSampleSize),
    crossingDistributions: buildCrossingDistributions(rows),
    headlineFinding: buildHeadlineFinding(rows),
    overview: buildOverview(rows),
    thresholdStats: buildThresholdStats(rows, minSampleSize),
  };
}
