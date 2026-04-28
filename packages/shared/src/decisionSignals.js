import {
  DECISION_ACTIONS,
  DECISION_ACTION_VALUES,
  DECISION_SIDE_VALUES,
  REASON_CODES,
  isDecisionAction,
  isDecisionSide,
  isRegisteredReasonCode,
} from "./decisionConfig.js";
import { CAPTURE_MODES } from "./market.js";
import {
  DECISION_PRIOR_SOURCES,
  DECISION_PRIOR_SUPPORT_TIERS,
} from "./decisionPriors.js";

export const DECISION_RUNTIME_FLAG_KEYS = Object.freeze({
  DECISION_EMIT_ACTIONS: "decision_emit_actions",
  DECISION_ENGINE_ENABLED: "decision_engine_enabled",
});

export const DECISION_EMIT_ACTION_VALUES = Object.freeze([
  "all",
  "wait_only",
]);

export const DECISION_RUNTIME_FLAG_DEFAULTS = Object.freeze({
  [DECISION_RUNTIME_FLAG_KEYS.DECISION_ENGINE_ENABLED]: false,
  [DECISION_RUNTIME_FLAG_KEYS.DECISION_EMIT_ACTIONS]: "wait_only",
});

export const DECISION_SIGNAL_NUMERIC_FIELDS = Object.freeze([
  "absDistanceBps",
  "btcAgeMs",
  "btcPrice",
  "btcReceivedAt",
  "btcTickTs",
  "edge",
  "intendedSize",
  "leaderAsk",
  "leaderBid",
  "leaderSpread",
  "leaderTopAskDepth",
  "limitPrice",
  "pBase",
  "pEst",
  "priceToBeat",
  "priorsComputedAt",
  "priorsRollupVersion",
  "requiredDistanceBps",
  "requiredEdge",
  "secondsFromWindowStart",
  "signedDistanceBps",
  "snapshotAgeMs",
  "snapshotTs",
  "windowEndTs",
  "windowStartTs",
]);

const DECISION_SIGNAL_REQUIRED_NUMERIC_FIELDS = Object.freeze([
  "checkpointSecond",
  "evaluatedAt",
  "secondBucket",
]);

const DECISION_SIGNAL_STRING_FIELDS = Object.freeze([
  "captureMode",
  "collectorStatus",
  "distanceBucket",
  "engineRunId",
  "marketId",
  "priceToBeatSource",
  "sourceQuality",
]);

const P_CANDIDATE_REJECTION_REASONS = Object.freeze([
  "missing",
  "not_applicable",
  "sparse",
]);
const CAPTURE_MODE_VALUES = Object.freeze(Object.values(CAPTURE_MODES));
const ACTION_PRE_MUTE_VALUES = Object.freeze([
  DECISION_ACTIONS.ENTER_UP,
  DECISION_ACTIONS.ENTER_DOWN,
]);
const SUPPORT_TIER_VALUES = Object.freeze(
  Object.values(DECISION_PRIOR_SUPPORT_TIERS),
);

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function requireFiniteNumber(value, label) {
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    throw new Error(`${label} must be a finite number`);
  }

  return parsed;
}

function normalizeAction(value, label) {
  if (!isDecisionAction(value)) {
    throw new Error(`${label} must be one of ${DECISION_ACTION_VALUES.join(", ")}`);
  }

  return value;
}

function normalizeActionPreMute(value) {
  const action = normalizeAction(value, "actionPreMute");

  if (!ACTION_PRE_MUTE_VALUES.includes(action)) {
    throw new Error(
      `actionPreMute must be one of ${ACTION_PRE_MUTE_VALUES.join(", ")}`,
    );
  }

  return action;
}

function normalizeLeader(value) {
  if (value == null) {
    return null;
  }

  if (!isDecisionSide(value)) {
    throw new Error(`leader must be one of ${DECISION_SIDE_VALUES.join(", ")}`);
  }

  return value;
}

function normalizeCaptureMode(value) {
  const mode = optionalString(value);

  if (mode === null) {
    return null;
  }

  if (!CAPTURE_MODE_VALUES.includes(mode)) {
    throw new Error(`captureMode must be one of ${CAPTURE_MODE_VALUES.join(", ")}`);
  }

  return mode;
}

function normalizeReasonCodes(reasonCodes) {
  if (!Array.isArray(reasonCodes)) {
    throw new Error("reasonCodes must be an array");
  }

  const normalized = [];

  for (const code of reasonCodes) {
    if (!isRegisteredReasonCode(code)) {
      throw new Error(`Unregistered decision reason code: ${String(code)}`);
    }

    if (!normalized.includes(code)) {
      normalized.push(code);
    }
  }

  return normalized;
}

function normalizeJsonObject(value, label) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object or null`);
  }

  return normalizeJsonValue(value, label);
}

function normalizeJsonValue(value, label) {
  if (value === undefined) {
    return null;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item, label));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeJsonValue(item, `${label}.${key}`),
      ]),
    );
  }

  throw new Error(`${label} must be JSON-compatible`);
}

function normalizeProbabilityCandidate(candidate) {
  requireObject(candidate, "pCandidates item");

  if (!DECISION_PRIOR_SOURCES.includes(candidate.source)) {
    throw new Error(`pCandidates source is not registered: ${String(candidate.source)}`);
  }

  if (typeof candidate.accepted !== "boolean") {
    throw new Error("pCandidates accepted must be a boolean");
  }

  const rejectionReason = candidate.rejectionReason ?? null;

  if (
    rejectionReason !== null &&
    !P_CANDIDATE_REJECTION_REASONS.includes(rejectionReason)
  ) {
    throw new Error(
      `pCandidates rejectionReason is not registered: ${String(rejectionReason)}`,
    );
  }

  const supportTier = candidate.supportTier ?? null;

  if (supportTier !== null && !SUPPORT_TIER_VALUES.includes(supportTier)) {
    throw new Error(`pCandidates supportTier is not registered: ${String(supportTier)}`);
  }

  return {
    accepted: candidate.accepted,
    n: toFiniteNumber(candidate.n),
    p: toFiniteNumber(candidate.p),
    rejectionReason,
    shrunk: toFiniteNumber(candidate.shrunk),
    source: candidate.source,
    supportTier,
  };
}

function normalizeProbabilityCandidates(pCandidates) {
  if (pCandidates == null) {
    return [];
  }

  if (!Array.isArray(pCandidates)) {
    throw new Error("pCandidates must be an array");
  }

  return pCandidates.map(normalizeProbabilityCandidate);
}

export function normalizeRuntimeFlagValue(key, value) {
  if (key === DECISION_RUNTIME_FLAG_KEYS.DECISION_ENGINE_ENABLED) {
    if (typeof value !== "boolean") {
      throw new Error("decision_engine_enabled must be a boolean");
    }

    return value;
  }

  if (key === DECISION_RUNTIME_FLAG_KEYS.DECISION_EMIT_ACTIONS) {
    if (!DECISION_EMIT_ACTION_VALUES.includes(value)) {
      throw new Error(
        `decision_emit_actions must be one of ${DECISION_EMIT_ACTION_VALUES.join(", ")}`,
      );
    }

    return value;
  }

  throw new Error(`Unknown runtime flag key: ${String(key)}`);
}

export function normalizeDecisionRuntimeFlags(values = {}) {
  const source =
    values && typeof values === "object" && !Array.isArray(values)
      ? values
      : {};
  const flags = { ...DECISION_RUNTIME_FLAG_DEFAULTS };

  for (const key of Object.values(DECISION_RUNTIME_FLAG_KEYS)) {
    if (Object.hasOwn(source, key)) {
      flags[key] = normalizeRuntimeFlagValue(key, source[key]);
    }
  }

  return flags;
}

export function decisionSignalDedupeKey(input) {
  const source = requireObject(input, "decision signal");

  return [
    requireNonEmptyString(source.marketSlug, "marketSlug"),
    requireNonEmptyString(source.decisionVersion, "decisionVersion"),
    requireFiniteNumber(source.checkpointSecond, "checkpointSecond"),
    requireFiniteNumber(source.secondBucket, "secondBucket"),
  ].join(":");
}

export function normalizeDecisionSignal(input, { nowMs = Date.now() } = {}) {
  const source = requireObject(input, "decision signal");
  const action = normalizeAction(source.action, "action");
  const actionPreMute =
    source.actionPreMute == null
      ? null
      : normalizeActionPreMute(source.actionPreMute);
  const reasonCodes = normalizeReasonCodes(source.reasonCodes);

  if (actionPreMute !== null) {
    if (action !== DECISION_ACTIONS.WAIT) {
      throw new Error("actionPreMute can only be set when effective action is WAIT");
    }

    if (!reasonCodes.includes(REASON_CODES.RUNTIME_ACTIONS_MUTED)) {
      throw new Error("actionPreMute requires runtime_actions_muted reason code");
    }
  }

  const row = {
    action,
    actionPreMute,
    checkpointSecond: requireFiniteNumber(
      source.checkpointSecond,
      "checkpointSecond",
    ),
    createdAt: toFiniteNumber(source.createdAt) ?? requireFiniteNumber(nowMs, "nowMs"),
    decisionVersion: requireNonEmptyString(
      source.decisionVersion,
      "decisionVersion",
    ),
    evaluatedAt: requireFiniteNumber(source.evaluatedAt, "evaluatedAt"),
    flags: normalizeJsonObject(source.flags, "flags"),
    features: normalizeJsonObject(source.features, "features"),
    leader: normalizeLeader(source.leader),
    marketSlug: requireNonEmptyString(source.marketSlug, "marketSlug"),
    pCandidates: normalizeProbabilityCandidates(source.pCandidates),
    reasonCodes,
    secondBucket: requireFiniteNumber(source.secondBucket, "secondBucket"),
  };

  for (const field of DECISION_SIGNAL_NUMERIC_FIELDS) {
    if (field in row) {
      continue;
    }

    row[field] = toFiniteNumber(source[field]);
  }

  for (const field of DECISION_SIGNAL_REQUIRED_NUMERIC_FIELDS) {
    row[field] = requireFiniteNumber(source[field], field);
  }

  for (const field of DECISION_SIGNAL_STRING_FIELDS) {
    row[field] = optionalString(source[field]);
  }

  row.captureMode = normalizeCaptureMode(source.captureMode);

  return row;
}
