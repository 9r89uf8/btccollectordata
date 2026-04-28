import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import { BTC_SOURCES, BTC_SYMBOLS } from "../../packages/shared/src/ingest.js";
import {
  ANALYTICS_VERSION,
  EXCLUDED_REASONS,
  buildMarketAnalytics,
} from "../../packages/shared/src/marketAnalytics.js";

const BTC_LOOKBACK_MS = 120_000;
const RETRYABLE_EXCLUSION_REFRESH_MS = 15 * 60_000;
const RETRYABLE_EXCLUDED_REASONS = new Set([
  EXCLUDED_REASONS.MISSING_CHECKPOINT_BTC,
  EXCLUDED_REASONS.STALE_BTC,
]);
const MIN_MATERIALIZE_LOOKBACK_MS = 5 * 60_000;
const MAX_MATERIALIZE_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

async function getMarketBySlug(ctx, slug) {
  return await ctx.db
    .query("markets")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function getSummaryByMarketSlug(ctx, slug) {
  return await ctx.db
    .query("market_summaries")
    .withIndex("by_marketSlug", (q) => q.eq("marketSlug", slug))
    .unique();
}

async function getAnalyticsByMarketSlug(ctx, slug) {
  return await ctx.db
    .query("market_analytics")
    .withIndex("by_marketSlug", (q) => q.eq("marketSlug", slug))
    .unique();
}

async function getChainlinkBtcTicksForMarket(ctx, market) {
  const lowerBoundTs = market.windowStartTs - BTC_LOOKBACK_MS;

  return await ctx.db
    .query("btc_ticks")
    .withIndex("by_source_symbol_ts", (q) =>
      q
        .eq("source", BTC_SOURCES.CHAINLINK)
        .eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD)
        .gte("ts", lowerBoundTs)
        .lte("ts", market.windowEndTs),
    )
    .collect();
}

async function upsertMarketAnalytics(ctx, analytics) {
  const existing = await getAnalyticsByMarketSlug(ctx, analytics.marketSlug);

  if (!existing) {
    const id = await ctx.db.insert("market_analytics", analytics);

    return {
      id,
      status: "inserted",
    };
  }

  await ctx.db.patch(existing._id, {
    ...analytics,
    createdAt: existing.createdAt ?? analytics.createdAt,
  });

  return {
    id: existing._id,
    status: "updated",
  };
}

function hasRetryableExcludedReason(existing, nowTs) {
  if (!Array.isArray(existing?.excludedReasons)) {
    return false;
  }

  const hasRetryableReason = existing.excludedReasons.some((reason) =>
    RETRYABLE_EXCLUDED_REASONS.has(reason),
  );
  const updatedAt = Number.isFinite(existing.updatedAt)
    ? existing.updatedAt
    : 0;

  return (
    hasRetryableReason &&
    updatedAt <= nowTs - RETRYABLE_EXCLUSION_REFRESH_MS
  );
}

function shouldMaterializeMarketAnalytics({ existing, market, nowTs }) {
  return (
    !existing ||
    (existing.analyticsVersion ?? 0) < ANALYTICS_VERSION ||
    (existing.resolvedOutcome === null && market.winningOutcome !== null) ||
    hasRetryableExcludedReason(existing, nowTs)
  );
}

export async function materializeMarketAnalyticsForSlug(
  ctx,
  { nowTs = Date.now(), slug },
) {
  const market = await getMarketBySlug(ctx, slug);

  if (!market) {
    return {
      slug,
      status: "missing_market",
    };
  }

  const [summary, btcTicks] = await Promise.all([
    getSummaryByMarketSlug(ctx, slug),
    getChainlinkBtcTicksForMarket(ctx, market),
  ]);
  const analytics = buildMarketAnalytics({
    btcTicks,
    market,
    nowTs,
    summary,
  });
  const upsert = await upsertMarketAnalytics(ctx, analytics);

  return {
    analyticsVersion: analytics.analyticsVersion,
    excludedReasons: analytics.excludedReasons,
    slug,
    status: upsert.status,
  };
}

export const materializeForMarket = internalMutation({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await materializeMarketAnalyticsForSlug(ctx, {
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
    const markets = [];
    let scanned = 0;
    let done = false;
    let materialized = 0;
    let skipped = 0;
    const results = [];

    while (markets.length < limit) {
      const page = await ctx.db
        .query("markets")
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

      for (const market of page) {
        scanned += 1;
        const existing = await getAnalyticsByMarketSlug(ctx, market.slug);

        if (!shouldMaterializeMarketAnalytics({ existing, market, nowTs })) {
          skipped += 1;
          continue;
        }

        markets.push(market);

        if (markets.length >= limit) {
          break;
        }
      }

      const lastMarket = page[page.length - 1] ?? null;

      if (page.length < limit || !lastMarket) {
        done = true;
        break;
      }

      upperBoundTs = lastMarket.windowEndTs - 1;

      if (lowerBoundTs != null && upperBoundTs < lowerBoundTs) {
        done = true;
        break;
      }
    }

    for (const market of markets) {
      const result = await materializeMarketAnalyticsForSlug(ctx, {
        nowTs,
        slug: market.slug,
      });
      materialized += ["inserted", "updated"].includes(result.status) ? 1 : 0;
      results.push(result);
    }

    const lastMarket = markets[markets.length - 1] ?? null;

    return {
      done,
      materialized,
      nextBeforeWindowEndTs: lastMarket ? lastMarket.windowEndTs - 1 : null,
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
        internal.internal.marketAnalytics.materializeMissingOrStale,
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
