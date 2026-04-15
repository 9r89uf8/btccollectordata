import { v } from "convex/values";

import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  DEFAULT_MISSING_SUMMARY_GRACE_MS,
  DEFAULT_STALE_ACTIVE_GRACE_MS,
  appendSystemNote,
  shouldFinalizeMissingSummary,
  shouldMarkMarketStaleActive,
} from "../../packages/shared/src/repair.js";

export const listStaleActiveMarketSlugs = internalQuery({
  args: {
    graceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const graceMs = Math.max(
      60_000,
      Math.min(args.graceMs ?? DEFAULT_STALE_ACTIVE_GRACE_MS, 24 * 60 * 60 * 1000),
    );
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const nowTs = Date.now();
    const activeMarkets = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();

    return activeMarkets
      .filter((market) => shouldMarkMarketStaleActive(market, { graceMs, nowTs }))
      .sort((a, b) => a.windowEndTs - b.windowEndTs)
      .slice(0, limit)
      .map((market) => market.slug);
  },
});

export const markStaleActiveMarketsInactive = internalMutation({
  args: {
    nowTs: v.number(),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const slugs = [...new Set(args.slugs.filter((slug) => slug && slug.trim() !== ""))].slice(
      0,
      200,
    );
    const repairedSlugs = [];

    for (const slug of slugs) {
      const market = await ctx.db
        .query("markets")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (!market?.active) {
        continue;
      }

      await ctx.db.patch(market._id, {
        active: false,
        closed: true,
        notes: appendSystemNote(
          market.notes,
          "repair_marked_inactive_after_window_end",
        ),
        updatedAtDb: args.nowTs,
      });
      repairedSlugs.push(slug);
    }

    return {
      repaired: repairedSlugs.length,
      repairedSlugs,
    };
  },
});

export const listMissingSummarySlugs = internalQuery({
  args: {
    graceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const graceMs = Math.max(
      60_000,
      Math.min(args.graceMs ?? DEFAULT_MISSING_SUMMARY_GRACE_MS, 7 * 24 * 60 * 60 * 1000),
    );
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const nowTs = Date.now();
    const [markets, summaryRows] = await Promise.all([
      ctx.db.query("markets").collect(),
      ctx.db.query("market_summaries").collect(),
    ]);
    const summarySlugs = new Set(summaryRows.map((summary) => summary.marketSlug));

    return markets
      .filter((market) =>
        shouldFinalizeMissingSummary(market, {
          graceMs,
          hasSummary: summarySlugs.has(market.slug),
          nowTs,
        }),
      )
      .sort((a, b) => b.windowEndTs - a.windowEndTs)
      .slice(0, limit)
      .map((market) => market.slug);
  },
});

export const reconcileStaleActiveMarketsAndMissingSummaries = internalAction({
  args: {
    force: v.optional(v.boolean()),
    missingSummaryGraceMs: v.optional(v.number()),
    missingSummaryLimit: v.optional(v.number()),
    staleGraceMs: v.optional(v.number()),
    staleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staleSlugs = await ctx.runQuery(
      internal.internal.repair.listStaleActiveMarketSlugs,
      {
        graceMs: args.staleGraceMs ?? DEFAULT_STALE_ACTIVE_GRACE_MS,
        limit: args.staleLimit ?? 100,
      },
    );
    const staleRepair =
      staleSlugs.length > 0
        ? await ctx.runMutation(
            internal.internal.repair.markStaleActiveMarketsInactive,
            {
              nowTs: Date.now(),
              slugs: staleSlugs,
            },
          )
        : {
            repaired: 0,
            repairedSlugs: [],
          };
    const missingSummarySlugs = await ctx.runQuery(
      internal.internal.repair.listMissingSummarySlugs,
      {
        graceMs: args.missingSummaryGraceMs ?? DEFAULT_MISSING_SUMMARY_GRACE_MS,
        limit: args.missingSummaryLimit ?? 100,
      },
    );
    const summaryRepair =
      missingSummarySlugs.length > 0
        ? await ctx.runMutation(internal.internal.finalize.finalizeMarketsBySlug, {
            force: args.force ?? false,
            slugs: missingSummarySlugs,
          })
        : {
            finalized: 0,
            results: [],
            scanned: 0,
            skipped: 0,
          };

    console.log("[repair] reconciliation summary", {
      missingSummaryCandidates: missingSummarySlugs.length,
      missingSummaryFinalized: summaryRepair.finalized,
      staleActiveCandidates: staleSlugs.length,
      staleActiveRepaired: staleRepair.repaired,
    });

    return {
      staleRepair: {
        candidateSlugs: staleSlugs.length,
        ...staleRepair,
      },
      summaryRepair: {
        candidateSlugs: missingSummarySlugs.length,
        ...summaryRepair,
      },
    };
  },
});
