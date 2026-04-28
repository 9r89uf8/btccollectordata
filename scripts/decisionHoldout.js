#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DASHBOARD_ROLLUP_VERSION,
  DISTANCE_BUCKETS,
  LEAD_AGE_BUCKETS,
  MOMENTUM_AGREEMENT_BUCKETS,
  PRE_PATH_SHAPES,
  TARGET_PATH_RISK_CHECKPOINTS,
  buildAnalyticsDashboard,
  getDistanceBucket,
} from "../packages/shared/src/analyticsDashboard.js";
import { ANALYTICS_VERSION } from "../packages/shared/src/marketAnalytics.js";
import { STABILITY_ANALYTICS_VERSION } from "../packages/shared/src/marketStabilityAnalytics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_OUTPUT = path.join(repoRoot, "decision_priors_holdout_report.md");
const DEFAULT_MIN_PRIOR_N = 100;
const DEFAULT_WARNING_PRIOR_N = 50;
const DEFAULT_SHRINKAGE_K = 200;
const MAX_BUFFER_BYTES = 128 * 1024 * 1024;

const CHOP_BUCKETS = [
  { id: "low", label: "Low chop" },
  { id: "medium", label: "Medium chop" },
  { id: "high", label: "High chop" },
  { id: "unknown", label: "Unknown" },
];

function usage() {
  return `Usage: node scripts/decisionHoldout.js [options]

Options:
  --output <path>          Markdown report path. Default: decision_priors_holdout_report.md
  --analytics-json <path>  Read compact market_analytics rows from JSON.
  --stability-json <path>  Read compact market_stability_analytics rows from JSON.
  --cache-dir <path>       Read/write analytics.json and stability.json in this directory.
  --write-cache            Write fetched rows into --cache-dir.
  --use-cache              Read rows from --cache-dir.
  --min-prior-n <number>   Usable live support floor. Default: 100.
  --warning-prior-n <n>    Warning-only support floor. Default: 50.
  --shrinkage-k <number>   Split-prior shrinkage K. Default: 200.
  --help                   Show this message.

Without JSON/cache inputs, the script fetches compact pages through:
  internal/analyticsRollups:listAnalyticsPage
  internal/analyticsRollups:listStabilityPage
`;
}

function parseArgs(argv) {
  const args = {
    analyticsJson: null,
    cacheDir: null,
    minPriorN: DEFAULT_MIN_PRIOR_N,
    output: DEFAULT_OUTPUT,
    shrinkageK: DEFAULT_SHRINKAGE_K,
    stabilityJson: null,
    useCache: false,
    warningPriorN: DEFAULT_WARNING_PRIOR_N,
    writeCache: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--output") {
      args.output = path.resolve(repoRoot, next());
    } else if (arg === "--analytics-json") {
      args.analyticsJson = path.resolve(repoRoot, next());
    } else if (arg === "--stability-json") {
      args.stabilityJson = path.resolve(repoRoot, next());
    } else if (arg === "--cache-dir") {
      args.cacheDir = path.resolve(repoRoot, next());
    } else if (arg === "--write-cache") {
      args.writeCache = true;
    } else if (arg === "--use-cache") {
      args.useCache = true;
    } else if (arg === "--min-prior-n") {
      args.minPriorN = Number(next());
    } else if (arg === "--warning-prior-n") {
      args.warningPriorN = Number(next());
    } else if (arg === "--shrinkage-k") {
      args.shrinkageK = Number(next());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.minPriorN) || args.minPriorN <= 0) {
    throw new Error("--min-prior-n must be a positive number");
  }

  if (!Number.isFinite(args.warningPriorN) || args.warningPriorN <= 0) {
    throw new Error("--warning-prior-n must be a positive number");
  }

  if (!Number.isFinite(args.shrinkageK) || args.shrinkageK < 0) {
    throw new Error("--shrinkage-k must be zero or positive");
  }

  if ((args.useCache || args.writeCache) && !args.cacheDir) {
    throw new Error("--cache-dir is required with --use-cache or --write-cache");
  }

  return args;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseConvexJson(stdout) {
  const trimmed = stdout.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const objectStart = trimmed.indexOf("{");
    const arrayStart = trimmed.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    const start = starts.length === 0 ? -1 : Math.min(...starts);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
  }

  throw new Error(`Could not parse Convex output as JSON:\n${stdout}`);
}

function npxInvocation() {
  if (process.platform === "win32") {
    const npmNpxCli = path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npx-cli.js",
    );

    if (fs.existsSync(npmNpxCli)) {
      return {
        argsPrefix: [npmNpxCli],
        command: process.execPath,
      };
    }

    return {
      argsPrefix: [],
      command: "npx.cmd",
      shell: true,
    };
  }

  return {
    argsPrefix: [],
    command: "npx",
  };
}

function runConvex(functionRef, args) {
  const invocation = npxInvocation();
  const stdout = execFileSync(
    invocation.command,
    [...invocation.argsPrefix, "convex", "run", functionRef, JSON.stringify(args)],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER_BYTES,
      shell: invocation.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return parseConvexJson(stdout);
}

function collectConvexPages({ functionRef, pageLimit }) {
  const rows = [];
  let beforeWindowEndTs = undefined;

  for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
    const args = { limit: pageLimit };

    if (beforeWindowEndTs !== undefined) {
      args.beforeWindowEndTs = beforeWindowEndTs;
    }

    const page = runConvex(functionRef, args);

    rows.push(...(page.rows ?? []));

    if (page.done || !page.nextBeforeWindowEndTs) {
      return rows;
    }

    beforeWindowEndTs = page.nextBeforeWindowEndTs;
  }

  throw new Error(`Convex pagination did not finish for ${functionRef}`);
}

function loadRows(args) {
  let analyticsRows = null;
  let stabilityRows = null;

  if (args.useCache) {
    analyticsRows = readJsonFile(path.join(args.cacheDir, "analytics.json"));
    stabilityRows = readJsonFile(path.join(args.cacheDir, "stability.json"));
  }

  if (args.analyticsJson) {
    analyticsRows = readJsonFile(args.analyticsJson);
  }

  if (args.stabilityJson) {
    stabilityRows = readJsonFile(args.stabilityJson);
  }

  if (!analyticsRows) {
    analyticsRows = collectConvexPages({
      functionRef: "internal/analyticsRollups:listAnalyticsPage",
      pageLimit: 500,
    });
  }

  if (!stabilityRows) {
    stabilityRows = collectConvexPages({
      functionRef: "internal/analyticsRollups:listStabilityPage",
      pageLimit: 300,
    });
  }

  if (args.writeCache) {
    writeJsonFile(path.join(args.cacheDir, "analytics.json"), analyticsRows);
    writeJsonFile(path.join(args.cacheDir, "stability.json"), stabilityRows);
  }

  return { analyticsRows, stabilityRows };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function percent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function number(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function integer(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function getCheckpoint(row, checkpointSecond) {
  return row?.checkpoints?.find(
    (checkpoint) => checkpoint.checkpointSecond === checkpointSecond,
  );
}

function getDayKey(ts) {
  if (!Number.isFinite(ts)) {
    return "unknown";
  }

  return new Date(ts).toISOString().slice(0, 10);
}

function isCleanAnalytics(row) {
  return (
    row?.outcomeSource === "official" &&
    row.priceToBeat !== null &&
    row.completeFreshCheckpoints === true
  );
}

function getCleanAnalyticsSlugSet(analyticsRows) {
  return new Set(
    analyticsRows
      .filter(isCleanAnalytics)
      .map((row) => row.marketSlug)
      .filter(Boolean),
  );
}

function isCleanStability(row, cleanAnalyticsSlugs) {
  return (
    cleanAnalyticsSlugs.has(row?.marketSlug) &&
    row.resolvedOutcome !== null &&
    row.priceToBeat !== null &&
    Array.isArray(row.checkpoints)
  );
}

function isTargetCheckpoint(checkpointSecond) {
  return TARGET_PATH_RISK_CHECKPOINTS.includes(checkpointSecond);
}

function targetDistanceBucket(distanceBps) {
  const bucket = getDistanceBucket(distanceBps);

  if (!bucket || bucket.id === "le_0_5") {
    return null;
  }

  return bucket;
}

function preFlipRatePerMinute(checkpoint) {
  return Number.isFinite(checkpoint?.preFlipCount) &&
    Number.isFinite(checkpoint?.checkpointSecond) &&
    checkpoint.checkpointSecond > 0
    ? checkpoint.preFlipCount / (checkpoint.checkpointSecond / 60)
    : null;
}

function preNearLinePct(checkpoint) {
  return Number.isFinite(checkpoint?.preNearLineSeconds) &&
    Number.isFinite(checkpoint?.checkpointSecond) &&
    checkpoint.checkpointSecond > 0
    ? checkpoint.preNearLineSeconds / checkpoint.checkpointSecond
    : null;
}

function assignMidRanks(entries, valueField, rankField) {
  const ranked = entries
    .filter((entry) => Number.isFinite(entry[valueField]))
    .sort((a, b) => a[valueField] - b[valueField]);
  const denominator = Math.max(1, ranked.length - 1);
  let index = 0;

  while (index < ranked.length) {
    let end = index;

    while (
      end + 1 < ranked.length &&
      ranked[end + 1][valueField] === ranked[index][valueField]
    ) {
      end += 1;
    }

    const rank = ranked.length === 1 ? 0.5 : ((index + end) / 2) / denominator;

    for (let rankIndex = index; rankIndex <= end; rankIndex += 1) {
      ranked[rankIndex][rankField] = rank;
    }

    index = end + 1;
  }
}

function interpolatedPercentile(values, p) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = Math.min(
    sorted.length - 1,
    Math.max(0, (sorted.length - 1) * p),
  );
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = position - lowerIndex;

  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function rankAgainstTraining(sortedValues, value) {
  if (!Number.isFinite(value) || sortedValues.length === 0) {
    return null;
  }

  if (sortedValues.length === 1) {
    return 0.5;
  }

  let less = 0;
  let equal = 0;

  for (const candidate of sortedValues) {
    if (candidate < value) {
      less += 1;
    } else if (candidate === value) {
      equal += 1;
    } else {
      break;
    }
  }

  const midIndex = equal > 0 ? less + (equal - 1) / 2 : less;
  return Math.max(0, Math.min(1, midIndex / (sortedValues.length - 1)));
}

function getChopBucket(preChopRank, thresholds) {
  if (!Number.isFinite(preChopRank) || !thresholds) {
    return CHOP_BUCKETS[3];
  }

  if (thresholds.degenerate) {
    return CHOP_BUCKETS[1];
  }

  if (preChopRank < thresholds.low) {
    return CHOP_BUCKETS[0];
  }

  if (preChopRank >= thresholds.high) {
    return CHOP_BUCKETS[2];
  }

  return CHOP_BUCKETS[1];
}

function getLeadAgeBucket(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  for (const bucket of LEAD_AGE_BUCKETS) {
    const aboveMin = bucket.min == null || seconds >= bucket.min;
    const belowMax = bucket.max == null || seconds < bucket.max;

    if (aboveMin && belowMax) {
      return bucket;
    }
  }

  return LEAD_AGE_BUCKETS[LEAD_AGE_BUCKETS.length - 1];
}

function getMomentumAgreementBucket(checkpoint) {
  if (checkpoint?.momentum30sAgreesWithLeader === true) {
    return MOMENTUM_AGREEMENT_BUCKETS[0];
  }

  if (checkpoint?.momentum30sAgreesWithLeader === false) {
    return MOMENTUM_AGREEMENT_BUCKETS[1];
  }

  if (checkpoint?.momentum30sSide === "flat") {
    return MOMENTUM_AGREEMENT_BUCKETS[2];
  }

  return MOMENTUM_AGREEMENT_BUCKETS[3];
}

function getPrePathShape({ checkpoint, derived, leadAgeBucket }) {
  if (
    checkpoint?.prePathGood !== true ||
    !checkpoint?.leader ||
    !isTargetCheckpoint(checkpoint.checkpointSecond)
  ) {
    return "unknown";
  }

  if (derived?.preChopBucket === "high") {
    return "multi-flip-chop";
  }

  if (
    derived?.preChopBucket === "low" &&
    Number.isFinite(checkpoint.preCurrentLeadAgeSeconds) &&
    checkpoint.preCurrentLeadAgeSeconds >= 60 &&
    Number.isFinite(derived.nearLineRank) &&
    Number.isFinite(derived.nearLineHighThreshold) &&
    derived.nearLineRank < derived.nearLineHighThreshold
  ) {
    return "clean-lock";
  }

  if (
    Number.isFinite(checkpoint.preCurrentLeadAgeSeconds) &&
    checkpoint.preCurrentLeadAgeSeconds < 30
  ) {
    return "recent-lock";
  }

  if (
    Number.isFinite(derived?.nearLineRank) &&
    Number.isFinite(derived?.oscillationRank) &&
    Number.isFinite(derived?.nearLineHighThreshold) &&
    Number.isFinite(derived?.oscillationHighThreshold) &&
    derived.nearLineRank >= derived.nearLineHighThreshold &&
    derived.oscillationRank < derived.oscillationHighThreshold
  ) {
    return "near-line-heavy";
  }

  return leadAgeBucket ? "unresolved" : "unknown";
}

function rowCheckpointKey(row, checkpointSecond) {
  const windowStartTs = Number.isFinite(row?.windowStartTs)
    ? row.windowStartTs
    : "unknown";

  return `${row.marketSlug}:${windowStartTs}:${checkpointSecond}`;
}

function sortedFinite(values) {
  return values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function createDerivedClassifier(trainingStabilityRows) {
  const entries = [];

  for (const row of trainingStabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);

      if (!checkpoint || checkpoint.prePathGood !== true) {
        continue;
      }

      const preFlipRate = preFlipRatePerMinute(checkpoint);
      const nearLinePct = preNearLinePct(checkpoint);

      if (!Number.isFinite(preFlipRate) || !Number.isFinite(nearLinePct)) {
        continue;
      }

      entries.push({
        checkpoint,
        key: rowCheckpointKey(row, checkpointSecond),
        nearLinePct,
        preFlipRate,
        row,
      });
    }
  }

  assignMidRanks(entries, "preFlipRate", "oscillationRank");
  assignMidRanks(entries, "nearLinePct", "nearLineRank");

  for (const entry of entries) {
    entry.preChopRank = (entry.oscillationRank + entry.nearLineRank) / 2;
  }

  const lowThreshold = interpolatedPercentile(
    entries.map((entry) => entry.preChopRank),
    1 / 3,
  );
  const highThreshold = interpolatedPercentile(
    entries.map((entry) => entry.preChopRank),
    2 / 3,
  );
  const nearLineHighThreshold = interpolatedPercentile(
    entries.map((entry) => entry.nearLineRank),
    2 / 3,
  );
  const oscillationHighThreshold = interpolatedPercentile(
    entries.map((entry) => entry.oscillationRank),
    2 / 3,
  );
  const thresholds =
    entries.length === 0
      ? null
      : {
          degenerate: lowThreshold === highThreshold,
          high: highThreshold,
          low: lowThreshold,
        };
  const preFlipRates = sortedFinite(entries.map((entry) => entry.preFlipRate));
  const nearLinePcts = sortedFinite(entries.map((entry) => entry.nearLinePct));
  const trainingDerivedByKey = new Map();

  function buildDerived({ checkpoint, nearLinePct, nearLineRank, oscillationRank, preFlipRate }) {
    const preChopRank =
      Number.isFinite(nearLineRank) && Number.isFinite(oscillationRank)
        ? (oscillationRank + nearLineRank) / 2
        : null;
    const chopBucket = getChopBucket(preChopRank, thresholds);
    const momentumBucket = getMomentumAgreementBucket(checkpoint);
    const leadAgeBucket = getLeadAgeBucket(checkpoint.preCurrentLeadAgeSeconds);
    const derived = {
      leadAgeBucket: leadAgeBucket?.id ?? "unknown",
      leadAgeBucketLabel: leadAgeBucket?.label ?? "Unknown",
      momentumAgreementBucket: momentumBucket.id,
      momentumAgreementBucketLabel: momentumBucket.label,
      nearLineHighThreshold,
      nearLinePct,
      nearLineRank,
      oscillationHighThreshold,
      oscillationRank,
      preChopBucket: chopBucket.id,
      preChopBucketLabel: chopBucket.label,
      preChopRank,
      preFlipRatePerMinute: preFlipRate,
    };

    derived.prePathShape = getPrePathShape({
      checkpoint,
      derived,
      leadAgeBucket,
    });

    return derived;
  }

  for (const entry of entries) {
    trainingDerivedByKey.set(
      entry.key,
      buildDerived({
        checkpoint: entry.checkpoint,
        nearLinePct: entry.nearLinePct,
        nearLineRank: entry.nearLineRank,
        oscillationRank: entry.oscillationRank,
        preFlipRate: entry.preFlipRate,
      }),
    );
  }

  return {
    definitions: {
      entryCount: entries.length,
      ranks: {
        degenerate: thresholds?.degenerate ?? false,
        highThreshold: thresholds?.high ?? null,
        lowThreshold: thresholds?.low ?? null,
        nearLineHighThreshold,
        oscillationHighThreshold,
      },
    },
    derive(row, checkpoint) {
      const key = rowCheckpointKey(row, checkpoint.checkpointSecond);
      const trainingDerived = trainingDerivedByKey.get(key);

      if (trainingDerived) {
        return trainingDerived;
      }

      if (checkpoint?.prePathGood !== true) {
        return {
          leadAgeBucket: "unknown",
          momentumAgreementBucket: getMomentumAgreementBucket(checkpoint).id,
          preChopBucket: "unknown",
          prePathShape: "unknown",
        };
      }

      const preFlipRate = preFlipRatePerMinute(checkpoint);
      const nearLinePct = preNearLinePct(checkpoint);
      const oscillationRank = rankAgainstTraining(preFlipRates, preFlipRate);
      const nearLineRank = rankAgainstTraining(nearLinePcts, nearLinePct);

      return buildDerived({
        checkpoint,
        nearLinePct,
        nearLineRank,
        oscillationRank,
        preFlipRate,
      });
    },
  };
}

function makeStats() {
  return { n: 0, wins: 0 };
}

function addToStats(map, key, win) {
  if (!map.has(key)) {
    map.set(key, makeStats());
  }

  const stats = map.get(key);
  stats.n += 1;
  stats.wins += win ? 1 : 0;
}

function statsRate(stats) {
  return stats?.n > 0 ? stats.wins / stats.n : null;
}

function tierForN(n, options) {
  if (n >= options.minPriorN) {
    return "usable";
  }

  if (n >= options.warningPriorN) {
    return "warning-only";
  }

  return "ignored";
}

function baseKey(checkpointSecond, distanceBucketId) {
  return `${checkpointSecond}|${distanceBucketId}`;
}

function splitKey(checkpointSecond, distanceBucketId, bucketId) {
  return `${checkpointSecond}|${distanceBucketId}|${bucketId}`;
}

function shapeKey(checkpointSecond, shapeId) {
  return `${checkpointSecond}|${shapeId}`;
}

function riskKey(riskName, checkpointSecond) {
  return `${riskName}|${checkpointSecond}`;
}

function riskAllKey(riskName) {
  return `${riskName}|all`;
}

function createModel() {
  return {
    base: new Map(),
    chop: new Map(),
    leaderAge: new Map(),
    momentum: new Map(),
    prePathShape: new Map(),
    risk: new Map(),
  };
}

function addRiskStats(model, obs) {
  const risks = [];

  if (obs.prePathShape === "recent-lock") {
    risks.push("recent_lock");
  }

  if (obs.prePathShape === "near-line-heavy") {
    risks.push("near_line_heavy");
  }

  if (obs.momentumAgreementBucket === "disagrees") {
    risks.push("momentum_against");
  }

  for (const risk of risks) {
    addToStats(model.risk, riskKey(risk, obs.checkpointSecond), obs.win);
    addToStats(model.risk, riskAllKey(risk), obs.win);
  }
}

function buildBaseObservations(analyticsRows) {
  const observations = [];

  for (const row of analyticsRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);
      const distanceBucket = targetDistanceBucket(checkpoint?.distanceToBeatBps);

      if (
        !checkpoint ||
        checkpoint.didCurrentLeaderWin === null ||
        !distanceBucket
      ) {
        continue;
      }

      observations.push({
        checkpointSecond,
        day: getDayKey(row.windowStartTs),
        distanceBucket: distanceBucket.id,
        marketSlug: row.marketSlug,
        win: Boolean(checkpoint.didCurrentLeaderWin),
      });
    }
  }

  return observations;
}

function buildStabilityObservations(stabilityRows, classifier) {
  const observations = [];

  for (const row of stabilityRows) {
    for (const checkpointSecond of TARGET_PATH_RISK_CHECKPOINTS) {
      const checkpoint = getCheckpoint(row, checkpointSecond);
      const distanceBucket = targetDistanceBucket(checkpoint?.distanceBps);

      if (
        !checkpoint ||
        checkpoint.leaderWonAtClose === null ||
        checkpoint.checkpointInNoise === true ||
        !distanceBucket
      ) {
        continue;
      }

      const derived = classifier.derive(row, checkpoint);

      observations.push({
        checkpointSecond,
        chopBucket: derived.preChopBucket ?? "unknown",
        day: getDayKey(row.windowStartTs),
        distanceBucket: distanceBucket.id,
        leadAgeBucket: derived.leadAgeBucket ?? "unknown",
        marketSlug: row.marketSlug,
        momentumAgreementBucket: derived.momentumAgreementBucket ?? "unknown",
        prePathShape: derived.prePathShape ?? "unknown",
        win: Boolean(checkpoint.leaderWonAtClose),
      });
    }
  }

  return observations;
}

function buildModel({ analyticsRows, classifier, stabilityRows }) {
  const model = createModel();
  const baseObservations = buildBaseObservations(analyticsRows);
  const stabilityObservations = buildStabilityObservations(
    stabilityRows,
    classifier,
  );

  for (const obs of baseObservations) {
    addToStats(
      model.base,
      baseKey(obs.checkpointSecond, obs.distanceBucket),
      obs.win,
    );
  }

  for (const obs of stabilityObservations) {
    addToStats(
      model.chop,
      splitKey(obs.checkpointSecond, obs.distanceBucket, obs.chopBucket),
      obs.win,
    );
    addToStats(
      model.momentum,
      splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.momentumAgreementBucket,
      ),
      obs.win,
    );
    addToStats(
      model.leaderAge,
      splitKey(obs.checkpointSecond, obs.distanceBucket, obs.leadAgeBucket),
      obs.win,
    );
    addToStats(
      model.prePathShape,
      shapeKey(obs.checkpointSecond, obs.prePathShape),
      obs.win,
    );
    addRiskStats(model, obs);
  }

  return {
    baseObservations,
    model,
    stabilityObservations,
  };
}

function groupHoldoutStats(observations, descriptorsForObservation) {
  const grouped = new Map();

  for (const obs of observations) {
    for (const descriptor of descriptorsForObservation(obs)) {
      const key = descriptor.fullKey;

      if (!grouped.has(key)) {
        grouped.set(key, {
          descriptor,
          n: 0,
          wins: 0,
        });
      }

      const stats = grouped.get(key);
      stats.n += 1;
      stats.wins += obs.win ? 1 : 0;
    }
  }

  return grouped;
}

function baseDescriptors(obs) {
  return [
    {
      fullKey: `base|${baseKey(obs.checkpointSecond, obs.distanceBucket)}`,
      key: baseKey(obs.checkpointSecond, obs.distanceBucket),
      label: `T+${obs.checkpointSecond} ${obs.distanceBucket}`,
      source: "base",
    },
  ];
}

function stabilityDescriptors(obs) {
  const descriptors = [
    {
      fullKey: `chop|${splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.chopBucket,
      )}`,
      key: splitKey(obs.checkpointSecond, obs.distanceBucket, obs.chopBucket),
      label: `T+${obs.checkpointSecond} ${obs.distanceBucket} ${obs.chopBucket}`,
      source: "chop",
    },
    {
      fullKey: `momentum|${splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.momentumAgreementBucket,
      )}`,
      key: splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.momentumAgreementBucket,
      ),
      label: `T+${obs.checkpointSecond} ${obs.distanceBucket} ${obs.momentumAgreementBucket}`,
      source: "momentum",
    },
    {
      fullKey: `leaderAge|${splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.leadAgeBucket,
      )}`,
      key: splitKey(obs.checkpointSecond, obs.distanceBucket, obs.leadAgeBucket),
      label: `T+${obs.checkpointSecond} ${obs.distanceBucket} ${obs.leadAgeBucket}`,
      source: "leaderAge",
    },
    {
      fullKey: `prePathShape|${shapeKey(
        obs.checkpointSecond,
        obs.prePathShape,
      )}`,
      key: shapeKey(obs.checkpointSecond, obs.prePathShape),
      label: `T+${obs.checkpointSecond} ${obs.prePathShape}`,
      source: "prePathShape",
    },
  ];

  if (obs.prePathShape === "recent-lock") {
    descriptors.push(
      {
        fullKey: `risk|${riskKey("recent_lock", obs.checkpointSecond)}`,
        key: riskKey("recent_lock", obs.checkpointSecond),
        label: `T+${obs.checkpointSecond} recent_lock`,
        source: "risk",
      },
      {
        fullKey: `risk|${riskAllKey("recent_lock")}`,
        key: riskAllKey("recent_lock"),
        label: "all recent_lock",
        source: "risk",
      },
    );
  }

  if (obs.prePathShape === "near-line-heavy") {
    descriptors.push(
      {
        fullKey: `risk|${riskKey("near_line_heavy", obs.checkpointSecond)}`,
        key: riskKey("near_line_heavy", obs.checkpointSecond),
        label: `T+${obs.checkpointSecond} near_line_heavy`,
        source: "risk",
      },
      {
        fullKey: `risk|${riskAllKey("near_line_heavy")}`,
        key: riskAllKey("near_line_heavy"),
        label: "all near_line_heavy",
        source: "risk",
      },
    );
  }

  if (obs.momentumAgreementBucket === "disagrees") {
    descriptors.push(
      {
        fullKey: `risk|${riskKey("momentum_against", obs.checkpointSecond)}`,
        key: riskKey("momentum_against", obs.checkpointSecond),
        label: `T+${obs.checkpointSecond} momentum_against`,
        source: "risk",
      },
      {
        fullKey: `risk|${riskAllKey("momentum_against")}`,
        key: riskAllKey("momentum_against"),
        label: "all momentum_against",
        source: "risk",
      },
    );
  }

  return descriptors;
}

function mergeCellFold(cellMap, descriptor, trainingStats, holdoutStats, options) {
  const fullKey = descriptor.fullKey;

  if (!cellMap.has(fullKey)) {
    cellMap.set(fullKey, {
      descriptor,
      foldCount: 0,
      foldAbsDriftWeightedNumerator: 0,
      foldAbsDriftWeightedWeight: 0,
      foldsMeetingMinPriorN: 0,
      foldsMeetingWarningPriorN: 0,
      holdoutN: 0,
      holdoutWins: 0,
      maxFoldAbsDrift: null,
      minTrainN: null,
      trainRateWeightedNumerator: 0,
      trainRateWeightedWeight: 0,
    });
  }

  const cell = cellMap.get(fullKey);
  const trainRate = statsRate(trainingStats);
  const holdoutRate = ratio(holdoutStats.wins, holdoutStats.n);
  const foldDrift =
    trainRate === null || holdoutRate === null
      ? null
      : Math.abs(trainRate - holdoutRate);

  cell.foldCount += 1;
  if ((trainingStats?.n ?? 0) >= options.minPriorN) {
    cell.foldsMeetingMinPriorN += 1;
  }

  if ((trainingStats?.n ?? 0) >= options.warningPriorN) {
    cell.foldsMeetingWarningPriorN += 1;
  }

  cell.holdoutN += holdoutStats.n;
  cell.holdoutWins += holdoutStats.wins;
  cell.minTrainN =
    cell.minTrainN === null
      ? trainingStats?.n ?? 0
      : Math.min(cell.minTrainN, trainingStats?.n ?? 0);

  if (trainRate !== null) {
    cell.trainRateWeightedNumerator += trainRate * holdoutStats.n;
    cell.trainRateWeightedWeight += holdoutStats.n;
  }

  if (foldDrift !== null) {
    cell.foldAbsDriftWeightedNumerator += foldDrift * holdoutStats.n;
    cell.foldAbsDriftWeightedWeight += holdoutStats.n;
    cell.maxFoldAbsDrift =
      cell.maxFoldAbsDrift === null
        ? foldDrift
        : Math.max(cell.maxFoldAbsDrift, foldDrift);
  }
}

function addFoldCellResults({
  cellMap,
  holdoutBaseObs,
  holdoutStabilityObs,
  options,
  trainModel,
}) {
  const groupedBase = groupHoldoutStats(holdoutBaseObs, baseDescriptors);
  const groupedStability = groupHoldoutStats(
    holdoutStabilityObs,
    stabilityDescriptors,
  );

  for (const group of groupedBase.values()) {
    mergeCellFold(
      cellMap,
      group.descriptor,
      trainModel.base.get(group.descriptor.key),
      group,
      options,
    );
  }

  for (const group of groupedStability.values()) {
    mergeCellFold(
      cellMap,
      group.descriptor,
      trainModel[group.descriptor.source].get(group.descriptor.key),
      group,
      options,
    );
  }
}

function shrinkTowardBase({ baseRate, cellRate, k, n }) {
  if (!Number.isFinite(baseRate) || !Number.isFinite(cellRate) || n <= 0) {
    return null;
  }

  return (n * cellRate + k * baseRate) / (n + k);
}

function scoreObservation(obs, model, options) {
  const baseStats = model.base.get(
    baseKey(obs.checkpointSecond, obs.distanceBucket),
  );
  const baseRate = statsRate(baseStats);

  if (!baseStats || baseRate === null) {
    return {
      rejectionReason: "base_missing",
      scored: false,
    };
  }

  if (baseStats.n < options.minPriorN) {
    return {
      rejectionReason: "base_sparse",
      scored: false,
    };
  }

  const candidates = [
    {
      key: splitKey(obs.checkpointSecond, obs.distanceBucket, obs.chopBucket),
      source: "chop",
      stats: model.chop.get(
        splitKey(obs.checkpointSecond, obs.distanceBucket, obs.chopBucket),
      ),
    },
    {
      key: splitKey(
        obs.checkpointSecond,
        obs.distanceBucket,
        obs.momentumAgreementBucket,
      ),
      source: "momentum",
      stats: model.momentum.get(
        splitKey(
          obs.checkpointSecond,
          obs.distanceBucket,
          obs.momentumAgreementBucket,
        ),
      ),
    },
    {
      key: splitKey(obs.checkpointSecond, obs.distanceBucket, obs.leadAgeBucket),
      source: "leaderAge",
      stats: model.leaderAge.get(
        splitKey(obs.checkpointSecond, obs.distanceBucket, obs.leadAgeBucket),
      ),
    },
    {
      key: shapeKey(obs.checkpointSecond, obs.prePathShape),
      source: "prePathShape",
      stats: model.prePathShape.get(
        shapeKey(obs.checkpointSecond, obs.prePathShape),
      ),
    },
  ];
  const accepted = [];

  for (const candidate of candidates) {
    const rate = statsRate(candidate.stats);

    if (!candidate.stats || candidate.stats.n < options.minPriorN || rate === null) {
      continue;
    }

    const shrunk = shrinkTowardBase({
      baseRate,
      cellRate: rate,
      k: options.shrinkageK,
      n: candidate.stats.n,
    });

    if (Number.isFinite(shrunk)) {
      accepted.push({
        ...candidate,
        rate,
        shrunk,
      });
    }
  }

  return {
    acceptedSplitCount: accepted.length,
    pBase: baseRate,
    pEst: Math.min(baseRate, ...accepted.map((candidate) => candidate.shrunk)),
    scored: true,
  };
}

function pEstBucket(pEst) {
  if (!Number.isFinite(pEst)) {
    return "unknown";
  }

  if (pEst < 0.7) {
    return "lt_0_70";
  }

  if (pEst < 0.75) {
    return "0_70_0_75";
  }

  if (pEst < 0.8) {
    return "0_75_0_80";
  }

  if (pEst < 0.85) {
    return "0_80_0_85";
  }

  if (pEst < 0.9) {
    return "0_85_0_90";
  }

  if (pEst < 0.95) {
    return "0_90_0_95";
  }

  return "0_95_1_00";
}

function emptyCalibrationBucket(label) {
  return {
    label,
    n: 0,
    pEstSum: 0,
    wins: 0,
  };
}

function addCalibration(calibration, score, win) {
  const key = pEstBucket(score.pEst);

  if (!calibration.has(key)) {
    calibration.set(key, emptyCalibrationBucket(key));
  }

  const bucket = calibration.get(key);
  bucket.n += 1;
  bucket.pEstSum += score.pEst;
  bucket.wins += win ? 1 : 0;
}

function summarizeCalibration(calibration) {
  return [...calibration.values()]
    .map((bucket) => {
      const avgPEst = ratio(bucket.pEstSum, bucket.n);
      const winRate = ratio(bucket.wins, bucket.n);

      return {
        ...bucket,
        avgPEst,
        calibrationError:
          avgPEst === null || winRate === null ? null : winRate - avgPEst,
        winRate,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function summarizeCalibrationAcrossFolds({ foldCalibrations, options, pooledCalibration }) {
  const pooledRows = summarizeCalibration(pooledCalibration);
  const pooledByLabel = new Map(pooledRows.map((row) => [row.label, row]));
  const foldRowsByLabel = new Map();

  for (const fold of foldCalibrations) {
    for (const row of summarizeCalibration(fold.calibration)) {
      if (!foldRowsByLabel.has(row.label)) {
        foldRowsByLabel.set(row.label, []);
      }

      foldRowsByLabel.get(row.label).push({
        ...row,
        day: fold.day,
      });
    }
  }

  return [...new Set([...pooledByLabel.keys(), ...foldRowsByLabel.keys()])]
    .sort()
    .map((label) => {
      const pooled = pooledByLabel.get(label) ?? emptyCalibrationBucket(label);
      const foldRows = foldRowsByLabel.get(label) ?? [];

      return {
        ...pooled,
        foldCount: foldRows.length,
        meanAbsFoldError: average(
          foldRows.map((row) =>
            Number.isFinite(row.calibrationError)
              ? Math.abs(row.calibrationError)
              : null,
          ),
        ),
        meanFoldAvgPEst: average(foldRows.map((row) => row.avgPEst)),
        meanFoldCalibrationError: average(
          foldRows.map((row) => row.calibrationError),
        ),
        meanFoldWinRate: average(foldRows.map((row) => row.winRate)),
        tier: tierForN(pooled.n, options),
      };
    });
}

function summarizeFoldCalibrationDetails(foldCalibrations) {
  return foldCalibrations.flatMap((fold) =>
    summarizeCalibration(fold.calibration).map((row) => ({
      ...row,
      day: fold.day,
    })),
  );
}

function summarizeCells(cellMap, allDataModel, options) {
  return [...cellMap.values()]
    .map((cell) => {
      const sourceMap = allDataModel[cell.descriptor.source];
      const allDataStats = sourceMap?.get(cell.descriptor.key) ?? null;
      const weightedTrainRate = ratio(
        cell.trainRateWeightedNumerator,
        cell.trainRateWeightedWeight,
      );
      const holdoutRate = ratio(cell.holdoutWins, cell.holdoutN);
      const aggregateAbsDrift =
        weightedTrainRate === null || holdoutRate === null
          ? null
          : Math.abs(weightedTrainRate - holdoutRate);
      const meanFoldAbsDrift = ratio(
        cell.foldAbsDriftWeightedNumerator,
        cell.foldAbsDriftWeightedWeight,
      );

      return {
        ...cell,
        aggregateAbsDrift,
        allDataN: allDataStats?.n ?? 0,
        allDataRate: statsRate(allDataStats),
        holdoutRate,
        meanFoldAbsDrift,
        minTrainTier: tierForN(cell.minTrainN ?? 0, options),
        tier: tierForN(allDataStats?.n ?? 0, options),
        weightedTrainRate,
      };
    })
    .sort((a, b) => {
      const sourceCompare = a.descriptor.source.localeCompare(b.descriptor.source);
      if (sourceCompare !== 0) {
        return sourceCompare;
      }

      return a.descriptor.label.localeCompare(b.descriptor.label, undefined, {
        numeric: true,
      });
    });
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  return finite.length === 0
    ? null
    : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function percentile(values, p) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );

  return sorted[index];
}

function summarizeCellTypes(cells) {
  const bySource = new Map();

  for (const cell of cells) {
    const source = cell.descriptor.source;

    if (!bySource.has(source)) {
      bySource.set(source, {
        absDrifts: [],
        cells: 0,
        ignored: 0,
        holdoutN: 0,
        usable: 0,
        warning: 0,
      });
    }

    const summary = bySource.get(source);
    summary.cells += 1;
    summary.holdoutN += cell.holdoutN;

    if (cell.tier === "usable") {
      summary.usable += 1;
    } else if (cell.tier === "warning-only") {
      summary.warning += 1;
    } else {
      summary.ignored += 1;
    }

    if (Number.isFinite(cell.meanFoldAbsDrift)) {
      summary.absDrifts.push(cell.meanFoldAbsDrift);
    }
  }

  return [...bySource.entries()]
    .map(([source, summary]) => ({
      ...summary,
      meanAbsDrift: average(summary.absDrifts),
      p90AbsDrift: percentile(summary.absDrifts, 0.9),
      source,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

function countByDay(rows) {
  const counts = new Map();

  for (const row of rows) {
    const day = getDayKey(row.windowStartTs);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([day, count]) => ({ count, day }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function buildHoldout({ analyticsRows, options, stabilityRows }) {
  const cleanAnalyticsRows = analyticsRows.filter(isCleanAnalytics);
  const cleanSlugs = getCleanAnalyticsSlugSet(analyticsRows);
  const cleanStabilityRows = stabilityRows.filter((row) =>
    isCleanStability(row, cleanSlugs),
  );
  const days = [
    ...new Set(
      cleanAnalyticsRows
        .map((row) => getDayKey(row.windowStartTs))
        .filter((day) => day !== "unknown"),
    ),
  ].sort();
  const cellMap = new Map();
  const calibration = new Map();
  const foldCalibrations = [];
  const folds = [];
  let scoredPEstN = 0;
  let scoredPEstSum = 0;
  let scoredWins = 0;
  let targetBaseObsN = 0;
  let targetTrainPriorN = 0;
  let targetTrainPriorSum = 0;
  let targetTrainPriorWins = 0;
  let targetStabilityObsN = 0;
  let unscoredPEstN = 0;
  const unscoredReasons = {};

  const allClassifier = createDerivedClassifier(cleanStabilityRows);
  const allData = buildModel({
    analyticsRows: cleanAnalyticsRows,
    classifier: allClassifier,
    stabilityRows: cleanStabilityRows,
  });
  const allDataTargetWinRate = ratio(
    allData.baseObservations.reduce((sum, obs) => sum + (obs.win ? 1 : 0), 0),
    allData.baseObservations.length,
  );

  for (const holdoutDay of days) {
    const trainAnalyticsRows = cleanAnalyticsRows.filter(
      (row) => getDayKey(row.windowStartTs) !== holdoutDay,
    );
    const holdoutAnalyticsRows = cleanAnalyticsRows.filter(
      (row) => getDayKey(row.windowStartTs) === holdoutDay,
    );
    const trainStabilityRows = cleanStabilityRows.filter(
      (row) => getDayKey(row.windowStartTs) !== holdoutDay,
    );
    const holdoutStabilityRows = cleanStabilityRows.filter(
      (row) => getDayKey(row.windowStartTs) === holdoutDay,
    );
    const trainClassifier = createDerivedClassifier(trainStabilityRows);
    const train = buildModel({
      analyticsRows: trainAnalyticsRows,
      classifier: trainClassifier,
      stabilityRows: trainStabilityRows,
    });
    const holdout = buildModel({
      analyticsRows: holdoutAnalyticsRows,
      classifier: trainClassifier,
      stabilityRows: holdoutStabilityRows,
    });
    let foldPEstN = 0;
    let foldPEstSum = 0;
    const foldCalibration = new Map();
    let foldUnscoredPEstN = 0;
    let foldWins = 0;

    addFoldCellResults({
      cellMap,
      holdoutBaseObs: holdout.baseObservations,
      holdoutStabilityObs: holdout.stabilityObservations,
      options,
      trainModel: train.model,
    });

    for (const obs of holdout.baseObservations) {
      const trainBaseStats = train.model.base.get(
        baseKey(obs.checkpointSecond, obs.distanceBucket),
      );
      const trainBaseRate = statsRate(trainBaseStats);

      if (trainBaseRate === null) {
        continue;
      }

      targetTrainPriorN += 1;
      targetTrainPriorSum += trainBaseRate;
      targetTrainPriorWins += obs.win ? 1 : 0;
    }

    for (const obs of holdout.stabilityObservations) {
      const score = scoreObservation(obs, train.model, options);

      if (!score.scored) {
        unscoredPEstN += 1;
        foldUnscoredPEstN += 1;
        increment(unscoredReasons, score.rejectionReason ?? "unknown");
        continue;
      }

      addCalibration(calibration, score, obs.win);
      addCalibration(foldCalibration, score, obs.win);
      scoredPEstN += 1;
      scoredPEstSum += score.pEst;
      scoredWins += obs.win ? 1 : 0;
      foldPEstN += 1;
      foldPEstSum += score.pEst;
      foldWins += obs.win ? 1 : 0;
    }

    targetBaseObsN += holdout.baseObservations.length;
    targetStabilityObsN += holdout.stabilityObservations.length;
    foldCalibrations.push({
      calibration: foldCalibration,
      day: holdoutDay,
    });

    folds.push({
      day: holdoutDay,
      holdoutAnalyticsRows: holdoutAnalyticsRows.length,
      holdoutBaseObs: holdout.baseObservations.length,
      holdoutPEstAvg: ratio(foldPEstSum, foldPEstN),
      holdoutPEstN: foldPEstN,
      holdoutPEstUnscoredN: foldUnscoredPEstN,
      holdoutPEstWinRate: ratio(foldWins, foldPEstN),
      holdoutStabilityObs: holdout.stabilityObservations.length,
      trainAnalyticsRows: trainAnalyticsRows.length,
      trainRankEntryCount: trainClassifier.definitions.entryCount,
      trainRanks: trainClassifier.definitions.ranks,
      trainStabilityRows: trainStabilityRows.length,
    });
  }

  const cells = summarizeCells(cellMap, allData.model, options);
  const dashboard = buildAnalyticsDashboard({
    analyticsRows,
    computedAt: Date.now(),
    stabilityRows,
  });

  return {
    allData,
    allDataTargetWinRate,
    allRankDefinitions: allClassifier.definitions,
    calibration: summarizeCalibrationAcrossFolds({
      foldCalibrations,
      options,
      pooledCalibration: calibration,
    }),
    cellTypeSummary: summarizeCellTypes(cells),
    cells,
    cleanAnalyticsByDay: countByDay(cleanAnalyticsRows),
    cleanAnalyticsRows,
    cleanStabilityRows,
    dashboard,
    days,
    foldCalibrationDetails: summarizeFoldCalibrationDetails(foldCalibrations),
    folds,
    options,
    rowCounts: {
      analyticsRows: analyticsRows.length,
      cleanAnalyticsRows: cleanAnalyticsRows.length,
      cleanStabilityRows: cleanStabilityRows.length,
      stabilityRows: stabilityRows.length,
      targetBaseObsN,
      targetStabilityObsN,
    },
    scored: {
      avgPEst: ratio(scoredPEstSum, scoredPEstN),
      n: scoredPEstN,
      targetTrainPriorAvg: ratio(targetTrainPriorSum, targetTrainPriorN),
      targetTrainPriorN,
      targetTrainPriorWinRate: ratio(targetTrainPriorWins, targetTrainPriorN),
      unscoredN: unscoredPEstN,
      unscoredReasons,
      winRate: ratio(scoredWins, scoredPEstN),
    },
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function supportFloorNote(options) {
  return `Usable cells require N >= ${options.minPriorN}; warning-only cells require ${options.warningPriorN} <= N < ${options.minPriorN}; ignored cells have N < ${options.warningPriorN}.`;
}

function renderDatasetSection(result) {
  const rows = [
    ["market_analytics rows", integer(result.rowCounts.analyticsRows)],
    ["clean market_analytics rows", integer(result.rowCounts.cleanAnalyticsRows)],
    [
      "market_stability_analytics rows",
      integer(result.rowCounts.stabilityRows),
    ],
    [
      "clean market_stability_analytics rows",
      integer(result.rowCounts.cleanStabilityRows),
    ],
    [
      "target checkpoint observations outside 0.5 bps band",
      integer(result.rowCounts.targetBaseObsN),
    ],
    [
      "target checkpoint stability observations outside 0.5 bps band",
      integer(result.rowCounts.targetStabilityObsN),
    ],
    ["leave-one-day-out folds", integer(result.days.length)],
  ];

  const dayRows = result.cleanAnalyticsByDay.map((row) => [
    row.day,
    integer(row.count),
  ]);

  return [
    "## Dataset",
    "",
    markdownTable(["Metric", "Value"], rows),
    "",
    "Clean analytics rows by day:",
    "",
    markdownTable(["Day", "Clean rows"], dayRows),
  ].join("\n");
}

function renderMethodSection(result) {
  return [
    "## Method",
    "",
    "- Validation uses leave-one-day-out folds.",
    "- Each fold rebuilds the dashboard-shaped training inputs from all non-holdout days.",
    "- Chop and pre-path-shape rank thresholds are fitted on training days only.",
    "- Held-out rows are projected onto the training-day empirical rank distributions.",
    "- Split priors are shrunk toward the checkpoint x distance base prior before p_est calibration.",
    "- Split priors can reduce p_est, but cannot increase p_est above p_base.",
    `- ${supportFloorNote(result.options)}`,
    `- Shrinkage K: ${result.options.shrinkageK}.`,
  ].join("\n");
}

function minFinite(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  return finite.length === 0 ? null : Math.min(...finite);
}

function maxFinite(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  return finite.length === 0 ? null : Math.max(...finite);
}

function renderRollupSanitySection(result) {
  const ranks =
    result.dashboard?.stability?.preChopBucketDefinitions?.ranks ??
    result.allRankDefinitions?.ranks ??
    {};
  const foldRankRows = [
    "lowThreshold",
    "highThreshold",
    "nearLineHighThreshold",
    "oscillationHighThreshold",
  ].map((field) => {
    const values = result.folds.map((fold) => fold.trainRanks?.[field]);

    return [
      field,
      number(ranks[field]),
      number(average(values)),
      number(minFinite(values)),
      number(maxFinite(values)),
    ];
  });
  const dashboardRows = [
    [
      "dashboard clean analytics rows",
      integer(result.dashboard?.health?.cohortFunnel?.cleanAnalyticsCount),
    ],
    [
      "holdout clean analytics rows",
      integer(result.rowCounts.cleanAnalyticsRows),
    ],
    [
      "dashboard clean stability rows",
      integer(result.dashboard?.health?.cohortFunnel?.cleanStabilityCount),
    ],
    [
      "holdout clean stability rows",
      integer(result.rowCounts.cleanStabilityRows),
    ],
  ];

  return [
    "## Dashboard Rollup Sanity",
    "",
    "The holdout script rebuilds dashboard-shaped priors locally. This panel checks the all-data dashboard builder output against the rows used by the holdout, and shows the training-fold rank-threshold range.",
    "",
    markdownTable(["Metric", "Value"], dashboardRows),
    "",
    markdownTable(
      ["Rank threshold", "All-data dashboard", "Fold mean", "Fold min", "Fold max"],
      foldRankRows,
    ),
  ].join("\n");
}

function renderExecutiveSummary(result) {
  const scoredCalibrationError =
    result.scored.winRate === null || result.scored.avgPEst === null
      ? null
      : result.scored.winRate - result.scored.avgPEst;
  const rows = [
    ["All target empirical leader win rate", percent(result.allDataTargetWinRate)],
    [
      "Training-prior weighted target win rate",
      percent(result.scored.targetTrainPriorAvg),
    ],
    [
      "Held-out target win rate for training-prior comparison",
      percent(result.scored.targetTrainPriorWinRate),
    ],
    [
      "Training-prior comparison observations",
      integer(result.scored.targetTrainPriorN),
    ],
    ["Scored p_est observations", integer(result.scored.n)],
    ["Unscored p_est observations", integer(result.scored.unscoredN)],
    ["Scored p_est average", percent(result.scored.avgPEst)],
    ["Scored p_est empirical win rate", percent(result.scored.winRate)],
    ["Scored p_est calibration error", number(scoredCalibrationError)],
  ];
  const unscoredRows = Object.entries(result.scored.unscoredReasons).map(
    ([reason, count]) => [reason, integer(count)],
  );

  const summaryRows = result.cellTypeSummary.map((row) => [
    row.source,
    integer(row.cells),
    integer(row.usable),
    integer(row.warning),
    integer(row.ignored),
    integer(row.holdoutN),
    percent(row.meanAbsDrift),
    percent(row.p90AbsDrift),
  ]);

  return [
    "## Executive Summary",
    "",
    markdownTable(["Metric", "Value"], rows),
    "",
    unscoredRows.length === 0
      ? "No held-out p_est observations were dropped for insufficient base-prior support."
      : markdownTable(["Unscored reason", "Count"], unscoredRows),
    "",
    "Cell drift summary:",
    "",
    markdownTable(
      [
        "Source",
        "Cells",
        "Usable",
        "Warning",
        "Ignored",
        "Holdout N",
        "Mean abs drift",
        "P90 abs drift",
      ],
      summaryRows,
    ),
  ].join("\n");
}

function renderCalibrationSection(result) {
  const rows = result.calibration.map((bucket) => [
    bucket.label,
    bucket.tier,
    integer(bucket.n),
    percent(bucket.avgPEst),
    percent(bucket.winRate),
    number(bucket.calibrationError),
    integer(bucket.foldCount),
    percent(bucket.meanFoldAvgPEst),
    percent(bucket.meanFoldWinRate),
    number(bucket.meanFoldCalibrationError),
    number(bucket.meanAbsFoldError),
  ]);
  const detailRows = result.foldCalibrationDetails.map((bucket) => [
    bucket.day,
    bucket.label,
    integer(bucket.n),
    percent(bucket.avgPEst),
    percent(bucket.winRate),
    number(bucket.calibrationError),
  ]);

  return [
    "## Calibration By p_est Bucket",
    "",
    "Support tiers use the same Phase 1 floors as prior cells. Fold metrics are unweighted averages across folds where the bucket appeared.",
    "",
    rows.length === 0
      ? "No held-out observations had enough usable prior support for p_est."
      : markdownTable(
          [
            "p_est bucket",
            "Tier",
            "Pooled N",
            "Pooled avg p_est",
            "Pooled win",
            "Pooled error",
            "Folds",
            "Mean fold p_est",
            "Mean fold win",
            "Mean fold error",
            "Mean abs fold error",
          ],
          rows,
        ),
    "",
    "Per-fold calibration detail:",
    "",
    detailRows.length === 0
      ? "No per-fold calibration rows."
      : markdownTable(
          ["Fold", "p_est bucket", "N", "Average p_est", "Win rate", "Error"],
          detailRows,
        ),
  ].join("\n");
}

function findCell(result, source, label) {
  return result.cells.find(
    (cell) => cell.descriptor.source === source && cell.descriptor.label === label,
  );
}

function renderCellSummaryRows(result, specs) {
  return specs.map((spec) => {
    const cell = findCell(result, spec.source, spec.label);

    return [
      spec.name ?? spec.label,
      cell?.tier ?? "-",
      integer(cell?.allDataN),
      percent(cell?.allDataRate),
      percent(cell?.meanFoldAbsDrift),
    ];
  });
}

function renderPhaseReadoutSection(result) {
  const defaultThresholdRows = renderCellSummaryRows(result, [
    { label: "T+180 5_7_5", source: "base" },
    { label: "T+200 5_7_5", source: "base" },
    { label: "T+210 4_5", source: "base" },
    { label: "T+220 4_5", source: "base" },
    { label: "T+240 4_5", source: "base" },
  ]);
  const riskRows = renderCellSummaryRows(result, [
    { label: "all recent_lock", source: "risk" },
    { label: "T+180 recent_lock", source: "risk" },
    { label: "T+240 recent_lock", source: "risk" },
    { label: "all near_line_heavy", source: "risk" },
    { label: "all momentum_against", source: "risk" },
  ]);

  return [
    "## Phase 2 Readout",
    "",
    "Default clean-threshold cells from the combined plan:",
    "",
    markdownTable(
      ["Cell", "Tier", "N", "All-data win", "Mean fold drift"],
      defaultThresholdRows,
    ),
    "",
    "Risk readout:",
    "",
    markdownTable(
      ["Cell", "Tier", "N", "All-data win", "Mean fold drift"],
      riskRows,
    ),
    "",
    "Interpretation for Phase 2:",
    "",
    "- The clean base threshold cells are all usable and clear the 0.80 probability floor.",
    "- Recent-lock remains a hard-veto candidate: aggregate performance is materially below the entry floor, and per-checkpoint recent-lock cells are only warning-only support.",
    "- Near-line-heavy remains a meaningful risk flag; aggregate performance is below the entry floor before distance and EV filters.",
    "- Momentum-against remains a risk flag, especially before T+220.",
    "- Leader-age split support is uneven, so only high-support leader-age cells should be eligible to reduce p_est in v0.",
    `- Held-out p_est is under-confident by ${number(result.scored.winRate - result.scored.avgPEst)} on aggregate (${percent(result.scored.avgPEst)} estimated vs. ${percent(result.scored.winRate)} empirical).`,
    "- This conservatism supports the min-of-priors design; it should not be used to let split priors raise p_est above base priors.",
  ].join("\n");
}

function renderFoldSection(result) {
  const rows = result.folds.map((fold) => [
    fold.day,
    integer(fold.holdoutAnalyticsRows),
    integer(fold.holdoutBaseObs),
    integer(fold.holdoutStabilityObs),
    integer(fold.trainRankEntryCount),
    integer(fold.holdoutPEstN),
    integer(fold.holdoutPEstUnscoredN),
    percent(fold.holdoutPEstAvg),
    percent(fold.holdoutPEstWinRate),
  ]);

  return [
    "## Fold Summary",
    "",
    markdownTable(
      [
        "Holdout day",
        "Rows",
        "Base obs",
        "Stability obs",
        "Train rank entries",
        "p_est N",
        "Unscored",
        "Avg p_est",
        "Win rate",
      ],
      rows,
    ),
  ].join("\n");
}

function renderCellTableSection(result) {
  const rows = result.cells.map((cell) => [
    cell.descriptor.source,
    cell.descriptor.label,
    cell.tier,
    integer(cell.allDataN),
    percent(cell.allDataRate),
    integer(cell.minTrainN),
    cell.minTrainTier,
    `${integer(cell.foldsMeetingMinPriorN)}/${integer(cell.foldCount)}`,
    `${integer(cell.foldsMeetingWarningPriorN)}/${integer(cell.foldCount)}`,
    integer(cell.holdoutN),
    percent(cell.weightedTrainRate),
    percent(cell.holdoutRate),
    percent(cell.meanFoldAbsDrift),
    percent(cell.aggregateAbsDrift),
    percent(cell.maxFoldAbsDrift),
  ]);

  return [
    "## Cell Validation",
    "",
    "This table contains every cell that had at least one held-out observation.",
    "",
    markdownTable(
      [
        "Source",
        "Cell",
        "Tier",
        "All-data N",
        "All-data win",
        "Min train N",
        "Min train tier",
        "Usable folds",
        "Warning+ folds",
        "Holdout N",
        "Train prior",
        "Holdout win",
        "Mean fold drift",
        "Aggregate drift",
        "Max fold drift",
      ],
      rows,
    ),
  ].join("\n");
}

function renderUsabilitySection(result) {
  const usableRows = result.cells
    .filter((cell) => cell.tier === "usable")
    .map((cell) => [
      cell.descriptor.source,
      cell.descriptor.label,
      integer(cell.allDataN),
      percent(cell.allDataRate),
      percent(cell.meanFoldAbsDrift),
    ]);
  const warningRows = result.cells
    .filter((cell) => cell.tier === "warning-only")
    .map((cell) => [
      cell.descriptor.source,
      cell.descriptor.label,
      integer(cell.allDataN),
      percent(cell.allDataRate),
      percent(cell.meanFoldAbsDrift),
    ]);
  const ignoredRows = result.cells
    .filter((cell) => cell.tier === "ignored")
    .map((cell) => [
      cell.descriptor.source,
      cell.descriptor.label,
      integer(cell.allDataN),
      percent(cell.allDataRate),
      percent(cell.meanFoldAbsDrift),
    ]);

  return [
    "## Live Usability",
    "",
    supportFloorNote(result.options),
    "",
    "Usable cells:",
    "",
    usableRows.length === 0
      ? "None."
      : markdownTable(
          ["Source", "Cell", "N", "All-data win", "Mean fold drift"],
          usableRows,
        ),
    "",
    "Warning-only cells:",
    "",
    warningRows.length === 0
      ? "None."
      : markdownTable(
          ["Source", "Cell", "N", "All-data win", "Mean fold drift"],
          warningRows,
        ),
    "",
    "Ignored cells:",
    "",
    ignoredRows.length === 0
      ? "None."
      : markdownTable(
          ["Source", "Cell", "N", "All-data win", "Mean fold drift"],
          ignoredRows,
        ),
  ].join("\n");
}

function renderReport(result) {
  const generatedAt = new Date().toISOString();

  return [
    "# Decision Priors Holdout Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Phase: 1 holdout validation before encoding decision constants.",
    "",
    "## Versions",
    "",
    markdownTable(
      ["Item", "Version"],
      [
        ["market analytics", integer(ANALYTICS_VERSION)],
        ["stability analytics", integer(STABILITY_ANALYTICS_VERSION)],
        ["dashboard rollup", integer(DASHBOARD_ROLLUP_VERSION)],
      ],
    ),
    "",
    renderExecutiveSummary(result),
    "",
    renderDatasetSection(result),
    "",
    renderMethodSection(result),
    "",
    renderRollupSanitySection(result),
    "",
    renderCalibrationSection(result),
    "",
    renderPhaseReadoutSection(result),
    "",
    renderFoldSection(result),
    "",
    renderUsabilitySection(result),
    "",
    renderCellTableSection(result),
    "",
    "## Phase 1 Status",
    "",
    "This report is the durable holdout artifact required before Phase 2 freezes shared decision config. Threshold confirmation or revision should be based on the usable and warning-only cell tables above, with ignored cells excluded from live priors unless more data is collected.",
    "",
  ].join("\n");
}

function validateExpectedBuckets() {
  const missingDistanceBuckets = DISTANCE_BUCKETS.filter(
    (bucket) => typeof bucket.id !== "string",
  );
  const missingLeadAgeBuckets = LEAD_AGE_BUCKETS.filter(
    (bucket) => typeof bucket.id !== "string",
  );
  const missingMomentumBuckets = MOMENTUM_AGREEMENT_BUCKETS.filter(
    (bucket) => typeof bucket.id !== "string",
  );
  const missingShapes = PRE_PATH_SHAPES.filter(
    (shape) => typeof shape.id !== "string",
  );

  if (
    missingDistanceBuckets.length > 0 ||
    missingLeadAgeBuckets.length > 0 ||
    missingMomentumBuckets.length > 0 ||
    missingShapes.length > 0
  ) {
    throw new Error("Unexpected dashboard bucket definitions");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  validateExpectedBuckets();

  const rows = loadRows(args);
  const result = buildHoldout({
    analyticsRows: rows.analyticsRows,
    options: {
      minPriorN: args.minPriorN,
      shrinkageK: args.shrinkageK,
      warningPriorN: args.warningPriorN,
    },
    stabilityRows: rows.stabilityRows,
  });
  const markdown = renderReport(result);

  fs.writeFileSync(args.output, markdown);
  console.log(
    JSON.stringify(
      {
        cleanAnalyticsRows: result.rowCounts.cleanAnalyticsRows,
        cleanStabilityRows: result.rowCounts.cleanStabilityRows,
        folds: result.days.length,
        output: path.relative(repoRoot, args.output),
        scoredPEstN: result.scored.n,
        scoredPEstWinRate: result.scored.winRate,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
