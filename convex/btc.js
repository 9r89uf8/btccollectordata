import { query } from "./_generated/server";
import {
  BTC_SOURCES,
  BTC_SYMBOLS,
  ETH_SYMBOLS,
} from "../packages/shared/src/ingest.js";

async function getLatestChainlinkTick(ctx, symbol) {
  const latestTick = await ctx.db
    .query("btc_ticks")
    .withIndex("by_source_symbol_ts", (q) =>
      q.eq("source", BTC_SOURCES.CHAINLINK).eq("symbol", symbol),
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
}

export const getLatestChainlinkBtc = query({
  args: {},
  handler: async (ctx) => {
    return await getLatestChainlinkTick(ctx, BTC_SYMBOLS.CHAINLINK_BTC_USD);
  },
});

export const getLatestChainlinkEth = query({
  args: {},
  handler: async (ctx) => {
    return await getLatestChainlinkTick(ctx, ETH_SYMBOLS.CHAINLINK_ETH_USD);
  },
});
