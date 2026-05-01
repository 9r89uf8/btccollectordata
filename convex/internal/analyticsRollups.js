import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { ANALYTICS_VERSION } from "../../packages/shared/src/marketAnalytics.js";
import {
  DASHBOARD_ROLLUP_KEY,
  DASHBOARD_ROLLUP_VERSION,
  TARGET_PATH_RISK_CHECKPOINTS,
  buildAnalyticsDashboard,
} from "../../packages/shared/src/analyticsDashboard.js";
import { STABILITY_ANALYTICS_VERSION } from "../../packages/shared/src/marketStabilityAnalytics.js";

const TARGET_PATH_RISK_CHECKPOINT_SET = new Set(TARGET_PATH_RISK_CHECKPOINTS);

async function getRollupByKey(ctx, key) {
  return await ctx.db
    .query("analytics_dashboard_rollups")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function upsertRollup(ctx, rollup) {
  const existing = await getRollupByKey(ctx, rollup.key);

  if (!existing) {
    const id = await ctx.db.insert("analytics_dashboard_rollups", rollup);

    return {
      id,
      status: "inserted",
    };
  }

  await ctx.db.patch(existing._id, rollup);

  return {
    id: existing._id,
    status: "updated",
  };
}

function getNextBeforeWindowEndTs(rows) {
  const lastRow = rows[rows.length - 1] ?? null;

  return Number.isFinite(lastRow?.windowEndTs)
    ? lastRow.windowEndTs - 1
    : null;
}

function compactAnalyticsCheckpoint(checkpoint) {
  return {
    btcAtCheckpoint: checkpoint.btcAtCheckpoint,
    btcTickAgeMs: checkpoint.btcTickAgeMs,
    checkpointSecond: checkpoint.checkpointSecond,
    didCurrentLeaderWin: checkpoint.didCurrentLeaderWin,
    distanceToBeatBps: checkpoint.distanceToBeatBps,
  };
}

function compactAnalyticsRow(row) {
  return {
    checkpoints: Array.isArray(row.checkpoints)
      ? row.checkpoints.map(compactAnalyticsCheckpoint)
      : [],
    completeFreshCheckpoints: row.completeFreshCheckpoints,
    excludedReasons: row.excludedReasons,
    marketSlug: row.marketSlug,
    outcomeSource: row.outcomeSource,
    priceToBeat: row.priceToBeat,
    priceToBeatSource: row.priceToBeatSource,
    resolvedOutcome: row.resolvedOutcome,
    summaryDataQuality: row.summaryDataQuality,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
  };
}

function compactStabilityCheckpoint(checkpoint) {
  const base = {
    checkpointInNoise: checkpoint.checkpointInNoise,
    checkpointSecond: checkpoint.checkpointSecond,
    distanceBps: checkpoint.distanceBps,
    flipLoss: checkpoint.flipLoss,
    leaderWonAtClose: checkpoint.leaderWonAtClose,
    noisyLeaderWin: checkpoint.noisyLeaderWin,
    postAnyHardFlip: checkpoint.postAnyHardFlip,
    postMaxAdverseBps: checkpoint.postMaxAdverseBps,
    postTouchedNoise: checkpoint.postTouchedNoise,
    preCurrentLeadAgeSeconds: checkpoint.preCurrentLeadAgeSeconds,
    preFlipCount: checkpoint.preFlipCount,
    preLastFlipAgeSeconds: checkpoint.preLastFlipAgeSeconds,
    preLeaderDwellPct: checkpoint.preLeaderDwellPct,
    preLongestLeadStreakSeconds: checkpoint.preLongestLeadStreakSeconds,
    preRealizedVolatility60s: checkpoint.preRealizedVolatility60s,
    preRealizedVolatility120s: checkpoint.preRealizedVolatility120s,
    recoveredLeaderWin: checkpoint.recoveredLeaderWin,
    stableLeaderWin: checkpoint.stableLeaderWin,
    unknownPath: checkpoint.unknownPath,
  };

  if (!TARGET_PATH_RISK_CHECKPOINT_SET.has(checkpoint.checkpointSecond)) {
    return base;
  }

  return {
    ...base,
    leader: checkpoint.leader,
    leaderAlignedMomentum30sBps: checkpoint.leaderAlignedMomentum30sBps,
    leaderAlignedMomentum60sBps: checkpoint.leaderAlignedMomentum60sBps,
    momentum30sAgreesWithLeader: checkpoint.momentum30sAgreesWithLeader,
    momentum30sBps: checkpoint.momentum30sBps,
    momentum30sSide: checkpoint.momentum30sSide,
    momentum60sBps: checkpoint.momentum60sBps,
    postMinSignedMarginBps: checkpoint.postMinSignedMarginBps,
    postPathGood: checkpoint.postPathGood,
    preCrossCountLast60s: checkpoint.preCrossCountLast60s,
    preDirectionChangeCount: checkpoint.preDirectionChangeCount,
    preMaxSnapshotGapMs: checkpoint.preMaxSnapshotGapMs,
    preNearLineSeconds: checkpoint.preNearLineSeconds,
    prePathGood: checkpoint.prePathGood,
    preRange60sBps: checkpoint.preRange60sBps,
    preRange120sBps: checkpoint.preRange120sBps,
    preSnapshotCoveragePct: checkpoint.preSnapshotCoveragePct,
  };
}

function compactStabilityRow(row) {
  return {
    checkpoints: Array.isArray(row.checkpoints)
      ? row.checkpoints.map(compactStabilityCheckpoint)
      : [],
    marketSlug: row.marketSlug,
    pathSummary: {
      closeMarginBps: row.pathSummary?.closeMarginBps,
      hardFlipCount: row.pathSummary?.hardFlipCount,
      maxDistanceBps: row.pathSummary?.maxDistanceBps,
      noiseTouchCount: row.pathSummary?.noiseTouchCount,
      pathType: row.pathSummary?.pathType,
    },
    priceToBeat: row.priceToBeat,
    resolvedOutcome: row.resolvedOutcome,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
  };
}

export const listAnalyticsPage = internalQuery({
  args: {
    beforeWindowEndTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 250, 500));
    const upperBoundTs = args.beforeWindowEndTs ?? Date.now();
    const rows = await ctx.db
      .query("market_analytics")
      .withIndex("by_windowEndTs", (q) => q.lte("windowEndTs", upperBoundTs))
      .order("desc")
      .take(limit);

    return {
      done: rows.length < limit,
      nextBeforeWindowEndTs: getNextBeforeWindowEndTs(rows),
      rows: rows.map(compactAnalyticsRow),
    };
  },
});

export const listStabilityPage = internalQuery({
  args: {
    beforeWindowEndTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 150, 300));
    const upperBoundTs = args.beforeWindowEndTs ?? Date.now();
    const rows = await ctx.db
      .query("market_stability_analytics")
      .withIndex("by_windowEndTs", (q) => q.lte("windowEndTs", upperBoundTs))
      .order("desc")
      .take(limit);

    return {
      done: rows.length < limit,
      nextBeforeWindowEndTs: getNextBeforeWindowEndTs(rows),
      rows: rows.map(compactStabilityRow),
    };
  },
});

function buildRollupFromRows({ analyticsRows, nowTs, stabilityRows }) {
  const dashboard = buildAnalyticsDashboard({
    analyticsRows,
    computedAt: nowTs,
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
    v3: {
      hourly: dashboard.hourly,
    },
  };
}

export async function writeAnalyticsDashboardRollup(ctx, rollup) {
  const upsert = await upsertRollup(ctx, rollup);

  return {
    analyticsRows: rollup.v1?.health?.cohortFunnel?.analyticsRows ?? null,
    computedAt: rollup.computedAt,
    rollupVersion: rollup.rollupVersion,
    stabilityRows: rollup.v1?.health?.cohortFunnel?.stabilityRows ?? null,
    status: upsert.status,
  };
}

export const writeRollup = internalMutation({
  args: {
    rollup: v.any(),
  },
  handler: async (ctx, args) => {
    return await writeAnalyticsDashboardRollup(ctx, args.rollup);
  },
});

async function collectRows(ctx, functionRef, pageLimit) {
  const rows = [];
  let beforeWindowEndTs = undefined;

  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const page = await ctx.runQuery(functionRef, {
      beforeWindowEndTs,
      limit: pageLimit,
    });

    rows.push(...page.rows);

    if (page.done || !page.nextBeforeWindowEndTs) {
      break;
    }

    beforeWindowEndTs = page.nextBeforeWindowEndTs;
  }

  return rows;
}

export const refreshNow = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowTs = Date.now();
    const [analyticsRows, stabilityRows] = await Promise.all([
      collectRows(ctx, internal.internal.analyticsRollups.listAnalyticsPage, 500),
      collectRows(ctx, internal.internal.analyticsRollups.listStabilityPage, 150),
    ]);
    const rollup = buildRollupFromRows({
      analyticsRows,
      nowTs,
      stabilityRows,
    });

    return await ctx.runMutation(internal.internal.analyticsRollups.writeRollup, {
      rollup,
    });
  },
});

export const refreshNowAction = internalAction({
  args: {},
  handler: async (ctx) => {
    return await ctx.runAction(internal.internal.analyticsRollups.refreshNow, {});
  },
});
