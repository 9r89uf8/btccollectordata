import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";
import {
  getCheckpointToleranceSeconds,
  getExpectedBucketCount,
  inferSnapshotCadenceMs,
} from "./cadence.js";

export const SUMMARY_CHECKPOINT_SECONDS = [0, 15, 30, 60, 120, 240, 295];
export const REQUIRED_CHECKPOINT_SECONDS = [0, 15, 30, 60, 120];
const BTC_WINNING_SIDE_DISTANCE_THRESHOLDS_USD = [10, 20, 30];
const BTC_PATH_METRIC_CHECKPOINT_SECONDS = [60, 120];
const BTC_PATH_MOMENTUM_LOOKBACK_SECONDS = 30;
const BTC_PATH_NEAREST_SAMPLE_TOLERANCE_SECONDS = 5;

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortSnapshotsBySecond(snapshots) {
  return [...snapshots].sort((a, b) => a.secondBucket - b.secondBucket);
}

function dedupeSnapshotsBySecond(snapshots) {
  const seen = new Set();
  const deduped = [];

  for (const snapshot of sortSnapshotsBySecond(snapshots)) {
    const key = snapshot.secondBucket;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(snapshot);
  }

  return deduped;
}

function getLiveSnapshots(snapshots) {
  return dedupeSnapshotsBySecond(
    snapshots.filter((snapshot) => snapshot.phase === "live"),
  );
}

function getSnapshotsWithBtc(snapshots) {
  return sortSnapshotsBySecond(
    snapshots.filter((snapshot) => toFiniteNumber(snapshot.btcChainlink) !== null),
  );
}

function getNonPreSnapshots(snapshots) {
  return dedupeSnapshotsBySecond(
    snapshots.filter((snapshot) => snapshot.phase !== "pre"),
  );
}

function createBoundaryReference({
  binancePrice = null,
  chainlinkPrice = null,
  snapshot = null,
  source = "missing",
  ts = null,
} = {}) {
  return {
    binancePrice: toFiniteNumber(binancePrice),
    chainlinkPrice: toFiniteNumber(chainlinkPrice),
    snapshot,
    source,
    ts: toFiniteNumber(ts),
  };
}

function normalizeBoundaryReference(reference, fallbackReference) {
  if (!reference) {
    return fallbackReference;
  }

  return createBoundaryReference({
    binancePrice: reference.binancePrice ?? fallbackReference.binancePrice,
    chainlinkPrice:
      reference.chainlinkPrice ??
      reference.price ??
      fallbackReference.chainlinkPrice,
    snapshot: reference.snapshot ?? fallbackReference.snapshot,
    source: reference.source ?? fallbackReference.source,
    ts: reference.ts ?? fallbackReference.ts,
  });
}

function getCheckpointSnapshot(
  liveSnapshots,
  checkpointSecond,
  toleranceSeconds,
) {
  let closestSnapshot = null;
  let closestDistance = Infinity;

  for (const snapshot of liveSnapshots) {
    const distance = Math.abs(
      snapshot.secondsFromWindowStart - checkpointSecond,
    );

    if (distance > toleranceSeconds) {
      continue;
    }

    if (
      distance < closestDistance ||
      (distance === closestDistance &&
        snapshot.secondsFromWindowStart <
          (closestSnapshot?.secondsFromWindowStart ?? Infinity))
    ) {
      closestSnapshot = snapshot;
      closestDistance = distance;
    }
  }

  return closestSnapshot;
}

function getCheckpointValue(
  liveSnapshots,
  checkpointSecond,
  fieldName,
  toleranceSeconds,
) {
  return toFiniteNumber(
    getCheckpointSnapshot(liveSnapshots, checkpointSecond, toleranceSeconds)?.[fieldName],
  );
}

function getBtcDeltaFromAnchorAtCheckpoint(
  liveSnapshots,
  checkpointSecond,
  anchor,
  toleranceSeconds,
) {
  const normalizedAnchor = toFiniteNumber(anchor);
  const btcPrice = getCheckpointValue(
    liveSnapshots,
    checkpointSecond,
    "btcChainlink",
    toleranceSeconds,
  );

  if (normalizedAnchor === null || btcPrice === null) {
    return null;
  }

  return btcPrice - normalizedAnchor;
}

function getExpectedLiveBuckets(market, sampleCadenceMs) {
  return getExpectedBucketCount(
    market.windowStartTs,
    market.windowEndTs,
    sampleCadenceMs,
  );
}

function getExpectedLiveDurationSeconds(market) {
  return Math.max(
    0,
    Math.round((market.windowEndTs - market.windowStartTs) / 1000),
  );
}

function getStartReferenceSnapshot(snapshots) {
  const withBtc = getSnapshotsWithBtc(snapshots);
  const live = withBtc.find((snapshot) => snapshot.phase === "live");

  if (live) {
    return createBoundaryReference({
      binancePrice: live.btcBinance,
      chainlinkPrice: live.btcChainlink,
      snapshot: live,
      source: "live",
      ts: live.ts,
    });
  }

  const pre = [...withBtc]
    .reverse()
    .find((snapshot) => snapshot.phase === "pre");

  if (pre) {
    return createBoundaryReference({
      binancePrice: pre.btcBinance,
      chainlinkPrice: pre.btcChainlink,
      snapshot: pre,
      source: "pre",
      ts: pre.ts,
    });
  }

  return createBoundaryReference();
}

function getEndReferenceSnapshot(snapshots) {
  const withBtc = getSnapshotsWithBtc(snapshots);
  const post = withBtc.find((snapshot) => snapshot.phase === "post");

  if (post) {
    return createBoundaryReference({
      binancePrice: post.btcBinance,
      chainlinkPrice: post.btcChainlink,
      snapshot: post,
      source: "post",
      ts: post.ts,
    });
  }

  const live = [...withBtc]
    .reverse()
    .find((snapshot) => snapshot.phase === "live");

  if (live) {
    return createBoundaryReference({
      binancePrice: live.btcBinance,
      chainlinkPrice: live.btcChainlink,
      snapshot: live,
      source: "live",
      ts: live.ts,
    });
  }

  return createBoundaryReference();
}

function deriveOutcomeFromReferences(startPrice, endPrice) {
  if (startPrice === null || endPrice === null) {
    return null;
  }

  return endPrice >= startPrice ? MARKET_OUTCOMES.UP : MARKET_OUTCOMES.DOWN;
}

function computeStats(liveSnapshots) {
  const values = liveSnapshots
    .map((snapshot) => toFiniteNumber(snapshot.upDisplayed))
    .filter((value) => value !== null);

  if (values.length === 0) {
    return {
      upMax: null,
      upMaxDrawdown: null,
      upMin: null,
      upRange: null,
      upStdDev: null,
    };
  }

  const upMax = Math.max(...values);
  const upMin = Math.min(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  let runningPeak = -Infinity;
  let maxDrawdown = 0;

  for (const value of values) {
    runningPeak = Math.max(runningPeak, value);
    maxDrawdown = Math.max(maxDrawdown, runningPeak - value);
  }

  return {
    upMax,
    upMaxDrawdown: maxDrawdown,
    upMin,
    upRange: upMax - upMin,
    upStdDev: Math.sqrt(variance),
  };
}

function getFirstCrossingTime(liveSnapshots, threshold) {
  const crossing = liveSnapshots.find(
    (snapshot) => toFiniteNumber(snapshot.upDisplayed) !== null && snapshot.upDisplayed >= threshold,
  );

  return crossing ? crossing.secondsFromWindowStart : null;
}

function matchesWinner(delta, winner) {
  if (delta === null || !winner) {
    return false;
  }

  if (winner === MARKET_OUTCOMES.UP) {
    return delta >= 0;
  }

  return delta < 0;
}

function matchesWinnerByDistance(delta, winner, minWinningDistanceUsd = 0) {
  if (delta === null || !winner) {
    return false;
  }

  const threshold = Math.max(0, minWinningDistanceUsd);

  if (winner === MARKET_OUTCOMES.UP) {
    return delta >= threshold;
  }

  return delta <= -threshold;
}

function computeFirstBtcWinningSideSecond({
  anchor,
  liveSnapshots,
  minWinningDistanceUsd = 0,
  winner,
}) {
  const normalizedAnchor = toFiniteNumber(anchor);

  if (normalizedAnchor === null || !winner) {
    return null;
  }
  const winningSnapshot = liveSnapshots.find((snapshot) => {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    if (btcChainlink === null) {
      return false;
    }

    return matchesWinnerByDistance(
      btcChainlink - normalizedAnchor,
      winner,
      minWinningDistanceUsd,
    );
  });

  return winningSnapshot ? winningSnapshot.secondsFromWindowStart : null;
}

function getNearestValidBtcSnapshot(
  snapshots,
  targetSecond,
  toleranceSeconds = BTC_PATH_NEAREST_SAMPLE_TOLERANCE_SECONDS,
) {
  let closestSnapshot = null;
  let closestDistance = Infinity;

  for (const snapshot of snapshots) {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    if (btcChainlink === null) {
      continue;
    }

    const distance = Math.abs(snapshot.secondsFromWindowStart - targetSecond);

    if (distance > toleranceSeconds) {
      continue;
    }

    if (
      distance < closestDistance ||
      (distance === closestDistance &&
        snapshot.secondsFromWindowStart <
          (closestSnapshot?.secondsFromWindowStart ?? Infinity))
    ) {
      closestSnapshot = snapshot;
      closestDistance = distance;
    }
  }

  return closestSnapshot;
}

function getBtcPathSnapshots(sortedSnapshots, expectedLiveDurationSeconds) {
  return getNonPreSnapshots(sortedSnapshots).filter((snapshot) => {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    return (
      btcChainlink !== null &&
      snapshot.secondsFromWindowStart >= 0 &&
      snapshot.secondsFromWindowStart <= expectedLiveDurationSeconds
    );
  });
}

function sliceBtcSnapshotsToCheckpoint(btcPathSnapshots, checkpointSecond) {
  return btcPathSnapshots.filter(
    (snapshot) =>
      snapshot.phase === "live" &&
      snapshot.secondsFromWindowStart >= 0 &&
      snapshot.secondsFromWindowStart <= checkpointSecond,
  );
}

function sliceBtcSnapshotsAfterCheckpoint(
  btcPathSnapshots,
  checkpointSecond,
  expectedLiveDurationSeconds,
) {
  return btcPathSnapshots.filter(
    (snapshot) =>
      snapshot.secondsFromWindowStart > checkpointSecond &&
      snapshot.secondsFromWindowStart <= expectedLiveDurationSeconds,
  );
}

function getAnchorDirection(delta, previousDirection = 0) {
  if (delta > 0) {
    return 1;
  }

  if (delta < 0) {
    return -1;
  }

  return previousDirection;
}

function getRawAnchorDirection(delta) {
  if (delta > 0) {
    return 1;
  }

  if (delta < 0) {
    return -1;
  }

  return 0;
}

function computeBtcPathLengthUsd(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return null;
  }

  if (snapshots.length === 1) {
    return 0;
  }

  let total = 0;

  for (let index = 1; index < snapshots.length; index += 1) {
    const currentPrice = toFiniteNumber(snapshots[index]?.btcChainlink);
    const previousPrice = toFiniteNumber(snapshots[index - 1]?.btcChainlink);

    if (currentPrice === null || previousPrice === null) {
      continue;
    }

    total += Math.abs(currentPrice - previousPrice);
  }

  return total;
}

function computeBtcRangeUsd(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return null;
  }

  const values = snapshots
    .map((snapshot) => toFiniteNumber(snapshot.btcChainlink))
    .filter((value) => value !== null);

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values) - Math.min(...values);
}

function computeAnchorCrossCount(snapshots, anchor, initialDirection = 0) {
  const normalizedAnchor = toFiniteNumber(anchor);

  if (normalizedAnchor === null || !Array.isArray(snapshots) || snapshots.length === 0) {
    return null;
  }

  let crossingCount = 0;
  let previousDirection = initialDirection;

  for (const snapshot of snapshots) {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    if (btcChainlink === null) {
      continue;
    }

    const currentDirection = getAnchorDirection(
      btcChainlink - normalizedAnchor,
      previousDirection,
    );

    if (
      previousDirection !== 0 &&
      currentDirection !== 0 &&
      currentDirection !== previousDirection
    ) {
      crossingCount += 1;
    }

    previousDirection = currentDirection;
  }

  return crossingCount;
}

function computeTimeAboveAnchorShare(snapshots, anchor) {
  const normalizedAnchor = toFiniteNumber(anchor);

  if (normalizedAnchor === null || !Array.isArray(snapshots) || snapshots.length === 0) {
    return null;
  }

  const aboveCount = snapshots.filter((snapshot) => {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    return btcChainlink !== null && btcChainlink > normalizedAnchor;
  }).length;

  return aboveCount / snapshots.length;
}

function computeTimeOnWinningSideShare(snapshots, anchor, winner) {
  const normalizedAnchor = toFiniteNumber(anchor);

  if (
    normalizedAnchor === null ||
    !winner ||
    !Array.isArray(snapshots) ||
    snapshots.length === 0
  ) {
    return null;
  }

  const winningSideCount = snapshots.filter((snapshot) => {
    const btcChainlink = toFiniteNumber(snapshot.btcChainlink);

    return btcChainlink !== null && matchesWinner(btcChainlink - normalizedAnchor, winner);
  }).length;

  return winningSideCount / snapshots.length;
}

function computeMomentumIntoCheckpointUsd(liveSnapshots, checkpointSecond) {
  const checkpointSnapshot = getNearestValidBtcSnapshot(
    liveSnapshots,
    checkpointSecond,
  );
  const priorSnapshot = getNearestValidBtcSnapshot(
    liveSnapshots,
    checkpointSecond - BTC_PATH_MOMENTUM_LOOKBACK_SECONDS,
  );
  const checkpointPrice = toFiniteNumber(checkpointSnapshot?.btcChainlink);
  const priorPrice = toFiniteNumber(priorSnapshot?.btcChainlink);

  if (checkpointPrice === null || priorPrice === null) {
    return null;
  }

  return checkpointPrice - priorPrice;
}

function computeMaxAdverseExcursionUsd({
  checkpointPrice,
  laterSnapshots,
  winner,
}) {
  const normalizedCheckpointPrice = toFiniteNumber(checkpointPrice);

  if (
    normalizedCheckpointPrice === null ||
    !winner ||
    !Array.isArray(laterSnapshots) ||
    laterSnapshots.length === 0
  ) {
    return null;
  }

  let maxAdverseExcursionUsd = 0;

  for (const snapshot of laterSnapshots) {
    const laterPrice = toFiniteNumber(snapshot.btcChainlink);

    if (laterPrice === null) {
      continue;
    }

    const adverseMoveUsd =
      winner === MARKET_OUTCOMES.UP
        ? normalizedCheckpointPrice - laterPrice
        : laterPrice - normalizedCheckpointPrice;

    maxAdverseExcursionUsd = Math.max(
      maxAdverseExcursionUsd,
      adverseMoveUsd,
      0,
    );
  }

  return maxAdverseExcursionUsd;
}

function buildBtcPathMetrics({
  anchor,
  btcPathSnapshots,
  expectedLiveDurationSeconds,
  liveSnapshots,
  winner,
}) {
  const normalizedAnchor = toFiniteNumber(anchor);

  return Object.fromEntries(
    BTC_PATH_METRIC_CHECKPOINT_SECONDS.map((checkpointSecond) => {
      const predictiveSnapshots = sliceBtcSnapshotsToCheckpoint(
        btcPathSnapshots,
        checkpointSecond,
      );
      const postCheckpointSnapshots = sliceBtcSnapshotsAfterCheckpoint(
        btcPathSnapshots,
        checkpointSecond,
        expectedLiveDurationSeconds,
      );
      const checkpointSnapshot = getNearestValidBtcSnapshot(
        liveSnapshots,
        checkpointSecond,
      );
      const checkpointPrice = toFiniteNumber(checkpointSnapshot?.btcChainlink);
      const checkpointDirection =
        normalizedAnchor === null || checkpointPrice === null
          ? 0
          : getRawAnchorDirection(checkpointPrice - normalizedAnchor);

      return [
        checkpointSecond,
        {
          anchorCrossCountAfter:
            normalizedAnchor === null || postCheckpointSnapshots.length === 0
              ? null
              : computeAnchorCrossCount(
                  postCheckpointSnapshots,
                  normalizedAnchor,
                  checkpointDirection,
                ),
          anchorCrossCountTo:
            normalizedAnchor === null || predictiveSnapshots.length === 0
              ? null
              : computeAnchorCrossCount(predictiveSnapshots, normalizedAnchor),
          btcPathLengthToUsd: computeBtcPathLengthUsd(predictiveSnapshots),
          btcRangeToUsd: computeBtcRangeUsd(predictiveSnapshots),
          maxAdverseExcursionFromUsd: computeMaxAdverseExcursionUsd({
            checkpointPrice,
            laterSnapshots: postCheckpointSnapshots,
            winner,
          }),
          momentumIntoUsd30s: computeMomentumIntoCheckpointUsd(
            liveSnapshots,
            checkpointSecond,
          ),
          residualPathLengthFromUsd: computeBtcPathLengthUsd(
            postCheckpointSnapshots,
          ),
          residualRangeFromUsd: computeBtcRangeUsd(postCheckpointSnapshots),
          timeAboveAnchorShareTo:
            normalizedAnchor === null || predictiveSnapshots.length === 0
              ? null
              : computeTimeAboveAnchorShare(
                  predictiveSnapshots,
                  normalizedAnchor,
                ),
          timeOnWinningSideShareAfter:
            normalizedAnchor === null ||
            postCheckpointSnapshots.length === 0 ||
            !winner
              ? null
              : computeTimeOnWinningSideShare(
                  postCheckpointSnapshots,
                  normalizedAnchor,
                  winner,
                ),
          validBtcBucketCountAfter: postCheckpointSnapshots.length,
          validBtcBucketCountTo: predictiveSnapshots.length,
        },
      ];
    }),
  );
}

function buildQualityFlags({
  btcPathConflictsResolved,
  btcWinningSideMissingAnchor,
  btcWinningSideNoBtcData,
  checkpointValues,
  endReference,
  expectedLiveDurationSeconds,
  expectedLiveBuckets,
  liveSnapshots,
  missingLiveBuckets,
  resolvedOutcome,
  sampleCadenceMs,
  startReference,
  usedDerivedOutcome,
}) {
  const flags = [];

  if (!resolvedOutcome) {
    flags.push("missing_resolved_outcome");
  }

  if (btcWinningSideMissingAnchor) {
    flags.push("btc_winning_side_missing_anchor");
  }

  if (btcWinningSideNoBtcData) {
    flags.push("btc_winning_side_no_btc_data");
  }

  if (btcPathConflictsResolved) {
    flags.push("btc_path_conflicts_resolved");
  }

  if (usedDerivedOutcome) {
    flags.push("winner_derived_from_references");
  }

  if (startReference.chainlinkPrice === null) {
    flags.push("missing_start_reference");
  } else if (startReference.source === "pre") {
    flags.push("start_reference_from_pre");
  }

  if (endReference.chainlinkPrice === null) {
    flags.push("missing_end_reference");
  } else if (endReference.source === "live") {
    flags.push("end_reference_from_live");
  }

  if (liveSnapshots.length === 0) {
    flags.push("no_live_snapshots");
  }

  flags.push(`sample_cadence_ms:${sampleCadenceMs}`);

  if (missingLiveBuckets > 0) {
    flags.push(`missing_live_buckets:${missingLiveBuckets}`);
  }

  const staleBookCount = liveSnapshots.filter(
    (snapshot) => snapshot.sourceQuality === "stale_book",
  ).length;
  const staleBtcCount = liveSnapshots.filter(
    (snapshot) => snapshot.sourceQuality === "stale_btc",
  ).length;
  const gapCount = liveSnapshots.filter(
    (snapshot) => snapshot.sourceQuality === "gap",
  ).length;

  if (staleBookCount > 0) {
    flags.push(`stale_book_buckets:${staleBookCount}`);
  }

  if (staleBtcCount > 0) {
    flags.push(`stale_btc_buckets:${staleBtcCount}`);
  }

  if (gapCount > 0) {
    flags.push(`gap_buckets:${gapCount}`);
  }

  for (const checkpointSecond of REQUIRED_CHECKPOINT_SECONDS) {
    if (
      checkpointSecond < expectedLiveDurationSeconds &&
      checkpointValues[checkpointSecond] === null
    ) {
      flags.push(`missing_checkpoint_t${checkpointSecond}`);
    }
  }

  return flags;
}

function deriveQuality({
  checkpointValues,
  expectedLiveDurationSeconds,
  endReference,
  expectedLiveBuckets,
  liveSnapshots,
  missingLiveBuckets,
  resolvedOutcome,
  startReference,
}) {
  const missingRequiredCheckpoint = REQUIRED_CHECKPOINT_SECONDS.some(
    (checkpointSecond) =>
      checkpointSecond < expectedLiveDurationSeconds &&
      checkpointValues[checkpointSecond] === null,
  );
  const nonGoodSnapshotExists = liveSnapshots.some(
    (snapshot) => snapshot.sourceQuality !== "good",
  );

  if (
    !resolvedOutcome ||
    startReference.chainlinkPrice === null ||
    endReference.chainlinkPrice === null ||
    liveSnapshots.length === 0 ||
    missingLiveBuckets >= Math.max(1, Math.ceil(expectedLiveBuckets * 0.2))
  ) {
    return DATA_QUALITY.GAP;
  }

  if (missingLiveBuckets > 0 || missingRequiredCheckpoint || nonGoodSnapshotExists) {
    return DATA_QUALITY.PARTIAL;
  }

  return DATA_QUALITY.GOOD;
}

export function buildMarketSummary({
  market,
  snapshots,
  boundaryReferences,
  nowTs = Date.now(),
}) {
  const sortedSnapshots = sortSnapshotsBySecond(Array.isArray(snapshots) ? snapshots : []);
  const liveSnapshots = getLiveSnapshots(sortedSnapshots);
  const sampleCadenceMs = inferSnapshotCadenceMs(liveSnapshots);
  const checkpointToleranceSeconds = getCheckpointToleranceSeconds(sampleCadenceMs);
  const expectedLiveDurationSeconds = getExpectedLiveDurationSeconds(market);
  const expectedLiveBuckets = getExpectedLiveBuckets(market, sampleCadenceMs);
  const missingLiveBuckets = Math.max(expectedLiveBuckets - liveSnapshots.length, 0);
  const startReference = normalizeBoundaryReference(
    boundaryReferences?.start,
    getStartReferenceSnapshot(sortedSnapshots),
  );
  const endReference = normalizeBoundaryReference(
    boundaryReferences?.end,
    getEndReferenceSnapshot(sortedSnapshots),
  );
  const btcPathSnapshots = getBtcPathSnapshots(
    sortedSnapshots,
    expectedLiveDurationSeconds,
  );
  const derivedOutcome = deriveOutcomeFromReferences(
    startReference.chainlinkPrice,
    endReference.chainlinkPrice,
  );
  const resolvedOutcome = market.winningOutcome ?? derivedOutcome;
  const winningSideAnchor =
    market.priceToBeatOfficial ?? startReference.chainlinkPrice;
  const usedDerivedOutcome = market.winningOutcome == null && derivedOutcome != null;
  const btcWinningSideMissingAnchor =
    toFiniteNumber(winningSideAnchor) === null;
  const btcPathConflictsResolved =
    market.winningOutcome != null &&
    derivedOutcome != null &&
    market.winningOutcome !== derivedOutcome;
  const winningSideTiming = computeFirstBtcWinningSideSecond({
    anchor: winningSideAnchor,
    liveSnapshots,
    winner: resolvedOutcome,
  });
  const winningSideDistanceTimings = Object.fromEntries(
    BTC_WINNING_SIDE_DISTANCE_THRESHOLDS_USD.map((thresholdUsd) => [
      thresholdUsd,
      computeFirstBtcWinningSideSecond({
        anchor: winningSideAnchor,
        liveSnapshots,
        minWinningDistanceUsd: thresholdUsd,
        winner: resolvedOutcome,
      }),
    ]),
  );
  const btcWinningSideNoBtcData =
    liveSnapshots.filter(
      (snapshot) => toFiniteNumber(snapshot.btcChainlink) !== null,
    ).length === 0;
  const btcPathMetrics = buildBtcPathMetrics({
    anchor: winningSideAnchor,
    btcPathSnapshots,
    expectedLiveDurationSeconds,
    liveSnapshots,
    winner: resolvedOutcome,
  });
  const upCheckpointValues = Object.fromEntries(
    SUMMARY_CHECKPOINT_SECONDS.map((checkpointSecond) => [
      checkpointSecond,
      getCheckpointValue(
        liveSnapshots,
        checkpointSecond,
        "upDisplayed",
        checkpointToleranceSeconds,
      ),
    ]),
  );
  const downCheckpointValues = Object.fromEntries(
    SUMMARY_CHECKPOINT_SECONDS.map((checkpointSecond) => [
      checkpointSecond,
      getCheckpointValue(
        liveSnapshots,
        checkpointSecond,
        "downDisplayed",
        checkpointToleranceSeconds,
      ),
    ]),
  );
  const btcDeltaCheckpointValues = Object.fromEntries(
    SUMMARY_CHECKPOINT_SECONDS.map((checkpointSecond) => [
      checkpointSecond,
      getBtcDeltaFromAnchorAtCheckpoint(
        liveSnapshots,
        checkpointSecond,
        winningSideAnchor,
        checkpointToleranceSeconds,
      ),
    ]),
  );
  const stats = computeStats(liveSnapshots);
  const qualityFlags = buildQualityFlags({
    btcPathConflictsResolved,
    btcWinningSideMissingAnchor,
    btcWinningSideNoBtcData,
    checkpointValues: upCheckpointValues,
    endReference,
    expectedLiveDurationSeconds,
    expectedLiveBuckets,
    liveSnapshots,
    missingLiveBuckets,
    resolvedOutcome,
    sampleCadenceMs,
    startReference,
    usedDerivedOutcome,
  });
  const dataQuality = deriveQuality({
    checkpointValues: upCheckpointValues,
    expectedLiveDurationSeconds,
    endReference,
    expectedLiveBuckets,
    liveSnapshots,
    missingLiveBuckets,
    resolvedOutcome,
    startReference,
  });

  return {
    dataQuality,
    meta: {
      expectedLiveBuckets,
      liveSnapshotCount: liveSnapshots.length,
      missingLiveBuckets,
      sampleCadenceMs,
      usedDerivedOutcome,
    },
    qualityFlags,
    summary: {
      marketSlug: market.slug,
      marketId: market.marketId,
      windowStartTs: market.windowStartTs,
      windowEndTs: market.windowEndTs,
      resolvedOutcome,
      dataQuality,
      priceToBeatOfficial: market.priceToBeatOfficial ?? null,
      priceToBeatDerived: startReference.chainlinkPrice,
      closeReferencePriceOfficial: market.closeReferencePriceOfficial ?? null,
      closeReferencePriceDerived: endReference.chainlinkPrice,
      btcChainlinkAtStart: startReference.chainlinkPrice,
      btcChainlinkAtEnd: endReference.chainlinkPrice,
      btcBinanceAtStart: startReference.binancePrice,
      btcBinanceAtEnd: endReference.binancePrice,
      upDisplayedAtT0: upCheckpointValues[0],
      downDisplayedAtT0: downCheckpointValues[0],
      btcDeltaFromAnchorAtT0: btcDeltaCheckpointValues[0],
      upDisplayedAtT15: upCheckpointValues[15],
      downDisplayedAtT15: downCheckpointValues[15],
      btcDeltaFromAnchorAtT15: btcDeltaCheckpointValues[15],
      upDisplayedAtT30: upCheckpointValues[30],
      downDisplayedAtT30: downCheckpointValues[30],
      btcDeltaFromAnchorAtT30: btcDeltaCheckpointValues[30],
      upDisplayedAtT60: upCheckpointValues[60],
      downDisplayedAtT60: downCheckpointValues[60],
      btcDeltaFromAnchorAtT60: btcDeltaCheckpointValues[60],
      upDisplayedAtT120: upCheckpointValues[120],
      downDisplayedAtT120: downCheckpointValues[120],
      btcDeltaFromAnchorAtT120: btcDeltaCheckpointValues[120],
      upDisplayedAtT240: upCheckpointValues[240],
      downDisplayedAtT240: downCheckpointValues[240],
      btcDeltaFromAnchorAtT240: btcDeltaCheckpointValues[240],
      upDisplayedAtT295: upCheckpointValues[295],
      downDisplayedAtT295: downCheckpointValues[295],
      btcDeltaFromAnchorAtT295: btcDeltaCheckpointValues[295],
      upMax: stats.upMax,
      upMin: stats.upMin,
      upRange: stats.upRange,
      upStdDev: stats.upStdDev,
      upMaxDrawdown: stats.upMaxDrawdown,
      firstTimeAbove60: getFirstCrossingTime(liveSnapshots, 0.6),
      firstTimeAbove70: getFirstCrossingTime(liveSnapshots, 0.7),
      firstTimeAbove80: getFirstCrossingTime(liveSnapshots, 0.8),
      firstBtcWinningSideSecond: winningSideTiming,
      firstBtcWinningSideAt10UsdSecond: winningSideDistanceTimings[10],
      firstBtcWinningSideAt20UsdSecond: winningSideDistanceTimings[20],
      firstBtcWinningSideAt30UsdSecond: winningSideDistanceTimings[30],
      btcPathLengthTo60Usd: btcPathMetrics[60].btcPathLengthToUsd,
      btcPathLengthTo120Usd: btcPathMetrics[120].btcPathLengthToUsd,
      btcRangeTo60Usd: btcPathMetrics[60].btcRangeToUsd,
      btcRangeTo120Usd: btcPathMetrics[120].btcRangeToUsd,
      anchorCrossCountTo60: btcPathMetrics[60].anchorCrossCountTo,
      anchorCrossCountTo120: btcPathMetrics[120].anchorCrossCountTo,
      timeAboveAnchorShareTo60: btcPathMetrics[60].timeAboveAnchorShareTo,
      timeAboveAnchorShareTo120: btcPathMetrics[120].timeAboveAnchorShareTo,
      validBtcBucketCountTo60: btcPathMetrics[60].validBtcBucketCountTo,
      validBtcBucketCountTo120: btcPathMetrics[120].validBtcBucketCountTo,
      momentumInto60Usd30s: btcPathMetrics[60].momentumIntoUsd30s,
      momentumInto120Usd30s: btcPathMetrics[120].momentumIntoUsd30s,
      maxAdverseExcursionFrom60Usd:
        btcPathMetrics[60].maxAdverseExcursionFromUsd,
      maxAdverseExcursionFrom120Usd:
        btcPathMetrics[120].maxAdverseExcursionFromUsd,
      residualRangeFrom60Usd: btcPathMetrics[60].residualRangeFromUsd,
      residualRangeFrom120Usd: btcPathMetrics[120].residualRangeFromUsd,
      residualPathLengthFrom60Usd:
        btcPathMetrics[60].residualPathLengthFromUsd,
      residualPathLengthFrom120Usd:
        btcPathMetrics[120].residualPathLengthFromUsd,
      anchorCrossCountAfter60: btcPathMetrics[60].anchorCrossCountAfter,
      anchorCrossCountAfter120: btcPathMetrics[120].anchorCrossCountAfter,
      timeOnWinningSideShareAfter60:
        btcPathMetrics[60].timeOnWinningSideShareAfter,
      timeOnWinningSideShareAfter120:
        btcPathMetrics[120].timeOnWinningSideShareAfter,
      validBtcBucketCountAfter60: btcPathMetrics[60].validBtcBucketCountAfter,
      validBtcBucketCountAfter120:
        btcPathMetrics[120].validBtcBucketCountAfter,
      qualityFlags,
      finalizedAt: nowTs,
    },
  };
}
