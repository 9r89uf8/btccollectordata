import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import {
  STABILITY_ANALYTICS_VERSION,
  buildMarketStabilityAnalytics,
} from "../../packages/shared/src/marketStabilityAnalytics.js";

const MIN_MATERIALIZE_LOOKBACK_MS = 5 * 60_000;
const MAX_MATERIALIZE_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

async function getMarketAnalyticsBySlug(ctx, slug) {
  return await ctx.db
    .query("market_analytics")
    .withIndex("by_marketSlug", (q) => q.eq("marketSlug", slug))
    .unique();
}

async function getStabilityByMarketSlug(ctx, slug) {
  return await ctx.db
    .query("market_stability_analytics")
    .withIndex("by_marketSlug", (q) => q.eq("marketSlug", slug))
    .unique();
}

async function getSnapshotsForAnalytics(ctx, analytics) {
  if (
    !Number.isFinite(analytics?.windowStartTs) ||
    !Number.isFinite(analytics?.windowEndTs)
  ) {
    return [];
  }

  return await ctx.db
    .query("market_snapshots_1s")
    .withIndex("by_marketSlug_secondBucket", (q) =>
      q
        .eq("marketSlug", analytics.marketSlug)
        .gte("secondBucket", analytics.windowStartTs)
        .lte("secondBucket", analytics.windowEndTs),
    )
    .collect();
}

async function upsertMarketStabilityAnalytics(ctx, stability) {
  const existing = await getStabilityByMarketSlug(ctx, stability.marketSlug);

  if (!existing) {
    const id = await ctx.db.insert("market_stability_analytics", stability);

    return {
      id,
      status: "inserted",
    };
  }

  await ctx.db.patch(existing._id, {
    ...stability,
    createdAt: existing.createdAt ?? stability.createdAt,
  });

  return {
    id: existing._id,
    status: "updated",
  };
}

function shouldMaterializeStability({ analytics, existing }) {
  return (
    !existing ||
    (existing.stabilityAnalyticsVersion ?? 0) < STABILITY_ANALYTICS_VERSION ||
    (analytics.updatedAt ?? 0) > (existing.updatedAt ?? 0)
  );
}

export async function materializeMarketStabilityAnalyticsForSlug(
  ctx,
  { nowTs = Date.now(), slug },
) {
  const analytics = await getMarketAnalyticsBySlug(ctx, slug);

  if (!analytics) {
    return {
      slug,
      status: "missing_market_analytics",
    };
  }

  const snapshots = await getSnapshotsForAnalytics(ctx, analytics);
  const stability = buildMarketStabilityAnalytics({
    marketAnalytics: analytics,
    nowTs,
    snapshots,
  });
  const upsert = await upsertMarketStabilityAnalytics(ctx, stability);

  return {
    excludedReasons: stability.excludedReasons,
    pathGood: stability.pathSummary.pathGood,
    slug,
    stabilityAnalyticsVersion: stability.stabilityAnalyticsVersion,
    status: upsert.status,
  };
}

export const materializeForMarket = internalMutation({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await materializeMarketStabilityAnalyticsForSlug(ctx, {
      nowTs: Date.now(),
      slug: args.slug,
    });
  },
});

export const materializeMissingOrStale = internalMutation({
  args: {
    beforeWindowEndTs: v.optional(v.number()),
    includeResults: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    lookbackMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 50));
    const nowTs = Date.now();
    const lookbackMs =
      args.lookbackMs == null
        ? null
        : Math.max(
            MIN_MATERIALIZE_LOOKBACK_MS,
            Math.min(args.lookbackMs, MAX_MATERIALIZE_LOOKBACK_MS),
          );
    const lowerBoundTs = lookbackMs == null ? null : nowTs - lookbackMs;
    let upperBoundTs =
      args.beforeWindowEndTs == null
        ? nowTs
        : Math.min(args.beforeWindowEndTs, nowTs);
    const analyticsRows = [];
    let done = false;
    let materialized = 0;
    let scanned = 0;
    let skipped = 0;
    const results = [];

    while (analyticsRows.length < limit) {
      const page = await ctx.db
        .query("market_analytics")
        .withIndex("by_windowEndTs", (q) =>
          lowerBoundTs == null
            ? q.lte("windowEndTs", upperBoundTs)
            : q.gte("windowEndTs", lowerBoundTs).lte("windowEndTs", upperBoundTs),
        )
        .order("desc")
        .take(limit);

      if (page.length === 0) {
        done = true;
        break;
      }

      for (const analytics of page) {
        scanned += 1;
        const existing = await getStabilityByMarketSlug(ctx, analytics.marketSlug);

        if (!shouldMaterializeStability({ analytics, existing })) {
          skipped += 1;
          continue;
        }

        analyticsRows.push(analytics);

        if (analyticsRows.length >= limit) {
          break;
        }
      }

      const lastRow = page[page.length - 1] ?? null;

      if (page.length < limit || !lastRow) {
        done = true;
        break;
      }

      upperBoundTs = lastRow.windowEndTs - 1;

      if (lowerBoundTs != null && upperBoundTs < lowerBoundTs) {
        done = true;
        break;
      }
    }

    for (const analytics of analyticsRows) {
      const result = await materializeMarketStabilityAnalyticsForSlug(ctx, {
        nowTs,
        slug: analytics.marketSlug,
      });
      materialized += ["inserted", "updated"].includes(result.status) ? 1 : 0;
      results.push(result);
    }

    const lastRow = analyticsRows[analyticsRows.length - 1] ?? null;

    return {
      done,
      materialized,
      nextBeforeWindowEndTs: lastRow ? lastRow.windowEndTs - 1 : null,
      results: args.includeResults ? results : [],
      scanned,
      skipped,
    };
  },
});

export const backfillMissingOrStale = internalAction({
  args: {
    batchLimit: v.optional(v.number()),
    beforeWindowEndTs: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchLimit = Math.max(1, Math.min(args.batchLimit ?? 50, 50));
    const maxBatches = Math.max(1, Math.min(args.maxBatches ?? 20, 100));
    let beforeWindowEndTs = args.beforeWindowEndTs;
    let done = false;
    let materialized = 0;
    let scanned = 0;
    let skipped = 0;
    const batches = [];

    for (let index = 0; index < maxBatches; index += 1) {
      const result = await ctx.runMutation(
        internal.internal.marketStabilityAnalytics.materializeMissingOrStale,
        {
          beforeWindowEndTs,
          includeResults: false,
          limit: batchLimit,
        },
      );

      batches.push({
        done: result.done,
        materialized: result.materialized,
        nextBeforeWindowEndTs: result.nextBeforeWindowEndTs,
        scanned: result.scanned,
        skipped: result.skipped,
      });
      materialized += result.materialized;
      scanned += result.scanned;
      skipped += result.skipped;
      beforeWindowEndTs = result.nextBeforeWindowEndTs ?? beforeWindowEndTs;

      if (result.done || result.materialized === 0 || !result.nextBeforeWindowEndTs) {
        done = result.done;
        break;
      }
    }

    return {
      batches,
      done,
      materialized,
      nextBeforeWindowEndTs: beforeWindowEndTs ?? null,
      scanned,
      skipped,
    };
  },
});
