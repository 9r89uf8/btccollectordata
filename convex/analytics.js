import { v } from "convex/values";

import { query } from "./_generated/server";
import {
  ANALYTICS_DATE_RANGE_OPTIONS,
  COHORT_DRILLDOWN_CHECKPOINT_OPTIONS,
  COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS,
  COHORT_DRILLDOWN_SIDE_OPTIONS,
  ANALYTICS_MIN_SAMPLE_OPTIONS,
  buildAnalyticsReport,
  buildCohortDrilldownReport,
} from "../packages/shared/src/analytics.js";

const analyticsDateRangeValue = v.union(
  ...ANALYTICS_DATE_RANGE_OPTIONS.map((option) => v.literal(option.id)),
);
const cohortCheckpointValue = v.union(
  ...COHORT_DRILLDOWN_CHECKPOINT_OPTIONS.map((option) => v.literal(option.id)),
);
const cohortDistanceBucketValue = v.union(
  ...COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS.map((option) =>
    v.literal(option.id),
  ),
);
const cohortSideValue = v.union(
  ...COHORT_DRILLDOWN_SIDE_OPTIONS.map((option) => v.literal(option.id)),
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

export const getDashboard = query({
  args: {
    dateRange: v.optional(analyticsDateRangeValue),
    minSampleSize: v.optional(v.number()),
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
    const dateRange = args.dateRange ?? "7d";
    const summaries = await listCandidateSummaries(ctx, dateRange, nowTs);
    const markets = await listMarketsForSummaries(ctx, summaries);
    const defaultMinSampleSize = ANALYTICS_MIN_SAMPLE_OPTIONS.includes(3) ? 3 : 1;

    return buildAnalyticsReport({
      filters: {
        dateRange,
        minSampleSize: Math.max(1, args.minSampleSize ?? defaultMinSampleSize),
        quality: args.quality ?? "all",
      },
      markets,
      nowTs,
      summaries,
    });
  },
});

export const getCohortDrilldown = query({
  args: {
    checkpoint: cohortCheckpointValue,
    dateRange: v.optional(analyticsDateRangeValue),
    distanceBucket: cohortDistanceBucketValue,
    quality: v.optional(
      v.union(
        v.literal("all"),
        v.literal("good"),
        v.literal("partial"),
        v.literal("gap"),
      ),
    ),
    side: cohortSideValue,
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const dateRange = args.dateRange ?? "7d";
    const summaries = await listCandidateSummaries(ctx, dateRange, nowTs);
    const markets = await listMarketsForSummaries(ctx, summaries);

    return buildCohortDrilldownReport({
      filters: {
        dateRange,
        quality: args.quality ?? "all",
      },
      markets,
      nowTs,
      selection: {
        checkpoint: args.checkpoint,
        distanceBucket: args.distanceBucket,
        side: args.side,
      },
      summaries,
    });
  },
});
