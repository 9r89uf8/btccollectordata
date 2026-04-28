import { DECISION_CONFIG } from "./decisionConfig.js";

export const DECISION_PRIOR_SUPPORT_TIERS = Object.freeze({
  IGNORED: "ignored",
  USABLE: "usable",
  WARNING_ONLY: "warning-only",
});

export const DECISION_PRIOR_SOURCES = Object.freeze([
  "base",
  "chop",
  "momentum",
  "leaderAge",
  "prePathShape",
]);

const SOURCE_COLLECTION_KEYS = Object.freeze({
  base: Object.freeze(["baseByCheckpointDistance", "base"]),
  chop: Object.freeze(["chopByCheckpointDistance", "chop"]),
  leaderAge: Object.freeze([
    "leaderAgeByCheckpointDistance",
    "leaderAge",
  ]),
  momentum: Object.freeze([
    "momentumByCheckpointDistance",
    "momentum",
  ]),
  prePathShape: Object.freeze([
    "prePathShapeByCheckpoint",
    "prePathShape",
  ]),
});

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function compactBucket(bucket) {
  if (!bucket || typeof bucket.id !== "string") {
    return null;
  }

  return {
    id: bucket.id,
    label: typeof bucket.label === "string" ? bucket.label : bucket.id,
  };
}

function compactBuckets(buckets) {
  return (Array.isArray(buckets) ? buckets : [])
    .map(compactBucket)
    .filter(Boolean);
}

function finiteReferenceValues(values) {
  return (Array.isArray(values) ? values : [])
    .map(toFiniteNumber)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function getRollupLeader(rollup) {
  return rollup?.v1?.leader ?? rollup?.leader ?? null;
}

function getRollupStability(rollup) {
  return rollup?.v2?.stability ?? rollup?.stability ?? null;
}

function getCells(collection) {
  if (Array.isArray(collection)) {
    return collection;
  }

  if (Array.isArray(collection?.cells)) {
    return collection.cells;
  }

  return [];
}

export function supportTierForN(n, config = DECISION_CONFIG) {
  const support = toFiniteNumber(n);

  if (support === null || support < config.warningSupportN) {
    return DECISION_PRIOR_SUPPORT_TIERS.IGNORED;
  }

  if (support < config.strongSupportN) {
    return DECISION_PRIOR_SUPPORT_TIERS.WARNING_ONLY;
  }

  return DECISION_PRIOR_SUPPORT_TIERS.USABLE;
}

function buildRankThresholds(stability) {
  const definitions = stability?.preChopBucketDefinitions ?? {};
  const ranks = definitions.ranks ?? definitions;
  const referenceValues =
    definitions.referenceValues ?? ranks.referenceValues ?? {};
  const nearLinePctReference = finiteReferenceValues(
    referenceValues.nearLinePct ??
      referenceValues.nearLinePcts ??
      referenceValues.nearLinePctValues,
  );
  const preFlipRateReference = finiteReferenceValues(
    referenceValues.preFlipRatePerMinute ??
      referenceValues.preFlipRates ??
      referenceValues.preFlipRatePerMinuteValues,
  );

  return {
    componentThresholdMethod: ranks.componentThresholdMethod ?? null,
    degenerate: Boolean(ranks.degenerate),
    highThreshold: toFiniteNumber(ranks.highThreshold),
    lowThreshold: toFiniteNumber(ranks.lowThreshold),
    nearLineHighThreshold: toFiniteNumber(ranks.nearLineHighThreshold),
    oscillationHighThreshold: toFiniteNumber(ranks.oscillationHighThreshold),
    referenceValues: {
      nearLinePct: nearLinePctReference,
      preFlipRatePerMinute: preFlipRateReference,
    },
    targetCheckpoints: Array.isArray(ranks.targetCheckpoints)
      ? ranks.targetCheckpoints.filter(Number.isFinite)
      : [],
    thresholdMethod: ranks.thresholdMethod ?? null,
    tieHandling: ranks.tieHandling ?? null,
  };
}

function getCollection(priors, source) {
  for (const key of SOURCE_COLLECTION_KEYS[source] ?? []) {
    const collection = priors?.[key];

    if (collection) {
      return collection;
    }
  }

  return null;
}

function asCellArray(collection) {
  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection instanceof Map) {
    return [...collection.values()];
  }

  if (collection && typeof collection === "object") {
    return Object.values(collection);
  }

  return [];
}

function cellValue(cell, keys) {
  for (const key of keys) {
    if (cell?.[key] !== undefined) {
      return cell[key];
    }
  }

  return null;
}

export function getPriorProbability(cell) {
  return toFiniteNumber(
    cellValue(cell, [
      "p",
      "probability",
      "winRate",
      "leaderWinRate",
      "currentLeaderWinRate",
      "stableLeaderWinRate",
    ]),
  );
}

export function getPriorN(cell) {
  return toFiniteNumber(cellValue(cell, ["n", "N", "support", "count"]));
}

function matchesCell(cell, dimensions) {
  for (const [key, expected] of Object.entries(dimensions)) {
    if (expected == null) {
      continue;
    }

    if (key === "checkpointSecond") {
      if (toFiniteNumber(cell?.checkpointSecond) !== Number(expected)) {
        return false;
      }
      continue;
    }

    if (cell?.[key] !== expected) {
      return false;
    }
  }

  return true;
}

export function findPriorCell(priors, source, dimensions) {
  const cells = asCellArray(getCollection(priors, source));

  return cells.find((cell) => matchesCell(cell, dimensions)) ?? null;
}

export function shrinkProbability(pCell, n, pBase, k = DECISION_CONFIG.shrinkageK) {
  if (
    !Number.isFinite(pCell) ||
    !Number.isFinite(n) ||
    !Number.isFinite(pBase) ||
    !Number.isFinite(k) ||
    n < 0 ||
    k < 0
  ) {
    return null;
  }

  if (n + k === 0) {
    return null;
  }

  return (n * pCell + k * pBase) / (n + k);
}

function emptyCandidate(source, rejectionReason) {
  return {
    accepted: false,
    n: null,
    p: null,
    rejectionReason,
    shrunk: null,
    source,
  };
}

function candidateFromCell({
  cell,
  config,
  pBase,
  source,
}) {
  if (!cell) {
    return emptyCandidate(source, "missing");
  }

  const p = getPriorProbability(cell);
  const n = getPriorN(cell);
  const supportTier =
    typeof cell.supportTier === "string"
      ? cell.supportTier
      : supportTierForN(n, config);

  if (!Number.isFinite(p) || !Number.isFinite(n)) {
    return {
      ...emptyCandidate(source, "missing"),
      n,
      p,
      supportTier,
    };
  }

  if (Number.isFinite(n) && n < config.strongSupportN) {
    return {
      accepted: false,
      n,
      p,
      rejectionReason: "sparse",
      shrunk: null,
      source,
      supportTier,
    };
  }

  const shrunk =
    source === "base"
      ? p
      : shrinkProbability(p, n, pBase, config.shrinkageK);

  return {
    accepted: true,
    n,
    p,
    rejectionReason: null,
    shrunk,
    source,
    supportTier,
  };
}

function compactPriorCell({
  cell,
  config,
  dimensions,
  n,
  p,
  rawN,
  source,
}) {
  const support = toFiniteNumber(n);
  const supportTier = supportTierForN(support, config);

  if (supportTier === DECISION_PRIOR_SUPPORT_TIERS.IGNORED) {
    return null;
  }

  return {
    ...dimensions,
    n: support,
    p: isFiniteProbability(p) ? p : null,
    rawN: toFiniteNumber(rawN),
    source,
    supportTier,
  };
}

function compactBaseCell(cell, config) {
  const checkpointSecond = toFiniteNumber(cell?.checkpointSecond);
  const distanceBucket = cell?.distanceBucket;

  if (checkpointSecond === null || typeof distanceBucket !== "string") {
    return null;
  }

  return compactPriorCell({
    cell,
    config,
    dimensions: {
      checkpointSecond,
      distanceBucket,
    },
    n: getPriorN(cell),
    p: getPriorProbability(cell),
    rawN: getPriorN(cell),
    source: "base",
  });
}

function compactStabilityCell(cell, config, source, dimensions) {
  // Stability priors use leaderEligibleN because leaderWinRate excludes
  // checkpoint-in-noise rows from its denominator.
  return compactPriorCell({
    cell,
    config,
    dimensions,
    n: toFiniteNumber(cell?.leaderEligibleN ?? cell?.N),
    p: getPriorProbability(cell),
    rawN: getPriorN(cell),
    source,
  });
}

function splitDimensionsForSource(source, {
  checkpointSecond,
  distanceBucket,
  features,
}) {
  if (source === "chop") {
    if (!features?.preChopBucket || features.preChopBucket === "unknown") {
      return null;
    }

    return {
      checkpointSecond,
      distanceBucket,
      preChopBucket: features.preChopBucket,
    };
  }

  if (source === "momentum") {
    if (
      !features?.momentumAgreementBucket ||
      features.momentumAgreementBucket === "unknown"
    ) {
      return null;
    }

    return {
      checkpointSecond,
      distanceBucket,
      momentumAgreementBucket: features.momentumAgreementBucket,
    };
  }

  if (source === "leaderAge") {
    if (!features?.leadAgeBucket || features.leadAgeBucket === "unknown") {
      return null;
    }

    return {
      checkpointSecond,
      distanceBucket,
      leadAgeBucket: features.leadAgeBucket,
    };
  }

  if (source === "prePathShape") {
    if (!features?.prePathShape || features.prePathShape === "unknown") {
      return null;
    }

    return {
      checkpointSecond,
      // prePathShape is aggregated by checkpoint x shape, unlike the
      // distance-conditioned chop/momentum/leader-age splits.
      prePathShape: features.prePathShape,
    };
  }

  return null;
}

function targetCheckpointFilter(config) {
  const targetCheckpoints = new Set(config.targetCheckpoints ?? []);

  return (cell) =>
    targetCheckpoints.size === 0 ||
    targetCheckpoints.has(toFiniteNumber(cell?.checkpointSecond));
}

function compactCells(cells, mapper, config) {
  return cells
    .filter(targetCheckpointFilter(config))
    .map((cell) => mapper(cell, config))
    .filter(Boolean);
}

export function buildDecisionPriorsFromRollup(
  rollup,
  config = DECISION_CONFIG,
) {
  const leader = getRollupLeader(rollup);
  const stability = getRollupStability(rollup);
  const rankThresholds = buildRankThresholds(stability);
  const distanceBuckets = compactBuckets(
    stability?.distanceBuckets ?? leader?.distanceBuckets,
  );

  return {
    analyticsVersion: toFiniteNumber(rollup?.analyticsVersion),
    baseByCheckpointDistance: compactCells(
      getCells(leader?.byCheckpointAndDistance),
      compactBaseCell,
      config,
    ),
    chopByCheckpointDistance: compactCells(
      getCells(stability?.pathRiskByChop),
      (cell, mapperConfig) => {
        const checkpointSecond = toFiniteNumber(cell?.checkpointSecond);

        if (
          checkpointSecond === null ||
          typeof cell?.distanceBucket !== "string" ||
          typeof cell?.preChopBucket !== "string"
        ) {
          return null;
        }

        return compactStabilityCell(cell, mapperConfig, "chop", {
          checkpointSecond,
          distanceBucket: cell.distanceBucket,
          preChopBucket: cell.preChopBucket,
        });
      },
      config,
    ),
    computedAt: toFiniteNumber(rollup?.computedAt),
    distanceBuckets,
    leaderAgeByCheckpointDistance: compactCells(
      getCells(stability?.leaderAgeByDistance),
      (cell, mapperConfig) => {
        const checkpointSecond = toFiniteNumber(cell?.checkpointSecond);

        if (
          checkpointSecond === null ||
          typeof cell?.distanceBucket !== "string" ||
          typeof cell?.leadAgeBucket !== "string"
        ) {
          return null;
        }

        return compactStabilityCell(cell, mapperConfig, "leaderAge", {
          checkpointSecond,
          distanceBucket: cell.distanceBucket,
          leadAgeBucket: cell.leadAgeBucket,
        });
      },
      config,
    ),
    momentumByCheckpointDistance: compactCells(
      getCells(stability?.momentumAgreement),
      (cell, mapperConfig) => {
        const checkpointSecond = toFiniteNumber(cell?.checkpointSecond);

        if (
          checkpointSecond === null ||
          typeof cell?.distanceBucket !== "string" ||
          typeof cell?.momentumAgreementBucket !== "string"
        ) {
          return null;
        }

        return compactStabilityCell(cell, mapperConfig, "momentum", {
          checkpointSecond,
          distanceBucket: cell.distanceBucket,
          momentumAgreementBucket: cell.momentumAgreementBucket,
        });
      },
      config,
    ),
    prePathShapeByCheckpoint: compactCells(
      getCells(stability?.prePathShapes),
      (cell, mapperConfig) => {
        const checkpointSecond = toFiniteNumber(cell?.checkpointSecond);

        if (
          checkpointSecond === null ||
          typeof cell?.prePathShape !== "string"
        ) {
          return null;
        }

        return compactStabilityCell(cell, mapperConfig, "prePathShape", {
          checkpointSecond,
          prePathShape: cell.prePathShape,
        });
      },
      config,
    ),
    rankThresholds,
    rollupVersion: toFiniteNumber(rollup?.rollupVersion),
    stabilityAnalyticsVersion: toFiniteNumber(
      rollup?.stabilityAnalyticsVersion,
    ),
  };
}

export function estimateDecisionProbability({
  checkpointSecond,
  config = DECISION_CONFIG,
  distanceBucket,
  features,
  priors,
} = {}) {
  const baseCell = findPriorCell(priors, "base", {
    checkpointSecond,
    distanceBucket,
  });
  const baseCandidate = candidateFromCell({
    cell: baseCell,
    config,
    pBase: null,
    source: "base",
  });
  const pCandidates = [baseCandidate];

  if (!baseCandidate.accepted) {
    return {
      pBase: baseCandidate.p,
      pCandidates,
      pEst: null,
    };
  }

  const pBase = baseCandidate.p;
  const acceptedShrunk = [];

  for (const source of ["chop", "momentum", "leaderAge", "prePathShape"]) {
    const dimensions = splitDimensionsForSource(source, {
      checkpointSecond,
      distanceBucket,
      features,
    });

    if (!dimensions) {
      pCandidates.push(emptyCandidate(source, "not_applicable"));
      continue;
    }

    const candidate = candidateFromCell({
      cell: findPriorCell(priors, source, dimensions),
      config,
      pBase,
      source,
    });

    if (candidate.accepted && Number.isFinite(candidate.shrunk)) {
      acceptedShrunk.push(candidate.shrunk);
    }

    pCandidates.push(candidate);
  }

  return {
    pBase,
    pCandidates,
    // V0 keeps p_est as the min of accepted priors. Soft-risk penalty is
    // applied by the distance and edge gates, not by subtracting from p_est.
    pEst: Math.min(pBase, ...acceptedShrunk),
  };
}
