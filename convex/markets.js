import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ACTIVE_WINDOW_GRACE_MS = 60 * 1000;
const ACTIVE_WINDOW_LOOKAHEAD_MS = 10 * 60 * 1000;

function sortByWindowDesc(markets) {
  return [...markets].sort((a, b) => b.windowStartTs - a.windowStartTs);
}

function getActiveSortPriority(market, nowTs) {
  if (market.windowStartTs <= nowTs && nowTs < market.windowEndTs) {
    return 0;
  }

  if (market.windowStartTs > nowTs) {
    return 1;
  }

  return 2;
}

function sortActiveMarkets(markets, nowTs) {
  return [...markets].sort((a, b) => {
    const priorityDelta =
      getActiveSortPriority(a, nowTs) - getActiveSortPriority(b, nowTs);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (getActiveSortPriority(a, nowTs) === 1) {
      return a.windowStartTs - b.windowStartTs;
    }

    return b.windowStartTs - a.windowStartTs;
  });
}

export const listActiveBtc5m = query({
  args: {},
  handler: async (ctx) => {
    const nowTs = Date.now();
    const markets = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();

    return sortActiveMarkets(
      markets.filter(
        (market) =>
          market.windowEndTs >= nowTs - ACTIVE_WINDOW_GRACE_MS &&
          market.windowStartTs <= nowTs + ACTIVE_WINDOW_LOOKAHEAD_MS,
      ),
      nowTs,
    );
  },
});

export const listRecentBtc5m = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 12, 50));
    const markets = await ctx.db.query("markets").collect();

    return sortByWindowDesc(markets).slice(0, limit);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const seedDemoMarket = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = args.slug ?? "btc-demo-market";
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("markets", {
      slug,
      marketId: `demo-${slug}`,
      conditionId: null,
      eventId: null,
      question: "Bootstrap demo market for verifying Convex wiring",
      title: "BTC demo market",
      outcomeLabels: {
        upLabel: "Up",
        downLabel: "Down",
      },
      tokenIdsByOutcome: {
        up: "demo-up-token",
        down: "demo-down-token",
      },
      createdAt: now,
      acceptingOrdersAt: now,
      windowStartTs: now,
      windowEndTs: now + 5 * 60 * 1000,
      closedAt: null,
      resolvedAt: null,
      active: true,
      closed: false,
      resolved: false,
      winningOutcome: null,
      resolutionSourceUrl: null,
      priceToBeatOfficial: null,
      priceToBeatDerived: null,
      closeReferencePriceOfficial: null,
      closeReferencePriceDerived: null,
      captureMode: "unknown",
      dataQuality: "unknown",
      notes: "Temporary demo market inserted during bootstrap.",
      createdAtDb: now,
      updatedAtDb: now,
    });
  },
});

export const clearDemoMarket = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slug = args.slug ?? "btc-demo-market";
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
