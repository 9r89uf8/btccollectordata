const freeze = (value) => Object.freeze(value);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

export const DECISION_ACTIONS = freeze({
  ADD_SMALL: "ADD_SMALL",
  ENTER_DOWN: "ENTER_DOWN",
  ENTER_UP: "ENTER_UP",
  EXIT_OR_DE_RISK: "EXIT_OR_DE_RISK",
  SCOUT_SMALL: "SCOUT_SMALL",
  WAIT: "WAIT",
});

export const DECISION_ACTION_VALUES = freeze([
  DECISION_ACTIONS.WAIT,
  DECISION_ACTIONS.SCOUT_SMALL,
  DECISION_ACTIONS.ENTER_UP,
  DECISION_ACTIONS.ENTER_DOWN,
  DECISION_ACTIONS.ADD_SMALL,
  DECISION_ACTIONS.EXIT_OR_DE_RISK,
]);

export const DECISION_SIDES = freeze({
  DOWN: "down",
  NONE: "none",
  UP: "up",
});

export const DECISION_SIDE_VALUES = freeze([
  DECISION_SIDES.UP,
  DECISION_SIDES.DOWN,
  DECISION_SIDES.NONE,
]);

export const REASON_CODES = freeze({
  BASE_PRIOR_MISSING: "base_prior_missing",
  BASE_PRIOR_SPARSE: "base_prior_sparse",
  BAD_SNAPSHOT_QUALITY_GAP: "bad_snapshot_quality_gap",
  BAD_SNAPSHOT_QUALITY_STALE_BOOK: "bad_snapshot_quality_stale_book",
  BAD_SNAPSHOT_QUALITY_STALE_BTC: "bad_snapshot_quality_stale_btc",
  BAD_SNAPSHOT_QUALITY_UNKNOWN: "bad_snapshot_quality_unknown",
  BTC_TOO_OLD: "btc_too_old",
  COLLECTOR_UNHEALTHY: "collector_unhealthy",
  DATA_QUALITY_UNAVAILABLE: "data_quality_unavailable",
  DECISION_EXCEPTION: "decision_exception",
  DISTANCE_TOO_SMALL: "distance_too_small",
  ENTER_DOWN_SIGNAL: "enter_down_signal",
  ENTER_UP_SIGNAL: "enter_up_signal",
  INSUFFICIENT_TOP_ASK_DEPTH: "insufficient_top_ask_depth",
  INSIDE_NOISE_BAND: "inside_noise_band",
  INVALID_CHECKPOINT: "invalid_checkpoint",
  INVALID_CONTEXT: "invalid_context",
  LEADER_ASK_MISSING: "leader_ask_missing",
  LEADER_SPREAD_MISSING: "leader_spread_missing",
  MARKET_METADATA_MISSING: "market_metadata_missing",
  MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT: "missed_checkpoint_window_no_snapshot",
  MISSING_BTC_TICK: "missing_btc_tick",
  MISSING_LEADER_QUOTE: "missing_leader_quote",
  MISSING_MARKET_SNAPSHOT: "missing_market_snapshot",
  MISSING_PRICE_TO_BEAT: "missing_price_to_beat",
  MISSING_PRIORS: "missing_priors",
  MISSING_WINDOW_TIMING: "missing_window_timing",
  NO_EV_AGAINST_TOP_ASK: "no_ev_against_top_ask",
  NO_LEADER: "no_leader",
  NO_OFFICIAL_PRICE_TO_BEAT: "no_official_price_to_beat",
  OUTSIDE_DECISION_CHECKPOINT: "outside_decision_checkpoint",
  P_EST_BELOW_MINIMUM: "p_est_below_minimum",
  RECENT_LOCK: "recent_lock",
  RUNTIME_ACTIONS_MUTED: "runtime_actions_muted",
  SNAPSHOT_TOO_OLD: "snapshot_too_old",
  SOURCE_QUALITY_NOT_GOOD: "source_quality_not_good",
  TOO_MANY_SOFT_RISKS: "too_many_soft_risks",
  UNKNOWN_PATH: "unknown_path",
  WEAK_COVERAGE: "weak_coverage",
  WIDE_SPREAD: "wide_spread",
});

export const REASON_CODE_VALUES = freeze(Object.values(REASON_CODES));

export const PHASE2_REASON_CODE_FIXTURE = freeze([
  REASON_CODES.COLLECTOR_UNHEALTHY,
  REASON_CODES.MISSING_BTC_TICK,
  REASON_CODES.BTC_TOO_OLD,
  REASON_CODES.MISSING_MARKET_SNAPSHOT,
  REASON_CODES.SNAPSHOT_TOO_OLD,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_GAP,
  REASON_CODES.SOURCE_QUALITY_NOT_GOOD,
  REASON_CODES.NO_OFFICIAL_PRICE_TO_BEAT,
  REASON_CODES.OUTSIDE_DECISION_CHECKPOINT,
  REASON_CODES.INSIDE_NOISE_BAND,
  REASON_CODES.NO_LEADER,
  REASON_CODES.WEAK_COVERAGE,
  REASON_CODES.UNKNOWN_PATH,
  REASON_CODES.RECENT_LOCK,
  REASON_CODES.TOO_MANY_SOFT_RISKS,
  REASON_CODES.DISTANCE_TOO_SMALL,
  REASON_CODES.BASE_PRIOR_MISSING,
  REASON_CODES.BASE_PRIOR_SPARSE,
  REASON_CODES.P_EST_BELOW_MINIMUM,
  REASON_CODES.NO_EV_AGAINST_TOP_ASK,
  REASON_CODES.WIDE_SPREAD,
  REASON_CODES.INSUFFICIENT_TOP_ASK_DEPTH,
  REASON_CODES.RUNTIME_ACTIONS_MUTED,
  REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT,
]);

export const DECISION_CONFIG = deepFreeze({
  version: "decision-v0.1",

  targetCheckpoints: [180, 200, 210, 220, 240],
  checkpointToleranceSec: 3,

  noiseBandBps: 0.5,

  requireOfficialPriceToBeat: true,
  maxBtcAgeMs: 3000,
  maxSnapshotAgeMs: 7500,
  requireSourceQualityGood: true,

  minProbabilityDefault: 0.80,

  cleanDistanceThresholdBps: {
    180: 5.0,
    200: 5.0,
    210: 4.0,
    220: 4.0,
    240: 4.0,
  },

  oneSoftRiskDistanceThresholdBps: {
    180: 7.5,
    200: 7.5,
    210: 5.0,
    220: 5.0,
    240: 5.0,
  },

  twoSoftRiskDistanceThresholdBps: {
    180: 10.0,
    200: 10.0,
    210: 7.5,
    220: 7.5,
    240: 7.5,
  },

  requiredEdge: {
    180: 0.06,
    200: 0.05,
    210: 0.05,
    220: 0.05,
    240: 0.04,
  },

  softRiskEdgeTax: {
    one: 0.01,
    twoOrMore: 0.02,
  },

  maxSpread: 0.03,
  maxSoftRiskCount: 2,

  strongSupportN: 100,
  warningSupportN: 50,
  shrinkageK: 200,
});

export function isDecisionAction(value) {
  return DECISION_ACTION_VALUES.includes(value);
}

export function isDecisionSide(value) {
  return DECISION_SIDE_VALUES.includes(value);
}

export function isRegisteredReasonCode(value) {
  return REASON_CODE_VALUES.includes(value);
}
