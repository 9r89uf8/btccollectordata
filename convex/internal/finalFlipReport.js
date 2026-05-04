import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";

const STABILITY_DEADBAND_BPS = 0.5;
const EPSILON = 1e-9;
const FINAL_FLIP_LOOKBACK_SECONDS = 10;
const DEFAULT_PAGE_LIMIT = 250;
const DEFAULT_MAX_MARKETS = 6000;
const ET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  month: "2-digit",
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
});

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marginBps(price, priceToBeat) {
  return priceToBeat === null || priceToBeat <= 0 || price === null
    ? null
    : (10000 * (price - priceToBeat)) / priceToBeat;
}

function stateFromMargin(margin) {
  if (!Number.isFinite(margin)) {
    return null;
  }

  if (margin >= STABILITY_DEADBAND_BPS - EPSILON) {
    return "up";
  }

  if (margin <= -STABILITY_DEADBAND_BPS + EPSILON) {
    return "down";
  }

  return "noise";
}

function getSnapshotSecond(snapshot, windowStartTs) {
  if (Number.isFinite(snapshot?.secondsFromWindowStart)) {
    return snapshot.secondsFromWindowStart;
  }

  const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);

  return secondBucket === null
    ? null
    : Math.floor((secondBucket - windowStartTs) / 1000);
}

function compactStabilityCandidate(row) {
  const postLastHardFlipSeconds = (row.checkpoints ?? [])
    .map((checkpoint) => checkpoint.postLastHardFlipSecond)
    .filter(Number.isFinite);
  const lastHardFlipSecond =
    postLastHardFlipSeconds.length === 0
      ? null
      : Math.max(...postLastHardFlipSeconds);

  return {
    closeMarginBps: row.pathSummary?.closeMarginBps ?? null,
    hardFlipCount: row.pathSummary?.hardFlipCount ?? null,
    lastHardFlipSecond,
    marketId: row.marketId,
    marketSlug: row.marketSlug,
    maxDistanceBps: row.pathSummary?.maxDistanceBps ?? null,
    maxSnapshotGapMs: row.pathSummary?.maxSnapshotGapMs ?? null,
    noiseTouchCount: row.pathSummary?.noiseTouchCount ?? null,
    pathGood: row.pathSummary?.pathGood ?? false,
    pathType: row.pathSummary?.pathType ?? "unknown",
    priceToBeat: row.priceToBeat ?? null,
    resolvedOutcome: row.resolvedOutcome ?? null,
    snapshotCadenceMs: row.pathSummary?.snapshotCadenceMs ?? null,
    snapshotCoveragePct: row.pathSummary?.snapshotCoveragePct ?? null,
    windowEndTs: row.windowEndTs,
    windowStartTs: row.windowStartTs,
    winnerLockSecond: row.pathSummary?.winnerLockSecond ?? null,
  };
}

function compactSnapshot(snapshot) {
  return {
    btcBinance: snapshot.btcBinance ?? null,
    btcBinanceReceivedAgeMs: snapshot.btcBinanceReceivedAgeMs ?? null,
    btcBinanceReceivedAt: snapshot.btcBinanceReceivedAt ?? null,
    btcBinanceTs: snapshot.btcBinanceTs ?? null,
    btcChainlink: snapshot.btcChainlink ?? null,
    btcChainlinkReceivedAgeMs: snapshot.btcChainlinkReceivedAgeMs ?? null,
    btcChainlinkReceivedAt: snapshot.btcChainlinkReceivedAt ?? null,
    btcChainlinkTs: snapshot.btcChainlinkTs ?? null,
    displayRuleUsed: snapshot.displayRuleUsed ?? "unknown",
    downAsk: snapshot.downAsk ?? null,
    downBookAgeMs: snapshot.downBookAgeMs ?? null,
    downBookTs: snapshot.downBookTs ?? null,
    downBid: snapshot.downBid ?? null,
    downDisplayed: snapshot.downDisplayed ?? null,
    downLast: snapshot.downLast ?? null,
    downLastAgeMs: snapshot.downLastAgeMs ?? null,
    downLastTs: snapshot.downLastTs ?? null,
    downSpread: snapshot.downSpread ?? null,
    marketImbalance: snapshot.marketImbalance ?? null,
    secondBucket: snapshot.secondBucket,
    secondsFromWindowStart: snapshot.secondsFromWindowStart,
    sourceQuality: snapshot.sourceQuality,
    ts: snapshot.ts,
    upAsk: snapshot.upAsk ?? null,
    upBookAgeMs: snapshot.upBookAgeMs ?? null,
    upBookTs: snapshot.upBookTs ?? null,
    upBid: snapshot.upBid ?? null,
    upDisplayed: snapshot.upDisplayed ?? null,
    upLast: snapshot.upLast ?? null,
    upLastAgeMs: snapshot.upLastAgeMs ?? null,
    upLastTs: snapshot.upLastTs ?? null,
    upSpread: snapshot.upSpread ?? null,
  };
}

export const listCandidatePage = internalQuery({
  args: {
    beforeWindowEndTs: v.optional(v.number()),
    limit: v.optional(v.number()),
    minFlipSecond: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_PAGE_LIMIT, 500));
    const upperBoundTs = args.beforeWindowEndTs ?? Date.now();
    const minFlipSecond = Math.max(
      0,
      Math.min(args.minFlipSecond ?? 290, 300),
    );
    const rows = await ctx.db
      .query("market_stability_analytics")
      .withIndex("by_windowEndTs", (q) => q.lte("windowEndTs", upperBoundTs))
      .order("desc")
      .take(limit);

    return {
      candidates: rows
        .map(compactStabilityCandidate)
        .filter((row) => (row.lastHardFlipSecond ?? -1) >= minFlipSecond),
      done: rows.length < limit,
      nextBeforeWindowEndTs:
        rows.length === 0 ? null : rows[rows.length - 1].windowEndTs - 1,
      scanned: rows.length,
    };
  },
});

export const getSnapshotsForMarket = internalQuery({
  args: {
    marketSlug: v.string(),
    windowEndTs: v.number(),
    windowStartTs: v.number(),
  },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("market_snapshots_1s")
      .withIndex("by_marketSlug_secondBucket", (q) =>
        q
          .eq("marketSlug", args.marketSlug)
          .gte("secondBucket", args.windowStartTs)
          .lte("secondBucket", args.windowEndTs),
      )
      .collect();

    return snapshots.map(compactSnapshot);
  },
});

function normalizeSnapshots(snapshots, candidate) {
  const rows = [];
  const seen = new Set();
  const priceToBeat = toFiniteNumber(candidate.priceToBeat);

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const secondBucket = toFiniteNumber(snapshot.secondBucket ?? snapshot.ts);
    const price = toFiniteNumber(snapshot.btcChainlink);

    if (
      secondBucket === null ||
      price === null ||
      priceToBeat === null ||
      seen.has(secondBucket)
    ) {
      continue;
    }

    const secondsFromWindowStart = getSnapshotSecond(
      { ...snapshot, secondBucket },
      candidate.windowStartTs,
    );
    const margin = marginBps(price, priceToBeat);

    if (secondsFromWindowStart === null || margin === null) {
      continue;
    }

    seen.add(secondBucket);
    rows.push({
      ...snapshot,
      btcPrice: price,
      marginBps: margin,
      secondBucket,
      secondsFromWindowStart,
      state: stateFromMargin(margin),
    });
  }

  return rows.sort((a, b) => a.secondBucket - b.secondBucket);
}

function computeHardFlips(rows) {
  const flips = [];
  let lastStableRow = null;

  for (const row of rows) {
    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (lastStableRow && row.state !== lastStableRow.state) {
      flips.push({
        from: lastStableRow.state,
        fromRow: lastStableRow,
        second: row.secondsFromWindowStart,
        to: row.state,
        toRow: row,
      });
    }

    lastStableRow = row;
  }

  return flips;
}

function standardDeviation(values) {
  const finite = values.filter(Number.isFinite);

  if (finite.length === 0) {
    return null;
  }

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;

  return Math.sqrt(variance);
}

function range(values) {
  const finite = values.filter(Number.isFinite);

  return finite.length === 0 ? null : Math.max(...finite) - Math.min(...finite);
}

function rowsInLookback(rows, targetSecond, lookbackSeconds) {
  const startSecond = Math.max(0, targetSecond - lookbackSeconds);

  return rows.filter(
    (row) =>
      row.secondsFromWindowStart >= startSecond &&
      row.secondsFromWindowStart <= targetSecond,
  );
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function getEtParts(ts) {
  const parts = Object.fromEntries(
    ET_FORMATTER.formatToParts(new Date(ts))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const hourET = Number(parts.hour);

  return {
    dateET: `${parts.year}-${parts.month}-${parts.day}`,
    hourET: Number.isInteger(hourET) ? hourET : null,
    hourETLabel: Number.isInteger(hourET) ? `${parts.hour}:00 ET` : "unknown",
    weekdayET: parts.weekday ?? "unknown",
  };
}

function displayedPriceForLeader(row, leader) {
  if (leader === "up") {
    return toFiniteNumber(row.upDisplayed);
  }

  if (leader === "down") {
    return toFiniteNumber(row.downDisplayed);
  }

  return null;
}

function oppositeDisplayedPriceForLeader(row, leader) {
  if (leader === "up") {
    return toFiniteNumber(row.downDisplayed);
  }

  if (leader === "down") {
    return toFiniteNumber(row.upDisplayed);
  }

  return null;
}

function bookForLeader(row, leader) {
  const bid = toFiniteNumber(leader === "up" ? row.upBid : row.downBid);
  const ask = toFiniteNumber(leader === "up" ? row.upAsk : row.downAsk);
  const spread = toFiniteNumber(leader === "up" ? row.upSpread : row.downSpread);
  const ts = toFiniteNumber(leader === "up" ? row.upBookTs : row.downBookTs);
  const ageMs = toFiniteNumber(
    leader === "up" ? row.upBookAgeMs : row.downBookAgeMs,
  );

  return {
    ageMs,
    ask,
    bid,
    mid: bid === null || ask === null ? null : (bid + ask) / 2,
    spread,
    ts,
  };
}

function lastTradeForLeader(row, leader) {
  if (leader === "up") {
    return {
      ageMs: toFiniteNumber(row.upLastAgeMs),
      price: toFiniteNumber(row.upLast),
      ts: toFiniteNumber(row.upLastTs),
    };
  }

  if (leader === "down") {
    return {
      ageMs: toFiniteNumber(row.downLastAgeMs),
      price: toFiniteNumber(row.downLast),
      ts: toFiniteNumber(row.downLastTs),
    };
  }

  return {
    ageMs: null,
    price: null,
    ts: null,
  };
}

function getLeaderPriceNote({ book, displayRuleUsed, leaderDisplayed, oppositeDisplayed }) {
  const notes = [];

  if (displayRuleUsed !== "midpoint") {
    notes.push(displayRuleUsed ?? "unknown_rule");
  }

  if (book.bid === null || book.ask === null) {
    notes.push("incomplete_book");
  } else if (Number.isFinite(book.spread) && book.spread > 0.2) {
    notes.push("wide_book");
  }

  if (
    Number.isFinite(leaderDisplayed) &&
    Number.isFinite(oppositeDisplayed) &&
    leaderDisplayed < oppositeDisplayed
  ) {
    notes.push("displayed_opposes_btc_leader");
  }

  return notes.length === 0 ? "clean_midpoint" : notes.join(",");
}

function analyzeCandidate(candidate, snapshots) {
  const rows = normalizeSnapshots(snapshots, candidate);
  const flips = computeHardFlips(rows);
  const finalFlip = flips[flips.length - 1] ?? null;

  if (!finalFlip) {
    return null;
  }

  const windowLengthSeconds = Math.round(
    (candidate.windowEndTs - candidate.windowStartTs) / 1000,
  );
  const secondsBeforeClose = windowLengthSeconds - finalFlip.second;

  if (
    secondsBeforeClose < 0 ||
    secondsBeforeClose > FINAL_FLIP_LOOKBACK_SECONDS
  ) {
    return null;
  }

  const lookback60 = rowsInLookback(rows, finalFlip.second, 60);
  const lookback10 = rowsInLookback(rows, finalFlip.second, 10);
  const windowMargins = rows.map((row) => row.marginBps);
  const flipTs = candidate.windowStartTs + finalFlip.second * 1000;
  const beforeLeader = finalFlip.from;
  const beforeRow = finalFlip.fromRow;
  const atFlipRow = finalFlip.toRow;
  const leaderDisplayedPriceBeforeFlip = displayedPriceForLeader(
    beforeRow,
    beforeLeader,
  );
  const oppositeDisplayedPriceBeforeFlip = oppositeDisplayedPriceForLeader(
    beforeRow,
    beforeLeader,
  );
  const leaderBook = bookForLeader(beforeRow, beforeLeader);
  const leaderLastTrade = lastTradeForLeader(beforeRow, beforeLeader);

  return {
    absDistanceAtFlipBps: Math.abs(atFlipRow.marginBps),
    absDistanceBeforeFlipBps: Math.abs(beforeRow.marginBps),
    afterLeader: finalFlip.to,
    beforeLeader,
    btcPriceAtFlip: atFlipRow.btcPrice,
    btcPriceBeforeFlip: beforeRow.btcPrice,
    closeMarginBps: candidate.closeMarginBps,
    distanceAtFlipBps: atFlipRow.marginBps,
    distanceBeforeFlipBps: beforeRow.marginBps,
    finalFlipSecondFromCandidate: candidate.lastHardFlipSecond,
    flipSecond: finalFlip.second,
    flipTs,
    fromStableSecond: beforeRow.secondsFromWindowStart,
    hardFlipCount: candidate.hardFlipCount,
    leaderAskBeforeFlip: leaderBook.ask,
    leaderBidBeforeFlip: leaderBook.bid,
    leaderBookAgeMsBeforeFlip: leaderBook.ageMs,
    leaderBookMidBeforeFlip: leaderBook.mid,
    leaderBookTsBeforeFlip: leaderBook.ts,
    leaderDisplayedPriceBeforeFlip,
    leaderDisplayRuleBeforeFlip: beforeRow.displayRuleUsed ?? "unknown",
    leaderLastTradeAgeMsBeforeFlip: leaderLastTrade.ageMs,
    leaderLastTradePriceBeforeFlip: leaderLastTrade.price,
    leaderLastTradeTsBeforeFlip: leaderLastTrade.ts,
    leaderPriceNote: getLeaderPriceNote({
      book: leaderBook,
      displayRuleUsed: beforeRow.displayRuleUsed ?? "unknown",
      leaderDisplayed: leaderDisplayedPriceBeforeFlip,
      oppositeDisplayed: oppositeDisplayedPriceBeforeFlip,
    }),
    leaderSpreadBeforeFlip: leaderBook.spread,
    marketSlug: candidate.marketSlug,
    maxDistanceBps: candidate.maxDistanceBps,
    noiseTouchCount: candidate.noiseTouchCount,
    oppositeDisplayedPriceBeforeFlip,
    pathGood: candidate.pathGood,
    pathType: candidate.pathType,
    priceToBeat: candidate.priceToBeat,
    preFlipRange10sBps: range(lookback10.map((row) => row.marginBps)),
    preFlipRange60sBps: range(lookback60.map((row) => row.marginBps)),
    preFlipVolatility10sBps: standardDeviation(
      lookback10.map((row) => row.marginBps),
    ),
    preFlipVolatility60sBps: standardDeviation(
      lookback60.map((row) => row.marginBps),
    ),
    resolvedOutcome: candidate.resolvedOutcome,
    secondsBeforeClose,
    snapshotCadenceMs: candidate.snapshotCadenceMs,
    snapshotCoveragePct: candidate.snapshotCoveragePct,
    stableGapBeforeFlipSeconds:
      finalFlip.second - beforeRow.secondsFromWindowStart,
    btcBinanceReceivedAgeMsAtFlip: toFiniteNumber(
      atFlipRow.btcBinanceReceivedAgeMs,
    ),
    btcBinanceReceivedAgeMsBeforeFlip: toFiniteNumber(
      beforeRow.btcBinanceReceivedAgeMs,
    ),
    btcBinanceReceivedAtAtFlip: toFiniteNumber(atFlipRow.btcBinanceReceivedAt),
    btcBinanceReceivedAtBeforeFlip: toFiniteNumber(
      beforeRow.btcBinanceReceivedAt,
    ),
    btcBinanceTsAtFlip: toFiniteNumber(atFlipRow.btcBinanceTs),
    btcBinanceTsBeforeFlip: toFiniteNumber(beforeRow.btcBinanceTs),
    btcChainlinkReceivedAgeMsAtFlip: toFiniteNumber(
      atFlipRow.btcChainlinkReceivedAgeMs,
    ),
    btcChainlinkReceivedAgeMsBeforeFlip: toFiniteNumber(
      beforeRow.btcChainlinkReceivedAgeMs,
    ),
    btcChainlinkReceivedAtAtFlip: toFiniteNumber(
      atFlipRow.btcChainlinkReceivedAt,
    ),
    btcChainlinkReceivedAtBeforeFlip: toFiniteNumber(
      beforeRow.btcChainlinkReceivedAt,
    ),
    btcChainlinkTsAtFlip: toFiniteNumber(atFlipRow.btcChainlinkTs),
    btcChainlinkTsBeforeFlip: toFiniteNumber(beforeRow.btcChainlinkTs),
    upDisplayedBeforeFlip: toFiniteNumber(beforeRow.upDisplayed),
    downDisplayedBeforeFlip: toFiniteNumber(beforeRow.downDisplayed),
    windowEndTs: candidate.windowEndTs,
    windowLengthSeconds,
    windowRangeBps: range(windowMargins),
    windowStartTs: candidate.windowStartTs,
    windowVolatilityBps: standardDeviation(windowMargins),
    winnerLockSecond: candidate.winnerLockSecond,
    ...getEtParts(flipTs),
  };
}

function withVolatilityLabels(rows) {
  const volatilityValues = rows.map((row) => row.preFlipVolatility60sBps);
  const rangeValues = rows.map((row) => row.preFlipRange60sBps);
  const volatilityP75 = percentile(volatilityValues, 0.75);
  const volatilityP90 = percentile(volatilityValues, 0.9);
  const rangeP75 = percentile(rangeValues, 0.75);
  const rangeP90 = percentile(rangeValues, 0.9);

  for (const row of rows) {
    if (!Number.isFinite(row.preFlipVolatility60sBps)) {
      row.volatilityLabel = "unknown";
      continue;
    }

    if (
      (Number.isFinite(volatilityP90) &&
        row.preFlipVolatility60sBps >= volatilityP90) ||
      (Number.isFinite(rangeP90) && row.preFlipRange60sBps >= rangeP90)
    ) {
      row.volatilityLabel = "very_high";
    } else if (
      (Number.isFinite(volatilityP75) &&
        row.preFlipVolatility60sBps >= volatilityP75) ||
      (Number.isFinite(rangeP75) && row.preFlipRange60sBps >= rangeP75)
    ) {
      row.volatilityLabel = "high";
    } else {
      row.volatilityLabel = "normal";
    }
  }

  return {
    rangeP75,
    rangeP90,
    volatilityP75,
    volatilityP90,
  };
}

export const generateJson = internalAction({
  args: {
    maxMarkets: v.optional(v.number()),
    maxPages: v.optional(v.number()),
    pageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxMarkets = Math.max(
      1,
      Math.min(args.maxMarkets ?? DEFAULT_MAX_MARKETS, 10_000),
    );
    const maxPages = Math.max(1, Math.min(args.maxPages ?? 30, 100));
    const pageLimit = Math.max(
      1,
      Math.min(args.pageLimit ?? DEFAULT_PAGE_LIMIT, 500),
    );
    const rows = [];
    let beforeWindowEndTs = undefined;
    let candidateCount = 0;
    let scanned = 0;

    for (
      let pageIndex = 0;
      pageIndex < maxPages && candidateCount < maxMarkets;
      pageIndex += 1
    ) {
      const page = await ctx.runQuery(
        internal.internal.finalFlipReport.listCandidatePage,
        {
          beforeWindowEndTs,
          limit: pageLimit,
          minFlipSecond: 300 - FINAL_FLIP_LOOKBACK_SECONDS,
        },
      );

      scanned += page.scanned;

      for (const candidate of page.candidates) {
        if (candidateCount >= maxMarkets) {
          break;
        }

        candidateCount += 1;
        const snapshots = await ctx.runQuery(
          internal.internal.finalFlipReport.getSnapshotsForMarket,
          {
            marketSlug: candidate.marketSlug,
            windowEndTs: candidate.windowEndTs,
            windowStartTs: candidate.windowStartTs,
          },
        );
        const analyzed = analyzeCandidate(candidate, snapshots);

        if (analyzed) {
          rows.push(analyzed);
        }
      }

      if (page.done || !page.nextBeforeWindowEndTs) {
        break;
      }

      beforeWindowEndTs = page.nextBeforeWindowEndTs;
    }

    rows.sort(
      (a, b) =>
        a.secondsBeforeClose - b.secondsBeforeClose ||
        b.windowEndTs - a.windowEndTs,
    );
    const volatilityThresholds = withVolatilityLabels(rows);

    return {
      candidateCount,
      final5: rows.filter((row) => row.secondsBeforeClose <= 5),
      final10: rows,
      generatedAt: Date.now(),
      lookbackSeconds: FINAL_FLIP_LOOKBACK_SECONDS,
      scanned,
      volatilityThresholds,
    };
  },
});
