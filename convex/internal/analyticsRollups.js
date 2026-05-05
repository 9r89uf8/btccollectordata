import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { TARGET_PATH_RISK_CHECKPOINTS } from "../../packages/shared/src/analyticsDashboard.js";
import { CRYPTO_ASSETS } from "../../packages/shared/src/ingest.js";

const TARGET_PATH_RISK_CHECKPOINT_SET = new Set(TARGET_PATH_RISK_CHECKPOINTS);
const EXPECTED_BTC_5M_MARKETS_PER_DAY = 288;
const rollupModeValue = v.union(v.literal("recent"), v.literal("full"));

function isBtcMarket(market) {
  return (market?.asset ?? CRYPTO_ASSETS.BTC) === CRYPTO_ASSETS.BTC;
}

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

function getUtcDayKey(ts) {
  if (!Number.isFinite(ts)) {
    return "unknown";
  }

  return new Date(ts).toISOString().slice(0, 10);
}

function finishMarketCountsByDay(rows, limitDays) {
  const byDay = new Map();

  for (const market of rows) {
    const day = getUtcDayKey(market.windowStartTs);
    const existing =
      byDay.get(day) ?? {
        active: 0,
        closed: 0,
        count: 0,
        day,
        expected: EXPECTED_BTC_5M_MARKETS_PER_DAY,
        firstWindowStartTs: market.windowStartTs,
        resolved: 0,
        lastWindowStartTs: market.windowStartTs,
      };

    existing.count += 1;
    existing.active += market.active ? 1 : 0;
    existing.closed += market.closed ? 1 : 0;
    existing.resolved += market.resolved ? 1 : 0;
    existing.firstWindowStartTs = Math.min(
      existing.firstWindowStartTs,
      market.windowStartTs,
    );
    existing.lastWindowStartTs = Math.max(
      existing.lastWindowStartTs,
      market.windowStartTs,
    );
    byDay.set(day, existing);
  }

  return [...byDay.values()]
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, limitDays)
    .map((row) => ({
      ...row,
      missing: Math.max(row.expected - row.count, 0),
      overExpected: Math.max(row.count - row.expected, 0),
      pctExpected: row.expected > 0 ? row.count / row.expected : null,
    }));
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

export const listMarketCountsByDay = internalQuery({
  args: {
    limitDays: v.optional(v.number()),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limitDays = Math.max(1, Math.min(args.limitDays ?? 14, 60));
    const scanLimit = Math.max(
      limitDays * EXPECTED_BTC_5M_MARKETS_PER_DAY,
      Math.min(args.scanLimit ?? limitDays * 340, 20_000),
    );
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .take(scanLimit);

    return finishMarketCountsByDay(rows.filter(isBtcMarket), limitDays);
  },
});

export async function writeAnalyticsDashboardRollup(ctx, rollup) {
  const upsert = await upsertRollup(ctx, rollup);

  return {
    analyticsRows: rollup.v1?.health?.cohortFunnel?.analyticsRows ?? null,
    computedAt: rollup.computedAt,
    mode: rollup.v3?.rollupMode ?? null,
    rollupVersion: rollup.rollupVersion,
    rowLimits: rollup.v3?.rowLimits ?? null,
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

export const refreshNow = internalAction({
  args: {
    mode: v.optional(rollupModeValue),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(
      internal.internal.analyticsRollupRefresh.refreshNow,
      args.mode ? { mode: args.mode } : {},
    );
  },
});

export const refreshNowAction = internalAction({
  args: {
    mode: v.optional(rollupModeValue),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(
      internal.internal.analyticsRollups.refreshNow,
      args.mode ? { mode: args.mode } : {},
    );
  },
});
