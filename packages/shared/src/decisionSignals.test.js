import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  DECISION_CONFIG,
  REASON_CODES,
} from "./decisionConfig.js";
import {
  DECISION_RUNTIME_FLAG_DEFAULTS,
  decisionSignalDedupeKey,
  normalizeDecisionRuntimeFlags,
  normalizeDecisionSignal,
  normalizeRuntimeFlagValue,
} from "./decisionSignals.js";

function baseSignal(overrides = {}) {
  return {
    action: DECISION_ACTIONS.WAIT,
    checkpointSecond: 200,
    decisionVersion: DECISION_CONFIG.version,
    evaluatedAt: 1770000200000,
    marketSlug: "btc-updown-5m-1770000000",
    reasonCodes: [REASON_CODES.DISTANCE_TOO_SMALL],
    secondBucket: 1770000200000,
    ...overrides,
  };
}

test("normalizeDecisionSignal accepts WAIT and ENTER rows through the same contract", () => {
  const wait = normalizeDecisionSignal(baseSignal(), { nowMs: 1770000200100 });
  const enter = normalizeDecisionSignal(
    baseSignal({
      action: DECISION_ACTIONS.ENTER_UP,
      absDistanceBps: 8.2,
      edge: 0.071,
      features: { optionalField: undefined, prePathShape: "clean-lock" },
      flags: { softRiskCount: 0 },
      leader: "up",
      pBase: 0.84,
      pCandidates: [
        {
          accepted: true,
          n: 184,
          p: 0.87,
          rejectionReason: null,
          shrunk: 0.87,
          source: "base",
        },
      ],
      pEst: 0.84,
      reasonCodes: [REASON_CODES.ENTER_UP_SIGNAL],
    }),
    { nowMs: 1770000200100 },
  );

  assert.equal(wait.action, DECISION_ACTIONS.WAIT);
  assert.equal(wait.createdAt, 1770000200100);
  assert.equal(enter.action, DECISION_ACTIONS.ENTER_UP);
  assert.equal(enter.flags.softRiskCount, 0);
  assert.equal(enter.features.optionalField, null);
  assert.equal(enter.pCandidates[0].source, "base");
});

test("normalizeDecisionSignal preserves muted action audit trail", () => {
  const signal = normalizeDecisionSignal(
    baseSignal({
      action: DECISION_ACTIONS.WAIT,
      actionPreMute: DECISION_ACTIONS.ENTER_DOWN,
      reasonCodes: [
        REASON_CODES.ENTER_DOWN_SIGNAL,
        REASON_CODES.RUNTIME_ACTIONS_MUTED,
      ],
    }),
    { nowMs: 1770000200100 },
  );

  assert.equal(signal.action, DECISION_ACTIONS.WAIT);
  assert.equal(signal.actionPreMute, DECISION_ACTIONS.ENTER_DOWN);
  assert.deepEqual(signal.reasonCodes, [
    REASON_CODES.ENTER_DOWN_SIGNAL,
    REASON_CODES.RUNTIME_ACTIONS_MUTED,
  ]);
});

test("normalizeDecisionSignal rejects missing mandatory fields and unknown reasons", () => {
  assert.throws(
    () => normalizeDecisionSignal(baseSignal({ marketSlug: "" })),
    /marketSlug/,
  );
  assert.throws(
    () => normalizeDecisionSignal(baseSignal({ checkpointSecond: null })),
    /checkpointSecond/,
  );
  assert.throws(
    () => normalizeDecisionSignal(baseSignal({ reasonCodes: ["not_registered"] })),
    /Unregistered decision reason code/,
  );
});

test("normalizeDecisionSignal requires runtime mute reason when actionPreMute is set", () => {
  assert.throws(
    () =>
      normalizeDecisionSignal(
        baseSignal({
          action: DECISION_ACTIONS.WAIT,
          actionPreMute: DECISION_ACTIONS.ENTER_UP,
          reasonCodes: [REASON_CODES.ENTER_UP_SIGNAL],
        }),
      ),
    /runtime_actions_muted/,
  );
  assert.throws(
    () =>
      normalizeDecisionSignal(
        baseSignal({
          action: DECISION_ACTIONS.WAIT,
          actionPreMute: DECISION_ACTIONS.WAIT,
          reasonCodes: [REASON_CODES.RUNTIME_ACTIONS_MUTED],
        }),
      ),
    /actionPreMute must be one of ENTER_UP, ENTER_DOWN/,
  );
});

test("decisionSignalDedupeKey uses only the stable identity fields", () => {
  const first = normalizeDecisionSignal(
    baseSignal({
      engineRunId: "engine-run-a",
      evaluatedAt: 1770000200000,
    }),
    { nowMs: 1770000200100 },
  );
  const retry = normalizeDecisionSignal(
    baseSignal({
      engineRunId: "engine-run-b",
      evaluatedAt: 1770000204321,
    }),
    { nowMs: 1770000209999 },
  );
  const nextBucket = normalizeDecisionSignal(
    baseSignal({
      secondBucket: 1770000205000,
    }),
    { nowMs: 1770000200100 },
  );

  assert.equal(
    decisionSignalDedupeKey(first),
    "btc-updown-5m-1770000000:decision-v0.1:200:1770000200000",
  );
  assert.equal(decisionSignalDedupeKey(retry), decisionSignalDedupeKey(first));
  assert.notEqual(
    decisionSignalDedupeKey(nextBucket),
    decisionSignalDedupeKey(first),
  );
  assert.throws(
    () => decisionSignalDedupeKey(baseSignal({ secondBucket: null })),
    /secondBucket/,
  );
});

test("runtime flag defaults are fail-safe and values are validated", () => {
  assert.deepEqual(normalizeDecisionRuntimeFlags(), DECISION_RUNTIME_FLAG_DEFAULTS);
  assert.deepEqual(
    normalizeDecisionRuntimeFlags({
      decision_emit_actions: "all",
      decision_engine_enabled: true,
    }),
    {
      decision_emit_actions: "all",
      decision_engine_enabled: true,
    },
  );
  assert.throws(
    () => normalizeRuntimeFlagValue("decision_engine_enabled", "true"),
    /boolean/,
  );
  assert.throws(
    () => normalizeRuntimeFlagValue("decision_emit_actions", "live"),
    /wait_only/,
  );
});
