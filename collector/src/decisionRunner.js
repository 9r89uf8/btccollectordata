import {
  DECISION_ACTIONS,
  DECISION_CONFIG,
  DECISION_SIDES,
  REASON_CODES,
} from "../../packages/shared/src/decisionConfig.js";
import { decide } from "../../packages/shared/src/decisionEngine.js";

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

function getRecentPath({ marketSlug, pathBuffer, recentPath }) {
  if (Array.isArray(recentPath)) {
    return recentPath;
  }

  if (!marketSlug || typeof pathBuffer?.getRecentPath !== "function") {
    return [];
  }

  try {
    return pathBuffer.getRecentPath(marketSlug);
  } catch {
    return [];
  }
}

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }

  return "unknown decision error";
}

function decisionExceptionResult(config, error) {
  const safeConfig = config ?? DECISION_CONFIG;

  return {
    action: DECISION_ACTIONS.WAIT,
    actionPreMute: null,
    decisionError: formatError(error),
    decisionVersion: safeConfig.version ?? DECISION_CONFIG.version,
    flags: null,
    leader: DECISION_SIDES.NONE,
    pBase: null,
    pCandidates: [],
    pEst: null,
    reasonCodes: [REASON_CODES.DECISION_EXCEPTION],
  };
}

export function buildDecisionContext({
  collectorHealth = null,
  collectorStatus = null,
  intendedSize = null,
  latestChainlinkTick = null,
  latestSnapshot = null,
  latestSnapshotsByMarketSlug = null,
  market = null,
  nowMs = Date.now(),
  pathBuffer = null,
  priors = null,
  recentPath = null,
  runtimeControls = null,
} = {}) {
  const marketSlug = marketSlugFor(market);
  const resolvedCollectorStatus =
    collectorStatus ?? collectorHealth?.status ?? null;
  const resolvedSnapshot =
    latestSnapshot ?? mapGet(latestSnapshotsByMarketSlug, marketSlug);

  return {
    collectorHealth:
      collectorHealth ??
      (resolvedCollectorStatus ? { status: resolvedCollectorStatus } : null),
    collectorStatus: resolvedCollectorStatus,
    intendedSize: toFiniteNumber(intendedSize) ?? undefined,
    latestChainlinkTick,
    latestSnapshot: resolvedSnapshot,
    market,
    nowMs: toFiniteNumber(nowMs),
    priors,
    recentPath: getRecentPath({
      marketSlug,
      pathBuffer,
      recentPath,
    }),
    runtimeControls,
  };
}

export function decideSafely(context, priors, config = DECISION_CONFIG) {
  try {
    return decide(context, priors, config);
  } catch (error) {
    return decisionExceptionResult(config, error);
  }
}

export function runDecision(args = {}) {
  let context = args.context ?? null;

  try {
    context = context ?? buildDecisionContext(args);

    return {
      context,
      error: null,
      result: decideSafely(context, args.priors ?? context.priors, args.config),
    };
  } catch (error) {
    return {
      context,
      error: formatError(error),
      result: decisionExceptionResult(args.config, error),
    };
  }
}
