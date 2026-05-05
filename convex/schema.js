import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullable = (value) => v.union(value, v.null());
const optionalNullable = (value) => v.optional(v.union(value, v.null()));
const cryptoAssetValue = v.union(v.literal("btc"), v.literal("eth"));
const outcomeValue = v.union(v.literal("up"), v.literal("down"));
const legacyDecisionActionValue = v.union(
  v.literal("WAIT"),
  v.literal("SCOUT_SMALL"),
  v.literal("ENTER_UP"),
  v.literal("ENTER_DOWN"),
  v.literal("ADD_SMALL"),
  v.literal("EXIT_OR_DE_RISK"),
);
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
const analyticsSourceValue = v.union(
  v.literal("official"),
  v.literal("derived"),
);
const momentumSideValue = v.union(
  v.literal("up"),
  v.literal("down"),
  v.literal("flat"),
);
const excludedReasonValue = v.union(
  v.literal("missing-outcome"),
  v.literal("derived-only-outcome"),
  v.literal("missing-price-to-beat"),
  v.literal("missing-checkpoint-btc"),
  v.literal("stale-btc"),
);
const stabilityExcludedReasonValue = v.union(
  v.literal("sparse-post-checkpoint-snapshots"),
);
const pathTypeValue = v.union(
  v.literal("early-lock"),
  v.literal("mid-lock"),
  v.literal("late-lock"),
  v.literal("final-second-flip"),
  v.literal("chop"),
  v.literal("near-line-unresolved"),
  v.literal("unknown"),
);

export default defineSchema({
  markets: defineTable({
    asset: v.optional(cryptoAssetValue),
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
    .index("by_active_windowEndTs", ["active", "windowEndTs"])
    .index("by_active_priceToBeatDerived_windowStartTs", [
      "active",
      "priceToBeatDerived",
      "windowStartTs",
    ])
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
    asset: v.optional(cryptoAssetValue),
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
    upBookTs: optionalNullable(v.number()),
    upBookAgeMs: optionalNullable(v.number()),
    upLastTs: optionalNullable(v.number()),
    upLastAgeMs: optionalNullable(v.number()),
    downBid: nullable(v.number()),
    downAsk: nullable(v.number()),
    downMid: nullable(v.number()),
    downLast: nullable(v.number()),
    downDisplayed: nullable(v.number()),
    downSpread: nullable(v.number()),
    downDepthBidTop: nullable(v.number()),
    downDepthAskTop: nullable(v.number()),
    downBookTs: optionalNullable(v.number()),
    downBookAgeMs: optionalNullable(v.number()),
    downLastTs: optionalNullable(v.number()),
    downLastAgeMs: optionalNullable(v.number()),
    displayRuleUsed: v.union(
      v.literal("midpoint"),
      v.literal("last_trade"),
      v.literal("unknown"),
    ),
    btcChainlink: nullable(v.number()),
    btcBinance: nullable(v.number()),
    ethChainlink: optionalNullable(v.number()),
    ethBinance: optionalNullable(v.number()),
    btcChainlinkTs: optionalNullable(v.number()),
    btcChainlinkReceivedAt: optionalNullable(v.number()),
    btcChainlinkReceivedAgeMs: optionalNullable(v.number()),
    btcBinanceTs: optionalNullable(v.number()),
    btcBinanceReceivedAt: optionalNullable(v.number()),
    btcBinanceReceivedAgeMs: optionalNullable(v.number()),
    ethChainlinkTs: optionalNullable(v.number()),
    ethChainlinkReceivedAt: optionalNullable(v.number()),
    ethChainlinkReceivedAgeMs: optionalNullable(v.number()),
    ethBinanceTs: optionalNullable(v.number()),
    ethBinanceReceivedAt: optionalNullable(v.number()),
    ethBinanceReceivedAgeMs: optionalNullable(v.number()),
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
    upDisplayedAtT15: nullable(v.number()),
    upDisplayedAtT30: nullable(v.number()),
    upDisplayedAtT60: nullable(v.number()),
    upDisplayedAtT120: nullable(v.number()),
    upDisplayedAtT240: nullable(v.number()),
    upDisplayedAtT295: nullable(v.number()),
    upMax: nullable(v.number()),
    upMin: nullable(v.number()),
    upRange: nullable(v.number()),
    upStdDev: nullable(v.number()),
    upMaxDrawdown: nullable(v.number()),
    firstTimeAbove60: nullable(v.number()),
    firstTimeAbove70: nullable(v.number()),
    firstTimeAbove80: nullable(v.number()),
    qualityFlags: v.array(v.string()),
    finalizedAt: v.number(),
  })
    .index("by_marketSlug", ["marketSlug"])
    .index("by_windowStartTs", ["windowStartTs"])
    .index("by_resolvedOutcome", ["resolvedOutcome"]),

  market_analytics: defineTable({
    marketSlug: v.string(),
    marketId: v.string(),
    windowStartTs: nullable(v.number()),
    windowEndTs: nullable(v.number()),
    analyticsVersion: v.number(),
    resolvedOutcome: nullable(outcomeValue),
    outcomeSource: nullable(analyticsSourceValue),
    priceToBeat: nullable(v.number()),
    priceToBeatSource: nullable(analyticsSourceValue),
    summaryPresent: v.optional(v.boolean()),
    summaryDataQuality: marketQualityValue,
    excludedReasons: v.array(excludedReasonValue),
    checkpoints: v.array(
      v.object({
        checkpointSecond: v.number(),
        checkpointTs: v.number(),
        btcAtCheckpoint: nullable(v.number()),
        btcTickTs: nullable(v.number()),
        btcTickReceivedAt: nullable(v.number()),
        btcTickAgeMs: nullable(v.number()),
        distanceToBeatBps: nullable(v.number()),
        currentLeader: nullable(outcomeValue),
        didCurrentLeaderWin: nullable(v.boolean()),
      }),
    ),
    completeFreshCheckpoints: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_marketSlug", ["marketSlug"])
    .index("by_windowStartTs", ["windowStartTs"])
    .index("by_windowEndTs", ["windowEndTs"])
    .index("by_analyticsVersion", ["analyticsVersion"]),

  market_stability_analytics: defineTable({
    marketSlug: v.string(),
    marketId: v.string(),
    windowStartTs: nullable(v.number()),
    windowEndTs: nullable(v.number()),
    analyticsVersion: nullable(v.number()),
    stabilityAnalyticsVersion: v.number(),
    resolvedOutcome: nullable(outcomeValue),
    priceToBeat: nullable(v.number()),
    excludedReasons: v.array(stabilityExcludedReasonValue),
    pathSummary: v.object({
      closeMarginBps: nullable(v.number()),
      hardFlipCount: v.number(),
      lastSnapshotAgeMsAtClose: optionalNullable(v.number()),
      maxDistanceBps: nullable(v.number()),
      maxSnapshotGapMs: nullable(v.number()),
      noiseTouchCount: v.number(),
      pathGood: v.boolean(),
      pathType: pathTypeValue,
      postCheckpointSnapshotCoveragePct: v.number(),
      snapshotCadenceMs: nullable(v.number()),
      snapshotCoveragePct: v.number(),
      winnerLockAgeAtClose: nullable(v.number()),
      winnerLockSecond: nullable(v.number()),
    }),
    checkpoints: v.array(
      v.object({
        checkpointInNoise: v.boolean(),
        checkpointSecond: v.number(),
        checkpointTs: nullable(v.number()),
        distanceBps: nullable(v.number()),
        flipLoss: v.boolean(),
        leader: nullable(outcomeValue),
        leaderWonAtClose: nullable(v.boolean()),
        noisyLeaderWin: v.boolean(),
        postAnyHardFlip: nullable(v.boolean()),
        postFirstHardFlipSecond: nullable(v.number()),
        postHardFlipCount: nullable(v.number()),
        postLastHardFlipSecond: nullable(v.number()),
        postLastSnapshotAgeMsAtClose: optionalNullable(v.number()),
        postMaxAdverseBps: nullable(v.number()),
        postMaxSnapshotGapMs: nullable(v.number()),
        postMinSignedMarginBps: nullable(v.number()),
        postPathGood: v.boolean(),
        postSnapshotCoveragePct: v.number(),
        postTimeUnderwaterSeconds: nullable(v.number()),
        postTouchedNoise: nullable(v.boolean()),
        leaderAlignedMomentum30sBps: optionalNullable(v.number()),
        leaderAlignedMomentum60sBps: optionalNullable(v.number()),
        momentum30sAgreesWithLeader: optionalNullable(v.boolean()),
        momentum30sBps: optionalNullable(v.number()),
        momentum30sSide: optionalNullable(momentumSideValue),
        momentum60sAgreesWithLeader: optionalNullable(v.boolean()),
        momentum60sBps: optionalNullable(v.number()),
        momentum60sSide: optionalNullable(momentumSideValue),
        preCurrentLeadAgeSeconds: nullable(v.number()),
        preCrossCountLast60s: optionalNullable(v.number()),
        preDirectionChangeCount: optionalNullable(v.number()),
        preFlipCount: nullable(v.number()),
        preLastFlipAgeSeconds: nullable(v.number()),
        preLeaderDwellPct: nullable(v.number()),
        preLongestLeadStreakSeconds: nullable(v.number()),
        preMaxSnapshotGapMs: optionalNullable(v.number()),
        preNearLineSeconds: optionalNullable(v.number()),
        prePathGood: optionalNullable(v.boolean()),
        preRange60sBps: optionalNullable(v.number()),
        preRange120sBps: optionalNullable(v.number()),
        preRealizedVolatility60s: nullable(v.number()),
        preRealizedVolatility120s: nullable(v.number()),
        preSnapshotCoveragePct: optionalNullable(v.number()),
        recoveredLeaderWin: v.boolean(),
        stableLeaderWin: v.boolean(),
        unknownPath: v.boolean(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_marketSlug", ["marketSlug"])
    .index("by_windowStartTs", ["windowStartTs"])
    .index("by_windowEndTs", ["windowEndTs"])
    .index("by_stabilityAnalyticsVersion", ["stabilityAnalyticsVersion"]),

  analytics_dashboard_rollups: defineTable({
    key: v.string(),
    analyticsVersion: nullable(v.number()),
    computedAt: v.number(),
    rollupVersion: v.number(),
    stabilityAnalyticsVersion: nullable(v.number()),
    v1: v.any(),
    v2: v.any(),
    v3: v.optional(v.any()),
  })
    .index("by_key", ["key"])
    .index("by_computedAt", ["computedAt"]),

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
    lastDecisionAt: optionalNullable(v.number()),
    lastDecisionAction: optionalNullable(legacyDecisionActionValue),
    decisionsEmittedLastBatch: optionalNullable(v.number()),
    lastError: nullable(v.string()),
    updatedAt: v.number(),
  })
    .index("by_collectorName", ["collectorName"])
    .index("by_updatedAt", ["updatedAt"]),
});
