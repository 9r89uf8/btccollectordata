import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { BTC_SOURCES, BTC_SYMBOLS } from "../../packages/shared/src/ingest.js";

const REPLAY_SNAPSHOT_LIMIT = 1200;
const REPLAY_MARKET_DATA_BATCH_LIMIT = 50;

function compactMarket(row) {
  return {
    active: row.active,
    closed: row.closed,
    dataQuality: row.dataQuality,
    marketId: row.marketId,
    priceToBeatDerived: row.priceToBeatDerived,
    priceToBeatOfficial: row.priceToBeatOfficial,
    resolved: row.resolved,
    slug: row.slug,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
    winningOutcome: row.winningOutcome,
  };
}

function compactSummary(row) {
  if (!row) {
    return null;
  }

  return {
    closeReferencePriceDerived: row.closeReferencePriceDerived,
    closeReferencePriceOfficial: row.closeReferencePriceOfficial,
    dataQuality: row.dataQuality,
    marketSlug: row.marketSlug,
    priceToBeatDerived: row.priceToBeatDerived,
    priceToBeatOfficial: row.priceToBeatOfficial,
    resolvedOutcome: row.resolvedOutcome,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
  };
}

function compactAnalytics(row) {
  if (!row) {
    return null;
  }

  return {
    analyticsVersion: row.analyticsVersion,
    checkpoints: row.checkpoints,
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

function compactStability(row) {
  if (!row) {
    return null;
  }

  return {
    checkpoints: row.checkpoints,
    excludedReasons: row.excludedReasons,
    marketSlug: row.marketSlug,
    pathSummary: row.pathSummary,
    priceToBeat: row.priceToBeat,
    resolvedOutcome: row.resolvedOutcome,
    stabilityAnalyticsVersion: row.stabilityAnalyticsVersion,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
  };
}

function compactSnapshot(row) {
  return {
    btcChainlink: row.btcChainlink,
    btcBinance: row.btcBinance,
    downAsk: row.downAsk,
    downBid: row.downBid,
    downDepthAskTop: row.downDepthAskTop,
    downSpread: row.downSpread,
    marketId: row.marketId,
    marketSlug: row.marketSlug,
    secondBucket: row.secondBucket,
    secondsFromWindowStart: row.secondsFromWindowStart,
    sourceQuality: row.sourceQuality,
    ts: row.ts,
    upAsk: row.upAsk,
    upBid: row.upBid,
    upDepthAskTop: row.upDepthAskTop,
    upSpread: row.upSpread,
    writtenAt: row.writtenAt,
  };
}

function compactTick(row) {
  return {
    isSnapshot: row.isSnapshot,
    price: row.price,
    receivedAt: row.receivedAt,
    source: row.source,
    symbol: row.symbol,
    ts: row.ts,
  };
}

function nextBeforeWindowEndTs(rows) {
  const last = rows[rows.length - 1] ?? null;

  return Number.isFinite(last?.windowEndTs) ? last.windowEndTs - 1 : null;
}

export const listReplayMarketsPage = internalQuery({
  args: {
    beforeWindowEndTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 250));
    const upperBoundTs = args.beforeWindowEndTs ?? Date.now();
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowEndTs", (q) => q.lte("windowEndTs", upperBoundTs))
      .order("desc")
      .take(limit);
    const replayMarkets = rows.filter(
      (row) => row.resolved === true || row.winningOutcome !== null,
    );

    return {
      done: rows.length < limit,
      nextBeforeWindowEndTs: nextBeforeWindowEndTs(rows),
      rows: replayMarkets.map(compactMarket),
    };
  },
});

export const getReplayMarketData = internalQuery({
  args: {
    marketSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await getReplayMarketDataBySlug(ctx, args.marketSlug);
  },
});

async function getReplayMarketDataBySlug(ctx, marketSlug) {
    const market = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", marketSlug))
      .unique();

    if (!market) {
      return null;
    }

    const [snapshotsDesc, ticks, summary, analytics, stability] =
      await Promise.all([
        ctx.db
          .query("market_snapshots_1s")
          .withIndex("by_marketSlug_ts", (q) =>
            q.eq("marketSlug", marketSlug),
          )
          .order("desc")
          .take(REPLAY_SNAPSHOT_LIMIT),
        ctx.db
          .query("btc_ticks")
          .withIndex("by_source_symbol_ts", (q) =>
            q
              .eq("source", BTC_SOURCES.CHAINLINK)
              .eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD)
              .gte("ts", market.windowStartTs - 30_000)
              .lte("ts", market.windowEndTs + 30_000),
          )
          .collect(),
        ctx.db
          .query("market_summaries")
          .withIndex("by_marketSlug", (q) => q.eq("marketSlug", marketSlug))
          .unique(),
        ctx.db
          .query("market_analytics")
          .withIndex("by_marketSlug", (q) => q.eq("marketSlug", marketSlug))
          .unique(),
        ctx.db
          .query("market_stability_analytics")
          .withIndex("by_marketSlug", (q) => q.eq("marketSlug", marketSlug))
          .unique(),
      ]);

    return {
      analytics: compactAnalytics(analytics),
      market: compactMarket(market),
      snapshotCount: snapshotsDesc.length,
      snapshotLimit: REPLAY_SNAPSHOT_LIMIT,
      snapshotLimitReached: snapshotsDesc.length >= REPLAY_SNAPSHOT_LIMIT,
      snapshots: [...snapshotsDesc].reverse().map(compactSnapshot),
      stability: compactStability(stability),
      summary: compactSummary(summary),
      ticks: ticks.map(compactTick),
    };
}

export const getReplayMarketDataBatch = internalQuery({
  args: {
    marketSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const marketSlugs = [...new Set(args.marketSlugs)]
      .filter((slug) => typeof slug === "string" && slug.trim() !== "")
      .slice(0, REPLAY_MARKET_DATA_BATCH_LIMIT);
    const rows = await Promise.all(
      marketSlugs.map(async (marketSlug) => {
        const data = await getReplayMarketDataBySlug(ctx, marketSlug);

        return data ?? { marketSlug, missing: true };
      }),
    );

    return {
      batchLimit: REPLAY_MARKET_DATA_BATCH_LIMIT,
      rows,
    };
  },
});
