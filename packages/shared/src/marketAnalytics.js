import { BTC_SOURCES, BTC_SYMBOLS } from "./ingest.js";

export const ANALYTICS_VERSION = 3;
export const STALE_BTC_THRESHOLD_MS = 30_000;
export const CHECKPOINT_SECONDS = [
  30,
  60,
  90,
  120,
  180,
  200,
  210,
  220,
  240,
  270,
  285,
  295,
];
export const EXCLUDED_REASONS = {
  DERIVED_ONLY_OUTCOME: "derived-only-outcome",
  MISSING_CHECKPOINT_BTC: "missing-checkpoint-btc",
  MISSING_OUTCOME: "missing-outcome",
  MISSING_PRICE_TO_BEAT: "missing-price-to-beat",
  STALE_BTC: "stale-btc",
};

const DERIVED_OUTCOME_FLAG = "winner_derived_from_references";

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMarketSlug(market, summary) {
  return market?.slug ?? market?.marketSlug ?? summary?.marketSlug ?? "";
}

function getMarketId(market, summary) {
  return market?.marketId ?? summary?.marketId ?? "";
}

function getSummaryDataQuality(market, summary) {
  return summary?.dataQuality ?? market?.dataQuality ?? "unknown";
}

function getOutcomeSource(market, summary) {
  const qualityFlags = Array.isArray(summary?.qualityFlags)
    ? summary.qualityFlags
    : [];

  if (summary?.resolvedOutcome) {
    return qualityFlags.includes(DERIVED_OUTCOME_FLAG)
      ? "derived"
      : "official";
  }

  return market?.winningOutcome ? "official" : null;
}

function getPriceToBeat(market, summary) {
  const official = toFiniteNumber(market?.priceToBeatOfficial);

  if (official !== null) {
    return {
      priceToBeat: official,
      priceToBeatSource: "official",
    };
  }

  const derived = toFiniteNumber(
    summary?.priceToBeatDerived ?? market?.priceToBeatDerived,
  );

  if (derived !== null) {
    return {
      priceToBeat: derived,
      priceToBeatSource: "derived",
    };
  }

  return {
    priceToBeat: null,
    priceToBeatSource: null,
  };
}

function isEligibleChainlinkTick(tick, checkpointTs) {
  return (
    tick?.source === BTC_SOURCES.CHAINLINK &&
    tick?.symbol === BTC_SYMBOLS.CHAINLINK_BTC_USD &&
    toFiniteNumber(tick.ts) !== null &&
    toFiniteNumber(tick.receivedAt) !== null &&
    toFiniteNumber(tick.price) !== null &&
    tick.ts <= checkpointTs &&
    tick.receivedAt <= checkpointTs
  );
}

function getLatestTickAtOrBefore(btcTicks, checkpointTs) {
  let latestTick = null;

  for (const tick of Array.isArray(btcTicks) ? btcTicks : []) {
    if (!isEligibleChainlinkTick(tick, checkpointTs)) {
      continue;
    }

    if (
      !latestTick ||
      tick.ts > latestTick.ts ||
      (tick.ts === latestTick.ts && tick.receivedAt > latestTick.receivedAt)
    ) {
      latestTick = tick;
    }
  }

  return latestTick;
}

function getCurrentLeader(btcAtCheckpoint, priceToBeat) {
  if (btcAtCheckpoint === null || priceToBeat === null) {
    return null;
  }

  if (btcAtCheckpoint > priceToBeat) {
    return "up";
  }

  if (btcAtCheckpoint < priceToBeat) {
    return "down";
  }

  return null;
}

function buildCheckpoint({
  btcTicks,
  checkpointSecond,
  priceToBeat,
  resolvedOutcome,
  windowStartTs,
}) {
  const checkpointTs = windowStartTs + checkpointSecond * 1000;
  const tick = getLatestTickAtOrBefore(btcTicks, checkpointTs);
  const btcAtCheckpoint = toFiniteNumber(tick?.price);
  const btcTickTs = toFiniteNumber(tick?.ts);
  const btcTickReceivedAt = toFiniteNumber(tick?.receivedAt);
  const btcTickAgeMs =
    btcTickTs === null ? null : Math.max(0, checkpointTs - btcTickTs);
  const distanceToBeatBps =
    btcAtCheckpoint === null || priceToBeat === null || priceToBeat <= 0
      ? null
      : (10000 * (btcAtCheckpoint - priceToBeat)) / priceToBeat;
  const currentLeader = getCurrentLeader(btcAtCheckpoint, priceToBeat);

  return {
    btcAtCheckpoint,
    btcTickAgeMs,
    btcTickReceivedAt,
    btcTickTs,
    checkpointSecond,
    checkpointTs,
    currentLeader,
    didCurrentLeaderWin:
      currentLeader === null || !resolvedOutcome
        ? null
        : currentLeader === resolvedOutcome,
    distanceToBeatBps,
  };
}

function getExcludedReasons({
  checkpoints,
  completeFreshCheckpoints,
  outcomeSource,
  priceToBeat,
  resolvedOutcome,
}) {
  const reasons = [];

  if (!resolvedOutcome) {
    reasons.push(EXCLUDED_REASONS.MISSING_OUTCOME);
  }

  if (outcomeSource === "derived") {
    reasons.push(EXCLUDED_REASONS.DERIVED_ONLY_OUTCOME);
  }

  if (priceToBeat === null) {
    reasons.push(EXCLUDED_REASONS.MISSING_PRICE_TO_BEAT);
  }

  if (checkpoints.some((checkpoint) => checkpoint.btcAtCheckpoint === null)) {
    reasons.push(EXCLUDED_REASONS.MISSING_CHECKPOINT_BTC);
  }

  if (checkpoints.some(
    (checkpoint) =>
      checkpoint.btcTickAgeMs !== null &&
      checkpoint.btcTickAgeMs > STALE_BTC_THRESHOLD_MS,
  )) {
    reasons.push(EXCLUDED_REASONS.STALE_BTC);
  }

  return reasons;
}

export function buildMarketAnalytics({
  btcTicks,
  market,
  nowTs = Date.now(),
  summary = null,
}) {
  const resolvedOutcome = summary?.resolvedOutcome ?? market?.winningOutcome ?? null;
  const outcomeSource = getOutcomeSource(market, summary);
  const { priceToBeat, priceToBeatSource } = getPriceToBeat(market, summary);
  const windowStartTs = toFiniteNumber(market?.windowStartTs ?? summary?.windowStartTs);
  const windowEndTs = toFiniteNumber(market?.windowEndTs ?? summary?.windowEndTs);
  const checkpoints =
    windowStartTs === null
      ? []
      : CHECKPOINT_SECONDS.map((checkpointSecond) =>
          buildCheckpoint({
            btcTicks,
            checkpointSecond,
            priceToBeat,
            resolvedOutcome,
            windowStartTs,
          }),
        );
  const completeFreshCheckpoints =
    checkpoints.length === CHECKPOINT_SECONDS.length &&
    checkpoints.every(
      (checkpoint) =>
        checkpoint.btcAtCheckpoint !== null &&
        checkpoint.btcTickAgeMs !== null &&
        checkpoint.btcTickAgeMs <= STALE_BTC_THRESHOLD_MS,
    );
  const excludedReasons = getExcludedReasons({
    checkpoints,
    completeFreshCheckpoints,
    outcomeSource,
    priceToBeat,
    resolvedOutcome,
  });

  return {
    analyticsVersion: ANALYTICS_VERSION,
    checkpoints,
    completeFreshCheckpoints,
    createdAt: nowTs,
    excludedReasons,
    marketId: getMarketId(market, summary),
    marketSlug: getMarketSlug(market, summary),
    outcomeSource,
    priceToBeat,
    priceToBeatSource,
    resolvedOutcome,
    summaryPresent: Boolean(summary),
    summaryDataQuality: getSummaryDataQuality(market, summary),
    updatedAt: nowTs,
    windowEndTs,
    windowStartTs,
  };
}
