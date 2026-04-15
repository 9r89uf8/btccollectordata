import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { CAPTURE_MODES } from "../../packages/shared/src/market.js";
import { BTC_SOURCES, BTC_SYMBOLS } from "../../packages/shared/src/ingest.js";
import { getSnapshotWritePolicy } from "../../packages/shared/src/snapshot.js";
import { syncActiveMarketStartReferences } from "./btcReferences.js";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

const rawEventValidator = v.object({
  marketSlug: v.string(),
  marketId: v.string(),
  conditionId: nullableString,
  assetId: v.string(),
  outcome: v.union(v.literal("up"), v.literal("down")),
  ts: v.number(),
  eventType: v.union(
    v.literal("book"),
    v.literal("price_change"),
    v.literal("tick_size_change"),
    v.literal("last_trade_price"),
    v.literal("best_bid_ask"),
    v.literal("new_market"),
    v.literal("market_resolved"),
  ),
  eventHash: nullableString,
  payload: v.any(),
  ingestedAt: v.number(),
  collectorSeq: v.number(),
});

const snapshotValidator = v.object({
  marketSlug: v.string(),
  marketId: v.string(),
  ts: v.number(),
  secondBucket: v.number(),
  secondsFromWindowStart: v.number(),
  phase: v.union(v.literal("pre"), v.literal("live"), v.literal("post")),
  upBid: nullableNumber,
  upAsk: nullableNumber,
  upMid: nullableNumber,
  upLast: nullableNumber,
  upDisplayed: nullableNumber,
  upSpread: nullableNumber,
  upDepthBidTop: nullableNumber,
  upDepthAskTop: nullableNumber,
  downBid: nullableNumber,
  downAsk: nullableNumber,
  downMid: nullableNumber,
  downLast: nullableNumber,
  downDisplayed: nullableNumber,
  downSpread: nullableNumber,
  downDepthBidTop: nullableNumber,
  downDepthAskTop: nullableNumber,
  displayRuleUsed: v.union(
    v.literal("midpoint"),
    v.literal("last_trade"),
    v.literal("unknown"),
  ),
  btcChainlink: nullableNumber,
  btcBinance: nullableNumber,
  marketImbalance: nullableNumber,
  sourceQuality: v.union(
    v.literal("good"),
    v.literal("stale_book"),
    v.literal("stale_btc"),
    v.literal("gap"),
  ),
  writtenAt: v.number(),
});

const btcTickValidator = v.object({
  ts: v.number(),
  source: v.union(v.literal("chainlink"), v.literal("binance")),
  symbol: v.string(),
  price: v.number(),
  receivedAt: v.number(),
  isSnapshot: v.boolean(),
});

function dedupeRawEvents(events) {
  const seen = new Set();
  const deduped = [];

  for (const event of events) {
    const key = [
      event.marketSlug,
      event.assetId,
      event.ts,
      event.eventType,
      event.eventHash ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}

function dedupeBtcTicks(ticks) {
  const seen = new Set();
  const deduped = [];

  for (const tick of ticks) {
    const key = `${tick.source}:${tick.symbol}:${tick.ts}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(tick);
  }

  return deduped;
}

function choosePreferredSnapshot(existing, candidate) {
  if (!existing) {
    return candidate;
  }

  if (candidate.ts > existing.ts) {
    return candidate;
  }

  if (candidate.ts < existing.ts) {
    return existing;
  }

  return (candidate.writtenAt ?? candidate.ts) >= (existing.writtenAt ?? existing.ts)
    ? candidate
    : existing;
}

function dedupeSnapshots(snapshots) {
  const byKey = new Map();

  for (const snapshot of snapshots) {
    const key = `${snapshot.marketSlug}:${snapshot.secondBucket}`;
    const existing = byKey.get(key);
    byKey.set(key, choosePreferredSnapshot(existing, snapshot));
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.ts !== b.ts) {
      return a.ts - b.ts;
    }

    return a.marketSlug.localeCompare(b.marketSlug);
  });
}

export const insertRawEvents = internalMutation({
  args: {
    rawEvents: v.array(rawEventValidator),
  },
  handler: async (ctx, args) => {
    const rawEvents = dedupeRawEvents(args.rawEvents);
    let inserted = 0;

    for (const event of rawEvents) {
      const existing = await ctx.db
        .query("market_events_raw")
        .withIndex("by_assetId_ts", (q) =>
          q.eq("assetId", event.assetId).eq("ts", event.ts),
        )
        .collect();

      const duplicate = existing.some(
        (candidate) =>
          candidate.marketSlug === event.marketSlug &&
          candidate.eventType === event.eventType &&
          candidate.eventHash === event.eventHash,
      );

      if (duplicate) {
        continue;
      }

      await ctx.db.insert("market_events_raw", event);
      inserted += 1;
    }

    return {
      inserted,
      skipped: args.rawEvents.length - inserted,
    };
  },
});

export const upsertSnapshots = internalMutation({
  args: {
    captureMode: v.optional(
      v.union(
        v.literal("poll"),
        v.literal("ws"),
        v.literal("backfill"),
        v.literal("unknown"),
      ),
    ),
    snapshots: v.array(snapshotValidator),
  },
  handler: async (ctx, args) => {
    const snapshots = dedupeSnapshots(args.snapshots);
    let inserted = 0;
    let updated = 0;
    let skipped = args.snapshots.length - snapshots.length;
    const touchedMarketSlugs = new Set();
    const captureMode = args.captureMode ?? CAPTURE_MODES.POLL;

    for (const snapshot of snapshots) {
      touchedMarketSlugs.add(snapshot.marketSlug);
      const existing = await ctx.db
        .query("market_snapshots_1s")
        .withIndex("by_marketSlug_secondBucket", (q) =>
          q.eq("marketSlug", snapshot.marketSlug).eq("secondBucket", snapshot.secondBucket),
        )
        .first();

      if (!existing) {
        await ctx.db.insert("market_snapshots_1s", snapshot);
        inserted += 1;
        continue;
      }

      const writePolicy = getSnapshotWritePolicy(snapshot.ts, Date.now());

      if (!writePolicy.canOverwrite) {
        skipped += 1;
        continue;
      }

      await ctx.db.patch(existing._id, snapshot);
      updated += 1;
    }

    for (const marketSlug of touchedMarketSlugs) {
      const market = await ctx.db
        .query("markets")
        .withIndex("by_slug", (q) => q.eq("slug", marketSlug))
        .unique();

      if (!market || market.captureMode === captureMode) {
        continue;
      }

      await ctx.db.patch(market._id, {
        captureMode,
        updatedAtDb: Date.now(),
      });
    }

    return {
      inserted,
      updated,
      skipped,
    };
  },
});

export const insertBtcTicks = internalMutation({
  args: {
    btcTicks: v.array(btcTickValidator),
  },
  handler: async (ctx, args) => {
    const btcTicks = dedupeBtcTicks(args.btcTicks);
    let inserted = 0;
    const nowTs = Date.now();

    for (const tick of btcTicks) {
      const existing = await ctx.db
        .query("btc_ticks")
        .withIndex("by_source_symbol_ts", (q) =>
          q.eq("source", tick.source).eq("symbol", tick.symbol).eq("ts", tick.ts),
        )
        .first();

      if (existing) {
        continue;
      }

      await ctx.db.insert("btc_ticks", tick);
      inserted += 1;
    }

    const hasChainlinkTicks = btcTicks.some(
      (tick) =>
        tick.source === BTC_SOURCES.CHAINLINK &&
        tick.symbol === BTC_SYMBOLS.CHAINLINK_BTC_USD,
    );
    const startReferenceSync = hasChainlinkTicks
      ? await syncActiveMarketStartReferences(ctx, { nowTs })
      : { scanned: 0, updated: 0 };

    return {
      inserted,
      startReferenceSync,
      skipped: args.btcTicks.length - inserted,
    };
  },
});

export const refreshActivePriceToBeatDerived = internalMutation({
  args: {
    nowTs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await syncActiveMarketStartReferences(ctx, {
      nowTs: args.nowTs ?? Date.now(),
    });
  },
});
