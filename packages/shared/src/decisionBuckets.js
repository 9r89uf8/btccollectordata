export const DECISION_DISTANCE_BUCKETS = Object.freeze([
  Object.freeze({ id: "le_0_5", label: "<=0.5 bps", max: 0.5 }),
  Object.freeze({ id: "0_5_1", label: "0.5-1 bps", min: 0.5, max: 1 }),
  Object.freeze({ id: "1_2", label: "1-2 bps", min: 1, max: 2 }),
  Object.freeze({ id: "2_3", label: "2-3 bps", min: 2, max: 3 }),
  Object.freeze({ id: "3_4", label: "3-4 bps", min: 3, max: 4 }),
  Object.freeze({ id: "4_5", label: "4-5 bps", min: 4, max: 5 }),
  Object.freeze({ id: "5_7_5", label: "5-7.5 bps", min: 5, max: 7.5 }),
  Object.freeze({ id: "7_5_10", label: "7.5-10 bps", min: 7.5, max: 10 }),
  Object.freeze({ id: "gt_10", label: ">10 bps", min: 10 }),
]);

export const DECISION_DISTANCE_BUCKET_IDS = Object.freeze(
  DECISION_DISTANCE_BUCKETS.map((bucket) => bucket.id),
);

export function getDecisionDistanceBucket(distanceBps) {
  if (!Number.isFinite(distanceBps)) {
    return null;
  }

  const absoluteDistanceBps = Math.abs(distanceBps);

  for (const bucket of DECISION_DISTANCE_BUCKETS) {
    const aboveMin =
      bucket.min == null || absoluteDistanceBps > bucket.min;
    const atOrBelowMax =
      bucket.max == null || absoluteDistanceBps <= bucket.max;

    if (aboveMin && atOrBelowMax) {
      return bucket;
    }
  }

  // Defensive fallback if future bucket definitions accidentally leave a gap.
  return DECISION_DISTANCE_BUCKETS[DECISION_DISTANCE_BUCKETS.length - 1];
}

export function getDecisionDistanceBucketId(distanceBps) {
  return getDecisionDistanceBucket(distanceBps)?.id ?? null;
}

export function isDecisionDistanceBucketId(value) {
  return DECISION_DISTANCE_BUCKET_IDS.includes(value);
}
