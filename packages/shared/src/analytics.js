import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";

export const ANALYTICS_CHECKPOINTS = [
  {
    downField: "downDisplayedAtT15",
    id: "t15",
    label: "T+15",
    upField: "upDisplayedAtT15",
  },
  {
    downField: "downDisplayedAtT30",
    id: "t30",
    label: "T+30",
    upField: "upDisplayedAtT30",
  },
  {
    downField: "downDisplayedAtT60",
    id: "t60",
    label: "T+60",
    upField: "upDisplayedAtT60",
  },
  {
    downField: "downDisplayedAtT120",
    id: "t120",
    label: "T+120",
    upField: "upDisplayedAtT120",
  },
  {
    downField: "downDisplayedAtT240",
    id: "t240",
    label: "T+240",
    upField: "upDisplayedAtT240",
  },
  {
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
const BTC_LOCK_CHECKPOINTS = [
  { label: "T+15", second: 15 },
  { label: "T+30", second: 30 },
  { label: "T+60", second: 60 },
  { label: "T+120", second: 120 },
  { label: "T+240", second: 240 },
  { label: "T+295", second: 295 },
];
const BTC_LOCK_HEADLINE_SECOND = 120;
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
        btcSecureSecond: toFiniteNumber(summary.firstBtcSecureSecond),
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

function getLockedRows(rows) {
  return rows.filter((row) => row.btcSecureSecond !== null);
}

function countRowsWithFlag(rows, target) {
  return rows.filter((row) => row.qualityFlags.includes(target)).length;
}

function buildBtcLockOverview(rows) {
  const lockedRows = getLockedRows(rows);
  const lockedSeconds = lockedRows
    .map((row) => row.btcSecureSecond)
    .sort((a, b) => a - b);

  return {
    anchorMismatchCount: countRowsWithFlag(rows, "btc_secure_end_off_anchor_side"),
    conflictCount: countRowsWithFlag(rows, "btc_path_conflicts_resolved"),
    lockedCount: lockedRows.length,
    medianSecureSecond: getPercentile(lockedSeconds, 0.5),
    missingAnchorCount: countRowsWithFlag(rows, "btc_secure_missing_anchor"),
    noBtcDataCount: countRowsWithFlag(rows, "btc_secure_no_btc_data"),
    p25SecureSecond: getPercentile(lockedSeconds, 0.25),
    p75SecureSecond: getPercentile(lockedSeconds, 0.75),
    sampleCount: rows.length,
    sparseTailCount: countRowsWithFlag(rows, "btc_secure_sparse_tail"),
    unsecuredCount: rows.length - lockedRows.length,
  };
}

function buildBtcLockCheckpointStats(rows, minSampleSize) {
  if (rows.length < minSampleSize) {
    return [];
  }

  return BTC_LOCK_CHECKPOINTS.map((checkpoint) => {
    const lockedCount = rows.filter(
      (row) =>
        row.btcSecureSecond !== null &&
        row.btcSecureSecond <= checkpoint.second,
    ).length;

    return {
      checkpointLabel: checkpoint.label,
      checkpointSecond: checkpoint.second,
      lockedCount,
      sampleCount: rows.length,
      share: rows.length > 0 ? lockedCount / rows.length : null,
    };
  });
}

function buildBtcLockOutcomeSplit(rows, minSampleSize) {
  return SIDE_ORDER.map((side) => {
    const sideRows = rows.filter((row) => row.summary.resolvedOutcome === side);
    const lockedRows = getLockedRows(sideRows);
    const lockedSeconds = lockedRows
      .map((row) => row.btcSecureSecond)
      .sort((a, b) => a - b);

    return {
      lockedCount: lockedRows.length,
      medianSecureSecond: getPercentile(lockedSeconds, 0.5),
      p75SecureSecond: getPercentile(lockedSeconds, 0.75),
      sampleCount: sideRows.length,
      share: sideRows.length > 0 ? lockedRows.length / sideRows.length : null,
      side,
    };
  }).filter((row) => row.sampleCount >= minSampleSize);
}

function buildBtcLockCadenceMix(rows) {
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

function buildBtcLockHeadline(rows) {
  const checkpoint = BTC_LOCK_CHECKPOINTS.find(
    (item) => item.second === BTC_LOCK_HEADLINE_SECOND,
  );
  const lockedCount = rows.filter(
    (row) =>
      row.btcSecureSecond !== null &&
      row.btcSecureSecond <= BTC_LOCK_HEADLINE_SECOND,
  ).length;

  return {
    checkpointLabel: checkpoint.label,
    checkpointSecond: checkpoint.second,
    lockedCount,
    sampleCount: rows.length,
    share: rows.length > 0 ? lockedCount / rows.length : null,
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
    btcLockCadenceMix: buildBtcLockCadenceMix(rows),
    btcLockCheckpointStats: buildBtcLockCheckpointStats(rows, minSampleSize),
    btcLockHeadline: buildBtcLockHeadline(rows),
    btcLockOutcomeSplit: buildBtcLockOutcomeSplit(rows, minSampleSize),
    btcLockOverview: buildBtcLockOverview(rows),
    calibrationRows: buildCalibrationRows(rows, minSampleSize),
    crossingDistributions: buildCrossingDistributions(rows),
    headlineFinding: buildHeadlineFinding(rows),
    overview: buildOverview(rows),
    thresholdStats: buildThresholdStats(rows, minSampleSize),
  };
}
