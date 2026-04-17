import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullable = (value) => v.union(value, v.null());
const optionalNullable = (value) => v.optional(v.union(value, v.null()));
const outcomeValue = v.union(v.literal("up"), v.literal("down"));
const captureModeValue = v.union(
  v.literal("poll"),
  v.literal("ws"),
  v.literal("backfill"),
  v.literal("unknown"),
);
const marketQualityValue = v.union(
  v.literal("good"),
  v.literal("partial"),
  v.literal("gap"),
  v.literal("unknown"),
);
const snapshotQualityValue = v.union(
  v.literal("good"),
  v.literal("stale_book"),
  v.literal("stale_btc"),
  v.literal("gap"),
);

export default defineSchema({
  markets: defineTable({
    slug: v.string(),
    marketId: v.string(),
    conditionId: nullable(v.string()),
    eventId: nullable(v.string()),
    question: v.string(),
    title: nullable(v.string()),
    outcomeLabels: v.object({
      upLabel: v.string(),
      downLabel: v.string(),
    }),
    tokenIdsByOutcome: v.object({
      up: v.string(),
      down: v.string(),
    }),
    createdAt: nullable(v.number()),
    acceptingOrdersAt: nullable(v.number()),
    windowStartTs: v.number(),
    windowEndTs: v.number(),
    closedAt: nullable(v.number()),
    resolvedAt: nullable(v.number()),
    active: v.boolean(),
    closed: v.boolean(),
    resolved: v.boolean(),
    winningOutcome: nullable(outcomeValue),
    resolutionSourceUrl: nullable(v.string()),
    priceToBeatOfficial: nullable(v.number()),
    priceToBeatDerived: nullable(v.number()),
    closeReferencePriceOfficial: nullable(v.number()),
    closeReferencePriceDerived: nullable(v.number()),
    captureMode: captureModeValue,
    dataQuality: marketQualityValue,
    notes: nullable(v.string()),
    createdAtDb: v.number(),
    updatedAtDb: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_marketId", ["marketId"])
    .index("by_conditionId", ["conditionId"])
    .index("by_windowStartTs", ["windowStartTs"])
    .index("by_windowEndTs", ["windowEndTs"])
    .index("by_active_windowStartTs", ["active", "windowStartTs"])
    .index("by_resolved_windowEndTs", ["resolved", "windowEndTs"]),

  market_events_raw: defineTable({
    marketSlug: v.string(),
    marketId: v.string(),
    conditionId: nullable(v.string()),
    assetId: v.string(),
    outcome: outcomeValue,
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
    eventHash: nullable(v.string()),
    payload: v.any(),
    ingestedAt: v.number(),
    collectorSeq: v.number(),
  })
    .index("by_marketSlug_ts", ["marketSlug", "ts"])
    .index("by_assetId_ts", ["assetId", "ts"])
    .index("by_eventType_ts", ["eventType", "ts"]),

  market_snapshots_1s: defineTable({
    marketSlug: v.string(),
    marketId: v.string(),
    ts: v.number(),
    secondBucket: v.number(),
    secondsFromWindowStart: v.number(),
    phase: v.union(v.literal("pre"), v.literal("live"), v.literal("post")),
    upBid: nullable(v.number()),
    upAsk: nullable(v.number()),
    upMid: nullable(v.number()),
    upLast: nullable(v.number()),
    upDisplayed: nullable(v.number()),
    upSpread: nullable(v.number()),
    upDepthBidTop: nullable(v.number()),
    upDepthAskTop: nullable(v.number()),
    downBid: nullable(v.number()),
    downAsk: nullable(v.number()),
    downMid: nullable(v.number()),
    downLast: nullable(v.number()),
    downDisplayed: nullable(v.number()),
    downSpread: nullable(v.number()),
    downDepthBidTop: nullable(v.number()),
    downDepthAskTop: nullable(v.number()),
    displayRuleUsed: v.union(
      v.literal("midpoint"),
      v.literal("last_trade"),
      v.literal("unknown"),
    ),
    btcChainlink: nullable(v.number()),
    btcBinance: nullable(v.number()),
    marketImbalance: nullable(v.number()),
    sourceQuality: snapshotQualityValue,
    writtenAt: v.number(),
  })
    .index("by_marketSlug_secondBucket", ["marketSlug", "secondBucket"])
    .index("by_marketSlug_ts", ["marketSlug", "ts"]),

  btc_ticks: defineTable({
    ts: v.number(),
    source: v.union(v.literal("chainlink"), v.literal("binance")),
    symbol: v.string(),
    price: v.number(),
    receivedAt: v.number(),
    isSnapshot: v.boolean(),
  })
    .index("by_source_ts", ["source", "ts"])
    .index("by_source_symbol_ts", ["source", "symbol", "ts"])
    .index("by_symbol_ts", ["symbol", "ts"]),

  market_summaries: defineTable({
    marketSlug: v.string(),
    marketId: v.string(),
    windowStartTs: v.number(),
    windowEndTs: v.number(),
    resolvedOutcome: outcomeValue,
    dataQuality: optionalNullable(marketQualityValue),
    priceToBeatOfficial: nullable(v.number()),
    priceToBeatDerived: nullable(v.number()),
    closeReferencePriceOfficial: nullable(v.number()),
    closeReferencePriceDerived: nullable(v.number()),
    btcChainlinkAtStart: nullable(v.number()),
    btcChainlinkAtEnd: nullable(v.number()),
    btcBinanceAtStart: nullable(v.number()),
    btcBinanceAtEnd: nullable(v.number()),
    upDisplayedAtT0: nullable(v.number()),
    downDisplayedAtT0: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT0: optionalNullable(v.number()),
    upDisplayedAtT15: nullable(v.number()),
    downDisplayedAtT15: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT15: optionalNullable(v.number()),
    upDisplayedAtT30: nullable(v.number()),
    downDisplayedAtT30: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT30: optionalNullable(v.number()),
    upDisplayedAtT60: nullable(v.number()),
    downDisplayedAtT60: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT60: optionalNullable(v.number()),
    upDisplayedAtT120: nullable(v.number()),
    downDisplayedAtT120: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT120: optionalNullable(v.number()),
    upDisplayedAtT240: nullable(v.number()),
    downDisplayedAtT240: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT240: optionalNullable(v.number()),
    upDisplayedAtT295: nullable(v.number()),
    downDisplayedAtT295: optionalNullable(v.number()),
    btcDeltaFromAnchorAtT295: optionalNullable(v.number()),
    upMax: nullable(v.number()),
    upMin: nullable(v.number()),
    upRange: nullable(v.number()),
    upStdDev: nullable(v.number()),
    upMaxDrawdown: nullable(v.number()),
    firstTimeAbove60: nullable(v.number()),
    firstTimeAbove70: nullable(v.number()),
    firstTimeAbove80: nullable(v.number()),
    firstBtcSecureSecond: optionalNullable(v.number()),
    firstBtcWinningSideSecond: optionalNullable(v.number()),
    firstBtcWinningSideAt10UsdSecond: optionalNullable(v.number()),
    firstBtcWinningSideAt20UsdSecond: optionalNullable(v.number()),
    firstBtcWinningSideAt30UsdSecond: optionalNullable(v.number()),
    qualityFlags: v.array(v.string()),
    finalizedAt: v.number(),
  })
    .index("by_marketSlug", ["marketSlug"])
    .index("by_windowStartTs", ["windowStartTs"])
    .index("by_resolvedOutcome", ["resolvedOutcome"]),

  collector_health: defineTable({
    collectorName: v.string(),
    status: v.union(v.literal("ok"), v.literal("degraded"), v.literal("down")),
    lastHeartbeatAt: v.number(),
    lastMarketEventAt: nullable(v.number()),
    lastBtcTickAt: nullable(v.number()),
    lastBatchSentAt: nullable(v.number()),
    reconnectCount24h: v.number(),
    gapCount24h: v.number(),
    lastWsEventAt: optionalNullable(v.number()),
    lastWsSnapshotAt: optionalNullable(v.number()),
    marketWsReconnectCount24h: optionalNullable(v.number()),
    parityMismatchCount24h: optionalNullable(v.number()),
    lastBatchRawEvents: optionalNullable(v.number()),
    lastBatchSnapshots: optionalNullable(v.number()),
    lastBatchBtcTicks: optionalNullable(v.number()),
    rawEventPersistenceEnabled: optionalNullable(v.boolean()),
    snapshotCaptureMode: optionalNullable(captureModeValue),
    lastPollStartedAt: optionalNullable(v.number()),
    lastPollCompletedAt: optionalNullable(v.number()),
    lastPollDurationMs: optionalNullable(v.number()),
    lastPollStatus: optionalNullable(
      v.union(
        v.literal("ok"),
        v.literal("partial"),
        v.literal("overrun"),
        v.literal("failed"),
      ),
    ),
    lastPollEndpointErrors: v.optional(v.array(v.string())),
    pollOverrunCount24h: optionalNullable(v.number()),
    pollFailureCount24h: optionalNullable(v.number()),
    partialPollCount24h: optionalNullable(v.number()),
    lastError: nullable(v.string()),
    updatedAt: v.number(),
  }).index("by_collectorName", ["collectorName"]),
});
