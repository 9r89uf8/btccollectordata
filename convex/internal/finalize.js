import { v } from "convex/values";

import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { buildMarketSummary } from "../../packages/shared/src/summary.js";
import { getBoundaryReferences } from "./btcReferences.js";
import { materializeMarketAnalyticsForSlug } from "./marketAnalytics.js";
import { materializeMarketStabilityAnalyticsForSlug } from "./marketStabilityAnalytics.js";

const SUMMARY_SNAPSHOT_BUFFER_MS = 30 * 1000;
const FINALIZE_ELIGIBLE_LOOKBACK_MS = 12 * 60 * 60 * 1000;

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

async function getSnapshotsForSummary(ctx, market) {
  return await ctx.db
    .query("market_snapshots_1s")
    .withIndex("by_marketSlug_secondBucket", (q) =>
      q
        .eq("marketSlug", market.slug)
        .gte("secondBucket", market.windowStartTs - SUMMARY_SNAPSHOT_BUFFER_MS)
        .lte("secondBucket", market.windowEndTs + SUMMARY_SNAPSHOT_BUFFER_MS),
    )
    .collect();
}

async function materializeAnalyticsForFinalizedMarket(ctx, { nowTs, slug }) {
  await materializeMarketAnalyticsForSlug(ctx, {
    nowTs,
    slug,
  });
  await materializeMarketStabilityAnalyticsForSlug(ctx, {
    nowTs,
    slug,
  });
}

async function listEndedMarketsPage(
  ctx,
  { afterWindowEndTs, beforeWindowEndTs, limit, nowTs },
) {
  const upperBound =
    beforeWindowEndTs == null ? nowTs : Math.min(beforeWindowEndTs, nowTs);
  const lowerBound = Math.max(0, afterWindowEndTs ?? 0);

  return await ctx.db
    .query("markets")
    .withIndex("by_windowEndTs", (q) =>
      q.gte("windowEndTs", lowerBound).lte("windowEndTs", upperBound),
    )
    .order("desc")
    .take(limit);
}

function summaryNeedsRefresh(market, existingSummary) {
  if (!existingSummary) {
    return false;
  }

  if ((market.updatedAtDb ?? 0) > (existingSummary.finalizedAt ?? 0)) {
    return true;
  }

  if (
    market.winningOutcome != null &&
    existingSummary.resolvedOutcome !== market.winningOutcome
  ) {
    return true;
  }

  return (
    (market.priceToBeatOfficial ?? null) !==
      (existingSummary.priceToBeatOfficial ?? null) ||
    (market.closeReferencePriceOfficial ?? null) !==
      (existingSummary.closeReferencePriceOfficial ?? null)
  );
}

async function finalizeOneMarket(ctx, market, { force = false, nowTs }) {
  const existingSummary = await getSummaryByMarketSlug(ctx, market.slug);

  if (existingSummary && !force && !summaryNeedsRefresh(market, existingSummary)) {
    return {
      dataQuality: market.dataQuality,
      slug: market.slug,
      status: "already_finalized",
    };
  }

  if (market.windowEndTs > nowTs) {
    return {
      slug: market.slug,
      status: "not_ready",
    };
  }

  const [boundaryReferences, snapshots] = await Promise.all([
    getBoundaryReferences(ctx, market),
    getSnapshotsForSummary(ctx, market),
  ]);
  const result = buildMarketSummary({
    boundaryReferences,
    market,
    nowTs,
    snapshots,
  });
  const marketPatch = {
    active: false,
    closed: true,
    closeReferencePriceDerived: result.summary.closeReferencePriceDerived,
    dataQuality: result.dataQuality,
    priceToBeatDerived: result.summary.priceToBeatDerived,
    resolved: market.resolved || result.summary.resolvedOutcome != null,
    updatedAtDb: nowTs,
    winningOutcome: result.summary.resolvedOutcome,
  };

  if (result.summary.resolvedOutcome == null) {
    await ctx.db.patch(market._id, marketPatch);

    try {
      await materializeAnalyticsForFinalizedMarket(ctx, {
        nowTs,
        slug: market.slug,
      });
    } catch (error) {
      console.warn("[analytics] failed to materialize missing-outcome market", {
        error: error?.message ?? String(error),
        slug: market.slug,
      });
    }

    return {
      dataQuality: result.dataQuality,
      liveSnapshotCount: result.meta.liveSnapshotCount,
      qualityFlags: result.qualityFlags,
      slug: market.slug,
      status: "missing_outcome",
    };
  }

  if (existingSummary) {
    await ctx.db.patch(existingSummary._id, result.summary);
  } else {
    await ctx.db.insert("market_summaries", result.summary);
  }

  await ctx.db.patch(market._id, marketPatch);

  try {
    await materializeAnalyticsForFinalizedMarket(ctx, {
      nowTs,
      slug: market.slug,
    });
  } catch (error) {
    console.warn("[analytics] failed to materialize finalized market", {
      error: error?.message ?? String(error),
      slug: market.slug,
    });
  }

  return {
    dataQuality: result.dataQuality,
    liveSnapshotCount: result.meta.liveSnapshotCount,
    qualityFlags: result.qualityFlags,
    slug: market.slug,
    status: existingSummary ? "updated" : "inserted",
    winningOutcome: result.summary.resolvedOutcome,
  };
}

function getFinalizationPriority(market) {
  let priority = 0;

  if (market.winningOutcome != null) {
    priority += 3;
  }

  if (market.resolved) {
    priority += 2;
  }

  if (
    market.priceToBeatOfficial != null &&
    market.closeReferencePriceOfficial != null
  ) {
    priority += 1;
  }

  return priority;
}

function summarizeFinalizationResults(results, scanned) {
  return {
    finalized: results.filter((result) =>
      ["inserted", "updated"].includes(result.status),
    ).length,
    results,
    scanned,
    skipped: results.filter((result) =>
      [
        "already_finalized",
        "missing_outcome",
        "missing_market",
        "not_ready",
      ].includes(result.status),
    ).length,
  };
}

export const finalizeMarketBySlug = internalMutation({
  args: {
    force: v.optional(v.boolean()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const market = await getMarketBySlug(ctx, args.slug);

    if (!market) {
      return {
        slug: args.slug,
        status: "missing_market",
      };
    }

    return await finalizeOneMarket(ctx, market, {
      force: args.force ?? false,
      nowTs: Date.now(),
    });
  },
});

export const finalizeEligibleMarkets = internalMutation({
  args: {
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    lookbackMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const force = args.force ?? false;
    const limit = Math.max(1, Math.min(args.limit ?? 25, 200));
    const nowTs = Date.now();
    const lookbackMs = force
      ? null
      : Math.max(
          5 * 60 * 1000,
          Math.min(
            args.lookbackMs ?? FINALIZE_ELIGIBLE_LOOKBACK_MS,
            7 * 24 * 60 * 60 * 1000,
          ),
        );
    const lowerWindowEndTs = lookbackMs == null ? 0 : nowTs - lookbackMs;
    const pageSize = Math.min(200, Math.max(limit * 2, 50));
    const eligibleMarkets = [];
    let scanned = 0;
    let cursorWindowEndTs = nowTs;

    while (eligibleMarkets.length < limit) {
      const page = await listEndedMarketsPage(ctx, {
        afterWindowEndTs: lowerWindowEndTs,
        beforeWindowEndTs: cursorWindowEndTs,
        limit: pageSize,
        nowTs,
      });

      if (page.length === 0) {
        break;
      }

      for (const market of page) {
        scanned += 1;

        if (force) {
          eligibleMarkets.push(market);
        } else {
          const existingSummary = await getSummaryByMarketSlug(ctx, market.slug);

          if (!existingSummary || summaryNeedsRefresh(market, existingSummary)) {
            eligibleMarkets.push(market);
          }
        }

        if (eligibleMarkets.length >= limit) {
          break;
        }
      }

      if (page.length < pageSize) {
        break;
      }

      cursorWindowEndTs = page[page.length - 1].windowEndTs - 1;

      if (cursorWindowEndTs <= lowerWindowEndTs) {
        break;
      }
    }

    eligibleMarkets.sort((a, b) => {
      const priorityDelta =
        getFinalizationPriority(b) - getFinalizationPriority(a);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return b.windowEndTs - a.windowEndTs;
    });
    const results = [];

    for (const market of eligibleMarkets) {
      results.push(
        await finalizeOneMarket(ctx, market, {
          force,
          nowTs,
        }),
      );
    }

    return summarizeFinalizationResults(results, scanned);
  },
});

export const finalizeMarketsBySlug = internalMutation({
  args: {
    force: v.optional(v.boolean()),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const force = args.force ?? false;
    const slugs = [...new Set(args.slugs.filter((slug) => slug && slug.trim() !== ""))].slice(
      0,
      200,
    );
    const nowTs = Date.now();
    const results = [];

    for (const slug of slugs) {
      const market = await getMarketBySlug(ctx, slug);

      if (!market) {
        results.push({
          slug,
          status: "missing_market",
        });
        continue;
      }

      results.push(
        await finalizeOneMarket(ctx, market, {
          force,
          nowTs,
        }),
      );
    }

    return summarizeFinalizationResults(results, slugs.length);
  },
});

export const listRecentClosedSyncCandidates = internalQuery({
  args: {
    limit: v.optional(v.number()),
    lookbackMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const lookbackMs = Math.max(60_000, Math.min(args.lookbackMs ?? 12 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000));
    const nowTs = Date.now();
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_windowEndTs", (q) =>
        q.gte("windowEndTs", nowTs - lookbackMs).lte("windowEndTs", nowTs),
      )
      .order("desc")
      .collect();

    return markets
      .filter((market) =>
        market.winningOutcome == null ||
        market.priceToBeatOfficial == null ||
        market.closeReferencePriceOfficial == null ||
        !market.closed ||
        !market.resolved,
      )
      .slice(0, limit)
      .map((market) => market.slug);
  },
});

export const reconcileRecentClosedMarkets = internalAction({
  args: {
    closedLimit: v.optional(v.number()),
    closedPages: v.optional(v.number()),
    finalizeLimit: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const candidateSlugs = await ctx.runQuery(
      internal.internal.finalize.listRecentClosedSyncCandidates,
      {
        limit: args.closedLimit ?? 50,
      },
    );
    const closedSync =
      candidateSlugs.length > 0
        ? await ctx.runAction(
            internal.internal.discovery.syncClosedBtc5mMarketsBySlug,
            {
              slugs: candidateSlugs,
            },
          )
        : {
            discoveredCount: 0,
            fetchedEvents: 0,
            inserted: 0,
            missingSlugs: 0,
            retriesUsed: 0,
            skipSummary: {},
            slugCount: 0,
            updated: 0,
          };
    const finalization = await ctx.runMutation(
      internal.internal.finalize.finalizeEligibleMarkets,
      {
        force: args.force ?? false,
        limit: args.finalizeLimit ?? 25,
        lookbackMs: 12 * 60 * 60 * 1000,
      },
    );

    console.log("[finalize] reconciliation summary", {
      closedSync: {
        candidateSlugs: candidateSlugs.length,
        discoveredCount: closedSync.discoveredCount,
        fetchedEvents: closedSync.fetchedEvents,
        missingSlugs: closedSync.missingSlugs,
        retriesUsed: closedSync.retriesUsed,
      },
      finalization: {
        finalized: finalization.finalized,
        scanned: finalization.scanned,
        skipped: finalization.skipped,
      },
    });

    return {
      closedSync,
      finalization,
    };
  },
});
