#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DECISION_ACTIONS,
  DECISION_CONFIG,
  REASON_CODES,
} from "../packages/shared/src/decisionConfig.js";
import {
  DASHBOARD_ROLLUP_KEY,
  DASHBOARD_ROLLUP_VERSION,
  buildAnalyticsDashboard,
} from "../packages/shared/src/analyticsDashboard.js";
import { ANALYTICS_VERSION } from "../packages/shared/src/marketAnalytics.js";
import { STABILITY_ANALYTICS_VERSION } from "../packages/shared/src/marketStabilityAnalytics.js";
import { buildDecisionPriorsFromRollup } from "../packages/shared/src/decisionPriors.js";
import { decide } from "../packages/shared/src/decisionEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_OUTPUT = path.join(repoRoot, "decision_replay_report.md");
const MAX_BUFFER_BYTES = 128 * 1024 * 1024;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MARKET_DATA_BATCH_SIZE = 50;
const DEFAULT_COST_PER_ENTRY = 0.01;
const P_EST_BUCKETS = [
  { id: "0_80_0_85", label: "0.80-0.85", min: 0.8, max: 0.85 },
  { id: "0_85_0_90", label: "0.85-0.90", min: 0.85, max: 0.9 },
  { id: "0_90_0_95", label: "0.90-0.95", min: 0.9, max: 0.95 },
  { id: "0_95_1_00", label: "0.95-1.00", min: 0.95, max: 1.0000001 },
];
const STALE_OR_GAP_REASONS = new Set([
  REASON_CODES.BAD_SNAPSHOT_QUALITY_GAP,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BOOK,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_STALE_BTC,
  REASON_CODES.BAD_SNAPSHOT_QUALITY_UNKNOWN,
  REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT,
  REASON_CODES.MISSING_MARKET_SNAPSHOT,
  REASON_CODES.SNAPSHOT_TOO_OLD,
]);

function usage() {
  return `Usage: node scripts/decisionReplay.js [options]

Options:
  --output <path>             Markdown report path. Default: decision_replay_report.md
  --limit <number>            Maximum historical markets to replay. Default: all fetched markets.
  --market-page-limit <n>     Convex market page size. Default: 100.
  --market-data-batch-size <n>
                              Per-call market data fetch batch size. Default: 50.
  --analytics-json <path>     Read compact market_analytics rows from JSON.
  --stability-json <path>     Read compact market_stability_analytics rows from JSON.
  --markets-json <path>       Read replay market list from JSON.
  --market-data-dir <path>    Read per-market replay JSON files named <slug>.json.
  --cache-dir <path>          Read/write replay cache files in this directory.
  --use-cache                 Read analytics, stability, markets, and per-market data from cache when present.
  --write-cache               Write fetched rows into --cache-dir.
  --smoke-latest-priors       Use all-data priors. Smoke only; not validation evidence.
  --cost-per-entry <number>   Fee/slippage cost per entered share. Default: 0.01.
  --help                      Show this message.

Without JSON/cache inputs, the script fetches compact rows through Convex:
  internal/analyticsRollups:listAnalyticsPage
  internal/analyticsRollups:listStabilityPage
  internal/decisionReplay:listReplayMarketsPage
  internal/decisionReplay:getReplayMarketData
`;
}

function parseArgs(argv) {
  const args = {
    analyticsJson: null,
    cacheDir: null,
    costPerEntry: DEFAULT_COST_PER_ENTRY,
    limit: null,
    marketDataBatchSize: DEFAULT_MARKET_DATA_BATCH_SIZE,
    marketDataDir: null,
    marketPageLimit: DEFAULT_PAGE_LIMIT,
    marketsJson: null,
    output: DEFAULT_OUTPUT,
    smokeLatestPriors: false,
    stabilityJson: null,
    useCache: false,
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
    } else if (arg === "--limit") {
      args.limit = Number(next());
    } else if (arg === "--market-page-limit") {
      args.marketPageLimit = Number(next());
    } else if (arg === "--market-data-batch-size") {
      args.marketDataBatchSize = Number(next());
    } else if (arg === "--analytics-json") {
      args.analyticsJson = path.resolve(repoRoot, next());
    } else if (arg === "--stability-json") {
      args.stabilityJson = path.resolve(repoRoot, next());
    } else if (arg === "--markets-json") {
      args.marketsJson = path.resolve(repoRoot, next());
    } else if (arg === "--market-data-dir") {
      args.marketDataDir = path.resolve(repoRoot, next());
    } else if (arg === "--cache-dir") {
      args.cacheDir = path.resolve(repoRoot, next());
    } else if (arg === "--use-cache") {
      args.useCache = true;
    } else if (arg === "--write-cache") {
      args.writeCache = true;
    } else if (arg === "--smoke-latest-priors") {
      args.smokeLatestPriors = true;
    } else if (arg === "--cost-per-entry") {
      args.costPerEntry = Number(next());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive number");
  }

  if (!Number.isFinite(args.marketPageLimit) || args.marketPageLimit <= 0) {
    throw new Error("--market-page-limit must be a positive number");
  }

  if (
    !Number.isFinite(args.marketDataBatchSize) ||
    args.marketDataBatchSize <= 0
  ) {
    throw new Error("--market-data-batch-size must be a positive number");
  }

  args.marketDataBatchSize = Math.min(Math.floor(args.marketDataBatchSize), 50);

  if (!Number.isFinite(args.costPerEntry) || args.costPerEntry < 0) {
    throw new Error("--cost-per-entry must be zero or positive");
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

function cachePath(args, name) {
  return args.cacheDir ? path.join(args.cacheDir, name) : null;
}

function marketCachePath(args, marketSlug) {
  const safeSlug = String(marketSlug).replace(/[^a-zA-Z0-9_.-]/g, "_");
  const baseDir = args.marketDataDir ?? path.join(args.cacheDir ?? "", "replay-market-data");

  return path.join(baseDir, `${safeSlug}.json`);
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

function collectConvexPages({ functionRef, maxRows = null, pageLimit }) {
  const rows = [];
  let beforeWindowEndTs = undefined;

  for (let pageIndex = 0; pageIndex < 300; pageIndex += 1) {
    const page = runConvex(functionRef, {
      beforeWindowEndTs,
      limit: pageLimit,
    });

    rows.push(...(page.rows ?? []));

    if (maxRows !== null && rows.length >= maxRows) {
      return rows.slice(0, maxRows);
    }

    if (page.done || !page.nextBeforeWindowEndTs) {
      return rows;
    }

    beforeWindowEndTs = page.nextBeforeWindowEndTs;
  }

  throw new Error(`Convex pagination did not finish for ${functionRef}`);
}

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function marketDayKey(marketOrTs) {
  const ts =
    typeof marketOrTs === "number"
      ? marketOrTs
      : toFiniteNumber(marketOrTs?.windowStartTs ?? marketOrTs?.windowEndTs);

  if (ts === null) {
    return "unknown";
  }

  return new Date(ts).toISOString().slice(0, 10);
}

function sortedByTime(rows, field = "windowEndTs") {
  return [...rows].sort((a, b) => {
    const left = toFiniteNumber(a?.[field]) ?? 0;
    const right = toFiniteNumber(b?.[field]) ?? 0;
    return left - right;
  });
}

function loadAnalyticsRows(args) {
  const cached = cachePath(args, "analytics.json");

  if (args.analyticsJson) {
    return readJsonFile(args.analyticsJson);
  }

  if (args.useCache && cached && fs.existsSync(cached)) {
    return readJsonFile(cached);
  }

  const rows = collectConvexPages({
    functionRef: "internal/analyticsRollups:listAnalyticsPage",
    pageLimit: 500,
  });

  if (args.writeCache && cached) {
    writeJsonFile(cached, rows);
  }

  return rows;
}

function loadStabilityRows(args) {
  const cached = cachePath(args, "stability.json");

  if (args.stabilityJson) {
    return readJsonFile(args.stabilityJson);
  }

  if (args.useCache && cached && fs.existsSync(cached)) {
    return readJsonFile(cached);
  }

  const rows = collectConvexPages({
    functionRef: "internal/analyticsRollups:listStabilityPage",
    pageLimit: 300,
  });

  if (args.writeCache && cached) {
    writeJsonFile(cached, rows);
  }

  return rows;
}

function loadReplayMarkets(args) {
  const cached = cachePath(args, "replay-markets.json");

  if (args.marketsJson) {
    return readJsonFile(args.marketsJson).slice(0, args.limit ?? undefined);
  }

  if (args.useCache && cached && fs.existsSync(cached)) {
    return readJsonFile(cached).slice(0, args.limit ?? undefined);
  }

  const rows = collectConvexPages({
    functionRef: "internal/decisionReplay:listReplayMarketsPage",
    maxRows: args.limit,
    pageLimit: args.marketPageLimit,
  });

  if (args.writeCache && cached) {
    writeJsonFile(cached, rows);
  }

  return rows;
}

function marketSlugFor(value) {
  return value?.slug ?? value?.marketSlug ?? value?.market?.slug ?? null;
}

function replayDataSlug(data) {
  return data?.market?.slug ?? data?.marketSlug ?? null;
}

function readCachedReplayMarketData(args, marketSlug) {
  const filePath =
    args.marketDataDir || args.cacheDir ? marketCachePath(args, marketSlug) : null;

  if ((args.marketDataDir || args.useCache) && filePath && fs.existsSync(filePath)) {
    return readJsonFile(filePath);
  }

  return null;
}

function writeCachedReplayMarketData(args, marketSlug, data) {
  if (!args.writeCache || !marketSlug || data?.missing) {
    return;
  }

  const filePath =
    args.marketDataDir || args.cacheDir ? marketCachePath(args, marketSlug) : null;

  if (filePath) {
    writeJsonFile(filePath, data);
  }
}

function loadReplayMarketDataBatch(args, markets) {
  const bySlug = new Map();
  const missingSlugs = [];

  for (const market of markets) {
    const marketSlug = marketSlugFor(market);

    if (!marketSlug) {
      continue;
    }

    const cached = readCachedReplayMarketData(args, marketSlug);

    if (cached) {
      bySlug.set(marketSlug, cached);
    } else {
      missingSlugs.push(marketSlug);
    }
  }

  if (missingSlugs.length > 0) {
    const response = runConvex("internal/decisionReplay:getReplayMarketDataBatch", {
      marketSlugs: missingSlugs,
    });

    for (const data of response.rows ?? []) {
      const marketSlug = replayDataSlug(data);

      if (!marketSlug) {
        continue;
      }

      bySlug.set(marketSlug, data);
      writeCachedReplayMarketData(args, marketSlug, data);
    }
  }

  return markets.map((market) => {
    const marketSlug = marketSlugFor(market);

    return {
      data: marketSlug ? bySlug.get(marketSlug) ?? null : null,
      market,
      marketSlug,
    };
  });
}

function rollupFromRows({ analyticsRows, computedAt, stabilityRows }) {
  const dashboard = buildAnalyticsDashboard({
    analyticsRows,
    computedAt,
    stabilityRows,
  });

  return {
    analyticsVersion: ANALYTICS_VERSION,
    computedAt: dashboard.computedAt,
    key: DASHBOARD_ROLLUP_KEY,
    rollupVersion: DASHBOARD_ROLLUP_VERSION,
    stabilityAnalyticsVersion: STABILITY_ANALYTICS_VERSION,
    v1: {
      health: dashboard.health,
      leader: dashboard.leader,
    },
    v2: {
      stability: dashboard.stability,
    },
  };
}

export function selectTrainingRowsForFold({
  analyticsRows,
  dayKey,
  smokeLatestPriors = false,
  stabilityRows,
}) {
  return {
    trainAnalytics: smokeLatestPriors
      ? analyticsRows
      : analyticsRows.filter((row) => marketDayKey(row) !== dayKey),
    trainStability: smokeLatestPriors
      ? stabilityRows
      : stabilityRows.filter((row) => marketDayKey(row) !== dayKey),
  };
}

function buildFoldPriors({
  analyticsRows,
  computedAt,
  dayKey,
  smokeLatestPriors,
  stabilityRows,
}) {
  const { trainAnalytics, trainStability } = selectTrainingRowsForFold({
    analyticsRows,
    dayKey,
    smokeLatestPriors,
    stabilityRows,
  });
  const rollup = rollupFromRows({
    analyticsRows: trainAnalytics,
    computedAt,
    stabilityRows: trainStability,
  });

  return {
    analyticsN: trainAnalytics.length,
    priors: buildDecisionPriorsFromRollup(rollup, DECISION_CONFIG),
    stabilityN: trainStability.length,
  };
}

export function chooseCheckpointSnapshot({
  checkpointSecond,
  market,
  snapshots,
  toleranceSec = DECISION_CONFIG.checkpointToleranceSec,
}) {
  const windowStartTs = toFiniteNumber(market?.windowStartTs);

  if (windowStartTs === null || !Array.isArray(snapshots)) {
    return null;
  }

  const targetTs = windowStartTs + checkpointSecond * 1000;
  const toleranceMs = toleranceSec * 1000;
  const candidates = snapshots
    .map((snapshot) => {
      const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);
      const secondsFromWindowStart =
        toFiniteNumber(snapshot?.secondsFromWindowStart) ??
        (secondBucket === null
          ? null
          : Math.floor((secondBucket - windowStartTs) / 1000));

      if (secondBucket === null || secondsFromWindowStart === null) {
        return null;
      }

      const absDeltaMs = Math.abs(secondBucket - targetTs);

      if (absDeltaMs > toleranceMs) {
        return null;
      }

      return {
        absDeltaMs,
        secondBucket,
        secondsFromWindowStart,
        snapshot,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.absDeltaMs !== b.absDeltaMs) {
        return a.absDeltaMs - b.absDeltaMs;
      }

      if (a.secondsFromWindowStart !== b.secondsFromWindowStart) {
        return a.secondsFromWindowStart - b.secondsFromWindowStart;
      }

      return a.secondBucket - b.secondBucket;
    });

  return candidates[0]?.snapshot ?? null;
}

export function chooseLatestTickAtOrBefore(ticks, nowMs) {
  const now = toFiniteNumber(nowMs);

  if (now === null || !Array.isArray(ticks)) {
    return null;
  }

  let best = null;
  let bestTime = -Infinity;

  for (const tick of ticks) {
    const tickTs = toFiniteNumber(tick?.ts);
    const receivedAt = toFiniteNumber(tick?.receivedAt ?? tick?.ts);
    const effectiveTime = receivedAt ?? tickTs;

    if (effectiveTime === null || effectiveTime > now) {
      continue;
    }

    if (effectiveTime >= bestTime) {
      best = {
        ...tick,
        receivedAt: receivedAt ?? effectiveTime,
        ts: tickTs ?? effectiveTime,
      };
      bestTime = effectiveTime;
    }
  }

  return best;
}

function pathRowsUpToSnapshot(snapshots, snapshot) {
  const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);

  if (secondBucket === null) {
    return [];
  }

  return snapshots.filter((row) => {
    const rowBucket = toFiniteNumber(row?.secondBucket ?? row?.ts);
    return rowBucket !== null && rowBucket <= secondBucket;
  });
}

function targetSecondBucket(market, checkpointSecond) {
  return Math.floor((market.windowStartTs + checkpointSecond * 1000) / 1000) * 1000;
}

function outcomeFor(data) {
  return (
    data?.summary?.resolvedOutcome ??
    data?.market?.winningOutcome ??
    data?.analytics?.resolvedOutcome ??
    data?.stability?.resolvedOutcome ??
    null
  );
}

function marketForReplay(data) {
  const market = data?.market ?? {};
  const summary = data?.summary ?? {};
  const analytics = data?.analytics ?? {};

  return {
    ...market,
    priceToBeatDerived:
      market.priceToBeatDerived ?? summary.priceToBeatDerived ?? analytics.priceToBeat,
    priceToBeatOfficial:
      market.priceToBeatOfficial ?? summary.priceToBeatOfficial ?? null,
  };
}

function isEnterAction(action) {
  return action === DECISION_ACTIONS.ENTER_UP || action === DECISION_ACTIONS.ENTER_DOWN;
}

function entryWon(action, outcome) {
  if (!isEnterAction(action) || (outcome !== "up" && outcome !== "down")) {
    return null;
  }

  return (
    (action === DECISION_ACTIONS.ENTER_UP && outcome === "up") ||
    (action === DECISION_ACTIONS.ENTER_DOWN && outcome === "down")
  );
}

function recordForResult({ checkpointSecond, data, market, result, snapshot }) {
  const action = result.action ?? DECISION_ACTIONS.WAIT;
  const outcome = outcomeFor(data);
  const won = entryWon(action, outcome);
  const ask = toFiniteNumber(result.leaderAsk);
  const grossPnl =
    won === null || ask === null ? 0 : won ? 1 - ask : -1 * ask;

  return {
    absDistanceBps: toFiniteNumber(result.absDistanceBps),
    action,
    checkpointSecond,
    distanceBucket: result.distanceBucket ?? null,
    edge: toFiniteNumber(result.edge),
    evaluatedAt: toFiniteNumber(snapshot?.ts ?? snapshot?.secondBucket) ??
      targetSecondBucket(market, checkpointSecond),
    flags: result.flags ?? null,
    grossPnl,
    leader: result.leader ?? null,
    leaderAsk: ask,
    leaderSpread: toFiniteNumber(result.leaderSpread),
    leaderTopAskDepth: toFiniteNumber(result.leaderTopAskDepth),
    marketSlug: market.slug,
    outcome,
    pEst: toFiniteNumber(result.pEst),
    reasonCodes: Array.isArray(result.reasonCodes) ? result.reasonCodes : [],
    requiredDistanceBps: toFiniteNumber(result.requiredDistanceBps),
    requiredEdge: toFiniteNumber(result.requiredEdge),
    secondBucket: toFiniteNumber(snapshot?.secondBucket) ??
      targetSecondBucket(market, checkpointSecond),
    won,
  };
}

function missedCheckpointRecord({ checkpointSecond, data, market }) {
  // Replay has no wall-clock tolerance-window close event, so missed rows use
  // the deterministic checkpoint bucket as evaluatedAt for stable reporting.
  return recordForResult({
    checkpointSecond,
    data,
    market,
    result: {
      action: DECISION_ACTIONS.WAIT,
      reasonCodes: [REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT],
    },
    snapshot: {
      secondBucket: targetSecondBucket(market, checkpointSecond),
      ts: targetSecondBucket(market, checkpointSecond),
    },
  });
}

export function evaluateMarketReplay({
  config = DECISION_CONFIG,
  data,
  priors,
}) {
  const market = marketForReplay(data);
  const snapshots = Array.isArray(data?.snapshots)
    ? [...data.snapshots].sort((a, b) => {
        const left = toFiniteNumber(a?.secondBucket ?? a?.ts) ?? 0;
        const right = toFiniteNumber(b?.secondBucket ?? b?.ts) ?? 0;
        return left - right;
      })
    : [];
  const ticks = Array.isArray(data?.ticks) ? data.ticks : [];
  const records = [];

  for (const checkpointSecond of config.targetCheckpoints) {
    const snapshot = chooseCheckpointSnapshot({
      checkpointSecond,
      market,
      snapshots,
      toleranceSec: config.checkpointToleranceSec,
    });

    if (!snapshot) {
      records.push(missedCheckpointRecord({ checkpointSecond, data, market }));
      continue;
    }

    const nowMs = toFiniteNumber(snapshot.ts ?? snapshot.secondBucket);
    const latestChainlinkTick = chooseLatestTickAtOrBefore(ticks, nowMs);

    try {
      const result = decide(
        {
          collectorHealth: { status: "ok" },
          latestChainlinkTick,
          latestSnapshot: snapshot,
          market,
          nowMs,
          recentPath: pathRowsUpToSnapshot(snapshots, snapshot),
          // Historical replay should test the full policy without runtime
          // action muting.
          runtimeControls: {
            decision_emit_actions: "all",
            decision_engine_enabled: true,
          },
        },
        priors,
        config,
      );

      records.push(
        recordForResult({
          checkpointSecond,
          data,
          market,
          result,
          snapshot,
        }),
      );
    } catch {
      records.push(
        recordForResult({
          checkpointSecond,
          data,
          market,
          result: {
            action: DECISION_ACTIONS.WAIT,
            reasonCodes: [REASON_CODES.DECISION_EXCEPTION],
          },
          snapshot,
        }),
      );
    }
  }

  return records;
}

function average(values) {
  const finite = values.filter(Number.isFinite);

  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function summarizeGroup(records, keyFn) {
  const groups = new Map();

  for (const record of records) {
    const key = keyFn(record);

    if (key == null) {
      continue;
    }

    const group = groups.get(key) ?? {
      key,
      losses: 0,
      n: 0,
      pEst: [],
      wins: 0,
    };

    group.n += 1;
    group.pEst.push(record.pEst);

    if (record.won === true) {
      group.wins += 1;
    } else if (record.won === false) {
      group.losses += 1;
    }

    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    avgPEst: average(group.pEst),
    key: group.key,
    losses: group.losses,
    n: group.n,
    winRate:
      group.wins + group.losses === 0
        ? null
        : group.wins / (group.wins + group.losses),
    wins: group.wins,
  }));
}

function summarizeWaitDiagnostics(records) {
  const groups = new Map();

  for (const record of records) {
    if (record.action !== DECISION_ACTIONS.WAIT) {
      continue;
    }

    const reason = record.reasonCodes[0] ?? "unknown";
    const group = groups.get(reason) ?? {
      absDistanceBps: [],
      edge: [],
      leaderAsk: [],
      leaderSpread: [],
      n: 0,
      pEst: [],
      reason,
      requiredDistanceBps: [],
      requiredEdge: [],
    };

    group.n += 1;
    group.absDistanceBps.push(record.absDistanceBps);
    group.edge.push(record.edge);
    group.leaderAsk.push(record.leaderAsk);
    group.leaderSpread.push(record.leaderSpread);
    group.pEst.push(record.pEst);
    group.requiredDistanceBps.push(record.requiredDistanceBps);
    group.requiredEdge.push(record.requiredEdge);
    groups.set(reason, group);
  }

  return [...groups.values()]
    .map((group) => ({
      avgAbsDistanceBps: average(group.absDistanceBps),
      avgAsk: average(group.leaderAsk),
      avgEdge: average(group.edge),
      avgPEst: average(group.pEst),
      avgRequiredDistanceBps: average(group.requiredDistanceBps),
      avgRequiredEdge: average(group.requiredEdge),
      avgSpread: average(group.leaderSpread),
      n: group.n,
      reason: group.reason,
    }))
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
}

function topRejectedEv(records, limit = 10) {
  return records
    .filter(
      (record) =>
        record.action === DECISION_ACTIONS.WAIT &&
        record.reasonCodes.includes(REASON_CODES.NO_EV_AGAINST_TOP_ASK) &&
        Number.isFinite(record.edge),
    )
    .sort((a, b) => b.edge - a.edge)
    .slice(0, limit);
}

function pEstBucket(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return P_EST_BUCKETS.find(
    (bucket) => value >= bucket.min && value < bucket.max,
  )?.label ?? null;
}

function riskFlagKeys(record) {
  const flags = record.flags && typeof record.flags === "object" ? record.flags : {};

  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function maxLosingStreak(entryRecords) {
  let current = 0;
  let max = 0;

  for (const record of sortedByTime(entryRecords, "evaluatedAt")) {
    if (record.won === false) {
      current += 1;
      max = Math.max(max, current);
    } else if (record.won === true) {
      current = 0;
    }
  }

  return max;
}

export function summarizeEvaluations(records, { costPerEntry = 0 } = {}) {
  const waitRecords = records.filter((record) => record.action === DECISION_ACTIONS.WAIT);
  const entryRecords = records.filter((record) => isEnterAction(record.action));
  const reasonCounts = new Map();

  for (const record of waitRecords) {
    for (const reason of record.reasonCodes) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  const entriesWithOutcome = entryRecords.filter((record) => record.won !== null);
  const wins = entriesWithOutcome.filter((record) => record.won === true).length;
  const grossPnl = entryRecords.reduce((sum, record) => sum + record.grossPnl, 0);
  const netPnl = grossPnl - entryRecords.length * costPerEntry;

  return {
    actionCounts: {
      ENTER_DOWN: entryRecords.filter(
        (record) => record.action === DECISION_ACTIONS.ENTER_DOWN,
      ).length,
      ENTER_UP: entryRecords.filter(
        (record) => record.action === DECISION_ACTIONS.ENTER_UP,
      ).length,
      WAIT: waitRecords.length,
    },
    avgAsk: average(entryRecords.map((record) => record.leaderAsk)),
    avgEdge: average(entryRecords.map((record) => record.edge)),
    avgPEst: average(entryRecords.map((record) => record.pEst)),
    byCheckpoint: summarizeGroup(entryRecords, (record) =>
      String(record.checkpointSecond),
    ),
    byDistanceBucket: summarizeGroup(entryRecords, (record) => record.distanceBucket),
    calibration: summarizeGroup(entryRecords, (record) => pEstBucket(record.pEst)),
    entryN: entryRecords.length,
    grossPnl,
    maxLosingStreak: maxLosingStreak(entryRecords),
    missedNoOfficial: waitRecords.filter((record) =>
      record.reasonCodes.includes(REASON_CODES.NO_OFFICIAL_PRICE_TO_BEAT),
    ).length,
    missedStaleGapSnapshots: waitRecords.filter((record) =>
      record.reasonCodes.some((reason) => STALE_OR_GAP_REASONS.has(reason)),
    ).length,
    netPnl,
    reasonCounts: [...reasonCounts.entries()]
      .map(([reason, n]) => ({ n, reason }))
      .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason)),
    riskFlags: summarizeGroup(
      entryRecords.flatMap((record) =>
        riskFlagKeys(record).map((flag) => ({ ...record, riskFlag: flag })),
      ),
      (record) => record.riskFlag,
    ),
    totalEvaluations: records.length,
    topRejectedEv: topRejectedEv(records),
    waitDiagnostics: summarizeWaitDiagnostics(records),
    winRate: entriesWithOutcome.length === 0 ? null : wins / entriesWithOutcome.length,
    wins,
  };
}

function runReplay(args) {
  const analyticsRows = loadAnalyticsRows(args);
  const stabilityRows = loadStabilityRows(args);
  const markets = loadReplayMarkets(args);
  const computedAt = Date.now();
  const dataWarnings = [];
  const priorsByDay = new Map();
  const records = [];
  const marketErrors = [];

  for (
    let offset = 0;
    offset < markets.length;
    offset += args.marketDataBatchSize
  ) {
    const marketBatch = markets.slice(offset, offset + args.marketDataBatchSize);
    let replayDataBatch = [];

    try {
      replayDataBatch = loadReplayMarketDataBatch(args, marketBatch);
    } catch (error) {
      for (const market of marketBatch) {
        marketErrors.push({
          error: error?.message ?? String(error),
          marketSlug: marketSlugFor(market),
        });
      }
      continue;
    }

    for (const { data, market, marketSlug } of replayDataBatch) {
      const dayKey = marketDayKey(market);
      const priorsKey = args.smokeLatestPriors ? "latest" : dayKey;

      if (!priorsByDay.has(priorsKey)) {
        priorsByDay.set(
          priorsKey,
          buildFoldPriors({
            analyticsRows,
            computedAt,
            dayKey,
            smokeLatestPriors: args.smokeLatestPriors,
            stabilityRows,
          }),
        );
      }

      try {
        if (!data || data.missing) {
          marketErrors.push({
            error: "Replay data not found",
            marketSlug,
          });
          continue;
        }

        if (data.snapshotLimitReached) {
          dataWarnings.push({
            detail: `Returned ${data.snapshotCount} snapshots, equal to the ${data.snapshotLimit} replay cap.`,
            marketSlug,
            warning: "snapshot_limit_reached",
          });
        }

        records.push(
          ...evaluateMarketReplay({
            data,
            priors: priorsByDay.get(priorsKey).priors,
          }),
        );
      } catch (error) {
        marketErrors.push({
          error: error?.message ?? String(error),
          marketSlug,
        });
      }
    }
  }

  return {
    analyticsRows: analyticsRows.length,
    costPerEntry: args.costPerEntry,
    dataWarnings,
    decisionVersion: DECISION_CONFIG.version,
    generatedAt: new Date(computedAt).toISOString(),
    marketDataBatchSize: args.marketDataBatchSize,
    marketErrors,
    marketsReplayed: markets.length,
    mode: args.smokeLatestPriors ? "latest-priors-smoke" : "leave-day-out",
    records,
    stabilityRows: stabilityRows.length,
    summary: summarizeEvaluations(records, {
      costPerEntry: args.costPerEntry,
    }),
    trainingFolds: [...priorsByDay.entries()].map(([key, value]) => ({
      analyticsN: value.analyticsN,
      key,
      stabilityN: value.stabilityN,
    })),
  };
}

function number(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function money(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function table(headers, rows) {
  if (rows.length === 0) {
    return "_No rows._";
  }

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderGroupTable(rows) {
  return table(
    ["Bucket", "N", "Wins", "Losses", "Win Rate", "Avg p_est"],
    rows.map((row) => [
      row.key,
      String(row.n),
      String(row.wins),
      String(row.losses),
      percent(row.winRate),
      percent(row.avgPEst),
    ]),
  );
}

function renderWaitDiagnostics(rows) {
  return table(
    [
      "Reason",
      "N",
      "Avg p_est",
      "Avg ask",
      "Avg edge",
      "Avg req edge",
      "Avg abs bps",
      "Avg req bps",
      "Avg spread",
    ],
    rows.map((row) => [
      row.reason,
      String(row.n),
      percent(row.avgPEst),
      number(row.avgAsk),
      number(row.avgEdge),
      number(row.avgRequiredEdge),
      number(row.avgAbsDistanceBps),
      number(row.avgRequiredDistanceBps),
      number(row.avgSpread),
    ]),
  );
}

function renderTopRejectedEv(rows) {
  return table(
    [
      "Market",
      "Checkpoint",
      "Leader",
      "p_est",
      "Ask",
      "Edge",
      "Req Edge",
      "Abs Bps",
      "Req Bps",
    ],
    rows.map((row) => [
      row.marketSlug,
      String(row.checkpointSecond),
      row.leader ?? "n/a",
      percent(row.pEst),
      number(row.leaderAsk),
      number(row.edge),
      number(row.requiredEdge),
      number(row.absDistanceBps),
      number(row.requiredDistanceBps),
    ]),
  );
}

function renderReport(result) {
  const { summary } = result;

  return [
    "# Decision Historical Replay Report",
    "",
    `Generated at: ${result.generatedAt}`,
    `Decision version: ${result.decisionVersion}`,
    `Mode: ${result.mode}`,
    `Markets replayed: ${result.marketsReplayed}`,
    `Market data batch size: ${result.marketDataBatchSize}`,
    `Analytics rows loaded: ${result.analyticsRows}`,
    `Stability rows loaded: ${result.stabilityRows}`,
    "",
    result.mode === "latest-priors-smoke"
      ? "**Warning:** this run used all-data priors and is a smoke test only. Do not use it as validation evidence."
      : "This run uses leave-day-out priors: each market is scored with priors rebuilt without markets from that UTC day.",
    "",
    "## Summary",
    "",
    table(
      ["Metric", "Value"],
      [
        ["Total evaluations", String(summary.totalEvaluations)],
        ["WAIT count", String(summary.actionCounts.WAIT)],
        ["ENTER_UP count", String(summary.actionCounts.ENTER_UP)],
        ["ENTER_DOWN count", String(summary.actionCounts.ENTER_DOWN)],
        ["Average p_est", percent(summary.avgPEst)],
        ["Average ask", number(summary.avgAsk)],
        ["Average edge", number(summary.avgEdge)],
        ["Win rate", percent(summary.winRate)],
        ["Estimated gross PnL", money(summary.grossPnl)],
        [
          `Estimated fee/slippage-adjusted PnL (${number(result.costPerEntry, 3)} cost/entry)`,
          money(summary.netPnl),
        ],
        ["Max losing streak", String(summary.maxLosingStreak)],
        [
          "Missed entries due to no official price-to-beat",
          String(summary.missedNoOfficial),
        ],
        [
          "Missed entries due to stale/gap snapshots",
          String(summary.missedStaleGapSnapshots),
        ],
        ["Snapshot cap warnings", String(result.dataWarnings.length)],
      ],
    ),
    "",
    "## WAIT Count By Reason",
    "",
    table(
      ["Reason", "Count"],
      summary.reasonCounts.map((row) => [row.reason, String(row.n)]),
    ),
    "",
    "## WAIT Gate Diagnostics",
    "",
    renderWaitDiagnostics(summary.waitDiagnostics),
    "",
    "## Top No-EV Rejections By Edge",
    "",
    renderTopRejectedEv(summary.topRejectedEv),
    "",
    "## Calibration By p_est Bucket",
    "",
    renderGroupTable(summary.calibration),
    "",
    "## Win Rate By Checkpoint",
    "",
    renderGroupTable(summary.byCheckpoint),
    "",
    "## Win Rate By Distance Bucket",
    "",
    renderGroupTable(summary.byDistanceBucket),
    "",
    "## Win Rate By Risk Flag",
    "",
    renderGroupTable(summary.riskFlags),
    "",
    "## Training Fold Sizes",
    "",
    table(
      ["Fold", "Analytics N", "Stability N"],
      result.trainingFolds.map((fold) => [
        fold.key,
        String(fold.analyticsN),
        String(fold.stabilityN),
      ]),
    ),
    "",
    "## Market Errors",
    "",
    table(
      ["Market", "Error"],
      result.marketErrors.map((row) => [row.marketSlug, row.error]),
    ),
    "",
    "## Data Warnings",
    "",
    table(
      ["Market", "Warning", "Detail"],
      result.dataWarnings.map((row) => [
        row.marketSlug,
        row.warning,
        row.detail,
      ]),
    ),
    "",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const result = runReplay(args);
  const markdown = renderReport(result);

  fs.writeFileSync(args.output, markdown);
  console.log(
    JSON.stringify(
      {
        entries: result.summary.entryN,
        dataWarnings: result.dataWarnings.length,
        marketErrors: result.marketErrors.length,
        marketsReplayed: result.marketsReplayed,
        mode: result.mode,
        output: args.output,
        totalEvaluations: result.summary.totalEvaluations,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
