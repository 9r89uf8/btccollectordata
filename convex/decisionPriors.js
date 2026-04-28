import { query } from "./_generated/server";
import { DASHBOARD_ROLLUP_KEY } from "../packages/shared/src/analyticsDashboard.js";
import { buildDecisionPriorsFromRollup } from "../packages/shared/src/decisionPriors.js";

async function getRollup(ctx) {
  return await ctx.db
    .query("analytics_dashboard_rollups")
    .withIndex("by_key", (q) => q.eq("key", DASHBOARD_ROLLUP_KEY))
    .unique();
}

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const rollup = await getRollup(ctx);

    return rollup ? buildDecisionPriorsFromRollup(rollup) : null;
  },
});
