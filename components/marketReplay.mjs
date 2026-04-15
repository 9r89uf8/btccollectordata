import {
  getSecondsFromWindowStart,
  getSnapshotPhase,
} from "../packages/shared/src/snapshot.js";
import {
  DEFAULT_SAMPLE_CADENCE_MS,
  inferSnapshotCadenceMs,
} from "../packages/shared/src/cadence.js";

export const MISSING_SNAPSHOT_QUALITY = "missing";
export const DEFAULT_REPLAY_CADENCE_MS = DEFAULT_SAMPLE_CADENCE_MS;

export function getReplayCadenceMs(snapshots) {
  return inferSnapshotCadenceMs(snapshots);
}

function buildMissingTimelineEntry(market, secondBucket) {
  return {
    _id: `missing-${market.slug}-${secondBucket}`,
    btcBinance: null,
    btcChainlink: null,
    displayRuleUsed: "unknown",
    downAsk: null,
    downBid: null,
    downDepthAskTop: null,
    downDepthBidTop: null,
    downDisplayed: null,
    downLast: null,
    downMid: null,
    downSpread: null,
    marketId: market.marketId,
    marketSlug: market.slug,
    marketImbalance: null,
    missing: true,
    phase: getSnapshotPhase(secondBucket, market.windowStartTs, market.windowEndTs),
    secondBucket,
    secondsFromWindowStart: getSecondsFromWindowStart(
      secondBucket,
      market.windowStartTs,
    ),
    sourceQuality: MISSING_SNAPSHOT_QUALITY,
    ts: secondBucket,
    upAsk: null,
    upBid: null,
    upDepthAskTop: null,
    upDepthBidTop: null,
    upDisplayed: null,
    upLast: null,
    upMid: null,
    upSpread: null,
    writtenAt: null,
  };
}

export function buildReplayTimeline(market, snapshots) {
  if (!market || !Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      cadenceMs: DEFAULT_REPLAY_CADENCE_MS,
      timeline: [],
    };
  }

  const sortedSnapshots = [...snapshots].sort((a, b) => a.secondBucket - b.secondBucket);
  const cadenceMs = getReplayCadenceMs(sortedSnapshots);
  const timeline = [
    {
      ...sortedSnapshots[0],
      missing: false,
    },
  ];

  for (let index = 1; index < sortedSnapshots.length; index += 1) {
    const previous = sortedSnapshots[index - 1];
    const current = sortedSnapshots[index];

    for (
      let bucket = previous.secondBucket + cadenceMs;
      bucket < current.secondBucket;
      bucket += cadenceMs
    ) {
      timeline.push(buildMissingTimelineEntry(market, bucket));
    }

    timeline.push({
      ...current,
      missing: false,
    });
  }

  return {
    cadenceMs,
    timeline,
  };
}

export function getReplayCoverage(timeline) {
  const coverage = {
    goodCount: 0,
    liveMissingCount: 0,
    liveObservedCount: 0,
    loadedSeconds: timeline.length,
    missingCount: 0,
    nonGoodCount: 0,
    observedCount: 0,
  };

  for (const item of timeline) {
    if (item.missing) {
      coverage.missingCount += 1;

      if (item.phase === "live") {
        coverage.liveMissingCount += 1;
      }

      continue;
    }

    coverage.observedCount += 1;

    if (item.phase === "live") {
      coverage.liveObservedCount += 1;
    }

    if (item.sourceQuality === "good") {
      coverage.goodCount += 1;
      continue;
    }

    coverage.nonGoodCount += 1;
  }

  return coverage;
}

export function getQualityBreakdown(timeline) {
  const counts = {
    gap: 0,
    good: 0,
    missing: 0,
    stale_book: 0,
    stale_btc: 0,
  };

  for (const item of timeline) {
    const key = item.sourceQuality ?? MISSING_SNAPSHOT_QUALITY;

    if (Object.hasOwn(counts, key)) {
      counts[key] += 1;
    }
  }

  return counts;
}

export function findLatestReplayIssue(timeline) {
  return [...timeline]
    .reverse()
    .find((item) => item.missing || item.sourceQuality !== "good") ?? null;
}
