import {
  CRYPTO_ASSETS,
  CRYPTO_SYMBOLS_BY_ASSET,
  PRICE_SOURCES,
} from "../../packages/shared/src/ingest.js";
import {
  BOOK_STALE_MS,
  BTC_STALE_MS,
  FINAL_FORENSICS_WINDOW_MS,
  SNAPSHOT_QUALITY,
  deriveDisplayedPrice,
  getSecondsFromWindowStart,
  getSnapshotPhase,
  getSnapshotSecondBucket,
  isSourceStale,
  normalizeFeedTimestamp,
} from "../../packages/shared/src/snapshot.js";

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTopLevel(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return {
      price: null,
      size: null,
    };
  }

  return {
    price: toFiniteNumber(levels[0]?.price),
    size: toFiniteNumber(levels[0]?.size),
  };
}

function ageMs(ts, nowTs) {
  return Number.isFinite(ts) ? nowTs - ts : null;
}

function getMarketAsset(market) {
  return Object.values(CRYPTO_ASSETS).includes(market?.asset)
    ? market.asset
    : CRYPTO_ASSETS.BTC;
}

function latestTickKey(source, symbol) {
  return `${source}:${symbol}`;
}

function getLatestTick({ fallbackTick = null, latestTicks, source, symbol }) {
  if (latestTicks instanceof Map) {
    return latestTicks.get(latestTickKey(source, symbol)) ?? fallbackTick;
  }

  if (latestTicks && typeof latestTicks === "object") {
    return latestTicks[latestTickKey(source, symbol)] ?? fallbackTick;
  }

  return fallbackTick;
}

function getTickContext({
  latestBinanceTick,
  latestChainlinkTick,
  latestTicks,
}) {
  const btcSymbols = CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.BTC];
  const ethSymbols = CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.ETH];

  return {
    btcBinanceTick: getLatestTick({
      fallbackTick: latestBinanceTick,
      latestTicks,
      source: PRICE_SOURCES.BINANCE,
      symbol: btcSymbols[PRICE_SOURCES.BINANCE],
    }),
    btcChainlinkTick: getLatestTick({
      fallbackTick: latestChainlinkTick,
      latestTicks,
      source: PRICE_SOURCES.CHAINLINK,
      symbol: btcSymbols[PRICE_SOURCES.CHAINLINK],
    }),
    ethBinanceTick: getLatestTick({
      latestTicks,
      source: PRICE_SOURCES.BINANCE,
      symbol: ethSymbols[PRICE_SOURCES.BINANCE],
    }),
    ethChainlinkTick: getLatestTick({
      latestTicks,
      source: PRICE_SOURCES.CHAINLINK,
      symbol: ethSymbols[PRICE_SOURCES.CHAINLINK],
    }),
  };
}

function isFinalForensicsSnapshot(secondBucket, market) {
  return (
    secondBucket >= market.windowEndTs - FINAL_FORENSICS_WINDOW_MS &&
    secondBucket <= market.windowEndTs
  );
}

function buildOutcomeMarketView(
  tokenId,
  booksByTokenId,
  lastTradesByTokenId,
  midpointsByTokenId,
  nowTs,
) {
  const book = booksByTokenId.get(tokenId) ?? null;
  const lastTrade = lastTradesByTokenId.get(tokenId) ?? null;
  const topBid = getTopLevel(book?.bids);
  const topAsk = getTopLevel(book?.asks);
  const midpoint =
    toFiniteNumber(midpointsByTokenId.get(tokenId)) ??
    (topBid.price !== null && topAsk.price !== null
      ? (topBid.price + topAsk.price) / 2
      : null);
  const last =
    toFiniteNumber(lastTrade?.price) ?? toFiniteNumber(book?.last_trade_price);
  const displayed = deriveDisplayedPrice({
    bid: topBid.price,
    ask: topAsk.price,
    mid: midpoint,
    last,
  });
  const hasCurrentPolledData =
    book !== null || lastTrade !== null || midpoint !== null;
  const lastTs = normalizeFeedTimestamp(lastTrade?.timestamp);
  const quoteTs = normalizeFeedTimestamp(book?.timestamp);
  const bookTs = quoteTs ?? lastTs ?? (hasCurrentPolledData ? nowTs : null);

  return {
    bid: topBid.price,
    ask: topAsk.price,
    mid: midpoint,
    last,
    displayedPrice: displayed.price,
    displayedRule: displayed.rule,
    spread:
      topBid.price !== null && topAsk.price !== null ? topAsk.price - topBid.price : null,
    depthBidTop: topBid.size,
    depthAskTop: topAsk.size,
    bookTs,
    lastTs,
    quoteTs,
  };
}

function deriveSourceQuality({
  downView,
  nowTs,
  referenceChainlinkTick,
  upView,
}) {
  if (upView.displayedPrice === null || downView.displayedPrice === null) {
    return SNAPSHOT_QUALITY.GAP;
  }

  const bookStale =
    isSourceStale(upView.bookTs, nowTs, BOOK_STALE_MS) ||
    isSourceStale(downView.bookTs, nowTs, BOOK_STALE_MS);

  if (bookStale) {
    return SNAPSHOT_QUALITY.STALE_BOOK;
  }

  const chainlinkFresh = referenceChainlinkTick
    ? !isSourceStale(referenceChainlinkTick.receivedAt, nowTs, BTC_STALE_MS)
    : false;

  if (!chainlinkFresh) {
    return SNAPSHOT_QUALITY.STALE_BTC;
  }

  return SNAPSHOT_QUALITY.GOOD;
}

function deriveMarketImbalance(upDisplayed, downDisplayed) {
  if (upDisplayed == null || downDisplayed == null) {
    return null;
  }

  return upDisplayed + downDisplayed - 1;
}

function buildFinalForensicsFields({
  btcBinanceTick,
  btcChainlinkTick,
  downView,
  ethBinanceTick,
  ethChainlinkTick,
  nowTs,
  upView,
}) {
  const btcChainlinkTs = toFiniteNumber(btcChainlinkTick?.ts);
  const btcChainlinkReceivedAt = toFiniteNumber(btcChainlinkTick?.receivedAt);
  const btcBinanceTs = toFiniteNumber(btcBinanceTick?.ts);
  const btcBinanceReceivedAt = toFiniteNumber(btcBinanceTick?.receivedAt);
  const ethChainlinkTs = toFiniteNumber(ethChainlinkTick?.ts);
  const ethChainlinkReceivedAt = toFiniteNumber(ethChainlinkTick?.receivedAt);
  const ethBinanceTs = toFiniteNumber(ethBinanceTick?.ts);
  const ethBinanceReceivedAt = toFiniteNumber(ethBinanceTick?.receivedAt);

  return {
    btcBinanceReceivedAgeMs: ageMs(btcBinanceReceivedAt, nowTs),
    btcBinanceReceivedAt: btcBinanceReceivedAt,
    btcBinanceTs: btcBinanceTs,
    btcChainlinkReceivedAgeMs: ageMs(btcChainlinkReceivedAt, nowTs),
    btcChainlinkReceivedAt: btcChainlinkReceivedAt,
    btcChainlinkTs: btcChainlinkTs,
    downBookAgeMs: ageMs(downView.quoteTs, nowTs),
    downBookTs: downView.quoteTs,
    downLastAgeMs: ageMs(downView.lastTs, nowTs),
    downLastTs: downView.lastTs,
    ethBinanceReceivedAgeMs: ageMs(ethBinanceReceivedAt, nowTs),
    ethBinanceReceivedAt: ethBinanceReceivedAt,
    ethBinanceTs: ethBinanceTs,
    ethChainlinkReceivedAgeMs: ageMs(ethChainlinkReceivedAt, nowTs),
    ethChainlinkReceivedAt: ethChainlinkReceivedAt,
    ethChainlinkTs: ethChainlinkTs,
    upBookAgeMs: ageMs(upView.quoteTs, nowTs),
    upBookTs: upView.quoteTs,
    upLastAgeMs: ageMs(upView.lastTs, nowTs),
    upLastTs: upView.lastTs,
  };
}

export function buildMarketSnapshots({
  markets,
  marketData,
  latestChainlinkTick,
  latestBinanceTick,
  latestTicks,
  nowTs = Date.now(),
}) {
  const secondBucket = getSnapshotSecondBucket(nowTs);
  const snapshots = [];
  const tickContext = getTickContext({
    latestBinanceTick,
    latestChainlinkTick,
    latestTicks,
  });

  for (const market of markets) {
    const asset = getMarketAsset(market);
    const referenceChainlinkTick =
      asset === CRYPTO_ASSETS.ETH
        ? tickContext.ethChainlinkTick
        : tickContext.btcChainlinkTick;
    const upView = buildOutcomeMarketView(
      market.tokenIdsByOutcome.up,
      marketData.booksByTokenId,
      marketData.lastTradesByTokenId,
      marketData.midpointsByTokenId,
      nowTs,
    );
    const downView = buildOutcomeMarketView(
      market.tokenIdsByOutcome.down,
      marketData.booksByTokenId,
      marketData.lastTradesByTokenId,
      marketData.midpointsByTokenId,
      nowTs,
    );
    const sourceQuality = deriveSourceQuality({
      upView,
      downView,
      referenceChainlinkTick,
      nowTs,
    });
    const phase = getSnapshotPhase(secondBucket, market.windowStartTs, market.windowEndTs);
    const finalForensicsFields = isFinalForensicsSnapshot(secondBucket, market)
      ? buildFinalForensicsFields({
          btcBinanceTick: tickContext.btcBinanceTick,
          btcChainlinkTick: tickContext.btcChainlinkTick,
          downView,
          ethBinanceTick: tickContext.ethBinanceTick,
          ethChainlinkTick: tickContext.ethChainlinkTick,
          nowTs,
          upView,
        })
      : null;

    snapshots.push({
      asset,
      marketSlug: market.slug,
      marketId: market.marketId,
      ts: nowTs,
      secondBucket,
      secondsFromWindowStart: getSecondsFromWindowStart(
        secondBucket,
        market.windowStartTs,
      ),
      phase,
      upBid: upView.bid,
      upAsk: upView.ask,
      upMid: upView.mid,
      upLast: upView.last,
      upDisplayed: upView.displayedPrice,
      upSpread: upView.spread,
      upDepthBidTop: upView.depthBidTop,
      upDepthAskTop: upView.depthAskTop,
      downBid: downView.bid,
      downAsk: downView.ask,
      downMid: downView.mid,
      downLast: downView.last,
      downDisplayed: downView.displayedPrice,
      downSpread: downView.spread,
      downDepthBidTop: downView.depthBidTop,
      downDepthAskTop: downView.depthAskTop,
      displayRuleUsed:
        upView.displayedRule !== "unknown" ? upView.displayedRule : downView.displayedRule,
      btcChainlink: tickContext.btcChainlinkTick?.price ?? null,
      btcBinance: tickContext.btcBinanceTick?.price ?? null,
      ethChainlink: tickContext.ethChainlinkTick?.price ?? null,
      ethBinance: tickContext.ethBinanceTick?.price ?? null,
      marketImbalance: deriveMarketImbalance(
        upView.displayedPrice,
        downView.displayedPrice,
      ),
      sourceQuality,
      writtenAt: nowTs,
      ...(finalForensicsFields ?? {}),
    });
  }

  return snapshots;
}

function snapshotKey(snapshot) {
  return `${snapshot.marketSlug}:${snapshot.secondBucket}`;
}

export function compareSnapshotParity(
  referenceSnapshots,
  candidateSnapshots,
  tolerance = 0.03,
) {
  const candidateByKey = new Map(
    (Array.isArray(candidateSnapshots) ? candidateSnapshots : []).map((snapshot) => [
      snapshotKey(snapshot),
      snapshot,
    ]),
  );
  let matchedCount = 0;
  let missingCount = 0;
  const mismatches = [];

  for (const reference of Array.isArray(referenceSnapshots) ? referenceSnapshots : []) {
    const candidate = candidateByKey.get(snapshotKey(reference));

    if (!candidate) {
      missingCount += 1;
      mismatches.push({
        marketSlug: reference.marketSlug,
        reason: "missing_candidate",
        secondBucket: reference.secondBucket,
      });
      continue;
    }

    matchedCount += 1;
    const upDelta =
      reference.upDisplayed == null || candidate.upDisplayed == null
        ? null
        : Math.abs(reference.upDisplayed - candidate.upDisplayed);
    const downDelta =
      reference.downDisplayed == null || candidate.downDisplayed == null
        ? null
        : Math.abs(reference.downDisplayed - candidate.downDisplayed);
    const exceedsTolerance =
      (upDelta !== null && upDelta > tolerance) ||
      (downDelta !== null && downDelta > tolerance);

    if (!exceedsTolerance && reference.displayRuleUsed === candidate.displayRuleUsed) {
      continue;
    }

    mismatches.push({
      candidateDisplayRuleUsed: candidate.displayRuleUsed,
      candidateUpDisplayed: candidate.upDisplayed,
      downDelta,
      marketSlug: reference.marketSlug,
      reason: exceedsTolerance ? "display_delta" : "display_rule",
      referenceDisplayRuleUsed: reference.displayRuleUsed,
      referenceUpDisplayed: reference.upDisplayed,
      secondBucket: reference.secondBucket,
      upDelta,
    });
  }

  return {
    matchedCount,
    mismatchCount: mismatches.length,
    mismatches,
    missingCount,
  };
}
