import {
  MIN_PATH_COVERAGE_PCT,
  PRE_NEAR_LINE_BPS,
  STABILITY_DEADBAND_BPS,
  buildLivePathFeatures,
} from "./marketStabilityAnalytics.js";

export const PAPER_STRATEGY_VERSION = "leader_distance_v0";
export const PAPER_DYNAMIC_SIZING_STRATEGY_VERSION =
  "leader_distance_v0_dynamic_sizing";
export const PAPER_ENGINE_VERSION = 1;
export const DEFAULT_PAPER_TRADING_CONFIG = {
  baseThreshold220To239: 5,
  baseThreshold240Plus: 4,
  decisionEndSecond: 285,
  decisionStartSecond: 220,
  engineVersion: PAPER_ENGINE_VERSION,
  maxRiskCount: 1,
  minPreSnapshotCoveragePct: MIN_PATH_COVERAGE_PCT,
  nearLineBps: PRE_NEAR_LINE_BPS,
  noiseBps: STABILITY_DEADBAND_BPS,
  oneRiskTaxBps: 2.5,
  dynamicHighMaxEntryMarketPrice: 0.9,
  dynamicHighMinClearanceBps: 3,
  dynamicHighStakeUsd: 5,
  dynamicLowStakeUsd: 1,
  dynamicMediumMaxEntryMarketPrice: 0.95,
  dynamicMediumMinClearanceBps: 1,
  dynamicMediumStakeUsd: 3,
  sizingMode: "flat",
  stakeUsd: 5,
  staleBtcMs: 30_000,
  strategyVersion: PAPER_STRATEGY_VERSION,
};

const RECENT_LOCK_SECONDS = 30;
const MULTI_FLIP_MIN_CROSSES_LAST_60S = 2;
const MULTI_FLIP_MIN_PRE_FLIPS = 3;
const NEAR_LINE_HEAVY_SECONDS = 30;
const NEAR_LINE_HEAVY_PCT = 0.25;
const EPSILON = 1e-9;

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function countTrue(values) {
  return values.filter(Boolean).length;
}

function skip(reason, diagnostics = {}) {
  return {
    action: "skip",
    diagnostics,
    reason,
  };
}

function getMarketSlug(market) {
  return market?.slug ?? market?.marketSlug ?? "";
}

function getPriceToBeat(market) {
  const official = toFiniteNumber(market?.priceToBeatOfficial);

  if (official !== null) {
    return {
      priceToBeat: official,
      priceToBeatSource: "official",
    };
  }

  const derived = toFiniteNumber(
    market?.priceToBeatDerived ?? market?.priceToBeat,
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

function snapshotTs(snapshot) {
  return toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);
}

function getLatestSnapshotAtOrBefore(snapshots, nowTs) {
  let latest = null;

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const ts = snapshotTs(snapshot);

    if (ts === null || ts > nowTs) {
      continue;
    }

    if (!latest || ts > snapshotTs(latest)) {
      latest = snapshot;
    }
  }

  return latest;
}

function btcCandidateFrom(value, source) {
  if (!value) {
    return null;
  }

  const price = toFiniteNumber(value.price ?? value.btcChainlink);
  const ts = toFiniteNumber(value.ts ?? value.secondBucket ?? value.btcTickTs);

  if (price === null) {
    return null;
  }

  return {
    price,
    receivedAt: toFiniteNumber(value.receivedAt),
    source,
    ts,
  };
}

function resolveLatestBtc({
  latestBtc = null,
  latestBtcTick = null,
  latestSnapshot = null,
  nowTs,
}) {
  const candidates = [
    btcCandidateFrom(latestBtcTick, "btc_tick"),
    btcCandidateFrom(latestBtc, "btc"),
    btcCandidateFrom(latestSnapshot, "snapshot"),
  ].filter((candidate) => candidate && (candidate.ts === null || candidate.ts <= nowTs));

  if (candidates.length === 0) {
    return null;
  }

  const latest = candidates.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }

    if (candidate.ts === null) {
      return best;
    }

    if (best.ts === null || candidate.ts > best.ts) {
      return candidate;
    }

    return best;
  }, null);
  const ts = latest.ts ?? nowTs;

  return {
    ...latest,
    ageMs: Math.max(0, nowTs - ts),
    ts,
  };
}

function getDisplayedPrice(snapshot, side) {
  if (!snapshot) {
    return null;
  }

  const prefix = side === "up" ? "up" : "down";
  const candidates = [
    snapshot[`${prefix}Displayed`],
    snapshot[`${prefix}Ask`],
    snapshot[`${prefix}Mid`],
    snapshot[`${prefix}Last`],
  ];

  for (const candidate of candidates) {
    const value = toFiniteNumber(candidate);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function signedDistanceBps(btc, priceToBeat) {
  const btcValue = toFiniteNumber(btc);
  const referenceValue = toFiniteNumber(priceToBeat);

  if (btcValue === null || referenceValue === null || referenceValue <= 0) {
    return null;
  }

  return ((btcValue - referenceValue) / referenceValue) * 10000;
}

export function leaderFromDistance(distanceBps, noiseBps = STABILITY_DEADBAND_BPS) {
  if (!Number.isFinite(distanceBps)) {
    return null;
  }

  if (Math.abs(distanceBps) <= noiseBps + EPSILON) {
    return null;
  }

  return distanceBps > 0 ? "up" : "down";
}

export function computeRiskFlags(pathFeatures, secondsElapsed) {
  const nearLinePct =
    Number.isFinite(pathFeatures?.preNearLineSeconds) &&
    Number.isFinite(secondsElapsed) &&
    secondsElapsed > 0
      ? pathFeatures.preNearLineSeconds / secondsElapsed
      : null;

  return {
    multiFlipChop:
      (Number.isFinite(pathFeatures?.preCrossCountLast60s) &&
        pathFeatures.preCrossCountLast60s >= MULTI_FLIP_MIN_CROSSES_LAST_60S) ||
      (Number.isFinite(pathFeatures?.preFlipCount) &&
        pathFeatures.preFlipCount >= MULTI_FLIP_MIN_PRE_FLIPS),
    nearLineHeavy:
      (Number.isFinite(pathFeatures?.preNearLineSeconds) &&
        pathFeatures.preNearLineSeconds >= NEAR_LINE_HEAVY_SECONDS) ||
      (Number.isFinite(nearLinePct) && nearLinePct >= NEAR_LINE_HEAVY_PCT),
    recentLock:
      (Number.isFinite(pathFeatures?.preCurrentLeadAgeSeconds) &&
        pathFeatures.preCurrentLeadAgeSeconds < RECENT_LOCK_SECONDS) ||
      (Number.isFinite(pathFeatures?.preLastFlipAgeSeconds) &&
        pathFeatures.preLastFlipAgeSeconds < RECENT_LOCK_SECONDS),
  };
}

function compactPathFeatures(pathFeatures) {
  return {
    leaderAlignedMomentum30sBps: nullableNumber(
      pathFeatures?.leaderAlignedMomentum30sBps,
    ),
    momentum30sAgreesWithLeader: optionalBoolean(
      pathFeatures?.momentum30sAgreesWithLeader,
    ),
    preCrossCountLast60s: nullableNumber(pathFeatures?.preCrossCountLast60s),
    preCurrentLeadAgeSeconds: nullableNumber(
      pathFeatures?.preCurrentLeadAgeSeconds,
    ),
    preFlipCount: nullableNumber(pathFeatures?.preFlipCount),
    preLastFlipAgeSeconds: nullableNumber(pathFeatures?.preLastFlipAgeSeconds),
    preNearLineSeconds: nullableNumber(pathFeatures?.preNearLineSeconds),
    preSnapshotCoveragePct: nullableNumber(
      pathFeatures?.preSnapshotCoveragePct,
    ),
  };
}

function baseRequiredBps(secondsElapsed, config) {
  return secondsElapsed >= 240
    ? config.baseThreshold240Plus
    : config.baseThreshold220To239;
}

export function computeDynamicStakeUsd({
  absDistanceBps,
  config: overrideConfig = {},
  entryMarketPrice,
  requiredDistanceBps,
  riskCount,
} = {}) {
  const config = {
    ...DEFAULT_PAPER_TRADING_CONFIG,
    ...overrideConfig,
  };
  const clearanceBps =
    Number.isFinite(absDistanceBps) && Number.isFinite(requiredDistanceBps)
      ? absDistanceBps - requiredDistanceBps
      : null;

  if (
    riskCount === 0 &&
    Number.isFinite(clearanceBps) &&
    clearanceBps >= config.dynamicHighMinClearanceBps - EPSILON &&
    Number.isFinite(entryMarketPrice) &&
    entryMarketPrice <= config.dynamicHighMaxEntryMarketPrice
  ) {
    return config.dynamicHighStakeUsd;
  }

  if (
    riskCount <= 1 &&
    Number.isFinite(clearanceBps) &&
    clearanceBps >= config.dynamicMediumMinClearanceBps - EPSILON &&
    Number.isFinite(entryMarketPrice) &&
    entryMarketPrice <= config.dynamicMediumMaxEntryMarketPrice
  ) {
    return config.dynamicMediumStakeUsd;
  }

  return config.dynamicLowStakeUsd;
}

function resolveStakeUsd({
  absDistanceBps,
  config,
  entryMarketPrice,
  requiredDistanceBps,
  riskCount,
}) {
  if (config.sizingMode !== "dynamic") {
    return config.stakeUsd;
  }

  return computeDynamicStakeUsd({
    absDistanceBps,
    config,
    entryMarketPrice,
    requiredDistanceBps,
    riskCount,
  });
}

export function maybeCreatePaperDecision({
  config: overrideConfig = {},
  existingTrade = null,
  latestBtc = null,
  latestBtcTick = null,
  market,
  nowTs = Date.now(),
  runId = "paper-agent",
  snapshots = [],
  stakeUsd,
  strategyVersion,
} = {}) {
  const config = {
    ...DEFAULT_PAPER_TRADING_CONFIG,
    ...overrideConfig,
  };
  if (stakeUsd != null) {
    config.stakeUsd = stakeUsd;
  }

  const resolvedStrategyVersion =
    strategyVersion ?? config.strategyVersion ?? PAPER_STRATEGY_VERSION;

  if (!market) {
    return skip("missing_market");
  }

  const marketSlug = getMarketSlug(market);
  const { priceToBeat, priceToBeatSource } = getPriceToBeat(market);

  if (existingTrade) {
    return skip("existing_paper_trade", {
      marketSlug,
      strategyVersion: resolvedStrategyVersion,
    });
  }

  if (priceToBeat === null || priceToBeatSource === null) {
    return skip("missing_price_to_beat", { marketSlug });
  }

  const windowStartTs = toFiniteNumber(market.windowStartTs);
  const windowEndTs = toFiniteNumber(market.windowEndTs);

  if (windowStartTs === null || windowEndTs === null) {
    return skip("missing_market_window", { marketSlug });
  }

  const secondsElapsed = Math.floor((nowTs - windowStartTs) / 1000);
  const latestSnapshot = getLatestSnapshotAtOrBefore(snapshots, nowTs);
  const btc = resolveLatestBtc({
    latestBtc,
    latestBtcTick,
    latestSnapshot,
    nowTs,
  });

  if (!btc) {
    return skip("missing_btc", { marketSlug });
  }

  if (btc.ageMs > config.staleBtcMs) {
    return skip("stale_btc", {
      btcAgeMs: btc.ageMs,
      marketSlug,
      staleBtcMs: config.staleBtcMs,
    });
  }

  if (secondsElapsed < config.decisionStartSecond) {
    return skip("before_decision_window", {
      marketSlug,
      secondsElapsed,
    });
  }

  if (secondsElapsed > config.decisionEndSecond) {
    return skip("after_decision_window", {
      marketSlug,
      secondsElapsed,
    });
  }

  const distanceBps = signedDistanceBps(btc.price, priceToBeat);
  const absDistanceBps = Math.abs(distanceBps);
  const side = leaderFromDistance(distanceBps, config.noiseBps);

  if (!side || absDistanceBps <= config.noiseBps + EPSILON) {
    return skip("inside_noise_band", {
      absDistanceBps,
      distanceBps,
      marketSlug,
      noiseBps: config.noiseBps,
    });
  }

  const pathFeatures = buildLivePathFeatures({
    leader: side,
    market,
    nowTs,
    priceToBeat,
    snapshots,
  });
  const preSnapshotCoveragePct = pathFeatures.preSnapshotCoveragePct ?? 0;

  if (preSnapshotCoveragePct < config.minPreSnapshotCoveragePct) {
    return skip("insufficient_pre_snapshot_coverage", {
      marketSlug,
      preSnapshotCoveragePct,
      requiredCoveragePct: config.minPreSnapshotCoveragePct,
    });
  }

  if (pathFeatures.prePathGood !== true) {
    return skip("insufficient_pre_path_quality", {
      marketSlug,
      preMaxSnapshotGapMs: pathFeatures.preMaxSnapshotGapMs,
      preSnapshotCoveragePct,
    });
  }

  const riskFlags = computeRiskFlags(pathFeatures, secondsElapsed);
  const riskCount = countTrue(Object.values(riskFlags));

  if (riskCount > config.maxRiskCount) {
    return skip("too_many_risk_flags", {
      marketSlug,
      riskCount,
      riskFlags,
    });
  }

  const baseRequiredDistanceBps = baseRequiredBps(secondsElapsed, config);
  const requiredDistanceBps =
    baseRequiredDistanceBps + (riskCount === 1 ? config.oneRiskTaxBps : 0);

  if (absDistanceBps < requiredDistanceBps - EPSILON) {
    return skip("below_required_distance", {
      absDistanceBps,
      baseRequiredDistanceBps,
      marketSlug,
      requiredDistanceBps,
      riskCount,
    });
  }

  const entryMarketPrice = getDisplayedPrice(latestSnapshot, side);
  const resolvedStakeUsd = resolveStakeUsd({
    absDistanceBps,
    config,
    entryMarketPrice,
    requiredDistanceBps,
    riskCount,
  });
  const now = nowTs;

  return {
    action: "paper_trade",
    trade: {
      absDistanceBps,
      actualWinner: null,
      baseRequiredDistanceBps,
      btcAgeMs: btc.ageMs,
      btcAtEntry: btc.price,
      btcTickTs: btc.ts,
      closeBtc: null,
      correct: null,
      createdAt: now,
      distanceBps,
      downDisplayed: nullableNumber(latestSnapshot?.downDisplayed),
      downSpread: nullableNumber(latestSnapshot?.downSpread),
      engineVersion: config.engineVersion,
      entryMarketPrice,
      entrySecond: secondsElapsed,
      entryTs: now,
      marketId: market.marketId ?? "",
      marketSlug,
      paper: true,
      pathFeatures: compactPathFeatures(pathFeatures),
      pnlUsd: null,
      priceToBeat,
      priceToBeatSource,
      requiredDistanceBps,
      resultSource: null,
      riskCount,
      riskFlags,
      runId,
      settledAt: null,
      shares: null,
      side,
      stakeUsd: resolvedStakeUsd,
      status: "open",
      strategyVersion: resolvedStrategyVersion,
      secondsRemaining: Math.max(0, Math.ceil((windowEndTs - now) / 1000)),
      upDisplayed: nullableNumber(latestSnapshot?.upDisplayed),
      upSpread: nullableNumber(latestSnapshot?.upSpread),
      updatedAt: now,
      windowEndTs,
      windowStartTs,
    },
  };
}

function normalizeWinner(value) {
  return value === "up" || value === "down" || value === "tie" ? value : null;
}

function winnerFromClose(closeBtc, priceToBeat) {
  const closeValue = toFiniteNumber(closeBtc);
  const referenceValue = toFiniteNumber(priceToBeat);

  if (closeValue === null || referenceValue === null) {
    return null;
  }

  if (closeValue > referenceValue) {
    return "up";
  }

  if (closeValue < referenceValue) {
    return "down";
  }

  return "tie";
}

export function settlePaperTrade({
  closeBtc = null,
  market = null,
  nowTs = Date.now(),
  resultSource = null,
  trade,
  winner = null,
} = {}) {
  if (!trade) {
    return skip("missing_trade");
  }

  let actualWinner = normalizeWinner(winner);
  let resolvedCloseBtc = toFiniteNumber(closeBtc);
  let resolvedSource = resultSource ?? null;

  if (!actualWinner && normalizeWinner(market?.winningOutcome)) {
    actualWinner = normalizeWinner(market.winningOutcome);
    resolvedSource = "official";
    resolvedCloseBtc =
      toFiniteNumber(market?.closeReferencePriceOfficial) ??
      toFiniteNumber(market?.closeReferencePriceDerived) ??
      resolvedCloseBtc;
  }

  if (!actualWinner) {
    const officialClose = toFiniteNumber(market?.closeReferencePriceOfficial);

    if (officialClose !== null) {
      actualWinner = winnerFromClose(officialClose, trade.priceToBeat);
      resolvedCloseBtc = officialClose;
      resolvedSource = actualWinner === "tie" ? "tie" : "official";
    }
  }

  if (!actualWinner) {
    const derivedClose = toFiniteNumber(market?.closeReferencePriceDerived);

    if (derivedClose !== null) {
      actualWinner = winnerFromClose(derivedClose, trade.priceToBeat);
      resolvedCloseBtc = derivedClose;
      resolvedSource = actualWinner === "tie" ? "tie" : "derived";
    }
  }

  if (!actualWinner && resolvedCloseBtc !== null) {
    actualWinner = winnerFromClose(resolvedCloseBtc, trade.priceToBeat);
    resolvedSource = actualWinner === "tie" ? "tie" : (resolvedSource ?? "derived");
  }

  if (!actualWinner) {
    return skip("missing_result", {
      marketSlug: trade.marketSlug,
    });
  }

  const correct = actualWinner === "tie" ? null : trade.side === actualWinner;
  const entryMarketPrice = toFiniteNumber(trade.entryMarketPrice);
  const stakeUsdValue = toFiniteNumber(trade.stakeUsd);
  const shares =
    entryMarketPrice !== null && entryMarketPrice > 0 && stakeUsdValue !== null
      ? stakeUsdValue / entryMarketPrice
      : null;
  const pnlUsd =
    shares === null || stakeUsdValue === null || correct === null
      ? null
      : correct
        ? shares - stakeUsdValue
        : -stakeUsdValue;

  return {
    action: "settle",
    result: {
      actualWinner,
      closeBtc: resolvedCloseBtc,
      correct,
      pnlUsd,
      resultSource: resolvedSource,
      settledAt: nowTs,
      shares,
      status: "settled",
      updatedAt: nowTs,
    },
  };
}
