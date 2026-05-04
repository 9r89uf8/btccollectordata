import { query } from "./_generated/server";
import { v } from "convex/values";

const REPLAY_SNAPSHOT_BUFFER_MS = 30 * 1000;
const FINAL_FORENSICS_KEYS = [
  "btcBinanceReceivedAgeMs",
  "btcBinanceReceivedAt",
  "btcBinanceTs",
  "btcChainlinkReceivedAgeMs",
  "btcChainlinkReceivedAt",
  "btcChainlinkTs",
  "downBookAgeMs",
  "downBookTs",
  "downLastAgeMs",
  "downLastTs",
  "upBookAgeMs",
  "upBookTs",
  "upLastAgeMs",
  "upLastTs",
];

function compactOptionalFields(source, keys) {
  const fields = {};

  for (const key of keys) {
    if (source[key] !== undefined) {
      fields[key] = source[key];
    }
  }

  return fields;
}

function compactReplaySnapshot(snapshot) {
  return {
    _id: snapshot._id,
    btcBinance: snapshot.btcBinance,
    btcChainlink: snapshot.btcChainlink,
    displayRuleUsed: snapshot.displayRuleUsed,
    downAsk: snapshot.downAsk,
    downBid: snapshot.downBid,
    downDepthBidTop: snapshot.downDepthBidTop,
    downDisplayed: snapshot.downDisplayed,
    downSpread: snapshot.downSpread,
    marketId: snapshot.marketId,
    marketImbalance: snapshot.marketImbalance,
    marketSlug: snapshot.marketSlug,
    phase: snapshot.phase,
    secondBucket: snapshot.secondBucket,
    secondsFromWindowStart: snapshot.secondsFromWindowStart,
    sourceQuality: snapshot.sourceQuality,
    ts: snapshot.ts,
    upAsk: snapshot.upAsk,
    upBid: snapshot.upBid,
    upDepthBidTop: snapshot.upDepthBidTop,
    upDisplayed: snapshot.upDisplayed,
    upSpread: snapshot.upSpread,
    writtenAt: snapshot.writtenAt,
    ...compactOptionalFields(snapshot, FINAL_FORENSICS_KEYS),
  };
}

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

export const listReplayByMarketSlug = query({
  args: {
    slug: v.string(),
    windowEndTs: v.number(),
    windowStartTs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 420, 600));
    const fromBucket = args.windowStartTs - REPLAY_SNAPSHOT_BUFFER_MS;
    const toBucket = args.windowEndTs + REPLAY_SNAPSHOT_BUFFER_MS;
    const snapshots = await ctx.db
      .query("market_snapshots_1s")
      .withIndex("by_marketSlug_secondBucket", (q) =>
        q
          .eq("marketSlug", args.slug)
          .gte("secondBucket", fromBucket)
          .lte("secondBucket", toBucket),
      )
      .order("desc")
      .take(limit);

    return [...snapshots].reverse().map(compactReplaySnapshot);
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
