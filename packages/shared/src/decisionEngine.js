import {
  DECISION_ACTIONS,
  DECISION_CONFIG,
  DECISION_SIDES,
  REASON_CODES,
} from "./decisionConfig.js";
import {
  bucketDistance,
  buildPreTFeatures,
  computeLeader,
  computeRiskFlags,
  executionGate,
  nearestDecisionCheckpoint,
  requiredDistanceBps,
  signedDistanceBps,
} from "./decisionFeatures.js";
import { estimateDecisionProbability } from "./decisionPriors.js";

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueReasonCodes(reasonCodes) {
  return [...new Set(reasonCodes.filter(Boolean))];
}

function getMarket(context) {
  return context?.market ?? context?.marketMetadata ?? {};
}

function getWindowStartTs(context) {
  const market = getMarket(context);

  return toFiniteNumber(context?.windowStartTs ?? market?.windowStartTs);
}

function getPriceToBeat(context) {
  const market = getMarket(context);
  const official = toFiniteNumber(
    context?.priceToBeatOfficial ?? market?.priceToBeatOfficial,
  );

  if (official !== null) {
    return {
      priceToBeat: official,
      priceToBeatSource: "official",
    };
  }

  const explicit = toFiniteNumber(context?.priceToBeat ?? market?.priceToBeat);

  if (explicit !== null) {
    return {
      priceToBeat: explicit,
      priceToBeatSource:
        context?.priceToBeatSource ?? market?.priceToBeatSource ?? null,
    };
  }

  const derived = toFiniteNumber(
    context?.priceToBeatDerived ?? market?.priceToBeatDerived,
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

function getBtcTick(context) {
  return (
    context?.latestChainlinkTick ??
    context?.latestBtcTick ??
    context?.btcTick ??
    null
  );
}

function getBtcPrice(tick) {
  return toFiniteNumber(tick?.price ?? tick?.btcPrice);
}

function getBtcAgeMs(tick, nowMs) {
  const tickTime = toFiniteNumber(tick?.receivedAt ?? tick?.ts);

  return tickTime === null ? null : Math.max(0, nowMs - tickTime);
}

function getSnapshot(context) {
  return context?.latestSnapshot ?? context?.snapshot ?? null;
}

function getSnapshotAgeMs(snapshot, nowMs) {
  const snapshotTime = toFiniteNumber(
    snapshot?.writtenAt ?? snapshot?.ts ?? snapshot?.secondBucket,
  );

  return snapshotTime === null ? null : Math.max(0, nowMs - snapshotTime);
}

function getSecondsFromWindowStart({ context, snapshot, windowStartTs }) {
  const explicit = toFiniteNumber(
    context?.secondsFromWindowStart ?? snapshot?.secondsFromWindowStart,
  );

  if (explicit !== null) {
    return explicit;
  }

  const secondBucket = toFiniteNumber(snapshot?.secondBucket);

  if (secondBucket !== null && Number.isFinite(windowStartTs)) {
    return Math.floor((secondBucket - windowStartTs) / 1000);
  }

  const nowMs = toFiniteNumber(context?.nowMs);

  if (nowMs !== null && Number.isFinite(windowStartTs)) {
    return Math.floor((nowMs - windowStartTs) / 1000);
  }

  return null;
}

function snapshotQualityReason(snapshot) {
  if (snapshot?.sourceQuality === "gap") {
    return REASON_CODES.BAD_SNAPSHOT_QUALITY_GAP;
  }

  if (snapshot?.sourceQuality === "stale_book") {
    return REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BOOK;
  }

  if (snapshot?.sourceQuality === "stale_btc") {
    return REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BTC;
  }

  return REASON_CODES.BAD_SNAPSHOT_QUALITY_UNKNOWN;
}

function getLeaderQuote(snapshot, leader) {
  if (leader === DECISION_SIDES.UP) {
    return {
      leaderAsk: toFiniteNumber(snapshot?.upAsk),
      leaderBid: toFiniteNumber(snapshot?.upBid),
      leaderSpread: toFiniteNumber(snapshot?.upSpread),
      leaderTopAskDepth: toFiniteNumber(snapshot?.upDepthAskTop),
    };
  }

  if (leader === DECISION_SIDES.DOWN) {
    return {
      leaderAsk: toFiniteNumber(snapshot?.downAsk),
      leaderBid: toFiniteNumber(snapshot?.downBid),
      leaderSpread: toFiniteNumber(snapshot?.downSpread),
      leaderTopAskDepth: toFiniteNumber(snapshot?.downDepthAskTop),
    };
  }

  return {
    leaderAsk: null,
    leaderBid: null,
    leaderSpread: null,
    leaderTopAskDepth: null,
  };
}

function collectorHealthReason(context) {
  const status = context?.collectorStatus ?? context?.collectorHealth?.status;

  if (typeof status !== "string" || status.trim() === "") {
    return REASON_CODES.DATA_QUALITY_UNAVAILABLE;
  }

  if (!["ok", "healthy"].includes(status.trim().toLowerCase())) {
    return REASON_CODES.COLLECTOR_UNHEALTHY;
  }

  return null;
}

function shouldMuteActions(context) {
  const emitActions =
    context?.runtimeControls?.decision_emit_actions ??
    context?.runtimeControls?.decisionEmitActions ??
    context?.runtime?.decision_emit_actions ??
    context?.runtime?.decisionEmitActions;

  return emitActions === "wait_only";
}

function baseResult(config) {
  return {
    action: DECISION_ACTIONS.WAIT,
    actionPreMute: null,
    decisionVersion: config.version,
    flags: null,
    leader: DECISION_SIDES.NONE,
    pBase: null,
    pCandidates: [],
    pEst: null,
    reasonCodes: [],
  };
}

function waitResult(config, reasonCodes, extras = {}) {
  return {
    ...baseResult(config),
    ...extras,
    action: DECISION_ACTIONS.WAIT,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

export function decide(context, priors, config = DECISION_CONFIG) {
  const nowMs = toFiniteNumber(context?.nowMs);

  if (nowMs === null) {
    return waitResult(config, [REASON_CODES.INVALID_CONTEXT]);
  }

  const healthReason = collectorHealthReason(context);

  if (healthReason) {
    return waitResult(config, [healthReason]);
  }

  const windowStartTs = getWindowStartTs(context);

  if (windowStartTs === null) {
    return waitResult(config, [REASON_CODES.MISSING_WINDOW_TIMING]);
  }

  const { priceToBeat, priceToBeatSource } = getPriceToBeat(context);

  if (priceToBeat === null) {
    return waitResult(config, [REASON_CODES.MISSING_PRICE_TO_BEAT]);
  }

  if (
    config.requireOfficialPriceToBeat &&
    priceToBeatSource !== "official"
  ) {
    return waitResult(config, [REASON_CODES.NO_OFFICIAL_PRICE_TO_BEAT], {
      priceToBeat,
      priceToBeatSource,
    });
  }

  const btcTick = getBtcTick(context);
  const btcPrice = getBtcPrice(btcTick);

  if (btcPrice === null) {
    return waitResult(config, [REASON_CODES.MISSING_BTC_TICK], {
      priceToBeat,
      priceToBeatSource,
    });
  }

  const btcAgeMs = getBtcAgeMs(btcTick, nowMs);

  if (btcAgeMs === null || btcAgeMs > config.maxBtcAgeMs) {
    return waitResult(config, [REASON_CODES.BTC_TOO_OLD], {
      btcAgeMs,
      btcPrice,
      priceToBeat,
      priceToBeatSource,
    });
  }

  const snapshot = getSnapshot(context);

  if (!snapshot) {
    return waitResult(config, [REASON_CODES.MISSING_MARKET_SNAPSHOT], {
      btcAgeMs,
      btcPrice,
      priceToBeat,
      priceToBeatSource,
    });
  }

  const snapshotAgeMs = getSnapshotAgeMs(snapshot, nowMs);

  if (snapshotAgeMs === null || snapshotAgeMs > config.maxSnapshotAgeMs) {
    return waitResult(config, [REASON_CODES.SNAPSHOT_TOO_OLD], {
      btcAgeMs,
      btcPrice,
      priceToBeat,
      priceToBeatSource,
      snapshotAgeMs,
    });
  }

  if (
    config.requireSourceQualityGood &&
    snapshot.sourceQuality !== "good"
  ) {
    return waitResult(config, [snapshotQualityReason(snapshot)], {
      btcAgeMs,
      btcPrice,
      priceToBeat,
      priceToBeatSource,
      snapshotAgeMs,
      sourceQuality: snapshot.sourceQuality ?? null,
    });
  }

  const secondsFromWindowStart = getSecondsFromWindowStart({
    context,
    snapshot,
    windowStartTs,
  });
  const checkpoint = nearestDecisionCheckpoint(secondsFromWindowStart, config);

  if (!checkpoint) {
    return waitResult(config, [REASON_CODES.OUTSIDE_DECISION_CHECKPOINT], {
      btcAgeMs,
      btcPrice,
      priceToBeat,
      priceToBeatSource,
      secondsFromWindowStart,
      snapshotAgeMs,
    });
  }

  const signedDistance = signedDistanceBps(btcPrice, priceToBeat);
  const absDistanceBps =
    signedDistance === null ? null : Math.abs(signedDistance);
  const leader = computeLeader({
    btcPrice,
    noiseBandBps: config.noiseBandBps,
    priceToBeat,
  });

  if (leader === DECISION_SIDES.NONE) {
    return waitResult(config, [REASON_CODES.INSIDE_NOISE_BAND], {
      absDistanceBps,
      btcAgeMs,
      btcPrice,
      checkpointSecond: checkpoint.checkpointSecond,
      priceToBeat,
      priceToBeatSource,
      secondsFromWindowStart,
      signedDistanceBps: signedDistance,
      snapshotAgeMs,
    });
  }

  const distanceBucket = bucketDistance(signedDistance);
  const rankThresholds =
    priors?.rankThresholds ?? context?.rankThresholds ?? null;
  const features = buildPreTFeatures({
    checkpointSecond: checkpoint.checkpointSecond,
    config,
    leader,
    priceToBeat,
    rankThresholds,
    recentPath: context?.recentPath ?? context?.path ?? [],
    windowStartTs,
  });
  const flags = computeRiskFlags({
    config,
    features,
    rankThresholds,
  });
  const common = {
    absDistanceBps,
    btcAgeMs,
    btcPrice,
    checkpointSecond: checkpoint.checkpointSecond,
    distanceBucket,
    features,
    flags,
    leader,
    priceToBeat,
    priceToBeatSource,
    secondsFromWindowStart,
    signedDistanceBps: signedDistance,
    snapshotAgeMs,
  };

  if (flags.recentLock) {
    return waitResult(config, [REASON_CODES.RECENT_LOCK], common);
  }

  if (flags.weakCoverage) {
    return waitResult(config, [REASON_CODES.WEAK_COVERAGE], common);
  }

  if (flags.unknownPath) {
    return waitResult(config, [REASON_CODES.UNKNOWN_PATH], common);
  }

  if (flags.tooManySoftRisks) {
    return waitResult(config, [REASON_CODES.TOO_MANY_SOFT_RISKS], common);
  }

  const requiredDistance = requiredDistanceBps(
    checkpoint.checkpointSecond,
    flags.softRiskCount,
    config,
  );

  if (
    !Number.isFinite(absDistanceBps) ||
    !Number.isFinite(requiredDistance) ||
    absDistanceBps < requiredDistance
  ) {
    return waitResult(config, [REASON_CODES.DISTANCE_TOO_SMALL], {
      ...common,
      requiredDistanceBps: requiredDistance,
    });
  }

  const probability = estimateDecisionProbability({
    checkpointSecond: checkpoint.checkpointSecond,
    config,
    distanceBucket,
    features,
    priors,
  });
  const probabilityCommon = {
    ...common,
    pBase: probability.pBase,
    pCandidates: probability.pCandidates,
    pEst: probability.pEst,
    requiredDistanceBps: requiredDistance,
  };

  if (!probability.pCandidates[0]?.accepted) {
    const reason =
      probability.pCandidates[0]?.rejectionReason === "sparse"
        ? REASON_CODES.BASE_PRIOR_SPARSE
        : REASON_CODES.BASE_PRIOR_MISSING;

    return waitResult(config, [reason], probabilityCommon);
  }

  if (
    !Number.isFinite(probability.pEst) ||
    probability.pEst < config.minProbabilityDefault
  ) {
    return waitResult(config, [REASON_CODES.P_EST_BELOW_MINIMUM], probabilityCommon);
  }

  const leaderQuote = getLeaderQuote(snapshot, leader);
  const execution = executionGate({
    checkpointSecond: checkpoint.checkpointSecond,
    config,
    intendedSize: context?.intendedSize ?? 1,
    leaderAsk: leaderQuote.leaderAsk,
    leaderSpread: leaderQuote.leaderSpread,
    leaderTopAskDepth: leaderQuote.leaderTopAskDepth,
    pEst: probability.pEst,
    softRiskCount: flags.softRiskCount,
  });
  const executionCommon = {
    ...probabilityCommon,
    edge: execution.edge,
    leaderAsk: leaderQuote.leaderAsk,
    leaderBid: leaderQuote.leaderBid,
    leaderSpread: leaderQuote.leaderSpread,
    leaderTopAskDepth: leaderQuote.leaderTopAskDepth,
    requiredEdge: execution.requiredEdge,
  };

  if (!execution.accepted) {
    return waitResult(config, execution.reasonCodes, executionCommon);
  }

  const actionPreMute =
    leader === DECISION_SIDES.UP
      ? DECISION_ACTIONS.ENTER_UP
      : DECISION_ACTIONS.ENTER_DOWN;
  const muted = shouldMuteActions(context);
  const action = muted ? DECISION_ACTIONS.WAIT : actionPreMute;
  const reasonCodes = [
    leader === DECISION_SIDES.UP
      ? REASON_CODES.ENTER_UP_SIGNAL
      : REASON_CODES.ENTER_DOWN_SIGNAL,
  ];

  if (muted) {
    reasonCodes.push(REASON_CODES.RUNTIME_ACTIONS_MUTED);
  }

  return {
    ...baseResult(config),
    ...executionCommon,
    action,
    actionPreMute: muted ? actionPreMute : null,
    leader,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}
