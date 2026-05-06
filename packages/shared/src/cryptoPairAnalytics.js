import { CRYPTO_ASSETS } from "./ingest.js";

export const CRYPTO_PAIR_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const CRYPTO_PAIR_DEFAULT_ROW_LIMIT = 96;
export const ETH_FINAL_FLIP_PRICE_THRESHOLD = 0.8;
export const ETH_FINAL_FLIP_WINDOWS_MS = [10_000, 5_000];

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeOutcome(value) {
  return value === "up" || value === "down" ? value : null;
}

function getMarketAsset(market) {
  return market?.asset === CRYPTO_ASSETS.ETH
    ? CRYPTO_ASSETS.ETH
    : CRYPTO_ASSETS.BTC;
}

function compactMarket(market) {
  return {
    active: Boolean(market.active),
    closed: Boolean(market.closed),
    dataQuality: market.dataQuality ?? "unknown",
    marketId: market.marketId,
    question: market.question,
    resolved: Boolean(market.resolved),
    slug: market.slug,
    winningOutcome: normalizeOutcome(market.winningOutcome),
  };
}

function getPairStatus(pair) {
  if (!pair.btc) {
    return "missing_btc";
  }

  if (!pair.eth) {
    return "missing_eth";
  }

  if (!pair.btc.winningOutcome || !pair.eth.winningOutcome) {
    return "unresolved";
  }

  return pair.btc.winningOutcome === pair.eth.winningOutcome ? "same" : "opposite";
}

function increment(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function getMarketPriceToBeat(market) {
  return (
    toFiniteNumber(market?.priceToBeatOfficial) ??
    toFiniteNumber(market?.priceToBeatDerived)
  );
}

function getOppositeOutcome(outcome) {
  return outcome === "up" ? "down" : outcome === "down" ? "up" : null;
}

function getOutcomePrice(snapshot, side) {
  const displayed = toFiniteNumber(snapshot?.[`${side}Displayed`]);

  if (displayed !== null) {
    return {
      price: displayed,
      source: "displayed",
    };
  }

  const ask = toFiniteNumber(snapshot?.[`${side}Ask`]);

  return ask === null
    ? null
    : {
        price: ask,
        source: "ask",
      };
}

function getReferenceSide(snapshot, priceToBeat) {
  const ethChainlink = toFiniteNumber(snapshot?.ethChainlink);

  if (ethChainlink === null || priceToBeat === null || ethChainlink === priceToBeat) {
    return null;
  }

  return ethChainlink > priceToBeat ? "up" : "down";
}

function getSecondsBeforeClose(snapshot, market) {
  const secondBucket = toFiniteNumber(snapshot?.secondBucket);

  return secondBucket === null
    ? null
    : Math.max(0, Math.round((market.windowEndTs - secondBucket) / 1000));
}

function getFinalWindowSnapshots(snapshots, market, windowMs) {
  return [...snapshots]
    .filter((snapshot) => {
      const secondBucket = toFiniteNumber(snapshot?.secondBucket);

      return (
        secondBucket !== null &&
        secondBucket >= market.windowEndTs - windowMs &&
        secondBucket <= market.windowEndTs
      );
    })
    .sort((a, b) => a.secondBucket - b.secondBucket);
}

function findProbabilityFlip({ market, outcome, snapshots, threshold }) {
  const oppositeOutcome = getOppositeOutcome(outcome);

  if (!oppositeOutcome) {
    return null;
  }

  let strongest = null;

  for (const snapshot of snapshots) {
    const outcomePrice = getOutcomePrice(snapshot, oppositeOutcome);

    if (!outcomePrice || outcomePrice.price < threshold) {
      continue;
    }

    if (!strongest || outcomePrice.price > strongest.price) {
      strongest = {
        price: outcomePrice.price,
        priceSource: outcomePrice.source,
        secondsBeforeClose: getSecondsBeforeClose(snapshot, market),
        side: oppositeOutcome,
      };
    }
  }

  return strongest;
}

function findReferenceFlip({ market, outcome, priceToBeat, snapshots }) {
  if (priceToBeat === null) {
    return null;
  }

  let latestOppositeReference = null;

  for (const snapshot of snapshots) {
    const referenceSide = getReferenceSide(snapshot, priceToBeat);

    if (!referenceSide || referenceSide === outcome) {
      continue;
    }

    latestOppositeReference = {
      ethChainlink: toFiniteNumber(snapshot.ethChainlink),
      priceToBeat,
      secondsBeforeClose: getSecondsBeforeClose(snapshot, market),
      side: referenceSide,
    };
  }

  return latestOppositeReference;
}

function analyzeEthFinalWindow({ market, snapshots, windowMs }) {
  const outcome = normalizeOutcome(market?.winningOutcome);
  const windowSnapshots = getFinalWindowSnapshots(snapshots, market, windowMs);
  const priceToBeat = getMarketPriceToBeat(market);

  if (!outcome) {
    return {
      flipped: false,
      probabilityFlip: null,
      referenceFlip: null,
      sampleCount: windowSnapshots.length,
      unresolved: true,
      windowMs,
    };
  }

  const probabilityFlip = findProbabilityFlip({
    market,
    outcome,
    snapshots: windowSnapshots,
    threshold: ETH_FINAL_FLIP_PRICE_THRESHOLD,
  });
  const referenceFlip = findReferenceFlip({
    market,
    outcome,
    priceToBeat,
    snapshots: windowSnapshots,
  });

  return {
    flipped: Boolean(probabilityFlip || referenceFlip),
    probabilityFlip,
    referenceFlip,
    sampleCount: windowSnapshots.length,
    unresolved: false,
    windowMs,
  };
}

function getSnapshotsForMarket(snapshotsByMarketSlug, slug) {
  if (snapshotsByMarketSlug instanceof Map) {
    return snapshotsByMarketSlug.get(slug) ?? [];
  }

  return snapshotsByMarketSlug?.[slug] ?? [];
}

export function buildBtcEthOutcomeComparison({
  lookbackMs = CRYPTO_PAIR_LOOKBACK_MS,
  markets = [],
  nowTs = Date.now(),
  rowLimit = CRYPTO_PAIR_DEFAULT_ROW_LIMIT,
} = {}) {
  const safeLookbackMs = Math.max(5 * 60 * 1000, Math.min(lookbackMs, 7 * 24 * 60 * 60 * 1000));
  const safeRowLimit = Math.max(1, Math.min(rowLimit, 300));
  const fromTs = nowTs - safeLookbackMs;
  const pairsByWindowStart = new Map();

  for (const market of markets) {
    const windowStartTs = toFiniteNumber(market?.windowStartTs);
    const windowEndTs = toFiniteNumber(market?.windowEndTs);

    if (
      windowStartTs === null ||
      windowEndTs === null ||
      windowStartTs < fromTs ||
      windowStartTs > nowTs
    ) {
      continue;
    }

    const asset = getMarketAsset(market);

    if (asset !== CRYPTO_ASSETS.BTC && asset !== CRYPTO_ASSETS.ETH) {
      continue;
    }

    const pair =
      pairsByWindowStart.get(windowStartTs) ?? {
        btc: null,
        eth: null,
        timestampSlug: String(Math.floor(windowStartTs / 1000)),
        windowEndTs,
        windowStartTs,
      };

    pair[asset] = compactMarket(market);
    pair.windowEndTs = Math.max(pair.windowEndTs, windowEndTs);
    pairsByWindowStart.set(windowStartTs, pair);
  }

  const pairs = [...pairsByWindowStart.values()]
    .sort((a, b) => b.windowStartTs - a.windowStartTs)
    .map((pair) => ({
      ...pair,
      status: getPairStatus(pair),
    }));
  const statusCounts = {
    missing_btc: 0,
    missing_eth: 0,
    opposite: 0,
    same: 0,
    unresolved: 0,
  };

  let btcMarkets = 0;
  let ethMarkets = 0;
  let pairedWindows = 0;
  let resolvedPairs = 0;

  for (const pair of pairs) {
    if (pair.btc) {
      btcMarkets += 1;
    }

    if (pair.eth) {
      ethMarkets += 1;
    }

    if (pair.btc && pair.eth) {
      pairedWindows += 1;
    }

    if (pair.status === "same" || pair.status === "opposite") {
      resolvedPairs += 1;
    }

    increment(statusCounts, pair.status);
  }

  return {
    fromTs,
    latestWindowStartTs: pairs[0]?.windowStartTs ?? null,
    lookbackMs: safeLookbackMs,
    pairs: pairs.slice(0, safeRowLimit),
    rowLimit: safeRowLimit,
    statusCounts,
    summary: {
      btcMarkets,
      ethMarkets,
      missingBtc: statusCounts.missing_btc,
      missingEth: statusCounts.missing_eth,
      oppositeOutcome: statusCounts.opposite,
      oppositeOutcomeRate:
        resolvedPairs > 0 ? statusCounts.opposite / resolvedPairs : null,
      pairedWindows,
      resolvedPairs,
      sameOutcome: statusCounts.same,
      sameOutcomeRate: resolvedPairs > 0 ? statusCounts.same / resolvedPairs : null,
      totalWindows: pairs.length,
      unresolvedPairs: statusCounts.unresolved,
    },
    toTs: nowTs,
  };
}

export function buildEthFinalFlipAnalytics({
  lookbackMs = CRYPTO_PAIR_LOOKBACK_MS,
  markets = [],
  nowTs = Date.now(),
  rowLimit = 50,
  snapshotsByMarketSlug = {},
} = {}) {
  const safeLookbackMs = Math.max(5 * 60 * 1000, Math.min(lookbackMs, 7 * 24 * 60 * 60 * 1000));
  const safeRowLimit = Math.max(1, Math.min(rowLimit, 100));
  const fromTs = nowTs - safeLookbackMs;
  const rows = [];
  const summary = {
    ethMarkets: 0,
    flip5s: 0,
    flip5sRate: null,
    flip10s: 0,
    flip10sRate: null,
    marketsWithFinalSnapshots: 0,
    probabilityFlip5s: 0,
    probabilityFlip10s: 0,
    referenceFlip5s: 0,
    referenceFlip10s: 0,
    resolvedEthMarkets: 0,
    unresolvedEthMarkets: 0,
  };

  for (const market of markets) {
    const windowStartTs = toFiniteNumber(market?.windowStartTs);
    const windowEndTs = toFiniteNumber(market?.windowEndTs);

    if (
      getMarketAsset(market) !== CRYPTO_ASSETS.ETH ||
      windowStartTs === null ||
      windowEndTs === null ||
      windowStartTs < fromTs ||
      windowStartTs > nowTs
    ) {
      continue;
    }

    summary.ethMarkets += 1;

    if (normalizeOutcome(market.winningOutcome)) {
      summary.resolvedEthMarkets += 1;
    } else {
      summary.unresolvedEthMarkets += 1;
    }

    const snapshots = getSnapshotsForMarket(snapshotsByMarketSlug, market.slug);
    const tenSecond = analyzeEthFinalWindow({
      market,
      snapshots,
      windowMs: 10_000,
    });
    const fiveSecond = analyzeEthFinalWindow({
      market,
      snapshots,
      windowMs: 5_000,
    });

    if (tenSecond.sampleCount > 0) {
      summary.marketsWithFinalSnapshots += 1;
    }

    if (tenSecond.flipped) {
      summary.flip10s += 1;
    }

    if (fiveSecond.flipped) {
      summary.flip5s += 1;
    }

    if (tenSecond.probabilityFlip) {
      summary.probabilityFlip10s += 1;
    }

    if (fiveSecond.probabilityFlip) {
      summary.probabilityFlip5s += 1;
    }

    if (tenSecond.referenceFlip) {
      summary.referenceFlip10s += 1;
    }

    if (fiveSecond.referenceFlip) {
      summary.referenceFlip5s += 1;
    }

    if (tenSecond.flipped || fiveSecond.flipped) {
      rows.push({
        dataQuality: market.dataQuality ?? "unknown",
        fiveSecond,
        priceToBeat: getMarketPriceToBeat(market),
        question: market.question,
        slug: market.slug,
        tenSecond,
        windowEndTs,
        windowStartTs,
        winningOutcome: normalizeOutcome(market.winningOutcome),
      });
    }
  }

  summary.flip10sRate =
    summary.resolvedEthMarkets > 0 ? summary.flip10s / summary.resolvedEthMarkets : null;
  summary.flip5sRate =
    summary.resolvedEthMarkets > 0 ? summary.flip5s / summary.resolvedEthMarkets : null;

  return {
    fromTs,
    lookbackMs: safeLookbackMs,
    rows: rows
      .sort((a, b) => b.windowStartTs - a.windowStartTs)
      .slice(0, safeRowLimit),
    rowLimit: safeRowLimit,
    summary,
    toTs: nowTs,
  };
}
