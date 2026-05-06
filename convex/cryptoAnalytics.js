import { query } from "./_generated/server";
import { v } from "convex/values";

import {
  CRYPTO_PAIR_DEFAULT_ROW_LIMIT,
  CRYPTO_PAIR_LOOKBACK_MS,
  buildBtcEthOutcomeComparison,
  buildEthFinalFlipAnalytics,
} from "../packages/shared/src/cryptoPairAnalytics.js";

const MIN_LOOKBACK_HOURS = 1;
const MAX_LOOKBACK_HOURS = 72;
const MARKET_WINDOW_MS = 5 * 60 * 1000;

function getLookbackMs(hours) {
  if (!Number.isFinite(hours)) {
    return CRYPTO_PAIR_LOOKBACK_MS;
  }

  return (
    Math.max(MIN_LOOKBACK_HOURS, Math.min(hours, MAX_LOOKBACK_HOURS)) *
    60 *
    60 *
    1000
  );
}

function getScanLimit(lookbackMs) {
  const expectedWindows = Math.ceil(lookbackMs / MARKET_WINDOW_MS);

  return Math.min(Math.max(expectedWindows * 3, 200), 2500);
}

function compactMarketForComparison(market) {
  return {
    active: market.active,
    asset: market.asset,
    closed: market.closed,
    dataQuality: market.dataQuality,
    marketId: market.marketId,
    question: market.question,
    priceToBeatDerived: market.priceToBeatDerived,
    priceToBeatOfficial: market.priceToBeatOfficial,
    resolved: market.resolved,
    slug: market.slug,
    windowEndTs: market.windowEndTs,
    windowStartTs: market.windowStartTs,
    winningOutcome: market.winningOutcome,
  };
}

function isEthMarket(market) {
  return market.asset === "eth";
}

function compactSnapshotForFinalFlip(snapshot) {
  return {
    downAsk: snapshot.downAsk,
    downDisplayed: snapshot.downDisplayed,
    ethChainlink: snapshot.ethChainlink,
    secondBucket: snapshot.secondBucket,
    sourceQuality: snapshot.sourceQuality,
    upAsk: snapshot.upAsk,
    upDisplayed: snapshot.upDisplayed,
  };
}

export const getBtcEthOutcomeComparison = query({
  args: {
    hours: v.optional(v.number()),
    rowLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const lookbackMs = getLookbackMs(args.hours);
    const fromTs = nowTs - lookbackMs;
    const scanLimit = getScanLimit(lookbackMs);
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs", (q) =>
        q.gte("windowStartTs", fromTs).lte("windowStartTs", nowTs),
      )
      .order("desc")
      .take(scanLimit);

    return {
      ...buildBtcEthOutcomeComparison({
        lookbackMs,
        markets: rows.map(compactMarketForComparison),
        nowTs,
        rowLimit: args.rowLimit ?? CRYPTO_PAIR_DEFAULT_ROW_LIMIT,
      }),
      scannedMarkets: rows.length,
      scanLimit,
    };
  },
});

export const getEthFinalFlipAnalytics = query({
  args: {
    hours: v.optional(v.number()),
    rowLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const lookbackMs = getLookbackMs(args.hours);
    const fromTs = nowTs - lookbackMs;
    const scanLimit = getScanLimit(lookbackMs);
    const marketRows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs", (q) =>
        q.gte("windowStartTs", fromTs).lte("windowStartTs", nowTs),
      )
      .order("desc")
      .take(scanLimit);
    const ethMarkets = marketRows.filter(isEthMarket);
    const snapshotsByMarketSlug = {};

    for (const market of ethMarkets) {
      if (market.winningOutcome !== "up" && market.winningOutcome !== "down") {
        snapshotsByMarketSlug[market.slug] = [];
        continue;
      }

      const snapshots = await ctx.db
        .query("market_snapshots_1s")
        .withIndex("by_marketSlug_secondBucket", (q) =>
          q
            .eq("marketSlug", market.slug)
            .gte("secondBucket", market.windowEndTs - 10_000)
            .lte("secondBucket", market.windowEndTs),
        )
        .collect();

      snapshotsByMarketSlug[market.slug] = snapshots.map(compactSnapshotForFinalFlip);
    }

    return {
      ...buildEthFinalFlipAnalytics({
        lookbackMs,
        markets: ethMarkets.map(compactMarketForComparison),
        nowTs,
        rowLimit: args.rowLimit ?? 50,
        snapshotsByMarketSlug,
      }),
      scannedMarkets: marketRows.length,
      scannedSnapshots: Object.values(snapshotsByMarketSlug).reduce(
        (sum, snapshots) => sum + snapshots.length,
        0,
      ),
      scanLimit,
    };
  },
});
