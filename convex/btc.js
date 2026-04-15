import { query } from "./_generated/server";
import { BTC_SOURCES, BTC_SYMBOLS } from "../packages/shared/src/ingest.js";

export const getLatestChainlinkBtc = query({
  args: {},
  handler: async (ctx) => {
    const latestTick = await ctx.db
      .query("btc_ticks")
      .withIndex("by_source_symbol_ts", (q) =>
        q.eq("source", BTC_SOURCES.CHAINLINK).eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD),
      )
      .order("desc")
      .first();

    if (!latestTick) {
      return null;
    }

    const now = Date.now();

    return {
      ...latestTick,
      ageMs: now - latestTick.receivedAt,
      stale: now - latestTick.receivedAt > 30000,
    };
  },
});
