export const DEFAULT_SAMPLE_CADENCE_MS = 1000;
const RECENT_DIFF_SAMPLE_SIZE = 12;

function roundToNearestSecond(ms) {
  return Math.max(DEFAULT_SAMPLE_CADENCE_MS, Math.round(ms / 1000) * 1000);
}

export function inferSnapshotCadenceMs(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) {
    return DEFAULT_SAMPLE_CADENCE_MS;
  }

  const buckets = [...snapshots]
    .map((snapshot) => snapshot?.secondBucket)
    .filter((bucket) => Number.isFinite(bucket))
    .sort((a, b) => a - b);
  const roundedDiffs = [];

  for (let index = 1; index < buckets.length; index += 1) {
    const diff = buckets[index] - buckets[index - 1];

    if (diff > 0) {
      roundedDiffs.push(roundToNearestSecond(diff));
    }
  }

  if (roundedDiffs.length === 0) {
    return DEFAULT_SAMPLE_CADENCE_MS;
  }

  const recentDiffs = roundedDiffs.slice(-RECENT_DIFF_SAMPLE_SIZE);
  const counts = new Map();

  for (const diff of recentDiffs) {
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }

  let bestDiff = DEFAULT_SAMPLE_CADENCE_MS;
  let bestCount = -1;

  for (const [diff, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && diff < bestDiff)) {
      bestDiff = diff;
      bestCount = count;
    }
  }

  return bestDiff;
}

export function getCheckpointToleranceSeconds(sampleCadenceMs) {
  if (!Number.isFinite(sampleCadenceMs) || sampleCadenceMs <= 1000) {
    return 1;
  }

  return Math.max(1, Math.floor(sampleCadenceMs / 2000));
}

export function getExpectedBucketCount(startTs, endTs, sampleCadenceMs) {
  if (
    !Number.isFinite(startTs) ||
    !Number.isFinite(endTs) ||
    !Number.isFinite(sampleCadenceMs) ||
    sampleCadenceMs <= 0 ||
    endTs <= startTs
  ) {
    return 0;
  }

  return Math.ceil((endTs - startTs) / sampleCadenceMs);
}
