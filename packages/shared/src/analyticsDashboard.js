import {
  CHECKPOINT_SECONDS,
  STALE_BTC_THRESHOLD_MS,
} from "./marketAnalytics.js";

export const DASHBOARD_ROLLUP_KEY = "btc-5m-analytics-dashboard";
export const DASHBOARD_ROLLUP_VERSION = 5;
export const SUPPORT_FLOOR = 50;
export const COLOR_SUPPORT_FLOOR = 100;
export const DIAGNOSTIC_SUPPORT_FLOOR = 30;
export const MIN_DURABILITY_PRIOR_N = 50;
export const DURABILITY_DENOMINATOR_FLOOR_BPS = 0.5;
export const MAX_REFERENCE_VALUES = 8000;
export const TARGET_PATH_RISK_CHECKPOINTS = [180, 200, 210, 220, 240];
export const DISTANCE_BUCKETS = [
  { id: "le_0_5", label: "<=0.5 bps", max: 0.5 },
  { id: "0_5_1", label: "0.5-1 bps", min: 0.5, max: 1 },
  { id: "1_2", label: "1-2 bps", min: 1, max: 2 },
  { id: "2_3", label: "2-3 bps", min: 2, max: 3 },
  { id: "3_4", label: "3-4 bps", min: 3, max: 4 },
  { id: "4_5", label: "4-5 bps", min: 4, max: 5 },
  { id: "5_7_5", label: "5-7.5 bps", min: 5, max: 7.5 },
  { id: "7_5_10", label: "7.5-10 bps", min: 7.5, max: 10 },
  { id: "gt_10", label: ">10 bps", min: 10 },
];
export const STABILITY_HEATMAP_METRICS = [
  {
    id: "stableLeaderWinRate",
    label: "Stable win",
    positive: true,
    valueField: "stableLeaderWinRate",
  },
  {
    id: "noisyLeaderWinRate",
    label: "Noisy win",
    positive: false,
    valueField: "noisyLeaderWinRate",
  },
  {
    id: "recoveredLeaderWinRate",
    label: "Recovered win",
    positive: false,
    valueField: "recoveredLeaderWinRate",
  },
  {
    id: "fragileWinRate",
    label: "Fragile win",
    positive: false,
    valueField: "fragileWinRate",
  },
  {
    id: "flipLossRate",
    label: "Flip loss",
    positive: false,
    valueField: "flipLossRate",
  },
  {
    id: "pathRiskRate",
    label: "Path risk",
    positive: false,
    valueField: "pathRiskRate",
  },
  {
    id: "noDecisionAtCheckpointRate",
    label: "No decision",
    positive: false,
    valueField: "noDecisionAtCheckpointRate",
  },
  {
    id: "unknownPathRate",
    label: "Unknown path",
    positive: false,
    valueField: "unknownPathRate",
  },
  {
    id: "noiseTouchRate",
    label: "Post-checkpoint noise touch",
    positive: false,
    valueField: "noiseTouchRate",
  },
  {
    id: "medianMaxAdverseBps",
    label: "Median adverse bps",
    positive: false,
    valueField: "medianMaxAdverseBps",
  },
];
export const LEAD_AGE_BUCKETS = [
  { id: "lt_10", label: "<10s", max: 10 },
  { id: "10_30", label: "10-30s", min: 10, max: 30 },
  { id: "30_60", label: "30-60s", min: 30, max: 60 },
  { id: "60_120", label: "60-120s", min: 60, max: 120 },
  { id: "gte_120", label: "120s+", min: 120 },
];
export const CHOP_BUCKETS = [
  { id: "low", label: "Low chop" },
  { id: "medium", label: "Medium chop" },
  { id: "high", label: "High chop" },
  { id: "unknown", label: "Unknown" },
];
export const MOMENTUM_AGREEMENT_BUCKETS = [
  { id: "agrees", label: "Agrees" },
  { id: "disagrees", label: "Disagrees" },
  { id: "flat", label: "Flat" },
  { id: "unknown", label: "Unknown" },
];
export const DURABILITY_BUCKETS = [
  { id: "lt_1", label: "<1x", max: 1 },
  { id: "1_2", label: "1-2x", min: 1, max: 2 },
  { id: "2_3", label: "2-3x", min: 2, max: 3 },
  { id: "gte_3", label: "3x+", min: 3 },
  { id: "unknown", label: "Unknown" },
];
export const PRE_PATH_SHAPES = [
  { id: "clean-lock", label: "Clean lock" },
  { id: "recent-lock", label: "Recent lock" },
  { id: "multi-flip-chop", label: "Multi-flip chop" },
  { id: "near-line-heavy", label: "Near-line heavy" },
  { id: "unresolved", label: "Unresolved" },
  { id: "unknown", label: "Unknown" },
];
export const PATH_TYPES = [
  "early-lock",
  "mid-lock",
  "late-lock",
  "final-second-flip",
  "chop",
  "near-line-unresolved",
  "unknown",
];

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function toPercentCounts(counts, total) {
  return Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [
      key,
      {
        count,
        percent: ratio(count, total),
      },
    ]),
  );
}

function median(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

// Nearest-rank percentile for observed outcome tails such as p90 adverse movement.
function percentile(values, p) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );

  return sorted[index];
}

function sortedFinite(values) {
  return values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
}

function compactReferenceValues(sortedValues) {
  if (!Array.isArray(sortedValues) || sortedValues.length <= MAX_REFERENCE_VALUES) {
    return sortedValues;
  }

  return Array.from({ length: MAX_REFERENCE_VALUES }, (_value, index) => {
    const sourceIndex = Math.round(
      (index * (sortedValues.length - 1)) / (MAX_REFERENCE_VALUES - 1),
    );

    return sortedValues[sourceIndex];
  });
}

// Interpolated percentile for bucket thresholds, where stable cut points matter.
function interpolatedPercentile(values, p) {
  const sorted = sortedFinite(values);

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = Math.min(
    sorted.length - 1,
    Math.max(0, (sorted.length - 1) * p),
  );
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = position - lowerIndex;

  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function isCleanAnalytics(row) {
  return (
    row.outcomeSource === "official" &&
    row.priceToBeat !== null &&
    row.completeFreshCheckpoints
  );
}

function getCleanAnalyticsSlugSet(analyticsRows) {
  return new Set(
    analyticsRows
      .filter(isCleanAnalytics)
      .map((row) => row.marketSlug)
      .filter(Boolean),
  );
}

function getCheckpoint(row, checkpointSecond) {
  return row?.checkpoints?.find(
    (checkpoint) => checkpoint.checkpointSecond === checkpointSecond,
  );
}

function getDayKey(ts) {
  if (!Number.isFinite(ts)) {
    return "unknown";
  }

  return new Date(ts).toISOString().slice(0, 10);
}

export function getDistanceBucket(distanceToBeatBps) {
  if (!Number.isFinite(distanceToBeatBps)) {
    return null;
  }

  const absoluteDistance = Math.abs(distanceToBeatBps);

  for (const bucket of DISTANCE_BUCKETS) {
    const aboveMin = bucket.min == null || absoluteDistance > bucket.min;
    const atOrBelowMax = bucket.max == null || absoluteDistance <= bucket.max;

    if (aboveMin && atOrBelowMax) {
      return bucket;
    }
  }

  return DISTANCE_BUCKETS[DISTANCE_BUCKETS.length - 1];
}

function getLeadAgeBucket(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  for (const bucket of LEAD_AGE_BUCKETS) {
    const aboveMin = bucket.min == null || seconds >= bucket.min;
    const belowMax = bucket.max == null || seconds < bucket.max;

    if (aboveMin && belowMax) {
      return bucket;
    }
  }

  return LEAD_AGE_BUCKETS[LEAD_AGE_BUCKETS.length - 1];
}

function getDurabilityBucket(value) {
  if (!Number.isFinite(value)) {
    return DURABILITY_BUCKETS[DURABILITY_BUCKETS.length - 1];
  }

  for (const bucket of DURABILITY_BUCKETS) {
    if (bucket.id === "unknown") {
      continue;
    }

    const aboveMin = bucket.min == null || value >= bucket.min;
    const belowMax = bucket.max == null || value < bucket.max;

    if (aboveMin && belowMax) {
      return bucket;
    }
  }

  return DURABILITY_BUCKETS[DURABILITY_BUCKETS.length - 1];
}

function isTargetCheckpoint(checkpointSecond) {
  return TARGET_PATH_RISK_CHECKPOINTS.includes(checkpointSecond);
}

function getDiagnosticDistanceBuckets() {
  return DISTANCE_BUCKETS.filter((bucket) => bucket.id !== "le_0_5");
}

function getRowCheckpointKey(row, checkpointSecond) {
  return `${row.marketSlug}:${checkpointSecond}`;
}

function getMomentumAgreementBucket(checkpoint) {
  if (checkpoint?.momentum30sAgreesWithLeader === true) {
    return MOMENTUM_AGREEMENT_BUCKETS[0];
  }

  if (checkpoint?.momentum30sAgreesWithLeader === false) {
    return MOMENTUM_AGREEMENT_BUCKETS[1];
  }

  if (checkpoint?.momentum30sSide === "flat") {
    return MOMENTUM_AGREEMENT_BUCKETS[2];
  }

  return MOMENTUM_AGREEMENT_BUCKETS[3];
}

function getPostMaxAdverseDrawdownBps(checkpoint) {
  if (
    !Number.isFinite(checkpoint?.distanceBps) ||
    !Number.isFinite(checkpoint?.postMinSignedMarginBps) ||
    checkpoint?.postPathGood !== true
  ) {
    return null;
  }

  return Math.max(0, Math.abs(checkpoint.distanceBps) - checkpoint.postMinSignedMarginBps);
}

function preFlipRatePerMinute(checkpoint) {
  // Diagnostic rows require >=95% pre-T coverage, so checkpoint length is a stable denominator.
  return Number.isFinite(checkpoint?.preFlipCount) &&
    Number.isFinite(checkpoint?.checkpointSecond) &&
    checkpoint.checkpointSecond > 0
    ? checkpoint.preFlipCount / (checkpoint.checkpointSecond / 60)
    : null;
}

function preNearLinePct(checkpoint) {
  return Number.isFinite(checkpoint?.preNearLineSeconds) &&
    Number.isFinite(checkpoint?.checkpointSecond) &&
    checkpoint.checkpointSecond > 0
    ? checkpoint.preNearLineSeconds / checkpoint.checkpointSecond
    : null;
}

function preDirectionChangeRatePerMinute(checkpoint) {
  return Number.isFinite(checkpoint?.preDirectionChangeCount) &&
    Number.isFinite(checkpoint?.checkpointSecond) &&
    checkpoint.checkpointSecond > 0
    ? checkpoint.preDirectionChangeCount / (checkpoint.checkpointSecond / 60)
    : null;
}

function withSupport(values) {
  const n = values.length;

  return {
    N: n,
    p50: median(values),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
  };
}

function buildCheckpointBaseline(cleanRows) {
  return CHECKPOINT_SECONDS.map((checkpointSecond) => {
    let n = 0;
    let currentLeaderWins = 0;
    let upWins = 0;

    for (const row of cleanRows) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint || checkpoint.didCurrentLeaderWin === null) {
        continue;
      }

      n += 1;
      currentLeaderWins += checkpoint.didCurrentLeaderWin ? 1 : 0;
      upWins += row.resolvedOutcome === "up" ? 1 : 0;
    }

    const currentLeaderWinRate = ratio(currentLeaderWins, n);
    const upRate = ratio(upWins, n);

    return {
      N: n,
      checkpointSecond,
      currentLeaderWinRate,
      liftVsUpRate:
        currentLeaderWinRate === null || upRate === null
          ? null
          : currentLeaderWinRate - upRate,
      upRate,
    };
  });
}

function buildDistanceCells(cleanRows, baselines) {
  const baselineByCheckpoint = new Map(
    baselines.map((baseline) => [
      baseline.checkpointSecond,
      baseline.currentLeaderWinRate,
    ]),
  );
  const cells = [];

  for (const checkpointSecond of CHECKPOINT_SECONDS) {
    for (const bucket of DISTANCE_BUCKETS) {
      let n = 0;
      let currentLeaderWins = 0;

      for (const row of cleanRows) {
        const checkpoint = getCheckpoint(row, checkpointSecond);

        if (!checkpoint || checkpoint.didCurrentLeaderWin === null) {
          continue;
        }

        const checkpointBucket = getDistanceBucket(checkpoint.distanceToBeatBps);

        if (checkpointBucket?.id !== bucket.id) {
          continue;
        }

        n += 1;
        currentLeaderWins += checkpoint.didCurrentLeaderWin ? 1 : 0;
      }

      const hidden = n < SUPPORT_FLOOR;
      const leaderWinRate = hidden ? null : ratio(currentLeaderWins, n);
      const baselineLeaderWinRateAtT =
        baselineByCheckpoint.get(checkpointSecond) ?? null;

      cells.push({
        N: n,
        baselineLeaderWinRateAtT,
        checkpointSecond,
        colorEligible: n >= COLOR_SUPPORT_FLOOR,
        distanceBucket: bucket.id,
        distanceBucketLabel: bucket.label,
        hidden,
        leaderWinRate,
        lift:
          leaderWinRate === null || baselineLeaderWinRateAtT === null
            ? null
            : leaderWinRate - baselineLeaderWinRateAtT,
      });
    }
  }

  return cells;
}

function getBpsReferencePrice(cleanRows) {
  let latestRow = null;

  for (const row of cleanRows) {
    if (!Number.isFinite(row.priceToBeat)) {
      continue;
    }

    if (
      !latestRow ||
      (Number.isFinite(row.windowStartTs) &&
        row.windowStartTs > latestRow.windowStartTs)
    ) {
      latestRow = row;
    }
  }

  return latestRow?.priceToBeat ?? null;
}

function buildDatasetHealth(analyticsRows, stabilityRows) {
  const cleanAnalyticsSlugs = getCleanAnalyticsSlugSet(analyticsRows);
  const summaryQualityCounts = emptyCounts(["good", "partial", "gap", "unknown"]);
  const priceToBeatSourceCounts = emptyCounts(["official", "derived", "missing"]);
  const checkpointFreshness = CHECKPOINT_SECONDS.map((checkpointSecond) => ({
    checkpointSecond,
    missingBtc: 0,
    staleBtc: 0,
  }));
  const cleanByDay = {};
  let cleanCount = 0;
  let cleanUpCount = 0;
  let completeFreshCheckpoints = 0;
  let excluded = 0;
  let resolved = 0;
  let resolvedOfficial = 0;
  let resolvedDerivedOnly = 0;

  for (const row of analyticsRows) {
    increment(summaryQualityCounts, row.summaryDataQuality ?? "unknown");
    increment(priceToBeatSourceCounts, row.priceToBeatSource ?? "missing");

    if (row.completeFreshCheckpoints) {
      completeFreshCheckpoints += 1;
    }

    if (Array.isArray(row.excludedReasons) && row.excludedReasons.length > 0) {
      excluded += 1;
    }

    if (row.resolvedOutcome !== null) {
      resolved += 1;
    }

    if (row.outcomeSource === "official") {
      resolvedOfficial += 1;
    }

    if (row.outcomeSource === "derived") {
      resolvedDerivedOnly += 1;
    }

    for (const checkpointFreshnessRow of checkpointFreshness) {
      const checkpoint = getCheckpoint(row, checkpointFreshnessRow.checkpointSecond);

      if (!checkpoint || checkpoint.btcAtCheckpoint === null) {
        checkpointFreshnessRow.missingBtc += 1;
      } else if (
        checkpoint.btcTickAgeMs !== null &&
        checkpoint.btcTickAgeMs > STALE_BTC_THRESHOLD_MS
      ) {
        checkpointFreshnessRow.staleBtc += 1;
      }
    }

    if (isCleanAnalytics(row)) {
      cleanCount += 1;
      cleanUpCount += row.resolvedOutcome === "up" ? 1 : 0;
      increment(cleanByDay, getDayKey(row.windowStartTs));
    }
  }

  const cleanStabilityCount = stabilityRows.filter((row) =>
    isCleanStability(row, cleanAnalyticsSlugs),
  ).length;

  return {
    baseRates: {
      cleanByDay: Object.entries(cleanByDay)
        .map(([day, count]) => ({ count, day }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      cleanCount,
      downRate: ratio(cleanCount - cleanUpCount, cleanCount),
      upRate: ratio(cleanUpCount, cleanCount),
    },
    cohortFunnel: {
      analyticsRows: analyticsRows.length,
      cleanAnalyticsCount: cleanCount,
      cleanStabilityCount,
      cleanStabilityDelta: cleanStabilityCount - cleanCount,
      excluded,
      resolved,
      resolvedDerivedOnly,
      resolvedOfficial,
      stabilityRows: stabilityRows.length,
    },
    freshness: {
      completeFreshCheckpoints,
      perCheckpoint: checkpointFreshness,
      staleBtcThresholdMs: STALE_BTC_THRESHOLD_MS,
    },
    priceToBeatSource: toPercentCounts(
      priceToBeatSourceCounts,
      analyticsRows.length,
    ),
    summaryDataQuality: toPercentCounts(summaryQualityCounts, analyticsRows.length),
  };
}

function buildLeaderAndDistanceReport(analyticsRows) {
  const cleanRows = analyticsRows.filter(isCleanAnalytics);
  const byCheckpoint = buildCheckpointBaseline(cleanRows);

  return {
    bpsReferencePrice: getBpsReferencePrice(cleanRows),
    byCheckpoint,
    byCheckpointAndDistance: buildDistanceCells(cleanRows, byCheckpoint),
    cleanCount: cleanRows.length,
    distanceBuckets: DISTANCE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
    })),
    support: {
      colorFloor: COLOR_SUPPORT_FLOOR,
      floor: SUPPORT_FLOOR,
    },
  };
}

function isCleanStability(row, cleanAnalyticsSlugs) {
  return (
    cleanAnalyticsSlugs.has(row.marketSlug) &&
    row.resolvedOutcome !== null &&
    row.priceToBeat !== null &&
    Array.isArray(row.checkpoints)
  );
}

function buildStabilityByCheckpoint(stabilityRows, baseRows) {
  const baseByCheckpoint = new Map(
    baseRows.map((row) => [row.checkpointSecond, row]),
  );

  return CHECKPOINT_SECONDS.map((checkpointSecond) => {
    let n = 0;
    let stable = 0;
    let noisy = 0;
    let recovered = 0;
    let flipLoss = 0;
    let anyFlipAfterT = 0;
    let noDecisionAtCheckpoint = 0;
    let unknownPath = 0;
    let leaderWins = 0;
    const adverse = [];

    for (const row of stabilityRows) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      n += 1;
      const noDecision =
        checkpoint.checkpointInNoise || checkpoint.leaderWonAtClose === null;

      leaderWins += !noDecision && checkpoint.leaderWonAtClose ? 1 : 0;
      stable += checkpoint.stableLeaderWin ? 1 : 0;
      noisy += checkpoint.noisyLeaderWin ? 1 : 0;
      recovered += checkpoint.recoveredLeaderWin ? 1 : 0;
      flipLoss += checkpoint.flipLoss ? 1 : 0;
      anyFlipAfterT += checkpoint.postAnyHardFlip ? 1 : 0;
      noDecisionAtCheckpoint += noDecision ? 1 : 0;
      unknownPath += checkpoint.unknownPath ? 1 : 0;

      if (Number.isFinite(checkpoint.postMaxAdverseBps)) {
        adverse.push(checkpoint.postMaxAdverseBps);
      }
    }

    const fragileWin = noisy + recovered;
    const pathRisk = flipLoss + noDecisionAtCheckpoint + unknownPath;
    const leaderEligibleN = n - noDecisionAtCheckpoint;
    const leaderWinRate = ratio(leaderWins, leaderEligibleN);
    const base = baseByCheckpoint.get(checkpointSecond);

    return {
      N: n,
      anyFlipAfterTRate: ratio(anyFlipAfterT, n),
      checkpointSecond,
      flipLossRate: ratio(flipLoss, n),
      fragileWinRate: ratio(fragileWin, n),
      leaderEligibleN,
      leaderWinRate,
      liftVsCleanUpRate:
        leaderWinRate === null || base?.upRate == null
          ? null
          : leaderWinRate - base.upRate,
      medianMaxAdverseBps: median(adverse),
      noDecisionAtCheckpointRate: ratio(noDecisionAtCheckpoint, n),
      noisyLeaderWinRate: ratio(noisy, n),
      pathRiskRate: ratio(pathRisk, n),
      recoveredLeaderWinRate: ratio(recovered, n),
      stableLeaderWinRate: ratio(stable, n),
      unknownPathRate: ratio(unknownPath, n),
    };
  });
}

function summarizeStabilityCells(rows, checkpointSecond, bucket, metricRows) {
  let n = 0;
  let stable = 0;
  let noisy = 0;
  let recovered = 0;
  let flipLoss = 0;
  let noiseTouch = 0;
  let anyFlipAfterT = 0;
  let noDecisionAtCheckpoint = 0;
  let unknownPath = 0;
  let leaderWins = 0;
  const adverse = [];

  for (const row of rows) {
    const checkpoint = getCheckpoint(row, checkpointSecond);

    if (!checkpoint) {
      continue;
    }

    const checkpointBucket = getDistanceBucket(checkpoint.distanceBps);

    if (checkpointBucket?.id !== bucket.id) {
      continue;
    }

    if (metricRows && !metricRows(row, checkpoint)) {
      continue;
    }

    n += 1;
    const noDecision =
      checkpoint.checkpointInNoise || checkpoint.leaderWonAtClose === null;

    leaderWins += !noDecision && checkpoint.leaderWonAtClose ? 1 : 0;
    stable += checkpoint.stableLeaderWin ? 1 : 0;
    noisy += checkpoint.noisyLeaderWin ? 1 : 0;
    recovered += checkpoint.recoveredLeaderWin ? 1 : 0;
    flipLoss += checkpoint.flipLoss ? 1 : 0;
    noiseTouch += checkpoint.postTouchedNoise ? 1 : 0;
    anyFlipAfterT += checkpoint.postAnyHardFlip ? 1 : 0;
    noDecisionAtCheckpoint += noDecision ? 1 : 0;
    unknownPath += checkpoint.unknownPath ? 1 : 0;

    if (Number.isFinite(checkpoint.postMaxAdverseBps)) {
      adverse.push(checkpoint.postMaxAdverseBps);
    }
  }

  const hidden = n < SUPPORT_FLOOR;
  const fragileWin = noisy + recovered;
  const pathRisk = flipLoss + noDecisionAtCheckpoint + unknownPath;
  const leaderEligibleN = n - noDecisionAtCheckpoint;

  return {
    N: n,
    anyFlipAfterTRate: hidden ? null : ratio(anyFlipAfterT, n),
    checkpointSecond,
    colorEligible: n >= COLOR_SUPPORT_FLOOR,
    distanceBucket: bucket.id,
    distanceBucketLabel: bucket.label,
    flipLossRate: hidden ? null : ratio(flipLoss, n),
    fragileWinRate: hidden ? null : ratio(fragileWin, n),
    hidden,
    leaderEligibleN,
    leaderWinRate: hidden ? null : ratio(leaderWins, leaderEligibleN),
    medianMaxAdverseBps: hidden ? null : median(adverse),
    noDecisionAtCheckpointRate: hidden
      ? null
      : ratio(noDecisionAtCheckpoint, n),
    noisyLeaderWinRate: hidden ? null : ratio(noisy, n),
    pathRiskRate: hidden ? null : ratio(pathRisk, n),
    p90MaxAdverseBps: hidden ? null : percentile(adverse, 0.9),
    recoveredLeaderWinRate: hidden ? null : ratio(recovered, n),
    stableLeaderWinRate: hidden ? null : ratio(stable, n),
    noiseTouchRate: hidden ? null : ratio(noiseTouch, n),
    unknownPathRate: hidden ? null : ratio(unknownPath, n),
  };
}

function buildStabilityHeatmap(stabilityRows) {
  const cells = [];

  for (const checkpointSecond of CHECKPOINT_SECONDS) {
    for (const bucket of DISTANCE_BUCKETS) {
      cells.push(summarizeStabilityCells(stabilityRows, checkpointSecond, bucket));
    }
  }

  return cells;
}

function buildLeadAgeTables(stabilityRows) {
  const targetCheckpoints = [270, 285];
  const rows = [];

  for (const checkpointSecond of targetCheckpoints) {
    for (const distanceBucket of DISTANCE_BUCKETS) {
      for (const leadAgeBucket of LEAD_AGE_BUCKETS) {
        const cell = summarizeStabilityCells(
          stabilityRows,
          checkpointSecond,
          distanceBucket,
          (_row, checkpoint) =>
            getLeadAgeBucket(checkpoint.preCurrentLeadAgeSeconds)?.id ===
            leadAgeBucket.id,
        );

        rows.push({
          ...cell,
          leadAgeBucket: leadAgeBucket.id,
          leadAgeBucketLabel: leadAgeBucket.label,
        });
      }
    }
  }

  return rows;
}

function buildPathTypeDistribution(stabilityRows) {
  const counts = Object.fromEntries(
    PATH_TYPES.map((pathType) => [
      pathType,
      {
        closeMargins: [],
        down: 0,
        leaderWins: 0,
        stableWins: 0,
        total: 0,
        up: 0,
      },
    ]),
  );

  for (const row of stabilityRows) {
    const pathType = row.pathSummary?.pathType ?? "unknown";
    const bucket = counts[pathType] ?? counts.unknown;

    bucket.total += 1;
    bucket.up += row.resolvedOutcome === "up" ? 1 : 0;
    bucket.down += row.resolvedOutcome === "down" ? 1 : 0;

    const t270 = getCheckpoint(row, 270);

    bucket.leaderWins += t270?.leaderWonAtClose ? 1 : 0;
    bucket.stableWins += t270?.stableLeaderWin ? 1 : 0;

    if (Number.isFinite(row.pathSummary?.closeMarginBps)) {
      bucket.closeMargins.push(Math.abs(row.pathSummary.closeMarginBps));
    }
  }

  return Object.entries(counts).map(([pathType, values]) => ({
    N: values.total,
    closeMarginMedianBps: median(values.closeMargins),
    downRate: ratio(values.down, values.total),
    leaderWinRateAt270: ratio(values.leaderWins, values.total),
    pathType,
    stableWinRateAt270: ratio(values.stableWins, values.total),
    upRate: ratio(values.up, values.total),
  }));
}

function buildPreFeatureSummary(stabilityRows) {
  return CHECKPOINT_SECONDS.map((checkpointSecond) => {
    const leadAges = [];
    const dwell = [];
    const preFlips = [];
    const vol60 = [];
    const vol120 = [];

    for (const row of stabilityRows) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      leadAges.push(checkpoint.preCurrentLeadAgeSeconds);
      dwell.push(checkpoint.preLeaderDwellPct);
      preFlips.push(checkpoint.preFlipCount);
      vol60.push(checkpoint.preRealizedVolatility60s);
      vol120.push(checkpoint.preRealizedVolatility120s);
    }

    return {
      checkpointSecond,
      dwellPctMedian: median(dwell),
      leadAgeSecondsMedian: median(leadAges),
      preFlipCountMedian: median(preFlips),
      realizedVolatility60sMedian: median(vol60),
      realizedVolatility120sMedian: median(vol120),
    };
  });
}

function assignMidRanks(entries, valueField, rankField) {
  const ranked = entries
    .filter((entry) => Number.isFinite(entry[valueField]))
    .sort((a, b) => a[valueField] - b[valueField]);
  const denominator = Math.max(1, ranked.length - 1);
  let index = 0;

  while (index < ranked.length) {
    let end = index;

    while (
      end + 1 < ranked.length &&
      ranked[end + 1][valueField] === ranked[index][valueField]
    ) {
      end += 1;
    }

    const rank = ranked.length === 1 ? 0.5 : ((index + end) / 2) / denominator;

    for (let rankIndex = index; rankIndex <= end; rankIndex += 1) {
      ranked[rankIndex][rankField] = rank;
    }

    index = end + 1;
  }
}

function getChopBucket(preChopRank, thresholds) {
  if (!Number.isFinite(preChopRank) || !thresholds) {
    return CHOP_BUCKETS[3];
  }

  if (thresholds.degenerate) {
    return CHOP_BUCKETS[1];
  }

  if (preChopRank < thresholds.low) {
    return CHOP_BUCKETS[0];
  }

  if (preChopRank >= thresholds.high) {
    return CHOP_BUCKETS[2];
  }

  return CHOP_BUCKETS[1];
}

function getPrePathShape({ checkpoint, derived, leadAgeBucket }) {
  if (
    checkpoint?.prePathGood !== true ||
    !checkpoint?.leader ||
    !isTargetCheckpoint(checkpoint.checkpointSecond)
  ) {
    return "unknown";
  }

  if (derived?.preChopBucket === "high") {
    return "multi-flip-chop";
  }

  if (
    derived?.preChopBucket === "low" &&
    Number.isFinite(checkpoint.preCurrentLeadAgeSeconds) &&
    checkpoint.preCurrentLeadAgeSeconds >= 60 &&
    Number.isFinite(derived.nearLineRank) &&
    Number.isFinite(derived.nearLineHighThreshold) &&
    // A long-led low-chop market is not clean if it stayed pinned near the line.
    derived.nearLineRank < derived.nearLineHighThreshold
  ) {
    return "clean-lock";
  }

  if (
    Number.isFinite(checkpoint.preCurrentLeadAgeSeconds) &&
    checkpoint.preCurrentLeadAgeSeconds < 30
  ) {
    return "recent-lock";
  }

  if (
    Number.isFinite(derived?.nearLineRank) &&
    Number.isFinite(derived?.oscillationRank) &&
    Number.isFinite(derived?.nearLineHighThreshold) &&
    Number.isFinite(derived?.oscillationHighThreshold) &&
    derived.nearLineRank >= derived.nearLineHighThreshold &&
    derived.oscillationRank < derived.oscillationHighThreshold
  ) {
    return "near-line-heavy";
  }

  // Defensive fallback for migrated or malformed rows where lead age cannot bucket.
  return leadAgeBucket ? "unresolved" : "unknown";
}

function buildDerivedCheckpointData(stabilityRows) {
  const entries = [];
  const byKey = new Map();

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint || checkpoint.prePathGood !== true) {
        continue;
      }

      const preFlipRate = preFlipRatePerMinute(checkpoint);
      const nearLinePct = preNearLinePct(checkpoint);

      if (!Number.isFinite(preFlipRate) || !Number.isFinite(nearLinePct)) {
        continue;
      }

      entries.push({
        checkpoint,
        key: getRowCheckpointKey(row, checkpointSecond),
        nearLinePct,
        preFlipRate,
        row,
      });
    }
  }

  assignMidRanks(entries, "preFlipRate", "oscillationRank");
  assignMidRanks(entries, "nearLinePct", "nearLineRank");

  for (const entry of entries) {
    entry.preChopRank = (entry.oscillationRank + entry.nearLineRank) / 2;
  }

  const pooledChopRanks = sortedFinite(entries.map((entry) => entry.preChopRank));
  const pooledNearLineRanks = sortedFinite(
    entries.map((entry) => entry.nearLineRank),
  );
  const pooledOscillationRanks = sortedFinite(
    entries.map((entry) => entry.oscillationRank),
  );
  const preFlipRates = sortedFinite(entries.map((entry) => entry.preFlipRate));
  const nearLinePcts = sortedFinite(entries.map((entry) => entry.nearLinePct));
  const lowThreshold = interpolatedPercentile(pooledChopRanks, 1 / 3);
  const highThreshold = interpolatedPercentile(pooledChopRanks, 2 / 3);
  const nearLineHighThreshold = interpolatedPercentile(pooledNearLineRanks, 2 / 3);
  const oscillationHighThreshold = interpolatedPercentile(
    pooledOscillationRanks,
    2 / 3,
  );
  const thresholds =
    entries.length === 0
      ? null
      : {
          degenerate: lowThreshold === highThreshold,
          high: highThreshold,
          low: lowThreshold,
        };

  for (const entry of entries) {
    const chopBucket = getChopBucket(entry.preChopRank, thresholds);
    const momentumBucket = getMomentumAgreementBucket(entry.checkpoint);
    const leadAgeBucket = getLeadAgeBucket(
      entry.checkpoint.preCurrentLeadAgeSeconds,
    );
    const derived = {
      directionChangeRatePerMinute: preDirectionChangeRatePerMinute(
        entry.checkpoint,
      ),
      chopRankHighThreshold: thresholds?.high ?? null,
      leadAgeBucket: leadAgeBucket?.id ?? "unknown",
      leadAgeBucketLabel: leadAgeBucket?.label ?? "Unknown",
      momentumAgreementBucket: momentumBucket.id,
      momentumAgreementBucketLabel: momentumBucket.label,
      nearLinePct: entry.nearLinePct,
      nearLineHighThreshold,
      nearLineRank: entry.nearLineRank,
      oscillationHighThreshold,
      oscillationRank: entry.oscillationRank,
      postMaxAdverseDrawdownBps: getPostMaxAdverseDrawdownBps(
        entry.checkpoint,
      ),
      preChopBucket: chopBucket.id,
      preChopBucketLabel: chopBucket.label,
      preChopRank: entry.preChopRank,
      preFlipRatePerMinute: entry.preFlipRate,
    };

    derived.prePathShape = getPrePathShape({
      checkpoint: entry.checkpoint,
      derived,
      leadAgeBucket,
    });
    byKey.set(entry.key, derived);
  }

  return {
    byKey,
    definitions: {
      buckets: CHOP_BUCKETS,
      method:
        "Global pooled target-checkpoint empirical terciles over the average of mid-ranked flip rate per minute and near-line percent.",
      referenceValues: {
        nearLinePct: compactReferenceValues(nearLinePcts),
        preFlipRatePerMinute: compactReferenceValues(preFlipRates),
      },
      ranks: {
        degenerate: thresholds?.degenerate ?? false,
        highThreshold: thresholds?.high ?? null,
        lowThreshold: thresholds?.low ?? null,
        nearLineHighThreshold,
        oscillationHighThreshold,
        componentThresholdMethod: "linear-interpolated empirical 2/3 quantiles of each component rank",
        targetCheckpoints: TARGET_PATH_RISK_CHECKPOINTS,
        thresholdMethod: "linear-interpolated empirical 1/3 and 2/3 quantiles of preChopRank",
        tieHandling: "mid-rank",
      },
    },
  };
}

function createDiagnosticAccumulator() {
  return {
    N: 0,
    adverse: [],
    adverseDrawdown: [],
    anyFlipAfterT: 0,
    flipLoss: 0,
    leaderAlignedMomentum30s: [],
    leaderAlignedMomentum60s: [],
    leaderWins: 0,
    momentum30s: [],
    momentum60s: [],
    noDecisionAtCheckpoint: 0,
    noisy: 0,
    preCrossesLast60s: [],
    preMaxSnapshotGaps: [],
    preRange60s: [],
    preRange120s: [],
    preSnapshotCoverage: [],
    recovered: 0,
    stable: 0,
  };
}

function addDiagnosticCheckpoint(accumulator, checkpoint, derived) {
  const noDecision =
    checkpoint.checkpointInNoise || checkpoint.leaderWonAtClose === null;

  accumulator.N += 1;
  accumulator.leaderWins += !noDecision && checkpoint.leaderWonAtClose ? 1 : 0;
  accumulator.stable += checkpoint.stableLeaderWin ? 1 : 0;
  accumulator.noisy += checkpoint.noisyLeaderWin ? 1 : 0;
  accumulator.recovered += checkpoint.recoveredLeaderWin ? 1 : 0;
  accumulator.flipLoss += checkpoint.flipLoss ? 1 : 0;
  accumulator.anyFlipAfterT += checkpoint.postAnyHardFlip ? 1 : 0;
  accumulator.noDecisionAtCheckpoint += noDecision ? 1 : 0;

  if (Number.isFinite(checkpoint.postMaxAdverseBps)) {
    accumulator.adverse.push(checkpoint.postMaxAdverseBps);
  }

  if (Number.isFinite(derived?.postMaxAdverseDrawdownBps)) {
    accumulator.adverseDrawdown.push(derived.postMaxAdverseDrawdownBps);
  }

  if (Number.isFinite(checkpoint.leaderAlignedMomentum30sBps)) {
    accumulator.leaderAlignedMomentum30s.push(
      checkpoint.leaderAlignedMomentum30sBps,
    );
  }

  if (Number.isFinite(checkpoint.leaderAlignedMomentum60sBps)) {
    accumulator.leaderAlignedMomentum60s.push(
      checkpoint.leaderAlignedMomentum60sBps,
    );
  }

  if (Number.isFinite(checkpoint.momentum30sBps)) {
    accumulator.momentum30s.push(checkpoint.momentum30sBps);
  }

  if (Number.isFinite(checkpoint.momentum60sBps)) {
    accumulator.momentum60s.push(checkpoint.momentum60sBps);
  }

  if (Number.isFinite(checkpoint.preCrossCountLast60s)) {
    accumulator.preCrossesLast60s.push(checkpoint.preCrossCountLast60s);
  }

  if (Number.isFinite(checkpoint.preMaxSnapshotGapMs)) {
    accumulator.preMaxSnapshotGaps.push(checkpoint.preMaxSnapshotGapMs);
  }

  if (Number.isFinite(checkpoint.preRange60sBps)) {
    accumulator.preRange60s.push(checkpoint.preRange60sBps);
  }

  if (Number.isFinite(checkpoint.preRange120sBps)) {
    accumulator.preRange120s.push(checkpoint.preRange120sBps);
  }

  if (Number.isFinite(checkpoint.preSnapshotCoveragePct)) {
    accumulator.preSnapshotCoverage.push(checkpoint.preSnapshotCoveragePct);
  }
}

function summarizeDiagnosticAccumulator(accumulator) {
  const total = accumulator.N;
  const sparse = total < DIAGNOSTIC_SUPPORT_FLOOR;
  const fragileWin = accumulator.noisy + accumulator.recovered;
  const leaderEligibleN = total - accumulator.noDecisionAtCheckpoint;

  return {
    N: total,
    anyFlipAfterTRate: sparse
      ? null
      : ratio(accumulator.anyFlipAfterT, total),
    colorEligible: total >= COLOR_SUPPORT_FLOOR,
    flipLossRate: sparse ? null : ratio(accumulator.flipLoss, total),
    fragileWinRate: sparse ? null : ratio(fragileWin, total),
    leaderEligibleN,
    leaderWinRate: sparse
      ? null
      : ratio(accumulator.leaderWins, leaderEligibleN),
    medianLeaderAlignedMomentum30sBps: sparse
      ? null
      : median(accumulator.leaderAlignedMomentum30s),
    medianLeaderAlignedMomentum60sBps: sparse
      ? null
      : median(accumulator.leaderAlignedMomentum60s),
    medianMaxAdverseBps: sparse ? null : median(accumulator.adverse),
    medianMaxAdverseDrawdownBps: sparse
      ? null
      : median(accumulator.adverseDrawdown),
    medianMomentum30sBps: sparse ? null : median(accumulator.momentum30s),
    medianMomentum60sBps: sparse ? null : median(accumulator.momentum60s),
    medianPreCrossCountLast60s: sparse
      ? null
      : median(accumulator.preCrossesLast60s),
    medianPreMaxSnapshotGapMs: sparse
      ? null
      : median(accumulator.preMaxSnapshotGaps),
    medianPreRange60sBps: sparse ? null : median(accumulator.preRange60s),
    medianPreRange120sBps: sparse ? null : median(accumulator.preRange120s),
    medianPreSnapshotCoveragePct: sparse
      ? null
      : median(accumulator.preSnapshotCoverage),
    p90MaxAdverseBps: sparse ? null : percentile(accumulator.adverse, 0.9),
    p90MaxAdverseDrawdownBps: sparse
      ? null
      : percentile(accumulator.adverseDrawdown, 0.9),
    sparse,
    stableLeaderWinRate: sparse ? null : ratio(accumulator.stable, total),
  };
}

function summarizeDiagnosticRows(rows) {
  const accumulator = createDiagnosticAccumulator();

  for (const { checkpoint, derived } of rows) {
    addDiagnosticCheckpoint(accumulator, checkpoint, derived);
  }

  return summarizeDiagnosticAccumulator(accumulator);
}

function buildPathRiskByChop(stabilityRows, derivedByKey) {
  const cellsByKey = new Map();

  for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
    for (const distanceBucket of getDiagnosticDistanceBuckets()) {
      for (const chopBucket of CHOP_BUCKETS) {
        cellsByKey.set(
          getPriorKey([checkpointSecond, distanceBucket.id, chopBucket.id]),
          {
            accumulator: createDiagnosticAccumulator(),
            checkpointSecond,
            distanceBucket: distanceBucket.id,
            distanceBucketLabel: distanceBucket.label,
            preChopBucket: chopBucket.id,
            preChopBucketLabel: chopBucket.label,
          },
        );
      }
    }
  }

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      const distanceBucket = getDistanceBucket(checkpoint.distanceBps);

      if (!distanceBucket || distanceBucket.id === "le_0_5") {
        continue;
      }

      const derived = derivedByKey.get(getRowCheckpointKey(row, checkpointSecond));
      const preChopBucket = derived?.preChopBucket ?? "unknown";
      const cell = cellsByKey.get(
        getPriorKey([checkpointSecond, distanceBucket.id, preChopBucket]),
      );

      if (cell) {
        addDiagnosticCheckpoint(cell.accumulator, checkpoint, derived);
      }
    }
  }

  return [...cellsByKey.values()].map(({ accumulator, ...cell }) => ({
    ...summarizeDiagnosticAccumulator(accumulator),
    ...cell,
  }));
}

function buildMomentumAgreement(stabilityRows, derivedByKey) {
  const cellsByKey = new Map();

  for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
    for (const distanceBucket of getDiagnosticDistanceBuckets()) {
      for (const agreementBucket of MOMENTUM_AGREEMENT_BUCKETS) {
        cellsByKey.set(
          getPriorKey([checkpointSecond, distanceBucket.id, agreementBucket.id]),
          {
            accumulator: createDiagnosticAccumulator(),
            checkpointSecond,
            distanceBucket: distanceBucket.id,
            distanceBucketLabel: distanceBucket.label,
            momentumAgreementBucket: agreementBucket.id,
            momentumAgreementBucketLabel: agreementBucket.label,
          },
        );
      }
    }
  }

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      const distanceBucket = getDistanceBucket(checkpoint.distanceBps);

      if (!distanceBucket || distanceBucket.id === "le_0_5") {
        continue;
      }

      const derived = derivedByKey.get(getRowCheckpointKey(row, checkpointSecond));
      const agreementBucket = derived
        ? { id: derived.momentumAgreementBucket }
        : getMomentumAgreementBucket(checkpoint);
      const cell = cellsByKey.get(
        getPriorKey([checkpointSecond, distanceBucket.id, agreementBucket.id]),
      );

      if (cell) {
        addDiagnosticCheckpoint(cell.accumulator, checkpoint, derived);
      }
    }
  }

  return [...cellsByKey.values()].map(({ accumulator, ...cell }) => ({
    ...summarizeDiagnosticAccumulator(accumulator),
    ...cell,
  }));
}

function buildLeaderAgeByDistance(stabilityRows, derivedByKey) {
  const cellsByKey = new Map();

  for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
    for (const distanceBucket of getDiagnosticDistanceBuckets()) {
      for (const leadAgeBucket of LEAD_AGE_BUCKETS) {
        cellsByKey.set(
          getPriorKey([checkpointSecond, distanceBucket.id, leadAgeBucket.id]),
          {
            accumulator: createDiagnosticAccumulator(),
            checkpointSecond,
            distanceBucket: distanceBucket.id,
            distanceBucketLabel: distanceBucket.label,
            leadAgeBucket: leadAgeBucket.id,
            leadAgeBucketLabel: leadAgeBucket.label,
          },
        );
      }
    }
  }

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      const distanceBucket = getDistanceBucket(checkpoint.distanceBps);
      const leadAgeBucket = getLeadAgeBucket(checkpoint.preCurrentLeadAgeSeconds);

      if (!distanceBucket || distanceBucket.id === "le_0_5" || !leadAgeBucket) {
        continue;
      }

      const derived = derivedByKey.get(getRowCheckpointKey(row, checkpointSecond));
      const cell = cellsByKey.get(
        getPriorKey([checkpointSecond, distanceBucket.id, leadAgeBucket.id]),
      );

      if (cell) {
        addDiagnosticCheckpoint(cell.accumulator, checkpoint, derived);
      }
    }
  }

  return [...cellsByKey.values()].map(({ accumulator, ...cell }) => ({
    ...summarizeDiagnosticAccumulator(accumulator),
    ...cell,
  }));
}

function getPriorKey(parts) {
  return parts.join(":");
}

function addPriorValue(priors, key, value) {
  if (!Number.isFinite(value)) {
    return;
  }

  if (!priors.has(key)) {
    priors.set(key, []);
  }

  priors.get(key).push(value);
}

function getPriorStats(priors, key) {
  return withSupport(priors.get(key) ?? []);
}

function selectDurabilityPrior({ checkpoint, derived, priors }) {
  const checkpointSecond = checkpoint.checkpointSecond;
  const chop = derived?.preChopBucket ?? "unknown";
  const momentum = derived?.momentumAgreementBucket ?? "unknown";
  const candidates = [
    {
      key: getPriorKey(["primary", checkpointSecond, chop, momentum]),
      source: "checkpoint-chop-momentum",
    },
    {
      key: getPriorKey(["checkpoint-chop", checkpointSecond, chop]),
      source: "checkpoint-chop",
    },
    {
      key: getPriorKey(["checkpoint", checkpointSecond]),
      source: "checkpoint",
    },
    {
      key: "target-global",
      source: "target-global",
    },
  ];

  for (const candidate of candidates) {
    const stats = getPriorStats(priors, candidate.key);

    if (stats.N >= MIN_DURABILITY_PRIOR_N) {
      return {
        ...stats,
        source: candidate.source,
      };
    }
  }

  return {
    N: 0,
    p50: null,
    p75: null,
    p90: null,
    source: "unknown",
  };
}

function buildDurability(stabilityRows, derivedByKey) {
  const priors = new Map();
  const enriched = [];

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);
      const derived = derivedByKey.get(getRowCheckpointKey(row, checkpointSecond));
      const drawdown = derived?.postMaxAdverseDrawdownBps;

      if (!checkpoint || !Number.isFinite(drawdown)) {
        continue;
      }

      const chop = derived?.preChopBucket ?? "unknown";
      const momentum = derived?.momentumAgreementBucket ?? "unknown";

      addPriorValue(
        priors,
        getPriorKey(["primary", checkpointSecond, chop, momentum]),
        drawdown,
      );
      addPriorValue(
        priors,
        getPriorKey(["checkpoint-chop", checkpointSecond, chop]),
        drawdown,
      );
      addPriorValue(priors, getPriorKey(["checkpoint", checkpointSecond]), drawdown);
      addPriorValue(priors, "target-global", drawdown);
      enriched.push({ checkpoint, derived, row });
    }
  }

  const cellsByKey = new Map();

  for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
    for (const distanceBucket of getDiagnosticDistanceBuckets()) {
      for (const durabilityBucket of DURABILITY_BUCKETS) {
        cellsByKey.set(
          getPriorKey([checkpointSecond, distanceBucket.id, durabilityBucket.id]),
          {
            accumulator: createDiagnosticAccumulator(),
            checkpointSecond,
            distanceBucket: distanceBucket.id,
            distanceBucketLabel: distanceBucket.label,
            durabilityBucket: durabilityBucket.id,
            durabilityBucketLabel: durabilityBucket.label,
            expectedP90: [],
            priorNs: [],
            priorSourceCounts: {},
          },
        );
      }
    }
  }

  for (const entry of enriched) {
    const prior = selectDurabilityPrior({
      checkpoint: entry.checkpoint,
      derived: entry.derived,
      priors,
    });
    const denominator = Number.isFinite(prior.p90)
      ? Math.max(prior.p90, DURABILITY_DENOMINATOR_FLOOR_BPS)
      : null;
    const durabilityRatio =
      denominator === null || !Number.isFinite(entry.checkpoint.distanceBps)
        ? null
        : Math.abs(entry.checkpoint.distanceBps) / denominator;
    const bucket = getDurabilityBucket(durabilityRatio);
    const distanceBucket = getDistanceBucket(entry.checkpoint.distanceBps);

    if (!distanceBucket || distanceBucket.id === "le_0_5") {
      continue;
    }

    const derived = {
      ...entry.derived,
      durabilityBucket: bucket.id,
      durabilityBucketLabel: bucket.label,
      durabilityPriorN: prior.N,
      durabilityPriorSource: prior.source,
      durabilityRatio,
      expectedAdverseP50Bps: prior.p50,
      expectedAdverseP75Bps: prior.p75,
      expectedAdverseP90Bps: prior.p90,
    };
    const cell = cellsByKey.get(
      getPriorKey([
        entry.checkpoint.checkpointSecond,
        distanceBucket.id,
        bucket.id,
      ]),
    );

    if (cell) {
      addDiagnosticCheckpoint(cell.accumulator, entry.checkpoint, derived);

      if (Number.isFinite(derived.durabilityPriorN)) {
        cell.priorNs.push(derived.durabilityPriorN);
      }

      if (Number.isFinite(derived.expectedAdverseP90Bps)) {
        cell.expectedP90.push(derived.expectedAdverseP90Bps);
      }

      increment(cell.priorSourceCounts, derived.durabilityPriorSource ?? "unknown");
    }
  }

  return {
    buckets: DURABILITY_BUCKETS,
    cells: [...cellsByKey.values()].map(({ accumulator, ...cell }) => ({
      ...summarizeDiagnosticAccumulator(accumulator),
      checkpointSecond: cell.checkpointSecond,
      distanceBucket: cell.distanceBucket,
      distanceBucketLabel: cell.distanceBucketLabel,
      durabilityBucket: cell.durabilityBucket,
      durabilityBucketLabel: cell.durabilityBucketLabel,
      expectedAdverseP90BpsMedian: median(cell.expectedP90),
      priorNMedian: median(cell.priorNs),
      priorSourceCounts: cell.priorSourceCounts,
    })),
    priorDefinitions: {
      denominatorFloorBps: DURABILITY_DENOMINATOR_FLOOR_BPS,
      minPriorN: MIN_DURABILITY_PRIOR_N,
      sources: [
        "checkpoint-chop-momentum",
        "checkpoint-chop",
        "checkpoint",
        "target-global",
        "unknown",
      ],
    },
  };
}

function buildPrePathShapes(stabilityRows, derivedByKey) {
  const cellsByKey = new Map();
  const denominatorByCheckpoint = new Map(
    TARGET_PATH_RISK_CHECKPOINTS.map((checkpointSecond) => [
      checkpointSecond,
      0,
    ]),
  );

  for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
    for (const shape of PRE_PATH_SHAPES) {
      cellsByKey.set(
        getPriorKey([checkpointSecond, shape.id]),
        {
          accumulator: createDiagnosticAccumulator(),
          checkpointSecond,
          distances: [],
          prePathShape: shape.id,
          prePathShapeLabel: shape.label,
        },
      );
    }
  }

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint) {
        continue;
      }

      denominatorByCheckpoint.set(
        checkpointSecond,
        (denominatorByCheckpoint.get(checkpointSecond) ?? 0) + 1,
      );

      const derived = derivedByKey.get(getRowCheckpointKey(row, checkpointSecond));
      const shapeId = derived?.prePathShape ?? "unknown";
      const cell = cellsByKey.get(getPriorKey([checkpointSecond, shapeId]));

      if (!cell) {
        continue;
      }

      addDiagnosticCheckpoint(cell.accumulator, checkpoint, derived);

      if (Number.isFinite(checkpoint.distanceBps)) {
        cell.distances.push(Math.abs(checkpoint.distanceBps));
      }
    }
  }

  return {
    buckets: PRE_PATH_SHAPES,
    cells: [...cellsByKey.values()].map(({ accumulator, ...cell }) => ({
      ...summarizeDiagnosticAccumulator(accumulator),
      checkpointSecond: cell.checkpointSecond,
      distanceMedianBps: median(cell.distances),
      prePathShape: cell.prePathShape,
      prePathShapeLabel: cell.prePathShapeLabel,
      shareOfCheckpoint:
        accumulator.N === 0
          ? null
          : ratio(
              accumulator.N,
              denominatorByCheckpoint.get(cell.checkpointSecond) ?? 0,
            ),
    })),
  };
}

function buildStabilityReport(stabilityRows, leaderRows, cleanAnalyticsSlugs) {
  const cleanRows = stabilityRows.filter((row) =>
    isCleanStability(row, cleanAnalyticsSlugs),
  );
  const derived = buildDerivedCheckpointData(cleanRows);
  const durability = buildDurability(cleanRows, derived.byKey);

  return {
    byCheckpoint: buildStabilityByCheckpoint(cleanRows, leaderRows.byCheckpoint),
    chopBuckets: CHOP_BUCKETS,
    cleanCount: cleanRows.length,
    diagnosticDistanceBuckets: getDiagnosticDistanceBuckets().map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
    })),
    distanceBuckets: DISTANCE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
    })),
    durability,
    durabilityPriorDefinitions: durability.priorDefinitions,
    heatmap: buildStabilityHeatmap(cleanRows),
    leadAgeBuckets: LEAD_AGE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
    })),
    leadAgeTables: buildLeadAgeTables(cleanRows),
    leaderAgeByDistance: buildLeaderAgeByDistance(cleanRows, derived.byKey),
    metrics: STABILITY_HEATMAP_METRICS,
    momentumAgreement: buildMomentumAgreement(cleanRows, derived.byKey),
    momentumAgreementBuckets: MOMENTUM_AGREEMENT_BUCKETS,
    pathTypes: buildPathTypeDistribution(cleanRows),
    pathRiskByChop: buildPathRiskByChop(cleanRows, derived.byKey),
    preChopBucketDefinitions: derived.definitions,
    preFeatures: buildPreFeatureSummary(cleanRows),
    prePathShapes: buildPrePathShapes(cleanRows, derived.byKey),
    targetCheckpoints: TARGET_PATH_RISK_CHECKPOINTS,
    support: {
      colorFloor: COLOR_SUPPORT_FLOOR,
      diagnosticFloor: DIAGNOSTIC_SUPPORT_FLOOR,
      floor: SUPPORT_FLOOR,
    },
  };
}

export function buildAnalyticsDashboard({
  analyticsRows = [],
  computedAt = Date.now(),
  stabilityRows = [],
} = {}) {
  const leader = buildLeaderAndDistanceReport(analyticsRows);
  const cleanAnalyticsSlugs = getCleanAnalyticsSlugSet(analyticsRows);

  return {
    computedAt,
    health: buildDatasetHealth(analyticsRows, stabilityRows),
    leader,
    stability: buildStabilityReport(stabilityRows, leader, cleanAnalyticsSlugs),
  };
}
