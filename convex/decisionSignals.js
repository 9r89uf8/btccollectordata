import { v } from "convex/values";

import { query } from "./_generated/server";

const MAX_STATS_ROWS = 25_000;

const decisionActionArg = v.union(
  v.literal("WAIT"),
  v.literal("SCOUT_SMALL"),
  v.literal("ENTER_UP"),
  v.literal("ENTER_DOWN"),
  v.literal("ADD_SMALL"),
  v.literal("EXIT_OR_DE_RISK"),
);

const ENTER_ACTIONS = new Set(["ENTER_UP", "ENTER_DOWN"]);
const DATA_QUALITY_REASON_CODES = new Set([
  "bad_snapshot_quality_gap",
  "bad_snapshot_quality_stale_book",
  "bad_snapshot_quality_stale_btc",
  "bad_snapshot_quality_unknown",
  "btc_too_old",
  "collector_unhealthy",
  "data_quality_unavailable",
  "missing_btc_tick",
  "missing_market_snapshot",
  "no_official_price_to_beat",
  "snapshot_too_old",
]);
const CALIBRATION_BUCKETS = [
  { id: "80_85", label: "80-85%", min: 0.8, max: 0.85 },
  { id: "85_90", label: "85-90%", min: 0.85, max: 0.9 },
  { id: "90_95", label: "90-95%", min: 0.9, max: 0.95 },
  { id: "95_100", label: "95-100%", min: 0.95, max: 1.01 },
];

function clampLimit(limit) {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(500, Math.floor(limit)));
}

function clampStatsLimit(limit) {
  if (!Number.isFinite(limit)) {
    return 1000;
  }

  return Math.max(1, Math.min(MAX_STATS_ROWS, Math.floor(limit)));
}

function indexedLimitFor(limit) {
  return Math.min(5000, Math.max(limit, limit * 4));
}

function enterScanLimitFor(limit) {
  return Math.min(5000, Math.max(500, limit * 20));
}

function matchesFilters(signal, args) {
  if (args.marketSlug && signal.marketSlug !== args.marketSlug) {
    return false;
  }

  if (args.action && signal.action !== args.action) {
    return false;
  }

  if (
    args.decisionVersion &&
    signal.decisionVersion !== args.decisionVersion
  ) {
    return false;
  }

  return true;
}

function matchesCommonFilters(signal, args) {
  if (args.marketSlug && signal.marketSlug !== args.marketSlug) {
    return false;
  }

  if (
    args.decisionVersion &&
    signal.decisionVersion !== args.decisionVersion
  ) {
    return false;
  }

  return true;
}

function isEnterAction(action) {
  return ENTER_ACTIONS.has(action);
}

function isWouldBeEnter(signal) {
  return isEnterAction(signal.action) || isEnterAction(signal.actionPreMute);
}

function entryActionFor(signal) {
  if (isEnterAction(signal.action)) {
    return signal.action;
  }

  if (isEnterAction(signal.actionPreMute)) {
    return signal.actionPreMute;
  }

  return null;
}

function calibrationBucketFor(pEst) {
  if (!Number.isFinite(pEst)) {
    return null;
  }

  return (
    CALIBRATION_BUCKETS.find(
      (bucket) => pEst >= bucket.min && pEst < bucket.max,
    ) ?? null
  );
}

function entryWon(entryAction, resolvedOutcome) {
  if (entryAction === "ENTER_UP") {
    return resolvedOutcome === "up";
  }

  if (entryAction === "ENTER_DOWN") {
    return resolvedOutcome === "down";
  }

  return false;
}

function sampleWindowFor(rows, limit) {
  const evaluatedAtValues = rows
    .map((row) => row.evaluatedAt)
    .filter(Number.isFinite);

  return {
    limit,
    newestEvaluatedAt:
      evaluatedAtValues.length > 0 ? Math.max(...evaluatedAtValues) : null,
    oldestEvaluatedAt:
      evaluatedAtValues.length > 0 ? Math.min(...evaluatedAtValues) : null,
    rowCount: rows.length,
  };
}

async function queryRecentRows(ctx, args, limit) {
  if (args.marketSlug) {
    return await ctx.db
      .query("decision_signals")
      .withIndex("by_marketSlug_evaluatedAt", (q) =>
        q.eq("marketSlug", args.marketSlug),
      )
      .order("desc")
      .take(limit);
  }

  if (args.decisionVersion) {
    return await ctx.db
      .query("decision_signals")
      .withIndex("by_decisionVersion_evaluatedAt", (q) =>
        q.eq("decisionVersion", args.decisionVersion),
      )
      .order("desc")
      .take(limit);
  }

  return await ctx.db
    .query("decision_signals")
    .withIndex("by_evaluatedAt")
    .order("desc")
    .take(limit);
}

export const listRecent = query({
  args: {
    action: v.optional(decisionActionArg),
    decisionVersion: v.optional(v.string()),
    limit: v.optional(v.number()),
    marketSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const indexedLimit = indexedLimitFor(limit);
    let rows;

    if (args.marketSlug) {
      rows = await ctx.db
        .query("decision_signals")
        .withIndex("by_marketSlug_evaluatedAt", (q) =>
          q.eq("marketSlug", args.marketSlug),
        )
        .order("desc")
        .take(indexedLimit);
    } else if (args.action) {
      rows = await ctx.db
        .query("decision_signals")
        .withIndex("by_action_evaluatedAt", (q) => q.eq("action", args.action))
        .order("desc")
        .take(indexedLimit);
    } else if (args.decisionVersion) {
      rows = await ctx.db
        .query("decision_signals")
        .withIndex("by_decisionVersion_evaluatedAt", (q) =>
          q.eq("decisionVersion", args.decisionVersion),
        )
        .order("desc")
        .take(indexedLimit);
    } else {
      rows = await ctx.db
        .query("decision_signals")
        .withIndex("by_evaluatedAt")
        .order("desc")
        .take(limit);
    }

    return rows.filter((row) => matchesFilters(row, args)).slice(0, limit);
  },
});

export const listRecentEnters = query({
  args: {
    decisionVersion: v.optional(v.string()),
    limit: v.optional(v.number()),
    marketSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const rows = await queryRecentRows(ctx, args, enterScanLimitFor(limit));

    return rows
      .filter((row) => matchesCommonFilters(row, args) && isWouldBeEnter(row))
      .slice(0, limit);
  },
});

export const listByMarketSlug = query({
  args: {
    decisionVersion: v.optional(v.string()),
    limit: v.optional(v.number()),
    marketSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const rows = await ctx.db
      .query("decision_signals")
      .withIndex("by_marketSlug_evaluatedAt", (q) =>
        q.eq("marketSlug", args.marketSlug),
      )
      .order("desc")
      .take(indexedLimitFor(limit));

    return rows.filter((row) => matchesCommonFilters(row, args)).slice(0, limit);
  },
});

export const getReasonCodeStats = query({
  args: {
    decisionVersion: v.optional(v.string()),
    limit: v.optional(v.number()),
    marketSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampStatsLimit(args.limit);
    const rows = await queryRecentRows(ctx, args, limit);
    const filteredRows = rows.filter((row) => matchesCommonFilters(row, args));
    const reasonCounts = new Map();
    const actionCounts = new Map();
    let enterCount = 0;
    let mutedEnterCount = 0;

    for (const row of filteredRows) {
      const action = row.action ?? "UNKNOWN";
      actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);

      if (isEnterAction(row.action)) {
        enterCount += 1;
      }

      if (isEnterAction(row.actionPreMute)) {
        mutedEnterCount += 1;
      }

      for (const reasonCode of row.reasonCodes ?? []) {
        const current =
          reasonCounts.get(reasonCode) ?? {
            code: reasonCode,
            count: 0,
            enterCount: 0,
            mutedEnterCount: 0,
            waitCount: 0,
          };

        current.count += 1;

        if (row.action === "WAIT") {
          current.waitCount += 1;
        }

        if (isEnterAction(row.action)) {
          current.enterCount += 1;
        }

        if (isEnterAction(row.actionPreMute)) {
          current.mutedEnterCount += 1;
        }

        reasonCounts.set(reasonCode, current);
      }
    }

    const reasonRows = [...reasonCounts.values()].sort(
      (a, b) => b.count - a.count || a.code.localeCompare(b.code),
    );
    const actionRows = [...actionCounts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));

    return {
      actionCounts: actionRows,
      dataQualityBlockers: reasonRows.filter((row) =>
        DATA_QUALITY_REASON_CODES.has(row.code),
      ),
      enterCount,
      generatedAt: Date.now(),
      mutedEnterCount,
      reasonCounts: reasonRows,
      sample: sampleWindowFor(filteredRows, limit),
      totalRows: filteredRows.length,
    };
  },
});

export const getEnterCalibration = query({
  args: {
    decisionVersion: v.optional(v.string()),
    limit: v.optional(v.number()),
    marketSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampStatsLimit(args.limit);
    const rows = await queryRecentRows(ctx, args, limit);
    const filteredRows = rows.filter((row) => matchesCommonFilters(row, args));
    const enterRows = filteredRows.filter(isWouldBeEnter);
    const summariesByMarketSlug = new Map();
    const bucketRows = CALIBRATION_BUCKETS.map((bucket) => ({
      ...bucket,
      avgPEst: null,
      candidates: 0,
      pending: 0,
      resolved: 0,
      winRate: null,
      wins: 0,
    }));

    for (const row of enterRows) {
      const bucket = calibrationBucketFor(row.pEst);

      if (!bucket) {
        continue;
      }

      const output = bucketRows.find((candidate) => candidate.id === bucket.id);
      const entryAction = entryActionFor(row);
      output.candidates += 1;

      if (Number.isFinite(row.pEst)) {
        output.avgPEst =
          output.avgPEst === null
            ? row.pEst
            : output.avgPEst + row.pEst;
      }

      if (!summariesByMarketSlug.has(row.marketSlug)) {
        summariesByMarketSlug.set(
          row.marketSlug,
          await ctx.db
            .query("market_summaries")
            .withIndex("by_marketSlug", (q) =>
              q.eq("marketSlug", row.marketSlug),
            )
            .first(),
        );
      }

      const summary = summariesByMarketSlug.get(row.marketSlug);

      if (!summary?.resolvedOutcome || !entryAction) {
        output.pending += 1;
        continue;
      }

      output.resolved += 1;

      if (entryWon(entryAction, summary.resolvedOutcome)) {
        output.wins += 1;
      }
    }

    for (const bucket of bucketRows) {
      bucket.avgPEst =
        bucket.candidates > 0 && bucket.avgPEst !== null
          ? bucket.avgPEst / bucket.candidates
          : null;
      bucket.winRate =
        bucket.resolved > 0 ? bucket.wins / bucket.resolved : null;
    }

    return {
      buckets: bucketRows,
      generatedAt: Date.now(),
      sample: sampleWindowFor(filteredRows, limit),
      totalEnterCandidates: enterRows.length,
    };
  },
});
