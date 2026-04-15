import {
  BOOK_STALE_MS,
  BTC_STALE_MS,
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
  const bookTs =
    normalizeFeedTimestamp(book?.timestamp) ??
    normalizeFeedTimestamp(lastTrade?.timestamp) ??
    (hasCurrentPolledData ? nowTs : null);

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
  };
}

function deriveSourceQuality({ upView, downView, latestChainlinkTick, nowTs }) {
  if (upView.displayedPrice === null || downView.displayedPrice === null) {
    return SNAPSHOT_QUALITY.GAP;
  }

  const bookStale =
    isSourceStale(upView.bookTs, nowTs, BOOK_STALE_MS) ||
    isSourceStale(downView.bookTs, nowTs, BOOK_STALE_MS);

  if (bookStale) {
    return SNAPSHOT_QUALITY.STALE_BOOK;
  }

  const chainlinkFresh = latestChainlinkTick
    ? !isSourceStale(latestChainlinkTick.receivedAt, nowTs, BTC_STALE_MS)
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

export function buildMarketSnapshots({
  markets,
  marketData,
  latestChainlinkTick,
  latestBinanceTick,
  nowTs = Date.now(),
}) {
  const secondBucket = getSnapshotSecondBucket(nowTs);
  const snapshots = [];

  for (const market of markets) {
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
      latestChainlinkTick,
      nowTs,
    });
    const phase = getSnapshotPhase(secondBucket, market.windowStartTs, market.windowEndTs);

    snapshots.push({
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
      btcChainlink: latestChainlinkTick?.price ?? null,
      btcBinance: latestBinanceTick?.price ?? null,
      marketImbalance: deriveMarketImbalance(
        upView.displayedPrice,
        downView.displayedPrice,
      ),
      sourceQuality,
      writtenAt: nowTs,
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
