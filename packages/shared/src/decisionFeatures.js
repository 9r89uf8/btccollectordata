import {
  getExpectedBucketCount,
  inferSnapshotCadenceMs,
} from "./cadence.js";
import { getDecisionDistanceBucketId } from "./decisionBuckets.js";
import {
  DECISION_CONFIG,
  DECISION_SIDES,
  REASON_CODES,
} from "./decisionConfig.js";

export const PRE_T_NEAR_LINE_BPS = 2;
export const PRE_T_MOMENTUM_DEADBAND_BPS = 0.5;
export const PRE_T_DIRECTION_CHANGE_MIN_DELTA_BPS = 0.5;
// These path-quality constants define the live predictor's pre-T feature
// contract; keep them aligned with the stability analytics shape and tests.
export const PRE_T_MIN_PATH_COVERAGE_PCT = 0.95;
export const PRE_T_MIN_SNAPSHOT_CADENCE_MS = 1_000;
export const PRE_T_MAX_SNAPSHOT_CADENCE_MS = 10_000;

const EPSILON = 1e-9;

export const DECISION_LEAD_AGE_BUCKETS = Object.freeze([
  Object.freeze({ id: "lt_10", label: "<10s", max: 10 }),
  Object.freeze({ id: "10_30", label: "10-30s", min: 10, max: 30 }),
  Object.freeze({ id: "30_60", label: "30-60s", min: 30, max: 60 }),
  Object.freeze({ id: "60_120", label: "60-120s", min: 60, max: 120 }),
  Object.freeze({ id: "gte_120", label: "120s+", min: 120 }),
]);

export const DECISION_MOMENTUM_AGREEMENT_BUCKETS = Object.freeze([
  Object.freeze({ id: "agrees", label: "Agrees" }),
  Object.freeze({ id: "disagrees", label: "Disagrees" }),
  Object.freeze({ id: "flat", label: "Flat" }),
  Object.freeze({ id: "unknown", label: "Unknown" }),
]);

export const DECISION_PRE_PATH_SHAPES = Object.freeze([
  Object.freeze({ id: "clean-lock", label: "Clean lock" }),
  Object.freeze({ id: "recent-lock", label: "Recent lock" }),
  Object.freeze({ id: "multi-flip-chop", label: "Multi-flip chop" }),
  Object.freeze({ id: "near-line-heavy", label: "Near-line heavy" }),
  Object.freeze({ id: "unresolved", label: "Unresolved" }),
  Object.freeze({ id: "unknown", label: "Unknown" }),
]);

const MOMENTUM_AGREEMENT_IDS = Object.freeze({
  AGREES: DECISION_MOMENTUM_AGREEMENT_BUCKETS[0].id,
  DISAGREES: DECISION_MOMENTUM_AGREEMENT_BUCKETS[1].id,
  FLAT: DECISION_MOMENTUM_AGREEMENT_BUCKETS[2].id,
  UNKNOWN: DECISION_MOMENTUM_AGREEMENT_BUCKETS[3].id,
});

const PRE_PATH_SHAPE_IDS = Object.freeze({
  CLEAN_LOCK: DECISION_PRE_PATH_SHAPES[0].id,
  RECENT_LOCK: DECISION_PRE_PATH_SHAPES[1].id,
  MULTI_FLIP_CHOP: DECISION_PRE_PATH_SHAPES[2].id,
  NEAR_LINE_HEAVY: DECISION_PRE_PATH_SHAPES[3].id,
  UNRESOLVED: DECISION_PRE_PATH_SHAPES[4].id,
  UNKNOWN: DECISION_PRE_PATH_SHAPES[5].id,
});

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampProbability(value) {
  return Math.max(0, Math.min(1, value));
}

export function signedDistanceBps(btcPrice, priceToBeat) {
  const btc = toFiniteNumber(btcPrice);
  const reference = toFiniteNumber(priceToBeat);

  if (btc === null || reference === null || reference <= 0) {
    return null;
  }

  return (10000 * (btc - reference)) / reference;
}

export function computeLeader({
  btcPrice,
  noiseBandBps = DECISION_CONFIG.noiseBandBps,
  priceToBeat,
} = {}) {
  const distanceBps = signedDistanceBps(btcPrice, priceToBeat);

  if (!Number.isFinite(distanceBps)) {
    return DECISION_SIDES.NONE;
  }

  if (distanceBps > noiseBandBps + EPSILON) {
    return DECISION_SIDES.UP;
  }

  if (distanceBps < -noiseBandBps - EPSILON) {
    return DECISION_SIDES.DOWN;
  }

  return DECISION_SIDES.NONE;
}

export function bucketDistance(distanceBps) {
  return getDecisionDistanceBucketId(distanceBps);
}

export function nearestDecisionCheckpoint(
  secondsFromWindowStart,
  config = DECISION_CONFIG,
) {
  const seconds = toFiniteNumber(secondsFromWindowStart);

  if (seconds === null) {
    return null;
  }

  let best = null;

  for (const checkpointSecond of config.targetCheckpoints) {
    const deltaSeconds = seconds - checkpointSecond;
    const absDeltaSeconds = Math.abs(deltaSeconds);

    if (absDeltaSeconds > config.checkpointToleranceSec) {
      continue;
    }

    if (
      best === null ||
      absDeltaSeconds < best.absDeltaSeconds ||
      (absDeltaSeconds === best.absDeltaSeconds &&
        checkpointSecond < best.checkpointSecond)
    ) {
      best = {
        absDeltaSeconds,
        checkpointSecond,
        deltaSeconds,
        secondsFromWindowStart: seconds,
      };
    }
  }

  return best;
}

function stateFromMargin(marginBps) {
  if (!Number.isFinite(marginBps)) {
    return null;
  }

  if (marginBps >= DECISION_CONFIG.noiseBandBps - EPSILON) {
    return DECISION_SIDES.UP;
  }

  if (marginBps <= -DECISION_CONFIG.noiseBandBps + EPSILON) {
    return DECISION_SIDES.DOWN;
  }

  return "noise";
}

function getSnapshotSecond(row, windowStartTs) {
  const explicit = toFiniteNumber(row?.secondsFromWindowStart);

  if (explicit !== null) {
    return explicit;
  }

  const secondBucket = toFiniteNumber(row?.secondBucket ?? row?.ts);

  if (secondBucket === null || !Number.isFinite(windowStartTs)) {
    return null;
  }

  return Math.floor((secondBucket - windowStartTs) / 1000);
}

function normalizePathRows(recentPath, { priceToBeat, windowStartTs }) {
  const rows = [];
  const seen = new Set();

  for (const row of Array.isArray(recentPath) ? recentPath : []) {
    const secondsFromWindowStart = getSnapshotSecond(row, windowStartTs);
    const rowSecondBucket = toFiniteNumber(row?.secondBucket ?? row?.ts);
    const secondBucket =
      rowSecondBucket ??
      (Number.isFinite(windowStartTs) && Number.isFinite(secondsFromWindowStart)
        ? windowStartTs + secondsFromWindowStart * 1000
        : null);
    const btcPrice = toFiniteNumber(
      row?.btcChainlink ?? row?.btcPrice ?? row?.price ?? row?.btcAtCheckpoint,
    );
    const marginBps =
      toFiniteNumber(row?.marginBps ?? row?.distanceBps) ??
      signedDistanceBps(btcPrice, priceToBeat);

    if (
      !Number.isFinite(secondsFromWindowStart) ||
      secondBucket === null ||
      marginBps === null
    ) {
      continue;
    }

    const key = `${secondBucket}:${secondsFromWindowStart}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rows.push({
      marginBps,
      price: btcPrice,
      secondBucket,
      secondsFromWindowStart,
      state: row?.state ?? stateFromMargin(marginBps),
    });
  }

  return rows.sort((a, b) => a.secondBucket - b.secondBucket);
}

function isValidSnapshotCadenceMs(cadenceMs) {
  return (
    Number.isFinite(cadenceMs) &&
    cadenceMs >= PRE_T_MIN_SNAPSHOT_CADENCE_MS &&
    cadenceMs <= PRE_T_MAX_SNAPSHOT_CADENCE_MS
  );
}

function getMaxAllowedGapMs(cadenceMs) {
  return Math.max(12_000, cadenceMs * 2);
}

function getMaxAllowedLastSnapshotAgeMs(cadenceMs) {
  return Math.max(6_000, cadenceMs);
}

function getCoverage(rows, { cadenceMs, endTs, startTs }) {
  const cadenceValid = isValidSnapshotCadenceMs(cadenceMs);
  const expected = cadenceValid
    ? getExpectedBucketCount(startTs, endTs, cadenceMs)
    : 0;

  if (expected <= 0) {
    return {
      coveragePct: 0,
      expected,
      lastSnapshotAgeMsAtClose: null,
      maxGapMs: null,
      pathGood: false,
      rowCount: rows.length,
    };
  }

  const inRange = rows.filter(
    (row) => row.secondBucket >= startTs && row.secondBucket <= endTs,
  );
  const coveragePct = Math.min(1, inRange.length / expected);
  let maxGapMs =
    inRange.length === 0 ? endTs - startTs : inRange[0].secondBucket - startTs;

  for (let index = 1; index < inRange.length; index += 1) {
    maxGapMs = Math.max(
      maxGapMs,
      inRange[index].secondBucket - inRange[index - 1].secondBucket,
    );
  }

  if (inRange.length > 0) {
    maxGapMs = Math.max(
      maxGapMs,
      endTs - inRange[inRange.length - 1].secondBucket,
    );
  }

  const lastSnapshotAgeMsAtClose =
    inRange.length === 0
      ? null
      : Math.max(0, endTs - inRange[inRange.length - 1].secondBucket);

  return {
    coveragePct,
    expected,
    lastSnapshotAgeMsAtClose,
    maxGapMs,
    pathGood:
      cadenceValid &&
      coveragePct >= PRE_T_MIN_PATH_COVERAGE_PCT &&
      maxGapMs <= getMaxAllowedGapMs(cadenceMs) &&
      lastSnapshotAgeMsAtClose !== null &&
      lastSnapshotAgeMsAtClose <= getMaxAllowedLastSnapshotAgeMs(cadenceMs),
    rowCount: inRange.length,
  };
}

function standardDeviation(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return null;
  }

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    finite.length;

  return Math.sqrt(variance);
}

function getVolatility(rows, checkpointSecond, lookbackSeconds) {
  const startSecond = Math.max(0, checkpointSecond - lookbackSeconds);

  return standardDeviation(
    rows
      .filter(
        (row) =>
          row.secondsFromWindowStart <= checkpointSecond &&
          row.secondsFromWindowStart >= startSecond,
      )
      .map((row) => row.marginBps),
  );
}

function getRange(rows, checkpointSecond, lookbackSeconds) {
  const startSecond = Math.max(0, checkpointSecond - lookbackSeconds);
  const values = rows
    .filter(
      (row) =>
        row.secondsFromWindowStart <= checkpointSecond &&
        row.secondsFromWindowStart >= startSecond,
    )
    .map((row) => row.marginBps)
    .filter((value) => Number.isFinite(value));

  return values.length === 0 ? null : Math.max(...values) - Math.min(...values);
}

function countNearLineSeconds(preRows, checkpointSecond) {
  let seconds = 0;

  for (let index = 0; index < preRows.length; index += 1) {
    const row = preRows[index];
    const nextSecond =
      preRows[index + 1]?.secondsFromWindowStart ?? checkpointSecond;
    const duration = Math.max(
      0,
      Math.min(checkpointSecond, nextSecond) - row.secondsFromWindowStart,
    );

    if (Math.abs(row.marginBps) <= PRE_T_NEAR_LINE_BPS + EPSILON) {
      seconds += duration;
    }
  }

  return Math.round(seconds);
}

function countDirectionChanges(preRows) {
  let currentDirection = null;
  let trackedExtreme = null;
  let count = 0;

  for (const row of preRows) {
    if (!Number.isFinite(row.marginBps)) {
      continue;
    }

    if (trackedExtreme === null) {
      trackedExtreme = row.marginBps;
      continue;
    }

    const delta = row.marginBps - trackedExtreme;

    if (currentDirection === null) {
      if (Math.abs(delta) >= PRE_T_DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON) {
        currentDirection = delta > 0 ? DECISION_SIDES.UP : DECISION_SIDES.DOWN;
        trackedExtreme = row.marginBps;
      }
      continue;
    }

    if (currentDirection === DECISION_SIDES.UP) {
      if (row.marginBps > trackedExtreme) {
        trackedExtreme = row.marginBps;
      } else if (
        trackedExtreme - row.marginBps >=
        PRE_T_DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON
      ) {
        count += 1;
        currentDirection = DECISION_SIDES.DOWN;
        trackedExtreme = row.marginBps;
      }
      continue;
    }

    if (row.marginBps < trackedExtreme) {
      trackedExtreme = row.marginBps;
    } else if (
      row.marginBps - trackedExtreme >=
      PRE_T_DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON
    ) {
      count += 1;
      currentDirection = DECISION_SIDES.UP;
      trackedExtreme = row.marginBps;
    }
  }

  return count;
}

function computeHardFlips(rows) {
  const flips = [];
  let lastStableState = null;

  for (const row of rows) {
    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (lastStableState && row.state !== lastStableState.state) {
      flips.push({
        from: lastStableState.state,
        second: row.secondsFromWindowStart,
        to: row.state,
      });
    }

    lastStableState = row;
  }

  return flips;
}

function countCrossesLast60s(rows, checkpointSecond) {
  const startSecond = Math.max(0, checkpointSecond - 60);
  const flips = computeHardFlips(
    rows.filter(
      (row) =>
        row.secondsFromWindowStart >= startSecond &&
        row.secondsFromWindowStart <= checkpointSecond,
    ),
  );

  return flips.length;
}

function getLatestRowAtOrBefore(rows, targetSecond) {
  let latest = null;

  for (const row of rows) {
    if (
      row.secondsFromWindowStart < 0 ||
      row.secondsFromWindowStart > targetSecond
    ) {
      continue;
    }

    if (!latest || row.secondsFromWindowStart > latest.secondsFromWindowStart) {
      latest = row;
    }
  }

  return latest;
}

function momentumSide(momentumBps) {
  if (!Number.isFinite(momentumBps)) {
    return null;
  }

  if (momentumBps > PRE_T_MOMENTUM_DEADBAND_BPS) {
    return DECISION_SIDES.UP;
  }

  if (momentumBps < -PRE_T_MOMENTUM_DEADBAND_BPS) {
    return DECISION_SIDES.DOWN;
  }

  return "flat";
}

function buildMomentum(rows, {
  cadenceMs,
  checkpointSecond,
  leader,
  lookbackSeconds,
}) {
  const startSecond = checkpointSecond - lookbackSeconds;

  if (
    startSecond < 0 ||
    !isValidSnapshotCadenceMs(cadenceMs) ||
    checkpointSecond < 0
  ) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  const maxEndpointAgeMs = getMaxAllowedGapMs(cadenceMs);
  const startRow = getLatestRowAtOrBefore(rows, startSecond);
  const endRow = getLatestRowAtOrBefore(rows, checkpointSecond);

  if (!startRow || !endRow) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  if (
    (startSecond - startRow.secondsFromWindowStart) * 1000 > maxEndpointAgeMs ||
    (checkpointSecond - endRow.secondsFromWindowStart) * 1000 > maxEndpointAgeMs
  ) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  const momentumBps = endRow.marginBps - startRow.marginBps;
  const side = momentumSide(momentumBps);
  const leaderSign =
    leader === DECISION_SIDES.UP ? 1 : leader === DECISION_SIDES.DOWN ? -1 : null;

  return {
    agreesWithLeader:
      !leader || side === null || side === "flat" ? null : side === leader,
    leaderAlignedBps: leaderSign === null ? null : leaderSign * momentumBps,
    momentumBps,
    side,
  };
}

function emptyPreTFeatures(overrides = {}) {
  return {
    leadAgeBucket: "unknown",
    leaderAlignedMomentum30sBps: null,
    leaderAlignedMomentum60sBps: null,
    momentum30sAgreesWithLeader: null,
    momentum30sBps: null,
    momentum30sSide: null,
    momentum60sAgreesWithLeader: null,
    momentum60sBps: null,
    momentum60sSide: null,
    momentumAgreementBucket: MOMENTUM_AGREEMENT_IDS.UNKNOWN,
    nearLinePct: null,
    nearLineRank: null,
    oscillationRank: null,
    pooledChopRank: null,
    preChopBucket: "unknown",
    preCurrentLeadAgeSeconds: null,
    preCrossCountLast60s: null,
    preDirectionChangeCount: null,
    preFlipCount: null,
    preFlipRatePerMinute: null,
    preLastFlipAgeSeconds: null,
    preLeaderDwellPct: null,
    preLongestLeadStreakSeconds: null,
    preMaxSnapshotGapMs: null,
    preNearLinePct: null,
    preNearLineSeconds: null,
    prePathGood: false,
    prePathShape: PRE_PATH_SHAPE_IDS.UNKNOWN,
    preRange60sBps: null,
    preRange120sBps: null,
    preRealizedVolatility60s: null,
    preRealizedVolatility120s: null,
    preSnapshotCoveragePct: 0,
    ...overrides,
  };
}

function getReferenceValues(rankThresholds, keys) {
  for (const key of keys) {
    const direct = rankThresholds?.[key];

    if (Array.isArray(direct)) {
      return direct;
    }

    const referenceValues = rankThresholds?.referenceValues?.[key];

    if (Array.isArray(referenceValues)) {
      return referenceValues;
    }

    const rankReference = rankThresholds?.rankReference?.[key];

    if (Array.isArray(rankReference)) {
      return rankReference;
    }
  }

  return null;
}

export function rankAgainstReference(referenceValues, value) {
  if (!Number.isFinite(value) || !Array.isArray(referenceValues)) {
    return null;
  }

  const sorted = referenceValues
    .filter((entry) => Number.isFinite(entry))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length === 1) {
    return 0.5;
  }

  let less = 0;
  let equal = 0;

  for (const entry of sorted) {
    if (entry < value) {
      less += 1;
    } else if (entry === value) {
      equal += 1;
    }
  }

  const midIndex = equal > 0 ? less + (equal - 1) / 2 : less;
  return clampProbability(midIndex / (sorted.length - 1));
}

function getRankThreshold(rankThresholds, key) {
  return toFiniteNumber(rankThresholds?.[key] ?? rankThresholds?.ranks?.[key]);
}

export function getDecisionLeadAgeBucketId(seconds) {
  const value = toFiniteNumber(seconds);

  if (value === null) {
    return "unknown";
  }

  for (const bucket of DECISION_LEAD_AGE_BUCKETS) {
    const aboveMin = bucket.min == null || value >= bucket.min;
    const belowMax = bucket.max == null || value < bucket.max;

    if (aboveMin && belowMax) {
      return bucket.id;
    }
  }

  return DECISION_LEAD_AGE_BUCKETS[DECISION_LEAD_AGE_BUCKETS.length - 1].id;
}

export function getDecisionMomentumAgreementBucketId(features) {
  if (features?.momentum30sAgreesWithLeader === true) {
    return MOMENTUM_AGREEMENT_IDS.AGREES;
  }

  if (features?.momentum30sAgreesWithLeader === false) {
    return MOMENTUM_AGREEMENT_IDS.DISAGREES;
  }

  if (features?.momentum30sSide === "flat") {
    return MOMENTUM_AGREEMENT_IDS.FLAT;
  }

  return MOMENTUM_AGREEMENT_IDS.UNKNOWN;
}

function getDecisionChopBucketId(preChopRank, rankThresholds) {
  const low = getRankThreshold(rankThresholds, "lowThreshold");
  const high = getRankThreshold(rankThresholds, "highThreshold");
  const degenerate = Boolean(
    rankThresholds?.degenerate ?? rankThresholds?.ranks?.degenerate,
  );

  if (!Number.isFinite(preChopRank) || !Number.isFinite(low) || !Number.isFinite(high)) {
    return "unknown";
  }

  if (degenerate) {
    return "medium";
  }

  if (preChopRank < low) {
    return "low";
  }

  if (preChopRank >= high) {
    return "high";
  }

  return "medium";
}

function getDecisionPrePathShape(features, { config, rankThresholds }) {
  if (
    features.prePathGood !== true ||
    !features.leader ||
    !config.targetCheckpoints.includes(features.checkpointSecond)
  ) {
    return PRE_PATH_SHAPE_IDS.UNKNOWN;
  }

  const nearLineHighThreshold = getRankThreshold(
    rankThresholds,
    "nearLineHighThreshold",
  );
  const oscillationHighThreshold = getRankThreshold(
    rankThresholds,
    "oscillationHighThreshold",
  );

  if (features.preChopBucket === "high") {
    return PRE_PATH_SHAPE_IDS.MULTI_FLIP_CHOP;
  }

  if (
    features.preChopBucket === "low" &&
    Number.isFinite(features.preCurrentLeadAgeSeconds) &&
    features.preCurrentLeadAgeSeconds >= 60 &&
    Number.isFinite(features.nearLineRank) &&
    Number.isFinite(nearLineHighThreshold) &&
    features.nearLineRank < nearLineHighThreshold
  ) {
    return PRE_PATH_SHAPE_IDS.CLEAN_LOCK;
  }

  if (
    Number.isFinite(features.preCurrentLeadAgeSeconds) &&
    features.preCurrentLeadAgeSeconds < 30
  ) {
    return PRE_PATH_SHAPE_IDS.RECENT_LOCK;
  }

  if (
    Number.isFinite(features.nearLineRank) &&
    Number.isFinite(features.oscillationRank) &&
    Number.isFinite(nearLineHighThreshold) &&
    Number.isFinite(oscillationHighThreshold) &&
    features.nearLineRank >= nearLineHighThreshold &&
    features.oscillationRank < oscillationHighThreshold
  ) {
    return PRE_PATH_SHAPE_IDS.NEAR_LINE_HEAVY;
  }

  return features.preChopBucket === "unknown"
    ? PRE_PATH_SHAPE_IDS.UNKNOWN
    : PRE_PATH_SHAPE_IDS.UNRESOLVED;
}

export function buildPreTFeatures({
  checkpointSecond,
  config = DECISION_CONFIG,
  leader,
  priceToBeat,
  rankOverrides = null,
  rankThresholds = null,
  recentPath = [],
  windowStartTs,
} = {}) {
  if (
    !Number.isFinite(windowStartTs) ||
    !Number.isFinite(checkpointSecond) ||
    checkpointSecond <= 0
  ) {
    return emptyPreTFeatures();
  }

  const allRows = normalizePathRows(recentPath, { priceToBeat, windowStartTs });
  const preRows = allRows.filter(
    (row) =>
      row.secondsFromWindowStart >= 0 &&
      row.secondsFromWindowStart <= checkpointSecond,
  );
  const cadenceMs = inferSnapshotCadenceMs(preRows);
  const checkpointTs = windowStartTs + checkpointSecond * 1000;
  const coverage = getCoverage(preRows, {
    cadenceMs,
    endTs: checkpointTs,
    startTs: windowStartTs,
  });

  if (!coverage.pathGood) {
    return emptyPreTFeatures({
      preMaxSnapshotGapMs: coverage.maxGapMs,
      prePathGood: false,
      preSnapshotCoveragePct: coverage.coveragePct,
    });
  }

  let currentStableSide = null;
  let currentStableAge = 0;
  let leaderAge = 0;
  let leaderDwell = 0;
  let longestLeaderStreak = 0;
  let preFlipCount = 0;
  let lastFlipSecond = null;
  const momentum30s = buildMomentum(preRows, {
    cadenceMs,
    checkpointSecond,
    leader,
    lookbackSeconds: 30,
  });
  const momentum60s = buildMomentum(preRows, {
    cadenceMs,
    checkpointSecond,
    leader,
    lookbackSeconds: 60,
  });

  for (let index = 0; index < preRows.length; index += 1) {
    const row = preRows[index];
    const nextSecond =
      preRows[index + 1]?.secondsFromWindowStart ?? checkpointSecond;
    const duration = Math.max(
      0,
      Math.min(checkpointSecond, nextSecond) - row.secondsFromWindowStart,
    );

    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (row.state === leader) {
      leaderDwell += duration;
    }

    if (currentStableSide === null) {
      currentStableSide = row.state;
      currentStableAge = duration;
    } else if (row.state === currentStableSide) {
      currentStableAge += duration;
    } else {
      preFlipCount += 1;
      lastFlipSecond = row.secondsFromWindowStart;
      currentStableSide = row.state;
      currentStableAge = duration;
    }

    if (currentStableSide === leader) {
      leaderAge = currentStableAge;
      longestLeaderStreak = Math.max(longestLeaderStreak, currentStableAge);
    }
  }

  const preNearLineSeconds = countNearLineSeconds(preRows, checkpointSecond);
  const nearLinePct = preNearLineSeconds / checkpointSecond;
  const preFlipRatePerMinute = preFlipCount / (checkpointSecond / 60);
  const nearLineReference = getReferenceValues(rankThresholds, [
    "preNearLinePct",
    "preNearLinePctValues",
    "preNearLinePctReferenceValues",
    "nearLinePct",
    "nearLinePcts",
    "nearLinePctValues",
    "nearLinePctReferenceValues",
  ]);
  const oscillationReference = getReferenceValues(rankThresholds, [
    "preFlipRate",
    "preFlipRates",
    "preFlipRatePerMinute",
    "preFlipRatePerMinuteValues",
    "preFlipRateReferenceValues",
  ]);
  const nearLineRank =
    toFiniteNumber(rankOverrides?.nearLineRank) ??
    rankAgainstReference(nearLineReference, nearLinePct);
  const oscillationRank =
    toFiniteNumber(rankOverrides?.oscillationRank) ??
    rankAgainstReference(oscillationReference, preFlipRatePerMinute);
  const pooledChopRank =
    toFiniteNumber(rankOverrides?.pooledChopRank) ??
    (Number.isFinite(nearLineRank) && Number.isFinite(oscillationRank)
      ? (nearLineRank + oscillationRank) / 2
      : null);
  const baseFeatures = {
    checkpointSecond,
    leadAgeBucket: getDecisionLeadAgeBucketId(
      leader && currentStableSide === leader ? Math.round(leaderAge) : 0,
    ),
    leader,
    leaderAlignedMomentum30sBps: momentum30s.leaderAlignedBps,
    leaderAlignedMomentum60sBps: momentum60s.leaderAlignedBps,
    momentum30sAgreesWithLeader: momentum30s.agreesWithLeader,
    momentum30sBps: momentum30s.momentumBps,
    momentum30sSide: momentum30s.side,
    momentum60sAgreesWithLeader: momentum60s.agreesWithLeader,
    momentum60sBps: momentum60s.momentumBps,
    momentum60sSide: momentum60s.side,
    nearLinePct,
    nearLineRank,
    oscillationRank,
    pooledChopRank,
    preChopBucket: getDecisionChopBucketId(pooledChopRank, rankThresholds),
    preCurrentLeadAgeSeconds:
      leader && currentStableSide === leader ? Math.round(leaderAge) : 0,
    preCrossCountLast60s: countCrossesLast60s(preRows, checkpointSecond),
    preDirectionChangeCount: countDirectionChanges(preRows),
    preFlipCount,
    preFlipRatePerMinute,
    preLastFlipAgeSeconds:
      lastFlipSecond === null ? null : checkpointSecond - lastFlipSecond,
    preLeaderDwellPct: leader ? leaderDwell / checkpointSecond : null,
    preLongestLeadStreakSeconds: Math.round(longestLeaderStreak),
    preMaxSnapshotGapMs: coverage.maxGapMs,
    preNearLinePct: nearLinePct,
    preNearLineSeconds,
    prePathGood: true,
    preRange60sBps: getRange(preRows, checkpointSecond, 60),
    preRange120sBps: getRange(preRows, checkpointSecond, 120),
    preRealizedVolatility60s: getVolatility(preRows, checkpointSecond, 60),
    preRealizedVolatility120s: getVolatility(preRows, checkpointSecond, 120),
    preSnapshotCoveragePct: coverage.coveragePct,
  };
  const withBuckets = {
    ...baseFeatures,
    momentumAgreementBucket: getDecisionMomentumAgreementBucketId(baseFeatures),
  };

  return {
    ...withBuckets,
    prePathShape: getDecisionPrePathShape(withBuckets, {
      config,
      rankThresholds,
    }),
  };
}

export function computeRiskFlags({
  config = DECISION_CONFIG,
  features,
  rankThresholds = null,
} = {}) {
  const safeFeatures = features ?? emptyPreTFeatures();
  const nearLineHighThreshold = getRankThreshold(
    rankThresholds,
    "nearLineHighThreshold",
  );
  const oscillationHighThreshold = getRankThreshold(
    rankThresholds,
    "oscillationHighThreshold",
  );
  const weakCoverage = safeFeatures.prePathGood !== true;
  const recentLock =
    safeFeatures.prePathShape === PRE_PATH_SHAPE_IDS.RECENT_LOCK ||
    (Number.isFinite(safeFeatures.preCurrentLeadAgeSeconds) &&
      safeFeatures.preCurrentLeadAgeSeconds < 30);
  const highChop =
    safeFeatures.preChopBucket === "high" ||
    (Number.isFinite(safeFeatures.pooledChopRank) &&
      Number.isFinite(getRankThreshold(rankThresholds, "highThreshold")) &&
      safeFeatures.pooledChopRank >= getRankThreshold(rankThresholds, "highThreshold"));
  const nearLineHeavy =
    safeFeatures.prePathShape === PRE_PATH_SHAPE_IDS.NEAR_LINE_HEAVY ||
    (Number.isFinite(safeFeatures.nearLineRank) &&
      Number.isFinite(safeFeatures.oscillationRank) &&
      Number.isFinite(nearLineHighThreshold) &&
      Number.isFinite(oscillationHighThreshold) &&
      safeFeatures.nearLineRank >= nearLineHighThreshold &&
      safeFeatures.oscillationRank < oscillationHighThreshold);
  const oscillationHigh =
    Number.isFinite(safeFeatures.oscillationRank) &&
    Number.isFinite(oscillationHighThreshold) &&
    safeFeatures.oscillationRank >= oscillationHighThreshold;
  const momentumAgainstLeader =
    safeFeatures.momentum30sAgreesWithLeader === false;
  const unknownPath =
    !weakCoverage &&
    (safeFeatures.prePathShape === PRE_PATH_SHAPE_IDS.UNKNOWN ||
      safeFeatures.preChopBucket === "unknown" ||
      !Number.isFinite(safeFeatures.nearLineRank) ||
      !Number.isFinite(safeFeatures.oscillationRank));
  const softRisks = {
    highChop,
    momentumAgainstLeader,
    nearLineHeavy,
    oscillationHigh,
  };
  const activeSoftRisks = Object.entries(softRisks)
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);

  return {
    activeSoftRisks,
    highChop,
    momentumAgainstLeader,
    nearLineHeavy,
    oscillationHigh,
    recentLock,
    softRiskCount: activeSoftRisks.length,
    tooManySoftRisks: activeSoftRisks.length > config.maxSoftRiskCount,
    unknownPath,
    weakCoverage,
  };
}

export function requiredDistanceBps(
  checkpointSecond,
  softRiskCount = 0,
  config = DECISION_CONFIG,
) {
  if (softRiskCount <= 0) {
    return config.cleanDistanceThresholdBps[checkpointSecond] ?? null;
  }

  if (softRiskCount === 1) {
    return config.oneSoftRiskDistanceThresholdBps[checkpointSecond] ?? null;
  }

  return config.twoSoftRiskDistanceThresholdBps[checkpointSecond] ?? null;
}

export function requiredEdge(
  checkpointSecond,
  softRiskCount = 0,
  config = DECISION_CONFIG,
) {
  const base = config.requiredEdge[checkpointSecond];

  if (!Number.isFinite(base)) {
    return null;
  }

  if (softRiskCount <= 0) {
    return base;
  }

  if (softRiskCount === 1) {
    return base + config.softRiskEdgeTax.one;
  }

  return base + config.softRiskEdgeTax.twoOrMore;
}

export function executionGate({
  checkpointSecond,
  config = DECISION_CONFIG,
  intendedSize = 1,
  leaderAsk,
  leaderSpread,
  leaderTopAskDepth,
  pEst,
  softRiskCount = 0,
} = {}) {
  const reasonCodes = [];
  const ask = toFiniteNumber(leaderAsk);
  const spread = toFiniteNumber(leaderSpread);
  const depth = toFiniteNumber(leaderTopAskDepth);
  const edge = ask === null || !Number.isFinite(pEst) ? null : pEst - ask;
  const edgeRequired = requiredEdge(checkpointSecond, softRiskCount, config);

  if (ask === null) {
    reasonCodes.push(REASON_CODES.LEADER_ASK_MISSING);
    return {
      accepted: false,
      edge,
      reasonCodes,
      requiredEdge: edgeRequired,
    };
  }

  if (!Number.isFinite(edge) || edgeRequired === null || edge < edgeRequired) {
    reasonCodes.push(REASON_CODES.NO_EV_AGAINST_TOP_ASK);
    return {
      accepted: false,
      edge,
      reasonCodes,
      requiredEdge: edgeRequired,
    };
  }

  if (spread === null) {
    reasonCodes.push(REASON_CODES.LEADER_SPREAD_MISSING);
    return {
      accepted: false,
      edge,
      reasonCodes,
      requiredEdge: edgeRequired,
    };
  }

  if (spread > config.maxSpread) {
    reasonCodes.push(REASON_CODES.WIDE_SPREAD);
    return {
      accepted: false,
      edge,
      reasonCodes,
      requiredEdge: edgeRequired,
    };
  }

  if (
    !Number.isFinite(depth) ||
    (Number.isFinite(intendedSize) && depth < intendedSize)
  ) {
    reasonCodes.push(REASON_CODES.INSUFFICIENT_TOP_ASK_DEPTH);
    return {
      accepted: false,
      edge,
      reasonCodes,
      requiredEdge: edgeRequired,
    };
  }

  return {
    accepted: true,
    edge,
    reasonCodes,
    requiredEdge: edgeRequired,
  };
}
