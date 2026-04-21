import { getCheckpointToleranceSeconds, inferSnapshotCadenceMs } from "./cadence.js";
import { MARKET_OUTCOMES } from "./market.js";

export const LIVE_SIGNAL_CHECKPOINTS = [
  { id: "t60", label: "T+60", second: 60 },
  { id: "t120", label: "T+120", second: 120 },
];

export const LIVE_SIGNAL_DISTANCE_BUCKETS = [
  { id: "10_20", label: "$10-$19.99", minUsd: 10, maxUsd: 20 },
  { id: "20_30", label: "$20-$29.99", minUsd: 20, maxUsd: 30 },
  { id: "30_50", label: "$30-$49.99", minUsd: 30, maxUsd: 50 },
  { id: "50_plus", label: "$50+", minUsd: 50, maxUsd: null },
];

export const LIVE_SIGNAL_QUALITY_BUCKETS = [
  { id: "quality_0_20", label: "0.00-0.19 (noisy)", min: 0, max: 0.2 },
  { id: "quality_20_35", label: "0.20-0.34 (mixed)", min: 0.2, max: 0.35 },
  { id: "quality_35_plus", label: "0.35+ (clean)", min: 0.35, max: null },
];

export const LIVE_CALL_RULE_DATE_RANGE = "7d";
export const LIVE_CALL_RULE_QUALITY = "all";
export const LIVE_CALL_RULE_MIN_SAMPLE_SIZE = 40;
export const LIVE_CALL_RULE_MIN_WIN_RATE = 0.7;
export const LIVE_CALL_REASON_LABELS = {
  checkpoint_not_reached: "Waiting for the first actionable checkpoint.",
  missing_anchor: "Price to beat is not available yet.",
  missing_checkpoint_btc: "No BTC snapshot was captured close enough to the checkpoint.",
  no_rule_match: "Current BTC state does not match a historically strong setup.",
};

const MOMENTUM_LOOKBACK_SECONDS = 30;
const NEAREST_BTC_TOLERANCE_SECONDS = 5;

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortSnapshotsBySecond(snapshots) {
  return [...snapshots].sort((a, b) => {
    if ((a?.secondBucket ?? 0) !== (b?.secondBucket ?? 0)) {
      return (a?.secondBucket ?? 0) - (b?.secondBucket ?? 0);
    }

    return (a?.ts ?? 0) - (b?.ts ?? 0);
  });
}

function dedupeSnapshotsBySecond(snapshots) {
  const bySecond = new Map();

  for (const snapshot of sortSnapshotsBySecond(snapshots)) {
    const secondBucket = snapshot?.secondBucket;

    if (!Number.isFinite(secondBucket)) {
      continue;
    }

    if (!bySecond.has(secondBucket)) {
      bySecond.set(secondBucket, snapshot);
    }
  }

  return [...bySecond.values()];
}

function getLiveSnapshots(snapshots) {
  return dedupeSnapshotsBySecond(
    (Array.isArray(snapshots) ? snapshots : []).filter(
      (snapshot) => snapshot?.phase === "live",
    ),
  );
}

function getValidBtcLiveSnapshots(liveSnapshots) {
  return liveSnapshots.filter(
    (snapshot) =>
      snapshot.secondsFromWindowStart >= 0 &&
      toFiniteNumber(snapshot.btcChainlink) !== null,
  );
}

function getNearestValidBtcSnapshot(
  snapshots,
  targetSecond,
  toleranceSeconds = NEAREST_BTC_TOLERANCE_SECONDS,
) {
  let closestSnapshot = null;
  let closestDistance = Infinity;

  for (const snapshot of snapshots) {
    const btcChainlink = toFiniteNumber(snapshot?.btcChainlink);

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

function sliceSnapshotsToCheckpoint(validSnapshots, checkpointSecond) {
  return validSnapshots.filter(
    (snapshot) =>
      snapshot.secondsFromWindowStart >= 0 &&
      snapshot.secondsFromWindowStart <= checkpointSecond,
  );
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
    .map((snapshot) => toFiniteNumber(snapshot?.btcChainlink))
    .filter((value) => value !== null);

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values) - Math.min(...values);
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

function computeAnchorCrossCount(snapshots, anchor, initialDirection = 0) {
  const normalizedAnchor = toFiniteNumber(anchor);

  if (normalizedAnchor === null || !Array.isArray(snapshots) || snapshots.length === 0) {
    return null;
  }

  let crossingCount = 0;
  let previousDirection = initialDirection;

  for (const snapshot of snapshots) {
    const btcChainlink = toFiniteNumber(snapshot?.btcChainlink);

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
    const btcChainlink = toFiniteNumber(snapshot?.btcChainlink);

    return btcChainlink !== null && btcChainlink > normalizedAnchor;
  }).length;

  return snapshots.length > 0 ? aboveCount / snapshots.length : null;
}

function computeMomentumIntoCheckpointUsd(validSnapshots, checkpointSecond) {
  const checkpointSnapshot = getNearestValidBtcSnapshot(
    validSnapshots,
    checkpointSecond,
  );
  const priorSnapshot = getNearestValidBtcSnapshot(
    validSnapshots,
    checkpointSecond - MOMENTUM_LOOKBACK_SECONDS,
  );
  const checkpointPrice = toFiniteNumber(checkpointSnapshot?.btcChainlink);
  const priorPrice = toFiniteNumber(priorSnapshot?.btcChainlink);

  if (checkpointPrice === null || priorPrice === null) {
    return null;
  }

  return checkpointPrice - priorPrice;
}

function getAnchorPrice(market) {
  return (
    toFiniteNumber(market?.priceToBeatOfficial) ??
    toFiniteNumber(market?.priceToBeatDerived) ??
    null
  );
}

function getDistanceBucket(absDeltaUsd) {
  if (!Number.isFinite(absDeltaUsd)) {
    return null;
  }

  return (
    LIVE_SIGNAL_DISTANCE_BUCKETS.find((bucket) => {
      if (absDeltaUsd < bucket.minUsd) {
        return false;
      }

      if (bucket.maxUsd == null) {
        return true;
      }

      return absDeltaUsd < bucket.maxUsd;
    }) ?? null
  );
}

function getQualityBucket(signalQualityScore) {
  if (!Number.isFinite(signalQualityScore)) {
    return null;
  }

  return (
    LIVE_SIGNAL_QUALITY_BUCKETS.find((bucket) => {
      if (signalQualityScore < bucket.min) {
        return false;
      }

      if (bucket.max == null) {
        return true;
      }

      return signalQualityScore < bucket.max;
    }) ?? null
  );
}

function getLatestObservedSecond(liveSnapshots) {
  if (!Array.isArray(liveSnapshots) || liveSnapshots.length === 0) {
    return null;
  }

  return liveSnapshots[liveSnapshots.length - 1]?.secondsFromWindowStart ?? null;
}

function buildCheckpointEvaluation(market, liveSnapshots, checkpoint) {
  const anchorPrice = getAnchorPrice(market);
  const sampleCadenceMs = inferSnapshotCadenceMs(liveSnapshots);
  const checkpointToleranceSeconds = getCheckpointToleranceSeconds(sampleCadenceMs);
  const latestObservedSecond = getLatestObservedSecond(liveSnapshots);

  if (anchorPrice === null) {
    return {
      checkpointId: checkpoint.id,
      checkpointLabel: checkpoint.label,
      checkpointSecond: checkpoint.second,
      reason: "missing_anchor",
      ready: false,
    };
  }

  if (
    latestObservedSecond == null ||
    latestObservedSecond < checkpoint.second - checkpointToleranceSeconds
  ) {
    return {
      checkpointId: checkpoint.id,
      checkpointLabel: checkpoint.label,
      checkpointSecond: checkpoint.second,
      reason: "checkpoint_not_reached",
      ready: false,
    };
  }

  const validSnapshots = getValidBtcLiveSnapshots(liveSnapshots);
  const checkpointSnapshot = getNearestValidBtcSnapshot(
    validSnapshots,
    checkpoint.second,
  );

  if (!checkpointSnapshot) {
    return {
      checkpointId: checkpoint.id,
      checkpointLabel: checkpoint.label,
      checkpointSecond: checkpoint.second,
      latestObservedSecond,
      reason: "missing_checkpoint_btc",
      ready: false,
    };
  }

  const predictiveSnapshots = sliceSnapshotsToCheckpoint(
    validSnapshots,
    checkpoint.second,
  );
  const checkpointBtcPrice = toFiniteNumber(checkpointSnapshot.btcChainlink);
  const deltaFromAnchorUsd =
    checkpointBtcPrice === null ? null : checkpointBtcPrice - anchorPrice;
  const absDeltaUsd =
    deltaFromAnchorUsd === null ? null : Math.abs(deltaFromAnchorUsd);
  const side =
    deltaFromAnchorUsd === null
      ? null
      : deltaFromAnchorUsd >= 0
        ? MARKET_OUTCOMES.UP
        : MARKET_OUTCOMES.DOWN;
  const displayedProbability =
    side === MARKET_OUTCOMES.UP
      ? toFiniteNumber(checkpointSnapshot.upDisplayed)
      : side === MARKET_OUTCOMES.DOWN
        ? toFiniteNumber(checkpointSnapshot.downDisplayed)
        : null;
  const btcPathLengthToCheckpointUsd =
    computeBtcPathLengthUsd(predictiveSnapshots);
  const signalQualityScore =
    deltaFromAnchorUsd === null ||
    btcPathLengthToCheckpointUsd === null ||
    btcPathLengthToCheckpointUsd <= 0
      ? null
      : Math.abs(deltaFromAnchorUsd) / btcPathLengthToCheckpointUsd;
  const distanceBucket = getDistanceBucket(absDeltaUsd);
  const qualityBucket = getQualityBucket(signalQualityScore);

  return {
    anchorCrossCountToCheckpoint: computeAnchorCrossCount(
      predictiveSnapshots,
      anchorPrice,
    ),
    anchorPrice,
    btcPathLengthToCheckpointUsd,
    btcPrice: checkpointBtcPrice,
    btcRangeToCheckpointUsd: computeBtcRangeUsd(predictiveSnapshots),
    checkpointId: checkpoint.id,
    checkpointLabel: checkpoint.label,
    checkpointSecond: checkpoint.second,
    deltaFromAnchorUsd,
    displayedProbability,
    distanceBucketId: distanceBucket?.id ?? null,
    distanceBucketLabel: distanceBucket?.label ?? null,
    latestObservedSecond,
    momentumIntoCheckpointUsd30s: computeMomentumIntoCheckpointUsd(
      validSnapshots,
      checkpoint.second,
    ),
    observationSecond: checkpointSnapshot.secondsFromWindowStart,
    qualityBucketId: qualityBucket?.id ?? null,
    qualityBucketLabel: qualityBucket?.label ?? null,
    ready: true,
    sampleCadenceMs,
    signalQualityScore,
    side,
    timeAboveAnchorShareToCheckpoint: computeTimeAboveAnchorShare(
      predictiveSnapshots,
      anchorPrice,
    ),
    validBtcBucketCountToCheckpoint: predictiveSnapshots.length,
  };
}

export function buildLiveMarketSignalReport({ markets, nowTs, snapshotsBySlug }) {
  const activeMarkets = Array.isArray(markets) ? markets : [];
  const snapshotsMap = snapshotsBySlug instanceof Map ? snapshotsBySlug : new Map();

  return activeMarkets
    .map((market) => {
      const liveSnapshots = getLiveSnapshots(snapshotsMap.get(market.slug) ?? []);
      const latestSnapshot = liveSnapshots[liveSnapshots.length - 1] ?? null;
      const latestObservedSecond = getLatestObservedSecond(liveSnapshots);
      const anchorPrice = getAnchorPrice(market);

      return {
        anchorPrice,
        currentBtcPrice: toFiniteNumber(latestSnapshot?.btcChainlink),
        currentDeltaFromAnchorUsd:
          anchorPrice === null || toFiniteNumber(latestSnapshot?.btcChainlink) === null
            ? null
            : toFiniteNumber(latestSnapshot?.btcChainlink) - anchorPrice,
        currentDownDisplayed: toFiniteNumber(latestSnapshot?.downDisplayed),
        currentSnapshotQuality: latestSnapshot?.sourceQuality ?? null,
        currentUpDisplayed: toFiniteNumber(latestSnapshot?.upDisplayed),
        evaluations: LIVE_SIGNAL_CHECKPOINTS.map((checkpoint) =>
          buildCheckpointEvaluation(market, liveSnapshots, checkpoint),
        ),
        latestObservedSecond,
        latestSnapshotTs: latestSnapshot?.ts ?? null,
        liveSnapshotsLoaded: liveSnapshots.length,
        market: {
          _id: market._id,
          active: market.active,
          captureMode: market.captureMode,
          dataQuality: market.dataQuality,
          marketId: market.marketId ?? null,
          outcomeLabels: market.outcomeLabels,
          priceToBeatDerived: market.priceToBeatDerived,
          priceToBeatOfficial: market.priceToBeatOfficial,
          question: market.question,
          slug: market.slug,
          windowEndTs: market.windowEndTs,
          windowStartTs: market.windowStartTs,
        },
        nowTs,
      };
    })
    .sort((a, b) => a.market.windowStartTs - b.market.windowStartTs);
}

export function getActiveCheckpointEvaluation(signal) {
  if (!signal?.evaluations || !Array.isArray(signal.evaluations)) {
    return null;
  }

  const latestObservedSecond = toFiniteNumber(signal.latestObservedSecond);

  if (latestObservedSecond === null) {
    return null;
  }

  const completedCheckpoints = LIVE_SIGNAL_CHECKPOINTS.filter(
    (checkpoint) =>
      latestObservedSecond >= checkpoint.second - NEAREST_BTC_TOLERANCE_SECONDS,
  );

  if (completedCheckpoints.length === 0) {
    return null;
  }

  const activeCheckpoint = completedCheckpoints[completedCheckpoints.length - 1];

  return (
    signal.evaluations.find(
      (evaluation) => evaluation.checkpointSecond === activeCheckpoint.second,
    ) ?? null
  );
}

export function matchHistoricalRule(evaluation, rules) {
  if (!evaluation?.ready || !Array.isArray(rules)) {
    return null;
  }

  return (
    rules.find(
      (rule) =>
        rule.checkpointSecond === evaluation.checkpointSecond &&
        rule.side === evaluation.side &&
        rule.distanceBucketId === evaluation.distanceBucketId &&
        rule.qualityBucketId === evaluation.qualityBucketId,
    ) ?? null
  );
}

export function buildLiveCall(signal, rules) {
  const activeEvaluation = getActiveCheckpointEvaluation(signal);

  if (!activeEvaluation) {
    return {
      activeEvaluation: null,
      label: "No trade",
      matchedRule: null,
      reason: LIVE_CALL_REASON_LABELS.checkpoint_not_reached,
      side: null,
      status: "watch",
    };
  }

  if (!activeEvaluation.ready) {
    return {
      activeEvaluation,
      label: "No clear call",
      matchedRule: null,
      reason:
        LIVE_CALL_REASON_LABELS[activeEvaluation.reason] ??
        LIVE_CALL_REASON_LABELS.no_rule_match,
      side: null,
      status: "watch",
    };
  }

  const matchedRule = matchHistoricalRule(activeEvaluation, rules);

  if (!matchedRule) {
    return {
      activeEvaluation,
      label: "No clear call",
      matchedRule: null,
      reason: LIVE_CALL_REASON_LABELS.no_rule_match,
      side: null,
      status: "watch",
    };
  }

  return {
    activeEvaluation,
    label: matchedRule.side === MARKET_OUTCOMES.UP ? "Call Up" : "Call Down",
    matchedRule,
    reason: `Matches ${activeEvaluation.checkpointLabel} ${matchedRule.side === MARKET_OUTCOMES.UP ? "Up" : "Down"} ${matchedRule.distanceBucketLabel} ${matchedRule.qualityBucketLabel}.`,
    side: matchedRule.side,
    status: matchedRule.side,
  };
}
