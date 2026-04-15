import { query } from "./_generated/server";
import { v } from "convex/values";

export const getByMarketSlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("market_summaries")
      .withIndex("by_marketSlug", (q) => q.eq("marketSlug", args.slug))
      .unique();
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const summaries = await ctx.db
      .query("market_summaries")
      .withIndex("by_windowStartTs")
      .order("desc")
      .take(limit);

    return summaries;
  },
});
