"use node";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ANALYTICS_VERSION } from "../../packages/shared/src/marketAnalytics.js";
import {
  DASHBOARD_ROLLUP_KEY,
  DASHBOARD_ROLLUP_VERSION,
  buildAnalyticsDashboard,
} from "../../packages/shared/src/analyticsDashboard.js";
import { STABILITY_ANALYTICS_VERSION } from "../../packages/shared/src/marketStabilityAnalytics.js";

const MARKET_COUNT_ROLLUP_DAYS = 14;
const RECENT_ANALYTICS_ROLLUP_ROWS = 2500;
const RECENT_STABILITY_ROLLUP_ROWS = 2500;
const FULL_ANALYTICS_ROLLUP_ROWS = 6000;
const FULL_STABILITY_ROLLUP_ROWS = 6000;
const rollupModeValue = v.union(v.literal("recent"), v.literal("full"));

function getRefreshConfig(mode) {
  if (mode === "full") {
    return {
      analyticsMaxRows: FULL_ANALYTICS_ROLLUP_ROWS,
      analyticsPageLimit: 500,
      mode,
      stabilityMaxRows: FULL_STABILITY_ROLLUP_ROWS,
      stabilityPageLimit: 300,
    };
  }

  return {
    analyticsMaxRows: RECENT_ANALYTICS_ROLLUP_ROWS,
    analyticsPageLimit: 500,
    mode: "recent",
    stabilityMaxRows: RECENT_STABILITY_ROLLUP_ROWS,
    stabilityPageLimit: 150,
  };
}

function buildRollupFromRows({
  analyticsRows,
  marketCountsByDay,
  mode,
  nowTs,
  rowLimits,
  stabilityRows,
}) {
  const dashboard = buildAnalyticsDashboard({
    analyticsRows,
    computedAt: nowTs,
    stabilityRows,
  });

  return {
    analyticsVersion: ANALYTICS_VERSION,
    computedAt: dashboard.computedAt,
    key: DASHBOARD_ROLLUP_KEY,
    rollupVersion: DASHBOARD_ROLLUP_VERSION,
    stabilityAnalyticsVersion: STABILITY_ANALYTICS_VERSION,
    v1: {
      health: dashboard.health,
      leader: dashboard.leader,
    },
    v2: {
      stability: dashboard.stability,
    },
    v3: {
      hourly: dashboard.hourly,
      marketCountsByDay,
      rollupMode: mode,
      rowLimits,
    },
  };
}

async function collectRows(ctx, functionRef, { maxRows, pageLimit }) {
  const rows = [];
  let beforeWindowEndTs = undefined;

  for (
    let pageIndex = 0;
    pageIndex < 100 && rows.length < maxRows;
    pageIndex += 1
  ) {
    const page = await ctx.runQuery(functionRef, {
      beforeWindowEndTs,
      limit: Math.min(pageLimit, maxRows - rows.length),
    });

    rows.push(...page.rows);

    if (page.done || !page.nextBeforeWindowEndTs) {
      break;
    }

    beforeWindowEndTs = page.nextBeforeWindowEndTs;
  }

  return rows;
}

export const refreshNow = internalAction({
  args: {
    mode: v.optional(rollupModeValue),
  },
  handler: async (ctx, args) => {
    const nowTs = Date.now();
    const config = getRefreshConfig(args.mode ?? "recent");
    const [analyticsRows, stabilityRows, marketCountsByDay] = await Promise.all([
      collectRows(ctx, internal.internal.analyticsRollups.listAnalyticsPage, {
        maxRows: config.analyticsMaxRows,
        pageLimit: config.analyticsPageLimit,
      }),
      collectRows(ctx, internal.internal.analyticsRollups.listStabilityPage, {
        maxRows: config.stabilityMaxRows,
        pageLimit: config.stabilityPageLimit,
      }),
      ctx.runQuery(internal.internal.analyticsRollups.listMarketCountsByDay, {
        limitDays: MARKET_COUNT_ROLLUP_DAYS,
      }),
    ]);
    const rollup = buildRollupFromRows({
      analyticsRows,
      marketCountsByDay,
      mode: config.mode,
      nowTs,
      rowLimits: {
        analyticsRows: config.analyticsMaxRows,
        stabilityRows: config.stabilityMaxRows,
      },
      stabilityRows,
    });

    return await ctx.runMutation(internal.internal.analyticsRollups.writeRollup, {
      rollup,
    });
  },
});
