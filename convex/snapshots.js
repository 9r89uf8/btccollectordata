import { query } from "./_generated/server";
import { v } from "convex/values";

export const getLatestByMarketSlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("market_snapshots_1s")
      .withIndex("by_marketSlug_ts", (q) => q.eq("marketSlug", args.slug))
      .order("desc")
      .first();
  },
});

export const listByMarketSlug = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 120, 1200));
    const snapshots = await ctx.db
      .query("market_snapshots_1s")
      .withIndex("by_marketSlug_ts", (q) => q.eq("marketSlug", args.slug))
      .order("desc")
      .take(limit);

    return [...snapshots].reverse();
  },
});

export const listLatestByMarketSlugs = query({
  args: {
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const uniqueSlugs = [...new Set(args.slugs)].slice(0, 50);
    const latestSnapshots = [];

    for (const slug of uniqueSlugs) {
      const snapshot = await ctx.db
        .query("market_snapshots_1s")
        .withIndex("by_marketSlug_ts", (q) => q.eq("marketSlug", slug))
        .order("desc")
        .first();

      if (snapshot) {
        latestSnapshots.push(snapshot);
      }
    }

    return latestSnapshots;
  },
});
