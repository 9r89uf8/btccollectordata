import { query } from "./_generated/server";
import { v } from "convex/values";

import {
  DASHBOARD_ROLLUP_KEY,
  buildAnalyticsDashboard,
} from "../packages/shared/src/analyticsDashboard.js";

async function getRollup(ctx) {
  return await ctx.db
    .query("analytics_dashboard_rollups")
    .withIndex("by_key", (q) => q.eq("key", DASHBOARD_ROLLUP_KEY))
    .unique();
}

function fromRollup(rollup) {
  if (!rollup) {
    return {
      ...buildAnalyticsDashboard({
        analyticsRows: [],
        stabilityRows: [],
      }),
      marketCountsByDay: [],
    };
  }

  return {
    computedAt: rollup.computedAt,
    health: rollup.v1?.health,
    hourly: rollup.v3?.hourly,
    leader: rollup.v1?.leader,
    marketCountsByDay: rollup.v3?.marketCountsByDay ?? [],
    stability: rollup.v2?.stability,
  };
}

export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    return fromRollup(await getRollup(ctx));
  },
});

export const getDatasetHealth = query({
  args: {},
  handler: async (ctx) => {
    return fromRollup(await getRollup(ctx)).health;
  },
});

export const listExcludedMarkets = query({
  args: {
    beforeWindowStartTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const scanLimit = limit * 4;
    const page = [];
    let cursor = args.beforeWindowStartTs ?? null;
    let done = false;
    let cursorRow = null;

    for (let scanPage = 0; scanPage < 10 && page.length < limit; scanPage += 1) {
      const baseQuery = ctx.db.query("market_analytics");
      const indexedQuery =
        cursor == null
          ? baseQuery.withIndex("by_windowStartTs")
          : baseQuery.withIndex("by_windowStartTs", (q) =>
              q.lt("windowStartTs", cursor),
            );
      const rows = await indexedQuery.order("desc").take(scanLimit);

      if (rows.length === 0) {
        done = true;
        break;
      }

      for (const row of rows) {
        if (
          Number.isFinite(row.windowStartTs) &&
          row.excludedReasons.length > 0
        ) {
          page.push(row);

          if (page.length >= limit) {
            break;
          }
        }
      }

      cursorRow = rows[rows.length - 1];
      cursor = Number.isFinite(cursorRow?.windowStartTs)
        ? cursorRow.windowStartTs
        : null;

      if (rows.length < scanLimit || cursor === null) {
        done = true;
        break;
      }
    }

    const nextBeforeWindowStartTs = Number.isFinite(cursorRow?.windowStartTs)
      ? cursorRow.windowStartTs
      : null;

    return {
      done,
      nextBeforeWindowStartTs: done ? null : nextBeforeWindowStartTs,
      rows: page.map((row) => ({
        _id: row._id,
        excludedReasons: row.excludedReasons,
        marketSlug: row.marketSlug,
        summaryDataQuality: row.summaryDataQuality,
        windowStartTs: row.windowStartTs,
      })),
    };
  },
});

export const getLeaderAndDistance = query({
  args: {},
  handler: async (ctx) => {
    return fromRollup(await getRollup(ctx)).leader;
  },
});
