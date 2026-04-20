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

    return await ctx.db
      .query("collector_health")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
  },
});
