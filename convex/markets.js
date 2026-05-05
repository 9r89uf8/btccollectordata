import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  CRYPTO_ASSETS,
  normalizeCryptoAssets,
} from "../packages/shared/src/ingest.js";

const ACTIVE_WINDOW_GRACE_MS = 60 * 1000;
const ACTIVE_WINDOW_LOOKAHEAD_MS = 10 * 60 * 1000;
const EXPECTED_BTC_5M_MARKETS_PER_DAY = 288;
const cryptoAssetValue = v.union(v.literal("btc"), v.literal("eth"));
const archiveStatusValue = v.union(
  v.literal("past"),
  v.literal("resolved"),
  v.literal("all"),
);

function getUtcDayKey(ts) {
  if (!Number.isFinite(ts)) {
    return "unknown";
  }

  return new Date(ts).toISOString().slice(0, 10);
}

function getMarketAsset(market) {
  return market.asset ?? CRYPTO_ASSETS.BTC;
}

function isMarketAsset(market, asset) {
  return getMarketAsset(market) === asset;
}

function getRequestedAssets(assets, fallback = [CRYPTO_ASSETS.BTC]) {
  return new Set(normalizeCryptoAssets(assets, fallback));
}

function getActiveSortPriority(market, nowTs) {
  if (market.windowStartTs <= nowTs && nowTs < market.windowEndTs) {
    return 0;
  }

  if (market.windowStartTs > nowTs) {
    return 1;
  }

  return 2;
}

function sortActiveMarkets(markets, nowTs) {
  return [...markets].sort((a, b) => {
    const priorityDelta =
      getActiveSortPriority(a, nowTs) - getActiveSortPriority(b, nowTs);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (getActiveSortPriority(a, nowTs) === 1) {
      return a.windowStartTs - b.windowStartTs;
    }

    return b.windowStartTs - a.windowStartTs;
  });
}

export const listActiveBtc5m = query({
  args: {},
  handler: async (ctx) => {
    return await listActiveMarketsByAssets(ctx, [CRYPTO_ASSETS.BTC]);
  },
});

async function listActiveMarketsByAssets(ctx, assets) {
  const nowTs = Date.now();
  const requestedAssets = getRequestedAssets(assets);
  const markets = await ctx.db
    .query("markets")
    .withIndex("by_active_windowStartTs", (q) =>
      q.eq("active", true).lte("windowStartTs", nowTs + ACTIVE_WINDOW_LOOKAHEAD_MS),
    )
    .collect();

  return sortActiveMarkets(
    markets.filter(
      (market) =>
        requestedAssets.has(getMarketAsset(market)) &&
        market.windowEndTs >= nowTs - ACTIVE_WINDOW_GRACE_MS,
    ),
    nowTs,
  );
}

export const listActiveCrypto5m = query({
  args: {
    assets: v.optional(v.array(cryptoAssetValue)),
  },
  handler: async (ctx, args) => {
    return await listActiveMarketsByAssets(ctx, args.assets ?? [CRYPTO_ASSETS.BTC]);
  },
});

export const listRecentBtc5m = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 12, 50));

    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .take(limit * 4);

    return rows.filter((market) => isMarketAsset(market, CRYPTO_ASSETS.BTC)).slice(0, limit);
  },
});

export const listRecentCrypto5m = query({
  args: {
    assets: v.optional(v.array(cryptoAssetValue)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 12, 50));
    const requestedAssets = getRequestedAssets(args.assets, [
      CRYPTO_ASSETS.BTC,
      CRYPTO_ASSETS.ETH,
    ]);
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .take(limit * 4);

    return rows
      .filter((market) => requestedAssets.has(getMarketAsset(market)))
      .slice(0, limit);
  },
});

export const listCountsByDay = query({
  args: {
    limitDays: v.optional(v.number()),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limitDays = Math.max(1, Math.min(args.limitDays ?? 14, 60));
    const scanLimit = Math.max(
      limitDays * EXPECTED_BTC_5M_MARKETS_PER_DAY,
      Math.min(args.scanLimit ?? limitDays * 340, 20_000),
    );
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .take(scanLimit);
    const byDay = new Map();

    for (const market of rows.filter((row) => isMarketAsset(row, CRYPTO_ASSETS.BTC))) {
      const day = getUtcDayKey(market.windowStartTs);
      const existing =
        byDay.get(day) ?? {
          closed: 0,
          count: 0,
          day,
          expected: EXPECTED_BTC_5M_MARKETS_PER_DAY,
          firstWindowStartTs: market.windowStartTs,
          resolved: 0,
          active: 0,
          lastWindowStartTs: market.windowStartTs,
        };

      existing.count += 1;
      existing.active += market.active ? 1 : 0;
      existing.closed += market.closed ? 1 : 0;
      existing.resolved += market.resolved ? 1 : 0;
      existing.firstWindowStartTs = Math.min(
        existing.firstWindowStartTs,
        market.windowStartTs,
      );
      existing.lastWindowStartTs = Math.max(
        existing.lastWindowStartTs,
        market.windowStartTs,
      );
      byDay.set(day, existing);
    }

    return [...byDay.values()]
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, limitDays)
      .map((row) => ({
        ...row,
        missing: Math.max(row.expected - row.count, 0),
        overExpected: Math.max(row.count - row.expected, 0),
        pctExpected: row.expected > 0 ? row.count / row.expected : null,
      }));
  },
});

export const listArchiveBtc5m = query({
  args: {
    status: v.optional(archiveStatusValue),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "past";

    if (status === "past") {
      const result = await ctx.db
        .query("markets")
        .withIndex("by_active_windowStartTs", (q) => q.eq("active", false))
        .order("desc")
        .paginate(args.paginationOpts);

      return {
        ...result,
        page: result.page.filter((market) => isMarketAsset(market, CRYPTO_ASSETS.BTC)),
      };
    }

    if (status === "resolved") {
      const result = await ctx.db
        .query("markets")
        .withIndex("by_resolved_windowEndTs", (q) => q.eq("resolved", true))
        .order("desc")
        .paginate(args.paginationOpts);

      return {
        ...result,
        page: result.page.filter((market) => isMarketAsset(market, CRYPTO_ASSETS.BTC)),
      };
    }

    const result = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.filter((market) => isMarketAsset(market, CRYPTO_ASSETS.BTC)),
    };
  },
});

export const listArchiveCrypto5m = query({
  args: {
    status: v.optional(archiveStatusValue),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "past";

    if (status === "past") {
      return await ctx.db
        .query("markets")
        .withIndex("by_active_windowStartTs", (q) => q.eq("active", false))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (status === "resolved") {
      return await ctx.db
        .query("markets")
        .withIndex("by_resolved_windowEndTs", (q) => q.eq("resolved", true))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const getAdjacentBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const market = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!market) {
      return {
        next: null,
        previous: null,
      };
    }

    const asset = getMarketAsset(market);
    let previous = null;
    let previousCursor = market.windowStartTs;
    let next = null;
    let nextCursor = market.windowStartTs;

    for (let scan = 0; scan < 5 && !previous; scan += 1) {
      const page = await ctx.db
        .query("markets")
        .withIndex("by_windowStartTs", (q) => q.lt("windowStartTs", previousCursor))
        .order("desc")
        .take(50);

      previous = page.find((candidate) => getMarketAsset(candidate) === asset) ?? null;
      previousCursor = page[page.length - 1]?.windowStartTs ?? previousCursor;

      if (page.length < 50) {
        break;
      }
    }

    for (let scan = 0; scan < 5 && !next; scan += 1) {
      const page = await ctx.db
        .query("markets")
        .withIndex("by_windowStartTs", (q) => q.gt("windowStartTs", nextCursor))
        .order("asc")
        .take(50);

      next = page.find((candidate) => getMarketAsset(candidate) === asset) ?? null;
      nextCursor = page[page.length - 1]?.windowStartTs ?? nextCursor;

      if (page.length < 50) {
        break;
      }
    }

    return {
      next,
      previous,
    };
  },
});

export const seedDemoMarket = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = args.slug ?? "btc-demo-market";
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("markets", {
      slug,
      asset: CRYPTO_ASSETS.BTC,
      marketId: `demo-${slug}`,
      conditionId: null,
      eventId: null,
      question: "Bootstrap demo market for verifying Convex wiring",
      title: "BTC demo market",
      outcomeLabels: {
        upLabel: "Up",
        downLabel: "Down",
      },
      tokenIdsByOutcome: {
        up: "demo-up-token",
        down: "demo-down-token",
      },
      createdAt: now,
      acceptingOrdersAt: now,
      windowStartTs: now,
      windowEndTs: now + 5 * 60 * 1000,
      closedAt: null,
      resolvedAt: null,
      active: true,
      closed: false,
      resolved: false,
      winningOutcome: null,
      resolutionSourceUrl: null,
      priceToBeatOfficial: null,
      priceToBeatDerived: null,
      closeReferencePriceOfficial: null,
      closeReferencePriceDerived: null,
      captureMode: "unknown",
      dataQuality: "unknown",
      notes: "Temporary demo market inserted during bootstrap.",
      createdAtDb: now,
      updatedAtDb: now,
    });
  },
});

export const clearDemoMarket = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slug = args.slug ?? "btc-demo-market";
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
