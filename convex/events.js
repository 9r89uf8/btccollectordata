import { query } from "./_generated/server";
import { v } from "convex/values";

export const listByMarketSlug = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
    const rows = await ctx.db
      .query("market_events_raw")
      .withIndex("by_marketSlug_ts", (q) => q.eq("marketSlug", args.slug))
      .order("desc")
      .take(limit);

    return rows;
  },
});
