import { v } from "convex/values";

import { query } from "./_generated/server";
import {
  ANALYTICS_DATE_RANGE_OPTIONS,
  buildLiveCallRulesReport,
} from "../packages/shared/src/analytics.js";
import {
  buildLiveMarketSignalReport,
  LIVE_CALL_RULE_DATE_RANGE,
  LIVE_CALL_RULE_MIN_SAMPLE_SIZE,
  LIVE_CALL_RULE_MIN_WIN_RATE,
  LIVE_CALL_RULE_QUALITY,
} from "../packages/shared/src/liveSignals.js";

const ACTIVE_WINDOW_GRACE_MS = 60 * 1000;
const analyticsDateRangeValue = v.union(
  ...ANALYTICS_DATE_RANGE_OPTIONS.map((option) => v.literal(option.id)),
);

function getDateRangeStart(dateRange, nowTs) {
  const option = ANALYTICS_DATE_RANGE_OPTIONS.find((item) => item.id === dateRange);

  if (!option || option.lookbackMs == null) {
    return null;
  }

  return nowTs - option.lookbackMs;
}

async function listCandidateSummaries(ctx, dateRange, nowTs) {
  const windowStartFrom = getDateRangeStart(dateRange, nowTs);

  if (windowStartFrom == null) {
    return await ctx.db.query("market_summaries").collect();
  }

  return await ctx.db
    .query("market_summaries")
    .withIndex("by_windowStartTs", (q) =>
      q.gte("windowStartTs", windowStartFrom),
    )
    .collect();
}

async function listMarketsForSummaries(ctx, summaries) {
  const missingQualitySlugs = [...new Set(
    summaries
      .filter((summary) => summary.dataQuality == null)
      .map((summary) => summary.marketSlug),
  )];

  if (missingQualitySlugs.length === 0) {
    return [];
  }

  const markets = await Promise.all(
    missingQualitySlugs.map((slug) =>
      ctx.db
        .query("markets")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique(),
    ),
  );

  return markets.filter(Boolean);
}

export const getLiveCallRules = query({
  args: {
    dateRange: v.optional(analyticsDateRangeValue),
    quality: v.optional(
      v.union(
        v.literal("all"),
        v.literal("good"),
        v.literal("partial"),
        v.literal("gap"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const dateRange = args.dateRange ?? LIVE_CALL_RULE_DATE_RANGE;
    const quality = args.quality ?? LIVE_CALL_RULE_QUALITY;
    const summaries = await listCandidateSummaries(ctx, dateRange, nowTs);
    const markets = await listMarketsForSummaries(ctx, summaries);

    return buildLiveCallRulesReport({
      filters: {
        dateRange,
        minSampleSize: LIVE_CALL_RULE_MIN_SAMPLE_SIZE,
        minWinRate: LIVE_CALL_RULE_MIN_WIN_RATE,
        quality,
      },
      markets,
      nowTs,
      summaries,
    });
  },
});

export const getActiveLiveSignals = query({
  args: {},
  handler: async (ctx) => {
    const nowTs = Date.now();
    const activeMarkets = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();
    const liveMarkets = activeMarkets
      .filter(
        (market) =>
          market.windowStartTs <= nowTs &&
          nowTs < market.windowEndTs + ACTIVE_WINDOW_GRACE_MS,
      )
      .sort((a, b) => a.windowStartTs - b.windowStartTs);
    const snapshotsBySlug = new Map();

    for (const market of liveMarkets) {
      const snapshots = await ctx.db
        .query("market_snapshots_1s")
        .withIndex("by_marketSlug_ts", (q) => q.eq("marketSlug", market.slug))
        .collect();
      snapshotsBySlug.set(market.slug, snapshots);
    }

    return buildLiveMarketSignalReport({
      markets: liveMarkets,
      nowTs,
      snapshotsBySlug,
    });
  },
});
