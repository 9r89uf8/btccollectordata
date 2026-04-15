import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCollectorHealth = query({
  args: {
    collectorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.collectorName) {
      const health = await ctx.db
        .query("collector_health")
        .withIndex("by_collectorName", (q) => q.eq("collectorName", args.collectorName))
        .first();

      return health ?? null;
    }

    const rows = await ctx.db.query("collector_health").collect();

    if (rows.length === 0) {
      return null;
    }

    return [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  },
});
