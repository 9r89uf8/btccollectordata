import { BTC_SOURCES, BTC_SYMBOLS } from "../../packages/shared/src/ingest.js";

const DEFAULT_REFERENCE_MAX_DISTANCE_MS = 30 * 1000;
const ACTIVE_REFERENCE_LOOKBACK_MS = 15 * 60 * 1000;

function chooseNearestTick(beforeTick, afterTick, targetTs, preferDirection) {
  if (!beforeTick) {
    return afterTick ?? null;
  }

  if (!afterTick) {
    return beforeTick;
  }

  const beforeDistance = Math.abs(targetTs - beforeTick.ts);
  const afterDistance = Math.abs(afterTick.ts - targetTs);

  if (beforeDistance < afterDistance) {
    return beforeTick;
  }

  if (afterDistance < beforeDistance) {
    return afterTick;
  }

  return preferDirection === "after" ? afterTick : beforeTick;
}

function isTickWithinDistance(tick, targetTs, maxDistanceMs) {
  if (!tick || maxDistanceMs == null) {
    return Boolean(tick);
  }

  return Math.abs(tick.ts - targetTs) <= maxDistanceMs;
}

export async function getNearestChainlinkTick(
  ctx,
  targetTs,
  preferDirection,
  { maxDistanceMs = null } = {},
) {
  const [beforeTick, afterTick] = await Promise.all([
    ctx.db
      .query("btc_ticks")
      .withIndex("by_source_symbol_ts", (q) =>
        q
          .eq("source", BTC_SOURCES.CHAINLINK)
          .eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD)
          .lte("ts", targetTs),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("btc_ticks")
      .withIndex("by_source_symbol_ts", (q) =>
        q
          .eq("source", BTC_SOURCES.CHAINLINK)
          .eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD)
          .gte("ts", targetTs),
      )
      .first(),
  ]);

  const nearest = chooseNearestTick(beforeTick, afterTick, targetTs, preferDirection);

  return isTickWithinDistance(nearest, targetTs, maxDistanceMs)
    ? nearest
    : null;
}

export async function getBoundaryReferences(ctx, market) {
  const [startTick, endTick] = await Promise.all([
    getNearestChainlinkTick(ctx, market.windowStartTs, "before"),
    getNearestChainlinkTick(ctx, market.windowEndTs, "after"),
  ]);

  return {
    end: endTick
      ? {
          chainlinkPrice: endTick.price,
          source: "tick",
          ts: endTick.ts,
        }
      : null,
    start: startTick
      ? {
          chainlinkPrice: startTick.price,
          source: "tick",
          ts: startTick.ts,
        }
      : null,
  };
}

export async function syncActiveMarketStartReferences(
  ctx,
  {
    lookbackMs = ACTIVE_REFERENCE_LOOKBACK_MS,
    maxDistanceMs = DEFAULT_REFERENCE_MAX_DISTANCE_MS,
    nowTs,
  },
) {
  const lowerBoundTs = nowTs - lookbackMs;
  const markets = await ctx.db
    .query("markets")
    .withIndex("by_active_windowStartTs", (q) =>
      q.eq("active", true).gte("windowStartTs", lowerBoundTs).lte("windowStartTs", nowTs),
    )
    .collect();

  let updated = 0;

  for (const market of markets) {
    const startTick = await getNearestChainlinkTick(ctx, market.windowStartTs, "before", {
      maxDistanceMs,
    });

    if (!startTick || market.priceToBeatDerived === startTick.price) {
      continue;
    }

    await ctx.db.patch(market._id, {
      priceToBeatDerived: startTick.price,
      updatedAtDb: nowTs,
    });
    updated += 1;
  }

  return {
    scanned: markets.length,
    updated,
  };
}
