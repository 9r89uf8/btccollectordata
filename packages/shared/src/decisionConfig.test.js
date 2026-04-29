import test from "node:test";
import assert from "node:assert/strict";

import {
  DECISION_ACTIONS,
  DECISION_ACTION_VALUES,
  DECISION_CONFIG,
  DECISION_SIDES,
  DECISION_SIDE_VALUES,
  PHASE2_REASON_CODE_FIXTURE,
  REASON_CODES,
  REASON_CODE_VALUES,
  isDecisionAction,
  isDecisionSide,
  isRegisteredReasonCode,
} from "./decisionConfig.js";

const LOWER_SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const PHASE11_EXPECTED_REASON_CODES = [
  REASON_CODES.OUTSIDE_DECISION_CHECKPOINT,
  REASON_CODES.INSIDE_NOISE_BAND,
  REASON_CODES.NO_EV_AGAINST_TOP_ASK,
  REASON_CODES.DISTANCE_TOO_SMALL,
  REASON_CODES.RECENT_LOCK,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_GAP,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BOOK,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BTC,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_UNKNOWN,
  REASON_CODES.BTC_TOO_OLD,
  REASON_CODES.SNAPSHOT_TOO_OLD,
  REASON_CODES.MISSING_BTC_TICK,
];

test("decision config freezes the v0.1 threshold contract", () => {
  assert.equal(DECISION_CONFIG.version, "decision-v0.1-edge0");
  assert.deepEqual(DECISION_CONFIG.targetCheckpoints, [180, 200, 210, 220, 240]);
  assert.equal(DECISION_CONFIG.checkpointToleranceSec, 3);
  assert.equal(DECISION_CONFIG.noiseBandBps, 0.5);
  assert.equal(DECISION_CONFIG.requireOfficialPriceToBeat, true);
  assert.equal(DECISION_CONFIG.maxBtcAgeMs, 3000);
  assert.equal(DECISION_CONFIG.maxSnapshotAgeMs, 7500);
  assert.equal(DECISION_CONFIG.requireSourceQualityGood, true);
  assert.equal(DECISION_CONFIG.minProbabilityDefault, 0.80);
  assert.deepEqual(DECISION_CONFIG.cleanDistanceThresholdBps, {
    180: 5,
    200: 5,
    210: 4,
    220: 4,
    240: 4,
  });
  assert.deepEqual(DECISION_CONFIG.oneSoftRiskDistanceThresholdBps, {
    180: 7.5,
    200: 7.5,
    210: 5,
    220: 5,
    240: 5,
  });
  assert.deepEqual(DECISION_CONFIG.twoSoftRiskDistanceThresholdBps, {
    180: 10,
    200: 10,
    210: 7.5,
    220: 7.5,
    240: 7.5,
  });
  assert.deepEqual(DECISION_CONFIG.requiredEdge, {
    180: 0,
    200: 0,
    210: 0,
    220: 0,
    240: 0,
  });
  assert.deepEqual(DECISION_CONFIG.softRiskEdgeTax, {
    one: 0,
    twoOrMore: 0,
  });
  assert.equal(DECISION_CONFIG.maxSpread, 0.03);
  assert.equal(DECISION_CONFIG.maxSoftRiskCount, 2);
  assert.equal(DECISION_CONFIG.strongSupportN, 100);
  assert.equal(DECISION_CONFIG.warningSupportN, 50);
  assert.equal(DECISION_CONFIG.shrinkageK, 200);
  assert.equal(Object.isFrozen(DECISION_CONFIG.requiredEdge), true);
});

test("decision config does not freeze empirical rank thresholds in phase 2", () => {
  const serialized = JSON.stringify(DECISION_CONFIG);

  assert.equal(serialized.includes("nearLineHighThreshold"), false);
  assert.equal(serialized.includes("oscillationHighThreshold"), false);
  assert.equal(serialized.includes("preChopRank"), false);
});

test("decision actions and sides match the stable output contract", () => {
  assert.deepEqual(DECISION_ACTION_VALUES, [
    "WAIT",
    "SCOUT_SMALL",
    "ENTER_UP",
    "ENTER_DOWN",
    "ADD_SMALL",
    "EXIT_OR_DE_RISK",
  ]);
  assert.deepEqual(DECISION_SIDE_VALUES, ["up", "down", "none"]);
  assert.equal(isDecisionAction(DECISION_ACTIONS.ENTER_UP), true);
  assert.equal(isDecisionAction("BUY"), false);
  assert.equal(isDecisionSide(DECISION_SIDES.NONE), true);
  assert.equal(isDecisionSide("flat"), false);
});

test("reason-code registry is lowercase snake case with no duplicates", () => {
  assert.equal(REASON_CODE_VALUES.length, new Set(REASON_CODE_VALUES).size);

  for (const code of REASON_CODE_VALUES) {
    assert.match(code, LOWER_SNAKE_CASE);
    assert.equal(isRegisteredReasonCode(code), true);
  }
});

test("phase 2 operational reason codes are registered", () => {
  assert.equal(
    isRegisteredReasonCode(REASON_CODES.RUNTIME_ACTIONS_MUTED),
    true,
  );
  assert.equal(
    isRegisteredReasonCode(REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT),
    true,
  );
});

test("phase 11 expected strategy and data-quality reason codes are registered", () => {
  for (const code of PHASE11_EXPECTED_REASON_CODES) {
    assert.equal(
      isRegisteredReasonCode(code),
      true,
      `${code} must be registered`,
    );
  }
});

test("phase 2 emitted-reason fixture contains only registered codes", () => {
  assert.ok(PHASE2_REASON_CODE_FIXTURE.length > 0);

  for (const code of PHASE2_REASON_CODE_FIXTURE) {
    assert.equal(
      isRegisteredReasonCode(code),
      true,
      `${code} must be registered`,
    );
  }
});
