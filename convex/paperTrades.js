import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const nullable = (value) => v.union(value, v.null());
const optionalNullable = (value) => v.optional(v.union(value, v.null()));
const outcomeValue = v.union(v.literal("up"), v.literal("down"));
const actualWinnerValue = v.union(outcomeValue, v.literal("tie"));
const statusValue = v.union(
  v.literal("open"),
  v.literal("settled"),
  v.literal("void"),
);
const resultSourceValue = v.union(
  v.literal("official"),
  v.literal("derived"),
  v.literal("tie"),
);
const analyticsSourceValue = v.union(
  v.literal("official"),
  v.literal("derived"),
);
const riskFlagsValidator = v.object({
  recentLock: v.boolean(),
  multiFlipChop: v.boolean(),
  nearLineHeavy: v.boolean(),
});
const pathFeaturesValidator = v.object({
  preCurrentLeadAgeSeconds: nullable(v.number()),
  preLastFlipAgeSeconds: nullable(v.number()),
  preFlipCount: nullable(v.number()),
  preCrossCountLast60s: nullable(v.number()),
  preNearLineSeconds: nullable(v.number()),
  preSnapshotCoveragePct: nullable(v.number()),
  momentum30sAgreesWithLeader: optionalNullable(v.boolean()),
  leaderAlignedMomentum30sBps: optionalNullable(v.number()),
});
const paperTradeValidator = v.object({
  marketSlug: v.string(),
  marketId: v.string(),
  runId: v.string(),
  strategyVersion: v.string(),
  engineVersion: v.number(),
  paper: v.boolean(),
  status: statusValue,
  side: outcomeValue,
  stakeUsd: v.number(),
  entryTs: v.number(),
  entrySecond: v.number(),
  secondsRemaining: v.number(),
  windowStartTs: v.number(),
  windowEndTs: v.number(),
  priceToBeat: v.number(),
  priceToBeatSource: analyticsSourceValue,
  btcAtEntry: v.number(),
  btcTickTs: nullable(v.number()),
  btcAgeMs: nullable(v.number()),
  distanceBps: v.number(),
  absDistanceBps: v.number(),
  requiredDistanceBps: v.number(),
  baseRequiredDistanceBps: v.number(),
  riskFlags: riskFlagsValidator,
  riskCount: v.number(),
  pathFeatures: pathFeaturesValidator,
  entryMarketPrice: nullable(v.number()),
  upDisplayed: nullable(v.number()),
  downDisplayed: nullable(v.number()),
  upSpread: nullable(v.number()),
  downSpread: nullable(v.number()),
  closeBtc: nullable(v.number()),
  actualWinner: optionalNullable(actualWinnerValue),
  correct: nullable(v.boolean()),
  shares: nullable(v.number()),
  pnlUsd: nullable(v.number()),
  resultSource: optionalNullable(resultSourceValue),
  settledAt: nullable(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const settlementValidator = v.object({
  actualWinner: optionalNullable(actualWinnerValue),
  closeBtc: nullable(v.number()),
  correct: nullable(v.boolean()),
  pnlUsd: nullable(v.number()),
  resultSource: optionalNullable(resultSourceValue),
  settledAt: nullable(v.number()),
  shares: nullable(v.number()),
  status: statusValue,
  updatedAt: v.optional(v.number()),
});

function clampLimit(value, fallback = 50, max = 100) {
  return Math.max(1, Math.min(value ?? fallback, max));
}

function scanLimitForStrategyFilter(value, fallback = 50) {
  return Math.max(100, Math.min(clampLimit(value, fallback) * 6, 1000));
}

function applyStrategyFilter(rows, strategyVersion, limit) {
  const filtered = strategyVersion
    ? rows.filter((trade) => trade.strategyVersion === strategyVersion)
    : rows;

  return filtered.slice(0, limit);
}

function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`paper trade is missing ${field}`);
  }
}

async function getTradeByMarketAndStrategy(ctx, { marketSlug, strategyVersion }) {
  return await ctx.db
    .query("paper_trades")
    .withIndex("by_marketSlug_strategyVersion", (q) =>
      q.eq("marketSlug", marketSlug).eq("strategyVersion", strategyVersion),
    )
    .unique();
}

function createStatsAccumulator(label) {
  return {
    avgEntryDistanceBps: null,
    avgEntryPrice: null,
    avgStakeUsd: null,
    entryDistanceTotalBps: 0,
    entryPriceTotal: 0,
    label,
    losses: 0,
    pnlUsd: 0,
    pnlUsdCount: 0,
    roi: null,
    stakeTotal: 0,
    settled: 0,
    total: 0,
    winRate: null,
    wins: 0,
  };
}

function addToStats(accumulator, trade) {
  accumulator.total += 1;
  accumulator.stakeTotal += trade.stakeUsd;

  if (Number.isFinite(trade.absDistanceBps)) {
    accumulator.entryDistanceTotalBps += trade.absDistanceBps;
  }

  if (Number.isFinite(trade.entryMarketPrice)) {
    accumulator.entryPriceTotal += trade.entryMarketPrice;
  }

  if (trade.status === "settled" && trade.correct !== null) {
    accumulator.settled += 1;
    accumulator.wins += trade.correct ? 1 : 0;
    accumulator.losses += trade.correct ? 0 : 1;
  }

  if (Number.isFinite(trade.pnlUsd)) {
    accumulator.pnlUsd += trade.pnlUsd;
    accumulator.pnlUsdCount += 1;
  }
}

function finishStats(accumulator) {
  const decisions = accumulator.wins + accumulator.losses;
  const pnlUsd = accumulator.pnlUsdCount > 0 ? accumulator.pnlUsd : null;

  return {
    ...accumulator,
    avgEntryDistanceBps:
      accumulator.total > 0
        ? accumulator.entryDistanceTotalBps / accumulator.total
        : null,
    avgEntryPrice:
      accumulator.total > 0 ? accumulator.entryPriceTotal / accumulator.total : null,
    avgStakeUsd:
      accumulator.total > 0 ? accumulator.stakeTotal / accumulator.total : null,
    pnlUsd,
    roi:
      pnlUsd !== null && accumulator.stakeTotal > 0
        ? pnlUsd / accumulator.stakeTotal
        : null,
    winRate: decisions > 0 ? accumulator.wins / decisions : null,
  };
}

function entryWindowKey(entrySecond) {
  if (entrySecond >= 220 && entrySecond < 240) {
    return "t220_239";
  }

  if (entrySecond >= 240 && entrySecond <= 285) {
    return "t240_285";
  }

  return "other";
}

export const getByMarketSlug = query({
  args: {
    marketSlug: v.string(),
    strategyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    return await getTradeByMarketAndStrategy(ctx, args);
  },
});

export const insertDecision = mutation({
  args: {
    trade: paperTradeValidator,
  },
  handler: async (ctx, args) => {
    const { trade } = args;

    if (trade.paper !== true) {
      throw new Error("insertDecision only accepts paper trades");
    }

    if (trade.status !== "open") {
      throw new Error("new paper trades must be open");
    }

    requireNonEmpty(trade.marketSlug, "marketSlug");
    requireNonEmpty(trade.marketId, "marketId");
    requireNonEmpty(trade.strategyVersion, "strategyVersion");
    requireNonEmpty(trade.runId, "runId");

    const existing = await getTradeByMarketAndStrategy(ctx, trade);

    if (existing) {
      return {
        inserted: false,
        trade: existing,
      };
    }

    const id = await ctx.db.insert("paper_trades", trade);

    return {
      inserted: true,
      trade: {
        _id: id,
        ...trade,
      },
    };
  },
});

export const listOpen = query({
  args: {
    limit: v.optional(v.number()),
    strategyVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const rows = await ctx.db
      .query("paper_trades")
      .withIndex("by_status_windowEndTs", (q) => q.eq("status", "open"))
      .order("asc")
      .take(
        args.strategyVersion
          ? scanLimitForStrategyFilter(args.limit)
          : limit,
      );

    return applyStrategyFilter(rows, args.strategyVersion, limit);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    strategyVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const rows = await ctx.db
      .query("paper_trades")
      .withIndex("by_entryTs")
      .order("desc")
      .take(
        args.strategyVersion
          ? scanLimitForStrategyFilter(args.limit)
          : limit,
      );

    return applyStrategyFilter(rows, args.strategyVersion, limit);
  },
});

export const listSettled = query({
  args: {
    limit: v.optional(v.number()),
    strategyVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    const rows = await ctx.db
      .query("paper_trades")
      .withIndex("by_status_windowEndTs", (q) => q.eq("status", "settled"))
      .order("desc")
      .take(
        args.strategyVersion
          ? scanLimitForStrategyFilter(args.limit)
          : limit,
      );

    return applyStrategyFilter(rows, args.strategyVersion, limit);
  },
});

export const settle = mutation({
  args: {
    id: v.id("paper_trades"),
    result: settlementValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);

    if (!existing) {
      return null;
    }

    const now = Date.now();
    const patch = {
      ...args.result,
      updatedAt: args.result.updatedAt ?? now,
    };

    if (patch.status === "settled" && patch.settledAt === null) {
      patch.settledAt = now;
    }

    await ctx.db.patch(args.id, patch);

    return {
      ...existing,
      ...patch,
    };
  },
});

export const getStats = query({
  args: {
    strategyVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("paper_trades")
      .withIndex("by_entryTs")
      .order("desc")
      .take(5000);
    const trades = args.strategyVersion
      ? rows.filter((trade) => trade.strategyVersion === args.strategyVersion)
      : rows;
    const overall = createStatsAccumulator("All trades");
    const byEntryWindow = new Map([
      ["t220_239", createStatsAccumulator("T+220-239")],
      ["t240_285", createStatsAccumulator("T+240-285")],
      ["other", createStatsAccumulator("Other")],
    ]);
    const byRiskCount = new Map();
    let open = 0;
    let settled = 0;
    let voided = 0;

    for (const trade of trades) {
      open += trade.status === "open" ? 1 : 0;
      settled += trade.status === "settled" ? 1 : 0;
      voided += trade.status === "void" ? 1 : 0;
      addToStats(overall, trade);
      addToStats(byEntryWindow.get(entryWindowKey(trade.entrySecond)), trade);

      const riskKey = String(trade.riskCount);

      if (!byRiskCount.has(riskKey)) {
        byRiskCount.set(
          riskKey,
          createStatsAccumulator(`${trade.riskCount} risk flag${trade.riskCount === 1 ? "" : "s"}`),
        );
      }

      addToStats(byRiskCount.get(riskKey), trade);
    }

    return {
      byEntryWindow: [...byEntryWindow.entries()].map(([key, accumulator]) => ({
        key,
        ...finishStats(accumulator),
      })),
      byRiskCount: [...byRiskCount.entries()]
        .map(([key, accumulator]) => ({
          key,
          riskCount: Number(key),
          ...finishStats(accumulator),
        }))
        .sort((a, b) => a.riskCount - b.riskCount),
      counts: {
        open,
        settled,
        total: trades.length,
        void: voided,
      },
      overall: finishStats(overall),
      strategyVersion: args.strategyVersion ?? null,
    };
  },
});
