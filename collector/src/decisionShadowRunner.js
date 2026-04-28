import {
  DECISION_ACTIONS,
  DECISION_CONFIG,
  REASON_CODES,
} from "../../packages/shared/src/decisionConfig.js";
import { nearestDecisionCheckpoint } from "../../packages/shared/src/decisionFeatures.js";
import { normalizeDecisionSignal } from "../../packages/shared/src/decisionSignals.js";
import { buildDecisionContext, runDecision } from "./decisionRunner.js";

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketSlugFor(market) {
  return typeof market?.slug === "string" && market.slug !== ""
    ? market.slug
    : typeof market?.marketSlug === "string" && market.marketSlug !== ""
      ? market.marketSlug
      : null;
}

function mapGet(mapLike, key) {
  if (!key || !mapLike) {
    return null;
  }

  if (typeof mapLike.get === "function") {
    return mapLike.get(key) ?? null;
  }

  if (typeof mapLike === "object") {
    return mapLike[key] ?? null;
  }

  return null;
}

function getSnapshotTime(snapshot, fallbackNowMs) {
  return (
    toFiniteNumber(snapshot?.writtenAt) ??
    toFiniteNumber(snapshot?.ts) ??
    toFiniteNumber(snapshot?.secondBucket) ??
    fallbackNowMs
  );
}

function getSnapshotSecond(snapshot, market) {
  const explicit = toFiniteNumber(snapshot?.secondsFromWindowStart);

  if (explicit !== null) {
    return explicit;
  }

  const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);
  const windowStartTs = toFiniteNumber(market?.windowStartTs);

  if (secondBucket === null || windowStartTs === null) {
    return null;
  }

  return Math.floor((secondBucket - windowStartTs) / 1000);
}

function getSecondBucketForCheckpoint(market, checkpointSecond) {
  const windowStartTs = toFiniteNumber(market?.windowStartTs);

  if (windowStartTs === null || !Number.isFinite(checkpointSecond)) {
    return null;
  }

  return Math.floor((windowStartTs + checkpointSecond * 1000) / 1000) * 1000;
}

function checkpointKey(marketSlug, decisionVersion, checkpointSecond) {
  return `${marketSlug}:${decisionVersion}:${checkpointSecond}`;
}

function isCheckpointClosed(market, checkpointSecond, nowMs, config) {
  const windowStartTs = toFiniteNumber(market?.windowStartTs);

  if (windowStartTs === null || !Number.isFinite(nowMs)) {
    return false;
  }

  const secondsNow = (nowMs - windowStartTs) / 1000;
  // Keep the tolerance boundary inclusive for candidate snapshots; emit only
  // after the window is strictly past that boundary.
  return secondsNow > checkpointSecond + config.checkpointToleranceSec;
}

function chooseCandidate(existing, candidate) {
  if (!existing) {
    return candidate;
  }

  if (candidate.absDeltaSeconds < existing.absDeltaSeconds) {
    return candidate;
  }

  if (candidate.absDeltaSeconds > existing.absDeltaSeconds) {
    return existing;
  }

  if (candidate.secondsFromWindowStart < existing.secondsFromWindowStart) {
    return candidate;
  }

  if (candidate.secondsFromWindowStart > existing.secondsFromWindowStart) {
    return existing;
  }

  return candidate.evaluatedAt < existing.evaluatedAt ? candidate : existing;
}

function normalizeMarketSignal(row, nowMs) {
  return normalizeDecisionSignal(row, { nowMs });
}

export function buildDecisionSignal({
  captureMode = null,
  checkpointSecond,
  collectorStatus = null,
  context,
  engineRunId,
  market,
  priors = null,
  result,
  snapshot,
} = {}) {
  const evaluatedAt = toFiniteNumber(context?.nowMs) ?? getSnapshotTime(snapshot, Date.now());
  const signal = {
    absDistanceBps: result?.absDistanceBps,
    action: result?.action ?? DECISION_ACTIONS.WAIT,
    actionPreMute: result?.actionPreMute ?? null,
    btcAgeMs: result?.btcAgeMs,
    btcPrice: result?.btcPrice,
    btcReceivedAt: context?.latestChainlinkTick?.receivedAt,
    btcTickTs: context?.latestChainlinkTick?.ts,
    captureMode,
    checkpointSecond: result?.checkpointSecond ?? checkpointSecond,
    collectorStatus: collectorStatus ?? context?.collectorStatus ?? null,
    createdAt: evaluatedAt,
    decisionVersion: result?.decisionVersion ?? DECISION_CONFIG.version,
    distanceBucket: result?.distanceBucket,
    edge: result?.edge,
    engineRunId,
    evaluatedAt,
    features: result?.features,
    flags: result?.flags,
    intendedSize: context?.intendedSize,
    leader: result?.leader,
    leaderAsk: result?.leaderAsk,
    leaderBid: result?.leaderBid,
    leaderSpread: result?.leaderSpread,
    leaderTopAskDepth: result?.leaderTopAskDepth,
    limitPrice: result?.limitPrice,
    marketId: market?.marketId,
    marketSlug: marketSlugFor(market),
    pBase: result?.pBase,
    pCandidates: result?.pCandidates,
    pEst: result?.pEst,
    priceToBeat: result?.priceToBeat,
    priceToBeatSource: result?.priceToBeatSource,
    priorsComputedAt: priors?.computedAt,
    priorsRollupVersion: priors?.rollupVersion,
    reasonCodes: result?.reasonCodes ?? [],
    requiredDistanceBps: result?.requiredDistanceBps,
    requiredEdge: result?.requiredEdge,
    secondBucket: toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts),
    secondsFromWindowStart:
      result?.secondsFromWindowStart ?? snapshot?.secondsFromWindowStart,
    signedDistanceBps: result?.signedDistanceBps,
    snapshotAgeMs: result?.snapshotAgeMs,
    snapshotTs: snapshot?.ts ?? snapshot?.writtenAt ?? snapshot?.secondBucket,
    sourceQuality: result?.sourceQuality ?? snapshot?.sourceQuality,
    windowEndTs: market?.windowEndTs,
    windowStartTs: market?.windowStartTs,
  };

  return normalizeMarketSignal(signal, evaluatedAt);
}

export function buildMissedCheckpointSignal({
  collectorStatus = null,
  config = DECISION_CONFIG,
  engineRunId,
  market,
  nowMs,
  checkpointSecond,
} = {}) {
  const secondBucket = getSecondBucketForCheckpoint(market, checkpointSecond);

  return normalizeMarketSignal(
    {
      action: DECISION_ACTIONS.WAIT,
      checkpointSecond,
      collectorStatus,
      createdAt: nowMs,
      decisionVersion: config.version,
      engineRunId,
      evaluatedAt: nowMs,
      marketId: market?.marketId,
      marketSlug: marketSlugFor(market),
      reasonCodes: [REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT],
      secondBucket,
      secondsFromWindowStart: checkpointSecond,
      windowEndTs: market?.windowEndTs,
      windowStartTs: market?.windowStartTs,
    },
    nowMs,
  );
}

export function createDecisionShadowRunner({
  config = DECISION_CONFIG,
  engineRunId,
} = {}) {
  const candidatesByCheckpoint = new Map();
  const emittedCheckpoints = new Set();

  function syncActiveMarkets(markets) {
    const activeSlugs = new Set(
      (Array.isArray(markets) ? markets : [])
        .map(marketSlugFor)
        .filter(Boolean),
    );

    for (const key of [...candidatesByCheckpoint.keys()]) {
      const [marketSlug] = key.split(":");

      if (!activeSlugs.has(marketSlug)) {
        candidatesByCheckpoint.delete(key);
      }
    }

    for (const key of [...emittedCheckpoints]) {
      const [marketSlug] = key.split(":");

      if (!activeSlugs.has(marketSlug)) {
        emittedCheckpoints.delete(key);
      }
    }
  }

  function markClosedAsSeen({ markets, nowMs, runnerConfig }) {
    for (const market of Array.isArray(markets) ? markets : []) {
      const marketSlug = marketSlugFor(market);

      if (!marketSlug) {
        continue;
      }

      for (const checkpointSecond of runnerConfig.targetCheckpoints ?? []) {
        if (isCheckpointClosed(market, checkpointSecond, nowMs, runnerConfig)) {
          emittedCheckpoints.add(
            checkpointKey(marketSlug, runnerConfig.version, checkpointSecond),
          );
        }
      }
    }
  }

  function evaluate({
    captureMode = null,
    collectorStatus = null,
    enabled = true,
    intendedSize = null,
    latestChainlinkTick = null,
    latestSnapshotsByMarketSlug = null,
    markets = [],
    nowMs = Date.now(),
    pathBuffer = null,
    priors = null,
    runtimeControls = null,
    config: overrideConfig = null,
  } = {}) {
    const runnerConfig = overrideConfig ?? config;
    const rows = [];

    syncActiveMarkets(markets);

    if (!enabled || runtimeControls?.decision_engine_enabled !== true) {
      markClosedAsSeen({ markets, nowMs, runnerConfig });
      candidatesByCheckpoint.clear();
      return rows;
    }

    for (const market of Array.isArray(markets) ? markets : []) {
      const marketSlug = marketSlugFor(market);
      const snapshot = mapGet(latestSnapshotsByMarketSlug, marketSlug);

      if (!marketSlug) {
        continue;
      }

      if (snapshot) {
        const secondsFromWindowStart = getSnapshotSecond(snapshot, market);
        const checkpoint = nearestDecisionCheckpoint(
          secondsFromWindowStart,
          runnerConfig,
        );

        if (checkpoint) {
          const evaluatedAt = getSnapshotTime(snapshot, nowMs);
          const context = buildDecisionContext({
            collectorStatus,
            intendedSize,
            latestChainlinkTick,
            latestSnapshot: snapshot,
            market,
            nowMs: evaluatedAt,
            pathBuffer,
            priors,
            runtimeControls,
          });
          const decision = runDecision({
            config: runnerConfig,
            context,
            priors,
          });
          const signal = buildDecisionSignal({
            captureMode,
            checkpointSecond: checkpoint.checkpointSecond,
            collectorStatus,
            context: decision.context,
            engineRunId,
            market,
            priors,
            result: decision.result,
            snapshot,
          });
          const key = checkpointKey(
            marketSlug,
            runnerConfig.version,
            checkpoint.checkpointSecond,
          );

          candidatesByCheckpoint.set(
            key,
            chooseCandidate(candidatesByCheckpoint.get(key), {
              absDeltaSeconds: checkpoint.absDeltaSeconds,
              evaluatedAt: signal.evaluatedAt,
              secondsFromWindowStart,
              signal,
            }),
          );
        }
      }

      for (const checkpointSecond of runnerConfig.targetCheckpoints ?? []) {
        const key = checkpointKey(
          marketSlug,
          runnerConfig.version,
          checkpointSecond,
        );

        if (
          emittedCheckpoints.has(key) ||
          !isCheckpointClosed(market, checkpointSecond, nowMs, runnerConfig)
        ) {
          continue;
        }

        const candidate = candidatesByCheckpoint.get(key);
        const signal =
          candidate?.signal ??
          buildMissedCheckpointSignal({
            checkpointSecond,
            collectorStatus,
            config: runnerConfig,
            engineRunId,
            market,
            nowMs,
          });

        rows.push(signal);
        emittedCheckpoints.add(key);
        candidatesByCheckpoint.delete(key);
      }
    }

    return rows;
  }

  return {
    evaluate,
    getCandidateCount() {
      return candidatesByCheckpoint.size;
    },
  };
}
