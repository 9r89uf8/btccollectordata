import test from "node:test";
import assert from "node:assert/strict";

import {
  DISTANCE_BUCKETS,
  getDistanceBucket,
} from "./analyticsDashboard.js";
import {
  DECISION_DISTANCE_BUCKETS,
  DECISION_DISTANCE_BUCKET_IDS,
  getDecisionDistanceBucket,
  getDecisionDistanceBucketId,
  isDecisionDistanceBucketId,
} from "./decisionBuckets.js";

const normalizeBuckets = (buckets) =>
  buckets.map(({ id, label, min, max }) => ({ id, label, min, max }));

test("decision distance buckets use stable ids and boundaries", () => {
  assert.deepEqual(DECISION_DISTANCE_BUCKET_IDS, [
    "le_0_5",
    "0_5_1",
    "1_2",
    "2_3",
    "3_4",
    "4_5",
    "5_7_5",
    "7_5_10",
    "gt_10",
  ]);
  assert.equal(DECISION_DISTANCE_BUCKETS[0].max, 0.5);
  assert.equal(DECISION_DISTANCE_BUCKETS.at(-1).min, 10);
});

test("decision distance buckets match analytics dashboard buckets", () => {
  assert.deepEqual(
    normalizeBuckets(DECISION_DISTANCE_BUCKETS),
    normalizeBuckets(DISTANCE_BUCKETS),
  );
});

test("getDecisionDistanceBucket buckets absolute distance with exclusive mins", () => {
  assert.equal(getDecisionDistanceBucketId(0), "le_0_5");
  assert.equal(getDecisionDistanceBucketId(0.5), "le_0_5");
  assert.equal(getDecisionDistanceBucketId(0.500001), "0_5_1");
  assert.equal(getDecisionDistanceBucketId(-1), "0_5_1");
  assert.equal(getDecisionDistanceBucketId(2), "1_2");
  assert.equal(getDecisionDistanceBucketId(2.01), "2_3");
  assert.equal(getDecisionDistanceBucketId(7.5), "5_7_5");
  assert.equal(getDecisionDistanceBucketId(10), "7_5_10");
  assert.equal(getDecisionDistanceBucketId(10.01), "gt_10");
  assert.equal(getDecisionDistanceBucket(null), null);
  assert.equal(getDecisionDistanceBucketId(Number.NaN), null);
});

test("decision distance helper matches analytics dashboard distance helper", () => {
  const distances = [
    Number.NaN,
    -10.01,
    -10,
    -7.5,
    -0.5,
    0,
    0.5,
    0.500001,
    1,
    2.01,
    7.5,
    10,
    10.01,
  ];

  for (const distance of distances) {
    assert.equal(
      getDecisionDistanceBucketId(distance),
      getDistanceBucket(distance)?.id ?? null,
      `${distance} should match analytics dashboard bucket semantics`,
    );
  }
});

test("isDecisionDistanceBucketId accepts only registered bucket ids", () => {
  assert.equal(isDecisionDistanceBucketId("5_7_5"), true);
  assert.equal(isDecisionDistanceBucketId("5-7.5"), false);
  assert.equal(isDecisionDistanceBucketId(null), false);
});
